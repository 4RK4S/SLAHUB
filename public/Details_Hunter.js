'use strict';

(function () {
  const qs = (sel, root = document) => root.querySelector(sel);
  const SHOW_BOTH_STATS_KEY = 'sla_details_hunter_show_both_stats';

  function basePath() {
    const p = location.pathname || '';
    return (p === '/slahub' || p.startsWith('/slahub/')) ? '/slahub' : '';
  }

  function url(p) {
    const b = basePath();
    const path = String(p || '').startsWith('/') ? p : `/${p}`;
    if (
      path.startsWith('/picture/') ||
      path.startsWith('/api/') ||
      path.startsWith('/data/')
    ) {
      return path;
    }
    return `${b}${path}`;
  }

  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null) continue;
      if (k === 'class') node.className = v;
      else if (k === 'style') node.setAttribute('style', v);
      else if (k === 'html') node.innerHTML = String(v);
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
      else if (typeof v === 'boolean') {
        if (v) node.setAttribute(k, '');
      } else {
        node.setAttribute(k, v);
      }
    }
    for (const ch of children) {
      if (ch == null) continue;
      node.append(ch.nodeType ? ch : document.createTextNode(String(ch)));
    }
    return node;
  }

  function toast(msg) {
    if (typeof window.showToast === 'function') return window.showToast(msg);
    console.log('[toast]', msg);
  }

  function isAdmin() {
    return !!window.STATE?.isAdmin;
  }

  function getHideAdminButtons() {
    try {
      return localStorage.getItem('sla_hide_admin_buttons') === '1';
    } catch (_) {
      return false;
    }
  }

  function loadLocalBool(key, fallback = false) {
    try {
      const value = localStorage.getItem(key);
      if (value === '1') return true;
      if (value === '0') return false;
    } catch (_) {}
    return !!fallback;
  }

  function saveLocalBool(key, value) {
    try {
      localStorage.setItem(key, value ? '1' : '0');
    } catch (_) {}
  }

  function canShowAdminButtons() {
    return isAdmin() && !getHideAdminButtons();
  }

  function applyAdminButtonsVisibility() {
    const hidden = getHideAdminButtons();
    if (hidden) {
      STATE.editMode = false;
      STATE.globalEditMode = false;
    }
    document.documentElement.classList.toggle('sla-hide-admin-buttons', hidden);
  }

  function cdnySafe(src, w = 256) {
    try {
      if (typeof window.cdny === 'function') return window.cdny(src, w);
    } catch (_) {}
    return src || '';
  }

  function fetchJsonTry(paths) {
    let lastErr = null;
    return (async () => {
      for (const p of paths) {
        try {
          const r = await fetch(url(p), { cache: 'no-store', credentials: 'include' });
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return await r.json();
        } catch (e) {
          lastErr = e;
        }
      }
      throw lastErr || new Error('Failed to load JSON');
    })();
  }

  function slugifyHunterName(name) {
    return String(name || '')
      .trim()
      .replace(/'/g, '')
      .replace(/\s+/g, '_')
      .replace(/[^\w-]/g, '_')
      .replace(/_+/g, '_');
  }

  function unslugPathHunter(pathname) {
    const clean = String(pathname || '').split('?')[0].split('#')[0];
    const parts = clean.split('/').filter(Boolean);
    const idx = parts.findIndex(x => x === 'hunters');
    if (idx === -1 || !parts[idx + 1]) return '';
    return decodeURIComponent(parts[idx + 1]);
  }

  function normalizeElement(v) {
    const s = String(v || '').trim().toLowerCase();
    if (s === 'fire') return 'Fire';
    if (s === 'water') return 'Water';
    if (s === 'wind') return 'Wind';
    if (s === 'light') return 'Light';
    if (s === 'dark') return 'Dark';
    return 'None';
  }

  function normalizeRarity(v) {
    const s = String(v || 'SSR').trim().toUpperCase();
    if (['R', 'SR', 'SSR'].includes(s)) return s;
    return 'SSR';
  }

  function rarityImg(rarity) {
    return url(`/picture/Rarity/${normalizeRarity(rarity)}.png`);
  }

  function elementImg(element) {
    const e = normalizeElement(element);
    const map = {
      Fire: 'Fires.png',
      Water: 'Waters.png',
      Wind: 'Winds.png',
      Light: 'Lights.png',
      Dark: 'Darkness.png',
      None: 'NONE.png'
    };
    return url(`/picture/Element/${map[e] || 'NONE.png'}`);
  }

  function normalizeSimplePicRel(folder, v) {
    const s = String(v || '').trim().replace(/^\/+/, '');
    if (!s) return '';
    if (s.startsWith(folder + '/')) return s;
    return `${folder}/${s}`;
  }

  function localPicSrc(folder, rel) {
    const n = normalizeSimplePicRel(folder, rel);
    return n ? url(`/picture/${n}`) : '';
  }

  function hunterMainImgSrc(h, w = 1200) {
    const raw = String(h?.image_build || h?.image || '').trim();
    if (!raw) return '';
    if (/^https?:\/\//i.test(raw)) return cdnySafe(raw, w);
    const rel = raw.includes('/') ? raw.replace(/^\/+/, '') : `Hunter/${raw}`;
    return url(`/picture/${rel}`);
  }

  function skinImgSrc(rel, folderOverride, w = 1200) {
    const raw = String(rel || '').trim();
    if (!raw) return '';
    if (/^https?:\/\//i.test(raw)) return cdnySafe(raw, w);

    const folder = String(folderOverride || inferHunterSkinFolder(STATE.hunter) || '').trim();
    if (!folder) return '';

    return url(`/picture/Hunter_Skin/${folder}/${raw.replace(/^\/+/, '')}`);
  }

  function inferHunterSkinFolder(hunter) {
    return slugifyHunterName(hunter?.name || STATE.hunterName || '');
  }

  function getHunterSkinBaseName(hunter) {
    const raw = String(hunter?.image_build || hunter?.image || '').trim();
    if (!raw) return '';
    const file = raw.split('/').pop() || '';
    return file.replace(/\.[^.]+$/i, '').trim();
  }

  function fileNameOnly(rel) {
    return String(rel || '').split('/').pop() || '';
  }

  async function listHunterSkinImagesInFolder(folder, baseName) {
    if (!folder) return [];

    try {
      const items = await getPicturesByCategory(`Hunter_Skin/${folder}`);
      let rels = (Array.isArray(items) ? items : [])
        .map(it => String(it?.rel || '').trim())
        .filter(Boolean);

      if (baseName) {
        const filtered = rels.filter(rel => {
          const name = fileNameOnly(rel).replace(/\.[^.]+$/i, '').trim().toLowerCase();
          return name !== String(baseName).trim().toLowerCase();
        });

        if (filtered.length) rels = filtered;
      }

      return rels
        .map(rel => skinImgSrc(fileNameOnly(rel), folder, 1200))
        .filter(Boolean);
    } catch (_) {
      return [];
    }
  }

  async function loadSkinsForHunter() {
    const original = hunterMainImgSrc(STATE.hunter, 1200);
    const folder = inferHunterSkinFolder(STATE.hunter);
    const baseName = getHunterSkinBaseName(STATE.hunter);

    let found = await listHunterSkinImagesInFolder(folder, baseName);

    if (!found.length && folder) {
      try {
        const items = await getPicturesByCategory(`Hunter_Skin/${folder}`);
        found = (Array.isArray(items) ? items : [])
          .map(it => String(it?.rel || '').trim())
          .filter(Boolean)
          .map(rel => skinImgSrc(fileNameOnly(rel), folder, 1200))
          .filter(Boolean);
      } catch (_) {
        found = [];
      }
    }

    STATE.skins = [
      ...(original ? [original] : []),
      ...found.filter((src) => src && src !== original)
    ];
    STATE.skinIndex = 0;
  }

  function currentHunterImages() {
    return Array.isArray(STATE.skins) && STATE.skins.length
      ? STATE.skins
      : [hunterMainImgSrc(STATE.hunter, 1200)].filter(Boolean);
  }

  function currentHunterImageSrc() {
    const images = currentHunterImages();
    const index = Math.max(0, Math.min(STATE.skinIndex || 0, Math.max(0, images.length - 1)));
    return images[index] || '';
  }

  function currentSkinLabel(index = STATE.skinIndex || 0) {
    const images = currentHunterImages();
    const safeIndex = Math.max(0, Math.min(Number(index) || 0, Math.max(0, images.length - 1)));

    if (safeIndex === 0) return 'Original';
    return `Skin ${safeIndex}`;
  }

  function prevSkin() {
    const len = STATE.skins?.length || 0;
    if (len <= 1) return;
    STATE.skinIndex = (STATE.skinIndex - 1 + len) % len;
    renderApp();
  }

  function nextSkin() {
    const len = STATE.skins?.length || 0;
    if (len <= 1) return;
    STATE.skinIndex = (STATE.skinIndex + 1) % len;
    renderApp();
  }

  function getHunterClassName(h) {
    return String(h?.role || h?.class || '').trim();
  }

  function classImg(className) {
    if (!className) return '';
    const raw = String(className).trim().replace(/^\/+/, '');
    if (!raw) return '';
    if (raw.startsWith('Class/')) return url(`/picture/${raw.replace(/\.png\.png$/i, '.png')}`);
    const noExt = raw.replace(/\.[^.]+$/i, '');
    return url(`/picture/Type/${noExt.replace(/\s+/g, '_')}.png`);
  }

  function guildImg(guildName) {
    if (!guildName) return '';
    const raw = String(guildName).trim().replace(/^\/+/, '');
    if (!raw) return '';
    if (raw.startsWith('Guild/')) {
      return url(`/picture/${raw.replace(/\.png\.png$/i, '.png')}`);
    }
    const noExt = raw.replace(/\.[^.]+$/i, '');
    return url(`/picture/Guild/${noExt.replace(/\s+/g, '_')}.png`);
  }

  function statImg(rel) {
    if (!rel) return '';
    const clean = String(rel).trim();
    return clean.startsWith('Stats/')
      ? url(`/picture/${clean}`)
      : localPicSrc('Stats', clean);
  }

  function prettyNameFromRel(rel) {
    const s = String(rel || '').trim();
    if (!s) return '';
    const file = s.split('/').pop() || '';
    return file.replace(/\.[^.]+$/i, '').replace(/_/g, ' ');
  }

  function getFileNameFromSrc(src, fallback = 'image.png') {
    const clean = String(src || '').split('?')[0].split('#')[0];
    const rawName = clean.split('/').pop() || fallback;
    const hasExt = /\.[a-z0-9]{2,5}$/i.test(rawName);
    return hasExt ? rawName : `${rawName}.png`;
  }

  const PIC_CACHE = Object.create(null);

  async function getPicturesByCategory(category) {
    const key = String(category || '').trim();
    if (!key) return [];
    if (Array.isArray(PIC_CACHE[key])) return PIC_CACHE[key];
    if (PIC_CACHE[`${key}Promise`]) return PIC_CACHE[`${key}Promise`];

    PIC_CACHE[`${key}Promise`] = (async () => {
      const out = await fetch(url(`/api/admin/pictures/list?category=${encodeURIComponent(key)}`), {
        credentials: 'include',
        cache: 'no-store'
      }).then(async r => ({
        ok: r.ok,
        data: await r.json().catch(() => ({}))
      })).catch(() => ({ ok: false, data: {} }));

      const items = (out.ok && Array.isArray(out.data?.items)) ? out.data.items : [];
      PIC_CACHE[key] = items;
      return items;
    })();

    return PIC_CACHE[`${key}Promise`];
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
      const label = prettyNameFromRel(rel);
      return { label, value: rel, searchText: `${label} ${rel}`.toLowerCase() };
    }).filter(x => x.value);

    box.value = currentRel || '';
    input.value = currentRel ? prettyNameFromRel(currentRel) : '';
    box.rebuildItems(input.value || '');
  }

  function mkPictureSelect(category, currentRel = '', extra = '') {
    const box = el('div', { class: `${extra} relative min-w-[220px] flex-1` });
    const input = el('input', { type: 'text', class: 'dh-admin-in', placeholder: 'Loading images…', value: '' });
    const list = el('div', {
      class: 'rounded-xl border border-slate-700 bg-slate-800 text-slate-100',
      style: 'position:absolute;left:0;right:0;top:100%;z-index:40;margin-top:4px;max-height:280px;overflow:auto;display:none;padding:4px;box-shadow:0 10px 24px rgba(0,0,0,.18)'
    });

    box.append(input, list);
    box.inputEl = input;
    box.listEl = list;
    box._items = [];
    box._visibleItems = [];
    box._open = false;
    box._idx = -1;
    box.value = currentRel || '';

    function paintActive() {
      [...list.children].forEach((child, i) => {
        child.style.outline = (i === box._idx) ? '2px solid #94a3b8' : '';
      });
    }

    function openList() {
      if (box._open) return;
      box._open = true;
      list.style.display = 'block';
      box._idx = -1;
      paintActive();
    }

    function closeList() {
      if (!box._open) return;
      box._open = false;
      list.style.display = 'none';
      box._idx = -1;
    }

    function chooseItem(it) {
      if (!it) return;
      box.value = it.value;
      input.value = it.label;
      closeList();
      try { box.dispatchEvent(new Event('change', { bubbles: true })); } catch (_) {}
    }

    box.rebuildItems = function (q = '') {
      const ql = String(q || '').trim().toLowerCase();
      const src = ql
        ? (box._items || []).filter(it => (it.searchText || '').includes(ql))
        : (box._items || []);
      box._visibleItems = src;
      list.innerHTML = '';

      if (!src.length) {
        list.append(el('div', { class: 'text-xs opacity-70', style: 'padding:6px 8px' }, 'No results'));
        box._idx = -1;
        return;
      }

      src.forEach((it, i) => {
        list.append(el('div', {
          class: 'flex items-center justify-between gap-2',
          style: `padding:6px 8px;border-radius:8px;cursor:pointer;${i === box._idx ? 'outline:2px solid #94a3b8;' : ''}`,
          onClick: () => chooseItem(it),
          onMouseenter: () => { box._idx = i; paintActive(); }
        },
          el('div', { class: 'truncate', title: it.label }, it.label),
          el('div', { class: 'text-[10px] opacity-70 shrink-0', title: it.value }, getFileNameFromSrc(it.value, 'image.png'))
        ));
      });
    };

    input.addEventListener('focus', () => {
      box.rebuildItems(input.value || '');
      openList();
    });
    input.addEventListener('input', () => {
      box.rebuildItems(input.value || '');
      openList();
    });
    input.addEventListener('keydown', (e) => {
      const items = box._visibleItems || [];
      if (!items.length) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        openList();
        box._idx = Math.min(items.length - 1, box._idx + 1);
        paintActive();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        openList();
        box._idx = Math.max(0, box._idx - 1);
        paintActive();
      } else if (e.key === 'Enter') {
        if (box._open && box._idx >= 0) {
          e.preventDefault();
          chooseItem(items[box._idx]);
        }
      } else if (e.key === 'Escape') {
        closeList();
      }
    });

    document.addEventListener('click', (e) => {
      if (!box.contains(e.target)) closeList();
    });

    getPicturesByCategory(category).then(items => {
      input.placeholder = 'Select image…';
      fillPictureSelect(box, items, currentRel);
    }).catch(() => {
      input.placeholder = 'Failed to load images';
      fillPictureSelect(box, [], currentRel);
    });

    return box;
  }

  const ADV_MAX = 11;

  function advancementLabel(adv) {
    const a = clampInt(adv, 0, ADV_MAX, 0);

    if (a === 0) return "Don't own";
    if (a === 1) return '✧✧✧✧✧';

    if (a >= 2 && a <= 5) {
      const filled = '✦'.repeat(a - 1);
      const empty = '✧'.repeat(6 - a);
      return `${filled}${empty}`;
    }

    if (a === 6) return '✦✦✦✦✦';
    return `✦✦✦✦✦${a - 6}`;
  }

  function statNameFromImageRel(rel) {
    const s = String(rel || '').trim();
    if (!s) return '';
    const file = s.split('/').pop() || '';
    return file.replace(/\.[^.]+$/i, '').replace(/_/g, ' ');
  }

  function toTitleCase(v) {
    return String(v || '').replace(/\w\S*/g, t => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase());
  }

  function normalizeRecommendedStat(v) {
    const raw = String(v || '').trim();
    if (!raw) return '';
    const mapped = {
      HP: 'Health Point',
      DEF: 'Defense',
      DEFENSE: 'Defense',
      ATTACK: 'Attack',
      ATK: 'Attack',
      PRECISION: 'Precision',
      'CRIT RATE': 'Critical Hit Rate',
      'CRIT DAMAGE': 'Critical Hit Damage',
      MP: 'MP',
      'MP REDUCTION': 'MP Consumption Reduction',
      HEALING: 'Healing Given Increase',
      'HEALING GIVEN': 'Healing Given Increase',
      'HEALING GIVEN INCREASE': 'Healing Given Increase',
      'DAMAGE INCREASE': 'Damage Increase',
      'DEFENSE PENETRATION': 'Defense Penetration',
      'BREAK EFFECTIVENESS': 'Break Effectiveness'
    };
    const key = raw.replace(/_/g, ' ').trim().toUpperCase();
    return mapped[key] || toTitleCase(raw.replace(/_/g, ' '));
  }

  function recommendedStatImageRelFromName(name) {
    const n = normalizeRecommendedStat(name);
    if (!n) return '';
    return `Recommended_Stats/${n.replace(/\s+/g, '_')}.png`;
  }

  function normalizeDateInput(v) {
    const s = String(v || '').trim();
    if (!s) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const d = new Date(s);
    if (!isNaN(d.getTime())) {
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    }
    return '';
  }

  function formatReleaseDate(v) {
    const s = normalizeDateInput(v);
    if (!s) return '';
    try {
      const [y, m, d] = s.split('-').map(Number);
      const dt = new Date(Date.UTC(y, m - 1, d));
      return dt.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit', timeZone: 'UTC' });
    } catch (_) {
      return s;
    }
  }

  function clampInt(v, min = 0, max = 999, fallback = 0) {
    const n = Math.floor(Number(v));
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, n));
  }

  function statNumber(v, fallback = 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }

  function normalizeText(v) {
    return String(v == null ? '' : v).trim();
  }

  function normalizeStatsBlock(block) {
    const src = block && typeof block === 'object' ? block : {};
    return {
      hp: statNumber(src.hp, 0),
      attack: statNumber(src.attack, 0),
      defense: statNumber(src.defense, 0)
    };
  }

  function normalizeMainStat(v) {
    const s = String(v || '').trim().toLowerCase();
    if (s === 'defense' || s === 'def') return 'defense';
    if (s === 'hp' || s === 'health') return 'hp';
    return 'attack';
  }

  function normalizeHunterStatDefaults(src) {
    const s = src && typeof src === 'object' ? src : {};
    return {
      attackMin: s.attackMin == null ? '' : String(s.attackMin),
      attackMax: s.attackMax == null ? '' : String(s.attackMax),
      defenseMin: s.defenseMin == null ? '' : String(s.defenseMin),
      defenseMax: s.defenseMax == null ? '' : String(s.defenseMax),
      hpMin: s.hpMin == null ? '' : String(s.hpMin),
      hpMax: s.hpMax == null ? '' : String(s.hpMax),
      tpMin: s.tpMin == null ? '' : String(s.tpMin),
      tpMax: s.tpMax == null ? '' : String(s.tpMax)
    };
  }

  function normalizeRecommendedStats(src) {
    const arr = Array.isArray(src) ? src : [];
    return arr
      .map(v => normalizeRecommendedStat(v))
      .filter(Boolean)
      .slice(0, 6);
  }

  function normalizeBaseStats(src) {
    const arr = Array.isArray(src) ? src : [];
    return arr
      .map(it => {
        const image = String(it?.image || '').trim();
        return {
          image,
          value: statNumber(it?.value, 0),
          name: statNameFromImageRel(image)
        };
      })
      .filter(x => x.image)
      .slice(0, 6);
  }

  function normalizeSkin(src) {
    const it = src && typeof src === 'object' ? src : {};
    return {
      image: normalizeText(it.image),
      source: normalizeText(it.source)
    };
  }

  function normalizeGlobalStats(src) {
    const s = src && typeof src === 'object' ? src : {};
    return {
      levelMin: clampInt(s.levelMin ?? s.level_min, 0, 999, 1),
      levelMax: clampInt(s.levelMax ?? s.level_max, 0, 999, 100),
      advancementMin: clampInt(s.advancementMin ?? s.advancement_min, 0, 11, 1),
      advancementMax: clampInt(s.advancementMax ?? s.advancement_max, 0, 11, 11)
    };
  }

  const DEFAULT_GLOBAL_STATS = normalizeGlobalStats({
    levelMin: 1,
    levelMax: 100,
    advancementMin: 1,
    advancementMax: 11
  });

  function normalizeDetails(input) {
    const src = (input && typeof input === 'object') ? input : {};

    return {
      guild: String(src.guild || '').trim(),
      mainStat: normalizeMainStat(src.mainStat),
      recommendedStatsMin: (Array.isArray(src.recommendedStatsMin) ? src.recommendedStatsMin : []).slice(0, 3).map(x => String(x || '').trim()).concat(['', '', '']).slice(0, 3),
      recommendedStatsMax: (Array.isArray(src.recommendedStatsMax) ? src.recommendedStatsMax : []).slice(0, 3).map(x => String(x || '').trim()).concat(['', '', '']).slice(0, 3),
      attackMin: src.attackMin == null ? '' : String(src.attackMin),
      attackMax: src.attackMax == null ? '' : String(src.attackMax),
      defenseMin: src.defenseMin == null ? '' : String(src.defenseMin),
      defenseMax: src.defenseMax == null ? '' : String(src.defenseMax),
      hpMin: src.hpMin == null ? '' : String(src.hpMin),
      hpMax: src.hpMax == null ? '' : String(src.hpMax),
      tpMin: src.tpMin == null ? '' : String(src.tpMin),
      tpMax: src.tpMax == null ? '' : String(src.tpMax),
      global_stats: normalizeGlobalStats(src.global_stats)
    };
  }

  const DEFAULT_DETAILS = {
    guild: '',
    mainStat: 'attack',
    recommendedStatsMin: ['', '', ''],
    recommendedStatsMax: ['', '', ''],
    attackMin: '',
    attackMax: '',
    defenseMin: '',
    defenseMax: '',
    hpMin: '',
    hpMax: '',
    tpMin: '',
    tpMax: '',
    global_stats: normalizeGlobalStats({})
  };

  const STATE = {
    hunter: null,
    hunterName: '',
    skins: [],
    skinIndex: 0,
    statMode: 'min',
    editMode: false,
    globalEditMode: false,
    saving: false,
    globalSaving: false,
    showBothStatValues: loadLocalBool(SHOW_BOTH_STATS_KEY, false),
    levelMax: 100,
    details: JSON.parse(JSON.stringify(DEFAULT_DETAILS)),
    globalStats: normalizeGlobalStats({}),
    lightbox: null,
    lightboxOpen: false,
    lightboxMode: 'single',
    hunters: [],
    hunterIndex: -1
  };

  function getHunterDetailsTarget(hunter) {
    const slug = slugifyHunterName(hunter?.name || '');
    return slug ? url(`/hunters/${encodeURIComponent(slug)}`) : '';
  }

  function navigateToHunter(hunter) {
    const target = getHunterDetailsTarget(hunter);
    if (!target) return;
    if (typeof window.routeTo === 'function') window.routeTo(target);
    else window.location.href = target;
  }

  function getAdjacentHunter(dir) {
    const list = Array.isArray(STATE.hunters) ? STATE.hunters : [];
    if (!list.length || STATE.hunterIndex < 0) return null;
    const nextIndex = STATE.hunterIndex + dir;
    if (nextIndex < 0 || nextIndex >= list.length) return null;
    return list[nextIndex] || null;
  }

  function currentRecommendedStats() {
    return STATE.statMode === 'max'
      ? (STATE.details.recommendedStatsMax || [])
      : (STATE.details.recommendedStatsMin || []);
  }

  function currentLevel() {
    const gs = STATE.globalStats || normalizeGlobalStats({});
    return STATE.statMode === 'max'
      ? String(gs.levelMax || 100)
      : String(gs.levelMin || 1);
  }

  function currentAdvancement() {
    const gs = STATE.globalStats || normalizeGlobalStats({});
    const rawValue = STATE.statMode === 'max'
      ? (gs.advancementMax ?? 11)
      : (gs.advancementMin ?? 1);

    return advancementLabel(rawValue);
  }

  function currentMainStat() {
    return normalizeMainStat(STATE.details?.mainStat || 'attack');
  }

  function shouldShowBothStatValues() {
    return isAdmin() && !!STATE.showBothStatValues;
  }

  function statValueDisplay(minValue, maxValue) {
    if (!shouldShowBothStatValues()) {
      return STATE.statMode === 'max' ? maxValue : minValue;
    }

    return el('div', { class: 'dh-dual-value' },
      el('div', { class: 'dh-dual-line' },
        el('span', { class: 'dh-dual-label' }, 'Min'),
        el('span', { class: 'dh-dual-number' }, String(minValue || '—'))
      ),
      el('div', { class: 'dh-dual-line' },
        el('span', { class: 'dh-dual-label' }, 'Max'),
        el('span', { class: 'dh-dual-number' }, String(maxValue || '—'))
      )
    );
  }

  function currentAtk() {
    return statValueDisplay(STATE.details.attackMin, STATE.details.attackMax);
  }

  function currentDef() {
    return statValueDisplay(STATE.details.defenseMin, STATE.details.defenseMax);
  }

  function currentHp() {
    return statValueDisplay(STATE.details.hpMin, STATE.details.hpMax);
  }

  function currentTp() {
    return statValueDisplay(STATE.details.tpMin, STATE.details.tpMax);
  }

  function closeLightbox() {
    if (!STATE.lightbox) return;
    STATE.lightbox.classList.add('hidden');
    STATE.lightboxOpen = false;
    document.body.classList.remove('dh-no-scroll');
  }

  async function downloadCurrentLightboxImage() {
    if (!STATE.lightbox || !STATE.lightbox._img?.src) {
      toast('Image not found.');
      return;
    }

    const src = STATE.lightbox._img.src;
    const fileName = getFileNameFromSrc(src, `${slugifyHunterName(STATE.hunterName || 'hunter')}.png`);

    try {
      const r = await fetch(src, { credentials: 'include', cache: 'no-store' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const blob = await r.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    } catch (err) {
      console.warn('Download failed, opening image in a new tab.', err);
      window.open(src, '_blank', 'noopener,noreferrer');
      toast('Direct download was blocked, image opened in a new tab.');
    }
  }

  function openLightbox(src, alt = '') {
    if (!src) return;

    let lb = STATE.lightbox;

    if (!lb) {
      const titleNode = el('div', { class: 'dh-lightbox-title' });
      const closeBtn = el('button', {
        class: 'dh-lightbox-close',
        type: 'button',
        'aria-label': 'Close',
        onclick: () => closeLightbox()
      }, el('i', { class: 'fa-solid fa-xmark' }));

      const head = el('div', { class: 'dh-lightbox-head' }, titleNode, closeBtn);
      const img = el('img', { class: 'dh-lightbox-img', alt: '' });
      const body = el('div', { class: 'dh-lightbox-body' }, img);
      const footTitle = el('div', { class: 'dh-lightbox-foot-title' });
      const footActions = el('div', { class: 'dh-lightbox-actions' });
      const foot = el('div', { class: 'dh-lightbox-foot' }, footTitle, footActions);
      const card = el('div', { class: 'dh-lightbox-card' }, head, body, foot);

      lb = el('div', {
        class: 'dh-lightbox hidden',
        onclick: (e) => {
          if (e.target === lb) closeLightbox();
        }
      }, card);

      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeLightbox();
      });

      document.body.append(lb);
      STATE.lightbox = lb;
      lb._title = titleNode;
      lb._img = img;
      lb._footTitle = footTitle;
      lb._footActions = footActions;
    }

    lb._title.textContent = `${STATE.hunterName || 'Hunter'} - Image Preview`;
    lb._img.src = src;
    lb._img.alt = alt || '';
    lb._footTitle.textContent = alt || STATE.hunterName || '';

    lb._footActions.innerHTML = '';
    lb._footActions.append(
      el('button', {
        class: 'dh-btn dh-download',
        type: 'button',
        onclick: () => downloadCurrentLightboxImage()
      },
        el('i', { class: 'fa-solid fa-download' }),
        'Download'
      ),
      el('button', {
        class: 'dh-btn',
        type: 'button',
        onclick: () => closeLightbox()
      }, 'Close')
    );

    lb.classList.remove('hidden');
    STATE.lightboxOpen = true;
    document.body.classList.add('dh-no-scroll');
  }

  function renderMini(label, value) {
    return el('div', { class: 'dh-mini' },
      el('div', { class: 'dh-mini-label' }, label),
      el('div', { class: 'dh-mini-value' }, value || '—')
    );
  }

  function renderStats2Card(iconRel, label, value, isMain = false) {
    const src = statImg(iconRel);
    return el('div', { class: `dh-stat dh-stat-icon-card${isMain ? ' dh-main-stat' : ''}` },
      src
        ? el('img', {
            class: 'dh-stat-icon',
            src,
            alt: label,
            loading: 'lazy',
            decoding: 'async',
            onerror: function () { this.style.display = 'none'; }
          })
        : null,
      el('div', { class: 'dh-stat-label dh-stat-label-below' }, label),
      el('div', { class: 'dh-stat-value' }, value || '—')
    );
  }

  function renderBadgeImage(label, imgSrc, fallbackText = '', onClick = null) {
    const isClickable = typeof onClick === 'function';

    return el(isClickable ? 'button' : 'div', {
      class: `dh-badge${isClickable ? ' clickable' : ''}`,
      type: isClickable ? 'button' : null,
      onclick: isClickable ? onClick : null,
      title: isClickable ? `Open ${label || fallbackText || 'preview'}` : null
    },
      imgSrc
        ? el('img', {
            src: imgSrc,
            alt: label,
            loading: 'lazy',
            decoding: 'async',
            onerror: function () { this.style.display = 'none'; }
          })
        : el('span', { class: 'dh-badge-fallback' }, fallbackText || '—'),
      el('span', {}, label || fallbackText || '—')
    );
  }

  function renderRecommendedStatsRead() {
    const stats = currentRecommendedStats();
    const row = el('div', { class: 'dh-stats-row' });

    for (let i = 0; i < 3; i++) {
      const rel = String(stats[i] || '').trim();
      const src = statImg(rel);
      row.append(
        el('div', { class: 'dh-rec-card' },
          src
            ? el('img', {
                src,
                alt: prettyNameFromRel(rel) || `Stat ${i + 1}`,
                loading: 'lazy',
                decoding: 'async',
                onerror: function () { this.style.display = 'none'; }
              })
            : el('div', { class: 'dh-rec-empty' }, '—'),
          el('div', { class: 'dh-rec-label' }, prettyNameFromRel(rel) || `Empty ${i + 1}`)
        )
      );
    }

    return el('div', { class: 'dh-stats-wrap' },
      el('div', { class: 'dh-section-title' }, 'Recommended Stats'),
      row
    );
  }

  function ensureHunterDetailsModal() {
    if (document.getElementById('dh-modal-css')) return;

    const s = document.createElement('style');
    s.id = 'dh-modal-css';
    s.textContent = `
      .dhm-backdrop{
        position:fixed;inset:0;display:none;align-items:center;justify-content:center;
        z-index:9999;background:rgba(2,6,23,.55);backdrop-filter:blur(2px)
      }
      .dhm-modal{
        width:min(860px,92vw);
        border-radius:1rem;
        border:1px solid rgba(148,163,184,.28);
        background:rgba(2,6,23,.92);
        color:#e2e8f0;
        box-shadow:0 18px 60px rgba(0,0,0,.55);
        overflow:hidden
      }
      .dhm-hd{
        padding:14px 16px;
        border-bottom:1px solid rgba(148,163,184,.20);
        font-weight:900;
        letter-spacing:.2px
      }
      .dhm-bd{
        padding:16px;
        max-height:70vh;
        overflow:auto
      }
      .dhm-ft{
        padding:12px 16px;
        border-top:1px solid rgba(148,163,184,.20);
        display:flex;
        gap:.5rem;
        justify-content:flex-end;
        align-items:center;
      }
      .dhm-btn{
        height:40px;
        padding:0 14px;
        border-radius:12px;
        border:1px solid rgba(148,163,184,.28);
        background:rgba(15,23,42,.55);
        color:#e2e8f0;
        cursor:pointer;
        font-weight:900;
        display:inline-flex;
        align-items:center;
        justify-content:center;
      }
      .dhm-btn.primary{
        background:rgba(255,255,255,.95);
        color:#0f172a;
        border-color:rgba(226,232,240,.85)
      }
      .dhm-btn.ghost{
        background:transparent
      }
    `;
    document.head.appendChild(s);

    const root = document.createElement('div');
    root.id = 'dh-modal-root';
    root.className = 'dhm-backdrop';
    root.innerHTML = `
      <div class="dhm-modal">
        <div class="dhm-hd" id="dhmTitle"></div>
        <div class="dhm-bd" id="dhmBody"></div>
        <div class="dhm-ft">
          <button class="dhm-btn ghost" id="dhmClose" type="button">CLOSE</button>
          <button class="dhm-btn primary" id="dhmPrimary" type="button" style="display:none">SAVE</button>
        </div>
      </div>
    `;
    document.body.appendChild(root);

    function hide() {
      root.style.display = 'none';
      const bd = document.getElementById('dhmBody');
      if (bd) bd.innerHTML = '';
      const prim = document.getElementById('dhmPrimary');
      if (prim) prim.onclick = null;
    }

    function show(title, bodyBuilder, onPrimary = null, primaryText = 'SAVE') {
      const t = document.getElementById('dhmTitle');
      if (t) t.textContent = title || '';

      const bd = document.getElementById('dhmBody');
      if (bd) {
        bd.innerHTML = '';
        const built = (typeof bodyBuilder === 'function') ? bodyBuilder() : null;
        if (built) bd.append(built);
      }

      const prim = document.getElementById('dhmPrimary');
      if (prim) {
        const hasPrimary = typeof onPrimary === 'function';
        prim.style.display = hasPrimary ? 'inline-flex' : 'none';
        prim.textContent = primaryText || 'SAVE';
        prim.onclick = hasPrimary ? onPrimary : null;
      }

      root.style.display = 'flex';
      const close = document.getElementById('dhmClose');
      if (close) close.onclick = hide;
    }

    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hide(); });

    window.__details_hunter_hideModal = hide;
    window.__details_hunter_showModal = show;
  }

  function detailsHunterShowModal(title, bodyBuilder, onPrimary = null, primaryText = 'SAVE') {
    ensureHunterDetailsModal();
    window.__details_hunter_showModal?.(title, bodyBuilder, onPrimary, primaryText);
  }

  function detailsHunterHideModal() {
    try { window.__details_hunter_hideModal?.(); } catch {}
  }

  function adminField(label, control) {
    return el('label', { class: 'dh-admin-field' },
      el('div', { class: 'dh-admin-label' }, label),
      control
    );
  }

  function mainStatSelect(currentValue) {
    const select = el('select', { class: 'dh-admin-in' },
      el('option', { value: 'attack' }, 'Attack'),
      el('option', { value: 'defense' }, 'Defense'),
      el('option', { value: 'hp' }, 'HP')
    );
    select.value = normalizeMainStat(currentValue);
    return select;
  }

  async function saveGlobalStats(nextStats) {
    if (!isAdmin()) {
      toast('Only admin can save.');
      return;
    }
    if (STATE.globalSaving) return;

    STATE.globalSaving = true;
    try {
      const payload = {
        name: STATE.hunterName,
        stats: {
          levelMin: String(nextStats.levelMin ?? '').trim(),
          levelMax: String(nextStats.levelMax ?? '').trim(),
          advancementMin: String(nextStats.advancementMin ?? '').trim(),
          advancementMax: String(nextStats.advancementMax ?? '').trim()
        }
      };

      const r = await fetch(url('/api/admin/hunter-global-stats'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      });

      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        toast(j?.error || 'Save failed');
        return;
      }

      STATE.globalStats = normalizeGlobalStats(j?.stats || j?.item?.stats || payload.stats);
      STATE.details.global_stats = normalizeGlobalStats(STATE.globalStats);

      detailsHunterHideModal();
      toast('Global stats saved ✅');
      rerender();
    } catch (e) {
      console.error('save global stats failed:', e);
      toast('Save failed');
    } finally {
      STATE.globalSaving = false;
    }
  }

  function openGlobalStatsModal() {
    if (!canShowAdminButtons()) return;

    const current = normalizeGlobalStats(STATE.globalStats || STATE.details.global_stats || {});
    const levelMinIn = el('input', { type: 'number', class: 'dh-admin-in', value: String(current.levelMin ?? 1) });
    const levelMaxIn = el('input', { type: 'number', class: 'dh-admin-in', value: String(current.levelMax ?? 100) });
    const advancementMinIn = el('input', { type: 'number', class: 'dh-admin-in', value: String(current.advancementMin ?? 1) });
    const advancementMaxIn = el('input', { type: 'number', class: 'dh-admin-in', value: String(current.advancementMax ?? 11) });
    const showBothIn = el('input', {
      type: 'checkbox',
      class: 'dh-admin-check',
      checked: !!STATE.showBothStatValues,
      onchange: () => {
        STATE.showBothStatValues = !!showBothIn.checked;
        saveLocalBool(SHOW_BOTH_STATS_KEY, STATE.showBothStatValues);
        rerender();
      }
    });

    const body = el('div', { class: 'dh-admin-grid' },
      el('div', { class: 'dh-editor-sub' }, 'Lv. Min, Lv. Max, Advancement Min, Advancement Max'),
      el('label', { class: 'dh-admin-check-row' },
        showBothIn,
        el('span', {}, 'Admin: show TP, Attack, Defense, HP Min and Max together')
      ),
      el('div', { class: 'dh-admin-grid two' },
        adminField('Lv. Min', levelMinIn),
        adminField('Lv. Max', levelMaxIn),
        adminField('Advancement Min', advancementMinIn),
        adminField('Advancement Max', advancementMaxIn)
      )
    );

    const doSave = async () => {
      await saveGlobalStats({
        levelMin: levelMinIn.value,
        levelMax: levelMaxIn.value,
        advancementMin: advancementMinIn.value,
        advancementMax: advancementMaxIn.value
      });
    };

    detailsHunterShowModal('Global Stats', () => body, doSave, 'SAVE');
  }

  function openDetailsEditModal() {
    if (!canShowAdminButtons()) return;

    const guildIn = mkPictureSelect('Guild', STATE.details.guild || '');
    const mainStatIn = mainStatSelect(STATE.details.mainStat || 'attack');

    const statsBase = (
      (Array.isArray(STATE.details.recommendedStatsMin) && STATE.details.recommendedStatsMin.some(Boolean))
        ? STATE.details.recommendedStatsMin
        : STATE.details.recommendedStatsMax
    ) || ['', '', ''];

    const stat1 = mkPictureSelect('Stats', statsBase[0] || '');
    const stat2 = mkPictureSelect('Stats', statsBase[1] || '');
    const stat3 = mkPictureSelect('Stats', statsBase[2] || '');

    const atkMin = el('input', { type: 'number', class: 'dh-admin-in', value: STATE.details.attackMin ?? '', placeholder: 'Attack min' });
    const atkMax = el('input', { type: 'number', class: 'dh-admin-in', value: STATE.details.attackMax ?? '', placeholder: 'Attack max' });
    const defMin = el('input', { type: 'number', class: 'dh-admin-in', value: STATE.details.defenseMin ?? '', placeholder: 'Defense min' });
    const defMax = el('input', { type: 'number', class: 'dh-admin-in', value: STATE.details.defenseMax ?? '', placeholder: 'Defense max' });
    const hpMin = el('input', { type: 'number', class: 'dh-admin-in', value: STATE.details.hpMin ?? '', placeholder: 'HP min' });
    const hpMax = el('input', { type: 'number', class: 'dh-admin-in', value: STATE.details.hpMax ?? '', placeholder: 'HP max' });
    const tpMin = el('input', { type: 'number', class: 'dh-admin-in', value: STATE.details.tpMin ?? '', placeholder: 'TP min' });
    const tpMax = el('input', { type: 'number', class: 'dh-admin-in', value: STATE.details.tpMax ?? '', placeholder: 'TP max' });

    const body = el('div', { class: 'dh-admin-grid' },
      el('div', { class: 'dh-editor-sub' }, 'Main Stat controls the highlighted card. TP, Attack, Defense and HP are saved per hunter.'),
      el('div', { class: 'dh-admin-grid two' },
        adminField('Guild', guildIn),
        adminField('Main Stat', mainStatIn)
      ),
      el('div', { class: 'dh-admin-section-title' }, 'Recommended Stats'),
      el('div', { class: 'dh-admin-grid three' },
        adminField('Stat 1', stat1),
        adminField('Stat 2', stat2),
        adminField('Stat 3', stat3)
      ),
      el('div', { class: 'dh-admin-section-title' }, 'Stats Values'),
      el('div', { class: 'dh-admin-grid two' },
        adminField('Attack Min', atkMin),
        adminField('Attack Max', atkMax),
        adminField('Defense Min', defMin),
        adminField('Defense Max', defMax),
        adminField('HP Min', hpMin),
        adminField('HP Max', hpMax),
        adminField('TP Min', tpMin),
        adminField('TP Max', tpMax)
      )
    );

    const doSave = async () => {
      if (!isAdmin()) {
        toast('Only admin can save.');
        return;
      }
      if (STATE.saving) return;

      STATE.saving = true;

      try {
        const sharedRecommended = [stat1.value || '', stat2.value || '', stat3.value || ''];

        const payload = {
          name: STATE.hunterName,
          details: {
            guild: String(guildIn.value || '').trim().replace(/\.png\.png$/i, '.png'),
            mainStat: normalizeMainStat(mainStatIn.value),
            recommendedStatsMin: [...sharedRecommended],
            recommendedStatsMax: [...sharedRecommended],
            attackMin: String(atkMin.value || '').trim(),
            attackMax: String(atkMax.value || '').trim(),
            defenseMin: String(defMin.value || '').trim(),
            defenseMax: String(defMax.value || '').trim(),
            hpMin: String(hpMin.value || '').trim(),
            hpMax: String(hpMax.value || '').trim(),
            tpMin: String(tpMin.value || '').trim(),
            tpMax: String(tpMax.value || '').trim(),
            global_stats: normalizeGlobalStats(STATE.globalStats)
          }
        };

        const r = await fetch(url('/api/admin/hunter-details'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(payload)
        });

        const j = await r.json().catch(() => ({}));
        if (!r.ok) {
          toast(j?.error || 'Save failed');
          return;
        }

        STATE.details = normalizeDetails(j?.item?.details || payload.details);
        STATE.globalStats = normalizeGlobalStats(STATE.details.global_stats || STATE.globalStats);

        detailsHunterHideModal();
        toast('Hunter details saved ✅');
        rerender();
      } catch (e) {
        console.error('save hunter details failed:', e);
        toast('Save failed');
      } finally {
        STATE.saving = false;
      }
    };

    detailsHunterShowModal('Edit Hunter Details', () => body, doSave, 'SAVE');
  }

  function renderHeadActions() {
    const toggleMode = () => {
      STATE.statMode = STATE.statMode === 'max' ? 'min' : 'max';
      rerender();
    };

    return el('div', { class: 'dh-head-side' },
      el('div', { class: 'dh-toggle' },
        el('button', {
          type: 'button',
          class: STATE.statMode === 'min' ? 'active' : '',
          onclick: toggleMode
        }, 'Min'),
        el('button', {
          type: 'button',
          class: STATE.statMode === 'max' ? 'active' : '',
          onclick: toggleMode
        }, 'Max')
      ),
      ...(canShowAdminButtons() ? [
        el('button', {
          class: 'dh-btn dh-admin-only dh-inline-edit',
          type: 'button',
          onclick: () => openDetailsEditModal()
        }, 'Edit')
      ] : [])
    );
  }

  function renderTopInfo() {
    const hunter = STATE.hunter || {};
    const hunterClass = getHunterClassName(hunter);
    const guildPretty = prettyNameFromRel(STATE.details.guild);
    const roleSrc = classImg(hunterClass);
    const guildSrc = guildImg(STATE.details.guild);

    const head = el('div', { class: 'dh-head' },
      el('div', { class: 'dh-head-main' },
        el('div', { class: 'dh-title-row' },
          el('div', { class: 'dh-title' }, STATE.hunterName || 'Hunter'),
          el('div', { class: 'dh-sub' },
            el('div', { class: 'dh-badge only-img' },
              el('img', { src: rarityImg(hunter.rarity), alt: hunter.rarity || 'SSR' })
            ),
            renderBadgeImage(hunter.element || 'None', elementImg(hunter.element), hunter.element || 'None'),
            renderBadgeImage(
              hunterClass || 'Class',
              roleSrc,
              hunterClass || '—',
              roleSrc ? () => openLightbox(roleSrc, hunterClass || 'Class', `${STATE.hunterName || 'Hunter'} - Role Preview`) : null
            ),
            renderBadgeImage(
              guildPretty || 'Guild',
              guildSrc,
              guildPretty || '—',
              guildSrc ? () => openLightbox(guildSrc, guildPretty || 'Guild', `${STATE.hunterName || 'Hunter'} - Guild Preview`) : null
            )
          )
        )
      ),
      renderHeadActions()
    );

    const meta = el('div', { class: 'dh-inline-meta' },
      renderMini('Lv.', currentLevel()),
      renderMini('TP', currentTp()),
      renderMini('Advancement', currentAdvancement())
    );

    const mainStat = currentMainStat();
    const stats2 = el('div', { class: 'dh-stats2' },
      renderStats2Card('Stats/HP.png', 'HP', currentHp(), mainStat === 'hp'),
      renderStats2Card('Stats/Attack.png', 'Attack', currentAtk(), mainStat === 'attack'),
      renderStats2Card('Stats/Defense.png', 'Defense', currentDef(), mainStat === 'defense')
    );

    const info = el('div', { class: 'dh-right' });
    info.append(head, meta, renderRecommendedStatsRead(), stats2);
    return info;
  }

  function renderHunterImage(rerender = renderApp) {
    const images = currentHunterImages();
    const index = Math.max(0, Math.min(STATE.skinIndex || 0, Math.max(0, images.length - 1)));
    const src = images[index] || '';
    const slider = el('div', { class: 'dh-slider' });

    if (!src) {
      slider.append(el('div', { class: 'dh-img-empty' }, 'No hunter image'));
      return el('div', { class: 'dh-left' }, slider);
    }

    const img = el('img', {
      class: 'dh-main-img',
      src,
      alt: STATE.hunterName || 'Hunter',
      loading: 'eager',
      decoding: 'async',
      onerror: function () { this.style.display = 'none'; }
    });

    img.addEventListener('click', () => openLightbox(src, STATE.hunterName || 'Hunter image'));
    slider.append(img);

    if (images.length > 1) {
      slider.append(
        el('button', {
          class: 'dh-arrow left',
          type: 'button',
          onclick: () => { prevSkin(); },
          'aria-label': 'Previous skin'
        }),
        el('button', {
          class: 'dh-arrow right',
          type: 'button',
          onclick: () => { nextSkin(); },
          'aria-label': 'Next skin'
        })
      );
    }

    return el('div', { class: 'dh-left-wrap' },
      el('div', { class: 'dh-left' }, slider),
      images.length > 1
        ? el('div', { class: 'dh-dots' },
            ...images.map((_, i) => el('button', {
              type: 'button',
              class: `dh-dot${i === index ? ' active' : ''}`,
              onclick: () => {
                STATE.skinIndex = i;
                rerender();
              },
              'aria-label': `Go to skin ${i + 1}`
            }))
          )
        : null
    );
  }

  function ensureStyles() {
    if (document.getElementById('details-hunter-styles')) return;
  
    const style = document.createElement('style');
    style.id = 'details-hunter-styles';
    style.textContent = `
      .dh-wrap{max-width:1280px;margin:0 auto;padding:20px;display:grid;gap:18px;color:#e5eefc}
      .dh-card{border:1px solid rgba(148,163,184,.18);background:linear-gradient(180deg, rgba(15,23,42,.85), rgba(2,6,23,.85));border-radius:24px;box-shadow:0 18px 40px rgba(0,0,0,.25)}
      .dh-top-wrap{overflow:hidden}
      .dh-top{display:grid;grid-template-columns:380px 1fr;gap:20px;padding:20px;align-items:start}
      .dh-left-wrap{min-width:0;display:flex;flex-direction:column}
      .dh-right{min-width:0}
  
      .dh-pagebar{
        display:flex;
        justify-content:space-between;
        align-items:flex-end;
        gap:12px;
        flex-wrap:wrap;
      }
  
      .dh-page-head{
        display:grid;
        gap:4px;
      }
  
      .dh-page-title{
        font-size:24px;
        font-weight:800;
        line-height:1.25;
        color:#facc15;
      }
  
      .dh-page-subtitle{
        font-size:14px;
        color:rgba(203,213,225,.9);
      }
  
      .dh-btns{
        display:flex;
        gap:10px;
        flex-wrap:wrap;
      }
  
      .dh-btn{
        height:42px;
        padding:0 16px;
        border-radius:14px;
        border:1px solid rgba(148,163,184,.18);
        background:rgba(15,23,42,.75);
        color:#fff;
        font-weight:900;
        font-size:14px;
        cursor:pointer;
        display:inline-flex;
        align-items:center;
        justify-content:center;
        gap:8px;
        box-shadow:0 10px 24px rgba(0,0,0,.18);
        transition:transform .15s ease, box-shadow .15s ease, border-color .15s ease, background .15s ease;
      }

      .dh-btn:disabled{opacity:.45;cursor:not-allowed;transform:none}
      .dh-btn.nav{max-width:220px}
      .dh-btn.nav span{max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  
      .dh-btn:hover{
        transform:translateY(-1px);
        border-color:rgba(250,204,21,.35);
        background:rgba(30,41,59,.92);
        box-shadow:0 14px 28px rgba(0,0,0,.24);
      }
  
      .dh-btn.primary{
        background:#facc15;
        color:#111827;
        border-color:rgba(250,204,21,.9);
        box-shadow:0 10px 24px rgba(250,204,21,.18);
      }
  
      .dh-btn.primary:hover{
        background:#fde047;
        border-color:#fde047;
      }
  
      .dh-btn i{
        flex:0 0 auto;
      }
  
      .dh-left{
        position:relative;
        border-radius:24px;
        height:460px;
        min-height:460px;
        max-height:460px;
        overflow:hidden;
        background:linear-gradient(180deg, rgba(15,23,42,.95), rgba(30,41,59,.8));
        border:1px solid rgba(148,163,184,.16);
        display:grid;
        place-items:center;
        
      }
  
      .dh-slider{
        position:relative;
        width:100%;
        height:100%;
        display:flex;
        align-items:center;
        justify-content:center;
        border-radius:18px;
        overflow:hidden;
      }
  
      .dh-main-image-btn{
        position:relative;
        width:100%;
        height:100%;
        display:flex;
        align-items:center;
        justify-content:center;
        border:0;
        background:transparent;
        cursor:pointer;
        padding:0;
        overflow:hidden;
        border-radius:18px;
      }
  
      .dh-main-img{
        max-width:100%;
        max-height:100%;
        width:auto;
        height:auto;
        object-fit:contain;
        border-radius:18px;
        display:block;
        cursor:pointer;
        user-select:none;
      }
        
      @media (min-width: 980px){
        .dh-main-img{
          max-width:120%;
          max-height:120%;
        }
      }
  
      .dh-img-empty{
        color:#9fb0c9;
        font-weight:800;
        font-size:18px;
      }
  
      .dh-arrow{
        position:absolute;
        top:50%;
        transform:translateY(-50%);
        width:44px;
        height:44px;
        border:1px solid rgba(148,163,184,.24);
        border-radius:999px;
        background:rgba(15,23,42,.78);
        color:#fff;
        box-shadow:0 10px 24px rgba(0,0,0,.28);
        cursor:pointer;
        z-index:5;
        display:inline-flex;
        align-items:center;
        justify-content:center;
        transition:background .18s ease, transform .18s ease, opacity .18s ease, border-color .18s ease;
        backdrop-filter:blur(6px);
      }
  
      .dh-arrow::before{
        content:"";
        width:12px;
        height:12px;
        border-top:3px solid #fff;
        border-right:3px solid #fff;
        display:block;
      }
  
      .dh-arrow:hover{
        background:rgba(30,41,59,.96);
        border-color:rgba(250,204,21,.35);
      }
  
      .dh-arrow:active{
        transform:translateY(-50%) scale(.98);
      }
  
      .dh-arrow.left{left:14px}
      .dh-arrow.left::before{transform:rotate(-135deg);margin-left:4px}
      .dh-arrow.right{right:14px}
      .dh-arrow.right::before{transform:rotate(45deg);margin-right:4px}
  
      .dh-dots{
        display:flex;
        justify-content:center;
        align-items:center;
        gap:8px;
        margin-top:12px;
        flex-wrap:wrap;
      }
  
      .dh-dot{
        width:10px;
        height:10px;
        min-width:10px;
        border-radius:999px;
        border:none;
        cursor:pointer;
        background:rgba(255,255,255,.45);
        transition:all .18s ease;
        padding:0;
      }
  
      .dh-dot:hover{
        background:rgba(255,255,255,.75);
      }
  
      .dh-dot.active{
        background:#ffffff;
        width:24px;
        min-width:24px;
      }
  
      .dh-right{
        display:flex;
        flex-direction:column;
        gap:16px;
      }
  
      .dh-head{
        display:flex;
        align-items:flex-start;
        justify-content:space-between;
        gap:16px;
      }
  
      .dh-head-main{
        min-width:0;
        flex:1 1 auto;
      }
  
      .dh-head-side{
        display:flex;
        flex-direction:column;
        align-items:flex-end;
        gap:10px;
        flex:0 0 auto;
      }
  
      .dh-title-row{
        display:flex;
        flex-direction:column;
        gap:12px;
      }
  
      .dh-title{
        font-size:34px;
        line-height:1.05;
        font-weight:1000;
        letter-spacing:.01em;
        word-break:break-word;
      }
  
      .dh-sub{
        display:flex;
        flex-wrap:wrap;
        gap:10px;
      }
  
      .dh-badge{
        display:inline-flex;
        align-items:center;
        gap:8px;
        height:36px;
        padding:0 12px;
        border-radius:999px;
        background:rgba(15,23,42,.58);
        border:1px solid rgba(148,163,184,.16);
        font-weight:900;
        font-size:13px;
        color:#f8fafc;
      }
  
      .dh-badge.clickable{
        cursor:pointer;
        transition:transform .15s ease, border-color .15s ease, background .15s ease;
      }
  
      .dh-badge.clickable:hover{
        transform:translateY(-1px);
        border-color:rgba(250,204,21,.35);
        background:rgba(30,41,59,.92);
      }
  
      .dh-badge.only-img{
        padding:0 10px;
      }
  
      .dh-badge img{
        width:auto;
        height:25px;
        object-fit:contain;
        display:block;
        flex:0 0 auto;
      }
  
      .dh-badge-fallback{
        width:20px;
        height:20px;
        border-radius:999px;
        display:inline-flex;
        align-items:center;
        justify-content:center;
        background:#22314b;
        font-size:11px;
        font-weight:900;
      }
  
      .dh-toggle{
        display:inline-flex;
        align-items:center;
        gap:6px;
        padding:6px;
        border-radius:16px;
        border:1px solid rgba(148,163,184,.22);
        background:rgba(15,23,42,.72);
        box-shadow:inset 0 1px 0 rgba(255,255,255,.04);
      }
  
      .dh-toggle button{
        appearance:none;
        min-width:78px;
        height:42px;
        padding:0 16px;
        border:1px solid transparent;
        border-radius:12px;
        cursor:pointer;
        background:transparent;
        color:#cbd5e1;
        font-size:15px;
        font-weight:1000;
        letter-spacing:.01em;
        transition:background .15s ease,color .15s ease,border-color .15s ease,transform .15s ease;
      }
  
      .dh-toggle button:hover{
        background:rgba(255,255,255,.05);
        color:#f8fafc;
      }
  
      .dh-toggle button.active{
        background:#facc15;
        color:#111827;
        border-color:rgba(250,204,21,.9);
        box-shadow:0 6px 16px rgba(250,204,21,.18);
      }
  
      .dh-inline-edit{
        min-width:120px;
      }
  
      .dh-inline-meta{
        display:grid;
        grid-template-columns:repeat(3,minmax(0,1fr));
        gap:12px;
      }
  
      .dh-stats2{
        display:grid;
        grid-template-columns:repeat(3,minmax(0,1fr));
        gap:12px;
      }
  
      .dh-stats-wrap,
      .dh-mini,
      .dh-stat{
        border:1px solid rgba(148,163,184,.16);
        background:rgba(15,23,42,.5);
        border-radius:18px;
        padding:14px;
        text-align:center;
      }
  
      .dh-stat-icon-card{
        display:flex;
        flex-direction:column;
        align-items:center;
        justify-content:center;
        gap:6px;
      }
  
      .dh-stat-icon{
        width:auto;
        height:25px;
        object-fit:contain;
        display:block;
      }
  
      .dh-mini-label,
      .dh-stat-label,
      .dh-section-title{
        font-size:12px;
        font-weight:900;
        color:#94a3b8;
        text-transform:uppercase;
        letter-spacing:.04em;
      }
  
      .dh-stat-label-below{
        margin-top:2px;
      }
  
      .dh-mini-value{
        font-size:22px;
        font-weight:1000;
        color:#f8fafc;
        margin-top:6px;
      }
  
      .dh-stat-value{
        font-size:24px;
        font-weight:1000;
        color:#f8fafc;
        margin-top:2px;
      }

      .dh-dual-value{
        display:grid;
        gap:4px;
        width:100%;
      }

      .dh-dual-line{
        display:flex;
        align-items:center;
        justify-content:center;
        gap:8px;
        min-width:0;
        line-height:1.1;
      }

      .dh-dual-label{
        flex:0 0 auto;
        color:#94a3b8;
        font-size:11px;
        font-weight:1000;
        text-transform:uppercase;
      }

      .dh-dual-number{
        min-width:0;
        overflow:hidden;
        text-overflow:ellipsis;
        color:inherit;
        font-size:18px;
        font-weight:1000;
      }

      .dh-main-stat{
        border-color:rgba(255,227,148,.58);
        box-shadow:inset 0 0 0 1px rgba(255,227,148,.12), 0 8px 22px rgba(0,0,0,.16);
      }

      .dh-main-stat .dh-stat-label,
      .dh-main-stat .dh-stat-value{
        color:#ffe394;
      }
  
      .dh-section-title{
        margin-bottom:10px;
      }
  
      .dh-stats-row{
        display:grid;
        grid-template-columns:repeat(3,minmax(0,1fr));
        gap:12px;
      }
  
      .dh-rec-card{
        border:1px solid rgba(148,163,184,.16);
        background:rgba(15,23,42,.5);
        border-radius:18px;
        padding:14px;
        display:flex;
        align-items:center;
        justify-content:center;
        flex-direction:column;
        gap:8px;
        min-height:128px;
      }
  
      .dh-rec-card img{
        max-width:72px;
        max-height:72px;
        object-fit:contain;
        display:block;
      }
  
      .dh-rec-empty{
        width:72px;
        height:72px;
        border-radius:14px;
        background:#1d2a40;
        display:flex;
        align-items:center;
        justify-content:center;
        font-weight:1000;
        color:#7d91b4;
      }
  
      .dh-rec-label{
        text-align:center;
        font-size:12px;
        color:#b7c7e0;
        font-weight:800;
        line-height:1.2;
        word-break:break-word;
      }
  
      .dh-editor-sub{
        font-size:13px;
        color:#9fb0c9;
      }
  
      .dh-admin-section-title{
        margin:16px 0 10px;
        font-size:14px;
        font-weight:1000;
        color:#c8d7ef;
      }

      .dh-admin-check-row{
        display:flex;
        align-items:center;
        gap:10px;
        padding:11px 12px;
        border:1px solid rgba(148,163,184,.18);
        border-radius:14px;
        background:rgba(15,23,42,.45);
        color:#dbeafe;
        font-size:13px;
        font-weight:900;
        cursor:pointer;
      }

      .dh-admin-check{
        width:18px;
        height:18px;
        accent-color:#facc15;
        cursor:pointer;
      }
  
      .dh-admin-grid{
        display:grid;
        gap:12px;
      }
  
      .dh-admin-grid.one{grid-template-columns:1fr}
      .dh-admin-grid.two{grid-template-columns:repeat(2,minmax(0,1fr))}
      .dh-admin-grid.three{grid-template-columns:repeat(3,minmax(0,1fr))}
  
      .dh-admin-field{
        display:flex;
        flex-direction:column;
        gap:8px;
      }
  
      .dh-admin-label{
        font-size:12px;
        font-weight:900;
        color:#9fb0c9;
        text-transform:uppercase;
        letter-spacing:.05em;
      }
  
      .dh-admin-in{
        width:100%;
        min-height:44px;
        border-radius:12px;
        border:1px solid rgba(148,163,184,.24);
        background:#0f1725;
        color:#eef4ff;
        padding:10px 12px;
        outline:none;
      }
  
      .dh-admin-in:focus{
        border-color:#5c83ff;
        box-shadow:0 0 0 3px rgba(92,131,255,.18);
      }
  
      .dh-no-scroll{
        overflow:hidden;
      }
  
      .dh-lightbox{
        position:fixed;
        inset:0;
        z-index:9999;
        background:rgba(2,6,23,.86);
        display:flex;
        align-items:center;
        justify-content:center;
        padding:24px;
        backdrop-filter:blur(8px);
      }
  
      .dh-lightbox.hidden{
        display:none;
      }
  
      .dh-lightbox-card{
        width:min(1200px,96vw);
        height:min(90vh,900px);
        border-radius:24px;
        border:1px solid rgba(148,163,184,.18);
        background:linear-gradient(180deg, rgba(30,41,59,.96), rgba(15,23,42,.96));
        box-shadow:0 20px 60px rgba(0,0,0,.45);
        display:grid;
        grid-template-rows:auto 1fr auto;
        overflow:hidden;
      }
  
      .dh-lightbox-head{
        display:flex;
        justify-content:space-between;
        align-items:center;
        gap:12px;
        padding:18px 20px;
        border-bottom:1px solid rgba(148,163,184,.14);
      }
  
      .dh-lightbox-title{
        font-size:18px;
        font-weight:1000;
        color:#facc15;
      }
  
      .dh-lightbox-close{
        width:42px;
        height:42px;
        min-width:42px;
        border-radius:12px;
        border:1px solid rgba(255,255,255,.16);
        background:rgba(15,23,42,.6);
        color:#fff;
        cursor:pointer;
        font-size:20px;
        line-height:1;
        display:inline-flex;
        align-items:center;
        justify-content:center;
      }
  
      .dh-lightbox-body{
        position:relative;
        display:flex;
        align-items:center;
        justify-content:center;
        padding:24px 72px;
        overflow:hidden;
        min-height:0;
      }
  
      .dh-lightbox-img{
        display:block;
        width:auto !important;
        height:auto !important;
        max-width:min(100%, 760px);
        max-height:min(100%, 58vh);
        object-fit:contain;
        object-position:center center;
        user-select:none;
        margin:auto;
        filter:drop-shadow(0 10px 26px rgba(0,0,0,.28));
      }
  
      .dh-lightbox-foot{
        display:flex;
        justify-content:space-between;
        align-items:center;
        gap:12px;
        flex-wrap:wrap;
        padding:18px 20px;
        border-top:1px solid rgba(148,163,184,.14);
      }
  
      .dh-lightbox-foot-title{
        color:#e2e8f0;
        font-weight:800;
      }
  
      .dh-lightbox-actions{
        display:flex;
        gap:10px;
        flex-wrap:wrap;
      }
  
      .dh-download{
        text-decoration:none;
        display:inline-flex;
        align-items:center;
        gap:8px;
      }
  
      .dh-lightbox .dh-btn{
        height:40px;
        padding:0 15px;
        border-radius:12px;
        border:1px solid rgba(148,163,184,.18);
        background:rgba(15,23,42,.82);
        color:#f8fafc;
        font-size:13px;
        font-weight:900;
        box-shadow:0 8px 20px rgba(0,0,0,.18);
      }
  
      .dh-lightbox .dh-btn:hover{
        background:rgba(30,41,59,.96);
        border-color:rgba(250,204,21,.28);
      }
  
      .dh-lightbox .dh-download{
        background:rgba(250,204,21,.94);
        color:#111827;
        border-color:rgba(250,204,21,.92);
        box-shadow:0 10px 22px rgba(250,204,21,.16);
      }
  
      .dh-lightbox .dh-download:hover{
        background:#fde047;
        border-color:#fde047;
      }
  
      @media (max-width: 980px){
        .dh-wrap{padding:14px;gap:14px}
        .dh-top{grid-template-columns:1fr;gap:14px;padding:14px}
        .dh-left{height:420px;min-height:420px;max-height:420px}
        .dh-head{flex-direction:column;align-items:stretch;gap:12px}
        .dh-head-side{align-items:stretch}
        .dh-toggle{width:100%;justify-content:flex-start}
        .dh-inline-meta{grid-template-columns:repeat(2,minmax(0,1fr))}
        .dh-stats2{grid-template-columns:repeat(3,minmax(0,1fr))}
      }
  
      @media (max-width: 640px){
        .dh-wrap{padding:10px;gap:12px}
        .dh-card{border-radius:18px}
        .dh-top{padding:12px;gap:12px}
        .dh-pagebar{gap:10px;align-items:stretch}
        .dh-page-head{gap:2px}
        .dh-page-subtitle{font-size:12px}
        .dh-page-title{font-size:20px;line-height:1.15}
        .dh-btns{width:100%;gap:8px}
        .dh-btn.nav{flex:1;max-width:none}
        .dh-btn.nav span{max-width:120px}
        .dh-btn{height:38px;padding:0 12px;border-radius:12px;font-size:13px}
        .dh-left{height:240px;min-height:240px;max-height:240px;border-radius:18px}
        .dh-title{font-size:18px;line-height:1.15}
        .dh-sub{gap:8px;margin-top:8px}
        .dh-badge{height:30px;padding:0 10px;font-size:13px}
        .dh-badge img{width:auto;height:18px}
        .dh-toggle{width:100%;padding:4px;border-radius:14px}
        .dh-toggle button{flex:1;min-width:0;height:36px;padding:0 10px;font-size:14px;border-radius:10px}
        .dh-inline-meta{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
        .dh-stats2{grid-template-columns:1fr;gap:10px}
        .dh-stat,.dh-mini,.dh-stats-wrap{padding:12px 10px;border-radius:14px}
        .dh-stat-label,.dh-mini-label{font-size:11px}
        .dh-stat-value,.dh-mini-value{font-size:16px;margin-top:4px}
        .dh-stat-icon{height:25px}
        .dh-stats-row{grid-template-columns:1fr}
        .dh-admin-grid.two,
        .dh-admin-grid.three{grid-template-columns:1fr}
        .dh-lightbox{padding:10px}
        .dh-lightbox-card{
          width:min(100%, 96vw);
          max-height:92vh;
          border-radius:22px;
        }
        .dh-lightbox-head,
        .dh-lightbox-body,
        .dh-lightbox-foot{
          padding:12px;
        }
        .dh-lightbox-title{
          font-size:15px;
        }
        .dh-lightbox-close{
          width:38px;
          height:38px;
          min-width:38px;
          border-radius:12px;
        }
        .dh-lightbox-body{
          min-height:180px;
          max-height:calc(92vh - 132px);
        }
        .dh-lightbox-img{
          max-width:min(100%, 100%);
          max-height:52vh;
        }
        .dh-lightbox-foot{
          flex-direction:column;
          align-items:stretch;
        }
        .dh-lightbox-foot-title{
          white-space:normal;
          text-align:center;
        }
        .dh-lightbox-actions{
          width:100%;
        }
        .dh-lightbox .dh-btn{
          flex:1 1 0;
          min-width:0;
        }
        .dh-arrow{width:34px;height:34px}
        .dh-arrow.left{left:8px}
        .dh-arrow.right{right:8px}
        .dh-arrow::before{width:9px;height:9px}
      }
  
      .sla-hide-admin-buttons .dh-admin-only{display:none !important}
    `;
    document.head.appendChild(style);
  }

  async function loadHuntersList() {
    const data = await fetchJsonTry([
      '/api/public/hunters'
    ]);
    return Array.isArray(data) ? data : (Array.isArray(data?.items) ? data.items : []);
  }

  async function loadGlobalHuntersOrder() {
    try {
      const r = await fetch(url('/api/global/order?dataset=hunters'), {
        cache: 'no-store',
        credentials: 'include'
      });
      if (!r.ok) return [];
      const j = await r.json().catch(() => ({}));
      return Array.isArray(j?.order) ? j.order : [];
    } catch (_) {
      return [];
    }
  }

  function applyOrderToHunters(list, order) {
    const ord = Array.isArray(order) ? order : [];
    const map = new Map();
    ord.forEach((name, idx) => map.set(String(name || '').trim(), idx));

    const copy = [...(Array.isArray(list) ? list : [])];
    copy.sort((a, b) => {
      const an = String(a?.name || '').trim();
      const bn = String(b?.name || '').trim();
      const ia = map.has(an) ? map.get(an) : 1e9;
      const ib = map.has(bn) ? map.get(bn) : 1e9;
      if (ia !== ib) return ia - ib;
      return an.localeCompare(bn);
    });
    return copy;
  }

  async function loadHunterDropdowns() {
    try {
      const r = await fetch(url('/api/public/hunters-dropdowns'), {
        credentials: 'include',
        cache: 'no-store'
      });
      const j = await r.json().catch(() => ({}));
      STATE.levelMax = Number.isFinite(+j?.levelMax)
        ? Math.max(1, Math.min(999, Math.floor(+j.levelMax)))
        : 100;
    } catch (_) {
      STATE.levelMax = 100;
    }
  }

  async function loadHunterDetails() {
    try {
      const r = await fetch(url(`/api/public/hunter-details?name=${encodeURIComponent(STATE.hunterName)}`), {
        credentials: 'include',
        cache: 'no-store'
      });
      const j = await r.json().catch(() => ({}));
      STATE.details = normalizeDetails(j?.item?.details || {});
      STATE.globalStats = normalizeGlobalStats(STATE.details?.global_stats || j?.item?.details?.global_stats || STATE.globalStats);
    } catch (e) {
      console.error('loadHunterDetails failed:', e);
      STATE.details = normalizeDetails({});
      STATE.globalStats = normalizeGlobalStats(STATE.details?.global_stats || STATE.globalStats);
    }
  }

  async function loadGlobalStats() {
    try {
      const r = await fetch(url(`/api/public/hunter-global-stats?name=${encodeURIComponent(STATE.hunterName)}`), {
        credentials: 'include',
        cache: 'no-store'
      });
      const j = await r.json().catch(() => ({}));
      STATE.globalStats = normalizeGlobalStats(j?.item?.stats || j?.stats || STATE.details?.global_stats || {});
    } catch (_) {
      STATE.globalStats = normalizeGlobalStats(STATE.details?.global_stats || {});
    }
  }

  function renderApp() {
    const root = qs('#content');
    if (!root) return;
    root.innerHTML = '';

    if (!STATE.hunter) {
      root.append(el('div', { class: 'p-6 text-center text-slate-300' }, 'Hunter not found.'));
      return;
    }

    const wrap = el('div', { class: 'dh-wrap' });
    const prevHunter = getAdjacentHunter(-1);
    const nextHunter = getAdjacentHunter(1);

    const backBtn = el('button', {
      class: 'dh-btn back',
      type: 'button',
      onclick: () => {
        const target = url('/hunters');
        if (typeof window.routeTo === 'function') window.routeTo(target);
        else window.location.href = target;
      }
    });
    backBtn.innerHTML = '<i class="fa-solid fa-arrow-left"></i><span>Back to list</span>';

    const pageHead = el('div', { class: 'dh-pagebar' },
      el('div', { class: 'dh-page-head' },
        el('div', { class: 'dh-page-title' }, 'Hunter Details'),
        el('div', { class: 'dh-page-subtitle' }, 'Builds and your personal list')
      ),
      el('div', { class: 'dh-btns' },
        el('button', {
          class: 'dh-btn nav',
          type: 'button',
          title: prevHunter ? `Previous: ${prevHunter.name}` : 'First hunter',
          disabled: !prevHunter,
          onclick: () => { if (prevHunter) navigateToHunter(prevHunter); }
        },
          el('i', { class: 'fa-solid fa-chevron-left' }),
          el('span', {}, prevHunter ? prevHunter.name : 'Previous')
        ),
        el('button', {
          class: 'dh-btn nav',
          type: 'button',
          title: nextHunter ? `Next: ${nextHunter.name}` : 'Last hunter',
          disabled: !nextHunter,
          onclick: () => { if (nextHunter) navigateToHunter(nextHunter); }
        },
          el('span', {}, nextHunter ? nextHunter.name : 'Next'),
          el('i', { class: 'fa-solid fa-chevron-right' })
        ),
        ...(canShowAdminButtons() ? [
          el('button', {
            class: 'dh-btn dh-admin-only',
            type: 'button',
            onclick: () => openGlobalStatsModal()
          }, 'Global Stats')
        ] : []),
        backBtn
      )
    );

    const topCard = el('div', { class: 'dh-card dh-top-wrap' },
      el('div', { class: 'dh-top' },
        renderHunterImage(),
        renderTopInfo()
      )
    );

    wrap.append(pageHead, topCard);
    root.append(wrap);
  }

  function rerender() {
    applyAdminButtonsVisibility();
    ensureStyles();
    renderApp();
  }

  window.addEventListener('sla:admin-hide-changed', () => {
    applyAdminButtonsVisibility();
    rerender();
  });

  window.__details_hunter_mount = async function __details_hunter_mount(pathArg) {
    ensureStyles();
    applyAdminButtonsVisibility();

    const path = String(pathArg || location.pathname || '');
    const rawSlug = unslugPathHunter(path);

    if (!rawSlug) {
      const root = qs('#content');
      if (root) root.innerHTML = `<div class="p-6 text-center text-slate-300">Hunter not found.</div>`;
      return;
    }

    try {
      const [rawHunters, order] = await Promise.all([
        loadHuntersList(),
        loadGlobalHuntersOrder()
      ]);
      const hunters = applyOrderToHunters(rawHunters, order);
      const wanted = String(rawSlug).trim().toLowerCase();

      const match = hunters.find(h => slugifyHunterName(h?.name || '').toLowerCase() === wanted);
      if (!match) {
        const root = qs('#content');
        if (root) root.innerHTML = `<div class="p-6 text-center text-slate-300">Hunter not found.</div>`;
        return;
      }

      STATE.hunter = match;
      STATE.hunterName = String(match?.name || '').trim();
      STATE.hunters = hunters;
      STATE.hunterIndex = hunters.findIndex(h => String(h?.name || '').trim() === STATE.hunterName);
      STATE.statMode = 'min';
      STATE.editMode = false;
      STATE.globalEditMode = false;

      await Promise.all([
        loadHunterDropdowns(),
        loadHunterDetails(),
        loadSkinsForHunter()
      ]);
      await loadGlobalStats();

      rerender();
    } catch (e) {
      console.error('Details_Hunter mount failed:', e);
      const root = qs('#content');
      if (root) root.innerHTML = `<div class="p-6 text-center text-slate-300">Failed to load Hunter details.</div>`;
    }
  };
})();
