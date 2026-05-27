const AUTH = {
  CLIENT_ID: '819164879021-10qcb700t7vpt5l1qhff7id63pkfve9e.apps.googleusercontent.com',
  SCOPES: 'https://www.googleapis.com/auth/spreadsheets',
  tokenClient: null,
  accessToken: null,
  _refreshing: false,
  _lastExpired: 0,

  async init() {
    return new Promise(resolve => {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.onload = () => {
        this.tokenClient = google.accounts.oauth2.initTokenClient({
          client_id: this.CLIENT_ID,
          scope: this.SCOPES,
          callback: resp => {
            if (resp.error) { console.error(resp); return; }
            const isFirstLogin = !this.accessToken;
            this.accessToken = resp.access_token;
            this._save(resp);
            this._scheduleRefresh(resp.expires_in * 1000);
            this._refreshing = false;
            if (isFirstLogin) {
              APP.onAuthSuccess();
            } else {
              APP.refresh();
            }
          }
        });
        this._bindVisibility();
        const saved = this._load();
        if (saved) {
          this.accessToken = saved;
          const d = JSON.parse(localStorage.getItem('home_tok') || 'null');
          if (d) this._scheduleRefresh(d.exp - Date.now());
          APP.onAuthSuccess();
        }
        resolve();
      };
      s.onerror = () => resolve();
      document.head.appendChild(s);
    });
  },

  _scheduleRefresh(msUntilExpiry) {
    const delay = Math.max(msUntilExpiry - 5 * 60 * 1000, 10000);
    clearTimeout(this._refreshTimer);
    this._refreshTimer = setTimeout(() => {
      this.tokenClient?.requestAccessToken({ prompt: '' });
    }, delay);
  },

  handleExpired() {
    const now = Date.now();
    if (this._refreshing || now - this._lastExpired < 15000) return;
    this._refreshing = true;
    this._lastExpired = now;
    this.accessToken = null;
    localStorage.removeItem('home_tok');
    this.tokenClient?.requestAccessToken({ prompt: '' });
  },

  signIn() { this.tokenClient?.requestAccessToken({ prompt: '' }); },

  // ── 從背景切回前台時靜默刷新 token ──
  _bindVisibility() {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return;
      if (this._refreshing) return;
      if (this.accessToken) {
        // token 存在：檢查是否快到期（5分鐘內到期就提前刷）
        const d = JSON.parse(localStorage.getItem('home_tok') || 'null');
        if (d && d.exp - Date.now() < 5 * 60 * 1000) {
          this.tokenClient?.requestAccessToken({ prompt: '' });
        }
      } else {
        // token 不存在：嘗試靜默重新驗證（不彈視窗）
        this.tokenClient?.requestAccessToken({ prompt: '' });
      }
    });
  },

  signOut() {
    if (this.accessToken) google.accounts.oauth2.revoke(this.accessToken);
    this.accessToken = null;
    localStorage.removeItem('home_tok');
    location.reload();
  },

  _save(resp) {
    localStorage.setItem('home_tok', JSON.stringify({ t: resp.access_token, exp: Date.now() + resp.expires_in * 1000 }));
  },
  _load() {
    try {
      const d = JSON.parse(localStorage.getItem('home_tok') || 'null');
      if (!d || Date.now() > d.exp - 60000) { localStorage.removeItem('home_tok'); return null; }
      return d.t;
    } catch { return null; }
  },
  get ok() { return !!this.accessToken; }
};
