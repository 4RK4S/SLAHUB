'use strict';

/**
 * Gems.js — GEMS page module for the new router (LogIn.js).
 * Exposes: window.__gems_mount()
 *
 * Tabs:
 * - Recommended
 * - My list (Page 1 + Page 2)
 * - Admin (only for admins)
 *
 * Data:
 * - Public config (icons + stat values + recommended): GET  /api/public/gems-config
 * - Admin save config:                           POST /api/admin/gems-config   (admin)
 * - Per-user loadout:                            GET  /api/gems-loadout  -> { gemsLoadout: {...} }
 * - Per-user save loadout:                       POST /api/gems-loadout  -> { gemsLoadout: {...} }
 *
 * Slot model (per user):
 * { color:'red', stat:'attack_pct', rank:1..6, letter:'A'|'B'|'C'|'D'|null }
 *
 * Recommended model (admin):
 * We store in cfg.recommended.page1[color] as array of up to 3 entries:
 * { color, stat, rank:6, letter:'A', count:number }
 * (rank/letter enforced in UI; count shown as xN)
 */

(function () {
  // --------------------------
  // Debug logs (toggle true/false)
  // --------------------------
  const LS_LOGS = 'gems.debug.logs';
  const LOGS = { enabled: false };

  function initLogsFromStorage() {
    try { LOGS.enabled = localStorage.getItem(LS_LOGS) === '1'; } catch { LOGS.enabled = false; }
  }
  function setLogsEnabled(v) {
    LOGS.enabled = !!v;
    try { localStorage.setItem(LS_LOGS, LOGS.enabled ? '1' : '0'); } catch {}
    if (LOGS.enabled) console.log('[GEMS] logs enabled');
    else console.log('[GEMS] logs disabled');
  }
  function dlog(...args) { if (LOGS.enabled) console.log('[GEMS]', ...args); }
  function dwarn(...args) { if (LOGS.enabled) console.warn('[GEMS]', ...args); }
  function derror(...args) { if (LOGS.enabled) console.error('[GEMS]', ...args); }

  // public toggles
  window.__gems_setLogs = setLogsEnabled;
  window.__gems_getLogs = () => !!LOGS.enabled;

  initLogsFromStorage();

  // --------------------------
  // Helpers (same style as Hunter.js)
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
    const raw = u || '';
    if (!raw) return '';
    try {
      if (typeof window.cdny === 'function') {
        const out = window.cdny(raw, w);
        return out || raw; // fallback
      }
    } catch {}
    return raw;
  }


  // --------------------------
  // Local picture helpers (Gems)
  // --------------------------
  const PICTURE_CACHE = new Map(); // key: category -> { items, byRel }
  function isExternalUrl(v) { return /^https?:\/\//i.test(String(v || '').trim()); }

  function normalizePicturePath(v, category) {
    const s = String(v || '').trim();
    if (!s) return '';
    if (s.startsWith('/picture/')) return s;
    // allow stored rel paths like "Gems/foo.png"
    if (!isExternalUrl(s) && !s.startsWith('/')) return `/picture/${category}/${s}`;
    return s;
  }

  function stripPicturePrefix(v, category) {
    const s = String(v || '').trim();
    const pref = `/picture/${category}/`;
    if (s.startsWith(pref)) return s.slice(pref.length);
    return s;
  }

  function fileBase(rel) {
    const s = String(rel || '').replace(/\\/g, '/');
    const base = s.split('/').pop() || '';
    return base;
  }

  function humanLabelFromRel(rel) {
    const base = fileBase(rel);
    return base
      .replace(/\.[a-z0-9]+$/i, '')
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  async function loadPictures(category) {
    if (PICTURE_CACHE.has(category)) return PICTURE_CACHE.get(category);
    const res = await fetch(`/api/admin/pictures/list?category=${encodeURIComponent(category)}`, { credentials: 'include' });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || !j || j.ok !== true || !Array.isArray(j.items)) throw new Error(j.error || 'pictures_list_failed');
    const byRel = new Map(j.items.map(it => [it.rel, it]));
    const out = { items: j.items, byRel };
    PICTURE_CACHE.set(category, out);
    return out;
  }

  function normKey(s) {
    return String(s || '')
      .toLowerCase()
      .replace(/\.[a-z0-9]+$/i, '')
      .replace(/[^a-z0-9]+/g, '');
  }

  function bestRelMatch(rels, want) {
    const w = normKey(want);
    if (!w) return '';
    // try exact by filename
    for (const rel of rels) {
      if (normKey(fileBase(rel)) === w) return rel;
    }
    // try contains on label/filename
    let best = '';
    let bestScore = -1;
    for (const rel of rels) {
      const base = fileBase(rel);
      const label = humanLabelFromRel(rel);
      const nb = normKey(base);
      const nl = normKey(label);

      let score = 0;
      if (nb.includes(w)) score += 3;
      if (nl.includes(w)) score += 2;
      // prefer shorter names if equal score
      score -= Math.min(2, Math.floor(nb.length / 40));

      if (score > bestScore) {
        bestScore = score;
        best = rel;
      }
    }
    return bestScore > 0 ? best : '';
  }

  function urlBaseName(u) {
    const s = String(u || '');
    try {
      const noQuery = s.split('?')[0];
      return decodeURIComponent(noQuery.split('/').pop() || '');
    } catch {
      return s.split('?')[0].split('/').pop() || '';
    }
  }

  async function ensureGemsPicsLoaded() {
    if (STATE._picsGems || STATE._picsGemsErr) return;
    try {
      STATE._picsGems = await loadPictures('Gems');
    } catch (e) {
      STATE._picsGemsErr = e;
      throw e;
    }
  }

  function isBadAssetValue(v) {
    const s = String(v || '').trim();
    if (!s) return true;
    if (isExternalUrl(s)) return true;
    return false;
  }

  async function autoMatchAssetsForKey(key) {
    await ensureGemsPicsLoaded();
    const pics = STATE._picsGems;
    if (!pics || !Array.isArray(pics.items)) {
      toast('No local images list');
      return;
    }

    const assets = (STATE.cfg.assets = STATE.cfg.assets || {});
    let rels = [];
    let matched = 0;
    let missing = 0;

    function setIfMatch(pathObj, k, rel) {
      if (!rel) { missing++; return; }
      pathObj[k] = normalizePicturePath(`/picture/Gems/${rel}`, 'Gems');
      matched++;
    }

    if (key === 'letterIcons') {
      rels = filterRel(pics.items, 'Leter');
      assets.letterIcons = assets.letterIcons || { A:'',B:'',C:'',D:'' };
      for (const L of ['A','B','C','D']) {
        const cur = assets.letterIcons[L] || '';
        if (!isBadAssetValue(cur)) continue;
        const base = isExternalUrl(cur) ? urlBaseName(cur) : '';
        const want = base ? base : L;
        const rel = bestRelMatch(rels, want) || bestRelMatch(rels, `letter ${L}`) || bestRelMatch(rels, `${L} icon`);
        setIfMatch(assets.letterIcons, L, rel);
      }
    } else if (key === 'statIcons') {
      rels = filterRel(pics.items, 'Stats');
      assets.statIcons = assets.statIcons || {};
      for (const statKey of Object.keys(STAT_META)) {
        const cur = assets.statIcons[statKey] || '';
        if (!isBadAssetValue(cur)) continue;
        const base = isExternalUrl(cur) ? urlBaseName(cur) : '';
        const want = base ? base : statKey;
        const rel = bestRelMatch(rels, want) || bestRelMatch(rels, STAT_META[statKey]?.label || '') || bestRelMatch(rels, statKey.replace(/_/g,' '));
        setIfMatch(assets.statIcons, statKey, rel);
      }
    } else if (key === 'gemImages') {
      rels = filterRel(pics.items, 'Gems');
      assets.gemImages = assets.gemImages || {};
      for (const c of GEM_COLORS) {
        if (!Array.isArray(assets.gemImages[c.key])) assets.gemImages[c.key] = Array.from({ length: 6 }, () => '');
        for (let i = 0; i < 6; i++) {
          const rank = i + 1;
          const cur = assets.gemImages[c.key][i] || '';
          if (!isBadAssetValue(cur)) continue;
          const base = isExternalUrl(cur) ? urlBaseName(cur) : '';
          const want = base ? base : `${c.key} ${rank}`;
          const rel = bestRelMatch(rels, want) || bestRelMatch(rels, `${c.label} ${rank}`) || bestRelMatch(rels, `${c.key}_r${rank}`) || bestRelMatch(rels, `rank ${rank} ${c.key}`);
          if (!rel && base) {
            // try match by just base without color
            const rel2 = bestRelMatch(rels, base);
            if (rel2) { setIfMatch(assets.gemImages[c.key], i, rel2); continue; }
          }
          if (!rel) { missing++; continue; }
          assets.gemImages[c.key][i] = normalizePicturePath(`/picture/Gems/${rel}`, 'Gems');
          matched++;
        }
      }
    } else if (key === 'pageIcons') {
      rels = filterRel(pics.items, 'Page');
      assets.pageIcons = assets.pageIcons || {};
      for (const p of (STATE.cfg.pages || DEFAULT_PAGES)) {
        const cur = assets.pageIcons[p.key] || '';
        if (!isBadAssetValue(cur)) continue;
        const base = isExternalUrl(cur) ? urlBaseName(cur) : '';
        const want = base ? base : (p.label || p.key);
        const rel = bestRelMatch(rels, want) || bestRelMatch(rels, p.key);
        setIfMatch(assets.pageIcons, p.key, rel);
      }
    } else if (key === 'colorIcons') {
      rels = filterRel(pics.items, 'Colors');
      assets.colorIcons = assets.colorIcons || {};
      for (const c of GEM_COLORS) {
        const cur = assets.colorIcons[c.key] || '';
        if (!isBadAssetValue(cur)) continue;
        const base = isExternalUrl(cur) ? urlBaseName(cur) : '';
        const want = base ? base : (c.label || c.key);
        const rel = bestRelMatch(rels, want) || bestRelMatch(rels, c.key);
        setIfMatch(assets.colorIcons, c.key, rel);
      }
    } else {
      toast('Nothing to auto match here');
      return;
    }

    toast(`Auto matched: ${matched} • Missing: ${missing}`);
    render();
  }


  function filterRel(items, prefix) {
    const p = String(prefix || '').replace(/\\/g, '/').replace(/^\//, '');
    return items
      .map(it => it.rel)
      .filter(rel => rel && rel.replace(/\\/g, '/').startsWith(p + '/'));
  }

  function makeSelectOptions(rels, category) {
    const opts = [];
    for (const rel of rels) {
      const label = humanLabelFromRel(rel);
      opts.push({ value: `/picture/${category}/${rel}`, label });
    }
    // stable sort by label
    opts.sort((a, b) => a.label.localeCompare(b.label));
    return opts;
  }

  function tryMatchLocalByFilename(current, rels) {
    const cur = String(current || '').trim();
    if (!cur) return '';
    // if already local and present, keep
    if (cur.startsWith('/picture/')) return cur;
    const fname = fileBase(cur.split('?')[0]);
    if (!fname) return '';
    const norm = fname.toLowerCase();
    const hit = rels.find(r => fileBase(r).toLowerCase() === norm);
    return hit ? `/picture/Gems/${hit}` : '';
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

  function clampInt(v, min, max, defVal) {
    const def = Number.isFinite(+defVal) ? parseInt(defVal, 10) : min;
    const n = Number.isFinite(+v) ? parseInt(v, 10) : def;
    return Math.max(min, Math.min(max, n));
  }

  function toNum(v, def = 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : def;
  }

  function clampNonNegNum(v, def = 0) {
    const n = toNum(v, def);
    return Math.max(0, n);
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

  async function fetchJson(u, opt) {
    const r = await fetch(u, opt);
    const j = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, data: j };
  }

  // --------------------------
  // CSS scoping (Gems only)
  // --------------------------
  const GEMS_SCOPE = '#content [data-sla-page="gems"]';

  function scopeCss(css, scope) {
    const scopeChunk = (chunk) => chunk.replace(/(^|})\s*([^{@}][^{]*)\{/g, (m, brace, selectorPart) => {
      const selectors = selectorPart
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)
        .map(sel => {
          if (sel.includes('[data-sla-page="gems"]')) return sel;
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

  function injectLocalStyles() {
    const STYLE_ID = 'sla-gems-style';

    const rawCss = `
      .gems-wrap{max-width:1400px;margin:0 auto}
      .gems-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:14px}
      .gems-title{font-size:26px;font-weight:950;color:#e2e8f0;letter-spacing:.2px}
      .gems-sub{font-size:13px;color:rgba(148,163,184,.92);font-weight:800}

      .pill{height:40px;padding:0 14px;border-radius:12px;border:1px solid rgba(148,163,184,.22);
        background:rgba(15, 23, 42, .55);color:#e2e8f0;font-weight:900;display:inline-flex;align-items:center;gap:8px;cursor:pointer}
      .pill:hover{border-color:rgba(148,163,184,.35);background:rgba(255,255,255,.10);color:#ffffff}
      .pill:active{transform:translateY(1px)}

      .card{border-radius:18px;border:1px solid rgba(148,163,184,.18);background:rgba(2,6,23,.22);padding:14px;min-width:0}
      .cardHead{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
      .cardTitle{font-weight:950;color:#facc15}
      .cardSub{font-size:12px;font-weight:800;color:rgba(148,163,184,.92)}
      .cardBtns{display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end}

      .adminBtn{height:40px;padding:0 14px;border-radius:12px;border:1px solid rgba(148,163,184,.22);background:rgba(255,255,255,.06);
        color:#e2e8f0;font-weight:950;cursor:pointer;white-space:nowrap;outline:none}
      .adminBtn:hover{border-color:rgba(148,163,184,.34);background:rgba(255,255,255,.10);color:#ffffff}
      .adminBtn.primary{background:#facc15;color:#0f172a;border-color:rgba(250,204,21,.85)}
      .adminBtn.primary:hover{background:#fde047}
      .adminBtn.danger{border-color:rgba(239,68,68,.35)}
      .adminBtn.danger:hover{border-color:rgba(239,68,68,.55)}
      .adminBtn:focus{box-shadow:0 0 0 2px rgba(250,204,21,.45)}
      .adminBtn:disabled{opacity:.55;cursor:not-allowed}

      .grid2{display:grid;gap:12px;grid-template-columns:repeat(2,minmax(0,1fr))}
      @media(max-width: 900px){ .grid2{grid-template-columns:1fr} }

      .colorGrid{display:grid;gap:12px;grid-template-columns:repeat(5,minmax(0,1fr))}
      @media(max-width: 1200px){ .colorGrid{grid-template-columns:repeat(3,minmax(0,1fr))} }
      @media(max-width: 720px){ .colorGrid{grid-template-columns:repeat(2,minmax(0,1fr))} }

      .colorCard{border-radius:18px;border:1px solid rgba(148,163,184,.18);background:rgba(15,23,42,.22);padding:12px;min-width:0}
      .colorHead{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px}
      .colorLeft{display:flex;align-items:center;gap:10px;min-width:0}
      .colorIcon{width:28px;height:28px;object-fit:contain;border-radius:10px;border:1px solid rgba(148,163,184,.18);background:rgba(2,6,23,.25)}
      .colorName{font-weight:950;color:#e2e8f0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}

      .muted{opacity:.65}

      .gemTileWrap{display:flex;flex-direction:column;align-items:center;gap:10px}
      .gemTiles{display:flex;flex-wrap:wrap;justify-content:center;gap:10px}
      .gemTile{
        position:relative;
        width:116px;height:116px;
        border-radius:18px;
        border:1px solid rgba(148,163,184,.22);
        overflow:hidden;
        display:flex;align-items:center;justify-content:center;
        box-shadow:inset 0 0 0 1px rgba(2,6,23,.12);
        min-width:0;
      }
      .gemTile:hover{border-color:rgba(148,163,184,.38)}
      .gemTile.is-empty{background:rgba(2,6,23,.20)}
      .gemTile .gemImg{
        width:70%;height:70%;
        object-fit:contain;
        filter:drop-shadow(0 10px 16px rgba(0,0,0,.35));
        pointer-events:none;
      }
      .gemTile .gemEmptyTxt{
        font-weight:950;color:rgba(148,163,184,.90);
        font-size:13px;
        text-align:center;
      }

      .gemTile.rar-1,.gemTile.rar-2{background:linear-gradient(180deg,#2f3a52 0%, #b5c1d9 53%)}
      .gemTile.rar-3{background:linear-gradient(180deg,#0b4b55 0%, #1bdffd 53%)}
      .gemTile.rar-4{background:linear-gradient(180deg,#46254d 0%, #f799ff 53%)}
      .gemTile.rar-5{background:linear-gradient(180deg,#4b3d10 0%, #fdd747 53%)}
      .gemTile.rar-6{background:linear-gradient(180deg,#3f0000 0%, #ff0000 53%)}

      .gemOvStat{
        position:absolute;left:10px;top:10px;
        width:26px;height:26px;
        object-fit:contain;
        filter:drop-shadow(0 8px 10px rgba(0,0,0,.5));
        opacity:.98;
      }
      .gemOvLetter{
        position:absolute;left:10px;bottom:10px;
        width:28px;height:28px;
        object-fit:contain;
        filter:drop-shadow(0 8px 10px rgba(0,0,0,.5));
        opacity:.98;
      }
      .gemOvLetterTxt{
        position:absolute;left:12px;bottom:10px;
        font-weight:1000;font-size:18px;letter-spacing:.5px;
        color:#e2e8f0;
        text-shadow:0 2px 10px rgba(0,0,0,.75);
      }
      .gemOvCount{
        position:absolute;right:10px;top:8px;
        font-weight:1000;font-size:16px;
        color:#e2e8f0;
        text-shadow:0 2px 10px rgba(0,0,0,.75);
      }

      .slotEditRow{
        display:flex;
        gap:8px;
        flex-wrap:wrap;
        justify-content:center;
        margin-top:8px;
        width:100%;
        max-width:100%;
      }

      .bulkTag{
        height:34px;
        display:inline-flex;
        align-items:center;
        padding:0 10px;
        border-radius:999px;
        border:1px solid rgba(148,163,184,.18);
        background:rgba(2,6,23,.20);
        font-weight:950;
        color:rgba(148,163,184,.92);
        font-size:12px;
        white-space:nowrap;
      }

      .bulkCol{
        display:flex;
        flex-direction:column;
        gap:8px;
        align-items:stretch;
        margin:10px 0 10px;
        padding-bottom:10px;
      }
      .bulkCol .bulkTag{justify-content:center}
      .bulkCol .sel{width:100%}

      .bulkSep{
        height:1px;
        width:100%;
        background:rgba(148,163,184,.18);
        margin:6px 0 12px;
        border-radius:999px;
      }

      .sel{
        height:34px;border-radius:12px;border:1px solid rgba(148,163,184,.20);background:rgba(15,23,42,.55);
        color:#e2e8f0;font-weight:900;padding:0 10px;outline:none;
        max-width:100%;
        min-width:0;
      }
      .sel:focus{border-color:rgba(148,163,184,.38)}
      .sel.small{height:34px;font-size:12px}
      .sel:disabled{opacity:.55;cursor:not-allowed}
      .numIn{
        width:88px;height:34px;border-radius:12px;border:1px solid rgba(148,163,184,.20);background:rgba(15,23,42,.55);
        color:#e2e8f0;font-weight:950;text-align:center;outline:none;
        max-width:100%;
        min-width:0;
      }
      .numIn:focus{border-color:rgba(148,163,184,.38)}

      .slotsCol{display:flex;flex-direction:column;gap:10px;align-items:center;padding-top:4px;}

      .adminGrid{display:grid;gap:12px}
      .adminRow{display:flex;gap:10px;flex-wrap:wrap;align-items:center;min-width:0}
      .adminIn{
        height:40px;min-width:0;flex:1;
        max-width:620px;
        padding:0 12px;border-radius:12px;border:1px solid rgba(148,163,184,.20);
        background:rgba(15,23,42,.55);color:#e2e8f0;font-weight:900;outline:none
      }
      .adminIn:focus{border-color:rgba(148,163,184,.38)}
      .nowrap{white-space:nowrap}

      .tblWrap{overflow:auto}
      .tbl{width:100%;border-collapse:separate;border-spacing:0 8px;min-width:980px}
      .tbl th{font-size:12px;text-align:left;opacity:.85;color:rgba(148,163,184,.92)}
      .tbl td{vertical-align:middle}
      .iconMini{width:30px;height:30px;object-fit:contain;opacity:.98;filter:drop-shadow(0 8px 10px rgba(0,0,0,.35))}
      .pageIcon{height:18px;width:auto;object-fit:contain}

      @media(max-width: 720px){
        .gems-title{font-size:22px}
        .gems-sub{font-size:12px}

        #content [data-sla-page="gems"] .gemsTabBtn{
          font-size:13px !important;
          padding-left:8px !important;
          padding-right:8px !important;
          white-space:nowrap !important;
        }

        .slotEditRow{flex-direction:column;align-items:stretch;}
        .slotEditRow .sel,.slotEditRow .numIn{width:100%;}

        .adminRow{flex-direction:column;align-items:stretch;}
        .adminRow .sel,.adminRow .numIn{width:100%;}
      }

      .gemsTabsWrap{display:grid;}
      .gemsTabs1{grid-template-columns:1fr;}
      .gemsTabs2{grid-template-columns:repeat(2,minmax(0,1fr));}
      .gemsTabs3{grid-template-columns:repeat(3,minmax(0,1fr));}

      @media(max-width: 720px){
        .gemsTabsWrap.gemsTabs3{display:flex;width:100%;}
        .gemsTabBtn{flex:1 1 0;min-width:0;}
        .gemsTabBtn.gemsTabRecommended{flex:1.35 1 0;}
      }

      @media(max-width: 720px){
        .pill{height:34px;font-size:12px;padding:0 10px;white-space:nowrap;line-height:1;}
      }

      .gm-center{justify-content:center}
      .gm-grid2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
      @media(max-width: 720px){ .gm-grid2{grid-template-columns:1fr} }
    `;

    const css =
      scopeCss(rawCss, GEMS_SCOPE) +
      '\n' +
      scopeCss(rawCss, '#gems-modal-root');

    let s = document.getElementById(STYLE_ID);
    if (!s) {
      s = document.createElement('style');
      s.id = STYLE_ID;
      s.setAttribute('data-sla-module', 'gems');
      document.head.appendChild(s);
    }
    if (s.textContent !== css) s.textContent = css;
    try { document.head.appendChild(s); } catch {}
  }

  // --------------------------
  // Modal helper (local)
  // --------------------------
  function ensureGemsModal() {
    if (document.getElementById('gems-modal-css')) return;

    const s = document.createElement('style');
    s.id = 'gems-modal-css';
    s.textContent = `
      .gm-backdrop{position:fixed;inset:0;display:none;align-items:center;justify-content:center;z-index:9999;background:rgba(2,6,23,.55);backdrop-filter:blur(2px)}
      .gm-modal{width:min(980px,92vw);border-radius:1rem;border:1px solid rgba(148,163,184,.28);background:rgba(2,6,23,.92);color:#e2e8f0;box-shadow:0 18px 60px rgba(0,0,0,.55);overflow:hidden}
      .gm-hd{padding:14px 16px;border-bottom:1px solid rgba(148,163,184,.20);display:flex;align-items:center;justify-content:space-between;gap:10px}
      .gm-title{font-weight:950;letter-spacing:.2px}
      .gm-x{width:40px;height:40px;border-radius:12px;border:1px solid rgba(148,163,184,.25);background:rgba(255,255,255,.06);color:#e2e8f0;cursor:pointer;font-weight:950;outline:none}
      .gm-bd{padding:16px;max-height:72vh;overflow:auto}
      .gm-tabs{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:14px}
      .gm-tab{height:40px;border-radius:12px;border:1px solid rgba(148,163,184,.28);background:rgba(255,255,255,.06);color:#e2e8f0;font-weight:950;cursor:pointer;outline:none}
      .gm-tab.active{background:#facc15;color:#0f172a;border-color:rgba(250,204,21,.85)}
      .gm-tab:hover{background:rgba(255,255,255,.10);color:#ffffff}
      .gm-tab:focus{box-shadow:0 0 0 2px rgba(250,204,21,.45)}
      .gm-x:hover{background:rgba(255,255,255,.10);color:#ffffff}
      .gm-x:focus{box-shadow:0 0 0 2px rgba(250,204,21,.45)}
      .gm-section{margin-top:14px}
      .gm-h3{font-weight:950;opacity:.95;display:flex;align-items:center;justify-content:center;gap:10px;margin:12px 0}
      .gm-row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;border-radius:16px;border:1px solid rgba(148,163,184,.22);background:rgba(15,23,42,.35)}
      .gm-k{display:flex;align-items:center;gap:10px;font-weight:950}
      .gm-dot{width:10px;height:10px;border-radius:4px}
      .gm-v{font-weight:950}
    `;
    document.head.appendChild(s);

    const root = document.createElement('div');
    root.id = 'gems-modal-root';
    root.className = 'gm-backdrop';
    root.innerHTML = `
      <div class="gm-modal">
        <div class="gm-hd">
          <div class="gm-title" id="gmTitle"></div>
          <button class="gm-x" id="gmClose" type="button">✕</button>
        </div>
        <div class="gm-bd" id="gmBody"></div>
      </div>
    `;
    document.body.appendChild(root);

    function hide() {
      root.style.display = 'none';
      const bd = document.getElementById('gmBody');
      if (bd) bd.innerHTML = '';
    }

    function show(title, bodyBuilder) {
      const t = document.getElementById('gmTitle');
      if (t) t.textContent = title || '';

      const bd = document.getElementById('gmBody');
      if (bd) {
        bd.innerHTML = '';
        const built = (typeof bodyBuilder === 'function') ? bodyBuilder() : null;
        if (built) bd.append(built);
      }

      root.style.display = 'flex';
      const close = document.getElementById('gmClose');
      if (close) close.onclick = hide;
    }

    root.addEventListener('click', (e) => { if (e.target === root) hide(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hide(); });

    window.__gems_hideModal = hide;
    window.__gems_showModal = show;
  }

  function gemsShowModal(title, bodyBuilder) {
    ensureGemsModal();
    window.__gems_showModal?.(title, bodyBuilder);
  }

  // --------------------------
  // Admin visibility (proper + robust)
  // --------------------------
  const LS_HIDE_ADMIN_KEY = 'sla_hide_admin_buttons';

  function getHideAdminButtons() {
    try { return localStorage.getItem(LS_HIDE_ADMIN_KEY) === '1'; } catch { return false; }
  }

  // ✅ robust check (Hunter.js-like tolerance)
  function isAdminUser() {
    const st = window.STATE || {};
    const me = st.me || {};
    return !!(
      st.isAdmin ||
      me.isAdmin ||
      me.admin ||
      me.role === 'admin' ||
      (Array.isArray(me.roles) && me.roles.includes('admin'))
    );
  }

  function isAdminTabVisible() {
    return isAdminUser() && !STATE.ui.hideAdminButtons;
  }

  window.addEventListener('sla:admin-hide-changed', (e) => {
    try {
      const hide = !!e?.detail?.hide;
      STATE.ui.hideAdminButtons = hide;
      if (STATE.subtab === 'admin' && !isAdminTabVisible()) setSubtab('recommended');
      render();
    } catch {}
  });

  // --------------------------
  // Gems definitions (colors + stats)
  // --------------------------
  const GEM_COLORS = [
    {
      key: 'red',
      label: 'Red',
      hex: '#ef4444',
      icon: '',
      statsAll: ['additional_attack', 'attack_pct', 'healing_given_inc'],
      statsR56: ['additional_attack', 'attack_pct']
    },
    {
      key: 'blue',
      label: 'Blue',
      hex: '#3b82f6',
      icon: '',
      statsAll: ['additional_hp', 'hp_pct', 'healing_received_inc'],
      statsR56: ['additional_hp', 'hp_pct']
    },
    {
      key: 'green',
      label: 'Green',
      hex: '#22c55e',
      icon: '',
      statsAll: ['defense_pct', 'additional_defense', 'damage_reduction'],
      statsR56: ['defense_pct', 'additional_defense', 'damage_reduction']
    },
    {
      key: 'orange',
      label: 'Orange',
      hex: '#f59e0b',
      icon: '',
      statsAll: ['precision', 'crit_dmg', 'defense_pen'],
      statsR56: ['precision', 'crit_dmg', 'defense_pen']
    },
    {
      key: 'purple',
      label: 'Purple',
      hex: '#a855f7',
      icon: '',
      statsAll: ['speed', 'additional_mp', 'mp_reduction'],
      statsR56: ['speed', 'additional_mp', 'mp_reduction']
    }
  ];

  const STAT_META = {
    additional_attack: { label: 'Additional Attack', fmt: 'int' },
    attack_pct: { label: 'Attack (%)', fmt: 'pct' },
    healing_given_inc: { label: 'Healing Given Increased', fmt: 'pct' },

    additional_hp: { label: 'Additional HP', fmt: 'int' },
    hp_pct: { label: 'HP (%)', fmt: 'pct' },
    healing_received_inc: { label: 'Healing Received Increase', fmt: 'pct' },

    defense_pct: { label: 'Defense (%)', fmt: 'pct' },
    additional_defense: { label: 'Additional Defense', fmt: 'int' },
    damage_reduction: { label: 'Damage Reduction', fmt: 'pct' },

    precision: { label: 'Precision', fmt: 'int' },
    crit_dmg: { label: 'Critical Hit Damage', fmt: 'int' },
    defense_pen: { label: 'Defense Penetration', fmt: 'pct' },

    speed: { label: 'Speed', fmt: 'int' },
    additional_mp: { label: 'Additional Mana Power', fmt: 'int' },
    mp_reduction: { label: 'Mana Consumption Reduction', fmt: 'int' }
  };

  const LETTERS = ['A', 'B', 'C', 'D'];
  const REC_MAX = 3;

  // --------------------------
  // Pages + limits (admin configurable)
  // --------------------------
  const DEFAULT_PAGES = [
    { key: 'page1', label: 'Page 1', perColor: 8 },
    { key: 'page2', label: 'Page 2', perColor: 4 }
  ];
  const DEFAULT_MAX_GEM = 12;

  function cleanPageKey(v) {
    const key = String(v || '').trim().toLowerCase();
    if (!/^[a-z0-9_]{1,24}$/.test(key)) return '';
    return key;
  }

  function sanitizePagesList(pages) {
    const src = Array.isArray(pages) ? pages : [];
    const out = [];
    const seen = new Set();

    for (const p of src) {
      if (!p || typeof p !== 'object') continue;
      const key = cleanPageKey(p.key);
      if (!key || seen.has(key)) continue;

      const label = String(p.label || '').trim().slice(0, 32) || key.toUpperCase();
      const perColor = clampInt(p.perColor ?? p.slotsPerColor ?? p.maxPerColor ?? 0, 0, 40);

      out.push({ key, label, perColor });
      seen.add(key);
    }

    return out.length ? out : JSON.parse(JSON.stringify(DEFAULT_PAGES));
  }

  function ensurePageIcons(cfg, pages) {
    cfg.assets = cfg.assets || {};
    cfg.assets.pageIcons = cfg.assets.pageIcons || {};
    for (const p of pages) {
      if (typeof cfg.assets.pageIcons[p.key] !== 'string') cfg.assets.pageIcons[p.key] = '';
    }
  }

  function ensureRecommendedBuckets(cfg, pages) {
    cfg.recommended = cfg.recommended || {};
    for (const p of pages) {
      if (!cfg.recommended[p.key] || typeof cfg.recommended[p.key] !== 'object') {
        cfg.recommended[p.key] = Object.fromEntries(GEM_COLORS.map(c => [c.key, []]));
      }
      for (const c of GEM_COLORS) {
        if (!Array.isArray(cfg.recommended[p.key][c.key])) cfg.recommended[p.key][c.key] = [];
      }
    }
  }

  // --------------------------
  // Default config (public/admin)
  // --------------------------
  function emptyStatValues() {
    const out = {};
    for (const c of GEM_COLORS) {
      out[c.key] = {};
      for (const stat of c.statsAll) {
        out[c.key][stat] = {
          1: 0, 2: 0, 3: 0, 4: 0,
          5: { A: 0, B: 0, C: 0, D: 0 },
          6: { A: 0, B: 0, C: 0, D: 0 }
        };
      }
    }
    return out;
  }

  const DEFAULT_ASSETS = {
    pageIcons: Object.fromEntries(DEFAULT_PAGES.map(p => [p.key, ''])),
    statIcons: Object.fromEntries(Object.keys(STAT_META).map(k => [k, ''])),
    letterIcons: { A: '', B: '', C: '', D: '' },
    gemRankImages: Object.fromEntries(GEM_COLORS.map(c => [c.key, { 1:'',2:'',3:'',4:'',5:'',6:'' }])),
    colorIcons: Object.fromEntries(GEM_COLORS.map(c => [c.key, ''])),
    gemImages: Object.fromEntries(GEM_COLORS.map(c => [c.key, Array.from({ length: 6 }, () => '')]))
  };

  const DEFAULT_UNITS = Object.fromEntries(
    Object.keys(STAT_META).map(k => [k, (STAT_META[k]?.fmt === 'pct') ? 'pct' : 'int'])
  );

  const DEFAULT_CFG = {
    pages: JSON.parse(JSON.stringify(DEFAULT_PAGES)),
    maxGem: DEFAULT_MAX_GEM,

    icons: Object.fromEntries(GEM_COLORS.map(c => [c.key, c.icon])),
    values: emptyStatValues(),
    units: JSON.parse(JSON.stringify(DEFAULT_UNITS)),
    assets: JSON.parse(JSON.stringify(DEFAULT_ASSETS)),

    recommended: Object.fromEntries(DEFAULT_PAGES.map(p => [p.key, Object.fromEntries(GEM_COLORS.map(c => [c.key, []]))]))
  };

  // --------------------------
  // State
  // --------------------------
  const LS_SUBTAB = 'gems.ui.subtab';
  const LS_MY_VIEW = 'gems.ui.myview';

  function makeBulkUi(pages) {
    const mk = () =>
      Object.fromEntries(
        GEM_COLORS.map(c => [c.key, { rank: 0, stat: '', letter: 'A' }])
      );

    const list = Array.isArray(pages) && pages.length ? pages : JSON.parse(JSON.stringify(DEFAULT_PAGES));
    return Object.fromEntries(list.map(p => [p.key, mk()]));
  }

  const STATE = {
    subtab: (localStorage.getItem(LS_SUBTAB) || 'recommended'),
    myView: (localStorage.getItem(LS_MY_VIEW) || 'page1'),

    session: { loggedIn: true },

    ui: {
      hideAdminButtons: getHideAdminButtons(),

      editModePages: Object.fromEntries(DEFAULT_PAGES.map(p => [p.key, false])),
      bulk: makeBulkUi(DEFAULT_PAGES),

      adminEdit: {
        recommended: false,
        pages: false,
        colorIcons: false,
        pageIcons: false,
        letterIcons: false,
        statIcons: false,
        gemImages: false,
        units: false
      }
    },

    cfg: JSON.parse(JSON.stringify(DEFAULT_CFG)),

    collection: {
      loaded: false,
      loading: false,
      saving: false,
      dirty: false,
      loadout: null
    },

    loading: false,
    error: null
  };

  function setSubtab(v) {
    STATE.subtab = v;
    try { localStorage.setItem(LS_SUBTAB, v); } catch {}
  }
  function setMyView(v) {
    STATE.myView = v;
    try { localStorage.setItem(LS_MY_VIEW, v); } catch {}
  }

  function getPages() {
    return sanitizePagesList(STATE.cfg?.pages);
  }

  function getPageMeta(pageKey) {
    const pages = getPages();
    return pages.find(p => p.key === pageKey) || pages[0] || { key: 'page1', label: 'Page', perColor: 0 };
  }

  function recPageKey() {
    return getPages()[0]?.key || 'page1';
  }

  function ensureUiForPages() {
    const pages = getPages();

    STATE.ui.editModePages = STATE.ui.editModePages || {};
    for (const p of pages) if (typeof STATE.ui.editModePages[p.key] !== 'boolean') STATE.ui.editModePages[p.key] = false;
    for (const k of Object.keys(STATE.ui.editModePages)) {
      if (!pages.some(p => p.key === k)) delete STATE.ui.editModePages[k];
    }

    STATE.ui.bulk = makeBulkUi(pages);

    if (STATE.myView !== 'all' && !pages.some(p => p.key === STATE.myView)) {
      STATE.myView = pages[0]?.key || 'page1';
      try { localStorage.setItem(LS_MY_VIEW, STATE.myView); } catch {}
    }
  }

  function isAnyMyListEditActive() {
    return Object.values(STATE.ui?.editModePages || {}).some(Boolean);
  }
  function setMyListEdit(pageKey, v) {
    STATE.ui.editModePages[pageKey] = !!v;
  }
  function isMyListEdit(pageKey) {
    return !!STATE.ui.editModePages[pageKey];
  }

  // --------------------------
  // Loadout model helpers
  // --------------------------
  function makeEmptySlots(perColor) {
    const res = {};
    for (const c of GEM_COLORS) {
      res[c.key] = Array.from({ length: perColor }, (_, i) => ({
        id: `${c.key}-${i + 1}`,
        color: c.key,
        stat: '',
        rank: 0,
        letter: null
      }));
    }
    return res;
  }

  function defaultLoadout() {
    const pages = sanitizePagesList(STATE.cfg?.pages);
    const out = {};
    for (const p of pages) out[p.key] = makeEmptySlots(clampInt(p.perColor ?? 0, 0, 40));
    return out;
  }

  function normalizeSlot(slot) {
    const cKey = String(slot?.color || '').toLowerCase();
    const c = GEM_COLORS.find(x => x.key === cKey);
    const color = c ? c.key : 'red';

    const rank = clampInt(slot?.rank ?? 0, 0, 6);
    const letter = (rank >= 5) ? String(slot?.letter || 'A').toUpperCase() : null;

    const allowedStats = (rank >= 5) ? (c?.statsR56 || []) : (c?.statsAll || []);
    const stat = allowedStats.includes(String(slot?.stat || '')) ? String(slot.stat) : '';

    const count = clampInt(slot?.count ?? DEFAULT_MAX_GEM, 1, 999, DEFAULT_MAX_GEM);

    return {
      id: String(slot?.id || ''),
      color,
      stat,
      rank,
      letter: (rank >= 5 && LETTERS.includes(letter)) ? letter : null,
      count
    };
  }

  function normalizeLoadout(lo) {
    const pages = sanitizePagesList(STATE.cfg?.pages);
    const base = {};
    for (const p of pages) base[p.key] = makeEmptySlots(clampInt(p.perColor ?? 0, 0, 40));

    const out = JSON.parse(JSON.stringify(base));
    const src = (lo && typeof lo === 'object') ? lo : {};

    for (const p of pages) {
      const perColor = clampInt(p.perColor ?? 0, 0, 40);
      const srcPage = src[p.key];

      for (const c of GEM_COLORS) {
        const srcArr = Array.isArray(srcPage?.[c.key]) ? srcPage[c.key] : [];
        const dstArr = [];
        for (let i = 0; i < perColor; i++) {
          const slot = normalizeSlot(srcArr[i] || { color: c.key, id: `${c.key}-${i + 1}` });
          slot.id = slot.id || `${c.key}-${i + 1}`;
          delete slot.count;
          dstArr.push(slot);
        }
        out[p.key][c.key] = dstArr;
      }
    }
    return out;
  }

  function isSlotEquipped(s) {
    return !!(s && s.rank >= 1 && s.stat);
  }

  function isRecEquipped(r) {
    return !!(r && r.stat);
  }

  // --------------------------
  // Public config load
  // --------------------------
  function normalizeCfg(cfg) {
    const out = JSON.parse(JSON.stringify(DEFAULT_CFG));

    out.pages = sanitizePagesList(cfg?.pages ?? out.pages);
    out.maxGem = clampInt(cfg?.maxGem ?? cfg?.max_gem ?? cfg?.maxGemCount ?? out.maxGem ?? DEFAULT_MAX_GEM, 1, 999, out.maxGem ?? DEFAULT_MAX_GEM);

    ensurePageIcons(out, out.pages);
    ensureRecommendedBuckets(out, out.pages);

    if (cfg && typeof cfg === 'object') {
      if (cfg.icons && typeof cfg.icons === 'object') {
        for (const c of GEM_COLORS) {
          const v = cfg.icons[c.key];
          if (typeof v === 'string') out.icons[c.key] = v.trim();
        }
      }

      if (cfg.units && typeof cfg.units === 'object') {
        for (const k of Object.keys(out.units)) {
          const v = String(cfg.units[k] || '').trim().toLowerCase();
          if (v === 'pct' || v === 'int' || v === 'flat') out.units[k] = (v === 'flat') ? 'int' : v;
        }
      }

      if (cfg.assets && typeof cfg.assets === 'object') {
        const a = cfg.assets;

        if (a.pageIcons && typeof a.pageIcons === 'object') {
          for (const p of out.pages) {
            const v = a.pageIcons[p.key];
            if (typeof v === 'string') out.assets.pageIcons[p.key] = v.trim();
          }
        }

        if (a.statIcons && typeof a.statIcons === 'object') {
          for (const k of Object.keys(out.assets.statIcons)) {
            const v = a.statIcons[k];
            if (typeof v === 'string') out.assets.statIcons[k] = v.trim();
          }
        }

        if (a.letterIcons && typeof a.letterIcons === 'object') {
          for (const L of LETTERS) {
            const v = a.letterIcons[L];
            if (typeof v === 'string') out.assets.letterIcons[L] = v.trim();
          }
        }

        if (a.gemRankImages && typeof a.gemRankImages === 'object') {
          for (const c of GEM_COLORS) {
            const src = a.gemRankImages[c.key];
            if (!src || typeof src !== 'object') continue;
            for (let r = 1; r <= 6; r++) {
              const v = src[String(r)] ?? src[r];
              if (typeof v === 'string') {
                const vv = v.trim();
                out.assets.gemRankImages[c.key][r] = vv;
                out.assets.gemImages[c.key][r - 1] = vv;
              }
            }
          }
        }

        if (a.colorIcons && typeof a.colorIcons === 'object') {
          for (const c of GEM_COLORS) {
            const v = a.colorIcons[c.key];
            if (typeof v === 'string') out.assets.colorIcons[c.key] = v.trim();
          }
        }

        if (a.gemImages && typeof a.gemImages === 'object') {
          for (const c of GEM_COLORS) {
            const arr = a.gemImages[c.key];
            if (!Array.isArray(arr)) continue;
            out.assets.gemImages[c.key] = Array.from({ length: 6 }, (_, i) => String(arr[i] || '').trim());
          }
        }
      }

      if (cfg.values && typeof cfg.values === 'object') {
        for (const c of GEM_COLORS) {
          for (const stat of c.statsAll) {
            const src = cfg.values?.[c.key]?.[stat];
            if (!src || typeof src !== 'object') continue;

            for (let r = 1; r <= 4; r++) out.values[c.key][stat][r] = clampNonNegNum(src[r], 0);
            for (const r of [5, 6]) {
              const b = src[r];
              if (!b || typeof b !== 'object') continue;
              for (const L of LETTERS) out.values[c.key][stat][r][L] = clampNonNegNum(b[L], 0);
            }
          }
        }
      }

      if (cfg.recommended && typeof cfg.recommended === 'object') {
        const templateKey = out.pages[0]?.key || 'page1';
        const pageKeys = Object.keys(cfg.recommended || {});
        for (const c of GEM_COLORS) {
          const mergedRaw = [];
          for (const pk of pageKeys) {
            const bucket = cfg.recommended?.[pk]?.[c.key];
            if (Array.isArray(bucket)) mergedRaw.push(...bucket);
          }

          const merged = mergedRaw
            .map(normalizeSlot)
            .filter(isRecEquipped)
            .slice(0, REC_MAX)
            .map(x => ({
              color: c.key,
              stat: x.stat,
              rank: 6,
              letter: 'A',
              count: clampInt(x.count ?? out.maxGem, 1, 999, out.maxGem)
            }));

          for (const p of out.pages) out.recommended[p.key][c.key] = [];
          out.recommended[templateKey][c.key] = merged;
        }
      }
    }

    return out;
  }

  async function loadGemsConfig() {
    try {
      const r = await fetch(url('/api/public/gems-config'), { cache: 'no-store' });
      if (!r.ok) return normalizeCfg(DEFAULT_CFG);
      const j = await r.json().catch(() => ({}));
      return normalizeCfg(j);
    } catch (e) {
      derror('loadGemsConfig failed:', e);
      return normalizeCfg(DEFAULT_CFG);
    }
  }

  // --------------------------
  // Per-user loadout load/save
  // --------------------------
  async function loadMyLoadout() {
    if (STATE.collection.loaded || STATE.collection.loading) return;

    const me = window.STATE?.me || null;
    if (!me) {
      STATE.session.loggedIn = false;
      STATE.collection.loadout = normalizeLoadout(null);
      STATE.collection.loaded = true;
      return;
    }

    STATE.collection.loading = true;
    try {
      const r = await fetch(url('/api/gems-loadout'), { credentials: 'include', cache: 'no-store' });

      if (r.status === 401 || r.status === 403) {
        STATE.session.loggedIn = false;
        STATE.collection.loadout = normalizeLoadout(null);
        STATE.collection.loaded = true;
        return;
      }

      STATE.session.loggedIn = true;
      if (!r.ok) {
        STATE.collection.loadout = normalizeLoadout(null);
        STATE.collection.loaded = true;
        return;
      }

      const j = await r.json().catch(() => ({}));
      const lo = (j && typeof j.gemsLoadout === 'object') ? j.gemsLoadout : null;
      STATE.collection.loadout = normalizeLoadout(lo);
      STATE.collection.loaded = true;

      dlog('loadout loaded');
    } catch (e) {
      derror('loadMyLoadout failed:', e);
      STATE.collection.loadout = normalizeLoadout(null);
      STATE.collection.loaded = true;
    } finally {
      STATE.collection.loading = false;
    }
  }

  function buildSavePayload() {
    return { gemsLoadout: STATE.collection.loadout || normalizeLoadout(null) };
  }

  async function saveMyLoadout() {
    if (!STATE.session.loggedIn) return false;
    if (STATE.collection.saving) return false;
    if (!STATE.collection.dirty) return true;

    STATE.collection.saving = true;
    try {
      const payload = buildSavePayload();
      const r = await fetch(url('/api/gems-loadout'), {
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
      toast('Saved');
      dlog('loadout saved');
      return true;
    } catch (e) {
      derror('saveMyLoadout failed:', e);
      toast('Save failed');
      return false;
    } finally {
      STATE.collection.saving = false;
    }
  }

  // --------------------------
  // Admin save config
  // --------------------------
  async function saveAdminConfig(nextCfg) {
    const out = await fetchJson(url('/api/admin/gems-config'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ config: nextCfg })
    });
    if (!out.ok) throw new Error(out?.data?.error || `HTTP ${out.status}`);
    dlog('admin config saved');
    return true;
  }

  // --------------------------
  // Stats compute
  // --------------------------
  function slotValue(slot) {
    if (!isSlotEquipped(slot)) return 0;
    const c = slot.color;
    const s = slot.stat;
    const r = slot.rank;
    if (!STATE.cfg?.values?.[c]?.[s]) return 0;

    const v = STATE.cfg.values[c][s][r];
    if (r >= 5) return toNum(v?.[slot.letter || 'A'], 0);
    return toNum(v, 0);
  }

  function collectSlots(view) {
    const lo = STATE.collection.loadout || normalizeLoadout(null);
    const pages = getPages();

    if (view && view !== 'all') {
      const p = pages.find(x => x.key === view);
      if (!p) return [];
      return GEM_COLORS.flatMap(c => (lo[p.key]?.[c.key] || []));
    }

    return GEM_COLORS.flatMap(c => pages.flatMap(p => (lo[p.key]?.[c.key] || [])));
  }

  function countByColor(view) {
    const slots = collectSlots(view);
    const out = Object.fromEntries(GEM_COLORS.map(c => [c.key, 0]));
    for (const s of slots) {
      if (isSlotEquipped(s)) out[s.color]++;
    }
    return out;
  }

  function totalsByStat(view) {
    const slots = collectSlots(view);
    const totals = {};
    for (const s of slots) {
      if (!isSlotEquipped(s)) continue;
      totals[s.stat] = (totals[s.stat] || 0) + slotValue(s);
    }
    return totals;
  }

  function formatStat(statKey, val) {
    const unit = (STATE.cfg?.units?.[statKey]) || (STAT_META[statKey]?.fmt) || 'int';
    const n = toNum(val, 0);

    const fmtDec = (x) => {
      const s = Number(x).toFixed(2);
      return s.replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
    };

    if (unit === 'pct') return `${fmtDec(n)}%`;

    if (Math.abs(n - Math.round(n)) > 1e-9) return fmtDec(n);
    return Math.round(n).toLocaleString('en-US');
  }

  // --------------------------
  // UI helpers
  // --------------------------
  function renderHeader(root) {
    const top = el('div', { class: 'gems-head' });

    top.append(
      el('div', { class: 'min-w-0' },
        el('div', { class: 'text-2xl font-extrabold text-yellow-400 leading-tight' }, 'GEMS'),
        el('div', { class: 'text-sm text-slate-300/90' }, 'Build your Page 1 & Page 2 gem setup, and see exact stat totals.')
      )
    );

    const right = el('div', { class: 'flex items-center gap-2 flex-wrap justify-end' });

    const btnInfo = el('button', { class: 'pill', type: 'button', title: 'Open Gem Info' }, 'Gem Info');
    btnInfo.addEventListener('click', () => openGemInfoModal());

    right.append(btnInfo);
    top.append(right);
    root.append(top);
  }

  function renderSubtabs(root) {
    const tabs = [
      { key: 'recommended', label: 'Recommended' }
    ];
    if (STATE.session.loggedIn) tabs.push({ key: 'list', label: 'My list' });
    if (isAdminTabVisible()) tabs.push({ key: 'admin', label: 'Admin' });

    const cols = tabs.length;
    const tabsClass = cols === 3 ? 'gemsTabs3' : cols === 2 ? 'gemsTabs2' : 'gemsTabs1';
    const bar = el('div', { class: 'gemsTabsWrap mb-4 gap-2 ' + tabsClass });

    const btn = (key, label) => {
      const active = STATE.subtab === key;
      const extra =
        key === 'recommended' ? ' gemsTabRecommended'
          : key === 'list' ? ' gemsTabMyList'
            : ' gemsTabAdmin';

      const b = el('button', {
        class:
          'gemsTabBtn' + extra + ' h-10 rounded-xl border border-white/10 font-semibold transition-colors text-[13px] sm:text-base px-2 sm:px-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400/50 ' +
          (active
            ? 'bg-yellow-400 text-black'
            : 'bg-glass text-slate-200 hover:bg-white/10 hover:text-white'),
        type: 'button'
      }, label);

      b.addEventListener('click', async () => {
        if (STATE.subtab === key) return;

        if (STATE.subtab === 'list' && isAnyMyListEditActive()) {
          const ok = await saveMyLoadout();
          if (!ok) toast('Save failed');
          for (const p of getPages()) setMyListEdit(p.key, false);
        }

        setSubtab(key);
        if (key === 'list') await loadMyLoadout();

        render();
      });

      return b;
    };

    if (STATE.subtab === 'admin' && !isAdminTabVisible()) setSubtab('recommended');
    if (STATE.subtab === 'list' && !STATE.session.loggedIn) setSubtab('recommended');
    for (const t of tabs) bar.append(btn(t.key, t.label));
    root.append(bar);
  }

  function gemColorIcon(cKey) {
    const u =
      STATE.cfg?.assets?.colorIcons?.[cKey] ||
      STATE.cfg?.icons?.[cKey] ||
      GEM_COLORS.find(x => x.key === cKey)?.icon ||
      '';
    return cdnySafe(u, 64);
  }

  function gemRankImage(colorKey, rank) {
    const r = clampInt(rank, 1, 6, 1);

    const map = STATE.cfg?.assets?.gemRankImages?.[colorKey];
    let u = '';

    if (Array.isArray(map)) {
      u = String(map[r - 1] || '').trim();
    } else if (map && typeof map === 'object') {
      u = String(map[String(r)] ?? map[r] ?? '').trim();
    }

    if (!u) {
      const arr = STATE.cfg?.assets?.gemImages?.[colorKey];
      if (Array.isArray(arr)) u = String(arr[r - 1] || '').trim();
    }

    const out = cdnySafe(u, 160);
    return out || u || '';
  }

  function statIconUrl(statKey) {
    const u = STATE.cfg?.assets?.statIcons?.[statKey] || '';
    return cdnySafe(u, 48);
  }

  function letterIconUrl(letter) {
    const u = STATE.cfg?.assets?.letterIcons?.[letter] || '';
    return cdnySafe(u, 40);
  }

  function pageIconUrl(pageKey) {
    const u = STATE.cfg?.assets?.pageIcons?.[pageKey] || '';
    return cdnySafe(u, 48);
  }

  function renderMaybeIcon(urlStr, cls, alt) {
    const u = urlStr || '';
    if (!u) return null;
    return el('img', { class: cls, src: u, alt: alt || '', loading: 'lazy', decoding: 'async' });
  }

  function rarityClassFromRank(rank) {
    const r = clampInt(rank, 0, 6);
    if (r <= 0) return '';
    if (r === 1) return 'rar-1';
    if (r === 2) return 'rar-2';
    if (r === 3) return 'rar-3';
    if (r === 4) return 'rar-4';
    if (r === 5) return 'rar-5';
    if (r === 6) return 'rar-6';
    return '';
  }

  function buildGemTile({ colorKey, statKey, rank, letter, count, emptyText, showCount, showLetter, title }) {
    const r = clampInt(rank || 0, 0, 6);
    const tile = el('div', {
      class: `gemTile ${r ? rarityClassFromRank(r) : ''} ${r ? '' : 'is-empty'}`,
      title: title || ''
    });

    if (!r || !statKey) {
      tile.append(el('div', { class: 'gemEmptyTxt' }, emptyText || 'Empty'));
      return tile;
    }

    const imgUrl = gemRankImage(colorKey, r);
    if (imgUrl) tile.append(el('img', { class: 'gemImg', src: imgUrl, alt: 'Gem', loading: 'lazy', decoding: 'async' }));

    const sIco = statIconUrl(statKey);
    if (sIco) tile.append(el('img', { class: 'gemOvStat', src: sIco, alt: STAT_META[statKey]?.label || statKey, loading: 'lazy', decoding: 'async' }));

    if (showLetter) {
      const lIco = letterIconUrl(letter || 'A');
      if (lIco) tile.append(el('img', { class: 'gemOvLetter', src: lIco, alt: String(letter || 'A'), loading: 'lazy', decoding: 'async' }));
      else tile.append(el('div', { class: 'gemOvLetterTxt' }, String(letter || 'A')));
    }

    if (showCount) {
      tile.append(el('div', { class: 'gemOvCount' }, `x${clampInt(count ?? (STATE.cfg?.maxGem ?? DEFAULT_MAX_GEM), 1, 999, (STATE.cfg?.maxGem ?? DEFAULT_MAX_GEM))}`));
    }

    return tile;
  }

  // --------------------------
  // Gem Info modal
  // --------------------------
  function openGemInfoModal() {
    const build = () => {
      const wrap = el('div');

      const tabs = el('div', { class: 'gm-tabs' });
      const makeTab = (key, label) => {
        const b = el('button', { class: `gm-tab ${STATE.myView === key ? 'active' : ''}`, type: 'button' }, label);
        b.addEventListener('click', () => {
          setMyView(key);
          gemsShowModal('Gem Info', build);
        });
        return b;
      };

      const pages = getPages();

      tabs.append(
        makeTab('all', 'All'),
        ...pages.map(p => {
          const u = pageIconUrl(p.key);
          return makeTab(p.key, u ? renderMaybeIcon(u, 'pageIcon', p.label) : p.label);
        })
      );

      wrap.append(tabs);

      wrap.append(el('div', { class: 'gm-h3' }, 'Equipped Gems'));
      const byColor = countByColor(STATE.myView === 'all' ? 'all' : STATE.myView);

      const eq = el('div', { class: 'gm-row gm-center' },
        el('div', { class: 'gm-k', style: 'gap:18px;flex-wrap:wrap;justify-content:center' },
          ...GEM_COLORS.map(c => {
            const box = el('div', { class: 'gm-k', title: c.label, style: 'gap:10px' },
              el('div', { class: 'gm-dot', style: `background:${c.hex}` }),
              el('span', { class: 'gm-v' }, String(byColor[c.key] || 0))
            );
            return box;
          })
        )
      );
      wrap.append(eq);

      wrap.append(el('div', { class: 'gm-h3' }, 'Stat Details'));
      const totals = totalsByStat(STATE.myView === 'all' ? 'all' : STATE.myView);

      const keys = Object.keys(STAT_META);
      const rows = keys
        .map(k => ({ k, v: toNum(totals[k], 0) }))
        .filter(x => x.v !== 0);

      if (!rows.length) {
        wrap.append(el('div', { class: 'gm-row', style: 'justify-content:center;opacity:.8' }, 'No gems equipped in this view.'));
        return wrap;
      }

      const grid = el('div', { class: 'gm-grid2' });
      for (const r of rows) {
        const meta = STAT_META[r.k];
        grid.append(
          el('div', { class: 'gm-row' },
            el('div', { class: 'gm-k' }, renderMaybeIcon(statIconUrl(r.k), 'iconMini', meta?.label || r.k), meta?.label || r.k),
            el('div', { class: 'gm-v' }, formatStat(r.k, r.v))
          )
        );
      }
      wrap.append(grid);

      return wrap;
    };

    gemsShowModal('Gem Info', build);
  }

  // --------------------------
  // Recommended helpers + UI
  // --------------------------
  function getRecommendedArr(colorKey) {
    const pk = recPageKey();
    const arr = Array.isArray(STATE.cfg?.recommended?.[pk]?.[colorKey]) ? STATE.cfg.recommended[pk][colorKey] : [];
    const maxGem = clampInt(STATE.cfg?.maxGem ?? DEFAULT_MAX_GEM, 1, 999, DEFAULT_MAX_GEM);
    return arr
      .map(normalizeSlot)
      .filter(isRecEquipped)
      .slice(0, REC_MAX)
      .map(x => ({ color: colorKey, stat: x.stat, rank: 6, letter: 'A', count: clampInt(x.count ?? maxGem, 1, 999, maxGem) }));
  }

  function setRecommendedArr(colorKey, nextArr) {
    const pk = recPageKey();
    const maxGem = clampInt(STATE.cfg?.maxGem ?? DEFAULT_MAX_GEM, 1, 999, DEFAULT_MAX_GEM);

    const cleaned = (Array.isArray(nextArr) ? nextArr : [])
      .slice(0, REC_MAX)
      .map(x => normalizeSlot({ ...x, color: colorKey, rank: 6, letter: 'A' }))
      .filter(isRecEquipped)
      .map(x => ({ color: colorKey, stat: x.stat, rank: 6, letter: 'A', count: clampInt(x.count ?? maxGem, 1, 999, maxGem) }));

    ensureRecommendedBuckets(STATE.cfg, getPages());
    for (const p of getPages()) STATE.cfg.recommended[p.key][colorKey] = [];
    STATE.cfg.recommended[pk][colorKey] = cleaned;
  }

  function renderRecommended(root) {
    const card = el('div', { class: 'card' });
    card.append(
      el('div', { class: 'cardHead' },
        el('div', { class: 'min-w-0' },
          el('div', { class: 'cardTitle' }, 'Recommended')
        )
      )
    );

    const colorGrid = el('div', { class: 'colorGrid mt-3' });

    for (const c of GEM_COLORS) {
      const items = getRecommendedArr(c.key);

      const cc = el('div', { class: 'colorCard' });
      const icon = gemColorIcon(c.key);

      cc.append(
        el('div', { class: 'colorHead' },
          el('div', { class: 'colorLeft' },
            icon ? el('img', { class: 'colorIcon', src: icon, alt: c.label, loading: 'lazy', decoding: 'async' }) : null,
            el('div', { class: 'colorName' }, c.label)
          )
        )
      );

      const tiles = el('div', { class: 'gemTiles' });

      if (!items.length) {
        tiles.append(buildGemTile({ rank: 0, statKey: '', emptyText: 'Not set' }));
      } else {
        const multi = items.length >= 2;
        for (const it of items) {
          const title = STAT_META[it.stat]?.label || it.stat;
          tiles.append(
            buildGemTile({
              colorKey: c.key,
              statKey: it.stat,
              rank: 6,
              letter: 'A',
              count: multi ? it.count : (STATE.cfg?.maxGem ?? DEFAULT_MAX_GEM),
              showCount: true,
              showLetter: true,
              title
            })
          );
        }
      }

      cc.append(el('div', { class: 'gemTileWrap' }, tiles));
      colorGrid.append(cc);
    }

    card.append(colorGrid);
    root.append(card);
  }

  // --------------------------
  // My list tab
  // --------------------------
  function setSlot(pageKey, colorKey, idx, patch) {
    const lo = STATE.collection.loadout || (STATE.collection.loadout = normalizeLoadout(null));
    const arr = lo?.[pageKey]?.[colorKey];
    if (!Array.isArray(arr) || !arr[idx]) return;

    const next = normalizeSlot({ ...arr[idx], ...(patch || {}) });

    if (next.rank <= 0) {
      next.stat = '';
      next.letter = null;
    }
    if (next.rank >= 5) {
      next.letter = next.letter || 'A';
    } else {
      next.letter = null;
    }

    delete next.count;

    arr[idx] = next;
    STATE.collection.dirty = true;
  }

  function renderSlotsCard(pageKey, title, subtitle) {
    const lo = STATE.collection.loadout || normalizeLoadout(null);
    const meta = getPageMeta(pageKey);
    const perColor = clampInt(meta.perColor ?? 0, 0, 40);

    const card = el('div', { class: 'card' });

    const pageIco = pageIconUrl(pageKey);

    const headLeft = el('div', { class: 'min-w-0' },
      el('div', { class: 'cardTitle', style: 'display:flex;align-items:center;gap:10px' },
        (pageIco ? renderMaybeIcon(pageIco, 'pageIcon', title) : null),
        title
      ),
      el('div', { class: 'cardSub' }, subtitle)
    );

    const headRight = el('div', { class: 'cardBtns' });

    if (STATE.session.loggedIn) {
      const isEdit = isMyListEdit(pageKey);

      const btn = el('button', {
        class: `adminBtn ${isEdit ? 'primary' : ''}`,
        type: 'button'
      }, isEdit ? 'SAVE & EXIT' : 'EDIT');

      btn.addEventListener('click', async () => {
        const now = isMyListEdit(pageKey);
        if (now) {
          const ok = await saveMyLoadout();
          if (!ok) toast('Save failed');
          setMyListEdit(pageKey, false);
          render();
          return;
        }
        setMyListEdit(pageKey, true);
        render();
      });

      headRight.append(btn);
    } else {
      headRight.append(el('div', { class: 'pill muted', title: 'Log in to edit your list' }, 'Login to edit'));
    }

    card.append(el('div', { class: 'cardHead' }, headLeft, headRight));

    const colorGrid = el('div', { class: 'colorGrid mt-3' });

    for (const c of GEM_COLORS) {
      const cc = el('div', { class: 'colorCard' });
      const icon = gemColorIcon(c.key);

      const equippedCount = (lo?.[pageKey]?.[c.key] || []).filter(isSlotEquipped).length;

      cc.append(
        el('div', { class: 'colorHead' },
          el('div', { class: 'colorLeft' },
            icon ? el('img', { class: 'colorIcon', src: icon, alt: c.label, loading: 'lazy', decoding: 'async' }) : null,
            el('div', { class: 'colorName' }, c.label)
          ),
          el('div', { class: 'cardSub muted' }, `${equippedCount}/${perColor}`)
        )
      );

      if (isMyListEdit(pageKey)) {
        const bulk = (STATE.ui?.bulk?.[pageKey]?.[c.key]) || { rank: 0, stat: '', letter: 'A' };

        const bulkCol = el('div', { class: 'bulkCol' });
        const tag = el('div', { class: 'bulkTag', title: 'Apply to all slots in this color' }, 'ALL');

        const selBulkRank = el('select', { class: 'sel small', title: 'Set Rank for all slots' });
        selBulkRank.append(el('option', { value: '0' }, 'Rank…'));
        selBulkRank.append(el('option', { value: '0' }, 'Empty'));
        for (let r = 1; r <= 6; r++) selBulkRank.append(el('option', { value: String(r) }, `Rank ${r}`));
        selBulkRank.value = String(clampInt(bulk.rank ?? 0, 0, 6));

        const selBulkStat = el('select', { class: 'sel small', title: 'Set Stat for all slots' });

        const selBulkLetter = el('select', { class: 'sel small', title: 'Set Letter for all slots' });
        for (const L of LETTERS) selBulkLetter.append(el('option', { value: L }, L));
        selBulkLetter.value = LETTERS.includes(String(bulk.letter || 'A')) ? String(bulk.letter) : 'A';

        const rebuildBulkStatOptions = (rank) => {
          const rr = clampInt(rank, 0, 6);
          const allowed = (rr >= 5) ? c.statsR56 : c.statsAll;

          selBulkStat.innerHTML = '';
          selBulkStat.append(el('option', { value: '' }, 'Stat…'));
          for (const sKey of allowed) selBulkStat.append(el('option', { value: sKey }, STAT_META[sKey]?.label || sKey));

          selBulkStat.disabled = !(rr >= 1);

          const want = String(bulk.stat || '');
          selBulkStat.value = (rr >= 1 && allowed.includes(want)) ? want : '';

          selBulkLetter.style.display = (rr >= 5) ? '' : 'none';
        };

        const applyBulkAll = ({ rankVal, statVal, letterVal }) => {
          const rank = clampInt(rankVal, 0, 6);
          const allowed = (rank >= 5) ? c.statsR56 : c.statsAll;

          const stat = (rank >= 1 && allowed.includes(statVal)) ? statVal : '';
          const letter = (rank >= 5 && LETTERS.includes(letterVal)) ? letterVal : null;

          bulk.rank = rank;
          bulk.stat = stat;
          bulk.letter = letterVal || 'A';

          for (let i = 0; i < perColor; i++) {
            setSlot(pageKey, c.key, i, {
              rank,
              stat: (rank >= 1) ? stat : '',
              letter: (rank >= 5) ? (letter || 'A') : null
            });
          }
        };

        rebuildBulkStatOptions(selBulkRank.value);

        selBulkRank.addEventListener('change', () => {
          const rr = clampInt(selBulkRank.value, 0, 6);
          const allowed = (rr >= 5) ? c.statsR56 : c.statsAll;
          const currentStat = allowed.includes(selBulkStat.value || '') ? (selBulkStat.value || '') : '';

          applyBulkAll({
            rankVal: rr,
            statVal: (rr >= 1) ? currentStat : '',
            letterVal: selBulkLetter.value || 'A'
          });

          rebuildBulkStatOptions(rr);
          render();
        });

        selBulkStat.addEventListener('change', () => {
          const rr = clampInt(selBulkRank.value, 0, 6);
          if (rr < 1) return;

          applyBulkAll({
            rankVal: rr,
            statVal: selBulkStat.value || '',
            letterVal: selBulkLetter.value || 'A'
          });

          render();
        });

        selBulkLetter.addEventListener('change', () => {
          const rr = clampInt(selBulkRank.value, 0, 6);
          if (rr < 5) return;

          applyBulkAll({
            rankVal: rr,
            statVal: selBulkStat.value || '',
            letterVal: selBulkLetter.value || 'A'
          });

          render();
        });

        bulkCol.append(tag, selBulkRank, selBulkStat, selBulkLetter);
        cc.append(bulkCol);
        cc.append(el('div', { class: 'bulkSep' }));
      }

      const slotsCol = el('div', { class: 'slotsCol' });

      for (let i = 0; i < perColor; i++) {
        const slot = lo?.[pageKey]?.[c.key]?.[i] || { color: c.key, rank: 0, stat: '', letter: null };

        const isEq = isSlotEquipped(slot);
        const titleTxt = isEq
          ? `${STAT_META[slot.stat]?.label || slot.stat} • ${formatStat(slot.stat, slotValue(slot))}`
          : 'Empty';

        const tile = buildGemTile({
          colorKey: c.key,
          statKey: slot.stat,
          rank: slot.rank,
          letter: slot.letter || 'A',
          showCount: false,
          showLetter: (slot.rank >= 5 && !!slot.stat),
          emptyText: 'Empty',
          title: titleTxt
        });

        slotsCol.append(tile);

        if (!isMyListEdit(pageKey)) continue;

        const allowedStats = (slot.rank >= 5) ? c.statsR56 : c.statsAll;

        const selRank = el('select', { class: 'sel small', title: 'Rank' });
        selRank.append(el('option', { value: '0' }, 'Empty'));
        for (let r = 1; r <= 6; r++) selRank.append(el('option', { value: String(r) }, `Rank ${r}`));
        selRank.value = String(slot.rank || 0);

        const selStat = el('select', { class: 'sel small', title: 'Stat' });
        selStat.append(el('option', { value: '' }, 'Stat…'));
        for (const sKey of allowedStats) selStat.append(el('option', { value: sKey }, STAT_META[sKey]?.label || sKey));
        selStat.value = slot.stat || '';
        selStat.disabled = !(clampInt(selRank.value, 0, 6) >= 1);

        const selLetter = el('select', { class: 'sel small', title: 'Letter', style: (slot.rank >= 5 ? '' : 'display:none') });
        for (const L of LETTERS) selLetter.append(el('option', { value: L }, L));
        selLetter.value = slot.letter || 'A';

        const onRankChange = () => {
          const rank = clampInt(selRank.value, 0, 6);

          selStat.disabled = !(rank >= 1);

          const newAllowed = (rank >= 5) ? c.statsR56 : c.statsAll;

          const curStat = selStat.value || '';
          const keep = (rank >= 1 && newAllowed.includes(curStat)) ? curStat : '';

          selStat.innerHTML = '';
          selStat.append(el('option', { value: '' }, 'Stat…'));
          for (const sKey of newAllowed) selStat.append(el('option', { value: sKey }, STAT_META[sKey]?.label || sKey));
          selStat.value = keep;

          selLetter.style.display = (rank >= 5) ? '' : 'none';
          if (rank >= 5 && !LETTERS.includes(selLetter.value)) selLetter.value = 'A';

          setSlot(pageKey, c.key, i, {
            rank,
            stat: (rank >= 1) ? (selStat.value || '') : '',
            letter: (rank >= 5) ? selLetter.value : null
          });

          render();
        };

        selRank.addEventListener('change', onRankChange);

        selStat.addEventListener('change', () => {
          if (selStat.disabled) return;
          setSlot(pageKey, c.key, i, { stat: selStat.value || '' });
          render();
        });

        selLetter.addEventListener('change', () => {
          setSlot(pageKey, c.key, i, { letter: selLetter.value || 'A' });
          render();
        });

        slotsCol.append(
          el('div', { class: 'slotEditRow' }, selRank, selStat),
          el('div', { class: 'slotEditRow' }, selLetter)
        );
      }

      cc.append(slotsCol);
      colorGrid.append(cc);
    }

    card.append(colorGrid);
    return card;
  }

  function renderMyList(root) {
    if (STATE.collection.loading && !STATE.collection.loaded) {
      root.append(el('div', { class: 'p-6 text-center text-slate-500 dark:text-slate-400' }, 'Loading…'));
      return;
    }

    if (!STATE.collection.loadout) STATE.collection.loadout = normalizeLoadout(null);

    const pages = getPages();
    for (let i = 0; i < pages.length; i++) {
      const p = pages[i];
      const total = (p.perColor || 0) * GEM_COLORS.length;
      const sub = `${p.perColor} slots per color (${total} total)`;
      root.append(renderSlotsCard(p.key, p.label, sub));
      if (i !== pages.length - 1) root.append(el('div', { style: 'height:12px' }));
    }
  }

  // --------------------------
  // Admin tab
  // --------------------------
  function adminToggle(key, v) {
    STATE.ui.adminEdit[key] = (typeof v === 'boolean') ? v : !STATE.ui.adminEdit[key];
    render();
  }

  function renderAdminRecommendedCard() {
    const isEdit = !!STATE.ui.adminEdit.recommended;

    const card = el('div', { class: 'card' });
    const head = el('div', { class: 'cardHead' },
      el('div', { class: 'min-w-0' },
        el('div', { class: 'cardTitle' }, 'Recommended'),
        el('div', { class: 'cardSub' }, 'Set up to 3 recommended gems per color (always Rank 6-A). If only 1 gem → it will display xMax Gem automatically.')
      ),
      el('div', { class: 'cardBtns' },
        el('button', { class: `adminBtn ${isEdit ? 'primary' : ''}`, type: 'button' }, isEdit ? 'EXIT' : 'EDIT'),
        el('button', { class: 'adminBtn', type: 'button', disabled: !isEdit }, 'AUTO MATCH'),
        el('button', { class: 'adminBtn primary', type: 'button', disabled: !isEdit }, 'SAVE')
      )
    );

    const btnEdit = head.querySelectorAll('button')[0];
    const btnAuto = head.querySelectorAll('button')[1];
    const btnSave = head.querySelectorAll('button')[2];

    btnEdit.addEventListener('click', () => adminToggle('recommended'));
    btnSave.addEventListener('click', async () => {
      try {
        const next = normalizeCfg(STATE.cfg);
        await saveAdminConfig(next);
        toast('Saved');
        STATE.cfg = await loadGemsConfig();
        ensureUiForPages();
        STATE.ui.adminEdit.recommended = false;
        render();
      } catch (e) {
        derror(e);
        toast('Save failed');
      }
    });

    card.append(head);

    const grid = el('div', { class: 'colorGrid mt-3' });

    for (const c of GEM_COLORS) {
      const cc = el('div', { class: 'colorCard' });
      const icon = gemColorIcon(c.key);

      cc.append(
        el('div', { class: 'colorHead' },
          el('div', { class: 'colorLeft' },
            icon ? el('img', { class: 'colorIcon', src: icon, alt: c.label, loading: 'lazy', decoding: 'async' }) : null,
            el('div', { class: 'colorName' }, c.label)
          )
        )
      );

      const items = getRecommendedArr(c.key);
      const multi = items.length >= 2;

      if (!items.length && !isEdit) {
        const tiles = el('div', { class: 'gemTiles' });
        tiles.append(buildGemTile({ rank: 0, statKey: '', emptyText: 'Not set' }));
        cc.append(tiles);
        grid.append(cc);
        continue;
      }

      const rows = el('div', { class: 'adminGrid' });

      function commit(newArr) {
        setRecommendedArr(c.key, newArr);
      }

      const ensureAtLeastOne = () => {
        if (!items.length) {
          const firstStat = c.statsR56?.[0] || c.statsAll?.[0] || '';
          commit([{ color: c.key, stat: firstStat, rank: 6, letter: 'A', count: (STATE.cfg?.maxGem ?? DEFAULT_MAX_GEM) }]);
        }
      };

      if (isEdit) ensureAtLeastOne();

      const cur = getRecommendedArr(c.key);

      for (let i = 0; i < Math.max(cur.length, isEdit ? 1 : 0); i++) {
        const it = cur[i] || { color: c.key, stat: '', rank: 6, letter: 'A', count: (STATE.cfg?.maxGem ?? DEFAULT_MAX_GEM) };
        const titleTxt = STAT_META[it.stat]?.label || it.stat || '—';

        const row = el('div', { class: 'adminRow' });

        row.append(
          buildGemTile({
            colorKey: c.key,
            statKey: it.stat,
            rank: 6,
            letter: 'A',
            count: (multi ? it.count : (STATE.cfg?.maxGem ?? DEFAULT_MAX_GEM)),
            showCount: true,
            showLetter: true,
            emptyText: 'Not set',
            title: titleTxt
          })
        );

        if (!isEdit) {
          rows.append(row);
          continue;
        }

        const selStat = el('select', { class: 'sel small', title: 'Stat' });
        selStat.append(el('option', { value: '' }, 'Stat…'));
        for (const sKey of c.statsR56) selStat.append(el('option', { value: sKey }, STAT_META[sKey]?.label || sKey));
        selStat.value = it.stat || '';

        const countIn = el('input', { class: 'numIn', type: 'number', min: '1', step: '1', value: String(clampInt(it.count ?? (STATE.cfg?.maxGem ?? DEFAULT_MAX_GEM), 1, 999, (STATE.cfg?.maxGem ?? DEFAULT_MAX_GEM))) });
        if (!multi && cur.length <= 1) countIn.value = String(clampInt(STATE.cfg?.maxGem ?? DEFAULT_MAX_GEM, 1, 999, DEFAULT_MAX_GEM));

        const btnDel = el('button', { class: 'adminBtn danger', type: 'button', disabled: cur.length <= 1 }, 'Remove');

        selStat.addEventListener('change', () => {
          const next = getRecommendedArr(c.key);
          next[i] = { ...next[i], stat: selStat.value || '', rank: 6, letter: 'A', count: clampInt(countIn.value, 1, 999) };
          commit(next.filter(isRecEquipped));
          render();
        });
        countIn.addEventListener('input', () => {
          const next = getRecommendedArr(c.key);
          next[i] = { ...next[i], stat: selStat.value || '', rank: 6, letter: 'A', count: clampInt(countIn.value, 1, 999) };
          commit(next.filter(isRecEquipped));
          render();
        });
        btnDel.addEventListener('click', () => {
          const next = getRecommendedArr(c.key);
          next.splice(i, 1);
          if (!next.length) {
            const firstStat = c.statsR56?.[0] || '';
            next.push({ color: c.key, stat: firstStat, rank: 6, letter: 'A', count: (STATE.cfg?.maxGem ?? DEFAULT_MAX_GEM) });
          }
          commit(next);
          render();
        });

        row.append(selStat);
        if (cur.length >= 2) row.append(countIn);
        row.append(btnDel);

        rows.append(row);
      }

      if (isEdit) {
        const btnAdd = el('button', { class: 'adminBtn', type: 'button', disabled: getRecommendedArr(c.key).length >= REC_MAX }, '+ Add gem');
        btnAdd.addEventListener('click', () => {
          const next = getRecommendedArr(c.key);
          if (next.length >= REC_MAX) return;
          const firstStat = c.statsR56?.[0] || '';
          next.push({ color: c.key, stat: firstStat, rank: 6, letter: 'A', count: (STATE.cfg?.maxGem ?? DEFAULT_MAX_GEM) });
          commit(next);
          render();
        });
        rows.append(btnAdd);
      }

      cc.append(rows);
      grid.append(cc);
    }

    card.append(grid);
    return card;
  }

  function renderAdminUnitsCard() {
    const isEdit = !!STATE.ui.adminEdit.units;

    const card = el('div', { class: 'card' });
    const head = el('div', { class: 'cardHead' },
      el('div', { class: 'min-w-0' },
        el('div', { class: 'cardTitle' }, 'Stat units'),
        el('div', { class: 'cardSub' }, 'Choose if each stat displays as % or flat.')
      ),
      el('div', { class: 'cardBtns' },
        el('button', { class: `adminBtn ${isEdit ? 'primary' : ''}`, type: 'button' }, isEdit ? 'EXIT' : 'EDIT'),
        el('button', { class: 'adminBtn', type: 'button' }, 'AUTO MATCH'),
        el('button', { class: 'adminBtn primary', type: 'button', disabled: !isEdit }, 'SAVE')
      )
    );
    const btnEdit = head.querySelectorAll('button')[0];
    const btnSave = head.querySelectorAll('button')[1];

    btnEdit.addEventListener('click', () => adminToggle('units'));
    btnSave.addEventListener('click', async () => {
      try {
        const next = normalizeCfg(STATE.cfg);
        // backend expects pct|flat
        for (const k of Object.keys(STAT_META)) {
          const v = (STATE.cfg?.units?.[k] === 'pct') ? 'pct' : 'flat';
          next.units[k] = v;
        }
        await saveAdminConfig(next);
        toast('Saved');
        STATE.cfg = await loadGemsConfig();
        ensureUiForPages();
        STATE.ui.adminEdit.units = false;
        render();
      } catch (e) {
        derror(e);
        toast('Save failed');
      }
    });

    card.append(head);

    if (!isEdit) {
      const wrap = el('div', { class: 'adminGrid mt-3' });
      for (const k of Object.keys(STAT_META)) {
        wrap.append(
          el('div', { class: 'adminRow' },
            el('div', { class: 'nowrap', style: 'font-weight:950;min-width:240px' }, STAT_META[k]?.label || k),
            renderMaybeIcon(statIconUrl(k), 'iconMini', STAT_META[k]?.label || k) || el('span', { class: 'muted' }, '—'),
            el('div', { class: 'cardSub muted' }, (STATE.cfg?.units?.[k] === 'pct') ? '%' : 'Flat')
          )
        );
      }
      card.append(wrap);
      return card;
    }

    const wrap = el('div', { class: 'adminGrid mt-3' });
    for (const k of Object.keys(STAT_META)) {
      const meta = STAT_META[k];
      const sel = el('select', { class: 'sel small' },
        el('option', { value: 'flat' }, 'Flat'),
        el('option', { value: 'pct' }, '%')
      );
      sel.value = (STATE.cfg?.units?.[k] === 'pct') ? 'pct' : 'flat';

      sel.addEventListener('change', () => {
        STATE.cfg.units[k] = (sel.value === 'pct') ? 'pct' : 'int';
      });

      wrap.append(
        el('div', { class: 'adminRow' },
          el('div', { class: 'nowrap', style: 'font-weight:950;min-width:240px' }, meta?.label || k),
          renderMaybeIcon(statIconUrl(k), 'iconMini', meta?.label || k) || el('span', { class: 'muted' }, '—'),
          sel
        )
      );
    }
    card.append(wrap);
    return card;
  }

  function renderAdminImagesCard({ key, title, sub, bodyBuilder, onSave }) {
    const isEdit = !!STATE.ui.adminEdit[key];

    const card = el('div', { class: 'card' });
    const head = el('div', { class: 'cardHead' },
      el('div', { class: 'min-w-0' },
        el('div', { class: 'cardTitle' }, title),
        el('div', { class: 'cardSub' }, sub)
      ),
      el('div', { class: 'cardBtns' },
        el('button', { class: `adminBtn ${isEdit ? 'primary' : ''}`, type: 'button' }, isEdit ? 'EXIT' : 'EDIT'),
        el('button', { class: 'adminBtn', type: 'button', disabled: !isEdit }, 'AUTO MATCH'),
        el('button', { class: 'adminBtn primary', type: 'button', disabled: !isEdit }, 'SAVE')
      )
    );

    const btns = head.querySelectorAll('button');
    const btnEdit = btns[0];
    const btnAuto = btns[1];
    const btnSave = btns[2];

    btnEdit.addEventListener('click', () => adminToggle(key));

    btnAuto.addEventListener('click', async () => {
      if (!STATE.ui.adminEdit[key]) return;
      try {
        await autoMatchAssetsForKey(key);
        render();
        toast('Auto match done');
      } catch (e) {
        derror(e);
        toast('Auto match failed');
      }
    });

    btnSave.addEventListener('click', async () => {
      if (!STATE.ui.adminEdit[key]) return;
      try {
        const next = normalizeCfg(STATE.cfg);
        await onSave(next);
        await saveAdminConfig(next);
        toast('Saved');
        STATE.cfg = await loadGemsConfig();
        ensureUiForPages();
        STATE.ui.adminEdit[key] = false;
        render();
      } catch (e) {
        derror(e);
        toast('Save failed');
      }
    });

    card.append(head);
    card.append(el('div', { class: 'adminGrid mt-3' }, bodyBuilder(isEdit)));
    return card;
  }


  function renderAdminPagesCard() {
    const isEdit = !!STATE.ui.adminEdit.pages;

    const card = el('div', { class: 'card' });
    const head = el('div', { class: 'cardHead' },
      el('div', {},
        el('div', { class: 'cardTitle' }, 'Pages & limits'),
        el('div', { class: 'cardSub' }, 'Configure max gem count + pages (slots per color). You can add new pages without editing the code.')
      )
    );

    const btns = el('div', { class: 'cardBtns' });
    const btnEdit = el('button', { class: 'adminBtn', type: 'button' }, isEdit ? 'Cancel' : 'Edit');
    const btnSave = el('button', { class: 'adminBtn primary', type: 'button', disabled: !isEdit }, 'Save');

    btnEdit.addEventListener('click', () => {
      STATE.ui.adminEdit.pages = !STATE.ui.adminEdit.pages;
      if (!STATE.ui.adminEdit.pages) {
        STATE.cfg = normalizeCfg(STATE.cfg);
        ensureUiForPages();
      }
      render();
    });

    btnSave.addEventListener('click', async () => {
      try {
        const next = normalizeCfg(STATE.cfg);
        await saveAdminConfig(next);
        toast('Saved');
        STATE.cfg = await loadGemsConfig();
        ensureUiForPages();
        STATE.ui.adminEdit.pages = false;
        render();
      } catch (e) {
        derror(e);
        toast('Save failed');
      }
    });

    btns.append(btnEdit, btnSave);
    head.append(btns);
    card.append(head);

    const body = el('div', { style: 'margin-top:12px' });

    if (!isEdit) {
      const pages = getPages();
      const maxGem = clampInt(STATE.cfg?.maxGem ?? DEFAULT_MAX_GEM, 1, 999, DEFAULT_MAX_GEM);

      body.append(
        el('div', { class: 'adminRow' },
          el('div', { class: 'nowrap', style: 'font-weight:950;min-width:180px' }, 'Max Gem (Recommended)'),
          el('div', { class: 'cardSub muted', style: 'flex:1' }, `x${maxGem}`)
        )
      );

      for (const p of pages) {
        body.append(
          el('div', { class: 'adminRow' },
            el('div', { class: 'nowrap', style: 'font-weight:950;min-width:180px' }, p.label),
            el('div', { class: 'cardSub muted', style: 'flex:1' }, `${p.perColor} slots per color`)
          )
        );
      }

      card.append(body);
      return card;
    }

    const maxGemIn = el('input', {
      class: 'adminIn',
      type: 'number',
      min: '1',
      max: '999',
      step: '1',
      value: String(clampInt(STATE.cfg?.maxGem ?? DEFAULT_MAX_GEM, 1, 999, DEFAULT_MAX_GEM))
    });
    maxGemIn.addEventListener('input', () => {
      STATE.cfg.maxGem = clampInt(maxGemIn.value, 1, 999, DEFAULT_MAX_GEM);
    });

    body.append(
      el('div', { class: 'adminRow' },
        el('div', { class: 'nowrap', style: 'font-weight:950;min-width:180px' }, 'Max Gem (Recommended)'),
        maxGemIn
      ),
      el('div', { class: 'cardSub muted', style: 'margin:-4px 0 10px 0' }, 'Used when a Recommended color has only 1 gem (it will show xMax Gem).')
    );

    const listWrap = el('div', { class: 'adminGrid' });

    const rebuild = () => {
      listWrap.innerHTML = '';
      const pages = getPages();

      for (const p of pages) {
        const row = el('div', { class: 'adminRow', style: 'gap:10px;align-items:flex-end' });

        const keyIn = el('input', { class: 'adminIn', value: p.key, disabled: true, style: 'max-width:160px' });
        const labelIn = el('input', { class: 'adminIn', value: p.label, placeholder: 'Label', style: 'min-width:200px' });
        const perIn = el('input', { class: 'adminIn', type: 'number', min: '0', max: '40', step: '1', value: String(clampInt(p.perColor ?? 0, 0, 40)), style: 'max-width:160px' });

        labelIn.addEventListener('input', () => {
          p.label = String(labelIn.value || '').trim().slice(0, 32) || p.key.toUpperCase();
          STATE.cfg.pages = pages;
        });
        perIn.addEventListener('input', () => {
          p.perColor = clampInt(perIn.value, 0, 40);
          STATE.cfg.pages = pages;
        });

        const btnDel = el('button', { class: 'adminBtn danger', type: 'button', disabled: pages.length <= 1 }, 'Delete');
        btnDel.addEventListener('click', () => {
          const nextPages = pages.filter(x => x.key !== p.key);
          STATE.cfg.pages = nextPages;
          ensurePageIcons(STATE.cfg, nextPages);
          ensureRecommendedBuckets(STATE.cfg, nextPages);
          ensureUiForPages();
          rebuild();
        });

        row.append(
          el('div', { style: 'display:flex;flex-direction:column;gap:6px' }, el('div', { class: 'cardSub muted' }, 'Key'), keyIn),
          el('div', { style: 'display:flex;flex-direction:column;gap:6px;flex:1' }, el('div', { class: 'cardSub muted' }, 'Label'), labelIn),
          el('div', { style: 'display:flex;flex-direction:column;gap:6px' }, el('div', { class: 'cardSub muted' }, 'Slots / color'), perIn),
          btnDel
        );

        listWrap.append(row);
      }
    };

    rebuild();

    const btnAdd = el('button', { class: 'adminBtn', type: 'button' }, 'Add page');
    btnAdd.addEventListener('click', () => {
      const pages = getPages();
      let n = pages.length + 1;
      let key = `page${n}`;
      while (pages.some(p => p.key === key)) { n++; key = `page${n}`; }

      const nextPages = [...pages, { key, label: `Page ${n}`, perColor: 4 }];
      STATE.cfg.pages = nextPages;
      ensurePageIcons(STATE.cfg, nextPages);
      ensureRecommendedBuckets(STATE.cfg, nextPages);
      ensureUiForPages();
      rebuild();
      render();
    });

    body.append(listWrap, el('div', { style: 'margin-top:10px' }, btnAdd));
    card.append(body);
    return card;
  }

  function renderAdminValuesCard() {
    const cardVals = el('div', { class: 'card' });
    cardVals.append(
      el('div', { class: 'cardHead' },
        el('div', { class: 'min-w-0' },
          el('div', { class: 'cardTitle' }, 'Stat values (Ranks + Letters)'),
          el('div', { class: 'cardSub' }, 'Edit values for every color/stat. Ranks 5-6 use letters A/B/C/D.')
        )
      )
    );

    const valsWrap = el('div', { class: 'adminGrid mt-3' });

    for (const c of GEM_COLORS) {
      const colorBox = el('div', { class: 'colorCard' });
      const icon = gemColorIcon(c.key);

      colorBox.append(
        el('div', { class: 'colorHead' },
          el('div', { class: 'colorLeft' },
            icon ? el('img', { class: 'colorIcon', src: icon, alt: c.label, loading: 'lazy', decoding: 'async' }) : null,
            el('div', { class: 'colorName' }, `${c.label} values`)
          )
        )
      );

      const tblWrap = el('div', { class: 'tblWrap' });
      const table = el('table', { class: 'tbl' });

      const thead = el('thead', {},
        el('tr', {},
          el('th', {}, 'Stat'),
          el('th', {}, 'R1'),
          el('th', {}, 'R2'),
          el('th', {}, 'R3'),
          el('th', {}, 'R4'),
          el('th', {}, 'R5-A'),
          el('th', {}, 'R5-B'),
          el('th', {}, 'R5-C'),
          el('th', {}, 'R5-D'),
          el('th', {}, 'R6-A'),
          el('th', {}, 'R6-B'),
          el('th', {}, 'R6-C'),
          el('th', {}, 'R6-D')
        )
      );

      table.append(thead);

      const tbody = el('tbody');
      const inputs = [];

      function mkNumIn(val) {
        const n = el('input', { class: 'numIn', type: 'number', min: '0', step: '0.01', value: String(Math.max(0, (val ?? 0))) });
        n.addEventListener('input', () => {
          const v = clampNonNegNum(n.value, 0);
          if (String(n.value) !== String(v)) n.value = String(v);
        });
        return n;
      }

      for (const stat of c.statsAll) {
        const row = el('tr');

        row.append(el('td', { class: 'nowrap', style: 'font-weight:950' }, STAT_META[stat]?.label || stat));

        for (const r of [1, 2, 3, 4]) {
          const cur = STATE.cfg?.values?.[c.key]?.[stat]?.[r] ?? 0;
          const n = mkNumIn(cur);
          inputs.push({ color: c.key, stat, rank: r, letter: null, node: n });
          row.append(el('td', {}, n));
        }

        for (const r of [5, 6]) {
          for (const L of LETTERS) {
            const cur = STATE.cfg?.values?.[c.key]?.[stat]?.[r]?.[L] ?? 0;
            const n = mkNumIn(cur);
            inputs.push({ color: c.key, stat, rank: r, letter: L, node: n });
            row.append(el('td', {}, n));
          }
        }

        tbody.append(row);
      }

      table.append(tbody);
      tblWrap.append(table);
      colorBox.append(tblWrap);

      const btnSaveColor = el('button', { class: 'adminBtn primary', type: 'button', style: 'margin-top:10px' }, `Save ${c.label}`);
      btnSaveColor.addEventListener('click', async () => {
        try {
          const next = normalizeCfg(STATE.cfg);

          for (const it of inputs) {
            const v = clampNonNegNum(it.node.value, 0);
            if (it.rank <= 4) next.values[it.color][it.stat][it.rank] = v;
            else next.values[it.color][it.stat][it.rank][it.letter] = v;
          }

          await saveAdminConfig(next);
          toast('Saved');
          STATE.cfg = await loadGemsConfig();
          ensureUiForPages();
          render();
        } catch (e) {
          derror(e);
          toast('Save failed');
        }
      });

      colorBox.append(btnSaveColor);
      valsWrap.append(colorBox);
    }

    cardVals.append(valsWrap);
    return cardVals;
  }

  function renderAdmin(root) {
    // ✅ proper admin: hard block content when not admin
    if (!isAdminTabVisible()) {
      root.append(el('div', { class: 'p-6 text-center text-slate-500 dark:text-slate-400' }, 'Admin is not available.'));
      return;
    }

    const wrap = el('div', { class: 'adminGrid' });

    wrap.append(renderAdminRecommendedCard());
    wrap.append(renderAdminPagesCard());
    wrap.append(renderAdminValuesCard());
    wrap.append(renderAdminUnitsCard());

    // Color icons (local)
    // Folder: /picture/Gems/Colors/*
    if (!STATE._picsGemsPromise && isAdminTabVisible()) {
      STATE._picsGemsPromise = loadPictures('Gems')
        .then(p => { STATE._picsGems = p; render(); })
        .catch(e => { STATE._picsGemsErr = String(e?.message || e); render(); });
    }

    wrap.append(renderAdminImagesCard({
      key: 'colorIcons',
      title: 'Color icons',
      sub: 'Select local icons (saved to assets.colorIcons). Folder: /picture/Gems/Colors/*',
      bodyBuilder: (isEdit) => {
        const rows = el('div', { class: 'adminGrid' });

        const pics = STATE._picsGems;
        const err = STATE._picsGemsErr;
        const rels = pics ? filterRel(pics.items, 'Colors') : [];

        if (isEdit && !pics && !err) {
          return el('div', { class: 'cardSub muted' }, 'Loading local images…');
        }
        if (isEdit && err) {
          return el('div', { class: 'cardSub muted' }, `Failed to load images: ${err}`);
        }

        const options = makeSelectOptions(rels, 'Gems');

        for (const c of GEM_COLORS) {
          const row = el('div', { class: 'adminRow' });
          const currentRaw = STATE.cfg?.assets?.colorIcons?.[c.key] || '';
          const current = normalizePicturePath(currentRaw, 'Gems');

          const preview = el('img', {
            class: 'colorIcon',
            src: cdnySafe(current, 64),
            alt: c.label,
            style: 'width:32px;height:32px;border-radius:10px;border:1px solid rgba(148,163,184,.25);background:rgba(15,23,42,.10)'
          });

          row.append(
            el('div', { class: 'nowrap', style: `font-weight:950;min-width:90px` }, c.label),
            el('div', { class: 'nowrap', style: `width:14px;height:14px;border-radius:5px;background:${c.hex};border:1px solid rgba(148,163,184,.25)` })
          );

          if (!isEdit) {
            row.append(el('div', { class: 'cardSub muted', style: 'flex:1' }, current ? 'Set' : '—'), preview);
            rows.append(row);
            continue;
          }

          const sel = el('select', { class: 'adminIn' },
            el('option', { value: '' }, 'Select local icon…'),
            ...options.map(o => el('option', { value: o.value }, o.label))
          );

          // preselect
          const curRel = stripPicturePrefix(current, 'Gems');
          if (current && rels.includes(curRel)) sel.value = current;
          sel.addEventListener('change', () => {
            const v = (sel.value || '').trim();
            STATE.cfg.assets.colorIcons[c.key] = v;
            preview.src = cdnySafe(v, 64);
          });

          row.append(sel, preview);
          rows.append(row);
        }

        return rows;
      },
      onSave: async (next) => {
        next.assets.colorIcons = next.assets.colorIcons || {};
        for (const c of GEM_COLORS) {
          next.assets.colorIcons[c.key] = normalizePicturePath((STATE.cfg?.assets?.colorIcons?.[c.key] || '').trim(), 'Gems');
        }
      }
    }));


    // Page icons (local)
    // Folder: /picture/Gems/Page/*
    wrap.append(renderAdminImagesCard({
      key: 'pageIcons',
      title: 'Page icons',
      sub: 'Select local icons (saved to assets.pageIcons). Folder: /picture/Gems/Page/*',
      bodyBuilder: (isEdit) => {
        const rows = el('div', { class: 'adminGrid' });

        const pics = STATE._picsGems;
        const err = STATE._picsGemsErr;
        const rels = pics ? filterRel(pics.items, 'Page') : [];

        if (isEdit && !pics && !err) return el('div', { class: 'cardSub muted' }, 'Loading local images…');
        if (isEdit && err) return el('div', { class: 'cardSub muted' }, `Failed to load images: ${err}`);

        const options = makeSelectOptions(rels, 'Gems');

        for (const p of getPages()) {
          const pk = p.key;
          const currentRaw = STATE.cfg?.assets?.pageIcons?.[pk] || '';
          const current = normalizePicturePath(currentRaw, 'Gems');

          const prev = el('img', {
            class: 'pageIcon',
            src: cdnySafe(current || '', 64),
            alt: pk,
            style: 'height:24px;max-width:180px;border-radius:10px;border:1px solid rgba(148,163,184,.18);background:rgba(2,6,23,.25);padding:4px'
          });

          const row = el('div', { class: 'adminRow' },
            el('div', { class: 'nowrap', style: 'font-weight:950;min-width:90px' }, p.label)
          );

          if (!isEdit) {
            row.append(el('div', { class: 'cardSub muted', style: 'flex:1' }, current ? 'Set' : '—'), prev);
            rows.append(row);
            continue;
          }

          const sel = el('select', { class: 'adminIn' },
            el('option', { value: '' }, 'Select local icon…'),
            ...options.map(o => el('option', { value: o.value }, o.label))
          );

          const curRel = stripPicturePrefix(current, 'Gems');
          if (current && rels.includes(curRel)) sel.value = current;

          sel.addEventListener('change', () => {
            const v = (sel.value || '').trim();
            STATE.cfg.assets.pageIcons[pk] = v;
            prev.src = cdnySafe(v, 64);
          });

          row.append(sel, prev);
          rows.append(row);
        }
        return rows;
      },
      onSave: async (next) => {
        for (const p of getPages()) next.assets.pageIcons[p.key] = normalizePicturePath((STATE.cfg?.assets?.pageIcons?.[p.key] || '').trim(), 'Gems');
      }
    }));


    // Letter icons (local)
    // Folder: /picture/Gems/Leter/*
    wrap.append(renderAdminImagesCard({
      key: 'letterIcons',
      title: 'Letter icons',
      sub: 'Select local icons for A/B/C/D. Folder: /picture/Gems/Leter/*',
      bodyBuilder: (isEdit) => {
        const rows = el('div', { class: 'adminGrid' });

        const pics = STATE._picsGems;
        const err = STATE._picsGemsErr;
        const rels = pics ? filterRel(pics.items, 'Leter') : [];

        if (isEdit && !pics && !err) return el('div', { class: 'cardSub muted' }, 'Loading local images…');
        if (isEdit && err) return el('div', { class: 'cardSub muted' }, `Failed to load images: ${err}`);

        const options = makeSelectOptions(rels, 'Gems');

        for (const L of LETTERS) {
          const currentRaw = STATE.cfg?.assets?.letterIcons?.[L] || '';
          const current = normalizePicturePath(currentRaw, 'Gems');

          const prev = el('img', {
            class: 'iconMini',
            src: cdnySafe(current || '', 32),
            alt: L,
            style: 'width:24px;height:24px;border-radius:10px;border:1px solid rgba(148,163,184,.18);background:rgba(2,6,23,.25);padding:3px'
          });

          const row = el('div', { class: 'adminRow' },
            el('div', { class: 'nowrap', style: 'font-weight:950;min-width:90px' }, `Letter ${L}`)
          );

          if (!isEdit) {
            row.append(el('div', { class: 'cardSub muted', style: 'flex:1' }, current ? 'Set' : '—'), prev);
            rows.append(row);
            continue;
          }

          const sel = el('select', { class: 'adminIn' },
            el('option', { value: '' }, 'Select local icon…'),
            ...options.map(o => el('option', { value: o.value }, o.label))
          );

          const curRel = stripPicturePrefix(current, 'Gems');
          if (current && rels.includes(curRel)) sel.value = current;

          sel.addEventListener('change', () => {
            const v = (sel.value || '').trim();
            STATE.cfg.assets.letterIcons[L] = v;
            prev.src = cdnySafe(v, 32);
          });

          row.append(sel, prev);
          rows.append(row);
        }
        return rows;
      },
      onSave: async (next) => {
        for (const L of LETTERS) next.assets.letterIcons[L] = normalizePicturePath((STATE.cfg?.assets?.letterIcons?.[L] || '').trim(), 'Gems');
      }
    }));


    // Stat icons (local)
    // Folder: /picture/Gems/Stats/*
    wrap.append(renderAdminImagesCard({
      key: 'statIcons',
      title: 'Stat icons',
      sub: 'Select local icons for every stat. Folder: /picture/Gems/Stats/*',
      bodyBuilder: (isEdit) => {
        const rows = el('div', { class: 'adminGrid' });

        const pics = STATE._picsGems;
        const err = STATE._picsGemsErr;
        const rels = pics ? filterRel(pics.items, 'Stats') : [];

        if (isEdit && !pics && !err) return el('div', { class: 'cardSub muted' }, 'Loading local images…');
        if (isEdit && err) return el('div', { class: 'cardSub muted' }, `Failed to load images: ${err}`);

        const options = makeSelectOptions(rels, 'Gems');

        for (const k of Object.keys(STAT_META)) {
          const meta = STAT_META[k];
          const currentRaw = STATE.cfg?.assets?.statIcons?.[k] || '';
          const current = normalizePicturePath(currentRaw, 'Gems');

          const prev = el('img', {
            class: 'iconMini',
            src: cdnySafe(current || '', 32),
            alt: meta?.label || k,
            style: 'width:24px;height:24px;border-radius:10px;border:1px solid rgba(148,163,184,.18);background:rgba(2,6,23,.25);padding:3px'
          });

          const row = el('div', { class: 'adminRow' },
            el('div', { class: 'nowrap', style: 'font-weight:950;min-width:260px' }, meta?.label || k)
          );

          if (!isEdit) {
            row.append(el('div', { class: 'cardSub muted', style: 'flex:1' }, current ? 'Set' : '—'), prev);
            rows.append(row);
            continue;
          }

          const sel = el('select', { class: 'adminIn' },
            el('option', { value: '' }, 'Select local icon…'),
            ...options.map(o => el('option', { value: o.value }, o.label))
          );

          const curRel = stripPicturePrefix(current, 'Gems');
          if (current && rels.includes(curRel)) sel.value = current;

          sel.addEventListener('change', () => {
            const v = (sel.value || '').trim();
            STATE.cfg.assets.statIcons[k] = v;
            prev.src = cdnySafe(v, 32);
          });

          row.append(sel, prev);
          rows.append(row);
        }
        return rows;
      },
      onSave: async (next) => {
        for (const k of Object.keys(STAT_META)) next.assets.statIcons[k] = normalizePicturePath((STATE.cfg?.assets?.statIcons?.[k] || '').trim(), 'Gems');
      }
    }));


    // Gem images (local)
    // Folder: /picture/Gems/Gems/*
    wrap.append(renderAdminImagesCard({
      key: 'gemImages',
      title: 'Gem images',
      sub: 'Select local images for each color (Rank 1..6). Folder: /picture/Gems/Gems/*',
      bodyBuilder: (isEdit) => {
        const grid = el('div', { class: 'adminGrid' });

        const pics = STATE._picsGems;
        const err = STATE._picsGemsErr;
        const rels = pics ? filterRel(pics.items, 'Gems') : [];

        if (isEdit && !pics && !err) return el('div', { class: 'cardSub muted' }, 'Loading local images…');
        if (isEdit && err) return el('div', { class: 'cardSub muted' }, `Failed to load images: ${err}`);

        const options = makeSelectOptions(rels, 'Gems');

        for (const c of GEM_COLORS) {
          const cc = el('div', { class: 'colorCard' });
          const icon = gemColorIcon(c.key);

          cc.append(
            el('div', { class: 'colorHead' },
              el('div', { class: 'colorLeft' },
                icon ? el('img', { class: 'colorIcon', src: icon, alt: c.label, loading: 'lazy', decoding: 'async' }) : null,
                el('div', { class: 'colorName' }, `${c.label} (Rank 1..6)`)
              )
            )
          );

          const rows = el('div', { class: 'adminGrid' });

          for (let r = 1; r <= 6; r++) {
            const curRaw = STATE.cfg?.assets?.gemRankImages?.[c.key]?.[r] || '';
            const cur = normalizePicturePath(curRaw, 'Gems');

            const prev = el('img', {
              class: 'colorIcon',
              src: cdnySafe(cur || '', 64),
              alt: `${c.label} R${r}`,
              style: 'width:32px;height:32px;border-radius:10px;border:1px solid rgba(148,163,184,.18);background:rgba(2,6,23,.25);padding:3px'
            });

            const row = el('div', { class: 'adminRow' },
              el('div', { class: 'nowrap', style: 'font-weight:950;min-width:90px' }, `Rank ${r}`)
            );

            if (!isEdit) {
              row.append(el('div', { class: 'cardSub muted', style: 'flex:1' }, cur ? 'Set' : '—'), prev);
              rows.append(row);
              continue;
            }

            const sel = el('select', { class: 'adminIn' },
              el('option', { value: '' }, 'Select local image…'),
              ...options.map(o => el('option', { value: o.value }, o.label))
            );

            const curRel = stripPicturePrefix(cur, 'Gems');
            if (cur && rels.includes(curRel)) sel.value = cur;

            sel.addEventListener('change', () => {
              const v = (sel.value || '').trim();
              STATE.cfg.assets.gemRankImages[c.key][r] = v;
              STATE.cfg.assets.gemImages[c.key][r - 1] = v;
              prev.src = cdnySafe(v, 64);
            });

            row.append(sel, prev);
            rows.append(row);
          }

          cc.append(rows);
          grid.append(cc);
        }

        return grid;
      },
      onSave: async (next) => {
        next.assets.gemRankImages = next.assets.gemRankImages || {};
        next.assets.gemImages = next.assets.gemImages || {};
        for (const c of GEM_COLORS) {
          next.assets.gemRankImages[c.key] = next.assets.gemRankImages[c.key] || { 1:'',2:'',3:'',4:'',5:'',6:'' };
          next.assets.gemImages[c.key] = Array.isArray(next.assets.gemImages[c.key]) ? next.assets.gemImages[c.key] : Array.from({ length: 6 }, () => '');
          for (let r = 1; r <= 6; r++) {
            const v = normalizePicturePath((STATE.cfg?.assets?.gemRankImages?.[c.key]?.[r] || '').trim(), 'Gems');
            next.assets.gemRankImages[c.key][r] = v;
            next.assets.gemImages[c.key][r - 1] = v;
          }
        }
      }
    }));


    root.append(wrap);
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
      class: 'w-full mx-auto px-3 sm:px-6 py-6 gems-wrap',
      'data-sla-page': 'gems'
    });

    renderHeader(shell);
    renderSubtabs(shell);

    if (STATE.loading) {
      shell.append(el('div', { class: 'p-6 text-center text-slate-500 dark:text-slate-400' }, 'Loading…'));
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

    if (STATE.subtab === 'recommended') renderRecommended(shell);
    else if (STATE.subtab === 'admin') renderAdmin(shell);
    else renderMyList(shell);

    content.append(shell);

    refreshTailwindSoon();
    requestAnimationFrame(() => { try { window.dispatchEvent(new Event('resize')); } catch {} });
  }

  // --------------------------
  // Mount
  // --------------------------
  window.__gems_mount = async function __gems_mount() {
    injectLocalStyles();

    STATE.cfg = await loadGemsConfig();
    ensureUiForPages();
    await loadMyLoadout();

    if (STATE.subtab === 'admin' && !isAdminTabVisible()) setSubtab('recommended');

    requestAnimationFrame(() => render());
  };

  // --------------------------
  // Debug helpers
  // --------------------------
  window.__gems_debug = {
    get cfg() { return STATE.cfg; },
    get ui() { return STATE.ui; },
    get loadout() { return STATE.collection.loadout; },
    gemRankImage: (color, rank) => gemRankImage(color, rank),
    gemColorIcon: (color) => gemColorIcon(color)
  };

})();
