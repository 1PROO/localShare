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
  hashPin,
  verifyPin,
  generateRecoveryCode,
  hashRecoveryCode,
  verifyRecoveryCode,
  hashSecurityAnswerSha256,
  verifySecurityAnswerFlexible
} = require('./database');

const {
  guessMime,
  sanitizeFileName,
  normalizeRelPath,
  safeJoin,
  sanitizeNodeForPublic
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
  const deviceType = identity.device_type || 'desktop';
  const displayName = identity.display_name || identity.name || '';
  const avatar = identity.avatar_data ?? identity.avatar ?? '';
  return {
    uuid: identity.uuid,
    display_name: displayName,
    name: identity.name || displayName,
    avatar_data: avatar,
    avatar,
    device_type: deviceType,
    has_pin: Boolean(identity.pin_hash),
    security_question: deviceType === 'mobile' ? (identity.security_question || '') : (identity.security_question || ''),
    onboarded: identity.onboarded !== undefined ? Boolean(identity.onboarded) : true
  };
}

function sanitizePeer(peer, liveOnline = null) {
  if (!peer) return null;
  const deviceType = peer.device_type || 'desktop';
  const displayName = peer.display_name || peer.name || '';
  const avatar = peer.avatar_data ?? peer.avatar ?? '';
  const status = liveOnline === true ? 'online' : (peer.status || 'offline');
  return {
    uuid: peer.uuid,
    display_name: displayName,
    name: peer.name || displayName,
    avatar_data: avatar,
    avatar,
    device_type: deviceType,
    has_pin: Boolean(peer.pin_hash),
    gateway_uuid: peer.gateway_uuid || null,
    status,
    ip: peer.ip || '',
    ws_port: peer.ws_port || 0,
    last_seen: peer.last_seen || 0
  };
}

function sanitizeVaultListItem(item) {
  if (!item) return null;
  const base = sanitizeNodeForPublic(item);
  return {
    ...base,
    effectiveAcl: item.effectiveAcl || null,
    isProtected: Boolean(item.isProtected),
    isLocked: Boolean(item.isLocked),
    hasPassword: Boolean(item.hasPassword ?? item.password_hash),
    canRead: item.canRead !== undefined ? Boolean(item.canRead) : true,
    canWrite: item.canWrite !== undefined ? Boolean(item.canWrite) : false,
    canDelete: item.canDelete !== undefined ? Boolean(item.canDelete) : false,
    canManageAcl: item.canManageAcl !== undefined ? Boolean(item.canManageAcl) : false
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
    this.sessions = new Map(); // token -> { token, mode: 'portal', uuid, unlockedSet, hostedRegistered, createdAt }
    this._hostedTokensByUuid = new Map(); // uuid -> Set<token>
    this._disconnectTimers = new Map(); // uuid -> Timeout
    this.app = null;
    this.server = null;
    this.wss = null;
    this.wsClients = new Set();
    this._meshListeners = [];
    this._stopping = false;
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

  _resolveSession(token) {
    if (!token) return null;
    if (timingSafeCompare(token, this.sessionToken)) {
      const hostId = this.db.getIdentity();
      return {
        token: this.sessionToken,
        mode: 'linked',
        uuid: hostId?.uuid || '',
        unlockedSet: this.unlockedSet
      };
    }
    for (const [k, session] of this.sessions.entries()) {
      if (timingSafeCompare(token, k)) {
        return session;
      }
    }
    return null;
  }

  _isAuthorizedToken(token) {
    return Boolean(this._resolveSession(token));
  }

  _clearDisconnectTimer(uuid) {
    const timer = this._disconnectTimers.get(uuid);
    if (timer) {
      clearTimeout(timer);
      this._disconnectTimers.delete(uuid);
    }
  }

  _createPortalSession(uuid) {
    this._clearDisconnectTimer(uuid);
    const token = crypto.randomBytes(24).toString('hex');
    const session = {
      token,
      mode: 'portal',
      uuid,
      unlockedSet: new Set(),
      hostedRegistered: true,
      createdAt: Date.now()
    };
    this.sessions.set(token, session);

    let set = this._hostedTokensByUuid.get(uuid);
    if (!set) {
      set = new Set();
      this._hostedTokensByUuid.set(uuid, set);
    }
    set.add(token);

    if (typeof this.meshNetwork?.registerHostedPeer === 'function') {
      this.meshNetwork.registerHostedPeer(uuid);
    }
    return session;
  }

  _revokePortalSession(token) {
    const session = this.sessions.get(token);
    if (!session) return false;

    this.sessions.delete(token);
    const tokSet = this._hostedTokensByUuid.get(session.uuid);
    if (tokSet) {
      tokSet.delete(token);
      if (tokSet.size === 0) {
        this._hostedTokensByUuid.delete(session.uuid);
      }
    }

    for (const ws of Array.from(this.wsClients)) {
      if (ws._token === token) {
        ws._loggedOut = true;
        try {
          ws.close(4002, 'Logged out');
        } catch (_) {}
        this.wsClients.delete(ws);
      }
    }

    const hasOtherActiveSockets = Array.from(this.wsClients).some(
      (ws) => ws._actorUuid === session.uuid && ws.readyState === 1
    );
    if (!hasOtherActiveSockets) {
      this._clearDisconnectTimer(session.uuid);
    }

    if (session.hostedRegistered) {
      session.hostedRegistered = false;
      if (typeof this.meshNetwork?.unregisterHostedPeer === 'function') {
        this.meshNetwork.unregisterHostedPeer(session.uuid);
      }
    }

    return true;
  }

  _hasLivePeerPresence(uuid) {
    if (!uuid || !this.meshNetwork) return false;
    if (typeof this.meshNetwork._isPeerLiveOnline === 'function') {
      return this.meshNetwork._isPeerLiveOnline(uuid);
    }
    return Boolean(this.meshNetwork.peerSockets?.has(uuid));
  }

  _getActorRecord(uuid) {
    const hostId = this.db.getIdentity();
    if (hostId && uuid === hostId.uuid) {
      return hostId;
    }
    return this.db.getPeer(uuid);
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

    // Static Mobile & Web Portal PWA Shell
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
    app.get('/icon.svg', (_req, res) => {
      res.sendFile(path.join(__dirname, 'assets', 'icon.svg'));
    });
    app.get('/manifest.json', (_req, res) => {
      res.json({
        name: 'TwinSync Pro',
        short_name: 'TwinSync',
        start_url: '/',
        display: 'standalone',
        background_color: '#0f172a',
        theme_color: '#4f46e5',
        icons: [
          {
            src: '/icon.svg',
            sizes: 'any',
            type: 'image/svg+xml'
          }
        ]
      });
    });

    // =========================================================================
    // Public Auth Routes (NO token required)
    // =========================================================================

    app.get('/api/auth/accounts', (_req, res) => {
      try {
        const hostId = this.db.getIdentity();
        const rawAccounts = this.db.getAllAccounts();
        const accounts = rawAccounts.map((acc) => {
          const deviceType = acc.device_type || 'desktop';
          const isHost = Boolean(hostId && acc.uuid === hostId.uuid);
          const isOnline = isHost || this._hasLivePeerPresence(acc.uuid);
          return {
            uuid: acc.uuid,
            display_name: acc.display_name || acc.name || '',
            name: acc.name || acc.display_name || '',
            avatar_data: acc.avatar_data ?? acc.avatar ?? null,
            avatar: acc.avatar ?? acc.avatar_data ?? null,
            device_type: deviceType,
            status: isOnline ? 'online' : (acc.status || 'offline'),
            has_pin: Boolean(acc.has_pin),
            security_question: deviceType === 'mobile' ? (acc.security_question || '') : '',
            last_seen: isOnline ? Date.now() : (acc.last_seen || 0)
          };
        });
        res.json({ ok: true, accounts });
      } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
      }
    });

    app.post('/api/auth/login', (req, res) => {
      try {
        const { uuid, pin } = req.body || {};
        if (!uuid) {
          return res.status(400).json({ ok: false, error: 'Account uuid is required' });
        }
        const record = this._getActorRecord(String(uuid));
        if (!record) {
          return res.status(404).json({ ok: false, code: 'NOT_FOUND', error: 'Account not found' });
        }
        if (!record.pin_hash) {
          return res.status(403).json({
            ok: false,
            code: 'PIN_NOT_SET',
            error: 'Account PIN is not configured'
          });
        }
        if (!verifyPin(pin, record.pin_hash)) {
          return res.status(401).json({
            ok: false,
            code: 'INVALID_PIN',
            error: 'Invalid PIN'
          });
        }
        const session = this._createPortalSession(record.uuid);
        res.json({
          ok: true,
          token: session.token,
          mode: 'portal',
          identity: sanitizeIdentity(record)
        });
      } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
      }
    });

    app.post('/api/auth/register', (req, res) => {
      try {
        const { name, displayName, avatar, avatarData, pin, securityQuestion, securityAnswer } =
          req.body || {};
        const cleanName = String(name ?? displayName ?? '').trim();
        const cleanPin = String(pin ?? '').trim();
        const cleanQuestion = String(securityQuestion ?? '').trim();
        const cleanAnswer = String(securityAnswer ?? '').trim();

        if (!cleanName) {
          return res.status(400).json({ ok: false, error: 'Display name is required' });
        }
        if (!/^\d{4,6}$/.test(cleanPin)) {
          return res.status(400).json({ ok: false, error: 'PIN must be 4 to 6 numeric digits' });
        }
        if (!cleanQuestion || !cleanAnswer) {
          return res.status(400).json({
            ok: false,
            error: 'Security question and answer are required'
          });
        }

        const recoveryCode = generateRecoveryCode();
        const hostId = this.db.getIdentity();
        const peer = this.db.createStandalonePeer({
          name: cleanName,
          avatar: avatar !== undefined ? avatar : (avatarData ?? null),
          pinHash: hashPin(cleanPin),
          securityQuestion: cleanQuestion,
          securityAnswerHash: hashSecurityAnswerSha256(cleanAnswer),
          recoveryCodeHash: hashRecoveryCode(recoveryCode),
          gatewayUuid: hostId?.uuid || null
        });

        const session = this._createPortalSession(peer.uuid);
        if (typeof this.meshNetwork?.broadcastPeerSync === 'function') {
          this.meshNetwork.broadcastPeerSync(peer);
        }

        res.json({
          ok: true,
          token: session.token,
          mode: 'portal',
          recoveryCode,
          identity: sanitizeIdentity(peer)
        });
      } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
      }
    });

    app.get('/api/auth/recovery-info/:uuid', (req, res) => {
      try {
        const targetUuid = String(req.params.uuid || '');
        const hostId = this.db.getIdentity();
        if (hostId && targetUuid === hostId.uuid) {
          return res.status(400).json({
            ok: false,
            error: 'PC PIN must be changed in PC Settings'
          });
        }
        const peer = this.db.getPeer(targetUuid);
        if (!peer) {
          return res.status(404).json({ ok: false, code: 'NOT_FOUND', error: 'Account not found' });
        }
        if ((peer.device_type || 'desktop') !== 'mobile') {
          return res.status(400).json({
            ok: false,
            error: 'PC PIN must be changed in PC Settings'
          });
        }
        res.json({
          ok: true,
          uuid: peer.uuid,
          name: peer.display_name || peer.name || '',
          device_type: 'mobile',
          securityQuestion: peer.security_question || '',
          hasSecurityQA: Boolean(peer.security_answer_hash),
          hasRecoveryCode: Boolean(peer.recovery_code_hash)
        });
      } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
      }
    });

    app.post('/api/auth/recover-pin', (req, res) => {
      try {
        const { uuid, method, answerOrCode, newPin } = req.body || {};
        if (!uuid) {
          return res.status(400).json({ ok: false, error: 'uuid is required' });
        }
        const hostId = this.db.getIdentity();
        if (hostId && String(uuid) === hostId.uuid) {
          return res.status(400).json({
            ok: false,
            error: 'PC PIN must be changed in PC Settings'
          });
        }
        const peer = this.db.getPeer(String(uuid));
        if (!peer) {
          return res.status(404).json({ ok: false, code: 'NOT_FOUND', error: 'Account not found' });
        }
        if ((peer.device_type || 'desktop') !== 'mobile') {
          return res.status(400).json({
            ok: false,
            error: 'PC PIN must be changed in PC Settings'
          });
        }
        const cleanNewPin = String(newPin ?? '').trim();
        if (!/^\d{4,6}$/.test(cleanNewPin)) {
          return res.status(400).json({ ok: false, error: 'New PIN must be 4 to 6 numeric digits' });
        }

        let verified = false;
        if (method === 'security_qa') {
          verified = verifySecurityAnswerFlexible(
            answerOrCode,
            peer.security_answer_hash,
            peer.security_answer_salt
          );
        } else if (method === 'recovery_code') {
          verified = verifyRecoveryCode(answerOrCode, peer.recovery_code_hash);
        } else {
          return res.status(400).json({ ok: false, error: 'Invalid recovery method' });
        }

        if (!verified) {
          return res.status(403).json({
            ok: false,
            code: 'INVALID_CREDENTIALS',
            error: 'Invalid recovery credentials'
          });
        }

        const updatedPeer = this.db.updatePeerPin(peer.uuid, hashPin(cleanNewPin));
        if (typeof this.meshNetwork?.broadcastPeerSync === 'function') {
          this.meshNetwork.broadcastPeerSync(updatedPeer);
        }
        const session = this._createPortalSession(updatedPeer.uuid);

        res.json({
          ok: true,
          token: session.token,
          mode: 'portal',
          identity: sanitizeIdentity(updatedPeer)
        });
      } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
      }
    });

    // =========================================================================
    // Strict Token Auth Middleware for ALL Protected /api/* Routes
    // =========================================================================

    app.use('/api', (req, res, next) => {
      const token = this._extractToken(req);
      const session = this._resolveSession(token);
      if (!session) {
        return res.status(401).json({ ok: false, error: 'Unauthorized' });
      }
      req.session = session;
      next();
    });

    app.post('/api/auth/logout', (req, res) => {
      try {
        if (req.session.mode === 'portal') {
          this._revokePortalSession(req.session.token);
        } else {
          req.session.unlockedSet.clear();
        }
        res.json({ ok: true });
      } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
      }
    });

    // Bootstrap
    app.get('/api/bootstrap', (req, res) => {
      try {
        const actorUuid = req.session.uuid;
        const hostId = this.db.getIdentity();
        const actorRecord = this._getActorRecord(actorUuid) || hostId;

        const rawPeers = this.db.getPeers({ includeSelf: true }) || [];
        const peers = [];
        let hostIncluded = false;
        for (const p of rawPeers) {
          if (p.uuid === actorUuid) continue;
          if (!(p.display_name || p.name)) continue;
          if (hostId && p.uuid === hostId.uuid) hostIncluded = true;
          const isOnline =
            Boolean(hostId && p.uuid === hostId.uuid) || this._hasLivePeerPresence(p.uuid);
          peers.push(sanitizePeer(p, isOnline));
        }

        if (hostId && actorUuid !== hostId.uuid && !hostIncluded) {
          peers.unshift(
            sanitizePeer(
              {
                ...hostId,
                device_type: 'desktop',
                status: 'online',
                last_seen: Date.now()
              },
              true
            )
          );
        }

        const conversations = actorUuid ? (this.db.getConversations(actorUuid) || []) : [];
        const settings = typeof this.db.getAllSettings === 'function' ? this.db.getAllSettings() : {};
        const presenceMap =
          typeof this.meshNetwork?.getAllFilePresence === 'function'
            ? this.meshNetwork.getAllFilePresence()
            : {};

        res.json({
          ok: true,
          mode: req.session.mode,
          identity: sanitizeIdentity(actorRecord),
          peers,
          conversations,
          settings,
          presenceMap
        });
      } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
      }
    });

    // Chat Routes (strictly scoped to req.session.uuid)
    app.post('/api/conversations/dm', (req, res) => {
      try {
        const actorUuid = req.session.uuid;
        const { peerUuid } = req.body || {};
        if (!peerUuid) return res.status(400).json({ ok: false, error: 'peerUuid required' });
        const conv = this.db.ensureDmConversation(actorUuid, peerUuid);
        res.json({ ok: true, conversation: conv });
      } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
      }
    });

    app.post('/api/groups', async (req, res) => {
      try {
        const actorUuid = req.session.uuid;
        const { name, memberUuids, avatarData } = req.body || {};
        if (!name || !String(name).trim()) {
          return res.status(400).json({ ok: false, error: 'Group name required' });
        }
        const conv = await this.meshNetwork.createGroup({
          name: String(name).trim(),
          memberUuids: Array.isArray(memberUuids) ? memberUuids : [],
          avatarData: avatarData || '',
          creatorUuid: actorUuid
        });
        res.json({ ok: true, conversation: conv });
      } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
      }
    });

    app.get('/api/messages/:convId', (req, res) => {
      try {
        const actorUuid = req.session.uuid;
        if (!this.db.isConversationMember(req.params.convId, actorUuid)) {
          return res.status(403).json({
            ok: false,
            code: 'FORBIDDEN',
            error: 'Not a member of this conversation'
          });
        }
        const limit = Number(req.query.limit) || 150;
        const search = String(req.query.search || '');
        const messages = this.db.getMessages(req.params.convId, {
          limit,
          search,
          actorUuid
        });
        res.json({ ok: true, messages });
      } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
      }
    });

    app.post('/api/messages', async (req, res) => {
      try {
        const actorUuid = req.session.uuid;
        const body = req.body || {};
        const payload = { ...body, actorUuid };

        if (payload.conversationId && !this.db.isConversationMember(payload.conversationId, actorUuid)) {
          return res.status(403).json({
            ok: false,
            code: 'FORBIDDEN',
            error: 'Not a member of this conversation'
          });
        }

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
        const status = err.code === 'FORBIDDEN' ? 403 : (err.code === 'NOT_FOUND' ? 404 : 500);
        res.status(status).json({ ok: false, code: err.code, error: err.message });
      }
    });

    app.put('/api/messages/:id', async (req, res) => {
      try {
        const actorUuid = req.session.uuid;
        const existing = this.db.getMessageById(req.params.id);
        if (!existing) {
          return res.status(404).json({ ok: false, code: 'NOT_FOUND', error: 'Message not found' });
        }
        if (existing.sender_uuid !== actorUuid) {
          return res.status(403).json({
            ok: false,
            code: 'FORBIDDEN',
            error: 'Only the sender can edit this message'
          });
        }
        const { body } = req.body || {};
        const message = await this.meshNetwork.editChatMessage(
          req.params.id,
          String(body ?? ''),
          actorUuid
        );
        res.json({ ok: true, message });
      } catch (err) {
        const status = err.code === 'FORBIDDEN' ? 403 : (err.code === 'NOT_FOUND' ? 404 : 400);
        res.status(status).json({ ok: false, code: err.code, error: err.message });
      }
    });

    app.delete('/api/messages/:id', async (req, res) => {
      try {
        const actorUuid = req.session.uuid;
        const existing = this.db.getMessageById(req.params.id);
        if (!existing) {
          return res.status(404).json({ ok: false, code: 'NOT_FOUND', error: 'Message not found' });
        }
        if (existing.sender_uuid !== actorUuid) {
          return res.status(403).json({
            ok: false,
            code: 'FORBIDDEN',
            error: 'Only the sender can delete this message'
          });
        }
        const message = await this.meshNetwork.deleteChatMessage(req.params.id, actorUuid);
        res.json({ ok: true, message });
      } catch (err) {
        const status = err.code === 'FORBIDDEN' ? 403 : (err.code === 'NOT_FOUND' ? 404 : 400);
        res.status(status).json({ ok: false, code: err.code, error: err.message });
      }
    });

    app.post('/api/messages/:id/reaction', async (req, res) => {
      try {
        const actorUuid = req.session.uuid;
        const existing = this.db.getMessageById(req.params.id);
        if (!existing) {
          return res.status(404).json({ ok: false, code: 'NOT_FOUND', error: 'Message not found' });
        }
        if (!this.db.isConversationMember(existing.conversation_id, actorUuid)) {
          return res.status(403).json({ ok: false, code: 'FORBIDDEN', error: 'Not a member' });
        }
        const { emoji } = req.body || {};
        if (!emoji) return res.status(400).json({ ok: false, error: 'emoji required' });
        const result = await this.meshNetwork.toggleReaction(req.params.id, emoji, actorUuid);
        res.json({ ok: true, ...result });
      } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
      }
    });

    app.post('/api/conversations/:id/read', async (req, res) => {
      try {
        const actorUuid = req.session.uuid;
        if (!this.db.isConversationMember(req.params.id, actorUuid)) {
          return res.status(403).json({ ok: false, code: 'FORBIDDEN', error: 'Not a member' });
        }
        const readIds = await this.meshNetwork.markConversationRead(req.params.id, actorUuid);
        res.json({ ok: true, readIds });
      } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
      }
    });

    app.post('/api/conversations/:id/typing', (req, res) => {
      try {
        const actorUuid = req.session.uuid;
        if (!this.db.isConversationMember(req.params.id, actorUuid)) {
          return res.status(403).json({ ok: false, code: 'FORBIDDEN', error: 'Not a member' });
        }
        const isTyping = Boolean(req.body?.isTyping);
        this.meshNetwork.sendTyping(req.params.id, isTyping, actorUuid);
        res.json({ ok: true });
      } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
      }
    });

    // Chat File / Photo / Voice Upload
    app.post('/api/chat/upload', async (req, res) => {
      try {
        const actorUuid = req.session.uuid;
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

        if (conversationId && shouldSend && !this.db.isConversationMember(conversationId, actorUuid)) {
          return res.status(403).json({
            ok: false,
            code: 'FORBIDDEN',
            error: 'Not a member of this conversation'
          });
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
            replyToId: replyToId || null,
            actorUuid
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
        const actorUuid = req.session.uuid;
        const { attachment, targetVaultFolder = '', conflictStrategy = 'keep_both' } = req.body || {};
        if (!attachment || !attachment.blobId || !attachment.fileName) {
          return res.status(400).json({ ok: false, error: 'Valid attachment required' });
        }
        const result = await this.sandboxManager.saveChatAttachmentToVault(
          attachment,
          targetVaultFolder,
          conflictStrategy,
          actorUuid,
          req.session.unlockedSet
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

    // Vault File Manager Routes (Strictly scoped to req.session.uuid & req.session.unlockedSet!)
    app.get('/api/vault/list', (req, res) => {
      try {
        const actorUuid = req.session.uuid;
        const parentPath = normalizeRelPath(req.query.path || '');
        const dirRes = this.meshNetwork.listDirectory(
          parentPath,
          actorUuid,
          req.session.unlockedSet
        );
        if (dirRes && dirRes.locked) {
          return res.status(403).json({
            ok: false,
            code: 'LOCKED',
            blockingAncestor: dirRes.blockingAncestor
          });
        }
        const rawItems = Array.isArray(dirRes) ? dirRes : (dirRes?.items || []);
        res.json({
          ok: true,
          parentPath,
          items: rawItems.map(sanitizeVaultListItem),
          effectiveAcl: dirRes?.parentAcl || {
            role: 'owner',
            canRead: true,
            canWrite: true,
            isProtected: false,
            blockingAncestor: null
          }
        });
      } catch (err) {
        res.status(400).json({ ok: false, error: err.message });
      }
    });

    app.get('/api/vault/search', (req, res) => {
      try {
        const actorUuid = req.session.uuid;
        const q = String(req.query.q || '');
        const items = (this.meshNetwork.searchVault(q, actorUuid, req.session.unlockedSet) || [])
          .map(sanitizeVaultListItem);
        res.json({ ok: true, items });
      } catch (err) {
        res.status(400).json({ ok: false, error: err.message });
      }
    });

    app.post('/api/vault/folder', (req, res) => {
      try {
        const actorUuid = req.session.uuid;
        const { parentPath = '', name } = req.body || {};
        if (!name || !String(name).trim()) {
          return res.status(400).json({ ok: false, error: 'Folder name required' });
        }
        const node = this.meshNetwork.createFolder(
          parentPath || '',
          String(name).trim(),
          actorUuid,
          req.session.unlockedSet
        );
        res.json({ ok: true, node: sanitizeNodeForPublic(node) });
      } catch (err) {
        const status = err.code === 'FORBIDDEN' || err.code === 'LOCKED'
          ? 403
          : (err.code === 'ALREADY_EXISTS' ? 409 : 400);
        res.status(status).json({
          ok: false,
          code: err.code || 'ERROR',
          error: err.message,
          blockingAncestor: err.blockingAncestor || null
        });
      }
    });

    app.post('/api/vault/unlock', (req, res) => {
      try {
        const { relPath, password } = req.body || {};
        const norm = normalizeRelPath(relPath || '');
        const result = this.meshNetwork.verifyAndUnlockFolder(
          norm,
          String(password || ''),
          req.session.unlockedSet
        );
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
        const actorUuid = req.session.uuid;
        const relPath = normalizeRelPath(req.query.path || '');
        const result = await this.sandboxManager.getFilePreviewData(
          relPath,
          actorUuid,
          req.session.unlockedSet
        );
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
        const actorUuid = req.session.uuid;
        const relPath = normalizeRelPath(req.query.path || '');
        if (!relPath) {
          return res.status(400).json({ ok: false, error: 'path required' });
        }
        const acl = this.meshNetwork.computeEffectiveAcl(
          relPath,
          actorUuid,
          req.session.unlockedSet
        );
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
            const childAcl = this.meshNetwork.computeEffectiveAcl(
              fullRel,
              actorUuid,
              req.session.unlockedSet
            );
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
      const tempDir = path.join(os.tmpdir(), 'ts_mob_' + crypto.randomBytes(4).toString('hex'));
      try {
        const actorUuid = req.session.uuid;
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
          actorUuid,
          req.session.unlockedSet
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

    const chatEvents = new Set([
      'chat:message',
      'chat:edit',
      'chat:delete',
      'chat:typing',
      'chat:receipt',
      'chat:reaction'
    ]);

    if (chatEvents.has(event)) {
      const convId = data?.conversation_id || data?.conversationId;
      if (!convId) return;
      const payload = JSON.stringify({ event, data });
      for (const ws of this.wsClients) {
        if (ws.readyState !== 1 || !ws._actorUuid) continue;
        if (!this.db.isConversationMember(convId, ws._actorUuid)) continue;
        if (event === 'chat:typing' && data?.peerUuid === ws._actorUuid) continue;
        try {
          ws.send(payload);
        } catch (_) {}
      }
      return;
    }

    if (event === 'conversations:changed') {
      const payload = JSON.stringify({ event, data });
      const convId = data?.conversationId;
      const memberUuids = Array.isArray(data?.memberUuids) ? data.memberUuids : null;
      for (const ws of this.wsClients) {
        if (ws.readyState !== 1) continue;
        if (convId && ws._actorUuid) {
          const isMember =
            (memberUuids && memberUuids.includes(ws._actorUuid)) ||
            this.db.isConversationMember(convId, ws._actorUuid);
          if (!isMember) continue;
        }
        try {
          ws.send(payload);
        } catch (_) {}
      }
      return;
    }

    let outData = data;
    if (event === 'peers:changed' && Array.isArray(data)) {
      outData = data.map((p) => sanitizePeer(p, this._hasLivePeerPresence(p.uuid)));
    }

    const payload = JSON.stringify({ event, data: outData });
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
    this._stopping = false;
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
        const session = this._resolveSession(token);
        if (!session) {
          socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
          socket.destroy();
          return;
        }
        this.wss.handleUpgrade(request, socket, head, (ws) => {
          ws._token = session.token;
          ws._mode = session.mode;
          ws._actorUuid = session.uuid;
          this.wsClients.add(ws);

          if (session.mode === 'portal') {
            this._clearDisconnectTimer(session.uuid);
            if (!session.hostedRegistered) {
              session.hostedRegistered = true;
              if (typeof this.meshNetwork?.registerHostedPeer === 'function') {
                this.meshNetwork.registerHostedPeer(session.uuid);
              }
            }
          }

          const handleSocketDrop = () => {
            this.wsClients.delete(ws);
            if (ws._mode === 'portal' && !ws._loggedOut && !this._stopping) {
              const actorUuid = ws._actorUuid;
              const stillConnected = Array.from(this.wsClients).some(
                (c) => c._actorUuid === actorUuid && c.readyState === 1
              );
              if (!stillConnected && !this._disconnectTimers.has(actorUuid)) {
                const timer = setTimeout(() => {
                  this._disconnectTimers.delete(actorUuid);
                  if (this._stopping) return;
                  const reconnected = Array.from(this.wsClients).some(
                    (c) => c._actorUuid === actorUuid && c.readyState === 1
                  );
                  if (reconnected) return;
                  const tokSet = this._hostedTokensByUuid.get(actorUuid);
                  if (!tokSet) return;
                  for (const tok of tokSet) {
                    const sess = this.sessions.get(tok);
                    if (sess && sess.hostedRegistered) {
                      sess.hostedRegistered = false;
                      if (typeof this.meshNetwork?.unregisterHostedPeer === 'function') {
                        this.meshNetwork.unregisterHostedPeer(actorUuid);
                      }
                    }
                  }
                }, 10000);
                if (timer.unref) timer.unref();
                this._disconnectTimers.set(actorUuid, timer);
              }
            }
          };

          ws.on('close', handleSocketDrop);
          ws.on('error', handleSocketDrop);
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
    this._stopping = true;
    this._detachMeshListeners();

    for (const timer of this._disconnectTimers.values()) {
      clearTimeout(timer);
    }
    this._disconnectTimers.clear();

    for (const session of this.sessions.values()) {
      if (session.hostedRegistered) {
        session.hostedRegistered = false;
        if (typeof this.meshNetwork?.unregisterHostedPeer === 'function') {
          try {
            this.meshNetwork.unregisterHostedPeer(session.uuid);
          } catch (_) {}
        }
      }
    }
    this.sessions.clear();
    this._hostedTokensByUuid.clear();

    for (const ws of this.wsClients) {
      ws._loggedOut = true;
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
    const rawAdapters = [];
    for (const [name, list] of Object.entries(ifaces)) {
      if (!Array.isArray(list)) continue;
      for (const iface of list) {
        if (iface.family === 'IPv4' && !iface.internal && iface.address) {
          rawAdapters.push({
            name,
            ip: iface.address,
            isLan: isPrivateLanIp(iface.address)
          });
        }
      }
    }

    rawAdapters.sort((a, b) => Number(b.isLan) - Number(a.isLan));

    if (rawAdapters.length === 0) {
      rawAdapters.push({
        name: 'loopback',
        ip: '127.0.0.1',
        isLan: false
      });
    }

    const quickLinkAdapters = rawAdapters.map(({ name, ip }) => ({
      name,
      ip,
      url: `http://${ip}:${this.actualPort}/?mode=linked&token=${this.sessionToken}`
    }));

    const portalAdapters = rawAdapters.map(({ name, ip }) => ({
      name,
      ip,
      url: `http://${ip}:${this.actualPort}/?mode=portal`
    }));

    const quickLinkPrimaryUrl = quickLinkAdapters[0].url;
    const portalPrimaryUrl = portalAdapters[0].url;

    const [quickLinkQrDataUrl, portalQrDataUrl] = await Promise.all([
      QRCode.toDataURL(quickLinkPrimaryUrl, {
        width: 280,
        margin: 2,
        color: { dark: '#0f172a', light: '#ffffff' }
      }),
      QRCode.toDataURL(portalPrimaryUrl, {
        width: 280,
        margin: 2,
        color: { dark: '#0f172a', light: '#ffffff' }
      })
    ]);

    return {
      ok: true,
      port: this.actualPort,
      primaryUrl: quickLinkPrimaryUrl,
      qrDataUrl: quickLinkQrDataUrl,
      urls: quickLinkAdapters,
      adapters: quickLinkAdapters,
      quickLink: {
        primaryUrl: quickLinkPrimaryUrl,
        qrDataUrl: quickLinkQrDataUrl,
        adapters: quickLinkAdapters
      },
      portal: {
        primaryUrl: portalPrimaryUrl,
        qrDataUrl: portalQrDataUrl,
        adapters: portalAdapters
      }
    };
  }

  async rotateToken() {
    this.sessionToken = crypto.randomBytes(24).toString('hex');
    this.unlockedSet.clear();
    for (const ws of Array.from(this.wsClients)) {
      if (ws._mode === 'linked') {
        try {
          ws.close(4001, 'Session token rotated');
        } catch (_) {}
        this.wsClients.delete(ws);
      }
    }
    return this.getPairingInfo();
  }
}

module.exports = {
  MobileServer
};
