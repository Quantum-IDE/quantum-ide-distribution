#!/usr/bin/env node
/**
 * quantum-sign-manifest.mjs — Signs a Quantum IDE distribution manifest.
 *
 * Usage:
 *   node quantum-sign-manifest.mjs \
 *     --manifest <path/to/manifest.json> \
 *     --key     <path/to/private-key.hex> \
 *     --key-id  <quantum-update-v1-test|quantum-update-v1-prod> \
 *     [--output <path/to/signed-manifest.json>]
 *
 * Signing contract (matches quantumSignatureVerifier.ts):
 *   1. Parse the manifest JSON.
 *   2. Set "keyId" in the manifest (included in the signed payload).
 *   3. Remove the "signature" field — it must NOT be included in the payload.
 *   4. Serialize with RFC 8785 JCS: recursive key sort, no whitespace.
 *   5. Sign the UTF-8 canonical bytes with Ed25519 (crypto.sign(null, ...)).
 *   6. Encode the raw 64-byte signature as base64.
 *   7. Write the manifest with "signature" and "keyId" fields.
 *
 * Verification contract (quantum-verify-manifest.mjs):
 *   - Strip "signature" from manifest object.
 *   - JCS serialize remaining fields (including "keyId").
 *   - Verify Ed25519 signature against canonical bytes.
 *
 * Key format: DER-encoded PKCS#8, hex-encoded (output of quantum-keygen.mjs).
 */

import { createPrivateKey, sign as cryptoSign } from 'crypto';
import { readFileSync, writeFileSync } from 'fs';

const args = process.argv.slice(2);

function getArg(name) {
  const idx = args.indexOf(name);
  return (idx !== -1 && idx + 1 < args.length) ? args[idx + 1] : null;
}

const manifestPath = getArg('--manifest');
const keyPath      = getArg('--key');
const keyId        = getArg('--key-id');
const outputPath   = getArg('--output') ?? manifestPath;

const VALID_KEY_IDS = ['quantum-update-v1-test', 'quantum-update-v1-prod'];

if (!manifestPath || !keyPath || !keyId) {
  console.error('Usage: node quantum-sign-manifest.mjs --manifest <path> --key <path> --key-id <id> [--output <path>]');
  console.error('Valid key IDs:', VALID_KEY_IDS.join(', '));
  process.exit(1);
}

if (!VALID_KEY_IDS.includes(keyId)) {
  console.error(`Unknown key-id: ${keyId}. Must be one of: ${VALID_KEY_IDS.join(', ')}`);
  process.exit(1);
}

if (keyId === 'quantum-update-v1-prod') {
  console.error('');
  console.error('⚠️  WARNING: Signing with production key ID.');
  console.error('   Ensure the private key is the legitimate production key.');
  console.error('');
}

// RFC 8785 JCS — must match quantumSignatureVerifier.ts jcsStringify()
function jcsStringify(value) {
  if (value === null || value === undefined) return JSON.stringify(value);
  if (typeof value !== 'object' || Array.isArray(value)) return JSON.stringify(value);
  const keys = Object.keys(value).sort();
  const pairs = keys.map(k => JSON.stringify(k) + ':' + jcsStringify(value[k]));
  return '{' + pairs.join(',') + '}';
}

let manifest;
try {
  manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
} catch (err) {
  console.error(`Failed to read/parse manifest: ${err.message}`);
  process.exit(1);
}

let privateKeyHex;
try {
  privateKeyHex = readFileSync(keyPath, 'utf8').trim();
} catch (err) {
  console.error(`Failed to read private key: ${err.message}`);
  process.exit(1);
}

// Step: set keyId in manifest BEFORE computing canonical payload
// (keyId is part of the signed content; only "signature" is excluded)
manifest.keyId = keyId;
delete manifest.signature; // ensure signature is not in the payload

const canonical = jcsStringify(manifest);
const canonicalBytes = Buffer.from(canonical, 'utf8');

console.log(`Manifest:   ${manifestPath}`);
console.log(`Key file:   ${keyPath}`);
console.log(`Key ID:     ${keyId}`);
console.log(`Canonical:  ${canonicalBytes.length} bytes`);
console.log(`  Preview:  ${canonical.slice(0, 120)}...`);

// Ed25519 sign — crypto.sign(null, ...) for Ed25519 (no digest algorithm needed)
const privKeyObj = createPrivateKey({ key: Buffer.from(privateKeyHex, 'hex'), format: 'der', type: 'pkcs8' });
const signatureBase64 = cryptoSign(null, canonicalBytes, privKeyObj).toString('base64');

console.log(`Signature:  ${signatureBase64}`);

manifest.signature = signatureBase64;

writeFileSync(outputPath, JSON.stringify(manifest, null, 4) + '\n', 'utf8');
console.log(`Output:     ${outputPath}`);
console.log('');
console.log('✅ Manifest signed. Run quantum-verify-manifest.mjs to confirm before distributing.');
