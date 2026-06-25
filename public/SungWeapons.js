'use strict';

/**
 * SungWeapons.js — Sung Jinwoo Weapons page module for the new router (LogIn.js).
 * Exposes: window.__sung_weapons_mount()
 *
 * ✅ My list 1:1 like Hunter.js:
 * - Same Advancement system: - / +, same states, same styling
 * - Same Lv behavior: 0 when not owned, input min=0, clamp to Max Lv, bulk live update
 * - Same fonts / row visuals (Hunter-like classes)
 *
 * ✅ Admin:
 * - Add / Edit / Remove weapon
 * - Global order (up/down + exact order modal)
 * - Max advancement is always the global maximum (ADV_MAX)
 * - NEW: Global Max Lv (settings) like Hunter.js
 *
 * ✅ NEW:
 * - Clicking card in Builds opens details route: /sjw-weapons/:slug
 */

(function () {
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

  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);

    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null) continue;

      if (k === 'class') node.className = v;
      else if (k === 'style') node.setAttribute('style', v);
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
      else if (typeof v === 'boolean') {
        if (v) node.setAttribute(k, '');
      } else {
        node.setAttribute(k, v);
      }
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

  async function fetchJson(u, opt) {
    const r = await fetch(u, opt);
    const j = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, data: j };
  }

  function clampInt(v, min, max) {
    const n = Number.isFinite(+v) ? parseInt(v, 10) : min;
    return Math.max(min, Math.min(max, n));
  }

  function cdnySafe(u, w) {
    try { if (typeof window.cdny === 'function') return window.cdny(u, w); } catch {}
    return u || '';
  }

  function slugifyWeaponName(name) {
    return String(name || '')
      .trim()
      .replace(/'/g, '')
      .replace(/\s+/g, '_')
      .replace(/[^\w-]/g, '_')
      .replace(/_+/g, '_');
  }

  function openWeaponDetails(weapon) {
    const slug = slugifyWeaponName(weapon?.name || '');
    if (!slug) return;

    const target = url(`/sjw-weapons/${encodeURIComponent(slug)}`);
    if (typeof window.routeTo === 'function') window.routeTo(target);
    else window.location.href = target;
  }

  // --------------------------
  // LOCAL PICTURES (Sung Weapons)
  // --------------------------
  const SW_LOCAL_WEAPON_CATEGORIES = ['SGWeapon'];
  const PIC_CACHE = Object.create(null);

  function isHttpUrl(s) {
    return /^https?:\/\//i.test(String(s || '').trim());
  }

  function normalizeLocalPicRelAny(v, categories = SW_LOCAL_WEAPON_CATEGORIES) {
    const s = String(v || '').trim();
    if (!s) return '';
    if (isHttpUrl(s)) return '';
    const cats = Array.isArray(categories) ? categories.map(x => String(x || '').trim()).filter(Boolean) : [];
    if (!cats.length) return s.replace(/^\/+/, '');
    for (const c of cats) {
      if (s.startsWith(c + '/')) return s;
    }
    return `${cats[0]}/${s.replace(/^\/+/, '')}`;
  }

  function localPicSrcAny(v, categories = SW_LOCAL_WEAPON_CATEGORIES) {
    const rel = normalizeLocalPicRelAny(v, categories);
    return rel ? url(`/picture/${rel}`) : '';
  }

  function resolveLocalOrRemoteSrcSW(v, w) {
    const s = String(v || '').trim();
    if (!s) return '';
    if (isHttpUrl(s)) return cdnySafe(s, w);
    return localPicSrcAny(s, SW_LOCAL_WEAPON_CATEGORIES);
  }

  async function getPicturesByCategory(category) {
    const key = String(category || '').trim();
    if (!key) return [];
    if (Array.isArray(PIC_CACHE[key])) return PIC_CACHE[key];
    if (PIC_CACHE[`${key}Promise`]) return PIC_CACHE[`${key}Promise`];

    PIC_CACHE[`${key}Promise`] = (async () => {
      const out = await fetchJson(url(`/api/admin/pictures/list?category=${encodeURIComponent(key)}`), {
        credentials: 'include',
        cache: 'no-store'
      });
      const items = (out.ok && Array.isArray(out.data?.items)) ? out.data.items : [];
      PIC_CACHE[key] = items;
      return items;
    })();

    return PIC_CACHE[`${key}Promise`];
  }

  async function getSungWeaponPicturesAnyCategory() {
    const buckets = await Promise.all(SW_LOCAL_WEAPON_CATEGORIES.map(c => getPicturesByCategory(c).catch(() => [])));
    const all = [];
    const seen = new Set();
    for (const arr of buckets) {
      for (const it of (Array.isArray(arr) ? arr : [])) {
        const rel = String(it?.rel || '').trim();
        if (!rel || seen.has(rel)) continue;
        seen.add(rel);
        all.push(it);
      }
    }
    return all;
  }

  function prettyPicName(rel) {
    const s = String(rel || '');
    const noExt = s.replace(/\.[a-z0-9]+$/i, '');
    const fileOnly = noExt.split('/').pop() || noExt;
    return fileOnly.replace(/_/g, ' ');
  }

  function fillPictureSelect(box, items, currentRel) {
    if (!box) return;
    const input = box.inputEl;
    const list = box.listEl;
    if (!input || !list) return;

    const arr = Array.isArray(items) ? items : [];
    box._itemsRaw = arr;
    box._items = arr.map(it => {
      const rel = String(it?.rel || '').trim();
      const label = prettyPicName(rel);
      return { label, value: rel, searchText: `${label} ${rel}`.toLowerCase() };
    }).filter(x => x.value);

    box.value = currentRel || '';
    input.value = currentRel ? prettyPicName(currentRel) : '';
    box.rebuildItems(input.value || '');
  }

  function mkPictureSelectMultiCategory(categories = SW_LOCAL_WEAPON_CATEGORIES, currentRel = '', extra = '') {
    const box = el('div', { class: `${extra} sweapon-pic-select relative min-w-[280px] flex-1` });
    const input = el('input', { type: 'text', class: 'admin-in', placeholder: 'Loading images…', value: '' });
    const list = el('div', {
      class: 'rounded-xl border border-slate-700 bg-slate-800 text-slate-100',
      style: 'position:absolute;left:0;right:0;top:100%;z-index:40;margin-top:4px;max-height:280px;overflow:auto;display:none;padding:4px;box-shadow:0 10px 24px rgba(0,0,0,.18)'
    });
    box.append(input, list);
    box.inputEl = input;
    box.listEl = list;
    box._items = [];
    box._itemsRaw = [];
    box._visibleItems = [];
    box._open = false;
    box._idx = -1;
    box._selectedValue = String(currentRel || '').trim();

    Object.defineProperty(box, 'value', {
      get() { return box._selectedValue || ''; },
      set(v) {
        const val = String(v || '').trim();
        box._selectedValue = val;
        const found = (box._items || []).find(it => it.value === val);
        input.value = found ? found.label : (val || '');
        if (!val) input.value = '';
      }
    });

    function paintActive() {
      Array.from(list.children).forEach((r, i) => { r.style.outline = (i === box._idx ? '2px solid #94a3b8' : 'none'); });
    }
    function openList() { if (box._open) return; box._open = true; list.style.display = 'block'; box._idx = -1; paintActive(); }
    function closeList() { if (!box._open) return; box._open = false; list.style.display = 'none'; box._idx = -1; }
    function chooseItem(it) {
      if (!it) return;
      box._selectedValue = it.value;
      input.value = it.label;
      closeList();
      try { box.dispatchEvent(new Event('change', { bubbles: true })); } catch {}
    }

    box.rebuildItems = function(q = '') {
      const ql = String(q || '').trim().toLowerCase();
      const src = ql ? (box._items || []).filter(it => (it.searchText || '').includes(ql)) : (box._items || []);
      box._visibleItems = src;
      list.innerHTML = '';
      if (!src.length) {
        list.append(el('div', { class: 'text-xs opacity-70', style: 'padding:6px 8px' }, 'No results'));
        box._idx = -1;
        return;
      }
      src.forEach((it, i) => {
        const folder = (() => {
          const parts = String(it.value || '').split('/');
          return parts.length > 1 ? parts.slice(0, -1).join('/') : '';
        })();
        list.append(el('div', {
          class: 'flex items-center justify-between gap-2',
          style: `padding:6px 8px;border-radius:8px;cursor:pointer;${i===box._idx?'outline:2px solid #94a3b8;':''}`,
          onClick: () => chooseItem(it),
          onMouseenter: () => { box._idx = i; paintActive(); }
        },
          el('div', { class: 'truncate', style: 'font-weight:700;' }, it.label),
          folder ? el('div', { class: 'truncate text-xs opacity-60', style: 'max-width:35%;text-align:right;' }, folder) : el('div', { style: 'width:1px' })
        ));
      });
    };

    input.addEventListener('focus', () => { openList(); box.rebuildItems(input.value); });
    input.addEventListener('input', () => { box._selectedValue = ''; openList(); box.rebuildItems(input.value); });
    input.addEventListener('keydown', (e) => {
      const items = box._visibleItems || [];
      if (e.key === 'ArrowDown') { e.preventDefault(); if (!box._open) openList(); if (!items.length) return; box._idx = (box._idx + 1) % items.length; paintActive(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); if (!box._open) openList(); if (!items.length) return; box._idx = (box._idx <= 0 ? items.length - 1 : box._idx - 1); paintActive(); }
      else if (e.key === 'Enter') { if (box._open && box._idx >= 0 && items[box._idx]) { e.preventDefault(); chooseItem(items[box._idx]); } }
      else if (e.key === 'Escape') { if (box._open) { e.preventDefault(); closeList(); } }
    });
    input.addEventListener('blur', () => setTimeout(() => {
      const typed = String(input.value || '').trim().toLowerCase();
      const exact = (box._items || []).find(it => it.label.toLowerCase() === typed || it.value.toLowerCase() === typed);
      if (exact) { box._selectedValue = exact.value; input.value = exact.label; }
      closeList();
    }, 120));
    document.addEventListener('mousedown', (ev) => { if (!box.contains(ev.target)) closeList(); });

    getSungWeaponPicturesAnyCategory().then(items => {
      fillPictureSelect(box, items, currentRel);
      input.placeholder = 'Select local image…';
    }).catch(() => {
      fillPictureSelect(box, [], currentRel);
      input.placeholder = 'No local images found';
    });

    return box;
  }

  function nameToImageKey(s) {
    return String(s || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[’'`]/g, '').replace(/[‐-‒–—]/g, '-').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  }
  function relToImageKey(rel) {
    const file = String(rel || '').split('/').pop() || '';
    const noExt = file.replace(/\.[a-z0-9]+$/i, '');
    return nameToImageKey(noExt);
  }
  function makeNameVariantsForImageMatch(name) {
    const raw = String(name || '').trim();
    if (!raw) return [];
    const variants = new Set([raw]);
    variants.add(raw.replace(/\s+/g, ' '));
    variants.add(raw.replace(/\s*-\s*/g, '-'));
    variants.add(raw.replace(/[’']/g, ''));
    variants.add(raw.replace(/[^\w\s-]/g, ''));
    variants.add(raw.replace(/[^\w\s-]/g, '').replace(/[’']/g, ''));
    return Array.from(variants).map(v => v.trim()).filter(Boolean);
  }
  function findBestPictureRelByName(name, items) {
    const list = Array.isArray(items) ? items : [];
    if (!list.length) return '';
    const targets = makeNameVariantsForImageMatch(name).map(v => nameToImageKey(v)).filter(Boolean);
    const candidates = list.map(it => {
      const rel = String(it?.rel || '').trim();
      const file = rel.split('/').pop() || '';
      const baseNoExt = file.replace(/\.[a-z0-9]+$/i, '');
      const key = relToImageKey(rel);
      return { rel, file, baseNoExt, key };
    }).filter(c => c.rel);
    for (const t of targets) {
      const exact = candidates.find(c => c.key === t);
      if (exact) return exact.rel;
    }
    for (const t of targets) {
      const pref = candidates.find(c => c.key.startsWith(t));
      if (pref) return pref.rel;
    }
    for (const t of targets) {
      const toks = t.split(/[_-]+/).filter(Boolean);
      const hit = candidates.find(c => toks.length && toks.every(tok => c.key.includes(tok)));
      if (hit) return hit.rel;
    }
    return '';
  }

  async function autoMatchSungWeaponImagesBatch() {
    const weapons = Array.isArray(STATE.data?.weapons) ? STATE.data.weapons : [];
    if (!weapons.length) return { checked: 0, matched: 0, updated: 0, skipped: 0, failed: 0 };
    const pics = await getSungWeaponPicturesAnyCategory();
    let checked = 0, matched = 0, updated = 0, skipped = 0, failed = 0;

    for (const w of weapons) {
      const name = String(w?.name || '').trim();
      if (!name) { skipped++; continue; }
      const cur = String(w?.image_build || w?.image || '').trim();
      const hasLocal = !!normalizeLocalPicRelAny(cur);
      if (hasLocal) { skipped++; continue; }
      checked++;
      const rel = findBestPictureRelByName(name, pics);
      if (!rel) continue;
      matched++;

      const localRel = normalizeLocalPicRelAny(rel);
      const out = await fetchJson(url('/api/admin/weapons'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          dataset: 'sungWeapons',
          action: 'update',
          originalName: w.name,
          item: {
            name: w.name,
            image: localRel,
            image_build: localRel,
            rarity: String(w.rarity || 'SSR').toUpperCase(),
            element: String(w.element || 'None'),
            maxGrowth: ADV_MAX
          }
        })
      });

      if (!out.ok) failed++;
      else updated++;
    }

    return { checked, matched, updated, skipped, failed };
  }

  // --------------------------
  // Modal helper (local) — same feel as Hunters
  // --------------------------
  function ensureSungWeaponsModal() {
    if (document.getElementById('sw-modal-css')) return;

    const s = document.createElement('style');
    s.id = 'sw-modal-css';
    s.textContent = `
      .swm-backdrop{position:fixed;inset:0;display:none;align-items:center;justify-content:center;z-index:9999;background:rgba(2,6,23,.55);backdrop-filter:blur(2px)}
      .swm-modal{width:min(760px,92vw);border-radius:1rem;border:1px solid rgba(148,163,184,.28);background:rgba(2,6,23,.92);color:#e2e8f0;box-shadow:0 18px 60px rgba(0,0,0,.55);overflow:hidden}
      .swm-hd{padding:14px 16px;border-bottom:1px solid rgba(148,163,184,.20);font-weight:900;letter-spacing:.2px}
      .swm-bd{padding:16px;max-height:65vh;overflow:auto}
      .swm-ft{padding:12px 16px;border-top:1px solid rgba(148,163,184,.20);display:flex;gap:.5rem;justify-content:flex-end}
      .swm-btn{height:40px;padding:0 14px;border-radius:12px;border:1px solid rgba(148,163,184,.28);background:rgba(15,23,42,.55);color:#e2e8f0;cursor:pointer;font-weight:900}
      .swm-btn.primary{background:rgba(255,255,255,.95);color:#0f172a;border-color:rgba(226,232,240,.85)}
      .swm-btn.ghost{background:transparent}

      @media (max-width: 720px){
        .swm-backdrop{
          align-items:center;
          justify-content:center;
          padding: 16px 0;
        }
        .swm-modal{
          width: min(560px, 92vw);
          max-width: none;
          border-radius: 18px;
        }
        .swm-bd{ max-height: 70vh; }
      }
    `;
    document.head.appendChild(s);

    const root = document.createElement('div');
    root.id = 'sw-modal-root';
    root.className = 'swm-backdrop';
    root.innerHTML = `
      <div class="swm-modal">
        <div class="swm-hd" id="swmTitle"></div>
        <div class="swm-bd" id="swmBody"></div>
        <div class="swm-ft">
          <button class="swm-btn ghost" id="swmClose" type="button">CLOSE</button>
          <button class="swm-btn primary" id="swmPrimary" type="button" style="display:none">SAVE</button>
        </div>
      </div>
    `;
    document.body.appendChild(root);

    function hide() {
      root.style.display = 'none';
      const bd = document.getElementById('swmBody');
      if (bd) bd.innerHTML = '';
      const prim = document.getElementById('swmPrimary');
      if (prim) prim.onclick = null;
    }

    function show(title, bodyBuilder, onPrimary, primaryText) {
      const t = document.getElementById('swmTitle');
      if (t) t.textContent = title || '';

      const bd = document.getElementById('swmBody');
      if (bd) {
        bd.innerHTML = '';
        const built = (typeof bodyBuilder === 'function') ? bodyBuilder() : null;
        if (built) bd.append(built);
      }

      const prim = document.getElementById('swmPrimary');
      if (prim) {
        const hasPrimary = typeof onPrimary === 'function';
        prim.style.display = hasPrimary ? 'inline-flex' : 'none';
        prim.textContent = primaryText || 'SAVE';
        prim.onclick = hasPrimary ? onPrimary : null;
      }

      root.style.display = 'flex';
      const close = document.getElementById('swmClose');
      if (close) close.onclick = hide;
    }

    root.addEventListener('click', (e) => { if (e.target === root) hide(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hide(); });

    window.__sw_hideModal = hide;
    window.__sw_showModal = show;
  }

  function swShowModal(title, bodyBuilder, onPrimary = null, primaryText = 'SAVE') {
    ensureSungWeaponsModal();
    window.__sw_showModal?.(title, bodyBuilder, onPrimary, primaryText);
  }

  function swHideModal() {
    try { window.__sw_hideModal?.(); } catch {}
  }

  // --------------------------
  // Admin helpers (hide Admin tab like Admin.js)
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

      if (STATE.subtab === 'admin' && !isAdminTabVisible()) {
        setSubtab('builds');
      }
      render();
    } catch {}
  });

  // --------------------------
  // Global order (ALL users)
  // --------------------------
  async function loadGlobalOrder() {
    try {
      const r = await fetch(url('/api/global/order?dataset=sungWeapons'), { cache: 'no-store', credentials: 'include' });
      if (!r.ok) return [];
      const j = await r.json().catch(() => ({}));
      return Array.isArray(j?.order) ? j.order : [];
    } catch {
      return [];
    }
  }

  async function saveGlobalOrder(order) {
    const out = await fetchJson(url('/api/global/order'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ dataset: 'sungWeapons', order: Array.isArray(order) ? order : [] })
    });
    if (!out.ok) throw new Error(out?.data?.error || `HTTP ${out.status}`);
    return true;
  }

  function applyOrder(list, order) {
    const ord = Array.isArray(order) ? order : [];
    const map = new Map();
    ord.forEach((name, idx) => map.set(String(name), idx));

    const copy = [...(list || [])];
    copy.sort((a, b) => {
      const ia = map.has(a.name) ? map.get(a.name) : 1e9;
      const ib = map.has(b.name) ? map.get(b.name) : 1e9;
      if (ia !== ib) return ia - ib;
      return String(a.name || '').localeCompare(String(b.name || ''));
    });
    return copy;
  }

  // --------------------------
  // Icons
  // --------------------------
  const ICONS = {
    element: {
      fire:  url('/picture/Element/Fires.png'),
      water: url('/picture/Element/Waters.png'),
      wind:  url('/picture/Element/Winds.png'),
      light: url('/picture/Element/Lights.png'),
      dark:  url('/picture/Element/Darkness.png'),
      none:  url('/picture/Element/NONE.png')
    },
    rarity: {
      SSR: url('/picture/Rarity/SSR.png'),
      SR:  url('/picture/Rarity/SR.png'),
      R:   url('/picture/Rarity/R.png')
    }
  };

  function normElement(e) {
    const raw = String(e ?? '').trim().toLowerCase();
    const alias = { non: 'none', neutral: 'none', 'no element': 'none' };
    return alias[raw] ?? raw;
  }

  // --------------------------
  // Advancement (EXACT like Hunter.js)
  // --------------------------
  const ADV_MAX = 11;

  function advToDisplay(advIndex) {
    const a = clampInt(advIndex, 0, ADV_MAX);

    if (a === 0) return { type: 'dontown', text: "Don't own" };
    if (a === 1) return { type: 'stars', text: "✧✧✧✧✧" };

    if (a >= 2 && a <= 5) {
      const filled = "✦".repeat(a - 1);
      const empty  = "✧".repeat(6 - a);
      return { type: 'stars', text: `${filled}${empty}` };
    }

    if (a === 6) return { type: 'stars', text: "✦✦✦✦✦" };

    return { type: 'stars', text: `✦✦✦✦✦${a - 6}` };
  }

  function getWeaponMaxAdv(_w) {
    return ADV_MAX;
  }

  // --------------------------
  // Rarity icons
  // --------------------------
  function svgDataUri(svg) {
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  }

  function rarityFilterIconSrc(r) {
    const R = String(r || '').toUpperCase();

    if (R === 'R') {
      return svgDataUri(`
        <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">
          <defs>
            <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stop-color="#1e3759"/>
              <stop offset="1" stop-color="#0375b3"/>
            </linearGradient>
          </defs>
          <rect x="6" y="6" width="52" height="52" rx="14" fill="url(#g)" stroke="#93c5fd" stroke-width="2"/>
          <text x="32" y="40" font-size="22" font-family="Arial" font-weight="900" text-anchor="middle" fill="#ffffff">R</text>
        </svg>
      `.trim());
    }

    if (R === 'SR') {
      return svgDataUri(`
        <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">
          <defs>
            <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stop-color="#6d28d9"/>
              <stop offset="1" stop-color="#a855f7"/>
            </linearGradient>
          </defs>
          <rect x="6" y="6" width="52" height="52" rx="14" fill="url(#g)" stroke="#d8b4fe" stroke-width="2"/>
          <text x="32" y="40" font-size="22" font-family="Arial" font-weight="900" text-anchor="middle" fill="#ffffff">SR</text>
        </svg>
      `.trim());
    }

    return svgDataUri(`
      <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">
        <defs>
          <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#b91c1c"/>
            <stop offset="1" stop-color="#ef4444"/>
          </linearGradient>
        </defs>
        <rect x="6" y="6" width="52" height="52" rx="14" fill="url(#g)" stroke="#fecaca" stroke-width="2"/>
        <text x="32" y="40" font-size="20" font-family="Arial" font-weight="900" text-anchor="middle" fill="#ffffff">SSR</text>
      </svg>
    `.trim());
  }

  function rarityWeaponIconSrc(r) {
    const R = String(r || 'SSR').toUpperCase();
    return ICONS.rarity[R] || ICONS.rarity.SSR;
  }

  function buildsRarityClass(rarity) {
    const r = String(rarity || 'SSR').toUpperCase();
    if (r === 'SSR') return 'rar-SSR';
    if (r === 'SR') return 'rar-SR';
    if (r === 'R') return 'rar-R';
    return 'rar-SSR';
  }

  // --------------------------
  // CSS scoping (Sung Weapons only)
  // --------------------------
  const SW_SCOPE = '#content [data-sla-page="sung-weapons"]';

  function scopeCss(css, scope) {
    const isAlreadyScoped = (sel) => {
      if (!sel) return false;
      return (
        sel.includes('[data-sla-page="sung-weapons"]') ||
        (scope && sel.includes(scope))
      );
    };

    const scopeChunk = (chunk) =>
      chunk.replace(/(^|})\s*([^{@}][^{]*)\{/g, (m, brace, selectorPart) => {
        const selectors = selectorPart
          .split(',')
          .map(s => s.trim())
          .filter(Boolean)
          .map(sel => {
            if (isAlreadyScoped(sel)) return sel;
            if (/#content\b/.test(sel)) {
              return sel.replace(/(^|[\s>+~,(])#content\b/g, `$1${scope}`);
            }
            return `${scope} ${sel}`;
          })
          .join(', ');

        return `${brace} ${selectors} {`;
      });

    let out = '';
    let i = 0;

    while (i < css.length) {
      const rest = css.slice(i);
      const m = rest.match(/@media[^{]*\{/);
      if (!m) {
        out += scopeChunk(rest);
        break;
      }

      const start = i + m.index;
      out += scopeChunk(css.slice(i, start));

      const openBraceIdx = start + m[0].length - 1;
      let depth = 0;
      let j = openBraceIdx;

      for (; j < css.length; j++) {
        const ch = css[j];
        if (ch === '{') depth++;
        else if (ch === '}') {
          depth--;
          if (depth === 0) { j++; break; }
        }
      }

      const mediaBlock = css.slice(start, j);
      const headEnd = mediaBlock.indexOf('{') + 1;
      const inner = mediaBlock.slice(headEnd, -1);

      out += mediaBlock.slice(0, headEnd) + scopeChunk(inner) + '}';
      i = j;
    }

    return out;
  }

  // --------------------------
  // CSS injection
  // --------------------------
  function injectLocalStyles() {
    if (document.getElementById('sung-weapons-module-style')) return;

    const s = document.createElement('style');
    s.id = 'sung-weapons-module-style';
    const rawCss = `
      [data-sla-page="sung-weapons"],[data-sla-page="sung-weapons"] *{box-sizing:border-box}
      [data-sla-page="sung-weapons"]{overflow-x:hidden}

      .sw-grid{
        display:grid;
        gap:12px;
        grid-template-columns: repeat(auto-fill, minmax(160px,1fr));
      }

      .sw-card{
        position:relative;
        border-radius:16px;
        overflow:hidden;
        border:1px solid rgba(100,116,139,.35);
        box-shadow: 0 6px 16px rgba(0,0,0,.12);
        aspect-ratio: 3 / 4;
        cursor:pointer;
        transition: transform .12s ease, box-shadow .12s ease, opacity .2s ease;
        outline:none;
      }
      .sw-card:hover{
        transform: translateY(-2px);
        box-shadow: 0 10px 22px rgba(0,0,0,.18);
      }
      .sw-card:active{
        transform: translateY(0px) scale(0.99);
      }
      .sw-card:focus-visible{
        box-shadow: 0 0 0 3px rgba(255,255,255,.35), 0 0 0 6px rgba(59,130,246,.45);
      }
      .dark .sw-card:focus-visible{
        box-shadow: 0 0 0 3px rgba(15,23,42,.65), 0 0 0 6px rgba(59,130,246,.55);
      }

      .avatar.solo.rar-R   { background: linear-gradient(180deg,#1e3759 0%, #0375b3 53%); }
      .avatar.solo.rar-SR  { background: linear-gradient(180deg,#343659 0%, #8a5fcc 53%); }
      .avatar.solo.rar-SSR { background: linear-gradient(180deg,#3b3550 0%, #a7353a 53%); }

      .sw-card .portrait{
        position:absolute;
        inset:0;
        width:100%;
        height:100%;
        object-fit:cover;
      }

      .sw-badges{
        position:absolute;
        top:8px;
        left:8px;
        display:flex;
        flex-direction:column;
        gap:6px;
        z-index:2;
      }
      .sw-badges img{
        width:28px;
        height:28px;
        object-fit:contain;
      }

      .sw-card .name{
        position:absolute;
        left:0; right:0; bottom:0;
        padding:10px 12px;
        text-align:center;
        font-weight:700;
        z-index:2;
        color:#e2e8f0;
        text-shadow: 0 1px 2px rgba(0,0,0,.55);
        background:
          linear-gradient(to top, rgba(2,6,23,.65) 0%, rgba(2,6,23,.35) 60%, rgba(2,6,23,0) 100%);
        backdrop-filter: blur(2px);
      }

      .hunters-toolbar{
        display:flex;align-items:center;gap:14px;padding:10px 12px;border-radius:14px;border:1px solid rgba(100,116,139,.35);
        background:rgba(15,23,42,.35);flex-wrap:wrap;max-width:100%;
        box-sizing:border-box;
      }
      .hunters-toolbar .search{
        flex:1 1 320px;
        width:100%;
        max-width:520px;
        min-width:0;
        height:38px;
        padding:0 14px;
        border-radius:12px;
        border:1px solid rgba(148,163,184,.35);
        outline:none;color:#e2e8f0;background:rgba(15,23,42,.55);
        font-weight:900;
      }
      .icon-row{display:flex;align-items:center;gap:8px}
      .filter-group{
        display:flex;align-items:center;gap:10px;
        padding-left:14px;border-left:1px solid rgba(148,163,184,.18);
        min-width:0;
      }
      .filter-group:first-of-type{padding-left:0;border-left:none}
      .icon-btn{width:32px;height:32px;border-radius:10px;border:1px solid rgba(148,163,184,.35);background:rgba(15,23,42,.55);
        display:grid;place-items:center;cursor:pointer;padding:0;flex:0 0 auto}
      .icon-btn.is-active{border-color:rgba(251,191,36,.85);box-shadow:0 0 0 3px rgba(251,191,36,.22)}
      .icon-btn img{width:22px;height:22px;object-fit:contain;pointer-events:none}
      .icon-btn.rarity img{width:26px;height:26px}

      .toolbar-right{margin-left:auto;display:flex;align-items:center;gap:10px;flex-wrap:wrap}
      .reset-btn{height:38px;padding:0 14px;border-radius:12px;border:1px solid rgba(239,68,68,.55);background:rgba(239,68,68,.15);
        color:#fecaca;font-weight:900;display:flex;align-items:center;gap:8px;cursor:pointer}
      .reset-x{display:grid;place-items:center;width:20px;height:20px;border-radius:7px;background:rgba(239,68,68,.30);
        border:1px solid rgba(239,68,68,.55);color:#fff;font-size:14px;font-weight:900;line-height:1}
      .edit-btn{height:38px;padding:0 14px;border-radius:12px;border:1px solid rgba(148,163,184,.35);background:rgba(255,255,255,.92);
        color:#0f172a;font-weight:900;cursor:pointer}
      .edit-btn.is-on{background:rgba(251,191,36,.95);color:#0f172a;border-color:rgba(253,230,138,.85);box-shadow:0 0 0 3px rgba(251,191,36,.12)}
      .filters-btn{
        height:38px;
        padding:0 14px;
        border-radius:12px;
        border:1px solid rgba(148,163,184,.35);
        background:rgba(15,23,42,.55);
        color:#e2e8f0;
        font-weight:900;
        cursor:pointer;
        display:none;
        align-items:center;
        justify-content:center;
        gap:8px;
        margin-bottom:14px;
        width:100%;
      }

      .sweapon-filter-backdrop{position:fixed;inset:0;display:none;align-items:center;justify-content:center;z-index:9998;background:rgba(2,6,23,.58);backdrop-filter:blur(3px);padding:14px}
      .sweapon-filter-modal{width:calc(100vw - 28px);max-width:420px;max-height:80vh;border-radius:16px;border:1px solid rgba(148,163,184,.28);background:rgba(2,6,23,.94);color:#e2e8f0;box-shadow:0 18px 60px rgba(0,0,0,.55);overflow:hidden;display:flex;flex-direction:column}
      .sweapon-filter-hd{padding:14px 16px;border-bottom:1px solid rgba(148,163,184,.20);font-weight:1000;color:#facc15}
      .sweapon-filter-bd{padding:16px;overflow:auto;display:grid;gap:14px}
      .sweapon-filter-ft{padding:12px 16px;border-top:1px solid rgba(148,163,184,.20);display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap}
      .sweapon-filter-search{width:100%;height:38px;padding:0 14px;border-radius:12px;border:1px solid rgba(148,163,184,.35);outline:none;color:#e2e8f0;background:rgba(15,23,42,.55);font-weight:900}
      .sweapon-filter-icons{display:flex;align-items:center;gap:8px;flex-wrap:wrap;overflow-x:hidden}
      .sweapon-filter-icons .icon-btn{width:36px;height:36px;border-radius:10px}
      .sweapon-filter-icons .icon-btn img{width:24px;height:24px}

      .tip{ position:relative; z-index:auto; }
      .tip:hover{ z-index:auto; }
      .tip:hover::after{
        content:attr(data-tip);
        position:absolute;
        left:50%;
        bottom:calc(100% + 8px);
        transform:translateX(-50%);
        white-space:nowrap;
        background:rgba(15,23,42,.92);
        border:1px solid rgba(148,163,184,.25);
        color:#e2e8f0;
        font-weight:900;
        padding:6px 10px;
        border-radius:10px;
        font-size:12px;
        box-shadow:0 10px 26px rgba(0,0,0,.28);
        pointer-events:none;
        z-index:50;
      }
      .tip:hover::before{
        content:'';
        position:absolute;
        left:50%;
        transform:translateX(-50%);
        bottom:calc(100% + 2px);
        width:0;height:0;
        border-left:6px solid transparent;
        border-right:6px solid transparent;
        border-top:6px solid rgba(15,23,42,.92);
        pointer-events:none;
        z-index:50;
      }

      @media (max-width: 834px){
        .hunters-toolbar{display:none}
        .filters-btn{display:flex;width:100%}
        .filter-group{padding-left:0;border-left:none}
        .icon-row{flex-wrap:wrap;overflow-x:hidden;padding-bottom:0}
        .icon-btn{width:30px;height:30px;border-radius:10px}
        .icon-btn img{width:20px;height:20px}
        .icon-btn.rarity img{width:24px;height:24px}
      }

      .hunters-cards-grid{display:grid;gap:14px;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));width:100%}
      .hunter-progress-card{
        position:relative;
        border-radius:18px;
        border:1px solid rgba(148,163,184,.26);
        background:linear-gradient(180deg,rgba(51,65,85,.45) 0%, rgba(15,23,42,.78) 100%);
        box-shadow:0 12px 28px rgba(0,0,0,.18);
        padding:16px;
        overflow:visible;
      }
      .hunter-progress-card.rar-R{background:linear-gradient(0deg,rgba(30,55,89,.42) 0%, rgba(3,117,179,.18) 100%), rgba(15,23,42,.88)}
      .hunter-progress-card.rar-SR{background:linear-gradient(0deg,rgba(52,54,89,.44) 0%, rgba(138,95,204,.18) 100%), rgba(15,23,42,.88)}
      .hunter-progress-card.rar-SSR{background:linear-gradient(0deg,rgba(59,53,80,.46) 0%, rgba(167,53,58,.18) 100%), rgba(15,23,42,.88)}
      .hunter-progress-card::before{content:'';position:absolute;inset:0;border-radius:inherit;pointer-events:none;box-shadow:inset 0 1px 0 rgba(255,255,255,.06)}
      .hunter-progress-head,.hunter-progress-owner-head{display:flex;gap:14px;align-items:center}
      .hunter-progress-avatar,.hunter-progress-owner-thumb{
        width:72px;height:72px;border-radius:18px;overflow:hidden;display:grid;place-items:center;
        background:rgba(15,23,42,.52);border:1px solid rgba(148,163,184,.22);flex:0 0 auto
      }
      .hunter-progress-avatar img,.hunter-progress-owner-thumb img{width:100%;height:100%;object-fit:cover}
      .hunter-progress-meta,.hunter-progress-owner-meta{min-width:0;display:grid;gap:8px}
      .hunter-progress-name,.hunter-progress-owner-name{font-size:18px;font-weight:900;color:#e2e8f0;line-height:1.15}
      .hunter-progress-owner-name{font-size:16px}
      .hunter-progress-badges{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
      .hunter-progress-badge{
        height:36px;min-width:36px;padding:0 13px;border-radius:999px;display:inline-flex;align-items:center;justify-content:center;
        border:1px solid rgba(148,163,184,.22);background:rgba(255,255,255,.04);color:#f8d574;font-weight:900;font-size:13px
      }
      .hunter-progress-badge.icon{padding:0;width:41px}
      .hunter-progress-badge.icon img{width:31px;height:31px;object-fit:contain}
      .hunter-progress-badge.rarity-icon{padding:0;width:54px;background:transparent;border:0}
      .hunter-progress-badge.rarity-icon img{width:50px;height:32px;object-fit:contain}
      .hunter-progress-stats,.hunter-progress-owner-stats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:14px}
      .hunter-progress-stat{
        min-width:0;border-radius:14px;border:1px solid rgba(148,163,184,.18);
        background:rgba(255,255,255,.04);padding:12px;display:grid;gap:10px;overflow:visible
      }
      .hunter-progress-stat-full{grid-column:1 / -1}
      .hunter-progress-stat-label{font-size:12px;font-weight:900;color:rgba(226,232,240,.72);text-transform:uppercase;text-align:center;display:flex;align-items:center;justify-content:center}
      .hunter-progress-stat-value{font-size:20px;font-weight:900;color:#e2e8f0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:center;display:flex;justify-content:center;align-items:center}
      .hunter-progress-stat-value.dontown{font-size:14px}
      .hunter-progress-level-chip{
        min-width:68px;height:46px;padding:0 14px;border-radius:11px;background:linear-gradient(180deg,#8b97a6 0%, #6c7788 100%);
        color:#f8fafc;font-size:22px;font-weight:1000;display:inline-flex;align-items:center;justify-content:center;box-shadow:inset 0 1px 0 rgba(255,255,255,.2)
      }
      .hunter-progress-level-input,.hunter-edit-select{
        width:min(180px,100%);height:42px;border-radius:12px;border:1px solid rgba(148,163,184,.24);background:rgba(15,23,42,.72);
        color:#e2e8f0;font-weight:900;font-size:20px;text-align:center;outline:none;padding:0 12px
      }
      .hunter-edit-select{font-size:18px;padding-right:30px}
      .hunter-progress-owner-card{margin-top:16px;padding-top:16px;border-top:1px solid rgba(148,163,184,.16);overflow:visible}
      .hunter-progress-owner-empty{margin-top:16px;padding-top:16px;border-top:1px solid rgba(148,163,184,.16);color:rgba(226,232,240,.62);font-weight:800;text-align:center}
      .hunter-progress-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:16px;padding-top:14px;border-top:1px solid rgba(148,163,184,.16)}
      .hunter-progress-btn{height:40px;border:0;border-radius:8px;font-weight:900;cursor:pointer;color:#0f172a}
      .hunter-progress-btn.view{background:#22d3ee}
      .hunter-progress-btn.edit{background:#2563eb;color:#eff6ff}
      .hunter-progress-bulk-card{border-color:rgba(168,85,247,.35);box-shadow:0 0 0 1px rgba(168,85,247,.10), 0 12px 28px rgba(0,0,0,.18);background:linear-gradient(180deg,rgba(88,28,135,.24) 0%, rgba(15,23,42,.82) 100%)}
      .hunter-progress-all-badge{white-space:pre-line;text-align:center}
      .hunter-progress-bulk-sub{font-size:13px;font-weight:700;color:rgba(226,232,240,.68)}

      @media (max-width: 900px){
        .hunters-cards-grid{grid-template-columns:1fr}
      }
      @media (max-width: 520px){
        .hunter-progress-card{padding:14px}
        .hunter-progress-avatar,.hunter-progress-owner-thumb{width:64px;height:64px;border-radius:16px}
        .hunter-progress-name{font-size:17px}
        .hunter-progress-stats,.hunter-progress-owner-stats{grid-template-columns:repeat(2,minmax(0,1fr))}
        .hunter-progress-level-chip{font-size:24px;min-width:58px}
        .hunter-progress-stat-full{grid-column:1 / -1}
        .hunter-progress-btn{height:42px}
      }

      .admin-card{background:rgba(2,6,23,.20);border:1px solid rgba(148,163,184,.25);border-radius:18px;padding:14px}
      .admin-title{font-size:18px;font-weight:900;color:#e2e8f0}
      .admin-sub{font-size:13px;color:rgba(148,163,184,.95);font-weight:700}
      .admin-row{display:flex;flex-wrap:wrap;gap:10px;align-items:center;min-width:0}
      .admin-in{
        height:40px;padding:0 12px;border-radius:12px;border:1px solid rgba(148,163,184,.25);background:rgba(15,23,42,.55);
        color:#e2e8f0;outline:none;font-weight:900;min-width:0;
      }
      .admin-btn{height:40px;padding:0 14px;border-radius:12px;border:1px solid rgba(148,163,184,.25);background:rgba(15,23,42,.55);
        color:#e2e8f0;font-weight:900;cursor:pointer}
      .admin-btn.primary{background:rgba(255,255,255,.92);color:#0f172a}
      .admin-grid{display:grid;gap:10px}
      @media (max-width:640px){
        .sweapon-settings-row{display:grid !important;grid-template-columns:1fr !important;align-items:stretch !important;gap:10px !important}
        .sweapon-settings-row > *, .sweapon-settings-row input, .sweapon-settings-row button{width:100% !important;min-width:0 !important;max-width:100% !important;box-sizing:border-box !important}
        .sweapon-admin-add-row{display:grid !important;grid-template-columns:1fr !important;width:100%}
        .sweapon-admin-add-row > *, .sweapon-admin-add-row input, .sweapon-admin-add-row select, .sweapon-admin-add-row button{
          width:100% !important;min-width:0 !important;max-width:100% !important;box-sizing:border-box !important;
        }
        .sweapon-pic-select{min-width:0 !important;width:100% !important;max-width:100% !important;box-sizing:border-box !important}
        .sweapon-pic-select > input{width:100% !important;max-width:100% !important;box-sizing:border-box !important}
        .sweapon-pic-select > div[style*="position:absolute"]{left:0 !important;right:0 !important;width:100% !important;max-width:100% !important;overflow-x:hidden !important;box-sizing:border-box !important}
        .sweapon-pic-select > div[style*="position:absolute"] .truncate{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      }
    `;
    const css = scopeCss(rawCss, SW_SCOPE);
    s.textContent = css;
    document.head.appendChild(s);
  }

  // --------------------------
  // Toggle helpers
  // --------------------------
  function toggleInArray(arr, val) {
    const a = Array.isArray(arr) ? arr : [];
    const v = String(val);
    const idx = a.indexOf(v);
    if (idx >= 0) return a.filter((x) => x !== v);
    return [...a, v];
  }

  function hasInArray(arr, val) {
    return Array.isArray(arr) && arr.includes(String(val));
  }

  // --------------------------
  // Dropdown config
  // --------------------------
  const LS_SUBTAB = 'sungWeapons.ui.subtab';

  const DEFAULT_CFG = {
    levelMax: 100
  };

  async function loadSungWeaponsDropdowns() {
    try {
      const r = await fetch(url('/api/public/sung-weapons-dropdowns'), { cache: 'no-store' });
      if (!r.ok) return { ...DEFAULT_CFG };

      const j = await r.json().catch(() => ({}));
      const levelMax = clampInt(j?.levelMax ?? DEFAULT_CFG.levelMax, 1, 999);

      return { levelMax };
    } catch {
      return { ...DEFAULT_CFG };
    }
  }

  // --------------------------
  // Per-user progress helpers
  // --------------------------
  function normKey(s) {
    return String(s || '')
      .trim()
      .toLowerCase()
      .replaceAll('’', "'")
      .replace(/\s+/g, ' ');
  }

  function normalizeEntry(v) {
    if (v === true) return { adv: 1, lvl: 1 };

    const o = (v && typeof v === 'object') ? v : {};

    const advRaw = (o.adv ?? o.advancement ?? o.growth ?? o.Growth ?? 0);
    const adv = clampInt(advRaw, 0, ADV_MAX);

    const lvRaw = (o.lvl ?? o.level ?? o.lv ?? o.maxLv ?? o.max_lvl ?? 1);
    const lvl = clampInt(lvRaw, 1, (STATE.cfg?.levelMax ?? DEFAULT_CFG.levelMax));

    return { adv, lvl };
  }

  function getMyEntry(name) {
    const obj = STATE.collection.progress || {};
    if (obj[name]) return normalizeEntry(obj[name]);

    const target = normKey(name);
    for (const [k, v] of Object.entries(obj)) {
      if (normKey(k) === target) return normalizeEntry(v);
    }
    return { adv: 0, lvl: 1 };
  }

  function setMyEntry(name, patch) {
    const obj = STATE.collection.progress || (STATE.collection.progress = {});
    const cur = getMyEntry(name);
    const next = { ...cur, ...(patch || {}) };

    next.adv = clampInt(next.adv, 0, ADV_MAX);
    next.lvl = clampInt(next.lvl, 1, (STATE.cfg?.levelMax ?? DEFAULT_CFG.levelMax));

    obj[name] = next;
    STATE.collection.dirty = true;
  }

  function isOwned(name) {
    const e = getMyEntry(name);
    return clampInt(e?.adv, 0, ADV_MAX) >= 1;
  }

  function getTotalUnique() {
    return new Set((STATE.data.weapons || []).map(w => String(w?.name || '').trim()).filter(Boolean)).size;
  }

  function getOwnedCountAll() {
    const unique = new Set((STATE.data.weapons || []).map(w => String(w?.name || '').trim()).filter(Boolean));
    let owned = 0;
    for (const name of unique) {
      if (isOwned(name)) owned++;
    }
    return owned;
  }

  async function loadMySungWeaponsProgress() {
    if (STATE.collection.loaded || STATE.collection.loading) return;

    const me = window.STATE?.me || null;
    if (!me) {
      STATE.session.loggedIn = false;
      STATE.collection.progress = {};
      STATE.collection.loaded = true;
      return;
    }

    STATE.collection.loading = true;
    try {
      const r = await fetch(url('/api/data'), { credentials: 'include', cache: 'no-store' });

      if (r.status === 401 || r.status === 403) {
        STATE.session.loggedIn = false;
        STATE.collection.progress = {};
        STATE.collection.loaded = true;
        return;
      }
      STATE.session.loggedIn = true;

      if (!r.ok) {
        STATE.collection.progress = {};
        STATE.collection.loaded = true;
        return;
      }

      const j = await r.json().catch(() => ({}));
      const src = (j && typeof j.sungWeapons === 'object' && j.sungWeapons) ? j.sungWeapons : {};
      STATE.collection.progress = { ...src };
      STATE.collection.loaded = true;
    } catch (e) {
      console.error('loadMySungWeaponsProgress failed:', e);
      STATE.collection.progress = {};
      STATE.collection.loaded = true;
    } finally {
      STATE.collection.loading = false;
    }
  }

  function buildSavePayload() {
    const out = {};
    const p = STATE.collection.progress || {};
    for (const [name, v] of Object.entries(p)) {
      const e = normalizeEntry(v);
      const adv = clampInt(e?.adv, 0, ADV_MAX);
      if (adv <= 0) continue;

      const lvl = clampInt(e?.lvl, 1, (STATE.cfg?.levelMax ?? DEFAULT_CFG.levelMax));

      out[name] = {
        adv,
        growth: adv,
        lvl
      };
    }
    return out;
  }

  async function saveMySungWeaponsProgress() {
    if (!STATE.session.loggedIn) return false;
    if (STATE.collection.saving) return false;
    if (!STATE.collection.dirty) return true;

    STATE.collection.saving = true;
    try {
      const payload = { sungWeapons: buildSavePayload() };

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

      STATE.collection.dirty = false;
      toast('Saved ✅');
      return true;
    } catch (e) {
      console.error('saveMySungWeaponsProgress failed:', e);
      toast('Save failed');
      return false;
    } finally {
      STATE.collection.saving = false;
    }
  }

  // --------------------------
  // State
  // --------------------------
  const STATE = {
    subtab: (localStorage.getItem(LS_SUBTAB) || 'builds'),
    filters: {
      name: '',
      rarities: [],
      elements: []
    },
    data: {
      weapons: []
    },

    cfg: { ...DEFAULT_CFG },

    session: { loggedIn: true },

    collection: {
      loaded: false,
      loading: false,
      saving: false,
      dirty: false,
      progress: {}
    },

    bulk: { adv: 0, lvl: 1 },

    ui: {
      hideAdminButtons: getHideAdminButtons(),
      editMode: false
    },

    globalOrder: [],

    loading: false,
    error: null
  };

  function setSubtab(v) {
    STATE.subtab = v;
    try { localStorage.setItem(LS_SUBTAB, v); } catch {}
  }

  function resetFilters() {
    STATE.filters.name = '';
    STATE.filters.rarities = [];
    STATE.filters.elements = [];
  }

  // --------------------------
  // Data loading
  // --------------------------
  async function fetchJsonTry(paths) {
    let lastErr = null;
    for (const p of paths) {
      try {
        const r = await fetch(url(p), { cache: 'no-store' });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return await r.json();
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr || new Error('No data');
  }

  async function loadWeapons() {
    STATE.loading = true;
    STATE.error = null;

    try {
      const j = await fetchJsonTry([
        '/api/public/sung-weapons'
      ]);

      const arr = Array.isArray(j) ? j : (Array.isArray(j?.items) ? j.items : []);
      if (!Array.isArray(arr)) throw new Error('Invalid sung weapons catalog');

      STATE.data.weapons = arr.map((w) => {
        const name = w.name || w.weapon_name || w.id || 'Unknown Weapon';
        const rarity = (w.rarity || 'SSR');
        const element = (w.element || 'None');
        const image = w.image || w.imageUrl || w.img || '';
        const image_build = w.image_build || w.imageBuild || image;
        const maxGrowth = ADV_MAX;

        return { name, rarity, element, image, image_build, maxGrowth };
      });

      const ord = await loadGlobalOrder();
      STATE.globalOrder = ord;
      STATE.data.weapons = applyOrder(STATE.data.weapons, ord);

    } catch (e) {
      console.error('Sung weapons load failed:', e);
      STATE.error = 'Failed to load Sung weapons data.';
      STATE.data.weapons = [];
    } finally {
      STATE.loading = false;
    }
  }

  // --------------------------
  // Filtering
  // --------------------------
  function filteredWeapons() {
    const f = STATE.filters;

    const rarityFilterActive = f.rarities.length > 0;
    const elementFilterActive = f.elements.length > 0;

    return (STATE.data.weapons || []).filter((w) => {
      if (f.name && !String(w.name || '').toLowerCase().includes(String(f.name).toLowerCase())) return false;

      if (rarityFilterActive) {
        const rr = String(w.rarity || 'SSR').toUpperCase();
        if (!f.rarities.includes(rr)) return false;
      }

      if (elementFilterActive) {
        const ee = normElement(w.element);
        if (!f.elements.includes(ee)) return false;
      }

      return true;
    });
  }

  // --------------------------
  // UI pieces
  // --------------------------
  function renderHeader(root) {
    const top = el('div', { class: 'flex items-center justify-between gap-3 mb-4' });

    top.append(
      el('div', { class: 'min-w-0' },
        el('div', { class: 'text-2xl font-extrabold text-yellow-400 leading-tight' }, 'Sung Jinwoo – Weapons'),
        el('div', { class: 'text-sm text-white' }, 'Builds and your personal list')
      )
    );

    const right = el('div', { class: 'flex items-center gap-2 flex-wrap justify-end' });

    const total = getTotalUnique();
    const owned = getOwnedCountAll();

    const count = el(
      'div',
      { class: 'px-3 py-1 rounded-full border border-slate-700 bg-slate-800 text-sm font-semibold text-white' },
      `${owned}/${total || 0}`
    );

    right.append(count);
    top.append(right);
    root.append(top);
  }

  function subtabBtnClass(active) {
    return [
      'h-10 rounded-xl border text-base font-semibold transition-colors',
      active
        ? 'bg-yellow-400 text-black shadow border-yellow-300'
        : 'bg-glass text-slate-200 hover:bg-slate-800/50 border-slate-700/60'
    ].join(' ');
  }

  function renderSubtabs(root) {
    const tabs = [
      { key: 'builds', label: 'Builds' }
    ];
    if (STATE.session.loggedIn) tabs.push({ key: 'list', label: 'My list' });
    if (isAdminTabVisible()) tabs.push({ key: 'admin', label: 'Admin' });

    const cols = tabs.length;
    const gridCols = cols === 3 ? 'grid-cols-3' : cols === 2 ? 'grid-cols-2' : 'grid-cols-1';
    const bar = el('div', { class: 'grid ' + gridCols + ' gap-2 mb-4' });

    const btn = (key, label) => {
      const active = STATE.subtab === key;
      const b = el(
        'button',
        {
          class: subtabBtnClass(active)
        },
        label
      );

      b.addEventListener('click', async () => {
        if (STATE.subtab === key) return;

        if (STATE.ui.editMode && STATE.subtab === 'list') {
          const ok = await saveMySungWeaponsProgress();
          if (!ok) toast('Save failed ❌');
          STATE.ui.editMode = false;
        }

        setSubtab(key);

        if (key === 'list') await loadMySungWeaponsProgress();

        render();
      });

      return b;
    };

    if (STATE.subtab === 'admin' && !isAdminTabVisible()) {
      setSubtab('builds');
    }
    if (STATE.subtab === 'list' && !STATE.session.loggedIn) {
      setSubtab('builds');
    }

    for (const t of tabs) bar.append(btn(t.key, t.label));
    root.append(bar);
  }

  function iconButton({ title, iconSrc, active, className = '', onClick }) {
    const b = el('button', {
      type: 'button',
      class: `icon-btn ${className} ${active ? 'is-active' : ''}`,
      title,
      'aria-label': title
    });
    b.append(el('img', { src: iconSrc, alt: title }));
    b.addEventListener('click', onClick);
    return b;
  }

  function renderFilters(root) {
    const isMobile = false;

    const bar = el('div', { class: 'hunters-toolbar mb-4' });

    const search = el('input', {
      type: 'text',
      value: STATE.filters.name,
      placeholder: 'Search weapon…',
      class: 'search'
    });
    search.addEventListener('input', () => {
      STATE.filters.name = search.value || '';
      renderKeepSearchFocus();
    });

    const makeRarityRow = (afterToggle) => {
      const row = el('div', { class: 'icon-row' });
      const rarItems = [
        { v: 'R', label: 'R', icon: rarityFilterIconSrc('R') },
        { v: 'SR', label: 'SR', icon: rarityFilterIconSrc('SR') },
        { v: 'SSR', label: 'SSR', icon: rarityFilterIconSrc('SSR') }
      ];
      for (const it of rarItems) {
        row.append(
          iconButton({
            title: it.label,
            iconSrc: it.icon,
            active: hasInArray(STATE.filters.rarities, it.v),
            className: 'rarity',
            onClick: () => {
              STATE.filters.rarities = toggleInArray(STATE.filters.rarities, it.v);
              afterToggle?.();
            }
          })
        );
      }
      return row;
    };

    const makeElementRow = (afterToggle) => {
      const row = el('div', { class: 'icon-row' });
      const elItems = [
        { v: 'fire', label: 'Fire', icon: ICONS.element.fire },
        { v: 'water', label: 'Water', icon: ICONS.element.water },
        { v: 'wind', label: 'Wind', icon: ICONS.element.wind },
        { v: 'light', label: 'Light', icon: ICONS.element.light },
        { v: 'dark', label: 'Dark', icon: ICONS.element.dark }
      ];
      for (const it of elItems) {
        row.append(
          iconButton({
            title: it.label,
            iconSrc: it.icon,
            active: hasInArray(STATE.filters.elements, it.v),
            onClick: () => {
              STATE.filters.elements = toggleInArray(STATE.filters.elements, it.v);
              afterToggle?.();
            }
          })
        );
      }
      return row;
    };

    const right = el('div', { class: 'toolbar-right' });

    if (STATE.session.loggedIn && STATE.subtab === 'list') {
      const btnEdit = el(
        'button',
        {
          type: 'button',
          class: 'edit-btn' + (STATE.ui.editMode ? ' is-on' : ''),
          title: STATE.ui.editMode ? 'Exit edit (auto-save)' : 'Edit your list'
        },
        STATE.ui.editMode ? 'EXIT EDIT' : 'EDIT'
      );

      btnEdit.addEventListener('click', async () => {
        if (STATE.subtab !== 'list') {
          setSubtab('list');
          await loadMySungWeaponsProgress();
          STATE.ui.editMode = true;
          render();
          return;
        }

        if (STATE.ui.editMode) {
          const ok = await saveMySungWeaponsProgress();
          if (!ok) toast('Save failed ❌');
          STATE.ui.editMode = false;
          render();
          return;
        }

        STATE.ui.editMode = true;
        render();
      });

      right.append(btnEdit);
    }

    const reset = el(
      'button',
      { type: 'button', class: 'reset-btn', title: 'Reset filters' },
      el('span', { class: 'reset-x' }, '×'),
      'Reset'
    );
    reset.addEventListener('click', () => {
      resetFilters();
      render();
    });

    const openFiltersSheet = () => {
      const rebuild = () => {
        render();
        openFiltersSheet();
      };

      swShowModal('Filters', () => {
        const box = el('div', { class: 'grid gap-4' });

        box.append(
          el('div', { class: 'text-sm font-extrabold text-yellow-400/90' }, 'Rarity'),
          makeRarityRow(rebuild),

          el('div', { class: 'text-sm font-extrabold text-yellow-400/90 mt-2' }, 'Element'),
          makeElementRow(rebuild),

          el(
            'div',
            { class: 'flex gap-2 justify-end mt-2' },
            el(
              'button',
              {
                type: 'button',
                class: 'reset-btn',
                title: 'Reset filters',
                onClick: () => {
                  resetFilters();
                  rebuild();
                }
              },
              el('span', { class: 'reset-x' }, '×'),
              'Reset'
            )
          )
        );

        return box;
      });
    };

    const openMobileFiltersSheet = () => {
      const page = document.querySelector('[data-sla-page="sung-weapons"]');
      if (!page) return;
      let back = page.querySelector('.sweapon-filter-backdrop');
      if (!back) {
        back = el('div', { class: 'sweapon-filter-backdrop' });
        back.addEventListener('mousedown', (ev) => {
          if (ev.target === back) {
            back.style.display = 'none';
            back.innerHTML = '';
          }
        });
        page.append(back);
      }
      const closeModal = () => {
        back.style.display = 'none';
        back.innerHTML = '';
      };
      const rebuild = () => { render(); openMobileFiltersSheet(); };
      const modalSearch = el('input', { type: 'text', value: STATE.filters.name, placeholder: 'Search weapon...', class: 'sweapon-filter-search' });
      modalSearch.addEventListener('input', () => {
        STATE.filters.name = modalSearch.value || '';
        render();
        openMobileFiltersSheet();
      });

      back.innerHTML = '';
      const resetModal = el('button', { type: 'button', class: 'reset-btn', title: 'Reset filters' }, el('span', { class: 'reset-x' }, 'x'), 'Reset');
      resetModal.addEventListener('click', () => { resetFilters(); render(); openMobileFiltersSheet(); });
      const close = el('button', { type: 'button', class: 'admin-btn' }, 'Close');
      const apply = el('button', { type: 'button', class: 'admin-btn primary' }, 'Apply');
      close.addEventListener('click', closeModal);
      apply.addEventListener('click', closeModal);
      const modal = el('div', { class: 'sweapon-filter-modal' },
        el('div', { class: 'sweapon-filter-hd' }, 'Filters'),
        el('div', { class: 'sweapon-filter-bd' },
          modalSearch,
          el('div', { class: 'text-sm font-extrabold text-yellow-400/90' }, 'Rarity'),
          el('div', { class: 'sweapon-filter-icons' }, makeRarityRow(rebuild)),
          el('div', { class: 'text-sm font-extrabold text-yellow-400/90' }, 'Element'),
          el('div', { class: 'sweapon-filter-icons' }, makeElementRow(rebuild))
        ),
        el('div', { class: 'sweapon-filter-ft' }, resetModal, close, apply)
      );
      back.append(modal);
      back.style.display = 'flex';
      requestAnimationFrame(() => {
        const input = back.querySelector('.sweapon-filter-search');
        if (input) input.focus({ preventScroll: true });
      });
    };

    if (isMobile) {
      const btnFilters = el('button', { type: 'button', class: 'filters-btn' }, 'Filters');
      btnFilters.addEventListener('click', openFiltersSheet);

      right.append(reset);
      bar.append(search, btnFilters, right);
    } else {
      const g1 = el('div', { class: 'filter-group' }, makeRarityRow(() => render()));
      const g2 = el('div', { class: 'filter-group' }, makeElementRow(() => render()));

      right.append(reset);
      bar.append(search, g1, g2, right);
    }

    const mobileBtnFilters = el('button', { type: 'button', class: 'filters-btn' }, 'Filters');
    mobileBtnFilters.addEventListener('click', openMobileFiltersSheet);
    root.append(mobileBtnFilters);
    root.append(bar);
  }

  function advInternalToMenuValue(advIndex) {
    const a = clampInt(advIndex, 0, ADV_MAX);
    return a <= 0 ? 'dontown' : String(Math.max(0, a - 1));
  }

  function advMenuValueToInternal(v, maxInternal = ADV_MAX) {
    if (String(v) === 'dontown') return 0;
    return clampInt(parseInt(v, 10) + 1, 1, Math.max(1, maxInternal));
  }

  function makeAdvancementSelect(currentAdv, maxInternal, onChange) {
    const sel = el('select', { class: 'hunter-edit-select' });
    sel.append(el('option', { value: 'dontown' }, 'Do not own'));
    const top = Math.max(0, clampInt(maxInternal, 1, ADV_MAX) - 1);
    for (let i = 0; i <= top; i++) sel.append(el('option', { value: String(i) }, String(i)));
    sel.value = advInternalToMenuValue(clampInt(currentAdv, 0, Math.max(1, maxInternal)));
    sel.addEventListener('change', () => onChange?.(advMenuValueToInternal(sel.value, maxInternal)));
    return sel;
  }

  // --------------------------
  // Bulk card
  // --------------------------
  function renderBulkRow() {
    const card = el('div', { class: 'hunter-progress-card hunter-progress-bulk-card' });

    function applyToAll(patch, allowDontOwn = false) {
      const list = filteredWeapons().map(x => x.name).filter(Boolean);
      if (!list.length) return;

      for (const n of list) {
        const cur = getMyEntry(n);
        const owned = cur.adv >= 1;
        if (!allowDontOwn && patch.lvl != null && !owned) continue;
        setMyEntry(n, patch);
      }
    }

    const header = el('div', { class: 'hunter-progress-head' },
      el('div', { class: 'hunter-progress-avatar hunter-progress-all-badge' },
        el('div', { style: 'font-size:18px;font-weight:1000;line-height:1.05;color:#f8fafc;' }, 'ALL')
      ),
      el('div', { class: 'hunter-progress-meta' },
        el('div', { class: 'hunter-progress-name', title: 'Bulk edit for all filtered weapons' }, 'Edit all'),
        el('div', { class: 'hunter-progress-bulk-sub' }, 'After exiting edit mode, applies changes to all visible weapons if modifications were made')
      )
    );
    card.append(header);

    const advValue = makeAdvancementSelect(STATE.bulk.adv, ADV_MAX, (nextAdv) => {
      STATE.bulk.adv = nextAdv;
      applyToAll({ adv: nextAdv }, true);
      render();
    });

    const lvInput = el('input', {
      type: 'number',
      class: 'hunter-progress-level-input',
      min: '0',
      max: String(STATE.cfg.levelMax ?? DEFAULT_CFG.levelMax),
      value: String(STATE.bulk.lvl)
    });

    lvInput.addEventListener('input', () => {
      const v = clampInt(lvInput.value, 0, STATE.cfg.levelMax ?? DEFAULT_CFG.levelMax);
      STATE.bulk.lvl = v;

      const list = filteredWeapons().map(x => x.name).filter(Boolean);
      for (const weaponName of list) {
        const cur = getMyEntry(weaponName);
        if (cur.adv <= 0) continue;
        const real = clampInt(v, 1, STATE.cfg.levelMax ?? DEFAULT_CFG.levelMax);
        setMyEntry(weaponName, { lvl: real });

        const node = document.querySelector(`.hunter-progress-level-input[data-lv-for="${CSS.escape(weaponName)}"]`);
        if (node) node.value = String(real);
      }
    });

    const stats = el('div', { class: 'hunter-progress-stats' },
      el('div', { class: 'hunter-progress-stat' },
        el('div', { class: 'hunter-progress-stat-label' }, 'Advancement'),
        el('div', { class: 'hunter-progress-stat-value' }, advValue)
      ),
      el('div', { class: 'hunter-progress-stat' },
        el('div', { class: 'hunter-progress-stat-label' }, 'Lv.'),
        el('div', { class: 'hunter-progress-stat-value' }, lvInput)
      )
    );

    card.append(stats);
    return card;
  }

  // --------------------------
  // Views
  // --------------------------
  function renderBuilds(root) {
    const data = filteredWeapons();
  
    if (!data.length) {
      root.append(el('div', { class: 'p-6 text-center text-white' }, 'No results.'));
      return;
    }
  
    const grid = el('div', { class: 'sw-grid' });
  
    for (const w of data) {
      const elemKey = normElement(w.element);
      const badgeElem = ICONS.element[elemKey] || '';
      const rarityClass = buildsRarityClass(w.rarity);
    
      const slug = slugifyWeaponName(w?.name || '');
      const target = slug ? url(`/sjw-weapons/${encodeURIComponent(slug)}`) : '#';
    
      const card = el('a', {
        href: target,
        class: `sw-card avatar solo ${rarityClass}`,
        title: w.name,
        'aria-label': w.name
      });
    
      const portrait = el('img', {
        class: 'portrait',
        loading: 'lazy',
        src: resolveLocalOrRemoteSrcSW(w.image_build || w.image || ''),
        alt: w.name
      });
    
      const badges = el('div', { class: 'sw-badges' });
      if (badgeElem) badges.append(el('img', { src: badgeElem, alt: w.element || '' }));
    
      card.append(portrait, badges, el('div', { class: 'name' }, w.name));
    
      card.addEventListener('click', (e) => {
        if (!slug) {
          e.preventDefault();
          return;
        }
      
        if (
          e.button !== 0 ||
          e.metaKey ||
          e.ctrlKey ||
          e.shiftKey ||
          e.altKey
        ) {
          return;
        }
      
        e.preventDefault();
        openWeaponDetails(w);
      });
    
      grid.append(card);
    }
  
    root.append(grid);
  }

  function renderList(root) {
    if (STATE.collection.loading && !STATE.collection.loaded) {
      root.append(el('div', { class: 'p-6 text-center text-white' }, 'Loading…'));
      return;
    }

    const data = filteredWeapons();
    if (!data.length) {
      root.append(el('div', { class: 'p-6 text-center text-white' }, 'No results.'));
      return;
    }

    const wrap = el('div', { class: 'hunters-cards-grid' });

    if (STATE.ui.editMode && STATE.session.loggedIn) {
      wrap.append(renderBulkRow());
    }

    for (const w of data) {
      const entry = getMyEntry(w.name);
      const owned = entry.adv >= 1;
      const rar = String(w.rarity || 'SSR').toUpperCase();
      const rarityClass = buildsRarityClass(rar);
      const elemKey = normElement(w.element);
      const elemIcon = ICONS.element[elemKey] || ICONS.element.none;
      const rarityIcon = ICONS.rarity[rar] || ICONS.rarity.SSR;

      const card = el('div', { class: `hunter-progress-card ${rarityClass}` });

      const header = el('div', { class: 'hunter-progress-head' });
      const weaponSrc = resolveLocalOrRemoteSrcSW(w.image_build || w.image || '');
      const imgWrap = el('div', { class: 'hunter-progress-avatar' },
        weaponSrc
          ? el('img', { src: weaponSrc, loading: 'lazy', decoding: 'async', alt: w.name })
          : el('div', { style: 'font-size:22px' }, '🗡️')
      );

      const meta = el('div', { class: 'hunter-progress-meta' },
        el('div', { class: 'hunter-progress-name', title: w.name }, w.name),
        el('div', { class: 'hunter-progress-badges' },
          el('span', { class: 'hunter-progress-badge rarity-icon' },
            el('img', { src: rarityIcon, alt: rar, loading: 'lazy', decoding: 'async' })
          ),
          el('span', { class: 'hunter-progress-badge icon' },
            el('img', { src: elemIcon, alt: w.element || 'Element', loading: 'lazy', decoding: 'async' })
          )
        )
      );
      header.append(imgWrap, meta);
      card.append(header);

      let advValue;
      if (!STATE.ui.editMode) {
        const d = advToDisplay(entry.adv);
        advValue = el('div', { class: `hunter-progress-stat-value ${d.type === 'dontown' ? 'dontown' : ''}` }, d.text);
      } else {
        advValue = makeAdvancementSelect(entry.adv, getWeaponMaxAdv(w), (nextAdv) => {
          const cur = getMyEntry(w.name);
          const nextLvl = nextAdv >= 1 ? clampInt(cur.lvl, 1, (STATE.cfg.levelMax ?? DEFAULT_CFG.levelMax)) : cur.lvl;
          setMyEntry(w.name, { adv: nextAdv, lvl: nextLvl });
          render();
        });
      }

      let lvValue;
      if (!STATE.ui.editMode) {
        lvValue = el('div', { class: 'hunter-progress-level-chip' }, String(owned ? clampInt(entry.lvl, 1, (STATE.cfg.levelMax ?? DEFAULT_CFG.levelMax)) : 0));
      } else {
        const input = el('input', {
          type: 'number',
          class: 'hunter-progress-level-input',
          min: '0',
          max: String(STATE.cfg.levelMax ?? DEFAULT_CFG.levelMax),
          value: String(owned ? clampInt(entry.lvl, 1, (STATE.cfg.levelMax ?? DEFAULT_CFG.levelMax)) : 0),
          disabled: !owned
        });
        input.addEventListener('input', () => {
          const cur = getMyEntry(w.name);
          if (cur.adv <= 0) return;
          const v = clampInt(input.value, 1, (STATE.cfg.levelMax ?? DEFAULT_CFG.levelMax));
          setMyEntry(w.name, { lvl: v });
        });
        lvValue = input;
      }

      const stats = el('div', { class: 'hunter-progress-stats' },
        el('div', { class: 'hunter-progress-stat' },
          el('div', { class: 'hunter-progress-stat-label' }, 'Advancement'),
          advValue
        ),
        el('div', { class: 'hunter-progress-stat' },
          el('div', { class: 'hunter-progress-stat-label' }, 'Lv.'),
          el('div', { class: 'hunter-progress-stat-value' }, lvValue)
        )
      );
      card.append(stats);
      wrap.append(card);
    }

    root.append(wrap);
  }

  // --------------------------
  // Admin tab
  // --------------------------
  function mkRaritySelect(value, extra = '') {
    const sel = el('select', {
      class: `${extra} px-2 rounded-xl border border-slate-700 bg-slate-800 text-slate-100`
    });
    const opts = ['SSR', 'SR', 'R'];
    for (const o of opts) sel.append(el('option', { value: o }, o));
    sel.value = String(value || 'SSR').toUpperCase();
    return sel;
  }

  function mkElementSelect(value, extra = '') {
    const sel = el('select', {
      class: `${extra} px-2 rounded-xl border border-slate-700 bg-slate-800 text-slate-100`
    });
    const opts = ['None', 'Fire', 'Water', 'Wind', 'Light', 'Dark'];
    for (const o of opts) sel.append(el('option', { value: o }, o));

    const v = String(value || 'None');
    const norm = {
      none: 'None', fire: 'Fire', water: 'Water', wind: 'Wind', light: 'Light', dark: 'Dark',
      None: 'None', Fire: 'Fire', Water: 'Water', Wind: 'Wind', Light: 'Light', Dark: 'Dark'
    };
    sel.value = norm[v] ?? v;
    return sel;
  }

  function mkMaxAdvSelect(value, extra = '') {
    const sel = el('select', {
      class: `${extra} px-2 rounded-xl border border-slate-700 bg-slate-800 text-slate-100`
    });
    for (let i = 1; i <= ADV_MAX; i++) {
      sel.append(el('option', { value: String(i) }, `Max Adv: ${i}`));
    }
    sel.value = String(clampInt(value ?? ADV_MAX, 1, ADV_MAX));
    return sel;
  }

  function renderAdmin(root) {
    if (!isAdminUser()) {
      root.append(el('div', { class: 'p-6 text-center text-white' }, 'Admin only.'));
      return;
    }

    const cfgBox = el('div', { class: 'admin-card admin-grid', style: 'background:rgba(15,23,42,.18); margin-bottom: 12px;' });
    cfgBox.append(el('div', { class: 'admin-title', style: 'font-size:16px' }, 'Sung Weapons Settings'));

    const inLevelMax = el('input', {
      class: 'admin-in',
      type: 'number',
      min: '1',
      max: '999',
      value: String(STATE.cfg.levelMax ?? DEFAULT_CFG.levelMax),
      placeholder: 'Max Lv'
    });

    const btnLoadCfg = el('button', { class: 'admin-btn', type: 'button' }, 'Reload settings');
    btnLoadCfg.addEventListener('click', async () => {
      STATE.cfg = await loadSungWeaponsDropdowns();
      inLevelMax.value = String(STATE.cfg.levelMax ?? DEFAULT_CFG.levelMax);
      toast('Settings reloaded ✅');
      render();
    });

    const btnSaveCfg = el('button', { class: 'admin-btn primary', type: 'button' }, 'Save settings');
    btnSaveCfg.addEventListener('click', async () => {
      const levelMax = clampInt(inLevelMax.value, 1, 999);

      const out = await fetchJson(url('/api/admin/sung-weapons-dropdowns'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ config: { levelMax } })
      });

      if (!out.ok) {
        toast(out?.data?.error || 'Save failed');
        return;
      }

      toast('Saved ✅');
      STATE.cfg = await loadSungWeaponsDropdowns();
      render();
    });

    cfgBox.append(
      el('div', { class: 'sweapon-settings-row admin-row', style: 'flex-wrap:nowrap;gap:10px;align-items:center;' },
        el('div', { class: 'admin-sub', style: 'min-width: 140px;' }, 'Max Lv'),
        inLevelMax,
        btnLoadCfg,
        btnSaveCfg
      )
    );

    root.append(cfgBox);

    const card = el('div', { class: 'bg-slate-800 rounded-2xl border border-slate-700 p-4 shadow-sm' });

    const header = el('div', { class: 'flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4' },
      el('div', {},
        el('div', { class: 'text-lg font-extrabold text-yellow-400' }, 'Sung Weapons — Admin'),
        el('div', { class: 'text-sm text-white' }, 'Edit weapons, change global order, add new weapons.')
      )
    );

    const actions = el('div', { class: 'flex flex-wrap items-center gap-2 w-full sm:w-auto justify-start sm:justify-end' });

    const btnExact = el('button', {
      class: 'h-9 px-3 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-sm font-semibold text-white',
      type: 'button'
    }, 'Set exact order');

    btnExact.addEventListener('click', () => openExactOrderModal());

    const btnAutoMatch = el('button', {
      class: 'h-9 px-3 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-sm font-semibold text-white',
      type: 'button',
      title: 'Auto match missing local images'
    }, 'Auto match missing images');

    btnAutoMatch.addEventListener('click', async () => {
      btnAutoMatch.disabled = true;
      const old = btnAutoMatch.textContent;
      btnAutoMatch.textContent = 'Matching...';
      try {
        const res = await autoMatchSungWeaponImagesBatch();
        await loadWeapons();
        render();
        toast(`Auto-match ✅ Updated: ${res.updated}, Matched: ${res.matched}, Skipped: ${res.skipped}, Failed: ${res.failed}`);
      } catch (e) {
        console.error('autoMatchSungWeaponImagesBatch failed', e);
        toast('Auto-match failed');
      } finally {
        btnAutoMatch.disabled = false;
        btnAutoMatch.textContent = old;
      }
    });

    actions.append(btnExact, btnAutoMatch);
    header.append(actions);

    const addWrap = el('div', { class: 'grid gap-2 p-3 rounded-2xl border border-slate-700 bg-[rgb(24_34_52)] mb-4' });
    addWrap.append(el('div', { class: 'font-extrabold text-yellow-400' }, 'Add new weapon'));

    const row1 = el('div', { class: 'sweapon-admin-add-row flex flex-wrap gap-2 items-center' });
    const inName = el('input', { class: 'h-10 px-3 rounded-xl border border-slate-700 bg-slate-800 text-white min-w-[280px] flex-[1_1_280px]', placeholder: 'Name (unique)' });

    const picSelAdd = mkPictureSelectMultiCategory(SW_LOCAL_WEAPON_CATEGORIES, '', 'min-w-[320px] flex-[2_1_360px]');

    const selRarity = mkRaritySelect('SSR', 'h-10');
    const selElement = mkElementSelect('None', 'h-10');

    const btnAdd = el('button', {
      class: 'h-10 px-3 rounded-xl border border-slate-700 bg-slate-800 text-white hover:bg-slate-700 font-extrabold',
      type: 'button'
    }, 'Add');

    btnAdd.addEventListener('click', async () => {
      const name = (inName.value || '').trim();
      const image = normalizeLocalPicRelAny(picSelAdd.value || '');
      const rarity = String(selRarity.value || 'SSR').toUpperCase();
      const element = String(selElement.value || 'None');
      const maxGrowth = ADV_MAX;

      if (!name || !image) {
        toast('Name + local image required');
        return;
      }

      const out = await fetchJson(url('/api/admin/weapons'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          dataset: 'sungWeapons',
          action: 'add',
          item: { name, image, image_build: image, rarity, element, maxGrowth }
        })
      });

      if (!out.ok) {
        toast(out?.data?.error || 'Add failed');
        return;
      }

      inName.value = '';
      try { picSelAdd.value = ''; } catch {}
      selRarity.value = 'SSR';
      selElement.value = 'None';

      toast('Added ✅');
      await loadWeapons();
      render();
    });

    row1.append(inName, picSelAdd, selRarity, selElement, btnAdd);
    addWrap.append(row1);

    const list = el('div', { class: 'grid gap-2' });

    const data = filteredWeapons();

    function ensureOrder() {
      const cur = (STATE.globalOrder && STATE.globalOrder.length) ? [...STATE.globalOrder] : [];
      const names = (STATE.data.weapons || []).map(w => w.name).filter(Boolean);
      const set = new Set(cur);
      for (const n of names) if (!set.has(n)) cur.push(n);
      return cur;
    }

    async function commitOrder(nextOrder) {
      try {
        await saveGlobalOrder(nextOrder);
        STATE.globalOrder = nextOrder;
        STATE.data.weapons = applyOrder(STATE.data.weapons, nextOrder);
        toast('Order saved ✅');
        render();
      } catch (err) {
        toast(`Order save failed: ${err?.message || err}`);
      }
    }

    function adminRow(w) {
      const row = el('div', {
        class: 'rounded-2xl border border-slate-700 bg-slate-800 p-3 flex flex-col md:flex-row md:items-center gap-3'
      });

      const img = (w.image_build || w.image)
        ? el('img', { src: resolveLocalOrRemoteSrcSW(w.image_build || w.image), class: 'w-14 h-14 rounded-2xl object-cover bg-[rgb(24_34_52)] border border-slate-700', loading: 'lazy' })
        : el('div', { class: 'w-14 h-14 rounded-2xl bg-[rgb(24_34_52)] grid place-items-center text-xl text-white' }, '🗡️');

      const meta = el('div', { class: 'min-w-0 flex-1' },
        el('div', { class: 'font-extrabold text-white truncate' }, w.name),
        el('div', { class: 'text-xs text-white' }, `${String(w.rarity || 'SSR').toUpperCase()} • ${w.element || 'None'} • Max Adv ${getWeaponMaxAdv(w)}`)
      );

      const right = el('div', { class: 'flex flex-wrap items-center gap-2 justify-start md:justify-end' });

      const btnUp = el('button', {
        class: 'h-9 w-9 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 font-extrabold text-white',
        title: 'Move up',
        type: 'button'
      }, '↑');

      const btnDown = el('button', {
        class: 'h-9 w-9 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 font-extrabold text-white',
        title: 'Move down',
        type: 'button'
      }, '↓');

      btnUp.addEventListener('click', async () => {
        const order = ensureOrder();
        const i = order.indexOf(w.name);
        if (i <= 0) return;
        { const tmp = order[i - 1]; order[i - 1] = order[i]; order[i] = tmp; }
        await commitOrder(order);
      });

      btnDown.addEventListener('click', async () => {
        const order = ensureOrder();
        const i = order.indexOf(w.name);
        if (i < 0 || i >= order.length - 1) return;
        { const tmp = order[i + 1]; order[i + 1] = order[i]; order[i] = tmp; }
        await commitOrder(order);
      });

      const btnEdit = el('button', {
        class: 'h-9 px-3 rounded-xl border bg-slate-900 text-white hover:bg-slate-800 dark:bg-[rgb(24_34_52)] dark:hover:bg-slate-800 font-extrabold',
        type: 'button'
      }, 'Edit');
      btnEdit.addEventListener('click', () => openEditWeaponModal(w));

      const btnRemove = el('button', {
        class: 'h-9 px-3 rounded-xl border bg-rose-600/15 border-rose-500 text-rose-200 hover:bg-rose-600/25 font-extrabold',
        type: 'button',
        title: 'Remove weapon'
      }, 'Remove');

      btnRemove.addEventListener('click', async () => {
        const ok = confirm(`Remove weapon: "${w.name}" ?`);
        if (!ok) return;

        const out = await fetchJson(url('/api/admin/weapons'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            dataset: 'sungWeapons',
            action: 'remove',
            name: w.name
          })
        });

        if (!out.ok) {
          toast(out?.data?.error || 'Remove failed');
          return;
        }

        toast('Removed ✅');
        await loadWeapons();
        render();
      });

      right.append(btnUp, btnDown, btnEdit, btnRemove);
      row.append(img, meta, right);
      return row;
    }

    for (const w of data) list.append(adminRow(w));

    if (!data.length) {
      list.append(el('div', { class: 'p-4 text-center text-white' }, 'No results.'));
    }

    card.append(header, addWrap, list);
    root.append(card);

    function openExactOrderModal() {
      const order = ensureOrder();
      const textarea = el('textarea', {
        class: 'w-full min-h-[240px] p-3 rounded-xl border border-slate-700 bg-slate-900 text-slate-100',
        placeholder: 'One name per line…'
      }, order.join('\n'));

      const saveBtn = el('button', {
        class: 'h-10 px-3 rounded-xl border border-slate-700 bg-slate-800 text-white hover:bg-slate-700 font-extrabold',
        type: 'button'
      }, 'Save order');

      const wrap = el('div', { class: 'grid gap-3' },
        el('div', { class: 'text-sm text-white' }, 'Paste / edit exact order. Unknown names ignored. Missing weapons appended at the end.'),
        textarea,
        el('div', { class: 'flex justify-end' }, saveBtn)
      );

      const doSave = async () => {
        const lines = (textarea.value || '').split(/\r?\n/).map(x => x.trim()).filter(Boolean);
        const baseNames = (STATE.data.weapons || []).map(w => w.name).filter(Boolean);
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
        swHideModal();
      };

      saveBtn.addEventListener('click', doSave);
      swShowModal('Set exact order', () => wrap);
    }

    function openEditWeaponModal(w) {
      const inName = el('input', { class: 'h-10 px-3 rounded-xl border border-slate-700 bg-slate-800 text-white', value: w.name || '' });
      const picSelEdit = mkPictureSelectMultiCategory(SW_LOCAL_WEAPON_CATEGORIES, normalizeLocalPicRelAny(w.image_build || w.image || ''), 'min-w-[280px] flex-1');

      const selR = mkRaritySelect(String(w.rarity || 'SSR').toUpperCase(), 'h-10');
      const selE = mkElementSelect(String(w.element || 'None'), 'h-10');

      const save = el('button', {
        class: 'h-10 px-3 rounded-xl border border-slate-700 bg-slate-800 text-white hover:bg-slate-700 font-extrabold',
        type: 'button'
      }, 'Save');

      const body = el('div', { class: 'grid gap-2' },
        el('div', { class: 'text-sm text-white' }, 'Name / Local image / Element / Rarity'),
        el('div', { class: 'grid gap-2' },
          el('label', { class: 'text-xs font-bold text-white' }, 'Name'),
          inName,
          el('label', { class: 'text-xs font-bold text-white' }, 'Local image (/picture/*)'),
          picSelEdit,
          el('div', { class: 'flex flex-wrap gap-2 items-center' }, selR, selE)
        ),
        el('div', { class: 'flex justify-end pt-2' }, save)
      );

      save.addEventListener('click', async () => {
        const name = (inName.value || '').trim();
        const image = normalizeLocalPicRelAny(picSelEdit.value || '');
        const rarity = String(selR.value || 'SSR').toUpperCase();
        const element = String(selE.value || 'None');
        const maxGrowth = ADV_MAX;

        if (!name) return toast('Name required');
        if (!image) return toast('Local image required');

        const out = await fetchJson(url('/api/admin/weapons'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            dataset: 'sungWeapons',
            action: 'update',
            originalName: w.name,
            item: { name, image, image_build: image, rarity, element, maxGrowth }
          })
        });

        if (!out.ok) {
          toast(out?.data?.error || 'Save failed');
          return;
        }

        toast('Saved ✅');
        await loadWeapons();
        render();
        swHideModal();
      });

      swShowModal(`Edit: ${w.name}`, () => body);
    }
  }

  // --------------------------
  // Quick modal
  // --------------------------
  function openQuickModal(w) {
    swShowModal(w.name || 'Weapon', () => {
      const wrap = el('div', { class: 'grid gap-3' });

      const top = el('div', { class: 'flex items-center gap-3' });
      const img = (w.image_build || w.image)
        ? el('img', { src: resolveLocalOrRemoteSrcSW(w.image_build || w.image), class: 'w-28 h-28 rounded-2xl object-cover bg-[rgb(24_34_52)]', loading: 'lazy' })
        : el('div', { class: 'w-28 h-28 rounded-2xl bg-[rgb(24_34_52)] grid place-items-center text-3xl text-white' }, '🗡️');
      top.append(img);

      const info = el('div', { class: 'grid gap-1 text-sm text-white' });
      info.append(el('div', {}, `${String(w.rarity || 'SSR').toUpperCase()} • ${w.element || 'None'} • Max Adv ${getWeaponMaxAdv(w)}`));
      top.append(info);

      wrap.append(top);
      return wrap;
    });
  }

  // --------------------------
  // Keep focus in search input after render()
  // --------------------------
  function renderKeepSearchFocus() {
    const active = document.activeElement;
    const hadFocus = !!(active && active.classList && active.classList.contains('search'));
    const caret = hadFocus ? (active.selectionStart ?? 0) : 0;

    render();

    if (hadFocus) {
      const next = document.querySelector('.hunters-toolbar .search');
      if (next) {
        next.focus({ preventScroll: true });
        const p = Math.min(caret, next.value.length);
        try { next.setSelectionRange(p, p); } catch {}
      }
    }
  }

  // --------------------------
  // Main render
  // --------------------------
  function render() {
    injectLocalStyles();

    const content = qs('#content');
    if (!content) return;
    content.innerHTML = '';

    const shell = el('div', {
      class: 'max-w-7xl mx-auto px-3 sm:px-6 py-6',
      'data-sla-page': 'sung-weapons'
    });

    renderHeader(shell);
    renderSubtabs(shell);
    renderFilters(shell);

    if (STATE.loading) {
      shell.append(el('div', { class: 'p-6 text-center text-white' }, 'Loading…'));
      content.append(shell);
      return;
    }
    if (STATE.error) {
      shell.append(el('div', { class: 'p-6 text-center text-red-600 dark:text-red-400 font-semibold' }, STATE.error));
      content.append(shell);
      return;
    }

    if (STATE.subtab === 'builds') renderBuilds(shell);
    else if (STATE.subtab === 'admin') renderAdmin(shell);
    else renderList(shell);

    content.append(shell);
  }

  // --------------------------
  // Public mount
  // --------------------------
  window.__sung_weapons_mount = async function __sung_weapons_mount() {
    injectLocalStyles();

    STATE.cfg = await loadSungWeaponsDropdowns();

    if (!STATE.data.weapons?.length && !STATE.loading) {
      await loadWeapons();
    }

    await loadMySungWeaponsProgress();

    render();
  };
})();
