#!/usr/bin/env node
/**
 * quantum-keygen.mjs — Ed25519 key pair generator for Quantum IDE update signing.
 *
 * Usage:
 *   node quantum-keygen.mjs [--output-dir <dir>]
 *
 * Outputs:
 *   - PUBLIC key hex → stdout (safe to share / embed in app)
 *   - PRIVATE key hex → <output-dir>/quantum-signing-key.hex (NEVER to stdout)
 *
 * ⚠️  FOR DEVELOPMENT AND TEST ONLY.
 * ⚠️  Production private key MUST be generated offline on an air-gapped machine
 *     by the repository owner. Never generate it on a build server or CI.
 *
 * Key format:
 *   - Private key: DER-encoded PKCS#8, hex-encoded
 *   - Public key:  DER-encoded SPKI, hex-encoded
 *
 * To use the generated public key in the app, paste its hex value into
 * QUANTUM_UPDATE_PUBLIC_KEY_TEST_HEX in quantumSignatureVerifier.ts.
 *
 * Key rotation:
 *   1. Generate new key pair offline.
 *   2. Update the app's embedded public key constant.
 *   3. Store private key in CI secrets vault.
 *   4. Publish a transitional manifest signed with both old and new keys,
 *      or accept one forced-update window where old clients cannot verify.
 *   5. Remove old key constant after all clients have migrated.
 */

import { generateKeyPairSync } from 'crypto';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const args = process.argv.slice(2);
const dirIdx = args.indexOf('--output-dir');
const outputDir = dirIdx !== -1 ? args[dirIdx + 1] : '.build';

const { privateKey, publicKey } = generateKeyPairSync('ed25519');

const privateKeyHex = privateKey.export({ type: 'pkcs8', format: 'der' }).toString('hex');
const publicKeyHex  = publicKey.export({ type: 'spki',  format: 'der' }).toString('hex');

mkdirSync(outputDir, { recursive: true });
const privateKeyPath = join(outputDir, 'quantum-signing-key.hex');
writeFileSync(privateKeyPath, privateKeyHex, { encoding: 'utf8', mode: 0o600 });

console.log('=== Quantum IDE Ed25519 Key Generation ===');
console.log('');
console.log('PUBLIC KEY (DER SPKI hex) — safe to embed in app:');
console.log(publicKeyHex);
console.log('');
console.log(`PRIVATE KEY written to: ${privateKeyPath}`);
console.log('  Mode: 0600 (owner read-only)');
console.log('  Add this path to .gitignore. NEVER commit, log, or transmit the private key.');
console.log('');
console.log('Next steps:');
console.log('  1. Copy the PUBLIC KEY above into QUANTUM_UPDATE_PUBLIC_KEY_TEST_HEX');
console.log('     in src/vs/platform/update/common/quantumSignatureVerifier.ts');
console.log('  2. Add the output-dir to .gitignore.');
console.log('  3. Use quantum-sign-manifest.mjs to sign manifests with this key.');
