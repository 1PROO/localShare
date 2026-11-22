import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Shield,
  Smartphone,
  Sun,
  Moon,
  Languages,
  Download,
  Search,
  RefreshCw,
  KeyRound,
  Lock,
  Eye,
  EyeOff,
  Check,
  Copy,
  Upload,
  X,
  ArrowLeft,
  ArrowRight,
  UserPlus,
  LogIn,
  AlertTriangle,
  HelpCircle,
  Link2
} from 'lucide-react';
import { TwinSyncLogo } from './TwinSyncLogo';
import {
  UserAvatar,
  DeviceTypeBadge,
  copyTextSafe,
  resizeImageToDataUrl,
  SECURITY_QUESTION_KEYS
} from './OnboardingModal';

const AVATAR_COLORS = [
  '#4F46E5',
  '#0EA5E9',
  '#10B981',
  '#8B5CF6',
  '#EC4899',
  '#F59E0B',
  '#EF4444',
  '#334155'
];

function formatInstallerSize(bytes) {
  const n = Number(bytes) || 0;
  if (n <= 0) return '';
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export default function WebPortalAuth({
  t,
  lang,
  theme,
  sessionExpired = false,
  installerInfo = null,
  onToggleTheme,
  onToggleLang,
  onAuthenticated,
  onToast
}) {
  const api = window.twinsync || window.workmesh;
  const isRtl = lang === 'ar';
  const BackArrow = isRtl ? ArrowRight : ArrowLeft;

  const [activeTab, setActiveTab] = useState('login'); // 'login' | 'register'
  const [accounts, setAccounts] = useState([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [accountSearch, setAccountSearch] = useState('');
  const [selectedUuid, setSelectedUuid] = useState('');

  // Login PIN state
  const [loginPin, setLoginPin] = useState('');
  const [showLoginPin, setShowLoginPin] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState('');

  // Offline Recovery state (mobile accounts)
  const [recoveryInfo, setRecoveryInfo] = useState(null);
  const [recoveryMethod, setRecoveryMethod] = useState('security_qa');
  const [recoveryAnswerOrCode, setRecoveryAnswerOrCode] = useState('');
  const [recNewPin, setRecNewPin] = useState('');
  const [recConfirmPin, setRecConfirmPin] = useState('');
  const [recovering, setRecovering] = useState(false);
  const [recoveryError, setRecoveryError] = useState('');

  // Registration state
  const [regName, setRegName] = useState('');
  const [regAvatar, setRegAvatar] = useState('color:#4F46E5');
  const [regHasPhoto, setRegHasPhoto] = useState(false);
  const [regPin, setRegPin] = useState('');
  const [regConfirmPin, setRegConfirmPin] = useState('');
  const [showRegPin, setShowRegPin] = useState(false);
  const [regPresetQ, setRegPresetQ] = useState(SECURITY_QUESTION_KEYS[0]);
  const [regCustomQ, setRegCustomQ] = useState('');
  const [regAnswer, setRegAnswer] = useState('');
  const [registering, setRegistering] = useState(false);
  const [regError, setRegError] = useState('');
  const regFileInputRef = useRef(null);

  // One-time 6-char recovery code modal after registration
  const [recoveryModalData, setRecoveryModalData] = useState(null);
  const [copiedCode, setCopiedCode] = useState(false);

  // Quick Link fallback
  const [quickToken, setQuickToken] = useState('');
  const [connectingToken, setConnectingToken] = useState(false);
  const [tokenError, setTokenError] = useState('');

  const loadAccounts = useCallback(async () => {
    if (!api?.webGetAccounts) {
      setLoadingAccounts(false);
      return;
    }
    setLoadingAccounts(true);
    try {
      const data = await api.webGetAccounts();
      setAccounts(Array.isArray(data?.accounts) ? data.accounts : []);
    } catch {
      setAccounts([]);
    } finally {
      setLoadingAccounts(false);
    }
  }, [api]);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  const filteredAccounts = useMemo(() => {
    const q = accountSearch.trim().toLowerCase();
    if (!q) return accounts;
    return accounts.filter((acc) =>
      String(acc.display_name || acc.name || '')
        .toLowerCase()
        .includes(q)
    );
  }, [accounts, accountSearch]);

  const selectedAccount = useMemo(
    () => accounts.find((a) => a.uuid === selectedUuid) || null,
    [accounts, selectedUuid]
  );

  const handleSelectAccount = (acc) => {
    setSelectedUuid(acc.uuid);
    setLoginPin('');
    setLoginError('');
    setRecoveryInfo(null);
    setRecoveryError('');
  };

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    if (!selectedAccount || !api?.webLogin) return;
    const pin = loginPin.trim();
    if (!/^\d{4,6}$/.test(pin)) {
      setLoginError(t('settingsPinInvalidFormat', 'PIN must be 4 to 6 numeric digits'));
      return;
    }
    setLoginError('');
    setLoggingIn(true);
    try {
      const res = await api.webLogin(selectedAccount.uuid, pin);
      if (!res?.ok) {
        if (res?.code === 'PIN_NOT_SET') {
          setLoginError(
            t(
              'webPcNoPinNote',
              'No Account PIN is set for this PC account yet. Open TwinSync Pro on the PC and set an Account PIN in Settings.'
            )
          );
        } else {
          setLoginError(t('webInvalidPin', 'Incorrect PIN'));
        }
        return;
      }
      onAuthenticated?.(res);
    } catch (err) {
      setLoginError(err?.message || t('webInvalidPin', 'Incorrect PIN'));
    } finally {
      setLoggingIn(false);
    }
  };

  const handleOpenForgotPin = async () => {
    if (!selectedAccount || selectedAccount.device_type !== 'mobile' || !api?.webGetRecoveryInfo) {
      return;
    }
    setLoginError('');
    try {
      const info = await api.webGetRecoveryInfo(selectedAccount.uuid);
      if (!info?.ok) {
        setLoginError(info?.error || t('error'));
        return;
      }
      setRecoveryInfo(info);
      setRecoveryMethod(info.hasSecurityQA ? 'security_qa' : 'recovery_code');
      setRecoveryAnswerOrCode('');
      setRecNewPin('');
      setRecConfirmPin('');
      setRecoveryError('');
    } catch (err) {
      setLoginError(err?.message || t('error'));
    }
  };

  const handleRecoverPinSubmit = async (e) => {
    e.preventDefault();
    if (!selectedAccount || !api?.webRecoverPin) return;
    const answerOrCode = recoveryAnswerOrCode.trim();
    const newPin = recNewPin.trim();
    const confirmPin = recConfirmPin.trim();

    if (!answerOrCode) {
      setRecoveryError(t('webInvalidRecovery', 'Invalid security answer or recovery code'));
      return;
    }
    if (!/^\d{4,6}$/.test(newPin)) {
      setRecoveryError(t('settingsPinInvalidFormat', 'PIN must be 4 to 6 numeric digits'));
      return;
    }
    if (newPin !== confirmPin) {
      setRecoveryError(t('settingsPinMismatch', 'PIN and confirmation do not match'));
      return;
    }

    setRecoveryError('');
    setRecovering(true);
    try {
      const res = await api.webRecoverPin({
        uuid: selectedAccount.uuid,
        method: recoveryMethod,
        answerOrCode:
          recoveryMethod === 'recovery_code' ? answerOrCode.toUpperCase() : answerOrCode,
        newPin
      });
      if (!res?.ok) {
        setRecoveryError(t('webInvalidRecovery', 'Invalid security answer or recovery code'));
        return;
      }
      onToast?.(t('webPinRecovered', 'PIN updated and signed in successfully'), 'success');
      onAuthenticated?.(res);
    } catch (err) {
      setRecoveryError(err?.message || t('webInvalidRecovery', 'Invalid credentials'));
    } finally {
      setRecovering(false);
    }
  };

  const handleRegPhotoChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await resizeImageToDataUrl(file, 160, 0.82);
      setRegAvatar(dataUrl);
      setRegHasPhoto(true);
      setRegError('');
    } catch (err) {
      setRegError(err?.message || t('error'));
    }
  };

  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    if (!api?.webRegister) return;
    const name = regName.trim();
    const pin = regPin.trim();
    const confirm = regConfirmPin.trim();
    const resolvedQ =
      regPresetQ === 'custom' ? regCustomQ.trim() : t(regPresetQ);
    const answer = regAnswer.trim();

    if (!name) {
      setRegError(t('onboardingErrorNameRequired', 'Display name is required'));
      return;
    }
    if (!/^\d{4,6}$/.test(pin)) {
      setRegError(t('settingsPinInvalidFormat', 'PIN must be 4 to 6 numeric digits'));
      return;
    }
    if (pin !== confirm) {
      setRegError(t('settingsPinMismatch', 'PIN and confirmation do not match'));
      return;
    }
    if (!resolvedQ) {
      setRegError(t('onboardingErrorQuestionRequired', 'Security question is required'));
      return;
    }
    if (!answer) {
      setRegError(t('onboardingErrorAnswerRequired', 'Security answer is required'));
      return;
    }

    setRegError('');
    setRegistering(true);
    try {
      const res = await api.webRegister(
        {
          name,
          avatar: regAvatar,
          pin,
          securityQuestion: resolvedQ,
          securityAnswer: answer
        },
        { deferActivate: true }
      );
      if (!res?.ok) {
        setRegError(res?.error || t('error'));
        return;
      }
      setRecoveryModalData(res);
      setCopiedCode(false);
    } catch (err) {
      setRegError(err?.message || t('error'));
    } finally {
      setRegistering(false);
    }
  };

  const handleCopyRecoveryCode = async () => {
    if (!recoveryModalData?.recoveryCode) return;
    const ok = await copyTextSafe(recoveryModalData.recoveryCode);
    if (ok) {
      setCopiedCode(true);
      onToast?.(t('copied'), 'success');
      setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  const handleEnterAfterRegister = () => {
    if (!recoveryModalData) return;
    const data = recoveryModalData;
    setRecoveryModalData(null);
    api?.webActivateSession?.(data);
    onAuthenticated?.(data);
  };

  const handleQuickTokenConnect = async (e) => {
    e.preventDefault();
    if (!quickToken.trim() || !api?.webLoginWithToken) return;
    setTokenError('');
    setConnectingToken(true);
    try {
      const res = await api.webLoginWithToken(quickToken);
      if (!res?.ok) {
        setTokenError(res?.error || t('webSessionExpired', 'Invalid or expired token'));
        return;
      }
      onAuthenticated?.(res);
    } catch (err) {
      setTokenError(err?.message || t('error'));
    } finally {
      setConnectingToken(false);
    }
  };

  return (
    <div className="min-h-screen h-screen w-screen overflow-y-auto bg-gradient-to-br from-slate-50 via-indigo-50/40 to-emerald-50/40 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 text-slate-900 dark:text-slate-100 flex flex-col">
      {/* Top Bar */}
      <header className="px-4 sm:px-8 py-3.5 bg-white/85 dark:bg-slate-900/85 wm-glass border-b border-slate-200/80 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 sticky top-0 z-20">
        <div className="flex items-center gap-3 min-w-0">
          <TwinSyncLogo size={40} className="shrink-0 drop-shadow-sm" />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-base font-bold text-slate-900 dark:text-white truncate">
                {t('appName', 'TwinSync Pro')}
              </h1>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-200/70 dark:border-emerald-500/30">
                <Shield className="w-3 h-3" strokeWidth={1.75} />
                <span>{t('webZeroFootprint', 'Zero Footprint • RAM Only')}</span>
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
              {t('webPortalSubtitle', 'Unified LAN Portal for Real-Time Chat & Vault Files')}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => api?.switchToMobileUi?.()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200/80 dark:border-slate-700 transition"
          >
            <Smartphone className="w-3.5 h-3.5 text-indigo-500" strokeWidth={1.75} />
            <span>{t('webSwitchToMobile', 'Mobile UI')}</span>
          </button>

          <button
            type="button"
            onClick={onToggleLang}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
            title={t('settingsLanguage')}
          >
            <Languages className="w-3.5 h-3.5" strokeWidth={1.5} />
            <span>{lang === 'ar' ? 'EN' : 'عربي'}</span>
          </button>

          <button
            type="button"
            onClick={onToggleTheme}
            className="p-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
            title={t('settingsTheme')}
          >
            {theme === 'dark' ? (
              <Sun className="w-4 h-4 text-amber-400" strokeWidth={1.5} />
            ) : (
              <Moon className="w-4 h-4 text-indigo-600" strokeWidth={1.5} />
            )}
          </button>
        </div>
      </header>

      {/* Main Auth Container */}
      <main className="flex-1 w-full max-w-4xl mx-auto px-4 py-6 space-y-5">
        {/* Session Expired Banner */}
        {sessionExpired && (
          <div className="wm-animate-in rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300/80 dark:border-amber-500/40 px-4 py-3 flex items-start gap-3 text-xs text-amber-900 dark:text-amber-200 shadow-sm">
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" strokeWidth={1.75} />
            <span className="leading-relaxed">
              {t(
                'webSessionExpired',
                'Your session expired or the Quick Link token was rotated. Sign in with your account below or paste a new token.'
              )}
            </span>
          </div>
        )}

        {/* Prominent Offline LAN Windows Installer Banner */}
        {installerInfo?.available && (
          <div className="wm-animate-in rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white p-4 sm:p-5 shadow-lg shadow-emerald-600/15 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3.5 min-w-0">
              <div className="w-11 h-11 rounded-xl bg-white/15 backdrop-blur-sm flex items-center justify-center shrink-0">
                <Download className="w-5 h-5" strokeWidth={1.75} />
              </div>
              <div className="min-w-0 space-y-0.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-sm font-bold">
                    {t('installerDownloadBtn', 'Download TwinSync Pro for Windows (.exe)')}
                  </h2>
                  {installerInfo.version && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-white/20">
                      v{installerInfo.version}
                    </span>
                  )}
                </div>
                <p className="text-xs text-emerald-50/90 leading-relaxed">
                  {t(
                    'installerDownloadSubtitle',
                    'Install the full Windows desktop app directly from the local network — zero internet required.'
                  )}
                </p>
                <div className="text-[11px] font-mono text-emerald-100/90 truncate" dir="ltr">
                  {installerInfo.fileName}
                  {installerInfo.size ? ` • ${formatInstallerSize(installerInfo.size)}` : ''}
                </div>
              </div>
            </div>

            <a
              href={api?.getInstallerDownloadUrl?.() || '/api/installer/download'}
              download={installerInfo.fileName || true}
              className="shrink-0 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white text-emerald-700 hover:bg-emerald-50 text-xs font-bold shadow-sm transition"
            >
              <Download className="w-4 h-4" strokeWidth={2} />
              <span>{t('installerDownloadShort', 'Download Setup (.exe)')}</span>
            </a>
          </div>
        )}

        {/* Auth Card */}
        <section className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-xl overflow-hidden">
          {/* 2 Tabs */}
          <div className="grid grid-cols-2 p-2 gap-2 bg-slate-50/80 dark:bg-slate-950/60 border-b border-slate-200/80 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setActiveTab('login')}
              className={`flex items-center justify-center gap-2 py-2.5 px-4 rounded-2xl text-xs font-bold transition ${
                activeTab === 'login'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800'
              }`}
            >
              <LogIn className="w-4 h-4" strokeWidth={1.75} />
              <span>{t('webLoginTab', 'Login to Existing Account')}</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('register')}
              className={`flex items-center justify-center gap-2 py-2.5 px-4 rounded-2xl text-xs font-bold transition ${
                activeTab === 'register'
                  ? 'bg-gradient-to-r from-indigo-600 to-emerald-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800'
              }`}
            >
              <UserPlus className="w-4 h-4" strokeWidth={1.75} />
              <span>{t('webRegisterTab', 'Create New Standalone Account')}</span>
            </button>
          </div>

          <div className="p-5 sm:p-6">
            {activeTab === 'login' ? (
              <div className="grid grid-cols-1 md:grid-cols-[1.1fr_1fr] gap-6 items-start">
                {/* Account Selector List */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <Search
                        className="w-4 h-4 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2"
                        strokeWidth={1.5}
                      />
                      <input
                        type="text"
                        value={accountSearch}
                        onChange={(e) => setAccountSearch(e.target.value)}
                        placeholder={t('webSearchAccounts', 'Search accounts by name...')}
                        className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 ps-9 pe-3 py-2 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={loadAccounts}
                      disabled={loadingAccounts}
                      title={t('refresh')}
                      className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition disabled:opacity-50"
                    >
                      <RefreshCw
                        className={`w-4 h-4 ${loadingAccounts ? 'animate-spin' : ''}`}
                        strokeWidth={1.5}
                      />
                    </button>
                  </div>

                  <div className="max-h-80 overflow-y-auto space-y-2 pe-1">
                    {loadingAccounts && accounts.length === 0 ? (
                      <div className="py-10 text-center text-xs text-slate-400">
                        {t('loading')}
                      </div>
                    ) : filteredAccounts.length === 0 ? (
                      <div className="py-10 text-center text-xs text-slate-400">
                        {t('webNoAccounts', 'No accounts registered on the LAN yet')}
                      </div>
                    ) : (
                      filteredAccounts.map((acc) => {
                        const name = acc.display_name || acc.name || acc.uuid.slice(0, 6);
                        const isOnline = acc.status === 'online';
                        const isSelected = selectedUuid === acc.uuid;
                        return (
                          <button
                            key={acc.uuid}
                            type="button"
                            onClick={() => handleSelectAccount(acc)}
                            className={`w-full p-3 rounded-2xl border flex items-center justify-between gap-3 text-start transition ${
                              isSelected
                                ? 'bg-indigo-50 dark:bg-indigo-500/15 border-indigo-500 ring-1 ring-indigo-500/30 shadow-xs'
                                : 'bg-slate-50/70 dark:bg-slate-950/60 border-slate-200/90 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                            }`}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="relative shrink-0">
                                <UserAvatar
                                  name={name}
                                  avatarData={acc.avatar_data || acc.avatar}
                                  size="md"
                                />
                                <span
                                  className={`absolute bottom-0 end-0 w-2.5 h-2.5 rounded-full ring-2 ring-white dark:ring-slate-900 ${
                                    isOnline ? 'bg-emerald-500' : 'bg-slate-400'
                                  }`}
                                />
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                                    {name}
                                  </span>
                                  <DeviceTypeBadge deviceType={acc.device_type} t={t} />
                                </div>
                                <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-2 mt-0.5">
                                  <span>
                                    {acc.device_type === 'mobile'
                                      ? t('deviceMobile', 'Mobile Device')
                                      : t('deviceDesktop', 'Desktop PC')}
                                  </span>
                                  <span>•</span>
                                  <span className={isOnline ? 'text-emerald-600 dark:text-emerald-400 font-medium' : ''}>
                                    {isOnline ? t('online') : t('offline')}
                                  </span>
                                </div>
                              </div>
                            </div>

                            <span
                              className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                acc.has_pin
                                  ? 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                                  : 'bg-amber-100 dark:bg-amber-500/15 text-amber-800 dark:text-amber-300'
                              }`}
                            >
                              {acc.has_pin ? 'PIN ✓' : t('settingsPinNotSet', 'Not Set')}
                            </span>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Right Pane: PIN Login OR Offline Forgot PIN Recovery */}
                <div className="rounded-2xl bg-slate-50/80 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800 p-5">
                  {!selectedAccount ? (
                    <div className="py-12 text-center space-y-2">
                      <Lock className="w-8 h-8 text-slate-300 dark:text-slate-700 mx-auto" strokeWidth={1.5} />
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {t('webSelectAccountHint', 'Select your account above to sign in')}
                      </p>
                    </div>
                  ) : recoveryInfo ? (
                    /* Offline PIN Recovery Form (Mobile Accounts Only) */
                    <form onSubmit={handleRecoverPinSubmit} noValidate className="space-y-4">
                      <div className="flex items-center gap-2.5">
                        <button
                          type="button"
                          onClick={() => setRecoveryInfo(null)}
                          className="p-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 transition"
                        >
                          <BackArrow className="w-4 h-4" strokeWidth={1.75} />
                        </button>
                        <div>
                          <h3 className="text-xs font-bold text-slate-900 dark:text-white">
                            {t('webRecoveryTitle', 'Offline PIN Recovery')}
                          </h3>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400">
                            {recoveryInfo.name || selectedAccount.display_name}
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        {recoveryInfo.hasSecurityQA && (
                          <button
                            type="button"
                            onClick={() => {
                              setRecoveryMethod('security_qa');
                              setRecoveryAnswerOrCode('');
                            }}
                            className={`py-2 px-3 rounded-xl text-[11px] font-bold border transition ${
                              recoveryMethod === 'security_qa'
                                ? 'bg-indigo-600 border-indigo-600 text-white'
                                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                            }`}
                          >
                            {t('webMethodQa', 'Security Question')}
                          </button>
                        )}
                        {recoveryInfo.hasRecoveryCode && (
                          <button
                            type="button"
                            onClick={() => {
                              setRecoveryMethod('recovery_code');
                              setRecoveryAnswerOrCode('');
                            }}
                            className={`py-2 px-3 rounded-xl text-[11px] font-bold border transition ${
                              recoveryMethod === 'recovery_code'
                                ? 'bg-indigo-600 border-indigo-600 text-white'
                                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                            }`}
                          >
                            {t('webMethodCode', '6-Char Recovery Code')}
                          </button>
                        )}
                      </div>

                      {recoveryMethod === 'security_qa' && recoveryInfo.securityQuestion && (
                        <div className="rounded-xl bg-indigo-50/80 dark:bg-indigo-950/35 border border-indigo-200/70 dark:border-indigo-500/25 px-3 py-2 text-xs font-medium text-indigo-900 dark:text-indigo-200">
                          {recoveryInfo.securityQuestion}
                        </div>
                      )}

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          {recoveryMethod === 'security_qa'
                            ? t('webRecoveryAnswer', 'Security Answer')
                            : t('webRecoveryCode', '6-Char Recovery Code')}
                        </label>
                        <input
                          type="text"
                          value={recoveryAnswerOrCode}
                          onChange={(e) => setRecoveryAnswerOrCode(e.target.value)}
                          maxLength={recoveryMethod === 'recovery_code' ? 6 : 128}
                          placeholder={recoveryMethod === 'recovery_code' ? 'XXXXXX' : ''}
                          dir={recoveryMethod === 'recovery_code' ? 'ltr' : 'auto'}
                          className={`w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 ${
                            recoveryMethod === 'recovery_code'
                              ? 'font-mono uppercase tracking-[0.22em] text-center'
                              : ''
                          }`}
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2.5">
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                            {t('webNewPin', 'New PIN (4–6 digits)')}
                          </label>
                          <input
                            type="password"
                            inputMode="numeric"
                            maxLength={6}
                            value={recNewPin}
                            onChange={(e) =>
                              setRecNewPin(e.target.value.replace(/\D/g, '').slice(0, 6))
                            }
                            dir="ltr"
                            className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                            {t('webConfirmPin', 'Confirm PIN')}
                          </label>
                          <input
                            type="password"
                            inputMode="numeric"
                            maxLength={6}
                            value={recConfirmPin}
                            onChange={(e) =>
                              setRecConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 6))
                            }
                            dir="ltr"
                            className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                          />
                        </div>
                      </div>

                      {recoveryError && (
                        <div className="rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">
                          {recoveryError}
                        </div>
                      )}

                      <button
                        type="submit"
                        disabled={recovering}
                        className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm transition disabled:opacity-60"
                      >
                        {recovering
                          ? t('loading')
                          : t('webRecoverAndLogin', 'Reset PIN & Login')}
                      </button>
                    </form>
                  ) : (
                    /* Selected Account PIN Login */
                    <div className="space-y-4">
                      <div className="flex items-center gap-3 pb-3 border-b border-slate-200/80 dark:border-slate-800">
                        <UserAvatar
                          name={selectedAccount.display_name || selectedAccount.name}
                          avatarData={selectedAccount.avatar_data || selectedAccount.avatar}
                          size="md"
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-bold text-slate-900 dark:text-white truncate">
                              {selectedAccount.display_name || selectedAccount.name}
                            </span>
                            <DeviceTypeBadge deviceType={selectedAccount.device_type} t={t} />
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">
                            {selectedAccount.device_type === 'mobile'
                              ? t('deviceMobile', 'Mobile Device')
                              : t('deviceDesktop', 'Desktop PC')}
                          </div>
                        </div>
                      </div>

                      {selectedAccount.device_type !== 'mobile' && !selectedAccount.has_pin ? (
                        <div className="rounded-xl bg-amber-50 dark:bg-amber-950/35 border border-amber-200 dark:border-amber-500/30 p-3.5 text-xs text-amber-900 dark:text-amber-200 leading-relaxed">
                          {t(
                            'webPcNoPinNote',
                            'No Account PIN is set for this PC account yet. Open TwinSync Pro on the PC and go to Settings > Account PIN to set a 4–6 digit PIN.'
                          )}
                        </div>
                      ) : (
                        <form onSubmit={handleLoginSubmit} noValidate className="space-y-4">
                          <div>
                            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                              {t('webEnterPin', 'Enter 4–6 Digit PIN')}
                            </label>
                            <div className="relative">
                              <input
                                type={showLoginPin ? 'text' : 'password'}
                                inputMode="numeric"
                                maxLength={6}
                                value={loginPin}
                                onChange={(e) =>
                                  setLoginPin(e.target.value.replace(/\D/g, '').slice(0, 6))
                                }
                                placeholder="••••"
                                autoFocus
                                dir="ltr"
                                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 pe-11 py-2.5 text-base font-mono tracking-[0.28em] text-center focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                              />
                              <button
                                type="button"
                                onClick={() => setShowLoginPin((p) => !p)}
                                className="absolute inset-y-0 end-2 my-auto h-7 w-7 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                              >
                                {showLoginPin ? (
                                  <EyeOff className="w-4 h-4" strokeWidth={1.5} />
                                ) : (
                                  <Eye className="w-4 h-4" strokeWidth={1.5} />
                                )}
                              </button>
                            </div>
                          </div>

                          {loginError && (
                            <div className="rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">
                              {loginError}
                            </div>
                          )}

                          <button
                            type="submit"
                            disabled={loggingIn}
                            className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-sm transition disabled:opacity-60"
                          >
                            {loggingIn ? t('loading') : t('webLoginBtn', 'Login')}
                          </button>

                          {selectedAccount.device_type === 'mobile' && (
                            <button
                              type="button"
                              onClick={handleOpenForgotPin}
                              className="w-full py-2 px-3 rounded-xl text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition"
                            >
                              {t('webForgotPin', 'Forgot PIN? Recover Offline')}
                            </button>
                          )}
                        </form>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* TAB 2: Create New Standalone Account */
              <form onSubmit={handleRegisterSubmit} noValidate className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-5 items-center">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      {t('onboardingDisplayName')}
                    </label>
                    <input
                      type="text"
                      value={regName}
                      onChange={(e) => setRegName(e.target.value)}
                      placeholder={t('onboardingDisplayNamePlaceholder')}
                      className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                    />
                  </div>

                  <div className="flex items-center gap-3">
                    <UserAvatar name={regName || 'TS'} avatarData={regAvatar} size="lg" />
                    <div className="space-y-2">
                      <div className="flex items-center gap-1.5 flex-wrap max-w-[180px]">
                        {AVATAR_COLORS.map((hex) => {
                          const active = !regHasPhoto && regAvatar === `color:${hex}`;
                          return (
                            <button
                              key={hex}
                              type="button"
                              onClick={() => {
                                setRegHasPhoto(false);
                                setRegAvatar(`color:${hex}`);
                              }}
                              style={{ backgroundColor: hex }}
                              aria-label={hex}
                              className={`w-5 h-5 rounded-full transition ${
                                active ? 'ring-2 ring-offset-2 ring-indigo-500 scale-110' : 'opacity-85 hover:opacity-100'
                              }`}
                            />
                          );
                        })}
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          ref={regFileInputRef}
                          type="file"
                          accept="image/*"
                          onChange={handleRegPhotoChange}
                          className="hidden"
                        />
                        <button
                          type="button"
                          onClick={() => regFileInputRef.current?.click()}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition"
                        >
                          <Upload className="w-3 h-3" strokeWidth={1.5} />
                          <span>{t('onboardingUploadAvatar')}</span>
                        </button>
                        {regHasPhoto && (
                          <button
                            type="button"
                            onClick={() => {
                              setRegHasPhoto(false);
                              setRegAvatar('color:#4F46E5');
                            }}
                            className="inline-flex items-center gap-0.5 text-[11px] text-rose-600 dark:text-rose-400 hover:underline"
                          >
                            <X className="w-3 h-3" />
                            <span>{t('onboardingRemoveAvatar')}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      {t('settingsPinNew', 'New PIN (4–6 digits)')}
                    </label>
                    <div className="relative">
                      <input
                        type={showRegPin ? 'text' : 'password'}
                        inputMode="numeric"
                        maxLength={6}
                        value={regPin}
                        onChange={(e) =>
                          setRegPin(e.target.value.replace(/\D/g, '').slice(0, 6))
                        }
                        placeholder={t('settingsPinPlaceholder', 'Enter 4–6 digits')}
                        dir="ltr"
                        className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 pe-11 py-2.5 text-sm font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                      />
                      <button
                        type="button"
                        onClick={() => setShowRegPin((p) => !p)}
                        className="absolute inset-y-0 end-2 my-auto h-7 w-7 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        {showRegPin ? (
                          <EyeOff className="w-4 h-4" strokeWidth={1.5} />
                        ) : (
                          <Eye className="w-4 h-4" strokeWidth={1.5} />
                        )}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      {t('settingsPinConfirm', 'Confirm PIN')}
                    </label>
                    <input
                      type={showRegPin ? 'text' : 'password'}
                      inputMode="numeric"
                      maxLength={6}
                      value={regConfirmPin}
                      onChange={(e) =>
                        setRegConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 6))
                      }
                      placeholder={t('settingsPinPlaceholder', 'Enter 4–6 digits')}
                      dir="ltr"
                      className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2.5 text-sm font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                    />
                  </div>
                </div>

                {/* Security Question & Answer */}
                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 p-4 space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
                      <HelpCircle className="w-3.5 h-3.5 text-indigo-500" strokeWidth={1.5} />
                      <span>{t('onboardingSecurityQuestion')}</span>
                    </label>
                    <select
                      value={regPresetQ}
                      onChange={(e) => setRegPresetQ(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2.5 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                    >
                      {SECURITY_QUESTION_KEYS.map((qKey) => (
                        <option key={qKey} value={qKey}>
                          {t(qKey)}
                        </option>
                      ))}
                      <option value="custom">{t('securityQCustom')}</option>
                    </select>
                  </div>

                  {regPresetQ === 'custom' && (
                    <input
                      type="text"
                      value={regCustomQ}
                      onChange={(e) => setRegCustomQ(e.target.value)}
                      placeholder={t('onboardingCustomQuestionPlaceholder')}
                      className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                    />
                  )}

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      {t('onboardingSecurityAnswer')}
                    </label>
                    <input
                      type="text"
                      value={regAnswer}
                      onChange={(e) => setRegAnswer(e.target.value)}
                      placeholder={t('onboardingSecurityAnswerPlaceholder')}
                      className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                    />
                  </div>
                </div>

                {regError && (
                  <div className="rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 px-3.5 py-2.5 text-xs text-rose-700 dark:text-rose-300">
                    {regError}
                  </div>
                )}

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={registering}
                    className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-emerald-600 hover:from-indigo-700 hover:to-emerald-700 text-white text-xs font-bold shadow-md transition disabled:opacity-60"
                  >
                    <UserPlus className="w-4 h-4" strokeWidth={1.75} />
                    <span>
                      {registering
                        ? t('loading')
                        : t('webCreateAccountBtn', 'Create Account & Join')}
                    </span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </section>

        {/* Collapsible Quick Link Token Fallback */}
        <details
          open={Boolean(sessionExpired)}
          className="rounded-2xl bg-white/80 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 px-4 py-3 text-xs"
        >
          <summary className="cursor-pointer font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-2 select-none">
            <Link2 className="w-3.5 h-3.5 text-indigo-500" strokeWidth={1.75} />
            <span>{t('webQuickLinkSummary', 'Have a PC Quick Link token?')}</span>
          </summary>
          <form onSubmit={handleQuickTokenConnect} className="mt-3 flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={quickToken}
              onChange={(e) => setQuickToken(e.target.value)}
              placeholder="token=... / http://..."
              dir="ltr"
              className="flex-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
            />
            <button
              type="submit"
              disabled={connectingToken}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition disabled:opacity-60 shrink-0"
            >
              {connectingToken
                ? t('loading')
                : t('webQuickLinkConnect', 'Connect')}
            </button>
          </form>
          {tokenError && (
            <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">{tokenError}</p>
          )}
        </details>
      </main>

      {/* MODAL: One-Time 6-Char Recovery Code Confirmation */}
      {recoveryModalData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 wm-glass p-4">
          <div className="wm-animate-in w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                <KeyRound className="w-5 h-5" strokeWidth={1.75} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  {t('webRecoveryModalTitle', 'Save Your One-Time Recovery Code')}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {t(
                    'webRecoveryModalDesc',
                    'This 6-character code is shown only once. Save it securely to recover your PIN offline if forgotten.'
                  )}
                </p>
              </div>
            </div>

            <div
              dir="ltr"
              className="rounded-xl bg-amber-50 dark:bg-slate-950 border-2 border-dashed border-amber-300 dark:border-amber-600/60 px-4 py-3.5 text-center font-mono text-2xl font-extrabold tracking-[0.35em] text-amber-900 dark:text-amber-300 select-all"
            >
              {recoveryModalData.recoveryCode}
            </div>

            <button
              type="button"
              onClick={handleCopyRecoveryCode}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 text-xs font-bold transition"
            >
              {copiedCode ? (
                <Check className="w-4 h-4 text-emerald-500" strokeWidth={2} />
              ) : (
                <Copy className="w-4 h-4" strokeWidth={1.75} />
              )}
              <span>
                {copiedCode
                  ? t('copied')
                  : t('webCopyRecoveryCode', 'Copy Recovery Code')}
              </span>
            </button>

            <button
              type="button"
              onClick={handleEnterAfterRegister}
              className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-indigo-600 to-emerald-600 hover:from-indigo-700 hover:to-emerald-700 text-white text-xs font-bold shadow-md transition"
            >
              {t('webSavedEnterApp', 'Saved — Enter TwinSync Pro')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
