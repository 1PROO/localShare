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
  Users,
  History,
  RefreshCw,
  Search
} from 'lucide-react';
import {
  UserAvatar,
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

export default function SettingsView({
  t,
  lang,
  theme,
  soundMuted,
  identity,
  masterRecoveryKey,
  peers = [],
  onChangeTheme,
  onChangeLang,
  onChangeSoundMuted,
  onRefreshBootstrap,
  onToast
}) {
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

  // Peers copy feedback
  const [copiedPeerId, setCopiedPeerId] = useState(null);

  // Audit logs
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditSearch, setAuditSearch] = useState('');
  const [loadingLogs, setLoadingLogs] = useState(false);

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
    if (!window.workmesh?.getAuditLogs) return;
    setLoadingLogs(true);
    try {
      const res = await window.workmesh.getAuditLogs({
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
  }, [auditSearch, onToast, t]);

  useEffect(() => {
    loadAuditLogs();
  }, [loadAuditLogs]);

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
    const trimmed = displayName.trim();
    if (!trimmed) {
      onToast?.(t('onboardingErrorNameRequired'), 'error');
      return;
    }
    setSavingProfile(true);
    try {
      const res = await window.workmesh.updateProfile({
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
      const res = await window.workmesh.updateSecurityQA({
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

  const handleCopyKey = async () => {
    if (!masterRecoveryKey) return;
    try {
      await navigator.clipboard.writeText(masterRecoveryKey);
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 1800);
    } catch {
      onToast?.(t('error'), 'error');
    }
  };

  const handleCopyPeerUuid = async (uuid) => {
    try {
      await navigator.clipboard.writeText(uuid);
      setCopiedPeerId(uuid);
      setTimeout(() => setCopiedPeerId(null), 1600);
    } catch {
      // ignore
    }
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
    <div className="flex-1 h-full flex flex-col bg-slate-50 dark:bg-slate-950 overflow-hidden">
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
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-5xl mx-auto space-y-6 pb-8">
          {/* 1. Profile & Appearance Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Local Profile */}
            <form
              onSubmit={handleSaveProfile}
              className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 shadow-sm space-y-4"
            >
              <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                <User className="w-4 h-4 text-indigo-500" strokeWidth={1.5} />
                <span>{t('settingsProfileSection')}</span>
              </div>

              <div className="flex items-center gap-4">
                <UserAvatar name={displayName} avatarData={avatarData} size="xl" />
                <div className="space-y-2">
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
                    <div className="text-[11px] font-mono text-slate-400" dir="ltr">
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

            {/* Appearance, Language & Sound */}
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 shadow-sm space-y-5">
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

          {/* 2. Security & Offline Recovery */}
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

          {/* 3. Connected Mesh Peers */}
          <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 shadow-sm space-y-4">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
              <Users className="w-4 h-4 text-indigo-500" strokeWidth={1.5} />
              <span>{t('settingsPeersSection', { count: peers.length })}</span>
            </div>

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
                      className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-3.5 flex items-center justify-between gap-3"
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
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* 4. Activity Audit Log Viewer */}
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
        </div>
      </div>
    </div>
  );
}
