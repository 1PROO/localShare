'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');

const { WorkMeshDatabase } = require('./database');
const { MeshNetwork } = require('./meshNetwork');
const {
  SandboxManager,
  guessMime,
  normalizeRelPath,
  safeJoin,
  sanitizeNodeForPublic,
  sanitizeFileName
} = require('./sandboxManager');
const { MobileServer } = require('./mobileServer');

function resolveVaultPaths() {
  const isProdWin = process.platform === 'win32' && !process.env.WORKMESH_VAULT_DIR;
  const vaultRoot = isProdWin
    ? 'C:\\ProgramData\\WorkMesh_Vault'
    : (process.env.WORKMESH_VAULT_DIR
        ? path.resolve(process.env.WORKMESH_VAULT_DIR)
        : path.join(os.homedir(), '.workmesh_vault'));

  return {
    vaultRoot,
    filesDir: path.join(vaultRoot, 'files'),
    trashDir: path.join(vaultRoot, '.trash'),
    chatBlobsDir: path.join(vaultRoot, '.chat_blobs'),
    metaDir: path.join(vaultRoot, '.meta'),
    stagingDir: path.join(vaultRoot, '.meta', 'staging')
  };
}

function applyHiddenSystemAttribWin(targetPath) {
  if (process.platform !== 'win32') return;
  try {
    execFile('attrib', ['+h', '+s', targetPath], { windowsHide: true }, () => {});
  } catch (_) {}
}

function ensureVaultPaths(vaultPaths) {
  fs.mkdirSync(vaultPaths.vaultRoot, { recursive: true });
  fs.mkdirSync(vaultPaths.filesDir, { recursive: true });
  fs.mkdirSync(vaultPaths.trashDir, { recursive: true });
  fs.mkdirSync(vaultPaths.chatBlobsDir, { recursive: true });
  fs.mkdirSync(vaultPaths.metaDir, { recursive: true });
  fs.mkdirSync(vaultPaths.stagingDir, { recursive: true });

  if (process.platform === 'win32') {
    if (!process.env.WORKMESH_VAULT_DIR) {
      applyHiddenSystemAttribWin(vaultPaths.vaultRoot);
    }
    applyHiddenSystemAttribWin(vaultPaths.trashDir);
    applyHiddenSystemAttribWin(vaultPaths.chatBlobsDir);
    applyHiddenSystemAttribWin(vaultPaths.metaDir);
  }
}

function sanitizeIdentityForDesktop(identity) {
  if (!identity) return null;
  return {
    uuid: identity.uuid,
    display_name: identity.display_name || '',
    avatar_data: identity.avatar_data || null,
    onboarded: Boolean(identity.onboarded),
    onboarding_done: Boolean(identity.onboarded),
    master_recovery_key: identity.master_recovery_key || '',
    security_question: identity.security_question || '',
    created_at: identity.created_at,
    updated_at: identity.updated_at
  };
}

function sanitizePeersForDesktop(peers) {
  return (peers || []).map((p) => ({
    uuid: p.uuid,
    display_name: p.display_name || '',
    avatar_data: p.avatar_data || null,
    ip: p.ip || '',
    ws_port: p.ws_port || 0,
    status: p.status || 'offline',
    last_seen: p.last_seen || 0,
    security_question: p.security_question || ''
  }));
}

function wrapIpcHandler(fn) {
  return async (_event, ...args) => {
    try {
      return await fn(...args);
    } catch (err) {
      return {
        ok: false,
        code: err?.code || 'ERROR',
        error: err?.message || 'Unknown error',
        message: err?.message || 'Unknown error',
        blockingAncestor: err?.blockingAncestor || null,
        editors: err?.editors || []
      };
    }
  };
}

if (process.versions && process.versions.electron) {
  const {
    app,
    BrowserWindow,
    ipcMain,
    dialog,
    Tray,
    Menu,
    Notification,
    nativeImage
  } = require('electron');

  const isWindows7 =
    process.platform === 'win32' &&
    typeof os.release === 'function' &&
    /^6\.1(\.|$)/.test(os.release());

  if (isWindows7) {
    app.disableHardwareAcceleration();
  }

  const gotSingleInstanceLock = app.requestSingleInstanceLock();
  if (!gotSingleInstanceLock) {
    app.quit();
  } else {
    app.setAppUserModelId('com.workmesh.desktop');

    const startHidden = process.argv.includes('--hidden');
    let mainWindow = null;
    let tray = null;
    let lastBalloonChatId = null;
    let isQuitting = false;
    let db = null;
    let meshNetwork = null;
    let sandboxManager = null;
    let mobileServer = null;
    let vaultPaths = null;
    const unlockedSet = new Set();

    const showAndFocusMainWindow = () => {
      if (!mainWindow) return;
      if (mainWindow.isMinimized()) mainWindow.restore();
      if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.focus();
    };

    const sendToRenderer = (channel, payload) => {
      if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
        mainWindow.webContents.send(channel, payload);
      }
    };

    const updateTrayMenu = () => {
      if (!tray) return;
      const peers = db ? db.getPeers() : [];
      const onlineCount = peers.filter((p) => p.status === 'online').length;
      const soundMuted = db ? Boolean(db.getSetting('sound_muted', false)) : false;
      const isAr = db ? db.getSetting('lang', 'ar') === 'ar' : true;

      const template = [
        {
          label: isAr ? 'فتح WorkMesh' : 'Open WorkMesh',
          click: () => showAndFocusMainWindow()
        },
        {
          label: isAr ? `الأجهزة المتصلة: ${onlineCount}` : `Online Peers: ${onlineCount}`,
          enabled: false
        },
        {
          label: isAr ? 'ربط الهاتف (QR)' : 'Link Mobile',
          click: () => {
            showAndFocusMainWindow();
            sendToRenderer('ui:open-mobile-link', {});
          }
        },
        {
          label: isAr
            ? (soundMuted ? 'تفعيل صوت الإشعارات' : 'كتم الإشعارات')
            : (soundMuted ? 'Unmute Notifications' : 'Mute Notifications'),
          type: 'checkbox',
          checked: soundMuted,
          click: () => {
            if (!db) return;
            const nextMuted = !Boolean(db.getSetting('sound_muted', false));
            db.setSetting('sound_muted', nextMuted);
            updateTrayMenu();
          }
        },
        { type: 'separator' },
        {
          label: isAr ? 'خروج نهائي' : 'Quit Completely',
          click: () => {
            isQuitting = true;
            app.quit();
          }
        }
      ];

      tray.setContextMenu(Menu.buildFromTemplate(template));
    };

    const createTray = () => {
      const trayIconPath = path.join(__dirname, 'assets', 'tray-icon.png');
      let img = nativeImage.createFromPath(trayIconPath);
      if (img.isEmpty()) {
        img = nativeImage.createFromPath(path.join(__dirname, 'assets', 'icon.png'));
      }
      tray = new Tray(img);
      tray.setToolTip('WorkMesh');
      tray.on('click', () => showAndFocusMainWindow());
      tray.on('double-click', () => showAndFocusMainWindow());
      tray.on('balloon-click', () => {
        showAndFocusMainWindow();
        if (lastBalloonChatId) {
          sendToRenderer('ui:open-chat', { chatId: lastBalloonChatId });
        }
      });
      updateTrayMenu();
    };

    const createMainWindow = () => {
      const iconPath = path.join(
        __dirname,
        'assets',
        process.platform === 'win32' ? 'icon.ico' : 'icon.png'
      );

      mainWindow = new BrowserWindow({
        width: 1280,
        height: 820,
        minWidth: 940,
        minHeight: 620,
        show: !startHidden,
        icon: iconPath,
        title: 'WorkMesh',
        webPreferences: {
          preload: path.join(__dirname, 'preload.js'),
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: false
        }
      });

      if (process.env.WORKMESH_DEV === '1') {
        mainWindow.loadURL('http://localhost:5173');
      } else {
        mainWindow.loadFile(path.join(__dirname, 'dist-renderer', 'index.html'));
      }

      mainWindow.on('close', (event) => {
        if (!isQuitting) {
          event.preventDefault();
          mainWindow.hide();
        }
      });
    };

    const notifyIncomingMessage = (msg) => {
      if (!msg || !db) return;
      const identity = db.getIdentity();
      if (!identity || msg.sender_uuid === identity.uuid) return;

      const soundMuted = Boolean(db.getSetting('sound_muted', false));
      if (!soundMuted) {
        sendToRenderer('ui:play-sound', { messageId: msg.id });
      }

      const windowHiddenOrUnfocused =
        !mainWindow || !mainWindow.isVisible() || !mainWindow.isFocused();
      if (!windowHiddenOrUnfocused) return;

      const title = msg.sender_name || 'WorkMesh';
      let body = msg.body || '';
      if (!body) {
        if (msg.type === 'voice') body = '🎤 Voice Note';
        else if (msg.type === 'vault_link') body = `🔗 ${msg.vault_link_path || 'Vault Item'}`;
        else if (msg.attachment?.originalName || msg.attachment?.fileName) {
          body = `📎 ${msg.attachment.originalName || msg.attachment.fileName}`;
        } else {
          body = 'New message';
        }
      }

      const iconPath = path.join(__dirname, 'assets', 'icon.png');
      if (!isWindows7 && Notification.isSupported()) {
        const notif = new Notification({
          title,
          body: body.slice(0, 140),
          icon: iconPath,
          silent: soundMuted
        });
        notif.on('click', () => {
          showAndFocusMainWindow();
          sendToRenderer('ui:open-chat', { chatId: msg.conversation_id });
        });
        notif.show();
      } else if (tray && process.platform === 'win32') {
        try {
          lastBalloonChatId = msg.conversation_id;
          tray.displayBalloon({
            iconType: 'info',
            title,
            content: body.slice(0, 140)
          });
        } catch (_) {}
      }
    };

    const registerIpcHandlers = () => {
      const getMyUuid = () => db.getIdentity()?.uuid || '';

      // Identity, Settings, Audit & Peers
      ipcMain.handle('app:getBootstrap', wrapIpcHandler(() => {
        const identity = db.ensureIdentity();
        const peers = db.getPeers();
        const conversations = db.getConversations(identity.uuid);
        const settings = db.getAllSettings();
        return {
          ok: true,
          identity: sanitizeIdentityForDesktop(identity),
          masterRecoveryKey: identity.master_recovery_key || '',
          peers: sanitizePeersForDesktop(peers),
          conversations,
          settings,
          presenceMap: meshNetwork.getAllFilePresence(),
          openSessions: sandboxManager.getOpenSessions(),
          status: meshNetwork.getStatus()
        };
      }));

      ipcMain.handle('app:completeOnboarding', wrapIpcHandler((payload) => {
        const updated = db.completeOnboarding(payload || {});
        meshNetwork.broadcastProfileUpdate();
        return {
          ok: true,
          identity: sanitizeIdentityForDesktop(updated)
        };
      }));

      ipcMain.handle('app:updateProfile', wrapIpcHandler((payload) => {
        const updated = db.updateProfile(payload || {});
        meshNetwork.broadcastProfileUpdate();
        return {
          ok: true,
          identity: sanitizeIdentityForDesktop(updated)
        };
      }));

      ipcMain.handle('app:updateSecurityQA', wrapIpcHandler((payload) => {
        const updated = db.updateSecurityQA(payload || {});
        meshNetwork.broadcastProfileUpdate();
        return {
          ok: true,
          identity: sanitizeIdentityForDesktop(updated)
        };
      }));

      ipcMain.handle('app:setSetting', wrapIpcHandler((key, value) => {
        db.setSetting(key, value);
        if (key === 'sound_muted' || key === 'lang') {
          updateTrayMenu();
        }
        return { ok: true, key, value };
      }));

      ipcMain.handle('app:getAuditLogs', wrapIpcHandler((filter) => {
        const logs = db.getAuditLogs(filter || {});
        return { ok: true, logs };
      }));

      ipcMain.handle('app:getPeers', wrapIpcHandler(() => {
        return sanitizePeersForDesktop(db.getPeers());
      }));

      // Chat & Direct Attachments
      ipcMain.handle('chat:ensureDm', wrapIpcHandler((peerUuid) => {
        const conv = db.ensureDmConversation(getMyUuid(), peerUuid);
        return { ok: true, conversation: conv };
      }));

      ipcMain.handle('chat:createGroup', wrapIpcHandler((payload) => {
        const conv = meshNetwork.createGroup(payload || {});
        return { ok: true, conversation: conv };
      }));

      ipcMain.handle('chat:getMessages', wrapIpcHandler((convId, opts) => {
        const messages = db.getMessages(convId, opts || {});
        return { ok: true, messages };
      }));

      ipcMain.handle('chat:sendMessage', wrapIpcHandler(async (payload) => {
        const nextPayload = { ...(payload || {}) };
        if (nextPayload.type === 'voice' && nextPayload.voiceDataUrl) {
          const commaIdx = nextPayload.voiceDataUrl.indexOf(',');
          const rawB64 = commaIdx !== -1
            ? nextPayload.voiceDataUrl.slice(commaIdx + 1)
            : nextPayload.voiceDataUrl;
          const mimeMatch = /^data:([^;]+);base64,/i.exec(nextPayload.voiceDataUrl);
          const mime = mimeMatch ? mimeMatch[1] : 'audio/webm';
          const ext = mime.includes('ogg') ? 'ogg' : (mime.includes('mp4') ? 'm4a' : 'webm');
          const att = await sandboxManager.saveBufferAsChatBlob({
            buffer: Buffer.from(rawB64, 'base64'),
            fileName: `voice_${Date.now()}.${ext}`,
            mime
          });
          att.durationMs = nextPayload.durationMs || 0;
          nextPayload.attachment = att;
          delete nextPayload.voiceDataUrl;
        }
        if (!nextPayload.attachment && Array.isArray(nextPayload.attachments) && nextPayload.attachments.length > 0) {
          nextPayload.attachment = nextPayload.attachments[0];
        }
        if (nextPayload.vaultLink && !nextPayload.vault_link_path) {
          nextPayload.vault_link_path = nextPayload.vaultLink.relPath || nextPayload.vaultLink.rel_path;
          nextPayload.vault_link_is_dir = Boolean(nextPayload.vaultLink.isDir ?? nextPayload.vaultLink.is_dir);
        }
        const message = meshNetwork.sendChatMessage(nextPayload);
        return { ok: true, message };
      }));

      ipcMain.handle('chat:editMessage', wrapIpcHandler((id, body) => {
        const message = meshNetwork.editChatMessage(id, body);
        return { ok: true, message };
      }));

      ipcMain.handle('chat:deleteMessage', wrapIpcHandler((id) => {
        const message = meshNetwork.deleteChatMessage(id);
        return { ok: true, message };
      }));

      ipcMain.handle('chat:toggleReaction', wrapIpcHandler((id, emoji) => {
        const res = meshNetwork.toggleReaction(id, emoji);
        return { ok: true, ...res };
      }));

      ipcMain.handle('chat:sendTyping', wrapIpcHandler((convId, isTyping) => {
        meshNetwork.sendTyping(convId, Boolean(isTyping));
        return { ok: true };
      }));

      ipcMain.handle('chat:markRead', wrapIpcHandler((convId) => {
        const readIds = meshNetwork.markConversationRead(convId);
        return { ok: true, readIds };
      }));

      const sendOsPathsHelper = async (convId, osPaths, caption, replyToId) => {
        const list = Array.isArray(osPaths) ? osPaths.filter(Boolean) : [];
        if (list.length === 0) return { ok: false, error: 'No files selected' };
        const sent = [];
        for (let i = 0; i < list.length; i++) {
          const att = await sandboxManager.prepareDirectChatAttachment(list[i]);
          const msgType = att.isFolder
            ? 'folder'
            : (String(att.mime || '').startsWith('image/') ? 'image' : 'file');
          const msg = meshNetwork.sendChatMessage({
            conversationId: convId,
            type: msgType,
            body: i === 0 ? (caption || '') : '',
            attachment: att,
            replyToId: i === 0 ? (replyToId || null) : null
          });
          sent.push(msg);
        }
        return { ok: true, messages: sent };
      };

      ipcMain.handle('chat:pickAndSendChatFiles', wrapIpcHandler(async (convId, caption, replyToId) => {
        const res = await dialog.showOpenDialog(mainWindow, {
          properties: ['openFile', 'multiSelections']
        });
        if (res.canceled || !res.filePaths?.length) {
          return { ok: false, canceled: true };
        }
        return sendOsPathsHelper(convId, res.filePaths, caption, replyToId);
      }));

      ipcMain.handle('chat:sendDroppedOsPathsToChat', wrapIpcHandler((convId, osPaths, caption, replyToId) => {
        return sendOsPathsHelper(convId, osPaths, caption, replyToId);
      }));

      ipcMain.handle('chat:checkVaultSharePermission', wrapIpcHandler((relPath) => {
        const acl = meshNetwork.computeEffectiveAcl(relPath, getMyUuid(), unlockedSet);
        return {
          ok: true,
          isProtected: acl.isProtected,
          canRead: acl.canRead,
          canWrite: acl.canWrite,
          role: acl.role,
          blockingAncestor: acl.blockingAncestor
        };
      }));

      ipcMain.handle('chat:shareVaultItemToChat', wrapIpcHandler(async (payload) => {
        const { conversationId, relPath, mode = 'deeplink', caption = '', replyToId = null } = payload || {};
        const normRel = normalizeRelPath(relPath);
        const actorUuid = getMyUuid();

        if (mode === 'copy') {
          const att = await sandboxManager.prepareIndependentVaultCopyForChat(normRel, actorUuid, unlockedSet);
          if (!att.ok) return att;
          const msgType = att.isFolder
            ? 'folder'
            : (String(att.mime || '').startsWith('image/') ? 'image' : 'file');
          const message = meshNetwork.sendChatMessage({
            conversationId,
            type: msgType,
            body: caption,
            attachment: att,
            replyToId
          });
          return { ok: true, message };
        }

        const node = db.getVaultNode(normRel);
        if (!node) {
          return { ok: false, code: 'NOT_FOUND', error: 'Vault item not found' };
        }
        const message = meshNetwork.sendChatMessage({
          conversationId,
          type: 'vault_link',
          body: caption,
          vault_link_path: node.rel_path,
          vault_link_is_dir: Boolean(node.is_dir),
          replyToId
        });
        return { ok: true, message };
      }));

      ipcMain.handle('chat:openChatAttachment', wrapIpcHandler((att) => {
        return sandboxManager.openChatAttachment(att);
      }));

      ipcMain.handle('chat:openExtractedFolderEntry', wrapIpcHandler((sessionId, entryRelPath) => {
        return sandboxManager.openExtractedFolderEntry(sessionId, entryRelPath);
      }));

      ipcMain.handle('chat:saveChatAttachmentToPc', wrapIpcHandler(async (att) => {
        const defaultName = sanitizeFileName(att?.originalName || att?.fileName || 'download');
        const res = await dialog.showSaveDialog(mainWindow, {
          defaultPath: defaultName
        });
        if (res.canceled || !res.filePath) {
          return { ok: false, canceled: true };
        }
        return sandboxManager.saveChatAttachmentToDisk(att, res.filePath);
      }));

      ipcMain.handle('chat:saveChatAttachmentToVault', wrapIpcHandler((att, targetVaultFolder, conflictStrategy) => {
        return sandboxManager.saveChatAttachmentToVault(
          att,
          targetVaultFolder || '',
          conflictStrategy || 'prompt',
          getMyUuid(),
          unlockedSet
        );
      }));

      ipcMain.handle('chat:getBlobDataUrl', wrapIpcHandler(async (blobId, fileName) => {
        const safeBlob = sanitizeFileName(blobId);
        const safeFile = sanitizeFileName(fileName);
        if (typeof meshNetwork.ensureChatBlobAvailable === 'function') {
          await meshNetwork.ensureChatBlobAvailable(safeBlob, safeFile);
        }
        const blobFile = safeJoin(path.join(vaultPaths.chatBlobsDir, safeBlob), safeFile);
        if (!fs.existsSync(blobFile)) {
          return { ok: false, code: 'NOT_FOUND', error: 'Blob not found' };
        }
        const mime = guessMime(safeFile);
        const dataUrl = `data:${mime};base64,${fs.readFileSync(blobFile).toString('base64')}`;
        return { ok: true, dataUrl, mime };
      }));

      // Vault File Manager & Sandbox
      ipcMain.handle('vault:list', wrapIpcHandler((parentPath) => {
        return meshNetwork.listDirectory(parentPath || '', getMyUuid(), unlockedSet);
      }));

      ipcMain.handle('vault:search', wrapIpcHandler((query) => {
        const items = meshNetwork.searchVault(query || '', getMyUuid(), unlockedSet);
        return { ok: true, items };
      }));

      ipcMain.handle('vault:createFolder', wrapIpcHandler((parentPath, name) => {
        const node = meshNetwork.createFolder(parentPath || '', name, getMyUuid(), unlockedSet);
        return { ok: true, node: sanitizeNodeForPublic(node) };
      }));

      ipcMain.handle('vault:rename', wrapIpcHandler((relPath, newName) => {
        const node = meshNetwork.renameNode(relPath, newName, getMyUuid(), unlockedSet);
        return { ok: true, node: sanitizeNodeForPublic(node) };
      }));

      ipcMain.handle('vault:moveOrCopy', wrapIpcHandler((op, sourcePaths, targetParentPath, conflictStrategy) => {
        return meshNetwork.moveOrCopyNode(
          op,
          sourcePaths,
          targetParentPath || '',
          conflictStrategy || 'prompt',
          getMyUuid(),
          unlockedSet
        );
      }));

      ipcMain.handle('vault:deleteToTrash', wrapIpcHandler((relPath) => {
        const trashItem = meshNetwork.deleteToTrash(relPath, getMyUuid(), unlockedSet);
        return { ok: true, trashItem };
      }));

      ipcMain.handle('vault:openFile', wrapIpcHandler((relPath, opts) => {
        return sandboxManager.openVaultFile(relPath, {
          ...(opts || {}),
          actorUuid: getMyUuid(),
          unlockedSet
        });
      }));

      ipcMain.handle('vault:closeSandboxSession', wrapIpcHandler((sessionId) => {
        return sandboxManager.closeSession(sessionId);
      }));

      ipcMain.handle('vault:getPreview', wrapIpcHandler((relPath) => {
        return sandboxManager.getFilePreviewData(relPath, getMyUuid(), unlockedSet);
      }));

      ipcMain.handle('vault:uploadFromDialog', wrapIpcHandler(async (targetParentPath) => {
        const res = await dialog.showOpenDialog(mainWindow, {
          properties: ['openFile', 'multiSelections']
        });
        if (res.canceled || !res.filePaths?.length) {
          return { ok: false, canceled: true };
        }
        const out = await sandboxManager.importOsPathsToVault(
          res.filePaths,
          targetParentPath || '',
          'prompt',
          getMyUuid(),
          unlockedSet
        );
        if (out.conflict) {
          return { ...out, osPaths: res.filePaths };
        }
        return out;
      }));

      ipcMain.handle('vault:uploadOsPaths', wrapIpcHandler((osPaths, targetParentPath, conflictStrategy) => {
        return sandboxManager.importOsPathsToVault(
          osPaths,
          targetParentPath || '',
          conflictStrategy || 'prompt',
          getMyUuid(),
          unlockedSet
        );
      }));

      ipcMain.handle('vault:saveCopyAs', wrapIpcHandler(async (relPath) => {
        const norm = normalizeRelPath(relPath);
        const actorUuid = getMyUuid();
        const acl = meshNetwork.computeEffectiveAcl(norm, actorUuid, unlockedSet);
        if (!acl.canRead) {
          return { ok: false, code: 'LOCKED', blockingAncestor: acl.blockingAncestor };
        }
        const res = await dialog.showSaveDialog(mainWindow, {
          defaultPath: path.basename(norm)
        });
        if (res.canceled || !res.filePath) {
          return { ok: false, canceled: true };
        }
        return sandboxManager.saveCopyToDisk(norm, res.filePath, actorUuid, unlockedSet);
      }));

      ipcMain.handle('vault:unlockFolder', wrapIpcHandler((relPath, password) => {
        return meshNetwork.verifyAndUnlockFolder(relPath, password, unlockedSet);
      }));

      ipcMain.handle('vault:updatePermissions', wrapIpcHandler((relPath, payload) => {
        const node = meshNetwork.updateFolderPermissions(relPath, payload || {}, getMyUuid());
        return { ok: true, node: sanitizeNodeForPublic(node) };
      }));

      ipcMain.handle('vault:getRecoveryInfo', wrapIpcHandler((relPath) => {
        const info = meshNetwork.getFolderRecoveryInfo(relPath);
        return { ok: true, ...info };
      }));

      ipcMain.handle('vault:recoverPassword', wrapIpcHandler((relPath, payload) => {
        return meshNetwork.recoverFolderPassword(relPath, payload || {});
      }));

      ipcMain.handle('vault:getProperties', wrapIpcHandler((relPath) => {
        const norm = normalizeRelPath(relPath);
        const actorUuid = getMyUuid();
        const acl = meshNetwork.computeEffectiveAcl(norm, actorUuid, unlockedSet);
        if (!acl.canRead) {
          return { ok: false, code: 'LOCKED', blockingAncestor: acl.blockingAncestor };
        }
        const node = db.getVaultNode(norm);
        if (!node) {
          return { ok: false, code: 'NOT_FOUND', error: 'Item not found' };
        }
        const identity = db.getIdentity();
        const owner = node.owner_uuid === identity?.uuid
          ? identity
          : db.getPeer(node.owner_uuid);
        const auditLogs = db.getAuditLogs({ targetPath: norm, limit: 50 });
        return {
          ok: true,
          node: sanitizeNodeForPublic(node),
          ownerName: owner?.display_name || node.owner_name || '',
          effectiveAcl: acl,
          auditLogs
        };
      }));

      // Trash
      ipcMain.handle('trash:list', wrapIpcHandler(() => {
        const items = meshNetwork.listTrash(getMyUuid(), unlockedSet);
        return { ok: true, items };
      }));

      ipcMain.handle('trash:restore', wrapIpcHandler((trashId) => {
        return meshNetwork.restoreFromTrash(trashId, getMyUuid());
      }));

      ipcMain.handle('trash:deleteForever', wrapIpcHandler((trashId) => {
        return meshNetwork.deleteTrashForever(trashId, getMyUuid());
      }));

      // Mobile Companion
      ipcMain.handle('mobile:getPairing', wrapIpcHandler(() => {
        return mobileServer.getPairingInfo();
      }));

      ipcMain.handle('mobile:rotateToken', wrapIpcHandler(() => {
        return mobileServer.rotateToken();
      }));
    };

    const wireEngineEvents = () => {
      const forwardMeshEvents = [
        'chat:edit',
        'chat:delete',
        'chat:typing',
        'chat:receipt',
        'chat:reaction',
        'conversations:changed',
        'vault:changed',
        'presence:changed',
        'trash:changed',
        'transfer:progress'
      ];

      for (const evt of forwardMeshEvents) {
        meshNetwork.on(evt, (payload) => sendToRenderer(evt, payload));
      }

      meshNetwork.on('chat:message', (msg) => {
        sendToRenderer('chat:message', msg);
        notifyIncomingMessage(msg);
      });

      meshNetwork.on('peers:changed', (peers) => {
        sendToRenderer('peers:changed', sanitizePeersForDesktop(peers));
        updateTrayMenu();
      });

      meshNetwork.on('vault:remote-updated', (payload) => {
        if (payload?.relPath) {
          sandboxManager.onRemoteFileUpdated(payload.relPath, payload.editorName || 'Peer');
        }
        sendToRenderer('vault:remote-updated', payload);
      });

      sandboxManager.on('sandbox:conflict-saved', (payload) => {
        sendToRenderer('sandbox:conflict-saved', payload);
      });

      sandboxManager.on('sandbox:saved', (payload) => {
        sendToRenderer('sandbox:saved', payload);
      });

      sandboxManager.on('sandbox:sessions-changed', (sessions) => {
        sendToRenderer('sandbox:sessions-changed', sessions);
      });

      sandboxManager.on('sandbox:remote-updated', (payload) => {
        sendToRenderer('sandbox:remote-updated', payload);
        sendToRenderer('vault:remote-updated', payload);
      });
    };

    app.on('second-instance', () => {
      showAndFocusMainWindow();
    });

    app.whenReady().then(async () => {
      try {
        app.setLoginItemSettings({ openAtLogin: true, args: ['--hidden'] });
      } catch (_) {
        // Non-fatal in dev or Linux environments
      }

      vaultPaths = resolveVaultPaths();
      ensureVaultPaths(vaultPaths);

      const dbPath = path.join(vaultPaths.metaDir, 'workmesh.db');
      db = new WorkMeshDatabase(dbPath);
      db.ensureIdentity();

      meshNetwork = new MeshNetwork({ db, vaultPaths });
      sandboxManager = new SandboxManager({ db, meshNetwork, vaultPaths });
      mobileServer = new MobileServer({ db, meshNetwork, sandboxManager, vaultPaths, port: 41236 });

      registerIpcHandlers();
      wireEngineEvents();

      await meshNetwork.start();
      await mobileServer.start();

      createMainWindow();
      createTray();
    }).catch((err) => {
      console.error('WorkMesh startup error:', err);
      app.quit();
    });

    app.on('window-all-closed', () => {
      // Keep running in System Tray while Mesh + Mobile Companion stay active
    });

    app.on('before-quit', async () => {
      isQuitting = true;
      try { if (sandboxManager) await sandboxManager.cleanupAll(); } catch (_) {}
      try { if (mobileServer) await mobileServer.stop(); } catch (_) {}
      try { if (meshNetwork) await meshNetwork.stop(); } catch (_) {}
      try { if (db) db.close(); } catch (_) {}
    });
  }
}

module.exports = {
  resolveVaultPaths,
  ensureVaultPaths,
  sanitizeIdentityForDesktop,
  sanitizePeersForDesktop
};
