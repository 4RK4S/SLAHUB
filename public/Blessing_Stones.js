'use strict';

(function () {
  const COLOR_GOLD = '#fac700';
  const COLOR_LIGHT = '#ffdf7d';
  const COLOR_ORANGE = '#ff8740';
  const COLOR_MINT = '#63fac7';

  const RARITIES = ['Do not own', 'Rare', 'Heroic', 'Legendary', 'Mythic'];

  const RARITY_COLOR = {
    'Do not own': '#6c757d',
    'Rare': '#307994',
    'Heroic': '#573e6c',
    'Legendary': '#b38300',
    'Mythic': '#933344'
  };

  const RARITY_FRAME = {
    'Do not own': '/picture/Blessing_Stones/Frame/Do_not_own.png',
    'Rare': '/picture/Blessing_Stones/Frame/Rare.png',
    'Heroic': '/picture/Blessing_Stones/Frame/Heroic.png',
    'Legendary': '/picture/Blessing_Stones/Frame/Legendary.png',
    'Mythic': '/picture/Blessing_Stones/Frame/Mythic.png'
  };

  const TYPE_ICON = {
    Empowerment: '/picture/Blessing_Stones/Type/Empowerment.png',
    Survival: '/picture/Blessing_Stones/Type/Survival.png'
  };

  const TYPE_LABELS = {
    empowerment: 'Empowerment',
    survival: 'Survival'
  };

  const TAG_TO_COLOR = {
    gold: COLOR_GOLD,
    light: COLOR_LIGHT,
    orange: COLOR_ORANGE,
    mint: COLOR_MINT,
    keyword: COLOR_GOLD,
    keyword2: COLOR_LIGHT,
    break: COLOR_ORANGE,
    debuff: COLOR_MINT
  };

  const LS_HIDE_ADMIN_KEY = 'sla_hide_admin_buttons';
  const pictureListCache = new Map();

  let blessingStylesInjected = false;

  function ensureBlessingSharedStyles() {
    if (blessingStylesInjected || document.getElementById('blessing-stones-shared-styles')) return;
    blessingStylesInjected = true;

    const style = document.createElement('style');
    style.id = 'blessing-stones-shared-styles';
    style.textContent = `
      .hunters-toolbar{
        display:flex;align-items:center;gap:14px;padding:10px 12px;border-radius:14px;border:1px solid rgba(100,116,139,.35);
        background:rgba(15,23,42,.35);flex-wrap:wrap;max-width:100%;box-sizing:border-box;
      }
      .hunters-toolbar .search{
        flex:1 1 320px;width:100%;max-width:520px;min-width:0;height:38px;padding:0 14px;border-radius:12px;
        border:1px solid rgba(148,163,184,.35);outline:none;color:#e2e8f0;background:rgba(15,23,42,.55);font-weight:900;
      }
      .hunters-toolbar .search::placeholder{color:rgba(148,163,184,.9)}
      .filter-group{
        display:flex;align-items:center;gap:10px;padding-left:14px;border-left:1px solid rgba(148,163,184,.18);min-width:0;flex-wrap:wrap;
      }
      .filter-group:first-of-type{padding-left:0;border-left:none}
      .toolbar-right{margin-left:auto;display:flex;align-items:center;gap:10px;flex-wrap:wrap}
      .reset-btn{height:38px;padding:0 14px;border-radius:12px;border:1px solid rgba(239,68,68,.55);background:rgba(239,68,68,.15);
        color:#fecaca;font-weight:900;display:flex;align-items:center;gap:8px;cursor:pointer;transition:.15s ease}
      .reset-btn:hover{transform:translateY(-1px);background:rgba(239,68,68,.22)}
      .reset-x{display:grid;place-items:center;width:20px;height:20px;border-radius:7px;background:rgba(239,68,68,.30);
        border:1px solid rgba(239,68,68,.55);color:#fff;font-size:14px;font-weight:900;line-height:1}
      .bs-filter-btn{
        height:32px;padding:0 12px;border-radius:10px;border:1px solid rgba(148,163,184,.35);background:rgba(15,23,42,.55);
        color:#e2e8f0;font-weight:900;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;
        transition:.15s ease;white-space:nowrap;
      }
      .bs-filter-btn:hover{transform:translateY(-1px);border-color:rgba(226,232,240,.34);background:rgba(255,255,255,.08)}
      .bs-filter-btn.is-active{border-color:rgba(250,204,21,.85);background:rgba(250,204,21,.12);box-shadow:0 0 0 3px rgba(250,204,21,.22);color:#fde68a}
      .bs-rarity-square{width:32px;height:32px;border-radius:10px;border:2px solid rgba(255,255,255,.16);cursor:pointer;transition:.15s ease;position:relative;display:inline-block}
      .bs-rarity-square:hover{transform:translateY(-1px);border-color:rgba(255,255,255,.36)}
      .bs-rarity-square.is-active{box-shadow:0 0 0 3px rgba(250,204,21,.22), inset 0 0 0 2px rgba(255,255,255,.24);border-color:rgba(250,204,21,.9)}
      .bs-rarity-square.is-empty::after{content:'';position:absolute;inset:0;display:grid;place-items:center;color:rgba(255,255,255,.92);font-size:18px;font-weight:900}
      .bs-count-chip{
        height:38px;padding:0 14px;border-radius:12px;border:1px solid rgb(51 65 85 / 0.6);background:rgba(15,23,42,.78);
        color:#f8fafc;font-weight:900;display:inline-flex;align-items:center;justify-content:center;
        box-shadow:inset 0 1px 0 rgba(255,255,255,.04), 0 6px 18px rgba(0,0,0,.18)
      }
      .toolbar-edit-btn{height:38px;padding:0 14px;border-radius:12px;border:1px solid rgba(168,85,247,.45);background:rgba(168,85,247,.14);color:#e9d5ff;font-weight:900;display:flex;align-items:center;gap:8px;cursor:pointer;transition:.15s ease}
      .toolbar-edit-btn:hover{transform:translateY(-1px);background:rgba(168,85,247,.22)}

      .hunter-progress-card{
        position:relative;border-radius:18px;border:1px solid rgba(148,163,184,.26);
        background:linear-gradient(180deg,rgba(51,65,85,.45) 0%, rgba(15,23,42,.78) 100%);
        box-shadow:0 12px 28px rgba(0,0,0,.18);padding:16px;overflow:visible;
      }
      .hunter-progress-card::before{content:'';position:absolute;inset:0;border-radius:inherit;pointer-events:none;box-shadow:inset 0 1px 0 rgba(255,255,255,.06)}
      .hunter-progress-bulk-card{border-color:rgba(168,85,247,.35);box-shadow:0 0 0 1px rgba(168,85,247,.10), 0 12px 28px rgba(0,0,0,.18);background:linear-gradient(180deg,rgba(88,28,135,.24) 0%, rgba(15,23,42,.82) 100%)}
      .hunter-progress-head{display:flex;gap:14px;align-items:center}
      .hunter-progress-avatar{
        width:72px;height:72px;border-radius:18px;overflow:hidden;display:grid;place-items:center;
        background:rgba(15,23,42,.52);border:1px solid rgba(148,163,184,.22);flex:0 0 auto
      }
      .hunter-progress-meta{min-width:0;display:grid;gap:8px}
      .hunter-progress-name{font-size:18px;font-weight:900;color:#e2e8f0;line-height:1.15}
      .hunter-progress-bulk-sub{font-size:12px;font-weight:800;color:rgba(226,232,240,.72)}
      .hunter-progress-all-badge{white-space:pre-line;line-height:1.05;text-align:center;font-size:11px}
      .ml-all{
        display:grid;place-items:center;width:64px;height:64px;border-radius:14px;border:1px solid rgba(168,85,247,.35);
        background:rgba(168,85,247,.18);color:#e2e8f0;font-weight:950;font-size:12px;letter-spacing:.18em;
      }
      .hunter-progress-stats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:14px}
      .hunter-progress-stat{
        min-width:0;border-radius:14px;border:1px solid rgba(148,163,184,.18);
        background:rgba(255,255,255,.04);padding:12px;display:grid;gap:10px
      }
      .hunter-progress-stat-full{grid-column:1 / -1}
      .hunter-progress-stat-label{
        font-size:12px;font-weight:900;color:rgba(226,232,240,.72);text-transform:uppercase;text-align:center;display:flex;align-items:center;justify-content:center
      }
      .hunter-progress-growth-edit{display:flex;align-items:center;justify-content:center;gap:10px;flex-wrap:wrap}
      .hunter-edit-select{
        width:100%;min-width:0;height:42px;border-radius:10px;border:1px solid rgba(148,163,184,.24);
        background:rgba(15,23,42,.72);color:#e2e8f0;padding:0 36px 0 12px;font-weight:900;text-align:center
      }
      .edit-btn{height:38px;padding:0 14px;border-radius:12px;border:1px solid rgba(148,163,184,.35);background:rgba(255,255,255,.92);
        color:#0f172a;font-weight:900;cursor:pointer;transition:.15s ease}
      .edit-btn:hover{transform:translateY(-1px)}
      @media (max-width: 900px){ .hunter-progress-stats{grid-template-columns:1fr} }
      @media (max-width: 720px){
        .hunters-toolbar{flex-direction:column;align-items:stretch;gap:10px}
        .hunters-toolbar .search{max-width:none;flex:1 1 auto;width:100%}
        .filter-group{padding-left:0;border-left:none}
        .toolbar-right{margin-left:0;width:100%;justify-content:space-between}
      }
      @media (max-width: 520px){
        .hunter-progress-card{padding:14px}
        .hunter-progress-avatar{width:64px;height:64px;border-radius:16px}
        .hunter-progress-name{font-size:17px}
      }
    `;
    document.head.appendChild(style);
  }


  const state = {
    active: 'all',
    adminActive: 'empowerment',
    adminOrderMode: false,
    filters: {
      name: '',
      rarities: []
    },
    data: {
      empowerment: [],
      survival: [],
      version: 0
    },
    myRarities: {},
    rarityEditOpen: {},
    isAdmin: false,
    isLoggedIn: false,
    hideAdminButtons: false,
    pollTimer: null,
    dirtyAdmin: false,
    showBulkEditor: false
  };

  function qs(sel, root = document) {
    return root.querySelector(sel);
  }

  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);

    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null) continue;
      if (k === 'class') node.className = v;
      else if (k === 'style') node.setAttribute('style', v);
      else if (k.startsWith('on') && typeof v === 'function') {
        node.addEventListener(k.slice(2).toLowerCase(), v);
      } else if (typeof v === 'boolean') {
        if (v) node.setAttribute(k, '');
      } else {
        node.setAttribute(k, v);
      }
    }

    for (const child of children) {
      if (child == null) continue;
      node.append(child?.nodeType ? child : document.createTextNode(String(child)));
    }

    return node;
  }

  function toast(msg) {
    if (typeof window.showToast === 'function') return window.showToast(msg);
    console.log('[toast]', msg);
  }

  function escapeHtml(s) {
    return String(s ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function basePath() {
    const p = location.pathname || '';
    return (p === '/slahub' || p.startsWith('/slahub/')) ? '/slahub' : '';
  }

  function url(p) {
    const b = basePath();
    const path = String(p || '');
    if (!path) return b || '';
    if (path.startsWith('http://') || path.startsWith('https://')) return path;
    if (path.startsWith('/')) return `${b}${path}`;
    return `${b}/${path}`;
  }

  function cdnySafe(u, w = 256) {
    try {
      if (typeof window.cdny === 'function') return window.cdny(u, w);
    } catch {}
    return u || '';
  }

  async function fetchJson(path) {
    const r = await fetch(url(path), {
      credentials: 'include',
      cache: 'no-store'
    });
    if (!r.ok) throw new Error(`${path} -> ${r.status}`);
    return r.json();
  }

  async function postJson(path, payload) {
    const r = await fetch(url(path), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload || {})
    });

    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j?.error || `POST ${path} failed (${r.status})`);
    return j;
  }

  function normalizeType(v) {
    const s = String(v || '').trim().toLowerCase();
    if (s === 'survival') return 'Survival';
    return 'Empowerment';
  }

  function normalizeRarity(v) {
    const s = String(v || '')
      .trim()
      .toLowerCase()
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (s === 'rare') return 'Rare';
    if (s === 'heroic') return 'Heroic';
    if (s === 'legendary') return 'Legendary';
    if (s === 'mythic') return 'Mythic';
    return 'Do not own';
  }

  function normalizeText(v) {
    return String(v || '').replace(/\r\n/g, '\n').trim();
  }

  function normalizeData(raw) {
    const globalObj = raw?.global && typeof raw.global === 'object' ? raw.global : raw;

    const out = {
      empowerment: Array.isArray(globalObj?.empowerment) ? globalObj.empowerment : [],
      survival: Array.isArray(globalObj?.survival) ? globalObj.survival : [],
      version: Number(globalObj?.version || 0) || 0
    };

    for (const k of ['empowerment', 'survival']) {
      out[k] = out[k]
        .map((x) => ({
          id: String(x?.id || ''),
          name: String(x?.name || ''),
          type: normalizeType(x?.type || TYPE_LABELS[k]),
          image: String(x?.image || ''),
          text: normalizeText(x?.text || '')
        }))
        .filter((x) => x.id && x.name);
    }

    return out;
  }

  function normalizeMyRarities(raw) {
    const src = raw?.myRarities || raw || {};
    const out = {};
    if (!src || typeof src !== 'object') return out;

    for (const [id, rarity] of Object.entries(src)) {
      out[String(id)] = normalizeRarity(rarity);
    }
    return out;
  }

  function prettyFileLabel(v) {
    const raw = String(v || '');
    const file = raw.split('/').pop() || raw;
    return file
      .replace(/\.[a-z0-9]+$/i, '')
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim() || file;
  }

  function getHideAdminButtons() {
    try {
      return localStorage.getItem(LS_HIDE_ADMIN_KEY) === '1';
    } catch {
      return false;
    }
  }

  function isAdminTabVisible() {
    return state.isAdmin && !state.hideAdminButtons;
  }

  function publicTabs() {
    return [
      { key: 'all', label: 'ALL' },
      { key: 'empowerment', label: 'Empowerment' },
      { key: 'survival', label: 'Survival' }
    ];
  }

  function getPublicList(typeKey) {
    if (typeKey === 'all') {
      return [
        ...(Array.isArray(state.data.empowerment) ? state.data.empowerment : []),
        ...(Array.isArray(state.data.survival) ? state.data.survival : [])
      ];
    }
    return Array.isArray(state.data[typeKey]) ? state.data[typeKey] : [];
  }

  function getOwnedCount(typeKey = state.active) {
    return getPublicList(typeKey).reduce((count, item) => {
      return count + (getUserRarity(item?.id) !== 'Do not own' ? 1 : 0);
    }, 0);
  }

  function resetFilters() {
    state.filters.name = '';
    state.filters.rarities = [];
  }

  function toggleInArray(arr, v) {
    const a = Array.isArray(arr) ? [...arr] : [];
    const idx = a.indexOf(v);
    if (idx >= 0) return a.filter((x) => x !== v);
    a.push(v);
    return a;
  }

  function filteredBlessingStones(typeKey = state.active) {
    const src = getPublicList(typeKey);
    const q = String(state.filters.name || '').trim().toLowerCase();
    const raritySet = new Set((state.filters.rarities || []).map(normalizeRarity));

    return src.filter((item) => {
      if (q) {
        const hay = [
          item?.name || '',
          item?.text || '',
          item?.type || ''
        ].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }

      if (raritySet.size > 0 && !raritySet.has(getUserRarity(item.id))) {
        return false;
      }

      return true;
    });
  }

  function rarityFrame(rarity) {
    return url(RARITY_FRAME[normalizeRarity(rarity)] || RARITY_FRAME['Do not own']);
  }

  function rarityColor(rarity) {
    return RARITY_COLOR[normalizeRarity(rarity)] || '#6c757d';
  }

  function typeIcon(type) {
    return url(TYPE_ICON[normalizeType(type)] || TYPE_ICON.Empowerment);
  }

  function getUserRarity(itemId) {
    return normalizeRarity(state.myRarities?.[String(itemId)] || 'Do not own');
  }

  function setUserRarityLocal(itemId, rarity) {
    state.myRarities[String(itemId)] = normalizeRarity(rarity);
  }

  function normalizePictureListResponse(data) {
    const arr = Array.isArray(data)
      ? data
      : (Array.isArray(data?.files) ? data.files : (Array.isArray(data?.items) ? data.items : []));

    return arr
      .map((it) => {
        if (typeof it === 'string') {
          return { path: it, name: it.split('/').pop() || it };
        }
        if (it && typeof it === 'object') {
          const p = String(it.path || it.rel || it.url || it.publicPath || it.value || it.name || '').trim();
          if (!p) return null;
          return { path: p, name: String(it.name || p.split('/').pop() || p) };
        }
        return null;
      })
      .filter(Boolean);
  }

  async function loadBlessingPictureList(force = false) {
    const cacheKey = 'blessing_stones:blessing';
    if (!force && pictureListCache.has(cacheKey)) return pictureListCache.get(cacheKey);

    const tries = [
      '/api/admin/pictures/list?category=Blessing_Stones',
      '/api/admin/pictures/list?category=Blessing%20Stones'
    ];

    let lastErr = null;

    for (const q of tries) {
      try {
        let list = normalizePictureListResponse(await fetchJson(q));

        list = list
          .map((x) => {
            let p = String(x.path || '').trim();
            if (!p) return null;

            if (!p.startsWith('/picture/')) {
              if (!p.startsWith('/')) p = `/picture/Blessing_Stones/Blessing/${p}`;
            }

            const lower = p.toLowerCase();
            if (lower.includes('/frame/')) return null;
            if (lower.includes('/type/')) return null;
            if (!lower.includes('/blessing_stones/blessing/')) return null;

            return { path: p, label: prettyFileLabel(p) };
          })
          .filter(Boolean);

        pictureListCache.set(cacheKey, list);
        return list;
      } catch (e) {
        lastErr = e;
      }
    }

    if (lastErr) throw lastErr;
    return [];
  }

  function normalizeFileBaseForDisplay(value) {
    return String(value || '')
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/\.[a-z0-9]+$/i, '')
      .trim();
  }

  function makeBlessingImageFilenameBase(value) {
    return normalizeFileBaseForDisplay(value)
      .replace(/[’'`´]/g, '')
      .replace(/[\/:*?"<>|&.,!;@#$%^+=~()\[\]{}]/g, '')
      .replace(/-/g, '')
      .replace(/\s+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  function makeBlessingComparableKey(value) {
    return normalizeFileBaseForDisplay(value)
      .toLowerCase()
      .replace(/[’'`´]/g, '')
      .replace(/[^a-z0-9]+/g, '');
  }

  function localImageBaseName(path) {
    const raw = String(path || '').trim();
    const file = raw.split('/').pop() || raw;
    return normalizeFileBaseForDisplay(file);
  }

  function findBestLocalImageMatch(name, items) {
    const list = Array.isArray(items) ? items : [];
    const rawName = String(name || '').trim();
    if (!rawName) return '';

    const targetBase = makeBlessingImageFilenameBase(rawName);
    const targetComparable = makeBlessingComparableKey(rawName);
    if (!targetBase && !targetComparable) return '';

    for (const item of list) {
      const itemPath = String(item?.path || '').trim();
      if (!itemPath) continue;
      const itemBase = makeBlessingImageFilenameBase(localImageBaseName(itemPath));
      if (targetBase && itemBase === targetBase) return itemPath;
    }

    for (const item of list) {
      const itemPath = String(item?.path || '').trim();
      if (!itemPath) continue;
      const itemComparable = makeBlessingComparableKey(localImageBaseName(itemPath));
      if (targetComparable && itemComparable === targetComparable) return itemPath;
    }

    for (const item of list) {
      const itemPath = String(item?.path || '').trim();
      if (!itemPath) continue;
      const itemComparable = makeBlessingComparableKey(localImageBaseName(itemPath));
      if (targetComparable && (itemComparable.includes(targetComparable) || targetComparable.includes(itemComparable))) return itemPath;
    }

    return '';
  }

  function renderRichText(text) {
    const wrap = el('div', {
      class: 'leading-relaxed text-sm text-slate-200 whitespace-pre-wrap break-words text-left'
    });
  
    const src = String(text || '').replace(/\r\n/g, '\n');
    if (!src.trim()) return wrap;
  
    const lines = src.split('\n');
  
    function appendInlineStyled(container, line) {
      let last = 0;
      const regex = /\[(gold|light|orange|mint|keyword|keyword2|break|debuff)\]([\s\S]*?)\[\/\1\]/gi;
      let m;
    
      while ((m = regex.exec(line)) !== null) {
        const before = line.slice(last, m.index);
        if (before) container.append(document.createTextNode(before));
      
        const tag = String(m[1] || '').toLowerCase();
        const content = m[2] || '';
        container.append(el('span', {
          style: `color:${TAG_TO_COLOR[tag] || '#fff'}; font-weight:700;`
        }, content));
      
        last = regex.lastIndex;
      }
    
      const tail = line.slice(last);
      if (tail) container.append(document.createTextNode(tail));
    }
  
    let bulletList = null;
  
    function flushBulletList() {
      if (bulletList) {
        wrap.appendChild(bulletList);
        bulletList = null;
      }
    }
  
    for (const rawLine of lines) {
      const line = String(rawLine || '');
      const trimmed = line.trim();
    
      if (!trimmed) {
        flushBulletList();
        wrap.appendChild(el('div', { class: 'h-2' }));
        continue;
      }
    
      // bullet list with dot
      if (trimmed.startsWith('|')) {
        if (!bulletList) {
          bulletList = el('ul', {
            class: 'list-disc pl-5 mt-1 space-y-1'
          });
        }
      
        const li = el('li', {});
        appendInlineStyled(li, trimmed.slice(1).trim());
        bulletList.appendChild(li);
        continue;
      }
    
      flushBulletList();
    
      // indented line without dot
      if (trimmed.startsWith('>')) {
        const div = el('div', {
          class: 'pl-5 mt-1'
        });
        appendInlineStyled(div, trimmed.slice(1).trim());
        wrap.appendChild(div);
        continue;
      }
    
      const p = el('div', {});
      appendInlineStyled(p, line);
      wrap.appendChild(p);
    }
  
    flushBulletList();
    return wrap;
  }

  function insertAroundSelection(textarea, openTag, closeTag) {
    const start = textarea.selectionStart ?? 0;
    const end = textarea.selectionEnd ?? 0;
    const value = textarea.value || '';
    const selected = value.slice(start, end);
    const next = value.slice(0, start) + openTag + selected + closeTag + value.slice(end);
    textarea.value = next;

    const newStart = start + openTag.length;
    const newEnd = newStart + selected.length;

    textarea.focus();
    textarea.setSelectionRange(newStart, newEnd);
    textarea.dispatchEvent(new Event('input'));
  }

  function btnClass(active, size = 'md') {
    const base = 'rounded-xl border font-semibold transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400/50 disabled:opacity-50 disabled:cursor-not-allowed';
    const sizeCls = size === 'sm' ? 'h-9 px-3 text-sm' : 'h-10 px-4 text-base';
    return [
      base,
      sizeCls,
      active
        ? 'bg-yellow-400 text-black border-yellow-300/60 shadow-[0_8px_24px_rgba(250,199,0,.18)]'
        : 'bg-glass text-slate-200 border-white/10 hover:bg-white/10 hover:text-white hover:border-white/20 hover:-translate-y-[1px]'
    ].join(' ');
  }

  function dangerBtnClass(size = 'sm') {
    const base = 'rounded-xl border font-semibold transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400/50';
    const sizeCls = size === 'sm' ? 'h-9 px-3 text-sm' : 'h-10 px-4 text-base';
    return [
      base,
      sizeCls,
      'bg-rose-500/15 hover:bg-rose-500/25 hover:border-rose-300/40 hover:-translate-y-[1px] border-rose-400/30 text-rose-100'
    ].join(' ');
  }

  function tabClass(active) {
    return [
      'h-10 w-full rounded-xl border text-base font-semibold transition-colors',
      active
        ? 'bg-yellow-400 text-black shadow border-yellow-300'
        : 'bg-glass text-slate-200 hover:bg-slate-800/50 border-slate-700/60'
    ].join(' ');
  }

  function blessingVisual(item, rarity, size = 154) {
    const frameUrl = rarityFrame(rarity);
    const imageUrl = String(item?.image || '').trim();
  
    const root = el('div', {
      class: 'relative mx-auto shrink-0',
      style: `width:${size}px;height:${size}px;`
    });
  
    // wewnętrzny obszar obrazka
    const inner = el('div', {
      class: 'absolute inset-0 flex items-center justify-center overflow-hidden',
      style: `
        clip-path: polygon(40% 0%,65% 0%,100% 35%,100% 62%,70% 100%,30% 100%,0% 60%,0% 30%);
      `
    });
  
    if (imageUrl) {
      inner.appendChild(el('img', {
        src: cdnySafe(imageUrl, 512),
        alt: item?.name || '',
        class: 'object-contain select-none',
        style: 'width:90%;height:90%;'
      }));
    } else {
      inner.appendChild(el('div', {
        class: 'flex items-center justify-center text-slate-500',
        style: 'width:90%;height:90%;font-size:36px;'
      }, el('i', { class: 'fa-solid fa-gem' })));
    }
  
    root.appendChild(inner);
  
    root.appendChild(el('img', {
      src: frameUrl,
      alt: '',
      class: 'absolute inset-0 w-full h-full object-contain pointer-events-none select-none'
    }));
  
    return root;
  }

  function rarityEditAllBar(typeKey) {
    if (!state.isLoggedIn || !state.showBulkEditor) return null;

    const list = filteredBlessingStones(typeKey);
    if (!list.length) return null;

    const select = el('select', {
      class: 'hunter-edit-select'
    });

    for (const rarity of RARITIES) {
      select.appendChild(el('option', { value: rarity }, rarity));
    }
    select.value = 'Do not own';

    const card = el('div', { class: 'hunter-progress-card hunter-progress-bulk-card' });

    const header = el('div', { class: 'hunter-progress-head' });
    const imgWrap = el('div', { class: 'hunter-progress-avatar' },
      el('div', { class: 'ml-all hunter-progress-all-badge' }, 'EDIT\nALL')
    );

    const meta = el('div', { class: 'hunter-progress-meta' },
      el('div', { class: 'hunter-progress-name', title: 'Bulk edit for all filtered blessing stones' }, 'Edit all'),
      el('div', { class: 'hunter-progress-bulk-sub' }, `Set rarity for all visible blessing stones (${list.length}).`)
    );
    header.append(imgWrap, meta);
    card.append(header);

    const stats = el('div', { class: 'hunter-progress-stats' });
    const rarityStat = el('div', { class: 'hunter-progress-stat hunter-progress-stat-full' },
      el('div', { class: 'hunter-progress-stat-label' }, 'Rarity'),
      el('div', { class: 'hunter-progress-growth-edit' },
        select,
        el('button', {
          type: 'button',
          class: 'edit-btn',
          onClick: async () => {
            const chosen = normalizeRarity(select.value);
            const backup = { ...state.myRarities };

            for (const item of list) {
              state.myRarities[String(item.id)] = chosen;
            }

            render();

            try {
              const result = await postJson('/api/blessing-stones/my-rarities', {
                rarities: state.myRarities
              });
              state.myRarities = normalizeMyRarities(result?.myRarities || state.myRarities);
              render();
              toast('Filtered rarities updated.');
            } catch (e) {
              state.myRarities = backup;
              render();
              toast(String(e?.message || e));
            }
          }
        }, 'Save all')
      )
    );
    stats.append(rarityStat);
    card.append(stats);

    return card;
  }

  function publicToolbar(typeKey) {
    const search = el('input', {
      type: 'search',
      value: state.filters.name,
      placeholder: 'Search blessing stone...',
      class: 'search',
      'data-role': 'blessing-search'
    });
    search.addEventListener('input', () => {
      state.filters.name = search.value || '';
      rerenderKeepingFocus();
    });

    const rarityWrap = el('div', { class: 'filter-group' });
    for (const rarity of RARITIES) {
      rarityWrap.appendChild(el('button', {
        type: 'button',
        class: `bs-rarity-square ${(state.filters.rarities || []).includes(rarity) ? 'is-active' : ''} ${rarity === 'Do not own' ? 'is-empty' : ''}`,
        title: rarity,
        style: `background:${rarityColor(rarity)};`,
        onClick: () => {
          state.filters.rarities = toggleInArray(state.filters.rarities, rarity);
          rerenderKeepingFocus();
        }
      }));
    }

    const activeCount = filteredBlessingStones(typeKey).length;
    const totalCount = getPublicList(typeKey).length;

    const rightChildren = [];
    if (state.isLoggedIn) {
      rightChildren.push(
        el('button', {
          type: 'button',
          class: 'toolbar-edit-btn',
          title: 'Edit all visible blessing stones',
          onClick: () => {
            state.showBulkEditor = !state.showBulkEditor;
            render();
          }
        },
          el('i', { class: `fa-solid ${state.showBulkEditor ? 'fa-chevron-up' : 'fa-pen-to-square'}` }),
          'Edit'
        )
      );
    }

    rightChildren.push(
      el('button', {
        type: 'button',
        class: 'reset-btn',
        title: 'Reset filters',
        onClick: () => {
          resetFilters();
          state.showBulkEditor = false;
          rerenderKeepingFocus();
        }
      },
        el('span', { class: 'reset-x' }, '×'),
        'Reset'
      )
    );

    return el('div', { class: 'hunters-toolbar mb-4' },
      search,
      rarityWrap,
      el('div', { class: 'toolbar-right' }, ...rightChildren)
    );
  }

  function publicCard(item) {
    const currentRarity = getUserRarity(item.id);

    const bodyChildren = [
      blessingVisual(item, currentRarity, 158),

      el('div', {
        class: 'mt-4 text-center text-slate-100 font-extrabold text-[17px] sm:text-[18px] leading-tight break-words min-h-[48px] flex items-center justify-center'
      }, item.name || '—'),

      el('div', {
        class: 'mt-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 flex items-center justify-center gap-2 text-slate-200'
      },
        el('img', {
          src: cdnySafe(typeIcon(item.type), 96),
          alt: item.type,
          class: 'w-5 h-5 object-contain shrink-0'
        }),
        el('span', { class: 'font-semibold text-sm sm:text-[15px]' }, normalizeType(item.type))
      ),

      el('div', {
        class: 'mt-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 min-h-[88px] flex items-center justify-center text-center'
      }, renderRichText(item.text))
    ];

    if (state.isLoggedIn && state.showBulkEditor) {
      const raritySelect = el('select', {
        class: 'mt-3 w-full h-11 rounded-xl border border-white/10 bg-slate-950/70 px-3 text-slate-100 font-extrabold outline-none focus:border-yellow-400/50'
      });

      for (const rarity of RARITIES) {
        raritySelect.appendChild(el('option', { value: rarity }, rarity));
      }
      raritySelect.value = currentRarity;

      raritySelect.addEventListener('change', async () => {
        const chosen = normalizeRarity(raritySelect.value);
        const previous = getUserRarity(item.id);
        if (chosen === previous) return;

        setUserRarityLocal(item.id, chosen);
        render();

        try {
          const result = await postJson('/api/blessing-stones/my-rarities', {
            rarities: state.myRarities
          });
          state.myRarities = normalizeMyRarities(result?.myRarities || state.myRarities);
          render();
          toast(`${item.name} rarity updated.`);
        } catch (e) {
          setUserRarityLocal(item.id, previous);
          render();
          toast(String(e?.message || e));
        }
      });

      bodyChildren.push(raritySelect);
    }

    return el('div', {
      class: 'rounded-[22px] border bg-gradient-to-br from-slate-900/95 to-slate-800/90 shadow-[0_10px_30px_rgba(0,0,0,.20)] overflow-hidden',
      style: `border-color:${rarityColor(currentRarity)}55;`
    },
      el('div', { class: 'p-4 sm:p-5' }, ...bodyChildren)
    );
  }

  function renderPublicCards(typeKey) {
    const list = filteredBlessingStones(typeKey);
    const bulkCard = rarityEditAllBar(typeKey);

    return el('div', { class: 'w-full' },
      publicToolbar(typeKey),

      el('div', { class: 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4' },
        ...(bulkCard ? [bulkCard] : []),
        ...(list.length
          ? list.map(publicCard)
          : [
              el('div', {
                class: 'rounded-2xl border border-white/10 bg-glass p-6 text-slate-300'
              }, 'No blessing stones match the current filters.')
            ])
      )
    );
  }

  function adminCard(typeKey, item) {
    return el('div', {
      class: 'rounded-[22px] border border-white/10 bg-gradient-to-br from-slate-900/95 to-slate-800/90 shadow-[0_10px_30px_rgba(0,0,0,.20)] overflow-hidden'
    },
      el('div', { class: 'p-4 sm:p-5' },
        blessingVisual(item, 'Legendary', 146),

        el('div', {
          class: 'mt-4 text-center text-slate-100 font-extrabold text-[17px] leading-tight break-words min-h-[48px] flex items-center justify-center'
        }, item.name || '—'),

        el('div', {
          class: 'mt-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 flex items-center justify-center gap-2 text-slate-200'
        },
          el('img', {
            src: cdnySafe(typeIcon(item.type), 96),
            alt: item.type,
            class: 'w-5 h-5 object-contain shrink-0'
          }),
          el('span', { class: 'font-semibold text-sm sm:text-[15px]' }, normalizeType(item.type))
        ),

        el('div', {
          class: 'mt-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 min-h-[88px] flex items-center justify-center text-center'
        }, renderRichText(item.text)),

        el('div', { class: 'mt-4 grid grid-cols-2 gap-2' },
          el('button', {
            class: btnClass(false, 'sm'),
            onClick: () => openEditModal(typeKey, item)
          }, el('i', { class: 'fa-solid fa-pen mr-2' }), 'Edit'),
          el('button', {
            class: dangerBtnClass('sm'),
            onClick: () => removeBlessing(typeKey, item.id)
          }, el('i', { class: 'fa-solid fa-trash mr-2' }), 'Delete')
        )
      )
    );
  }

  async function saveExactOrder(typeKey, nextList) {
    const next = {
      empowerment: Array.isArray(state.data.empowerment) ? [...state.data.empowerment] : [],
      survival: Array.isArray(state.data.survival) ? [...state.data.survival] : []
    };

    next[typeKey] = Array.isArray(nextList) ? [...nextList] : [];

    const saved = await postJson('/api/blessing-stones/admin', next);
    state.data = normalizeData(saved);
    state.isAdmin = !!(saved?.isAdmin ?? state.isAdmin);
    state.isLoggedIn = !!(saved?.isLoggedIn ?? state.isLoggedIn);
    state.adminActive = typeKey;
    render();
  }

  function openExactOrderModal(typeKey) {
    if (!state.isAdmin) {
      toast('Admin only.');
      return;
    }

    closeModal();
    state.dirtyAdmin = true;

    const list = Array.isArray(state.data[typeKey]) ? [...state.data[typeKey]] : [];
    const textarea = el('textarea', {
      rows: '14',
      class: 'w-full min-h-[260px] px-3 py-3 rounded-xl bg-slate-950/40 border border-slate-700/60 text-slate-100 outline-none focus:border-yellow-400/40 font-extrabold'
    }, list.map((item) => item?.name || '').filter(Boolean).join('\n'));

    const saveBtn = el('button', {
      class: btnClass(true),
      onClick: async () => {
        const lines = String(textarea.value || '')
          .split(/\r?\n/)
          .map((x) => x.trim())
          .filter(Boolean);

        const baseList = Array.isArray(state.data[typeKey]) ? [...state.data[typeKey]] : [];
        const nameMap = new Map();
        for (const item of baseList) {
          const name = String(item?.name || '').trim();
          if (!name || nameMap.has(name)) continue;
          nameMap.set(name, item);
        }

        const next = [];
        const seen = new Set();
        for (const name of lines) {
          if (!nameMap.has(name)) continue;
          if (seen.has(name)) continue;
          seen.add(name);
          next.push(nameMap.get(name));
        }
        for (const item of baseList) {
          const name = String(item?.name || '').trim();
          if (!name || seen.has(name)) continue;
          next.push(item);
        }

        try {
          await saveExactOrder(typeKey, next);
          closeModal();
          toast('Order saved.');
        } catch (e) {
          console.error(e);
          toast(String(e?.message || e));
        }
      }
    }, el('i', { class: 'fa-solid fa-floppy-disk mr-2' }), 'Save');

    modalEl = el('div', {
      class: 'fixed inset-0 z-[9999] flex items-center justify-center p-4 overflow-y-auto',
      style: 'background: rgba(0,0,0,.55); backdrop-filter: blur(6px);'
    },
      el('div', {
        class: 'w-full max-w-3xl rounded-2xl border border-white/10 bg-glass p-5 shadow-2xl max-h-[90vh] overflow-y-auto'
      },
        el('div', { class: 'flex items-start justify-between gap-3 mb-4' },
          el('div', {},
            el('div', { class: 'text-lg font-extrabold text-slate-100' }, `Set exact order — ${TYPE_LABELS[typeKey]}`),
            el('div', { class: 'text-xs text-slate-300/85 mt-0.5' }, 'One blessing stone name per line. Missing items will be appended automatically.')
          ),
          el('button', {
            class: 'text-slate-300 hover:text-white',
            onClick: closeModal
          }, el('i', { class: 'fa-solid fa-xmark text-xl' }))
        ),
        textarea,
        el('div', { class: 'flex justify-end gap-2 mt-5' },
          el('button', {
            class: btnClass(false),
            onClick: closeModal
          }, 'Cancel'),
          saveBtn
        )
      )
    );

    document.body.appendChild(modalEl);
  }

  function renderAdminPanel() {
    if (!state.isAdmin) {
      return el('div', {
        class: 'rounded-2xl border border-rose-500/40 bg-rose-500/10 p-6 text-slate-100'
      },
        el('div', { class: 'text-lg font-extrabold mb-2' }, 'Access denied'),
        el('div', { class: 'text-slate-300/90' }, 'You don’t have admin permission.')
      );
    }

    const list = state.data[state.adminActive] || [];

    const body = el('div', { class: 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4' },
          ...(list.length
            ? list.map((item) => adminCard(state.adminActive, item))
            : [
                el('div', {
                  class: 'rounded-2xl border border-white/10 bg-glass p-6 text-slate-300'
                }, 'No blessing stones in this category yet.')
              ])
        );

    return el('div', { class: 'w-full' },
      el('div', { class: 'flex flex-col gap-3 mb-4' },
        el('div', { class: 'flex items-center justify-between gap-3 flex-wrap' },
          el('div', { class: 'flex items-center gap-3' },
            el('div', {
              class: 'w-10 h-10 rounded-2xl bg-slate-800/60 border border-slate-700/60 flex items-center justify-center'
            }, el('i', { class: 'fa-solid fa-user-shield' })),
            el('div', {},
              el('div', { class: 'font-extrabold text-slate-100 text-lg' }, 'Admin'),
              el('div', { class: 'text-xs text-slate-300/85' }, 'Name, image, type and text are global for all users.')
            )
          ),
          el('div', { class: 'flex items-center gap-2 flex-wrap' },
            el('button', {
              class: btnClass(false, 'md'),
              onClick: () => openExactOrderModal(state.adminActive)
            }, el('i', { class: 'fa-solid fa-list-ol mr-2' }), 'Set exact order'),
            el('button', {
              class: btnClass(true, 'md'),
              onClick: () => openEditModal(state.adminActive, null)
            }, el('i', { class: 'fa-solid fa-plus mr-2' }), 'Add')
          )
        ),
        el('div', { class: 'flex items-center gap-2 flex-wrap' },
          el('button', {
            class: btnClass(state.adminActive === 'empowerment'),
            onClick: () => {
              state.adminActive = 'empowerment';
              state.adminOrderMode = false;
              render();
            }
          }, 'Empowerment'),
          el('button', {
            class: btnClass(state.adminActive === 'survival'),
            onClick: () => {
              state.adminActive = 'survival';
              state.adminOrderMode = false;
              render();
            }
          }, 'Survival')
        )
      ),
      body
    );
  }

  let modalEl = null;

  function closeModal() {
    if (modalEl?.parentNode) modalEl.parentNode.removeChild(modalEl);
    modalEl = null;
    state.dirtyAdmin = false;
  }

  function buildImageSelect(currentValue, onChange) {
    const select = el('select', {
      class: 'w-full px-3 py-2 rounded-xl bg-slate-950/40 border border-slate-700/60 text-slate-100 outline-none focus:border-yellow-400/40'
    }, el('option', { value: '' }, 'Select local image…'));

    let currentPath = String(currentValue || '').trim();
    let suppressOnChange = false;

    function syncCurrent() {
      if (!currentPath) {
        select.value = '';
        return;
      }
      const has = [...select.options].some((o) => o.value === currentPath);
      if (!has) select.appendChild(el('option', { value: currentPath }, prettyFileLabel(currentPath)));
      select.value = currentPath;
    }

    select.setCurrentValue = (nextValue, meta = {}) => {
      const normalized = String(nextValue || '').trim();
      if (normalized === currentPath) return;
      currentPath = normalized;
      suppressOnChange = true;
      syncCurrent();
      suppressOnChange = false;
      if (!meta.silent) onChange(currentPath, { auto: !!meta.auto, manual: !!meta.manual, silent: false });
    };

    select.addEventListener('change', () => {
      currentPath = String(select.value || '').trim();
      if (suppressOnChange) return;
      onChange(currentPath, { auto: false, manual: true, silent: false });
    });

    syncCurrent();

    loadBlessingPictureList()
      .then((items) => {
        const selected = currentPath;
        while (select.options.length > 1) select.remove(1);
        for (const item of items) {
          select.appendChild(el('option', { value: item.path }, item.label));
        }
        currentPath = selected;
        syncCurrent();
      })
      .catch((e) => {
        console.error(e);
        select.appendChild(el('option', { value: '' }, 'Failed to load local images'));
      });

    return select;
  }

  function openEditModal(typeKey, item) {
    if (!state.isAdmin) {
      toast('Admin only.');
      return;
    }

    closeModal();
    state.dirtyAdmin = true;

    const editing = !!item;

    const nameInput = el('input', {
      type: 'text',
      value: item?.name || '',
      placeholder: 'Name',
      class: 'w-full px-3 py-2 rounded-xl bg-slate-950/40 border border-slate-700/60 text-slate-100 outline-none focus:border-yellow-400/40'
    });

    const typeSelect = el('select', {
      class: 'w-full px-3 py-2 rounded-xl bg-slate-950/40 border border-slate-700/60 text-slate-100 outline-none focus:border-yellow-400/40'
    },
      el('option', { value: 'Empowerment' }, 'Empowerment'),
      el('option', { value: 'Survival' }, 'Survival')
    );
    typeSelect.value = normalizeType(item?.type || TYPE_LABELS[typeKey]);

    let selectedImagePath = String(item?.image || '').trim();
    let imageManuallyChanged = false;
    let lastAutoImagePath = '';

    const textInput = el('textarea', {
      rows: '8',
      class: 'w-full px-3 py-2 rounded-xl bg-slate-950/40 border border-slate-700/60 text-slate-100 outline-none focus:border-yellow-400/40',
      placeholder: 'Use tags: [keyword]text[/keyword], [keyword2]text[/keyword2], [break]text[/break], [debuff]text[/debuff]'
    }, item?.text || '');

    const imageSelect = buildImageSelect(selectedImagePath, (v, meta = {}) => {
      selectedImagePath = String(v || '').trim();
      if (meta.manual) {
        imageManuallyChanged = true;
        lastAutoImagePath = '';
      }
      if (meta.auto) {
        lastAutoImagePath = selectedImagePath;
      }
      refreshPreview();
    });

    async function tryAutoFillImageFromName() {
      const rawName = String(nameInput.value || '').trim();
      const canAutoReplaceCurrent =
        !imageManuallyChanged || !selectedImagePath || selectedImagePath === lastAutoImagePath;

      if (!canAutoReplaceCurrent) return;

      if (!rawName) {
        if (!selectedImagePath || selectedImagePath === lastAutoImagePath) {
          lastAutoImagePath = '';
          if (typeof imageSelect.setCurrentValue === 'function') {
            imageSelect.setCurrentValue('', { silent: true, auto: true });
          }
          selectedImagePath = '';
          refreshPreview();
        }
        return;
      }

      try {
        const items = await loadBlessingPictureList();
        const match = String(findBestLocalImageMatch(rawName, items) || '').trim();

        if (!match) {
          if (!selectedImagePath || selectedImagePath === lastAutoImagePath) {
            lastAutoImagePath = '';
            if (typeof imageSelect.setCurrentValue === 'function') {
              imageSelect.setCurrentValue('', { silent: true, auto: true });
            }
            selectedImagePath = '';
            refreshPreview();
          }
          return;
        }

        if (match === selectedImagePath && match === lastAutoImagePath) return;

        lastAutoImagePath = match;
        selectedImagePath = match;
        if (typeof imageSelect.setCurrentValue === 'function') {
          imageSelect.setCurrentValue(selectedImagePath, { silent: true, auto: true });
        }
        refreshPreview();
      } catch (e) {
        console.error(e);
      }
    }

    const previewBox = el('div', {
      class: 'rounded-2xl border border-white/10 bg-black/20 p-4'
    });

    const tagButtons = el('div', { class: 'flex flex-wrap gap-2' },
      el('button', {
        type: 'button',
        class: btnClass(false, 'sm'),
        style: `color:${COLOR_GOLD};`,
        onClick: () => insertAroundSelection(textInput, '[keyword]', '[/keyword]')
      }, 'Keyword'),
      el('button', {
        type: 'button',
        class: btnClass(false, 'sm'),
        style: `color:${COLOR_LIGHT};`,
        onClick: () => insertAroundSelection(textInput, '[keyword2]', '[/keyword2]')
      }, 'Keyword2'),
      el('button', {
        type: 'button',
        class: btnClass(false, 'sm'),
        style: `color:${COLOR_ORANGE};`,
        onClick: () => insertAroundSelection(textInput, '[break]', '[/break]')
      }, 'Break'),
      el('button', {
        type: 'button',
        class: btnClass(false, 'sm'),
        style: `color:${COLOR_MINT};`,
        onClick: () => insertAroundSelection(textInput, '[debuff]', '[/debuff]')
      }, 'Debuff')
    );

    function refreshPreview() {
      previewBox.innerHTML = '';

      const previewItem = {
        name: String(nameInput.value || '').trim() || 'Preview',
        type: normalizeType(typeSelect.value),
        image: selectedImagePath,
        text: String(textInput.value || '')
      };

      previewBox.append(
        el('div', {
          class: 'rounded-[22px] border border-white/10 bg-gradient-to-br from-slate-900/95 to-slate-800/90 p-4'
        },
          blessingVisual(previewItem, 'Legendary', 150),
          el('div', {
            class: 'mt-4 text-center text-slate-100 font-extrabold text-[17px] leading-tight min-h-[48px] flex items-center justify-center'
          }, previewItem.name),
          el('div', {
            class: 'mt-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 flex items-center justify-center gap-2 text-slate-200'
          },
            el('img', {
              src: cdnySafe(typeIcon(previewItem.type), 96),
              alt: previewItem.type,
              class: 'w-5 h-5 object-contain shrink-0'
            }),
            el('span', { class: 'font-semibold text-sm sm:text-[15px]' }, previewItem.type)
          ),
          el('div', {
            class: 'mt-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 min-h-[88px] flex items-center justify-center text-center'
          }, renderRichText(previewItem.text))
        )
      );
    }

    nameInput.addEventListener('input', () => {
      refreshPreview();
      tryAutoFillImageFromName();
    });
    typeSelect.addEventListener('change', refreshPreview);
    textInput.addEventListener('input', refreshPreview);
    refreshPreview();

    if (!editing && !selectedImagePath) {
      tryAutoFillImageFromName();
    }

    const saveBtn = el('button', {
      class: btnClass(true),
      onClick: async () => {
        const name = String(nameInput.value || '').trim();
        const type = normalizeType(typeSelect.value);
        const text = normalizeText(textInput.value || '');
        const image = String(selectedImagePath || '').trim();

        if (!name) {
          toast('Name is required.');
          return;
        }

        const targetKey = type.toLowerCase() === 'survival' ? 'survival' : 'empowerment';
        const id = editing && item?.id ? item.id : `blessing_${targetKey}_${Date.now()}`;

        const payloadItem = { id, name, type, image, text };

        try {
          await saveAdminItem(targetKey, payloadItem, editing ? typeKey : null);
          closeModal();
          toast(editing ? 'Blessing Stone updated.' : 'Blessing Stone added.');
        } catch (e) {
          console.error(e);
          toast(String(e?.message || e));
        }
      }
    }, el('i', { class: 'fa-solid fa-floppy-disk mr-2' }), 'Save');

    modalEl = el('div', {
      class: 'fixed inset-0 z-[9999] flex items-center justify-center p-4 overflow-y-auto',
      style: 'background: rgba(0,0,0,.55); backdrop-filter: blur(6px);'
    },
      el('div', {
        class: 'w-full max-w-3xl rounded-2xl border border-white/10 bg-glass p-5 shadow-2xl max-h-[90vh] overflow-y-auto'
      },
        el('div', { class: 'flex items-start justify-between gap-3 mb-4' },
          el('div', {},
            el('div', { class: 'text-lg font-extrabold text-slate-100' }, editing ? 'Edit Blessing Stone' : 'Add Blessing Stone'),
            el('div', { class: 'text-xs text-slate-300/85 mt-0.5' }, 'Admin changes are global for all users.')
          ),
          el('button', {
            class: 'text-slate-300 hover:text-white',
            onClick: closeModal
          }, el('i', { class: 'fa-solid fa-xmark text-xl' }))
        ),

        el('div', { class: 'grid grid-cols-1 md:grid-cols-2 gap-4' },
          el('div', { class: 'flex flex-col gap-2' },
            el('div', { class: 'text-xs font-bold text-slate-300' }, 'Name'),
            nameInput,

            el('div', { class: 'text-xs font-bold text-slate-300 mt-2' }, 'Type'),
            typeSelect,

            el('div', { class: 'text-xs font-bold text-slate-300 mt-2' }, 'Local image'),
            imageSelect,
            el('div', { class: 'text-[11px] text-slate-400 -mt-1' }, 'Auto-filled from Name when possible. Manual selection stops auto-fill.'),

            el('div', { class: 'text-xs font-bold text-slate-300 mt-2' }, 'Text'),
            tagButtons,
            textInput
          ),

          el('div', { class: 'flex flex-col gap-2' },
            el('div', { class: 'text-xs font-bold text-slate-300' }, 'Preview'),
            previewBox
          )
        ),

        el('div', { class: 'flex justify-end gap-2 mt-5' },
          el('button', {
            class: btnClass(false),
            onClick: closeModal
          }, 'Cancel'),
          saveBtn
        )
      )
    );

    document.body.appendChild(modalEl);
  }

  async function saveAdminItem(targetKey, item, oldTypeKey = null) {
    const next = {
      empowerment: Array.isArray(state.data.empowerment) ? [...state.data.empowerment] : [],
      survival: Array.isArray(state.data.survival) ? [...state.data.survival] : []
    };

    if (oldTypeKey && oldTypeKey !== targetKey) {
      next[oldTypeKey] = next[oldTypeKey].filter((x) => String(x.id) !== String(item.id));
    }

    const list = Array.isArray(next[targetKey]) ? [...next[targetKey]] : [];
    const idx = list.findIndex((x) => String(x.id) === String(item.id));

    if (idx >= 0) list[idx] = item;
    else list.unshift(item);

    next[targetKey] = list;

    const saved = await postJson('/api/blessing-stones/admin', next);
    state.data = normalizeData(saved);
    state.isAdmin = !!(saved?.isAdmin ?? state.isAdmin);
    state.isLoggedIn = !!(saved?.isLoggedIn ?? state.isLoggedIn);
    state.adminActive = targetKey;
    state.adminOrderMode = false;
    render();
  }

  async function removeBlessing(typeKey, id) {
    if (!confirm('Delete this Blessing Stone?')) return;

    const next = {
      empowerment: Array.isArray(state.data.empowerment) ? [...state.data.empowerment] : [],
      survival: Array.isArray(state.data.survival) ? [...state.data.survival] : []
    };

    next[typeKey] = next[typeKey].filter((x) => String(x.id) !== String(id));

    try {
      const saved = await postJson('/api/blessing-stones/admin', next);
      state.data = normalizeData(saved);
      state.isAdmin = !!(saved?.isAdmin ?? state.isAdmin);
      state.isLoggedIn = !!(saved?.isLoggedIn ?? state.isLoggedIn);
      render();
      toast('Deleted.');
    } catch (e) {
      console.error(e);
      toast(String(e?.message || e));
    }
  }

  async function loadPageData() {
    const data = await fetchJson('/api/blessing-stones');
    state.data = normalizeData(data);
    state.myRarities = normalizeMyRarities(data);
    state.isAdmin = !!(
      data?.isAdmin ||
      window.STATE?.isAdmin ||
      window.STATE?.admin ||
      document.body?.dataset?.admin === '1' ||
      document.body?.dataset?.admin === 'true'
    );
    state.isLoggedIn = !!(
      data?.isLoggedIn ||
      window.STATE?.user ||
      window.STATE?.loggedIn ||
      window.STATE?.isLoggedIn ||
      document.body?.dataset?.loggedIn === '1' ||
      document.body?.dataset?.loggedIn === 'true'
    );
  }

  function stopPolling() {
    if (state.pollTimer) clearInterval(state.pollTimer);
    state.pollTimer = null;
  }

  function startPolling(root) {
    stopPolling();
    state.pollTimer = setInterval(async () => {
      try {
        if (!document.body.contains(root)) return stopPolling();
        if (state.dirtyAdmin) return;

        const data = await fetchJson('/api/blessing-stones');
        const nextGlobal = normalizeData(data);

        if ((nextGlobal.version || 0) !== (state.data.version || 0)) {
          state.data = nextGlobal;
          state.isAdmin = !!(
            data?.isAdmin ||
            window.STATE?.isAdmin ||
            window.STATE?.admin ||
            document.body?.dataset?.admin === '1' ||
            document.body?.dataset?.admin === 'true'
          );
          state.isLoggedIn = !!(
            data?.isLoggedIn ||
            window.STATE?.user ||
            window.STATE?.loggedIn ||
            window.STATE?.isLoggedIn ||
            document.body?.dataset?.loggedIn === '1' ||
            document.body?.dataset?.loggedIn === 'true'
          );
          render();
        }
      } catch {}
    }, 5000);
  }

  function renderHeader(root) {
    const headerKey = (state.active === 'survival' || state.active === 'empowerment' || state.active === 'all') ? state.active : 'all';
    const owned = getOwnedCount(headerKey);
    const total = getPublicList(headerKey).length;

    root.append(
      el('div', { class: 'flex items-center justify-between gap-3 mb-4' },
        el('div', { class: 'min-w-0' },
          el('div', {
            class: 'text-2xl font-extrabold text-yellow-400 leading-tight'
          }, 'Blessing Stones'),
          el('div', {
            class: 'text-sm text-slate-300/90'
          }, 'Browse all blessing stones in Solo Leveling: ARISE')
        ),
        el('div', { class: 'bs-count-chip shrink-0' }, `${owned}/${total}`)
      )
    );
  }

  function renderTabs(root) {
    const tabs = [...publicTabs()];
  if (isAdminTabVisible()) tabs.push({ key: 'admin', label: 'Admin' });

  const cols = tabs.length;
  const bar = el('div', {
    class: 'grid ' + (
      cols === 4 ? 'grid-cols-2 md:grid-cols-4' :
      cols === 3 ? 'grid-cols-3' :
      cols === 2 ? 'grid-cols-2' :
      'grid-cols-1'
    ) + ' gap-2 mb-4'
  });

  const btn = (key, label) => {
    const active = state.active === key;

    const b = el('button', {
      type: 'button',
      class: tabClass(active)
    }, label);

      b.addEventListener('click', () => {
        if (state.active === key) return;
        state.active = key;
        state.showBulkEditor = false;
        render();
      });

      return b;
    };

    if (state.active === 'admin' && !isAdminTabVisible()) {
      state.active = 'all';
    }

    for (const t of tabs) {
      bar.appendChild(btn(t.key, t.label));
    }

    root.appendChild(bar);
  }

  function rerenderKeepingFocus() {
    const active = document.activeElement;
    const isSearch = !!(active && active.matches && active.matches('input[data-role="blessing-search"]'));
    const selStart = isSearch ? active.selectionStart : null;
    const selEnd = isSearch ? active.selectionEnd : null;

    render();

    if (isSearch) {
      const nextInput = qs('input[data-role="blessing-search"]');
      if (nextInput) {
        nextInput.focus();
        try {
          nextInput.setSelectionRange(
            selStart ?? nextInput.value.length,
            selEnd ?? nextInput.value.length
          );
        } catch {}
      }
    }
  }

  function render() {
    ensureBlessingSharedStyles();
    const content = qs('#content');
    if (!content) return;

    if (state.active === 'admin' && !isAdminTabVisible()) {
      state.active = 'all';
    }

    const wrap = el('div', { class: 'max-w-7xl mx-auto' });
    renderHeader(wrap);
    renderTabs(wrap);

    if (state.active === 'admin') {
      wrap.appendChild(renderAdminPanel());
    } else {
      wrap.appendChild(renderPublicCards(state.active));
    }

    content.innerHTML = '';
    content.appendChild(el('div', {
      class: 'w-full mx-auto px-3 sm:px-6 py-6',
      'data-sla-page': 'blessing-stones'
    }, wrap));
  }

  window.addEventListener('sla:admin-hide-changed', (e) => {
    try {
      state.hideAdminButtons = !!e?.detail?.hide;
      if (state.active === 'admin' && !isAdminTabVisible()) {
        state.active = 'all';
      }
      render();
    } catch {}
  });

  window.__blessing_stones_mount = async function __blessing_stones_mount() {
    ensureBlessingSharedStyles();
    const content = qs('#content');
    if (!content) return;

    state.hideAdminButtons = getHideAdminButtons();

    content.innerHTML = `
      <div class="w-full mx-auto px-3 sm:px-6 py-6" data-sla-page="blessing-stones">
        <div class="max-w-7xl mx-auto rounded-2xl border border-white/10 bg-glass p-6 text-slate-100">
          <div class="text-lg font-extrabold mb-2">Loading Blessing Stones…</div>
          <div class="text-slate-200/80">Please wait.</div>
        </div>
      </div>
    `;

    try {
      await loadPageData();
      render();
      startPolling(content);
    } catch (e) {
      console.error(e);
      content.innerHTML = `
        <div class="w-full mx-auto px-3 sm:px-6 py-6" data-sla-page="blessing-stones">
          <div class="max-w-7xl mx-auto rounded-2xl border border-rose-500/40 bg-rose-500/10 p-6 text-slate-100">
            <div class="text-lg font-extrabold mb-2">Failed to load Blessing Stones</div>
            <div class="text-slate-300/90">${escapeHtml(String(e?.message || e))}</div>
          </div>
        </div>
      `;
    }
  };
})();