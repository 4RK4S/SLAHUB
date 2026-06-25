'use strict';

/**
 * Pvp.js — PvP page module for the router (LogIn.js).
 * Exposes: window.__pvp_mount(path)
 *
 * UI:
 * 1) Cards — browse/filter tactic cards, click -> details panel
 * 2) Teams — Form Defense Team / Form Attack Team (5 hunters + 9 cards each)
 * 3) Admin — admin-only editor for global tactic cards catalog
 *
 * API (recommended):
 * - GET  /api/pvp/cards
 * - POST /api/admin/pvp/cards  (admin)  { action: add|update|remove, item }
 * - GET  /api/pvp/teams        (auth)
 * - POST /api/pvp/teams        (auth)   { teams }
 *
 * Fallbacks:
 * - If cards API doesn't exist -> uses built-in seed list.
 * - If not logged in -> teams are stored in localStorage.
 */

(function () {
  function __pvpForceDark() {
    try {
      const root = document.documentElement;
      if (root) {
        root.classList.remove('light');
        root.classList.add('dark');
        root.dataset.theme = 'dark';
        root.style.colorScheme = 'dark';
      }
      if (document.body) {
        document.body.classList.remove('light');
        document.body.classList.add('dark');
        document.body.style.colorScheme = 'dark';
      }
      try {
        localStorage.setItem('theme', 'dark');
        localStorage.setItem('color-theme', 'dark');
        sessionStorage.setItem('theme', 'dark');
      } catch {}
    } catch {}
  }

  window.forceDarkMode = window.forceDarkMode || __pvpForceDark;
  __pvpForceDark();
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

  // Normalize Hunter icon paths (fix legacy paths without /picture prefix)
  function normalizeHunterIconPath(p) {
    const s = String(p || '').trim();
    if (!s) return '';
    if (/^https?:\/\//i.test(s)) return s;      // external URL (discord/CDN/etc.)
    if (s.startsWith('/picture/')) return s;      // already correct
    if (s.startsWith('picture/')) return '/' + s;

    // Legacy paths that caused 404s: /Hunter_Icon/... or Hunter_Icon/...
    if (s.startsWith('/Hunter_Icon/')) return '/picture' + s;
    if (s.startsWith('Hunter_Icon/')) return '/picture/' + s;

    // If someone stored just the filename
    if (!s.includes('/')) return '/picture/Hunter_Icon/' + s;

    return s;
  }


  const PVP_TYPE_ICON = {
    enhance: '/picture/Pvp/Type/Enhance.png',
    weaken: '/picture/Pvp/Type/Weaken.png'
  };

  // Filters (copy of Hunter.js assets)
  const FILTER_ICONS = {
    element: {
      fire:  '/picture/Element/Fires.png',
      water: '/picture/Element/Waters.png',
      wind:  '/picture/Element/Winds.png',
      light: '/picture/Element/Lights.png',
      dark:  '/picture/Element/Darkness.png',
      none:  '/picture/Element/None.png'
    },
    role: {
      Striker: '/picture/Type/Striker.png',
      Breaker: '/picture/Type/Breaker.png',
      Supporter: '/picture/Type/Supporter.png',
      'Elemental Stacker': '/picture/Type/Stacker.png'
    }
  };

  function normType(t) {
    return (String(t || '').toLowerCase().trim() === 'weaken') ? 'weaken' : 'enhance';
  }
  function typeStripClass(t) {
    return normType(t) === 'weaken' ? 'wea' : 'enh';
  }

  function renderCardArt(card, variant) {
    const v = variant || 'tile';
    const type = normType(card?.type);
    const strip = typeStripClass(type);
    const src = String(card?.image || '');
    const alt = String(card?.name || '');
    return el('div', { class: `pvp-art pvp-art--${v}` },
      el('img', { class: 'pvp-artImg', src, alt, loading: 'lazy' }),
      el('div', { class: `pvp-strip ${strip}` }),
      el('div', { class: 'pvp-cost' }, String(card?.cost ?? '')),
      el('img', { class: 'pvp-typeIcon', src: PVP_TYPE_ICON[type], alt: type }),
      (v === 'tile' || v === 'pick' || v === 'mini')
        ? el('div', { class: `pvp-nameOverlay ${v === 'pick' ? 'small' : ''}` }, String(card?.name || ''))
        : null
    );
  }

  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null) continue;
      if (k === 'class') node.className = v;
      else if (k === 'style') node.setAttribute('style', v);
      else if (k === 'value') node.value = String(v);
      else if (k === 'html' || k === 'innerHTML') node.innerHTML = String(v);
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'dataset' && typeof v === 'object') {
        for (const [dk, dv] of Object.entries(v)) node.dataset[dk] = String(dv);
      }
      else if (typeof v === 'boolean') { if (v) node.setAttribute(k, ''); }
      else node.setAttribute(k, v);
    }
    for (const ch of children) {
      if (ch == null || ch === false) continue;
      if (Array.isArray(ch)) { ch.forEach(x => node.append(x instanceof Node ? x : document.createTextNode(String(x)))); continue; }
      node.append(ch instanceof Node ? ch : document.createTextNode(String(ch)));
    }
    return node;
  }

  // Non-intrusive toast (doesn't shift layout)
  function ensureToastHost() {
    if (document.getElementById('pvpToastHost')) return;
    const host = document.createElement('div');
    host.id = 'pvpToastHost';
    host.className = 'pvp-toastHost';
    document.body.appendChild(host);
  }
  function toast(msg, tone = 'warn', ms = 1400) {
    ensureToastHost();
    const host = document.getElementById('pvpToastHost');
    if (!host) return;

    const item = document.createElement('div');
    item.className = `pvp-toast ${tone}`;
    item.textContent = String(msg || '');
    host.appendChild(item);

    requestAnimationFrame(() => item.classList.add('show'));

    const t1 = setTimeout(() => item.classList.remove('show'), Math.max(300, ms));
    const t2 = setTimeout(() => { clearTimeout(t1); item.remove(); }, Math.max(450, ms + 250));

    item.addEventListener('click', () => {
      clearTimeout(t1); clearTimeout(t2);
      item.classList.remove('show');
      setTimeout(() => item.remove(), 180);
    });
  }

  function clampInt(v, min, max) {
    const n = Number.isFinite(+v) ? parseInt(v, 10) : min;
    return Math.max(min, Math.min(max, n));
  }
  function safeId(prefix = 'id') {
    return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }

  async function fetchJson(path, opts = {}) {
    const res = await fetch(url(path), {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
      ...opts
    });
    const ct = res.headers.get('content-type') || '';
    const isJson = ct.includes('application/json');
    const payload = isJson ? await res.json().catch(() => ({})) : await res.text().catch(() => '');
    if (!res.ok) {
      const errMsg = (payload && payload.error) ? payload.error : (typeof payload === 'string' ? payload : 'Request failed');
      const e = new Error(errMsg);
      e.status = res.status;
      e.payload = payload;
      throw e;
    }
    return payload;
  }

  function isLoggedIn() {
    return !!(window.STATE && window.STATE.me && window.STATE.me.id);
  }
  function isAdminUser() {
    return !!(window.STATE && window.STATE.isAdmin);
  }

  function isAdminTabVisible() {
    if (!isAdminUser()) return false;
    try { return localStorage.getItem('sla_hide_admin_buttons') !== '1'; } catch { return true; }
  }

  window.addEventListener('sla:admin-hide-changed', () => {
    try { render(); } catch {}
  });

  // --------------------------
  // Lightweight markup for description
  // --------------------------
  function escapeHtml(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  function renderDescToHtml(text) {
    let s = escapeHtml(text || '');
    s = s.replace(/\[g\]([\s\S]*?)\[\/g\]/g, '<span class="pvp-gold">$1</span>');
    s = s.replace(/\[w\]([\s\S]*?)\[\/w\]/g, '<span class="pvp-white">$1</span>');
    s = s.replace(/\n/g, '<br>');
    return s;
  }

  // --------------------------
  // Modal helper (local)
  // --------------------------
  function ensurePvpModal() {
    if (document.getElementById('pvp-modal-css')) return;

    const s = document.createElement('style');
    s.id = 'pvp-modal-css';
    s.textContent = `
      .pvp-backdrop{position:fixed;inset:0;display:none;align-items:center;justify-content:center;z-index:9999;background:rgba(2,6,23,.55);backdrop-filter:blur(2px)}
      .pvp-modal{width:min(980px,94vw);border-radius:1rem;border:1px solid rgba(148,163,184,.28);background:rgba(2,6,23,.92);color:#e2e8f0;box-shadow:0 18px 60px rgba(0,0,0,.55);overflow:hidden}
      .pvp-hd{padding:14px 16px;border-bottom:1px solid rgba(148,163,184,.20);display:flex;gap:.75rem;align-items:center;justify-content:space-between}
      .pvp-title{font-weight:900;letter-spacing:.2px}
      .pvp-bd{padding:14px 16px;max-height:70vh;overflow:auto}
      .pvp-ft{padding:12px 16px;border-top:1px solid rgba(148,163,184,.20);display:flex;gap:.5rem;justify-content:center}
      .pvp-btn{height:40px;padding:0 14px;border-radius:14px;border:1px solid var(--pvp-border);background:var(--pvp-glass);color:var(--pvp-text);cursor:pointer;font-weight:900;display:inline-flex;align-items:center;justify-content:center;line-height:1;transition:background-color .15s ease,color .15s ease,border-color .15s ease}
      .pvp-btn:hover{background:rgba(255,255,255,.10);color:#ffffff;border-color:var(--pvp-border-strong)}
      .pvp-btn.primary:hover{background:var(--pvp-yellow);color:#0f172a;border-color:var(--pvp-yellow)}
      .pvp-btn:focus-visible{outline:none;box-shadow:0 0 0 2px rgba(250,204,21,.45)}
      .pvp-btn:disabled{opacity:.5;cursor:not-allowed}

      .pvp-btn.primary{background:var(--pvp-yellow);color:#0f172a;border-color:var(--pvp-yellow)}
      .pvp-btn.ghost{background:transparent}
      .pvp-x{width:36px;height:36px;border-radius:14px;border:1px solid var(--pvp-border);background:var(--pvp-glass);color:var(--pvp-text);font-weight:900;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;line-height:1;transition:background-color .15s ease,color .15s ease,border-color .15s ease}
      .pvp-x:hover{background:rgba(255,255,255,.10);color:#ffffff;border-color:var(--pvp-border-strong)}
      .pvp-x:focus-visible{outline:none;box-shadow:0 0 0 2px rgba(250,204,21,.45)}

    `;
    document.head.appendChild(s);

    const root = document.createElement('div');
    root.id = 'pvp-modal-root';
    root.className = 'pvp-backdrop';
    root.innerHTML = `
      <div class="pvp-modal">
        <div class="pvp-hd">
          <div class="pvp-title" id="pvpModalTitle"></div>
          <button class="pvp-x" id="pvpModalClose" type="button">✕</button>
        </div>
        <div class="pvp-bd" id="pvpModalBody"></div>
        <div class="pvp-ft">
          <button class="pvp-btn ghost" id="pvpModalCancel" type="button">CLOSE</button>
          <button class="pvp-btn primary" id="pvpModalPrimary" type="button" style="display:none">SAVE</button>
        </div>
      </div>
    `;
    document.body.appendChild(root);

    function hide() {
      root.style.display = 'none';
      const bd = document.getElementById('pvpModalBody');
      if (bd) bd.innerHTML = '';
      const prim = document.getElementById('pvpModalPrimary');
      if (prim) prim.onclick = null;
    }
    function show(title, bodyBuilder, onPrimary, primaryText) {
      const t = document.getElementById('pvpModalTitle');
      if (t) t.textContent = title || '';
      const bd = document.getElementById('pvpModalBody');
      if (bd) {
        bd.innerHTML = '';
        const built = (typeof bodyBuilder === 'function') ? bodyBuilder() : null;
        if (built) bd.append(built);
      }
      const prim = document.getElementById('pvpModalPrimary');
      if (prim) {
        const hasPrimary = typeof onPrimary === 'function';
        prim.style.display = hasPrimary ? 'inline-flex' : 'none';
        prim.textContent = primaryText || 'SAVE';
        prim.onclick = hasPrimary ? onPrimary : null;
      }
      root.style.display = 'flex';
      const close = document.getElementById('pvpModalClose');
      const cancel = document.getElementById('pvpModalCancel');
      if (close) close.onclick = hide;
      if (cancel) cancel.onclick = hide;
    }

    root.addEventListener('click', (e) => { if (e.target === root) hide(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hide(); });

    window.__pvp_hideModal = hide;
    window.__pvp_showModal = show;
  }
  function pvpShowModal(title, bodyBuilder, onPrimary = null, primaryText = 'SAVE') {
    ensurePvpModal();
    window.__pvp_showModal?.(title, bodyBuilder, onPrimary, primaryText);
  }
  function pvpHideModal() {
    try { window.__pvp_hideModal?.(); } catch {}
  }

  // --------------------------
  // Styles
  // --------------------------
  function injectLocalStyles() {
    if (document.getElementById('pvp-local-css')) return;
    const s = document.createElement('style');
    s.id = 'pvp-local-css';
    s.textContent = `
      :root{--pvp-border:rgba(255,255,255,.12);--pvp-border-strong:rgba(255,255,255,.18);--pvp-glass:rgba(15,23,42,.45);--pvp-glass-2:rgba(2,6,23,.32);--pvp-text:rgba(226,232,240,.92);--pvp-text-2:rgba(203,213,225,.92);--pvp-yellow:#facc15;--pvp-green:rgba(34,197,94,.85)}
      .pvp-shell{max-width:1300px;margin:0 auto}
      .pvp-h1{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;margin-bottom:12px}
      .pvp-h1 h1{font-size:26px;line-height:1.1;font-weight:950;color:#facc15;margin:0}
      .pvp-h1 .pvp-sub{color:rgba(203,213,225,.92);font-weight:700;font-size:13px}

      .pvp-tabs{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0 14px}

      .pvp-mainTabs{display:grid;grid-template-columns:repeat(auto-fit,minmax(0,1fr));gap:8px;margin:10px 0 14px}
      .pvp-mainTabs .pvp-tab{width:100%}

      /* Filter pills (icon only) */
      .pvp-pill.iconOnly{width:40px;min-width:40px;padding:0;border-radius:14px;display:inline-flex;align-items:center;justify-content:center}
      .pvp-pill.iconOnly img{width:20px;height:20px;object-fit:contain;filter:drop-shadow(0 6px 12px rgba(0,0,0,.35))}

      /* Pick Hunters rarity colors */
      .pvp-pill.r-sr{background:rgba(151,72,238,.16);border-color:rgba(151,72,238,.45);color:#fff}
      .pvp-pill.r-sr.active{background:#facc15;color:#0f172a;border-color:#facc15}
      .pvp-pill.r-ssr{background:rgba(225,58,58,.16);border-color:rgba(225,58,58,.45);color:#fff}
      .pvp-pill.r-ssr.active{background:#facc15;color:#0f172a;border-color:#facc15}

      .pvp-filterRow{display:flex;gap:8px;align-items:center;flex-wrap:nowrap;overflow-x:auto;padding-bottom:6px}
      .pvp-filterRow::-webkit-scrollbar{height:6px}
      .pvp-filterRow::-webkit-scrollbar-thumb{background:rgba(148,163,184,.25);border-radius:999px}

      /* Smaller cards in pick modal */
      .pvp-pickGrid--cards{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:8px}
      @media (max-width: 980px){.pvp-pickGrid--cards{grid-template-columns:repeat(6,minmax(0,1fr))}}
      @media (max-width: 780px){.pvp-pickGrid--cards{grid-template-columns:repeat(5,minmax(0,1fr))}}
      @media (max-width: 560px){.pvp-pickGrid--cards{grid-template-columns:repeat(4,minmax(0,1fr))}}
      @media (max-width: 420px){.pvp-pickGrid--cards{grid-template-columns:repeat(3,minmax(0,1fr))}}
      .pvp-pickGrid--cards .pvp-nameOverlay.small{font-size:11px;padding:7px 7px 6px}
      .pvp-pickGrid--cards .pvp-strip{width:20%}

      .pvp-tab{height:40px;padding:0 12px;border-radius:14px;border:1px solid var(--pvp-border);background:var(--pvp-glass);color:var(--pvp-text);font-weight:900;cursor:pointer;transition:background-color .15s ease,color .15s ease,border-color .15s ease}
      .pvp-tab.active{background:var(--pvp-yellow);color:#0f172a;border-color:var(--pvp-yellow)}
      .pvp-tab:hover{background:rgba(255,255,255,.10);color:#ffffff;border-color:var(--pvp-border-strong)}
      .pvp-tab.active:hover{background:var(--pvp-yellow);color:#0f172a;border-color:var(--pvp-yellow)}
      .pvp-tab:focus-visible{outline:none;box-shadow:0 0 0 2px rgba(250,204,21,.45)}
      .pvp-tab:disabled{opacity:.5;cursor:not-allowed}


      .pvp-panel{border:1px solid var(--pvp-border);background:var(--pvp-glass-2);border-radius:16px;overflow:hidden}
      .pvp-panel-hd{padding:12px 12px;border-bottom:1px solid rgba(148,163,184,.18);display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between}
      .pvp-row{display:flex;flex-wrap:wrap;gap:10px;align-items:center}
      .pvp-input{height:40px;min-width:220px;max-width:420px;border-radius:14px;border:1px solid var(--pvp-border);background:var(--pvp-glass);color:#e2e8f0;padding:0 12px;font-weight:800;outline:none}
      @media (max-width: 520px){.pvp-input{min-width:100%;max-width:100%}}
      .pvp-inputBig{height:48px;font-size:16px}
      .pvp-pill{height:36px;padding:0 12px;border-radius:999px;border:1px solid var(--pvp-border);background:var(--pvp-glass);color:var(--pvp-text);font-weight:900;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:8px}
      .pvp-pill:hover{background:rgba(255,255,255,.10);color:#ffffff;border-color:var(--pvp-border-strong)}
      .pvp-pill.active:hover{background:var(--pvp-yellow);color:#0f172a;border-color:var(--pvp-yellow)}
      .pvp-pill:focus-visible{outline:none;box-shadow:0 0 0 2px rgba(250,204,21,.45)}
      .pvp-pill:disabled{opacity:.5;cursor:not-allowed}

      .pvp-pill.active{background:var(--pvp-yellow);color:#0f172a;border-color:var(--pvp-yellow)}
      .pvp-muted{color:rgba(226,232,240,.70)}

      .pvp-layout{display:grid;grid-template-columns: 1.2fr .8fr;gap:12px;align-items:start}
      @media (max-width: 900px){.pvp-layout{grid-template-columns:1fr}.pvp-detail{display:none}}

      /* 5 cards per row on desktop */
      .pvp-grid{padding:12px;display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px}
      @media (max-width: 1200px){.pvp-grid{grid-template-columns:repeat(4,minmax(0,1fr))}}
      @media (max-width: 960px){.pvp-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
      @media (max-width: 720px){.pvp-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}

      .pvp-cardTile{border-radius:14px;overflow:hidden;border:1px solid rgba(148,163,184,.24);background:rgba(15,23,42,.35);cursor:pointer;user-select:none;display:flex;flex-direction:column;box-shadow:0 12px 30px rgba(0,0,0,.28)}
      .pvp-cardTile:hover{border-color:rgba(226,232,240,.38)}
      .pvp-cardTile.active{outline:2px solid rgba(255,255,255,.75)}
      .pvp-cardTile.picked{border-color:var(--pvp-green) !important;outline:2px solid rgba(34,197,94,.45) !important;background:rgba(34,197,94,.07) !important}

      .pvp-art{position:relative;width:100%;overflow:hidden;background:rgba(2,6,23,.65)}
      .pvp-art--tile{aspect-ratio:3 / 4;height:auto}
      .pvp-art--pick{aspect-ratio:3 / 4;height:auto}
      .pvp-art--mini{aspect-ratio:3 / 4;height:auto}
      .pvp-art--detail{aspect-ratio:3 / 4;height:auto;max-width:280px;margin:0 auto;border-radius:14px;border:1px solid rgba(148,163,184,.24)}
      .pvp-art--preview{aspect-ratio:3 / 4;height:auto;border-radius:14px;border:1px solid rgba(148,163,184,.24)}
      .pvp-art--modal{aspect-ratio:3 / 4;height:auto;max-width:260px;border-radius:14px;border:1px solid rgba(148,163,184,.24)}
      .pvp-artImg{width:100%;height:100%;object-fit:cover;display:block}
      .pvp-strip{position:absolute;left:0;top:0;bottom:0;width:22%;opacity:.78;pointer-events:none}
      .pvp-strip.enh{background:linear-gradient(to bottom,#3c5fcc,#1a2c5f)}
      .pvp-strip.wea{background:linear-gradient(to bottom,#c64051,#5a1d24)}
      .pvp-typeIcon{position:absolute;right:8px;top:8px;width:28px;height:28px;object-fit:contain;filter:drop-shadow(0 6px 14px rgba(0,0,0,.55))}
      .pvp-cost{position:absolute;left:8px;top:8px;width:30px;height:30px;border-radius:10px;border:1px solid rgba(226,232,240,.35);background:rgba(2,6,23,.65);display:flex;align-items:center;justify-content:center;font-weight:950;color:#ffffff;filter:drop-shadow(0 6px 14px rgba(0,0,0,.55))}

      .pvp-nameOverlay{position:absolute;left:0;right:0;bottom:0;padding:10px 10px 9px;background:linear-gradient(to top, rgba(2,6,23,.92), rgba(2,6,23,.12));color:#e2e8f0;font-weight:950;text-shadow:0 2px 10px rgba(0,0,0,.55);text-align:center}
      .pvp-nameOverlay.small{padding:8px 8px 7px;font-size:12px}

      .pvp-typeBadge{height:28px;padding:0 10px;border-radius:999px;border:1px solid rgba(226,232,240,.25);background:rgba(2,6,23,.50);display:inline-flex;align-items:center;gap:6px;font-weight:950;font-size:12px}
      .pvp-typeBadge.enh{color:#93c5fd}
      .pvp-typeBadge.wea{color:#fca5a5}

      .pvp-detail{position:sticky;top:16px;margin-top:8px;margin-right:8px}
      .pvp-detailInner{padding:16px}
      .pvp-detailTitle{margin:12px 0 6px;font-size:24px;font-weight:950;color:#e2e8f0}
      .pvp-req{margin:8px 0 10px;display:flex;align-items:center;gap:10px}
      .pvp-req-label{color:#ffe394;font-weight:950;font-size:17px}
      .pvp-req-x{color:#ffffff;font-weight:950;font-size:17px}

      .pvp-desc{font-size:16px;line-height:1.5;color:rgba(226,232,240,.88)}
      .pvp-gold{color:#ffe37f;font-weight:900}
      .pvp-white{color:#ffffff;font-weight:900}

      /* ✅ Cards detail modal wrap — mobile 1 column */
      .pvp-cardModalWrap{display:grid;grid-template-columns:260px 1fr;gap:14px;align-items:start;}
      @media (max-width: 520px){
        .pvp-cardModalWrap{grid-template-columns:1fr}
        .pvp-art--modal{max-width:100%}
        .pvp-detailTitle{font-size:20px}
        .pvp-desc{font-size:14px}
      }

      /* Teams */
      .pvp-twoTabs{display:flex;gap:8px;flex-wrap:wrap}
      .pvp-section{padding:12px}
      .pvp-block{border:1px solid var(--pvp-border);background:rgba(2,6,23,.28);border-radius:16px;padding:12px}
      .pvp-blockHd{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px}
      .pvp-blockTitle{font-weight:950;color:#e2e8f0}
      .pvp-smallBtn{height:36px;padding:0 12px;border-radius:12px;border:1px solid var(--pvp-border);background:var(--pvp-glass);color:var(--pvp-text);font-weight:900;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;line-height:1;transition:background-color .15s ease,color .15s ease,border-color .15s ease}
      .pvp-smallBtn.primary{background:var(--pvp-yellow);color:#0f172a;border-color:var(--pvp-yellow)}
      .pvp-smallBtn:hover{background:rgba(255,255,255,.10);color:#ffffff;border-color:var(--pvp-border-strong)}
      .pvp-smallBtn.primary:hover{background:var(--pvp-yellow);color:#0f172a;border-color:var(--pvp-yellow)}
      .pvp-smallBtn:focus-visible{outline:none;box-shadow:0 0 0 2px rgba(250,204,21,.45)}
      .pvp-smallBtn:disabled{opacity:.5;cursor:not-allowed}

      .pvp-chipGrid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px}
      @media (max-width: 900px){.pvp-chipGrid{grid-template-columns:repeat(3,minmax(0,1fr))}}
      @media (max-width: 420px){
        .pvp-chipGrid{grid-template-columns:repeat(2,minmax(0,1fr))}
        .pvp-hunterTile{min-height:118px}
        .pvp-avaLg{width:72px;height:72px;border-radius:14px}
        .pvp-hName2{font-size:14px}
      }
      .pvp-empty{color:rgba(226,232,240,.55);font-weight:800;font-size:12px}

      .pvp-hunterTile{display:flex;flex-direction:column;align-items:center;justify-content:flex-start;gap:8px;border:1px solid var(--pvp-border);background:rgba(2,6,23,.35);border-radius:14px;padding:10px 8px;min-height:130px;text-align:center}
      .pvp-hunterTile--empty{display:flex;align-items:center;justify-content:center}
      .pvp-hunterTile.picked{border-color:var(--pvp-green) !important;outline:2px solid rgba(34,197,94,.45) !important;background:rgba(34,197,94,.07) !important}
      .pvp-avaLg{width:80px;height:80px;border-radius:16px;border:1px solid rgba(148,163,184,.25);object-fit:cover;background:rgba(2,6,23,.75)}
      .pvp-hName2{font-weight:950;font-size:16px;color:#e2e8f0;line-height:1.15;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

      /* Teams Cards (0/9) — always 3x3 */
      .pvp-miniCards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;width:min(720px,100%);margin:0 auto}

      /* ✅ MOBILE FIX: remove fixed height, keep 3:4 ratio */
      .pvp-mini{
        position:relative;border-radius:12px;overflow:hidden;
        border:1px solid rgba(148,163,184,.20);
        background:rgba(2,6,23,.35);
        cursor:pointer;
        aspect-ratio:3 / 4;
        height:auto;
        display:flex;
        align-items:center;
        justify-content:center
      }
      .pvp-mini .pvp-art{border:none;border-radius:0;height:100%;width:100%}
      .pvp-mini .pvp-art--mini{height:100%;width:100%}
      .pvp-mini .pvp-cost{left:6px;top:6px;width:22px;height:22px;border-radius:8px;font-size:12px}
      .pvp-mini .pvp-typeIcon{right:6px;top:6px;width:22px;height:22px}
      .pvp-miniEmpty{width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:rgba(226,232,240,.55);font-weight:900}

      /* Pick grids (modal) */
      .pvp-pickGrid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px}
      @media (max-width: 980px){.pvp-pickGrid{grid-template-columns:repeat(4,minmax(0,1fr))}}
      @media (max-width: 780px){.pvp-pickGrid{grid-template-columns:repeat(3,minmax(0,1fr))}}
      @media (max-width: 560px){.pvp-pickGrid{grid-template-columns:repeat(2,minmax(0,1fr))}}

      /* Admin */
      .pvp-adminLayout{display:grid;grid-template-columns: 1fr 1.4fr; gap:12px}
      @media (max-width: 900px){.pvp-adminLayout{grid-template-columns:1fr}}
      .pvp-adminList{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
      @media (max-width: 900px){.pvp-adminList{grid-template-columns:1fr}}
      .pvp-adminItem{display:flex;align-items:center;gap:8px;border:1px solid rgba(148,163,184,.20);background:rgba(2,6,23,.35);border-radius:14px;padding:8px;cursor:pointer}
      .pvp-adminItem.enh{border-color:rgba(59,130,246,.75)}
      .pvp-adminItem.wea{border-color:rgba(239,68,68,.75)}
      .pvp-ava{width:34px;height:34px;border-radius:12px;border:1px solid rgba(148,163,184,.25);object-fit:cover;background:rgba(2,6,23,.75)}
      .pvp-hName{font-weight:900;font-size:12px;color:#e2e8f0;line-height:1.1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

      /* Forms */
      .pvp-form{display:grid;grid-template-columns:1fr 1fr;gap:12px}
      @media (max-width: 900px){.pvp-form{grid-template-columns:1fr}}
      .pvp-field{display:flex;flex-direction:column;gap:6px}
      .pvp-label{font-size:12px;font-weight:950;color:rgba(203,213,225,.85)}
      .pvp-select,.pvp-textarea{border-radius:14px;border:1px solid rgba(148,163,184,.26);background:rgba(15,23,42,.55);color:#e2e8f0;padding:10px 12px;font-weight:800;outline:none}
      .pvp-textarea{min-height:140px;resize:vertical;font-weight:700;line-height:1.4;width:100%;box-sizing:border-box}
      .pvp-toolbar{display:flex;gap:8px;flex-wrap:wrap}
      .pvp-tool{height:36px;padding:0 10px;border-radius:12px;border:1px solid var(--pvp-border);background:var(--pvp-glass);color:var(--pvp-text);font-weight:900;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;line-height:1;transition:background-color .15s ease,color .15s ease,border-color .15s ease}
      .pvp-tool.gold{color:#ffe37f}
      .pvp-tool.white{color:#ffffff}
      .pvp-previewBox{border:1px solid rgba(148,163,184,.20);background:rgba(2,6,23,.25);border-radius:16px;padding:12px}

      /* Pick filters (Hunter.js-like) */
      .pvp-filterBar{display:flex;flex-direction:column;gap:8px;min-width:260px;flex:1}
      .pvp-filterGroup{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
      .pvp-filterLabel{font-size:12px;font-weight:950;color:rgba(226,232,240,.78);margin-right:4px}
      .pvp-pill.rarity{color:#fff;border-color:rgba(226,232,240,.14)}
      .pvp-pill.rarity.sr{background:rgba(151,72,238,.18);border-color:rgba(151,72,238,.45);color:#ffffff}
      .pvp-pill.rarity.ssr{background:rgba(225,58,58,.18);border-color:rgba(225,58,58,.45);color:#ffffff}
      .pvp-pill.iconOnly{padding:0 10px}
      .pvp-pill .pvp-ico{width:18px;height:18px;object-fit:contain;filter:drop-shadow(0 4px 10px rgba(0,0,0,.55))}
      .pvp-pill.active.rarity{color:#0f172a}
      .pvp-pill.active.rarity.sr{background:#facc15;border-color:#facc15;color:#0f172a}
      .pvp-pill.active.rarity.ssr{background:#facc15;border-color:#facc15;color:#0f172a}

      /* Non-intrusive toast */
      .pvp-toastHost{position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:10000;display:flex;flex-direction:column;gap:8px;pointer-events:none}
      .pvp-toast{pointer-events:auto;min-width:min(520px,92vw);max-width:92vw;padding:10px 12px;border-radius:14px;border:1px solid rgba(148,163,184,.28);background:rgba(2,6,23,.92);color:#e2e8f0;font-weight:950;box-shadow:0 14px 40px rgba(0,0,0,.55);opacity:0;transform:translateY(-10px);transition:opacity .18s ease, transform .18s ease}
      .pvp-toast.warn{border-color:rgba(248,113,113,.35);background:rgba(127,29,29,.28);color:#fecaca}
      .pvp-toast.ok{border-color:rgba(34,197,94,.35);background:rgba(20,83,45,.28);color:#bbf7d0}
      .pvp-toast.show{opacity:1;transform:translateY(0)}

      /* =========================
         MOBILE: Filters drawer (Pick Hunters)
         ========================= */
      .pvp-filterTopRow{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px}
      .pvp-filterBtn{height:40px;padding:0 12px;border-radius:14px;border:1px solid var(--pvp-border);background:var(--pvp-glass);color:var(--pvp-text);font-weight:900;cursor:pointer;transition:background-color .15s ease,color .15s ease,border-color .15s ease}
      .pvp-filterBtn:hover{background:rgba(255,255,255,.10);color:#ffffff;border-color:var(--pvp-border-strong)}
      .pvp-filterBtn:focus-visible{outline:none;box-shadow:0 0 0 2px rgba(250,204,21,.45)}
      .pvp-filterBtn:disabled{opacity:.5;cursor:not-allowed}


      .pvp-filterDrawerBackdrop{position:fixed;inset:0;z-index:10001;background:rgba(2,6,23,.55);display:none}
      .pvp-filterDrawerBackdrop.open{display:block}

      .pvp-filterDrawer{position:fixed;left:0;right:0;bottom:-100%;z-index:10002;padding:10px;transition:bottom .18s ease}
      .pvp-filterDrawer.open{bottom:0}

      .pvp-filterDrawerPanel{
        border-radius:18px 18px 14px 14px;
        border:1px solid rgba(148,163,184,.22);
        background:rgba(2,6,23,.96);
        box-shadow:0 18px 60px rgba(0,0,0,.55);
        overflow:hidden;
        max-height:78vh;
        display:grid;
        grid-template-rows:auto 1fr auto;
      }
      .pvp-filterDrawerHd{padding:12px 12px;border-bottom:1px solid var(--pvp-border);display:flex;align-items:center;justify-content:space-between;gap:10px;font-weight:950;color:#e2e8f0}
      .pvp-filterDrawerBd{padding:12px;overflow:auto}
      .pvp-filterDrawerFt{padding:12px;border-top:1px solid rgba(148,163,184,.18);display:flex;gap:8px;justify-content:space-between;align-items:center}

      .pvp-filterGroupBlock{border:1px solid rgba(148,163,184,.20);background:rgba(15,23,42,.28);border-radius:16px;padding:10px;margin-bottom:10px}
      .pvp-filterGroupTitle{font-size:12px;font-weight:950;color:rgba(203,213,225,.85);margin-bottom:8px}

      @media (max-width: 520px){.pvp-filterRow{display:none !important;}}

      /* =========================
         MOBILE: Admin accordion
         ========================= */
      .pvp-acc{display:grid;gap:10px}
      .pvp-accItem{border:1px solid rgba(148,163,184,.22);background:rgba(2,6,23,.32);border-radius:16px;overflow:hidden}
      .pvp-accBtn{
        width:100%;padding:12px 12px;
        display:flex;align-items:center;justify-content:space-between;gap:10px;
        background:rgba(15,23,42,.35);border:0;cursor:pointer;color:#e2e8f0;
      }
      .pvp-accBtn .t{font-weight:950}
      .pvp-accBtn .s{font-size:12px;color:rgba(226,232,240,.70);font-weight:800}
      .pvp-accBody{display:none;padding:12px}
      .pvp-accItem.open .pvp-accBody{display:block}
      .pvp-stickyActions{
        position:sticky;bottom:0;margin:12px -12px -12px;
        padding:12px;border-top:1px solid rgba(148,163,184,.18);
        background:linear-gradient(to bottom, rgba(2,6,23,.12), rgba(2,6,23,.92));
        display:flex;gap:8px;justify-content:flex-end;
      }
    `;
    document.head.appendChild(s);
  }

  // --------------------------
  // State
  // --------------------------
  const LS_TEAMS_KEY = 'sla_pvp_teams_v1';
  const LS_SUBTAB_KEY = 'sla_pvp_subtab_v2';

  const STATE = {
    subtab: 'cards',
    filterText: '',
    filterType: 'all',
    selectedCardId: null,
    loading: false,
    error: null,

    cards: [],
    hunters: [],

    teamsSub: 'defense',
    teams: {
      defense: { hunters: [], cards: [] },
      attack: { hunters: [], cards: [] }
    },

    editor: {
      mode: 'add',
      originalId: null,
      name: '',
      type: 'enhance',
      cost: 1,
      image: '',
      description: '',
      order: null
    }
  };

  // --------------------------
  // Data seeds
  // --------------------------
  const SEED_CARDS = [
    {
      id: 'demolish',
      name: 'Demolish',
      type: 'weaken',
      cost: 2,
      image: '',
      description: 'Decreases the Break Gauge of a single enemy on the battlefield by [g]50%[/g].'
    },
    {
      id: 'tactics_unleashed',
      name: 'Tactics Unleashed',
      type: 'enhance',
      cost: 1,
      image: '',
      description: 'Increases max Tactic Points by [g]1[/g].'
    }
  ];

  // --------------------------
  // Loaders
  // --------------------------
  async function loadCards() {
    STATE.error = null;
    try {
      const data = await fetchJson('/api/pvp/cards');
      const list = Array.isArray(data?.cards) ? data.cards : (Array.isArray(data) ? data : []);
      STATE.cards = normalizeCards(list);
    } catch (e) {
      if (e && (e.status === 404 || e.status === 405)) {
        STATE.cards = normalizeCards(SEED_CARDS);
      } else {
        console.warn('[pvp] loadCards failed', e);
        STATE.cards = normalizeCards(SEED_CARDS);
      }
    }

    if (!STATE.selectedCardId && STATE.cards.length) {
      STATE.selectedCardId = STATE.cards[0].id;
    }
  }

  async function loadHuntersCatalog() {
    try {
      const list = await fetchJson('/api/public/hunters', { method: 'GET' });
      const arr = Array.isArray(list)
        ? list
        : (Array.isArray(list?.items) ? list.items : (Array.isArray(list?.hunters) ? list.hunters : []));
      STATE.hunters = (arr || [])
        .map(x => ({
          name: String(x?.name || '').trim(),
          image: normalizeHunterIconPath(cdnySafe(String(x?.image || x?.img || ''), 256) || String(x?.image || x?.img || '')),
          rarity: String(x?.rarity || x?.grade || x?.rank || x?.tier || '').trim(),
          element: String(x?.element || x?.elem || x?.attribute || '').trim(),
          hclass: String(x?.class || x?.role || x?.job || x?.type || '').trim()
        }))
        .filter(x => !!x.name);
    } catch (e) {
      console.warn('[pvp] loadHuntersCatalog failed', e);
      STATE.hunters = [];
    }
  }

  function loadTeamsLocal() {
    try {
      const raw = localStorage.getItem(LS_TEAMS_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed && typeof parsed === 'object') {
        STATE.teams = normalizeTeams(parsed);
        return;
      }
    } catch {}
    STATE.teams = normalizeTeams(STATE.teams);
  }

  async function loadTeams() {
    if (!isLoggedIn()) {
      loadTeamsLocal();
      return;
    }
    try {
      const data = await fetchJson('/api/pvp/teams');
      const teams = data?.teams || data || {};
      STATE.teams = normalizeTeams(teams);
    } catch (e) {
      console.warn('[pvp] loadTeams failed, fallback local', e);
      loadTeamsLocal();
    }
  }

  function saveTeamsLocal() {
    try { localStorage.setItem(LS_TEAMS_KEY, JSON.stringify(STATE.teams)); } catch {}
  }

  let SAVE_TIMER = null;
  function scheduleSaveTeams() {
    if (!isLoggedIn()) {
      saveTeamsLocal();
      return;
    }
    if (SAVE_TIMER) clearTimeout(SAVE_TIMER);
    SAVE_TIMER = setTimeout(async () => {
      SAVE_TIMER = null;
      try {
        await fetchJson('/api/pvp/teams', {
          method: 'POST',
          body: JSON.stringify({ teams: STATE.teams })
        });
      } catch (e) {
        console.warn('[pvp] saveTeams failed, saving local', e);
        saveTeamsLocal();
        toast('Save failed — stored locally.', 'warn', 1600);
      }
    }, 450);
  }

  function normalizeCards(list) {
    const out = [];
    for (const raw of (Array.isArray(list) ? list : [])) {
      const id = String(raw?.id || raw?.name || '').trim() || safeId('card');
      const name = String(raw?.name || '').trim() || 'Unnamed';
      const typeRaw = String(raw?.type || raw?.kind || '').toLowerCase().trim();
      const type = (typeRaw === 'weaken') ? 'weaken' : 'enhance';
      const cost = clampInt(raw?.cost ?? raw?.requiredTacticPoints ?? 1, 0, 99);
      const image = cdnySafe(String(raw?.image || ''), 512);
      const description = String(raw?.description || raw?.desc || '').trim();
      const order = Number.isFinite(+raw?.order) ? +raw.order : (Number.isFinite(+raw?.sortOrder) ? +raw.sortOrder : null);
      out.push({ id, name, type, cost, image, description, order });
    }

    out.sort((a, b) => {
      const ao = Number.isFinite(+a.order) ? +a.order : null;
      const bo = Number.isFinite(+b.order) ? +b.order : null;
      if (ao != null && bo != null) return ao - bo;
      if (ao != null) return -1;
      if (bo != null) return 1;
      return (a.cost - b.cost) || a.name.localeCompare(b.name);
    });

    return out;
  }

  function normalizeTeams(t) {
    const def = t?.defense || {};
    const att = t?.attack || {};
    return {
      defense: {
        hunters: Array.isArray(def.hunters) ? def.hunters.map(String) : [],
        cards: Array.isArray(def.cards) ? def.cards.map(String) : []
      },
      attack: {
        hunters: Array.isArray(att.hunters) ? att.hunters.map(String) : [],
        cards: Array.isArray(att.cards) ? att.cards.map(String) : []
      }
    };
  }

  // --------------------------
  // UI: Cards
  // --------------------------
  function filteredCards() {
    const q = String(STATE.filterText || '').toLowerCase().trim();
    const ft = STATE.filterType;
    return STATE.cards.filter(c => {
      if (ft !== 'all' && c.type !== ft) return false;
      if (!q) return true;
      return c.name.toLowerCase().includes(q);
    });
  }

  function getCardById(id) {
    return STATE.cards.find(c => String(c.id) === String(id)) || null;
  }

  function renderCards(root) {
    const panel = el('div', { class: 'pvp-panel' });

    const hd = el('div', { class: 'pvp-panel-hd' },
      el('div', { class: 'pvp-row' },
        el('input', {
          class: 'pvp-input',
          placeholder: 'Search cards…',
          value: STATE.filterText,
          oninput: (e) => { STATE.filterText = e.target.value; render(); }
        }),
        el('button', {
          class: `pvp-pill ${STATE.filterType === 'all' ? 'active' : ''}`,
          onclick: () => { STATE.filterType = 'all'; render(); }
        }, 'All'),
        el('button', {
          class: `pvp-pill ${STATE.filterType === 'enhance' ? 'active' : ''}`,
          onclick: () => { STATE.filterType = 'enhance'; render(); }
        }, 'Enhance'),
        el('button', {
          class: `pvp-pill ${STATE.filterType === 'weaken' ? 'active' : ''}`,
          onclick: () => { STATE.filterType = 'weaken'; render(); }
        }, 'Weaken')
      ),
      el('div', { class: 'pvp-muted' }, `${filteredCards().length} cards`)
    );
    panel.append(hd);

    const layout = el('div', { class: 'pvp-layout' });

    const grid = el('div', { class: 'pvp-grid' });
    const list = filteredCards();
    for (const c of list) {
      const tile = el('div', {
        class: `pvp-cardTile ${STATE.selectedCardId === c.id ? 'active' : ''}`,
        onclick: () => {
          STATE.selectedCardId = c.id;
          if (window.matchMedia && window.matchMedia('(max-width: 900px)').matches) {
            showCardDetailModal(c);
          } else {
            render();
          }
        }
      }, renderCardArt(c, 'tile'));
      grid.append(tile);
    }

    const detail = el('div', { class: 'pvp-detail' });
    const inner = el('div', { class: 'pvp-detailInner pvp-panel' });
    const active = getCardById(STATE.selectedCardId) || (list[0] || null);

    if (active) {
      const typeBadge = el('div', { class: `pvp-typeBadge ${active.type === 'enhance' ? 'enh' : 'wea'}` }, active.type === 'enhance' ? 'Enhance' : 'Weaken');
      inner.append(
        renderCardArt(active, 'detail'),
        el('div', { style: 'display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:12px' },
          el('div', { class: 'pvp-detailTitle' }, active.name),
          typeBadge
        ),
        el('div', { class: 'pvp-req', style: 'margin-top:8px' },
          el('span', { class: 'pvp-req-label' }, 'Required Tactic Points'),
          el('span', { class: 'pvp-req-x' }, String(active.cost))
        ),
        el('div', { class: 'pvp-desc', style: 'margin-top:10px', html: renderDescToHtml(active.description || '') })
      );
    } else {
      inner.append(el('div', { class: 'pvp-muted', style: 'padding:16px' }, 'No cards.'));
    }
    detail.append(inner);

    layout.append(grid, detail);
    panel.append(layout);
    root.append(panel);
  }

  function showCardDetailModal(card) {
    pvpShowModal(card.name, () => {
      const typeBadge = el('div', { class: `pvp-typeBadge ${card.type === 'enhance' ? 'enh' : 'wea'}` }, card.type === 'enhance' ? 'Enhance' : 'Weaken');
      const wrap = el('div', { class: 'pvp-cardModalWrap' },
        el('div', {}, renderCardArt(card, 'modal')),
        el('div', {},
          el('div', { style: 'display:flex;align-items:center;justify-content:space-between;gap:10px' },
            el('div', { class: 'pvp-detailTitle' }, card.name),
            typeBadge
          ),
          el('div', { class: 'pvp-req', style: 'margin-top:8px' },
            el('span', { class: 'pvp-req-label' }, 'Required Tactic Points'),
            el('span', { class: 'pvp-req-x' }, String(card.cost))
          ),
          el('div', { class: 'pvp-desc', style: 'margin-top:10px', html: renderDescToHtml(card.description || '') })
        )
      );
      return wrap;
    });
  }

  // --------------------------
  // UI: Teams
  // --------------------------
  function renderTeams(root) {
    const panel = el('div', { class: 'pvp-panel' });
    const hd = el('div', { class: 'pvp-panel-hd' },
      el('div', { class: 'pvp-row' },
        el('div', { class: 'pvp-twoTabs' },
          el('button', {
            class: `pvp-tab ${STATE.teamsSub === 'defense' ? 'active' : ''}`,
            onclick: () => { STATE.teamsSub = 'defense'; render(); }
          }, 'Form Defense Team'),
          el('button', {
            class: `pvp-tab ${STATE.teamsSub === 'attack' ? 'active' : ''}`,
            onclick: () => { STATE.teamsSub = 'attack'; render(); }
          }, 'Form Attack Team')
        )
      )
    );
    panel.append(hd);

    const section = el('div', { class: 'pvp-section' });
    const team = STATE.teams[STATE.teamsSub];

    const huntersBlock = el('div', { class: 'pvp-block', style: 'margin-bottom:12px' },
      el('div', { class: 'pvp-blockHd' },
        el('div', { class: 'pvp-blockTitle' }, `Hunters (${team.hunters.length}/5)`),
        isLoggedIn() ? el('button', {
          class: 'pvp-smallBtn',
          onclick: () => openPickHunters(team.hunters, (next) => {
            team.hunters = next;
            scheduleSaveTeams();
            render();
          })
        }, 'Edit hunters') : null
      ),
      renderSelectedHunters(team.hunters)
    );

    const cardsBlock = el('div', { class: 'pvp-block' },
      el('div', { class: 'pvp-blockHd' },
        el('div', { class: 'pvp-blockTitle' }, `Cards (${team.cards.length}/9)`),
        isLoggedIn() ? el('button', {
          class: 'pvp-smallBtn',
          onclick: () => openPickCards(team.cards, (next) => {
            team.cards = next;
            scheduleSaveTeams();
            render();
          })
        }, 'Edit cards') : null
      ),
      renderSelectedCardsMini(team.cards)
    );

    section.append(huntersBlock, cardsBlock);
    panel.append(section);
    root.append(panel);
  }

  function renderSelectedHunters(names) {
    const wrap = el('div', { class: 'pvp-chipGrid' });
    const set = Array.isArray(names) ? names : [];
    for (let i = 0; i < 5; i++) {
      const name = set[i] || '';
      if (!name) {
        wrap.append(
          el('div', { class: 'pvp-hunterTile pvp-hunterTile--empty' },
            el('div', { class: 'pvp-empty' }, 'Empty')
          )
        );
        continue;
      }
      const h = STATE.hunters.find(x => x.name === name) || { name, image: '' };
      wrap.append(
        el('div', { class: 'pvp-hunterTile' },
          el('img', { class: 'pvp-avaLg', src: h.image || '', alt: h.name, loading: 'lazy' }),
          el('div', { class: 'pvp-hName2', title: h.name }, h.name)
        )
      );
    }
    return wrap;
  }

  function renderSelectedCardsMini(ids) {
    const wrap = el('div', { class: 'pvp-miniCards' });
    const list = Array.isArray(ids) ? ids : [];
    for (let i = 0; i < 9; i++) {
      const id = list[i] || '';
      if (!id) {
        wrap.append(el('div', { class: 'pvp-mini' }, el('div', { class: 'pvp-miniEmpty' }, 'Empty')));
        continue;
      }
      const c = getCardById(id);
      if (!c) {
        wrap.append(el('div', { class: 'pvp-mini' }, el('div', { class: 'pvp-miniEmpty' }, 'Missing')));
        continue;
      }
      wrap.append(
        el('div', { class: 'pvp-mini', onclick: () => showCardDetailModal(c) },
          renderCardArt(c, 'mini')
        )
      );
    }
    return wrap;
  }

  // --------------------------
  // Pickers: Hunters (MOBILE: Filters drawer)
  // --------------------------
  function openPickHunters(current, onSave) {
    const picked = new Set((Array.isArray(current) ? current : []).filter(Boolean));
    let qText = '';
    let fRarity = 'all';   // all | sr | ssr
    let fElement = 'all';  // all | fire | water | wind | light | dark
    let fRole = 'all';     // all | Striker | Breaker | Supporter | Elemental Stacker

    const isMob = !!(window.matchMedia && window.matchMedia('(max-width: 520px)').matches);
    const norm = (s) => String(s || '').toLowerCase().trim();

    function rarityKey(r) {
      const v = norm(r);
      if (v.includes('ssr')) return 'ssr';
      if (v.includes('sr')) return 'sr';
      return '';
    }
    function elementKey(e) {
      const v = norm(e);
      if (v.includes('fire')) return 'fire';
      if (v.includes('water')) return 'water';
      if (v.includes('wind')) return 'wind';
      if (v.includes('light')) return 'light';
      if (v.includes('dark')) return 'dark';
      return '';
    }
    function roleKey(r) {
      const v = norm(r);
      if (v.includes('elemental') || v.includes('stacker')) return 'Elemental Stacker';
      if (v.includes('striker')) return 'Striker';
      if (v.includes('breaker')) return 'Breaker';
      if (v.includes('support')) return 'Supporter';
      return '';
    }

    function makeRarityButtons(onChange) {
      const btnSR = el('button', { class: 'pvp-pill r-sr', type: 'button' }, 'SR');
      const btnSSR = el('button', { class: 'pvp-pill r-ssr', type: 'button' }, 'SSR');
      btnSR.onclick = () => { fRarity = (fRarity === 'sr' ? 'all' : 'sr'); onChange(); };
      btnSSR.onclick = () => { fRarity = (fRarity === 'ssr' ? 'all' : 'ssr'); onChange(); };
      return { btnSR, btnSSR };
    }

    function makeElementButtons(onChange) {
      const keys = ['fire', 'water', 'wind', 'light', 'dark'];
      const btns = keys.map(k => {
        const b = el('button', { class: 'pvp-pill iconOnly', type: 'button', title: k },
          el('img', { src: FILTER_ICONS.element[k], alt: k, loading: 'lazy' })
        );
        b.onclick = () => { fElement = (fElement === k ? 'all' : k); onChange(); };
        return b;
      });
      return { keys, btns };
    }

    function makeRoleButtons(onChange) {
      const keys = ['Striker', 'Breaker', 'Supporter', 'Elemental Stacker'];
      const btns = keys.map(k => {
        const b = el('button', { class: 'pvp-pill iconOnly', type: 'button', title: k },
          el('img', { src: FILTER_ICONS.role[k], alt: k, loading: 'lazy' })
        );
        b.onclick = () => { fRole = (fRole === k ? 'all' : k); onChange(); };
        return b;
      });
      return { keys, btns };
    }

    pvpShowModal('Pick Hunters (max 5)', () => {
      const msg = el('div', { class: 'pvp-msg' });

      const search = el('input', {
        class: 'pvp-input',
        style: 'min-width:160px;max-width:260px;flex:1 1 auto',
        placeholder: 'Search…',
        value: qText,
        oninput: (e) => { qText = e.target.value; renderList(); }
      });

      const info = el('div', { class: 'pvp-muted', style: 'margin:6px 0 10px;font-weight:900' }, `Selected: ${picked.size}/5`);
      const listWrap = el('div', { class: 'pvp-pickGrid', style: 'min-height:360px' });
      const footer = el('div', { class: 'pvp-muted', style: 'margin-top:10px' }, '');

      function setMsg(t) {
        msg.textContent = String(t || '');
        msg.style.display = t ? 'block' : 'none';
      }

      function passesFilters(h) {
        const q = String(qText || '').toLowerCase().trim();
        if (q && !h.name.toLowerCase().includes(q)) return false;

        if (fRarity !== 'all' && rarityKey(h.rarity) !== fRarity) return false;
        if (fElement !== 'all' && elementKey(h.element) !== fElement) return false;
        if (fRole !== 'all' && roleKey(h.hclass) !== fRole) return false;

        return true;
      }

      function renderList() {
        setMsg('');
        listWrap.innerHTML = '';
        const arr = STATE.hunters.filter(passesFilters);

        for (const h of arr) {
          const active = picked.has(h.name);
          const card = el('div', {
            class: `pvp-hunterTile ${active ? 'picked' : ''}`,
            style: 'cursor:pointer',
            onclick: () => {
              if (picked.has(h.name)) picked.delete(h.name);
              else {
                if (picked.size >= 5) { setMsg('You already picked 5 hunters. Remove one first.'); return; }
                picked.add(h.name);
              }
              info.textContent = `Selected: ${picked.size}/5`;
              renderList();
            }
          },
            el('img', { class: 'pvp-avaLg', src: h.image || '', alt: h.name, loading: 'lazy' }),
            el('div', { class: 'pvp-hName2', title: h.name }, h.name)
          );
          listWrap.append(card);
        }
      }

      function clearAll() {
        qText = '';
        fRarity = 'all';
        fElement = 'all';
        fRole = 'all';
        search.value = '';
        refreshToggles();
        renderList();
      }

      // Desktop toggles
      const desktop = (() => {
        const onChange = () => { refreshToggles(); renderList(); };
        const rar = makeRarityButtons(onChange);
        const elx = makeElementButtons(onChange);
        const rol = makeRoleButtons(onChange);

        const clearBtn = el('button', { class: 'pvp-pill', type: 'button', onclick: clearAll }, 'Clear');

        const row = el('div', { class: 'pvp-filterRow', style: 'margin-bottom:10px' },
          search,
          rar.btnSR,
          rar.btnSSR,
          ...elx.btns,
          ...rol.btns,
          clearBtn
        );

        return { row, rar, elx, rol, clearBtn };
      })();

      // Mobile drawer
      const mobile = (() => {
        const onChange = () => { refreshToggles(); renderList(); };

        const drawerBackdrop = el('div', { class: 'pvp-filterDrawerBackdrop' });
        const drawer = el('div', { class: 'pvp-filterDrawer' });

        const closeDrawer = () => {
          drawerBackdrop.classList.remove('open');
          drawer.classList.remove('open');
        };
        const openDrawer = () => {
          drawerBackdrop.classList.add('open');
          drawer.classList.add('open');
        };

        drawerBackdrop.onclick = closeDrawer;

        const rar = makeRarityButtons(onChange);
        const elx = makeElementButtons(onChange);
        const rol = makeRoleButtons(onChange);

        const topRow = el('div', { class: 'pvp-filterTopRow' },
          search,
          el('button', { class: 'pvp-filterBtn', type: 'button', onclick: openDrawer }, 'Filters'),
          el('button', { class: 'pvp-pill', type: 'button', onclick: clearAll }, 'Clear')
        );

        drawer.append(
          el('div', { class: 'pvp-filterDrawerPanel' },
            el('div', { class: 'pvp-filterDrawerHd' },
              el('div', {}, 'Filters'),
              el('button', { class: 'pvp-smallBtn', type: 'button', onclick: closeDrawer }, 'Close')
            ),
            el('div', { class: 'pvp-filterDrawerBd' },
              el('div', { class: 'pvp-filterGroupBlock' },
                el('div', { class: 'pvp-filterGroupTitle' }, 'Rarity'),
                el('div', { class: 'pvp-filterGroup' }, rar.btnSR, rar.btnSSR)
              ),
              el('div', { class: 'pvp-filterGroupBlock' },
                el('div', { class: 'pvp-filterGroupTitle' }, 'Element'),
                el('div', { class: 'pvp-filterGroup' }, ...elx.btns)
              ),
              el('div', { class: 'pvp-filterGroupBlock' },
                el('div', { class: 'pvp-filterGroupTitle' }, 'Role'),
                el('div', { class: 'pvp-filterGroup' }, ...rol.btns)
              )
            ),
            el('div', { class: 'pvp-filterDrawerFt' },
              el('button', { class: 'pvp-smallBtn', type: 'button', onclick: clearAll }, 'Clear'),
              el('button', { class: 'pvp-smallBtn primary', type: 'button', onclick: closeDrawer }, 'Apply')
            )
          )
        );

        return { topRow, drawerBackdrop, drawer, rar, elx, rol };
      })();

      function refreshToggles() {
        // desktop
        if (desktop?.rar) {
          desktop.rar.btnSR.className = `pvp-pill r-sr ${fRarity === 'sr' ? 'active' : ''}`;
          desktop.rar.btnSSR.className = `pvp-pill r-ssr ${fRarity === 'ssr' ? 'active' : ''}`;
          for (let i = 0; i < desktop.elx.keys.length; i++) {
            const k = desktop.elx.keys[i];
            desktop.elx.btns[i].className = `pvp-pill iconOnly ${fElement === k ? 'active' : ''}`;
          }
          for (let i = 0; i < desktop.rol.keys.length; i++) {
            const k = desktop.rol.keys[i];
            desktop.rol.btns[i].className = `pvp-pill iconOnly ${fRole === k ? 'active' : ''}`;
          }
        }
        // mobile
        if (mobile?.rar) {
          mobile.rar.btnSR.className = `pvp-pill r-sr ${fRarity === 'sr' ? 'active' : ''}`;
          mobile.rar.btnSSR.className = `pvp-pill r-ssr ${fRarity === 'ssr' ? 'active' : ''}`;
          for (let i = 0; i < mobile.elx.keys.length; i++) {
            const k = mobile.elx.keys[i];
            mobile.elx.btns[i].className = `pvp-pill iconOnly ${fElement === k ? 'active' : ''}`;
          }
          for (let i = 0; i < mobile.rol.keys.length; i++) {
            const k = mobile.rol.keys[i];
            mobile.rol.btns[i].className = `pvp-pill iconOnly ${fRole === k ? 'active' : ''}`;
          }
        }
      }

      refreshToggles();
      renderList();

      return el('div', {},
        isMob ? el('div', {}, mobile.topRow, mobile.drawerBackdrop, mobile.drawer) : desktop.row,
        msg,
        info,
        listWrap,
        footer
      );
    }, () => {
      const next = Array.from(picked).slice(0, 5);
      onSave(next);
      pvpHideModal();
    }, 'SAVE');
  }

  // --------------------------
  // Pickers: Cards
  // --------------------------
  function openPickCards(current, onSave) {
    const picked = new Set((Array.isArray(current) ? current : []).filter(Boolean));
    let filter = '';
    let kind = 'all';

    pvpShowModal('Pick Cards (max 9)', () => {
      const search = el('input', {
        class: 'pvp-input',
        placeholder: 'Search cards…',
        value: filter,
        oninput: (e) => { filter = e.target.value; renderList(); }
      });

      const btnAll = el('button', { class: `pvp-pill ${kind === 'all' ? 'active' : ''}`, type: 'button', onclick: () => setKind('all') }, 'All');
      const btnEnh = el('button', { class: `pvp-pill ${kind === 'enhance' ? 'active' : ''}`, type: 'button', onclick: () => setKind('enhance') }, 'Enhance');
      const btnWea = el('button', { class: `pvp-pill ${kind === 'weaken' ? 'active' : ''}`, type: 'button', onclick: () => setKind('weaken') }, 'Weaken');

      function setKind(v) {
        kind = v;
        btnAll.className = `pvp-pill ${kind === 'all' ? 'active' : ''}`;
        btnEnh.className = `pvp-pill ${kind === 'enhance' ? 'active' : ''}`;
        btnWea.className = `pvp-pill ${kind === 'weaken' ? 'active' : ''}`;
        renderList();
      }

      const top = el('div', { style: 'display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:10px' },
        search,
        btnAll,
        btnEnh,
        btnWea
      );

      const info = el('div', { class: 'pvp-muted', style: 'margin:6px 0 10px;font-weight:900' }, `Selected: ${picked.size}/9`);
      const grid = el('div', { class: 'pvp-pickGrid pvp-pickGrid--cards', style: 'min-height:320px' });
      const footer = el('div', { class: 'pvp-muted', style: 'margin-top:10px' }, '');

      function renderList() {
        grid.innerHTML = '';
        const q = String(filter || '').toLowerCase().trim();
        const arr = STATE.cards.filter(c => {
          if (kind !== 'all' && c.type !== kind) return false;
          if (q && !c.name.toLowerCase().includes(q)) return false;
          return true;
        });

        for (const c of arr) {
          const active = picked.has(c.id);
          const tile = el('div', {
            class: `pvp-cardTile pvp-cardTile--pick ${active ? 'picked' : ''}`,
            onclick: () => {
              if (picked.has(c.id)) picked.delete(c.id);
              else {
                if (picked.size >= 9) { toast('You already picked 9 cards. Remove one first.', 'warn', 1400); return; }
                picked.add(c.id);
              }
              info.textContent = `Selected: ${picked.size}/9`;
              renderList();
            }
          }, renderCardArt(c, 'pick'));
          grid.append(tile);
        }
      }

      renderList();
      return el('div', {}, top, info, grid, footer);
    }, () => {
      onSave(Array.from(picked).slice(0, 9));
      pvpHideModal();
    }, 'SAVE');
  }

  // --------------------------
  // UI: Admin (cards)
  // --------------------------
  function setEditorFromCard(c) {
    STATE.editor.mode = 'edit';
    STATE.editor.originalId = c.id;
    STATE.editor.name = c.name;
    STATE.editor.type = c.type;
    STATE.editor.cost = c.cost;
    STATE.editor.image = c.image || '';
    STATE.editor.description = c.description || '';
    STATE.editor.order = (Number.isFinite(+c.order) ? +c.order : null);
  }
  function resetEditor() {
    STATE.editor = { mode: 'add', originalId: null, name: '', type: 'enhance', cost: 1, image: '', description: '', order: null };
  }

  function applyWrapTag(textarea, open, close) {
    const ta = textarea;
    const start = ta.selectionStart || 0;
    const end = ta.selectionEnd || 0;
    const before = ta.value.slice(0, start);
    const sel = ta.value.slice(start, end);
    const after = ta.value.slice(end);
    const wrapped = sel ? `${open}${sel}${close}` : `${open}${close}`;
    ta.value = before + wrapped + after;
    if (!sel) {
      const pos = (before + open).length;
      ta.setSelectionRange(pos, pos);
    }
    ta.dispatchEvent(new Event('input'));
    ta.focus();
  }

  async function adminSaveCard(action, item) {
    try {
      await fetchJson('/api/admin/pvp/cards', {
        method: 'POST',
        body: JSON.stringify({ action, item })
      });
      await loadCards();
      toast('Saved.', 'ok', 1100);
    } catch (e) {
      console.warn('[pvp] adminSaveCard failed', e);
      toast('Admin API missing / forbidden.', 'warn', 1600);
    }
  }

  function buildAdminItemFromCard(card, overrides = {}) {
    if (!card) return null;
    return {
      id: String(card.id),
      name: String(overrides.name ?? card.name ?? '').trim(),
      type: (String(overrides.type ?? card.type ?? '') === 'weaken') ? 'weaken' : 'enhance',
      cost: clampInt(overrides.cost ?? card.cost ?? 0, 0, 99),
      image: String(overrides.image ?? card.image ?? '').trim(),
      description: String(overrides.description ?? card.description ?? '').trim(),
      order: (overrides.order == null)
        ? (Number.isFinite(+card.order) ? +card.order : null)
        : clampInt(overrides.order, 0, 9999)
    };
  }

  function openCardsExactOrderModal() {
    if (!isAdminUser()) return;

    const lines = STATE.cards
      .slice()
      .sort((a, b) => {
        const ao = Number.isFinite(+a.order) ? +a.order : null;
        const bo = Number.isFinite(+b.order) ? +b.order : null;
        if (ao != null && bo != null) return ao - bo;
        if (ao != null) return -1;
        if (bo != null) return 1;
        return a.name.localeCompare(b.name);
      })
      .map(c => `${c.name}`)
      .join('\n');

    pvpShowModal('Set exact order', () => {
      const hint = el('div', { class: 'pvp-muted', style: 'margin-bottom:10px' },
        'One per line. Use card names (or IDs).'
      );
      const ta = el('textarea', {
        class: 'pvp-textarea',
        style: 'min-height:320px;width:100%;white-space:pre-wrap;overflow:auto',
        value: lines
      });

      ta.id = 'pvpExactOrderTa';
      return el('div', {}, hint, ta);
    }, async () => {
      const ta = document.getElementById('pvpExactOrderTa');
      const raw = String(ta?.value || '');
      const rows = raw
        .split(/\r?\n/)
        .map(x => x.split('#')[0].trim())
        .filter(Boolean);

      const idToCard = new Map(STATE.cards.map(c => [String(c.id), c]));
      const nameToCard = new Map(STATE.cards.map(c => [String(c.name).toLowerCase(), c]));

      const seen = new Set();
      const ordered = [];
      for (const r0 of rows) {
        const r = String(r0);
        const card = idToCard.get(r) || nameToCard.get(r.toLowerCase());
        if (!card) continue;
        if (seen.has(card.id)) continue;
        seen.add(card.id);
        ordered.push(card);
      }

      if (!ordered.length) {
        toast('No valid cards found in the list.', 'warn', 1600);
        pvpHideModal();
        return;
      }

      for (let i = 0; i < ordered.length; i++) {
        const c = ordered[i];
        const item = buildAdminItemFromCard(c, { order: i + 1 });
        try {
          await fetchJson('/api/admin/pvp/cards', {
            method: 'POST',
            body: JSON.stringify({ action: 'update', item })
          });
        } catch (e) {
          console.warn('[pvp] set order update failed', e);
        }
      }

      await loadCards();
      toast('Order saved.', 'ok', 1200);
      pvpHideModal();
      render();
    }, 'SAVE');
  }

  function renderAdmin(root) {
    const panel = el('div', { class: 'pvp-panel' });
    panel.append(el('div', { class: 'pvp-panel-hd' },
      el('div', { class: 'pvp-row' },
        el('div', { style: 'font-weight:950' }, 'Admin'),
        el('div', { class: 'pvp-muted' }, isAdminUser() ? 'Admin mode' : 'Admin only')
      )
    ));

    const section = el('div', { class: 'pvp-section' });

    if (!isAdminUser()) {
      section.append(el('div', { class: 'pvp-block' },
        el('div', { class: 'pvp-muted' }, 'This tab is admin-only.')
      ));
      panel.append(section);
      root.append(panel);
      return;
    }

    const isMob = !!(window.matchMedia && window.matchMedia('(max-width: 520px)').matches);

    // LEFT: Existing cards
    const left = el('div', { class: 'pvp-block' },
      el('div', { class: 'pvp-blockHd' },
        el('div', { class: 'pvp-blockTitle' }, 'Existing cards'),
        el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' },
          el('button', { class: 'pvp-smallBtn', onclick: () => openCardsExactOrderModal() }, 'Set exact order'),
          el('button', { class: 'pvp-smallBtn', onclick: () => { resetEditor(); render(); } }, 'New')
        )
      )
    );

    const list = el('div', { class: 'pvp-adminList' });
    for (const c of STATE.cards) {
      list.append(el('div', {
        class: `pvp-adminItem ${c.type === 'weaken' ? 'wea' : 'enh'}`,
        onclick: () => { setEditorFromCard(c); render(); }
      },
        el('img', { class: 'pvp-ava', src: c.image || '', alt: c.name }),
        el('div', { style: 'display:flex;flex-direction:column;gap:2px;min-width:0' },
          el('div', { class: 'pvp-hName', title: c.name }, c.name),
          el('div', { class: 'pvp-muted', style: 'font-size:12px;font-weight:900' }, `${c.type} • cost ${c.cost}`)
        )
      ));
    }
    left.append(list);

    // RIGHT: Editor
    const right = el('div', { class: 'pvp-block' });

    // On mobile: move actions to sticky bottom
    const headerActions = isMob ? el('div', { style: 'display:none' }) : el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' },
      STATE.editor.mode === 'edit'
        ? el('button', {
            class: 'pvp-smallBtn',
            onclick: async () => {
              const target = getCardById(STATE.editor.originalId);
              if (!target) return;
              await adminSaveCard('remove', { id: target.id });
              resetEditor();
              render();
            }
          }, 'Remove')
        : null,
      el('button', {
        class: 'pvp-smallBtn primary',
        onclick: async () => {
          const item = {
            id: STATE.editor.mode === 'edit' ? STATE.editor.originalId : safeId('pvp'),
            name: String(STATE.editor.name || '').trim(),
            type: STATE.editor.type,
            cost: clampInt(STATE.editor.cost, 0, 99),
            image: String(STATE.editor.image || '').trim(),
            description: String(STATE.editor.description || '').trim(),
            order: (STATE.editor.order == null || STATE.editor.order === '') ? null : clampInt(STATE.editor.order, 0, 9999)
          };
          if (!item.name) return toast('Name is required.', 'warn', 1400);
          await adminSaveCard(STATE.editor.mode === 'edit' ? 'update' : 'add', item);
          if (STATE.editor.mode !== 'edit') resetEditor();
          render();
        }
      }, 'Save')
    );

    right.append(el('div', { class: 'pvp-blockHd' },
      el('div', { class: 'pvp-blockTitle', style: 'padding:10px 0' }, STATE.editor.mode === 'edit' ? 'Edit card' : 'Add new card'),
      headerActions
    ));

    const form = el('div', { class: 'pvp-form' });
    let refreshPreview = () => {};

    form.append(
      el('div', { class: 'pvp-field' },
        el('div', { class: 'pvp-label' }, 'Name'),
        el('input', {
          class: 'pvp-input pvp-inputBig',
          placeholder: 'Demolish',
          value: STATE.editor.name,
          oninput: (e) => { STATE.editor.name = e.target.value; refreshPreview(); }
        })
      ),
      el('div', { class: 'pvp-field' },
        el('div', { class: 'pvp-label' }, 'Required Tactic Points'),
        el('input', {
          class: 'pvp-input pvp-inputBig',
          type: 'number',
          min: '0',
          max: '99',
          placeholder: '2',
          value: String(STATE.editor.cost ?? 1),
          oninput: (e) => { STATE.editor.cost = clampInt(e.target.value, 0, 99); refreshPreview(); }
        })
      ),
      el('div', { class: 'pvp-field' },
        el('div', { class: 'pvp-label' }, 'Order (optional)'),
        el('input', {
          class: 'pvp-input pvp-inputBig',
          type: 'number',
          min: '0',
          max: '9999',
          placeholder: '1',
          value: (STATE.editor.order == null ? '' : String(STATE.editor.order)),
          oninput: (e) => { STATE.editor.order = (e.target.value === '' ? null : clampInt(e.target.value, 0, 9999)); refreshPreview(); }
        })
      ),
      el('div', { class: 'pvp-field' },
        el('div', { class: 'pvp-label' }, 'Type'),
        (() => {
          const sel = el('select', {
            class: 'pvp-select',
            onchange: (e) => { STATE.editor.type = e.target.value; refreshPreview(); }
          },
            el('option', { value: 'enhance', selected: STATE.editor.type === 'enhance' }, 'Enhance'),
            el('option', { value: 'weaken', selected: STATE.editor.type === 'weaken' }, 'Weaken')
          );
          sel.value = STATE.editor.type;
          return sel;
        })()
      ),
      el('div', { class: 'pvp-field' },
        el('div', { class: 'pvp-label' }, 'Image URL'),
        el('input', {
          class: 'pvp-input',
          placeholder: 'https://…',
          value: STATE.editor.image,
          oninput: (e) => { STATE.editor.image = e.target.value; refreshPreview(); }
        })
      )
    );

    const descField = el('div', { class: 'pvp-field', style: 'grid-column:1 / -1' });
    const ta = el('textarea', {
      class: 'pvp-textarea',
      value: STATE.editor.description,
      oninput: (e) => { STATE.editor.description = e.target.value; refreshPreview(); }
    });
    descField.append(
      el('div', { class: 'pvp-label' }, 'Description'),
      el('div', { class: 'pvp-toolbar' },
        el('button', { class: 'pvp-tool gold', type: 'button', onclick: () => applyWrapTag(ta, '[g]', '[/g]') }, '#ffe37f'),
        el('button', { class: 'pvp-tool white', type: 'button', onclick: () => applyWrapTag(ta, '[w]', '[/w]') }, 'White'),
        el('button', {
          class: 'pvp-tool', type: 'button',
          onclick: () => {
            const tpl = `Required Tactic Points: [w]${clampInt(STATE.editor.cost, 0, 99)}[/w]`;
            const pos = ta.selectionStart || ta.value.length;
            ta.value = ta.value.slice(0, pos) + tpl + ta.value.slice(pos);
            ta.dispatchEvent(new Event('input'));
            ta.focus();
          }
        }, 'Insert template')
      ),
      ta
    );
    form.append(descField);

    const pvArtHost = el('div', {});
    const pvTitle = el('div', { class: 'pvp-detailTitle' }, '—');
    const pvCostX = el('span', { class: 'pvp-req-x' }, '0');
    const pvType = el('div', { class: 'pvp-typeBadge enh' }, 'Enhance');
    const pvDesc = el('div', { class: 'pvp-desc', style: 'margin-top:10px' });

    const preview = el('div', { class: 'pvp-previewBox', style: 'grid-column:1 / -1' },
      el('div', { class: 'pvp-muted', style: 'font-weight:950;margin-bottom:8px' }, 'Preview'),
      el('div', { class: 'pvp-layout', style: 'grid-template-columns: 240px 1fr; gap:12px' },
        pvArtHost,
        el('div', {},
          pvTitle,
          el('div', { class: 'pvp-req' },
            el('span', { class: 'pvp-req-label' }, 'Required Tactic Points'),
            pvCostX
          ),
          pvType,
          pvDesc
        )
      )
    );

    refreshPreview = () => {
      const name = String(STATE.editor.name || '').trim();
      const cost = clampInt(STATE.editor.cost, 0, 99);
      const type = (String(STATE.editor.type || '') === 'weaken') ? 'weaken' : 'enhance';
      const image = String(STATE.editor.image || '').trim();
      pvArtHost.innerHTML = '';
      pvArtHost.append(renderCardArt({ name: name || 'Preview', type, cost, image }, 'preview'));
      pvTitle.textContent = name || '—';
      pvCostX.textContent = String(cost);
      pvType.className = `pvp-typeBadge ${type === 'enhance' ? 'enh' : 'wea'}`;
      pvType.textContent = type === 'enhance' ? 'Enhance' : 'Weaken';
      pvDesc.innerHTML = renderDescToHtml(String(STATE.editor.description || ''));
    };

    refreshPreview();
    right.append(form, preview);

    // MOBILE sticky actions
    if (isMob) {
      right.append(el('div', { class: 'pvp-stickyActions' },
        el('button', { class: 'pvp-smallBtn', type: 'button', onclick: () => { resetEditor(); render(); } }, 'New'),
        (STATE.editor.mode === 'edit'
          ? el('button', {
              class: 'pvp-smallBtn',
              type: 'button',
              onclick: async () => {
                const target = getCardById(STATE.editor.originalId);
                if (!target) return;
                await adminSaveCard('remove', { id: target.id });
                resetEditor();
                render();
              }
            }, 'Remove')
          : null),
        el('button', {
          class: 'pvp-smallBtn primary',
          type: 'button',
          onclick: async () => {
            const item = {
              id: STATE.editor.mode === 'edit' ? STATE.editor.originalId : safeId('pvp'),
              name: String(STATE.editor.name || '').trim(),
              type: STATE.editor.type,
              cost: clampInt(STATE.editor.cost, 0, 99),
              image: String(STATE.editor.image || '').trim(),
              description: String(STATE.editor.description || '').trim(),
              order: (STATE.editor.order == null || STATE.editor.order === '') ? null : clampInt(STATE.editor.order, 0, 9999)
            };
            if (!item.name) return toast('Name is required.', 'warn', 1400);
            await adminSaveCard(STATE.editor.mode === 'edit' ? 'update' : 'add', item);
            if (STATE.editor.mode !== 'edit') resetEditor();
            render();
          }
        }, 'Save')
      ));
    }

    // Layout: desktop = 2 columns, mobile = accordion
    if (isMob) {
      const makeAcc = (title, subtitle, body, open = false) => {
        const item = el('div', { class: `pvp-accItem ${open ? 'open' : ''}` });
        const btn = el('button', { class: 'pvp-accBtn', type: 'button' },
          el('div', { style: 'display:flex;flex-direction:column;gap:2px;text-align:left' },
            el('div', { class: 't' }, title),
            el('div', { class: 's' }, subtitle)
          ),
          el('div', { style: 'font-weight:950;opacity:.75' }, '▾')
        );
        const bd = el('div', { class: 'pvp-accBody' }, body);
        btn.onclick = () => item.classList.toggle('open');
        item.append(btn, bd);
        return item;
      };

      const acc = el('div', { class: 'pvp-acc' });
      acc.append(
        makeAcc('Existing cards', 'Tap a card to edit', left, true),
        makeAcc('Editor', 'Add or edit a card', right, true)
      );
      section.append(acc);
    } else {
      const layout = el('div', { class: 'pvp-adminLayout' });
      layout.append(left, right);
      section.append(layout);
    }

    panel.append(section);
    root.append(panel);
  }

  // --------------------------
  // Header + Tabs
  // --------------------------
  function setSubtab(t) {
    STATE.subtab = t;
    try { localStorage.setItem(LS_SUBTAB_KEY, t); } catch {}
  }
  function loadSubtab() {
    try {
      const t = localStorage.getItem(LS_SUBTAB_KEY);
      if (t === 'cards' || t === 'teams' || t === 'admin') STATE.subtab = t;
      if (t === 'add') STATE.subtab = 'admin';
    } catch {}
    if (STATE.subtab === 'teams' && !isLoggedIn()) setSubtab('cards');
  }

  function renderHeader(root) {
    // Title (match Hunter.js header style)
    const top = el('div', { class: 'flex items-center justify-between gap-3 mb-4' });

    top.append(
      el('div', { class: 'min-w-0' },
        el('div', { class: 'text-2xl font-extrabold text-yellow-400 leading-tight' }, 'PvP'),
        el('div', { class: 'text-sm text-slate-100' }, 'Builds and your PvP list')
      )
    );

    root.append(top);

    // Full-width tabs (match Hunter.js tabs style)
    const tabs = [
      { key: 'cards', label: 'Cards' }
    ];
    if (isLoggedIn()) tabs.push({ key: 'teams', label: 'My list' });
    if (isAdminTabVisible()) tabs.push({ key: 'admin', label: 'Admin' });

    const cols = tabs.length;
    const gridCols = cols === 3 ? 'grid-cols-3' : cols === 2 ? 'grid-cols-2' : 'grid-cols-1';
    const bar = el('div', { class: 'grid ' + gridCols + ' gap-2 mb-4' });

    const btn = (key, label) => {
      const active = STATE.subtab === key;
      const b = el(
        'button',
        {
          class:
            'h-10 rounded-xl border text-base font-semibold transition-colors ' +
            (active
              ? 'bg-yellow-400 text-black shadow border-yellow-300'
              : 'bg-glass text-slate-200 hover:bg-slate-800/50 border-slate-700/60')
        },
        label
      );

      b.addEventListener('click', () => {
        if (STATE.subtab === key) return;
        setSubtab(key);
        render();
      });

      return b;
    };

    if (STATE.subtab === 'admin' && !isAdminTabVisible()) setSubtab('cards');
    if (STATE.subtab === 'teams' && !isLoggedIn()) setSubtab('cards');
    for (const t of tabs) bar.append(btn(t.key, t.label));
    root.append(bar);
  }

  // --------------------------
  // Render
  // --------------------------
  function render() {
    try { window.forceDarkMode?.(); } catch {}
    injectLocalStyles();
    ensureToastHost();

    const content = qs('#content');
    if (!content) return;
    content.innerHTML = '';

    if (STATE.subtab === 'admin' && !isAdminTabVisible()) {
      STATE.subtab = 'cards';
      try { localStorage.setItem(LS_SUBTAB_KEY, 'cards'); } catch {}
    }
    if (STATE.subtab === 'teams' && !isLoggedIn()) {
      STATE.subtab = 'cards';
      try { localStorage.setItem(LS_SUBTAB_KEY, 'cards'); } catch {}
    }

    // ✅ padding like Hunter.js
    const shell = el('div', {
      class: 'w-full mx-auto px-3 sm:px-6 py-6',
      'data-sla-page': 'pvp'
    });

    // keep PvP-specific max-width
    const wrap = el('div', { class: 'pvp-shell' });
    shell.append(wrap);

    renderHeader(wrap);

    if (STATE.loading) {
      wrap.append(el('div', { class: 'p-6 text-center text-slate-100' }, 'Loading…'));
      content.append(shell);
      return;
    }
    if (STATE.error) {
      wrap.append(el('div', { class: 'p-6 text-center text-red-600 dark:text-red-400 font-semibold' }, STATE.error));
      content.append(shell);
      return;
    }

    if (STATE.subtab === 'cards') renderCards(wrap);
    else if (STATE.subtab === 'teams') renderTeams(wrap);
    else renderAdmin(wrap);

    content.append(shell);
  }

  // --------------------------
  // Mount
  // --------------------------
  window.__pvp_mount = async function __pvp_mount() {
    injectLocalStyles();
    ensureToastHost();
    loadSubtab();

    STATE.loading = true;
    STATE.error = null;
    render();

    try {
      await Promise.all([loadCards(), loadHuntersCatalog(), loadTeams()]);
    } catch (e) {
      console.warn('[pvp] mount load error', e);
      STATE.error = 'Failed to load PvP data.';
    }

    STATE.loading = false;
    render();
  };
})();
