import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Info,
  X,
  RefreshCw
} from 'lucide-react';
import { createTranslator } from './i18n';
import { playNotificationChime } from './utils/sound';
import NavigationRail from './components/NavigationRail';
import OnboardingModal from './components/OnboardingModal';
import TrashView from './components/TrashView';
import MobileLinkView from './components/MobileLinkView';
import SettingsView from './components/SettingsView';
import ChatWorkspace from './components/ChatWorkspace';
import FileManager from './components/FileManager';

export default function App() {
  const [loading, setLoading] = useState(true);
  const [identity, setIdentity] = useState(null);
  const [masterRecoveryKey, setMasterRecoveryKey] = useState('');
  const [peers, setPeers] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [presenceMap, setPresenceMap] = useState({});
  const [openSessions, setOpenSessions] = useState([]);

  const [theme, setTheme] = useState('light');
  const [lang, setLang] = useState('ar');
  const [soundMuted, setSoundMuted] = useState(false);

  const [viewMode, setViewMode] = useState('chats');
  const lastSingleViewRef = useRef('chats');
  const [activeChatId, setActiveChatId] = useState(null);
  const [vaultDeepLink, setVaultDeepLink] = useState(null);
  const [trashRefreshKey, setTrashRefreshKey] = useState(0);
  const [toasts, setToasts] = useState([]);

  const soundMutedRef = useRef(soundMuted);
  soundMutedRef.current = soundMuted;
  const lastSoundAtRef = useRef(0);
  const lastRemoteToastRef = useRef({ key: '', at: 0 });

  const t = useMemo(() => createTranslator(lang), [lang]);
  const tRef = useRef(t);
  tRef.current = t;

  // Sync Tailwind dark class & HTML RTL/LTR direction
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  useEffect(() => {
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = lang;
  }, [lang]);

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const showToast = useCallback(
    (msgOrObj, type = 'info') => {
      const message =
        typeof msgOrObj === 'string'
          ? msgOrObj
          : msgOrObj?.message || msgOrObj?.text || '';
      const variant =
        typeof msgOrObj === 'object' && msgOrObj?.type ? msgOrObj.type : type;
      if (!message) return;

      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const duration = variant === 'warning' || variant === 'error' ? 6000 : 4000;

      setToasts((prev) => [...prev.slice(-3), { id, message, type: variant }]);
      setTimeout(() => {
        dismissToast(id);
      }, duration);
    },
    [dismissToast]
  );

  const triggerSoundIfAllowed = useCallback(() => {
    if (soundMutedRef.current) return;
    const now = Date.now();
    if (now - lastSoundAtRef.current < 450) return;
    lastSoundAtRef.current = now;
    playNotificationChime();
  }, []);

  const applyBootstrap = useCallback((data, isInitial = false) => {
    if (!data) return;
    if (data.identity) {
      setIdentity(data.identity);
    }
    const key =
      data.masterRecoveryKey ||
      data.identity?.master_recovery_key ||
      data.identity?.recovery_key ||
      data.identity?.recoveryKey;
    if (key) {
      setMasterRecoveryKey(key);
    }
    if (Array.isArray(data.peers)) {
      setPeers(data.peers);
    }
    if (Array.isArray(data.conversations)) {
      setConversations(data.conversations);
    }
    if (data.presenceMap && typeof data.presenceMap === 'object') {
      setPresenceMap(data.presenceMap);
    }
    if (Array.isArray(data.openSessions)) {
      setOpenSessions(data.openSessions);
    }
    if (isInitial && data.settings) {
      if (data.settings.theme === 'dark' || data.settings.theme === 'light') {
        setTheme(data.settings.theme);
      }
      if (data.settings.lang === 'ar' || data.settings.lang === 'en') {
        setLang(data.settings.lang);
      }
      if (data.settings.sound_muted !== undefined) {
        const muted =
          data.settings.sound_muted === true ||
          data.settings.sound_muted === 'true' ||
          data.settings.sound_muted === 1 ||
          data.settings.sound_muted === '1';
        setSoundMuted(muted);
      }
    }
  }, []);

  const refreshBootstrap = useCallback(async () => {
    const api = window.twinsync || window.workmesh;
    if (!api?.getBootstrap) return null;
    try {
      const data = await api.getBootstrap();
      applyBootstrap(data, false);
      return data;
    } catch (err) {
      console.error('Failed to refresh bootstrap:', err);
      return null;
    }
  }, [applyBootstrap]);

  // Initial load
  useEffect(() => {
    let active = true;
    async function init() {
      const api = window.twinsync || window.workmesh;
      if (!api?.getBootstrap) {
        setLoading(false);
        return;
      }
      try {
        const data = await api.getBootstrap();
        if (active) {
          applyBootstrap(data, true);
        }
      } catch (err) {
        if (active) {
          showToast(err?.message || 'Failed to load workspace', 'error');
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }
    init();
    return () => {
      active = false;
    };
  }, [applyBootstrap, showToast]);

  // Real-time IPC event subscriptions
  useEffect(() => {
    const api = window.twinsync || window.workmesh;
    if (!api?.onEvent) return undefined;

    const unsubs = [];

    unsubs.push(
      api.onEvent('chat:message', () => {
        refreshBootstrap();
      })
    );

    unsubs.push(
      api.onEvent('conversations:changed', () => {
        refreshBootstrap();
      })
    );

    unsubs.push(
      api.onEvent('peers:changed', async (payload) => {
        if (Array.isArray(payload)) {
          setPeers(payload);
        } else if (api?.getPeers) {
          try {
            const list = await api.getPeers();
            if (Array.isArray(list)) {
              setPeers(list);
              return;
            }
          } catch {
            // fallback to full refresh
          }
          refreshBootstrap();
        } else {
          refreshBootstrap();
        }
      })
    );

    unsubs.push(
      api.onEvent('vault:changed', () => {
        refreshBootstrap();
      })
    );

    const handleRemoteUpdated = (payload, toastType) => {
      const fileName =
        payload?.fileName ||
        payload?.name ||
        (payload?.relPath ? payload.relPath.split('/').pop() : '');
      const editor =
        payload?.editorName || payload?.editor || tRef.current('unknown');
      if (fileName) {
        const dedupKey = `${payload?.relPath || fileName}:${editor}`;
        const now = Date.now();
        if (
          lastRemoteToastRef.current.key !== dedupKey ||
          now - lastRemoteToastRef.current.at > 1200
        ) {
          lastRemoteToastRef.current = { key: dedupKey, at: now };
          showToast(
            tRef.current('remoteUpdatedNotice', { name: fileName, editor }),
            toastType
          );
        }
      }
      refreshBootstrap();
    };

    unsubs.push(
      api.onEvent('vault:remote-updated', (payload) => {
        handleRemoteUpdated(payload, 'info');
      })
    );

    unsubs.push(
      api.onEvent('sandbox:remote-updated', (payload) => {
        handleRemoteUpdated(payload, 'warning');
      })
    );

    unsubs.push(
      api.onEvent('sandbox:sessions-changed', (payload) => {
        if (Array.isArray(payload)) {
          setOpenSessions(payload);
        } else {
          refreshBootstrap();
        }
      })
    );

    unsubs.push(
      api.onEvent('presence:changed', (payload) => {
        if (payload?.presenceMap && typeof payload.presenceMap === 'object') {
          setPresenceMap(payload.presenceMap);
        } else if (
          payload &&
          typeof payload === 'object' &&
          !Array.isArray(payload) &&
          !payload.relPath &&
          !payload.peerUuid
        ) {
          setPresenceMap(payload);
        } else {
          refreshBootstrap();
        }
      })
    );

    unsubs.push(
      api.onEvent('trash:changed', () => {
        setTrashRefreshKey((k) => k + 1);
      })
    );

    unsubs.push(
      api.onEvent('sandbox:conflict-saved', (payload) => {
        const conflictName =
          payload?.conflictName ||
          payload?.fileName ||
          (payload?.conflictRelPath
            ? payload.conflictRelPath.split('/').pop()
            : '') ||
          payload?.relPath?.split('/').pop() ||
          '';
        showToast(
          tRef.current('conflictBranchNotice', { name: conflictName }),
          'warning'
        );
        refreshBootstrap();
      })
    );

    unsubs.push(
      api.onEvent('ui:open-chat', (payload) => {
        const chatId =
          typeof payload === 'string'
            ? payload
            : payload?.chatId || payload?.conversationId;
        if (chatId) {
          setActiveChatId(chatId);
          setViewMode((prev) => (prev === 'split' ? 'split' : 'chats'));
        }
      })
    );

    unsubs.push(
      api.onEvent('ui:open-mobile-link', () => {
        setViewMode('mobile');
      })
    );

    unsubs.push(
      api.onEvent('ui:play-sound', () => {
        triggerSoundIfAllowed();
      })
    );

    return () => {
      for (const unsub of unsubs) {
        if (typeof unsub === 'function') {
          unsub();
        }
      }
    };
  }, [refreshBootstrap, showToast, triggerSoundIfAllowed]);

  const handleChangeTheme = useCallback(async (nextTheme) => {
    setTheme(nextTheme);
    try {
      const api = window.twinsync || window.workmesh;
      await api?.setSetting?.('theme', nextTheme);
    } catch {
      // ignore persistence error
    }
  }, []);

  const handleChangeLang = useCallback(async (nextLang) => {
    setLang(nextLang);
    try {
      const api = window.twinsync || window.workmesh;
      await api?.setSetting?.('lang', nextLang);
    } catch {
      // ignore persistence error
    }
  }, []);

  const handleChangeSoundMuted = useCallback(async (nextMuted) => {
    setSoundMuted(Boolean(nextMuted));
    try {
      const api = window.twinsync || window.workmesh;
      await api?.setSetting?.('sound_muted', Boolean(nextMuted));
    } catch {
      // ignore persistence error
    }
  }, []);

  const handleChangeView = useCallback((nextView) => {
    if (nextView === 'chats' || nextView === 'files') {
      lastSingleViewRef.current = nextView;
    }
    setViewMode(nextView);
  }, []);

  const handleToggleSplit = useCallback(() => {
    setViewMode((prev) => {
      if (prev === 'split') {
        return lastSingleViewRef.current || 'chats';
      }
      if (prev === 'chats' || prev === 'files') {
        lastSingleViewRef.current = prev;
      }
      return 'split';
    });
  }, []);

  const handleOpenVaultDeepLink = useCallback((relPath) => {
    if (!relPath) return;
    setVaultDeepLink({ relPath, ts: Date.now() });
    setViewMode((prev) => (prev === 'files' || prev === 'split' ? prev : 'split'));
  }, []);

  const handleCompleteOnboarding = useCallback(
    async (payload) => {
      const api = window.twinsync || window.workmesh;
      const res = await api.completeOnboarding(payload);
      if (res && res.ok === false) {
        throw new Error(res.error || t('error'));
      }
      if (res?.identity) {
        setIdentity(res.identity);
      }
      await refreshBootstrap();
    },
    [refreshBootstrap, t]
  );

  const totalUnread = useMemo(
    () =>
      conversations.reduce(
        (sum, conv) => sum + (Number(conv.unreadCount) || 0),
        0
      ),
    [conversations]
  );

  const onlinePeerCount = useMemo(
    () => peers.filter((p) => p.status === 'online').length,
    [peers]
  );

  if (loading) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center gap-3 bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-300">
        <RefreshCw className="w-7 h-7 animate-spin text-indigo-600" strokeWidth={1.5} />
        <span className="text-sm font-medium">{t('loading')}</span>
      </div>
    );
  }

  const needsOnboarding = Boolean(identity && !(identity.onboarded || identity.onboarding_done));

  return (
    <div className="h-screen w-screen flex bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 overflow-hidden">
      {/* Slim 68px Navigation Rail */}
      <NavigationRail
        t={t}
        viewMode={viewMode}
        onChangeView={handleChangeView}
        onToggleSplit={handleToggleSplit}
        totalUnread={totalUnread}
        identity={identity}
        onlinePeerCount={onlinePeerCount}
      />

      {/* Main Active Workspace */}
      <main className="flex-1 min-w-0 h-full flex overflow-hidden">
        {viewMode === 'chats' && (
          <div className="flex-1 min-w-0 h-full flex">
            <ChatWorkspace
              t={t}
              lang={lang}
              identity={identity}
              peers={peers}
              conversations={conversations}
              activeChatId={activeChatId}
              onSelectChat={setActiveChatId}
              onOpenVaultDeepLink={handleOpenVaultDeepLink}
              compact={false}
              onToast={showToast}
              onRefreshConversations={refreshBootstrap}
            />
          </div>
        )}

        {viewMode === 'files' && (
          <div className="flex-1 min-w-0 h-full flex">
            <FileManager
              t={t}
              lang={lang}
              identity={identity}
              peers={peers}
              conversations={conversations}
              presenceMap={presenceMap}
              openSessions={openSessions}
              deepLinkTarget={vaultDeepLink}
              compact={false}
              onToast={showToast}
              onSentToChat={(convId) => {
                setActiveChatId(convId);
                if (viewMode === 'files') setViewMode('split');
              }}
            />
          </div>
        )}

        {viewMode === 'split' && (
          <div className="flex-1 min-w-0 h-full grid grid-cols-2 divide-x rtl:divide-x-reverse divide-slate-200 dark:divide-slate-800 overflow-hidden">
            <div className="min-w-0 h-full flex overflow-hidden">
              <ChatWorkspace
                t={t}
                lang={lang}
                identity={identity}
                peers={peers}
                conversations={conversations}
                activeChatId={activeChatId}
                onSelectChat={setActiveChatId}
                onOpenVaultDeepLink={handleOpenVaultDeepLink}
                compact={true}
                onToast={showToast}
                onRefreshConversations={refreshBootstrap}
              />
            </div>
            <div className="min-w-0 h-full flex overflow-hidden">
              <FileManager
                t={t}
                lang={lang}
                identity={identity}
                peers={peers}
                conversations={conversations}
                presenceMap={presenceMap}
                openSessions={openSessions}
                deepLinkTarget={vaultDeepLink}
                compact={true}
                onToast={showToast}
                onSentToChat={(convId) => {
                  setActiveChatId(convId);
                  if (viewMode === 'files') setViewMode('split');
                }}
              />
            </div>
          </div>
        )}

        {viewMode === 'mobile' && (
          <MobileLinkView t={t} onToast={showToast} />
        )}

        {viewMode === 'trash' && (
          <TrashView
            t={t}
            lang={lang}
            identity={identity}
            peers={peers}
            refreshTrigger={trashRefreshKey}
            onToast={showToast}
          />
        )}

        {viewMode === 'settings' && (
          <SettingsView
            t={t}
            lang={lang}
            theme={theme}
            soundMuted={soundMuted}
            identity={identity}
            masterRecoveryKey={masterRecoveryKey}
            peers={peers}
            onChangeTheme={handleChangeTheme}
            onChangeLang={handleChangeLang}
            onChangeSoundMuted={handleChangeSoundMuted}
            onRefreshBootstrap={refreshBootstrap}
            onToast={showToast}
          />
        )}
      </main>

      {/* First-Run Onboarding Modal */}
      {needsOnboarding && (
        <OnboardingModal
          t={t}
          lang={lang}
          theme={theme}
          masterRecoveryKey={masterRecoveryKey}
          initialName={identity?.display_name || ''}
          initialAvatar={identity?.avatar_data || ''}
          onToggleTheme={() =>
            handleChangeTheme(theme === 'dark' ? 'light' : 'dark')
          }
          onToggleLang={() => handleChangeLang(lang === 'ar' ? 'en' : 'ar')}
          onComplete={handleCompleteOnboarding}
        />
      )}

      {/* Toast Notification Stack */}
      {toasts.length > 0 && (
        <div className="fixed bottom-4 end-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none px-4 sm:px-0">
          {toasts.map((toast) => {
            const Icon =
              toast.type === 'success'
                ? CheckCircle2
                : toast.type === 'warning'
                ? AlertTriangle
                : toast.type === 'error'
                ? AlertCircle
                : Info;

            const styleMap = {
              success:
                'bg-emerald-50 dark:bg-slate-900 border-emerald-300/90 dark:border-emerald-500/40 text-emerald-900 dark:text-emerald-200',
              warning:
                'bg-amber-50 dark:bg-slate-900 border-amber-300/90 dark:border-amber-500/40 text-amber-900 dark:text-amber-200',
              error:
                'bg-rose-50 dark:bg-slate-900 border-rose-300/90 dark:border-rose-500/40 text-rose-900 dark:text-rose-200',
              info:
                'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100'
            };

            const iconColorMap = {
              success: 'text-emerald-600 dark:text-emerald-400',
              warning: 'text-amber-600 dark:text-amber-400',
              error: 'text-rose-600 dark:text-rose-400',
              info: 'text-indigo-600 dark:text-indigo-400'
            };

            return (
              <div
                key={toast.id}
                className={`wm-animate-in pointer-events-auto rounded-xl border shadow-lg px-3.5 py-2.5 flex items-start gap-2.5 ${
                  styleMap[toast.type] || styleMap.info
                }`}
              >
                <Icon
                  className={`w-4 h-4 mt-0.5 shrink-0 ${
                    iconColorMap[toast.type] || iconColorMap.info
                  }`}
                  strokeWidth={1.5}
                />
                <p className="text-xs font-medium leading-relaxed flex-1">
                  {toast.message}
                </p>
                <button
                  type="button"
                  onClick={() => dismissToast(toast.id)}
                  className="p-0.5 rounded-md opacity-60 hover:opacity-100 transition shrink-0"
                >
                  <X className="w-3.5 h-3.5" strokeWidth={1.5} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
