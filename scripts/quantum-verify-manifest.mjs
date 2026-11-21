#!/usr/bin/env node
/**
 * quantum-verify-manifest.mjs — Verifies the Ed25519 signature on a Quantum IDE manifest.
 *
 * Usage:
 *   node quantum-verify-manifest.mjs --manifest <path/to/manifest.json>
 *
 * Verification contract (matches quantumSignatureVerifier.ts):
 *   1. Parse the manifest JSON.
 *   2. Check "signature" field is present and non-empty.
 *   3. Check "keyId" is known.
 *   4. Remove the "signature" field.
 *   5. Serialize with RFC 8785 JCS (recursive key sort, no whitespace).
 *   6. Verify the Ed25519 signature using crypto.verify(null, ...) against the canonical bytes.
 *   7. Exit 0 on success, 1 on failure.
 *
 * Embedded public keys (must match quantumSignatureVerifier.ts):
 *   - quantum-update-v1-test: development/test key
 *   - quantum-update-v1-prod: production key (placeholder until owner generates it)
 */

import { createPublicKey, verify as cryptoVerify } from 'crypto';
import { readFileSync } from 'fs';

// Must match QUANTUM_UPDATE_PUBLIC_KEY_TEST_HEX in quantumSignatureVerifier.ts
const PUBLIC_KEYS = {
  'quantum-update-v1-test': '302a300506032b65700321009d0e9dbed91b47cd728c019c639c4146bd6d7104c7a876c86617af5a0723c16c',
  // Placeholder — replace with real production key DER SPKI hex before production build
  'quantum-update-v1-prod': 'PLACEHOLDER_REPLACE_BEFORE_PRODUCTION_BUILD',
};

function jcsStringify(value) {
  if (value === null || value === undefined) return JSON.stringify(value);
  if (typeof value !== 'object' || Array.isArray(value)) return JSON.stringify(value);
  const keys = Object.keys(value).sort();
  const pairs = keys.map(k => JSON.stringify(k) + ':' + jcsStringify(value[k]));
  return '{' + pairs.join(',') + '}';
}

function canonicalize(manifestObj) {
  const obj = { ...manifestObj };
  delete obj['signature'];
  return jcsStringify(obj);
}

const args = process.argv.slice(2);
const idx = args.indexOf('--manifest');
const manifestPath = idx !== -1 ? args[idx + 1] : null;

if (!manifestPath) {
  console.error('Usage: node quantum-verify-manifest.mjs --manifest <path>');
  process.exit(1);
}

let manifest;
try {
  manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
} catch (err) {
  console.error(`FAIL: Cannot read/parse manifest: ${err.message}`);
  process.exit(1);
}

console.log(`Verifying: ${manifestPath}`);
console.log('');

const signatureBase64 = manifest.signature;
if (!signatureBase64 || !signatureBase64.trim()) {
  console.error('FAIL: "signature" field is missing or empty.');
  process.exit(1);
}

const keyId = manifest.keyId;
if (!keyId) {
  console.error('FAIL: "keyId" field is missing.');
  process.exit(1);
}

const pubKeyHex = PUBLIC_KEYS[keyId];
if (!pubKeyHex) {
  console.error(`FAIL: Unknown keyId "${keyId}". Known: ${Object.keys(PUBLIC_KEYS).join(', ')}`);
  process.exit(1);
}

if (pubKeyHex.startsWith('PLACEHOLDER')) {
  console.error(`FAIL: keyId "${keyId}" uses a placeholder — not configured.`);
  console.error('  Replace PLACEHOLDER with real public key hex in this tool AND in quantumSignatureVerifier.ts.');
  process.exit(1);
}

const canonical = canonicalize(manifest);
const canonicalBytes = Buffer.from(canonical, 'utf8');

console.log(`Key ID:     ${keyId}`);
console.log(`Canonical:  ${canonicalBytes.length} bytes`);

let valid = false;
try {
  const pubKeyObj = createPublicKey({ key: Buffer.from(pubKeyHex, 'hex'), format: 'der', type: 'spki' });
  const signatureBuffer = Buffer.from(signatureBase64, 'base64');

  if (signatureBuffer.length === 0) {
    console.error('FAIL: Signature decodes to empty buffer.');
    process.exit(1);
  }

  // Ed25519 verify — use crypto.verify(null, ...) not createVerify
  valid = cryptoVerify(null, canonicalBytes, pubKeyObj, signatureBuffer);
} catch (err) {
  console.error(`FAIL: Verification error: ${err.message}`);
  process.exit(1);
}

if (!valid) {
  console.error('');
  console.error('❌ FAIL: Ed25519 signature is INVALID.');
  console.error('   The manifest may have been tampered with after signing.');
  process.exit(1);
}

console.log('');
console.log('✅ PASS: Ed25519 signature is valid.');
console.log('');
console.log('Manifest summary:');
console.log(`  productName:   ${manifest.productName}`);
console.log(`  version:       ${manifest.version}`);
console.log(`  buildRevision: ${manifest.buildRevision}`);
console.log(`  commit:        ${manifest.commit}`);
console.log(`  channel:       ${manifest.channel}`);
console.log(`  platform:      ${manifest.platform}`);
console.log(`  architecture:  ${manifest.architecture}`);
console.log(`  available:     ${manifest.available}`);
console.log(`  sha256:        ${manifest.sha256}`);
