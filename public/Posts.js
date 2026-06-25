'use strict';

/**
 * Posts.js — News & Updates page (Netmarble + Website)
 * Exposes: window.__posts_mount(cleanPath)
 *
 * Routes:
 * - /posts                 -> list
 * - /posts/:slug           -> details
 */

(function () {
  const $ = (sel, root = document) => root.querySelector(sel);

  const POSTS_UI_FILTER_KEY = 'posts:selectedFilter:v1';
  const POSTS_FEED_UI_CACHE_KEY = 'posts:uiFeedCache:v1';
  const POSTS_DATA_CACHE_KEY = 'posts:dataCache:v1'; // legacy/stale fallback cache key
  const POSTS_COUNTS_CACHE_KEY = 'posts:countsCache:v1';
  const POSTS_LIST_SCROLL_KEY = 'posts:listScrollY:v1';

  // pagination state (saved per filter)
  const POSTS_UI_PAGE_KEY = 'posts:selectedPageByFilter:v1';
  const POSTS_PAGE_SIZE = 12;

  // page reset state (to prevent showing stale list data on back navigation after visiting details)
  const POSTS_PAGE_RESET_STATE_KEY = 'posts:pageResetState:v1';
  const POSTS_PAGE_RESET_TTL_MS = 24 * 60 * 60 * 1000;

  const FILTER_ORDER = ['all', 'notice', 'devnotes', 'updates', 'events', 'packages', 'cmnotes'];
  const FILTER_LABELS = {
    all: 'All Posts',
    notice: 'Notices',
    devnotes: 'Dev Notes',
    updates: 'Updates',
    events: 'Events',
    packages: 'Packages',
    cmnotes: 'CM Notes'
  };
  const MOBILE_FILTER_LABELS = {
    notice: 'Notice',
    devnotes: 'Developer Notes',
    updates: 'Updates',
    events: 'Events',
    packages: 'Package',
    cmnotes: 'CM Notes'
  };
  const FILTER_ICONS = {
    all: 'fa-table-cells',
    notice: 'fa-bullhorn',
    devnotes: 'fa-file-code',
    updates: 'fa-arrow-up',
    events: 'fa-calendar-days',
    packages: 'fa-gift',
    cmnotes: 'fa-comment'
  };

  let __postsAutoRefreshTimer = null;
  let __postsVisibilityListenerAdded = false;
  let __postsAdminCache = { value: null, ts: 0 };
  let __postsListAdminState = false;
  let __postsListCountsMem = null;
  let __postsLastListRouteToken = 0;
  let __postsMountToken = 0;
  let __postsListAbortController = null;
  const __postsListMemCache = new Map();

  function emptyPostCounts() {
    return {
      all: 0,
      notice: 0,
      devnotes: 0,
      updates: 0,
      events: 0,
      packages: 0,
      cmnotes: 0,
      website: 0
    };
  }

  function normalizePostCounts(input) {
    const base = emptyPostCounts();
    if (!input || typeof input !== 'object') return base;
    for (const k of Object.keys(base)) {
      const v = Number(input[k]);
      if (Number.isFinite(v) && v >= 0) base[k] = Math.floor(v);
    }
    return base;
  }

  function countsFromListResponse(data) {
    return normalizePostCounts(data?.meta?.counts);
  }

  function sanitizeFilter(value) {
    const v = String(value || 'all').trim().toLowerCase();
    return FILTER_ORDER.includes(v) ? v : 'all';
  }

  function getSavedFilter() {
    try {
      const v = localStorage.getItem(POSTS_UI_FILTER_KEY);
      return sanitizeFilter(v);
    } catch {
      return 'all';
    }
  }
  function setSavedFilter(v) {
    try { localStorage.setItem(POSTS_UI_FILTER_KEY, sanitizeFilter(v)); } catch {}
  }

  function getSavedPages() {
    try {
      const raw = localStorage.getItem(POSTS_UI_PAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return (parsed && typeof parsed === 'object') ? parsed : {};
    } catch {
      return {};
    }
  }
  function setSavedPage(filterKey, page) {
    try {
      const all = getSavedPages();
      all[sanitizeFilter(filterKey)] = Math.max(1, Number(page) || 1);
      localStorage.setItem(POSTS_UI_PAGE_KEY, JSON.stringify(all));
    } catch {}
  }
  function getSavedPage(filterKey) {
    try {
      const all = getSavedPages();
      const v = Number(all?.[sanitizeFilter(filterKey)]);
      return Number.isFinite(v) && v > 0 ? Math.floor(v) : 1;
    } catch {
      return 1;
    }
  }

  function getPageResetState() {
    try {
      const raw = localStorage.getItem(POSTS_PAGE_RESET_STATE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      return (parsed && typeof parsed === 'object') ? parsed : null;
    } catch {
      return null;
    }
  }

  function setPageResetState(state) {
    try {
      localStorage.setItem(POSTS_PAGE_RESET_STATE_KEY, JSON.stringify(state || {}));
    } catch {}
  }

  function buildFeedSignature(feed) {
    const first = Array.isArray(feed?.posts) && feed.posts.length ? feed.posts[0] : null;
    return {
      firstSlug: String(first?.slug || ''),
      total: Number(feed?.meta?.total || 0),
      savedAt: Date.now()
    };
  }

  function shouldResetPostsPage(filter, feed) {
    const prev = getPageResetState();
    const next = buildFeedSignature(feed);

    const safeFilter = sanitizeFilter(filter);
    if (!prev || !prev.byFilter || !prev.byFilter[safeFilter]) {
      return { reset: false, next };
    }

    const current = prev.byFilter[safeFilter];

    const expired = (Date.now() - Number(current.savedAt || 0)) >= POSTS_PAGE_RESET_TTL_MS;
    const newFirstPost = String(current.firstSlug || '') !== String(next.firstSlug || '');
    const totalChanged = Number(current.total || 0) !== Number(next.total || 0);

    return {
      reset: !!(expired || newFirstPost || totalChanged),
      next
    };
  }

  function savePostsPageResetState(filter, signature) {
    const prev = getPageResetState() || {};
    const byFilter = (prev.byFilter && typeof prev.byFilter === 'object') ? prev.byFilter : {};
    byFilter[sanitizeFilter(filter)] = signature;
    setPageResetState({ byFilter });
  }

  function getSavedListScrollY() {
    try {
      const v = Number(sessionStorage.getItem(POSTS_LIST_SCROLL_KEY) || '0');
      return Number.isFinite(v) && v >= 0 ? v : 0;
    } catch { return 0; }
  }
  function setSavedListScrollY(v) {
    try { sessionStorage.setItem(POSTS_LIST_SCROLL_KEY, String(Math.max(0, Number(v) || 0))); } catch {}
  }

  function getCountsCache() {
    try {
      const raw = sessionStorage.getItem(POSTS_COUNTS_CACHE_KEY) || localStorage.getItem(POSTS_COUNTS_CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return (parsed && typeof parsed === 'object') ? parsed : null;
    } catch { return null; }
  }
  function setCountsCache(obj) {
    try { sessionStorage.setItem(POSTS_COUNTS_CACHE_KEY, JSON.stringify(obj)); } catch {}
    try { localStorage.setItem(POSTS_COUNTS_CACHE_KEY, JSON.stringify(obj)); } catch {}
  }

  function _listCacheKey(page, pageSize, filter) {
    return `${sanitizeFilter(filter)}|${Math.max(1, Number(page) || 1)}|${Math.max(1, Number(pageSize) || POSTS_PAGE_SIZE)}`;
  }
  function getListMemCache(page, pageSize, filter) {
    const key = _listCacheKey(page, pageSize, filter);
    const hit = __postsListMemCache.get(key);
    if (!hit) return null;
    if ((Date.now() - (hit.ts || 0)) > 60 * 1000) {
      __postsListMemCache.delete(key);
      return null;
    }
    return hit.data || null;
  }
  function setListMemCache(page, pageSize, filter, data) {
    __postsListMemCache.set(_listCacheKey(page, pageSize, filter), { ts: Date.now(), data });
  }

  function getFallbackListMemCache(filter, pageSize = POSTS_PAGE_SIZE) {
    const safeFilter = sanitizeFilter(filter);
    const savedPageHit = getListMemCache(getSavedPage(safeFilter), pageSize, safeFilter);
    if (savedPageHit) return savedPageHit;

    const firstPageHit = getListMemCache(1, pageSize, safeFilter);
    if (firstPageHit) return firstPageHit;

    const prefix = `${safeFilter}|`;
    for (const [key, hit] of Array.from(__postsListMemCache.entries()).reverse()) {
      if (key.startsWith(prefix) && hit?.data && Array.isArray(hit.data.posts)) return hit.data;
    }
    return null;
  }



  function getUiFeedCache(filter = getSavedFilter(), page = getSavedPage(filter), pageSize = POSTS_PAGE_SIZE) {
    try {
      const raw = sessionStorage.getItem(POSTS_FEED_UI_CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.posts)) return null;
      const meta = parsed.meta || {};
      const safeFilter = sanitizeFilter(filter);
      const safePage = Math.max(1, Number(page) || 1);
      const safePageSize = Math.max(1, Number(pageSize) || POSTS_PAGE_SIZE);
      const cachedFilter = sanitizeFilter(meta.filter || 'all');
      const cachedPage = Math.max(1, Number(meta.page) || 1);
      const cachedPageSize = Math.max(1, Number(meta.pageSize) || safePageSize);
      if (cachedFilter !== safeFilter || cachedPage !== safePage || cachedPageSize !== safePageSize) return null;
      return parsed;
    } catch {
      return null;
    }
  }
  function setUiFeedCache(feed, filter = 'all', page = 1, pageSize = POSTS_PAGE_SIZE) {
    const safeFilter = sanitizeFilter(filter);
    const safePage = Math.max(1, Number(page) || 1);
    const safePageSize = Math.max(1, Number(pageSize) || POSTS_PAGE_SIZE);
    const normalized = (feed && typeof feed === 'object')
      ? { ...feed, meta: { ...(feed.meta || {}), filter: safeFilter, page: safePage, pageSize: safePageSize } }
      : feed;
    try { sessionStorage.setItem(POSTS_FEED_UI_CACHE_KEY, JSON.stringify(normalized)); } catch {}
    try { localStorage.setItem(POSTS_DATA_CACHE_KEY, JSON.stringify(normalized)); } catch {}
  }
  function getCachedDataAnyAge(key) {
    const k = String(key || '').trim();
    if (!k) return null;
    const tryParse = (raw) => {
      if (!raw) return null;
      try {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.posts)) return parsed;
        if (parsed && parsed.data && Array.isArray(parsed.data.posts)) return parsed.data;
      } catch {}
      return null;
    };
    try {
      const s = tryParse(sessionStorage.getItem(k));
      if (s) return s;
    } catch {}
    try {
      const l = tryParse(localStorage.getItem(k));
      if (l) return l;
    } catch {}
    return null;
  }


  function basePath() {
    const p = location.pathname || '';
    return (p === '/slahub' || p.startsWith('/slahub/')) ? '/slahub' : '';
  }
  function url(p) {
    const b = basePath();
    const path = p.startsWith('/') ? p : `/${p}`;
    return `${b}${path}`;
  }

  function postHref(slug) {
    return url(`/posts/${encodeURIComponent(slug)}`);
  }

  function listHrefWithPage(page) {
    const p = Math.max(1, Number(page) || 1);
    return url(`/posts?page=${p}`);
  }

  function getPageFromUrl() {
    try {
      const sp = new URLSearchParams(location.search || '');
      const p = Number(sp.get('page'));
      return Number.isFinite(p) && p > 0 ? Math.floor(p) : null;
    } catch {
      return null;
    }
  }

  function getFilterFromUrl() {
    try {
      const sp = new URLSearchParams(location.search || '');
      if (!sp.has('filter')) return null;
      return sanitizeFilter(sp.get('filter'));
    } catch {
      return null;
    }
  }

  function getActiveFilterFromState() {
    const fromUrl = getFilterFromUrl();
    const filter = fromUrl || getSavedFilter();
    const safeFilter = sanitizeFilter(filter);
    setSavedFilter(safeFilter);
    return safeFilter;
  }

  function setPageInUrl(page) {
    try {
      const p = Math.max(1, Number(page) || 1);
      const u = new URL(location.href);
      u.searchParams.set('page', String(p));
      history.replaceState(history.state, '', u.toString());
    } catch {}
  }

  function onInternalLinkClick(e, path) {
    // allow new tab via middle click / ctrl/cmd/shift/alt
    if (
      e.defaultPrevented ||
      e.button !== 0 ||
      e.metaKey || e.ctrlKey || e.shiftKey || e.altKey
    ) return;
    e.preventDefault();

    const targetPath = String(path || '');
    const isPostDetailTarget = targetPath.startsWith('/posts/');

    if (isPostDetailTarget) {
      setSavedListScrollY(window.scrollY || 0);

      // prevent pending list responses from repainting old /posts view during route transition
      try { __postsLastListRouteToken++; } catch {}
      try {
        if (__postsListAbortController) __postsListAbortController.abort();
      } catch {}

      // visual feedback immediately (before routeTo/mount async flow finishes)
      try { renderLoading(); } catch {}
    }

    navigateTo(targetPath);
  }

  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null) continue;
      if (k === 'class') node.className = v;
      else if (k === 'style') node.setAttribute('style', v);
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
      else if (typeof v === 'boolean') { if (v) node.setAttribute(k, ''); }
      else node.setAttribute(k, String(v));
    }
    for (const ch of children) {
      if (ch == null) continue;
      node.append(ch instanceof Node ? ch : document.createTextNode(String(ch)));
    }
    return node;
  }

  function escapeHtml(s) {
    return String(s ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function stripTagsClient(html) {
    return String(html || '')
      .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<\/div>/gi, '\n')
      .replace(/<li[^>]*>/gi, '• ')
      .replace(/<\/li>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#039;/gi, "'")
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]{2,}/g, ' ')
      .trim();
  }

  function decodeHtmlEntities(text) {
    const str = String(text ?? '');
    if (!str) return '';
    const t = document.createElement('textarea');
    t.innerHTML = str;
    return t.value;
  }

  function normalizePostTitle(title) {
    const raw = String(title ?? '').trim();
    if (!raw) return '';
    const decoded = decodeHtmlEntities(raw).trim();
    if (!decoded) return raw;

    const parts = raw.split(' - ').map(x => x.trim()).filter(Boolean);
    if (parts.length === 2) {
      const [a, b] = parts;
      const da = decodeHtmlEntities(a).trim();
      const db = decodeHtmlEntities(b).trim();
      if (da && db && da === db) return da;
    }

    return decoded;
  }

  function isPostNew(post, hours = 24) {
    const d = new Date(post?.publishedAt || post?.createdAt || 0);
    if (Number.isNaN(d.getTime())) return false;
    return (Date.now() - d.getTime()) <= (hours * 60 * 60 * 1000);
  }

  function cmNotesImagePath() {
    return url('/picture/CMNotes.gif');
  }

  function cmNotesExternalGifUrl() {
    return 'https://hedwig-cf.netmarble.com/forum-common/sololv/slv_en/3663655500a74125a495a85f569cc771_1715329932585.gif';
  }

  function isCmNotesPost(post) {
    const cat = String(post?.categoryKey || post?.category || '').toLowerCase().trim();
    return cat === 'cmnotes' || cat === 'cm notes';
  }

  function applyCmNotesGifFallback(imgEl, post) {
    if (!(imgEl instanceof HTMLImageElement)) return imgEl;
    if (!isCmNotesPost(post)) return imgEl;

    const external = cmNotesExternalGifUrl();
    const fallback = cmNotesImagePath();

    imgEl.onerror = () => {
      if (imgEl.dataset.cmnotesFallbackTried === '1') {
        imgEl.onerror = null;
        return;
      }
      imgEl.dataset.cmnotesFallbackTried = '1';
      imgEl.onerror = null;
      imgEl.src = fallback;
    };

    imgEl.src = external;
    return imgEl;
  }

  function cmNotesBodyIsMediaOnly(post) {
    if (!isCmNotesPost(post)) return false;

    const html = String(post?.contentHtml || '').trim();
    const hasYoutubeEmbeds = Array.isArray(post?.youtubeEmbeds) && post.youtubeEmbeds.some(Boolean);
    if (!html && !hasYoutubeEmbeds) return false;

    const tmp = document.createElement('div');
    tmp.innerHTML = html;

    const text = String(tmp.textContent || '')
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const hasImages = !!tmp.querySelector('img[src]');
    const hasIframes = !!tmp.querySelector('iframe[src]');
    const hasVideos = !!tmp.querySelector('video');
    const hasMovieArea = !!tmp.querySelector('.movie_area');
    const hasMedia = hasImages || hasIframes || hasVideos || hasMovieArea || hasYoutubeEmbeds;

    return hasMedia && !text;
  }

  function getPostPrimaryImage(post, { forCard = false } = {}) {
    const cat = String(post?.categoryKey || post?.category || '').toLowerCase().trim();
    const first = (Array.isArray(post?.images) && post.images.length) ? String(post.images[0] || '').trim() : '';

    if (cat === 'cmnotes' || cat === 'cm notes') {
      if (forCard) return cmNotesExternalGifUrl();
      return cmNotesBodyIsMediaOnly(post) ? cmNotesExternalGifUrl() : '';
    }

    if (first) return first;

    if (forCard && String(post?.source || '').toLowerCase() === 'netmarble' && (cat === 'devnotes' || cat === 'developer notes')) {
      return cmNotesImagePath(); // subtle fallback if no image (better than broken/empty tile)
    }

    return '';
  }

  function getContentImageStats(html) {
    const raw = String(html || '').trim();
    if (!raw) return { count: 0, first: '', unique: [] };

    const tmp = document.createElement('div');
    tmp.innerHTML = raw;

    const normalizeUrl = (u) => {
      try {
        const x = new URL(String(u || '').trim(), location.origin);
        x.hash = '';
        return x.toString();
      } catch {
        return String(u || '').trim();
      }
    };

    const unique = [];
    const seen = new Set();

    Array.from(tmp.querySelectorAll('img[src]')).forEach((img) => {
      const src = normalizeUrl(img.getAttribute('src'));
      if (!src || seen.has(src)) return;
      seen.add(src);
      unique.push(src);
    });

    return {
      count: unique.length,
      first: unique[0] || '',
      unique
    };
  }

  function isGifLikeImageUrl(url) {
    const raw = String(url || '').trim();
    if (!raw) return false;

    try {
      const parsed = new URL(raw, location.origin);
      const pathname = (parsed.pathname || '').toLowerCase();
      const search = (parsed.search || '').toLowerCase();
      const href = parsed.toString().toLowerCase();
      return pathname.endsWith('.gif') || /[?&](?:format|fm)=gif(?:&|$)/i.test(search) || href.includes('.gif?');
    } catch {
      const lower = raw.toLowerCase();
      return lower.endsWith('.gif') || lower.includes('.gif?') || /[?&](?:format|fm)=gif(?:&|$)/i.test(lower);
    }
  }

  function shouldRenderStandaloneHero(post, heroUrl) {
    const html = String(post?.contentHtml || '').trim();
    if (!heroUrl || !html) return !!heroUrl;
    if (isGifLikeImageUrl(heroUrl)) return true;

    const normalizeUrl = (u) => {
      try {
        const x = new URL(String(u || '').trim(), location.origin);
        x.hash = '';
        return x.toString();
      } catch {
        return String(u || '').trim();
      }
    };

    const stats = getContentImageStats(html);
    const normalizedHero = normalizeUrl(heroUrl);

    if (stats.count === 1 && stats.first === normalizedHero) {
      return false;
    }

    return true;
  }

  function fmtDate(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return String(dateStr);
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function fmtRelative(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return '';
    const diff = Date.now() - d.getTime();
    const sec = Math.floor(diff / 1000);
    if (sec < 60) return `${sec}s ago`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    const day = Math.floor(hr / 24);
    if (day < 30) return `${day}d ago`;
    return fmtDate(dateStr);
  }

  function categoryMeta(cat) {
    const c = String(cat || '').toLowerCase();
    const map = {
      notice:   { label: 'Notice', chip: 'bg-yellow-400 text-black', icon: 'fa-bullhorn' },
      notices:  { label: 'Notice', chip: 'bg-yellow-400 text-black', icon: 'fa-bullhorn' },
      updates:  { label: 'Updates', chip: 'text-white', icon: 'fa-arrow-up', style: 'background: rgb(13 110 253);' },
      'developer notes': { label: 'Developer Notes', chip: 'bg-cyan-400 text-slate-900', icon: 'fa-file-code' },
      devnotes: { label: 'Developer Notes', chip: 'bg-cyan-400 text-slate-900', icon: 'fa-file-code' },
      events:   { label: 'Events', chip: 'bg-fuchsia-400 text-slate-900', icon: 'fa-calendar-days' },
      packages: { label: 'Package', chip: 'bg-emerald-400 text-slate-900', icon: 'fa-box' },
      cmnotes: { label: 'CM Notes', chip: 'bg-purple-400 text-slate-900', icon: 'fa-comment' },
      'cm notes': { label: 'CM Notes', chip: 'bg-purple-400 text-slate-900', icon: 'fa-comment' },
      website:  { label: 'Web Update', chip: 'bg-slate-400 text-slate-900', icon: 'fa-code' }
    };
    return map[c] || { label: cat || 'Post', chip: 'bg-slate-400 text-slate-900', icon: 'fa-newspaper' };
  }

  function sourceMeta(src) {
    if (String(src || '').toLowerCase() === 'netmarble') {
      return {
        label: 'Netmarble',
        icon: 'fa-link',
        cls: 'text-white border border-slate-500/60',
        style: 'background: rgba(51,65,85,.92);'
      };
    }
    return {
      label: 'Website',
      icon: 'fa-globe',
      cls: 'text-white border border-slate-500/60',
      style: 'background: rgba(30,41,59,.9);'
    };
  }

  async function fetchJson(u, opt) {
    const r = await fetch(u, { credentials: 'include', cache: 'no-store', ...(opt || {}) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
    return j;
  }

  function getContentHost() {
    return document.getElementById('content');
  }

  function ensureCss() {
    if (document.getElementById('posts-page-css')) return;
    const s = document.createElement('style');
    s.id = 'posts-page-css';
    s.textContent = `
      #content [data-sla-page="posts"] .posts-hero-title{
        font-family: Georgia, "Times New Roman", serif;
        letter-spacing: .02em;
      }

      #content [data-sla-page="posts"] .posts-card{
        transition: transform .18s ease, border-color .18s ease, box-shadow .18s ease;
      }
      #content [data-sla-page="posts"] .posts-card:hover{
        transform: translateY(-4px);
        border-color: rgba(148,163,184,.45);
        box-shadow: 0 14px 36px rgba(0,0,0,.35);
      }

      #content [data-sla-page="posts"] .posts-clamp-4{
        display:-webkit-box;
        -webkit-line-clamp:4;
        -webkit-box-orient:vertical;
        overflow:hidden;
      }

      #content [data-sla-page="posts"] .posts-card-cover{
        width: 100%;
        height: 120px;
        object-fit: contain;
        object-position: center;
        border-radius: .75rem;
        border: 1px solid rgba(148,163,184,.22);
        background: rgba(2,6,23,.35);
        padding: .25rem;
      }

      #content [data-sla-page="posts"] .posts-embed-wrap{
        position: relative;
        width: 100%;
        aspect-ratio: 16 / 9;
        margin: .75rem 0;
        border-radius: .9rem;
        overflow: hidden;
        border:1px solid rgba(148,163,184,.2);
        background: rgba(2,6,23,.45);
      }
      #content [data-sla-page="posts"] .posts-embed-wrap iframe,
      #content [data-sla-page="posts"] .posts-embed-wrap video{
        position:absolute; inset:0; width:100%; height:100%; border:0;
      }

      #content [data-sla-page="posts"] .posts-prose{
        overflow-wrap: anywhere;
        color: rgb(226 232 240) !important;
      }

      #content [data-sla-page="posts"] .posts-prose *{
        box-shadow: none !important;
      }
      #content [data-sla-page="posts"] .posts-prose span,
      #content [data-sla-page="posts"] .posts-prose p,
      #content [data-sla-page="posts"] .posts-prose div,
      #content [data-sla-page="posts"] .posts-prose li{
        background: transparent !important;
      }

      #content [data-sla-page="posts"] .posts-prose p{
        margin: 0;
        line-height: 1.8;
      }

      #content [data-sla-page="posts"] .posts-prose p.posts-spacer-sm{ margin: 0 0 .25rem 0; line-height: 1; }
      #content [data-sla-page="posts"] .posts-prose p.posts-spacer-md{ margin: 0 0 .45rem 0; line-height: 1; }
      #content [data-sla-page="posts"] .posts-prose p.posts-spacer-lg{ margin: 0 0 .7rem 0; line-height: 1; }

      #content [data-sla-page="posts"] .posts-prose ul{
        margin: .15rem 0 .55rem 1.15rem;
        padding-left: .3rem;
        list-style: disc;
      }
      #content [data-sla-page="posts"] .posts-prose ol{
        margin: .15rem 0 .55rem 1.15rem;
        padding-left: .3rem;
        list-style: decimal;
      }
      #content [data-sla-page="posts"] .posts-prose li{
        margin: .15rem 0;
        line-height: 1.6;
      }
      #content [data-sla-page="posts"] .posts-prose li p{
        margin: 0;
      }

      #content [data-sla-page="posts"] .posts-prose a{
        color: #60a5fa !important;
        text-decoration: underline;
      }

      #content [data-sla-page="posts"] .posts-prose img{
        display:block;
        margin: .65rem auto;
        border-radius: .75rem;
        border:1px solid rgba(148,163,184,.2);
        background: transparent !important;

        width: auto !important;
        max-width: 100% !important;
        height: auto !important;
        max-height: none !important;
        object-fit: contain !important;
      }

      #content [data-sla-page="posts"] .posts-survey-fallback{
        box-shadow: 0 10px 30px rgba(0,0,0,.22);
      }

      #content [data-sla-page="posts"] .posts-prose img[src=""],
      #content [data-sla-page="posts"] .posts-prose img[width="1"],
      #content [data-sla-page="posts"] .posts-prose img[height="1"]{
        display:none !important;
      }

      #content [data-sla-page="posts"] .posts-prose .posts-purple-heading{
        color: #b026ff !important;
        font-weight: 800 !important;
        font-size: 1.22em !important;
        line-height: 1.35 !important;
        margin-top: .2rem !important;
        margin-bottom: .25rem !important;
        display: inline-block;
      }

      #content [data-sla-page="posts"] .posts-prose .posts-pin-heading{
        color: #ff4fb8 !important;
        font-weight: 800 !important;
        font-size: 1.02em !important;
        line-height: 1.35 !important;
        display: inline-block;
        margin-top: .1rem !important;
        margin-bottom: .1rem !important;
      }

      #content [data-sla-page="posts"] .posts-table-wrap{
        margin: .7rem 0 .9rem;
        overflow:auto;
        border:1px solid rgba(148,163,184,.24);
        border-radius: 12px;
        background: rgba(2,6,23,.35);
      }
      #content [data-sla-page="posts"] .posts-prose table{
        width:100%;
        border-collapse: collapse;
        margin: 0 !important;
        display: table;
        table-layout: fixed;
        min-width: 0;
        background: transparent;
      }
      #content [data-sla-page="posts"] .posts-prose thead th{
        background: linear-gradient(180deg, rgba(168,85,247,.95), rgba(126,34,206,.9)) !important;
        color: #fff !important;
        font-weight: 800;
        text-align: center;
        padding: .7rem .75rem;
        border: 1px solid rgba(255,255,255,.08);
        white-space: normal !important;
        word-break: break-word;
        overflow-wrap: anywhere;
      }
      #content [data-sla-page="posts"] .posts-prose thead td{
        background: linear-gradient(180deg, rgba(168,85,247,.95), rgba(126,34,206,.9)) !important;
        color: #fff !important;
        font-weight: 800;
        text-align: center;
        padding: .7rem .75rem;
        border: 1px solid rgba(255,255,255,.08);
        white-space: normal !important;
        word-break: break-word;
        overflow-wrap: anywhere;
      }
      #content [data-sla-page="posts"] .posts-prose tbody td{
        color: rgb(226 232 240) !important;
        padding: .65rem .75rem;
        border: 1px solid rgba(148,163,184,.14);
        background: transparent !important;
        vertical-align: middle;
        white-space: normal !important;
        word-break: break-word;
        overflow-wrap: anywhere;
      }
      #content [data-sla-page="posts"] .posts-prose tbody tr:nth-child(odd) td{
        background: rgba(255,255,255,.01) !important;
      }
      #content [data-sla-page="posts"] .posts-prose td > p[align="center"],
      #content [data-sla-page="posts"] .posts-prose td > div[align="center"]{
        text-align:center;
      }

      #content [data-sla-page="posts"] .posts-prose td img.posts-table-image{
        display: block;
        margin-left: auto !important;
        margin-right: auto !important;
        width: auto !important;
        max-width: min(100%, 520px) !important;
        height: auto !important;
        max-height: 620px !important;
        object-fit: contain !important;
      }

      #content [data-sla-page="posts"] .posts-prose hr{
        border:none;
        height:1px;
        background: linear-gradient(90deg, transparent, rgba(168,85,247,.6), transparent);
        margin: .75rem 0;
      }

      #content [data-sla-page="posts"] .posts-prose [align="center"]{
        text-align:center;
      }

      #content [data-sla-page="posts"] .posts-latest-box{
        max-height: calc(100vh - 220px);
        overflow: auto;
        padding-right: 4px;
      }
      #content [data-sla-page="posts"] .posts-latest-box::-webkit-scrollbar{
        width: 8px;
      }
      #content [data-sla-page="posts"] .posts-latest-box::-webkit-scrollbar-thumb{
        background: rgba(148,163,184,.25);
        border-radius: 999px;
      }

      #content [data-sla-page="posts"].posts-filter-pending #postsCardsWrap{
        opacity: .62;
        pointer-events: none;
        transition: opacity .18s ease;
      }
      #content [data-sla-page="posts"] #postsFiltersWrap.is-pending{
        pointer-events: none;
      }
      #content [data-sla-page="posts"] #postsFiltersWrap.is-pending .posts-filter-btn{
        opacity: .68;
      }
      #content [data-sla-page="posts"] .posts-mobile-filter-entry{
        display: none;
      }
      #content [data-sla-page="posts"] .posts-desktop-filters{
        display: none !important;
      }
      #content [data-sla-page="posts"] .posts-filter-modal{
        position: fixed;
        inset: 0;
        z-index: 80;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: .75rem;
        background: rgba(2,6,23,.66);
        backdrop-filter: blur(8px);
      }
      #content [data-sla-page="posts"] .posts-filter-sheet{
        width: min(100%, 420px);
        max-height: min(78vh, 560px);
        overflow: auto;
        border: 1px solid rgba(148,163,184,.28);
        border-radius: 1.25rem;
        background: rgba(15,23,42,.98);
        box-shadow: 0 24px 60px rgba(0,0,0,.5);
      }
      #content [data-sla-page="posts"] .posts-filter-option{
        min-height: 48px;
      }
      #content [data-sla-page="posts"] .posts-filter-sheet-head{
        min-height: 36px;
        display: flex;
        align-items: center;
      }
      #content [data-sla-page="posts"] .posts-filter-sheet-title{
        min-height: 36px;
        display: inline-flex;
        align-items: center;
        line-height: 1;
      }



      /* Detail page custom desktop/mobile breakpoints (aligned closer to Hunter.js) */
      @media (max-width: 849px){
        #content [data-sla-page="posts"] .posts-desktop-filters{
          display: none !important;
        }
        #content [data-sla-page="posts"] .posts-mobile-filter-entry{
          display: block;
        }
        #content [data-sla-page="posts"] .posts-detail-mobile-top{ display:block !important; }
        #content [data-sla-page="posts"] .posts-detail-layout{
          display:grid !important;
          grid-template-columns: minmax(0,1fr) !important;
          gap: 1rem !important;
        }
        #content [data-sla-page="posts"] .posts-detail-aside{
          order: 1 !important;
          position: static !important;
          top: auto !important;
          border-radius: 1rem !important;
          padding: .75rem !important;
        }
        #content [data-sla-page="posts"] .posts-detail-article{
          order: 2 !important;
          border-radius: 1rem !important;
          padding: 1rem !important;
        }
        #content [data-sla-page="posts"] .posts-detail-desktop-back{ display:none !important; }
      }

      #content [data-sla-page="posts"] #postsFiltersWrap .posts-desktop-filters{
        display: none !important;
        grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
        gap: .5rem !important;
        width: 100%;
      }

      @media (min-width: 850px){
        #content [data-sla-page="posts"] #postsFiltersWrap .posts-desktop-filters{
          display: grid !important;
          grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
        }
      }

      @media (min-width: 1280px){
        #content [data-sla-page="posts"] #postsFiltersWrap .posts-desktop-filters{
          grid-template-columns: repeat(7, minmax(0, 1fr)) !important;
        }
      }

      @media (min-width: 850px){
        #content [data-sla-page="posts"] .posts-filter-modal,
        #content [data-sla-page="posts"] .posts-mobile-filter-entry{
          display: none !important;
        }
        #content [data-sla-page="posts"] .posts-desktop-filters{
          display: grid !important;
        }
        #content [data-sla-page="posts"] .posts-detail-mobile-top{ display:none !important; }
        #content [data-sla-page="posts"] .posts-detail-layout{
          display:grid !important;
          grid-template-columns: 260px minmax(0,1fr) !important;
          gap: 1.25rem !important;
        }
        #content [data-sla-page="posts"] .posts-detail-aside{
          order: 1 !important;
          position: sticky !important;
          top: 6rem !important;
          border-radius: 1.25rem !important;
          padding: 1rem !important;
          align-self: start !important;
        }
        #content [data-sla-page="posts"] .posts-detail-article{
          order: 2 !important;
          border-radius: 1.25rem !important;
          padding: 1.5rem !important;
        }
        #content [data-sla-page="posts"] .posts-detail-desktop-back{ display:flex !important; }
      }

      @media (max-width: 849px){
        #content [data-sla-page="posts"] .posts-filter-btn{
          min-height: 42px;
        }

        #content [data-sla-page="posts"] .posts-card{
          border-radius: 1rem;
          padding: .85rem;
        }

        #content [data-sla-page="posts"] .posts-card-cover{
          height: 100px;
        }

        #content [data-sla-page="posts"] .posts-latest-box{
          max-height: 220px;
        }

        #content [data-sla-page="posts"] .posts-prose{
          font-size: 15.5px !important;
          line-height: 1.65 !important;
        }
      }

      @media (max-width: 720px){
        #content [data-sla-page="posts"] .posts-filter-btn{
          width: 100%;
          padding-left: .5rem;
          padding-right: .5rem;
        }

        #content [data-sla-page="posts"] #postsPaginationWrap .inline-flex{
          flex-wrap: wrap;
          justify-content: center;
          overflow: visible;
          gap: .35rem;
          box-shadow: none !important;
        }

        #content [data-sla-page="posts"] #postsPaginationWrap a{
          border-radius: .65rem !important;
          border-left: 1px solid rgba(71,85,105,.6) !important;
          min-width: 38px;
          height: 38px;
          padding: 0 .6rem;
        }
      }

      /* =========================
         MOBILE TWEAKS
         ========================= */
      @media (max-width: 639px){
        #content [data-sla-page="posts"] .posts-card-cover{
          height: 88px;
          border-radius: .65rem;
        }

        #content [data-sla-page="posts"] .posts-card{
          border-radius: 1rem;
        }

        #content [data-sla-page="posts"] .posts-latest-box{
          max-height: 180px;
          padding-right: 2px;
        }

        #content [data-sla-page="posts"] .posts-table-wrap{
          margin: .5rem 0 .75rem;
          border-radius: 10px;
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
        }

        #content [data-sla-page="posts"] .posts-prose table{
          min-width: 0 !important;
          width: 100% !important;
          table-layout: fixed;
          font-size: 12px;
        }

        #content [data-sla-page="posts"] .posts-prose thead th,
        #content [data-sla-page="posts"] .posts-prose tbody td{
          padding: .38rem .35rem !important;
          white-space: normal !important;
          word-break: break-word;
          overflow-wrap: anywhere;
          line-height: 1.25;
        }

        #content [data-sla-page="posts"] .posts-prose{
          font-size: 15px !important;
          line-height: 1.6 !important;
        }

        #content [data-sla-page="posts"] .posts-prose p{
          line-height: 1.6;
        }

        #content [data-sla-page="posts"] .posts-card .text-lg{
          font-size: 1rem !important;
          line-height: 1.35 !important;
        }

        #content [data-sla-page="posts"] .posts-prose td img.posts-table-image{
          max-width: min(100%, 210px) !important;
          max-height: 300px !important;
        }

        #content [data-sla-page="posts"] .posts-prose img{
          border-radius: .6rem !important;
        }
      }
    `;
    document.head.appendChild(s);
  }

  function parseRoute(cleanPath) {
    const p = String(cleanPath || '/').replace(/\/+$/, '') || '/';
    if (p === '/posts') return { mode: 'list', slug: null };
    const m = p.match(/^\/posts\/([^/]+)$/);
    if (m) return { mode: 'detail', slug: decodeURIComponent(m[1]) };
    return { mode: 'inactive', slug: null };
  }

  function navigateTo(path) {
    if (typeof window.routeTo === 'function') return window.routeTo(path);
    location.href = url(path);
  }

  function renderLoading() {
    const host = getContentHost();
    if (!host) return;
    host.innerHTML = `
      <div data-sla-page="posts" class="max-w-7xl mx-auto text-slate-100">
        <div class="rounded-2xl border border-slate-700/50 bg-glass p-6">
          <div class="animate-pulse text-slate-300">Loading posts...</div>
        </div>
      </div>
    `;
  }

  function renderError(err) {
    const host = getContentHost();
    if (!host) return;
    host.innerHTML = `
      <div data-sla-page="posts" class="max-w-4xl mx-auto text-slate-100">
        <div class="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-6">
          <div class="text-lg font-extrabold mb-2">Failed to load Posts</div>
          <div class="text-slate-200/90">${escapeHtml(String(err?.message || err || 'Unknown error'))}</div>
        </div>
      </div>
    `;
  }


function renderFilterTabs(postsOrCounts, selected, onChange, opts = {}) {
  const counts = {
    all: 0, notice: 0, devnotes: 0, updates: 0, events: 0, packages: 0, cmnotes: 0, website: 0
  };

  if (Array.isArray(postsOrCounts)) {
    counts.all = postsOrCounts.length;
    for (const p of postsOrCounts) {
      const c = String(p?.categoryKey || '').toLowerCase();
      if (c in counts) counts[c]++;
    }
  } else if (postsOrCounts && typeof postsOrCounts === 'object') {
    for (const k of Object.keys(counts)) {
      const v = Number(postsOrCounts[k]);
      if (Number.isFinite(v) && v >= 0) counts[k] = Math.floor(v);
    }
  }

  const safeSelected = sanitizeFilter(selected);
  const isPending = !!opts.isPending;
  const pendingFilter = sanitizeFilter(opts.pendingFilter || safeSelected);
  const modalOpen = !!opts.mobileOpen;
  const tabs = FILTER_ORDER.map(key => [key, FILTER_LABELS[key] || key, FILTER_ICONS[key] || 'fa-newspaper']);
  const mobileFilterText = safeSelected === 'all'
    ? 'Filter: All'
    : `Category: ${MOBILE_FILTER_LABELS[safeSelected] || FILTER_LABELS[safeSelected] || safeSelected}`;

  const btnClass = (active) => [
    'rounded-xl border text-sm font-semibold transition-colors',
    'h-10 sm:h-11 px-2 sm:px-3',
    'inline-flex w-full items-center justify-center gap-2',
    'posts-filter-btn',
    active
      ? 'bg-yellow-400 text-black shadow border-yellow-300'
      : 'bg-glass text-slate-200 hover:bg-slate-800/50 border-slate-700/60',
    isPending ? 'cursor-wait' : ''
  ].join(' ');

  const countClass = (active) => [
    'hidden sm:inline-flex',
    'ml-1 px-2 py-0.5 rounded-md text-[11px] leading-none font-extrabold',
    active ? 'bg-black/15 text-black' : 'bg-slate-700/70 text-slate-100'
  ].join(' ');

  const choose = (key) => {
    if (isPending) return;
    const safe = sanitizeFilter(key);
    if (typeof opts.closeMobile === 'function') opts.closeMobile();
    onChange(safe);
  };

  const desktop = el('div', {
    class: 'posts-desktop-filters grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 items-stretch gap-2 mb-1 w-full'
  },
    ...tabs.map(([key, label, icon]) => {
      const active = safeSelected === key;
      return el('button', {
        type: 'button',
        class: btnClass(active),
        disabled: isPending,
        'aria-pressed': active ? 'true' : 'false',
        onclick: () => choose(key),
        title: `${label} (${counts[key] ?? 0})`
      },
        el('i', { class: `fa-solid ${icon} text-sm shrink-0` }),
        el('span', { class: 'hidden sm:inline whitespace-nowrap' }, label),
        isPending && pendingFilter === key ? el('i', { class: 'fa-solid fa-spinner fa-spin text-xs' }) : null,
        el('span', { class: countClass(active) }, String(counts[key] ?? 0))
      );
    })
  );

  const mobileButton = el('div', { class: 'posts-mobile-filter-entry mb-1' },
    el('button', {
      type: 'button',
      class: [
        'posts-filter-btn w-full h-12 rounded-xl border border-slate-700/60 bg-glass text-slate-100',
        'font-extrabold inline-flex items-center justify-between gap-3 px-4',
        isPending ? 'opacity-70 cursor-wait' : 'hover:bg-slate-800/50'
      ].join(' '),
      disabled: isPending,
      onclick: () => {
        if (isPending) return;
        if (typeof opts.openMobile === 'function') opts.openMobile();
      }
    },
        el('span', { class: 'inline-flex items-center gap-2 min-w-0' },
          el('i', { class: 'fa-solid fa-filter text-yellow-300' }),
        el('span', { class: 'truncate' }, mobileFilterText)
      ),
      isPending
        ? el('i', { class: 'fa-solid fa-spinner fa-spin text-slate-300' })
        : el('i', { class: 'fa-solid fa-chevron-up text-slate-300' })
    )
  );

  const modal = modalOpen ? el('div', {
    class: 'posts-filter-modal',
    role: 'dialog',
    'aria-modal': 'true',
    onclick: (e) => {
      if (e.target === e.currentTarget && typeof opts.closeMobile === 'function') opts.closeMobile();
    }
  },
    el('div', { class: 'posts-filter-sheet p-3' },
      el('div', { class: 'posts-filter-sheet-head flex items-center justify-between gap-3 px-1 py-2 mb-2' },
        el('div', { class: 'posts-filter-sheet-title font-extrabold text-white inline-flex items-center gap-2' },
          el('i', { class: 'fa-solid fa-filter text-yellow-300' }),
          'Choose filter'
        ),
        el('button', {
          type: 'button',
          class: 'h-9 w-9 rounded-lg border border-slate-700/60 bg-slate-800/70 text-slate-100 hover:bg-slate-700/80 inline-flex items-center justify-center',
          onclick: () => { if (typeof opts.closeMobile === 'function') opts.closeMobile(); },
          'aria-label': 'Close filters'
        }, el('i', { class: 'fa-solid fa-xmark' }))
      ),
      el('div', { class: 'space-y-2' },
        ...tabs.map(([key, label, icon]) => {
          const active = safeSelected === key;
          return el('button', {
            type: 'button',
            class: [
              'posts-filter-option w-full rounded-xl border px-3 text-left',
              'inline-flex items-center justify-between gap-3 font-bold transition-colors',
              active
                ? 'bg-yellow-400 text-black border-yellow-300'
                : 'bg-slate-900/70 text-slate-100 border-slate-700/70 hover:bg-slate-800/80'
            ].join(' '),
            disabled: isPending,
            'aria-current': active ? 'true' : null,
            onclick: () => choose(key)
          },
            el('span', { class: 'inline-flex items-center gap-3 min-w-0' },
              el('i', { class: `fa-solid ${icon} w-4 text-center shrink-0` }),
              el('span', { class: 'truncate' }, label)
            ),
            el('span', { class: 'inline-flex items-center gap-2 shrink-0' },
              el('span', {
                class: active
                  ? 'px-2 py-0.5 rounded-md text-[11px] font-extrabold bg-black/15 text-black'
                  : 'px-2 py-0.5 rounded-md text-[11px] font-extrabold bg-slate-700/70 text-slate-100'
              }, String(counts[key] ?? 0)),
              active ? el('i', { class: 'fa-solid fa-check' }) : null
            )
          );
        })
      )
    )
  ) : null;

  return el('div', { class: 'posts-filter-shell w-full' }, mobileButton, desktop, modal);
}

function renderPagination
(currentPage, totalPages, onPageChange) {
    if (!totalPages || totalPages <= 1) return null;

    const page = Math.max(1, Math.min(totalPages, Number(currentPage) || 1));

    const maxVisible = 5;
    let start = Math.max(1, page - Math.floor(maxVisible / 2));
    let end = start + maxVisible - 1;
    if (end > totalPages) {
      end = totalPages;
      start = Math.max(1, end - maxVisible + 1);
    }

    const aBase =
      'h-10 min-w-10 px-3 rounded-none border-y border-r border-slate-600/60 bg-slate-800/70 hover:bg-slate-700/80 text-slate-100 font-bold inline-flex items-center justify-center no-underline';
    const aActive =
      'h-10 min-w-10 px-3 rounded-none border-y border-r border-slate-600/60 bg-yellow-400 text-black font-extrabold inline-flex items-center justify-center no-underline';
    const aDisabled =
      'h-10 min-w-10 px-3 rounded-none border-y border-r border-slate-700/60 bg-slate-900/60 text-slate-500 cursor-not-allowed inline-flex items-center justify-center no-underline pointer-events-none';

    const items = [];

    items.push(
      el('a', {
        href: listHrefWithPage(Math.max(1, page - 1)),
        class: `${page <= 1 ? aDisabled : aBase} rounded-l-lg border-l`,
        'aria-disabled': page <= 1 ? 'true' : null,
        onclick: (e) => {
          if (page <= 1) {
            e.preventDefault();
            return;
          }
          if (
            e.defaultPrevented ||
            e.button !== 0 ||
            e.metaKey || e.ctrlKey || e.shiftKey || e.altKey
          ) return;
          e.preventDefault();
          onPageChange(page - 1);
        }
      }, el('i', { class: 'fa-solid fa-chevron-left text-xs' }))
    );

    for (let p = start; p <= end; p++) {
      const active = p === page;
      items.push(
        el('a', {
          href: listHrefWithPage(p),
          class: active ? aActive : aBase,
          'aria-current': active ? 'page' : null,
          onclick: (e) => {
            if (
              e.defaultPrevented ||
              e.button !== 0 ||
              e.metaKey || e.ctrlKey || e.shiftKey || e.altKey
            ) return;
            e.preventDefault();
            onPageChange(p);
          }
        }, String(p))
      );
    }

    items.push(
      el('a', {
        href: listHrefWithPage(Math.min(totalPages, page + 1)),
        class: `${page >= totalPages ? aDisabled : aBase} rounded-r-lg`,
        'aria-disabled': page >= totalPages ? 'true' : null,
        onclick: (e) => {
          if (page >= totalPages) {
            e.preventDefault();
            return;
          }
          if (
            e.defaultPrevented ||
            e.button !== 0 ||
            e.metaKey || e.ctrlKey || e.shiftKey || e.altKey
          ) return;
          e.preventDefault();
          onPageChange(page + 1);
        }
      }, el('i', { class: 'fa-solid fa-chevron-right text-xs' }))
    );

    return el('div', { class: 'mt-4 flex items-center justify-center' },
      el('div', { class: 'inline-flex overflow-hidden rounded-lg shadow-sm' }, ...items)
    );
  }

  function cardExcerpt(post) {
    const explicit = String(post.excerpt || '').trim();
    if (explicit) return explicit;

    const fromText = String(post.contentText || '').trim();
    if (fromText) return fromText.slice(0, 220) + (fromText.length > 220 ? '…' : '');

    const fromHtml = stripTagsClient(post.contentHtml || '');
    if (!fromHtml) return '';
    return fromHtml.slice(0, 220) + (fromHtml.length > 220 ? '…' : '');
  }

  function renderCard(post) {
    const cm = categoryMeta(post.categoryKey || post.category || '');
    const sm = sourceMeta(post.source);
    const image = getPostPrimaryImage(post, { forCard: true });
    const displayTitle = normalizePostTitle(post.title || '');
    const isNew = isPostNew(post);

    const detailPath = `/posts/${encodeURIComponent(post.slug)}`;
    const detailUrl = postHref(post.slug);

    return el('article', {
      class: 'posts-card rounded-2xl sm:rounded-3xl border border-slate-700/50 bg-glass p-3 sm:p-5 flex flex-col gap-2.5 sm:gap-3'
    },
      el('div', { class: 'flex flex-wrap items-center gap-2' },
        el('span', {
          class: `inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-extrabold ${cm.chip}`,
          style: cm.style || null
        },
          el('i', { class: `fa-solid ${cm.icon}` }), cm.label
        ),
        el('span', {
          class: `inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold ${sm.cls}`,
          style: sm.style || null
        },
          el('i', { class: `fa-solid ${sm.icon}` }), sm.label
        )
        ,
        isNew ? el('span', {
          class: 'inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-extrabold bg-rose-500 text-white animate-pulse'
        }, el('i', { class: 'fa-solid fa-bolt' }), 'NEW') : null
      ),

      el('a', {
        href: detailUrl,
        class: 'text-left text-white font-extrabold text-lg sm:text-2xl leading-tight hover:text-yellow-300 transition no-underline',
        onclick: (e) => onInternalLinkClick(e, detailPath)
      }, displayTitle || 'Untitled post'),

      el('div', { class: 'text-slate-300 text-sm flex flex-wrap gap-4 items-center' },
        el('span', { class: 'inline-flex items-center gap-2' }, el('i', { class: 'fa-regular fa-calendar' }), fmtDate(post.publishedAt)),
        post.author ? el('span', { class: 'inline-flex items-center gap-2' }, el('i', { class: 'fa-regular fa-user' }), post.author) : null
      ),

      image ? el('a', {
        href: detailUrl,
        onclick: (e) => onInternalLinkClick(e, detailPath),
        class: 'block'
      }, (() => {
        const _img = el('img', {
          src: image,
          alt: displayTitle || 'post image',
          class: 'posts-card-cover',
          loading: 'lazy',
          decoding: 'async'
        });
        applyCmNotesGifFallback(_img, post);
        return _img;
      })()) : null,

      (() => {
        const ex = cardExcerpt(post);
        return ex ? el('div', { class: 'text-slate-200 posts-clamp-4 leading-6 sm:leading-7 text-sm sm:text-base whitespace-pre-wrap' }, ex) : null;
      })(),

      el('div', { class: 'mt-auto pt-3 border-t border-slate-700/40 flex items-center gap-2 w-full' },
        el('a', {
          href: detailUrl,
          onclick: (e) => onInternalLinkClick(e, detailPath),
          class: 'flex-1 min-w-0 h-10 sm:h-11 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-extrabold inline-flex items-center justify-center gap-2 no-underline text-sm sm:text-base'
        }, el('i', { class: 'fa-regular fa-eye' }), 'Read More'),
        post.sourceUrl ? el('a', {
          href: post.sourceUrl,
          target: '_blank',
          rel: 'noopener noreferrer',
          class: 'h-10 sm:h-11 w-11 sm:w-12 shrink-0 rounded-xl border border-slate-600/60 bg-slate-800/70 hover:bg-slate-700/80 text-white inline-flex items-center justify-center'
        }, el('i', { class: 'fa-solid fa-arrow-up-right-from-square' })) : null
      )
    );
  }


function renderListPage(feed, isAdmin) {
  const host = getContentHost();
  if (!host) return;

  let activeFilter = getActiveFilterFromState();
  let pendingFilter = '';
  let mobileFiltersOpen = false;

  const pageFromUrl = getPageFromUrl();
  let activePage = pageFromUrl || getSavedPage(activeFilter);

  let currentPageData = (feed && Array.isArray(feed.posts)) ? feed : { posts: [], meta: {} };
  let counts =
    countsFromListResponse(currentPageData) ||
    __postsListCountsMem ||
    getCountsCache() ||
    (() => {
      const fallback = emptyPostCounts();
      fallback.all = Number(currentPageData?.meta?.total) || 0;
      return fallback;
    })();
  counts = normalizePostCounts(counts);
  __postsListAdminState = !!isAdmin;

  host.innerHTML = '';
  const root = el('div', { 'data-sla-page': 'posts', class: 'w-full mx-auto px-3 sm:px-6 py-6 text-slate-100 space-y-4 sm:space-y-6' });

  root.append(
    el('section', { class: 'space-y-2 sm:space-y-3 px-1' },
      el('h1', { class: 'text-xl sm:text-2xl font-extrabold text-yellow-400 leading-tight' }, 'News & Updates'),
      el('p', { class: 'text-xs sm:text-sm text-slate-300/90' }, 'Stay updated with the latest SLA game news and website updates.')
    )
  );

  root.append(el('div', { id: 'postsFiltersWrap' }));
  root.append(el('div', { id: 'postsCardsWrap', class: 'grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-5' }));
  root.append(el('div', { id: 'postsPaginationWrap' }));
  host.append(root);

  function renderCardsAndPager(pageData) {
    currentPageData = (pageData && Array.isArray(pageData.posts)) ? pageData : { posts: [], meta: {} };

    const nextCounts = countsFromListResponse(currentPageData);
    if (nextCounts) {
      counts = nextCounts;
      __postsListCountsMem = nextCounts;
      setCountsCache(nextCounts);
    }

    const cardsWrap = $('#postsCardsWrap', host);
    const pagerWrap = $('#postsPaginationWrap', host);
    if (!cardsWrap) return;

    const rows = Array.isArray(currentPageData.posts) ? currentPageData.posts : [];
    const totalPages = Math.max(1, Number(currentPageData?.meta?.totalPages) || 1);
    activePage = Math.max(1, Math.min(totalPages, Number(currentPageData?.meta?.page) || activePage || 1));

    setSavedPage(activeFilter, activePage);
    setPageInUrl(activePage);

    cardsWrap.innerHTML = '';
    if (!rows.length) {
      cardsWrap.append(el('div', { class: 'col-span-full rounded-2xl border border-slate-700/50 bg-glass p-6 text-slate-300' }, 'No posts in this category yet.'));
    } else {
      rows.forEach(p => cardsWrap.append(renderCard(p)));
    }

    if (pagerWrap) {
      pagerWrap.innerHTML = '';
      const pager = renderPagination(activePage, totalPages, (nextPage) => {
        activePage = nextPage;
        setSavedPage(activeFilter, activePage);
        setPageInUrl(activePage);
        fetchAndRenderList(activeFilter, activePage, { keepScroll: false });
      });
      if (pager) pagerWrap.append(pager);
    }
  }

  function redrawFilters() {
    const wrap = $('#postsFiltersWrap', host);
    if (!wrap) return;
    const isPending = !!pendingFilter;
    wrap.classList.toggle('is-pending', isPending);
    root.classList.toggle('posts-filter-pending', isPending);
    wrap.innerHTML = '';
    wrap.append(renderFilterTabs(counts, activeFilter, (next) => {
      const safeNext = sanitizeFilter(next);
      if (pendingFilter || safeNext === activeFilter) {
        mobileFiltersOpen = false;
        redrawFilters();
        return;
      }
      activeFilter = safeNext;
      pendingFilter = safeNext;
      mobileFiltersOpen = false;
      setSavedFilter(safeNext);
      activePage = getSavedPage(activeFilter);
      redrawFilters();
      fetchAndRenderList(activeFilter, activePage, { keepScroll: false });
    }, {
      isPending,
      pendingFilter,
      mobileOpen: mobileFiltersOpen,
      openMobile: () => {
        mobileFiltersOpen = true;
        redrawFilters();
      },
      closeMobile: () => {
        mobileFiltersOpen = false;
        redrawFilters();
      }
    }));
  }

  async function fetchAndRenderList(filterKey, page, { keepScroll = true, background = false } = {}) {
    const token = ++__postsLastListRouteToken;
    const safeFilter = sanitizeFilter(filterKey);
    const safePage = Math.max(1, Number(page) || 1);
    try {
      const pageData = await loadPostsList(safePage, POSTS_PAGE_SIZE, safeFilter, { preferCache: !background, abortPrevious: !background });
      const routeNow = parseRoute(currentCleanPathFromLocation());
      if (routeNow.mode !== 'list' || token !== __postsLastListRouteToken) return;
      pendingFilter = '';
      if (!background) renderCardsAndPager(pageData);
      else renderCardsAndPager(pageData);
      redrawFilters();
      if (!keepScroll) {
        try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch {}
      }
    } catch (e) {
      if (e?.name === 'AbortError') return;
      const routeNow = parseRoute(currentCleanPathFromLocation());
      if (routeNow.mode !== 'list' || token !== __postsLastListRouteToken) return;
      console.warn('[Posts.js] list fetch failed:', e?.message || e);
      const fallback = getListMemCache(safePage, POSTS_PAGE_SIZE, safeFilter) || getFallbackListMemCache(safeFilter, POSTS_PAGE_SIZE);
      if (fallback) {
        pendingFilter = '';
        renderCardsAndPager(fallback);
        redrawFilters();
        if (!keepScroll) {
          try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch {}
        }
        return;
      }
      pendingFilter = '';
      redrawFilters();
    }
  }

  redrawFilters();
  renderCardsAndPager(currentPageData);

  // restore scroll only on immediate cached render
  const savedY = getSavedListScrollY();
  if (savedY > 0) {
    try { setTimeout(() => window.scrollTo(0, savedY), 0); } catch {}
  }

  // background refresh current page (ensures latest data + fresh counts from meta.counts)
  Promise.resolve().then(() => fetchAndRenderList(activeFilter, activePage, { keepScroll: true, background: true })).catch(() => {});
}

function removeDuplicateHeroFromHtml
(html, heroUrl, post, { removeHeroFromBody = true } = {}) {
    const raw = String(html || '').trim();
    if (!raw) return raw;

    const tmp = document.createElement('div');
    tmp.innerHTML = raw;

    // Fallback for Netmarble posts that contain only <p class="movie_area"></p>
    // while backend provides parsed video URLs in post.youtubeEmbeds
    try {
      const hasMovieAreaPlaceholder = !!tmp.querySelector('.movie_area');
      const apiEmbeds = Array.isArray(post?.youtubeEmbeds) ? post.youtubeEmbeds.filter(Boolean) : [];
      if (hasMovieAreaPlaceholder && apiEmbeds.length) {
        let movieNode = tmp.querySelector('.movie_area');
        for (const emb of apiEmbeds) {
          const wrap = document.createElement('div');
          wrap.className = 'posts-embed-wrap';

          const iframe = document.createElement('iframe');
          iframe.src = String(emb);
          iframe.loading = 'lazy';
          iframe.referrerPolicy = 'strict-origin-when-cross-origin';
          iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
          iframe.setAttribute('allowfullscreen', '');

          wrap.appendChild(iframe);

          if (movieNode && movieNode.parentNode) {
            movieNode.replaceWith(wrap);
            movieNode = null;
          } else {
            tmp.appendChild(wrap);
          }
        }
      }
    } catch {}

    const normalizeUrl = (u) => {
      try {
        const x = new URL(String(u || '').trim(), location.origin);
        x.hash = '';
        return x.toString();
      } catch {
        return String(u || '').trim();
      }
    };

    const removeImageNode = (img) => {
      const parent = img?.parentElement;
      const parentTag = parent?.tagName?.toLowerCase();
      if (parent && (parentTag === 'p' || parentTag === 'div') && parent.textContent.replace(/\u00a0/g, ' ').trim() === '') {
        parent.remove();
      } else {
        img?.remove();
      }
    };

    // Usuń wszystkie kolejne identyczne obrazki wewnątrz contentHtml
    const seen = new Set();
    Array.from(tmp.querySelectorAll('img[src]')).forEach((img) => {
      const src = normalizeUrl(img.getAttribute('src'));
      if (!src) {
        removeImageNode(img);
        return;
      }

      if (seen.has(src)) {
        removeImageNode(img);
        return;
      }

      seen.add(src);
    });

    // Jeżeli hero renderuje się osobno nad treścią, usuń z treści wszystkie obrazy hero
    if (heroUrl && removeHeroFromBody) {
      const normalizedHero = normalizeUrl(heroUrl);
      Array.from(tmp.querySelectorAll('img[src]')).forEach((img) => {
        const src = normalizeUrl(img.getAttribute('src'));
        if (src === normalizedHero) removeImageNode(img);
      });
    }

    return tmp.innerHTML;
  }

  function stripLeadingListMarkerFromHtml(html) {
    let s = String(html || '');

    s = s.replace(
      /^\s*(?:&nbsp;|\u00a0|\s|<span[^>]*>\s*<\/span>|<[^>]+>\s*)*/i,
      ''
    );

    s = s.replace(
      /^(?:-|•|●|▪|◦|○|■|□|◆|◇|▸|▹|►|▻|※|·|&bull;|&#8226;)\s*/i,
      ''
    );

    return s;
  }

  function isVisuallyEmptyNode(node) {
    if (!node) return false;

    if (node.nodeType === Node.TEXT_NODE) {
      return !String(node.textContent || '').replace(/\u00a0/g, ' ').trim();
    }

    if (!(node instanceof HTMLElement)) return false;

    const text = String(node.textContent || '').replace(/\u00a0/g, ' ').trim();
    const html = String(node.innerHTML || '').trim();
    const hasMedia = !!node.querySelector('img, table, iframe, video, hr');

    if (hasMedia) return false;
    if (text) return false;

    return !html || /^(&nbsp;|\s|<br\s*\/?>)*$/i.test(html);
  }

  function getNextMeaningfulSibling(node) {
    let cur = node ? node.nextSibling : null;

    while (cur) {
      if (cur.nodeType === Node.TEXT_NODE) {
        const txt = String(cur.textContent || '').replace(/\u00a0/g, ' ').trim();
        if (!txt) {
          cur = cur.nextSibling;
          continue;
        }
        return cur;
      }

      if (cur instanceof HTMLElement) return cur;

      cur = cur.nextSibling;
    }

    return null;
  }

  function isEmptyParagraphLike(node) {
    if (!(node instanceof HTMLElement)) return false;

    const tag = node.tagName.toLowerCase();
    if (tag !== 'p' && tag !== 'div') return false;

    const hasMedia = !!node.querySelector('img, table, iframe, video, hr');
    if (hasMedia) return false;

    const text = String(node.textContent || '').replace(/\u00a0/g, ' ').trim();
    if (text) return false;

    const html = String(node.innerHTML || '').trim();
    return !html || /^(&nbsp;|\s|<br\s*\/?>)*$/i.test(html);
  }

  function rewriteInlineColorMappings(style) {
    let s = String(style || '');

    s = s.replace(/color\s*:\s*#134f5c\b/gi, 'color:#137e95');
    s = s.replace(/color\s*:\s*#741b47\b/gi, 'color:#d91274');
    s = s.replace(/color\s*:\s*#85200c\b/gi, 'color:#b32306');
    s = s.replace(/color\s*:\s*blue\b/gi, 'color:#1155cc');

    s = s.replace(/color\s*:\s*(#000|#000000|black|rgb\(\s*0\s*,\s*0\s*,\s*0\s*\)|#1f1f1f|#3e4249|#222222)\s*;?/gi, '');

    return s;
  }

  function rebuildTable(table) {
    if (!(table instanceof HTMLTableElement)) return table;

    const clean = table.cloneNode(true);

    clean.removeAttribute('width');
    clean.removeAttribute('height');
    clean.removeAttribute('style');
    clean.style.width = '100%';
    clean.style.tableLayout = 'fixed';
    clean.style.borderCollapse = 'collapse';

    clean.querySelectorAll('[width],[height]').forEach((node) => {
      node.removeAttribute('width');
      node.removeAttribute('height');
    });

    clean.querySelectorAll('[style]').forEach((node) => {
      let style = String(node.getAttribute('style') || '');

      style = style
        .replace(/\bwidth\s*:\s*[^;]+;?/gi, '')
        .replace(/\bheight\s*:\s*[^;]+;?/gi, '')
        .replace(/\bmin-width\s*:\s*[^;]+;?/gi, '')
        .replace(/\bmax-width\s*:\s*[^;]+;?/gi, '')
        .replace(/\bmin-height\s*:\s*[^;]+;?/gi, '')
        .replace(/\bmax-height\s*:\s*[^;]+;?/gi, '')
        .replace(/\bpadding\s*:\s*0cm;?/gi, '')
        .replace(/\bmargin\s*:\s*0cm;?/gi, '')
        .replace(/\bmargin-top\s*:\s*10\.0pt;?/gi, '')
        .replace(/\s*;\s*/g, '; ')
        .replace(/^;\s*|\s*;$/g, '')
        .trim();

      if (style) node.setAttribute('style', style);
      else node.removeAttribute('style');
    });

    // jeśli tabela nie ma thead, przenieś pierwszy wiersz do thead
    if (!clean.querySelector(':scope > thead')) {
      let firstRow = null;
      let sourceSection = null;

      const directBodies = Array.from(clean.children).filter(
        (n) => n instanceof HTMLElement && n.tagName.toLowerCase() === 'tbody'
      );

      if (directBodies.length) {
        for (const body of directBodies) {
          const row = Array.from(body.children).find(
            (n) => n instanceof HTMLTableRowElement
          );
          if (row) {
            firstRow = row;
            sourceSection = body;
            break;
          }
        }
      } else {
        firstRow = Array.from(clean.children).find(
          (n) => n instanceof HTMLTableRowElement
        ) || null;
        sourceSection = clean;
      }

      if (firstRow) {
        const thead = document.createElement('thead');
        thead.appendChild(firstRow);
        clean.insertBefore(thead, clean.firstChild);
      
        if (sourceSection && sourceSection !== clean && !sourceSection.querySelector('tr')) {
          sourceSection.remove();
        }
      }
    }

    if (!clean.querySelector(':scope > tbody')) {
      const looseRows = Array.from(clean.children).filter(
        (n) => n instanceof HTMLTableRowElement
      );
      if (looseRows.length) {
        const tbody = document.createElement('tbody');
        looseRows.forEach((row) => tbody.appendChild(row));
        clean.appendChild(tbody);
      }
    }

    return clean;
  }

  function cleanupNetmarbleHtmlForDisplay(html, heroUrl, post, options = {}) {
    const raw = removeDuplicateHeroFromHtml(html, heroUrl, post, options);
    const tmp = document.createElement('div');
    tmp.innerHTML = raw;

    tmp.querySelectorAll('[style]').forEach(node => {
      let style = node.getAttribute('style') || '';

      style = rewriteInlineColorMappings(style)
        .replace(/font-size\s*:\s*[^;]+;?/gi, '')
        .replace(/background-color\s*:\s*[^;]+;?/gi, '')
        .replace(/background\s*:\s*[^;]+;?/gi, '')
        .replace(/margin-left\s*:\s*-?7\.05pt;?/gi, '')
        .replace(/margin-right\s*:\s*0cm;?/gi, '')
        .replace(/margin\s*:\s*0cm;?/gi, '')
        .trim();

      style = style.replace(/^\s*;\s*|\s*;\s*$/g, '').trim();

      if (style) node.setAttribute('style', style);
      else node.removeAttribute('style');
    });

    const snapshot = Array.from(tmp.childNodes);
    let i = 0;

    const LIST_MARKER_RE = /^(?:-|•|●|▪|◦|○|■|□|◆|◇|▸|▹|►|▻|※|·)\s+\S+/;

    while (i < snapshot.length) {
      const n = snapshot[i];
      if (!(n instanceof HTMLElement) || n.tagName.toLowerCase() !== 'p') {
        i++;
        continue;
      }
    
      const text = (n.textContent || '').replace(/\u00a0/g, ' ').trim();
      const isTeamLine = /^-\s*Solo Leveling:ARISE Team\s*-\s*$/i.test(text);
      const isBulletLikeP = LIST_MARKER_RE.test(text) && !isTeamLine;
    
      if (!isBulletLikeP) {
        i++;
        continue;
      }
    
      const ul = document.createElement('ul');
      let j = i;
    
      while (j < snapshot.length) {
        const cur = snapshot[j];
        if (!(cur instanceof HTMLElement) || cur.tagName.toLowerCase() !== 'p') break;
      
        const curText = (cur.textContent || '').replace(/\u00a0/g, ' ').trim();
        const curIsTeamLine = /^-\s*Solo Leveling:ARISE Team\s*-\s*$/i.test(curText);
      
        if (!curText) break;
        if (!LIST_MARKER_RE.test(curText)) break;
        if (curIsTeamLine) break;
      
        const li = document.createElement('li');
        li.innerHTML = stripLeadingListMarkerFromHtml(cur.innerHTML);
        ul.appendChild(li);
        j++;
      }
    
      if (ul.children.length) {
        n.replaceWith(ul);
      
        for (let k = i + 1; k < j; k++) {
          const c = snapshot[k];
          if (c && c.parentNode) c.parentNode.removeChild(c);
        }
      
        const nextNode = getNextMeaningfulSibling(ul);
              
        if (isEmptyParagraphLike(nextNode)) {
          nextNode.classList.remove('posts-spacer-sm', 'posts-spacer-lg');
          nextNode.classList.add('posts-spacer-md');
          if (!(nextNode.innerHTML || '').trim()) nextNode.innerHTML = '&nbsp;';
        }
      
        const refreshed = Array.from(tmp.childNodes);
        snapshot.length = 0;
        refreshed.forEach((x) => snapshot.push(x));
        i++;
      } else {
        i++;
      }
    }

    tmp.querySelectorAll('table').forEach(tbl => {
      const rebuilt = rebuildTable(tbl);
      tbl.replaceWith(rebuilt);

      const parent = rebuilt.parentElement;
      if (!parent || parent.classList.contains('posts-table-wrap')) return;
      const wrap = document.createElement('div');
      wrap.className = 'posts-table-wrap';
      rebuilt.replaceWith(wrap);
      wrap.appendChild(rebuilt);
    });

    tmp.querySelectorAll('iframe, video').forEach(media => {
      if (media.tagName && media.tagName.toLowerCase() === 'iframe') {
        const src = String(media.getAttribute('src') || '').trim();
        if (!src) { media.remove(); return; }
        media.setAttribute('loading', 'lazy');
        media.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
        media.setAttribute('allowfullscreen', '');
      }

      media.removeAttribute('width');
      media.removeAttribute('height');

      const parent = media.parentElement;
      if (parent && parent.classList.contains('posts-embed-wrap')) return;

      const wrap = document.createElement('div');
      wrap.className = 'posts-embed-wrap';
      media.replaceWith(wrap);
      wrap.appendChild(media);
    });

    tmp.querySelectorAll('img').forEach(img => {
      const w = Number(img.getAttribute('width') || 0);
      const h = Number(img.getAttribute('height') || 0);
      const inTable = !!img.closest('table');

      if ((w && w <= 2) || (h && h <= 2)) {
        img.remove();
        return;
      }

      img.removeAttribute('width');
      img.removeAttribute('height');
      img.style.maxWidth = '100%';
      img.style.height = 'auto';
      img.style.objectFit = 'contain';
      img.style.display = 'block';
      img.style.marginLeft = 'auto';
      img.style.marginRight = 'auto';

      if (inTable) {
        img.classList.add('posts-table-image');
        img.style.width = 'auto';
        img.style.height = 'clamp(120px, calc((100vw - 120px) / 2), 420px)';
        img.style.maxHeight = 'min(420px, 60vh)';
      } else if (isGifLikeImageUrl(img.getAttribute('src'))) {
        img.style.width = 'auto';
        img.style.maxHeight = '70vh';
      } else {
        
        img.style.maxHeight = 'none';
      }
    });

    tmp.querySelectorAll('*').forEach(node => {
      if (!(node instanceof HTMLElement)) return;

      const style = node.getAttribute('style') || '';
      const text = (node.textContent || '').trim();

      if (/color\s*:\s*#9900ff/i.test(style) && text.startsWith('[') && text.endsWith(']')) {
        node.classList.add('posts-purple-heading');
      }

      if (text.startsWith('📌')) {
        if (!node.querySelector('.posts-pin-heading')) {
          const html = node.innerHTML || '';
          node.innerHTML = html.replace(
            /(^|>)(\s*📌[^<\n\r]*)/i,
            (m, p1, p2) => `${p1}<span class="posts-pin-heading">${p2}</span>`
          );
        }
      }

      const colorAttr = (node.getAttribute('color') || '').toLowerCase();
      if (['#1f1f1f', '#3e4249', '#222222', 'black', '#000', '#000000'].includes(colorAttr)) {
        node.removeAttribute('color');
      }
    });

    tmp.querySelectorAll('p').forEach(p => {
      const hasMedia = p.querySelector('img, table, hr');
      const htmlInner = (p.innerHTML || '').trim();
      const text = (p.textContent || '').replace(/\u00a0/g, ' ').trim();
      const nbspCount = ((p.innerHTML || '').match(/&nbsp;/gi) || []).length;

      if (!hasMedia && !text) {
        if (nbspCount >= 2) p.classList.add('posts-spacer-md');
        else p.classList.add('posts-spacer-sm');
        if (!htmlInner) p.innerHTML = '&nbsp;';
      }
    });

    tmp.querySelectorAll('li').forEach(li => {
      li.innerHTML = stripLeadingListMarkerFromHtml(li.innerHTML)
        .replace(/^(?:&nbsp;|\u00a0|\s)+/i, '');
    
      const hasMedia = li.querySelector('img, table');
      const text = (li.textContent || '').replace(/\u00a0/g, ' ').trim();
    
      if (!hasMedia) {
        // nie usuwaj od razu pustego li, bo może oznaczać celowy odstęp po liście
        if (!text || /^[-•●▪◦○■□◆◇▸▹►▻※·]+$/.test(text)) {
          li.dataset.postsEmptyLi = '1';
        }
      }
    });

    tmp.querySelectorAll('ul, ol').forEach(list => {
      const items = Array.from(list.querySelectorAll(':scope > li'));
      if (!items.length) {
        list.remove();
        return;
      }
    
      const lastItem = items[items.length - 1];
      const hasTrailingEmptyLi = !!lastItem && lastItem.dataset.postsEmptyLi === '1';
    
      items.forEach((li, idx) => {
        if (li.dataset.postsEmptyLi === '1') {
          // zostaw tylko ostatni pusty li jako informację o odstępie
          if (idx !== items.length - 1) li.remove();
        }
      });
    
      const remainingItems = Array.from(list.querySelectorAll(':scope > li')).filter(li => {
        const text = (li.textContent || '').replace(/\u00a0/g, ' ').trim();
        const hasMedia = !!li.querySelector('img, table');
        return hasMedia || text;
      });
    
      if (!remainingItems.length) {
        list.remove();
        return;
      }
    
      // usuń techniczny pusty li z końca
      const trailingEmpty = list.querySelector(':scope > li[data-posts-empty-li="1"]');
      if (trailingEmpty) trailingEmpty.remove();
    
      if (hasTrailingEmptyLi) {
        const spacer = document.createElement('p');
        spacer.className = 'posts-spacer-md';
        spacer.innerHTML = '&nbsp;';
        list.after(spacer);
      }
    });

    tmp.querySelectorAll('p, div').forEach(node => {
      if (!(node instanceof HTMLElement)) return;
      if (node.classList.contains('posts-table-wrap')) return;
      if (node.classList.contains('posts-spacer-sm') || node.classList.contains('posts-spacer-md') || node.classList.contains('posts-spacer-lg')) return;

      const hasMedia = node.querySelector('img, table, hr');
      const text = (node.textContent || '').replace(/\u00a0/g, ' ').trim();
      const isLayoutWrapper = node.children.length > 0;

      if (!hasMedia && !text && !isLayoutWrapper) {
        node.classList.add('posts-spacer-sm');
        node.innerHTML = '&nbsp;';
      }
    });

    return tmp.innerHTML;
  }

  function replaceSurveyPlaceholderWithNotice(container, post) {
    if (!container || typeof container.querySelector !== 'function') return;

    const surveyImg = container.querySelector('img#surveyImg');
    if (!surveyImg) return;

    const sourceUrl = String(post?.sourceUrl || '').trim();
    const target = surveyImg.closest('p') || surveyImg;
    const notice = document.createElement('div');
    notice.className = 'posts-survey-fallback rounded-2xl border border-slate-700/50 bg-slate-900/45 p-4 sm:p-5 my-4';
    notice.innerHTML = `
      <div class="flex flex-col sm:flex-row sm:items-start gap-3">
        <div class="shrink-0 h-10 w-10 rounded-xl border border-yellow-300/25 bg-yellow-300/10 text-yellow-200 inline-flex items-center justify-center">
          <i class="fa-solid fa-square-poll-vertical"></i>
        </div>
        <div class="min-w-0 flex-1">
          <div class="font-extrabold text-white leading-tight">Survey available on Netmarble</div>
          <div class="mt-1.5 text-sm sm:text-base leading-6 text-slate-300">This poll cannot be displayed directly here because the post content only includes the survey placeholder image instead of the full survey block.</div>
          ${sourceUrl ? `<a href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener noreferrer" class="mt-3 h-10 px-3 rounded-lg border border-slate-600/50 bg-slate-800/70 hover:bg-slate-700/80 text-white font-bold inline-flex items-center gap-2 no-underline text-sm"><i class="fa-solid fa-arrow-up-right-from-square"></i>Open original post</a>` : ''}
        </div>
      </div>
    `;

    target.replaceWith(notice);
  }

  function renderDetailPage(post, feed, isAdmin) {
    const host = getContentHost();
    if (!host) return;
  
    const cm = categoryMeta(post.categoryKey || post.category || '');
    const sm = sourceMeta(post.source);
    const latest = (feed?.posts || []).slice(0, 10).filter(p => p.slug !== post.slug);
    const displayTitle = normalizePostTitle(post.title || '');
    const isNew = isPostNew(post);
  
    host.innerHTML = '';
    const root = el('div', { 'data-sla-page': 'posts', class: 'max-w-7xl mx-auto text-slate-100 space-y-3 sm:space-y-0' });
  
    // 4) MOBILE TOP BAR: Back to Posts FIRST (above everything)
    root.append(
      el('div', { class: 'posts-detail-mobile-top' },
        el('a', {
          href: url('/posts'),
          class: 'h-10 px-3 rounded-xl border border-slate-600/50 bg-slate-800/60 hover:bg-slate-700/70 text-white font-bold inline-flex items-center gap-2 no-underline text-sm',
          onclick: (e) => onInternalLinkClick(e, '/posts')
        }, el('i', { class: 'fa-solid fa-arrow-left' }), 'Back to Posts')
      )
    );
  
    // mobile order: aside (Latest News) -> article (content)
    // desktop xl order: aside left, article right
    const layout = el('div', { class: 'grid grid-cols-1 gap-4 posts-detail-layout' });
  
    const aside = el('aside', {
      class: 'order-1 self-start rounded-2xl border border-slate-700/50 bg-glass p-3 posts-detail-aside'
    },
      el('div', { class: 'flex items-center justify-between mb-2' },
        el('div', { class: 'font-extrabold text-white flex items-center gap-2 text-sm' },
          el('i', { class: 'fa-solid fa-newspaper text-yellow-300 text-xs' }), 'Latest News'
        ),
        el('a', {
          href: url('/posts'),
          class: 'text-xs text-slate-300 hover:text-white',
          onclick: (e) => onInternalLinkClick(e, '/posts')
        }, 'View All →')
      ),
      el('div', { class: 'posts-latest-box space-y-2' },
        ...latest.map(x => {
          const m = categoryMeta(x.categoryKey || x.category || '');
          const path = `/posts/${encodeURIComponent(x.slug)}`;
          const latestTitle = normalizePostTitle(x.title || '');
          const latestIsNew = isPostNew(x);
          return el('a', {
            href: postHref(x.slug),
            onclick: (e) => onInternalLinkClick(e, path),
            class: 'block w-full text-left rounded-lg border border-slate-700/40 bg-slate-900/20 hover:bg-slate-800/40 p-2.5 no-underline'
          },
            el('div', { class: 'flex flex-wrap items-center gap-1.5' },
              el('div', {
                class: `inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-extrabold ${m.chip}`,
                style: m.style || null
              }, m.label),
              latestIsNew ? el('span', { class: 'inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-rose-500 text-white' }, 'NEW') : null
            ),
            el('div', { class: 'mt-1.5 font-bold text-xs text-white leading-tight line-clamp-2' }, latestTitle || 'Untitled'),
            el('div', { class: 'mt-1 text-[11px] text-slate-400' }, fmtRelative(x.publishedAt))
          );
        })
      )
    );
  
    const article = el('article', {
      class: 'order-2 rounded-2xl border border-slate-700/50 bg-glass p-4 sm:p-5 posts-detail-article'
    });
  
    article.append(
      // Desktop-only Back button (mobile one is above everything)
      el('div', { class: 'justify-end mb-4 posts-detail-desktop-back' },
        el('a', {
          href: url('/posts'),
          class: 'h-11 px-4 rounded-xl border border-slate-600/50 bg-slate-800/60 hover:bg-slate-700/70 text-white font-bold inline-flex items-center gap-2 no-underline text-sm',
          onclick: (e) => onInternalLinkClick(e, '/posts')
        }, el('i', { class: 'fa-solid fa-arrow-left' }), 'Back to Posts')
      ),
    
      el('div', { class: 'flex flex-wrap items-center gap-2 mb-3 sm:mb-4' },
        el('span', {
          class: `inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-extrabold ${cm.chip}`,
          style: cm.style || null
        },
          el('i', { class: `fa-solid ${cm.icon}` }), cm.label
        ),
        el('span', {
          class: `inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold ${sm.cls}`,
          style: sm.style || null
        },
          el('i', { class: `fa-solid ${sm.icon}` }), sm.label
        )
        ,
        isNew ? el('span', {
          class: 'inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-extrabold bg-rose-500 text-white animate-pulse'
        }, el('i', { class: 'fa-solid fa-bolt' }), 'NEW') : null
      ),
      el('h1', { class: 'posts-hero-title text-xl sm:text-3xl lg:text-4xl font-bold text-white leading-tight' }, displayTitle || 'Untitled'),
      el('div', { class: 'mt-3 sm:mt-4 text-slate-300 flex flex-wrap gap-x-4 sm:gap-x-6 gap-y-2 text-xs sm:text-sm' },
        post.author ? el('span', { class: 'inline-flex items-center gap-2' }, el('i', { class: 'fa-regular fa-user' }), post.author) : null,
        el('span', { class: 'inline-flex items-center gap-2' }, el('i', { class: 'fa-regular fa-calendar' }), fmtDate(post.publishedAt)),
        post.updatedAt ? el('span', { class: 'inline-flex items-center gap-2' }, el('i', { class: 'fa-regular fa-pen-to-square' }), `Updated ${fmtRelative(post.updatedAt)}`) : null
      ),
      el('div', { class: 'my-4 sm:my-6 thin-gold-line' })
    );
  
    const heroImage = getPostPrimaryImage(post, { forCard: false });
    const renderStandaloneHero = shouldRenderStandaloneHero(post, heroImage);
    if (heroImage && renderStandaloneHero) {
      article.append(
        (() => {
          const _heroImg = el('img', {
            src: heroImage,
            alt: displayTitle || 'post image',
            class: isGifLikeImageUrl(heroImage)
              ? 'block mx-auto w-full max-w-3xl max-h-[220px] sm:max-h-[320px] lg:max-h-[420px] object-contain bg-black/10 rounded-xl sm:rounded-2xl border border-slate-700/40 mb-4 sm:mb-6'
              : 'block mx-auto w-full max-w-[560px] h-auto bg-black/10 rounded-xl sm:rounded-2xl border border-slate-700/40 mb-4 sm:mb-6'
          });
          _heroImg.style.maxHeight = isGifLikeImageUrl(heroImage) ? '' : 'none';
          applyCmNotesGifFallback(_heroImg, post);
          return _heroImg;
        })()
      );
    }
  
    const prose = el('div', { class: 'posts-prose text-slate-100 leading-7 sm:leading-8 text-base sm:text-lg' });
    const htmlCandidate = String(post.contentHtml || '').trim();
    const textCandidate = String(post.contentText || '').trim();
  
    if (htmlCandidate && /<\/?[a-z][\s\S]*>/i.test(htmlCandidate)) {
      prose.innerHTML = cleanupNetmarbleHtmlForDisplay(
        htmlCandidate,
        heroImage,
        post,
        { removeHeroFromBody: renderStandaloneHero }
      );
      replaceSurveyPlaceholderWithNotice(prose, post);
    } else if (textCandidate) {
      const parts = textCandidate.split(/\n{2,}/).map(s => s.trim()).filter(Boolean);
      parts.forEach(p => prose.append(el('p', {}, p)));
    } else {
      // keep empty if source has no description/content
    }
  
    article.append(prose);
  
    article.append(
      el('div', { class: 'mt-6 sm:mt-8 pt-4 sm:pt-5 border-t border-slate-700/40 flex flex-wrap items-center gap-3 text-xs sm:text-sm text-slate-300' },
        el('span', { class: 'inline-flex items-center gap-2' }, el('i', { class: 'fa-regular fa-clock' }), `Published ${fmtRelative(post.publishedAt)}`),
        post.sourceUrl ? el('a', {
          href: post.sourceUrl,
          target: '_blank',
          rel: 'noopener noreferrer',
          class: 'inline-flex items-center gap-2 text-blue-300 hover:text-blue-200'
        }, el('i', { class: 'fa-solid fa-arrow-up-right-from-square' }), 'Open source post') : null
      )
    );
  
    layout.append(aside);
    layout.append(article);
  
    root.append(layout);
    host.append(root);
  }

  async function loadPostsList(page = 1, pageSize = POSTS_PAGE_SIZE, filter = 'all', { preferCache = true, abortPrevious = false } = {}) {
    const safeFilter = sanitizeFilter(filter);
    const safePage = Math.max(1, Number(page) || 1);
    const safePageSize = Math.max(1, Number(pageSize) || POSTS_PAGE_SIZE);
    if (preferCache) {
      const cached = getListMemCache(safePage, safePageSize, safeFilter);
      if (cached) {
        const cachedCounts = countsFromListResponse(cached);
        if (cachedCounts) {
          __postsListCountsMem = cachedCounts;
          setCountsCache(cachedCounts);
        }
        return cached;
      }
    }

    let signal;
    if (abortPrevious) {
      if (__postsListAbortController) {
        try { __postsListAbortController.abort(); } catch {}
      }
      __postsListAbortController = new AbortController();
      signal = __postsListAbortController.signal;
    }

    const qs = new URLSearchParams();
    qs.set('page', String(safePage));
    qs.set('pageSize', String(safePageSize));
    if (safeFilter !== 'all') qs.set('filter', safeFilter);

    const data = await fetchJson(url(`/api/posts/list?${qs.toString()}`), signal ? { signal } : undefined);
    if (data && Array.isArray(data.posts)) {
      if (!data.meta || typeof data.meta !== 'object') data.meta = {};
      data.meta.filter = safeFilter;
      data.meta.page = Math.max(1, Number(data.meta.page) || safePage);
      data.meta.pageSize = safePageSize;
      const counts = countsFromListResponse(data);
      if (counts) {
        __postsListCountsMem = counts;
        setCountsCache(counts);
      }
      setUiFeedCache(data, safeFilter, data.meta.page, safePageSize);
      setListMemCache(data.meta.page, safePageSize, safeFilter, data);
    }
    return data;
  }

  async function loadLatest(limit = 10) {
    const qs = new URLSearchParams();
    qs.set('limit', String(Math.max(1, Number(limit) || 10)));
    return fetchJson(url(`/api/posts/latest?${qs.toString()}`));
  }

  async function loadFilterCounts() {
    try {
      if (__postsListCountsMem) return normalizePostCounts(__postsListCountsMem);

      const cached = getCountsCache();
      if (cached) {
        const normalized = normalizePostCounts(cached);
        __postsListCountsMem = normalized;
        return normalized;
      }

      const qs = new URLSearchParams();
      qs.set('page', '1');
      qs.set('pageSize', '1');

      const r = await fetchJson(url(`/api/posts/list?${qs.toString()}`));
      const counts = countsFromListResponse(r);
      if (counts) {
        __postsListCountsMem = counts;
        setCountsCache(counts);
        return counts;
      }

      return emptyPostCounts();
    } catch (e) {
      console.warn('[Posts.js] loadFilterCounts failed:', e?.message || e);
      return getCountsCache() || emptyPostCounts();
    }
  }

  async function loadFeed() {
    const feed = await fetchJson(url('/api/posts/feed'));
    setUiFeedCache(feed, 'all', 1, POSTS_PAGE_SIZE);
    return feed;
  }

  async function loadPost(slug) {
    return fetchJson(url(`/api/posts/${encodeURIComponent(slug)}`));
  }

  async function loadAdminStatus() {
    try {
      const r = await fetch(url('/api/admin/is-admin'), { credentials: 'include', cache: 'no-store' });
      const j = await r.json().catch(() => ({}));
      return !!j?.isAdmin;
    } catch { return false; }
  }

  async function loadAdminStatusCached() {
    const now = Date.now();
    if ((now - (__postsAdminCache.ts || 0)) < 60000 && __postsAdminCache.value !== null) {
      return !!__postsAdminCache.value;
    }
    const v = await loadAdminStatus();
    __postsAdminCache = { value: !!v, ts: now };
    return !!v;
  }

  function clearPostsAutoRefresh() {
    if (__postsAutoRefreshTimer) {
      clearInterval(__postsAutoRefreshTimer);
      __postsAutoRefreshTimer = null;
    }
  }

  function currentCleanPathFromLocation() {
    const bp = basePath();
    let p = location.pathname || '/';
    if (bp && p.startsWith(bp)) p = p.slice(bp.length) || '/';
    return p;
  }

  function isPostsRouteActive(expectedRoute, mountToken) {
    if (mountToken !== __postsMountToken) return false;

    const routeNow = parseRoute(currentCleanPathFromLocation());

    if (!expectedRoute) return routeNow.mode === 'list' || routeNow.mode === 'detail';

    if (expectedRoute.mode === 'detail') {
      return routeNow.mode === 'detail' && routeNow.slug === expectedRoute.slug;
    }

    if (expectedRoute.mode === 'list') {
      return routeNow.mode === 'list';
    }

    return false;
  }

  function setupPostsAutoRefresh(route) {
    clearPostsAutoRefresh();
  
    if (!route || route.mode !== 'list') return;
  
    const refreshMountToken = __postsMountToken;
  
    async function refreshPostsList(activeMountToken) {
      const filter = getSavedFilter();
      let page = getPageFromUrl() || getSavedPage(filter);
    
      let pageData = await loadPostsList(page, POSTS_PAGE_SIZE, filter, {
        preferCache: false,
        abortPrevious: false
      });
    
      if (!isPostsRouteActive({ mode: 'list' }, activeMountToken)) return;
    
      const resetCheck = shouldResetPostsPage(filter, pageData);
    
      if (page > 1 && resetCheck.reset) {
        page = 1;
        setSavedPage(filter, 1);
        setPageInUrl(1);
      
        pageData = await loadPostsList(1, POSTS_PAGE_SIZE, filter, {
          preferCache: false,
          abortPrevious: false
        });
      
        if (!isPostsRouteActive({ mode: 'list' }, activeMountToken)) return;
      }
    
      savePostsPageResetState(filter, buildFeedSignature(pageData));
    
      renderListPage(pageData, false);
    
      loadAdminStatusCached().then((isAdmin) => {
        if (!isPostsRouteActive({ mode: 'list' }, activeMountToken)) return;
        renderListPage(pageData, isAdmin);
      }).catch(() => {});
    }
  
    __postsAutoRefreshTimer = setInterval(async () => {
      try {
        if (document.visibilityState !== 'visible') return;
        if (!isPostsRouteActive({ mode: 'list' }, refreshMountToken)) return;
      
        await refreshPostsList(refreshMountToken);
      } catch (e) {
        if (e?.name === 'AbortError') return;
        console.warn('[Posts.js] auto-refresh skipped:', e?.message || e);
      }
    }, 90 * 1000);
  
    if (!__postsVisibilityListenerAdded) {
      __postsVisibilityListenerAdded = true;
    
      document.addEventListener('visibilitychange', async () => {
        try {
          if (document.visibilityState !== 'visible') return;
          if (!isPostsRouteActive({ mode: 'list' }, __postsMountToken)) return;
        
          await refreshPostsList(__postsMountToken);
        } catch {}
      });
    }
  }

  async function mount(cleanPath) {
    ensureCss();

    const myMountToken = ++__postsMountToken;
    const route = parseRoute(cleanPath || '/posts');
    const initialFilter = route.mode === 'list' ? getActiveFilterFromState() : getSavedFilter();
    const initialPage = route.mode === 'list' ? (getPageFromUrl() || getSavedPage(initialFilter)) : 1;
    const cachedFeed = getUiFeedCache(initialFilter, initialPage, POSTS_PAGE_SIZE);

    if (route.mode === 'detail') {
      try { window.scrollTo({ top: 0, behavior: 'auto' }); } catch {
        try { window.scrollTo(0, 0); } catch {}
      }
    }

    try { __postsLastListRouteToken++; } catch {}
    try {
      if (__postsListAbortController) __postsListAbortController.abort();
    } catch {}

    if (
      route.mode === 'list' &&
      cachedFeed &&
      Array.isArray(cachedFeed.posts) &&
      cachedFeed.meta &&
      ('page' in cachedFeed.meta || 'totalPages' in cachedFeed.meta)
    ) {
      if (isPostsRouteActive(route, myMountToken)) {
        renderListPage(cachedFeed, false);
      }
    } else {
      if (isPostsRouteActive(route, myMountToken)) {
        renderLoading();
      }
    }

    try {
      if (route.mode === 'detail' && route.slug) {
        const single = await loadPost(route.slug);

        if (!isPostsRouteActive(route, myMountToken)) return;

        let sidebarFeed = (cachedFeed && Array.isArray(cachedFeed.posts))
          ? cachedFeed
          : { posts: [], meta: { page: 1, totalPages: 1, total: 0 } };

        renderDetailPage(single.post, sidebarFeed, false);

        loadAdminStatusCached().then((isAdmin) => {
          if (!isPostsRouteActive(route, myMountToken)) return;
          renderDetailPage(single.post, sidebarFeed, isAdmin);
        }).catch(() => {});

        loadLatest(10).then((latest) => {
          if (!isPostsRouteActive(route, myMountToken)) return;

          const latestFeed = (latest && Array.isArray(latest.posts))
            ? { posts: latest.posts, meta: { page: 1, totalPages: 1, total: Number(latest?.meta?.total) || latest.posts.length || 0 } }
            : sidebarFeed;

          sidebarFeed = latestFeed;
          renderDetailPage(single.post, latestFeed, false);

          loadAdminStatusCached().then((isAdmin) => {
            if (!isPostsRouteActive(route, myMountToken)) return;
            renderDetailPage(single.post, latestFeed, isAdmin);
          }).catch(() => {});
        }).catch(() => {});
      } else {
        const filter = getActiveFilterFromState();
        const page = getPageFromUrl() || getSavedPage(filter);

        const pageData = await loadPostsList(page, POSTS_PAGE_SIZE, filter, { preferCache: false, abortPrevious: false });

        if (!isPostsRouteActive({ mode: 'list' }, myMountToken)) return;

        renderListPage(pageData, false);

        loadAdminStatusCached().then((isAdmin) => {
          if (!isPostsRouteActive({ mode: 'list' }, myMountToken)) return;
          renderListPage(pageData, isAdmin);
        }).catch(() => {});
      }

      if (isPostsRouteActive(route, myMountToken)) {
        setupPostsAutoRefresh(route);
      }
    } catch (e) {
      if (e?.name === 'AbortError') {
        if (isPostsRouteActive(route, myMountToken)) {
          setupPostsAutoRefresh(route);
        }
        return;
      }

      if (!isPostsRouteActive(route, myMountToken)) return;

      console.error('[Posts.js] mount error', e);

      if (route.mode === 'list' && cachedFeed) {
        setupPostsAutoRefresh(route);
        return;
      }

      if (route.mode === 'list') {
        const filter = getActiveFilterFromState();
        const fallback = getFallbackListMemCache(filter, POSTS_PAGE_SIZE);
        if (fallback) {
          renderListPage(fallback, false);
          setupPostsAutoRefresh(route);
          return;
        }
      }

      renderError(e);
    }
  }

  window.__posts_mount = mount;
})();
