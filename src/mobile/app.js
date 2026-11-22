(function () {
  'use strict';

  const STRINGS = {
    ar: {
      appName: 'TwinSync Pro',
      portalSubtitle: 'بوابة الوصول الموحدة للدردشة والملفات عبر الشبكة المحلية',
      zeroFootprint: 'بصمة صفرية • الذاكرة فقط',
      tabLoginExisting: 'تسجيل الدخول لحساب موجود',
      tabCreateAccount: 'إنشاء حساب مستقل جديد',
      searchAccounts: 'ابحث عن حساب بالاسم...',
      noAccountsFound: 'لا توجد حسابات مسجلة على الشبكة بعد',
      selectAccountHint: 'اختر حسابك أعلاه لتسجيل الدخول',
      enterPinLabel: 'أدخل رمز PIN (4 إلى 6 أرقام)',
      loginBtn: 'تسجيل الدخول',
      pcNoPinNote: 'لم يتم تعيين رمز PIN لهذا الحساب بعد. افتح تطبيق TwinSync Pro على الكمبيوتر وانتقل إلى الإعدادات > رمز الحماية الشخصي (Account PIN) لتعيين رمز من 4–6 أرقام.',
      invalidPin: 'رمز PIN غير صحيح',
      pinFormatError: 'يجب أن يتكون رمز PIN من 4 إلى 6 أرقام فقط',
      pinMismatch: 'رمزا PIN غير متطابقين',
      forgotPinBtn: 'نسيت رمز PIN؟ استعادة بدون إنترنت',
      recoveryTitle: 'استعادة رمز PIN بدون إنترنت',
      methodSecurityQa: 'سؤال الأمان',
      methodRecoveryCode: 'كود الاسترداد (6 رموز)',
      recoveryAnswerLabel: 'إجابة سؤال الأمان',
      recoveryCodeLabel: 'أدخل كود الاسترداد المكون من 6 رموز',
      newPinLabel: 'رمز PIN الجديد (4–6 أرقام)',
      confirmPinLabel: 'تأكيد رمز PIN الجديد',
      recoverAndLogin: 'تعيين PIN والدخول',
      invalidRecoveryCreds: 'بيانات التحقق غير صحيحة',
      pinRecovered: 'تم تحديث رمز PIN وتسجيل الدخول بنجاح',
      displayNameLabel: 'الاسم الظاهر للفريق',
      displayNamePlaceholder: 'مثال: سارة - التصميم',
      avatarLabel: 'الصورة أو اللون المميز',
      uploadPhoto: 'رفع صورة',
      removePhoto: 'إزالة الصورة',
      pinLabel: 'رمز PIN (4–6 أرقام)',
      confirmPinShort: 'تأكيد PIN',
      secQuestionLabel: 'سؤال الأمان لاستعادة الحساب',
      secQuestionCustom: 'كتابة سؤال مخصص...',
      secQuestionCustomPlaceholder: 'اكتب سؤالك الشخصي هنا',
      secAnswerLabel: 'إجابة سؤال الأمان',
      secAnswerPlaceholder: 'أدخل إجابة يسهل عليك تذكرها',
      createAccountBtn: 'إنشاء الحساب والانضمام',
      nameRequired: 'يرجى إدخال الاسم الظاهر',
      secQaRequired: 'يرجى تحديد سؤال الأمان وإدخال الإجابة',
      recoveryModalTitle: 'احفظ كود الاسترداد الخاص بك',
      recoveryModalDesc: 'يُعرض هذا الكود لمرة واحدة فقط! ستحتاجه لاستعادة رمز PIN لحسابك بدون إنترنت إذا نسيته.',
      copyRecoveryCode: 'نسخ كود الاسترداد',
      savedEnterApp: 'حفظت الكود — دخول للتطبيق',
      quickLinkSummary: 'لديك رمز ربط سريع من كمبيوتر؟ (Quick Link)',
      sessionExpiredBanner: 'انتهت صلاحية رابط الجلسة السريع أو الرمز غير صالح. سجّل الدخول بحسابك أو الصق رمزاً جديداً.',
      switchAccount: 'تبديل الحساب',
      logout: 'تسجيل خروج',
      desktopDevice: 'كمبيوتر',
      mobileDevice: 'هاتف / ويب',
      chats: 'المحادثات',
      files: 'الملفات',
      splitView: 'عرض مقسم 50/50',
      connected: 'متصل بالشبكة المحلية',
      disconnected: 'جاري إعادة الاتصال...',
      connect: 'اتصال',
      searchChats: 'ابحث في المحادثات...',
      searchMsgs: 'ابحث في الرسائل...',
      searchVault: 'ابحث في الملفات...',
      messagePlaceholder: 'اكتب رسالة...',
      selectConvEmpty: 'اختر محادثة من القائمة أو ابدأ محادثة جديدة للعمل فوراً.',
      newGroup: 'مجموعة جديدة',
      groupName: 'اسم المجموعة',
      create: 'إنشاء',
      selectMembers: 'اختر الأعضاء',
      online: 'متصل',
      offline: 'غير متصل',
      typing: 'يكتب الآن...',
      reply: 'رد',
      forward: 'تحويل',
      forwardTo: 'تحويل الرسالة إلى...',
      forwardedTag: 'رسالة محوّلة',
      copyText: 'نسخ النص',
      copied: 'تم النسخ',
      edit: 'تعديل',
      edited: 'معدّلة',
      deleteMsg: 'حذف',
      saveChanges: 'حفظ التعديل',
      cancel: 'إلغاء',
      react: 'تفاعل',
      deletedMsg: 'تم حذف هذه الرسالة',
      voiceNote: 'رسالة صوتية',
      openDownload: 'فتح / تحميل',
      saveToVault: 'حفظ في مدير الملفات',
      openVaultLink: 'فتح في مدير الملفات',
      vaultLinkLabel: 'رابط من مدير الملفات',
      newFolder: 'مجلد جديد',
      newFolderName: 'اسم المجلد الجديد',
      folderCreated: 'تم إنشاء المجلد بنجاح',
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
      attachModalTitle: 'إرسال ملف في المحادثة',
      captionPrompt: 'أضف تعليقاً (اختياري)...',
      emptyChats: 'لا توجد محادثات بعد. اختر زميلاً من الأعلى لبدء محادثة.',
      emptyFiles: 'هذا المجلد فارغ',
      unsupportedPreview: 'لا تتوفر معاينة لهذا النوع. يمكنك تنزيله.',
      directMessage: 'محادثة مباشرة',
      groupChat: 'مجموعة',
      membersCount: 'أعضاء',
      folderLabel: 'مجلد',
      fullDesktopUi: 'واجهة سطح المكتب الكاملة',
      installerBannerTitle: 'تثبيت TwinSync Pro للويندوز (بدون إنترنت)',
      installerDownloadShort: 'تنزيل (.exe)',
      securityQ1: 'ما اسم أول مدرسة التحقت بها؟',
      securityQ2: 'ما اسم مدينتك المفضلة؟',
      securityQ3: 'ما اسم صديق طفولتك المفضل؟',
      securityQ4: 'ما هو طراز أول سيارة أو هاتف امتلكته؟'
    },
    en: {
      appName: 'TwinSync Pro',
      portalSubtitle: 'Unified LAN Portal for Real-Time Chat & Vault Files',
      zeroFootprint: 'Zero Footprint • RAM Only',
      tabLoginExisting: 'Login to Existing Account',
      tabCreateAccount: 'Create New Standalone Account',
      searchAccounts: 'Search accounts by name...',
      noAccountsFound: 'No accounts registered on the LAN yet',
      selectAccountHint: 'Select your account above to sign in',
      enterPinLabel: 'Enter 4–6 Digit PIN',
      loginBtn: 'Login',
      pcNoPinNote: 'No Account PIN is set for this PC account yet. Open TwinSync Pro on the PC and go to Settings > Account PIN to set a 4–6 digit PIN.',
      invalidPin: 'Incorrect PIN',
      pinFormatError: 'PIN must be 4 to 6 numeric digits',
      pinMismatch: 'PINs do not match',
      forgotPinBtn: 'Forgot PIN? Recover Offline',
      recoveryTitle: 'Offline PIN Recovery',
      methodSecurityQa: 'Security Question',
      methodRecoveryCode: '6-Char Recovery Code',
      recoveryAnswerLabel: 'Security Answer',
      recoveryCodeLabel: 'Enter 6-Char Recovery Code',
      newPinLabel: 'New PIN (4–6 digits)',
      confirmPinLabel: 'Confirm New PIN',
      recoverAndLogin: 'Reset PIN & Login',
      invalidRecoveryCreds: 'Invalid security answer or recovery code',
      pinRecovered: 'PIN updated and signed in successfully',
      displayNameLabel: 'Display Name',
      displayNamePlaceholder: 'e.g., Sarah - Design',
      avatarLabel: 'Avatar Color or Photo',
      uploadPhoto: 'Upload Photo',
      removePhoto: 'Remove Photo',
      pinLabel: 'New PIN (4–6 digits)',
      confirmPinShort: 'Confirm PIN',
      secQuestionLabel: 'Security Question (Offline Recovery)',
      secQuestionCustom: 'Custom question...',
      secQuestionCustomPlaceholder: 'Enter your personal question',
      secAnswerLabel: 'Security Answer',
      secAnswerPlaceholder: 'Enter an answer you remember easily',
      createAccountBtn: 'Create Account & Join',
      nameRequired: 'Display name is required',
      secQaRequired: 'Security question and answer are required',
      recoveryModalTitle: 'Save Your One-Time Recovery Code',
      recoveryModalDesc: 'This 6-character code is shown only once. Save it securely to recover your PIN offline if forgotten.',
      copyRecoveryCode: 'Copy Recovery Code',
      savedEnterApp: 'Saved — Enter TwinSync Pro',
      quickLinkSummary: 'Have a PC Quick Link token?',
      sessionExpiredBanner: 'Quick Link session expired or invalid token. Sign in with an account below or paste a fresh token.',
      switchAccount: 'Switch Account',
      logout: 'Logout',
      desktopDevice: 'Desktop PC',
      mobileDevice: 'Mobile / Web',
      chats: 'Chats',
      files: 'Files',
      splitView: 'Split View 50/50',
      connected: 'Connected on LAN',
      disconnected: 'Reconnecting...',
      connect: 'Connect',
      searchChats: 'Search chats...',
      searchMsgs: 'Search messages...',
      searchVault: 'Search files...',
      messagePlaceholder: 'Type a message...',
      selectConvEmpty: 'Select a conversation or start a new chat to collaborate.',
      newGroup: 'New Group',
      groupName: 'Group name',
      create: 'Create',
      selectMembers: 'Select members',
      online: 'Online',
      offline: 'Offline',
      typing: 'typing...',
      reply: 'Reply',
      forward: 'Forward',
      forwardTo: 'Forward message to...',
      forwardedTag: 'Forwarded',
      copyText: 'Copy',
      copied: 'Copied',
      edit: 'Edit',
      edited: 'edited',
      deleteMsg: 'Delete',
      saveChanges: 'Save',
      cancel: 'Cancel',
      react: 'React',
      deletedMsg: 'This message was deleted',
      voiceNote: 'Voice Note',
      openDownload: 'Open / Download',
      saveToVault: 'Save to Vault',
      openVaultLink: 'Open in Vault',
      vaultLinkLabel: 'Vault Item Link',
      newFolder: 'New Folder',
      newFolderName: 'New folder name',
      folderCreated: 'Folder created',
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
      attachModalTitle: 'Send File to Chat',
      captionPrompt: 'Add a caption (optional)...',
      emptyChats: 'No chats yet. Tap a peer above to start.',
      emptyFiles: 'This folder is empty',
      unsupportedPreview: 'Preview not available for this file type. Download to view.',
      directMessage: 'Direct Message',
      groupChat: 'Group',
      membersCount: 'members',
      folderLabel: 'Folder',
      fullDesktopUi: 'Full Desktop UI',
      installerBannerTitle: 'TwinSync Pro for Windows (Offline)',
      installerDownloadShort: 'Download (.exe)',
      securityQ1: 'What is the name of your first school?',
      securityQ2: 'What is your favorite city?',
      securityQ3: 'What is your childhood best friend’s name?',
      securityQ4: 'What was your first car or phone model?'
    }
  };

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

  const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

  // Strictly in-memory Zero Footprint state
  const state = {
    token: '',
    mode: 'portal',
    lang: 'ar',
    theme: 'light',
    tab: 'chats',
    splitView: false,
    identity: null,
    peers: [],
    conversations: [],
    presenceMap: {},
    activeConvId: null,
    messages: [],
    replyTo: null,
    typingMap: {},
    typingTimers: {},
    lastTypingSentAt: 0,
    typingStopTimer: null,
    vaultPath: '',
    vaultItems: [],
    vaultSearchQuery: '',
    ws: null,
    wsReconnectTimer: null,
    mediaRecorder: null,
    recChunks: [],
    recStartMs: 0,
    recTimerId: null,
    recCancelled: false,
    activeAudio: null,
    activeAudioId: null,
    playbackRate: 1,
    modalLocked: false,
    lastTouchTime: 0
  };

  const authState = {
    activeTab: 'login',
    accounts: [],
    selectedUuid: '',
    recoveryMode: false,
    recoveryInfo: null,
    recoveryMethod: 'security_qa',
    regAvatar: 'color:#4F46E5',
    regHasPhoto: false,
    installerInfo: null
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

  async function copyTextSafe(text) {
    const value = String(text == null ? '' : text);
    if (!value) return false;
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      try {
        await navigator.clipboard.writeText(value);
        return true;
      } catch (_) {}
    }
    try {
      const ta = document.createElement('textarea');
      ta.value = value;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.top = '-9999px';
      ta.style.left = '-9999px';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      ta.setSelectionRange(0, value.length);
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return Boolean(ok);
    } catch (_) {
      return false;
    }
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
    if (Number.isNaN(d.getTime())) return '';
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
    if (!container) return;
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    container.appendChild(el);
    setTimeout(() => {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 3200);
  }

  function getDeviceBadge(entity) {
    return entity && entity.device_type === 'mobile' ? '📱' : '💻';
  }

  function getDeviceLabel(entity) {
    return entity && entity.device_type === 'mobile' ? t('mobileDevice') : t('desktopDevice');
  }

  function getEntityName(entity) {
    return (entity && (entity.display_name || entity.name)) || '';
  }

  function getEntityAvatar(entity) {
    return (entity && (entity.avatar_data || entity.avatar)) || '';
  }

  function getInitials(name) {
    const parts = String(name || 'TS').trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return 'TS';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return ((parts[0][0] || '') + (parts[1][0] || '')).toUpperCase();
  }

  function renderAvatarInner(name, avatarData) {
    const initials = getInitials(name);
    const val = String(avatarData || '').trim();
    if (val.startsWith('color:')) {
      const hex = val.slice(6).trim();
      const safeHex = /^#[0-9a-fA-F]{3,8}$/.test(hex) ? hex : '#4F46E5';
      return { style: `background:${safeHex};color:#fff;`, html: escapeHtml(initials) };
    }
    if (val) {
      return { style: '', html: `<img src="${escapeHtml(val)}" alt="" />` };
    }
    return { style: '', html: escapeHtml(initials) };
  }

  function renderAvatarHtml(name, avatarData, sizeClass) {
    const inner = renderAvatarInner(name, avatarData);
    const cls = sizeClass ? `avatar ${sizeClass}` : 'avatar';
    const styleAttr = inner.style ? ` style="${inner.style}"` : '';
    return `<div class="${cls}"${styleAttr}>${inner.html}</div>`;
  }

  function setAvatarElement(el, name, avatarData) {
    if (!el) return;
    const inner = renderAvatarInner(name, avatarData);
    el.style.background = '';
    el.style.color = '';
    if (inner.style) {
      const m = /background:([^;]+)/.exec(inner.style);
      if (m) el.style.background = m[1];
      el.style.color = '#fff';
    }
    el.innerHTML = inner.html;
  }

  function resizeImageToDataUrl(file, maxDim = 160, quality = 0.82) {
    return new Promise((resolve, reject) => {
      if (!file || !String(file.type || '').startsWith('image/')) {
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

  function populateSecurityQuestionsSelect() {
    const sel = document.getElementById('reg-sec-q-select');
    if (!sel) return;
    const prev = sel.value;
    const keys = ['securityQ1', 'securityQ2', 'securityQ3', 'securityQ4'];
    sel.innerHTML =
      keys.map((k) => `<option value="${k}">${escapeHtml(t(k))}</option>`).join('') +
      `<option value="custom">${escapeHtml(t('secQuestionCustom'))}</option>`;
    if (prev && Array.from(sel.options).some((o) => o.value === prev)) {
      sel.value = prev;
    }
  }

  function applyThemeAndLang() {
    document.documentElement.classList.toggle('dark', state.theme === 'dark');
    document.documentElement.lang = state.lang;
    document.documentElement.dir = state.lang === 'ar' ? 'rtl' : 'ltr';

    const nextLangLabel = state.lang === 'ar' ? 'EN' : 'AR';
    const nextThemeIcon = state.theme === 'dark' ? '☀' : '🌙';
    const backArrow = state.lang === 'ar' ? '→' : '←';

    document.getElementById('btn-lang').textContent = nextLangLabel;
    document.getElementById('btn-theme').textContent = nextThemeIcon;
    document.getElementById('portal-btn-lang').textContent = nextLangLabel;
    document.getElementById('portal-btn-theme').textContent = nextThemeIcon;

    // Portal Auth strings
    document.getElementById('portal-zero-badge').textContent = '🛡️ ' + t('zeroFootprint');
    document.getElementById('portal-btn-desktop-ui').textContent = '🖥️ ' + t('fullDesktopUi');
    document.getElementById('portal-btn-desktop-ui').title = t('fullDesktopUi');
    document.getElementById('portal-subtitle').textContent = t('portalSubtitle');
    renderInstallerBanner();
    document.getElementById('auth-tab-login').textContent = t('tabLoginExisting');
    document.getElementById('auth-tab-register').textContent = t('tabCreateAccount');
    document.getElementById('portal-account-search').placeholder = t('searchAccounts');
    document.getElementById('lbl-login-pin').textContent = t('enterPinLabel');
    document.getElementById('btn-portal-login').textContent = t('loginBtn');
    document.getElementById('btn-open-forgot-pin').textContent = t('forgotPinBtn');
    document.getElementById('btn-back-to-pin').textContent = backArrow;
    document.getElementById('recovery-panel-title').textContent = t('recoveryTitle');
    document.getElementById('btn-rec-method-qa').textContent = t('methodSecurityQa');
    document.getElementById('btn-rec-method-code').textContent = t('methodRecoveryCode');
    document.getElementById('lbl-rec-new-pin').textContent = t('newPinLabel');
    document.getElementById('lbl-rec-confirm-pin').textContent = t('confirmPinLabel');
    document.getElementById('btn-submit-recovery').textContent = t('recoverAndLogin');
    document.getElementById('lbl-reg-name').textContent = t('displayNameLabel');
    document.getElementById('reg-name-input').placeholder = t('displayNamePlaceholder');
    document.getElementById('lbl-reg-avatar').textContent = t('avatarLabel');
    document.getElementById('btn-reg-upload-photo').textContent = '📷 ' + t('uploadPhoto');
    document.getElementById('btn-reg-clear-photo').textContent = t('removePhoto');
    document.getElementById('lbl-reg-pin').textContent = t('pinLabel');
    document.getElementById('lbl-reg-confirm-pin').textContent = t('confirmPinShort');
    document.getElementById('lbl-reg-sec-q').textContent = t('secQuestionLabel');
    document.getElementById('reg-sec-q-custom').placeholder = t('secQuestionCustomPlaceholder');
    document.getElementById('lbl-reg-sec-a').textContent = t('secAnswerLabel');
    document.getElementById('reg-sec-a-input').placeholder = t('secAnswerPlaceholder');
    document.getElementById('btn-portal-register').textContent = t('createAccountBtn');
    document.getElementById('quick-token-summary').textContent = t('quickLinkSummary');
    document.getElementById('btn-apply-token').textContent = t('connect');
    populateSecurityQuestionsSelect();
    updateRecoveryMethodFields();

    // Workspace strings
    document.getElementById('nav-chats-label').textContent = t('chats');
    document.getElementById('nav-files-label').textContent = t('files');
    document.getElementById('rail-chats-label').textContent = t('chats');
    document.getElementById('rail-files-label').textContent = t('files');
    document.getElementById('rail-split-label').textContent = t('splitView');
    document.getElementById('rail-split').title = t('splitView');
    document.getElementById('btn-switch-top-label').textContent = t('switchAccount');
    document.getElementById('btn-switch-rail-label').textContent = t('switchAccount');
    document.getElementById('btn-desktop-ui-label').textContent = t('fullDesktopUi');
    document.getElementById('btn-desktop-ui').title = t('fullDesktopUi');
    document.getElementById('btn-switch-account-rail').title = t('switchAccount') + ' / ' + t('logout');
    document.getElementById('btn-switch-account-top').title = t('switchAccount') + ' / ' + t('logout');
    document.getElementById('btn-back-chats').textContent = backArrow;
    document.getElementById('conv-search').placeholder = t('searchChats');
    document.getElementById('msg-search-input').placeholder = t('searchMsgs');
    document.getElementById('vault-search-input').placeholder = t('searchVault');
    document.getElementById('composer-input').placeholder = t('messagePlaceholder');
    document.getElementById('btn-rec-send').textContent = t('send');
    document.getElementById('thread-empty-desc').textContent = t('selectConvEmpty');
    document.getElementById('btn-vault-new-folder').title = t('newFolder');
  }

  function readInitialParams() {
    const params = new URLSearchParams(window.location.search);
    const mode = params.get('mode');
    const urlToken = (params.get('token') || '').trim();
    if (urlToken) {
      state.token = urlToken;
      state.mode = mode === 'portal' ? 'portal' : 'linked';
    } else {
      state.token = '';
      state.mode = 'portal';
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
      handleSessionInvalid(t('sessionExpiredBanner'));
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

  function closeContextOverlays() {
    const ctx = document.getElementById('msg-context-menu');
    if (ctx) {
      ctx.classList.add('hidden');
      ctx.innerHTML = '';
    }
    const sheetBg = document.getElementById('bottom-sheet-backdrop');
    if (sheetBg) {
      sheetBg.classList.add('hidden');
      document.getElementById('bottom-sheet').innerHTML = '';
    }
  }

  function stopMediaAndTimers() {
    if (state.wsReconnectTimer) {
      clearTimeout(state.wsReconnectTimer);
      state.wsReconnectTimer = null;
    }
    if (state.ws) {
      try {
        state.ws.onclose = null;
        state.ws.close();
      } catch (_) {}
      state.ws = null;
    }
    if (state.activeAudio) {
      try { state.activeAudio.pause(); } catch (_) {}
      state.activeAudio = null;
      state.activeAudioId = null;
    }
    if (state.mediaRecorder && state.mediaRecorder.state !== 'inactive') {
      state.recCancelled = true;
      try { state.mediaRecorder.stop(); } catch (_) {}
    }
    if (state.recTimerId) {
      clearInterval(state.recTimerId);
      state.recTimerId = null;
    }
    if (state.typingStopTimer) {
      clearTimeout(state.typingStopTimer);
      state.typingStopTimer = null;
    }
    for (const k of Object.keys(state.typingTimers)) {
      clearTimeout(state.typingTimers[k]);
    }
    state.typingTimers = {};
  }

  function clearInMemorySession() {
    stopMediaAndTimers();
    closeContextOverlays();
    state.token = '';
    state.mode = 'portal';
    state.identity = null;
    state.peers = [];
    state.conversations = [];
    state.presenceMap = {};
    state.activeConvId = null;
    state.messages = [];
    state.replyTo = null;
    state.typingMap = {};
    state.vaultPath = '';
    state.vaultItems = [];
    state.vaultSearchQuery = '';
    state.splitView = false;
    state.tab = 'chats';
    document.getElementById('main-area').classList.remove('is-split');
    document.getElementById('rail-split').classList.remove('active');
    document.getElementById('tab-chats').classList.remove('has-active-conv');
    document.getElementById('conv-search').value = '';
    document.getElementById('msg-search-input').value = '';
    document.getElementById('vault-search-input').value = '';
  }

  function handleSessionInvalid(bannerMsg) {
    clearInMemorySession();
    showPortalAuthView({ expiredMsg: bannerMsg || t('sessionExpiredBanner') });
  }

  function showPortalAuthView(opts) {
    const options = opts || {};
    document.getElementById('authenticated-shell').classList.add('hidden');
    document.getElementById('portal-auth-view').classList.remove('hidden');

    const banner = document.getElementById('portal-expired-banner');
    const quickDetails = document.getElementById('quick-token-details');
    if (options.expiredMsg) {
      banner.textContent = options.expiredMsg;
      banner.classList.remove('hidden');
      if (quickDetails) quickDetails.open = true;
    } else {
      banner.classList.add('hidden');
      banner.textContent = '';
      if (quickDetails) quickDetails.open = false;
    }

    switchPortalAuthTab(authState.activeTab || 'login');
    loadAuthAccounts();
    loadInstallerInfo();
  }

  function switchToDesktopUi() {
    window.location.href = '/desktop/' + (
      state.token
        ? '?mode=' + encodeURIComponent(state.mode || 'portal') + '&token=' + encodeURIComponent(state.token)
        : '?mode=portal'
    );
  }

  function renderInstallerBanner() {
    const banner = document.getElementById('portal-installer-banner');
    if (!banner) return;
    const info = authState.installerInfo;
    if (!info || !info.available) {
      banner.classList.add('hidden');
      return;
    }
    document.getElementById('portal-installer-title').textContent = '💻 ' + t('installerBannerTitle');
    const sizeText = info.size ? formatBytes(info.size) : '';
    const verText = info.version ? 'v' + info.version : '';
    document.getElementById('portal-installer-meta').textContent =
      [info.fileName, verText, sizeText].filter(Boolean).join(' • ');
    const dlLink = document.getElementById('portal-installer-dl');
    dlLink.textContent = '⬇ ' + t('installerDownloadShort');
    if (info.fileName) {
      dlLink.setAttribute('download', info.fileName);
    }
    banner.classList.remove('hidden');
  }

  async function loadInstallerInfo() {
    try {
      const res = await fetch('/api/installer/info', { cache: 'no-store' });
      const data = await res.json();
      authState.installerInfo = data && data.ok ? data : null;
    } catch (_) {
      authState.installerInfo = null;
    }
    renderInstallerBanner();
  }

  function hidePortalAuthView() {
    document.getElementById('portal-auth-view').classList.add('hidden');
    document.getElementById('authenticated-shell').classList.remove('hidden');
    switchTab(state.tab || 'chats');
  }

  async function logoutAndSwitchAccount() {
    const oldToken = state.token;
    if (oldToken) {
      try {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + oldToken }
        });
      } catch (_) {}
    }
    clearInMemorySession();
    authState.selectedUuid = '';
    authState.recoveryMode = false;
    authState.recoveryInfo = null;
    try {
      window.history.replaceState(null, '', '/?mode=portal');
    } catch (_) {}
    showPortalAuthView();
  }

  function updateAccountBadges() {
    const id = state.identity;
    const topBadge = document.getElementById('top-account-badge');
    const railBadge = document.getElementById('rail-account-badge');
    if (!id) {
      topBadge.classList.add('hidden');
      railBadge.classList.add('hidden');
      return;
    }
    const badgeIcon = getDeviceBadge(id);
    const name = getEntityName(id);
    topBadge.innerHTML = `<span>${badgeIcon}</span><span>${escapeHtml(name)}</span>`;
    topBadge.classList.remove('hidden');

    railBadge.innerHTML = `${renderAvatarHtml(name, getEntityAvatar(id), 'sm')}<span>${badgeIcon}</span>`;
    railBadge.title = name + ' (' + getDeviceLabel(id) + ')';
    railBadge.classList.remove('hidden');
  }

  // =========================================================================
  // Portal Auth: Accounts Roaming, Registration & Offline PIN Recovery
  // =========================================================================

  function switchPortalAuthTab(tab) {
    authState.activeTab = tab;
    document.getElementById('auth-tab-login').classList.toggle('active', tab === 'login');
    document.getElementById('auth-tab-register').classList.toggle('active', tab === 'register');
    document.getElementById('portal-login-pane').classList.toggle('hidden', tab !== 'login');
    document.getElementById('portal-register-pane').classList.toggle('hidden', tab !== 'register');
    if (tab === 'register') {
      renderRegColorSwatches();
      updateRegAvatarPreview();
    }
  }

  async function loadAuthAccounts() {
    const listEl = document.getElementById('portal-accounts-list');
    try {
      const res = await fetch('/api/auth/accounts', { cache: 'no-store' });
      const data = await res.json();
      authState.accounts = Array.isArray(data.accounts) ? data.accounts : [];
      renderAuthAccounts();
    } catch (_) {
      listEl.innerHTML = `<div class="muted" style="text-align:center;padding:12px;">${escapeHtml(t('disconnected'))}</div>`;
    }
  }

  function renderAuthAccounts() {
    const listEl = document.getElementById('portal-accounts-list');
    const q = (document.getElementById('portal-account-search').value || '').trim().toLowerCase();
    const filtered = authState.accounts.filter((acc) => {
      if (!q) return true;
      return getEntityName(acc).toLowerCase().includes(q);
    });

    if (filtered.length === 0) {
      listEl.innerHTML = `<div class="muted" style="text-align:center;padding:14px;">${escapeHtml(t('noAccountsFound'))}</div>`;
      return;
    }

    listEl.innerHTML = filtered.map((acc) => {
      const name = getEntityName(acc) || acc.uuid.slice(0, 6);
      const avatar = getEntityAvatar(acc);
      const badge = getDeviceBadge(acc);
      const devLabel = getDeviceLabel(acc);
      const isOnline = acc.status === 'online';
      const isSelected = authState.selectedUuid === acc.uuid;
      const pinTag = acc.has_pin
        ? `<span class="pin-status-tag ready">PIN ✓</span>`
        : `<span class="pin-status-tag">No PIN</span>`;

      return `<button type="button" class="account-card ${isSelected ? 'selected' : ''}" data-acc-uuid="${escapeHtml(acc.uuid)}">
        ${renderAvatarHtml(name, avatar, 'sm')}
        <div class="account-meta">
          <div class="account-name-row">
            <span class="dot ${isOnline ? 'online' : ''}"></span>
            <span class="device-badge" title="${escapeHtml(devLabel)}">${badge}</span>
            <span>${escapeHtml(name)}</span>
          </div>
          <div class="account-sub-row">
            <span>${escapeHtml(devLabel)}</span>
            ${pinTag}
          </div>
        </div>
      </button>`;
    }).join('');

    listEl.querySelectorAll('[data-acc-uuid]').forEach((btn) => {
      btn.addEventListener('click', () => selectAuthAccount(btn.getAttribute('data-acc-uuid')));
    });
  }

  function selectAuthAccount(uuid) {
    authState.selectedUuid = uuid;
    authState.recoveryMode = false;
    authState.recoveryInfo = null;
    renderAuthAccounts();

    const acc = authState.accounts.find((a) => a.uuid === uuid);
    const loginPanel = document.getElementById('portal-login-panel');
    const recoveryPanel = document.getElementById('portal-recovery-panel');
    recoveryPanel.classList.add('hidden');

    if (!acc) {
      loginPanel.classList.add('hidden');
      return;
    }

    loginPanel.classList.remove('hidden');
    const name = getEntityName(acc) || acc.uuid.slice(0, 6);
    document.getElementById('selected-account-summary').innerHTML = `
      ${renderAvatarHtml(name, getEntityAvatar(acc), 'sm')}
      <div>
        <div style="font-weight:700;font-size:14px;">${getDeviceBadge(acc)} ${escapeHtml(name)}</div>
        <div class="muted" style="font-size:11px;">${escapeHtml(getDeviceLabel(acc))}</div>
      </div>
    `;

    const noPinNote = document.getElementById('pc-no-pin-note');
    const pinForm = document.getElementById('portal-pin-form');
    const errEl = document.getElementById('login-error-msg');
    errEl.classList.add('hidden');
    errEl.textContent = '';

    if (acc.device_type !== 'mobile' && !acc.has_pin) {
      noPinNote.textContent = t('pcNoPinNote');
      noPinNote.classList.remove('hidden');
      pinForm.classList.add('hidden');
    } else {
      noPinNote.classList.add('hidden');
      pinForm.classList.remove('hidden');
      const pinInput = document.getElementById('login-pin-input');
      pinInput.value = '';
      pinInput.type = 'password';
      document.getElementById('btn-open-forgot-pin').classList.toggle('hidden', acc.device_type !== 'mobile');
      setTimeout(() => pinInput.focus(), 40);
    }
  }

  async function handlePortalLogin(e) {
    e.preventDefault();
    const acc = authState.accounts.find((a) => a.uuid === authState.selectedUuid);
    if (!acc) return;

    const pin = document.getElementById('login-pin-input').value.trim();
    const errEl = document.getElementById('login-error-msg');
    errEl.classList.add('hidden');

    if (!/^\d{4,6}$/.test(pin)) {
      errEl.textContent = t('pinFormatError');
      errEl.classList.remove('hidden');
      return;
    }

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uuid: acc.uuid, pin })
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        if (data && data.code === 'PIN_NOT_SET') {
          errEl.textContent = t('pcNoPinNote');
        } else if (res.status === 401 || (data && data.code === 'INVALID_PIN')) {
          errEl.textContent = t('invalidPin');
        } else {
          errEl.textContent = (data && data.error) || t('invalidPin');
        }
        errEl.classList.remove('hidden');
        return;
      }

      state.token = data.token;
      state.mode = data.mode || 'portal';
      state.identity = data.identity;
      hidePortalAuthView();
      await refreshBootstrap();
      connectWebSocket();
    } catch (err) {
      errEl.textContent = err.message || t('disconnected');
      errEl.classList.remove('hidden');
    }
  }

  async function openForgotPinPanel() {
    const acc = authState.accounts.find((a) => a.uuid === authState.selectedUuid);
    if (!acc || acc.device_type !== 'mobile') return;

    const errEl = document.getElementById('login-error-msg');
    errEl.classList.add('hidden');

    try {
      const res = await fetch('/api/auth/recovery-info/' + encodeURIComponent(acc.uuid), { cache: 'no-store' });
      const info = await res.json();
      if (!res.ok || !info.ok) {
        errEl.textContent = (info && info.error) || 'Recovery unavailable';
        errEl.classList.remove('hidden');
        return;
      }

      authState.recoveryMode = true;
      authState.recoveryInfo = info;
      authState.recoveryMethod = info.hasSecurityQA ? 'security_qa' : 'recovery_code';

      document.getElementById('portal-login-panel').classList.add('hidden');
      document.getElementById('portal-recovery-panel').classList.remove('hidden');

      const name = info.name || getEntityName(acc);
      document.getElementById('recovery-account-summary').innerHTML = `
        ${renderAvatarHtml(name, getEntityAvatar(acc), 'sm')}
        <div>
          <div style="font-weight:700;font-size:14px;">📱 ${escapeHtml(name)}</div>
          <div class="muted" style="font-size:11px;">${escapeHtml(t('mobileDevice'))}</div>
        </div>
      `;

      document.getElementById('btn-rec-method-qa').classList.toggle('hidden', !info.hasSecurityQA);
      document.getElementById('btn-rec-method-code').classList.toggle('hidden', !info.hasRecoveryCode);
      document.getElementById('rec-answer-input').value = '';
      document.getElementById('rec-new-pin-input').value = '';
      document.getElementById('rec-confirm-pin-input').value = '';
      document.getElementById('recovery-error-msg').classList.add('hidden');
      updateRecoveryMethodFields();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
    }
  }

  function updateRecoveryMethodFields() {
    const info = authState.recoveryInfo;
    const isQa = authState.recoveryMethod === 'security_qa';
    const qaBtn = document.getElementById('btn-rec-method-qa');
    const codeBtn = document.getElementById('btn-rec-method-code');
    if (qaBtn) qaBtn.classList.toggle('active', isQa);
    if (codeBtn) codeBtn.classList.toggle('active', !isQa);

    const qBox = document.getElementById('recovery-question-box');
    const ansLabel = document.getElementById('lbl-rec-answer');
    const ansInput = document.getElementById('rec-answer-input');
    if (!qBox || !ansLabel || !ansInput) return;

    if (isQa) {
      const qText = (info && info.securityQuestion) ? info.securityQuestion : '';
      qBox.textContent = qText;
      qBox.classList.toggle('hidden', !qText);
      ansLabel.textContent = t('recoveryAnswerLabel');
      ansInput.placeholder = t('secAnswerPlaceholder');
      ansInput.maxLength = 128;
      ansInput.style.textTransform = 'none';
      ansInput.style.letterSpacing = 'normal';
    } else {
      qBox.classList.add('hidden');
      ansLabel.textContent = t('recoveryCodeLabel');
      ansInput.placeholder = 'XXXXXX';
      ansInput.maxLength = 6;
      ansInput.style.textTransform = 'uppercase';
      ansInput.style.letterSpacing = '0.2em';
    }
  }

  async function handleRecoverPinSubmit(e) {
    e.preventDefault();
    const acc = authState.accounts.find((a) => a.uuid === authState.selectedUuid);
    if (!acc) return;

    const answerOrCode = document.getElementById('rec-answer-input').value.trim();
    const newPin = document.getElementById('rec-new-pin-input').value.trim();
    const confirmPin = document.getElementById('rec-confirm-pin-input').value.trim();
    const errEl = document.getElementById('recovery-error-msg');
    errEl.classList.add('hidden');

    if (!answerOrCode) {
      errEl.textContent = t('invalidRecoveryCreds');
      errEl.classList.remove('hidden');
      return;
    }
    if (!/^\d{4,6}$/.test(newPin)) {
      errEl.textContent = t('pinFormatError');
      errEl.classList.remove('hidden');
      return;
    }
    if (newPin !== confirmPin) {
      errEl.textContent = t('pinMismatch');
      errEl.classList.remove('hidden');
      return;
    }

    try {
      const res = await fetch('/api/auth/recover-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uuid: acc.uuid,
          method: authState.recoveryMethod,
          answerOrCode: authState.recoveryMethod === 'recovery_code' ? answerOrCode.toUpperCase() : answerOrCode,
          newPin
        })
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        errEl.textContent = res.status === 403 ? t('invalidRecoveryCreds') : ((data && data.error) || t('invalidRecoveryCreds'));
        errEl.classList.remove('hidden');
        return;
      }

      state.token = data.token;
      state.mode = data.mode || 'portal';
      state.identity = data.identity;
      hidePortalAuthView();
      showToast(t('pinRecovered'));
      await refreshBootstrap();
      connectWebSocket();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
    }
  }

  function renderRegColorSwatches() {
    const container = document.getElementById('reg-color-swatches');
    if (!container) return;
    container.innerHTML = AVATAR_COLORS.map((hex) => {
      const active = !authState.regHasPhoto && authState.regAvatar === 'color:' + hex;
      return `<button type="button" class="color-swatch ${active ? 'active' : ''}" data-color="${hex}" style="background:${hex}" aria-label="${hex}"></button>`;
    }).join('');
    container.querySelectorAll('[data-color]').forEach((btn) => {
      btn.addEventListener('click', () => {
        authState.regHasPhoto = false;
        authState.regAvatar = 'color:' + btn.getAttribute('data-color');
        document.getElementById('btn-reg-clear-photo').classList.add('hidden');
        renderRegColorSwatches();
        updateRegAvatarPreview();
      });
    });
  }

  function updateRegAvatarPreview() {
    const name = document.getElementById('reg-name-input').value.trim() || 'TS';
    const previewEl = document.getElementById('reg-avatar-preview');
    setAvatarElement(previewEl, name, authState.regAvatar);
  }

  async function handleRegPhotoChange(file) {
    if (!file) return;
    try {
      const dataUrl = await resizeImageToDataUrl(file, 160, 0.82);
      authState.regAvatar = dataUrl;
      authState.regHasPhoto = true;
      document.getElementById('btn-reg-clear-photo').classList.remove('hidden');
      renderRegColorSwatches();
      updateRegAvatarPreview();
    } catch (err) {
      showToast(err.message);
    }
  }

  function openRecoveryCodeModal(recoveryCode) {
    state.modalLocked = true;
    const wrap = document.createElement('div');
    wrap.style.display = 'flex';
    wrap.style.flexDirection = 'column';
    wrap.style.gap = '12px';

    const desc = document.createElement('p');
    desc.className = 'muted';
    desc.style.margin = '0';
    desc.textContent = t('recoveryModalDesc');
    wrap.appendChild(desc);

    const codeBox = document.createElement('div');
    codeBox.className = 'recovery-code-box';
    codeBox.textContent = recoveryCode || '';
    wrap.appendChild(codeBox);

    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'btn btn-ghost full-btn';
    copyBtn.textContent = '📋 ' + t('copyRecoveryCode');
    copyBtn.addEventListener('click', async () => {
      const ok = await copyTextSafe(recoveryCode);
      if (ok) showToast(t('copied'));
    });
    wrap.appendChild(copyBtn);

    const enterBtn = document.createElement('button');
    enterBtn.type = 'button';
    enterBtn.className = 'btn btn-primary full-btn';
    enterBtn.textContent = t('savedEnterApp');
    enterBtn.addEventListener('click', async () => {
      state.modalLocked = false;
      closeModal(true);
      hidePortalAuthView();
      try {
        await refreshBootstrap();
        connectWebSocket();
      } catch (err) {
        showToast(err.message);
      }
    });
    wrap.appendChild(enterBtn);

    openModal(t('recoveryModalTitle'), wrap, { locked: true });
  }

  async function handlePortalRegister(e) {
    e.preventDefault();
    const name = document.getElementById('reg-name-input').value.trim();
    const pin = document.getElementById('reg-pin-input').value.trim();
    const confirmPin = document.getElementById('reg-confirm-pin-input').value.trim();
    const qSel = document.getElementById('reg-sec-q-select').value;
    const securityQuestion = qSel === 'custom'
      ? document.getElementById('reg-sec-q-custom').value.trim()
      : t(qSel);
    const securityAnswer = document.getElementById('reg-sec-a-input').value.trim();

    const errEl = document.getElementById('register-error-msg');
    errEl.classList.add('hidden');

    if (!name) {
      errEl.textContent = t('nameRequired');
      errEl.classList.remove('hidden');
      return;
    }
    if (!/^\d{4,6}$/.test(pin)) {
      errEl.textContent = t('pinFormatError');
      errEl.classList.remove('hidden');
      return;
    }
    if (pin !== confirmPin) {
      errEl.textContent = t('pinMismatch');
      errEl.classList.remove('hidden');
      return;
    }
    if (!securityQuestion || !securityAnswer) {
      errEl.textContent = t('secQaRequired');
      errEl.classList.remove('hidden');
      return;
    }

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          avatar: authState.regAvatar || 'color:#4F46E5',
          pin,
          securityQuestion,
          securityAnswer
        })
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        errEl.textContent = (data && data.error) || t('error');
        errEl.classList.remove('hidden');
        return;
      }

      state.token = data.token;
      state.mode = data.mode || 'portal';
      state.identity = data.identity;

      // Reset register form fields
      document.getElementById('reg-pin-input').value = '';
      document.getElementById('reg-confirm-pin-input').value = '';
      document.getElementById('reg-sec-a-input').value = '';

      openRecoveryCodeModal(data.recoveryCode);
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
    }
  }

  // =========================================================================
  // Modals, Tabs & Split View
  // =========================================================================

  function openModal(title, htmlOrEl, opts) {
    const options = opts || {};
    state.modalLocked = Boolean(options.locked);
    document.getElementById('modal-close').classList.toggle('hidden', state.modalLocked);
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

  function closeModal(force) {
    if (state.modalLocked && !force) return;
    state.modalLocked = false;
    document.getElementById('modal-close').classList.remove('hidden');
    document.getElementById('modal-backdrop').classList.add('hidden');
    document.getElementById('modal-body').innerHTML = '';
  }

  function switchTab(tab) {
    state.tab = tab;
    document.getElementById('nav-chats').classList.toggle('active', tab === 'chats');
    document.getElementById('nav-files').classList.toggle('active', tab === 'files');
    document.getElementById('rail-chats').classList.toggle('active', !state.splitView && tab === 'chats');
    document.getElementById('rail-files').classList.toggle('active', !state.splitView && tab === 'files');
    document.getElementById('tab-chats').classList.toggle('active-tab', tab === 'chats');
    document.getElementById('tab-files').classList.toggle('active-tab', tab === 'files');

    if (tab === 'files' || state.splitView) {
      loadVaultList(state.vaultPath);
    }
  }

  function toggleSplitView() {
    state.splitView = !state.splitView;
    document.getElementById('main-area').classList.toggle('is-split', state.splitView);
    document.getElementById('rail-split').classList.toggle('active', state.splitView);
    document.getElementById('rail-chats').classList.toggle('active', !state.splitView && state.tab === 'chats');
    document.getElementById('rail-files').classList.toggle('active', !state.splitView && state.tab === 'files');
    if (state.splitView) {
      loadVaultList(state.vaultPath);
    }
  }

  // =========================================================================
  // Conversations & Quick Peers
  // =========================================================================

  function getConvTitle(conv) {
    if (!conv) return '';
    if (conv.type === 'group') return conv.name || t('groupChat');
    if (conv.peer) return getEntityName(conv.peer) || t('directMessage');
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
    const myUuid = state.identity ? state.identity.uuid : '';
    const peers = (state.peers || []).filter((p) => p.uuid !== myUuid && p.status === 'online');
    if (peers.length === 0) {
      strip.classList.add('hidden');
      return;
    }
    strip.classList.remove('hidden');
    strip.innerHTML = peers.map((p) => {
      const onlineClass = p.status === 'online' ? 'online' : '';
      const badge = getDeviceBadge(p);
      const name = getEntityName(p) || p.uuid.slice(0, 6);
      return `<button class="peer-chip" data-peer-uuid="${escapeHtml(p.uuid)}" type="button" title="${escapeHtml(getDeviceLabel(p))}">
        <span class="dot ${onlineClass}"></span>
        <span class="device-badge">${badge}</span>
        <span>${escapeHtml(name)}</span>
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
    const navBadge = document.getElementById('nav-unread-badge');
    const railBadge = document.getElementById('rail-unread-badge');
    [navBadge, railBadge].forEach((b) => {
      if (!b) return;
      if (totalUnread > 0) {
        b.textContent = String(totalUnread);
        b.classList.remove('hidden');
      } else {
        b.classList.add('hidden');
      }
    });

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
      const avatarData = conv.type === 'group' ? conv.avatar_data : getEntityAvatar(conv.peer);
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
      const deviceBadge = conv.type === 'dm' && conv.peer ? `<span class="device-badge">${getDeviceBadge(conv.peer)}</span>` : '';
      const activeClass = conv.id === state.activeConvId ? 'active' : '';

      return `<div class="list-item ${activeClass}" data-conv-id="${escapeHtml(conv.id)}">
        ${renderAvatarHtml(title, avatarData, '')}
        <div class="item-body">
          <div class="item-top">
            <span class="item-title">${isOnline ? '<span class="dot online"></span>' : ''}${deviceBadge}<span>${escapeHtml(title)}</span></span>
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
    if (!state.splitView && state.tab !== 'chats') {
      switchTab('chats');
    }
    const threadActiveEl = document.getElementById('thread-active-content');
    if (threadActiveEl) {
      threadActiveEl.classList.remove('hidden');
    }
    document.getElementById('tab-chats').classList.add('has-active-conv');
    renderConversations();
    updateThreadHeader();
    await loadMessages({ scrollToBottom: true });
    apiFetch('/api/conversations/' + encodeURIComponent(convId) + '/read', { method: 'POST' }).catch(() => {});
  }

  function closeConversationMobile() {
    state.activeConvId = null;
    document.getElementById('tab-chats').classList.remove('has-active-conv');
    renderConversations();
  }

  function updateThreadHeader() {
    const conv = state.conversations.find((c) => c.id === state.activeConvId);
    if (!conv) return;
    const title = getConvTitle(conv);
    const titleEl = document.getElementById('thread-title');
    if (conv.type === 'dm' && conv.peer) {
      titleEl.innerHTML = `<span class="device-badge">${getDeviceBadge(conv.peer)}</span><span>${escapeHtml(title)}</span>`;
    } else {
      titleEl.textContent = title;
    }

    const av = document.getElementById('thread-avatar');
    const avatarData = conv.type === 'group' ? conv.avatar_data : getEntityAvatar(conv.peer);
    setAvatarElement(av, title, avatarData);

    const typingUsers = state.typingMap[conv.id] || [];
    const sub = document.getElementById('thread-subtitle');
    if (typingUsers.length > 0) {
      sub.textContent = t('typing');
    } else if (conv.type === 'dm' && conv.peer) {
      const statusTxt = conv.peer.status === 'online' ? t('online') : t('offline');
      sub.textContent = statusTxt + ' • ' + getDeviceLabel(conv.peer);
    } else {
      sub.textContent = (conv.members ? conv.members.length : 0) + ' ' + t('membersCount');
    }
  }

  // =========================================================================
  // Messages, Grouping, Context Menu & Touch Gestures
  // =========================================================================

  async function loadMessages(opts) {
    if (!state.activeConvId) return;
    const options = opts || {};
    const search = (document.getElementById('msg-search-input').value || '').trim();
    const url = '/api/messages/' + encodeURIComponent(state.activeConvId) + (search ? '?search=' + encodeURIComponent(search) : '');
    const res = await apiFetch(url);
    state.messages = res.messages || [];
    renderMessages(options);
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
    if (msg.type === 'vault_link' || msg.vault_link_path) return '🔗 ' + t('vaultLinkLabel');
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
    const senderName = msg.sender_name || (state.identity && msg.sender_uuid === state.identity.uuid ? getEntityName(state.identity) : 'Peer');
    document.getElementById('reply-banner-author').textContent = senderName;
    document.getElementById('reply-banner-snippet').textContent = describeReplySnippet(msg);
    banner.classList.remove('hidden');
    document.getElementById('composer-input').focus();
  }

  function buildContextMenuNodes(msgObj, onDone) {
    const myUuid = state.identity ? state.identity.uuid : '';
    const isMe = msgObj.sender_uuid === myUuid;
    const isDeleted = Boolean(msgObj.is_deleted || msgObj.deleted_at);

    const frag = document.createDocumentFragment();

    // Emoji reaction strip
    const emojiStrip = document.createElement('div');
    emojiStrip.className = 'ctx-emoji-strip';
    REACTION_EMOJIS.forEach((em) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ctx-emoji-btn';
      btn.textContent = em;
      btn.addEventListener('click', async () => {
        onDone();
        await toggleReaction(msgObj.id, em);
      });
      emojiStrip.appendChild(btn);
    });
    frag.appendChild(emojiStrip);

    const addAction = (icon, label, handler, isDanger) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ctx-action-btn' + (isDanger ? ' danger' : '');
      btn.innerHTML = `<span>${icon}</span><span>${escapeHtml(label)}</span>`;
      btn.addEventListener('click', () => {
        onDone();
        handler();
      });
      frag.appendChild(btn);
    };

    if (!isDeleted) {
      addAction('↩', t('reply'), () => setReplyTo(msgObj));
      addAction('↪', t('forward'), () => openForwardModal(msgObj));
      const copyPayload = msgObj.body || describeReplySnippet(msgObj);
      if (copyPayload) {
        addAction('📋', t('copyText'), async () => {
          const ok = await copyTextSafe(copyPayload);
          if (ok) showToast(t('copied'));
        });
      }
      if (isMe && msgObj.type === 'text') {
        addAction('✏️', t('edit'), () => openEditMessageModal(msgObj));
      }
      if (isMe) {
        addAction('🗑️', t('deleteMsg'), () => deleteMessage(msgObj.id), true);
      }
    }

    return frag;
  }

  function openDesktopContextMenu(coords, msgObj) {
    if (!msgObj || msgObj.is_deleted || msgObj.deleted_at) return;
    closeContextOverlays();
    const menu = document.getElementById('msg-context-menu');
    menu.appendChild(buildContextMenuNodes(msgObj, closeContextOverlays));
    menu.classList.remove('hidden');

    // Measure & clamp cleanly inside viewport
    menu.style.left = '0px';
    menu.style.top = '0px';
    const rect = menu.getBoundingClientRect();
    const pad = 10;
    let left = coords.x;
    let top = coords.y;
    if (left + rect.width > window.innerWidth - pad) {
      left = Math.max(pad, window.innerWidth - rect.width - pad);
    }
    if (top + rect.height > window.innerHeight - pad) {
      top = Math.max(pad, window.innerHeight - rect.height - pad);
    }
    left = Math.max(pad, left);
    top = Math.max(pad, top);
    menu.style.left = left + 'px';
    menu.style.top = top + 'px';
  }

  function openMobileBottomSheet(msgObj) {
    if (!msgObj || msgObj.is_deleted || msgObj.deleted_at) return;
    closeContextOverlays();
    const backdrop = document.getElementById('bottom-sheet-backdrop');
    const sheet = document.getElementById('bottom-sheet');
    const handle = document.createElement('div');
    handle.className = 'sheet-handle';
    sheet.appendChild(handle);
    sheet.appendChild(buildContextMenuNodes(msgObj, closeContextOverlays));
    backdrop.classList.remove('hidden');
  }

  function openEditMessageModal(msgObj) {
    const wrap = document.createElement('form');
    wrap.style.display = 'flex';
    wrap.style.flexDirection = 'column';
    wrap.style.gap = '10px';

    const input = document.createElement('textarea');
    input.className = 'input';
    input.rows = 3;
    input.value = msgObj.body || '';
    wrap.appendChild(input);

    const actions = document.createElement('div');
    actions.style.display = 'flex';
    actions.style.gap = '8px';
    actions.style.justifyContent = 'flex-end';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'btn btn-ghost btn-sm';
    cancelBtn.textContent = t('cancel');
    cancelBtn.addEventListener('click', () => closeModal());

    const saveBtn = document.createElement('button');
    saveBtn.type = 'submit';
    saveBtn.className = 'btn btn-primary btn-sm';
    saveBtn.textContent = t('saveChanges');

    actions.appendChild(cancelBtn);
    actions.appendChild(saveBtn);
    wrap.appendChild(actions);

    wrap.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const body = input.value.trim();
      if (!body) return;
      try {
        await apiFetch('/api/messages/' + encodeURIComponent(msgObj.id), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ body })
        });
        closeModal();
        await loadMessages({ preserveScroll: true });
        await refreshBootstrap();
      } catch (err) {
        showToast(err.message);
      }
    });

    openModal(t('edit'), wrap);
    setTimeout(() => {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }, 30);
  }

  async function deleteMessage(msgId) {
    try {
      await apiFetch('/api/messages/' + encodeURIComponent(msgId), {
        method: 'DELETE'
      });
      await loadMessages({ preserveScroll: true });
      await refreshBootstrap();
    } catch (err) {
      showToast(err.message);
    }
  }

  function openForwardModal(msgObj) {
    const wrap = document.createElement('div');
    wrap.style.display = 'flex';
    wrap.style.flexDirection = 'column';
    wrap.style.gap = '8px';

    const myUuid = state.identity ? state.identity.uuid : '';
    const existingDmPeers = new Set();
    const targets = [];

    for (const conv of state.conversations) {
      if (conv.type === 'dm' && conv.peer) existingDmPeers.add(conv.peer.uuid);
      targets.push({
        kind: 'conv',
        id: conv.id,
        title: getConvTitle(conv),
        avatar: conv.type === 'group' ? conv.avatar_data : getEntityAvatar(conv.peer),
        badge: conv.type === 'dm' && conv.peer ? getDeviceBadge(conv.peer) : '👥'
      });
    }

    for (const p of state.peers) {
      if (p.uuid === myUuid || existingDmPeers.has(p.uuid)) continue;
      targets.push({
        kind: 'peer',
        uuid: p.uuid,
        title: getEntityName(p) || p.uuid.slice(0, 6),
        avatar: getEntityAvatar(p),
        badge: getDeviceBadge(p)
      });
    }

    if (targets.length === 0) {
      wrap.innerHTML = `<div class="muted">${escapeHtml(t('emptyChats'))}</div>`;
      openModal(t('forwardTo'), wrap);
      return;
    }

    const atts = getMessageAttachments(msgObj);
    targets.forEach((target) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'list-item';
      btn.style.width = '100%';
      btn.style.textAlign = 'start';
      btn.innerHTML = `
        ${renderAvatarHtml(target.title, target.avatar, 'sm')}
        <div class="item-body">
          <div class="item-title"><span>${target.badge}</span><span>${escapeHtml(target.title)}</span></div>
        </div>
      `;
      btn.addEventListener('click', async () => {
        try {
          let convId = target.id;
          if (target.kind === 'peer') {
            const dmRes = await apiFetch('/api/conversations/dm', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ peerUuid: target.uuid })
            });
            convId = dmRes.conversation && dmRes.conversation.id;
          }
          if (!convId) return;

          await apiFetch('/api/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              conversationId: convId,
              type: msgObj.type || 'text',
              body: msgObj.body || '',
              attachment: atts[0] || null,
              vault_link_path: msgObj.vault_link_path || null,
              vault_link_is_dir: Boolean(msgObj.vault_link_is_dir),
              forwardedFromId: msgObj.id
            })
          });
          closeModal();
          await refreshBootstrap();
          openConversation(convId);
        } catch (err) {
          showToast(err.message);
        }
      });
      wrap.appendChild(btn);
    });

    openModal(t('forwardTo'), wrap);
  }

  function renderMessages(opts) {
    const options = opts || {};
    const container = document.getElementById('messages-list');
    const wasNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 120;
    const prevScrollTop = container.scrollTop;

    const myUuid = state.identity ? state.identity.uuid : '';
    const activeConv = state.conversations.find((c) => c.id === state.activeConvId);
    const isGroup = activeConv && activeConv.type === 'group';

    container.innerHTML = state.messages.map((msg, idx) => {
      const isMe = msg.sender_uuid === myUuid;
      const isDeleted = Boolean(msg.is_deleted || msg.deleted_at);
      const prevMsg = idx > 0 ? state.messages[idx - 1] : null;
      const nextMsg = idx < state.messages.length - 1 ? state.messages[idx + 1] : null;
      const isFirstInGroup = !prevMsg || prevMsg.sender_uuid !== msg.sender_uuid;
      const isLastInGroup = !nextMsg || nextMsg.sender_uuid !== msg.sender_uuid;

      const atts = getMessageAttachments(msg);
      const vaultLink = getMessageVaultLink(msg);
      const reactions = msg.reactions || [];

      let inner = '';
      if (!isDeleted) {
        inner += `<button class="msg-chevron-btn" type="button" aria-label="Menu">⌄</button>`;
      }

      if (!isMe && isGroup && isFirstInGroup && msg.sender_name) {
        inner += `<div class="msg-sender">${escapeHtml(msg.sender_name)}</div>`;
      }

      if (!isDeleted && (msg.forwarded_from_id || msg.forwardedFromId)) {
        inner += `<div class="msg-forwarded-tag">↪ ${escapeHtml(t('forwardedTag'))}</div>`;
      }

      if (msg.replyTo) {
        inner += `<div class="msg-reply-box">
          <div class="msg-reply-author">${escapeHtml(msg.replyTo.sender_name || '')}</div>
          <div>${escapeHtml(describeReplySnippet(msg.replyTo))}</div>
        </div>`;
      }

      if (isDeleted) {
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

      const editedHtml = (!isDeleted && msg.edited_at)
        ? `<span class="msg-edited-label">${escapeHtml(t('edited'))}</span>`
        : '';

      inner += `<div class="msg-footer">
        ${editedHtml}
        <span>${escapeHtml(formatTime(msg.created_at))}</span>
        ${renderReceipt(msg)}
      </div>`;

      // Reaction counts (rendered ONLY when reactions exist)
      const reactionCounts = {};
      for (const r of reactions) {
        if (!reactionCounts[r.emoji]) reactionCounts[r.emoji] = { count: 0, mine: false };
        reactionCounts[r.emoji].count += 1;
        if (r.peer_uuid === myUuid) reactionCounts[r.emoji].mine = true;
      }
      const reactHtml = Object.entries(reactionCounts).map(([emoji, info]) => {
        return `<button class="react-pill ${info.mine ? 'mine' : ''} js-react-toggle" data-msg-id="${escapeHtml(msg.id)}" data-emoji="${escapeHtml(emoji)}" type="button">${emoji} ${info.count}</button>`;
      }).join('');
      const reactionsRowHtml = reactHtml ? `<div class="msg-reactions">${reactHtml}</div>` : '';

      const groupCls = [
        isFirstInGroup ? 'group-first' : '',
        isLastInGroup ? 'group-end' : 'grouped'
      ].filter(Boolean).join(' ');

      return `<div class="msg-row ${isMe ? 'me' : 'other'} ${groupCls}" data-msg-id="${escapeHtml(msg.id)}">
        <div class="msg-swipe-indicator" aria-hidden="true">↩</div>
        <div class="msg-swipe-wrap">
          <div class="msg-bubble">${inner}</div>
          ${reactionsRowHtml}
        </div>
      </div>`;
    }).join('');

    // Wire Context Menu, Swipe-to-Reply (50px), and Long Press (400ms)
    container.querySelectorAll('.msg-row').forEach((row) => {
      const msgId = row.getAttribute('data-msg-id');
      const msgObj = state.messages.find((m) => m.id === msgId);
      if (!msgObj) return;
      const isDeleted = Boolean(msgObj.is_deleted || msgObj.deleted_at);
      const bubble = row.querySelector('.msg-bubble');
      const swipeWrap = row.querySelector('.msg-swipe-wrap');
      const indicator = row.querySelector('.msg-swipe-indicator');
      const chevronBtn = row.querySelector('.msg-chevron-btn');

      if (chevronBtn && !isDeleted) {
        chevronBtn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          const rect = chevronBtn.getBoundingClientRect();
          openDesktopContextMenu({ x: rect.left, y: rect.bottom + 4 }, msgObj);
        });
      }

      if (bubble) {
        bubble.addEventListener('contextmenu', (ev) => {
          ev.preventDefault();
          if (isDeleted) return;
          if (Date.now() - state.lastTouchTime < 900) {
            return;
          }
          openDesktopContextMenu({ x: ev.clientX, y: ev.clientY }, msgObj);
        });
      }

      if (isDeleted || !bubble || !swipeWrap) return;

      let startX = 0;
      let startY = 0;
      let deltaX = 0;
      let swiping = false;
      let longPressTimer = null;
      let longPressFired = false;

      const cancelLongPress = () => {
        if (longPressTimer) {
          clearTimeout(longPressTimer);
          longPressTimer = null;
        }
      };

      const resetSwipeVisual = () => {
        swipeWrap.style.transition = '';
        swipeWrap.style.transform = '';
        if (indicator) {
          indicator.style.opacity = '0';
          indicator.style.transform = 'translateY(-50%) scale(0.5)';
          indicator.classList.remove('ready');
        }
      };

      row.addEventListener('touchstart', (ev) => {
        if (ev.touches.length !== 1) {
          cancelLongPress();
          return;
        }
        state.lastTouchTime = Date.now();
        startX = ev.touches[0].clientX;
        startY = ev.touches[0].clientY;
        deltaX = 0;
        swiping = false;
        longPressFired = false;

        cancelLongPress();
        longPressTimer = setTimeout(() => {
          longPressTimer = null;
          longPressFired = true;
          state.lastTouchTime = Date.now();
          if (navigator.vibrate) navigator.vibrate(15);
          openMobileBottomSheet(msgObj);
        }, 400);
      }, { passive: true });

      row.addEventListener('touchmove', (ev) => {
        if (ev.touches.length !== 1) {
          cancelLongPress();
          return;
        }
        const dx = ev.touches[0].clientX - startX;
        const dy = ev.touches[0].clientY - startY;

        if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
          cancelLongPress();
        }
        if (longPressFired) return;

        if (!swiping && Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.3) {
          swiping = true;
        }
        if (swiping) {
          deltaX = Math.max(-84, Math.min(84, dx));
          swipeWrap.style.transition = 'none';
          swipeWrap.style.transform = `translateX(${deltaX}px)`;
          if (indicator) {
            const absDx = Math.abs(deltaX);
            const ratio = Math.min(1, absDx / 50);
            if (deltaX >= 0) {
              indicator.style.left = '8px';
              indicator.style.right = 'auto';
            } else {
              indicator.style.right = '8px';
              indicator.style.left = 'auto';
            }
            indicator.style.opacity = String(ratio);
            indicator.style.transform = `translateY(-50%) scale(${0.5 + 0.55 * ratio})`;
            indicator.classList.toggle('ready', absDx >= 50);
          }
        }
      }, { passive: true });

      row.addEventListener('touchend', () => {
        state.lastTouchTime = Date.now();
        cancelLongPress();
        resetSwipeVisual();
        if (!longPressFired && swiping && Math.abs(deltaX) >= 50) {
          if (navigator.vibrate) navigator.vibrate(15);
          setReplyTo(msgObj);
        }
        swiping = false;
        deltaX = 0;
      });

      row.addEventListener('touchcancel', () => {
        cancelLongPress();
        resetSwipeVisual();
        swiping = false;
        deltaX = 0;
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

    if (options.scrollToBottom || (!options.preserveScroll && wasNearBottom)) {
      container.scrollTop = container.scrollHeight;
    } else if (options.preserveScroll) {
      container.scrollTop = prevScrollTop;
    }
  }

  function playVoiceNote(msgId, blobId, fileName, boxEl) {
    if (state.activeAudio && state.activeAudioId === msgId) {
      state.activeAudio.pause();
      state.activeAudio = null;
      state.activeAudioId = null;
      renderMessages({ preserveScroll: true });
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
      renderMessages({ preserveScroll: true });
    };
    audio.ontimeupdate = () => {
      if (!boxEl || !audio.duration) return;
      const bars = boxEl.querySelectorAll('.voice-bar');
      const ratio = audio.currentTime / audio.duration;
      const activeCount = Math.round(ratio * bars.length);
      bars.forEach((b, i) => b.classList.toggle('active', i < activeCount));
    };
    audio.play().catch((err) => showToast(err.message));
    renderMessages({ preserveScroll: true });
  }

  async function toggleReaction(msgId, emoji) {
    try {
      await apiFetch('/api/messages/' + encodeURIComponent(msgId) + '/reaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emoji })
      });
      await loadMessages({ preserveScroll: true });
    } catch (err) {
      showToast(err.message);
    }
  }

  function emitTypingStatus(isTyping) {
    if (!state.activeConvId || !state.token) return;
    apiFetch('/api/conversations/' + encodeURIComponent(state.activeConvId) + '/typing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isTyping: Boolean(isTyping) })
    }).catch(() => {});
  }

  async function sendTextMessage(e) {
    e.preventDefault();
    const input = document.getElementById('composer-input');
    const text = input.value.trim();
    if (!text || !state.activeConvId) return;
    input.value = '';
    const replyToId = state.replyTo ? state.replyTo.id : null;
    setReplyTo(null);
    if (state.typingStopTimer) {
      clearTimeout(state.typingStopTimer);
      state.typingStopTimer = null;
    }
    emitTypingStatus(false);

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
      await loadMessages({ scrollToBottom: true });
      await refreshBootstrap();
    } catch (err) {
      showToast(err.message);
    }
  }

  function openChatFileCaptionModal(file) {
    if (!file || !state.activeConvId) return;
    const wrap = document.createElement('form');
    wrap.style.display = 'flex';
    wrap.style.flexDirection = 'column';
    wrap.style.gap = '10px';

    const info = document.createElement('div');
    info.className = 'att-card';
    info.innerHTML = `<div class="att-name">📄 ${escapeHtml(file.name)}</div><div class="att-meta">${escapeHtml(formatBytes(file.size))}</div>`;
    wrap.appendChild(info);

    const capInput = document.createElement('input');
    capInput.type = 'text';
    capInput.className = 'input';
    capInput.placeholder = t('captionPrompt');
    wrap.appendChild(capInput);

    const btnRow = document.createElement('div');
    btnRow.style.display = 'flex';
    btnRow.style.gap = '8px';
    btnRow.style.justifyContent = 'flex-end';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'btn btn-ghost btn-sm';
    cancelBtn.textContent = t('cancel');
    cancelBtn.addEventListener('click', () => closeModal());

    const sendBtn = document.createElement('button');
    sendBtn.type = 'submit';
    sendBtn.className = 'btn btn-primary btn-sm';
    sendBtn.textContent = t('send');

    btnRow.appendChild(cancelBtn);
    btnRow.appendChild(sendBtn);
    wrap.appendChild(btnRow);

    wrap.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const caption = capInput.value.trim();
      closeModal();
      const form = new FormData();
      form.append('conversationId', state.activeConvId);
      form.append('caption', caption);
      if (state.replyTo) form.append('replyToId', state.replyTo.id);
      form.append('file', file, file.name);
      setReplyTo(null);
      try {
        await apiFetch('/api/chat/upload', { method: 'POST', body: form });
        await loadMessages({ scrollToBottom: true });
        await refreshBootstrap();
      } catch (err) {
        showToast(err.message);
      }
    });

    openModal(t('attachModalTitle'), wrap);
    setTimeout(() => capInput.focus(), 30);
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
        state.recTimerId = null;
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
          await loadMessages({ scrollToBottom: true });
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

    const myUuid = state.identity ? state.identity.uuid : '';
    const selected = new Set();
    state.peers.filter((p) => p.uuid !== myUuid).forEach((p) => {
      const row = document.createElement('label');
      row.className = 'list-item';
      const name = getEntityName(p) || p.uuid;
      const badge = getDeviceBadge(p);
      row.innerHTML = `<input type="checkbox" value="${escapeHtml(p.uuid)}" />
        ${renderAvatarHtml(name, getEntityAvatar(p), 'sm')}
        <span class="device-badge">${badge}</span>
        <span>${escapeHtml(name)}</span>`;
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

  // =========================================================================
  // Vault File Manager
  // =========================================================================

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
            } catch (_) {
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
        if (state.tab === 'files' || state.splitView) {
          loadVaultList(state.vaultPath).catch(() => {});
        }
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
      const sub = item.is_dir ? t('folderLabel') : formatBytes(item.size);
      const dlHref = `/api/vault/download?path=${encodeURIComponent(item.rel_path)}&token=${encodeURIComponent(state.token)}`;

      return `<div class="list-item" data-rel-path="${escapeHtml(item.rel_path)}" data-is-dir="${item.is_dir ? '1' : '0'}">
        <div class="avatar sm">${icon}</div>
        <div class="item-body">
          <div class="item-top">
            <span class="item-title">${escapeHtml(item.name)}${lockBadge}</span>
            ${presHtml}
          </div>
          <div class="item-sub">${escapeHtml(sub)}</div>
        </div>
        <div class="vault-row-actions">
          <a class="icon-btn sm js-vault-dl" href="${dlHref}" target="_blank" rel="noopener" title="${escapeHtml(t('download'))}">⬇</a>
        </div>
      </div>`;
    }).join('');

    listEl.querySelectorAll('.js-vault-dl').forEach((a) => {
      a.addEventListener('click', (ev) => ev.stopPropagation());
    });

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

  function openNewVaultFolderModal() {
    const wrap = document.createElement('form');
    wrap.style.display = 'flex';
    wrap.style.flexDirection = 'column';
    wrap.style.gap = '10px';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'input';
    input.placeholder = t('newFolderName');
    wrap.appendChild(input);

    const btn = document.createElement('button');
    btn.type = 'submit';
    btn.className = 'btn btn-primary';
    btn.textContent = t('create');
    wrap.appendChild(btn);

    wrap.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const name = input.value.trim();
      if (!name) return;
      try {
        await apiFetch('/api/vault/folder', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ parentPath: state.vaultPath || '', name })
        });
        closeModal();
        showToast(t('folderCreated'));
        await loadVaultList(state.vaultPath);
      } catch (err) {
        if (err.data && err.data.code === 'LOCKED') {
          closeModal();
          const blockRel = (err.data.blockingAncestor && err.data.blockingAncestor.relPath) || state.vaultPath;
          promptVaultUnlock(blockRel, () => openNewVaultFolderModal());
        } else if (err.status === 403) {
          showToast(t('noWritePerm'));
        } else {
          showToast(err.message);
        }
      }
    });

    openModal(t('newFolder'), wrap);
    setTimeout(() => input.focus(), 30);
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
    if (!state.splitView) {
      switchTab('files');
    }
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

  // =========================================================================
  // Bootstrap & WebSocket
  // =========================================================================

  async function refreshBootstrap() {
    const data = await apiFetch('/api/bootstrap');
    state.identity = data.identity;
    if (data.mode) state.mode = data.mode;
    state.peers = data.peers || [];
    state.conversations = data.conversations || [];
    state.presenceMap = data.presenceMap || {};
    hidePortalAuthView();
    updateAccountBadges();
    renderQuickPeers();
    renderConversations();
    if (state.activeConvId) updateThreadHeader();
  }

  function connectWebSocket() {
    if (!state.token) return;
    if (state.wsReconnectTimer) {
      clearTimeout(state.wsReconnectTimer);
      state.wsReconnectTimer = null;
    }
    if (state.ws) {
      try {
        state.ws.onclose = null;
        state.ws.close();
      } catch (_) {}
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
        handleSessionInvalid(t('sessionExpiredBanner'));
        return;
      }
      if (state.token) {
        state.wsReconnectTimer = setTimeout(connectWebSocket, 2500);
      }
    };

    ws.onmessage = (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch (_) { return; }
      const { event, data } = msg;
      if (event === 'chat:message' || event === 'chat:edit' || event === 'chat:delete' || event === 'chat:reaction' || event === 'chat:receipt') {
        refreshBootstrap().catch(() => {});
        const msgConvId = data && (data.conversation_id || data.conversationId || (data.message && data.message.conversation_id));
        if (state.activeConvId && (!msgConvId || msgConvId === state.activeConvId)) {
          const isNewMsg = event === 'chat:message';
          loadMessages({ scrollToBottom: isNewMsg, preserveScroll: !isNewMsg }).catch(() => {});
          if (isNewMsg && data && data.sender_uuid && state.identity && data.sender_uuid !== state.identity.uuid) {
            apiFetch('/api/conversations/' + encodeURIComponent(state.activeConvId) + '/read', { method: 'POST' }).catch(() => {});
          }
        }
      } else if (event === 'chat:typing' && data) {
        const cid = data.conversationId || data.conversation_id;
        const myUuid = state.identity ? state.identity.uuid : '';
        if (cid && data.peerUuid !== myUuid) {
          state.typingMap[cid] = data.isTyping ? [data.peerUuid] : [];
          if (state.typingTimers[cid]) clearTimeout(state.typingTimers[cid]);
          if (data.isTyping) {
            state.typingTimers[cid] = setTimeout(() => {
              state.typingMap[cid] = [];
              if (cid === state.activeConvId) updateThreadHeader();
            }, 4000);
          }
          if (cid === state.activeConvId) updateThreadHeader();
        }
      } else if (event === 'peers:changed' || event === 'conversations:changed' || event === 'presence:changed') {
        refreshBootstrap().catch(() => {});
        if (state.tab === 'files' || state.splitView) renderVaultItems();
        if (!document.getElementById('portal-auth-view').classList.contains('hidden')) {
          loadAuthAccounts();
        }
      } else if (event === 'vault:changed') {
        if (state.tab === 'files' || state.splitView) loadVaultList(state.vaultPath).catch(() => {});
      }
    };
  }

  // =========================================================================
  // Event Listeners & Boot
  // =========================================================================

  function toggleLang() {
    state.lang = state.lang === 'ar' ? 'en' : 'ar';
    applyThemeAndLang();
    renderAuthAccounts();
    updateAccountBadges();
    renderConversations();
    if (state.activeConvId) {
      updateThreadHeader();
      renderMessages({ preserveScroll: true });
    }
    renderBreadcrumbs();
    renderVaultItems();
  }

  function toggleTheme() {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    applyThemeAndLang();
  }

  function init() {
    readInitialParams();
    applyThemeAndLang();
    renderRegColorSwatches();
    updateRegAvatarPreview();

    // Language, Theme & UI Switch toggles (both Top Bar and Portal Auth View)
    document.getElementById('btn-lang').addEventListener('click', toggleLang);
    document.getElementById('portal-btn-lang').addEventListener('click', toggleLang);
    document.getElementById('btn-theme').addEventListener('click', toggleTheme);
    document.getElementById('portal-btn-theme').addEventListener('click', toggleTheme);
    document.getElementById('portal-btn-desktop-ui').addEventListener('click', switchToDesktopUi);
    document.getElementById('btn-desktop-ui').addEventListener('click', switchToDesktopUi);

    // Portal Auth tabs & controls
    document.getElementById('auth-tab-login').addEventListener('click', () => switchPortalAuthTab('login'));
    document.getElementById('auth-tab-register').addEventListener('click', () => switchPortalAuthTab('register'));
    document.getElementById('portal-account-search').addEventListener('input', renderAuthAccounts);
    document.getElementById('btn-refresh-accounts').addEventListener('click', loadAuthAccounts);

    document.getElementById('btn-toggle-login-pin').addEventListener('click', () => {
      const inp = document.getElementById('login-pin-input');
      inp.type = inp.type === 'password' ? 'text' : 'password';
    });
    document.getElementById('portal-pin-form').addEventListener('submit', handlePortalLogin);
    document.getElementById('btn-open-forgot-pin').addEventListener('click', openForgotPinPanel);
    document.getElementById('btn-back-to-pin').addEventListener('click', () => {
      document.getElementById('portal-recovery-panel').classList.add('hidden');
      document.getElementById('portal-login-panel').classList.remove('hidden');
    });
    document.getElementById('btn-rec-method-qa').addEventListener('click', () => {
      authState.recoveryMethod = 'security_qa';
      updateRecoveryMethodFields();
    });
    document.getElementById('btn-rec-method-code').addEventListener('click', () => {
      authState.recoveryMethod = 'recovery_code';
      updateRecoveryMethodFields();
    });
    document.getElementById('portal-recovery-panel').addEventListener('submit', handleRecoverPinSubmit);

    // Registration controls
    document.getElementById('reg-name-input').addEventListener('input', updateRegAvatarPreview);
    document.getElementById('btn-reg-upload-photo').addEventListener('click', () => {
      document.getElementById('reg-photo-input').click();
    });
    document.getElementById('reg-photo-input').addEventListener('change', (ev) => {
      const file = ev.target.files && ev.target.files[0];
      ev.target.value = '';
      if (file) handleRegPhotoChange(file);
    });
    document.getElementById('btn-reg-clear-photo').addEventListener('click', () => {
      authState.regHasPhoto = false;
      authState.regAvatar = 'color:#4F46E5';
      document.getElementById('btn-reg-clear-photo').classList.add('hidden');
      renderRegColorSwatches();
      updateRegAvatarPreview();
    });
    document.getElementById('reg-sec-q-select').addEventListener('change', (ev) => {
      document.getElementById('reg-sec-q-custom').classList.toggle('hidden', ev.target.value !== 'custom');
    });
    document.getElementById('btn-toggle-reg-answer').addEventListener('click', () => {
      const inp = document.getElementById('reg-sec-a-input');
      inp.type = inp.type === 'password' ? 'text' : 'password';
    });
    document.getElementById('portal-register-pane').addEventListener('submit', handlePortalRegister);

    // Quick Link fallback
    document.getElementById('btn-apply-token').addEventListener('click', () => {
      const val = document.getElementById('manual-token-input').value.trim();
      if (!val) return;
      state.token = val;
      state.mode = 'linked';
      document.getElementById('manual-token-input').value = '';
      boot();
    });

    // Switch Account / Logout
    document.getElementById('btn-switch-account-top').addEventListener('click', logoutAndSwitchAccount);
    document.getElementById('btn-switch-account-rail').addEventListener('click', logoutAndSwitchAccount);

    // Navigation (Bottom Nav + Desktop Rail)
    document.getElementById('nav-chats').addEventListener('click', () => switchTab('chats'));
    document.getElementById('nav-files').addEventListener('click', () => switchTab('files'));
    document.getElementById('rail-chats').addEventListener('click', () => {
      if (state.splitView) toggleSplitView();
      switchTab('chats');
    });
    document.getElementById('rail-files').addEventListener('click', () => {
      if (state.splitView) toggleSplitView();
      switchTab('files');
    });
    document.getElementById('rail-split').addEventListener('click', toggleSplitView);

    // Chats & Thread controls
    document.getElementById('conv-search').addEventListener('input', renderConversations);
    document.getElementById('btn-new-group').addEventListener('click', openNewGroupModal);
    document.getElementById('btn-back-chats').addEventListener('click', closeConversationMobile);
    document.getElementById('btn-thread-search').addEventListener('click', () => {
      document.getElementById('thread-search-bar').classList.toggle('hidden');
    });
    document.getElementById('msg-search-input').addEventListener('input', () => loadMessages({ preserveScroll: true }).catch(() => {}));
    document.getElementById('btn-cancel-reply').addEventListener('click', () => setReplyTo(null));
    document.getElementById('composer-form').addEventListener('submit', sendTextMessage);

    document.getElementById('composer-input').addEventListener('input', () => {
      if (!state.activeConvId) return;
      const now = Date.now();
      if (now - state.lastTypingSentAt > 1400) {
        state.lastTypingSentAt = now;
        emitTypingStatus(true);
      }
      if (state.typingStopTimer) clearTimeout(state.typingStopTimer);
      state.typingStopTimer = setTimeout(() => emitTypingStatus(false), 2000);
    });

    document.getElementById('btn-attach-file').addEventListener('click', () => {
      document.getElementById('chat-file-input').click();
    });
    document.getElementById('chat-file-input').addEventListener('change', (ev) => {
      const file = ev.target.files && ev.target.files[0];
      ev.target.value = '';
      if (file) openChatFileCaptionModal(file);
    });

    document.getElementById('btn-voice-rec').addEventListener('click', startVoiceRecording);
    document.getElementById('btn-rec-cancel').addEventListener('click', () => stopVoiceRecording(true));
    document.getElementById('btn-rec-send').addEventListener('click', () => stopVoiceRecording(false));

    // Vault controls
    document.getElementById('vault-search-input').addEventListener('input', (ev) => {
      state.vaultSearchQuery = ev.target.value;
      loadVaultList(state.vaultPath);
    });
    document.getElementById('btn-vault-new-folder').addEventListener('click', openNewVaultFolderModal);
    document.getElementById('btn-vault-upload').addEventListener('click', () => {
      document.getElementById('vault-upload-input').click();
    });
    document.getElementById('vault-upload-input').addEventListener('change', (ev) => {
      const file = ev.target.files && ev.target.files[0];
      ev.target.value = '';
      if (file) handleVaultUpload(file);
    });

    // Global overlays & modals close handlers
    document.getElementById('modal-close').addEventListener('click', () => closeModal(false));
    document.getElementById('modal-backdrop').addEventListener('click', (ev) => {
      if (ev.target.id === 'modal-backdrop') closeModal(false);
    });
    document.getElementById('bottom-sheet-backdrop').addEventListener('click', (ev) => {
      if (ev.target.id === 'bottom-sheet-backdrop') closeContextOverlays();
    });
    document.addEventListener('click', (ev) => {
      const menu = document.getElementById('msg-context-menu');
      if (!menu.classList.contains('hidden') && !menu.contains(ev.target) && !ev.target.closest('.msg-chevron-btn')) {
        closeContextOverlays();
      }
    });
    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') {
        closeContextOverlays();
        closeModal(false);
      }
    });

    boot();
  }

  async function boot() {
    if (!state.token) {
      showPortalAuthView();
      return;
    }
    try {
      await refreshBootstrap();
      connectWebSocket();
    } catch (_) {
      handleSessionInvalid(t('sessionExpiredBanner'));
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
