import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Folder,
  FolderOpen,
  FolderPlus,
  File,
  FileText,
  FileSpreadsheet,
  FileImage,
  FileAudio,
  FileVideo,
  FileArchive,
  FileCode,
  Upload,
  Scissors,
  Copy,
  ClipboardPaste,
  Edit3,
  Trash2,
  ArrowUpDown,
  LayoutGrid,
  List,
  Search,
  PanelRight,
  ArrowUp,
  ChevronRight,
  ChevronLeft,
  Lock,
  Unlock,
  Shield,
  ShieldAlert,
  KeyRound,
  HelpCircle,
  Eye,
  Download,
  ExternalLink,
  Send,
  X,
  RefreshCw,
  AlertTriangle,
  History,
  Info,
  Users,
  CheckCircle2,
  SlidersHorizontal
} from 'lucide-react';
import { UserAvatar } from './OnboardingModal';

function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDate(ts, lang) {
  if (!ts) return '—';
  const d = new Date(Number(ts));
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short'
  });
}

function parseUuidArray(val) {
  if (Array.isArray(val)) return val;
  if (typeof val === 'string' && val.trim()) {
    try {
      const parsed = JSON.parse(val);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function getFileVisual(node) {
  if (!node) {
    return {
      Icon: File,
      color: 'text-slate-500 dark:text-slate-400',
      bg: 'bg-slate-100 dark:bg-slate-800'
    };
  }
  if (node.is_dir) {
    return {
      Icon: Folder,
      color: 'text-amber-500 dark:text-amber-400',
      bg: 'bg-amber-50 dark:bg-amber-500/15'
    };
  }
  const name = String(node.name || '').toLowerCase();
  const ext = name.includes('.') ? `.${name.split('.').pop()}` : '';

  if (ext === '.pdf') {
    return {
      Icon: FileText,
      color: 'text-rose-600 dark:text-rose-400',
      bg: 'bg-rose-50 dark:bg-rose-500/15'
    };
  }
  if (['.xls', '.xlsx', '.csv', '.ods'].includes(ext)) {
    return {
      Icon: FileSpreadsheet,
      color: 'text-emerald-600 dark:text-emerald-400',
      bg: 'bg-emerald-50 dark:bg-emerald-500/15'
    };
  }
  if (['.doc', '.docx', '.rtf', '.odt'].includes(ext)) {
    return {
      Icon: FileText,
      color: 'text-blue-600 dark:text-blue-400',
      bg: 'bg-blue-50 dark:bg-blue-500/15'
    };
  }
  if (['.ppt', '.pptx', '.odp'].includes(ext)) {
    return {
      Icon: FileText,
      color: 'text-orange-600 dark:text-orange-400',
      bg: 'bg-orange-50 dark:bg-orange-500/15'
    };
  }
  if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp'].includes(ext)) {
    return {
      Icon: FileImage,
      color: 'text-violet-600 dark:text-violet-400',
      bg: 'bg-violet-50 dark:bg-violet-500/15'
    };
  }
  if (['.mp3', '.wav', '.ogg', '.webm', '.m4a', '.aac'].includes(ext)) {
    return {
      Icon: FileAudio,
      color: 'text-cyan-600 dark:text-cyan-400',
      bg: 'bg-cyan-50 dark:bg-cyan-500/15'
    };
  }
  if (['.mp4', '.mov', '.avi', '.mkv'].includes(ext)) {
    return {
      Icon: FileVideo,
      color: 'text-sky-600 dark:text-sky-400',
      bg: 'bg-sky-50 dark:bg-sky-500/15'
    };
  }
  if (['.zip', '.rar', '.7z', '.tar', '.gz'].includes(ext)) {
    return {
      Icon: FileArchive,
      color: 'text-yellow-600 dark:text-yellow-400',
      bg: 'bg-yellow-50 dark:bg-yellow-500/15'
    };
  }
  if (['.js', '.jsx', '.ts', '.tsx', '.json', '.html', '.css', '.xml', '.yml', '.yaml', '.sql', '.md', '.txt'].includes(ext)) {
    return {
      Icon: FileCode,
      color: 'text-indigo-600 dark:text-indigo-400',
      bg: 'bg-indigo-50 dark:bg-indigo-500/15'
    };
  }
  return {
    Icon: File,
    color: 'text-slate-600 dark:text-slate-300',
    bg: 'bg-slate-100 dark:bg-slate-800'
  };
}

function getParentRel(relPath) {
  const clean = String(relPath || '').replace(/^\/+|\/+$/g, '');
  if (!clean) return '';
  const idx = clean.lastIndexOf('/');
  return idx === -1 ? '' : clean.slice(0, idx);
}

function PresenceBadge({ entries = [], t }) {
  if (!entries || entries.length === 0) return null;
  const hasEditor = entries.some((e) => e.mode === 'edit');

  return (
    <div className="relative group/presence shrink-0" onClick={(e) => e.stopPropagation()}>
      <span
        className={`w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center shadow-sm ring-2 ring-white dark:ring-slate-900 cursor-default ${
          hasEditor
            ? 'bg-emerald-500 text-white'
            : 'bg-sky-500 text-white'
        }`}
      >
        {entries.length}
      </span>

      <div className="hidden group-hover/presence:block absolute z-40 bottom-full mb-1.5 end-0 w-52 rounded-xl bg-slate-900 dark:bg-slate-800 text-white border border-slate-700 shadow-xl p-2.5 pointer-events-none">
        <div className="text-[10px] font-bold text-slate-300 mb-1.5">
          {t('vaultActiveUsers')}
        </div>
        <div className="space-y-1">
          {entries.map((entry) => (
            <div
              key={`${entry.peerUuid}-${entry.mode}`}
              className="flex items-center justify-between gap-2 text-[11px]"
            >
              <span className="truncate font-medium">
                {entry.displayName || t('unknown')}
              </span>
              <span
                className={`px-1.5 py-0.5 rounded text-[9px] font-bold shrink-0 ${
                  entry.mode === 'edit'
                    ? 'bg-emerald-500/25 text-emerald-300'
                    : 'bg-sky-500/25 text-sky-300'
                }`}
              >
                {entry.mode === 'edit'
                  ? t('vaultEditingNow')
                  : t('vaultViewingNow')}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function FileManager({
  t,
  lang,
  identity,
  peers = [],
  conversations = [],
  presenceMap = {},
  openSessions = [],
  deepLinkTarget = null,
  compact = false,
  onToast,
  onSentToChat
}) {
  const [currentPath, setCurrentPath] = useState('');
  const [items, setItems] = useState([]);
  const [parentAcl, setParentAcl] = useState(null);
  const [loading, setLoading] = useState(false);

  const [selectedRelPath, setSelectedRelPath] = useState(null);
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'list'
  const [sortBy, setSortBy] = useState('name'); // 'name' | 'size' | 'date'
  const [sortDir, setSortDir] = useState('asc'); // 'asc' | 'desc'

  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [searchResults, setSearchResults] = useState(null);

  const [showPreviewPane, setShowPreviewPane] = useState(!compact);
  const [previewData, setPreviewData] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  const [clipboard, setClipboard] = useState(null); // { op: 'cut'|'copy', paths: [] }
  const [localPresenceMap, setLocalPresenceMap] = useState(presenceMap || {});
  const [localSessions, setLocalSessions] = useState(openSessions || []);

  // Drag states
  const [osDropActive, setOsDropActive] = useState(false);
  const [dropTargetPath, setDropTargetPath] = useState(null);
  const dragCounterRef = useRef(0);

  // Context Menu
  const [contextMenu, setContextMenu] = useState(null); // { x, y, node | null }

  // Modals
  const [newFolderModal, setNewFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  const [renameModal, setRenameModal] = useState(null); // { node, value }
  const [unlockModal, setUnlockModal] = useState(null); // { blockingPath, blockingName, password, error, pendingAction, showRecovery, recoveryInfo, method, answerOrKey, newPassword, recovering }
  const [coeditModal, setCoeditModal] = useState(null); // { relPath, editors }
  const [liveEditBlockedModal, setLiveEditBlockedModal] = useState(null); // { editors }
  const [conflictModal, setConflictModal] = useState(null); // { kind: 'upload'|'moveCopy', osPaths?, op?, sourcePaths?, targetParentPath, conflicts }
  const [permModal, setPermModal] = useState(null); // { node, permMode, password, clearPassword, allowedEditors, allowedViewers, saving }
  const [propsModal, setPropsModal] = useState(null); // { loading, node, ownerName, effectiveAcl, auditLogs }
  const [sendChatModal, setSendChatModal] = useState(null); // { node, isProtected, mode, selectedTargetType, targetConvId, targetPeerUuid, caption, sending }

  const containerRef = useRef(null);
  const currentPathRef = useRef(currentPath);
  currentPathRef.current = currentPath;
  const selectedRelRef = useRef(selectedRelPath);
  selectedRelRef.current = selectedRelPath;

  const isRtl = lang === 'ar';
  const BreadcrumbArrow = isRtl ? ChevronLeft : ChevronRight;

  // Sync props into local live mirrors
  useEffect(() => {
    setLocalPresenceMap(presenceMap || {});
  }, [presenceMap]);

  useEffect(() => {
    setLocalSessions(openSessions || []);
  }, [openSessions]);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery.trim());
    }, 240);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const loadDirectory = useCallback(
    async (targetPath, opts = {}) => {
      if (!window.workmesh?.vaultList) return null;
      setLoading(true);
      try {
        const res = await window.workmesh.vaultList(targetPath || '');
        if (res?.locked && res?.blockingAncestor) {
          setLoading(false);
          setUnlockModal({
            blockingPath: res.blockingAncestor.relPath,
            blockingName: res.blockingAncestor.name,
            password: '',
            error: '',
            pendingAction: opts.pendingAction || { type: 'navigate', relPath: targetPath },
            showRecovery: false,
            recoveryInfo: null,
            method: 'security_qa',
            answerOrKey: '',
            newPassword: '',
            recovering: false
          });
          return res;
        }
        setCurrentPath(targetPath || '');
        setParentAcl(res?.parentAcl || null);
        setItems(Array.isArray(res) ? res : res?.items || []);
        setSearchResults(null);
        return res;
      } catch (err) {
        onToast?.(err?.message || t('error'), 'error');
        return null;
      } finally {
        setLoading(false);
      }
    },
    [onToast, t]
  );

  // Initial load
  useEffect(() => {
    loadDirectory('');
  }, [loadDirectory]);

  // Search execution
  useEffect(() => {
    if (!debouncedSearch) {
      setSearchResults(null);
      return;
    }
    let active = true;
    setLoading(true);
    window.workmesh
      .vaultSearch(debouncedSearch)
      .then((res) => {
        if (!active) return;
        const list = Array.isArray(res) ? res : res?.items || [];
        setSearchResults(list);
      })
      .catch((err) => {
        if (active) onToast?.(err?.message || t('error'), 'error');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [debouncedSearch, onToast, t]);

  const loadPreview = useCallback(async (relPath) => {
    if (!relPath || !window.workmesh?.vaultGetPreview) {
      setPreviewData(null);
      return;
    }
    setLoadingPreview(true);
    try {
      const res = await window.workmesh.vaultGetPreview(relPath);
      setPreviewData(res || null);
    } catch {
      setPreviewData(null);
    } finally {
      setLoadingPreview(false);
    }
  }, []);

  useEffect(() => {
    if (showPreviewPane && selectedRelPath) {
      loadPreview(selectedRelPath);
    } else if (!selectedRelPath) {
      setPreviewData(null);
    }
  }, [showPreviewPane, selectedRelPath, loadPreview]);

  // Real-time event subscriptions
  useEffect(() => {
    if (!window.workmesh?.onEvent) return undefined;
    const unsubs = [];

    unsubs.push(
      window.workmesh.onEvent('vault:changed', () => {
        loadDirectory(currentPathRef.current);
        if (selectedRelRef.current && showPreviewPane) {
          loadPreview(selectedRelRef.current);
        }
      })
    );

    unsubs.push(
      window.workmesh.onEvent('vault:remote-updated', (payload) => {
        loadDirectory(currentPathRef.current);
        if (
          payload?.relPath &&
          payload.relPath === selectedRelRef.current &&
          showPreviewPane
        ) {
          loadPreview(selectedRelRef.current);
        }
      })
    );

    unsubs.push(
      window.workmesh.onEvent('presence:changed', (payload) => {
        if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
          setLocalPresenceMap(payload.presenceMap || payload);
        }
      })
    );

    unsubs.push(
      window.workmesh.onEvent('sandbox:sessions-changed', (sessions) => {
        if (Array.isArray(sessions)) {
          setLocalSessions(sessions);
        }
      })
    );

    return () => {
      for (const unsub of unsubs) {
        if (typeof unsub === 'function') unsub();
      }
    };
  }, [loadDirectory, loadPreview, showPreviewPane]);

  // Handle Deep-Link Target navigation from Chat
  useEffect(() => {
    const targetRel =
      typeof deepLinkTarget === 'string'
        ? deepLinkTarget
        : deepLinkTarget?.relPath;
    if (!targetRel) return;

    let active = true;
    async function navigateDeepLink() {
      setSearchQuery('');
      setDebouncedSearch('');
      setSearchResults(null);

      const parentRel = getParentRel(targetRel);
      const res = await loadDirectory(parentRel, {
        pendingAction: { type: 'deeplink', relPath: targetRel }
      });
      if (!active || !res || res.locked) return;

      const list = Array.isArray(res) ? res : res?.items || [];
      const found = list.find((item) => item.rel_path === targetRel);
      if (found) {
        setSelectedRelPath(found.rel_path);
        if (found.isLocked && found.effectiveAcl?.blockingAncestor) {
          setUnlockModal({
            blockingPath: found.effectiveAcl.blockingAncestor.relPath,
            blockingName: found.effectiveAcl.blockingAncestor.name,
            password: '',
            error: '',
            pendingAction: { type: 'deeplink', relPath: targetRel },
            showRecovery: false,
            recoveryInfo: null,
            method: 'security_qa',
            answerOrKey: '',
            newPassword: '',
            recovering: false
          });
        } else if (found.is_dir) {
          await loadDirectory(found.rel_path, {
            pendingAction: { type: 'deeplink', relPath: targetRel }
          });
        } else {
          setShowPreviewPane(true);
          loadPreview(found.rel_path);
        }
      } else {
        // Fallback: select directly and try preview
        setSelectedRelPath(targetRel);
        setShowPreviewPane(true);
        loadPreview(targetRel);
      }
    }
    navigateDeepLink();
    return () => {
      active = false;
    };
  }, [deepLinkTarget, loadDirectory, loadPreview]);

  // Close context menu on outside click or Escape
  useEffect(() => {
    if (!contextMenu) return undefined;
    const close = () => setContextMenu(null);
    const onKey = (e) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('click', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [contextMenu]);

  const activeItems = useMemo(() => {
    const raw = searchResults !== null ? searchResults : items;
    const copy = [...raw];
    copy.sort((a, b) => {
      const aDir = a.is_dir ? 0 : 1;
      const bDir = b.is_dir ? 0 : 1;
      if (aDir !== bDir) return aDir - bDir;

      let cmp = 0;
      if (sortBy === 'size') {
        cmp = (Number(a.size) || 0) - (Number(b.size) || 0);
      } else if (sortBy === 'date') {
        cmp = (Number(a.updated_at) || 0) - (Number(b.updated_at) || 0);
      } else {
        cmp = String(a.name || '').localeCompare(String(b.name || ''), lang);
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return copy;
  }, [searchResults, items, sortBy, sortDir, lang]);

  const selectedNode = useMemo(
    () => activeItems.find((n) => n.rel_path === selectedRelPath) || null,
    [activeItems, selectedRelPath]
  );

  // Actions
  const handleOpenItem = useCallback(
    async (node, opts = {}) => {
      if (!node) return;
      if (node.is_dir) {
        setSearchQuery('');
        setDebouncedSearch('');
        setSearchResults(null);
        await loadDirectory(node.rel_path, {
          pendingAction: { type: 'navigate', relPath: node.rel_path }
        });
        return;
      }

      try {
        const res = await window.workmesh.vaultOpenFile(node.rel_path, opts);
        if (res?.ok) {
          onToast?.(`${t('open')}: ${res.fileName || node.name}`, 'info');
          return;
        }
        if (res?.code === 'LOCKED' && res?.blockingAncestor) {
          setUnlockModal({
            blockingPath: res.blockingAncestor.relPath,
            blockingName: res.blockingAncestor.name,
            password: '',
            error: '',
            pendingAction: { type: 'open', node, opts },
            showRecovery: false,
            recoveryInfo: null,
            method: 'security_qa',
            answerOrKey: '',
            newPassword: '',
            recovering: false
          });
          return;
        }
        if (res?.code === 'COEDIT_WARNING') {
          setCoeditModal({
            relPath: node.rel_path,
            name: node.name,
            editors: res.editors || []
          });
          return;
        }
        throw new Error(res?.error || t('error'));
      } catch (err) {
        onToast?.(err?.message || t('error'), 'error');
      }
    },
    [loadDirectory, onToast, t]
  );

  const handleCreateFolder = async (e) => {
    e.preventDefault();
    const name = newFolderName.trim();
    if (!name) return;
    try {
      const res = await window.workmesh.vaultCreateFolder(currentPath, name);
      if (res && res.ok === false) {
        throw new Error(res.error || t('error'));
      }
      setNewFolderModal(false);
      setNewFolderName('');
      await loadDirectory(currentPath);
    } catch (err) {
      onToast?.(err?.message || t('error'), 'error');
    }
  };

  const handleRenameSubmit = async (e) => {
    e.preventDefault();
    if (!renameModal?.node) return;
    const nextName = renameModal.value.trim();
    if (!nextName || nextName === renameModal.node.name) {
      setRenameModal(null);
      return;
    }
    try {
      const res = await window.workmesh.vaultRename(
        renameModal.node.rel_path,
        nextName
      );
      if (res && res.ok === false) {
        if (res.code === 'FILE_LOCKED_LIVE_EDIT') {
          setRenameModal(null);
          setLiveEditBlockedModal({ editors: res.editors || [] });
          return;
        }
        throw new Error(res.error || t('error'));
      }
      setRenameModal(null);
      if (res?.node?.rel_path) setSelectedRelPath(res.node.rel_path);
      await loadDirectory(currentPath);
    } catch (err) {
      onToast?.(err?.message || t('error'), 'error');
    }
  };

  const handleDeleteNode = useCallback(
    async (node) => {
      if (!node) return;
      try {
        const res = await window.workmesh.vaultDeleteToTrash(node.rel_path);
        if (res && res.ok === false) {
          if (res.code === 'FILE_LOCKED_LIVE_EDIT') {
            setLiveEditBlockedModal({ editors: res.editors || [] });
            return;
          }
          throw new Error(res.error || t('error'));
        }
        if (selectedRelPath === node.rel_path) {
          setSelectedRelPath(null);
          setPreviewData(null);
        }
        onToast?.(t('success'), 'success');
        await loadDirectory(currentPath);
      } catch (err) {
        onToast?.(err?.message || t('error'), 'error');
      }
    },
    [currentPath, loadDirectory, onToast, selectedRelPath, t]
  );

  const handleMoveOrCopy = useCallback(
    async (op, sourcePaths, targetParentPath, strategy = 'prompt') => {
      try {
        const res = await window.workmesh.vaultMoveOrCopy(
          op,
          sourcePaths,
          targetParentPath,
          strategy
        );
        if (res?.conflict) {
          setConflictModal({
            kind: 'moveCopy',
            op,
            sourcePaths,
            targetParentPath,
            conflicts: res.conflicts || []
          });
          return;
        }
        if (res && res.ok === false) {
          if (res.code === 'FILE_LOCKED_LIVE_EDIT') {
            setLiveEditBlockedModal({ editors: res.editors || [] });
            return;
          }
          throw new Error(res.error || t('error'));
        }
        if (op === 'cut' || op === 'move') {
          setClipboard(null);
        }
        setConflictModal(null);
        onToast?.(t('success'), 'success');
        await loadDirectory(currentPathRef.current);
      } catch (err) {
        onToast?.(err?.message || t('error'), 'error');
      }
    },
    [onToast, loadDirectory, t]
  );

  const handlePaste = useCallback(() => {
    if (!clipboard?.paths?.length) return;
    handleMoveOrCopy(clipboard.op, clipboard.paths, currentPath, 'prompt');
  }, [clipboard, currentPath, handleMoveOrCopy]);

  const handleUploadFromDialog = async () => {
    try {
      const res = await window.workmesh.vaultUploadFromDialog(currentPath);
      if (res?.canceled) return;
      if (res?.conflict) {
        setConflictModal({
          kind: 'upload',
          osPaths: res.osPaths || [],
          targetParentPath: currentPath,
          conflicts: res.conflicts || []
        });
        return;
      }
      if (res && res.ok === false) {
        throw new Error(res.error || t('error'));
      }
      onToast?.(t('success'), 'success');
      await loadDirectory(currentPath);
    } catch (err) {
      onToast?.(err?.message || t('error'), 'error');
    }
  };

  const handleUploadOsPaths = async (osPaths, targetFolder, strategy = 'prompt') => {
    try {
      const res = await window.workmesh.vaultUploadOsPaths(
        osPaths,
        targetFolder,
        strategy
      );
      if (res?.conflict) {
        setConflictModal({
          kind: 'upload',
          osPaths,
          targetParentPath: targetFolder,
          conflicts: res.conflicts || []
        });
        return;
      }
      if (res && res.ok === false) {
        throw new Error(res.error || t('error'));
      }
      setConflictModal(null);
      onToast?.(t('success'), 'success');
      await loadDirectory(currentPathRef.current);
    } catch (err) {
      onToast?.(err?.message || t('error'), 'error');
    }
  };

  const handleSaveCopyAs = async (node) => {
    if (!node) return;
    try {
      const res = await window.workmesh.vaultSaveCopyAs(node.rel_path);
      if (res?.canceled) return;
      if (res?.code === 'LOCKED' && res?.blockingAncestor) {
        setUnlockModal({
          blockingPath: res.blockingAncestor.relPath,
          blockingName: res.blockingAncestor.name,
          password: '',
          error: '',
          pendingAction: { type: 'saveCopy', node },
          showRecovery: false,
          recoveryInfo: null,
          method: 'security_qa',
          answerOrKey: '',
          newPassword: '',
          recovering: false
        });
        return;
      }
      if (res && res.ok === false) {
        throw new Error(res.error || t('error'));
      }
      onToast?.(t('success'), 'success');
    } catch (err) {
      onToast?.(err?.message || t('error'), 'error');
    }
  };

  const handleOpenPermissions = (node) => {
    if (!node || node.owner_uuid !== identity?.uuid) {
      onToast?.(t('permOwnerOnly'), 'warning');
      return;
    }
    setPermModal({
      node,
      permMode: node.perm_mode || 'public',
      password: '',
      clearPassword: false,
      allowedEditors: parseUuidArray(node.allowed_editors),
      allowedViewers: parseUuidArray(node.allowed_viewers),
      saving: false
    });
  };

  const handleSavePermissions = async (e) => {
    e.preventDefault();
    if (!permModal?.node) return;
    setPermModal((prev) => (prev ? { ...prev, saving: true } : null));
    try {
      const res = await window.workmesh.vaultUpdatePermissions(
        permModal.node.rel_path,
        {
          permMode: permModal.permMode,
          password: permModal.password || undefined,
          clearPassword: permModal.clearPassword,
          allowedEditors: permModal.allowedEditors,
          allowedViewers: permModal.allowedViewers
        }
      );
      if (res && res.ok === false) {
        throw new Error(res.error || t('error'));
      }
      setPermModal(null);
      onToast?.(t('permUpdated'), 'success');
      await loadDirectory(currentPath);
    } catch (err) {
      setPermModal((prev) => (prev ? { ...prev, saving: false } : null));
      onToast?.(err?.message || t('error'), 'error');
    }
  };

  const handleOpenProperties = async (node) => {
    if (!node) return;
    setPropsModal({ loading: true, node, ownerName: '', effectiveAcl: null, auditLogs: [] });
    try {
      const res = await window.workmesh.vaultGetProperties(node.rel_path);
      if (res?.code === 'LOCKED' && res?.blockingAncestor) {
        setPropsModal(null);
        setUnlockModal({
          blockingPath: res.blockingAncestor.relPath,
          blockingName: res.blockingAncestor.name,
          password: '',
          error: '',
          pendingAction: { type: 'properties', node },
          showRecovery: false,
          recoveryInfo: null,
          method: 'security_qa',
          answerOrKey: '',
          newPassword: '',
          recovering: false
        });
        return;
      }
      if (res && res.ok === false) {
        throw new Error(res.error || t('error'));
      }
      setPropsModal({
        loading: false,
        node: res.node || node,
        ownerName: res.ownerName || '',
        effectiveAcl: res.effectiveAcl || node.effectiveAcl,
        auditLogs: res.auditLogs || []
      });
    } catch (err) {
      setPropsModal(null);
      onToast?.(err?.message || t('error'), 'error');
    }
  };

  const handleOpenSendToChat = async (node) => {
    if (!node) return;
    try {
      const permRes = await window.workmesh.checkVaultSharePermission(node.rel_path);
      setSendChatModal({
        node,
        isProtected: Boolean(permRes?.isProtected ?? node.isProtected),
        mode: 'deeplink',
        targetConvId: conversations[0]?.id || '',
        targetPeerUuid: '',
        caption: '',
        sending: false
      });
    } catch (err) {
      onToast?.(err?.message || t('error'), 'error');
    }
  };

  const handleConfirmSendToChat = async (e) => {
    e.preventDefault();
    if (!sendChatModal?.node) return;
    setSendChatModal((prev) => (prev ? { ...prev, sending: true } : null));

    try {
      let convId = sendChatModal.targetConvId;
      if (!convId && sendChatModal.targetPeerUuid) {
        const dmRes = await window.workmesh.ensureDm(sendChatModal.targetPeerUuid);
        convId = dmRes?.conversation?.id || dmRes?.id || '';
      }
      if (!convId) {
        throw new Error(t('chatSelectPeer'));
      }

      const res = await window.workmesh.shareVaultItemToChat({
        conversationId: convId,
        relPath: sendChatModal.node.rel_path,
        mode: sendChatModal.isProtected ? sendChatModal.mode : 'deeplink',
        caption: sendChatModal.caption.trim()
      });
      if (res && res.ok === false) {
        throw new Error(res.error || t('error'));
      }
      setSendChatModal(null);
      onToast?.(t('success'), 'success');
      onSentToChat?.(convId);
    } catch (err) {
      setSendChatModal((prev) => (prev ? { ...prev, sending: false } : null));
      onToast?.(err?.message || t('error'), 'error');
    }
  };

  // Unlock & Offline Password Recovery Handlers
  const completePendingAfterUnlock = async (pendingAction) => {
    if (!pendingAction) {
      await loadDirectory(currentPathRef.current);
      return;
    }
    if (pendingAction.type === 'navigate') {
      await loadDirectory(pendingAction.relPath);
    } else if (pendingAction.type === 'open') {
      await loadDirectory(currentPathRef.current);
      await handleOpenItem(pendingAction.node, pendingAction.opts || {});
    } else if (pendingAction.type === 'preview') {
      await loadDirectory(currentPathRef.current);
      await loadPreview(pendingAction.relPath);
    } else if (pendingAction.type === 'saveCopy') {
      await handleSaveCopyAs(pendingAction.node);
    } else if (pendingAction.type === 'properties') {
      await handleOpenProperties(pendingAction.node);
    } else if (pendingAction.type === 'deeplink') {
      const parentRel = getParentRel(pendingAction.relPath);
      const res = await loadDirectory(parentRel);
      const list = Array.isArray(res) ? res : res?.items || [];
      const found = list.find((n) => n.rel_path === pendingAction.relPath);
      if (found) {
        setSelectedRelPath(found.rel_path);
        if (found.is_dir) {
          await loadDirectory(found.rel_path);
        } else {
          setShowPreviewPane(true);
          loadPreview(found.rel_path);
        }
      }
    }
  };

  const handleSubmitUnlock = async (e) => {
    e.preventDefault();
    if (!unlockModal?.blockingPath) return;
    try {
      const res = await window.workmesh.vaultUnlockFolder(
        unlockModal.blockingPath,
        unlockModal.password
      );
      if (!res?.ok) {
        setUnlockModal((prev) =>
          prev ? { ...prev, error: t('unlockWrongPassword') } : null
        );
        return;
      }
      const pending = unlockModal.pendingAction;
      setUnlockModal(null);
      await completePendingAfterUnlock(pending);
    } catch {
      setUnlockModal((prev) =>
        prev ? { ...prev, error: t('unlockWrongPassword') } : null
      );
    }
  };

  const handleOpenRecovery = async () => {
    if (!unlockModal?.blockingPath) return;
    try {
      const info = await window.workmesh.vaultGetRecoveryInfo(
        unlockModal.blockingPath
      );
      setUnlockModal((prev) =>
        prev
          ? {
              ...prev,
              showRecovery: true,
              recoveryInfo: info,
              error: '',
              method: info?.hasSecurityQA ? 'security_qa' : 'recovery_key'
            }
          : null
      );
    } catch (err) {
      onToast?.(err?.message || t('error'), 'error');
    }
  };

  const handleSubmitRecovery = async (e) => {
    e.preventDefault();
    if (!unlockModal?.blockingPath) return;
    setUnlockModal((prev) =>
      prev ? { ...prev, recovering: true, error: '' } : null
    );
    try {
      const res = await window.workmesh.vaultRecoverPassword(
        unlockModal.blockingPath,
        {
          method: unlockModal.method,
          answerOrKey: unlockModal.answerOrKey,
          newPassword: unlockModal.newPassword
        }
      );
      if (!res?.ok) {
        setUnlockModal((prev) =>
          prev
            ? {
                ...prev,
                recovering: false,
                error: t('recoverFailed')
              }
            : null
        );
        return;
      }
      if (unlockModal.newPassword) {
        await window.workmesh.vaultUnlockFolder(
          unlockModal.blockingPath,
          unlockModal.newPassword
        );
      }
      const pending = unlockModal.pendingAction;
      setUnlockModal(null);
      onToast?.(t('recoverSuccess'), 'success');
      await completePendingAfterUnlock(pending);
    } catch (err) {
      setUnlockModal((prev) =>
        prev
          ? {
              ...prev,
              recovering: false,
              error: err?.message || t('recoverFailed')
            }
          : null
      );
    }
  };

  // Keyboard shortcuts (Ctrl+X, Ctrl+C, Ctrl+V, F2, Delete)
  useEffect(() => {
    const onKeyDown = (e) => {
      const tag = String(e.target?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if (
        newFolderModal ||
        renameModal ||
        unlockModal ||
        coeditModal ||
        permModal ||
        propsModal ||
        sendChatModal ||
        conflictModal
      ) {
        return;
      }

      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'x' && selectedNode) {
        e.preventDefault();
        setClipboard({ op: 'cut', paths: [selectedNode.rel_path] });
        onToast?.(`${t('vaultCut')}: ${selectedNode.name}`, 'info');
      } else if (mod && e.key.toLowerCase() === 'c' && selectedNode) {
        e.preventDefault();
        setClipboard({ op: 'copy', paths: [selectedNode.rel_path] });
        onToast?.(`${t('vaultCopy')}: ${selectedNode.name}`, 'info');
      } else if (mod && e.key.toLowerCase() === 'v' && clipboard?.paths?.length) {
        e.preventDefault();
        handlePaste();
      } else if (e.key === 'F2' && selectedNode) {
        e.preventDefault();
        setRenameModal({ node: selectedNode, value: selectedNode.name });
      } else if (e.key === 'Delete' && selectedNode) {
        e.preventDefault();
        handleDeleteNode(selectedNode);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    selectedNode,
    clipboard,
    handlePaste,
    handleDeleteNode,
    newFolderModal,
    renameModal,
    unlockModal,
    coeditModal,
    permModal,
    propsModal,
    sendChatModal,
    conflictModal,
    onToast,
    t
  ]);

  // Explorer Drag & Drop (OS files upload + Vault internal drag-to-folder/breadcrumb)
  const handleExplorerDragEnter = (e) => {
    const types = Array.from(e.dataTransfer?.types || []);
    if (types.includes('Files')) {
      e.preventDefault();
      dragCounterRef.current += 1;
      setOsDropActive(true);
    }
  };

  const handleExplorerDragOver = (e) => {
    const types = Array.from(e.dataTransfer?.types || []);
    if (types.includes('Files')) {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    }
  };

  const handleExplorerDragLeave = (e) => {
    const types = Array.from(e.dataTransfer?.types || []);
    if (types.includes('Files')) {
      e.preventDefault();
      dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
      if (dragCounterRef.current === 0) setOsDropActive(false);
    }
  };

  const handleExplorerDrop = async (e) => {
    dragCounterRef.current = 0;
    setOsDropActive(false);
    setDropTargetPath(null);

    const osPaths = Array.from(e.dataTransfer?.files || [])
      .map((f) => f.path)
      .filter(Boolean);
    if (osPaths.length > 0) {
      e.preventDefault();
      e.stopPropagation();
      await handleUploadOsPaths(osPaths, currentPath, 'prompt');
    }
  };

  const handleDropOnVaultFolder = async (e, targetFolderRelPath) => {
    e.preventDefault();
    e.stopPropagation();
    setDropTargetPath(null);
    setOsDropActive(false);

    const vaultRaw = e.dataTransfer?.getData('application/x-workmesh-vault');
    if (vaultRaw) {
      try {
        const dragged = JSON.parse(vaultRaw);
        if (!dragged?.relPath || dragged.relPath === targetFolderRelPath) return;
        await handleMoveOrCopy('move', [dragged.relPath], targetFolderRelPath, 'prompt');
      } catch {
        // ignore invalid drag data
      }
      return;
    }

    const osPaths = Array.from(e.dataTransfer?.files || [])
      .map((f) => f.path)
      .filter(Boolean);
    if (osPaths.length > 0) {
      await handleUploadOsPaths(osPaths, targetFolderRelPath, 'prompt');
    }
  };

  const openContextMenuAt = (e, node = null) => {
    e.preventDefault();
    e.stopPropagation();
    if (node) setSelectedRelPath(node.rel_path);
    const menuWidth = 228;
    const menuHeight = node ? 340 : 160;
    const x = Math.min(e.clientX, Math.max(8, window.innerWidth - menuWidth - 12));
    const y = Math.min(e.clientY, Math.max(8, window.innerHeight - menuHeight - 12));
    setContextMenu({ x, y, node });
  };

  const handleCycleSort = (field) => {
    if (sortBy === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      setSortDir('asc');
    }
  };

  const breadcrumbSegments = useMemo(
    () => (currentPath ? currentPath.split('/').filter(Boolean) : []),
    [currentPath]
  );

  return (
    <div
      ref={containerRef}
      className="flex-1 min-w-0 h-full flex flex-col bg-slate-50 dark:bg-slate-950 overflow-hidden relative select-none"
    >
      {/* TOP WINDOWS 11 FLUENT EXPLORER TOOLBAR */}
      <header className="px-3 py-2.5 bg-white dark:bg-slate-900 border-b border-slate-200/80 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              setNewFolderName('');
              setNewFolderModal(true);
            }}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition"
          >
            <FolderPlus className="w-3.5 h-3.5" strokeWidth={1.5} />
            <span>{t('vaultNewFolder')}</span>
          </button>

          <button
            type="button"
            onClick={handleUploadFromDialog}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition"
          >
            <Upload className="w-3.5 h-3.5" strokeWidth={1.5} />
            <span>{t('vaultUpload')}</span>
          </button>

          <div className="h-5 w-px bg-slate-200 dark:bg-slate-700 mx-0.5" />

          <button
            type="button"
            disabled={!selectedNode}
            onClick={() =>
              selectedNode &&
              setClipboard({ op: 'cut', paths: [selectedNode.rel_path] })
            }
            title={`${t('vaultCut')} (Ctrl+X)`}
            className="p-1.5 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-35 transition"
          >
            <Scissors className="w-4 h-4" strokeWidth={1.5} />
          </button>

          <button
            type="button"
            disabled={!selectedNode}
            onClick={() =>
              selectedNode &&
              setClipboard({ op: 'copy', paths: [selectedNode.rel_path] })
            }
            title={`${t('vaultCopy')} (Ctrl+C)`}
            className="p-1.5 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-35 transition"
          >
            <Copy className="w-4 h-4" strokeWidth={1.5} />
          </button>

          <button
            type="button"
            disabled={!clipboard?.paths?.length}
            onClick={handlePaste}
            title={`${t('vaultPaste')} (Ctrl+V)`}
            className="p-1.5 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-35 transition"
          >
            <ClipboardPaste className="w-4 h-4" strokeWidth={1.5} />
          </button>

          <button
            type="button"
            disabled={!selectedNode}
            onClick={() =>
              selectedNode &&
              setRenameModal({ node: selectedNode, value: selectedNode.name })
            }
            title={`${t('vaultRename')} (F2)`}
            className="p-1.5 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-35 transition"
          >
            <Edit3 className="w-4 h-4" strokeWidth={1.5} />
          </button>

          <button
            type="button"
            disabled={!selectedNode}
            onClick={() => selectedNode && handleDeleteNode(selectedNode)}
            title={`${t('vaultDelete')} (Del)`}
            className="p-1.5 rounded-xl text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/15 disabled:opacity-35 transition"
          >
            <Trash2 className="w-4 h-4" strokeWidth={1.5} />
          </button>
        </div>

        {/* Right Controls: Sort, View, Search, Preview Toggle */}
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Sort Selector */}
          <div className="inline-flex items-center rounded-xl bg-slate-100 dark:bg-slate-800 p-0.5 border border-slate-200/70 dark:border-slate-700/70 text-[11px]">
            {[
              { id: 'name', label: t('vaultSortName') },
              { id: 'size', label: t('vaultSortSize') },
              { id: 'date', label: t('vaultSortDate') }
            ].map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => handleCycleSort(opt.id)}
                className={`px-2 py-1 rounded-lg font-medium flex items-center gap-1 transition ${
                  sortBy === opt.id
                    ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
                }`}
              >
                <span>{opt.label}</span>
                {sortBy === opt.id && (
                  <ArrowUpDown className="w-3 h-3" strokeWidth={1.5} />
                )}
              </button>
            ))}
          </div>

          {/* Grid / List Toggle */}
          <div className="inline-flex items-center rounded-xl bg-slate-100 dark:bg-slate-800 p-0.5 border border-slate-200/70 dark:border-slate-700/70">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              title={t('vaultViewGrid')}
              className={`p-1.5 rounded-lg transition ${
                viewMode === 'grid'
                  ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" strokeWidth={1.5} />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              title={t('vaultViewList')}
              className={`p-1.5 rounded-lg transition ${
                viewMode === 'list'
                  ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              <List className="w-3.5 h-3.5" strokeWidth={1.5} />
            </button>
          </div>

          {/* Search */}
          <div className="relative">
            <Search
              className="w-3.5 h-3.5 text-slate-400 absolute start-2.5 top-1/2 -translate-y-1/2"
              strokeWidth={1.5}
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('vaultSearchPlaceholder')}
              className="w-40 sm:w-48 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 ps-8 pe-7 py-1.5 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute end-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3 h-3" strokeWidth={1.5} />
              </button>
            )}
          </div>

          {/* Preview Pane Toggle */}
          <button
            type="button"
            onClick={() => setShowPreviewPane((p) => !p)}
            title={t('vaultPreviewPane')}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold border transition ${
              showPreviewPane
                ? 'bg-indigo-50 dark:bg-indigo-500/15 border-indigo-300 dark:border-indigo-500/40 text-indigo-700 dark:text-indigo-300'
                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
            }`}
          >
            <PanelRight className="w-3.5 h-3.5" strokeWidth={1.5} />
            {!compact && <span>{t('vaultPreviewPane')}</span>}
          </button>
        </div>
      </header>

      {/* INTERACTIVE BREADCRUMBS (Supports Click + Drag-Drop Move!) */}
      <nav className="px-4 py-2 bg-slate-100/80 dark:bg-slate-900/60 border-b border-slate-200/80 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center flex-wrap gap-1 min-w-0">
          <button
            type="button"
            disabled={!currentPath}
            onClick={() => loadDirectory(getParentRel(currentPath))}
            title={t('back')}
            className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 disabled:opacity-35 transition me-1"
          >
            <ArrowUp className="w-3.5 h-3.5" strokeWidth={1.5} />
          </button>

          <button
            type="button"
            onClick={() => {
              setSearchQuery('');
              setSearchResults(null);
              loadDirectory('');
            }}
            onDragOver={(e) => {
              if (e.dataTransfer?.types?.includes('application/x-workmesh-vault')) {
                e.preventDefault();
                if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
                setDropTargetPath('__root__');
              }
            }}
            onDragLeave={() => setDropTargetPath(null)}
            onDrop={(e) => handleDropOnVaultFolder(e, '')}
            className={`px-2 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
              dropTargetPath === '__root__'
                ? 'bg-indigo-100 dark:bg-indigo-500/30 text-indigo-700 dark:text-indigo-200 ring-2 ring-indigo-500'
                : 'text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-800'
            }`}
          >
            <FolderOpen className="w-3.5 h-3.5 text-amber-500" strokeWidth={1.5} />
            <span>{t('vaultRoot')}</span>
          </button>

          {breadcrumbSegments.map((seg, idx) => {
            const segPath = breadcrumbSegments.slice(0, idx + 1).join('/');
            const isDrop = dropTargetPath === segPath;
            return (
              <React.Fragment key={segPath}>
                <BreadcrumbArrow
                  className="w-3.5 h-3.5 text-slate-400 shrink-0"
                  strokeWidth={1.5}
                />
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setSearchResults(null);
                    loadDirectory(segPath);
                  }}
                  onDragOver={(e) => {
                    if (e.dataTransfer?.types?.includes('application/x-workmesh-vault')) {
                      e.preventDefault();
                      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
                      setDropTargetPath(segPath);
                    }
                  }}
                  onDragLeave={() => setDropTargetPath(null)}
                  onDrop={(e) => handleDropOnVaultFolder(e, segPath)}
                  className={`px-2 py-1 rounded-lg text-xs font-semibold transition truncate max-w-[160px] ${
                    isDrop
                      ? 'bg-indigo-100 dark:bg-indigo-500/30 text-indigo-700 dark:text-indigo-200 ring-2 ring-indigo-500'
                      : idx === breadcrumbSegments.length - 1
                      ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-xs'
                      : 'text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-800'
                  }`}
                >
                  {seg}
                </button>
              </React.Fragment>
            );
          })}
        </div>

        <div className="flex items-center gap-2 shrink-0 text-[11px] text-slate-500 dark:text-slate-400">
          {parentAcl?.isProtected && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-500/15 text-amber-800 dark:text-amber-300 font-medium">
              <Lock className="w-3 h-3" strokeWidth={1.5} />
              <span>{t('vaultLockedBadge')}</span>
            </span>
          )}
          <span>{t('vaultItemsCount', { count: activeItems.length })}</span>
        </div>
      </nav>

      {/* ACTIVE SANDBOX SESSIONS STRIP */}
      {localSessions.length > 0 && (
        <div className="px-4 py-1.5 bg-indigo-50/70 dark:bg-indigo-950/30 border-b border-indigo-200/70 dark:border-indigo-800/50 flex items-center gap-2 overflow-x-auto shrink-0">
          <span className="text-[11px] font-bold text-indigo-700 dark:text-indigo-300 shrink-0">
            {t('vaultOpenSessions')}:
          </span>
          {localSessions.map((sess) => (
            <div
              key={sess.sessionId}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-700 text-[11px] shrink-0"
            >
              <span className="font-semibold text-slate-800 dark:text-slate-200 max-w-[140px] truncate">
                {sess.fileName}
              </span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[9px] font-bold ${
                  sess.mode === 'edit'
                    ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                }`}
              >
                {sess.mode === 'edit' ? t('vaultEditMode') : t('vaultViewMode')}
              </span>
              <button
                type="button"
                onClick={() => window.workmesh.vaultCloseSandboxSession(sess.sessionId)}
                title={t('vaultCloseSession')}
                className="text-slate-400 hover:text-rose-500 transition"
              >
                <X className="w-3 h-3" strokeWidth={1.5} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* MAIN WORKSPACE: EXPLORER + RIGHT PREVIEW PANE */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {/* Explorer Items Canvas */}
        <div
          className="flex-1 min-w-0 h-full overflow-y-auto p-4 relative"
          onClick={() => setSelectedRelPath(null)}
          onContextMenu={(e) => openContextMenuAt(e, null)}
          onDragEnter={handleExplorerDragEnter}
          onDragOver={handleExplorerDragOver}
          onDragLeave={handleExplorerDragLeave}
          onDrop={handleExplorerDrop}
        >
          {loading && activeItems.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-2">
              <RefreshCw className="w-6 h-6 animate-spin text-indigo-500" strokeWidth={1.5} />
              <span className="text-xs">{t('loading')}</span>
            </div>
          ) : activeItems.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center max-w-sm mx-auto">
              <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-center text-slate-400 mb-3">
                <FolderOpen className="w-8 h-8" strokeWidth={1.5} />
              </div>
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                {searchResults !== null ? t('noResults') : t('vaultEmptyFolder')}
              </p>
              <p className="text-xs text-slate-400 mt-1">{t('vaultDropToUpload')}</p>
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
              {activeItems.map((node) => {
                const { Icon, color, bg } = getFileVisual(node);
                const isSelected = selectedRelPath === node.rel_path;
                const isProtected = Boolean(
                  node.isProtected ||
                    node.hasPassword ||
                    node.perm_mode === 'private' ||
                    node.perm_mode === 'custom'
                );
                const presEntries = localPresenceMap[node.rel_path] || [];
                const isFolderDropTarget =
                  node.is_dir && dropTargetPath === node.rel_path;

                return (
                  <div
                    key={node.rel_path}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData(
                        'application/x-workmesh-vault',
                        JSON.stringify({
                          relPath: node.rel_path,
                          name: node.name,
                          isDir: Boolean(node.is_dir)
                        })
                      );
                      e.dataTransfer.effectAllowed = 'copyMove';
                    }}
                    onDragOver={(e) => {
                      if (!node.is_dir) return;
                      const types = Array.from(e.dataTransfer?.types || []);
                      if (
                        types.includes('application/x-workmesh-vault') ||
                        types.includes('Files')
                      ) {
                        e.preventDefault();
                        e.stopPropagation();
                        setDropTargetPath(node.rel_path);
                      }
                    }}
                    onDragLeave={() => {
                      if (dropTargetPath === node.rel_path) setDropTargetPath(null);
                    }}
                    onDrop={(e) => {
                      if (node.is_dir) handleDropOnVaultFolder(e, node.rel_path);
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedRelPath(node.rel_path);
                    }}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      handleOpenItem(node);
                    }}
                    onContextMenu={(e) => openContextMenuAt(e, node)}
                    className={`group relative rounded-2xl p-3.5 border cursor-pointer transition flex flex-col items-center text-center gap-2 ${
                      isFolderDropTarget
                        ? 'bg-indigo-100/80 dark:bg-indigo-500/25 border-indigo-500 ring-2 ring-indigo-500'
                        : isSelected
                        ? 'bg-indigo-50/90 dark:bg-indigo-500/15 border-indigo-400 dark:border-indigo-500/60 shadow-sm'
                        : 'bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 hover:shadow-sm'
                    }`}
                  >
                    {/* Live Presence Badge (Top-Start) */}
                    {presEntries.length > 0 && (
                      <div className="absolute top-2.5 start-2.5">
                        <PresenceBadge entries={presEntries} t={t} />
                      </div>
                    )}

                    {/* Protection Lock Indicator (Top-End) */}
                    {isProtected && (
                      <div
                        title={t('vaultLockedBadge')}
                        className="absolute top-2.5 end-2.5 w-5 h-5 rounded-full bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center"
                      >
                        <Lock className="w-3 h-3" strokeWidth={1.5} />
                      </div>
                    )}

                    <div
                      className={`w-12 h-12 rounded-2xl ${bg} ${color} flex items-center justify-center transition-transform group-hover:scale-105`}
                    >
                      <Icon className="w-6 h-6" strokeWidth={1.5} />
                    </div>

                    <div className="w-full min-w-0">
                      <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                        {node.name}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5 truncate">
                        {node.is_dir ? t('vaultFolderLabel') : formatBytes(node.size)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 overflow-hidden">
              <table className="w-full text-start border-collapse text-xs">
                <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400 border-b border-slate-200/80 dark:border-slate-800">
                  <tr>
                    <th className="py-2.5 px-3 text-start font-semibold">
                      {t('vaultSortName')}
                    </th>
                    <th className="py-2.5 px-3 text-start font-semibold">
                      {t('vaultSortSize')}
                    </th>
                    <th className="py-2.5 px-3 text-start font-semibold hidden sm:table-cell">
                      {t('vaultSortDate')}
                    </th>
                    <th className="py-2.5 px-3 text-start font-semibold hidden md:table-cell">
                      {t('owner')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                  {activeItems.map((node) => {
                    const { Icon, color, bg } = getFileVisual(node);
                    const isSelected = selectedRelPath === node.rel_path;
                    const isProtected = Boolean(
                      node.isProtected ||
                        node.hasPassword ||
                        node.perm_mode === 'private' ||
                        node.perm_mode === 'custom'
                    );
                    const presEntries = localPresenceMap[node.rel_path] || [];
                    const isFolderDropTarget =
                      node.is_dir && dropTargetPath === node.rel_path;

                    return (
                      <tr
                        key={node.rel_path}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData(
                            'application/x-workmesh-vault',
                            JSON.stringify({
                              relPath: node.rel_path,
                              name: node.name,
                              isDir: Boolean(node.is_dir)
                            })
                          );
                          e.dataTransfer.effectAllowed = 'copyMove';
                        }}
                        onDragOver={(e) => {
                          if (!node.is_dir) return;
                          const types = Array.from(e.dataTransfer?.types || []);
                          if (
                            types.includes('application/x-workmesh-vault') ||
                            types.includes('Files')
                          ) {
                            e.preventDefault();
                            e.stopPropagation();
                            setDropTargetPath(node.rel_path);
                          }
                        }}
                        onDragLeave={() => {
                          if (dropTargetPath === node.rel_path) {
                            setDropTargetPath(null);
                          }
                        }}
                        onDrop={(e) => {
                          if (node.is_dir) handleDropOnVaultFolder(e, node.rel_path);
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedRelPath(node.rel_path);
                        }}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          handleOpenItem(node);
                        }}
                        onContextMenu={(e) => openContextMenuAt(e, node)}
                        className={`cursor-pointer transition ${
                          isFolderDropTarget
                            ? 'bg-indigo-100 dark:bg-indigo-500/25'
                            : isSelected
                            ? 'bg-indigo-50/90 dark:bg-indigo-500/15'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                        }`}
                      >
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div
                              className={`w-8 h-8 rounded-lg ${bg} ${color} flex items-center justify-center shrink-0`}
                            >
                              <Icon className="w-4 h-4" strokeWidth={1.5} />
                            </div>
                            <span className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                              {node.name}
                            </span>
                            {isProtected && (
                              <Lock
                                className="w-3.5 h-3.5 text-amber-500 shrink-0"
                                strokeWidth={1.5}
                              />
                            )}
                            {presEntries.length > 0 && (
                              <PresenceBadge entries={presEntries} t={t} />
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                          {node.is_dir ? '—' : formatBytes(node.size)}
                        </td>
                        <td className="py-2.5 px-3 text-slate-500 dark:text-slate-400 whitespace-nowrap hidden sm:table-cell">
                          {formatDate(node.updated_at, lang)}
                        </td>
                        <td className="py-2.5 px-3 text-slate-500 dark:text-slate-400 truncate max-w-[140px] hidden md:table-cell">
                          {node.owner_name ||
                            (node.owner_uuid === identity?.uuid
                              ? identity?.display_name || t('me')
                              : t('unknown'))}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* OS Drag-to-Upload Overlay */}
          {osDropActive && (
            <div className="absolute inset-3 z-20 rounded-2xl border-2 border-dashed border-indigo-500 bg-indigo-500/10 dark:bg-indigo-950/60 wm-glass flex flex-col items-center justify-center pointer-events-none">
              <Upload className="w-10 h-10 text-indigo-600 dark:text-indigo-400 mb-2" strokeWidth={1.5} />
              <p className="text-sm font-bold text-indigo-900 dark:text-white">
                {t('vaultDropToUpload')}
              </p>
            </div>
          )}
        </div>

        {/* RIGHT PREVIEW PANE */}
        {showPreviewPane && (
          <aside
            className={`${
              compact ? 'w-64' : 'w-80 xl:w-96'
            } shrink-0 h-full bg-white dark:bg-slate-900 border-s border-slate-200/80 dark:border-slate-800 flex flex-col overflow-hidden`}
          >
            <div className="px-4 py-3 border-b border-slate-200/80 dark:border-slate-800 flex items-center justify-between gap-2 shrink-0">
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                {selectedNode ? selectedNode.name : t('vaultPreviewPane')}
              </span>
              <button
                type="button"
                onClick={() => setShowPreviewPane(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" strokeWidth={1.5} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {!selectedNode ? (
                <div className="h-full flex flex-col items-center justify-center text-center text-slate-400 gap-2">
                  <Eye className="w-8 h-8 opacity-60" strokeWidth={1.5} />
                  <p className="text-xs">{t('vaultSelectToPreview')}</p>
                </div>
              ) : loadingPreview ? (
                <div className="h-full flex items-center justify-center text-slate-400">
                  <RefreshCw className="w-5 h-5 animate-spin text-indigo-500" strokeWidth={1.5} />
                </div>
              ) : previewData?.code === 'LOCKED' && previewData?.blockingAncestor ? (
                <div className="rounded-2xl border border-amber-200 dark:border-amber-500/30 bg-amber-50/70 dark:bg-amber-950/25 p-4 text-center space-y-3">
                  <Lock className="w-8 h-8 text-amber-500 mx-auto" strokeWidth={1.5} />
                  <p className="text-xs text-amber-900 dark:text-amber-200">
                    {t('unlockDesc', {
                      name: previewData.blockingAncestor.name
                    })}
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      setUnlockModal({
                        blockingPath: previewData.blockingAncestor.relPath,
                        blockingName: previewData.blockingAncestor.name,
                        password: '',
                        error: '',
                        pendingAction: {
                          type: 'preview',
                          relPath: selectedNode.rel_path
                        },
                        showRecovery: false,
                        recoveryInfo: null,
                        method: 'security_qa',
                        answerOrKey: '',
                        newPassword: '',
                        recovering: false
                      })
                    }
                    className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold"
                  >
                    {t('unlockButton')}
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Preview Media */}
                  {previewData?.kind === 'image' && previewData.dataUrl && (
                    <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
                      <img
                        src={previewData.dataUrl}
                        alt={selectedNode.name}
                        className="w-full max-h-64 object-contain"
                      />
                    </div>
                  )}

                  {previewData?.kind === 'pdf' && previewData.dataUrl && (
                    <iframe
                      title={selectedNode.name}
                      src={previewData.dataUrl}
                      className="w-full h-72 rounded-xl border border-slate-200 dark:border-slate-800 bg-white"
                    />
                  )}

                  {previewData?.kind === 'text' && (
                    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3 max-h-72 overflow-auto">
                      <pre
                        dir="auto"
                        className="text-[11px] font-mono text-slate-800 dark:text-slate-200 whitespace-pre-wrap break-words"
                      >
                        {previewData.text}
                      </pre>
                    </div>
                  )}

                  {previewData?.kind === 'audio' && previewData.dataUrl && (
                    <audio controls src={previewData.dataUrl} className="w-full" />
                  )}

                  {previewData?.kind === 'video' && previewData.dataUrl && (
                    <video
                      controls
                      src={previewData.dataUrl}
                      className="w-full max-h-60 rounded-xl bg-black"
                    />
                  )}

                  {(!previewData ||
                    previewData.kind === 'unsupported' ||
                    previewData.kind === 'folder') && (
                    <div className="rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-5 text-center space-y-2">
                      {(() => {
                        const { Icon, color } = getFileVisual(selectedNode);
                        return (
                          <Icon className={`w-10 h-10 mx-auto ${color}`} strokeWidth={1.5} />
                        );
                      })()}
                      <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                        {selectedNode.is_dir
                          ? t('vaultFolderLabel')
                          : t('vaultPreviewUnsupported')}
                      </p>
                    </div>
                  )}

                  {/* Safe Metadata (Zero Local OS Disk Path!) */}
                  <div className="rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800 p-3 space-y-2 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-slate-500 dark:text-slate-400">
                        {t('propsType')}
                      </span>
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        {selectedNode.is_dir ? t('propsFolder') : t('propsFile')}
                      </span>
                    </div>
                    {!selectedNode.is_dir && (
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-slate-500 dark:text-slate-400">
                          {t('propsSize')}
                        </span>
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          {formatBytes(selectedNode.size)}
                        </span>
                      </div>
                    )}
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-slate-500 dark:text-slate-400">
                        {t('propsEffectiveRole')}
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 uppercase">
                        {previewData?.effectiveAcl?.role ||
                          selectedNode.effectiveAcl?.role ||
                          'viewer'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-slate-500 dark:text-slate-400">
                        {t('propsUpdatedAt')}
                      </span>
                      <span className="text-[11px] text-slate-700 dark:text-slate-300">
                        {formatDate(selectedNode.updated_at, lang)}
                      </span>
                    </div>
                  </div>

                  {/* Quick Actions */}
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => handleOpenItem(selectedNode)}
                      className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition"
                    >
                      <ExternalLink className="w-3.5 h-3.5" strokeWidth={1.5} />
                      <span>{t('open')}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOpenSendToChat(selectedNode)}
                      className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition"
                    >
                      <Send className="w-3.5 h-3.5" strokeWidth={1.5} />
                      <span>{t('ctxSendToChat')}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </aside>
        )}
      </div>

      {/* FULL CONTEXT MENU (8 Items) */}
      {contextMenu && (
        <div
          style={{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }}
          onClick={(e) => e.stopPropagation()}
          className="fixed z-50 w-56 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl py-1.5 text-xs"
        >
          {contextMenu.node ? (
            <>
              {/* 1. Open */}
              <button
                type="button"
                onClick={() => {
                  const n = contextMenu.node;
                  setContextMenu(null);
                  handleOpenItem(n);
                }}
                className="w-full px-3.5 py-2 flex items-center gap-2.5 hover:bg-indigo-50 dark:hover:bg-indigo-500/15 text-slate-800 dark:text-slate-200 font-semibold text-start"
              >
                <ExternalLink className="w-4 h-4 text-indigo-500" strokeWidth={1.5} />
                <span>{t('ctxOpen')}</span>
              </button>

              {/* 2. Quick Preview */}
              <button
                type="button"
                onClick={() => {
                  const n = contextMenu.node;
                  setContextMenu(null);
                  setSelectedRelPath(n.rel_path);
                  setShowPreviewPane(true);
                  loadPreview(n.rel_path);
                }}
                className="w-full px-3.5 py-2 flex items-center gap-2.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-start"
              >
                <Eye className="w-4 h-4 text-slate-500" strokeWidth={1.5} />
                <span>{t('ctxQuickPreview')}</span>
              </button>

              {/* 3. Send to Chat... */}
              <button
                type="button"
                onClick={() => {
                  const n = contextMenu.node;
                  setContextMenu(null);
                  handleOpenSendToChat(n);
                }}
                className="w-full px-3.5 py-2 flex items-center gap-2.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-start"
              >
                <Send className="w-4 h-4 text-emerald-500" strokeWidth={1.5} />
                <span>{t('ctxSendToChat')}</span>
              </button>

              {/* 4. Save Copy As... */}
              <button
                type="button"
                onClick={() => {
                  const n = contextMenu.node;
                  setContextMenu(null);
                  handleSaveCopyAs(n);
                }}
                className="w-full px-3.5 py-2 flex items-center gap-2.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-start"
              >
                <Download className="w-4 h-4 text-slate-500" strokeWidth={1.5} />
                <span>{t('ctxSaveCopyAs')}</span>
              </button>

              <div className="my-1 border-t border-slate-100 dark:border-slate-800" />

              {/* 5. Cut / Copy / Paste */}
              <button
                type="button"
                onClick={() => {
                  const n = contextMenu.node;
                  setContextMenu(null);
                  setClipboard({ op: 'cut', paths: [n.rel_path] });
                }}
                className="w-full px-3.5 py-2 flex items-center justify-between gap-2 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-start"
              >
                <span className="flex items-center gap-2.5">
                  <Scissors className="w-4 h-4 text-slate-500" strokeWidth={1.5} />
                  <span>{t('ctxCut')}</span>
                </span>
                <span className="text-[10px] text-slate-400">Ctrl+X</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const n = contextMenu.node;
                  setContextMenu(null);
                  setClipboard({ op: 'copy', paths: [n.rel_path] });
                }}
                className="w-full px-3.5 py-2 flex items-center justify-between gap-2 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-start"
              >
                <span className="flex items-center gap-2.5">
                  <Copy className="w-4 h-4 text-slate-500" strokeWidth={1.5} />
                  <span>{t('ctxCopy')}</span>
                </span>
                <span className="text-[10px] text-slate-400">Ctrl+C</span>
              </button>

              {clipboard?.paths?.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    const n = contextMenu.node;
                    setContextMenu(null);
                    const target = n.is_dir ? n.rel_path : currentPath;
                    handleMoveOrCopy(clipboard.op, clipboard.paths, target, 'prompt');
                  }}
                  className="w-full px-3.5 py-2 flex items-center justify-between gap-2 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-start"
                >
                  <span className="flex items-center gap-2.5">
                    <ClipboardPaste className="w-4 h-4 text-slate-500" strokeWidth={1.5} />
                    <span>{t('ctxPaste')}</span>
                  </span>
                  <span className="text-[10px] text-slate-400">Ctrl+V</span>
                </button>
              )}

              {/* 6. Rename / Delete */}
              <button
                type="button"
                onClick={() => {
                  const n = contextMenu.node;
                  setContextMenu(null);
                  setRenameModal({ node: n, value: n.name });
                }}
                className="w-full px-3.5 py-2 flex items-center justify-between gap-2 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-start"
              >
                <span className="flex items-center gap-2.5">
                  <Edit3 className="w-4 h-4 text-slate-500" strokeWidth={1.5} />
                  <span>{t('ctxRename')}</span>
                </span>
                <span className="text-[10px] text-slate-400">F2</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const n = contextMenu.node;
                  setContextMenu(null);
                  handleDeleteNode(n);
                }}
                className="w-full px-3.5 py-2 flex items-center justify-between gap-2 hover:bg-rose-50 dark:hover:bg-rose-500/15 text-rose-600 dark:text-rose-400 text-start"
              >
                <span className="flex items-center gap-2.5">
                  <Trash2 className="w-4 h-4" strokeWidth={1.5} />
                  <span>{t('ctxDelete')}</span>
                </span>
                <span className="text-[10px] opacity-75">Del</span>
              </button>

              {/* 7. Permissions & Password (ONLY when owner_uuid === identity.uuid!) */}
              {contextMenu.node.owner_uuid === identity?.uuid && (
                <>
                  <div className="my-1 border-t border-slate-100 dark:border-slate-800" />
                  <button
                    type="button"
                    onClick={() => {
                      const n = contextMenu.node;
                      setContextMenu(null);
                      handleOpenPermissions(n);
                    }}
                    className="w-full px-3.5 py-2 flex items-center gap-2.5 hover:bg-amber-50 dark:hover:bg-amber-500/15 text-amber-700 dark:text-amber-300 font-semibold text-start"
                  >
                    <Shield className="w-4 h-4" strokeWidth={1.5} />
                    <span>{t('ctxPermissions')}</span>
                  </button>
                </>
              )}

              {/* 8. Properties & Audit Log */}
              <button
                type="button"
                onClick={() => {
                  const n = contextMenu.node;
                  setContextMenu(null);
                  handleOpenProperties(n);
                }}
                className="w-full px-3.5 py-2 flex items-center gap-2.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-start"
              >
                <Info className="w-4 h-4 text-indigo-500" strokeWidth={1.5} />
                <span>{t('ctxProperties')}</span>
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  setContextMenu(null);
                  setNewFolderName('');
                  setNewFolderModal(true);
                }}
                className="w-full px-3.5 py-2 flex items-center gap-2.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-start"
              >
                <FolderPlus className="w-4 h-4 text-indigo-500" strokeWidth={1.5} />
                <span>{t('vaultNewFolder')}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setContextMenu(null);
                  handleUploadFromDialog();
                }}
                className="w-full px-3.5 py-2 flex items-center gap-2.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-start"
              >
                <Upload className="w-4 h-4 text-slate-500" strokeWidth={1.5} />
                <span>{t('vaultUpload')}</span>
              </button>
              {clipboard?.paths?.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setContextMenu(null);
                    handlePaste();
                  }}
                  className="w-full px-3.5 py-2 flex items-center gap-2.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-start"
                >
                  <ClipboardPaste className="w-4 h-4 text-slate-500" strokeWidth={1.5} />
                  <span>{t('ctxPaste')}</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setContextMenu(null);
                  loadDirectory(currentPath);
                }}
                className="w-full px-3.5 py-2 flex items-center gap-2.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-start"
              >
                <RefreshCw className="w-4 h-4 text-slate-500" strokeWidth={1.5} />
                <span>{t('refresh')}</span>
              </button>
            </>
          )}
        </div>
      )}

      {/* MODAL: New Folder */}
      {newFolderModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 wm-glass p-4">
          <form
            onSubmit={handleCreateFolder}
            className="wm-animate-in w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-5 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <FolderPlus className="w-4 h-4 text-indigo-500" strokeWidth={1.5} />
                <span>{t('vaultNewFolder')}</span>
              </h3>
              <button
                type="button"
                onClick={() => setNewFolderModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" strokeWidth={1.5} />
              </button>
            </div>
            <input
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder={t('vaultNewFolderName')}
              required
              autoFocus
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2.5 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
            />
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setNewFolderModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200"
              >
                {t('cancel')}
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                {t('confirm')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: Rename */}
      {renameModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 wm-glass p-4">
          <form
            onSubmit={handleRenameSubmit}
            className="wm-animate-in w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-5 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-indigo-500" strokeWidth={1.5} />
                <span>{t('vaultRename')}</span>
              </h3>
              <button
                type="button"
                onClick={() => setRenameModal(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" strokeWidth={1.5} />
              </button>
            </div>
            <input
              type="text"
              value={renameModal.value}
              onChange={(e) =>
                setRenameModal((prev) =>
                  prev ? { ...prev, value: e.target.value } : null
                )
              }
              required
              autoFocus
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2.5 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
            />
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setRenameModal(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200"
              >
                {t('cancel')}
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                {t('save')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: Unlock & Offline Password Recovery */}
      {unlockModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 wm-glass p-4">
          <div className="wm-animate-in w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                  {unlockModal.showRecovery ? (
                    <KeyRound className="w-5 h-5" strokeWidth={1.5} />
                  ) : (
                    <Lock className="w-5 h-5" strokeWidth={1.5} />
                  )}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    {unlockModal.showRecovery
                      ? t('recoverTitle')
                      : t('unlockTitle')}
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    {unlockModal.showRecovery
                      ? t('recoverOwnerLabel', {
                          name:
                            unlockModal.recoveryInfo?.ownerName || t('unknown')
                        })
                      : t('unlockDesc', {
                          name:
                            unlockModal.blockingName || unlockModal.blockingPath
                        })}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setUnlockModal(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" strokeWidth={1.5} />
              </button>
            </div>

            {!unlockModal.showRecovery ? (
              <form onSubmit={handleSubmitUnlock} className="space-y-3">
                <input
                  type="password"
                  value={unlockModal.password}
                  onChange={(e) =>
                    setUnlockModal((prev) =>
                      prev
                        ? { ...prev, password: e.target.value, error: '' }
                        : null
                    )
                  }
                  placeholder={t('unlockPasswordPlaceholder')}
                  autoFocus
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2.5 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                />

                {unlockModal.error && (
                  <p className="text-xs font-medium text-rose-600 dark:text-rose-400">
                    {unlockModal.error}
                  </p>
                )}

                <div className="flex items-center justify-between gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleOpenRecovery}
                    className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
                  >
                    {t('unlockForgotPassword')}
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setUnlockModal(null)}
                      className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200"
                    >
                      {t('cancel')}
                    </button>
                    <button
                      type="submit"
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white shadow-sm"
                    >
                      <Unlock className="w-3.5 h-3.5" strokeWidth={1.5} />
                      <span>{t('unlockButton')}</span>
                    </button>
                  </div>
                </div>
              </form>
            ) : (
              <form onSubmit={handleSubmitRecovery} className="space-y-3">
                <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  {t('recoverMethodLabel')}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setUnlockModal((prev) =>
                        prev
                          ? { ...prev, method: 'security_qa', error: '' }
                          : null
                      )
                    }
                    className={`px-3 py-2 rounded-xl text-[11px] font-semibold border transition ${
                      unlockModal.method === 'security_qa'
                        ? 'bg-indigo-50 dark:bg-indigo-500/15 border-indigo-500 text-indigo-700 dark:text-indigo-300'
                        : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {t('recoverByQA')}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setUnlockModal((prev) =>
                        prev
                          ? { ...prev, method: 'recovery_key', error: '' }
                          : null
                      )
                    }
                    className={`px-3 py-2 rounded-xl text-[11px] font-semibold border transition ${
                      unlockModal.method === 'recovery_key'
                        ? 'bg-indigo-50 dark:bg-indigo-500/15 border-indigo-500 text-indigo-700 dark:text-indigo-300'
                        : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {t('recoverByMasterKey')}
                  </button>
                </div>

                {unlockModal.method === 'security_qa' && (
                  <div className="rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-3 space-y-1">
                    <div className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1">
                      <HelpCircle className="w-3 h-3" strokeWidth={1.5} />
                      <span>{t('recoverSecurityQuestion')}</span>
                    </div>
                    <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                      {unlockModal.recoveryInfo?.securityQuestion || '—'}
                    </div>
                  </div>
                )}

                <input
                  type="text"
                  value={unlockModal.answerOrKey}
                  onChange={(e) =>
                    setUnlockModal((prev) =>
                      prev
                        ? { ...prev, answerOrKey: e.target.value, error: '' }
                        : null
                    )
                  }
                  placeholder={
                    unlockModal.method === 'security_qa'
                      ? t('recoverAnswerPlaceholder')
                      : t('recoverMasterKeyPlaceholder')
                  }
                  dir={unlockModal.method === 'recovery_key' ? 'ltr' : 'auto'}
                  required
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2.5 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                />

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    {t('recoverNewPassword')}
                  </label>
                  <input
                    type="password"
                    value={unlockModal.newPassword}
                    onChange={(e) =>
                      setUnlockModal((prev) =>
                        prev ? { ...prev, newPassword: e.target.value } : null
                      )
                    }
                    placeholder={t('recoverNewPasswordPlaceholder')}
                    required
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2.5 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                  />
                </div>

                {unlockModal.error && (
                  <p className="text-xs font-medium text-rose-600 dark:text-rose-400">
                    {unlockModal.error}
                  </p>
                )}

                <div className="flex items-center justify-between gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() =>
                      setUnlockModal((prev) =>
                        prev
                          ? { ...prev, showRecovery: false, error: '' }
                          : null
                      )
                    }
                    className="text-xs font-semibold text-slate-500 hover:text-slate-700"
                  >
                    {t('back')}
                  </button>
                  <button
                    type="submit"
                    disabled={unlockModal.recovering}
                    className="px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm disabled:opacity-60"
                  >
                    {unlockModal.recovering
                      ? t('loading')
                      : t('recoverSubmit')}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* MODAL: Co-Editing Warning */}
      {coeditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 wm-glass p-4">
          <div className="wm-animate-in w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-5 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" strokeWidth={1.5} />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  {t('coeditTitle')}
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  {t('coeditMessage')}
                </p>
              </div>
            </div>

            <div className="rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-3 space-y-1.5">
              <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                {t('coeditActiveEditors')}
              </div>
              {coeditModal.editors.map((ed, idx) => (
                <div
                  key={ed.peerUuid || idx}
                  className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-2"
                >
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span>{ed.displayName || t('unknown')}</span>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setCoeditModal(null)}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200"
              >
                {t('cancel')}
              </button>
              <button
                type="button"
                onClick={() => {
                  const pathToOpen = coeditModal.relPath;
                  setCoeditModal(null);
                  handleOpenItem(
                    { rel_path: pathToOpen, name: coeditModal.name, is_dir: false },
                    { forceReadOnly: true }
                  );
                }}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                {t('coeditOpenReadOnly')}
              </button>
              <button
                type="button"
                onClick={() => {
                  const pathToOpen = coeditModal.relPath;
                  setCoeditModal(null);
                  handleOpenItem(
                    { rel_path: pathToOpen, name: coeditModal.name, is_dir: false },
                    { acknowledgeCoEdit: true }
                  );
                }}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white"
              >
                {t('coeditContinueEditing')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Live-Edit Blocked Alert */}
      {liveEditBlockedModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 wm-glass p-4">
          <div className="wm-animate-in w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-5 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-500/20 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                <ShieldAlert className="w-5 h-5" strokeWidth={1.5} />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  {t('liveEditBlockedTitle')}
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  {t('liveEditBlockedMessage')}
                </p>
              </div>
            </div>

            {liveEditBlockedModal.editors?.length > 0 && (
              <div className="rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-3 space-y-1">
                {liveEditBlockedModal.editors.map((ed, i) => (
                  <div key={i} className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                    • {ed.displayName || t('unknown')} ({t('vaultEditingNow')})
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setLiveEditBlockedModal(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                {t('close')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Upload / Move-Copy Name Conflict */}
      {conflictModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 wm-glass p-4">
          <div className="wm-animate-in w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-5 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" strokeWidth={1.5} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  {t('conflictUploadTitle')}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  {t('conflictUploadMessage')}
                </p>
              </div>
            </div>

            <div className="rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-2.5 max-h-28 overflow-y-auto space-y-1">
              {conflictModal.conflicts.map((c, idx) => (
                <div key={idx} className="text-xs font-medium text-slate-700 dark:text-slate-200 truncate">
                  • {c.name || c.existingRelPath || c.targetRelPath}
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setConflictModal(null)}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200"
              >
                {t('cancel')}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (conflictModal.kind === 'upload') {
                    handleUploadOsPaths(
                      conflictModal.osPaths,
                      conflictModal.targetParentPath,
                      'keep_both'
                    );
                  } else {
                    handleMoveOrCopy(
                      conflictModal.op,
                      conflictModal.sourcePaths,
                      conflictModal.targetParentPath,
                      'keep_both'
                    );
                  }
                }}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                {t('conflictKeepBoth')}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (conflictModal.kind === 'upload') {
                    handleUploadOsPaths(
                      conflictModal.osPaths,
                      conflictModal.targetParentPath,
                      'overwrite'
                    );
                  } else {
                    handleMoveOrCopy(
                      conflictModal.op,
                      conflictModal.sourcePaths,
                      conflictModal.targetParentPath,
                      'overwrite'
                    );
                  }
                }}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white"
              >
                {t('conflictOverwrite')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Permissions & Password (Owner-Only) */}
      {permModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 wm-glass p-4">
          <form
            onSubmit={handleSavePermissions}
            className="wm-animate-in w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-5 space-y-4 max-h-[88vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-amber-500" strokeWidth={1.5} />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  {t('permTitle')} — {permModal.node.name}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setPermModal(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" strokeWidth={1.5} />
              </button>
            </div>

            <div className="space-y-2">
              <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                {t('permModeLabel')}
              </div>
              {[
                { id: 'public', title: t('permPublicRW'), desc: t('permPublicRWDesc') },
                { id: 'readonly', title: t('permPublicRO'), desc: t('permPublicRODesc') },
                { id: 'private', title: t('permPrivate'), desc: t('permPrivateDesc') },
                { id: 'custom', title: t('permCustom'), desc: t('permCustomDesc') }
              ].map((opt) => (
                <label
                  key={opt.id}
                  className={`block rounded-xl border p-3 cursor-pointer transition ${
                    permModal.permMode === opt.id
                      ? 'bg-indigo-50 dark:bg-indigo-500/15 border-indigo-500'
                      : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800'
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <input
                      type="radio"
                      name="permMode"
                      checked={permModal.permMode === opt.id}
                      onChange={() =>
                        setPermModal((prev) => ({ ...prev, permMode: opt.id }))
                      }
                      className="mt-0.5"
                    />
                    <div>
                      <div className="text-xs font-bold text-slate-900 dark:text-white">
                        {opt.title}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        {opt.desc}
                      </div>
                    </div>
                  </div>
                </label>
              ))}
            </div>

            {permModal.permMode === 'custom' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3 space-y-2">
                  <div className="text-xs font-bold text-emerald-700 dark:text-emerald-400">
                    {t('permAllowedEditors')}
                  </div>
                  <div className="max-h-36 overflow-y-auto space-y-1.5">
                    {peers
                      .filter((p) => p.uuid !== identity?.uuid)
                      .map((peer) => {
                        const checked = permModal.allowedEditors.includes(peer.uuid);
                        return (
                          <label key={peer.uuid} className="flex items-center gap-2 text-xs cursor-pointer">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                setPermModal((prev) => {
                                  const nextEditors = e.target.checked
                                    ? [...prev.allowedEditors, peer.uuid]
                                    : prev.allowedEditors.filter((id) => id !== peer.uuid);
                                  const nextViewers = e.target.checked
                                    ? prev.allowedViewers.filter((id) => id !== peer.uuid)
                                    : prev.allowedViewers;
                                  return {
                                    ...prev,
                                    allowedEditors: nextEditors,
                                    allowedViewers: nextViewers
                                  };
                                });
                              }}
                            />
                            <span className="truncate text-slate-700 dark:text-slate-200">
                              {peer.display_name}
                            </span>
                          </label>
                        );
                      })}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3 space-y-2">
                  <div className="text-xs font-bold text-sky-700 dark:text-sky-400">
                    {t('permAllowedViewers')}
                  </div>
                  <div className="max-h-36 overflow-y-auto space-y-1.5">
                    {peers
                      .filter((p) => p.uuid !== identity?.uuid)
                      .map((peer) => {
                        const checked = permModal.allowedViewers.includes(peer.uuid);
                        return (
                          <label key={peer.uuid} className="flex items-center gap-2 text-xs cursor-pointer">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                setPermModal((prev) => {
                                  const nextViewers = e.target.checked
                                    ? [...prev.allowedViewers, peer.uuid]
                                    : prev.allowedViewers.filter((id) => id !== peer.uuid);
                                  const nextEditors = e.target.checked
                                    ? prev.allowedEditors.filter((id) => id !== peer.uuid)
                                    : prev.allowedEditors;
                                  return {
                                    ...prev,
                                    allowedViewers: nextViewers,
                                    allowedEditors: nextEditors
                                  };
                                });
                              }}
                            />
                            <span className="truncate text-slate-700 dark:text-slate-200">
                              {peer.display_name}
                            </span>
                          </label>
                        );
                      })}
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                {t('permPasswordOptional')}
              </label>
              <input
                type="password"
                value={permModal.password}
                disabled={permModal.clearPassword}
                onChange={(e) =>
                  setPermModal((prev) => ({ ...prev, password: e.target.value }))
                }
                placeholder={t('permPasswordPlaceholder')}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2 text-xs disabled:opacity-50"
              />
              {permModal.node.hasPassword && (
                <label className="inline-flex items-center gap-2 text-xs text-rose-600 dark:text-rose-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={permModal.clearPassword}
                    onChange={(e) =>
                      setPermModal((prev) => ({
                        ...prev,
                        clearPassword: e.target.checked,
                        password: ''
                      }))
                    }
                  />
                  <span>{t('permPasswordClear')}</span>
                </label>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setPermModal(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200"
              >
                {t('cancel')}
              </button>
              <button
                type="submit"
                disabled={permModal.saving}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm disabled:opacity-60"
              >
                {permModal.saving ? t('loading') : t('permSave')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: Properties & Audit Log (NO Local Disk Path!) */}
      {propsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 wm-glass p-4">
          <div className="wm-animate-in w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-5 space-y-4 max-h-[86vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Info className="w-4 h-4 text-indigo-500" strokeWidth={1.5} />
                <span>{t('propsTitle')}</span>
              </h3>
              <button
                type="button"
                onClick={() => setPropsModal(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" strokeWidth={1.5} />
              </button>
            </div>

            {propsModal.loading ? (
              <div className="py-8 text-center text-xs text-slate-400">
                {t('loading')}
              </div>
            ) : (
              <>
                <div className="rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-3.5 space-y-2 text-xs">
                  <div className="flex justify-between gap-3">
                    <span className="text-slate-500">{t('propsName')}</span>
                    <span className="font-bold text-slate-900 dark:text-white">
                      {propsModal.node?.name}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-slate-500">{t('trashOriginalPath')}</span>
                    <span className="font-mono text-slate-700 dark:text-slate-300" dir="ltr">
                      /{propsModal.node?.rel_path}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-slate-500">{t('propsType')}</span>
                    <span className="font-semibold">
                      {propsModal.node?.is_dir ? t('propsFolder') : t('propsFile')}
                    </span>
                  </div>
                  {!propsModal.node?.is_dir && (
                    <div className="flex justify-between gap-3">
                      <span className="text-slate-500">{t('propsSize')}</span>
                      <span className="font-semibold">
                        {formatBytes(propsModal.node?.size)}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between gap-3">
                    <span className="text-slate-500">{t('propsOwner')}</span>
                    <span className="font-semibold">
                      {propsModal.ownerName || t('unknown')}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-slate-500">{t('propsEffectiveRole')}</span>
                    <span className="font-bold uppercase text-indigo-600 dark:text-indigo-400">
                      {propsModal.effectiveAcl?.role || 'viewer'}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-slate-500">{t('propsCreatedAt')}</span>
                    <span>{formatDate(propsModal.node?.created_at, lang)}</span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-slate-500">{t('propsUpdatedAt')}</span>
                    <span>{formatDate(propsModal.node?.updated_at, lang)}</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-200">
                    <History className="w-3.5 h-3.5 text-indigo-500" strokeWidth={1.5} />
                    <span>{t('propsAuditLog')}</span>
                  </div>

                  {propsModal.auditLogs.length === 0 ? (
                    <p className="text-xs text-slate-400 py-2">
                      {t('propsNoAuditLogs')}
                    </p>
                  ) : (
                    <div className="max-h-48 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                      {propsModal.auditLogs.map((log, idx) => (
                        <div key={log.id || idx} className="px-3 py-2 flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 me-2">
                              {log.event_type}
                            </span>
                            <span className="font-medium text-slate-800 dark:text-slate-200">
                              {log.actor_name || t('unknown')}
                            </span>
                          </div>
                          <span className="text-[10px] text-slate-400 shrink-0">
                            {formatDate(log.created_at, lang)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* MODAL: Send to Chat... */}
      {sendChatModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 wm-glass p-4">
          <form
            onSubmit={handleConfirmSendToChat}
            className="wm-animate-in w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-5 space-y-4 max-h-[88vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Send className="w-4 h-4 text-emerald-500" strokeWidth={1.5} />
                <span>{t('ctxSendToChat')} — {sendChatModal.node.name}</span>
              </h3>
              <button
                type="button"
                onClick={() => setSendChatModal(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" strokeWidth={1.5} />
              </button>
            </div>

            {sendChatModal.isProtected && (
              <div className="space-y-2 rounded-xl border border-amber-200 dark:border-amber-500/30 bg-amber-50/60 dark:bg-amber-950/20 p-3">
                <div className="text-xs font-bold text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5" strokeWidth={1.5} />
                  <span>{t('chatShareChoiceProtectedDesc')}</span>
                </div>
                <label className="flex items-start gap-2 text-xs cursor-pointer">
                  <input
                    type="radio"
                    name="sendVaultMode"
                    checked={sendChatModal.mode === 'deeplink'}
                    onChange={() =>
                      setSendChatModal((prev) => ({ ...prev, mode: 'deeplink' }))
                    }
                    className="mt-0.5"
                  />
                  <div>
                    <div className="font-bold text-slate-900 dark:text-white">
                      {t('chatShareAsDeepLink')}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      {t('chatShareAsDeepLinkDesc')}
                    </div>
                  </div>
                </label>
                <label className="flex items-start gap-2 text-xs cursor-pointer">
                  <input
                    type="radio"
                    name="sendVaultMode"
                    checked={sendChatModal.mode === 'copy'}
                    onChange={() =>
                      setSendChatModal((prev) => ({ ...prev, mode: 'copy' }))
                    }
                    className="mt-0.5"
                  />
                  <div>
                    <div className="font-bold text-slate-900 dark:text-white">
                      {t('chatShareAsCopy')}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      {t('chatShareAsCopyDesc')}
                    </div>
                  </div>
                </label>
              </div>
            )}

            <div className="space-y-2">
              <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                {t('chatSelectPeer')}
              </div>
              <div className="max-h-44 overflow-y-auto space-y-1.5">
                {conversations.map((conv) => {
                  const selected = sendChatModal.targetConvId === conv.id;
                  const title =
                    conv.type === 'group'
                      ? conv.name
                      : conv.peer?.display_name || conv.name || t('unknown');
                  return (
                    <button
                      key={conv.id}
                      type="button"
                      onClick={() =>
                        setSendChatModal((prev) => ({
                          ...prev,
                          targetConvId: conv.id,
                          targetPeerUuid: ''
                        }))
                      }
                      className={`w-full px-3 py-2 rounded-xl border flex items-center justify-between gap-2 text-xs transition ${
                        selected
                          ? 'bg-indigo-50 dark:bg-indigo-500/15 border-indigo-500 text-indigo-700 dark:text-indigo-200 font-semibold'
                          : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200'
                      }`}
                    >
                      <span className="truncate">{title}</span>
                      {selected && <CheckCircle2 className="w-4 h-4 shrink-0" strokeWidth={1.5} />}
                    </button>
                  );
                })}

                {peers
                  .filter((p) => p.uuid !== identity?.uuid)
                  .map((peer) => {
                    const selected =
                      !sendChatModal.targetConvId &&
                      sendChatModal.targetPeerUuid === peer.uuid;
                    return (
                      <button
                        key={peer.uuid}
                        type="button"
                        onClick={() =>
                          setSendChatModal((prev) => ({
                            ...prev,
                            targetConvId: '',
                            targetPeerUuid: peer.uuid
                          }))
                        }
                        className={`w-full px-3 py-2 rounded-xl border flex items-center justify-between gap-2 text-xs transition ${
                          selected
                            ? 'bg-indigo-50 dark:bg-indigo-500/15 border-indigo-500 text-indigo-700 dark:text-indigo-200 font-semibold'
                            : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <UserAvatar
                            name={peer.display_name}
                            avatarData={peer.avatar_data}
                            size="sm"
                          />
                          <span className="truncate">{peer.display_name}</span>
                        </div>
                        {selected && <CheckCircle2 className="w-4 h-4 shrink-0" strokeWidth={1.5} />}
                      </button>
                    );
                  })}
              </div>
            </div>

            <input
              type="text"
              value={sendChatModal.caption}
              onChange={(e) =>
                setSendChatModal((prev) => ({ ...prev, caption: e.target.value }))
              }
              placeholder={t('chatCaptionPlaceholder')}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2 text-xs"
            />

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setSendChatModal(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200"
              >
                {t('cancel')}
              </button>
              <button
                type="submit"
                disabled={
                  sendChatModal.sending ||
                  (!sendChatModal.targetConvId && !sendChatModal.targetPeerUuid)
                }
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5" strokeWidth={1.5} />
                <span>{sendChatModal.sending ? t('loading') : t('chatSend')}</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
