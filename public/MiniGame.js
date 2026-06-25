'use strict';

(function () {
  const API = {
    state: '/api/mini-game/state',
    summon: '/api/mini-game/summon',
    rateUp: '/api/mini-game/rate-up',
    shopBuy: '/api/mini-game/shop/buy',
    startGate: '/api/mini-game/start-gate',
    claimGate: '/api/mini-game/claim-gate',
    trainingStart: '/api/mini-game/training/start',
    trainingFinish: '/api/mini-game/training/finish',
    presetSave: '/api/mini-game/preset/save',
    presetLoad: '/api/mini-game/preset/load',
    bossAttack: '/api/mini-game/world-boss/attack',
    bossClaim: '/api/mini-game/world-boss/claim',
    adminConfig: '/api/mini-game/admin/config',
    bossImages: '/api/mini-game/admin/boss-images',
    weaponUpgrade: '/api/mini-game/sung-weapon/upgrade'
  };

  const TABS = [
    ['overview', 'Overview'],
    ['summon', 'Summon'],
    ['shop', 'Shop'],
    ['gates', 'Gates'],
    ['training', 'Training'],
    ['boss', 'World Boss'],
    ['collection', 'Collection'],
    ['presets', 'Presets'],
    ['admin', 'Admin']
  ];
  const GATES = ['F', 'E', 'D', 'C', 'B', 'A', 'S'];
  const GATE_KINDS = ['blue', 'purple', 'red'];
  const ACTIVE_TAB_KEY = 'slaMiniGame.activeTab';
  const HIDE_ADMIN_BUTTONS_KEY = 'sla_hide_admin_buttons';

  let state = null;
  let activeTab = 'overview';
  let summonTab = 'custom';
  let collectionTab = 'hunters';
  let gateMode = 'sung';
  let gateKind = 'blue';
  let timer = null;
  let busy = false;
  let multi = { custom: 1, weapon: 1 };
  let bossTeam = { hunters: [], weapons: [], presetSlot: 1 };
  let lastDraw = { banner: 'custom', count: 1, currency: 'ticket' };
  let presetDrafts = {};
  let presetMode = 'sung';
  let presetSlot = 1;
  let miniAdminTab = 'start';
  let miniAdminGateKind = 'blue';
  let miniAdminGateRank = 'F';
  let presetEditorSection = 'weapons';
  let miniRewardBossIndex = 0;
  let bossImages = [];
  let collectionFilters = { elements: [], rarities: [], roles: [], q: '' };
  let pickerFilters = { elements: [], rarities: [], roles: [], q: '' };
  let adminEditBossRows = new Set();
  let adminEditItemRows = new Set();
  let adminDraftConfig = null;
  let adminPowerHunterId = '';
  let adminPowerWeaponId = '';
  let adminWeaponRequirementLevel = 2;
  let mobileMenuOpen = false;
  let mobileAdminOpen = false;
  let lastAttackExpanded = false;
  let trainingPickerFilters = { elements: [], rarities: [], roles: [], q: '' };

  function adminButtonsHidden() {
    try { return localStorage.getItem(HIDE_ADMIN_BUTTONS_KEY) === '1'; } catch (_) { return false; }
  }

  function adminTabVisible() {
    return !!state?.meta?.isAdmin && !adminButtonsHidden();
  }

  function canUseTab(key) {
    if (!TABS.some(([k]) => k === key)) return false;
    if (key === 'admin' && !adminTabVisible()) return false;
    return true;
  }
  function loadActiveTab() {
    try {
      const requested = new URL(location.href).searchParams.get('miniTab');
      if (requested && canUseTab(requested)) { activeTab = requested; return; }
      const saved = localStorage.getItem(ACTIVE_TAB_KEY);
      if (saved && canUseTab(saved)) activeTab = saved;
      else if (!canUseTab(activeTab)) activeTab = 'overview';
    } catch (_) {
      if (!canUseTab(activeTab)) activeTab = 'overview';
    }
  }
  function saveActiveTab(key) {
    activeTab = key;
    try { localStorage.setItem(ACTIVE_TAB_KEY, key); } catch (_) {}
    try { history.replaceState(history.state, '', tabUrl(key)); } catch (_) {}
  }
  function tabUrl(key) {
    const next = new URL(location.href);
    next.searchParams.set('miniTab', key);
    return `${next.pathname}${next.search}${next.hash}`;
  }

  function pathClean() {
    const raw = String(location.pathname || '/');
    const base = String(window.__BASE_PATH__ || window.BASE_PATH || window.__SLA_BASE__ || '').replace(/\/+$/, '');
    if (base && raw === base) return '/';
    if (base && raw.startsWith(base + '/')) return raw.slice(base.length) || '/';
    if (raw === '/slahub') return '/';
    if (raw.startsWith('/slahub/')) return raw.slice('/slahub'.length) || '/';
    return raw || '/';
  }
  function isMiniRoute() {
    const p = pathClean().replace(/\/+$/, '') || '/';
    return p === '/mini-game' || p.startsWith('/mini-game/');
  }
  function stopTimer() {
    if (timer) clearInterval(timer);
    timer = null;
  }
  function apiPath(path) {
    if (typeof window.apiPath === 'function') return window.apiPath(path);
    if (typeof window.url === 'function') return window.url(path);
    const base = String(window.__BASE_PATH__ || window.BASE_PATH || window.__SLA_BASE__ || '').replace(/\/+$/, '');
    const tail = String(path || '').startsWith('/') ? path : `/${path}`;
    return base ? base + tail : tail;
  }
  function asset(raw, kind) {
    let s = String(raw || '').trim().replace(/\\/g, '/');
    if (!s || /^https?:\/\//i.test(s) || s.startsWith('data:')) return s;
    if (s.startsWith('/picture/')) return typeof window.url === 'function' ? window.url(s) : s;
    const file = s.split('/').pop() || s;
    if (kind === 'hunter') s = `/picture/Hunter_Icon/${file}`;
    else if (kind === 'sungWeapon' || kind === 'weapon') s = `/picture/SGWeapon/${file}`;
    else if (!s.startsWith('/')) s = `/${s}`;
    return typeof window.url === 'function' ? window.url(s) : s;
  }
  function bossAsset(raw) {
    const s = String(raw || '').trim().replace(/\\/g, '/');
    if (!s || /^https?:\/\//i.test(s) || s.startsWith('/picture/')) return asset(s);
    return asset(`/picture/MiniGame/Boss/${s.split('/').pop() || s}`);
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
  const fmt = n => Number(n || 0).toLocaleString();
  const expNeed = h => Math.max(1000, Number(h?.level || 1) * 1000);
  function addExpPreview(h, amount) {
    let level = Math.max(1, Number(h?.level || 1));
    let exp = Math.max(0, Number(h?.exp || 0)) + Math.max(0, Number(amount || 0));
    while (exp >= level * 1000) {
      exp -= level * 1000;
      level += 1;
    }
    return { level, exp, need: level * 1000 };
  }
  function durationLabel(minutes) {
    const total = Math.max(0, Math.round(Number(minutes || 0) * 60));
    if (total < 60) return `${total}s`;
    if (total % 3600 === 0) return `${total / 3600}h`;
    if (total % 60 === 0) return `${total / 60}m`;
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}m ${String(s).padStart(2, '0')}s`;
  }
  function timeLeft(iso) {
    const ms = Date.parse(iso || '') - Date.now();
    if (!Number.isFinite(ms) || ms <= 0) return 'Ready';
    const s = Math.ceil(ms / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m ${String(sec).padStart(2, '0')}s`;
  }
  function resetLeft() {
    const now = new Date();
    const next = new Date(now);
    next.setUTCHours(24, 0, 0, 0);
    return timeLeft(next.toISOString());
  }
  function countdown(iso) {
    return el('span', { 'data-countdown': iso }, timeLeft(iso));
  }
  function gateDef(kind = gateKind, rank = 'E') {
    return state.gateDefs?.[kind]?.[rank] || state.gateDefs?.blue?.[rank] || state.gateDefs?.[rank] || {};
  }
  function toast(msg) {
    if (typeof window.showToast === 'function') return window.showToast(msg);
    console.log('[MiniGame]', msg);
  }
  async function refresh() {
    const out = await request(API.state);
    state = out.state;
    loadActiveTab();
    render();
  }
  async function action(path, payload) {
    const out = await request(path, { method: 'POST', body: JSON.stringify(payload || {}) });
    if (out.state) state = out.state;
    return out;
  }
  function card(title, ...body) {
    return el('section', { class: 'mg-card' }, el('h2', {}, title), ...body);
  }
  function cardHead(title, ...actions) {
    return el('div', { class: 'mg-sectionHead' }, el('h2', {}, title), actions.length ? el('div', { class: 'mg-actions' }, ...actions) : null);
  }
  function stat(label, value, cls = '') {
    return el('div', { class: `mg-stat ${cls}` }, el('span', {}, label), el('strong', {}, value));
  }
  function currencyIcon(name) {
    const map = {
      Gold: 'Gold.svg',
      Essence: 'Essence.svg',
      EXP: 'EXP.svg',
      'Draw Tickets': 'Draw_Tickets.svg',
      'Draw Ticket': 'Draw_Tickets.svg',
      'Custom Draw Ticket': 'Draw_Tickets.svg',
      'Weapon Ticket': 'Weapon_Tickets.svg',
      'Weapon Tickets': 'Weapon_Tickets.svg'
    };
    if (!map[name]) return null;
    const png = map[name].replace(/\.svg$/i, '.png');
    return el('img', { class: 'mg-currencyIcon', src: asset(`/picture/MiniGame/Currency/${png}`), alt: name, loading: 'lazy', decoding: 'async', onerror: ev => { ev.currentTarget.onerror = null; ev.currentTarget.src = asset(`/picture/MiniGame/Currency/${map[name]}`); } });
  }
  function moneyLine(label, value, currency = 'Essence') {
    const numeric = typeof value === 'number' || /^\d+(\.\d+)?$/.test(String(value || ''));
    const shown = numeric ? fmt(value) : String(value ?? '');
    return el('div', { class: `mg-moneyLine ${numeric && Number(value) < 0 ? 'negative' : ''}` }, el('span', {}, label), el('strong', {}, currencyIcon(currency), shown));
  }
  function statCurrency(label, value) {
    return el('div', { class: 'mg-stat' }, el('span', {}, currencyIcon(label), label), el('strong', {}, value));
  }
  function rewardCard(label, value, currency = label) {
    return el('div', { class: 'mg-rewardCard' },
      el('div', { class: 'mg-rewardLabel' }, currencyIcon(currency), el('span', {}, label)),
      el('strong', {}, value)
    );
  }
  function chanceRewardCard(row = {}) {
    return el('div', { class: 'mg-rewardCard mg-chanceRewardCard' },
      el('div', { class: 'mg-rewardLabel' }, currencyIcon(row.type || ''), el('span', {}, row.type || 'Reward')),
      el('strong', {}, fmt(row.amount || 0)),
      el('small', {}, `Chance: ${fmt(row.chance ?? 100)}%`)
    );
  }
  function currencyPill(label, value) {
    return el('div', { class: 'mg-stat mg-compactStat' }, el('strong', {}, currencyIcon(label), value));
  }
  function tpPill(value) {
    return el('div', { class: 'mg-stat mg-compactStat' }, el('strong', {}, 'TP ', value));
  }
  function buttonFilters(filters, onChange, opts = {}) {
    filters.rarities = Array.isArray(filters.rarities) ? filters.rarities : (filters.rarity && filters.rarity !== 'all' ? [filters.rarity] : []);
    filters.elements = Array.isArray(filters.elements) ? filters.elements : (filters.element && filters.element !== 'all' ? [String(filters.element).toLowerCase()] : []);
    filters.roles = Array.isArray(filters.roles) ? filters.roles : (filters.role && filters.role !== 'all' ? [filters.role] : []);
    const toggle = (key, value) => {
      const values = filters[key];
      filters[key] = values.includes(value) ? values.filter(entry => entry !== value) : [...values, value];
      onChange();
    };
    const filterButton = (key, value, label, child, extra = '') => el('button', {
      type: 'button', class: `mg-filterIcon ${extra} ${filters[key].includes(value) ? 'is-active' : ''}`, title: label, 'aria-label': label, 'aria-pressed': filters[key].includes(value), onclick: () => toggle(key, value)
    }, child);
    const rarityGroup = el('div', { class: 'mg-filterGroup' }, ...['R', 'SR', 'SSR'].map(value => filterButton('rarities', value, value, el('img', { src: asset(`/picture/Rarity/${value}.png`), alt: value }), 'rarity')));
    const elementGroup = el('div', { class: 'mg-filterGroup' }, ...['Fire', 'Water', 'Wind', 'Light', 'Dark'].map(value => filterButton('elements', value.toLowerCase(), value, elementIcon(value))));
    const roleGroup = opts.roles ? el('div', { class: 'mg-filterGroup' }, ...['Striker', 'Breaker', 'Supporter', 'Elemental Stacker', 'Buster'].map(value => filterButton('roles', value, value, roleIcon(value)))) : null;
    const reset = () => { filters.q = ''; filters.elements = []; filters.rarities = []; filters.roles = []; onChange(); };
    if (typeof filters.expanded !== 'boolean') {
      try { filters.expanded = localStorage.getItem('slaMiniGame.mobileFiltersExpanded') === '1' || !matchMedia('(max-width:760px)').matches; } catch (_) { filters.expanded = true; }
    }
    const toggleExpanded = () => {
      filters.expanded = !filters.expanded;
      try { localStorage.setItem('slaMiniGame.mobileFiltersExpanded', filters.expanded ? '1' : '0'); } catch (_) {}
      onChange();
    };
    return el('div', { class: 'mg-filterToolbar' },
      el('input', { class: 'mg-filterSearch', type: 'search', placeholder: opts.roles ? 'Search hunter...' : 'Search weapon...', value: filters.q || '', oninput: e => {
        const cursor = e.target.selectionStart;
        filters.q = e.target.value || '';
        onChange();
        requestAnimationFrame(() => { const next = document.querySelector('.mg-filterSearch'); if (next) { next.focus(); if (Number.isFinite(cursor)) next.setSelectionRange(cursor, cursor); } });
      } }),
      el('button', { type: 'button', class: 'mg-filterToggle', 'aria-expanded': filters.expanded, onclick: toggleExpanded }, 'Filters', icon(`fa-solid fa-chevron-${filters.expanded ? 'up' : 'down'}`)),
      el('div', { class: `mg-filterExpandable ${filters.expanded ? 'expanded' : ''}` },
        el('div', { class: 'mg-filterGroups' },
          el('div', { class: 'mg-filterSet' }, el('strong', {}, 'Rarity'), rarityGroup),
          el('div', { class: 'mg-filterSet' }, el('strong', {}, 'Element'), elementGroup),
          roleGroup ? el('div', { class: 'mg-filterSet' }, el('strong', {}, 'Class / Role'), roleGroup) : null
        ),
        el('button', { type: 'button', class: 'mg-filterReset', title: 'Reset filters', onclick: reset }, el('span', { class: 'mg-filterResetX' }, '\u00d7'), 'Reset')
      )
    );
  }
  function applyFilters(rows, filters) {
    let out = [...(rows || [])];
    const q = String(filters.q || '').trim().toLowerCase();
    if (q) out = out.filter(x => String(x.name || '').toLowerCase().includes(q));
    const elements = Array.isArray(filters.elements) ? filters.elements : [];
    const rarities = Array.isArray(filters.rarities) ? filters.rarities : [];
    const roles = Array.isArray(filters.roles) ? filters.roles : [];
    if (elements.length) out = out.filter(x => elements.includes(String(x.element || '').toLowerCase()));
    if (rarities.length) out = out.filter(x => rarities.includes(String(x.rarity || '').toUpperCase()));
    if (roles.length) out = out.filter(x => roles.includes(String(x.role || '')));
    return sortOwned(out);
  }
  function statExp(label, value, pct) {
    return el('div', { class: 'mg-stat' }, el('span', {}, label), el('strong', {}, value), expBar(pct));
  }
  function statProgress(label, value) {
    return el('div', { class: 'mg-stat' },
      el('span', {}, label),
      el('strong', {}, value),
      el('div', { class: 'mg-expSpacer' })
    );
  }
  function expBar(pct, cls = '') {
    return el('div', { class: `mg-expBar ${cls}` }, el('span', { style: `width:${Math.max(0, Math.min(100, pct || 0))}%` }), cls === 'boss' ? el('b', {}, `${Math.round(Math.max(0, Math.min(100, pct || 0)))}%`) : null);
  }
  function icon(cls) { return el('i', { class: cls, 'aria-hidden': 'true' }); }
  function withIcon(cls, text) { return [icon(cls), ' ', text]; }
  function rarityRank(r) { return ({ SSR: 3, SR: 2, R: 1 })[String(r || '').toUpperCase()] || 0; }
  function sortOwned(arr) { return [...(arr || [])].sort((a, b) => rarityRank(b.rarity) - rarityRank(a.rarity) || Number(b.power || 0) - Number(a.power || 0)); }
  function catalogOrder(item) {
    const order = item?.kind === 'hunter' ? state.meta?.hunterOrder : state.meta?.sungWeaponOrder;
    const idx = Array.isArray(order) ? order.findIndex(name => String(name || '').trim() === String(item?.name || '').trim()) : -1;
    return idx >= 0 ? idx : 99999;
  }
  function sortCatalogExact(arr) { return [...(arr || [])].sort((a, b) => catalogOrder(a) - catalogOrder(b)); }
  function btn(label, fn, cls = '') {
    return el('button', {
      class: `mg-btn ${cls}`,
      disabled: busy,
      onclick: async () => {
        if (busy) return;
        busy = true; render();
        try { await fn(); } catch (e) { toast(e.message || 'Action failed'); }
        busy = false; render();
      }
    }, label);
  }
  function rarityCls(r) { return `mg-item mg-${String(r || 'R').toLowerCase()}`; }
  function iconItem(src, alt) {
    return el('img', { class: 'mg-icon', src: asset(src), alt: alt || '', loading: 'lazy', decoding: 'async' });
  }
  function elementIcon(element) {
    const key = String(element || 'None').toLowerCase();
    const map = { fire: 'Fires.png', water: 'Waters.png', wind: 'Winds.png', light: 'Lights.png', dark: 'Darkness.png', none: 'NONE.png' };
    return iconItem(`/picture/Element/${map[key] || map.none}`, element || 'None');
  }
  function weaknessList(value) {
    const allowed = ['Fire', 'Water', 'Wind', 'Light', 'Dark'];
    const source = Array.isArray(value) ? value : String(value || '').split(',');
    const clean = Array.from(new Set(source.map(x => String(x || '').trim().replace(/^./, c => c.toUpperCase())).filter(x => allowed.includes(x))));
    return clean.length ? clean : ['Light'];
  }
  function weaknessIcons(value) {
    return el('span', { class: 'mg-weaknessList' }, ...weaknessList(value).map(name => el('span', { class: 'mg-fieldInline' }, elementIcon(name), name)));
  }
  function roleIcon(role) {
    const key = String(role || '').toLowerCase();
    const map = { striker: 'Striker.png', breaker: 'Breaker.png', supporter: 'Supporter.png', buster: 'Buster.png', 'elemental stacker': 'Stacker.png', stacker: 'Stacker.png' };
    return map[key] ? iconItem(`/picture/Type/${map[key]}`, role) : null;
  }
  function itemImg(item, cls = 'mg-thumb') {
    const kind = (item?.kind === 'sungWeapon' || item?.ownerType === 'sung') ? 'sungWeapon' : 'hunter';
    const src = asset(item?.image_build || item?.image || '', kind);
    return src ? el('img', { class: cls, src, alt: item?.name || '', loading: 'lazy', decoding: 'async', onerror: ev => retryImageCase(ev.currentTarget, kind) }) : el('div', { class: `${cls} empty` }, '?');
  }
  function retryImageCase(img, kind) {
    const n = Number(img.dataset.try || 0);
    const src = String(img.getAttribute('src') || '').split('?')[0];
    const file = decodeURIComponent(src.split('/').pop() || '');
    const ext = (file.match(/\.[a-z0-9]+$/i) || ['.png'])[0].toLowerCase();
    const base = file.replace(/\.[a-z0-9]+$/i, '');
    const title = base.toLowerCase().replace(/(^|[_\-\s])([a-z])/g, (_, p, c) => p + c.toUpperCase());
    const tries = [base.toLowerCase() + ext, title + ext, base.toUpperCase() + ext];
    if (n >= tries.length) return;
    img.dataset.try = String(n + 1);
    img.src = asset((kind === 'hunter' ? '/picture/Hunter_Icon/' : '/picture/SGWeapon/') + tries[n]);
  }
  function advText(a) {
    const n = Math.max(0, Math.min(10, Number(a || 0)));
    if (n <= 5) return '\u2726'.repeat(n) + '\u2727'.repeat(5 - n);
    return `${'\u2726'.repeat(5)} ${n - 5}`;
  }
  function itemCard(item, small = false, showA = false) {
    return el('div', { class: `${rarityCls(item.rarity)} ${small ? 'small' : ''}` },
      itemImg(item),
      el('div', { class: 'mg-itemBody' },
        el('strong', {}, item.name),
        el('div', { class: 'mg-icons' }, elementIcon(item.element), item.kind === 'hunter' ? roleIcon(item.role) : null),
        item.level ? el('small', {}, `Lv. ${item.level}`) : null,
        item.level && typeof item.exp !== 'undefined' ? el('small', item._expAttrs || {}, `EXP ${fmt(item.exp)}/${fmt(expNeed(item))}`) : null,
        typeof item.power !== 'undefined' ? el('small', {}, `Power ${fmt(item.power)}`) : null,
        typeof item.advancement !== 'undefined' ? el('small', {}, `${showA ? `A${item.advancement} ` : ''}${advText(item.advancement)}`) : null
      )
    );
  }
  function openModal(title, body, footer = null, wide = false) {
    closeModal();
    const modal = el('div', { class: 'mg-modal', onclick: e => { if (e.target === modal) closeModal(); } },
      el('div', { class: `mg-modalCard ${wide ? 'wide' : ''}` },
        el('div', { class: 'mg-modalHead' }, el('h2', {}, title), el('button', { class: 'mg-x', type: 'button', title: 'Close', 'aria-label': 'Close', onclick: closeModal }, icon('fa-solid fa-xmark'))),
        body,
        footer || el('div', { class: 'mg-actions' }, el('button', { class: 'mg-btn', onclick: closeModal }, 'Close'))
      )
    );
    document.body.append(modal);
  }
  function closeModal() { document.querySelector('.mg-modal')?.remove(); }
  function noModalFooter() { return el('div', { style: 'display:none' }); }
  function catalogAll() { return [...(state.catalog?.custom || []), ...(state.catalog?.sungWeapons || []), ...(state.catalog?.customRateUp || []), ...(state.catalog?.weaponRateUp || [])]; }
  function findCatalog(id) { return catalogAll().find(x => x.id === id); }
  function ownedVersion(item) {
    if (!item) return item;

    const ownedPool = item.kind === 'hunter'
      ? (state.computed?.hunters || [])
      : (state.computed?.weapons || []);

    const owned = ownedPool.find(x => x.id === item.id || x.name === item.name);

    return {
      ...item,
      advancement: owned?.advancement ?? 0,
      owned: !!owned
    };
  }

  function advancementBadge(item) {
    const adv = Number(item?.advancement || 0);
    return el('b', { class: 'mg-advBadge small' }, `A${adv}`);
  }

  function tabs() {
    const list = TABS.filter(([k]) => k !== 'admin' || adminTabVisible());
    const tabLink = ([k, label], mobile = false) => el('a', { href: tabUrl(k), class: `mg-tab ${mobile ? 'mg-mobileNavItem' : ''} ${activeTab === k ? 'active' : ''}`, onclick: e => {
      if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      saveActiveTab(k);
      mobileMenuOpen = false;
      render();
      if (matchMedia('(max-width:640px)').matches) requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'auto' }));
    } }, label);
    return el('div', { class: 'mg-navigation' },
      el('div', { class: `mg-tabs mg-desktopTabs ${adminTabVisible() ? 'has-admin' : ''}` }, list.map(item => tabLink(item))),
      el('div', { class: 'mg-mobileNav' },
        el('button', { class: 'mg-mobileMenuButton', 'aria-expanded': mobileMenuOpen, onclick: () => { const opening = !mobileMenuOpen; mobileMenuOpen = opening; render(); if (opening) requestAnimationFrame(() => { const sheet = document.querySelector('.mg-mobileNavSheet'); const current = sheet?.querySelector('.mg-mobileNavItem.active'); if (sheet && current) sheet.scrollTop = Math.max(0, current.offsetTop - (sheet.clientHeight - current.offsetHeight) / 2); }); } }, icon('fa-solid fa-bars'), 'Menu', el('span', {}, TABS.find(([k]) => k === activeTab)?.[1] || 'Overview'), icon(`fa-solid fa-chevron-${mobileMenuOpen ? 'up' : 'down'}`)),
        mobileMenuOpen ? el('div', { class: 'mg-mobileNavSheet' }, list.map(item => tabLink(item, true))) : null
      )
    );
  }
  function overview() {
    const c = state.computed || {};
    const activeTraining = (state.training || []).filter(t => !t.claimed).length;
    const need = state.meta?.expNeeded || 1000;
    const pct = Math.max(0, Math.min(100, (state.exp / need) * 100));
    const group = (title, nodes) => el('div', { class: 'mg-overGroup' }, el('h3', {}, title), el('div', { class: 'mg-grid stats mini' }, nodes));
    return el('section', { class: 'mg-card' },
      cardHead('Overview', el('button', { class: 'mg-btn ghost', onclick: activityLog }, 'Activity Log')),
      group('Power', [stat('Total Power', fmt(c.teamPower)), stat('Sung Total Power', fmt(c.sungTotalPower || 0)), stat('Top 3 Hunters Power', fmt(c.topHuntersPower))]),
      group('Sung Jinwoo Progress', [statProgress('Sung Power', fmt(c.sungPower)), statProgress('Level', `Lv. ${state.level} / ${state.meta?.maxLevel || 130}`), statExp('EXP', `${fmt(state.exp)} / ${fmt(need)}`, pct)]),
      group('Currency', [statCurrency('Gold', fmt(state.gold)), statCurrency('Essence', fmt(state.essence))]),
      group('Tickets', [statCurrency('Draw Tickets', fmt(state.customTickets)), statCurrency('Weapon Tickets', fmt(state.weaponTickets))]),
      group('Activity', [stat('Gates', fmt(state.meta?.activeGates || 0)), stat('Training', `${activeTraining}/${state.shop?.trainingSlots || 1}`)])
    );
  }
  function activityLog() {
    openModal('Activity Log', el('div', { class: 'mg-list' }, (state.logs || []).length ? state.logs.map(x => el('div', { class: 'mg-row' }, x)) : el('div', { class: 'mg-muted' }, 'No activity yet')), noModalFooter());
  }
  function summon() {
    return el('section', { class: 'mg-card' },
      cardHead('Summon',
        el('button', { class: 'mg-btn ghost', onclick: () => summonHistory(summonTab, 0) }, 'Summon History'),
        el('button', { class: 'mg-btn ghost', onclick: summonRewards }, withIcon('fa-solid fa-gift', 'Rewards'))
      ),
      el('div', { class: 'mg-subtabs' },
        el('button', { class: `mg-tab ${summonTab === 'custom' ? 'active' : ''}`, onclick: () => { summonTab = 'custom'; render(); } }, 'Custom Draw'),
        el('button', { class: `mg-tab ${summonTab === 'weapon' ? 'active' : ''}`, onclick: () => { summonTab = 'weapon'; render(); } }, 'Weapon Custom Draw')
      ),
      summonBanner(summonTab)
    );
  }
  function summonResultCard(result) {
    const item = result.item || result;
    const adv = result.advancement ?? item.advancement ?? 0;
    return el('div', { class: `${rarityCls(item.rarity || result.rarity)} mg-resultCard ${String(item.rarity || result.rarity).toUpperCase() === 'SSR' ? 'bigSsr' : ''}` },
      el('b', { class: 'mg-advBadge' }, `A${adv}`),
      el('div', { class: 'mg-resultImageWrap' },
        itemImg(item, 'mg-resultThumb'),
        el('div', { class: 'mg-resultIcons' }, elementIcon(item.element), item.kind === 'hunter' ? roleIcon(item.role) : null)
      ),
      el('strong', {}, item.name || result.name || '')
    );
  }
  function summonBackCard(result) {
    const rarity = String(result.rarity || result.item?.rarity || 'R').toUpperCase();
    return el('div', { class: `mg-resultBack mg-${rarity.toLowerCase()} ${rarity === 'SSR' ? 'bigSsr' : ''}` }, rarity);
  }
  function rateSlot(banner, i, max) {
    const item = ownedVersion(findCatalog((state.rateUp?.[banner] || [])[i]));
  
    return el('button', {
      class: `mg-rateSlot ${item ? 'filled' : ''}`,
      onclick: () => rateUpModal(banner, max)
    },
      item ? [
        el('div', { class: 'mg-rateImgWrap' },
          itemImg(item),
          advancementBadge(item)
        ),
        el('div', { class: 'mg-rateName' },
          el('strong', {}, item.name),
          el('small', { class: 'mg-advSmall' }, `A${item.advancement || 0}`)
        ),
        el('div', { class: 'mg-icons' },
          elementIcon(item.element),
          item.kind === 'hunter' ? roleIcon(item.role) : null
        )
      ] : [
        el('div', { class: 'mg-plus' }, '+'),
        el('strong', {}, 'Empty')
      ]
    );
  }
  function summonBanner(banner) {
    const custom = banner === 'custom';
    const max = custom ? 3 : 2;
    const summonMax = state.meta?.isAdmin ? 100 : 10;
    if ((multi[banner] || 1) > summonMax) multi[banner] = summonMax;
    const count = multi[banner] * 10;
    const ready = (state.rateUp?.[banner] || []).length === max;
    const draw = async (n, currency = 'ticket') => {
      lastDraw = { banner, count: n, currency };
      const out = await action(API.summon, { banner, currency, count: n });
      render();
      showResults(out);
    };
    return el('div', { class: 'mg-banner' },
      el('div', { class: 'mg-bannerTop' },
        el('div', {}, el('h3', {}, custom ? 'Custom Draw' : 'Weapon Custom Draw'), el('p', { class: 'mg-muted' }, custom ? 'SSR Hunters and SSR Sung Weapons' : 'SSR Sung Weapons only')),
        el('div', { class: 'mg-bannerStats' }, statCurrency(custom ? 'Draw Tickets' : 'Weapon Tickets', fmt(custom ? state.customTickets : state.weaponTickets)), el('div', { class: 'mg-pity' }, el('span', {}, 'Pity'), el('strong', {}, `${state.pity?.[banner] || 0}/70`)))
      ),
      el('div', { class: 'mg-rateTitle' }, 'Rate Up List'),
      el('div', { class: `mg-rateGrid cols${max}` }, Array.from({ length: max }, (_, i) => rateSlot(banner, i, max))),
      ready ? null : el('div', { class: 'mg-warn' }, `Select ${max} Rate Up items before drawing.`),
      el('div', { class: 'mg-actions center' },
        el('button', { class: 'mg-btn primary', disabled: !ready || busy, onclick: () => draw(1).catch(e => toast(e.message)) }, withIcon('fa-solid fa-dice-d20', 'Ticket x1')),
        el('select', { class: 'mg-select', onchange: e => { multi[banner] = Number(e.target.value) || 1; render(); } },
          Array.from({ length: summonMax }, (_, i) => el('option', { value: String(i + 1), selected: multi[banner] === i + 1 }, String(i + 1)))
        ),
        el('button', { class: 'mg-btn primary', disabled: !ready || busy, onclick: () => draw(count).catch(e => toast(e.message)) }, withIcon('fa-solid fa-dice-d20', `Ticket x${count}`))
      )
    );
  }
  function rateUpModal(banner, max) {
    const rawPool = banner === 'custom' ? (state.catalog?.customRateUp || []) : (state.catalog?.weaponRateUp || []);
    const pool = sortCatalogExact(rawPool.filter(x => x.kind === 'hunter')).concat(sortCatalogExact(rawPool.filter(x => x.kind !== 'hunter')));
    let selected = [...(state.rateUp?.[banner] || [])].slice(0, max);
  
    const body = el('div', {},
      el('div', { class: 'mg-selectList' }, pool.map(rawItem => {
        const item = ownedVersion(rawItem);
      
        const renderItem = () => {
          btnNode.className = `mg-selectItem ${selected.includes(item.id) ? 'selected' : ''}`;
        };
      
        const btnNode = el('button', {
          class: `mg-selectItem ${selected.includes(item.id) ? 'selected' : ''}`,
          onclick: () => {
            if (selected.includes(item.id)) selected = selected.filter(id => id !== item.id);
            else if (selected.length < max) selected.push(item.id);
            renderItem();
          }
        },
          el('div', { class: 'mg-rateImgWrap' },
            itemImg(item),
            advancementBadge(item)
          ),
          el('div', { class: 'mg-rateInfo' },
            el('strong', {}, item.name),
            el('small', { class: 'mg-advSmall' }, `A${item.advancement || 0}`)
          ),
          el('div', { class: 'mg-icons' },
            elementIcon(item.element),
            item.kind === 'hunter' ? roleIcon(item.role) : null
          )
        );
      
        return btnNode;
      }))
    );
  
    openModal('Rate Up List', body, el('div', { class: 'mg-actions mg-modalFooter' },
      el('button', { class: 'mg-btn ghost', onclick: closeModal }, 'Cancel'),
      btn('Confirm / Save', async () => {
        await action(API.rateUp, { banner, items: selected });
        closeModal();
      }, 'primary')
    ), true);
  }
  function showResults(out) {
    const results = out.results || (out.result ? [out.result] : []);
    let shown = 0;
    const body = el('div', { class: 'mg-resultWrap' });
    const grid = el('div', { class: 'mg-resultGrid reveal' }, results.map(r => el('div', { class: 'mg-flip' }, summonBackCard(r))));
    const footer = el('div', { class: 'mg-muted centerText' }, 'Revealing...');
    body.replaceChildren(grid, footer);
    const finish = () => footer.replaceChildren(el('div', { class: 'mg-actions center top' },
      el('button', { class: 'mg-btn ghost', onclick: closeModal }, 'Close'),
      el('button', { class: 'mg-btn primary', onclick: async () => { const out = await action(API.summon, { banner: lastDraw.banner, currency: lastDraw.currency, count: lastDraw.count }); render(); showResults(out); } }, 'Draw Again')
    ));
    const revealNext = () => {
      if (shown >= results.length) { finish(); return; }
      const cell = grid.children[shown];
      if (cell) {
        cell.className = 'mg-flip flipped';
        cell.replaceChildren(summonResultCard(results[shown]));
        requestAnimationFrame(() => cell.scrollIntoView({ block: 'end', behavior: 'smooth' }));
      }
      shown += 1;
      if (shown >= results.length) finish();
    };
    openModal('Summon Results', body, el('div', { class: 'mg-modalFooter' }), true);
    const t = setInterval(() => {
      revealNext();
      if (shown >= results.length) clearInterval(t);
    }, 340);
    setTimeout(revealNext, 120);
  }
  function summonHistory(banner = 'custom', page = 0) {
    const rows = (state.summonHistory || []).filter(r => r.banner === banner);
    const pageSize = 10;
    const pages = Math.max(1, Math.ceil(rows.length / pageSize));
    const safePage = Math.max(0, Math.min(page, pages - 1));
    const body = el('div', {},
      el('div', { class: 'mg-subtabs' },
        el('button', { class: `mg-tab ${banner === 'custom' ? 'active' : ''}`, onclick: () => summonHistory('custom', 0) }, 'Custom Draw'),
        el('button', { class: `mg-tab ${banner === 'weapon' ? 'active' : ''}`, onclick: () => summonHistory('weapon', 0) }, 'Weapon Custom Draw')
      ),
      el('div', { class: 'mg-resultGrid history' }, rows.slice(safePage * pageSize, safePage * pageSize + pageSize).map(r => summonResultCard({ ...r, item: { ...r, ...(findCatalog(r.itemId) || {}), rarity: r.rarity, kind: r.kind, name: r.name } }))),
      el('div', { class: 'mg-actions center top' },
        el('button', { class: 'mg-btn ghost', disabled: safePage <= 0, onclick: () => summonHistory(banner, safePage - 1) }, 'Previous'),
        el('span', { class: 'mg-muted' }, `${safePage + 1}/${pages}`),
        el('button', { class: 'mg-btn ghost', disabled: safePage >= pages - 1, onclick: () => summonHistory(banner, safePage + 1) }, 'Next')
      )
    );
    openModal('Summon History', body, noModalFooter(), true);
  }
  function summonRewards() {
    openModal('A10 Duplicate Rewards', el('div', { class: 'mg-list' },
      el('div', { class: 'mg-row' }, el('strong', {}, 'A10+ R'), el('span', {}, '20 Essence')),
      el('div', { class: 'mg-row' }, el('strong', {}, 'A10+ SR'), el('span', {}, '40 Essence')),
      el('div', { class: 'mg-row' }, el('strong', {}, 'A10+ SSR'), el('span', {}, '100 Essence'))
    ), noModalFooter());
  }
  function shop() {
    const cfg = state.config || {};
    const prices = cfg.shopPrices || {};
    const max = cfg.maxShopUpgrades || {};
    const steps = cfg.shopUpgradeSteps || {};
    const cur = state.shop || {};
    const priceOf = (id, value) => id.includes('Ticket') ? prices[id] || 250 : Math.floor((prices[id] || 1) * (Number(value) || 1));
    const expMult = Number(cur.trainingExpMultiplier) || 1;
    const isMaxUpgrade = id => {
      if (id === 'trainingSlots') return Number(cur.trainingSlots || 1) >= Number(max.trainingSlots || 6);
      if (id === 'trainingMaxHours') return Number(cur.trainingMaxHours || 1) >= Number(max.trainingMaxHours || 12);
      if (id === 'trainingExpMultiplier') return Number(expMult) >= Number(max.trainingExpMultiplier || 5);
      if (id === 'presetSlots') return Number(cur.presetSlots || 5) >= Number(max.presetSlots || 10);
      if (id === 'hunterGateSlots') return Number(cur.hunterGateSlots || 1) >= Number(max.hunterGateSlots || 6);
      return false;
    };
    const items = [
      ['customTicket', 'Custom Draw Ticket', 'Buy draw tickets.', '-', '+1', prices.customTicket || 250],
      ['weaponTicket', 'Weapon Custom Draw Ticket', 'Buy weapon draw tickets.', '-', '+1', prices.weaponTicket || 250],
      ['trainingSlots', 'Training Slots', 'More hunters can train at once.', cur.trainingSlots || 1, Math.min(max.trainingSlots || 6, (cur.trainingSlots || 1) + 1), priceOf('trainingSlots', cur.trainingSlots || 1)],
      ['trainingMaxHours', 'Training Max Time', 'Longer training sessions.', `${cur.trainingMaxHours || 1}h`, `${Math.min(max.trainingMaxHours || 12, (cur.trainingMaxHours || 1) + 1)}h`, priceOf('trainingMaxHours', cur.trainingMaxHours || 1)],
      ['trainingExpMultiplier', 'Training EXP Multiplier', 'More EXP from training.', `x${expMult}`, `x${Math.min(max.trainingExpMultiplier || 5, Number((expMult + Number(steps.trainingExpMultiplier || 0.25)).toFixed(4)))}`, priceOf('trainingExpMultiplier', expMult)],
      ['presetSlots', 'Preset Slots', 'More saved teams.', cur.presetSlots || 5, Math.min(max.presetSlots || 10, (cur.presetSlots || 5) + 1), priceOf('presetSlots', cur.presetSlots || 5)],
      ['hunterGateSlots', 'Hunter Gate Slots', 'More active Hunter Gates.', cur.hunterGateSlots || 1, Math.min(max.hunterGateSlots || 6, (cur.hunterGateSlots || 1) + 1), priceOf('hunterGateSlots', cur.hunterGateSlots || 1)]
    ];
    return card('Shop', el('div', { class: 'mg-shopGrid' }, items.map(([id, name, sub, current, next, price]) => {
      const after = Number(state.essence || 0) - Number(price || 0);
      const maxed = isMaxUpgrade(id);
      return el('div', { class: 'mg-shopItem' },
        el('div', {},
          el('h3', {}, name),
          el('p', { class: 'mg-muted' }, sub),
          moneyLine('Current', current, ''),
          maxed ? null : moneyLine('Next', next, ''),
          maxed ? el('div', { class: 'mg-moneyLine' }, el('span', {}, 'Status'), el('strong', {}, 'MAX')) : moneyLine('Price', price)
        ),
        el('button', { class: 'mg-btn', disabled: maxed, onclick: maxed ? null : () => shopModal(id, name, sub, current, next, price) }, maxed ? 'MAX' : 'Buy')
      );
    })));
  }
  function shopModal(id, name, sub, current, next, price) {
    let qty = 1;
    const isTicket = id === 'customTicket' || id === 'weaponTicket';
    const qtyNode = isTicket ? el('input', { class: 'mg-input', type: 'number', min: '1', value: '1' }) : null;
    const maxQty = isTicket ? Math.max(0, Math.floor(Number(state.essence || 0) / Math.max(1, price))) : 1;
    if (isTicket && maxQty <= 0) qty = 0;
    const moneyNode = amount => el('strong', { class: 'mg-money' }, currencyIcon('Essence'), fmt(amount));
    const total = moneyNode(price);
    const after = moneyNode(Number(state.essence || 0) - price);
    const confirmBtn = btn('Confirm Buy', async () => { await action(API.shopBuy, { item: id, quantity: qty }); closeModal(); }, 'primary');
    const updateTotals = () => {
      const cost = price * qty;
      total.replaceChildren(currencyIcon('Essence'), fmt(cost));
      const afterValue = Number(state.essence || 0) - cost;
      after.replaceChildren(currencyIcon('Essence'), fmt(afterValue));
      after.classList.toggle('negative', afterValue < 0);
      confirmBtn.disabled = busy || (isTicket && qty <= 0);
    };
    if (qtyNode) {
      qtyNode.setAttribute('max', String(maxQty));
      qtyNode.value = String(qty);
      qtyNode.addEventListener('input', e => {
        qty = Math.max(0, Math.min(maxQty, Number(e.target.value) || 0));
        e.target.value = String(qty);
        updateTotals();
      });
    }
    openModal('Shop Purchase', el('div', { class: 'mg-list' },
      el('h3', {}, name),
      el('p', { class: 'mg-muted' }, sub),
      moneyLine('Current', current, ''),
      moneyLine('Next', next, ''),
      isTicket ? el('label', { class: 'mg-shopQty' }, 'Quantity', qtyNode) : null,
      isTicket ? el('div', { class: 'mg-actions' },
        el('button', { class: 'mg-miniBtn ghost', onclick: () => { qty = Math.min(maxQty, 1); qtyNode.value = String(qty); updateTotals(); } }, 'x1'),
        el('button', { class: 'mg-miniBtn ghost', onclick: () => { qty = Math.min(maxQty, 10); qtyNode.value = String(qty); updateTotals(); } }, 'x10'),
        el('button', { class: 'mg-miniBtn ghost', onclick: () => { qty = Math.min(maxQty, 100); qtyNode.value = String(qty); updateTotals(); } }, 'x100'),
        el('button', { class: 'mg-miniBtn ghost', onclick: () => { qty = maxQty; qtyNode.value = String(qty); updateTotals(); } }, 'Max')
      ) : null,
      isTicket ? el('div', { class: 'mg-muted' }, `Max: ${fmt(maxQty)}`) : null,
      el('div', { class: 'mg-moneyLine' }, el('span', {}, 'Price'), total),
      el('div', { class: 'mg-moneyLine' }, el('span', {}, 'Your Essence'), moneyNode(state.essence)),
      el('div', { class: 'mg-moneyLine' }, el('span', {}, 'After Purchase'), after)
    ), el('div', { class: 'mg-actions mg-modalFooter' },
      el('button', { class: 'mg-btn ghost', onclick: closeModal }, 'Cancel'),
      confirmBtn
    ));
    updateTotals();
  }
  function gates() {
    const active = (state.gates || []).filter(g => !g.claimed);
    return card('Gates',
      el('div', { class: 'mg-subtabs' },
        el('button', { class: `mg-tab ${gateMode === 'sung' ? 'active' : ''}`, onclick: () => { gateMode = 'sung'; render(); } }, 'Sung Gates'),
        el('button', { class: `mg-tab ${gateMode === 'hunter' ? 'active' : ''}`, onclick: () => { gateMode = 'hunter'; render(); } }, 'Hunter Gates'),
        el('button', { class: `mg-tab ${gateMode === 'active' ? 'active' : ''}`, onclick: () => { gateMode = 'active'; render(); } }, 'Active Gates')
      ),
      gateMode === 'active' ? activeGates(active) : [
      el('div', { class: 'mg-gateKinds' }, GATE_KINDS.map(kind => el('button', { class: `mg-tab gate-${kind} ${gateKind === kind ? 'active' : ''}`, onclick: () => { gateKind = kind; render(); } }, state.gateKinds?.[kind]?.label || kind))),
      el('div', { class: 'mg-list' }, GATES.map(d => {
        const def = gateDef(gateKind, d); const required = gateMode === 'hunter' ? Math.max(300, Math.floor(def.requiredPower * 0.45)) : def.requiredPower;
        return el('div', { class: 'mg-gateCard' },
          el('strong', { class: 'mg-rank' }, d),
          el('span', {}, `Required Power: ${fmt(required)} | Time: ${durationLabel(def.minutes)}`),
          el('div', { class: 'mg-actions' },
            el('button', { class: 'mg-miniBtn ghost', onclick: () => rewardsModal(gateKind, d, gateMode) }, withIcon('fa-solid fa-gift', 'Rewards')),
            el('button', { class: 'mg-miniBtn primary', onclick: () => chooseGatePreset(gateMode, gateKind, d) }, withIcon('fa-solid fa-dungeon', 'Start Gate'))
          )
        );
      }))]
    );
  }
  function activeGates(active) {
    return el('div', { class: 'mg-list' }, active.length ? active.slice().reverse().map(g => {
      const ready = Date.parse(g.finishAt) <= Date.now();
      const typeLabel = String(g.type || '').toLowerCase() === 'sung' ? 'Sung' : 'Hunter';
      return el('div', { class: 'mg-row gateActive' },
        el('div', {},
          el('strong', {}, `${state.gateKinds?.[g.gateKind]?.label || 'Blue Gate'} ${g.difficulty} - ${typeLabel}`),
          el('span', { class: 'mg-muted' }, `Required: ${fmt(g.requiredPower)}`),
          el('span', { class: 'mg-muted' }, 'Status: ', ready ? 'Ready' : countdown(g.finishAt))
        ),
        el('div', { class: 'mg-actions' }, ready ? btn('Claim', async () => rewardModal(await action(API.claimGate, { id: g.id })), 'primary') : el('button', { class: 'mg-btn ghost', disabled: true }, countdown(g.finishAt)))
      );
    }) : el('div', { class: 'mg-muted' }, 'No active gates'));
  }
  function rewardsModal(kind, diff, type = 'sung') {
    const d = gateDef(kind, diff);
    const isHunterGate = String(type).toLowerCase() === 'hunter';
    openModal('Gate Rewards', el('div', { class: 'mg-rewardGrid' },
      rewardCard('Gold', fmt(d.gold), 'Gold'),
      rewardCard('Essence', fmt(d.essence), 'Essence'),
      isHunterGate ? null : rewardCard('Sung EXP', fmt(d.exp), 'EXP'),
      rewardCard('Hunter EXP', fmt(isHunterGate ? d.exp : Math.floor(d.exp / 2)), 'EXP'),
      rewardCard('Draw Ticket', `${Math.round(Math.min(.95, d.ticketChance || 0) * 100)}%`, 'Draw Ticket'),
      rewardCard('Time', durationLabel(d.minutes), '')
    ), noModalFooter());
  }
  function rewardModal(out) {
    const r = out.reward || {};
    const isHunterGate = String(r.type || '').toLowerCase() === 'hunter';
    openModal('Gate Reward', el('div', { class: 'mg-rewardGrid' },
      rewardCard('Gold', fmt(r.gold), 'Gold'),
      isHunterGate ? null : rewardCard('Sung EXP', fmt(r.sungExp), 'EXP'),
      rewardCard('Hunter EXP', fmt(r.hunterExp), 'EXP'),
      rewardCard('Essence', fmt(r.essence), 'Essence'),
      rewardCard('Draw Ticket', fmt(r.customTickets), 'Draw Ticket')
    ));
  }
  function lockedHunterIds(except = '') {
    const ids = new Set();
    if (except !== 'training') (state.training || []).filter(t => !t.claimed).forEach(t => ids.add(t.hunterId));
    if (except !== 'gate') (state.gates || []).filter(g => !g.claimed).flatMap(g => g.hunterIds || []).forEach(id => ids.add(id));
    return ids;
  }
  function lockedWeaponIds() {
    const ids = new Set();
    (state.gates || []).filter(g => !g.claimed).flatMap(g => g.weaponIds || []).forEach(id => ids.add(id));
    return ids;
  }
  function activityLabel(id) {
    if ((state.training || []).some(t => !t.claimed && t.hunterId === id)) return 'Training';
    if ((state.gates || []).some(g => !g.claimed && ((g.hunterIds || []).includes(id) || (g.weaponIds || []).includes(id)))) return 'Gate';
    return '';
  }
  function presetPowerValue(p, presetType = 'sung', availableHunterIds = null, availableWeaponIds = null) {
    const hunterIds = availableHunterIds || (p ? (p.hunters || []) : []);
    const weaponIds = availableWeaponIds || (p ? (p.weapons || []) : []);
    const hs = hunterIds.map(id => (state.computed?.hunters || []).find(h => h.id === id)).filter(Boolean);
    const ws = weaponIds.map(id => (state.computed?.weapons || []).find(w => w.id === id)).filter(Boolean);
    const hunterPower = hs.reduce((s, h) => s + (h.power || 0), 0);
    return presetType === 'hunter' ? hunterPower : ((state.computed?.sungPower || 2000) + ws.reduce((s, w) => s + (w.power || 0), 0)) * 2 + hunterPower;
  }
  function gatePresetItem(id, kind, locked, reason, lowPower, forceLocked = false, forceReason = '') {
    const pool = kind === 'hunter' ? (state.computed?.hunters || []) : (state.computed?.weapons || []);
    const item = id ? pool.find(x => x.id === id) : null;
    if (!item) return el('div', { class: 'mg-gatePresetItem empty' }, el('span', { class: 'mg-plus' }, '+'));
    const lockReason = locked.has(item.id) ? reason(item.id) : '';
    const label = lockReason || (forceLocked ? forceReason : '') || (lowPower ? 'Power too low' : '');
    return el('div', { class: `mg-gatePresetItem mg-${String(item.rarity || 'R').toLowerCase()} ${lockReason || forceLocked ? 'locked' : ''}` },
      itemImg(item),
      el('div', { class: 'mg-gatePresetItemBody' },
        el('strong', {}, item.name),
        el('div', { class: 'mg-icons' }, elementIcon(item.element), kind === 'hunter' ? roleIcon(item.role) : null),
        el('small', {}, `Power ${fmt(item.power || 0)}`),
        typeof item.advancement !== 'undefined' ? el('small', { class: 'mg-gateStars' }, advText(item.advancement)) : null,
        label ? el('small', { class: 'mg-gateLockLabel' }, label) : null
      )
    );
  }
  function gatePresetPreview(preset, presetType, locked, reason, lowPower, forceLocked = false, forceReason = '') {
    const weapons = preset.weapons || [];
    const hunters = preset.hunters || [];
    return el('div', { class: 'mg-presetPreview' },
      presetType === 'sung' ? el('div', { class: 'mg-presetWeapons' }, ...Array.from({ length: 2 }, (_, i) => gatePresetItem(weapons[i], 'weapon', locked, reason, lowPower, forceLocked, forceReason))) : null,
      el('div', { class: 'mg-presetHunters' }, ...Array.from({ length: 3 }, (_, i) => gatePresetItem(hunters[i], 'hunter', locked, reason, lowPower, forceLocked, forceReason)))
    );
  }
  function chooseGatePreset(type, kind, difficulty) {
    const presetType = type === 'hunter' ? 'hunter' : 'sung';
    const presets = (state.presets || []).filter(p => (p.type || 'sung') === presetType);
    const locked = lockedHunterIds();
    const lockedWeapons = lockedWeaponIds();
    const def = gateDef(kind, difficulty);
    const required = type === 'hunter' ? Math.max(300, Math.floor(def.requiredPower * 0.45)) : def.requiredPower;
    const reason = id => (state.training || []).some(t => !t.claimed && t.hunterId === id) ? 'In Training' : (state.gates || []).some(g => !g.claimed && ((g.hunterIds || []).includes(id) || (g.weaponIds || []).includes(id))) ? 'In Gate' : '';
    openModal(type === 'hunter' ? 'Choose Hunter Preset' : 'Choose Sung Preset',
      el('div', { class: 'mg-gatePresetModal' }, el('div', { class: 'mg-gatePresetList' }, presets.length ? presets.map(p => {
        const relevantHunterIds = p.hunters || [];
        const relevantWeaponIds = presetType === 'sung' ? (p.weapons || []) : [];
        const availableHunterIds = relevantHunterIds.filter(id => !locked.has(id));
        const availableWeaponIds = relevantWeaponIds.filter(id => !lockedWeapons.has(id));
        const blockedIds = [...relevantHunterIds.filter(id => locked.has(id)), ...relevantWeaponIds.filter(id => lockedWeapons.has(id))];
        const power = presetPowerValue(p, presetType, availableHunterIds, availableWeaponIds);
        const lowPower = power < required;
        const hasMinimum = presetType === 'hunter' ? availableHunterIds.length >= 1 : availableHunterIds.length >= 1 || availableWeaponIds.length >= 1;
        const blocked = !hasMinimum || lowPower;
        const reasons = Array.from(new Set(blockedIds.map(reason).filter(Boolean)));
        const unavailableStatus = reasons.length === 1 ? `Locked: ${reasons[0]}` : 'No available units';
        const status = !hasMinimum ? unavailableStatus : lowPower ? 'Power too low' : 'Ready';
        return el('button', { class: `mg-gatePresetCard ${blocked ? 'disabledCard' : ''}`, disabled: blocked, onclick: async () => {
        await action(API.startGate, { type, gateKind: kind, difficulty, presetSlot: p.slot });
        closeModal();
        render();
      } },
          el('div', { class: 'mg-gatePresetHead' },
            el('strong', {}, p.name || `Preset ${p.slot}`),
            el('span', {}, `Team Power ${fmt(power)}`),
            el('span', {}, `Required ${fmt(required)}`),
            el('b', { class: blocked ? 'mg-statusBad' : 'mg-statusOk' }, status)
          ),
          lowPower ? el('small', { class: 'mg-usedLine mg-activityTag' }, `Power ${fmt(power)} / Required ${fmt(required)}`) : null,
          gatePresetPreview(p, presetType, new Set([...locked, ...lockedWeapons]), reason, lowPower)
        );
      }) : el('div', { class: 'mg-muted' }, `Create a ${presetType === 'sung' ? 'Sung' : 'Hunter'} Preset first.`))),
      el('div', { style: 'display:none' }),
      true
    );
  }
  function training() {
    const active = (state.training || []).filter(t => !t.claimed);
    const full = active.length >= (state.shop?.trainingSlots || 1);
    return card('Training',
      el('div', { class: 'mg-grid stats' }, stat('Slots', `${active.length}/${state.shop?.trainingSlots || 1}`), stat('Max Time', `${state.shop?.trainingMaxHours || 1}h`), stat('EXP Multiplier', `x${state.shop?.trainingExpMultiplier || 1}`)),
      el('div', { class: 'mg-actions top center' },
        el('button', { class: 'mg-btn primary', disabled: busy || full, onclick: () => full ? null : chooseTrainingHunter() }, 'Start Training')
      ),
      el('div', { class: 'mg-list' }, active.length ? active.map(t => trainingRow(t)) : el('div', { class: 'mg-muted' }, 'No active training'))
    );
  }
  function trainingRow(t) {
    const h = (state.computed?.hunters || []).find(x => x.id === t.hunterId) || {};
    const elapsed = Math.max(0, Date.now() - Date.parse(t.startAt || ''));
    const ratio = Math.max(0, Math.min(1, elapsed / Math.max(1, Number(t.durationMs || 1))));
    const earned = Math.floor(Number(t.expectedExp || 0) * ratio);
    const remaining = Math.max(0, Number(t.expectedExp || 0) - earned);
    const preview = addExpPreview(h, earned);
    const pct = Math.max(0, Math.min(100, (preview.exp / preview.need) * 100));
    const finished = Date.now() >= Date.parse(t.finishAt || '');
    const expAttrs = { 'data-training-card-exp': t.id, 'data-base-level': h.level || 1, 'data-base-exp': h.exp || 0, 'data-expected-exp': t.expectedExp || 0, 'data-start-at': t.startAt, 'data-duration-ms': t.durationMs || 1 };
    return el('div', { class: 'mg-trainRow' },
      itemCard({ ...h, level: preview.level, power: undefined, advancement: undefined, exp: preview.exp, _expAttrs: expAttrs }, true),
      el('div', { class: 'mg-trainStats' },
        el('div', { 'data-training-exp': t.id, 'data-base-level': h.level || 1, 'data-base-exp': h.exp || 0, 'data-expected-exp': t.expectedExp || 0, 'data-start-at': t.startAt, 'data-duration-ms': t.durationMs || 1 }, `Lv. ${preview.level} | Current EXP: ${fmt(preview.exp)}/${fmt(preview.need)}`),
        el('div', { class: 'mg-expBar', 'data-training-bar': t.id, 'data-base-level': h.level || 1, 'data-base-exp': h.exp || 0, 'data-expected-exp': t.expectedExp || 0, 'data-start-at': t.startAt, 'data-duration-ms': t.durationMs || 1 }, el('span', { style: `width:${pct}%` })),
        el('div', { 'data-training-remaining': t.id, 'data-expected-exp': t.expectedExp || 0, 'data-start-at': t.startAt, 'data-duration-ms': t.durationMs || 1 }, `Expected remaining: +${fmt(remaining)}`)
      ),
      el('div', { class: 'mg-trainTime' }, el('span', { class: 'mg-muted' }, 'Time Left'), countdown(t.finishAt)),
      el('div', { class: 'mg-finish' },
        finished ? btn('Claim & Restart', async () => trainingReward(await action(API.trainingFinish, { id: t.id, restart: true }), h), 'primary') : null,
        btn('Claim EXP', async () => trainingReward(await action(API.trainingFinish, { id: t.id }), h), 'claim primary')
      )
    );
  }
  function trainingReward(out, hunter = {}) {
    const gained = Number(out.reward?.exp || 0);
    const after = addExpPreview(hunter, gained);
    openModal('Training Reward', el('div', { class: 'mg-grid stats' },
      stat('EXP gained', fmt(gained)),
      stat('After Training', `Lv. ${after.level} ${fmt(after.exp)}/${fmt(after.need)}`)
    ), el('div', { style: 'display:none' }));
  }
  function chooseTrainingHunter() {
    const owned = state.computed?.hunters || [];
    const locked = lockedHunterIds();
    const reason = h => (state.training || []).some(t => !t.claimed && t.hunterId === h.id) ? 'In Training' : (state.gates || []).some(g => !g.claimed && (g.hunterIds || []).includes(h.id)) ? 'In Gate' : '';
    const renderPicker = () => {
      const list = applyFilters(owned, trainingPickerFilters);
      openModal('Choose Hunter', el('div', { class: 'mg-trainingPicker' },
        buttonFilters(trainingPickerFilters, renderPicker, { roles: true }),
        el('div', { class: 'mg-selectList' }, list.map(h => {
          const status = locked.has(h.id) ? reason(h) || 'Locked' : '';
          return el('button', { class: `mg-selectItem mg-trainingHunterItem ${locked.has(h.id) ? 'disabledCard' : ''}`, disabled: locked.has(h.id), onclick: async () => { await action(API.trainingStart, { hunterId: h.id, hours: state.shop?.trainingMaxHours || 1 }); closeModal(); render(); } },
            itemImg(h),
            el('div', { class: 'mg-trainingHunterName' }, el('strong', {}, h.name), el('small', {}, `Lv. ${h.level} EXP ${fmt(h.exp)}/${fmt(expNeed(h))}`), status ? el('span', { class: 'mg-trainingStatusBadge' }, status.replace(/^In /, '')) : null),
            el('div', { class: 'mg-icons' }, elementIcon(h.element), roleIcon(h.role))
          );
        }))
      ), noModalFooter(), true);
    };
    renderPicker();
  }
  function bossLockReason(id) {
    if ((state.worldBoss?.usedHunterIds || []).includes(id) || (state.worldBoss?.usedWeaponIds || []).includes(id)) return 'Used Today';
    if ((state.gates || []).some(g => !g.claimed && ((g.hunterIds || []).includes(id) || (g.weaponIds || []).includes(id)))) return 'Gate';
    if ((state.training || []).some(t => !t.claimed && t.hunterId === id)) return 'Training';
    return '';
  }
  function bossPresetBlockReason(preset) {
    const ids = [...(preset?.hunters || []), ...(preset?.weapons || [])];
    return ids.map(bossLockReason).find(Boolean) || '';
  }
  function presetCountersBreakGauge(preset) {
    const ids = preset?.hunters || [];
    return ids.map(id => (state.computed?.hunters || []).find(h => h.id === id)).filter(Boolean).some(h => {
      const role = String(h.role || '').toLowerCase();
      return role.includes('breaker') || role.includes('stacker');
    });
  }
  function openTeamBuildInfo() {
    const combat = state.config?.combat || {};
    const adv = state.config?.elementAdvantage || {};
    const advValues = Object.values(adv).filter(v => Number.isFinite(Number(v)));
    const maxAdv = advValues.length ? Math.max(...advValues.map(Number)) : 0;
    const row = (title, text, value) => el('div', { class: 'mg-infoRow' },
      el('strong', {}, title),
      el('p', {}, text),
      el('small', { class: 'mg-muted' }, value)
    );
    openModal('Team Build Info', el('div', { class: 'mg-infoList' },
      row('Striker', 'Deals standard damage and does not add a team bonus.', 'Standard damage'),
      row('Breaker', 'If the boss has Break Gauge, increases the entire team damage. Without Break Gauge it gives no team bonus.', `Team bonus vs Break Gauge +${fmt(combat.breakerTeamBonusVsBreakGaugePct || 0)}%`),
      row('Supporter', 'Increases team damage. Allies with the same element receive the stronger bonus; different elements receive the smaller bonus.', `Same +${fmt(combat.supportSameElementBonusPct || 0)}% / Different +${fmt(combat.supportDifferentElementBonusPct || 0)}%`),
      row('Elemental Stacker', 'Increases damage dealt by allies of the same element and also counters Break Gauge.', `Same element team bonus +${fmt(combat.elementalStackerSameElementBonusPct || 0)}%`),
      row('Elemental Buster', 'Deals bonus damage only when the team contains an Elemental Stacker with the same element.', `Same element bonus +${fmt(combat.elementalBusterSameElementBonusPct || 0)}%`),
      row('Element Advantage', 'A unit matching any boss weakness deals increased damage.', `Weakness damage +${fmt(combat.elementAdvantageBonusPct || maxAdv || 0)}%`),
      row('Break Gauge', 'Without a Breaker or Elemental Stacker, the whole team receives a damage penalty.', `Penalty -${fmt(combat.breakGaugePenaltyPct || 50)}%`)
    ), noModalFooter(), true);
  }
  function teamBuildInfoButton() {
    return el('button', { class: 'mg-btn ghost', onclick: openTeamBuildInfo }, withIcon('fa-solid fa-circle-info', 'Team Build Info'));
  }
  function boss() {
    const selectedPreset = selectedBossPreset();
    const power = calcSelectedPower();
    const hp = Number(state.worldBoss?.bossHp || 0);
    const maxHp = Number(state.worldBoss?.bossMaxHp || 1000000);
    const hpPct = Math.max(0, Math.min(100, (hp / maxHp) * 100));
    const bossImage = state.worldBoss?.bossImage || state.config?.boss?.image || '';
    const bossWeakness = state.worldBoss?.bossWeakness || state.config?.boss?.weakness || ['Light'];
    const breakGauge = currentBossConfig().breakGauge || state.config?.boss?.breakGauge || {};
    const used = (state.worldBoss?.usedPresetSlots || []).includes(bossTeam.presetSlot);
    const presetDamage = Number(state.worldBoss?.presetDamage?.[bossTeam.presetSlot] || 0);
    const bossLocked = new Set([...lockedHunterIds('worldBoss'), ...lockedWeaponIds(), ...(state.worldBoss?.usedHunterIds || []), ...(state.worldBoss?.usedWeaponIds || [])]);
    const displayedPreset = usedBossPresetSnapshot(bossTeam.presetSlot) || selectedPreset;
    const gaugeCountered = !!breakGauge.enabled && presetCountersBreakGauge(displayedPreset);
    const presetBlockedReason = bossPresetBlockReason(selectedPreset);
    const presetBlocked = !!presetBlockedReason;
    const currentRewards = currentBossRewardRows();
    const performBossAttack = async () => {
      const out = await action(API.bossAttack, { presetSlot: bossTeam.presetSlot });
      openModal(out.defeated ? 'Boss Defeated' : 'World Boss Damage', el('div', {},
        bossDamageDetails(out, calcSelectedPower()),
        el('h3', {}, 'Attack Rewards'),
        bossRewardCards(out.reward)
      ), null, true);
      render();
    };
    const requestBossAttack = () => {
      if (!breakGauge.enabled || gaugeCountered) return performBossAttack();
      openModal('Break Gauge Warning', el('div', { class: 'mg-infoRow' },
        el('p', {}, 'This team does not contain a Breaker or Elemental Stacker.'),
        el('strong', {}, `Damage will be reduced by ${fmt(state.config?.combat?.breakGaugePenaltyPct || 50)}%.`)
      ), el('div', { class: 'mg-actions mg-modalFooter' },
        el('button', { class: 'mg-btn ghost', onclick: closeModal }, 'Cancel'),
        btn('Attack Anyway', async () => { closeModal(); await performBossAttack(); }, 'primary')
      ));
    };
    return card('World Boss',
      el('div', { class: 'mg-bossArt' }, bossImage ? el('img', { src: bossAsset(bossImage), alt: state.worldBoss?.bossName || 'World Boss', loading: 'lazy', decoding: 'async' }) : (state.worldBoss?.bossName || state.config?.boss?.name || 'WORLD BOSS')),
      expBar(hpPct, 'boss'),
      el('div', { class: 'mg-grid stats mg-bossStats' },
        stat('Boss', state.worldBoss?.bossName || state.config?.boss?.name || 'World Boss'),
        stat('Boss HP', `${fmt(hp)}/${fmt(maxHp)}`, 'mg-bossHpNumbers'),
        stat('Weakness', weaknessIcons(bossWeakness), 'mg-bossWeaknessStat'),
        stat('Today Damage', fmt(state.worldBoss?.totalDamage)),
        stat('Attacks Left', Math.max(0, 3 - Number(state.worldBoss?.attacksUsed || 0))),
        stat('Time Until Reset', resetLeft())
      ),
      breakGauge.enabled ? el('div', { class: 'mg-panel mg-elementInfo' },
        el('h3', {}, 'Element Info'),
        el('div', { class: 'mg-grid stats' },
          stat('Break Gauge', 'Active'),
          stat('Team Status', gaugeCountered ? 'Break Gauge Countered' : `Damage Penalty: -${fmt(state.config?.combat?.breakGaugePenaltyPct || 50)}%`)
        )
      ) : null,
      breakGauge.enabled ? el('div', { class: 'mg-breakGaugeEnabledBadge' }, icon('fa-solid fa-shield-halved'), 'Break Gauge Enabled') : null,
      breakGauge.enabled ? el('div', { class: `mg-breakGaugeStatus ${gaugeCountered ? 'countered' : 'penalty'}` }, icon('fa-solid fa-shield-halved'), el('strong', {}, gaugeCountered ? 'Break Gauge Countered' : 'Break Gauge Active'), el('span', {}, gaugeCountered ? 'Damage normal' : `Damage Penalty: -${fmt(state.config?.combat?.breakGaugePenaltyPct || 50)}%`)) : null,
      state.worldBoss?.defeated && state.worldBoss?.pendingReward
        ? el('div', { class: 'mg-actions top center' }, btn([icon('fa-solid fa-gift'), ' Claim Reward'], async () => {
          const out = await action(API.bossClaim, {});
          openModal('World Boss Kill Reward', el('div', { class: 'mg-rewardGrid' },
            rewardCard('Gold', fmt(out.reward?.gold), 'Gold'),
            rewardCard('Essence', fmt(out.reward?.essence), 'Essence'),
            rewardCard('Draw Ticket', fmt(out.reward?.customTickets), 'Draw Ticket'),
            rewardCard('Weapon Tickets', fmt(out.reward?.weaponTickets), 'Weapon Tickets'),
            ...Object.entries(out.reward?.items || {}).map(([itemId, amount]) => {
              const item = (state.config?.items || []).find(row => String(row.id || row.key || row.name) === itemId);
              return rewardCard(item?.name || itemId, fmt(amount), '');
            })
          ));
        }, 'primary'))
        : state.worldBoss?.defeated
        ? el('div', { class: 'mg-placeholder' }, 'Claim reward to unlock the next boss')
        : el('div', { class: 'mg-bossActionBar' },
          el('div', { class: 'mg-actions' }, teamBuildInfoButton()),
          el('button', { class: 'mg-btn primary', disabled: busy || used || presetBlocked || !selectedPreset, title: presetBlockedReason, onclick: requestBossAttack }, used ? 'Used Today' : presetBlocked ? `Locked: ${presetBlockedReason}` : withIcon('fa-solid fa-bolt', 'Attack')),
          el('div', { class: 'mg-actions right' }, el('button', { class: 'mg-btn ghost', onclick: () => openModal('World Boss Rewards', el('div', {},
          el('h3', {}, 'Attack Rewards'),
          el('div', { class: 'mg-rewardGrid' }, currentRewards.length ? currentRewards.map(chanceRewardCard) : el('div', { class: 'mg-muted' }, 'No rewards configured')),
          el('h3', {}, 'Kill Rewards'),
          el('div', { class: 'mg-rewardGrid' }, currentBossKillRewardRows().length ? currentBossKillRewardRows().map(chanceRewardCard) : el('div', { class: 'mg-muted' }, 'No kill rewards configured'))
        ), noModalFooter()) }, withIcon('fa-solid fa-gift', 'Rewards')))),
      el('label', { class: 'mg-mobileBossPresetSelect' }, el('span', {}, 'Choose Preset'), el('select', { class: 'mg-input', onchange: e => loadPreset(Number(e.target.value) || 1) }, Array.from({ length: state.shop?.presetSlots || 1 }, (_, i) => el('option', { value: String(i + 1), selected: bossTeam.presetSlot === i + 1 }, `Preset ${i + 1}`)))),
      el('div', { class: 'mg-bossPresetGrid' }, ...Array.from({ length: state.shop?.presetSlots || 1 }, (_, i) => {
        const slot = i + 1;
        const used = (state.worldBoss?.usedPresetSlots || []).includes(slot);
        return el('button', { class: `mg-btn ${bossTeam.presetSlot === slot ? 'primary' : 'ghost'}`, onclick: () => loadPreset(slot) }, `Preset ${slot}`);
      })),
      el('div', { class: 'mg-panel bossTeamPanel' },
        el('div', { class: 'mg-presetTitle' }, el('h3', {}, `Preset ${bossTeam.presetSlot}`), el('small', { class: presetBlocked ? 'mg-usedLine mg-activityTag' : 'mg-muted' }, used ? `Used Today - Damage ${fmt(presetDamage)}` : presetBlocked ? `Locked - ${presetBlockedReason}` : 'Ready')),
        breakGauge.enabled ? el('div', { class: `mg-counterAvailability ${gaugeCountered ? 'available' : 'missing'}` }, icon(gaugeCountered ? 'fa-solid fa-circle-check' : 'fa-solid fa-circle-xmark'), gaugeCountered ? 'Break Gauge Counter Available' : 'No Break Gauge Counter') : null,
        presetPreview(displayedPreset || { slot: bossTeam.presetSlot, type: 'sung', hunters: [], weapons: [] }, { boss: true, locked: bossLocked }),
      ),
      el('div', { class: `mg-panel mg-lastAttack ${lastAttackExpanded ? 'expanded' : ''}` },
        el('button', { class: 'mg-lastAttackToggle', 'aria-expanded': lastAttackExpanded, onclick: () => { lastAttackExpanded = !lastAttackExpanded; render(); } }, el('h3', {}, 'Last Attack Details'), icon(`fa-solid fa-chevron-${lastAttackExpanded ? 'up' : 'down'}`)),
        el('div', { class: 'mg-lastAttackBody' }, bossDamageDetails(state.worldBoss?.presetAttacks?.[bossTeam.presetSlot] || { damage: 0, breakdown: {} }, power))
      )
    );
  }
  function bossDamageDetails(out, power) {
    const b = out.breakdown || {};
    return el('div', { class: 'mg-grid stats' },
      stat('Base Damage', fmt(b.baseDamage || 0)),
      stat('Element Advantage Bonus', fmt(b.elementAdvantageBonus || 0)),
      stat('Break Gauge Penalty', `-${fmt(b.breakGaugePenalty || 0)}`),
      stat('Breaker Bonus', fmt(b.breakerBonus || 0)),
      stat('Supporter Bonus', fmt(b.supporterBonus || 0)),
      stat('Elemental Stacker Bonus', fmt(b.elementalStackerBonus || 0)),
      stat('Elemental Buster Bonus', fmt(b.elementalBusterBonus || 0)),
      stat('Final Damage', fmt(b.finalDamage || out.damage || 0)),
      b.breakGaugeEnabled ? stat('Break Gauge', b.breakGaugeCountered ? 'Countered' : 'Active') : null
    );
  }
  function bossRewardCards(reward = {}) {
    return el('div', { class: 'mg-rewardGrid' },
      rewardCard('Gold', fmt(reward.gold), 'Gold'),
      rewardCard('Essence', fmt(reward.essence), 'Essence'),
      rewardCard('Draw Ticket', fmt(reward.customTickets), 'Draw Ticket'),
      rewardCard('Weapon Tickets', fmt(reward.weaponTickets), 'Weapon Tickets'),
      ...Object.entries(reward.items || {}).map(([itemId, amount]) => {
        const item = (state.config?.items || []).find(row => String(row.id || row.key || row.name) === itemId);
        return rewardCard(item?.name || itemId, fmt(amount), '');
      })
    );
  }
  function loadPreset(slot) {
    const p = (state.presets || []).find(x => x.slot === slot && (x.type || 'sung') === 'sung');
    if (p) bossTeam = { hunters: [...p.hunters], weapons: [...p.weapons], presetSlot: slot };
    else bossTeam.presetSlot = slot;
    render();
  }
  function selectedBossPreset() {
    return (state.presets || []).find(p => p.slot === bossTeam.presetSlot && (p.type || 'sung') === 'sung') || null;
  }
  function usedBossPresetSnapshot(slot) {
    const snap = state.worldBoss?.usedPresetTeams?.[slot] || state.worldBoss?.usedPresetTeams?.[String(slot)];
    if (!snap) return null;
    return { slot, type: 'sung', name: snap.name || `Preset ${slot}`, hunters: Array.isArray(snap.hunters) ? snap.hunters : [], weapons: Array.isArray(snap.weapons) ? snap.weapons : [] };
  }
  function currentBossRewardRows() {
    const current = currentBossConfig();
    const rows = current.rewards?.rows || state.config?.worldBossRewards?.rows || [];
    return Array.isArray(rows) ? rows : [];
  }
  function currentBossKillRewardRows() {
    const rows = currentBossConfig().killRewards?.rows || [];
    return Array.isArray(rows) ? rows : [];
  }
  function currentBossConfig() {
    const bossName = String(state.worldBoss?.bossName || '');
    const rotation = Array.isArray(state.config?.boss?.rotation) ? state.config.boss.rotation : [];
    return rotation.find(b => String(b.name || '') === bossName) || rotation[0] || {};
  }
  function calcSelectedPower() {
    const p = usedBossPresetSnapshot(bossTeam.presetSlot) || selectedBossPreset();
    const hunterIds = p ? (p.hunters || []) : bossTeam.hunters;
    const weaponIds = p ? (p.weapons || []) : bossTeam.weapons;
    const hs = hunterIds.map(id => (state.computed?.hunters || []).find(h => h.id === id)).filter(Boolean);
    const ws = weaponIds.map(id => (state.computed?.weapons || []).find(w => w.id === id)).filter(Boolean);
    return ((state.computed?.sungPower || 2000) + ws.reduce((s, w) => s + (w.power || 0), 0)) * 2 + hs.reduce((s, h) => s + (h.power || 0), 0);
  }
  function presetPreview(preset, opts = {}) {
    const hs = (preset.hunters || []).map(id => (state.computed?.hunters || []).find(h => h.id === id)).filter(Boolean);
    const ws = (preset.weapons || []).map(id => (state.computed?.weapons || []).find(w => w.id === id)).filter(Boolean);
    const locked = opts.locked || new Set();
    const clean = item => item ? { ...item, level: undefined, exp: undefined, _expAttrs: undefined } : item;
    const mark = item => item ? el('div', { class: locked.has(item.id) || opts.used ? 'disabledCard' : '' }, itemCard(opts.boss ? clean(item) : item, true)) : el('div', { class: 'mg-rateSlot presetSlot empty' }, el('div', { class: 'mg-plus' }, '+'));
    if (opts.boss || (preset.type || 'sung') === 'sung') {
      return el('div', { class: 'mg-presetLayout sung' },
        el('div', { class: 'mg-presetWeapons' }, ...Array.from({ length: 2 }, (_, i) => mark(ws[i]))),
        el('div', { class: 'mg-presetHunters' }, ...Array.from({ length: 3 }, (_, i) => mark(hs[i])))
      );
    }
    return el('div', { class: 'mg-presetHunters' }, ...Array.from({ length: 3 }, (_, i) => mark(hs[i])));
  }
  function presets() {
    const hunters = sortOwned(state.computed?.hunters || []);
    const weapons = sortOwned((state.computed?.weapons || []).filter(w => w.ownerType === 'sung'));
    const draft = (slot, existing) => {
      const key = `${presetMode}:${slot}`;
      if (!presetDrafts[key]) presetDrafts[key] = { hunters: [...(existing?.hunters || [])], weapons: [...(existing?.weapons || [])] };
      return presetDrafts[key];
    };
    const usedInfo = (id, type, currentSlot) => {
      const activity = activityLabel(id);
      if (activity) return activity;
      const hit = (state.presets || []).find(p => p.slot !== currentSlot && (p.type || 'sung') === type && ((p.hunters || []).includes(id) || (p.weapons || []).includes(id)));
      return hit ? `Preset ${hit.slot}` : '';
    };
    const choosePresetItem = (slot, d, listKey, idx, pool, label, max) => {
      const renderPicker = () => {
        const list = applyFilters(pool, pickerFilters);
        openModal(`Choose ${label}`, el('div', {},
          buttonFilters(pickerFilters, renderPicker, { roles: label === 'Hunter' }),
          el('div', { class: 'mg-selectList' }, list.map(item => {
        const selected = d[listKey][idx] === item.id;
        const info = usedInfo(item.id, presetMode, slot);
        return el('button', { class: `mg-selectItem ${selected ? 'selected' : ''}`, onclick: () => {
          d[listKey] = d[listKey].filter(id => id !== item.id);
          d[listKey][idx] = item.id;
          d[listKey] = d[listKey].filter(Boolean).slice(0, max);
          closeModal();
          render();
        } }, itemImg(item), el('div', {}, el('strong', {}, item.name), info ? el('small', { class: 'mg-presetBadge' }, info) : null), el('div', { class: 'mg-icons' }, elementIcon(item.element), item.kind === 'hunter' ? roleIcon(item.role) : null));
      }))), noModalFooter(), true);
      };
      renderPicker();
    };
    const presetSlotCard = (slot, d, listKey, idx, item, label, pool, max) => {
      const status = item ? activityLabel(item.id) : '';
      return el('button', { class: `mg-rateSlot presetSlot ${item ? 'filled' : ''}`, onclick: () => choosePresetItem(slot, d, listKey, idx, pool, label, max) },
        item ? [itemCard(item, true), status ? el('small', { class: 'mg-usedLine mg-activityTag' }, status) : null] : [el('div', { class: 'mg-plus' }, '+'), el('strong', {}, label)]
      );
    };
    const slotButtons = el('div', { class: 'mg-presetButtons' }, Array.from({ length: state.shop?.presetSlots || 1 }, (_, i) => {
      const slot = i + 1;
      return el('button', { class: `mg-btn ${presetSlot === slot ? '' : 'ghost'}`, onclick: () => { presetSlot = slot; render(); } }, `Preset ${slot}`);
    }));
    const mobilePresetSelect = el('label', { class: 'mg-mobilePresetSelect' }, el('span', {}, 'Choose Preset'), el('select', { class: 'mg-input', onchange: e => { presetSlot = Number(e.target.value) || 1; render(); } }, Array.from({ length: state.shop?.presetSlots || 1 }, (_, i) => el('option', { value: String(i + 1), selected: presetSlot === i + 1 }, `Preset ${i + 1}`))));
    const slot = Math.max(1, Math.min(state.shop?.presetSlots || 1, presetSlot));
    const existing = (state.presets || []).find(p => p.slot === slot && (p.type || 'sung') === presetMode);
    const d = draft(slot, existing);
    const selectedHunters = d.hunters.map(id => hunters.find(h => h.id === id)).filter(Boolean);
    const selectedWeapons = d.weapons.map(id => weapons.find(w => w.id === id)).filter(Boolean);
    const presetStatus = [...d.hunters, ...d.weapons].map(activityLabel).find(Boolean) || '';
    return card('Presets',
      el('div', { class: 'mg-subtabs' },
        el('button', { class: `mg-tab ${presetMode === 'sung' ? 'active' : ''}`, onclick: () => { presetMode = 'sung'; presetSlot = 1; render(); } }, 'Sung Presets'),
        el('button', { class: `mg-tab ${presetMode === 'hunter' ? 'active' : ''}`, onclick: () => { presetMode = 'hunter'; presetSlot = 1; render(); } }, 'Hunter Presets')
      ),
      mobilePresetSelect,
      slotButtons,
      el('div', { class: 'mg-list' },
        el('div', { class: 'mg-panel', id: `mg-preset-${presetMode}-${slot}` },
          el('div', { class: 'mg-presetTitle' },
            el('h3', {}, `${presetMode === 'sung' ? 'Sung' : 'Hunter'} Preset ${slot}`),
            presetStatus ? el('small', { class: 'mg-usedLine mg-activityTag' }, `Locked - ${presetStatus}`) : el('small', { class: 'mg-muted' }, presetMode === 'sung' ? '2 weapons + 3 hunters' : '3 hunters')
          ),
          el('div', { class: 'mg-presetLayout' },
            presetMode === 'sung' ? el('section', { class: `mg-presetEditorSection ${presetEditorSection === 'weapons' ? 'expanded' : ''}` },
              el('button', { class: 'mg-presetSectionToggle', onclick: () => { presetEditorSection = 'weapons'; render(); } }, 'Weapons', icon(`fa-solid fa-chevron-${presetEditorSection === 'weapons' ? 'up' : 'down'}`)),
              el('div', { class: 'mg-presetSectionContent mg-presetWeapons' }, ...Array.from({ length: 2 }, (_, idx) => presetSlotCard(slot, d, 'weapons', idx, selectedWeapons[idx], 'Weapon', weapons, 2)))
            ) : null,
            el('section', { class: `mg-presetEditorSection ${presetMode === 'hunter' || presetEditorSection === 'hunters' ? 'expanded' : ''}` },
              el('button', { class: 'mg-presetSectionToggle', onclick: () => { presetEditorSection = 'hunters'; render(); } }, 'Hunters', icon(`fa-solid fa-chevron-${presetMode === 'hunter' || presetEditorSection === 'hunters' ? 'up' : 'down'}`)),
              el('div', { class: 'mg-presetSectionContent mg-presetHunters' }, ...Array.from({ length: 3 }, (_, idx) => presetSlotCard(slot, d, 'hunters', idx, selectedHunters[idx], 'Hunter', hunters, 3)))
            )
          ),
          el('div', { class: 'mg-actions top' }, btn('Save / Overwrite', async () => {
            await action(API.presetSave, { slot, type: presetMode, hunters: d.hunters, weapons: d.weapons });
          }, 'primary'))
        ),
        el('div', { class: 'mg-actions top' }, teamBuildInfoButton())
      )
    );
  }
  function collection() {
    const hunters = state.computed?.hunters || [];
    const weapons = (state.computed?.weapons || []).filter(w => w.ownerType === 'sung');
    const rows = applyFilters(collectionTab === 'hunters' ? hunters : weapons, collectionFilters);
    return card('Collection',
      el('div', { class: 'mg-subtabs' }, el('button', { class: `mg-tab ${collectionTab === 'hunters' ? 'active' : ''}`, onclick: () => { collectionTab = 'hunters'; render(); } }, 'Hunters'), el('button', { class: `mg-tab ${collectionTab === 'weapons' ? 'active' : ''}`, onclick: () => { collectionTab = 'weapons'; render(); } }, 'Sung Weapons')),
      buttonFilters(collectionFilters, render, { roles: collectionTab === 'hunters' }),
      collectionTab === 'weapons' ? inventorySummary() : null,
      el('div', { class: 'mg-collection' }, rows.length ? rows.map(x => collectionTab === 'weapons' ? weaponCollectionCard(x) : itemCard(x)) : el('div', { class: 'mg-muted' }, 'Empty'))
    );
  }
  function inventorySummary() {
    const items = state.config?.items || [];
    const rows = Object.entries(state.inventory || {}).filter(([, amount]) => Number(amount) > 0);
    return el('div', { class: 'mg-inventoryBar' }, el('strong', {}, 'Upgrade Materials'), rows.length ? rows.map(([id, amount]) => {
      const item = items.find(row => String(row.id || row.key || row.name) === id);
      return el('span', { class: 'mg-materialChip' }, item?.name || id, ` x${fmt(amount)}`);
    }) : el('span', { class: 'mg-muted' }, 'No upgrade materials required.'));
  }
  function weaponRequirements(weapon, targetLevel) {
    const all = state.config?.sungWeaponUpgradeRequirements || {};
    const levels = all[weapon.catalogId] || all[weapon.id] || all[weapon.name] || all['*'] || {};
    return Array.isArray(levels[String(targetLevel)]) ? levels[String(targetLevel)] : [];
  }
  function weaponCollectionCard(weapon) {
    const maxLevel = Number(state.meta?.sungWeaponMaxLevel || 100);
    const maxed = Number(weapon.level || 1) >= maxLevel;
    return el('div', { class: 'mg-collectionWeapon' }, itemCard(weapon), el('button', { class: 'mg-miniBtn primary', disabled: busy || maxed, onclick: () => weaponUpgradeModal(weapon) }, maxed ? 'MAX' : 'Upgrade'));
  }
  function weaponUpgradeModal(weapon) {
    const current = (state.computed?.weapons || []).find(row => row.id === weapon.id) || weapon;
    const maxLevel = Number(state.meta?.sungWeaponMaxLevel || 100);
    const targetLevel = Math.min(maxLevel, Number(current.level || 1) + 1);
    const requirements = weaponRequirements(current, targetLevel);
    const items = state.config?.items || [];
    const materialRows = requirements.map(row => {
      const item = items.find(entry => String(entry.id || entry.key || entry.name) === String(row.itemId));
      const owned = Number(state.inventory?.[row.itemId] || 0);
      return el('div', { class: `mg-materialRow ${owned < Number(row.amount || 0) ? 'missing' : ''}` }, el('span', {}, item?.name || row.itemId), el('strong', {}, `${fmt(owned)} / ${fmt(row.amount)}`));
    });
    const canUpgrade = Number(current.level || 1) < maxLevel && requirements.length && requirements.every(row => Number(state.inventory?.[row.itemId] || 0) >= Number(row.amount || 0));
    openModal(`Upgrade ${current.name}`, el('div', { class: 'mg-list' }, itemCard(current), el('div', { class: 'mg-panel centerText' }, el('strong', {}, `Lv. ${current.level || 1} -> Lv. ${targetLevel}`), requirements.length ? materialRows : el('div', { class: 'mg-warn' }, `Requirements for Lv. ${targetLevel} are not configured`)), el('button', { class: 'mg-btn primary', disabled: busy || !canUpgrade, onclick: async () => {
      if (!canUpgrade || busy) return;
      busy = true;
      try {
        await action(API.weaponUpgrade, { weaponId: current.id });
        closeModal();
        render();
      } catch (e) { toast(e.message || 'Upgrade failed'); }
      busy = false;
    } }, 'Upgrade')), noModalFooter());
  }
  function adminPanel() {
    if (!state.meta?.isAdmin) return card('Admin', el('div', { class: 'mg-muted' }, 'Admin only'));
    const cfg = adminDraftConfig || JSON.parse(JSON.stringify(state.config || {}));
    adminDraftConfig = cfg;
    const input = (label, obj, key, type = 'text') => {
      const apply = e => { obj[key] = type === 'number' ? Number(e.target.value) : e.target.value; };
      const node = el('input', { class: 'mg-input', type, step: type === 'number' ? 'any' : null, value: obj[key] ?? '', oninput: apply, onchange: apply });
      return el('label', { class: 'mg-field' }, el('span', {}, label), node);
    };
    const textarea = (label, obj, key) => el('label', { class: 'mg-field wide' }, el('span', {}, label), el('textarea', { class: 'mg-input mg-textarea', onchange: e => { obj[key] = e.target.value; } }, obj[key] || ''));
    const check = (label, obj, key) => el('label', { class: 'mg-field check' }, el('span', {}, label), el('input', { type: 'checkbox', checked: !!obj[key], onchange: e => { obj[key] = e.target.checked; } }));
    const select = (label, obj, key, options) => el('label', { class: 'mg-field' }, el('span', {}, label), el('select', { class: 'mg-input', onchange: e => { obj[key] = e.target.value; } }, options.map(v => el('option', { value: v, selected: String(obj[key]) === String(v) }, v))));
    const adv = cfg.elementAdvantage || {};
    const boss = cfg.boss || {};
    boss.breakGauge = boss.breakGauge || {};
    boss.rotation = Array.isArray(boss.rotation) ? boss.rotation : [];
    cfg.start = cfg.start || {};
    cfg.combat = cfg.combat || {};
    cfg.summon = cfg.summon || {};
    cfg.training = cfg.training || {};
    cfg.levels = cfg.levels || {};
    cfg.levels.sungLevelPower = cfg.levels.sungLevelPower || {};
    cfg.powerGrowth = cfg.powerGrowth || {};
    cfg.powerGrowth.hunters = cfg.powerGrowth.hunters || { defaultBasePowerBonus: 120, defaultLevelIncrement: 120, defaultAdvancementIncrement: 600, overrides: {} };
    cfg.powerGrowth.sungWeapons = cfg.powerGrowth.sungWeapons || { defaultBasePowerBonus: 0, defaultLevelIncrement: 100, defaultAdvancementIncrement: 500, overrides: {} };
    cfg.powerGrowth.hunters.overrides = cfg.powerGrowth.hunters.overrides || {};
    cfg.powerGrowth.sungWeapons.overrides = cfg.powerGrowth.sungWeapons.overrides || {};
    cfg.sungWeaponUpgradeRequirements = cfg.sungWeaponUpgradeRequirements || {};
    cfg.formulas = cfg.formulas || {};
    cfg.shopPrices = cfg.shopPrices || {};
    cfg.maxShopUpgrades = cfg.maxShopUpgrades || {};
    cfg.shopUpgradeSteps = cfg.shopUpgradeSteps || { trainingExpMultiplier: 0.25 };
    cfg.worldBossRewards = cfg.worldBossRewards || {};
    cfg.items = Array.isArray(cfg.items) ? cfg.items : [
      { id: 'Gold', key: 'Gold', name: 'Gold', image: '/picture/MiniGame/Currency/Gold.svg', type: 'Currency' },
      { id: 'Essence', key: 'Essence', name: 'Essence', image: '/picture/MiniGame/Currency/Essence.svg', type: 'Currency' },
      { id: 'Draw Ticket', key: 'Draw Ticket', name: 'Draw Ticket', image: '/picture/MiniGame/Currency/Draw_Tickets.svg', type: 'Ticket' },
      { id: 'Weapon Ticket', key: 'Weapon Ticket', name: 'Weapon Ticket', image: '/picture/MiniGame/Currency/Weapon_Tickets.svg', type: 'Ticket' },
      { id: 'EXP', key: 'EXP', name: 'EXP', image: '/picture/MiniGame/Currency/EXP.svg', type: 'Progression' }
    ];
    const itemImageOptions = Array.from(new Set([
      '',
      '/picture/MiniGame/Currency/Gold.svg',
      '/picture/MiniGame/Currency/Essence.svg',
      '/picture/MiniGame/Currency/Draw_Tickets.svg',
      '/picture/MiniGame/Currency/Weapon_Tickets.svg',
      '/picture/MiniGame/Currency/EXP.svg',
      ...(cfg.items || []).map(x => x.image).filter(Boolean)
    ]));
    const imageSelect = (label, obj, key, options = itemImageOptions) => el('label', { class: 'mg-field' }, el('span', {}, label), el('select', { class: 'mg-input', onchange: e => { obj[key] = e.target.value; } }, options.map(src => el('option', { value: src, selected: String(obj[key] || '') === String(src) }, src ? src.split('/').pop() : 'No image'))));
    cfg.duplicateA10Rewards = cfg.duplicateA10Rewards || {};
    const gateRewards = cfg.gateRewards || {};
    const gateInput = (kind, rank, key, label) => {
      if (!gateRewards[kind]) gateRewards[kind] = {};
      if (!gateRewards[kind][rank]) gateRewards[kind][rank] = {};
      return input(label, gateRewards[kind][rank], key, 'number');
    };
    const tabs = ['Start', 'Shop', 'Gate', 'Training', 'World Boss', 'Rewards', 'EXP', 'Power', 'Combat', 'Items'];
    const tabKey = label => label.toLowerCase().replace(/\s+/g, '-');
    const save = btn('Save Admin Config', async () => {
      cfg.boss = boss;
      cfg.elementAdvantage = adv;
      cfg.gateRewards = gateRewards;
      await action(API.adminConfig, cfg);
      adminDraftConfig = null;
      adminEditBossRows.clear();
      await refresh();
    }, 'primary');
    const startTab = () => el('div', { class: 'mg-panel' },
      el('h3', {}, 'Start Settings'),
      el('div', { class: 'mg-grid stats' },
        input('Start Gold', cfg.start, 'gold', 'number'),
        input('Start Essence', cfg.start, 'essence', 'number'),
        input('Start Draw Tickets', cfg.start, 'customTickets', 'number'),
        input('Start Weapon Tickets', cfg.start, 'weaponTickets', 'number'),
        input('Start Hunter Level', cfg.start, 'hunterLevel', 'number'),
        input('Start Weapon Level', cfg.start, 'weaponLevel', 'number')
      )
    );
    const groupPanel = (title, ...nodes) => el('div', { class: 'mg-panel' }, el('h3', {}, title), el('div', { class: 'mg-grid stats' }, ...nodes));
    const shopTab = () => el('div', { class: 'mg-list' },
      groupPanel('Tickets',
        input('Draw Ticket Price', cfg.shopPrices, 'customTicket', 'number'),
        input('Weapon Ticket Price', cfg.shopPrices, 'weaponTicket', 'number')
      ),
      groupPanel('Training',
        input('Training Slot Cost', cfg.shopPrices, 'trainingSlots', 'number'),
        input('Training EXP Multiplier Cost', cfg.shopPrices, 'trainingExpMultiplier', 'number'),
        input('Max Training EXP Multiplier', cfg.maxShopUpgrades, 'trainingExpMultiplier', 'number'),
        input('Training EXP Multiplier Increase Per Purchase', cfg.shopUpgradeSteps, 'trainingExpMultiplier', 'number')
      ),
      groupPanel('Presets',
        input('Preset Slot Cost', cfg.shopPrices, 'presetSlots', 'number'),
        input('Hunter Gate Slot Cost', cfg.shopPrices, 'hunterGateSlots', 'number'),
        input('Max Preset Slots', cfg.maxShopUpgrades, 'presetSlots', 'number'),
        input('Max Hunter Gate Slots', cfg.maxShopUpgrades, 'hunterGateSlots', 'number')
      ),
      groupPanel('Progression',
        input('Training Max Time Cost', cfg.shopPrices, 'trainingMaxHours', 'number'),
        input('Max Training Time', cfg.maxShopUpgrades, 'trainingMaxHours', 'number')
      )
    );
    const gateTab = () => el('div', { class: 'mg-panel' },
      el('h3', {}, 'Gate Settings'),
      el('div', { class: 'mg-gateKinds' }, GATE_KINDS.map(kind => el('button', { class: `mg-tab gate-${kind} ${miniAdminGateKind === kind ? 'active' : ''}`, onclick: () => { miniAdminGateKind = kind; render(); } }, state.gateKinds?.[kind]?.label || kind))),
      el('div', { class: 'mg-list' }, el('div', { class: 'mg-panel' },
        el('h3', {}, state.gateKinds?.[miniAdminGateKind]?.label || miniAdminGateKind),
        ...GATES.map(rank => el('section', { class: `mg-gateRank ${miniAdminGateRank === rank ? 'expanded' : ''}` },
          el('button', { class: 'mg-gateRankToggle', onclick: () => { miniAdminGateRank = rank; render(); }, 'aria-expanded': miniAdminGateRank === rank }, el('strong', {}, `Rank ${rank}`), icon(`fa-solid fa-chevron-${miniAdminGateRank === rank ? 'up' : 'down'}`)),
          el('div', { class: 'mg-gateAdminRow' },
            gateInput(miniAdminGateKind, rank, 'requiredPower', 'Required Power'),
            gateInput(miniAdminGateKind, rank, 'exp', 'EXP'),
            gateInput(miniAdminGateKind, rank, 'gold', 'Gold'),
            gateInput(miniAdminGateKind, rank, 'essence', 'Essence'),
            gateInput(miniAdminGateKind, rank, 'ticketChance', 'Ticket Chance'),
            gateInput(miniAdminGateKind, rank, 'minutes', 'Gate Time')
          )
        ))
      ))
    );
    const trainingTab = () => el('div', { class: 'mg-panel' },
      el('h3', {}, 'Training Settings'),
      el('div', { class: 'mg-grid stats' },
        input('Base EXP', cfg.training, 'baseExp', 'number'),
        input('EXP Per Hour', cfg.training, 'expPerHour', 'number'),
        input('Max Training Slots', cfg.training, 'maxTrainingSlots', 'number'),
        input('Max Training Time', cfg.training, 'maxTrainingTime', 'number'),
        input('EXP Multiplier', cfg.training, 'expMultiplier', 'number')
      )
    );
    const bossTab = () => el('div', { class: 'mg-panel' },
      el('h3', {}, 'Boss Rotation'),
      el('div', { class: 'mg-list' }, boss.rotation.map((_, i) => {
        boss.rotation[i] = boss.rotation[i] || { name: `Boss ${String.fromCharCode(65 + i)}`, hp: boss.hp || 1000000, weakness: weaknessList(boss.weakness), image: '', breakGauge: { enabled: false }, rewards: { rows: [] } };
        const row = boss.rotation[i];
        row.rewards = row.rewards || { rows: [] };
        row.breakGauge = { enabled: !!row.breakGauge?.enabled };
        row.weakness = weaknessList(row.weakness);
        const editing = adminEditBossRows.has(i);
        const cell = (label, key, type = 'text') => editing
          ? input(label, row, key, type)
          : el('div', { class: 'mg-field' }, el('span', {}, label), el('strong', {}, row[key] || '-'));
        const weaknessCell = editing
          ? el('div', { class: 'mg-field' }, el('span', {}, 'Weakness'), el('div', { class: 'mg-weaknessChecks' }, ...['Fire', 'Water', 'Wind', 'Light', 'Dark'].map(name => el('button', { type: 'button', class: `mg-elementChip ${row.weakness.includes(name) ? 'active' : ''}`, onclick: () => { row.weakness = row.weakness.includes(name) ? row.weakness.filter(x => x !== name) : Array.from(new Set([...row.weakness, name])); render(); } }, elementIcon(name), name))))
          : el('div', { class: 'mg-field' }, el('span', {}, 'Weakness'), weaknessIcons(row.weakness));
        const imageCell = editing
          ? el('label', { class: 'mg-field' }, el('span', {}, 'Image'), el('select', { class: 'mg-input', onchange: e => { row.image = e.target.value; } }, [el('option', { value: '', selected: !row.image }, 'No image'), ...bossImages.map(src => el('option', { value: src, selected: row.image === src }, src.split('/').pop()))]))
          : el('div', { class: 'mg-field' }, el('span', {}, 'Image'), el('strong', {}, row.image ? row.image.split('/').pop() : '-'));
        const breakField = editing ? check('Break Gauge Enabled', row.breakGauge, 'enabled') : el('div', { class: 'mg-field' }, el('span', {}, 'Break Gauge'), el('strong', {}, row.breakGauge.enabled ? 'Enabled' : 'Disabled'));
        return el('div', { class: `bossRotationRow ${editing ? 'editing' : 'collapsed'}` },
          cell('Name', 'name'),
          cell('HP', 'hp', 'number'),
          weaknessCell,
          imageCell,
          breakField,
          el('div', { class: 'mg-actions bossActions' },
            el('button', { class: 'mg-miniBtn ghost', onclick: () => { editing ? adminEditBossRows.delete(i) : adminEditBossRows.add(i); render(); } }, editing ? 'Done' : 'Edit'),
            el('button', { class: 'mg-miniBtn ghost', disabled: boss.rotation.length <= 1, onclick: () => {
              if (boss.rotation.length <= 1) return toast('At least one boss is required');
              boss.rotation.splice(i, 1);
              adminEditBossRows = new Set([...adminEditBossRows].filter(idx => idx !== i).map(idx => idx > i ? idx - 1 : idx));
              if (miniRewardBossIndex >= boss.rotation.length) miniRewardBossIndex = Math.max(0, boss.rotation.length - 1);
              render();
            } }, 'Delete Boss')
          )
        );
      })),
      el('button', { class: 'mg-miniBtn primary', onclick: () => { boss.rotation.push({ name: `Boss ${boss.rotation.length + 1}`, hp: 1000000, weakness: ['Light'], image: '', breakGauge: { enabled: false }, rewards: { rows: [] }, killRewards: { rows: [] } }); adminEditBossRows.add(boss.rotation.length - 1); render(); } }, 'Add Boss')
    );
    const rewardsTab = () => el('div', { class: 'mg-panel' },
      el('h3', {}, 'Rewards Settings'),
      (() => {
        const rotation = boss.rotation || [];
        if (miniRewardBossIndex >= rotation.length) miniRewardBossIndex = Math.max(0, rotation.length - 1);
        const selectedBoss = rotation[miniRewardBossIndex] || (rotation[0] = { name: 'Boss 1', hp: 1000000, weakness: ['Light'], image: '', breakGauge: { enabled: false }, rewards: { rows: [] }, killRewards: { rows: [] } });
        selectedBoss.rewards = selectedBoss.rewards || {};
        selectedBoss.rewards.rows = Array.isArray(selectedBoss.rewards.rows) ? selectedBoss.rewards.rows : [];
        selectedBoss.killRewards = selectedBoss.killRewards || {};
        selectedBoss.killRewards.rows = Array.isArray(selectedBoss.killRewards.rows) ? selectedBoss.killRewards.rows : [];
        const rewardOptions = (cfg.items || []).map(item => item.id || item.key || item.name).filter(Boolean);
        if (!rewardOptions.length) rewardOptions.push('Gold', 'Essence', 'Draw Ticket', 'Weapon Ticket');
        const rewardEditor = (title, rewardSet) => el('div', { class: 'mg-panel' },
          el('h3', {}, title),
          el('div', { class: 'mg-list' }, rewardSet.rows.length ? rewardSet.rows.map((reward, idx) => el('div', { class: 'mg-rewardAdminRow' },
            select('Type', reward, 'type', rewardOptions),
            input('Amount', reward, 'amount', 'number'),
            input('Chance %', reward, 'chance', 'number'),
            el('button', { class: 'mg-miniBtn ghost', onclick: () => { rewardSet.rows.splice(idx, 1); render(); } }, 'Remove')
          )) : el('div', { class: 'mg-muted' }, 'No reward rows yet')),
          el('button', { class: 'mg-miniBtn primary', onclick: () => { rewardSet.rows.push({ type: rewardOptions.includes('Draw Ticket') ? 'Draw Ticket' : rewardOptions[0], amount: 1, chance: 100 }); render(); } }, 'Add Reward Row')
        );
        return el('div', { class: 'mg-panel' },
          el('label', { class: 'mg-field' }, el('span', {}, 'World Boss'), el('select', { class: 'mg-input', onchange: e => { miniRewardBossIndex = Number(e.target.value) || 0; render(); } },
            rotation.map((row, idx) => el('option', { value: String(idx), selected: idx === miniRewardBossIndex }, row.name || `Boss ${idx + 1}`))
          )),
          el('h3', {}, `${selectedBoss.name || `Boss ${miniRewardBossIndex + 1}`} Rewards`),
          rewardEditor('Attack Rewards', selectedBoss.rewards),
          rewardEditor('Kill Rewards', selectedBoss.killRewards)
        );
      })(),
      groupPanel('Other',
        input('R A10 Reward', cfg.duplicateA10Rewards, 'R', 'number'),
        input('SR A10 Reward', cfg.duplicateA10Rewards, 'SR', 'number'),
        input('SSR A10 Reward', cfg.duplicateA10Rewards, 'SSR', 'number')
      ),
    );
    const expTab = () => el('div', { class: 'mg-list' },
      groupPanel('Level System',
        select('Level Mode', cfg.levels, 'mode', ['percent', 'manual']),
        input('Max Level', cfg.levels, 'maxLevel', 'number'),
        input('EXP Per Level', cfg.levels, 'expPerLevel', 'number')
      ),
      el('div', { class: 'mg-panel mg-helpPanel' },
        el('h3', {}, 'EXP Help'),
        el('p', {}, 'Percent Mode: Base EXP = wymagany EXP na pierwszy poziom. Growth % = o ile procent rośnie wymagany EXP na kolejny poziom.'),
        el('p', {}, 'Przykład: Base EXP 1000, Growth 20% → Lv.1 1000, Lv.2 1200, Lv.3 1440.'),
        el('p', {}, 'Manual Mode: Wpisujesz osobną wartość EXP dla każdego poziomu.')
      ),
      cfg.levels.mode === 'manual'
        ? el('div', { class: 'mg-panel' }, el('h3', {}, 'Manual EXP'), el('div', { class: 'mg-manualLevels' }, Array.from({ length: Math.min(150, Number(cfg.levels.maxLevel || 150)) }, (_, i) => {
          const lv = i + 1;
          cfg.levels.manual = cfg.levels.manual || {};
          return input(`Lv ${lv}`, cfg.levels.manual, String(lv), 'number');
        })))
        : groupPanel('Percent Mode',
          input('Base EXP', cfg.levels, 'baseExp', 'number'),
          input('Growth %', cfg.levels, 'growthPct', 'number')
        )
    );
    const incrementFields = (map, maxLevel, fallback, prefix = 'Lv.') => el('div', { class: 'mg-manualLevels mg-powerLevels' }, Array.from({ length: Math.max(0, Math.min(999, Number(maxLevel || 1)) - 1) }, (_, idx) => {
      const target = idx + 2;
      return el('label', { class: 'mg-field' }, el('span', {}, `${prefix} ${target}`), el('input', {
        class: 'mg-input', type: 'number', min: '0', step: '1', value: Object.prototype.hasOwnProperty.call(map, String(target)) ? map[String(target)] : '', placeholder: `Global ${fmt(fallback)}`,
        oninput: e => { if (e.target.value === '') delete map[String(target)]; else map[String(target)] = Number(e.target.value); }
      }));
    }));
    const advancementFields = (map, fallback) => el('div', { class: 'mg-manualLevels mg-powerLevels' }, Array.from({ length: 10 }, (_, idx) => {
      const target = idx + 1;
      return el('label', { class: 'mg-field' }, el('span', {}, `A${target}`), el('input', {
        class: 'mg-input', type: 'number', min: '0', step: '1', value: Object.prototype.hasOwnProperty.call(map, String(target)) ? map[String(target)] : '', placeholder: `Global ${fmt(fallback)}`,
        oninput: e => { if (e.target.value === '') delete map[String(target)]; else map[String(target)] = Number(e.target.value); }
      }));
    }));
    const entityPowerEditor = (title, entries, selectedId, setSelected, growth, maxLevel) => {
      const selected = entries.find(row => row.id === selectedId) || entries[0];
      if (!selected) return el('div', { class: 'mg-panel' }, el('h3', {}, title), el('div', { class: 'mg-muted' }, 'Catalog is empty'));
      setSelected(selected.id, false);
      const override = growth.overrides[selected.id] || (growth.overrides[selected.id] = { basePower: null, levels: {}, advancements: {} });
      override.levels = override.levels || {};
      override.advancements = override.advancements || {};
      return el('div', { class: 'mg-panel' }, el('h3', {}, title),
        el('label', { class: 'mg-field' }, el('span', {}, 'Character / Weapon'), el('select', { class: 'mg-input', onchange: e => { setSelected(e.target.value, true); } }, entries.map(row => el('option', { value: row.id, selected: row.id === selected.id }, row.name)))),
        el('label', { class: 'mg-field' }, el('span', {}, 'Base Power Override'), el('input', { class: 'mg-input', type: 'number', min: '0', value: override.basePower ?? '', placeholder: `Catalog ${fmt(selected.basePower)}`, oninput: e => { override.basePower = e.target.value === '' ? null : Number(e.target.value); } })),
        el('small', { class: 'mg-muted' }, 'Empty field uses the global value. Values below are power gained when entering that level or advancement.'),
        el('details', { class: 'mg-configDetails' }, el('summary', {}, 'Power per Level'), incrementFields(override.levels, maxLevel, growth.defaultLevelIncrement)),
        el('details', { class: 'mg-configDetails' }, el('summary', {}, 'Power per Advancement'), advancementFields(override.advancements, growth.defaultAdvancementIncrement))
      );
    };
    const weaponRequirementEditor = (weapons, maxLevel) => {
      const weapon = weapons.find(row => row.id === adminPowerWeaponId) || weapons[0];
      if (!weapon) return null;
      const targetLevel = Math.max(2, Math.min(Number(maxLevel || 100), Number(adminWeaponRequirementLevel || 2)));
      adminWeaponRequirementLevel = targetLevel;
      const levels = cfg.sungWeaponUpgradeRequirements[weapon.id] || (cfg.sungWeaponUpgradeRequirements[weapon.id] = {});
      const rows = levels[String(targetLevel)] || (levels[String(targetLevel)] = []);
      const itemOptions = (cfg.items || []).filter(item => !['Currency', 'Ticket', 'Progression'].includes(String(item.type || item.category || '')));
      return el('div', { class: 'mg-panel' }, el('h3', {}, 'Sung Weapon Upgrade Requirements'),
        el('div', { class: 'mg-grid stats mini' },
          el('label', { class: 'mg-field' }, el('span', {}, 'Weapon'), el('select', { class: 'mg-input', onchange: e => { adminPowerWeaponId = e.target.value; render(); } }, weapons.map(row => el('option', { value: row.id, selected: row.id === weapon.id }, row.name)))),
          el('label', { class: 'mg-field' }, el('span', {}, 'Target Level'), el('select', { class: 'mg-input', onchange: e => { adminWeaponRequirementLevel = Number(e.target.value); render(); } }, Array.from({ length: Math.max(0, Number(maxLevel || 100) - 1) }, (_, idx) => idx + 2).map(level => el('option', { value: String(level), selected: level === targetLevel }, `Lv. ${level}`))))
        ),
        el('div', { class: 'mg-list' }, rows.length ? rows.map((row, idx) => el('div', { class: 'mg-requirementAdminRow' },
          el('label', { class: 'mg-field' }, el('span', {}, 'Item'), el('select', { class: 'mg-input', onchange: e => { row.itemId = e.target.value; } }, [el('option', { value: '', selected: !row.itemId }, 'Choose item'), ...itemOptions.map(item => el('option', { value: item.id, selected: String(item.id) === String(row.itemId) }, item.name))])),
          input('Amount', row, 'amount', 'number'),
          el('button', { class: 'mg-miniBtn ghost', onclick: () => { rows.splice(idx, 1); if (!rows.length) delete levels[String(targetLevel)]; render(); } }, 'Remove')
        )) : el('div', { class: 'mg-muted' }, `No materials configured for Lv. ${targetLevel}`)),
        el('button', { class: 'mg-miniBtn primary', disabled: !itemOptions.length, onclick: () => { rows.push({ itemId: itemOptions[0]?.id || '', amount: 1 }); levels[String(targetLevel)] = rows; render(); } }, 'Add Material')
      );
    };
    const powerTab = () => {
      const hunters = (state.catalog?.hunters || state.catalog?.custom?.filter(row => row.kind === 'hunter') || []);
      const weapons = state.catalog?.sungWeapons || [];
      const hunterMax = Number(state.meta?.hunterMaxLevel || cfg.levels.maxLevel || 130);
      const weaponMax = Number(state.meta?.sungWeaponMaxLevel || 100);
      if (!adminPowerHunterId && hunters[0]) adminPowerHunterId = hunters[0].id;
      if (!adminPowerWeaponId && weapons[0]) adminPowerWeaponId = weapons[0].id;
      return el('div', { class: 'mg-list' },
        el('div', { class: 'mg-panel centerText' }, el('strong', {}, `Sung Weapons Max Lv: ${weaponMax}`), el('div', { class: 'mg-muted' }, 'Read from Admin -> Sung Weapons Settings -> Max Lv.')),
        groupPanel('Global Power Growth',
          input('Sung Base Power', cfg.levels, 'sungBasePower', 'number'),
          input('Sung Default Power Per Level', cfg.levels, 'sungPowerPerLevel', 'number'),
          input('Hunter Lv.1 Base Bonus', cfg.powerGrowth.hunters, 'defaultBasePowerBonus', 'number'),
          input('Hunter Default Power Per Level', cfg.powerGrowth.hunters, 'defaultLevelIncrement', 'number'),
          input('Hunter Default Power Per Advancement', cfg.powerGrowth.hunters, 'defaultAdvancementIncrement', 'number'),
          input('Sung Weapon Lv.1 Base Bonus', cfg.powerGrowth.sungWeapons, 'defaultBasePowerBonus', 'number'),
          input('Sung Weapon Default Power Per Level', cfg.powerGrowth.sungWeapons, 'defaultLevelIncrement', 'number'),
          input('Sung Weapon Default Power Per Advancement', cfg.powerGrowth.sungWeapons, 'defaultAdvancementIncrement', 'number')
        ),
        el('div', { class: 'mg-panel' }, el('h3', {}, 'Sung Jinwoo Power per Level'), el('small', { class: 'mg-muted' }, 'Empty field uses Sung Default Power Per Level.'), el('details', { class: 'mg-configDetails' }, el('summary', {}, 'Edit individual levels'), incrementFields(cfg.levels.sungLevelPower, cfg.levels.maxLevel, cfg.levels.sungPowerPerLevel))),
        entityPowerEditor('Hunter Power Overrides', hunters, adminPowerHunterId, (id, rerender) => { adminPowerHunterId = id; if (rerender) render(); }, cfg.powerGrowth.hunters, hunterMax),
        entityPowerEditor('Sung Weapon Power Overrides', weapons, adminPowerWeaponId, (id, rerender) => { adminPowerWeaponId = id; if (rerender) render(); }, cfg.powerGrowth.sungWeapons, weaponMax),
        weaponRequirementEditor(weapons, weaponMax)
      );
    };
    const combatTab = () => el('div', { class: 'mg-panel' },
      el('h3', {}, 'Combat Settings'),
      groupPanel('Roles',
        input('Support Same Element Bonus %', cfg.combat, 'supportSameElementBonusPct', 'number'),
        input('Support Different Element Bonus %', cfg.combat, 'supportDifferentElementBonusPct', 'number'),
        input('Elemental Stacker Same Element Bonus %', cfg.combat, 'elementalStackerSameElementBonusPct', 'number'),
        input('Elemental Buster Same Element Bonus %', cfg.combat, 'elementalBusterSameElementBonusPct', 'number')
      ),
      groupPanel('Break',
        input('Break Gauge Penalty %', cfg.combat, 'breakGaugePenaltyPct', 'number'),
        input('Breaker Team Bonus vs Break Gauge %', cfg.combat, 'breakerTeamBonusVsBreakGaugePct', 'number')
      ),
      groupPanel('Element',
        input('Element Advantage Bonus %', cfg.combat, 'elementAdvantageBonusPct', 'number')
      ),
      groupPanel('Critical',
        input('Crit Chance %', cfg.combat, 'critChancePct', 'number'),
        input('Crit Damage %', cfg.combat, 'critDamagePct', 'number')
      ),
      groupPanel('Summon Rates',
        input('SSR Rate %', cfg.summon, 'ssrRate', 'number'),
        input('SR Rate %', cfg.summon, 'srRate', 'number'),
        input('R Rate %', cfg.summon, 'rRate', 'number'),
        input('Soft Pity', cfg.summon, 'softPity', 'number'),
        input('Hard Pity', cfg.summon, 'hardPity', 'number')
      ),
      el('div', { class: 'mg-panel' },
        el('h3', {}, 'Combat Formulas'),
        textarea('Power Formula', cfg.formulas, 'power'),
        textarea('Attack Formula', cfg.formulas, 'attack'),
        textarea('Break Formula', cfg.formulas, 'break'),
        textarea('Element Formula', cfg.formulas, 'element'),
        textarea('Support Formula', cfg.formulas, 'support'),
        textarea('Buster Formula', cfg.formulas, 'buster')
      )
    );
    const itemsTab = () => el('div', { class: 'mg-panel' },
      el('h3', {}, 'Reward Items'),
      el('div', { class: 'mg-list' }, (cfg.items || []).map((item, idx) => {
        item.key = item.key || item.id || item.name || '';
        item.id = item.id || item.key;
        item.category = item.category || item.type || 'Item';
        item.type = item.type || item.category;
        return el('div', { class: 'mg-itemAdminRow' },
          adminEditItemRows.has(idx) ? input('Name', item, 'name') : el('div', { class: 'mg-field' }, el('span', {}, 'Name'), el('strong', {}, item.name || '-')),
          adminEditItemRows.has(idx) ? input('Key / ID', item, 'id') : el('div', { class: 'mg-field' }, el('span', {}, 'Key / ID'), el('strong', {}, item.id || '-')),
          adminEditItemRows.has(idx) ? imageSelect('Image', item, 'image') : el('div', { class: 'mg-field' }, el('span', {}, 'Image'), el('strong', {}, item.image ? item.image.split('/').pop() : '-')),
          adminEditItemRows.has(idx) ? input('Type / Category', item, 'type') : el('div', { class: 'mg-field' }, el('span', {}, 'Type / Category'), el('strong', {}, item.type || '-')),
          el('div', { class: 'mg-actions bossActions' },
            el('button', { class: 'mg-miniBtn ghost', onclick: () => { adminEditItemRows.has(idx) ? adminEditItemRows.delete(idx) : adminEditItemRows.add(idx); render(); } }, adminEditItemRows.has(idx) ? 'Done' : 'Edit Item'),
            el('button', { class: 'mg-miniBtn ghost', onclick: () => { cfg.items.splice(idx, 1); render(); } }, 'Delete Item')
          )
        );
      })),
      el('button', { class: 'mg-miniBtn primary', onclick: () => { cfg.items.push({ id: `item-${Date.now()}`, key: '', name: 'New Item', image: '', type: 'Item', category: 'Item' }); render(); } }, 'Add Item')
    );
    const body = {
      start: startTab,
      shop: shopTab,
      gate: gateTab,
      training: trainingTab,
      'world-boss': bossTab,
      rewards: rewardsTab,
      exp: expTab,
      power: powerTab,
      combat: combatTab,
      items: itemsTab
    }[miniAdminTab]?.() || shopTab();
    return card('Admin',
      el('div', { class: 'mg-adminAccordion' }, tabs.flatMap(label => {
        const key = tabKey(label);
        const active = miniAdminTab === key;
        return [
          el('button', { class: `mg-tab mg-adminAccordionToggle ${active ? 'active' : ''}`, 'aria-expanded': active && mobileAdminOpen, onclick: () => { mobileAdminOpen = active ? !mobileAdminOpen : true; miniAdminTab = key; render(); } }, label, icon(`mg-adminDesktopChevron fa-solid fa-chevron-${active ? 'up' : 'down'}`), icon(`mg-adminMobileChevron fa-solid fa-chevron-${active && mobileAdminOpen ? 'up' : 'down'}`)),
          active ? el('div', { class: `mg-adminAccordionBody ${mobileAdminOpen ? '' : 'mobile-collapsed'}` }, body) : null
        ];
      })),
      el('div', { class: 'mg-actions top' }, save)
    );
  }
  function current() {
    if (activeTab === 'summon') return summon();
    if (activeTab === 'shop') return shop();
    if (activeTab === 'gates') return gates();
    if (activeTab === 'training') return training();
    if (activeTab === 'boss') return boss();
    if (activeTab === 'collection') return collection();
    if (activeTab === 'presets') return presets();
    if (activeTab === 'admin') return adminPanel();
    return overview();
  }
  function styles() {
    if (document.getElementById('miniGameStyles')) return;
    document.head.append(el('style', { id: 'miniGameStyles' }, `
      .mg-page{max-width:1180px;margin:0 auto;padding:18px;color:#e5e7eb}.mg-hero{display:flex;justify-content:space-between;gap:16px;align-items:flex-end;margin-bottom:14px}.mg-title{margin:0;color:#facc15;font-size:36px;font-weight:900;letter-spacing:0}.mg-sub{margin:6px 0 0;color:#94a3b8}.mg-tabs,.mg-subtabs{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:8px;margin-bottom:14px}.mg-subtabs{grid-template-columns:repeat(2,minmax(0,1fr))}.mg-tab,.mg-btn,.mg-miniBtn{border:1px solid rgba(148,163,184,.35);background:rgba(15,23,42,.55);color:#e2e8f0;border-radius:12px;padding:9px 12px;font-weight:900;cursor:pointer;transition:background .15s ease,border-color .15s ease,box-shadow .15s ease,color .15s ease}.mg-tab.active,.mg-chip.active,.mg-selectItem.selected,.mg-pick.selected{border-color:rgba(250,204,21,.85);background:rgba(250,204,21,.12);box-shadow:0 0 0 3px rgba(250,204,21,.22);color:#fde68a}.mg-btn.primary,.mg-miniBtn.primary{border-color:rgba(250,204,21,.85);background:linear-gradient(135deg,#facc15,#eab308);color:#111827;box-shadow:0 0 0 2px rgba(250,204,21,.14),0 8px 24px rgba(250,199,0,.14)}.mg-btn:disabled,.mg-miniBtn:disabled,.mg-tab:disabled,.mg-chip:disabled,.mg-rateSlot:disabled,.mg-selectItem:disabled,.mg-pick:disabled{opacity:.5;cursor:not-allowed;transform:none}.mg-card,.mg-panel,.mg-banner{border:1px solid rgba(250,204,21,.18);background:linear-gradient(180deg,rgba(15,23,42,.86),rgba(2,6,23,.72));border-radius:8px;padding:16px;box-shadow:0 14px 34px rgba(0,0,0,.24)}.mg-card h2{margin:0 0 14px;color:#facc15}.mg-grid{display:grid;gap:10px}.mg-grid.stats{grid-template-columns:repeat(4,minmax(0,1fr))}.mg-stat{min-height:66px;border:1px solid rgba(148,163,184,.16);background:rgba(15,23,42,.62);border-radius:8px;padding:10px;display:flex;flex-direction:column;justify-content:space-between}.mg-stat span,.mg-muted,small{color:#94a3b8}.mg-stat strong{font-size:19px;color:#fff}.mg-actions{display:flex;gap:8px;flex-wrap:wrap}.mg-actions.top{margin-top:12px}.mg-split,.mg-gates,.mg-shopGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.mg-rateGrid{display:grid;gap:8px}.mg-rateGrid.cols3{grid-template-columns:repeat(3,minmax(0,1fr))}.mg-rateGrid.cols2{grid-template-columns:repeat(2,minmax(0,1fr))}.mg-rateSlot{min-height:132px;border:1px dashed rgba(250,204,21,.4);background:rgba(2,6,23,.45);color:#e5e7eb;border-radius:8px;padding:9px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;cursor:pointer;transition:background .15s ease,border-color .15s ease,box-shadow .15s ease,color .15s ease}.mg-plus{font-size:34px;color:#facc15;font-weight:900}.mg-bannerTop{display:flex;justify-content:space-between;gap:12px}.mg-pity{text-align:right}.mg-ticketLine{margin:10px 0}.mg-select{border:1px solid rgba(148,163,184,.24);background:#0f172a;color:#fff;border-radius:8px;padding:8px}.mg-list{display:grid;gap:8px;margin-top:10px}.mg-row,.mg-trainRow{display:flex;justify-content:space-between;gap:12px;align-items:center;border:1px solid rgba(148,163,184,.14);background:rgba(2,6,23,.42);border-radius:8px;padding:10px}.mg-gateLine{display:grid;grid-template-columns:90px repeat(6,1fr) 80px;gap:6px;align-items:center;margin:8px 0}.mg-item{display:grid;grid-template-columns:auto minmax(0,1fr);gap:10px;align-items:center;border:1px solid rgba(148,163,184,.18);border-radius:8px;padding:10px;background:rgba(15,23,42,.62);min-width:0}.mg-item.small{padding:8px}.mg-r{border-color:#38bdf8;background:linear-gradient(135deg,rgba(14,165,233,.16),rgba(15,23,42,.7))}.mg-sr{border-color:#a855f7;background:linear-gradient(135deg,rgba(168,85,247,.2),rgba(15,23,42,.7))}.mg-ssr{border-color:#f59e0b;background:linear-gradient(135deg,rgba(220,38,38,.24),rgba(245,158,11,.18),rgba(15,23,42,.75));box-shadow:0 0 0 1px rgba(250,204,21,.16) inset}.mg-thumb{width:62px;height:62px;border-radius:8px;object-fit:cover;background:#0f172a}.mg-icon{width:24px;height:24px;object-fit:contain}.mg-icons{display:flex;gap:5px;align-items:center;margin:4px 0}.mg-itemBody{min-width:0}.mg-itemBody strong{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.mg-resultGrid,.mg-selectList,.mg-collection{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:10px}.mg-selectItem,.mg-pick{border:1px solid rgba(148,163,184,.18);background:rgba(15,23,42,.66);color:#e5e7eb;border-radius:8px;padding:8px;text-align:left;cursor:pointer;transition:background .15s ease,border-color .15s ease,box-shadow .15s ease,color .15s ease}.mg-modal{position:fixed;inset:0;z-index:99998;background:rgba(2,6,23,.72);display:grid;place-items:center;padding:18px}.mg-modalCard{width:min(760px,96vw);max-height:88vh;overflow:auto;border:1px solid rgba(250,204,21,.22);background:#070b14;border-radius:8px;padding:16px}.mg-modalCard.wide{width:min(1060px,96vw)}.mg-modalHead{display:flex;justify-content:space-between;align-items:center}.mg-x{width:34px;height:34px;border-radius:8px;border:1px solid rgba(148,163,184,.25);background:#0f172a;color:#fff;cursor:pointer}.mg-toastHost{position:fixed;right:18px;bottom:18px;z-index:99999}
      @media(max-width:860px){.mg-page{padding:12px}.mg-hero{display:block}.mg-tabs{grid-template-columns:repeat(2,minmax(0,1fr))}.mg-grid.stats,.mg-split,.mg-gates,.mg-shopGrid,.mg-rateGrid.cols3,.mg-rateGrid.cols2{grid-template-columns:1fr}.mg-row,.mg-trainRow{align-items:stretch;flex-direction:column}.mg-gateLine{grid-template-columns:1fr repeat(3,1fr)}.mg-btn{width:100%}}
      .mg-tabs{grid-template-columns:repeat(8,minmax(0,1fr));gap:10px}.mg-tab,.mg-btn.ghost,.mg-miniBtn.ghost{border-color:rgb(51 65 85 / 0.6)}.mg-tab:not(.active){border-color:rgb(51 65 85 / 0.6);background:rgba(15,23,42,.58)}.mg-card,.mg-panel,.mg-banner{padding:20px}.mg-card h2{font-size:26px;font-weight:950}.mg-sectionHead{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:14px}.mg-overGroup{margin-top:14px}.mg-overGroup h3{margin:0 0 10px;color:#facc15}.mg-grid.stats.mini{grid-template-columns:repeat(3,minmax(0,1fr))}.mg-stat{text-align:center;align-items:center}.mg-expBar{height:12px;border-radius:999px;background:rgba(148,163,184,.18);overflow:hidden;margin:10px 0 16px}.mg-expBar span{display:block;height:100%;background:linear-gradient(90deg,#facc15,#f97316)}.mg-expBar.boss span{background:linear-gradient(90deg,#ef4444,#facc15)}.mg-actions.center{justify-content:center;align-items:center}.centerText{text-align:center}.mg-ticketPanel{max-width:280px;margin:12px auto}.mg-warn{text-align:center;color:#fbbf24;margin:10px 0}.mg-modalCard{padding:0}.mg-modalHead{position:sticky;top:0;z-index:2;background:#070b14;padding:16px;border-bottom:1px solid rgba(148,163,184,.16)}.mg-modalCard>.mg-resultWrap,.mg-modalCard>.mg-list,.mg-modalCard>.mg-selectList,.mg-modalCard>div:not(.mg-modalHead):not(.mg-modalFooter){padding:16px}.mg-modalFooter{position:sticky;bottom:0;z-index:2;background:#070b14;border-top:1px solid rgba(148,163,184,.16);padding:14px 16px;justify-content:flex-end}.mg-selectItem{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center}.mg-shopItem{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:14px;align-items:center;border:1px solid rgba(148,163,184,.16);background:rgba(15,23,42,.62);border-radius:8px;padding:14px}.mg-input{border:1px solid rgba(148,163,184,.28);background:#0f172a;color:#fff;border-radius:8px;padding:8px}.mg-shopQty{display:flex;align-items:center;justify-content:space-between;gap:12px}.mg-bossArt{height:180px;border:1px dashed rgba(250,204,21,.28);border-radius:8px;display:grid;place-items:center;font-size:28px;font-weight:950;color:#facc15;background:radial-gradient(circle at center,rgba(239,68,68,.2),rgba(15,23,42,.8));margin-bottom:14px}.mg-placeholder{border:1px dashed rgba(148,163,184,.24);border-radius:8px;padding:14px;text-align:center;color:#94a3b8}.mg-trainStats{display:grid;gap:6px;min-width:180px}.mg-finish{margin-left:auto}.mg-resultSingle{display:grid;place-items:center;min-height:260px;animation:mgReveal .22s ease-out}.mg-resultSingle .mg-item{width:min(360px,90%)}@keyframes mgReveal{from{opacity:0;transform:scale(.94)}to{opacity:1;transform:scale(1)}}.mg-ssr{box-shadow:0 0 24px rgba(250,204,21,.18),0 0 0 1px rgba(250,204,21,.22) inset}
      .mg-tabs{grid-template-columns:repeat(9,minmax(0,1fr))}.mg-page{padding:22px}.mg-card,.mg-banner,.mg-panel{margin-top:14px}.mg-itemBody small{display:block;line-height:1.4;margin-top:2px}.mg-bannerStats{display:flex;gap:12px;align-items:stretch}.mg-rateSlot.filled{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;text-align:left}.mg-rateSlot.filled .mg-thumb{grid-row:1/3}.mg-rateSlot.filled .mg-icons{grid-column:3;grid-row:1/3}.mg-resultGrid.reveal{grid-template-columns:repeat(auto-fill,minmax(150px,1fr))}.mg-resultCard{display:flex;flex-direction:column;align-items:center;text-align:center;gap:8px;min-height:230px;animation:mgReveal .2s ease-out}.mg-resultThumb{width:96px;height:116px;border-radius:8px;object-fit:cover;background:#0f172a}.mg-resultCard.bigSsr{box-shadow:0 0 36px rgba(250,204,21,.34),0 0 0 1px rgba(250,204,21,.35) inset}.mg-gateKinds{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:12px 0 16px}.mg-tab.gate-blue.active{background:#38bdf8;color:#06111c}.mg-tab.gate-purple.active{background:#a855f7;color:#fff}.mg-tab.gate-red.active{background:#ef4444;color:#fff}.mg-gateCard{display:grid;gap:8px;border:1px solid rgba(148,163,184,.18);background:rgba(15,23,42,.62);border-radius:8px;padding:14px}.mg-rank{font-size:24px;color:#facc15}.boss .mg-expBar,.mg-expBar.boss{position:relative}.mg-expBar b{position:absolute;inset:0;display:grid;place-items:center;font-size:11px;color:#fff;text-shadow:0 1px 2px #000}.bossTeamPanel{display:grid;gap:14px}.mg-field{display:grid;gap:6px;text-align:left}.mg-fieldInline{display:flex;gap:8px;align-items:center}.mg-field .mg-input{width:100%}.mg-selectItem:disabled{opacity:.45;cursor:not-allowed}.mg-shopItem small{display:block;line-height:1.5}.mg-grid.stats>.mg-field{min-height:66px;border:1px solid rgba(148,163,184,.16);background:rgba(15,23,42,.62);border-radius:8px;padding:10px}
      @media(max-width:860px){.mg-tabs{grid-template-columns:repeat(2,minmax(0,1fr))}.mg-grid.stats.mini{grid-template-columns:1fr}.mg-shopItem{grid-template-columns:1fr}.mg-modalCard>.mg-resultWrap,.mg-modalCard>.mg-list,.mg-modalCard>.mg-selectList,.mg-modalCard>div:not(.mg-modalHead):not(.mg-modalFooter){padding:12px}}
      .mg-expSpacer {height: 12px; margin: 10px 0 16px;} .mg-expBar {border: 1px solid rgba(250,204,21,.16);} .mg-overGroup .mg-stat .mg-expBar {width: 80%;min-width: 180px;max-width: 260px;}.mg-overGroup .mg-expSpacer {width: 80%;min-width: 180px;max-width: 260px;height: 12px;margin: 10px 0 16px;}.mg-banner .mg-actions.center {margin-top: 18px;}
      .mg-ssr{border-color:#ef4444;background:linear-gradient(135deg,rgba(127,29,29,.45),rgba(220,38,38,.24),rgba(15,23,42,.78));box-shadow:0 0 18px rgba(239,68,68,.22),0 0 0 1px rgba(239,68,68,.28) inset}.mg-resultCard.bigSsr{box-shadow:0 0 34px rgba(239,68,68,.45),0 0 0 1px rgba(239,68,68,.45) inset}.mg-resultGrid.reveal{grid-template-columns:repeat(10,minmax(0,1fr));gap:8px}.mg-resultCard{min-height:190px;padding:8px}.mg-resultThumb{width:74px;height:90px}.mg-resultCard strong{font-size:12px;line-height:1.2;white-space:normal;text-align:center}.mg-resultCard small{font-size:11px}
      .mg-resultCard{position:relative}.mg-advBadge{position:absolute;top:6px;right:6px;border:1px solid rgba(255,255,255,.22);background:rgba(2,6,23,.82);color:#fff;border-radius:999px;padding:3px 7px;font-size:11px;line-height:1}.mg-rewardText{color:#67e8f9!important;font-weight:800}.mg-currencyIcon{width:35px;height:35px;object-fit:contain;vertical-align:-4px;margin-right:5px}.mg-stat span{display:flex;align-items:center;justify-content:center;gap:4px}.mg-shopItem small .mg-currencyIcon{width:15px;height:15px;margin:0 2px 0 4px}
      .mg-gateAdminRow{display:grid;grid-template-columns:48px repeat(6,minmax(110px,1fr));gap:10px;align-items:end;border:1px solid rgba(148,163,184,.14);border-radius:8px;padding:10px;background:rgba(2,6,23,.35)}
      .mg-adminTabs{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}.mg-adminTabs .mg-tab{width:auto}.mg-field.check input{width:18px;height:18px}.mg-bossArt{height:260px;max-height:280px;overflow:hidden;padding:10px}.mg-bossArt img{width:100%;height:100%;max-height:240px;object-fit:contain;object-position:center;border-radius:8px}
      .mg-presetButtons{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}.mg-presetButtons .mg-btn{width:auto}.mg-presetLayout{display:grid;gap:12px}.mg-presetWeapons{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.mg-presetHunters{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.mg-rateSlot.presetSlot{width:100%;min-height:150px}.mg-rateSlot.presetSlot.filled{display:block;text-align:left}
      .mg-topStats{display:flex;gap:8px;align-items:stretch;flex-wrap:wrap}.mg-topStats .mg-stat{min-width:130px}.mg-subtabs{grid-template-columns:repeat(3,minmax(0,1fr))}.mg-rateSlot.filled{grid-template-columns:auto minmax(0,1fr) auto;align-items:center}.mg-rateSlot.filled .mg-thumb{grid-row:auto}.mg-rateName{align-self:center;min-width:0}.mg-rateName strong{white-space:normal;line-height:1.2}.mg-resultMeta{display:flex;gap:5px;align-items:center;justify-content:center;min-height:24px;flex-wrap:nowrap}.mg-resultMeta .mg-icon{width:18px;height:18px}.mg-flip{min-height:190px;perspective:800px;transform-style:preserve-3d}.mg-resultBack{min-height:190px;border:1px solid rgba(148,163,184,.25);border-radius:8px;display:grid;place-items:center;font-size:28px;font-weight:950;background:linear-gradient(135deg,rgba(15,23,42,.92),rgba(2,6,23,.82));animation:mgReveal .16s ease-out}.mg-resultBack.mg-r{color:#38bdf8}.mg-resultBack.mg-sr{color:#c084fc}.mg-resultBack.mg-ssr{color:#ef4444;box-shadow:0 0 30px rgba(239,68,68,.3)}.mg-flip.flipped{animation:mgFlip .38s cubic-bezier(.2,.8,.2,1);transform-origin:center center}@keyframes mgFlip{from{transform:rotateY(88deg);opacity:.35}55%{opacity:1}to{transform:rotateY(0);opacity:1}}.mg-resultCard.bigSsr:before{content:none}.mg-moneyLine{display:flex!important;align-items:center;justify-content:space-between;gap:10px;line-height:1.5;color:#cbd5e1}.mg-moneyLine strong{display:flex;align-items:center;gap:5px;color:#fff;white-space:nowrap}.mg-shopItem>div:first-child{display:grid;gap:4px}.mg-shopItem .mg-btn{justify-self:end}.mg-gateCard{grid-template-columns:52px minmax(0,1fr) auto;align-items:center}.mg-gateCard .mg-actions{justify-content:flex-end}.gateActive>div:first-child{display:grid;gap:4px}.disabledCard{opacity:.45!important;filter:grayscale(1);border-color:rgba(148,163,184,.22)!important;background:rgba(71,85,105,.22)!important}.mg-expBar.boss{height:18px;line-height:18px}.mg-expBar.boss b{font-size:12px;line-height:18px}.bossTeamPanel .mg-presetLayout{margin-top:4px}.mg-trainRow{align-items:stretch}.mg-card:has(.mg-trainRow) .mg-grid.stats{grid-template-columns:repeat(3,minmax(0,1fr))}
      .mg-compactStat{min-height:48px;justify-content:center}.mg-compactStat strong{display:flex;align-items:center;justify-content:center;gap:7px;font-size:18px}.mg-compactStat span{display:none}.mg-subtabs:has(button:nth-child(2):last-child){grid-template-columns:repeat(2,minmax(0,1fr))}.mg-filterBar{display:grid;grid-template-columns:2fr 1fr 1fr 1fr;gap:8px;margin:10px 0}.mg-rateSlot{min-height:88px}.mg-rateSlot.filled{min-height:76px}.mg-rateSlot.filled .mg-thumb{width:52px;height:52px}.mg-rateSlot.filled .mg-icons{display:flex;gap:4px;align-items:center}.mg-rateSlot.filled .mg-icons .mg-icon{width:30px;height:30px}.mg-moneyLine.negative strong,.mg-money.negative{color:#ef4444}.mg-bossPresetGrid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;margin-top:12px}.mg-usedLine{display:block;margin-top:4px}.mg-activityTag{color:#fbbf24!important;font-weight:900;text-align:center}.mg-btn.claim:not(.primary){background:#22c55e;color:#052e16}.mg-trainRow{display:grid;grid-template-columns:minmax(220px,1fr) minmax(220px,1fr) 150px auto}.mg-trainTime{display:grid;align-content:center;gap:6px}
      .mg-rewardGrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}.mg-rewardCard{min-height:92px;border:1px solid rgba(148,163,184,.18);background:rgba(15,23,42,.62);border-radius:8px;padding:12px;display:grid;align-content:center;justify-items:center;text-align:center;gap:8px}.mg-rewardLabel{display:flex;align-items:center;justify-content:center;gap:6px;min-height:24px;color:#cbd5e1;font-weight:800;line-height:1.15}.mg-rewardLabel span{overflow-wrap:normal}.mg-rewardCard strong{font-size:20px;color:#fff}.mg-filterPanel{display:grid;gap:10px;margin:10px 0 14px}.mg-filterChips{display:flex;gap:6px;flex-wrap:wrap}.mg-chip{border:1px solid rgba(148,163,184,.24);background:rgba(15,23,42,.62);color:#cbd5e1;border-radius:999px;padding:7px 10px;font-weight:800;cursor:pointer;transition:background .15s ease,border-color .15s ease,box-shadow .15s ease,color .15s ease}.mg-chip.active{border-color:rgba(250,204,21,.85);background:rgba(250,204,21,.12);box-shadow:0 0 0 3px rgba(250,204,21,.22);color:#fde68a}.mg-finish{display:grid;align-items:center;align-self:stretch}.mg-finish .mg-btn{align-self:center}.mg-textarea{min-height:76px;resize:vertical;width:100%}.mg-field.wide{grid-column:1/-1}.mg-manualLevels{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px;max-height:420px;overflow:auto;padding-right:4px}.bossRotationRow{display:grid;gap:10px;border:1px solid rgba(148,163,184,.14);border-radius:8px;padding:10px;background:rgba(2,6,23,.35)}.bossRotationLine{display:grid;gap:10px;align-items:end}.bossRotationLine.main{grid-template-columns:52px minmax(180px,1.35fr) minmax(100px,.7fr) minmax(120px,.8fr) minmax(170px,auto)}.bossRotationLine.extra{grid-template-columns:minmax(240px,1.6fr) minmax(160px,1fr) minmax(150px,1fr) minmax(120px,.8fr)}.bossRotationRow .mg-field{min-width:0}.bossRotationRow .mg-input{min-width:0}.bossRotationRow .mg-miniBtn{align-self:end;white-space:nowrap}.bossActions{align-items:end;justify-content:flex-end}.mg-itemAdminRow{display:grid;grid-template-columns:1fr 1fr 1.4fr 1fr minmax(170px,auto);gap:10px;align-items:end;border:1px solid rgba(148,163,184,.14);border-radius:8px;padding:10px;background:rgba(2,6,23,.35)}.mg-helpPanel p{margin:6px 0;color:#cbd5e1;line-height:1.45}
      .mg-collectionWeapon{display:grid;gap:8px;align-content:start}.mg-collectionWeapon>.mg-item{height:100%}.mg-inventoryBar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:10px 0 14px;padding:10px;border:1px solid rgba(148,163,184,.16);background:rgba(15,23,42,.5);border-radius:8px}.mg-materialChip{padding:5px 8px;border:1px solid rgba(148,163,184,.22);background:rgba(255,255,255,.06);border-radius:8px;color:#e2e8f0}.mg-materialRow{display:flex;justify-content:space-between;gap:12px;padding:10px;border:1px solid rgba(134,239,172,.28);background:rgba(34,197,94,.08);border-radius:8px}.mg-materialRow.missing{border-color:rgba(248,113,113,.35);background:rgba(239,68,68,.09);color:#fecaca}.mg-configDetails{margin-top:10px;border:1px solid rgba(148,163,184,.18);border-radius:8px;background:rgba(2,6,23,.28)}.mg-configDetails>summary{cursor:pointer;padding:11px 12px;color:#fde68a;font-weight:900}.mg-configDetails>.mg-manualLevels{padding:0 12px 12px}.mg-requirementAdminRow{display:grid;grid-template-columns:minmax(180px,1fr) minmax(110px,.35fr) auto;gap:10px;align-items:end;border:1px solid rgba(148,163,184,.14);border-radius:8px;padding:10px;background:rgba(2,6,23,.35)}
      .mg-filterToolbar{display:flex;align-items:center;gap:14px;padding:10px 12px;margin:10px 0 14px;border-radius:14px;border:1px solid rgba(100,116,139,.35);background:rgba(15,23,42,.35);flex-wrap:wrap;max-width:100%;box-sizing:border-box}.mg-filterSearch{flex:1 1 280px;width:100%;max-width:520px;min-width:0;height:38px;padding:0 14px;border-radius:12px;border:1px solid rgba(148,163,184,.35);outline:none;color:#e2e8f0;background:rgba(15,23,42,.55);font-weight:900}.mg-filterSearch:focus{border-color:rgba(250,204,21,.72);box-shadow:0 0 0 3px rgba(250,204,21,.14)}.mg-filterGroups{display:flex;align-items:center;gap:0;flex-wrap:wrap;min-width:0}.mg-filterGroup{display:flex;align-items:center;gap:8px;padding:0 12px;border-left:1px solid rgba(148,163,184,.18);min-width:0}.mg-filterGroup:first-child{border-left:0;padding-left:0}.mg-filterIcon{width:32px;height:32px;border-radius:10px;border:1px solid rgba(148,163,184,.35);background:rgba(15,23,42,.55);display:grid;place-items:center;cursor:pointer;padding:0;flex:0 0 auto;transition:background-color .15s ease,border-color .15s ease,box-shadow .15s ease}.mg-filterIcon:hover{background:rgba(255,255,255,.1);border-color:rgba(226,232,240,.34)}.mg-filterIcon.is-active{border-color:rgba(250,204,21,.85);background:rgba(250,204,21,.12);box-shadow:0 0 0 3px rgba(250,204,21,.22)}.mg-filterIcon img,.mg-filterIcon .mg-icon{width:22px;height:22px;object-fit:contain;pointer-events:none}.mg-filterIcon.rarity img{width:26px;height:26px}.mg-filterReset{height:38px;padding:0 14px;margin-left:auto;border-radius:12px;border:1px solid rgba(239,68,68,.55);background:rgba(239,68,68,.15);color:#fecaca;font-weight:900;display:flex;align-items:center;gap:8px;cursor:pointer}.mg-filterReset:hover{background:rgba(239,68,68,.25);border-color:rgba(248,113,113,.8);color:#fff}.mg-filterResetX{display:grid;place-items:center;width:20px;height:20px;border-radius:7px;background:rgba(239,68,68,.3);border:1px solid rgba(239,68,68,.55);color:#fff;font-size:14px;font-weight:900;line-height:1}
      .mg-chip{padding:6px 9px;font-size:12px}.mg-resetFilter{width:max-content}.mg-rewardAdminRow{display:grid;grid-template-columns:1.3fr 1fr 1fr auto;gap:10px;align-items:end;border:1px solid rgba(148,163,184,.14);border-radius:8px;padding:10px;background:rgba(2,6,23,.35)}
      .mg-resultCard{overflow:visible}.mg-resultImageWrap{position:relative;width:86px;height:106px;display:grid;place-items:center;overflow:visible}.mg-resultThumb{width:100%;height:100%;object-fit:contain;object-position:center;padding:7px;background:rgba(2,6,23,.45)}.mg-resultIcons{position:absolute;left:5px;top:5px;display:flex;gap:3px;z-index:3}.mg-resultIcons .mg-icon,.mg-resultIcons i{width:20px;height:20px;border-radius:50%;background:rgba(2,6,23,.78);padding:2px}.mg-advBadge{z-index:4}.mg-flip.flipped{animation:mgFlip .46s ease-out}.mg-resultCard.bigSsr{position:relative;animation:ssrPulse 1.8s ease-in-out infinite;border-color:#ef4444;overflow:hidden}.mg-resultCard.bigSsr:after{content:"";position:absolute;inset:0;border-radius:8px;pointer-events:none;background:linear-gradient(115deg,transparent 0%,rgba(255,255,255,.0) 34%,rgba(252,165,165,.26) 48%,rgba(250,204,21,.18) 55%,rgba(255,255,255,0) 68%,transparent 100%);transform:translateX(-120%);animation:ssrSweep 1.6s ease-in-out infinite}@keyframes ssrPulse{0%,100%{box-shadow:0 0 20px rgba(239,68,68,.25),0 0 0 1px rgba(239,68,68,.35) inset}50%{box-shadow:0 0 42px rgba(239,68,68,.58),0 0 0 2px rgba(248,113,113,.55) inset}}@keyframes ssrSweep{0%{transform:translateX(-120%)}55%,100%{transform:translateX(120%)}}
      @media(max-width:980px){.mg-gateAdminRow{grid-template-columns:1fr 1fr}.mg-gateAdminRow>strong{grid-column:1/-1}}
      @media(max-width:760px){.mg-presetWeapons,.mg-presetHunters,.mg-gateCard,.mg-trainRow,.bossRotationRow,.bossRotationLine.main,.bossRotationLine.extra,.mg-itemAdminRow,.mg-bossPresetGrid,.mg-requirementAdminRow{grid-template-columns:1fr}.mg-presetButtons .mg-btn,.mg-gateCard .mg-miniBtn{width:100%}.mg-topStats .mg-stat{min-width:0;flex:1 1 100%}.mg-filterChips{overflow:auto;flex-wrap:nowrap;padding-bottom:2px}.mg-bossArt{height:220px}}
      @media(max-width:760px){.mg-filterToolbar{align-items:stretch}.mg-filterSearch{max-width:none;flex-basis:100%}.mg-filterGroups{width:100%;gap:10px}.mg-filterGroup{padding:0 0 0 10px}.mg-filterGroup:first-child{padding-left:0}.mg-filterReset{margin-left:0;width:100%;justify-content:center}}
      @media(max-width:1100px){.mg-resultGrid.reveal{grid-template-columns:repeat(5,minmax(0,1fr))}}@media(max-width:640px){.mg-resultGrid.reveal{grid-template-columns:repeat(2,minmax(0,1fr))}}
      .mg-tab,.mg-chip,.mg-btn:not(.primary):not(.claim),.mg-miniBtn:not(.primary),.mg-btn.ghost,.mg-miniBtn.ghost,.mg-pick,.mg-selectItem,.mg-rateSlot{border-radius:12px;border:1px solid rgb(51 65 85 / .6);background:rgba(15,23,42,.55);color:rgb(226 232 240);font-weight:600;transition:background-color .15s ease,color .15s ease,border-color .15s ease,box-shadow .15s ease;box-shadow:none}.mg-tab{height:40px;box-sizing:border-box;display:flex;align-items:center;justify-content:center;font-size:16px}.mg-tab:not(.active):not(:disabled):hover,.mg-chip:not(.active):not(:disabled):hover,.mg-btn:not(.primary):not(.claim):not(:disabled):hover,.mg-miniBtn:not(.primary):not(:disabled):hover,.mg-pick:not(.selected):not(:disabled):hover,.mg-selectItem:not(.selected):not(:disabled):hover,.mg-rateSlot:not(:disabled):hover{background-color:rgb(30 41 59 / .5)}.mg-tab.active:not(.gate-blue):not(.gate-purple):not(.gate-red),.mg-chip.active,.mg-pick.selected,.mg-selectItem.selected,.mg-btn.primary,.mg-miniBtn.primary{background:rgb(250 204 21);color:#000;border-color:rgb(253 224 71);box-shadow:0 1px 3px rgba(0,0,0,.25)}.mg-tab.gate-blue.active{background:#38bdf8;color:#06111c;border-color:#38bdf8;box-shadow:0 1px 3px rgba(0,0,0,.25)}.mg-tab.gate-purple.active{background:#a855f7;color:#fff;border-color:#a855f7;box-shadow:0 1px 3px rgba(0,0,0,.25)}.mg-tab.gate-red.active{background:#ef4444;color:#fff;border-color:#ef4444;box-shadow:0 1px 3px rgba(0,0,0,.25)}.mg-tab.active:not(.gate-blue):not(.gate-purple):not(.gate-red):not(:disabled):hover,.mg-chip.active:not(:disabled):hover,.mg-pick.selected:not(:disabled):hover,.mg-selectItem.selected:not(:disabled):hover,.mg-btn.primary:not(:disabled):hover,.mg-miniBtn.primary:not(:disabled):hover{background:rgb(250 204 21);color:#000;border-color:rgb(253 224 71);transform:none;box-shadow:0 1px 3px rgba(0,0,0,.25)}.mg-tab.gate-blue.active:not(:disabled):hover{background:#38bdf8;color:#06111c;transform:none}.mg-tab.gate-purple.active:not(:disabled):hover{background:#a855f7;color:#fff;transform:none}.mg-tab.gate-red.active:not(:disabled):hover{background:#ef4444;color:#fff;transform:none}.mg-btn:disabled,.mg-miniBtn:disabled,.mg-tab:disabled,.mg-chip:disabled,.mg-rateSlot:disabled,.mg-selectItem:disabled,.mg-pick:disabled{transform:none}
      .mg-rateName,.mg-rateInfo{display:grid;gap:4px;min-width:0}.mg-rateName strong,.mg-rateInfo strong{min-width:0;white-space:normal;line-height:1.15}.mg-advSmall{display:inline-flex;align-items:center;justify-content:center;width:max-content;border:1px solid rgba(250,204,21,.55);background:rgba(250,204,21,.14);color:#fde68a;border-radius:999px;padding:2px 7px;font-size:11px;font-weight:900;line-height:1}.mg-resultGrid.history{grid-template-columns:repeat(5,minmax(120px,1fr))}.mg-resultGrid.history .mg-resultCard{min-height:170px}.mg-resultGrid.history .mg-resultThumb{width:76px;height:92px}@media(max-width:860px){.mg-resultGrid.history{grid-template-columns:repeat(auto-fill,minmax(130px,1fr))}}
      .mg-selectItem.selected .mg-advSmall{background:#020617;color:#facc15;border-color:#020617;box-shadow:0 1px 3px rgba(0,0,0,.35)}.mg-presetTitle{display:grid;gap:4px;margin-bottom:14px}.mg-presetTitle h3{margin:0}
      .mg-rateSlot .mg-thumb,.mg-selectItem .mg-thumb{background:transparent}.mg-infoList{display:grid;gap:10px}.mg-infoRow{border:1px solid rgba(148,163,184,.16);background:rgba(15,23,42,.62);border-radius:8px;padding:12px}.mg-infoRow strong{color:#facc15}.mg-infoRow p{margin:5px 0;color:#e2e8f0;line-height:1.4}.mg-gatePresetList{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px}.mg-gatePresetCard{display:grid;gap:12px;text-align:left;border:1px solid rgba(148,163,184,.22);background:rgba(15,23,42,.66);color:#e5e7eb;border-radius:8px;padding:12px;cursor:pointer}.mg-gatePresetCard:not(:disabled):hover{background:rgb(30 41 59 / .5);border-color:rgb(51 65 85 / .6)}.mg-gatePresetHead{display:grid;grid-template-columns:minmax(130px,1fr) repeat(3,max-content);gap:8px;align-items:center}.mg-gatePresetHead strong{color:#fff}.mg-gatePresetHead span{color:#cbd5e1;font-size:12px;white-space:nowrap}.mg-statusOk{color:#86efac}.mg-statusBad{color:#fbbf24}.mg-gatePresetCard.disabledCard{opacity:.72}.mg-gatePresetCard.disabledCard .mg-item{filter:grayscale(1);opacity:.72}@media(max-width:720px){.mg-gatePresetList{grid-template-columns:1fr}.mg-gatePresetHead{grid-template-columns:1fr}.mg-gatePresetHead span{white-space:normal}}
      .mg-collection .mg-thumb{background:transparent}.mg-resultGrid.history{grid-template-columns:repeat(5,minmax(0,1fr));grid-auto-rows:auto}.mg-resultGrid.history .mg-resultCard{min-height:170px;gap:5px;overflow:hidden}.mg-resultGrid.history .mg-resultImageWrap{height:auto;gap:4px}.mg-resultGrid.history .mg-resultIcons{position:static;display:flex;justify-content:center;flex-wrap:wrap}.mg-resultGrid.history .mg-resultIcons .mg-icon,.mg-resultGrid.history .mg-resultIcons i{width:15px;height:15px;padding:1px}.mg-resultGrid.history .mg-advBadge{top:4px;right:4px;padding:2px 6px}.mg-bossActionBar{display:grid;grid-template-columns:1fr auto 1fr;gap:10px;align-items:center;margin-top:12px}.mg-bossActionBar>.mg-btn{justify-self:center}.mg-bossActionBar .right{justify-content:flex-end}.bossRotationRow{display:grid!important;grid-template-columns:48px repeat(7,minmax(96px,1fr)) minmax(150px,auto);gap:8px;align-items:stretch}.bossRotationLine.main,.bossRotationLine.extra{display:contents!important}.bossRotationRow>.bossRotationLine.main>strong{grid-row:1 / span 2;align-self:center;color:#facc15}.bossRotationRow .mg-field{background:rgba(15,23,42,.42);border:1px solid rgba(148,163,184,.12);border-radius:8px;padding:8px;min-width:0}.bossRotationRow .mg-field span{font-size:12px;color:#94a3b8}.bossRotationRow .mg-field strong{font-size:14px;overflow-wrap:anywhere}.mg-itemAdminRow .mg-field strong{overflow-wrap:anywhere}@media(max-width:980px){.mg-bossActionBar{grid-template-columns:1fr}.mg-bossActionBar .mg-actions,.mg-bossActionBar .right{justify-content:center}.bossRotationRow{grid-template-columns:1fr!important}.bossRotationLine.main,.bossRotationLine.extra{display:grid!important;grid-template-columns:1fr}.bossRotationRow>.bossRotationLine.main>strong{grid-row:auto}}
      .mg-modalCard:has(.mg-gatePresetModal){width:min(1200px,95vw);max-width:1200px;overflow-x:hidden;overflow-y:auto}.mg-gatePresetModal{width:100%;min-width:0;box-sizing:border-box}.mg-gatePresetList{display:flex;flex-direction:column;gap:14px;width:100%;min-width:0}.mg-gatePresetCard{appearance:none;width:100%;min-width:0;display:flex;flex-direction:column;gap:12px;text-align:left;overflow:hidden;box-sizing:border-box;border:1px solid rgba(148,163,184,.22);background:rgba(15,23,42,.66);color:#e5e7eb;border-radius:8px;padding:14px;cursor:pointer}.mg-gatePresetCard:disabled{cursor:not-allowed}.mg-gatePresetCard.disabledCard{opacity:.72!important;filter:none!important;background:rgba(51,65,85,.34)!important}.mg-gatePresetHead{width:100%;min-width:0;display:grid;grid-template-columns:minmax(0,1fr) auto auto auto;gap:12px;align-items:center}.mg-gatePresetHead>*{min-width:0;overflow-wrap:anywhere}.mg-gatePresetHead span{white-space:normal}.mg-presetPreview{display:flex;flex-direction:column;gap:10px;width:100%;min-width:0}.mg-gatePresetCard .mg-presetWeapons{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;width:100%;min-width:0}.mg-gatePresetCard .mg-presetHunters{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;width:100%;min-width:0}.mg-gatePresetItem{min-width:0;min-height:78px;display:grid;grid-template-columns:58px minmax(0,1fr);gap:10px;align-items:center;overflow:hidden;border:1px solid rgba(148,163,184,.18);background:rgba(2,6,23,.38);border-radius:8px;padding:8px;box-sizing:border-box}.mg-gatePresetItem .mg-thumb{width:58px;height:58px;object-fit:contain;background:transparent}.mg-gatePresetItemBody{display:grid;gap:3px;min-width:0}.mg-gatePresetItemBody strong{white-space:normal;overflow-wrap:anywhere;line-height:1.15}.mg-gatePresetItemBody .mg-icons{margin:0;flex-wrap:wrap}.mg-gatePresetItemBody small{line-height:1.2}.mg-gatePresetItem.locked{filter:grayscale(1);opacity:.7}.mg-gatePresetItem.empty{display:grid;grid-template-columns:1fr;place-items:center;color:#facc15}.mg-gateLockLabel{width:max-content;max-width:100%;border:1px solid rgba(251,191,36,.35);background:rgba(251,191,36,.1);color:#fde68a!important;border-radius:6px;padding:2px 6px;font-weight:800}.mg-gateStars{color:#facc15!important;overflow-wrap:anywhere}@media(max-width:800px){.mg-gatePresetHead{grid-template-columns:1fr}.mg-gatePresetCard .mg-presetHunters{grid-template-columns:1fr}.mg-gatePresetCard .mg-presetWeapons{grid-template-columns:1fr}.mg-gatePresetItem{grid-template-columns:52px minmax(0,1fr)}.mg-gatePresetItem .mg-thumb{width:52px;height:52px}}
      .mg-x{width:36px;height:36px;min-width:36px;display:inline-flex;align-items:center;justify-content:center;padding:0;border-radius:8px;border:1px solid rgb(51 65 85 / .6);background:rgba(15,23,42,.55);color:#e2e8f0;transition:background-color .15s ease,border-color .15s ease,color .15s ease}.mg-x i{font-size:17px;line-height:1}.mg-x:hover{background:rgb(30 41 59 / .5);border-color:rgba(226,232,240,.34);color:#fff}.mg-gatePresetItem.mg-r{border-color:#38bdf8;background:linear-gradient(135deg,rgba(14,165,233,.16),rgba(15,23,42,.7))}.mg-gatePresetItem.mg-sr{border-color:#a855f7;background:linear-gradient(135deg,rgba(168,85,247,.2),rgba(15,23,42,.7))}.mg-gatePresetItem.mg-ssr{border-color:#ef4444;background:linear-gradient(135deg,rgba(127,29,29,.45),rgba(220,38,38,.24),rgba(15,23,42,.78));box-shadow:0 0 0 1px rgba(239,68,68,.28) inset}.mg-gatePresetItem.locked{border-color:rgba(148,163,184,.28)!important;background:rgba(71,85,105,.34)!important;box-shadow:none!important;filter:grayscale(1);opacity:.65}.mg-gatePresetItem.locked .mg-gateLockLabel{border-color:rgba(203,213,225,.28);background:rgba(15,23,42,.45);color:#e2e8f0!important}
      .mg-trainingHunterItem{grid-template-columns:auto minmax(0,1fr) auto;gap:10px;min-width:0}.mg-trainingHunterName{min-width:0;display:grid;gap:4px}.mg-trainingHunterName strong{white-space:normal;overflow-wrap:anywhere;line-height:1.2}.mg-trainingHunterName small{min-width:0}.mg-trainingHunterItem>.mg-icons{justify-self:end;flex-wrap:nowrap;margin:0}
      .mg-weaknessList{display:flex;align-items:center;justify-content:center;gap:7px;flex-wrap:wrap}.mg-weaknessChecks{display:flex;gap:7px;flex-wrap:wrap}.mg-weaknessChecks label{display:inline-flex;align-items:center;gap:4px;border:1px solid rgba(148,163,184,.18);border-radius:8px;padding:5px 7px;background:rgba(15,23,42,.55)}.mg-weaknessChecks input{width:16px;height:16px}.mg-weaknessChecks .mg-icon{width:18px;height:18px}.mg-breakGaugeStatus{display:flex;align-items:center;justify-content:center;gap:9px;margin-top:14px;border:1px solid rgba(251,191,36,.36);border-radius:8px;padding:10px 14px;background:rgba(251,191,36,.1);color:#fde68a}.mg-breakGaugeStatus.countered{border-color:rgba(34,197,94,.4);background:rgba(34,197,94,.12);color:#bbf7d0}.mg-breakGaugeStatus.penalty{border-color:rgba(239,68,68,.4);background:rgba(239,68,68,.12);color:#fecaca}.bossRotationRow{display:grid!important;grid-template-columns:minmax(170px,1.3fr) minmax(110px,.65fr) minmax(240px,1.4fr) minmax(190px,1.1fr) minmax(150px,.8fr) minmax(170px,auto)!important;gap:10px;align-items:stretch}.bossRotationRow>.mg-field{min-width:0}.bossRotationRow>.bossActions{align-self:stretch;align-items:center;justify-content:flex-end}@media(max-width:1100px){.bossRotationRow{grid-template-columns:repeat(2,minmax(0,1fr))!important}.bossRotationRow>.bossActions{grid-column:1/-1;justify-content:flex-end}}@media(max-width:700px){.bossRotationRow{grid-template-columns:1fr!important}.bossRotationRow>.bossActions{grid-column:auto;justify-content:stretch}.bossRotationRow>.bossActions .mg-miniBtn{flex:1}}
      .mg-elementChip{display:inline-flex;align-items:center;gap:5px;border:1px solid rgba(148,163,184,.25);border-radius:8px;padding:6px 8px;background:rgba(15,23,42,.55);color:#cbd5e1;cursor:pointer}.mg-elementChip .mg-icon{width:18px;height:18px}.mg-elementChip:hover{background:rgb(30 41 59 / .5);color:#fff}.mg-elementChip.active{border-color:#facc15;background:rgba(250,204,21,.16);color:#fde68a;box-shadow:0 0 0 2px rgba(250,204,21,.16)}.mg-breakGaugeStatus.disabled{border-color:rgba(148,163,184,.25);background:rgba(51,65,85,.18);color:#cbd5e1}.mg-counterAvailability{display:flex;align-items:center;justify-content:center;gap:7px;border-radius:8px;padding:8px 10px;font-weight:800}.mg-counterAvailability.available{border:1px solid rgba(34,197,94,.35);background:rgba(34,197,94,.1);color:#bbf7d0}.mg-counterAvailability.missing{border:1px solid rgba(239,68,68,.35);background:rgba(239,68,68,.1);color:#fecaca}.bossRotationRow{width:100%;max-width:100%;overflow:hidden;box-sizing:border-box;grid-template-columns:minmax(0,1.15fr) minmax(0,.65fr) minmax(0,1.4fr) minmax(0,1fr) minmax(0,.8fr) minmax(0,.95fr)!important}.bossRotationRow .mg-input,.bossRotationRow select{width:100%;max-width:100%;min-width:0;box-sizing:border-box}.bossRotationRow>.bossActions{min-width:0;align-content:center}.bossRotationRow>.bossActions .mg-miniBtn{flex:1 1 70px}@media(max-width:950px){.bossRotationRow{grid-template-columns:repeat(2,minmax(0,1fr))!important}.bossRotationRow>.bossActions{grid-column:1/-1}}@media(max-width:620px){.bossRotationRow{grid-template-columns:1fr!important}.bossRotationRow>.bossActions{grid-column:auto}}
      .mg-navigation a{text-decoration:none}.mg-desktopTabs:not(.has-admin){grid-template-columns:repeat(8,minmax(0,1fr))}.mg-mobileNav,.mg-mobilePresetSelect,.mg-mobileBossPresetSelect,.mg-breakGaugeEnabledBadge,.mg-adminMobileChevron{display:none}.mg-lastAttackToggle{display:contents}.mg-lastAttackToggle>i{display:none}.mg-filterToggle,.mg-presetSectionToggle,.mg-gateRankToggle{min-height:44px;border:1px solid rgba(148,163,184,.24);background:rgba(15,23,42,.62);color:#e2e8f0;border-radius:10px;padding:10px 12px;font-weight:900;display:flex;align-items:center;justify-content:space-between;gap:10px;cursor:pointer}.mg-filterExpandable{display:flex;align-items:center;gap:12px;flex:1 1 auto}.mg-filterSet{display:flex;align-items:center;gap:8px}.mg-filterSet>strong{display:none}.mg-presetSectionToggle,.mg-gateRankToggle{width:100%}.mg-presetSectionToggle{display:none}.mg-presetBadge{display:inline-flex;width:max-content;margin-top:5px;padding:3px 8px;border:1px solid rgba(250,204,21,.65);border-radius:999px;background:rgba(250,204,21,.14);color:#fde68a!important;font-size:12px;font-weight:900}.mg-trainingStatusBadge{display:inline-flex;width:max-content;padding:3px 8px;border:1px solid rgba(251,191,36,.45);border-radius:999px;background:rgba(251,191,36,.12);color:#fde68a;font-size:12px;font-weight:900}.mg-gateRank{border:1px solid rgba(148,163,184,.16);border-radius:10px;background:rgba(2,6,23,.28);overflow:hidden}.mg-gateRankToggle{border:0;border-radius:0}.mg-gateRank:not(.expanded) .mg-gateAdminRow{display:none}.mg-adminAccordion{display:flex;gap:8px;flex-wrap:wrap}.mg-adminAccordionToggle{width:auto!important;gap:8px}.mg-adminAccordionBody{order:2;flex:1 0 100%;width:100%;min-width:0}.mg-chanceRewardCard small{font-size:13px;color:#cbd5e1}
      @media(max-width:760px){
        .mg-page{width:100%;box-sizing:border-box;padding:16px!important;font-size:15px}.mg-card,.mg-panel,.mg-banner{box-sizing:border-box;padding:16px!important}.mg-card h2{font-size:22px}.mg-panel h3,.mg-modalHead h2{font-size:19px}.mg-sub,.mg-muted,.mg-itemBody small,.mg-field span,small{font-size:13px}
        .mg-tab,.mg-btn,.mg-miniBtn,.mg-selectItem,.mg-pick,.mg-filterToggle,.mg-presetSectionToggle,.mg-gateRankToggle{min-height:44px}.mg-input,.mg-select,.mg-filterSearch{min-height:44px;box-sizing:border-box;font-size:15px;padding-left:12px;padding-right:12px}.mg-x{width:44px;height:44px;min-width:44px}
        .mg-tabs{display:flex;overflow-x:auto;scroll-snap-type:x proximity;gap:8px;padding:0 0 8px;margin-left:0;margin-right:0}.mg-tabs .mg-tab{flex:0 0 auto;min-width:112px;scroll-snap-align:start;padding:0 14px}.mg-subtabs{gap:8px}.mg-subtabs .mg-tab{font-size:14px;padding:0 8px}
        .mg-hero{margin-bottom:12px}.mg-title{font-size:28px}.mg-topStats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));width:100%;margin-top:12px}.mg-topStats .mg-stat{min-width:0!important;min-height:58px;padding:8px}.mg-compactStat strong{font-size:14px;gap:4px}.mg-compactStat .mg-currencyIcon{width:24px;height:24px}
        .mg-filterToolbar{position:relative;display:grid!important;grid-template-columns:minmax(0,1fr) auto;gap:8px;padding:12px!important}.mg-filterSearch{position:sticky;top:60px;z-index:4;width:100%;max-width:none!important}.mg-filterToggle{display:flex}.mg-filterExpandable{display:none;grid-column:1/-1}.mg-filterExpandable.expanded{display:grid;gap:12px}.mg-filterGroups{display:grid!important;gap:12px!important}.mg-filterSet{display:grid;gap:8px}.mg-filterSet>strong{display:block;font-size:13px;color:#cbd5e1}.mg-filterGroup{padding:0!important;border:0!important;display:flex;gap:8px;flex-wrap:wrap}.mg-filterIcon{width:44px;height:44px}.mg-filterReset{min-height:44px;width:100%;margin:0!important;justify-content:center}
        .mg-collection{grid-template-columns:1fr;gap:12px}.mg-collection>.mg-item,.mg-collectionWeapon>.mg-item{padding:14px;gap:14px}.mg-collection .mg-thumb,.mg-collectionWeapon .mg-thumb{width:78px;height:78px}.mg-itemBody{display:grid;gap:4px}.mg-itemBody strong{font-size:16px;white-space:normal}.mg-itemBody .mg-icons{margin:2px 0}.mg-collectionWeapon{gap:8px}.mg-inventoryBar{min-height:0;margin:8px 0 12px;padding:10px 12px}.mg-inventoryBar>strong{width:100%}
        .mg-presetButtons{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.mg-presetButtons .mg-btn{width:100%;min-height:44px;padding:8px}.mg-rateSlot.presetSlot{min-height:96px}.mg-presetSectionToggle{display:flex}.mg-presetEditorSection{border:1px solid rgba(148,163,184,.16);border-radius:10px;overflow:hidden}.mg-presetSectionContent{display:none!important;padding:10px}.mg-presetEditorSection.expanded .mg-presetSectionContent{display:grid!important}.mg-presetLayout{gap:10px}
        .mg-modal{padding:12px 16px;align-items:stretch}.mg-modalCard,.mg-modalCard.wide,.mg-modalCard:has(.mg-gatePresetModal){width:100%;max-width:none;max-height:calc(100dvh - 24px);height:auto;margin:auto;display:flex;flex-direction:column;overflow:hidden}.mg-modalHead{flex:0 0 auto;position:sticky;top:0;z-index:20;padding:12px 16px}.mg-modalCard>.mg-resultWrap,.mg-modalCard>.mg-list,.mg-modalCard>.mg-selectList,.mg-modalCard>div:not(.mg-modalHead):not(.mg-modalFooter){overflow-y:auto;padding:16px;overscroll-behavior:contain}.mg-modalCard .mg-filterToolbar{position:sticky;top:0;z-index:10;background:#070b14;margin-top:0}.mg-modalFooter{flex:0 0 auto;padding:12px 16px}.mg-selectList{grid-template-columns:1fr;gap:10px}.mg-selectItem{padding:10px 12px}
        .mg-rewardGrid{grid-template-columns:1fr;gap:10px}.mg-rewardCard{min-height:104px;padding:16px;gap:8px}.mg-rewardCard strong{font-size:24px}.mg-rewardLabel{font-size:15px}.mg-chanceRewardCard small{font-size:14px}
        .mg-adminAccordion{display:block}.mg-adminAccordionToggle{width:100%!important;margin-bottom:8px;justify-content:space-between;padding:0 14px}.mg-adminAccordionBody{margin:0 0 10px}.mg-adminAccordionBody>.mg-panel,.mg-adminAccordionBody>.mg-list{margin-top:0}.mg-adminAccordionBody .mg-grid.stats{grid-template-columns:1fr}.mg-rewardAdminRow,.mg-gateAdminRow{grid-template-columns:1fr!important;padding:12px;gap:10px}.mg-rewardAdminRow .mg-miniBtn{width:100%}.mg-gateKinds{grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}.mg-gateKinds .mg-tab{font-size:13px;padding:0 5px}.mg-gateRank{margin-bottom:8px}.bossRotationRow{padding:12px!important;gap:8px!important}.bossRotationRow .mg-field{padding:8px}.bossActions .mg-miniBtn{min-height:44px}.bossRotationRow.collapsed{grid-template-columns:1fr 1fr!important}.bossRotationRow.collapsed>.mg-field:nth-child(4),.bossRotationRow.collapsed>.mg-field:nth-child(5){display:none}.bossRotationRow.collapsed>.bossActions{grid-column:1/-1}.bossRotationRow.collapsed>.bossActions .mg-miniBtn:nth-child(2){display:none}
        #scrollToTopBtn{right:20px!important;bottom:24px!important;margin:0!important}
      }
      @media(min-width:761px){.mg-filterToggle{display:none}.mg-filterExpandable{display:flex!important}.mg-presetEditorSection{display:contents}.mg-presetSectionContent{display:grid!important}}
      @media(max-width:640px){
        .mg-topStats{width:100%;max-width:100%;grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:5px!important;overflow:hidden}.mg-topStats .mg-stat{width:auto;min-width:0!important;max-width:100%;padding:6px 3px!important;overflow:hidden}.mg-topStats .mg-stat strong{min-width:0;max-width:100%;font-size:11px!important;gap:2px!important;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.mg-topStats .mg-currencyIcon{width:18px!important;height:18px!important;margin-right:1px!important;flex:0 0 auto}
        .mg-desktopTabs{display:none!important}.mg-mobileNav{display:block;position:relative;margin-bottom:14px}.mg-mobileMenuButton{width:100%;min-height:48px;display:grid;grid-template-columns:auto auto minmax(0,1fr) auto;align-items:center;gap:10px;border:1px solid rgba(250,204,21,.35);border-radius:12px;padding:0 14px;background:rgba(15,23,42,.82);color:#fff;font-size:15px;font-weight:900;text-align:left}.mg-mobileMenuButton span{text-align:right;color:#facc15;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.mg-mobileNavSheet{position:absolute;left:0;right:0;top:calc(100% + 8px);z-index:40;display:grid;gap:6px;max-height:min(65dvh,520px);overflow-y:auto;overscroll-behavior:contain;padding:10px;border:1px solid rgba(250,204,21,.3);border-radius:12px;background:#070b14;box-shadow:0 18px 40px rgba(0,0,0,.5)}.mg-mobileNavItem{width:100%;min-height:46px;justify-content:flex-start!important;padding:0 14px!important}.mg-mobileNavItem.active{background:#facc15!important;color:#111827!important}
        .mg-mobilePresetSelect{display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:10px;margin:10px 0 12px}.mg-mobilePresetSelect>span{font-size:13px;color:#cbd5e1;font-weight:900}.mg-presetButtons{display:none!important}.mg-mobilePresetSelect .mg-input{width:100%}.mg-rateSlot.presetSlot,.mg-rateSlot.presetSlot.filled{min-height:76px!important;padding:8px!important}.mg-rateSlot.presetSlot.filled>.mg-item{display:grid;grid-template-columns:58px minmax(0,1fr);gap:10px;align-items:center;padding:0;border:0;background:transparent;box-shadow:none}.mg-rateSlot.presetSlot .mg-thumb{width:58px!important;height:58px!important}.mg-rateSlot.presetSlot .mg-itemBody{gap:2px}.mg-rateSlot.presetSlot .mg-itemBody strong{font-size:14px;line-height:1.2}.mg-rateSlot.presetSlot .mg-itemBody small{font-size:12px}.mg-rateSlot.presetSlot .mg-icons{grid-column:auto;grid-row:auto}.mg-rateSlot.presetSlot .mg-activityTag{margin:4px 0 0;text-align:left;width:max-content;padding:2px 7px;border-radius:999px;background:rgba(251,191,36,.12);border:1px solid rgba(251,191,36,.35)}
        .mg-trainingPicker{padding:0!important}.mg-trainingPicker>.mg-filterToolbar{margin:0;border-width:0 0 1px;border-radius:0}.mg-trainingPicker>.mg-selectList{padding:12px 16px}.mg-trainingHunterItem{grid-template-columns:64px minmax(0,1fr) auto!important;gap:10px;padding:10px!important;min-height:84px}.mg-trainingHunterItem .mg-thumb{width:64px;height:64px}.mg-trainingHunterName{gap:3px}.mg-trainingHunterName strong{font-size:15px;line-height:1.2}.mg-trainingHunterName small{font-size:12px}.mg-trainingHunterItem>.mg-icons{display:flex;flex-direction:row;gap:4px}.mg-trainingHunterItem>.mg-icons .mg-icon{width:24px;height:24px}.mg-trainingHunterItem.disabledCard{opacity:.62!important}
        .mg-card>.mg-sectionHead{display:grid;grid-template-columns:1fr 1fr;gap:8px}.mg-card>.mg-sectionHead h2{grid-column:1/-1;margin-bottom:0}.mg-card>.mg-sectionHead .mg-actions{display:contents}.mg-card>.mg-sectionHead .mg-btn{width:100%;padding:8px;font-size:13px}.mg-card>.mg-subtabs{grid-template-columns:1fr 1fr!important}.mg-banner{padding:14px!important}.mg-bannerTop{display:grid;gap:8px}.mg-bannerTop h3{margin:0}.mg-bannerStats{display:grid;grid-template-columns:1fr 1fr;gap:8px}.mg-bannerStats .mg-stat{min-height:54px;padding:8px}.mg-pity{display:grid;place-items:center;border:1px solid rgba(148,163,184,.16);border-radius:8px;padding:8px}.mg-rateGrid{grid-template-columns:1fr!important;gap:8px}.mg-rateSlot.filled{min-height:68px!important;padding:7px 10px}.mg-rateSlot.filled .mg-thumb{width:48px;height:48px}.mg-rateSlot.filled .mg-icons .mg-icon{width:24px;height:24px}.mg-banner>.mg-actions.center{display:grid;grid-template-columns:1fr;gap:8px}.mg-banner>.mg-actions.center .mg-btn,.mg-banner>.mg-actions.center .mg-select{width:100%;min-height:46px}
        .mg-modal{padding:12px}.mg-modalCard,.mg-modalCard.wide,.mg-modalCard:has(.mg-gatePresetModal){width:calc(100vw - 24px)!important;max-width:calc(100vw - 24px)!important;max-height:calc(100dvh - 24px)!important}.mg-modalCard>.mg-resultWrap,.mg-modalCard>.mg-list,.mg-modalCard>.mg-selectList,.mg-modalCard>div:not(.mg-modalHead):not(.mg-modalFooter){min-width:0;box-sizing:border-box}.mg-modalFooter{position:sticky;bottom:0;z-index:20;display:grid;grid-template-columns:1fr}.mg-modalFooter .mg-btn{width:100%}
        .mg-adminDesktopChevron{display:none}.mg-adminMobileChevron{display:inline-block}.mg-adminAccordionBody.mobile-collapsed{display:none}.mg-adminAccordionBody .mg-field,.mg-adminAccordionBody .mg-input,.mg-adminAccordionBody select,.mg-adminAccordionBody textarea{width:100%;min-width:0;max-width:100%;box-sizing:border-box}.mg-rewardAdminRow,.mg-gateAdminRow{display:grid!important;grid-template-columns:1fr!important;width:100%;min-width:0;box-sizing:border-box}.mg-rewardAdminRow>.mg-miniBtn,.mg-rewardAdminRow>.mg-btn,.mg-requirementAdminRow>.mg-miniBtn,.mg-itemAdminRow .bossActions{grid-column:1;width:100%;margin-top:2px}.mg-gateRank .mg-gateAdminRow{grid-template-columns:1fr!important}.mg-gateRankToggle{min-height:46px}
        .mg-breakGaugeEnabledBadge{display:flex;align-items:center;justify-content:center;gap:8px;margin-top:12px;padding:10px 12px;border:1px solid rgba(250,204,21,.5);border-radius:9px;background:rgba(250,204,21,.12);color:#fde68a;font-weight:900}.mg-lastAttackToggle{width:100%;min-height:44px;display:flex;align-items:center;justify-content:space-between;border:0;background:transparent;color:#facc15;padding:0;text-align:left}.mg-lastAttackToggle>i{display:inline-block}.mg-lastAttackToggle h3{margin:0}.mg-lastAttackBody{display:none}.mg-lastAttack.expanded .mg-lastAttackBody{display:block;margin-top:10px}.mg-lastAttackBody .mg-grid.stats{grid-template-columns:1fr}
        .mg-elementInfo,.mg-bossHpNumbers{display:none!important}.mg-bossStats{grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:8px}.mg-bossStats .mg-stat{min-height:56px;padding:8px}.mg-bossWeaknessStat{grid-column:1/-1;min-height:54px!important}.mg-bossWeaknessStat strong{font-size:15px}.mg-bossWeaknessStat .mg-weaknessList{gap:5px}.mg-mobileBossPresetSelect{display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:10px;margin:12px 0}.mg-mobileBossPresetSelect>span{font-size:13px;color:#cbd5e1;font-weight:900}.mg-mobileBossPresetSelect .mg-input{width:100%}.mg-bossPresetGrid{display:none!important}.mg-bossActionBar{display:grid!important;grid-template-columns:1fr!important;gap:8px}.mg-bossActionBar>.mg-actions,.mg-bossActionBar>.mg-btn,.mg-bossActionBar .mg-actions .mg-btn{width:100%;justify-content:stretch}.mg-bossActionBar .mg-btn{width:100%}.mg-bossActionBar>.mg-btn{order:1}.mg-bossActionBar>.mg-actions:first-child{order:2}.mg-bossActionBar>.mg-actions.right{order:3}
        .mg-collection{gap:8px}.mg-collection>.mg-item,.mg-collectionWeapon>.mg-item{min-height:76px;padding:9px 10px;grid-template-columns:60px minmax(0,1fr);gap:10px;align-items:center}.mg-collection .mg-thumb,.mg-collectionWeapon .mg-thumb{width:60px;height:60px}.mg-collection .mg-itemBody,.mg-collectionWeapon .mg-itemBody{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:2px 8px;align-items:center}.mg-collection .mg-itemBody>strong,.mg-collectionWeapon .mg-itemBody>strong{grid-column:1/-1;font-size:14px}.mg-collection .mg-itemBody>.mg-icons,.mg-collectionWeapon .mg-itemBody>.mg-icons{grid-column:2;grid-row:2/span 3;display:flex;flex-wrap:nowrap}.mg-collection .mg-itemBody>.mg-icons .mg-icon,.mg-collectionWeapon .mg-itemBody>.mg-icons .mg-icon{width:21px;height:21px}.mg-collection .mg-itemBody small,.mg-collectionWeapon .mg-itemBody small{grid-column:1;font-size:11px;line-height:1.2}
      }
      `));
  }
  function render() {
    if (!isMiniRoute()) { stopTimer(); return; }
    const root = document.getElementById('content');
    if (!root) return;
    styles();
    if (!state) {
      root.replaceChildren(el('div', { class: 'mg-page' }, card('Mini Game', el('div', { class: 'mg-muted' }, 'Loading...'))));
      return;
    }
    root.replaceChildren(el('div', { class: 'mg-page' }, el('div', { class: 'mg-hero' }, el('div', {}, el('h1', { class: 'mg-title' }, 'SLA Hub RPG'), el('p', { class: 'mg-sub' }, 'Hunter Growth System')), el('div', { class: 'mg-topStats' }, currencyPill('Gold', fmt(state.gold)), currencyPill('Essence', fmt(state.essence)), tpPill(fmt(state.computed?.teamPower || 0)))), tabs(), current()));
  }
  function tickDynamic() {
    let shouldRender = false;
    document.querySelectorAll('[data-countdown]').forEach(node => {
      const value = timeLeft(node.getAttribute('data-countdown'));
      node.textContent = value;
      if (value === 'Ready') shouldRender = true;
    });
    document.querySelectorAll('[data-training-exp]').forEach(node => {
      const start = Date.parse(node.getAttribute('data-start-at') || '');
      const duration = Math.max(1, Number(node.getAttribute('data-duration-ms') || 1));
      const expected = Number(node.getAttribute('data-expected-exp') || 0);
      const level = Number(node.getAttribute('data-base-level') || 1);
      const base = Number(node.getAttribute('data-base-exp') || 0);
      const ratio = Math.max(0, Math.min(1, (Date.now() - start) / duration));
      const preview = addExpPreview({ level, exp: base }, Math.floor(expected * ratio));
      node.textContent = `Lv. ${preview.level} | Current EXP: ${fmt(preview.exp)}/${fmt(preview.need)}`;
    });
    document.querySelectorAll('[data-training-remaining]').forEach(node => {
      const start = Date.parse(node.getAttribute('data-start-at') || '');
      const duration = Math.max(1, Number(node.getAttribute('data-duration-ms') || 1));
      const expected = Number(node.getAttribute('data-expected-exp') || 0);
      const ratio = Math.max(0, Math.min(1, (Date.now() - start) / duration));
      const remaining = Math.max(0, expected - Math.floor(expected * ratio));
      node.textContent = `Expected remaining: +${fmt(remaining)}`;
    });
    document.querySelectorAll('[data-training-card-exp]').forEach(node => {
      const start = Date.parse(node.getAttribute('data-start-at') || '');
      const duration = Math.max(1, Number(node.getAttribute('data-duration-ms') || 1));
      const expected = Number(node.getAttribute('data-expected-exp') || 0);
      const level = Number(node.getAttribute('data-base-level') || 1);
      const base = Number(node.getAttribute('data-base-exp') || 0);
      const ratio = Math.max(0, Math.min(1, (Date.now() - start) / duration));
      const preview = addExpPreview({ level, exp: base }, Math.floor(expected * ratio));
      node.textContent = `EXP ${fmt(preview.exp)}/${fmt(preview.need)}`;
    });
    document.querySelectorAll('[data-training-bar]').forEach(node => {
      const start = Date.parse(node.getAttribute('data-start-at') || '');
      const duration = Math.max(1, Number(node.getAttribute('data-duration-ms') || 1));
      const expected = Number(node.getAttribute('data-expected-exp') || 0);
      const level = Number(node.getAttribute('data-base-level') || 1);
      const base = Number(node.getAttribute('data-base-exp') || 0);
      const ratio = Math.max(0, Math.min(1, (Date.now() - start) / duration));
      const preview = addExpPreview({ level, exp: base }, Math.floor(expected * ratio));
      const pct = Math.max(0, Math.min(100, (preview.exp / preview.need) * 100));
      const fill = node.querySelector('span');
      if (fill) fill.style.width = `${pct}%`;
    });
    if (shouldRender && ['gates'].includes(activeTab)) render();
  }
  window.addEventListener('sla:admin-hide-changed', () => {
    if (!state || !isMiniRoute()) return;
    if (adminButtonsHidden() && activeTab === 'admin') saveActiveTab('overview');
    mobileMenuOpen = false;
    render();
  });
  window.__mini_game_mount = async function __mini_game_mount() {
    stopTimer(); state = null; render();
    try {
      await refresh();
      if (state?.meta?.isAdmin) request(API.bossImages).then(x => { bossImages = Array.isArray(x.files) ? x.files : []; render(); }).catch(() => {});
      timer = setInterval(() => { if (!isMiniRoute()) return stopTimer(); tickDynamic(); }, 1000);
    } catch (e) {
      const root = document.getElementById('content');
      if (root) { styles(); root.replaceChildren(el('div', { class: 'mg-page' }, card('Mini Game', el('div', { class: 'mg-muted' }, e.message || 'Could not load mini game.')))); }
    }
  };
})();
