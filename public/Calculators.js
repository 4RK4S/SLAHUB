'use strict';

/**
 * Calculators.js — Calculators page module
 * Exposes: window.__calculators_mount()
 *
 * ✅ No Tampermonkey / GM_*.
 * ✅ Precision + Defense Pen + Admin config editor.
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

  function clampInt(v, min, max, fallback = min) {
    const n = Number.isFinite(+v) ? parseInt(v, 10) : fallback;
    return Math.max(min, Math.min(max, n));
  }
  function clampNum(v, min, max, fallback = min) {
    const n = Number.isFinite(+v) ? +v : fallback;
    return Math.max(min, Math.min(max, n));
  }

  // --------------------------
  // Admin helpers (hide Admin tab toggle from /admin)
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


  async function fetchJson(u, opt) {
    const r = await fetch(u, opt);
    const j = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, data: j };
  }

  function formatInt(n) {
    if (!Number.isFinite(n)) return '-';
    return Math.round(n).toLocaleString('en-US');
  }
  function formatPct(n, digits = 2) {
    if (!Number.isFinite(n)) return '-';
    return `${n.toFixed(digits)}%`;
  }

  // Preserve focus/caret + prevent scroll jump on re-render
  function captureFocusState() {
    const a = document.activeElement;
    const state = {
      had: false,
      id: a?.id || '',
      name: a?.getAttribute?.('name') || '',
      dataKey: a?.getAttribute?.('data-key') || '',
      cls: a?.className || '',
      tag: a?.tagName || '',
      selStart: null,
      selEnd: null,
      scrollY: window.scrollY || 0
    };
    if (!a) return state;

    const isInput = a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT';
    if (!isInput) return state;

    state.had = true;
    try {
      state.selStart = a.selectionStart;
      state.selEnd = a.selectionEnd;
    } catch {}
    return state;
  }

  function restoreFocusState(st) {
    try {
      window.scrollTo({ top: st.scrollY, left: 0, behavior: 'instant' });
    } catch {
      window.scrollTo(0, st.scrollY || 0);
    }

    if (!st?.had) return;

    const content = qs('#content');
    if (!content) return;

    let target =
      (st.id && qs(`#${CSS.escape(st.id)}`, content)) ||
      (st.dataKey && qs(`[data-key="${CSS.escape(st.dataKey)}"]`, content)) ||
      (st.name && qs(`[name="${CSS.escape(st.name)}"]`, content));

    if (!target && st.cls) {
      const parts = String(st.cls).split(/\s+/).filter(Boolean);
      for (const c of parts) {
        const t = qs(`.${CSS.escape(c)}`, content);
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) { target = t; break; }
      }
    }

    if (!target) return;

    try { target.focus({ preventScroll: true }); } catch {}
    try {
      if (typeof st.selStart === 'number' && typeof st.selEnd === 'number' && target.setSelectionRange) {
        target.setSelectionRange(st.selStart, st.selEnd);
      }
    } catch {}
  }

  // --------------------------
  // CSS (scoped)
  // --------------------------
  const SCOPE = '#content [data-sla-page="calculators"]';

  function scopeCss(css, scope) {
    const scopeChunk = (chunk) => chunk.replace(/(^|})\s*([^{@}][^{]*)\{/g, (m, brace, selectorPart) => {
      const selectors = selectorPart
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)
        .map(sel => {
          if (sel.includes('[data-sla-page="calculators"]')) return sel;
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
      if (!m) { out += scopeChunk(rest); break; }

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

  function injectStyles() {
    const STYLE_ID = 'sla-calculators-style';
    const rawCss = `
      .calc-shell{max-width:1280px;margin:0 auto}
      .calc-tabs{display:grid;gap:10px;margin-bottom:14px}
      .calc-tabs.two{grid-template-columns:repeat(2,1fr)}
      .calc-tabs.three{grid-template-columns:repeat(3,1fr)}
      .tab-btn{
        height:40px;border-radius:12px;border:1px solid rgba(255,255,255,.10);
        background:rgba(15,23,42,.35);color:#e2e8f0;font-weight:800;cursor:pointer;
        transition:transform .06s ease, background .12s ease, box-shadow .12s ease;
      }
      .tab-btn:hover{transform:translateY(-1px);background:rgba(255,255,255,.10);color:#fff}
      .tab-btn:focus-visible{outline:none;box-shadow:0 0 0 2px rgba(250,204,21,.45)}
      .tab-btn:disabled{opacity:.5;cursor:not-allowed}
      .tab-btn.active{
        background:rgba(250,204,21,.95);color:#0f172a;border-color:rgba(250,204,21,.65)
      }

      .calc-layout{
        display:grid;
        grid-template-columns:minmax(0,1.45fr) minmax(360px,.85fr);
        gap:18px;
        align-items:start;
      }
      .calc-left,.calc-right{min-width:0}
      .calc-right{position:sticky;top:90px}
      .card{
        border-radius:16px;border:1px solid rgba(255,255,255,.10);
        background:linear-gradient(180deg,rgba(15,23,42,.30),rgba(2,6,23,.14));
        padding:22px;box-shadow:0 18px 40px rgba(0,0,0,.14);
      }
      .card.hd{padding:22px}
      .innerCard{
        border-radius:16px;border:1px solid rgba(255,255,255,.10);
        background:rgba(15,23,42,.25);padding:16px;min-width:0;
      }
      .innerCard:hover,.checkItem:hover{border-color:rgba(250,204,21,.22);background:rgba(15,23,42,.34)}
      .title{
        font-weight:950;color:#e2e8f0;font-size:16px;display:flex;align-items:center;gap:10px;
        text-transform:uppercase;letter-spacing:0;
      }
      .title:before{content:"";width:16px;height:16px;display:inline-block;background:#facc15;border-radius:4px;box-shadow:0 0 18px rgba(250,204,21,.25)}
      .sub{font-size:13px;color:rgba(226,232,240,.78);font-weight:700;margin-top:6px}

      .grid2{display:grid;gap:12px;grid-template-columns:repeat(2,minmax(0,1fr))}
      .gridAuto{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(240px,1fr))}
      .topInputs{display:grid;gap:16px;grid-template-columns:repeat(2,minmax(0,1fr));margin-top:22px;align-items:start}
      .precisionPanels{display:grid;gap:16px;grid-template-columns:repeat(2,minmax(0,1fr));margin-top:22px}
      .fieldStack{display:grid;gap:8px;min-width:0}
      .calcTopField{display:grid;grid-template-rows:auto 44px auto;gap:8px;align-content:start;min-width:0}
      .gemsCompactRow{display:flex;align-items:center;gap:8px;flex-wrap:nowrap;min-width:0}
      .gemsManualInput{width:96px;flex:0 0 96px;text-align:center}
      .gemLoadoutPanel{margin:0}
      .useGemsBtn{
        height:44px;display:inline-flex;align-items:center;justify-content:center;gap:8px;
        border-radius:8px;border:1px solid rgba(255,255,255,.10);
        background:rgba(15,23,42,.25);color:#e2e8f0;font-weight:900;font-size:13px;
        padding:0 10px;cursor:pointer;white-space:nowrap;flex:0 0 auto;
        transition:background .12s ease,border-color .12s ease,box-shadow .12s ease;
      }
      .useGemsBtn:hover{border-color:rgba(250,204,21,.28);background:rgba(15,23,42,.38)}
      .useGemsBtn.isActive{border-color:rgba(250,204,21,.45);background:rgba(250,204,21,.14);color:#facc15}
      .useGemsBtn input{width:16px;height:16px;accent-color:#facc15}
      .ownedMiniPill{
        width:44px;height:44px;display:inline-flex;align-items:center;justify-content:center;
        border-radius:8px;border:1px solid rgba(255,255,255,.10);
        background:rgba(2,6,23,.14);color:#facc15;font-weight:950;font-size:13px;
        padding:0;white-space:nowrap;cursor:pointer;flex:0 0 44px;
        transition:background .12s ease,border-color .12s ease,box-shadow .12s ease;
      }
      .ownedMiniPill:hover{border-color:rgba(250,204,21,.38);background:rgba(250,204,21,.12)}
      .gemsHint{margin-top:6px}
      .accentLabel{color:#facc15;text-transform:uppercase}

      .inRow{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
      .label{font-weight:900;color:#e2e8f0;font-size:13px}
      .hint{font-size:12px;color:rgba(148,163,184,.92);font-weight:700;margin-top:6px}
      .input{
        width:100%;height:44px;border-radius:8px;border:1px solid rgba(255,255,255,.10);
        background:rgba(2,6,23,.14);color:#e2e8f0;font-weight:850;outline:none;
        padding:0 14px;min-width:0;line-height:44px;
        transition:box-shadow .12s ease, background .12s ease, border-color .12s ease;
      }
      .input:hover{border-color:rgba(255,255,255,.18)}
      .input:focus{border-color:rgba(250,204,21,.45);box-shadow:0 0 0 3px rgba(250,204,21,.14)}
      .select{height:44px;background-color:rgba(15,23,42,.95);color:#e2e8f0}
      .select option{background:#111827;color:#e2e8f0}
      .inputGroup{display:grid;grid-template-columns:54px minmax(0,1fr);align-items:center}
      .inputGroup.three{grid-template-columns:54px minmax(0,1fr) 44px}
      .inputIcon,.inputSuffix{
        height:44px;display:flex;align-items:center;justify-content:center;
        border:1px solid rgba(250,204,21,.25);background:rgba(250,204,21,.10);
        color:#facc15;font-weight:950;
      }
      .inputIcon{border-radius:8px 0 0 8px;border-right:0}
      .inputSuffix{border-radius:0 8px 8px 0;border-left:0}
      .inputGroup .input{border-radius:0 8px 8px 0}
      .inputGroup.three .input{border-radius:0}
      .btn{
        height:40px;border-radius:12px;border:1px solid rgba(255,255,255,.10);
        background:rgba(15,23,42,.35);color:#e2e8f0;font-weight:800;cursor:pointer;
        padding:0 14px;
        transition:background .12s ease, box-shadow .12s ease, transform .06s ease;
      }
      .btn:hover{background:rgba(255,255,255,.10);color:#fff;transform:translateY(-1px)}
      .btn:focus-visible{outline:none;box-shadow:0 0 0 2px rgba(250,204,21,.45)}
      .btn:disabled{opacity:.5;cursor:not-allowed;transform:none}
      .btn.primary{
        background:rgba(250,204,21,.95);color:#0f172a;border-color:rgba(250,204,21,.65)
      }
      .btn.primary:hover{background:rgba(250,204,21,1);filter:brightness(1.02)}
      .pill{
        display:inline-flex;align-items:center;gap:8px;
        border-radius:8px;border:1px solid rgba(255,255,255,.10);
        padding:9px 10px;background:rgba(15,23,42,.25);
        color:#e2e8f0;font-weight:800;font-size:13px;
      }
      .pill.center{margin-left:auto;margin-right:auto;justify-content:center;min-width:110px}

      .ownedPill{min-width:110px;justify-content:space-between;padding-left:12px;padding-right:12px;white-space:nowrap}
      .ownedPill .ownedLbl{opacity:.95}
      .ownedPill .ownedVal{
        display:inline-flex;align-items:center;justify-content:center;
        min-width:28px;padding:2px 8px;border-radius:999px;
        background:rgba(148,163,184,.12);
        border:1px solid rgba(148,163,184,.22);
        font-weight:950;
      }
      .toggle{
        display:flex;align-items:center;gap:10px;
        padding:10px 12px;border-radius:12px;border:1px solid rgba(148,163,184,.18);
        background:rgba(15,23,42,.25);
      }
      .toggle input{width:18px;height:18px}
      .toggle .clickText{cursor:pointer}
      .toggle .clickText:hover{opacity:.9;text-decoration:underline}

      .resultsBox{
        border-radius:16px;border:1px solid rgba(255,255,255,.10);
        background:rgba(15,23,42,.25);
        padding:16px;
      }
      .heroBox{
        border-color:rgba(250,204,21,.45);
        background:linear-gradient(135deg,rgba(250,204,21,.14),rgba(15,23,42,.25));
      }
      .flatBox{background:rgba(255,255,255,.045)}
      .resultsTitle{display:grid;gap:10px}
      .resultsTitle .left{display:grid;gap:2px}
      .resultsTitle .big{font-weight:950;color:rgba(148,163,184,.95);font-size:11px;text-transform:uppercase}
      .resultsTitle .small{font-size:12px;color:rgba(226,232,240,.78);font-weight:800}
      .resultsTitle .value{
        font-weight:950;font-size:42px;line-height:1;color:#fff;
        font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;letter-spacing:0;
      }
      .metricGrid{display:grid;gap:10px;margin-top:14px}
      .metricBox{
        display:flex;align-items:center;justify-content:space-between;gap:12px;
        border-radius:12px;border:1px solid rgba(255,255,255,.08);
        background:rgba(2,6,23,.14);padding:12px 14px;
      }
      .metricBox span,.kvRow span{color:rgba(148,163,184,.95);font-weight:850;font-size:12px}
      .metricBox strong,.kvRow strong{color:#e2e8f0;font-weight:950}
      .kv{display:grid;gap:8px;margin-top:10px}
      .kvRow{display:flex;justify-content:space-between;align-items:center;gap:10px;font-weight:900;color:#e2e8f0;min-height:28px}
      .kvRow.emphasis{
        margin-top:6px;border-radius:10px;border:1px solid rgba(250,204,21,.40);
        background:rgba(250,204,21,.14);padding:10px 12px;
      }
      .kvRow.emphasis span,.kvRow.emphasis strong,.kvRow.emphasis div{color:#facc15}

      .sectionHead{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px}
      .sectionHead .h{font-weight:950;color:#e2e8f0;text-transform:uppercase;font-size:13px}
      .muted{color:rgba(148,163,184,.95);font-weight:800;font-size:12px}
      .badgeOk{color:rgba(34,197,94,.95);font-weight:950}
      .badgeWarn{color:#facc15;font-weight:950}

      .bonusSources{display:grid;gap:14px;grid-template-columns:repeat(2,minmax(0,1fr));margin-top:14px}
      .bonusGroup{border-radius:14px;border:1px solid rgba(255,255,255,.10);background:rgba(15,23,42,.25);padding:14px}
      .bonusGroupTitle{font-weight:950;color:#e2e8f0;text-transform:uppercase;font-size:12px;margin-bottom:12px}
      .bonusList{display:grid;gap:10px}
      .bonusGrid{display:grid;gap:10px;grid-template-columns:repeat(2,minmax(0,1fr))}
      .checkItem{
        display:grid;gap:8px;
        border:1px solid rgba(148,163,184,.16);
        background:rgba(2,6,23,.14);
        border-radius:10px;padding:10px 12px;
        cursor:pointer;
        transition:background .12s ease,border-color .12s ease,box-shadow .12s ease;
      }
      .checkItem:hover{border-color:rgba(250,204,21,.26);background:rgba(15,23,42,.38)}
      .checkItem.isActive{
        border-color:rgba(250,204,21,.38);
        background:linear-gradient(135deg,rgba(250,204,21,.10),rgba(15,23,42,.34));
        box-shadow:inset 0 0 0 1px rgba(34,197,94,.10);
      }
      .checkTop{display:flex;align-items:center;gap:10px;justify-content:space-between;min-height:26px;cursor:pointer}
      .checkItem .left{display:flex;align-items:center;gap:10px;min-width:0}
      .checkItem .nm{font-weight:900;color:#e2e8f0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer}
      .checkItem .val{font-weight:950;color:#facc15;flex:0 0 auto;font-size:12px;cursor:pointer}
      .switch{position:relative;display:inline-flex;width:30px;height:16px;flex:0 0 auto}
      .switch input{position:absolute;opacity:0;inset:0;margin:0}
      .switch span{
        width:30px;height:16px;border-radius:999px;border:1px solid rgba(148,163,184,.28);
        background:rgba(15,23,42,.9);transition:background .12s ease,border-color .12s ease;
      }
      .switch span:after{
        content:"";position:absolute;width:8px;height:8px;border-radius:999px;left:4px;top:4px;
        background:rgba(148,163,184,.9);transition:transform .12s ease,background .12s ease;
      }
      .switch input:checked + span{background:rgba(34,197,94,.95);border-color:rgba(34,197,94,.95)}
      .switch input:checked + span:after{transform:translateX(14px);background:#fff}
      .switch input:focus-visible + span{box-shadow:0 0 0 3px rgba(250,204,21,.18)}
      .unitWrap{display:grid;gap:6px;padding-left:44px;cursor:default}
      .unitWrap *{cursor:default}
      .unitLabel{margin-top:0}
      .inlineNum{width:96px;height:34px;text-align:left;cursor:text}

      .bdBox{
        border-radius:14px;border:1px solid rgba(148,163,184,.16);
        background:rgba(2,6,23,.10);
        padding:14px;display:grid;gap:10px;
      }
      .bdGrid{display:grid;gap:10px}
      .bdItem{display:flex;align-items:center;justify-content:space-between;gap:14px}
      .bdLbl{color:rgba(148,163,184,.95);font-weight:900;font-size:12px}
      .bdVal{color:#e2e8f0;font-weight:950;font-size:13px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
      .bdVal.green{color:rgba(34,197,94,.95)}
      .bdVal.yellow{color:#facc15}

      .adminWrap{display:grid;gap:12px}
      .adminSec{
        border-radius:16px;border:1px solid rgba(148,163,184,.18);
        background:rgba(15,23,42,.18);
        padding:14px;
      }
      .adminSecTitle{font-weight:950;color:#e2e8f0;margin-bottom:10px}
      .adminRow{display:grid;gap:8px;grid-template-columns:260px 1fr;align-items:center}
      .adminRow .k{color:rgba(148,163,184,.95);font-weight:900;font-size:12px}
      .adminRow .v{min-width:0}
      .adminActions{display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap}

      .modeRow{
        display:grid;
        grid-template-columns: 160px 1fr 140px 90px;
        gap:10px;
        align-items:center;
        margin-top:8px;
      }
      .modeRow .smallInput{width:100%}
      .modeHead{
        display:grid;
        grid-template-columns: 160px 1fr 140px 90px;
        gap:10px;
        margin-top:10px;
        opacity:.85;
        font-size:12px;
        font-weight:900;
        color:rgba(148,163,184,.95);
      }
      .danger{background:rgba(239,68,68,.15);border-color:rgba(239,68,68,.35)}
      .danger:hover{filter:brightness(1.05)}

      @media (max-width: 1100px){
        .calc-layout{grid-template-columns:1fr}
        .calc-right{position:static}
      }
      @media (max-width: 840px){
        .card,.card.hd{padding:16px}
        .grid2{grid-template-columns:1fr}
        .topInputs{grid-template-columns:1fr}
        .precisionPanels{grid-template-columns:1fr}
        .bonusSources{grid-template-columns:1fr}
        .bonusGrid{grid-template-columns:1fr}
        .bdGrid{grid-template-columns:1fr}
        .resultsTitle .value{font-size:34px}
        .gemsCompactRow{flex-wrap:wrap}
        .adminRow{grid-template-columns:1fr}
        .modeHead{grid-template-columns:1fr}
        .modeRow{grid-template-columns:1fr}
      }
    `;
    const css = scopeCss(rawCss, SCOPE);

    let s = document.getElementById('sla-calculators-style');
    if (!s) {
      s = document.createElement('style');
      s.id = 'sla-calculators-style';
      s.setAttribute('data-sla-module', 'calculators');
      document.head.appendChild(s);
    }
    if (s.textContent !== css) s.textContent = css;
    try { document.head.appendChild(s); } catch {}
  }

  // --------------------------
  // Default config
  // --------------------------
  const DEFAULT_CFG = {
    gems: {
      precisionPerGem: 1800,
      maxGemsFallback: 12
    },
    precision: {
      // ✅ editable modes (id + label + target)
      modes: [
        { id: 'gb', label: 'Guild Boss', target: 18700 },
        { id: 'hard_pod', label: 'Power of Calamity', target: 19400 }
      ],
      perceptionMax: 9999, // ✅ new setting (admin)
      weaponRarityBonus: { none: 0, r: 1250, sr: 2000, ssr: 4000 },
      hunterTrainingPoints: { none: 0, '1': 3065, '2': 6130, '3': 9195 },
      base: { sjw: 0, hunters: 12110 },
      perceptionTable: [
        [10,600],[15,895],[20,1190],[25,1480],[30,1770],[35,2055],[40,2340],[45,2620],[50,2900],[55,3175],
        [60,3450],[65,3720],[70,3990],[75,4255],[80,4520],[85,4780],[90,5040],[95,5295],[100,5550],[105,5800],
        [110,6050],[115,6298],[120,6547],[125,6795],[130,7042],[135,7288],[140,7535],[145,7780],[150,8025],
        [155,8268],[160,8512],[165,8755],[170,8997],[175,9238],[180,9480],[185,9720],[190,9960],[195,10198],
        [200,10437],[205,10675],[210,10912],[215,11148],[220,11385],[225,11620],[230,11855],[235,12088],[240,12322],
        [245,12555],[250,12787],[255,13018],[260,13250],[265,13480],[270,13710],[275,13938],[280,14167],[285,14395],
        [290,14622],[295,14848],[300,15075],[305,15300],[310,15525],[315,15748],[320,15972],[325,16195],[330,16417],
        [335,16638],[340,16860],[345,17080],[350,17300],[355,17518],[360,17737],[365,17955],[370,18172],[375,18388],
        [380,18605],[385,18820],[390,19035],[395,19248],[400,19462],[405,19675],[410,19887],[415,20098],[420,20310],
        [425,20520],[430,20730],[435,20938],[440,21147],[445,21355],[450,21562],[455,21768],[460,21975],[465,22180],
        [470,22385],[475,22588],[480,22792],[485,22995],[490,23197],[495,23398],[500,23600],[505,23800],[510,24000],
        [515,24198],[520,24397],[525,24595],[530,24792],[535,24988],[540,25185],[545,25380],[550,25575],[555,25768],
        [560,25962],[565,26155],[570,26347],[575,26538],[580,26730],[585,26920],[590,27110],[595,27298],[600,27487],
        [605,27675],[610,27862],[615,28050],[620,28237],[625,28423],[630,28610],[635,28794],[640,28979],[645,29162],
        [650,29346],[655,29527],[660,29709],[665,29888],[670,30068],[675,30245],[680,30423],[685,30598],[690,30773],
        [695,30946],[700,31118],[705,31288],[710,31458],[715,31625],[720,31791],[725,31955],[730,32119],[735,32279],
        [740,32439],[745,32595],[750,32752],[755,32904],[760,33057],[765,33205],[770,33353],[775,33497],[780,33641],
        [785,33780],[790,33919],[795,34052],[800,34186],[805,34314],[810,34443],[815,34565],[820,34687],[825,34803],
        [830,34920],[835,35029]
      ]
    },
    defpen: {
      bonuses: {
        emma: 7.77,
        gina: 4,
        esilPerFireUnit: 4,
        sianPerDarkUnit: 3,
        ennio: 16,
        knightKiller: 24,
        armed: 18,
        architectBluePoison: 20,
        beste: 18
      }
    }
  };

  const LS_CFG = 'sla.calculators.cfg.v3';

  function structuredCloneSafe(x) {
    try { return structuredClone(x); } catch { return JSON.parse(JSON.stringify(x)); }
  }

  function mergeDeep(base, patch) {
    if (!patch || typeof patch !== 'object') return base;
    for (const [k, v] of Object.entries(patch)) {
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        base[k] = mergeDeep(base[k] && typeof base[k] === 'object' ? base[k] : {}, v);
      } else {
        base[k] = v;
      }
    }
    return base;
  }

  function normalizeCfg(cfg) {
    // Back-compat: if older configs used modeTargets object
    if (cfg?.precision && !Array.isArray(cfg.precision.modes) && cfg.precision.modeTargets) {
      const mt = cfg.precision.modeTargets;
      cfg.precision.modes = [
        { id: 'gb', label: 'Guild Boss', target: +mt.gb || 18700 },
        { id: 'hard_pod', label: 'Power of Calamity', target: +mt.hard_pod || 19400 }
      ];
      delete cfg.precision.modeTargets;
    }
    if (!cfg?.precision?.perceptionMax) cfg.precision.perceptionMax = 9999;
    if (!cfg?.precision?.hunterTrainingPoints) cfg.precision.hunterTrainingPoints = { none: 0, '1': 3065, '2': 6130, '3': 9195 };
    if (cfg?.precision?.base?.hunters === 13010) cfg.precision.base.hunters = 12110;
    if (Array.isArray(cfg?.precision?.modes)) {
      cfg.precision.modes = cfg.precision.modes
        .filter(m => !(m?.id === 'valtair_hard' && +m.target === 29300))
        .map(m => {
          if (m?.id === 'gb' && (+m.target === 18700 || !Number.isFinite(+m.target))) return { ...m, label: 'Guild Boss', target: 18700 };
          if (m?.id === 'hard_pod' && (+m.target === 23423 || +m.target === 19400 || !Number.isFinite(+m.target))) return { ...m, label: 'Power of Calamity', target: 19400 };
          return m;
        });
    }
    if (cfg?.defpen?.bonuses && cfg.defpen.bonuses.architectBluePoison == null) cfg.defpen.bonuses.architectBluePoison = 20;
    return cfg;
  }

  function loadCfg() {
    try {
      const raw = localStorage.getItem(LS_CFG);
      if (!raw) return structuredCloneSafe(DEFAULT_CFG);
      const parsed = normalizeCfg(JSON.parse(raw));
      return mergeDeep(structuredCloneSafe(DEFAULT_CFG), parsed);
    } catch {
      return structuredCloneSafe(DEFAULT_CFG);
    }
  }
  function saveCfg(cfg) {
    localStorage.setItem(LS_CFG, JSON.stringify(cfg, null, 2));
  }

  // --------------------------
  // Precision interpolation helpers
  // --------------------------
  function precisionFromPerception(points, table) {
    const e = Array.isArray(table) ? table : DEFAULT_CFG.precision.perceptionTable;
    const i = Math.max(0, +points || 0);
    if (!e.length) return 0;

    if (i < e[0][0]) {
      const [n, o] = e[0], [s, c] = e[1] || e[0];
      const r = (c - o) / (s - n || 1);
      return Math.max(0, o + r * (i - n));
    }
    if (i >= e[e.length - 1][0]) {
      const [n, o] = e[e.length - 2] || e[e.length - 1];
      const [s, c] = e[e.length - 1];
      const r = (c - o) / (s - n || 1);
      return c + r * (i - s);
    }
    for (let n = 0; n < e.length - 1; n++) {
      const [o, s] = e[n], [c, r] = e[n + 1];
      if (i >= o && i <= c) {
        const P = (i - o) / (c - o || 1);
        return s + P * (r - s);
      }
    }
    return 0;
  }

  function perceptionNeededForPrecision(precision, table) {
    const e = Array.isArray(table) ? table : DEFAULT_CFG.precision.perceptionTable;
    const i = +precision;
    if (!Number.isFinite(i) || i <= 0 || !e.length) return 0;

    if (i < e[0][1]) {
      const [t, n] = e[0], [o, s] = e[1] || e[0];
      const c = (s - n) / (o - t || 1);
      return Math.max(0, Math.ceil(t + (i - n) / (c || 1)));
    }
    if (i >= e[e.length - 1][1]) {
      const [t, n] = e[e.length - 2] || e[e.length - 1];
      const [o, s] = e[e.length - 1];
      const c = (s - n) / (o - t || 1);
      return Math.ceil(o + (i - s) / (c || 1));
    }
    for (let t = 0; t < e.length - 1; t++) {
      const [n, o] = e[t], [s, c] = e[t + 1];
      if (i >= o && i <= c) {
        const r = (i - o) / (c - o || 1);
        return Math.ceil(n + r * (s - n));
      }
    }
    return 0;
  }

  // --------------------------
  // Gems helpers
  // --------------------------
  async function loadGemsMaxGem() {
    const out = await fetchJson(url('/api/public/gems-config'), { cache: 'no-store' });
    const maxGem = clampInt(out?.data?.maxGem ?? out?.data?.config?.maxGem, 1, 999, DEFAULT_CFG.gems.maxGemsFallback);
    return maxGem;
  }

  function sumPrecisionFromLoadout(loadoutObj) {
    let total = 0;
    if (!loadoutObj || typeof loadoutObj !== 'object') return 0;

    const pages = Object.values(loadoutObj);
    for (const page of pages) {
      if (!page || typeof page !== 'object') continue;
      const colors = Object.values(page);
      for (const arr of colors) {
        if (!Array.isArray(arr)) continue;
        for (const slot of arr) {
          const stat = String(slot?.stat || '').trim().toLowerCase();
          if (stat !== 'precision') continue;
          const c = Number.isFinite(+slot?.count) ? +slot.count : 1;
          total += c;
        }
      }
    }
    return total;
  }

  async function fetchMyPrecisionGemCount() {
    const out = await fetchJson(url('/api/gems-loadout'), { credentials: 'include', cache: 'no-store' });
    if (!out.ok) return null;

    const lo =
      out?.data?.loadout ||
      out?.data?.data?.loadout ||
      out?.data?.gemsLoadout ||
      out?.data?.gems?.loadout ||
      out?.data;

    const loadoutObj = (lo && typeof lo === 'object' && !Array.isArray(lo)) ? lo : null;
    if (!loadoutObj) return null;

    const count = sumPrecisionFromLoadout(loadoutObj);
    return Math.max(0, Math.round(count));
  }


  const LS_GEMS_OWNED_CACHE_KEY = 'sla_precision_gems_owned_cache';

  function readOwnedGemCache() {
    try {
      const raw = localStorage.getItem(LS_GEMS_OWNED_CACHE_KEY);
      const v = raw == null ? null : Number(raw);
      return Number.isFinite(v) ? Math.max(0, Math.round(v)) : null;
    } catch { return null; }
  }

  function writeOwnedGemCache(v) {
    try { localStorage.setItem(LS_GEMS_OWNED_CACHE_KEY, String(Math.max(0, Math.round(+v)))); } catch {}
  }

  function getOwnedLoadoutCount() {
    const v = STATE?.precision?.gemsOwnedLoadout;
    return Number.isFinite(+v) ? Math.max(0, Math.round(+v)) : null;
  }

  function getOwnedDisplayedCount() {
    const a = getOwnedLoadoutCount();
    if (Number.isFinite(+a)) return +a;
    const c = readOwnedGemCache();
    if (Number.isFinite(+c)) return +c;
    // fallback: whatever is currently used in calc (manual or loadout)
    return getGemCount();
  }

  async function refreshOwnedGemCount() {
    const v = await fetchMyPrecisionGemCount();
    if (Number.isFinite(+v)) {
      STATE.precision.gemsOwnedLoadout = Math.max(0, Math.round(+v));
      writeOwnedGemCache(v);
      return STATE.precision.gemsOwnedLoadout;
    }
    return null;
  }


  // --------------------------
  // State
  // --------------------------
  const STATE = {
    tab: 'precision',
    cfg: loadCfg(),
    maxGem: DEFAULT_CFG.gems.maxGemsFallback,

    ui: {
      hideAdminButtons: getHideAdminButtons()
    },

    precision: {
      mode: 'gb', // id
      useGemsLoadout: false,
      gemsManual: 0,
      gemsFromLoadout: null,
      gemsOwnedLoadout: null,
      sjwWeapon1: 'ssr',
      sjwWeapon2: 'ssr',
      huntersWeapon: 'ssr',
      huntersTraining: 'none',
      sjwPerception: 10
    },

    defpen: {
      flat: 0,
      monsterLevel: 80,
      bonus: {
        emma: false,
        gina: false,
        esil: false,
        esilUnits: 6,
        sian: false,
        sianUnits: 6,
        ennio: false,
        knightKiller: false,
        armed: false,
        architectBluePoison: false,
        beste: false
      },
      custom: 0
    }
  };

  // --------------------------
  // Render helpers
  // --------------------------
  function renderHeader(root) {
    const top = el('div', { class: 'flex items-center justify-between gap-3 mb-4' });

    top.append(
      el('div', { class: 'min-w-0' },
        el('div', { class: 'text-2xl font-extrabold text-yellow-400 leading-tight' }, 'Calculators'),
        el('div', { class: 'text-sm text-slate-300/90' }, 'Precision & Defense Penetration')
      )
    );

    // Keep layout consistent with Hunter.js (right side reserved for future badges)
    top.append(el('div', { class: 'flex items-center gap-2 flex-wrap justify-end' }));

    root.append(top);
  }

  function renderTabs(root) {
    const tabs = [
      { key: 'precision', label: 'Precision' },
      { key: 'defpen', label: 'Defense Pen' }
    ];
    if (isAdminTabVisible()) tabs.push({ key: 'admin', label: 'Admin' });

    const cols = tabs.length;
    const bar = el('div', { class: 'grid ' + (cols === 3 ? 'grid-cols-3' : 'grid-cols-2') + ' gap-2 mb-4' });

    const btn = (key, label) => {
      const active = STATE.tab === key;
      const b = el(
        'button',
        {
          type: 'button',
          class:
            'h-10 rounded-xl border text-base font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400/50 disabled:opacity-50 disabled:cursor-not-allowed ' +
            (active
              ? 'bg-yellow-400 text-black border-yellow-400/70'
              : 'bg-glass text-slate-200 border-white/10 hover:bg-white/10 hover:text-white')
        },
        label
      );

      b.addEventListener('click', () => {
        if (STATE.tab === key) return;
        STATE.tab = key;
        renderPreserve();
      });

      return b;
    };

    for (const t of tabs) bar.append(btn(t.key, t.label));
    root.append(bar);
  }

  // --------------------------
  // Precision logic
  // --------------------------
  function getModes() {
    const modes = Array.isArray(STATE.cfg.precision.modes) ? STATE.cfg.precision.modes : [];
    return modes.filter(m => m && typeof m === 'object' && m.id);
  }

  function ensureValidModeId() {
    const modes = getModes();
    const exists = modes.some(m => m.id === STATE.precision.mode);
    if (!exists && modes[0]?.id) STATE.precision.mode = modes[0].id;
  }

  function getPrecisionTarget() {
    const modeId = STATE.precision.mode;
    const mode = getModes().find(m => m.id === modeId);
    return +mode?.target || 0;
  }

  function getGemCount() {
    if (STATE.precision.useGemsLoadout) {
      const v = STATE.precision.gemsFromLoadout;
      if (Number.isFinite(+v)) return clampInt(v, 0, 999999, 0);
      return 0;
    }
    return clampInt(STATE.precision.gemsManual, 0, 999999, 0);
  }

  function getOwnedGemText() {
    const owned = getOwnedDisplayedCount();
    return `Owned: ${owned}`;
  }

  function calcPrecision(input = STATE.precision, config = STATE.cfg) {
    const cfg = mergeDeep(structuredCloneSafe(DEFAULT_CFG), config || {});
    const modes = Array.isArray(cfg.precision.modes) ? cfg.precision.modes : DEFAULT_CFG.precision.modes;
    const mode = modes.find(m => m.id === input.mode) || modes[0] || DEFAULT_CFG.precision.modes[0];
    const target = clampInt(mode?.target, 0, 999999, 18700);
    const perGem = clampInt(cfg.gems?.precisionPerGem, 1, 999999, 1800);
    const table = Array.isArray(cfg.precision?.perceptionTable) ? cfg.precision.perceptionTable : DEFAULT_CFG.precision.perceptionTable;

    const gemCount = clampInt(input.ownedGems ?? input.gemsOwned ?? getGemCount(), 0, 999999, 0);
    const gemPrec = gemCount * perGem;
    const perMax = clampInt(cfg.precision?.perceptionMax ?? 9999, 10, 999999, 9999);

    const wMap = cfg.precision?.weaponRarityBonus || DEFAULT_CFG.precision.weaponRarityBonus;
    const tMap = cfg.precision?.hunterTrainingPoints || DEFAULT_CFG.precision.hunterTrainingPoints;
    const baseSJW = clampInt(cfg.precision?.base?.sjw, 0, 999999, 0);
    const baseHunters = clampInt(cfg.precision?.base?.hunters, 0, 999999, 12110);

    const sjwPer = clampInt(input.sjwPerception, 0, perMax, 10);
    const perceptionPrecision = Math.round(precisionFromPerception(sjwPer, table));
    const sjwW = (+wMap[String(input.sjwWeapon1 || 'none').toLowerCase()] || 0) + (+wMap[String(input.sjwWeapon2 || 'none').toLowerCase()] || 0);
    const huntersW = +wMap[String(input.huntersWeapon || 'none').toLowerCase()] || 0;
    const trainingPrecision = +tMap[String(input.huntersTraining || 'none')] || 0;

    const sjwOwned = baseSJW + gemPrec + perceptionPrecision;
    const sjwTotal = sjwOwned + sjwW;
    const sjwRemaining = Math.max(0, target - sjwTotal);
    const sjwGemsNeeded = sjwRemaining <= 0 ? 0 : Math.ceil(sjwRemaining / perGem);
    const neededPer = perceptionNeededForPrecision(target - sjwW - gemPrec, table);

    const huntersOwned = baseHunters + gemPrec + trainingPrecision;
    const huntersTotal = huntersOwned + huntersW;
    const huntersRemaining = Math.max(0, target - huntersTotal);
    const huntersGemsNeeded = huntersRemaining <= 0 ? 0 : Math.ceil(huntersRemaining / perGem);

    return {
      target,
      precisionNeeded: target,
      perGem,
      gemCount,
      gemPrec,
      ownedPrecisionFromGems: gemPrec,
      remainingToTargetFromGems: Math.max(0, target - gemPrec),
      perMax,
      sjw: {
        base: baseSJW,
        perception: sjwPer,
        perceptionPrecision,
        fromPer: perceptionPrecision,
        ownedPrecision: sjwOwned,
        weaponPrecision: sjwW,
        weapon: sjwW,
        totalPrecision: sjwTotal,
        total: sjwTotal,
        remainingPrecision: sjwRemaining,
        remaining: sjwRemaining,
        additionalGems: sjwGemsNeeded,
        gemsNeeded: sjwGemsNeeded,
        additionalGemsLabel: sjwGemsNeeded <= 0 ? 'Achieved' : String(sjwGemsNeeded),
        perceptionNeeded: neededPer,
        neededPerception: neededPer,
        perceptionNeededLabel: neededPer <= 0 ? 'Achieved' : String(neededPer)
      },
      hunters: {
        base: baseHunters,
        ownedPrecision: huntersOwned,
        trainingPrecision,
        weaponPrecision: huntersW,
        weapon: huntersW,
        totalPrecision: huntersTotal,
        total: huntersTotal,
        remainingPrecision: huntersRemaining,
        remaining: huntersRemaining,
        additionalGems: huntersGemsNeeded,
        gemsNeeded: huntersGemsNeeded,
        additionalGemsLabel: huntersGemsNeeded <= 0 ? 'Achieved' : String(huntersGemsNeeded)
      }
    };
  }

  function mkRaritySelect(value, onChange) {
    const s = el('select', { class: 'input select', style: 'width:100%' },
      el('option', { value: 'none' }, 'None'),
      el('option', { value: 'r' }, 'R (+1250)'),
      el('option', { value: 'sr' }, 'SR (+2000)'),
      el('option', { value: 'ssr' }, 'SSR (+4000)')
    );
    s.value = String(value || 'none').toLowerCase();
    s.addEventListener('change', () => onChange(String(s.value || 'none').toLowerCase()));
    return s;
  }

  function mkTrainingSelect(value, onChange) {
    const s = el('select', { class: 'input select', style: 'width:100%' },
      el('option', { value: 'none' }, 'None'),
      el('option', { value: '1' }, '1 point (+3065)'),
      el('option', { value: '2' }, '2 points (+6130)'),
      el('option', { value: '3' }, '3 points (+9195)')
    );
    s.value = String(value || 'none');
    s.addEventListener('change', () => onChange(String(s.value || 'none')));
    return s;
  }

  function renderPrecision(root) {
    ensureValidModeId();
    const cfg = STATE.cfg;

    const cardInputs = el('div', { class: 'card hd' },
      el('div', { class: 'title' }, 'Inputs'),
      el('div', { class: 'sub' }, 'Set the mode first, then adjust the player and hunter assumptions.')
    );

    const modeSel = el('select', { class: 'input select', 'data-key': 'prec-mode' });
    const modes = getModes();
    for (const m of modes) modeSel.append(el('option', { value: m.id }, m.label || m.id));
    modeSel.value = STATE.precision.mode;
    modeSel.addEventListener('change', () => {
      STATE.precision.mode = String(modeSel.value || modes[0]?.id || 'gb');
      renderPreserve();
    });

    const toggleWrap = el('label', {
      class: `useGemsBtn gemLoadoutPanel${STATE.precision.useGemsLoadout ? ' isActive' : ''}`,
      title: 'Use my Gems Loadout'
    },
      el('input', { type: 'checkbox', checked: !!STATE.precision.useGemsLoadout, 'data-key': 'prec-gems-toggle' }),
      el('span', { class: 'clickText' }, 'Use my Gems')
    );

    const ownedMini = el('button', {
      type: 'button',
      class: 'ownedMiniPill',
      title: 'Open Gems'
    }, String(getOwnedDisplayedCount()));
    ownedMini.addEventListener('click', () => {
      const target = url('/gems') || 'https://slahub.duckdns.org/gems';
      location.href = target;
    });

    const toggle = qs('input[type="checkbox"]', toggleWrap);
    toggle.addEventListener('change', async () => {
      STATE.precision.useGemsLoadout = !!toggle.checked;
      if (STATE.precision.useGemsLoadout) {
        let v = getOwnedLoadoutCount();
        if (!Number.isFinite(+v)) v = await refreshOwnedGemCount();
        STATE.precision.gemsFromLoadout = v;
        if (v == null) toast('Could not read gems (login required?)');
      }
      renderPreserve();
    });

    const gemsInput = el('input', {
      type: 'number',
      class: 'input gemsManualInput',
      min: '0',
      value: String(clampInt(STATE.precision.gemsManual, 0, 999999, 0)),
      placeholder: '0',
      'data-key': 'prec-gems-manual'
    });
    gemsInput.addEventListener('input', () => {
      const v = clampInt(gemsInput.value, 0, 999999, 0);
      STATE.precision.gemsManual = v;
      if (STATE.precision.useGemsLoadout) {
        STATE.precision.useGemsLoadout = false;
        toggle.checked = false;
      }
      renderPreserve();
    });

    const r = calcPrecision();

    cardInputs.append(
      el('div', { class: 'topInputs' },
        el('div', { class: 'calcTopField' },
          el('div', { class: 'label' }, 'Game Mode'),
          modeSel,
          STATE.precision.mode === 'gb' ? el('div', { class: 'hint' }, 'Levels are omitted; GB shows 90 in-game but uses the 80 baseline.') : null
        ),
        el('div', { class: 'calcTopField' },
          el('div', { class: 'label' }, 'Precision Gems Owned'),
          el('div', { class: 'gemsCompactRow' }, gemsInput, toggleWrap, ownedMini),
          el('div', {},
            el('div', { class: 'hint gemsHint' }, `Each gem adds ${cfg.gems.precisionPerGem} precision.`)
          )
        )
      )
    );

    const sjwW1 = mkRaritySelect(STATE.precision.sjwWeapon1, (v) => { STATE.precision.sjwWeapon1 = v; renderPreserve(); });
    const sjwW2 = mkRaritySelect(STATE.precision.sjwWeapon2, (v) => { STATE.precision.sjwWeapon2 = v; renderPreserve(); });
    const huntersW = mkRaritySelect(STATE.precision.huntersWeapon, (v) => { STATE.precision.huntersWeapon = v; renderPreserve(); });
    const huntersTraining = mkTrainingSelect(STATE.precision.huntersTraining, (v) => { STATE.precision.huntersTraining = v; renderPreserve(); });

    const perInput = el('input', {
      type: 'number',
      class: 'input',
      min: '10',
      max: String(r.perMax),
      value: String(clampInt(STATE.precision.sjwPerception, 10, r.perMax, 10)),
      'data-key': 'prec-perception'
    });
    perInput.addEventListener('input', () => {
      STATE.precision.sjwPerception = clampInt(perInput.value, 10, r.perMax, 10);
      renderPreserve();
    });

    const leftPanel = el('div', { class: 'innerCard' },
      el('div', { class: 'sectionHead' },
        el('div', { class: 'h' }, 'SJW Precision'),
        el('div', { class: 'muted' }, `Base precision ${formatInt(cfg.precision.base?.sjw || 0)}`)
      ),
      el('div', { class: 'hint' }, 'Base Perception: 10 to 600 Precision'),
      el('div', { class: 'grid2 mt-3' },
        el('div', {}, el('div', { class: 'label' }, 'SJW Weapon 1'), sjwW1),
        el('div', {}, el('div', { class: 'label' }, 'SJW Weapon 2'), sjwW2)
      ),
      el('div', { class: 'mt-3' }, el('div', { class: 'label' }, `Perception (max ${r.perMax})`), perInput)
    );

    const rightPanel = el('div', { class: 'innerCard' },
      el('div', { class: 'sectionHead' },
        el('div', { class: 'h' }, 'Hunters Precision'),
        el('div', { class: 'muted' }, `Base precision ${formatInt(cfg.precision.base?.hunters || 0)}`)
      ),
      el('div', { class: 'hint' }, 'Hunter calculations use one weapon precision source.'),
      el('div', { class: 'grid2 mt-3' },
        el('div', {}, el('div', { class: 'label' }, 'Hunter Weapon Rarity'), huntersW),
        el('div', {}, el('div', { class: 'label' }, 'Hunter Training Points'), huntersTraining)
      )
    );

    cardInputs.append(el('div', { class: 'precisionPanels' }, leftPanel, rightPanel));

    const results = el('div', { class: 'card hd' },
      el('div', { class: 'title' }, 'Results'),
      el('div', { class: 'sub' }, 'See the threshold first, then compare what SJW and Hunters still need.')
    );

    const box = el('div', { class: 'resultsBox heroBox mt-3' },
      el('div', { class: 'resultsTitle' },
        el('div', { class: 'left' },
          el('div', { class: 'big' }, 'Precision Needed for 99%'),
          el('div', { class: 'small' }, 'Per selected game mode')
        ),
        el('div', { class: 'value' }, formatInt(r.target))
      )
    );

    const gemSummary = el('div', { class: 'metricGrid' },
      el('div', { class: 'metricBox' }, el('span', {}, 'Precision from your gems'), el('strong', {}, formatInt(r.gemPrec))),
      el('div', { class: 'metricBox' }, el('span', {}, 'Remaining precision to 99%'), el('strong', {}, formatInt(r.remainingToTargetFromGems)))
    );

    const sjwResults = el('div', { class: 'resultsBox mt-3' },
      el('div', { class: 'sectionHead' }, el('div', { class: 'h' }, 'SJW Precision')),
      el('div', { class: 'kv mt-3' },
        el('div', { class: 'kvRow' }, el('span', {}, 'Base precision'), el('strong', {}, formatInt(r.sjw.base + r.sjw.perceptionPrecision))),
        el('div', { class: 'kvRow' }, el('span', {}, 'Weapon precision'), el('strong', {}, formatInt(r.sjw.weaponPrecision))),
        el('div', { class: 'kvRow' }, el('span', {}, 'Remaining precision'), el('strong', {}, formatInt(r.sjw.remaining))),
        el('div', { class: 'kvRow emphasis' }, el('span', {}, 'Additional gems needed'),
          el('strong', { class: r.sjw.additionalGems <= 0 ? 'badgeOk' : 'badgeWarn' }, r.sjw.additionalGemsLabel)
        ),
        el('div', { class: 'kvRow' }, el('span', {}, 'Total perception points needed'),
          el('strong', { class: r.sjw.perceptionNeeded <= 0 ? 'badgeOk' : 'badgeWarn' }, r.sjw.perceptionNeededLabel)
        )
      )
    );

    const huntersResults = el('div', { class: 'resultsBox mt-3' },
      el('div', { class: 'sectionHead' }, el('div', { class: 'h' }, 'Hunters Precision')),
      el('div', { class: 'kv mt-3' },
        el('div', { class: 'kvRow' }, el('span', {}, 'Base precision'), el('strong', {}, formatInt(r.hunters.base))),
        el('div', { class: 'kvRow' }, el('span', {}, 'Weapon precision'), el('strong', {}, formatInt(r.hunters.weaponPrecision))),
        el('div', { class: 'kvRow' }, el('span', {}, 'Point precision'), el('strong', {}, formatInt(r.hunters.trainingPrecision))),
        el('div', { class: 'kvRow' }, el('span', {}, 'Remaining precision'), el('strong', {}, formatInt(r.hunters.remaining))),
        el('div', { class: 'kvRow emphasis' }, el('span', {}, 'Additional gems needed'),
          el('strong', { class: r.hunters.additionalGems <= 0 ? 'badgeOk' : 'badgeWarn' }, r.hunters.additionalGemsLabel)
        )
      )
    );

    results.append(box, gemSummary, sjwResults, huntersResults);
    root.append(el('div', { class: 'calc-layout' },
      el('div', { class: 'calc-left' }, cardInputs),
      el('div', { class: 'calc-right' }, results)
    ));
  }

  // --------------------------
  // Def Pen logic + UI
  // --------------------------
  function calcDefenseBasePercent(flat, monsterLevel) {
    const f = Math.max(0, Number(flat) || 0);
    const lvl = clampNum(monsterLevel, 0, 200, 80);
    return f <= 0 ? 0 : (100 * f / (f + lvl * 1000));
  }

  function calcDefenseFlatNeeded(bonusPct, monsterLevel) {
    const remainingPct = 100 - (Math.max(0, Number(bonusPct) || 0));
    if (remainingPct <= 0) return 0;
    if (remainingPct >= 100) return Infinity;
    return remainingPct * (clampNum(monsterLevel, 0, 200, 80) * 1000) / (100 - remainingPct);
  }

  function calcDefensePen(input = STATE.defpen, config = STATE.cfg) {
    const flat = Math.max(0, Number(input.flat ?? input.sjwDefPen) || 0);
    const lvl = clampNum(input.monsterLevel, 0, 200, 80);
    const custom = Math.max(0, Number(input.custom ?? input.customValue) || 0);
    const b = input.bonus || input.selectedBonuses || {};
    const cfgB = config?.defpen?.bonuses || DEFAULT_CFG.defpen.bonuses;

    let bonus = 0;
    if (b.emma) bonus += +cfgB.emma || 0;
    if (b.gina) bonus += +cfgB.gina || 0;
    if (b.esil) bonus += (+cfgB.esilPerFireUnit || 0) * clampInt(b.esilUnits ?? input.bonusUnits?.esil, 1, 6, 6);
    if (b.sian || b.sianHilat) bonus += (+cfgB.sianPerDarkUnit || 0) * clampInt(b.sianUnits ?? input.bonusUnits?.sianHilat, 1, 6, 6);
    if (b.ennio) bonus += +cfgB.ennio || 0;
    if (b.knightKiller || b.knight) bonus += +cfgB.knightKiller || 0;
    if (b.armed) bonus += +cfgB.armed || 0;
    if (b.architectBluePoison) bonus += +cfgB.architectBluePoison || 0;
    if (b.beste) bonus += +cfgB.beste || 0;

    const base = calcDefenseBasePercent(flat, lvl);
    const total = base + bonus + custom;
    const flatNeeded = calcDefenseFlatNeeded(bonus + custom, lvl);

    return {
      flat,
      lvl,
      sjwDefPen: flat,
      monsterLevel: lvl,
      base,
      basePercentage: base,
      bonus,
      bonusPercentage: bonus,
      custom,
      customValue: custom,
      total,
      totalPercentage: total,
      flatNeeded
    };
  }

  function renderDefPen(root) {
    const cardInputs = el('div', { class: 'card hd' },
      el('div', { class: 'title' }, 'Inputs'),
      el('div', { class: 'sub' }, 'Start with your stat sheet, then add only the bonuses active for the fight.')
    );

    const inFlat = el('input', {
      type: 'number',
      class: 'input',
      min: '0',
      value: String(STATE.defpen.flat),
      'data-key': 'dp-flat'
    });
    inFlat.addEventListener('input', () => {
      STATE.defpen.flat = clampNum(inFlat.value, 0, 1e12, 0);
      renderPreserve();
    });

    const inLvl = el('input', {
      type: 'number',
      class: 'input',
      min: '0',
      max: '200',
      value: String(STATE.defpen.monsterLevel),
      'data-key': 'dp-lvl'
    });
    inLvl.addEventListener('input', () => {
      STATE.defpen.monsterLevel = clampInt(inLvl.value, 0, 200, 80);
      renderPreserve();
    });

    cardInputs.append(
      el('div', { class: 'topInputs' },
        el('div', { class: 'fieldStack' },
          el('div', { class: 'label' }, 'SJW Defense Penetration (Flat)'),
          el('div', { class: 'inputGroup' }, el('div', { class: 'inputIcon' }, '+'), inFlat),
          el('div', { class: 'hint' }, 'Check your character stats in-game.')
        ),
        el('div', { class: 'fieldStack' },
          el('div', { class: 'label' }, 'Monster Level'),
          el('div', { class: 'inputGroup' }, el('div', { class: 'inputIcon' }, 'Lv'), inLvl),
          el('div', { class: 'hint' }, 'Target enemy level.')
        )
      )
    );

    const cfgB = STATE.cfg.defpen.bonuses || {};
    const b = STATE.defpen.bonus;

    const mkCheck = (key, label, valueStr, unitInput = null, unitLabel = '') => {
      const checkbox = el('input', { type: 'checkbox', checked: !!b[key], 'data-key': `dp-${key}` });
      const switchNode = el('label', { class: 'switch' }, checkbox, el('span', {}));
      const box = el('div', { class: `checkItem${b[key] ? ' isActive' : ''}` },
        el('div', { class: 'checkTop' },
          el('div', { class: 'left' },
            switchNode,
            el('div', { class: 'nm', title: label }, label)
          ),
          el('div', { class: 'val' }, valueStr)
        ),
        unitInput && b[key] ? el('div', { class: 'unitWrap' },
          el('div', { class: 'hint unitLabel' }, unitLabel),
          unitInput
        ) : null
      );

      const toggleBonus = (next) => {
        checkbox.checked = !!next;
        b[key] = checkbox.checked;
        renderPreserve();
      };

      switchNode.addEventListener('click', (e) => {
        e.stopPropagation();
      });

      checkbox.addEventListener('change', () => {
        toggleBonus(checkbox.checked);
      });

      box.addEventListener('click', (e) => {
        if (e.target?.closest?.('.unitWrap')) return;
        if (e.target?.closest?.('.switch')) return;
        e.preventDefault();
        toggleBonus(!checkbox.checked);
      });
      return box;
    };

    const esilUnits = el('input', {
      type: 'number',
      class: 'input inlineNum',
      min: '1',
      max: '6',
      value: String(clampInt(b.esilUnits, 1, 6, 6)),
      'data-key': 'dp-esil-units'
    });
    esilUnits.addEventListener('input', () => {
      b.esilUnits = clampInt(esilUnits.value, 1, 6, 6);
      renderPreserve();
    });
    esilUnits.addEventListener('click', (e) => e.stopPropagation());
    esilUnits.addEventListener('pointerdown', (e) => e.stopPropagation());

    const sianUnits = el('input', {
      type: 'number',
      class: 'input inlineNum',
      min: '1',
      max: '6',
      value: String(clampInt(b.sianUnits, 1, 6, 6)),
      'data-key': 'dp-sian-units'
    });
    sianUnits.addEventListener('input', () => {
      b.sianUnits = clampInt(sianUnits.value, 1, 6, 6);
      renderPreserve();
    });
    sianUnits.addEventListener('click', (e) => e.stopPropagation());
    sianUnits.addEventListener('pointerdown', (e) => e.stopPropagation());

    const bonusCard = el('div', { class: 'mt-3' },
      el('div', { class: 'label accentLabel' }, 'Bonus Sources'),
      el('div', { class: 'hint' }, 'Select every active source. Conditional units appear only when enabled.'),
      el('div', { class: 'bonusSources' },
        el('div', { class: 'bonusGroup' },
          el('div', { class: 'bonusGroupTitle' }, 'Hunters'),
          el('div', { class: 'bonusList' },
            mkCheck('emma', 'Emma', `+${(+cfgB.emma || 0).toFixed(2)}%`),
            mkCheck('gina', 'Gina', `+${(+cfgB.gina || 0)}%`),
            mkCheck('esil', 'Esil', `+${(+cfgB.esilPerFireUnit || 0)}% per Fire unit`, esilUnits, 'Fire Hunters'),
            mkCheck('sian', 'Sian Hilat', `+${(+cfgB.sianPerDarkUnit || 0)}% per Dark unit`, sianUnits, 'Dark Hunters')
          )
        ),
        el('div', { class: 'bonusGroup' },
          el('div', { class: 'bonusGroupTitle' }, 'Weapons'),
          el('div', { class: 'bonusList' },
            mkCheck('ennio', "Ennio's Roar", `+${(+cfgB.ennio || 0)}%`),
            mkCheck('knightKiller', 'Knight Killer', `+${(+cfgB.knightKiller || 0)}%`)
          )
        ),
        el('div', { class: 'bonusGroup' },
          el('div', { class: 'bonusGroupTitle' }, 'Artifact Sets'),
          el('div', { class: 'bonusList' },
            mkCheck('armed', 'Armed', `+${(+cfgB.armed || 0)}%`),
            mkCheck('architectBluePoison', "The Architect's Blue Poison", `+${(+cfgB.architectBluePoison || 0)}%`)
          )
        ),
        el('div', { class: 'bonusGroup' },
          el('div', { class: 'bonusGroupTitle' }, 'Shadows'),
          el('div', { class: 'bonusList' },
            mkCheck('beste', 'Beste', `+${(+cfgB.beste || 0)}%`)
          )
        )
      )
    );

    const inCustom = el('input', {
      type: 'number',
      class: 'input',
      min: '0',
      max: '9999',
      step: '0.01',
      value: String(STATE.defpen.custom),
      'data-key': 'dp-custom'
    });
    inCustom.addEventListener('input', () => {
      STATE.defpen.custom = clampNum(inCustom.value, 0, 9999, 0);
      renderPreserve();
    });

    cardInputs.append(
      bonusCard,
      el('div', { class: 'fieldStack mt-3' },
        el('div', { class: 'label' }, 'Custom Bonus Value ', el('span', { class: 'muted' }, '(Optional)')),
        el('div', { class: 'inputGroup three' }, el('div', { class: 'inputIcon' }, '+'), inCustom, el('div', { class: 'inputSuffix' }, '%')),
        el('div', { class: 'hint' }, 'Add a custom additive percentage, such as 3 for +3%.')
      )
    );

    const r = calcDefensePen();
    const formatSignedPct = (v) => (+v > 0 ? `+${formatPct(+v, 2)}` : '0%');

    const results = el('div', { class: 'card hd' },
      el('div', { class: 'title' }, 'Results'),
      el('div', { class: 'sub' }, 'Live totals update as your build changes.')
    );

    const box = el('div', { class: 'resultsBox heroBox mt-3' },
      el('div', { class: 'resultsTitle' },
        el('div', { class: 'left' },
          el('div', { class: 'big' }, 'Total Defense Penetration'),
          el('div', { class: 'small' }, 'Effective penetration against the selected target.')
        ),
        el('div', { class: 'value' }, formatPct(r.total, 2))
      )
    );

    const flatNeededBox = el('div', { class: 'resultsBox flatBox mt-3' },
      el('div', { class: 'resultsTitle' },
        el('div', { class: 'left' },
          el('div', { class: 'big' }, 'Flat Defense Penetration Needed for 100%'),
          el('div', { class: 'small' }, 'Required flat stat after bonuses and custom value.')
        ),
        el('div', { class: 'value' }, formatInt(Math.ceil(r.flatNeeded)))
      )
    );

    const breakdown = el('div', { class: 'resultsBox mt-3' },
      el('div', { class: 'sectionHead' }, el('div', { class: 'h' }, 'Breakdown')),
      el('div', { class: 'bdBox' },
        el('div', { class: 'bdGrid' },
          el('div', { class: 'bdItem' }, el('div', { class: 'bdLbl' }, 'SJW Defense Penetration'), el('div', { class: 'bdVal' }, formatInt(r.flat))),
          el('div', { class: 'bdItem' }, el('div', { class: 'bdLbl' }, 'Monster Level'), el('div', { class: 'bdVal' }, String(r.lvl))),
          el('div', { class: 'bdItem' }, el('div', { class: 'bdLbl' }, 'Base Defense Penetration'), el('div', { class: 'bdVal' }, formatPct(r.base, 2))),
          el('div', { class: 'bdItem' }, el('div', { class: 'bdLbl' }, 'Bonus Defense Penetration'), el('div', { class: 'bdVal green' }, formatSignedPct(r.bonus))),
          el('div', { class: 'bdItem' }, el('div', { class: 'bdLbl' }, 'Custom Bonus Value'), el('div', { class: 'bdVal yellow' }, formatSignedPct(r.custom)))
        )
      )
    );

    results.append(box, flatNeededBox, breakdown);
    root.append(el('div', { class: 'calc-layout' },
      el('div', { class: 'calc-left' }, cardInputs),
      el('div', { class: 'calc-right' }, results)
    ));
  }

  // --------------------------
  // Admin UI (fields)
  // --------------------------
  function renderAdmin(root) {
    if (!isAdminUser()) {
      root.append(el('div', { class: 'card' }, 'Admin only.'));
      return;
    }

    const wrap = el('div', { class: 'card hd' },
      el('div', { class: 'title' }, '🛠️ Admin — Calculators Config'),
      el('div', { class: 'sub' }, 'Edytuj ustawienia w polach (zapis do localStorage).')
    );

    const cfg = STATE.cfg;

    const mkNumRow = (label, value, onSet, opts = {}) => {
      const input = el('input', {
        type: 'number',
        class: 'input',
        value: String(value),
        min: opts.min ?? undefined,
        max: opts.max ?? undefined,
        step: opts.step ?? undefined,
        'data-key': opts.key || ''
      });
      input.addEventListener('input', () => onSet(input.value));
      return el('div', { class: 'adminRow' },
        el('div', { class: 'k' }, label),
        el('div', { class: 'v' }, input)
      );
    };

    // ✅ Modes editor (add/remove/rename)
    const modesSec = el('div', { class: 'adminSec' },
      el('div', { class: 'adminSecTitle' }, 'Precision — Game Modes (editable)')
    );

    const head = el('div', { class: 'modeHead' },
      el('div', {}, 'Mode ID'),
      el('div', {}, 'Mode Name'),
      el('div', {}, 'Target'),
      el('div', {}, '')
    );

    const list = el('div', {});
    const modes = getModes();

    const renderModeRows = () => {
      list.innerHTML = '';
      const cur = getModes();
      for (let i = 0; i < cur.length; i++) {
        const m = cur[i];

        const idIn = el('input', { class: 'input smallInput', type: 'text', value: m.id, 'data-key': `adm-mode-id-${i}` });
        const nameIn = el('input', { class: 'input smallInput', type: 'text', value: m.label || '', 'data-key': `adm-mode-name-${i}` });
        const tgtIn = el('input', { class: 'input smallInput', type: 'number', min: '0', value: String(+m.target || 0), 'data-key': `adm-mode-tgt-${i}` });

        idIn.addEventListener('input', () => {
          // keep safe id (no spaces)
          const v = String(idIn.value || '').trim().replace(/\s+/g, '_');
          cfg.precision.modes[i].id = v || cfg.precision.modes[i].id;
          idIn.value = cfg.precision.modes[i].id;
        });

        nameIn.addEventListener('input', () => {
          cfg.precision.modes[i].label = String(nameIn.value || '');
        });

        tgtIn.addEventListener('input', () => {
          cfg.precision.modes[i].target = clampInt(tgtIn.value, 0, 999999, 0);
        });

        const del = el('button', { class: 'btn danger', type: 'button' }, 'Delete');
        del.addEventListener('click', () => {
          cfg.precision.modes.splice(i, 1);
          // if current mode removed, pick first
          ensureValidModeId();
          renderModeRows();
        });

        list.append(
          el('div', { class: 'modeRow' },
            idIn, nameIn, tgtIn, del
          )
        );
      }
    };

    const addBtn = el('button', { class: 'btn', type: 'button' }, 'Add new mode');
    addBtn.addEventListener('click', () => {
      const baseId = 'new_mode';
      let id = baseId;
      let n = 1;
      const ids = new Set(getModes().map(x => x.id));
      while (ids.has(id)) { id = `${baseId}_${n++}`; }
      cfg.precision.modes.push({ id, label: 'New Mode', target: 0 });
      renderModeRows();
    });

    modesSec.append(head, list, el('div', { class: 'inRow', style: 'margin-top:10px' }, addBtn));
    renderModeRows();

    const sec1 = el('div', { class: 'adminSec' },
      el('div', { class: 'adminSecTitle' }, 'Precision'),
      mkNumRow('Perception max', cfg.precision.perceptionMax ?? 9999, (v) => cfg.precision.perceptionMax = clampInt(v, 10, 999999, 9999), { min: 10, key: 'adm-per-max' }),

      el('div', { class: 'adminSecTitle', style: 'margin-top:12px' }, 'Base precision'),
      mkNumRow('SJW base', cfg.precision.base.sjw, (v) => cfg.precision.base.sjw = clampInt(v, 0, 999999, 0), { min: 0, key: 'adm-sjwbase' }),
      mkNumRow('Hunters base', cfg.precision.base.hunters, (v) => cfg.precision.base.hunters = clampInt(v, 0, 999999, 12110), { min: 0, key: 'adm-hbase' }),

      el('div', { class: 'adminSecTitle', style: 'margin-top:12px' }, 'Weapon bonuses'),
      mkNumRow('R bonus', cfg.precision.weaponRarityBonus.r, (v) => cfg.precision.weaponRarityBonus.r = clampInt(v, 0, 999999, 1250), { min: 0, key: 'adm-wr' }),
      mkNumRow('SR bonus', cfg.precision.weaponRarityBonus.sr, (v) => cfg.precision.weaponRarityBonus.sr = clampInt(v, 0, 999999, 2000), { min: 0, key: 'adm-wsr' }),
      mkNumRow('SSR bonus', cfg.precision.weaponRarityBonus.ssr, (v) => cfg.precision.weaponRarityBonus.ssr = clampInt(v, 0, 999999, 4000), { min: 0, key: 'adm-wssr' }),

      el('div', { class: 'adminSecTitle', style: 'margin-top:12px' }, 'Hunter training points'),
      mkNumRow('1 point', cfg.precision.hunterTrainingPoints?.['1'] ?? 3065, (v) => cfg.precision.hunterTrainingPoints['1'] = clampInt(v, 0, 999999, 3065), { min: 0, key: 'adm-train-1' }),
      mkNumRow('2 points', cfg.precision.hunterTrainingPoints?.['2'] ?? 6130, (v) => cfg.precision.hunterTrainingPoints['2'] = clampInt(v, 0, 999999, 6130), { min: 0, key: 'adm-train-2' }),
      mkNumRow('3 points', cfg.precision.hunterTrainingPoints?.['3'] ?? 9195, (v) => cfg.precision.hunterTrainingPoints['3'] = clampInt(v, 0, 999999, 9195), { min: 0, key: 'adm-train-3' })
    );

    const sec2 = el('div', { class: 'adminSec' },
      el('div', { class: 'adminSecTitle' }, 'Gems'),
      mkNumRow('Precision per gem', cfg.gems.precisionPerGem, (v) => cfg.gems.precisionPerGem = clampInt(v, 1, 999999, 1800), { min: 1, key: 'adm-pergem' }),
      mkNumRow('Max gems fallback', cfg.gems.maxGemsFallback, (v) => cfg.gems.maxGemsFallback = clampInt(v, 1, 999, 12), { min: 1, key: 'adm-maxgem' })
    );

    const sec3 = el('div', { class: 'adminSec' },
      el('div', { class: 'adminSecTitle' }, 'Defense Pen bonuses'),
      mkNumRow('Emma %', cfg.defpen.bonuses.emma, (v) => cfg.defpen.bonuses.emma = clampNum(v, 0, 999, 7.77), { min: 0, step: '0.01', key: 'adm-emma' }),
      mkNumRow('Gina %', cfg.defpen.bonuses.gina, (v) => cfg.defpen.bonuses.gina = clampNum(v, 0, 999, 4), { min: 0, step: '0.01', key: 'adm-gina' }),
      mkNumRow('Esil % per Fire Unit', cfg.defpen.bonuses.esilPerFireUnit, (v) => cfg.defpen.bonuses.esilPerFireUnit = clampNum(v, 0, 999, 4), { min: 0, step: '0.01', key: 'adm-esil' }),
      mkNumRow('Sian % per Dark Unit', cfg.defpen.bonuses.sianPerDarkUnit, (v) => cfg.defpen.bonuses.sianPerDarkUnit = clampNum(v, 0, 999, 3), { min: 0, step: '0.01', key: 'adm-sian' }),
      mkNumRow("Ennio's Roar %", cfg.defpen.bonuses.ennio, (v) => cfg.defpen.bonuses.ennio = clampNum(v, 0, 999, 16), { min: 0, step: '0.01', key: 'adm-ennio' }),
      mkNumRow('Knight Killer %', cfg.defpen.bonuses.knightKiller, (v) => cfg.defpen.bonuses.knightKiller = clampNum(v, 0, 999, 24), { min: 0, step: '0.01', key: 'adm-kk' }),
      mkNumRow('Armed %', cfg.defpen.bonuses.armed, (v) => cfg.defpen.bonuses.armed = clampNum(v, 0, 999, 18), { min: 0, step: '0.01', key: 'adm-armed' }),
      mkNumRow("The Architect's Blue Poison %", cfg.defpen.bonuses.architectBluePoison, (v) => cfg.defpen.bonuses.architectBluePoison = clampNum(v, 0, 999, 20), { min: 0, step: '0.01', key: 'adm-architect' }),
      mkNumRow('Beste %', cfg.defpen.bonuses.beste, (v) => cfg.defpen.bonuses.beste = clampNum(v, 0, 999, 18), { min: 0, step: '0.01', key: 'adm-beste' })
    );

    const sec4 = el('div', { class: 'adminSec' },
      el('div', { class: 'adminSecTitle' }, 'Perception table (optional)'),
      el('div', { class: 'muted' }, 'Format: [[perception, precision], ...]'),
      el('textarea', {
        class: 'input',
        style: 'height:220px; padding:12px; font-family:ui-monospace,monospace; font-size:12px; width:100%;',
        'data-key': 'adm-table'
      }, JSON.stringify(cfg.precision.perceptionTable, null, 0))
    );

    const ta = qs('textarea', sec4);

    const actions = el('div', { class: 'adminActions mt-3' });
    const btnReset = el('button', { class: 'btn', type: 'button' }, 'Reset to default');
    btnReset.addEventListener('click', () => {
      STATE.cfg = structuredCloneSafe(DEFAULT_CFG);
      saveCfg(STATE.cfg);
      toast('Reset ✅');
      renderPreserve();
    });

    const btnSave = el('button', { class: 'btn primary', type: 'button' }, 'Save');
    btnSave.addEventListener('click', () => {
      try {
        const raw = String(ta.value || '').trim();
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) STATE.cfg.precision.perceptionTable = parsed;
        }
      } catch {
        toast('Perception table JSON invalid ❌');
        return;
      }

      // Ensure no empty ids / duplicates
      const ms = getModes();
      const ids = ms.map(x => x.id).filter(Boolean);
      const unique = new Set(ids);
      if (ids.length !== unique.size) {
        toast('Game Mode IDs must be unique ❌');
        return;
      }
      if (!ms.length) {
        toast('Add at least 1 Game Mode ❌');
        return;
      }

      saveCfg(STATE.cfg);
      toast('Saved ✅');
      ensureValidModeId();
      renderPreserve();
    });

    actions.append(btnReset, btnSave);

    const form = el('div', { class: 'adminWrap mt-3' }, modesSec, sec1, sec2, sec3, sec4, actions);
    wrap.append(form);
    root.append(wrap);
  }

  // --------------------------
  // Main render
  // --------------------------
  function render() {
    injectStyles();

    const content = qs('#content');
    if (!content) return;

    content.innerHTML = '';

    // If Admin tab is hidden, never stay on it.
    if (STATE.tab === 'admin' && !isAdminTabVisible()) STATE.tab = 'precision';

    const shell = el('div', { class: 'w-full mx-auto px-3 sm:px-6 py-6', 'data-sla-page': 'calculators' });
    const inner = el('div', { class: 'calc-shell' });

    renderHeader(inner);
    renderTabs(inner);

    if (STATE.tab === 'precision') renderPrecision(inner);
    else if (STATE.tab === 'defpen') renderDefPen(inner);
    else renderAdmin(inner);

    shell.append(inner);
    content.append(shell);
  }

  function renderPreserve() {
    const st = captureFocusState();
    render();
    restoreFocusState(st);
  }


  // Keep Calculators in sync with /admin "Hide admin buttons" toggle
  window.addEventListener('sla:admin-hide-changed', (e) => {
    try {
      const hide = !!e?.detail?.hide;
      STATE.ui.hideAdminButtons = hide;
      if (STATE.tab === 'admin' && !isAdminTabVisible()) STATE.tab = 'precision';
      renderPreserve();
    } catch {}
  });


  // --------------------------
  // Mount
  // --------------------------
  window.__calculators_mount = async function __calculators_mount() {
    injectStyles();

    STATE.cfg = loadCfg();

    try { STATE.maxGem = await loadGemsMaxGem(); }
    catch { STATE.maxGem = STATE.cfg.gems.maxGemsFallback || DEFAULT_CFG.gems.maxGemsFallback; }

    ensureValidModeId();

    // show Owned count immediately if we have it cached
    const cachedOwned = readOwnedGemCache();
    if (Number.isFinite(+cachedOwned)) STATE.precision.gemsOwnedLoadout = cachedOwned;

    if (STATE.precision.useGemsLoadout) {
      const v = await refreshOwnedGemCount();
      STATE.precision.gemsFromLoadout = v;
    } else {
      // refresh in background so Owned updates even when toggle is OFF
      refreshOwnedGemCount().then((v) => { if (v != null) render(); });
    }

    render();
  };
})();
