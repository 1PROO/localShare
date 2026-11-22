import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Settings,
  User,
  Upload,
  X,
  Sun,
  Moon,
  Languages,
  Volume2,
  VolumeX,
  KeyRound,
  Eye,
  EyeOff,
  Copy,
  Check,
  Shield,
  ShieldAlert,
  Users,
  History,
  RefreshCw,
  Search,
  Lock,
  Info,
  CheckCircle2,
  Wifi,
  Plus,
  Trash2,
  Download,
  LogOut,
  AlertTriangle,
  Network,
  Star
} from 'lucide-react';
import {
  UserAvatar,
  DeviceTypeBadge,
  copyTextSafe,
  resizeImageToDataUrl,
  SECURITY_QUESTION_KEYS,
  SecurityQaFields
} from './OnboardingModal';
import { playNotificationChime } from '../utils/sound';

function formatLogTime(ts, lang) {
  if (!ts) return '—';
  const d = new Date(typeof ts === 'number' ? ts : Date.parse(ts));
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-US', {
    dateStyle: 'short',
    timeStyle: 'short'
  });
}

function formatDetails(details) {
  if (!details) return '';
  if (typeof details === 'string') return details;
  try {
    return JSON.stringify(details);
  } catch {
    return String(details);
  }
}

function formatInstallerSize(bytes) {
  const n = Number(bytes) || 0;
  if (!n) return '';
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function getAdapterCategoryMeta(category, t) {
  switch (category) {
    case 'ethernet':
      return {
        label: t('mobileAdapterTypeEthernet'),
        badgeClass: 'bg-indigo-100 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-300'
      };
    case 'wifi':
      return {
        label: t('mobileAdapterTypeWifi'),
        badgeClass: 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
      };
    case 'vpn':
      return {
        label: t('mobileAdapterTypeVpn'),
        badgeClass: 'bg-sky-100 dark:bg-sky-500/15 text-sky-700 dark:text-sky-300'
      };
    case 'virtual':
      return {
        label: t('mobileAdapterTypeVirtual'),
        badgeClass: 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
      };
    default:
      return {
        label: t('mobileAdapterTypeLan'),
        badgeClass: 'bg-amber-100 dark:bg-amber-500/15 text-amber-800 dark:text-amber-300'
      };
  }
}

export default function SettingsView({
  t,
  lang,
  theme,
  soundMuted,
  identity,
  masterRecoveryKey,
  peers = [],
  isWebClient: isWebClientProp,
  installerInfo: installerInfoProp = null,
  onLogout,
  onChangeTheme,
  onChangeLang,
  onChangeSoundMuted,
  onRefreshBootstrap,
  onToast
}) {
  const api = window.twinsync || window.workmesh;
  const isWebClient =
    typeof isWebClientProp === 'boolean' ? isWebClientProp : Boolean(api?.isWebClient);
  const canEditProfile = !isWebClient && typeof api?.updateProfile === 'function';

  // Profile state
  const [displayName, setDisplayName] = useState(identity?.display_name || '');
  const [avatarData, setAvatarData] = useState(identity?.avatar_data || '');
  const [savingProfile, setSavingProfile] = useState(false);
  const avatarInputRef = useRef(null);

  // Security & Recovery state
  const [revealKey, setRevealKey] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState('custom');
  const [customQuestion, setCustomQuestion] = useState(identity?.security_question || '');
  const [securityAnswer, setSecurityAnswer] = useState('');
  const [savingSecurity, setSavingSecurity] = useState(false);

  // Account PIN state
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [savingPin, setSavingPin] = useState(false);

  // Peers copy/remove & direct/Tailscale connect state
  const [copiedPeerId, setCopiedPeerId] = useState(null);
  const [removingPeerUuid, setRemovingPeerUuid] = useState(null);
  const [networkInfo, setNetworkInfo] = useState(null);
  const [manualAddress, setManualAddress] = useState('');
  const [connectingManual, setConnectingManual] = useState(false);
  const [scanningNetwork, setScanningNetwork] = useState(false);

  // Windows Network & Firewall Health state
  const [networkHealth, setNetworkHealth] = useState(null);
  const [checkingHealth, setCheckingHealth] = useState(false);
  const [fixingHealth, setFixingHealth] = useState(false);

  // Offline Installer Distribution state
  const [installerInfo, setInstallerInfo] = useState(installerInfoProp);
  const [attachingInstaller, setAttachingInstaller] = useState(false);

  // Network Adapters & QR Links state
  const [allAdapters, setAllAdapters] = useState([]);
  const [adapterPrefs, setAdapterPrefs] = useState({
    hideVirtualAdapters: true,
    hiddenAdapters: [],
    preferredAdapter: ''
  });
  const [loadingAdapters, setLoadingAdapters] = useState(false);
  const [savingAdapters, setSavingAdapters] = useState(false);

  // Audit logs
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditSearch, setAuditSearch] = useState('');
  const [loadingLogs, setLoadingLogs] = useState(false);

  useEffect(() => {
    if (installerInfoProp) {
      setInstallerInfo(installerInfoProp);
    }
  }, [installerInfoProp]);

  useEffect(() => {
    setDisplayName(identity?.display_name || '');
    setAvatarData(identity?.avatar_data || '');
    const currentQ = identity?.security_question || '';
    const matchedKey = SECURITY_QUESTION_KEYS.find((k) => t(k) === currentQ);
    if (matchedKey) {
      setSelectedPreset(matchedKey);
      setCustomQuestion('');
    } else if (currentQ) {
      setSelectedPreset('custom');
      setCustomQuestion(currentQ);
    } else {
      setSelectedPreset(SECURITY_QUESTION_KEYS[0]);
    }
  }, [identity?.display_name, identity?.avatar_data, identity?.security_question, t]);

  const loadAuditLogs = useCallback(async () => {
    const clientApi = window.twinsync || window.workmesh;
    if (isWebClient || !clientApi?.getAuditLogs) return;
    setLoadingLogs(true);
    try {
      const res = await clientApi.getAuditLogs({
        search: auditSearch.trim() || undefined,
        limit: 100
      });
      const list = Array.isArray(res) ? res : res?.logs || res?.items || [];
      setAuditLogs(list);
    } catch (err) {
      onToast?.(err?.message || t('error'), 'error');
    } finally {
      setLoadingLogs(false);
    }
  }, [auditSearch, isWebClient, onToast, t]);

  const loadNetworkInfo = useCallback(async () => {
    const clientApi = window.twinsync || window.workmesh;
    if (isWebClient || !clientApi?.getNetworkInfo) return;
    try {
      const res = await clientApi.getNetworkInfo();
      if (res && res.ok !== false) {
        setNetworkInfo(res);
      }
    } catch {
      // ignore non-fatal network metadata fetch errors
    }
  }, [isWebClient]);

  const loadNetworkHealth = useCallback(async () => {
    const clientApi = window.twinsync || window.workmesh;
    if (isWebClient || !clientApi?.checkNetworkHealth) return;
    setCheckingHealth(true);
    try {
      const res = await clientApi.checkNetworkHealth();
      if (res && res.ok !== false) {
        setNetworkHealth(res);
      }
    } catch {
      // ignore non-fatal health probe errors
    } finally {
      setCheckingHealth(false);
    }
  }, [isWebClient]);

  const loadInstallerInfo = useCallback(async () => {
    const clientApi = window.twinsync || window.workmesh;
    if (!clientApi?.getInstallerInfo) return;
    try {
      const res = await clientApi.getInstallerInfo();
      if (res && res.ok !== false) {
        setInstallerInfo(res);
      }
    } catch {
      // ignore non-fatal installer lookup errors
    }
  }, []);

  const loadAdapters = useCallback(async () => {
    const clientApi = window.twinsync || window.workmesh;
    if (isWebClient || !clientApi?.mobileGetPairing) return;
    setLoadingAdapters(true);
    try {
      const res = await clientApi.mobileGetPairing();
      if (res && res.ok !== false) {
        if (Array.isArray(res.allAdapters)) {
          setAllAdapters(res.allAdapters);
        }
        if (res.preferences) {
          setAdapterPrefs({
            hideVirtualAdapters: res.preferences.hideVirtualAdapters !== false,
            hiddenAdapters: Array.isArray(res.preferences.hiddenAdapters)
              ? res.preferences.hiddenAdapters
              : [],
            preferredAdapter: res.preferences.preferredAdapter || ''
          });
        }
      }
    } catch {
      // ignore non-fatal adapter enumeration errors
    } finally {
      setLoadingAdapters(false);
    }
  }, [isWebClient]);

  useEffect(() => {
    loadAuditLogs();
  }, [loadAuditLogs]);

  useEffect(() => {
    loadNetworkInfo();
  }, [loadNetworkInfo, peers.length]);

  useEffect(() => {
    loadNetworkHealth();
    loadInstallerInfo();
    loadAdapters();
  }, [loadNetworkHealth, loadInstallerInfo, loadAdapters]);

  const handleRefreshDiscovery = async () => {
    const api = window.twinsync || window.workmesh;
    if (!api?.refreshDiscovery) return;
    setScanningNetwork(true);
    try {
      const res = await api.refreshDiscovery();
      if (res && res.ok !== false) {
        setNetworkInfo(res);
      }
      await loadAdapters();
      await onRefreshBootstrap?.();
      onToast?.(t('settingsScanComplete'), 'info');
    } catch (err) {
      onToast?.(err?.message || t('error'), 'error');
    } finally {
      setScanningNetwork(false);
    }
  };

  const handleConnectManualPeer = async (e) => {
    e.preventDefault();
    const api = window.twinsync || window.workmesh;
    const raw = manualAddress.trim();
    if (!raw || !api?.connectManualPeer) {
      onToast?.(t('settingsDirectInvalidIp'), 'error');
      return;
    }
    setConnectingManual(true);
    try {
      const res = await api.connectManualPeer(raw);
      if (res && res.ok === false) {
        throw new Error(res.error || t('error'));
      }
      setManualAddress('');
      setNetworkInfo((prev) => ({
        ...(prev || {}),
        manualPeers: res?.manualPeers || prev?.manualPeers || []
      }));
      await onRefreshBootstrap?.();
      onToast?.(
        res?.connected ? t('settingsDirectConnectedToast') : t('settingsDirectSavedToast'),
        res?.connected ? 'success' : 'info'
      );
    } catch (err) {
      const msg = String(err?.message || '');
      if (msg.includes('INVALID_ADDRESS') || msg.includes('Invalid peer IP')) {
        onToast?.(t('settingsDirectInvalidIp'), 'error');
      } else {
        onToast?.(msg || t('error'), 'error');
      }
    } finally {
      setConnectingManual(false);
    }
  };

  const handleRemoveManualPeer = async (hostPort) => {
    const api = window.twinsync || window.workmesh;
    if (!api?.removeManualPeer) return;
    try {
      const res = await api.removeManualPeer(hostPort);
      setNetworkInfo((prev) => ({
        ...(prev || {}),
        manualPeers: res?.manualPeers || []
      }));
      onToast?.(t('settingsDirectRemoved'), 'info');
    } catch (err) {
      onToast?.(err?.message || t('error'), 'error');
    }
  };

  const handleAvatarUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const resized = await resizeImageToDataUrl(file, 160, 0.82);
      setAvatarData(resized);
    } catch (err) {
      onToast?.(err?.message || t('error'), 'error');
    }
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    const api = window.twinsync || window.workmesh;
    const trimmed = displayName.trim();
    if (!trimmed) {
      onToast?.(t('onboardingErrorNameRequired'), 'error');
      return;
    }
    setSavingProfile(true);
    try {
      const res = await api.updateProfile({
        displayName: trimmed,
        avatarData: avatarData || null
      });
      if (res && res.ok === false) {
        throw new Error(res.error || t('error'));
      }
      await onRefreshBootstrap?.();
      onToast?.(t('settingsProfileSaved'), 'success');
    } catch (err) {
      onToast?.(err?.message || t('error'), 'error');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSaveSecurityQA = async (e) => {
    e.preventDefault();
    const api = window.twinsync || window.workmesh;
    const resolvedQuestion =
      selectedPreset === 'custom' ? customQuestion.trim() : t(selectedPreset);
    const trimmedAnswer = securityAnswer.trim();

    if (!resolvedQuestion) {
      onToast?.(t('onboardingErrorQuestionRequired'), 'error');
      return;
    }
    if (!trimmedAnswer) {
      onToast?.(t('onboardingErrorAnswerRequired'), 'error');
      return;
    }

    setSavingSecurity(true);
    try {
      const res = await api.updateSecurityQA({
        securityQuestion: resolvedQuestion,
        securityAnswer: trimmedAnswer
      });
      if (res && res.ok === false) {
        throw new Error(res.error || t('error'));
      }
      setSecurityAnswer('');
      await onRefreshBootstrap?.();
      onToast?.(t('settingsQASaved'), 'success');
    } catch (err) {
      onToast?.(err?.message || t('error'), 'error');
    } finally {
      setSavingSecurity(false);
    }
  };

  const handleSaveAccountPin = async (e) => {
    e.preventDefault();
    const api = window.twinsync || window.workmesh;
    const pin = newPin.trim();
    const confirm = confirmPin.trim();
    if (!/^\d{4,6}$/.test(pin)) {
      onToast?.(t('settingsPinInvalidFormat'), 'error');
      return;
    }
    if (pin !== confirm) {
      onToast?.(t('settingsPinMismatch'), 'error');
      return;
    }
    setSavingPin(true);
    try {
      const res = await api.updateAccountPin(pin);
      if (res && res.ok === false) {
        throw new Error(res.error || t('error'));
      }
      setNewPin('');
      setConfirmPin('');
      await onRefreshBootstrap?.();
      onToast?.(t('settingsPinSaved'), 'success');
    } catch (err) {
      onToast?.(err?.message || t('error'), 'error');
    } finally {
      setSavingPin(false);
    }
  };

  const handleCopyKey = async () => {
    if (!masterRecoveryKey) return;
    const ok = await copyTextSafe(masterRecoveryKey);
    if (ok) {
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 1800);
    } else {
      onToast?.(t('error'), 'error');
    }
  };

  const handleCopyPeerUuid = async (uuid) => {
    const ok = await copyTextSafe(uuid);
    if (ok) {
      setCopiedPeerId(uuid);
      setTimeout(() => setCopiedPeerId(null), 1600);
    }
  };

  const handleRemoveOfflinePeer = async (peer) => {
    const clientApi = window.twinsync || window.workmesh;
    if (!peer?.uuid || peer.status === 'online' || !clientApi?.removeOfflinePeer) return;
    setRemovingPeerUuid(peer.uuid);
    try {
      const res = await clientApi.removeOfflinePeer(peer.uuid);
      if (res && res.ok === false) {
        throw new Error(res.error || t('error'));
      }
      await onRefreshBootstrap?.();
      onToast?.(t('settingsPeerRemoved'), 'info');
    } catch (err) {
      onToast?.(err?.message || t('error'), 'error');
    } finally {
      setRemovingPeerUuid(null);
    }
  };

  const handleFixNetworkHealth = async () => {
    const clientApi = window.twinsync || window.workmesh;
    if (!clientApi?.fixNetworkHealth) return;
    setFixingHealth(true);
    try {
      const res = await clientApi.fixNetworkHealth();
      if (res && res.ok === false) {
        throw new Error(res.error || t('netHealthFixError'));
      }
      setNetworkHealth(res);
      await onRefreshBootstrap?.();
      if (res?.needsAction) {
        onToast?.(t('netHealthFixError'), 'warning');
      } else {
        onToast?.(t('netHealthFixSuccess'), 'success');
      }
    } catch (err) {
      onToast?.(err?.message || t('netHealthFixError'), 'error');
    } finally {
      setFixingHealth(false);
    }
  };

  const handleImportInstaller = async () => {
    const clientApi = window.twinsync || window.workmesh;
    if (!clientApi?.importInstallerExe) return;
    setAttachingInstaller(true);
    try {
      const res = await clientApi.importInstallerExe();
      if (res?.canceled) return;
      if (res && res.ok === false) {
        throw new Error(res.error || t('error'));
      }
      setInstallerInfo(res);
      onToast?.(t('installerAttachedToast'), 'success');
    } catch (err) {
      onToast?.(err?.message || t('error'), 'error');
    } finally {
      setAttachingInstaller(false);
    }
  };

  const handleWebLogout = async () => {
    if (typeof onLogout === 'function') {
      await onLogout();
      return;
    }
    await api?.webLogout?.();
  };

  const saveAdapterPrefs = async (nextPrefs) => {
    const clientApi = window.twinsync || window.workmesh;
    if (!clientApi?.mobileSetAdapterPreferences) return;
    setSavingAdapters(true);
    try {
      const res = await clientApi.mobileSetAdapterPreferences(nextPrefs);
      if (res && res.ok === false) {
        throw new Error(res.error || t('error'));
      }
      if (Array.isArray(res?.allAdapters)) {
        setAllAdapters(res.allAdapters);
      }
      if (res?.preferences) {
        setAdapterPrefs({
          hideVirtualAdapters: res.preferences.hideVirtualAdapters !== false,
          hiddenAdapters: Array.isArray(res.preferences.hiddenAdapters)
            ? res.preferences.hiddenAdapters
            : [],
          preferredAdapter: res.preferences.preferredAdapter || ''
        });
      } else {
        setAdapterPrefs(nextPrefs);
      }
      onToast?.(t('settingsAdaptersSaved'), 'success');
    } catch (err) {
      onToast?.(err?.message || t('error'), 'error');
    } finally {
      setSavingAdapters(false);
    }
  };

  const handleToggleHideVirtual = () => {
    saveAdapterPrefs({
      ...adapterPrefs,
      hideVirtualAdapters: !adapterPrefs.hideVirtualAdapters
    });
  };

  const handleToggleAdapterVisible = (adapter) => {
    const currentHidden = Array.isArray(adapterPrefs.hiddenAdapters)
      ? adapterPrefs.hiddenAdapters
      : [];
    const nextHidden = new Set(currentHidden);
    let nextHideVirtual = adapterPrefs.hideVirtualAdapters;
    let nextPreferred = adapterPrefs.preferredAdapter || '';

    if (adapter.visible) {
      nextHidden.add(adapter.name);
      if (nextPreferred === adapter.name) {
        nextPreferred = '';
      }
    } else {
      nextHidden.delete(adapter.name);
      if (adapter.isVirtual && nextHideVirtual) {
        nextHideVirtual = false;
      }
    }

    saveAdapterPrefs({
      hideVirtualAdapters: nextHideVirtual,
      hiddenAdapters: Array.from(nextHidden),
      preferredAdapter: nextPreferred
    });
  };

  const handlePinDefaultAdapter = (adapter) => {
    const isAlreadyPinned = adapterPrefs.preferredAdapter === adapter.name;
    const nextPreferred = isAlreadyPinned ? '' : adapter.name;
    const currentHidden = Array.isArray(adapterPrefs.hiddenAdapters)
      ? adapterPrefs.hiddenAdapters
      : [];
    const nextHidden = new Set(currentHidden);
    let nextHideVirtual = adapterPrefs.hideVirtualAdapters;

    if (nextPreferred) {
      nextHidden.delete(adapter.name);
      if (adapter.isVirtual && nextHideVirtual) {
        nextHideVirtual = false;
      }
    }

    saveAdapterPrefs({
      hideVirtualAdapters: nextHideVirtual,
      hiddenAdapters: Array.from(nextHidden),
      preferredAdapter: nextPreferred
    });
  };

  const sortedPeers = [...peers].sort((a, b) => {
    const aOn = a.status === 'online' ? 0 : 1;
    const bOn = b.status === 'online' ? 0 : 1;
    if (aOn !== bOn) return aOn - bOn;
    return (a.display_name || '').localeCompare(b.display_name || '');
  });

  const filteredLogs = auditLogs.filter((log) => {
    const q = auditSearch.trim().toLowerCase();
    if (!q) return true;
    return [log.actor_name, log.event_type, log.target_path, formatDetails(log.details)]
      .filter(Boolean)
      .some((val) => String(val).toLowerCase().includes(q));
  });

  return (
    <div className="flex-1 min-w-0 h-full flex flex-col bg-slate-50 dark:bg-slate-950 overflow-hidden">
      {/* Header */}
      <header className="px-6 py-4 bg-white dark:bg-slate-900 border-b border-slate-200/80 dark:border-slate-800 flex items-center gap-3 shrink-0">
        <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 flex items-center justify-center border border-indigo-200/70 dark:border-indigo-500/20">
          <Settings className="w-5 h-5" strokeWidth={1.5} />
        </div>
        <div>
          <h1 className="text-base font-bold text-slate-900 dark:text-white">
            {t('settingsTitle')}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {t('settingsSubtitle')}
          </p>
        </div>
      </header>

      {/* Scrollable Sections */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-6">
        <div className="max-w-5xl mx-auto space-y-6 pb-8">
          {/* 1. Profile & Appearance Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Local Profile */}
            {canEditProfile ? (
              <form
                onSubmit={handleSaveProfile}
                className="min-w-0 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 shadow-sm space-y-4"
              >
                <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                  <User className="w-4 h-4 text-indigo-500" strokeWidth={1.5} />
                  <span>{t('settingsProfileSection')}</span>
                </div>

                <div className="flex items-center gap-4 min-w-0">
                  <UserAvatar name={displayName} avatarData={avatarData} size="xl" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <input
                      ref={avatarInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleAvatarUpload}
                      className="hidden"
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => avatarInputRef.current?.click()}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition"
                      >
                        <Upload className="w-3.5 h-3.5" strokeWidth={1.5} />
                        <span>{t('settingsChangeAvatar')}</span>
                      </button>
                      {avatarData && (
                        <button
                          type="button"
                          onClick={() => setAvatarData('')}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition"
                        >
                          <X className="w-3.5 h-3.5" strokeWidth={1.5} />
                          <span>{t('onboardingRemoveAvatar')}</span>
                        </button>
                      )}
                    </div>
                    {identity?.uuid && (
                      <div className="text-[11px] font-mono text-slate-400 truncate" dir="ltr">
                        UUID: {identity.uuid}
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    {t('settingsDisplayName')}
                  </label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 transition"
                  />
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={savingProfile}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm transition disabled:opacity-60"
                  >
                    <span>{savingProfile ? t('loading') : t('settingsSaveProfile')}</span>
                  </button>
                </div>
              </form>
            ) : (
              <div className="min-w-0 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 shadow-sm flex flex-col justify-between gap-4">
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                      <User className="w-4 h-4 text-indigo-500" strokeWidth={1.5} />
                      <span>{t('settingsProfileSection')}</span>
                    </div>
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                      {t('webZeroFootprint')}
                    </span>
                  </div>

                  <div className="flex items-center gap-4 min-w-0">
                    <UserAvatar
                      name={identity?.display_name}
                      avatarData={identity?.avatar_data}
                      size="xl"
                    />
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-base font-bold text-slate-900 dark:text-white truncate">
                          {identity?.display_name || t('unknown')}
                        </span>
                        <DeviceTypeBadge deviceType={identity?.device_type} t={t} />
                      </div>
                      {identity?.uuid && (
                        <div className="text-[11px] font-mono text-slate-400 truncate" dir="ltr">
                          UUID: {identity.uuid}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-200/80 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {t('webPortalSubtitle')}
                  </span>
                  <button
                    type="button"
                    onClick={handleWebLogout}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold shadow-sm transition"
                  >
                    <LogOut className="w-3.5 h-3.5" strokeWidth={1.75} />
                    <span>{`${t('webSwitchAccount')} / ${t('webLogout')}`}</span>
                  </button>
                </div>
              </div>
            )}

            {/* Appearance, Language & Sound */}
            <div className="min-w-0 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 shadow-sm space-y-5">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                <Sun className="w-4 h-4 text-amber-500" strokeWidth={1.5} />
                <span>{t('settingsAppearanceSection')}</span>
              </div>

              {/* Theme Toggle */}
              <div className="space-y-2">
                <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  {t('settingsTheme')}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => onChangeTheme('light')}
                    className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-semibold border transition ${
                      theme === 'light'
                        ? 'bg-indigo-50 border-indigo-500 text-indigo-700 shadow-sm'
                        : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <Sun className="w-4 h-4" strokeWidth={1.5} />
                    <span>{t('settingsThemeLight')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onChangeTheme('dark')}
                    className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-semibold border transition ${
                      theme === 'dark'
                        ? 'bg-indigo-500/15 border-indigo-400 text-indigo-300 shadow-sm'
                        : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <Moon className="w-4 h-4" strokeWidth={1.5} />
                    <span>{t('settingsThemeDark')}</span>
                  </button>
                </div>
              </div>

              {/* Language Toggle */}
              <div className="space-y-2">
                <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <Languages className="w-3.5 h-3.5 text-indigo-500" strokeWidth={1.5} />
                  <span>{t('settingsLanguage')}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => onChangeLang('ar')}
                    className={`py-2.5 px-3 rounded-xl text-xs font-semibold border transition ${
                      lang === 'ar'
                        ? 'bg-indigo-50 dark:bg-indigo-500/15 border-indigo-500 text-indigo-700 dark:text-indigo-300 shadow-sm'
                        : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    {t('settingsLangArabic')}
                  </button>
                  <button
                    type="button"
                    onClick={() => onChangeLang('en')}
                    className={`py-2.5 px-3 rounded-xl text-xs font-semibold border transition ${
                      lang === 'en'
                        ? 'bg-indigo-50 dark:bg-indigo-500/15 border-indigo-500 text-indigo-700 dark:text-indigo-300 shadow-sm'
                        : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    {t('settingsLangEnglish')}
                  </button>
                </div>
              </div>

              {/* Sound Mute Toggle */}
              <div className="pt-2 border-t border-slate-200/80 dark:border-slate-800 flex items-center justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  {soundMuted ? (
                    <VolumeX className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" strokeWidth={1.5} />
                  ) : (
                    <Volume2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" strokeWidth={1.5} />
                  )}
                  <div>
                    <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                      {t('settingsMuteSounds')}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      {t('settingsMuteSoundsDesc')}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => playNotificationChime()}
                    className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition"
                  >
                    {t('settingsTestSound')}
                  </button>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={soundMuted}
                    onClick={() => onChangeSoundMuted(!soundMuted)}
                    className={`w-11 h-6 rounded-full p-0.5 transition-colors flex items-center ${
                      soundMuted ? 'bg-rose-500 justify-end' : 'bg-slate-300 dark:bg-slate-700 justify-start'
                    }`}
                  >
                    <span className="w-5 h-5 rounded-full bg-white shadow-sm" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Web Mode: Offline Windows Installer Download + Switch Account */}
          {isWebClient && (
            <section className="rounded-2xl bg-gradient-to-br from-emerald-50 to-indigo-50/70 dark:from-emerald-950/30 dark:to-indigo-950/30 border border-emerald-200/80 dark:border-emerald-500/30 p-5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1.5 min-w-0">
                <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                  <Download className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" strokeWidth={1.75} />
                  <span>{t('installerDownloadBtn')}</span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  {installerInfo?.available ? t('installerDownloadSubtitle') : t('installerUnavailableHint')}
                </p>
                {installerInfo?.available && (
                  <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono text-emerald-800 dark:text-emerald-300" dir="ltr">
                    <span>{installerInfo.fileName || 'TwinSync-Pro-Setup.exe'}</span>
                    {installerInfo.size > 0 && (
                      <span>• {formatInstallerSize(installerInfo.size)}</span>
                    )}
                    {installerInfo.version && <span>• v{installerInfo.version}</span>}
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {installerInfo?.available && (
                  <a
                    href={api?.getInstallerDownloadUrl?.() || '/api/installer/download'}
                    download={installerInfo.fileName || undefined}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm transition"
                  >
                    <Download className="w-4 h-4" strokeWidth={1.75} />
                    <span>{t('installerDownloadShort')}</span>
                  </a>
                )}
                <button
                  type="button"
                  onClick={handleWebLogout}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:border-rose-300 text-rose-600 dark:text-rose-400 text-xs font-bold shadow-sm transition"
                >
                  <LogOut className="w-4 h-4" strokeWidth={1.75} />
                  <span>{t('webSwitchAccount')}</span>
                </button>
              </div>
            </section>
          )}

          {/* 2. Account PIN for Mobile & Web Portal (Electron Only) */}
          {!isWebClient && (
          <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                <Lock className="w-4 h-4 text-indigo-500" strokeWidth={1.5} />
                <span>{t('settingsPinSection')}</span>
              </div>
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ${
                  identity?.has_pin
                    ? 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                    : 'bg-amber-100 dark:bg-amber-500/15 text-amber-800 dark:text-amber-300'
                }`}
              >
                {identity?.has_pin && (
                  <CheckCircle2 className="w-3.5 h-3.5" strokeWidth={1.75} />
                )}
                <span>
                  {identity?.has_pin
                    ? t('settingsPinConfigured')
                    : t('settingsPinNotSet')}
                </span>
              </span>
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              {t('settingsPinDesc')}
            </p>

            <form onSubmit={handleSaveAccountPin} noValidate className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    {t('settingsPinNew')}
                  </label>
                  <div className="relative">
                    <input
                      type={showPin ? 'text' : 'password'}
                      inputMode="numeric"
                      maxLength={6}
                      value={newPin}
                      onChange={(e) =>
                        setNewPin(e.target.value.replace(/\D/g, '').slice(0, 6))
                      }
                      placeholder={t('settingsPinPlaceholder')}
                      dir="ltr"
                      className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 pe-11 py-2.5 text-sm font-mono tracking-widest text-slate-900 dark:text-slate-100 placeholder:text-slate-400 placeholder:tracking-normal placeholder:font-sans focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 transition"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPin((prev) => !prev)}
                      title={showPin ? t('settingsHideKey') : t('settingsRevealKey')}
                      className="absolute inset-y-0 end-2 my-auto h-7 w-7 rounded-lg flex items-center justify-center text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                    >
                      {showPin ? (
                        <EyeOff className="w-4 h-4" strokeWidth={1.5} />
                      ) : (
                        <Eye className="w-4 h-4" strokeWidth={1.5} />
                      )}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    {t('settingsPinConfirm')}
                  </label>
                  <input
                    type={showPin ? 'text' : 'password'}
                    inputMode="numeric"
                    maxLength={6}
                    value={confirmPin}
                    onChange={(e) =>
                      setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 6))
                    }
                    placeholder={t('settingsPinPlaceholder')}
                    dir="ltr"
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2.5 text-sm font-mono tracking-widest text-slate-900 dark:text-slate-100 placeholder:text-slate-400 placeholder:tracking-normal placeholder:font-sans focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 transition"
                  />
                </div>
              </div>

              <div className="rounded-xl bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200/70 dark:border-indigo-500/25 px-3.5 py-2.5 flex items-start gap-2 text-xs text-indigo-900 dark:text-indigo-200">
                <Info className="w-4 h-4 shrink-0 mt-0.5 text-indigo-600 dark:text-indigo-400" strokeWidth={1.5} />
                <span>{t('settingsPinResetNote')}</span>
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={savingPin}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm transition disabled:opacity-60"
                >
                  <Lock className="w-3.5 h-3.5" strokeWidth={1.5} />
                  <span>{savingPin ? t('loading') : t('settingsPinSave')}</span>
                </button>
              </div>
            </form>
          </section>
          )}

          {/* 3. Security & Offline Recovery (Electron Only) */}
          {!isWebClient && (
          <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 shadow-sm space-y-5">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
              <Shield className="w-4 h-4 text-emerald-500" strokeWidth={1.5} />
              <span>{t('settingsSecuritySection')}</span>
            </div>

            {/* Master Recovery Key */}
            <div className="rounded-xl border border-amber-200/80 dark:border-amber-500/25 bg-amber-50/60 dark:bg-amber-950/25 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-bold text-amber-900 dark:text-amber-200">
                  <KeyRound className="w-4 h-4 text-amber-600 dark:text-amber-400" strokeWidth={1.5} />
                  <span>{t('settingsMasterKey')}</span>
                </div>
                <div
                  dir="ltr"
                  className="font-mono text-sm font-bold tracking-[0.2em] text-slate-900 dark:text-amber-300"
                >
                  {masterRecoveryKey
                    ? revealKey
                      ? masterRecoveryKey
                      : '••••-••••-••••'
                    : t('settingsMasterKeyUnavailable')}
                </div>
              </div>

              {masterRecoveryKey && (
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setRevealKey((prev) => !prev)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white dark:bg-slate-800 border border-amber-200 dark:border-amber-700/60 text-slate-700 dark:text-slate-200 hover:bg-amber-100/50 dark:hover:bg-slate-700 transition"
                  >
                    {revealKey ? (
                      <EyeOff className="w-3.5 h-3.5" strokeWidth={1.5} />
                    ) : (
                      <Eye className="w-3.5 h-3.5" strokeWidth={1.5} />
                    )}
                    <span>{revealKey ? t('settingsHideKey') : t('settingsRevealKey')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleCopyKey}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white shadow-sm transition"
                  >
                    {copiedKey ? (
                      <Check className="w-3.5 h-3.5" strokeWidth={1.5} />
                    ) : (
                      <Copy className="w-3.5 h-3.5" strokeWidth={1.5} />
                    )}
                    <span>{copiedKey ? t('copied') : t('copy')}</span>
                  </button>
                </div>
              )}
            </div>

            {/* Security Q&A Form */}
            <form onSubmit={handleSaveSecurityQA} className="space-y-4">
              <SecurityQaFields
                t={t}
                selectedPreset={selectedPreset}
                onSelectPreset={setSelectedPreset}
                customQuestion={customQuestion}
                onChangeCustomQuestion={setCustomQuestion}
                securityAnswer={securityAnswer}
                onChangeSecurityAnswer={setSecurityAnswer}
                requireAnswer={false}
              />
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={savingSecurity}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-sm transition disabled:opacity-60"
                >
                  <span>{savingSecurity ? t('loading') : t('settingsUpdateQA')}</span>
                </button>
              </div>
            </form>
          </section>
          )}

          {/* 3b. Windows Network & Firewall Health + Offline Installer Distribution (Electron Only) */}
          {!isWebClient && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Windows Network & Firewall Health */}
              <section className="min-w-0 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 shadow-sm space-y-4 flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                      <ShieldAlert className="w-4 h-4 text-indigo-500 shrink-0" strokeWidth={1.5} />
                      <span>{t('netHealthTitle')}</span>
                    </div>
                    {networkHealth?.supported && (
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                          networkHealth.needsAction
                            ? 'bg-amber-100 dark:bg-amber-500/15 text-amber-800 dark:text-amber-300'
                            : 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                        }`}
                      >
                        {networkHealth.needsAction ? (
                          <AlertTriangle className="w-3.5 h-3.5" strokeWidth={1.75} />
                        ) : (
                          <CheckCircle2 className="w-3.5 h-3.5" strokeWidth={1.75} />
                        )}
                        <span>
                          {networkHealth.needsAction ? t('warning') : t('success')}
                        </span>
                      </span>
                    )}
                  </div>

                  {networkHealth && !networkHealth.supported ? (
                    <div className="rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 px-3.5 py-3 flex items-start gap-2 text-xs text-slate-600 dark:text-slate-300">
                      <Info className="w-4 h-4 shrink-0 mt-0.5 text-indigo-500" strokeWidth={1.5} />
                      <span>{t('netHealthLinuxNote')}</span>
                    </div>
                  ) : networkHealth?.supported ? (
                    <div className="space-y-2.5">
                      {Array.isArray(networkHealth.activeProfiles) &&
                        networkHealth.activeProfiles.length > 0 && (
                          <div className="space-y-1.5">
                            <div className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                              {t('netHealthActiveConnection')}
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {networkHealth.activeProfiles.map((prof, idx) => {
                                const isPub =
                                  String(prof.NetworkCategory || '').toLowerCase() === 'public';
                                const label = prof.InterfaceAlias || prof.Name || 'LAN';
                                const sub =
                                  prof.Name &&
                                  prof.InterfaceAlias &&
                                  prof.Name !== prof.InterfaceAlias
                                    ? ` (${prof.Name})`
                                    : '';
                                return (
                                  <span
                                    key={`${label}-${idx}`}
                                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium border ${
                                      isPub
                                        ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-500/30 text-amber-800 dark:text-amber-300'
                                        : 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-500/30 text-emerald-800 dark:text-emerald-300'
                                    }`}
                                  >
                                    <span className="font-mono" dir="ltr">
                                      {label}
                                      {sub}
                                    </span>
                                    <span
                                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                        isPub
                                          ? 'bg-amber-200/70 dark:bg-amber-500/25 text-amber-900 dark:text-amber-200'
                                          : 'bg-emerald-200/70 dark:bg-emerald-500/25 text-emerald-900 dark:text-emerald-200'
                                      }`}
                                    >
                                      {prof.NetworkCategory || 'Private'}
                                    </span>
                                  </span>
                                );
                              })}
                            </div>
                          </div>
                        )}

                      {networkHealth.needsAction ? (
                        <div className="space-y-2.5">
                          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                            {t('netHealthModalDesc')}
                          </p>

                          {Array.isArray(networkHealth.publicProfiles) &&
                            networkHealth.publicProfiles.length > 0 && (
                              <div className="rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-500/25 p-3 space-y-1">
                                <div className="text-[11px] font-bold text-amber-900 dark:text-amber-200">
                                  {t('netHealthPublicList')}
                                </div>
                                <ul className="list-disc list-inside text-[11px] font-mono text-amber-800 dark:text-amber-300">
                                  {networkHealth.publicProfiles.map((prof, idx) => (
                                    <li key={idx}>
                                      {prof.Name || prof.InterfaceAlias || 'Public Network'}
                                      {prof.InterfaceAlias && prof.Name
                                        ? ` (${prof.InterfaceAlias})`
                                        : ''}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}

                          {Array.isArray(networkHealth.missingFirewallRules) &&
                            networkHealth.missingFirewallRules.length > 0 && (
                              <div className="rounded-xl bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200/80 dark:border-rose-500/25 p-3 space-y-1">
                                <div className="text-[11px] font-bold text-rose-900 dark:text-rose-200">
                                  {t('netHealthFirewallMissing')}
                                </div>
                                <ul
                                  className="list-disc list-inside text-[11px] font-mono text-rose-800 dark:text-rose-300"
                                  dir="ltr"
                                >
                                  {networkHealth.missingFirewallRules.map((rule) => (
                                    <li key={rule}>{rule}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                        </div>
                      ) : (
                        <div className="rounded-xl bg-emerald-50/80 dark:bg-emerald-950/30 border border-emerald-200/80 dark:border-emerald-500/30 px-3.5 py-3 flex items-start gap-2 text-xs text-emerald-800 dark:text-emerald-200">
                          <CheckCircle2
                            className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400"
                            strokeWidth={1.75}
                          />
                          <span>{t('netHealthAllGood')}</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {t('loading')}
                    </p>
                  )}
                </div>

                {(!networkHealth || networkHealth.supported) && (
                  <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={loadNetworkHealth}
                      disabled={checkingHealth || fixingHealth}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition disabled:opacity-60"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${checkingHealth ? 'animate-spin' : ''}`} strokeWidth={1.5} />
                      <span>{t('netHealthCheckBtn')}</span>
                    </button>
                    {networkHealth?.supported && (
                      <button
                        type="button"
                        onClick={handleFixNetworkHealth}
                        disabled={fixingHealth}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition disabled:opacity-60"
                      >
                        <Shield className="w-3.5 h-3.5" strokeWidth={1.5} />
                        <span>{fixingHealth ? t('netHealthFixing') : t('netHealthFixBtn')}</span>
                      </button>
                    )}
                  </div>
                )}
              </section>

              {/* Offline LAN Installer Distribution */}
              <section className="min-w-0 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 shadow-sm space-y-4 flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                      <Download className="w-4 h-4 text-emerald-500 shrink-0" strokeWidth={1.5} />
                      <span>{t('installerSectionTitle')}</span>
                    </div>
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                        installerInfo?.available
                          ? 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {installerInfo?.available ? t('installerAvailable') : t('installerMissing')}
                    </span>
                  </div>

                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    {t('installerSectionDesc')}
                  </p>

                  {installerInfo?.available ? (
                    <div className="rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/80 dark:border-emerald-500/25 p-3 space-y-1">
                      <div className="text-xs font-bold text-emerald-900 dark:text-emerald-200 font-mono truncate" dir="ltr">
                        {installerInfo.fileName}
                      </div>
                      <div className="text-[11px] text-emerald-800 dark:text-emerald-300 flex flex-wrap gap-2" dir="ltr">
                        {installerInfo.size > 0 && <span>{formatInstallerSize(installerInfo.size)}</span>}
                        {installerInfo.version && <span>v{installerInfo.version}</span>}
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 px-3.5 py-3 text-xs text-slate-500 dark:text-slate-400">
                      {t('installerUnavailableHint')}
                    </div>
                  )}
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    onClick={handleImportInstaller}
                    disabled={attachingInstaller}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-sm transition disabled:opacity-60"
                  >
                    <Upload className="w-3.5 h-3.5" strokeWidth={1.5} />
                    <span>{attachingInstaller ? t('loading') : t('installerAttachBtn')}</span>
                  </button>
                </div>
              </section>
            </div>
          )}

          {/* 3c. Network Adapters & QR Links Management (Electron Only) */}
          {!isWebClient && (
            <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 shadow-sm space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                  <Network className="w-4 h-4 text-indigo-500 shrink-0" strokeWidth={1.5} />
                  <span>{t('settingsAdaptersTitle')}</span>
                </div>
                <button
                  type="button"
                  onClick={loadAdapters}
                  disabled={loadingAdapters || savingAdapters}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition disabled:opacity-60"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${loadingAdapters ? 'animate-spin' : ''}`}
                    strokeWidth={1.5}
                  />
                  <span>{t('refresh')}</span>
                </button>
              </div>

              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                {t('settingsAdaptersDesc')}
              </p>

              {/* Master Hide Virtual Adapters Toggle */}
              <div className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 px-4 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                    {t('settingsHideVirtualAdapters')}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    {t('settingsHideVirtualAdaptersDesc')}
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={adapterPrefs.hideVirtualAdapters}
                  disabled={savingAdapters}
                  onClick={handleToggleHideVirtual}
                  className={`w-11 h-6 shrink-0 rounded-full p-0.5 transition-colors flex items-center disabled:opacity-60 ${
                    adapterPrefs.hideVirtualAdapters
                      ? 'bg-indigo-600 justify-end'
                      : 'bg-slate-300 dark:bg-slate-700 justify-start'
                  }`}
                >
                  <span className="w-5 h-5 rounded-full bg-white shadow-sm" />
                </button>
              </div>

              {allAdapters.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400 py-2">
                  {t('settingsNoAdaptersFound')}
                </p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {allAdapters.map((adapter) => {
                    const cat = getAdapterCategoryMeta(adapter.category, t);
                    const isPinned =
                      Boolean(adapter.isPreferred) ||
                      adapterPrefs.preferredAdapter === adapter.name;
                    return (
                      <div
                        key={`${adapter.name}-${adapter.ip}`}
                        className={`min-w-0 rounded-xl border p-3.5 flex flex-col justify-between gap-3 transition ${
                          isPinned
                            ? 'bg-indigo-50/60 dark:bg-indigo-950/25 border-indigo-300 dark:border-indigo-500/40'
                            : adapter.visible
                            ? 'bg-slate-50/70 dark:bg-slate-950/60 border-slate-200 dark:border-slate-800'
                            : 'bg-slate-100/60 dark:bg-slate-900/50 border-slate-200/60 dark:border-slate-800/60 opacity-75'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2 min-w-0">
                          <div className="min-w-0 space-y-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                                {adapter.name}
                              </span>
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${cat.badgeClass}`}
                              >
                                {cat.label}
                              </span>
                              {adapter.isPrimary && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                                  {t('mobileActiveQrBadge')}
                                </span>
                              )}
                            </div>
                            <div
                              className="text-[11px] font-mono text-slate-600 dark:text-slate-300 truncate"
                              dir="ltr"
                            >
                              {adapter.ip}
                            </div>
                          </div>

                          <button
                            type="button"
                            role="switch"
                            aria-checked={Boolean(adapter.visible)}
                            disabled={savingAdapters}
                            onClick={() => handleToggleAdapterVisible(adapter)}
                            title={
                              adapter.visible
                                ? t('settingsAdapterVisible')
                                : t('settingsAdapterHidden')
                            }
                            className={`w-10 h-5 shrink-0 rounded-full p-0.5 transition-colors flex items-center disabled:opacity-60 ${
                              adapter.visible
                                ? 'bg-emerald-500 justify-end'
                                : 'bg-slate-300 dark:bg-slate-700 justify-start'
                            }`}
                          >
                            <span className="w-4 h-4 rounded-full bg-white shadow-sm" />
                          </button>
                        </div>

                        <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-200/70 dark:border-slate-800/80">
                          <span
                            className={`text-[11px] font-semibold ${
                              adapter.visible
                                ? 'text-emerald-700 dark:text-emerald-400'
                                : 'text-slate-500 dark:text-slate-400'
                            }`}
                          >
                            {adapter.visible
                              ? t('settingsAdapterVisible')
                              : t('settingsAdapterHidden')}
                          </span>

                          <button
                            type="button"
                            disabled={savingAdapters}
                            onClick={() => handlePinDefaultAdapter(adapter)}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition disabled:opacity-60 ${
                              isPinned
                                ? 'bg-indigo-600 text-white shadow-sm hover:bg-indigo-700'
                                : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-400'
                            }`}
                          >
                            <Star
                              className={`w-3 h-3 ${isPinned ? 'fill-current' : ''}`}
                              strokeWidth={1.75}
                            />
                            <span>
                              {isPinned
                                ? t('settingsAdapterPinned')
                                : t('settingsAdapterPinDefault')}
                            </span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {/* 4. Connected Mesh Peers & Direct / Tailscale Connect */}
          <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                <Users className="w-4 h-4 text-indigo-500" strokeWidth={1.5} />
                <span>{t('settingsPeersSection', { count: peers.length })}</span>
              </div>

              {!isWebClient && (
                <div className="flex flex-wrap items-center gap-2">
                  {networkInfo?.tailscale?.running && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                      <Wifi className="w-3.5 h-3.5" strokeWidth={1.75} />
                      <span>
                        {t('settingsTailscaleActive', {
                          ip: networkInfo.tailscale.selfIps?.[0] || '—',
                          count: networkInfo.tailscale.onlinePeers?.length || 0
                        })}
                      </span>
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={handleRefreshDiscovery}
                    disabled={scanningNetwork}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition disabled:opacity-60"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${scanningNetwork ? 'animate-spin' : ''}`} strokeWidth={1.5} />
                    <span>{t('settingsTailscaleScanNow')}</span>
                  </button>
                </div>
              )}
            </div>

            {/* Direct IP / Tailscale Peer Connect Card (Electron Only) */}
            {!isWebClient && (
              <div className="rounded-xl border border-indigo-200/70 dark:border-indigo-500/25 bg-indigo-50/50 dark:bg-indigo-950/25 p-4 space-y-3">
                <div>
                  <div className="text-xs font-bold text-slate-900 dark:text-white">
                    {t('settingsDirectConnectTitle')}
                  </div>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5 leading-relaxed">
                    {t('settingsDirectConnectDesc')}
                  </p>
                </div>

                <form onSubmit={handleConnectManualPeer} className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    dir="ltr"
                    value={manualAddress}
                    onChange={(e) => setManualAddress(e.target.value)}
                    placeholder={t('settingsDirectConnectPlaceholder')}
                    className="min-w-0 flex-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2 text-xs font-mono text-slate-900 dark:text-slate-100 placeholder:text-slate-400 placeholder:font-sans focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 transition"
                  />
                  <button
                    type="submit"
                    disabled={connectingManual}
                    className="shrink-0 inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm transition disabled:opacity-60"
                  >
                    <Plus className="w-3.5 h-3.5" strokeWidth={1.75} />
                    <span>{connectingManual ? t('loading') : t('settingsDirectConnectBtn')}</span>
                  </button>
                </form>

                {Array.isArray(networkInfo?.manualPeers) && networkInfo.manualPeers.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                      {t('settingsDirectSavedList')}
                    </span>
                    {networkInfo.manualPeers.map((mp) => {
                      const key = `${mp.host}:${mp.wsPort}`;
                      return (
                        <span
                          key={key}
                          dir="ltr"
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-mono bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200"
                        >
                          <span>{key}</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveManualPeer(key)}
                            title={t('delete')}
                            className="text-slate-400 hover:text-rose-500 transition"
                          >
                            <X className="w-3 h-3" strokeWidth={2} />
                          </button>
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {sortedPeers.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400 py-2">
                {t('settingsNoPeers')}
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {sortedPeers.map((peer) => {
                  const isOnline = peer.status === 'online';
                  return (
                    <div
                      key={peer.uuid}
                      className="min-w-0 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-3.5 flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="relative">
                          <UserAvatar
                            name={peer.display_name}
                            avatarData={peer.avatar_data}
                            size="md"
                          />
                          <span
                            className={`absolute bottom-0 end-0 w-2.5 h-2.5 rounded-full ring-2 ring-white dark:ring-slate-950 ${
                              isOnline ? 'bg-emerald-500' : 'bg-slate-400'
                            }`}
                          />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                              {peer.display_name || t('unknown')}
                            </span>
                            <DeviceTypeBadge deviceType={peer.device_type} t={t} />
                            <span
                              className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                                isOnline
                                  ? 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                                  : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                              }`}
                            >
                              {isOnline ? t('online') : t('offline')}
                            </span>
                          </div>
                          <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate" dir="ltr">
                            {peer.ip ? `${peer.ip}${peer.ws_port ? `:${peer.ws_port}` : ''}` : '—'}
                          </div>
                          <div className="text-[10px] font-mono text-slate-400 truncate" dir="ltr">
                            {peer.uuid}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleCopyPeerUuid(peer.uuid)}
                          title={t('copy')}
                          className="p-2 rounded-lg text-slate-500 hover:bg-slate-200/70 dark:hover:bg-slate-800 transition shrink-0"
                        >
                          {copiedPeerId === peer.uuid ? (
                            <Check className="w-3.5 h-3.5 text-emerald-500" strokeWidth={1.5} />
                          ) : (
                            <Copy className="w-3.5 h-3.5" strokeWidth={1.5} />
                          )}
                        </button>
                        {!isWebClient && !isOnline && (
                          <button
                            type="button"
                            onClick={() => handleRemoveOfflinePeer(peer)}
                            disabled={removingPeerUuid === peer.uuid}
                            title={t('settingsRemoveOfflinePeer')}
                            className="p-2 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/15 transition shrink-0 disabled:opacity-50"
                          >
                            <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* 5. Activity Audit Log Viewer (Electron Only) */}
          {!isWebClient && (
          <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                <History className="w-4 h-4 text-indigo-500" strokeWidth={1.5} />
                <span>{t('settingsAuditSection')}</span>
              </div>

              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search
                    className="w-3.5 h-3.5 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2"
                    strokeWidth={1.5}
                  />
                  <input
                    type="text"
                    value={auditSearch}
                    onChange={(e) => setAuditSearch(e.target.value)}
                    placeholder={t('settingsAuditSearch')}
                    className="w-56 sm:w-64 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 ps-8 pe-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                  />
                </div>
                <button
                  type="button"
                  onClick={loadAuditLogs}
                  disabled={loadingLogs}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition disabled:opacity-60"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingLogs ? 'animate-spin' : ''}`} strokeWidth={1.5} />
                  <span>{t('settingsAuditRefresh')}</span>
                </button>
              </div>
            </div>

            {filteredLogs.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400 py-4 text-center">
                {t('settingsNoLogs')}
              </p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200/80 dark:border-slate-800">
                <table className="w-full text-start border-collapse text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400 border-b border-slate-200/80 dark:border-slate-800">
                    <tr>
                      <th className="py-2.5 px-3 text-start font-semibold">{t('propsUpdatedAt')}</th>
                      <th className="py-2.5 px-3 text-start font-semibold">{t('owner')}</th>
                      <th className="py-2.5 px-3 text-start font-semibold">{t('propsType')}</th>
                      <th className="py-2.5 px-3 text-start font-semibold">{t('trashOriginalPath')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                    {filteredLogs.slice(0, 60).map((log, idx) => (
                      <tr key={log.id || idx} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                        <td className="py-2 px-3 whitespace-nowrap text-slate-500 dark:text-slate-400">
                          {formatLogTime(log.created_at, lang)}
                        </td>
                        <td className="py-2 px-3 font-medium text-slate-800 dark:text-slate-200">
                          {log.actor_name || t('unknown')}
                        </td>
                        <td className="py-2 px-3">
                          <span className="px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 font-mono text-[11px]">
                            {log.event_type || 'EVENT'}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-slate-600 dark:text-slate-300 max-w-xs truncate" dir="ltr">
                          {log.target_path ? `/${log.target_path}` : formatDetails(log.details) || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          )}
        </div>
      </div>
    </div>
  );
}
