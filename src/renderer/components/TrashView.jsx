import React, { useEffect, useState, useCallback } from 'react';
import {
  Trash2,
  RotateCcw,
  Folder,
  FileText,
  Shield,
  Clock,
  RefreshCw,
  Lock,
  AlertTriangle,
  User
} from 'lucide-react';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function formatBytes(bytes) {
  if (bytes === null || bytes === undefined || Number.isNaN(Number(bytes))) return '—';
  const n = Number(bytes);
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDate(ts, lang) {
  if (!ts) return '—';
  const d = new Date(typeof ts === 'number' ? ts : Date.parse(ts));
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short'
  });
}

function getDaysRemaining(item) {
  const deletedMs =
    typeof item.deleted_at === 'number'
      ? item.deleted_at
      : Date.parse(item.deleted_at || '') || Date.now();
  const expiresMs =
    typeof item.expires_at === 'number'
      ? item.expires_at
      : Date.parse(item.expires_at || '') || deletedMs + THIRTY_DAYS_MS;
  const diff = expiresMs - Date.now();
  if (diff <= 0) return 0;
  return Math.ceil(diff / (24 * 60 * 60 * 1000));
}

function isProtectedTrashItem(item) {
  if (item.is_protected) return true;
  const rawAcl = item.effective_acl ?? item.effective_acl_json;
  if (!rawAcl) return false;
  try {
    const parsed = typeof rawAcl === 'string' ? JSON.parse(rawAcl) : rawAcl;
    if (parsed?.isProtected) return true;
    const chain = Array.isArray(parsed) ? parsed : parsed?.chain;
    if (Array.isArray(chain)) {
      return chain.some(
        (n) => n?.perm_mode === 'private' || n?.perm_mode === 'custom' || Boolean(n?.password_hash)
      );
    }
  } catch {
    return false;
  }
  return false;
}

export default function TrashView({
  t,
  lang,
  identity,
  peers = [],
  refreshTrigger = 0,
  onToast
}) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [confirmDeleteItem, setConfirmDeleteItem] = useState(null);

  const resolvePeerName = useCallback(
    (uuid, fallbackName) => {
      if (fallbackName) return fallbackName;
      if (uuid && uuid === identity?.uuid) return identity.display_name || t('me');
      const peer = peers.find((p) => p.uuid === uuid);
      return peer?.display_name || t('unknown');
    },
    [identity, peers, t]
  );

  const loadTrash = useCallback(async () => {
    const api = window.twinsync || window.workmesh;
    if (!api?.trashList) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await api.trashList();
      const list = Array.isArray(res) ? res : res?.items || [];
      setItems(list);
    } catch (err) {
      onToast?.(err?.message || t('error'), 'error');
    } finally {
      setLoading(false);
    }
  }, [onToast, t]);

  useEffect(() => {
    loadTrash();
  }, [loadTrash, refreshTrigger]);

  const handleRestore = async (item) => {
    const api = window.twinsync || window.workmesh;
    const trashId = item.id || item.trash_id;
    const itemName =
      item.name || (item.original_rel_path || item.rel_path || '').split('/').pop() || '';
    setBusyId(trashId);
    try {
      const res = await api.trashRestore(trashId);
      if (res && res.ok === false) {
        throw new Error(res.error || res.message || t('actionForbidden'));
      }
      onToast?.(t('trashRestoredSuccess', { name: itemName }), 'success');
      await loadTrash();
    } catch (err) {
      onToast?.(err?.message || t('actionForbidden'), 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleDeleteForever = async () => {
    if (!confirmDeleteItem) return;
    const api = window.twinsync || window.workmesh;
    const item = confirmDeleteItem;
    const trashId = item.id || item.trash_id;
    const itemName =
      item.name || (item.original_rel_path || item.rel_path || '').split('/').pop() || '';
    setBusyId(trashId);
    try {
      const res = await api.trashDeleteForever(trashId);
      if (res && res.ok === false) {
        throw new Error(res.error || res.message || t('actionForbidden'));
      }
      setConfirmDeleteItem(null);
      onToast?.(t('trashDeletedForeverSuccess', { name: itemName }), 'success');
      await loadTrash();
    } catch (err) {
      onToast?.(err?.message || t('actionForbidden'), 'error');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex-1 h-full flex flex-col bg-slate-50 dark:bg-slate-950 overflow-hidden">
      {/* Header */}
      <header className="px-6 py-4 bg-white dark:bg-slate-900 border-b border-slate-200/80 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-500/15 text-rose-600 dark:text-rose-400 flex items-center justify-center border border-rose-200/70 dark:border-rose-500/20">
            <Trash2 className="w-5 h-5" strokeWidth={1.5} />
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-900 dark:text-white">
              {t('trashTitle')}
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t('trashSubtitle')}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={loadTrash}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition disabled:opacity-60"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} strokeWidth={1.5} />
          <span>{t('refresh')}</span>
        </button>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading && items.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-3">
            <RefreshCw className="w-6 h-6 animate-spin text-indigo-500" strokeWidth={1.5} />
            <span className="text-sm">{t('loading')}</span>
          </div>
        ) : items.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto">
            <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-center text-slate-400 mb-4">
              <Trash2 className="w-8 h-8" strokeWidth={1.5} />
            </div>
            <h2 className="text-base font-semibold text-slate-800 dark:text-slate-200 mb-1">
              {t('trashEmpty')}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t('trashEmptyDesc')}
            </p>
          </div>
        ) : (
          <div className="max-w-5xl mx-auto space-y-3">
            {items.map((item) => {
              const trashId = item.id || item.trash_id;
              const relPath = item.original_rel_path || item.rel_path || item.name || '';
              const itemName = item.name || relPath.split('/').pop() || t('unknown');
              const isDir = Boolean(item.is_dir);
              const isOwner = Boolean(identity?.uuid && item.owner_uuid === identity.uuid);
              const ownerName = resolvePeerName(item.owner_uuid, item.owner_name);
              const deletedByName = resolvePeerName(item.deleted_by_uuid, item.deleted_by_name);
              const daysLeft = getDaysRemaining(item);
              const isProtected = isProtectedTrashItem(item);
              const isBusy = busyId === trashId;

              return (
                <div
                  key={trashId}
                  className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-4 shadow-sm hover:border-slate-300 dark:hover:border-slate-700 transition flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="flex items-start gap-3.5 min-w-0">
                    <div
                      className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
                        isDir
                          ? 'bg-amber-50 dark:bg-amber-500/15 text-amber-600 dark:text-amber-400'
                          : 'bg-indigo-50 dark:bg-indigo-500/15 text-indigo-600 dark:text-indigo-400'
                      }`}
                    >
                      {isDir ? (
                        <Folder className="w-5 h-5" strokeWidth={1.5} />
                      ) : (
                        <FileText className="w-5 h-5" strokeWidth={1.5} />
                      )}
                    </div>

                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                          {itemName}
                        </h3>
                        {isProtected && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-100/80 dark:bg-amber-500/15 text-amber-800 dark:text-amber-300">
                            <Lock className="w-3 h-3" strokeWidth={1.5} />
                            <span>{t('trashProtectedHint')}</span>
                          </span>
                        )}
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${
                            daysLeft <= 3
                              ? 'bg-rose-100 dark:bg-rose-500/15 text-rose-700 dark:text-rose-300'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          <Clock className="w-3 h-3" strokeWidth={1.5} />
                          <span>
                            {daysLeft === 0
                              ? t('trashExpiringToday')
                              : t('trashDaysRemaining', { days: daysLeft })}
                          </span>
                        </span>
                      </div>

                      <div className="text-xs text-slate-500 dark:text-slate-400 truncate" dir="ltr">
                        /{relPath}
                        {!isDir && item.size !== undefined && item.size !== null
                          ? ` • ${formatBytes(item.size)}`
                          : ''}
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400 pt-0.5">
                        <span className="inline-flex items-center gap-1">
                          <User className="w-3 h-3" strokeWidth={1.5} />
                          {t('owner')}: <strong className="font-medium text-slate-700 dark:text-slate-300">{ownerName}</strong>
                        </span>
                        <span>
                          {t('trashDeletedBy')}: {deletedByName}
                        </span>
                        <span>
                          {t('trashDeletedAt')}: {formatDate(item.deleted_at, lang)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Actions — strictly enabled ONLY when item.owner_uuid === identity.uuid */}
                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                    {isOwner ? (
                      <>
                        <button
                          type="button"
                          onClick={() => handleRestore(item)}
                          disabled={isBusy}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-500/15 dark:hover:bg-emerald-500/25 text-emerald-700 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-500/30 transition disabled:opacity-50"
                        >
                          <RotateCcw className="w-3.5 h-3.5" strokeWidth={1.5} />
                          <span>{t('trashRestore')}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteItem({ ...item, displayName: itemName })}
                          disabled={isBusy}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-rose-50 hover:bg-rose-100 dark:bg-rose-500/15 dark:hover:bg-rose-500/25 text-rose-700 dark:text-rose-300 border border-rose-200/80 dark:border-rose-500/30 transition disabled:opacity-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                          <span>{t('trashDeleteForever')}</span>
                        </button>
                      </>
                    ) : (
                      <div className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                        <Shield className="w-3.5 h-3.5 text-amber-500" strokeWidth={1.5} />
                        <span>{t('trashOwnerOnlyNote', { owner: ownerName })}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Confirm Permanent Delete Modal */}
      {confirmDeleteItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 wm-glass p-4">
          <div className="wm-animate-in w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-500/20 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" strokeWidth={1.5} />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  {t('trashDeleteForever')}
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  {t('trashConfirmDeleteForever', { name: confirmDeleteItem.displayName })}
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteItem(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition"
              >
                {t('cancel')}
              </button>
              <button
                type="button"
                onClick={handleDeleteForever}
                disabled={busyId !== null}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white shadow-sm transition disabled:opacity-60"
              >
                {t('trashDeleteForever')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
