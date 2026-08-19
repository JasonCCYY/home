// ── Google Sheets API + LocalStorage Cache ──
const SHEETS = {
  // 加油紀錄App
  GAS_ID: '1o3sbQnpGRf-JbRG6vFsc6SWrNdb6RaXzs572uVNWO4A',
  // In記錄App
  IN_ID:  '1NcM5FPGHCKrldLCxzpMuW0NxudTxLUmaczMQC3Xbh1Q',
  BASE: 'https://sheets.googleapis.com/v4/spreadsheets',

  // Sheet tab names
  GAS: {
    oil:      '油錢',
    stat:     '油錢統計',
    expense:  '開支',
    yearStat: '年度統計',
    maintain: '保養細項',
  },
  IN: {
    data:     'Data',
    options:  '收支選項',
    monthInc: '月Inc.',
    monthExp: '月Exp.',
    balance:  '收支',
    year:     '年',
    estimate: '預估',
    lineChart:'折線圖',
    detail:   '細項分析',
  },

  hdrs() { return { Authorization: `Bearer ${AUTH.accessToken}` }; },

  // ── Cache helpers (stale-while-revalidate) ──
  _FRESH_TTL:  3 * 60 * 1000,   // 3 min: return from cache, no fetch
  _STALE_TTL: 24 * 60 * 60 * 1000, // 24hr: return stale + fetch in background
  saveCache(key, data) {
    try { localStorage.setItem('home_' + key, JSON.stringify({ t: Date.now(), d: data })); } catch(e) {}
  },
  loadCacheRaw(key) {
    try {
      const raw = localStorage.getItem('home_' + key);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      const age = Date.now() - obj.t;
      if (age > this._STALE_TTL) { localStorage.removeItem('home_' + key); return null; }
      return { data: obj.d, fresh: age < this._FRESH_TTL };
    } catch(e) { return null; }
  },
  loadCache(key) {
    const r = this.loadCacheRaw(key);
    return r ? r.data : null;
  },
  clearCache(key) { localStorage.removeItem('home_' + key); },
  clearAllCache() {
    Object.keys(localStorage).filter(k=>k.startsWith('home_')).forEach(k=>localStorage.removeItem(k));
  },
  // ── Migration: clear old caches with wrong ranges ──
  _migrate() {
    const VER = 'v4';
    if (localStorage.getItem('home__ver') !== VER) {
      ['monthInc','monthExp','year'].forEach(k => this.clearCache(k));
      localStorage.setItem('home__ver', VER);
    }
  },

  // ── Core read/write ──
  async read(sheetId, tab, range) {
    const url = `${this.BASE}/${sheetId}/values/${encodeURIComponent(tab + '!' + range)}`;
    const r = await fetch(url, { headers: this.hdrs() });
    if (!r.ok) {
      if (r.status === 401) { AUTH.handleExpired(); throw new Error('登入過期，重新驗證中'); }
      throw new Error(`讀取失敗(${r.status}): ${tab}`);
    }
    return (await r.json()).values || [];
  },

  async append(sheetId, tab, rows) {
    const url = `${this.BASE}/${sheetId}/values/${encodeURIComponent(tab + '!A1')}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
    const r = await fetch(url, { method: 'POST', headers: { ...this.hdrs(), 'Content-Type': 'application/json' }, body: JSON.stringify({ values: rows }) });
    if (!r.ok) {
      if (r.status === 401) { AUTH.handleExpired(); throw new Error('登入過期，重新驗證中'); }
      throw new Error(`寫入失敗(${r.status}): ${tab}`);
    }
    return r.json();
  },

  async put(sheetId, range, values) {
    const url = `${this.BASE}/${sheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`;
    const r = await fetch(url, { method: 'PUT', headers: { ...this.hdrs(), 'Content-Type': 'application/json' }, body: JSON.stringify({ values }) });
    if (!r.ok) {
      if (r.status === 401) { AUTH.handleExpired(); throw new Error('登入過期，重新驗證中'); }
      throw new Error(`更新失敗(${r.status})`);
    }
    return r.json();
  },

  async clearRow(sheetId, tab, row, c1, c2) {
    const url = `${this.BASE}/${sheetId}/values/${encodeURIComponent(tab+'!'+c1+row+':'+c2+row)}:clear`;
    const r = await fetch(url, { method: 'POST', headers: { ...this.hdrs(), 'Content-Type': 'application/json' } });
    if (!r.ok) throw new Error(`刪除失敗(${r.status})`);
    return r.json();
  },

  uid() { return Math.random().toString(36).substring(2, 10); },
  // Convert date string (2026/08/11 or 2026-08-11) to a DATE() formula.
  // With USER_ENTERED, =DATE() auto-applies date format to the cell — no serial display issue.
  _dateFml(s) {
    const p = String(s).split(/[\/\-]/);
    if (p.length !== 3) return s;
    return `=DATE(${+p[0]},${+p[1]},${+p[2]})`;
  },
  nowDate() {
    const n = new Date();
    return `${n.getFullYear()}/${n.getMonth()+1}/${n.getDate()}`;
  },
  nowMonth() {
    const n = new Date();
    return `${n.getFullYear()}/${String(n.getMonth()+1).padStart(2,'0')}`;
  },

  // ── Cached loader helper ──
  async cached(key, loader) {
    const entry = this.loadCacheRaw(key);
    if (entry) {
      if (!entry.fresh) {
        // Stale: show immediately + refresh in background silently
        loader().then(d => this.saveCache(key, d)).catch(() => {});
      }
      return entry.data; // Always return cached data instantly
    }
    // No cache: must fetch and wait
    const data = await loader();
    this.saveCache(key, data);
    return data;
  },

  // ════════════════════════════════════════
  // 加油紀錄 Loaders
  // ════════════════════════════════════════

  async loadOilRecords() {
    const load = async () => {
      const rows = await this.read(this.GAS_ID, this.GAS.oil, 'A2:M500');
      return rows.map((r,i)=>!r[0]?null:{
        _row: i+2,
        date: r[0]||'', actual: r[1]||'', daily: r[2]||'',
        selfDisc: r[3]||'', cardDisc: r[4]||'', totalDisc: r[5]||'',
        liters: r[6]||'', totalKm: r[7]||'', km: r[8]||'',
        efficiency: r[9]||'', costPerKm: r[10]||'', discPerL: r[11]||'',
        plan: r[12]||''
      }).filter(Boolean).reverse();
    };
    return this.cached('oil', load);
  },

  async loadOilStat() {
    const load = async () => {
      const rows = await this.read(this.GAS_ID, this.GAS.stat, 'A1:G14');
      return rows;
    };
    return this.cached('oilStat', load);
  },

  async loadGasExpense() {
    const load = async () => {
      const rows = await this.read(this.GAS_ID, this.GAS.expense, 'A2:F50');
      return rows.map((r,i)=>!r[0]?null:{
        _row: i+2,
        date: r[0]||'', cat: r[1]||'', item: r[2]||'',
        amount: r[3]||'', note: r[4]||'', mileage: r[5]||''
      }).filter(Boolean).reverse();
    };
    return this.cached('gasExp', load);
  },

  async loadYearStat() {
    const load = async () => {
      const rows = await this.read(this.GAS_ID, this.GAS.yearStat, 'A1:J15');
      return rows;
    };
    return this.cached('yearStat', load);
  },

  async loadMaintain() {
    const load = async () => {
      const rows = await this.read(this.GAS_ID, this.GAS.maintain, 'A2:E30');
      return rows.map((r,i)=>!r[0]?null:{
        _row: i+2,
        date: r[0]||'', item: r[1]||'', amount: r[2]||'',
        note: r[3]||'', mileage: r[4]||''
      }).filter(Boolean).reverse();
    };
    return this.cached('maintain', load);
  },

  // ════════════════════════════════════════
  // 收支記錄 Loaders
  // ════════════════════════════════════════

  async loadData() {
    const load = async () => {
      const rows = await this.read(this.IN_ID, this.IN.data, 'A2:F2000');
      return rows.map((r,i)=>!r[0]?null:{
        _row: i+2,
        date: r[0]||'', amount: r[1]||'', io: r[2]||'',
        item: r[3]||'', note: r[4]||'',
        counted: r[5]||'TRUE'
      }).filter(Boolean).reverse();
    };
    return this.cached('data', load);
  },

  async loadOptions() {
    const load = async () => {
      const rows = await this.read(this.IN_ID, this.IN.options, 'A2:C50');
      return rows.filter(r=>r[0]).map(r=>({
        io: r[0]||'', item: r[1]||'', note: r[2]||''
      }));
    };
    return this.cached('options', load);
  },

  async loadMonthInc() {
    const load = async () => {
      const rows = await this.read(this.IN_ID, this.IN.monthInc, 'A1:J50');
      return rows;
    };
    return this.cached('monthInc', load);
  },

  async loadMonthExp() {
    const load = async () => {
      const rows = await this.read(this.IN_ID, this.IN.monthExp, 'A1:P50');
      return rows;
    };
    return this.cached('monthExp', load);
  },

  async loadBalance() {
    const load = async () => {
      const rows = await this.read(this.IN_ID, this.IN.balance, 'A2:D50');
      return rows.filter(r=>r[0]&&r[1]).map(r=>({
        month: r[0]||'', inc: r[1]||'', exp: r[2]||'', bal: r[3]||''
      }));
    };
    return this.cached('balance', load);
  },

  async loadYear() {
    const load = async () => {
      const rows = await this.read(this.IN_ID, this.IN.year, 'A1:C30');
      return rows;
    };
    return this.cached('year', load);
  },

  async loadEstimate() {
    const load = async () => {
      const rows = await this.read(this.IN_ID, this.IN.estimate, 'A2:F20');
      return rows.filter(r=>r[0]).map(r=>({
        month: r[0]||'', material: r[1]||'', zhongzheng: r[2]||'',
        clinic: r[3]||'', youchang: r[4]||'', estimate: r[5]||''
      }));
    };
    return this.cached('estimate', load);
  },

  async loadLineChart() {
    const load = async () => {
      const rows = await this.read(this.IN_ID, this.IN.lineChart, 'A1:C30');
      return rows;
    };
    return this.cached('lineChart', load);
  },

  async loadDetailAnalysis() {
    const load = async () => {
      const rows = await this.read(this.IN_ID, this.IN.detail, 'A2:E30');
      return rows;
    };
    return this.cached('detailAna', load);
  },

  // ════════════════════════════════════════
  // Writers
  // ════════════════════════════════════════

  // 新增收支記錄
  async addData(d) {
    const row = [this._dateFml(d.date), d.amount, d.io, d.item, d.note||'', d.counted!=='FALSE'];
    const r = await this.append(this.IN_ID, this.IN.data, [row]);
    this.clearCache('data');
    return r;
  },

  // 更新收支記錄
  async updateData(row, d) {
    await this.put(this.IN_ID, `${this.IN.data}!A${row}:F${row}`, [[this._dateFml(d.date), d.amount, d.io, d.item, d.note||'', d.counted!=='FALSE']]);
    this.clearCache('data');
  },

  // 新增加油記錄
  async addOil(d) {
    const row = [this._dateFml(d.date), d.actual, d.daily, d.selfDisc||'', d.cardDisc||'', d.totalDisc||'',
                 d.liters||'', d.totalKm||'', d.km||'', d.efficiency||'', d.costPerKm||'', d.discPerL||'', d.plan||''];
    const r = await this.append(this.GAS_ID, this.GAS.oil, [row]);
    this.clearCache('oil');
    return r;
  },

  // 更新加油記錄
  async updateOil(row, d) {
    await this.put(this.GAS_ID, `${this.GAS.oil}!A${row}:M${row}`,
      [[this._dateFml(d.date), d.actual, d.daily, d.selfDisc||'', d.cardDisc||'', d.totalDisc||'',
        d.liters||'', d.totalKm||'', d.km||'', d.efficiency||'', d.costPerKm||'', d.discPerL||'', d.plan||'']]);
    this.clearCache('oil');
  },

  // 新增開支
  async addGasExpense(d) {
    const row = [this._dateFml(d.date), d.cat, d.item, d.amount, d.note||'', d.mileage||''];
    const r = await this.append(this.GAS_ID, this.GAS.expense, [row]);
    this.clearCache('gasExp');
    return r;
  },

  // 刪除行（清空）
  async deleteDataRow(row) {
    await this.clearRow(this.IN_ID, this.IN.data, row, 'A', 'F');
    this.clearCache('data');
  },

  async deleteOilRow(row) {
    await this.clearRow(this.GAS_ID, this.GAS.oil, row, 'A', 'M');
    this.clearCache('oil');
  },

  async deleteGasExpRow(row) {
    await this.clearRow(this.GAS_ID, this.GAS.expense, row, 'A', 'F');
    this.clearCache('gasExp');
  },

  async updateGasExpRow(row, r) {
    const vals = [[this._dateFml(r.date), r.cat, r.item, r.amount, r.note||'', r.mileage||'']];
    await this.put(this.GAS_ID, `${this.GAS.expense}!A${row}:F${row}`, vals);
    this.clearCache('gasExp');
  },
};
