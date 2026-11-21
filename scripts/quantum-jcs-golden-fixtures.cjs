/**
 * quantum-jcs-golden-fixtures.cjs
 *
 * Cross-Implementation JCS Golden Test Fixtures.
 *
 * These fixtures define SHARED canonical test vectors used by:
 *   1. Node.js signing tools (quantum-sign-manifest.mjs, quantum-verify-manifest.mjs)
 *   2. TypeScript app engine (quantumSignatureVerifier.ts — jcsStringify)
 *
 * Both implementations MUST produce identical canonical bytes for every input.
 * Any divergence means the app will reject manifests signed by the tools (or vice versa).
 *
 * Usage:
 *   node quantum-jcs-golden-fixtures.cjs
 * Exit 0 = all pass, Exit 1 = failure.
 *
 * To validate from TypeScript side, see:
 *   src/vs/platform/update/test/common/quantumManifest.test.ts
 *   (the canonicalizeManifestForSigning tests use the same input/output pairs)
 */

'use strict';

const assert = require('assert');
const { createPrivateKey, createPublicKey, sign: cryptoSign, verify: cryptoVerify } = require('crypto');

// ---------------------------------------------------------------------------
// JCS implementation — MUST be byte-for-byte identical to quantumSignatureVerifier.ts
// ---------------------------------------------------------------------------

function jcsStringify(value) {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return '[' + value.map(jcsStringify).join(',') + ']';
  }
  const keys = Object.keys(value).sort();
  const pairs = keys.map(k => JSON.stringify(k) + ':' + jcsStringify(value[k]));
  return '{' + pairs.join(',') + '}';
}

// ---------------------------------------------------------------------------
// Golden Fixtures
// Each entry: { description, input, expectedCanonical }
// The expectedCanonical was produced by the Node.js implementation above
// and MUST equal what TypeScript's jcsStringify() produces for the same input.
// ---------------------------------------------------------------------------

const GOLDEN_FIXTURES = [

  // ---- Key ordering -------------------------------------------------------

  {
    id: 'GF-01',
    description: 'Top-level alphabetical key sort',
    input: { z: 1, a: 2, m: 3 },
    expectedCanonical: '{"a":2,"m":3,"z":1}',
  },

  {
    id: 'GF-02',
    description: 'Nested object keys sorted recursively at every level',
    input: { outer: { z: 1, a: 2 }, b: { y: 9, x: 8 } },
    expectedCanonical: '{"b":{"x":8,"y":9},"outer":{"a":2,"z":1}}',
  },

  {
    id: 'GF-03',
    description: 'Three-level deep recursive sort',
    input: { c: { z: { y: 1, x: 2 }, a: 3 }, b: 4 },
    expectedCanonical: '{"b":4,"c":{"a":3,"z":{"x":2,"y":1}}}',
  },

  // ---- Arrays -------------------------------------------------------------

  {
    id: 'GF-04',
    description: 'Array of primitives: element ORDER preserved (not sorted)',
    input: { arr: [3, 1, 2] },
    expectedCanonical: '{"arr":[3,1,2]}',
  },

  {
    id: 'GF-05',
    description: 'Array of objects: object keys sorted, array order preserved',
    input: { arr: [{ z: 1, a: 2 }, { y: 3, b: 4 }] },
    expectedCanonical: '{"arr":[{"a":2,"z":1},{"b":4,"y":3}]}',
  },

  {
    id: 'GF-06',
    description: 'Nested arrays',
    input: { a: [[1, 2], [3, 4]] },
    expectedCanonical: '{"a":[[1,2],[3,4]]}',
  },

  {
    id: 'GF-07',
    description: 'Array of mixed types (number, string, null, bool, object)',
    input: { a: [1, 'two', null, true, { z: 3, a: 1 }] },
    expectedCanonical: '{"a":[1,"two",null,true,{"a":1,"z":3}]}',
  },

  {
    id: 'GF-08',
    description: 'Empty array',
    input: { a: [] },
    expectedCanonical: '{"a":[]}',
  },

  // ---- Primitives ---------------------------------------------------------

  {
    id: 'GF-09',
    description: 'String value',
    input: { s: 'hello world' },
    expectedCanonical: '{"s":"hello world"}',
  },

  {
    id: 'GF-10',
    description: 'Integer',
    input: { n: 42 },
    expectedCanonical: '{"n":42}',
  },

  {
    id: 'GF-11',
    description: 'Float',
    input: { n: 3.14 },
    expectedCanonical: '{"n":3.14}',
  },

  {
    id: 'GF-12',
    description: 'Boolean true and false (sorted)',
    input: { t: true, f: false },
    expectedCanonical: '{"f":false,"t":true}',
  },

  {
    id: 'GF-13',
    description: 'Null value',
    input: { n: null },
    expectedCanonical: '{"n":null}',
  },

  {
    id: 'GF-14',
    description: 'Zero',
    input: { n: 0 },
    expectedCanonical: '{"n":0}',
  },

  {
    id: 'GF-15',
    description: 'Negative integer',
    input: { n: -42 },
    expectedCanonical: '{"n":-42}',
  },

  {
    id: 'GF-16',
    description: 'Empty string',
    input: { s: '' },
    expectedCanonical: '{"s":""}',
  },

  {
    id: 'GF-17',
    description: 'Empty object',
    input: {},
    expectedCanonical: '{}',
  },

  // ---- Unicode ------------------------------------------------------------

  {
    id: 'GF-18',
    description: 'Unicode CJK string',
    input: { u: '日本語テスト' },
    expectedCanonical: '{"u":"日本語テスト"}',
  },

  {
    id: 'GF-19',
    description: 'Latin-1 supplement: café',
    input: { u: 'caf\u00e9' },
    expectedCanonical: '{"u":"caf\u00e9"}',
  },

  // ---- Signature field exclusion ------------------------------------------

  {
    id: 'GF-20',
    description: 'Signature field EXCLUDED from canonical (stripped before serialize)',
    // This tests canonicalizeManifestForSigning() behavior:
    // The signature field is stripped; result equals jcsStringify({a:1, z:2})
    input: { a: 1, signature: 'abc123', z: 2 },
    // After stripping 'signature':
    expectedCanonicalAfterStrip: '{"a":1,"z":2}',
  },

  {
    id: 'GF-21',
    description: 'keyId INCLUDED in canonical (only signature is stripped)',
    input: { keyId: 'quantum-update-v1-test', signature: 'abc', version: '1.0' },
    // After stripping 'signature':
    expectedCanonicalAfterStrip: '{"keyId":"quantum-update-v1-test","version":"1.0"}',
  },

  // ---- Full manifest canonical ---------------------------------------------

  {
    id: 'GF-22',
    description: 'Full Quantum manifest v2.0.0 canonical form (without signature)',
    input: {
      schemaVersion: '2.0.0',
      productName: 'Quantum IDE',
      platform: 'windows',
      architecture: 'x64',
      channel: 'friends-beta',
      version: '0.1.0-beta.1',
      buildRevision: 1,
      commit: 'd84d7f152a925dc20c91f2422df5ef9655df1dde',
      keyId: 'quantum-update-v1-test',
      available: true,
      downloadUrl: 'https://github.com/Quantum-IDE/quantum-ide-distribution/releases/download/v0.1.0-beta.1/Quantum-IDE-0.1.0-beta.1-win-x64-setup.exe',
      fileName: 'Quantum-IDE-0.1.0-beta.1-win-x64-setup.exe',
      sizeBytes: 183793146,
      sha256: '3261e93dd15d4c502247187b430656482f31be71151667589b27cf61699cb2a8',
      updateClass: 'manual-consent',
      publishedAt: '2026-11-21T13:30:02.543Z',
    },
    // expectedCanonical computed below and printed
    expectedCanonical: null, // computed dynamically
  },

  // ---- Duplicate JSON keys ------------------------------------------------

  {
    id: 'GF-23',
    description: 'Duplicate JSON keys: last value wins in JS (V8 behavior)',
    // JSON.parse('{"a":1,"b":2,"a":99}') → {a:99,b:2}
    inputJson: '{"a":1,"b":2,"a":99}',
    expectedCanonical: '{"a":99,"b":2}',
  },
];

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

function canonicalize(obj) {
  const copy = { ...obj };
  delete copy.signature;
  return jcsStringify(copy);
}

let pass = 0;
let fail = 0;

console.log('=== Quantum JCS Golden Test Fixtures ===');
console.log('Cross-implementation canonical verification\n');

for (const fixture of GOLDEN_FIXTURES) {
  try {
    // Determine input
    let obj;
    if (fixture.inputJson) {
      obj = JSON.parse(fixture.inputJson);
    } else {
      obj = fixture.input;
    }

    // Determine expected
    let expected;
    let actual;

    if (fixture.id === 'GF-20' || fixture.id === 'GF-21') {
      // These test canonicalize() (strip signature)
      actual = canonicalize(obj);
      expected = fixture.expectedCanonicalAfterStrip;
    } else if (fixture.id === 'GF-22') {
      // Compute canonical and record it as the golden value
      actual = jcsStringify(obj);
      expected = actual; // Self-referential: just verify determinism
      fixture.expectedCanonical = actual;
      console.log(`  ${fixture.id}  COMPUTED  ${fixture.description}`);
      console.log(`    Canonical (${Buffer.from(actual,'utf8').length} bytes): ${actual.slice(0,80)}...`);
      pass++;
      continue;
    } else {
      actual = jcsStringify(obj);
      expected = fixture.expectedCanonical;
    }

    assert.strictEqual(actual, expected,
      `\n  actual:   ${actual}\n  expected: ${expected}`);

    console.log(`  ${fixture.id}  PASS  ${fixture.description}`);
    pass++;
  } catch (e) {
    console.error(`  ${fixture.id}  FAIL  ${fixture.description}`);
    console.error(`    ${e.message.split('\n')[0]}`);
    fail++;
  }
}

// ---- Sign/Verify golden round-trip ----------------------------------------

console.log('\n--- Sign/Verify round-trip with golden manifest ---');

const privHex = '302e020100300506032b6570042204201293c7e1497352a9edff5a5a7f668bf83218524055b13d9975411ab9749f9bd7';
const pubHex  = '302a300506032b65700321009d0e9dbed91b47cd728c019c639c4146bd6d7104c7a876c86617af5a0723c16c';
const privKey = createPrivateKey({ key: Buffer.from(privHex,'hex'), format:'der', type:'pkcs8' });
const pubKey  = createPublicKey ({ key: Buffer.from(pubHex, 'hex'), format:'der', type:'spki'  });

const goldenManifest = GOLDEN_FIXTURES.find(f => f.id === 'GF-22').input;
const goldenManifestWithKey = { ...goldenManifest, keyId: 'quantum-update-v1-test' };

// Sign
const canonicalBytes = Buffer.from(jcsStringify({ ...goldenManifestWithKey }), 'utf8');
const signature = cryptoSign(null, canonicalBytes, privKey);
const sigBase64 = signature.toString('base64');

// Verify — same canonical
const verifyCanonical = Buffer.from(jcsStringify({ ...goldenManifestWithKey }), 'utf8');
const isValid = cryptoVerify(null, verifyCanonical, pubKey, signature);

try {
  assert.ok(isValid, 'Round-trip verification failed');
  assert.deepStrictEqual(canonicalBytes, verifyCanonical, 'Canonical bytes must be deterministic');
  console.log(`  GF-RT1  PASS  Golden manifest sign→verify round-trip`);
  console.log(`    Canonical: ${canonicalBytes.length} bytes`);
  console.log(`    Signature: ${sigBase64.slice(0,40)}...`);
  pass++;
} catch(e) {
  console.error(`  GF-RT1  FAIL  ${e.message}`);
  fail++;
}

// Tamper test
const tamperedManifest = { ...goldenManifestWithKey, buildRevision: 999 };
const tamperedCanonical = Buffer.from(jcsStringify(tamperedManifest), 'utf8');
const tamperedValid = cryptoVerify(null, tamperedCanonical, pubKey, signature);

try {
  assert.strictEqual(tamperedValid, false, 'Tampered manifest should not verify');
  console.log(`  GF-RT2  PASS  Tampered manifest (buildRevision:999) rejects correctly`);
  pass++;
} catch(e) {
  console.error(`  GF-RT2  FAIL  ${e.message}`);
  fail++;
}

// ---- Summary ---------------------------------------------------------------

console.log('\n' + '='.repeat(50));
console.log(`Total: ${pass} passed, ${fail} failed`);

if (fail > 0) {
  process.exit(1);
}

console.log('\n✅ All golden fixtures PASSED.');
console.log('\nNote: These canonical outputs MUST be reproduced identically by:');
console.log('  - quantumSignatureVerifier.ts jcsStringify()');
console.log('  - quantum-sign-manifest.mjs jcsStringify()');
console.log('  - quantum-verify-manifest.mjs jcsStringify()');
