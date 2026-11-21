'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const RECOVERY_KEY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const RECEIPT_RANK = { sent: 1, delivered: 2, read: 3 };

/**
 * Generates a RFC 4122 v4 UUID.
 * @returns {string}
 */
function generateUuid() {
  return crypto.randomUUID();
}

/**
 * Generates a 12-character unambiguous Master Recovery Key formatted XXXX-XXXX-XXXX.
 * Uses 32-char alphabet so 256 % 32 === 0 (zero modulo bias).
 * @returns {string}
 */
function generateMasterRecoveryKey() {
  const bytes = crypto.randomBytes(12);
  let chars = '';
  for (let i = 0; i < 12; i++) {
    chars += RECOVERY_KEY_ALPHABET[bytes[i] & 31];
  }
  return `${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8, 12)}`;
}

/**
 * Normalizes a recovery key by uppercasing and stripping whitespace/dashes.
 * @param {string} key
 * @returns {string}
 */
function normalizeRecoveryKey(key) {
  return String(key || '').toUpperCase().replace(/[\s-]+/g, '');
}

/**
 * Hashes a secret using scrypt with a 16-byte random hex salt (or provided saltHex).
 * @param {string} secret
 * @param {string} [saltHex]
 * @returns {{ hash: string, salt: string }}
 */
function hashSecret(secret, saltHex) {
  const salt = saltHex ? String(saltHex) : crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(secret), salt, 32).toString('hex');
  return { hash, salt };
}

/**
 * Constant-time hex string equality check.
 * @param {string} aHex
 * @param {string} bHex
 * @returns {boolean}
 */
function timingSafeHexEqual(aHex, bHex) {
  if (!aHex || !bHex) return false;
  try {
    const a = Buffer.from(String(aHex), 'hex');
    const b = Buffer.from(String(bHex), 'hex');
    if (a.length === 0 || a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch (_) {
    return false;
  }
}

/**
 * Computes lowercase SHA-256 hex digest of a UTF-8 string.
 * @param {string} value
 * @returns {string}
 */
function sha256Hex(value) {
  return crypto.createHash('sha256').update(String(value ?? ''), 'utf8').digest('hex');
}

/**
 * Hashes a 4-6 digit account PIN using SHA-256.
 * @param {string|number} pin
 * @returns {string}
 */
function hashPin(pin) {
  return sha256Hex(String(pin ?? '').trim());
}

/**
 * Constant-time verification of an account PIN against a SHA-256 hex hash.
 * @param {string|number} pin
 * @param {string} expectedHash
 * @returns {boolean}
 */
function verifyPin(pin, expectedHash) {
  if (pin === null || pin === undefined || !expectedHash) return false;
  return timingSafeHexEqual(hashPin(pin), expectedHash);
}

/**
 * Generates a 6-character recovery code from RECOVERY_KEY_ALPHABET using unbiased bitmasking.
 * @returns {string}
 */
function generateRecoveryCode() {
  const bytes = crypto.randomBytes(6);
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += RECOVERY_KEY_ALPHABET[bytes[i] & 31];
  }
  return code;
}

/**
 * Hashes a 6-character mobile recovery code using SHA-256 after normalization.
 * @param {string} code
 * @returns {string}
 */
function hashRecoveryCode(code) {
  return sha256Hex(normalizeRecoveryKey(code));
}

/**
 * Verifies a 6-character recovery code against its SHA-256 hash.
 * @param {string} code
 * @param {string} expectedHash
 * @returns {boolean}
 */
function verifyRecoveryCode(code, expectedHash) {
  if (!code || !expectedHash) return false;
  return timingSafeHexEqual(hashRecoveryCode(code), expectedHash);
}

/**
 * Hashes a security question answer using SHA-256 after normalization.
 * @param {string} answer
 * @returns {string}
 */
function hashSecurityAnswerSha256(answer) {
  return sha256Hex(String(answer || '').trim().toLowerCase());
}

/**
 * Verifies a security answer using scrypt when saltHex is present (desktop accounts),
 * or SHA-256 when saltHex is absent (standalone mobile accounts).
 * @param {string} answer
 * @param {string} expectedHash
 * @param {string|null} [saltHex]
 * @returns {boolean}
 */
function verifySecurityAnswerFlexible(answer, expectedHash, saltHex) {
  if (answer === null || answer === undefined || !expectedHash) return false;
  const normalized = String(answer).trim().toLowerCase();
  if (saltHex) {
    return verifySecret(normalized, expectedHash, saltHex);
  }
  return timingSafeHexEqual(sha256Hex(normalized), expectedHash);
}

/**
 * Constant-time verification of a secret against a scrypt hash and hex salt.
 * @param {string} secret
 * @param {string} expectedHash
 * @param {string} saltHex
 * @returns {boolean}
 */
function verifySecret(secret, expectedHash, saltHex) {
  if (secret === null || secret === undefined || !expectedHash || !saltHex) {
    return false;
  }
  try {
    const computedHex = crypto.scryptSync(String(secret), String(saltHex), 32).toString('hex');
    const a = Buffer.from(computedHex, 'hex');
    const b = Buffer.from(String(expectedHash), 'hex');
    if (a.length === 0 || a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch (_) {
    return false;
  }
}

/**
 * Normalizes a Vault relative path to POSIX forward slashes with no leading/trailing slash.
 * Rejects traversal (`..`), null bytes, and Windows drive letters.
 * @param {string} relPath
 * @returns {string}
 */
function normalizeRelPath(relPath) {
  if (relPath === null || relPath === undefined || relPath === '') {
    return '';
  }
  const raw = String(relPath);
  if (raw.includes('\0')) {
    throw new Error('Invalid relative path: null byte not allowed');
  }
  if (/^[a-zA-Z]:/.test(raw)) {
    throw new Error('Invalid relative path: drive letter not allowed');
  }
  const posix = raw.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\/+|\/+$/g, '');
  if (!posix || posix === '.') {
    return '';
  }
  const parts = posix.split('/');
  const clean = [];
  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') {
      throw new Error('Invalid relative path: directory traversal not allowed');
    }
    clean.push(part);
  }
  return clean.join('/');
}

/**
 * Returns the normalized POSIX parent relative path ("" for root or top-level child).
 * @param {string} relPath
 * @returns {string}
 */
function getParentRelPath(relPath) {
  const norm = normalizeRelPath(relPath);
  if (!norm) return '';
  const idx = norm.lastIndexOf('/');
  return idx === -1 ? '' : norm.slice(0, idx);
}

/**
 * Returns ancestor paths from the top-level root child down to relPath.
 * Example: "Finance/Q4/Report.xlsx" -> ["Finance", "Finance/Q4", "Finance/Q4/Report.xlsx"]
 * @param {string} relPath
 * @param {boolean} [includeSelf=true]
 * @returns {string[]}
 */
function getAncestorPaths(relPath, includeSelf = true) {
  const norm = normalizeRelPath(relPath);
  if (!norm) return [];
  const parts = norm.split('/');
  const limit = includeSelf ? parts.length : Math.max(0, parts.length - 1);
  const result = [];
  for (let i = 0; i < limit; i++) {
    result.push(parts.slice(0, i + 1).join('/'));
  }
  return result;
}

/**
 * Safely resolves a Vault relative path inside baseDir, throwing if it escapes baseDir.
 * @param {string} baseDir
 * @param {string} relPath
 * @returns {string}
 */
function safeResolvePath(baseDir, relPath) {
  const base = path.resolve(baseDir);
  const norm = normalizeRelPath(relPath);
  if (!norm) return base;
  const resolved = path.resolve(base, ...norm.split('/'));
  const rel = path.relative(base, resolved);
  if (rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) {
    throw new Error(`Path escapes base directory: ${relPath}`);
  }
  return resolved;
}

function isPlainObject(val) {
  if (!val || typeof val !== 'object' || Array.isArray(val)) return false;
  if (Buffer.isBuffer(val) || ArrayBuffer.isView(val)) return false;
  const proto = Object.getPrototypeOf(val);
  return proto === Object.prototype || proto === null;
}

function normalizeSqlValue(val) {
  if (val === undefined) return null;
  if (typeof val === 'boolean') return val ? 1 : 0;
  return val;
}

function normalizeSqlArgs(args) {
  if (args.length === 1 && isPlainObject(args[0])) {
    const src = args[0];
    const out = {};
    for (const key of Object.keys(src)) {
      const v = src[key];
      if (typeof v === 'function' || typeof v === 'symbol') continue;
      out[key] = normalizeSqlValue(v);
    }
    return [out];
  }
  return args.map(normalizeSqlValue);
}

function toPlainRow(row) {
  return row ? { ...row } : undefined;
}

/**
 * Opens an SQLite database using better-sqlite3 when native binding is available,
 * transparently falling back to Node built-in `node:sqlite` (DatabaseSync).
 * @param {string} dbPath
 */
function openSqliteConnection(dbPath) {
  let BetterSqlite3 = null;
  try {
    BetterSqlite3 = require('better-sqlite3');
  } catch (_) {
    BetterSqlite3 = null;
  }

  if (BetterSqlite3) {
    try {
      const nativeDb = new BetterSqlite3(dbPath);
      nativeDb.pragma('journal_mode = WAL');
      let txDepth = 0;
      return {
        driver: 'better-sqlite3',
        pragma(str) {
          return nativeDb.pragma(str);
        },
        exec(sql) {
          return nativeDb.exec(sql);
        },
        prepare(sql) {
          const stmt = nativeDb.prepare(sql);
          return {
            run(...args) {
              return stmt.run(...normalizeSqlArgs(args));
            },
            get(...args) {
              return toPlainRow(stmt.get(...normalizeSqlArgs(args)));
            },
            all(...args) {
              return stmt.all(...normalizeSqlArgs(args)).map((r) => ({ ...r }));
            },
          };
        },
        transaction(fn) {
          return (...args) => {
            const isOuter = txDepth === 0;
            const sp = `sp_${txDepth}`;
            txDepth++;
            if (isOuter) nativeDb.exec('BEGIN IMMEDIATE');
            else nativeDb.exec(`SAVEPOINT ${sp}`);
            try {
              const res = fn(...args);
              if (isOuter) nativeDb.exec('COMMIT');
              else nativeDb.exec(`RELEASE SAVEPOINT ${sp}`);
              txDepth--;
              return res;
            } catch (err) {
              try {
                if (isOuter) nativeDb.exec('ROLLBACK');
                else {
                  nativeDb.exec(`ROLLBACK TO SAVEPOINT ${sp}`);
                  nativeDb.exec(`RELEASE SAVEPOINT ${sp}`);
                }
              } catch (_) {}
              txDepth--;
              throw err;
            }
          };
        },
        close() {
          nativeDb.close();
        },
      };
    } catch (_) {
      // Native .node missing or ABI mismatch -> fallback to built-in node:sqlite
    }
  }

  const { DatabaseSync } = require('node:sqlite');
  const rawDb = new DatabaseSync(dbPath);
  let txDepth = 0;

  return {
    driver: 'node:sqlite',
    pragma(str) {
      const trimmed = String(str).trim();
      if (trimmed.includes('=')) {
        rawDb.exec(`PRAGMA ${trimmed}`);
        return undefined;
      }
      return rawDb.prepare(`PRAGMA ${trimmed}`).all().map((r) => ({ ...r }));
    },
    exec(sql) {
      return rawDb.exec(sql);
    },
    prepare(sql) {
      const stmt = rawDb.prepare(sql);
      if (typeof stmt.setAllowUnknownNamedParameters === 'function') {
        stmt.setAllowUnknownNamedParameters(true);
      }
      if (typeof stmt.setAllowBareNamedParameters === 'function') {
        stmt.setAllowBareNamedParameters(true);
      }
      return {
        run(...args) {
          const res = stmt.run(...normalizeSqlArgs(args));
          return {
            changes: Number(res && res.changes ? res.changes : 0),
            lastInsertRowid: res ? res.lastInsertRowid : undefined,
          };
        },
        get(...args) {
          return toPlainRow(stmt.get(...normalizeSqlArgs(args)));
        },
        all(...args) {
          return stmt.all(...normalizeSqlArgs(args)).map((r) => ({ ...r }));
        },
      };
    },
    transaction(fn) {
      return (...args) => {
        const isOuter = txDepth === 0;
        const sp = `sp_${txDepth}`;
        txDepth++;
        if (isOuter) rawDb.exec('BEGIN IMMEDIATE');
        else rawDb.exec(`SAVEPOINT ${sp}`);
        try {
          const res = fn(...args);
          if (isOuter) rawDb.exec('COMMIT');
          else rawDb.exec(`RELEASE SAVEPOINT ${sp}`);
          txDepth--;
          return res;
        } catch (err) {
          try {
            if (isOuter) rawDb.exec('ROLLBACK');
            else {
              rawDb.exec(`ROLLBACK TO SAVEPOINT ${sp}`);
              rawDb.exec(`RELEASE SAVEPOINT ${sp}`);
            }
          } catch (_) {}
          txDepth--;
          throw err;
        }
      };
    },
    close() {
      rawDb.close();
    },
  };
}

function safeJsonParse(str, fallback) {
  if (str === null || str === undefined || str === '') return fallback;
  if (typeof str !== 'string') return str;
  try {
    return JSON.parse(str);
  } catch (_) {
    return fallback;
  }
}

function normalizeSecurityAnswer(answer) {
  return String(answer || '').trim().toLowerCase();
}

function hydrateVaultNode(row) {
  if (!row) return null;
  return {
    ...row,
    is_dir: Boolean(row.is_dir),
    allowed_editors: safeJsonParse(row.allowed_editors_json, []),
    allowed_viewers: safeJsonParse(row.allowed_viewers_json, []),
  };
}

function hydrateTrashItem(row) {
  if (!row) return null;
  return {
    ...row,
    is_dir: Boolean(row.is_dir),
    effective_acl: safeJsonParse(row.effective_acl_json, { chain: [] }),
    nodes_snapshot: safeJsonParse(row.nodes_snapshot_json, []),
  };
}

class TwinSyncDatabase {
  /**
   * @param {string} dbPath
   */
  constructor(dbPath) {
    if (dbPath && dbPath !== ':memory:') {
      fs.mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });
    }
    this.dbPath = dbPath;
    this.db = openSqliteConnection(dbPath);
    this.driver = this.db.driver;
    this.closed = false;

    try {
      this.db.pragma('journal_mode = WAL');
    } catch (_) {}
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('busy_timeout = 5000');
    try {
      this.db.pragma('synchronous = NORMAL');
    } catch (_) {}

    this._initSchema();
    this._migrateSchema();
    this._lamportClock = this._loadInitialLamportClock();
  }

  _ensureColumn(tableName, colName, colDefSql) {
    const cols = this.db.prepare(`PRAGMA table_info(${tableName})`).all();
    if (!cols.some((c) => c.name === colName)) {
      this.db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${colName} ${colDefSql}`);
    }
  }

  _migrateSchema() {
    this._ensureColumn('local_identity', 'device_type', "TEXT NOT NULL DEFAULT 'desktop'");
    this._ensureColumn('local_identity', 'pin_hash', 'TEXT');

    this._ensureColumn('peers', 'name', "TEXT NOT NULL DEFAULT ''");
    this._ensureColumn('peers', 'avatar', 'TEXT');
    this._ensureColumn('peers', 'device_type', "TEXT NOT NULL DEFAULT 'desktop'");
    this._ensureColumn('peers', 'pin_hash', 'TEXT');
    this._ensureColumn('peers', 'recovery_code_hash', 'TEXT');
    this._ensureColumn('peers', 'gateway_uuid', 'TEXT');

    this._ensureColumn('messages', 'receiver_uuid', 'TEXT');
    this._ensureColumn('messages', 'is_group', 'INTEGER NOT NULL DEFAULT 0');

    // Backfill peers name & avatar fields
    this.db.exec(`
      UPDATE peers SET name = display_name
      WHERE (name IS NULL OR name = '') AND display_name IS NOT NULL AND display_name != '';
      UPDATE peers SET display_name = name
      WHERE (display_name IS NULL OR display_name = '') AND name IS NOT NULL AND name != '';
      UPDATE peers SET avatar = avatar_data
      WHERE avatar IS NULL AND avatar_data IS NOT NULL;
      UPDATE peers SET avatar_data = avatar
      WHERE avatar_data IS NULL AND avatar IS NOT NULL;
    `);

    // Backfill messages is_group & receiver_uuid
    this.db.exec(`
      UPDATE messages SET is_group = 1
      WHERE is_group = 0
        AND (conversation_id IN (SELECT id FROM conversations WHERE type = 'group') OR conversation_id LIKE 'grp:%');
      UPDATE messages
      SET receiver_uuid = (
        SELECT cm.peer_uuid FROM conversation_members cm
        WHERE cm.conversation_id = messages.conversation_id
          AND cm.peer_uuid != messages.sender_uuid
        LIMIT 1
      )
      WHERE receiver_uuid IS NULL AND is_group = 0;
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_messages_privacy ON messages(conversation_id, sender_uuid, receiver_uuid, is_group);
    `);
  }

  _initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS local_identity (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        uuid TEXT NOT NULL UNIQUE,
        display_name TEXT NOT NULL DEFAULT '',
        avatar_data TEXT,
        onboarded INTEGER NOT NULL DEFAULT 0,
        master_recovery_key TEXT,
        recovery_key_hash TEXT,
        recovery_key_salt TEXT,
        security_question TEXT,
        security_answer_hash TEXT,
        security_answer_salt TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS peers (
        uuid TEXT PRIMARY KEY,
        display_name TEXT NOT NULL DEFAULT '',
        avatar_data TEXT,
        ip TEXT,
        ws_port INTEGER,
        status TEXT NOT NULL DEFAULT 'offline',
        last_seen INTEGER NOT NULL DEFAULT 0,
        recovery_key_hash TEXT,
        recovery_key_salt TEXT,
        security_question TEXT,
        security_answer_hash TEXT,
        security_answer_salt TEXT,
        updated_at INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL CHECK (type IN ('dm', 'group')),
        name TEXT,
        avatar_data TEXT,
        creator_uuid TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS conversation_members (
        conversation_id TEXT NOT NULL,
        peer_uuid TEXT NOT NULL,
        joined_at INTEGER NOT NULL,
        PRIMARY KEY (conversation_id, peer_uuid)
      );

      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        sender_uuid TEXT NOT NULL,
        sender_name TEXT,
        type TEXT NOT NULL DEFAULT 'text',
        body TEXT NOT NULL DEFAULT '',
        reply_to_id TEXT,
        forwarded_from_id TEXT,
        attachment_json TEXT,
        vault_link_path TEXT,
        vault_link_is_dir INTEGER NOT NULL DEFAULT 0,
        lamport_ts INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        edited_at INTEGER,
        deleted_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_messages_conv_ts ON messages(conversation_id, created_at, lamport_ts);
      CREATE INDEX IF NOT EXISTS idx_messages_lamport ON messages(lamport_ts);

      CREATE TABLE IF NOT EXISTS message_receipts (
        message_id TEXT NOT NULL,
        peer_uuid TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('sent', 'delivered', 'read')),
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (message_id, peer_uuid)
      );

      CREATE TABLE IF NOT EXISTS message_reactions (
        message_id TEXT NOT NULL,
        peer_uuid TEXT NOT NULL,
        emoji TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (message_id, peer_uuid, emoji)
      );

      CREATE TABLE IF NOT EXISTS vault_nodes (
        rel_path TEXT PRIMARY KEY,
        parent_path TEXT NOT NULL DEFAULT '',
        name TEXT NOT NULL,
        is_dir INTEGER NOT NULL DEFAULT 0,
        size INTEGER NOT NULL DEFAULT 0,
        mime TEXT,
        sha256 TEXT,
        owner_uuid TEXT NOT NULL DEFAULT '',
        owner_name TEXT,
        perm_mode TEXT NOT NULL DEFAULT 'public',
        password_hash TEXT,
        password_salt TEXT,
        allowed_editors_json TEXT NOT NULL DEFAULT '[]',
        allowed_viewers_json TEXT NOT NULL DEFAULT '[]',
        acl_version INTEGER NOT NULL DEFAULT 1,
        version INTEGER NOT NULL DEFAULT 1,
        lamport_ts INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_vault_parent ON vault_nodes(parent_path);

      CREATE TABLE IF NOT EXISTS trash_items (
        id TEXT PRIMARY KEY,
        original_rel_path TEXT NOT NULL,
        name TEXT NOT NULL,
        is_dir INTEGER NOT NULL DEFAULT 0,
        size INTEGER NOT NULL DEFAULT 0,
        owner_uuid TEXT NOT NULL,
        owner_name TEXT,
        deleted_by_uuid TEXT NOT NULL,
        deleted_by_name TEXT,
        effective_acl_json TEXT NOT NULL DEFAULT '{"chain":[]}',
        nodes_snapshot_json TEXT NOT NULL DEFAULT '[]',
        deleted_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS audit_log (
        id TEXT PRIMARY KEY,
        event_type TEXT NOT NULL,
        actor_uuid TEXT,
        actor_name TEXT,
        target_path TEXT,
        target_id TEXT,
        details TEXT,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_audit_target ON audit_log(target_path, created_at);
      CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at INTEGER NOT NULL
      );
    `);
  }

  _loadInitialLamportClock() {
    const saved = Number(this.getSetting('lamport_clock', 0)) || 0;
    const m = this.db.prepare('SELECT COALESCE(MAX(lamport_ts), 0) AS mx FROM messages').get();
    const v = this.db.prepare('SELECT COALESCE(MAX(lamport_ts), 0) AS mx FROM vault_nodes').get();
    return Math.max(saved, Number(m?.mx || 0), Number(v?.mx || 0));
  }

  // =========================================================================
  // Identity & Settings
  // =========================================================================

  getIdentity() {
    const row = this.db.prepare('SELECT * FROM local_identity WHERE id = 1').get();
    if (!row) return null;
    return {
      ...row,
      name: row.display_name || '',
      avatar: row.avatar_data ?? null,
      device_type: row.device_type || 'desktop',
      has_pin: Boolean(row.pin_hash),
      onboarded: Boolean(row.onboarded),
      onboarding_done: Boolean(row.onboarded),
    };
  }

  ensureIdentity() {
    const existing = this.getIdentity();
    if (existing) {
      if (!this.getPeer(existing.uuid)) {
        this._syncSelfToPeers(existing);
      }
      return existing;
    }

    const now = Date.now();
    const uuid = generateUuid();
    const masterKey = generateMasterRecoveryKey();
    const { hash: recoveryKeyHash, salt: recoveryKeySalt } = hashSecret(
      normalizeRecoveryKey(masterKey)
    );

    this.db.prepare(`
      INSERT INTO local_identity (
        id, uuid, display_name, avatar_data, device_type, onboarded,
        master_recovery_key, recovery_key_hash, recovery_key_salt,
        created_at, updated_at
      ) VALUES (1, @uuid, '', NULL, 'desktop', 0, @masterKey, @recoveryKeyHash, @recoveryKeySalt, @now, @now)
    `).run({ uuid, masterKey, recoveryKeyHash, recoveryKeySalt, now });

    const created = this.getIdentity();
    this._syncSelfToPeers(created);
    return created;
  }

  _syncSelfToPeers(identity) {
    if (!identity) return;
    this.upsertPeer({
      uuid: identity.uuid,
      display_name: identity.display_name || '',
      name: identity.display_name || '',
      avatar_data: identity.avatar_data ?? null,
      avatar: identity.avatar_data ?? null,
      device_type: 'desktop',
      pin_hash: identity.pin_hash ?? null,
      status: 'online',
      last_seen: Date.now(),
      recovery_key_hash: identity.recovery_key_hash ?? null,
      recovery_key_salt: identity.recovery_key_salt ?? null,
      security_question: identity.security_question ?? null,
      security_answer_hash: identity.security_answer_hash ?? null,
      security_answer_salt: identity.security_answer_salt ?? null,
      updated_at: identity.updated_at || Date.now(),
    });
  }

  completeOnboarding({ displayName, avatarData = null, securityQuestion, securityAnswer }) {
    const current = this.ensureIdentity();
    const now = Math.max(Date.now(), (current.updated_at || 0) + 1);
    const cleanName = String(displayName || '').trim();
    const cleanQuestion = String(securityQuestion || '').trim();
    const { hash: secHash, salt: secSalt } = hashSecret(normalizeSecurityAnswer(securityAnswer));

    this.db.prepare(`
      UPDATE local_identity SET
        display_name = @displayName,
        avatar_data = @avatarData,
        onboarded = 1,
        security_question = @securityQuestion,
        security_answer_hash = @secHash,
        security_answer_salt = @secSalt,
        updated_at = @now
      WHERE id = 1
    `).run({
      displayName: cleanName || current.display_name || 'User',
      avatarData: avatarData !== undefined ? avatarData : current.avatar_data,
      securityQuestion: cleanQuestion,
      secHash,
      secSalt,
      now,
    });

    const updated = this.getIdentity();
    this._syncSelfToPeers(updated);
    return updated;
  }

  updateProfile({ displayName, avatarData }) {
    const current = this.ensureIdentity();
    const now = Math.max(Date.now(), (current.updated_at || 0) + 1);
    const nextName = displayName !== undefined ? String(displayName).trim() : current.display_name;
    const nextAvatar = avatarData !== undefined ? avatarData : current.avatar_data;

    this.db.prepare(`
      UPDATE local_identity SET
        display_name = @nextName,
        avatar_data = @nextAvatar,
        updated_at = @now
      WHERE id = 1
    `).run({ nextName, nextAvatar, now });

    const updated = this.getIdentity();
    this._syncSelfToPeers(updated);
    return updated;
  }

  updateSecurityQA({ securityQuestion, securityAnswer }) {
    const current = this.ensureIdentity();
    const now = Math.max(Date.now(), (current.updated_at || 0) + 1);
    const nextQuestion =
      securityQuestion !== undefined ? String(securityQuestion).trim() : current.security_question;

    let secHash = current.security_answer_hash;
    let secSalt = current.security_answer_salt;
    if (securityAnswer !== undefined && String(securityAnswer).trim() !== '') {
      const hashed = hashSecret(normalizeSecurityAnswer(securityAnswer));
      secHash = hashed.hash;
      secSalt = hashed.salt;
    }

    this.db.prepare(`
      UPDATE local_identity SET
        security_question = @nextQuestion,
        security_answer_hash = @secHash,
        security_answer_salt = @secSalt,
        updated_at = @now
      WHERE id = 1
    `).run({ nextQuestion, secHash, secSalt, now });

    const updated = this.getIdentity();
    this._syncSelfToPeers(updated);
    return updated;
  }

  updateLocalPin(pin) {
    const cleanPin = String(pin ?? '').trim();
    if (!/^\d{4,6}$/.test(cleanPin)) {
      throw new Error('PIN must be 4 to 6 numeric digits');
    }
    const current = this.ensureIdentity();
    const now = Math.max(Date.now(), (current.updated_at || 0) + 1);
    const pinHash = hashPin(cleanPin);

    this.db.prepare(`
      UPDATE local_identity SET
        pin_hash = ?,
        updated_at = ?
      WHERE id = 1
    `).run(pinHash, now);

    const updated = this.getIdentity();
    this._syncSelfToPeers(updated);
    return updated;
  }

  getSetting(key, defaultVal = null) {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(String(key));
    if (!row) return defaultVal;
    return safeJsonParse(row.value, defaultVal);
  }

  setSetting(key, value) {
    const now = Date.now();
    const serialized = JSON.stringify(value === undefined ? null : value);
    this.db.prepare(`
      INSERT INTO settings (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run(String(key), serialized, now);
    return value;
  }

  getAllSettings() {
    const rows = this.db.prepare('SELECT key, value FROM settings').all();
    const result = {};
    for (const row of rows) {
      result[row.key] = safeJsonParse(row.value, null);
    }
    return result;
  }

  // =========================================================================
  // Peers
  // =========================================================================

  upsertPeer(peer) {
    if (!peer || !peer.uuid) throw new Error('Peer uuid is required');
    const now = Date.now();
    const resolvedDisplayName = peer.display_name ?? peer.displayName ?? peer.name ?? '';
    const resolvedName = peer.name ?? peer.display_name ?? peer.displayName ?? '';
    const hasAvatar =
      peer.avatar_data !== undefined || peer.avatarData !== undefined || peer.avatar !== undefined;
    const resolvedAvatar =
      peer.avatar_data !== undefined
        ? peer.avatar_data
        : (peer.avatarData !== undefined ? peer.avatarData : (peer.avatar ?? null));
    const explicitDeviceType = peer.device_type ?? peer.deviceType;
    const hasPinHash = peer.pin_hash !== undefined || peer.pinHash !== undefined;
    const resolvedPinHash = peer.pin_hash !== undefined ? peer.pin_hash : (peer.pinHash ?? null);
    const hasRecoveryCodeHash =
      peer.recovery_code_hash !== undefined || peer.recoveryCodeHash !== undefined;
    const resolvedRecoveryCodeHash =
      peer.recovery_code_hash !== undefined ? peer.recovery_code_hash : (peer.recoveryCodeHash ?? null);
    const hasGatewayUuid = peer.gateway_uuid !== undefined || peer.gatewayUuid !== undefined;
    const resolvedGatewayUuid =
      peer.gateway_uuid !== undefined ? peer.gateway_uuid : (peer.gatewayUuid ?? null);

    const payload = {
      uuid: String(peer.uuid),
      display_name: resolvedDisplayName,
      name: resolvedName,
      avatar_data: resolvedAvatar,
      avatar: resolvedAvatar,
      device_type: explicitDeviceType || 'desktop',
      pin_hash: resolvedPinHash,
      recovery_code_hash: resolvedRecoveryCodeHash,
      gateway_uuid: resolvedGatewayUuid,
      ip: peer.ip ?? null,
      ws_port: peer.ws_port ?? peer.wsPort ?? null,
      status: peer.status ?? 'offline',
      last_seen: peer.last_seen ?? peer.lastSeen ?? now,
      recovery_key_hash: peer.recovery_key_hash ?? peer.recoveryKeyHash ?? null,
      recovery_key_salt: peer.recovery_key_salt ?? peer.recoveryKeySalt ?? null,
      security_question: peer.security_question ?? peer.securityQuestion ?? null,
      security_answer_hash: peer.security_answer_hash ?? peer.securityAnswerHash ?? null,
      security_answer_salt: peer.security_answer_salt ?? peer.securityAnswerSalt ?? null,
      updated_at: peer.updated_at ?? peer.updatedAt ?? now,
    };

    const existing = this.getPeer(payload.uuid);
    if (!existing) {
      this.db.prepare(`
        INSERT INTO peers (
          uuid, display_name, name, avatar_data, avatar, device_type,
          pin_hash, recovery_code_hash, gateway_uuid,
          ip, ws_port, status, last_seen,
          recovery_key_hash, recovery_key_salt, security_question,
          security_answer_hash, security_answer_salt, updated_at
        ) VALUES (
          @uuid, @display_name, @name, @avatar_data, @avatar, @device_type,
          @pin_hash, @recovery_code_hash, @gateway_uuid,
          @ip, @ws_port, @status, @last_seen,
          @recovery_key_hash, @recovery_key_salt, @security_question,
          @security_answer_hash, @security_answer_salt, @updated_at
        )
      `).run(payload);
    } else {
      const acceptProfile = payload.updated_at >= (existing.updated_at || 0);
      const nextDisplayName =
        acceptProfile && payload.display_name ? payload.display_name : (existing.display_name || '');
      const nextName =
        acceptProfile && payload.name
          ? payload.name
          : (existing.name || nextDisplayName || '');
      const nextAvatar = acceptProfile && hasAvatar ? resolvedAvatar : existing.avatar_data;
      const nextDeviceType =
        explicitDeviceType !== undefined
          ? explicitDeviceType
          : (existing.device_type || 'desktop');

      this.db.prepare(`
        UPDATE peers SET
          display_name = @display_name,
          name = @name,
          avatar_data = @avatar_data,
          avatar = @avatar,
          device_type = @device_type,
          pin_hash = @pin_hash,
          recovery_code_hash = @recovery_code_hash,
          gateway_uuid = @gateway_uuid,
          ip = @ip,
          ws_port = @ws_port,
          status = @status,
          last_seen = @last_seen,
          recovery_key_hash = @recovery_key_hash,
          recovery_key_salt = @recovery_key_salt,
          security_question = @security_question,
          security_answer_hash = @security_answer_hash,
          security_answer_salt = @security_answer_salt,
          updated_at = @updated_at
        WHERE uuid = @uuid
      `).run({
        uuid: payload.uuid,
        display_name: nextDisplayName,
        name: nextName,
        avatar_data: nextAvatar,
        avatar: nextAvatar,
        device_type: nextDeviceType,
        pin_hash:
          acceptProfile && hasPinHash
            ? (resolvedPinHash ?? existing.pin_hash)
            : existing.pin_hash,
        recovery_code_hash:
          acceptProfile && hasRecoveryCodeHash
            ? (resolvedRecoveryCodeHash ?? existing.recovery_code_hash)
            : existing.recovery_code_hash,
        gateway_uuid:
          acceptProfile && hasGatewayUuid
            ? resolvedGatewayUuid
            : existing.gateway_uuid,
        ip: payload.ip ?? existing.ip,
        ws_port: payload.ws_port ?? existing.ws_port,
        status: peer.status ?? existing.status,
        last_seen: Math.max(existing.last_seen || 0, payload.last_seen || 0),
        recovery_key_hash:
          acceptProfile && payload.recovery_key_hash
            ? payload.recovery_key_hash
            : existing.recovery_key_hash,
        recovery_key_salt:
          acceptProfile && payload.recovery_key_salt
            ? payload.recovery_key_salt
            : existing.recovery_key_salt,
        security_question:
          acceptProfile && payload.security_question
            ? payload.security_question
            : existing.security_question,
        security_answer_hash:
          acceptProfile && payload.security_answer_hash
            ? payload.security_answer_hash
            : existing.security_answer_hash,
        security_answer_salt:
          acceptProfile && payload.security_answer_salt
            ? payload.security_answer_salt
            : existing.security_answer_salt,
        updated_at: Math.max(existing.updated_at || 0, payload.updated_at || 0),
      });
    }

    return this.getPeer(payload.uuid);
  }

  createStandalonePeer({
    uuid,
    name,
    displayName,
    avatar = null,
    avatarData,
    pin,
    pinHash,
    securityQuestion,
    securityAnswer,
    securityAnswerHash,
    recoveryCode,
    recoveryCodeHash,
    gatewayUuid = null,
  }) {
    const cleanName = String(name ?? displayName ?? '').trim();
    if (!cleanName) throw new Error('Display name is required');

    let finalPinHash = pinHash || null;
    if (pin !== undefined) {
      const cleanPin = String(pin).trim();
      if (!/^\d{4,6}$/.test(cleanPin)) {
        throw new Error('PIN must be 4 to 6 numeric digits');
      }
      finalPinHash = hashPin(cleanPin);
    }
    if (!finalPinHash) throw new Error('PIN is required');

    const finalAvatar = avatar !== undefined ? avatar : (avatarData ?? null);
    const cleanQuestion = String(securityQuestion ?? '').trim();
    const finalAnswerHash =
      securityAnswerHash || (securityAnswer !== undefined ? hashSecurityAnswerSha256(securityAnswer) : null);
    const finalRecoveryCodeHash =
      recoveryCodeHash || (recoveryCode ? hashRecoveryCode(recoveryCode) : hashRecoveryCode(generateRecoveryCode()));

    const now = Date.now();
    return this.upsertPeer({
      uuid: uuid || generateUuid(),
      display_name: cleanName,
      name: cleanName,
      avatar_data: finalAvatar,
      avatar: finalAvatar,
      device_type: 'mobile',
      pin_hash: finalPinHash,
      recovery_code_hash: finalRecoveryCodeHash,
      security_question: cleanQuestion || null,
      security_answer_hash: finalAnswerHash,
      security_answer_salt: null,
      gateway_uuid: gatewayUuid,
      status: 'online',
      last_seen: now,
      updated_at: now,
    });
  }

  updatePeerPin(uuid, pinHash) {
    const existing = this.getPeer(uuid);
    if (!existing) return null;
    const nextUpdatedAt = Math.max(Date.now(), (existing.updated_at || 0) + 1);
    this.db.prepare(`
      UPDATE peers SET pin_hash = ?, updated_at = ? WHERE uuid = ?
    `).run(pinHash, nextUpdatedAt, uuid);
    return this.getPeer(uuid);
  }

  setPeerStatus(uuid, status, lastSeen = Date.now()) {
    this.db.prepare(`
      UPDATE peers SET status = ?, last_seen = MAX(last_seen, ?) WHERE uuid = ?
    `).run(status, lastSeen, uuid);
    return this.getPeer(uuid);
  }

  getPeers({ includeSelf = false } = {}) {
    const identity = this.getIdentity();
    if (!includeSelf && identity) {
      return this.db.prepare(`
        SELECT * FROM peers
        WHERE uuid != ?
        ORDER BY CASE WHEN status = 'online' THEN 0 ELSE 1 END, display_name COLLATE NOCASE ASC
      `).all(identity.uuid);
    }
    return this.db.prepare(`
      SELECT * FROM peers
      ORDER BY CASE WHEN status = 'online' THEN 0 ELSE 1 END, display_name COLLATE NOCASE ASC
    `).all();
  }

  getPeersUpdatedSince(ts = 0) {
    return this.db.prepare(
      'SELECT * FROM peers WHERE updated_at > ? ORDER BY updated_at ASC'
    ).all(Number(ts) || 0);
  }

  getAllAccounts() {
    const identity = this.getIdentity();
    const rows = this.db.prepare(`
      SELECT * FROM peers
      WHERE (display_name != '' OR name != '' OR pin_hash IS NOT NULL)
      ORDER BY CASE WHEN status = 'online' THEN 0 ELSE 1 END,
               CASE WHEN device_type = 'desktop' THEN 0 ELSE 1 END,
               display_name COLLATE NOCASE ASC
    `).all();

    const accounts = [];
    let selfIncluded = false;
    for (const row of rows) {
      const isSelf = Boolean(identity && row.uuid === identity.uuid);
      if (isSelf) selfIncluded = true;
      const deviceType = isSelf ? 'desktop' : (row.device_type || 'desktop');
      const displayName = isSelf
        ? (identity.display_name || row.display_name || '')
        : (row.display_name || row.name || '');
      const avatarData = isSelf
        ? (identity.avatar_data ?? row.avatar_data ?? null)
        : (row.avatar_data ?? row.avatar ?? null);

      accounts.push({
        uuid: row.uuid,
        display_name: displayName,
        name: row.name || displayName,
        avatar_data: avatarData,
        avatar: avatarData,
        device_type: deviceType,
        status: isSelf ? 'online' : (row.status || 'offline'),
        has_pin: Boolean(isSelf ? identity.pin_hash : row.pin_hash),
        security_question: deviceType === 'mobile' ? (row.security_question || '') : '',
        last_seen: isSelf ? Date.now() : (row.last_seen || 0),
        gateway_uuid: row.gateway_uuid ?? null,
      });
    }

    if (identity && !selfIncluded && (identity.display_name || identity.pin_hash)) {
      accounts.unshift({
        uuid: identity.uuid,
        display_name: identity.display_name || '',
        name: identity.display_name || '',
        avatar_data: identity.avatar_data ?? null,
        avatar: identity.avatar_data ?? null,
        device_type: 'desktop',
        status: 'online',
        has_pin: Boolean(identity.pin_hash),
        security_question: '',
        last_seen: Date.now(),
        gateway_uuid: null,
      });
    }

    return accounts;
  }

  getPeer(uuid) {
    return this.db.prepare('SELECT * FROM peers WHERE uuid = ?').get(uuid) || null;
  }

  // =========================================================================
  // Lamport Clock
  // =========================================================================

  nextLamportTs(remoteTs = 0) {
    const remote = Number(remoteTs) || 0;
    this._lamportClock = Math.max(this._lamportClock, remote) + 1;
    this.setSetting('lamport_clock', this._lamportClock);
    return this._lamportClock;
  }

  // =========================================================================
  // Conversations
  // =========================================================================

  ensureDmConversation(myUuid, peerUuid) {
    if (!myUuid || !peerUuid) throw new Error('Both myUuid and peerUuid are required');
    const [a, b] = [String(myUuid), String(peerUuid)].sort();
    const id = `dm:${a}:${b}`;
    const existing = this.getConversation(id);
    if (existing) return existing;

    const now = Date.now();
    const tx = this.db.transaction(() => {
      this.db.prepare(`
        INSERT OR IGNORE INTO conversations (id, type, name, avatar_data, creator_uuid, created_at, updated_at)
        VALUES (?, 'dm', NULL, NULL, ?, ?, ?)
      `).run(id, myUuid, now, now);

      const insertMember = this.db.prepare(`
        INSERT OR IGNORE INTO conversation_members (conversation_id, peer_uuid, joined_at)
        VALUES (?, ?, ?)
      `);
      insertMember.run(id, myUuid, now);
      insertMember.run(id, peerUuid, now);
    });
    tx();
    return this.getConversation(id);
  }

  createGroup({ id, name, creatorUuid, memberUuids = [], avatarData = null }) {
    const convId = id || `grp:${generateUuid()}`;
    const now = Date.now();
    const uniqueMembers = Array.from(
      new Set([creatorUuid, ...(memberUuids || [])].filter(Boolean).map(String))
    );

    const tx = this.db.transaction(() => {
      this.db.prepare(`
        INSERT INTO conversations (id, type, name, avatar_data, creator_uuid, created_at, updated_at)
        VALUES (?, 'group', ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          avatar_data = COALESCE(excluded.avatar_data, conversations.avatar_data),
          updated_at = MAX(conversations.updated_at, excluded.updated_at)
      `).run(convId, String(name || 'Group'), avatarData, creatorUuid || null, now, now);

      const insertMember = this.db.prepare(`
        INSERT OR IGNORE INTO conversation_members (conversation_id, peer_uuid, joined_at)
        VALUES (?, ?, ?)
      `);
      for (const m of uniqueMembers) {
        insertMember.run(convId, m, now);
      }
    });
    tx();
    return this.getConversation(convId);
  }

  upsertConversation(conv, members = []) {
    if (!conv || !conv.id) throw new Error('Conversation id is required');
    const now = Date.now();
    const tx = this.db.transaction(() => {
      this.db.prepare(`
        INSERT INTO conversations (id, type, name, avatar_data, creator_uuid, created_at, updated_at)
        VALUES (@id, @type, @name, @avatar_data, @creator_uuid, @created_at, @updated_at)
        ON CONFLICT(id) DO UPDATE SET
          name = COALESCE(excluded.name, conversations.name),
          avatar_data = COALESCE(excluded.avatar_data, conversations.avatar_data),
          updated_at = MAX(conversations.updated_at, excluded.updated_at)
      `).run({
        id: conv.id,
        type: conv.type || (String(conv.id).startsWith('dm:') ? 'dm' : 'group'),
        name: conv.name ?? null,
        avatar_data: conv.avatar_data ?? conv.avatarData ?? null,
        creator_uuid: conv.creator_uuid ?? conv.creatorUuid ?? null,
        created_at: conv.created_at ?? conv.createdAt ?? now,
        updated_at: conv.updated_at ?? conv.updatedAt ?? now,
      });

      const insertMember = this.db.prepare(`
        INSERT OR IGNORE INTO conversation_members (conversation_id, peer_uuid, joined_at)
        VALUES (?, ?, ?)
      `);
      for (const m of members || []) {
        const peerUuid = typeof m === 'string' ? m : (m.peer_uuid || m.uuid);
        if (peerUuid) {
          insertMember.run(conv.id, peerUuid, (typeof m === 'object' && m.joined_at) || now);
        }
      }
    });
    tx();
    return this.getConversation(conv.id);
  }

  isConversationMember(conversationId, actorUuid) {
    if (!conversationId || !actorUuid) return false;
    const row = this.db.prepare(
      'SELECT 1 FROM conversation_members WHERE conversation_id = ? AND peer_uuid = ?'
    ).get(String(conversationId), String(actorUuid));
    return Boolean(row);
  }

  getAllConversationsWithMembers() {
    const convs = this.db.prepare('SELECT * FROM conversations ORDER BY updated_at DESC').all();
    return convs.map((c) => {
      const memberRows = this.db.prepare(
        'SELECT peer_uuid FROM conversation_members WHERE conversation_id = ? ORDER BY joined_at ASC'
      ).all(c.id);
      return {
        ...c,
        members: memberRows.map((m) => m.peer_uuid),
      };
    });
  }

  _getHydratedMembers(conversationId) {
    const memberRows = this.db.prepare(`
      SELECT cm.peer_uuid, cm.joined_at, p.display_name, p.name, p.avatar_data, p.avatar,
             p.device_type, p.status, p.last_seen, p.ip, p.gateway_uuid
      FROM conversation_members cm
      LEFT JOIN peers p ON p.uuid = cm.peer_uuid
      WHERE cm.conversation_id = ?
      ORDER BY cm.joined_at ASC
    `).all(conversationId);

    const identity = this.getIdentity();
    return memberRows.map((row) => {
      if (identity && row.peer_uuid === identity.uuid) {
        const dName = row.display_name || identity.display_name || 'Me';
        const av = row.avatar_data ?? identity.avatar_data ?? null;
        return {
          uuid: identity.uuid,
          peer_uuid: identity.uuid,
          display_name: dName,
          name: row.name || dName,
          avatar_data: av,
          avatar: av,
          device_type: identity.device_type || 'desktop',
          status: 'online',
          last_seen: Date.now(),
          joined_at: row.joined_at,
        };
      }
      const dName = row.display_name || row.name || 'Peer';
      const av = row.avatar_data ?? row.avatar ?? null;
      return {
        uuid: row.peer_uuid,
        peer_uuid: row.peer_uuid,
        display_name: dName,
        name: row.name || dName,
        avatar_data: av,
        avatar: av,
        device_type: row.device_type || 'desktop',
        gateway_uuid: row.gateway_uuid ?? null,
        status: row.status || 'offline',
        last_seen: row.last_seen || 0,
        ip: row.ip ?? null,
        joined_at: row.joined_at,
      };
    });
  }

  getConversation(id) {
    const conv = this.db.prepare('SELECT * FROM conversations WHERE id = ?').get(id);
    if (!conv) return null;
    const members = this._getHydratedMembers(id);
    return { ...conv, members };
  }

  getConversations(myUuid) {
    const convs = myUuid
      ? this.db.prepare(`
          SELECT DISTINCT c.* FROM conversations c
          JOIN conversation_members cm ON cm.conversation_id = c.id
          WHERE cm.peer_uuid = ?
          ORDER BY c.updated_at DESC
        `).all(myUuid)
      : this.db.prepare('SELECT * FROM conversations ORDER BY updated_at DESC').all();

    const results = convs.map((conv) => {
      const members = this._getHydratedMembers(conv.id);
      let peer = null;
      if (conv.type === 'dm') {
        peer = members.find((m) => m.uuid !== myUuid) || members[0] || null;
      }

      const lastMsgRow = this.db.prepare(`
        SELECT * FROM messages
        WHERE conversation_id = ?
        ORDER BY created_at DESC, lamport_ts DESC
        LIMIT 1
      `).get(conv.id);

      const lastMessage = lastMsgRow ? this._hydrateMessages([lastMsgRow])[0] : null;

      let unreadCount = 0;
      if (myUuid) {
        const unreadRow = this.db.prepare(`
          SELECT COUNT(*) AS cnt FROM messages m
          WHERE m.conversation_id = ?
            AND m.sender_uuid != ?
            AND m.deleted_at IS NULL
            AND NOT EXISTS (
              SELECT 1 FROM message_receipts r
              WHERE r.message_id = m.id AND r.peer_uuid = ? AND r.status = 'read'
            )
        `).get(conv.id, myUuid, myUuid);
        unreadCount = Number(unreadRow?.cnt || 0);
      }

      const displayName =
        conv.type === 'group'
          ? conv.name
          : (conv.name || (peer ? peer.display_name : 'Direct Chat'));

      const sortTs = Math.max(conv.updated_at || 0, lastMessage ? lastMessage.created_at : 0);

      return {
        id: conv.id,
        type: conv.type,
        name: displayName,
        avatar_data: conv.type === 'group' ? conv.avatar_data : (peer ? peer.avatar_data : conv.avatar_data),
        creator_uuid: conv.creator_uuid,
        members,
        peer,
        lastMessage,
        unreadCount,
        updated_at: sortTs,
      };
    });

    results.sort((a, b) => (b.updated_at || 0) - (a.updated_at || 0));
    return results;
  }

  // =========================================================================
  // Messages, Receipts & Reactions
  // =========================================================================

  _hydrateMessages(rows) {
    if (!rows || rows.length === 0) return [];
    const ids = rows.map((r) => r.id);
    const placeholders = ids.map(() => '?').join(',');

    const receiptsRows = this.db.prepare(
      `SELECT * FROM message_receipts WHERE message_id IN (${placeholders})`
    ).all(...ids);

    const reactionsRows = this.db.prepare(
      `SELECT * FROM message_reactions WHERE message_id IN (${placeholders}) ORDER BY created_at ASC`
    ).all(...ids);

    const replyIds = Array.from(new Set(rows.map((r) => r.reply_to_id).filter(Boolean)));
    const replyMap = new Map();
    if (replyIds.length > 0) {
      const rPlace = replyIds.map(() => '?').join(',');
      const replyRows = this.db.prepare(
        `SELECT id, conversation_id, sender_uuid, sender_name, type, body, attachment_json, vault_link_path, vault_link_is_dir, deleted_at FROM messages WHERE id IN (${rPlace})`
      ).all(...replyIds);
      for (const rr of replyRows) {
        replyMap.set(rr.id, {
          ...rr,
          vault_link_is_dir: Boolean(rr.vault_link_is_dir),
          attachment: safeJsonParse(rr.attachment_json, null),
        });
      }
    }

    const receiptMap = new Map();
    for (const r of receiptsRows) {
      if (!receiptMap.has(r.message_id)) receiptMap.set(r.message_id, []);
      receiptMap.get(r.message_id).push(r);
    }

    const reactionMap = new Map();
    for (const rx of reactionsRows) {
      if (!reactionMap.has(rx.message_id)) reactionMap.set(rx.message_id, []);
      reactionMap.get(rx.message_id).push(rx);
    }

    return rows.map((row) => {
      const receipts = receiptMap.get(row.id) || [];
      let bestRank = 0;
      let receiptStatus = 'sent';
      for (const rec of receipts) {
        if (rec.peer_uuid !== row.sender_uuid) {
          const rank = RECEIPT_RANK[rec.status] || 0;
          if (rank > bestRank) {
            bestRank = rank;
            receiptStatus = rec.status;
          }
        }
      }
      return {
        ...row,
        vault_link_is_dir: Boolean(row.vault_link_is_dir),
        attachment: safeJsonParse(row.attachment_json, null),
        replyTo: row.reply_to_id ? (replyMap.get(row.reply_to_id) || null) : null,
        receipts,
        receiptStatus,
        reactions: reactionMap.get(row.id) || [],
      };
    });
  }

  saveMessage(msg) {
    if (!msg || !msg.id) throw new Error('Message id is required');
    const now = Date.now();
    const convId = msg.conversation_id ?? msg.conversationId;
    const senderUuid = msg.sender_uuid ?? msg.senderUuid;
    const senderName = msg.sender_name ?? msg.senderName ?? '';
    const lamportTs = msg.lamport_ts ?? msg.lamportTs ?? this.nextLamportTs();
    const createdAt = msg.created_at ?? msg.createdAt ?? now;
    const attachmentObj = msg.attachment ?? null;
    const attachmentJson =
      msg.attachment_json !== undefined
        ? (typeof msg.attachment_json === 'string' || msg.attachment_json === null
            ? msg.attachment_json
            : JSON.stringify(msg.attachment_json))
        : (attachmentObj ? JSON.stringify(attachmentObj) : null);

    const convRow = this.db.prepare('SELECT id, type FROM conversations WHERE id = ?').get(convId);
    const isGroup =
      msg.is_group !== undefined
        ? (msg.is_group ? 1 : 0)
        : (convRow ? (convRow.type === 'group' ? 1 : 0) : (String(convId || '').startsWith('grp:') ? 1 : 0));

    let receiverUuid = msg.receiver_uuid ?? msg.receiverUuid ?? null;
    if (!isGroup && !receiverUuid && convId) {
      const otherMember = this.db.prepare(
        'SELECT peer_uuid FROM conversation_members WHERE conversation_id = ? AND peer_uuid != ? LIMIT 1'
      ).get(convId, senderUuid);
      if (otherMember) {
        receiverUuid = otherMember.peer_uuid;
      } else if (String(convId).startsWith('dm:')) {
        const parts = String(convId).split(':');
        if (parts.length === 3) {
          receiverUuid = parts[1] === senderUuid ? parts[2] : parts[1];
        }
      }
    }
    if (isGroup) receiverUuid = null;

    const existing = this.db.prepare('SELECT id, lamport_ts FROM messages WHERE id = ?').get(msg.id);

    const tx = this.db.transaction(() => {
      if (!existing) {
        this.db.prepare(`
          INSERT INTO messages (
            id, conversation_id, sender_uuid, receiver_uuid, is_group,
            sender_name, type, body,
            reply_to_id, forwarded_from_id, attachment_json,
            vault_link_path, vault_link_is_dir,
            lamport_ts, created_at, edited_at, deleted_at
          ) VALUES (
            @id, @conversation_id, @sender_uuid, @receiver_uuid, @is_group,
            @sender_name, @type, @body,
            @reply_to_id, @forwarded_from_id, @attachment_json,
            @vault_link_path, @vault_link_is_dir,
            @lamport_ts, @created_at, @edited_at, @deleted_at
          )
        `).run({
          id: msg.id,
          conversation_id: convId,
          sender_uuid: senderUuid,
          receiver_uuid: receiverUuid,
          is_group: isGroup,
          sender_name: senderName,
          type: msg.type || 'text',
          body: msg.body ?? '',
          reply_to_id: msg.reply_to_id ?? msg.replyToId ?? null,
          forwarded_from_id: msg.forwarded_from_id ?? msg.forwardedFromId ?? null,
          attachment_json: attachmentJson,
          vault_link_path: msg.vault_link_path ?? msg.vaultLinkPath ?? null,
          vault_link_is_dir: msg.vault_link_is_dir ?? msg.vaultLinkIsDir ? 1 : 0,
          lamport_ts: lamportTs,
          created_at: createdAt,
          edited_at: msg.edited_at ?? msg.editedAt ?? null,
          deleted_at: msg.deleted_at ?? msg.deletedAt ?? null,
        });
      } else if (lamportTs > (existing.lamport_ts || 0)) {
        this.db.prepare(`
          UPDATE messages SET
            body = @body,
            edited_at = COALESCE(@edited_at, edited_at),
            deleted_at = COALESCE(@deleted_at, deleted_at),
            lamport_ts = @lamport_ts
          WHERE id = @id
        `).run({
          id: msg.id,
          body: msg.body ?? '',
          edited_at: msg.edited_at ?? msg.editedAt ?? null,
          deleted_at: msg.deleted_at ?? msg.deletedAt ?? null,
          lamport_ts: lamportTs,
        });
      }

      this.db.prepare(`
        UPDATE conversations SET updated_at = MAX(updated_at, ?) WHERE id = ?
      `).run(createdAt, convId);
    });
    tx();

    return this.getMessageById(msg.id);
  }

  updateMessageText(id, body, editedAt = Date.now(), lamportTs = null) {
    const ts = lamportTs ?? this.nextLamportTs();
    this.db.prepare(`
      UPDATE messages
      SET body = ?, edited_at = ?, lamport_ts = MAX(lamport_ts, ?)
      WHERE id = ? AND deleted_at IS NULL
    `).run(String(body ?? ''), editedAt, ts, id);
    return this.getMessageById(id);
  }

  softDeleteMessage(id, deletedAt = Date.now(), lamportTs = null) {
    const ts = lamportTs ?? this.nextLamportTs();
    this.db.prepare(`
      UPDATE messages
      SET deleted_at = ?, body = '', attachment_json = NULL, vault_link_path = NULL, lamport_ts = MAX(lamport_ts, ?)
      WHERE id = ?
    `).run(deletedAt, ts, id);
    return this.getMessageById(id);
  }

  getMessageById(id) {
    const row = this.db.prepare('SELECT * FROM messages WHERE id = ?').get(id);
    if (!row) return null;
    return this._hydrateMessages([row])[0];
  }

  getMessages(conversationId, { limit = 100, search = '', actorUuid = null } = {}) {
    if (actorUuid && !this.isConversationMember(conversationId, actorUuid)) {
      return [];
    }
    const lim = Math.max(1, Math.min(Number(limit) || 100, 1000));
    const q = String(search || '').trim();
    let rows;
    if (actorUuid) {
      if (q) {
        const like = `%${q}%`;
        rows = this.db.prepare(`
          SELECT * FROM (
            SELECT * FROM messages
            WHERE conversation_id = ?
              AND (sender_uuid = ? OR receiver_uuid = ? OR is_group = 1)
              AND deleted_at IS NULL
              AND (body LIKE ? OR sender_name LIKE ? OR attachment_json LIKE ? OR vault_link_path LIKE ?)
            ORDER BY created_at DESC, lamport_ts DESC
            LIMIT ?
          ) sub
          ORDER BY created_at ASC, lamport_ts ASC
        `).all(conversationId, actorUuid, actorUuid, like, like, like, like, lim);
      } else {
        rows = this.db.prepare(`
          SELECT * FROM (
            SELECT * FROM messages
            WHERE conversation_id = ?
              AND (sender_uuid = ? OR receiver_uuid = ? OR is_group = 1)
            ORDER BY created_at DESC, lamport_ts DESC
            LIMIT ?
          ) sub
          ORDER BY created_at ASC, lamport_ts ASC
        `).all(conversationId, actorUuid, actorUuid, lim);
      }
    } else if (q) {
      const like = `%${q}%`;
      rows = this.db.prepare(`
        SELECT * FROM (
          SELECT * FROM messages
          WHERE conversation_id = ?
            AND deleted_at IS NULL
            AND (body LIKE ? OR sender_name LIKE ? OR attachment_json LIKE ? OR vault_link_path LIKE ?)
          ORDER BY created_at DESC, lamport_ts DESC
          LIMIT ?
        ) sub
        ORDER BY created_at ASC, lamport_ts ASC
      `).all(conversationId, like, like, like, like, lim);
    } else {
      rows = this.db.prepare(`
        SELECT * FROM (
          SELECT * FROM messages
          WHERE conversation_id = ?
          ORDER BY created_at DESC, lamport_ts DESC
          LIMIT ?
        ) sub
        ORDER BY created_at ASC, lamport_ts ASC
      `).all(conversationId, lim);
    }
    return this._hydrateMessages(rows);
  }

  getMessagesSince(lamportTs = 0) {
    const rows = this.db.prepare(
      'SELECT * FROM messages WHERE lamport_ts > ? ORDER BY lamport_ts ASC, created_at ASC'
    ).all(Number(lamportTs) || 0);
    return this._hydrateMessages(rows);
  }

  upsertReceipt(messageId, peerUuid, status) {
    const incomingRank = RECEIPT_RANK[status];
    if (!incomingRank) throw new Error(`Invalid receipt status: ${status}`);
    const now = Date.now();
    const existing = this.db.prepare(
      'SELECT status FROM message_receipts WHERE message_id = ? AND peer_uuid = ?'
    ).get(messageId, peerUuid);

    if (existing) {
      const currentRank = RECEIPT_RANK[existing.status] || 0;
      if (incomingRank <= currentRank) {
        return { message_id: messageId, peer_uuid: peerUuid, status: existing.status };
      }
      this.db.prepare(`
        UPDATE message_receipts SET status = ?, updated_at = ? WHERE message_id = ? AND peer_uuid = ?
      `).run(status, now, messageId, peerUuid);
    } else {
      this.db.prepare(`
        INSERT INTO message_receipts (message_id, peer_uuid, status, updated_at)
        VALUES (?, ?, ?, ?)
      `).run(messageId, peerUuid, status, now);
    }
    return { message_id: messageId, peer_uuid: peerUuid, status };
  }

  markConversationRead(conversationId, readerUuid) {
    const rows = this.db.prepare(`
      SELECT m.id FROM messages m
      WHERE m.conversation_id = ?
        AND m.sender_uuid != ?
        AND m.deleted_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM message_receipts r
          WHERE r.message_id = m.id AND r.peer_uuid = ? AND r.status = 'read'
        )
    `).all(conversationId, readerUuid, readerUuid);

    const ids = rows.map((r) => r.id);
    if (ids.length === 0) return [];

    const tx = this.db.transaction(() => {
      for (const msgId of ids) {
        this.upsertReceipt(msgId, readerUuid, 'read');
      }
    });
    tx();
    return ids;
  }

  toggleReaction(messageId, peerUuid, emoji) {
    const now = Date.now();
    const existing = this.db.prepare(`
      SELECT 1 FROM message_reactions WHERE message_id = ? AND peer_uuid = ? AND emoji = ?
    `).get(messageId, peerUuid, emoji);

    let added = false;
    if (existing) {
      this.db.prepare(`
        DELETE FROM message_reactions WHERE message_id = ? AND peer_uuid = ? AND emoji = ?
      `).run(messageId, peerUuid, emoji);
      added = false;
    } else {
      this.db.prepare(`
        INSERT INTO message_reactions (message_id, peer_uuid, emoji, created_at)
        VALUES (?, ?, ?, ?)
      `).run(messageId, peerUuid, emoji, now);
      added = true;
    }

    const reactions = this.db.prepare(
      'SELECT * FROM message_reactions WHERE message_id = ? ORDER BY created_at ASC'
    ).all(messageId);
    return { added, reactions };
  }

  // =========================================================================
  // Vault Nodes
  // =========================================================================

  upsertVaultNode(node) {
    if (!node) throw new Error('Vault node is required');
    const relPath = normalizeRelPath(node.rel_path ?? node.relPath);
    if (!relPath) throw new Error('Vault node rel_path cannot be empty');

    const parentPath = getParentRelPath(relPath);
    const name = node.name || path.posix.basename(relPath);
    const now = Date.now();

    const allowedEditors = Array.isArray(node.allowed_editors)
      ? node.allowed_editors
      : (Array.isArray(node.allowedEditors)
          ? node.allowedEditors
          : safeJsonParse(node.allowed_editors_json, []));
    const allowedViewers = Array.isArray(node.allowed_viewers)
      ? node.allowed_viewers
      : (Array.isArray(node.allowedViewers)
          ? node.allowedViewers
          : safeJsonParse(node.allowed_viewers_json, []));

    const payload = {
      rel_path: relPath,
      parent_path: parentPath,
      name,
      is_dir: node.is_dir ?? node.isDir ? 1 : 0,
      size: Number(node.size || 0),
      mime: node.mime ?? null,
      sha256: node.sha256 ?? null,
      owner_uuid: node.owner_uuid ?? node.ownerUuid ?? '',
      owner_name: node.owner_name ?? node.ownerName ?? null,
      perm_mode: node.perm_mode ?? node.permMode ?? 'public',
      password_hash:
        node.password_hash !== undefined ? node.password_hash : (node.passwordHash ?? null),
      password_salt:
        node.password_salt !== undefined ? node.password_salt : (node.passwordSalt ?? null),
      allowed_editors_json: JSON.stringify(allowedEditors || []),
      allowed_viewers_json: JSON.stringify(allowedViewers || []),
      acl_version: Number(node.acl_version ?? node.aclVersion ?? 1),
      version: Number(node.version ?? 1),
      lamport_ts: Number(node.lamport_ts ?? node.lamportTs ?? 0),
      created_at: Number(node.created_at ?? node.createdAt ?? now),
      updated_at: Number(node.updated_at ?? node.updatedAt ?? now),
    };

    this.db.prepare(`
      INSERT INTO vault_nodes (
        rel_path, parent_path, name, is_dir, size, mime, sha256,
        owner_uuid, owner_name, perm_mode, password_hash, password_salt,
        allowed_editors_json, allowed_viewers_json, acl_version, version,
        lamport_ts, created_at, updated_at
      ) VALUES (
        @rel_path, @parent_path, @name, @is_dir, @size, @mime, @sha256,
        @owner_uuid, @owner_name, @perm_mode, @password_hash, @password_salt,
        @allowed_editors_json, @allowed_viewers_json, @acl_version, @version,
        @lamport_ts, @created_at, @updated_at
      )
      ON CONFLICT(rel_path) DO UPDATE SET
        parent_path = excluded.parent_path,
        name = excluded.name,
        is_dir = excluded.is_dir,
        size = excluded.size,
        mime = COALESCE(excluded.mime, vault_nodes.mime),
        sha256 = COALESCE(excluded.sha256, vault_nodes.sha256),
        owner_uuid = CASE WHEN excluded.owner_uuid != '' THEN excluded.owner_uuid ELSE vault_nodes.owner_uuid END,
        owner_name = COALESCE(excluded.owner_name, vault_nodes.owner_name),
        perm_mode = excluded.perm_mode,
        password_hash = excluded.password_hash,
        password_salt = excluded.password_salt,
        allowed_editors_json = excluded.allowed_editors_json,
        allowed_viewers_json = excluded.allowed_viewers_json,
        acl_version = excluded.acl_version,
        version = excluded.version,
        lamport_ts = MAX(vault_nodes.lamport_ts, excluded.lamport_ts),
        updated_at = excluded.updated_at
    `).run(payload);

    return this.getVaultNode(relPath);
  }

  getVaultNode(relPath) {
    const norm = normalizeRelPath(relPath);
    if (!norm) return null;
    const row = this.db.prepare('SELECT * FROM vault_nodes WHERE rel_path = ?').get(norm);
    return hydrateVaultNode(row);
  }

  listVaultChildren(parentPath = '') {
    const norm = normalizeRelPath(parentPath);
    const rows = this.db.prepare(`
      SELECT * FROM vault_nodes
      WHERE parent_path = ?
      ORDER BY is_dir DESC, name COLLATE NOCASE ASC
    `).all(norm);
    return rows.map(hydrateVaultNode);
  }

  getAllVaultNodes() {
    const rows = this.db.prepare('SELECT * FROM vault_nodes ORDER BY rel_path ASC').all();
    return rows.map(hydrateVaultNode);
  }

  deleteVaultNodeSubtree(relPath) {
    const norm = normalizeRelPath(relPath);
    if (!norm) return 0;
    const info = this.db.prepare(
      'DELETE FROM vault_nodes WHERE rel_path = ? OR rel_path LIKE ?'
    ).run(norm, `${norm}/%`);
    return info.changes;
  }

  renameVaultNodeSubtree(oldRelPath, newRelPath, actorUuid = null) {
    const oldNorm = normalizeRelPath(oldRelPath);
    const newNorm = normalizeRelPath(newRelPath);
    if (!oldNorm || !newNorm) {
      throw new Error('Both oldRelPath and newRelPath must be non-empty');
    }
    const now = Date.now();
    const updatedNodes = [];

    const tx = this.db.transaction(() => {
      const subtree = this.db.prepare(
        'SELECT * FROM vault_nodes WHERE rel_path = ? OR rel_path LIKE ? ORDER BY rel_path ASC'
      ).all(oldNorm, `${oldNorm}/%`);

      if (subtree.length === 0) return;

      this.db.prepare(
        'DELETE FROM vault_nodes WHERE rel_path = ? OR rel_path LIKE ?'
      ).run(oldNorm, `${oldNorm}/%`);

      const insertStmt = this.db.prepare(`
        INSERT OR REPLACE INTO vault_nodes (
          rel_path, parent_path, name, is_dir, size, mime, sha256,
          owner_uuid, owner_name, perm_mode, password_hash, password_salt,
          allowed_editors_json, allowed_viewers_json, acl_version, version,
          lamport_ts, created_at, updated_at
        ) VALUES (
          @rel_path, @parent_path, @name, @is_dir, @size, @mime, @sha256,
          @owner_uuid, @owner_name, @perm_mode, @password_hash, @password_salt,
          @allowed_editors_json, @allowed_viewers_json, @acl_version, @version,
          @lamport_ts, @created_at, @updated_at
        )
      `);

      for (const row of subtree) {
        const suffix = row.rel_path === oldNorm ? '' : row.rel_path.slice(oldNorm.length);
        const targetRel = `${newNorm}${suffix}`;
        const targetParent = getParentRelPath(targetRel);
        const targetName = path.posix.basename(targetRel);
        const lamport = this.nextLamportTs();

        const nextRow = {
          ...row,
          rel_path: targetRel,
          parent_path: targetParent,
          name: targetName,
          owner_uuid: row.owner_uuid || actorUuid || '',
          version: (row.version || 1) + 1,
          lamport_ts: lamport,
          updated_at: now,
        };
        insertStmt.run(nextRow);
        updatedNodes.push(hydrateVaultNode(nextRow));
      }
    });
    tx();

    return updatedNodes;
  }

  // =========================================================================
  // Trash Items
  // =========================================================================

  insertTrashItem(item) {
    if (!item || !item.id) throw new Error('Trash item id is required');
    const now = Date.now();
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    const deletedAt = item.deleted_at ?? item.deletedAt ?? now;
    const expiresAt = item.expires_at ?? item.expiresAt ?? (deletedAt + thirtyDaysMs);

    const effAclJson =
      typeof item.effective_acl_json === 'string'
        ? item.effective_acl_json
        : JSON.stringify(item.effective_acl ?? item.effectiveAcl ?? { chain: [] });

    const nodesSnapshotJson =
      typeof item.nodes_snapshot_json === 'string'
        ? item.nodes_snapshot_json
        : JSON.stringify(item.nodes_snapshot ?? item.nodesSnapshot ?? []);

    this.db.prepare(`
      INSERT INTO trash_items (
        id, original_rel_path, name, is_dir, size,
        owner_uuid, owner_name, deleted_by_uuid, deleted_by_name,
        effective_acl_json, nodes_snapshot_json, deleted_at, expires_at
      ) VALUES (
        @id, @original_rel_path, @name, @is_dir, @size,
        @owner_uuid, @owner_name, @deleted_by_uuid, @deleted_by_name,
        @effective_acl_json, @nodes_snapshot_json, @deleted_at, @expires_at
      )
      ON CONFLICT(id) DO UPDATE SET
        effective_acl_json = excluded.effective_acl_json,
        nodes_snapshot_json = excluded.nodes_snapshot_json,
        expires_at = excluded.expires_at
    `).run({
      id: item.id,
      original_rel_path: normalizeRelPath(item.original_rel_path ?? item.originalRelPath),
      name: item.name,
      is_dir: item.is_dir ?? item.isDir ? 1 : 0,
      size: Number(item.size || 0),
      owner_uuid: item.owner_uuid ?? item.ownerUuid ?? '',
      owner_name: item.owner_name ?? item.ownerName ?? null,
      deleted_by_uuid: item.deleted_by_uuid ?? item.deletedByUuid ?? '',
      deleted_by_name: item.deleted_by_name ?? item.deletedByName ?? null,
      effective_acl_json: effAclJson,
      nodes_snapshot_json: nodesSnapshotJson,
      deleted_at: deletedAt,
      expires_at: expiresAt,
    });

    return this.getTrashItem(item.id);
  }

  getTrashItems() {
    const rows = this.db.prepare('SELECT * FROM trash_items ORDER BY deleted_at DESC').all();
    return rows.map(hydrateTrashItem);
  }

  getTrashItem(id) {
    const row = this.db.prepare('SELECT * FROM trash_items WHERE id = ?').get(id);
    return hydrateTrashItem(row);
  }

  deleteTrashItem(id) {
    const info = this.db.prepare('DELETE FROM trash_items WHERE id = ?').run(id);
    return info.changes > 0;
  }

  purgeExpiredTrash(nowMs = Date.now()) {
    const expired = this.db.prepare(
      'SELECT * FROM trash_items WHERE expires_at <= ?'
    ).all(nowMs).map(hydrateTrashItem);

    if (expired.length > 0) {
      this.db.prepare('DELETE FROM trash_items WHERE expires_at <= ?').run(nowMs);
    }
    return expired;
  }

  // =========================================================================
  // Audit Log
  // =========================================================================

  addAuditLog({
    id,
    eventType,
    event_type,
    actorUuid,
    actor_uuid,
    actorName,
    actor_name,
    targetPath,
    target_path,
    targetId,
    target_id,
    details,
    createdAt,
    created_at,
  }) {
    const logId = id || generateUuid();
    const ts = createdAt ?? created_at ?? Date.now();
    const rawTarget = targetPath ?? target_path ?? null;
    const normTarget = rawTarget ? normalizeRelPath(rawTarget) : null;
    const serializedDetails =
      details === undefined || details === null
        ? null
        : (typeof details === 'string' ? details : JSON.stringify(details));

    this.db.prepare(`
      INSERT OR IGNORE INTO audit_log (
        id, event_type, actor_uuid, actor_name, target_path, target_id, details, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      logId,
      eventType ?? event_type ?? 'unknown',
      actorUuid ?? actor_uuid ?? null,
      actorName ?? actor_name ?? null,
      normTarget,
      targetId ?? target_id ?? null,
      serializedDetails,
      ts
    );

    return this.db.prepare('SELECT * FROM audit_log WHERE id = ?').get(logId);
  }

  getAuditLogs({ targetPath, limit = 100, search } = {}) {
    const lim = Math.max(1, Math.min(Number(limit) || 100, 1000));
    const clauses = [];
    const params = [];

    if (targetPath) {
      const norm = normalizeRelPath(targetPath);
      clauses.push('(target_path = ? OR target_path LIKE ?)');
      params.push(norm, `${norm}/%`);
    }
    if (search && String(search).trim()) {
      const like = `%${String(search).trim()}%`;
      clauses.push('(event_type LIKE ? OR actor_name LIKE ? OR target_path LIKE ? OR details LIKE ?)');
      params.push(like, like, like, like);
    }

    const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    params.push(lim);
    return this.db.prepare(
      `SELECT * FROM audit_log ${whereSql} ORDER BY created_at DESC LIMIT ?`
    ).all(...params);
  }

  getAuditLogsSince(ts = 0) {
    return this.db.prepare(
      'SELECT * FROM audit_log WHERE created_at > ? ORDER BY created_at ASC'
    ).all(Number(ts) || 0);
  }

  close() {
    if (!this.closed) {
      this.closed = true;
      this.db.close();
    }
  }
}

module.exports = {
  TwinSyncDatabase,
  WorkMeshDatabase: TwinSyncDatabase,
  generateUuid,
  generateMasterRecoveryKey,
  normalizeRecoveryKey,
  hashSecret,
  verifySecret,
  sha256Hex,
  hashPin,
  verifyPin,
  generateRecoveryCode,
  hashRecoveryCode,
  verifyRecoveryCode,
  hashSecurityAnswerSha256,
  verifySecurityAnswerFlexible,
  normalizeRelPath,
  getParentRelPath,
  getAncestorPaths,
  safeResolvePath,
};
