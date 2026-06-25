// LogIn.js
// Global router + auth UI
// ✅ NEW: Coming Soon feature flags (global, controlled by Admin panel)
// - non-admin: pages show Coming Soon if enabled
// - admin: sees real pages unless local preview mode is enabled
// - /admin always works (no Coming Soon)
// Requires backend:
//   GET  /api/coming-soon
//   GET  /api/admin/coming-soon  (admin)
//   POST /api/admin/coming-soon  (admin)

(function () {
  document.documentElement.classList.add("sla-route-booting");
  document.body?.classList.add("sla-route-booting");
  document.addEventListener("DOMContentLoaded", () => {
    document.documentElement.classList.add("sla-route-booting");
    document.body?.classList.add("sla-route-booting");
  }, { once: true });

  function ensureBootCss() {
    if (document.getElementById("sla-route-boot-css")) return;
    const s = document.createElement("style");
    s.id = "sla-route-boot-css";
    s.textContent = `
      html.sla-route-booting,
      body.sla-route-booting {
        background: #050505 !important;
      }

      html.sla-route-booting body {
        background: #050505 !important;
      }

      body.sla-route-booting #app,
      body.sla-route-booting #content,
      body.sla-route-booting main,
      body.sla-route-booting header,
      body.sla-route-booting aside,
      body.sla-route-booting .sla-sidebar,
      body.sla-route-booting .sla-topbar {
        visibility: hidden !important;
      }

      body.sla-route-booting::before {
        content: "";
        position: fixed;
        inset: 0;
        z-index: 2147483000;
        background: #050505;
        pointer-events: none;
      }
    `;
    document.head.appendChild(s);
  }

  function setRouteBooting(enabled) {
    document.documentElement.classList.toggle("sla-route-booting", !!enabled);
    if (document.body) document.body.classList.toggle("sla-route-booting", !!enabled);
  }

  ensureBootCss();

  const ADMIN_VIEW_COMING_SOON_LIKE_USER_KEY = "sla_admin_view_coming_soon_like_user";
  const DEFAULT_MAINTENANCE_SETTINGS = {
    enabled: false,
    messageTitle: '\uD83D\uDEA7 We\u2019ll be back soon!',
    messageBody: "Our site is currently undergoing scheduled maintenance.\nPlease check back later.",
    imageSrc: "/picture/ComingSoon3.png"
  };
  const MAINTENANCE_TTL_MS = 10000;

  function loadBool(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      if (v === null) return fallback;
      return v === "1";
    } catch {
      return fallback;
    }
  }

  function adminViewComingSoonLikeUser() {
    return loadBool(ADMIN_VIEW_COMING_SOON_LIKE_USER_KEY, false);
  }

  window.__sla_adminViewComingSoonLikeUser = window.__sla_adminViewComingSoonLikeUser || adminViewComingSoonLikeUser;

  function forceDarkMode() {
    try {
      const root = document.documentElement;
      if (root) {
        root.classList.remove("light");
        root.classList.add("dark");
        root.dataset.theme = "dark";
        root.style.colorScheme = "dark";
      }
      if (document.body) {
        document.body.classList.remove("light");
        document.body.classList.add("dark");
        document.body.style.colorScheme = "dark";
      }
      try {
        localStorage.setItem("theme", "dark");
        localStorage.setItem("color-theme", "dark");
        sessionStorage.setItem("theme", "dark");
      } catch (_) {}
    } catch (_) {}
  }

  forceDarkMode();

  const SCRIPT_CACHE = new Set();

  // ✅ GLOBAL VERSION from index.html
  // index.html sets: window.ASSET_VER = "0.0051";
  const ASSET_VER = String(window.ASSET_VER || "").trim(); // can be "" if not set

  // ✅ Navigation sequence token (prevents race conditions on fast clicks)
  let ROUTE_SEQ = 0;

  // Add cache-busting version to local script names (dashboard.js -> dashboard.js?v=0.0051)
  function withVersion(src) {
    if (!src) return src;
    if (/^https?:\/\//i.test(src)) return src;

    const s = String(src).trim();
    if (/[?&]v=/.test(s)) return s;
    if (!ASSET_VER) return s;

    const sep = s.includes("?") ? "&" : "?";
    return `${s}${sep}v=${encodeURIComponent(ASSET_VER)}`;
  }

  /* =========================
     ✅ BASE PATH / URL helpers
     ========================= */

  function cleanBase(b) {
    let s = String(b || "").trim();
    if (!s) return "";
    if (!s.startsWith("/")) s = "/" + s;
    s = s.replace(/\/+$/, "");
    return s === "/" ? "" : s;
  }

  function getBasePath() {
    // 1) app.js globals
    const w = window.__BASE_PATH__ || window.BASE_PATH || window.__SLA_BASE__;
    if (typeof w === "string" && w.trim()) return cleanBase(w.trim());

    // 2) meta base path (optional)
    const meta = document.querySelector('meta[name="base-path"]');
    const raw = (meta?.getAttribute("content") || "").trim();
    if (raw && raw !== "/") return cleanBase(raw);

    // 3) infer from path if hosted under /slahub
    const p = String(window.location.pathname || "/");
    const parts = p.split("/").filter(Boolean);
    if (parts.length > 0) {
      const first = "/" + parts[0];
      if (first === "/slahub") return "/slahub";
    }
    return "";
  }

  function joinBase(path) {
    const base = getBasePath();
    const p = String(path || "");
    const fixed = p.startsWith("/") ? p : `/${p}`;
    return base ? (base + fixed) : fixed;
  }

  function stripBaseFromPath(pathname) {
    const base = getBasePath();
    const p = String(pathname || "/");
    if (!base) return p;
    if (p === base) return "/";
    if (p.startsWith(base + "/")) return p.slice(base.length) || "/";
    return p;
  }

  function normalizePath(p) {
    let s = String(p || "/");
    s = stripBaseFromPath(s);
    if (!s.startsWith("/")) s = "/" + s;
    if (s.length > 1) s = s.replace(/\/+$/, "");
    return s;
  }

  function withBase(pathNoBase) {
    const base = getBasePath();
    const p = normalizePath(pathNoBase);
    return base ? (base + p) : p;
  }

  function startsWithPath(current, basePath) {
    const cur = normalizePath(current);
    const base = normalizePath(basePath);
    return cur === base || cur.startsWith(base + "/");
  }

  function isChildRoute(current, parent) {
    const cur = normalizePath(current);
    const base = normalizePath(parent);
    return cur.startsWith(base + "/");
  }

  function isMembersProfilePath(path) {
    const p = normalizePath(path);
    return /^\/members\/(\d+)$/.test(p);
  }

  function isAdminOnlyPath(path) {
    const p = normalizePath(path);
    return (
      startsWithPath(p, "/admin") ||
      startsWithPath(p, "/creator-code") ||
      startsWithPath(p, "/builds") ||
      startsWithPath(p, "/pictures")
    );
  }

  function isMaintenanceBypassPath(path) {
    const p = normalizePath(path);
    return (
      p === "/maintenance-login" ||
      p.startsWith("/auth/discord") ||
      p.startsWith("/logout") ||
      p.startsWith("/api")
    );
  }

  function setMaintenanceShellMode(enabled) {
    document.documentElement.classList.toggle("sla-maintenance-shell", !!enabled);
    document.body?.classList.toggle("sla-maintenance-shell", !!enabled);
  }

  function clearMaintenanceShellMode() {
    setMaintenanceShellMode(false);
  }

  function ensureMaintenanceShellCss() {
    if (document.getElementById("sla-maintenance-shell-css")) return;
    const style = document.createElement("style");
    style.id = "sla-maintenance-shell-css";
    style.textContent = `
      html.sla-maintenance-shell,
      body.sla-maintenance-shell {
        min-height: 100%;
        overflow-x: hidden;
      }

      body.sla-maintenance-shell #sideBar,
      body.sla-maintenance-shell #sidebar,
      body.sla-maintenance-shell .sla-sidebar,
      body.sla-maintenance-shell aside,
      body.sla-maintenance-shell header,
      body.sla-maintenance-shell .sla-topbar,
      body.sla-maintenance-shell #topBar,
      body.sla-maintenance-shell #topbar,
      body.sla-maintenance-shell #authArea,
      body.sla-maintenance-shell #slaOverlay,
      body.sla-maintenance-shell #mobileOverlay,
      body.sla-maintenance-shell .sla-mobile-overlay {
        display: none !important;
      }

      body.sla-maintenance-shell {
        padding: 0 !important;
        margin: 0 !important;
        background: #050505 !important;
      }

      body.sla-maintenance-shell #app,
      body.sla-maintenance-shell main,
      body.sla-maintenance-shell #content {
        margin-left: 0 !important;
        padding-left: 0 !important;
        width: 100vw !important;
        max-width: none !important;
      }

      body.sla-maintenance-shell main {
        padding: 0 !important;
      }

      body.sla-maintenance-shell #content {
        min-height: 100vh !important;
        display: grid !important;
        place-items: center !important;
        padding: 24px !important;
        box-sizing: border-box !important;
      }

      body.sla-maintenance-shell::before {
        content: "";
        position: fixed;
        inset: 0;
        z-index: -2;
        background: radial-gradient(circle at 50% 35%, rgba(250,204,21,.08), transparent 35%), #050505;
      }

      body.sla-maintenance-shell::after {
        content: "";
        position: fixed;
        inset: 0;
        z-index: -1;
        background: rgba(0,0,0,.18);
      }

      .sla-maint-page {
        width: 100%;
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 24px;
        box-sizing: border-box;
      }

      .sla-maint-card {
        width: min(92vw, 560px);
        border-radius: 22px;
        border: 1px solid rgba(255,255,255,.08);
        background: rgba(24,24,27,.94);
        box-shadow: 0 24px 70px rgba(0,0,0,.55);
        padding: 34px 28px 24px;
        text-align: center;
      }

      .sla-maint-img {
        width: min(260px, 72vw);
        height: auto;
        margin: 0 auto 24px;
        display: block;
        user-select: none;
      }

      .sla-maint-card h1 {
        margin: 0;
        color: #facc15;
        font-size: clamp(26px, 4vw, 36px);
        line-height: 1.12;
        font-weight: 1000;
        letter-spacing: -.02em;
      }

      .sla-maint-card p {
        margin: 16px auto 0;
        max-width: 440px;
        color: rgba(226,232,240,.95);
        font-size: 16px;
        line-height: 1.55;
        font-weight: 600;
      }

      .sla-maint-actions {
        margin-top: 22px;
        display: flex;
        justify-content: center;
        flex-wrap: wrap;
        gap: 10px;
      }

      .sla-maint-admin-btn {
        min-height: 40px;
        padding: 0 16px;
        border-radius: 999px;
        border: 1px solid rgba(250,204,21,.28);
        background: rgba(250,204,21,.08);
        color: rgba(253,230,138,.92);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 9px;
        font-size: 13px;
        font-weight: 900;
        text-decoration: none;
        transition: background .15s ease, border-color .15s ease, transform .12s ease;
      }

      .sla-maint-admin-btn:hover {
        background: rgba(250,204,21,.16);
        border-color: rgba(250,204,21,.48);
        transform: translateY(-1px);
      }

      .sla-maint-admin-btn.is-primary {
        background: rgba(250,204,21,.88);
        border-color: rgba(250,204,21,.72);
        color: #0f172a;
      }

      .sla-maint-admin-btn.is-danger {
        border-color: rgba(251,113,133,.34);
        background: rgba(244,63,94,.10);
        color: rgba(254,205,211,.95);
      }

      .sla-maint-copy {
        margin-top: 22px;
        color: rgba(226,232,240,.72);
        font-size: 13px;
        font-weight: 700;
      }

      @media (max-width: 560px) {
        body.sla-maintenance-shell #content {
          padding: 16px !important;
        }
        .sla-maint-page {
          padding: 16px;
        }
        .sla-maint-card {
          width: min(100%, 560px);
          padding: 28px 18px 22px;
        }
        .sla-maint-img {
          width: min(230px, 70vw);
          margin-bottom: 20px;
        }
      }
    `;
    document.head.appendChild(style);
  }

  /* =========================
     ✅ Globals used across pages
     ========================= */

  function ensureGlobals() {
    ensureMaintenanceShellCss();

    // base-aware url()
    if (typeof window.url !== "function") {
      window.url = (p) => joinBase(p);
    }

    // simple toast (non-blocking alert) implementation if not provided by page
    //if (typeof window.showToast !== "function") {
    //  window.showToast = (msg) => console.log("[toast]", msg);
    //}
    // The actual implementation creates a floating div at the bottom-right of the screen that disappears after 2.5 seconds.
    if (typeof window.showToast !== "function") {
      window.showToast = (msg) => {
        const old = document.getElementById("global-toast");
        if (old) old.remove();
      
        const node = document.createElement("div");
        node.id = "global-toast";
        node.textContent = String(msg || "");
        node.style.cssText = `
          position: fixed;
          right: 20px;
          bottom: 20px;
          z-index: 2147483647;
          background: rgba(15,23,42,.96);
          color: #fff;
          border: 1px solid rgba(148,163,184,.3);
          padding: 10px 14px;
          border-radius: 10px;
          box-shadow: 0 10px 30px rgba(0,0,0,.35);
          font-weight: 700;
          max-width: min(90vw, 420px);
        `;
        document.body.appendChild(node);
      
        setTimeout(() => {
          node.remove();
        }, 2500);
      };
    }

    if (!window.STATE) window.STATE = {};
    if (typeof window.STATE !== "object") window.STATE = {};
    if (!("me" in window.STATE)) window.STATE.me = null;
    if (!("data" in window.STATE)) window.STATE.data = {};
    if (!("isAdmin" in window.STATE)) window.STATE.isAdmin = false;

    // ✅ Coming Soon flags cache
    if (!window.STATE.ui) window.STATE.ui = {};
    if (!("comingSoon" in window.STATE.ui)) {
      window.STATE.ui.comingSoon = {
        loaded: false,
        flags: null,
        loadedAt: 0
      };
    }
    if (!("maintenance" in window.STATE.ui)) {
      window.STATE.ui.maintenance = {
        loaded: false,
        settings: null,
        loadedAt: 0
      };
    }

    if (typeof window.el !== "function") {
      window.el = function el(tag, attrs, ...children) {
        const node = document.createElement(tag);

        const a = attrs && typeof attrs === "object" && !Array.isArray(attrs) ? attrs : null;
        if (a) {
          for (const [k, v] of Object.entries(a)) {
            if (v == null) continue;
            if (k === "class") { node.className = String(v); continue; }
            if (k === "style" && typeof v === "object") { Object.assign(node.style, v); continue; }
            if (k.startsWith("on") && typeof v === "function") { node.addEventListener(k.slice(2).toLowerCase(), v); continue; }
            if (k === "dataset" && typeof v === "object") { for (const [dk, dv] of Object.entries(v)) node.dataset[dk] = String(dv); continue; }
            if (typeof v === "boolean") { if (v) node.setAttribute(k, ""); continue; }
            node.setAttribute(k, String(v));
          }
        }

        function append(ch) {
          if (ch == null || ch === false) return;
          if (Array.isArray(ch)) return ch.forEach(append);
          if (ch instanceof Node) return node.appendChild(ch);
          node.appendChild(document.createTextNode(String(ch)));
        }

        if (!a && attrs != null) children.unshift(attrs);
        children.forEach(append);

        return node;
      };
    }
  }

  function qs(sel, root = document) { return root.querySelector(sel); }

  function isPlainLeftClick(e) {
    return e && e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey;
  }

  function isMobile() {
    return window.matchMedia("(max-width: 767px)").matches;
  }

  function shortName(name) {
    const n = String(name || "User");
    if (!isMobile()) return n;
    if (n.length <= 12) return n;
    return n.slice(0, 10) + "…";
  }

  function discordAvatarUrl(discordId, avatar) {
    if (!avatar) return "";
    if (typeof avatar === "string" && avatar.startsWith("http")) return avatar;
    if (!discordId) return "";
    return `https://cdn.discordapp.com/avatars/${discordId}/${avatar}.png?size=64`;
  }

  function getCustomNameKey(user) {
    const did = user?.discordId || user?.id || "me";
    return `sla_custom_name_${did}`;
  }

  /* =========================
     ✅ API fetch helpers
     ========================= */

  async function fetchMe() {
    try {
      const r = await fetch(joinBase("/api/me"), { cache: "no-store", credentials: "include" });
      if (!r.ok) {
        window.STATE.me = null;
        return null;
      }
      const data = await r.json().catch(() => ({}));
      const me = data?.user || null;
      window.STATE.me = me;
      return me;
    } catch {
      window.STATE.me = null;
      return null;
    }
  }

  async function fetchIsAdmin() {
    try {
      const r = await fetch(joinBase("/api/admin/is-admin"), { cache: "no-store", credentials: "include" });
      if (!r.ok) {
        window.STATE.isAdmin = false;
        return false;
      }
      const data = await r.json().catch(() => ({}));
      const ok = !!data?.isAdmin;
      window.STATE.isAdmin = ok;
      try { if (document.body?.dataset) document.body.dataset.admin = ok ? "1" : "0"; } catch {}
      return ok;
    } catch {
      window.STATE.isAdmin = false;
      return false;
    }
  }

  // ✅ Coming Soon flags
  const COMING_SOON_TTL_MS = 10000;

  function normalizeComingSoonPayload(j) {
    const raw = (j && typeof j === "object")
      ? (j.flags || j.pages || j.comingSoon || j)
      : {};
    return (raw && typeof raw === "object") ? raw : {};
  }

  async function fetchComingSoonFlags(force = false) {
    ensureGlobals();

    const cache = window.STATE.ui.comingSoon;
    const now = Date.now();

    if (!force && cache.loaded && cache.flags && (now - cache.loadedAt < COMING_SOON_TTL_MS)) {
      return cache.flags;
    }

    try {
      const bust = `t=${now}`;
      const r = await fetch(joinBase(`/api/coming-soon?${bust}`), {
        cache: "no-store",
        credentials: "include",
        headers: { Accept: "application/json" }
      });

      const j = await r.json().catch(() => ({}));
      const flags = normalizeComingSoonPayload(j);

      cache.loaded = true;
      cache.flags = flags;
      cache.loadedAt = now;

      return flags;
    } catch {
      cache.loaded = true;
      cache.flags = cache.flags || {};
      cache.loadedAt = now;
      return cache.flags;
    }
  }

  function normalizeMaintenanceSettings(raw) {
    const src = (raw && typeof raw === "object") ? (raw.settings || raw) : {};
    const imageRaw = String(src.imageSrc || "").trim();
    const imageSrc = imageRaw === "/picture/ComingSoon3" ? "/picture/ComingSoon3.png" : imageRaw;
    return {
      enabled: typeof src.enabled === "boolean" ? src.enabled : !!src.enabled,
      messageTitle: String(src.messageTitle || "").trim() || DEFAULT_MAINTENANCE_SETTINGS.messageTitle,
      messageBody: String(src.messageBody || "").trim() || DEFAULT_MAINTENANCE_SETTINGS.messageBody,
      imageSrc: imageSrc || DEFAULT_MAINTENANCE_SETTINGS.imageSrc
    };
  }

  async function fetchMaintenanceSettings(force = false) {
    ensureGlobals();

    const cache = window.STATE.ui.maintenance;
    const now = Date.now();

    if (!force && cache.loaded && cache.settings && (now - cache.loadedAt < MAINTENANCE_TTL_MS)) {
      return cache.settings;
    }

    try {
      const bust = `t=${now}`;
      const r = await fetch(joinBase(`/api/maintenance?${bust}`), {
        cache: "no-store",
        credentials: "include",
        headers: { Accept: "application/json" }
      });

      const j = await r.json().catch(() => ({}));
      const settings = normalizeMaintenanceSettings(j);

      cache.loaded = true;
      cache.settings = settings;
      cache.loadedAt = now;

      return settings;
    } catch {
      const settings = normalizeMaintenanceSettings(DEFAULT_MAINTENANCE_SETTINGS);
      cache.loaded = true;
      cache.settings = settings;
      cache.loadedAt = now;
      return settings;
    }
  }

  window.addEventListener("sla:comingsoon-updated", () => {
    try {
      ensureGlobals();
      const c = window.STATE.ui.comingSoon;
      c.loaded = false;
      c.loadedAt = 0;
    } catch {}
  });

  window.addEventListener("sla:maintenance-updated", () => {
    try {
      ensureGlobals();
      const c = window.STATE.ui.maintenance;
      c.loaded = false;
      c.loadedAt = 0;
    } catch {}
  });

  window.addEventListener("sla:admin-view-coming-soon-like-user-changed", () => {
    try {
      ensureGlobals();
      const c = window.STATE.ui.comingSoon;
      c.loaded = false;
      c.loadedAt = 0;
    } catch {}
    try {
      if (typeof window.routeTo === "function") {
        window.routeTo(window.location.pathname || "/", { push: false });
      }
    } catch {}
  });

  /* =========================
     ✅ Script loader
     ========================= */

  async function loadScriptOnce(src) {
    const full = scriptUrl(src);
    if (SCRIPT_CACHE.has(full)) return;

    await new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = full;
      s.defer = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error(`Failed to load ${full}`));
      document.head.appendChild(s);
    });

    SCRIPT_CACHE.add(full);
  }

  async function loadScriptAnyOnce(srcList) {
    let lastErr = null;
    for (const src of srcList) {
      try {
        await loadScriptOnce(src);
        return;
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr || new Error("Failed to load script(s)");
  }

  async function preloadRouteScriptAnyOnce(srcList) {
    window.__SLA_ROUTER_PRELOADING_SCRIPT = (window.__SLA_ROUTER_PRELOADING_SCRIPT || 0) + 1;
    try {
      await loadScriptAnyOnce(srcList);
    } finally {
      window.__SLA_ROUTER_PRELOADING_SCRIPT = Math.max(0, (window.__SLA_ROUTER_PRELOADING_SCRIPT || 1) - 1);
    }
  }

  function scriptUrl(src) {
    if (/^https?:\/\//i.test(src)) return src;

    let s = String(src || "").trim();
    s = withVersion(s);
    s = s.replace(/^\.\//, "");

    if (!s.startsWith("/")) s = "/" + s;
    return joinBase(s);
  }

  /* =========================
     ✅ Layout helpers
     ========================= */

  function clearOldRouteContainers() {
    const content = document.getElementById("content");
    if (!content) return;

    try {
      content.replaceChildren();
    } catch {
      content.innerHTML = "";
    }
  }

  /* =========================
     ✅ Sidebar active sync
     ========================= */

  function syncSidebarActive(path) {
    try {
      const p = normalizePath(path || "/");
      if (typeof window.updateNavActive === "function") {
        window.updateNavActive(withBase(p));
      }
    } catch {}
  }

  /* =========================
     ✅ Global Loading Overlay
     ========================= */

  function showUILoading(text) {
    try { window.showUILoading?.(text); } catch {}
  }
  function hideUILoading() {
    try { window.hideUILoading?.(); } catch {}
  }

  function getRouteLoadingText(cleanPath) {
    const p = normalizePath(cleanPath || "/");

    if (isChildRoute(p, "/hunters")) return "Loading Hunter details\u2026";
    if (isChildRoute(p, "/hunter-weapons")) return "Loading Hunter Weapon details\u2026";
    if (isChildRoute(p, "/sjw-weapons")) return "Loading Sung Weapon details\u2026";
    if (isChildRoute(p, "/shadows")) return "Loading Shadow details\u2026";

    if (p === "/hunters") return "Opening Hunters\u2026";
    if (p === "/hunter-weapons") return "Opening Hunter Weapons\u2026";
    if (p === "/sjw-weapons") return "Opening Sung Weapons\u2026";
    if (p === "/shadows") return "Opening Shadows\u2026";
    if (isChildRoute(p, "/successors")) return "Loading Successor details\u2026";

    if (startsWithPath(p, "/dashboard")) return "Opening Dashboard\u2026";
    if (startsWithPath(p, "/successors")) return "Opening Successors\u2026";
    if (startsWithPath(p, "/events")) return "Opening Events\u2026";
    if (startsWithPath(p, "/special-commission")) return "Opening Special Commission\u2026";
    if (startsWithPath(p, "/tier-list")) return "Opening Tier List\u2026";
    if (startsWithPath(p, "/stats")) return "Opening Stats\u2026";
    if (startsWithPath(p, "/gems")) return "Opening Gems\u2026";
    if (startsWithPath(p, "/members")) return "Opening Members\u2026";
    if (startsWithPath(p, "/admin")) return "Opening Admin\u2026";
    if (startsWithPath(p, "/creator-code")) return "Opening Creator Code\u2026";
    if (startsWithPath(p, "/builds")) return "Opening Builds\u2026";
    if (startsWithPath(p, "/cores")) return "Opening Cores\u2026";
    if (startsWithPath(p, "/artifacts")) return "Opening Artifacts\u2026";
    if (startsWithPath(p, "/blessing-stones")) return "Opening Blessing Stones\u2026";
    if (startsWithPath(p, "/pvp")) return "Opening PvP\u2026";
    if (startsWithPath(p, "/mini-game")) return "Opening Mini Game\u2026";
    if (startsWithPath(p, "/oracle")) return "Opening Oracle\u2026";
    if (startsWithPath(p, "/calculator")) return "Opening Calculator\u2026";
    if (startsWithPath(p, "/pictures")) return "Opening Pictures\u2026";
    if (startsWithPath(p, "/suggestions")) return "Opening Suggestions\u2026";

    return "Loading\u2026";
  }

  function getRouteScriptPreload(cleanPath) {
    const p = normalizePath(cleanPath || "/");

    if (isChildRoute(p, "/hunters")) return ["Details_Hunter.js"];
    if (isChildRoute(p, "/hunter-weapons")) return ["Details_HunterWeapons.js"];
    if (isChildRoute(p, "/sjw-weapons")) return ["Details_SungWeapons.js"];
    if (isChildRoute(p, "/shadows")) return ["Details_Shadow.js"];

    if (p === "/hunters") return ["Hunter.js"];
    if (p === "/hunter-weapons") return ["HunterWeapons.js"];
    if (p === "/sjw-weapons") return ["SungWeapons.js"];
    if (p === "/shadows") return ["Shadow.js"];
    if (isChildRoute(p, "/successors")) return ["Details_Successors.js"];

    return null;
  }

  function renderContentLoading(text) {
    const content = document.getElementById("content");
    if (!content) return;

    const wrap = document.createElement("div");
    wrap.className = "route-content-loading";
    wrap.setAttribute("role", "status");
    wrap.setAttribute("aria-live", "polite");
    wrap.style.cssText = "min-height:320px;display:flex;align-items:center;justify-content:center;padding:32px 16px;color:#e2e8f0;";

    const card = document.createElement("div");
    card.style.cssText = "display:flex;align-items:center;gap:14px;max-width:min(92vw,520px);width:100%;padding:18px 20px;border:1px solid rgba(148,163,184,.18);border-radius:16px;background:rgba(15,23,42,.72);box-shadow:0 18px 48px rgba(0,0,0,.24);";

    const spinner = document.createElement("div");
    spinner.setAttribute("aria-hidden", "true");
    spinner.style.cssText = "width:24px;height:24px;flex:0 0 24px;border-radius:999px;border:3px solid rgba(148,163,184,.28);border-top-color:#60a5fa;animation:routeContentSpin .8s linear infinite;";

    const label = document.createElement("div");
    label.textContent = String(text || "Loading\u2026");
    label.style.cssText = "font-weight:800;font-size:15px;letter-spacing:0;color:#f8fafc;";

    const style = document.createElement("style");
    style.textContent = "@keyframes routeContentSpin{to{transform:rotate(360deg)}}";

    card.append(spinner, label);
    wrap.append(style, card);
    content.replaceChildren(wrap);
  }

  /* =========================
     ✅ Admin guard
     ========================= */

  async function ensureAdminAccessIfNeeded(cleanPath) {
    if (!isAdminOnlyPath(cleanPath)) return true;

    const ok = await fetchIsAdmin();
    if (!ok) {
      const c = document.getElementById("content");
      if (c) {
        c.innerHTML = `
          <div class="max-w-xl mx-auto mt-10 rounded-2xl border border-rose-500/40 bg-rose-500/10 p-6 text-slate-100">
            <div class="text-lg font-extrabold mb-2">Access denied</div>
            <div class="text-slate-200/90">You don’t have admin permission.</div>
          </div>
        `;
      }
      try { history.replaceState({}, "", withBase("/")); } catch {}
      syncSidebarActive("/");
      return false;
    }
    return true;
  }

  /* =========================
     ✅ Coming Soon routing rules
     ========================= */

  function canonicalRouteKey(cleanPath) {
    const p = normalizePath(cleanPath);

    if (p === "/hunters") return "/hunters";
    if (isChildRoute(p, "/hunters")) return "/hunters-details";

    if (p === "/hunter-weapons") return "/hunter-weapons";
    if (isChildRoute(p, "/hunter-weapons")) return "/hunter-weapons-details";

    if (p === "/sjw-weapons") return "/sjw-weapons";
    if (isChildRoute(p, "/sjw-weapons")) return "/sjw-weapons-details";

    if (p === "/shadows") return "/shadows";
    if (isChildRoute(p, "/shadows")) return "/shadows-details";
    if (p === "/successors") return "/successors";
    if (isChildRoute(p, "/successors")) return "/successors-details";

    if (startsWithPath(p, "/gems")) return "/gems";
    if (startsWithPath(p, "/tier-list")) return "/tier-list";
    if (startsWithPath(p, "/stats")) return "/stats";
    if (startsWithPath(p, "/special-commission")) return "/special-commission";
    if (startsWithPath(p, "/cores")) return "/cores";
    if (startsWithPath(p, "/artifacts")) return "/artifacts";
    if (startsWithPath(p, "/blessing-stones")) return "/blessing-stones";
    if (startsWithPath(p, "/pvp")) return "/pvp";
    if (startsWithPath(p, "/mini-game")) return "/mini-game";
    if (startsWithPath(p, "/hunter-guess")) return "/hunter-guess";
    if (startsWithPath(p, "/events")) return "/events";
    if (startsWithPath(p, "/dashboard")) return "/dashboard";
    if (startsWithPath(p, "/members")) return "/members";
    if (startsWithPath(p, "/oracle")) return "/oracle";
    if (startsWithPath(p, "/calculator")) return "/calculator";
    if (startsWithPath(p, "/posts")) return "/posts";
    if (startsWithPath(p, "/suggestions")) return "/suggestions";
    if (startsWithPath(p, "/admin")) return "/admin";
    if (startsWithPath(p, "/creator-code")) return "/creator-code";
    if (startsWithPath(p, "/builds")) return "/builds";
    if (startsWithPath(p, "/pictures")) return "/pictures";

    return null;
  }

  const COMING_META = {
    "/dashboard": {
      title: "Coming soon",
      icon: "📌",
      subtitle: "The Dashboard page is currently being prepared.",
      note: "Please check back later."
    },
    "/hunters": {
      title: "Coming soon",
      icon: "🧑‍🤝‍🧑",
      subtitle: "The Hunters page is currently being prepared.",
      note: "Please check back later."
    },
    "/hunters-details": {
      title: "Coming soon",
      icon: "🧑‍🤝‍🧑",
      subtitle: "The Hunters details page is currently being prepared.",
      note: "Please check back later."
    },
    "/hunter-weapons": {
      title: "Coming soon",
      icon: "🔫",
      subtitle: "The Hunters - Weapons page is currently being prepared.",
      note: "Please check back later."
    },
    "/hunter-weapons-details": {
      title: "Coming soon",
      icon: "🔫",
      subtitle: "The Hunter Weapon details page is currently being prepared.",
      note: "Please check back later."
    },
    "/sjw-weapons": {
      title: "Coming soon",
      icon: "🗡️",
      subtitle: "The Sung Jinwoo - Weapons page is currently being prepared.",
      note: "Please check back later."
    },
    "/sjw-weapons-details": {
      title: "Coming soon",
      icon: "🗡️",
      subtitle: "The Sung Jinwoo Weapon details page is currently being prepared.",
      note: "Please check back later."
    },
    "/shadows": {
      title: "Coming soon",
      icon: "👻",
      subtitle: "The Shadows page is currently being prepared.",
      note: "Please check back later."
    },
    "/shadows-details": {
      title: "Coming soon",
      icon: "👻",
      subtitle: "The Shadows details page is currently being prepared.",
      note: "Please check back later."
    },
    "/successors": {
      title: "Coming soon",
      icon: "Successors",
      subtitle: "The Successors page is currently being prepared.",
      note: "Please check back later."
    },
    "/successors-details": {
      title: "Coming soon",
      icon: "Successors",
      subtitle: "The Successor details page is currently being prepared.",
      note: "Please check back later."
    },
    "/gems": {
      title: "Coming soon",
      icon: "💎",
      subtitle: "The Gems page is currently undergoing scheduled maintenance.",
      note: "Please check back later."
    },
    "/tier-list": {
      title: "Coming soon",
      icon: "🏆",
      subtitle: "The Tier List page is currently being prepared.",
      note: "Please check back later."
    },
    "/stats": {
      title: "Coming soon",
      icon: "📊",
      subtitle: "The Stats page is currently being prepared.",
      note: "Please check back later."
    },
    "/special-commission": {
      title: "Coming soon",
      icon: "📋",
      subtitle: "The Special Commission page is currently being prepared.",
      note: "Please check back later."
    },
    "/cores": {
      title: "Coming soon",
      icon: "🔷",
      subtitle: "The Cores page is currently being prepared.",
      note: "Please check back later."
    },
    "/artifacts": {
      title: "Coming soon",
      icon: "👕",
      subtitle: "The Artifacts page is currently being prepared.",
      note: "Please check back later."
    },
    "/blessing-stones": {
      title: "Coming soon",
      icon: "_fa-solid fa-gem",
      subtitle: "The Blessing Stones page is currently being prepared.",
      note: "Please check back later."
    },
    "/pvp": {
      title: "Coming soon",
      icon: "♟️",
      subtitle: "The PvP page is currently being prepared.",
      note: "Please check back later."
    },
    "/mini-game": {
      title: "Coming soon",
      icon: "_fa-solid fa-dungeon",
      subtitle: "The Mini Game page is currently being prepared.",
      note: "Please check back later."
    },
    "/hunter-guess": {
      title: "Coming soon",
      icon: "_fa-solid fa-magnifying-glass-chart",
      subtitle: "The Hunter Guess page is currently being prepared.",
      note: "Please check back later."
    },
    "/events": {
      title: "Coming soon",
      icon: "📅",
      subtitle: "The Events page is currently being prepared.",
      note: "Please check back later."
    },
    "/members": {
      title: "Coming soon",
      icon: "🧑",
      subtitle: "The Members page is currently being prepared.",
      note: "Please check back later."
    },
    "/calculator": {
      title: "Coming soon",
      icon: "🧮",
      subtitle: "The Calculator page is currently being prepared.",
      note: "Please check back later."
    },
    "/posts": {
      title: "Coming soon",
      icon: "📰",
      subtitle: "The Posts page is currently being prepared.",
      note: "Please check back later."
    },
    "/suggestions": {
      title: "Coming soon",
      icon: "_fa-solid fa-ticket",
      subtitle: "The Suggestions page is currently being prepared.",
      note: "Please check back later."
    }
  };

  function shouldShowComingSoon(cleanPath, flags, isAdmin) {
    if (isAdmin && !adminViewComingSoonLikeUser()) return false;
    if (startsWithPath(cleanPath, "/admin")) return false;
    if (isAdminOnlyPath(cleanPath)) return false;

    const key = canonicalRouteKey(cleanPath);
    if (!key) return false;

    const v = flags ? flags[key] : undefined;
    if (typeof v === "boolean") return v;
    if (key === "/successors") return false;
    if (key === "/suggestions") return false;
    return true;
  }

  async function renderComingSoon(cleanPath) {
    try {
      await loadScriptAnyOnce(["Comingsoon.js"]);
    } catch (e) {
      console.error(e);
      const c = document.getElementById("content");
      if (c) c.innerHTML = `<div class="text-center text-slate-300">Failed to load Coming Soon.</div>`;
      hideUILoading();
      return;
    }

    const key = canonicalRouteKey(cleanPath) || "/stats";
    const meta = COMING_META[key] || { title: "Coming Soon", icon: "⏳" };

    const host = document.getElementById("content");
    if (typeof window.__comingsoon_mount === "function") {
      await window.__comingsoon_mount(host, {
        title: meta.title,
        subtitle: meta.subtitle || `${meta.title} page is currently being prepared.`,
        note: meta.note || "Work in progress",
        copyright: "© 2026 SLA Hub",
        imageSrc: meta.imageSrc || "/picture/ComingSoon3.png",
        showImage: meta.showImage !== false,
        icon: meta.icon
      });
    } else {
      if (host) host.innerHTML = `<div class="text-center text-slate-300">Coming Soon.</div>`;
    }

    hideUILoading();
  }

  async function renderMaintenancePage(settings) {
    {
    ensureGlobals();
    forceDarkMode();
    setMaintenanceShellMode(true);

    const cfg = normalizeMaintenanceSettings(settings);
    const bodyLines = String(cfg.messageBody || DEFAULT_MAINTENANCE_SETTINGS.messageBody)
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const host = document.getElementById("content");
    if (!host) {
      hideUILoading();
      return;
    }

    host.innerHTML = "";
    host.append(window.el("section", { class: "sla-maint-page" },
      window.el("div", { class: "sla-maint-card" },
        window.el("img", {
          class: "sla-maint-img",
          src: cfg.imageSrc || DEFAULT_MAINTENANCE_SETTINGS.imageSrc,
          alt: "Maintenance illustration",
          loading: "eager",
          decoding: "async"
        }),
        window.el("h1", {}, cfg.messageTitle || DEFAULT_MAINTENANCE_SETTINGS.messageTitle),
        window.el("p", {}, bodyLines.length
          ? bodyLines.flatMap((line, idx) => idx === 0 ? [line] : [window.el("br"), line])
          : [
              "Our site is currently undergoing scheduled maintenance.",
              window.el("br"),
              "Please check back later."
            ]
        ),
        window.el("div", { class: "sla-maint-actions" },
          window.el("a", {
            class: "sla-maint-admin-btn",
            href: withBase("/maintenance-login"),
            onclick: (e) => {
              if (!isPlainLeftClick(e)) return;
              e.preventDefault();
              routeTo("/maintenance-login");
            }
          },
            window.el("i", { class: "fa-solid fa-user-shield" }),
            "Admin Login"
          )
        ),
        window.el("div", { class: "sla-maint-copy" }, "Â© 2026 SLA Hub")
      )
    ));

    setRouteBooting(false);
    hideUILoading();
    return;
    }

    const cfg = normalizeMaintenanceSettings(settings);
    const bodyLines = String(cfg.messageBody || DEFAULT_MAINTENANCE_SETTINGS.messageBody)
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    try {
      await loadScriptAnyOnce(["Comingsoon.js"]);
    } catch (e) {
      console.error(e);
      const c = document.getElementById("content");
      if (c) c.innerHTML = `<div class="text-center text-slate-300">Maintenance Mode is enabled.</div>`;
      hideUILoading();
      return;
    }

    const host = document.getElementById("content");
    if (typeof window.__comingsoon_mount === "function") {
      await window.__comingsoon_mount(host, {
        title: cfg.messageTitle,
        subtitle: bodyLines[0] || DEFAULT_MAINTENANCE_SETTINGS.messageBody.split("\n")[0],
        note: bodyLines.slice(1).join("\n") || DEFAULT_MAINTENANCE_SETTINGS.messageBody.split("\n")[1],
        copyright: "© 2026 SLA Hub",
        imageSrc: cfg.imageSrc || DEFAULT_MAINTENANCE_SETTINGS.imageSrc,
        showImage: true,
        backTarget: false,
        minHeightClass: "min-h-[70vh]"
      });
    } else if (host) {
      host.innerHTML = `<div class="text-center text-slate-300">Maintenance Mode is enabled.</div>`;
    }

    if (host) {
      const actionWrap = document.createElement("div");
      actionWrap.className = "mt-5 flex justify-center";
      const btn = document.createElement("a");
      btn.href = withBase("/maintenance-login");
      btn.className = [
        "inline-flex h-11 items-center justify-center gap-2 rounded-xl border px-5",
        "border-yellow-400/50 bg-yellow-400/15 text-yellow-100",
        "hover:bg-yellow-400/25 hover:border-yellow-300/70",
        "transition-colors font-extrabold"
      ].join(" ");
      btn.innerHTML = `<i class="fa-solid fa-right-to-bracket text-sm"></i><span>Admin Login</span>`;
      btn.addEventListener("click", (e) => {
        if (!isPlainLeftClick(e)) return;
        e.preventDefault();
        routeTo("/maintenance-login");
      });
      actionWrap.appendChild(btn);
      host.appendChild(actionWrap);
    }

    hideUILoading();
  }

  async function renderMaintenanceLoginPage() {
    {
    ensureGlobals();
    forceDarkMode();
    setMaintenanceShellMode(true);

    const host = document.getElementById("content");
    if (!host) {
      hideUILoading();
      return;
    }

    const me = window.STATE.me || await fetchMe();
    let isAdmin = !!window.STATE.isAdmin;
    if (me) isAdmin = await fetchIsAdmin();

    const title = !me ? "Admin Login" : isAdmin ? "Admin Access" : "Access Denied";
    const text = !me
      ? "Log in with Discord to manage Site Maintenance."
      : isAdmin
        ? "You are signed in as an admin. Open the Admin Panel to manage Site Maintenance."
        : "This account does not have admin access.";
    const actions = window.el("div", { class: "sla-maint-actions" });

    if (!me) {
      actions.append(window.el("a", {
        href: joinBase("/auth/discord"),
        class: "sla-maint-admin-btn is-primary"
      }, window.el("i", { class: "fa-brands fa-discord" }), "Login with Discord"));
    } else if (isAdmin) {
      actions.append(window.el("a", {
        href: withBase("/admin"),
        class: "sla-maint-admin-btn is-primary",
        onclick: (e) => {
          if (!isPlainLeftClick(e)) return;
          e.preventDefault();
          routeTo("/admin");
        }
      }, window.el("i", { class: "fa-solid fa-user-shield" }), "Open Admin Panel"));
    } else {
      actions.append(window.el("button", {
        type: "button",
        class: "sla-maint-admin-btn is-danger",
        onclick: async () => {
          await doLogout();
          routeTo("/maintenance-login", { push: false });
        }
      }, window.el("i", { class: "fa-solid fa-right-from-bracket" }), "Logout"));
    }

    host.innerHTML = "";
    host.append(window.el("section", { class: "sla-maint-page" },
      window.el("div", { class: "sla-maint-card" },
        window.el("img", {
          class: "sla-maint-img",
          src: DEFAULT_MAINTENANCE_SETTINGS.imageSrc,
          alt: "Maintenance illustration",
          loading: "eager",
          decoding: "async"
        }),
        window.el("h1", {}, title),
        window.el("p", {}, text),
        actions,
        window.el("div", { class: "sla-maint-copy" }, "Â© 2026 SLA Hub")
      )
    ));

    setRouteBooting(false);
    hideUILoading();
    return;
    }

    ensureGlobals();
    forceDarkMode();

    const host = document.getElementById("content");
    if (!host) {
      hideUILoading();
      return;
    }

    const me = window.STATE.me || await fetchMe();
    let isAdmin = !!window.STATE.isAdmin;
    if (me) isAdmin = await fetchIsAdmin();

    const card = window.el("section", {
      class: "mx-auto flex min-h-[70vh] w-full max-w-[560px] items-center justify-center px-4"
    },
      window.el("div", {
        class: [
          "w-full overflow-hidden rounded-2xl border border-white/10",
          "bg-slate-950/35 backdrop-blur-md shadow-[0_18px_55px_rgba(0,0,0,.45)]",
          "px-5 py-6 text-center md:px-7 md:py-7"
        ].join(" ")
      },
        window.el("img", {
          src: DEFAULT_MAINTENANCE_SETTINGS.imageSrc,
          alt: "Maintenance illustration",
          class: "mx-auto mb-4 block h-auto w-[230px] select-none opacity-95",
          loading: "eager",
          decoding: "async"
        }),
        window.el("h1", { class: "text-2xl font-black text-yellow-200 md:text-3xl" },
          me ? (isAdmin ? "Admin Access" : "Admin Login") : "Admin Login"
        ),
        window.el("p", { class: "mx-auto mt-3 max-w-[420px] whitespace-pre-line text-sm font-semibold leading-relaxed text-slate-200/85 md:text-base" },
          !me
            ? "Maintenance Mode is enabled. Log in with an admin account to manage the site."
            : isAdmin
              ? "You are signed in as an admin. You can open the admin panel and manage Site Maintenance."
              : "This account does not have admin access."
        )
      )
    );

    const panel = card.querySelector("div");
    const actions = window.el("div", { class: "mt-5 flex flex-wrap items-center justify-center gap-3" });

    if (!me) {
      const login = window.el("a", {
        href: joinBase("/auth/discord"),
        class: "inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-yellow-400/55 bg-yellow-400/90 px-5 font-black text-slate-950 transition hover:bg-yellow-300"
      }, window.el("i", { class: "fa-brands fa-discord" }), "Login with Discord");
      actions.append(login);
    } else if (isAdmin) {
      const openAdmin = window.el("a", {
        href: withBase("/admin"),
        class: "inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-yellow-400/55 bg-yellow-400/90 px-5 font-black text-slate-950 transition hover:bg-yellow-300"
      }, window.el("i", { class: "fa-solid fa-user-shield" }), "Open Admin Panel");
      openAdmin.addEventListener("click", (e) => {
        if (!isPlainLeftClick(e)) return;
        e.preventDefault();
        routeTo("/admin");
      });
      actions.append(openAdmin);
    } else {
      const logout = window.el("button", {
        type: "button",
        class: "inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-rose-300/35 bg-rose-500/15 px-5 font-black text-rose-100 transition hover:bg-rose-500/25"
      }, window.el("i", { class: "fa-solid fa-right-from-bracket" }), "Logout");
      logout.addEventListener("click", async () => {
        await doLogout();
        routeTo("/maintenance-login", { push: false });
      });
      actions.append(logout);
    }

    panel.append(actions);
    host.innerHTML = "";
    host.append(card);
    hideUILoading();
  }

  /* =========================
     ✅ Router (SPA)
     ========================= */

  async function routeTo(path, { push = true } = {}) {
    ensureGlobals();
    forceDarkMode();
    clearOldRouteContainers();

    const mySeq = ++ROUTE_SEQ;
    const isStale = () => mySeq !== ROUTE_SEQ;

    const cleanPath = normalizePath(path || "/");
    syncSidebarActive(cleanPath);
    const loadingText = getRouteLoadingText(cleanPath);
    showUILoading(loadingText);
    renderContentLoading(loadingText);
    let scriptPreloadPromise = Promise.resolve(null);

    if (push) {
      try { history.pushState({}, "", withBase(cleanPath)); } catch {}
    }

    const [me, flags, maintenance] = await Promise.all([
      fetchMe(),
      fetchComingSoonFlags(false),
      fetchMaintenanceSettings(false)
    ]);
    if (isStale()) return;

    if (me) await fetchIsAdmin();
    if (isStale()) return;

    if (cleanPath === "/maintenance-login") {
      await renderMaintenanceLoginPage();
      return;
    }

    const isAdmin = !!window.STATE.isAdmin;
    if (maintenance?.enabled && !isAdmin && !isMaintenanceBypassPath(cleanPath)) {
      await renderMaintenancePage(maintenance);
      return;
    }

    clearMaintenanceShellMode();
    setRouteBooting(false);

    const allow = await ensureAdminAccessIfNeeded(cleanPath);
    if (isStale()) return;
    if (!allow) { if (!isStale()) hideUILoading(); return; }

    if (shouldShowComingSoon(cleanPath, flags, isAdmin)) {
      await renderComingSoon(cleanPath);
      return;
    }

    const preloadScripts = getRouteScriptPreload(cleanPath);
    scriptPreloadPromise = preloadScripts
      ? preloadRouteScriptAnyOnce(preloadScripts).catch(e => e)
      : Promise.resolve(null);

    // --------- DASHBOARD ---------
    if (startsWithPath(cleanPath, "/dashboard")) {
      try {
        await loadScriptAnyOnce(["Dashboard.js"]);
        if (isStale()) return;
      } catch (e) {
        console.error(e);
        if (!isStale()) {
          const c = document.getElementById("content");
          if (c) c.innerHTML = `<div class="text-center text-slate-300">Failed to load Dashboard.</div>`;
          hideUILoading();
        }
        return;
      }
      if (typeof window.__dashboard_mount === "function") await window.__dashboard_mount(cleanPath);
      if (!isStale()) hideUILoading();
      return;
    }

    // --------- HUNTERS LIST ---------
    if (cleanPath === "/hunters") {
      try {
        const preloadResult = await scriptPreloadPromise;
        if (preloadResult instanceof Error) throw preloadResult;
        if (isStale()) return;
      } catch (e) {
        console.error(e);
        if (!isStale()) {
          const c = document.getElementById("content");
          if (c) c.innerHTML = `<div class="text-center text-slate-300">Failed to load Hunters.</div>`;
          hideUILoading();
        }
        return;
      }
      if (typeof window.__hunters_mount === "function") {
        await window.__hunters_mount(cleanPath);
      }
      if (!isStale()) hideUILoading();
      return;
    }

    // --------- HUNTERS DETAILS ---------
    if (isChildRoute(cleanPath, "/hunters")) {
      try {
        const preloadResult = await scriptPreloadPromise;
        if (preloadResult instanceof Error) throw preloadResult;
        if (isStale()) return;
      } catch (e) {
        console.error(e);
        if (!isStale()) {
          const c = document.getElementById("content");
          if (c) c.innerHTML = `<div class="text-center text-slate-300">Failed to load Hunter details.</div>`;
          hideUILoading();
        }
        return;
      }
    
      if (typeof window.__details_hunter_mount === "function") {
        await window.__details_hunter_mount(cleanPath);
      }
    
      if (!isStale()) hideUILoading();
      return;
    }

    // --------- HUNTER WEAPONS ---------
    if (cleanPath === "/hunter-weapons") {
      try {
        const preloadResult = await scriptPreloadPromise;
        if (preloadResult instanceof Error) throw preloadResult;
        if (isStale()) return;
      } catch (e) {
        console.error(e);
        if (!isStale()) {
          const c = document.getElementById("content");
          if (c) c.innerHTML = `<div class="text-center text-slate-300">Failed to load Hunter Weapons.</div>`;
          hideUILoading();
        }
        return;
      }

      if (typeof window.__hunter_weapons_mount === "function") {
        await window.__hunter_weapons_mount(cleanPath);
      }

      if (!isStale()) hideUILoading();
      return;
    }

    if (isChildRoute(cleanPath, "/hunter-weapons")) {
      try {
        const preloadResult = await scriptPreloadPromise;
        if (preloadResult instanceof Error) throw preloadResult;
        if (isStale()) return;
      } catch (e) {
        console.error(e);
        if (!isStale()) {
          const c = document.getElementById("content");
          if (c) c.innerHTML = `<div class="text-center text-slate-300">Failed to load Hunter Weapon details.</div>`;
          hideUILoading();
        }
        return;
      }

      if (typeof window.__details_hunter_weapons_mount === "function") {
        await window.__details_hunter_weapons_mount(cleanPath);
      }

      if (!isStale()) hideUILoading();
      return;
    }

    // --------- SJW / SUNG WEAPONS LIST ---------
    if (cleanPath === "/sjw-weapons") {
      try {
        const preloadResult = await scriptPreloadPromise;
        if (preloadResult instanceof Error) throw preloadResult;
        if (isStale()) return;
      } catch (e) {
        console.error(e);
        if (!isStale()) {
          const c = document.getElementById("content");
          if (c) c.innerHTML = `<div class="text-center text-slate-300">Failed to load Sung Weapons.</div>`;
          hideUILoading();
        }
        return;
      }
      if (typeof window.__sung_weapons_mount === "function") await window.__sung_weapons_mount(cleanPath);
      if (!isStale()) hideUILoading();
      return;
    }

    // --------- SJW / SUNG WEAPONS DETAILS ---------
    if (isChildRoute(cleanPath, "/sjw-weapons")) {
      try {
        const preloadResult = await scriptPreloadPromise;
        if (preloadResult instanceof Error) throw preloadResult;
        if (isStale()) return;
      } catch (e) {
        console.error(e);
        if (!isStale()) {
          const c = document.getElementById("content");
          if (c) c.innerHTML = `<div class="text-center text-slate-300">Failed to load Sung Weapon details.</div>`;
          hideUILoading();
        }
        return;
      }
      if (typeof window.__details_sung_weapons_mount === "function") {
        await window.__details_sung_weapons_mount(cleanPath);
      }
      if (!isStale()) hideUILoading();
      return;
    }

    // --------- SHADOWS ----------
    if (cleanPath === "/shadows") {
      try {
        const preloadResult = await scriptPreloadPromise;
        if (preloadResult instanceof Error) throw preloadResult;
        if (isStale()) return;
      } catch (e) {
        console.error(e);
        if (!isStale()) {
          const c = document.getElementById("content");
          if (c) c.innerHTML = `<div class="text-center text-slate-300">Failed to load Shadows.</div>`;
          hideUILoading();
        }
        return;
      }
      if (typeof window.__shadows_mount === "function") await window.__shadows_mount(cleanPath);
      if (!isStale()) hideUILoading();
      return;
    }

    // --------- SHADOWS DETAILS ---------
    if (isChildRoute(cleanPath, "/shadows")) {
      try {
        const preloadResult = await scriptPreloadPromise;
        if (preloadResult instanceof Error) throw preloadResult;
        if (isStale()) return;
      } catch (e) {
        console.error(e);
        if (!isStale()) {
          const c = document.getElementById("content");
          if (c) c.innerHTML = `<div class="text-center text-slate-300">Failed to load Shadow details.</div>`;
          hideUILoading();
        }
        return;
      }
      if (typeof window.__details_shadow_mount === "function") await window.__details_shadow_mount(cleanPath);
      if (!isStale()) hideUILoading();
      return;
    }

    // --------- SUCCESSORS ----------
    if (cleanPath === "/successors") {
      try {
        await loadScriptAnyOnce(["Successors.js"]);
        if (isStale()) return;
      } catch (e) {
        console.error(e);
        if (!isStale()) {
          const c = document.getElementById("content");
          if (c) c.innerHTML = `<div class="text-center text-slate-300">Failed to load Successors.</div>`;
          hideUILoading();
        }
        return;
      }
      if (typeof window.__successors_mount === "function") await window.__successors_mount(cleanPath);
      if (!isStale()) hideUILoading();
      return;
    }

    // --------- SUCCESSORS DETAILS ---------
    if (isChildRoute(cleanPath, "/successors")) {
      try {
        const preloadResult = await scriptPreloadPromise;
        if (preloadResult instanceof Error) throw preloadResult;
        if (isStale()) return;
      } catch (e) {
        console.error(e);
        if (!isStale()) {
          const c = document.getElementById("content");
          if (c) c.innerHTML = `<div class="text-center text-slate-300">Failed to load Successor details.</div>`;
          hideUILoading();
        }
        return;
      }
      if (typeof window.__details_successors_mount === "function") {
        await window.__details_successors_mount(cleanPath);
      }
      if (!isStale()) hideUILoading();
      return;
    }

    // --------- GEMS ---------
    if (startsWithPath(cleanPath, "/gems")) {
      try {
        await loadScriptAnyOnce(["Gems.js", "public/Gems.js"]);
        if (isStale()) return;
      } catch (e) {
        console.error(e);
        if (!isStale()) {
          const c = document.getElementById("content");
          if (c) c.innerHTML = `<div class="text-center text-slate-300">Failed to load Gems.</div>`;
          hideUILoading();
        }
        return;
      }
      if (typeof window.__gems_mount === "function") await window.__gems_mount(cleanPath);
      if (!isStale()) hideUILoading();
      return;
    }

    // --------- EVENTS ---------
    if (startsWithPath(cleanPath, "/events")) {
      try {
        await loadScriptAnyOnce(["Events.js"]);
        if (isStale()) return;
      } catch (e) {
        console.error(e);
        if (!isStale()) {
          const c = document.getElementById("content");
          if (c) c.innerHTML = `<div class="text-center text-slate-300">Failed to load Events.</div>`;
          hideUILoading();
        }
        return;
      }
      if (typeof window.__events_mount === "function") await window.__events_mount(cleanPath);
      if (!isStale()) hideUILoading();
      return;
    }

    // --------- SPECIAL COMMISSION ---------
    if (startsWithPath(cleanPath, "/special-commission")) {
      try {
        await loadScriptAnyOnce(["Special_Commission.js"]);
        if (isStale()) return;
      } catch (e) {
        console.error(e);
        if (!isStale()) {
          const c = document.getElementById("content");
          if (c) c.innerHTML = `<div class="text-center text-slate-300">Failed to load Special Commission.</div>`;
          hideUILoading();
        }
        return;
      }
      if (typeof window.__special_commission_mount === "function") await window.__special_commission_mount(cleanPath);
      if (!isStale()) hideUILoading();
      return;
    }

    // --------- TIER LIST ---------
    if (startsWithPath(cleanPath, "/tier-list")) {
      try {
        await loadScriptAnyOnce(["Tier_List.js"]);
        if (isStale()) return;
      } catch (e) {
        console.error(e);
        if (!isStale()) {
          const c = document.getElementById("content");
          if (c) c.innerHTML = `<div class="text-center text-slate-300">Failed to load Tier List.</div>`;
          hideUILoading();
        }
        return;
      }
      if (typeof window.__tier_list_mount === "function") await window.__tier_list_mount(cleanPath);
      if (!isStale()) hideUILoading();
      return;
    }

    // --------- CALCULATOR ---------
    if (startsWithPath(cleanPath, "/calculator")) {
      try {
        await loadScriptAnyOnce(["Calculators.js"]);
        if (isStale()) return;
      } catch (e) {
        console.error(e);
        if (!isStale()) {
          const c = document.getElementById("content");
          if (c) c.innerHTML = `<div class="text-center text-slate-300">Failed to load Calculators.</div>`;
          hideUILoading();
        }
        return;
      }
      if (typeof window.__calculators_mount === "function") await window.__calculators_mount(cleanPath);
      if (!isStale()) hideUILoading();
      return;
    }

    // --------- POSTS ---------
    if (startsWithPath(cleanPath, "/posts")) {
      try {
        await loadScriptAnyOnce(["Posts.js", "public/Posts.js"]);
        if (isStale()) return;
      } catch (e) {
        console.error(e);
        if (!isStale()) {
          const c = document.getElementById("content");
          if (c) c.innerHTML = `<div class="text-center text-slate-300">Failed to load Posts.</div>`;
          hideUILoading();
        }
        return;
      }

      if (typeof window.__posts_mount === "function") {
        await window.__posts_mount(cleanPath);
      } else {
        const c = document.getElementById("content");
        if (c) c.innerHTML = `<div class="text-center text-slate-300">Posts.js loaded, but __posts_mount() is missing.</div>`;
      }

      if (!isStale()) hideUILoading();
      return;
    }

    // --------- SUGGESTIONS ---------
    if (startsWithPath(cleanPath, "/suggestions")) {
      try {
        await loadScriptAnyOnce(["Suggestions.js", "public/Suggestions.js"]);
        if (isStale()) return;
      } catch (e) {
        console.error(e);
        if (!isStale()) {
          const c = document.getElementById("content");
          if (c) c.innerHTML = `<div class="text-center text-slate-300">Failed to load Suggestions.</div>`;
          hideUILoading();
        }
        return;
      }

      if (typeof window.__suggestions_mount === "function") {
        await window.__suggestions_mount(cleanPath);
      } else {
        const c = document.getElementById("content");
        if (c) c.innerHTML = `<div class="text-center text-slate-300">Suggestions.js loaded, but __suggestions_mount() is missing.</div>`;
      }

      if (!isStale()) hideUILoading();
      return;
    }

    // --------- ROAD MAP ---------
    if (startsWithPath(cleanPath, "/road-map")) {
      try {
        await loadScriptAnyOnce(["Road_maps.js", "public/Road_maps.js"]);
        if (isStale()) return;
      } catch (e) {
        console.error(e);
        if (!isStale()) {
          const c = document.getElementById("content");
          if (c) c.innerHTML = `<div class="text-center text-slate-300">Failed to load Road Map.</div>`;
          hideUILoading();
        }
        return;
      }

      if (typeof window.__road_maps_mount === "function") {
        window.__road_maps_mount(cleanPath);
      } else {
        const c = document.getElementById("content");
        if (c) c.innerHTML = `<div class="text-center text-slate-300">Road_maps.js loaded, but __road_maps_mount() is missing.</div>`;
      }

      if (!isStale()) hideUILoading();
      return;
    }

    // --------- STATS ---------
    if (startsWithPath(cleanPath, "/stats")) {
      try {
        await loadScriptAnyOnce(["Comingsoon.js"]);
        if (isStale()) return;
      } catch (e) {
        console.warn("Stats.js missing -> fallback to Coming Soon");
        await renderComingSoon(cleanPath);
        return;
      }
      if (typeof window.__stats_mount === "function") await window.__stats_mount(cleanPath);
      if (!isStale()) hideUILoading();
      return;
    }

    // --------- MEMBERS ---------
    if (startsWithPath(cleanPath, "/members")) {
      if (isMembersProfilePath(cleanPath)) {
        try {
          await loadScriptAnyOnce(["User.js"]);
          if (isStale()) return;
        } catch (e) {
          console.error(e);
          if (!isStale()) {
            const c = document.getElementById("content");
            if (c) c.innerHTML = `<div class="text-center text-slate-300">Failed to load User profile.</div>`;
            hideUILoading();
          }
          return;
        }
        if (typeof window.__user_mount === "function") await window.__user_mount(cleanPath);
        if (!isStale()) hideUILoading();
        return;
      }

      if (cleanPath === "/members") {
        try {
          await loadScriptAnyOnce(["Members.js"]);
          if (isStale()) return;
        } catch (e) {
          console.error(e);
          if (!isStale()) {
            const c = document.getElementById("content");
            if (c) c.innerHTML = `<div class="text-center text-slate-300">Failed to load Members.</div>`;
            hideUILoading();
          }
          return;
        }
        if (typeof window.__members_mount === "function") await window.__members_mount(cleanPath);
        if (!isStale()) hideUILoading();
        return;
      }

      try { history.replaceState({}, "", withBase("/members")); } catch {}
      return routeTo("/members", { push: false });
    }

    // --------- ADMIN ---------
    if (startsWithPath(cleanPath, "/admin")) {
      try {
        await loadScriptAnyOnce(["Admin.js", "public/Admin.js"]);
        if (isStale()) return;
      } catch (e) {
        console.error(e);
        if (!isStale()) {
          const c = document.getElementById("content");
          if (c) c.innerHTML = `<div class="text-center text-slate-300">Failed to load Admin.</div>`;
          hideUILoading();
        }
        return;
      }
      if (typeof window.__admin_mount === "function") await window.__admin_mount(cleanPath);
      if (!isStale()) hideUILoading();
      return;
    }

    // --------- CREATOR CODE ---------
    if (startsWithPath(cleanPath, "/creator-code")) {
      try {
        await loadScriptAnyOnce(["Creator-Code.js"]);
        if (isStale()) return;
      } catch (e) {
        console.error(e);
        if (!isStale()) {
          const c = document.getElementById("content");
          if (c) c.innerHTML = `<div class="text-center text-slate-300">Failed to load Creator Code.</div>`;
          hideUILoading();
        }
        return;
      }
      if (typeof window.__creator_code_mount === "function") await window.__creator_code_mount(cleanPath);
      if (!isStale()) hideUILoading();
      return;
    }

    // --------- BUILDS ---------
    if (startsWithPath(cleanPath, "/builds")) {
      try {
        await loadScriptAnyOnce(["Builds.js"]);
        if (isStale()) return;
      } catch (e) {
        console.error(e);
        if (!isStale()) {
          const c = document.getElementById("content");
          if (c) c.innerHTML = `<div class="text-center text-slate-300">Failed to load Builds.</div>`;
          hideUILoading();
        }
        return;
      }
      if (typeof window.__builds_mount === "function") await window.__builds_mount(cleanPath);
      if (!isStale()) hideUILoading();
      return;
    }

    // --------- PICTURES ---------
    if (startsWithPath(cleanPath, "/pictures")) {
      try {
        await loadScriptAnyOnce(["Pictures.js"]);
        if (isStale()) return;
      } catch (e) {
        console.error(e);
        if (!isStale()) {
          const c = document.getElementById("content");
          if (c) c.innerHTML = `<div class="text-center text-slate-300">Failed to load Pictures.</div>`;
          hideUILoading();
        }
        return;
      }
      if (typeof window.__pictures_mount === "function") await window.__pictures_mount(cleanPath);
      if (!isStale()) hideUILoading();
      return;
    }

    // --------- CORES ---------
    if (startsWithPath(cleanPath, "/cores")) {
      try {
        await loadScriptAnyOnce(["Cores.js"]);
        if (isStale()) return;
      } catch (e) {
        console.error(e);
        if (!isStale()) {
          const c = document.getElementById("content");
          if (c) c.innerHTML = `<div class="text-center text-slate-300">Failed to load Cores.</div>`;
          hideUILoading();
        }
        return;
      }
      if (typeof window.__cores_mount === "function") await window.__cores_mount(cleanPath);
      if (!isStale()) hideUILoading();
      return;
    }

    // --------- ARTIFACTS ---------
    if (startsWithPath(cleanPath, "/artifacts")) {
      try {
        await loadScriptAnyOnce(["Artifacts.js"]);
        if (isStale()) return;
      } catch (e) {
        console.error(e);
        if (!isStale()) {
          const c = document.getElementById("content");
          if (c) c.innerHTML = `<div class="text-center text-slate-300">Failed to load Artifacts.</div>`;
          hideUILoading();
        }
        return;
      }
      if (typeof window.__artifacts_mount === "function") await window.__artifacts_mount(cleanPath);
      if (!isStale()) hideUILoading();
      return;
    }

    // --------- BLESSING STONES ---------
    if (startsWithPath(cleanPath, "/blessing-stones")) {
      try {
        await loadScriptAnyOnce(["Blessing_Stones.js"]);
        if (isStale()) return;
      } catch (e) {
        console.error(e);
        if (!isStale()) {
          const c = document.getElementById("content");
          if (c) c.innerHTML = `<div class="text-center text-slate-300">Failed to load Blessing Stones.</div>`;
          hideUILoading();
        }
        return;
      }
      if (typeof window.__blessing_stones_mount === "function") await window.__blessing_stones_mount(cleanPath);
      if (!isStale()) hideUILoading();
      return;
    }

    // --------- PVP ---------
    if (startsWithPath(cleanPath, "/pvp")) {
      try {
        await loadScriptAnyOnce(["Pvp.js"]);
        if (isStale()) return;
      } catch (e) {
        console.error(e);
        if (!isStale()) {
          const c = document.getElementById("content");
          if (c) c.innerHTML = `<div class="text-center text-slate-300">Failed to load PvP.</div>`;
          hideUILoading();
        }
        return;
      }
      if (typeof window.__pvp_mount === "function") await window.__pvp_mount(cleanPath);
      if (!isStale()) hideUILoading();
      return;
    }

    // --------- MINI GAME ---------
    if (startsWithPath(cleanPath, "/mini-game")) {
      try {
        await loadScriptAnyOnce(["MiniGame.js", "public/MiniGame.js"]);
        if (isStale()) return;
      } catch (e) {
        console.error(e);
        if (!isStale()) {
          const c = document.getElementById("content");
          if (c) c.innerHTML = `<div class="text-center text-slate-300">Failed to load Mini Game.</div>`;
          hideUILoading();
        }
        return;
      }
      if (typeof window.__mini_game_mount === "function") await window.__mini_game_mount(cleanPath);
      if (!isStale()) hideUILoading();
      return;
    }


    // --------- HUNTER GUESS ---------
    if (startsWithPath(cleanPath, "/hunter-guess")) {
      try {
        await loadScriptAnyOnce(["HunterGuess.js", "public/HunterGuess.js"]);
        if (isStale()) return;
      } catch (e) {
        console.error(e);
        if (!isStale()) {
          const c = document.getElementById("content");
          if (c) c.innerHTML = `<div class="text-center text-slate-300">Failed to load Hunter Guess.</div>`;
          hideUILoading();
        }
        return;
      }
      if (typeof window.__hunter_guess_mount === "function") await window.__hunter_guess_mount(cleanPath);
      if (!isStale()) hideUILoading();
      return;
    }

    // --------- ORACLE ---------
    if (startsWithPath(cleanPath, "/oracle")) {
      try {
        await loadScriptAnyOnce(["Oracle.js", "public/Oracle.js"]);
        if (isStale()) return;
      } catch (e) {
        console.error(e);
        if (!isStale()) {
          const c = document.getElementById("content");
          if (c) c.innerHTML = `<div class="text-center text-slate-300">Failed to load Oracle.</div>`;
          hideUILoading();
        }
        return;
      }

      if (typeof window.__oracle_mount === "function") {
        await window.__oracle_mount(cleanPath);
      } else {
        const c = document.getElementById("content");
        if (c) c.innerHTML = `<div class="text-center text-slate-300">Oracle.js loaded, but __oracle_mount() is missing.</div>`;
      }

      if (!isStale()) hideUILoading();
      return;
    }

    if (isStale()) return;
    syncSidebarActive("/");
    try { window.renderMainPage?.(); } catch {}
    if (!isStale()) hideUILoading();
  }

  window.routeTo = routeTo;

  function initPopstate() {
    window.addEventListener("popstate", () => {
      const p = normalizePath(window.location.pathname || "/");
      routeTo(p, { push: false });
    });
  }

  /* =========================
     ✅ AUTH UI mount
     ========================= */

  function getAuthMount() {
    const authArea = document.getElementById("authArea");
    if (authArea) return { type: "area", node: authArea };

    const btn = qs('button[title="Login with Discord"]');
    if (btn) return { type: "button", node: btn };

    const profileBtn = document.getElementById("slaProfileBtn");
    if (profileBtn) return { type: "button", node: profileBtn };

    return null;
  }

  function buildProfileDropdownHtml(user) {
    const avatar = discordAvatarUrl(user?.discordId, user?.avatar) || "";
    const name = shortName(user?.displayName || user?.username || "User");
    const customKey = getCustomNameKey(user);
    const custom = (() => {
      try {
        const v = localStorage.getItem(customKey);
        return (v && String(v).trim()) ? String(v).trim() : null;
      } catch { return null; }
    })();

    const showAdmin = !!window.STATE.isAdmin;

    const item = (path, label, cls = "") => `
      <a href="${withBase(path)}" data-nav="${path}"
         class="block px-3 py-2.5 text-sm font-semibold hover:bg-slate-700/25 transition ${cls}">
        ${label}
      </a>
    `;

    return `
      <div class="relative">
        <button id="slaProfileBtn"
          class="h-10 px-3 rounded-xl border border-slate-700/45 bg-slate-950/20 hover:bg-slate-950/30 transition inline-flex items-center gap-2"
          aria-expanded="false">
          ${avatar ? `<img src="${avatar}" class="w-7 h-7 rounded-full" />` : `<div class="w-7 h-7 rounded-full bg-slate-700/60"></div>`}
          <span class="font-extrabold text-sm">${custom || name}</span>
          <i class="fa-solid fa-chevron-down text-xs opacity-80"></i>
        </button>

        <div id="slaUserMenu"
          class="absolute right-0 mt-2 w-56 rounded-2xl border border-slate-700/45 bg-slate-950/90 backdrop-blur-md shadow-2xl overflow-hidden
                 pointer-events-none opacity-0 scale-95 transition">
          <div class="px-3 py-2.5 text-xs font-bold uppercase text-slate-300/80">Account</div>

          ${item("/dashboard", "Dashboard")}
          ${item("/members", "Members")}
          ${item("/suggestions", "Suggestions")}
          ${
            showAdmin
              ? `
                <div class="h-px bg-slate-700/60"></div>
                ${item("/admin", "Admin", "text-yellow-200 hover:bg-yellow-500/10")}
              `
              : ""
          }

          <div class="h-px bg-slate-700/60"></div>

          <button id="slaLogoutBtn"
            class="w-full text-left px-3 py-2.5 text-sm font-semibold text-rose-200 hover:bg-rose-500/15 transition">
            Logout
          </button>
        </div>
      </div>
    `;
  }

  function closeDropdown() {
    const menu = document.getElementById("slaUserMenu");
    const btn = document.getElementById("slaProfileBtn");
    if (!menu || !btn) return;
    menu.classList.add("pointer-events-none", "opacity-0", "scale-95");
    btn.setAttribute("aria-expanded", "false");
  }

  function openDropdown() {
    const menu = document.getElementById("slaUserMenu");
    const btn = document.getElementById("slaProfileBtn");
    if (!menu || !btn) return;
    menu.classList.remove("pointer-events-none", "opacity-0", "scale-95");
    btn.setAttribute("aria-expanded", "true");
  }

  function toggleDropdown() {
    const menu = document.getElementById("slaUserMenu");
    const isOpen = menu && !menu.classList.contains("pointer-events-none");
    if (isOpen) closeDropdown();
    else openDropdown();
  }

  function bindDropdownGlobalClose(container) {
    function onDocClick(e) {
      const menu = document.getElementById("slaUserMenu");
      const btn = document.getElementById("slaProfileBtn");
      if (!menu || !btn) return;
      if (btn.contains(e.target) || menu.contains(e.target)) return;
      closeDropdown();
    }

    function onKey(e) {
      if (e.key === "Escape") closeDropdown();
    }

    document.addEventListener("click", onDocClick);
    document.addEventListener("keydown", onKey);

    container._slaCleanup = () => {
      document.removeEventListener("click", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }

  async function doLogout() {
    try {
      await fetch(joinBase("/logout"), { method: "POST", credentials: "include" });
    } catch {}
    try { history.replaceState({}, "", withBase("/")); } catch {}
    window.STATE.me = null;
    window.STATE.isAdmin = false;
    closeDropdown();
    try { window.renderAuth?.(); } catch {}
    try {
      if (document.body?.classList.contains("sla-maintenance-shell")) return;
      if (typeof window.routeTo === "function") window.routeTo("/", { push: false });
      else window.renderMainPage?.();
    } catch {}
  }

  function renderLoggedOutToAuthArea(container) {
    container.innerHTML = `
      <button id="slaLoginBtn"
        class="px-3 h-10 rounded-xl border font-semibold inline-flex items-center bg-slate-800 text-slate-100 border-slate-700 hover:bg-slate-700"
        title="Login with Discord">
        <i class="fa-brands fa-discord mr-2"></i>
        <span class="hidden sm:inline">Login with Discord</span>
        <span class="sm:hidden">Login</span>
      </button>
    `;
    forceDarkMode();
    qs("#slaLoginBtn", container)?.addEventListener("click", (e) => {
      e.preventDefault();
      window.location.href = joinBase("/auth/discord");
    });
  }

  function renderLoggedOutToButton(btn) {
    forceDarkMode();
    btn.onclick = (e) => {
      e.preventDefault();
      window.location.href = joinBase("/auth/discord");
    };
  }

  function renderLoggedIn(container, user) {
    forceDarkMode();
    try { container._slaCleanup?.(); } catch {}
    container.innerHTML = buildProfileDropdownHtml(user);

    qs("#slaProfileBtn", container)?.addEventListener("click", (e) => {
      e.preventDefault();
      toggleDropdown();
    });

    container.querySelectorAll("a[data-nav]").forEach((a) => {
      a.addEventListener("click", async (e) => {
        if (!isPlainLeftClick(e)) return;
        e.preventDefault();
        closeDropdown();
        await routeTo(a.getAttribute("data-nav"));
      });
    });

    qs("#slaLogoutBtn", container)?.addEventListener("click", async (e) => {
      e.preventDefault();
      await doLogout();
    });

    bindDropdownGlobalClose(container);
  }

  function renderLoggedInIntoButton(buttonNode, user) {
    forceDarkMode();
    const wrap = document.createElement("div");
    wrap.id = "authArea";
    wrap.className = "inline-flex items-center";
    wrap.innerHTML = buildProfileDropdownHtml(user);

    buttonNode.replaceWith(wrap);
    renderLoggedIn(wrap, user);
  }

  async function renderAuth() {
    ensureGlobals();
    forceDarkMode();

    const mount = getAuthMount();
    if (!mount) return;

    if (mount.type === "area") {
      mount.node.innerHTML = `<div class="h-10 w-[140px] rounded-xl border border-slate-700 bg-slate-800/80"></div>`;
    }

    const me = await fetchMe();

    if (!me) {
      window.STATE.isAdmin = false;
      if (mount.type === "area") renderLoggedOutToAuthArea(mount.node);
      else renderLoggedOutToButton(mount.node);
      return;
    }

    await fetchIsAdmin();

    if (mount.type === "area") renderLoggedIn(mount.node, me);
    else renderLoggedInIntoButton(mount.node, me);
  }

  window.renderAuth = renderAuth;

  function init() {
    ensureGlobals();
    forceDarkMode();
    initPopstate();

    const t = setInterval(() => {
      if (getAuthMount()) {
        clearInterval(t);
        renderAuth();

        const p = normalizePath(window.location.pathname || "/");
        syncSidebarActive(p);
        routeTo(p, { push: false });
      }
    }, 150);

    setTimeout(() => clearInterval(t), 10000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
