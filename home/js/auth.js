const AUTH = {
  CLIENT_ID: '819164879021-10qcb700t7vpt5l1qhff7id63pkfve9e.apps.googleusercontent.com',
  SCOPES: 'https://www.googleapis.com/auth/spreadsheets',
  accessToken: null,
  _refreshTimer: null,
  _refreshing: false,

  // ══════════════════════════════════════════
  // 初始化：優先用 refresh token 靜默登入
  // ══════════════════════════════════════════
  async init() {
    this._bindVisibility();
    const ok = await this._silentRefresh();
    if (ok) {
      APP.onAuthSuccess();
    }
    // 沒有 refresh token → 顯示登入畫面（等用戶點登入）
  },

  // ══════════════════════════════════════════
  // 用戶點「Google 登入」→ Authorization Code flow
  // ══════════════════════════════════════════
  signIn() {
    // 產生隨機 state，存 sessionStorage，防止 CSRF
    const state = Math.random().toString(36).slice(2) + Date.now().toString(36);
    sessionStorage.setItem('oauth_state', state);
    const params = new URLSearchParams({
      client_id:     this.CLIENT_ID,
      redirect_uri:  window.location.origin + '/auth/callback',
      response_type: 'code',
      scope:         this.SCOPES + ' openid email',
      access_type:   'offline',
      prompt:        'consent',
      state,
    });
    window.location.href = 'https://accounts.google.com/o/oauth2/v2/auth?' + params;
  },

  // ══════════════════════════════════════════
  // 處理 Google 回調（授權碼換 token）
  // ══════════════════════════════════════════
  async handleCallback() {
    const params = new URLSearchParams(window.location.search);
    const code  = params.get('code');
    const state = params.get('state');
    const error = params.get('error');
    if (error || !code) { window.location.href = '/'; return; }

    // 驗證 state 防 CSRF
    const savedState = sessionStorage.getItem('oauth_state');
    sessionStorage.removeItem('oauth_state');
    if (!savedState || savedState !== state) {
      console.error('OAuth state mismatch');
      window.location.href = '/';
      return;
    }

    try {
      const r = await fetch('/api/oauth', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ code }), // 不傳 redirect_uri，後端自己組
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      this.accessToken = data.access_token;
      this._saveAccess(data.access_token, data.expires_in);
      this._scheduleRefresh(data.expires_in * 1000);
      window.location.replace('/');
    } catch (err) {
      console.error('handleCallback:', err);
      window.location.href = '/';
    }
  },

  // ══════════════════════════════════════════
  // 靜默刷新：先查 localStorage，再呼叫後端 /api/refresh
  // ══════════════════════════════════════════
  async _silentRefresh() {
    if (this._refreshing) return false;
    this._refreshing = true;
    try {
      // 1. localStorage 的 access token 還有效
      const saved = this._loadAccess();
      if (saved) {
        this.accessToken = saved;
        const d = JSON.parse(localStorage.getItem('home_tok') || 'null');
        if (d) this._scheduleRefresh(d.exp - Date.now());
        this._refreshing = false;
        return true;
      }
      // 2. access token 過期 → 後端用 refresh token cookie 換新的
      const r = await fetch('/api/refresh', { method: 'POST' });
      if (!r.ok) { this._refreshing = false; return false; }
      const data = await r.json();
      this.accessToken = data.access_token;
      this._saveAccess(data.access_token, data.expires_in);
      this._scheduleRefresh(data.expires_in * 1000);
      this._refreshing = false;
      return true;
    } catch {
      this._refreshing = false;
      return false;
    }
  },

  // 到期前 5 分鐘自動刷新
  _scheduleRefresh(msUntilExpiry) {
    const delay = Math.max(msUntilExpiry - 5 * 60 * 1000, 10000);
    clearTimeout(this._refreshTimer);
    this._refreshTimer = setTimeout(async () => {
      localStorage.removeItem('home_tok'); // 強制走後端 refresh
      const ok = await this._silentRefresh();
      if (!ok) { this.accessToken = null; APP.showAuthScreen?.(); }
    }, delay);
  },

  // 從背景切回前台時檢查
  _bindVisibility() {
    document.addEventListener('visibilitychange', async () => {
      if (document.visibilityState !== 'visible' || this._refreshing) return;
      const d = JSON.parse(localStorage.getItem('home_tok') || 'null');
      if (!d || d.exp - Date.now() < 5 * 60 * 1000) {
        localStorage.removeItem('home_tok');
        const ok = await this._silentRefresh();
        if (ok) APP.refresh?.();
      }
    });
  },

  // sheets.js 發現 401 時呼叫
  async handleExpired() {
    if (this._refreshing) return;
    this.accessToken = null;
    localStorage.removeItem('home_tok');
    const ok = await this._silentRefresh();
    if (ok) { APP.refresh?.(); }
    else { APP.showAuthScreen?.(); }
  },

  // 登出
  async signOut() {
    clearTimeout(this._refreshTimer);
    await fetch('/api/refresh', { method: 'DELETE' }).catch(() => {});
    this.accessToken = null;
    localStorage.removeItem('home_tok');
    location.reload();
  },

  _saveAccess(token, expiresIn) {
    localStorage.setItem('home_tok', JSON.stringify({ t: token, exp: Date.now() + expiresIn * 1000 }));
  },
  _loadAccess() {
    try {
      const d = JSON.parse(localStorage.getItem('home_tok') || 'null');
      if (!d || Date.now() > d.exp - 60000) { localStorage.removeItem('home_tok'); return null; }
      return d.t;
    } catch { return null; }
  },
  get ok() { return !!this.accessToken; },
};
