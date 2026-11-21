'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const dgram = require('dgram');
const http = require('http');
const crypto = require('crypto');
const assert = require('assert');
const WebSocket = require('ws');

const { TwinSyncDatabase } = require('../database');
const { MeshNetwork } = require('../meshNetwork');
const { SandboxManager } = require('../sandboxManager');
const { MobileServer } = require('../mobileServer');

const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RECOVERY_KEY_RE = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/;
const RECOVERY_CODE_RE = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getFreeUdpPort() {
  return new Promise((resolve, reject) => {
    const sock = dgram.createSocket('udp4');
    sock.once('error', reject);
    sock.bind(0, () => {
      const port = sock.address().port;
      sock.close(() => resolve(port));
    });
  });
}

async function waitFor(fn, { timeoutMs = 10000, intervalMs = 50, desc = 'condition' } = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastErr = null;
  while (Date.now() < deadline) {
    try {
      const val = await fn();
      if (val) return val;
    } catch (err) {
      lastErr = err;
    }
    await sleep(intervalMs);
  }
  throw new Error(`Timed out waiting for: ${desc}${lastErr ? ` (last error: ${lastErr.message})` : ''}`);
}

function createTempVault(tag) {
  const vaultRoot = fs.mkdtempSync(path.join(os.tmpdir(), `wm_int_${tag}_`));
  const vaultPaths = {
    vaultRoot,
    filesDir: path.join(vaultRoot, 'files'),
    trashDir: path.join(vaultRoot, '.trash'),
    chatBlobsDir: path.join(vaultRoot, '.chat_blobs'),
    metaDir: path.join(vaultRoot, '.meta'),
    stagingDir: path.join(vaultRoot, '.meta', 'staging'),
  };
  for (const dir of Object.values(vaultPaths)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return vaultPaths;
}

function sha256Buffer(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function sha256File(filePath) {
  return sha256Buffer(fs.readFileSync(filePath));
}

function httpRequest(port, method, urlPath, { token = null, body = null, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const reqHeaders = { ...headers };
    if (token) {
      reqHeaders.Authorization = `Bearer ${token}`;
    }
    let payloadStr = null;
    if (body !== null && body !== undefined) {
      payloadStr = typeof body === 'string' ? body : JSON.stringify(body);
      if (!reqHeaders['Content-Type']) {
        reqHeaders['Content-Type'] = 'application/json';
      }
      reqHeaders['Content-Length'] = Buffer.byteLength(payloadStr);
    }

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: urlPath,
        method,
        headers: reqHeaders,
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          let data = raw;
          try {
            data = JSON.parse(raw);
          } catch (_) {}
          resolve({ status: res.statusCode, headers: res.headers, data, raw });
        });
      }
    );
    req.on('error', reject);
    if (payloadStr !== null) {
      req.write(payloadStr);
    }
    req.end();
  });
}

async function runTests() {
  const tempWorkDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wm_int_fixtures_'));
  const vaultA = createTempVault('peerA');
  const vaultB = createTempVault('peerB');

  const openedPathsA = [];
  const openedPathsB = [];

  const dbA = new TwinSyncDatabase(path.join(vaultA.metaDir, 'twinsync.db'));
  const dbB = new TwinSyncDatabase(path.join(vaultB.metaDir, 'twinsync.db'));

  let meshA = null;
  let meshB = null;
  let sandboxA = null;
  let sandboxB = null;
  let mobileA = null;
  let mobileB = null;
  let mobilePortA = 0;
  let mobilePortB = 0;

  const unlockedA = new Set();
  const unlockedB = new Set();

  let passed = 0;
  const runStep = async (name, fn) => {
    process.stdout.write(`  [TEST] ${name} ... `);
    await fn();
    passed += 1;
    process.stdout.write('PASS\n');
  };

  try {
    let idA;
    let idB;
    let sharedUdpPort;

    // -------------------------------------------------------------------------
    // 1. Onboarding & Profile Broadcast
    // -------------------------------------------------------------------------
    await runStep('1. Onboarding (UUID v4, 12-char Master Key, Security Q&A) & Profile Broadcast', async () => {
      const initA = dbA.ensureIdentity();
      const initB = dbB.ensureIdentity();

      assert(UUID_V4_RE.test(initA.uuid), 'Peer A UUID must be valid v4');
      assert(UUID_V4_RE.test(initB.uuid), 'Peer B UUID must be valid v4');
      assert.notStrictEqual(initA.uuid, initB.uuid, 'Peer UUIDs must be unique');
      assert(RECOVERY_KEY_RE.test(initA.master_recovery_key), 'Peer A Master Recovery Key must match XXXX-XXXX-XXXX');
      assert(RECOVERY_KEY_RE.test(initB.master_recovery_key), 'Peer B Master Recovery Key must match XXXX-XXXX-XXXX');

      idA = dbA.completeOnboarding({
        displayName: 'Alice',
        avatarData: 'data:image/png;base64,QUFB',
        securityQuestion: 'First pet?',
        securityAnswer: 'Fluffy',
      });
      idB = dbB.completeOnboarding({
        displayName: 'Bob',
        avatarData: 'data:image/png;base64,QkJC',
        securityQuestion: 'Birth city?',
        securityAnswer: 'Cairo',
      });

      assert.strictEqual(idA.onboarded, true);
      assert.strictEqual(idB.onboarded, true);
      assert.strictEqual(idA.display_name, 'Alice');
      assert.strictEqual(idB.display_name, 'Bob');

      sharedUdpPort = await getFreeUdpPort();

      meshA = new MeshNetwork({
        db: dbA,
        vaultPaths: vaultA,
        udpPort: sharedUdpPort,
        wsPort: 0,
        broadcastAddresses: ['127.0.0.1'],
        discoveryIntervalMs: 250,
      });
      await meshA.start();

      meshB = new MeshNetwork({
        db: dbB,
        vaultPaths: vaultB,
        udpPort: sharedUdpPort,
        wsPort: 0,
        broadcastAddresses: ['127.0.0.1'],
        discoveryIntervalMs: 250,
      });
      await meshB.start();

      sandboxA = new SandboxManager({
        db: dbA,
        meshNetwork: meshA,
        vaultPaths: vaultA,
        openPathFn: async (p) => {
          openedPathsA.push(p);
          return '';
        },
      });
      sandboxB = new SandboxManager({
        db: dbB,
        meshNetwork: meshB,
        vaultPaths: vaultB,
        openPathFn: async (p) => {
          openedPathsB.push(p);
          return '';
        },
      });

      meshA.on('vault:remote-updated', (payload) => {
        if (payload?.relPath) sandboxA.onRemoteFileUpdated(payload.relPath, payload.editorName || 'Peer');
      });
      meshB.on('vault:remote-updated', (payload) => {
        if (payload?.relPath) sandboxB.onRemoteFileUpdated(payload.relPath, payload.editorName || 'Peer');
      });

      await waitFor(
        () => meshA.getStatus().onlineCount >= 1 && meshB.getStatus().onlineCount >= 1,
        { desc: 'initial UDP discovery & WS mesh connection' }
      );

      const peerAOnB = await waitFor(() => {
        const p = dbB.getPeer(idA.uuid);
        return p && p.security_question === 'First pet?' && p.recovery_key_hash ? p : null;
      }, { desc: 'Peer A identity & recovery hashes synced to Peer B' });

      assert.strictEqual(peerAOnB.display_name, 'Alice');
      assert.strictEqual(peerAOnB.avatar_data, 'data:image/png;base64,QUFB');
      assert.strictEqual(peerAOnB.master_recovery_key, undefined, 'Raw Master Recovery Key must never be broadcast');

      // Profile update live broadcast
      dbA.updateProfile({ displayName: 'Alice Prime', avatarData: 'data:image/png;base64,Q0ND' });
      meshA.broadcastProfileUpdate();

      await waitFor(() => {
        const p = dbB.getPeer(idA.uuid);
        return p && p.display_name === 'Alice Prime' && p.avatar_data === 'data:image/png;base64,Q0ND';
      }, { desc: 'profile update propagated to Peer B' });

      // Restore friendly name for subsequent readable tests
      dbA.updateProfile({ displayName: 'Alice' });
      meshA.broadcastProfileUpdate();
      await waitFor(() => dbB.getPeer(idA.uuid)?.display_name === 'Alice', { desc: 'Alice name restored' });
    });

    // -------------------------------------------------------------------------
    // 2. UDP Discovery + WS Mesh + UUID Persistence Across IP/Port Change
    // -------------------------------------------------------------------------
    let dmConv;
    await runStep('2. UDP Discovery + WS Mesh + UUID identity persistence across IP/port change', async () => {
      dmConv = dbA.ensureDmConversation(idA.uuid, idB.uuid);
      const oldWsPortB = meshB.wsPort;

      await meshB.stop();
      await waitFor(
        () => meshA.getStatus().onlineCount === 0 && dbA.getPeer(idB.uuid)?.status === 'offline',
        { desc: 'Peer A detects Peer B offline' }
      );

      // Simulate stale IP/port stored on Peer A before Peer B returns from a new endpoint
      dbA.upsertPeer({ uuid: idB.uuid, ip: '10.99.99.99', ws_port: 59999, status: 'offline' });

      await meshB.start();
      const newWsPortB = meshB.wsPort;
      assert(newWsPortB > 0, 'New ephemeral WS port should be assigned');

      await waitFor(
        () => meshA.getStatus().onlineCount >= 1 && meshB.getStatus().onlineCount >= 1,
        { desc: 're-discovery and WS reconnect after endpoint change' }
      );

      const peerBOnA = await waitFor(() => {
        const p = dbA.getPeer(idB.uuid);
        return p && p.ws_port === newWsPortB && p.status === 'online' ? p : null;
      }, { desc: 'Peer A updated Peer B IP/port while preserving UUID' });

      assert.strictEqual(peerBOnA.ip, '127.0.0.1');
      assert.strictEqual(dbA.getPeers().length, 1, 'No duplicate peer row should be created');
      assert(dbA.getConversation(dmConv.id), 'Existing DM conversation preserved across IP/port change');
      assert(oldWsPortB !== newWsPortB || peerBOnA.ip === '127.0.0.1');
    });

    // -------------------------------------------------------------------------
    // 3. DM & Group, Universal Reply (attachment + deep-link), Edit, Delete, Reactions, Read Receipts
    // -------------------------------------------------------------------------
    await runStep('3. DM & Group, Universal Reply, Edit, Delete, Reactions, Read Receipts', async () => {
      // Text DM
      const msg1 = meshA.sendChatMessage({
        conversationId: dmConv.id,
        type: 'text',
        body: 'Hello Bob!',
      });

      await waitFor(() => dbB.getMessageById(msg1.id), { desc: 'Peer B receives text message' });
      await waitFor(
        () => dbA.getMessageById(msg1.id)?.receiptStatus === 'delivered',
        { desc: 'Peer A receives delivered receipt' }
      );

      // Attachment message + Deep-link message for Universal Reply
      const sampleAttachPath = path.join(tempWorkDir, 'brief.txt');
      fs.writeFileSync(sampleAttachPath, 'Project brief details');
      const attMeta = await sandboxA.prepareDirectChatAttachment(sampleAttachPath);
      const msgFile = meshA.sendChatMessage({
        conversationId: dmConv.id,
        type: 'file',
        body: 'See brief',
        attachment: attMeta,
      });
      const msgLink = meshA.sendChatMessage({
        conversationId: dmConv.id,
        type: 'vault_link',
        body: 'Vault deep link',
        vault_link_path: 'Shared/Guide.txt',
        vault_link_is_dir: false,
      });
      const msgToDelete = meshA.sendChatMessage({
        conversationId: dmConv.id,
        type: 'text',
        body: 'Temporary message to delete',
      });

      await waitFor(
        () => dbB.getMessageById(msgFile.id) && dbB.getMessageById(msgLink.id) && dbB.getMessageById(msgToDelete.id),
        { desc: 'Peer B receives attachment, vault link, and deletable message' }
      );

      // Universal Reply to attachment AND to vault deep link
      const replyToFile = meshB.sendChatMessage({
        conversationId: dmConv.id,
        type: 'text',
        body: 'Received brief!',
        replyToId: msgFile.id,
      });
      const replyToLink = meshB.sendChatMessage({
        conversationId: dmConv.id,
        type: 'text',
        body: 'Opening vault link!',
        replyToId: msgLink.id,
      });

      const hydratedFileReplyA = await waitFor(() => dbA.getMessageById(replyToFile.id), { desc: 'reply to file synced to A' });
      const hydratedLinkReplyA = await waitFor(() => dbA.getMessageById(replyToLink.id), { desc: 'reply to deep-link synced to A' });
      assert.strictEqual(hydratedFileReplyA.replyTo.id, msgFile.id);
      assert.strictEqual(hydratedFileReplyA.replyTo.attachment.originalName, 'brief.txt');
      assert.strictEqual(hydratedLinkReplyA.replyTo.id, msgLink.id);
      assert.strictEqual(hydratedLinkReplyA.replyTo.vault_link_path, 'Shared/Guide.txt');

      // Edit & Soft Delete
      meshA.editChatMessage(msg1.id, 'Hello Bob (edited)');
      await waitFor(
        () => dbB.getMessageById(msg1.id)?.body === 'Hello Bob (edited)' && Boolean(dbB.getMessageById(msg1.id)?.edited_at),
        { desc: 'edited message synced to B' }
      );

      meshA.deleteChatMessage(msgToDelete.id);
      await waitFor(
        () => Boolean(dbB.getMessageById(msgToDelete.id)?.deleted_at) && dbB.getMessageById(msgToDelete.id)?.body === '',
        { desc: 'soft delete synced to B' }
      );

      // Reactions
      meshB.toggleReaction(msg1.id, '👍');
      await waitFor(
        () => dbA.getMessageById(msg1.id)?.reactions?.some((r) => r.peer_uuid === idB.uuid && r.emoji === '👍'),
        { desc: 'reaction added synced to A' }
      );
      meshB.toggleReaction(msg1.id, '👍');
      await waitFor(
        () => dbA.getMessageById(msg1.id)?.reactions?.length === 0,
        { desc: 'reaction toggled off synced to A' }
      );

      // Read Receipts
      meshB.markConversationRead(dmConv.id);
      await waitFor(
        () => dbA.getMessageById(msg1.id)?.receiptStatus === 'read',
        { desc: 'read receipt upgraded on A' }
      );

      // Group Creation
      const groupConv = meshA.createGroup({
        name: 'Engineering Core',
        memberUuids: [idB.uuid],
      });
      await waitFor(
        () => dbB.getConversation(groupConv.id),
        { desc: 'Group synced to Peer B' }
      );
      const groupMsg = meshB.sendChatMessage({
        conversationId: groupConv.id,
        type: 'text',
        body: 'Welcome to Engineering Core!',
      });
      await waitFor(() => dbA.getMessageById(groupMsg.id), { desc: 'Group message delivered to A' });
    });

    // -------------------------------------------------------------------------
    // 4. Offline-First & Delta Sync + 64KB Chunked Transfer
    // -------------------------------------------------------------------------
    await runStep('4. Offline-First & Delta Sync (missed messages + >64KB file via Chunked Transfer)', async () => {
      await meshB.stop();
      await waitFor(() => meshA.getStatus().onlineCount === 0, { desc: 'Peer B offline' });

      const offlineMsg = meshA.sendChatMessage({
        conversationId: dmConv.id,
        type: 'text',
        body: 'Missed message while offline',
      });

      meshA.createFolder('', 'Shared', idA.uuid, unlockedA);
      const bigPayload = Buffer.from('WORKMESH_CHUNK_TEST_'.repeat(5000), 'utf8'); // ~100KB (>64KB)
      const bigSrcPath = path.join(tempWorkDir, 'OfflineBigReport.txt');
      fs.writeFileSync(bigSrcPath, bigPayload);
      const importRes = await sandboxA.importOsPathsToVault([bigSrcPath], 'Shared', 'overwrite', idA.uuid, unlockedA);
      assert.strictEqual(importRes.ok, true);

      let progressSeen = false;
      const onProgress = (ev) => {
        if (ev && ev.relPath === 'Shared/OfflineBigReport.txt') progressSeen = true;
      };
      meshB.on('transfer:progress', onProgress);

      await meshB.start();
      await waitFor(() => meshA.getStatus().onlineCount >= 1 && meshB.getStatus().onlineCount >= 1, {
        desc: 'Peer B reconnected',
      });

      const pulledMsg = await waitFor(() => dbB.getMessageById(offlineMsg.id), {
        desc: 'missed offline message pulled via Delta Sync',
      });
      assert.strictEqual(pulledMsg.body, 'Missed message while offline');

      const destBigOnB = path.join(vaultB.filesDir, 'Shared', 'OfflineBigReport.txt');
      await waitFor(
        () => fs.existsSync(destBigOnB) && sha256File(destBigOnB) === sha256Buffer(bigPayload),
        { desc: 'offline Vault file pulled via Chunked Transfer with exact SHA-256' }
      );
      assert.strictEqual(progressSeen, true, 'transfer:progress event emitted during chunked transfer');
      meshB.removeListener('transfer:progress', onProgress);
    });

    // -------------------------------------------------------------------------
    // 5. Direct Folder Attachment -> Chunked Transfer -> Quick Preview + Save to PC + Save to Vault
    // -------------------------------------------------------------------------
    let folderAttForMobileTest;
    await runStep('5. Direct Folder Attachment (auto-zip, chunk transfer, Quick Preview, Save to PC & Vault)', async () => {
      const srcPackDir = path.join(tempWorkDir, 'DesignAssets');
      fs.mkdirSync(path.join(srcPackDir, 'icons'), { recursive: true });
      fs.writeFileSync(path.join(srcPackDir, 'notes.txt'), 'Pack readme v1');
      fs.writeFileSync(path.join(srcPackDir, 'icons', 'logo.svg'), '<svg></svg>');

      const folderAtt = await sandboxA.prepareDirectChatAttachment(srcPackDir);
      folderAttForMobileTest = folderAtt;
      assert.strictEqual(folderAtt.isFolder, true);
      assert.strictEqual(folderAtt.entryCount, 2);
      assert(folderAtt.fileName.endsWith('.zip'));

      const folderMsg = meshA.sendChatMessage({
        conversationId: dmConv.id,
        type: 'folder',
        body: 'Print these 5 copies',
        attachment: folderAtt,
      });

      await waitFor(() => dbB.getMessageById(folderMsg.id), { desc: 'Peer B receives folder chat message' });
      const localBlobPath = await meshB.ensureChatBlobAvailable(folderAtt.blobId, folderAtt.fileName, idA.uuid);
      assert(fs.existsSync(localBlobPath), 'Zipped folder blob transferred to Peer B');

      // Quick Folder Preview
      const preview = await sandboxB.openChatAttachment(folderAtt);
      assert.strictEqual(preview.ok, true);
      assert.strictEqual(preview.isFolder, true);
      assert(preview.entries.some((e) => e.relPath === 'notes.txt' && !e.isDir));
      assert(preview.entries.some((e) => e.relPath === 'icons/logo.svg' && !e.isDir));

      const beforeOpenCount = openedPathsB.length;
      const entryRes = await sandboxB.openExtractedFolderEntry(preview.sessionId, 'icons/logo.svg');
      assert.strictEqual(entryRes.ok, true);
      assert.strictEqual(openedPathsB.length, beforeOpenCount + 1);
      assert.strictEqual(path.basename(openedPathsB[openedPathsB.length - 1]), 'logo.svg');
      await sandboxB.closeSession(preview.sessionId);

      // Save to PC
      const pcSaveDir = path.join(tempWorkDir, 'SavedToPcFolder');
      const savePcRes = await sandboxB.saveChatAttachmentToDisk(folderAtt, pcSaveDir);
      assert.strictEqual(savePcRes.ok, true);
      assert.strictEqual(fs.readFileSync(path.join(pcSaveDir, 'notes.txt'), 'utf8'), 'Pack readme v1');
      assert.strictEqual(fs.readFileSync(path.join(pcSaveDir, 'icons', 'logo.svg'), 'utf8'), '<svg></svg>');

      // Save to Vault
      meshB.createFolder('', 'ReceivedPacks', idB.uuid, unlockedB);
      const saveVaultRes = await sandboxB.saveChatAttachmentToVault(
        folderAtt,
        'ReceivedPacks',
        'keep_both',
        idB.uuid,
        unlockedB
      );
      assert.strictEqual(saveVaultRes.ok, true);
      assert(
        fs.existsSync(path.join(vaultB.filesDir, 'ReceivedPacks', 'DesignAssets', 'notes.txt')),
        'Folder extracted cleanly into Peer B Vault'
      );
      await waitFor(
        () => dbA.getVaultNode('ReceivedPacks/DesignAssets/icons/logo.svg'),
        { desc: 'Saved folder in Vault synced to Peer A' }
      );
    });

    // -------------------------------------------------------------------------
    // 6. Smart Vault-to-Chat Sharing of Protected File (Deep-Link vs Independent Copy)
    // -------------------------------------------------------------------------
    await runStep('6. Smart Vault-to-Chat Sharing (Deep-Link enforces ACL vs Independent Chat Copy)', async () => {
      meshA.createFolder('', 'Finance', idA.uuid, unlockedA);
      meshA.updateFolderPermissions(
        'Finance',
        { permMode: 'private', password: 'fin-password-99' },
        idA.uuid
      );
      meshA.createFolder('Finance', 'Q4', idA.uuid, unlockedA);

      const salariesSrc = path.join(tempWorkDir, 'Salaries.xlsx');
      fs.writeFileSync(salariesSrc, 'CONFIDENTIAL_Q4_SALARIES_DATA');
      const imp = await sandboxA.importOsPathsToVault([salariesSrc], 'Finance/Q4', 'overwrite', idA.uuid, unlockedA);
      assert.strictEqual(imp.ok, true);

      await waitFor(
        () =>
          dbB.getVaultNode('Finance/Q4/Salaries.xlsx') &&
          fs.existsSync(path.join(vaultB.filesDir, 'Finance', 'Q4', 'Salaries.xlsx')),
        { desc: 'Protected /Finance/Q4/Salaries.xlsx synced to Peer B storage' }
      );

      // Deep-link share -> Peer B without unlocking /Finance is blocked
      const linkMsg = meshA.sendChatMessage({
        conversationId: dmConv.id,
        type: 'vault_link',
        body: 'Protected link',
        vault_link_path: 'Finance/Q4/Salaries.xlsx',
        vault_link_is_dir: false,
      });
      await waitFor(() => dbB.getMessageById(linkMsg.id), { desc: 'Peer B receives vault deep-link' });

      const lockedOpen = await sandboxB.openVaultFile('Finance/Q4/Salaries.xlsx', {
        actorUuid: idB.uuid,
        unlockedSet: new Set(),
      });
      assert.strictEqual(lockedOpen.ok, false);
      assert.strictEqual(lockedOpen.code, 'LOCKED');
      assert.strictEqual(lockedOpen.blockingAncestor.relPath, 'Finance');

      // Independent Chat Copy -> Peer B opens without unlocking /Finance!
      const copyAtt = await sandboxA.prepareIndependentVaultCopyForChat(
        'Finance/Q4/Salaries.xlsx',
        idA.uuid,
        unlockedA
      );
      assert.strictEqual(copyAtt.ok, true);

      const copyMsg = meshA.sendChatMessage({
        conversationId: dmConv.id,
        type: 'file',
        body: 'Independent copy for everyone',
        attachment: copyAtt,
      });
      await waitFor(() => dbB.getMessageById(copyMsg.id), { desc: 'Peer B receives independent chat copy' });
      await meshB.ensureChatBlobAvailable(copyAtt.blobId, copyAtt.fileName, idA.uuid);

      const openCopyRes = await sandboxB.openChatAttachment(copyAtt);
      assert.strictEqual(openCopyRes.ok, true);
      assert.strictEqual(openCopyRes.fileName, 'Salaries.xlsx');
      const copiedDiskPath = path.join(openCopyRes.tempDir, openCopyRes.fileName);
      assert.strictEqual(fs.readFileSync(copiedDiskPath, 'utf8'), 'CONFIDENTIAL_Q4_SALARIES_DATA');
      fs.rmSync(openCopyRes.tempDir, { recursive: true, force: true });
    });

    // -------------------------------------------------------------------------
    // 7. Temp Shadow Sandbox (wm_XXXX, Read-Only, Ctrl+S Atomic Safe Replace)
    // -------------------------------------------------------------------------
    await runStep('7. Temp Shadow Sandbox (wm_XXXX filename preservation, Read-Only, Ctrl+S Atomic Safe Replace)', async () => {
      const contractSrc = path.join(tempWorkDir, 'Contract.txt');
      fs.writeFileSync(contractSrc, 'Contract v1');
      await sandboxA.importOsPathsToVault([contractSrc], 'Shared', 'overwrite', idA.uuid, unlockedA);

      await waitFor(
        () => fs.existsSync(path.join(vaultB.filesDir, 'Shared', 'Contract.txt')),
        { desc: 'Shared/Contract.txt synced to Peer B' }
      );

      // View mode (OS Read-Only)
      const viewSess = await sandboxB.openVaultFile('Shared/Contract.txt', {
        actorUuid: idB.uuid,
        forceReadOnly: true,
      });
      assert.strictEqual(viewSess.ok, true);
      assert.strictEqual(viewSess.mode, 'view');
      assert.strictEqual(viewSess.fileName, 'Contract.txt');
      assert(/^wm_[0-9a-f]{6}$/.test(path.basename(viewSess.tempDir)), 'Temp dir must match wm_XXXX');
      const viewTempFile = path.join(viewSess.tempDir, 'Contract.txt');
      assert.strictEqual(openedPathsB[openedPathsB.length - 1], viewTempFile);
      assert.strictEqual(fs.statSync(viewTempFile).mode & 0o222, 0, 'View sandbox file must be OS Read-Only');
      await sandboxB.closeSession(viewSess.sessionId);
      assert(!fs.existsSync(viewSess.tempDir), 'Temp sandbox dir cleaned up after close');

      // Edit mode + Ctrl+S Atomic Safe Replace
      const editSess = await sandboxA.openVaultFile('Shared/Contract.txt', { actorUuid: idA.uuid });
      assert.strictEqual(editSess.ok, true);
      assert.strictEqual(editSess.mode, 'edit');
      const editTempFile = path.join(editSess.tempDir, 'Contract.txt');

      let savedEventFired = false;
      sandboxA.once('sandbox:saved', (ev) => {
        if (ev.relPath === 'Shared/Contract.txt') savedEventFired = true;
      });

      fs.writeFileSync(editTempFile, 'Contract v2 from Ctrl+S');
      await waitFor(() => savedEventFired, { desc: 'Ctrl+S triggers sandbox:saved atomic replace' });

      assert.strictEqual(
        fs.readFileSync(path.join(vaultA.filesDir, 'Shared', 'Contract.txt'), 'utf8'),
        'Contract v2 from Ctrl+S'
      );

      await waitFor(
        () => fs.readFileSync(path.join(vaultB.filesDir, 'Shared', 'Contract.txt'), 'utf8') === 'Contract v2 from Ctrl+S',
        { desc: 'Updated Contract synced to Peer B' }
      );

      // Office-style atomic temp-rename save inside shadow sandbox
      let atomicSavedEvent = false;
      sandboxA.once('sandbox:saved', (ev) => {
        if (ev.relPath === 'Shared/Contract.txt') atomicSavedEvent = true;
      });
      const officeTmp = path.join(editSess.tempDir, 'Contract.tmp');
      fs.writeFileSync(officeTmp, 'Contract v3 from Office Rename');
      fs.renameSync(officeTmp, editTempFile);
      await waitFor(() => atomicSavedEvent, { desc: 'Atomic temp-rename triggers sandbox:saved' });
      await waitFor(
        () => fs.readFileSync(path.join(vaultB.filesDir, 'Shared', 'Contract.txt'), 'utf8') === 'Contract v3 from Office Rename',
        { desc: 'Office-renamed Contract synced to Peer B' }
      );

      await sandboxA.closeSession(editSess.sessionId);
    });

    // -------------------------------------------------------------------------
    // 8. Co-Editing Warning + Conflict Branching
    // -------------------------------------------------------------------------
    await runStep('8. Co-Editing Warning + Conflict Branching (نسخة متعارضة)', async () => {
      const coSrc = path.join(tempWorkDir, 'CoDoc.txt');
      fs.writeFileSync(coSrc, 'CoDoc Base v1');
      await sandboxA.importOsPathsToVault([coSrc], 'Shared', 'overwrite', idA.uuid, unlockedA);
      await waitFor(
        () =>
          dbB.getVaultNode('Shared/CoDoc.txt') &&
          fs.existsSync(path.join(vaultB.filesDir, 'Shared', 'CoDoc.txt')),
        { desc: 'Shared/CoDoc.txt synced to Peer B' }
      );

      const sessA = await sandboxA.openVaultFile('Shared/CoDoc.txt', { actorUuid: idA.uuid });
      assert.strictEqual(sessA.ok, true);

      await waitFor(
        () => meshB.getActiveEditors('Shared/CoDoc.txt', idB.uuid).length === 1,
        { desc: 'Peer B sees Peer A edit lock' }
      );

      // Peer B receives COEDIT_WARNING
      const warnRes = await sandboxB.openVaultFile('Shared/CoDoc.txt', { actorUuid: idB.uuid });
      assert.strictEqual(warnRes.ok, false);
      assert.strictEqual(warnRes.code, 'COEDIT_WARNING');
      assert.strictEqual(warnRes.editors.length, 1);

      // Peer B acknowledges co-edit warning
      const sessB = await sandboxB.openVaultFile('Shared/CoDoc.txt', {
        actorUuid: idB.uuid,
        acknowledgeCoEdit: true,
      });
      assert.strictEqual(sessB.ok, true);

      // Peer A saves first -> syncs to Peer B
      let remoteUpdatedOnB = false;
      sandboxB.once('sandbox:remote-updated', (ev) => {
        if (ev.relPath === 'Shared/CoDoc.txt') remoteUpdatedOnB = true;
      });
      fs.writeFileSync(path.join(sessA.tempDir, 'CoDoc.txt'), 'Alice edit v2');

      await waitFor(
        () =>
          remoteUpdatedOnB &&
          fs.readFileSync(path.join(vaultB.filesDir, 'Shared', 'CoDoc.txt'), 'utf8') === 'Alice edit v2',
        { desc: 'Alice edit synced to Peer B while Bob has file open' }
      );

      // Peer B saves against stale baseSha256 -> conflict branch created!
      let conflictEvent = null;
      sandboxB.once('sandbox:conflict-saved', (ev) => {
        conflictEvent = ev;
      });
      fs.writeFileSync(path.join(sessB.tempDir, 'CoDoc.txt'), 'Bob edit v2');

      await waitFor(() => conflictEvent, { desc: 'Conflict Branch created on Peer B' });
      assert(conflictEvent.fileName.includes('نسخة متعارضة'), 'Conflict file name must include نسخة متعارضة');

      const conflictDiskB = path.join(vaultB.filesDir, conflictEvent.conflictRelPath);
      const conflictDiskA = path.join(vaultA.filesDir, conflictEvent.conflictRelPath);
      assert.strictEqual(fs.readFileSync(conflictDiskB, 'utf8'), 'Bob edit v2');

      await waitFor(
        () => fs.existsSync(conflictDiskA) && fs.readFileSync(conflictDiskA, 'utf8') === 'Bob edit v2',
        { desc: 'Conflict branch synced to Peer A' }
      );
      assert.strictEqual(
        fs.readFileSync(path.join(vaultA.filesDir, 'Shared', 'CoDoc.txt'), 'utf8'),
        'Alice edit v2',
        'Original file preserves Alice edit'
      );

      await sandboxA.closeSession(sessA.sessionId);
      await sandboxB.closeSession(sessB.sessionId);
    });

    // -------------------------------------------------------------------------
    // 9. Live-Edit Guard (blocked under edit lock, allowed under view lock)
    // -------------------------------------------------------------------------
    await runStep('9. Live-Edit Guard (rename/move/delete blocked under edit lock, allowed under view lock)', async () => {
      const guardSrc = path.join(tempWorkDir, 'GuardFile.txt');
      fs.writeFileSync(guardSrc, 'Guard me');
      await sandboxA.importOsPathsToVault([guardSrc], 'Shared', 'overwrite', idA.uuid, unlockedA);
      await waitFor(() => dbB.getVaultNode('Shared/GuardFile.txt'), { desc: 'GuardFile synced to B' });

      const editSess = await sandboxA.openVaultFile('Shared/GuardFile.txt', { actorUuid: idA.uuid });
      await waitFor(() => meshB.getActiveEditors('Shared/GuardFile.txt', idB.uuid).length === 1, {
        desc: 'edit lock visible on Peer B',
      });

      assert.throws(
        () => meshB.renameNode('Shared/GuardFile.txt', 'GuardRenamed.txt', idB.uuid, unlockedB),
        (err) => err.code === 'FILE_LOCKED_LIVE_EDIT'
      );
      assert.throws(
        () => meshB.moveOrCopyNode('move', ['Shared/GuardFile.txt'], '', 'overwrite', idB.uuid, unlockedB),
        (err) => err.code === 'FILE_LOCKED_LIVE_EDIT'
      );
      assert.throws(
        () => meshB.deleteToTrash('Shared/GuardFile.txt', idB.uuid, unlockedB),
        (err) => err.code === 'FILE_LOCKED_LIVE_EDIT'
      );

      await sandboxA.closeSession(editSess.sessionId);
      await waitFor(() => meshB.getActiveEditors('Shared/GuardFile.txt', idB.uuid).length === 0, {
        desc: 'edit lock released on Peer B',
      });

      // Open in view-only lock -> rename/move/delete MUST be allowed!
      const viewSess = await sandboxA.openVaultFile('Shared/GuardFile.txt', {
        actorUuid: idA.uuid,
        forceReadOnly: true,
      });
      await waitFor(() => meshB.getFilePresence('Shared/GuardFile.txt').length === 1, {
        desc: 'view lock visible on Peer B',
      });

      const renamed = meshB.renameNode('Shared/GuardFile.txt', 'GuardRenamed.txt', idB.uuid, unlockedB);
      assert.strictEqual(renamed.rel_path, 'Shared/GuardRenamed.txt');

      const moved = meshB.moveOrCopyNode('move', ['Shared/GuardRenamed.txt'], '', 'overwrite', idB.uuid, unlockedB);
      assert.strictEqual(moved.ok, true);

      const trashed = meshB.deleteToTrash('GuardRenamed.txt', idB.uuid, unlockedB);
      assert.strictEqual(trashed.original_rel_path, 'GuardRenamed.txt');

      await sandboxA.closeSession(viewSess.sessionId);
    });

    // -------------------------------------------------------------------------
    // 10. Strict Ancestor ACL Inheritance & Tampered Remote Update Rejection
    // -------------------------------------------------------------------------
    await runStep('10. Strict Ancestor ACL Inheritance + Tampered Remote Write Rejection + Password Unlock', async () => {
      // Unauthorized Peer B (empty unlockedB)
      const listBlocked = meshB.listDirectory('Finance/Q4', idB.uuid, unlockedB);
      assert.strictEqual(listBlocked.ok, false);
      assert.strictEqual(listBlocked.locked, true);
      assert.strictEqual(listBlocked.blockingAncestor.relPath, 'Finance');

      const searchBlocked = meshB.searchVault('Salaries', idB.uuid, unlockedB);
      assert.strictEqual(
        searchBlocked.some((n) => n.rel_path.includes('Salaries')),
        false,
        'Search must hide protected descendants'
      );

      const openBlocked = await sandboxB.openVaultFile('Finance/Q4/Salaries.xlsx', {
        actorUuid: idB.uuid,
        unlockedSet: unlockedB,
      });
      assert.strictEqual(openBlocked.ok, false);
      assert.strictEqual(openBlocked.code, 'LOCKED');

      // Tampered remote VAULT_FILE_UPDATE sent directly from Peer B to Peer A must be REJECTED
      const beforeNodeA = dbA.getVaultNode('Finance/Q4/Salaries.xlsx');
      meshB.sendToPeer(idA.uuid, {
        type: 'VAULT_FILE_UPDATE',
        node: {
          rel_path: 'Finance/Q4/Salaries.xlsx',
          name: 'Salaries.xlsx',
          is_dir: false,
          size: 10,
          sha256: 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
          owner_uuid: idA.uuid,
          perm_mode: 'public',
          version: (beforeNodeA.version || 1) + 50,
          lamport_ts: dbB.nextLamportTs() + 500,
          updated_at: Date.now(),
        },
      });

      const rejectLog = await waitFor(
        () =>
          dbA
            .getAuditLogs({ targetPath: 'Finance/Q4/Salaries.xlsx', limit: 20 })
            .find((l) => l.event_type === 'remote_write_rejected'),
        { desc: 'Peer A rejects and audits tampered VAULT_FILE_UPDATE' }
      );
      assert(rejectLog);
      assert.strictEqual(
        fs.readFileSync(path.join(vaultA.filesDir, 'Finance', 'Q4', 'Salaries.xlsx'), 'utf8'),
        'CONFIDENTIAL_Q4_SALARIES_DATA'
      );
      assert.strictEqual(dbA.getVaultNode('Finance/Q4/Salaries.xlsx').version, beforeNodeA.version);

      // Password unlock grants full access
      const wrongUnlock = meshB.verifyAndUnlockFolder('Finance', 'wrong-pass', unlockedB);
      assert.strictEqual(wrongUnlock.ok, false);

      const goodUnlock = meshB.verifyAndUnlockFolder('Finance', 'fin-password-99', unlockedB);
      assert.strictEqual(goodUnlock.ok, true);

      const listAllowed = meshB.listDirectory('Finance/Q4', idB.uuid, unlockedB);
      assert.strictEqual(listAllowed.ok, true);
      assert(listAllowed.items.some((n) => n.rel_path === 'Finance/Q4/Salaries.xlsx'));

      const searchAllowed = meshB.searchVault('Salaries', idB.uuid, unlockedB);
      assert(searchAllowed.some((n) => n.rel_path === 'Finance/Q4/Salaries.xlsx'));

      const openAllowed = await sandboxB.openVaultFile('Finance/Q4/Salaries.xlsx', {
        actorUuid: idB.uuid,
        unlockedSet: unlockedB,
      });
      assert.strictEqual(openAllowed.ok, true);
      await sandboxB.closeSession(openAllowed.sessionId);
      unlockedB.clear();
    });

    // -------------------------------------------------------------------------
    // 11. Offline Password Recovery (Peer A offline -> Peer B recovers via Q&A AND Recovery Key)
    // -------------------------------------------------------------------------
    await runStep('11. Offline Password Recovery (Security Q&A + 12-char Master Recovery Key)', async () => {
      await meshA.stop();
      await waitFor(() => meshB.getStatus().onlineCount === 0, { desc: 'Peer A offline for recovery test' });

      const recInfo = meshB.getFolderRecoveryInfo('Finance');
      assert.strictEqual(recInfo.ownerUuid, idA.uuid);
      assert.strictEqual(recInfo.securityQuestion, 'First pet?');
      assert.strictEqual(recInfo.hasSecurityQA, true);
      assert.strictEqual(recInfo.hasRecoveryKey, true);
      assert.strictEqual(recInfo.isLocalOwner, false);

      const badQa = meshB.recoverFolderPassword('Finance', {
        method: 'security_qa',
        answerOrKey: 'WrongAnswer',
        newPassword: 'pw1',
      });
      assert.strictEqual(badQa.ok, false);

      // Recover offline via Security Q&A
      const recQa = meshB.recoverFolderPassword('Finance', {
        method: 'security_qa',
        answerOrKey: '  fluffy ',
        newPassword: 'recovered-qa-password',
      });
      assert.strictEqual(recQa.ok, true);
      assert.strictEqual(meshB.verifyAndUnlockFolder('Finance', 'fin-password-99', new Set()).ok, false);
      assert.strictEqual(meshB.verifyAndUnlockFolder('Finance', 'recovered-qa-password', new Set()).ok, true);

      // Recover offline via 12-char Master Recovery Key
      const recKey = meshB.recoverFolderPassword('Finance', {
        method: 'recovery_key',
        answerOrKey: idA.master_recovery_key.toLowerCase(),
        newPassword: 'recovered-key-password',
      });
      assert.strictEqual(recKey.ok, true);
      assert.strictEqual(meshB.verifyAndUnlockFolder('Finance', 'recovered-qa-password', new Set()).ok, false);
      assert.strictEqual(meshB.verifyAndUnlockFolder('Finance', 'recovered-key-password', new Set()).ok, true);

      await meshA.start();
      await waitFor(() => meshA.getStatus().onlineCount >= 1 && meshB.getStatus().onlineCount >= 1, {
        desc: 'Peer A back online',
      });
    });

    // -------------------------------------------------------------------------
    // 12. Effective-ACL Isolated Trash
    // -------------------------------------------------------------------------
    await runStep('12. Effective-ACL Isolated Trash (hidden from unauthorized, non-owner denied, owner succeeds)', async () => {
      const trashItem = meshA.deleteToTrash('Finance/Q4/Salaries.xlsx', idA.uuid, unlockedA);
      assert.strictEqual(trashItem.original_rel_path, 'Finance/Q4/Salaries.xlsx');

      await waitFor(
        () => dbB.getTrashItem(trashItem.id) && !dbB.getVaultNode('Finance/Q4/Salaries.xlsx'),
        { desc: 'Trashed item synced to Peer B' }
      );

      // Unauthorized Peer B cannot see it in Trash
      const visibleEmpty = meshB.listTrash(idB.uuid, new Set());
      assert.strictEqual(
        visibleEmpty.some((t) => t.id === trashItem.id),
        false,
        'Unauthorized peer must not see protected Trash item'
      );

      // Non-owner Peer B denied Restore and Delete Forever
      assert.throws(
        () => meshB.restoreFromTrash(trashItem.id, idB.uuid),
        (err) => err.code === 'FORBIDDEN'
      );
      assert.throws(
        () => meshB.deleteTrashForever(trashItem.id, idB.uuid),
        (err) => err.code === 'FORBIDDEN'
      );

      // Owner Peer A restores successfully
      const restoreRes = meshA.restoreFromTrash(trashItem.id, idA.uuid);
      assert.strictEqual(restoreRes.ok, true);
      assert.strictEqual(restoreRes.restoredPath, 'Finance/Q4/Salaries.xlsx');
      await waitFor(
        () =>
          dbB.getVaultNode('Finance/Q4/Salaries.xlsx') &&
          fs.existsSync(path.join(vaultB.filesDir, 'Finance', 'Q4', 'Salaries.xlsx')),
        { desc: 'Restored Salaries.xlsx synced back to Peer B' }
      );

      // Owner Peer A deletes again and permanently purges
      const trashItem2 = meshA.deleteToTrash('Finance/Q4/Salaries.xlsx', idA.uuid, unlockedA);
      await waitFor(() => dbB.getTrashItem(trashItem2.id), { desc: 'Second trash item synced to B' });

      const purgeRes = meshA.deleteTrashForever(trashItem2.id, idA.uuid);
      assert.strictEqual(purgeRes.ok, true);
      assert.strictEqual(dbA.getTrashItem(trashItem2.id), null);
      assert(!fs.existsSync(path.join(vaultA.trashDir, trashItem2.id)));
      await waitFor(() => dbB.getTrashItem(trashItem2.id) === null, { desc: 'Trash purge synced to Peer B' });
    });

    // -------------------------------------------------------------------------
    // 13. Mobile Companion (mobileServer.js)
    // -------------------------------------------------------------------------
    await runStep('13. Mobile Companion (QR, 401 auth, bootstrap, vault list/unlock, message, save-to-vault, WS push, rotateToken)', async () => {
      // Create a Peer-B-owned locked folder synced to Peer A so Peer A's MobileServer enforces lock -> unlock
      meshB.createFolder('', 'BoardPrivate', idB.uuid, unlockedB);
      meshB.updateFolderPermissions('BoardPrivate', { permMode: 'private', password: 'board-secret' }, idB.uuid);
      const boardDocSrc = path.join(tempWorkDir, 'BoardMinutes.txt');
      fs.writeFileSync(boardDocSrc, 'Board Q4 Minutes');
      await sandboxB.importOsPathsToVault([boardDocSrc], 'BoardPrivate', 'overwrite', idB.uuid, unlockedB);

      await waitFor(
        () =>
          dbA.getVaultNode('BoardPrivate/BoardMinutes.txt') &&
          fs.existsSync(path.join(vaultA.filesDir, 'BoardPrivate', 'BoardMinutes.txt')),
        { desc: 'Peer B private BoardPrivate synced to Peer A' }
      );

      mobileA = new MobileServer({
        db: dbA,
        meshNetwork: meshA,
        sandboxManager: sandboxA,
        vaultPaths: vaultA,
        port: 0,
      });
      const mobilePort = await mobileA.start();
      mobilePortA = mobilePort;

      // Pairing & QR
      const pairing = await mobileA.getPairingInfo();
      assert.strictEqual(pairing.ok, true);
      assert(pairing.qrDataUrl.startsWith('data:image/png;base64,'), 'QR data URL must be a valid PNG data URI');
      assert(pairing.primaryUrl.includes(`token=${mobileA.sessionToken}`));

      // Unauthenticated 401 rejections
      const unauthNoTok = await httpRequest(mobilePort, 'GET', '/api/bootstrap');
      assert.strictEqual(unauthNoTok.status, 401);
      const unauthBadTok = await httpRequest(mobilePort, 'GET', '/api/bootstrap', { token: 'invalid-token' });
      assert.strictEqual(unauthBadTok.status, 401);

      const badWsStatus = await new Promise((resolve) => {
        const wsBad = new WebSocket(`ws://127.0.0.1:${mobilePort}/ws?token=invalid-token`);
        wsBad.on('unexpected-response', (_req, res) => resolve(res.statusCode));
        wsBad.on('error', () => resolve(401));
      });
      assert.strictEqual(badWsStatus, 401);

      const tok = mobileA.sessionToken;

      // Authenticated /api/bootstrap
      const bootRes = await httpRequest(mobilePort, 'GET', '/api/bootstrap', { token: tok });
      assert.strictEqual(bootRes.status, 200);
      assert.strictEqual(bootRes.data.ok, true);
      assert.strictEqual(bootRes.data.identity.uuid, idA.uuid);
      assert(Array.isArray(bootRes.data.conversations));

      // Authenticated /api/vault/list & /api/vault/preview (locked before unlock) + /api/vault/unlock
      const lockedList = await httpRequest(mobilePort, 'GET', '/api/vault/list?path=BoardPrivate', { token: tok });
      assert.strictEqual(lockedList.status, 403);
      assert.strictEqual(lockedList.data.code, 'LOCKED');

      const lockedPreview = await httpRequest(mobilePort, 'GET', '/api/vault/preview?path=BoardPrivate/BoardMinutes.txt', { token: tok });
      assert.strictEqual(lockedPreview.status, 403);
      assert.strictEqual(lockedPreview.data.code, 'LOCKED');

      const unlockRes = await httpRequest(mobilePort, 'POST', '/api/vault/unlock', {
        token: tok,
        body: { relPath: 'BoardPrivate', password: 'board-secret' },
      });
      assert.strictEqual(unlockRes.status, 200);
      assert.strictEqual(unlockRes.data.ok, true);

      const unlockedList = await httpRequest(mobilePort, 'GET', '/api/vault/list?path=BoardPrivate', { token: tok });
      assert.strictEqual(unlockedList.status, 200);
      assert(unlockedList.data.items.some((i) => i.rel_path === 'BoardPrivate/BoardMinutes.txt'));

      const unlockedPreview = await httpRequest(mobilePort, 'GET', '/api/vault/preview?path=BoardPrivate/BoardMinutes.txt', { token: tok });
      assert.strictEqual(unlockedPreview.status, 200);
      assert.strictEqual(unlockedPreview.data.text, 'Board Q4 Minutes');

      // WebSocket live event push + send chat message
      const wsEvents = [];
      let wsClosedCode = null;
      const mobileWs = await new Promise((resolve, reject) => {
        const ws = new WebSocket(`ws://127.0.0.1:${mobilePort}/ws?token=${tok}`);
        ws.once('open', () => resolve(ws));
        ws.once('error', reject);
        ws.on('message', (raw) => {
          try {
            wsEvents.push(JSON.parse(raw.toString('utf8')));
          } catch (_) {}
        });
        ws.on('close', (code) => {
          wsClosedCode = code;
        });
      });

      const sendMsgRes = await httpRequest(mobilePort, 'POST', '/api/messages', {
        token: tok,
        body: { conversationId: dmConv.id, type: 'text', body: 'Hello from Mobile PWA!' },
      });
      assert.strictEqual(sendMsgRes.status, 200);
      assert.strictEqual(sendMsgRes.data.ok, true);
      await waitFor(
        () => dbB.getMessageById(sendMsgRes.data.message.id)?.body === 'Hello from Mobile PWA!',
        { desc: 'Mobile-sent chat message synced to Peer B' }
      );

      // Peer B sends reply -> verify Mobile WS receives live push
      meshB.sendChatMessage({
        conversationId: dmConv.id,
        type: 'text',
        body: 'Live push back to Mobile!',
      });
      await waitFor(
        () => wsEvents.some((e) => e.event === 'chat:message' && e.data?.body === 'Live push back to Mobile!'),
        { desc: 'Mobile WebSocket receives live chat:message push' }
      );

      // Save received attachment to Vault via /api/chat/save-to-vault
      const mobileSaveSrc = path.join(tempWorkDir, 'MobileInvoice.txt');
      fs.writeFileSync(mobileSaveSrc, 'Invoice from Peer B');
      const attFromB = await sandboxB.prepareDirectChatAttachment(mobileSaveSrc);
      const bMsg = meshB.sendChatMessage({
        conversationId: dmConv.id,
        type: 'file',
        body: 'Invoice attached',
        attachment: attFromB,
      });
      await waitFor(() => dbA.getMessageById(bMsg.id), { desc: 'Peer A receives attachment from Peer B' });
      await meshA.ensureChatBlobAvailable(attFromB.blobId, attFromB.fileName, idB.uuid);

      const saveVaultMobile = await httpRequest(mobilePort, 'POST', '/api/chat/save-to-vault', {
        token: tok,
        body: {
          attachment: attFromB,
          targetVaultFolder: 'Shared',
          conflictStrategy: 'keep_both',
        },
      });
      assert.strictEqual(saveVaultMobile.status, 200);
      assert.strictEqual(saveVaultMobile.data.ok, true);
      assert.strictEqual(
        fs.readFileSync(path.join(vaultA.filesDir, saveVaultMobile.data.relPath), 'utf8'),
        'Invoice from Peer B'
      );

      // Token rotation revokes old token & closes old WS
      const rotated = await mobileA.rotateToken();
      assert.notStrictEqual(mobileA.sessionToken, tok);
      assert(rotated.primaryUrl.includes(mobileA.sessionToken));

      await waitFor(() => wsClosedCode === 4001, { desc: 'old mobile WS closed on rotateToken' });
      try { mobileWs.terminate(); } catch (_) {}

      const oldTokCheck = await httpRequest(mobilePort, 'GET', '/api/bootstrap', { token: tok });
      assert.strictEqual(oldTokCheck.status, 401);

      const newTokCheck = await httpRequest(mobilePort, 'GET', '/api/bootstrap', { token: mobileA.sessionToken });
      assert.strictEqual(newTokCheck.status, 200);
    });

    // -------------------------------------------------------------------------
    // 14. PC Account PIN + Offline PC Account Roaming
    // -------------------------------------------------------------------------
    await runStep('14. PC Account PIN + Offline PC Account Roaming (accessing chats & private folder)', async () => {
      mobileB = new MobileServer({
        db: dbB,
        meshNetwork: meshB,
        sandboxManager: sandboxB,
        vaultPaths: vaultB,
        port: 0,
      });
      mobilePortB = await mobileB.start();

      // Add a confidential file in Alice's private /Finance folder and sync to Peer B
      const budgetSrc = path.join(tempWorkDir, 'Budget2026.txt');
      fs.writeFileSync(budgetSrc, 'ALICE_CONFIDENTIAL_BUDGET_2026');
      const impBudget = await sandboxA.importOsPathsToVault([budgetSrc], 'Finance', 'overwrite', idA.uuid, unlockedA);
      assert.strictEqual(impBudget.ok, true);

      await waitFor(
        () =>
          dbB.getVaultNode('Finance/Budget2026.txt') &&
          fs.existsSync(path.join(vaultB.filesDir, 'Finance', 'Budget2026.txt')),
        { desc: 'Finance/Budget2026.txt synced to Peer B' }
      );

      // Alice sets her PC Account PIN on PC A and broadcasts profile update
      idA = dbA.updateLocalPin('4829');
      assert.strictEqual(idA.has_pin, true);
      meshA.broadcastProfileUpdate();

      await waitFor(
        () => Boolean(dbB.getPeer(idA.uuid)?.pin_hash),
        { desc: 'Alice PIN hash synced to Peer B' }
      );

      // Public accounts listing exposes neither hashes nor desktop security_question
      const accRes = await httpRequest(mobilePortB, 'GET', '/api/auth/accounts');
      assert.strictEqual(accRes.status, 200);
      assert.strictEqual(accRes.data.ok, true);
      const aliceAcc = accRes.data.accounts.find((a) => a.uuid === idA.uuid);
      assert(aliceAcc, 'Alice account listed on PC B portal');
      assert.strictEqual(aliceAcc.device_type, 'desktop');
      assert.strictEqual(aliceAcc.has_pin, true);
      assert.strictEqual(aliceAcc.security_question, '');
      assert.strictEqual(aliceAcc.pin_hash, undefined);
      assert.strictEqual(aliceAcc.security_answer_hash, undefined);
      assert.strictEqual(aliceAcc.recovery_key_hash, undefined);

      // Stop Peer A completely (Alice's PC goes offline)
      await mobileA.stop();
      mobileA = null;
      await meshA.stop();
      await waitFor(() => meshB.getStatus().onlineCount === 0, { desc: 'Peer B detects Peer A offline' });

      // Invalid PIN rejected with 401
      const badPinLogin = await httpRequest(mobilePortB, 'POST', '/api/auth/login', {
        body: { uuid: idA.uuid, pin: '0000' },
      });
      assert.strictEqual(badPinLogin.status, 401);
      assert.strictEqual(badPinLogin.data.code, 'INVALID_PIN');

      // Account without PIN rejected with 403 PIN_NOT_SET
      const noPinLogin = await httpRequest(mobilePortB, 'POST', '/api/auth/login', {
        body: { uuid: idB.uuid, pin: '1234' },
      });
      assert.strictEqual(noPinLogin.status, 403);
      assert.strictEqual(noPinLogin.data.code, 'PIN_NOT_SET');

      // Valid PIN logs Alice into PC B's portal
      const aliceLogin = await httpRequest(mobilePortB, 'POST', '/api/auth/login', {
        body: { uuid: idA.uuid, pin: '4829' },
      });
      assert.strictEqual(aliceLogin.status, 200);
      assert.strictEqual(aliceLogin.data.ok, true);
      assert.strictEqual(aliceLogin.data.mode, 'portal');
      assert.strictEqual(aliceLogin.data.identity.uuid, idA.uuid);
      const alicePortalTok = aliceLogin.data.token;

      // Bootstrap & read chats while PC A is offline
      const aliceBoot = await httpRequest(mobilePortB, 'GET', '/api/bootstrap', { token: alicePortalTok });
      assert.strictEqual(aliceBoot.status, 200);
      assert.strictEqual(aliceBoot.data.mode, 'portal');
      assert.strictEqual(aliceBoot.data.identity.uuid, idA.uuid);
      assert(aliceBoot.data.conversations.some((c) => c.id === dmConv.id), 'Alice sees her DM conversation on PC B');
      assert(aliceBoot.data.peers.some((p) => p.uuid === idB.uuid), 'Alice sees host PC B in peers');
      assert(!aliceBoot.data.peers.some((p) => p.uuid === idA.uuid), 'Peers list excludes actor self');

      const aliceMsgs = await httpRequest(mobilePortB, 'GET', `/api/messages/${encodeURIComponent(dmConv.id)}`, {
        token: alicePortalTok,
      });
      assert.strictEqual(aliceMsgs.status, 200);
      assert(aliceMsgs.data.messages.some((m) => m.body === 'Hello Bob (edited)'), 'Alice reads synced DM history');

      // Alice accesses her own private /Finance folder WITHOUT needing folder password unlock
      const finListAlice = await httpRequest(mobilePortB, 'GET', '/api/vault/list?path=Finance', {
        token: alicePortalTok,
      });
      assert.strictEqual(finListAlice.status, 200);
      assert(finListAlice.data.items.some((i) => i.rel_path === 'Finance/Budget2026.txt'));

      const finPreviewAlice = await httpRequest(
        mobilePortB,
        'GET',
        '/api/vault/preview?path=Finance%2FBudget2026.txt',
        { token: alicePortalTok }
      );
      assert.strictEqual(finPreviewAlice.status, 200);
      assert.strictEqual(finPreviewAlice.data.text, 'ALICE_CONFIDENTIAL_BUDGET_2026');

      // Bob on the exact same PC B is still locked out of /Finance
      const finListBob = await httpRequest(mobilePortB, 'GET', '/api/vault/list?path=Finance', {
        token: mobileB.sessionToken,
      });
      assert.strictEqual(finListBob.status, 403);
      assert.strictEqual(finListBob.data.code, 'LOCKED');

      // Alice logs out of PC B's portal -> token revoked
      const aliceLogout = await httpRequest(mobilePortB, 'POST', '/api/auth/logout', {
        token: alicePortalTok,
      });
      assert.strictEqual(aliceLogout.status, 200);
      const afterLogoutBoot = await httpRequest(mobilePortB, 'GET', '/api/bootstrap', { token: alicePortalTok });
      assert.strictEqual(afterLogoutBoot.status, 401);

      // Bring Peer A back online for subsequent suites
      await meshA.start();
      mobileA = new MobileServer({
        db: dbA,
        meshNetwork: meshA,
        sandboxManager: sandboxA,
        vaultPaths: vaultA,
        port: 0,
      });
      mobilePortA = await mobileA.start();
      await waitFor(
        () => meshA.getStatus().onlineCount >= 1 && meshB.getStatus().onlineCount >= 1,
        { desc: 'Peer A and Peer B reconnected after Suite 14' }
      );
    });

    // -------------------------------------------------------------------------
    // 15. Standalone Mobile Accounts + Cross-Gateway DM + Privacy Isolation + Roam
    // -------------------------------------------------------------------------
    let mobile1Uuid;
    let mobile2Uuid;
    let mobile1RecoveryCode;
    let dmM1M2Id;
    await runStep('15. Standalone Mobile Accounts + Cross-Gateway DM + Privacy Isolation + Logout & Roam', async () => {
      // Register M1 on Gateway A
      const regM1 = await httpRequest(mobilePortA, 'POST', '/api/auth/register', {
        body: {
          name: 'Sara Phone',
          avatar: 'color:#4f46e5',
          pin: '1122',
          securityQuestion: 'Favorite color?',
          securityAnswer: 'Emerald',
        },
      });
      assert.strictEqual(regM1.status, 200);
      assert.strictEqual(regM1.data.ok, true);
      assert.strictEqual(regM1.data.mode, 'portal');
      assert(RECOVERY_CODE_RE.test(regM1.data.recoveryCode), 'Must generate 6-char recoveryCode');
      assert.strictEqual(regM1.data.identity.device_type, 'mobile');
      mobile1Uuid = regM1.data.identity.uuid;
      mobile1RecoveryCode = regM1.data.recoveryCode;
      let tokM1 = regM1.data.token;

      // Register M2 on Gateway B
      const regM2 = await httpRequest(mobilePortB, 'POST', '/api/auth/register', {
        body: {
          name: 'Omar Phone',
          avatar: 'color:#10b981',
          pin: '3344',
          securityQuestion: 'Hometown?',
          securityAnswer: 'Alexandria',
        },
      });
      assert.strictEqual(regM2.status, 200);
      mobile2Uuid = regM2.data.identity.uuid;
      const tokM2 = regM2.data.token;

      // Wait until M1 and M2 are synced across both PCs
      await waitFor(
        () =>
          dbB.getPeer(mobile1Uuid)?.device_type === 'mobile' &&
          dbA.getPeer(mobile2Uuid)?.device_type === 'mobile',
        { desc: 'Mobile accounts synced across PC A and PC B' }
      );

      // Connect WebSockets for M1 (Gateway A), M2 (Gateway B), and Alice (Gateway A linked)
      const eventsM2 = [];
      const eventsAlice = [];
      const wsM1 = await new Promise((resolve, reject) => {
        const ws = new WebSocket(`ws://127.0.0.1:${mobilePortA}/ws?token=${tokM1}`);
        ws.once('open', () => resolve(ws));
        ws.once('error', reject);
      });
      const wsM2 = await new Promise((resolve, reject) => {
        const ws = new WebSocket(`ws://127.0.0.1:${mobilePortB}/ws?token=${tokM2}`);
        ws.once('open', () => resolve(ws));
        ws.once('error', reject);
        ws.on('message', (raw) => {
          try { eventsM2.push(JSON.parse(raw.toString('utf8'))); } catch (_) {}
        });
      });
      const wsAlice = await new Promise((resolve, reject) => {
        const ws = new WebSocket(`ws://127.0.0.1:${mobilePortA}/ws?token=${mobileA.sessionToken}`);
        ws.once('open', () => resolve(ws));
        ws.once('error', reject);
        ws.on('message', (raw) => {
          try { eventsAlice.push(JSON.parse(raw.toString('utf8'))); } catch (_) {}
        });
      });

      // M1 starts DM with M2 and sends private message
      const dmCreateRes = await httpRequest(mobilePortA, 'POST', '/api/conversations/dm', {
        token: tokM1,
        body: { peerUuid: mobile2Uuid },
      });
      assert.strictEqual(dmCreateRes.status, 200);
      dmM1M2Id = dmCreateRes.data.conversation.id;

      const sendM1 = await httpRequest(mobilePortA, 'POST', '/api/messages', {
        token: tokM1,
        body: { conversationId: dmM1M2Id, type: 'text', body: 'Private mobile greeting' },
      });
      assert.strictEqual(sendM1.status, 200);
      const msgM1Id = sendM1.data.message.id;

      // M2 receives live chat:message push over Gateway B WS
      await waitFor(
        () => eventsM2.some((e) => e.event === 'chat:message' && e.data?.id === msgM1Id),
        { desc: 'M2 receives cross-gateway mobile message via WS' }
      );

      // M1 edits message -> synced to M2
      const editM1 = await httpRequest(mobilePortA, 'PUT', `/api/messages/${msgM1Id}`, {
        token: tokM1,
        body: { body: 'Private mobile greeting (edited)' },
      });
      assert.strictEqual(editM1.status, 200);
      await waitFor(
        () => eventsM2.some((e) => e.event === 'chat:edit' && e.data?.body === 'Private mobile greeting (edited)'),
        { desc: 'M2 receives gateway-relayed chat:edit' }
      );

      // M2 reacts ❤️ -> synced back to M1
      const reactM2 = await httpRequest(mobilePortB, 'POST', `/api/messages/${msgM1Id}/reaction`, {
        token: tokM2,
        body: { emoji: '❤️' },
      });
      assert.strictEqual(reactM2.status, 200);
      await waitFor(
        () => dbA.getMessageById(msgM1Id)?.reactions?.some((r) => r.peer_uuid === mobile2Uuid && r.emoji === '❤️'),
        { desc: 'Reaction synced from M2 (PC B) to PC A' }
      );

      // M1 sends & deletes a second message -> synced to M2
      const sendM1Temp = await httpRequest(mobilePortA, 'POST', '/api/messages', {
        token: tokM1,
        body: { conversationId: dmM1M2Id, type: 'text', body: 'Temp mobile secret' },
      });
      const msgTempId = sendM1Temp.data.message.id;
      await waitFor(() => dbB.getMessageById(msgTempId), { desc: 'Second mobile msg replicated to PC B' });

      const delM1 = await httpRequest(mobilePortA, 'DELETE', `/api/messages/${msgTempId}`, {
        token: tokM1,
      });
      assert.strictEqual(delM1.status, 200);
      await waitFor(
        () => Boolean(dbB.getMessageById(msgTempId)?.deleted_at),
        { desc: 'Gateway-relayed soft delete synced to PC B' }
      );

      // STRICT DESKTOP PRIVACY ISOLATION CHECKS
      assert.strictEqual(
        dbA.getConversations(idA.uuid).some((c) => c.id === dmM1M2Id),
        false,
        'Desktop Alice must NOT see M1<->M2 private conversation'
      );
      assert.strictEqual(
        dbB.getConversations(idB.uuid).some((c) => c.id === dmM1M2Id),
        false,
        'Desktop Bob must NOT see M1<->M2 private conversation'
      );
      assert.strictEqual(
        dbA.getMessages(dmM1M2Id, { actorUuid: idA.uuid }).length,
        0,
        'dbA.getMessages for Alice must return 0 private mobile messages'
      );
      assert.strictEqual(
        dbB.getMessages(dmM1M2Id, { actorUuid: idB.uuid }).length,
        0,
        'dbB.getMessages for Bob must return 0 private mobile messages'
      );
      assert.strictEqual(
        eventsAlice.some((e) => e.event?.startsWith('chat:') && (e.data?.conversation_id === dmM1M2Id || e.data?.conversationId === dmM1M2Id)),
        false,
        'Alice WS must receive ZERO chat:* events for M1<->M2 conversation'
      );
      const aliceSpyRes = await httpRequest(mobilePortA, 'GET', `/api/messages/${encodeURIComponent(dmM1M2Id)}`, {
        token: mobileA.sessionToken,
      });
      assert.strictEqual(aliceSpyRes.status, 403, 'Non-member Alice cannot read M1<->M2 messages via REST');

      // M1 logs out of Gateway A and roams to Gateway B, recovering 100% of chats
      const logoutM1 = await httpRequest(mobilePortA, 'POST', '/api/auth/logout', { token: tokM1 });
      assert.strictEqual(logoutM1.status, 200);
      try { wsM1.terminate(); } catch (_) {}
      try { wsM2.terminate(); } catch (_) {}
      try { wsAlice.terminate(); } catch (_) {}

      await waitFor(
        () => dbB.getPeer(mobile1Uuid)?.status === 'offline',
        { desc: 'M1 marked offline on PC B after logout on PC A' }
      );

      const roamLoginM1 = await httpRequest(mobilePortB, 'POST', '/api/auth/login', {
        body: { uuid: mobile1Uuid, pin: '1122' },
      });
      assert.strictEqual(roamLoginM1.status, 200);
      tokM1 = roamLoginM1.data.token;

      const bootM1OnB = await httpRequest(mobilePortB, 'GET', '/api/bootstrap', { token: tokM1 });
      assert.strictEqual(bootM1OnB.status, 200);
      assert(bootM1OnB.data.conversations.some((c) => c.id === dmM1M2Id));

      const msgsM1OnB = await httpRequest(mobilePortB, 'GET', `/api/messages/${encodeURIComponent(dmM1M2Id)}`, {
        token: tokM1,
      });
      assert.strictEqual(msgsM1OnB.status, 200);
      assert.strictEqual(msgsM1OnB.data.messages.length, 2);
      assert.strictEqual(msgsM1OnB.data.messages[0].body, 'Private mobile greeting (edited)');
      assert(msgsM1OnB.data.messages[0].reactions.some((r) => r.emoji === '❤️'));
      assert(Boolean(msgsM1OnB.data.messages[1].deleted_at));

      await httpRequest(mobilePortB, 'POST', '/api/auth/logout', { token: tokM1 });
      await httpRequest(mobilePortB, 'POST', '/api/auth/logout', { token: tokM2 });
    });

    // -------------------------------------------------------------------------
    // 16. Offline Forgot PIN Recovery (security_qa + 6-char recovery_code)
    // -------------------------------------------------------------------------
    await runStep('16. Offline Forgot PIN Recovery (security_qa + 6-char recovery_code) + cross-PC sync', async () => {
      // Desktop account recovery-info returns 400
      const deskRecInfo = await httpRequest(mobilePortB, 'GET', `/api/auth/recovery-info/${idA.uuid}`);
      assert.strictEqual(deskRecInfo.status, 400);

      // Mobile account recovery-info returns metadata
      const mobRecInfo = await httpRequest(mobilePortB, 'GET', `/api/auth/recovery-info/${mobile1Uuid}`);
      assert.strictEqual(mobRecInfo.status, 200);
      assert.strictEqual(mobRecInfo.data.ok, true);
      assert.strictEqual(mobRecInfo.data.device_type, 'mobile');
      assert.strictEqual(mobRecInfo.data.securityQuestion, 'Favorite color?');
      assert.strictEqual(mobRecInfo.data.hasSecurityQA, true);
      assert.strictEqual(mobRecInfo.data.hasRecoveryCode, true);

      // Wrong security answer returns 403 INVALID_CREDENTIALS
      const badQaRes = await httpRequest(mobilePortB, 'POST', '/api/auth/recover-pin', {
        body: {
          uuid: mobile1Uuid,
          method: 'security_qa',
          answerOrCode: 'WrongColor',
          newPin: '5566',
        },
      });
      assert.strictEqual(badQaRes.status, 403);
      assert.strictEqual(badQaRes.data.code, 'INVALID_CREDENTIALS');

      // Recover PIN via security_qa on PC B
      const qaRecRes = await httpRequest(mobilePortB, 'POST', '/api/auth/recover-pin', {
        body: {
          uuid: mobile1Uuid,
          method: 'security_qa',
          answerOrCode: '  EMERALD  ',
          newPin: '5566',
        },
      });
      assert.strictEqual(qaRecRes.status, 200);
      assert.strictEqual(qaRecRes.data.ok, true);
      assert.strictEqual(qaRecRes.data.mode, 'portal');
      await httpRequest(mobilePortB, 'POST', '/api/auth/logout', { token: qaRecRes.data.token });

      // Wait for updated PIN hash to sync back to PC A
      await waitFor(
        () => dbA.getPeer(mobile1Uuid)?.pin_hash === dbB.getPeer(mobile1Uuid)?.pin_hash,
        { desc: 'Recovered PIN hash synced from PC B to PC A' }
      );

      // Old PIN fails, new PIN works on PC A
      const oldPinFail = await httpRequest(mobilePortA, 'POST', '/api/auth/login', {
        body: { uuid: mobile1Uuid, pin: '1122' },
      });
      assert.strictEqual(oldPinFail.status, 401);

      const newPinOk = await httpRequest(mobilePortA, 'POST', '/api/auth/login', {
        body: { uuid: mobile1Uuid, pin: '5566' },
      });
      assert.strictEqual(newPinOk.status, 200);
      await httpRequest(mobilePortA, 'POST', '/api/auth/logout', { token: newPinOk.data.token });

      // Recover PIN via 6-char recovery_code on PC A (case-insensitive)
      const codeRecRes = await httpRequest(mobilePortA, 'POST', '/api/auth/recover-pin', {
        body: {
          uuid: mobile1Uuid,
          method: 'recovery_code',
          answerOrCode: mobile1RecoveryCode.toLowerCase(),
          newPin: '7788',
        },
      });
      assert.strictEqual(codeRecRes.status, 200);
      assert.strictEqual(codeRecRes.data.ok, true);
      await httpRequest(mobilePortA, 'POST', '/api/auth/logout', { token: codeRecRes.data.token });

      await waitFor(
        () => dbB.getPeer(mobile1Uuid)?.pin_hash === dbA.getPeer(mobile1Uuid)?.pin_hash,
        { desc: 'Recovery-code PIN hash synced from PC A to PC B' }
      );

      const verifyOnB = await httpRequest(mobilePortB, 'POST', '/api/auth/login', {
        body: { uuid: mobile1Uuid, pin: '7788' },
      });
      assert.strictEqual(verifyOnB.status, 200);
      await httpRequest(mobilePortB, 'POST', '/api/auth/logout', { token: verifyOnB.data.token });
    });

    // -------------------------------------------------------------------------
    // 17. Dual-Tab getPairingInfo() + REST Message Edit/Delete Owner vs 403 Non-Owner
    // -------------------------------------------------------------------------
    await runStep('17. Dual-Tab getPairingInfo() (quickLink vs portal) + REST Edit/Delete Ownership Checks', async () => {
      const pairing = await mobileA.getPairingInfo();
      assert.strictEqual(pairing.ok, true);
      assert(pairing.primaryUrl.includes(`?mode=linked&token=${mobileA.sessionToken}`));
      assert(pairing.qrDataUrl.startsWith('data:image/png;base64,'));
      assert(pairing.quickLink && pairing.quickLink.primaryUrl.includes(`?mode=linked&token=${mobileA.sessionToken}`));
      assert(pairing.quickLink.qrDataUrl.startsWith('data:image/png;base64,'));
      assert(Array.isArray(pairing.quickLink.adapters) && pairing.quickLink.adapters.length >= 1);

      assert(pairing.portal && pairing.portal.primaryUrl.includes('?mode=portal'));
      assert(!pairing.portal.primaryUrl.includes('token='), 'Portal URL must NOT embed a session token');
      assert(pairing.portal.qrDataUrl.startsWith('data:image/png;base64,'));
      assert(
        Array.isArray(pairing.portal.adapters) &&
          pairing.portal.adapters.every((a) => a.url.includes('?mode=portal') && !a.url.includes('token=')),
        'All portal adapter URLs must omit token'
      );

      const iconRes = await httpRequest(mobilePortA, 'GET', '/icon.svg');
      assert.strictEqual(iconRes.status, 200);
      assert(iconRes.raw.includes('<svg'));

      const manifestRes = await httpRequest(mobilePortA, 'GET', '/manifest.json');
      assert.strictEqual(manifestRes.status, 200);
      assert.strictEqual(manifestRes.data.name, 'TwinSync Pro');
      assert.strictEqual(manifestRes.data.short_name, 'TwinSync');

      // REST Edit/Delete owner vs 403 non-owner checks
      const loginM1 = await httpRequest(mobilePortA, 'POST', '/api/auth/login', {
        body: { uuid: mobile1Uuid, pin: '7788' },
      });
      const loginM2 = await httpRequest(mobilePortB, 'POST', '/api/auth/login', {
        body: { uuid: mobile2Uuid, pin: '3344' },
      });
      const tok1 = loginM1.data.token;
      const tok2 = loginM2.data.token;

      const sent = await httpRequest(mobilePortA, 'POST', '/api/messages', {
        token: tok1,
        body: { conversationId: dmM1M2Id, type: 'text', body: 'Owner message only' },
      });
      assert.strictEqual(sent.status, 200);
      const targetMsgId = sent.data.message.id;

      await waitFor(() => dbB.getMessageById(targetMsgId), { desc: 'Owner check message synced to PC B' });

      // Non-owner M2 denied edit & delete with 403
      const hijackEdit = await httpRequest(mobilePortB, 'PUT', `/api/messages/${targetMsgId}`, {
        token: tok2,
        body: { body: 'Tampered by M2' },
      });
      assert.strictEqual(hijackEdit.status, 403);

      const hijackDelete = await httpRequest(mobilePortB, 'DELETE', `/api/messages/${targetMsgId}`, {
        token: tok2,
      });
      assert.strictEqual(hijackDelete.status, 403);
      assert.strictEqual(dbB.getMessageById(targetMsgId).body, 'Owner message only');

      // Owner M1 succeeds in editing and deleting
      const ownerEdit = await httpRequest(mobilePortA, 'PUT', `/api/messages/${targetMsgId}`, {
        token: tok1,
        body: { body: 'Edited cleanly by M1' },
      });
      assert.strictEqual(ownerEdit.status, 200);
      assert.strictEqual(ownerEdit.data.message.body, 'Edited cleanly by M1');

      const ownerDelete = await httpRequest(mobilePortA, 'DELETE', `/api/messages/${targetMsgId}`, {
        token: tok1,
      });
      assert.strictEqual(ownerDelete.status, 200);
      assert(Boolean(ownerDelete.data.message.deleted_at));

      await httpRequest(mobilePortA, 'POST', '/api/auth/logout', { token: tok1 });
      await httpRequest(mobilePortB, 'POST', '/api/auth/logout', { token: tok2 });
    });

    console.log(`\nALL ${passed} INTEGRATION TEST SUITES PASSED (100%)!`);
  } finally {
    try { if (sandboxA) await sandboxA.cleanupAll(); } catch (_) {}
    try { if (sandboxB) await sandboxB.cleanupAll(); } catch (_) {}
    try { if (mobileA) await mobileA.stop(); } catch (_) {}
    try { if (mobileB) await mobileB.stop(); } catch (_) {}
    try { if (meshA) await meshA.stop(); } catch (_) {}
    try { if (meshB) await meshB.stop(); } catch (_) {}
    try { dbA.close(); } catch (_) {}
    try { dbB.close(); } catch (_) {}
    try { fs.rmSync(vaultA.vaultRoot, { recursive: true, force: true }); } catch (_) {}
    try { fs.rmSync(vaultB.vaultRoot, { recursive: true, force: true }); } catch (_) {}
    try { fs.rmSync(tempWorkDir, { recursive: true, force: true }); } catch (_) {}
  }
}

runTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\nINTEGRATION TEST FAILED:', err);
    process.exit(1);
  });
