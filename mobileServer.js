'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const crypto = require('crypto');
const EventEmitter = require('events');
const express = require('express');
const { WebSocketServer } = require('ws');
const QRCode = require('qrcode');
const archiver = require('archiver');

const {
  guessMime,
  sanitizeFileName,
  normalizeRelPath,
  safeJoin
} = require('./sandboxManager');

function timingSafeCompare(a, b) {
  const strA = String(a || '');
  const strB = String(b || '');
  const bufA = Buffer.from(strA, 'utf8');
  const bufB = Buffer.from(strB, 'utf8');
  if (bufA.length !== bufB.length || bufA.length === 0) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function parseMultipart(bodyBuffer, contentType) {
  const match = /boundary=(?:"([^"]+)"|([^;\s]+))/i.exec(contentType || '');
  if (!match) {
    throw new Error('Missing multipart boundary');
  }
  const boundary = match[1] || match[2];
  const boundaryBuf = Buffer.from(`--${boundary}`);
  const headerSep = Buffer.from('\r\n\r\n');

  const fields = {};
  const files = [];

  let pos = bodyBuffer.indexOf(boundaryBuf);
  while (pos !== -1) {
    const partStart = pos + boundaryBuf.length;
    if (bodyBuffer.slice(partStart, partStart + 2).toString('utf8') === '--') {
      break;
    }
    const nextPos = bodyBuffer.indexOf(boundaryBuf, partStart);
    if (nextPos === -1) break;

    let chunkStart = partStart;
    if (bodyBuffer[chunkStart] === 0x0d && bodyBuffer[chunkStart + 1] === 0x0a) {
      chunkStart += 2;
    }
    let chunkEnd = nextPos;
    if (chunkEnd >= 2 && bodyBuffer[chunkEnd - 2] === 0x0d && bodyBuffer[chunkEnd - 1] === 0x0a) {
      chunkEnd -= 2;
    }

    const chunk = bodyBuffer.slice(chunkStart, chunkEnd);
    const sepIdx = chunk.indexOf(headerSep);
    if (sepIdx !== -1) {
      const headersRaw = chunk.slice(0, sepIdx).toString('utf8');
      const dataBuf = chunk.slice(sepIdx + 4);

      const dispMatch = /Content-Disposition:\s*form-data;\s*([^\r\n]+)/i.exec(headersRaw);
      if (dispMatch) {
        const disp = dispMatch[1];
        const nameMatch = /\bname="([^"]+)"/i.exec(disp);
        const fileMatch = /\bfilename="([^"]*)"/i.exec(disp);
        const typeMatch = /Content-Type:\s*([^\r\n;]+)/i.exec(headersRaw);

        const fieldName = nameMatch ? nameMatch[1] : 'field';
        if (fileMatch) {
          const decodedName = path.basename(fileMatch[1] || 'upload.bin');
          files.push({
            fieldName,
            fileName: decodedName || 'upload.bin',
            mime: typeMatch ? typeMatch[1].trim() : guessMime(decodedName),
            buffer: dataBuf
          });
        } else {
          fields[fieldName] = dataBuf.toString('utf8');
        }
      }
    }
    pos = nextPos;
  }

  return { fields, files };
}

function sanitizeIdentity(identity) {
  if (!identity) return null;
  return {
    uuid: identity.uuid,
    display_name: identity.display_name,
    avatar_data: identity.avatar_data || '',
    security_question: identity.security_question || '',
    onboarded: Boolean(identity.onboarded)
  };
}

function sanitizePeer(peer) {
  if (!peer) return null;
  return {
    uuid: peer.uuid,
    display_name: peer.display_name,
    avatar_data: peer.avatar_data || '',
    status: peer.status || 'offline',
    ip: peer.ip || '',
    ws_port: peer.ws_port || 0,
    last_seen: peer.last_seen || 0
  };
}

function isPrivateLanIp(ip) {
  if (ip.startsWith('192.168.') || ip.startsWith('10.')) return true;
  if (ip.startsWith('172.')) {
    const second = Number(ip.split('.')[1]);
    return second >= 16 && second <= 31;
  }
  return false;
}

class MobileServer extends EventEmitter {
  constructor({ db, meshNetwork, sandboxManager, vaultPaths, port = 41236 }) {
    super();
    this.db = db;
    this.meshNetwork = meshNetwork;
    this.sandboxManager = sandboxManager;
    this.vaultPaths = vaultPaths;
    this.port = port;
    this.actualPort = port;
    this.sessionToken = crypto.randomBytes(24).toString('hex');
    this.unlockedSet = new Set();
    this.app = null;
    this.server = null;
    this.wss = null;
    this.wsClients = new Set();
    this._meshListeners = [];
  }

  _extractToken(req) {
    const authHeader = req.headers?.authorization || '';
    if (authHeader.startsWith('Bearer ')) {
      return authHeader.slice(7).trim();
    }
    if (req.query && typeof req.query.token === 'string') {
      return req.query.token.trim();
    }
    return '';
  }

  _isAuthorizedToken(token) {
    return timingSafeCompare(token, this.sessionToken);
  }

  _buildApp() {
    const app = express();
    const mobileRoot = path.join(__dirname, 'src', 'mobile');

    app.use((req, res, next) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      if (req.path.startsWith('/api/')) {
        res.setHeader('Cache-Control', 'no-store');
      }
      next();
    });

    app.use(express.json({ limit: '50mb' }));
    app.use(express.raw({ type: 'multipart/form-data', limit: '100mb' }));
    app.use(express.raw({ type: 'application/octet-stream', limit: '100mb' }));

    // Static Mobile PWA Shell (auth is enforced strictly on all /api/* and /ws routes)
    app.get('/', (_req, res) => {
      res.sendFile(path.join(mobileRoot, 'index.html'));
    });
    app.get('/index.html', (_req, res) => {
      res.sendFile(path.join(mobileRoot, 'index.html'));
    });
    app.get('/styles.css', (_req, res) => {
      res.sendFile(path.join(mobileRoot, 'styles.css'));
    });
    app.get('/app.js', (_req, res) => {
      res.sendFile(path.join(mobileRoot, 'app.js'));
    });
    app.get('/manifest.json', (_req, res) => {
      res.json({
        name: 'WorkMesh Mobile',
        short_name: 'WorkMesh',
        start_url: '/',
        display: 'standalone',
        background_color: '#0f172a',
        theme_color: '#4f46e5'
      });
    });

    // Strict Token Auth Middleware for ALL /api/* routes
    app.use('/api', (req, res, next) => {
      const token = this._extractToken(req);
      if (!this._isAuthorizedToken(token)) {
        return res.status(401).json({ ok: false, error: 'Unauthorized' });
      }
      next();
    });

    // Bootstrap
    app.get('/api/bootstrap', (_req, res) => {
      try {
        const identity = this.db.getIdentity();
        const myUuid = identity?.uuid || '';
        const peers = (this.db.getPeers() || []).map(sanitizePeer);
        const conversations = myUuid ? (this.db.getConversations(myUuid) || []) : [];
        const settings = typeof this.db.getAllSettings === 'function' ? this.db.getAllSettings() : {};
        const presenceMap = typeof this.meshNetwork?.getAllFilePresence === 'function'
          ? this.meshNetwork.getAllFilePresence()
          : {};
        res.json({
          ok: true,
          identity: sanitizeIdentity(identity),
          peers,
          conversations,
          settings,
          presenceMap
        });
      } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
      }
    });

    // Chat Routes
    app.post('/api/conversations/dm', (req, res) => {
      try {
        const identity = this.db.getIdentity();
        const { peerUuid } = req.body || {};
        if (!peerUuid) return res.status(400).json({ ok: false, error: 'peerUuid required' });
        const conv = this.db.ensureDmConversation(identity.uuid, peerUuid);
        res.json({ ok: true, conversation: conv });
      } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
      }
    });

    app.get('/api/messages/:convId', (req, res) => {
      try {
        const limit = Number(req.query.limit) || 100;
        const search = String(req.query.search || '');
        const messages = this.db.getMessages(req.params.convId, { limit, search });
        res.json({ ok: true, messages });
      } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
      }
    });

    app.post('/api/messages', async (req, res) => {
      try {
        const body = req.body || {};
        const payload = { ...body };

        if (payload.type === 'voice' && payload.voiceDataUrl) {
          const commaIdx = payload.voiceDataUrl.indexOf(',');
          const rawB64 = commaIdx !== -1 ? payload.voiceDataUrl.slice(commaIdx + 1) : payload.voiceDataUrl;
          const mimeMatch = /^data:([^;]+);base64,/i.exec(payload.voiceDataUrl);
          const mime = mimeMatch ? mimeMatch[1] : 'audio/webm';
          const ext = mime.includes('ogg') ? 'ogg' : (mime.includes('mp4') ? 'm4a' : 'webm');
          const buffer = Buffer.from(rawB64, 'base64');
          const att = await this.sandboxManager.saveBufferAsChatBlob({
            buffer,
            fileName: `voice_${Date.now()}.${ext}`,
            mime
          });
          att.durationMs = payload.durationMs || 0;
          payload.attachment = att;
          delete payload.voiceDataUrl;
        }

        if (!payload.attachment && Array.isArray(payload.attachments) && payload.attachments.length > 0) {
          payload.attachment = payload.attachments[0];
        }
        if (payload.vaultLink && !payload.vault_link_path) {
          payload.vault_link_path = payload.vaultLink.relPath || payload.vaultLink.rel_path || null;
          payload.vault_link_is_dir = Boolean(payload.vaultLink.isDir ?? payload.vaultLink.is_dir);
        }

        const msg = await this.meshNetwork.sendChatMessage(payload);
        res.json({ ok: true, message: msg });
      } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
      }
    });

    app.post('/api/messages/:id/reaction', async (req, res) => {
      try {
        const { emoji } = req.body || {};
        if (!emoji) return res.status(400).json({ ok: false, error: 'emoji required' });
        const result = await this.meshNetwork.toggleReaction(req.params.id, emoji);
        res.json({ ok: true, ...result });
      } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
      }
    });

    app.post('/api/conversations/:id/read', async (req, res) => {
      try {
        const readIds = await this.meshNetwork.markConversationRead(req.params.id);
        res.json({ ok: true, readIds });
      } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
      }
    });

    app.post('/api/groups', async (req, res) => {
      try {
        const { name, memberUuids, avatarData } = req.body || {};
        if (!name || !String(name).trim()) {
          return res.status(400).json({ ok: false, error: 'Group name required' });
        }
        const conv = await this.meshNetwork.createGroup({
          name: String(name).trim(),
          memberUuids: Array.isArray(memberUuids) ? memberUuids : [],
          avatarData: avatarData || ''
        });
        res.json({ ok: true, conversation: conv });
      } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
      }
    });

    // Chat File / Photo / Voice Upload
    app.post('/api/chat/upload', async (req, res) => {
      try {
        const contentType = String(req.headers['content-type'] || '').toLowerCase();
        let conversationId = req.query.conversationId || '';
        let caption = req.query.caption || '';
        let replyToId = req.query.replyToId || null;
        let isVoice = req.query.isVoice === '1' || req.query.isVoice === 'true';
        let durationMs = Number(req.query.durationMs) || 0;
        let shouldSend = req.query.sendMessage !== 'false';
        let uploadedFiles = [];

        if (contentType.includes('multipart/form-data') && Buffer.isBuffer(req.body)) {
          const parsed = parseMultipart(req.body, req.headers['content-type']);
          conversationId = parsed.fields.conversationId || conversationId;
          caption = parsed.fields.caption || caption;
          replyToId = parsed.fields.replyToId || replyToId;
          if (parsed.fields.isVoice !== undefined) {
            isVoice = parsed.fields.isVoice === '1' || parsed.fields.isVoice === 'true';
          }
          if (parsed.fields.durationMs !== undefined) {
            durationMs = Number(parsed.fields.durationMs) || durationMs;
          }
          if (parsed.fields.sendMessage !== undefined) {
            shouldSend = parsed.fields.sendMessage !== 'false';
          }
          uploadedFiles = parsed.files;
        } else if (Buffer.isBuffer(req.body)) {
          const rawName = req.headers['x-file-name'] || req.query.fileName || `upload_${Date.now()}.bin`;
          const decodedName = decodeURIComponent(String(rawName));
          uploadedFiles = [{
            fileName: decodedName,
            mime: req.headers['x-file-mime'] || guessMime(decodedName),
            buffer: req.body
          }];
        } else if (req.body && typeof req.body === 'object') {
          const b = req.body;
          conversationId = b.conversationId || conversationId;
          caption = b.caption || caption;
          replyToId = b.replyToId || replyToId;
          if (b.isVoice !== undefined) isVoice = Boolean(b.isVoice);
          if (b.durationMs !== undefined) durationMs = Number(b.durationMs) || 0;
          if (b.sendMessage !== undefined) shouldSend = Boolean(b.sendMessage);

          if (b.dataBase64) {
            const commaIdx = b.dataBase64.indexOf(',');
            const cleanB64 = commaIdx !== -1 ? b.dataBase64.slice(commaIdx + 1) : b.dataBase64;
            const fileName = b.fileName || (isVoice ? `voice_${Date.now()}.webm` : `upload_${Date.now()}.bin`);
            uploadedFiles = [{
              fileName,
              mime: b.mime || guessMime(fileName),
              buffer: Buffer.from(cleanB64, 'base64')
            }];
          }
        }

        if (uploadedFiles.length === 0) {
          return res.status(400).json({ ok: false, error: 'No file uploaded' });
        }

        const f = uploadedFiles[0];
        const att = await this.sandboxManager.saveBufferAsChatBlob({
          buffer: f.buffer,
          fileName: f.fileName,
          mime: f.mime
        });
        if (isVoice || String(att.mime).startsWith('audio/')) {
          att.durationMs = durationMs;
        }

        let message = null;
        if (conversationId && shouldSend) {
          const msgType = isVoice
            ? 'voice'
            : (String(att.mime).startsWith('image/') ? 'image' : 'file');
          message = await this.meshNetwork.sendChatMessage({
            conversationId,
            type: msgType,
            body: caption,
            attachment: att,
            replyToId: replyToId || null
          });
        }

        res.json({ ok: true, attachment: att, message });
      } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
      }
    });

    app.get('/api/blobs/:blobId/:fileName', async (req, res) => {
      try {
        const blobId = sanitizeFileName(req.params.blobId);
        const fileName = sanitizeFileName(req.params.fileName);
        if (!blobId || !fileName) {
          return res.status(400).json({ ok: false, error: 'Invalid blob request' });
        }
        if (typeof this.meshNetwork?.ensureChatBlobAvailable === 'function') {
          await this.meshNetwork.ensureChatBlobAvailable(blobId, fileName);
        }
        const blobDir = safeJoin(this.vaultPaths.chatBlobsDir, blobId);
        const blobFile = safeJoin(blobDir, fileName);
        if (!fs.existsSync(blobFile)) {
          return res.status(404).json({ ok: false, error: 'Blob not found' });
        }
        const mime = guessMime(fileName);
        const asAttachment = req.query.download === '1' || req.query.download === 'true';
        res.setHeader('Content-Type', mime);
        res.setHeader(
          'Content-Disposition',
          `${asAttachment ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(fileName)}`
        );
        fs.createReadStream(blobFile).pipe(res);
      } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
      }
    });

    app.post('/api/chat/save-to-vault', async (req, res) => {
      try {
        const identity = this.db.getIdentity();
        const { attachment, targetVaultFolder = '', conflictStrategy = 'keep_both' } = req.body || {};
        if (!attachment || !attachment.blobId || !attachment.fileName) {
          return res.status(400).json({ ok: false, error: 'Valid attachment required' });
        }
        const result = await this.sandboxManager.saveChatAttachmentToVault(
          attachment,
          targetVaultFolder,
          conflictStrategy,
          identity.uuid,
          this.unlockedSet
        );
        if (!result.ok) {
          if (result.code === 'LOCKED' || result.code === 'FORBIDDEN') {
            return res.status(403).json(result);
          }
          if (result.conflict) {
            return res.status(409).json(result);
          }
          return res.status(400).json(result);
        }
        res.json(result);
      } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
      }
    });

    // Vault File Manager Routes (Strictly using desktop identity.uuid + mobile unlockedSet!)
    app.get('/api/vault/list', (req, res) => {
      try {
        const identity = this.db.getIdentity();
        const parentPath = normalizeRelPath(req.query.path || '');
        const dirRes = this.meshNetwork.listDirectory(parentPath, identity.uuid, this.unlockedSet);
        if (dirRes && dirRes.locked) {
          return res.status(403).json({
            ok: false,
            code: 'LOCKED',
            blockingAncestor: dirRes.blockingAncestor
          });
        }
        res.json({
          ok: true,
          parentPath,
          items: Array.isArray(dirRes) ? dirRes : (dirRes?.items || []),
          effectiveAcl: dirRes?.parentAcl || { role: 'owner', canRead: true, canWrite: true, isProtected: false, blockingAncestor: null }
        });
      } catch (err) {
        res.status(400).json({ ok: false, error: err.message });
      }
    });

    app.get('/api/vault/search', (req, res) => {
      try {
        const identity = this.db.getIdentity();
        const q = String(req.query.q || '');
        const items = this.meshNetwork.searchVault(q, identity.uuid, this.unlockedSet);
        res.json({ ok: true, items });
      } catch (err) {
        res.status(400).json({ ok: false, error: err.message });
      }
    });

    app.post('/api/vault/unlock', (req, res) => {
      try {
        const { relPath, password } = req.body || {};
        const norm = normalizeRelPath(relPath || '');
        const result = this.meshNetwork.verifyAndUnlockFolder(norm, String(password || ''), this.unlockedSet);
        const ok = typeof result === 'boolean' ? result : Boolean(result?.ok);
        if (!ok) {
          return res.status(403).json({ ok: false, error: result?.error || 'Incorrect password' });
        }
        res.json({ ok: true, relPath: norm });
      } catch (err) {
        res.status(400).json({ ok: false, error: err.message });
      }
    });

    app.get('/api/vault/preview', async (req, res) => {
      try {
        const identity = this.db.getIdentity();
        const relPath = normalizeRelPath(req.query.path || '');
        const result = await this.sandboxManager.getFilePreviewData(relPath, identity.uuid, this.unlockedSet);
        if (!result.ok) {
          if (result.code === 'LOCKED') return res.status(403).json(result);
          if (result.code === 'NOT_FOUND') return res.status(404).json(result);
          return res.status(400).json(result);
        }
        res.json(result);
      } catch (err) {
        res.status(400).json({ ok: false, error: err.message });
      }
    });

    app.get('/api/vault/download', (req, res) => {
      try {
        const identity = this.db.getIdentity();
        const relPath = normalizeRelPath(req.query.path || '');
        if (!relPath) {
          return res.status(400).json({ ok: false, error: 'path required' });
        }
        const acl = this.meshNetwork.computeEffectiveAcl(relPath, identity.uuid, this.unlockedSet);
        if (!acl.canRead) {
          return res.status(403).json({
            ok: false,
            code: 'LOCKED',
            blockingAncestor: acl.blockingAncestor
          });
        }
        const diskPath = safeJoin(this.vaultPaths.filesDir, relPath);
        if (!fs.existsSync(diskPath)) {
          return res.status(404).json({ ok: false, error: 'Item not found' });
        }
        const stat = fs.statSync(diskPath);
        const baseName = path.basename(relPath);
        if (!stat.isDirectory()) {
          res.setHeader('Content-Type', guessMime(baseName));
          res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(baseName)}`);
          fs.createReadStream(diskPath).pipe(res);
          return;
        }

        // Stream directory as zip filtering unreadable subfolders
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(baseName + '.zip')}`);
        const archive = archiver('zip', { zlib: { level: 1 } });
        archive.on('error', () => {
          if (!res.headersSent) res.status(500).end();
        });
        archive.pipe(res);

        const walk = (dir, prefix) => {
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          for (const ent of entries) {
            const subRel = prefix ? `${prefix}/${ent.name}` : ent.name;
            const fullRel = `${relPath}/${subRel}`;
            const childAcl = this.meshNetwork.computeEffectiveAcl(fullRel, identity.uuid, this.unlockedSet);
            if (!childAcl.canRead) continue;
            const fullDisk = path.join(dir, ent.name);
            if (ent.isDirectory()) {
              archive.append('', { name: subRel + '/' });
              walk(fullDisk, subRel);
            } else if (ent.isFile()) {
              archive.file(fullDisk, { name: subRel });
            }
          }
        };
        walk(diskPath, '');
        archive.finalize();
      } catch (err) {
        res.status(400).json({ ok: false, error: err.message });
      }
    });

    app.post('/api/vault/upload', async (req, res) => {
      const tempDir = path.join(os.tmpdir(), 'wm_mob_' + crypto.randomBytes(4).toString('hex'));
      try {
        const identity = this.db.getIdentity();
        const contentType = String(req.headers['content-type'] || '').toLowerCase();
        let targetParentPath = req.query.targetParentPath || '';
        let conflictStrategy = req.query.conflictStrategy || 'keep_both';
        let files = [];

        if (contentType.includes('multipart/form-data') && Buffer.isBuffer(req.body)) {
          const parsed = parseMultipart(req.body, req.headers['content-type']);
          targetParentPath = parsed.fields.targetParentPath || targetParentPath;
          conflictStrategy = parsed.fields.conflictStrategy || conflictStrategy;
          files = parsed.files;
        } else if (Buffer.isBuffer(req.body)) {
          const rawName = req.headers['x-file-name'] || req.query.fileName || `upload_${Date.now()}.bin`;
          files = [{ fileName: decodeURIComponent(String(rawName)), buffer: req.body }];
        } else if (req.body && typeof req.body === 'object') {
          targetParentPath = req.body.targetParentPath || targetParentPath;
          conflictStrategy = req.body.conflictStrategy || conflictStrategy;
          if (req.body.dataBase64 && req.body.fileName) {
            const commaIdx = req.body.dataBase64.indexOf(',');
            const cleanB64 = commaIdx !== -1 ? req.body.dataBase64.slice(commaIdx + 1) : req.body.dataBase64;
            files = [{ fileName: req.body.fileName, buffer: Buffer.from(cleanB64, 'base64') }];
          }
        }

        if (files.length === 0) {
          return res.status(400).json({ ok: false, error: 'No files provided' });
        }

        fs.mkdirSync(tempDir, { recursive: true });
        const osPaths = [];
        for (const f of files) {
          const safeName = sanitizeFileName(path.basename(f.fileName));
          const tempFile = path.join(tempDir, safeName);
          fs.writeFileSync(tempFile, f.buffer);
          osPaths.push(tempFile);
        }

        const result = await this.sandboxManager.importOsPathsToVault(
          osPaths,
          targetParentPath,
          conflictStrategy,
          identity.uuid,
          this.unlockedSet
        );
        if (!result.ok) {
          if (result.code === 'LOCKED' || result.code === 'FORBIDDEN') {
            return res.status(403).json(result);
          }
          if (result.conflict) {
            return res.status(409).json(result);
          }
          return res.status(400).json(result);
        }
        res.json(result);
      } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
      } finally {
        if (fs.existsSync(tempDir)) {
          fs.rmSync(tempDir, { recursive: true, force: true });
        }
      }
    });

    return app;
  }

  _broadcastWs(event, data) {
    if (this.wsClients.size === 0) return;
    const payload = JSON.stringify({ event, data });
    for (const ws of this.wsClients) {
      if (ws.readyState === 1) {
        try {
          ws.send(payload);
        } catch (_) {}
      }
    }
  }

  _attachMeshListeners() {
    this._detachMeshListeners();
    if (!this.meshNetwork || typeof this.meshNetwork.on !== 'function') return;
    const events = [
      'chat:message',
      'chat:edit',
      'chat:delete',
      'chat:typing',
      'chat:receipt',
      'chat:reaction',
      'conversations:changed',
      'vault:changed',
      'peers:changed',
      'presence:changed'
    ];
    for (const evt of events) {
      const fn = (data) => this._broadcastWs(evt, data);
      this.meshNetwork.on(evt, fn);
      this._meshListeners.push({ evt, fn });
    }
  }

  _detachMeshListeners() {
    if (!this.meshNetwork || typeof this.meshNetwork.removeListener !== 'function') {
      this._meshListeners = [];
      return;
    }
    for (const { evt, fn } of this._meshListeners) {
      this.meshNetwork.removeListener(evt, fn);
    }
    this._meshListeners = [];
  }

  async start() {
    if (this.server) return this.actualPort;
    this.app = this._buildApp();
    this.server = http.createServer(this.app);
    this.wss = new WebSocketServer({ noServer: true });

    this.server.on('upgrade', (request, socket, head) => {
      try {
        const url = new URL(request.url, 'http://localhost');
        if (url.pathname !== '/ws') {
          socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
          socket.destroy();
          return;
        }
        const token = url.searchParams.get('token') || '';
        if (!this._isAuthorizedToken(token)) {
          socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
          socket.destroy();
          return;
        }
        this.wss.handleUpgrade(request, socket, head, (ws) => {
          this.wsClients.add(ws);
          ws.on('close', () => this.wsClients.delete(ws));
          ws.on('error', () => this.wsClients.delete(ws));
        });
      } catch (_) {
        socket.destroy();
      }
    });

    this._attachMeshListeners();

    await new Promise((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(this.port, '0.0.0.0', () => {
        const addr = this.server.address();
        this.actualPort = addr && typeof addr === 'object' ? addr.port : this.port;
        resolve();
      });
    });

    return this.actualPort;
  }

  async stop() {
    this._detachMeshListeners();
    for (const ws of this.wsClients) {
      try {
        ws.close(1001, 'Server stopping');
      } catch (_) {}
    }
    this.wsClients.clear();

    if (this.wss) {
      await new Promise((resolve) => this.wss.close(() => resolve()));
      this.wss = null;
    }

    if (this.server) {
      await new Promise((resolve) => this.server.close(() => resolve()));
      this.server = null;
    }
  }

  async getPairingInfo() {
    const ifaces = os.networkInterfaces();
    const adapters = [];
    for (const [name, list] of Object.entries(ifaces)) {
      if (!Array.isArray(list)) continue;
      for (const iface of list) {
        if (iface.family === 'IPv4' && !iface.internal && iface.address) {
          adapters.push({
            name,
            ip: iface.address,
            url: `http://${iface.address}:${this.actualPort}/?token=${this.sessionToken}`,
            isLan: isPrivateLanIp(iface.address)
          });
        }
      }
    }

    adapters.sort((a, b) => Number(b.isLan) - Number(a.isLan));

    if (adapters.length === 0) {
      adapters.push({
        name: 'loopback',
        ip: '127.0.0.1',
        url: `http://127.0.0.1:${this.actualPort}/?token=${this.sessionToken}`,
        isLan: false
      });
    }

    const primaryUrl = adapters[0].url;
    const qrDataUrl = await QRCode.toDataURL(primaryUrl, {
      width: 280,
      margin: 2,
      color: { dark: '#0f172a', light: '#ffffff' }
    });

    return {
      ok: true,
      port: this.actualPort,
      primaryUrl,
      qrDataUrl,
      urls: adapters.map(({ name, ip, url }) => ({ name, ip, url })),
      adapters: adapters.map(({ name, ip, url }) => ({ name, ip, url }))
    };
  }

  async rotateToken() {
    this.sessionToken = crypto.randomBytes(24).toString('hex');
    this.unlockedSet.clear();
    for (const ws of this.wsClients) {
      try {
        ws.close(4001, 'Session token rotated');
      } catch (_) {}
    }
    this.wsClients.clear();
    return this.getPairingInfo();
  }
}

module.exports = {
  MobileServer
};
