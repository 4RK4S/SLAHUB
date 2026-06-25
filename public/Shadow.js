'use strict';

/**
 * Shadow.js - Responsive Admin + Mobile-friendly My List + Growth preloading
 *
 * ✅ Includes:
 * - Builds grid + Coming soon panel
 * - My list (desktop + mobile)
 * - Army Level bar
 * - Admin panel (Shadows order + Weapon global + Dropdowns GLOBAL)
 *
 * ✅ IMPORTANT:
 * - Shadow Weapons are GLOBAL (server JSON)
 *   - public: GET  /api/public/shadow-weapons
 *   - admin : POST /api/admin/shadow-weapons
 *
 * ✅ NEW CHANGE:
 * - Dropdowns (Ranks/GrowthMax/ArmamentMax) are GLOBAL now (server JSON)
 *   - public: GET  /api/public/shadows-dropdowns
 *   - admin : POST /api/admin/shadows-dropdowns
 */

(function () {

  function forceDarkModule() {
    try {
      const root = document.documentElement;
      root.classList.remove('light');
      root.classList.add('dark');
      root.dataset.theme = 'dark';
      if (document.body) {
        document.body.classList.remove('light');
        document.body.classList.add('dark');
        document.body.style.colorScheme = 'dark';
      }
    } catch {}
  }

  // --------------------------
  // Tiny helpers
  // --------------------------
  const qs = (sel, root = document) => root.querySelector(sel);

  function basePath() {
    const p = location.pathname || '';
    return (p === '/slahub' || p.startsWith('/slahub/')) ? '/slahub' : '';
  }

  function url(p) {
    const b = basePath();
    const path = p.startsWith('/') ? p : `/${p}`;
    return `${b}${path}`;
  }

  function cdnySafe(u, w) {
    try {
      if (typeof window.cdny === 'function') return window.cdny(u, w);
    } catch {}
    return u || '';
  }

  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);

    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null) continue;

      if (k === 'class') node.className = v;
      else if (k === 'style') node.setAttribute('style', v);
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
      else if (typeof v === 'boolean') {
        if (v) node.setAttribute(k, '');
      } else node.setAttribute(k, v);
    }

    for (const ch of children) {
      if (ch == null) continue;
      node.append(typeof ch === 'string' ? document.createTextNode(ch) : ch);
    }
    return node;
  }

  function toast(msg) {
    if (typeof window.showToast === 'function') return window.showToast(msg);
    console.log('[toast]', msg);
  }

  // --------------------------
  // Shared UI helpers
  // --------------------------
  function slcBtnClass(active, extra = '') {
    const base =
      'h-10 rounded-xl border text-base font-semibold transition-colors ' +
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400/50 ' +
      'disabled:opacity-50 disabled:cursor-not-allowed';
    const on = 'bg-yellow-400 text-black border-yellow-400';
    const off = 'bg-glass text-slate-200 border-white/10 hover:bg-white/10 hover:text-white';
    return (base + ' ' + (active ? on : off) + (extra ? ' ' + extra : '')).trim();
  }

  function slcChipClass(active, extra = '') {
    const base =
      'h-9 px-3 rounded-full border text-sm font-semibold transition-colors ' +
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400/50 ' +
      'disabled:opacity-50 disabled:cursor-not-allowed';
    const on = 'bg-yellow-400 text-black border-yellow-400';
    const off = 'bg-glass text-slate-200 border-white/10 hover:bg-white/10 hover:text-white';
    return (base + ' ' + (active ? on : off) + (extra ? ' ' + extra : '')).trim();
  }


  // ✅ Tailwind CDN sometimes needs a refresh after dynamic DOM inject
  function refreshTailwindSoon() {
    try {
      const tw = window.tailwind;
      if (tw && typeof tw.refresh === 'function') {
        try { tw.refresh(); } catch {}
        requestAnimationFrame(() => { try { tw.refresh(); } catch {} });
        setTimeout(() => { try { tw.refresh(); } catch {} }, 30);
      }
    } catch {}
  }

  function isLoggedInUser() {
    const me = window.STATE?.me;
    return !!(me && (me.id || me.discordId));
  }

  /**
   * Smoothly swap image WITHOUT “blank moment”.
   * - preload next
   * - once loaded: fade out current -> swap -> fade in
   */
  function smoothSwapImg(imgEl, nextSrc) {
    if (!imgEl) return;
    const cur = imgEl.getAttribute('src') || '';
    if (!nextSrc || cur === nextSrc) return;

    const tmp = new Image();
    tmp.onload = () => {
      imgEl.style.opacity = '0';
      imgEl.style.filter = 'blur(2px)';
      setTimeout(() => {
        imgEl.src = nextSrc;
        requestAnimationFrame(() => {
          imgEl.style.opacity = '1';
          imgEl.style.filter = 'blur(0px)';
        });
      }, 90);
    };
    tmp.src = nextSrc;
  }

  function ensureSmallShadowUrl(src) {
    const u = String(src || '');
    if (!u) return '';
    if (/_Small\.[a-z0-9]+$/i.test(u)) return u;
    return u.replace(/(\.[a-z0-9]+)(?:[?#].*)?$/i, '_Small$1');
  }

  function makeImageNumberSelect({ value = 0, max = 15, imgFor, onChange, disabled = false }) {
    const wrap = el('div', { class: `shadow-img-select ${disabled ? 'disabled' : ''}` });
    const btn = el('button', { class: 'shadow-img-select-btn', type: 'button', disabled });
    const menu = el('div', { class: 'shadow-img-select-menu', style: 'display:none' });

    function closeMenu() { menu.style.display = 'none'; wrap.classList.remove('open'); }
    function openMenu() { if (disabled) return; menu.style.display = 'block'; wrap.classList.add('open'); }
    function syncButton(v) {
      btn.innerHTML = '';
      btn.append(
        el('img', { class: 'shadow-img-select-preview', src: cdnySafe(imgFor(v), 96), alt: String(v), loading: 'lazy', decoding: 'async' }),
        el('span', { class: 'shadow-img-select-value' }, String(v)),
        el('span', { class: 'shadow-img-select-caret' }, '▾')
      );
    }

    for (let i = 0; i <= max; i++) {
      const item = el('button', { class: 'shadow-img-select-item', type: 'button' },
        el('img', { class: 'shadow-img-select-item-icon', src: cdnySafe(imgFor(i), 96), alt: String(i), loading: 'lazy', decoding: 'async' }),
        el('span', { class: 'shadow-img-select-item-text' }, String(i))
      );
      item.addEventListener('click', () => {
        value = i;
        syncButton(value);
        closeMenu();
        onChange?.(value);
      });
      menu.append(item);
    }

    btn.addEventListener('click', () => {
      if (wrap.classList.contains('open')) closeMenu();
      else openMenu();
    });

    document.addEventListener('mousedown', (ev) => {
      if (!wrap.contains(ev.target)) closeMenu();
    });

    syncButton(value);
    wrap.append(btn, menu);
    return wrap;
  }

  // --------------------------
  // Modal helper (local)
  // --------------------------
  function ensureShadowsModal() {
    if (document.getElementById('shadows-modal-css')) return;

    const s = document.createElement('style');
    s.id = 'shadows-modal-css';
    s.textContent = `
      .sm-backdrop{position:fixed;inset:0;display:none;align-items:center;justify-content:center;z-index:9999;background:rgba(2,6,23,.55);backdrop-filter:blur(2px)}
      .sm-modal{width:min(760px,92vw);border-radius:1rem;border:1px solid rgba(148,163,184,.28);background:rgba(2,6,23,.92);color:#e2e8f0;box-shadow:0 18px 60px rgba(0,0,0,.55);overflow:hidden}
      .sm-hd{padding:14px 16px;border-bottom:1px solid rgba(148,163,184,.20);font-weight:900;letter-spacing:.2px}
      .sm-bd{padding:16px;max-height:65vh;overflow:auto}
      .sm-ft{padding:12px 16px;border-top:1px solid rgba(148,163,184,.20);display:flex;gap:.5rem;justify-content:flex-end}
      .sm-btn{height:40px;padding:0 14px;border-radius:12px;border:1px solid rgba(148,163,184,.28);background:rgba(15,23,42,.55);color:#e2e8f0;cursor:pointer;font-weight:900}
      .sm-btn.ghost{background:transparent}
    `;
    document.head.appendChild(s);

    const root = document.createElement('div');
    root.id = 'shadows-modal-root';
    root.className = 'sm-backdrop';
    root.innerHTML = `
      <div class="sm-modal">
        <div class="sm-hd" id="smTitle"></div>
        <div class="sm-bd" id="smBody"></div>
        <div class="sm-ft">
          <button class="sm-btn ghost" id="smClose" type="button">CLOSE</button>
        </div>
      </div>
    `;
    document.body.appendChild(root);

    function hide() {
      root.style.display = 'none';
      const bd = document.getElementById('smBody');
      if (bd) bd.innerHTML = '';
    }

    function show(title, bodyBuilder) {
      const t = document.getElementById('smTitle');
      if (t) t.textContent = title || '';

      const bd = document.getElementById('smBody');
      if (bd) {
        bd.innerHTML = '';
        const built = (typeof bodyBuilder === 'function') ? bodyBuilder() : null;
        if (built) bd.append(built);
      }

      root.style.display = 'flex';
      const close = document.getElementById('smClose');
      if (close) close.onclick = hide;
    }

    root.addEventListener('click', (e) => { if (e.target === root) hide(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hide(); });

    window.__shadows_hideModal = hide;
    window.__shadows_showModal = show;
  }

  function shadowsShowModal(title, bodyBuilder) {
    ensureShadowsModal();
    window.__shadows_showModal?.(title, bodyBuilder);
  }

  // --------------------------
  // Admin helpers
  // --------------------------
  const LS_HIDE_ADMIN_KEY = 'sla_hide_admin_buttons';

  function isAdminUser() {
    return !!(window.STATE && window.STATE.isAdmin);
  }

  function getHideAdminButtons() {
    try { return localStorage.getItem(LS_HIDE_ADMIN_KEY) === '1'; } catch { return false; }
  }

  function isAdminTabVisible() {
    return isAdminUser() && !STATE.ui.hideAdminButtons;
  }

  window.addEventListener('sla:admin-hide-changed', (e) => {
    try {
      const hide = !!e?.detail?.hide;
      STATE.ui.hideAdminButtons = hide;
      if (STATE.subtab === 'admin' && !isAdminTabVisible()) setSubtab('builds');
      render();
    } catch {}
  });

  async function fetchJson(u, opt) {
    const r = await fetch(u, opt);
    const j = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, data: j };
  }


  // --------------------------
  // Local pictures helpers (/picture/*)
  // --------------------------
  const __PIC_CACHE = new Map();

  function isCloudinaryUrl(u) {
    return /cloudinary\.com/i.test(String(u || ''));
  }

  function normNameForMatch(s) {
    return String(s || '')
      .toLowerCase()
      .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  function basenameNoExt(p) {
    const t = String(p || '').split('?')[0].split('#')[0];
    const base = t.split('/').pop() || t;
    return base.replace(/\.[a-z0-9]+$/i, '');
  }

  function localPictureUrl(category, file) {
    const c = String(category || '').split('/').map(encodeURIComponent).join('/');
    const f = String(file || '').split('/').map(encodeURIComponent).join('/');
    return url(`/picture/${c}/${f}`);
  }

  async function listPictures(category) {
    const key = String(category || '');
    if (__PIC_CACHE.has(key)) return __PIC_CACHE.get(key);
    try {
      const out = await fetchJson(url(`/api/admin/pictures/list?category=${encodeURIComponent(key)}`), {
        credentials: 'include', cache: 'no-store'
      });
      if (!out.ok) throw new Error(out?.data?.error || `HTTP ${out.status}`);
      const arr = Array.isArray(out?.data?.items) ? out.data.items : (Array.isArray(out?.data) ? out.data : []);
      const items = arr.map(it => {
        if (typeof it === 'string') {
          return { name: it, path: localPictureUrl(key, it) };
        }
        const name = String(it?.name || it?.file || it?.filename || it?.key || '').trim();
        const path = String(it?.url || it?.path || (name ? localPictureUrl(key, name) : '')).trim();
        return name ? { name, path } : null;
      }).filter(Boolean);
      __PIC_CACHE.set(key, items);
      return items;
    } catch (e) {
      console.warn('listPictures failed', key, e);
      __PIC_CACHE.set(key, []);
      return [];
    }
  }

  function guessShadowLocalImages(shadowName, shadowPics) {
    const target = normNameForMatch(shadowName);
    if (!target) return { image: '', image_build: '' };

    const scoreOne = (it) => {
      const b = basenameNoExt(it?.name || it?.path || '');
      const n = normNameForMatch(b);
      if (!n) return -1;
      let score = 0;
      if (n === target) score += 100;
      if (n.includes(target)) score += 70;
      if (target.includes(n)) score += 40;
      const toksN = new Set(n.split(' ').filter(Boolean));
      const toksT = target.split(' ').filter(Boolean);
      for (const t of toksT) if (toksN.has(t)) score += 5;
      if (/build/.test(n)) score += 8;
      if (/portrait|icon/.test(n)) score -= 2;
      return score;
    };

    const sorted = [...(shadowPics || [])].sort((a,b)=>scoreOne(b)-scoreOne(a));
    const usable = sorted.filter(x => scoreOne(x) >= 20);

    let image = '';
    let image_build = '';
    for (const it of usable) {
      const b = normNameForMatch(basenameNoExt(it?.name || ''));
      if (!image) image = it.path;
      if (!image_build && /build/.test(b)) image_build = it.path;
    }
    if (!image_build) image_build = image;
    return { image, image_build };
  }

function guessLocalPictureByName(name, pics, opts = {}) {
  const target = normNameForMatch(name);
  if (!target) return '';
  const prefer = String(opts.prefer || '').toLowerCase();
  const avoid = String(opts.avoid || '').toLowerCase();
  let best = null;
  let bestScore = -1;
  for (const it of (pics || [])) {
    const b = basenameNoExt(it?.name || it?.path || '');
    const n = normNameForMatch(b);
    if (!n) continue;
    let score = 0;
    if (n === target) score += 120;
    if (n.includes(target)) score += 80;
    if (target.includes(n)) score += 45;
    const toksN = new Set(n.split(' ').filter(Boolean));
    const toksT = target.split(' ').filter(Boolean);
    for (const t of toksT) if (toksN.has(t)) score += 6;
    if (prefer && n.includes(prefer)) score += 10;
    if (avoid && n.includes(avoid)) score -= 10;
    if (score > bestScore) { bestScore = score; best = it; }
  }
  return bestScore >= 20 ? (best?.path || '') : '';
}


  // --------------------------
  // Global order
  // --------------------------
  async function loadGlobalShadowsOrder() {
    try {
      const r = await fetch(url('/api/global/order?dataset=shadows'), { cache: 'no-store', credentials: 'include' });
      if (!r.ok) return [];
      const j = await r.json().catch(() => ({}));
      return Array.isArray(j?.order) ? j.order : [];
    } catch { return []; }
  }

  function applyOrderToShadows(list, order) {
    const ord = Array.isArray(order) ? order : [];
    const map = new Map();
    ord.forEach((name, idx) => map.set(String(name), idx));

    const copy = [...(list || [])];
    copy.sort((a, b) => {
      const ia = map.has(a.name) ? map.get(a.name) : 1e9;
      const ib = map.has(b.name) ? map.get(b.name) : 1e9;
      if (ia != ib) return ia - ib;
      return String(a.name || '').localeCompare(String(b.name || ''));
    });
    return copy;
  }

  async function saveGlobalShadowsOrder(order) {
    const out = await fetchJson(url('/api/global/order'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ dataset: 'shadows', order: Array.isArray(order) ? order : [] })
    });
    if (!out.ok) throw new Error(out?.data?.error || `HTTP ${out.status}`);
    return true;
  }

  // --------------------------
  // ✅ GLOBAL DROPDOWN CONFIG (NEW)
  // --------------------------
  const DEFAULT_CONFIG = {
    ranks: [
      { name: "Don't own", max: 0 },
      { name: "Common", max: 5 },
      { name: "Elite", max: 7 },
      { name: "Knight", max: 9 },
      { name: "Elite Knight", max: 11 },
      { name: "General", max: 13 }
    ],
    growthMax: 15,
    armamentMax: 5
  };

  function sanitizeConfig(input) {
    try {
      const j = input && typeof input === 'object' ? input : {};
      const ranks = Array.isArray(j.ranks) ? j.ranks : DEFAULT_CONFIG.ranks;

      const growthMax = Number.isFinite(+j.growthMax)
        ? Math.max(1, Math.min(99, +j.growthMax))
        : DEFAULT_CONFIG.growthMax;

      const armamentMax = Number.isFinite(+j.armamentMax)
        ? Math.max(1, Math.min(10, +j.armamentMax))
        : DEFAULT_CONFIG.armamentMax;

      const safeRanks = [];
      for (const r of ranks) {
        const name = String(r?.name || '').trim();
        if (!name) continue;
        const max = Number.isFinite(+r?.max) ? Math.max(0, Math.min(999, +r.max)) : 0;
        safeRanks.push({ name, max });
      }
      if (!safeRanks.find(x => x.name === "Don't own")) safeRanks.unshift({ name: "Don't own", max: 0 });

      return { ranks: safeRanks, growthMax, armamentMax };
    } catch {
      return structuredClone(DEFAULT_CONFIG);
    }
  }

  async function loadDropdownConfigBase() {
    if (STATE.dropdownConfigBase) return STATE.dropdownConfigBase;

    try {
      const r = await fetch(url('/api/public/shadows-dropdowns'), { cache: 'no-store' });
      if (!r.ok) {
        STATE.dropdownConfigBase = structuredClone(DEFAULT_CONFIG);
        return STATE.dropdownConfigBase;
      }
      const j = await r.json().catch(() => null);
      STATE.dropdownConfigBase = sanitizeConfig(j);
      return STATE.dropdownConfigBase;
    } catch {
      STATE.dropdownConfigBase = structuredClone(DEFAULT_CONFIG);
      return STATE.dropdownConfigBase;
    }
  }

  async function saveDropdownConfigGlobal(cfg) {
    const safe = sanitizeConfig(cfg);
    const out = await fetchJson(url('/api/admin/shadows-dropdowns'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ config: safe })
    });
    if (!out.ok) throw new Error(out?.data?.error || `HTTP ${out.status}`);
    const saved = sanitizeConfig(out?.data?.config || out?.data || safe);
    return saved;
  }

  function getConfig() {
    return STATE.dropdownConfigBase || structuredClone(DEFAULT_CONFIG);
  }

  function rankOptionsFromConfig() {
    return getConfig().ranks.map(r => r.name);
  }

  function rankMaxMapFromConfig() {
    const m = {};
    for (const r of getConfig().ranks) m[r.name] = +r.max || 0;
    return m;
  }

  function growthOptionsFromConfig() {
    const n = Math.max(1, +getConfig().growthMax || 15);
    return ["Don't own", ...Array.from({ length: n }, (_, i) => String(i + 1))];
  }

  function armamentOptionsFromConfig() {
    const n = Math.max(1, +getConfig().armamentMax || 5);
    return ["Don't own", ...Array.from({ length: n + 1 }, (_, i) => String(i))];
  }

  // --------------------------
  // Growth image map 0..15
  // --------------------------
  const GROWTH_IMG = {
    0:  url('/picture/Growth/0.png'),
    1:  url('/picture/Growth/1_1.png'),
    2:  url('/picture/Growth/1_2.png'),
    3:  url('/picture/Growth/1_3.png'),
    4:  url('/picture/Growth/2_1.png'),
    5:  url('/picture/Growth/2_2.png'),
    6:  url('/picture/Growth/2_3.png'),
    7:  url('/picture/Growth/3_1.png'),
    8:  url('/picture/Growth/3_2.png'),
    9:  url('/picture/Growth/3_3.png'),
    10: url('/picture/Growth/4_1.png'),
    11: url('/picture/Growth/4_2.png'),
    12: url('/picture/Growth/4_3.png'),
    13: url('/picture/Growth/5_1.png'),
    14: url('/picture/Growth/5_2.png'),
    15: url('/picture/Growth/5_3.png')
  };

  function growthToNum(v) {
    if (!v || v === "Don't own") return 0;
    const n = parseInt(v, 10);
    if (Number.isNaN(n)) return 0;
    return Math.max(0, Math.min(15, n));
  }

  function growthToUrl(v) {
    const n = growthToNum(v);
    return GROWTH_IMG[n] || GROWTH_IMG[0];
  }

  // Preload all growth images once
  let __growthPrefetched = false;
  function prefetchGrowthImages() {
    if (__growthPrefetched) return;
    __growthPrefetched = true;
    try {
      const urls = Object.values(GROWTH_IMG).filter(Boolean);
      for (const u of urls) {
        const img = new Image();
        img.decoding = 'async';
        img.loading = 'eager';
        img.src = u;
      }
    } catch {}
  }

  // --------------------------
  // Rank -> URL suffix handling
  // --------------------------
  function rankSuffix(rank) {
    if (!rank || rank === "Don't own") return '';
    if (rank === 'Elite Knight') return '_Elite_Knight';
    return '_' + String(rank).replace(/\s+/g, '_');
  }

  function applyRankToUrl(originalUrl, rank) {
    const u = String(originalUrl || '');
    if (!u) return '';
    const suf = rankSuffix(rank);
    const stripped = u.replace(/_(Common|Elite|Knight|Elite_Knight|General)(?=(_Small)?\.[a-z0-9]+$)/i, '');
    if (!suf) return stripped;
    return stripped.replace(/(?=(_Small)?\.[a-z0-9]+$)/i, suf);
  }

  // --------------------------
  // Assets
  // --------------------------
  const ARM_BACK  = url('/picture/Shadow/Additional/Armament_Advancement_Back.png');
  const ARM_FRONT = url('/picture/Shadow/Additional/Armament_Advancement_Front.png');

  // --------------------------
  // CSS injection
  // --------------------------
  function injectLocalStyles() {
    if (document.getElementById('shadows-module-style')) return;

    const s = document.createElement('style');
    s.id = 'shadows-module-style';

    s.textContent = `
      .builds-grid{
        display:grid;
        gap:12px;
        grid-template-columns: repeat(auto-fill, minmax(160px,1fr));
      }

      .builds-card{
        position:relative;
        border-radius:16px;
        overflow:hidden;
        border:1px solid rgba(100,116,139,.35);
        box-shadow: 0 6px 16px rgba(0,0,0,.12);
        aspect-ratio: 3 / 4;
        cursor:pointer;
        transition: transform .12s ease, box-shadow .12s ease;
        outline: none;
        background: linear-gradient(180deg, rgba(88,28,135,.35) 0%, rgba(168,85,247,.10) 55%, rgba(2,6,23,.55) 100%);
      }
      .builds-card:hover{ transform: translateY(-2px); box-shadow: 0 10px 22px rgba(0,0,0,.18); }
      .builds-card:active{ transform: translateY(0px) scale(0.99); }

      .builds-card .portrait{ position:absolute; inset:0; width:100%; height:100%; object-fit:cover; }
      .builds-card .name{
        position:absolute; left:0; right:0; bottom:0;
        padding:10px 12px; text-align:center;
        font-weight:700; z-index:2;
        color:#e2e8f0;
        text-shadow: 0 1px 2px rgba(0,0,0,.55);
        background: linear-gradient(to top, rgba(2,6,23,.75) 0%, rgba(2,6,23,.35) 60%, rgba(2,6,23,0) 100%);
        backdrop-filter: blur(2px);
      }
      .builds-card-wrap{ position:relative; width:100%; height:100%; z-index:1; }

      .armybar{
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:12px;
        padding:12px 14px;
        border-radius:14px;
        border:1px solid rgba(148,163,184,.22);
        background: rgba(2,6,23,.35);
        box-shadow: inset 0 1px 0 rgba(255,255,255,.06);
      }
      .armybar-left{ display:flex; align-items:center; gap:12px; min-width:0; }
      .armybar-text{ display:flex; flex-direction:column; gap:2px; min-width:0; }
      .armybar-title{ font-weight:950; letter-spacing:.2px; font-size:18px; color:#e2e8f0; line-height:1.15; }
      .armybar-sub{ font-weight:700; font-size:12px; color:rgba(148,163,184,.95); line-height:1.25; }

      .armybar-level{
        display:flex;
        align-items:center;
        gap:8px;
        padding:7px 12px;
        border-radius: 999px;
        border:1px solid rgba(168,85,247,.35);
        background: rgba(88,28,135,.22);
        color:#f1f5f9;
        font-weight: 950;
        white-space:nowrap;
        flex: 0 0 auto;
      }

      .armybar-right{ display:flex; align-items:center; gap:10px; flex-wrap:wrap; justify-content:flex-end; }

      .armybtn{
        height: 40px;
        padding: 0 12px;
        border-radius: 12px;
        border: 1px solid rgba(148,163,184,.28);
        background: rgba(15,23,42,.55);
        color: #e2e8f0;
        cursor: pointer;
        font-weight: 950;
        transition: transform .08s ease, box-shadow .12s ease;
      }
      .armybtn:hover{ transform: translateY(-1px); box-shadow: 0 10px 20px rgba(0,0,0,.15); }
      .armybtn.active{ background: rgba(255,255,255,.92); color: #0f172a; border-color: rgba(226,232,240,.8); }

      .ddl{
        height: 40px;
        padding: 0 10px;
        border-radius: 12px;
        border:1px solid rgba(148,163,184,.28);
        background: rgba(255,255,255,.95);
        color: #0f172a;
        font-weight: 900;
        outline:none;
        text-align:center;
        max-width: 100%;
      }
      .dark .ddl{
        background: rgba(15,23,42,.65);
        color: #e2e8f0;
        border-color: rgba(148,163,184,.22);
      }

      /* ✅ Rank + Growth wider so "Don't own" never cuts */
      .col-rank .ddl{ width: 168px; min-width: 168px; }
      .col-growth .ddl{ width: 150px; min-width: 150px; }

      .numinput{
        height: 40px;
        width: 110px;
        padding: 0 10px;
        border-radius: 12px;
        border:1px solid rgba(148,163,184,.28);
        background: rgba(255,255,255,.95);
        color: #0f172a;
        font-weight: 950;
        outline:none;
        text-align:center;
        max-width: 100%;
      }
      .dark .numinput{
        background: rgba(15,23,42,.65);
        color: #e2e8f0;
        border-color: rgba(148,163,184,.22);
      }

      /* ============================
         ADMIN SUBTABS (FIX)
         ============================ */
      .admintabs{
        display:flex;
        gap:8px;
        flex-wrap:wrap;
        margin: 0 0 12px 0;
        padding: 10px;
        border-radius: 16px;
        border: 1px solid rgba(148,163,184,.22);
        background: rgba(255,255,255,.75);
      }
      .dark .admintabs{
        background: rgba(2,6,23,.35);
        border-color: rgba(148,163,184,.22);
      }

      .admintab{
        height: 40px;
        padding: 0 14px;
        border-radius: 14px;
        border: 1px solid rgba(148,163,184,.28);
        background: rgba(15,23,42,.08);
        color: #0f172a;
        font-weight: 950;
        cursor: pointer;
        transition: transform .08s ease, box-shadow .12s ease, background .12s ease;
      }
      .dark .admintab{
        background: rgba(15,23,42,.55);
        color: #e2e8f0;
        border-color: rgba(148,163,184,.22);
      }

      .admintab:hover{
        transform: translateY(-1px);
        box-shadow: 0 10px 20px rgba(0,0,0,.12);
      }

      .admintab.active{
        background: rgba(15,23,42,.92);
        color: #fff;
        border-color: rgba(226,232,240,.55);
      }
      .dark .admintab.active{
        background: rgba(255,255,255,.92);
        color: #0f172a;
        border-color: rgba(226,232,240,.75);
      }

      /* ============================
         SHADOW ROW - BASE STYLES
         ============================ */
      .shadow-row{
        display:grid;
        align-items:center;
        justify-items:center;
        column-gap:12px;
        row-gap:10px;
        padding: 12px;
        border-radius: 16px;
        border: 1px solid rgba(148,163,184,.18);
        background: rgba(255,255,255,.92);
        width: 100%;
        min-width: 0;
      }
      .dark .shadow-row{
        background: rgba(2,6,23,.35);
        border-color: rgba(148,163,184,.22);
      }

      /* ✅ Bulk edit row (Edit All) */
      .shadow-row.bulk{
        border-color: rgba(168,85,247,.35) !important;
        box-shadow: 0 0 0 1px rgba(168,85,247,.10), 0 10px 24px rgba(0,0,0,.12);
        position: relative;
      }
      .dark .shadow-row.bulk{
        background: rgba(88,28,135,.18) !important;
      }

      .shadow-img{
        width: 64px;
        height: 64px;
        border-radius: 16px;
        overflow:hidden;
        border:1px solid rgba(148,163,184,.22);
        background: rgba(15,23,42,.25);
      }
      .shadow-img img{ width:100%; height:100%; object-fit:cover; }

      .shadow-name{
        font-weight: 950;
        font-size: 14px;
        color: #0f172a;
        text-align:center;
        line-height:1.15;
        background: transparent;
        border:none;
        cursor:pointer;
        padding:0;
        overflow:hidden;
        text-overflow:ellipsis;
        white-space:nowrap;
        justify-self:center;
        width: 100%;
        min-width: 0;
      }
      .dark .shadow-name{ color:#e2e8f0; }

      .cell-text{
        font-weight: 900;
        font-size: 12.5px;
        color: rgba(15,23,42,.86);
        overflow:hidden;
        text-overflow:ellipsis;
        white-space:nowrap;
        text-align:center;
        width: 100%;
        min-width: 0;
      }
      .dark .cell-text{ color: rgba(226,232,240,.95); }

      .weapon-img{
        width: 58px;
        height: 58px;
        border-radius: 16px;
        object-fit:cover;
        border:1px solid rgba(148,163,184,.18);
        background: rgba(15,23,42,.25);
        flex: 0 0 auto;
      }

      .weapon-cell{
        display:flex;
        align-items:center;
        justify-content:center;
        gap:10px;
        width: 100%;
        min-width: 0;
      }
      .weapon-name{
        text-align:left;
        max-width: 100%;
        min-width: 0;

        white-space: normal !important;
        overflow: hidden;
        text-overflow: ellipsis;

        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;

        line-height: 1.15;
      }

      .growth-img{
        width: 42px;
        height: 42px;
        border-radius: 14px;
        object-fit: cover;
        border:1px solid rgba(148,163,184,.18);
        background: rgba(15,23,42,.20);
        transition: opacity .14s ease, filter .14s ease;
      }
      .growth-edit{
        display:flex;
        align-items:center;
        justify-content:center;
        gap:8px;
        width: 100%;
        min-width: 0;
      }

      .adv{
        display:flex;
        align-items:center;
        justify-content:center;
        gap:6px;
      }
      .adv-slot{
        width: 20px;
        height: 20px;
        position:relative;
        border-radius: 7px;
        overflow:hidden;
        flex: 0 0 auto;
      }
      .adv-slot img{
        position:absolute;
        inset:0;
        width:100%;
        height:100%;
        object-fit:cover;
      }
      .adv-front{ opacity: 0; }
      .adv-slot.active .adv-front{ opacity: 1; }

      .col-img, .col-name, .col-rank, .col-growth, .col-weapon, .col-arm {
        width: 100%;
        min-width:0;
        display:flex;
        justify-content:center;
      }

      /* ✅ DESKTOP ONLY (PC: zawsze 1 rząd, zawsze 6 kolumn) */
      @media (min-width: 901px){
        .shadow-row{
          grid-template-columns:
            64px
            minmax(140px, 1fr)
            minmax(140px, 180px)
            minmax(150px, 190px)
            minmax(220px, 2fr)
            minmax(120px, 160px)
          ;
        }

        .shadow-row > .col-img    { grid-column: 1; }
        .shadow-row > .col-name   { grid-column: 2; }
        .shadow-row > .col-rank   { grid-column: 3; }
        .shadow-row > .col-growth { grid-column: 4; }
        .shadow-row > .col-weapon { grid-column: 5; }
        .shadow-row > .col-arm    { grid-column: 6; }

        .shadow-row > .col-img,
        .shadow-row > .col-name,
        .shadow-row > .col-rank,
        .shadow-row > .col-growth,
        .shadow-row > .col-weapon,
        .shadow-row > .col-arm{
          grid-row: 1 !important;
        }
      }


      @media (max-width: 520px){
        .armybar{
          display:grid;
          grid-template-columns:minmax(0,1fr);
          align-items:stretch;
          gap:12px;
          padding:12px;
        }
        .armybar-left{
          display:grid;
          grid-template-columns:minmax(0,1fr);
          align-items:start;
          justify-items:start;
          gap:10px;
          width:100%;
        }
        .armybar-text{
          width:100%;
          min-width:0;
        }
        .armybar-title{
          width:100%;
          max-width:none;
          font-size:16px;
          line-height:1.05;
          white-space:normal;
          overflow-wrap:anywhere;
        }
        .armybar-sub{
          width:100%;
          max-width:none;
          font-size:11px;
          line-height:1.15;
          white-space:normal;
          overflow-wrap:anywhere;
        }
        .armybar-level{
          align-self:flex-start;
          padding:6px 12px;
        }
        .armybar-right{
          display:grid;
          grid-template-columns:1fr 1fr;
          gap:10px;
          width:100%;
          justify-content:stretch;
        }
        .armybar-right > .numinput{
          grid-column:1 / -1;
          width:100%;
        }
        .armybar-right > .armybtn{
          width:100%;
          min-width:0;
          padding:0 10px;
        }
      }

      /* ✅ MOBILE (jak wcześniej, ale Rank/Growth wyśrodkowane) */
      @media (max-width: 900px){
        .shadow-row{
          grid-template-columns: 64px 1fr;
          grid-template-areas:
            "img name"
            "rank rank"
            "growth growth"
            "weapon weapon"
            "arm arm";
          justify-items:stretch;
          align-items:stretch;
          padding: 12px;
        }

        .col-img{ grid-area: img; justify-content:flex-start; }
        .col-name{ grid-area: name; justify-content:flex-start; align-items:center; padding-left:8px; }

        .col-rank{
          grid-area: rank;
          justify-content:space-between;
          align-items:center;
          padding: 8px 10px;
          border-radius: 14px;
          border:1px solid rgba(148,163,184,.18);
          background: rgba(15,23,42,.10);
        }
        .dark .col-rank{ background: rgba(15,23,42,.25); border-color: rgba(148,163,184,.20); }

        .col-growth{
          grid-area: growth;
          justify-content:space-between;
          align-items:center;
          padding: 8px 10px;
          border-radius: 14px;
          border:1px solid rgba(148,163,184,.18);
          background: rgba(15,23,42,.10);
        }
        .dark .col-growth{ background: rgba(15,23,42,.25); border-color: rgba(148,163,184,.20); }

        .col-weapon{
          grid-area: weapon;
          justify-content:flex-start;
          padding: 8px 10px;
          border-radius: 14px;
          border:1px solid rgba(148,163,184,.18);
          background: rgba(15,23,42,.10);
        }
        .dark .col-weapon{ background: rgba(15,23,42,.25); border-color: rgba(148,163,184,.20); }

        .col-arm{
          grid-area: arm;
          justify-content:space-between;
          align-items:center;
          padding: 8px 10px;
          border-radius: 14px;
          border:1px solid rgba(148,163,184,.18);
          background: rgba(15,23,42,.10);
        }
        .dark .col-arm{ background: rgba(15,23,42,.25); border-color: rgba(148,163,184,.20); }

        .col-rank::before{ content:"Rank"; font-weight:950; font-size:12px; opacity:.9; }
        .col-growth::before{ content:"Growth"; font-weight:950; font-size:12px; opacity:.9; }
        .col-weapon::before{ content:"Weapon"; font-weight:950; font-size:12px; opacity:.9; margin-right:10px; white-space:nowrap; }
        .col-arm::before{ content:"Armament"; font-weight:950; font-size:12px; opacity:.9; }

        .shadow-name{ text-align:left; font-size:15px; }
        .cell-text{ text-align:right; }

        .weapon-cell{ justify-content:flex-end; gap:10px; }
        .weapon-name{ text-align:left; }
        .growth-edit{ justify-content:flex-end; }
        .ddl{ width: min(240px, 70vw); }

        /* ✅ FIX: Rank + Growth nie przyklejone do prawej */
        .col-rank,
        .col-growth{
          justify-content: center !important;
        }

        .col-rank .cell-text,
        .col-growth .cell-text{
          text-align: center !important;
          width: 100%;
        }

        .col-rank .ddl,
        .col-growth .ddl{
          margin: 0 auto !important;
        }

        .col-growth .growth-edit{
          justify-content: center !important;
          width: 100%;
        }

        /* (opcjonalnie) optycznie jeszcze bardziej na środek */
        .col-rank,
        .col-growth{
          padding-left: 58px; /* miejsce na label Rank/Growth po lewej */
          position: relative;
        }
        .col-rank::before,
        .col-growth::before{
          position: absolute;
          left: 12px;
        }
      }

      /* --------------------------
         Card-style My list
      -------------------------- */
      .shadow-progress-grid{display:grid;gap:14px;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));width:100%}
      .shadow-progress-card{
        position:relative;border-radius:18px;border:1px solid rgba(148,163,184,.26);
        background:linear-gradient(0deg,rgba(30,41,59,.82) 0%, rgba(49,46,129,.48) 100%);
        box-shadow:0 12px 28px rgba(0,0,0,.18);padding:16px;overflow:visible;
      }
      .shadow-progress-card::before{content:'';position:absolute;inset:0;border-radius:inherit;pointer-events:none;box-shadow:inset 0 1px 0 rgba(255,255,255,.06)}
      .shadow-progress-bulk-card{
        border-color:rgba(168,85,247,.35);
        box-shadow:0 0 0 1px rgba(168,85,247,.10), 0 12px 28px rgba(0,0,0,.18);
        background:linear-gradient(180deg,rgba(88,28,135,.24) 0%, rgba(15,23,42,.82) 100%);
      }
      .shadow-progress-head{display:flex;gap:14px;align-items:center;min-width:0}
      .shadow-progress-avatar{width:72px;height:72px;border-radius:18px;overflow:hidden;display:grid;place-items:center;background:rgba(15,23,42,.52);border:1px solid rgba(148,163,184,.22);flex:0 0 auto}
      .shadow-progress-avatar img{width:100%;height:100%;object-fit:cover}
      .shadow-progress-head .shadow-progress-name{margin:0;text-align:left}
      .shadow-progress-growth-edit{display:flex;align-items:center;justify-content:center}
      .shadow-img-select{position:relative;display:inline-block;max-width:100%}
      .shadow-img-select.disabled{opacity:.65}
      .shadow-img-select-btn{min-height:46px;min-width:164px;display:flex;align-items:center;justify-content:center;gap:10px;border-radius:12px;border:1px solid rgba(148,163,184,.24);background:rgba(15,23,42,.72);color:#e2e8f0;padding:8px 36px 8px 12px;font-weight:900;position:relative}
      .shadow-img-select-preview{height:34px;max-width:48px;object-fit:contain;flex:0 0 auto}
      .shadow-img-select-value{min-width:18px;text-align:center}
      .shadow-img-select-caret{position:absolute;right:12px;top:50%;transform:translateY(-50%);font-size:12px;opacity:.9}
      .shadow-img-select-menu{position:absolute;left:0;right:0;top:calc(100% + 6px);z-index:50;background:rgba(2,6,23,.98);border:1px solid rgba(148,163,184,.24);border-radius:12px;box-shadow:0 12px 28px rgba(0,0,0,.35);padding:8px;max-height:260px;overflow:auto}
      .shadow-img-select-item{width:100%;display:flex;align-items:center;gap:10px;border:0;background:transparent;color:#e2e8f0;padding:8px 10px;border-radius:10px;font-weight:800;text-align:left}
      .shadow-img-select-item:hover{background:rgba(255,255,255,.06)}
      .shadow-img-select-item-icon{height:28px;max-width:42px;object-fit:contain;flex:0 0 auto}
      .shadow-img-select-item-text{min-width:18px;text-align:center}
      .shadow-progress-meta{min-width:0;display:grid;gap:8px}
      .shadow-progress-name{font-size:18px;font-weight:900;color:#e2e8f0;line-height:1.15}
      .shadow-progress-sub{font-size:12px;font-weight:800;color:rgba(226,232,240,.72)}
      .shadow-progress-badges{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
      .shadow-progress-badge{height:36px;min-width:36px;padding:0 13px;border-radius:999px;display:inline-flex;align-items:center;justify-content:center;border:1px solid rgba(148,163,184,.22);background:rgba(255,255,255,.04);color:#f8d574;font-weight:900;font-size:13px}
      .shadow-progress-badge.weapon{padding:0;width:41px}
      .shadow-progress-badge.weapon img{width:26px;height:26px;object-fit:contain}
      .shadow-progress-stats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:14px}
      .shadow-progress-stat{min-width:0;border-radius:14px;border:1px solid rgba(148,163,184,.18);background:rgba(255,255,255,.04);padding:12px;display:grid;gap:10px}
      .shadow-progress-stat-full{grid-column:1 / -1}
      .shadow-progress-stat-label{font-size:12px;font-weight:900;color:rgba(226,232,240,.72);text-transform:uppercase;text-align:center;display:flex;align-items:center;justify-content:center}
      .shadow-progress-stat-value{font-size:22px;font-weight:900;color:#e2e8f0;display:flex;align-items:center;justify-content:center;text-align:center;min-height:42px;min-width:0;overflow:visible}
      .shadow-progress-stat-value.dontown{font-size:16px}
      .shadow-progress-growth-img{display:block;height:50px;max-width:100%;object-fit:contain;margin:0 auto}
      .shadow-progress-growth-edit,.shadow-progress-stat .shadow-img-select{width:100%;display:flex;align-items:center;justify-content:center;gap:10px;flex-wrap:wrap}
      .shadow-progress-stat .shadow-img-select{position:relative}
      .shadow-progress-stat .shadow-img-select-btn{min-width:0;width:min(100%,140px);margin:0 auto}
      .shadow-progress-stat .shadow-img-select-menu{left:50%;right:auto;transform:translateX(-50%);width:max-content;min-width:140px;max-width:min(220px,calc(100vw - 32px))}
      .shadow-progress-arm-wrap{justify-content:center}
      .shadow-progress-weapon-card{margin-top:16px;padding-top:16px;border-top:1px solid rgba(148,163,184,.16)}
      .shadow-progress-weapon-head{display:flex;gap:14px;align-items:center}
      .shadow-progress-weapon-thumb{width:72px;height:72px;border-radius:18px;overflow:hidden;display:grid;place-items:center;background:rgba(15,23,42,.52);border:1px solid rgba(148,163,184,.22);flex:0 0 auto}
      .shadow-progress-weapon-thumb img{width:100%;height:100%;object-fit:cover}
      .shadow-progress-weapon-meta{min-width:0;display:grid;gap:8px}
      .shadow-progress-weapon-name{font-size:16px;font-weight:900;color:#e2e8f0;line-height:1.15}
      .shadow-progress-select{width:100%;min-width:0;height:42px;border-radius:10px;border:1px solid rgba(148,163,184,.24);background:rgba(15,23,42,.72);color:#e2e8f0;padding:0 36px 0 12px;font-weight:900;text-align:center}
      .shadow-progress-select.narrow{max-width:180px;justify-self:center}
      .shadow-progress-empty{font-size:16px;color:rgba(226,232,240,.72);font-weight:900;text-align:center}

      @media (max-width: 900px){
        .shadow-progress-grid{grid-template-columns:1fr}
      }
      @media (max-width: 520px){
        .shadow-progress-card{padding:14px}
        .shadow-progress-avatar,.shadow-progress-weapon-thumb{width:64px;height:64px;border-radius:16px}
        .shadow-progress-name{font-size:17px}
        .shadow-progress-stat .shadow-img-select-btn{width:min(100%,132px);padding-right:34px}
        .shadow-progress-stats{grid-template-columns:repeat(2,minmax(0,1fr))}
        .shadow-progress-stat-full{grid-column:1 / -1}
      }
    `;

    document.head.appendChild(s);
  }

  // --------------------------
  // State
  // --------------------------
  const LS_SUBTAB = 'shadows.ui.subtab';
  const LS_ADMIN_SUBTAB = 'shadows.ui.adminSubtab';

  const STATE = {
    subtab: (localStorage.getItem(LS_SUBTAB) || 'builds'),
    adminSubtab: (localStorage.getItem(LS_ADMIN_SUBTAB) || 'shadows'),
    adminWeaponSelected: null,

    data: { shadows: [] },

    collection: {
      loaded: false,
      loading: false,
      saving: false,
      shadows: {},
      shadowArmyLevel: null
    },

    bulk: {
      rank: "Don't own",
      growth: "Don't own",
      armament: "Don't own"
    },

    ui: {
      hideAdminButtons: getHideAdminButtons(),
      armyEdit: false,
      edit: false,
      editAll: false,
      refs: {
        armyLevelText: null,
        armyLevelInput: null
      }
    },

    buildsView: {
      mode: 'grid'
    },

    dropdownConfigBase: null,
    dropdownConfigDraft: null,

    weaponCatalogBase: null,
    weaponCatalogDraft: null,

    globalOrder: [],

    loading: false,
    error: null
  };

  function setSubtab(v) {
    STATE.subtab = v;
    try { localStorage.setItem(LS_SUBTAB, v); } catch {}
  }

  function slugifyShadowName(name) {
    return String(name || '')
      .trim()
      .replace(/'/g, '')
      .replace(/\s+/g, '_')
      .replace(/[^\w-]/g, '_')
      .replace(/_+/g, '_');
  }

  function getShadowDetailsTarget(s) {
    const slug = slugifyShadowName(s?.name || '');
    if (!slug) return '';
    return url(`/shadows/${encodeURIComponent(slug)}`);
  }

  function openShadowDetails(s, opt = {}) {
    const target = getShadowDetailsTarget(s);
    if (!target) return;

    if (opt?.newTab) {
      try { window.open(target, '_blank', 'noopener'); } catch (_) {}
      return;
    }

    if (typeof window.routeTo === 'function') {
      window.routeTo(target);
      return;
    }

    try {
      history.pushState({}, '', target);
    } catch (_) {}

    window.dispatchEvent(new PopStateEvent('popstate'));
  }

  function handleShadowDetailsPointerOpen(ev, s) {
    if (!s) return;

    if (ev?.button === 1 || ev?.ctrlKey || ev?.metaKey) {
      ev.preventDefault?.();
      openShadowDetails(s, { newTab: true });
      return;
    }

    if (ev?.button === 0) {
      openShadowDetails(s);
    }
  }

  function setAdminSubtab(v) {
    STATE.adminSubtab = v;
    try { localStorage.setItem(LS_ADMIN_SUBTAB, v); } catch {}
  }

  // --------------------------
  // Collection helpers
  // --------------------------
  function getShadowEntry(name) {
    const obj = STATE.collection.shadows || (STATE.collection.shadows = {});
    const k = String(name || '').trim();
    const cur = obj[k];

    if (cur === true) {
      obj[k] = {
        rank: "Common",
        growth: "Don't own",
        armament: "Don't own",
        weaponName: "",
        weaponImage: ""
      };
      return obj[k];
    }

    if (!cur || typeof cur !== 'object') {
      return {
        rank: "Don't own",
        growth: "Don't own",
        armament: "Don't own",
        weaponName: "",
        weaponImage: ""
      };
    }

    return {
      rank: (typeof cur.rank === 'string') ? cur.rank : "Don't own",
      growth: (cur.growth == null) ? "Don't own" : String(cur.growth),
      armament: (cur.armament == null) ? "Don't own" : String(cur.armament),
      weaponName: (typeof cur.weaponName === 'string') ? cur.weaponName : "",
      weaponImage: (typeof cur.weaponImage === 'string') ? cur.weaponImage : ""
    };
  }

  function setShadowEntry(name, patch) {
    const obj = STATE.collection.shadows || (STATE.collection.shadows = {});
    const k = String(name || '').trim();

    const prev = getShadowEntry(k);
    const next = { ...prev, ...(patch || {}) };

    if (next.rank === "Don't own") {
      delete obj[k];
      return;
    }

    obj[k] = next;
  }

  // --------------------------
  // Bulk apply (Edit All row)
  // --------------------------
  function applyPatchToAllShadows(patch = {}) {
    const data = (STATE.data.shadows || []);
    if (!data.length) return;

    if (patch.rank !== undefined) {
      for (const s of data) {
        setShadowEntry(s.name, { rank: patch.rank });
      }
    }

    if (patch.growth !== undefined) {
      for (const s of data) {
        if (!isOwnedShadow(s.name)) continue;
        setShadowEntry(s.name, { growth: patch.growth });
      }
    }

    if (patch.armament !== undefined) {
      for (const s of data) {
        if (!isOwnedShadow(s.name)) continue;
        setShadowEntry(s.name, { armament: patch.armament });
      }
    }
  }

  function isOwnedShadow(name) {
    const e = getShadowEntry(name);
    return e.rank && e.rank !== "Don't own";
  }

  function getTotalUnique() {
    return new Set((STATE.data.shadows || []).map(s => String(s?.name || '').trim()).filter(Boolean)).size;
  }

  function getOwnedCountAll() {
    const unique = new Set((STATE.data.shadows || []).map(s => String(s?.name || '').trim()).filter(Boolean));
    let owned = 0;
    for (const name of unique) if (isOwnedShadow(name)) owned++;
    return owned;
  }

  function computeMaxTotalArmyLevel() {
    const rankMax = rankMaxMapFromConfig();
    const unique = new Set((STATE.data.shadows || []).map(s => String(s?.name || '').trim()).filter(Boolean));
    let sum = 0;
    for (const name of unique) {
      const e = getShadowEntry(name);
      sum += (rankMax[e.rank] ?? 0);
    }
    return sum;
  }

  function getCurrentArmyLevel() {
    const maxTotal = computeMaxTotalArmyLevel();
    let v = parseInt(STATE.collection.shadowArmyLevel, 10);
    if (Number.isNaN(v)) v = (maxTotal === 0 ? 0 : maxTotal);
    v = Math.max(0, Math.min(maxTotal, v));
    return v;
  }

  function setCurrentArmyLevel(v) {
    const maxTotal = computeMaxTotalArmyLevel();
    let n = parseInt(v, 10);
    if (Number.isNaN(n)) n = 0;
    n = Math.max(0, Math.min(maxTotal, n));
    STATE.collection.shadowArmyLevel = String(n);
  }

  function updateArmyBarUI() {
    const t = STATE.ui.refs.armyLevelText;
    const input = STATE.ui.refs.armyLevelInput;
    if (t) t.textContent = String(getCurrentArmyLevel());
    const maxTotal = computeMaxTotalArmyLevel();
    if (input) {
      input.max = String(maxTotal);
      input.value = String(getCurrentArmyLevel());
    }
  }

  // --------------------------
  // Save debounce
  // --------------------------
  let SAVE_TMR = null;
  function queueSave() {
    if (SAVE_TMR) clearTimeout(SAVE_TMR);
    SAVE_TMR = setTimeout(async () => {
      SAVE_TMR = null;
      await saveMyShadowsCollection();
    }, 450);
  }

  // ✅ FIX: Twoje UI woĹa queueSaveMyList(), ale funkcji nie byĹo -> potrafi wywaliÄ caĹy render
  function queueSaveMyList() {
    queueSave();
  }

  async function loadMyShadowsCollection() {
    if (STATE.collection.loaded || STATE.collection.loading) return;

    if (!isLoggedInUser()) {
      STATE.collection.shadows = {};
      STATE.collection.shadowArmyLevel = null;
      STATE.collection.loaded = true;
      return;
    }

    STATE.collection.loading = true;
    try {
      const r = await fetch(url('/api/data'), { credentials: 'include', cache: 'no-store' });

      if (r.status === 401 || r.status === 403) {
        STATE.collection.shadows = {};
        STATE.collection.shadowArmyLevel = null;
        STATE.collection.loaded = true;
        return;
      }

      if (!r.ok) {
        STATE.collection.shadows = {};
        STATE.collection.shadowArmyLevel = null;
        STATE.collection.loaded = true;
        return;
      }

      const j = await r.json().catch(() => ({}));
      const src = (j && typeof j.shadows === 'object' && j.shadows) ? j.shadows : {};
      STATE.collection.shadows = { ...src };

      for (const [k, v] of Object.entries(STATE.collection.shadows)) {
        if (v === true) {
          STATE.collection.shadows[k] = {
            rank: "Common",
            growth: "Don't own",
            armament: "Don't own",
            weaponName: "",
            weaponImage: ""
          };
        }
      }

      if (j && (typeof j.shadowArmyLevel === 'number' || typeof j.shadowArmyLevel === 'string')) {
        STATE.collection.shadowArmyLevel = String(j.shadowArmyLevel);
      } else {
        STATE.collection.shadowArmyLevel = null;
      }

      setCurrentArmyLevel(getCurrentArmyLevel());
      STATE.collection.loaded = true;
    } catch (e) {
      console.error('loadMyShadowsCollection failed:', e);
      STATE.collection.shadows = {};
      STATE.collection.shadowArmyLevel = null;
      STATE.collection.loaded = true;
    } finally {
      STATE.collection.loading = false;
    }
  }

  async function saveMyShadowsCollection() {
    if (!isLoggedInUser()) return false;
    if (STATE.collection.saving) return false;

    STATE.collection.saving = true;
    try {
      setCurrentArmyLevel(getCurrentArmyLevel());

      const payload = {
        shadows: STATE.collection.shadows || {},
        shadowArmyLevel: getCurrentArmyLevel()
      };

      const r = await fetch(url('/api/data'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      });

      const out = await r.json().catch(() => ({}));
      if (!r.ok) {
        toast(out.error || 'Save failed');
        return false;
      }

      toast('Saved ✅');
      return true;
    } catch (e) {
      console.error('saveMyShadowsCollection failed:', e);
      toast('Save failed');
      return false;
    } finally {
      STATE.collection.saving = false;
    }
  }

  // --------------------------
  // Data loading: Shadows
  // --------------------------
  async function loadShadows() {
    STATE.loading = true;
    STATE.error = null;
    try {
      const r = await fetch(url('/api/public/shadows'), { cache: 'no-store' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      const list = Array.isArray(j) ? j : (Array.isArray(j?.items) ? j.items : []);
      if (!Array.isArray(list)) throw new Error('Invalid shadows catalog');

      STATE.data.shadows = list.map((s) => ({
        name: s.name || s.id || 'Unknown',
        image: s.image || s.imageUrl || '',
        image_build: s.image_build || s.imageBuild || s.image || s.imageUrl || ''
      }));

      const ord = await loadGlobalShadowsOrder();
      STATE.globalOrder = ord;
      STATE.data.shadows = applyOrderToShadows(STATE.data.shadows, ord);
    } catch (e) {
      console.error('Shadows load failed:', e);
      STATE.error = 'Failed to load shadows data.';
      STATE.data.shadows = [];
    } finally {
      STATE.loading = false;
    }
  }

  // --------------------------
  // GLOBAL weapon catalog (server)
  // --------------------------
  async function loadWeaponCatalogBase() {
    if (STATE.weaponCatalogBase && Object.keys(STATE.weaponCatalogBase).length > 0) {
      return STATE.weaponCatalogBase;
    }

    try {
      const r = await fetch(url('/api/public/shadow-weapons'), { cache: 'no-store' });
      if (!r.ok) {
        STATE.weaponCatalogBase = {};
        return STATE.weaponCatalogBase;
      }

      const j = await r.json().catch(() => null);
      if (!j) {
        STATE.weaponCatalogBase = {};
        return STATE.weaponCatalogBase;
      }

      if (j && typeof j === 'object' && !Array.isArray(j)) {
        STATE.weaponCatalogBase = j;
        return STATE.weaponCatalogBase;
      }

      if (Array.isArray(j)) {
        const out = {};
        for (const it of j) {
          const shadow = String(it?.shadow || it?.shadowName || '').trim();
          if (!shadow) continue;
          out[shadow] = {
            name: String(it?.name || ''),
            image: String(it?.image || it?.img || '')
          };
        }
        STATE.weaponCatalogBase = out;
        return STATE.weaponCatalogBase;
      }
    } catch {}

    STATE.weaponCatalogBase = {};
    return STATE.weaponCatalogBase;
  }

  async function reloadWeaponCatalogBase() {
    STATE.weaponCatalogBase = null;
    STATE.weaponCatalogDraft = null;
    return loadWeaponCatalogBase();
  }

  async function saveWeaponCatalogGlobal(catalogObj) {
    const out = await fetchJson(url('/api/admin/shadow-weapons'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ catalog: catalogObj || {} })
    });

    if (!out.ok) {
      if (out?.data?.catalog && typeof out.data.catalog === 'object') {
        STATE.weaponCatalogBase = out.data.catalog;
        STATE.weaponCatalogDraft = structuredClone(out.data.catalog);
      }
      throw new Error(out?.data?.error || `HTTP ${out.status}`);
    }
    return out.data?.catalog || {};
  }

  function ensureWeaponCatalogLoaded() {
    if (!STATE.weaponCatalogBase) STATE.weaponCatalogBase = {};
    return STATE.weaponCatalogBase;
  }

  function getWeaponCatalogForShadow(shadowName) {
    ensureWeaponCatalogLoaded();
    const k = String(shadowName || '').trim();

    const base = STATE.weaponCatalogBase?.[k] || (() => {
      const wanted = normalizeShadowWeaponKey(k);
      for (const [catalogKey, value] of Object.entries(STATE.weaponCatalogBase || {})) {
        if (normalizeShadowWeaponKey(catalogKey) === wanted) return value;
      }
      return null;
    })();
    if (base && typeof base === 'object') {
      return {
        name: String(base.name || '').trim(),
        image: String(base.image || '').trim()
      };
    }
    return { name: '', image: '' };
  }

  window.__shadowWeaponsDebug = function __shadowWeaponsDebug() {
    return {
      shadowCount: (STATE.data.shadows || []).length,
      weaponCatalogKeys: Object.keys(STATE.weaponCatalogBase || {}),
      firstRows: (STATE.data.shadows || []).slice(0, 20).map((s) => ({
        shadow: s.name,
        weapon: getWeaponCatalogForShadow(s.name)
      }))
    };
  };

  function normalizeShadowWeaponKey(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/['’`]/g, '')
      .replace(/[^a-z0-9]+/g, '');
  }

  function shadowWeaponFileName(value) {
    const clean = String(value || '').split('?')[0].split('#')[0].replace(/\\/g, '/');
    return clean.split('/').pop() || '';
  }

  function shadowWeaponNameFromImage(value) {
    return shadowWeaponFileName(value).replace(/\.[^.]+$/i, '').trim();
  }

  function shadowWeaponImageSrc(value) {
    let s = String(value || '').trim().replace(/^\/+/, '');
    if (!s) return '';
    if (/^https?:\/\//i.test(s)) return cdnySafe(s, 256);
    if (s.startsWith('picture/')) s = s.slice('picture/'.length);
    if (!s.startsWith('Shadow/Weapon/')) s = `Shadow/Weapon/${s}`;
    return url(`/picture/${s}`);
  }

  // --------------------------
  // UI helpers
  // --------------------------
  function makeSelect(options, value, onChange) {
    const sel = el('select', { class: 'ddl' });
    for (const opt of options) sel.append(el('option', { value: opt }, opt));
    sel.value = (options.includes(value) ? value : options[0]);
    sel.addEventListener('change', () => onChange?.(sel.value));
    return sel;
  }

  function makeNumberInput(value, min, max, onChange) {
    const input = el('input', {
      class: 'numinput',
      type: 'number',
      inputmode: 'numeric',
      value: String(value ?? ''),
      min: String(min ?? 0),
      max: String(max ?? 9999),
      step: '1'
    });

    input.addEventListener('input', () => onChange?.(input.value));
    input.addEventListener('blur', () => {
      let n = parseInt(input.value, 10);
      if (Number.isNaN(n)) n = 0;
      if (typeof min === 'number') n = Math.max(min, n);
      if (typeof max === 'number') n = Math.min(max, n);
      input.value = String(n);
      onChange?.(String(n));
    });

    return input;
  }

  function renderAdvancementIcons(val) {
    const maxA = Math.max(1, +getConfig().armamentMax || 5);
    const n = Math.max(0, Math.min(maxA, parseInt(val, 10) || 0));

    const wrap = el('div', { class: 'adv', title: `Armament advancement: ${n}/${maxA}` });

    for (let i = 0; i < 5; i++) {
      const slot = el('div', { class: 'adv-slot ' + (i < n ? 'active' : '') });
      const back = el('img', { src: cdnySafe(ARM_BACK, 64), alt: '' });
      const front = el('img', { src: cdnySafe(ARM_FRONT, 64), class: 'adv-front', alt: '' });
      slot.append(back, front);
      wrap.append(slot);
    }
    return wrap;
  }

  // --------------------------
  // UI render
  // --------------------------
  function renderHeader(root) {
    const top = el('div', { class: 'flex items-center justify-between gap-3 mb-4' });

    top.append(
      el('div', { class: 'min-w-0' },
        el('div', { class: 'text-2xl font-extrabold text-yellow-400 leading-tight' }, 'Shadows'),
        el('div', { class: 'text-sm text-slate-100' }, 'Builds and your personal list')
      )
    );

    const right = el('div', { class: 'flex items-center gap-2 flex-wrap justify-end' });

    const total = getTotalUnique();
    const owned = getOwnedCountAll();

    right.append(
      el(
        'div',
        { class: 'px-3 py-1 rounded-full border border-white/10 bg-glass text-sm font-semibold text-slate-200' },
        `${owned}/${total || 0}`
      )
    );

    top.append(right);
    root.append(top);
  }

  function renderSubtabs(root) {
    const tabs = [
      { key: 'builds', label: 'Builds' }
    ];
    if (isLoggedInUser()) tabs.push({ key: 'list', label: 'My list' });
    if (isAdminTabVisible()) tabs.push({ key: 'admin', label: 'Admin' });

    const cols = tabs.length;
    const gridCols = cols === 3 ? 'grid-cols-3' : cols === 2 ? 'grid-cols-2' : 'grid-cols-1';
    const bar = el('div', { class: 'grid ' + gridCols + ' gap-2 mb-4' });

    const btn = (key, label) => {
      const active = STATE.subtab === key;
      const b = el(
        'button',
        {
          class: slcBtnClass(active, 'w-full')},
        label
      );
      b.addEventListener('click', async () => {
        if (STATE.subtab === key) return;

        setSubtab(key);

        STATE.ui.armyEdit = false;
        STATE.ui.edit = false;
        STATE.ui.editAll = false;

        if (key === 'list') await loadMyShadowsCollection();
        render();
      });
      return b;
    };

    if (STATE.subtab === 'admin' && !isAdminTabVisible()) setSubtab('builds');
    if (STATE.subtab === 'list' && !isLoggedInUser()) setSubtab('builds');

    for (const t of tabs) bar.append(btn(t.key, t.label));
    root.append(bar);
  }

  function renderFilters(root) {
    if (STATE.subtab !== 'list') return;

    const lvl = getCurrentArmyLevel();
    const maxTotal = computeMaxTotalArmyLevel();

    const bar = el('div', { class: 'armybar mb-4' });

    const left = el('div', { class: 'armybar-left' });

    const text = el('div', { class: 'armybar-text' },
      el('div', { class: 'armybar-title' }, 'Shadow Army Level'),
      el('div', { class: 'armybar-sub' }, 'Current overall army level')
    );

    const levelValueText = document.createTextNode(String(lvl));
    const levelBadge = el('div', { class: 'armybar-level' },
      el('span', { style: 'opacity:.92' }, 'Lv.'),
      levelValueText
    );

    STATE.ui.refs.armyLevelText = levelValueText;

    left.append(text, levelBadge);

    const right = el('div', { class: 'armybar-right' });

    if (isLoggedInUser() && (STATE.ui.armyEdit || STATE.ui.editAll)) {
      const lvlInput = makeNumberInput(lvl, 0, maxTotal, (v) => {
        setCurrentArmyLevel(v);
        queueSave();
        updateArmyBarUI();
      });
      STATE.ui.refs.armyLevelInput = lvlInput;
      right.append(lvlInput);
    } else {
      STATE.ui.refs.armyLevelInput = null;
    }

    if (isLoggedInUser()) {
      const btnEdit = el('button', {
        type: 'button',
        class: slcBtnClass(STATE.ui.armyEdit && !STATE.ui.editAll, 'px-4 font-extrabold'),
        title: 'Edit Lv. X'
      }, 'Edit');

      const btnEditAll = el('button', {
        type: 'button',
        class: slcBtnClass(STATE.ui.editAll, 'px-4 font-extrabold'),
        title: 'Edit all shadows'
      }, 'Edit All');

      btnEdit.addEventListener('click', () => {
        STATE.ui.armyEdit = !STATE.ui.armyEdit;
        if (STATE.ui.armyEdit) {
          STATE.ui.edit = false;
          STATE.ui.editAll = false;
        }
        render();
      });

      btnEditAll.addEventListener('click', () => {
        if (STATE.ui.editAll) {
          STATE.ui.editAll = false;
          STATE.ui.edit = false;
        } else {
          STATE.ui.armyEdit = false;
          STATE.ui.editAll = true;
          STATE.ui.edit = true;
        }
        render();
      });

      right.append(btnEdit, btnEditAll);
    }

    bar.append(left, right);
    root.append(bar);
  }

  function renderBuilds(root) {
    const data = (STATE.data.shadows || []);
    if (!data.length) {
      root.append(el('div', { class: 'p-6 text-center text-white' }, 'No results.'));
      return;
    }

    const grid = el('div', { class: 'builds-grid' });

    for (const s of data) {
      const wrap = el('a', {
        href: getShadowDetailsTarget(s) || '#',
        class: 'builds-card',
        title: s.name,
        'aria-label': s.name
      });

      const inner = el('div', { class: 'builds-card-wrap' });

      const entry = getShadowEntry(s.name);
      const base = (s.image_build || s.image || '');
      const rankedUrl = applyRankToUrl(base, entry.rank);

      const portrait = el('img', {
        class: 'portrait',
        loading: 'lazy',
        decoding: 'async',
        src: cdnySafe(rankedUrl || base || '', 420),
        alt: s.name
      });

      inner.append(portrait);
      wrap.append(inner, el('div', { class: 'name' }, s.name));

      wrap.addEventListener('click', (ev) => {
        if (ev.defaultPrevented || ev.button !== 0) return;
        if (ev.ctrlKey || ev.metaKey) return;
        ev.preventDefault();
        openShadowDetails(s);
      });

      grid.append(wrap);
    }

    root.append(grid);
  }

  function renderList(root) {
    if (STATE.collection.loading && !STATE.collection.loaded) {
      root.append(el('div', { class: 'p-6 text-center text-white' }, 'Loading your list…'));
      return;
    }

    const data = (STATE.data.shadows || []);
    if (!data.length) {
      root.append(el('div', { class: 'p-6 text-center text-white' }, 'No results.'));
      return;
    }

    const list = el('div', { class: 'shadow-progress-grid' });
    const RANK_OPTIONS = rankOptionsFromConfig();
    const GROWTH_OPTIONS = growthOptionsFromConfig();
    const ARMAMENT_OPTIONS = armamentOptionsFromConfig();
    const isEditMode = !!(STATE.ui.edit || STATE.ui.editAll);

    const buildSelect = (options, value, onChange, extraClass = '') => {
      const sel = makeSelect(options, value, onChange);
      sel.className = `shadow-progress-select${extraClass ? ' ' + extraClass : ''}`;
      return sel;
    };

    if (STATE.ui.editAll && isLoggedInUser()) {
      const bulk = (STATE.bulk ||= { rank: "Don't own", growth: "Don't own", armament: "Don't own" });

      const card = el('div', { class: 'shadow-progress-card shadow-progress-bulk-card' });
      const head = el('div', { class: 'shadow-progress-head' });
      const avatar = el('div', { class: 'shadow-progress-avatar' }, el('div', { class: 'shadow-progress-badge shadow-progress-all-badge' }, 'ALL'));
      const meta = el('div', { class: 'shadow-progress-meta' },
        el('div', { class: 'shadow-progress-name' }, 'Edit all'),
        el('div', { class: 'shadow-progress-sub' }, 'After exiting edit mode, applies changes to all visible shadows if modifications were made')
      );
      head.append(avatar, meta);
      card.append(head);

      const stats = el('div', { class: 'shadow-progress-stats' });
      stats.append(
        el('div', { class: 'shadow-progress-stat shadow-progress-stat-full' },
          el('div', { class: 'shadow-progress-stat-label' }, 'Rank'),
          buildSelect(RANK_OPTIONS, bulk.rank, (v) => {
            bulk.rank = v;
            applyPatchToAllShadows({ rank: v });
            setCurrentArmyLevel(getCurrentArmyLevel());
            queueSaveMyList();
            updateArmyBarUI();
            render();
          })
        ),
        el('div', { class: 'shadow-progress-stat' },
          el('div', { class: 'shadow-progress-stat-label' }, 'Growth'),
          buildSelect(GROWTH_OPTIONS, bulk.growth, (v) => {
            bulk.growth = v;
            applyPatchToAllShadows({ growth: v });
            queueSaveMyList();
            render();
          }, 'narrow')
        ),
        el('div', { class: 'shadow-progress-stat' },
          el('div', { class: 'shadow-progress-stat-label' }, 'Armament'),
          buildSelect(ARMAMENT_OPTIONS, bulk.armament, (v) => {
            bulk.armament = v;
            applyPatchToAllShadows({ armament: v });
            queueSaveMyList();
            render();
          }, 'narrow')
        )
      );
      card.append(stats);
      list.append(card);
    }

    for (const s of data) {
      const entry = getShadowEntry(s.name);
      const owned = isOwnedShadow(s.name);
      const baseImg = (s.image || s.image_build) ? (s.image || s.image_build) : '';
      const imgUrl = ensureSmallShadowUrl(isEditMode ? baseImg : applyRankToUrl(baseImg, entry.rank));
      const card = el('div', { class: 'shadow-progress-card' });

      const header = el('div', { class: 'shadow-progress-head' });
      const avatar = el('div', { class: 'shadow-progress-avatar' },
        baseImg
          ? el('img', { src: cdnySafe(imgUrl, 160), loading: 'lazy', decoding: 'async', alt: s.name })
          : el('div', { style: 'font-size:24px' }, '🌑')
      );
      const catalogWeapon = getWeaponCatalogForShadow(s.name);
      const weaponNameText = (catalogWeapon.name && catalogWeapon.name.trim()) || 'Unknown weapon';
      const weaponImgSrc = (catalogWeapon.image && catalogWeapon.image.trim()) || '';

      const meta = el('div', { class: 'shadow-progress-meta' },
        el('div', { class: 'shadow-progress-name' }, s.name)
      );
      header.append(avatar, meta);
      card.append(header);

      const stats = el('div', { class: 'shadow-progress-stats' });

      const rankValue = !isEditMode
        ? el('div', { class: `shadow-progress-stat-value ${owned ? '' : 'dontown'}` }, entry.rank || "Don't own")
        : buildSelect(RANK_OPTIONS, entry.rank, (v) => {
            setShadowEntry(s.name, { rank: v });
            setCurrentArmyLevel(getCurrentArmyLevel());
            queueSave();
            updateArmyBarUI();
            render();
          });

      let growthValue;
      if (!isEditMode) {
        growthValue = owned
          ? el('img', { class: 'shadow-progress-growth-img', src: cdnySafe(growthToUrl(entry.growth), 128), alt: `Growth ${entry.growth}`, loading: 'lazy', decoding: 'async' })
          : el('div', { class: 'shadow-progress-stat-value dontown' }, "Don't own");
      } else {
        const curGrowth = owned ? growthToNum(entry.growth) : 0;
        growthValue = makeImageNumberSelect({
          value: curGrowth,
          max: Math.max(1, +getConfig().growthMax || 15),
          imgFor: growthToUrl,
          disabled: !owned,
          onChange: (v) => {
            if (!isOwnedShadow(s.name)) return;
            setShadowEntry(s.name, { growth: String(v) });
            queueSave();
          }
        });
      }

      let armValue;
      if (!isEditMode) {
        armValue = (!owned || entry.armament === "Don't own")
          ? el('div', { class: 'shadow-progress-stat-value dontown' }, "Don't own")
          : el('div', { class: 'shadow-progress-stat-value shadow-progress-arm-wrap' }, renderAdvancementIcons(entry.armament));
      } else {
        armValue = buildSelect(ARMAMENT_OPTIONS, entry.armament, (v) => {
          if (!isOwnedShadow(s.name)) return;
          setShadowEntry(s.name, { armament: v });
          queueSave();
        }, 'narrow');
      }

      stats.append(
        el('div', { class: 'shadow-progress-stat shadow-progress-stat-full' },
          el('div', { class: 'shadow-progress-stat-label' }, 'Rank'),
          rankValue
        ),
        el('div', { class: 'shadow-progress-stat' },
          el('div', { class: 'shadow-progress-stat-label' }, 'Growth'),
          growthValue
        ),
        el('div', { class: 'shadow-progress-stat' },
          el('div', { class: 'shadow-progress-stat-label' }, 'Armament'),
          armValue
        )
      );
      card.append(stats);

      const weaponCard = el('div', { class: 'shadow-progress-weapon-card' });
      const weaponHead = el('div', { class: 'shadow-progress-weapon-head' });
      const weaponThumb = el('div', { class: 'shadow-progress-weapon-thumb' },
        weaponImgSrc
          ? el('img', { src: shadowWeaponImageSrc(weaponImgSrc), alt: weaponNameText, loading: 'lazy', decoding: 'async' })
          : el('div', { style: 'font-size:24px' }, '⚔️')
      );
      const weaponMeta = el('div', { class: 'shadow-progress-weapon-meta' },
        el('div', { class: 'shadow-progress-sub' }, 'Weapon'),
        el('div', { class: 'shadow-progress-weapon-name', title: weaponNameText }, weaponNameText || 'Unknown weapon')
      );
      weaponHead.append(weaponThumb, weaponMeta);
      weaponCard.append(weaponHead);
      card.append(weaponCard);

      list.append(card);
    }

    root.append(list);
  }

  // --------------------------
  // Admin tab (with subtabs)
  // --------------------------
  function renderAdmin(root) {
    if (!isAdminUser()) {
      root.append(el('div', { class: 'p-6 text-center text-white' }, 'Admin only.'));
      return;
    }

    const tabsBar = el('div', { class: 'flex gap-2 flex-wrap mb-4 p-2 rounded-2xl border border-white/10 bg-glass' });

    const tabBtn = (key, label) => {
      const b = el('button', {
        type: 'button',
        class: slcBtnClass(STATE.adminSubtab === key, 'px-4 font-extrabold')
      }, label);
      b.addEventListener('click', () => {
        if (STATE.adminSubtab === key) return;
        setAdminSubtab(key);
        render();
      });
      return b;
    };

    tabsBar.append(
      tabBtn('shadows', 'Shadows'),
      tabBtn('weapons', 'Shadow weapon'),
      tabBtn('dropdowns', 'Dropdowns')
    );

    root.append(tabsBar);

    if (STATE.adminSubtab === 'weapons') {
      renderAdminWeaponsList(root);
      return;
    }
    if (STATE.adminSubtab === 'dropdowns') {
      renderAdminDropdowns(root);
      return;
    }

    renderAdminShadows(root);
  }

  // ---- Admin #1: Shadows
  function renderAdminShadows(root) {
    const card = el('div', { class: 'bg-slate-800 rounded-2xl border border-slate-700 p-4 shadow-sm' });

    const header = el('div', { class: 'flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4' },
      el('div', {},
        el('div', { class: 'text-lg font-extrabold text-yellow-400' }, 'Shadows - Admin'),
        el('div', { class: 'text-sm text-slate-100' }, 'Add/edit shadows + change global order.')
      )
    );

    const actions = el('div', { class: 'flex flex-wrap items-center gap-2' });

    const btnExact = el('button', {
      class: 'h-10 px-4 rounded-xl border bg-glass text-slate-200 hover:bg-white/10 hover:text-white text-base font-extrabold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400/50',
      type: 'button'
    }, 'Set exact order');

    btnExact.addEventListener('click', () => openExactOrderModal());
    actions.append(btnExact);

    const btnAutoMatch = el('button', {
      class: 'h-10 px-4 rounded-xl border bg-glass text-slate-200 hover:bg-white/10 hover:text-white text-base font-extrabold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400/50',
      type: 'button'
    }, 'Auto match missing images');

    btnAutoMatch.addEventListener('click', async () => {
      try {
        const shadowPics = await listPictures('Shadow/Shadows');
        if (!shadowPics.length) {
          toast('No local files in /picture/Shadow/Shadows');
          return;
        }

        let changed = 0;
        let checked = 0;
        for (const item of (STATE.data.shadows || [])) {
          checked++;
          const cur1 = String(item?.image || '').trim();
          const cur2 = String(item?.image_build || '').trim();
          const need1 = !cur1 || isCloudinaryUrl(cur1);
          const need2 = !cur2 || isCloudinaryUrl(cur2);

          if (!need1 && !need2) continue;

          const guessed = guessShadowLocalImages(item?.name || '', shadowPics);
          const nextImage = need1 ? (guessed.image || cur1) : cur1;
          const nextBuild = need2 ? (guessed.image_build || guessed.image || cur2) : cur2;

          if ((nextImage && nextImage !== cur1) || (nextBuild && nextBuild !== cur2)) {
            const out = await fetchJson(url('/api/admin/shadows'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({
                action: 'update',
                originalName: item.name,
                item: { name: item.name, image: nextImage, image_build: nextBuild }
              })
            });
            if (out.ok) changed++;
          }
        }

        await loadShadows();
        toast(`Auto match done ✅ ${changed} updated`);
        render();
      } catch (e) {
        console.error(e);
        toast(`Auto match failed: ${e?.message || e}`);
      }
    });
    actions.append(btnAutoMatch);
    header.append(actions);

    const addWrap = el('div', { class: 'grid gap-2 p-3 rounded-2xl border border-slate-700 bg-[rgb(24_34_52)] mb-4' });
    addWrap.append(el('div', { class: 'font-extrabold text-white' }, 'Add new shadow'));

    const row1 = el('div', { class: 'flex flex-wrap gap-2 admin-form-row' });
    const inName = el('input', { class: 'h-10 px-3 rounded-xl border dark:border-slate-700 bg-slate-800 min-w-[240px]', placeholder: 'Name (unique)' });
    const inImg1 = el('input', { class: 'h-10 px-3 rounded-xl border dark:border-slate-700 bg-slate-800 min-w-[320px] flex-1', placeholder: 'Image URL or /picture/Shadow/Shadows/*' });
    const inImg2 = el('input', { class: 'h-10 px-3 rounded-xl border dark:border-slate-700 bg-slate-800 min-w-[320px] flex-1', placeholder: 'Build image URL or /picture/Shadow/Shadows/*' });

    const btnAdd = el('button', {
      class: 'h-10 px-3 rounded-xl border bg-slate-800 text-white hover:bg-slate-700 border-slate-700 font-extrabold',
      type: 'button'
    }, 'Add');

    btnAdd.addEventListener('click', async () => {
      const name = (inName.value || '').trim();
      const image = (inImg1.value || '').trim();
      const image_build = (inImg2.value || '').trim();

      if (!name || !image) {
        toast('Name + Link 1 required');
        return;
      }

      const out = await fetchJson(url('/api/admin/shadows'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'add', item: { name, image, image_build } })
      });

      if (!out.ok) {
        toast(out?.data?.error || 'Add failed');
        return;
      }

      inName.value = '';
      inImg1.value = '';
      inImg2.value = '';

      toast('Added ✅');
      await loadShadows();
      render();
    });

    row1.append(inName, inImg1, inImg2, btnAdd);
    addWrap.append(row1);

    const rowLocal = el('div', { class: 'flex flex-wrap gap-2 items-center' });
    const selLocal1 = el('select', { class: 'h-10 px-3 rounded-xl border dark:border-slate-700 bg-slate-800 min-w-[320px] flex-1' });
    const selLocal2 = el('select', { class: 'h-10 px-3 rounded-xl border dark:border-slate-700 bg-slate-800 min-w-[320px] flex-1' });
    selLocal1.append(el('option', { value: '' }, 'Select local image... (Shadow)'));
    selLocal2.append(el('option', { value: '' }, 'Select local build image... (Shadow)'));
    rowLocal.append(el('div', { class: 'text-xs font-bold text-white w-full' }, 'Optional local picker (fills the fields above)'), selLocal1, selLocal2);
    addWrap.append(rowLocal);

    (async () => {
      const pics = await listPictures('Shadow/Shadows');
      for (const p of pics) {
        selLocal1.append(el('option', { value: p.path }, p.name));
        selLocal2.append(el('option', { value: p.path }, p.name));
      }
    })();
    selLocal1.addEventListener('change', () => { if (selLocal1.value) inImg1.value = selLocal1.value; });
    selLocal2.addEventListener('change', () => { if (selLocal2.value) inImg2.value = selLocal2.value; });

    const list = el('div', { class: 'grid gap-2' });
    const data = (STATE.data.shadows || []);

    function ensureOrder() {
      const cur = (STATE.globalOrder && STATE.globalOrder.length) ? [...STATE.globalOrder] : [];
      const names = (STATE.data.shadows || []).map(s => s.name).filter(Boolean);
      const set = new Set(cur);
      for (const n of names) if (!set.has(n)) cur.push(n);
      return cur;
    }

    async function commitOrder(nextOrder) {
      try {
        await saveGlobalShadowsOrder(nextOrder);
        STATE.globalOrder = nextOrder;
        STATE.data.shadows = applyOrderToShadows(STATE.data.shadows, nextOrder);
        toast('Order saved ✅');
        render();
      } catch (err) {
        toast(`Order save failed: ${err?.message || err}`);
      }
    }

    function adminRow(s) {
      const row = el('div', {
        class: 'rounded-2xl border border-slate-700 bg-slate-900/20 p-3 flex flex-col md:flex-row md:items-center gap-3'
      });

      const img = (s.image || s.image_build)
        ? el('img', {
            src: cdnySafe((s.image || s.image_build), 96),
            class: 'w-14 h-14 rounded-2xl object-cover bg-[rgb(24_34_52)] border border-slate-700',
            loading: 'lazy',
            decoding: 'async',
            alt: s.name || ''
          })
        : el('div', { class: 'w-14 h-14 rounded-2xl bg-[rgb(24_34_52)] grid place-items-center text-xl' }, '🌑');

      const meta = el('div', { class: 'min-w-0 flex-1' },
        el('div', { class: 'font-extrabold text-white truncate' }, s.name),
        el('div', { class: 'text-xs text-white' }, `Shadow`)
      );

      const right = el('div', { class: 'flex flex-wrap items-center gap-2 justify-start md:justify-end' });

      const btnUp = el('button', {
        class: 'h-9 w-9 rounded-xl border bg-slate-800 hover:bg-slate-700 border-slate-700 font-extrabold',
        title: 'Move up',
        type: 'button'
      }, '↑');

      const btnDown = el('button', {
        class: 'h-9 w-9 rounded-xl border bg-slate-800 hover:bg-slate-700 border-slate-700 font-extrabold',
        title: 'Move down',
        type: 'button'
      }, '↓');

      btnUp.addEventListener('click', async () => {
        const order = ensureOrder();
        const i = order.indexOf(s.name);
        if (i <= 0) return;
        { const tmp = order[i - 1]; order[i - 1] = order[i]; order[i] = tmp; }
        await commitOrder(order);
      });

      btnDown.addEventListener('click', async () => {
        const order = ensureOrder();
        const i = order.indexOf(s.name);
        if (i < 0 || i >= order.length - 1) return;
        { const tmp = order[i + 1]; order[i + 1] = order[i]; order[i] = tmp; }
        await commitOrder(order);
      });

      const btnEdit = el('button', {
        class: 'h-9 px-3 rounded-xl border bg-slate-800 text-white hover:bg-slate-700 border-slate-700 font-extrabold',
        type: 'button'
      }, 'Edit');

      btnEdit.addEventListener('click', () => openEditShadowModal(s));

      right.append(btnUp, btnDown, btnEdit);
      row.append(img, meta, right);
      return row;
    }

    for (const s of data) list.append(adminRow(s));

    card.append(header, addWrap, list);
    root.append(card);

    function openExactOrderModal() {
      const order = ensureOrder();
      const textarea = el('textarea', {
        class: 'w-full min-h-[240px] p-3 rounded-xl border dark:border-slate-700 bg-slate-900 text-slate-900 dark:text-slate-100',
        placeholder: 'One name per line…'
      }, order.join('\n'));

      const saveBtn = el('button', {
        class: 'h-10 px-3 rounded-xl border bg-slate-800 text-white hover:bg-slate-700 border-slate-700 font-extrabold',
        type: 'button'
      }, 'Save order');

      const wrap = el('div', { class: 'grid gap-3' },
        el('div', { class: 'text-sm text-slate-100' }, 'Paste / edit the exact order. Unknown names will be ignored. Missing shadows will be appended at the end.'),
        textarea,
        el('div', { class: 'flex justify-end' }, saveBtn)
      );

      const doSave = async () => {
        const lines = (textarea.value || '').split(/\r?\n/).map(x => x.trim()).filter(Boolean);
        const baseNames = (STATE.data.shadows || []).map(s => s.name).filter(Boolean);
        const baseSet = new Set(baseNames);

        const next = [];
        const seen = new Set();
        for (const n of lines) {
          if (!baseSet.has(n)) continue;
          if (seen.has(n)) continue;
          seen.add(n);
          next.push(n);
        }
        for (const n of baseNames) {
          if (!seen.has(n)) next.push(n);
        }

        await commitOrder(next);
        window.__shadows_hideModal?.();
      };

      saveBtn.addEventListener('click', doSave);
      shadowsShowModal('Set exact order', () => wrap);
    }

    function openEditShadowModal(s) {
      const inName = el('input', { class: 'h-10 px-3 rounded-xl border dark:border-slate-700 bg-slate-900', value: s.name || '' });
      const inImg1 = el('input', { class: 'h-10 px-3 rounded-xl border dark:border-slate-700 bg-slate-900', value: s.image || '' });
      const inImg2 = el('input', { class: 'h-10 px-3 rounded-xl border dark:border-slate-700 bg-slate-900', value: s.image_build || '' });

      const save = el('button', {
        class: 'h-10 px-3 rounded-xl border bg-slate-800 text-white hover:bg-slate-700 border-slate-700 font-extrabold',
        type: 'button'
      }, 'Save');

      const body = el('div', { class: 'grid gap-2' },
        el('div', { class: 'text-sm text-slate-100' }, 'Name / Link1 / Link2'),
        el('div', { class: 'text-xs text-white' }, 'Tip: use local /picture/Shadow/Shadows/* images'),
        el('div', { class: 'grid gap-2' },
          el('label', { class: 'text-xs font-bold text-white' }, 'Name'),
          inName,
          el('label', { class: 'text-xs font-bold text-white' }, 'Link 1 (image)'),
          inImg1,
          el('label', { class: 'text-xs font-bold text-white' }, 'Link 2 (build image)'),
          inImg2,
          (() => {
            const wrap = el('div', { class: 'grid gap-2' });
            const sel1 = el('select', { class: 'h-10 px-3 rounded-xl border dark:border-slate-700 bg-slate-900' });
            const sel2 = el('select', { class: 'h-10 px-3 rounded-xl border dark:border-slate-700 bg-slate-900' });
            sel1.append(el('option', { value: '' }, 'Select local image...'));
            sel2.append(el('option', { value: '' }, 'Select local build image...'));
            wrap.append(
              el('label', { class: 'text-xs font-bold text-white' }, 'Local picker (optional)'),
              sel1,
              sel2
            );
            (async () => {
              const pics = await listPictures('Shadow/Shadows');
              for (const p of pics) {
                sel1.append(el('option', { value: p.path }, p.name));
                sel2.append(el('option', { value: p.path }, p.name));
              }
            })();
            sel1.addEventListener('change', () => { if (sel1.value) inImg1.value = sel1.value; });
            sel2.addEventListener('change', () => { if (sel2.value) inImg2.value = sel2.value; });
            return wrap;
          })()
        ),
        el('div', { class: 'flex justify-end pt-2' }, save)
      );

      save.addEventListener('click', async () => {
        const name = (inName.value || '').trim();
        const image = (inImg1.value || '').trim();
        const image_build = (inImg2.value || '').trim();

        if (!name) return toast('Name required');

        const out = await fetchJson(url('/api/admin/shadows'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ action: 'update', originalName: s.name, item: { name, image, image_build } })
        });

        if (!out.ok) {
          toast(out?.data?.error || 'Save failed');
          return;
        }

        toast('Saved ✅');
        await loadShadows();
        render();
        window.__shadows_hideModal?.();
      });

      shadowsShowModal(`Edit: ${s.name}`, () => body);
    }
  }

  // ---- Admin #2: Shadow weapon (GLOBAL)
  function renderAdminWeapons(root) {
    ensureWeaponCatalogLoaded();

    if (!STATE.weaponCatalogDraft) {
      STATE.weaponCatalogDraft = structuredClone(STATE.weaponCatalogBase || {});
    }

    const card = el('div', { class: 'bg-slate-800 rounded-2xl border border-slate-700 p-4 shadow-sm' });

    card.append(
      el('div', { class: 'text-lg font-extrabold text-yellow-400' }, 'Shadow weapon - Admin'),
      el('div', { class: 'text-sm text-slate-100 mb-4' }, 'Assign weapon name + weapon image URL for each Shadow (GLOBAL for all users). Supports local /picture/Shadow/Weapon/* files.')
    );

    const names = (STATE.data.shadows || []).map(s => s.name).filter(Boolean);

    if (!names.length) {
      card.append(el('div', { class: 'p-4 text-center text-white' }, 'No shadows loaded.'));
      root.append(card);
      return;
    }

    const wrap = el('div', { class: 'grid gap-2 p-3 rounded-2xl border border-slate-700 bg-[rgb(24_34_52)] mb-4' });
    wrap.append(el('div', { class: 'font-extrabold text-white' }, 'Add / Update weapon'));

    const row = el('div', { class: 'flex flex-wrap gap-2 items-center weapon-form-row' });

    const selShadow = el('select', { class: 'h-10 px-3 rounded-xl border dark:border-slate-700 bg-slate-800 min-w-[240px]' });
    for (const n of names) selShadow.append(el('option', { value: n }, n));

    if (STATE.adminWeaponSelected && names.includes(STATE.adminWeaponSelected)) {
      selShadow.value = STATE.adminWeaponSelected;
    }

    const inWeaponName = el('input', {
      class: 'h-10 px-3 rounded-xl border dark:border-slate-700 bg-slate-800 min-w-[260px] flex-1',
      placeholder: 'Weapon name'
    });

    const inWeaponImg = el('input', {
      class: 'h-10 px-3 rounded-xl border dark:border-slate-700 bg-slate-800 min-w-[320px] flex-1',
      placeholder: 'Weapon image URL or /picture/Shadow/Weapon/*'
    });

    const selWeaponLocal = el('select', {
      class: 'h-10 px-3 rounded-xl border dark:border-slate-700 bg-slate-800 min-w-[260px]'
    });
    selWeaponLocal.append(el('option', { value: '' }, 'Select local weapon image...'));
    (async () => {
      try {
        const pics = await listPictures('Shadow/Weapon');
        for (const it of pics) {
          selWeaponLocal.append(el('option', { value: it.path }, it.name));
        }
      } catch {}
    })();

    selWeaponLocal.addEventListener('change', () => {
      if (selWeaponLocal.value) inWeaponImg.value = selWeaponLocal.value;
    });

    const btnAutoMatchWeapons = el('button', {
      class: 'h-10 px-3 rounded-xl border bg-slate-800 hover:bg-slate-700 border-slate-700 font-extrabold',
      type: 'button'
    }, 'Auto match missing images');

    const btnSave = el('button', {
      class: 'h-10 px-3 rounded-xl border bg-slate-800 text-white hover:bg-slate-700 border-slate-700 font-extrabold',
      type: 'button'
    }, 'Save');

    const btnClear = el('button', {
      class: 'h-10 px-3 rounded-xl border bg-slate-800 hover:bg-slate-700 border-slate-700 font-extrabold',
      type: 'button'
    }, 'Remove');

    function fillFromSelection() {
      const shadow = selShadow.value;
      STATE.adminWeaponSelected = shadow;

      const cur = STATE.weaponCatalogDraft?.[shadow] || STATE.weaponCatalogBase?.[shadow] || {};
      inWeaponName.value = String(cur?.name || '');
      inWeaponImg.value = String(cur?.image || '');
    }

    selShadow.addEventListener('change', fillFromSelection);
    fillFromSelection();

    btnSave.addEventListener('click', async () => {
      const shadow = (selShadow.value || '').trim();
      const wname = (inWeaponName.value || '').trim();
      const wimg = (inWeaponImg.value || '').trim();

      if (!shadow) return toast('Select a shadow first.');

      STATE.weaponCatalogDraft[shadow] = { name: wname, image: wimg };

      try {
        const saved = await saveWeaponCatalogGlobal(STATE.weaponCatalogDraft);

        STATE.weaponCatalogBase = saved;
        STATE.weaponCatalogDraft = structuredClone(saved);

        toast('Weapon saved ✅');
        render();
      } catch (e) {
        toast(`Save failed: ${e?.message || e}`);
      }
    });

    btnClear.addEventListener('click', async () => {
      const shadow = (selShadow.value || '').trim();
      if (!shadow) return;

      delete STATE.weaponCatalogDraft[shadow];

      try {
        const saved = await saveWeaponCatalogGlobal(STATE.weaponCatalogDraft);

        STATE.weaponCatalogBase = saved;
        STATE.weaponCatalogDraft = structuredClone(saved);

        toast('Weapon removed ✅');
        render();
      } catch (e) {
        toast(`Remove failed: ${e?.message || e}`);
      }
    });



btnAutoMatchWeapons.addEventListener('click', async () => {
  try {
    const pics = await listPictures('Shadow/Weapon');
    if (!pics.length) return toast('No local files in /picture/Shadow/Weapon');

    ensureWeaponCatalogLoaded();
    if (!STATE.weaponCatalogDraft) STATE.weaponCatalogDraft = structuredClone(STATE.weaponCatalogBase || {});

    let changed = 0;
    for (const shadow of names) {
      const cur = STATE.weaponCatalogDraft?.[shadow] || STATE.weaponCatalogBase?.[shadow] || {};
      const currentImg = String(cur?.image || '').trim();
      if (currentImg && !isCloudinaryUrl(currentImg)) continue;
      const match = guessLocalPictureByName(shadow, pics, { prefer: 'weapon' });
      if (!match) continue;
      STATE.weaponCatalogDraft[shadow] = {
        name: String(cur?.name || ''),
        image: match
      };
      changed++;
    }

    if (!changed) return toast('Nothing to auto-match ✅');

    const saved = await saveWeaponCatalogGlobal(STATE.weaponCatalogDraft);
    STATE.weaponCatalogBase = saved;
    STATE.weaponCatalogDraft = structuredClone(saved);
    toast(`Auto-matched weapon images: ${changed} ✅`);
    render();
  } catch (e) {
    toast(`Auto-match failed: ${e?.message || e}`);
  }
});

    row.append(selShadow, inWeaponName, inWeaponImg, selWeaponLocal, btnAutoMatchWeapons, btnSave, btnClear);
    wrap.append(row);
    card.append(wrap);

    root.append(card);
  }

  function renderAdminWeaponsList(root) {
    ensureWeaponCatalogLoaded();

    if (!STATE.weaponCatalogDraft) {
      STATE.weaponCatalogDraft = structuredClone(STATE.weaponCatalogBase || {});
    }

    const names = (STATE.data.shadows || []).map(s => s.name).filter(Boolean);
    const card = el('div', { class: 'bg-slate-800 rounded-2xl border border-slate-700 p-4 shadow-sm' });

    const header = el('div', { class: 'flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4' },
      el('div', {},
        el('div', { class: 'text-lg font-extrabold text-yellow-400' }, 'Shadow weapon - Admin'),
        el('div', { class: 'text-sm text-slate-100' }, 'Edit weapon name + weapon image for each Shadow (GLOBAL for all users).')
      )
    );

    const actions = el('div', { class: 'flex flex-wrap items-center gap-2' });
    const btnAutoMatchWeapons = el('button', {
      class: 'h-10 px-3 rounded-xl border bg-slate-800 hover:bg-slate-700 border-slate-700 font-extrabold',
      type: 'button'
    }, 'Auto match missing images');

    btnAutoMatchWeapons.addEventListener('click', async () => {
      try {
        const pics = await listPictures('Shadow/Weapon');
        if (!pics.length) return toast('No local files in /picture/Shadow/Weapon');

        ensureWeaponCatalogLoaded();
        if (!STATE.weaponCatalogDraft) STATE.weaponCatalogDraft = structuredClone(STATE.weaponCatalogBase || {});

        let changed = 0;
        for (const shadow of names) {
          const cur = STATE.weaponCatalogDraft?.[shadow] || STATE.weaponCatalogBase?.[shadow] || {};
          const currentImg = String(cur?.image || '').trim();
          if (currentImg && !isCloudinaryUrl(currentImg)) continue;
          const match = guessLocalPictureByName(shadow, pics, { prefer: 'weapon' });
          if (!match) continue;
          STATE.weaponCatalogDraft[shadow] = {
            name: String(cur?.name || ''),
            image: match
          };
          changed++;
        }

        if (!changed) return toast('Nothing to auto-match as…');

        const saved = await saveWeaponCatalogGlobal(STATE.weaponCatalogDraft);
        STATE.weaponCatalogBase = saved;
        STATE.weaponCatalogDraft = structuredClone(saved);
        toast(`Auto-matched weapon images: ${changed} …`);
        render();
      } catch (e) {
        toast(`Auto-match failed: ${e?.message || e}`);
      }
    });

    actions.append(btnAutoMatchWeapons);
    header.append(actions);
    card.append(header);

    if (!names.length) {
      card.append(el('div', { class: 'p-4 text-center text-white' }, 'No shadows loaded.'));
      root.append(card);
      return;
    }

    function weaponForShadow(shadowName) {
      const cur = STATE.weaponCatalogDraft?.[shadowName] || getWeaponCatalogForShadow(shadowName) || {};
      return {
        name: String(cur?.name || '').trim(),
        image: String(cur?.image || '').trim()
      };
    }

    function adminWeaponRow(s) {
      const weapon = weaponForShadow(s.name);
      const row = el('div', {
        class: 'rounded-2xl border border-slate-700 bg-slate-900/20 p-3 flex flex-col lg:flex-row lg:items-center gap-3'
      });

      const shadowImg = (s.image || s.image_build)
        ? el('img', {
            src: cdnySafe((s.image || s.image_build), 96),
            class: 'w-14 h-14 rounded-2xl object-cover bg-[rgb(24_34_52)] border border-slate-700',
            loading: 'lazy',
            decoding: 'async',
            alt: s.name || ''
          })
        : el('div', { class: 'w-14 h-14 rounded-2xl bg-[rgb(24_34_52)] grid place-items-center text-xl' }, 'S');

      const shadowMeta = el('div', { class: 'min-w-0 flex-1' },
        el('div', { class: 'font-extrabold text-white truncate' }, s.name),
        el('div', { class: 'text-xs text-white' }, 'Shadow')
      );

      const weaponImg = weapon.image
        ? el('img', {
            src: shadowWeaponImageSrc(weapon.image),
            class: 'w-14 h-14 rounded-2xl object-contain bg-[rgb(24_34_52)] border border-slate-700',
            loading: 'lazy',
            decoding: 'async',
            alt: weapon.name || 'Weapon'
          })
        : el('div', { class: 'w-14 h-14 rounded-2xl bg-[rgb(24_34_52)] grid place-items-center text-xs text-slate-300 border border-slate-700' }, 'No img');

      const weaponMeta = el('div', { class: 'min-w-0 flex-1' },
        el('div', { class: 'font-extrabold text-white truncate' }, weapon.name || 'No weapon name'),
        el('div', { class: 'text-xs text-white truncate' }, shadowWeaponFileName(weapon.image) || weapon.image || 'No weapon image')
      );

      const btnEdit = el('button', {
        class: 'h-9 px-3 rounded-xl border bg-slate-800 text-white hover:bg-slate-700 border-slate-700 font-extrabold',
        type: 'button'
      }, 'Edit');

      btnEdit.addEventListener('click', () => openEditShadowWeaponModal(s));

      row.append(
        el('div', { class: 'flex items-center gap-3 min-w-0 flex-1' }, shadowImg, shadowMeta),
        el('div', { class: 'hidden lg:block h-10 w-px bg-slate-700' }),
        el('div', { class: 'flex items-center gap-3 min-w-0 flex-1' }, weaponImg, weaponMeta),
        el('div', { class: 'flex justify-start lg:justify-end' }, btnEdit)
      );
      return row;
    }

    const list = el('div', { class: 'grid gap-2' });
    for (const s of (STATE.data.shadows || [])) list.append(adminWeaponRow(s));
    card.append(list);
    root.append(card);

    function openEditShadowWeaponModal(s) {
      const cur = weaponForShadow(s.name);
      const inWeaponName = el('input', {
        class: 'h-10 px-3 rounded-xl border dark:border-slate-700 bg-slate-900',
        value: cur.name || '',
        placeholder: 'Weapon name'
      });

      const selWeaponLocal = el('select', {
        class: 'h-10 px-3 rounded-xl border dark:border-slate-700 bg-slate-900'
      });
      selWeaponLocal.append(el('option', { value: '' }, 'No weapon image'));
      if (cur.image) {
        const curFile = shadowWeaponFileName(cur.image) || cur.image;
        selWeaponLocal.append(el('option', { value: curFile }, curFile));
        selWeaponLocal.value = curFile;
      }

      const weaponPreview = el('img', {
        src: cur.image ? shadowWeaponImageSrc(cur.image) : '',
        class: 'w-16 h-16 rounded-2xl object-contain bg-[rgb(24_34_52)] border border-slate-700',
        loading: 'lazy',
        decoding: 'async',
        alt: cur.name || 'Weapon',
        style: cur.image ? '' : 'display:none'
      });
      const weaponPreviewEmpty = el('div', {
        class: 'w-16 h-16 rounded-2xl bg-[rgb(24_34_52)] grid place-items-center text-xs text-slate-300 border border-slate-700',
        style: cur.image ? 'display:none' : ''
      }, 'No img');

      (async () => {
        try {
          const pics = await listPictures('Shadow/Weapon');
          for (const it of pics) {
            const file = shadowWeaponFileName(it.path || it.name) || it.name;
            const exists = Array.from(selWeaponLocal.options).some((opt) => opt.value === file);
            if (!exists) selWeaponLocal.append(el('option', { value: file }, file));
          }
          const curFile = shadowWeaponFileName(cur.image);
          if (curFile && Array.from(selWeaponLocal.options).some((opt) => opt.value === curFile)) {
            selWeaponLocal.value = curFile;
          }
        } catch {}
      })();
      selWeaponLocal.addEventListener('change', () => {
        const next = selWeaponLocal.value || '';
        weaponPreview.src = next ? shadowWeaponImageSrc(next) : '';
        weaponPreview.style.display = next ? '' : 'none';
        weaponPreviewEmpty.style.display = next ? 'none' : '';
        if (next) inWeaponName.value = shadowWeaponNameFromImage(next) || inWeaponName.value;
      });

      const save = el('button', {
        class: 'h-10 px-3 rounded-xl border bg-slate-800 text-white hover:bg-slate-700 border-slate-700 font-extrabold',
        type: 'button'
      }, 'Save');

      const remove = el('button', {
        class: 'h-10 px-3 rounded-xl border bg-slate-800 hover:bg-slate-700 border-slate-700 font-extrabold',
        type: 'button'
      }, 'Remove');

      const shadowImg = (s.image || s.image_build)
        ? el('img', {
            src: cdnySafe((s.image || s.image_build), 128),
            class: 'w-16 h-16 rounded-2xl object-cover bg-[rgb(24_34_52)] border border-slate-700',
            loading: 'lazy',
            decoding: 'async',
            alt: s.name || ''
          })
        : null;

      const body = el('div', { class: 'grid gap-3' },
        el('div', { class: 'flex items-center gap-3 rounded-2xl border border-slate-700 bg-slate-900/30 p-3' },
          shadowImg || el('div', { class: 'w-16 h-16 rounded-2xl bg-[rgb(24_34_52)]' }),
          el('div', { class: 'min-w-0' },
            el('div', { class: 'text-lg font-extrabold text-white truncate' }, s.name || 'Shadow'),
            el('div', { class: 'text-xs text-slate-200' }, 'Shadow')
          )
        ),
        el('label', { class: 'text-xs font-bold text-white' }, 'Weapon name'),
        inWeaponName,
        el('label', { class: 'text-xs font-bold text-white' }, 'Local picker (optional)'),
        el('div', { class: 'flex items-center gap-3' }, weaponPreview, weaponPreviewEmpty, selWeaponLocal),
        el('div', { class: 'flex flex-wrap justify-end gap-2 pt-2' }, remove, save)
      );

      save.addEventListener('click', async () => {
        const shadow = String(s.name || '').trim();
        if (!shadow) return toast('Shadow missing.');

        STATE.weaponCatalogDraft[shadow] = {
          name: String(inWeaponName.value || '').trim(),
          image: String(selWeaponLocal.value || '').trim()
        };

        try {
          const saved = await saveWeaponCatalogGlobal(STATE.weaponCatalogDraft);
          STATE.weaponCatalogBase = saved;
          STATE.weaponCatalogDraft = structuredClone(saved);
          toast('Weapon saved …');
          render();
          window.__shadows_hideModal?.();
        } catch (e) {
          toast(`Save failed: ${e?.message || e}`);
        }
      });

      remove.addEventListener('click', async () => {
        const shadow = String(s.name || '').trim();
        if (!shadow) return;

        delete STATE.weaponCatalogDraft[shadow];

        try {
          const saved = await saveWeaponCatalogGlobal(STATE.weaponCatalogDraft);
          STATE.weaponCatalogBase = saved;
          STATE.weaponCatalogDraft = structuredClone(saved);
          toast('Weapon removed …');
          render();
          window.__shadows_hideModal?.();
        } catch (e) {
          toast(`Remove failed: ${e?.message || e}`);
        }
      });

      shadowsShowModal(`Edit weapon: ${s.name}`, () => body);
    }
  }

  // ---- Admin #3: Dropdowns (GLOBAL NOW)
  function renderAdminDropdowns(root) {
    if (!STATE.dropdownConfigDraft) {
      STATE.dropdownConfigDraft = structuredClone(getConfig());
    }

    const cfg = STATE.dropdownConfigDraft;

    const card = el('div', { class: 'bg-slate-800 rounded-2xl border border-slate-700 p-4 shadow-sm' });

    card.append(
      el('div', { class: 'text-lg font-extrabold text-yellow-400' }, 'Dropdowns - Admin'),
      el('div', { class: 'text-sm text-slate-100 mb-4' }, 'Edit Rank list (name + max Lv), Growth max and Armament max. ✅ GLOBAL for all users.')
    );

    const topBox = el('div', { class: 'grid gap-3 p-3 rounded-2xl border border-slate-700 bg-[rgb(24_34_52)] mb-4' });

    const rowA = el('div', { class: 'flex flex-wrap gap-2 items-center dd-row' });

    const inGrowthMax = el('input', {
      class: 'h-10 px-3 rounded-xl border dark:border-slate-700 bg-slate-900 w-[160px]',
      type: 'number',
      value: String(cfg.growthMax ?? 15),
      min: '1',
      max: '99'
    });

    const inArmMax = el('input', {
      class: 'h-10 px-3 rounded-xl border dark:border-slate-700 bg-slate-900 w-[160px]',
      type: 'number',
      value: String(cfg.armamentMax ?? 5),
      min: '1',
      max: '10'
    });

    rowA.append(
      el('div', { class: 'font-extrabold text-white w-full' }, 'General'),
      el('div', { class: 'dd-field' },
        el('div', { class: 'text-sm text-white dd-label' }, 'Growth max'),
        inGrowthMax
      ),
      el('div', { class: 'dd-field' },
        el('div', { class: 'text-sm text-white dd-label' }, 'Armament max'),
        inArmMax
      )
    );

    topBox.append(rowA);
    card.append(topBox);

    const ranksBox = el('div', { class: 'grid gap-2 p-3 rounded-2xl border border-slate-700 bg-[rgb(24_34_52)] mb-4' });
    ranksBox.append(el('div', { class: 'font-extrabold text-white' }, 'Ranks'));

    const ranksList = el('div', { class: 'grid gap-2' });

    function renderRankRow(rankObj, idx) {
      const row = el('div', { class: 'flex flex-wrap gap-2 items-end dd-row' });

      const inName = el('input', {
        class: 'h-10 px-3 rounded-xl border dark:border-slate-700 bg-slate-900 min-w-[220px] flex-1',
        value: String(rankObj?.name || '')
      });

      const inMax = el('input', {
        class: 'h-10 px-3 rounded-xl border dark:border-slate-700 bg-slate-900 w-[140px]',
        type: 'number',
        value: String(rankObj?.max ?? 0),
        min: '0',
        max: '999'
      });

      const isDontOwn = String(rankObj?.name || '') === "Don't own";

      const btnRemove = el('button', {
        class: 'h-10 px-3 rounded-xl border bg-slate-800 hover:bg-slate-700 border-slate-700 font-extrabold',
        type: 'button',
        disabled: isDontOwn
      }, 'Remove');

      btnRemove.addEventListener('click', () => {
        cfg.ranks.splice(idx, 1);
        render();
      });

      inName.addEventListener('input', () => { rankObj.name = inName.value; });
      inMax.addEventListener('input', () => { rankObj.max = parseInt(inMax.value, 10) || 0; });

      row.append(
        el('div', { class: 'dd-field' },
          el('div', { class: 'text-sm text-white dd-label' }, 'Name'),
          inName
        ),
        el('div', { class: 'dd-field' },
          el('div', { class: 'text-sm text-white dd-label' }, 'Max Lv'),
          inMax
        ),
        btnRemove
      );

      return row;
    }

    for (let i = 0; i < (cfg.ranks || []).length; i++) {
      ranksList.append(renderRankRow(cfg.ranks[i], i));
    }

    const btnAddRank = el('button', {
      class: 'h-10 px-3 rounded-xl border bg-slate-800 text-white hover:bg-slate-700 border-slate-700 font-extrabold justify-self-start',
      type: 'button'
    }, 'Add rank');

    btnAddRank.addEventListener('click', () => {
      cfg.ranks.push({ name: 'New Rank', max: 0 });
      render();
    });

    ranksBox.append(ranksList, btnAddRank);
    card.append(ranksBox);

    const actions = el('div', { class: 'flex flex-wrap gap-2 justify-end' });

    const btnReset = el('button', {
      class: 'h-10 px-3 rounded-xl border bg-slate-800 hover:bg-slate-700 border-slate-700 font-extrabold',
      type: 'button'
    }, 'Reset defaults');

    const btnSave = el('button', {
      class: 'h-10 px-3 rounded-xl border bg-slate-800 text-white hover:bg-slate-700 border-slate-700 font-extrabold',
      type: 'button'
    }, 'Save GLOBAL dropdowns');

    btnReset.addEventListener('click', () => {
      STATE.dropdownConfigDraft = structuredClone(DEFAULT_CONFIG);
      toast('Reset (draft) ✅');
      render();
    });

    btnSave.addEventListener('click', async () => {
      cfg.growthMax = Math.max(1, Math.min(99, parseInt(inGrowthMax.value, 10) || 15));
      cfg.armamentMax = Math.max(1, Math.min(10, parseInt(inArmMax.value, 10) || 5));

      cfg.ranks = (cfg.ranks || [])
        .map(r => ({
          name: String(r?.name || '').trim(),
          max: Math.max(0, Math.min(999, parseInt(r?.max, 10) || 0))
        }))
        .filter(r => r.name);

      if (!cfg.ranks.find(r => r.name === "Don't own")) {
        cfg.ranks.unshift({ name: "Don't own", max: 0 });
      }

      try {
        const saved = await saveDropdownConfigGlobal(cfg);

        STATE.dropdownConfigBase = saved;
        STATE.dropdownConfigDraft = structuredClone(saved);

        setCurrentArmyLevel(getCurrentArmyLevel());
        queueSave();

        toast('GLOBAL dropdowns saved ✅');
        render();
      } catch (e) {
        toast(`Save failed: ${e?.message || e}`);
      }
    });

    actions.append(btnReset, btnSave);
    card.append(actions);
    root.append(card);
  }

  // --------------------------
  // Quick modal
  // --------------------------
  function openQuickModal(s) {
    const entry = getShadowEntry(s.name);
    const base = s.image_build || s.image || '';
    const ranked = applyRankToUrl(base, entry.rank);

    shadowsShowModal(s.name || 'Shadow', () => {
      const wrap = el('div', { class: 'grid gap-3' });

      const img = base
        ? el('img', {
            src: cdnySafe(ranked, 520),
            class: 'w-full rounded-2xl border border-slate-700 object-cover bg-slate-950/20',
            style: 'max-height: 48vh',
            loading: 'lazy',
            decoding: 'async',
            alt: s.name || ''
          })
        : el('div', { class: 'w-full h-52 rounded-2xl bg-[rgb(24_34_52)] grid place-items-center text-4xl' }, '🌑');

      const info = el('div', { class: 'grid gap-2' });

      const wCat = getWeaponCatalogForShadow(s.name);

      const weaponName =
        (wCat.name && wCat.name.trim()) ||
        'Unknown weapon';

      const weaponImg =
        (wCat.image && wCat.image.trim()) ||
        '';

      const row = (label, valueNode) =>
        el('div', {
          class: 'flex items-center justify-between gap-3 px-3 py-2 rounded-xl border border-slate-700 bg-slate-900/25'
        },
          el('div', { class: 'text-xs font-extrabold text-white uppercase tracking-wide' }, label),
          valueNode
        );

      info.append(
        row('Rank', el('div', { class: 'font-extrabold text-white text-sm' }, entry.rank || "Don't own")),
        row('Growth', el('div', { class: 'flex items-center gap-2' },
          el('img', { class: 'w-8 h-8 rounded-xl border border-slate-700', src: cdnySafe(growthToUrl(entry.growth), 96), alt: '' }),
          el('div', { class: 'font-extrabold text-white text-sm' }, String(entry.growth || "Don't own"))
        )),
        row('Weapon', el('div', { class: 'flex items-center gap-2 min-w-0' },
          weaponImg
            ? el('img', {
                class: 'w-10 h-10 rounded-xl border border-slate-700 object-cover',
                src: shadowWeaponImageSrc(weaponImg),
                alt: ''
              })
            : el('div', {
                class: 'w-10 h-10 rounded-xl grid place-items-center border border-slate-700',
                style: 'background: rgba(15,23,42,.25);'
              }, '⚔️'),

          el('div', {
            class: 'font-extrabold text-white text-sm truncate',
            title: weaponName
          }, weaponName || '-')
        )),
        row('Armament', (() => {
          if (!entry.rank || entry.rank === "Don't own" || !entry.armament || entry.armament === "Don't own") {
            return el('div', { class: 'font-extrabold text-white text-sm' }, "Don't own");
          }
          return renderAdvancementIcons(entry.armament);
        })())
      );

      wrap.append(img, info);
      return wrap;
    });
  }

  // --------------------------
  // Main render()
  // --------------------------
  function ensureRootContainer() {
    // ✅ Match Hunters: inner padded shell inside router container
    const host = qs('#content') || qs('#mainContent') || qs('#app');
    if (host) {
      // Reuse existing shell if present
      const existing = host.querySelector('[data-sla-page="shadows"]');
      if (existing) return existing;

      host.innerHTML = '';

      const shell = el('div', {
        class: 'w-full mx-auto px-3 sm:px-6 py-6',
        'data-sla-page': 'shadows'
      });

      host.appendChild(shell);
      refreshTailwindSoon();
      return shell;
    }

    // Fallback (no host found)
    let d = document.getElementById('shadowsRoot');
    if (!d) {
      d = document.createElement('div');
      d.id = 'shadowsRoot';
      document.body.appendChild(d);
    }

    // ✅ Width: match Hunters (no hard max-width here)
    d.style.maxWidth = '';
    d.style.margin = '';
    d.style.padding = '';

    d.className = 'w-full mx-auto px-3 sm:px-6 py-6';
    d.setAttribute('data-sla-page', 'shadows');
    refreshTailwindSoon();
    return d;
  }

  function render() {
    forceDarkModule();
    injectLocalStyles();
    prefetchGrowthImages();

    if (
      (STATE.data.shadows || []).length > 0 &&
      (!STATE.weaponCatalogBase || Object.keys(STATE.weaponCatalogBase).length === 0)
    ) {
      reloadWeaponCatalogBase()
        .then(() => { try { render(); } catch (e) { console.error('shadow weapon rerender failed:', e); } })
        .catch(() => {});
    }

    const root = ensureRootContainer();
    root.innerHTML = '';

    if (!isLoggedInUser()) {
      STATE.ui.armyEdit = false;
      STATE.ui.edit = false;
      STATE.ui.editAll = false;
    }

    if (STATE.error) {
      root.append(
        el(
          'div',
          { class: 'p-6 rounded-2xl border border-red-500/30 bg-red-500/10 text-red-200 font-semibold' },
          STATE.error
        )
      );
      return;
    }

    renderHeader(root);
    renderSubtabs(root);

    if (STATE.subtab === 'builds') {
      renderBuilds(root);
      return;
    }

    if (STATE.subtab === 'list') {
      renderFilters(root);
      renderList(root);
      updateArmyBarUI();
      return;
    }

    if (STATE.subtab === 'admin') {
      renderAdmin(root);
      return;
    }

    renderBuilds(root);
  }

  // --------------------------
  // Init
  // --------------------------
  let __SHADOWS_INITED = false;

  async function init() {
    if (__SHADOWS_INITED) {
      try { render(); } catch (e) { console.error("render after init failed:", e); }
      return;
    }
    __SHADOWS_INITED = true;

    try {
      injectLocalStyles();
      prefetchGrowthImages();

      await loadDropdownConfigBase();
      await loadShadows();
      await loadWeaponCatalogBase();

      // ✅ Load user collection once, so header counter works in ALL tabs (Builds/My list/Admin)
      if (isLoggedInUser()) {
        await loadMyShadowsCollection();
      }

      if (STATE.subtab === 'admin' && !isAdminTabVisible()) {
        setSubtab('builds');
      }

      render();
    } catch (e) {
      console.error('init failed:', e);
      STATE.error = 'Init failed.';
      render();
    }
  }

  window.__shadows_mount = async function __shadows_mount() {
    await init();
  };

  if (!window.__SLA_ROUTER_PRELOADING_SCRIPT) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  }
})();
