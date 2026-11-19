'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const EventEmitter = require('events');
const { execFileSync } = require('child_process');
const chokidar = require('chokidar');
const archiver = require('archiver');
const AdmZip = require('adm-zip');

const MIME_MAP = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.jsx': 'text/javascript; charset=utf-8',
  '.ts': 'text/plain; charset=utf-8',
  '.tsx': 'text/plain; charset=utf-8',
  '.log': 'text/plain; charset=utf-8',
  '.ini': 'text/plain; charset=utf-8',
  '.yml': 'text/yaml; charset=utf-8',
  '.yaml': 'text/yaml; charset=utf-8',
  '.sql': 'text/plain; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.webm': 'audio/webm',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.avi': 'video/x-msvideo',
  '.mkv': 'video/x-matroska',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.zip': 'application/zip',
  '.rar': 'application/vnd.rar',
  '.7z': 'application/x-7z-compressed'
};

const TEXT_EXTENSIONS = new Set([
  '.txt', '.md', '.csv', '.json', '.xml', '.html', '.htm', '.css',
  '.js', '.jsx', '.ts', '.tsx', '.log', '.ini', '.yml', '.yaml', '.sql', '.conf', '.env'
]);

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.ico']);
const AUDIO_EXTENSIONS = new Set(['.mp3', '.wav', '.ogg', '.webm', '.m4a', '.aac']);
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.avi', '.mkv']);

function defaultOpenPathFn(filePath) {
  try {
    const electron = require('electron');
    if (electron && typeof electron === 'object' && electron.shell && typeof electron.shell.openPath === 'function') {
      return electron.shell.openPath(filePath);
    }
  } catch (_) {
    // Headless Node test environment
  }
  return Promise.resolve('');
}

function normalizeRelPath(relPath) {
  if (relPath === undefined || relPath === null) return '';
  let str = String(relPath).trim();
  if (str.includes('\0')) {
    throw new Error('Invalid path: null byte');
  }
  if (/^[a-zA-Z]:/.test(str)) {
    throw new Error('Invalid path: drive letter not permitted');
  }
  str = str.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  if (!str) return '';
  const parts = str.split('/').filter(Boolean);
  for (const part of parts) {
    if (part === '.' || part === '..') {
      throw new Error('Invalid path: traversal segment not permitted');
    }
  }
  return parts.join('/');
}

function getParentRelPath(relPath) {
  const norm = normalizeRelPath(relPath);
  if (!norm) return '';
  const idx = norm.lastIndexOf('/');
  return idx === -1 ? '' : norm.slice(0, idx);
}

function safeJoin(baseDir, relPath) {
  const resolvedBase = path.resolve(baseDir);
  const norm = normalizeRelPath(relPath);
  const target = norm ? path.resolve(resolvedBase, ...norm.split('/')) : resolvedBase;
  if (target !== resolvedBase && !target.startsWith(resolvedBase + path.sep)) {
    throw new Error('Path traversal denied');
  }
  return target;
}

function sanitizeFileName(name) {
  const cleaned = String(name || '')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .trim();
  if (!cleaned || cleaned === '.' || cleaned === '..') {
    return 'item';
  }
  return cleaned;
}

function guessMime(fileName) {
  const ext = path.extname(String(fileName || '')).toLowerCase();
  return MIME_MAP[ext] || 'application/octet-stream';
}

function getPreviewKind(mime, fileName) {
  const ext = path.extname(String(fileName || '')).toLowerCase();
  const lowMime = String(mime || '').toLowerCase();
  if (IMAGE_EXTENSIONS.has(ext) || lowMime.startsWith('image/')) return 'image';
  if (ext === '.pdf' || lowMime === 'application/pdf') return 'pdf';
  if (TEXT_EXTENSIONS.has(ext) || lowMime.startsWith('text/') || lowMime === 'application/json') return 'text';
  if (AUDIO_EXTENSIONS.has(ext) || lowMime.startsWith('audio/')) return 'audio';
  if (VIDEO_EXTENSIONS.has(ext) || lowMime.startsWith('video/')) return 'video';
  return 'unsupported';
}

function computeFileDigestSync(filePath) {
  const buf = fs.readFileSync(filePath);
  const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
  return { sha256, size: buf.length };
}

function computeFileDigest(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    let size = 0;
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => {
      size += chunk.length;
      hash.update(chunk);
    });
    stream.on('end', () => {
      resolve({ sha256: hash.digest('hex'), size });
    });
    stream.on('error', reject);
  });
}

function clearReadOnlyRecursive(targetPath) {
  if (!fs.existsSync(targetPath)) return;
  let stat;
  try {
    stat = fs.lstatSync(targetPath);
  } catch (_) {
    return;
  }
  if (stat.isDirectory()) {
    try {
      fs.chmodSync(targetPath, 0o700);
    } catch (_) {}
    let entries = [];
    try {
      entries = fs.readdirSync(targetPath);
    } catch (_) {}
    for (const entry of entries) {
      clearReadOnlyRecursive(path.join(targetPath, entry));
    }
  } else {
    try {
      fs.chmodSync(targetPath, 0o600);
    } catch (_) {}
    if (process.platform === 'win32') {
      try {
        execFileSync('attrib', ['-r', targetPath], { stdio: 'ignore' });
      } catch (_) {}
    }
  }
}

function removeDirSafe(dirPath) {
  if (!dirPath || !fs.existsSync(dirPath)) return;
  clearReadOnlyRecursive(dirPath);
  fs.rmSync(dirPath, { recursive: true, force: true });
}

function setFileReadOnly(filePath) {
  try {
    fs.chmodSync(filePath, 0o444);
  } catch (_) {}
  if (process.platform === 'win32') {
    try {
      execFileSync('attrib', ['+r', filePath], { stdio: 'ignore' });
    } catch (_) {}
  }
}

function makeUniqueName(existingLowerSet, desiredName, isDir) {
  const safe = sanitizeFileName(desiredName);
  if (!existingLowerSet.has(safe.toLowerCase())) {
    return safe;
  }
  const ext = isDir ? '' : path.extname(safe);
  const base = isDir ? safe : (ext ? safe.slice(0, -ext.length) : safe);
  let counter = 2;
  while (counter < 10000) {
    const candidate = `${base} (${counter})${ext}`;
    if (!existingLowerSet.has(candidate.toLowerCase())) {
      return candidate;
    }
    counter += 1;
  }
  return `${base} (${Date.now()})${ext}`;
}

function formatTimeHms(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
}

function isIgnoredTempWatchFile(filePath) {
  const base = path.basename(filePath);
  const lower = base.toLowerCase();
  return (
    base.startsWith('~$') ||
    base.startsWith('.~') ||
    base.startsWith('~WRL') ||
    lower.endsWith('.tmp') ||
    lower.endsWith('.part') ||
    lower.endsWith('.crdownload')
  );
}

function sanitizeNodeForPublic(node) {
  if (!node) return null;
  return {
    rel_path: node.rel_path,
    parent_path: node.parent_path,
    name: node.name,
    is_dir: Boolean(node.is_dir),
    size: node.size || 0,
    mime: node.mime || '',
    sha256: node.sha256 || '',
    owner_uuid: node.owner_uuid,
    owner_name: node.owner_name || '',
    perm_mode: node.perm_mode || 'public',
    has_password: Boolean(node.password_hash),
    allowed_editors: Array.isArray(node.allowed_editors) ? node.allowed_editors : [],
    allowed_viewers: Array.isArray(node.allowed_viewers) ? node.allowed_viewers : [],
    acl_version: node.acl_version || 1,
    version: node.version || 1,
    created_at: node.created_at,
    updated_at: node.updated_at
  };
}

function zipDirectoryFast(srcDir, destZipPath, filterFn = null) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(destZipPath), { recursive: true });
    const output = fs.createWriteStream(destZipPath);
    const archive = archiver('zip', { zlib: { level: 1 } });

    let entryCount = 0;
    let totalSize = 0;

    output.on('close', () => {
      resolve({ entryCount, totalSize, zipBytes: archive.pointer() });
    });
    output.on('error', reject);
    archive.on('error', reject);
    archive.on('warning', (err) => {
      if (err.code !== 'ENOENT') reject(err);
    });

    archive.pipe(output);

    function walk(dir, relPrefix) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const ent of entries) {
        const full = path.join(dir, ent.name);
        const rel = relPrefix ? `${relPrefix}/${ent.name}` : ent.name;
        if (filterFn && !filterFn(rel, ent.isDirectory())) {
          continue;
        }
        if (ent.isDirectory()) {
          archive.append('', { name: rel + '/' });
          walk(full, rel);
        } else if (ent.isFile()) {
          const st = fs.statSync(full);
          entryCount += 1;
          totalSize += st.size;
          archive.file(full, { name: rel });
        }
      }
    }

    try {
      walk(srcDir, '');
      archive.finalize();
    } catch (err) {
      reject(err);
    }
  });
}

function extractZipSafe(zipPath, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  const resolvedDest = path.resolve(destDir);
  const zip = new AdmZip(zipPath);
  const zipEntries = zip.getEntries();
  const extracted = [];

  for (const entry of zipEntries) {
    const rawName = String(entry.entryName || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    if (!rawName) continue;
    const segments = rawName.split('/').filter(Boolean);
    if (segments.some((s) => s === '.' || s === '..') || /^[a-zA-Z]:/.test(rawName)) {
      throw new Error(`Unsafe zip entry rejected: ${entry.entryName}`);
    }
    const targetPath = path.resolve(resolvedDest, ...segments);
    if (targetPath !== resolvedDest && !targetPath.startsWith(resolvedDest + path.sep)) {
      throw new Error(`Zip Slip detected: ${entry.entryName}`);
    }
    const normRel = segments.join('/');
    if (entry.isDirectory) {
      fs.mkdirSync(targetPath, { recursive: true });
      extracted.push({ relPath: normRel, name: segments[segments.length - 1], isDir: true, size: 0 });
    } else {
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      const content = entry.getData();
      fs.writeFileSync(targetPath, content);
      extracted.push({ relPath: normRel, name: segments[segments.length - 1], isDir: false, size: content.length });
    }
  }
  return extracted;
}

class SandboxManager extends EventEmitter {
  constructor({ db, meshNetwork, vaultPaths, openPathFn }) {
    super();
    this.db = db;
    this.meshNetwork = meshNetwork;
    this.vaultPaths = vaultPaths;
    this.openPathFn = openPathFn || defaultOpenPathFn;
    this.sessions = new Map();
    this.extractedFolderSessions = new Map();
  }

  _ensureVaultDirs() {
    fs.mkdirSync(this.vaultPaths.filesDir, { recursive: true });
    fs.mkdirSync(this.vaultPaths.stagingDir, { recursive: true });
    fs.mkdirSync(this.vaultPaths.chatBlobsDir, { recursive: true });
  }

  _getActorUuid(actorUuid) {
    return actorUuid || this.db.getIdentity()?.uuid || '';
  }

  async _atomicWriteFileToVault(srcFilePath, destRelPath) {
    this._ensureVaultDirs();
    const normRel = normalizeRelPath(destRelPath);
    const vaultTarget = safeJoin(this.vaultPaths.filesDir, normRel);
    fs.mkdirSync(path.dirname(vaultTarget), { recursive: true });

    const { sha256: srcSha, size: srcSize } = await computeFileDigest(srcFilePath);
    const stagingFile = path.join(this.vaultPaths.stagingDir, `${crypto.randomUUID()}.tmp`);

    try {
      fs.copyFileSync(srcFilePath, stagingFile);
      const { sha256: stageSha, size: stageSize } = await computeFileDigest(stagingFile);
      if (stageSha !== srcSha || stageSize !== srcSize) {
        throw new Error('Staging verification mismatch: SHA-256 or byte length differed');
      }

      if (typeof this.meshNetwork?.suppressWatch === 'function') {
        this.meshNetwork.suppressWatch(normRel, 3500);
      }
      // Atomic safe replace without deleting original beforehand
      fs.renameSync(stagingFile, vaultTarget);

      return { sha256: stageSha, size: stageSize, vaultTarget };
    } catch (err) {
      if (fs.existsSync(stagingFile)) {
        try { fs.unlinkSync(stagingFile); } catch (_) {}
      }
      throw err;
    }
  }

  _buildConflictRelPath(origRelPath, displayName) {
    const parent = getParentRelPath(origRelPath);
    const origName = path.basename(origRelPath);
    const ext = path.extname(origName);
    const base = ext ? origName.slice(0, -ext.length) : origName;
    const safeDisplay = sanitizeFileName(displayName || 'User');
    const timeStr = formatTimeHms(new Date());
    let candidateName = `${base} (نسخة متعارضة - ${safeDisplay} - ${timeStr})${ext}`;
    let candidateRel = parent ? `${parent}/${candidateName}` : candidateName;
    let counter = 2;
    while (fs.existsSync(safeJoin(this.vaultPaths.filesDir, candidateRel))) {
      candidateName = `${base} (نسخة متعارضة - ${safeDisplay} - ${timeStr}) (${counter})${ext}`;
      candidateRel = parent ? `${parent}/${candidateName}` : candidateName;
      counter += 1;
    }
    return { conflictRelPath: candidateRel, conflictName: candidateName };
  }

  async _upsertAndBroadcastFile(relPath, { sha256, size, actorUuid, existingNode = null }) {
    const normRel = normalizeRelPath(relPath);
    const now = Date.now();
    const name = path.basename(normRel);
    const parentPath = getParentRelPath(normRel);
    const mime = guessMime(name);
    const existing = existingNode || this.db.getVaultNode(normRel);
    const identity = this.db.getIdentity();
    const ownerName = existing
      ? existing.owner_name
      : (identity && identity.uuid === actorUuid ? identity.display_name : '');

    const nodeData = {
      rel_path: normRel,
      parent_path: parentPath,
      name,
      is_dir: 0,
      size,
      mime,
      sha256,
      owner_uuid: existing ? existing.owner_uuid : actorUuid,
      owner_name: ownerName,
      perm_mode: existing ? existing.perm_mode : 'public',
      password_hash: existing ? existing.password_hash : null,
      password_salt: existing ? existing.password_salt : null,
      allowed_editors: existing ? existing.allowed_editors : [],
      allowed_viewers: existing ? existing.allowed_viewers : [],
      acl_version: existing ? (existing.acl_version || 1) : 1,
      version: existing ? ((existing.version || 0) + 1) : 1,
      lamport_ts: typeof this.db.nextLamportTs === 'function' ? this.db.nextLamportTs() : now,
      created_at: existing ? existing.created_at : now,
      updated_at: now
    };

    const savedNode = this.db.upsertVaultNode(nodeData);
    if (typeof this.meshNetwork?.broadcastVaultFileSaved === 'function') {
      await this.meshNetwork.broadcastVaultFileSaved(normRel, {
        sha256,
        size,
        mime,
        updatedAt: now,
        actorUuid,
        node: savedNode
      });
    }
    return savedNode;
  }

  async _upsertAndBroadcastFolder(relPath, actorUuid) {
    const normRel = normalizeRelPath(relPath);
    if (!normRel) return null;
    const now = Date.now();
    const existing = this.db.getVaultNode(normRel);
    if (existing && existing.is_dir) {
      return existing;
    }
    const name = path.basename(normRel);
    const parentPath = getParentRelPath(normRel);
    const dirTarget = safeJoin(this.vaultPaths.filesDir, normRel);
    if (typeof this.meshNetwork?.suppressWatch === 'function') {
      this.meshNetwork.suppressWatch(normRel, 3500);
    }
    fs.mkdirSync(dirTarget, { recursive: true });

    const identity = this.db.getIdentity();
    const ownerName = existing
      ? existing.owner_name
      : (identity && identity.uuid === actorUuid ? identity.display_name : '');

    const nodeData = {
      rel_path: normRel,
      parent_path: parentPath,
      name,
      is_dir: 1,
      size: 0,
      mime: 'inode/directory',
      sha256: '',
      owner_uuid: existing ? existing.owner_uuid : actorUuid,
      owner_name: ownerName,
      perm_mode: existing ? existing.perm_mode : 'public',
      password_hash: existing ? existing.password_hash : null,
      password_salt: existing ? existing.password_salt : null,
      allowed_editors: existing ? existing.allowed_editors : [],
      allowed_viewers: existing ? existing.allowed_viewers : [],
      acl_version: existing ? (existing.acl_version || 1) : 1,
      version: existing ? ((existing.version || 0) + 1) : 1,
      lamport_ts: typeof this.db.nextLamportTs === 'function' ? this.db.nextLamportTs() : now,
      created_at: existing ? existing.created_at : now,
      updated_at: now
    };

    const savedNode = this.db.upsertVaultNode(nodeData);
    if (typeof this.meshNetwork?.broadcastVaultFileSaved === 'function') {
      await this.meshNetwork.broadcastVaultFileSaved(normRel, {
        isDir: true,
        updatedAt: now,
        actorUuid,
        node: savedNode
      });
    }
    return savedNode;
  }

  async _handleTempFileSaved(session) {
    if (session.closed) return;
    if (session.saving) {
      session.pendingResave = true;
      return;
    }
    session.saving = true;
    try {
      do {
        session.pendingResave = false;
        if (session.closed || !fs.existsSync(session.tempFile)) break;

        let tempDigest;
        try {
          tempDigest = await computeFileDigest(session.tempFile);
        } catch (_) {
          // Retry briefly if Office is mid-lock/rename
          await new Promise((r) => setTimeout(r, 200));
          if (session.closed || !fs.existsSync(session.tempFile)) break;
          tempDigest = await computeFileDigest(session.tempFile);
        }

        if (tempDigest.sha256 === session.baseSha256 || tempDigest.sha256 === session.lastSavedTempSha) {
          continue;
        }

        const vaultTargetFile = safeJoin(this.vaultPaths.filesDir, session.relPath);
        let currentVaultSha = null;
        if (fs.existsSync(vaultTargetFile)) {
          currentVaultSha = computeFileDigestSync(vaultTargetFile).sha256;
        }

        const actor = this.db.getIdentity();
        const actorUuid = session.actorUuid || actor?.uuid || '';
        const displayName = actor?.display_name || 'User';

        if (currentVaultSha === session.baseSha256) {
          const writeRes = await this._atomicWriteFileToVault(session.tempFile, session.relPath);
          session.baseSha256 = writeRes.sha256;
          session.lastSavedTempSha = writeRes.sha256;

          await this._upsertAndBroadcastFile(session.relPath, {
            sha256: writeRes.sha256,
            size: writeRes.size,
            actorUuid
          });

          if (typeof this.db.addAuditLog === 'function') {
            this.db.addAuditLog({
              id: crypto.randomUUID(),
              eventType: 'VAULT_FILE_SAVED',
              actorUuid,
              actorName: displayName,
              targetPath: session.relPath,
              details: JSON.stringify({ size: writeRes.size, sha256: writeRes.sha256 }),
              createdAt: Date.now()
            });
          }

          this.emit('sandbox:saved', {
            sessionId: session.sessionId,
            relPath: session.relPath,
            fileName: session.fileName,
            sha256: writeRes.sha256,
            size: writeRes.size
          });
        } else {
          // Concurrent modification detected: branch into conflict copy
          const { conflictRelPath, conflictName } = this._buildConflictRelPath(session.relPath, displayName);
          const writeRes = await this._atomicWriteFileToVault(session.tempFile, conflictRelPath);
          session.lastSavedTempSha = tempDigest.sha256;

          await this._upsertAndBroadcastFile(conflictRelPath, {
            sha256: writeRes.sha256,
            size: writeRes.size,
            actorUuid
          });

          if (typeof this.db.addAuditLog === 'function') {
            this.db.addAuditLog({
              id: crypto.randomUUID(),
              eventType: 'VAULT_CONFLICT_SAVED',
              actorUuid,
              actorName: displayName,
              targetPath: conflictRelPath,
              details: JSON.stringify({ originalPath: session.relPath, size: writeRes.size }),
              createdAt: Date.now()
            });
          }

          this.emit('sandbox:conflict-saved', {
            sessionId: session.sessionId,
            relPath: session.relPath,
            conflictRelPath,
            fileName: conflictName
          });
        }
      } while (session.pendingResave && !session.closed);
    } finally {
      session.saving = false;
    }
  }

  _scheduleTempSave(session) {
    if (session.closed) return;
    if (session.debounceTimer) {
      clearTimeout(session.debounceTimer);
    }
    session.debounceTimer = setTimeout(() => {
      session.debounceTimer = null;
      this._handleTempFileSaved(session).catch((err) => {
        this.emit('sandbox:error', { sessionId: session.sessionId, relPath: session.relPath, error: err.message });
      });
    }, 250);
  }

  async openVaultFile(relPath, options = {}) {
    const {
      actorUuid: explicitActorUuid,
      unlockedSet,
      forceReadOnly = false,
      acknowledgeCoEdit = false
    } = options;
    const actorUuid = this._getActorUuid(explicitActorUuid);
    const rel = normalizeRelPath(relPath);
    if (!rel) {
      return { ok: false, code: 'NOT_FOUND', error: 'Invalid file path' };
    }

    const acl = this.meshNetwork.computeEffectiveAcl(rel, actorUuid, unlockedSet);
    if (!acl.canRead) {
      return { ok: false, code: 'LOCKED', blockingAncestor: acl.blockingAncestor };
    }

    const node = this.db.getVaultNode(rel);
    const vaultTargetFile = safeJoin(this.vaultPaths.filesDir, rel);
    if (!node || node.is_dir || !fs.existsSync(vaultTargetFile)) {
      return { ok: false, code: 'NOT_FOUND', error: 'File not found in Vault' };
    }

    const isEditable = Boolean(acl.canWrite && !forceReadOnly);
    if (isEditable) {
      const editors = this.meshNetwork.getActiveEditors(rel, actorUuid) || [];
      if (editors.length > 0 && !acknowledgeCoEdit) {
        return { ok: false, code: 'COEDIT_WARNING', editors };
      }
    }

    const tempDir = path.join(os.tmpdir(), 'wm_' + crypto.randomBytes(3).toString('hex'));
    fs.mkdirSync(tempDir, { recursive: true });
    const fileName = path.basename(rel);
    const tempFile = path.join(tempDir, fileName);
    fs.copyFileSync(vaultTargetFile, tempFile);

    const { sha256: baseSha256 } = await computeFileDigest(vaultTargetFile);
    const mode = isEditable ? 'edit' : 'view';
    const sessionId = crypto.randomUUID();

    const session = {
      sessionId,
      relPath: rel,
      fileName,
      tempDir,
      tempFile,
      mode,
      actorUuid,
      baseSha256,
      lastSavedTempSha: null,
      watcher: null,
      debounceTimer: null,
      saving: false,
      pendingResave: false,
      closed: false,
      openedAt: Date.now()
    };

    if (!isEditable) {
      setFileReadOnly(tempFile);
    } else {
      const expectedName = process.platform === 'win32' ? fileName.toLowerCase() : fileName;
      const watcher = chokidar.watch(tempDir, {
        ignoreInitial: true,
        depth: 0,
        awaitWriteFinish: { stabilityThreshold: 250, pollInterval: 100 },
        ignored: (p) => p !== tempDir && isIgnoredTempWatchFile(p)
      });

      const onFileEvent = (changedPath) => {
        const changedBase = path.basename(changedPath);
        const match = process.platform === 'win32'
          ? changedBase.toLowerCase() === expectedName
          : changedBase === expectedName;
        if (match) {
          this._scheduleTempSave(session);
        }
      };

      watcher.on('add', onFileEvent);
      watcher.on('change', onFileEvent);
      session.watcher = watcher;

      await new Promise((resolve) => {
        const timer = setTimeout(resolve, 1000);
        watcher.once('ready', () => {
          clearTimeout(timer);
          resolve();
        });
      });
    }

    this.sessions.set(sessionId, session);
    if (typeof this.meshNetwork?.announceFileOpen === 'function') {
      await this.meshNetwork.announceFileOpen(rel, mode);
    }
    await this.openPathFn(tempFile);
    this.emit('sandbox:sessions-changed', this.getOpenSessions());

    return { ok: true, sessionId, mode, fileName, tempDir };
  }

  async closeSession(sessionId) {
    const extSession = this.extractedFolderSessions.get(sessionId);
    if (extSession) {
      removeDirSafe(extSession.tempDir);
      this.extractedFolderSessions.delete(sessionId);
      return { ok: true };
    }

    const session = this.sessions.get(sessionId);
    if (!session) {
      return { ok: false, error: 'Session not found' };
    }

    session.closed = true;
    if (session.debounceTimer) {
      clearTimeout(session.debounceTimer);
      session.debounceTimer = null;
    }

    if (session.watcher) {
      try {
        await session.watcher.close();
      } catch (_) {}
      session.watcher = null;
    }

    // Wait briefly if an atomic save is actively completing
    let waitCount = 0;
    while (session.saving && waitCount < 40) {
      await new Promise((r) => setTimeout(r, 50));
      waitCount += 1;
    }

    removeDirSafe(session.tempDir);
    this.sessions.delete(sessionId);

    if (typeof this.meshNetwork?.announceFileClose === 'function') {
      await this.meshNetwork.announceFileClose(session.relPath);
    }

    this.emit('sandbox:sessions-changed', this.getOpenSessions());
    return { ok: true };
  }

  getOpenSessions() {
    const list = [];
    for (const s of this.sessions.values()) {
      list.push({
        sessionId: s.sessionId,
        relPath: s.relPath,
        fileName: s.fileName,
        mode: s.mode,
        openedAt: s.openedAt
      });
    }
    return list;
  }

  onRemoteFileUpdated(relPath, editorName) {
    const norm = normalizeRelPath(relPath);
    for (const session of this.sessions.values()) {
      if (session.relPath === norm && session.mode === 'edit') {
        this.emit('sandbox:remote-updated', {
          sessionId: session.sessionId,
          relPath: norm,
          fileName: session.fileName,
          editorName
        });
      }
    }
  }

  async cleanupAll() {
    const ids = [...this.sessions.keys(), ...this.extractedFolderSessions.keys()];
    for (const id of ids) {
      await this.closeSession(id);
    }
  }

  async saveCopyToDisk(relPath, destPath, actorUuid, unlockedSet) {
    const actor = this._getActorUuid(actorUuid);
    const rel = normalizeRelPath(relPath);
    if (!rel) {
      return { ok: false, code: 'NOT_FOUND', error: 'Invalid path' };
    }

    const acl = this.meshNetwork.computeEffectiveAcl(rel, actor, unlockedSet);
    if (!acl.canRead) {
      return { ok: false, code: 'LOCKED', blockingAncestor: acl.blockingAncestor };
    }

    const srcPath = safeJoin(this.vaultPaths.filesDir, rel);
    if (!fs.existsSync(srcPath)) {
      return { ok: false, code: 'NOT_FOUND', error: 'Source not found in Vault' };
    }

    const stat = fs.statSync(srcPath);
    if (!stat.isDirectory()) {
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      fs.copyFileSync(srcPath, destPath);
    } else {
      const copyTree = (curDisk, curRel, targetDisk) => {
        fs.mkdirSync(targetDisk, { recursive: true });
        const entries = fs.readdirSync(curDisk, { withFileTypes: true });
        for (const ent of entries) {
          const childRel = curRel ? `${curRel}/${ent.name}` : ent.name;
          const childAcl = this.meshNetwork.computeEffectiveAcl(childRel, actor, unlockedSet);
          if (!childAcl.canRead) continue;
          const childSrc = path.join(curDisk, ent.name);
          const childDst = path.join(targetDisk, ent.name);
          if (ent.isDirectory()) {
            copyTree(childSrc, childRel, childDst);
          } else if (ent.isFile()) {
            fs.copyFileSync(childSrc, childDst);
          }
        }
      };
      copyTree(srcPath, rel, destPath);
    }

    if (typeof this.db.addAuditLog === 'function') {
      const identity = this.db.getIdentity();
      this.db.addAuditLog({
        id: crypto.randomUUID(),
        eventType: 'VAULT_EXPORT_COPY',
        actorUuid: actor,
        actorName: identity?.display_name || 'User',
        targetPath: rel,
        details: JSON.stringify({ isDir: stat.isDirectory() }),
        createdAt: Date.now()
      });
    }

    return { ok: true, destPath };
  }

  _getExistingChildNamesLower(parentRel) {
    const set = new Set();
    const diskDir = safeJoin(this.vaultPaths.filesDir, parentRel);
    if (fs.existsSync(diskDir)) {
      for (const name of fs.readdirSync(diskDir)) {
        set.add(name.toLowerCase());
      }
    }
    const dbChildren = this.db.listVaultChildren(parentRel) || [];
    for (const child of dbChildren) {
      if (child && child.name) {
        set.add(String(child.name).toLowerCase());
      }
    }
    return set;
  }

  async _importSingleOsPathRecursive(osPath, parentRel, targetName, conflictStrategy, actorUuid, importedList) {
    const stat = fs.statSync(osPath);
    const targetRel = parentRel ? `${parentRel}/${targetName}` : targetName;

    if (stat.isDirectory()) {
      await this._upsertAndBroadcastFolder(targetRel, actorUuid);
      importedList.push(targetRel);

      const children = fs.readdirSync(osPath, { withFileTypes: true });
      for (const ent of children) {
        const childOsPath = path.join(osPath, ent.name);
        const safeChildName = sanitizeFileName(ent.name);
        await this._importSingleOsPathRecursive(
          childOsPath,
          targetRel,
          safeChildName,
          conflictStrategy,
          actorUuid,
          importedList
        );
      }
    } else if (stat.isFile()) {
      if (conflictStrategy === 'overwrite' && typeof this.meshNetwork?.assertNotUnderLiveEdit === 'function') {
        if (fs.existsSync(safeJoin(this.vaultPaths.filesDir, targetRel))) {
          this.meshNetwork.assertNotUnderLiveEdit(targetRel, actorUuid);
        }
      }
      const writeRes = await this._atomicWriteFileToVault(osPath, targetRel);
      await this._upsertAndBroadcastFile(targetRel, {
        sha256: writeRes.sha256,
        size: writeRes.size,
        actorUuid
      });
      importedList.push(targetRel);
    }
  }

  async importOsPathsToVault(osPaths, targetParentPath = '', conflictStrategy = 'prompt', actorUuid, unlockedSet) {
    const actor = this._getActorUuid(actorUuid);
    const parentRel = normalizeRelPath(targetParentPath || '');
    const pathsList = Array.isArray(osPaths) ? osPaths.filter(Boolean) : [osPaths].filter(Boolean);

    if (parentRel) {
      const acl = this.meshNetwork.computeEffectiveAcl(parentRel, actor, unlockedSet);
      if (!acl.canWrite) {
        return {
          ok: false,
          code: acl.canRead ? 'FORBIDDEN' : 'LOCKED',
          blockingAncestor: acl.blockingAncestor,
          error: 'No write permission on target folder'
        };
      }
    }

    const validItems = [];
    for (const p of pathsList) {
      if (fs.existsSync(p)) {
        const st = fs.statSync(p);
        validItems.push({ osPath: p, name: sanitizeFileName(path.basename(p)), isDir: st.isDirectory() });
      }
    }

    if (validItems.length === 0) {
      return { ok: false, code: 'NOT_FOUND', error: 'No valid source paths provided' };
    }

    const existingLower = this._getExistingChildNamesLower(parentRel);
    const conflicts = [];
    for (const item of validItems) {
      if (existingLower.has(item.name.toLowerCase())) {
        conflicts.push({
          osPath: item.osPath,
          name: item.name,
          existingRelPath: parentRel ? `${parentRel}/${item.name}` : item.name,
          isDir: item.isDir
        });
      }
    }

    if (conflicts.length > 0 && conflictStrategy === 'prompt') {
      return { ok: false, conflict: true, conflicts };
    }

    const imported = [];
    for (const item of validItems) {
      let targetName = item.name;
      if (existingLower.has(targetName.toLowerCase())) {
        if (conflictStrategy === 'keep_both') {
          targetName = makeUniqueName(existingLower, item.name, item.isDir);
        }
      }
      existingLower.add(targetName.toLowerCase());
      await this._importSingleOsPathRecursive(item.osPath, parentRel, targetName, conflictStrategy, actor, imported);
    }

    if (typeof this.meshNetwork?.emit === 'function') {
      this.meshNetwork.emit('vault:changed', { parentPath: parentRel, paths: imported });
    }

    return { ok: true, imported };
  }

  async saveBufferAsChatBlob({ buffer, fileName, mime }) {
    this._ensureVaultDirs();
    const blobId = crypto.randomUUID();
    const originalName = String(fileName || 'file');
    const safeName = sanitizeFileName(originalName);
    const blobDir = path.join(this.vaultPaths.chatBlobsDir, blobId);
    fs.mkdirSync(blobDir, { recursive: true });
    const destFile = path.join(blobDir, safeName);
    fs.writeFileSync(destFile, buffer);
    const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
    return {
      blobId,
      fileName: safeName,
      originalName,
      size: buffer.length,
      mime: mime || guessMime(safeName),
      sha256,
      isFolder: false,
      entryCount: 1,
      totalSize: buffer.length
    };
  }

  async prepareDirectChatAttachment(osPath) {
    this._ensureVaultDirs();
    if (!osPath || !fs.existsSync(osPath)) {
      throw new Error(`Attachment source does not exist: ${osPath}`);
    }
    const stat = fs.statSync(osPath);
    const blobId = crypto.randomUUID();
    const originalName = path.basename(osPath);
    const safeName = sanitizeFileName(originalName);
    const blobDir = path.join(this.vaultPaths.chatBlobsDir, blobId);
    fs.mkdirSync(blobDir, { recursive: true });

    if (!stat.isDirectory()) {
      const destFile = path.join(blobDir, safeName);
      fs.copyFileSync(osPath, destFile);
      const { sha256, size } = await computeFileDigest(destFile);
      return {
        blobId,
        fileName: safeName,
        originalName,
        size,
        mime: guessMime(safeName),
        sha256,
        isFolder: false,
        entryCount: 1,
        totalSize: size
      };
    }

    const zipName = `${safeName}.zip`;
    const zipPath = path.join(blobDir, zipName);
    const { entryCount, totalSize } = await zipDirectoryFast(osPath, zipPath);
    const { sha256, size } = await computeFileDigest(zipPath);
    return {
      blobId,
      fileName: zipName,
      originalName,
      size,
      mime: 'application/zip',
      sha256,
      isFolder: true,
      entryCount,
      totalSize
    };
  }

  async prepareIndependentVaultCopyForChat(relPath, actorUuid, unlockedSet) {
    this._ensureVaultDirs();
    const actor = this._getActorUuid(actorUuid);
    const rel = normalizeRelPath(relPath);
    if (!rel) {
      return { ok: false, code: 'NOT_FOUND', error: 'Invalid vault path' };
    }

    const acl = this.meshNetwork.computeEffectiveAcl(rel, actor, unlockedSet);
    if (!acl.canRead) {
      return { ok: false, code: 'LOCKED', blockingAncestor: acl.blockingAncestor };
    }

    const srcPath = safeJoin(this.vaultPaths.filesDir, rel);
    if (!fs.existsSync(srcPath)) {
      return { ok: false, code: 'NOT_FOUND', error: 'Vault item not found on disk' };
    }

    const stat = fs.statSync(srcPath);
    if (!stat.isDirectory()) {
      const meta = await this.prepareDirectChatAttachment(srcPath);
      return { ok: true, ...meta };
    }

    const blobId = crypto.randomUUID();
    const originalName = path.basename(srcPath);
    const safeName = sanitizeFileName(originalName);
    const blobDir = path.join(this.vaultPaths.chatBlobsDir, blobId);
    fs.mkdirSync(blobDir, { recursive: true });
    const zipName = `${safeName}.zip`;
    const zipPath = path.join(blobDir, zipName);

    const { entryCount, totalSize } = await zipDirectoryFast(srcPath, zipPath, (childSubRel) => {
      const childFullRel = `${rel}/${childSubRel}`;
      const childAcl = this.meshNetwork.computeEffectiveAcl(childFullRel, actor, unlockedSet);
      return childAcl.canRead;
    });
    const { sha256, size } = await computeFileDigest(zipPath);

    return {
      ok: true,
      blobId,
      fileName: zipName,
      originalName,
      size,
      mime: 'application/zip',
      sha256,
      isFolder: true,
      entryCount,
      totalSize
    };
  }

  async _ensureBlobLocal(attachment) {
    if (!attachment || !attachment.blobId || !attachment.fileName) {
      throw new Error('Invalid attachment metadata');
    }
    if (typeof this.meshNetwork?.ensureChatBlobAvailable === 'function') {
      await this.meshNetwork.ensureChatBlobAvailable(attachment.blobId, attachment.fileName);
    }
    const blobDir = safeJoin(this.vaultPaths.chatBlobsDir, attachment.blobId);
    const blobFile = safeJoin(blobDir, attachment.fileName);
    if (!fs.existsSync(blobFile)) {
      throw new Error('Chat attachment blob not available locally');
    }
    return blobFile;
  }

  async openChatAttachment(attachment) {
    const blobFile = await this._ensureBlobLocal(attachment);
    const tempDir = path.join(os.tmpdir(), 'wm_' + crypto.randomBytes(3).toString('hex'));
    fs.mkdirSync(tempDir, { recursive: true });

    if (!attachment.isFolder) {
      const targetName = sanitizeFileName(attachment.originalName || attachment.fileName);
      const tempFile = path.join(tempDir, targetName);
      fs.copyFileSync(blobFile, tempFile);
      await this.openPathFn(tempFile);
      return { ok: true, isFolder: false, fileName: targetName, tempDir };
    }

    const entries = extractZipSafe(blobFile, tempDir);
    const sessionId = crypto.randomUUID();
    const rootName = sanitizeFileName(
      attachment.originalName || String(attachment.fileName).replace(/\.zip$/i, '')
    );
    this.extractedFolderSessions.set(sessionId, {
      sessionId,
      tempDir,
      rootName,
      entries
    });

    return {
      ok: true,
      isFolder: true,
      sessionId,
      rootName,
      entries,
      tempDir
    };
  }

  async openExtractedFolderEntry(sessionId, entryRelPath) {
    const extSession = this.extractedFolderSessions.get(sessionId);
    if (!extSession) {
      return { ok: false, error: 'Folder preview session not found' };
    }
    const norm = normalizeRelPath(entryRelPath);
    if (!norm) {
      return { ok: false, error: 'Invalid entry path' };
    }
    const targetFile = safeJoin(extSession.tempDir, norm);
    if (!fs.existsSync(targetFile) || fs.statSync(targetFile).isDirectory()) {
      return { ok: false, error: 'File not found in extracted archive' };
    }
    await this.openPathFn(targetFile);
    return { ok: true, fileName: path.basename(targetFile), tempDir: extSession.tempDir };
  }

  async saveChatAttachmentToDisk(attachment, targetPath) {
    const blobFile = await this._ensureBlobLocal(attachment);
    if (!attachment.isFolder) {
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.copyFileSync(blobFile, targetPath);
      return { ok: true, targetPath };
    }
    extractZipSafe(blobFile, targetPath);
    return { ok: true, targetPath };
  }

  async saveChatAttachmentToVault(attachment, targetVaultFolder = '', conflictStrategy = 'prompt', actorUuid, unlockedSet) {
    const actor = this._getActorUuid(actorUuid);
    const parentRel = normalizeRelPath(targetVaultFolder || '');

    if (parentRel) {
      const acl = this.meshNetwork.computeEffectiveAcl(parentRel, actor, unlockedSet);
      if (!acl.canWrite) {
        return {
          ok: false,
          code: acl.canRead ? 'FORBIDDEN' : 'LOCKED',
          blockingAncestor: acl.blockingAncestor,
          error: 'No write permission on target Vault folder'
        };
      }
    }

    const blobFile = await this._ensureBlobLocal(attachment);
    const isFolder = Boolean(attachment.isFolder);
    let desiredName = sanitizeFileName(attachment.originalName || attachment.fileName);
    if (isFolder && desiredName.toLowerCase().endsWith('.zip') && !attachment.originalName) {
      desiredName = desiredName.slice(0, -4) || 'Folder';
    }

    const existingLower = this._getExistingChildNamesLower(parentRel);
    const hasCollision = existingLower.has(desiredName.toLowerCase());
    if (hasCollision && conflictStrategy === 'prompt') {
      return {
        ok: false,
        conflict: true,
        conflicts: [
          {
            name: desiredName,
            existingRelPath: parentRel ? `${parentRel}/${desiredName}` : desiredName,
            isDir: isFolder
          }
        ]
      };
    }

    const finalName = (hasCollision && conflictStrategy === 'keep_both')
      ? makeUniqueName(existingLower, desiredName, isFolder)
      : desiredName;
    const targetRel = parentRel ? `${parentRel}/${finalName}` : finalName;

    if (!isFolder) {
      if (conflictStrategy === 'overwrite' && typeof this.meshNetwork?.assertNotUnderLiveEdit === 'function') {
        if (fs.existsSync(safeJoin(this.vaultPaths.filesDir, targetRel))) {
          this.meshNetwork.assertNotUnderLiveEdit(targetRel, actor);
        }
      }
      const writeRes = await this._atomicWriteFileToVault(blobFile, targetRel);
      await this._upsertAndBroadcastFile(targetRel, {
        sha256: writeRes.sha256,
        size: writeRes.size,
        actorUuid: actor
      });

      if (typeof this.meshNetwork?.emit === 'function') {
        this.meshNetwork.emit('vault:changed', { parentPath: parentRel, paths: [targetRel] });
      }
      return { ok: true, relPath: targetRel };
    }

    // Extract folder zip safely into temp dir, then import into Vault
    const tempExtractDir = path.join(os.tmpdir(), 'wm_imp_' + crypto.randomBytes(3).toString('hex'));
    const imported = [];
    try {
      extractZipSafe(blobFile, tempExtractDir);
      await this._importSingleOsPathRecursive(tempExtractDir, parentRel, finalName, conflictStrategy, actor, imported);
    } finally {
      removeDirSafe(tempExtractDir);
    }

    if (typeof this.meshNetwork?.emit === 'function') {
      this.meshNetwork.emit('vault:changed', { parentPath: parentRel, paths: imported });
    }
    return { ok: true, relPath: targetRel, imported };
  }

  async getFilePreviewData(relPath, actorUuid, unlockedSet) {
    const actor = this._getActorUuid(actorUuid);
    const rel = normalizeRelPath(relPath);
    if (!rel) {
      return { ok: false, code: 'NOT_FOUND', error: 'Invalid path' };
    }

    const acl = this.meshNetwork.computeEffectiveAcl(rel, actor, unlockedSet);
    if (!acl.canRead) {
      return { ok: false, code: 'LOCKED', blockingAncestor: acl.blockingAncestor, effectiveAcl: acl };
    }

    const node = this.db.getVaultNode(rel);
    if (!node || node.is_deleted) {
      return { ok: false, code: 'NOT_FOUND', error: 'Item not found' };
    }

    const sanitizedNode = sanitizeNodeForPublic(node);
    if (node.is_dir) {
      return {
        ok: true,
        kind: 'folder',
        mime: 'inode/directory',
        size: node.size || 0,
        node: sanitizedNode,
        effectiveAcl: acl
      };
    }

    const filePath = safeJoin(this.vaultPaths.filesDir, rel);
    if (!fs.existsSync(filePath)) {
      return { ok: false, code: 'NOT_FOUND', error: 'File missing from disk' };
    }

    const stat = fs.statSync(filePath);
    const mime = node.mime || guessMime(node.name);
    let kind = getPreviewKind(mime, node.name);

    let dataUrl;
    let text;
    let truncated = false;

    if (kind === 'image') {
      if (stat.size <= 15 * 1024 * 1024) {
        dataUrl = `data:${mime};base64,${fs.readFileSync(filePath).toString('base64')}`;
      } else {
        kind = 'unsupported';
      }
    } else if (kind === 'pdf') {
      if (stat.size <= 25 * 1024 * 1024) {
        dataUrl = `data:application/pdf;base64,${fs.readFileSync(filePath).toString('base64')}`;
      } else {
        kind = 'unsupported';
      }
    } else if (kind === 'text') {
      const maxBytes = 512 * 1024;
      if (stat.size <= maxBytes) {
        text = fs.readFileSync(filePath, 'utf8');
      } else {
        const fd = fs.openSync(filePath, 'r');
        try {
          const buf = Buffer.alloc(maxBytes);
          const bytesRead = fs.readSync(fd, buf, 0, maxBytes, 0);
          text = buf.slice(0, bytesRead).toString('utf8');
          truncated = true;
        } finally {
          fs.closeSync(fd);
        }
      }
    } else if (kind === 'audio' || kind === 'video') {
      if (stat.size <= 35 * 1024 * 1024) {
        dataUrl = `data:${mime};base64,${fs.readFileSync(filePath).toString('base64')}`;
      } else {
        kind = 'unsupported';
      }
    }

    return {
      ok: true,
      kind,
      dataUrl,
      text,
      truncated,
      mime,
      size: stat.size,
      node: sanitizedNode,
      effectiveAcl: acl
    };
  }
}

module.exports = {
  SandboxManager,
  guessMime,
  getPreviewKind,
  sanitizeFileName,
  normalizeRelPath,
  safeJoin,
  sanitizeNodeForPublic,
  zipDirectoryFast,
  extractZipSafe
};
