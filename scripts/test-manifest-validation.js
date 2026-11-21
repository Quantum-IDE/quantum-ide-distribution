#!/usr/bin/env node

/**
 * test-manifest-validation.js
 * Comprehensive test suite proving JSON Schema Draft-07 validation with Ajv 8
 * AND client-side verifyReleaseData logic across all required positive and negative cases.
 */

const fs = require('fs');
const path = require('path');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');

const rootDir = path.resolve(__dirname, '..');
const schemaPath = path.join(rootDir, 'schemas', 'release-manifest.schema.json');
const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));

const ajv = new Ajv({ allErrors: true, strict: false, validateFormats: true });
addFormats(ajv);

const validate = ajv.compile(schema);

console.log('=== Quantum IDE Manifest Schema Test Suite (Ajv 8 / Draft-07) ===\n');

const testCases = [
  {
    name: '1. Valid manifest with available release (version: 0.1.0-beta.1) (positive test)',
    shouldPass: true,
    data: {
      schemaVersion: '1.0.0',
      product: 'Quantum IDE',
      platform: 'windows',
      architecture: 'x64',
      channel: 'friends-beta',
      version: '0.1.0-beta.1',
      updateClass: 'manual-consent',
      publishedAt: '2026-11-21T10:00:00Z',
      available: true,
      downloadUrl: 'https://github.com/Quantum-IDE/quantum-ide-distribution/releases/download/v0.1.0-beta.1/Quantum-Setup-0.1.0-beta.1-x64.exe',
      fileName: 'Quantum-Setup-0.1.0-beta.1-x64.exe',
      sizeBytes: 154200100,
      sha256: 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90',
      releaseNotesUrl: 'https://github.com/Quantum-IDE/quantum-ide-distribution/releases/tag/v0.1.0-beta.1',
      deltaSupport: {
        enabled: false,
        blockmapUrl: null,
        fallbackUrl: null
      },
      minOSVersion: 'Windows 10 Build 19041+ (64-bit)'
    }
  },
  {
    name: '2. Valid manifest with available: false (intended null values) (positive test)',
    shouldPass: true,
    data: {
      schemaVersion: '1.0.0',
      product: 'Quantum IDE',
      platform: 'windows',
      architecture: 'x64',
      channel: 'friends-beta',
      version: null,
      updateClass: 'manual-consent',
      publishedAt: null,
      available: false,
      downloadUrl: null,
      fileName: null,
      sizeBytes: null,
      sha256: null,
      releaseNotesUrl: null,
      deltaSupport: {
        enabled: false,
        blockmapUrl: null,
        fallbackUrl: null
      },
      minOSVersion: 'Windows 10 Build 19041+ (64-bit)'
    }
  },
  {
    name: '3. Manifest with invalid SemVer version suffix: 0.1.0junk (negative test)',
    shouldPass: false,
    expectedErrorKeyword: 'pattern',
    data: {
      schemaVersion: '1.0.0',
      product: 'Quantum IDE',
      platform: 'windows',
      architecture: 'x64',
      channel: 'friends-beta',
      version: '0.1.0junk', // strictly rejected
      updateClass: 'manual-consent',
      publishedAt: '2026-11-21T10:00:00Z',
      available: true,
      downloadUrl: 'https://github.com/Quantum-IDE/quantum-ide-distribution/releases/download/v0.1.0/installer.exe',
      fileName: 'installer.exe',
      sizeBytes: 154200,
      sha256: 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90',
      deltaSupport: { enabled: false }
    }
  },
  {
    name: '4. Manifest with available: null (negative test)',
    shouldPass: false,
    expectedErrorKeyword: 'type',
    data: {
      schemaVersion: '1.0.0',
      product: 'Quantum IDE',
      platform: 'windows',
      architecture: 'x64',
      channel: 'friends-beta',
      updateClass: 'manual-consent',
      available: null // must be boolean
    }
  },
  {
    name: '5. Manifest with available: "false" (string instead of boolean) (negative test)',
    shouldPass: false,
    expectedErrorKeyword: 'type',
    data: {
      schemaVersion: '1.0.0',
      product: 'Quantum IDE',
      platform: 'windows',
      architecture: 'x64',
      channel: 'friends-beta',
      updateClass: 'manual-consent',
      available: 'false' // string rejected
    }
  },
  {
    name: '6. Manifest missing required available field (negative test)',
    shouldPass: false,
    expectedErrorKeyword: 'required',
    data: {
      schemaVersion: '1.0.0',
      product: 'Quantum IDE',
      platform: 'windows',
      architecture: 'x64',
      channel: 'friends-beta',
      updateClass: 'manual-consent'
      // available is missing
    }
  },
  {
    name: '7. Manifest with incomplete release data when available: true (negative test)',
    shouldPass: false,
    expectedErrorKeyword: 'required',
    data: {
      schemaVersion: '1.0.0',
      product: 'Quantum IDE',
      platform: 'windows',
      architecture: 'x64',
      channel: 'friends-beta',
      version: 'v0.1.0-beta.1',
      updateClass: 'manual-consent',
      publishedAt: '2026-11-21T10:00:00Z',
      available: true,
      deltaSupport: { enabled: false }
    }
  },
  {
    name: '8. Manifest with invalid SHA-256 pattern (63 characters) (negative test)',
    shouldPass: false,
    expectedErrorKeyword: 'pattern',
    data: {
      schemaVersion: '1.0.0',
      product: 'Quantum IDE',
      platform: 'windows',
      architecture: 'x64',
      channel: 'friends-beta',
      version: 'v0.1.0-beta.1',
      updateClass: 'manual-consent',
      publishedAt: '2026-11-21T10:00:00Z',
      available: true,
      downloadUrl: 'https://github.com/Quantum-IDE/quantum-ide-distribution/releases/download/v0.1.0-beta.1/installer.exe',
      fileName: 'installer.exe',
      sizeBytes: 1000,
      sha256: 'a1b2c3d4e5f6', // invalid length
      deltaSupport: { enabled: false }
    }
  },
  {
    name: '9. Manifest with invalid file size (0 bytes) (negative test)',
    shouldPass: false,
    expectedErrorKeyword: 'minimum',
    data: {
      schemaVersion: '1.0.0',
      product: 'Quantum IDE',
      platform: 'windows',
      architecture: 'x64',
      channel: 'friends-beta',
      version: 'v0.1.0-beta.1',
      updateClass: 'manual-consent',
      publishedAt: '2026-11-21T10:00:00Z',
      available: true,
      downloadUrl: 'https://github.com/Quantum-IDE/quantum-ide-distribution/releases/download/v0.1.0-beta.1/installer.exe',
      fileName: 'installer.exe',
      sizeBytes: 0,
      sha256: 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90',
      deltaSupport: { enabled: false }
    }
  },
  {
    name: '10. Manifest with disallowed updateClass (negative test)',
    shouldPass: false,
    expectedErrorKeyword: 'enum',
    data: {
      schemaVersion: '1.0.0',
      product: 'Quantum IDE',
      platform: 'windows',
      architecture: 'x64',
      channel: 'friends-beta',
      updateClass: 'automatic-force',
      available: false
    }
  },
  {
    name: '11. Manifest with invalid downloadUrl (not https) (negative test)',
    shouldPass: false,
    expectedErrorKeyword: 'pattern',
    data: {
      schemaVersion: '1.0.0',
      product: 'Quantum IDE',
      platform: 'windows',
      architecture: 'x64',
      channel: 'friends-beta',
      version: 'v0.1.0-beta.1',
      updateClass: 'manual-consent',
      publishedAt: '2026-11-21T10:00:00Z',
      available: true,
      downloadUrl: 'ftp://invalidscheme.com/installer.exe',
      fileName: 'installer.exe',
      sizeBytes: 5000,
      sha256: 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90',
      deltaSupport: { enabled: false }
    }
  },
  {
    name: '12. Manifest with invalid deltaSupport structure (missing enabled) (negative test)',
    shouldPass: false,
    expectedErrorKeyword: 'required',
    data: {
      schemaVersion: '1.0.0',
      product: 'Quantum IDE',
      platform: 'windows',
      architecture: 'x64',
      channel: 'friends-beta',
      updateClass: 'manual-consent',
      available: false,
      deltaSupport: {
        blockmapUrl: 'https://example.com/blockmap'
      }
    }
  },
  {
    name: '13. Manifest missing required core field (architecture) (negative test)',
    shouldPass: false,
    expectedErrorKeyword: 'required',
    data: {
      schemaVersion: '1.0.0',
      product: 'Quantum IDE',
      platform: 'windows',
      channel: 'friends-beta',
      updateClass: 'manual-consent',
      available: false
    }
  },
  {
    name: '14. Manifest with invalid data type (architecture as integer) (negative test)',
    shouldPass: false,
    expectedErrorKeyword: 'type',
    data: {
      schemaVersion: '1.0.0',
      product: 'Quantum IDE',
      platform: 'windows',
      architecture: 64,
      channel: 'friends-beta',
      updateClass: 'manual-consent',
      available: false
    }
  }
];

let passedTests = 0;
let failedTests = 0;

testCases.forEach((tc) => {
  const valid = validate(tc.data);
  if (tc.shouldPass) {
    if (valid) {
      console.log(`✅ [PASS] ${tc.name}`);
      passedTests++;
    } else {
      console.error(`❌ [FAIL] ${tc.name} — Expected PASS but got ERRORS:`, validate.errors);
      failedTests++;
    }
  } else {
    if (!valid) {
      console.log(`✅ [PASS] ${tc.name} — Successfully rejected by Ajv (${validate.errors[0].message})`);
      passedTests++;
    } else {
      console.error(`❌ [FAIL] ${tc.name} — Expected REJECTION but Ajv passed it!`);
      failedTests++;
    }
  }
});

console.log('\n--- Client-side verifyReleaseData (index.html) Logic Verification ---\n');

// Simulating the client-side verifyReleaseData logic from index.html
function verifyReleaseData(m) {
  if (!m || typeof m !== 'object') return { valid: false, reason: 'Manifest is not an object' };

  if (m.available === false) {
    return { valid: false, isUnavailable: true };
  }
  if (m.available !== true) {
    return { valid: false, reason: 'Field "available" must be boolean true or false' };
  }

  const SEMVER_STRICT_REGEX = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;
  if (typeof m.version !== 'string' || !SEMVER_STRICT_REGEX.test(m.version.trim())) {
    return { valid: false, reason: 'Invalid SemVer format for version tag' };
  }

  if (typeof m.fileName !== 'string' || m.fileName.trim().length === 0) {
    return { valid: false, reason: 'Missing or empty fileName' };
  }

  const OFFICIAL_RELEASE_PREFIX = 'https://github.com/Quantum-IDE/quantum-ide-distribution/releases/download/';
  if (typeof m.downloadUrl !== 'string' || !m.downloadUrl.startsWith(OFFICIAL_RELEASE_PREFIX)) {
    return { valid: false, reason: 'downloadUrl does not point to official repository releases' };
  }

  const assetRegex = /^https:\/\/github\.com\/Quantum-IDE\/quantum-ide-distribution\/releases\/download\/[^\/]+\/[^\/]+$/;
  if (!assetRegex.test(m.downloadUrl) || m.downloadUrl.includes('/archive/') || m.downloadUrl.endsWith('.zip?tag=')) {
    return { valid: false, reason: 'downloadUrl is not a direct official release asset' };
  }

  if (typeof m.sizeBytes !== 'number' || !Number.isInteger(m.sizeBytes) || m.sizeBytes <= 0) {
    return { valid: false, reason: 'sizeBytes must be a positive integer' };
  }

  if (typeof m.sha256 !== 'string' || !/^[a-fA-F0-9]{64}$/.test(m.sha256)) {
    return { valid: false, reason: 'sha256 must be a 64-character hexadecimal digest' };
  }

  const supportedClasses = ['silent-next-launch', 'manual-consent'];
  if (!supportedClasses.includes(m.updateClass)) {
    return { valid: false, reason: 'updateClass is not supported' };
  }

  if (m.product !== 'Quantum IDE' || m.platform !== 'windows' || m.architecture !== 'x64' || m.channel !== 'friends-beta') {
    return { valid: false, reason: 'Channel or target metadata mismatch' };
  }

  return { valid: true };
}

const clientCases = [
  {
    name: 'A. available=false => isUnavailable: true (State 1: No Release Available message)',
    check: () => {
      const res = verifyReleaseData({ available: false });
      return res.valid === false && res.isUnavailable === true;
    }
  },
  {
    name: 'B. available=true with valid data & version=0.1.0-beta.1 => valid: true (State 2: Download enabled)',
    check: () => {
      const res = verifyReleaseData({
        product: 'Quantum IDE',
        platform: 'windows',
        architecture: 'x64',
        channel: 'friends-beta',
        version: '0.1.0-beta.1',
        available: true,
        fileName: 'Quantum-Setup-0.1.0-beta.1-x64.exe',
        downloadUrl: 'https://github.com/Quantum-IDE/quantum-ide-distribution/releases/download/v0.1.0-beta.1/Quantum-Setup-0.1.0-beta.1-x64.exe',
        sizeBytes: 154200000,
        sha256: 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90',
        updateClass: 'manual-consent'
      });
      return res.valid === true;
    }
  },
  {
    name: 'C. available=null => valid: false & isUnavailable: undefined (State 3: Invalid Manifest)',
    check: () => {
      const res = verifyReleaseData({ available: null });
      return res.valid === false && !res.isUnavailable;
    }
  },
  {
    name: 'D. missing available field => valid: false & isUnavailable: undefined (State 3: Invalid Manifest)',
    check: () => {
      const res = verifyReleaseData({ version: '0.1.0-beta.1' });
      return res.valid === false && !res.isUnavailable;
    }
  },
  {
    name: 'E. available="false" (string) => valid: false & isUnavailable: undefined (State 3: Invalid Manifest)',
    check: () => {
      const res = verifyReleaseData({ available: 'false' });
      return res.valid === false && !res.isUnavailable;
    }
  },
  {
    name: 'F. version=0.1.0junk with available=true => valid: false & isUnavailable: undefined (State 3: Invalid Manifest)',
    check: () => {
      const res = verifyReleaseData({
        product: 'Quantum IDE',
        platform: 'windows',
        architecture: 'x64',
        channel: 'friends-beta',
        version: '0.1.0junk',
        available: true,
        fileName: 'Quantum-Setup-0.1.0-beta.1-x64.exe',
        downloadUrl: 'https://github.com/Quantum-IDE/quantum-ide-distribution/releases/download/v0.1.0/Quantum-Setup.exe',
        sizeBytes: 1000,
        sha256: 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90',
        updateClass: 'manual-consent'
      });
      return res.valid === false && !res.isUnavailable && res.reason.includes('SemVer');
    }
  }
];

clientCases.forEach(cc => {
  if (cc.check()) {
    console.log(`✅ [PASS] ${cc.name}`);
    passedTests++;
  } else {
    console.error(`❌ [FAIL] ${cc.name}`);
    failedTests++;
  }
});

console.log('\n------------------------------------------------');
console.log(`Grand Total: ${passedTests} passed, ${failedTests} failed out of ${testCases.length + clientCases.length} tests.`);

if (failedTests > 0) {
  process.exit(1);
} else {
  console.log('✨ All schema and client validation tests PASSED successfully!');
  process.exit(0);
}
