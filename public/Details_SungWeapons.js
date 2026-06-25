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
    const idx = parts.findIndex(x => x === 'sjw-weapons');
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

  const SW_LOCAL_WEAPON_CATEGORIES = ['SGWeapon', 'SWeapon', 'SungWeapon', 'Sung_Weapon', 'Weapon_Sung'];
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

  function resolveDescriptionImageSrc(folder, rel, w = 1400) {
    const s = String(rel || '').trim();
    if (!s) return '';
    if (isHttpUrl(s)) return cdnySafe(s, w);
    if (s.startsWith('SGWeapon_Description_Pictures/')) return url(`/picture/${s}`);
    return url(`/picture/SGWeapon_Description_Pictures/${folder}/${s}`);
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
    const input = el('input', { type: 'text', class: 'dsw-admin-in', placeholder: 'Loading images…', value: '' });
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
      input.placeholder = 'Search image…';
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
    if (a === 1) return '✧✧✧✧✧';

    if (a >= 2 && a <= 5) {
      const filled = '✦'.repeat(a - 1);
      const empty = '✧'.repeat(6 - a);
      return `${filled}${empty}`;
    }

    if (a === 6) return '✦✦✦✦✦';
    return `✦✦✦✦✦${a - 6}`;
  }

  function normalizeWeaponImageRel(v) {
    const s = String(v || '').trim().replace(/^\/+/, '');
    if (!s) return '';
    if (/^https?:\/\//i.test(s)) return s;
    if (s.startsWith('SGWeapon/')) return s;
    return `SGWeapon/${s}`;
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
    return folder ? `SGWeapon_Skill/${folder}` : '';
  }

  function skillTitleStorageKey(weaponName) {
    return `sla_sjw_skill3_title:${slugifyWeaponName(weaponName || '')}`;
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

    // jeśli rel już zawiera pełną ścieżkę, nie doklejaj drugi raz
    if (cleaned.startsWith('SGWeapon_Skill/')) {
      return url(`/picture/${cleaned}`);
    }

    // jeśli to tylko sama nazwa pliku, doklej folder broni
    return url(`/picture/SGWeapon_Skill/${folder}/${cleaned}`);
  }

  function normalizeSkillSlot(kind, rel, weaponName) {
    const file = fileNameOnly(rel);

    if (kind === 'basic') {
      return {
        key: 'basic',
        name: 'Basic Attack',
        autoName: 'Basic Attack',
        image: rel ? resolveSkillImageSrc(rel, skillFolderName(STATE.weapon)) : '',
        raw: rel || ''
      };
    }

    if (kind === 'core') {
      return {
        key: 'core',
        name: 'Core Attack',
        autoName: 'Core Attack',
        image: rel ? resolveSkillImageSrc(rel, skillFolderName(STATE.weapon)) : '',
        raw: rel || ''
      };
    }

    const autoName = prettifySkillNameFromFile(file) || 'Skill 3';

    return {
      key: 'third',
      name: autoName,
      autoName,
      image: rel ? resolveSkillImageSrc(rel, skillFolderName(STATE.weapon)) : '',
      raw: rel || ''
    };
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

      const basicRel = rels.find(r => /Basic_Attack\./i.test(fileNameOnly(r))) || '';
      const coreRel = rels.find(r => /Core_Attack\./i.test(fileNameOnly(r))) || '';

      const otherRels = rels.filter(r => {
        const f = fileNameOnly(r);
        return !/Basic_Attack\./i.test(f) && !/Core_Attack\./i.test(f);
      });

      const thirdRel = otherRels[0] || '';

      STATE.skills = [
        normalizeSkillSlot('basic', basicRel || '', STATE.weaponName),
        normalizeSkillSlot('core', coreRel || '', STATE.weaponName),
        normalizeSkillSlot('third', thirdRel || '', STATE.weaponName)
      ];
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
    return url(`/picture/SGWeapon_Skin/${folder}/${raw.replace(/^\/+/, '')}`);
  }

  async function listSkinImagesInFolder(folder, baseName) {
    if (!folder || !baseName) return [];

    try {
      const r = await fetch(
        url(`/api/public/sweapon-skins?folder=${encodeURIComponent(folder)}&baseName=${encodeURIComponent(baseName)}`),
        {
          credentials: 'include',
          cache: 'no-store'
        }
      );

      const j = await r.json().catch(() => ({}));
      const items = Array.isArray(j?.items) ? j.items : [];

      return items
        .map((it) => String(it?.url || it?.src || '').trim())
        .filter(Boolean)
        .map((src) => {
          if (/^https?:\/\//i.test(src)) return src;
          return src.startsWith('/') ? src : `/${src}`;
        });
    } catch (_) {
      return [];
    }
  }

  async function loadSkinsForWeapon() {
    const original = weaponImgSrc(STATE.weapon);
    const folder = inferSkinFolder(STATE.weapon);
    const baseName = getWeaponSkinBaseName(STATE.weapon);

    let found = await listSkinImagesInFolder(folder, baseName);

    if (!found.length && folder) {
      try {
        const items = await getPicturesByCategory(`SGWeapon_Skin/${folder}`);
        found = (Array.isArray(items) ? items : [])
          .map(it => String(it?.rel || '').trim())
          .filter(Boolean)
          .map(rel => {
            const fileOnly = rel.split('/').pop() || rel;
            return skinImgSrc(fileOnly, folder);
          })
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

  function defaultRarityStats(attackMin, attackMax, hpMin, hpMax, precisionMin, precisionMax) {
    return {
      attack: { min: attackMin, max: attackMax },
      hp: { min: hpMin, max: hpMax },
      precision: { min: precisionMin, max: precisionMax },
      advBonusTexts: defaultAdvBonusTexts()
    };
  }

  const DEFAULT_GLOBAL_STATS = {
    levelMin: 1,
    levelMax: 120,
    rarities: {
      SSR: defaultRarityStats(400, 3080, 400, 4650, 0, 4000),
      SR: defaultRarityStats(250, 1700, 250, 2550, 0, 2000),
      R: defaultRarityStats(150, 1530, 150, 2295, 0, 1250)
    }
  };

  function defaultSkillDetails() {
    return {
      basic: {
        name: 'Basic Attack',
        text: ''
      },
      core: {
        name: 'Core Attack',
        text: ''
      },
      third: {
        name: '',
        text: ''
      }
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
    weaponIndex: -1
  };

  function getWeaponDetailsTarget(weapon) {
    const slug = slugifyWeaponName(weapon?.name || '');
    return slug ? url(`/sjw-weapons/${encodeURIComponent(slug)}`) : '';
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
      el('div', { class: 'dsw-stat-value' }, value || '—')
    );
  }

  function currentSkillsSectionKey() {
    return STATE.statMode === 'max' ? 'skills:max' : 'skills:min';
  }
  
  function setGlobalStatMode(mode) {
    const prevMode = STATE.statMode === 'max' ? 'max' : 'min';
    const nextMode = mode === 'max' ? 'max' : 'min';

    if (prevMode !== nextMode) {
      const prevSkillsKey = prevMode === 'max' ? 'skills:max' : 'skills:min';
      const nextSkillsKey = nextMode === 'max' ? 'skills:max' : 'skills:min';

      // przenieś stan otwarcia skills tylko jeśli był wcześniej otwarty
      if (STATE.openSections.has(prevSkillsKey)) {
        STATE.openSections.delete(prevSkillsKey);
        STATE.openSections.add(nextSkillsKey);
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

  function currentRarityKey() {
    return normalizeRarity(STATE.weapon?.rarity || 'SSR');
  }

  function currentRarityStats() {
    const gs = (STATE.globalStats && typeof STATE.globalStats === 'object')
      ? STATE.globalStats
      : DEFAULT_GLOBAL_STATS;

    const rarityKey = currentRarityKey();
    const rarity = (gs.rarities && gs.rarities[rarityKey]) ? gs.rarities[rarityKey] : DEFAULT_GLOBAL_STATS.rarities[rarityKey];
    const mode = STATE.statMode === 'max' ? 'max' : 'min';

    return {
      level: mode === 'max'
        ? String(gs.levelMax ?? DEFAULT_GLOBAL_STATS.levelMax)
        : String(gs.levelMin ?? DEFAULT_GLOBAL_STATS.levelMin),
      advancement: mode === 'max' ? advancementLabel(11) : advancementLabel(1),
      attack: Number(rarity?.attack?.[mode] ?? 0),
      hp: Number(rarity?.hp?.[mode] ?? 0),
      precision: Number(rarity?.precision?.[mode] ?? 0)
    };
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

    return {
      basic: {
        name: 'Basic Attack',
        text: String(src.basic?.text || '')
      },
      core: {
        name: 'Core Attack',
        text: String(src.core?.text || '')
      },
      third: {
        name: String(src.third?.name || '').trim(),
        text: String(src.third?.text || '')
      }
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

    function normRange(v, fallbackMin, fallbackMax) {
      return {
        min: clampInt(v?.min, 0, 999999, fallbackMin),
        max: clampInt(v?.max, 0, 999999, fallbackMax)
      };
    }

    function normBonusTexts(v) {
      const srcS = (v && typeof v === 'object') ? v : {};
      return {
        '1': String(srcS['1'] ?? ''),
        '2': String(srcS['2'] ?? ''),
        '3': String(srcS['3'] ?? ''),
        '4': String(srcS['4'] ?? ''),
        '5': String(srcS['5'] ?? '')
      };
    }

    const out = {
      global_stats: {
        levelMin: clampInt(gs.levelMin, 1, 120, DEFAULT_GLOBAL_STATS.levelMin),
        levelMax: clampInt(gs.levelMax, 1, 120, DEFAULT_GLOBAL_STATS.levelMax),
        rarities: {
          SSR: {
            attack: normRange(gs.rarities?.SSR?.attack, 400, 3080),
            hp: normRange(gs.rarities?.SSR?.hp, 400, 4650),
            precision: normRange(gs.rarities?.SSR?.precision, 0, 4000),
            advBonusTexts: normBonusTexts(gs.rarities?.SSR?.advBonusTexts)
          },
          SR: {
            attack: normRange(gs.rarities?.SR?.attack, 250, 1700),
            hp: normRange(gs.rarities?.SR?.hp, 250, 2550),
            precision: normRange(gs.rarities?.SR?.precision, 0, 2000),
            advBonusTexts: normBonusTexts(gs.rarities?.SR?.advBonusTexts)
          },
          R: {
            attack: normRange(gs.rarities?.R?.attack, 150, 1530),
            hp: normRange(gs.rarities?.R?.hp, 150, 2295),
            precision: normRange(gs.rarities?.R?.precision, 0, 1250),
            advBonusTexts: normBonusTexts(gs.rarities?.R?.advBonusTexts)
          }
        }
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
    const rarityKey = currentRarityKey();
    const advBonusTexts = getGlobalAdvBonusTexts(rarityKey);
  
    // Skills otwarte od startu
    set.add('skills:min');
    set.add('skills:max');
  
    for (let i = 1; i <= ADV_MAX; i++) {
      const key = String(i);
      const details = normalizeAdvancementDetails(detailsMap[key]);
      const hasContent = Array.isArray(details.blocks) && details.blocks.length > 0;
      const hasAuto = i >= 7 && !!String(advBonusTexts[String(i - 6)] || '').trim();
    
      if (i === 1 || hasContent || hasAuto) {
        set.add(key);
      }
    }
  
    STATE.openSections = set;
  }

  async function loadWeapon(pathArg) {
    const fromPath = unslugPathWeapon(pathArg || location.pathname);
    const fromState = String(history.state?.weaponName || '').trim();
    const fromSession = String(sessionStorage.getItem('sjw_weapon_name') || '').trim();

    const slug = fromPath || slugifyWeaponName(fromState || fromSession || '');
    if (!slug) throw new Error('Missing weapon name');

    const [catalog, order] = await Promise.all([
      fetchJsonTry(['/api/public/sung-weapons']),
      loadGlobalWeaponOrder()
    ]);

    const weapons = Array.isArray(catalog)
      ? catalog
      : (Array.isArray(catalog?.items) ? catalog.items : []);

    if (!Array.isArray(weapons)) {
      throw new Error('Invalid sung weapon catalog');
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
      throw new Error(`Weapon not found for slug: ${slug}`);
    }

    STATE.weapon = weapon;
    STATE.weaponName = weapon.name;
    STATE.weapons = normalized;
    STATE.weaponIndex = normalized.findIndex(w => String(w?.name || '').trim() === STATE.weaponName);
  }

  async function loadGlobalWeaponOrder() {
    try {
      const r = await fetch(url('/api/global/order?dataset=sungWeapons'), {
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

  async function loadDetails() {
    const fallback = structuredClone(DEFAULT_DETAILS);

    try {
      const [detailsRes, statsRes] = await Promise.all([
        fetch(url(`/api/public/sung-weapon-details?name=${encodeURIComponent(STATE.weaponName)}`), {
          credentials: 'include',
          cache: 'no-store'
        }),
        fetch(url('/api/public/sweapon-global-stats'), {
          credentials: 'include',
          cache: 'no-store'
        })
      ]);

      if (detailsRes.ok) {
        const j = await detailsRes.json().catch(() => ({}));
        STATE.details = normalizeDetails(j?.item || j?.details || j || fallback);
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

    lb._title.textContent = `${STATE.weaponName || 'Sung Weapon'} - Image Preview`;
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
    const r = await fetch(url('/api/admin/sung-weapon-details'), {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: STATE.weaponName,
        details: normalized.details
      })
    });

    if (!r.ok) throw new Error(`HTTP ${r.status}`);

    STATE.details = normalizeDetails({ details: normalized.details });
    return STATE.details;
  }

  async function saveGlobalStatsPayload(stats) {
    const r = await fetch(url('/api/admin/sweapon-global-stats'), {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stats })
    });

    if (!r.ok) throw new Error(`HTTP ${r.status}`);

    STATE.globalStats = normalizeDetails({ global_stats: stats }).global_stats;
    return STATE.globalStats;
  }

  function ensureSungWeaponModal() {
    if (document.getElementById('dsw-modal-css')) return;

    const s = document.createElement('style');
    s.id = 'dsw-modal-css';
    s.textContent = `
      .dswm-backdrop{
        position:fixed;inset:0;display:none;align-items:center;justify-content:center;
        z-index:9999;background:rgba(2,6,23,.55);backdrop-filter:blur(2px)
      }
      .dswm-modal{
        width:min(1200px,95vw);
        max-height:90vh;
        border-radius:1rem;
        border:1px solid rgba(148,163,184,.28);
        background:rgba(2,6,23,.96);
        color:#e2e8f0;
        box-shadow:0 18px 60px rgba(0,0,0,.55);
        overflow:hidden
      }
      .dswm-hd{
        padding:14px 16px;
        border-bottom:1px solid rgba(148,163,184,.20);
        font-weight:900;
        letter-spacing:.2px
      }
      .dswm-bd{
        padding:16px;
        max-height:72vh;
        overflow:auto
      }
      .dswm-ft{
        padding:12px 16px;
        border-top:1px solid rgba(148,163,184,.20);
        display:flex;
        gap:.5rem;
        justify-content:flex-end;
        align-items:center;
      }
      .dswm-btn{
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
      .dswm-btn.primary{
        background:rgba(255,255,255,.95);
        color:#0f172a;
        border-color:rgba(226,232,240,.85)
      }
      .dswm-btn.ghost{
        background:transparent
      }
    `;
    document.head.appendChild(s);

    const root = document.createElement('div');
    root.id = 'dsw-modal-root';
    root.className = 'dswm-backdrop';
    root.innerHTML = `
      <div class="dswm-modal">
        <div class="dswm-hd" id="dswmTitle"></div>
        <div class="dswm-bd" id="dswmBody"></div>
        <div class="dswm-ft">
          <button class="dswm-btn ghost" id="dswmClose" type="button">CLOSE</button>
          <button class="dswm-btn primary" id="dswmPrimary" type="button" style="display:none">SAVE</button>
        </div>
      </div>
    `;
    document.body.appendChild(root);

    function hide() {
      root.style.display = 'none';
      const bd = document.getElementById('dswmBody');
      if (bd) bd.innerHTML = '';
      const prim = document.getElementById('dswmPrimary');
      if (prim) prim.onclick = null;
    }

    function show(title, bodyBuilder, onPrimary = null, primaryText = 'SAVE') {
      const t = document.getElementById('dswmTitle');
      if (t) t.textContent = title || '';

      const bd = document.getElementById('dswmBody');
      if (bd) {
        bd.innerHTML = '';
        const built = (typeof bodyBuilder === 'function') ? bodyBuilder() : null;
        if (built) bd.append(built);
      }

      const prim = document.getElementById('dswmPrimary');
      if (prim) {
        const hasPrimary = typeof onPrimary === 'function';
        prim.style.display = hasPrimary ? 'inline-flex' : 'none';
        prim.textContent = primaryText || 'SAVE';
        prim.onclick = hasPrimary ? onPrimary : null;
      }

      root.style.display = 'flex';
      const close = document.getElementById('dswmClose');
      if (close) close.onclick = hide;
    }

    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hide(); });

    window.__details_sweapon_hideModal = hide;
    window.__details_sweapon_showModal = show;
  }

  function detailsSWeaponShowModal(title, bodyBuilder, onPrimary = null, primaryText = 'SAVE') {
    ensureSungWeaponModal();
    window.__details_sweapon_showModal?.(title, bodyBuilder, onPrimary, primaryText);
  }

  function detailsSWeaponHideModal() {
    try { window.__details_sweapon_hideModal?.(); } catch (_) {}
  }

  function openGlobalStatsModal() {
    if (!canShowAdminButtons()) return;

    const stats = structuredClone(STATE.globalStats || DEFAULT_GLOBAL_STATS);

    const panel = el('div', { class: 'dsw-card dsw-editor-card' },
      el('div', { class: 'dsw-section-title' }, 'Top card stats editor')
    );

    const levelMin = el('input', {
      type: 'number',
      class: 'dsw-admin-in',
      value: stats.levelMin ?? 1
    });

    const levelMax = el('input', {
      type: 'number',
      class: 'dsw-admin-in',
      value: stats.levelMax ?? 120
    });

    levelMin.addEventListener('input', () => {
      stats.levelMin = clampInt(levelMin.value, 1, 120, 1);
    });

    levelMax.addEventListener('input', () => {
      stats.levelMax = clampInt(levelMax.value, 1, 120, 120);
    });

    function rarityField(label, rarityKey, statKey, minVal, maxVal) {
      const minIn = el('input', {
        type: 'number',
        class: 'dsw-admin-in',
        value: stats.rarities?.[rarityKey]?.[statKey]?.min ?? minVal
      });

      const maxIn = el('input', {
        type: 'number',
        class: 'dsw-admin-in',
        value: stats.rarities?.[rarityKey]?.[statKey]?.max ?? maxVal
      });

      minIn.addEventListener('input', () => {
        stats.rarities[rarityKey][statKey].min = clampInt(minIn.value, 0, 999999, minVal);
      });

      maxIn.addEventListener('input', () => {
        stats.rarities[rarityKey][statKey].max = clampInt(maxIn.value, 0, 999999, maxVal);
      });

      return el('div', { class: 'dsw-rarity-edit-row' },
        el('div', { class: 'dsw-rarity-edit-label' }, label),
        minIn,
        maxIn
      );
    }

    function bonusTextField(rarityKey, idx) {
      const ta = el('textarea', {
        class: 'dsw-admin-ta',
        rows: 4,
        placeholder: `Text for ✦✦✦✦✦${idx}`
      }, String(stats.rarities?.[rarityKey]?.advBonusTexts?.[String(idx)] ?? ''));

      ta.addEventListener('input', () => {
        stats.rarities[rarityKey].advBonusTexts[String(idx)] = ta.value;
      });

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
            stats.rarities[rarityKey].advBonusTexts[String(idx)] = ta.value;
            ta.focus();
            ta.selectionStart = before.length + wrapped.length;
            ta.selectionEnd = ta.selectionStart;
          }
        }, btnCfg.label);
        palette.append(btn);
      });

      return el('div', { class: 'dsw-field' },
        el('span', { class: 'dsw-label' }, `✦✦✦✦✦${idx}`),
        ta,
        palette
      );
    }

    panel.append(
      el('div', { class: 'dsw-editor-section' },
        el('div', { class: 'dsw-subtitle' }, 'Top card min-max stats only'),
        el('div', { class: 'dsw-grid-2' },
          el('label', { class: 'dsw-field' },
            el('span', { class: 'dsw-label' }, 'Level min'),
            levelMin
          ),
          el('label', { class: 'dsw-field' },
            el('span', { class: 'dsw-label' }, 'Level max'),
            levelMax
          )
        )
      )
    );

    ['SSR', 'SR', 'R'].forEach((rarityKey) => {
      panel.append(
        el('div', { class: 'dsw-editor-section' },
          el('div', { class: 'dsw-subtitle' }, `${rarityKey} ranges`),
          rarityField('Attack', rarityKey, 'attack', DEFAULT_GLOBAL_STATS.rarities[rarityKey].attack.min, DEFAULT_GLOBAL_STATS.rarities[rarityKey].attack.max),
          rarityField('HP', rarityKey, 'hp', DEFAULT_GLOBAL_STATS.rarities[rarityKey].hp.min, DEFAULT_GLOBAL_STATS.rarities[rarityKey].hp.max),
          rarityField('Precision', rarityKey, 'precision', DEFAULT_GLOBAL_STATS.rarities[rarityKey].precision.min, DEFAULT_GLOBAL_STATS.rarities[rarityKey].precision.max),
          el('div', { class: 'dsw-subtitle dsw-subtitle-sm' }, `${rarityKey} auto text for ✦✦✦✦✦1-5`),
          el('div', { class: 'dsw-grid-1' },
            bonusTextField(rarityKey, 1),
            bonusTextField(rarityKey, 2),
            bonusTextField(rarityKey, 3),
            bonusTextField(rarityKey, 4),
            bonusTextField(rarityKey, 5)
          )
        )
      );
    });

    const doSave = async () => {
      try {
        await saveGlobalStatsPayload(stats);
        initOpenSections();
        detailsSWeaponHideModal();
        toast('Saved');
        renderApp();
      } catch (e) {
        console.error(e);
        toast('Save failed');
      }
    };

    detailsSWeaponShowModal('Global Stats', () => panel, doSave, 'SAVE');
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

  function fillBlocksLivePreview(node, blocks) {
    if (!node) return;
    node.innerHTML = '';
    const arr = Array.isArray(blocks) ? blocks : [];
    if (!arr.length) {
      node.append(el('div', { class: 'dsw-muted' }, 'No preview yet'));
      return;
    }
    const group = el('div', { class: 'dsw-desc-group' });
    arr.forEach((block) => group.append(renderDescriptionBlockInline(block)));
    node.append(group);
  }

  function renderBlocksLivePreview(blocks) {
    const node = el('div', { class: 'dsw-live-preview' });
    fillBlocksLivePreview(node, blocks);
    return node;
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

  function skillEditKey(levelKey, key) {
    return `${levelKey}:${key}`;
  }

  function isEditingAnySkill() {
    return !!STATE.editingSkillKey;
  }

  function clearSkillEdit() {
    STATE.editingSkillKey = null;
    STATE.editingSkills = false;
  }

  function displaySkillName(name, fallback) {
    const base = String(name || fallback || 'Skill').trim();
    return `${base} (${currentSkillNameLevelLabel()})`;
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

  function renderSingleSkillCard(skill) {
    const card = el('div', { class: 'dsw-skill-row' });

    const left = el('div', { class: 'dsw-skill-side dsw-skill-side-left' });
    const right = el('div', { class: 'dsw-skill-side dsw-skill-side-right' });

    const skillData = getCurrentSkillData();
    const skillEntry = skillData?.[skill.key] || { name: '', text: '' };
    const levelKey = currentSkillLevelKey();
    const editKey = skillEditKey(levelKey, skill.key);
    const isEditing = canShowAdminButtons() && STATE.editingSkillKey === editKey;

    if (skill.image) {
      const img = el('img', {
        class: 'dsw-skill-image',
        src: skill.image,
        alt: skill.name || 'Skill image',
        loading: 'lazy'
      });
      img.addEventListener('click', () => openLightbox(skill.image, skill.name || 'Skill image'));
      left.append(img);
    } else {
      left.append(el('div', { class: 'dsw-skill-image-empty' }, 'No image'));
    }

    if (isEditing && skill.key === 'third') {
      const titleInput = el('input', {
        type: 'text',
        class: 'dsw-admin-in dsw-skill-title-input',
        value: skillEntry.name || skill.name || '',
        placeholder: skill.autoName || 'Third skill name'
      });

      titleInput.addEventListener('input', () => {
        const payload = STATE.details.details[levelKey];
        payload.skills.third.name = titleInput.value;
        skill.name = titleInput.value.trim() || skill.autoName || 'Skill 3';
      });

      left.append(
        el('div', { class: 'dsw-skill-name-wrap' }, titleInput),
        el('div', { class: 'dsw-skill-edit-level' }, `(${currentSkillNameLevelLabel()})`)
      );
    } else {
      left.append(
        el('div', { class: 'dsw-skill-name-wrap' },
          el('div', { class: 'dsw-skill-name' },
            displaySkillName(
              skill.key === 'basic'
                ? 'Basic Attack'
                : skill.key === 'core'
                  ? 'Core Attack'
                  : (skillEntry.name || skill.name || skill.autoName || 'Skill 3'),
              skill.autoName || skill.name || 'Skill'
            )
          )
        )
      );
    }



    if (isEditing) {
      const ta = el('textarea', {
        class: 'dsw-admin-ta dsw-skill-desc-input',
        rows: '8',
        placeholder: 'Skill description...'
      });

      ta.value = String(skillEntry.text || '');

      ta.addEventListener('input', () => {
        STATE.details.details[levelKey].skills[skill.key].text = ta.value;
      });

      const palette = makeSkillColorPalette(ta, (v) => {
        STATE.details.details[levelKey].skills[skill.key].text = v;
      });

      right.append(ta, palette);
      right.append(el('div', { class: 'dsw-row gap wrap dsw-skill-card-actions' },
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
      ));
    } else {
      const rich = renderSkillRichTextNodes(String(skillEntry.text || ''));
      right.append(rich);
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
              STATE.openSections.add(currentSkillsSectionKey());
              renderApp();
            }
          }, 'Edit')
        ));
      }
    }

    card.append(left, right);
    return card;
  }

  function renderSkillsSection() {
    const sectionKey = currentSkillsSectionKey();
    const isOpen = isEditingAnySkill() || STATE.openSections.has(sectionKey);

    const detailsEl = el('details', { class: 'dsw-adv-section dsw-skills-section' });
    if (isOpen) detailsEl.open = true;

    detailsEl.addEventListener('toggle', () => {
      if (detailsEl.open) STATE.openSections.add(sectionKey);
      else STATE.openSections.delete(sectionKey);
    });

    const titleLeft = el('div', { class: 'dsw-adv-summary-left' },
      el('div', { class: 'dsw-adv-summary-title' }, 'Skills')
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

    const orderedSkills = [
      STATE.skills.find(x => x.key === 'basic') || {
        key: 'basic',
        name: 'Basic Attack',
        image: '',
        autoName: 'Basic Attack'
      },
      STATE.skills.find(x => x.key === 'core') || {
        key: 'core',
        name: 'Core Attack',
        image: '',
        autoName: 'Core Attack'
      },
      STATE.skills.find(x => x.key === 'third') || {
        key: 'third',
        name: '',
        image: '',
        autoName: 'Skill 3'
      }
    ];

    const body = el('div', { class: 'dsw-adv-body' },
      el('div', { class: 'dsw-skills-wrap' },
        el('div', { class: 'dsw-skills-list' },
          ...orderedSkills.map(renderSingleSkillCard)
        )
      )
    );

    detailsEl.append(summary, body);
    return detailsEl;
  }
  
  function renderDescriptionSections() {
    const wrap = el('div', { class: 'dsw-blocks' });
    const detailsMap = (STATE.details && STATE.details.details && typeof STATE.details.details === 'object')
      ? STATE.details.details
      : createEmptyDetailsMap();

    for (let i = 1; i <= ADV_MAX; i++) {
      const key = String(i);
      const savedSection = normalizeAdvancementDetails(detailsMap[key]);
      const blocks = Array.isArray(savedSection.blocks) ? savedSection.blocks : [];
      const rarityKey = currentRarityKey();
      const advBonusTexts = getGlobalAdvBonusTexts(rarityKey);
      const advBonusText = i >= 7 ? String(advBonusTexts[String(i - 6)] || '').trim() : '';
      const isEditing = canShowAdminButtons() && STATE.editingSection === key;
      const isOpen = isEditing || STATE.openSections.has(key);

      const detailsEl = el('details', { class: 'dsw-adv-section' });
      if (isOpen) detailsEl.open = true;

      detailsEl.addEventListener('toggle', () => {
        if (detailsEl.open) STATE.openSections.add(key);
        else STATE.openSections.delete(key);
      });

      const summaryRight = el('div', {
        class: 'dsw-row gap wrap',
        onclick: stopSummaryToggle,
        onmousedown: stopSummaryToggle,
        ondblclick: stopSummaryToggle
      });
      
      if (canShowAdminButtons()) {
        summaryRight.append(
          el('button', {
            type: 'button',
            class: `dsw-admin-btn ${isEditing ? 'active' : ''}`,
            onclick: (e) => {
              e.preventDefault();
              e.stopPropagation();
            
              if (isEditing) {
                clearDraftSection(key);
                STATE.editingSection = null;
              } else {
                STATE.editingSection = key;
                getDraftSection(key);
                STATE.openSections.add(key);
              }
              renderApp();
            }
          }, isEditing ? 'Close Edit' : 'Edit')
        );
      }
      
      const summary = el('summary', { class: 'dsw-adv-summary' },
        el('div', { class: 'dsw-adv-summary-left' },
          el('div', { class: 'dsw-adv-summary-title' }, advancementLabel(i))
        ),
        summaryRight
      );

      detailsEl.append(summary);

      const body = el('div', { class: 'dsw-adv-body' });

      if (isEditing) {
        const liveSection = getDraftSection(key);
        const shouldCollapseBlocks = areBlocksExpanded(key, liveSection.blocks);

        const editorSection = el('div', { class: 'dsw-editor-section dsw-adv-editor-box' },
          el('div', { class: 'dsw-row between wrap' },
            el('div', { class: 'dsw-subtitle' }, `Description editor - ${advancementLabel(i)}`),
            el('div', { class: 'dsw-row gap wrap' },
              el('button', {
                type: 'button',
                class: 'dsw-admin-btn',
                onclick: () => {
                  liveSection.blocks.push({ type: 'text', text: '' });
                  renderApp();
                }
              }, '+ Text'),
              el('button', {
                type: 'button',
                class: 'dsw-admin-btn',
                onclick: () => {
                  liveSection.blocks.push({ type: 'image', image: '', text: '' });
                  renderApp();
                }
              }, '+ Image'),
              el('button', {
                type: 'button',
                class: 'dsw-admin-btn ghost',
                disabled: !liveSection.blocks.length,
                onclick: () => {
                  setBlocksOpen(key, liveSection.blocks, !shouldCollapseBlocks);
                  renderApp();
                }
              }, shouldCollapseBlocks ? 'Collapse' : 'Expand')
            )
          )
        );

        const livePreview = renderBlocksLivePreview(liveSection.blocks);
        editorSection.append(livePreview);

        if (!liveSection.blocks.length) {
          editorSection.append(el('div', { class: 'dsw-muted' }, 'No blocks in this advancement yet.'));
        } else {
          liveSection.blocks.forEach((block, index) => {
            editorSection.append(renderBlockEditor(key, block, index, liveSection.blocks, () => {
              fillBlocksLivePreview(livePreview, liveSection.blocks);
            }));
          });
        }

        editorSection.append(
          el('div', { class: 'dsw-row gap end wrap dsw-editor-actions' },
            el('button', {
              type: 'button',
              class: 'dsw-admin-btn ghost',
              onclick: () => {
                clearDraftSection(key);
                STATE.editingSection = null;
                renderApp();
              }
            }, 'Cancel'),
            el('button', {
              type: 'button',
              class: 'dsw-admin-btn',
              onclick: async () => {
                try {
                  const payload = structuredClone(STATE.details || DEFAULT_DETAILS);
                  payload.details[key] = structuredClone(liveSection);
                  await saveDetailsPayload(payload);
                  clearDraftSection(key);
                  STATE.editingSection = null;
                  initOpenSections();
                  toast('Saved');
                  renderApp();
                } catch (e) {
                  console.error(e);
                  toast('Save failed');
                }
              }
            }, 'Save')
          )
        );

        body.append(editorSection);
      } else if (!blocks.length && !advBonusText) {
        body.append(
          el('div', { class: 'dsw-desc-group' },
            el('div', { class: 'dsw-muted' }, 'No description for this advancement.')
          )
        );
      } else {
        const group = el('div', { class: 'dsw-desc-group' });

        if (advBonusText) {
          const autoBox = el('div', { class: 'dsw-desc-row text-only dsw-auto-adv-text' });
          const autoText = el('div', { class: 'dsw-richtext' });
          autoText.innerHTML = formatRichText(advBonusText);
          autoBox.append(autoText);
          group.append(autoBox);
        }

        blocks.forEach((block) => {
          group.append(renderDescriptionBlockInline(block));
        });

        body.append(group);
      }

      detailsEl.append(body);
      wrap.append(detailsEl);
    }

    return wrap;
  }

  function renderTopInfo() {
    const details = currentRarityStats();

    const head = el('div', { class: 'dsw-head' },
      el('div', { class: 'dsw-head-main' },
        el('div', { class: 'dsw-title-row' },
          el('div', { class: 'dsw-title' }, STATE.weaponName || 'Sung Weapon'),
          el('div', { class: 'dsw-sub' },
            el('div', { class: 'dsw-badge only-img' },
              el('img', {
                src: rarityImg(STATE.weapon?.rarity),
                alt: STATE.weapon?.rarity || 'Rarity',
                loading: 'lazy'
              })
            ),
            el('div', { class: 'dsw-badge' },
              el('img', {
                src: elementImg(STATE.weapon?.element),
                alt: STATE.weapon?.element || 'Element',
                loading: 'lazy'
              }),
              STATE.weapon?.element || 'None'
            )
          )
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
      renderMini('Lv.', details.level || '0'),
      renderMini('Advancement', details.advancement || '—')
    );

    const statChildren = [
      renderStatBlock('Attack', String(details.attack || '—')),
      renderStatBlock('HP', String(details.hp || '—'))
    ];

    if (STATE.statMode === 'max') {
      statChildren.push(renderStatBlock('Precision', String(details.precision || '—')));
    }

    const stats = el('div', {
      class: 'dsw-stats',
      style: `grid-template-columns:repeat(${STATE.statMode === 'max' ? 3 : 2}, minmax(0,1fr));`
    }, ...statChildren);

    const info = el('div', { class: 'dsw-right' });
    info.append(head, meta, stats, renderTopCardActions());
    return info;
  }

  function renderWeaponImage() {
    const images = Array.isArray(STATE.skins) && STATE.skins.length
      ? STATE.skins
      : [weaponImgSrc(STATE.weapon)].filter(Boolean);

    const index = Math.max(0, Math.min(STATE.skinIndex || 0, Math.max(0, images.length - 1)));
    const src = images[index] || '';
    const slider = el('div', { class: 'dsw-slider' });

    if (!src) {
      slider.append(el('div', { class: 'dsw-muted' }, 'No weapon image'));
      return el('div', { class: 'dsw-left' }, slider);
    }

    const img = el('img', {
      class: 'dsw-main-skin',
      src,
      alt: STATE.weaponName || 'Weapon image',
      loading: 'lazy'
    });

    img.addEventListener('click', () => openLightbox(src, STATE.weaponName || 'Weapon image'));
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
        }, '↑'),
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
        }, '↓'),
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
          onclick: () => {
            insertBlockAfter(blocks, index, 'text');
            renderApp();
          }
        }, '+ Text'),
        el('button', {
          type: 'button',
          class: 'dsw-admin-btn',
          onclick: () => {
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
      const picSel = mkPictureSelect(`SGWeapon_Description_Pictures/${folder}`, currentRel);

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
    if (!canShowAdminButtons() || !STATE.globalEditMode) return null;

    const stats = structuredClone(STATE.globalStats || DEFAULT_GLOBAL_STATS);

    const panel = el('div', { class: 'dsw-card dsw-editor-card' },
      el('div', { class: 'dsw-section-title' }, 'Top card stats editor')
    );

    const levelMin = el('input', {
      type: 'number',
      class: 'dsw-admin-in',
      value: stats.levelMin ?? 1
    });

    const levelMax = el('input', {
      type: 'number',
      class: 'dsw-admin-in',
      value: stats.levelMax ?? 120
    });

    levelMin.addEventListener('input', () => {
      stats.levelMin = clampInt(levelMin.value, 1, 120, 1);
    });

    levelMax.addEventListener('input', () => {
      stats.levelMax = clampInt(levelMax.value, 1, 120, 120);
    });

    function rarityField(label, rarityKey, statKey, minVal, maxVal) {
      const minIn = el('input', {
        type: 'number',
        class: 'dsw-admin-in',
        value: stats.rarities?.[rarityKey]?.[statKey]?.min ?? minVal
      });

      const maxIn = el('input', {
        type: 'number',
        class: 'dsw-admin-in',
        value: stats.rarities?.[rarityKey]?.[statKey]?.max ?? maxVal
      });

      minIn.addEventListener('input', () => {
        stats.rarities[rarityKey][statKey].min = clampInt(minIn.value, 0, 999999, minVal);
      });

      maxIn.addEventListener('input', () => {
        stats.rarities[rarityKey][statKey].max = clampInt(maxIn.value, 0, 999999, maxVal);
      });

      return el('div', { class: 'dsw-rarity-edit-row' },
        el('div', { class: 'dsw-rarity-edit-label' }, label),
        minIn,
        maxIn
      );
    }

    function bonusTextField(rarityKey, idx) {
      const ta = el('textarea', {
        class: 'dsw-admin-ta',
        rows: 4,
        placeholder: `Text for ✦✦✦✦✦${idx}`
      }, String(stats.rarities?.[rarityKey]?.advBonusTexts?.[String(idx)] ?? ''));

      ta.addEventListener('input', () => {
        stats.rarities[rarityKey].advBonusTexts[String(idx)] = ta.value;
      });

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
            stats.rarities[rarityKey].advBonusTexts[String(idx)] = ta.value;
            ta.focus();
            ta.selectionStart = before.length + wrapped.length;
            ta.selectionEnd = ta.selectionStart;
          }
        }, btnCfg.label);
        palette.append(btn);
      });

      return el('div', { class: 'dsw-field' },
        el('span', { class: 'dsw-label' }, `✦✦✦✦✦${idx}`),
        ta,
        palette
      );
    }

    panel.append(
      el('div', { class: 'dsw-editor-section' },
        el('div', { class: 'dsw-subtitle' }, 'Top card min-max stats only'),
        el('div', { class: 'dsw-grid-2' },
          el('label', { class: 'dsw-field' },
            el('span', { class: 'dsw-label' }, 'Level min'),
            levelMin
          ),
          el('label', { class: 'dsw-field' },
            el('span', { class: 'dsw-label' }, 'Level max'),
            levelMax
          )
        )
      )
    );

    ['SSR', 'SR', 'R'].forEach((rarityKey) => {
      panel.append(
        el('div', { class: 'dsw-editor-section' },
          el('div', { class: 'dsw-subtitle' }, `${rarityKey} ranges`),
          rarityField('Attack', rarityKey, 'attack', DEFAULT_GLOBAL_STATS.rarities[rarityKey].attack.min, DEFAULT_GLOBAL_STATS.rarities[rarityKey].attack.max),
          rarityField('HP', rarityKey, 'hp', DEFAULT_GLOBAL_STATS.rarities[rarityKey].hp.min, DEFAULT_GLOBAL_STATS.rarities[rarityKey].hp.max),
          rarityField('Precision', rarityKey, 'precision', DEFAULT_GLOBAL_STATS.rarities[rarityKey].precision.min, DEFAULT_GLOBAL_STATS.rarities[rarityKey].precision.max),
          el('div', { class: 'dsw-subtitle dsw-subtitle-sm' }, `${rarityKey} auto text for ✦✦✦✦✦1-5`),
          el('div', { class: 'dsw-grid-1' },
            bonusTextField(rarityKey, 1),
            bonusTextField(rarityKey, 2),
            bonusTextField(rarityKey, 3),
            bonusTextField(rarityKey, 4),
            bonusTextField(rarityKey, 5)
          )
        )
      );
    });

    const actions = el('div', { class: 'dsw-row gap end wrap dsw-editor-actions' },
      el('button', {
        type: 'button',
        class: 'dsw-admin-btn ghost',
        onclick: async () => {
          await loadDetails();
          renderApp();
        }
      }, 'Reload'),
      el('button', {
        type: 'button',
        class: 'dsw-admin-btn',
        onclick: async () => {
          try {
            await saveGlobalStatsPayload(stats);
            initOpenSections();
            toast('Saved');
            renderApp();
          } catch (e) {
            console.error(e);
            toast('Save failed');
          }
        }
      }, 'Save')
    );

    panel.append(actions);
    return panel;
  }

  function getToggleSectionKeys() {
    const keys = [currentSkillsSectionKey()];

    for (let i = 1; i <= ADV_MAX; i++) {
      keys.push(String(i));
    }

    return keys;
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

    set.add('skills:min');
    set.add('skills:max');

    for (let i = 1; i <= ADV_MAX; i++) {
      set.add(String(i));
    }

    STATE.openSections = set;
    renderApp();
  }

  function collapseAllSections() {
    const set = new Set();

    if (STATE.editingSection) {
      set.add(String(STATE.editingSection));
    }

    if (isEditingAnySkill()) {
      set.add(currentSkillsSectionKey());
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
        el('div', { class: 'dsw-editor-title' }, 'Sung Weapons Details'),
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
      renderSkillsSection(),
      renderDescriptionSections()
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
      title: prevWeapon ? `Previous: ${prevWeapon.name}` : 'First weapon',
      disabled: !prevWeapon,
      onclick: () => { if (prevWeapon) navigateToWeapon(prevWeapon); }
    },
      el('i', { class: 'fa-solid fa-chevron-left' }),
      el('span', {}, prevWeapon ? prevWeapon.name : 'Previous')
    ));

    out.push(el('button', {
      class: 'dsw-btn back nav',
      type: 'button',
      title: nextWeapon ? `Next: ${nextWeapon.name}` : 'Last weapon',
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
      }, STATE.globalEditMode ? 'Hide Global Stats' : 'Global Stats'));
    }

    out.push(el('button', {
      class: 'dsw-btn back',
      type: 'button',
      onclick: () => {
        const target = url('/sjw-weapons');
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
    if (document.getElementById('details-sung-weapons-style')) return;

    const css = `
      .dsw-wrap{max-width:1280px;margin:0 auto;padding:20px;display:grid;gap:18px;color:#e5eefc}
      .dsw-card{border:1px solid rgba(148,163,184,.18);background:linear-gradient(180deg, rgba(15,23,42,.85), rgba(2,6,23,.85));border-radius:24px;box-shadow:0 18px 40px rgba(0,0,0,.25)}
      .dsw-top-wrap{overflow:hidden}
      .dsw-top{display:grid;grid-template-columns:380px 1fr;gap:20px;padding:20px}
      .dsw-top-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}
      .dsw-left,.dsw-right{min-width:0}
      .dsw-slider{position:relative;border-radius:24px;min-height:400px;overflow:hidden;background:linear-gradient(180deg, rgba(15,23,42,.95), rgba(30,41,59,.8));border:1px solid rgba(148,163,184,.16);display:grid;place-items:center}
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
      .dsw-sub{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-top:10px}
      .dsw-badge{height:34px;padding:0 12px;border-radius:999px;display:inline-flex;align-items:center;gap:8px;background:rgba(15,23,42,.65);border:1px solid rgba(148,163,184,.15);font-weight:900;color:#e2e8f0}
      .dsw-badge img{height:25px;width:auto;object-fit:contain}
      .dsw-badge.only-img{padding:0 10px}
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
      .dsw-section-title{font-size:22px;font-weight:900;color:#fff;margin-bottom:12px}
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
      .dsw-desc-group{padding:16px;border:1px solid rgba(255,255,255,.07);background:rgba(255,255,255,.03);border-radius:18px}
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
        .dsw-slider{min-height:220px;padding:12px;border-radius:18px}
        .dsw-main-skin{max-height:220px}
        .dsw-arrow{width:34px;height:34px}
        .dsw-arrow.left{left:8px}
        .dsw-arrow.right{right:8px}
        .dsw-arrow::before{width:9px;height:9px}
        .dsw-title{font-size:18px;line-height:1.15}
        .dsw-sub{gap:8px;margin-top:8px}
        .dsw-badge{height:30px;padding:0 10px;font-size:13px}
        .dsw-badge img{height:20px}
        .dsw-toggle{width:auto;padding:4px;border-radius:14px}
        .dsw-head > .dsw-toggle{align-self:flex-start}
        .dsw-adv-summary > .dsw-row{width:auto;flex:0 0 auto}
        .dsw-toggle button{flex:0 0 auto;min-width:64px;height:36px;padding:0 10px;font-size:14px;border-radius:10px}
        .dsw-inline-meta{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:10px}
        .dsw-stats{gap:10px;margin-top:12px}
        .dsw-stat,.dsw-mini{padding:12px 10px;border-radius:14px}
        .dsw-stat-label,.dsw-mini-label{font-size:11px}
        .dsw-stat-value,.dsw-mini-value{font-size:16px;margin-top:4px}
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
        padding:16px;
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

    document.head.append(el('style', { id: 'details-sung-weapons-style' }, css));
  }

  async function init(pathArg) {
    try {
      injectStyles();
      await loadWeapon(pathArg);
      await loadSkinsForWeapon();
      await loadDetails();
      await loadSkillsForWeapon();
      renderApp();
    } catch (e) {
      console.error(e);
      const app = qs('#content') || qs('#app') || document.body;
      app.innerHTML = '';
      app.append(el('div', {
        style: 'max-width:960px;margin:40px auto;padding:20px;border-radius:18px;background:#111827;color:#fff;border:1px solid rgba(255,255,255,.08)'
      },
        el('div', { style: 'font-size:24px;font-weight:900;margin-bottom:8px' }, 'Failed to load Sung Weapon details'),
        el('div', { style: 'color:#94a3b8' }, String(e?.message || e || 'Unknown error'))
      ));
    }
  }

  window.__details_sung_weapons_mount = async function __details_sung_weapons_mount(pathArg) {
    await init(pathArg);
  };

  function shouldAutoInit() {
    return String(location.pathname || '').includes('/sjw-weapons/');
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
