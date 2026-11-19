import React from 'react';
import {
  MessageSquare,
  FolderOpen,
  Columns,
  QrCode,
  Trash2,
  Settings,
  Wifi,
  WifiOff
} from 'lucide-react';
import { UserAvatar } from './OnboardingModal';

export default function NavigationRail({
  t,
  viewMode,
  onChangeView,
  onToggleSplit,
  totalUnread = 0,
  identity,
  onlinePeerCount = 0
}) {
  const isOnline = onlinePeerCount > 0;

  const navItems = [
    {
      id: 'chats',
      label: t('navChats'),
      icon: MessageSquare,
      active: viewMode === 'chats',
      badge: totalUnread > 0 ? (totalUnread > 99 ? '99+' : String(totalUnread)) : null,
      onClick: () => onChangeView('chats')
    },
    {
      id: 'files',
      label: t('navFiles'),
      icon: FolderOpen,
      active: viewMode === 'files',
      onClick: () => onChangeView('files')
    },
    {
      id: 'split',
      label: viewMode === 'split' ? t('navSplitViewExit') : t('navSplitView'),
      icon: Columns,
      active: viewMode === 'split',
      onClick: onToggleSplit
    },
    {
      id: 'mobile',
      label: t('navMobileLink'),
      icon: QrCode,
      active: viewMode === 'mobile',
      onClick: () => onChangeView('mobile')
    },
    {
      id: 'trash',
      label: t('navTrash'),
      icon: Trash2,
      active: viewMode === 'trash',
      onClick: () => onChangeView('trash')
    }
  ];

  return (
    <aside
      aria-label="Primary Navigation"
      className="w-[68px] shrink-0 h-full bg-white/95 dark:bg-slate-900/95 border-e border-slate-200/80 dark:border-slate-800/90 flex flex-col items-center justify-between py-3 select-none z-20"
    >
      {/* Top brand + main nav */}
      <div className="flex flex-col items-center gap-2 w-full px-2">
        {/* WorkMesh subtle emblem */}
        <div
          title={t('appName')}
          className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-600 to-emerald-500 text-white font-bold text-sm flex items-center justify-center shadow-sm shadow-indigo-500/20 mb-2"
        >
          WM
        </div>

        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={item.onClick}
              title={item.label}
              className={`group relative w-12 h-11 rounded-xl flex items-center justify-center transition-all duration-150 ${
                item.active
                  ? 'bg-indigo-50 dark:bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 shadow-sm ring-1 ring-indigo-500/25'
                  : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/80 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              {item.active && (
                <span className="absolute start-0 top-2.5 bottom-2.5 w-[3px] rounded-full bg-indigo-600 dark:bg-indigo-400" />
              )}
              <Icon className="w-5 h-5" strokeWidth={1.5} />
              {item.badge && (
                <span className="absolute -top-1 -end-1 min-w-[18px] h-[18px] px-1 rounded-full bg-emerald-500 text-white text-[10px] font-bold flex items-center justify-center shadow ring-2 ring-white dark:ring-slate-900">
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Bottom settings + network status + avatar */}
      <div className="flex flex-col items-center gap-2.5 w-full px-2">
        {/* Network / Peer Status Indicator */}
        <div
          title={`${isOnline ? t('navNetworkOnline') : t('navNetworkOffline')} • ${t('navPeersOnline', { count: onlinePeerCount })}`}
          className={`w-10 h-8 rounded-lg flex items-center justify-center gap-1 text-[11px] font-semibold border transition ${
            isOnline
              ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200/80 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-400'
              : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400'
          }`}
        >
          {isOnline ? (
            <Wifi className="w-3.5 h-3.5" strokeWidth={1.5} />
          ) : (
            <WifiOff className="w-3.5 h-3.5" strokeWidth={1.5} />
          )}
          <span>{onlinePeerCount}</span>
        </div>

        {/* Settings Button */}
        <button
          type="button"
          onClick={() => onChangeView('settings')}
          title={t('navSettings')}
          className={`relative w-12 h-11 rounded-xl flex items-center justify-center transition-all duration-150 ${
            viewMode === 'settings'
              ? 'bg-indigo-50 dark:bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 shadow-sm ring-1 ring-indigo-500/25'
              : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/80 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          {viewMode === 'settings' && (
            <span className="absolute start-0 top-2.5 bottom-2.5 w-[3px] rounded-full bg-indigo-600 dark:bg-indigo-400" />
          )}
          <Settings className="w-5 h-5" strokeWidth={1.5} />
        </button>

        {/* User Avatar with Live Online Dot */}
        <button
          type="button"
          onClick={() => onChangeView('settings')}
          title={identity?.display_name || t('navSettings')}
          className="relative rounded-full p-0.5 hover:ring-2 hover:ring-indigo-500/40 transition"
        >
          <UserAvatar
            name={identity?.display_name}
            avatarData={identity?.avatar_data}
            size="md"
          />
          <span
            className={`absolute bottom-0 end-0 w-3 h-3 rounded-full ring-2 ring-white dark:ring-slate-900 ${
              isOnline ? 'bg-emerald-500' : 'bg-amber-400'
            }`}
          />
        </button>
      </div>
    </aside>
  );
}
