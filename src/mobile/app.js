(function () {
  'use strict';

  const STRINGS = {
    ar: {
      chats: 'المحادثات',
      files: 'الملفات',
      connected: 'متصل بالشبكة المحلية',
      disconnected: 'جاري إعادة الاتصال...',
      sessionExpired: 'انتهت الجلسة أو الرمز غير صالح',
      sessionExpiredDesc: 'امسح رمز QR جديداً من برنامج WorkMesh على الكمبيوتر أو الصق الرمز هنا.',
      connect: 'اتصال',
      searchChats: 'ابحث في المحادثات...',
      searchMsgs: 'ابحث في الرسائل...',
      searchVault: 'ابحث في الملفات...',
      messagePlaceholder: 'اكتب رسالة...',
      newGroup: 'مجموعة جديدة',
      groupName: 'اسم المجموعة',
      create: 'إنشاء',
      selectMembers: 'اختر الأعضاء',
      online: 'متصل',
      offline: 'غير متصل',
      typing: 'يكتب الآن...',
      reply: 'رد',
      react: 'تفاعل',
      deletedMsg: 'تم حذف هذه الرسالة',
      voiceNote: 'رسالة صوتية',
      openDownload: 'فتح / تحميل',
      saveToVault: 'حفظ في مدير الملفات',
      openVaultLink: 'فتح في مدير الملفات',
      vaultLinkLabel: 'رابط من مدير الملفات',
      lockedFolder: 'مجلد محمي بكلمة مرور',
      enterPassword: 'أدخل كلمة المرور',
      unlock: 'فتح القفل',
      wrongPassword: 'كلمة المرور غير صحيحة',
      rootFolder: 'الرئيسية',
      chooseDestFolder: 'اختر المجلد لحفظ الملف فيه',
      saveHere: 'حفظ هنا',
      overwrite: 'استبدال',
      keepBoth: 'الاحتفاظ بالاثنين',
      conflictTitle: 'يوجد ملف بنفس الاسم',
      savedToVault: 'تم الحفظ في مدير الملفات بنجاح',
      uploaded: 'تم الرفع بنجاح',
      uploadFailed: 'فشل الرفع',
      noWritePerm: 'ليست لديك صلاحية كتابة في هذا المجلد',
      micUnavailable: 'الميكروفون غير متاح في هذا المتصفح (يتطلب اتصالاً آمناً أو إذن الميكروفون)',
      download: 'تنزيل',
      send: 'إرسال',
      captionPrompt: 'أضف تعليقاً (اختياري)...',
      emptyChats: 'لا توجد محادثات بعد. اختر زميلاً من الأعلى لبدء محادثة.',
      emptyFiles: 'هذا المجلد فارغ',
      unsupportedPreview: 'لا تتوفر معاينة لهذا النوع. يمكنك تنزيله.',
      directMessage: 'محادثة مباشرة',
      groupChat: 'مجموعة'
    },
    en: {
      chats: 'Chats',
      files: 'Files',
      connected: 'Connected on LAN',
      disconnected: 'Reconnecting...',
      sessionExpired: 'Session Expired or Invalid Token',
      sessionExpiredDesc: 'Scan a fresh QR code from WorkMesh Desktop or paste the token below.',
      connect: 'Connect',
      searchChats: 'Search chats...',
      searchMsgs: 'Search messages...',
      searchVault: 'Search files...',
      messagePlaceholder: 'Type a message...',
      newGroup: 'New Group',
      groupName: 'Group name',
      create: 'Create',
      selectMembers: 'Select members',
      online: 'Online',
      offline: 'Offline',
      typing: 'typing...',
      reply: 'Reply',
      react: 'React',
      deletedMsg: 'This message was deleted',
      voiceNote: 'Voice Note',
      openDownload: 'Open / Download',
      saveToVault: 'Save to Vault',
      openVaultLink: 'Open in Vault',
      vaultLinkLabel: 'Vault Item Link',
      lockedFolder: 'Password Protected Folder',
      enterPassword: 'Enter password',
      unlock: 'Unlock',
      wrongPassword: 'Incorrect password',
      rootFolder: 'Root',
      chooseDestFolder: 'Choose Vault folder to save into',
      saveHere: 'Save Here',
      overwrite: 'Overwrite',
      keepBoth: 'Keep Both',
      conflictTitle: 'A file with this name already exists',
      savedToVault: 'Saved to Vault successfully',
      uploaded: 'Uploaded successfully',
      uploadFailed: 'Upload failed',
      noWritePerm: 'No write permission in this folder',
      micUnavailable: 'Microphone unavailable in this browser context',
      download: 'Download',
      send: 'Send',
      captionPrompt: 'Add a caption (optional)...',
      emptyChats: 'No chats yet. Tap an online peer above to start.',
      emptyFiles: 'This folder is empty',
      unsupportedPreview: 'Preview not available for this file type. Download to view.',
      directMessage: 'Direct Message',
      groupChat: 'Group'
    }
  };

  const state = {
    token: '',
    lang: localStorage.getItem('wm_mob_lang') || 'ar',
    theme: localStorage.getItem('wm_mob_theme') || 'light',
    tab: 'chats',
    identity: null,
    peers: [],
    conversations: [],
    presenceMap: {},
    activeConvId: null,
    messages: [],
    replyTo: null,
    typingMap: {},
    vaultPath: '',
    vaultItems: [],
    vaultSearchQuery: '',
    ws: null,
    mediaRecorder: null,
    recChunks: [],
    recStartMs: 0,
    recTimerId: null,
    activeAudio: null,
    activeAudioId: null,
    playbackRate: 1
  };

  function t(key) {
    return (STRINGS[state.lang] && STRINGS[state.lang][key]) || STRINGS.en[key] || key;
  }

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatBytes(bytes) {
    const n = Number(bytes) || 0;
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function formatTime(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function formatDuration(ms) {
    const sec = Math.max(0, Math.round((Number(ms) || 0) / 1000));
    const m = String(Math.floor(sec / 60)).padStart(2, '0');
    const s = String(sec % 60).padStart(2, '0');
    return m + ':' + s;
  }

  function showToast(msg) {
    const container = document.getElementById('toast-container');
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    container.appendChild(el);
    setTimeout(() => {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 3200);
  }

  function applyThemeAndLang() {
    document.documentElement.classList.toggle('dark', state.theme === 'dark');
    document.documentElement.lang = state.lang;
    document.documentElement.dir = state.lang === 'ar' ? 'rtl' : 'ltr';

    document.getElementById('btn-lang').textContent = state.lang === 'ar' ? 'EN' : 'AR';
    document.getElementById('btn-theme').textContent = state.theme === 'dark' ? '☀' : '🌙';
    document.getElementById('nav-chats-label').textContent = t('chats');
    document.getElementById('nav-files-label').textContent = t('files');
    document.getElementById('conv-search').placeholder = t('searchChats');
    document.getElementById('msg-search-input').placeholder = t('searchMsgs');
    document.getElementById('vault-search-input').placeholder = t('searchVault');
    document.getElementById('composer-input').placeholder = t('messagePlaceholder');
    document.getElementById('auth-err-title').textContent = t('sessionExpired');
    document.getElementById('auth-err-desc').textContent = t('sessionExpiredDesc');
    document.getElementById('btn-apply-token').textContent = t('connect');
    document.getElementById('btn-rec-send').textContent = t('send');
  }

  function readInitialToken() {
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get('token');
    if (urlToken) {
      state.token = urlToken.trim();
      sessionStorage.setItem('wm_mobile_token', state.token);
    } else {
      state.token = sessionStorage.getItem('wm_mobile_token') || '';
    }
  }

  async function apiFetch(url, options) {
    const opts = options || {};
    const headers = Object.assign({}, opts.headers || {});
    if (state.token) {
      headers['Authorization'] = 'Bearer ' + state.token;
    }
    const res = await fetch(url, Object.assign({}, opts, { headers }));
    if (res.status === 401) {
      showAuthError();
      throw new Error('Unauthorized');
    }
    const ct = res.headers.get('content-type') || '';
    let data = null;
    if (ct.includes('application/json')) {
      data = await res.json();
    }
    if (!res.ok) {
      const err = new Error((data && data.error) || ('HTTP ' + res.status));
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  function showAuthError() {
    document.getElementById('auth-error-view').classList.remove('hidden');
    document.getElementById('tab-chats').classList.add('hidden');
    document.getElementById('tab-files').classList.add('hidden');
    document.getElementById('conn-status').textContent = t('sessionExpired');
  }

  function hideAuthError() {
    document.getElementById('auth-error-view').classList.add('hidden');
    switchTab(state.tab);
  }

  function openModal(title, htmlOrEl) {
    document.getElementById('modal-title').textContent = title;
    const body = document.getElementById('modal-body');
    body.innerHTML = '';
    if (typeof htmlOrEl === 'string') {
      body.innerHTML = htmlOrEl;
    } else if (htmlOrEl) {
      body.appendChild(htmlOrEl);
    }
    document.getElementById('modal-backdrop').classList.remove('hidden');
  }

  function closeModal() {
    document.getElementById('modal-backdrop').classList.add('hidden');
    document.getElementById('modal-body').innerHTML = '';
  }

  function switchTab(tab) {
    state.tab = tab;
    document.getElementById('nav-chats').classList.toggle('active', tab === 'chats');
    document.getElementById('nav-files').classList.toggle('active', tab === 'files');
    document.getElementById('tab-chats').classList.toggle('hidden', tab !== 'chats');
    document.getElementById('tab-files').classList.toggle('hidden', tab !== 'files');
    if (tab === 'files') {
      loadVaultList(state.vaultPath);
    }
  }

  function getConvTitle(conv) {
    if (!conv) return '';
    if (conv.type === 'group') return conv.name || t('groupChat');
    if (conv.peer && conv.peer.display_name) return conv.peer.display_name;
    return conv.name || t('directMessage');
  }

  function parseJsonSafe(val, fallback) {
    if (Array.isArray(val) || (val && typeof val === 'object')) return val;
    if (!val || typeof val !== 'string') return fallback;
    try {
      return JSON.parse(val);
    } catch (_) {
      return fallback;
    }
  }

  function getMessageAttachments(msg) {
    if (!msg) return [];
    const single = msg.attachment || parseJsonSafe(msg.attachment_json, null);
    if (Array.isArray(single)) return single;
    if (single && typeof single === 'object') return [single];
    const multi = parseJsonSafe(msg.attachments_json || msg.attachments, []);
    return Array.isArray(multi) ? multi : [];
  }

  function getMessageVaultLink(msg) {
    if (!msg) return null;
    if (msg.vault_link_path) {
      const parts = String(msg.vault_link_path).split('/');
      return {
        relPath: msg.vault_link_path,
        name: parts[parts.length - 1] || msg.vault_link_path,
        isDir: Boolean(msg.vault_link_is_dir)
      };
    }
    return parseJsonSafe(msg.vault_link_json || msg.vaultLink, null);
  }

  function renderQuickPeers() {
    const strip = document.getElementById('quick-peers-strip');
    if (!state.peers || state.peers.length === 0) {
      strip.classList.add('hidden');
      return;
    }
    strip.classList.remove('hidden');
    strip.innerHTML = state.peers.map((p) => {
      const onlineClass = p.status === 'online' ? 'online' : '';
      return `<button class="peer-chip" data-peer-uuid="${escapeHtml(p.uuid)}" type="button">
        <span class="dot ${onlineClass}"></span>
        <span>${escapeHtml(p.display_name || p.uuid.slice(0, 6))}</span>
      </button>`;
    }).join('');
    strip.querySelectorAll('[data-peer-uuid]').forEach((btn) => {
      btn.addEventListener('click', () => startDmWithPeer(btn.getAttribute('data-peer-uuid')));
    });
  }

  function renderConversations() {
    const list = document.getElementById('conv-list');
    const query = (document.getElementById('conv-search').value || '').trim().toLowerCase();

    let totalUnread = 0;
    for (const c of state.conversations) {
      totalUnread += Number(c.unreadCount || 0);
    }
    const badge = document.getElementById('nav-unread-badge');
    if (totalUnread > 0) {
      badge.textContent = String(totalUnread);
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }

    const filtered = state.conversations.filter((c) => {
      if (!query) return true;
      return getConvTitle(c).toLowerCase().includes(query);
    });

    if (filtered.length === 0) {
      list.innerHTML = `<div class="center-card muted">${escapeHtml(t('emptyChats'))}</div>`;
      return;
    }

    list.innerHTML = filtered.map((conv) => {
      const title = getConvTitle(conv);
      const avatarData = conv.type === 'group' ? conv.avatar_data : (conv.peer && conv.peer.avatar_data);
      const initials = title.slice(0, 2).toUpperCase();
      const avatarHtml = avatarData
        ? `<img src="${escapeHtml(avatarData)}" alt="" />`
        : escapeHtml(initials);
      const lastMsg = conv.lastMessage;
      let snippet = conv.type === 'group' ? t('groupChat') : t('directMessage');
      if (lastMsg) {
        if (lastMsg.is_deleted || lastMsg.deleted_at) snippet = t('deletedMsg');
        else if (lastMsg.body) snippet = lastMsg.body;
        else if (lastMsg.type === 'voice') snippet = '🎤 ' + t('voiceNote');
        else if (lastMsg.type === 'vault_link') snippet = '🔗 ' + t('vaultLinkLabel');
        else snippet = '📎 File';
      }
      const unreadHtml = conv.unreadCount > 0 ? `<span class="badge">${conv.unreadCount}</span>` : '';
      const timeStr = lastMsg ? formatTime(lastMsg.created_at) : '';
      const isOnline = conv.type === 'dm' && conv.peer && conv.peer.status === 'online';

      return `<div class="list-item" data-conv-id="${escapeHtml(conv.id)}">
        <div class="avatar">${avatarHtml}</div>
        <div class="item-body">
          <div class="item-top">
            <span class="item-title">${isOnline ? '<span class="dot online"></span> ' : ''}${escapeHtml(title)}</span>
            <span class="item-time">${escapeHtml(timeStr)}</span>
          </div>
          <div class="item-top">
            <span class="item-sub">${escapeHtml(snippet)}</span>
            ${unreadHtml}
          </div>
        </div>
      </div>`;
    }).join('');

    list.querySelectorAll('[data-conv-id]').forEach((el) => {
      el.addEventListener('click', () => openConversation(el.getAttribute('data-conv-id')));
    });
  }

  async function startDmWithPeer(peerUuid) {
    try {
      const res = await apiFetch('/api/conversations/dm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ peerUuid })
      });
      await refreshBootstrap();
      if (res.conversation && res.conversation.id) {
        openConversation(res.conversation.id);
      }
    } catch (err) {
      showToast(err.message);
    }
  }

  async function openConversation(convId) {
    state.activeConvId = convId;
    document.getElementById('conv-list-pane').classList.add('hidden');
    document.getElementById('thread-pane').classList.remove('hidden');

    updateThreadHeader();
    await loadMessages();
    apiFetch('/api/conversations/' + encodeURIComponent(convId) + '/read', { method: 'POST' }).catch(() => {});
  }

  function updateThreadHeader() {
    const conv = state.conversations.find((c) => c.id === state.activeConvId);
    if (!conv) return;
    const title = getConvTitle(conv);
    document.getElementById('thread-title').textContent = title;
    const av = document.getElementById('thread-avatar');
    const avatarData = conv.type === 'group' ? conv.avatar_data : (conv.peer && conv.peer.avatar_data);
    av.innerHTML = avatarData ? `<img src="${escapeHtml(avatarData)}" alt="" />` : escapeHtml(title.slice(0, 2).toUpperCase());

    const typingUsers = state.typingMap[conv.id] || [];
    const sub = document.getElementById('thread-subtitle');
    if (typingUsers.length > 0) {
      sub.textContent = t('typing');
    } else if (conv.type === 'dm' && conv.peer) {
      sub.textContent = conv.peer.status === 'online' ? t('online') : t('offline');
    } else {
      sub.textContent = (conv.members ? conv.members.length : 0) + ' members';
    }
  }

  async function loadMessages() {
    if (!state.activeConvId) return;
    const search = (document.getElementById('msg-search-input').value || '').trim();
    const url = '/api/messages/' + encodeURIComponent(state.activeConvId) + (search ? '?search=' + encodeURIComponent(search) : '');
    const res = await apiFetch(url);
    state.messages = res.messages || [];
    renderMessages();
  }

  function renderReceipt(msg) {
    if (!state.identity || msg.sender_uuid !== state.identity.uuid) return '';
    const receipts = msg.receipts || [];
    const anyRead = receipts.some((r) => r.status === 'read');
    const anyDelivered = receipts.some((r) => r.status === 'delivered' || r.status === 'read');
    if (anyRead) return '<span class="receipt read">✓✓</span>';
    if (anyDelivered) return '<span class="receipt">✓✓</span>';
    return '<span class="receipt">✓</span>';
  }

  function describeReplySnippet(msg) {
    if (!msg) return '';
    if (msg.is_deleted || msg.deleted_at) return t('deletedMsg');
    if (msg.body) return msg.body;
    if (msg.type === 'voice') return '🎤 ' + t('voiceNote');
    if (msg.type === 'vault_link') return '🔗 ' + t('vaultLinkLabel');
    const atts = getMessageAttachments(msg);
    if (atts.length > 0) return '📎 ' + (atts[0].originalName || atts[0].fileName);
    return '...';
  }

  function setReplyTo(msg) {
    state.replyTo = msg;
    const banner = document.getElementById('reply-banner');
    if (!msg) {
      banner.classList.add('hidden');
      return;
    }
    const senderName = msg.sender_name || (state.identity && msg.sender_uuid === state.identity.uuid ? state.identity.display_name : 'Peer');
    document.getElementById('reply-banner-author').textContent = senderName;
    document.getElementById('reply-banner-snippet').textContent = describeReplySnippet(msg);
    banner.classList.remove('hidden');
    document.getElementById('composer-input').focus();
  }

  function renderMessages() {
    const container = document.getElementById('messages-list');
    const myUuid = state.identity ? state.identity.uuid : '';

    container.innerHTML = state.messages.map((msg) => {
      const isMe = msg.sender_uuid === myUuid;
      const atts = getMessageAttachments(msg);
      const vaultLink = getMessageVaultLink(msg);
      const reactions = msg.reactions || [];

      let inner = '';
      if (!isMe && msg.sender_name) {
        inner += `<div class="msg-sender">${escapeHtml(msg.sender_name)}</div>`;
      }

      if (msg.replyTo) {
        inner += `<div class="msg-reply-box">
          <div class="msg-reply-author">${escapeHtml(msg.replyTo.sender_name || '')}</div>
          <div>${escapeHtml(describeReplySnippet(msg.replyTo))}</div>
        </div>`;
      }

      if (msg.is_deleted || msg.deleted_at) {
        inner += `<div class="msg-deleted">${escapeHtml(t('deletedMsg'))}</div>`;
      } else {
        if (msg.type === 'voice' && atts[0]) {
          const att = atts[0];
          const bars = [40, 75, 55, 90, 45, 80, 60, 70, 50, 85, 45, 65]
            .map((h) => `<span class="voice-bar" style="height:${h}%"></span>`).join('');
          const isPlaying = state.activeAudioId === msg.id;
          inner += `<div class="voice-box" data-voice-id="${escapeHtml(msg.id)}" data-blob-id="${escapeHtml(att.blobId)}" data-file-name="${escapeHtml(att.fileName)}">
            <button class="icon-btn sm js-voice-play" type="button">${isPlaying ? '⏸' : '▶'}</button>
            <div class="voice-bars">${bars}</div>
            <span class="item-time">${escapeHtml(formatDuration(att.durationMs || 0))}</span>
            <button class="icon-btn sm js-voice-speed" type="button">${state.playbackRate}x</button>
          </div>`;
        } else if (atts.length > 0) {
          for (const att of atts) {
            const blobUrl = `/api/blobs/${encodeURIComponent(att.blobId)}/${encodeURIComponent(att.fileName)}?token=${encodeURIComponent(state.token)}`;
            const isImg = !att.isFolder && String(att.mime || '').startsWith('image/');
            if (isImg) {
              inner += `<img class="msg-img js-open-img" src="${blobUrl}" alt="${escapeHtml(att.originalName || att.fileName)}" data-url="${blobUrl}" />`;
            }
            const attJson = escapeHtml(JSON.stringify(att));
            inner += `<div class="att-card">
              <div class="att-name">${att.isFolder ? '📁' : '📄'} ${escapeHtml(att.originalName || att.fileName)}</div>
              <div class="att-meta">${escapeHtml(formatBytes(att.totalSize || att.size))}</div>
              <div class="att-actions">
                <a class="btn btn-ghost btn-sm" href="${blobUrl}&download=1" target="_blank" rel="noopener">${escapeHtml(t('openDownload'))}</a>
                <button class="btn btn-primary btn-sm js-save-vault" data-att="${attJson}" type="button">${escapeHtml(t('saveToVault'))}</button>
              </div>
            </div>`;
          }
        }

        if (vaultLink && vaultLink.relPath) {
          inner += `<div class="att-card">
            <div class="att-name">🔗 ${escapeHtml(vaultLink.name || vaultLink.relPath)}</div>
            <div class="att-meta">${escapeHtml(t('vaultLinkLabel'))} • ${escapeHtml(vaultLink.relPath)}</div>
            <div class="att-actions">
              <button class="btn btn-primary btn-sm js-open-deeplink" data-rel-path="${escapeHtml(vaultLink.relPath)}" data-is-dir="${vaultLink.isDir ? '1' : '0'}" type="button">${escapeHtml(t('openVaultLink'))}</button>
            </div>
          </div>`;
        }

        if (msg.body) {
          inner += `<div class="msg-text">${escapeHtml(msg.body)}</div>`;
        }
      }

      // Reaction counts grouped
      const reactionCounts = {};
      for (const r of reactions) {
        if (!reactionCounts[r.emoji]) reactionCounts[r.emoji] = { count: 0, mine: false };
        reactionCounts[r.emoji].count += 1;
        if (r.peer_uuid === myUuid) reactionCounts[r.emoji].mine = true;
      }
      const reactHtml = Object.entries(reactionCounts).map(([emoji, info]) => {
        return `<button class="react-pill ${info.mine ? 'mine' : ''} js-react-toggle" data-msg-id="${escapeHtml(msg.id)}" data-emoji="${escapeHtml(emoji)}" type="button">${emoji} ${info.count}</button>`;
      }).join('');

      inner += `<div class="msg-footer">
        <span>${escapeHtml(formatTime(msg.created_at))}</span>
        ${renderReceipt(msg)}
      </div>`;

      return `<div class="msg-row ${isMe ? 'me' : 'other'}" data-msg-id="${escapeHtml(msg.id)}">
        <div class="msg-bubble">${inner}</div>
        <div class="msg-actions-row">
          ${reactHtml}
          <button class="react-pill js-reply-btn" data-msg-id="${escapeHtml(msg.id)}" type="button">↩ ${escapeHtml(t('reply'))}</button>
          <button class="react-pill js-react-picker" data-msg-id="${escapeHtml(msg.id)}" type="button">😊</button>
        </div>
      </div>`;
    }).join('');

    // Wire events & Swipe-to-Reply
    container.querySelectorAll('.msg-row').forEach((row) => {
      const msgId = row.getAttribute('data-msg-id');
      const msgObj = state.messages.find((m) => m.id === msgId);
      if (!msgObj) return;

      let startX = 0;
      let startY = 0;
      let deltaX = 0;
      let swiping = false;

      row.addEventListener('touchstart', (e) => {
        if (e.touches.length !== 1) return;
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        deltaX = 0;
        swiping = false;
      }, { passive: true });

      row.addEventListener('touchmove', (e) => {
        if (e.touches.length !== 1) return;
        const dx = e.touches[0].clientX - startX;
        const dy = e.touches[0].clientY - startY;
        if (!swiping && Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.4) {
          swiping = true;
        }
        if (swiping) {
          deltaX = Math.max(-72, Math.min(72, dx));
          row.style.transform = `translateX(${deltaX}px)`;
        }
      }, { passive: true });

      row.addEventListener('touchend', () => {
        row.style.transform = '';
        if (swiping && Math.abs(deltaX) >= 44) {
          setReplyTo(msgObj);
        }
        swiping = false;
        deltaX = 0;
      });
    });

    container.querySelectorAll('.js-reply-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-msg-id');
        const msgObj = state.messages.find((m) => m.id === id);
        if (msgObj) setReplyTo(msgObj);
      });
    });

    container.querySelectorAll('.js-react-picker').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-msg-id');
        const wrap = document.createElement('div');
        wrap.style.display = 'flex';
        wrap.style.gap = '10px';
        wrap.style.justifyContent = 'center';
        ['👍', '❤️', '😂', '😮', '😢', '🙏'].forEach((em) => {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'btn btn-ghost';
          b.style.fontSize = '22px';
          b.textContent = em;
          b.addEventListener('click', async () => {
            closeModal();
            await toggleReaction(id, em);
          });
          wrap.appendChild(b);
        });
        openModal(t('react'), wrap);
      });
    });

    container.querySelectorAll('.js-react-toggle').forEach((btn) => {
      btn.addEventListener('click', () => {
        toggleReaction(btn.getAttribute('data-msg-id'), btn.getAttribute('data-emoji'));
      });
    });

    container.querySelectorAll('.js-voice-play').forEach((btn) => {
      btn.addEventListener('click', () => {
        const box = btn.closest('.voice-box');
        playVoiceNote(
          box.getAttribute('data-voice-id'),
          box.getAttribute('data-blob-id'),
          box.getAttribute('data-file-name'),
          box
        );
      });
    });

    container.querySelectorAll('.js-voice-speed').forEach((btn) => {
      btn.addEventListener('click', () => {
        const speeds = [1, 1.5, 2];
        const idx = speeds.indexOf(state.playbackRate);
        state.playbackRate = speeds[(idx + 1) % speeds.length];
        if (state.activeAudio) {
          state.activeAudio.playbackRate = state.playbackRate;
        }
        container.querySelectorAll('.js-voice-speed').forEach((b) => {
          b.textContent = state.playbackRate + 'x';
        });
      });
    });

    container.querySelectorAll('.js-open-img').forEach((img) => {
      img.addEventListener('click', () => {
        openModal(img.alt || 'Image', `<img class="preview-media" src="${escapeHtml(img.getAttribute('data-url'))}" />`);
      });
    });

    container.querySelectorAll('.js-save-vault').forEach((btn) => {
      btn.addEventListener('click', () => {
        const att = JSON.parse(btn.getAttribute('data-att'));
        openSaveToVaultModal(att);
      });
    });

    container.querySelectorAll('.js-open-deeplink').forEach((btn) => {
      btn.addEventListener('click', () => {
        const relPath = btn.getAttribute('data-rel-path');
        const isDir = btn.getAttribute('data-is-dir') === '1';
        openVaultDeepLink(relPath, isDir);
      });
    });

    container.scrollTop = container.scrollHeight;
  }

  function playVoiceNote(msgId, blobId, fileName, boxEl) {
    if (state.activeAudio && state.activeAudioId === msgId) {
      state.activeAudio.pause();
      state.activeAudio = null;
      state.activeAudioId = null;
      renderMessages();
      return;
    }
    if (state.activeAudio) {
      state.activeAudio.pause();
    }
    const url = `/api/blobs/${encodeURIComponent(blobId)}/${encodeURIComponent(fileName)}?token=${encodeURIComponent(state.token)}`;
    const audio = new Audio(url);
    audio.playbackRate = state.playbackRate;
    state.activeAudio = audio;
    state.activeAudioId = msgId;
    audio.onended = () => {
      state.activeAudio = null;
      state.activeAudioId = null;
      renderMessages();
    };
    audio.ontimeupdate = () => {
      if (!boxEl || !audio.duration) return;
      const bars = boxEl.querySelectorAll('.voice-bar');
      const ratio = audio.currentTime / audio.duration;
      const activeCount = Math.round(ratio * bars.length);
      bars.forEach((b, i) => b.classList.toggle('active', i < activeCount));
    };
    audio.play().catch((err) => showToast(err.message));
    renderMessages();
  }

  async function toggleReaction(msgId, emoji) {
    try {
      await apiFetch('/api/messages/' + encodeURIComponent(msgId) + '/reaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emoji })
      });
      await loadMessages();
    } catch (err) {
      showToast(err.message);
    }
  }

  async function sendTextMessage(e) {
    e.preventDefault();
    const input = document.getElementById('composer-input');
    const text = input.value.trim();
    if (!text || !state.activeConvId) return;
    input.value = '';
    const replyToId = state.replyTo ? state.replyTo.id : null;
    setReplyTo(null);

    try {
      await apiFetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: state.activeConvId,
          type: 'text',
          body: text,
          replyToId
        })
      });
      await loadMessages();
      await refreshBootstrap();
    } catch (err) {
      showToast(err.message);
    }
  }

  async function handleChatFileUpload(file) {
    if (!file || !state.activeConvId) return;
    const caption = window.prompt(t('captionPrompt'), '') || '';
    const form = new FormData();
    form.append('conversationId', state.activeConvId);
    form.append('caption', caption);
    if (state.replyTo) form.append('replyToId', state.replyTo.id);
    form.append('file', file, file.name);
    setReplyTo(null);

    try {
      await apiFetch('/api/chat/upload', { method: 'POST', body: form });
      await loadMessages();
      await refreshBootstrap();
    } catch (err) {
      showToast(err.message);
    }
  }

  async function startVoiceRecording() {
    if (!state.activeConvId) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || typeof MediaRecorder === 'undefined') {
      showToast(t('micUnavailable'));
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      state.mediaRecorder = recorder;
      state.recChunks = [];
      state.recStartMs = Date.now();
      state.recCancelled = false;

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) state.recChunks.push(ev.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((tr) => tr.stop());
        clearInterval(state.recTimerId);
        document.getElementById('recording-bar').classList.add('hidden');
        document.getElementById('composer-form').classList.remove('hidden');

        if (state.recCancelled || state.recChunks.length === 0) return;
        const durationMs = Date.now() - state.recStartMs;
        const blob = new Blob(state.recChunks, { type: recorder.mimeType || 'audio/webm' });
        const form = new FormData();
        form.append('conversationId', state.activeConvId);
        form.append('isVoice', '1');
        form.append('durationMs', String(durationMs));
        if (state.replyTo) form.append('replyToId', state.replyTo.id);
        form.append('file', blob, 'voice_' + Date.now() + '.webm');
        setReplyTo(null);

        try {
          await apiFetch('/api/chat/upload', { method: 'POST', body: form });
          await loadMessages();
          await refreshBootstrap();
        } catch (err) {
          showToast(err.message);
        }
      };

      recorder.start();
      document.getElementById('composer-form').classList.add('hidden');
      document.getElementById('recording-bar').classList.remove('hidden');
      document.getElementById('rec-timer').textContent = '00:00';
      state.recTimerId = setInterval(() => {
        document.getElementById('rec-timer').textContent = formatDuration(Date.now() - state.recStartMs);
      }, 300);
    } catch (err) {
      showToast(t('micUnavailable') + ': ' + err.message);
    }
  }

  function stopVoiceRecording(cancel) {
    state.recCancelled = Boolean(cancel);
    if (state.mediaRecorder && state.mediaRecorder.state !== 'inactive') {
      state.mediaRecorder.stop();
    }
  }

  function openNewGroupModal() {
    const wrap = document.createElement('div');
    wrap.style.display = 'flex';
    wrap.style.flexDirection = 'column';
    wrap.style.gap = '10px';

    const nameInput = document.createElement('input');
    nameInput.className = 'input';
    nameInput.placeholder = t('groupName');
    wrap.appendChild(nameInput);

    const label = document.createElement('div');
    label.className = 'muted';
    label.textContent = t('selectMembers');
    wrap.appendChild(label);

    const selected = new Set();
    state.peers.forEach((p) => {
      const row = document.createElement('label');
      row.className = 'list-item';
      row.innerHTML = `<input type="checkbox" value="${escapeHtml(p.uuid)}" /> <span>${escapeHtml(p.display_name || p.uuid)}</span>`;
      row.querySelector('input').addEventListener('change', (ev) => {
        if (ev.target.checked) selected.add(p.uuid);
        else selected.delete(p.uuid);
      });
      wrap.appendChild(row);
    });

    const createBtn = document.createElement('button');
    createBtn.type = 'button';
    createBtn.className = 'btn btn-primary';
    createBtn.textContent = t('create');
    createBtn.addEventListener('click', async () => {
      const name = nameInput.value.trim();
      if (!name) return;
      try {
        const res = await apiFetch('/api/groups', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, memberUuids: Array.from(selected) })
        });
        closeModal();
        await refreshBootstrap();
        if (res.conversation && res.conversation.id) {
          openConversation(res.conversation.id);
        }
      } catch (err) {
        showToast(err.message);
      }
    });
    wrap.appendChild(createBtn);
    openModal(t('newGroup'), wrap);
  }

  async function openSaveToVaultModal(att) {
    let pickerPath = '';

    async function renderPicker() {
      const wrap = document.createElement('div');
      wrap.style.display = 'flex';
      wrap.style.flexDirection = 'column';
      wrap.style.gap = '8px';

      const pathLabel = document.createElement('div');
      pathLabel.className = 'muted';
      pathLabel.textContent = '/' + pickerPath;
      wrap.appendChild(pathLabel);

      if (pickerPath) {
        const upBtn = document.createElement('button');
        upBtn.type = 'button';
        upBtn.className = 'btn btn-ghost btn-sm';
        upBtn.textContent = '⬆ ..';
        upBtn.addEventListener('click', () => {
          const parts = pickerPath.split('/');
          parts.pop();
          pickerPath = parts.join('/');
          renderPicker();
        });
        wrap.appendChild(upBtn);
      }

      try {
        const res = await apiFetch('/api/vault/list?path=' + encodeURIComponent(pickerPath));
        const dirs = (res.items || []).filter((item) => item.is_dir);
        for (const d of dirs) {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'list-item';
          btn.style.width = '100%';
          btn.style.textAlign = 'start';
          btn.innerHTML = `<span>📁 ${escapeHtml(d.name)} ${d.isProtected ? '🔒' : ''}</span>`;
          btn.addEventListener('click', () => {
            pickerPath = d.rel_path;
            renderPicker();
          });
          wrap.appendChild(btn);
        }
      } catch (err) {
        if (err.data && err.data.code === 'LOCKED') {
          const pwInput = document.createElement('input');
          pwInput.type = 'password';
          pwInput.className = 'input';
          pwInput.placeholder = t('enterPassword');
          const unlockBtn = document.createElement('button');
          unlockBtn.type = 'button';
          unlockBtn.className = 'btn btn-primary';
          unlockBtn.textContent = t('unlock');
          unlockBtn.addEventListener('click', async () => {
            try {
              const target = (err.data.blockingAncestor && err.data.blockingAncestor.relPath) || pickerPath;
              await apiFetch('/api/vault/unlock', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ relPath: target, password: pwInput.value })
              });
              renderPicker();
            } catch (uErr) {
              showToast(t('wrongPassword'));
            }
          });
          wrap.appendChild(pwInput);
          wrap.appendChild(unlockBtn);
          openModal(t('chooseDestFolder'), wrap);
          return;
        }
        showToast(err.message);
      }

      const saveBtn = document.createElement('button');
      saveBtn.type = 'button';
      saveBtn.className = 'btn btn-primary';
      saveBtn.textContent = t('saveHere');
      saveBtn.addEventListener('click', () => doSave('prompt'));
      wrap.appendChild(saveBtn);

      openModal(t('chooseDestFolder'), wrap);
    }

    async function doSave(strategy) {
      try {
        await apiFetch('/api/chat/save-to-vault', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            attachment: att,
            targetVaultFolder: pickerPath,
            conflictStrategy: strategy
          })
        });
        closeModal();
        showToast(t('savedToVault'));
      } catch (err) {
        if (err.status === 409) {
          const wrap = document.createElement('div');
          wrap.innerHTML = `<p>${escapeHtml(t('conflictTitle'))}</p>`;
          const b1 = document.createElement('button');
          b1.className = 'btn btn-primary';
          b1.textContent = t('keepBoth');
          b1.onclick = () => doSave('keep_both');
          const b2 = document.createElement('button');
          b2.className = 'btn btn-ghost';
          b2.textContent = t('overwrite');
          b2.onclick = () => doSave('overwrite');
          wrap.appendChild(b1);
          wrap.appendChild(b2);
          openModal(t('conflictTitle'), wrap);
        } else if (err.status === 403) {
          showToast(t('noWritePerm'));
        } else {
          showToast(err.message);
        }
      }
    }

    renderPicker();
  }

  async function loadVaultList(relPath) {
    state.vaultPath = relPath || '';
    renderBreadcrumbs();
    const listEl = document.getElementById('vault-list');

    try {
      const q = (state.vaultSearchQuery || '').trim();
      const url = q
        ? '/api/vault/search?q=' + encodeURIComponent(q)
        : '/api/vault/list?path=' + encodeURIComponent(state.vaultPath);
      const res = await apiFetch(url);
      state.vaultItems = res.items || [];
      renderVaultItems();
    } catch (err) {
      if (err.data && err.data.code === 'LOCKED') {
        const blockRel = (err.data.blockingAncestor && err.data.blockingAncestor.relPath) || state.vaultPath;
        promptVaultUnlock(blockRel, () => loadVaultList(state.vaultPath));
      } else {
        listEl.innerHTML = `<div class="center-card muted">${escapeHtml(err.message)}</div>`;
      }
    }
  }

  function renderBreadcrumbs() {
    const bc = document.getElementById('vault-breadcrumbs');
    const parts = state.vaultPath ? state.vaultPath.split('/').filter(Boolean) : [];
    let html = `<span class="crumb" data-path="">${escapeHtml(t('rootFolder'))}</span>`;
    let acc = '';
    for (const part of parts) {
      acc = acc ? acc + '/' + part : part;
      html += ` <span>/</span> <span class="crumb" data-path="${escapeHtml(acc)}">${escapeHtml(part)}</span>`;
    }
    bc.innerHTML = html;
    bc.querySelectorAll('.crumb').forEach((el) => {
      el.addEventListener('click', () => {
        state.vaultSearchQuery = '';
        document.getElementById('vault-search-input').value = '';
        loadVaultList(el.getAttribute('data-path'));
      });
    });
  }

  function renderVaultItems() {
    const listEl = document.getElementById('vault-list');
    if (!state.vaultItems || state.vaultItems.length === 0) {
      listEl.innerHTML = `<div class="center-card muted">${escapeHtml(t('emptyFiles'))}</div>`;
      return;
    }

    listEl.innerHTML = state.vaultItems.map((item) => {
      const icon = item.is_dir ? '📁' : '📄';
      const lockBadge = (item.isProtected || item.has_password || item.perm_mode === 'private' || item.perm_mode === 'custom') ? ' 🔒' : '';
      const presence = state.presenceMap && state.presenceMap[item.rel_path];
      const presHtml = presence && presence.length > 0 ? `<span class="badge">${presence.length}</span>` : '';
      const sub = item.is_dir ? 'Folder' : formatBytes(item.size);
      return `<div class="list-item" data-rel-path="${escapeHtml(item.rel_path)}" data-is-dir="${item.is_dir ? '1' : '0'}">
        <div class="avatar sm">${icon}</div>
        <div class="item-body">
          <div class="item-top">
            <span class="item-title">${escapeHtml(item.name)}${lockBadge}</span>
            ${presHtml}
          </div>
          <div class="item-sub">${escapeHtml(sub)}</div>
        </div>
      </div>`;
    }).join('');

    listEl.querySelectorAll('[data-rel-path]').forEach((el) => {
      el.addEventListener('click', () => {
        const rel = el.getAttribute('data-rel-path');
        const isDir = el.getAttribute('data-is-dir') === '1';
        if (isDir) {
          state.vaultSearchQuery = '';
          document.getElementById('vault-search-input').value = '';
          loadVaultList(rel);
        } else {
          openVaultFilePreview(rel);
        }
      });
    });
  }

  function promptVaultUnlock(relPath, onSuccess) {
    const wrap = document.createElement('div');
    wrap.style.display = 'flex';
    wrap.style.flexDirection = 'column';
    wrap.style.gap = '10px';

    const msg = document.createElement('div');
    msg.className = 'muted';
    msg.textContent = relPath;
    wrap.appendChild(msg);

    const pw = document.createElement('input');
    pw.type = 'password';
    pw.className = 'input';
    pw.placeholder = t('enterPassword');
    wrap.appendChild(pw);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-primary';
    btn.textContent = t('unlock');
    btn.addEventListener('click', async () => {
      try {
        await apiFetch('/api/vault/unlock', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ relPath, password: pw.value })
        });
        closeModal();
        if (onSuccess) onSuccess();
      } catch (_) {
        showToast(t('wrongPassword'));
      }
    });
    wrap.appendChild(btn);
    openModal(t('lockedFolder'), wrap);
  }

  async function openVaultFilePreview(relPath) {
    try {
      const data = await apiFetch('/api/vault/preview?path=' + encodeURIComponent(relPath));
      const wrap = document.createElement('div');
      wrap.style.display = 'flex';
      wrap.style.flexDirection = 'column';
      wrap.style.gap = '10px';

      if (data.kind === 'image' && data.dataUrl) {
        const img = document.createElement('img');
        img.className = 'preview-media';
        img.src = data.dataUrl;
        wrap.appendChild(img);
      } else if (data.kind === 'pdf' && data.dataUrl) {
        const frame = document.createElement('iframe');
        frame.src = data.dataUrl;
        frame.style.width = '100%';
        frame.style.height = '55dvh';
        frame.style.border = 'none';
        wrap.appendChild(frame);
      } else if (data.kind === 'text') {
        const pre = document.createElement('pre');
        pre.className = 'preview-text';
        pre.textContent = data.text || '';
        wrap.appendChild(pre);
      } else if (data.kind === 'audio' && data.dataUrl) {
        const audio = document.createElement('audio');
        audio.controls = true;
        audio.src = data.dataUrl;
        wrap.appendChild(audio);
      } else if (data.kind === 'video' && data.dataUrl) {
        const video = document.createElement('video');
        video.controls = true;
        video.className = 'preview-media';
        video.src = data.dataUrl;
        wrap.appendChild(video);
      } else {
        const p = document.createElement('p');
        p.className = 'muted';
        p.textContent = t('unsupportedPreview');
        wrap.appendChild(p);
      }

      const dl = document.createElement('a');
      dl.className = 'btn btn-primary';
      dl.href = `/api/vault/download?path=${encodeURIComponent(relPath)}&token=${encodeURIComponent(state.token)}`;
      dl.target = '_blank';
      dl.rel = 'noopener';
      dl.textContent = t('download') + ' (' + formatBytes(data.size) + ')';
      wrap.appendChild(dl);

      openModal((data.node && data.node.name) || relPath, wrap);
    } catch (err) {
      if (err.data && err.data.code === 'LOCKED') {
        const blockRel = (err.data.blockingAncestor && err.data.blockingAncestor.relPath) || relPath;
        promptVaultUnlock(blockRel, () => openVaultFilePreview(relPath));
      } else {
        showToast(err.message);
      }
    }
  }

  function openVaultDeepLink(relPath, isDir) {
    switchTab('files');
    if (isDir) {
      loadVaultList(relPath);
    } else {
      const idx = relPath.lastIndexOf('/');
      const parent = idx === -1 ? '' : relPath.slice(0, idx);
      loadVaultList(parent).then(() => openVaultFilePreview(relPath));
    }
  }

  async function handleVaultUpload(file) {
    if (!file) return;
    const form = new FormData();
    form.append('targetParentPath', state.vaultPath || '');
    form.append('conflictStrategy', 'keep_both');
    form.append('file', file, file.name);
    try {
      await apiFetch('/api/vault/upload', { method: 'POST', body: form });
      showToast(t('uploaded'));
      await loadVaultList(state.vaultPath);
    } catch (err) {
      if (err.status === 403) showToast(t('noWritePerm'));
      else showToast(t('uploadFailed') + ': ' + err.message);
    }
  }

  async function refreshBootstrap() {
    const data = await apiFetch('/api/bootstrap');
    state.identity = data.identity;
    state.peers = data.peers || [];
    state.conversations = data.conversations || [];
    state.presenceMap = data.presenceMap || {};
    hideAuthError();
    renderQuickPeers();
    renderConversations();
    if (state.activeConvId) updateThreadHeader();
  }

  function connectWebSocket() {
    if (!state.token) return;
    if (state.ws) {
      try { state.ws.close(); } catch (_) {}
    }
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${proto}//${window.location.host}/ws?token=${encodeURIComponent(state.token)}`);
    state.ws = ws;

    ws.onopen = () => {
      document.getElementById('conn-status').textContent = t('connected');
    };

    ws.onclose = (ev) => {
      document.getElementById('conn-status').textContent = t('disconnected');
      if (ev.code === 4001) {
        showAuthError();
        return;
      }
      setTimeout(connectWebSocket, 2500);
    };

    ws.onmessage = (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch (_) { return; }
      const { event, data } = msg;
      if (event === 'chat:message' || event === 'chat:edit' || event === 'chat:delete' || event === 'chat:reaction' || event === 'chat:receipt') {
        refreshBootstrap().catch(() => {});
        if (state.activeConvId && (!data || !data.conversation_id || data.conversation_id === state.activeConvId || data.conversationId === state.activeConvId)) {
          loadMessages().catch(() => {});
        }
      } else if (event === 'chat:typing' && data) {
        const cid = data.conversationId || data.conversation_id;
        if (cid) {
          state.typingMap[cid] = data.isTyping ? [data.peerUuid] : [];
          if (cid === state.activeConvId) updateThreadHeader();
        }
      } else if (event === 'peers:changed' || event === 'conversations:changed' || event === 'presence:changed') {
        refreshBootstrap().catch(() => {});
        if (state.tab === 'files') renderVaultItems();
      } else if (event === 'vault:changed') {
        if (state.tab === 'files') loadVaultList(state.vaultPath).catch(() => {});
      }
    };
  }

  function init() {
    readInitialToken();
    applyThemeAndLang();

    document.getElementById('btn-lang').addEventListener('click', () => {
      state.lang = state.lang === 'ar' ? 'en' : 'ar';
      localStorage.setItem('wm_mob_lang', state.lang);
      applyThemeAndLang();
      renderConversations();
      renderMessages();
      renderBreadcrumbs();
    });

    document.getElementById('btn-theme').addEventListener('click', () => {
      state.theme = state.theme === 'dark' ? 'light' : 'dark';
      localStorage.setItem('wm_mob_theme', state.theme);
      applyThemeAndLang();
    });

    document.getElementById('nav-chats').addEventListener('click', () => switchTab('chats'));
    document.getElementById('nav-files').addEventListener('click', () => switchTab('files'));

    document.getElementById('btn-apply-token').addEventListener('click', () => {
      const val = document.getElementById('manual-token-input').value.trim();
      if (!val) return;
      state.token = val;
      sessionStorage.setItem('wm_mobile_token', val);
      boot();
    });

    document.getElementById('conv-search').addEventListener('input', renderConversations);
    document.getElementById('btn-new-group').addEventListener('click', openNewGroupModal);
    document.getElementById('btn-back-chats').addEventListener('click', () => {
      state.activeConvId = null;
      document.getElementById('thread-pane').classList.add('hidden');
      document.getElementById('conv-list-pane').classList.remove('hidden');
    });

    document.getElementById('btn-thread-search').addEventListener('click', () => {
      document.getElementById('thread-search-bar').classList.toggle('hidden');
    });
    document.getElementById('msg-search-input').addEventListener('input', () => loadMessages().catch(() => {}));
    document.getElementById('btn-cancel-reply').addEventListener('click', () => setReplyTo(null));
    document.getElementById('composer-form').addEventListener('submit', sendTextMessage);

    document.getElementById('btn-attach-file').addEventListener('click', () => {
      document.getElementById('chat-file-input').click();
    });
    document.getElementById('chat-file-input').addEventListener('change', (ev) => {
      const file = ev.target.files && ev.target.files[0];
      ev.target.value = '';
      if (file) handleChatFileUpload(file);
    });

    document.getElementById('btn-voice-rec').addEventListener('click', startVoiceRecording);
    document.getElementById('btn-rec-cancel').addEventListener('click', () => stopVoiceRecording(true));
    document.getElementById('btn-rec-send').addEventListener('click', () => stopVoiceRecording(false));

    document.getElementById('vault-search-input').addEventListener('input', (ev) => {
      state.vaultSearchQuery = ev.target.value;
      loadVaultList(state.vaultPath);
    });
    document.getElementById('btn-vault-upload').addEventListener('click', () => {
      document.getElementById('vault-upload-input').click();
    });
    document.getElementById('vault-upload-input').addEventListener('change', (ev) => {
      const file = ev.target.files && ev.target.files[0];
      ev.target.value = '';
      if (file) handleVaultUpload(file);
    });

    document.getElementById('modal-close').addEventListener('click', closeModal);
    document.getElementById('modal-backdrop').addEventListener('click', (ev) => {
      if (ev.target.id === 'modal-backdrop') closeModal();
    });

    boot();
  }

  async function boot() {
    if (!state.token) {
      showAuthError();
      return;
    }
    try {
      await refreshBootstrap();
      connectWebSocket();
    } catch (_) {
      showAuthError();
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
