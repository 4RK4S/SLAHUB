
'use strict';

(function () {
  const API = {
    state: '/api/hunter-guess/state',
    hunters: '/api/hunter-guess/hunters',
    submit: '/api/hunter-guess/submit',
    leaderboard: '/api/hunter-guess/leaderboard',
    practiceState: '/api/hunter-guess/practice/state',
    practiceStart: '/api/hunter-guess/practice/start',
    practiceSubmit: '/api/hunter-guess/practice/submit',
    adminHunters: '/api/admin/hunter-guess/hunters',
    adminDaily: '/api/admin/hunter-guess/daily',
    adminRewards: '/api/admin/hunter-guess/rewards',
    adminSaveRewards: '/api/admin/hunter-guess/rewards',
    adminCompensate: '/api/admin/hunter-guess/compensate-today',
    adminSave: '/api/admin/hunter-guess/hunters',
    adminImport: '/api/admin/hunter-guess/import'
  };

  let state = null;
  let hunters = [];
  let leaderboard = [];
  let leaderboardMeta = null;
  let weeklyRewardRows = [];
  let weeklyRewardMeta = null;
  let rewardSettings = null;
  let rewardDraft = null;
  let leaderboardMode = (() => { try { return localStorage.getItem('hunter_guess_leaderboard_mode') || 'weekly'; } catch (_) { return 'weekly'; } })();
  let rewardsModalTab = 'daily';
  let adminTab = (() => { try { const v = localStorage.getItem('hunter_guess_admin_tab') || 'answer'; return v === 'import' ? 'answer' : v; } catch (_) { return 'answer'; } })();
  let adminRewardTab = 'daily';
  let compensationResult = null;
  let practiceState = null;
  let selectedHunterId = '';
  const TAB_STORAGE_KEY = 'hunter_guess_active_tab';
  const FILTERS_COLLAPSED_KEY = 'hunter_guess_filters_collapsed';
  const HIDE_ADMIN_BUTTONS_KEY = 'sla_hide_admin_buttons';

  function initialTab() {
    try {
      const qp = new URLSearchParams(location.search || '');
      const raw = qp.get('tab') || localStorage.getItem(TAB_STORAGE_KEY) || 'play';
      return ['play', 'leaderboard', 'hunterList', 'admin'].includes(raw) ? raw : 'play';
    } catch (_) { return 'play'; }
  }

  function rememberTab(nextTab, updateUrl = true) {
    if (!['play', 'leaderboard', 'hunterList', 'admin'].includes(nextTab)) nextTab = 'play';
    tab = nextTab;
    try { localStorage.setItem(TAB_STORAGE_KEY, tab); } catch (_) {}
    if (updateUrl) {
      try {
        const u = new URL(location.href);
        if (tab === 'play') u.searchParams.delete('tab');
        else u.searchParams.set('tab', tab);
        history.replaceState(history.state, '', `${u.pathname}${u.search}${u.hash}`);
      } catch (_) {}
    }
  }

  let tab = initialTab();
  let playMode = 'daily';
  let busy = false;
  let adminDraft = null;
  let adminDaily = null;
  let helperFilters = { q: '', element: [], rarity: [], className: [], type: [], limited: [], guild: [] };
  let helperFiltersCollapsed = (() => {
    try { return localStorage.getItem(FILTERS_COLLAPSED_KEY) === '1'; } catch (_) { return false; }
  })();

  function apiPath(path) {
    if (typeof window.apiPath === 'function') return window.apiPath(path);
    if (typeof window.url === 'function') return window.url(path);
    const base = String(window.__BASE_PATH__ || window.BASE_PATH || window.__SLA_BASE__ || '').replace(/\/+$/, '');
    const tail = String(path || '').startsWith('/') ? path : `/${path}`;
    return base ? base + tail : tail;
  }

  async function request(path, options = {}) {
    const res = await fetch(apiPath(path), {
      credentials: 'include',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.ok === false) throw new Error(json.error || `Request failed (${res.status})`);
    return json;
  }

  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null) continue;
      if (k === 'class') node.className = String(v);
      else if (k === 'html') node.innerHTML = String(v);
      else if (k === 'style' && v && typeof v === 'object') Object.assign(node.style, v);
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
      else if (typeof v === 'boolean') { if (v) node.setAttribute(k, ''); }
      else node.setAttribute(k, String(v));
    }
    for (const ch of children.flat()) {
      if (ch == null || ch === false) continue;
      node.append(ch instanceof Node ? ch : document.createTextNode(String(ch)));
    }
    return node;
  }

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m]));
  }

  function toast(msg) {
    if (typeof window.showToast === 'function') return window.showToast(msg);
    console.log('[HunterGuess]', msg);
  }

  function isAdmin() {
    return !!window.STATE?.isAdmin;
  }

  function adminButtonsHidden() {
    try { return localStorage.getItem(HIDE_ADMIN_BUTTONS_KEY) === '1'; } catch (_) { return false; }
  }

  function isAdminTabVisible() {
    return isAdmin() && !adminButtonsHidden();
  }

  function isGuest() {
    return !!(state?.guest || state?.loginRequired || state?.canGuess === false);
  }

  function hunterIconBaseFromName(h) {
    return String(h?.name || h?.hunter || '')
      .trim()
      .replace(/['"’]/g, '')
      .replace(/,/g, '')
      .replace(/[^A-Za-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  function normalizeAssetPath(s) {
    const raw = String(s || '').trim().replace(/\\/g, '/');
    if (!raw) return '';
    if (/^https?:\/\//i.test(raw) || raw.startsWith('data:')) return raw;
    if (raw.startsWith('/picture/')) return typeof window.url === 'function' ? window.url(raw) : raw;
    if (raw.startsWith('picture/')) {
      const p = `/${raw}`;
      return typeof window.url === 'function' ? window.url(p) : p;
    }
    if (raw.startsWith('Hunter_Icon/')) {
      const p = `/picture/${raw}`;
      return typeof window.url === 'function' ? window.url(p) : p;
    }
    return raw;
  }

  function hunterIconCandidates(h) {
    const out = [];
    const push = v => {
      const n = normalizeAssetPath(v);
      if (n && !out.includes(n)) out.push(n);
    };

    if (Array.isArray(h?.avatarCandidates)) h.avatarCandidates.forEach(push);
    push(h?.avatar);

    const base = hunterIconBaseFromName(h);
    if (base) {
      // Files are mixed on your server, e.g. Anna_Ruiz.png and ALICIA_BLANCHE.png.
      push(`/picture/Hunter_Icon/${base}.png`);
      push(`/picture/Hunter_Icon/${base.toUpperCase()}.png`);
      push(`/picture/Hunter_Icon/${base.toLowerCase()}.png`);
    }

    return out;
  }

  function avatarSrc(h) {
    const candidates = hunterIconCandidates(h);
    const first = candidates[0] || '';
    if (first && typeof window.cdny === 'function' && /^https?:\/\//i.test(first)) return window.cdny(first, 96);
    return first;
  }

  function avatarImg(h, className = '', alt = '') {
    return el('img', {
      ...(className ? { class: className } : {}),
      src: avatarSrc(h),
      alt: alt || h?.name || '',
      onerror: ev => {
        const img = ev.currentTarget;
        const candidates = hunterIconCandidates(h);
        const idx = Number(img.dataset.hgFallbackIndex || '0');
        const next = candidates[idx + 1];
        if (next) {
          img.dataset.hgFallbackIndex = String(idx + 1);
          img.src = next;
          return;
        }
        img.style.visibility = 'hidden';
      }
    });
  }

  function resultClass(v) {
    return v ? 'hg-cell correct' : 'hg-cell wrong';
  }

  function pointsFor(i) {
    return Number(state?.pointsTable?.[i] || 0);
  }

  function ticketsFor(i) {
    return Number(state?.ticketTable?.[i] || 0);
  }

  function rewardNum(v) {
    const n = Math.floor(Number(v || 0));
    return Number.isFinite(n) ? Math.max(0, n) : 0;
  }

  function emptyReward() {
    return { points: 0, drawTickets: 0, weaponTickets: 0, gold: 0, essence: 0 };
  }

  function cleanReward(r = {}) {
    return {
      points: rewardNum(r.points),
      drawTickets: rewardNum(r.drawTickets ?? r.customTickets ?? r.tickets),
      weaponTickets: rewardNum(r.weaponTickets),
      gold: rewardNum(r.gold),
      essence: rewardNum(r.essence)
    };
  }


  function currencyIcon(name, className = 'hg-reward-icon') {
    const map = {
      draw: 'Draw_Tickets.png',
      drawTickets: 'Draw_Tickets.png',
      weapon: 'Weapon_Tickets.png',
      weaponTickets: 'Weapon_Tickets.png',
      gold: 'Gold.png',
      essence: 'Essence.png'
    };
    const file = map[name];
    return file ? el('img', { class: className, src: assetUrl(`/picture/MiniGame/Currency/${file}`), alt: String(name || '') }) : null;
  }

  function rewardNode(r = {}, opts = {}) {
    const x = cleanReward(r);
    const rows = [];
    const line = (type, iconName, text) => el('div', { class: `hg-reward-line hg-reward-${type}` }, iconName ? currencyIcon(iconName) : '⭐ ', el('span', {}, text));
    if (opts.includePoints !== false && x.points) rows.push(line('points', null, `${x.points} pts`));
    if (x.drawTickets) rows.push(line('draw', 'draw', `${x.drawTickets} draw tickets`));
    if (x.weaponTickets) rows.push(line('weapon', 'weapon', `${x.weaponTickets} weapon tickets`));
    if (x.gold) rows.push(line('gold', 'gold', `${x.gold} gold`));
    if (x.essence) rows.push(line('essence', 'essence', `${x.essence} essence`));
    return rows.length ? el('div', { class: 'hg-reward-lines' }, rows) : el('span', { class: 'hg-muted' }, 'None');
  }

  function rewardParts(r = {}, { includePoints = true } = {}) {
    const x = cleanReward(r);
    const parts = [];
    if (includePoints && x.points) parts.push(`⭐ ${x.points} pts`);
    if (x.drawTickets) parts.push(`🎟️ ${x.drawTickets} draw tickets`);
    if (x.weaponTickets) parts.push(`⚔️ ${x.weaponTickets} weapon tickets`);
    if (x.gold) parts.push(`🪙 ${x.gold} gold`);
    if (x.essence) parts.push(`💎 ${x.essence} essence`);
    return parts;
  }

  function rewardText(r = {}, opts = {}) {
    const parts = rewardParts(r, opts);
    return parts.length ? parts.join(' · ') : 'None';
  }

  function compactRewardText(r = {}) {
    const x = cleanReward(r);
    const parts = [];
    if (x.drawTickets) parts.push(`${x.drawTickets} draw tickets`);
    if (x.weaponTickets) parts.push(`${x.weaponTickets} weapon tickets`);
    if (x.gold) parts.push(`${x.gold} gold`);
    if (x.essence) parts.push(`${x.essence} essence`);
    return parts.join(' · ') || 'No item rewards';
  }

  function compactRewardNode(r = {}) {
    const x = cleanReward(r);
    const items = [];
    const item = (currency, text) => el('span', { class: 'hg-result-reward-item' }, currencyIcon(currency, 'hg-result-reward-icon'), el('span', {}, text));
    if (x.drawTickets) items.push(item('draw', `${x.drawTickets} draw tickets`));
    if (x.weaponTickets) items.push(item('weapon', `${x.weaponTickets} weapon tickets`));
    if (x.gold) items.push(item('gold', `${x.gold} gold`));
    if (x.essence) items.push(item('essence', `${x.essence} essence`));
    return items.length ? el('span', { class: 'hg-result-reward-items' }, items) : el('span', {}, 'No item rewards');
  }

  function addRewards(...rewards) {
    return rewards.reduce((total, reward) => {
      const clean = cleanReward(reward || {});
      for (const key of Object.keys(total)) total[key] += Number(clean[key] || 0);
      return total;
    }, emptyReward());
  }

  function activeDailyRewardGuess() {
    const s = state || {};
    if (isGuest()) return 0;
    if (s?.finished && s?.result?.solved) return Number(s.result.guessesUsed || 0);
    const next = Number(s?.guessesUsed || 0) + 1;
    return Math.max(1, Math.min(8, next));
  }


  function currentStreakDays() {
    const values = [state?.result?.streakDays, state?.streakDays, state?.currentStreak, leaderboardMeta?.currentUser?.streakDays];
    for (const v of values) {
      const n = Number(v || 0);
      if (Number.isFinite(n) && n > 0) return n;
    }
    return 0;
  }

  function activeStreakRewardDays(rows = []) {
    const paid = state?.result?.streakReward;
    const cleanPaid = cleanReward(paid || {});
    if (!paid || !Object.keys(cleanPaid).some(key => Number(cleanPaid[key] || 0) > 0)) return 0;
    const matched = Number(Array.isArray(paid.matchedDays) ? paid.matchedDays[0] : 0);
    if (matched) return matched;
    const streak = currentStreakDays();
    if (!streak) return 0;
    const sorted = (Array.isArray(rows) ? rows : []).map(r => Number(r.days || 0)).filter(Boolean).sort((a, b) => a - b);
    let best = 0;
    for (const d of sorted) if (streak >= d) best = d;
    return best;
  }

  function currentWeeklyRewardKey() {
    const rows = (weeklyRewardRows && weeklyRewardRows.length) ? weeklyRewardRows : (leaderboardMode === 'weekly' ? leaderboard : []);
    const me = (rows || []).find(r => r.currentUser);
    const rank = Number(me?.rank || 0);
    if (!rank) return '';
    if (rank <= 3) return String(rank);
    if (rank <= 10) return 'top10';
    return 'participation';
  }

  async function refreshWeeklyRewardRows() {
    try {
      const lb = await request(`${API.leaderboard}?period=weekly`);
      weeklyRewardRows = Array.isArray(lb.rows) ? lb.rows : [];
      weeklyRewardMeta = lb || null;
      rewardSettings = lb.rewardSettings || rewardSettings;
    } catch (_) {}
  }

  function countdownText(iso) {
    const end = new Date(iso || '').getTime();
    if (!Number.isFinite(end)) return '';
    const ms = Math.max(0, end - Date.now());
    const d = Math.floor(ms / 86400000);
    const h = Math.floor((ms % 86400000) / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    if (d) return `${d}d ${h}h ${m}m`;
    if (h) return `${h}h ${m}m`;
    return `${m}m`;
  }

  function cloneRewards(src) {
    const base = src || rewardSettings || state?.rewardSettings || leaderboardMeta?.rewardSettings || {};
    const out = { daily: {}, streak: [], weekly: {} };
    for (let i = 1; i <= 8; i++) out.daily[i] = cleanReward(base.daily?.[i] || base.daily?.[String(i)] || {});
    out.daily.failed = cleanReward(base.daily?.failed || {});
    out.streak = (Array.isArray(base.streak) ? base.streak : []).map(row => ({ days: rewardNum(row.days) || 1, ...cleanReward(row) }));
    for (const key of ['1', '2', '3', 'top10', 'participation']) out.weekly[key] = cleanReward(base.weekly?.[key] || {});
    return out;
  }

  async function loadAll() {
    const [h, s, lb] = await Promise.all([
      request(API.hunters),
      request(API.state),
      request(`${API.leaderboard}?period=${encodeURIComponent(leaderboardMode)}`).catch(() => ({ rows: [] }))
    ]);
    hunters = (Array.isArray(h.hunters) ? h.hunters : [])
      .slice()
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' }));
    state = s;
    leaderboard = Array.isArray(lb.rows) ? lb.rows : [];
    leaderboardMeta = lb || null;
    if (leaderboardMode === 'weekly') { weeklyRewardRows = leaderboard; weeklyRewardMeta = lb || null; }
    rewardSettings = s.rewardSettings || lb.rewardSettings || rewardSettings;
    if (isAdmin()) {
      try { adminDaily = await request(API.adminDaily); } catch (_) { adminDaily = null; }
      try { const rr = await request(API.adminRewards); rewardSettings = rr.rewards || rewardSettings; rewardDraft = null; } catch (_) {}
    }
    if (!isGuest() && state?.finished) {
      try { practiceState = await request(API.practiceState); } catch (_) { practiceState = null; }
    }
  }

  function currentGuessState() {
    return playMode === 'practice' ? practiceState : state;
  }

  async function startPractice(reset = true) {
    if (isGuest()) {
      toast('Please log in to submit guesses.');
      return;
    }
    if (busy) return;
    busy = true;
    try {
      practiceState = await request(API.practiceStart, { method: 'POST', body: JSON.stringify({ reset: !!reset }) });
      playMode = 'practice';
      selectedHunterId = '';
      busy = false;
      render();
    } catch (e) {
      toast(e.message || 'Could not start practice');
    } finally {
      busy = false;
    }
  }

  function backToDaily() {
    playMode = 'daily';
    selectedHunterId = '';
    render();
  }

  function injectCss() {
    if (document.getElementById('hunter-guess-css')) return;
    const style = document.createElement('style');
    style.id = 'hunter-guess-css';
    style.textContent = `
      .hg-page{max-width:1180px;margin:0 auto;padding:28px 16px 64px;color:#e5e7eb}
      .hg-header{display:block;margin-bottom:14px}
      .hg-title{font-size:clamp(32px,5vw,56px);font-weight:900;line-height:1;margin:0;color:#fff}
      .hg-sub{color:#94a3b8;margin-top:8px;font-size:16px}.hg-date{color:#facc15;font-weight:800}
      .hg-actions{display:flex;gap:10px;flex-wrap:wrap}.hg-btn{min-height:40px;box-sizing:border-box;border:1px solid rgb(51 65 85 / .6);border-radius:12px;padding:9px 14px;font-weight:700;cursor:pointer;background:rgba(15,23,42,.55);color:#e2e8f0;transition:background-color .15s ease,border-color .15s ease,box-shadow .15s ease,color .15s ease}.hg-btn:not(:disabled):hover{background:rgb(30 41 59 / .5);border-color:rgba(226,232,240,.34);color:#fff;transform:none}.hg-btn.primary{background:#facc15;color:#111827;border-color:#fde047;box-shadow:0 1px 3px rgba(0,0,0,.25)}.hg-btn.primary:not(:disabled):hover{background:#facc15;border-color:#fde047;color:#111827;transform:none}.hg-btn:focus-visible{outline:0;box-shadow:0 0 0 3px rgba(250,204,21,.22)}.hg-btn:disabled{opacity:.45;cursor:not-allowed;transform:none}
      .hg-card{background:rgba(15,23,42,.78);border:1px solid rgba(148,163,184,.22);border-radius:22px;box-shadow:0 20px 60px rgba(0,0,0,.25);padding:18px;margin-bottom:18px}.hg-card.warning{border-color:rgba(250,204,21,.45)}
      .hg-how{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.hg-how div{background:rgba(15,23,42,.78);border:1px solid rgba(255,255,255,.06);border-radius:16px;padding:12px;color:#cbd5e1;font-size:13px}
      .hg-dots{display:flex;justify-content:center;gap:10px;margin-bottom:8px}.hg-dot{width:14px;height:14px;border-radius:50%;background:#334155;border:1px solid #64748b}.hg-dot.used{background:#facc15;border-color:#facc15}.hg-dot.win{background:#22c55e;border-color:#22c55e}.hg-dot.fail{background:#ef4444;border-color:#ef4444}.hg-muted{color:#94a3b8}.hg-center{text-align:center}
      .hg-search-row{display:flex;gap:10px}.hg-search-wrap{position:relative;flex:1}.hg-input{width:100%;background:#020617;color:#fff;border:1px solid #334155;border-radius:14px;padding:13px 14px;outline:none}.hg-input:focus{border-color:#facc15;box-shadow:0 0 0 3px rgba(250,204,21,.14)}
      .hg-dropdown{position:absolute;z-index:50;top:calc(100% + 6px);left:0;right:0;background:#0f172a;border:1px solid #334155;border-radius:16px;max-height:310px;overflow:auto;padding:6px;box-shadow:0 20px 40px rgba(0,0,0,.45)}.hg-option{display:flex;align-items:center;gap:10px;padding:9px;border-radius:12px;cursor:pointer}.hg-option:hover{background:rgba(250,204,21,.12)}.hg-option img,.hg-avatar{width:38px;height:38px;object-fit:cover;border-radius:999px;background:#1e293b}.hg-option small{color:#94a3b8}.hg-hidden{display:none!important}.hg-error{color:#f87171;margin-top:8px;font-size:13px;font-weight:700}
      .hg-table-wrap{overflow:auto;border-radius:18px;border:1px solid rgba(148,163,184,.18)}.hg-table{width:100%;border-collapse:separate;border-spacing:0;background:rgba(2,6,23,.5)}.hg-table th{position:sticky;top:0;background:#111827;color:#cbd5e1;padding:12px;font-size:13px;white-space:nowrap}.hg-table td{padding:10px 12px;border-top:1px solid rgba(148,163,184,.12);white-space:nowrap}.hg-hunter-cell{display:flex;align-items:center;gap:10px;text-align:left;font-weight:900}.hg-cell{font-weight:900;border-radius:10px;text-align:center!important;vertical-align:middle!important}.hg-cell.correct{background:rgba(34,197,94,.18);color:#86efac}.hg-cell.wrong{background:rgba(239,68,68,.18);color:#fca5a5}
      .hg-banner{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px;border-radius:18px;margin-bottom:18px}.hg-banner.win{background:rgba(34,197,94,.16);border:1px solid rgba(34,197,94,.35)}.hg-banner.fail{background:rgba(239,68,68,.14);border:1px solid rgba(239,68,68,.32)}
      .hg-tabs{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px}.hg-tab{background:rgba(15,23,42,.55);color:#e2e8f0;text-decoration:none;display:inline-flex;align-items:center;justify-content:center}.hg-tab.active{background:#facc15;color:#000;border-color:#fde047;box-shadow:0 1px 3px rgba(0,0,0,.25)}.hg-tab.active:not(:disabled):hover{background:#facc15;color:#000;border-color:#fde047;box-shadow:0 1px 3px rgba(0,0,0,.25)}.hg-main-nav{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;width:100%;margin-bottom:18px}.hg-main-nav.has-admin{grid-template-columns:repeat(4,minmax(0,1fr))}.hg-main-nav .hg-tab{width:100%;font-size:16px;font-weight:600}.hg-score-card{border-color:rgba(250,204,21,.55);box-shadow:0 0 0 1px rgba(250,204,21,.12) inset}.hg-score-layout{display:grid;grid-template-columns:1fr minmax(220px,.48fr);gap:16px;align-items:center}.hg-score-grid{display:grid;grid-template-columns:1fr 120px 120px;gap:0;overflow:hidden;border-radius:16px;border:1px solid rgba(148,163,184,.16)}.hg-score-grid div{padding:10px;border-bottom:1px solid rgba(148,163,184,.12);background:rgba(255,255,255,.03)}.hg-score-grid div:nth-child(-n+3){background:#111827;font-weight:900;color:#fff}.hg-score-grid div:nth-last-child(-n+3){border-bottom:0}.hg-score-side{border:1px solid rgba(148,163,184,.16);border-radius:14px;padding:14px;background:rgba(255,255,255,.035);display:grid;gap:10px;color:#cbd5e1;font-size:13px;font-weight:700}.hg-ticket-pill{display:inline-flex;align-items:center;justify-content:center;border-radius:8px;padding:4px 9px;background:#2563eb;color:white;font-weight:1000;font-size:12px}.hg-fast-pill{display:inline-flex;margin-left:8px;border-radius:7px;padding:3px 7px;background:#16a34a;color:white;font-size:11px;font-weight:1000}
      .hg-lb-row{display:grid;grid-template-columns:96px 1fr repeat(5,110px);gap:12px;align-items:center;padding:18px;border-radius:18px;background:linear-gradient(90deg,rgba(255,255,255,.075),rgba(255,255,255,.025));border:1px solid rgba(148,163,184,.32);margin-bottom:12px}.hg-lb-row.rank-1{border-color:#facc15;background:linear-gradient(90deg,rgba(250,204,21,.18),rgba(250,204,21,.055));box-shadow:0 0 28px rgba(250,204,21,.10) inset}.hg-lb-row.rank-2{border-color:rgba(226,232,240,.72);background:linear-gradient(90deg,rgba(226,232,240,.14),rgba(226,232,240,.04))}.hg-lb-row.rank-3{border-color:rgba(251,146,60,.75);background:linear-gradient(90deg,rgba(251,146,60,.13),rgba(251,146,60,.04))}.hg-lb-row.me{outline:2px solid rgba(250,204,21,.9);outline-offset:-2px}.hg-rank{display:flex;align-items:center;justify-content:center;flex-direction:column;font-size:15px;font-weight:1000;color:#facc15;border-right:1px solid rgba(148,163,184,.18);min-height:54px}.hg-rank-medal{font-size:30px;line-height:1}.hg-rank-num{font-size:14px;margin-top:2px}.hg-lb-name{font-size:16px;font-weight:1000;color:#fff}.hg-stat-label{font-size:11px;color:#94a3b8;text-transform:uppercase}.hg-stat-value{font-size:17px;font-weight:1000;color:#fff}.hg-best-pill{display:inline-flex;border-radius:8px;padding:4px 10px;background:#16a34a;color:#fff;font-weight:1000}.hg-admin-area textarea{width:100%;min-height:220px;background:#020617;color:#fff;border:1px solid #334155;border-radius:14px;padding:12px;font-family:monospace;font-size:12px}.hg-admin-table-wrap{overflow:auto;border:1px solid rgba(148,163,184,.18);border-radius:16px}.hg-admin-table{width:100%;border-collapse:separate;border-spacing:0}.hg-admin-table th{position:sticky;top:0;background:#111827;color:#cbd5e1;padding:10px;font-size:12px;white-space:nowrap}.hg-admin-table td{padding:8px;border-top:1px solid rgba(148,163,184,.12);vertical-align:middle}.hg-admin-input{width:100%;min-width:130px;background:#020617;color:#fff;border:1px solid #334155;border-radius:10px;padding:9px 10px;outline:none}.hg-admin-input:focus{border-color:#facc15;box-shadow:0 0 0 2px rgba(250,204,21,.14)}.hg-admin-answer{margin:14px 0;padding:14px;border-radius:16px;border:1px solid rgba(250,204,21,.22);background:rgba(250,204,21,.07)}.hg-admin-answer-main{margin-top:10px;display:flex;gap:12px;align-items:center}
      .hg-filter{width:100%;background:#020617;color:#fff;border:1px solid #334155;border-radius:12px;padding:10px 11px;outline:none}.hg-filter:focus{border-color:#facc15;box-shadow:0 0 0 2px rgba(250,204,21,.14)}.hg-helper-search{margin-bottom:12px}.hg-helper-search-input{min-height:46px}.hg-filter-toggle-row{display:flex;justify-content:space-between;align-items:center;gap:10px;margin:10px 0 12px}.hg-filter-toggle{border:1px solid rgba(148,163,184,.25);background:rgba(15,23,42,.72);color:#fff;border-radius:12px;padding:9px 12px;font-weight:1000;cursor:pointer}.hg-filter-panel{display:grid;gap:10px;margin-bottom:14px}.hg-filter-panel.is-collapsed{display:none}.hg-filter-group{border:1px solid rgba(148,163,184,.16);background:rgba(15,23,42,.42);border-radius:16px;padding:12px}.hg-filter-title{font-size:12px;font-weight:1000;color:#cbd5e1;text-transform:uppercase;letter-spacing:.05em;margin-bottom:9px}.hg-filter-chips{display:flex;flex-wrap:wrap;gap:8px}.hg-filter-chip{min-height:36px;border:1px solid rgba(148,163,184,.24);background:rgba(15,23,42,.78);color:#dbeafe;border-radius:999px;padding:6px 12px;display:inline-flex;align-items:center;justify-content:center;gap:7px;font-weight:900;font-size:12px;cursor:pointer;transition:.14s transform,.14s background,.14s border-color,.14s color;box-shadow:0 1px 0 rgba(255,255,255,.04) inset}.hg-filter-chip:hover{transform:translateY(-1px);border-color:rgba(250,204,21,.42);background:rgba(30,41,59,.92);color:#fff}.hg-filter-chip.active{border-color:#facc15;background:linear-gradient(135deg,rgba(250,204,21,.22),rgba(250,204,21,.08));color:#fff;box-shadow:0 0 0 2px rgba(250,204,21,.08) inset}.hg-filter-chip.small{padding:6px 10px;color:#94a3b8}.hg-filter-chip.icon-only{width:44px;height:40px;padding:6px}.hg-filter-chip.with-name{padding-right:13px}.hg-filter-chip.guild-chip{max-width:260px}.hg-chip-icon{width:24px;height:24px;object-fit:contain;display:block;flex:0 0 auto}.hg-helper-count{font-size:13px;color:#94a3b8;margin-bottom:12px}.hg-helper-img{width:42px;height:42px;object-fit:cover;border-radius:999px;background:#1e293b}.hg-helper-small{font-size:11px;color:#94a3b8;font-weight:700}.hg-helper-table td{vertical-align:middle;text-align:center}.hg-helper-table .hg-text-left{text-align:left}.hg-helper-table .hg-center-cell{text-align:center;vertical-align:middle}.hg-wrap-two{white-space:normal!important;line-height:1.2;max-width:220px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.hg-guild-two{white-space:normal!important;line-height:1.2;max-width:220px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.hg-icon-only{display:inline-flex;align-items:center;justify-content:center;min-height:34px}.hg-value-img{width:26px;height:26px;object-fit:contain;display:block;flex:0 0 auto}.hg-filter-img-element{width:28px;height:28px}.hg-filter-img-rarity{width:30px;height:24px}.hg-filter-img-class{width:28px;height:28px}.hg-filter-img-type{width:28px;height:28px}.hg-filter-img-guild{width:24px;height:24px}.hg-table-img-element{width:28px;height:28px}.hg-table-img-rarity{width:34px;height:26px}.hg-table-img-class{width:30px;height:30px}.hg-table-img-type{width:30px;height:30px}.hg-table-img-guild{width:26px;height:26px}.hg-limited-text{font-weight:900}.hg-page-tip{position:fixed;z-index:99999;pointer-events:none;background:rgba(2,6,23,.96);color:#fff;border:1px solid rgba(250,204,21,.45);border-radius:10px;padding:7px 10px;font-size:12px;font-weight:900;box-shadow:0 12px 28px rgba(0,0,0,.35);display:none;max-width:240px}
      .hg-result-alert{margin-bottom:18px;border-radius:8px;padding:14px 16px;font-weight:700;border:1px solid rgba(148,163,184,.18);background:rgba(15,23,42,.7);color:#cbd5e1}.hg-result-alert.win{background:rgba(22,101,52,.28);border-color:rgba(34,197,94,.42);color:#bbf7d0}.hg-result-alert.fail{background:rgba(127,29,29,.28);border-color:rgba(239,68,68,.42);color:#fecaca}.hg-result-card{min-height:260px;margin-bottom:22px;border-radius:18px;border:1px solid rgba(148,163,184,.18);background:rgba(15,23,42,.68);position:relative;display:grid;place-items:center;padding:34px 18px;overflow:hidden}.hg-result-card.win{background:linear-gradient(135deg,rgba(21,83,45,.62),rgba(15,23,42,.78));border-color:rgba(34,197,94,.34)}.hg-result-card.fail{background:linear-gradient(135deg,rgba(127,29,29,.45),rgba(15,23,42,.78));border-color:rgba(239,68,68,.34)}.hg-result-trophy{position:absolute;left:28px;top:24px;font-size:48px;filter:drop-shadow(0 10px 18px rgba(0,0,0,.28))}.hg-result-center{text-align:center;display:grid;place-items:center;gap:8px}.hg-result-center h3{font-size:24px;margin:0;color:#fff}.hg-result-center p{margin:0;color:#cbd5e1;font-weight:700}.hg-result-sub{font-size:13px;color:#86efac;font-weight:900}.hg-result-reward-compact{display:flex;align-items:center;justify-content:center;gap:8px;flex-wrap:wrap;color:#d1fae5;font-size:14px;line-height:1.4}.hg-result-streak-badge{display:inline-flex;align-items:center;border:1px solid rgba(249,115,22,.5);background:rgba(249,115,22,.16);color:#fdba74;border-radius:999px;padding:3px 8px;font-size:11px;font-weight:1000}.hg-result-avatar-wrap{margin-top:10px;width:92px;height:92px;border-radius:999px;border:3px solid rgba(34,197,94,.85);display:grid;place-items:center;background:rgba(2,6,23,.4);box-shadow:0 0 0 6px rgba(34,197,94,.08)}.hg-result-avatar{width:78px;height:78px;border-radius:999px;object-fit:cover}.hg-attempts-table th{text-align:center!important}.hg-attempts-table td{text-align:center;vertical-align:middle}.hg-attempts-table .hg-hunter-cell{justify-content:center;text-align:center}.hg-attempts-table .hg-avatar{width:34px;height:34px}.hg-attempts-table .hg-cell{border-radius:0!important}.hg-attempts-table tbody tr td.hg-cell:nth-child(2){border-radius:0!important}.hg-attempts-table tbody tr td.hg-cell:nth-child(7){border-radius:0!important}.hg-attempts-table tbody tr:last-child td.hg-cell:nth-child(7){border-bottom-right-radius:10px!important}.hg-helper-table th{text-align:center!important}.hg-helper-table th:nth-child(2),.hg-helper-table th:nth-child(8){text-align:center!important}.hg-helper-table .hg-text-left{text-align:center!important}.hg-helper-table .hg-hunter-cell{justify-content:center}.hg-filter-panel{border:1px solid rgba(148,163,184,.12);border-radius:18px;padding:12px;background:rgba(2,6,23,.18)}.hg-filter-group{padding:10px 12px}.hg-filter-title{color:#e2e8f0}.hg-filter-chip{min-height:34px}.hg-filter-chip.with-name{padding-left:10px;padding-right:12px}.hg-filter-chip.guild-chip{padding-left:10px}.hg-filter-toggle-row{background:rgba(15,23,42,.48);border:1px solid rgba(148,163,184,.14);border-radius:16px;padding:10px 12px}.hg-filter-toggle{background:#334155}.hg-score-card{padding:20px 18px}.hg-score-layout{align-items:stretch}.hg-score-grid{border-radius:14px}.hg-score-grid div{display:flex;align-items:center}.hg-score-grid div:nth-child(3n+2),.hg-score-grid div:nth-child(3n+3){justify-content:center}.hg-score-side{align-self:center}.hg-lb-row{min-height:86px;padding:18px 20px;border-radius:16px}.hg-lb-row.rank-1 .hg-rank-medal{font-size:38px}.hg-lb-name{display:flex;align-items:center}.hg-stat-value{line-height:1.1}.hg-best-pill{white-space:nowrap}

      .hg-btn.small{padding:8px 11px;border-radius:11px;font-size:12px}.hg-you-pill{display:inline-flex;margin-left:8px;border-radius:999px;border:1px solid rgba(250,204,21,.7);background:rgba(250,204,21,.16);color:#facc15;padding:3px 8px;font-size:11px;font-weight:1000;vertical-align:middle}.hg-streak-pill{display:inline-flex;margin-left:8px;border-radius:999px;background:rgba(249,115,22,.18);border:1px solid rgba(249,115,22,.45);padding:3px 8px}.hg-you-reward{outline:2px solid rgba(250,204,21,.78);outline-offset:-2px;background:rgba(250,204,21,.09)!important}.hg-reward-grid{display:grid;grid-template-columns:160px 1fr;border:1px solid rgba(148,163,184,.16);border-radius:16px;overflow:hidden;margin-top:10px}.hg-reward-grid>div{padding:10px;border-bottom:1px solid rgba(148,163,184,.12);background:rgba(255,255,255,.03);font-weight:800}.hg-reward-grid>div:nth-child(-n+2){background:#111827;color:#fff;font-weight:1000}.hg-reward-grid>div:nth-last-child(-n+2){border-bottom:0}.hg-lb-head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start;flex-wrap:wrap;margin-bottom:14px}.hg-admin-rewards{margin:14px 0;padding:14px;border-radius:16px;border:1px solid rgba(250,204,21,.25);background:rgba(250,204,21,.055)}.hg-admin-rewards>summary{cursor:pointer;font-weight:1000;color:#facc15;font-size:18px}.hg-admin-rewards h4{margin:16px 0 10px;color:#fff}.hg-reward-input{min-width:76px;text-align:center}.hg-reward-admin-table th,.hg-reward-admin-table td{text-align:center}.hg-reward-admin-table td:first-child,.hg-reward-admin-table th:first-child{text-align:left;font-weight:1000}.hg-attempts-table .hg-cell{border-radius:0!important}.hg-attempts-table tbody tr:last-child td.hg-cell:nth-child(7){border-bottom-right-radius:10px!important}
      .hg-card h3,.hg-result-center h3,.hg-lb-head h3{font-weight:1000}.hg-result-center p strong{font-weight:1000;color:#fff}.hg-reward-lines{display:grid!important;grid-template-columns:1fr;gap:7px;justify-content:center;align-items:center;min-width:155px}.hg-reward-line{display:flex!important;align-items:center;justify-content:flex-start;gap:9px;white-space:nowrap;font-weight:900;line-height:1.15}.hg-reward-icon{width:30px!important;height:30px!important;object-fit:contain;display:inline-block;flex:0 0 30px}.hg-score-grid .hg-you-reward{outline:0!important;background:rgba(250,204,21,.09)!important;box-shadow:inset 0 2px 0 rgba(250,204,21,.9),inset 0 -2px 0 rgba(250,204,21,.9)}.hg-score-grid .hg-you-reward.start,.hg-reward-grid .hg-you-reward.start{box-shadow:inset 2px 0 0 rgba(250,204,21,.9),inset 0 2px 0 rgba(250,204,21,.9),inset 0 -2px 0 rgba(250,204,21,.9)}.hg-score-grid .hg-you-reward.end,.hg-reward-grid .hg-you-reward.end{box-shadow:inset -2px 0 0 rgba(250,204,21,.9),inset 0 2px 0 rgba(250,204,21,.9),inset 0 -2px 0 rgba(250,204,21,.9)}.hg-reward-grid .hg-you-reward{outline:0!important;background:rgba(250,204,21,.09)!important}.hg-modal-backdrop{position:fixed;inset:0;z-index:999999;background:rgba(0,0,0,.62);display:grid;place-items:center;padding:18px}.hg-modal-card{width:min(1040px,calc(100vw - 36px));height:min(760px,calc(100vh - 48px));max-height:calc(100vh - 48px);overflow:auto;background:#0f172a;border:1px solid rgba(250,204,21,.35);border-radius:20px;box-shadow:0 30px 90px rgba(0,0,0,.55);padding:18px}.hg-modal-card .hg-score-card{min-height:560px}.hg-modal-card .hg-score-layout{grid-template-columns:1fr}.hg-modal-card .hg-score-grid{width:100%}.hg-modal-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px}.hg-modal-head h3{margin:0;font-size:20px;color:#facc15;font-weight:1000}.hg-x{border:0;background:#334155;color:#fff;border-radius:12px;width:36px;height:36px;font-weight:1000;cursor:pointer}.hg-reward-modal-tabs,.hg-admin-tabs{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px}.hg-admin-section{border:1px solid rgba(148,163,184,.18);border-radius:18px;padding:14px;background:rgba(255,255,255,.025)}.hg-admin-section-title{font-size:20px;color:#facc15;font-weight:1000;margin:0 0 10px}.hg-helper-search-row{display:grid;grid-template-columns:1fr auto auto;gap:10px;align-items:center;margin-bottom:12px}.hg-helper-search-row .hg-btn,.hg-helper-search-row .hg-filter-toggle{height:46px}.hg-score-grid{grid-template-columns:minmax(270px,1fr) 120px 230px}.hg-score-grid>div{text-align:center;display:flex;align-items:center;justify-content:center}.hg-score-grid>div:nth-child(3n+1){justify-content:flex-start;text-align:left}.hg-hunter-cell strong{font-weight:1000;color:#fff}
      .hg-reward-grid{grid-template-columns:minmax(180px,260px) minmax(220px,1fr)!important}.hg-reward-grid>div{display:flex;align-items:center;gap:8px}.hg-reward-grid>div:nth-child(2n){justify-content:center}.hg-score-grid>div:nth-child(3n){overflow:visible}.hg-score-grid .hg-reward-lines{justify-content:start}.hg-score-grid>div:nth-child(3n){justify-content:center}.hg-filter-panel.is-collapsed{display:none}.hg-filter-chip.small.active{border-color:#facc15;background:rgba(250,204,21,.16);color:#facc15}
      .hg-result-line{color:#aeb5b8!important;font-weight:700}.hg-result-line strong{color:#fff!important;font-weight:1000}.hg-result-sub{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:8px;color:#86efac;font-weight:1000}.hg-result-sub>.hg-reward-lines{align-items:center!important;justify-content:center!important}.hg-result-card .hg-reward-lines{align-items:center!important;justify-content:center!important}.hg-result-card .hg-reward-line{justify-content:center!important}
      .hg-reward-lines{display:flex!important;flex-direction:column!important;gap:8px!important;align-items:center!important;justify-content:center!important;min-width:0!important;width:max-content!important;max-width:100%}.hg-reward-line{display:flex!important;align-items:center!important;justify-content:center!important;gap:10px!important;white-space:nowrap!important;width:100%;font-weight:1000}.hg-reward-line .hg-reward-icon,.hg-score-side .hg-reward-icon{width:30px!important;height:30px!important;min-width:30px!important;min-height:30px!important;object-fit:contain!important;flex:0 0 30px!important}
      .hg-score-grid{grid-template-columns:minmax(290px,1fr) 120px minmax(240px,330px)!important}.hg-score-grid>div:nth-child(3n){justify-content:center!important;overflow:visible!important}.hg-score-grid .hg-reward-lines{align-items:center!important;justify-content:center!important}.hg-score-grid .hg-reward-line{justify-content:center!important}.hg-score-grid .hg-you-reward.mid{box-shadow:inset 0 2px 0 rgba(250,204,21,.9),inset 0 -2px 0 rgba(250,204,21,.9)}
      .hg-modal-card{display:flex;flex-direction:column;overflow:hidden!important}.hg-modal-head{position:sticky;top:0;z-index:20;background:#0f172a;padding-bottom:10px;margin-bottom:0}.hg-reward-modal-tabs{position:sticky;top:56px;z-index:19;background:#0f172a;padding:12px 0;margin-bottom:0}.hg-reward-modal-content{overflow:auto;padding-top:12px;min-height:560px}.hg-modal-card .hg-score-card{min-height:620px;width:100%;box-sizing:border-box}.hg-modal-card .hg-score-layout{display:block!important}.hg-modal-card .hg-score-grid{width:100%!important;grid-template-columns:minmax(280px,1fr) 130px minmax(300px,380px)!important}.hg-modal-card .hg-score-side{display:none}.hg-reward-grid{width:100%}.hg-reward-grid .hg-reward-lines{align-items:center!important;justify-content:center!important}



      /* v23 layout fixes */
      .hg-score-grid{grid-template-columns:minmax(300px,1fr) 120px minmax(260px,340px)!important;align-items:stretch!important}
      .hg-score-grid>div{background:rgba(255,255,255,.03)!important;border-bottom:1px solid rgba(148,163,184,.12)!important;padding:12px 10px!important;box-sizing:border-box!important}
      .hg-score-grid>div:nth-child(-n+3){background:#111827!important;font-weight:1000!important;color:#fff!important}
      .hg-score-grid>div:nth-last-child(-n+3){border-bottom:0!important}
      .hg-score-grid .hg-reward-lines,
      .hg-score-grid .hg-reward-line,
      .hg-reward-grid .hg-reward-lines,
      .hg-reward-grid .hg-reward-line{background:transparent!important;border:0!important;padding:0!important;box-shadow:none!important}
      .hg-score-grid .hg-reward-lines{width:auto!important;min-width:0!important;max-width:100%!important;gap:10px!important}
      .hg-score-grid .hg-reward-line{min-height:30px!important}
      .hg-score-grid .hg-you-reward{background:transparent!important;outline:0!important;box-shadow:inset 0 2px 0 rgba(250,204,21,.95),inset 0 -2px 0 rgba(250,204,21,.95)!important}
      .hg-score-grid .hg-you-reward.start{box-shadow:inset 2px 0 0 rgba(250,204,21,.95),inset 0 2px 0 rgba(250,204,21,.95),inset 0 -2px 0 rgba(250,204,21,.95)!important}
      .hg-score-grid .hg-you-reward.end{box-shadow:inset -2px 0 0 rgba(250,204,21,.95),inset 0 2px 0 rgba(250,204,21,.95),inset 0 -2px 0 rgba(250,204,21,.95)!important}
      .hg-reward-grid .hg-you-reward{background:transparent!important;outline:0!important;box-shadow:inset 0 2px 0 rgba(250,204,21,.95),inset 0 -2px 0 rgba(250,204,21,.95)!important}
      .hg-reward-grid .hg-you-reward.start{box-shadow:inset 2px 0 0 rgba(250,204,21,.95),inset 0 2px 0 rgba(250,204,21,.95),inset 0 -2px 0 rgba(250,204,21,.95)!important}
      .hg-reward-grid .hg-you-reward.end{box-shadow:inset -2px 0 0 rgba(250,204,21,.95),inset 0 2px 0 rgba(250,204,21,.95),inset 0 -2px 0 rgba(250,204,21,.95)!important}
      .hg-reward-grid>div{background:rgba(255,255,255,.03)!important}
      .hg-reward-grid>div:nth-child(-n+2){background:#111827!important}
      .hg-modal-card{overflow:hidden!important;display:flex!important;flex-direction:column!important}
      .hg-modal-head{flex:0 0 auto!important}
      .hg-reward-modal-tabs{flex:0 0 auto!important}
      .hg-reward-modal-content{flex:1 1 auto!important;min-height:0!important;max-height:none!important;overflow-y:auto!important;overflow-x:hidden!important;padding-right:8px!important}
      .hg-modal-card .hg-score-card{min-height:auto!important;margin-bottom:0!important}
      .hg-modal-card .hg-score-grid{grid-template-columns:minmax(310px,1fr) 130px minmax(320px,420px)!important}
      .hg-lb-row>div:not(.hg-rank):not(.hg-lb-name){display:flex!important;flex-direction:column!important;align-items:center!important;justify-content:center!important;text-align:center!important;min-width:0!important}
      .hg-lb-row .hg-stat-label,.hg-lb-row .hg-stat-value{text-align:center!important;width:100%!important;display:block!important}
      .hg-lb-name{justify-content:flex-start!important;text-align:left!important}


      /* v24 Rewards modal scroll fix: header/tabs stay visible, only content scrolls */
      .hg-modal-card{
        display:flex!important;
        flex-direction:column!important;
        overflow:hidden!important;
        height:min(760px,calc(100vh - 48px))!important;
        max-height:calc(100vh - 48px)!important;
      }
      .hg-modal-head{
        flex:0 0 auto!important;
        position:relative!important;
        top:auto!important;
        z-index:30!important;
        background:#0f172a!important;
        margin-bottom:10px!important;
        padding-bottom:0!important;
      }
      .hg-modal-card>[data-hg-reward-modal-root]{
        flex:1 1 auto!important;
        min-height:0!important;
        overflow:hidden!important;
        display:flex!important;
        flex-direction:column!important;
      }
      .hg-modal-card>[data-hg-reward-modal-root]>div{
        flex:1 1 auto!important;
        min-height:0!important;
        overflow:hidden!important;
        display:flex!important;
        flex-direction:column!important;
      }
      .hg-reward-modal-tabs{
        flex:0 0 auto!important;
        position:relative!important;
        top:auto!important;
        z-index:25!important;
        background:#0f172a!important;
        margin-bottom:12px!important;
        padding:0 0 8px!important;
      }
      .hg-reward-modal-content{
        flex:1 1 auto!important;
        min-height:0!important;
        max-height:none!important;
        overflow-y:auto!important;
        overflow-x:hidden!important;
        padding:0 8px 10px 0!important;
        overscroll-behavior:contain!important;
      }
      .hg-reward-modal-content .hg-score-card{
        margin-bottom:0!important;
        min-height:auto!important;
        width:100%!important;
        box-sizing:border-box!important;
      }
      .hg-reward-modal-content .hg-score-layout{
        display:block!important;
      }
      .hg-reward-modal-content .hg-score-grid{
        width:100%!important;
      }



      /* v25 Rewards modal tabs: always one row */
      .hg-reward-modal-tabs{
        display:grid!important;
        grid-template-columns:repeat(3,minmax(0,1fr))!important;
        gap:8px!important;
        flex-wrap:nowrap!important;
        align-items:stretch!important;
        width:100%!important;
      }
      .hg-reward-modal-tabs .hg-btn,
      .hg-reward-modal-tabs .hg-tab{
        width:100%!important;
        min-width:0!important;
        flex:0 1 auto!important;
        white-space:nowrap!important;
        text-align:center!important;
        justify-content:center!important;
        padding-left:10px!important;
        padding-right:10px!important;
      }
      @media(max-width:620px){
        .hg-reward-modal-tabs{gap:6px!important}
        .hg-reward-modal-tabs .hg-btn,.hg-reward-modal-tabs .hg-tab{font-size:12px!important;padding-left:6px!important;padding-right:6px!important}
      }



      /* v26 Rewards modal stable tabs + scroll after tab switch */
      .hg-reward-modal-inner{
        flex:1 1 auto!important;
        min-height:0!important;
        overflow:hidden!important;
        display:flex!important;
        flex-direction:column!important;
      }
      .hg-reward-modal-inner>.hg-reward-modal-tabs{
        display:grid!important;
        grid-template-columns:repeat(3,minmax(0,1fr))!important;
        gap:8px!important;
        flex:0 0 auto!important;
        flex-wrap:nowrap!important;
        width:100%!important;
        overflow:visible!important;
      }
      .hg-reward-modal-inner>.hg-reward-modal-tabs>.hg-btn,
      .hg-reward-modal-inner>.hg-reward-modal-tabs>.hg-tab{
        width:100%!important;
        min-width:0!important;
        max-width:none!important;
        flex:0 0 auto!important;
      }
      .hg-reward-modal-inner>.hg-reward-modal-content{
        flex:1 1 auto!important;
        min-height:0!important;
        overflow-y:auto!important;
        overflow-x:hidden!important;
        overscroll-behavior:contain!important;
      }
      .hg-mobile-only{display:none!important}
      .hg-page,.hg-card,.hg-table-wrap,.hg-modal-card{max-width:100%;box-sizing:border-box}
      .hg-how-details{background:transparent!important;border:0!important;box-shadow:none!important;padding:0!important}.hg-how-details>summary{list-style:none}.hg-how-details>summary::-webkit-details-marker{display:none}.hg-how-toggle{width:max-content;min-width:150px;margin-left:auto}.hg-how-details[open] .hg-how-toggle{margin-bottom:12px}.hg-how-content{margin-top:0}
      .hg-attempt-hunter-image,.hg-attempt-hunter-name{text-align:center!important}.hg-attempt-hunter-image{padding-bottom:5px!important}.hg-attempt-hunter-name{padding-top:5px!important;white-space:normal!important;line-height:1.15}.hg-attempts-table td[rowspan]{height:100%;vertical-align:middle!important}.hg-attempt-bottom td{border-top:0!important}
      .hg-result-total,.hg-result-reward-items,.hg-result-reward-item{display:inline-flex;align-items:center;justify-content:center;gap:6px;flex-wrap:wrap}.hg-result-reward-icon{width:24px;height:24px;object-fit:contain;flex:0 0 24px}.hg-result-reward-item:not(:last-child)::after{content:'·';margin-left:2px;color:#86efac;font-weight:1000}

      @media(max-width:700px){
        .hg-page{padding:52px 10px 48px!important;overflow-x:hidden}
        .hg-header{gap:14px;margin-bottom:16px}
        .hg-title{font-size:36px;line-height:1.05}
        .hg-sub{font-size:14px;line-height:1.35}
        .hg-date{display:block;margin-top:3px;width:max-content;max-width:100%}
        .hg-actions{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;width:100%}
        .hg-actions .hg-btn{width:100%;min-width:0;padding:10px 8px;white-space:normal}
        .hg-card{padding:14px;border-radius:17px}
        .hg-desktop-only{display:none!important}
        .hg-mobile-only{display:block!important}
        .hg-mobile-card-list{display:grid!important;grid-template-columns:1fr;gap:10px;width:100%;min-width:0}
        .hg-mobile-card{min-width:0;border:1px solid rgba(148,163,184,.2);border-radius:14px;padding:12px;background:rgba(255,255,255,.035);box-sizing:border-box}
        .hg-mobile-card.is-you{border:2px solid rgba(250,204,21,.9);background:rgba(250,204,21,.07)}
        .hg-how-toggle{width:100%;max-width:none;box-sizing:border-box;text-align:center;justify-content:center;margin-left:0}
        .hg-mobile-card-head{display:flex;align-items:center;gap:10px;min-width:0;margin-bottom:10px}
        .hg-mobile-card-title{display:block;color:#fff;font-weight:1000;line-height:1.2;min-width:0;overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
        .hg-mobile-reward-title{display:flex;align-items:center;gap:7px;flex-wrap:wrap;color:#fff;font-weight:1000;margin-bottom:6px}
        .hg-mobile-points{color:#facc15;font-weight:1000;margin-bottom:7px}
        .hg-mobile-reward-card .hg-reward-lines{align-items:flex-start!important;width:100%!important;gap:6px!important}
        .hg-mobile-reward-card .hg-reward-line{justify-content:flex-start!important;width:auto!important;background:transparent!important;border:0!important;padding:0!important}
        .hg-mobile-detail-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
        .hg-mobile-detail{min-width:0;border-top:1px solid rgba(148,163,184,.12);padding-top:7px;display:grid;gap:5px;color:#e2e8f0;font-weight:800}
        .hg-mobile-detail:last-child{grid-column:1/-1}
        .hg-mobile-label{font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:.04em}
        .hg-mobile-icon-text{display:flex;align-items:center;gap:7px;min-width:0}
        .hg-mobile-guild{line-height:1.2;overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
        .hg-attempt-mobile-card .hg-mobile-card-head{margin-bottom:9px}
        .hg-attempt-mobile-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;width:100%;min-width:0}
        .hg-attempt-mobile-value{min-width:0;min-height:62px;padding:8px 4px!important;border-radius:10px!important;display:flex!important;flex-direction:column;align-items:center;justify-content:center;gap:5px;text-align:center;white-space:normal!important;overflow-wrap:anywhere;font-size:13px;line-height:1.18}
        .hg-attempt-mobile-label{font-size:10px;color:#e2e8f0;text-transform:uppercase;letter-spacing:.03em;font-weight:1000}
        .hg-attempt-mobile-value strong{max-width:100%;overflow-wrap:anywhere;font-size:13px;font-weight:1000}
        .hg-result-alert{padding:11px 12px;margin-bottom:12px;font-size:13px}.hg-result-alert.win{display:none}
        .hg-result-card{min-height:0;padding:22px 12px 18px;margin-bottom:14px}
        .hg-result-trophy{position:static;font-size:34px;margin-bottom:2px}
        .hg-result-center h3{font-size:21px}
        .hg-result-line{font-size:13px}
        .hg-result-reward-compact{max-width:100%;font-size:12px;line-height:1.45}
        .hg-result-total{max-width:100%}.hg-result-reward-items{gap:5px}.hg-result-reward-item{gap:4px}.hg-result-reward-icon{width:22px;height:22px;flex-basis:22px}
        .hg-result-avatar-wrap{display:grid!important;visibility:visible!important;width:82px;height:82px;margin-top:7px;flex:0 0 82px}.hg-result-avatar{display:block!important;visibility:visible!important;width:70px;height:70px}
        .hg-search-finished .hg-search-wrap{display:none}
        .hg-search-finished .hg-search-row{display:block}
        .hg-search-finished .hg-btn{width:100%}
        .hg-score-layout{display:block!important}
        .hg-score-side{margin-top:12px}
        .hg-score-card{padding:14px 12px}
        .hg-score-card>div:first-child{margin-bottom:10px!important}
        .hg-modal-backdrop{padding:12px}
        .hg-modal-card{width:calc(100vw - 24px)!important;height:calc(100vh - 32px)!important;max-height:calc(100vh - 32px)!important;padding:12px;border-radius:16px}
        .hg-modal-head{position:sticky!important;top:0!important;padding:0 0 8px!important;background:#0f172a!important}
        .hg-reward-modal-tabs{position:sticky!important;top:0!important;gap:5px!important;padding-bottom:8px!important}
        .hg-reward-modal-tabs .hg-btn{font-size:13px!important;font-weight:1000!important;padding:9px 4px!important;white-space:nowrap!important}
        .hg-reward-modal-content{padding:0!important;overflow-x:hidden!important}
        .hg-modal-card .hg-score-card{padding:10px!important}
        .hg-modal-card .hg-score-card>h3{font-size:16px!important}
        .hg-lb-head{display:grid;grid-template-columns:1fr;gap:10px}
        .hg-lb-head .hg-tabs{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));width:100%!important;gap:8px}
        .hg-lb-head .hg-tabs .hg-btn{width:100%}
        .hg-lb-row{grid-template-columns:66px minmax(0,1fr)!important;gap:8px!important;padding:12px!important;min-height:0!important}
        .hg-lb-row .hide-mobile{display:flex!important}
        .hg-rank{grid-column:1;grid-row:1;border-right:1px solid rgba(148,163,184,.18);min-height:48px}
        .hg-lb-name{grid-column:2;grid-row:1;min-width:0;flex-wrap:wrap!important;gap:4px;overflow-wrap:anywhere}
        .hg-lb-row>div:not(.hg-rank):not(.hg-lb-name){display:flex!important;min-width:0;padding:7px;border-radius:9px;background:rgba(2,6,23,.26)}
        .hg-lb-row>div:nth-child(n+3){grid-column:auto;grid-row:auto}
        .hg-stat-label{font-size:9px}.hg-stat-value{font-size:14px;overflow-wrap:anywhere}.hg-best-pill{padding:3px 6px;white-space:normal}
        .hg-helper-search-row{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
        .hg-helper-search-input{grid-column:1/-1;width:100%;min-width:0}
        .hg-helper-search-row .hg-btn,.hg-helper-search-row .hg-filter-toggle{width:100%;min-width:0;padding:8px 6px}
        .hg-filter-panel{min-width:0}
        .hg-filter-group{padding:10px;min-width:0}
        .hg-filter-chips{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}
        .hg-filter-chip{width:100%;min-width:0;max-width:none!important;white-space:normal;padding:6px 8px}
        .hg-filter-chip.icon-only{width:100%}
        .hg-filter-chip.guild-chip{min-height:48px;line-height:1.15}
        .hg-filter-chip.guild-chip .hg-wrap-two{-webkit-line-clamp:2;overflow-wrap:anywhere}
        .hg-admin-area,.hg-admin-section{min-width:0;padding:12px}
        .hg-admin-answer-main{align-items:flex-start}.hg-admin-answer-main>div{min-width:0;overflow-wrap:anywhere}
        .hg-admin-tabs{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}
        .hg-admin-tabs .hg-btn{min-width:0;width:100%;padding:9px 5px;font-size:12px}
        .hg-mobile-form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin-top:10px}
        .hg-mobile-form-field{display:grid;gap:5px;min-width:0;color:#94a3b8;font-size:11px;font-weight:900}
        .hg-mobile-form-field .hg-admin-input{width:100%;min-width:70px;box-sizing:border-box}
        .hg-admin-field-card{display:grid;gap:9px}
        .hg-admin-field-card .hg-mobile-card-head{margin-bottom:2px}
        .hg-admin-section>div[style*="margin-top:12px"]{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr));width:100%}
        .hg-admin-section>div[style*="margin-top:12px"] .hg-btn{width:100%;min-width:0}
        .hg-admin-rewards{max-width:100%;box-sizing:border-box;overflow-wrap:anywhere;padding:12px}
        .hg-admin-rewards .hg-btn{width:100%;white-space:normal}
        .hg-table-wrap{max-width:100%;box-sizing:border-box}
      }

      @media(max-width:420px){
        .hg-page{padding:46px 8px 42px!important}
        .hg-title{font-size:32px}
        .hg-actions .hg-btn{font-size:12px;padding:9px 5px}
        .hg-card{padding:12px}
        .hg-how{gap:8px}
        .hg-dots{gap:7px}.hg-dot{width:12px;height:12px}
        .hg-mobile-detail-grid{grid-template-columns:1fr 1fr}
        .hg-mobile-form-grid{gap:7px}
        .hg-reward-icon{width:26px!important;height:26px!important;min-width:26px!important;min-height:26px!important;flex-basis:26px!important}
        .hg-modal-backdrop{padding:8px}.hg-modal-card{width:calc(100vw - 16px)!important;padding:10px}
        .hg-reward-modal-tabs .hg-btn{font-size:12px!important;font-weight:1000!important;padding:9px 2px!important}
      }
      @media(max-width:900px){.hg-header{flex-direction:column}.hg-how{grid-template-columns:1fr 1fr}.hg-lb-row{grid-template-columns:70px 1fr 90px}.hg-lb-row .hide-mobile{display:none}.hg-score-layout{grid-template-columns:1fr}.hg-score-grid{grid-template-columns:1fr 80px 90px}}@media(max-width:620px){.hg-how{grid-template-columns:1fr}.hg-search-row{flex-direction:column}.hg-table th,.hg-table td{padding:9px 8px;font-size:12px}.hg-actions{width:100%}.hg-btn{flex:1}}
    `;
    document.head.appendChild(style);
  }

  function renderDots() {
    const s = currentGuessState() || state || {};
    const used = Number(s?.guessesUsed || 0);
    const solved = !!s?.solved;
    const finished = !!s?.finished;
    return el('div', {},
      el('div', { class: 'hg-dots' }, Array.from({ length: s?.maxGuesses || 8 }, (_, i) => {
        const n = i + 1;
        let cls = 'hg-dot';
        if (n <= used) cls += ' used';
        if (finished && !solved && n <= used) cls += ' fail';
        if (solved && n === used) cls += ' win';
        return el('div', { class: cls });
      })),
      el('div', { class: 'hg-center hg-muted' }, `${used} of ${s?.maxGuesses || 8} guesses used${playMode === 'practice' ? ' · practice, no rewards' : ''}`)
    );
  }

  function renderSearch() {
    const s = currentGuessState() || state || {};
    const guest = isGuest();
    const dailyFinishedCanPractice = !guest && playMode === 'daily' && !!s?.finished;
    const disabled = guest || busy || (s?.finished && !dailyFinishedCanPractice);
    const wrap = el('div', { class: 'hg-search-wrap' });
    const input = el('input', {
      class: 'hg-input',
      placeholder: dailyFinishedCanPractice ? 'Daily finished — start a practice round.' : (s?.finished ? (playMode === 'practice' ? 'Practice round finished' : 'Today is finished') : 'Search for a hunter...'),
      disabled: disabled || dailyFinishedCanPractice
    });
    const dropdown = el('div', { class: 'hg-dropdown hg-hidden' });
    const error = el('div', { class: 'hg-error hg-hidden' });
    const btn = el('button', {
      class: 'hg-btn primary',
      disabled: dailyFinishedCanPractice ? busy : true,
      onclick: dailyFinishedCanPractice ? (() => startPractice(true)) : (() => submitGuess(error))
    }, dailyFinishedCanPractice ? '🎲 Practice' : (playMode === 'practice' ? '🎲 Practice Guess' : '🎲 Guess'));

    if (guest) {
      input.setAttribute('placeholder', 'Log in to submit your guess.');
      btn.disabled = true;
      btn.textContent = 'Log in to Guess';
    }

    function rebuild() {
      const q = input.value.trim().toLowerCase();
      selectedHunterId = '';
      if (!dailyFinishedCanPractice) btn.disabled = true;
      dropdown.innerHTML = '';
      if (!q || disabled || dailyFinishedCanPractice) { dropdown.classList.add('hg-hidden'); return; }
      const already = new Set((s?.attempts || []).map(a => String(a.hunter?.id || '')));
      const matches = hunters.filter(h => !already.has(String(h.id)) && String(h.name || '').toLowerCase().includes(q)).slice(0, 12);
      for (const h of matches) {
        dropdown.append(el('div', { class: 'hg-option', onclick: () => {
          selectedHunterId = h.id;
          input.value = h.name;
          dropdown.classList.add('hg-hidden');
          btn.disabled = false;
        } },
          avatarImg(h),
          el('div', {}, el('div', {}, h.name), el('small', {}, `${h.element} • ${h.rarity} • ${h.className} • ${h.role || h.classOriginal || '-'}`))
        ));
      }
      dropdown.classList.toggle('hg-hidden', matches.length === 0);
    }

    input.addEventListener('input', rebuild);
    input.addEventListener('focus', rebuild);
    document.addEventListener('click', ev => { if (!wrap.contains(ev.target)) dropdown.classList.add('hg-hidden'); }, { once: true });
    wrap.append(input, dropdown);
    return el('div', { class: `hg-card ${dailyFinishedCanPractice ? 'hg-search-finished' : ''}` },
      guest ? el('div', { class: 'hg-muted', style: 'margin-bottom:10px;font-weight:900' }, "Log in to play today's Hunter Guess and earn rewards.") : null,
      el('div', { class: 'hg-search-row' }, wrap, btn),
      error
    );
  }

  async function submitGuess(errorNode) {
    if (isGuest()) {
      const msg = 'Please log in to submit guesses.';
      if (errorNode) {
        errorNode.textContent = msg;
        errorNode.classList.remove('hg-hidden');
      } else toast(msg);
      return;
    }
    if (!selectedHunterId || busy) return;
    busy = true;
    try {
      if (playMode === 'practice') {
        const res = await request(API.practiceSubmit, { method: 'POST', body: JSON.stringify({ hunterId: selectedHunterId }) });
        practiceState = res.state || res;
      } else {
        const res = await request(API.submit, { method: 'POST', body: JSON.stringify({ hunterId: selectedHunterId }) });
        state = res.state;
        await refreshLeaderboard();
        if (!isGuest() && state?.finished) {
          try { practiceState = await request(API.practiceState); } catch (_) {}
        }
      }
      selectedHunterId = '';
      busy = false;
      render();
    } catch (e) {
      if (errorNode) {
        errorNode.textContent = e.message || 'Submit failed';
        errorNode.classList.remove('hg-hidden');
      } else toast(e.message || 'Submit failed');
    } finally {
      if (busy) {
        busy = false;
        render();
      }
    }
  }

  async function refreshLeaderboard() {
    try {
      const lb = await request(`${API.leaderboard}?period=${encodeURIComponent(leaderboardMode)}`);
      leaderboard = Array.isArray(lb.rows) ? lb.rows : [];
      leaderboardMeta = lb || null;
      if (leaderboardMode === 'weekly') { weeklyRewardRows = leaderboard; weeklyRewardMeta = lb || null; }
      rewardSettings = lb.rewardSettings || rewardSettings;
    } catch (_) {}
  }

  function renderBanner() {
    const s = currentGuessState() || state || {};
    if (!s?.finished) return null;

    const secret = s.secret || null;
    const guesses = Number((s.result && s.result.guessesUsed) || s.guessesUsed || 0);
    const guessLabel = `${guesses} guess${guesses === 1 ? '' : 'es'}`;

    const resultCard = (kind, title, line, subLine = '') => el('div', { class: `hg-result-card ${kind}` },
      el('div', { class: 'hg-result-trophy' }, kind === 'win' ? '🏆' : '💀'),
      el('div', { class: 'hg-result-center' },
        el('h3', {}, title),
        el('p', { class: 'hg-result-line' }, line),
        subLine ? el('div', { class: 'hg-result-sub' }, subLine) : null,
        secret ? el('div', { class: 'hg-result-avatar-wrap' }, avatarImg(secret, 'hg-result-avatar', secret.name)) : null
      )
    );

    if (playMode === 'practice') {
      if (s.solved) {
        return el('div', {},
          el('div', { class: 'hg-result-alert win' }, '🏆 ', el('strong', {}, `Practice solved in ${guessLabel}!`), ' Start another practice round whenever you want.'),
          resultCard('win', 'Practice Solved!', `You identified ${secret?.name || 'the hunter'} in ${guessLabel}.`, 'Practice mode does not give points or tickets.')
        );
      }
      return el('div', {},
        el('div', { class: 'hg-result-alert fail' }, '💀 ', el('strong', {}, 'Practice failed.'), ' No rewards are affected.'),
        resultCard('fail', 'Practice Failed', `The answer was ${secret?.name || 'unknown'}.`, 'You can start another practice round.')
      );
    }

    if (s.solved) {
      const r = s.result || {};
      const dailyReward = r.reward || { points: r.pointsAwarded || 0, drawTickets: r.ticketsAwarded || 0 };
      const streakReward = r.streakReward || null;
      const rewardSummary = el('div', { class: 'hg-result-reward-compact' },
        el('span', { class: 'hg-result-total' }, el('strong', {}, 'Total: '), compactRewardNode(addRewards(dailyReward, streakReward))),
        streakReward ? el('span', { class: 'hg-result-streak-badge' }, `🔥 Streak ${r.streakDays}`) : null
      );
      return el('div', {},
        el('div', { class: 'hg-result-alert win' }, '🏆 ', el('strong', {}, `You solved today's puzzle in ${guessLabel}!`), ' Come back tomorrow for a new challenge.'),
        resultCard('win', 'Congratulations!', el('span', {}, 'You identified ', el('strong', {}, secret?.name || 'the hunter'), ` in ${guessLabel}.`), rewardSummary)
      );
    }

    return el('div', {},
      el('div', { class: 'hg-result-alert fail' }, '💀 ', el('strong', {}, "You failed today's puzzle."), ' Come back tomorrow for a new challenge.'),
      resultCard('fail', 'Daily Failed', `The answer was ${secret?.name || 'unknown'}.`, 'You used all 8 guesses.')
    );
  }

  function renderAttemptsTable() {
    const s = currentGuessState() || state || {};
    const attempts = s?.attempts || [];
    const mobileAttempt = (a) => {
      const attr = (label, value, match) => el('div', { class: `hg-attempt-mobile-value ${resultClass(match)}` }, el('span', { class: 'hg-attempt-mobile-label' }, label), el('strong', {}, value || '-'));
      return el('article', { class: 'hg-mobile-card hg-attempt-mobile-card' },
        el('div', { class: 'hg-mobile-card-head' }, avatarImg(a.hunter, 'hg-avatar', a.hunter.name), el('strong', { class: 'hg-mobile-card-title' }, a.hunter.name)),
        el('div', { class: 'hg-attempt-mobile-grid' },
          attr('Element', a.values.element, a.result.element),
          attr('Rarity', a.values.rarity, a.result.rarity),
          attr('Class', a.values.className, a.result.className),
          attr('Role', a.values.role, a.result.role),
          attr('Limited', a.values.limited, a.result.limited),
          attr('Guild', a.values.guild, a.result.guild)
        )
      );
    };
    return el('div', { class: 'hg-attempts-wrap' },
      el('div', { class: 'hg-table-wrap hg-desktop-only' }, el('table', { class: 'hg-table hg-attempts-table' },
        el('thead', {}, el('tr', {},
          el('th', {}, 'Hunter'), el('th', {}, 'Element'), el('th', {}, 'Rarity'), el('th', {}, 'Class'), el('th', {}, 'Role'), el('th', {}, 'Limited'), el('th', {}, 'Guild')
        )),
        el('tbody', {}, attempts.length ? attempts.map(a => el('tr', {},
          el('td', {}, el('div', { class: 'hg-hunter-cell' }, avatarImg(a.hunter, 'hg-avatar', ''), el('strong', {}, a.hunter.name))),
          el('td', { class: resultClass(a.result.element) }, a.values.element),
          el('td', { class: resultClass(a.result.rarity) }, a.values.rarity),
          el('td', { class: resultClass(a.result.className) }, a.values.className),
          el('td', { class: resultClass(a.result.role) }, a.values.role),
          el('td', { class: resultClass(a.result.limited) }, a.values.limited),
          el('td', { class: resultClass(a.result.guild) }, a.values.guild)
        )) : el('tr', {}, el('td', { colspan: 7, class: 'hg-muted', style: 'padding:24px' }, 'No guesses yet.')))
      )),
      el('div', { class: 'hg-mobile-only hg-mobile-card-list' }, attempts.length ? attempts.map(mobileAttempt) : el('div', { class: 'hg-card hg-muted hg-center' }, 'No guesses yet.'))
    );
  }


  function closeHgModal() {
    document.querySelector('.hg-modal-backdrop')?.remove();
  }

  function openHgModal(title, body) {
    closeHgModal();
    const back = el('div', { class: 'hg-modal-backdrop', onclick: ev => { if (ev.target === ev.currentTarget) closeHgModal(); } },
      el('div', { class: 'hg-modal-card' },
        el('div', { class: 'hg-modal-head' }, el('h3', {}, title), el('button', { class: 'hg-x', onclick: closeHgModal }, '×')),
        body
      )
    );
    document.body.append(back);
  }

  function openRewardsModal(startTab = 'daily') {
    rewardsModalTab = startTab || rewardsModalTab || 'daily';
    const renderBody = () => {
      const tabs = el('div', { class: 'hg-reward-modal-tabs' },
        ...[['daily', 'Daily'], ['streak', 'Streak 🔥'], ['weekly', 'Weekly']].map(([key, label]) => el('button', {
          class: `hg-btn hg-tab ${rewardsModalTab === key ? 'active' : ''}`,
          onclick: async () => {
            rewardsModalTab = key;
            if (key === 'weekly') await refreshWeeklyRewardRows();
            renderBody();
          }
        }, label))
      );
      const wrap = el('div', { class: 'hg-reward-modal-inner', 'data-hg-reward-modal-inner': '1' },
        tabs,
        el('div', { class: 'hg-reward-modal-content', 'data-hg-reward-modal-content': '1' },
          rewardsModalTab === 'weekly' ? renderScoreTable('weekly') : rewardsModalTab === 'streak' ? renderScoreTable('streak') : renderScoreTable('daily', { compact: true })
        )
      );
      const content = document.querySelector('[data-hg-reward-modal-inner]');
      if (content) content.replaceChildren(...Array.from(wrap.childNodes));
      return wrap;
    };
    openHgModal('Rewards', el('div', { 'data-hg-reward-modal-root': '1' }, renderBody()));
    if (rewardsModalTab === 'weekly') refreshWeeklyRewardRows().then(() => renderBody());
  }

  function renderHowTo() {
    return el('details', { class: 'hg-card hg-how-details' },
      el('summary', { class: 'hg-btn hg-how-toggle' }, 'How to Play'),
      el('div', { class: 'hg-how hg-how-content' },
        el('div', {}, '🔎 Search for a hunter by name and submit your guess.'),
        el('div', {}, '✅ Green means the attribute matches the secret hunter.'),
        el('div', {}, '❌ Red means the attribute does not match.'),
        el('div', {}, '📅 You have 8 guesses. One new hunter every day.')
      )
    );
  }

  function renderScoreTable(kind = 'daily', opts = {}) {
    const cfg = rewardSettings || state?.rewardSettings || leaderboardMeta?.rewardSettings || {};
    const activeGuess = activeDailyRewardGuess();

    if (kind === 'streak') {
      const rows = Array.isArray(cfg.streak) ? cfg.streak : [];
      const activeDays = activeStreakRewardDays(rows);
      const maxDays = rows.reduce((m, r) => Math.max(m, Number(r.days || 0)), 0);
      return el('div', { class: 'hg-card warning hg-score-card' },
        el('h3', { style: 'margin:0 0 8px;font-size:18px;color:#facc15' }, '🔥 Streak Rewards'),
        el('div', { class: 'hg-muted', style: 'margin-bottom:12px' }, maxDays ? `The highest eligible tier is paid every solved daily. The ${maxDays}+ tier stays active after ${maxDays} days.` : 'Configure streak tiers in Admin.'),
        el('div', { class: 'hg-reward-grid hg-reward-grid-streak hg-desktop-only' },
          el('div', {}, 'Streak Tier'), el('div', {}, 'Reward'),
          rows.length ? rows.map(row => {
            const me = Number(row.days || 0) === activeDays;
            const label = `${row.days}+ day${Number(row.days) === 1 ? '' : 's'}`;
            return [
              el('div', { class: me ? 'hg-you-reward start' : '' }, label, me ? el('span', { class: 'hg-you-pill' }, 'You') : null),
              el('div', { class: me ? 'hg-you-reward end' : '' }, rewardNode(row, { includePoints: false }))
            ];
          }).flat() : [el('div', { class: 'hg-muted' }, 'No streak rewards'), el('div', {}, 'None')]
        ),
        el('div', { class: 'hg-mobile-only hg-mobile-card-list' }, rows.length ? rows.map(row => {
          const me = Number(row.days || 0) === activeDays;
          return el('article', { class: `hg-mobile-card hg-mobile-reward-card ${me ? 'is-you' : ''}` },
            el('div', { class: 'hg-mobile-reward-title' }, `${row.days}+ days`, me ? el('span', { class: 'hg-you-pill' }, 'You') : null),
            rewardNode(row, { includePoints: false })
          );
        }) : el('div', { class: 'hg-muted' }, 'No streak rewards'))
      );
    }

    if (kind === 'weekly') {
      const labels = [['1', 'Rank 1'], ['2', 'Rank 2'], ['3', 'Rank 3'], ['top10', 'Top 10'], ['participation', 'Participation']];
      const activeKey = currentWeeklyRewardKey();
      return el('div', { class: 'hg-card warning hg-score-card' },
        el('h3', { style: 'margin:0 0 14px;font-size:18px;color:#facc15' }, '🏆 Weekly Ranking Rewards'),
        el('div', { class: 'hg-reward-grid hg-reward-grid-weekly hg-desktop-only' },
          el('div', {}, 'Place'), el('div', {}, 'Reward'),
          labels.map(([key, label]) => {
            const me = key === activeKey;
            return [
              el('div', { class: me ? 'hg-you-reward start' : '' }, label, me ? el('span', { class: 'hg-you-pill' }, 'You') : null),
              el('div', { class: me ? 'hg-you-reward end' : '' }, rewardNode(cfg.weekly?.[key], { includePoints: false }))
            ];
          }).flat()
        ),
        el('div', { class: 'hg-mobile-only hg-mobile-card-list' }, labels.map(([key, label]) => {
          const me = key === activeKey;
          return el('article', { class: `hg-mobile-card hg-mobile-reward-card ${me ? 'is-you' : ''}` },
            el('div', { class: 'hg-mobile-reward-title' }, label, me ? el('span', { class: 'hg-you-pill' }, 'You') : null),
            rewardNode(cfg.weekly?.[key], { includePoints: false })
          );
        }))
      );
    }

    const rows = Array.from({ length: 8 }, (_, i) => i + 1);
    const rowNodes = rows.map(i => {
      const reward = cfg.daily?.[i] || state?.dailyRewards?.[i] || { points: pointsFor(i), drawTickets: ticketsFor(i) };
      const me = activeGuess > 0 && i === activeGuess;
      return [
        el('div', { class: me ? 'hg-you-reward start' : '' }, `Guess ${i}`, i <= 3 ? el('span', { class: 'hg-fast-pill' }, 'Fast!') : null, me ? el('span', { class: 'hg-you-pill' }, 'You') : null),
        el('div', { class: me ? 'hg-you-reward mid' : '' }, reward.points || 0),
        el('div', { class: me ? 'hg-you-reward end' : '' }, rewardNode(reward, { includePoints: false }))
      ];
    }).flat();
    const mobileRows = rows.map(i => {
      const reward = cfg.daily?.[i] || state?.dailyRewards?.[i] || { points: pointsFor(i), drawTickets: ticketsFor(i) };
      const me = activeGuess > 0 && i === activeGuess;
      return el('article', { class: `hg-mobile-card hg-mobile-reward-card ${me ? 'is-you' : ''}` },
        el('div', { class: 'hg-mobile-reward-title' }, `Guess ${i}`, i <= 3 ? el('span', { class: 'hg-fast-pill' }, 'Fast!') : null, me ? el('span', { class: 'hg-you-pill' }, 'You') : null),
        el('div', { class: 'hg-mobile-points' }, `${reward.points || 0} pts`),
        rewardNode(reward, { includePoints: false })
      );
    });
    const solvedResult = state?.finished && state?.result?.solved ? state.result : null;
    const paidDaily = solvedResult?.reward || null;
    const paidStreak = solvedResult?.streakReward || null;
    const paidSummary = solvedResult ? el('div', { class: 'hg-result-reward-compact', style: 'margin-top:14px' },
      el('span', {}, el('strong', {}, 'Total: '), compactRewardText(addRewards(paidDaily, paidStreak))),
      paidStreak ? el('span', { class: 'hg-result-streak-badge' }, `🔥 Streak ${solvedResult.streakDays}`) : null
    ) : null;

    return el('div', { class: 'hg-card warning hg-score-card' },
      el('div', { style: 'display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:14px;flex-wrap:wrap' },
        el('h3', { style: 'margin:0;font-size:18px;color:#facc15;font-weight:1000' }, 'ℹ️ Daily Point & Reward System'),
        opts.compact ? null : el('button', { class: 'hg-btn small', onclick: () => openRewardsModal('daily') }, 'Rewards')
      ),
      el('div', { class: 'hg-score-layout' },
        el('div', { class: 'hg-score-grid hg-desktop-only' },
          el('div', {}, 'Guesses Used'), el('div', {}, '⭐ Points'), el('div', {}, '🎁 Rewards'),
          rowNodes,
          el('div', {}, 'Failed'), el('div', {}, '0'), el('div', {}, rewardNode(cfg.daily?.failed, { includePoints: false }))
        ),
        el('div', { class: 'hg-mobile-only hg-mobile-card-list' },
          mobileRows,
          el('article', { class: 'hg-mobile-card hg-mobile-reward-card' },
            el('div', { class: 'hg-mobile-reward-title' }, 'Failed'),
            el('div', { class: 'hg-mobile-points' }, '0 pts'),
            rewardNode(cfg.daily?.failed, { includePoints: false })
          )
        ),
        opts.compact ? null : el('div', { class: 'hg-score-side' },
          el('div', {}, '💡 Points are awarded once per day when you solve the puzzle.'),
          el('div', {}, currencyIcon('draw'), ' Draw tickets, weapon tickets, gold and essence can be configured in Admin.'),
          el('div', {}, '🔥 Streak rewards can trigger on solved daily puzzles.')
        )
      ),
      paidSummary
    );
  }

  function renderLeaderboard() {
    const rankIcon = (rank) => {
      if (rank === 1) return '🏆';
      if (rank === 2) return '🥈';
      if (rank === 3) return '🥉';
      return `#${rank}`;
    };

    const modeBtn = (mode, label) => el('button', {
      class: `hg-btn hg-tab ${leaderboardMode === mode ? 'active' : ''}`,
      onclick: async () => {
        leaderboardMode = mode;
        try { localStorage.setItem('hunter_guess_leaderboard_mode', mode); } catch (_) {}
        await refreshLeaderboard();
        render();
      }
    }, label);

    const reset = leaderboardMeta?.weeklyResetAt || state?.weeklyResetAt;

    return el('div', {},
      renderScoreTable('daily'),
      el('div', { class: 'hg-card' },
        el('div', { class: 'hg-lb-head' },
          el('div', {},
            el('h3', { style: 'margin:0 0 6px;font-size:20px' }, leaderboardMode === 'weekly' ? '🏆 Weekly Rankings' : '🏅 All-Time Rankings'),
            el('div', { class: 'hg-muted' }, leaderboardMode === 'weekly'
              ? `Weekly resets Monday 00:00 UTC${reset ? ` · ${countdownText(reset)} left` : ''}`
              : 'All-time ranking does not reset and has no weekly reward payout.')
          ),
          el('div', { class: 'hg-tabs', style: 'margin:0' }, modeBtn('weekly', 'Weekly'), modeBtn('all', 'All-Time'))
        ),
        leaderboard.length ? leaderboard.map(r => el('div', { class: `hg-lb-row rank-${Math.min(Number(r.rank || 0), 3)} ${r.currentUser ? 'me' : ''}` },
          el('div', { class: 'hg-rank' },
            el('div', { class: 'hg-rank-medal' }, rankIcon(Number(r.rank || 0))),
            Number(r.rank || 0) <= 3 ? el('div', { class: 'hg-rank-num' }, r.rank) : null
          ),
          el('div', { class: 'hg-lb-name' }, r.username, r.currentUser ? el('span', { class: 'hg-you-pill' }, 'You') : null, Number(r.solved || 0) > 1 ? el('span', { class: 'hg-streak-pill' }, '🔥') : null),
          statBox('Points', r.points),
          statBox('Solved', r.solved, true),
          statBox('Played', r.played, true),
          statBox('Best', r.best ? el('span', { class: 'hg-best-pill' }, `${r.best} guesses`) : '-', true),
          statBox('Avg', r.avg || '-', true)
        )) : el('div', { class: 'hg-muted' }, 'No rankings yet.')
      )
    );
  }

  function statBox(label, value, hideMobile = false) {
    return el('div', { class: hideMobile ? 'hide-mobile' : '' }, el('div', { class: 'hg-stat-label' }, label), el('div', { class: 'hg-stat-value' }, value));
  }

  function uniqueSorted(values) {
    return Array.from(new Set((values || []).map(v => String(v || '').trim()).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  }

  function assetUrl(path) {
    const p = String(path || '').trim();
    if (!p) return '';
    if (/^https?:\/\//i.test(p) || p.startsWith('data:')) return p;
    if (typeof window.url === 'function') return window.url(p.startsWith('/') ? p : `/${p}`);
    return p.startsWith('/') ? p : `/${p}`;
  }

  function slugIconName(v) {
    return String(v || '')
      .trim()
      .replace(/[’'`]/g, '')
      .replace(/\s*[-–—]\s*/g, '_')
      .replace(/[^A-Za-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .replace(/_+/g, '_');
  }

  function elementIcon(value) {
    const key = String(value || '').trim().toLowerCase();
    const map = {
      fire: '/picture/Element/Fires.png',
      water: '/picture/Element/Waters.png',
      wind: '/picture/Element/Winds.png',
      light: '/picture/Element/Lights.png',
      dark: '/picture/Element/Darkness.png',
      none: '/picture/Element/NONE.png'
    };
    return map[key] ? [assetUrl(map[key])] : [];
  }

  function rarityIcon(value) {
    const r = String(value || '').trim().toUpperCase();
    if (!r || r === 'UNKNOWN') return [];
    return [assetUrl(`/picture/Rarity/${slugIconName(r)}.png`)];
  }

  function classIcon(value) {
    const v = String(value || '').trim();
    if (!v || v === 'Unknown') return [];
    const map = {
      Striker: '/picture/Type/Striker.png',
      Breaker: '/picture/Type/Breaker.png',
      Supporter: '/picture/Type/Supporter.png',
      'Elemental Stacker': '/picture/Type/Stacker.png',
      'Elemental Buster': '/picture/Type/Buster.png',
      Buster: '/picture/Type/Buster.png'
    };
    const out = [];
    if (map[v]) out.push(assetUrl(map[v]));
    const slug = slugIconName(v);
    if (slug) out.push(assetUrl(`/picture/Type/${slug}.png`));
    return Array.from(new Set(out));
  }

  function typeIcon(value) {
    const slug = slugIconName(value);
    if (!slug || slug.toLowerCase() === 'unknown') return [];
    // Role icons are in /picture/Type/ on your site.
    return [assetUrl(`/picture/Type/${slug}.png`)];
  }

  function guildIcon(value) {
    const raw = String(value || '').trim();
    if (!raw || raw.toLowerCase() === 'no guild') return [];
    const slug = slugIconName(raw);
    return slug ? [assetUrl(`/picture/Guild/${slug}.png`)] : [];
  }

  function iconCandidates(kind, value) {
    if (kind === 'element') return elementIcon(value);
    if (kind === 'rarity') return rarityIcon(value);
    if (kind === 'className') return classIcon(value);
    if (kind === 'type') return typeIcon(value);
    if (kind === 'guild') return guildIcon(value);
    return [];
  }

  function iconImg(kind, value, className = 'hg-chip-icon', withTip = true) {
    const candidates = iconCandidates(kind, value);
    if (!candidates.length) return null;

    const kindCss = String(kind || 'other').replace(/[^a-z0-9_-]/gi, '').replace(/^className$/i, 'class').toLowerCase() || 'other';
    const scope = String(className || '').includes('hg-chip-icon') ? 'filter' : 'table';
    const finalClass = `${className || ''} hg-img-${kindCss} hg-${scope}-img-${kindCss}`.trim();

    const img = el('img', {
      class: finalClass,
      src: candidates[0],
      alt: String(value || ''),
      onmouseenter: withTip ? (ev) => showPageTip(String(value || ''), ev) : null,
      onmousemove: withTip ? (ev) => movePageTip(ev) : null,
      onmouseleave: withTip ? () => hidePageTip() : null,
      onclick: withTip ? (ev) => { ev.stopPropagation(); showPageTip(String(value || ''), ev, true); } : null
    });
    img._candidates = candidates;
    img._idx = 0;
    img.onerror = function () {
      this._idx = (this._idx || 0) + 1;
      if (this._candidates && this._idx < this._candidates.length) this.src = this._candidates[this._idx];
      else this.remove();
    };
    return img;
  }

  function ensurePageTip() {
    let tip = document.getElementById('hg-page-tip');
    if (!tip) {
      tip = el('div', { id: 'hg-page-tip', class: 'hg-page-tip' });
      document.body.appendChild(tip);
    }
    return tip;
  }

  let pageTipTimer = null;
  function movePageTip(ev) {
    const tip = ensurePageTip();
    const pad = 14;
    const x = Math.min(window.innerWidth - 20, (ev.clientX || 0) + pad);
    const y = Math.min(window.innerHeight - 20, (ev.clientY || 0) + pad);
    tip.style.left = `${x}px`;
    tip.style.top = `${y}px`;
  }

  function showPageTip(text, ev, sticky = false) {
    const tip = ensurePageTip();
    tip.textContent = text || '-';
    tip.style.display = 'block';
    movePageTip(ev || { clientX: 20, clientY: 20 });
    if (pageTipTimer) clearTimeout(pageTipTimer);
    if (sticky) pageTipTimer = setTimeout(() => hidePageTip(), 1600);
  }

  function hidePageTip() {
    const tip = document.getElementById('hg-page-tip');
    if (tip) tip.style.display = 'none';
    if (pageTipTimer) clearTimeout(pageTipTimer);
    pageTipTimer = null;
  }

  function isSelected(key, value) {
    const cur = helperFilters[key];
    if (!Array.isArray(cur)) return !cur || cur === 'all' ? false : String(cur) === String(value);
    return cur.includes(String(value));
  }

  function hasAnySelected(key) {
    const cur = helperFilters[key];
    return Array.isArray(cur) ? cur.length > 0 : !!cur && cur !== 'all';
  }

  function toggleFilterValue(key, value) {
    const val = String(value || '').trim();
    if (!val) return;
    const cur = Array.isArray(helperFilters[key]) ? [...helperFilters[key]] : [];
    const idx = cur.indexOf(val);
    if (idx >= 0) cur.splice(idx, 1);
    else cur.push(val);
    helperFilters[key] = cur;
  }

  function clearFilter(key) {
    helperFilters[key] = [];
  }

  function resetHelperFilters() {
    helperFilters = { q: '', element: [], rarity: [], className: [], type: [], limited: [], guild: [] };
  }

  function rowMatchesFilters(h) {
    const q = String(helperFilters.q || '').trim().toLowerCase();
    const hay = `${h.name || ''} ${h.element || ''} ${h.rarity || ''} ${h.className || ''} ${h.role || ''} ${h.limited || ''} ${h.guild || ''}`.toLowerCase();
    if (q && !hay.includes(q)) return false;
    const matchMulti = (key, value) => {
      const arr = Array.isArray(helperFilters[key]) ? helperFilters[key] : [];
      return !arr.length || arr.includes(String(value || ''));
    };
    return matchMulti('element', h.element)
      && matchMulti('rarity', h.rarity)
      && matchMulti('className', h.className)
      && matchMulti('type', h.role)
      && matchMulti('limited', h.limited)
      && matchMulti('guild', h.guild);
  }

  function iconOnly(kind, value) {
    const icon = iconImg(kind, value, 'hg-value-img', true);
    return el('span', {
      class: 'hg-icon-only',
      onmouseenter: (ev) => showPageTip(String(value || '-'), ev),
      onmousemove: (ev) => movePageTip(ev),
      onmouseleave: () => hidePageTip(),
      onclick: (ev) => showPageTip(String(value || '-'), ev, true)
    }, icon || el('span', { class: 'hg-muted' }, '—'));
  }

  function filterChip(label, key, value, kind, mode = 'icon') {
    const selected = isSelected(key, value);
    const parts = [];
    // Filters should not show the page tooltip. Tooltip/click-to-name is only for images in the result table.
    if (mode === 'icon' || mode === 'guild' || mode === 'iconText') parts.push(iconImg(kind || key, value, 'hg-chip-icon', false));
    if (mode === 'text' || mode === 'guild' || mode === 'iconText') parts.push(el('span', { class: mode === 'guild' ? 'hg-wrap-two' : '' }, label || value));
    const btn = el('button', {
      type: 'button',
      class: `hg-filter-chip ${selected ? 'active' : ''} ${mode === 'icon' ? 'icon-only' : ''} ${mode === 'iconText' ? 'with-name' : ''} ${mode === 'guild' ? 'guild-chip' : ''}`,
      'data-filter-key': key,
      'data-filter-value': String(value || ''),
      onclick: () => {
        toggleFilterValue(key, value);
        updateHunterListFiltered();
      },
      onmouseenter: null,
      onmousemove: null,
      onmouseleave: null
    }, ...parts.filter(Boolean));
    return btn;
  }

  function filterGroup(title, key, options, kind = key, mode = 'icon') {
    return el('div', { class: 'hg-filter-group' },
      el('div', { class: 'hg-filter-title' }, title),
      el('div', { class: 'hg-filter-chips' },
        el('button', {
          type: 'button',
          class: `hg-filter-chip small ${hasAnySelected(key) ? '' : 'active'}`,
          'data-filter-all': key,
          onclick: () => {
            if (hasAnySelected(key)) clearFilter(key);
            else helperFilters[key] = (options || []).map(v => String(v || '').trim()).filter(Boolean);
            updateHunterListFiltered();
          }
        }, 'All'),
        ...options.map(opt => filterChip(opt, key, opt, kind, mode))
      )
    );
  }

  function getHunterListRows() {
    return hunters
      .slice()
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' }))
      .filter(rowMatchesFilters);
  }

  function makeHunterListRow(h) {
    return el('tr', {},
      el('td', { class: 'hg-center-cell' }, avatarImg(h, 'hg-helper-img', h.name)),
      el('td', { class: 'hg-text-left' }, el('div', { class: 'hg-wrap-two', style: 'font-weight:900' }, h.name || '-')),
      el('td', { class: 'hg-center-cell' }, iconOnly('element', h.element)),
      el('td', { class: 'hg-center-cell' }, iconOnly('rarity', h.rarity)),
      el('td', { class: 'hg-center-cell' }, iconOnly('className', h.className)),
      el('td', { class: 'hg-center-cell' }, iconOnly('type', h.role)),
      el('td', { class: 'hg-center-cell' }, el('span', { class: 'hg-limited-text' }, h.limited || '-')),
      el('td', { class: 'hg-text-left' }, el('span', { style: 'display:inline-flex;align-items:center;gap:8px;min-width:0' }, iconImg('guild', h.guild, 'hg-value-img', true), el('span', { class: 'hg-guild-two' }, h.guild || '-')))
    );
  }

  function makeHunterListCard(h) {
    const detail = (label, value) => el('div', { class: 'hg-mobile-detail' }, el('span', { class: 'hg-mobile-label' }, label), value);
    return el('article', { class: 'hg-mobile-card hg-hunter-mobile-card' },
      el('div', { class: 'hg-mobile-card-head' },
        avatarImg(h, 'hg-helper-img', h.name),
        el('strong', { class: 'hg-mobile-card-title' }, h.name || '-')
      ),
      el('div', { class: 'hg-mobile-detail-grid' },
        detail('Element', iconOnly('element', h.element)),
        detail('Rarity', el('span', {}, h.rarity || '-')),
        detail('Class', el('span', { class: 'hg-mobile-icon-text' }, iconImg('className', h.className, 'hg-value-img', true), h.className || '-')),
        detail('Role', el('span', { class: 'hg-mobile-icon-text' }, iconImg('type', h.role, 'hg-value-img', true), h.role || '-')),
        detail('Limited', el('span', {}, h.limited || '-')),
        detail('Guild', el('span', { class: 'hg-mobile-icon-text hg-mobile-guild' }, iconImg('guild', h.guild, 'hg-value-img', true), h.guild || '-'))
      )
    );
  }

  function updateHunterListFiltered() {
    const root = document.getElementById('hg-helper-root');
    if (!root) return render();
    const all = hunters || [];
    const rows = getHunterListRows();
    const count = root.querySelector('[data-hg-helper-count]');
    if (count) count.textContent = `Showing ${rows.length} of ${all.length} hunters`;
    const tbody = root.querySelector('[data-hg-helper-body]');
    if (tbody) {
      tbody.innerHTML = '';
      if (rows.length) rows.forEach(h => tbody.append(makeHunterListRow(h)));
      else tbody.append(el('tr', {}, el('td', { colspan: 8, class: 'hg-muted', style: 'padding:24px' }, 'No hunters match these filters.')));
    }
    const cards = root.querySelector('[data-hg-helper-cards]');
    if (cards) {
      cards.replaceChildren(...(rows.length ? rows.map(makeHunterListCard) : [el('div', { class: 'hg-muted' }, 'No hunters match these filters.')]));
    }
    root.querySelectorAll('[data-filter-key]').forEach(btn => {
      btn.classList.toggle('active', isSelected(btn.getAttribute('data-filter-key'), btn.getAttribute('data-filter-value')));
    });
    root.querySelectorAll('[data-filter-all]').forEach(btn => {
      btn.classList.toggle('active', !hasAnySelected(btn.getAttribute('data-filter-all')));
    });
  }

  function renderHunterList() {
    const all = hunters.slice().sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' }));

    const elements = uniqueSorted(all.map(h => h.element));
    const rarities = uniqueSorted(all.map(h => h.rarity));
    const classes = uniqueSorted(all.map(h => h.className));
    const types = uniqueSorted(all.map(h => h.role));
    const limited = uniqueSorted(all.map(h => h.limited));
    const guilds = uniqueSorted(all.map(h => h.guild));
    const rows = getHunterListRows();

    const searchInput = el('input', {
      class: 'hg-filter hg-helper-search-input',
      placeholder: 'Search hunter, guild, class...',
      value: helperFilters.q || '',
      oninput: ev => {
        helperFilters.q = ev.currentTarget.value;
        updateHunterListFiltered();
      }
    });

    const resetBtn = el('button', {
      class: 'hg-btn',
      onclick: () => {
        resetHelperFilters();
        searchInput.value = '';
        updateHunterListFiltered();
      }
    }, 'Reset Filters');

    return el('div', { class: 'hg-card', id: 'hg-helper-root' },
      el('div', { style: 'display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:12px' },
        el('div', {},
          el('h3', { style: 'margin:0 0 6px;font-size:20px;color:#facc15;font-weight:1000' }, 'Hunter List'),
          el('div', { class: 'hg-muted' }, 'Use filters to narrow down possible hunters. Multiple values can be selected at once.')
        )
      ),
      el('div', { class: 'hg-helper-search-row' },
        searchInput,
        el('button', {
          class: 'hg-filter-toggle',
          type: 'button',
          onclick: () => {
            helperFiltersCollapsed = !helperFiltersCollapsed;
            try { localStorage.setItem(FILTERS_COLLAPSED_KEY, helperFiltersCollapsed ? '1' : '0'); } catch (_) {}
            render();
          }
        }, helperFiltersCollapsed ? 'Show Filters' : 'Hide Filters'),
        resetBtn
      ),
      el('div', { class: `hg-filter-panel ${helperFiltersCollapsed ? 'is-collapsed' : ''}` },
        filterGroup('Element', 'element', elements, 'element', 'icon'),
        filterGroup('Rarity', 'rarity', rarities, 'rarity', 'icon'),
        filterGroup('Class', 'className', classes, 'className', 'iconText'),
        filterGroup('Role', 'type', types, 'type', 'iconText'),
        filterGroup('Limited', 'limited', limited, 'limited', 'text'),
        filterGroup('Guild', 'guild', guilds, 'guild', 'guild')
      ),
      el('div', { class: 'hg-helper-count', 'data-hg-helper-count': '1' }, `Showing ${rows.length} of ${all.length} hunters`),
      el('div', { class: 'hg-table-wrap hg-desktop-only' },
        el('table', { class: 'hg-table hg-helper-table' },
          el('thead', {}, el('tr', {},
            el('th', {}, 'Image'),
            el('th', { style: 'text-align:left' }, 'Hunter Name'),
            el('th', {}, 'Element'),
            el('th', {}, 'Rarity'),
            el('th', {}, 'Class'),
            el('th', {}, 'Role'),
            el('th', {}, 'Limited'),
            el('th', { style: 'text-align:left' }, 'Guild')
          )),
          el('tbody', { 'data-hg-helper-body': '1' }, rows.length ? rows.map(makeHunterListRow) : el('tr', {}, el('td', { colspan: 8, class: 'hg-muted', style: 'padding:24px' }, 'No hunters match these filters.')))
        )
      ),
      el('div', { class: 'hg-mobile-only hg-mobile-card-list', 'data-hg-helper-cards': '1' }, rows.length ? rows.map(makeHunterListCard) : el('div', { class: 'hg-muted' }, 'No hunters match these filters.'))
    );
  }


  function rewardInput(obj, key) {
    return el('input', {
      class: 'hg-admin-input hg-reward-input',
      type: 'number',
      min: '0',
      step: '1',
      value: rewardNum(obj[key]),
      oninput: ev => { obj[key] = rewardNum(ev.currentTarget.value); }
    });
  }

  function renderRewardEditor() {
    if (!rewardDraft) rewardDraft = cloneRewards();

    const dailyRows = [];
    for (let i = 1; i <= 8; i++) {
      const r = rewardDraft.daily[i] || (rewardDraft.daily[i] = emptyReward());
      dailyRows.push(el('tr', {},
        el('td', {}, `Guess ${i}`),
        el('td', {}, rewardInput(r, 'points')),
        el('td', {}, rewardInput(r, 'drawTickets')),
        el('td', {}, rewardInput(r, 'weaponTickets')),
        el('td', {}, rewardInput(r, 'gold')),
        el('td', {}, rewardInput(r, 'essence'))
      ));
    }

    const streakRows = (rewardDraft.streak || []).map((r, idx) => el('tr', {},
      el('td', {}, el('input', { class: 'hg-admin-input hg-reward-input', type: 'number', min: '1', step: '1', value: rewardNum(r.days) || 1, oninput: ev => { r.days = Math.max(1, rewardNum(ev.currentTarget.value)); } })),
      el('td', {}, rewardInput(r, 'drawTickets')),
      el('td', {}, rewardInput(r, 'weaponTickets')),
      el('td', {}, rewardInput(r, 'gold')),
      el('td', {}, rewardInput(r, 'essence')),
      el('td', {}, el('button', { class: 'hg-btn small', onclick: () => { rewardDraft.streak.splice(idx, 1); render(); } }, 'Remove'))
    ));

    const weeklyLabels = [['1', 'Rank 1'], ['2', 'Rank 2'], ['3', 'Rank 3'], ['top10', 'Top 10'], ['participation', 'Participation']];
    const weeklyRows = weeklyLabels.map(([key, label]) => {
      const r = rewardDraft.weekly[key] || (rewardDraft.weekly[key] = emptyReward());
      return el('tr', {},
        el('td', {}, label),
        el('td', {}, rewardInput(r, 'drawTickets')),
        el('td', {}, rewardInput(r, 'weaponTickets')),
        el('td', {}, rewardInput(r, 'gold')),
        el('td', {}, rewardInput(r, 'essence'))
      );
    });

    const save = el('button', { class: 'hg-btn primary', onclick: async () => {
      try {
        const res = await request(API.adminSaveRewards, { method: 'POST', body: JSON.stringify({ rewards: rewardDraft }) });
        rewardSettings = res.rewards || rewardDraft;
        rewardDraft = null;
        state = await request(API.state);
        await refreshLeaderboard();
        toast('Reward settings saved');
        render();
      } catch (e) { toast(e.message || 'Reward save failed'); }
    } }, 'Save Rewards');

    const tabBtn = (key, label) => el('button', { class: `hg-btn hg-tab ${adminRewardTab === key ? 'active' : ''}`, onclick: () => { adminRewardTab = key; render(); } }, label);

    const rewardField = (label, obj, key) => el('label', { class: 'hg-mobile-form-field' }, el('span', {}, label), rewardInput(obj, key));
    const dailyCards = el('div', { class: 'hg-mobile-only hg-mobile-card-list' }, Array.from({ length: 8 }, (_, idx) => {
      const i = idx + 1;
      const r = rewardDraft.daily[i];
      return el('article', { class: 'hg-mobile-card hg-admin-reward-card' },
        el('strong', { class: 'hg-mobile-card-title' }, `Guess ${i}`),
        el('div', { class: 'hg-mobile-form-grid' }, rewardField('Points', r, 'points'), rewardField('Draw', r, 'drawTickets'), rewardField('Weapon', r, 'weaponTickets'), rewardField('Gold', r, 'gold'), rewardField('Essence', r, 'essence'))
      );
    }));
    const streakCards = el('div', { class: 'hg-mobile-only hg-mobile-card-list' }, (rewardDraft.streak || []).map((r, idx) =>
      el('article', { class: 'hg-mobile-card hg-admin-reward-card' },
        el('label', { class: 'hg-mobile-form-field' }, el('span', {}, 'Streak days'), el('input', { class: 'hg-admin-input hg-reward-input', type: 'number', min: '1', step: '1', value: rewardNum(r.days) || 1, oninput: ev => { r.days = Math.max(1, rewardNum(ev.currentTarget.value)); } })),
        el('div', { class: 'hg-mobile-form-grid' }, rewardField('Draw', r, 'drawTickets'), rewardField('Weapon', r, 'weaponTickets'), rewardField('Gold', r, 'gold'), rewardField('Essence', r, 'essence')),
        el('button', { class: 'hg-btn small', onclick: () => { rewardDraft.streak.splice(idx, 1); render(); } }, 'Remove')
      )
    ));
    const weeklyCards = el('div', { class: 'hg-mobile-only hg-mobile-card-list' }, weeklyLabels.map(([key, label]) => {
      const r = rewardDraft.weekly[key];
      return el('article', { class: 'hg-mobile-card hg-admin-reward-card' },
        el('strong', { class: 'hg-mobile-card-title' }, label),
        el('div', { class: 'hg-mobile-form-grid' }, rewardField('Draw', r, 'drawTickets'), rewardField('Weapon', r, 'weaponTickets'), rewardField('Gold', r, 'gold'), rewardField('Essence', r, 'essence'))
      );
    }));

    const dailyTable = el('div', { class: 'hg-admin-table-wrap hg-desktop-only' }, el('table', { class: 'hg-admin-table hg-reward-admin-table' },
      el('thead', {}, el('tr', {}, el('th', {}, 'Result'), el('th', {}, 'Points'), el('th', {}, 'Draw'), el('th', {}, 'Weapon'), el('th', {}, 'Gold'), el('th', {}, 'Essence'))),
      el('tbody', {}, dailyRows)
    ));
    const streakTable = el('div', {},
      el('div', { class: 'hg-muted', style: 'margin:0 0 10px' }, 'Streak rows are tiers: 3+, 5+, 7+ etc. The highest tier stays active after the max streak tier.'),
      el('div', { class: 'hg-admin-table-wrap hg-desktop-only' }, el('table', { class: 'hg-admin-table hg-reward-admin-table' },
        el('thead', {}, el('tr', {}, el('th', {}, 'Streak Days'), el('th', {}, 'Draw'), el('th', {}, 'Weapon'), el('th', {}, 'Gold'), el('th', {}, 'Essence'), el('th', {}, ''))),
        el('tbody', {}, streakRows.length ? streakRows : el('tr', {}, el('td', { colspan: 6, class: 'hg-muted' }, 'No streak rewards.')))
      )),
      streakCards,
      el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;margin:10px 0' },
        el('button', { class: 'hg-btn small', onclick: () => { rewardDraft.streak.push({ days: 3, drawTickets: 2, weaponTickets: 0, gold: 0, essence: 10, points: 0 }); render(); } }, 'Add 3+ Tier'),
        el('button', { class: 'hg-btn small', onclick: () => { rewardDraft.streak.push({ days: 5, drawTickets: 4, weaponTickets: 0, gold: 0, essence: 20, points: 0 }); render(); } }, 'Add 5+ Tier'),
        el('button', { class: 'hg-btn small', onclick: () => { rewardDraft.streak.push({ days: 7, drawTickets: 5, weaponTickets: 1, gold: 0, essence: 25, points: 0 }); render(); } }, 'Add 7+ Tier')
      )
    );
    const weeklyTable = el('div', {},
      el('div', { class: 'hg-admin-table-wrap hg-desktop-only' }, el('table', { class: 'hg-admin-table hg-reward-admin-table' },
        el('thead', {}, el('tr', {}, el('th', {}, 'Place'), el('th', {}, 'Draw'), el('th', {}, 'Weapon'), el('th', {}, 'Gold'), el('th', {}, 'Essence'))),
        el('tbody', {}, weeklyRows)
      )),
      weeklyCards
    );

    const compensate = el('button', { class: 'hg-btn', onclick: async ev => {
      const button = ev.currentTarget;
      button.disabled = true;
      try {
        compensationResult = await request(API.adminCompensate, { method: 'POST', body: '{}' });
        state = await request(API.state);
        toast(`Compensated ${compensationResult.compensated} player${compensationResult.compensated === 1 ? '' : 's'}`);
        render();
      } catch (e) {
        toast(e.message || 'Compensation failed');
        button.disabled = false;
      }
    } }, "Compensate Today's Solved Players");

    const compensationPanel = el('div', { class: 'hg-admin-rewards' },
      el('h4', { style: 'margin-top:0' }, 'Streak Reward Compensation'),
      el('p', { class: 'hg-muted' }, "Use this if streak rewards were changed/fixed after players already solved today's Hunter Guess. It will only pay missing streak rewards once."),
      compensate,
      compensationResult ? el('div', { style: 'margin-top:10px;font-weight:900' },
        `Checked ${compensationResult.checked} players, compensated ${compensationResult.compensated}, skipped ${compensationResult.skipped}. Paid: ${rewardText(compensationResult.totals, { includePoints: false })}.`
      ) : null
    );

    return el('div', { class: 'hg-admin-section' },
      el('h3', { class: 'hg-admin-section-title' }, 'Reward Settings'),
      el('p', { class: 'hg-muted' }, 'Configure Daily, Streak and Weekly rewards. Draw = custom tickets. Weekly ranking resets Monday 00:00 UTC; all-time ranking does not reset.'),
      el('div', { class: 'hg-admin-tabs' }, tabBtn('daily', 'Daily'), tabBtn('streak', 'Streak 🔥'), tabBtn('weekly', 'Weekly')),
      adminRewardTab === 'weekly' ? weeklyTable : adminRewardTab === 'streak' ? streakTable : el('div', {}, dailyTable, dailyCards),
      el('div', { style: 'margin-top:12px;display:flex;gap:10px;flex-wrap:wrap' }, save, el('button', { class: 'hg-btn', onclick: () => { rewardDraft = cloneRewards(rewardSettings); render(); } }, 'Reset Changes')),
      compensationPanel
    );
  }

  function renderAdmin() {
    if (!isAdmin()) return null;

    const ROLE_OPTIONS = ['Mage', 'Assassin', 'Healer', 'Fighter', 'Tank', 'Ranger', 'Unknown'];
    const CLASS_OPTIONS = ['Breaker', 'Elemental Buster', 'Elemental Stacker', 'Striker', 'Supporter', 'Unknown'];
    const LIMITED_OPTIONS = ['Standard', 'Limited'];

    if (!Array.isArray(adminDraft) || adminDraft.length !== hunters.length) {
      adminDraft = hunters.map(h => ({
        name: h.name,
        role: h.role || h.classOriginal || 'Unknown',
        className: h.className || h.type || 'Unknown',
        limited: h.limited || 'Standard'
      }));
    }

    const info = el('div', { class: 'hg-muted', style: 'margin-top:10px' }, `Using ${hunters.length} hunters from the main Hunters catalog. Images, element and rarity come from /api/public/hunters. Guild comes from Hunter Details.`);

    const dailySecret = adminDaily?.secret || null;
    const dailyAnswerCard = el('div', { class: 'hg-admin-answer' },
      el('div', { class: 'hg-muted', style: 'font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:.04em' }, `Today's answer${adminDaily?.date ? ` · ${adminDaily.date}` : ''}`),
      dailySecret
        ? el('div', { class: 'hg-admin-answer-main' },
            avatarImg(dailySecret, 'hg-avatar', ''),
            el('div', {},
              el('div', { style: 'font-size:18px;font-weight:1000;color:#fff' }, dailySecret.name),
              el('div', { class: 'hg-muted' }, `${dailySecret.element || '—'} • ${dailySecret.rarity || '—'} • ${dailySecret.className || '—'} • ${dailySecret.role || '—'} • ${dailySecret.limited || '—'} • ${dailySecret.guild || '—'}`)
            )
          )
        : el('div', { class: 'hg-muted' }, 'No daily hunter selected yet.')
    );

    function select(field, value, options) {
      const node = el('select', {
        class: 'hg-admin-input',
        onchange: ev => { value[field] = ev.currentTarget.value; }
      });
      const current = String(value[field] || '').trim();
      const hasCurrent = current && !options.some(x => String(x).toLowerCase() === current.toLowerCase());
      if (hasCurrent) node.append(el('option', { value: current, selected: true }, current));
      for (const opt of options) node.append(el('option', { value: opt, selected: String(opt).toLowerCase() === current.toLowerCase() }, opt));
      return node;
    }

    const rows = adminDraft.map((h) => {
      const base = hunters.find(x => x.name === h.name) || {};

      return el('tr', {},
        el('td', {}, el('div', { class: 'hg-hunter-cell' }, avatarImg(base, 'hg-avatar', ''), el('div', {}, el('strong', {}, h.name), el('div', { class: 'hg-muted', style: 'font-size:11px' }, `${base.element || '-'} • ${base.rarity || '-'}`)))),
        el('td', {}, select('role', h, ROLE_OPTIONS)),
        el('td', {}, select('className', h, CLASS_OPTIONS)),
        el('td', {}, select('limited', h, LIMITED_OPTIONS))
      );
    });
    const fieldCards = adminDraft.map((h) => {
      const base = hunters.find(x => x.name === h.name) || {};
      const field = (label, control) => el('label', { class: 'hg-mobile-form-field' }, el('span', {}, label), control);
      return el('article', { class: 'hg-mobile-card hg-admin-field-card' },
        el('div', { class: 'hg-mobile-card-head' },
          avatarImg(base, 'hg-avatar', ''),
          el('div', {}, el('strong', { class: 'hg-mobile-card-title' }, h.name), el('div', { class: 'hg-muted', style: 'font-size:11px' }, `${base.element || '-'} • ${base.rarity || '-'}`))
        ),
        field('Role', select('role', h, ROLE_OPTIONS)),
        field('Class', select('className', h, CLASS_OPTIONS)),
        field('Limited', select('limited', h, LIMITED_OPTIONS))
      );
    });

    const saveBtn = el('button', { class: 'hg-btn primary', onclick: async () => {
      try {
        const payload = adminDraft.map(h => ({
          name: h.name,
          role: h.role || 'Unknown',
          className: h.className || 'Unknown',
          limited: h.limited || 'Standard'
        }));
        const res = await request(API.adminSave, {
          method: 'POST',
          body: JSON.stringify({ hunters: payload })
        });
        hunters = Array.isArray(res.hunters) ? res.hunters : hunters;
        adminDraft = null;
        info.textContent = `Saved. Hunters visible in Guess: ${res.count}. Metadata rows: ${res.metaCount || 0}.`;
        toast('Hunter Guess metadata saved');
        render();
      } catch (e) {
        info.textContent = e.message || 'Save failed';
      }
    } }, 'Save Guess Fields');

    const importDetails = el('details', { style: 'margin-top:16px' },
      el('summary', { class: 'hg-muted', style: 'cursor:pointer;font-weight:900' }, 'Legacy JSON import'),
      (() => {
        const ta = el('textarea', { style: 'margin-top:10px' }, JSON.stringify({ hunters: adminDraft }, null, 2));
        const importInfo = el('div', { class: 'hg-muted', style: 'margin-top:8px' }, 'This only imports guess fields by hunter name. It does not replace the main Hunters catalog. Legacy className/type fields are converted automatically.');
        const btn = el('button', { class: 'hg-btn', style: 'margin-top:10px', onclick: async () => {
          try {
            const parsed = JSON.parse(ta.value);
            const body = Array.isArray(parsed) ? { hunters: parsed } : parsed;
            const res = await request(API.adminImport, { method: 'POST', body: JSON.stringify(body) });
            hunters = Array.isArray(res.hunters) ? res.hunters : hunters;
            adminDraft = null;
            importInfo.textContent = `Imported. Visible hunters: ${res.count}, added: ${res.added}, updated: ${res.updated}`;
            toast('Hunter Guess JSON imported');
            render();
          } catch (e) { importInfo.textContent = e.message || 'Import failed'; }
        } }, 'Import JSON');
        return el('div', {}, ta, btn, importInfo);
      })()
    );

    const adminTabBtn = (key, label) => el('button', {
      class: `hg-btn hg-tab ${adminTab === key ? 'active' : ''}`,
      onclick: () => { adminTab = key; try { localStorage.setItem('hunter_guess_admin_tab', key); } catch (_) {} render(); }
    }, label);

    const fieldsSection = el('div', { class: 'hg-admin-section' },
      el('h3', { class: 'hg-admin-section-title' }, 'Admin: Hunter Guess Fields'),
      el('p', { class: 'hg-muted' }, 'Hunter Guess uses the same Hunters catalog as My List. Edit only Role, Class and Limited here. Avatar, Element and Rarity are taken from the main hunter record. Guild is taken from Hunter Details.'),
      el('div', { class: 'hg-admin-table-wrap hg-desktop-only' },
        el('table', { class: 'hg-admin-table' },
          el('thead', {}, el('tr', {},
            el('th', {}, 'Hunter'),
            el('th', {}, 'Role'),
            el('th', {}, 'Class'),
            el('th', {}, 'Limited')
          )),
          el('tbody', {}, rows)
        )
      ),
      el('div', { class: 'hg-mobile-only hg-mobile-card-list' }, fieldCards),
      el('div', { style: 'margin-top:12px;display:flex;gap:10px;flex-wrap:wrap' }, saveBtn),
      info
    );

    const answerSection = el('div', { class: 'hg-admin-section' },
      el('h3', { class: 'hg-admin-section-title' }, 'Today\'s Answer'),
      dailyAnswerCard
    );

    const importSection = el('div', { class: 'hg-admin-section' },
      el('h3', { class: 'hg-admin-section-title' }, 'Legacy JSON Import'),
      importDetails
    );

    return el('div', { class: 'hg-card hg-admin-area' },
      el('h3', { style: 'margin:0 0 12px;font-size:20px;color:#facc15;font-weight:1000' }, 'Admin: Hunter Guess'),
      el('div', { class: 'hg-admin-tabs' },
        adminTabBtn('answer', 'Answer'),
        adminTabBtn('rewards', 'Rewards'),
        adminTabBtn('fields', 'Fields')
      ),
      adminTab === 'rewards' ? renderRewardEditor() : adminTab === 'fields' ? fieldsSection : answerSection
    );
  }

  function renderModeControls() {
    if (!state?.finished || playMode === 'daily') return null;

    const dailyBtn = el('button', {
      class: `hg-btn hg-tab ${playMode === 'daily' ? 'active' : ''}`,
      onclick: () => backToDaily()
    }, 'Daily Result');

    const nextBtn = playMode === 'practice' && practiceState?.finished
      ? el('button', { class: 'hg-btn primary', onclick: () => startPractice(true) }, 'Next Practice Hunter')
      : null;

    return el('div', { class: 'hg-card' },
      el('div', { style: 'display:flex;gap:10px;flex-wrap:wrap;align-items:center;justify-content:space-between' },
        el('div', { class: 'hg-muted' }, 'Practice mode: guesses are not counted in leaderboard and do not give tickets.'),
        el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' }, dailyBtn, nextBtn)
      )
    );
  }

  function renderPlay() {
    return el('div', {}, renderHowTo(), renderModeControls(), el('div', { class: 'hg-card' }, renderDots()), renderSearch(), renderBanner(), renderAttemptsTable());
  }

  function tabHref(nextTab) {
    try {
      const u = new URL(location.href);
      if (nextTab === 'play') u.searchParams.delete('tab');
      else u.searchParams.set('tab', nextTab);
      return `${u.pathname}${u.search}${u.hash}`;
    } catch (_) {
      return nextTab === 'play' ? apiPath('/hunter-guess') : `${apiPath('/hunter-guess')}?tab=${encodeURIComponent(nextTab)}`;
    }
  }

  function tabLink(nextTab, label) {
    return el('a', {
      class: `hg-btn hg-tab ${tab === nextTab ? 'active' : ''}`,
      href: tabHref(nextTab),
      onclick: (ev) => {
        if (ev.button !== 0 || ev.ctrlKey || ev.metaKey || ev.shiftKey || ev.altKey) return;
        ev.preventDefault();
        rememberTab(nextTab, true);
        render();
      }
    }, label);
  }

  function render() {
    injectCss();
    const root = document.getElementById('content') || document.body;
    root.innerHTML = '';
    const page = el('div', { class: 'hg-page' });
    const date = state?.date || new Date().toISOString().slice(0, 10);
    const adminVisible = isAdminTabVisible();
    if (tab === 'admin' && !adminVisible) rememberTab('play', true);
    page.append(
      el('div', { class: 'hg-header' },
        el('div', {}, el('h1', { class: 'hg-title' }, 'Hunter Guess'), el('div', { class: 'hg-sub' }, 'Identify today\'s secret hunter — ', el('span', { class: 'hg-date' }, date)))
      ),
      el('nav', { class: `hg-actions hg-main-nav ${adminVisible ? 'has-admin' : ''}`, 'aria-label': 'Hunter Guess sections' },
        tabLink('play', 'Play Today'),
        tabLink('leaderboard', 'Leaderboard'),
        tabLink('hunterList', 'Hunter List'),
        adminVisible ? tabLink('admin', 'Admin') : null
      ),
      tab === 'leaderboard' ? renderLeaderboard() : tab === 'hunterList' ? renderHunterList() : tab === 'admin' ? renderAdmin() : renderPlay()
    );
    root.append(page);
  }

  async function mount() {
    injectCss();
    const root = document.getElementById('content') || document.body;
    root.innerHTML = '<div class="hg-page"><div class="hg-card hg-center hg-muted">Loading Hunter Guess…</div></div>';
    try {
      await loadAll();
      rememberTab(initialTab(), false);
      render();
    } catch (e) {
      root.innerHTML = `<div class="hg-page"><div class="hg-card hg-error">${esc(e.message || 'Failed to load Hunter Guess')}</div></div>`;
    }
  }

  window.addEventListener('sla:admin-hide-changed', () => {
    if (!document.querySelector('.hg-page')) return;
    if (adminButtonsHidden() && tab === 'admin') rememberTab('play', true);
    render();
  });

  window.__hunter_guess_mount = mount;
})();
