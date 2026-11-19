import React, { useEffect, useState, useCallback } from 'react';
import {
  QrCode,
  Smartphone,
  Copy,
  Check,
  RefreshCw,
  Wifi,
  Shield,
  RotateCcw,
  AlertTriangle
} from 'lucide-react';

export default function MobileLinkView({ t, onToast }) {
  const [pairing, setPairing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [rotating, setRotating] = useState(false);
  const [confirmRotate, setConfirmRotate] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState(null);

  const loadPairing = useCallback(async () => {
    if (!window.workmesh?.mobileGetPairing) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await window.workmesh.mobileGetPairing();
      setPairing(res);
    } catch (err) {
      onToast?.(err?.message || t('error'), 'error');
    } finally {
      setLoading(false);
    }
  }, [onToast, t]);

  useEffect(() => {
    loadPairing();
  }, [loadPairing]);

  const handleCopyUrl = async (url, idx) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 1800);
    } catch {
      onToast?.(t('error'), 'error');
    }
  };

  const handleRotateToken = async () => {
    setRotating(true);
    try {
      const res = await window.workmesh.mobileRotateToken();
      if (res && res.ok === false) {
        throw new Error(res.error || t('error'));
      }
      if (res && (res.qrDataUrl || res.qr_data_url || res.urls)) {
        setPairing(res);
      } else {
        await loadPairing();
      }
      setConfirmRotate(false);
      onToast?.(t('mobileTokenRotated'), 'success');
    } catch (err) {
      onToast?.(err?.message || t('error'), 'error');
    } finally {
      setRotating(false);
    }
  };

  const qrImage = pairing?.qrDataUrl || pairing?.qr_data_url || pairing?.qrCode || '';
  const rawUrls = Array.isArray(pairing?.adapters)
    ? pairing.adapters
    : Array.isArray(pairing?.urls)
      ? pairing.urls
      : pairing?.primaryUrl
        ? [{ name: 'LAN', url: pairing.primaryUrl }]
        : [];
  const normalizedUrls = rawUrls.map((entry, idx) => {
    if (typeof entry === 'string') {
      return { label: `LAN ${idx + 1}`, url: entry };
    }
    return {
      label: entry.name || entry.interface || entry.adapter || entry.address || entry.ip || `LAN ${idx + 1}`,
      url: entry.url || ''
    };
  }).filter((item) => Boolean(item.url));

  return (
    <div className="flex-1 h-full flex flex-col bg-slate-50 dark:bg-slate-950 overflow-hidden">
      {/* Header */}
      <header className="px-6 py-4 bg-white dark:bg-slate-900 border-b border-slate-200/80 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 flex items-center justify-center border border-indigo-200/70 dark:border-indigo-500/20">
            <QrCode className="w-5 h-5" strokeWidth={1.5} />
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-900 dark:text-white">
              {t('mobileTitle')}
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t('mobileSubtitle')}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadPairing}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition disabled:opacity-60"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} strokeWidth={1.5} />
            <span>{t('refresh')}</span>
          </button>
          <button
            type="button"
            onClick={() => setConfirmRotate(true)}
            disabled={rotating}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-amber-50 hover:bg-amber-100 dark:bg-amber-500/15 dark:hover:bg-amber-500/25 text-amber-800 dark:text-amber-300 border border-amber-200/80 dark:border-amber-500/30 transition disabled:opacity-60"
          >
            <RotateCcw className="w-3.5 h-3.5" strokeWidth={1.5} />
            <span>{t('mobileRotateToken')}</span>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6 items-start">
          {/* QR Card */}
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-6 shadow-sm flex flex-col items-center text-center">
            <div className="w-60 h-60 rounded-2xl bg-white p-3 border border-slate-200 shadow-inner flex items-center justify-center">
              {loading ? (
                <RefreshCw className="w-7 h-7 animate-spin text-indigo-500" strokeWidth={1.5} />
              ) : qrImage ? (
                <img
                  src={qrImage}
                  alt="Mobile Pairing QR Code"
                  className="w-full h-full object-contain rounded-lg"
                />
              ) : (
                <div className="text-xs text-slate-400 px-4">{t('mobileNoAdapters')}</div>
              )}
            </div>
            <div className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
              <Smartphone className="w-4 h-4 text-indigo-500" strokeWidth={1.5} />
              <span>{t('mobileScanQr')}</span>
            </div>
          </div>

          {/* URLs & Instructions */}
          <div className="space-y-5">
            <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 shadow-sm space-y-3">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                <Wifi className="w-4 h-4 text-emerald-500" strokeWidth={1.5} />
                <span>{t('mobileUrlsTitle')}</span>
              </div>

              {normalizedUrls.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400 py-2">
                  {t('mobileNoAdapters')}
                </p>
              ) : (
                <div className="space-y-2.5">
                  {normalizedUrls.map((item, idx) => (
                    <div
                      key={`${item.label}-${idx}`}
                      className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/70 p-3 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400">
                          {item.label}
                        </div>
                        <div
                          dir="ltr"
                          className="text-xs font-mono text-slate-700 dark:text-slate-300 truncate select-all"
                        >
                          {item.url}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCopyUrl(item.url, idx)}
                        className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
                      >
                        {copiedIdx === idx ? (
                          <Check className="w-3.5 h-3.5 text-emerald-500" strokeWidth={1.5} />
                        ) : (
                          <Copy className="w-3.5 h-3.5" strokeWidth={1.5} />
                        )}
                        <span>{copiedIdx === idx ? t('copied') : t('mobileCopyUrl')}</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Instructions */}
            <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 shadow-sm space-y-3">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                <Smartphone className="w-4 h-4 text-indigo-500" strokeWidth={1.5} />
                <span>{t('mobileInstructionsTitle')}</span>
              </div>
              <ol className="space-y-2 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                <li>{t('mobileStep1')}</li>
                <li>{t('mobileStep2')}</li>
                <li>{t('mobileStep3')}</li>
              </ol>
              <div className="rounded-xl bg-emerald-50/80 dark:bg-emerald-500/10 border border-emerald-200/70 dark:border-emerald-500/20 p-3 flex items-start gap-2 text-xs text-emerald-800 dark:text-emerald-300">
                <Shield className="w-4 h-4 shrink-0 mt-0.5" strokeWidth={1.5} />
                <span>{t('mobileSecurityNote')}</span>
              </div>
            </section>
          </div>
        </div>
      </div>

      {/* Rotate Token Confirm Modal */}
      {confirmRotate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 wm-glass p-4">
          <div className="wm-animate-in w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" strokeWidth={1.5} />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  {t('mobileRotateToken')}
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  {t('mobileRotateTokenConfirm')}
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmRotate(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition"
              >
                {t('cancel')}
              </button>
              <button
                type="button"
                onClick={handleRotateToken}
                disabled={rotating}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white shadow-sm transition disabled:opacity-60"
              >
                {t('confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
