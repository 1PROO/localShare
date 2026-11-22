// Zero-Footprint Browser REST + WebSocket Bridge for TwinSync Pro Desktop Web UI.
// Keeps all auth, tokens, and session state strictly in JavaScript memory.

const bridgeState = {
  installed: false,
  token: '',
  mode: 'portal',
  identity: null,
  sessionExpired: false,
  ws: null,
  wsReconnectTimer: null,
  intentionallyClosed: false,
  authListeners: new Set(),
  eventListeners: new Map()
};

function emitLocalEvent(eventName, payload) {
  const listeners = bridgeState.eventListeners.get(eventName);
  if (!listeners || listeners.size === 0) return;
  for (const cb of Array.from(listeners)) {
    try {
      cb(payload);
    } catch {
      // Ignore individual subscriber errors
    }
  }
}

function notifyAuthSubscribers() {
  const snapshot = getSessionState();
  for (const cb of Array.from(bridgeState.authListeners)) {
    try {
      cb(snapshot);
    } catch {
      // Ignore individual subscriber errors
    }
  }
}

function getSessionState() {
  return {
    authenticated: Boolean(bridgeState.token),
    token: bridgeState.token,
    mode: bridgeState.mode,
    identity: bridgeState.identity,
    sessionExpired: bridgeState.sessionExpired
  };
}

function stopWebSocket() {
  if (bridgeState.wsReconnectTimer) {
    clearTimeout(bridgeState.wsReconnectTimer);
    bridgeState.wsReconnectTimer = null;
  }
  if (bridgeState.ws) {
    try {
      bridgeState.ws.onopen = null;
      bridgeState.ws.onmessage = null;
      bridgeState.ws.onerror = null;
      bridgeState.ws.onclose = null;
      bridgeState.ws.close();
    } catch {
      // ignore close errors
    }
    bridgeState.ws = null;
  }
}

function clearSession({ sessionExpired = false, resetUrl = false } = {}) {
  bridgeState.intentionallyClosed = true;
  stopWebSocket();
  bridgeState.token = '';
  bridgeState.mode = 'portal';
  bridgeState.identity = null;
  bridgeState.sessionExpired = Boolean(sessionExpired);

  if (resetUrl && typeof window !== 'undefined') {
    try {
      window.history.replaceState(null, '', `${window.location.pathname}?mode=portal`);
    } catch {
      // ignore history errors
    }
  }

  notifyAuthSubscribers();
}

function activateSession({ token, mode = 'portal', identity = null, cleanUrl = true } = {}) {
  if (!token) return;
  bridgeState.intentionallyClosed = false;
  bridgeState.token = String(token);
  bridgeState.mode = mode === 'linked' ? 'linked' : 'portal';
  if (identity) {
    bridgeState.identity = identity;
  }
  bridgeState.sessionExpired = false;

  if (cleanUrl && typeof window !== 'undefined') {
    try {
      window.history.replaceState(
        null,
        '',
        `${window.location.pathname}?mode=${encodeURIComponent(bridgeState.mode)}`
      );
    } catch {
      // ignore history errors
    }
  }

  connectWebSocket();
  notifyAuthSubscribers();
}

function connectWebSocket() {
  if (typeof window === 'undefined' || !bridgeState.token) return;
  stopWebSocket();
  bridgeState.intentionallyClosed = false;

  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${proto}//${window.location.host}/ws?token=${encodeURIComponent(bridgeState.token)}`;

  try {
    const ws = new WebSocket(wsUrl);
    bridgeState.ws = ws;

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(String(ev.data || '{}'));
        if (!msg || !msg.event) return;
        emitLocalEvent(msg.event, msg.data);
        if (
          msg.event === 'chat:message' &&
          msg.data?.sender_uuid &&
          bridgeState.identity?.uuid &&
          msg.data.sender_uuid !== bridgeState.identity.uuid
        ) {
          emitLocalEvent('ui:play-sound', { messageId: msg.data.id });
        }
      } catch {
        // Ignore malformed WS frame
      }
    };

    ws.onclose = (ev) => {
      if (bridgeState.ws === ws) {
        bridgeState.ws = null;
      }
      if (ev.code === 4001) {
        clearSession({ sessionExpired: true, resetUrl: true });
        return;
      }
      if (ev.code === 4002) {
        clearSession({ sessionExpired: false, resetUrl: true });
        return;
      }
      if (!bridgeState.intentionallyClosed && bridgeState.token) {
        bridgeState.wsReconnectTimer = setTimeout(() => {
          connectWebSocket();
        }, 2000);
      }
    };
  } catch {
    if (!bridgeState.intentionallyClosed && bridgeState.token) {
      bridgeState.wsReconnectTimer = setTimeout(() => {
        connectWebSocket();
      }, 2500);
    }
  }
}

async function apiRequest(url, options = {}) {
  const {
    method = 'GET',
    body,
    headers = {},
    skipAuth = false,
    allowStructuredErrors = false
  } = options;

  const finalHeaders = { ...headers };
  if (!skipAuth && bridgeState.token) {
    finalHeaders.Authorization = `Bearer ${bridgeState.token}`;
  }

  let finalBody = body;
  if (body !== undefined && body !== null && !(body instanceof FormData) && typeof body !== 'string') {
    finalHeaders['Content-Type'] = finalHeaders['Content-Type'] || 'application/json';
    finalBody = JSON.stringify(body);
  }

  const res = await fetch(url, {
    method,
    headers: finalHeaders,
    body: finalBody,
    cache: 'no-store'
  });

  if (res.status === 401 && !skipAuth) {
    clearSession({ sessionExpired: true, resetUrl: true });
    throw new Error('Unauthorized');
  }

  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('application/json')
    ? await res.json().catch(() => null)
    : null;

  if (!res.ok) {
    if (allowStructuredErrors && data && typeof data === 'object' && res.status < 500) {
      return { ok: false, status: res.status, ...data };
    }
    const err = new Error((data && data.error) || `HTTP ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data;
}

function triggerBrowserDownload(url, fileName = '', { openInline = false } = {}) {
  if (typeof window === 'undefined' || !url) return;
  if (openInline) {
    const win = window.open(url, '_blank', 'noopener,noreferrer');
    if (win) return;
  }
  const a = document.createElement('a');
  a.href = url;
  if (!openInline) {
    a.download = fileName || '';
  } else {
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
  }
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function pickBrowserFiles({ multiple = true, accept = '' } = {}) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = Boolean(multiple);
    if (accept) input.accept = accept;
    input.style.position = 'fixed';
    input.style.top = '-9999px';
    input.style.opacity = '0';

    let settled = false;
    const cleanup = () => {
      window.removeEventListener('focus', onWindowFocus);
      if (input.parentNode) input.parentNode.removeChild(input);
    };
    const finish = (files) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(files);
    };

    const onWindowFocus = () => {
      setTimeout(() => {
        if (!settled) {
          const picked = Array.from(input.files || []);
          finish(picked.length > 0 ? picked : null);
        }
      }, 350);
    };

    input.addEventListener('change', () => {
      const picked = Array.from(input.files || []);
      finish(picked.length > 0 ? picked : null);
    });
    input.addEventListener('cancel', () => finish(null));
    window.addEventListener('focus', onWindowFocus);

    document.body.appendChild(input);
    input.click();
  });
}

function extractFileList(filesOrPaths) {
  return Array.from(filesOrPaths || []).filter(
    (item) => item instanceof File || item instanceof Blob
  );
}

async function uploadFilesToChat(convId, fileList, caption = '', replyToId = null) {
  const files = extractFileList(fileList);
  if (!convId || files.length === 0) {
    return { ok: false, error: 'No files selected' };
  }

  const sentMessages = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const form = new FormData();
    form.append('conversationId', convId);
    if (i === 0 && caption) form.append('caption', caption);
    if (i === 0 && replyToId) form.append('replyToId', replyToId);
    form.append('files', file, file.name || `upload_${Date.now()}`);

    const res = await apiRequest('/api/chat/upload', {
      method: 'POST',
      body: form,
      allowStructuredErrors: true
    });
    if (res && res.ok === false) {
      return res;
    }
    if (Array.isArray(res?.messages)) {
      sentMessages.push(...res.messages);
    } else if (res?.message) {
      sentMessages.push(res.message);
    }
  }

  return { ok: true, messages: sentMessages };
}

async function uploadFilesToVault(fileList, targetParentPath = '', conflictStrategy = 'prompt') {
  const files = extractFileList(fileList);
  if (files.length === 0) {
    return { ok: false, error: 'No files selected' };
  }

  const form = new FormData();
  form.append('targetParentPath', targetParentPath || '');
  form.append('conflictStrategy', conflictStrategy || 'prompt');
  for (const file of files) {
    form.append('files', file, file.name || `upload_${Date.now()}`);
  }

  const res = await apiRequest('/api/vault/upload', {
    method: 'POST',
    body: form,
    allowStructuredErrors: true
  });
  if (res?.conflict) {
    return { ...res, osPaths: files };
  }
  return res;
}

function extractTokenInput(raw) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return '';
  if (trimmed.includes('token=')) {
    try {
      const parsed = new URL(trimmed, window.location.origin);
      const tok = parsed.searchParams.get('token');
      if (tok) return tok.trim();
    } catch {
      const m = /[?&]token=([^&#\s]+)/i.exec(trimmed);
      if (m) return decodeURIComponent(m[1]).trim();
    }
  }
  return trimmed;
}

function buildWebApi() {
  return {
    isWebClient: true,

    // Web Portal Auth & Session Helpers
    webGetSessionState: () => getSessionState(),

    webSubscribeAuth: (cb) => {
      if (typeof cb !== 'function') return () => {};
      bridgeState.authListeners.add(cb);
      return () => {
        bridgeState.authListeners.delete(cb);
      };
    },

    webGetAccounts: async () => {
      const data = await apiRequest('/api/auth/accounts', { skipAuth: true });
      return data || { ok: true, accounts: [] };
    },

    webLogin: async (uuid, pin) => {
      const data = await apiRequest('/api/auth/login', {
        method: 'POST',
        body: { uuid, pin },
        skipAuth: true,
        allowStructuredErrors: true
      });
      if (data?.ok && data.token) {
        activateSession({
          token: data.token,
          mode: data.mode || 'portal',
          identity: data.identity || null
        });
      }
      return data;
    },

    webRegister: async (payload, opts = {}) => {
      const data = await apiRequest('/api/auth/register', {
        method: 'POST',
        body: payload,
        skipAuth: true,
        allowStructuredErrors: true
      });
      if (data?.ok && data.token && !opts.deferActivate) {
        activateSession({
          token: data.token,
          mode: data.mode || 'portal',
          identity: data.identity || null
        });
      }
      return data;
    },

    webActivateSession: (authResult) => {
      if (!authResult?.token) return false;
      activateSession({
        token: authResult.token,
        mode: authResult.mode || 'portal',
        identity: authResult.identity || null
      });
      return true;
    },

    webGetRecoveryInfo: async (uuid) => {
      return apiRequest(`/api/auth/recovery-info/${encodeURIComponent(uuid)}`, {
        skipAuth: true,
        allowStructuredErrors: true
      });
    },

    webRecoverPin: async (payload) => {
      const data = await apiRequest('/api/auth/recover-pin', {
        method: 'POST',
        body: payload,
        skipAuth: true,
        allowStructuredErrors: true
      });
      if (data?.ok && data.token) {
        activateSession({
          token: data.token,
          mode: data.mode || 'portal',
          identity: data.identity || null
        });
      }
      return data;
    },

    webLoginWithToken: async (rawToken) => {
      const cleanToken = extractTokenInput(rawToken);
      if (!cleanToken) {
        return { ok: false, error: 'Token is required' };
      }
      const prevToken = bridgeState.token;
      const prevMode = bridgeState.mode;
      const prevIdentity = bridgeState.identity;
      bridgeState.token = cleanToken;
      bridgeState.mode = 'linked';
      try {
        const res = await fetch('/api/bootstrap', {
          headers: { Authorization: `Bearer ${cleanToken}` },
          cache: 'no-store'
        });
        if (!res.ok) {
          bridgeState.token = prevToken;
          bridgeState.mode = prevMode;
          bridgeState.identity = prevIdentity;
          return { ok: false, error: 'Invalid or expired Quick Link token' };
        }
        const bootstrap = await res.json();
        activateSession({
          token: cleanToken,
          mode: bootstrap?.mode || 'linked',
          identity: bootstrap?.identity || null
        });
        return { ok: true, bootstrap };
      } catch (err) {
        bridgeState.token = prevToken;
        bridgeState.mode = prevMode;
        bridgeState.identity = prevIdentity;
        return { ok: false, error: err?.message || 'Connection failed' };
      }
    },

    webLogout: async () => {
      const tok = bridgeState.token;
      if (tok) {
        try {
          await fetch('/api/auth/logout', {
            method: 'POST',
            headers: { Authorization: `Bearer ${tok}` }
          });
        } catch {
          // ignore logout network failures
        }
      }
      clearSession({ sessionExpired: false, resetUrl: true });
      return { ok: true };
    },

    getInstallerInfo: async () => {
      try {
        const res = await fetch('/api/installer/info', { cache: 'no-store' });
        if (!res.ok) return { ok: false, available: false };
        return await res.json();
      } catch {
        return { ok: false, available: false };
      }
    },

    getInstallerDownloadUrl: () => '/api/installer/download',

    switchToMobileUi: () => {
      if (typeof window === 'undefined') return;
      const target = bridgeState.token
        ? `/?ui=mobile&mode=${encodeURIComponent(bridgeState.mode)}&token=${encodeURIComponent(bridgeState.token)}`
        : '/?ui=mobile&mode=portal';
      window.location.href = target;
    },

    // Identity, Settings, Audit & Peers
    getBootstrap: async () => {
      const data = await apiRequest('/api/bootstrap');
      if (data?.identity) {
        bridgeState.identity = data.identity;
      }
      return data;
    },

    completeOnboarding: async () => ({ ok: false, unsupported: true }),
    updateProfile: async () => ({ ok: false, unsupported: true }),
    updateSecurityQA: async () => ({ ok: false, unsupported: true }),
    updateAccountPin: async () => ({ ok: false, unsupported: true }),
    setSetting: async (key, value) => ({ ok: true, key, value }),
    getAuditLogs: async () => ({ ok: true, logs: [] }),

    getPeers: async () => {
      const data = await apiRequest('/api/peers');
      return Array.isArray(data) ? data : (data?.peers || []);
    },

    getNetworkInfo: async () => ({ ok: true, supported: false }),
    refreshDiscovery: async () => ({ ok: true }),
    connectManualPeer: async () => ({ ok: false, unsupported: true }),
    removeManualPeer: async () => ({ ok: false, unsupported: true }),
    checkNetworkHealth: async () => ({ ok: true, supported: false, needsAction: false }),
    fixNetworkHealth: async () => ({ ok: false, unsupported: true }),
    importInstallerExe: async () => ({ ok: false, unsupported: true }),
    removeOfflinePeer: async () => ({ ok: false, unsupported: true }),

    // Chat & Direct Attachments
    ensureDm: (peerUuid) =>
      apiRequest('/api/conversations/dm', {
        method: 'POST',
        body: { peerUuid },
        allowStructuredErrors: true
      }),

    createGroup: (payload) =>
      apiRequest('/api/groups', {
        method: 'POST',
        body: payload,
        allowStructuredErrors: true
      }),

    getMessages: (convId, opts = {}) => {
      const params = new URLSearchParams();
      params.set('limit', String(opts?.limit || 150));
      if (opts?.search) params.set('search', opts.search);
      return apiRequest(`/api/messages/${encodeURIComponent(convId)}?${params.toString()}`);
    },

    sendMessage: (payload) =>
      apiRequest('/api/messages', {
        method: 'POST',
        body: payload,
        allowStructuredErrors: true
      }),

    editMessage: (id, body) =>
      apiRequest(`/api/messages/${encodeURIComponent(id)}`, {
        method: 'PUT',
        body: { body },
        allowStructuredErrors: true
      }),

    deleteMessage: (id) =>
      apiRequest(`/api/messages/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        allowStructuredErrors: true
      }),

    toggleReaction: (id, emoji) =>
      apiRequest(`/api/messages/${encodeURIComponent(id)}/reaction`, {
        method: 'POST',
        body: { emoji },
        allowStructuredErrors: true
      }),

    sendTyping: (convId, isTyping) =>
      apiRequest(`/api/conversations/${encodeURIComponent(convId)}/typing`, {
        method: 'POST',
        body: { isTyping: Boolean(isTyping) }
      }),

    markRead: (convId) =>
      apiRequest(`/api/conversations/${encodeURIComponent(convId)}/read`, {
        method: 'POST',
        body: {}
      }),

    pickAndSendChatFiles: async (convId, caption = '', replyToId = null) => {
      const files = await pickBrowserFiles({ multiple: true });
      if (!files || files.length === 0) {
        return { ok: false, canceled: true };
      }
      return uploadFilesToChat(convId, files, caption, replyToId);
    },

    sendDroppedOsPathsToChat: (convId, filesOrPaths, caption = '', replyToId = null) =>
      uploadFilesToChat(convId, filesOrPaths, caption, replyToId),

    checkVaultSharePermission: (relPath) =>
      apiRequest(`/api/chat/check-vault-share?path=${encodeURIComponent(relPath || '')}`, {
        allowStructuredErrors: true
      }),

    shareVaultItemToChat: (payload = {}) =>
      apiRequest('/api/chat/share-vault', {
        method: 'POST',
        body: payload,
        allowStructuredErrors: true
      }),

    openChatAttachment: async (att) => {
      if (!att?.blobId || !att?.fileName) {
        return { ok: false, error: 'Attachment unavailable' };
      }
      const url = `/api/blobs/${encodeURIComponent(att.blobId)}/${encodeURIComponent(att.fileName)}?token=${encodeURIComponent(bridgeState.token)}${att.isFolder ? '&download=1' : ''}`;
      triggerBrowserDownload(url, att.originalName || att.fileName, {
        openInline: !att.isFolder
      });
      return { ok: true };
    },

    openExtractedFolderEntry: async () => ({ ok: false, unsupported: true }),

    saveChatAttachmentToPc: async (att) => {
      if (!att?.blobId || !att?.fileName) {
        return { ok: false, error: 'Attachment unavailable' };
      }
      const url = `/api/blobs/${encodeURIComponent(att.blobId)}/${encodeURIComponent(att.fileName)}?token=${encodeURIComponent(bridgeState.token)}&download=1`;
      triggerBrowserDownload(url, att.originalName || att.fileName, { openInline: false });
      return { ok: true };
    },

    saveChatAttachmentToVault: (att, targetVaultFolder = '', conflictStrategy = 'keep_both') =>
      apiRequest('/api/chat/save-to-vault', {
        method: 'POST',
        body: {
          attachment: att,
          targetVaultFolder: targetVaultFolder || '',
          conflictStrategy: conflictStrategy || 'keep_both'
        },
        allowStructuredErrors: true
      }),

    getBlobDataUrl: async (blobId, fileName) => {
      if (!blobId || !fileName) {
        return { ok: false, error: 'Invalid blob' };
      }
      return {
        ok: true,
        dataUrl: `/api/blobs/${encodeURIComponent(blobId)}/${encodeURIComponent(fileName)}?token=${encodeURIComponent(bridgeState.token)}`
      };
    },

    // Vault File Manager
    vaultList: async (parentPath = '') => {
      const data = await apiRequest(
        `/api/vault/list?path=${encodeURIComponent(parentPath || '')}`,
        { allowStructuredErrors: true }
      );
      if (data && data.ok === false && data.code === 'LOCKED') {
        return {
          ...data,
          locked: true,
          blockingAncestor: data.blockingAncestor || null
        };
      }
      if (data && typeof data === 'object' && !Array.isArray(data)) {
        return {
          ...data,
          parentAcl: data.parentAcl || data.effectiveAcl || null
        };
      }
      return data;
    },

    vaultSearch: (query = '') =>
      apiRequest(`/api/vault/search?q=${encodeURIComponent(query || '')}`),

    vaultCreateFolder: (parentPath = '', name = '') =>
      apiRequest('/api/vault/folder', {
        method: 'POST',
        body: { parentPath: parentPath || '', name },
        allowStructuredErrors: true
      }),

    vaultRename: (relPath, newName) =>
      apiRequest('/api/vault/rename', {
        method: 'POST',
        body: { relPath, newName },
        allowStructuredErrors: true
      }),

    vaultMoveOrCopy: (op, sourcePaths, targetParentPath = '', conflictStrategy = 'prompt') =>
      apiRequest('/api/vault/move-or-copy', {
        method: 'POST',
        body: {
          op,
          sourcePaths,
          targetParentPath: targetParentPath || '',
          conflictStrategy: conflictStrategy || 'prompt'
        },
        allowStructuredErrors: true
      }),

    vaultDeleteToTrash: (relPath) =>
      apiRequest('/api/vault/delete', {
        method: 'POST',
        body: { relPath },
        allowStructuredErrors: true
      }),

    vaultOpenFile: async (relPath) => {
      const cleanPath = String(relPath || '');
      const fileName = cleanPath.split('/').pop() || 'download';
      const url = `/api/vault/download?path=${encodeURIComponent(cleanPath)}&token=${encodeURIComponent(bridgeState.token)}`;
      triggerBrowserDownload(url, fileName, { openInline: false });
      return { ok: true, fileName };
    },

    vaultCloseSandboxSession: async () => ({ ok: true }),

    vaultGetPreview: (relPath) =>
      apiRequest(`/api/vault/preview?path=${encodeURIComponent(relPath || '')}`, {
        allowStructuredErrors: true
      }),

    vaultUploadFromDialog: async (targetParentPath = '') => {
      const files = await pickBrowserFiles({ multiple: true });
      if (!files || files.length === 0) {
        return { ok: false, canceled: true };
      }
      return uploadFilesToVault(files, targetParentPath, 'prompt');
    },

    vaultUploadOsPaths: (filesOrPaths, targetParentPath = '', conflictStrategy = 'prompt') =>
      uploadFilesToVault(filesOrPaths, targetParentPath, conflictStrategy),

    vaultSaveCopyAs: async (relPath) => {
      const cleanPath = String(relPath || '');
      const fileName = cleanPath.split('/').pop() || 'download';
      const url = `/api/vault/download?path=${encodeURIComponent(cleanPath)}&token=${encodeURIComponent(bridgeState.token)}`;
      triggerBrowserDownload(url, fileName, { openInline: false });
      return { ok: true };
    },

    vaultUnlockFolder: (relPath, password) =>
      apiRequest('/api/vault/unlock', {
        method: 'POST',
        body: { relPath, password },
        allowStructuredErrors: true
      }),

    vaultUpdatePermissions: (relPath, payload = {}) =>
      apiRequest('/api/vault/permissions', {
        method: 'PUT',
        body: { relPath, ...(payload || {}) },
        allowStructuredErrors: true
      }),

    vaultGetRecoveryInfo: (relPath) =>
      apiRequest(`/api/vault/recovery-info?path=${encodeURIComponent(relPath || '')}`, {
        allowStructuredErrors: true
      }),

    vaultRecoverPassword: (relPath, payload = {}) =>
      apiRequest('/api/vault/recover-password', {
        method: 'POST',
        body: { relPath, ...(payload || {}) },
        allowStructuredErrors: true
      }),

    vaultGetProperties: (relPath) =>
      apiRequest(`/api/vault/properties?path=${encodeURIComponent(relPath || '')}`, {
        allowStructuredErrors: true
      }),

    // Trash
    trashList: () => apiRequest('/api/trash'),

    trashRestore: (trashId) =>
      apiRequest('/api/trash/restore', {
        method: 'POST',
        body: { trashId },
        allowStructuredErrors: true
      }),

    trashDeleteForever: (trashId) =>
      apiRequest(`/api/trash/${encodeURIComponent(trashId)}`, {
        method: 'DELETE',
        allowStructuredErrors: true
      }),

    // Mobile Companion (Electron-only)
    mobileGetPairing: async () => ({ ok: false, unsupported: true }),
    mobileRotateToken: async () => ({ ok: false, unsupported: true }),

    // Real-time push events via WebSocket
    onEvent: (eventName, cb) => {
      if (!eventName || typeof cb !== 'function') {
        return () => {};
      }
      let set = bridgeState.eventListeners.get(eventName);
      if (!set) {
        set = new Set();
        bridgeState.eventListeners.set(eventName, set);
      }
      set.add(cb);
      return () => {
        const cur = bridgeState.eventListeners.get(eventName);
        if (!cur) return;
        cur.delete(cb);
        if (cur.size === 0) {
          bridgeState.eventListeners.delete(eventName);
        }
      };
    }
  };
}

export function installWebBridgeIfNeeded() {
  if (typeof window === 'undefined') return false;
  if (window.twinsync || window.workmesh) return false;
  if (bridgeState.installed) return true;

  bridgeState.installed = true;

  try {
    const params = new URLSearchParams(window.location.search);
    const urlToken = (params.get('token') || '').trim();
    const rawMode = (params.get('mode') || '').trim().toLowerCase();
    if (urlToken) {
      bridgeState.token = urlToken;
      bridgeState.mode = rawMode === 'portal' ? 'portal' : 'linked';
      try {
        window.history.replaceState(
          null,
          '',
          `${window.location.pathname}?mode=${encodeURIComponent(bridgeState.mode)}`
        );
      } catch {
        // ignore history error
      }
      connectWebSocket();
    } else {
      bridgeState.token = '';
      bridgeState.mode = 'portal';
    }
  } catch {
    bridgeState.token = '';
    bridgeState.mode = 'portal';
  }

  const api = buildWebApi();
  window.twinsync = api;
  window.workmesh = api;
  return true;
}

export default installWebBridgeIfNeeded;
