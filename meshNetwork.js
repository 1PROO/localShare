'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const dgram = require('dgram');
const crypto = require('crypto');
const EventEmitter = require('events');
const WebSocket = require('ws');
const chokidar = require('chokidar');

const {
  generateUuid,
  normalizeRecoveryKey,
  hashSecret,
  verifySecret,
  verifySecurityAnswerFlexible,
  normalizeRelPath,
  getParentRelPath,
  getAncestorPaths,
  safeResolvePath,
} = require('./database');

const CHUNK_SIZE = 64 * 1024;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const ROLE_RANK = { none: 0, viewer: 1, editor: 2, owner: 3 };
const RANK_ROLE = ['none', 'viewer', 'editor', 'owner'];

function makeCodedError(code, message, extra = {}) {
  const err = new Error(message);
  err.code = code;
  Object.assign(err, extra);
  return err;
}

function parseListField(val) {
  if (Array.isArray(val)) return val;
  if (typeof val === 'string' && val.trim()) {
    try {
      const parsed = JSON.parse(val);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }
  return [];
}

/**
 * Pure ACL chain evaluator shared by computeEffectiveAcl and canViewTrashItem.
 * @param {Array<object>} chainNodes - Ancestor nodes ordered from top-level child down to target.
 * @param {string} actorUuid
 * @param {Set<string>|null} [unlockedSet]
 */
function evaluateAclChain(chainNodes, actorUuid, unlockedSet = null) {
  if (!chainNodes || chainNodes.length === 0) {
    return {
      role: 'editor',
      canRead: true,
      canWrite: true,
      canDelete: false,
      canManageAcl: false,
      isProtected: false,
      blockingAncestor: null,
      chain: [],
    };
  }

  let minRank = ROLE_RANK.owner;
  let blockingAncestor = null;
  let isProtected = false;
  const chain = [];

  for (const node of chainNodes) {
    const allowedEditors = parseListField(node.allowed_editors ?? node.allowed_editors_json);
    const allowedViewers = parseListField(node.allowed_viewers ?? node.allowed_viewers_json);
    const permMode = node.perm_mode || 'public';
    const hasPassword = Boolean(node.password_hash);
    const isOwner = Boolean(actorUuid && node.owner_uuid && node.owner_uuid === actorUuid);
    const isUnlocked = Boolean(
      unlockedSet && typeof unlockedSet.has === 'function' && unlockedSet.has(node.rel_path)
    );

    if (permMode === 'private' || permMode === 'custom' || hasPassword) {
      isProtected = true;
    }

    let nodeRole = 'none';
    if (isOwner) {
      nodeRole = 'owner';
    } else if (hasPassword && !isUnlocked) {
      nodeRole = 'none';
    } else {
      switch (permMode) {
        case 'public':
          nodeRole = 'editor';
          break;
        case 'readonly':
          nodeRole = 'viewer';
          break;
        case 'private':
          nodeRole = hasPassword && isUnlocked ? 'editor' : 'none';
          break;
        case 'custom':
          if (allowedEditors.includes(actorUuid)) {
            nodeRole = 'editor';
          } else if (allowedViewers.includes(actorUuid)) {
            nodeRole = 'viewer';
          } else if (
            hasPassword &&
            isUnlocked &&
            allowedEditors.length === 0 &&
            allowedViewers.length === 0
          ) {
            nodeRole = 'viewer';
          } else {
            nodeRole = 'none';
          }
          break;
        default:
          nodeRole = 'editor';
      }
    }

    const nodeRank = ROLE_RANK[nodeRole] ?? 0;
    if (nodeRank === 0 && !blockingAncestor) {
      blockingAncestor = {
        relPath: node.rel_path,
        name: node.name,
        hasPassword,
        ownerUuid: node.owner_uuid,
        permMode,
      };
    }
    if (nodeRank < minRank) {
      minRank = nodeRank;
    }

    chain.push({
      relPath: node.rel_path,
      name: node.name,
      ownerUuid: node.owner_uuid,
      permMode,
      hasPassword,
      unlocked: isUnlocked,
      nodeRole,
    });
  }

  const targetNode = chainNodes[chainNodes.length - 1] || null;
  const role = RANK_ROLE[minRank] || 'none';
  const canRead = minRank >= ROLE_RANK.viewer;
  const canWrite = minRank >= ROLE_RANK.editor;
  const canDelete = minRank >= ROLE_RANK.editor;
  const canManageAcl = Boolean(
    targetNode &&
      actorUuid &&
      targetNode.owner_uuid === actorUuid &&
      minRank >= ROLE_RANK.editor
  );

  return {
    role,
    canRead,
    canWrite,
    canDelete,
    canManageAcl,
    isProtected,
    blockingAncestor,
    chain,
  };
}

function lookupNode(dbOrMap, relPath) {
  if (!dbOrMap) return null;
  if (typeof dbOrMap.getVaultNode === 'function') {
    return dbOrMap.getVaultNode(relPath);
  }
  if (dbOrMap instanceof Map) {
    return dbOrMap.get(relPath) || null;
  }
  if (typeof dbOrMap === 'function') {
    return dbOrMap(relPath);
  }
  if (Array.isArray(dbOrMap)) {
    return dbOrMap.find((n) => n.rel_path === relPath) || null;
  }
  return null;
}

/**
 * Computes Strict Ancestor ACL Inheritance from Vault root child down to relPath.
 * @param {object} db - WorkMeshDatabase (or node Map/array/lookup fn)
 * @param {string} relPath
 * @param {string} actorUuid
 * @param {Set<string>|null} [unlockedSet]
 */
function computeEffectiveAcl(db, relPath, actorUuid, unlockedSet = null) {
  const norm = normalizeRelPath(relPath);
  if (!norm) {
    return {
      role: 'editor',
      canRead: true,
      canWrite: true,
      canDelete: false,
      canManageAcl: false,
      isProtected: false,
      blockingAncestor: null,
      chain: [],
    };
  }

  const ancestors = getAncestorPaths(norm, true);
  const chainNodes = [];
  for (const ancPath of ancestors) {
    const node = lookupNode(db, ancPath);
    if (node) chainNodes.push(node);
  }

  return evaluateAclChain(chainNodes, actorUuid, unlockedSet);
}

/**
 * Checks whether actorUuid is allowed to view a Trash item based on its frozen ACL snapshot.
 * @param {object} trashItem
 * @param {string} actorUuid
 * @param {Set<string>|null} [unlockedSet]
 * @returns {boolean}
 */
function canViewTrashItem(trashItem, actorUuid, unlockedSet = null) {
  if (!trashItem) return false;
  if (actorUuid && trashItem.owner_uuid === actorUuid) return true;

  let effAcl = trashItem.effective_acl;
  if (!effAcl && trashItem.effective_acl_json) {
    try {
      effAcl =
        typeof trashItem.effective_acl_json === 'string'
          ? JSON.parse(trashItem.effective_acl_json)
          : trashItem.effective_acl_json;
    } catch (_) {
      effAcl = null;
    }
  }

  const chainNodes = Array.isArray(effAcl)
    ? effAcl
    : effAcl && Array.isArray(effAcl.chainNodes)
      ? effAcl.chainNodes
      : [];

  if (chainNodes.length === 0) {
    return false;
  }

  return evaluateAclChain(chainNodes, actorUuid, unlockedSet).canRead;
}

function sha256FileSync(filePath) {
  const hash = crypto.createHash('sha256');
  const fd = fs.openSync(filePath, 'r');
  try {
    const buf = Buffer.allocUnsafe(64 * 1024);
    let bytesRead = 0;
    while ((bytesRead = fs.readSync(fd, buf, 0, buf.length, null)) > 0) {
      hash.update(bytesRead === buf.length ? buf : buf.subarray(0, bytesRead));
    }
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest('hex');
}

function ipToInt(ip) {
  const parts = String(ip).split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) {
    return null;
  }
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function intToIp(intVal) {
  return [
    (intVal >>> 24) & 255,
    (intVal >>> 16) & 255,
    (intVal >>> 8) & 255,
    intVal & 255,
  ].join('.');
}

function computeOsBroadcastAddresses() {
  const addrs = new Set(['255.255.255.255']);
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const info of ifaces[name] || []) {
      if (info.family === 'IPv4' && info.address && info.netmask) {
        const ipInt = ipToInt(info.address);
        const maskInt = ipToInt(info.netmask);
        if (ipInt !== null && maskInt !== null) {
          const bcast = (ipInt | (~maskInt >>> 0)) >>> 0;
          addrs.add(intToIp(bcast));
        }
      }
    }
  }
  return Array.from(addrs);
}

function normalizeRemoteIp(rawIp) {
  if (!rawIp) return null;
  const s = String(rawIp);
  return s.startsWith('::ffff:') ? s.slice(7) : s;
}

function validateNameSegment(name) {
  const clean = String(name || '').trim();
  if (!clean || clean === '.' || clean === '..' || /[\/\\\0]/.test(clean)) {
    throw makeCodedError('INVALID_NAME', `Invalid file/folder name: ${name}`);
  }
  return clean;
}

function splitNameAndExt(name, isDir) {
  if (isDir) return { base: name, ext: '' };
  const idx = name.lastIndexOf('.');
  if (idx <= 0) return { base: name, ext: '' };
  return { base: name.slice(0, idx), ext: name.slice(idx) };
}

class MeshNetwork extends EventEmitter {
  /**
   * @param {object} opts
   * @param {import('./database').WorkMeshDatabase} opts.db
   * @param {object} opts.vaultPaths
   * @param {number} [opts.udpPort=41234]
   * @param {number} [opts.wsPort=41235]
   * @param {string[]|null} [opts.broadcastAddresses=null]
   * @param {number[]|null} [opts.discoveryPorts=null]
   * @param {Array<{host:string,port:number}>|null} [opts.discoveryTargets=null]
   * @param {number} [opts.discoveryIntervalMs=3000]
   */
  constructor({
    db,
    vaultPaths,
    udpPort = 41234,
    wsPort = 41235,
    broadcastAddresses = null,
    discoveryPorts = null,
    discoveryTargets = null,
    discoveryIntervalMs = 3000,
  }) {
    super();
    this.db = db;
    this.vaultPaths = vaultPaths;
    this.requestedUdpPort = udpPort;
    this.requestedWsPort = wsPort;
    this.broadcastAddresses = broadcastAddresses;
    this.discoveryPorts = discoveryPorts;
    this.discoveryTargets = discoveryTargets;
    this.discoveryIntervalMs = discoveryIntervalMs;

    this.udpPort = udpPort;
    this.wsPort = wsPort;
    this.udpSocket = null;
    this.wss = null;
    this.watcher = null;
    this.discoveryTimer = null;

    this.peerSockets = new Map(); // peerUuid -> WebSocket
    this.connectingPeers = new Map(); // peerUuid -> WebSocket
    this.reconnectTimers = new Map(); // peerUuid -> { timer, attempt }
    this.offlineQueues = new Map(); // peerUuid -> object[]
    this.suppressedPaths = new Map(); // relPath -> expiryMs
    this.presenceMap = new Map(); // relPath -> Map<peerUuid, entry>
    this.activeTransfers = new Map(); // key -> Promise
    this.pendingTransfers = new Map(); // transferId -> transferState
    this._beaconCooldown = new Map(); // peerUuid -> ts
    this.hostedMobilePeers = new Map(); // peerUuid -> count
    this.remoteHostedPeers = new Map(); // peerUuid -> Set<gatewayUuid>

    this._stopped = true;
    this.identity = null;
    this.myUuid = null;
  }

  _ensureVaultDirs() {
    const dirs = [
      this.vaultPaths.vaultRoot,
      this.vaultPaths.filesDir,
      this.vaultPaths.trashDir,
      this.vaultPaths.chatBlobsDir,
      this.vaultPaths.metaDir,
      this.vaultPaths.stagingDir,
    ];
    for (const d of dirs) {
      if (d) fs.mkdirSync(d, { recursive: true });
    }
  }

  _getPublicIdentity() {
    const id = this.db.getIdentity() || this.db.ensureIdentity();
    this.identity = id;
    this.myUuid = id.uuid;
    return {
      uuid: id.uuid,
      display_name: id.display_name || '',
      name: id.display_name || '',
      avatar_data: id.avatar_data ?? null,
      avatar: id.avatar_data ?? null,
      device_type: 'desktop',
      pin_hash: id.pin_hash ?? null,
      ws_port: this.wsPort,
      recovery_key_hash: id.recovery_key_hash || null,
      recovery_key_salt: id.recovery_key_salt || null,
      security_question: id.security_question || null,
      security_answer_hash: id.security_answer_hash || null,
      security_answer_salt: id.security_answer_salt || null,
      updated_at: id.updated_at || Date.now(),
    };
  }

  _serializePeerForSync(p) {
    if (!p) return null;
    const displayName = p.display_name || p.name || '';
    const avatar = p.avatar_data !== undefined ? p.avatar_data : (p.avatar ?? null);
    return {
      uuid: p.uuid,
      display_name: displayName,
      name: p.name || displayName,
      avatar_data: avatar,
      avatar,
      device_type: p.device_type || 'desktop',
      pin_hash: p.pin_hash ?? null,
      recovery_code_hash: p.recovery_code_hash ?? null,
      recovery_key_hash: p.recovery_key_hash ?? null,
      recovery_key_salt: p.recovery_key_salt ?? null,
      security_question: p.security_question ?? null,
      security_answer_hash: p.security_answer_hash ?? null,
      security_answer_salt: p.security_answer_salt ?? null,
      gateway_uuid: p.gateway_uuid ?? null,
      updated_at: p.updated_at || 0,
    };
  }

  _isPeerLiveOnline(peerUuid) {
    if (!peerUuid) return false;
    if (peerUuid === this.myUuid) return true;
    if (this.peerSockets.has(peerUuid)) return true;
    if (this.hostedMobilePeers.has(peerUuid)) return true;
    const remoteGws = this.remoteHostedPeers.get(peerUuid);
    return Boolean(remoteGws && remoteGws.size > 0);
  }

  _getActorPinHash(actorUuid) {
    if (!actorUuid) return null;
    const rec =
      actorUuid === this.myUuid
        ? this.db.getIdentity()
        : this.db.getPeer(actorUuid);
    return rec?.pin_hash || null;
  }

  _signActorProof(actorUuid, type, target, lamportTs) {
    const pinHash = this._getActorPinHash(actorUuid);
    if (!pinHash) return null;
    return crypto
      .createHmac('sha256', String(pinHash))
      .update(`${type}:${actorUuid}:${target}:${lamportTs || 0}`)
      .digest('hex');
  }

  _verifyActorProof(actorUuid, type, target, lamportTs, proofHex) {
    if (!actorUuid || !proofHex) return false;
    const expected = this._signActorProof(actorUuid, type, target, lamportTs);
    if (!expected) return false;
    try {
      const a = Buffer.from(expected, 'hex');
      const b = Buffer.from(String(proofHex), 'hex');
      if (a.length === 0 || a.length !== b.length) return false;
      return crypto.timingSafeEqual(a, b);
    } catch (_) {
      return false;
    }
  }

  _resolveEffectiveActor(senderUuid, msg, target, lamportTs) {
    if (!msg || !msg.actorUuid || msg.actorUuid === senderUuid) {
      return senderUuid;
    }
    const claimedActor = String(msg.actorUuid);
    if (claimedActor === this.myUuid) {
      return senderUuid;
    }
    const gateways = this.remoteHostedPeers.get(claimedActor);
    if (!gateways || !gateways.has(senderUuid)) {
      return senderUuid;
    }
    if (!this._verifyActorProof(claimedActor, msg.type, target, lamportTs, msg.actorProof)) {
      return senderUuid;
    }
    return claimedActor;
  }

  broadcastPeerSync(peerOrUuid) {
    const peer = typeof peerOrUuid === 'string' ? this.db.getPeer(peerOrUuid) : peerOrUuid;
    if (!peer || !peer.uuid) return;
    const serialized = this._serializePeerForSync(peer);
    const hosted = this.hostedMobilePeers.has(peer.uuid);
    this.broadcast({
      type: 'PEER_SYNC',
      peer: serialized,
      hosted,
      gatewayUuid: hosted ? this.myUuid : (peer.gateway_uuid ?? null),
    });
  }

  registerHostedPeer(peerUuid) {
    if (!peerUuid) return;
    const prevCount = this.hostedMobilePeers.get(peerUuid) || 0;
    this.hostedMobilePeers.set(peerUuid, prevCount + 1);
    if (peerUuid === this.myUuid) return;

    if (prevCount === 0) {
      const existing = this.db.getPeer(peerUuid);
      if (existing) {
        const updated = this.db.upsertPeer({
          uuid: peerUuid,
          status: 'online',
          last_seen: Date.now(),
          gateway_uuid: this.myUuid,
          updated_at: Math.max(Date.now(), (existing.updated_at || 0) + 1),
        });
        this.broadcast({
          type: 'PEER_ANNOUNCE',
          action: 'online',
          peerUuid,
          gatewayUuid: this.myUuid,
          peer: this._serializePeerForSync(updated),
        });
        this.emit('peers:changed', this.db.getPeers());
      }
    }
  }

  unregisterHostedPeer(peerUuid) {
    if (!peerUuid) return;
    const prevCount = this.hostedMobilePeers.get(peerUuid) || 0;
    if (prevCount > 1) {
      this.hostedMobilePeers.set(peerUuid, prevCount - 1);
      return;
    }
    this.hostedMobilePeers.delete(peerUuid);
    if (peerUuid === this.myUuid) return;

    const existing = this.db.getPeer(peerUuid);
    const stillOnline = this._isPeerLiveOnline(peerUuid);
    const nextGw = this.remoteHostedPeers.get(peerUuid)
      ? (Array.from(this.remoteHostedPeers.get(peerUuid))[0] || null)
      : null;

    let updated = existing;
    if (existing) {
      updated = this.db.upsertPeer({
        uuid: peerUuid,
        status: stillOnline ? 'online' : 'offline',
        last_seen: Date.now(),
        gateway_uuid: existing.gateway_uuid === this.myUuid ? nextGw : existing.gateway_uuid,
        updated_at: Math.max(Date.now(), (existing.updated_at || 0) + 1),
      });
    }

    this.broadcast({
      type: 'PEER_ANNOUNCE',
      action: 'offline',
      peerUuid,
      gatewayUuid: this.myUuid,
      peer: updated ? this._serializePeerForSync(updated) : null,
    });
    this.emit('peers:changed', this.db.getPeers());
  }

  async start() {
    this._stopped = false;
    this._ensureVaultDirs();
    this.identity = this.db.ensureIdentity();
    this.myUuid = this.identity.uuid;

    // Purge expired trash items on startup
    this._purgeExpiredTrashWithDisk();

    // Index any pre-existing files on disk not yet in vault_nodes
    this._scanLocalVaultDisk();

    await this._startWsServer();
    await this._startUdpDiscovery();
    this._startChokidar();

    return this.getStatus();
  }

  async stop() {
    this._stopped = true;

    if (this.discoveryTimer) {
      clearInterval(this.discoveryTimer);
      this.discoveryTimer = null;
    }

    for (const rec of this.reconnectTimers.values()) {
      clearTimeout(rec.timer);
    }
    this.reconnectTimers.clear();

    for (const state of this.pendingTransfers.values()) {
      try {
        if (state.fd !== undefined && state.fd !== null) fs.closeSync(state.fd);
        if (state.stagingPath && fs.existsSync(state.stagingPath)) fs.unlinkSync(state.stagingPath);
      } catch (_) {}
      state.reject(makeCodedError('STOPPED', 'MeshNetwork stopped'));
    }
    this.pendingTransfers.clear();
    this.activeTransfers.clear();

    if (this.watcher) {
      try {
        await this.watcher.close();
      } catch (_) {}
      this.watcher = null;
    }

    for (const ws of this.connectingPeers.values()) {
      try {
        ws.terminate();
      } catch (_) {}
    }
    this.connectingPeers.clear();

    for (const ws of this.peerSockets.values()) {
      try {
        ws.close(1000, 'Shutdown');
      } catch (_) {}
    }
    this.peerSockets.clear();
    this.hostedMobilePeers.clear();
    this.remoteHostedPeers.clear();

    if (this.udpSocket) {
      await new Promise((resolve) => {
        try {
          this.udpSocket.close(() => resolve());
        } catch (_) {
          resolve();
        }
      });
      this.udpSocket = null;
    }

    if (this.wss) {
      await new Promise((resolve) => {
        try {
          for (const client of this.wss.clients) {
            try {
              client.terminate();
            } catch (_) {}
          }
          this.wss.close(() => resolve());
        } catch (_) {
          resolve();
        }
      });
      this.wss = null;
    }
  }

  getStatus() {
    const connectedPeers = Array.from(this.peerSockets.keys()).filter((uuid) => {
      const ws = this.peerSockets.get(uuid);
      return ws && ws.readyState === WebSocket.OPEN;
    });
    return {
      wsPort: this.wsPort,
      udpPort: this.udpPort,
      myUuid: this.myUuid,
      connectedPeers,
      onlineCount: connectedPeers.length,
    };
  }

  // =========================================================================
  // WebSocket Server & Peer Connection Management
  // =========================================================================

  _startWsServer() {
    return new Promise((resolve, reject) => {
      const wss = new WebSocket.Server({ host: '0.0.0.0', port: this.requestedWsPort });
      this.wss = wss;

      const onError = (err) => {
        wss.removeListener('listening', onListening);
        reject(err);
      };
      const onListening = () => {
        wss.removeListener('error', onError);
        const addr = wss.address();
        this.wsPort = typeof addr === 'object' && addr ? addr.port : this.requestedWsPort;
        resolve();
      };

      wss.once('error', onError);
      wss.once('listening', onListening);

      wss.on('connection', (ws, req) => {
        ws._direction = 'inbound';
        ws._remoteIp = normalizeRemoteIp(req?.socket?.remoteAddress);
        this._attachWsHandlers(ws);
        this._sendSyncHello(ws);
      });
    });
  }

  _attachWsHandlers(ws) {
    ws.on('message', (data) => {
      if (this._stopped || this.db?.closed) return;
      let msg;
      try {
        const str = typeof data === 'string' ? data : data.toString('utf8');
        msg = JSON.parse(str);
      } catch (_) {
        return;
      }
      try {
        this._handleWsMessage(ws, msg);
      } catch (err) {
        if (!this._stopped && !this.db?.closed) {
          this.emit('error', err);
        }
      }
    });

    ws.on('close', () => {
      this._handleWsClose(ws);
    });

    ws.on('error', () => {
      // Closed handler will clean up
    });
  }

  connectToPeer(ip, wsPort, expectedUuid = null) {
    if (this._stopped || !ip || !wsPort) return;
    const cleanIp = normalizeRemoteIp(ip);

    if (expectedUuid) {
      const existing = this.peerSockets.get(expectedUuid);
      if (existing && existing.readyState === WebSocket.OPEN) {
        if (existing._remoteIp === cleanIp && existing._remoteWsPort === wsPort) {
          return;
        }
      }
      const inFlight = this.connectingPeers.get(expectedUuid);
      if (inFlight && (inFlight.readyState === WebSocket.CONNECTING || inFlight.readyState === WebSocket.OPEN)) {
        if (inFlight._remoteIp === cleanIp && inFlight._remoteWsPort === wsPort) {
          return;
        }
        try {
          inFlight._replaced = true;
          inFlight.terminate();
        } catch (_) {}
      }
    }

    const url = `ws://${cleanIp}:${wsPort}`;
    const ws = new WebSocket(url);
    ws._direction = 'outbound';
    ws._remoteIp = cleanIp;
    ws._remoteWsPort = wsPort;
    ws._expectedUuid = expectedUuid;

    if (expectedUuid) {
      this.connectingPeers.set(expectedUuid, ws);
    }

    ws.on('open', () => {
      if (this._stopped) {
        ws.close();
        return;
      }
      if (expectedUuid && this.connectingPeers.get(expectedUuid) === ws) {
        this.connectingPeers.delete(expectedUuid);
      }
      const rec = expectedUuid && this.reconnectTimers.get(expectedUuid);
      if (rec) {
        clearTimeout(rec.timer);
        this.reconnectTimers.delete(expectedUuid);
      }
      this._sendSyncHello(ws);
    });

    this._attachWsHandlers(ws);
  }

  _handleWsClose(ws) {
    const peerUuid = ws._peerUuid || ws._expectedUuid;
    if (peerUuid && this.connectingPeers.get(peerUuid) === ws) {
      this.connectingPeers.delete(peerUuid);
    }

    if (ws._peerUuid && this.peerSockets.get(ws._peerUuid) === ws) {
      this.peerSockets.delete(ws._peerUuid);
      if (!this._stopped && !this.db?.closed) {
        this.db.setPeerStatus(ws._peerUuid, 'offline', Date.now());
        this._clearPeerPresence(ws._peerUuid);

        // Clean up remoteHostedPeers previously hosted through this gateway PC
        for (const [hostedUuid, gateways] of this.remoteHostedPeers.entries()) {
          if (gateways.delete(ws._peerUuid)) {
            if (gateways.size === 0) {
              this.remoteHostedPeers.delete(hostedUuid);
            }
            if (hostedUuid !== this.myUuid) {
              const stillOnline =
                this.peerSockets.has(hostedUuid) ||
                this.hostedMobilePeers.has(hostedUuid) ||
                (this.remoteHostedPeers.get(hostedUuid)?.size > 0);
              this.db.setPeerStatus(hostedUuid, stillOnline ? 'online' : 'offline', Date.now());
              const cur = this.db.getPeer(hostedUuid);
              if (cur && cur.gateway_uuid === ws._peerUuid) {
                const nextGw = this.remoteHostedPeers.get(hostedUuid)
                  ? (Array.from(this.remoteHostedPeers.get(hostedUuid))[0] || null)
                  : null;
                this.db.db.prepare('UPDATE peers SET gateway_uuid = ? WHERE uuid = ?').run(nextGw, hostedUuid);
              }
            }
          }
        }

        this.emit('peers:changed', this.db.getPeers());
      }

      // Fail any pending transfers owed by this socket
      for (const [tid, st] of this.pendingTransfers.entries()) {
        if (st.peerUuid === ws._peerUuid) {
          this.pendingTransfers.delete(tid);
          try {
            if (st.fd !== undefined && st.fd !== null) fs.closeSync(st.fd);
            if (st.stagingPath && fs.existsSync(st.stagingPath)) fs.unlinkSync(st.stagingPath);
          } catch (_) {}
          st.reject(makeCodedError('PEER_DISCONNECTED', 'Peer disconnected during transfer'));
        }
      }

      if (!this._stopped && !ws._replaced && this.myUuid < ws._peerUuid) {
        this._scheduleReconnect(ws._peerUuid);
      }
    }
  }

  _scheduleReconnect(peerUuid) {
    if (this._stopped || this.reconnectTimers.has(peerUuid)) return;
    const prevAttempt = this.reconnectTimers.get(peerUuid)?.attempt || 0;
    const delay = Math.min(1000 * Math.pow(1.5, prevAttempt), 15000);
    const timer = setTimeout(() => {
      this.reconnectTimers.delete(peerUuid);
      if (this._stopped) return;
      const peer = this.db.getPeer(peerUuid);
      if (peer && peer.ip && peer.ws_port) {
        this.connectToPeer(peer.ip, peer.ws_port, peerUuid);
      }
    }, delay);
    if (timer.unref) timer.unref();
    this.reconnectTimers.set(peerUuid, { timer, attempt: prevAttempt + 1 });
  }

  // =========================================================================
  // UDP Discovery
  // =========================================================================

  _startUdpDiscovery() {
    return new Promise((resolve, reject) => {
      const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
      this.udpSocket = sock;

      const onError = (err) => {
        sock.removeListener('listening', onListening);
        reject(err);
      };

      const onListening = () => {
        sock.removeListener('error', onError);
        try {
          sock.setBroadcast(true);
        } catch (_) {}
        const addr = sock.address();
        this.udpPort = typeof addr === 'object' && addr ? addr.port : this.requestedUdpPort;

        this.discoveryTimer = setInterval(() => {
          this.sendDiscoveryNow();
        }, this.discoveryIntervalMs);
        if (this.discoveryTimer.unref) this.discoveryTimer.unref();

        this.sendDiscoveryNow();
        setTimeout(() => {
          if (!this._stopped) this.sendDiscoveryNow();
        }, 120);

        resolve();
      };

      sock.once('error', onError);
      sock.once('listening', onListening);

      sock.on('message', (buf, rinfo) => {
        if (this._stopped || this.db?.closed) return;
        let msg;
        try {
          msg = JSON.parse(buf.toString('utf8'));
        } catch (_) {
          return;
        }
        if (!msg || (msg.app !== 'twinsync' && msg.app !== 'workmesh') || !msg.uuid || msg.uuid === this.myUuid) {
          return;
        }
        const senderIp = normalizeRemoteIp(rinfo.address);
        this._handleDiscoveredPeer(
          {
            uuid: msg.uuid,
            displayName: msg.displayName || '',
            ip: senderIp,
            wsPort: Number(msg.wsPort),
            updatedAt: Number(msg.updatedAt) || Date.now(),
          },
          rinfo
        );
      });

      sock.bind(this.requestedUdpPort);
    });
  }

  _buildDiscoveryPacket() {
    const id = this.db.getIdentity() || this.identity;
    return Buffer.from(
      JSON.stringify({
        app: 'twinsync',
        uuid: this.myUuid,
        displayName: id?.display_name || '',
        wsPort: this.wsPort,
        updatedAt: id?.updated_at || Date.now(),
      })
    );
  }

  sendDiscoveryNow() {
    if (this._stopped || !this.udpSocket) return;
    const packet = this._buildDiscoveryPacket();

    if (Array.isArray(this.discoveryTargets) && this.discoveryTargets.length > 0) {
      for (const t of this.discoveryTargets) {
        if (!t || !t.host || !t.port) continue;
        this.udpSocket.send(packet, Number(t.port), String(t.host), () => {});
      }
      return;
    }

    const addrs = new Set(
      Array.isArray(this.broadcastAddresses) && this.broadcastAddresses.length > 0
        ? this.broadcastAddresses
        : computeOsBroadcastAddresses()
    );
    if (addrs.has('127.0.0.1')) {
      addrs.add('127.255.255.255');
    }

    const ports =
      Array.isArray(this.discoveryPorts) && this.discoveryPorts.length > 0
        ? this.discoveryPorts
        : [this.udpPort];

    for (const port of ports) {
      if (!port) continue;
      for (const host of addrs) {
        this.udpSocket.send(packet, Number(port), host, () => {});
      }
    }
  }

  _handleDiscoveredPeer({ uuid, displayName, ip, wsPort, updatedAt }, rinfo) {
    if (!uuid || uuid === this.myUuid || !wsPort) return;

    const existingPeer = this.db.getPeer(uuid);
    const endpointChanged =
      !existingPeer || existingPeer.ip !== ip || Number(existingPeer.ws_port) !== Number(wsPort);

    this.db.upsertPeer({
      uuid,
      display_name: existingPeer?.display_name || displayName,
      ip,
      ws_port: wsPort,
      status: this.peerSockets.has(uuid) ? 'online' : (existingPeer?.status || 'offline'),
      last_seen: Date.now(),
      updated_at: existingPeer?.updated_at || updatedAt,
    });

    if (endpointChanged) {
      this.emit('peers:changed', this.db.getPeers());
    }

    const activeWs = this.peerSockets.get(uuid);
    const isConnected = activeWs && activeWs.readyState === WebSocket.OPEN;

    if (this.myUuid < uuid) {
      if (!isConnected || endpointChanged) {
        if (activeWs && endpointChanged) {
          try {
            activeWs._replaced = true;
            activeWs.close(1000, 'Endpoint changed');
          } catch (_) {}
        }
        this.connectToPeer(ip, wsPort, uuid);
      }
    } else if (!isConnected && rinfo && this.udpSocket) {
      // Reply directly so the lower-UUID peer discovers us immediately if it missed our broadcast
      const now = Date.now();
      const last = this._beaconCooldown.get(uuid) || 0;
      if (now - last > 500) {
        this._beaconCooldown.set(uuid, now);
        const packet = this._buildDiscoveryPacket();
        this.udpSocket.send(packet, rinfo.port, rinfo.address, () => {});
      }
    }
  }

  // =========================================================================
  // Messaging & Sync Protocol
  // =========================================================================

  _sendRaw(ws, obj) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    ws.send(JSON.stringify(obj));
    return true;
  }

  sendToPeer(peerUuid, obj) {
    if (!peerUuid || peerUuid === this.myUuid) return false;
    const ws = this.peerSockets.get(peerUuid);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(obj));
      return true;
    }
    // Queue for transient disconnects while keeping queue bounded
    let q = this.offlineQueues.get(peerUuid);
    if (!q) {
      q = [];
      this.offlineQueues.set(peerUuid, q);
    }
    if (q.length < 500) {
      q.push(obj);
    }
    return false;
  }

  broadcast(obj, targetPeerUuids = null) {
    if (Array.isArray(targetPeerUuids)) {
      for (const uuid of targetPeerUuids) {
        if (uuid && uuid !== this.myUuid) {
          this.sendToPeer(uuid, obj);
        }
      }
      return;
    }
    for (const [uuid, ws] of this.peerSockets.entries()) {
      if (uuid !== this.myUuid && ws.readyState === WebSocket.OPEN) {
        this._sendRaw(ws, obj);
      }
    }
  }

  _sendSyncHello(ws) {
    const pubId = this._getPublicIdentity();
    const convs = this.db.getAllConversationsWithMembers().map((c) => ({
      id: c.id,
      type: c.type,
      name: c.name,
      avatar_data: c.avatar_data,
      creator_uuid: c.creator_uuid,
      created_at: c.created_at,
      updated_at: c.updated_at,
      members: c.members || [],
    }));

    const vaultManifest = this.db.getAllVaultNodes();
    const trashManifest = this.db.getTrashItems();
    const myPresence = [];
    for (const [relPath, peerMap] of this.presenceMap.entries()) {
      const mine = peerMap.get(this.myUuid);
      if (mine) {
        myPresence.push({ ...mine, relPath });
      }
    }

    const allPeers = this.db
      .getPeers({ includeSelf: false })
      .map((p) => this._serializePeerForSync(p));
    const hostedPeers = Array.from(this.hostedMobilePeers.keys());

    this._sendRaw(ws, {
      type: 'SYNC_HELLO',
      identity: pubId,
      conversations: convs,
      vaultManifest,
      trashManifest,
      filePresence: myPresence,
      peers: allPeers,
      hostedPeers,
    });
  }

  _handleWsMessage(ws, msg) {
    if (!msg || typeof msg.type !== 'string') return;

    if (msg.type === 'SYNC_HELLO') {
      this._handleSyncHello(ws, msg);
      return;
    }

    const senderUuid = ws._peerUuid;
    if (!senderUuid) return;

    switch (msg.type) {
      case 'SYNC_DELTA_REQ':
        this._handleSyncDeltaReq(ws, senderUuid, msg);
        break;
      case 'SYNC_DELTA_RES':
        this._handleSyncDeltaRes(senderUuid, msg);
        break;
      case 'PROFILE_UPDATE':
        this._handleProfileUpdate(senderUuid, msg);
        break;
      case 'PEER_SYNC':
        this._handlePeerSync(senderUuid, msg);
        break;
      case 'PEER_ANNOUNCE':
        this._handlePeerAnnounce(senderUuid, msg);
        break;
      case 'GROUP_UPSERT':
        this._handleGroupUpsert(msg);
        break;
      case 'CHAT_MESSAGE':
        this._handleIncomingChatMessage(senderUuid, msg);
        break;
      case 'CHAT_EDIT':
        this._handleIncomingChatEdit(senderUuid, msg);
        break;
      case 'CHAT_DELETE':
        this._handleIncomingChatDelete(senderUuid, msg);
        break;
      case 'CHAT_TYPING': {
        const typingActor =
          msg.peerUuid &&
          msg.peerUuid !== senderUuid &&
          this.remoteHostedPeers.get(msg.peerUuid)?.has(senderUuid)
            ? msg.peerUuid
            : senderUuid;
        this.emit('chat:typing', {
          conversationId: msg.conversationId,
          peerUuid: typingActor,
          displayName: msg.displayName,
          isTyping: Boolean(msg.isTyping),
        });
        break;
      }
      case 'CHAT_RECEIPT':
        this._handleIncomingChatReceipt(senderUuid, msg);
        break;
      case 'CHAT_REACTION':
        this._handleIncomingChatReaction(senderUuid, msg);
        break;
      case 'VAULT_DIR_CREATE':
        this._handleRemoteVaultDirCreate(senderUuid, msg);
        break;
      case 'VAULT_FILE_UPDATE':
        this._handleRemoteVaultFileUpdate(senderUuid, msg);
        break;
      case 'VAULT_ACL_UPDATE':
        this._handleRemoteVaultAclUpdate(senderUuid, msg);
        break;
      case 'VAULT_NODE_RENAME':
        this._handleRemoteVaultRename(senderUuid, msg);
        break;
      case 'VAULT_NODE_MOVE':
        this._handleRemoteVaultMove(senderUuid, msg);
        break;
      case 'TRASH_ADD':
        this._handleRemoteTrashAdd(senderUuid, msg);
        break;
      case 'TRASH_RESTORE':
        this._handleRemoteTrashRestore(senderUuid, msg);
        break;
      case 'TRASH_PURGE':
        this._handleRemoteTrashPurge(senderUuid, msg);
        break;
      case 'FILE_PRESENCE':
        this._handleRemoteFilePresence(senderUuid, msg);
        break;
      case 'CHUNK_REQ':
        this._handleChunkRequest(ws, msg);
        break;
      case 'CHUNK_DATA':
        this._handleChunkData(msg);
        break;
      case 'CHUNK_DONE':
        this._handleChunkDone(msg);
        break;
      case 'CHUNK_ERROR':
        this._handleChunkError(msg);
        break;
      default:
        break;
    }
  }

  _handleSyncHello(ws, msg) {
    const remoteId = msg.identity;
    if (!remoteId || !remoteId.uuid || remoteId.uuid === this.myUuid) {
      ws.close(1000, 'Invalid identity');
      return;
    }

    const remoteUuid = remoteId.uuid;
    const expectedOutbound = this.myUuid < remoteUuid;
    const existing = this.peerSockets.get(remoteUuid);

    if (existing && existing !== ws && existing.readyState === WebSocket.OPEN) {
      const existingMatchesTie =
        (expectedOutbound && existing._direction === 'outbound') ||
        (!expectedOutbound && existing._direction === 'inbound');
      const incomingMatchesTie =
        (expectedOutbound && ws._direction === 'outbound') ||
        (!expectedOutbound && ws._direction === 'inbound');

      if (existingMatchesTie && !incomingMatchesTie && existing._remoteIp === ws._remoteIp) {
        ws._replaced = true;
        ws.close(1000, 'Duplicate connection');
        return;
      }
      existing._replaced = true;
      existing.close(1000, 'Superseded by newer connection');
    }

    ws._peerUuid = remoteUuid;
    ws._remoteWsPort = remoteId.ws_port || ws._remoteWsPort || null;
    this.peerSockets.set(remoteUuid, ws);

    const rec = this.reconnectTimers.get(remoteUuid);
    if (rec) {
      clearTimeout(rec.timer);
      this.reconnectTimers.delete(remoteUuid);
    }

    // Update peer identity & endpoint (IP change seamlessly preserves UUID)
    this.db.upsertPeer({
      ...remoteId,
      device_type: remoteId.device_type || 'desktop',
      ip: ws._remoteIp || undefined,
      ws_port: remoteId.ws_port || ws._remoteWsPort || undefined,
      status: 'online',
      last_seen: Date.now(),
    });

    // Reconcile hosted peers announced by remoteUuid
    for (const [hostedUuid, gateways] of this.remoteHostedPeers.entries()) {
      if (gateways.delete(remoteUuid) && gateways.size === 0) {
        this.remoteHostedPeers.delete(hostedUuid);
      }
    }
    if (Array.isArray(msg.hostedPeers)) {
      for (const hUuid of msg.hostedPeers) {
        if (!hUuid || hUuid === this.myUuid || hUuid === remoteUuid) continue;
        let gws = this.remoteHostedPeers.get(hUuid);
        if (!gws) {
          gws = new Set();
          this.remoteHostedPeers.set(hUuid, gws);
        }
        gws.add(remoteUuid);
        const existingHosted = this.db.getPeer(hUuid);
        if (existingHosted) {
          this.db.upsertPeer({
            uuid: hUuid,
            status: 'online',
            last_seen: Date.now(),
            gateway_uuid: remoteUuid,
          });
        }
      }
    }

    // Propagate all synced peers (desktop + standalone mobile accounts)
    if (Array.isArray(msg.peers)) {
      for (const p of msg.peers) {
        if (p && p.uuid && p.uuid !== this.myUuid && p.uuid !== remoteUuid) {
          const cur = this.db.getPeer(p.uuid);
          const isOnline = this._isPeerLiveOnline(p.uuid);
          const activeGw = this.hostedMobilePeers.has(p.uuid)
            ? this.myUuid
            : (this.remoteHostedPeers.get(p.uuid)?.size > 0
                ? Array.from(this.remoteHostedPeers.get(p.uuid))[0]
                : null);

          if (!cur || (p.updated_at || 0) >= (cur.updated_at || 0)) {
            this.db.upsertPeer({
              ...p,
              gateway_uuid: activeGw,
              status: isOnline ? 'online' : (cur?.status && this.peerSockets.has(p.uuid) ? 'online' : 'offline'),
              last_seen: isOnline ? Date.now() : (cur?.last_seen || 0),
            });
          } else if (isOnline && cur.status !== 'online') {
            this.db.setPeerStatus(p.uuid, 'online', Date.now());
          }
        }
      }
    }

    // Replicate ALL conversations across desktop peers for roaming & mobile gateway routing
    let convChanged = false;
    if (Array.isArray(msg.conversations)) {
      for (const c of msg.conversations) {
        if (c && c.id) {
          this.db.upsertConversation(c, c.members || []);
          convChanged = true;
        }
      }
    }

    // Merge remote file presence
    this._clearPeerPresence(remoteUuid, false);
    if (Array.isArray(msg.filePresence)) {
      for (const pres of msg.filePresence) {
        if (pres && pres.relPath) {
          this._setPresenceEntry(pres.relPath, {
            peerUuid: remoteUuid,
            displayName: pres.displayName || remoteId.display_name || 'Peer',
            mode: pres.mode || 'view',
            openedAt: pres.openedAt || Date.now(),
          });
        }
      }
    }
    this.emit('presence:changed', this.getAllFilePresence());

    // Merge trash manifest & clean stale vault nodes deleted while offline
    let trashChanged = false;
    const activeTrashByPath = new Map();
    if (Array.isArray(msg.trashManifest)) {
      for (const t of msg.trashManifest) {
        if (!t || !t.id) continue;
        activeTrashByPath.set(t.original_rel_path, t);
        const existingTrash = this.db.getTrashItem(t.id);
        if (!existingTrash) {
          this.db.insertTrashItem(t);
          trashChanged = true;
        }
        // If we still hold an older node at original_rel_path deleted by remote trash, remove local stale node
        const localNode = this.db.getVaultNode(t.original_rel_path);
        if (localNode && (localNode.updated_at || 0) <= (t.deleted_at || 0)) {
          this._deleteLocalVaultDiskAndDb(t.original_rel_path);
        }
      }
    }

    // Reconcile local trash items owned by remoteUuid that were restored/purged while we were offline
    if (Array.isArray(msg.trashManifest)) {
      const remoteTrashIds = new Set(msg.trashManifest.map((t) => t.id));
      for (const localTrash of this.db.getTrashItems()) {
        if (localTrash.owner_uuid === remoteUuid && !remoteTrashIds.has(localTrash.id)) {
          this.db.deleteTrashItem(localTrash.id);
          try {
            fs.rmSync(safeResolvePath(this.vaultPaths.trashDir, localTrash.id), {
              recursive: true,
              force: true,
            });
          } catch (_) {}
          trashChanged = true;
        }
      }
    }

    // Merge vault manifest (dirs first, then files)
    if (Array.isArray(msg.vaultManifest)) {
      const sorted = [...msg.vaultManifest].sort((a, b) => {
        if (Boolean(a.is_dir) !== Boolean(b.is_dir)) return a.is_dir ? -1 : 1;
        return String(a.rel_path).localeCompare(String(b.rel_path));
      });
      for (const rNode of sorted) {
        this._syncManifestNode(remoteUuid, rNode, activeTrashByPath);
      }
    }

    // Flush queued outbound messages
    const queued = this.offlineQueues.get(remoteUuid);
    if (queued && queued.length > 0) {
      this.offlineQueues.delete(remoteUuid);
      for (const qMsg of queued) {
        this._sendRaw(ws, qMsg);
      }
    }

    // Request missed delta messages, peers & audit logs since per-peer cursor
    const peerSyncLamport = Number(this.db.getSetting(`sync_cursor_msg:${remoteUuid}`, 0)) || 0;
    const peerAuditTs = Number(this.db.getSetting(`sync_cursor_audit:${remoteUuid}`, 0)) || 0;
    const peerUpdatedTs = Number(this.db.getSetting(`sync_cursor_peer:${remoteUuid}`, 0)) || 0;
    this._sendRaw(ws, {
      type: 'SYNC_DELTA_REQ',
      sinceLamportTs: peerSyncLamport,
      sinceAuditTs: peerAuditTs,
      sincePeerTs: peerUpdatedTs,
    });

    this.emit('peers:changed', this.db.getPeers());
    if (convChanged) this.emit('conversations:changed');
    if (trashChanged) this.emit('trash:changed');
  }

  _syncManifestNode(remoteUuid, rNode, activeTrashByPath) {
    if (!rNode || !rNode.rel_path) return;
    let relPath;
    try {
      relPath = normalizeRelPath(rNode.rel_path);
    } catch (_) {
      return;
    }
    if (!relPath) return;

    // Skip if local trash has a newer deletion of this exact path
    const trashed = activeTrashByPath?.get(relPath);
    if (trashed && (trashed.deleted_at || 0) >= (rNode.updated_at || 0)) {
      return;
    }

    const local = this.db.getVaultNode(relPath);
    if (local) {
      // ACL update acceptance
      if ((rNode.acl_version || 1) > (local.acl_version || 1) && remoteUuid === local.owner_uuid) {
        this.db.upsertVaultNode({
          ...local,
          perm_mode: rNode.perm_mode,
          password_hash: rNode.password_hash,
          password_salt: rNode.password_salt,
          allowed_editors: rNode.allowed_editors,
          allowed_viewers: rNode.allowed_viewers,
          acl_version: rNode.acl_version,
        });
        this.emit('vault:changed', { relPath });
      }

      if (!rNode.is_dir && rNode.sha256) {
        const localFile = safeResolvePath(this.vaultPaths.filesDir, relPath);
        const diskExists = fs.existsSync(localFile);
        const rIsNewer =
          !diskExists ||
          (rNode.lamport_ts || 0) > (local.lamport_ts || 0) ||
          ((rNode.lamport_ts || 0) === (local.lamport_ts || 0) &&
            (rNode.updated_at || 0) > (local.updated_at || 0));

        if (rIsNewer && local.sha256 !== rNode.sha256) {
          // Enforce ACL against remote sender (no unlockedSet)
          const acl = computeEffectiveAcl(this.db, relPath, remoteUuid, null);
          if (!acl.canWrite) return;
          this._pullRemoteFileNode(remoteUuid, rNode);
        } else if (!diskExists) {
          this._pullRemoteFileNode(remoteUuid, rNode);
        }
      }
      return;
    }

    // Node does not exist locally yet: verify parent write ACL if parent exists
    const parentPath = getParentRelPath(relPath);
    if (parentPath) {
      const parentAcl = computeEffectiveAcl(this.db, parentPath, remoteUuid, null);
      if (!parentAcl.canWrite) {
        return;
      }
    }

    if (rNode.is_dir) {
      const dirDisk = safeResolvePath(this.vaultPaths.filesDir, relPath);
      this.suppressWatch(relPath, 1500);
      fs.mkdirSync(dirDisk, { recursive: true });
      this.db.upsertVaultNode(rNode);
      this.emit('vault:changed', { relPath });
    } else {
      this.db.upsertVaultNode(rNode);
      this._pullRemoteFileNode(remoteUuid, rNode);
      this.emit('vault:changed', { relPath });
    }
  }

  _handleSyncDeltaReq(ws, senderUuid, msg) {
    const sinceLamport = Number(msg.sinceLamportTs) || 0;
    const sinceAudit = Number(msg.sinceAuditTs) || 0;
    const sincePeerTs = Number(msg.sincePeerTs) || 0;

    // Distributed replica: send all messages with lamport_ts > sinceLamport + their conversations + updated peers
    const msgs = this.db.getMessagesSince(sinceLamport);
    const convMap = new Map();
    for (const c of this.db.getAllConversationsWithMembers()) {
      convMap.set(c.id, c);
    }
    const referencedConvs = [];
    const seenConvIds = new Set();
    for (const m of msgs) {
      if (m.conversation_id && !seenConvIds.has(m.conversation_id)) {
        seenConvIds.add(m.conversation_id);
        const c = convMap.get(m.conversation_id);
        if (c) referencedConvs.push(c);
      }
    }

    const peers = this.db
      .getPeersUpdatedSince(sincePeerTs)
      .map((p) => this._serializePeerForSync(p));
    const audits = this.db.getAuditLogsSince(sinceAudit);

    this._sendRaw(ws, {
      type: 'SYNC_DELTA_RES',
      messages: msgs,
      conversations: referencedConvs,
      peers,
      auditLogs: audits,
    });
  }

  _handleSyncDeltaRes(senderUuid, msg) {
    let maxMsgLamport = Number(this.db.getSetting(`sync_cursor_msg:${senderUuid}`, 0)) || 0;
    let maxAuditTs = Number(this.db.getSetting(`sync_cursor_audit:${senderUuid}`, 0)) || 0;
    let maxPeerTs = Number(this.db.getSetting(`sync_cursor_peer:${senderUuid}`, 0)) || 0;
    let anyNewMsg = false;
    let peersUpdated = false;

    if (Array.isArray(msg.peers)) {
      for (const p of msg.peers) {
        if (!p || !p.uuid || p.uuid === this.myUuid) continue;
        const cur = this.db.getPeer(p.uuid);
        const isOnline = this._isPeerLiveOnline(p.uuid);
        const activeGw = this.hostedMobilePeers.has(p.uuid)
          ? this.myUuid
          : (this.remoteHostedPeers.get(p.uuid)?.size > 0
              ? Array.from(this.remoteHostedPeers.get(p.uuid))[0]
              : (cur?.gateway_uuid ?? null));

        if (!cur || (p.updated_at || 0) >= (cur.updated_at || 0)) {
          this.db.upsertPeer({
            ...p,
            gateway_uuid: activeGw,
            status: isOnline ? 'online' : (cur?.status || 'offline'),
            last_seen: isOnline ? Date.now() : (cur?.last_seen || 0),
          });
          peersUpdated = true;
        }
        if ((p.updated_at || 0) > maxPeerTs) {
          maxPeerTs = p.updated_at;
        }
      }
      this.db.setSetting(`sync_cursor_peer:${senderUuid}`, maxPeerTs);
    }

    if (Array.isArray(msg.conversations)) {
      for (const c of msg.conversations) {
        if (c && c.id) {
          this.db.upsertConversation(c, c.members || []);
          anyNewMsg = true;
        }
      }
    }

    if (Array.isArray(msg.messages)) {
      for (const m of msg.messages) {
        if (!m || !m.id) continue;
        this.db.nextLamportTs(m.lamport_ts);
        const prev = this.db.getMessageById(m.id);
        const existed = Boolean(prev);
        const saved = this.db.saveMessage(m);
        if (Array.isArray(m.receipts)) {
          for (const rec of m.receipts) {
            if (rec && rec.peer_uuid && rec.status) {
              this.db.upsertReceipt(m.id, rec.peer_uuid, rec.status);
            }
          }
        }
        if (Array.isArray(m.reactions)) {
          for (const rx of m.reactions) {
            if (rx && rx.peer_uuid && rx.emoji) {
              try {
                this.db.db.prepare(
                  'INSERT OR IGNORE INTO message_reactions (message_id, peer_uuid, emoji, created_at) VALUES (?, ?, ?, ?)'
                ).run(m.id, rx.peer_uuid, rx.emoji, rx.created_at || Date.now());
              } catch (_) {}
            }
          }
        }

        // Mark delivered ONLY for local desktop user (if member) or locally hosted member peers
        const localActors = new Set();
        if (this.myUuid && this.db.isConversationMember(m.conversation_id, this.myUuid)) {
          localActors.add(this.myUuid);
        }
        for (const hostedUuid of this.hostedMobilePeers.keys()) {
          if (this.db.isConversationMember(m.conversation_id, hostedUuid)) {
            localActors.add(hostedUuid);
          }
        }
        for (const actorUuid of localActors) {
          if (m.sender_uuid !== actorUuid) {
            this.db.upsertReceipt(m.id, actorUuid, 'delivered');
            this.broadcast({
              type: 'CHAT_RECEIPT',
              conversationId: m.conversation_id,
              messageIds: [m.id],
              peerUuid: actorUuid,
              status: 'delivered',
            });
          }
        }

        if (saved?.attachment?.blobId && saved?.attachment?.fileName) {
          this.ensureChatBlobAvailable(
            saved.attachment.blobId,
            saved.attachment.fileName,
            senderUuid
          ).catch(() => {});
        }

        if ((m.lamport_ts || 0) > maxMsgLamport) {
          maxMsgLamport = m.lamport_ts;
        }
        if (!existed) {
          anyNewMsg = true;
          this.emit('chat:message', this.db.getMessageById(m.id));
        } else if (saved && prev && (saved.lamport_ts || 0) > (prev.lamport_ts || 0)) {
          anyNewMsg = true;
          if (saved.deleted_at && !prev.deleted_at) {
            this.emit('chat:delete', saved);
          } else if (saved.edited_at !== prev.edited_at || saved.body !== prev.body) {
            this.emit('chat:edit', saved);
          }
        }
      }
      this.db.setSetting(`sync_cursor_msg:${senderUuid}`, maxMsgLamport);
    }

    if (Array.isArray(msg.auditLogs)) {
      for (const a of msg.auditLogs) {
        if (!a || !a.id) continue;
        this.db.addAuditLog(a);
        if ((a.created_at || 0) > maxAuditTs) maxAuditTs = a.created_at;
      }
      this.db.setSetting(`sync_cursor_audit:${senderUuid}`, maxAuditTs);
    }

    if (peersUpdated) {
      this.emit('peers:changed', this.db.getPeers());
    }
    if (anyNewMsg) {
      this.emit('conversations:changed');
    }
  }

  _handleProfileUpdate(senderUuid, msg) {
    if (!msg.identity || msg.identity.uuid !== senderUuid) return;
    this.db.upsertPeer({
      ...msg.identity,
      device_type: msg.identity.device_type || 'desktop',
      status: 'online',
      last_seen: Date.now(),
    });
    this.emit('peers:changed', this.db.getPeers());
    this.emit('conversations:changed');
  }

  _handlePeerSync(senderUuid, msg) {
    const p = msg.peer;
    if (!p || !p.uuid || p.uuid === this.myUuid) return;

    if (msg.hosted && msg.gatewayUuid) {
      let gws = this.remoteHostedPeers.get(p.uuid);
      if (!gws) {
        gws = new Set();
        this.remoteHostedPeers.set(p.uuid, gws);
      }
      gws.add(msg.gatewayUuid);
    }

    const cur = this.db.getPeer(p.uuid);
    const isOnline = this._isPeerLiveOnline(p.uuid);
    const activeGw = this.hostedMobilePeers.has(p.uuid)
      ? this.myUuid
      : (this.remoteHostedPeers.get(p.uuid)?.size > 0
          ? Array.from(this.remoteHostedPeers.get(p.uuid))[0]
          : (p.gateway_uuid ?? null));

    if (!cur || (p.updated_at || 0) >= (cur.updated_at || 0)) {
      this.db.upsertPeer({
        ...p,
        gateway_uuid: activeGw,
        status: isOnline ? 'online' : (cur?.status || 'offline'),
        last_seen: isOnline ? Date.now() : (cur?.last_seen || 0),
      });
      this.emit('peers:changed', this.db.getPeers());
      this.emit('conversations:changed');
    }
  }

  _handlePeerAnnounce(senderUuid, msg) {
    const peerUuid = msg.peer?.uuid || msg.peerUuid;
    if (!peerUuid || peerUuid === this.myUuid) return;
    const gatewayUuid = msg.gatewayUuid || senderUuid;

    if (msg.action === 'online') {
      let gws = this.remoteHostedPeers.get(peerUuid);
      if (!gws) {
        gws = new Set();
        this.remoteHostedPeers.set(peerUuid, gws);
      }
      gws.add(gatewayUuid);

      const base = msg.peer || { uuid: peerUuid };
      this.db.upsertPeer({
        ...base,
        uuid: peerUuid,
        gateway_uuid: gatewayUuid,
        status: 'online',
        last_seen: Date.now(),
      });
    } else {
      const gws = this.remoteHostedPeers.get(peerUuid);
      if (gws) {
        gws.delete(gatewayUuid);
        if (gws.size === 0) {
          this.remoteHostedPeers.delete(peerUuid);
        }
      }
      const stillOnline = this._isPeerLiveOnline(peerUuid);
      const nextGw = this.remoteHostedPeers.get(peerUuid)
        ? (Array.from(this.remoteHostedPeers.get(peerUuid))[0] || null)
        : null;
      const cur = this.db.getPeer(peerUuid);
      const base = msg.peer || { uuid: peerUuid };
      this.db.upsertPeer({
        ...base,
        uuid: peerUuid,
        gateway_uuid: cur?.gateway_uuid === gatewayUuid ? nextGw : (cur?.gateway_uuid ?? nextGw),
        status: stillOnline ? 'online' : 'offline',
        last_seen: Date.now(),
      });
    }

    this.emit('peers:changed', this.db.getPeers());
    this.emit('conversations:changed');
  }

  _handleGroupUpsert(msg) {
    const conv = msg.conversation;
    if (!conv || !conv.id) return;
    const memberUuids = (conv.members || []).map((m) => (typeof m === 'string' ? m : m.uuid || m.peer_uuid));
    this.db.upsertConversation(conv, memberUuids);
    this.emit('conversations:changed', { conversationId: conv.id, memberUuids });
  }

  _handleIncomingChatMessage(senderUuid, msg) {
    if (msg.conversation) {
      const members = (msg.conversation.members || []).map((m) =>
        typeof m === 'string' ? m : m.uuid || m.peer_uuid
      );
      this.db.upsertConversation(msg.conversation, members);
    }
    const m = msg.message;
    if (!m || !m.id) return;

    this.db.nextLamportTs(m.lamport_ts);
    const saved = this.db.saveMessage(m);

    const localActors = new Set();
    if (this.myUuid && this.db.isConversationMember(m.conversation_id, this.myUuid)) {
      localActors.add(this.myUuid);
    }
    for (const hostedUuid of this.hostedMobilePeers.keys()) {
      if (this.db.isConversationMember(m.conversation_id, hostedUuid)) {
        localActors.add(hostedUuid);
      }
    }

    for (const actorUuid of localActors) {
      if (m.sender_uuid && m.sender_uuid !== actorUuid) {
        this.db.upsertReceipt(m.id, actorUuid, 'delivered');
        this.broadcast({
          type: 'CHAT_RECEIPT',
          conversationId: m.conversation_id,
          messageIds: [m.id],
          peerUuid: actorUuid,
          status: 'delivered',
        });
      }
    }

    if (saved?.attachment?.blobId && saved?.attachment?.fileName) {
      this.ensureChatBlobAvailable(
        saved.attachment.blobId,
        saved.attachment.fileName,
        senderUuid
      )
        .then(() => {
          this.emit('chat:blob-ready', {
            messageId: m.id,
            conversationId: m.conversation_id,
            blobId: saved.attachment.blobId,
            fileName: saved.attachment.fileName,
          });
        })
        .catch(() => {});
    }

    this.emit('chat:message', saved);
    this.emit('conversations:changed', { conversationId: m.conversation_id });
  }

  _isAuthorizedChatActor(senderUuid, msg, expectedSenderUuid, actionType, targetId, lamportTs) {
    if (senderUuid === expectedSenderUuid) return true;
    if (!msg || !msg.actorUuid || msg.actorUuid !== expectedSenderUuid) return false;
    if (msg.actorProof && this._verifyActorProof(msg.actorUuid, actionType, targetId, lamportTs, msg.actorProof)) {
      return true;
    }
    const gateways = this.remoteHostedPeers.get(msg.actorUuid);
    if (gateways && gateways.has(senderUuid)) {
      return true;
    }
    const peer = this.db.getPeer(msg.actorUuid);
    if (peer && peer.device_type === 'mobile' && peer.gateway_uuid === senderUuid) {
      return true;
    }
    return false;
  }

  _handleIncomingChatEdit(senderUuid, msg) {
    const existing = this.db.getMessageById(msg.id);
    if (!existing) return;
    if (!this._isAuthorizedChatActor(senderUuid, msg, existing.sender_uuid, 'CHAT_EDIT', msg.id, msg.lamportTs)) {
      return;
    }
    this.db.nextLamportTs(msg.lamportTs);
    const updated = this.db.updateMessageText(msg.id, msg.body, msg.editedAt, msg.lamportTs);
    this.emit('chat:edit', updated);
    this.emit('conversations:changed', { conversationId: updated.conversation_id });
  }

  _handleIncomingChatDelete(senderUuid, msg) {
    const existing = this.db.getMessageById(msg.id);
    if (!existing) return;
    if (!this._isAuthorizedChatActor(senderUuid, msg, existing.sender_uuid, 'CHAT_DELETE', msg.id, msg.lamportTs)) {
      return;
    }
    this.db.nextLamportTs(msg.lamportTs);
    const updated = this.db.softDeleteMessage(msg.id, msg.deletedAt, msg.lamportTs);
    this.emit('chat:delete', updated);
    this.emit('conversations:changed', { conversationId: updated.conversation_id });
  }

  _handleIncomingChatReceipt(senderUuid, msg) {
    const ids = Array.isArray(msg.messageIds) ? msg.messageIds : [];
    for (const id of ids) {
      this.db.upsertReceipt(id, msg.peerUuid || senderUuid, msg.status);
    }
    this.emit('chat:receipt', {
      conversationId: msg.conversationId,
      messageIds: ids,
      peerUuid: msg.peerUuid || senderUuid,
      status: msg.status,
    });
    this.emit('conversations:changed');
  }

  _handleIncomingChatReaction(senderUuid, msg) {
    const peerUuid = msg.peerUuid || senderUuid;
    const existing = this.db.db.prepare(
      'SELECT 1 FROM message_reactions WHERE message_id = ? AND peer_uuid = ? AND emoji = ?'
    ).get(msg.messageId, peerUuid, msg.emoji);

    if (msg.added && !existing) {
      this.db.db.prepare(
        'INSERT INTO message_reactions (message_id, peer_uuid, emoji, created_at) VALUES (?, ?, ?, ?)'
      ).run(msg.messageId, peerUuid, msg.emoji, msg.createdAt || Date.now());
    } else if (!msg.added && existing) {
      this.db.db.prepare(
        'DELETE FROM message_reactions WHERE message_id = ? AND peer_uuid = ? AND emoji = ?'
      ).run(msg.messageId, peerUuid, msg.emoji);
    }
    const reactions = this.db.db.prepare(
      'SELECT * FROM message_reactions WHERE message_id = ? ORDER BY created_at ASC'
    ).all(msg.messageId);

    this.emit('chat:reaction', {
      messageId: msg.messageId,
      conversationId: msg.conversationId,
      peerUuid,
      emoji: msg.emoji,
      added: Boolean(msg.added),
      reactions,
    });
  }

  // =========================================================================
  // Remote Vault & Trash Handlers (ACL Enforced!)
  // =========================================================================

  _handleRemoteVaultDirCreate(senderUuid, msg) {
    const node = msg.node;
    if (!node || !node.rel_path) return;
    let relPath;
    try {
      relPath = normalizeRelPath(node.rel_path);
    } catch (_) {
      return;
    }

    const effectiveActor = this._resolveEffectiveActor(senderUuid, msg, relPath, node.lamport_ts);

    const parentPath = getParentRelPath(relPath);
    if (parentPath) {
      const parentAcl = computeEffectiveAcl(this.db, parentPath, effectiveActor, null);
      if (!parentAcl.canWrite) return;
    }

    const existing = this.db.getVaultNode(relPath);
    if (existing) {
      const acl = computeEffectiveAcl(this.db, relPath, effectiveActor, null);
      if (!acl.canWrite) return;
    }

    this.db.nextLamportTs(node.lamport_ts);
    const dirDisk = safeResolvePath(this.vaultPaths.filesDir, relPath);
    this.suppressWatch(relPath, 1500);
    fs.mkdirSync(dirDisk, { recursive: true });
    this.db.upsertVaultNode(node);
    this.emit('vault:changed', { relPath });
  }

  _handleRemoteVaultFileUpdate(senderUuid, msg) {
    const node = msg.node;
    if (!node || !node.rel_path) return;
    let relPath;
    try {
      relPath = normalizeRelPath(node.rel_path);
    } catch (_) {
      return;
    }

    const effectiveActor = this._resolveEffectiveActor(senderUuid, msg, relPath, node.lamport_ts);

    const existing = this.db.getVaultNode(relPath);
    if (existing) {
      const acl = computeEffectiveAcl(this.db, relPath, effectiveActor, null);
      if (!acl.canWrite) {
        // Reject tampered or unauthorized remote file write
        this.db.addAuditLog({
          eventType: 'remote_write_rejected',
          actorUuid: effectiveActor,
          actorName: this.db.getPeer(effectiveActor)?.display_name || effectiveActor,
          targetPath: relPath,
          details: 'Rejected unauthorized VAULT_FILE_UPDATE',
        });
        return;
      }
      // Preserve owner's ACL if sender is a non-owner editor
      const mergedNode =
        effectiveActor === existing.owner_uuid
          ? node
          : {
              ...node,
              owner_uuid: existing.owner_uuid,
              owner_name: existing.owner_name,
              perm_mode: existing.perm_mode,
              password_hash: existing.password_hash,
              password_salt: existing.password_salt,
              allowed_editors: existing.allowed_editors,
              allowed_viewers: existing.allowed_viewers,
              acl_version: existing.acl_version,
            };
      this.db.nextLamportTs(mergedNode.lamport_ts);
      this.db.upsertVaultNode(mergedNode);
      this._pullRemoteFileNode(senderUuid, mergedNode);
    } else {
      const parentPath = getParentRelPath(relPath);
      if (parentPath) {
        const parentAcl = computeEffectiveAcl(this.db, parentPath, effectiveActor, null);
        if (!parentAcl.canWrite) {
          this.db.addAuditLog({
            eventType: 'remote_write_rejected',
            actorUuid: effectiveActor,
            actorName: this.db.getPeer(effectiveActor)?.display_name || effectiveActor,
            targetPath: relPath,
            details: 'Rejected unauthorized VAULT_FILE_UPDATE inside protected ancestor',
          });
          return;
        }
      }
      this.db.nextLamportTs(node.lamport_ts);
      this.db.upsertVaultNode(node);
      this._pullRemoteFileNode(senderUuid, node);
    }
  }

  _handleRemoteVaultAclUpdate(senderUuid, msg) {
    const node = msg.node;
    if (!node || !node.rel_path) return;
    let relPath;
    try {
      relPath = normalizeRelPath(node.rel_path);
    } catch (_) {
      return;
    }

    const existing = this.db.getVaultNode(relPath);
    if (!existing) return;

    let authorized = senderUuid === existing.owner_uuid;
    if (!authorized && msg.recoveryProof) {
      authorized = this._verifyRecoveryProof(existing, msg.recoveryProof, node.acl_version);
    }
    if (!authorized) return;

    this.db.nextLamportTs(node.lamport_ts);
    this.db.upsertVaultNode({
      ...existing,
      perm_mode: node.perm_mode,
      password_hash: node.password_hash,
      password_salt: node.password_salt,
      allowed_editors: node.allowed_editors,
      allowed_viewers: node.allowed_viewers,
      acl_version: Math.max(existing.acl_version || 1, node.acl_version || 1),
      updated_at: node.updated_at || Date.now(),
    });
    this.emit('vault:changed', { relPath });
  }

  _verifyRecoveryProof(node, proof, aclVersion) {
    if (!proof || !proof.method || !proof.hmac) return false;
    const owner =
      node.owner_uuid === this.myUuid
        ? this.db.getIdentity()
        : this.db.getPeer(node.owner_uuid);
    if (!owner) return false;

    const secretKey =
      proof.method === 'security_qa'
        ? owner.security_answer_hash
        : proof.method === 'recovery_key'
          ? owner.recovery_key_hash
          : null;
    if (!secretKey) return false;

    const expected = crypto
      .createHmac('sha256', String(secretKey))
      .update(`${node.rel_path}:${aclVersion}`)
      .digest('hex');

    try {
      return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(String(proof.hmac), 'hex'));
    } catch (_) {
      return false;
    }
  }

  _handleRemoteVaultRename(senderUuid, msg) {
    const { oldRelPath, newRelPath } = msg;
    if (!oldRelPath || !newRelPath) return;
    let oldNorm;
    let newNorm;
    try {
      oldNorm = normalizeRelPath(oldRelPath);
      newNorm = normalizeRelPath(newRelPath);
    } catch (_) {
      return;
    }

    const aclOld = computeEffectiveAcl(this.db, oldNorm, senderUuid, null);
    const parentNew = getParentRelPath(newNorm);
    const aclNewParent = parentNew ? computeEffectiveAcl(this.db, parentNew, senderUuid, null) : { canWrite: true };
    if (!aclOld.canWrite || !aclNewParent.canWrite) return;

    const oldDisk = safeResolvePath(this.vaultPaths.filesDir, oldNorm);
    const newDisk = safeResolvePath(this.vaultPaths.filesDir, newNorm);
    this.suppressWatch(oldNorm, 1500);
    this.suppressWatch(newNorm, 1500);
    if (fs.existsSync(oldDisk)) {
      fs.mkdirSync(path.dirname(newDisk), { recursive: true });
      fs.renameSync(oldDisk, newDisk);
    }
    this.db.renameVaultNodeSubtree(oldNorm, newNorm, senderUuid);
    this.emit('vault:changed', { relPath: newNorm });
  }

  _handleRemoteVaultMove(senderUuid, msg) {
    // Handle remote move identical to rename when oldRelPath -> newRelPath
    this._handleRemoteVaultRename(senderUuid, msg);
  }

  _handleRemoteTrashAdd(senderUuid, msg) {
    const item = msg.trashItem;
    if (!item || !item.id || !item.original_rel_path) return;
    let relPath;
    try {
      relPath = normalizeRelPath(item.original_rel_path);
    } catch (_) {
      return;
    }

    const existing = this.db.getVaultNode(relPath);
    if (existing) {
      const acl = computeEffectiveAcl(this.db, relPath, senderUuid, null);
      if (!acl.canDelete && existing.owner_uuid !== senderUuid) return;
      this._deleteLocalVaultDiskAndDb(relPath);
    }

    this.db.insertTrashItem(item);
    this.emit('vault:changed', { relPath });
    this.emit('trash:changed');
  }

  _handleRemoteTrashRestore(senderUuid, msg) {
    const item = this.db.getTrashItem(msg.trashId);
    if (item && item.owner_uuid !== senderUuid) return;
    if (item) {
      this.db.deleteTrashItem(msg.trashId);
      try {
        const trashSub = safeResolvePath(this.vaultPaths.trashDir, msg.trashId);
        fs.rmSync(trashSub, { recursive: true, force: true });
      } catch (_) {}
    }
    if (Array.isArray(msg.restoredNodes)) {
      for (const n of msg.restoredNodes) {
        if (n.is_dir) {
          this.suppressWatch(n.rel_path, 1500);
          fs.mkdirSync(safeResolvePath(this.vaultPaths.filesDir, n.rel_path), { recursive: true });
          this.db.upsertVaultNode(n);
        } else {
          this.db.upsertVaultNode(n);
          this._pullRemoteFileNode(senderUuid, n);
        }
      }
    }
    this.emit('vault:changed');
    this.emit('trash:changed');
  }

  _handleRemoteTrashPurge(senderUuid, msg) {
    const item = this.db.getTrashItem(msg.trashId);
    if (!item || item.owner_uuid !== senderUuid) return;
    this.db.deleteTrashItem(msg.trashId);
    try {
      const trashSub = safeResolvePath(this.vaultPaths.trashDir, msg.trashId);
      fs.rmSync(trashSub, { recursive: true, force: true });
    } catch (_) {}
    this.emit('trash:changed');
  }

  _handleRemoteFilePresence(senderUuid, msg) {
    if (!msg.relPath) return;
    let relPath;
    try {
      relPath = normalizeRelPath(msg.relPath);
    } catch (_) {
      return;
    }

    if (msg.action === 'close') {
      const map = this.presenceMap.get(relPath);
      if (map) {
        map.delete(senderUuid);
        if (map.size === 0) this.presenceMap.delete(relPath);
      }
    } else {
      this._setPresenceEntry(relPath, {
        peerUuid: senderUuid,
        displayName: msg.displayName || this.db.getPeer(senderUuid)?.display_name || 'Peer',
        mode: msg.mode || 'view',
        openedAt: msg.openedAt || Date.now(),
      });
    }
    this.emit('presence:changed', this.getAllFilePresence());
  }

  _setPresenceEntry(relPath, entry) {
    const norm = normalizeRelPath(relPath);
    let map = this.presenceMap.get(norm);
    if (!map) {
      map = new Map();
      this.presenceMap.set(norm, map);
    }
    map.set(entry.peerUuid, entry);
  }

  _clearPeerPresence(peerUuid, shouldEmit = true) {
    let changed = false;
    for (const [relPath, map] of this.presenceMap.entries()) {
      if (map.delete(peerUuid)) {
        changed = true;
        if (map.size === 0) this.presenceMap.delete(relPath);
      }
    }
    if (changed && shouldEmit) {
      this.emit('presence:changed', this.getAllFilePresence());
    }
  }

  _deleteLocalVaultDiskAndDb(relPath) {
    const norm = normalizeRelPath(relPath);
    this.suppressWatch(norm, 1500);
    try {
      const diskPath = safeResolvePath(this.vaultPaths.filesDir, norm);
      if (fs.existsSync(diskPath)) {
        fs.rmSync(diskPath, { recursive: true, force: true });
      }
    } catch (_) {}
    this.db.deleteVaultNodeSubtree(norm);
  }

  // =========================================================================
  // 64KB Chunked File Transfer (Vault Files & Chat Blobs)
  // =========================================================================

  _pullRemoteFileNode(peerUuid, node) {
    if (!node || !node.rel_path || node.is_dir) return Promise.resolve();
    return this._requestTransfer({
      peerUuid,
      kind: 'vault',
      relPath: node.rel_path,
      expectedSha256: node.sha256 || null,
      editorName: node.owner_name || this.db.getPeer(peerUuid)?.display_name || 'Peer',
    }).catch(() => {});
  }

  async ensureChatBlobAvailable(blobId, fileName, preferredPeerUuid = null) {
    if (!blobId || !fileName) throw makeCodedError('INVALID_ARGS', 'blobId and fileName required');
    const safeName = validateNameSegment(fileName);
    const safeBlob = validateNameSegment(blobId);
    const targetPath = safeResolvePath(this.vaultPaths.chatBlobsDir, `${safeBlob}/${safeName}`);
    if (fs.existsSync(targetPath)) {
      return targetPath;
    }

    const candidates = [];
    if (preferredPeerUuid && this.peerSockets.has(preferredPeerUuid)) {
      candidates.push(preferredPeerUuid);
    }
    for (const uuid of this.peerSockets.keys()) {
      if (!candidates.includes(uuid)) candidates.push(uuid);
    }

    let lastErr = null;
    for (const peerUuid of candidates) {
      try {
        await this._requestTransfer({
          peerUuid,
          kind: 'blob',
          blobId: safeBlob,
          fileName: safeName,
          expectedSha256: null,
        });
        if (fs.existsSync(targetPath)) return targetPath;
      } catch (err) {
        lastErr = err;
      }
    }

    throw lastErr || makeCodedError('BLOB_UNAVAILABLE', `Chat blob ${safeBlob}/${safeName} not available`);
  }

  _requestTransfer({ peerUuid, kind, relPath = null, blobId = null, fileName = null, expectedSha256 = null, editorName = null }) {
    const key = kind === 'vault' ? `vault:${relPath}:${expectedSha256 || ''}` : `blob:${blobId}/${fileName}`;
    if (this.activeTransfers.has(key)) {
      return this.activeTransfers.get(key);
    }

    const promise = new Promise((resolve, reject) => {
      const ws = this.peerSockets.get(peerUuid);
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        reject(makeCodedError('PEER_OFFLINE', `Peer ${peerUuid} is not connected`));
        return;
      }

      const transferId = generateUuid();
      const stagingPath = path.join(this.vaultPaths.stagingDir, `${transferId}.part`);
      fs.mkdirSync(this.vaultPaths.stagingDir, { recursive: true });
      const fd = fs.openSync(stagingPath, 'w');

      this.pendingTransfers.set(transferId, {
        transferId,
        peerUuid,
        kind,
        relPath,
        blobId,
        fileName,
        expectedSha256,
        editorName,
        stagingPath,
        fd,
        receivedBytes: 0,
        totalSize: 0,
        resolve,
        reject,
      });

      this._sendRaw(ws, {
        type: 'CHUNK_REQ',
        transferId,
        kind,
        relPath,
        blobId,
        fileName,
      });
    }).finally(() => {
      this.activeTransfers.delete(key);
    });

    this.activeTransfers.set(key, promise);
    return promise;
  }

  _handleChunkRequest(ws, msg) {
    const { transferId, kind, relPath, blobId, fileName } = msg;
    let sourcePath;
    try {
      if (kind === 'vault') {
        sourcePath = safeResolvePath(this.vaultPaths.filesDir, relPath);
      } else if (kind === 'blob') {
        const cleanBlob = validateNameSegment(blobId);
        const cleanFile = validateNameSegment(fileName);
        sourcePath = safeResolvePath(this.vaultPaths.chatBlobsDir, `${cleanBlob}/${cleanFile}`);
      } else {
        throw new Error('Unknown transfer kind');
      }
    } catch (err) {
      this._sendRaw(ws, { type: 'CHUNK_ERROR', transferId, error: err.message });
      return;
    }

    if (!fs.existsSync(sourcePath)) {
      this._sendRaw(ws, { type: 'CHUNK_ERROR', transferId, error: 'FILE_NOT_FOUND' });
      return;
    }

    const stat = fs.statSync(sourcePath);
    if (!stat.isFile()) {
      this._sendRaw(ws, { type: 'CHUNK_ERROR', transferId, error: 'NOT_A_FILE' });
      return;
    }

    const totalSize = stat.size;
    const totalChunks = Math.max(1, Math.ceil(totalSize / CHUNK_SIZE));
    const hash = crypto.createHash('sha256');
    const fd = fs.openSync(sourcePath, 'r');

    try {
      const buf = Buffer.allocUnsafe(CHUNK_SIZE);
      let index = 0;
      if (totalSize === 0) {
        this._sendRaw(ws, {
          type: 'CHUNK_DATA',
          transferId,
          index: 0,
          totalChunks: 1,
          totalSize: 0,
          dataBase64: '',
        });
      } else {
        let bytesRead = 0;
        while ((bytesRead = fs.readSync(fd, buf, 0, CHUNK_SIZE, null)) > 0) {
          const slice = bytesRead === buf.length ? buf : buf.subarray(0, bytesRead);
          hash.update(slice);
          this._sendRaw(ws, {
            type: 'CHUNK_DATA',
            transferId,
            index,
            totalChunks,
            totalSize,
            dataBase64: slice.toString('base64'),
          });
          index++;
        }
      }
      this._sendRaw(ws, {
        type: 'CHUNK_DONE',
        transferId,
        sha256: hash.digest('hex'),
        totalSize,
        totalChunks,
      });
    } finally {
      fs.closeSync(fd);
    }
  }

  _handleChunkData(msg) {
    const st = this.pendingTransfers.get(msg.transferId);
    if (!st) return;

    const buf = msg.dataBase64 ? Buffer.from(msg.dataBase64, 'base64') : Buffer.alloc(0);
    if (buf.length > 0) {
      fs.writeSync(st.fd, buf, 0, buf.length);
    }
    st.receivedBytes += buf.length;
    st.totalSize = Number(msg.totalSize ?? st.totalSize);

    const percent =
      st.totalSize > 0 ? Math.min(100, Math.round((st.receivedBytes / st.totalSize) * 100)) : 100;

    this.emit('transfer:progress', {
      transferId: st.transferId,
      kind: st.kind,
      relPath: st.relPath,
      blobId: st.blobId,
      fileName: st.fileName,
      receivedBytes: st.receivedBytes,
      totalBytes: st.totalSize,
      percent,
    });
  }

  _handleChunkDone(msg) {
    const st = this.pendingTransfers.get(msg.transferId);
    if (!st) return;
    this.pendingTransfers.delete(msg.transferId);

    try {
      fs.closeSync(st.fd);
      st.fd = null;
      const actualSha = sha256FileSync(st.stagingPath);
      const expected = st.expectedSha256 || msg.sha256;
      if (expected && actualSha !== expected) {
        fs.unlinkSync(st.stagingPath);
        st.reject(makeCodedError('SHA256_MISMATCH', 'Transferred file SHA-256 verification failed'));
        return;
      }

      if (st.kind === 'vault') {
        const destPath = safeResolvePath(this.vaultPaths.filesDir, st.relPath);
        fs.mkdirSync(path.dirname(destPath), { recursive: true });
        this.suppressWatch(st.relPath, 2000);
        fs.renameSync(st.stagingPath, destPath);

        const existingNode = this.db.getVaultNode(st.relPath);
        if (existingNode) {
          this.db.upsertVaultNode({
            ...existingNode,
            size: fs.statSync(destPath).size,
            sha256: actualSha,
          });
        }
        this.emit('vault:changed', { relPath: st.relPath });
        this.emit('vault:remote-updated', {
          relPath: st.relPath,
          editorName: st.editorName || 'Peer',
          sha256: actualSha,
        });
        st.resolve(destPath);
      } else {
        const destPath = safeResolvePath(
          this.vaultPaths.chatBlobsDir,
          `${st.blobId}/${st.fileName}`
        );
        fs.mkdirSync(path.dirname(destPath), { recursive: true });
        fs.renameSync(st.stagingPath, destPath);
        st.resolve(destPath);
      }
    } catch (err) {
      try {
        if (st.stagingPath && fs.existsSync(st.stagingPath)) fs.unlinkSync(st.stagingPath);
      } catch (_) {}
      st.reject(err);
    }
  }

  _handleChunkError(msg) {
    const st = this.pendingTransfers.get(msg.transferId);
    if (!st) return;
    this.pendingTransfers.delete(msg.transferId);
    try {
      if (st.fd !== null && st.fd !== undefined) fs.closeSync(st.fd);
      if (st.stagingPath && fs.existsSync(st.stagingPath)) fs.unlinkSync(st.stagingPath);
    } catch (_) {}
    st.reject(makeCodedError('TRANSFER_FAILED', msg.error || 'Chunk transfer failed'));
  }

  // =========================================================================
  // Chokidar Filesystem Watcher & Loop Suppression
  // =========================================================================

  suppressWatch(relPath, ms = 1500) {
    try {
      const norm = normalizeRelPath(relPath);
      if (norm) {
        this.suppressedPaths.set(norm, Date.now() + ms);
      }
    } catch (_) {}
  }

  _isSuppressed(relPath) {
    const exp = this.suppressedPaths.get(relPath);
    if (!exp) return false;
    if (Date.now() > exp) {
      this.suppressedPaths.delete(relPath);
      return false;
    }
    return true;
  }

  _scanLocalVaultDisk() {
    if (!fs.existsSync(this.vaultPaths.filesDir)) return;
    const walk = (dir) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith('.') || entry.name.startsWith('~$')) continue;
        const full = path.join(dir, entry.name);
        const rel = normalizeRelPath(path.relative(this.vaultPaths.filesDir, full));
        if (!rel) continue;
        const existing = this.db.getVaultNode(rel);
        if (entry.isDirectory()) {
          if (!existing) {
            this.db.upsertVaultNode({
              rel_path: rel,
              is_dir: true,
              owner_uuid: this.myUuid,
              owner_name: this.identity?.display_name || '',
              perm_mode: 'public',
              lamport_ts: this.db.nextLamportTs(),
            });
          }
          walk(full);
        } else if (entry.isFile()) {
          const stat = fs.statSync(full);
          if (!existing) {
            const sha = sha256FileSync(full);
            this.db.upsertVaultNode({
              rel_path: rel,
              is_dir: false,
              size: stat.size,
              sha256: sha,
              owner_uuid: this.myUuid,
              owner_name: this.identity?.display_name || '',
              perm_mode: 'public',
              lamport_ts: this.db.nextLamportTs(),
            });
          }
        }
      }
    };
    walk(this.vaultPaths.filesDir);
  }

  _startChokidar() {
    this.watcher = chokidar.watch(this.vaultPaths.filesDir, {
      ignoreInitial: true,
      ignored: [/(^|[\/\\])\./, /~\$.*/, /\.tmp$/i, /\.part$/i],
      awaitWriteFinish: {
        stabilityThreshold: 250,
        pollInterval: 100,
      },
    });

    const handleFileEvent = (fullPath) => {
      if (this._stopped || this.db?.closed) return;
      let relPath;
      try {
        relPath = normalizeRelPath(path.relative(this.vaultPaths.filesDir, fullPath));
      } catch (_) {
        return;
      }
      if (!relPath || this._isSuppressed(relPath)) return;
      if (!fs.existsSync(fullPath)) return;
      const stat = fs.statSync(fullPath);
      if (!stat.isFile()) return;

      const sha = sha256FileSync(fullPath);
      const existing = this.db.getVaultNode(relPath);
      if (existing && existing.sha256 === sha && existing.size === stat.size) {
        return;
      }

      const id = this.db.getIdentity() || this.identity;
      const saved = this.db.upsertVaultNode({
        ...(existing || {}),
        rel_path: relPath,
        is_dir: false,
        size: stat.size,
        sha256: sha,
        owner_uuid: existing?.owner_uuid || id.uuid,
        owner_name: existing?.owner_name || id.display_name || '',
        perm_mode: existing?.perm_mode || 'public',
        version: (existing?.version || 0) + 1,
        lamport_ts: this.db.nextLamportTs(),
        updated_at: Date.now(),
      });

      this.broadcast({ type: 'VAULT_FILE_UPDATE', node: saved });
      this.emit('vault:changed', { relPath });
    };

    const handleDirEvent = (fullPath) => {
      if (this._stopped || this.db?.closed) return;
      let relPath;
      try {
        relPath = normalizeRelPath(path.relative(this.vaultPaths.filesDir, fullPath));
      } catch (_) {
        return;
      }
      if (!relPath || this._isSuppressed(relPath)) return;
      if (this.db.getVaultNode(relPath)) return;

      const id = this.db.getIdentity() || this.identity;
      const saved = this.db.upsertVaultNode({
        rel_path: relPath,
        is_dir: true,
        owner_uuid: id.uuid,
        owner_name: id.display_name || '',
        perm_mode: 'public',
        lamport_ts: this.db.nextLamportTs(),
      });
      this.broadcast({ type: 'VAULT_DIR_CREATE', node: saved });
      this.emit('vault:changed', { relPath });
    };

    this.watcher.on('add', handleFileEvent);
    this.watcher.on('change', handleFileEvent);
    this.watcher.on('addDir', handleDirEvent);
  }

  // =========================================================================
  // ACL, Password Unlock & Offline Recovery
  // =========================================================================

  computeEffectiveAcl(relPath, actorUuid, unlockedSet = null) {
    return computeEffectiveAcl(this.db, relPath, actorUuid, unlockedSet);
  }

  verifyAndUnlockFolder(relPath, password, unlockedSet = null) {
    const norm = normalizeRelPath(relPath);
    const node = this.db.getVaultNode(norm);
    if (!node) return { ok: false, error: 'NOT_FOUND' };
    if (!node.password_hash || !node.password_salt) {
      if (unlockedSet && typeof unlockedSet.add === 'function') unlockedSet.add(norm);
      return { ok: true, relPath: norm };
    }
    const valid = verifySecret(String(password ?? ''), node.password_hash, node.password_salt);
    if (!valid) return { ok: false, error: 'INVALID_PASSWORD' };
    if (unlockedSet && typeof unlockedSet.add === 'function') {
      unlockedSet.add(norm);
    }
    return { ok: true, relPath: norm };
  }

  updateFolderPermissions(
    relPath,
    { permMode, password, clearPassword = false, allowedEditors = [], allowedViewers = [] },
    actorUuid = this.myUuid
  ) {
    const norm = normalizeRelPath(relPath);
    const node = this.db.getVaultNode(norm);
    if (!node) throw makeCodedError('NOT_FOUND', `Node not found: ${norm}`);
    if (node.owner_uuid !== actorUuid) {
      throw makeCodedError('FORBIDDEN', 'Only the owner can update permissions');
    }

    let passwordHash = node.password_hash;
    let passwordSalt = node.password_salt;
    if (clearPassword) {
      passwordHash = null;
      passwordSalt = null;
    } else if (password !== undefined && password !== null && String(password) !== '') {
      const hashed = hashSecret(String(password));
      passwordHash = hashed.hash;
      passwordSalt = hashed.salt;
    }

    const updated = this.db.upsertVaultNode({
      ...node,
      perm_mode: permMode || node.perm_mode || 'public',
      password_hash: passwordHash,
      password_salt: passwordSalt,
      allowed_editors: Array.isArray(allowedEditors) ? allowedEditors : node.allowed_editors,
      allowed_viewers: Array.isArray(allowedViewers) ? allowedViewers : node.allowed_viewers,
      acl_version: (node.acl_version || 1) + 1,
      lamport_ts: this.db.nextLamportTs(),
      updated_at: Date.now(),
    });

    const actor = actorUuid === this.myUuid ? this.db.getIdentity() : this.db.getPeer(actorUuid);
    this.db.addAuditLog({
      eventType: 'acl_updated',
      actorUuid,
      actorName: actor?.display_name || '',
      targetPath: norm,
      details: { permMode: updated.perm_mode, hasPassword: Boolean(updated.password_hash) },
    });

    this.broadcast({ type: 'VAULT_ACL_UPDATE', node: updated });
    this.emit('vault:changed', { relPath: norm });
    return updated;
  }

  getFolderRecoveryInfo(relPath) {
    const norm = normalizeRelPath(relPath);
    const node = this.db.getVaultNode(norm);
    if (!node) throw makeCodedError('NOT_FOUND', `Node not found: ${norm}`);

    const owner =
      node.owner_uuid === this.myUuid
        ? this.db.getIdentity()
        : (this.db.getPeer(node.owner_uuid) || null);

    return {
      relPath: node.rel_path,
      ownerUuid: node.owner_uuid,
      ownerName: owner?.display_name || node.owner_name || '',
      securityQuestion: owner?.security_question || '',
      hasSecurityQA: Boolean(owner?.security_answer_hash),
      hasRecoveryKey: Boolean(owner?.recovery_key_hash),
      isLocalOwner: node.owner_uuid === this.myUuid,
    };
  }

  recoverFolderPassword(relPath, { method, answerOrKey, newPassword }) {
    const norm = normalizeRelPath(relPath);
    const node = this.db.getVaultNode(norm);
    if (!node) throw makeCodedError('NOT_FOUND', `Node not found: ${norm}`);

    const owner =
      node.owner_uuid === this.myUuid
        ? this.db.getIdentity()
        : (this.db.getPeer(node.owner_uuid) || null);

    if (!owner) {
      return { ok: false, error: 'OWNER_METADATA_MISSING' };
    }

    let verified = false;
    let secretKeyUsed = null;

    if (method === 'security_qa') {
      verified = verifySecurityAnswerFlexible(
        answerOrKey,
        owner.security_answer_hash,
        owner.security_answer_salt
      );
      secretKeyUsed = owner.security_answer_hash;
    } else if (method === 'recovery_key') {
      const normalizedKey = normalizeRecoveryKey(answerOrKey);
      verified = verifySecret(
        normalizedKey,
        owner.recovery_key_hash,
        owner.recovery_key_salt
      );
      secretKeyUsed = owner.recovery_key_hash;
    } else {
      return { ok: false, error: 'INVALID_METHOD' };
    }

    if (!verified) {
      return { ok: false, error: 'INVALID_CREDENTIALS' };
    }

    let nextHash = null;
    let nextSalt = null;
    if (newPassword !== undefined && newPassword !== null && String(newPassword) !== '') {
      const hashed = hashSecret(String(newPassword));
      nextHash = hashed.hash;
      nextSalt = hashed.salt;
    }

    const nextAclVersion = (node.acl_version || 1) + 1;
    const updated = this.db.upsertVaultNode({
      ...node,
      password_hash: nextHash,
      password_salt: nextSalt,
      acl_version: nextAclVersion,
      lamport_ts: this.db.nextLamportTs(),
      updated_at: Date.now(),
    });

    const recoveryProof = {
      method,
      hmac: crypto
        .createHmac('sha256', String(secretKeyUsed))
        .update(`${norm}:${nextAclVersion}`)
        .digest('hex'),
    };

    const id = this.db.getIdentity() || this.identity;
    this.db.addAuditLog({
      eventType: 'password_recovered',
      actorUuid: id?.uuid || this.myUuid,
      actorName: id?.display_name || '',
      targetPath: norm,
      details: { method },
    });

    this.broadcast({ type: 'VAULT_ACL_UPDATE', node: updated, recoveryProof });
    this.emit('vault:changed', { relPath: norm });
    return { ok: true, relPath: norm, node: updated };
  }

  // =========================================================================
  // Live File Presence & Co-Edit Lock Guards
  // =========================================================================

  async announceFileOpen(relPath, mode = 'view') {
    const norm = normalizeRelPath(relPath);
    const id = this.db.getIdentity() || this.db.ensureIdentity();
    const entry = {
      peerUuid: id.uuid,
      displayName: id.display_name || 'Me',
      mode: mode === 'edit' ? 'edit' : 'view',
      openedAt: Date.now(),
    };
    this._setPresenceEntry(norm, entry);
    this.broadcast({
      type: 'FILE_PRESENCE',
      action: 'open',
      relPath: norm,
      ...entry,
    });
    this.emit('presence:changed', this.getAllFilePresence());
    return entry;
  }

  async announceFileClose(relPath) {
    const norm = normalizeRelPath(relPath);
    const id = this.db.getIdentity() || this.identity;
    const myUuid = id?.uuid || this.myUuid;
    const map = this.presenceMap.get(norm);
    if (map) {
      map.delete(myUuid);
      if (map.size === 0) this.presenceMap.delete(norm);
    }
    this.broadcast({
      type: 'FILE_PRESENCE',
      action: 'close',
      relPath: norm,
      peerUuid: myUuid,
    });
    this.emit('presence:changed', this.getAllFilePresence());
  }

  getFilePresence(relPath) {
    const norm = normalizeRelPath(relPath);
    const map = this.presenceMap.get(norm);
    if (!map) return [];
    return Array.from(map.values());
  }

  getAllFilePresence() {
    const out = {};
    for (const [relPath, map] of this.presenceMap.entries()) {
      if (map.size > 0) {
        out[relPath] = Array.from(map.values());
      }
    }
    return out;
  }

  getActiveEditors(relPath, excludePeerUuid = null) {
    const norm = normalizeRelPath(relPath);
    const editors = [];
    for (const [p, map] of this.presenceMap.entries()) {
      if (p === norm || (norm && p.startsWith(`${norm}/`))) {
        for (const entry of map.values()) {
          if (entry.mode === 'edit' && (!excludePeerUuid || entry.peerUuid !== excludePeerUuid)) {
            editors.push({ ...entry, relPath: p });
          }
        }
      }
    }
    return editors;
  }

  assertNotUnderLiveEdit(relPath, actorUuid = this.myUuid) {
    const editors = this.getActiveEditors(relPath, actorUuid);
    if (editors.length > 0) {
      throw makeCodedError(
        'FILE_LOCKED_LIVE_EDIT',
        `Cannot modify "${relPath}" while actively edited by ${editors.map((e) => e.displayName).join(', ')}`,
        { editors }
      );
    }
  }

  // =========================================================================
  // Vault Directory, Search, CRUD & Trash Operations
  // =========================================================================

  listDirectory(parentPath = '', actorUuid = this.myUuid, unlockedSet = null) {
    const norm = normalizeRelPath(parentPath);
    const parentAcl = computeEffectiveAcl(this.db, norm, actorUuid, unlockedSet);
    if (norm !== '' && !parentAcl.canRead) {
      return {
        ok: false,
        locked: true,
        blockingAncestor: parentAcl.blockingAncestor,
        parentAcl,
        items: [],
      };
    }

    const children = this.db.listVaultChildren(norm);
    const items = children.map((node) => {
      const effectiveAcl = computeEffectiveAcl(this.db, node.rel_path, actorUuid, unlockedSet);
      return {
        ...node,
        effectiveAcl,
        isProtected: effectiveAcl.isProtected,
        isLocked: !effectiveAcl.canRead,
        hasPassword: Boolean(node.password_hash),
        canRead: effectiveAcl.canRead,
        canWrite: effectiveAcl.canWrite,
        canDelete: effectiveAcl.canDelete,
        canManageAcl: effectiveAcl.canManageAcl,
      };
    });

    return {
      ok: true,
      locked: false,
      blockingAncestor: null,
      parentAcl,
      items,
    };
  }

  searchVault(query, actorUuid = this.myUuid, unlockedSet = null) {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return [];

    const all = this.db.getAllVaultNodes();
    const matches = [];
    for (const node of all) {
      if (
        !node.name.toLowerCase().includes(q) &&
        !node.rel_path.toLowerCase().includes(q)
      ) {
        continue;
      }
      const effectiveAcl = computeEffectiveAcl(this.db, node.rel_path, actorUuid, unlockedSet);
      if (!effectiveAcl.canRead) continue;
      matches.push({
        ...node,
        effectiveAcl,
        isProtected: effectiveAcl.isProtected,
        isLocked: false,
        hasPassword: Boolean(node.password_hash),
      });
    }
    return matches;
  }

  createFolder(parentPath, folderName, actorUuid = this.myUuid, unlockedSet = null) {
    const normParent = normalizeRelPath(parentPath);
    const cleanName = validateNameSegment(folderName);
    const relPath = normParent ? `${normParent}/${cleanName}` : cleanName;

    if (normParent) {
      const parentAcl = computeEffectiveAcl(this.db, normParent, actorUuid, unlockedSet);
      if (!parentAcl.canWrite) {
        throw makeCodedError('FORBIDDEN', 'No write permission in parent folder', {
          blockingAncestor: parentAcl.blockingAncestor,
        });
      }
    }

    if (this.db.getVaultNode(relPath)) {
      throw makeCodedError('ALREADY_EXISTS', `Folder already exists: ${relPath}`);
    }

    const diskPath = safeResolvePath(this.vaultPaths.filesDir, relPath);
    this.suppressWatch(relPath, 1500);
    fs.mkdirSync(diskPath, { recursive: true });

    const actor = actorUuid === this.myUuid ? this.db.getIdentity() : this.db.getPeer(actorUuid);
    const saved = this.db.upsertVaultNode({
      rel_path: relPath,
      is_dir: true,
      owner_uuid: actorUuid,
      owner_name: actor?.display_name || '',
      perm_mode: 'public',
      lamport_ts: this.db.nextLamportTs(),
      created_at: Date.now(),
      updated_at: Date.now(),
    });

    this.db.addAuditLog({
      eventType: 'folder_created',
      actorUuid,
      actorName: actor?.display_name || '',
      targetPath: relPath,
    });

    const dirMsg = { type: 'VAULT_DIR_CREATE', node: saved };
    if (actorUuid && actorUuid !== this.myUuid) {
      dirMsg.actorUuid = actorUuid;
      dirMsg.actorProof = this._signActorProof(
        actorUuid,
        'VAULT_DIR_CREATE',
        saved.rel_path,
        saved.lamport_ts
      );
    }
    this.broadcast(dirMsg);
    this.emit('vault:changed', { relPath });
    return saved;
  }

  renameNode(relPath, newName, actorUuid = this.myUuid, unlockedSet = null) {
    const oldNorm = normalizeRelPath(relPath);
    if (!oldNorm) throw makeCodedError('INVALID_PATH', 'Cannot rename Vault root');
    const cleanName = validateNameSegment(newName);

    const existing = this.db.getVaultNode(oldNorm);
    if (!existing) throw makeCodedError('NOT_FOUND', `Node not found: ${oldNorm}`);

    const acl = computeEffectiveAcl(this.db, oldNorm, actorUuid, unlockedSet);
    if (!acl.canWrite) {
      throw makeCodedError('FORBIDDEN', 'No write permission to rename', {
        blockingAncestor: acl.blockingAncestor,
      });
    }

    this.assertNotUnderLiveEdit(oldNorm, actorUuid);

    const parentPath = getParentRelPath(oldNorm);
    const newNorm = parentPath ? `${parentPath}/${cleanName}` : cleanName;
    if (newNorm === oldNorm) return existing;

    if (this.db.getVaultNode(newNorm)) {
      throw makeCodedError('ALREADY_EXISTS', `Target name already exists: ${newNorm}`);
    }

    const oldDisk = safeResolvePath(this.vaultPaths.filesDir, oldNorm);
    const newDisk = safeResolvePath(this.vaultPaths.filesDir, newNorm);
    this.suppressWatch(oldNorm, 1500);
    this.suppressWatch(newNorm, 1500);
    if (fs.existsSync(oldDisk)) {
      fs.renameSync(oldDisk, newDisk);
    }

    const updatedNodes = this.db.renameVaultNodeSubtree(oldNorm, newNorm, actorUuid);
    const actor = actorUuid === this.myUuid ? this.db.getIdentity() : this.db.getPeer(actorUuid);
    this.db.addAuditLog({
      eventType: 'node_renamed',
      actorUuid,
      actorName: actor?.display_name || '',
      targetPath: newNorm,
      details: { from: oldNorm, to: newNorm },
    });

    this.broadcast({
      type: 'VAULT_NODE_RENAME',
      oldRelPath: oldNorm,
      newRelPath: newNorm,
      updatedNodes,
    });
    this.emit('vault:changed', { relPath: newNorm });
    return this.db.getVaultNode(newNorm);
  }

  _pickNonCollidingName(targetParentPath, desiredName, isDir) {
    const { base, ext } = splitNameAndExt(desiredName, isDir);
    let idx = 2;
    while (true) {
      const candidate = `${base} (${idx})${ext}`;
      const candidateRel = targetParentPath ? `${targetParentPath}/${candidate}` : candidate;
      const disk = safeResolvePath(this.vaultPaths.filesDir, candidateRel);
      if (!this.db.getVaultNode(candidateRel) && !fs.existsSync(disk)) {
        return { name: candidate, relPath: candidateRel };
      }
      idx++;
    }
  }

  moveOrCopyNode(
    op,
    sourcePaths,
    targetParentPath,
    conflictStrategy = 'prompt',
    actorUuid = this.myUuid,
    unlockedSet = null
  ) {
    const mode = op === 'cut' || op === 'move' ? 'move' : 'copy';
    const destParent = normalizeRelPath(targetParentPath);
    const srcs = (Array.isArray(sourcePaths) ? sourcePaths : [sourcePaths]).map(normalizeRelPath).filter(Boolean);

    if (destParent) {
      const destAcl = computeEffectiveAcl(this.db, destParent, actorUuid, unlockedSet);
      if (!destAcl.canWrite) {
        throw makeCodedError('FORBIDDEN', 'No write permission in destination folder', {
          blockingAncestor: destAcl.blockingAncestor,
        });
      }
    }

    const validSources = [];
    const conflicts = [];

    for (const srcRel of srcs) {
      const srcNode = this.db.getVaultNode(srcRel);
      if (!srcNode) throw makeCodedError('NOT_FOUND', `Source not found: ${srcRel}`);

      const srcAcl = computeEffectiveAcl(this.db, srcRel, actorUuid, unlockedSet);
      if (!srcAcl.canRead || (mode === 'move' && !srcAcl.canWrite)) {
        throw makeCodedError('FORBIDDEN', `No permission to ${mode} ${srcRel}`, {
          blockingAncestor: srcAcl.blockingAncestor,
        });
      }

      if (destParent === srcRel || destParent.startsWith(`${srcRel}/`)) {
        throw makeCodedError('INVALID_OPERATION', 'Cannot move or copy a folder into itself');
      }

      if (mode === 'move') {
        this.assertNotUnderLiveEdit(srcRel, actorUuid);
      }

      const targetRel = destParent ? `${destParent}/${srcNode.name}` : srcNode.name;
      if (mode === 'move' && targetRel === srcRel) continue;

      const targetExists = Boolean(
        this.db.getVaultNode(targetRel) ||
          fs.existsSync(safeResolvePath(this.vaultPaths.filesDir, targetRel))
      );
      if (targetExists) {
        conflicts.push({ sourceRelPath: srcRel, targetRelPath: targetRel, name: srcNode.name });
      }
      validSources.push({ srcNode, srcRel, targetRel, targetExists });
    }

    if (conflicts.length > 0 && conflictStrategy === 'prompt') {
      return { ok: false, conflict: true, conflicts };
    }

    const actor = actorUuid === this.myUuid ? this.db.getIdentity() : this.db.getPeer(actorUuid);
    const results = [];

    for (const entry of validSources) {
      const { srcNode, srcRel, targetExists } = entry;
      let finalRel = entry.targetRel;
      let finalName = srcNode.name;

      if (targetExists) {
        if (conflictStrategy === 'keep_both') {
          const picked = this._pickNonCollidingName(destParent, srcNode.name, srcNode.is_dir);
          finalName = picked.name;
          finalRel = picked.relPath;
        } else if (conflictStrategy === 'overwrite') {
          const existingDestAcl = computeEffectiveAcl(this.db, finalRel, actorUuid, unlockedSet);
          if (!existingDestAcl.canWrite) {
            throw makeCodedError('FORBIDDEN', `Cannot overwrite protected target: ${finalRel}`);
          }
          if (!srcNode.is_dir) {
            this.assertNotUnderLiveEdit(finalRel, actorUuid);
          }
        }
      }

      const srcDisk = safeResolvePath(this.vaultPaths.filesDir, srcRel);
      const destDisk = safeResolvePath(this.vaultPaths.filesDir, finalRel);
      this.suppressWatch(srcRel, 1500);
      this.suppressWatch(finalRel, 1500);

      if (mode === 'move') {
        if (targetExists && conflictStrategy === 'overwrite') {
          fs.rmSync(destDisk, { recursive: true, force: true });
          this.db.deleteVaultNodeSubtree(finalRel);
        }
        fs.mkdirSync(path.dirname(destDisk), { recursive: true });
        fs.renameSync(srcDisk, destDisk);
        const updatedNodes = this.db.renameVaultNodeSubtree(srcRel, finalRel, actorUuid);
        this.broadcast({
          type: 'VAULT_NODE_MOVE',
          oldRelPath: srcRel,
          newRelPath: finalRel,
          updatedNodes,
        });
        results.push(finalRel);
      } else {
        this._copySubtreeToVault(srcDisk, srcRel, finalRel, finalName, actorUuid, actor?.display_name || '');
        results.push(finalRel);
      }

      this.db.addAuditLog({
        eventType: mode === 'move' ? 'node_moved' : 'node_copied',
        actorUuid,
        actorName: actor?.display_name || '',
        targetPath: finalRel,
        details: { from: srcRel, to: finalRel },
      });
    }

    this.emit('vault:changed');
    return { ok: true, results };
  }

  _copySubtreeToVault(srcDisk, srcRel, destRel, destName, actorUuid, actorName) {
    const stat = fs.statSync(srcDisk);
    const destDisk = safeResolvePath(this.vaultPaths.filesDir, destRel);
    this.suppressWatch(destRel, 1500);

    if (stat.isDirectory()) {
      fs.mkdirSync(destDisk, { recursive: true });
      const dirNode = this.db.upsertVaultNode({
        rel_path: destRel,
        name: destName,
        is_dir: true,
        owner_uuid: actorUuid,
        owner_name: actorName,
        perm_mode: 'public',
        lamport_ts: this.db.nextLamportTs(),
      });
      this.broadcast({ type: 'VAULT_DIR_CREATE', node: dirNode });

      for (const child of fs.readdirSync(srcDisk)) {
        this._copySubtreeToVault(
          path.join(srcDisk, child),
          `${srcRel}/${child}`,
          `${destRel}/${child}`,
          child,
          actorUuid,
          actorName
        );
      }
    } else {
      fs.mkdirSync(path.dirname(destDisk), { recursive: true });
      fs.copyFileSync(srcDisk, destDisk);
      const sha = sha256FileSync(destDisk);
      const fileNode = this.db.upsertVaultNode({
        rel_path: destRel,
        name: destName,
        is_dir: false,
        size: stat.size,
        sha256: sha,
        owner_uuid: actorUuid,
        owner_name: actorName,
        perm_mode: 'public',
        lamport_ts: this.db.nextLamportTs(),
      });
      this.broadcast({ type: 'VAULT_FILE_UPDATE', node: fileNode });
    }
  }

  broadcastVaultFileSaved(relPath, info = {}) {
    const norm = normalizeRelPath(relPath);
    if (info && info.node) {
      const msgType = info.node.is_dir ? 'VAULT_DIR_CREATE' : 'VAULT_FILE_UPDATE';
      const actorUuid = info.actorUuid || info.node.owner_uuid || this.myUuid;
      const payload = { type: msgType, node: info.node };
      if (actorUuid && actorUuid !== this.myUuid) {
        payload.actorUuid = actorUuid;
        payload.actorProof = this._signActorProof(
          actorUuid,
          msgType,
          info.node.rel_path,
          info.node.lamport_ts
        );
      }
      this.broadcast(payload);
      this.emit('vault:changed', { relPath: norm });
      return info.node;
    }

    const diskPath = safeResolvePath(this.vaultPaths.filesDir, norm);
    const existing = this.db.getVaultNode(norm);
    const id = this.db.getIdentity() || this.identity;
    const actorUuid = info.actorUuid || existing?.owner_uuid || id?.uuid || this.myUuid;
    const actorRec = actorUuid === this.myUuid ? id : this.db.getPeer(actorUuid);

    let size = info.size;
    let sha256 = info.sha256;
    if (fs.existsSync(diskPath) && fs.statSync(diskPath).isFile()) {
      if (size === undefined) size = fs.statSync(diskPath).size;
      if (!sha256) sha256 = sha256FileSync(diskPath);
    }

    const saved = this.db.upsertVaultNode({
      ...(existing || {}),
      rel_path: norm,
      is_dir: Boolean(info.isDir ?? existing?.is_dir ?? false),
      size: size ?? existing?.size ?? 0,
      mime: info.mime ?? existing?.mime ?? null,
      sha256: sha256 ?? existing?.sha256 ?? null,
      owner_uuid: existing?.owner_uuid || actorUuid,
      owner_name: existing?.owner_name || info.actorName || actorRec?.display_name || '',
      perm_mode: existing?.perm_mode || 'public',
      version: (existing?.version || 0) + 1,
      lamport_ts: this.db.nextLamportTs(),
      updated_at: Date.now(),
    });

    const msgType = saved.is_dir ? 'VAULT_DIR_CREATE' : 'VAULT_FILE_UPDATE';
    const payload = { type: msgType, node: saved };
    if (actorUuid && actorUuid !== this.myUuid) {
      payload.actorUuid = actorUuid;
      payload.actorProof = this._signActorProof(
        actorUuid,
        msgType,
        saved.rel_path,
        saved.lamport_ts
      );
    }
    this.broadcast(payload);
    this.emit('vault:changed', { relPath: norm });
    return saved;
  }

  deleteToTrash(relPath, actorUuid = this.myUuid, unlockedSet = null) {
    const norm = normalizeRelPath(relPath);
    if (!norm) throw makeCodedError('INVALID_PATH', 'Cannot delete Vault root');

    const node = this.db.getVaultNode(norm);
    if (!node) throw makeCodedError('NOT_FOUND', `Node not found: ${norm}`);

    const acl = computeEffectiveAcl(this.db, norm, actorUuid, unlockedSet);
    if (!acl.canDelete) {
      throw makeCodedError('FORBIDDEN', 'No permission to delete item', {
        blockingAncestor: acl.blockingAncestor,
      });
    }

    this.assertNotUnderLiveEdit(norm, actorUuid);

    const ancestorPaths = getAncestorPaths(norm, true);
    const chainNodes = ancestorPaths
      .map((p) => this.db.getVaultNode(p))
      .filter(Boolean)
      .map((n) => ({
        rel_path: n.rel_path,
        name: n.name,
        owner_uuid: n.owner_uuid,
        perm_mode: n.perm_mode,
        password_hash: n.password_hash,
        password_salt: n.password_salt,
        allowed_editors: n.allowed_editors,
        allowed_viewers: n.allowed_viewers,
      }));

    const nodesSnapshot = this.db.db
      .prepare('SELECT * FROM vault_nodes WHERE rel_path = ? OR rel_path LIKE ? ORDER BY rel_path ASC')
      .all(norm, `${norm}/%`);

    const totalSize = nodesSnapshot.reduce((acc, r) => acc + Number(r.size || 0), 0) || Number(node.size || 0);
    const trashId = generateUuid();
    const trashEntryDir = safeResolvePath(this.vaultPaths.trashDir, trashId);
    const trashTarget = path.join(trashEntryDir, node.name);
    const srcDisk = safeResolvePath(this.vaultPaths.filesDir, norm);

    this.suppressWatch(norm, 2000);
    fs.mkdirSync(trashEntryDir, { recursive: true });
    if (fs.existsSync(srcDisk)) {
      fs.renameSync(srcDisk, trashTarget);
    }

    this.db.deleteVaultNodeSubtree(norm);

    const actor = actorUuid === this.myUuid ? this.db.getIdentity() : this.db.getPeer(actorUuid);
    const now = Date.now();
    const trashItem = this.db.insertTrashItem({
      id: trashId,
      original_rel_path: norm,
      name: node.name,
      is_dir: node.is_dir,
      size: totalSize,
      owner_uuid: node.owner_uuid || actorUuid,
      owner_name: node.owner_name || '',
      deleted_by_uuid: actorUuid,
      deleted_by_name: actor?.display_name || '',
      effective_acl: { chainNodes },
      nodes_snapshot: nodesSnapshot,
      deleted_at: now,
      expires_at: now + THIRTY_DAYS_MS,
    });

    this.db.addAuditLog({
      eventType: 'moved_to_trash',
      actorUuid,
      actorName: actor?.display_name || '',
      targetPath: norm,
      targetId: trashId,
    });

    this.broadcast({ type: 'TRASH_ADD', trashItem });
    this.emit('vault:changed', { relPath: norm });
    this.emit('trash:changed');
    return trashItem;
  }

  _purgeExpiredTrashWithDisk() {
    const expired = this.db.purgeExpiredTrash(Date.now());
    for (const item of expired) {
      try {
        const dir = safeResolvePath(this.vaultPaths.trashDir, item.id);
        fs.rmSync(dir, { recursive: true, force: true });
      } catch (_) {}
    }
    return expired;
  }

  listTrash(actorUuid = this.myUuid, unlockedSet = null) {
    this._purgeExpiredTrashWithDisk();
    return this.db
      .getTrashItems()
      .filter((item) => canViewTrashItem(item, actorUuid, unlockedSet))
      .map((item) => ({
        ...item,
        canRestore: item.owner_uuid === actorUuid,
        canDeleteForever: item.owner_uuid === actorUuid,
      }));
  }

  restoreFromTrash(trashId, actorUuid = this.myUuid) {
    const item = this.db.getTrashItem(trashId);
    if (!item) throw makeCodedError('NOT_FOUND', `Trash item not found: ${trashId}`);
    if (item.owner_uuid !== actorUuid) {
      throw makeCodedError('FORBIDDEN', 'Only the owner can restore items from Trash');
    }

    const trashEntryDir = safeResolvePath(this.vaultPaths.trashDir, trashId);
    const trashSrc = path.join(trashEntryDir, item.name);

    let restoreRootRel = item.original_rel_path;
    const targetDiskCheck = safeResolvePath(this.vaultPaths.filesDir, restoreRootRel);
    if (this.db.getVaultNode(restoreRootRel) || fs.existsSync(targetDiskCheck)) {
      const parent = getParentRelPath(restoreRootRel);
      restoreRootRel = this._pickNonCollidingName(parent, item.name, item.is_dir).relPath;
    }

    const restoreDisk = safeResolvePath(this.vaultPaths.filesDir, restoreRootRel);
    this.suppressWatch(restoreRootRel, 2000);
    fs.mkdirSync(path.dirname(restoreDisk), { recursive: true });
    if (fs.existsSync(trashSrc)) {
      fs.renameSync(trashSrc, restoreDisk);
    } else if (item.is_dir) {
      fs.mkdirSync(restoreDisk, { recursive: true });
    }
    try {
      fs.rmSync(trashEntryDir, { recursive: true, force: true });
    } catch (_) {}

    // Ensure ancestor folder nodes exist in DB if needed
    const parentAncestors = getAncestorPaths(restoreRootRel, false);
    for (const anc of parentAncestors) {
      if (!this.db.getVaultNode(anc)) {
        fs.mkdirSync(safeResolvePath(this.vaultPaths.filesDir, anc), { recursive: true });
        this.db.upsertVaultNode({
          rel_path: anc,
          is_dir: true,
          owner_uuid: actorUuid,
          perm_mode: 'public',
          lamport_ts: this.db.nextLamportTs(),
        });
      }
    }

    const snapshot = Array.isArray(item.nodes_snapshot) ? item.nodes_snapshot : [];
    const restoredNodes = [];
    if (snapshot.length > 0) {
      for (const n of snapshot) {
        const suffix =
          n.rel_path === item.original_rel_path
            ? ''
            : n.rel_path.slice(item.original_rel_path.length);
        const rel = `${restoreRootRel}${suffix}`;
        this.suppressWatch(rel, 2000);
        const saved = this.db.upsertVaultNode({
          ...n,
          rel_path: rel,
          name: path.posix.basename(rel),
          lamport_ts: this.db.nextLamportTs(),
          updated_at: Date.now(),
        });
        restoredNodes.push(saved);
      }
    } else {
      const saved = this.db.upsertVaultNode({
        rel_path: restoreRootRel,
        is_dir: item.is_dir,
        size: item.size,
        owner_uuid: item.owner_uuid,
        owner_name: item.owner_name,
        lamport_ts: this.db.nextLamportTs(),
        updated_at: Date.now(),
      });
      restoredNodes.push(saved);
    }

    this.db.deleteTrashItem(trashId);

    const actor = actorUuid === this.myUuid ? this.db.getIdentity() : this.db.getPeer(actorUuid);
    this.db.addAuditLog({
      eventType: 'trash_restored',
      actorUuid,
      actorName: actor?.display_name || '',
      targetPath: restoreRootRel,
      targetId: trashId,
    });

    this.broadcast({ type: 'TRASH_RESTORE', trashId, restoredNodes });
    for (const n of restoredNodes) {
      this.broadcast({ type: n.is_dir ? 'VAULT_DIR_CREATE' : 'VAULT_FILE_UPDATE', node: n });
    }
    this.emit('vault:changed', { relPath: restoreRootRel });
    this.emit('trash:changed');
    return { ok: true, restoredPath: restoreRootRel, restoredNodes };
  }

  deleteTrashForever(trashId, actorUuid = this.myUuid) {
    const item = this.db.getTrashItem(trashId);
    if (!item) throw makeCodedError('NOT_FOUND', `Trash item not found: ${trashId}`);
    if (item.owner_uuid !== actorUuid) {
      throw makeCodedError('FORBIDDEN', 'Only the owner can permanently delete items from Trash');
    }

    const trashEntryDir = safeResolvePath(this.vaultPaths.trashDir, trashId);
    fs.rmSync(trashEntryDir, { recursive: true, force: true });
    this.db.deleteTrashItem(trashId);

    const actor = actorUuid === this.myUuid ? this.db.getIdentity() : this.db.getPeer(actorUuid);
    this.db.addAuditLog({
      eventType: 'trash_purged',
      actorUuid,
      actorName: actor?.display_name || '',
      targetPath: item.original_rel_path,
      targetId: trashId,
    });

    this.broadcast({ type: 'TRASH_PURGE', trashId });
    this.emit('trash:changed');
    return { ok: true, trashId };
  }

  // =========================================================================
  // Chat Actions
  // =========================================================================

  sendChatMessage(payload) {
    const id = this.db.getIdentity() || this.db.ensureIdentity();
    const actorUuid = payload.actorUuid || id.uuid;
    const actor = actorUuid === id.uuid ? id : this.db.getPeer(actorUuid);
    if (!actor) {
      throw makeCodedError('NOT_FOUND', `Actor not found: ${actorUuid}`);
    }

    const convId = payload.conversationId ?? payload.conversation_id;
    let conv = convId ? this.db.getConversation(convId) : null;
    if (!conv && payload.peerUuid) {
      conv = this.db.ensureDmConversation(actorUuid, payload.peerUuid);
    }
    if (!conv) {
      throw makeCodedError('NOT_FOUND', `Conversation not found: ${convId}`);
    }
    if (!this.db.isConversationMember(conv.id, actorUuid)) {
      throw makeCodedError('FORBIDDEN', 'Actor is not a member of this conversation');
    }

    let saved = this.db.saveMessage({
      id: payload.id || generateUuid(),
      conversation_id: conv.id,
      sender_uuid: actor.uuid,
      sender_name: actor.display_name || actor.name || 'Me',
      type: payload.type || 'text',
      body: payload.body ?? '',
      reply_to_id: payload.replyToId ?? payload.reply_to_id ?? null,
      forwarded_from_id: payload.forwardedFromId ?? payload.forwarded_from_id ?? null,
      attachment: payload.attachment ?? null,
      attachment_json: payload.attachment_json,
      vault_link_path:
        payload.vaultLinkPath ??
        payload.vault_link_path ??
        payload.vaultLink?.relPath ??
        payload.vaultLink?.rel_path ??
        null,
      vault_link_is_dir:
        payload.vaultLinkIsDir ??
        payload.vault_link_is_dir ??
        payload.vaultLink?.isDir ??
        payload.vaultLink?.is_dir ??
        false,
      lamport_ts: this.db.nextLamportTs(),
      created_at: Date.now(),
    });

    const memberUuids = (conv.members || []).map((m) => m.uuid || m.peer_uuid);
    // Broadcast to ALL connected desktop peers so every PC holds a distributed replica
    this.broadcast({
      type: 'CHAT_MESSAGE',
      conversation: {
        id: conv.id,
        type: conv.type,
        name: conv.name,
        avatar_data: conv.avatar_data,
        creator_uuid: conv.creator_uuid,
        created_at: conv.created_at,
        updated_at: conv.updated_at,
        members: memberUuids,
      },
      message: saved,
    });

    // Handle local delivery receipts if another member is active on this same PC
    const localOtherMembers = new Set();
    if (this.myUuid && this.myUuid !== actorUuid && memberUuids.includes(this.myUuid)) {
      localOtherMembers.add(this.myUuid);
    }
    for (const hostedUuid of this.hostedMobilePeers.keys()) {
      if (hostedUuid !== actorUuid && memberUuids.includes(hostedUuid)) {
        localOtherMembers.add(hostedUuid);
      }
    }
    for (const recUuid of localOtherMembers) {
      this.db.upsertReceipt(saved.id, recUuid, 'delivered');
      this.broadcast({
        type: 'CHAT_RECEIPT',
        conversationId: conv.id,
        messageIds: [saved.id],
        peerUuid: recUuid,
        status: 'delivered',
      });
    }
    if (localOtherMembers.size > 0) {
      saved = this.db.getMessageById(saved.id);
    }

    this.emit('chat:message', saved);
    this.emit('conversations:changed', { conversationId: conv.id, memberUuids });
    return saved;
  }

  editChatMessage(id, newBody, actorUuid = this.myUuid) {
    const existing = this.db.getMessageById(id);
    if (!existing) throw makeCodedError('NOT_FOUND', `Message not found: ${id}`);
    const actor = actorUuid || this.myUuid;
    if (existing.sender_uuid !== actor) {
      throw makeCodedError('FORBIDDEN', 'Only the message sender can edit this message');
    }
    if (existing.deleted_at) {
      throw makeCodedError('INVALID_OPERATION', 'Cannot edit a deleted message');
    }

    const lamportTs = this.db.nextLamportTs();
    const editedAt = Date.now();
    const updated = this.db.updateMessageText(id, newBody, editedAt, lamportTs);

    const payload = {
      type: 'CHAT_EDIT',
      id,
      conversationId: updated.conversation_id,
      body: newBody,
      editedAt,
      lamportTs,
      actorUuid: actor,
    };
    if (actor !== this.myUuid) {
      payload.actorProof = this._signActorProof(actor, 'CHAT_EDIT', id, lamportTs);
    }
    this.broadcast(payload);

    this.emit('chat:edit', updated);
    this.emit('conversations:changed', { conversationId: updated.conversation_id });
    return updated;
  }

  deleteChatMessage(id, actorUuid = this.myUuid) {
    const existing = this.db.getMessageById(id);
    if (!existing) throw makeCodedError('NOT_FOUND', `Message not found: ${id}`);
    const actor = actorUuid || this.myUuid;
    if (existing.sender_uuid !== actor) {
      throw makeCodedError('FORBIDDEN', 'Only the message sender can delete this message');
    }

    const lamportTs = this.db.nextLamportTs();
    const deletedAt = Date.now();
    const updated = this.db.softDeleteMessage(id, deletedAt, lamportTs);

    const payload = {
      type: 'CHAT_DELETE',
      id,
      conversationId: updated.conversation_id,
      deletedAt,
      lamportTs,
      actorUuid: actor,
    };
    if (actor !== this.myUuid) {
      payload.actorProof = this._signActorProof(actor, 'CHAT_DELETE', id, lamportTs);
    }
    this.broadcast(payload);

    this.emit('chat:delete', updated);
    this.emit('conversations:changed', { conversationId: updated.conversation_id });
    return updated;
  }

  sendTyping(conversationId, isTyping, actorUuid = this.myUuid) {
    const actor = actorUuid || this.myUuid;
    const conv = this.db.getConversation(conversationId);
    if (!conv || !this.db.isConversationMember(conversationId, actor)) return;
    const actorRec = actor === this.myUuid ? (this.db.getIdentity() || this.identity) : this.db.getPeer(actor);
    const displayName = actorRec?.display_name || actorRec?.name || 'Peer';
    this.broadcast({
      type: 'CHAT_TYPING',
      conversationId,
      peerUuid: actor,
      displayName,
      isTyping: Boolean(isTyping),
    });
    this.emit('chat:typing', {
      conversationId,
      peerUuid: actor,
      displayName,
      isTyping: Boolean(isTyping),
    });
  }

  markConversationRead(conversationId, actorUuid = this.myUuid) {
    const actor = actorUuid || this.myUuid;
    if (!this.db.isConversationMember(conversationId, actor)) return [];
    const newlyReadIds = this.db.markConversationRead(conversationId, actor);
    if (newlyReadIds.length > 0) {
      this.broadcast({
        type: 'CHAT_RECEIPT',
        conversationId,
        messageIds: newlyReadIds,
        peerUuid: actor,
        status: 'read',
      });
      this.emit('chat:receipt', {
        conversationId,
        messageIds: newlyReadIds,
        peerUuid: actor,
        status: 'read',
      });
      this.emit('conversations:changed', { conversationId });
    }
    return newlyReadIds;
  }

  toggleReaction(messageId, emoji, actorUuid = this.myUuid) {
    const actor = actorUuid || this.myUuid;
    const msg = this.db.getMessageById(messageId);
    if (!msg) throw makeCodedError('NOT_FOUND', `Message not found: ${messageId}`);
    if (!this.db.isConversationMember(msg.conversation_id, actor)) {
      throw makeCodedError('FORBIDDEN', 'Actor is not a member of this conversation');
    }
    const { added, reactions } = this.db.toggleReaction(messageId, actor, emoji);

    this.broadcast({
      type: 'CHAT_REACTION',
      messageId,
      conversationId: msg.conversation_id,
      peerUuid: actor,
      emoji,
      added,
      createdAt: Date.now(),
    });

    this.emit('chat:reaction', {
      messageId,
      conversationId: msg.conversation_id,
      peerUuid: actor,
      emoji,
      added,
      reactions,
    });
    return { added, reactions };
  }

  createGroup({ name, memberUuids = [], avatarData = null, creatorUuid = this.myUuid }) {
    const creator = creatorUuid || this.myUuid;
    const conv = this.db.createGroup({
      name,
      creatorUuid: creator,
      memberUuids,
      avatarData,
    });
    const allMembers = (conv.members || []).map((m) => m.uuid || m.peer_uuid);
    this.broadcast({
      type: 'GROUP_UPSERT',
      conversation: {
        id: conv.id,
        type: conv.type,
        name: conv.name,
        avatar_data: conv.avatar_data,
        creator_uuid: conv.creator_uuid,
        created_at: conv.created_at,
        updated_at: conv.updated_at,
        members: allMembers,
      },
    });
    this.emit('conversations:changed', { conversationId: conv.id, memberUuids: allMembers });
    return conv;
  }

  broadcastProfileUpdate() {
    const pubId = this._getPublicIdentity();
    this.broadcast({ type: 'PROFILE_UPDATE', identity: pubId });
    const selfPeer = this.db.getPeer(pubId.uuid);
    if (selfPeer) {
      this.broadcastPeerSync(selfPeer);
    }
    this.emit('peers:changed', this.db.getPeers());
    this.emit('conversations:changed');
    return pubId;
  }
}

module.exports = {
  MeshNetwork,
  computeEffectiveAcl,
  canViewTrashItem,
};
