// ── Home Record App ──
const APP = {
  tab: 'detail',
  subCar: 'oil',
  subDetail: 'curMonth',
  subOv: 'estInc',
  CAR_SUBS:    ['oil','oilStat','expense','yearStat'],
  DETAIL_SUBS: ['curMonth','prevMonth','familyExp','expAna','stockAna'],
  OV_SUBS:     ['estInc','monthExp','balance','annualSum','lineChart'],
  CAR_PAGES:    { oil:'sp-oil', oilStat:'sp-oilStat', expense:'sp-expense', yearStat:'sp-yearStat' },
  DETAIL_PAGES: { curMonth:'sp-curMonth', prevMonth:'sp-prevMonth', familyExp:'sp-familyExp', expAna:'sp-expAna', stockAna:'sp-stockAna' },
  OV_PAGES:     { estInc:'sp-estInc', monthExp:'sp-monthExp', balance:'sp-balance', annualSum:'sp-annualSum', lineChart:'sp-lineChart' },

  _rowStore: [],
  _rowMap: new Map(),
  _loaded: {},   // track which subs have been loaded this session
  _detailFromSearch: false,
  _oilPlan: '中油自助玉山4.5%',
  _maxOilKm: 0,
  _editOilRow: null,
  _editDataRow: null,
  _dataOpts: [],
  _dataIOSelected: 'Inc.',
  _dataItemSelected: '',
  _dataNoteSelected: '',
  _dataCounted: 'TRUE',
  _expCat: '保養',

  PLANS: {
    '中油自助玉山4.5%': { card: d=>d*0.045, self: l=>l*0.8 },
    '中油自助玉山3.5%': { card: d=>d*0.035, self: l=>l*0.8 },
    '玉山4.5%':         { card: d=>d*0.045, self: l=>0 },
    '玉山3.5%':         { card: d=>d*0.035, self: l=>0 },
    '無':               { card: d=>0,        self: l=>0 },
    '全國自助台新3.3%':  { card: d=>d*0.033, self: l=>l*1.1 },
    '台新3.3%':         { card: d=>d*0.033, self: l=>0 },
  },

  async init() {
    document.getElementById('loading').style.display='flex';
    await AUTH.init();
    this.bindTabs();
    this.bindSubTabs();
    this.bindTabSwipe();
    this.bindDetailSwipe();
    this.bindOvBottomSwipe();
    this.bindCarBottomSwipe();
    this.bindRowClicks();
    document.getElementById('fab').addEventListener('click',()=>this.fabClick());
    document.getElementById('loading').style.display='none';
    if(!AUTH.ok){
      document.getElementById('auth-screen').style.display='flex';
      document.getElementById('app').style.display='none';
    }
  },

  showAuthScreen(){
    document.getElementById('loading').style.display='none';
    document.getElementById('auth-screen').style.display='flex';
    document.getElementById('app').style.display='none';
  },

  onAuthSuccess(){
    document.getElementById('auth-screen').style.display='none';
    document.getElementById('app').style.display='flex';
    SHEETS._migrate(); // clear caches with outdated ranges
    this._setMonthLabels();
    this.switchTab('detail',false);
    // preload other tabs silently in background
    setTimeout(()=>{if(!this._loaded['car_oil'])this._loadCarSub('oil');},1500);
    setTimeout(()=>{if(!this._loaded['ov_estInc'])this._loadOvSub('estInc');},2500);
    setTimeout(()=>this.refresh(),3000);
  },

  refresh(){
    // 只清除當前 Tab 的快取，保留其他 Tab 已預載的資料
    if (this.tab === 'car') {
      const cacheMap = { oil:'oil', oilStat:'oilStat', expense:'gasExp', yearStat:'yearStat' };
      const key = cacheMap[this.subCar];
      if (key) SHEETS.clearCache(key);
      this._loaded['car_' + this.subCar] = false;
      this._loadCarSub(this.subCar);
    } else if (this.tab === 'detail') {
      SHEETS.clearCache('data');
      SHEETS.clearCache('options');
      ['curMonth','prevMonth','familyExp','expAna','stockAna'].forEach(s => this._loaded['det_' + s] = false);
      this._loadDetailSub(this.subDetail);
    } else if (this.tab === 'overview') {
      const cacheMap = { estInc:['estimate','monthInc'], monthExp:'monthExp', balance:'balance', annualSum:'year', lineChart:'lineChart' };
      const keys=[].concat(cacheMap[this.subOv]||[]);
      keys.forEach(k=>SHEETS.clearCache(k));
      this._loaded['ov_' + this.subOv] = false;
      this._loadOvSub(this.subOv);
    }
    // silent refresh - no toast
  },

  // 儲存/刪除後延遲 3 秒刷新統計（只清統計快取，不影響細項）
  _refreshOverviewLater(){
    clearTimeout(this._ovTimer);
    this._ovTimer = setTimeout(() => {
      // 清除所有統計快取
      ['estimate','monthInc','monthExp','balance','year','lineChart'].forEach(k => SHEETS.clearCache(k));
      // 重置已載入旗標
      ['estInc','monthExp','balance','annualSum','lineChart'].forEach(s => this._loaded['ov_' + s] = false);
      // 如果目前在統計 Tab，立即重新載入當前子頁
      if (this.tab === 'overview') this._loadOvSub(this.subOv);
    }, 3000);
  },

  _setMonthLabels(){
    const n=new Date();
    const cur=`${n.getFullYear()}年${n.getMonth()+1}月`;
    const p=new Date(n.getFullYear(),n.getMonth()-1,1);
    const prev=`${p.getFullYear()}年${p.getMonth()+1}月`;
    const lc=document.getElementById('label-curMonth');
    const lp=document.getElementById('label-prevMonth');
    if(lc) lc.textContent=cur;
    if(lp) lp.textContent=prev;
  },

  prevMonthLastDay(){
    const n=new Date(); n.setDate(1); n.setDate(0);
    return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`;
  },

  // ── Helpers ──
  num(v){ return Number(String(v||0).replace(/[,\s\$]/g,'')); },
  fmt(v){
    if(v===''||v===null||v===undefined||v==='-') return '-';
    const n=Number(String(v).replace(/,/g,''));
    return isNaN(n)?String(v):n.toLocaleString();
  },
  fmtM(v){ const f=this.fmt(v); return f==='-'?'-':'$'+f; },
  fmtWan(v){
    // Format as e.g. 39.6 (萬)
    const n=Number(String(v).replace(/,/g,''));
    if(!n) return '-';
    return (n/10000).toFixed(1);
  },
  todayISO(){ return new Date().toISOString().split('T')[0]; },
  nowMonth(){
    const n=new Date();
    return `${n.getFullYear()}/${String(n.getMonth()+1).padStart(2,'0')}`;
  },
  prevMonth(){
    const n=new Date(new Date().getFullYear(),new Date().getMonth()-1,1);
    return `${n.getFullYear()}/${String(n.getMonth()+1).padStart(2,'0')}`;
  },
  getMonth(d){
    const p=String(d).split('/');
    return p.length>=2?p[0]+'/'+p[1].padStart(2,'0'):d.substring(0,7);
  },
  getYear(d){ return String(d).split('/')[0]; },
  groupByMonth(recs){
    const map={};
    recs.forEach(r=>{ const m=this.getMonth(r.date); (map[m]=map[m]||[]).push(r); });
    return Object.entries(map).sort((a,b)=>b[0].localeCompare(a[0]));
  },
  empty(){ return '<div class="empty-state"><div class="empty-icon">📋</div><div>尚無資料</div></div>'; },
  loading(){ return '<div class="load-msg">載入中...</div>'; },
  err(e){ return `<div class="empty-state"><div class="empty-icon">⚠️</div><div>${e.message||'載入失敗'}</div></div>`; },
  _storeRow(r){
    // Use _row number as stable key (won't change between renders)
    const ns=this._storeNS||'x_'; const key=ns+(r._row!==undefined?String(r._row):(r.usageId||r.date||Math.random()));
    this._rowMap.set(key, r);
    return key;
  },
  _clearStore(){
    this._rowStore=[];
    // Only clear current namespace entries (keeps other tabs' data intact)
    const ns=this._storeNS||'x_';
    for(const k of [...this._rowMap.keys()]) if(k.startsWith(ns)) this._rowMap.delete(k);
  },
  _getRow(i){ return this._rowMap.get(String(i)); },

  toast(msg,dur=2200){
    const t=document.getElementById('toast');
    t.textContent=msg; t.classList.add('show');
    clearTimeout(this._toastT);
    this._toastT=setTimeout(()=>t.classList.remove('show'),dur);
  },

  // ── Tab routing ──
  _TAB_IDX:{ car:0, detail:1, overview:2 },

  bindTabs(){
    document.querySelectorAll('.tab-btn').forEach(b=>b.addEventListener('click',()=>this.switchTab(b.dataset.tab)));
  },

  switchTab(tab,animate=true,forceDefault=true){
    this.tab=tab;
    // Reset to default sub-page each time tab is clicked
    if(forceDefault){
      if(tab==='car')      this.subCar='oil';
      if(tab==='detail')   this.subDetail='curMonth';
      if(tab==='overview') this.subOv='estInc';
    }
    document.querySelectorAll('.tab-btn').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));
    document.getElementById('sub-car').style.display    =tab==='car'     ?'flex':'none';
    document.getElementById('sub-detail').style.display =tab==='detail'  ?'flex':'none';
    document.getElementById('sub-ov').style.display     =tab==='overview'?'flex':'none';
    this._updateFab();
    const titles={car:'汽車',detail:'細項',overview:'收支總覽'};
    document.getElementById('hdr-title').textContent=titles[tab]||'Home';
    const inner=document.getElementById('tab-swipe-inner');
    const idx=this._TAB_IDX[tab]??1;
    if(inner){
      if(!animate) inner.style.transition='none';
      inner.style.transform=`translateX(${-idx*100/3}%)`;
      if(!animate) setTimeout(()=>inner.style.transition='',0);
    }
    if      (tab==='car')      this._switchCarSub(this.subCar,true);
    else if (tab==='detail')   this._switchDetailSub(this.subDetail,true);
    else if (tab==='overview') this._switchOvSub(this.subOv,true);
  },

  _updateFab(){
    const fab=document.getElementById('fab');
    const show=(this.tab==='car'&&(this.subCar==='oil'||this.subCar==='expense'))||
               (this.tab==='detail'&&(this.subDetail==='curMonth'||this.subDetail==='prevMonth'));
    fab.style.display=show?'flex':'none';
  },

  bindSubTabs(){
    document.querySelectorAll('#sub-car .sub-tab').forEach(b=>b.addEventListener('click',()=>this._switchCarSub(b.dataset.sub)));
    document.querySelectorAll('#sub-detail .sub-tab').forEach(b=>b.addEventListener('click',()=>this._switchDetailSub(b.dataset.sub)));
    document.querySelectorAll('#sub-ov .sub-tab').forEach(b=>b.addEventListener('click',()=>this._switchOvSub(b.dataset.sub)));
  },

  _showSubPage(pagesMap,sub){
    Object.entries(pagesMap).forEach(([key,id])=>{
      const el=document.getElementById(id);
      if(!el) return;
      if(key===sub){
        el.classList.add('active');
        // Reset scroll position of inner scrollable container
        const scroller=el.querySelector('.scroll-content,.tbl-wrap,.frozen-table-wrap');
        if(scroller) scroller.scrollTop=0;
      } else {
        el.classList.remove('active');
      }
    });
  },

  _switchCarSub(sub,load=true){
    this.subCar=sub;
    document.querySelectorAll('#sub-car .sub-tab').forEach(b=>b.classList.toggle('active',b.dataset.sub===sub));
    this._showSubPage(this.CAR_PAGES,sub);
    this._updateFab();
    if(load && !this._loaded['car_'+sub]) this._loadCarSub(sub);
  },

  _switchDetailSub(sub,load=true){
    this.subDetail=sub;
    document.querySelectorAll('#sub-detail .sub-tab').forEach(b=>b.classList.toggle('active',b.dataset.sub===sub));
    this._showSubPage(this.DETAIL_PAGES,sub);
    this._updateFab();
    if(load && !this._loaded['det_'+sub]) this._loadDetailSub(sub);
  },

  _switchOvSub(sub,load=true){
    this.subOv=sub;
    document.querySelectorAll('#sub-ov .sub-tab').forEach(b=>b.classList.toggle('active',b.dataset.sub===sub));
    this._showSubPage(this.OV_PAGES,sub);
    if(load && !this._loaded['ov_'+sub]) this._loadOvSub(sub);
  },

  // ── Row click delegation (works reliably on iOS) ──
  bindRowClicks(){
    document.getElementById('app').addEventListener('click', e=>{
      const row=e.target.closest('[data-action]');
      if(!row) return;
      const idx=row.dataset.key;
      const action=row.dataset.action;
      if(action==='oilDetail')  this.showOilDetail(idx);
      if(action==='expDetail')  this.showExpDetail(idx);
      if(action==='dataDetail') this.showDataDetail(idx);
    });
  },

  // ── Cross-tab edge swipe ──
  bindTabSwipe(){
    const TAB_ORDER=['car','detail','overview'];
    const self=this;
    ['pg-car','pg-detail','pg-overview'].forEach(pgId=>{
      const pg=document.getElementById(pgId);
      if(!pg) return;
      let startX=null,startY=0,dragging=false;
      pg.addEventListener('touchstart',e=>{
        if(e.touches.length!==1) return;
        const x=e.touches[0].clientX;
        startY=e.touches[0].clientY; dragging=false;
        const EDGE=32;
        if(x>EDGE&&x<window.innerWidth-EDGE){startX=null;return;}
        startX=x;
      },{passive:true});
      pg.addEventListener('touchmove',e=>{
        if(e.touches.length!==1||startX===null) return;
        const dx=e.touches[0].clientX-startX;
        const dy=e.touches[0].clientY-startY;
        if(!dragging&&Math.abs(dy)>Math.abs(dx)+8) return;
        if(!dragging&&Math.abs(dx)>8) dragging=true;
        if(!dragging) return;
        const inner=document.getElementById('tab-swipe-inner');
        if(inner){
          const ci=self._TAB_IDX[self.tab]??1;
          inner.style.transition='none';
          inner.style.transform=`translateX(${-ci*100/3+(dx/pg.offsetWidth)*100/3}%)`;
        }
      },{passive:true});
      pg.addEventListener('touchend',e=>{
        if(!dragging||startX===null) return;
        dragging=false;
        const dx=e.changedTouches[0].clientX-startX;
        const inner=document.getElementById('tab-swipe-inner');
        if(inner) inner.style.transition='';
        const ci=TAB_ORDER.indexOf(self.tab);
        if(Math.abs(dx)<60){if(inner) inner.style.transform=`translateX(${-ci*100/3}%)`;return;}
        if(dx<0) self.switchTab(TAB_ORDER[Math.min(ci+1,TAB_ORDER.length-1)],true,false);
        else     self.switchTab(TAB_ORDER[Math.max(ci-1,0)],true,false);
      },{passive:true});
    });
  },

  // ── 細項 left/right swipe ──
  bindDetailSwipe(){
    const pg=document.getElementById('pg-detail');
    if(!pg) return;
    let sx=0,sy=0,drag=false;
    pg.addEventListener('touchstart',e=>{
      if(e.touches.length!==1) return;
      sx=e.touches[0].clientX; sy=e.touches[0].clientY; drag=false;
    },{passive:true});
    pg.addEventListener('touchmove',e=>{
      if(e.touches.length!==1) return;
      const dx=Math.abs(e.touches[0].clientX-sx), dy=Math.abs(e.touches[0].clientY-sy);
      if(!drag&&dy>dx+10) return;
      if(!drag&&dx>10) drag=true;
    },{passive:true});
    pg.addEventListener('touchend',e=>{
      if(!drag) return; drag=false;
      const dx=e.changedTouches[0].clientX-sx;
      if(Math.abs(dx)<55) return;
      const subs=this.DETAIL_SUBS, ci=subs.indexOf(this.subDetail);
      if(dx<0&&ci<subs.length-1) this._switchDetailSub(subs[ci+1]);
      else if(dx>0&&ci>0)        this._switchDetailSub(subs[ci-1]);
    },{passive:true});
  },

  // ── 收支總覽: swipe in bottom 60px strip ──
  bindOvBottomSwipe(){
    const pg=document.getElementById('pg-overview');
    if(!pg) return;
    let sx=0,sy=0,drag=false,inZone=false;
    pg.addEventListener('touchstart',e=>{
      if(e.touches.length!==1) return;
      sx=e.touches[0].clientX; sy=e.touches[0].clientY; drag=false;
      const r=pg.getBoundingClientRect();
      inZone=(sy > r.bottom-60);
    },{passive:true});
    pg.addEventListener('touchmove',e=>{
      if(e.touches.length!==1||!inZone) return;
      const dx=Math.abs(e.touches[0].clientX-sx), dy=Math.abs(e.touches[0].clientY-sy);
      if(!drag&&dy>dx+10) return;
      if(!drag&&dx>10) drag=true;
    },{passive:true});
    pg.addEventListener('touchend',e=>{
      if(!drag||!inZone){drag=false;inZone=false;return;}
      drag=false;inZone=false;
      const dx=e.changedTouches[0].clientX-sx;
      if(Math.abs(dx)<55) return;
      const subs=this.OV_SUBS, ci=subs.indexOf(this.subOv);
      if(dx<0&&ci<subs.length-1) this._switchOvSub(subs[ci+1]);
      else if(dx>0&&ci>0)        this._switchOvSub(subs[ci-1]);
    },{passive:true});
  },

  // ── 汽車: bottom-strip swipe to change sub-page ──
  bindCarBottomSwipe(){
    const pg=document.getElementById('pg-car');
    if(!pg) return;
    let sx=0,sy=0,drag=false,inZone=false;
    pg.addEventListener('touchstart',e=>{
      if(e.touches.length!==1) return;
      sx=e.touches[0].clientX; sy=e.touches[0].clientY; drag=false;
      const r=pg.getBoundingClientRect();
      inZone=(sy > r.bottom-60);
    },{passive:true});
    pg.addEventListener('touchmove',e=>{
      if(e.touches.length!==1||!inZone) return;
      const dx=Math.abs(e.touches[0].clientX-sx), dy=Math.abs(e.touches[0].clientY-sy);
      if(!drag&&dy>dx+10) return;
      if(!drag&&dx>10) drag=true;
    },{passive:true});
    pg.addEventListener('touchend',e=>{
      if(!drag||!inZone){drag=false;inZone=false;return;}
      drag=false;inZone=false;
      const dx=e.changedTouches[0].clientX-sx;
      if(Math.abs(dx)<55) return;
      const subs=this.CAR_SUBS, ci=subs.indexOf(this.subCar);
      if(dx<0&&ci<subs.length-1) this._switchCarSub(subs[ci+1]);
      else if(dx>0&&ci>0)        this._switchCarSub(subs[ci-1]);
    },{passive:true});
  },

  _loadCarSub(sub){
    const fns={oil:()=>this.loadOil(),oilStat:()=>this.loadOilStat(),expense:()=>this.loadGasExpense(),yearStat:()=>this.loadYearStat()};
    fns[sub]?.();
    this._loaded['car_'+sub]=true;
  },

  async loadOil(){
    const tbody=document.getElementById('oil-tbody');
    if(!tbody) return;
    tbody.innerHTML=`<tr><td colspan="13" class="load-msg">載入中...</td></tr>`;
    try{
      const recs=await SHEETS.loadOilRecords();
      this._storeNS='o_'; this._clearStore();
      const allKm=recs.map(r=>this.num(String(r.totalKm).replace(/,/g,''))).filter(v=>v>0);
      this._maxOilKm=allKm.length?Math.max(...allKm):0;
      if(!recs.length){tbody.innerHTML=`<tr><td colspan="13" class="load-msg">尚無資料</td></tr>`;return;}
      const groups=this.groupByMonth(recs);
      let html='';
      groups.forEach(([month,items])=>{
        const total=items.reduce((s,r)=>s+this.num(r.actual),0);
        html+=`<tr class="month-row">
          <td colspan="2"><span class="month-badge">${month}</span>&nbsp;<span class="month-total">$${total.toLocaleString()}</span></td>
          <td colspan="11"></td>
        </tr>`;
        items.forEach(r=>{
          const idx=this._storeRow(r);
          const d=String(r.date).split('/');
          const ds=d.length>=3?`${d[1].padStart(2,'0')}/${d[2].padStart(2,'0')}`:r.date;
          html+=`<tr class="data-row" data-key="${idx}" data-action="oilDetail">
            <td class="td-date">${ds}</td>
            <td class="td-money">$${this.fmt(r.actual)}</td>
            <td class="td-num">${r.daily&&r.daily!=='-'?'$'+this.fmt(r.daily):'-'}</td>
            <td class="td-num">${r.selfDisc&&r.selfDisc!=='-'?r.selfDisc:'-'}</td>
            <td class="td-num">${r.cardDisc&&r.cardDisc!=='-'?r.cardDisc:'-'}</td>
            <td class="td-num">${r.totalDisc&&r.totalDisc!=='-'?r.totalDisc:'-'}</td>
            <td class="td-num">${r.liters||'-'}</td>
            <td class="td-num">${this.fmt(r.totalKm)}</td>
            <td class="td-num">${r.km&&r.km!=='-'?r.km:'-'}</td>
            <td class="td-num">${r.efficiency&&r.efficiency!=='-'?r.efficiency:'-'}</td>
            <td class="td-num">${r.costPerKm&&r.costPerKm!=='-'?'$'+r.costPerKm:'-'}</td>
            <td class="td-num">${r.discPerL&&r.discPerL!=='-'?r.discPerL:'-'}</td>
            <td class="td-str">${r.plan||'-'}</td>
          </tr>`;
        });
      });
      tbody.innerHTML=html;
    }catch(e){tbody.innerHTML=`<tr><td colspan="13">${this.err(e)}</td></tr>`;}
  },

  async loadOilStat(){
    const el=document.getElementById('oil-stat-content');
    if(!el) return;
    el.innerHTML=this.loading();
    try{
      const rows=await SHEETS.loadOilStat();
      if(!rows.length){el.innerHTML=this.empty();return;}
      const hdr=rows[0]||[];
      const thisYear=new Date().getFullYear();
      // Build list of {label, origIdx} for columns to keep (year <= thisYear)
      const keepCols=hdr.slice(1).map((y,i)=>({label:y,origIdx:i+1}))
        .filter(c=>c.label&&Number(String(c.label).trim().split('-')[0])<=thisYear);
      let html=`<table class="frozen-1-table"><thead><tr><th style="min-width:40px">月</th>`;
      keepCols.forEach(c=>html+=`<th style="min-width:80px">${c.label}</th>`);
      html+=`</tr></thead><tbody>`;
      rows.slice(1).forEach(r=>{
        const label=String(r[0]||'');
        // Skip rows where ALL kept-year values are zero/empty (hide fully-$0 months)
        const hasData=keepCols.some(c=>{
          const v=String(r[c.origIdx]||'').replace(/[\s,]/g,'');
          return v!==''&&v!=='0';
        });
        if(label!=='總和'&&!hasData) return;
        html+=`<tr${label==='總和'?' class="total-row"':''}><td>${label}</td>`;
        keepCols.forEach(c=>{
          const v=String(r[c.origIdx]||'').replace(/\s/g,'');
          html+=`<td>${v&&v!=='0'?'$'+v:'-'}</td>`;
        });
        html+=`</tr>`;
      });
      html+=`</tbody></table>`;
      el.innerHTML=html;
    }catch(e){el.innerHTML=this.err(e);}
  },

  async loadGasExpense(){
    const el=document.getElementById('expense-list');
    if(!el) return;
    el.innerHTML=this.loading();
    try{
      const recs=await SHEETS.loadGasExpense();
      this._storeNS='e_'; this._clearStore();
      if(!recs.length){el.innerHTML=this.empty();return;}
      const catOrder=['保養','保險','稅費'];
      const maintainOrder=['定保','更換蓄電池','更換輪胎'];
      const getMaintainRank=item=>{
        for(let i=0;i<maintainOrder.length;i++) if(item.includes(maintainOrder[i])) return i;
        return maintainOrder.length;
      };
      // Normalize date string for correct string comparison: 2024/6/1 -> 2024/06/01
      const normDate=d=>{
        const p=String(d).split('/');
        if(p.length===3) return `${p[0]}/${p[1].padStart(2,'0')}/${p[2].padStart(2,'0')}`;
        return d;
      };
      const sorted=[...recs].sort((a,b)=>{
        const ca=catOrder.indexOf(a.cat),cb=catOrder.indexOf(b.cat);
        if(ca!==cb) return ca-cb;
        if(a.cat==='保養'){
          const ra=getMaintainRank(a.item),rb=getMaintainRank(b.item);
          if(ra!==rb) return ra-rb;
          return normDate(a.date).localeCompare(normDate(b.date));
        }
        return normDate(a.date).localeCompare(normDate(b.date));
      });
      const cats={};
      sorted.forEach(r=>(cats[r.cat]=cats[r.cat]||[]).push(r));
      let html='';
      catOrder.forEach(cat=>{
        const items=cats[cat];
        if(!items||!items.length) return;
        const total=items.reduce((s,r)=>s+this.num(String(r.amount).replace(/[\$,\s]/g,'')),0);
        html+=`<div class="section-hdr">${cat}<span style="font-family:monospace;color:var(--txt2)">$${total.toLocaleString()}</span></div>`;
        items.forEach(r=>{
          const idx=this._storeRow(r);
          html+=`<div class="list-row" data-key="${idx}" data-action="expDetail">
            <div class="row-main"><div class="row-title">${r.item}</div><div class="row-sub">${r.note||''}${r.mileage?' · '+r.mileage+' km':''}</div></div>
            <div class="row-right"><div class="row-amount neutral">$${this.fmt(r.amount)}</div><div class="row-date">${r.date}</div></div>
            <div class="row-arrow">›</div>
          </div>`;
        });
      });
      el.innerHTML=html;
    }catch(e){el.innerHTML=this.err(e);}
  },

  async loadYearStat(){
    const el=document.getElementById('year-stat-content');
    if(!el) return;
    el.innerHTML=this.loading();
    try{
      const rows=await SHEETS.loadYearStat();
      if(!rows.length){el.innerHTML=this.empty();return;}
      const hdr=rows[0]||[];
      const thisYear=new Date().getFullYear();
      // Filter header: only show years <= current year (skip future year columns)
      const colKeep=hdr.map((h,i)=>{
        if(i===0) return true; // label col always keep
        const y=parseInt(String(h).trim());
        return isNaN(y)||y<=thisYear;
      });
      let html=`<table class="frozen-1-table"><thead><tr>`;
      hdr.forEach((h,i)=>{if(colKeep[i])html+=`<th style="min-width:${i===0?'76':'80'}px">${h||''}</th>`;});
      html+=`</tr></thead><tbody>`;
      rows.slice(1).forEach(r=>{
        const isTot=(String(r[0]||'')).includes('總和');
        html+=`<tr${isTot?' class="total-row"':''}>`;
        r.forEach((c,i)=>{if(colKeep[i])html+=`<td>${c||'-'}</td>`;});
        html+=`</tr>`;
      });
      html+=`</tbody></table>`;
      el.innerHTML=html;
    }catch(e){el.innerHTML=this.err(e);}
  },

  // ════════════════════════════════════════
  // 📋 DETAIL
  // ════════════════════════════════════════

  _loadDetailSub(sub){
    const fn={curMonth:()=>this.loadCurMonth(),prevMonth:()=>this.loadPrevMonth(),familyExp:()=>this.loadFamilyExp(),expAna:()=>this.loadDetailAna(),stockAna:()=>this.loadStockAna()};
    fn[sub]?.();
    this._loaded['det_'+sub]=true;
  },

  async loadCurMonth(){
    const el=document.getElementById('cur-month-list');
    if(!el) return;
    el.innerHTML=this.loading();
    try{
      const all=await SHEETS.loadData();
      this._storeNS='d_'; this._clearStore();
      el.innerHTML=this._renderMonthDetail(all.filter(r=>this.getMonth(r.date)===this.nowMonth()));
    }catch(e){el.innerHTML=this.err(e);}
  },

  async loadPrevMonth(){
    const el=document.getElementById('prev-month-list');
    if(!el) return;
    el.innerHTML=this.loading();
    try{
      const all=await SHEETS.loadData();
      this._storeNS='p_'; this._clearStore();
      el.innerHTML=this._renderMonthDetail(all.filter(r=>this.getMonth(r.date)===this.prevMonth()));
    }catch(e){el.innerHTML=this.err(e);}
  },

  async loadFamilyExp(){
    const el=document.getElementById('family-exp-list');
    if(!el) return;
    el.innerHTML=this.loading();
    try{
      const all=await SHEETS.loadData();
      this._storeNS='fe_'; this._clearStore();
      const recs=all.filter(r=>r.io==='Exp.'&&r.item==='小家庭')
        .sort((a,b)=>String(b.date).localeCompare(String(a.date)));
      if(!recs.length){el.innerHTML=this.empty();return;}
      const byYear={};
      recs.forEach(r=>{
        const yr=this.getYear(r.date);
        (byYear[yr]=byYear[yr]||[]).push(r);
      });
      const years=Object.keys(byYear).sort((a,b)=>b.localeCompare(a));
      let html='<div style="padding-bottom:80px">';
      years.forEach(yr=>{
        const yrRecs=byYear[yr];
        const yrTotal=yrRecs.reduce((s,r)=>s+this.num(r.amount),0);
        html+=`<div class="section-hdr">${yr}<span class="section-badge badge-exp">$${yrTotal.toLocaleString()}</span></div>`;
        yrRecs.forEach(r=>{
          const idx=this._storeRow(r);
          const d=String(r.date).split('/');
          const dm=d.length>=3?`${d[1].padStart(2,'0')}/${d[2].padStart(2,'0')}`:r.date;
          const title=r.note||'（無備註）';
          html+=`<div class="list-row" data-key="${idx}" data-action="dataDetail">
            <div class="row-main"><div class="row-title">${title}</div></div>
            <div class="row-right"><div class="row-amount exp">$${this.fmt(r.amount)}</div><div class="row-date">${dm}</div></div>
            <div class="row-arrow">›</div>
          </div>`;
        });
      });
      html+='</div>';
      el.innerHTML=html;
    }catch(e){el.innerHTML=this.err(e);}
  },

  _renderMonthDetail(recs){
    if(!recs.length) return this.empty();
    const sortFn=(a,b)=>{
      const da=String(a.date).split('/').map(Number),db=String(b.date).split('/').map(Number);
      for(let i=0;i<3;i++){const d=(db[i]||0)-(da[i]||0);if(d)return d;}
      return String(a.item).localeCompare(String(b.item));
    };
    const inc=recs.filter(r=>r.io==='Inc.'&&r.counted==='TRUE').sort(sortFn);
    const exp=recs.filter(r=>r.io==='Exp.'&&r.counted==='TRUE');
    const expAll=recs.filter(r=>r.io==='Exp.').sort(sortFn);
    const incT=inc.reduce((s,r)=>s+this.num(r.amount),0);
    const expT=exp.reduce((s,r)=>s+this.num(r.amount),0);
    const bal=incT-expT;
    let html=`<div class="stat-cards">
      <div class="stat-card"><div class="stat-label">收入</div><div class="stat-val inc">$${incT.toLocaleString()}</div></div>
      <div class="stat-card"><div class="stat-label">支出</div><div class="stat-val exp">$${expT.toLocaleString()}</div></div>
      <div class="stat-card full"><div class="stat-label">結餘</div><div class="stat-val ${bal>=0?'bal-pos':'bal-neg'}">$${bal.toLocaleString()}</div></div>
    </div>`;
    if(inc.length){
      html+=`<div class="section-hdr">收入<span class="section-badge badge-inc">$${incT.toLocaleString()}</span></div>`;
      inc.forEach(r=>{
        const idx=this._storeRow(r);
        const d=String(r.date).split('/');
        const dm=d.length>=3?`${d[1].padStart(2,'0')}/${d[2].padStart(2,'0')}`:r.date;
        html+=`<div class="list-row" data-key="${idx}" data-action="dataDetail">
          <div class="row-main"><div class="row-title">${r.item}</div>${r.note?`<div class="row-sub">${r.note}</div>`:''}</div>
          <div class="row-right"><div class="row-amount inc">$${this.fmt(r.amount)}</div><div class="row-date">${dm}</div></div>
          <div class="row-arrow">›</div>
        </div>`;
      });
    }
    if(expAll.length){
      html+=`<div class="section-hdr">支出<span class="section-badge badge-exp">$${expT.toLocaleString()}</span></div>`;
      expAll.forEach(r=>{
        const idx=this._storeRow(r);
        const d=String(r.date).split('/');
        const dm=d.length>=3?`${d[1].padStart(2,'0')}/${d[2].padStart(2,'0')}`:r.date;
        const creditBadge=r.counted==='FALSE'?`<span class="badge-credit">已刷卡</span>`:'';
        html+=`<div class="list-row" data-key="${idx}" data-action="dataDetail">
          <div class="row-main"><div class="row-title">${r.note?`${r.item} · ${r.note}`:r.item}${creditBadge}</div></div>
          <div class="row-right"><div class="row-amount exp">$${this.fmt(r.amount)}</div><div class="row-date">${dm}</div></div>
          <div class="row-arrow">›</div>
        </div>`;
      });
    }
    return html;
  },

  // ── EstInc: 月份凍結 + 工作列 ──
  async loadEstInc(){
    const el=document.getElementById('est-inc-content');
    if(!el) return;
    el.innerHTML=this.loading();
    try{
      const [est,monthInc]=await Promise.all([SHEETS.loadEstimate(),SHEETS.loadMonthInc()]);
      // Section separator between est and monthInc tables
      let html='';
      // 預估 table
      if(est.length){
        html+=`<table class="frozen-1-table" style="width:100%"><thead><tr>
          <th style="min-width:76px">月份</th><th style="min-width:72px">預估</th>
          <th style="min-width:72px">醫材</th><th style="min-width:68px">中正</th>
          <th style="min-width:64px">門診</th><th style="min-width:64px">右昌</th>
        </tr></thead><tbody>`;
        est.forEach(r=>html+=`<tr>
          <td>${r.month}</td><td>${this.fmtM(r.estimate)}</td><td>${this.fmtM(r.material)}</td>
          <td>${this.fmtM(r.zhongzheng)}</td><td>${this.fmtM(r.clinic)}</td><td>${this.fmtM(r.youchang)}</td>
        </tr>`);
        html+=`</tbody></table>`;
      }

      // 月Inc. table — 月份→工作→總和→中正→右昌→立暘→自費→利息→股票→其他
      if(monthInc.length){
        const hdr=monthInc[0]||[];
        // Find column indices from header
        const ci=name=>hdr.findIndex(h=>(h||'').trim()===name);
        const iMonth=ci('月份')>=0?ci('月份'):0;
        const iZZ=ci('中正'), iYC=ci('右昌'), iLY=ci('立暘'), iZF=ci('自費');
        const iLX=ci('利息'), iGP=ci('股票'), iOth=ci('其他');
        const iTotal=ci('總和'), iWork=ci('工作');

        html+=`<table class="frozen-1-table" style="width:100%"><thead><tr>
          <th style="min-width:76px">月份</th>
          <th style="min-width:80px">工作</th>
          <th style="min-width:80px">總和</th>
          <th style="min-width:72px">中正</th>
          <th style="min-width:72px">右昌</th>
          <th style="min-width:72px">立暘</th>
          <th style="min-width:72px">自費</th>
          <th style="min-width:64px">利息</th>
          <th style="min-width:64px">股票</th>
          <th style="min-width:64px">其他</th>
        </tr></thead><tbody>`;

        // Filter future months (month > today)
        const todayStr=new Date().toISOString().slice(0,7).replace('-','/');
        // sort newest first, then year-group
        const incRows=monthInc.slice(1).filter(r=>r[0]&&r[0].trim()<=todayStr)
          .sort((a,b)=>b[0].localeCompare(a[0]));
        const incYearMap={};
        incRows.forEach(r=>{
          const yr=String(r[iMonth]||r[0]).split('/')[0];
          (incYearMap[yr]=incYearMap[yr]||[]).push(r);
        });
        const incYears=Object.keys(incYearMap).sort((a,b)=>b.localeCompare(a));
        incYears.forEach(yr=>{
          const yrRows=incYearMap[yr];
          html+=`<tr class="yr-group-hdr">
            <td><strong>${yr}</strong></td>
            <td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td>
          </tr>`;
          yrRows.forEach(r=>{
            const g2=idx=>idx>=0?(String(r[idx]||'').replace(/\s/g,'')||'-'):'-';
            const mo=String(r[iMonth]||r[0]).split('/')[1]||'';
            html+=`<tr>
              <td style="padding-left:24px;color:var(--txt2)">${mo}月</td>
              <td>${g2(iWork)}</td><td>${g2(iTotal)}</td>
              <td>${g2(iZZ)}</td><td>${g2(iYC)}</td><td>${g2(iLY)}</td><td>${g2(iZF)}</td>
              <td>${g2(iLX)}</td><td>${g2(iGP)}</td><td>${g2(iOth)}</td>
            </tr>`;
          });
        });
        html+=`</tbody></table>`;
      }
      el.innerHTML=html;
    }catch(e){el.innerHTML=this.err(e);}
  },

  async loadMonthExp(){
    const el=document.getElementById('month-exp-content');
    if(!el) return;
    el.innerHTML=this.loading();
    try{
      const rows=await SHEETS.loadMonthExp();
      if(!rows.length){el.innerHTML=this.empty();return;}
      const hdr=rows[0]||[];
      const todayStr=new Date().toISOString().slice(0,7).replace('-','/');
      // Filter future months, sort newest first
      const dataRows=rows.slice(1)
        .filter(r=>r[0]&&r[0].trim()&&r[0].trim()<=todayStr)
        .sort((a,b)=>b[0].localeCompare(a[0]));
      // Year-group
      const yearMap={};
      dataRows.forEach(r=>{
        const yr=String(r[0]).split('/')[0];
        (yearMap[yr]=yearMap[yr]||[]).push(r);
      });
      const yearKeys=Object.keys(yearMap).sort((a,b)=>b.localeCompare(a));
      // Build index-based column order: [0(月份), totalIdx, ...rest]
      const totalIdx=hdr.findIndex(h=>String(h||'').trim()==='總和');
      // colOrder: array of original indices in desired display order
      const colOrder=[0];
      if(totalIdx>0) colOrder.push(totalIdx);
      hdr.forEach((_,i)=>{ if(i>0&&i!==totalIdx) colOrder.push(i); });
      let html=`<table class="frozen-1-table" style="width:100%"><thead><tr>`;
      colOrder.forEach(i=>{
        const h=hdr[i]||'';
        const w=i===0?'76':h==='總和'?'88':'72';
        html+=`<th style="min-width:${w}px">${h}</th>`;
      });
      html+=`</tr></thead><tbody>`;
      yearKeys.forEach(yr=>{
        const yrRows=yearMap[yr];
        html+=`<tr class="yr-group-hdr"><td><strong>${yr}</strong></td>${colOrder.slice(1).map(()=>'<td></td>').join('')}</tr>`;
        yrRows.forEach(r=>{
          const mo=String(r[0]).split('/')[1]||'';
          html+=`<tr><td style="padding-left:24px;color:var(--txt2)">${mo}月</td>`;
          colOrder.slice(1).forEach(origIdx=>{
            const v=String(r[origIdx]||'').replace(/\s/g,'');
            html+=`<td>${v&&v!=='0'?v:'-'}</td>`;
          });
          html+=`</tr>`;
        });
      });
      html+=`</tbody></table>`;
      el.innerHTML=html;
    }catch(e){el.innerHTML=this.err(e);}
  },

  async loadDetailAna(){
    const el=document.getElementById('exp-ana-content');
    if(!el) return;
    el.innerHTML=this.loading();
    try{
      const all=await SHEETS.loadData();
      const CATS=['保險','醫療','骨科','稅務'];
      const filtered=all.filter(r=>r.io==='Exp.'&&CATS.includes(r.item));
      const years=[...new Set(filtered.map(r=>this.getYear(r.date)).filter(y=>y&&y.length===4))].sort();
      const groups={};
      filtered.forEach(r=>{
        const key=r.item, sub=r.note||'（無備註）', yr=this.getYear(r.date);
        if(!groups[key]) groups[key]={};
        if(!groups[key][sub]) groups[key][sub]={};
        groups[key][sub][yr]=(groups[key][sub][yr]||0)+this.num(r.amount);
      });
      const NOTE_ORDER={
        '保險':['醫療, 南山','醫療, 富邦','醫責, 明台','汽車','房屋'],
        '骨科':['骨科醫學會','骨鬆學會','上課','書'],
        '醫療':['牙醫','其他'],
        '稅務':['綜所稅5月','房屋稅.閃耀','房屋稅.崑庭','地價稅.閃耀','地價稅.崑庭','牌照稅4月','燃料稅7月'],
      };
      // Use frozen-1-table: row=備註, col=year, header row frozen at top
      let html=`<div style="padding-bottom:80px"><table class="frozen-1-table" style="width:100%">
        <thead><tr><th style="min-width:110px">備註</th>`;
      years.forEach(y=>html+=`<th style="min-width:82px">${y}</th>`);
      html+=`</tr></thead><tbody>`;
      CATS.forEach(cat=>{
        if(!groups[cat]) return;
        const catTotals={};years.forEach(y=>catTotals[y]=0);
        // Category section header
        html+=`<tr><td colspan="${years.length+1}" style="background:#e4ecf4!important;font-weight:700;font-size:.92rem;color:var(--txt);padding:9px 12px">${cat}</td></tr>`;
        const orderArr=NOTE_ORDER[cat]||[];
        let entries=Object.entries(groups[cat]);
        entries.sort(([a],[b])=>{
          const ia=orderArr.findIndex(o=>a.includes(o)||o.includes(a));
          const ib=orderArr.findIndex(o=>b.includes(o)||o.includes(b));
          const ra=ia>=0?ia:999,rb=ib>=0?ib:999;
          if(ra!==rb) return ra-rb;
          return a.localeCompare(b,'zh');
        });
        entries.forEach(([note,yrMap])=>{
          html+=`<tr><td>${note}</td>`;
          years.forEach(y=>{
            const v=yrMap[y]||0;catTotals[y]=(catTotals[y]||0)+v;
            html+=`<td>${v?'$'+v.toLocaleString():'-'}</td>`;
          });
          html+=`</tr>`;
        });
        html+=`<tr class="total-row"><td>合計</td>`;
        years.forEach(y=>html+=`<td style="color:var(--accent)">${catTotals[y]?'$'+catTotals[y].toLocaleString():'-'}</td>`);
        html+=`</tr>`;
      });
      html+=`</tbody></table></div>`;
      el.innerHTML=html;
    }catch(e){el.innerHTML=this.err(e);}
  },

  // ════════════════════════════════════════
  // 📊 OVERVIEW
  // ════════════════════════════════════════

  _loadOvSub(sub){
    const fn={estInc:()=>this.loadEstInc(),monthExp:()=>this.loadMonthExp(),balance:()=>this.loadBalance(),annualSum:()=>this.loadAnnualSum(),lineChart:()=>this.loadLineChart()};
    fn[sub]?.();
    this._loaded['ov_'+sub]=true;
  },

  // ── helpers ──
  _parseAmt(s){
    const str=String(s||'').replace(/\s/g,'');
    const neg=str.startsWith('-');
    const abs=Number(str.replace(/[^0-9]/g,''));
    return neg?-abs:abs;
  },

  // ── 月結餘 — year-grouped ──
  async loadBalance(){
    const el=document.getElementById('balance-content');
    if(!el) return;
    el.innerHTML=this.loading();
    try{
      const recs=await SHEETS.loadBalance();
      if(!recs.length){el.innerHTML=this.empty();return;}
      const yearMap={};
      recs.forEach(r=>{
        const yr=String(r.month).split('/')[0];
        (yearMap[yr]=yearMap[yr]||[]).push(r);
      });
      const years=Object.keys(yearMap).sort((a,b)=>b.localeCompare(a));

      let html=`<div style="padding-bottom:80px"><table class="frozen-1-table" style="width:100%"><thead><tr>
        <th style="min-width:76px">月份</th>
        <th style="min-width:88px">結餘</th>
        <th style="min-width:84px">收入</th>
        <th style="min-width:84px">支出</th>
      </tr></thead><tbody>`;

      years.forEach(yr=>{
        const rows=yearMap[yr];
        const yrBal=rows.reduce((s,r)=>s+this._parseAmt(r.bal),0);
        const yrInc=rows.reduce((s,r)=>s+this._parseAmt(r.inc),0);
        const yrExp=rows.reduce((s,r)=>s+this._parseAmt(r.exp),0);
        const balNeg=yrBal<0;
        html+=`<tr class="yr-group-hdr">
          <td><strong>${yr}</strong></td>
          <td style="color:${balNeg?'var(--red)':'var(--green)'};font-weight:700">${balNeg?'-':''}\$${Math.abs(yrBal).toLocaleString()}</td>
          <td style="color:var(--green)">\$${yrInc.toLocaleString()}</td>
          <td style="color:var(--red)">\$${yrExp.toLocaleString()}</td>
        </tr>`;
        rows.forEach(r=>{
          const bal=this._parseAmt(r.bal);
          const mo=String(r.month).split('/')[1]||r.month;
          html+=`<tr>
            <td style="padding-left:24px;color:var(--txt2)">${mo}月</td>
            <td style="color:${bal<0?'var(--red)':'var(--green)'}">${String(r.bal).replace(/\s/g,'')}</td>
            <td style="color:var(--green)">${String(r.inc).replace(/\s/g,'')}</td>
            <td style="color:var(--red)">${String(r.exp).replace(/\s/g,'')}</td>
          </tr>`;
        });
      });
      html+=`</tbody></table></div>`;
      el.innerHTML=html;
    }catch(e){el.innerHTML=this.err(e);}
  },

  // ── 年度 — 直接讀 Google Sheet「年」tab ──
  async loadAnnualSum(){
    const el=document.getElementById('annual-sum-content');
    if(!el) return;
    el.innerHTML=this.loading();
    try{
      const rows=await SHEETS.loadYear();
      if(!rows.length){el.innerHTML=this.empty();return;}
      // rows[0] = ['', '2025', '2026', ...]  header
      const hdr=rows[0]||[];
      const years=hdr.slice(1).filter(y=>y&&String(y).trim());
      let html=`<div style="padding-bottom:80px"><table class="frozen-1-table" style="width:100%"><thead><tr>
        <th style="min-width:80px">項目</th>`;
      years.forEach(y=>html+=`<th style="min-width:96px;text-align:right">${String(y).trim()}</th>`);
      html+=`</tr></thead><tbody>`;
      rows.slice(1).forEach(r=>{
        if(!r||!r.some(c=>c)) {
          // blank separator
          html+=`<tr><td colspan="${years.length+1}" style="height:8px;background:var(--bg);padding:0"></td></tr>`;
          return;
        }
        const label=String(r[0]||'').trim();
        const isBold=['結餘','工作','總收入','總支出'].includes(label);
        const isGreen=['結餘','工作','總收入'].includes(label);
        const isRed=['總支出'].includes(label);
        html+=`<tr${isBold?' class="total-row"':''}>`;
        html+=`<td style="min-width:76px${isBold?';font-weight:700':''}${isGreen?';color:var(--accent)':''}">${label}</td>`;
        years.forEach((_,i)=>{
          const raw=String(r[i+1]||'').replace(/\s/g,'');
          const n=raw?this._parseAmt(raw):null;
          let col='var(--txt2)';
          if(isGreen) col=n&&n<0?'var(--red)':'var(--green)';
          if(isRed) col='var(--red)';
          if(label==='結餘') col=n&&n<0?'var(--red)':'var(--green)';
          html+=`<td style="color:${col}${isBold?';font-weight:700':''}">${raw||'-'}</td>`;
        });
        html+=`</tr>`;
      });
      html+=`</tbody></table></div>`;
      el.innerHTML=html;
    }catch(e){el.innerHTML=this.err(e);}
  },

  // ── 年度摘要（舊，保留）── frozen header
  async loadYearSum(){
    const el=document.getElementById('year-sum-content');
    if(!el) return;
    el.innerHTML=this.loading();
    try{
      const rows=await SHEETS.loadYear();
      if(!rows.length){el.innerHTML=this.empty();return;}
      let html='<div style="padding-bottom:80px">';
      let inTbl=false;
      rows.forEach(r=>{
        if(!r||!r.some(c=>c)){
          if(inTbl){html+=`</tbody></table>`;inTbl=false;}
          return;
        }
        if(!inTbl){
          html+=`<table class="frozen-1-table" style="margin-bottom:8px"><thead><tr>`;
          r.forEach(c=>html+=`<th style="min-width:72px">${c||''}</th>`);
          html+=`</tr></thead><tbody>`;
          inTbl=true;
        }else{
          html+=`<tr>`;
          r.forEach(c=>html+=`<td>${String(c||'').replace(/\s/g,'')}</td>`);
          html+=`</tr>`;
        }
      });
      if(inTbl) html+=`</tbody></table>`;
      html+='</div>';
      el.innerHTML=html;
    }catch(e){el.innerHTML=this.err(e);}
  },

  // ── 折線圖 — labels on dots + avg ──
  async loadLineChart(){
    const el=document.getElementById('line-chart-content');
    if(!el) return;
    el.innerHTML=this.loading();
    try{
      const rows=await SHEETS.loadLineChart();
      if(rows.length<2){el.innerHTML=this.empty();return;}
      const hdr=rows[0]||[];
      const data=rows.slice(1).filter(r=>r[0]&&r[1]);
      const vals=data.map(r=>Number(String(r[1]||0).replace(/[,\s]/g,'')));
      const avg=Number(String(hdr[2]||'0').replace(/[^0-9]/g,''));
      const avgWan=(avg/10000).toFixed(1);
      const maxV=Math.max(...vals,avg)*1.18; // extra room for dot labels
      const minV=Math.min(...vals,avg)*0.85;
      const W=340,H=190,PAD={l:52,r:20,t:28,b:34};
      const cw=W-PAD.l-PAD.r,ch=H-PAD.t-PAD.b;
      const px=i=>PAD.l+i*(cw/Math.max(vals.length-1,1));
      const py=v=>PAD.t+ch-(v-minV)/(maxV-minV||1)*ch;
      let path=vals.map((v,i)=>`${i===0?'M':'L'}${px(i).toFixed(1)},${py(v).toFixed(1)}`).join(' ');
      const avgY=py(avg).toFixed(1);
      let svg=`<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:${H}px;overflow:visible">`;
      // Grid
      [0,.25,.5,.75,1].forEach(t=>{
        const y=PAD.t+t*ch,v=maxV-t*(maxV-minV);
        svg+=`<line x1="${PAD.l}" y1="${y.toFixed(1)}" x2="${W-PAD.r}" y2="${y.toFixed(1)}" stroke="#e4ecf4" stroke-width="1"/>`;
        svg+=`<text x="${PAD.l-4}" y="${(y+4).toFixed(1)}" text-anchor="end" font-size="9" fill="#8fa3b8">${(v/10000).toFixed(0)}萬</text>`;
      });
      // Avg line + label
      svg+=`<line x1="${PAD.l}" y1="${avgY}" x2="${W-PAD.r}" y2="${avgY}" stroke="#f59e0b" stroke-width="1.5" stroke-dasharray="5,3"/>`;
      svg+=`<text x="${W-PAD.r+2}" y="${(Number(avgY)-3).toFixed(1)}" font-size="9" fill="#f59e0b" font-weight="600">${avgWan}</text>`;
      // Area fill
      const lx=px(vals.length-1).toFixed(1);
      svg+=`<path d="${path} L${lx},${(PAD.t+ch).toFixed(1)} L${PAD.l},${(PAD.t+ch).toFixed(1)} Z" fill="rgba(26,127,212,.08)"/>`;
      // Line
      svg+=`<path d="${path}" stroke="#1a7fd4" stroke-width="2.2" fill="none" stroke-linejoin="round" stroke-linecap="round"/>`;
      // Dots + labels
      vals.forEach((v,i)=>{
        const x=parseFloat(px(i).toFixed(1));
        const y=parseFloat(py(v).toFixed(1));
        // Determine label position: above if point is in lower half, below if upper half
        const midY=PAD.t+ch/2;
        const goAbove=y>midY; // point is low → label goes above
        // Additional check: compare with neighbors to avoid overlap
        const prevY=i>0?parseFloat(py(vals[i-1]).toFixed(1)):null;
        const nextY=i<vals.length-1?parseFloat(py(vals[i+1]).toFixed(1)):null;
        let labelY;
        if(goAbove){
          labelY=y-9;
        } else {
          // Check if going below would collide with next/prev label
          labelY=y+16;
        }
        const wan=(v/10000).toFixed(1);
        // White outline for readability
        svg+=`<circle cx="${x}" cy="${y}" r="4" fill="#ffffff"/>`;
        svg+=`<circle cx="${x}" cy="${y}" r="3" fill="#1a7fd4"/>`;
        svg+=`<text x="${x}" y="${labelY.toFixed(1)}" text-anchor="middle" font-size="9.5"
          fill="none" stroke="white" stroke-width="3" stroke-linejoin="round">${wan}</text>`;
        svg+=`<text x="${x}" y="${labelY.toFixed(1)}" text-anchor="middle" font-size="9.5"
          fill="#1a7fd4" font-weight="700">${wan}</text>`;
        const mo=String(data[i][0]).split('/').pop();
        svg+=`<text x="${x}" y="${(H-PAD.b+16).toFixed(1)}" text-anchor="middle" font-size="9" fill="#8fa3b8">${mo}月</text>`;
      });
      svg+=`</svg>`;
      let html=`<div style="padding:16px;background:white;margin-bottom:1px">
        <div style="font-size:.9rem;font-weight:700;color:var(--txt2);margin-bottom:10px">工作收入趨勢（萬元）</div>
        ${svg}
        <div style="font-size:.75rem;color:var(--muted);margin-top:4px">虛線為近10個月平均 ${avgWan}萬</div>
      </div>`;
      html+=`<table style="width:100%;border-collapse:collapse;margin-bottom:80px">
        <thead><tr>
          <th style="padding:8px 14px;text-align:left;font-size:.76rem;font-weight:700;color:var(--muted);border-bottom:2px solid var(--border);background:var(--bg)">月份</th>
          <th style="padding:8px 14px;text-align:right;font-size:.76rem;font-weight:700;color:var(--muted);border-bottom:2px solid var(--border);background:var(--bg)">工作收入</th>
        </tr></thead><tbody>`;
      data.forEach(r=>html+=`<tr>
        <td style="padding:9px 14px;border-bottom:1px solid var(--border);color:var(--accent);font-weight:700;font-size:.88rem">${r[0]}</td>
        <td style="padding:9px 14px;border-bottom:1px solid var(--border);text-align:right;font-family:monospace;font-size:.88rem;color:var(--txt2)">${String(r[1]).replace(/\s/g,'')}</td>
      </tr>`);
      html+=`</tbody></table>`;
      el.innerHTML=html;
    }catch(e){el.innerHTML=this.err(e);}
  },

  // ── 股票分析 ──
  async loadStockAna(){
    const el=document.getElementById('stock-ana-content');
    if(!el) return;
    el.innerHTML=this.loading();
    try{
      const all=await SHEETS.loadData();
      const years=[...new Set(all.map(r=>this.getYear(r.date)).filter(y=>y&&y.length===4))].sort();

      // Groups:
      // 利息 (Inc. 項目=利息)
      // 股票交易收入 (Inc. 項目=股票)
      // 股票交易支出 (Exp. 項目=其他 備註含股票交易 OR 項目=信用卡 備註含股票)
      const GROUPS=[
        {
          label:'利息',
          filter:r=>r.io==='Inc.'&&r.item==='利息',
          noteKey:r=>r.note||'其他',
        },
        {
          label:'交易收入',
          filter:r=>r.io==='Inc.'&&r.item==='股票交易',
          noteKey:r=>'股票交易',   // always show as 股票交易 regardless of note
        },
        {
          label:'交易支出',
          filter:r=>r.io==='Exp.'&&((r.item==='其他'&&String(r.note||'').includes('股票'))||(r.item==='信用卡'&&String(r.note||'').includes('股票'))||(r.item==='股票交易')),
          noteKey:r=>r.note||'股票交易',
        },
      ];

      let html=`<div style="padding-bottom:80px"><table class="frozen-1-table" style="width:100%">
        <thead><tr><th style="min-width:110px">備註</th>`;
      years.forEach(y=>html+=`<th style="min-width:82px">${y}</th>`);
      html+=`</tr></thead><tbody>`;

      GROUPS.forEach(grp=>{
        const recs=all.filter(grp.filter);
        if(!recs.length) return;

        // Group by note
        const noteMap={};
        recs.forEach(r=>{
          const key=grp.noteKey(r);
          const yr=this.getYear(r.date);
          if(!noteMap[key]) noteMap[key]={};
          noteMap[key][yr]=(noteMap[key][yr]||0)+this.num(r.amount);
        });
        const grpTotals={};
        years.forEach(y=>grpTotals[y]=0);

        // Section header
        html+=`<tr><td colspan="${years.length+1}" style="background:#e4ecf4!important;font-weight:700;font-size:.92rem;color:#1a4070;padding:9px 12px">${grp.label}</td></tr>`;

        // Sort notes by total desc
        const noteEntries=Object.entries(noteMap).sort(([,a],[,b])=>{
          const ta=Object.values(a).reduce((s,v)=>s+v,0);
          const tb=Object.values(b).reduce((s,v)=>s+v,0);
          return tb-ta;
        });

        noteEntries.forEach(([note,yrMap])=>{
          html+=`<tr><td>${note}</td>`;
          years.forEach(y=>{
            const v=yrMap[y]||0;
            grpTotals[y]=(grpTotals[y]||0)+v;
            const color=grp.label==='交易支出'?'var(--red)':'var(--green)';
            html+=`<td${v?` style="color:${color}"`:''}>${v?'$'+v.toLocaleString():'-'}</td>`;
          });
          html+=`</tr>`;
        });

        // 利息保留小計；交易收入/交易支出不顯示小計
        if(grp.label==='利息'){
          html+=`<tr class="total-row"><td>小計</td>`;
          years.forEach(y=>html+=`<td style="color:var(--green);font-weight:700">${grpTotals[y]?'$'+grpTotals[y].toLocaleString():'-'}</td>`);
          html+=`</tr>`;
        }

      });

      html+=`</tbody></table></div>`;
      el.innerHTML=html;
    }catch(e){el.innerHTML=this.err(e);}
  },

  // ════════════════════════════════════════
  // 🔍 SEARCH
  // ════════════════════════════════════════
  openSearch(){
    document.getElementById('modal-search').classList.add('open');
    setTimeout(()=>document.getElementById('search-input').focus(),100);
    document.getElementById('search-results').innerHTML='<div class="load-msg" style="color:#8fa3b8">輸入關鍵字搜尋</div>';
    document.getElementById('search-input').value='';
  },
  closeSearch(){
    document.getElementById('modal-search').classList.remove('open');
  },
  async doSearch(q){
    const el=document.getElementById('search-results');
    q=q.trim();
    if(!q){el.innerHTML='<div class="load-msg" style="color:#8fa3b8">輸入關鍵字搜尋</div>';return;}
    if(q.length<1) return;
    el.innerHTML='<div class="load-msg">搜尋中...</div>';
    try{
      // Search across Data sheet (income/expense records)
      const all=await SHEETS.loadData();
      const kw=q.toLowerCase();
      const hits=all.filter(r=>{
        return [r.date,r.amount,r.io,r.item,r.note].some(v=>String(v||'').toLowerCase().includes(kw));
      }).slice(0,50);
      
      // Also search oil records
      const oils=await SHEETS.loadOilRecords();
      const oilHits=oils.filter(r=>{
        return [r.date,r.actual,r.plan,r.liters,r.km].some(v=>String(v||'').toLowerCase().includes(kw));
      }).slice(0,20);
      
      if(!hits.length&&!oilHits.length){
        el.innerHTML='<div class="load-msg">找不到「'+q+'」</div>';
        return;
      }

      // Store hits for click-through detail
      this._storeNS='s_'; this._clearStore();

      let html='';
      if(hits.length){
        html+=`<div class="section-hdr">收支記錄（${hits.length}筆）</div>`;
        hits.forEach(r=>{
          const isInc=r.io==='Inc.';
          const idx=this._storeRow(r);
          html+=`<div class="list-row" data-key="${idx}" data-action="dataDetail">
            <div class="row-main">
              <div class="row-title">${r.item||''}${r.note?' <span style="color:#8fa3b8;font-size:.82rem">· '+r.note+'</span>':''}</div>
              <div class="row-sub">${r.date} · ${r.io}</div>
            </div>
            <div class="row-right">
              <div class="row-amount ${isInc?'inc':'exp'}">${isInc?'+':'-'}$${this.fmt(r.amount)}</div>
            </div>
            <div class="row-arrow">›</div>
          </div>`;
        });
      }
      if(oilHits.length){
        html+=`<div class="section-hdr">加油記錄（${oilHits.length}筆）</div>`;
        oilHits.forEach(r=>{
          const idx=this._storeRow(r);
          html+=`<div class="list-row" data-key="${idx}" data-action="oilDetail">
            <div class="row-main">
              <div class="row-title">加油 · ${r.plan||''}</div>
              <div class="row-sub">${r.date} · ${r.liters||'-'}L · ${r.km||'-'}km</div>
            </div>
            <div class="row-right">
              <div class="row-amount exp">$${this.fmt(r.actual)}</div>
            </div>
            <div class="row-arrow">›</div>
          </div>`;
        });
      }
      el.innerHTML=html;
    }catch(e){el.innerHTML='<div class="load-msg">搜尋失敗</div>';}
  },


  // ════════════════════════════════════════
  // FAB
  // ════════════════════════════════════════

  fabClick(){
    if(this.tab==='car'){
      if(this.subCar==='oil') this._openOilModal();
      else if(this.subCar==='expense') this._openExpenseModal();
    }else if(this.tab==='detail'){
      if(this.subDetail==='curMonth') this._openDataModal(null,false);
      else if(this.subDetail==='prevMonth') this._openDataModal(null,true);
    }
  },

  openModal(id){
    const el=document.getElementById(id);
    if(!el) return;
    el.classList.add('open');
    // Bind swipe-down to close
    const sheet=el.querySelector('.modal-sheet');
    if(sheet && !sheet._swipeBound){
      sheet._swipeBound=true;
      let sy=0, dragging=false, canClose=false;
      sheet.addEventListener('touchstart',e=>{
        sy=e.touches[0].clientY;
        dragging=true;
        // Only allow close-swipe when scrolled to very top
        canClose=(sheet.scrollTop<=2);
      },{passive:true});
      sheet.addEventListener('touchmove',e=>{
        if(!dragging) return;
        const dy=e.touches[0].clientY-sy;
        // Re-check: if user scrolled up to top during drag, allow close
        if(sheet.scrollTop<=0 && dy>0) canClose=true;
        if(canClose && dy>0){
          sheet.style.transform=`translateY(${Math.min(dy,220)}px)`;
        }
      },{passive:true});
      sheet.addEventListener('touchend',e=>{
        if(!dragging) return; dragging=false;
        const dy=e.changedTouches[0].clientY-sy;
        sheet.style.transform='';
        if(canClose && dy>80) this.closeModal(id);
        canClose=false;
      },{passive:true});
    }
  },
  closeModal(id){
    const el=document.getElementById(id);
    if(!el) return;
    const sheet=el.querySelector('.modal-sheet');
    if(sheet) sheet.style.transform='';
    el.classList.remove('open');
    // If this detail was opened from search, keep search open
    const detailIds=['modal-data-detail','modal-oil-detail','modal-exp-detail'];
    if(this._detailFromSearch && detailIds.includes(id)){
      this._detailFromSearch=false;
      document.getElementById('modal-search').classList.add('open');
    }
  },

  _openOilModal(r=null){
    this._editOilRow=r?r._row:null;
    document.getElementById('modal-oil-title').textContent=r?'修改加油記錄':'新增加油記錄';
    document.getElementById('oil-date').value=r?r.date.replace(/\//g,'-'):this.todayISO();
    document.getElementById('oil-daily').value=r?r.daily:'';
    document.getElementById('oil-liters').value=r?r.liters:'';
    document.getElementById('oil-totalKm').value=r?String(r.totalKm).replace(/,/g,''):'';
    const planVal=r?r.plan:'中油自助玉山4.5%';
    this._oilPlan=planVal;
    document.querySelectorAll('#oil-plan-chips .chip').forEach(c=>{
      const map={'自助玉山4.5%':'中油自助玉山4.5%','自助玉山3.5%':'中油自助玉山3.5%','玉山4.5%':'玉山4.5%','玉山3.5%':'玉山3.5%','全國自助台新3.3%':'全國自助台新3.3%','台新3.3%':'台新3.3%','無':'無'};
      c.classList.toggle('on',map[c.textContent.trim()]===planVal);
    });
    this.calcOil();
    this.openModal('modal-add-oil');
  },

  _calcOilValues(){
    const daily=this.num(document.getElementById('oil-daily').value);
    const liters=parseFloat(document.getElementById('oil-liters').value)||0;
    const totalKm=this.num(document.getElementById('oil-totalKm').value);
    const plan=this.PLANS[this._oilPlan]||this.PLANS['無'];
    const cardDisc=Math.round(plan.card(daily));
    const selfDisc=Math.round(plan.self(liters));
    const totalDisc=cardDisc+selfDisc;
    const actual=daily-cardDisc;
    const km=totalKm>0&&this._maxOilKm>0?totalKm-this._maxOilKm:0;
    const eff=km>0&&liters>0?km/liters:0;
    const cpk=km>0&&actual>0?actual/km:0;
    const dpl=liters>0?totalDisc/liters:0;
    return{daily,liters,totalKm,cardDisc,selfDisc,totalDisc,actual,km,eff,cpk,dpl};
  },

  calcOil(){
    const v=this._calcOilValues();
    document.getElementById('c-self').textContent=v.selfDisc?`$${v.selfDisc}`:'-';
    document.getElementById('c-card').textContent=v.cardDisc?`$${v.cardDisc}`:'-';
    document.getElementById('c-total').textContent=v.totalDisc?`$${v.totalDisc}`:'-';
    document.getElementById('c-actual').textContent=v.actual>0?`$${v.actual}`:'-';
    document.getElementById('c-km').textContent=v.km>0?`${v.km} km`:'-';
    document.getElementById('c-eff').textContent=v.eff>0?`${v.eff.toFixed(1)} km/L`:'-';
    document.getElementById('c-cpk').textContent=v.cpk>0?`$${v.cpk.toFixed(1)}`:'-';
    document.getElementById('c-dpl').textContent=v.dpl>0?`${v.dpl.toFixed(2)}`:'-';
  },

  selectPlan(btn,plan){
    this._oilPlan=plan;
    document.querySelectorAll('#oil-plan-chips .chip').forEach(c=>c.classList.toggle('on',c===btn));
    this.calcOil();
  },

  async saveOil(){
    const v=this._calcOilValues();
    const date=document.getElementById('oil-date').value.replace(/-/g,'/');
    if(!date||!v.daily){this.toast('請填入日期和當日油錢');return;}
    const d={date,actual:v.actual,daily:v.daily,selfDisc:v.selfDisc,cardDisc:v.cardDisc,totalDisc:v.totalDisc,
      liters:v.liters,totalKm:document.getElementById('oil-totalKm').value,km:v.km||'',
      efficiency:v.eff>0?v.eff.toFixed(1):'',costPerKm:v.cpk>0?v.cpk.toFixed(1):'',
      discPerL:v.dpl>0?v.dpl.toFixed(2):'',plan:this._oilPlan};
    try{
      this.toast('儲存中…');
      if(this._editOilRow) await SHEETS.updateOil(this._editOilRow,d);
      else await SHEETS.addOil(d);
      this.closeModal('modal-add-oil');
      this.toast('✅ 已儲存');
      this._maxOilKm=Math.max(this._maxOilKm,this.num(d.totalKm));
      this.loadOil();
    }catch(e){this.toast('❌ '+e.message);}
  },

  showOilDetail(idx){
    const r=this._getRow(idx);
    if(!r) return;
    document.getElementById('oil-detail-content').innerHTML=[
      ['日期',r.date],['方案',r.plan||'-'],
      ['當日油錢',this.fmtM(r.daily)],['自助折扣',this.fmtM(r.selfDisc)],
      ['刷卡折扣',this.fmtM(r.cardDisc)],['總折扣',this.fmtM(r.totalDisc)],
      ['實際油錢',`<span style="color:#dc2626;font-weight:700">${this.fmtM(r.actual)}</span>`],
      ['公升數',(r.liters||'-')+' L'],
      ['總里程',this.fmt(r.totalKm)+' km'],['里程',r.km&&r.km!=='-'?r.km+' km':'-'],
      ['油耗',r.efficiency&&r.efficiency!=='-'?r.efficiency+' km/L':'-'],
      ['油錢/km',r.costPerKm&&r.costPerKm!=='-'?'$'+r.costPerKm:'-'],['折扣/L',r.discPerL||'-'],
    ].map(([k,v])=>`<div class="detail-field"><span class="detail-key">${k}</span><span class="detail-val">${v}</span></div>`).join('');
    document.getElementById('oil-detail-edit-btn').onclick=()=>{this._detailFromSearch=false;this.closeModal('modal-oil-detail');this._openOilModal(r);};
    document.getElementById('oil-detail-del-btn').onclick=()=>{this._detailFromSearch=false;this._deleteOil(r);};
    this.openModal('modal-oil-detail');
  },

  async _deleteOil(r){
    if(!confirm('確定刪除這筆加油記錄？')) return;
    try{await SHEETS.deleteOilRow(r._row);this.closeModal('modal-oil-detail');this.toast('🗑️ 已刪除');this.loadOil();}
    catch(e){this.toast('❌ '+e.message);}
  },

  _openExpenseModal(r=null){
    const cat=r?r.cat:'保養';
    this._expCat=cat;
    this._editExpRow=r?r._row:null;
    document.getElementById('modal-add-expense').querySelector('.modal-title').textContent=r?'修改開支記錄':'新增開支記錄';
    document.getElementById('exp-date').value=r?(r.date.replace(/\//g,'-')):this.todayISO();
    document.getElementById('exp-amount').value=r?String(r.amount).replace(/[^0-9.]/g,''):'';
    document.getElementById('exp-note').value=r?r.note||'':'';
    document.getElementById('exp-mileage').value=r?String(r.mileage||'').replace(/[^0-9]/g,''):'';
    document.querySelectorAll('#exp-cat-chips .chip').forEach(c=>c.classList.toggle('on',c.textContent.trim()===cat));
    this._renderExpItemChips(cat);
    // 填入 item 需在 renderExpItemChips 之後，讓 chip 先渲染完畢
    document.getElementById('exp-item').value=r?r.item:'';
    this.openModal('modal-add-expense');
  },

  selectExpCat(btn,cat){
    this._expCat=cat;
    document.querySelectorAll('#exp-cat-chips .chip').forEach(c=>c.classList.toggle('on',c===btn));
    this._renderExpItemChips(cat);
  },

  _renderExpItemChips(cat){
    const chipWrap=document.getElementById('exp-item-chips');
    if(cat==='稅費'){
      chipWrap.innerHTML=`<button class="chip" onclick="APP._selectExpItem(this,'牌照稅')">牌照稅</button><button class="chip" onclick="APP._selectExpItem(this,'燃料費')">燃料費</button>`;
      chipWrap.style.display='flex';
      document.getElementById('exp-item').value='';
    }else{chipWrap.innerHTML='';chipWrap.style.display='none';}
  },

  _selectExpItem(btn,item){
    document.querySelectorAll('#exp-item-chips .chip').forEach(c=>c.classList.toggle('on',c===btn));
    document.getElementById('exp-item').value=item;
  },

  async saveExpense(){
    const date=document.getElementById('exp-date').value.replace(/-/g,'/');
    const item=document.getElementById('exp-item').value.trim();
    const amount=document.getElementById('exp-amount').value;
    if(!date||!item||!amount){this.toast('請填入日期、項目和金額');return;}
    try{
      this.toast('儲存中…');
      const rawMileage=document.getElementById('exp-mileage').value.replace(/[^0-9]/g,'');
      const row={date,cat:this._expCat,item,amount,note:document.getElementById('exp-note').value,mileage:rawMileage};
      if(this._editExpRow){
        await SHEETS.updateGasExpRow(this._editExpRow,row);
        this._editExpRow=null;
      } else {
        await SHEETS.addGasExpense(row);
      }
      this.closeModal('modal-add-expense');
      this.toast('✅ 已儲存');
      SHEETS.clearCache('gasExp');
      this._loaded['car_expense']=false;
      this.loadGasExpense();
    }catch(e){this.toast('❌ '+e.message);}
  },


  showExpDetail(idx){
    const r=this._getRow(idx);
    if(!r) return;
    document.getElementById('exp-detail-content').innerHTML=[
      ['日期',r.date],['類別',r.cat],['項目',r.item],
      ['金額',`<span style="color:#dc2626;font-weight:700;font-size:1.2rem">${this.fmtM(r.amount)}</span>`],
      ['備註',r.note||'-'],['里程',r.mileage?r.mileage+' km':'-'],
    ].map(([k,v])=>`<div class="detail-field"><span class="detail-key">${k}</span><span class="detail-val">${v}</span></div>`).join('');
    document.getElementById('exp-detail-edit-btn').onclick=()=>{this._detailFromSearch=false;this.closeModal('modal-exp-detail');this._openExpenseModal(r);};
    document.getElementById('exp-detail-del-btn').onclick=()=>{this._detailFromSearch=false;this._deleteGasExp(r);};
    this.openModal('modal-exp-detail');
  },

  async _deleteGasExp(r){
    if(!confirm('確定刪除這筆開支記錄？')) return;
    try{
      await SHEETS.deleteGasExpRow(r._row);
      this.closeModal('modal-exp-detail');
      this.toast('🗑️ 已刪除');
      this.loadGasExpense();
    }catch(e){this.toast('❌ '+e.message);}
  },

  async _openDataModal(r=null,isPrev=false){
    this._editDataRow=r?r._row:null;
    document.getElementById('modal-data-title').textContent=r?'修改收支記錄':'新增收支記錄';
    if(r){
      document.getElementById('data-date').value=r.date.replace(/\//g,'-');
      document.getElementById('data-amount').value=String(r.amount).replace(/,/g,'');
      document.getElementById('data-note').value=r.note||'';
      this._dataIOSelected=r.io; this._dataItemSelected=r.item; this._dataNoteSelected=r.note||'';
    }else{
      document.getElementById('data-date').value=isPrev?this.prevMonthLastDay():this.todayISO();
      document.getElementById('data-amount').value=''; document.getElementById('data-note').value='';
      this._dataIOSelected='Inc.'; this._dataItemSelected=''; this._dataNoteSelected=''; this._dataCounted='TRUE';
    }
    if(r){ this._dataCounted = r.counted==='FALSE'?'FALSE':'TRUE'; }
    try{this._dataOpts=await SHEETS.loadOptions();}catch(e){this._dataOpts=[];}
    // Reset IO chips
    document.querySelectorAll('.data-io-chip').forEach(c=>{
      c.classList.remove('on-inc','on-exp');
    });
    this._renderDataChips();
    this._renderCountedChips();
    this.openModal('modal-add-data');
  },

  selectDataIO(io){
    this._dataIOSelected=io; this._dataItemSelected=''; this._dataNoteSelected=''; this._dataCounted='TRUE';
    this._renderDataChips();
    this._renderCountedChips();
  },

  _renderDataChips(){
    const io=this._dataIOSelected;
    document.querySelectorAll('.data-io-chip').forEach(c=>{
      c.classList.remove('on-inc','on-exp');
      if(c.dataset.io===io) c.classList.add(io==='Inc.'?'on-inc':'on-exp');
    });
    const items=[...new Set(this._dataOpts.filter(o=>o.io===io).map(o=>o.item))];
    document.getElementById('data-item-chips').innerHTML=items.map(item=>
      `<button class="chip${item===this._dataItemSelected?' on':''}" onclick="APP.selectDataItem('${item}')">${item}</button>`
    ).join('');
    this._renderNoteChips();
  },

  selectDataItem(item){
    if(item !== this._dataItemSelected){
      // Clear note when switching items
      this._dataNoteSelected='';
      document.getElementById('data-note').value='';
    }
    this._dataItemSelected=item;
    document.querySelectorAll('#data-item-chips .chip').forEach(c=>c.classList.toggle('on',c.textContent===item));
    this._renderNoteChips();
    this._renderCountedChips(); // update counted visibility based on item
  },

  _renderNoteChips(){
    const noteWrap=document.getElementById('data-note-chips');
    const notes=this._dataOpts.filter(o=>o.io===this._dataIOSelected&&o.item===this._dataItemSelected&&o.note).map(o=>o.note);
    if(notes.length){
      noteWrap.innerHTML=notes.map(n=>`<button class="chip${n===this._dataNoteSelected?' on':''}" onclick="APP.selectDataNote('${n}')">${n}</button>`).join('');
      noteWrap.style.display='flex';
    }else{noteWrap.innerHTML='';noteWrap.style.display='none';}
  },

  selectDataNote(note){
    this._dataNoteSelected=note;
    document.querySelectorAll('#data-note-chips .chip').forEach(c=>c.classList.toggle('on',c.textContent===note));
    document.getElementById('data-note').value=note;
  },

  _renderCountedChips(){
    const wrap=document.getElementById('data-counted-wrap');
    const io=this._dataIOSelected;
    const item=this._dataItemSelected;
    // Show only for Exp. AND item is NOT 信用卡
    if(io==='Exp.' && item !== '信用卡'){
      wrap.style.display='block';
      if(!this._dataCounted) this._dataCounted='TRUE';
      document.querySelectorAll('.data-counted-chip').forEach(c=>{
        c.classList.toggle('on', c.dataset.counted===this._dataCounted);
      });
    }else{
      wrap.style.display='none';
      // 信用卡 defaults to TRUE
      this._dataCounted = 'TRUE';
    }
  },

  selectDataCounted(val){
    this._dataCounted=val;
    document.querySelectorAll('.data-counted-chip').forEach(c=>c.classList.toggle('on',c.dataset.counted===val));
  },

  async saveData(){
    const date=document.getElementById('data-date').value.replace(/-/g,'/');
    const amount=document.getElementById('data-amount').value.replace(/,/g,'');
    const note=document.getElementById('data-note').value||this._dataNoteSelected;
    const io=this._dataIOSelected, item=this._dataItemSelected;
    if(!date||!amount||!item){this.toast('請填入日期、金額和項目');return;}
    try{
      this.toast('儲存中…');
      const counted=this._dataCounted||'TRUE';
      if(this._editDataRow) await SHEETS.updateData(this._editDataRow,{date,amount,io,item,note,counted});
      else await SHEETS.addData({date,amount,io,item,note,counted});
      this.closeModal('modal-add-data');
      this.toast('✅ 已儲存');
      if(this.subDetail==='curMonth') this.loadCurMonth();
      else if(this.subDetail==='prevMonth') this.loadPrevMonth();
      this._refreshOverviewLater(); // 延遲 3 秒刷新統計
    }catch(e){this.toast('❌ '+e.message);}
  },

  showDataDetail(idx){
    const r=this._getRow(idx);
    if(!r) return;
    const isInc=r.io==='Inc.';
    const amtColor=isInc?'#0ea572':'#dc2626';
    document.getElementById('data-detail-content').innerHTML=[
      ['日期',r.date],
      ['收支',`<span style="color:${amtColor};font-weight:700">${isInc?'收入 Inc.':'支出 Exp.'}</span>`],
      ['項目',r.item],
      ['金額',`<span style="color:${amtColor};font-weight:700;font-size:1.2rem">${isInc?'+':'-'}${this.fmtM(r.amount)}</span>`],
      ['備註',r.note||'-'],
      ['計入總額',r.counted==='TRUE'?'是':'否'],
    ].map(([k,v])=>`<div class="detail-field"><span class="detail-key">${k}</span><span class="detail-val">${v}</span></div>`).join('');
    document.getElementById('data-detail-edit-btn').onclick=()=>{this._detailFromSearch=false;this.closeModal('modal-data-detail');this._openDataModal(r,false);};
    document.getElementById('data-detail-del-btn').onclick=()=>{this._detailFromSearch=false;this._deleteData(r);};
    this.openModal('modal-data-detail');
  },

  async _deleteData(r){
    if(!confirm('確定刪除這筆記錄？')) return;
    try{
      await SHEETS.deleteDataRow(r._row);
      this.closeModal('modal-data-detail');
      this.toast('🗑️ 已刪除');
      if(this.subDetail==='curMonth') this.loadCurMonth();
      else this.loadPrevMonth();
      this._refreshOverviewLater(); // 延遲 3 秒刷新統計
    }catch(e){this.toast('❌ '+e.message);}
  },
};

// callback 路徑由 index.html 處理，不執行 APP.init()
window.addEventListener('DOMContentLoaded', () => {
  if (window.location.pathname !== '/auth/callback') APP.init();
});
