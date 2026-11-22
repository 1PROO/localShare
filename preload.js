'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const ALLOWED_EVENTS = new Set([
  'chat:message',
  'chat:edit',
  'chat:delete',
  'chat:typing',
  'chat:receipt',
  'chat:reaction',
  'conversations:changed',
  'peers:changed',
  'vault:changed',
  'vault:remote-updated',
  'presence:changed',
  'trash:changed',
  'transfer:progress',
  'sandbox:conflict-saved',
  'sandbox:saved',
  'sandbox:remote-updated',
  'sandbox:sessions-changed',
  'ui:open-chat',
  'ui:open-mobile-link',
  'ui:play-sound'
]);

const api = {
  // Identity, Settings, Audit & Peers
  getBootstrap: () => ipcRenderer.invoke('app:getBootstrap'),
  completeOnboarding: (payload) => ipcRenderer.invoke('app:completeOnboarding', payload),
  updateProfile: (payload) => ipcRenderer.invoke('app:updateProfile', payload),
  updateSecurityQA: (payload) => ipcRenderer.invoke('app:updateSecurityQA', payload),
  updateAccountPin: (pin) => ipcRenderer.invoke('app:updateAccountPin', pin),
  setSetting: (key, value) => ipcRenderer.invoke('app:setSetting', key, value),
  getAuditLogs: (filter) => ipcRenderer.invoke('app:getAuditLogs', filter),
  getPeers: () => ipcRenderer.invoke('app:getPeers'),
  getNetworkInfo: () => ipcRenderer.invoke('app:getNetworkInfo'),
  refreshDiscovery: () => ipcRenderer.invoke('app:refreshDiscovery'),
  connectManualPeer: (address) => ipcRenderer.invoke('app:connectManualPeer', address),
  removeManualPeer: (address) => ipcRenderer.invoke('app:removeManualPeer', address),
  checkNetworkHealth: () => ipcRenderer.invoke('app:checkNetworkHealth'),
  fixNetworkHealth: () => ipcRenderer.invoke('app:fixNetworkHealth'),
  getInstallerInfo: () => ipcRenderer.invoke('app:getInstallerInfo'),
  importInstallerExe: () => ipcRenderer.invoke('app:importInstallerExe'),
  removeOfflinePeer: (uuid) => ipcRenderer.invoke('app:removeOfflinePeer', uuid),

  // Chat & Direct Attachments
  ensureDm: (peerUuid) => ipcRenderer.invoke('chat:ensureDm', peerUuid),
  createGroup: (payload) => ipcRenderer.invoke('chat:createGroup', payload),
  getMessages: (convId, opts) => ipcRenderer.invoke('chat:getMessages', convId, opts),
  sendMessage: (payload) => ipcRenderer.invoke('chat:sendMessage', payload),
  editMessage: (id, body) => ipcRenderer.invoke('chat:editMessage', id, body),
  deleteMessage: (id) => ipcRenderer.invoke('chat:deleteMessage', id),
  toggleReaction: (id, emoji) => ipcRenderer.invoke('chat:toggleReaction', id, emoji),
  sendTyping: (convId, isTyping) => ipcRenderer.invoke('chat:sendTyping', convId, isTyping),
  markRead: (convId) => ipcRenderer.invoke('chat:markRead', convId),
  pickAndSendChatFiles: (convId, caption, replyToId) =>
    ipcRenderer.invoke('chat:pickAndSendChatFiles', convId, caption, replyToId),
  sendDroppedOsPathsToChat: (convId, osPaths, caption, replyToId) =>
    ipcRenderer.invoke('chat:sendDroppedOsPathsToChat', convId, osPaths, caption, replyToId),
  checkVaultSharePermission: (relPath) => ipcRenderer.invoke('chat:checkVaultSharePermission', relPath),
  shareVaultItemToChat: (payload) => ipcRenderer.invoke('chat:shareVaultItemToChat', payload),
  openChatAttachment: (att) => ipcRenderer.invoke('chat:openChatAttachment', att),
  openExtractedFolderEntry: (sessionId, entryRelPath) =>
    ipcRenderer.invoke('chat:openExtractedFolderEntry', sessionId, entryRelPath),
  saveChatAttachmentToPc: (att) => ipcRenderer.invoke('chat:saveChatAttachmentToPc', att),
  saveChatAttachmentToVault: (att, targetVaultFolder, conflictStrategy) =>
    ipcRenderer.invoke('chat:saveChatAttachmentToVault', att, targetVaultFolder, conflictStrategy),
  getBlobDataUrl: (blobId, fileName) => ipcRenderer.invoke('chat:getBlobDataUrl', blobId, fileName),

  // Vault File Manager & Sandbox
  vaultList: (parentPath) => ipcRenderer.invoke('vault:list', parentPath),
  vaultSearch: (query) => ipcRenderer.invoke('vault:search', query),
  vaultCreateFolder: (parentPath, name) => ipcRenderer.invoke('vault:createFolder', parentPath, name),
  vaultRename: (relPath, newName) => ipcRenderer.invoke('vault:rename', relPath, newName),
  vaultMoveOrCopy: (op, sourcePaths, targetParentPath, conflictStrategy) =>
    ipcRenderer.invoke('vault:moveOrCopy', op, sourcePaths, targetParentPath, conflictStrategy),
  vaultDeleteToTrash: (relPath) => ipcRenderer.invoke('vault:deleteToTrash', relPath),
  vaultOpenFile: (relPath, opts) => ipcRenderer.invoke('vault:openFile', relPath, opts),
  vaultCloseSandboxSession: (sessionId) => ipcRenderer.invoke('vault:closeSandboxSession', sessionId),
  vaultGetPreview: (relPath) => ipcRenderer.invoke('vault:getPreview', relPath),
  vaultUploadFromDialog: (targetParentPath) => ipcRenderer.invoke('vault:uploadFromDialog', targetParentPath),
  vaultUploadOsPaths: (osPaths, targetParentPath, conflictStrategy) =>
    ipcRenderer.invoke('vault:uploadOsPaths', osPaths, targetParentPath, conflictStrategy),
  vaultSaveCopyAs: (relPath) => ipcRenderer.invoke('vault:saveCopyAs', relPath),
  vaultUnlockFolder: (relPath, password) => ipcRenderer.invoke('vault:unlockFolder', relPath, password),
  vaultUpdatePermissions: (relPath, payload) => ipcRenderer.invoke('vault:updatePermissions', relPath, payload),
  vaultGetRecoveryInfo: (relPath) => ipcRenderer.invoke('vault:getRecoveryInfo', relPath),
  vaultRecoverPassword: (relPath, payload) => ipcRenderer.invoke('vault:recoverPassword', relPath, payload),
  vaultGetProperties: (relPath) => ipcRenderer.invoke('vault:getProperties', relPath),

  // Trash
  trashList: () => ipcRenderer.invoke('trash:list'),
  trashRestore: (trashId) => ipcRenderer.invoke('trash:restore', trashId),
  trashDeleteForever: (trashId) => ipcRenderer.invoke('trash:deleteForever', trashId),

  // Mobile Companion
  mobileGetPairing: () => ipcRenderer.invoke('mobile:getPairing'),
  mobileRotateToken: () => ipcRenderer.invoke('mobile:rotateToken'),

  // Push events from main process
  onEvent: (eventName, cb) => {
    if (!ALLOWED_EVENTS.has(eventName) || typeof cb !== 'function') {
      return () => {};
    }
    const listener = (_event, payload) => {
      cb(payload);
    };
    ipcRenderer.on(eventName, listener);
    return () => {
      ipcRenderer.removeListener(eventName, listener);
    };
  }
};

contextBridge.exposeInMainWorld('twinsync', api);
contextBridge.exposeInMainWorld('workmesh', api);
