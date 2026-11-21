import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Search,
  Plus,
  Users,
  Send,
  Paperclip,
  Mic,
  Square,
  Play,
  Pause,
  Reply,
  Forward,
  Edit3,
  Trash2,
  Check,
  CheckCheck,
  X,
  Folder,
  FolderOpen,
  File,
  FileText,
  FileImage,
  FileArchive,
  Lock,
  ExternalLink,
  Download,
  FolderInput,
  ArrowLeft,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Copy,
  RefreshCw,
  AlertTriangle,
  MessageSquare,
  Sparkles,
  CheckCircle2,
  FolderPlus
} from 'lucide-react';
import { UserAvatar, DeviceTypeBadge, copyTextSafe } from './OnboardingModal';

const getApi = () => window.twinsync || window.workmesh;

const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatMessageTime(ts, lang) {
  if (!ts) return '';
  const d = new Date(Number(ts));
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString(lang === 'ar' ? 'ar-EG' : 'en-US', {
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatLastSeen(ts, t, lang) {
  if (!ts) return t('offline');
  const d = new Date(Number(ts));
  if (Number.isNaN(d.getTime())) return t('offline');
  const now = new Date();
  const sameDay =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();
  const timeStr = d.toLocaleTimeString(lang === 'ar' ? 'ar-EG' : 'en-US', {
    hour: '2-digit',
    minute: '2-digit'
  });
  if (sameDay) {
    return t('chatLastSeen', { time: timeStr });
  }
  const dateStr = d.toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US', {
    month: 'short',
    day: 'numeric'
  });
  return t('chatLastSeen', { time: `${dateStr} ${timeStr}` });
}

function formatDurationMs(ms) {
  const totalSec = Math.max(0, Math.round((Number(ms) || 0) / 1000));
  const m = String(Math.floor(totalSec / 60)).padStart(2, '0');
  const s = String(totalSec % 60).padStart(2, '0');
  return `${m}:${s}`;
}

function buildWaveformBars(seedStr, count = 28) {
  const s = String(seedStr || 'twinsync');
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const bars = [];
  for (let i = 0; i < count; i++) {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    const pct = 24 + (Math.abs(h) % 72);
    bars.push(pct);
  }
  return bars;
}

function parseAttachment(msg) {
  if (!msg) return null;
  if (msg.attachment && typeof msg.attachment === 'object') return msg.attachment;
  if (typeof msg.attachment_json === 'string' && msg.attachment_json.trim()) {
    try {
      return JSON.parse(msg.attachment_json);
    } catch {
      return null;
    }
  }
  return null;
}

function getConversationTitle(conv, t) {
  if (!conv) return '';
  if (conv.type === 'group') return conv.name || t('chatNewGroup');
  if (conv.peer?.display_name) return conv.peer.display_name;
  return conv.name || t('unknown');
}

function getMessagePreviewText(msg, t) {
  if (!msg) return '';
  if (msg.deleted_at) return t('chatDeletedMessage');
  if (msg.type === 'voice') return `🎤 ${t('chatVoiceNote')}`;
  if (msg.type === 'vault_link' || msg.vault_link_path) {
    const name = String(msg.vault_link_path || '').split('/').pop() || t('vaultRoot');
    return `🔗 ${name}`;
  }
  const att = parseAttachment(msg);
  if (att) {
    const label = att.originalName || att.fileName || '';
    if (att.isFolder) return `📁 ${label}`;
    if (msg.type === 'image' || String(att.mime || '').startsWith('image/')) {
      return msg.body ? `🖼️ ${msg.body}` : `🖼️ ${label}`;
    }
    return msg.body ? `📎 ${msg.body}` : `📎 ${label}`;
  }
  return msg.body || '';
}

function VoiceNotePlayer({ msg, att, isMine, t, getCachedBlobUrl }) {
  const [srcUrl, setSrcUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [currentSec, setCurrentSec] = useState(0);
  const [totalSec, setTotalSec] = useState(
    Math.max(0, (Number(att?.durationMs) || 0) / 1000)
  );
  const audioRef = useRef(null);

  const bars = useMemo(
    () => buildWaveformBars(att?.blobId || msg.id, 28),
    [att?.blobId, msg.id]
  );

  useEffect(() => {
    let active = true;
    if (!att?.blobId || !att?.fileName) return undefined;
    setLoading(true);
    getCachedBlobUrl(att.blobId, att.fileName)
      .then((url) => {
        if (active && url) setSrcUrl(url);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [att?.blobId, att?.fileName, getCachedBlobUrl]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = speed;
    }
  }, [speed]);

  const togglePlay = async () => {
    let url = srcUrl;
    if (!url && att?.blobId && att?.fileName) {
      setLoading(true);
      url = await getCachedBlobUrl(att.blobId, att.fileName);
      setLoading(false);
      if (url) setSrcUrl(url);
    }
    const el = audioRef.current;
    if (!el || !url) return;
    if (playing) {
      el.pause();
    } else {
      el.playbackRate = speed;
      try {
        await el.play();
      } catch {
        // Ignore autoplay restriction errors
      }
    }
  };

  const cycleSpeed = () => {
    const next = speed === 1 ? 1.5 : speed === 1.5 ? 2 : 1;
    setSpeed(next);
  };

  const progress = totalSec > 0 ? Math.min(1, currentSec / totalSec) : 0;

  const handleSeek = (idx) => {
    const el = audioRef.current;
    if (!el || !totalSec) return;
    const ratio = (idx + 0.5) / bars.length;
    el.currentTime = ratio * totalSec;
    setCurrentSec(el.currentTime);
  };

  return (
    <div className="flex items-center gap-2.5 min-w-[220px] max-w-[290px] py-0.5">
      {srcUrl && (
        <audio
          ref={audioRef}
          src={srcUrl}
          preload="metadata"
          onLoadedMetadata={(e) => {
            const dur = e.currentTarget.duration;
            if (dur && Number.isFinite(dur)) setTotalSec(dur);
          }}
          onTimeUpdate={(e) => setCurrentSec(e.currentTarget.currentTime)}
          onPlay={() => {
            if (audioRef.current) audioRef.current.playbackRate = speed;
            setPlaying(true);
          }}
          onPause={() => setPlaying(false)}
          onEnded={() => {
            setPlaying(false);
            setCurrentSec(0);
          }}
        />
      )}

      <button
        type="button"
        onClick={togglePlay}
        disabled={loading}
        aria-label={playing ? t('pause', 'Pause') : t('chatVoiceNote')}
        className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition ${
          isMine
            ? 'bg-white/20 hover:bg-white/30 text-white'
            : 'bg-indigo-600 hover:bg-indigo-700 text-white'
        } disabled:opacity-60`}
      >
        {loading ? (
          <RefreshCw className="w-4 h-4 animate-spin" strokeWidth={1.5} />
        ) : playing ? (
          <Pause className="w-4 h-4" strokeWidth={1.5} />
        ) : (
          <Play className="w-4 h-4 ms-0.5" strokeWidth={1.5} />
        )}
      </button>

      <div className="flex-1 min-w-0 space-y-1">
        <div
          className="flex items-center gap-[2px] h-7 cursor-pointer"
          dir="ltr"
        >
          {bars.map((heightPct, idx) => {
            const barRatio = (idx + 1) / bars.length;
            const filled = barRatio <= progress;
            return (
              <button
                key={idx}
                type="button"
                onClick={() => handleSeek(idx)}
                style={{ height: `${heightPct}%` }}
                className={`flex-1 min-w-[3px] rounded-full transition-colors ${
                  isMine
                    ? filled
                      ? 'bg-white'
                      : 'bg-white/40 hover:bg-white/65'
                    : filled
                    ? 'bg-indigo-600 dark:bg-indigo-400'
                    : 'bg-slate-300 dark:bg-slate-600 hover:bg-indigo-400/60'
                }`}
              />
            );
          })}
        </div>
        <div
          className={`flex items-center justify-between text-[10px] font-mono ${
            isMine ? 'text-indigo-100' : 'text-slate-500 dark:text-slate-400'
          }`}
          dir="ltr"
        >
          <span>
            {formatDurationMs(
              (playing || currentSec > 0 ? currentSec : totalSec) * 1000
            )}
          </span>
          <button
            type="button"
            onClick={cycleSpeed}
            title={t('chatPlaybackSpeed')}
            className={`px-1.5 py-0.5 rounded-md font-bold transition ${
              isMine
                ? 'bg-white/20 hover:bg-white/30 text-white'
                : 'bg-slate-200/80 dark:bg-slate-800 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 text-slate-700 dark:text-slate-200'
            }`}
          >
            {speed}x
          </button>
        </div>
      </div>
    </div>
  );
}

function ImageAttachmentThumb({ att, getCachedBlobUrl, onClick }) {
  const [dataUrl, setDataUrl] = useState('');

  useEffect(() => {
    let active = true;
    if (!att?.blobId || !att?.fileName) return undefined;
    getCachedBlobUrl(att.blobId, att.fileName).then((url) => {
      if (active && url) setDataUrl(url);
    });
    return () => {
      active = false;
    };
  }, [att?.blobId, att?.fileName, getCachedBlobUrl]);

  if (!dataUrl) {
    return (
      <div className="w-full h-36 rounded-xl bg-slate-200/60 dark:bg-slate-800/60 flex items-center justify-center">
        <FileImage className="w-7 h-7 text-slate-400" strokeWidth={1.5} />
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="block w-full overflow-hidden rounded-xl border border-black/10 dark:border-white/10 bg-black/5"
    >
      <img
        src={dataUrl}
        alt={att.originalName || att.fileName}
        className="w-full max-h-56 object-cover hover:scale-[1.01] transition-transform"
      />
    </button>
  );
}

export default function ChatWorkspace({
  t,
  lang,
  identity,
  peers = [],
  conversations = [],
  activeChatId,
  onSelectChat,
  onOpenVaultDeepLink,
  compact = false,
  onToast,
  onRefreshConversations
}) {
  const [sidebarSearch, setSidebarSearch] = useState('');
  const [compactShowThread, setCompactShowThread] = useState(Boolean(activeChatId));

  const [messages, setMessages] = useState([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [showMsgSearch, setShowMsgSearch] = useState(false);
  const [msgSearch, setMsgSearch] = useState('');
  const [debouncedMsgSearch, setDebouncedMsgSearch] = useState('');

  const [composerText, setComposerText] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [editingMsg, setEditingMsg] = useState(null);
  const [editBody, setEditBody] = useState('');
  const [msgMenu, setMsgMenu] = useState(null); // { msg, x, y }
  const [highlightedMsgId, setHighlightedMsgId] = useState(null);

  // Typing & transfer progress
  const [typingMap, setTypingMap] = useState({});
  const [transferProgress, setTransferProgress] = useState(null);

  // Recording voice note
  const [isRecording, setIsRecording] = useState(false);
  const [recSeconds, setRecSeconds] = useState(0);
  const mediaRecorderRef = useRef(null);
  const recStreamRef = useRef(null);
  const recChunksRef = useRef([]);
  const recStartAtRef = useRef(0);
  const recTimerRef = useRef(null);
  const recCancelledRef = useRef(false);

  // Drag & Drop state
  const [dragKind, setDragKind] = useState(null); // 'os' | 'vault' | null
  const dragDepthRef = useRef(0);

  // Modals
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupMemberUuids, setGroupMemberUuids] = useState([]);
  const [creatingGroup, setCreatingGroup] = useState(false);

  const [forwardMsg, setForwardMsg] = useState(null);
  const [forwarding, setForwarding] = useState(false);

  const [captionModal, setCaptionModal] = useState(null); // { kind: 'os'|'vault_public', osPaths?, relPath?, name?, isDir?, caption }
  const [shareChoiceModal, setShareChoiceModal] = useState(null); // { relPath, name, isDir, caption, mode: 'deeplink'|'copy' }
  const [folderPreviewModal, setFolderPreviewModal] = useState(null); // { sessionId, rootName, entries }
  const [vaultPickerModal, setVaultPickerModal] = useState(null); // { att, currentFolder, items, locked, blockingAncestor, password, unlockError, loading, newFolderName, showNewFolder }
  const [saveConflictModal, setSaveConflictModal] = useState(null); // { att, targetFolder, conflicts }

  const blobCacheRef = useRef(new Map());
  const messagesEndRef = useRef(null);
  const msgMenuRef = useRef(null);
  const composerInputRef = useRef(null);
  const typingThrottleRef = useRef(0);
  const typingStopTimerRef = useRef(null);
  const activeChatIdRef = useRef(activeChatId);
  activeChatIdRef.current = activeChatId;

  const isRtl = lang === 'ar';

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === activeChatId) || null,
    [conversations, activeChatId]
  );

  // Sync compact mode view when activeChatId changes externally (e.g. Sent to Chat)
  useEffect(() => {
    if (activeChatId) {
      setCompactShowThread(true);
    }
  }, [activeChatId]);

  // Debounce message search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedMsgSearch(msgSearch.trim());
    }, 220);
    return () => clearTimeout(timer);
  }, [msgSearch]);

  // Reset per-conversation transient UI on chat switch
  useEffect(() => {
    setReplyTo(null);
    setEditingMsg(null);
    setMsgMenu(null);
    setShowMsgSearch(false);
    setMsgSearch('');
    setDebouncedMsgSearch('');
  }, [activeChatId]);

  // Close floating message dropdown menu on outside click or Escape
  useEffect(() => {
    if (!msgMenu) return undefined;
    const handlePointerDown = (e) => {
      if (msgMenuRef.current && msgMenuRef.current.contains(e.target)) return;
      setMsgMenu(null);
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setMsgMenu(null);
      }
    };
    const handleResize = () => setMsgMenu(null);
    document.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', handleResize);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleResize);
    };
  }, [msgMenu]);

  const openMessageMenu = useCallback((e, msg) => {
    if (!msg || msg.deleted_at) return;
    const menuW = 228;
    const menuH = 268;
    let rawX = e.clientX;
    let rawY = e.clientY;
    if (!rawX && !rawY && e.currentTarget) {
      const rect = e.currentTarget.getBoundingClientRect();
      rawX = rect.left;
      rawY = rect.bottom + 4;
    }
    const maxX = Math.max(8, window.innerWidth - menuW - 8);
    const maxY = Math.max(8, window.innerHeight - menuH - 8);
    const preferredX = rawX + menuW > window.innerWidth - 8 ? rawX - menuW : rawX;
    const preferredY = rawY + menuH > window.innerHeight - 8 ? rawY - menuH : rawY;
    const x = Math.max(8, Math.min(preferredX, maxX));
    const y = Math.max(8, Math.min(preferredY, maxY));
    setMsgMenu({ msg, x, y });
  }, []);

  const getCachedBlobUrl = useCallback(async (blobId, fileName) => {
    const key = `${blobId}:${fileName}`;
    if (blobCacheRef.current.has(key)) {
      return blobCacheRef.current.get(key);
    }
    try {
      const res = await getApi().getBlobDataUrl(blobId, fileName);
      if (res?.ok && res.dataUrl) {
        blobCacheRef.current.set(key, res.dataUrl);
        return res.dataUrl;
      }
    } catch {
      // Ignore transient blob error
    }
    return '';
  }, []);

  const loadMessages = useCallback(
    async (convId, searchQuery = '') => {
      const api = getApi();
      if (!convId || !api?.getMessages) {
        setMessages([]);
        return;
      }
      setLoadingMsgs(true);
      try {
        const res = await api.getMessages(convId, {
          limit: 150,
          search: searchQuery || undefined
        });
        const list = Array.isArray(res) ? res : res?.messages || [];
        setMessages(list);
      } catch (err) {
        onToast?.(err?.message || t('error'), 'error');
      } finally {
        setLoadingMsgs(false);
      }
    },
    [onToast, t]
  );

  useEffect(() => {
    if (!activeChatId) {
      setMessages([]);
      return;
    }
    loadMessages(activeChatId, debouncedMsgSearch);
    const api = getApi();
    if (!debouncedMsgSearch && api?.markRead) {
      api.markRead(activeChatId).then(() => {
        onRefreshConversations?.();
      }).catch(() => {});
    }
  }, [activeChatId, debouncedMsgSearch, loadMessages, onRefreshConversations]);

  // Scroll to bottom when messages load or new message added (not when searching)
  useEffect(() => {
    if (!debouncedMsgSearch && messages.length > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length, activeChatId, debouncedMsgSearch]);

  // Real-time event listeners
  useEffect(() => {
    const api = getApi();
    if (!api?.onEvent) return undefined;
    const unsubs = [];

    unsubs.push(
      api.onEvent('chat:message', (msg) => {
        if (!msg || msg.conversation_id !== activeChatIdRef.current) return;
        setMessages((prev) => {
          const exists = prev.some((m) => m.id === msg.id);
          if (exists) {
            return prev.map((m) => (m.id === msg.id ? msg : m));
          }
          return [...prev, msg];
        });
        // Clear typing for sender
        if (msg.sender_uuid) {
          setTypingMap((prev) => {
            const convTyping = prev[msg.conversation_id];
            if (!convTyping || !convTyping[msg.sender_uuid]) return prev;
            const nextConv = { ...convTyping };
            delete nextConv[msg.sender_uuid];
            return { ...prev, [msg.conversation_id]: nextConv };
          });
        }
        if (msg.sender_uuid !== identity?.uuid) {
          api.markRead?.(msg.conversation_id).then(() => {
            onRefreshConversations?.();
          }).catch(() => {});
        }
      })
    );

    unsubs.push(
      api.onEvent('chat:edit', (updated) => {
        if (!updated || updated.conversation_id !== activeChatIdRef.current) return;
        setMessages((prev) =>
          prev.map((m) => (m.id === updated.id ? updated : m))
        );
      })
    );

    unsubs.push(
      api.onEvent('chat:delete', (updated) => {
        if (!updated || updated.conversation_id !== activeChatIdRef.current) return;
        setMessages((prev) =>
          prev.map((m) => (m.id === updated.id ? updated : m))
        );
      })
    );

    unsubs.push(
      api.onEvent('chat:typing', (payload) => {
        if (!payload?.conversationId || !payload?.peerUuid) return;
        if (payload.peerUuid === identity?.uuid) return;
        setTypingMap((prev) => {
          const convTyping = { ...(prev[payload.conversationId] || {}) };
          if (payload.isTyping) {
            convTyping[payload.peerUuid] = {
              displayName: payload.displayName || '',
              expiresAt: Date.now() + 4500
            };
          } else {
            delete convTyping[payload.peerUuid];
          }
          return { ...prev, [payload.conversationId]: convTyping };
        });
      })
    );

    unsubs.push(
      api.onEvent('chat:receipt', (payload) => {
        if (!payload || payload.conversationId !== activeChatIdRef.current) return;
        const ids = new Set(payload.messageIds || []);
        const rank = { sent: 1, delivered: 2, read: 3 };
        const nextRank = rank[payload.status] || 1;
        setMessages((prev) =>
          prev.map((m) => {
            if (!ids.has(m.id)) return m;
            const curRank = rank[m.receiptStatus] || 1;
            return nextRank > curRank ? { ...m, receiptStatus: payload.status } : m;
          })
        );
      })
    );

    unsubs.push(
      api.onEvent('chat:reaction', (payload) => {
        if (!payload?.messageId || payload.conversationId !== activeChatIdRef.current) return;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === payload.messageId
              ? { ...m, reactions: payload.reactions || [] }
              : m
          )
        );
      })
    );

    unsubs.push(
      api.onEvent('transfer:progress', (payload) => {
        if (!payload) return;
        if (payload.kind === 'chat_blob' || payload.blobId) {
          if (payload.percent >= 100 || payload.done) {
            setTransferProgress(null);
          } else {
            setTransferProgress(payload);
          }
        }
      })
    );

    return () => {
      for (const unsub of unsubs) {
        if (typeof unsub === 'function') unsub();
      }
    };
  }, [identity?.uuid, onRefreshConversations]);

  // Periodically prune expired typing indicators
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setTypingMap((prev) => {
        let changed = false;
        const next = {};
        for (const [convId, map] of Object.entries(prev)) {
          const filtered = {};
          for (const [uuid, info] of Object.entries(map || {})) {
            if (info.expiresAt > now) {
              filtered[uuid] = info;
            } else {
              changed = true;
            }
          }
          if (Object.keys(filtered).length > 0) {
            next[convId] = filtered;
          }
        }
        return changed ? next : prev;
      });
    }, 1500);
    return () => clearInterval(interval);
  }, []);

  // Cleanup active mic stream on unmount
  useEffect(() => {
    return () => {
      if (recTimerRef.current) clearInterval(recTimerRef.current);
      if (recStreamRef.current) {
        recStreamRef.current.getTracks().forEach((tr) => tr.stop());
      }
    };
  }, []);

  const handleSelectConversation = (convId) => {
    onSelectChat?.(convId);
    if (compact) setCompactShowThread(true);
  };

  const handleStartDm = async (peerUuid) => {
    try {
      const res = await getApi().ensureDm(peerUuid);
      if (res && res.ok === false) {
        throw new Error(res.error || t('error'));
      }
      const conv = res?.conversation || res;
      if (conv?.id) {
        await onRefreshConversations?.();
        handleSelectConversation(conv.id);
      }
    } catch (err) {
      onToast?.(err?.message || t('error'), 'error');
    }
  };

  const handleCreateGroup = async (e) => {
    e.preventDefault();
    const trimmed = groupName.trim();
    if (!trimmed) return;
    setCreatingGroup(true);
    try {
      const res = await getApi().createGroup({
        name: trimmed,
        memberUuids: groupMemberUuids
      });
      if (res && res.ok === false) {
        throw new Error(res.error || t('error'));
      }
      const conv = res?.conversation || res;
      setShowNewGroup(false);
      setGroupName('');
      setGroupMemberUuids([]);
      await onRefreshConversations?.();
      if (conv?.id) handleSelectConversation(conv.id);
    } catch (err) {
      onToast?.(err?.message || t('error'), 'error');
    } finally {
      setCreatingGroup(false);
    }
  };

  const emitTypingSignal = (typing) => {
    const api = getApi();
    if (!activeChatId || !api?.sendTyping) return;
    api.sendTyping(activeChatId, typing).catch(() => {});
  };

  const handleComposerChange = (val) => {
    setComposerText(val);
    const now = Date.now();
    if (val.trim() && now - typingThrottleRef.current > 1800) {
      typingThrottleRef.current = now;
      emitTypingSignal(true);
    }
    if (typingStopTimerRef.current) clearTimeout(typingStopTimerRef.current);
    if (val.trim()) {
      typingStopTimerRef.current = setTimeout(() => emitTypingSignal(false), 2400);
    } else {
      emitTypingSignal(false);
    }
  };

  const handleSendText = async (e) => {
    e?.preventDefault();
    const body = composerText.trim();
    if (!body || !activeChatId) return;
    setComposerText('');
    const currentReply = replyTo;
    setReplyTo(null);
    if (typingStopTimerRef.current) clearTimeout(typingStopTimerRef.current);
    emitTypingSignal(false);

    try {
      const res = await getApi().sendMessage({
        conversationId: activeChatId,
        type: 'text',
        body,
        replyToId: currentReply?.id || null
      });
      if (res && res.ok === false) {
        throw new Error(res.error || t('error'));
      }
      if (res?.message) {
        setMessages((prev) =>
          prev.some((m) => m.id === res.message.id) ? prev : [...prev, res.message]
        );
      }
      onRefreshConversations?.();
    } catch (err) {
      setComposerText(body);
      if (currentReply) setReplyTo(currentReply);
      onToast?.(err?.message || t('error'), 'error');
    }
  };

  const handleAttachFiles = async () => {
    if (!activeChatId) return;
    const caption = composerText.trim();
    const currentReply = replyTo;
    try {
      const res = await getApi().pickAndSendChatFiles(
        activeChatId,
        caption,
        currentReply?.id || null
      );
      if (res?.canceled) return;
      if (res && res.ok === false) {
        throw new Error(res.error || t('error'));
      }
      if (caption) setComposerText('');
      if (currentReply) setReplyTo(null);
      if (Array.isArray(res?.messages)) {
        setMessages((prev) => {
          const map = new Map(prev.map((m) => [m.id, m]));
          for (const m of res.messages) map.set(m.id, m);
          return Array.from(map.values());
        });
      }
      onRefreshConversations?.();
    } catch (err) {
      onToast?.(err?.message || t('error'), 'error');
    }
  };

  // Voice Note recording
  const startRecording = async () => {
    if (!activeChatId || isRecording) return;
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error(t('chatMicPermissionError'));
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recStreamRef.current = stream;

      const mimeCandidates = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus'
      ];
      const chosenMime = mimeCandidates.find(
        (m) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.(m)
      );
      const recorder = chosenMime
        ? new MediaRecorder(stream, { mimeType: chosenMime })
        : new MediaRecorder(stream);

      recChunksRef.current = [];
      recCancelledRef.current = false;
      recStartAtRef.current = Date.now();
      setRecSeconds(0);
      setIsRecording(true);

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          recChunksRef.current.push(ev.data);
        }
      };

      recorder.onstop = async () => {
        if (recTimerRef.current) {
          clearInterval(recTimerRef.current);
          recTimerRef.current = null;
        }
        stream.getTracks().forEach((tr) => tr.stop());
        recStreamRef.current = null;
        setIsRecording(false);

        if (recCancelledRef.current) {
          recChunksRef.current = [];
          return;
        }

        const durationMs = Math.max(400, Date.now() - recStartAtRef.current);
        const blob = new Blob(recChunksRef.current, {
          type: recorder.mimeType || 'audio/webm'
        });
        recChunksRef.current = [];
        if (blob.size === 0) return;

        const reader = new FileReader();
        reader.onloadend = async () => {
          const voiceDataUrl = String(reader.result || '');
          const currentReply = replyTo;
          setReplyTo(null);
          try {
            const res = await getApi().sendMessage({
              conversationId: activeChatIdRef.current,
              type: 'voice',
              voiceDataUrl,
              durationMs,
              replyToId: currentReply?.id || null
            });
            if (res && res.ok === false) {
              throw new Error(res.error || t('error'));
            }
            if (res?.message) {
              setMessages((prev) =>
                prev.some((m) => m.id === res.message.id) ? prev : [...prev, res.message]
              );
            }
            onRefreshConversations?.();
          } catch (err) {
            onToast?.(err?.message || t('error'), 'error');
          }
        };
        reader.readAsDataURL(blob);
      };

      mediaRecorderRef.current = recorder;
      recorder.start(250);
      recTimerRef.current = setInterval(() => {
        setRecSeconds(Math.floor((Date.now() - recStartAtRef.current) / 1000));
      }, 300);
    } catch (err) {
      onToast?.(err?.message || t('chatMicPermissionError'), 'error');
    }
  };

  const stopAndSendRecording = () => {
    recCancelledRef.current = false;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  };

  const cancelRecording = () => {
    recCancelledRef.current = true;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    } else {
      if (recStreamRef.current) {
        recStreamRef.current.getTracks().forEach((tr) => tr.stop());
        recStreamRef.current = null;
      }
      setIsRecording(false);
    }
  };

  // Drag & Drop Handlers (OS files/folders AND Vault items)
  const handleDragEnter = (e) => {
    if (!activeChatId) return;
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current += 1;
    const types = Array.from(e.dataTransfer?.types || []);
    if (
      types.includes('application/x-twinsync-vault') ||
      types.includes('application/x-workmesh-vault')
    ) {
      setDragKind('vault');
    } else if (types.includes('Files')) {
      setDragKind('os');
    }
  };

  const handleDragOver = (e) => {
    if (!activeChatId) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  };

  const handleDragLeave = (e) => {
    if (!activeChatId) return;
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) {
      setDragKind(null);
    }
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current = 0;
    setDragKind(null);
    if (!activeChatId) return;

    const vaultRaw =
      e.dataTransfer?.getData('application/x-twinsync-vault') ||
      e.dataTransfer?.getData('application/x-workmesh-vault');
    if (vaultRaw) {
      try {
        const vaultItem = JSON.parse(vaultRaw);
        if (!vaultItem?.relPath) return;
        const permRes = await getApi().checkVaultSharePermission(vaultItem.relPath);
        if (permRes?.isProtected) {
          setShareChoiceModal({
            relPath: vaultItem.relPath,
            name: vaultItem.name || vaultItem.relPath.split('/').pop(),
            isDir: Boolean(vaultItem.isDir),
            caption: '',
            mode: 'deeplink'
          });
        } else {
          setCaptionModal({
            kind: 'vault_public',
            relPath: vaultItem.relPath,
            name: vaultItem.name || vaultItem.relPath.split('/').pop(),
            isDir: Boolean(vaultItem.isDir),
            caption: ''
          });
        }
      } catch (err) {
        onToast?.(err?.message || t('error'), 'error');
      }
      return;
    }

    const osPaths = Array.from(e.dataTransfer?.files || [])
      .map((f) => f.path)
      .filter(Boolean);
    if (osPaths.length > 0) {
      setCaptionModal({
        kind: 'os',
        osPaths,
        caption: ''
      });
    }
  };

  const handleConfirmCaptionModal = async (e) => {
    e.preventDefault();
    if (!captionModal || !activeChatId) return;
    const modal = captionModal;
    const currentReply = replyTo;
    setCaptionModal(null);
    setReplyTo(null);

    try {
      if (modal.kind === 'os') {
        const res = await getApi().sendDroppedOsPathsToChat(
          activeChatId,
          modal.osPaths,
          modal.caption.trim(),
          currentReply?.id || null
        );
        if (res && res.ok === false) {
          throw new Error(res.error || t('error'));
        }
        if (Array.isArray(res?.messages)) {
          setMessages((prev) => {
            const map = new Map(prev.map((m) => [m.id, m]));
            for (const m of res.messages) map.set(m.id, m);
            return Array.from(map.values());
          });
        }
      } else {
        const res = await getApi().shareVaultItemToChat({
          conversationId: activeChatId,
          relPath: modal.relPath,
          mode: 'deeplink',
          caption: modal.caption.trim(),
          replyToId: currentReply?.id || null
        });
        if (res && res.ok === false) {
          throw new Error(res.error || t('error'));
        }
        if (res?.message) {
          setMessages((prev) =>
            prev.some((m) => m.id === res.message.id) ? prev : [...prev, res.message]
          );
        }
      }
      onRefreshConversations?.();
    } catch (err) {
      onToast?.(err?.message || t('error'), 'error');
    }
  };

  const handleConfirmShareChoice = async (e) => {
    e.preventDefault();
    if (!shareChoiceModal || !activeChatId) return;
    const modal = shareChoiceModal;
    const currentReply = replyTo;
    setShareChoiceModal(null);
    setReplyTo(null);

    try {
      const res = await getApi().shareVaultItemToChat({
        conversationId: activeChatId,
        relPath: modal.relPath,
        mode: modal.mode,
        caption: modal.caption.trim(),
        replyToId: currentReply?.id || null
      });
      if (res && res.ok === false) {
        throw new Error(res.error || t('error'));
      }
      if (res?.message) {
        setMessages((prev) =>
          prev.some((m) => m.id === res.message.id) ? prev : [...prev, res.message]
        );
      }
      onRefreshConversations?.();
    } catch (err) {
      onToast?.(err?.message || t('error'), 'error');
    }
  };

  // Message actions
  const handleStartEdit = (msg) => {
    setEditingMsg(msg);
    setEditBody(msg.body || '');
    setMsgMenu(null);
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editingMsg) return;
    const nextBody = editBody.trim();
    if (!nextBody) return;
    try {
      const res = await getApi().editMessage(editingMsg.id, nextBody);
      if (res && res.ok === false) {
        throw new Error(res.error || t('error'));
      }
      if (res?.message) {
        setMessages((prev) =>
          prev.map((m) => (m.id === res.message.id ? res.message : m))
        );
      }
      setEditingMsg(null);
      setEditBody('');
      onRefreshConversations?.();
    } catch (err) {
      onToast?.(err?.message || t('error'), 'error');
    }
  };

  const handleDeleteMessage = async (msg) => {
    setMsgMenu(null);
    try {
      const res = await getApi().deleteMessage(msg.id);
      if (res && res.ok === false) {
        throw new Error(res.error || t('error'));
      }
      if (res?.message) {
        setMessages((prev) =>
          prev.map((m) => (m.id === res.message.id ? res.message : m))
        );
      }
      onRefreshConversations?.();
    } catch (err) {
      onToast?.(err?.message || t('error'), 'error');
    }
  };

  const handleToggleReaction = async (msgId, emoji) => {
    setMsgMenu(null);
    try {
      const res = await getApi().toggleReaction(msgId, emoji);
      if (res && res.ok === false) {
        throw new Error(res.error || t('error'));
      }
      if (Array.isArray(res?.reactions)) {
        setMessages((prev) =>
          prev.map((m) => (m.id === msgId ? { ...m, reactions: res.reactions } : m))
        );
      }
    } catch (err) {
      onToast?.(err?.message || t('error'), 'error');
    }
  };

  const handleCopyMessageText = async (msg) => {
    setMsgMenu(null);
    const textToCopy = msg?.body || getMessagePreviewText(msg, t);
    if (!textToCopy) return;
    const ok = await copyTextSafe(textToCopy);
    if (ok) {
      onToast?.(t('copied'), 'success');
    } else {
      onToast?.(t('error'), 'error');
    }
  };

  const handleForwardToConversation = async (targetConvId) => {
    if (!forwardMsg || !targetConvId) return;
    setForwarding(true);
    try {
      const att = parseAttachment(forwardMsg);
      const res = await getApi().sendMessage({
        conversationId: targetConvId,
        type: forwardMsg.type || 'text',
        body: forwardMsg.body || '',
        attachment: att,
        vault_link_path: forwardMsg.vault_link_path || null,
        vault_link_is_dir: Boolean(forwardMsg.vault_link_is_dir),
        forwardedFromId: forwardMsg.id
      });
      if (res && res.ok === false) {
        throw new Error(res.error || t('error'));
      }
      setForwardMsg(null);
      onToast?.(t('success'), 'success');
      onRefreshConversations?.();
      handleSelectConversation(targetConvId);
    } catch (err) {
      onToast?.(err?.message || t('error'), 'error');
    } finally {
      setForwarding(false);
    }
  };

  // Smart Attachment Card Actions
  const handleOpenAttachment = async (att) => {
    try {
      const res = await getApi().openChatAttachment(att);
      if (res && res.ok === false) {
        throw new Error(res.error || t('error'));
      }
      if (res?.isFolder) {
        setFolderPreviewModal({
          sessionId: res.sessionId,
          rootName: res.rootName || att.originalName || att.fileName,
          entries: res.entries || []
        });
      }
    } catch (err) {
      onToast?.(err?.message || t('error'), 'error');
    }
  };

  const handleOpenExtractedEntry = async (entryRelPath) => {
    if (!folderPreviewModal?.sessionId) return;
    try {
      const res = await getApi().openExtractedFolderEntry(
        folderPreviewModal.sessionId,
        entryRelPath
      );
      if (res && res.ok === false) {
        throw new Error(res.error || t('error'));
      }
    } catch (err) {
      onToast?.(err?.message || t('error'), 'error');
    }
  };

  const handleSaveAttachmentToPc = async (att) => {
    try {
      const res = await getApi().saveChatAttachmentToPc(att);
      if (res?.canceled) return;
      if (res && res.ok === false) {
        throw new Error(res.error || t('error'));
      }
      onToast?.(t('success'), 'success');
    } catch (err) {
      onToast?.(err?.message || t('error'), 'error');
    }
  };

  // Vault Folder Picker for "Save to Vault"
  const loadPickerFolder = async (folderPath, attOverride = null) => {
    setVaultPickerModal((prev) => ({
      ...(prev || {}),
      att: attOverride || prev?.att,
      currentFolder: folderPath,
      loading: true,
      password: '',
      unlockError: '',
      showNewFolder: false,
      newFolderName: ''
    }));
    try {
      const res = await getApi().vaultList(folderPath);
      const rawItems = Array.isArray(res) ? res : res?.items || [];
      const dirItems = rawItems.filter((item) => Boolean(item.is_dir));
      setVaultPickerModal((prev) =>
        prev
          ? {
              ...prev,
              currentFolder: folderPath,
              items: dirItems,
              locked: Boolean(res?.locked),
              blockingAncestor: res?.blockingAncestor || null,
              loading: false
            }
          : null
      );
    } catch (err) {
      setVaultPickerModal((prev) => (prev ? { ...prev, loading: false } : null));
      onToast?.(err?.message || t('error'), 'error');
    }
  };

  const handleOpenVaultPicker = (att) => {
    loadPickerFolder('', att);
  };

  const handleUnlockPickerFolder = async (e) => {
    e.preventDefault();
    if (!vaultPickerModal?.blockingAncestor?.relPath) return;
    try {
      const res = await getApi().vaultUnlockFolder(
        vaultPickerModal.blockingAncestor.relPath,
        vaultPickerModal.password
      );
      if (!res?.ok) {
        setVaultPickerModal((prev) =>
          prev ? { ...prev, unlockError: t('unlockWrongPassword') } : null
        );
        return;
      }
      await loadPickerFolder(vaultPickerModal.currentFolder);
    } catch {
      setVaultPickerModal((prev) =>
        prev ? { ...prev, unlockError: t('unlockWrongPassword') } : null
      );
    }
  };

  const handlePickerCreateFolder = async (e) => {
    e.preventDefault();
    const name = vaultPickerModal?.newFolderName?.trim();
    if (!name) return;
    try {
      const res = await getApi().vaultCreateFolder(
        vaultPickerModal.currentFolder,
        name
      );
      if (res && res.ok === false) {
        throw new Error(res.error || t('error'));
      }
      await loadPickerFolder(vaultPickerModal.currentFolder);
    } catch (err) {
      onToast?.(err?.message || t('error'), 'error');
    }
  };

  const handleSaveAttachmentToChosenVault = async (att, targetFolder, strategy = 'prompt') => {
    try {
      const res = await getApi().saveChatAttachmentToVault(
        att,
        targetFolder,
        strategy
      );
      if (res?.conflict) {
        setVaultPickerModal(null);
        setSaveConflictModal({
          att,
          targetFolder,
          conflicts: res.conflicts || []
        });
        return;
      }
      if (res && res.ok === false) {
        throw new Error(res.error || t('error'));
      }
      setVaultPickerModal(null);
      setSaveConflictModal(null);
      onToast?.(t('success'), 'success');
    } catch (err) {
      onToast?.(err?.message || t('error'), 'error');
    }
  };

  const scrollToMessage = (msgId) => {
    const el = document.getElementById(`wm-msg-${msgId}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlightedMsgId(msgId);
    setTimeout(() => {
      setHighlightedMsgId((cur) => (cur === msgId ? null : cur));
    }, 1800);
  };

  // Filtered conversations & peers for sidebar
  const qLower = sidebarSearch.trim().toLowerCase();
  const filteredConversations = useMemo(() => {
    if (!qLower) return conversations;
    return conversations.filter((conv) => {
      const title = getConversationTitle(conv, t).toLowerCase();
      const preview = getMessagePreviewText(conv.lastMessage, t).toLowerCase();
      return title.includes(qLower) || preview.includes(qLower);
    });
  }, [conversations, qLower, t]);

  const filteredPeers = useMemo(() => {
    const list = peers.filter((p) => p.uuid !== identity?.uuid);
    if (!qLower) return list;
    return list.filter((p) => (p.display_name || '').toLowerCase().includes(qLower));
  }, [peers, identity?.uuid, qLower]);

  // Active typing peers in active conversation
  const activeTypingUsers = useMemo(() => {
    const map = typingMap[activeChatId] || {};
    return Object.values(map);
  }, [typingMap, activeChatId]);

  const activePeer = useMemo(() => {
    if (!activeConversation || activeConversation.type !== 'dm') return null;
    const convPeer = activeConversation.peer;
    if (!convPeer) return null;
    return peers.find((p) => p.uuid === convPeer.uuid) || convPeer;
  }, [activeConversation, peers]);

  const showSidebar = !compact || !compactShowThread || !activeChatId;
  const showThread = !compact || (compactShowThread && Boolean(activeChatId));

  const BackChevron = isRtl ? ArrowRight : ArrowLeft;
  const BreadcrumbArrow = isRtl ? ChevronLeft : ChevronRight;

  return (
    <div className="flex-1 min-w-0 h-full flex bg-slate-50 dark:bg-slate-950 overflow-hidden relative">
      {/* LEFT / START SIDEBAR: Peers & Conversations */}
      {showSidebar && (
        <aside
          className={`${
            compact ? 'w-full' : 'w-80 xl:w-[340px]'
          } shrink-0 h-full bg-white dark:bg-slate-900 border-e border-slate-200/80 dark:border-slate-800 flex flex-col overflow-hidden`}
        >
          {/* Sidebar Header */}
          <div className="px-4 py-3.5 border-b border-slate-200/80 dark:border-slate-800 flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                <MessageSquare className="w-4 h-4" strokeWidth={1.5} />
              </div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                {t('chatTitle')}
              </h2>
            </div>

            <button
              type="button"
              onClick={() => setShowNewGroup(true)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition shrink-0"
              title={t('chatNewGroup')}
            >
              <Users className="w-3.5 h-3.5" strokeWidth={1.5} />
              <span>{t('chatNewGroup')}</span>
            </button>
          </div>

          {/* Search Bar */}
          <div className="p-3 border-b border-slate-100 dark:border-slate-800/80 shrink-0">
            <div className="relative">
              <Search
                className="w-4 h-4 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2"
                strokeWidth={1.5}
              />
              <input
                type="text"
                value={sidebarSearch}
                onChange={(e) => setSidebarSearch(e.target.value)}
                placeholder={t('chatSearchPlaceholder')}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700/80 bg-slate-50 dark:bg-slate-950 ps-9 pe-8 py-2 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 transition"
              />
              {sidebarSearch && (
                <button
                  type="button"
                  onClick={() => setSidebarSearch('')}
                  className="absolute end-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  <X className="w-3.5 h-3.5" strokeWidth={1.5} />
                </button>
              )}
            </div>
          </div>

          {/* Quick-Start Peers Strip */}
          {filteredPeers.length > 0 && (
            <div className="px-3 py-2.5 border-b border-slate-100 dark:border-slate-800/80 shrink-0">
              <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-2">
                {t('chatOnlinePeers')} ({filteredPeers.filter((p) => p.status === 'online').length})
              </div>
              <div className="flex items-center gap-2.5 overflow-x-auto pb-1">
                {filteredPeers.map((peer) => {
                  const isOn = peer.status === 'online';
                  return (
                    <button
                      key={peer.uuid}
                      type="button"
                      onClick={() => handleStartDm(peer.uuid)}
                      title={peer.display_name}
                      className="flex flex-col items-center gap-1 min-w-[54px] max-w-[60px] group shrink-0"
                    >
                      <div className="relative">
                        <UserAvatar
                          name={peer.display_name}
                          avatarData={peer.avatar_data}
                          size="md"
                          className="group-hover:ring-2 group-hover:ring-indigo-500/50 transition"
                        />
                        <span
                          className={`absolute bottom-0 end-0 w-2.5 h-2.5 rounded-full ring-2 ring-white dark:ring-slate-900 ${
                            isOn ? 'bg-emerald-500' : 'bg-slate-400'
                          }`}
                        />
                      </div>
                      <span className="inline-flex items-center justify-center gap-0.5 text-[10px] font-medium text-slate-600 dark:text-slate-300 max-w-full">
                        <DeviceTypeBadge deviceType={peer.device_type} t={t} />
                        <span className="truncate">{peer.display_name || t('unknown')}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Conversations List */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100/80 dark:divide-slate-800/50">
            {filteredConversations.length === 0 ? (
              <div className="p-6 text-center space-y-2">
                <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                  {t('chatNoConversations')}
                </p>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  {t('chatStartPrompt')}
                </p>
              </div>
            ) : (
              filteredConversations.map((conv) => {
                const isActive = conv.id === activeChatId;
                const title = getConversationTitle(conv, t);
                const livePeer =
                  conv.type === 'dm' && conv.peer
                    ? peers.find((p) => p.uuid === conv.peer.uuid) || conv.peer
                    : null;
                const isOnline = livePeer?.status === 'online';
                const convTyping = Object.values(typingMap[conv.id] || {});
                const previewText =
                  convTyping.length > 0
                    ? t('chatTyping')
                    : getMessagePreviewText(conv.lastMessage, t);

                return (
                  <button
                    key={conv.id}
                    type="button"
                    onClick={() => handleSelectConversation(conv.id)}
                    className={`w-full px-3.5 py-3 flex items-center gap-3 text-start transition ${
                      isActive
                        ? 'bg-indigo-50/90 dark:bg-indigo-500/15'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'
                    }`}
                  >
                    <div className="relative shrink-0">
                      {conv.type === 'group' ? (
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-white flex items-center justify-center shadow-sm">
                          <Users className="w-5 h-5" strokeWidth={1.5} />
                        </div>
                      ) : (
                        <UserAvatar
                          name={title}
                          avatarData={conv.avatar_data}
                          size="md"
                        />
                      )}
                      {conv.type === 'dm' && (
                        <span
                          className={`absolute bottom-0 end-0 w-2.5 h-2.5 rounded-full ring-2 ring-white dark:ring-slate-900 ${
                            isOnline ? 'bg-emerald-500' : 'bg-slate-400'
                          }`}
                        />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-slate-900 dark:text-white truncate flex items-center gap-1 min-w-0">
                          <span className="truncate">{title}</span>
                          {conv.type === 'dm' && (
                            <DeviceTypeBadge
                              deviceType={livePeer?.device_type || conv.peer?.device_type}
                              t={t}
                            />
                          )}
                        </span>
                        <span className="text-[10px] text-slate-400 shrink-0">
                          {formatMessageTime(
                            conv.lastMessage?.created_at || conv.updated_at,
                            lang
                          )}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-0.5">
                        <span
                          className={`text-[11px] truncate ${
                            convTyping.length > 0
                              ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
                              : 'text-slate-500 dark:text-slate-400'
                          }`}
                        >
                          {previewText ||
                            (conv.type === 'group'
                              ? t('chatMembersCount', {
                                  count: conv.members?.length || 0
                                })
                              : '')}
                        </span>
                        {conv.unreadCount > 0 && (
                          <span className="min-w-[18px] h-[18px] px-1.5 rounded-full bg-emerald-500 text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                            {conv.unreadCount > 99 ? '99+' : conv.unreadCount}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </aside>
      )}

      {/* RIGHT / END PANE: Active Thread */}
      {showThread && (
        <section
          className="flex-1 min-w-0 h-full flex flex-col relative overflow-hidden bg-[#efeae2]/40 dark:bg-slate-950"
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {!activeConversation ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500/15 to-emerald-500/15 border border-indigo-200/60 dark:border-indigo-500/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400 mb-4">
                <MessageSquare className="w-8 h-8" strokeWidth={1.5} />
              </div>
              <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 mb-1">
                {t('chatSelectPeer')}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm leading-relaxed">
                {t('chatStartPrompt')}
              </p>
            </div>
          ) : (
            <>
              {/* Thread Header */}
              <header className="px-4 py-3 bg-white/95 dark:bg-slate-900/95 border-b border-slate-200/80 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0 z-10">
                <div className="flex items-center gap-3 min-w-0">
                  {compact && (
                    <button
                      type="button"
                      onClick={() => setCompactShowThread(false)}
                      className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition shrink-0"
                      title={t('back')}
                    >
                      <BackChevron className="w-4 h-4" strokeWidth={1.5} />
                    </button>
                  )}

                  <div className="relative shrink-0">
                    {activeConversation.type === 'group' ? (
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-white flex items-center justify-center shadow-sm">
                        <Users className="w-5 h-5" strokeWidth={1.5} />
                      </div>
                    ) : (
                      <UserAvatar
                        name={getConversationTitle(activeConversation, t)}
                        avatarData={activeConversation.avatar_data}
                        size="md"
                      />
                    )}
                    {activeConversation.type === 'dm' && (
                      <span
                        className={`absolute bottom-0 end-0 w-2.5 h-2.5 rounded-full ring-2 ring-white dark:ring-slate-900 ${
                          activePeer?.status === 'online'
                            ? 'bg-emerald-500'
                            : 'bg-slate-400'
                        }`}
                      />
                    )}
                  </div>

                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate flex items-center gap-1.5">
                      <span className="truncate">{getConversationTitle(activeConversation, t)}</span>
                      {activeConversation.type === 'dm' && (
                        <DeviceTypeBadge deviceType={activePeer?.device_type} t={t} />
                      )}
                    </h3>
                    <div className="text-[11px] truncate">
                      {activeTypingUsers.length > 0 ? (
                        <span className="text-emerald-600 dark:text-emerald-400 font-semibold animate-pulse">
                          {activeConversation.type === 'group' &&
                          activeTypingUsers[0]?.displayName
                            ? `${activeTypingUsers[0].displayName}: ${t('chatTyping')}`
                            : t('chatTyping')}
                        </span>
                      ) : activeConversation.type === 'group' ? (
                        <span className="text-slate-500 dark:text-slate-400">
                          {t('chatMembersCount', {
                            count: activeConversation.members?.length || 0
                          })}
                        </span>
                      ) : activePeer?.status === 'online' ? (
                        <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                          {t('online')}
                        </span>
                      ) : (
                        <span className="text-slate-500 dark:text-slate-400">
                          {formatLastSeen(activePeer?.last_seen, t, lang)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setShowMsgSearch((prev) => !prev);
                      if (showMsgSearch) setMsgSearch('');
                    }}
                    title={t('chatSearchMessages')}
                    className={`p-2 rounded-xl transition ${
                      showMsgSearch
                        ? 'bg-indigo-50 dark:bg-indigo-500/15 text-indigo-600 dark:text-indigo-400'
                        : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <Search className="w-4 h-4" strokeWidth={1.5} />
                  </button>
                </div>
              </header>

              {/* Message Search Bar */}
              {showMsgSearch && (
                <div className="px-4 py-2 bg-white dark:bg-slate-900 border-b border-slate-200/80 dark:border-slate-800 flex items-center gap-2 shrink-0">
                  <Search className="w-4 h-4 text-slate-400 shrink-0" strokeWidth={1.5} />
                  <input
                    type="text"
                    value={msgSearch}
                    onChange={(e) => setMsgSearch(e.target.value)}
                    placeholder={t('chatSearchMessages')}
                    autoFocus
                    className="flex-1 bg-transparent text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none"
                  />
                  {msgSearch && (
                    <button
                      type="button"
                      onClick={() => setMsgSearch('')}
                      className="p-1 text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-3.5 h-3.5" strokeWidth={1.5} />
                    </button>
                  )}
                </div>
              )}

              {/* Active Blob Transfer Progress */}
              {transferProgress && (
                <div className="px-4 py-1.5 bg-indigo-50 dark:bg-indigo-950/50 border-b border-indigo-200/70 dark:border-indigo-800/60 flex items-center gap-3 text-[11px] text-indigo-700 dark:text-indigo-300 shrink-0">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0" strokeWidth={1.5} />
                  <span className="truncate flex-1">
                    {transferProgress.fileName || t('loading')}
                  </span>
                  <span className="font-mono font-semibold">
                    {transferProgress.percent}%
                  </span>
                </div>
              )}

              {/* Messages Feed */}
              <div
                onScroll={() => {
                  if (msgMenu) setMsgMenu(null);
                }}
                className="flex-1 overflow-y-auto px-4 py-4"
              >
                {loadingMsgs && messages.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-slate-400 gap-2">
                    <RefreshCw className="w-5 h-5 animate-spin text-indigo-500" strokeWidth={1.5} />
                    <span className="text-xs">{t('loading')}</span>
                  </div>
                ) : messages.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-center text-xs text-slate-400">
                    {debouncedMsgSearch ? t('noResults') : t('chatDropFilesHint')}
                  </div>
                ) : (
                  messages.map((msg, idx) => {
                    const isMine = msg.sender_uuid === identity?.uuid;
                    const isDeleted = Boolean(msg.deleted_at);
                    const isFirstInGroup =
                      idx === 0 || messages[idx - 1].sender_uuid !== msg.sender_uuid;
                    const isLastInGroup =
                      idx === messages.length - 1 ||
                      messages[idx + 1].sender_uuid !== msg.sender_uuid;
                    const att = parseAttachment(msg);
                    const isVoice = msg.type === 'voice' && att;
                    const isVaultLink =
                      msg.type === 'vault_link' || Boolean(msg.vault_link_path);
                    const isImageAtt =
                      !isVoice &&
                      !isVaultLink &&
                      att &&
                      !att.isFolder &&
                      (msg.type === 'image' ||
                        String(att.mime || '').startsWith('image/'));
                    const isDirectFileAtt = !isVoice && !isVaultLink && Boolean(att);

                    // Aggregate reactions
                    const groupedReactions = [];
                    if (Array.isArray(msg.reactions) && msg.reactions.length > 0) {
                      const rxMap = new Map();
                      for (const r of msg.reactions) {
                        if (!rxMap.has(r.emoji)) {
                          rxMap.set(r.emoji, { emoji: r.emoji, count: 0, mine: false });
                        }
                        const entry = rxMap.get(r.emoji);
                        entry.count += 1;
                        if (r.peer_uuid === identity?.uuid) entry.mine = true;
                      }
                      groupedReactions.push(...rxMap.values());
                    }

                    const isHighlighted = highlightedMsgId === msg.id;

                    return (
                      <div
                        key={msg.id}
                        id={`wm-msg-${msg.id}`}
                        className={`flex flex-col ${
                          isMine ? 'items-end' : 'items-start'
                        } ${isLastInGroup ? 'mb-3.5' : 'mb-1'}`}
                      >
                        <div
                          onContextMenu={(e) => {
                            if (isDeleted) return;
                            e.preventDefault();
                            openMessageMenu(e, msg);
                          }}
                          className={`group relative w-fit max-w-[68%] h-auto px-3 pt-2 pb-1.5 shadow-sm transition-all ${
                            isFirstInGroup
                              ? isMine
                                ? 'rounded-2xl rounded-se-none ts-bubble-tail-me'
                                : 'rounded-2xl rounded-ss-none ts-bubble-tail-other'
                              : 'rounded-2xl'
                          } ${
                            isMine
                              ? 'bg-indigo-600 text-white'
                              : 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border border-slate-200/80 dark:border-slate-800'
                          } ${isHighlighted ? 'ring-2 ring-amber-400 scale-[1.01]' : ''}`}
                        >
                          {/* Hover Chevron Dropdown Trigger */}
                          {!isDeleted && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                openMessageMenu(e, msg);
                              }}
                              aria-label={t('open')}
                              className={`absolute top-1 end-1 z-10 p-0.5 rounded-full opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity ${
                                isMine
                                  ? 'bg-indigo-700/90 hover:bg-indigo-800 text-white'
                                  : 'bg-white/95 dark:bg-slate-800/95 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-300 shadow-xs'
                              }`}
                            >
                              <ChevronDown className="w-3.5 h-3.5" strokeWidth={2} />
                            </button>
                          )}

                          {/* Group sender name ONLY on first message in group */}
                          {!isMine && activeConversation.type === 'group' && isFirstInGroup && (
                            <div className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 mb-1">
                              {msg.sender_name || t('unknown')}
                            </div>
                          )}

                          {/* Forwarded badge */}
                          {!isDeleted && msg.forwarded_from_id && (
                            <div
                              className={`flex items-center gap-1 text-[10px] italic mb-1 ${
                                isMine ? 'text-indigo-100' : 'text-slate-400'
                              }`}
                            >
                              <Forward className="w-3 h-3" strokeWidth={1.5} />
                              <span>{t('chatForward')}</span>
                            </div>
                          )}

                          {/* Quoted Reply Header (clickable) */}
                          {!isDeleted && msg.replyTo && (
                            <button
                              type="button"
                              onClick={() => scrollToMessage(msg.replyTo.id)}
                              className={`w-full text-start mb-2 px-2.5 py-1.5 rounded-xl border-s-4 transition block ${
                                isMine
                                  ? 'bg-white/15 hover:bg-white/20 border-emerald-300 text-white'
                                  : 'bg-slate-100 hover:bg-slate-200/80 dark:bg-slate-800/80 dark:hover:bg-slate-800 border-indigo-500 text-slate-700 dark:text-slate-200'
                              }`}
                            >
                              <div className="text-[10px] font-bold truncate">
                                {msg.replyTo.sender_name || t('unknown')}
                              </div>
                              <div className="text-[11px] opacity-85 truncate">
                                {getMessagePreviewText(msg.replyTo, t)}
                              </div>
                            </button>
                          )}

                          {/* Deleted state */}
                          {isDeleted ? (
                            <div
                              className={`text-xs italic ${
                                isMine
                                  ? 'text-indigo-100/85'
                                  : 'text-slate-400 dark:text-slate-500'
                              }`}
                            >
                              {t('chatDeletedMessage')}
                            </div>
                          ) : (
                            <div className="space-y-2">
                              {/* Voice Note */}
                              {isVoice && (
                                <VoiceNotePlayer
                                  msg={msg}
                                  att={att}
                                  isMine={isMine}
                                  t={t}
                                  getCachedBlobUrl={getCachedBlobUrl}
                                />
                              )}

                              {/* Vault Deep-Link Card */}
                              {isVaultLink && (
                                <div
                                  className={`rounded-xl p-3 border transition ${
                                    isMine
                                      ? 'bg-white/15 border-white/25 text-white'
                                      : 'bg-indigo-50/70 dark:bg-indigo-950/35 border-indigo-200/80 dark:border-indigo-500/30 text-slate-900 dark:text-slate-100'
                                  }`}
                                >
                                  <div className="flex items-start gap-2.5">
                                    <div
                                      className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                                        isMine
                                          ? 'bg-white/20 text-white'
                                          : 'bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-300'
                                      }`}
                                    >
                                      {msg.vault_link_is_dir ? (
                                        <Folder className="w-5 h-5" strokeWidth={1.5} />
                                      ) : (
                                        <FileText className="w-5 h-5" strokeWidth={1.5} />
                                      )}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <div className="text-[10px] font-semibold uppercase tracking-wide opacity-80">
                                        {t('chatVaultDeepLinkTitle')}
                                      </div>
                                      <div className="text-xs font-bold truncate mt-0.5">
                                        {String(msg.vault_link_path || '').split('/').pop()}
                                      </div>
                                      <div
                                        className="text-[10px] font-mono opacity-75 truncate"
                                        dir="ltr"
                                      >
                                        /{msg.vault_link_path}
                                      </div>
                                    </div>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      onOpenVaultDeepLink?.(msg.vault_link_path)
                                    }
                                    className={`mt-2.5 w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                                      isMine
                                        ? 'bg-white text-indigo-700 hover:bg-indigo-50'
                                        : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                                    }`}
                                  >
                                    <ExternalLink className="w-3.5 h-3.5" strokeWidth={1.5} />
                                    <span>{t('chatVaultDeepLinkOpen')}</span>
                                  </button>
                                </div>
                              )}

                              {/* Direct File / Folder Smart Attachment Card */}
                              {isDirectFileAtt && (
                                <div className="space-y-2">
                                  {isImageAtt && (
                                    <ImageAttachmentThumb
                                      att={att}
                                      getCachedBlobUrl={getCachedBlobUrl}
                                      onClick={() => handleOpenAttachment(att)}
                                    />
                                  )}

                                  <div
                                    className={`rounded-xl p-2.5 border ${
                                      isMine
                                        ? 'bg-white/10 border-white/20'
                                        : 'bg-slate-50 dark:bg-slate-950/60 border-slate-200/80 dark:border-slate-800'
                                    }`}
                                  >
                                    <div className="flex items-center gap-2.5">
                                      <div
                                        className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                                          att.isFolder
                                            ? 'bg-amber-500/20 text-amber-500'
                                            : isMine
                                            ? 'bg-white/20 text-white'
                                            : 'bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400'
                                        }`}
                                      >
                                        {att.isFolder ? (
                                          <FileArchive className="w-5 h-5" strokeWidth={1.5} />
                                        ) : (
                                          <File className="w-5 h-5" strokeWidth={1.5} />
                                        )}
                                      </div>
                                      <div className="min-w-0 flex-1">
                                        <div className="text-xs font-bold truncate">
                                          {att.originalName || att.fileName}
                                        </div>
                                        <div
                                          className={`text-[10px] flex items-center gap-2 ${
                                            isMine
                                              ? 'text-indigo-100'
                                              : 'text-slate-500 dark:text-slate-400'
                                          }`}
                                        >
                                          <span>{formatBytes(att.size)}</span>
                                          {att.isFolder && (
                                            <span>
                                              • {t('chatFolderPreviewCount', {
                                                count: att.entryCount || 0
                                              })}
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    </div>

                                    {/* 3 Explicit Attachment Buttons */}
                                    <div className="grid grid-cols-3 gap-1.5 mt-2.5">
                                      <button
                                        type="button"
                                        onClick={() => handleOpenAttachment(att)}
                                        className={`inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-semibold transition ${
                                          isMine
                                            ? 'bg-white text-indigo-700 hover:bg-indigo-50'
                                            : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                                        }`}
                                      >
                                        <ExternalLink className="w-3 h-3" strokeWidth={1.5} />
                                        <span className="truncate">
                                          {t('chatAttachmentOpen')}
                                        </span>
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleSaveAttachmentToPc(att)}
                                        className={`inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-semibold transition ${
                                          isMine
                                            ? 'bg-white/20 hover:bg-white/30 text-white'
                                            : 'bg-slate-200/80 hover:bg-slate-300/80 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200'
                                        }`}
                                      >
                                        <Download className="w-3 h-3" strokeWidth={1.5} />
                                        <span className="truncate">
                                          {t('chatAttachmentSavePc')}
                                        </span>
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleOpenVaultPicker(att)}
                                        className={`inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-semibold transition ${
                                          isMine
                                            ? 'bg-emerald-500 hover:bg-emerald-400 text-white'
                                            : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                                        }`}
                                      >
                                        <FolderInput className="w-3 h-3" strokeWidth={1.5} />
                                        <span className="truncate">
                                          {t('chatAttachmentSaveVault')}
                                        </span>
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              )}

                              {/* Inline Edit Form or Text Body */}
                              {editingMsg?.id === msg.id ? (
                                <form onSubmit={handleSaveEdit} className="space-y-2 min-w-[210px]">
                                  <input
                                    type="text"
                                    value={editBody}
                                    onChange={(e) => setEditBody(e.target.value)}
                                    autoFocus
                                    className="w-full rounded-lg px-2.5 py-1.5 text-xs bg-white text-slate-900 border border-indigo-300 focus:outline-none"
                                  />
                                  <div className="flex items-center justify-end gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => setEditingMsg(null)}
                                      className="px-2 py-1 rounded-md text-[11px] bg-black/20 hover:bg-black/30 text-white"
                                    >
                                      {t('cancel')}
                                    </button>
                                    <button
                                      type="submit"
                                      className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-emerald-500 hover:bg-emerald-600 text-white"
                                    >
                                      {t('save')}
                                    </button>
                                  </div>
                                </form>
                              ) : (
                                msg.body && (
                                  <p
                                    dir="auto"
                                    className="text-xs leading-relaxed whitespace-pre-wrap break-words"
                                  >
                                    {msg.body}
                                  </p>
                                )
                              )}
                            </div>
                          )}

                          {/* Footer: Compact Timestamp, Edited label, Receipt Checkmarks */}
                          <div
                            className={`flex justify-end items-center gap-1 mt-0.5 text-[10px] leading-none opacity-75 select-none ${
                              isMine
                                ? 'text-indigo-100'
                                : 'text-slate-500 dark:text-slate-400'
                            }`}
                          >
                            {msg.edited_at && !isDeleted && (
                              <span className="italic">{t('chatEdited')}</span>
                            )}
                            <span>{formatMessageTime(msg.created_at, lang)}</span>
                            {isMine && !isDeleted && (
                              <span
                                title={
                                  msg.receiptStatus === 'read'
                                    ? t('chatReadBy')
                                    : msg.receiptStatus === 'delivered'
                                    ? t('chatDelivered')
                                    : t('chatSent')
                                }
                              >
                                {msg.receiptStatus === 'read' ? (
                                  <CheckCheck
                                    className="w-3.5 h-3.5 text-[#38bdf8]"
                                    strokeWidth={2}
                                  />
                                ) : msg.receiptStatus === 'delivered' ? (
                                  <CheckCheck
                                    className="w-3.5 h-3.5 text-indigo-100"
                                    strokeWidth={1.75}
                                  />
                                ) : (
                                  <Check
                                    className="w-3.5 h-3.5 text-indigo-100"
                                    strokeWidth={1.75}
                                  />
                                )}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Rendered Reactions Pills */}
                        {!isDeleted && groupedReactions.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1 mt-1 px-1">
                            {groupedReactions.map((rx) => (
                              <button
                                key={rx.emoji}
                                type="button"
                                onClick={() => handleToggleReaction(msg.id, rx.emoji)}
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] border shadow-xs transition ${
                                  rx.mine
                                    ? 'bg-indigo-50 dark:bg-indigo-500/20 border-indigo-300 dark:border-indigo-500/50 text-indigo-700 dark:text-indigo-200 font-semibold'
                                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                                }`}
                              >
                                <span>{rx.emoji}</span>
                                <span>{rx.count}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Reply Quote Banner above Composer */}
              {replyTo && (
                <div className="px-4 py-2 bg-white/95 dark:bg-slate-900/95 border-t border-slate-200/80 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0">
                  <div className="flex items-center gap-2.5 min-w-0 border-s-4 border-indigo-500 ps-2.5">
                    <Reply className="w-4 h-4 text-indigo-500 shrink-0" strokeWidth={1.5} />
                    <div className="min-w-0">
                      <div className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 truncate">
                        {t('chatReplyingTo', {
                          name: replyTo.sender_name || t('unknown')
                        })}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                        {getMessagePreviewText(replyTo, t)}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setReplyTo(null)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition shrink-0"
                  >
                    <X className="w-4 h-4" strokeWidth={1.5} />
                  </button>
                </div>
              )}

              {/* Composer */}
              <div className="p-3 bg-white dark:bg-slate-900 border-t border-slate-200/80 dark:border-slate-800 shrink-0">
                {isRecording ? (
                  <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-2xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-500/30">
                    <div className="flex items-center gap-3">
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping" />
                      <span className="text-xs font-semibold text-rose-700 dark:text-rose-300">
                        {t('chatRecording')}
                      </span>
                      <div className="flex items-center gap-1 h-4">
                        {[40, 80, 55, 95, 65, 85, 45].map((h, i) => (
                          <span
                            key={i}
                            style={{ height: `${h}%` }}
                            className="w-1 rounded-full bg-rose-500 animate-pulse"
                          />
                        ))}
                      </div>
                      <span className="text-xs font-mono font-bold text-rose-700 dark:text-rose-200">
                        {formatDurationMs(recSeconds * 1000)}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={cancelRecording}
                        title={t('chatCancelRecording')}
                        className="p-2 rounded-xl bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
                      >
                        <X className="w-4 h-4" strokeWidth={1.5} />
                      </button>
                      <button
                        type="button"
                        onClick={stopAndSendRecording}
                        title={t('chatStopRecording')}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold shadow-sm transition"
                      >
                        <Square className="w-3.5 h-3.5" strokeWidth={1.5} />
                        <span>{t('chatSend')}</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <form onSubmit={handleSendText} className="flex items-end gap-2">
                    <button
                      type="button"
                      onClick={handleAttachFiles}
                      title={t('chatAttach')}
                      className="p-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition shrink-0"
                    >
                      <Paperclip className="w-4 h-4" strokeWidth={1.5} />
                    </button>

                    <textarea
                      ref={composerInputRef}
                      rows={1}
                      value={composerText}
                      onChange={(e) => handleComposerChange(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSendText();
                        }
                      }}
                      placeholder={t('chatMessagePlaceholder')}
                      dir="auto"
                      className="flex-1 max-h-28 resize-none rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3.5 py-2.5 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 transition"
                    />

                    {composerText.trim() ? (
                      <button
                        type="submit"
                        title={t('chatSend')}
                        className="p-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition shrink-0"
                      >
                        <Send className="w-4 h-4" strokeWidth={1.5} />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={startRecording}
                        title={t('chatRecordVoice')}
                        className="p-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition shrink-0"
                      >
                        <Mic className="w-4 h-4" strokeWidth={1.5} />
                      </button>
                    )}
                  </form>
                )}
              </div>
            </>
          )}

          {/* Drag-and-Drop Overlay */}
          {dragKind && activeConversation && (
            <div className="absolute inset-0 z-30 bg-indigo-600/15 dark:bg-indigo-950/70 wm-glass border-2 border-dashed border-indigo-500 rounded-xl m-2 flex flex-col items-center justify-center pointer-events-none">
              <div className="w-14 h-14 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-lg mb-3">
                {dragKind === 'vault' ? (
                  <Sparkles className="w-7 h-7" strokeWidth={1.5} />
                ) : (
                  <Paperclip className="w-7 h-7" strokeWidth={1.5} />
                )}
              </div>
              <p className="text-sm font-bold text-indigo-900 dark:text-white">
                {t('chatDropFilesHint')}
              </p>
            </div>
          )}
        </section>
      )}

      {/* MODAL: New Group */}
      {showNewGroup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 wm-glass p-4">
          <form
            onSubmit={handleCreateGroup}
            className="wm-animate-in w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-5 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Users className="w-4 h-4 text-indigo-500" strokeWidth={1.5} />
                <span>{t('chatNewGroup')}</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowNewGroup(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" strokeWidth={1.5} />
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                {t('chatGroupName')}
              </label>
              <input
                type="text"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder={t('chatGroupNamePlaceholder')}
                required
                autoFocus
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
              />
            </div>

            <div>
              <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                {t('chatGroupMembers')}
              </div>
              <div className="max-h-52 overflow-y-auto space-y-1.5 pe-1">
                {peers
                  .filter((p) => p.uuid !== identity?.uuid)
                  .map((peer) => {
                    const checked = groupMemberUuids.includes(peer.uuid);
                    return (
                      <label
                        key={peer.uuid}
                        className={`flex items-center gap-3 p-2 rounded-xl border cursor-pointer transition ${
                          checked
                            ? 'bg-indigo-50 dark:bg-indigo-500/15 border-indigo-400 dark:border-indigo-500/50'
                            : 'bg-slate-50/70 dark:bg-slate-950/50 border-slate-200 dark:border-slate-800'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setGroupMemberUuids((prev) => [...prev, peer.uuid]);
                            } else {
                              setGroupMemberUuids((prev) =>
                                prev.filter((id) => id !== peer.uuid)
                              );
                            }
                          }}
                          className="rounded text-indigo-600"
                        />
                        <UserAvatar
                          name={peer.display_name}
                          avatarData={peer.avatar_data}
                          size="sm"
                        />
                        <span className="text-xs font-medium text-slate-800 dark:text-slate-200 truncate flex-1 flex items-center gap-1.5 min-w-0">
                          <span className="truncate">{peer.display_name || t('unknown')}</span>
                          <DeviceTypeBadge deviceType={peer.device_type} t={t} />
                        </span>
                      </label>
                    );
                  })}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowNewGroup(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition"
              >
                {t('cancel')}
              </button>
              <button
                type="submit"
                disabled={creatingGroup || !groupName.trim()}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition disabled:opacity-60"
              >
                {creatingGroup ? t('loading') : t('chatGroupCreate')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: Forward Message */}
      {forwardMsg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 wm-glass p-4">
          <div className="wm-animate-in w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Forward className="w-4 h-4 text-indigo-500" strokeWidth={1.5} />
                <span>{t('chatForwardTo')}</span>
              </h3>
              <button
                type="button"
                onClick={() => setForwardMsg(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" strokeWidth={1.5} />
              </button>
            </div>

            <div className="max-h-64 overflow-y-auto space-y-1.5">
              {conversations.map((conv) => {
                const dmPeer =
                  conv.type === 'dm' && conv.peer
                    ? peers.find((p) => p.uuid === conv.peer.uuid) || conv.peer
                    : null;
                return (
                  <button
                    key={conv.id}
                    type="button"
                    disabled={forwarding}
                    onClick={() => handleForwardToConversation(conv.id)}
                    className="w-full flex items-center gap-3 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-500/15 transition text-start"
                  >
                    {conv.type === 'group' ? (
                      <div className="w-9 h-9 rounded-full bg-emerald-500 text-white flex items-center justify-center shrink-0">
                        <Users className="w-4 h-4" strokeWidth={1.5} />
                      </div>
                    ) : (
                      <UserAvatar
                        name={getConversationTitle(conv, t)}
                        avatarData={conv.avatar_data}
                        size="sm"
                      />
                    )}
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate flex-1 flex items-center gap-1.5 min-w-0">
                      <span className="truncate">{getConversationTitle(conv, t)}</span>
                      {conv.type === 'dm' && (
                        <DeviceTypeBadge deviceType={dmPeer?.device_type} t={t} />
                      )}
                    </span>
                    <Send className="w-3.5 h-3.5 text-indigo-500 shrink-0" strokeWidth={1.5} />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Caption Modal for Dropped OS Files or Public Vault Item */}
      {captionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 wm-glass p-4">
          <form
            onSubmit={handleConfirmCaptionModal}
            className="wm-animate-in w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-5 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                {t('chatCaptionModalTitle')}
              </h3>
              <button
                type="button"
                onClick={() => setCaptionModal(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" strokeWidth={1.5} />
              </button>
            </div>

            <div className="rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-3 max-h-32 overflow-y-auto space-y-1">
              {captionModal.kind === 'os' ? (
                captionModal.osPaths.map((p, idx) => (
                  <div
                    key={idx}
                    className="text-xs font-medium text-slate-700 dark:text-slate-200 flex items-center gap-2 truncate"
                  >
                    <Paperclip className="w-3.5 h-3.5 text-indigo-500 shrink-0" strokeWidth={1.5} />
                    <span className="truncate">{p.split(/[\\/]/).pop()}</span>
                  </div>
                ))
              ) : (
                <div className="text-xs font-medium text-slate-700 dark:text-slate-200 flex items-center gap-2 truncate">
                  {captionModal.isDir ? (
                    <Folder className="w-4 h-4 text-amber-500 shrink-0" strokeWidth={1.5} />
                  ) : (
                    <FileText className="w-4 h-4 text-indigo-500 shrink-0" strokeWidth={1.5} />
                  )}
                  <span className="truncate">{captionModal.name}</span>
                </div>
              )}
            </div>

            <input
              type="text"
              value={captionModal.caption}
              onChange={(e) =>
                setCaptionModal((prev) => ({ ...prev, caption: e.target.value }))
              }
              placeholder={t('chatCaptionPlaceholder')}
              autoFocus
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2.5 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
            />

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setCaptionModal(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition"
              >
                {t('cancel')}
              </button>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition"
              >
                <Send className="w-3.5 h-3.5" strokeWidth={1.5} />
                <span>{t('chatSendWithCaption')}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: Smart Permission Choice (Protected Vault Item Dragged to Chat) */}
      {shareChoiceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 wm-glass p-4">
          <form
            onSubmit={handleConfirmShareChoice}
            className="wm-animate-in w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-5 space-y-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                  <Lock className="w-4 h-4" strokeWidth={1.5} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    {t('chatShareChoiceTitle')}
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    {t('chatShareChoiceProtectedDesc')}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShareChoiceModal(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" strokeWidth={1.5} />
              </button>
            </div>

            <div className="space-y-2.5">
              <label
                className={`block rounded-xl border p-3.5 cursor-pointer transition ${
                  shareChoiceModal.mode === 'deeplink'
                    ? 'bg-indigo-50 dark:bg-indigo-500/15 border-indigo-500'
                    : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800'
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <input
                    type="radio"
                    name="shareMode"
                    checked={shareChoiceModal.mode === 'deeplink'}
                    onChange={() =>
                      setShareChoiceModal((prev) => ({ ...prev, mode: 'deeplink' }))
                    }
                    className="mt-0.5"
                  />
                  <div>
                    <div className="text-xs font-bold text-slate-900 dark:text-white">
                      {t('chatShareAsDeepLink')}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      {t('chatShareAsDeepLinkDesc')}
                    </div>
                  </div>
                </div>
              </label>

              <label
                className={`block rounded-xl border p-3.5 cursor-pointer transition ${
                  shareChoiceModal.mode === 'copy'
                    ? 'bg-emerald-50 dark:bg-emerald-500/15 border-emerald-500'
                    : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800'
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <input
                    type="radio"
                    name="shareMode"
                    checked={shareChoiceModal.mode === 'copy'}
                    onChange={() =>
                      setShareChoiceModal((prev) => ({ ...prev, mode: 'copy' }))
                    }
                    className="mt-0.5"
                  />
                  <div>
                    <div className="text-xs font-bold text-slate-900 dark:text-white">
                      {t('chatShareAsCopy')}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      {t('chatShareAsCopyDesc')}
                    </div>
                  </div>
                </div>
              </label>
            </div>

            <input
              type="text"
              value={shareChoiceModal.caption}
              onChange={(e) =>
                setShareChoiceModal((prev) => ({ ...prev, caption: e.target.value }))
              }
              placeholder={t('chatCaptionPlaceholder')}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2.5 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
            />

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShareChoiceModal(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition"
              >
                {t('cancel')}
              </button>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition"
              >
                <Send className="w-3.5 h-3.5" strokeWidth={1.5} />
                <span>{t('chatSendWithCaption')}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: Quick Folder Preview (Zipped Direct Folder Attachment) */}
      {folderPreviewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 wm-glass p-4">
          <div className="wm-animate-in w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                  <FolderOpen className="w-5 h-5" strokeWidth={1.5} />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                    {folderPreviewModal.rootName}
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {t('chatFolderPreviewTitle')} •{' '}
                    {t('chatFolderPreviewCount', {
                      count: folderPreviewModal.entries.filter((e) => !e.isDir).length
                    })}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setFolderPreviewModal(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" strokeWidth={1.5} />
              </button>
            </div>

            <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 rounded-xl border border-slate-200 dark:border-slate-800">
              {folderPreviewModal.entries
                .filter((e) => !e.isDir)
                .map((entry) => (
                  <button
                    key={entry.relPath}
                    type="button"
                    onClick={() => handleOpenExtractedEntry(entry.relPath)}
                    className="w-full px-3.5 py-2.5 flex items-center justify-between gap-3 hover:bg-indigo-50/70 dark:hover:bg-indigo-500/10 text-start transition"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <FileText className="w-4 h-4 text-indigo-500 shrink-0" strokeWidth={1.5} />
                      <span className="text-xs font-medium text-slate-800 dark:text-slate-200 truncate" dir="ltr">
                        {entry.relPath}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[10px] text-slate-400">
                        {formatBytes(entry.size)}
                      </span>
                      <ExternalLink className="w-3.5 h-3.5 text-indigo-500" strokeWidth={1.5} />
                    </div>
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Vault Folder Picker (Save to Vault) */}
      {vaultPickerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 wm-glass p-4">
          <div className="wm-animate-in w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <FolderInput className="w-4 h-4 text-emerald-500" strokeWidth={1.5} />
                <span>{t('chatChooseVaultFolder')}</span>
              </h3>
              <button
                type="button"
                onClick={() => setVaultPickerModal(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" strokeWidth={1.5} />
              </button>
            </div>

            {/* Breadcrumbs */}
            <div className="flex items-center flex-wrap gap-1 text-xs bg-slate-50 dark:bg-slate-950 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => loadPickerFolder('')}
                className="font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                {t('vaultRoot')}
              </button>
              {vaultPickerModal.currentFolder
                .split('/')
                .filter(Boolean)
                .map((seg, idx, arr) => {
                  const segPath = arr.slice(0, idx + 1).join('/');
                  return (
                    <React.Fragment key={segPath}>
                      <BreadcrumbArrow className="w-3.5 h-3.5 text-slate-400" strokeWidth={1.5} />
                      <button
                        type="button"
                        onClick={() => loadPickerFolder(segPath)}
                        className="font-semibold text-slate-700 dark:text-slate-200 hover:text-indigo-600"
                      >
                        {seg}
                      </button>
                    </React.Fragment>
                  );
                })}
            </div>

            {/* Folder contents or Lock prompt */}
            {vaultPickerModal.locked && vaultPickerModal.blockingAncestor ? (
              <form
                onSubmit={handleUnlockPickerFolder}
                className="rounded-xl border border-amber-200 dark:border-amber-500/30 bg-amber-50/70 dark:bg-amber-950/25 p-4 space-y-3"
              >
                <div className="text-xs font-semibold text-amber-900 dark:text-amber-200 flex items-center gap-2">
                  <Lock className="w-4 h-4 text-amber-600" strokeWidth={1.5} />
                  <span>
                    {t('unlockDesc', {
                      name: vaultPickerModal.blockingAncestor.name
                    })}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="password"
                    value={vaultPickerModal.password}
                    onChange={(e) =>
                      setVaultPickerModal((prev) => ({
                        ...prev,
                        password: e.target.value,
                        unlockError: ''
                      }))
                    }
                    placeholder={t('unlockPasswordPlaceholder')}
                    className="flex-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs"
                  />
                  <button
                    type="submit"
                    className="px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold"
                  >
                    {t('unlockButton')}
                  </button>
                </div>
                {vaultPickerModal.unlockError && (
                  <p className="text-xs text-rose-600 dark:text-rose-400">
                    {vaultPickerModal.unlockError}
                  </p>
                )}
              </form>
            ) : (
              <div className="space-y-2">
                <div className="max-h-56 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
                  {vaultPickerModal.loading ? (
                    <div className="p-4 text-center text-xs text-slate-400">
                      {t('loading')}
                    </div>
                  ) : vaultPickerModal.items.length === 0 ? (
                    <div className="p-4 text-center text-xs text-slate-400">
                      {t('vaultEmptyFolder')}
                    </div>
                  ) : (
                    vaultPickerModal.items.map((node) => (
                      <button
                        key={node.rel_path}
                        type="button"
                        onClick={() => loadPickerFolder(node.rel_path)}
                        className="w-full px-3.5 py-2.5 flex items-center justify-between gap-2 hover:bg-slate-50 dark:hover:bg-slate-800/70 text-start transition"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Folder className="w-4 h-4 text-amber-500 shrink-0" strokeWidth={1.5} />
                          <span className="text-xs font-medium text-slate-800 dark:text-slate-200 truncate">
                            {node.name}
                          </span>
                        </div>
                        {(node.isProtected || node.hasPassword) && (
                          <Lock className="w-3.5 h-3.5 text-amber-500 shrink-0" strokeWidth={1.5} />
                        )}
                      </button>
                    ))
                  )}
                </div>

                {vaultPickerModal.showNewFolder ? (
                  <form onSubmit={handlePickerCreateFolder} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={vaultPickerModal.newFolderName}
                      onChange={(e) =>
                        setVaultPickerModal((prev) => ({
                          ...prev,
                          newFolderName: e.target.value
                        }))
                      }
                      placeholder={t('vaultNewFolderName')}
                      autoFocus
                      className="flex-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-1.5 text-xs"
                    />
                    <button
                      type="submit"
                      className="px-3 py-1.5 rounded-xl bg-indigo-600 text-white text-xs font-semibold"
                    >
                      {t('confirm')}
                    </button>
                  </form>
                ) : (
                  <button
                    type="button"
                    onClick={() =>
                      setVaultPickerModal((prev) => ({ ...prev, showNewFolder: true }))
                    }
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
                  >
                    <FolderPlus className="w-3.5 h-3.5" strokeWidth={1.5} />
                    <span>{t('vaultNewFolder')}</span>
                  </button>
                )}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setVaultPickerModal(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition"
              >
                {t('cancel')}
              </button>
              <button
                type="button"
                disabled={vaultPickerModal.locked}
                onClick={() =>
                  handleSaveAttachmentToChosenVault(
                    vaultPickerModal.att,
                    vaultPickerModal.currentFolder,
                    'prompt'
                  )
                }
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition disabled:opacity-50"
              >
                <CheckCircle2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                <span>{t('chatSaveHere')}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Save-to-Vault Name Conflict */}
      {saveConflictModal && (
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

            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setSaveConflictModal(null)}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200"
              >
                {t('cancel')}
              </button>
              <button
                type="button"
                onClick={() =>
                  handleSaveAttachmentToChosenVault(
                    saveConflictModal.att,
                    saveConflictModal.targetFolder,
                    'keep_both'
                  )
                }
                className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                {t('conflictKeepBoth')}
              </button>
              <button
                type="button"
                onClick={() =>
                  handleSaveAttachmentToChosenVault(
                    saveConflictModal.att,
                    saveConflictModal.targetFolder,
                    'overwrite'
                  )
                }
                className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white"
              >
                {t('conflictOverwrite')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FLOATING CONTEXT DROPDOWN MENU (Hover Chevron or Right-Click) */}
      {msgMenu?.msg && !msgMenu.msg.deleted_at && (() => {
        const menuMsg = msgMenu.msg;
        const isMenuMine = menuMsg.sender_uuid === identity?.uuid;
        return (
          <div
            ref={msgMenuRef}
            role="menu"
            style={{ left: `${msgMenu.x}px`, top: `${msgMenu.y}px` }}
            onClick={(e) => e.stopPropagation()}
            className="fixed z-50 w-56 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl p-1.5 wm-animate-in"
          >
            {/* Quick Emoji Reaction Bar */}
            <div className="flex items-center justify-between gap-0.5 px-1 py-1">
              {REACTION_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => handleToggleReaction(menuMsg.id, emoji)}
                  className="w-8 h-8 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-base transition hover:scale-110"
                >
                  {emoji}
                </button>
              ))}
            </div>

            <div className="my-1 border-t border-slate-200/80 dark:border-slate-800" />

            {/* Reply */}
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setReplyTo(menuMsg);
                setMsgMenu(null);
                requestAnimationFrame(() => composerInputRef.current?.focus());
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition text-start"
            >
              <Reply className="w-3.5 h-3.5 text-indigo-500 shrink-0" strokeWidth={1.75} />
              <span>{t('chatReply')}</span>
            </button>

            {/* Forward */}
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setForwardMsg(menuMsg);
                setMsgMenu(null);
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition text-start"
            >
              <Forward className="w-3.5 h-3.5 text-emerald-500 shrink-0" strokeWidth={1.75} />
              <span>{t('chatForward')}</span>
            </button>

            {/* Copy */}
            <button
              type="button"
              role="menuitem"
              onClick={() => handleCopyMessageText(menuMsg)}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition text-start"
            >
              <Copy className="w-3.5 h-3.5 text-sky-500 shrink-0" strokeWidth={1.75} />
              <span>{t('chatCopyText')}</span>
            </button>

            {/* Edit (Own Text Only) */}
            {isMenuMine && menuMsg.type === 'text' && (
              <button
                type="button"
                role="menuitem"
                onClick={() => handleStartEdit(menuMsg)}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition text-start"
              >
                <Edit3 className="w-3.5 h-3.5 text-amber-500 shrink-0" strokeWidth={1.75} />
                <span>{t('chatEdit')}</span>
              </button>
            )}

            {/* Delete (Own Only) */}
            {isMenuMine && (
              <button
                type="button"
                role="menuitem"
                onClick={() => handleDeleteMessage(menuMsg)}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/15 transition text-start"
              >
                <Trash2 className="w-3.5 h-3.5 shrink-0" strokeWidth={1.75} />
                <span>{t('chatDelete')}</span>
              </button>
            )}
          </div>
        );
      })()}
    </div>
  );
}
