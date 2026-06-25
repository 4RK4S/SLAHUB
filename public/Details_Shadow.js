'use strict';

(function () {
  const qs = (sel, root = document) => root.querySelector(sel);

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

  async function fetchJsonTry(paths) {
    let lastErr = null;
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
  }

  function clampInt(v, min, max, fallback = min) {
    const n = Number(v);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, Math.floor(n)));
  }

  function escHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function slugifyWeaponName(name) {
    return String(name || '')
      .trim()
      .replace(/'/g, '')
      .replace(/\s+/g, '_')
      .replace(/[^\w-]/g, '_')
      .replace(/_+/g, '_');
  }

  function unslugPathWeapon(pathname) {
    const clean = String(pathname || '').split('?')[0].split('#')[0];
    const parts = clean.split('/').filter(Boolean);
    const idx = parts.findIndex(x => x === 'shadows');
    if (idx === -1 || !parts[idx + 1]) return '';
    return decodeURIComponent(parts[idx + 1]);
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

  function canShowAdminButtons() {
    return isAdmin() && !getHideAdminButtons();
  }

  function applyAdminButtonsVisibility() {
    const hidden = getHideAdminButtons();
    if (hidden) {
      STATE.globalEditMode = false;
      STATE.editingSection = null;
      STATE.editingSkillKey = null;
      STATE.editingSkills = false;
      STATE.sectionDrafts = {};
    }
    document.documentElement.classList.toggle('sla-hide-admin-buttons', hidden);
  }

  function cdnySafe(src, w = 256) {
    try {
      if (typeof window.cdny === 'function') return window.cdny(src, w);
    } catch (_) {}
    return src || '';
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

  const SW_LOCAL_WEAPON_CATEGORIES = ['Shadow/Shadows'];
  const PIC_CACHE = Object.create(null);

  function isHttpUrl(s) {
    return /^https?:\/\//i.test(String(s || '').trim());
  }

  function normalizeLocalPicRelAny(v, categories = SW_LOCAL_WEAPON_CATEGORIES) {
    let s = String(v || '').trim().replace(/^\/+/, '');
    if (!s) return '';
    if (isHttpUrl(s)) return '';
    if (s.startsWith('picture/')) s = s.slice('picture/'.length);
    const cats = Array.isArray(categories) ? categories.map(x => String(x || '').trim()).filter(Boolean) : [];
    if (!cats.length) return s;
    for (const c of cats) {
      if (s.startsWith(c + '/')) return s;
    }
    return `${cats[0]}/${s}`;
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

  function resolveDescriptionImageSrc(folder, rel, w = 1400) {
    let s = String(rel || '').trim().replace(/^\/+/, '');
    if (!s) return '';
    if (isHttpUrl(s)) return cdnySafe(s, w);
    if (s.startsWith('picture/')) s = s.slice('picture/'.length);
    if (s.startsWith('Shadow/Shadows_Description_Pictures/')) return url(`/picture/${s}`);
    return url(`/picture/Shadow/Shadows_Description_Pictures/${folder}/${s}`);
  }

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

  function mkPictureSelect(category, currentRel = '', extra = '') {
    const box = el('div', { class: `${extra} relative min-w-[240px] flex-1` });
    const input = el('input', { type: 'text', class: 'dsw-admin-in', placeholder: 'Loading images...', value: '' });
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
      set(v) { box._selectedValue = String(v || '').trim(); }
    });

    box.setOpen = function setOpen(open) {
      box._open = !!open;
      list.style.display = box._open ? 'block' : 'none';
    };

    box.highlight = function highlight() {
      const btns = Array.from(list.querySelectorAll('button[data-idx]'));
      btns.forEach((b, i) => b.classList.toggle('active', i === box._idx));
    };

    box.choose = function choose(item) {
      if (!item) return;
      box.value = item.value;
      input.value = item.label || '';
      box.setOpen(false);
      input.dispatchEvent(new Event('change', { bubbles: true }));
    };

    box.rebuildItems = function rebuildItems(filterText = '') {
      const q = String(filterText || '').trim().toLowerCase();
      const items = !q
        ? box._items.slice(0, 100)
        : box._items.filter(x => x.searchText.includes(q)).slice(0, 100);

      box._visibleItems = items;
      box._idx = items.length ? 0 : -1;
      list.innerHTML = '';

      if (!items.length) {
        list.append(el('div', { class: 'px-3 py-2 text-sm text-slate-400' }, 'No images found'));
        return;
      }

      items.forEach((item, idx) => {
        const btn = el('button', {
          type: 'button',
          'data-idx': idx,
          class: 'w-full text-left rounded-lg px-3 py-2 text-sm hover:bg-slate-700'
        }, item.label);
        btn.addEventListener('click', () => box.choose(item));
        list.append(btn);
      });

      box.highlight();
    };

    input.addEventListener('focus', () => box.setOpen(true));
    input.addEventListener('input', () => {
      box.setOpen(true);
      box.rebuildItems(input.value);
    });

    input.addEventListener('keydown', (e) => {
      if (!box._open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
        box.setOpen(true);
        box.rebuildItems(input.value);
        return;
      }

      if (e.key === 'ArrowDown') {
        if (!box._visibleItems.length) return;
        e.preventDefault();
        box._idx = (box._idx + 1) % box._visibleItems.length;
        box.highlight();
      } else if (e.key === 'ArrowUp') {
        if (!box._visibleItems.length) return;
        e.preventDefault();
        box._idx = (box._idx - 1 + box._visibleItems.length) % box._visibleItems.length;
        box.highlight();
      } else if (e.key === 'Enter') {
        if (box._open && box._idx >= 0 && box._visibleItems[box._idx]) {
          e.preventDefault();
          box.choose(box._visibleItems[box._idx]);
        }
      } else if (e.key === 'Escape') {
        box.setOpen(false);
      }
    });

    document.addEventListener('click', (e) => {
      if (!box.contains(e.target)) box.setOpen(false);
    });

    getPicturesByCategory(category).then(items => {
      fillPictureSelect(box, items, currentRel);
      input.placeholder = 'Search Images';
    }).catch(() => {
      input.placeholder = 'Failed to load images';
    });

    return box;
  }

  const ADV_MAX = 11;

  function defaultAdvBonusTexts() {
    return {
      '1': '',
      '2': '',
      '3': '',
      '4': '',
      '5': ''
    };
  }

  function getGlobalAdvBonusTexts(rarity) {
    const r = normalizeRarity(rarity);
    return STATE.globalStats?.rarities?.[r]?.advBonusTexts || defaultAdvBonusTexts();
  }

  function advancementLabel(adv) {
    const a = clampInt(adv, 0, ADV_MAX);
    if (a === 0) return "Don't own";
    if (a === 1) return '0/5';

    if (a >= 2 && a <= 5) {
      return `${a - 1}/5`;
    }

    if (a === 6) return '5/5';
    return `5/5 +${a - 6}`;
  }

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

  function shadowSkinSuffix(label) {
    const s = String(label || '').trim();
    if (!s || /^original$/i.test(s) || /^base$/i.test(s)) return '';
    return '_' + s.replace(/\s+/g, '_').replace(/[^\w-]/g, '_');
  }

  function stripShadowRankSuffix(fileBase) {
    return String(fileBase || '').replace(/_(Grand_Marshal|General|Elite_Knight|Knight|Elite|Common)$/i, '');
  }

  function shadowSkinSrcFromOrder(orderItem, baseRel) {
    const raw = String(orderItem || '').trim();
    if (!raw || !baseRel) return '';
    if (isHttpUrl(raw)) return cdnySafe(raw, 1024);

    let rel = String(baseRel || '').replace(/^\/+/, '');
    if (rel.startsWith('picture/')) rel = rel.slice('picture/'.length);
    const parts = rel.split('/');
    const file = parts.pop() || '';
    const dir = parts.join('/');
    const extMatch = file.match(/(\.[a-z0-9]+)$/i);
    const ext = extMatch ? extMatch[1] : '.png';
    const baseName = stripShadowRankSuffix(file.replace(/\.[^.]+$/i, ''));

    let nextRel = '';
    const cleaned = raw.replace(/^\/+/, '').replace(/^picture\//, '');

    if (/\.[a-z0-9]+$/i.test(cleaned)) {
      nextRel = cleaned.includes('/')
        ? cleaned
        : `${dir}/${cleaned}`;
    } else {
      nextRel = `${dir}/${baseName}${shadowSkinSuffix(cleaned)}${ext}`;
    }

    return url(`/picture/${nextRel}`);
  }

  function getShadowSkinOrder() {
    const raw = STATE.globalStats?.skinOrder;
    const arr = Array.isArray(raw) ? raw.map(x => String(x || '').trim()).filter(Boolean) : [];
    const filtered = arr.filter(x => {
      const key = x.toLowerCase();
      return key !== 'original' && key !== 'base' && key !== 'grand marshal';
    });
    return filtered.length ? filtered : DEFAULT_GLOBAL_STATS.skinOrder.slice();
  }

  function buildShadowSkinImages() {
    const raw = STATE.weapon?.image_build || STATE.weapon?.image || '';
    const baseRel = normalizeWeaponImageRel(raw);
    const out = [];
    const seen = new Set();

    for (const item of getShadowSkinOrder()) {
      const src = shadowSkinSrcFromOrder(item, baseRel);
      if (src && !seen.has(src)) {
        seen.add(src);
        out.push(src);
      }
    }

    const baseSrc = baseRel ? url(`/picture/${baseRel}`) : '';
    if (baseSrc && !seen.has(baseSrc)) out.push(baseSrc);
    return out;
  }

  function normalizeWeaponImageRel(v) {
    let s = String(v || '').trim().replace(/^\/+/, '');
    if (!s) return '';
    if (/^https?:\/\//i.test(s)) return s;
    if (s.startsWith('picture/')) s = s.slice('picture/'.length);
    if (s.startsWith('Shadow/Shadows/')) return s;
    return `Shadow/Shadows/${s}`;
  }

  function weaponImgSrc(item) {
    const raw = item?.image_build || item?.image || '';
    if (/^https?:\/\//i.test(String(raw || '').trim())) return cdnySafe(raw, 768);
    const rel = normalizeWeaponImageRel(raw);
    return rel ? url(`/picture/${rel}`) : '';
  }

  function descriptionPictureFolder(name) {
    return slugifyWeaponName(name || '');
  }

  function getWeaponSkinBaseName(weapon) {
    const rel = normalizeWeaponImageRel(weapon?.image_build || weapon?.image || '');
    const file = String(rel || '').split('/').pop() || '';
    return file.replace(/\.[^.]+$/i, '').trim();
  }
  
  function inferSkinFolder(weapon) {
    return slugifyWeaponName(weapon?.name || STATE.weaponName || '');
  }

  function skillFolderName(weapon) {
    return slugifyWeaponName(weapon?.name || STATE.weaponName || '');
  }

  function skillCategoryPath(weapon) {
    const folder = skillFolderName(weapon);
    return folder ? `Shadow/Shadows_Skill/${folder}` : '';
  }

  function skillTitleStorageKey(weaponName) {
    return `sla_shadow_skill3_title:${slugifyWeaponName(weaponName || '')}`;
  }

  function readThirdSkillCustomTitle(weaponName, fallback = '') {
    try {
      const v = localStorage.getItem(skillTitleStorageKey(weaponName));
      return String(v || '').trim() || fallback;
    } catch (_) {
      return fallback;
    }
  }

  function saveThirdSkillCustomTitle(weaponName, value) {
    try {
      localStorage.setItem(skillTitleStorageKey(weaponName), String(value || '').trim());
    } catch (_) {}
  }

  function fileNameOnly(rel) {
    return String(rel || '').split('/').pop() || '';
  }

  function stripExt(name) {
    return String(name || '').replace(/\.[^.]+$/i, '');
  }

  function prettifySkillNameFromFile(file) {
    return stripExt(fileNameOnly(file)).replace(/_/g, ' ').trim();
  }

  function resolveSkillImageSrc(rel, folderOverride) {
    const raw = String(rel || '').trim();
    if (!raw) return '';
    if (/^https?:\/\//i.test(raw)) return cdnySafe(raw, 512);

    const folder = String(folderOverride || skillFolderName(STATE.weapon) || '').trim();
    if (!folder) return '';

    const cleaned = raw.replace(/^\/+/, '');

    // If rel already contains the full path, do not append it again.
    if (cleaned.startsWith('Shadow/Shadows_Skill/')) {
      return url(`/picture/${cleaned}`);
    }

    // If this is only a file name, append the shadow folder.
    return url(`/picture/Shadow/Shadows_Skill/${folder}/${cleaned}`);
  }

  async function loadSkillsForWeapon() {
    const category = skillCategoryPath(STATE.weapon);
    if (!category) {
      STATE.skills = [];
      return;
    }

    try {
      const items = await getPicturesByCategory(category);
      const rels = (Array.isArray(items) ? items : [])
        .map(it => String(it?.rel || '').trim())
        .filter(Boolean);

      STATE.skills = rels.map((rel) => ({
        name: prettifySkillNameFromFile(rel),
        image: resolveSkillImageSrc(rel, skillFolderName(STATE.weapon)),
        raw: rel
      }));
    } catch (_) {
      STATE.skills = [];
    }
  }

  function skinImgSrc(rel, folderOverride) {
    const raw = String(rel || '').trim();
    if (!raw) return '';
    if (/^https?:\/\//i.test(raw)) return cdnySafe(raw, 1024);

    const folder = String(folderOverride || inferSkinFolder(STATE.weapon) || '').trim();
    if (!folder) return '';
    return url(`/picture/Shadow/Skin/${folder}/${raw.replace(/^\/+/, '')}`);
  }

  async function listSkinImagesInFolder(folder, baseName) {
    return [];
  }

  async function loadSkinsForWeapon() {
    STATE.skins = buildShadowSkinImages();
    STATE.skinIndex = 0;
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

  const TAG_COLORS = {
    keyword: '#fac700',
    keyword2: '#ffdf7d',
    debuff: '#63fac7',
    break: '#ff8740',
    fire: '#e64b4b',
    water: '#4b96fa',
    wind: '#32c732',
    light: '#fac700',
    dark: '#af63af'
  };

  const COLOR_BTNS = [
    { label: 'Fire', color: '#e64b4b', tag: 'fire' },
    { label: 'Water', color: '#4b96fa', tag: 'water' },
    { label: 'Wind', color: '#32c732', tag: 'wind' },
    { label: 'Light', color: '#fac700', tag: 'light' },
    { label: 'Dark', color: '#af63af', tag: 'dark' },
    { label: 'keyword', color: '#fac700', tag: 'keyword' },
    { label: 'keyword2', color: '#ffdf7d', tag: 'keyword2' },
    { label: 'debuff', color: '#63fac7', tag: 'debuff' },
    { label: 'break', color: '#ff8740', tag: 'break' }
  ];

  const DEFAULT_GLOBAL_STATS = {
    rankMin: 'Common',
    rankMax: 'General',
    growthMin: '0',
    growthMax: '15',
    skinOrder: ['General', 'Elite Knight', 'Knight', 'Elite', 'Common']
  };

  function defaultSkillDetails() {
    const basic = Array.from({ length: 6 }, (_, i) => ({
      name: `Skill ${i + 1}`,
      image: '',
      blocks: []
    }));
    const special = Array.from({ length: 3 }, () => ({
      name: 'Special Skill',
      image: '',
      blocks: []
    }));
    return {
      basic,
      special
    };
  }

  function defaultAdvancementDetails() {
    return {
      lvl: '',
      adv: '',
      totalPower: '',
      statLabel: 'Attack',
      statValue: '',
      precision: '',
      blocks: [],
      skills: defaultSkillDetails()
    };
  }

  function createEmptyDetailsMap() {
    const map = {};
    for (let i = 1; i <= ADV_MAX; i++) {
      map[String(i)] = defaultAdvancementDetails();
    }
    return map;
  }

  const DEFAULT_DETAILS = {
    global_stats: DEFAULT_GLOBAL_STATS,
    details: createEmptyDetailsMap()
  };

  const STATE = {
    weaponName: '',
    weapon: null,
    details: structuredClone(DEFAULT_DETAILS),
    globalStats: structuredClone(DEFAULT_GLOBAL_STATS),
    editingSection: null,
    lightbox: null,
    statMode: 'min',
    sectionDrafts: {},
    openSections: new Set(),
    blockCollapseState: {},
    skins: [],
    skinIndex: 0,

    skills: [],
    editingSkills: false,
    editingSkillKey: null,
    weapons: [],
    weaponIndex: -1,
    weaponCatalogBase: {}
  };

  function getWeaponDetailsTarget(weapon) {
    const slug = slugifyWeaponName(weapon?.name || '');
    return slug ? url(`/shadows/${encodeURIComponent(slug)}`) : '';
  }

  function navigateToWeapon(weapon) {
    const target = getWeaponDetailsTarget(weapon);
    if (!target) return;
    if (typeof window.routeTo === 'function') window.routeTo(target);
    else window.location.href = target;
  }

  function getAdjacentWeapon(dir) {
    const list = Array.isArray(STATE.weapons) ? STATE.weapons : [];
    if (!list.length || STATE.weaponIndex < 0) return null;
    const nextIndex = STATE.weaponIndex + dir;
    if (nextIndex < 0 || nextIndex >= list.length) return null;
    return list[nextIndex] || null;
  }

  function renderMini(label, value) {
    return el('div', { class: 'dsw-mini' },
      el('div', { class: 'dsw-mini-label' }, label),
      el('div', { class: 'dsw-mini-value' }, value)
    );
  }

  function renderStatBlock(label, value) {
    return el('div', { class: 'dsw-stat' },
      el('div', { class: 'dsw-stat-label' }, label),
      el('div', { class: 'dsw-stat-value' }, value || '-')
    );
  }

  function currentSkillsSectionKey() {
    return currentSkillsSectionKeyFor('basic');
  }

  function currentSkillsSectionKeyFor(group) {
    const kind = group === 'special' ? 'special' : 'basic';
    return STATE.statMode === 'max' ? `skills:${kind}:max` : `skills:${kind}:min`;
  }
  
  function setGlobalStatMode(mode) {
    const prevMode = STATE.statMode === 'max' ? 'max' : 'min';
    const nextMode = mode === 'max' ? 'max' : 'min';

    if (prevMode !== nextMode) {
      for (const kind of ['basic', 'special']) {
        const prevSkillsKey = prevMode === 'max' ? `skills:${kind}:max` : `skills:${kind}:min`;
        const nextSkillsKey = nextMode === 'max' ? `skills:${kind}:max` : `skills:${kind}:min`;

        // Move the skills open state only if it was open before.
        if (STATE.openSections.has(prevSkillsKey)) {
          STATE.openSections.delete(prevSkillsKey);
          STATE.openSections.add(nextSkillsKey);
        }
      }
    }

    STATE.statMode = nextMode;
    renderApp();
  }

  function toggleStatMode() {
    setGlobalStatMode(STATE.statMode === 'min' ? 'max' : 'min');
  }

  function stopSummaryToggle(e) {
    if (!e) return;
    e.preventDefault();
    e.stopPropagation();
  }

  function currentRarityStats() {
    const gs = (STATE.globalStats && typeof STATE.globalStats === 'object')
      ? STATE.globalStats
      : DEFAULT_GLOBAL_STATS;

    const mode = STATE.statMode === 'max' ? 'max' : 'min';
    const rank = mode === 'max'
      ? String(gs.rankMax ?? DEFAULT_GLOBAL_STATS.rankMax)
      : String(gs.rankMin ?? DEFAULT_GLOBAL_STATS.rankMin);
    const growth = mode === 'max'
      ? String(gs.growthMax ?? DEFAULT_GLOBAL_STATS.growthMax)
      : String(gs.growthMin ?? DEFAULT_GLOBAL_STATS.growthMin);

    return { rank, growth };
  }

  function normalizeBlock(block) {
    const b = block || {};
    const type = String(b.type || 'text').toLowerCase() === 'image' ? 'image' : 'text';
    return {
      type,
      text: String(b.text || ''),
      image: String(b.image || '').trim()
    };
  }

  function normalizeSkillDetails(input) {
    const src = (input && typeof input === 'object') ? input : {};
    const base = defaultSkillDetails();

    function normalizeEntry(item, fallbackName) {
      const v = (item && typeof item === 'object') ? item : {};
      return {
        name: String(v.name || fallbackName || '').trim(),
        image: String(v.image || '').trim(),
        seededFromMin: v.seededFromMin === true,
        blocks: Array.isArray(v.blocks)
          ? v.blocks.map(normalizeBlock)
          : (String(v.text || '').trim() ? [{ type: 'text', text: String(v.text || '') }] : [])
      };
    }

    const oldBasic = src.basic && !Array.isArray(src.basic) ? src.basic : null;
    const oldCore = src.core && !Array.isArray(src.core) ? src.core : null;
    const oldThird = src.third && !Array.isArray(src.third) ? src.third : null;
    const basicSrc = Array.isArray(src.basic) ? src.basic : [oldBasic, oldCore, oldThird].filter(Boolean);
    const specialSrc = Array.isArray(src.special) ? src.special : [];

    return {
      basic: base.basic.map((entry, idx) => normalizeEntry(basicSrc[idx], entry.name)),
      special: base.special.map((entry, idx) => normalizeEntry(specialSrc[idx], entry.name))
    };
  }

  function normalizeAdvancementDetails(input) {
    const src = (input && typeof input === 'object') ? input : {};
    return {
      lvl: (src.lvl == null) ? '' : String(src.lvl),
      adv: (src.adv == null) ? '' : String(src.adv),
      totalPower: (src.totalPower == null) ? '' : String(src.totalPower),
      statLabel: String(src.statLabel || 'Attack') || 'Attack',
      statValue: (src.statValue == null) ? '' : String(src.statValue),
      precision: (src.precision == null) ? '' : String(src.precision),
      blocks: Array.isArray(src.blocks)
        ? src.blocks.map(normalizeBlock)
        : [],
      skills: normalizeSkillDetails(src.skills)
    };
  }

  function normalizeDetails(details) {
    const src = details || {};
    const gs = src.global_stats || src.globalStats || DEFAULT_GLOBAL_STATS;

    const out = {
      global_stats: {
        rankMin: String(gs.rankMin ?? DEFAULT_GLOBAL_STATS.rankMin),
        rankMax: String(gs.rankMax ?? DEFAULT_GLOBAL_STATS.rankMax),
        growthMin: String(gs.growthMin ?? DEFAULT_GLOBAL_STATS.growthMin),
        growthMax: String(gs.growthMax ?? DEFAULT_GLOBAL_STATS.growthMax),
        skinOrder: Array.isArray(gs.skinOrder)
          ? gs.skinOrder.map(x => String(x || '').trim()).filter(Boolean)
          : DEFAULT_GLOBAL_STATS.skinOrder.slice()
      },
      details: createEmptyDetailsMap()
    };

    const rawDetails = (src.details && typeof src.details === 'object') ? src.details : src;
    for (let i = 1; i <= ADV_MAX; i++) {
      out.details[String(i)] = normalizeAdvancementDetails(rawDetails[String(i)]);
    }

    if (Array.isArray(src.descriptionBlocks) && src.descriptionBlocks.length && !out.details['1'].blocks.length) {
      out.details['1'].blocks = src.descriptionBlocks.map(normalizeBlock);
    }

    return out;
  }

  function initOpenSections() {
    const set = new Set();
    const detailsMap = STATE.details?.details || {};
    // Skills otwarte od startu
    set.add('skills:basic:min');
    set.add('skills:special:min');
    set.add('skills:basic:max');
    set.add('skills:special:max');
  
    for (let i = 1; i <= ADV_MAX; i++) {
      const key = String(i);
      const details = normalizeAdvancementDetails(detailsMap[key]);
      const hasContent = Array.isArray(details.blocks) && details.blocks.length > 0;
    
      if (i === 1 || hasContent) {
        set.add(key);
      }
    }
  
    STATE.openSections = set;
  }

  async function loadWeapon(pathArg) {
    const fromPath = unslugPathWeapon(pathArg || location.pathname);
    const fromState = String(history.state?.weaponName || '').trim();
    const fromSession = String(sessionStorage.getItem('shadow_name') || '').trim();

    const slug = fromPath || slugifyWeaponName(fromState || fromSession || '');
    if (!slug) throw new Error('Missing shadow name');

    const [catalog, order] = await Promise.all([
      fetchJsonTry(['/api/public/shadows']),
      loadGlobalWeaponOrder()
    ]);

    const weapons = Array.isArray(catalog)
      ? catalog
      : (Array.isArray(catalog?.items) ? catalog.items : []);

    if (!Array.isArray(weapons)) {
      throw new Error('Invalid shadow catalog');
    }

    const normalized = applyWeaponOrder(weapons.map((w) => ({
      name: String(w.name || w.weapon_name || w.id || '').trim(),
      rarity: normalizeRarity(w.rarity),
      element: normalizeElement(w.element),
      image: w.image || '',
      image_build: w.image_build || w.imageBuild || w.image || ''
    })).filter(w => w.name), order);

    const weapon =
      normalized.find(w => slugifyWeaponName(w.name) === slug) ||
      normalized.find(w => w.name === fromState) ||
      normalized.find(w => w.name === fromSession) ||
      null;

    if (!weapon) {
      throw new Error(`Shadow not found for slug: ${slug}`);
    }

    STATE.weapon = weapon;
    STATE.weaponName = weapon.name;
    STATE.weapons = normalized;
    STATE.weaponIndex = normalized.findIndex(w => String(w?.name || '').trim() === STATE.weaponName);
  }

  async function loadGlobalWeaponOrder() {
    try {
      const r = await fetch(url('/api/global/order?dataset=shadows'), {
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

  function applyWeaponOrder(list, order) {
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

  async function loadShadowWeaponCatalog() {
    try {
      const r = await fetch(url('/api/public/shadow-weapons'), {
        credentials: 'include',
        cache: 'no-store'
      });
      if (!r.ok) {
        STATE.weaponCatalogBase = {};
        return;
      }
      const j = await r.json().catch(() => ({}));
      STATE.weaponCatalogBase = (j && typeof j === 'object' && !Array.isArray(j)) ? j : {};
    } catch (_) {
      STATE.weaponCatalogBase = {};
    }
  }

  function getWeaponCatalogForShadow(shadowName) {
    const key = String(shadowName || '').trim();
    const item = STATE.weaponCatalogBase?.[key];
    if (!item || typeof item !== 'object') return { name: '', image: '' };
    return {
      name: String(item.name || '').trim(),
      image: String(item.image || '').trim()
    };
  }

  function shadowWeaponImageSrc(value) {
    let s = String(value || '').trim().replace(/^\/+/, '');
    if (!s) return '';
    if (isHttpUrl(s)) return cdnySafe(s, 256);
    if (s.startsWith('picture/')) s = s.slice('picture/'.length);
    if (!s.startsWith('Shadow/Weapon/')) s = `Shadow/Weapon/${s}`;
    return url(`/picture/${s}`);
  }

  async function loadDetails() {
    const fallback = structuredClone(DEFAULT_DETAILS);

    try {
      const [detailsRes, statsRes] = await Promise.all([
        fetch(url(`/api/public/shadow-details?name=${encodeURIComponent(STATE.weaponName)}`), {
          credentials: 'include',
          cache: 'no-store'
        }),
        fetch(url('/api/public/shadow-global-stats'), {
          credentials: 'include',
          cache: 'no-store'
        })
      ]);

      if (detailsRes.ok) {
        const j = await detailsRes.json().catch(() => ({}));
        const detailsMap = j?.item?.details?.detailsMap || j?.details?.detailsMap || null;
        STATE.details = detailsMap
          ? normalizeDetails({ details: detailsMap })
          : normalizeDetails(j?.item || j?.details || j || fallback);
      } else {
        STATE.details = fallback;
      }

      if (statsRes.ok) {
        const statsJson = await statsRes.json().catch(() => ({}));
        STATE.globalStats = normalizeDetails({ global_stats: statsJson?.stats || DEFAULT_GLOBAL_STATS }).global_stats;
      } else {
        STATE.globalStats = structuredClone(DEFAULT_GLOBAL_STATS);
      }

      STATE.sectionDrafts = {};
      initOpenSections();
    } catch (_) {
      STATE.details = fallback;
      STATE.globalStats = structuredClone(DEFAULT_GLOBAL_STATS);
      STATE.sectionDrafts = {};
      initOpenSections();
    }
  }

  async function downloadCurrentLightboxImage() {
    if (!STATE.lightbox || !STATE.lightbox._img?.src) {
      toast('Image not found.');
      return;
    }

    const src = STATE.lightbox._img.src;
    const cleanSrc = String(src).split('?')[0].split('#')[0];
    const fallbackBase = slugifyWeaponName(STATE.weaponName || 'image') || 'image';
    const rawName = cleanSrc.split('/').pop() || `${fallbackBase}.png`;
    const hasExt = /\.[a-z0-9]{2,5}$/i.test(rawName);
    const fileName = hasExt ? rawName : `${rawName}.png`;

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
    let lb = STATE.lightbox;

    if (!lb) {
      const title = el('div', { class: 'dsw-lightbox-title' });
      const closeBtn = el('button', {
        class: 'dsw-lightbox-close',
        type: 'button',
        'aria-label': 'Close',
        onclick: () => closeLightbox()
      }, el('i', { class: 'fa-solid fa-xmark' }));

      const head = el('div', { class: 'dsw-lightbox-head' }, title, closeBtn);
      const img = el('img', { class: 'dsw-lightbox-img', alt: '' });
      const body = el('div', { class: 'dsw-lightbox-body' }, img);
      const footTitle = el('div', { class: 'dsw-lightbox-foot-title' });
      const footActions = el('div', { class: 'dsw-lightbox-actions' });
      const foot = el('div', { class: 'dsw-lightbox-foot' }, footTitle, footActions);
      const card = el('div', { class: 'dsw-lightbox-card' }, head, body, foot);

      lb = el('div', {
        class: 'dsw-lightbox hidden',
        onclick: (e) => {
          if (e.target === lb) closeLightbox();
        }
      }, card);

      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeLightbox();
      });

      document.body.append(lb);
      STATE.lightbox = lb;
      lb._title = title;
      lb._img = img;
      lb._footTitle = footTitle;
      lb._footActions = footActions;
    }

    lb._title.textContent = `${STATE.weaponName || 'Shadow'} - Image Preview`;
    lb._img.src = src;
    lb._img.alt = alt || '';
    lb._footTitle.textContent = alt || STATE.weaponName || '';

    lb._footActions.innerHTML = '';
    lb._footActions.append(
      el('button', {
        class: 'dsw-btn dsw-download',
        type: 'button',
        onclick: () => downloadCurrentLightboxImage()
      },
        el('i', { class: 'fa-solid fa-download' }),
        'Download'
      ),
      el('button', {
        class: 'dsw-btn',
        type: 'button',
        onclick: () => closeLightbox()
      }, 'Close')
    );

    lb.classList.remove('hidden');
    document.body.classList.add('dsw-no-scroll');
  }

  function closeLightbox() {
    if (!STATE.lightbox) return;
    STATE.lightbox.classList.add('hidden');
    document.body.classList.remove('dsw-no-scroll');
  }

  function formatRichText(input) {
    let s = escHtml(input || '');

    s = s.replace(/\[([a-z0-9_]+)\](.*?)\[\/\1\]/gi, (_, tag, content) => {
      const color = TAG_COLORS[String(tag || '').toLowerCase()];
      if (!color) return content;
      return `<span style="color:${color};font-weight:800">${content}</span>`;
    });

    const lines = s.replace(/\r\n/g, '\n').split('\n');
    const out = [];
    let bulletOpen = false;

    function closeBullet() {
      if (bulletOpen) {
        out.push('</ul>');
        bulletOpen = false;
      }
    }

    let prevKind = '';

    for (const rawLine of lines) {
      const line = String(rawLine || '');
      const trimmed = line.trim();

      if (!trimmed) {
        closeBullet();
        out.push(prevKind === 'normal' ? '<br><br>' : '<br>');
        prevKind = 'break';
        continue;
      }

      if (trimmed.startsWith('|')) {
        if (!bulletOpen) {
          out.push('<ul style="margin:4px 0 0 0;padding-left:22px;list-style:disc;display:grid;gap:4px;">');
          bulletOpen = true;
        }
        out.push(`<li>${trimmed.slice(1).trim()}</li>`);
        prevKind = 'bullet';
        continue;
      }

      closeBullet();

      if (trimmed.startsWith('?')) {
        out.push(`<div style="padding-left:22px;margin-top:4px;">${trimmed.slice(1).trim()}</div>`);
        prevKind = 'block';
        continue;
      }

      if (prevKind === 'normal') out.push('<br>');
      out.push(line);
      prevKind = 'normal';
    }

    closeBullet();
    return out.join('');
  }

  function renderSkillRichTextNodes(input) {
    const wrap = el('div', { class: 'dsw-richtext dsw-skill-richtext' });

    const src = String(input || '').replace(/\r\n/g, '\n');
    if (!src.trim()) return wrap;

    const lines = src.split('\n');

    function appendInlineStyled(container, line) {
      const temp = document.createElement('div');
      temp.innerHTML = formatRichText(line || '');

      while (temp.firstChild) {
        container.append(temp.firstChild);
      }
    }

    let bulletList = null;

    function flushBulletList() {
      if (bulletList) {
        wrap.append(bulletList);
        bulletList = null;
      }
    }

    for (const rawLine of lines) {
      const line = String(rawLine || '');
      const trimmed = line.trim();

      if (!trimmed) {
        flushBulletList();
        wrap.append(document.createElement('br'));
        continue;
      }

      if (trimmed.startsWith('|')) {
        if (!bulletList) {
          bulletList = el('ul', {
            style: 'margin:4px 0 0 0;padding-left:22px;list-style:disc;display:grid;gap:4px;'
          });
        }

        const li = el('li');
        appendInlineStyled(li, trimmed.slice(1).trim());
        bulletList.append(li);
        continue;
      }

      flushBulletList();

      if (trimmed.startsWith('>')) {
        const div = el('div', {
          style: 'padding-left:20px;margin-top:4px;'
        });
        appendInlineStyled(div, trimmed.slice(1).trim());
        wrap.append(div);
        continue;
      }

      if (trimmed.startsWith('?')) {
        const div = el('div', {
          style: 'padding-left:22px;margin-top:4px;'
        });
        appendInlineStyled(div, trimmed.slice(1).trim());
        wrap.append(div);
        continue;
      }

      const row = el('div');
      appendInlineStyled(row, line);
      wrap.append(row);
    }

    flushBulletList();
    return wrap;
  }

  function getSavedSection(key) {
    return normalizeAdvancementDetails(STATE.details?.details?.[key]);
  }

  function getDraftSection(key) {
    if (!STATE.sectionDrafts[key]) {
      STATE.sectionDrafts[key] = structuredClone(getSavedSection(key));
    }
    return STATE.sectionDrafts[key];
  }

  function clearDraftSection(key) {
    delete STATE.sectionDrafts[key];
  }

  function setBlockOpen(sectionKey, index, open) {
    STATE.blockCollapseState[`${sectionKey}:${index}`] = !!open;
  }

  function isBlockOpen(sectionKey, index) {
    const key = `${sectionKey}:${index}`;
    return STATE.blockCollapseState[key] !== false;
  }

  function areBlocksExpanded(sectionKey, blocks) {
    const arr = Array.isArray(blocks) ? blocks : [];
    return arr.length > 0 && arr.every((_, idx) => isBlockOpen(sectionKey, idx));
  }

  function setBlocksOpen(sectionKey, blocks, open) {
    const arr = Array.isArray(blocks) ? blocks : [];
    arr.forEach((_, idx) => setBlockOpen(sectionKey, idx, open));
  }

  function insertBlockAfter(blocks, index, type) {
    const newBlock = type === 'image'
      ? { type: 'image', image: '', text: '' }
      : { type: 'text', text: '' };
    blocks.splice(index + 1, 0, newBlock);
  }

  async function saveDetailsPayload(payload) {
    const normalized = normalizeDetails(payload);
    const r = await fetch(url('/api/admin/shadow-details'), {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: STATE.weaponName,
        details: {
          detailsMap: normalized.details
        }
      })
    });

    if (!r.ok) throw new Error(`HTTP ${r.status}`);

    STATE.details = normalizeDetails({ details: normalized.details });
    return STATE.details;
  }

  async function saveGlobalStatsPayload(stats) {
    const r = await fetch(url('/api/admin/shadow-global-stats'), {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stats })
    });

    if (!r.ok) throw new Error(`HTTP ${r.status}`);

    STATE.globalStats = normalizeDetails({ global_stats: stats }).global_stats;
    return STATE.globalStats;
  }

  function ensureShadowModal() {
    if (document.getElementById('dsh-modal-css')) return;

    const s = document.createElement('style');
    s.id = 'dsh-modal-css';
    s.textContent = `
      .dshm-backdrop{
        position:fixed;inset:0;display:none;align-items:center;justify-content:center;
        z-index:9999;background:rgba(2,6,23,.55);backdrop-filter:blur(2px)
      }
      .dshm-modal{
        width:min(1200px,95vw);
        max-height:90vh;
        border-radius:1rem;
        border:1px solid rgba(148,163,184,.28);
        background:rgba(2,6,23,.96);
        color:#e2e8f0;
        box-shadow:0 18px 60px rgba(0,0,0,.55);
        overflow:hidden
      }
      .dshm-hd{
        padding:14px 16px;
        border-bottom:1px solid rgba(148,163,184,.20);
        font-weight:900;
        letter-spacing:.2px
      }
      .dshm-bd{
        padding:16px;
        max-height:72vh;
        overflow:auto
      }
      .dshm-ft{
        padding:12px 16px;
        border-top:1px solid rgba(148,163,184,.20);
        display:flex;
        gap:.5rem;
        justify-content:flex-end;
        align-items:center;
      }
      .dshm-btn{
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
      .dshm-btn.primary{
        background:rgba(255,255,255,.95);
        color:#0f172a;
        border-color:rgba(226,232,240,.85)
      }
      .dshm-btn.ghost{
        background:transparent
      }
    `;
    document.head.appendChild(s);

    const root = document.createElement('div');
    root.id = 'dsh-modal-root';
    root.className = 'dshm-backdrop';
    root.innerHTML = `
      <div class="dshm-modal">
        <div class="dshm-hd" id="dshmTitle"></div>
        <div class="dshm-bd" id="dshmBody"></div>
        <div class="dshm-ft">
          <button class="dshm-btn ghost" id="dshmClose" type="button">CLOSE</button>
          <button class="dshm-btn primary" id="dshmPrimary" type="button" style="display:none">SAVE</button>
        </div>
      </div>
    `;
    document.body.appendChild(root);

    function hide() {
      root.style.display = 'none';
      const bd = document.getElementById('dshmBody');
      if (bd) bd.innerHTML = '';
      const prim = document.getElementById('dshmPrimary');
      if (prim) prim.onclick = null;
    }

    function show(title, bodyBuilder, onPrimary = null, primaryText = 'SAVE') {
      const t = document.getElementById('dshmTitle');
      if (t) t.textContent = title || '';

      const bd = document.getElementById('dshmBody');
      if (bd) {
        bd.innerHTML = '';
        const built = (typeof bodyBuilder === 'function') ? bodyBuilder() : null;
        if (built) bd.append(built);
      }

      const prim = document.getElementById('dshmPrimary');
      if (prim) {
        const hasPrimary = typeof onPrimary === 'function';
        prim.style.display = hasPrimary ? 'inline-flex' : 'none';
        prim.textContent = primaryText || 'SAVE';
        prim.onclick = hasPrimary ? onPrimary : null;
      }

      root.style.display = 'flex';
      const close = document.getElementById('dshmClose');
      if (close) close.onclick = hide;
    }

    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hide(); });

    window.__details_shadow_hideModal = hide;
    window.__details_shadow_showModal = show;
  }

  function detailsShadowShowModal(title, bodyBuilder, onPrimary = null, primaryText = 'SAVE') {
    ensureShadowModal();
    window.__details_shadow_showModal?.(title, bodyBuilder, onPrimary, primaryText);
  }

  function detailsShadowHideModal() {
    try { window.__details_shadow_hideModal?.(); } catch (_) {}
  }

  function openGlobalStatsModal() {
    if (!canShowAdminButtons()) return;

    const stats = structuredClone(STATE.globalStats || DEFAULT_GLOBAL_STATS);

    const panel = el('div', { class: 'dsw-card dsw-editor-card' },
      el('div', { class: 'dsw-subtitle' }, 'Shadow Global Stats')
    );

    const rankMin = el('input', {
      type: 'text',
      class: 'dsw-admin-in',
      value: stats.rankMin ?? DEFAULT_GLOBAL_STATS.rankMin
    });

    const rankMax = el('input', {
      type: 'text',
      class: 'dsw-admin-in',
      value: stats.rankMax ?? DEFAULT_GLOBAL_STATS.rankMax
    });

    const growthMin = el('input', {
      type: 'number',
      class: 'dsw-admin-in',
      value: stats.growthMin ?? DEFAULT_GLOBAL_STATS.growthMin
    });

    const growthMax = el('input', {
      type: 'number',
      class: 'dsw-admin-in',
      value: stats.growthMax ?? DEFAULT_GLOBAL_STATS.growthMax
    });

    const skinOrder = el('textarea', {
      class: 'dsw-admin-ta',
      rows: 8,
      placeholder: 'General\nElite Knight\nKnight\nElite\nCommon'
    }, getShadowSkinOrder().join('\n'));

    rankMin.addEventListener('input', () => { stats.rankMin = rankMin.value.trim() || DEFAULT_GLOBAL_STATS.rankMin; });
    rankMax.addEventListener('input', () => { stats.rankMax = rankMax.value.trim() || DEFAULT_GLOBAL_STATS.rankMax; });
    growthMin.addEventListener('input', () => { stats.growthMin = String(clampInt(growthMin.value, 0, 15, 0)); });
    growthMax.addEventListener('input', () => { stats.growthMax = String(clampInt(growthMax.value, 0, 15, 15)); });
    skinOrder.addEventListener('input', () => {
      stats.skinOrder = skinOrder.value.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
    });

    panel.append(
      el('div', { class: 'dsw-editor-section' },
        el('div', { class: 'dsw-subtitle' }, 'Min / Max'),
        el('div', { class: 'dsw-grid-2' },
          el('label', { class: 'dsw-field' },
            el('span', { class: 'dsw-label' }, 'Rank Min'),
            rankMin
          ),
          el('label', { class: 'dsw-field' },
            el('span', { class: 'dsw-label' }, 'Rank Max'),
            rankMax
          ),
          el('label', { class: 'dsw-field' },
            el('span', { class: 'dsw-label' }, 'Growth Min'),
            growthMin
          ),
          el('label', { class: 'dsw-field' },
            el('span', { class: 'dsw-label' }, 'Growth Max'),
            growthMax
          )
        )
      ),
      el('div', { class: 'dsw-editor-section' },
        el('div', { class: 'dsw-subtitle' }, 'Shadow image order'),
        el('label', { class: 'dsw-field' },
          el('span', { class: 'dsw-label' }, 'One item per line'),
          skinOrder
        ),
        el('div', { class: 'dsw-help' }, 'Use rank names like General, Elite Knight, Knight, Elite, Common, or exact file names like Igris_General.png.')
      )
    );

    const doSave = async () => {
      try {
        await saveGlobalStatsPayload(stats);
        initOpenSections();
        await loadSkinsForWeapon();
        detailsShadowHideModal();
        toast('Saved');
        renderApp();
      } catch (e) {
        console.error(e);
        toast('Save failed');
      }
    };

    detailsShadowShowModal('Global Stats', () => panel, doSave, 'SAVE');
  }

  function renderDescriptionBlockInline(block) {
    const b = normalizeBlock(block);

    if (b.type === 'image') {
      const row = el('div', { class: 'dsw-desc-row with-image' });
      const imageCol = el('div', { class: 'dsw-desc-img-col' });
      const textCol = el('div', { class: 'dsw-desc-text-col' });

      if (b.image) {
        const folder = descriptionPictureFolder(STATE.weapon?.name);
        const imgSrc = resolveDescriptionImageSrc(folder, b.image, 1400);

        const img = el('img', {
          class: 'dsw-inline-desc-image',
          src: imgSrc,
          alt: 'Description image',
          loading: 'lazy'
        });

        img.addEventListener('click', () => openLightbox(imgSrc, 'Description image'));
        imageCol.append(img);
      }

      const textWrap = el('div', { class: 'dsw-richtext dsw-richtext-inline' });
      textWrap.innerHTML = formatRichText(b.text || '');
      textCol.append(textWrap);

      row.append(imageCol, textCol);
      return row;
    }

    const row = el('div', { class: 'dsw-desc-row text-only' });
    const textWrap = el('div', { class: 'dsw-richtext' });
    textWrap.innerHTML = formatRichText(b.text || '');
    row.append(textWrap);
    return row;
  }

  function currentSkillLevelKey() {
    return STATE.statMode === 'max' ? '10' : '1';
  }

  function currentSkillLevelLabel() {
    return STATE.statMode === 'max' ? 'Lv. 10' : 'Lv. 1';
  }

  function currentSkillNameLevelLabel() {
    return STATE.statMode === 'max' ? 'Lv.10' : 'Lv.1';
  }

  function getCurrentSkillData() {
    const key = currentSkillLevelKey();
    const detailsMap = STATE.details?.details || {};
    return normalizeAdvancementDetails(detailsMap[key]).skills;
  }

  function makeSkillColorPalette(textarea, onUpdate) {
    const palette = el('div', { class: 'dsw-color-palette' });

    COLOR_BTNS.forEach(btnCfg => {
      const btn = el('button', {
        type: 'button',
        class: 'dsw-color-btn',
        style: `--swatch:${btnCfg.color}`,
        onclick: () => {
          const start = textarea.selectionStart ?? textarea.value.length;
          const end = textarea.selectionEnd ?? textarea.value.length;
          const tag = btnCfg.tag;
          const before = textarea.value.slice(0, start);
          const selected = textarea.value.slice(start, end);
          const after = textarea.value.slice(end);
          const wrapped = `[${tag}]${selected || 'text'}[/${tag}]`;

          textarea.value = `${before}${wrapped}${after}`;
          onUpdate(textarea.value);
          textarea.focus();
          textarea.selectionStart = before.length + wrapped.length;
          textarea.selectionEnd = textarea.selectionStart;
        }
      }, btnCfg.label);

      palette.append(btn);
    });

    return palette;
  }

  function renderSkillBlocks(blocks, emptyText) {
    const arr = Array.isArray(blocks) ? blocks : [];
    if (!arr.length) return el('div', { class: 'dsw-muted' }, emptyText || 'No description');
    const group = el('div', { class: 'dsw-desc-group' });
    arr.forEach((block) => group.append(renderDescriptionBlockInline(block)));
    return group;
  }

  function fillBlocksLivePreview(node, blocks) {
    if (!node) return;
    node.innerHTML = '';
    node.append(renderSkillBlocks(blocks, 'No preview yet'));
  }

  function renderBlocksLivePreview(blocks) {
    const node = el('div', { class: 'dsw-live-preview' });
    fillBlocksLivePreview(node, blocks);
    return node;
  }

  function skillNameFromImageRel(rel, fallback = '') {
    const file = stripExt(fileNameOnly(rel)).trim();
    if (!file) return fallback || '';
    const withoutOrder = file.replace(/^\s*\d+[\s._-]+/, '').trim();
    return (withoutOrder || file).replace(/_/g, ' ').trim() || fallback || '';
  }

  function skillEditKey(levelKey, group, index) {
    const kind = group === 'special' ? 'special' : 'basic';
    return `${levelKey}:${kind}:${index}`;
  }

  function isEditingAnySkill() {
    return !!STATE.editingSkillKey;
  }

  function isEditingSkillGroup(group) {
    const kind = group === 'special' ? 'special' : 'basic';
    return String(STATE.editingSkillKey || '').includes(`:${kind}:`);
  }

  function clearSkillEdit() {
    STATE.editingSkillKey = null;
    STATE.editingSkills = false;
  }

  function displaySkillName(name, fallback, group, index) {
    const base = String(name || fallback || 'Skill').trim();
    if (group === 'special') {
      return index === 0 ? `${base} (${currentSkillLevelLabel()})` : base;
    }
    return `${base} (${currentSkillNameLevelLabel()})`;
  }

  function renderSpecialSkillAdvancementRow() {
    const src = STATE.statMode === 'max'
      ? url('/picture/Shadow/Additional/Armament_Advancement_Front.png')
      : url('/picture/Shadow/Additional/Armament_Advancement_Back.png');
    return el('div', { class: 'dsw-special-adv-row', title: STATE.statMode === 'max' ? 'Max advancement' : 'Min advancement' },
      ...Array.from({ length: 5 }, () => el('img', {
        src,
        alt: '',
        loading: 'lazy'
      }))
    );
  }

  function isDefaultSkillEntryName(name, group, index) {
    const defaults = defaultSkillDetails();
    const kind = group === 'special' ? 'special' : 'basic';
    const idx = clampInt(index, 0, kind === 'special' ? 2 : 5, 0);
    return String(name || '').trim() === String(defaults[kind][idx]?.name || '').trim();
  }

  function hasSkillEntryContent(entry) {
    if (!entry || typeof entry !== 'object') return false;
    if (String(entry.image || '').trim()) return true;
    if (Array.isArray(entry.blocks) && entry.blocks.length) return true;
    return false;
  }

  function seedMaxSkillEntryFromMin(group, index) {
    const kind = group === 'special' ? 'special' : 'basic';
    const idx = clampInt(index, 0, kind === 'special' ? 2 : 5, 0);
    const minEntry = getEditableSkillEntry('1', kind, idx);
    const maxEntry = getEditableSkillEntry('10', kind, idx);

    if (maxEntry.seededFromMin === true) return maxEntry;
    if (!hasSkillEntryContent(minEntry) || hasSkillEntryContent(maxEntry)) return maxEntry;

    if (!String(maxEntry.name || '').trim() || isDefaultSkillEntryName(maxEntry.name, kind, idx)) {
      maxEntry.name = minEntry.name || maxEntry.name;
    }
    if (!String(maxEntry.image || '').trim()) {
      maxEntry.image = minEntry.image || '';
    }
    maxEntry.blocks = Array.isArray(minEntry.blocks)
      ? minEntry.blocks.map(block => normalizeBlock(structuredClone(block)))
      : [];
    maxEntry.seededFromMin = true;

    return maxEntry;
  }

  function getEditableSkillEntry(levelKey, group, index) {
    const key = String(levelKey || currentSkillLevelKey());
    const kind = group === 'special' ? 'special' : 'basic';
    const maxIdx = kind === 'special' ? 2 : 5;
    const idx = clampInt(index, 0, maxIdx, 0);

    if (!STATE.details || typeof STATE.details !== 'object') {
      STATE.details = structuredClone(DEFAULT_DETAILS);
    }
    if (!STATE.details.details || typeof STATE.details.details !== 'object') {
      STATE.details.details = createEmptyDetailsMap();
    }
    if (!STATE.details.details[key]) {
      STATE.details.details[key] = defaultAdvancementDetails();
    }

    const details = STATE.details.details[key];
    if (
      !details.skills ||
      typeof details.skills !== 'object' ||
      !Array.isArray(details.skills.basic) ||
      !Array.isArray(details.skills.special)
    ) {
      details.skills = normalizeSkillDetails(details.skills);
    }

    const defaults = defaultSkillDetails();
    for (const kindName of ['basic', 'special']) {
      const max = kindName === 'special' ? 3 : 6;
      if (!Array.isArray(details.skills[kindName])) details.skills[kindName] = [];
      for (let i = 0; i < max; i++) {
        if (!details.skills[kindName][i] || typeof details.skills[kindName][i] !== 'object') {
          details.skills[kindName][i] = structuredClone(defaults[kindName][i]);
        }
        const entry = details.skills[kindName][i];
        entry.name = String(entry.name || defaults[kindName][i].name || '').trim();
        entry.image = String(entry.image || '').trim();
        entry.seededFromMin = entry.seededFromMin === true;
        if (!Array.isArray(entry.blocks)) {
          entry.blocks = String(entry.text || '').trim()
            ? [{ type: 'text', text: String(entry.text || '') }]
            : [];
        }
      }
    }

    if (!details.skills[kind][idx]) {
      details.skills[kind][idx] = structuredClone(defaults[kind][idx]);
    }
    if (!Array.isArray(details.skills[kind][idx].blocks)) {
      details.skills[kind][idx].blocks = [];
    }

    return details.skills[kind][idx];
  }

  function renderSingleSkillCard(skill) {
    const card = el('div', { class: 'dsw-skill-row' });

    const left = el('div', { class: 'dsw-skill-side dsw-skill-side-left' });
    const right = el('div', { class: 'dsw-skill-side dsw-skill-side-right' });

    const levelKey = currentSkillLevelKey();
    const group = skill.group === 'special' ? 'special' : 'basic';
    const index = clampInt(skill.index, 0, group === 'special' ? 2 : 5, 0);
    const skillEntry = levelKey === '10'
      ? seedMaxSkillEntryFromMin(group, index)
      : getEditableSkillEntry(levelKey, group, index);
    const editKey = skillEditKey(levelKey, group, index);
    const isEditing = canShowAdminButtons() && STATE.editingSkillKey === editKey;
    const folder = skillFolderName(STATE.weapon);
    const currentImage = skillEntry.image || skill.raw || '';
    const currentImageSrc = currentImage ? resolveSkillImageSrc(currentImage, folder) : '';

    if (currentImageSrc) {
      const img = el('img', {
        class: 'dsw-skill-image',
        src: currentImageSrc,
        alt: skillEntry.name || 'Skill image',
        loading: 'lazy'
      });
      img.addEventListener('click', () => openLightbox(currentImageSrc, skillEntry.name || 'Skill image'));
      left.append(img);
    } else {
      left.append(el('div', { class: 'dsw-skill-image-empty' }, 'No image'));
    }

    if (isEditing) {
      const titleInput = el('input', {
        type: 'text',
        class: 'dsw-admin-in dsw-skill-title-input',
        value: skillEntry.name || skill.defaultName || '',
        placeholder: skill.defaultName || 'Skill name'
      });

      titleInput.addEventListener('input', () => {
        getEditableSkillEntry(levelKey, group, index).name = titleInput.value;
      });

      titleInput.addEventListener('change', () => {
        getEditableSkillEntry(levelKey, group, index).name = titleInput.value;
      });

      const imageSelect = mkPictureSelect(`Shadow/Shadows_Skill/${folder}`, currentImage, 'dsw-skill-image-select');
      imageSelect.addEventListener('change', () => {
        const liveEntry = getEditableSkillEntry(levelKey, group, index);
        liveEntry.image = imageSelect.value;
        const inferredName = skillNameFromImageRel(imageSelect.value, skill.defaultName);
        if (inferredName) liveEntry.name = inferredName;
        renderApp();
      });

      left.append(el('div', { class: 'dsw-skill-name-wrap' }, titleInput));
      if (group === 'basic' || (group === 'special' && index === 0)) {
        left.append(el('div', { class: 'dsw-skill-edit-level' }, group === 'special' ? `(${currentSkillLevelLabel()})` : `(${currentSkillNameLevelLabel()})`));
      }
      if (group === 'special' && index === 1) {
        left.append(renderSpecialSkillAdvancementRow());
      }
      left.append(
        el('label', { class: 'dsw-field dsw-skill-image-field' },
          el('span', { class: 'dsw-label' }, 'Image'),
          imageSelect
        )
      );
    } else {
      left.append(
        el('div', { class: 'dsw-skill-name-wrap' },
          el('div', { class: 'dsw-skill-name' }, displaySkillName(skillEntry.name, skill.defaultName, group, index))
        )
      );
      if (group === 'special' && index === 1) {
        left.append(renderSpecialSkillAdvancementRow());
      }
    }

    if (isEditing) {
      const blocks = Array.isArray(skillEntry.blocks) ? skillEntry.blocks : (skillEntry.blocks = []);
      const blockSectionKey = `${levelKey}:${group}:${index}`;
      const shouldCollapseBlocks = areBlocksExpanded(blockSectionKey, blocks);
      const actions = el('div', { class: 'dsw-row gap wrap dsw-insert-buttons' },
        el('button', {
          type: 'button',
          class: 'dsw-admin-btn',
          onclick: (e) => {
            e.preventDefault();
            e.stopPropagation();
            const liveEntry = getEditableSkillEntry(levelKey, group, index);
            liveEntry.blocks.push({ type: 'text', text: '' });
            renderApp();
          }
        }, '+ Text'),
        el('button', {
          type: 'button',
          class: 'dsw-admin-btn',
          onclick: (e) => {
            e.preventDefault();
            e.stopPropagation();
            const liveEntry = getEditableSkillEntry(levelKey, group, index);
            liveEntry.blocks.push({ type: 'image', image: '', text: '' });
            renderApp();
          }
        }, '+ Image'),
        el('button', {
          type: 'button',
          class: 'dsw-admin-btn ghost',
          disabled: !blocks.length,
          onclick: (e) => {
            e.preventDefault();
            e.stopPropagation();
            const liveEntry = getEditableSkillEntry(levelKey, group, index);
            setBlocksOpen(blockSectionKey, liveEntry.blocks, !shouldCollapseBlocks);
            renderApp();
          }
        }, shouldCollapseBlocks ? 'Collapse' : 'Expand')
      );

      const liveBlocks = getEditableSkillEntry(levelKey, group, index).blocks;
      const livePreview = renderBlocksLivePreview(liveBlocks);

      const saveControls = el('div', { class: 'dsw-row gap wrap dsw-skill-card-actions' },
        el('button', {
          type: 'button',
          class: 'dsw-admin-btn ghost',
          onclick: async (e) => {
            e.preventDefault();
            e.stopPropagation();
            await loadDetails();
            clearSkillEdit();
            renderApp();
          }
        }, 'Cancel'),
        el('button', {
          type: 'button',
          class: 'dsw-admin-btn',
          onclick: async (e) => {
            e.preventDefault();
            e.stopPropagation();
            try {
              await saveDetailsPayload(STATE.details);
              clearSkillEdit();
              toast('Saved');
              renderApp();
            } catch (err) {
              console.error(err);
              toast('Save failed');
            }
          }
        }, 'Save')
      );

      right.append(saveControls, actions, livePreview);
      liveBlocks.forEach((block, blockIndex) => {
        right.append(renderBlockEditor(blockSectionKey, block, blockIndex, liveBlocks, () => {
          fillBlocksLivePreview(livePreview, liveBlocks);
        }));
      });
    } else {
      right.append(renderSkillBlocks(skillEntry.blocks, 'No skill description'));
      if (canShowAdminButtons()) {
        right.append(el('div', { class: 'dsw-row gap wrap dsw-skill-card-actions' },
          el('button', {
            type: 'button',
            class: 'dsw-admin-btn',
            onclick: (e) => {
              e.preventDefault();
              e.stopPropagation();
              STATE.editingSkillKey = editKey;
              STATE.editingSkills = true;
              STATE.openSections.add(currentSkillsSectionKeyFor(group));
              renderApp();
            }
          }, 'Edit')
        ));
      }
    }

    card.append(left, right);
    return card;
  }

  function renderSkillsSection(group = 'basic') {
    const isSpecial = group === 'special';
    const sectionKey = currentSkillsSectionKeyFor(group);
    const isOpen = isEditingSkillGroup(group) || STATE.openSections.has(sectionKey);

    const detailsEl = el('details', { class: 'dsw-adv-section dsw-skills-section' });
    if (isOpen) detailsEl.open = true;

    detailsEl.addEventListener('toggle', () => {
      if (detailsEl.open) STATE.openSections.add(sectionKey);
      else STATE.openSections.delete(sectionKey);
    });

    const titleLeft = el('div', { class: 'dsw-adv-summary-left' },
      el('div', { class: 'dsw-adv-summary-title' }, isSpecial ? 'Special skill' : 'Skills')
    );

    const controls = el('div', {
      class: 'dsw-row gap wrap',
      onclick: stopSummaryToggle,
      onmousedown: stopSummaryToggle,
      ondblclick: stopSummaryToggle
    },
      el('div', { class: 'dsw-toggle dsw-skills-toggle' },
        el('button', {
          type: 'button',
          class: STATE.statMode === 'min' ? 'active' : '',
          onclick: (e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleStatMode();
          }
        }, 'Min'),
        el('button', {
          type: 'button',
          class: STATE.statMode === 'max' ? 'active' : '',
          onclick: (e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleStatMode();
          }
        }, 'Max')
      )
    );

    const summary = el('summary', { class: 'dsw-adv-summary' }, titleLeft, controls);

    const orderedSkills = isSpecial
      ? Array.from({ length: 3 }, (_, index) => ({
        group: 'special',
        index,
        defaultName: 'Special Skill',
        raw: STATE.skills[index + 6]?.raw || ''
      }))
      : Array.from({ length: 6 }, (_, index) => ({
        group: 'basic',
        index,
        defaultName: `Skill ${index + 1}`,
        raw: STATE.skills[index]?.raw || ''
      }));

    const body = el('div', { class: 'dsw-adv-body' },
      el('div', { class: 'dsw-skills-wrap' },
        el('div', { class: `dsw-skills-list ${isSpecial ? 'dsw-skills-list-special' : 'dsw-skills-list-basic'}` },
          ...orderedSkills.map(renderSingleSkillCard)
        )
      )
    );

    detailsEl.append(summary, body);
    return detailsEl;
  }
  
  function renderTopInfo() {
    const details = currentRarityStats();
    const shadowWeapon = getWeaponCatalogForShadow(STATE.weaponName);
    const weaponSrc = shadowWeaponImageSrc(shadowWeapon.image);

    const head = el('div', { class: 'dsw-head' },
      el('div', { class: 'dsw-head-main' },
        el('div', { class: 'dsw-title-row' },
          el('div', { class: 'dsw-title' }, STATE.weaponName || 'Shadow')
        )
      ),
      el('div', { class: 'dsw-toggle' },
        el('button', {
          type: 'button',
          class: STATE.statMode === 'min' ? 'active' : '',
          onclick: toggleStatMode
        }, 'Min'),
        el('button', {
          type: 'button',
          class: STATE.statMode === 'max' ? 'active' : '',
          onclick: toggleStatMode
        }, 'Max')
      )
    );

    const meta = el('div', { class: 'dsw-inline-meta' },
      renderMini('Rank', details.rank || 'Common'),
      renderMini('Growth', el('span', { class: 'dsw-growth-value' },
        el('img', { src: growthToUrl(details.growth), alt: `Growth ${details.growth}`, loading: 'lazy' }),
        el('span', {}, details.growth || '0')
      ))
    );

    const stats = el('div', { class: 'dsw-stats dsw-shadow-weapon-stats' },
      el('div', { class: 'dsw-shadow-weapon-card' },
        weaponSrc
          ? el('img', { class: 'dsw-shadow-weapon-img', src: weaponSrc, alt: shadowWeapon.name || 'Shadow weapon', loading: 'lazy' })
          : el('div', { class: 'dsw-shadow-weapon-empty' }, 'No weapon image'),
        el('div', { class: 'dsw-shadow-weapon-meta' },
          el('div', { class: 'dsw-stat-label' }, 'Weapon'),
          el('div', { class: 'dsw-shadow-weapon-name' }, shadowWeapon.name || 'Unknown weapon')
        )
      )
    );

    const info = el('div', { class: 'dsw-right' });
    info.append(head, meta, stats, renderTopCardActions());
    return info;
  }

  function renderWeaponImage() {
    const images = Array.isArray(STATE.skins) && STATE.skins.length
      ? STATE.skins
      : buildShadowSkinImages();

    const index = Math.max(0, Math.min(STATE.skinIndex || 0, Math.max(0, images.length - 1)));
    const src = images[index] || '';
    const slider = el('div', { class: 'dsw-slider' });

    if (!src) {
      slider.append(el('div', { class: 'dsw-muted' }, 'No shadow image'));
      return el('div', { class: 'dsw-left' }, slider);
    }

    const img = el('img', {
      class: 'dsw-main-skin',
      src,
      alt: STATE.weaponName || 'Shadow image',
      loading: 'lazy'
    });

    img.addEventListener('click', () => openLightbox(src, STATE.weaponName || 'Shadow image'));
    slider.append(img);

    if (images.length > 1) {
      const prevBtn = el('button', {
        type: 'button',
        class: 'dsw-arrow left',
        onclick: prevSkin,
        'aria-label': 'Previous skin'
      });

      const nextBtn = el('button', {
        type: 'button',
        class: 'dsw-arrow right',
        onclick: nextSkin,
        'aria-label': 'Next skin'
      });

      slider.append(prevBtn, nextBtn);
    }

    const wrap = el('div', { class: 'dsw-left' }, slider);

    if (images.length > 1) {
      wrap.append(
        el('div', { class: 'dsw-dots' },
          ...images.map((_, i) => el('button', {
            type: 'button',
            class: `dsw-dot${i === index ? ' active' : ''}`,
            onclick: () => {
              STATE.skinIndex = i;
              renderApp();
            },
            'aria-label': `Go to skin ${i + 1}`
          }))
        )
      );
    }

    return wrap;
  }

  function renderBlockEditor(sectionKey, block, index, blocks, onPreviewChange = null) {
    const b = normalizeBlock(block);
    const card = el('details', { class: 'dsw-block-editor-collapsible' });
    if (isBlockOpen(sectionKey, index)) card.open = true;

    card.addEventListener('toggle', () => {
      setBlockOpen(sectionKey, index, card.open);
    });

    const summary = el('summary', { class: 'dsw-block-summary' },
      el('div', { class: 'dsw-block-summary-title' }, b.type === 'image' ? 'Image' : 'Text'),
      el('div', { class: 'dsw-row gap wrap' },
        el('button', {
          type: 'button',
          class: 'dsw-admin-btn ghost',
          onclick: (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (index <= 0) return;
            [blocks[index - 1], blocks[index]] = [blocks[index], blocks[index - 1]];
            renderApp();
          }
        }, 'Up'),
        el('button', {
          type: 'button',
          class: 'dsw-admin-btn ghost',
          onclick: (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (index >= blocks.length - 1) return;
            [blocks[index + 1], blocks[index]] = [blocks[index], blocks[index + 1]];
            renderApp();
          }
        }, 'Down'),
        el('button', {
          type: 'button',
          class: 'dsw-admin-btn danger',
          onclick: (e) => {
            e.preventDefault();
            e.stopPropagation();
            blocks.splice(index, 1);
            renderApp();
          }
        }, 'Delete')
      )
    );

    const body = el('div', { class: 'dsw-block-editor-body' });

    function makePalette(ta, onUpdate) {
      const palette = el('div', { class: 'dsw-color-palette' });
      COLOR_BTNS.forEach(btnCfg => {
        const btn = el('button', {
          type: 'button',
          class: 'dsw-color-btn',
          style: `--swatch:${btnCfg.color}`,
          onclick: () => {
            const start = ta.selectionStart ?? ta.value.length;
            const end = ta.selectionEnd ?? ta.value.length;
            const tag = btnCfg.tag;
            const before = ta.value.slice(0, start);
            const selected = ta.value.slice(start, end);
            const after = ta.value.slice(end);
            const wrapped = `[${tag}]${selected || 'text'}[/${tag}]`;
            ta.value = `${before}${wrapped}${after}`;
            onUpdate(ta.value);
            ta.focus();
            ta.selectionStart = before.length + wrapped.length;
            ta.selectionEnd = ta.selectionStart;
          }
        }, btnCfg.label);
        palette.append(btn);
      });
      return palette;
    }

    function makeInsertButtons() {
      return el('div', { class: 'dsw-row gap wrap dsw-insert-buttons' },
        el('button', {
          type: 'button',
          class: 'dsw-admin-btn',
          onclick: (e) => {
            e.preventDefault();
            e.stopPropagation();
            insertBlockAfter(blocks, index, 'text');
            renderApp();
          }
        }, '+ Text'),
        el('button', {
          type: 'button',
          class: 'dsw-admin-btn',
          onclick: (e) => {
            e.preventDefault();
            e.stopPropagation();
            insertBlockAfter(blocks, index, 'image');
            renderApp();
          }
        }, '+ Image')
      );
    }

    function refreshLivePreview() {
      if (typeof onPreviewChange === 'function') onPreviewChange();
    }

    if (b.type === 'text') {
      const ta = el('textarea', {
        class: 'dsw-admin-ta',
        rows: 6,
        placeholder: 'Block text'
      }, b.text);

      ta.addEventListener('input', () => {
        block.text = ta.value;
        refreshLivePreview();
      });
      ta.addEventListener('change', () => {
        block.text = ta.value;
        refreshLivePreview();
      });

      body.append(
        makeInsertButtons(),
        el('label', { class: 'dsw-field' },
          el('span', { class: 'dsw-label' }, 'Text'),
          ta
        ),
        el('div', { class: 'dsw-help' },
          'Tags: [keyword]...[/keyword], [keyword2]...[/keyword2], [debuff], [break], [fire], [water], [wind], [light], [dark]'
        ),
        makePalette(ta, (v) => { block.text = v; refreshLivePreview(); })
      );
    } else {
      const folder = descriptionPictureFolder(STATE.weapon?.name);
      const currentRel = String(b.image || '').trim();
      const picSel = mkPictureSelect(`Shadow/Shadows_Description_Pictures/${folder}`, currentRel);

      picSel.addEventListener('change', () => {
        block.image = picSel.value;
        refreshLivePreview();
      });

      const ta = el('textarea', {
        class: 'dsw-admin-ta',
        rows: 6,
        placeholder: 'Block text'
      }, b.text);

      ta.addEventListener('input', () => {
        block.text = ta.value;
        refreshLivePreview();
      });
      ta.addEventListener('change', () => {
        block.text = ta.value;
        refreshLivePreview();
      });

      const preview = el('div', { class: 'dsw-image-preview-wrap' });

      function refreshPreview(rel) {
        preview.innerHTML = '';
        const clean = String(rel || '').trim();
        if (!clean) return;
        const src = resolveDescriptionImageSrc(folder, clean, 1400);
        preview.append(el('img', {
          class: 'dsw-image-preview',
          src,
          alt: 'Selected description image',
          loading: 'lazy'
        }));
      }

      if (currentRel) refreshPreview(currentRel);

      picSel.addEventListener('change', () => {
        block.image = picSel.value;
        refreshPreview(picSel.value);
        refreshLivePreview();
      });

      body.append(
        makeInsertButtons(),
        el('label', { class: 'dsw-field' },
          el('span', { class: 'dsw-label' }, 'Image'),
          picSel
        ),
        el('label', { class: 'dsw-field', style: 'margin-top:12px' },
          el('span', { class: 'dsw-label' }, 'Text'),
          ta
        ),
        el('div', { class: 'dsw-help' },
          'Tags: [keyword]...[/keyword], [keyword2]...[/keyword2], [debuff], [break], [fire], [water], [wind], [light], [dark]'
        ),
        makePalette(ta, (v) => { block.text = v; refreshLivePreview(); }),
        preview
      );
    }

    card.append(summary, body);
    return card;
  }

  function renderEditorPanel() {
    return null;
  }

  function getToggleSectionKeys() {
    return [
      currentSkillsSectionKeyFor('basic'),
      currentSkillsSectionKeyFor('special')
    ];
  }

  function countOpenToggleSections() {
    const keys = getToggleSectionKeys();
    let openCount = 0;

    for (const key of keys) {
      if (STATE.openSections.has(key)) openCount++;
    }

    return { openCount, total: keys.length };
  }

  function shouldShowCollapseAll() {
    const { openCount, total } = countOpenToggleSections();
    return openCount > total / 2;
  }

  function areAllSectionsExpanded() {
    const { openCount, total } = countOpenToggleSections();
    return openCount === total;
  }
  
  function expandAllSections() {
    const set = new Set(STATE.openSections);
    set.add(currentSkillsSectionKeyFor('basic'));
    set.add(currentSkillsSectionKeyFor('special'));

    STATE.openSections = set;
    renderApp();
  }

  function collapseAllSections() {
    const set = new Set();

    if (STATE.editingSection) {
      set.add(String(STATE.editingSection));
    }

    if (isEditingAnySkill()) {
      set.add(currentSkillsSectionKeyFor('basic'));
      set.add(currentSkillsSectionKeyFor('special'));
    }

    STATE.openSections = set;
    renderApp();
  }

  function renderTopCardActions() {
    const allExpanded = areAllSectionsExpanded();
    return el('div', { class: 'dsw-top-actions' },
      el('button', {
        type: 'button',
        class: 'dsw-btn',
        onclick: () => {
          if (shouldShowCollapseAll()) collapseAllSections();
          else expandAllSections();
        }
      }, shouldShowCollapseAll() ? 'Collapse all' : 'Expand all')
    );
  }

  function renderApp() {
    const app = qs('#content') || qs('#app') || document.body;
    app.innerHTML = '';

    applyAdminButtonsVisibility();

    const root = el('div', { class: 'dsw-wrap' });

    const pageBar = el('div', { class: 'dsw-pagebar' },
      el('div', { class: 'dsw-page-head' },
        el('div', { class: 'dsw-editor-title' }, 'Shadows Details'),
        el('div', { class: 'dsw-page-subtitle' }, 'Builds and your personal list')
      ),
      el('div', { class: 'dsw-btns' }, ...(toolbarButtons()))
    );

    const editor = renderEditorPanel();

    const topCard = el('div', { class: 'dsw-card dsw-top-wrap' },
      el('div', { class: 'dsw-top' },
        renderWeaponImage(),
        renderTopInfo()
      )
    );

    root.append(
      pageBar,
      ...(editor ? [editor] : []),
      topCard,
      renderSkillsSection('basic'),
      renderSkillsSection('special')
    );
    app.append(root);
  }

  function toolbarButtons() {
    const out = [];
    const prevWeapon = getAdjacentWeapon(-1);
    const nextWeapon = getAdjacentWeapon(1);

    out.push(el('button', {
      class: 'dsw-btn back nav',
      type: 'button',
      title: prevWeapon ? `Previous: ${prevWeapon.name}` : 'First shadow',
      disabled: !prevWeapon,
      onclick: () => { if (prevWeapon) navigateToWeapon(prevWeapon); }
    },
      el('i', { class: 'fa-solid fa-chevron-left' }),
      el('span', {}, prevWeapon ? prevWeapon.name : 'Previous')
    ));

    out.push(el('button', {
      class: 'dsw-btn back nav',
      type: 'button',
      title: nextWeapon ? `Next: ${nextWeapon.name}` : 'Last shadow',
      disabled: !nextWeapon,
      onclick: () => { if (nextWeapon) navigateToWeapon(nextWeapon); }
    },
      el('span', {}, nextWeapon ? nextWeapon.name : 'Next'),
      el('i', { class: 'fa-solid fa-chevron-right' })
    ));

    if (canShowAdminButtons()) {
      out.push(el('button', {
        class: 'dsw-btn',
        type: 'button',
        onclick: () => openGlobalStatsModal()
      }, 'Global Stats'));
    }

    out.push(el('button', {
      class: 'dsw-btn back',
      type: 'button',
      onclick: () => {
        const target = url('/shadows');
        if (typeof window.routeTo === 'function') window.routeTo(target);
        else window.location.href = target;
      }
    },
      el('i', { class: 'fa-solid fa-arrow-left' }),
      'Back to list'
    ));

    return out;
  }

  function injectStyles() {
    if (document.getElementById('details-shadows-style')) return;

    const css = `
      .dsw-wrap{max-width:1280px;margin:0 auto;padding:20px;display:grid;gap:18px;color:#e5eefc}
      .dsw-card{border:1px solid rgba(148,163,184,.18);background:linear-gradient(180deg, rgba(15,23,42,.85), rgba(2,6,23,.85));border-radius:24px;box-shadow:0 18px 40px rgba(0,0,0,.25)}
      .dsw-top-wrap{overflow:hidden}
      .dsw-top{display:grid;grid-template-columns:380px 1fr;gap:20px;padding:20px}
      .dsw-top-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}
      .dsw-left,.dsw-right{min-width:0}
      .dsw-slider{position:relative;border-radius:24px;min-height:400px;overflow:hidden;background:linear-gradient(180deg, rgba(15,23,42,.95), rgba(30,41,59,.8));border:1px solid rgba(148,163,184,.16);display:grid;place-items:center;padding:0}
      .dsw-main-skin{max-width:100%;max-height:400px;object-fit:contain;border-radius:18px;cursor:zoom-in}

      .dsw-arrow{
        position:absolute;
        top:50%;
        transform:translateY(-50%);
        width:50px;
        height:50px;
        border-radius:999px;
        border:1px solid rgba(255,255,255,.16);
        background:linear-gradient(180deg, rgba(30,41,59,.96), rgba(15,23,42,.96));
        color:#fff;
        cursor:pointer;
        font-size:0;
        display:grid;
        place-items:center;
        backdrop-filter:blur(10px);
        box-shadow:0 10px 26px rgba(0,0,0,.28);
        transition:transform .16s ease, background .16s ease, border-color .16s ease, box-shadow .16s ease;
        z-index:3;
      }
      .dsw-arrow::before{
        content:'';
        width:12px;
        height:12px;
        border-top:3px solid #fff;
        border-right:3px solid #fff;
        display:block;
      }
      .dsw-arrow:hover{
        background:linear-gradient(180deg, rgba(51,65,85,.98), rgba(30,41,59,.98));
        border-color:rgba(250,199,0,.45);
        box-shadow:0 14px 34px rgba(0,0,0,.35);
        transform:translateY(-50%) scale(1.05);
      }
      .dsw-arrow:active{transform:translateY(-50%) scale(.98)}
      .dsw-arrow.left{left:14px}
      .dsw-arrow.left::before{transform:rotate(-135deg);margin-left:4px}
      .dsw-arrow.right{right:14px}
      .dsw-arrow.right::before{transform:rotate(45deg);margin-right:4px}

      .dsw-dots{display:flex;justify-content:center;gap:8px;margin-top:12px;flex-wrap:wrap}
      .dsw-dot{width:10px;height:10px;border-radius:999px;border:none;cursor:pointer;background:rgba(255,255,255,.25)}
      .dsw-dot.active{background:#fff;width:24px}

      .dsw-head{display:flex;gap:16px;align-items:flex-start;justify-content:space-between;flex-wrap:wrap}
      .dsw-head > .dsw-toggle{align-self:flex-start}
      .dsw-head-main{min-width:0;flex:1}
      .dsw-title-row{display:block}
      .dsw-title{font-size:34px;font-weight:1000;line-height:1.05;color:#f8fafc}
      .dsw-toggle{display:inline-flex;align-items:center;gap:6px;width:auto;flex:0 0 auto;padding:6px;border-radius:16px;border:1px solid rgba(148,163,184,.22);background:rgba(15,23,42,.72);box-shadow:inset 0 1px 0 rgba(255,255,255,.04)}
      .dsw-toggle button{min-width:78px;height:42px;flex:0 0 auto;padding:0 16px;border:1px solid transparent;border-radius:12px;cursor:pointer;background:transparent;color:#cbd5e1;font-size:15px;font-weight:1000;letter-spacing:.01em;transition:background .15s ease,color .15s ease,border-color .15s ease,transform .15s ease}
      .dsw-toggle button:hover{background:rgba(255,255,255,.05);color:#f8fafc}
      .dsw-toggle button.active{background:#facc15;color:#111827;border-color:rgba(250,204,21,.9);box-shadow:0 6px 16px rgba(250,204,21,.18)}
      .dsw-stats{display:grid;gap:12px;margin-top:18px}
      .dsw-stat{border:1px solid rgba(148,163,184,.16);background:rgba(15,23,42,.5);border-radius:18px;padding:14px;text-align:center}
      .dsw-stat-label{font-size:13px;font-weight:900;color:#94a3b8;text-transform:uppercase;letter-spacing:.04em}
      .dsw-stat-value{font-size:24px;font-weight:1000;color:#f8fafc;margin-top:6px}
      .dsw-inline-meta{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:12px}
      .dsw-mini{border:1px solid rgba(148,163,184,.16);background:rgba(15,23,42,.5);border-radius:18px;padding:14px;text-align:center}
      .dsw-mini-label{font-size:12px;font-weight:900;color:#94a3b8;text-transform:uppercase}
      .dsw-mini-value{font-size:22px;font-weight:1000;color:#f8fafc;margin-top:6px}
      .dsw-growth-value{display:inline-flex;align-items:center;justify-content:center;gap:8px}
      .dsw-growth-value img{width:42px;height:42px;object-fit:contain;border-radius:8px}
      .dsw-shadow-weapon-stats{grid-template-columns:1fr}
      .dsw-shadow-weapon-card{display:flex;align-items:center;gap:14px;border:1px solid rgba(148,163,184,.16);background:rgba(15,23,42,.5);border-radius:18px;padding:14px;min-width:0}
      .dsw-shadow-weapon-img,.dsw-shadow-weapon-empty{width:72px;height:72px;border-radius:14px;border:1px solid rgba(148,163,184,.18);background:rgba(15,23,42,.75);flex:0 0 auto}
      .dsw-shadow-weapon-img{object-fit:cover}
      .dsw-shadow-weapon-empty{display:grid;place-items:center;text-align:center;color:#94a3b8;font-size:11px;font-weight:900;padding:8px}
      .dsw-shadow-weapon-meta{min-width:0;display:grid;gap:6px}
      .dsw-shadow-weapon-name{font-size:22px;font-weight:1000;color:#f8fafc;line-height:1.15;overflow-wrap:anywhere}
      .dsw-pagebar{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;flex-wrap:wrap;padding:0 2px}
      .dsw-page-head{display:grid;gap:4px}
      .dsw-editor-title{font-size:24px;font-weight:800;line-height:1.25;color:#0f172a}
      .dark .dsw-editor-title{color:#facc15}
      .dsw-page-subtitle{font-size:14px;color:rgba(71,85,105,.95)}
      .dark .dsw-page-subtitle{color:rgba(203,213,225,.9)}
      .dsw-btns{display:flex;gap:10px;flex-wrap:wrap}
      .dsw-btn{height:42px;padding:0 16px;border-radius:14px;border:1px solid rgba(148,163,184,.18);background:rgba(15,23,42,.75);color:#f8fafc;font-weight:900;cursor:pointer}
      .dsw-btn:disabled{opacity:.45;cursor:not-allowed;transform:none}
      .dsw-btn:hover{background:rgba(30,41,59,.95)}
      .dsw-btn.back{height:40px;padding:0 14px;border-radius:14px;border:1px solid rgba(148,163,184,.28);background:rgba(15,23,42,.55);color:rgba(226,232,240,.95);font-weight:800;display:inline-flex;align-items:center;gap:10px;transition:transform .15s ease, background .15s ease, border-color .15s ease, box-shadow .15s ease;outline:none}
      .dsw-btn.nav{max-width:220px}
      .dsw-btn.nav span{max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .dsw-btn.back:hover{background:rgba(255,255,255,.10);border-color:rgba(148,163,184,.38);color:rgba(255,255,255,.98);transform:translateY(-1px)}
      .dsw-richtext{font-size:16px;line-height:1.7;color:#dbe7ff}
      .dsw-richtext-inline{line-height:1.6}
      .dsw-muted{color:#94a3b8}
      .dsw-editor-card{padding:18px 20px}
      .dsw-editor-section{margin-top:14px;padding-top:14px;border-top:1px solid rgba(255,255,255,.07)}
      .dsw-editor-section:first-of-type{margin-top:0;padding-top:0;border-top:0}
      .dsw-subtitle{font-size:16px;font-weight:900;color:#fff;margin-bottom:10px}
      .dsw-subtitle-sm{margin-top:14px;font-size:14px;color:#cbd5e1}
      .dsw-grid-1{display:grid;grid-template-columns:1fr;gap:12px}
      .dsw-grid-2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
      .dsw-field{display:flex;flex-direction:column;gap:6px}
      .dsw-label{font-size:13px;font-weight:800;color:#cbd5e1}
      .dsw-admin-in,.dsw-admin-ta,.dsw-field select{width:100%;border-radius:12px;border:1px solid rgba(148,163,184,.22);background:#0f172a;color:#f8fafc;outline:none;padding:10px 12px}
      .dsw-admin-in:focus,.dsw-admin-ta:focus,.dsw-field select:focus{border-color:rgba(96,165,250,.55);box-shadow:0 0 0 3px rgba(96,165,250,.18)}
      .dsw-admin-ta{resize:vertical;min-height:140px;font-family:inherit}
      .dsw-admin-btn{appearance:none;border:1px solid rgba(96,165,250,.35);background:rgba(96,165,250,.12);color:#eaf3ff;border-radius:12px;padding:10px 14px;font-weight:800;cursor:pointer}
      .dsw-admin-btn:hover{background:rgba(96,165,250,.18)}
      .dsw-admin-btn.active{background:rgba(96,165,250,.22);border-color:rgba(96,165,250,.55)}
      .dsw-admin-btn.ghost{background:rgba(255,255,255,.04);border-color:rgba(255,255,255,.09)}
      .dsw-admin-btn.ghost:hover{background:rgba(255,255,255,.08)}
      .dsw-admin-btn.danger{background:rgba(239,68,68,.12);border-color:rgba(239,68,68,.35)}
      .dsw-admin-btn.danger:hover{background:rgba(239,68,68,.18)}
      .dsw-row{display:flex;align-items:center}
      .dsw-row.gap{gap:8px}
      .dsw-row.end{justify-content:flex-end}
      .dsw-row.between{justify-content:space-between}
      .dsw-row.wrap{flex-wrap:wrap}
      .dsw-adv-summary > .dsw-row{width:auto;flex:0 0 auto;justify-content:flex-end}
      .dsw-skills-toggle,.dsw-inline-toggle{width:auto;flex:0 0 auto}
      .dsw-help{margin-top:8px;font-size:12px;color:#94a3b8}
      .dsw-color-palette{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
      .dsw-color-btn{appearance:none;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.04);color:#fff;border-radius:999px;padding:8px 10px;cursor:pointer;font-weight:800;position:relative}
      .dsw-color-btn::before{content:'';display:inline-block;width:10px;height:10px;border-radius:999px;background:var(--swatch);margin-right:8px;vertical-align:middle}
      .dsw-insert-buttons{margin-top:12px}
      .dsw-live-preview{margin-top:12px;padding:12px;border-radius:14px;border:1px solid rgba(148,163,184,.14);background:rgba(15,23,42,.42)}
      .dsw-block-editor-collapsible{margin-top:12px;border-radius:16px;border:1px solid rgba(255,255,255,.07);background:rgba(255,255,255,.03);overflow:hidden}
      .dsw-block-summary{list-style:none;display:flex;justify-content:space-between;align-items:center;gap:10px;padding:14px;cursor:pointer}
      .dsw-block-summary::-webkit-details-marker{display:none}
      .dsw-block-summary-title{font-weight:900;color:#fff}
      .dsw-block-editor-body{padding:0 14px 14px}
      .dsw-image-preview-wrap{margin-top:12px}
      .dsw-image-preview{width:100%;max-width:60px;border-radius:14px;border:1px solid rgba(255,255,255,.08);display:block}
      .dsw-rarity-edit-row{display:grid;grid-template-columns:140px 1fr 1fr;gap:10px;align-items:center;margin-top:10px}
      .dsw-rarity-edit-label{font-weight:800;color:#e2e8f0}
      .dsw-adv-section{border:1px solid rgba(148,163,184,.18);background:linear-gradient(180deg, rgba(15,23,42,.85), rgba(2,6,23,.85));border-radius:24px;box-shadow:0 18px 40px rgba(0,0,0,.18);overflow:hidden}
      .dsw-adv-section + .dsw-adv-section{margin-top:14px}
      .dsw-adv-summary{list-style:none;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:18px 20px;cursor:pointer}
      .dsw-adv-summary::-webkit-details-marker{display:none}
      .dsw-adv-summary-left{display:grid;gap:4px;min-width:0}
      .dsw-adv-summary-title{font-size:22px;font-weight:1000;color:#fff;line-height:1.1}
      .dsw-adv-body{padding:0 16px 16px}
      .dsw-adv-chevron{color:#94a3b8;font-size:20px;font-weight:900}
      .dsw-adv-editor-box{background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);border-radius:18px;padding:14px}
      .dsw-desc-group{padding:16px}
      .dsw-desc-row + .dsw-desc-row{margin-top:16px}
      .dsw-desc-row.text-only{display:block}
      .dsw-desc-row.with-image{display:grid;grid-template-columns:56px 1fr;gap:14px;align-items:flex-start}
      .dsw-desc-img-col{width:56px;display:flex;justify-content:flex-start;padding-top:2px}
      .dsw-desc-text-col{min-width:0}
      .dsw-inline-desc-image{width:44px;height:44px;object-fit:cover;border-radius:10px;border:1px solid rgba(255,255,255,.1);display:block;cursor:zoom-in;background:rgba(15,23,42,.7)}
      .dsw-auto-adv-text{margin-bottom:14px; margin-top:14px;}
      .dsw-editor-actions{margin-top:16px}

      .dsw-lightbox{position:fixed;inset:0;z-index:9999;background:rgba(2,6,23,.86);display:flex;align-items:center;justify-content:center;padding:24px;backdrop-filter:blur(8px)}
      .dsw-lightbox.hidden{display:none}
      .dsw-lightbox-card{width:min(1200px,96vw);height:min(90vh,900px);border-radius:24px;border:1px solid rgba(148,163,184,.18);background:linear-gradient(180deg, rgba(30,41,59,.96), rgba(15,23,42,.96));box-shadow:0 20px 60px rgba(0,0,0,.45);display:grid;grid-template-rows:auto 1fr auto;overflow:hidden}
      .dsw-lightbox-head{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:18px 20px;border-bottom:1px solid rgba(148,163,184,.14)}
      .dsw-lightbox-title{font-size:18px;font-weight:1000;color:#facc15}
      .dsw-lightbox-close{width:42px;height:42px;border-radius:12px;border:1px solid rgba(255,255,255,.16);background:rgba(15,23,42,.6);color:#fff;cursor:pointer;font-size:20px;line-height:1;display:inline-flex;align-items:center;justify-content:center}
      .dsw-lightbox-body{position:relative;display:flex;align-items:center;justify-content:center;padding:24px 72px;overflow:hidden;min-height:0}
      .dsw-lightbox-img{display:block;width:auto !important;height:auto !important;max-width:min(100%, 760px);max-height:min(100%, 58vh);object-fit:contain;object-position:center center;user-select:none;margin:auto;filter:drop-shadow(0 10px 26px rgba(0,0,0,.28))}
      .dsw-lightbox-foot{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;padding:18px 20px;border-top:1px solid rgba(148,163,184,.14)}
      .dsw-lightbox-foot-title{color:#e2e8f0;font-weight:800}
      .dsw-lightbox-actions{display:flex;gap:10px;flex-wrap:wrap}
      .dsw-download{text-decoration:none;display:inline-flex;align-items:center;gap:8px}
      .sla-hide-admin-buttons .dsw-toolbar,.sla-hide-admin-buttons .dsw-editor-card{display:none !important}

      @media (max-width: 980px){
        .dsw-wrap{padding:14px;gap:14px}
        .dsw-top{grid-template-columns:1fr;gap:14px;padding:14px}
        .dsw-head{flex-direction:column;align-items:stretch;gap:12px}
        .dsw-toggle{width:auto;justify-content:flex-start}
        .dsw-head > .dsw-toggle{align-self:flex-start}
        .dsw-adv-summary > .dsw-row{width:auto;flex:0 0 auto}
        .dsw-inline-meta,.dsw-grid-2{grid-template-columns:repeat(2,minmax(0,1fr))}
      }

      @media (max-width: 640px){
        .dsw-wrap{padding:10px;gap:12px}
        .dsw-card{border-radius:18px}
        .dsw-top{padding:12px;gap:12px}
        .dsw-top-actions{margin-top:12px}
        .dsw-pagebar{gap:10px;align-items:stretch}
        .dsw-page-head{gap:2px}
        .dsw-page-subtitle{font-size:12px}
        .dsw-editor-title{font-size:20px;line-height:1.15}
        .dsw-btns{width:100%;gap:8px}
        .dsw-btn.nav{flex:1;max-width:none;justify-content:center}
        .dsw-btn.nav span{max-width:120px}
        .dsw-btn,.dsw-btn.back{height:38px;padding:0 12px;border-radius:12px;font-size:13px}
        .dsw-slider{min-height:220px;padding:0;border-radius:18px}
        .dsw-main-skin{max-height:220px}
        .dsw-arrow{width:34px;height:34px}
        .dsw-arrow.left{left:8px}
        .dsw-arrow.right{right:8px}
        .dsw-arrow::before{width:9px;height:9px}
        .dsw-title{font-size:18px;line-height:1.15}
        .dsw-toggle{width:auto;padding:4px;border-radius:14px}
        .dsw-head > .dsw-toggle{align-self:flex-start}
        .dsw-adv-summary > .dsw-row{width:auto;flex:0 0 auto}
        .dsw-toggle button{flex:0 0 auto;min-width:64px;height:36px;padding:0 10px;font-size:14px;border-radius:10px}
        .dsw-inline-meta{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:10px}
        .dsw-stats{gap:10px;margin-top:12px}
        .dsw-stat,.dsw-mini{padding:12px 10px;border-radius:14px}
        .dsw-stat-label,.dsw-mini-label{font-size:11px}
        .dsw-stat-value,.dsw-mini-value{font-size:16px;margin-top:4px}
        .dsw-growth-value img{width:36px;height:36px}
        .dsw-shadow-weapon-card{padding:12px;gap:12px;border-radius:14px}
        .dsw-shadow-weapon-img,.dsw-shadow-weapon-empty{width:56px;height:56px;border-radius:12px}
        .dsw-shadow-weapon-name{font-size:16px}
        .dsw-editor-card{padding:14px}
        .dsw-grid-2{grid-template-columns:1fr;gap:10px;margin-top:12px}
        .dsw-field{gap:6px}
        .dsw-label{font-size:12px}
        .dsw-admin-in,.dsw-field select{height:42px;padding:0 12px;font-size:14px;border-radius:12px}
        .dsw-admin-ta{padding:12px;font-size:14px;border-radius:12px}
        .dsw-color-palette{gap:6px;margin-top:12px}
        .dsw-color-btn{min-width:56px;height:34px;padding:0 10px;border-radius:10px;font-size:12px}
        .dsw-richtext{font-size:14px;line-height:1.55}
        .dsw-rarity-edit-row{grid-template-columns:1fr}
        .dsw-adv-section{border-radius:18px}
        .dsw-adv-summary{padding:14px 14px}
        .dsw-adv-summary-title{font-size:18px}
        .dsw-adv-body{padding:0 12px 12px}
        .dsw-desc-group{padding:12px}
        .dsw-desc-row.with-image{grid-template-columns:42px 1fr;gap:10px}
        .dsw-desc-img-col{width:42px}
        .dsw-inline-desc-image{width:36px;height:36px;border-radius:8px}
        .dsw-block-summary{padding:12px}
        .dsw-block-editor-body{padding:0 12px 12px}
        .dsw-dots{margin-top:10px}
        .dsw-dot{width:9px;height:9px}
        .dsw-dot.active{width:20px}

        .dsw-lightbox{padding:10px}
        .dsw-lightbox-card{width:100%;height:min(92vh,900px);border-radius:18px}
        .dsw-lightbox-head,.dsw-lightbox-foot{padding:12px 14px}
        .dsw-lightbox-body{padding:12px 46px}
        .dsw-lightbox-title{font-size:15px}
        .dsw-lightbox-img{max-width:min(100%, 92vw);max-height:min(100%, 48vh)}
      }

      .dsw-skills-wrap{padding:20px}
      .dsw-section-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:16px}
      .dsw-skills-list{display:grid;gap:14px}
      .dsw-skills-list + .dsw-skills-list{margin-top:18px;padding-top:18px;border-top:1px solid rgba(148,163,184,.16)}

      .dsw-skill-row{
        display:grid;
        grid-template-columns:220px 1fr;
        gap:18px;
        border:1px solid rgba(148,163,184,.16);
        border-radius:20px;
        background:linear-gradient(180deg, rgba(15,23,42,.72), rgba(2,6,23,.72));
        padding:16px;
      }

      .dsw-skill-side{min-width:0}
      .dsw-skill-side-left{
        display:flex;
        flex-direction:column;
        align-items:center;
        justify-content:flex-start;
        gap:12px;
      }

      .dsw-skill-side-right{
        display:grid;
        gap:12px;
        align-content:start;
        min-width:0;
      }

      .dsw-skill-image{
        width:160px;
        height:160px;
        object-fit:contain;
        border-radius:16px;
        border:1px solid rgba(148,163,184,.18);
        background:rgba(15,23,42,.75);
        cursor:zoom-in;
        display:block;
      }

      .dsw-skill-image-empty{
        width:160px;
        height:160px;
        display:grid;
        place-items:center;
        border-radius:16px;
        border:1px dashed rgba(148,163,184,.22);
        color:#94a3b8;
        background:rgba(15,23,42,.55);
        text-align:center;
        padding:10px;
      }

      .dsw-skill-name-wrap{
        width:100%;
        display:flex;
        justify-content:center;
      }

      .dsw-skill-name{
        text-align:center;
        font-size:18px;
        font-weight:900;
        color:#f8fafc;
        line-height:1.25;
      }

      .dsw-special-adv-row{
        display:flex;
        align-items:center;
        justify-content:center;
        gap:6px;
        margin-top:2px;
      }

      .dsw-special-adv-row img{
        width:20px;
        height:20px;
        object-fit:cover;
        border-radius:7px;
        display:block;
      }

      .dsw-skill-edit-level{
        color:#94a3b8;
        font-size:13px;
        font-weight:900;
        line-height:1;
      }

      .dsw-skill-card-actions{
        margin-top:12px;
        justify-content:flex-end;
      }

      .dsw-skill-title-input{
        width:100%;
        max-width:180px;
        text-align:center;
        font-size:16px;
        font-weight:900;
      }

      .dsw-skill-image-field{
        width:100%;
        max-width:260px;
      }

      .dsw-skill-level{
        font-size:20px;
        font-weight:1000;
        color:#f8fafc;
        line-height:1.2;
      }

      .dsw-skill-desc-input{
        min-height:170px;
        resize:vertical;
      }

      .dsw-skill-richtext{
        min-height:120px;
        font-size:16px;
        line-height:1.7;
        color:#dbe7ff;
      }

      @media (max-width: 980px){
        .dsw-skill-row{
          grid-template-columns:1fr;
        }

        .dsw-skill-image,
        .dsw-skill-image-empty{
          width:140px;
          height:140px;
        }
      }

      @media (max-width: 640px){
        .dsw-skills-wrap{padding:14px}
        .dsw-section-head{margin-bottom:12px}
        .dsw-skill-row{
          gap:14px;
          padding:12px;
          border-radius:16px;
        }

        .dsw-skill-side-left{
          gap:10px;
        }

        .dsw-skill-image,
        .dsw-skill-image-empty{
          width:120px;
          height:120px;
          border-radius:12px;
        }

        .dsw-skill-name{
          font-size:16px;
        }

        .dsw-skill-title-input{
          max-width:100%;
          font-size:14px;
        }

        .dsw-skill-level{
          font-size:18px;
        }

        .dsw-skill-richtext{
          font-size:14px;
          line-height:1.6;
        }

        .dsw-skill-desc-input{
          min-height:140px;
        }

        .dsw-skills-section .dsw-adv-summary{align-items:center}
        .dsw-skills-toggle{margin-right:4px}
        .dsw-inline-toggle{margin-right:4px}
        .dsw-skills-section .dsw-adv-body{padding-top:0}
      }
    `;

    document.head.append(el('style', { id: 'details-shadows-style' }, css));
  }

  async function init(pathArg) {
    try {
      injectStyles();
      await loadWeapon(pathArg);
      await loadShadowWeaponCatalog();
      await loadDetails();
      await loadSkinsForWeapon();
      await loadSkillsForWeapon();
      renderApp();
    } catch (e) {
      console.error(e);
      const app = qs('#content') || qs('#app') || document.body;
      app.innerHTML = '';
      app.append(el('div', {
        style: 'max-width:960px;margin:40px auto;padding:20px;border-radius:18px;background:#111827;color:#fff;border:1px solid rgba(255,255,255,.08)'
      },
        el('div', { style: 'font-size:24px;font-weight:900;margin-bottom:8px' }, 'Failed to load Shadow details'),
        el('div', { style: 'color:#94a3b8' }, String(e?.message || e || 'Unknown error'))
      ));
    }
  }

  window.__details_shadow_mount = async function __details_shadow_mount(pathArg) {
    await init(pathArg);
  };

  function shouldAutoInit() {
    return String(location.pathname || '').includes('/shadows/');
  }

  if (!window.__SLA_ROUTER_PRELOADING_SCRIPT) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        if (shouldAutoInit()) init();
      }, { once: true });
    } else if (shouldAutoInit()) {
      init();
    }
  }
})();


