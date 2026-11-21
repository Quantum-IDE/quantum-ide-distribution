#!/usr/bin/env node

/**
 * verify-manifest.js
 * Comprehensive validation test suite for Quantum IDE distribution infrastructure.
 */

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
let hasErrors = false;

function error(msg) {
  console.error('❌ ERROR: ' + msg);
  hasErrors = true;
}

function success(msg) {
  console.log('✅ ' + msg);
}

console.log('=== Quantum IDE Distribution Integrity Verification ===\n');

// 1. Validate Schema
const schemaPath = path.join(rootDir, 'schemas', 'release-manifest.schema.json');
if (!fs.existsSync(schemaPath)) {
  error('Missing schema: ' + schemaPath);
} else {
  try {
    JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    success('Schema is valid JSON: schemas/release-manifest.schema.json');
  } catch (e) {
    error('Invalid JSON in schema: ' + e.message);
  }
}

// 2. Validate Channels Manifests
const channels = [
  'channels/friends-beta/windows-x64.json',
  'channels/friends-beta/linux-x64.json',
  'channels/friends-beta/darwin-arm64.json'
];

const requiredKeys = [
  'schemaVersion',
  'product',
  'platform',
  'architecture',
  'channel',
  'available',
  'updateClass'
];

const validUpdateClasses = ['silent-next-launch', 'manual-consent'];

channels.forEach(relPath => {
  const fullPath = path.join(rootDir, relPath);
  if (!fs.existsSync(fullPath)) {
    error('Missing channel manifest: ' + relPath);
    return;
  }

  try {
    const data = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
    
    // Check required keys
    for (const key of requiredKeys) {
      if (!(key in data)) {
        error(`Manifest ${relPath} missing required key: ${key}`);
      }
    }

    if (data.product !== 'Quantum IDE') {
      error(`Manifest ${relPath} has invalid product: ${data.product}`);
    }

    if (!validUpdateClasses.includes(data.updateClass)) {
      error(`Manifest ${relPath} has invalid updateClass: ${data.updateClass}`);
    }

    if (typeof data.available !== 'boolean') {
      error(`Manifest ${relPath} 'available' must be boolean`);
    }

    if (data.available) {
      if (!data.downloadUrl || !data.downloadUrl.startsWith('https://github.com/')) {
        error(`Manifest ${relPath} is available but has invalid downloadUrl: ${data.downloadUrl}`);
      }
      if (!data.sha256 || !/^[a-fA-F0-9]{64}$/.test(data.sha256)) {
        error(`Manifest ${relPath} is available but has invalid sha256 checksum: ${data.sha256}`);
      }
      if (typeof data.sizeBytes !== 'number' || data.sizeBytes <= 0) {
        error(`Manifest ${relPath} is available but has invalid sizeBytes: ${data.sizeBytes}`);
      }
    }

    success(`Manifest valid: ${relPath} (available: ${data.available}, updateClass: ${data.updateClass})`);
  } catch (e) {
    error(`Failed to parse ${relPath}: ${e.message}`);
  }
});

// 3. Validate Website index.html and assets
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

  // Ensure no hardcoded secret tokens
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

// 4. Validate GitHub Actions workflow
const workflowPath = path.join(rootDir, '.github', 'workflows', 'pages.yml');
if (!fs.existsSync(workflowPath)) {
  error('Missing .github/workflows/pages.yml');
} else {
  const workflow = fs.readFileSync(workflowPath, 'utf8');
  if (workflow.includes('actions/deploy-pages') && workflow.includes('permissions:')) {
    success('.github/workflows/pages.yml configured properly for Pages deployment');
  } else {
    error('.github/workflows/pages.yml missing critical deployment actions or permissions');
  }
}

console.log('\n------------------------------------------------');
if (hasErrors) {
  console.error('❌ Verification FAILED with errors.');
  process.exit(1);
} else {
  console.log('✨ All distribution checks PASSED successfully!');
  process.exit(0);
}
