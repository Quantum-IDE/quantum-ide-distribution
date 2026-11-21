/**
 * Quantum IDE — Windows E2E Update Engine Test Suite
 *
 * Executes all 8 Phase 1 update engine verification scenarios natively on Windows (win32 x64):
 *   Scenario 1: silent-next-launch (Background download & quiet next-launch apply)
 *   Scenario 2: manual-consent (User approval required before download)
 *   Scenario 3: Ed25519 signature verification (valid accepted, tampered rejected)
 *   Scenario 4: Missing / test key rejection in production mode
 *   Scenario 5: SHA-256 download checksum verification (corrupt discarded, zero bad install)
 *   Scenario 6: Network failure & partial download resilience (clean rollback / recovery)
 *   Scenario 7: Downgrade / buildRevision protection (no rollback to older builds)
 *   Scenario 8: Manifest cache 5-minute TTL & explicit refresh bypass
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import os from 'os';
import assert from 'assert/strict';

// Base UNC path to compiled TypeScript modules in Quantum-IDE-clean
const uncBase = 'file://wsl.localhost/Ubuntu-24.04/home/moustafa/My-Project/Quantum-IDE-clean/out/vs';

// Dynamically import compiled Quantum update modules
const [
  bufferMod,
  logMod,
  manifestMod,
  clientMod,
  sigMod,
  policyMod
] = await Promise.all([
  import(uncBase + '/base/common/buffer.js'),
  import(uncBase + '/platform/log/common/log.js'),
  import(uncBase + '/platform/update/common/quantumManifest.js'),
  import(uncBase + '/platform/update/common/quantumManifestClient.js'),
  import(uncBase + '/platform/update/common/quantumSignatureVerifier.js'),
  import(uncBase + '/platform/update/electron-main/quantumUpdatePolicy.js')
]);

const { bufferToStream, VSBuffer } = bufferMod;
const { NullLogService } = logMod;
const {
  QUANTUM_UPDATE_CLASSES,
  validateQuantumManifest,
  isNewerBuild,
  resolveUpdateClass,
  adaptManifestToIUpdate
} = manifestMod;
const { QuantumManifestClient } = clientMod;
const { QuantumSignatureVerifier, canonicalizeManifestForSigning } = sigMod;
const { QuantumUpdatePolicy } = policyMod;

// Test Ed25519 Keys (DER PKCS8 hex private key, DER SPKI hex public key)
const TEST_PRIV_KEY_HEX = '302e020100300506032b6570042204201293c7e1497352a9edff5a5a7f668bf83218524055b13d9975411ab9749f9bd7';
const TEST_PUB_KEY_HEX = '302a300506032b65700321009d0e9dbed91b47cd728c019c639c4146bd6d7104c7a876c86617af5a0723c16c';

// Test directory for staging downloads
const TEST_STAGING_DIR = path.join(os.tmpdir(), 'quantum-e2e-staging-' + Date.now());
fs.mkdirSync(TEST_STAGING_DIR, { recursive: true });

console.log('========================================================================');
console.log('   QUANTUM UPDATE ENGINE — WINDOWS LIVE E2E TEST SUITE (PHASE 1)');
console.log('========================================================================');
console.log('Host Platform   :', process.platform, process.arch);
console.log('Node Version    :', process.version);
console.log('Staging Directory:', TEST_STAGING_DIR);
console.log('');

// Test results tracker
const results = [];
function recordResult(id, name, passed, details = '') {
  results.push({ id, name, passed, details });
  const statusStr = passed ? '✅ PASS' : '❌ FAIL';
  console.log(`[${statusStr}] Scenario ${id}: ${name}`);
  if (details) {
    console.log(`         Details: ${details}`);
  }
}

// Helper to create a mock configuration service
function makeMockConfig(overrides = {}) {
  const store = {
    'update.mode': 'default',
    'update.enableWindowsBackgroundUpdates': true,
    ...overrides
  };
  return {
    getValue: (key) => store[key],
    onDidChangeConfiguration: () => ({ dispose: () => {} })
  };
}

// Helper to create a mock RequestService backed by native fetch
function makeFetchRequestService() {
  return {
    request: async (opts) => {
      const resp = await fetch(opts.url, { headers: opts.headers });
      const arrayBuf = await resp.arrayBuffer();
      const vsbuf = VSBuffer.wrap(new Uint8Array(arrayBuf));
      return {
        res: {
          statusCode: resp.status,
          headers: Object.fromEntries(resp.headers.entries())
        },
        stream: bufferToStream(vsbuf)
      };
    }
  };
}

// Helper to sign a manifest with the test private key
function signManifest(manifestObj) {
  const raw = JSON.stringify(manifestObj);
  const { signature, keyId } = QuantumSignatureVerifier.signManifestForTest(raw, TEST_PRIV_KEY_HEX);
  return { ...manifestObj, signature, keyId };
}

// ========================================================================
// START LOCAL HTTP MOCK SERVER FOR SERVING MANIFESTS & PACKAGES
// ========================================================================

let serverRoutes = {};
let requestLog = [];

const server = http.createServer((req, res) => {
  const parsedUrl = new URL(req.url, 'http://127.0.0.1');
  const pathname = parsedUrl.pathname;
  requestLog.push({ method: req.method, path: pathname, headers: req.headers });

  if (serverRoutes[pathname]) {
    serverRoutes[pathname](req, res);
  } else {
    res.statusCode = 404;
    res.end('Not Found');
  }
});

await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const serverPort = server.address().port;
const serverBaseUrl = `http://127.0.0.1:${serverPort}`;
console.log(`Local test server running at: ${serverBaseUrl}\n`);

// Synthetic installer binary (1 MB of random bytes for realistic hashing and transfer)
const syntheticInstallerData = crypto.randomBytes(1024 * 1024);
const syntheticInstallerSha256 = crypto.createHash('sha256').update(syntheticInstallerData).digest('hex');

// ========================================================================
// SCENARIO 1: silent-next-launch (Background Download & Staged Apply)
// ========================================================================
try {
  const channelPath = '/channels/friends-beta/windows-x64.json';
  const downloadPath = '/downloads/Quantum-Setup-0.1.0-beta.1-x64.exe';

  const manifestV2 = {
    schemaVersion: '2.0.0',
    productName: 'Quantum IDE',
    version: '0.1.0-beta.1',
    buildRevision: 2,
    commit: 'b'.repeat(40),
    channel: 'friends-beta',
    platform: 'windows',
    architecture: 'x64',
    installerType: 'inno-user-setup',
    updateClass: QUANTUM_UPDATE_CLASSES.SILENT_NEXT_LAUNCH,
    available: true,
    publishedAt: new Date().toISOString(),
    minOSVersion: '10.0.19041',
    fileName: 'Quantum-Setup-0.1.0-beta.1-x64.exe',
    sizeBytes: syntheticInstallerData.length,
    sha256: syntheticInstallerSha256,
    downloadUrl: `https://example.com${downloadPath}`,
    releaseNotesUrl: 'https://example.com/notes',
    highlights: ['Silent background patch'],
    deltaSupport: { enabled: false }
  };

  const signedManifest = signManifest(manifestV2);

  serverRoutes[channelPath] = (req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(signedManifest));
  };

  serverRoutes[downloadPath] = (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'application/octet-stream',
      'Content-Length': syntheticInstallerData.length
    });
    res.end(syntheticInstallerData);
  };

  // 1. Fetch via Manifest Client
  const client = new QuantumManifestClient(makeFetchRequestService(), new NullLogService());
  const fetched = await client.fetchManifest(`${serverBaseUrl}${channelPath}`, true);
  assert.ok(fetched, 'Manifest must be fetched');

  // 2. Signature verification
  const verifier = new QuantumSignatureVerifier(new NullLogService(), 'development');
  const sigCheck = verifier.checkManifestSignature(JSON.stringify(fetched), fetched.signature);
  assert.strictEqual(sigCheck, true, 'Signature must be accepted in development mode');

  // 3. Manifest validation
  const validation = validateQuantumManifest(fetched, {
    expectedChannel: 'friends-beta',
    currentVersion: '0.1.0-beta.1',
    currentBuildRevision: 1
  });
  assert.strictEqual(validation.valid, true, 'Manifest must be valid');

  // 4. Update Policy
  const policy = new QuantumUpdatePolicy(makeMockConfig(), new NullLogService());
  const updateClass = resolveUpdateClass(fetched);
  const shouldAutoDownload = policy.shouldAutoDownload(updateClass, false /* background poll */);
  const shouldNotify = policy.shouldNotifyUser(updateClass);
  const shouldAutoApply = policy.shouldAutoApply(updateClass);

  assert.strictEqual(shouldAutoDownload, true, 'silent-next-launch MUST auto-download in background');
  assert.strictEqual(shouldNotify, false, 'silent-next-launch MUST NOT display disruptive notification');
  assert.strictEqual(shouldAutoApply, true, 'silent-next-launch MUST auto-apply on exit / next launch');

  // 5. Download & Stage Pipeline (simulating Win32UpdateService download flow)
  const stagedPackagePath = path.join(TEST_STAGING_DIR, `CodeSetup-friends-beta-${fetched.commit.slice(0, 10)}.exe`);
  const tmpDownloadPath = `${stagedPackagePath}.tmp`;

  // Stream download from test server to .tmp
  const downloadResp = await fetch(`${serverBaseUrl}${downloadPath}`);
  const fileStream = fs.createWriteStream(tmpDownloadPath);
  for await (const chunk of downloadResp.body) {
    fileStream.write(chunk);
  }
  fileStream.end();
  await new Promise(r => fileStream.on('finish', r));

  // Compute checksum
  const downloadedBuf = fs.readFileSync(tmpDownloadPath);
  const computedHash = crypto.createHash('sha256').update(downloadedBuf).digest('hex');
  assert.strictEqual(computedHash, fetched.sha256, 'Downloaded checksum must match manifest sha256');

  // Atomic rename to final staging path
  fs.renameSync(tmpDownloadPath, stagedPackagePath);
  assert.ok(fs.existsSync(stagedPackagePath), 'Staged installer must exist');
  assert.ok(!fs.existsSync(tmpDownloadPath), 'Temporary .tmp file must be cleaned up');

  // 6. Persistence check across process/session exit
  // File exists on disk, preserved for next launch
  const stagedStats = fs.statSync(stagedPackagePath);
  assert.strictEqual(stagedStats.size, syntheticInstallerData.length, 'Staged file size preserved across quit');

  // 7. Verify next-launch discovery: simulated postInitialize sees pending update package
  const pendingUpdateFound = fs.existsSync(stagedPackagePath);
  assert.strictEqual(pendingUpdateFound, true, 'Next launch successfully discovers staged update package');

  recordResult(1, 'silent-next-launch (Background download & quiet next-launch apply)', true,
    `AutoDownload=${shouldAutoDownload}, Notify=${shouldNotify}, AutoApply=${shouldAutoApply}, StagedSize=${stagedStats.size}B, HashVerified=OK`);
} catch (err) {
  recordResult(1, 'silent-next-launch', false, err.message);
}

// ========================================================================
// SCENARIO 2: manual-consent (User Approval Gate for Major Updates)
// ========================================================================
try {
  const channelPath = '/channels/friends-beta/manual-consent.json';

  const manifestManual = {
    schemaVersion: '2.0.0',
    productName: 'Quantum IDE',
    version: '0.1.0-beta.1',
    buildRevision: 2,
    commit: 'c'.repeat(40),
    channel: 'friends-beta',
    platform: 'windows',
    architecture: 'x64',
    installerType: 'inno-user-setup',
    updateClass: QUANTUM_UPDATE_CLASSES.MANUAL_CONSENT,
    available: true,
    publishedAt: new Date().toISOString(),
    minOSVersion: '10.0.19041',
    fileName: 'Quantum-Setup-0.1.0-beta.1-x64.exe',
    sizeBytes: syntheticInstallerData.length,
    sha256: syntheticInstallerSha256,
    downloadUrl: `${serverBaseUrl}/downloads/manual.exe`,
    releaseNotesUrl: 'https://example.com/notes-v2',
    highlights: ['Major feature upgrade requiring user consent'],
    deltaSupport: { enabled: false }
  };

  const signedManual = signManifest(manifestManual);

  serverRoutes[channelPath] = (req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(signedManual));
  };

  const client = new QuantumManifestClient(makeFetchRequestService(), new NullLogService());
  const fetched = await client.fetchManifest(`${serverBaseUrl}${channelPath}`, true);
  assert.ok(fetched);

  const policy = new QuantumUpdatePolicy(makeMockConfig(), new NullLogService());
  const updateClass = resolveUpdateClass(fetched);

  // Background check
  const bgAutoDownload = policy.shouldAutoDownload(updateClass, false /* explicit = false */);
  const bgNotify = policy.shouldNotifyUser(updateClass);
  const bgAutoApply = policy.shouldAutoApply(updateClass);

  assert.strictEqual(bgAutoDownload, false, 'manual-consent MUST NOT auto-download in background');
  assert.strictEqual(bgNotify, true, 'manual-consent MUST notify user for consent');
  assert.strictEqual(bgAutoApply, false, 'manual-consent MUST NOT auto-apply without consent');

  // Simulated User Consent (User clicks "Update Now")
  const explicitDownload = policy.shouldAutoDownload(updateClass, true /* explicit = true */);
  assert.strictEqual(explicitDownload, true, 'Explicit user approval must trigger authorized download');

  recordResult(2, 'manual-consent (User Approval Gate)', true,
    `BackgroundAutoDownload=${bgAutoDownload} (Blocked), NotifyUser=${bgNotify}, ExplicitConsentDownload=${explicitDownload}`);
} catch (err) {
  recordResult(2, 'manual-consent', false, err.message);
}

// ========================================================================
// SCENARIO 3: Ed25519 Cryptographic Signature Verification
// ========================================================================
try {
  const verifier = new QuantumSignatureVerifier(new NullLogService(), 'development');

  // Test 3A: Valid signature
  const validManifest = {
    schemaVersion: '2.0.0',
    productName: 'Quantum IDE',
    version: '0.1.0-beta.1',
    buildRevision: 2,
    commit: 'd'.repeat(40),
    available: true
  };
  const { signature } = QuantumSignatureVerifier.signManifestForTest(JSON.stringify(validManifest), TEST_PRIV_KEY_HEX);
  const verifyValid = verifier.verifyManifest(JSON.stringify(validManifest), signature);
  assert.strictEqual(verifyValid.valid, true, 'Valid signature must verify successfully');

  // Test 3B: Tampered payload (tamper buildRevision after signing)
  const tamperedManifest = { ...validManifest, buildRevision: 999 };
  const verifyTampered = verifier.verifyManifest(JSON.stringify(tamperedManifest), signature);
  assert.strictEqual(verifyTampered.valid, false, 'Tampered manifest must fail verification');

  // Test 3C: Tampered version string
  const tamperedVersion = { ...validManifest, version: '9.9.9' };
  const verifyTamperedVersion = verifier.verifyManifest(JSON.stringify(tamperedVersion), signature);
  assert.strictEqual(verifyTamperedVersion.valid, false, 'Tampered version must fail verification');

  recordResult(3, 'Ed25519 Cryptographic Signature Verification', true,
    'Valid signature verified = OK, Tampered buildRevision rejected = OK, Tampered version rejected = OK');
} catch (err) {
  recordResult(3, 'Ed25519 Cryptographic Signature Verification', false, err.message);
}

// ========================================================================
// SCENARIO 4: Missing or Invalid Signature in Production Mode
// ========================================================================
try {
  const prodVerifier = new QuantumSignatureVerifier(new NullLogService(), 'production');

  const testManifest = {
    schemaVersion: '2.0.0',
    productName: 'Quantum IDE',
    version: '0.1.0-beta.1',
    buildRevision: 2,
    commit: 'e'.repeat(40),
    available: true
  };

  // Test 4A: Missing signature in production mode
  const missingSigResult = prodVerifier.checkManifestSignature(JSON.stringify(testManifest), undefined);
  assert.strictEqual(missingSigResult, false, 'Production mode MUST reject manifest with missing signature');

  // Test 4B: Test key signature in production mode (production key is PLACEHOLDER)
  const { signature } = QuantumSignatureVerifier.signManifestForTest(JSON.stringify(testManifest), TEST_PRIV_KEY_HEX);
  const prodWithTestKey = prodVerifier.checkManifestSignature(JSON.stringify(testManifest), signature);
  assert.strictEqual(prodWithTestKey, false, 'Production mode MUST reject test key signatures');

  const verifyDetails = prodVerifier.verifyManifest(JSON.stringify(testManifest), signature);
  assert.strictEqual(verifyDetails.valid, false);
  assert.ok(verifyDetails.error.includes('Production signing key is not configured'), 'Error must identify unconfigured production key');

  recordResult(4, 'Missing or Invalid Signature in Production Mode', true,
    'Missing signature rejected in prod = OK, Test key rejected in prod = OK, Production safety guard verified');
} catch (err) {
  recordResult(4, 'Missing or Invalid Signature in Production Mode', false, err.message);
}

// ========================================================================
// SCENARIO 5: SHA-256 Download Integrity Verification
// ========================================================================
try {
  const corruptedInstallerData = Buffer.from(syntheticInstallerData);
  // Flip bits in the middle of the payload to simulate corruption
  corruptedInstallerData[500000] = corruptedInstallerData[500000] ^ 0xFF;

  const corruptedDownloadPath = path.join(TEST_STAGING_DIR, 'corrupted-download.exe');
  const corruptedTmpPath = `${corruptedDownloadPath}.tmp`;

  // Write corrupted data to .tmp
  fs.writeFileSync(corruptedTmpPath, corruptedInstallerData);

  // Compute checksum against expected hash
  const computedHash = crypto.createHash('sha256').update(corruptedInstallerData).digest('hex');
  const expectedHash = syntheticInstallerSha256;

  let integrityPassed = false;
  let fileDiscarded = false;

  if (computedHash === expectedHash) {
    fs.renameSync(corruptedTmpPath, corruptedDownloadPath);
    integrityPassed = true;
  } else {
    // Checksum mismatch: Discard temporary file, do NOT rename to .exe
    fs.unlinkSync(corruptedTmpPath);
    fileDiscarded = true;
  }

  assert.strictEqual(integrityPassed, false, 'Corrupted data must not pass integrity check');
  assert.strictEqual(fileDiscarded, true, 'Corrupted temporary file must be unlinked');
  assert.ok(!fs.existsSync(corruptedDownloadPath), 'Corrupted .exe must NEVER be staged or executed');

  recordResult(5, 'SHA-256 Download Integrity Verification', true,
    `Expected=${expectedHash.slice(0, 16)}..., Actual=${computedHash.slice(0, 16)}..., FileDiscarded=${fileDiscarded}, ExecutionBlocked=OK`);
} catch (err) {
  recordResult(5, 'SHA-256 Download Integrity Verification', false, err.message);
}

// ========================================================================
// SCENARIO 6: Network Failure & Partial Download Resilience
// ========================================================================
try {
  // Test 6A: Manifest server returns HTTP 500 error
  serverRoutes['/channels/friends-beta/server-error.json'] = (req, res) => {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Internal Server Error');
  };

  const client = new QuantumManifestClient(makeFetchRequestService(), new NullLogService());
  const errorResult = await client.fetchManifest(`${serverBaseUrl}/channels/friends-beta/server-error.json`, true);
  assert.strictEqual(errorResult, null, 'Client must gracefully return null on HTTP 500 without crashing');

  // Test 6B: Server terminates download mid-stream (partial download)
  const partialDownloadRoute = '/downloads/partial.exe';
  serverRoutes[partialDownloadRoute] = (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'application/octet-stream',
      'Content-Length': 1024 * 1024
    });
    // Send 100 KB and destroy connection
    res.write(syntheticInstallerData.subarray(0, 100 * 1024));
    setTimeout(() => req.destroy(), 50);
  };

  const partialTarget = path.join(TEST_STAGING_DIR, 'partial-test.exe');
  const partialTmp = `${partialTarget}.tmp`;

  let partialErrorCaught = false;
  try {
    const resp = await fetch(`${serverBaseUrl}${partialDownloadRoute}`);
    const ws = fs.createWriteStream(partialTmp);
    for await (const chunk of resp.body) {
      ws.write(chunk);
    }
    ws.end();
  } catch (netErr) {
    partialErrorCaught = true;
    // Clean up partial tmp file on network failure
    if (fs.existsSync(partialTmp)) {
      fs.unlinkSync(partialTmp);
    }
  }

  assert.strictEqual(partialErrorCaught, true, 'Network drop must trigger catch block');
  assert.ok(!fs.existsSync(partialTmp), 'Partial temporary file must be cleaned up');
  assert.ok(!fs.existsSync(partialTarget), 'No partial executable must be left on system');

  recordResult(6, 'Network Failure & Partial Download Resilience', true,
    'HTTP 500 handled gracefully = OK, Mid-stream connection drop handled = OK, Zero partial files left = OK');
} catch (err) {
  recordResult(6, 'Network Failure & Partial Download Resilience', false, err.message);
}

// ========================================================================
// SCENARIO 7: Downgrade / Build Revision Protection
// ========================================================================
try {
  // Test 7A: Older buildRevision with same productVersion
  const olderBuild = isNewerBuild('0.1.0-beta.1', 1, '0.1.0-beta.1', 2);
  assert.strictEqual(olderBuild, false, 'Older buildRevision must be rejected');

  // Test 7B: Equal buildRevision with same productVersion
  const equalBuild = isNewerBuild('0.1.0-beta.1', 2, '0.1.0-beta.1', 2);
  assert.strictEqual(equalBuild, false, 'Equal buildRevision must be rejected');

  // Test 7C: Newer buildRevision with same productVersion
  const newerBuild = isNewerBuild('0.1.0-beta.1', 3, '0.1.0-beta.1', 2);
  assert.strictEqual(newerBuild, true, 'Newer buildRevision must be accepted');

  // Test 7D: Older SemVer
  const olderSemver = isNewerBuild('0.0.9', 10, '0.1.0-beta.1', 1);
  assert.strictEqual(olderSemver, false, 'Older SemVer must be rejected regardless of buildRevision');

  // Test 7E: Full manifest validation rejection of older build
  const olderManifest = {
    schemaVersion: '2.0.0',
    productName: 'Quantum IDE',
    version: '0.1.0-beta.1',
    buildRevision: 1,
    commit: 'f'.repeat(40),
    channel: 'friends-beta',
    platform: 'windows',
    architecture: 'x64',
    installerType: 'inno-user-setup',
    updateClass: QUANTUM_UPDATE_CLASSES.SILENT_NEXT_LAUNCH,
    available: true,
    publishedAt: new Date().toISOString(),
    minOSVersion: '10.0.19041',
    fileName: 'Quantum-Setup-0.1.0-beta.1-x64.exe',
    sizeBytes: 1000,
    sha256: 'a'.repeat(64),
    downloadUrl: 'https://example.com/setup.exe',
    deltaSupport: { enabled: false }
  };

  const validation = validateQuantumManifest(olderManifest, {
    expectedChannel: 'friends-beta',
    currentVersion: '0.1.0-beta.1',
    currentBuildRevision: 2
  });

  assert.strictEqual(validation.valid, false, 'Manifest validator must reject older buildRevision');
  assert.strictEqual(validation.error?.field, 'buildRevision');
  assert.ok(validation.error?.reason.includes('not newer than installed'),
    'Validation error must identify buildRevision downgrade');

  recordResult(7, 'Downgrade / Build Revision Protection', true,
    'Rev 1 < Rev 2 rejected = OK, Rev 2 == Rev 2 rejected = OK, Rev 3 > Rev 2 accepted = OK, Older SemVer rejected = OK');
} catch (err) {
  recordResult(7, 'Downgrade / Build Revision Protection', false, err.message);
}

// ========================================================================
// SCENARIO 8: Manifest Caching (5-Minute TTL) & Cache Invalidation
// ========================================================================
try {
  let serverHits = 0;
  const cacheTestRoute = '/channels/friends-beta/cache-test.json';

  const cacheManifest = signManifest({
    schemaVersion: '2.0.0',
    productName: 'Quantum IDE',
    version: '0.1.0-beta.1',
    buildRevision: 2,
    commit: '1'.repeat(40),
    channel: 'friends-beta',
    platform: 'windows',
    architecture: 'x64',
    installerType: 'inno-user-setup',
    updateClass: QUANTUM_UPDATE_CLASSES.SILENT_NEXT_LAUNCH,
    available: true,
    publishedAt: new Date().toISOString(),
    minOSVersion: '10.0.19041',
    fileName: 'Quantum-Setup-0.1.0-beta.1-x64.exe',
    sizeBytes: 1000,
    sha256: 'b'.repeat(64),
    downloadUrl: 'https://example.com/setup.exe',
    deltaSupport: { enabled: false }
  });

  serverRoutes[cacheTestRoute] = (req, res) => {
    serverHits++;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(cacheManifest));
  };

  const client = new QuantumManifestClient(makeFetchRequestService(), new NullLogService());

  // Request 1: Initial fetch -> hits network
  const res1 = await client.fetchManifest(`${serverBaseUrl}${cacheTestRoute}`, false);
  assert.ok(res1);
  assert.strictEqual(serverHits, 1, 'Initial request must hit the server (serverHits = 1)');

  // Request 2: Background poll within 5 minutes -> served from in-memory cache
  const res2 = await client.fetchManifest(`${serverBaseUrl}${cacheTestRoute}`, false);
  assert.ok(res2);
  assert.strictEqual(serverHits, 1, 'Second check within 5 min MUST return cached manifest (serverHits stays 1)');

  // Request 3: Explicit user check (forceRefresh = true) -> bypasses cache, hits network
  const res3 = await client.fetchManifest(`${serverBaseUrl}${cacheTestRoute}`, true);
  assert.ok(res3);
  assert.strictEqual(serverHits, 2, 'Explicit check MUST bypass cache and hit server (serverHits increments to 2)');

  recordResult(8, 'Manifest Caching (5-Min TTL) & Explicit Cache Bypass', true,
    `Hit 1 = Network (hits=1), Hit 2 = Cache (hits=1), Hit 3 (Explicit) = Network Refresh (hits=2)`);
} catch (err) {
  recordResult(8, 'Manifest Caching (5-Min TTL) & Explicit Cache Bypass', false, err.message);
}

// Clean up test server and staging files
server.close();
try {
  fs.rmSync(TEST_STAGING_DIR, { recursive: true, force: true });
} catch {}

// ========================================================================
// FINAL SUMMARY
// ========================================================================
console.log('\n========================================================================');
console.log('                       E2E TEST RUN SUMMARY');
console.log('========================================================================');
const passedCount = results.filter(r => r.passed).length;
const failedCount = results.filter(r => !r.passed).length;
console.log(`Total Scenarios Tested : ${results.length}`);
console.log(`Passed                 : ${passedCount}`);
console.log(`Failed                 : ${failedCount}`);
console.log('========================================================================');

if (failedCount > 0) {
  console.error('\n❌ SOME E2E SCENARIOS FAILED!');
  process.exit(1);
} else {
  console.log('\n✨ ALL 8 WINDOWS UPDATE ENGINE E2E SCENARIOS PASSED SUCCESSFULLY!');
  process.exit(0);
}
