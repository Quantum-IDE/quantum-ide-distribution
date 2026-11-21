#!/usr/bin/env node

/**
 * verify-manifest.js
 * Official Quantum IDE Distribution Integrity & Real JSON Schema Validation.
 * Powered by Ajv 8 (JSON Schema Draft-07).
 */

const fs = require('fs');
const path = require('path');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');

const rootDir = path.resolve(__dirname, '..');
let hasErrors = false;

function error(msg, details = null) {
  console.error('❌ ERROR: ' + msg);
  if (details) {
    console.error('   Details:', typeof details === 'string' ? details : JSON.stringify(details, null, 2));
  }
  hasErrors = true;
}

function success(msg) {
  console.log('✅ ' + msg);
}

console.log('=== Quantum IDE Distribution Integrity Verification ===\n');

// 1. Initialize Ajv 8 Validator for JSON Schema Draft-07
const ajv = new Ajv({
  allErrors: true,
  strict: false,
  validateFormats: true
});
addFormats(ajv);

const schemaPath = path.join(rootDir, 'schemas', 'release-manifest.schema.json');
let validateManifest;

if (!fs.existsSync(schemaPath)) {
  error('Missing schema file at: ' + schemaPath);
} else {
  try {
    const rawSchema = fs.readFileSync(schemaPath, 'utf8');
    const schema = JSON.parse(rawSchema);

    // Validate the schema itself with Ajv
    const isSchemaValid = ajv.validateSchema(schema);
    if (!isSchemaValid) {
      error('Schema itself is not a valid JSON Schema Draft-07:', ajv.errorsText(ajv.errors));
    } else {
      validateManifest = ajv.compile(schema);
      success('Schema loaded and compiled successfully with Ajv (JSON Schema Draft-07)');
    }
  } catch (e) {
    error('Failed to parse or compile schema: ' + e.message);
  }
}

// 2. Scan and Validate Channel Manifests against JSON Schema
const channelsDir = path.join(rootDir, 'channels');
const manifestFiles = [];

function findManifests(dir) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      findManifests(fullPath);
    } else if (entry.isFile() && entry.name.endsWith('.json')) {
      manifestFiles.push(fullPath);
    }
  }
}

findManifests(channelsDir);

if (manifestFiles.length === 0) {
  error('No channel manifest files found in channels/ directory');
}

manifestFiles.forEach(fullPath => {
  const relPath = path.relative(rootDir, fullPath).replace(/\\/g, '/');
  try {
    const content = fs.readFileSync(fullPath, 'utf8');
    const manifest = JSON.parse(content);

    if (!validateManifest) {
      error(`Cannot validate ${relPath} because schema validator compilation failed.`);
      return;
    }

    const isValid = validateManifest(manifest);
    if (!isValid) {
      const errorDetails = validateManifest.errors.map(err => ({
        field: err.instancePath || '(root)',
        keyword: err.keyword,
        message: err.message,
        params: err.params
      }));
      error(`Manifest validation failed against Draft-07 schema: ${relPath}`, errorDetails);
    } else {
      // Additional business logic check: downloadUrl host validation if available
      if (manifest.available) {
        if (!manifest.downloadUrl || !manifest.downloadUrl.startsWith('https://github.com/Quantum-IDE/quantum-ide-distribution/releases/download/')) {
          error(`Manifest ${relPath} is available but downloadUrl does not point to official GitHub Releases for Quantum-IDE/quantum-ide-distribution: ${manifest.downloadUrl}`);
          return;
        }
      }
      success(`Manifest valid (Ajv Draft-07): ${relPath} [available: ${manifest.available}, updateClass: ${manifest.updateClass}]`);
    }
  } catch (e) {
    error(`Failed to read/parse manifest JSON: ${relPath} - ${e.message}`);
  }
});

// 3. Validate Website index.html and Assets
const indexPath = path.join(rootDir, 'index.html');
const logoPath = path.join(rootDir, 'quantum-logo.svg');

if (!fs.existsSync(indexPath)) {
  error('Missing index.html');
} else {
  const html = fs.readFileSync(indexPath, 'utf8');

  if (!html.includes('./quantum-logo.svg')) {
    error('index.html does not reference ./quantum-logo.svg');
  } else {
    success('index.html references official logo ./quantum-logo.svg');
  }

  if (!html.includes('./channels/friends-beta/windows-x64.json')) {
    error('index.html does not reference ./channels/friends-beta/windows-x64.json');
  } else {
    success('index.html dynamically queries Windows x64 Friends Beta manifest');
  }

  // Ensure no hardcoded tokens
  if (/ghp_[a-zA-Z0-9]{30,}|gho_[a-zA-Z0-9]{30,}|github_pat_[a-zA-Z0-9_]{30,}/.test(html)) {
    error('Potential secret token found inside index.html!');
  } else {
    success('index.html is clean of secrets and tokens');
  }
}

if (!fs.existsSync(logoPath)) {
  error('Missing official logo: quantum-logo.svg');
} else {
  const stat = fs.statSync(logoPath);
  if (stat.size < 1000) {
    error('quantum-logo.svg appears truncated (<1KB)');
  } else {
    success(`quantum-logo.svg verified (${(stat.size / 1024).toFixed(1)} KB)`);
  }
}

// 4. Validate GitHub Actions Workflows
const pagesWorkflow = path.join(rootDir, '.github', 'workflows', 'pages.yml');
const validateWorkflow = path.join(rootDir, '.github', 'workflows', 'validate.yml');

if (!fs.existsSync(pagesWorkflow)) {
  error('Missing .github/workflows/pages.yml');
} else {
  const workflow = fs.readFileSync(pagesWorkflow, 'utf8');
  if (workflow.includes('actions/deploy-pages') && workflow.includes('permissions:')) {
    success('.github/workflows/pages.yml configured properly for Pages deployment');
  } else {
    error('.github/workflows/pages.yml missing critical deployment actions or permissions');
  }
}

if (!fs.existsSync(validateWorkflow)) {
  error('Missing .github/workflows/validate.yml');
} else {
  success('.github/workflows/validate.yml verified');
}

// 5. Validate Documentation
const docs = ['DISTRIBUTION.md', 'RELEASE-PROCESS.md', 'UPDATE-ARCHITECTURE.md'];
docs.forEach(doc => {
  const docPath = path.join(rootDir, 'docs', doc);
  if (!fs.existsSync(docPath)) {
    error(`Missing documentation: docs/${doc}`);
  } else {
    success(`Documentation verified: docs/${doc}`);
  }
});

console.log('\n------------------------------------------------');
if (hasErrors) {
  console.error('❌ Verification FAILED with errors.');
  process.exit(1);
} else {
  console.log('✨ All distribution checks PASSED successfully!');
  process.exit(0);
}
