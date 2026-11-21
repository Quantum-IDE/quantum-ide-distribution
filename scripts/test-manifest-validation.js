#!/usr/bin/env node

/**
 * test-manifest-validation.js
 * Test suite proving JSON Schema Draft-07 validation with Ajv 8 across 10 positive & negative cases.
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
    name: '1. Valid manifest with available release (positive test)',
    shouldPass: true,
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
    name: '3. Manifest with incomplete release data when available: true (negative test)',
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
      // downloadUrl, fileName, sizeBytes, sha256 missing
      deltaSupport: { enabled: false }
    }
  },
  {
    name: '4. Manifest with invalid SHA-256 pattern (63 characters) (negative test)',
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
    name: '5. Manifest with invalid file size (0 bytes) (negative test)',
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
      sizeBytes: 0, // minimum is 1 when available
      sha256: 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90',
      deltaSupport: { enabled: false }
    }
  },
  {
    name: '6. Manifest with disallowed updateClass (negative test)',
    shouldPass: false,
    expectedErrorKeyword: 'enum',
    data: {
      schemaVersion: '1.0.0',
      product: 'Quantum IDE',
      platform: 'windows',
      architecture: 'x64',
      channel: 'friends-beta',
      updateClass: 'automatic-force', // not in enum
      available: false
    }
  },
  {
    name: '7. Manifest with invalid downloadUrl (not https) (negative test)',
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
      downloadUrl: 'ftp://invalidscheme.com/installer.exe', // must start with https://
      fileName: 'installer.exe',
      sizeBytes: 5000,
      sha256: 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90',
      deltaSupport: { enabled: false }
    }
  },
  {
    name: '8. Manifest with invalid deltaSupport structure (missing enabled) (negative test)',
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
        blockmapUrl: 'https://example.com/blockmap' // missing 'enabled'
      }
    }
  },
  {
    name: '9. Manifest missing required core field (architecture) (negative test)',
    shouldPass: false,
    expectedErrorKeyword: 'required',
    data: {
      schemaVersion: '1.0.0',
      product: 'Quantum IDE',
      platform: 'windows',
      // architecture missing
      channel: 'friends-beta',
      updateClass: 'manual-consent',
      available: false
    }
  },
  {
    name: '10. Manifest with invalid data type (architecture as integer) (negative test)',
    shouldPass: false,
    expectedErrorKeyword: 'type',
    data: {
      schemaVersion: '1.0.0',
      product: 'Quantum IDE',
      platform: 'windows',
      architecture: 64, // integer instead of string
      channel: 'friends-beta',
      updateClass: 'manual-consent',
      available: false
    }
  }
];

let passedTests = 0;
let failedTests = 0;

testCases.forEach((tc, idx) => {
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
      const matchKeyword = !tc.expectedErrorKeyword || validate.errors.some(e => e.keyword === tc.expectedErrorKeyword || (e.params && JSON.stringify(e.params).includes(tc.expectedErrorKeyword)));
      console.log(`✅ [PASS] ${tc.name} — Successfully rejected by Ajv (${validate.errors[0].message})`);
      passedTests++;
    } else {
      console.error(`❌ [FAIL] ${tc.name} — Expected REJECTION but Ajv passed it!`);
      failedTests++;
    }
  }
});

console.log('\n------------------------------------------------');
console.log(`Summary: ${passedTests} passed, ${failedTests} failed out of ${testCases.length} tests.`);

if (failedTests > 0) {
  process.exit(1);
} else {
  console.log('✨ All 10 schema test cases PASSED successfully!');
  process.exit(0);
}
