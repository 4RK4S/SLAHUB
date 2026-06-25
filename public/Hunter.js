'use strict';

/**
 * Hunter.js — Hunters page module for the new router (LogIn.js).
 * Exposes: window.__hunters_mount()
 *
 * ✅ FINAL:
 * - Builds: cards preview only
 * - My list: per-user editing (adv + growth + lv)
 * - Owned depends on Advancement:
 *    advIndex 0 => Don't own  (can't save growth/lv)
 *    advIndex >= 1 => owned  (save growth/lv)
 *
 * ✅ Advancement states EXACTLY:
 * 0: Don't own
 * 1: ✧✧✧✧✧
 * 2: ✦✧✧✧✧
 * 3: ✦✦✧✧✧
 * 4: ✦✦✦✧✧
 * 5: ✦✦✦✦✧
 * 6: ✦✦✦✦✦ 1
 * 7: ✦✦✦✦✦ 2
 * 8: ✦✦✦✦✦ 3
 * 9: ✦✦✦✦✦ 4
 * 10: ✦✦✦✦✦ 5
 *
 * ✅ Edit button:
 * - visible only when logged in
 * - no Save button (auto-save when leaving edit)
 *
 * ✅ Bulk row:
 * - only visible in Edit mode
 * - edits ALL filtered hunters
 * - NO popups/confirm dialogs
 *
 * ✅ Admin tab:
 * - add/update hunters
 * - global order up/down + exact order textarea
 * - set Level Max
 * - set Growth Max + Growth images links
 *
 * API used:
 * - GET  /api/public/hunters
 * - GET  /api/public/hunter-weapons
 * - GET  /api/data   (auth)  -> { huntersProgress: {...} }
 * - POST /api/data          -> { huntersProgress: {...} }
 *
 * - GET  /api/public/hunters-dropdowns
 * - POST /api/admin/hunters-dropdowns   (admin)
 *
 * - GET  /api/global/order?dataset=hunters
 * - POST /api/global/order  {dataset:'hunters', order:[...]}
 * - POST /api/admin/hunters {action:add|update|remove, ...}
 */

(function () {
  // --------------------------
  // Helpers
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
    try { if (typeof window.cdny === 'function') return window.cdny(u, w); } catch {}
    return u || '';
  }

  // --------------------------
  // LOCAL PICTURES (Hunters)
  // --------------------------
  const PIC_CACHE = Object.create(null);

  function isHttpUrl(s) {
    return /^https?:\/\//i.test(String(s || '').trim());
  }

  function normalizeLocalPicRel(v, category) {
    const s = String(v || '').trim();
    const cat = String(category || '').trim();
    if (!s || !cat) return '';
    if (isHttpUrl(s)) return '';
    const pictureMarker = `/picture/${cat}/`;
    const markerIdx = s.indexOf(pictureMarker);
    if (markerIdx >= 0) return `${cat}/${s.slice(markerIdx + pictureMarker.length).replace(/^\/+/, '')}`;
    const pictureRelMarker = `picture/${cat}/`;
    const relMarkerIdx = s.indexOf(pictureRelMarker);
    if (relMarkerIdx >= 0) return `${cat}/${s.slice(relMarkerIdx + pictureRelMarker.length).replace(/^\/+/, '')}`;
    if (s.startsWith(`${cat}/`)) return s;
    return `${cat}/${s.replace(/^\/+/, '')}`;
  }

  function localPicSrc(v, category) {
    const rel = normalizeLocalPicRel(v, category);
    return rel ? url(`/picture/${rel}`) : '';
  }

  function resolveLocalOrRemoteSrc(v, category, w) {
    const s = String(v || '').trim();
    if (!s) return '';
    if (isHttpUrl(s)) return cdnySafe(s, w);
    if (s.startsWith('/picture/') || s.includes('/picture/')) return s;
    if (s.startsWith('picture/')) return url(`/${s}`);
    return localPicSrc(s, category);
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

  function mkPictureSelectByCategory(category, currentRel = '', extra = '') {
    const box = el('div', { class: `${extra} relative flex-1` });
    const input = el('input', {
      type: 'text',
      class: 'admin-in',
      placeholder: 'Loading images…',
      value: ''
    });
    const list = el('div', {
      class: 'rounded-xl border dark:border-slate-700 bg-[rgb(24_34_52)] text-white',
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
      const rows = Array.from(list.children);
      rows.forEach((r, i) => { r.style.outline = (i === box._idx ? '2px solid #94a3b8' : 'none'); });
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

    getPicturesByCategory(category).then(items => {
      fillPictureSelect(box, items, currentRel);
      input.placeholder = 'Select local image…';
    }).catch(() => {
      fillPictureSelect(box, [], currentRel);
      input.placeholder = 'No local images found';
    });

    return box;
  }

  function hunterCardImgSrc(h, w) {
    return resolveLocalOrRemoteSrc(h?.image_build || h?.image || '', 'Hunter', w);
  }
  function hunterIconImgSrc(h, w) {
    return resolveLocalOrRemoteSrc(h?.image || h?.image_build || '', 'Hunter_Icon', w);
  }

  // --------------------------
  // Auto-match local images (Hunters)
  // --------------------------
  function nameToImageKey(s) {
    return String(s || '')
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[’'`]/g, '')
      .replace(/[‐-‒–—]/g, '-')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
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
    variants.add(raw.replace(/\s*-\s*/g, '-').replace(/[’']/g, ''));

    return Array.from(variants).map(v => v.trim()).filter(Boolean);
  }

  function findBestPictureRelByName(name, items) {
    const list = Array.isArray(items) ? items : [];
    if (!list.length) return '';

    const variants = makeNameVariantsForImageMatch(name);
    if (!variants.length) return '';

    const targets = variants.map(v => nameToImageKey(v)).filter(Boolean);

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
      const exactFile = candidates.find(c => c.baseNoExt.toLowerCase() === t);
      if (exactFile) return exactFile.rel;
    }
    for (const t of targets) {
      const pref = candidates.find(c => c.key.startsWith(t));
      if (pref) return pref.rel;
    }
    for (const t of targets) {
      const toks = t.split(/[_-]+/).filter(Boolean);
      if (!toks.length) continue;
      const hit = candidates.find(c => toks.every(tok => c.key.includes(tok)));
      if (hit) return hit.rel;
    }
    return '';
  }

  async function autoMatchHunterImagesBatch() {
    const hunters = Array.isArray(STATE.data?.hunters) ? STATE.data.hunters : [];
    if (!hunters.length) return { checked: 0, matched: 0, updated: 0, skipped: 0, failed: 0 };

    const [iconPics, buildPics] = await Promise.all([
      getPicturesByCategory('Hunter_Icon'),
      getPicturesByCategory('Hunter')
    ]);

    let checked = 0, matched = 0, updated = 0, skipped = 0, failed = 0;

    for (const h of hunters) {
      const name = String(h?.name || '').trim();
      if (!name) { skipped++; continue; }

      const curIcon = String(h?.image || '').trim();
      const curBuild = String(h?.image_build || '').trim();

      const needIcon = !normalizeLocalPicRel(curIcon, 'Hunter_Icon');
      const needBuild = !normalizeLocalPicRel(curBuild, 'Hunter');

      if (!needIcon && !needBuild) { skipped++; continue; }

      checked++;

      const matchedIconRel = needIcon ? findBestPictureRelByName(name, iconPics) : '';
      const matchedBuildRel = needBuild ? findBestPictureRelByName(name, buildPics) : '';

      const nextImage = needIcon
        ? (matchedIconRel ? normalizeLocalPicRel(matchedIconRel, 'Hunter_Icon') : '')
        : normalizeLocalPicRel(curIcon, 'Hunter_Icon');

      const nextBuild = needBuild
        ? (matchedBuildRel ? normalizeLocalPicRel(matchedBuildRel, 'Hunter') : '')
        : normalizeLocalPicRel(curBuild, 'Hunter');

      if (!nextImage && !nextBuild) continue; // no match for this hunter

      matched++;

      const payloadItem = {
        name: h.name,
        image: nextImage || (normalizeLocalPicRel(curIcon, 'Hunter_Icon') || ''),
        image_build: nextBuild || (normalizeLocalPicRel(curBuild, 'Hunter') || ''),
        rarity: String(h.rarity || 'SSR').toUpperCase(),
        element: String(h.element || 'Fire'),
        role: String(h.role || 'Striker')
      };

      try {
        const out = await fetchJson(url('/api/admin/hunters'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ action: 'update', originalName: h.name, item: payloadItem })
        });

        if (out.ok) updated++;
        else {
          failed++;
          console.warn('Auto-match hunter images update failed for', h.name, out?.data || out);
        }
      } catch (e) {
        failed++;
        console.warn('Auto-match hunter images exception for', h.name, e);
      }
    }

    return { checked, matched, updated, skipped, failed };
  }


  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);

    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null) continue;

      if (k === 'class') node.className = v;
      else if (k === 'style') node.setAttribute('style', v);
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
      else if (typeof v === 'boolean') { if (v) node.setAttribute(k, ''); }
      else node.setAttribute(k, v);
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

  function clampInt(v, min, max) {
    const n = Number.isFinite(+v) ? parseInt(v, 10) : min;
    return Math.max(min, Math.min(max, n));
  }

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

  // --------------------------
  // CSS scoping (Hunters only)
  // --------------------------
  const HUNTERS_SCOPE = '#content [data-sla-page="hunters"]';

  /**
   * Prefixuje CSS tak, żeby działał tylko w Hunters scope.
   * - jeśli selector zawiera #content -> zamienia #content na scope (żeby nie robić błędnego zagnieżdżenia)
   * - jeśli nie zawiera #content -> dodaje scope na początek
   * - nie dotyka @media/@keyframes itd.
   */
  function scopeCss(css, scope) {
    const scopeChunk = (chunk) => chunk.replace(/(^|})\s*([^{@}][^{]*)\{/g, (m, brace, selectorPart) => {
      const selectors = selectorPart
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)
        .map(sel => {
          // jeśli już jest scoped, nie ruszaj
          if (sel.includes('[data-sla-page="hunters"]')) return sel;

          // jeżeli selector używa #content, to zamień #content -> scope
          if (/#content\b/.test(sel)) {
            return sel.replace(/(^|[\s>+~,(])#content\b/g, `$1${scope}`);
          }

          // normalnie: dodaj scope na początek
          return `${scope} ${sel}`;
        })
        .join(', ');

      return `${brace} ${selectors} {`;
    });

    // 1) scope poza @media
    // 2) scope wewnątrz @media (z dopasowaniem klamry kończącej)
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

      const openBraceIdx = start + m[0].length - 1; // index '{'
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
  // Modal helper (local)
  // --------------------------
  function ensureHuntersModal() {
    if (document.getElementById('hunters-modal-css')) return;

    const s = document.createElement('style');
    s.id = 'hunters-modal-css';
    s.textContent = `
      .hm-backdrop{position:fixed;inset:0;display:none;align-items:center;justify-content:center;z-index:9999;background:rgba(2,6,23,.55);backdrop-filter:blur(2px)}
      .hm-modal{width:min(860px,92vw);border-radius:1rem;border:1px solid rgba(148,163,184,.28);background:rgba(2,6,23,.92);color:#e2e8f0;box-shadow:0 18px 60px rgba(0,0,0,.55);overflow:hidden}
      .hm-hd{padding:14px 16px;border-bottom:1px solid rgba(148,163,184,.20);font-weight:900;letter-spacing:.2px}
      .hm-bd{padding:16px;max-height:70vh;overflow:auto}
      .hm-ft{padding:12px 16px;border-top:1px solid rgba(148,163,184,.20);display:flex;gap:.5rem;justify-content:flex-end}
      .hm-btn{height:40px;padding:0 14px;border-radius:12px;border:1px solid rgba(148,163,184,.28);background:rgba(15,23,42,.55);color:#e2e8f0;cursor:pointer;font-weight:900}
      .hm-btn.primary{background:rgba(255,255,255,.95);color:#0f172a;border-color:rgba(226,232,240,.85)}
      .hm-btn.ghost{background:transparent}
    `;
    document.head.appendChild(s);

    const root = document.createElement('div');
    root.id = 'hunters-modal-root';
    root.className = 'hm-backdrop';
    root.innerHTML = `
      <div class="hm-modal">
        <div class="hm-hd" id="hmTitle"></div>
        <div class="hm-bd" id="hmBody"></div>
        <div class="hm-ft">
          <button class="hm-btn ghost" id="hmClose" type="button">CLOSE</button>
          <button class="hm-btn primary" id="hmPrimary" type="button" style="display:none">SAVE</button>
        </div>
      </div>
    `;
    document.body.appendChild(root);

    function hide() {
      root.style.display = 'none';
      const bd = document.getElementById('hmBody');
      if (bd) bd.innerHTML = '';
      const prim = document.getElementById('hmPrimary');
      if (prim) prim.onclick = null;
    }

    function show(title, bodyBuilder, onPrimary, primaryText) {
      const t = document.getElementById('hmTitle');
      if (t) t.textContent = title || '';

      const bd = document.getElementById('hmBody');
      if (bd) {
        bd.innerHTML = '';
        const built = (typeof bodyBuilder === 'function') ? bodyBuilder() : null;
        if (built) bd.append(built);
      }

      const prim = document.getElementById('hmPrimary');
      if (prim) {
        const hasPrimary = typeof onPrimary === 'function';
        prim.style.display = hasPrimary ? 'inline-flex' : 'none';
        prim.textContent = primaryText || 'SAVE';
        prim.onclick = hasPrimary ? onPrimary : null;
      }

      root.style.display = 'flex';
      const close = document.getElementById('hmClose');
      if (close) close.onclick = hide;
    }

    root.addEventListener('click', (e) => { if (e.target === root) hide(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hide(); });

    window.__hunters_hideModal = hide;
    window.__hunters_showModal = show;
  }

  function huntersShowModal(title, bodyBuilder, onPrimary = null, primaryText = 'SAVE') {
    ensureHuntersModal();
    window.__hunters_showModal?.(title, bodyBuilder, onPrimary, primaryText);
  }
  function huntersHideModal() {
    try { window.__hunters_hideModal?.(); } catch {}
  }

  // --------------------------
  // Admin helpers
  // --------------------------
  const LS_HIDE_ADMIN_KEY = 'sla_hide_admin_buttons';

  function getHideAdminButtons() {
    try { return localStorage.getItem(LS_HIDE_ADMIN_KEY) === '1'; } catch { return false; }
  }
  function isAdminUser() {
    return !!(window.STATE && window.STATE.isAdmin);
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
  // Global order (ALL users)
  // --------------------------
  async function loadGlobalHuntersOrder() {
    try {
      const r = await fetch(url('/api/global/order?dataset=hunters'), { cache: 'no-store', credentials: 'include' });
      if (!r.ok) return [];
      const j = await r.json().catch(() => ({}));
      return Array.isArray(j?.order) ? j.order : [];
    } catch { return []; }
  }

  function applyOrderToHunters(list, order) {
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

  async function saveGlobalHuntersOrder(order) {
    const out = await fetchJson(url('/api/global/order'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ dataset: 'hunters', order: Array.isArray(order) ? order : [] })
    });
    if (!out.ok) throw new Error(out?.data?.error || `HTTP ${out.status}`);
    return true;
  }

  // --------------------------
  // Icons
  // --------------------------
  const ICONS = {
    rarity: {
      SSR: url('/picture/Rarity/SSR.png'),
      SR:  url('/picture/Rarity/SR.png'),
      R:   url('/picture/Rarity/R.png')
    },
    element: {
      fire:  url('/picture/Element/Fires.png'),
      water: url('/picture/Element/Waters.png'),
      wind:  url('/picture/Element/Winds.png'),
      light: url('/picture/Element/Lights.png'),
      dark:  url('/picture/Element/Darkness.png'),
      none:  url('/picture/Element/NONE.png')
    },
    role: {
      Striker: url('/picture/Type/Striker.png'),
      Breaker: url('/picture/Type/Breaker.png'),
      Supporter: url('/picture/Type/Supporter.png'),
      'Elemental Stacker': url('/picture/Type/Stacker.png'),
      Buster: url('/picture/Type/Buster.png'),
    }
  };

  function normElement(e) {
    const raw = String(e ?? '').trim().toLowerCase();
    const alias = { non: 'none', neutral: 'none', 'no element': 'none' };
    return alias[raw] ?? raw;
  }

  // --------------------------
  // Growth image defaults (fallback)
  // --------------------------
  const GROWTH_IMG = {
    0: url('/picture/Growth/0.png'),
    1: url('/picture/Growth/1_1.png'),
    2: url('/picture/Growth/1_2.png'),
    3: url('/picture/Growth/1_3.png'),
    4: url('/picture/Growth/2_1.png'),
    5: url('/picture/Growth/2_2.png'),
    6: url('/picture/Growth/2_3.png'),
    7: url('/picture/Growth/3_1.png'),
    8: url('/picture/Growth/3_2.png'),
    9: url('/picture/Growth/3_3.png'),
    10: url('/picture/Growth/4_1.png'),
    11: url('/picture/Growth/4_2.png'),
    12: url('/picture/Growth/4_3.png'),
    13: url('/picture/Growth/5_1.png'),
    14: url('/picture/Growth/5_2.png'),
    15: url('/picture/Growth/5_3.png')
  };

  // --------------------------
  // Rarity SVG icons (toolbar)
  // --------------------------
  function svgDataUri(svg) {
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  }
  function rarityIconSrc(r) {
    const R = String(r || '').toUpperCase();
    if (R === 'SR') {
      return svgDataUri(`
        <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">
          <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#6d28d9"/><stop offset="1" stop-color="#a855f7"/>
          </linearGradient></defs>
          <rect x="6" y="6" width="52" height="52" rx="14" fill="url(#g)" stroke="#d8b4fe" stroke-width="2"/>
          <text x="32" y="40" font-size="22" font-family="Arial" font-weight="900" text-anchor="middle" fill="#ffffff">SR</text>
        </svg>
      `.trim());
    }
    return svgDataUri(`
      <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">
        <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#b91c1c"/><stop offset="1" stop-color="#ef4444"/>
        </linearGradient></defs>
        <rect x="6" y="6" width="52" height="52" rx="14" fill="url(#g)" stroke="#fecaca" stroke-width="2"/>
        <text x="32" y="40" font-size="20" font-family="Arial" font-weight="900" text-anchor="middle" fill="#ffffff">SSR</text>
      </svg>
    `.trim());
  }

  // --------------------------
  // CSS (Desktop + Mobile)
  // --------------------------
  function injectLocalStyles() {
    const STYLE_ID = 'sla-hunters-style';

    const legacy = document.getElementById('hunters-module-style');
    if (legacy) legacy.remove();

    // ✅ FIX: przebijamy zewnętrzny CSS:
    // - większa specyficzność (#content .hunters-ml-row)
    // - grid-template-columns + grid-template-areas z !important
    const rawCss = `
      [data-sla-page="hunters"],[data-sla-page="hunters"] *{box-sizing:border-box}
      [data-sla-page="hunters"]{overflow-x:hidden}

      /* --------------------------
         Builds cards
      -------------------------- */
      .builds-grid{display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(160px,1fr))}
      .builds-card{position:relative;border-radius:16px;overflow:hidden;border:1px solid rgba(100,116,139,.35);
        box-shadow:0 6px 16px rgba(0,0,0,.12);aspect-ratio:3/4;cursor:pointer;transition:transform .12s ease,box-shadow .12s ease}
      .builds-card:hover{transform:translateY(-2px);box-shadow:0 10px 22px rgba(0,0,0,.18)}
      .avatar.solo.rar-R{background:linear-gradient(180deg,#1e3759 0%, #0375b3 53%)}
      .avatar.solo.rar-SR{background:linear-gradient(180deg,#343659 0%, #8a5fcc 53%)}
      .avatar.solo.rar-SSR{background:linear-gradient(180deg,#3b3550 0%, #a7353a 53%)}
      .builds-card .portrait{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
      .card-badges{position:absolute;top:8px;left:8px;display:flex;flex-direction:column;gap:6px;z-index:2}
      .card-badges img.badge{width:28px;height:28px;object-fit:contain}
      .builds-card .name{position:absolute;left:0;right:0;bottom:0;padding:10px 12px;text-align:center;font-weight:900;color:#e2e8f0;
        background:linear-gradient(to top,rgba(2,6,23,.70) 0%,rgba(2,6,23,.25) 60%,rgba(2,6,23,0) 100%)}
      .builds-card .name{
        display:-webkit-box;
        -webkit-box-orient:vertical;
        -webkit-line-clamp:2;
        overflow:hidden;
        white-space:normal;
        line-height:1.15;
        overflow-wrap:anywhere;
      }

      /* --------------------------
         Toolbar (Filters)
      -------------------------- */
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
      .icon-btn.is-active{border-color:rgba(250,204,21,.85);background:rgba(250,204,21,.12);box-shadow:0 0 0 3px rgba(250,204,21,.22)}
      .icon-btn img{width:22px;height:22px;object-fit:contain;pointer-events:none}
      .icon-btn.rarity img{width:26px;height:26px}

      .toolbar-right{margin-left:auto;display:flex;align-items:center;gap:10px;flex-wrap:wrap}
      .reset-btn{height:38px;padding:0 14px;border-radius:12px;border:1px solid rgba(239,68,68,.55);background:rgba(239,68,68,.15);
        color:#fecaca;font-weight:900;display:flex;align-items:center;gap:8px;cursor:pointer}
      .reset-x{display:grid;place-items:center;width:20px;height:20px;border-radius:7px;background:rgba(239,68,68,.30);
        border:1px solid rgba(239,68,68,.55);color:#fff;font-size:14px;font-weight:900;line-height:1}
      .edit-btn{height:38px;padding:0 14px;border-radius:12px;border:1px solid rgba(148,163,184,.35);background:rgba(255,255,255,.92);
        color:#0f172a;font-weight:900;cursor:pointer}
      .edit-btn.is-edit{border-color:rgba(250,204,21,.55);background:rgba(250,204,21,.92);color:#0f172a;box-shadow:0 0 0 3px rgba(250,204,21,.18)}

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

      .hunters-filter-backdrop{position:fixed;inset:0;display:none;align-items:center;justify-content:center;z-index:9998;background:rgba(2,6,23,.58);backdrop-filter:blur(3px);padding:14px}
      .hunters-filter-modal{width:calc(100vw - 28px);max-width:420px;max-height:80vh;border-radius:16px;border:1px solid rgba(148,163,184,.28);background:rgba(2,6,23,.94);color:#e2e8f0;box-shadow:0 18px 60px rgba(0,0,0,.55);overflow:hidden;display:flex;flex-direction:column}
      .hunters-filter-hd{padding:14px 16px;border-bottom:1px solid rgba(148,163,184,.20);font-weight:1000;color:#facc15}
      .hunters-filter-bd{padding:16px;overflow:auto;display:grid;gap:14px}
      .hunters-filter-ft{padding:12px 16px;border-top:1px solid rgba(148,163,184,.20);display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap}
      .hunters-filter-search{width:100%;height:38px;padding:0 14px;border-radius:12px;border:1px solid rgba(148,163,184,.35);outline:none;color:#e2e8f0;background:rgba(15,23,42,.55);font-weight:900}
      .hunters-filter-icons{display:flex;align-items:center;gap:8px;flex-wrap:wrap;overflow-x:hidden}
      .hunters-filter-icons .icon-btn{width:36px;height:36px;border-radius:10px}
      .hunters-filter-icons .icon-btn img{width:24px;height:24px}

      /* tooltip */
      /* tooltip (FIX: nie wynoś ikon nad topbar) */
      .tip{
        position:relative;
        z-index:auto;              /* było 9998 */
      }
        
      .tip:hover{
        z-index:auto;              /* było 9999 */
      }
        
      /* dymek ma być nad ikoną, ale nie nad całym UI */
      .tip:hover::after{
        content:attr(data-tip);
        position:absolute;
        left:50%;
        transform:translateX(-50%);
        bottom:calc(100% + 10px);
        background:rgba(2,6,23,.92);
        color:#e2e8f0;
        padding:6px 10px;
        border-radius:10px;
        border:1px solid rgba(148,163,184,.25);
        font-weight:900;
        font-size:12px;
        white-space:nowrap;
        z-index:50;               /* było 999999 */
        pointer-events:none;
      }
        
      .tip:hover::before{
        content:'';
        position:absolute;
        left:50%;
        transform:translateX(-50%);
        bottom:calc(100% + 4px);
        width:0;height:0;
        border-left:6px solid transparent;
        border-right:6px solid transparent;
        border-top:6px solid rgba(2,6,23,.92);
        z-index:50;               /* było 999999 */
        pointer-events:none;
      }
        

      /* --------------------------
         My list rows
      -------------------------- */
      .hunters-ml-wrap{display:grid;gap:12px;width:100%}
      .hunters-card{border-radius:18px;border:1px solid rgba(148,163,184,.25);background:rgba(2,6,23,.28);overflow:hidden}

      /* ✅ FIX: przebijamy nadpisanie */

      /* ✅ FIX: przebijamy nadpisanie */
      #content .hunters-ml-row{
        width:100%;
        max-width:100%;
        box-sizing:border-box;

        border-radius:0;
        border:none;
        background:transparent;
        padding:10px 14px;

        display:grid !important;
        align-items:center !important;
        gap:10px !important;

        grid-template-columns:
          70px
          minmax(180px, 320px)   /* NAME (więcej miejsca) */
          minmax(170px, 240px)   /* ADV */
          minmax(220px, 320px)   /* GROWTH (mniej miejsca) */
          120px                  /* LV */
          56px
          56px
          56px !important;

        grid-template-areas: "img name adv growth lv role elem rarity" !important;
      }

      #content .hunters-ml-row > *{min-width:0;}

      #content .hunters-ml-row.bulk{
        border-color: rgba(168,85,247,.35) !important;
        box-shadow: 0 0 0 1px rgba(168,85,247,.10), 0 10px 24px rgba(0,0,0,.12);
        position: relative;
        background: rgba(88,28,135,.10);
        margin-bottom: 12px;
      }
      .dark #content .hunters-ml-row.bulk{
        background: rgba(88,28,135,.18) !important;
      }
      .ml-all{
        display:grid;
        place-items:center;
        width:64px;
        height:64px;
        border-radius:14px;
        border:1px solid rgba(168,85,247,.35);
        background: rgba(168,85,247,.18);
        color:#e2e8f0;
        font-weight:950;
        font-size:12px;
        letter-spacing:.18em;
      }

      .col-img{grid-area:img}
      .col-name{grid-area:name}
      .col-adv{grid-area:adv}
      .col-growth{grid-area:growth}
      .col-lv{grid-area:lv}
      .col-rarity{grid-area:rarity}
      .col-role{grid-area:role}
      .col-elem{grid-area:elem}

      .ml-img{width:70px;height:70px;border-radius:18px;border:1px solid rgba(148,163,184,.22);background:rgba(15,23,42,.55);
        overflow:hidden;display:grid;place-items:center}
      .ml-img img{width:100%;height:100%;object-fit:cover}
      .ml-name{
        font-size:20px;
        font-weight:900;
        color:#e2e8f0;

        white-space:normal;
        overflow:hidden;

        display:-webkit-box;
        -webkit-box-orient:vertical;
        -webkit-line-clamp:2;   /* ✅ max 2 linie */
        line-height:1.15;

        overflow-wrap:anywhere;
        word-break:break-word;
      }
      .ml-center{display:flex;align-items:center;justify-content:center;text-align:center;width:100%;min-width:0}

      .ml-adv-wrap{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;min-width:0}
      .ml-adv-btn{width:34px;height:34px;border-radius:12px;border:1px solid rgba(148,163,184,.25);background:rgba(15,23,42,.55);
        color:#e2e8f0;font-weight:900;cursor:pointer;display:grid;place-items:center;flex:0 0 auto}
      .ml-adv-mid{font-size:25px;font-weight:900;letter-spacing:.6px;color:#e2e8f0;min-width:140px;white-space:nowrap;max-width:100%;overflow:hidden;text-overflow:ellipsis}
      .ml-adv-dontown{font-size:15px;font-weight:900;opacity:.9;overflow:visible !important;text-overflow:unset !important;white-space:nowrap !important;}

      .ml-growth-img{width:50px;height:50px;object-fit:contain;filter:drop-shadow(0 6px 14px rgba(0,0,0,.35));flex:0 0 auto}
      .ml-growth-select{
        height:38px;border-radius:12px;border:1px solid rgba(148,163,184,.22);background:rgba(15,23,42,.55);
        color:#e2e8f0;font-weight:900;padding:0 12px;outline:none;
        width:140px;
        font-size:18px
      }
      .ml-lv-text{font-size:20px;font-weight:900;color:#e2e8f0;white-space:nowrap}
      .ml-lv-input{
        width:110px;height:38px;border-radius:12px;border:1px solid rgba(148,163,184,.22);background:rgba(15,23,42,.55);
        color:#e2e8f0;font-weight:900;font-size:20px;text-align:center;outline:none
      }
      .ml-icon40{width:40px;height:40px;object-fit:contain;filter:drop-shadow(0 6px 14px rgba(0,0,0,.35))}

      .hunter-weapon-wrap{padding:0 14px 14px;border-top:1px solid rgba(148,163,184,.16);display:grid;gap:10px}
      .hunter-weapon-row{display:grid;grid-template-columns:84px minmax(180px,1fr) minmax(180px,240px) 140px;gap:10px;align-items:center;padding-top:14px}
      .hunter-weapon-thumb{width:84px;height:84px;border-radius:16px;border:1px solid rgba(148,163,184,.22);background:rgba(15,23,42,.55);overflow:hidden;display:grid;place-items:center}
      .hunter-weapon-thumb img{width:100%;height:100%;object-fit:cover}
      .hunter-weapon-meta{min-width:0;display:grid;gap:8px}
      .hunter-weapon-label{font-size:12px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;color:rgba(148,163,184,.95)}
      .hunter-weapon-name{font-size:18px;font-weight:900;color:#e2e8f0;line-height:1.15;overflow-wrap:anywhere}
      .hunter-weapon-tags{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
      .hunter-weapon-tag{height:34px;display:inline-flex;align-items:center;justify-content:center;padding:0 12px;border-radius:999px;border:1px solid rgba(148,163,184,.20);background:rgba(255,255,255,.05);font-size:13px;font-weight:900;color:#fcd34d}
      .hunter-weapon-tag.icon{padding:0 10px}
      .hunter-weapon-tag-icon{width:18px;height:18px;object-fit:contain}
      .hunter-weapon-stat{min-width:0;border:1px solid rgba(148,163,184,.18);background:rgba(15,23,42,.25);border-radius:14px;padding:10px;display:grid;gap:8px;align-items:center}
      .hunter-weapon-stat-label{font-size:12px;font-weight:950;text-transform:uppercase;color:rgba(148,163,184,.95)}
      .hunter-weapon-stat-value{font-size:20px;font-weight:900;color:#e2e8f0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:center}
      .hunter-weapon-stat-value.dontown{font-size:14px}
      .hunter-weapon-adv-wrap{justify-content:center}
      .hunter-weapon-input-wrap{display:flex;justify-content:center}
      .hunter-weapon-lv-input{width:100px}

      /* ✅ Desktop-smaller */
      @media (max-width: 1150px){
        #content .hunters-ml-row{
          padding:10px 12px;
          gap:8px;
          grid-template-columns:
            64px
            minmax(160px, 1fr)
            minmax(160px, 1fr)
            minmax(180px, 1fr)
            110px
            48px
            48px
            48px !important;
        }
        .ml-img{width:64px;height:64px;border-radius:16px}
        .ml-name{font-size:18px}
        .ml-adv-mid{font-size:22px;min-width:0}
        .ml-icon40{width:36px;height:36px}
      }

      @media (max-width: 980px){
        .hunter-weapon-row{grid-template-columns:72px 1fr;grid-template-areas:"img meta" "adv adv" "lv lv"}
        .hunter-weapon-thumb{grid-area:img;width:72px;height:72px;border-radius:14px}
        .hunter-weapon-meta{grid-area:meta}
        .hunter-weapon-row .hunter-weapon-stat:nth-child(3){grid-area:adv}
        .hunter-weapon-row .hunter-weapon-stat:nth-child(4){grid-area:lv}
      }

      /* --------------------------
         Card-style My list
      -------------------------- */
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
      .hunter-progress-head,.hunter-progress-weapon-head{display:flex;gap:14px;align-items:center}
      .hunter-progress-avatar,.hunter-progress-weapon-thumb{
        width:72px;height:72px;border-radius:18px;overflow:hidden;display:grid;place-items:center;
        background:rgba(15,23,42,.52);border:1px solid rgba(148,163,184,.22);flex:0 0 auto
      }
      .hunter-progress-avatar img,.hunter-progress-weapon-thumb img{width:100%;height:100%;object-fit:cover}
      .hunter-progress-meta,.hunter-progress-weapon-meta{min-width:0;display:grid;gap:8px}
      .hunter-progress-name,.hunter-progress-weapon-name{font-size:18px;font-weight:900;color:#e2e8f0;line-height:1.15}
      .hunter-progress-weapon-name{font-size:16px}
      .hunter-progress-weapon-label,.hunter-progress-stat-label{font-size:12px;font-weight:900;color:rgba(226,232,240,.72);text-transform:uppercase;text-align:center;display:flex;align-items:center;justify-content:center}
      .hunter-progress-badges{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
      .hunter-progress-badge{
        height:36px;min-width:36px;padding:0 13px;border-radius:999px;display:inline-flex;align-items:center;justify-content:center;
        border:1px solid rgba(148,163,184,.22);background:rgba(255,255,255,.04);color:#f8d574;font-weight:900;font-size:13px
      }
      .hunter-progress-badge.icon{padding:0;width:41px}
      .hunter-progress-badge.icon img{width:31px;height:31px;object-fit:contain}
      .hunter-progress-badge.rarity-icon{padding:0;width:54px;background:transparent;border:0}
      .hunter-progress-badge.rarity-icon img{width:50px;height:32px;object-fit:contain}
      .hunter-progress-bulk-card{border-color:rgba(168,85,247,.35);box-shadow:0 0 0 1px rgba(168,85,247,.10), 0 12px 28px rgba(0,0,0,.18);background:linear-gradient(180deg,rgba(88,28,135,.24) 0%, rgba(15,23,42,.82) 100%)}
      .hunter-progress-all-badge{white-space:pre-line;line-height:1.05;text-align:center;font-size:11px}
      .hunter-progress-bulk-sub{font-size:12px;font-weight:800;color:rgba(226,232,240,.72)}
      .hunter-progress-stats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:14px}
      .hunter-progress-stat{
        min-width:0;border-radius:14px;border:1px solid rgba(148,163,184,.18);
        background:rgba(255,255,255,.04);padding:12px;display:grid;gap:10px
      }
      .hunter-progress-stat-full{grid-column:1 / -1}
      .hunter-progress-stat-value{font-size:22px;font-weight:900;color:#e2e8f0;display:flex;align-items:center;justify-content:center;text-align:center;min-height:42px;min-width:0;overflow:visible}
      .hunter-progress-stat-value.dontown{font-size:16px}
      .hunter-progress-stat-value.grow{min-height:54px;overflow:visible}
      .hunter-progress-growth-img{height:50px;max-width:100%;object-fit:contain}
      .hunter-progress-growth-edit{display:flex;align-items:center;justify-content:center;gap:10px;flex-wrap:wrap}
      .hunter-progress-level-chip{
        min-width:64px;height:42px;padding:0 14px;border-radius:10px;display:inline-flex;align-items:center;justify-content:center;
        background:linear-gradient(180deg,#7b8798 0%, #5e6a7a 100%);color:#fff;font-size:28px;font-weight:950;letter-spacing:.02em;
        box-shadow:inset 0 1px 0 rgba(255,255,255,.18)
      }
      .hunter-progress-level-chip.weapon{background:linear-gradient(180deg,#f8e90c 0%, #e8c900 100%);color:#111827}
      .hunter-progress-level-input{width:100%;max-width:120px;text-align:center}
      .hunter-edit-select{width:100%;min-width:0;height:42px;border-radius:10px;border:1px solid rgba(148,163,184,.24);background:rgba(15,23,42,.72);color:#e2e8f0;padding:0 36px 0 12px;font-weight:900;text-align:center}
      .hunter-img-select{position:relative;min-width:0;width:100%}
      .hunter-img-select.disabled{opacity:.65}
      .hunter-img-select-btn{width:100%;min-height:44px;border-radius:10px;border:1px solid rgba(148,163,184,.24);background:rgba(15,23,42,.72);color:#e2e8f0;padding:6px 12px;display:flex;align-items:center;justify-content:center;gap:10px;font-weight:900;overflow:visible}
      .hunter-img-select-preview{height:24px;max-width:60px;object-fit:contain}
      .hunter-img-select-value{font-size:18px;line-height:1}
      .hunter-img-select-caret{opacity:.8;font-size:14px}
      .hunter-img-select-menu{position:absolute;left:0;right:0;top:calc(100% + 6px);max-height:260px;overflow:auto;padding:6px;border-radius:12px;border:1px solid rgba(148,163,184,.22);background:#111827;box-shadow:0 14px 30px rgba(0,0,0,.35);z-index:120}
      .hunter-img-select-item{width:100%;min-height:42px;border-radius:10px;border:0;background:transparent;color:#e2e8f0;padding:6px 8px;display:flex;align-items:center;gap:10px;font-weight:900;text-align:left}
      .hunter-img-select-item:hover{background:rgba(255,255,255,.06)}
      .hunter-img-select-item-icon{height:22px;max-width:56px;object-fit:contain}
      .hunter-img-select-item-text{font-size:16px}
      .hunter-progress-adv-wrap{justify-content:center}
      .hunter-progress-weapon-card{margin-top:16px;padding-top:16px;border-top:1px solid rgba(148,163,184,.16);overflow:visible}
      .hunter-progress-weapon-stats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:12px}

      @media (max-width: 900px){
        .hunters-cards-grid{grid-template-columns:1fr}
      }
      @media (max-width: 520px){
        .hunter-progress-card{padding:14px}
        .hunter-progress-avatar,.hunter-progress-weapon-thumb{width:64px;height:64px;border-radius:16px}
        .hunter-progress-name{font-size:17px}
        .hunter-progress-stats,.hunter-progress-weapon-stats{grid-template-columns:repeat(2,minmax(0,1fr))}
        .hunter-progress-level-chip{font-size:24px;min-width:58px}
        .hunter-progress-stat-full{grid-column:1 / -1}
      }

      /* --------------------------
         Admin
      -------------------------- */
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

      .admin-list-row{
        border:1px solid rgba(148,163,184,.25);
        border-radius:16px;
        background:rgba(2,6,23,.18);
        padding:10px;
        display:flex;
        gap:12px;
        align-items:center;
        flex-wrap:wrap;
        min-width:0;
      }
      .admin-thumb{width:56px;height:56px;border-radius:16px;overflow:hidden;background:rgba(15,23,42,.55);border:1px solid rgba(148,163,184,.22);flex:0 0 auto}
      .admin-thumb img{width:100%;height:100%;object-fit:cover}
      .admin-meta{min-width:0;flex:1}
      .admin-meta .nm{font-weight:900;color:#e2e8f0}
      .admin-meta .sm{font-size:12px;color:rgba(148,163,184,.95);font-weight:800}
      .admin-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}
      .mini-btn{height:36px;padding:0 10px;border-radius:12px;border:1px solid rgba(148,163,184,.25);background:rgba(15,23,42,.55);color:#e2e8f0;font-weight:900;cursor:pointer}
      .mini-btn.primary{background:rgba(255,255,255,.92);color:#0f172a}

      /* --------------------------
         Mobile
      -------------------------- */
      @media (max-width: 834px){
        .hunters-toolbar{display:none}
        .filters-btn{display:flex;width:100%}
        .filter-group{padding-left:0;border-left:none}
        .icon-row{flex-wrap:wrap;overflow-x:hidden;padding-bottom:0}
        .icon-btn{width:30px;height:30px;border-radius:10px}
        .icon-btn img{width:20px;height:20px}
        .icon-btn.rarity img{width:24px;height:24px}
      }

      @media (max-width: 720px){
        .hm-backdrop{ align-items:flex-end; }
        .hm-modal{
          width:100vw;
          max-width:none;
          border-radius:18px 18px 0 0;
        }
        .hm-bd{ max-height:70vh; }
      }

      @media (max-width: 900px){
        #content .hunters-ml-row{
          grid-template-columns: 64px 1fr !important;
          grid-template-areas: "img name" "adv adv" "growth growth" "lv lv" !important;
          justify-items:stretch;
          align-items:stretch;
          padding:12px;
        }

        .col-img{justify-content:center}
        .col-name{justify-content:flex-start;align-items:center;padding-left:8px}

        .col-adv, .col-growth, .col-lv{
          justify-content:space-between;
          align-items:center;
          padding:8px 10px;
          border-radius:14px;
          border:1px solid rgba(148,163,184,.18);
          background: rgba(15,23,42,.25);
        }

        .col-adv::before{content:"Advancement"; font-weight:950; font-size:12px; opacity:.9}
        .col-growth::before{content:"Growth"; font-weight:950; font-size:12px; opacity:.9}
        .col-lv::before{content:"Level"; font-weight:950; font-size:12px; opacity:.9}

        .col-rarity, .col-role, .col-elem{display:none !important}

        .ml-img{width:64px;height:64px;border-radius:16px}
        .ml-name{font-size:16px}
        .ml-adv-mid{font-size:20px;min-width:0}

        .ml-adv-dontown{
          overflow:visible !important;
          text-overflow:unset !important;
          white-space:nowrap !important;
        }

        .ml-growth-select{
          width:120px !important;
          max-width:55vw;
          min-width:0 !important;
        }

        .ml-lv-input{width:min(180px,55vw)}
      }

      @media (max-width: 640px){
        .admin-row{
          flex-direction:column !important;
          align-items:stretch !important;
        }
        .admin-in, .admin-btn, select, input, .relative.flex-1{
          width:100% !important;
          min-width:0 !important;
          max-width:100% !important;
          box-sizing:border-box !important;
        }
        .relative.flex-1 > input{width:100% !important;max-width:100% !important;box-sizing:border-box !important}
        .relative.flex-1 > div[style*="position:absolute"]{left:0 !important;right:0 !important;width:100% !important;max-width:100% !important;overflow-x:hidden !important;box-sizing:border-box !important}
        .relative.flex-1 > div[style*="position:absolute"] .truncate{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .admin-actions{
          width:100%;
          justify-content:flex-start;
        }
        .hunter-admin-add-row{display:grid !important;grid-template-columns:1fr !important;width:100%}
        .hunter-admin-add-row > *{width:100% !important;min-width:0 !important;max-width:100% !important;box-sizing:border-box !important}
        .hunter-admin-item{
          width:100%;
          max-width:100%;
          overflow:hidden;
          display:grid !important;
          grid-template-columns:54px minmax(0,1fr);
          grid-template-areas:"thumb meta" "actions actions";
          align-items:center;
        }
        .hunter-admin-item > :first-child{grid-area:thumb;width:54px;height:54px}
        .hunter-admin-meta{grid-area:meta;min-width:0}
        .hunter-admin-meta .truncate{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .hunter-admin-actions{grid-area:actions;display:grid !important;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;width:100%;justify-content:stretch}
        .hunter-admin-actions button{width:100%;min-width:0;padding-left:0 !important;padding-right:0 !important}
      }
    `;
    const css =
      scopeCss(rawCss, HUNTERS_SCOPE) +
      '\n' +
      scopeCss(rawCss, '#hunters-modal-root');


    let s = document.getElementById(STYLE_ID);

    if (!s) {
      s = document.createElement('style');
      s.id = STYLE_ID;
      s.setAttribute('data-sla-module', 'hunters');
      document.head.appendChild(s);
    }

    if (s.textContent !== css) s.textContent = css;

    // ✅ zawsze na koniec head (wygrywa kolejnością)
    try { document.head.appendChild(s); } catch {}
  }

  // --------------------------
  // Toggle helpers
  // --------------------------
  function toggleInArray(arr, val) {
    const a = Array.isArray(arr) ? arr : [];
    const v = String(val);
    const idx = a.indexOf(v);
    if (idx >= 0) return a.filter(x => x !== v);
    return [...a, v];
  }
  function hasInArray(arr, val) {
    return Array.isArray(arr) && arr.includes(String(val));
  }

  // --------------------------
  // Advancement states (0..10)
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


  function advInternalToMenuValue(advIndex) {
    const a = clampInt(advIndex, 0, ADV_MAX);
    return a <= 0 ? 'dontown' : String(a - 1);
  }

  function advMenuValueToInternal(v, maxInternal = ADV_MAX) {
    if (String(v || '') === 'dontown') return 0;
    return clampInt(Number(v) + 1, 1, Math.max(1, maxInternal));
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

  function makeImageNumberSelect({ value = 0, max = 15, imgFor, onChange, disabled = false }) {
    const wrap = el('div', { class: `hunter-img-select ${disabled ? 'disabled' : ''}` });
    const btn = el('button', { class: 'hunter-img-select-btn', type: 'button', disabled });
    const menu = el('div', { class: 'hunter-img-select-menu', style: 'display:none' });

    function closeMenu() { menu.style.display = 'none'; wrap.classList.remove('open'); }
    function openMenu() { if (disabled) return; menu.style.display = 'block'; wrap.classList.add('open'); }
    function syncButton(v) {
      btn.innerHTML = '';
      btn.append(
        el('img', { class: 'hunter-img-select-preview', src: cdnySafe(imgFor(v), 96), alt: String(v), loading: 'lazy', decoding: 'async' }),
        el('span', { class: 'hunter-img-select-value' }, String(v)),
        el('span', { class: 'hunter-img-select-caret' }, '▾')
      );
    }

    for (let i = 0; i <= max; i++) {
      const item = el('button', { class: 'hunter-img-select-item', type: 'button' },
        el('img', { class: 'hunter-img-select-item-icon', src: cdnySafe(imgFor(i), 96), alt: String(i), loading: 'lazy', decoding: 'async' }),
        el('span', { class: 'hunter-img-select-item-text' }, String(i))
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
  // State
  // --------------------------
  const LS_SUBTAB = 'hunters.ui.subtab';

  const DEFAULT_CFG = {
    growthMax: 15,
    levelMax: 130,
    growthImages: { ...GROWTH_IMG }
  };

  const STATE = {
    subtab: (localStorage.getItem(LS_SUBTAB) || 'builds'),
    filters: { name: '', rarities: [], elements: [], roles: [] },
    data: { hunters: [], weapons: [] },

    session: { loggedIn: true },

    collection: {
      loaded: false,
      loading: false,
      saving: false,
      dirty: false,
      progress: {}
    },

    weaponCollection: {
      loaded: false,
      loading: false,
      saving: false,
      dirty: false,
      progress: {}
    },

    weaponCfg: {
      levelMax: 100
    },

    bulk: { adv: 1, growth: 0, lvl: 1, weaponAdv: 0, weaponLvl: 1 },

    ui: {
      hideAdminButtons: getHideAdminButtons(),
      editMode: false
    },

    globalOrder: [],
    cfg: { ...DEFAULT_CFG },

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
    STATE.filters.roles = [];
  }

  // --------------------------
  // Dropdown config (public/admin)
  // --------------------------
  async function loadHuntersDropdowns() {
    try {
      const r = await fetch(url('/api/public/hunters-dropdowns'), { cache: 'no-store' });
      if (!r.ok) return { ...DEFAULT_CFG };

      const j = await r.json().catch(() => ({}));
      const growthMax = clampInt(j?.growthMax ?? DEFAULT_CFG.growthMax, 1, 99);
      const levelMax = clampInt(j?.levelMax ?? DEFAULT_CFG.levelMax, 1, 999);

      const gi = (j?.growthImages && typeof j.growthImages === 'object') ? j.growthImages : {};
      const growthImages = { ...GROWTH_IMG };

      for (let i = 0; i <= growthMax; i++) {
        const k = String(i);
        const v = gi[k] || gi[i];
        if (typeof v === 'string' && v.trim()) growthImages[i] = v.trim();
      }

      return { growthMax, levelMax, growthImages };
    } catch {
      return { ...DEFAULT_CFG };
    }
  }

  function growthImgFor(v) {
    const n = clampInt(v, 0, 999);
    const key = Math.max(0, Math.min(STATE.cfg.growthMax ?? 15, n));
    const map = (STATE.cfg && STATE.cfg.growthImages) ? STATE.cfg.growthImages : GROWTH_IMG;
    return resolveLocalOrRemoteSrc((map[key] || map[0] || GROWTH_IMG[0]), 'Growth');
  }

  // --------------------------
  // Per-user progress (GET/POST /api/data)
  // --------------------------
  function normKey(s) {
    return String(s || '')
      .trim()
      .toLowerCase()
      .replaceAll('’', "'")
      .replace(/\s+/g, ' ');
  }

  function getMyEntry(name) {
    const obj = STATE.collection.progress || {};
    if (obj[name]) return obj[name];

    const target = normKey(name);
    for (const [k, v] of Object.entries(obj)) {
      if (normKey(k) === target) return v;
    }
    return { adv: 0, growth: 0, lvl: 1 };
  }

  function setMyEntry(name, patch) {
    const obj = STATE.collection.progress || (STATE.collection.progress = {});
    const cur = getMyEntry(name);
    const next = { ...cur, ...(patch || {}) };

    next.adv = clampInt(next.adv, 0, ADV_MAX);
    next.growth = clampInt(next.growth, 0, STATE.cfg.growthMax ?? 15);
    next.lvl = clampInt(next.lvl, 1, STATE.cfg.levelMax ?? 130);

    obj[name] = next;
    STATE.collection.dirty = true;
  }

  function isOwned(name) {
    const e = getMyEntry(name);
    return clampInt(e?.adv, 0, ADV_MAX) >= 1;
  }

  function getTotalUnique() {
    return new Set((STATE.data.hunters || []).map(h => String(h?.name || '').trim()).filter(Boolean)).size;
  }

  function getOwnedCountAll() {
    const unique = new Set((STATE.data.hunters || []).map(h => String(h?.name || '').trim()).filter(Boolean));
    let owned = 0;
    for (const name of unique) {
      if (isOwned(name)) owned++;
    }
    return owned;
  }

  const USER_PROGRESS_SYNC_EVENT = 'slahub:user-progress-sync';

  function emitUserProgressSync(detail = {}) {
    try {
      window.dispatchEvent(new CustomEvent(USER_PROGRESS_SYNC_EVENT, { detail }));
    } catch (e) {
      console.warn('emitUserProgressSync failed:', e);
    }
  }

  async function loadMyHuntersProgress() {
    if (STATE.collection.loaded || STATE.collection.loading) return;

    // ✅ GUEST: nie rób GET /api/data (unikamy 401 w konsoli)
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
      const src = (j && typeof j.huntersProgress === 'object' && j.huntersProgress) ? j.huntersProgress : {};
      STATE.collection.progress = { ...src };
      STATE.collection.loaded = true;
    } catch (e) {
      console.error('loadMyHuntersProgress failed:', e);
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
      const adv = clampInt(v?.adv, 0, ADV_MAX);
      if (adv <= 0) continue;

      out[name] = {
        adv,
        growth: clampInt(v?.growth, 0, STATE.cfg.growthMax ?? 15),
        lvl: clampInt(v?.lvl, 1, STATE.cfg.levelMax ?? 130)
      };
    }
    return out;
  }

  async function saveMyHuntersProgress() {
    if (!STATE.session.loggedIn) return false;
    if (STATE.collection.saving) return false;
    if (!STATE.collection.dirty) return true;

    STATE.collection.saving = true;
    try {
      const payload = { huntersProgress: buildSavePayload() };

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
      emitUserProgressSync({ source: 'Hunter', type: 'hunters' });
      toast('Saved ✅');
      return true;
    } catch (e) {
      console.error('saveMyHuntersProgress failed:', e);
      toast('Save failed');
      return false;
    } finally {
      STATE.collection.saving = false;
    }
  }

  function normalizeHWeaponRel(v) {
    const s = String(v || '').trim();
    if (!s) return '';
    if (isHttpUrl(s)) return '';
    if (s.startsWith('HWeapon/')) return s;
    return `HWeapon/${s.replace(/^\/+/, '')}`;
  }

  function resolveWeaponImgSrc(w) {
    const rel = normalizeHWeaponRel(w?.image_build || w?.image || '');
    if (!rel) return '';
    return url(`/picture/${rel}`);
  }

  function normalizeWeaponEntry(v, weapon = null) {
    if (v === true) return { adv: 1, lvl: 1 };

    const o = (v && typeof v === 'object') ? v : {};
    const advRaw = (o.adv ?? o.advancement ?? o.growth ?? o.Growth ?? 0);
    const adv = clampInt(advRaw, 0, getWeaponMaxAdv(weapon));

    const lvRaw = (o.lvl ?? o.level ?? o.lv ?? 1);
    const lvl = clampInt(lvRaw, 1, STATE.weaponCfg.levelMax ?? 100);

    return { adv, lvl };
  }

  function getMyWeaponEntry(name) {
    const obj = STATE.weaponCollection.progress || {};
    const weapon = getWeaponByName(name);
    if (obj[name]) return normalizeWeaponEntry(obj[name], weapon);

    const target = normKey(name);
    for (const [k, v] of Object.entries(obj)) {
      if (normKey(k) === target) return normalizeWeaponEntry(v, weapon);
    }
    return { adv: 0, lvl: 1 };
  }

  function setMyWeaponEntry(name, patch) {
    const obj = STATE.weaponCollection.progress || (STATE.weaponCollection.progress = {});
    const cur = getMyWeaponEntry(name);
    const next = { ...cur, ...(patch || {}) };
    const weapon = getWeaponByName(name);

    next.adv = clampInt(next.adv, 0, getWeaponMaxAdv(weapon));
    next.lvl = clampInt(next.lvl, 1, STATE.weaponCfg.levelMax ?? 100);

    obj[name] = next;
    STATE.weaponCollection.dirty = true;
  }

  function buildWeaponSavePayload() {
    const out = {};
    const p = STATE.weaponCollection.progress || {};

    for (const [name, v] of Object.entries(p)) {
      const weapon = getWeaponByName(name);
      const e = normalizeWeaponEntry(v, weapon);
      const adv = clampInt(e.adv, 0, getWeaponMaxAdv(weapon));
      if (adv <= 0) continue;

      out[name] = {
        adv,
        growth: adv,
        lvl: clampInt(e.lvl, 1, STATE.weaponCfg.levelMax ?? 100)
      };
    }

    return out;
  }

  async function saveAllHunterAndWeaponProgress() {
    if (!STATE.session.loggedIn) return false;
    if (STATE.collection.saving || STATE.weaponCollection.saving) return false;
    if (!STATE.collection.dirty && !STATE.weaponCollection.dirty) return true;

    STATE.collection.saving = true;
    STATE.weaponCollection.saving = true;
    try {
      const payload = {
        huntersProgress: buildSavePayload(),
        hunterWeapons: buildWeaponSavePayload()
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

      STATE.collection.dirty = false;
      STATE.weaponCollection.dirty = false;
      emitUserProgressSync({ source: 'Hunter', type: 'all' });
      toast('Saved ✅');
      return true;
    } catch (e) {
      console.error('saveAllHunterAndWeaponProgress failed:', e);
      toast('Save failed');
      return false;
    } finally {
      STATE.collection.saving = false;
      STATE.weaponCollection.saving = false;
    }
  }

  async function loadMyHunterWeaponsProgress() {
    if (STATE.weaponCollection.loaded || STATE.weaponCollection.loading) return;

    const me = window.STATE?.me || null;
    if (!me) {
      STATE.session.loggedIn = false;
      STATE.weaponCollection.progress = {};
      STATE.weaponCollection.loaded = true;
      return;
    }

    STATE.weaponCollection.loading = true;
    try {
      const r = await fetch(url('/api/data'), { credentials: 'include', cache: 'no-store' });

      if (r.status === 401 || r.status === 403) {
        STATE.session.loggedIn = false;
        STATE.weaponCollection.progress = {};
        STATE.weaponCollection.loaded = true;
        return;
      }
      STATE.session.loggedIn = true;

      if (!r.ok) {
        STATE.weaponCollection.progress = {};
        STATE.weaponCollection.loaded = true;
        return;
      }

      const j = await r.json().catch(() => ({}));
      const src = (j && typeof j.hunterWeapons === 'object' && j.hunterWeapons) ? j.hunterWeapons : {};
      STATE.weaponCollection.progress = { ...src };
      STATE.weaponCollection.loaded = true;
    } catch (e) {
      console.error('loadMyHunterWeaponsProgress failed:', e);
      STATE.weaponCollection.progress = {};
      STATE.weaponCollection.loaded = true;
    } finally {
      STATE.weaponCollection.loading = false;
    }
  }

  function getWeaponsForHunter(hunterName) {
    const target = normKey(hunterName);
    return (STATE.data.weapons || []).filter((w) => {
      const owner = String(w?.hunter || w?.owner || w?.hunter_name || '').trim();
      return owner && normKey(owner) === target;
    });
  }

  async function loadHunterWeaponsCatalog() {
    try {
      const r = await fetch(url('/api/public/hunter-weapons'), { cache: 'no-store' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);

      const j = await r.json();
      const list = Array.isArray(j) ? j : (Array.isArray(j?.items) ? j.items : []);
      if (!Array.isArray(list)) throw new Error('Invalid hunter weapons catalog');

      STATE.data.weapons = list.map((w) => {
        const name = w.name || w.weapon_name || w.id || 'Unknown Weapon';
        const rarity = (w.rarity || 'SSR');
        const element = (w.element || 'None');
        const imageRaw = w.image || w.imageUrl || w.img || '';
        const imageBuildRaw = w.image_build || w.imageBuild || imageRaw;
        const hunter = (w.hunter || w.owner || w.hunter_name || '').trim();

        return {
          name,
          rarity,
          element,
          hunter,
          maxGrowth: clampInt((w.maxGrowth ?? w.max_growth ?? w.maxAdvancement ?? w.max_advancement ?? ADV_MAX), 1, ADV_MAX),
          image: normalizeHWeaponRel(imageRaw),
          image_build: normalizeHWeaponRel(imageBuildRaw)
        };
      });
    } catch (e) {
      console.error('Hunter weapons load failed:', e);
      STATE.data.weapons = [];
    }
  }

  // --------------------------
  // Data loading
  // --------------------------
  async function loadHunters() {
    STATE.loading = true;
    STATE.error = null;

    try {
      const r = await fetch(url('/api/public/hunters'), { cache: 'no-store' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);

      const j = await r.json();
      const list = Array.isArray(j) ? j : (Array.isArray(j?.items) ? j.items : []);
      if (!Array.isArray(list)) throw new Error('Invalid hunters catalog');

      STATE.data.hunters = list.map((h) => {
        const imageRaw = h.image || h.imageUrl || '';
        const imageBuildRaw = h.image_build || h.imageBuild || imageRaw;

        const imageLocal = normalizeLocalPicRel(imageRaw, 'Hunter_Icon');
        const imageBuildLocal = normalizeLocalPicRel(imageBuildRaw, 'Hunter');

        return {
          name: h.name || h.id || 'Unknown',
          rarity: (h.rarity || 'SSR'),
          element: (h.element || 'Fire'),
          role: (h.role || ''),
          image: imageLocal || String(imageRaw || '').trim(),
          image_build: imageBuildLocal || String(imageBuildRaw || '').trim()
        };
      });

      const ord = await loadGlobalHuntersOrder();
      STATE.globalOrder = ord;
      STATE.data.hunters = applyOrderToHunters(STATE.data.hunters, ord);
    } catch (e) {
      console.error('Hunters load failed:', e);
      STATE.error = 'Failed to load hunters data.';
      STATE.data.hunters = [];
    } finally {
      STATE.loading = false;
    }
  }

  // --------------------------
  // Filtering
  // --------------------------
  function filteredHunters() {
    const f = STATE.filters;

    const rarityFilterActive = (f.rarities && f.rarities.length > 0);
    const elementFilterActive = (f.elements && f.elements.length > 0);
    const roleFilterActive = (f.roles && f.roles.length > 0);

    return (STATE.data.hunters || []).filter((h) => {
      if (f.name && !String(h.name || '').toLowerCase().includes(String(f.name).toLowerCase())) return false;

      if (rarityFilterActive) {
        const rr = String(h.rarity || 'SSR').toUpperCase();
        if (!f.rarities.includes(rr)) return false;
      }

      if (elementFilterActive) {
        const ee = normElement(h.element);
        if (!f.elements.includes(ee)) return false;
      }

      if (roleFilterActive) {
        const ro = String(h.role || '');
        if (!f.roles.includes(ro)) return false;
      }

      return true;
    });
  }

  // --------------------------
  // UI: Header
  // --------------------------
  function renderHeader(root) {
    const top = el('div', { class: 'flex items-center justify-between gap-3 mb-4' });

    top.append(
      el('div', { class: 'min-w-0' },
        el('div', { class: 'text-2xl font-extrabold text-yellow-400 leading-tight' }, 'Hunters'),
        el('div', { class: 'text-sm text-white' }, 'Builds and your progress list')
      )
    );

    const right = el('div', { class: 'flex items-center gap-2 flex-wrap justify-end' });

    const total = getTotalUnique();
    const owned = getOwnedCountAll();

    const count = el(
      'div',
      { class: 'px-3 py-1 rounded-full border bg-[rgb(24_34_52)] dark:border-slate-700 text-sm font-semibold text-white' },
      `${owned}/${total || 0}`
    );

    right.append(count);
    top.append(right);
    root.append(top);
  }

  // --------------------------
  // UI: Tabs
  // --------------------------
  function renderSubtabs(root) {
    const tabs = [
      { key: 'builds', label: 'Builds' }
    ];
    if (STATE.session.loggedIn) tabs.push({ key: 'list', label: 'My list' });
    if (isAdminTabVisible()) tabs.push({ key: 'admin', label: 'Admin' });

    const cols = tabs.length;
    const gridCols = cols === 3 ? 'grid-cols-3' : cols === 2 ? 'grid-cols-2' : 'grid-cols-1';
    const bar = el('div', { class: 'grid ' + gridCols + ' gap-2 mb-4' });

    // ✅ Match HunterWeapons.js tab button sizing
    const tabClass = (active) => [
      'h-10 rounded-xl border text-base font-semibold transition-colors',
      active
        ? 'bg-yellow-400 text-black shadow border-yellow-300'
        : 'bg-glass text-slate-200 hover:bg-slate-800/50 border-slate-700/60'
    ].join(' ');


    const btn = (key, label) => {
      const active = STATE.subtab === key;
      const b = el(
        'button',
        {
          class: tabClass(active)
        },
        label
      );

      b.addEventListener('click', async () => {
        if (STATE.subtab === key) return;

        if (STATE.ui.editMode && STATE.subtab === 'list') {
          const ok = await saveAllHunterAndWeaponProgress();
          if (!ok) toast('Save failed ❌');
          STATE.ui.editMode = false;
        }

        setSubtab(key);

        if (key === 'list') await loadMyHuntersProgress();
        render();
      });

      return b;
    };

    if (STATE.subtab === 'admin' && !isAdminTabVisible()) setSubtab('builds');
    if (STATE.subtab === 'list' && !STATE.session.loggedIn) setSubtab('builds');
    for (const t of tabs) bar.append(btn(t.key, t.label));
    root.append(bar);
  }

  // --------------------------
  // Toolbar icons helper
  // --------------------------
  function iconButton({ title, iconSrc, active, className = '', onClick }) {
    const b = el('button', {
      type: 'button',
      class: `icon-btn ${className} ${active ? 'is-active' : ''}`,
      title,
      'aria-label': title
    });

    b.append(el('img', { src: cdnySafe(iconSrc, 64), alt: title, loading: 'lazy', decoding: 'async' }));
    b.addEventListener('click', onClick);
    return b;
  }

  // --------------------------
  // Filters + EDIT + RESET
  // --------------------------
  function renderFilters(root) {
    const isMobile = false;
    const bar = el('div', { class: 'hunters-toolbar mb-4' });

    const search = el('input', {
      type: 'text',
      value: STATE.filters.name,
      placeholder: 'Search hunter…',
      class: 'search'
    });
    search.addEventListener('input', () => {
      STATE.filters.name = search.value || '';
      renderKeepSearchFocus();
    });

    const makeRarityRow = (afterToggle) => {
      const row = el('div', { class: 'icon-row' });
      const rarItems = [
        { v: 'SR', label: 'SR', icon: rarityIconSrc('SR') },
        { v: 'SSR', label: 'SSR', icon: rarityIconSrc('SSR') }
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

    const makeRoleRow = (afterToggle) => {
      const row = el('div', { class: 'icon-row' });
      const roleItems = [
        { v: 'Striker', label: 'Striker', icon: ICONS.role.Striker },
        { v: 'Breaker', label: 'Breaker', icon: ICONS.role.Breaker },
        { v: 'Supporter', label: 'Supporter', icon: ICONS.role.Supporter },
        { v: 'Elemental Stacker', label: 'Elemental Stacker', icon: ICONS.role['Elemental Stacker'] },
        { v: 'Buster', label: 'Buster', icon: ICONS.role.Buster }
      ];
      for (const it of roleItems) {
        row.append(
          iconButton({
            title: it.label,
            iconSrc: it.icon,
            active: hasInArray(STATE.filters.roles, it.v),
            onClick: () => {
              STATE.filters.roles = toggleInArray(STATE.filters.roles, it.v);
              afterToggle?.();
            }
          })
        );
      }
      return row;
    };

    const right = el('div', { class: 'toolbar-right' });

    if (STATE.session.loggedIn && STATE.subtab === 'list') {
      const btnEdit = el('button', {
        type: 'button',
        class: 'edit-btn ' + (STATE.ui.editMode ? 'is-edit' : ''),
        title: STATE.ui.editMode ? 'Exit edit (auto-save)' : 'Edit your list'
      }, STATE.ui.editMode ? 'EXIT EDIT' : 'EDIT');

      btnEdit.addEventListener('click', async () => {
        if (STATE.subtab !== 'list') {
          setSubtab('list');
          await loadMyHuntersProgress();
          STATE.ui.editMode = true;
          render();
          return;
        }

        if (STATE.ui.editMode) {
          const ok = await saveAllHunterAndWeaponProgress();
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

    const reset = el('button', { type: 'button', class: 'reset-btn', title: 'Reset filters' },
      el('span', { class: 'reset-x' }, '×'),
      'Reset'
    );
    reset.addEventListener('click', () => {
      resetFilters();
      render();
    });

    const openFiltersSheet = () => {
      const rebuild = () => { render(); openFiltersSheet(); };

      huntersShowModal('Filters', () => {
        const box = el('div', { class: 'grid gap-4' });

        box.append(
          el('div', { class: 'text-sm font-extrabold text-yellow-400/90' }, 'Rarity'),
          makeRarityRow(rebuild),

          el('div', { class: 'text-sm font-extrabold text-yellow-400/90 mt-2' }, 'Element'),
          makeElementRow(rebuild),

          el('div', { class: 'text-sm font-extrabold text-yellow-400/90 mt-2' }, 'Role'),
          makeRoleRow(rebuild),

          el('div', { class: 'flex gap-2 justify-end mt-2' },
            el('button', {
              type: 'button',
              class: 'reset-btn',
              title: 'Reset filters',
              onClick: () => { resetFilters(); rebuild(); }
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
      const page = document.querySelector('[data-sla-page="hunters"]');
      if (!page) return;
      let back = page.querySelector('.hunters-filter-backdrop');
      if (!back) {
        back = el('div', { class: 'hunters-filter-backdrop' });
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
      const modalSearch = el('input', {
        type: 'text',
        value: STATE.filters.name,
        placeholder: 'Search hunter...',
        class: 'hunters-filter-search'
      });
      modalSearch.addEventListener('input', () => {
        STATE.filters.name = modalSearch.value || '';
        render();
        openMobileFiltersSheet();
      });

      back.innerHTML = '';
      const modal = el('div', { class: 'hunters-filter-modal' });
      const bd = el('div', { class: 'hunters-filter-bd' },
        modalSearch,
        el('div', { class: 'text-sm font-extrabold text-yellow-400/90' }, 'Rarity'),
        el('div', { class: 'hunters-filter-icons' }, makeRarityRow(rebuild)),
        el('div', { class: 'text-sm font-extrabold text-yellow-400/90' }, 'Element'),
        el('div', { class: 'hunters-filter-icons' }, makeElementRow(rebuild)),
        el('div', { class: 'text-sm font-extrabold text-yellow-400/90' }, 'Role'),
        el('div', { class: 'hunters-filter-icons' }, makeRoleRow(rebuild))
      );
      const resetModal = el('button', { type: 'button', class: 'reset-btn', title: 'Reset filters' }, el('span', { class: 'reset-x' }, 'x'), 'Reset');
      resetModal.addEventListener('click', () => { resetFilters(); render(); openMobileFiltersSheet(); });
      const close = el('button', { type: 'button', class: 'admin-btn' }, 'Close');
      const apply = el('button', { type: 'button', class: 'admin-btn primary' }, 'Apply');
      close.addEventListener('click', closeModal);
      apply.addEventListener('click', closeModal);
      modal.append(
        el('div', { class: 'hunters-filter-hd' }, 'Filters'),
        bd,
        el('div', { class: 'hunters-filter-ft' }, resetModal, close, apply)
      );
      back.append(modal);
      back.style.display = 'flex';
      requestAnimationFrame(() => {
        const input = back.querySelector('.hunters-filter-search');
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
      const g3 = el('div', { class: 'filter-group' }, makeRoleRow(() => render()));

      right.append(reset);
      bar.append(search, g1, g2, g3, right);
    }

    const mobileBtnFilters = el('button', { type: 'button', class: 'filters-btn' }, 'Filters');
    mobileBtnFilters.addEventListener('click', openMobileFiltersSheet);
    root.append(mobileBtnFilters);
    root.append(bar);

  }

  // --------------------------
  // Bulk row
  // --------------------------
  function renderBulkRow() {
    const bulk = el('div', { class: 'hunters-ml-row bulk' });

    const imgWrap = el('div', { class: 'ml-img col-img' },
      el('div', { class: 'ml-all' }, 'ALL')
    );

    const name = el('div', { class: 'ml-name col-name', title: 'Bulk edit for all filtered hunters' }, 'Edit all');

    const advMid = el('div', { class: 'ml-adv-mid' }, '');
    function refreshAdvMid() {
      const d = advToDisplay(STATE.bulk.adv);
      advMid.textContent = d.text;
      advMid.className = `ml-adv-mid ${d.type === 'dontown' ? 'ml-adv-dontown' : ''}`;
    }
    refreshAdvMid();

    const btnMinus = el('button', { class: 'ml-adv-btn', type: 'button' }, '−');
    const btnPlus = el('button', { class: 'ml-adv-btn', type: 'button' }, '+');

    const advCell = el('div', { class: 'ml-center col-adv' },
      el('div', { class: 'ml-adv-wrap' }, btnMinus, advMid, btnPlus)
    );

    function applyToAll(patch, allowDontOwn = false) {
      const list = filteredHunters().map(x => x.name).filter(Boolean);
      if (!list.length) return;

      for (const n of list) {
        const cur = getMyEntry(n);
        const owned = cur.adv >= 1;

        if (!allowDontOwn && (patch.growth != null || patch.lvl != null) && !owned) continue;
        setMyEntry(n, patch);
      }
    }

    btnMinus.addEventListener('click', () => {
      STATE.bulk.adv = clampInt(STATE.bulk.adv - 1, 0, ADV_MAX);
      refreshAdvMid();
      applyToAll({ adv: STATE.bulk.adv }, true);
      render();
    });

    btnPlus.addEventListener('click', () => {
      STATE.bulk.adv = clampInt(STATE.bulk.adv + 1, 0, ADV_MAX);
      refreshAdvMid();
      applyToAll({ adv: STATE.bulk.adv }, true);
      render();
    });

    const preview = el('img', {
      class: 'ml-growth-img',
      src: cdnySafe(growthImgFor(STATE.bulk.growth), 128),
      alt: `Growth ${STATE.bulk.growth}`,
      loading: 'lazy',
      decoding: 'async'
    });

    const sel = el('select', { class: 'ml-growth-select' });
    sel.append(el('option', { value: '0' }, "Don't own"));
    for (let i = 1; i <= (STATE.cfg.growthMax ?? 15); i++) sel.append(el('option', { value: String(i) }, String(i)));
    sel.value = String(STATE.bulk.growth);

    function setPreviewWithPreload(nextVal) {
      const nextSrc = cdnySafe(growthImgFor(nextVal), 128);
      const imgPre = new Image();
      imgPre.onload = () => { preview.src = nextSrc; };
      imgPre.onerror = () => { preview.src = nextSrc; };
      imgPre.src = nextSrc;
    }

    sel.addEventListener('change', () => {
      const v = clampInt(sel.value, 0, STATE.cfg.growthMax ?? 15);
      STATE.bulk.growth = v;
      setPreviewWithPreload(v);
      applyToAll({ growth: v }, false);
      render();
    });

    const growthCell = el('div', { class: 'ml-center col-growth', style: 'gap:12px;' },
      el('div', { style: 'display:flex;align-items:center;justify-content:center;gap:12px;width:100%;' }, preview, sel)
    );

    const lvInput = el('input', {
      type: 'number',
      class: 'ml-lv-input',
      min: '1',
      max: String(STATE.cfg.levelMax ?? 130),
      value: String(STATE.bulk.lvl)
    });

    lvInput.addEventListener('input', () => {
      const v = clampInt(lvInput.value, 1, STATE.cfg.levelMax ?? 130);
      STATE.bulk.lvl = v;

      applyToAll({ lvl: v }, false);

      const list = filteredHunters().map(x => x.name).filter(Boolean);
      for (const name of list) {
        const cur = getMyEntry(name);
        if (cur.adv <= 0) continue;
        const node = document.querySelector(`.ml-lv-input[data-lv-for="${CSS.escape(name)}"]`);
        if (node) node.value = String(v);
      }
    });

    const lvCell = el('div', { class: 'ml-center col-lv' },
      el('div', { style: 'display:flex;align-items:center;justify-content:center;width:100%;' }, lvInput)
    );

    const emptyRarity = el('div', { class: 'ml-center ml-lv-text col-rarity', style: 'opacity:.55' }, '—');
    const emptyRole = el('div', { class: 'ml-center ml-lv-text col-role', style: 'opacity:.55' }, '—');
    const emptyElem = el('div', { class: 'ml-center ml-lv-text col-elem', style: 'opacity:.55' }, '—');

    bulk.append(imgWrap, name, advCell, growthCell, lvCell, emptyRole, emptyElem, emptyRarity);
    return bulk;
  }

  // --------------------------
  // Builds tab
  // --------------------------
  function buildsRarityClass(rarity) {
    const r = String(rarity || 'SSR').toUpperCase();
    if (r === 'SSR') return 'rar-SSR';
    if (r === 'SR') return 'rar-SR';
    if (r === 'R') return 'rar-R';
    return 'rar-SSR';
  }

  function rarityCardIconSrc(rarity) {
    const r = String(rarity || 'SSR').toUpperCase();
    return ICONS.rarity[r] || ICONS.rarity.SSR || '';
  }

  function getWeaponByName(name) {
    const target = normKey(name);
    return (STATE.data.weapons || []).find((w) => normKey(w?.name || '') === target) || null;
  }

  function getWeaponMaxAdv(w) {
    const mg = (w && (w.maxGrowth ?? w.max_growth ?? w.maxAdvancement ?? w.max_advancement));
    const n = clampInt(mg ?? ADV_MAX, 0, ADV_MAX);
    return n <= 0 ? ADV_MAX : n;
  }

  async function loadHunterWeaponsDropdowns() {
    try {
      const r = await fetch(url('/api/public/hunter-weapons-dropdowns'), { cache: 'no-store' });
      if (!r.ok) return { levelMax: 100 };

      const j = await r.json().catch(() => ({}));
      return { levelMax: clampInt(j?.levelMax ?? 100, 1, 999) };
    } catch {
      return { levelMax: 100 };
    }
  }


  function openQuickModal(h) {
    huntersShowModal(h.name || 'Hunter', () => {
      const wrap = el('div', { class: 'grid gap-3' });

      const top = el('div', { class: 'flex items-center gap-3' });
      const img = (h.image_build || h.image)
        ? el('img', {
          src: hunterCardImgSrc(h, 256),
          class: 'w-28 h-28 rounded-2xl object-cover bg-slate-800',
          loading: 'lazy',
          decoding: 'async',
          alt: h.name || ''
        })
        : el('div', { class: 'w-28 h-28 rounded-2xl bg-slate-800 grid place-items-center text-3xl' }, '🗡️');

      top.append(img);

      const info = el('div', { class: 'grid gap-1' },
        el('div', { class: 'text-lg font-extrabold' }, h.name || ''),
        el('div', { class: 'text-sm opacity-80' }, `${h.role || '-'} • ${h.element || 'None'} • ${String(h.rarity || 'SSR').toUpperCase()}`)
      );
      top.append(info);

      wrap.append(top);
      wrap.append(el('div', { class: 'text-sm text-slate-400' }, 'Builds tab is preview only.'));
      return wrap;
    });
  }

  function slugifyHunterName(name) {
    return String(name || '')
      .trim()
      .replace(/'/g, '')
      .replace(/\s+/g, '_')
      .replace(/[^\w-]/g, '_')
      .replace(/_+/g, '_');
  }

  function getHunterDetailsTarget(h) {
    const slug = slugifyHunterName(h?.name || '');
    if (!slug) return '';
    return url(`/hunters/${encodeURIComponent(slug)}`);
  }

  function openHunterDetails(h, opt = {}) {
    const target = getHunterDetailsTarget(h);
    if (!target) return;

    if (opt?.newTab) {
      try { window.open(target, '_blank', 'noopener'); } catch (_) {}
      return;
    }

    if (typeof window.routeTo === 'function') {
      window.routeTo(target);
      return;
    }

    window.location.href = target;
  }

  function handleHunterDetailsPointerOpen(ev, h) {
    if (!h) return;

    if (ev?.button === 1 || ev?.ctrlKey || ev?.metaKey) {
      ev.preventDefault?.();
      openHunterDetails(h, { newTab: true });
      return;
    }

    if (ev?.button === 0) openHunterDetails(h);
  }
  
  function renderBuilds(root) {
    const data = filteredHunters();
    if (!data.length) {
      root.append(el('div', { class: 'p-6 text-center text-white' }, 'No results.'));
      return;
    }

    const grid = el('div', { class: 'builds-grid' });

    for (const h of data) {
      const elemKey = normElement(h.element);
      const badgeElem = ICONS.element[elemKey] || '';
      const badgeRole = ICONS.role[h.role] || '';

      const rarityClass = buildsRarityClass(h.rarity);

      const wrap = el('a', {
        href: getHunterDetailsTarget(h),
        class: `builds-card avatar solo ${rarityClass}`,
        title: h.name,
        'aria-label': h.name
      });

      const badges = el('div', { class: 'card-badges' });
      if (badgeElem) badges.append(el('img', { class: 'badge element', src: cdnySafe(badgeElem, 64), alt: h.element || '', loading: 'lazy', decoding: 'async' }));
      if (badgeRole) badges.append(el('img', { class: 'badge role', src: cdnySafe(badgeRole, 64), alt: h.role || '', loading: 'lazy', decoding: 'async' }));

      const portrait = el('img', {
        class: 'portrait',
        loading: 'lazy',
        decoding: 'async',
        src: hunterCardImgSrc(h, 420),
        alt: h.name
      });

      wrap.append(portrait, badges, el('div', { class: 'name' }, h.name));
      wrap.addEventListener('click', (ev) => {
        if (ev.ctrlKey || ev.metaKey || ev.button === 1) return;
        ev.preventDefault();
        openHunterDetails(h);
      });
      grid.append(wrap);
    }

    root.append(grid);
  }

  // --------------------------
  // Bulk card
  // --------------------------
  function renderBulkCard() {
    const card = el('div', { class: 'hunter-progress-card hunter-progress-bulk-card' });

    const header = el('div', { class: 'hunter-progress-head' });
    const imgWrap = el('div', { class: 'hunter-progress-avatar' },
      el('div', { class: 'ml-all hunter-progress-all-badge' }, 'EDIT\nALL')
    );

    const meta = el('div', { class: 'hunter-progress-meta' },
      el('div', { class: 'hunter-progress-name', title: 'Bulk edit for all filtered hunters' }, 'Edit all'),
      el('div', { class: 'hunter-progress-bulk-sub' }, 'After exiting edit mode, applies changes to all visible hunters and weapons if modifications were made')
    );
    header.append(imgWrap, meta);
    card.append(header);

    function applyToAllHunters(patch, allowDontOwn = false) {
      const list = filteredHunters().map(x => x.name).filter(Boolean);
      if (!list.length) return;
      for (const n of list) {
        const cur = getMyEntry(n);
        const owned = cur.adv >= 1;
        if (!allowDontOwn && (patch.growth != null || patch.lvl != null) && !owned) continue;
        setMyEntry(n, patch);
      }
    }

    function applyToAllWeapons(patch, allowDontOwn = false) {
      const list = filteredHunters();
      for (const h of list) {
        const weapons = getWeaponsForHunter(h.name);
        if (!weapons.length) continue;
        const weapon = weapons[0];
        const cur = getMyWeaponEntry(weapon.name);
        const owned = cur.adv >= 1;
        if (!allowDontOwn && patch.lvl != null && !owned) continue;
        const next = { ...patch };
        if (patch.adv != null) next.adv = clampInt(patch.adv, 0, getWeaponMaxAdv(weapon));
        if (next.adv != null || next.lvl != null) setMyWeaponEntry(weapon.name, next);
      }
    }

    const stats = el('div', { class: 'hunter-progress-stats' });

    const advSelect = makeAdvancementSelect(STATE.bulk.adv, ADV_MAX, (nextAdv) => {
      STATE.bulk.adv = nextAdv;
      applyToAllHunters({ adv: nextAdv }, true);
      render();
    });

    const advBlock = el('div', { class: 'hunter-progress-stat hunter-progress-stat-full' },
      el('div', { class: 'hunter-progress-stat-label' }, 'Advancement'),
      el('div', { class: 'hunter-progress-stat-value' }, advSelect)
    );

    const upgradeSelect = makeImageNumberSelect({
      value: STATE.bulk.growth,
      max: (STATE.cfg.growthMax ?? 15),
      imgFor: growthImgFor,
      onChange: (v) => {
        STATE.bulk.growth = v;
        applyToAllHunters({ growth: v }, false);
        render();
      }
    });

    const upgradeBlock = el('div', { class: 'hunter-progress-stat' },
      el('div', { class: 'hunter-progress-stat-label' }, 'Upgrade'),
      el('div', { class: 'hunter-progress-stat-value grow' }, upgradeSelect)
    );

    const lvInput = el('input', {
      type: 'number',
      class: 'ml-lv-input hunter-progress-level-input',
      min: '1',
      max: String(STATE.cfg.levelMax ?? 130),
      value: String(STATE.bulk.lvl)
    });
    lvInput.addEventListener('input', () => {
      const v = clampInt(lvInput.value, 1, STATE.cfg.levelMax ?? 130);
      STATE.bulk.lvl = v;
      applyToAllHunters({ lvl: v }, false);
    });

    const lvBlock = el('div', { class: 'hunter-progress-stat' },
      el('div', { class: 'hunter-progress-stat-label' }, 'Lv.'),
      el('div', { class: 'hunter-progress-stat-value' }, lvInput)
    );

    const wAdvSelect = makeAdvancementSelect(STATE.bulk.weaponAdv, ADV_MAX, (nextAdv) => {
      STATE.bulk.weaponAdv = nextAdv;
      applyToAllWeapons({ adv: nextAdv }, true);
      render();
    });

    const wAdvBlock = el('div', { class: 'hunter-progress-stat' },
      el('div', { class: 'hunter-progress-stat-label' }, 'Weapon Adv.'),
      el('div', { class: 'hunter-progress-stat-value' }, wAdvSelect)
    );

    const wLvInput = el('input', {
      type: 'number',
      class: 'ml-lv-input hunter-progress-level-input',
      min: '1',
      max: String(STATE.weaponCfg.levelMax ?? 100),
      value: String(STATE.bulk.weaponLvl)
    });
    wLvInput.addEventListener('input', () => {
      const v = clampInt(wLvInput.value, 1, STATE.weaponCfg.levelMax ?? 100);
      STATE.bulk.weaponLvl = v;
      applyToAllWeapons({ lvl: v }, false);
    });

    const wLvBlock = el('div', { class: 'hunter-progress-stat' },
      el('div', { class: 'hunter-progress-stat-label' }, 'Weapon Lv.'),
      el('div', { class: 'hunter-progress-stat-value' }, wLvInput)
    );

    stats.append(advBlock, upgradeBlock, lvBlock, wAdvBlock, wLvBlock);
    card.append(stats);
    return card;
  }

  // --------------------------
  // My list tab
  // --------------------------
  function renderMyList(root) {
    if ((STATE.collection.loading && !STATE.collection.loaded) || (STATE.weaponCollection.loading && !STATE.weaponCollection.loaded)) {
      root.append(el('div', { class: 'p-6 text-center text-white' }, 'Loading…'));
      return;
    }

    const data = filteredHunters();
    if (!data.length) {
      root.append(el('div', { class: 'p-6 text-center text-white' }, 'No results.'));
      return;
    }

    const wrap = el('div', { class: 'hunters-cards-grid' });

    if (STATE.ui.editMode && STATE.session.loggedIn) {
      wrap.append(renderBulkCard());
    }

    for (const h of data) {
      const entry = getMyEntry(h.name);
      const owned = entry.adv >= 1;
      const rar = String(h.rarity || 'SSR').toUpperCase();
      const rarityClass = buildsRarityClass(rar);
      const elemKey = normElement(h.element);
      const elemIcon = ICONS.element[elemKey] || ICONS.element.none;
      const roleIcon = ICONS.role[h.role] || '';

      const card = el('div', { class: `hunter-progress-card ${rarityClass}` });

      const header = el('div', { class: 'hunter-progress-head' });
      const img = (h.image || h.image_build)
        ? el('img', { src: hunterIconImgSrc(h, 160), loading: 'lazy', decoding: 'async', alt: h.name })
        : null;
      const imgWrap = el('div', { class: 'hunter-progress-avatar' }, img || el('div', { style: 'font-size:22px' }, '🗡️'));

      const meta = el('div', { class: 'hunter-progress-meta' },
        el('div', { class: 'hunter-progress-name', title: h.name }, h.name),
        el('div', { class: 'hunter-progress-badges' },
          el('span', { class: 'hunter-progress-badge rarity-icon' },
            el('img', { src: cdnySafe(rarityCardIconSrc(rar), 48), alt: rar, loading: 'lazy', decoding: 'async' })
          ),
          el('span', { class: 'hunter-progress-badge icon' },
            el('img', { src: cdnySafe(elemIcon, 48), alt: h.element || 'Element', loading: 'lazy', decoding: 'async' })
          ),
          roleIcon
            ? el('span', { class: 'hunter-progress-badge icon' },
                el('img', { src: cdnySafe(roleIcon, 48), alt: h.role || 'Role', loading: 'lazy', decoding: 'async' })
              )
            : null
        )
      );
      header.append(imgWrap, meta);
      card.append(header);

      const stats = el('div', { class: 'hunter-progress-stats' });

      let advValue;
      if (!STATE.ui.editMode) {
        const d = advToDisplay(entry.adv);
        advValue = el('div', { class: `hunter-progress-stat-value ${d.type === 'dontown' ? 'dontown' : ''}` }, d.text);
      } else {
        advValue = makeAdvancementSelect(entry.adv, ADV_MAX, (nextAdv) => {
          setMyEntry(h.name, { adv: nextAdv });
          render();
        });
      }

      const advBlock = el('div', { class: 'hunter-progress-stat hunter-progress-stat-full' },
        el('div', { class: 'hunter-progress-stat-label' }, 'Advancement'),
        advValue
      );

      let growthValue;
      if (!STATE.ui.editMode) {
        const g = owned ? entry.growth : 0;
        growthValue = el('img', { class: 'hunter-progress-growth-img', src: cdnySafe(growthImgFor(g), 128), alt: `Upgrade ${g}`, loading: 'lazy', decoding: 'async' });
      } else {
        const curGrowth = owned ? entry.growth : 0;
        growthValue = makeImageNumberSelect({
          value: curGrowth,
          max: (STATE.cfg.growthMax ?? 15),
          imgFor: growthImgFor,
          disabled: !owned,
          onChange: (v) => {
            const cur = getMyEntry(h.name);
            if (cur.adv <= 0) return;
            setMyEntry(h.name, { growth: v });
          }
        });
      }

      let lvValue;
      if (!STATE.ui.editMode) {
        lvValue = el('div', { class: 'hunter-progress-level-chip' }, String(owned ? entry.lvl : 0));
      } else {
        const input = el('input', {
          type: 'number',
          class: 'ml-lv-input hunter-progress-level-input',
          min: '0',
          max: String(STATE.cfg.levelMax ?? 130),
          value: String(owned ? entry.lvl : 0),
          disabled: !owned,
          'data-lv-for': h.name
        });
        input.addEventListener('input', () => {
          const cur = getMyEntry(h.name);
          if (cur.adv <= 0) return;
          const v = clampInt(input.value, 1, STATE.cfg.levelMax ?? 130);
          setMyEntry(h.name, { lvl: v });
        });
        lvValue = input;
      }

      const growthBlock = el('div', { class: 'hunter-progress-stat' },
        el('div', { class: 'hunter-progress-stat-label' }, 'Upgrade'),
        el('div', { class: 'hunter-progress-stat-value grow' }, growthValue)
      );
      const lvBlock = el('div', { class: 'hunter-progress-stat' },
        el('div', { class: 'hunter-progress-stat-label' }, 'Lv.'),
        el('div', { class: 'hunter-progress-stat-value' }, lvValue)
      );

      stats.append(advBlock, growthBlock, lvBlock);
      card.append(stats);

      const weapons = getWeaponsForHunter(h.name);
      if (weapons.length) {
        const weapon = weapons[0];
        const wEntry = getMyWeaponEntry(weapon.name);
        const wOwned = wEntry.adv >= 1;
        const wRar = String(weapon.rarity || 'SSR').toUpperCase();
        const wElemKey = normElement(weapon.element);
        const wElemIcon = ICONS.element[wElemKey] || ICONS.element.none;
        const weaponImgSrc = resolveWeaponImgSrc(weapon);

        const weaponCard = el('div', { class: 'hunter-progress-weapon-card' });
        const weaponHead = el('div', { class: 'hunter-progress-weapon-head' },
          el('div', { class: 'hunter-progress-weapon-thumb' },
            weaponImgSrc
              ? el('img', { src: weaponImgSrc, loading: 'lazy', decoding: 'async', alt: weapon.name })
              : el('div', { style: 'font-size:20px' }, '🗡️')
          ),
          el('div', { class: 'hunter-progress-weapon-meta' },
            el('div', { class: 'hunter-progress-weapon-name', title: weapon.name }, weapon.name),
            el('div', { class: 'hunter-progress-badges' },
              el('span', { class: 'hunter-progress-badge rarity-icon' },
                el('img', { src: cdnySafe(rarityCardIconSrc(wRar), 48), alt: wRar, loading: 'lazy', decoding: 'async' })
              ),
              el('span', { class: 'hunter-progress-badge icon' },
                el('img', { src: cdnySafe(wElemIcon, 48), alt: weapon.element || 'Element', loading: 'lazy', decoding: 'async' })
              )
            )
          )
        );

        let wAdvValue;
        if (!STATE.ui.editMode) {
          const d = advToDisplay(wEntry.adv);
          wAdvValue = el('div', { class: `hunter-progress-stat-value ${d.type === 'dontown' ? 'dontown' : ''}` }, d.text);
        } else {
          const wMaxAdv = getWeaponMaxAdv(weapon);
          wAdvValue = makeAdvancementSelect(wEntry.adv, wMaxAdv, (nextAdv) => {
            setMyWeaponEntry(weapon.name, { adv: nextAdv });
            render();
          });
        }

        let wLvValue;
        if (!STATE.ui.editMode) {
          wLvValue = el('div', { class: 'hunter-progress-level-chip weapon' }, String(wOwned ? wEntry.lvl : 0));
        } else {
          const input = el('input', {
            type: 'number',
            class: 'ml-lv-input hunter-progress-level-input',
            min: '0',
            max: String(STATE.weaponCfg.levelMax ?? 100),
            value: String(wOwned ? wEntry.lvl : 0),
            disabled: !wOwned
          });
          input.addEventListener('input', () => {
            const cur = getMyWeaponEntry(weapon.name);
            if (cur.adv <= 0) return;
            const v = clampInt(input.value, 1, STATE.weaponCfg.levelMax ?? 100);
            setMyWeaponEntry(weapon.name, { lvl: v });
          });
          wLvValue = input;
        }

        const weaponStats = el('div', { class: 'hunter-progress-weapon-stats' },
          el('div', { class: 'hunter-progress-stat' },
            el('div', { class: 'hunter-progress-stat-label' }, 'Advancement'),
            wAdvValue
          ),
          el('div', { class: 'hunter-progress-stat' },
            el('div', { class: 'hunter-progress-stat-label' }, 'Lv.'),
            el('div', { class: 'hunter-progress-stat-value' }, wLvValue)
          )
        );

        weaponCard.append(weaponHead, weaponStats);
        card.append(weaponCard);
      }

      wrap.append(card);
    }

    root.append(wrap);
  }

  // --------------------------
  // Admin tab (unchanged)
  // --------------------------
  function mkSelect(options, value, extraClass = '') {
    const s = el('select', { class: `admin-in ${extraClass}` });
    for (const opt of options) s.append(el('option', { value: opt }, opt));
    s.value = value;
    return s;
  }

  function renderAdmin(root) {
    if (!isAdminUser()) {
      root.append(el('div', { class: 'p-6 text-center text-white' }, 'Admin only.'));
      return;
    }

    const card = el('div', { class: 'bg-slate-900 rounded-2xl border border-slate-700 p-4 shadow-sm' });


    function ensureOrder() {
      const cur = (STATE.globalOrder && STATE.globalOrder.length) ? [...STATE.globalOrder] : [];
      const names = (STATE.data.hunters || []).map(h => h.name).filter(Boolean);
      const set = new Set(cur);
      for (const n of names) if (!set.has(n)) cur.push(n);
      return cur;
    }

    async function commitOrder(nextOrder) {
      try {
        await saveGlobalHuntersOrder(nextOrder);
        STATE.globalOrder = nextOrder;
        STATE.data.hunters = applyOrderToHunters(STATE.data.hunters, nextOrder);
        toast('Order saved ✅');
        render();
      } catch (err) {
        toast(`Order save failed: ${err?.message || err}`);
      }
    }

    const cfgBox = el('div', { class: 'admin-card admin-grid', style: 'background:rgba(15,23,42,.18); margin-bottom:12px;' });
    cfgBox.append(el('div', { class: 'admin-title', style: 'font-size:16px;color:#e2e8f0' }, 'Hunters Settings'));

    const inLevelMax = el('input', {
      class: 'admin-in',
      type: 'number',
      min: '1',
      max: '999',
      value: String(STATE.cfg.levelMax ?? 130),
      placeholder: 'Max Lv'
    });

    const inGrowthMax = el('input', {
      class: 'admin-in',
      type: 'number',
      min: '1',
      max: '99',
      value: String(STATE.cfg.growthMax ?? 15),
      placeholder: 'Max Growth'
    });

    const btnLoadCfg = el('button', { class: 'admin-btn', type: 'button' }, 'Reload settings');
    btnLoadCfg.addEventListener('click', async () => {
      STATE.cfg = await loadHuntersDropdowns();
    STATE.weaponCfg = await loadHunterWeaponsDropdowns();
      inLevelMax.value = String(STATE.cfg.levelMax ?? 130);
      inGrowthMax.value = String(STATE.cfg.growthMax ?? 15);
      toast('Settings reloaded ✅');
      render();
    });

    const btnSaveCfg = el('button', { class: 'admin-btn primary', type: 'button' }, 'Save settings');
    btnSaveCfg.addEventListener('click', async () => {
      const levelMax = clampInt(inLevelMax.value, 1, 999);
      const growthMax = clampInt(inGrowthMax.value, 1, 99);

      const growthImages = { ...(STATE.cfg.growthImages || {}) };

      const out = await fetchJson(url('/api/admin/hunters-dropdowns'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ config: { levelMax, growthMax, growthImages } })
      });

      if (!out.ok) {
        toast(out?.data?.error || 'Save failed');
        return;
      }

      toast('Saved ✅');
      STATE.cfg = await loadHuntersDropdowns();
    STATE.weaponCfg = await loadHunterWeaponsDropdowns();
      render();
    });

    const btnGrowthImages = el('button', { class: 'admin-btn', type: 'button' }, 'Edit Growth Images');
    btnGrowthImages.addEventListener('click', () => {
      const currentMax = clampInt(inGrowthMax.value, 1, 99);
      openGrowthImagesModal(currentMax);
    });

    cfgBox.append(
      el('div', { class: 'admin-row' },
        el('div', { class: 'admin-sub', style: 'min-width:120px' }, 'Max Lv'),
        inLevelMax,
        el('div', { class: 'admin-sub', style: 'min-width:120px' }, 'Max Growth'),
        inGrowthMax,
        btnGrowthImages,
        btnLoadCfg,
        btnSaveCfg
      )
    );

    const header = el('div', { class: 'flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4' },
      el('div', {},
        el('div', { class: 'text-lg font-extrabold text-yellow-400' }, 'Hunters — Admin'),
        el('div', { class: 'text-sm text-slate-300/90' }, 'Add / edit hunters, global order, max level & growth images.')
      )
    );

    const headerActions = el('div', { class: 'flex flex-wrap items-center gap-2' });
    header.append(headerActions);

    function openGrowthImagesModal(gMax) {
      const linksWrap = el('div', { class: 'admin-grid' });

      const map = { ...(STATE.cfg.growthImages || {}) };
      for (let i = 0; i <= gMax; i++) {
        const row = el('div', { class: 'admin-row' });
        const lbl = el('div', { class: 'admin-sub', style: 'min-width:90px' }, `Growth ${i}`);

        const currentRaw = String(map[i] || map[String(i)] || GROWTH_IMG[i] || '');
        const currentRel = normalizeLocalPicRel(currentRaw, 'Growth').replace(/^Growth\//, '');
        const input = mkPictureSelectByCategory('Growth', currentRel, 'h-10');

        row.__idx = i;
        row.__in = input;
        row.append(lbl, input);
        linksWrap.append(row);
      }

      const body = el('div', { class: 'admin-grid' },
        el('div', { class: 'admin-sub' }, `Growth images (local /picture/Growth/*) (0..${gMax})`),
        linksWrap
      );

      const doSave = async () => {
        const levelMax = clampInt(inLevelMax.value, 1, 999);
        const growthMax = clampInt(inGrowthMax.value, 1, 99);

        const growthImages = {};
        for (const node of Array.from(linksWrap.children || [])) {
          const idx = node.__idx;
          const val = normalizeLocalPicRel((node.__in?.value || '').trim(), 'Growth');
          if (val) growthImages[idx] = val;
        }

        const out = await fetchJson(url('/api/admin/hunters-dropdowns'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ config: { levelMax, growthMax, growthImages } })
        });

        if (!out.ok) {
          toast(out?.data?.error || 'Save failed');
          return;
        }

        toast('Saved ✅');
        STATE.cfg = await loadHuntersDropdowns();
    STATE.weaponCfg = await loadHunterWeaponsDropdowns();
        huntersHideModal();
        render();
      };

      huntersShowModal('Edit Growth Images', () => body, doSave, 'SAVE');
    }

    const addBox = el('div', { class: 'grid gap-2 p-3 rounded-2xl border border-slate-700 bg-[rgb(24_34_52)] mb-4' });
    addBox.append(el('div', { class: 'font-extrabold text-slate-100' }, 'Add new hunter'));

    const inName = el('input', { class: 'admin-in', placeholder: 'Name (unique)', style: 'flex:1 1 40px; min-width:240px; max-width:420px' });
    const inImg1 = mkPictureSelectByCategory('Hunter_Icon', '', 'h-10');
    const inImg2 = mkPictureSelectByCategory('Hunter', '', 'h-10');

    const selRarity = mkSelect(['SSR', 'SR', 'R'], 'SSR');
    const selElement = mkSelect(['Fire', 'Water', 'Wind', 'Light', 'Dark'], 'Fire');
    const selRole = mkSelect(['Striker', 'Breaker', 'Supporter', 'Elemental Stacker', 'Buster'], 'Striker');

    const btnAdd = el('button', { class: 'h-10 px-3 rounded-xl border border-slate-700 bg-slate-800 text-white hover:bg-slate-700 font-extrabold', type: 'button' }, 'Add');

    btnAdd.addEventListener('click', async () => {
      const name = (inName.value || '').trim();
      const image = normalizeLocalPicRel((inImg1.value || '').trim(), 'Hunter_Icon');
      const image_build = normalizeLocalPicRel((inImg2.value || '').trim(), 'Hunter');
      const rarity = String(selRarity.value || 'SSR').toUpperCase();
      const element = String(selElement.value || 'None');
      const role = String(selRole.value || '').trim();

      if (!name || !image || !role) {
        toast('Name + Image + Role required');
        return;
      }

      const out = await fetchJson(url('/api/admin/hunters'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'add', item: { name, image, image_build, rarity, element, role } })
      });

      if (!out.ok) {
        toast(out?.data?.error || 'Add failed');
        return;
      }

      inName.value = '';
      inImg1.value = '';
      inImg2.value = '';
      selRarity.value = 'SSR';
      selElement.value = 'Fire';
      selRole.value = 'Striker';

      toast('Added ✅');
      await loadHunters();
      render();
    });

    addBox.append(el('div', { class: 'hunter-admin-add-row flex flex-wrap gap-2' }, inName, inImg1, inImg2, selRarity, selElement, selRole, btnAdd));
    card.append(header, addBox);

    const listBox = el('div', { class: 'grid gap-2' });
    listBox.append(el('div', { class: 'font-extrabold text-white mb-1' }, 'Hunters list'));

    const btnExact = el('button', { class: 'h-9 px-3 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-sm font-semibold text-slate-100', type: 'button' }, 'Set exact order');
    btnExact.addEventListener('click', () => openExactOrderModal());

    const btnAutoMatchMissing = el('button', {
      class: 'h-9 px-3 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-sm font-semibold text-slate-100',
      type: 'button',
      title: 'Auto-match local Hunter/Hunter_Icon images by hunter name'
    }, 'Auto match missing images');

    btnAutoMatchMissing.addEventListener('click', async () => {
      const oldText = btnAutoMatchMissing.textContent;
      btnAutoMatchMissing.disabled = true;
      btnAutoMatchMissing.textContent = 'Matching...';
      try {
        const res = await autoMatchHunterImagesBatch();
        toast(`Auto match ✅ Updated ${res.updated} (matched ${res.matched}, checked ${res.checked}, failed ${res.failed})`);
        await loadHunters();
        render();
      } catch (e) {
        console.error('autoMatchHunterImagesBatch failed:', e);
        toast('Auto match failed');
      } finally {
        btnAutoMatchMissing.disabled = false;
        btnAutoMatchMissing.textContent = oldText;
      }
    });

    headerActions.append(btnExact, btnAutoMatchMissing);

    function openEditHunterModal(h) {
      const inN = el('input', { class: 'admin-in', value: h.name || '' });
      const inI1 = mkPictureSelectByCategory('Hunter_Icon', normalizeLocalPicRel(h.image || '', 'Hunter_Icon').replace(/^Hunter_Icon\//, ''), 'h-10');
      const inI2 = mkPictureSelectByCategory('Hunter', normalizeLocalPicRel(h.image_build || h.image || '', 'Hunter').replace(/^Hunter\//, ''), 'h-10');

      const rSel = mkSelect(['SSR', 'SR', 'R'], String(h.rarity || 'SSR').toUpperCase());
      const eSel = mkSelect(['Fire', 'Water', 'Wind', 'Light', 'Dark'], String(h.element || 'Fire'));
      const roSel = mkSelect(['Striker', 'Breaker', 'Supporter', 'Elemental Stacker', 'Buster'], String(h.role || 'Striker'));

      const body = el('div', { class: 'admin-grid' },
        el('div', { class: 'admin-sub' }, 'Edit hunter (Role required):'),
        el('div', { class: 'admin-grid' },
          el('div', { class: 'admin-sub' }, 'Name'), inN,
          el('div', { class: 'admin-sub' }, 'Image (local • Hunter_Icon)'), inI1,
          el('div', { class: 'admin-sub' }, 'Build Image (local • Hunter)'), inI2,
          el('div', { class: 'admin-row' }, rSel, eSel, roSel)
        )
      );

      const doSave = async () => {
        const name = (inN.value || '').trim();
        const image = normalizeLocalPicRel((inI1.value || '').trim(), 'Hunter_Icon');
        const image_build = normalizeLocalPicRel((inI2.value || '').trim(), 'Hunter');
        const rarity = String(rSel.value || 'SSR').toUpperCase();
        const element = String(eSel.value || 'None');
        const role = String(roSel.value || '').trim();

        if (!name || !role) {
          toast('Name + Role required');
          return;
        }

        const out = await fetchJson(url('/api/admin/hunters'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ action: 'update', originalName: h.name, item: { name, image, image_build, rarity, element, role } })
        });

        if (!out.ok) {
          toast(out?.data?.error || 'Save failed');
          return;
        }

        toast('Saved ✅');
        await loadHunters();
        render();
        huntersHideModal();
      };

      huntersShowModal(`Edit: ${h.name}`, () => body, doSave, 'SAVE');
    }

    async function deleteHunter(h) {
      const out = await fetchJson(url('/api/admin/hunters'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'remove', name: h.name })
      });

      if (!out.ok) {
        toast(out?.data?.error || 'Delete failed');
        return;
      }

      toast('Deleted ✅');
      await loadHunters();
      render();
    }

    function adminRow(h) {
      const row = el('div', { class: 'hunter-admin-item rounded-2xl border border-slate-700 bg-[rgb(24_34_52)] p-3 flex flex-col md:flex-row md:items-center gap-3' });

      const thumb = el('div', { class: 'w-14 h-14 rounded-2xl overflow-hidden bg-slate-800 border border-slate-700 flex-0' },
        (h.image || h.image_build)
          ? el('img', { src: hunterIconImgSrc(h, 128), loading: 'lazy', decoding: 'async', alt: h.name })
          : el('div', { style: 'width:100%;height:100%;display:grid;place-items:center' }, '🗡️')
      );

      const meta = el('div', { class: 'hunter-admin-meta min-w-0 flex-1' },
        el('div', { class: 'font-extrabold text-white truncate' }, h.name),
        el('div', { class: 'text-xs text-white' }, `${h.role || '-'} • ${h.element || 'None'} • ${String(h.rarity || 'SSR').toUpperCase()}`)
      );

      const actions = el('div', { class: 'hunter-admin-actions flex flex-wrap items-center gap-2 justify-start md:justify-end' });

      const btnUp = el('button', { class: 'h-9 w-9 rounded-xl border border-slate-700 bg-slate-800 text-slate-100 hover:bg-slate-700 font-extrabold', type: 'button', title: 'Move up' }, '↑');
      const btnDown = el('button', { class: 'h-9 w-9 rounded-xl border border-slate-700 bg-slate-800 text-slate-100 hover:bg-slate-700 font-extrabold', type: 'button', title: 'Move down' }, '↓');
      const btnEdit = el('button', { class: 'h-9 px-3 rounded-xl border border-slate-700 bg-slate-800 text-white hover:bg-slate-700 font-extrabold', type: 'button' }, 'Edit');
      const btnDel = el('button', { class: 'h-9 px-3 rounded-xl border bg-rose-600/15 border-rose-500 text-rose-200 hover:bg-rose-600/25 font-extrabold', type: 'button', title: 'Delete hunter' }, 'Delete');

      btnUp.addEventListener('click', async () => {
        const order = ensureOrder();
        const i = order.indexOf(h.name);
        if (i <= 0) return;
        const tmp = order[i - 1]; order[i - 1] = order[i]; order[i] = tmp;
        await commitOrder(order);
      });

      btnDown.addEventListener('click', async () => {
        const order = ensureOrder();
        const i = order.indexOf(h.name);
        if (i < 0 || i >= order.length - 1) return;
        const tmp = order[i + 1]; order[i + 1] = order[i]; order[i] = tmp;
        await commitOrder(order);
      });

      btnEdit.addEventListener('click', () => openEditHunterModal(h));
      btnDel.addEventListener('click', () => deleteHunter(h));

      actions.append(btnUp, btnDown, btnEdit, btnDel);
      row.append(thumb, meta, actions);
      return row;
    }

    const list = el('div', { class: 'admin-grid' });
    const data = filteredHunters();
    if (!data.length) {
      list.append(el('div', { class: 'p-4 text-center text-white' }, 'No results.'));
    } else {
      for (const h of data) list.append(adminRow(h));
    }

    listBox.append(list);
    card.append(listBox);
    root.append(cfgBox);
    root.append(card);

    function openExactOrderModal() {
      const order = ensureOrder();
      const textarea = el('textarea', {
        style: 'width:100%;min-height:260px;padding:12px;border-radius:14px;border:1px solid rgba(148,163,184,.25);background:rgba(15,23,42,.55);color:#e2e8f0;font-weight:800;outline:none'
      }, order.join('\n'));

      const body = el('div', { class: 'admin-grid' },
        el('div', { class: 'admin-sub' }, 'One name per line. Missing hunters will be appended.'),
        textarea
      );

      const doSave = async () => {
        const lines = (textarea.value || '').split(/\r?\n/).map(x => x.trim()).filter(Boolean);
        const baseNames = (STATE.data.hunters || []).map(h => h.name).filter(Boolean);
        const baseSet = new Set(baseNames);

        const next = [];
        const seen = new Set();
        for (const n of lines) {
          if (!baseSet.has(n)) continue;
          if (seen.has(n)) continue;
          seen.add(n);
          next.push(n);
        }
        for (const n of baseNames) if (!seen.has(n)) next.push(n);

        await commitOrder(next);
        huntersHideModal();
      };

      huntersShowModal('Set exact order', () => body, doSave, 'SAVE');
    }
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
      class: 'w-full mx-auto px-3 sm:px-6 py-6',
      'data-sla-page': 'hunters'
    });

    renderHeader(shell);
    renderSubtabs(shell);
    renderFilters(shell);

    if (STATE.loading) {
      shell.append(el('div', { class: 'p-6 text-center text-white' }, 'Loading…'));
      content.append(shell);
      refreshTailwindSoon();
      requestAnimationFrame(() => { try { window.dispatchEvent(new Event('resize')); } catch {} });
      return;
    }

    if (STATE.error) {
      shell.append(el('div', { class: 'p-6 text-center text-red-600 dark:text-red-400 font-semibold' }, STATE.error));
      content.append(shell);
      refreshTailwindSoon();
      requestAnimationFrame(() => { try { window.dispatchEvent(new Event('resize')); } catch {} });
      return;
    }

    if (STATE.subtab === 'builds') renderBuilds(shell);
    else if (STATE.subtab === 'admin') renderAdmin(shell);
    else renderMyList(shell);

    content.append(shell);

    refreshTailwindSoon();
    requestAnimationFrame(() => { try { window.dispatchEvent(new Event('resize')); } catch {} });
  }

  // --------------------------
  // Mount
  // --------------------------
  window.__hunters_mount = async function __hunters_mount() {
    injectLocalStyles();

    if (!window.__hunterProgressSyncBound) {
      window.__hunterProgressSyncBound = true;
      window.addEventListener(USER_PROGRESS_SYNC_EVENT, () => {
        STATE.collection.loaded = false;
        STATE.collection.loading = false;
        STATE.weaponCollection.loaded = false;
        STATE.weaponCollection.loading = false;
      });
    }

    STATE.collection.loaded = false;
    STATE.collection.loading = false;
    STATE.weaponCollection.loaded = false;
    STATE.weaponCollection.loading = false;

    STATE.cfg = await loadHuntersDropdowns();
    STATE.weaponCfg = await loadHunterWeaponsDropdowns();

    if (!STATE.data.hunters?.length && !STATE.loading) {
      await loadHunters();
    }
    if (!STATE.data.weapons?.length) {
      await loadHunterWeaponsCatalog();
    }

    await loadMyHuntersProgress();
    await loadMyHunterWeaponsProgress();

    if (STATE.subtab === 'admin' && !isAdminTabVisible()) setSubtab('builds');

    requestAnimationFrame(() => render());
  };
})();
