import React, { useState, useRef } from 'react';
import {
  Shield,
  KeyRound,
  Copy,
  Check,
  Upload,
  X,
  User,
  HelpCircle,
  Lock,
  Sparkles,
  Sun,
  Moon,
  Languages,
  AlertTriangle
} from 'lucide-react';

export const SECURITY_QUESTION_KEYS = [
  'securityQ1',
  'securityQ2',
  'securityQ3',
  'securityQ4'
];

/**
 * Resize an image File to a lightweight square-capped Data URL using an offscreen Canvas.
 * Runs 100% locally with zero network dependencies.
 */
export function resizeImageToDataUrl(file, maxDim = 160, quality = 0.82) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type?.startsWith('image/')) {
      reject(new Error('Invalid image file'));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Failed to decode image'));
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width || 1, img.height || 1));
        const targetW = Math.max(1, Math.round(img.width * scale));
        const targetH = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(String(reader.result));
          return;
        }
        ctx.drawImage(img, 0, 0, targetW, targetH);
        const outType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
        resolve(canvas.toDataURL(outType, quality));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Reusable crisp avatar circle with initials fallback.
 */
export function UserAvatar({ name, avatarData, size = 'md', className = '' }) {
  const sizeClasses = {
    sm: 'w-8 h-8 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-14 h-14 text-lg',
    xl: 'w-20 h-20 text-2xl'
  };
  const initials = (name || 'WM')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || 'WM';

  if (avatarData) {
    return (
      <img
        src={avatarData}
        alt={name || 'Avatar'}
        className={`${sizeClasses[size] || sizeClasses.md} rounded-full object-cover border border-slate-200/80 dark:border-slate-700/80 shadow-sm shrink-0 ${className}`}
      />
    );
  }

  return (
    <div
      className={`${sizeClasses[size] || sizeClasses.md} rounded-full bg-gradient-to-br from-indigo-500 to-emerald-500 text-white font-semibold flex items-center justify-center shadow-sm shrink-0 select-none ${className}`}
    >
      {initials}
    </div>
  );
}

/**
 * Shared Security Question + Answer selector used by both OnboardingModal and SettingsView.
 */
export function SecurityQaFields({
  t,
  selectedPreset,
  onSelectPreset,
  customQuestion,
  onChangeCustomQuestion,
  securityAnswer,
  onChangeSecurityAnswer,
  requireAnswer = true
}) {
  const [showAnswer, setShowAnswer] = useState(false);

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
          <HelpCircle className="w-3.5 h-3.5 text-indigo-500" strokeWidth={1.5} />
          <span>{t('onboardingSecurityQuestion')}</span>
        </label>
        <select
          value={selectedPreset}
          onChange={(e) => onSelectPreset(e.target.value)}
          className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 transition"
        >
          {SECURITY_QUESTION_KEYS.map((qKey) => (
            <option key={qKey} value={qKey}>
              {t(qKey)}
            </option>
          ))}
          <option value="custom">{t('securityQCustom')}</option>
        </select>
      </div>

      {selectedPreset === 'custom' && (
        <div>
          <input
            type="text"
            value={customQuestion}
            onChange={(e) => onChangeCustomQuestion(e.target.value)}
            placeholder={t('onboardingCustomQuestionPlaceholder')}
            className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 transition"
          />
        </div>
      )}

      <div>
        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
          <Lock className="w-3.5 h-3.5 text-indigo-500" strokeWidth={1.5} />
          <span>{t('onboardingSecurityAnswer')}</span>
        </label>
        <div className="relative">
          <input
            type={showAnswer ? 'text' : 'password'}
            value={securityAnswer}
            onChange={(e) => onChangeSecurityAnswer(e.target.value)}
            placeholder={t('onboardingSecurityAnswerPlaceholder')}
            required={requireAnswer}
            className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 pe-20 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 transition"
          />
          <button
            type="button"
            onClick={() => setShowAnswer((prev) => !prev)}
            className="absolute inset-y-0 end-2 my-auto h-7 px-2 rounded-lg text-xs font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            {showAnswer ? t('settingsHideKey') : t('settingsRevealKey')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function OnboardingModal({
  t,
  lang,
  theme,
  masterRecoveryKey,
  initialName = '',
  initialAvatar = '',
  onToggleTheme,
  onToggleLang,
  onComplete
}) {
  const [displayName, setDisplayName] = useState(initialName);
  const [avatarData, setAvatarData] = useState(initialAvatar);
  const [selectedPreset, setSelectedPreset] = useState(SECURITY_QUESTION_KEYS[0]);
  const [customQuestion, setCustomQuestion] = useState('');
  const [securityAnswer, setSecurityAnswer] = useState('');
  const [copiedKey, setCopiedKey] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const fileInputRef = useRef(null);

  const formattedKey = masterRecoveryKey || 'XXXX-XXXX-XXXX';

  const handleCopyKey = async () => {
    if (!masterRecoveryKey) return;
    try {
      await navigator.clipboard.writeText(masterRecoveryKey);
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2000);
    } catch {
      // Fallback ignored if clipboard unavailable
    }
  };

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const resized = await resizeImageToDataUrl(file, 160, 0.82);
      setAvatarData(resized);
      setErrorMsg('');
    } catch (err) {
      setErrorMsg(err.message || t('error'));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmedName = displayName.trim();
    const resolvedQuestion =
      selectedPreset === 'custom' ? customQuestion.trim() : t(selectedPreset);
    const trimmedAnswer = securityAnswer.trim();

    if (!trimmedName) {
      setErrorMsg(t('onboardingErrorNameRequired'));
      return;
    }
    if (!resolvedQuestion) {
      setErrorMsg(t('onboardingErrorQuestionRequired'));
      return;
    }
    if (!trimmedAnswer) {
      setErrorMsg(t('onboardingErrorAnswerRequired'));
      return;
    }

    setErrorMsg('');
    setSubmitting(true);
    try {
      await onComplete({
        displayName: trimmedName,
        avatarData: avatarData || null,
        securityQuestion: resolvedQuestion,
        securityAnswer: trimmedAnswer
      });
    } catch (err) {
      setErrorMsg(err?.message || t('error'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 wm-glass p-4 overflow-y-auto">
      <div className="wm-animate-in w-full max-w-2xl rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden my-auto">
        {/* Header */}
        <div className="px-6 py-5 bg-gradient-to-r from-indigo-600/10 via-sky-500/5 to-emerald-500/10 border-b border-slate-200/80 dark:border-slate-800 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-600 to-emerald-500 text-white flex items-center justify-center shadow-md shadow-indigo-500/20">
              <Sparkles className="w-5 h-5" strokeWidth={1.5} />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900 dark:text-white">
                {t('onboardingTitle')}
              </h1>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                {t('onboardingSubtitle')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={onToggleLang}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-white/80 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
              title={t('settingsLanguage')}
            >
              <Languages className="w-3.5 h-3.5" strokeWidth={1.5} />
              <span>{lang === 'ar' ? 'EN' : 'عربي'}</span>
            </button>
            <button
              type="button"
              onClick={onToggleTheme}
              className="p-2 rounded-lg bg-white/80 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
              title={t('settingsTheme')}
            >
              {theme === 'dark' ? (
                <Sun className="w-4 h-4 text-amber-400" strokeWidth={1.5} />
              ) : (
                <Moon className="w-4 h-4 text-indigo-600" strokeWidth={1.5} />
              )}
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[82vh] overflow-y-auto">
          {/* Master Recovery Key Card */}
          <div className="rounded-xl border border-amber-300/80 dark:border-amber-500/30 bg-amber-50/80 dark:bg-amber-950/30 p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2 text-amber-900 dark:text-amber-200">
                <KeyRound className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" strokeWidth={1.5} />
                <span className="text-xs font-bold uppercase tracking-wide">
                  {t('onboardingMasterKeyTitle')}
                </span>
              </div>
              <button
                type="button"
                onClick={handleCopyKey}
                disabled={!masterRecoveryKey}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white shadow-sm transition disabled:opacity-50"
              >
                {copiedKey ? (
                  <Check className="w-3.5 h-3.5" strokeWidth={1.5} />
                ) : (
                  <Copy className="w-3.5 h-3.5" strokeWidth={1.5} />
                )}
                <span>{copiedKey ? t('copied') : t('onboardingMasterKeyCopy')}</span>
              </button>
            </div>

            <div
              dir="ltr"
              className="rounded-lg bg-white dark:bg-slate-950 border border-amber-200 dark:border-amber-800/60 px-4 py-2.5 text-center font-mono text-lg font-bold tracking-[0.22em] text-slate-900 dark:text-amber-300 select-all"
            >
              {formattedKey}
            </div>

            <div className="flex items-start gap-2 text-xs text-amber-800 dark:text-amber-300/90 leading-relaxed">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" strokeWidth={1.5} />
              <span>{t('onboardingMasterKeyWarning')}</span>
            </div>
          </div>

          {/* Display Name + Avatar */}
          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4 items-center">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-indigo-500" strokeWidth={1.5} />
                <span>{t('onboardingDisplayName')}</span>
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder={t('onboardingDisplayNamePlaceholder')}
                required
                autoFocus
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 transition"
              />
            </div>

            <div className="flex items-center gap-3 md:pt-5">
              <UserAvatar name={displayName} avatarData={avatarData} size="lg" />
              <div className="flex flex-col gap-1.5">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarChange}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition"
                >
                  <Upload className="w-3.5 h-3.5" strokeWidth={1.5} />
                  <span>{t('onboardingUploadAvatar')}</span>
                </button>
                {avatarData && (
                  <button
                    type="button"
                    onClick={() => setAvatarData('')}
                    className="inline-flex items-center gap-1 text-[11px] text-rose-600 dark:text-rose-400 hover:underline"
                  >
                    <X className="w-3 h-3" strokeWidth={1.5} />
                    <span>{t('onboardingRemoveAvatar')}</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Security Question & Answer */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 p-4">
            <SecurityQaFields
              t={t}
              selectedPreset={selectedPreset}
              onSelectPreset={setSelectedPreset}
              customQuestion={customQuestion}
              onChangeCustomQuestion={setCustomQuestion}
              securityAnswer={securityAnswer}
              onChangeSecurityAnswer={setSecurityAnswer}
            />
          </div>

          {errorMsg && (
            <div className="rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 px-3.5 py-2.5 text-xs font-medium text-rose-700 dark:text-rose-300">
              {errorMsg}
            </div>
          )}

          <div className="flex items-center justify-end pt-1">
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-700 hover:to-indigo-600 text-white text-sm font-semibold shadow-md shadow-indigo-500/20 transition disabled:opacity-60"
            >
              <Shield className="w-4 h-4" strokeWidth={1.5} />
              <span>{submitting ? t('loading') : t('onboardingSubmit')}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
