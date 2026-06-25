'use strict';

/**
 * app.js — layout shell + sidebar/topbar (mobile off-canvas).
 * Uses window.renderMainPage() from Main.js to render Home content.
 */

/* =========================
   FORCE DARK MODE — ALWAYS
   ========================= */
(function forceDarkThemeEverywhere() {
  function applyDark() {
    const root = document.documentElement;
    if (!root) return;

    root.classList.remove('light');
    root.classList.add('dark');
    root.dataset.theme = 'dark';
    root.style.colorScheme = 'dark';

    if (document.body) {
      document.body.classList.remove('light');
      document.body.classList.add('dark');
      document.body.style.colorScheme = 'dark';
    }

    try {
      localStorage.setItem('theme', 'dark');
      localStorage.setItem('color-theme', 'dark');
      localStorage.setItem('mode', 'dark');
      sessionStorage.setItem('theme', 'dark');
      sessionStorage.setItem('color-theme', 'dark');
    } catch (_) {}
  }

  applyDark();

  let observerStarted = false;
  function startThemeObserver() {
    if (observerStarted) return;
    observerStarted = true;

    const root = document.documentElement;
    if (!root) return;

    const observer = new MutationObserver(() => {
      const hasDark = root.classList.contains('dark');
      const hasLight = root.classList.contains('light');
      const wrongTheme = root.dataset.theme && root.dataset.theme !== 'dark';

      if (!hasDark || hasLight || wrongTheme) {
        applyDark();
      }
    });

    observer.observe(root, {
      attributes: true,
      attributeFilter: ['class', 'data-theme', 'style']
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      applyDark();
      startThemeObserver();
    }, { once: true });
  } else {
    startThemeObserver();
  }

  window.forceDarkMode = applyDark;
  window.applyDarkTheme = applyDark;
})();
/* ========================= */

/* =========================
   ✅ Cloudinary helper (GLOBAL)
   - f_auto => webp/avif auto
   - q_auto => quality auto
   - c_scale,w_XXX => resize
   ========================= */
window.cdny = function cdny(url, w = 256){
  if (!url) return '';
  const s = String(url);

  if (!s.includes('/image/upload/')) return s;
  if (s.includes('/image/upload/f_auto')) return s;

  return s.replace(
    '/image/upload/',
    `/image/upload/f_auto,q_auto,c_scale,w_${w}/`
  );
};
/* ========================= */

const LOGO_EXPANDED  = window.cdny("/picture/Logo.png", 320);
const LOGO_COLLAPSED = window.cdny("/picture/Logo_small.png", 128);

const SIDEBAR_W = 259;
const SIDEBAR_W_COLLAPSED = 64;
const SIDEBAR_W_COLLAPSED_SCROLL = 76;
const TOP_H = 74;
const MOBILE_BP = 768;

const ADMIN_HIDE_KEY = "sla_hide_admin_buttons";
const ADMIN_VIEW_MENU_LIKE_USER_KEY = "sla_admin_view_menu_like_user";
const SIDEBAR_GROUPS_COLLAPSED_KEY = "sla_sidebar_group_collapsed";

const BASE_PATH = (() => {
  const w = window.__BASE_PATH__ || window.BASE_PATH || window.__SLA_BASE__;
  if (typeof w === "string" && w.trim()) return cleanBase(w.trim());

  const p = String(window.location.pathname || "/");
  const parts = p.split("/").filter(Boolean);
  if (parts.length > 0) {
    const first = "/" + parts[0];
    if (first === "/slahub") return "/slahub";
  }
  return "";
})();

function cleanBase(b) {
  let s = String(b || "").trim();
  if (!s) return "";
  if (!s.startsWith("/")) s = "/" + s;
  s = s.replace(/\/+$/, "");
  return s === "/" ? "" : s;
}

function apiUrl(p) {
  const base = BASE_PATH || "";
  const tail = String(p || "");
  return base ? (base + tail) : tail;
}

const NAV_GROUPS_PUBLIC = [
  {
    group: "Collection",
    icon: "fa-solid fa-layer-group",
    items: [
      { label: "Hunters", icon: "fa-solid fa-user-group", path: "/hunters", menuKey: "hunters" },
      { label: "Hunters - Weapons", icon: "fa-solid fa-gun", path: "/hunter-weapons", menuKey: "hunterWeapons" },
      { label: "Sung Jinwoo - Weapons", icon: "fa-solid fa-gun", path: "/sjw-weapons", menuKey: "sungWeapons" },
      { label: "Shadows", icon: "fa-solid fa-ghost", path: "/shadows", menuKey: "shadows" },
      { label: "Successors", icon: "fa-solid fa-users-rays", path: "/successors", menuKey: "successors" },
    ],
  },
  {
    group: "Systems",
    icon: "fa-solid fa-gears",
    items: [
      { label: "Gems", icon: "fa-solid fa-gem", path: "/gems", menuKey: "gems" },
      { label: "Tier List", icon: "fa-solid fa-ranking-star", path: "/tier-list", menuKey: "tierList" },
      { label: "Special Commission", icon: "fa-solid fa-clipboard-list", path: "/special-commission", menuKey: "specialCommission" },
      { label: "Cores", icon: "fa-solid fa-life-ring", path: "/cores", menuKey: "cores" },
      { label: "Artifacts", icon: "fa-solid fa-shirt", path: "/artifacts", menuKey: "artifacts" },
      { label: "Blessing Stones", icon: "fa-solid fa-octagon", path: "/blessing-stones", menuKey: "blessingStones" },
      { label: "PvP", icon: "fa-solid fa-skull-crossbones", path: "/pvp", menuKey: "pvp" },
      { label: "Calculator", icon: "fa-solid fa-calculator", path: "/calculator", menuKey: "calculator" },
    ],
  },
  {
    group: "Mini Games",
    icon: "fa-solid fa-gamepad",
    items: [
      { label: "Mini Game", icon: "fa-solid fa-dungeon", path: "/mini-game", menuKey: "miniGame" },
      { label: "Hunter Guess", icon: "fa-solid fa-magnifying-glass-chart", path: "/hunter-guess", menuKey: "hunterGuess" },
    ],
  },
  {
    group: "Community",
    icon: "fa-solid fa-comments",
    items: [
      { label: "Posts", icon: "fa-solid fa-newspaper", path: "/posts", menuKey: "posts" },
      { label: "Road Map", icon: "fa-solid fa-map", path: "/road-map", menuKey: "roadMap" },
      { label: "Tickets & Suggestions", icon: "fa-solid fa-ticket", path: "/suggestions", menuKey: "suggestions" },
    ],
  },
];

const NAV_GROUP_ADMIN = {
  group: "Admin",
  icon: "fa-solid fa-user-shield",
  adminOnly: true,
  items: [
    { label: "Admin", icon: "fa-solid fa-user-shield", path: "/admin" },
    { label: "Creator Code", icon: "fa-solid fa-tag", path: "/creator-code" },
    { label: "Events", icon: "fa-solid fa-calendar-days", path: "/events" },
    { label: "Builds", icon: "fa-solid fa-hammer", path: "/builds" },
    { label: "Pictures", icon: "fa-solid fa-images", path: "/pictures" },
  ],
};

const NAV_ADMIN_ALWAYS_GROUP = {
  ...NAV_GROUP_ADMIN,
  items: NAV_GROUP_ADMIN.items.slice(0, 1),
};

const NAV_PUBLIC = flattenNavGroups(NAV_GROUPS_PUBLIC);
const NAV_ADMIN = NAV_GROUP_ADMIN.items;

let NAV_ACTIVE = [...NAV_PUBLIC];

const adminCtx = {
  isAdmin: false,
  hideAdminButtons: loadBool(ADMIN_HIDE_KEY, false),
  menuVisibility: {},
  menuAdminVisibility: {},
  navEl: null,
};

const state = {
  collapsed: loadBool("sla_sidebar_collapsed", false),
  mobileOpen: false,
  dailyReset: {
    hour: 0,
    minute: 0,
    second: 0,
    timerId: null,
  },
};

function ensureActiveNavCss() {
  if (document.getElementById("slaActiveNavCss")) return;

  const style = document.createElement("style");
  style.id = "slaActiveNavCss";
  style.textContent = `
    .sla-nav-section {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin-top: 10px;
    }

    .sla-nav-section:first-child {
      margin-top: 0;
    }

    .sla-nav-section-head {
      width: 100%;
      border: 0;
      background: transparent;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      min-height: 32px;
      padding: 7px 8px 3px;
      color: rgba(148, 163, 184, .82);
      font-size: 11px;
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: .08em;
      text-align: left;
    }

    .sla-nav-section-head i {
      font-size: 11px;
      color: rgba(250, 204, 21, .72);
    }

    .sla-nav-section-left {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }

    .sla-nav-section-chevron {
      font-size: 10px;
      opacity: .75;
      transition: transform .18s ease, opacity .18s ease;
    }

    .sla-nav-section.is-collapsed .sla-nav-section-chevron {
      transform: rotate(-90deg);
    }

    .sla-nav-section-head:hover {
      color: rgba(226,232,240,.95);
    }

    .sla-nav-section-head:hover .sla-nav-section-chevron {
      opacity: 1;
    }

    .sla-nav-section-items {
      overflow: hidden;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .sla-nav-section-items.is-collapsed {
      display: none;
    }

    .sla-navbtn {
      width: 100%;
      min-height: 40px;
      padding: 0 9px;
      display: flex;
      align-items: center;
      border-radius: 12px;
      border: 1px solid rgba(51, 65, 85, .75);
      background: rgba(15, 23, 42, .36);
      color: #e2e8f0;
      transition: background .14s ease, border-color .14s ease, box-shadow .14s ease;
    }

    .sla-navbtn:hover {
      background: rgba(30, 41, 59, .88);
      border-color: rgba(148, 163, 184, .38);
      box-shadow: 0 8px 22px rgba(0,0,0,.18);
    }

    .sla-navbtn.sla-active {
      background: rgba(250, 204, 21, .16) !important;
      color: #fde68a !important;
      border-color: rgba(250, 204, 21, .48) !important;
      box-shadow: inset 0 0 0 1px rgba(250,204,21,.08), 0 8px 22px rgba(0,0,0,.20) !important;
      opacity: 1 !important;
    }

    .sla-navbtn.sla-active i,
    .sla-navbtn.sla-active span {
      color: #fde68a !important;
    }

    .sla-navbtn.sla-active:hover {
      background: rgba(250, 204, 21, .18) !important;
    }

    .sla-iconSlot {
      width: 34px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .sla-iconSlot i {
      font-size: 15px;
    }

    .sla-navlabel {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 14px;
      font-weight: 800;
    }

    body.sla-collapsed .sla-nav-section {
      align-items: stretch;
      margin-top: 8px;
    }

    body.sla-collapsed .sla-nav-section-head {
      justify-content: center;
      padding: 7px 0 2px;
    }

    body.sla-collapsed .sla-nav-section-left {
      justify-content: center;
    }

    body.sla-collapsed .sla-nav-section-chevron {
      display: none;
    }

    body.sla-collapsed .sla-nav-section-title {
      display: none;
    }

    body.sla-collapsed .sla-navbtn {
      justify-content: center;
      padding-left: 0;
      padding-right: 0;
    }

    body.sla-collapsed .sla-navlabel {
      display: none;
    }

    body.sla-collapsed .sla-iconSlot {
      width: 100%;
    }

    .sla-navbtn.sla-disabled-exact {
      pointer-events: none !important;
      cursor: default !important;
    }

    .sla-burger { position: relative; width:22px; height:16px; }
    .sla-burger-line{
      position:absolute; left:0; right:0;
      height:2px; border-radius:999px;
      background: rgba(255,255,255,.92);
      transition: transform .38s ease, top .38s ease, opacity .28s ease;
    }
    .sla-burger-top{ top:0; }
    .sla-burger-mid{ top:7px; }
    .sla-burger-bot{ top:14px; }

    #toggleSidebar.is-open .sla-burger-top{ top:7px; transform: rotate(45deg); }
    #toggleSidebar.is-open .sla-burger-mid{ opacity:0; }
    #toggleSidebar.is-open .sla-burger-bot{ top:7px; transform: rotate(-45deg); }

    #toggleIconDesktop{
      display:inline-block;
      transform-origin:center;
      transition: transform .28s ease-in-out;
    }
    #toggleIconDesktop.sla-rot{
      transform: rotate(180deg);
    }

    #topBarLeft{
      min-width: 0;
    }

    #dailyResetBadge{
      display: none;
      align-items: center;
      justify-content: center;
      gap: 8px;
      height: 40px;
      min-width: 92px;
      padding: 0 12px;
      border-radius: 12px;
      border: 1px solid rgba(250, 204, 21, 0.28);
      background: rgba(15, 23, 42, 0.78);
      color: #facc15;
      white-space: nowrap;
      user-select: none;
      cursor: default;
    }

    #dailyResetBadge.is-visible{
      display: inline-flex;
    }

    #dailyResetBadge:not(.is-admin){
      pointer-events: none;
    }

    #dailyResetBadge.is-admin{
      cursor: pointer;
      pointer-events: auto;
      transition: background .2s ease, border-color .2s ease, transform .2s ease;
    }

    #dailyResetBadge.is-admin:hover{
      background: rgba(30, 41, 59, 0.95);
      border-color: rgba(250, 204, 21, 0.55);
      transform: translateY(-1px);
    }

    #dailyResetBadge .dr-time{
      font-size: 15px;
      line-height: 1;
      font-weight: 900;
      color: #facc15;
      font-variant-numeric: tabular-nums;
    }

    .sla-time-grid{
      display:grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 12px;
    }

    .sla-time-field{
      display:grid;
      gap:8px;
    }

    .sla-time-mini-label{
      color:#cbd5e1;
      font-size:12px;
      font-weight:800;
      letter-spacing:.08em;
      text-transform:uppercase;
    }

    .sla-modal-overlay{
      position: fixed;
      inset: 0;
      z-index: 9999;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
      background: rgba(0,0,0,.72);
    }

    .sla-modal-card{
      width: min(520px, 92vw);
      border-radius: 16px;
      border: 1px solid rgba(51, 65, 85, .9);
      background: rgba(15, 23, 42, .98);
      box-shadow: 0 24px 64px rgba(0, 0, 0, .45);
      overflow: hidden;
    }

    .sla-modal-head{
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:12px;
      padding:16px 18px;
      border-bottom: 1px solid rgba(51, 65, 85, .75);
    }

    .sla-modal-title{
      color:#f8fafc;
      font-weight:800;
      font-size:18px;
    }

    .sla-modal-body{
      padding:18px;
      display:grid;
      gap:14px;
    }

    .sla-modal-label{
      color:#e2e8f0;
      font-size:14px;
      font-weight:700;
    }

    .sla-modal-input{
      width:100%;
      height:42px;
      padding:0 14px;
      border-radius:12px;
      border:1px solid rgba(51, 65, 85, .95);
      background: rgba(2, 6, 23, .95);
      color:#f8fafc;
      outline:none;
    }

    .sla-modal-input:focus{
      border-color: rgba(250, 204, 21, .55);
      box-shadow: 0 0 0 2px rgba(250, 204, 21, .14);
    }

    .sla-modal-hint{
      color: rgba(226, 232, 240, .68);
      font-size: 12px;
      line-height: 1.35;
    }

    .sla-modal-actions{
      display:flex;
      align-items:center;
      justify-content:flex-end;
      gap:10px;
      margin-top:4px;
    }

    .sla-btn-muted{
      height:40px;
      padding:0 14px;
      border-radius:12px;
      border:1px solid rgba(71, 85, 105, .95);
      background: rgba(15, 23, 42, .9);
      color:#e2e8f0;
      font-weight:700;
      transition: background .2s ease, border-color .2s ease;
    }

    .sla-btn-muted:hover{
      background: rgba(30, 41, 59, .95);
      border-color: rgba(100, 116, 139, .95);
    }

    .sla-btn-gold{
      height:40px;
      padding:0 16px;
      border-radius:12px;
      border:1px solid rgba(250, 204, 21, .32);
      background: rgba(250, 204, 21, .16);
      color:#fde68a;
      font-weight:800;
      transition: background .2s ease, border-color .2s ease;
    }

    .sla-btn-gold:hover{
      background: rgba(250, 204, 21, .22);
      border-color: rgba(250, 204, 21, .55);
    }

    @media (max-width: 767px){
      #dailyResetBadge{
        display:none !important;
      }
    }

    @media (max-width: 767px){
      #sideBar{
        transform: translateX(-110%);
        transition: transform .32s ease-in-out;
      }
    }

    @media (max-width: 767px){
      #toggleIconDesktop{ display:none !important; }
      #toggleSidebar .sla-burger{ display:inline-block !important; }
    }
    @media (min-width: 768px){
      #toggleIconDesktop{ display:inline-block !important; }
      #toggleSidebar .sla-burger{ display:none !important; }
    }
  `;
  document.head.appendChild(style);
}

function ensureLoadingUI(){
  let el = document.getElementById("slaLoading");
  if (el) return el;

  if (typeof window.forceDarkMode === "function") {
    window.forceDarkMode();
  }

  el = document.createElement("div");
  el.id = "slaLoading";
  el.className =
    "fixed left-0 right-0 z-[45] pointer-events-none opacity-0 scale-[0.98] transition-all duration-200 ease-out";
  el.style.top = TOP_H + "px";
  el.style.bottom = "0px";

  el.innerHTML = `
    <div class="w-full h-full grid place-items-center">
      <div class="relative w-[min(520px,92vw)] rounded-2xl border border-slate-700/60 bg-slate-950/35 backdrop-blur-md shadow-2xl overflow-hidden">
        <div class="absolute -top-24 -left-24 w-64 h-64 rounded-full bg-yellow-400/15 blur-3xl"></div>
        <div class="absolute -bottom-24 -right-24 w-64 h-64 rounded-full bg-indigo-400/10 blur-3xl"></div>

        <div class="p-6 sm:p-7">
          <div class="flex items-center gap-4">
            <div class="relative w-12 h-12 shrink-0">
              <div class="absolute inset-0 rounded-full border-2 border-yellow-400/30"></div>
              <div class="absolute inset-0 rounded-full border-2 border-transparent border-t-yellow-400 animate-spin"></div>
              <div class="absolute inset-2 rounded-full border border-slate-200/10"></div>
            </div>

            <div class="min-w-0">
              <div id="slaLoadingTitle" class="text-yellow-300 font-extrabold tracking-wide uppercase text-[13px]">
                Loading…
              </div>
              <div id="slaLoadingText" class="text-slate-200 font-semibold text-[15px] sm:text-[16px] truncate">
                Please wait a moment
              </div>
            </div>
          </div>

          <div class="mt-5 space-y-3">
            <div class="h-3 rounded-full bg-white/5 overflow-hidden">
              <div class="h-full w-[60%] bg-yellow-400/20 animate-pulse"></div>
            </div>
            <div class="grid grid-cols-3 gap-3">
              <div class="h-10 rounded-xl bg-white/5 animate-pulse"></div>
              <div class="h-10 rounded-xl bg-white/5 animate-pulse"></div>
              <div class="h-10 rounded-xl bg-white/5 animate-pulse"></div>
            </div>
            <div class="h-20 rounded-2xl bg-white/5 animate-pulse"></div>
          </div>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(el);

  if (typeof window.forceDarkMode === "function") {
    window.forceDarkMode();
  }

  return el;
}

function showLoading(title = "Loading…", text = "Please wait a moment"){
  const wrap = ensureLoadingUI();
  const t1 = document.getElementById("slaLoadingTitle");
  const t2 = document.getElementById("slaLoadingText");
  if (t1) t1.textContent = title;
  if (t2) t2.textContent = text;

  wrap.classList.remove("pointer-events-none");
  wrap.classList.add("pointer-events-auto");
  wrap.style.opacity = "1";
  wrap.style.transform = "scale(1)";

  if (typeof window.forceDarkMode === "function") {
    window.forceDarkMode();
  }
}

function hideLoading(){
  const wrap = document.getElementById("slaLoading");
  if (!wrap) return;
  wrap.style.opacity = "0";
  wrap.style.transform = "scale(0.98)";
  wrap.classList.add("pointer-events-none");
  wrap.classList.remove("pointer-events-auto");

  if (typeof window.forceDarkMode === "function") {
    window.forceDarkMode();
  }
}

window.uiLoading = {
  show: (text = "Loading…") => showLoading("Loading…", text),
  show2: (title, text) => showLoading(title, text),
  hide: hideLoading
};

function loadBool(key, fallback){
  try {
    const v = localStorage.getItem(key);
    if (v === null) return fallback;
    return v === "1";
  } catch { return fallback; }
}
function saveBool(key, val){
  try { localStorage.setItem(key, val ? "1" : "0"); } catch {}
}

function loadSidebarGroupCollapsed() {
  try {
    const raw = localStorage.getItem(SIDEBAR_GROUPS_COLLAPSED_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveSidebarGroupCollapsed(map) {
  try {
    localStorage.setItem(SIDEBAR_GROUPS_COLLAPSED_KEY, JSON.stringify(map || {}));
  } catch {}
}

function isGroupCollapsed(groupName) {
  const map = loadSidebarGroupCollapsed();
  return !!map[groupName];
}

function setGroupCollapsed(groupName, collapsed) {
  const map = loadSidebarGroupCollapsed();
  map[groupName] = !!collapsed;
  saveSidebarGroupCollapsed(map);
}

function adminViewMenuLikeUser(){
  return loadBool(ADMIN_VIEW_MENU_LIKE_USER_KEY, false);
}

window.__sla_adminViewMenuLikeUser = window.__sla_adminViewMenuLikeUser || adminViewMenuLikeUser;

function flattenNavGroups(groups){
  return (Array.isArray(groups) ? groups : []).flatMap((group) => Array.isArray(group?.items) ? group.items : []);
}

function filterNavGroups(groups, predicate){
  return (Array.isArray(groups) ? groups : []).map((group) => ({
    ...group,
    items: (Array.isArray(group?.items) ? group.items : []).filter(predicate),
  })).filter((group) => group.items.length > 0);
}

function navGroupsForAdminState(){
  const adminBypassesMenuVisibility = adminCtx.isAdmin && !adminViewMenuLikeUser();
  const adminAllowedGroups = adminCtx.isAdmin
    ? filterNavGroups(NAV_GROUPS_PUBLIC, (it) => !it.menuKey || adminCtx.menuAdminVisibility[it.menuKey] !== false)
    : NAV_GROUPS_PUBLIC;
  const publicGroups = adminBypassesMenuVisibility
    ? adminAllowedGroups
    : filterNavGroups(adminAllowedGroups, (it) => !it.menuKey || adminCtx.menuVisibility[it.menuKey] !== false);

  if (!adminCtx.isAdmin) return publicGroups;
  if (adminCtx.hideAdminButtons) {
    return [...publicGroups, NAV_ADMIN_ALWAYS_GROUP];
  }
  return [...publicGroups, NAV_GROUP_ADMIN];
}

function navItemsForAdminState(){
  return flattenNavGroups(navGroupsForAdminState());
}

window.__sla_setAdminButtonsHidden = function setAdminButtonsHidden(hidden){
  adminCtx.hideAdminButtons = !!hidden;
  saveBool(ADMIN_HIDE_KEY, adminCtx.hideAdminButtons);
  if (adminCtx.navEl){
    renderNav(adminCtx.navEl, navGroupsForAdminState());
  }

  if (typeof window.forceDarkMode === "function") {
    window.forceDarkMode();
  }
};

window.__sla_getAdminButtonsHidden = function getAdminButtonsHidden(){
  return !!adminCtx.hideAdminButtons;
};

window.renderSidebar = function renderSidebar(){
  if (adminCtx.navEl) {
    renderNav(adminCtx.navEl, navGroupsForAdminState());
  }
};

async function fetchMenuVisibility(){
  const readVisibility = async (path) => {
    let r = await fetch(apiUrl(path), { credentials: "include", cache: "no-store" });
    if (!r.ok && BASE_PATH) {
      r = await fetch(path, { credentials: "include", cache: "no-store" });
    }
    if (!r.ok) return null;
    const data = await r.json().catch(()=>({}));
    return {
      flags: (data && typeof data.flags === "object" && data.flags) ? data.flags : {},
      adminFlags: (data && typeof data.adminFlags === "object" && data.adminFlags) ? data.adminFlags : {},
    };
  };

  try{
    const visibility = adminCtx.isAdmin
      ? await readVisibility("/api/admin/menu-visibility")
      : await readVisibility("/api/menu-visibility");
    adminCtx.menuVisibility = visibility?.flags || {};
    adminCtx.menuAdminVisibility = visibility?.adminFlags || {};
  }catch(_){
    if (adminCtx.isAdmin) {
      try {
        const visibility = await readVisibility("/api/admin/menu-visibility");
        adminCtx.menuVisibility = visibility?.flags || {};
        adminCtx.menuAdminVisibility = visibility?.adminFlags || {};
      } catch {
        adminCtx.menuVisibility = {};
        adminCtx.menuAdminVisibility = {};
      }
    } else {
      adminCtx.menuVisibility = {};
      adminCtx.menuAdminVisibility = {};
    }
  }
}

window.__sla_debugMenuVisibility = () => ({
  isAdmin: adminCtx.isAdmin,
  viewMenuLikeUser: adminViewMenuLikeUser(),
  menuVisibility: adminCtx.menuVisibility,
  menuAdminVisibility: adminCtx.menuAdminVisibility,
  items: navItemsForAdminState().filter(x => !x.divider).map(x => ({
    label: x.label,
    menuKey: x.menuKey || null,
    hiddenByFlag: x.menuKey ? adminCtx.menuVisibility[x.menuKey] === false : false,
    hiddenForAdmin: x.menuKey ? adminCtx.menuAdminVisibility[x.menuKey] === false : false
  }))
});

function stripBaseFromPath(pathname){
  const p = String(pathname || "/");
  const base = BASE_PATH || "";
  if (!base) return p;
  if (p === base) return "/";
  if (p.startsWith(base + "/")) return p.slice(base.length) || "/";
  return p;
}

function normalizePath(p){
  let s = String(p || "/");
  s = stripBaseFromPath(s);

  if (!s.startsWith("/")) s = "/" + s;
  if (s.length > 1) s = s.replace(/\/+$/, "");
  return s;
}

function groupContainsActivePath(group, currentPath) {
  const cur = normalizePath(currentPath || window.location.pathname || "/");
  const items = Array.isArray(group?.items) ? group.items : [];

  for (const it of items) {
    if (!it?.path) continue;
    const p = normalizePath(it.path);
    if (cur === p || cur.startsWith(p + "/")) return true;
  }

  return false;
}

function withBase(path){
  const clean = normalizePath(path);
  return (BASE_PATH ? BASE_PATH + clean : clean);
}

function isPlainLeftClick(e){
  return e && e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey;
}

function isMobile(){
  return window.matchMedia(`(max-width: ${MOBILE_BP - 1}px)`).matches;
}

function sidebarNeedsVerticalScroll(){
  const nav = document.getElementById("slaNav");
  if (!nav) return false;
  return nav.scrollHeight > nav.clientHeight + 1;
}

function currentSidebarW(){
  if (state.collapsed && sidebarNeedsVerticalScroll()) return SIDEBAR_W_COLLAPSED_SCROLL;
  return state.collapsed ? SIDEBAR_W_COLLAPSED : SIDEBAR_W;
}

let __mobileScrollLockY = 0;
let __mobileScrollLocked = false;

function lockScroll(locked){
  if (locked) {
    if (__mobileScrollLocked) return;

    __mobileScrollLockY =
      window.scrollY ||
      document.documentElement.scrollTop ||
      document.body.scrollTop ||
      0;

    __mobileScrollLocked = true;

    document.documentElement.style.overflow = "hidden";

    document.body.style.position = "fixed";
    document.body.style.top = `-${__mobileScrollLockY}px`;
    document.body.style.left = "0";
    document.body.style.right = "0";
    document.body.style.width = "100%";
    document.body.style.overflow = "hidden";
    document.body.style.touchAction = "none";
  } else {
    if (!__mobileScrollLocked) {
      document.documentElement.style.overflow = "";
      document.body.style.overflow = "";
      document.body.style.touchAction = "";
      return;
    }

    const y = __mobileScrollLockY || 0;

    __mobileScrollLocked = false;
    __mobileScrollLockY = 0;

    document.documentElement.style.overflow = "";

    document.body.style.position = "";
    document.body.style.top = "";
    document.body.style.left = "";
    document.body.style.right = "";
    document.body.style.width = "";
    document.body.style.overflow = "";
    document.body.style.touchAction = "";

    requestAnimationFrame(() => {
      window.scrollTo(0, y);
    });
  }
}

function ensureOverlay(){
  let ov = document.getElementById("slaOverlay");
  if (!ov){
    ov = document.createElement("div");
    ov.id = "slaOverlay";
    ov.className = "fixed inset-0 z-40 bg-black/55 backdrop-blur-[1px] opacity-0 pointer-events-none transition-opacity duration-200";
    ov.addEventListener("click", () => {
      state.mobileOpen = false;
      applyLayout();
    });
    (document.getElementById("app") || document.body).appendChild(ov);

    if (typeof window.forceDarkMode === "function") {
      window.forceDarkMode();
    }
  }
  return ov;
}

function mobileDrawerWidth(){
  return Math.round(Math.min(Math.max(window.innerWidth * 0.90, 320), 440));
}

function setMobileBurgerOpen(isOpen){
  const btn = document.getElementById("toggleSidebar");
  if (!btn) return;
  btn.classList.toggle("is-open", !!isOpen);
}

function applyLayout(){
  if (typeof window.forceDarkMode === "function") {
    window.forceDarkMode();
  }

  const mobile = isMobile();
  const top  = document.getElementById("topBar");
  const side = document.getElementById("sideBar");

  if (mobile){
    document.body.style.paddingLeft = "0px";
    document.body.style.paddingTop = TOP_H + "px";
    document.body.classList.remove("sla-collapsed");
    document.body.classList.add("dark");

    if (top){
      top.style.left = "0px";
      top.style.width = "100%";
      top.classList.remove("light");
      top.classList.add("dark");
    }

    const ov = ensureOverlay();
    const drawerW = mobileDrawerWidth();

    if (side){
      side.style.width = drawerW + "px";
      side.style.transform = state.mobileOpen ? "translateX(0)" : "translateX(-110%)";
      side.style.transitionProperty = "transform";
      side.style.transitionDuration = "320ms";
      side.style.transitionTimingFunction = "ease-in-out";
      side.style.boxShadow = state.mobileOpen ? "0 20px 60px rgba(0,0,0,.55)" : "none";
      side.classList.remove("light");
      side.classList.add("dark");
    }

    if (state.mobileOpen){
      ov.classList.remove("pointer-events-none");
      ov.style.opacity = "1";
      lockScroll(true);
    } else {
      ov.classList.add("pointer-events-none");
      ov.style.opacity = "0";
      lockScroll(false);
    }

    const logo = document.getElementById("slaLogo");
    if (logo){
      const next = LOGO_EXPANDED;
      if (logo.getAttribute("data-src") !== next){
        logo.style.opacity = "0";
        setTimeout(() => {
          logo.src = next;
          logo.setAttribute("data-src", next);
          logo.style.opacity = "1";
        }, 120);
      }
    }

    setMobileBurgerOpen(state.mobileOpen);

    if (typeof window.forceDarkMode === "function") {
      window.forceDarkMode();
    }
    return;
  }

  state.mobileOpen = false;
  lockScroll(false);

  const ov = document.getElementById("slaOverlay");
  if (ov){
    ov.classList.add("pointer-events-none");
    ov.style.opacity = "0";
  }
  setMobileBurgerOpen(false);

  const w = currentSidebarW();

  document.body.style.paddingLeft = w + "px";
  document.body.style.paddingTop = TOP_H + "px";
  document.body.classList.toggle("sla-collapsed", state.collapsed);
  document.body.classList.add("dark");

  if (side){
    side.style.width = w + "px";
    side.style.transform = "translateX(0)";
    side.style.transitionProperty = "width";
    side.style.transitionDuration = "300ms";
    side.style.transitionTimingFunction = "ease-in-out";
    side.style.boxShadow = "none";
    side.classList.remove("light");
    side.classList.add("dark");
  }

  if (top){
    top.style.left = w + "px";
    top.style.width = `calc(100% - ${w}px)`;
    top.classList.remove("light");
    top.classList.add("dark");
  }

  const logo = document.getElementById("slaLogo");
  if (logo){
    const next = state.collapsed ? LOGO_COLLAPSED : LOGO_EXPANDED;
    if (logo.getAttribute("data-src") !== next){
      logo.style.opacity = "0";
      setTimeout(() => {
        logo.src = next;
        logo.setAttribute("data-src", next);
        logo.style.opacity = "1";
      }, 120);
    }
  }

  const desktopIcon = document.getElementById("toggleIconDesktop");
  if (desktopIcon){
    desktopIcon.classList.toggle("sla-rot", !state.collapsed);
  }

  if (typeof window.forceDarkMode === "function") {
    window.forceDarkMode();
  }
}

function matchNavBasePath(currentPath){
  const cur = normalizePath(currentPath);
  let best = "";
  for (const it of NAV_ACTIVE){
    if (!it.path) continue;
    const base = normalizePath(it.path);
    if (cur === base || cur.startsWith(base + "/")) {
      if (base.length > best.length) best = base;
    }
  }
  return best || "";
}

function updateNavActive(currentPath){
  const cur = normalizePath(currentPath);
  const activeBase = matchNavBasePath(cur);

  const navLinks = document.querySelectorAll(".sla-navbtn");
  navLinks.forEach(el => {
    const p = normalizePath(el.dataset.path || "");

    el.classList.remove("sla-active");
    el.classList.remove("sla-disabled-exact");

    if (!p) return;

    const isActive = (p === activeBase);
    if (isActive) {
      el.classList.add("sla-active");
      const section = el.closest(".sla-nav-section");
      if (section) {
        section.classList.remove("is-collapsed");
        const items = section.querySelector(".sla-nav-section-items");
        if (items) items.classList.remove("is-collapsed");
        const head = section.querySelector(".sla-nav-section-head");
        if (head) {
          head.setAttribute("aria-expanded", "true");
          if (head.title) setGroupCollapsed(head.title, false);
        }
      }
      if (cur === p) {
        el.classList.add("sla-disabled-exact");
      }
    }
  });

  if (typeof window.forceDarkMode === "function") {
    window.forceDarkMode();
  }
}

window.__sla_setActiveNav = function(path){
  updateNavActive(path || window.location.pathname || "/");
};

function navigate(path){
  const clean = normalizePath(path);
  updateNavActive(clean);

  const go = window.routeTo;
  if (typeof go === "function") {
    go(clean);
  } else {
    const full = withBase(clean);
    window.location.href = full;
  }

  if (typeof window.forceDarkMode === "function") {
    window.forceDarkMode();
  }
}

function renderNav(nav, groups){
  const safeGroups = Array.isArray(groups) ? groups : [];
  NAV_ACTIVE = flattenNavGroups(safeGroups);
  nav.innerHTML = "";

  for (const group of safeGroups){
    const items = Array.isArray(group?.items) ? group.items : [];
    if (!items.length) continue;

    const groupName = group.group || "";
    const hasActive = groupContainsActivePath(group, window.location.pathname || "/");
    const collapsedSaved = isGroupCollapsed(groupName);
    const collapsed = hasActive ? false : collapsedSaved;
    if (hasActive && collapsedSaved) {
      setGroupCollapsed(groupName, false);
    }

    const section = document.createElement("div");
    section.className = "sla-nav-section";
    section.classList.toggle("is-collapsed", collapsed);

    const head = document.createElement("button");
    head.type = "button";
    head.className = "sla-nav-section-head";
    head.title = groupName;
    head.setAttribute("aria-expanded", collapsed ? "false" : "true");

    const headLeft = document.createElement("span");
    headLeft.className = "sla-nav-section-left";

    const headIcon = document.createElement("i");
    headIcon.className = group.icon || "fa-solid fa-circle";
    headLeft.appendChild(headIcon);

    const headTitle = document.createElement("span");
    headTitle.className = "sla-nav-section-title";
    headTitle.textContent = groupName;
    headLeft.appendChild(headTitle);

    const chevron = document.createElement("i");
    chevron.className = "fa-solid fa-chevron-down sla-nav-section-chevron";

    head.appendChild(headLeft);
    head.appendChild(chevron);
    head.addEventListener("click", () => {
      setGroupCollapsed(groupName, !collapsed);
      renderNav(nav, navGroupsForAdminState());
    });

    const itemWrap = document.createElement("div");
    itemWrap.className = "sla-nav-section-items";
    itemWrap.classList.toggle("is-collapsed", collapsed);

    for (const it of items){
      const link = document.createElement("a");
      link.dataset.path = it.path || "";
      link.href = it.path ? withBase(it.path) : "#";
      link.title = it.label || "";
      link.className = "sla-navbtn";

      const iconSlot = document.createElement("div");
      iconSlot.className = "sla-iconSlot";
      const i = document.createElement("i");
      i.className = it.icon || "fa-solid fa-circle";
      iconSlot.appendChild(i);

      const label = document.createElement("span");
      label.className = "sla-navlabel";
      label.textContent = it.label || "";

      link.appendChild(iconSlot);
      link.appendChild(label);

      link.addEventListener("click", (e) => {
        if (!isPlainLeftClick(e)) return;

        e.preventDefault();

        if (isMobile() && state.mobileOpen){
          state.mobileOpen = false;
          applyLayout();
        }

        if (it.path) navigate(it.path);
      });

      itemWrap.appendChild(link);
    }

    section.appendChild(head);
    section.appendChild(itemWrap);
    nav.appendChild(section);
  }

  updateNavActive(window.location.pathname || "/");

  if (!isMobile() && document.getElementById("sideBar")) {
    applyLayout();
  }

  if (typeof window.forceDarkMode === "function") {
    window.forceDarkMode();
  }
}

async function fetchIsAdmin(){
  try{
    let r = await fetch(apiUrl("/api/admin/is-admin"), { credentials: "include" });
    if (!r.ok && BASE_PATH) {
      r = await fetch("/api/admin/is-admin", { credentials: "include" });
    }
    const data = await r.json().catch(()=>({}));
    return !!data?.isAdmin;
  }catch(_){
    return false;
  }
}

async function fetchAdminUiPrefs(){
  try{
    let r = await fetch(apiUrl("/api/admin/ui-prefs"), { credentials: "include" });
    if (!r.ok && BASE_PATH) {
      r = await fetch("/api/admin/ui-prefs", { credentials: "include" });
    }
    if (!r.ok) return null;

    const data = await r.json().catch(()=>({}));
    return { hideAdminButtons: !!data?.prefs?.hideAdminButtons };
  }catch(_){
    return null;
  }
}

async function fetchDailyResetSettings(){
  try{
    let r = await fetch(apiUrl("/api/daily-reset"), {
      credentials: "include",
      cache: "no-store"
    });

    if (!r.ok && BASE_PATH) {
      r = await fetch("/api/daily-reset", {
        credentials: "include",
        cache: "no-store"
      });
    }

    if (!r.ok) return { hour: 0, minute: 0, second: 0 };

    const data = await r.json().catch(() => ({}));
    return {
      hour: Number.isFinite(Number(data?.settings?.hour))
        ? Math.max(0, Math.min(23, Math.floor(Number(data.settings.hour))))
        : 0,
      minute: Number.isFinite(Number(data?.settings?.minute))
        ? Math.max(0, Math.min(59, Math.floor(Number(data.settings.minute))))
        : 0,
      second: Number.isFinite(Number(data?.settings?.second))
        ? Math.max(0, Math.min(59, Math.floor(Number(data.settings.second))))
        : 0
    };
  }catch(_){
    return { hour: 0, minute: 0, second: 0 };
  }
}

async function saveDailyResetSettings(hour, minute, second){
  const payload = {
    hour: Number.isFinite(Number(hour))
      ? Math.max(0, Math.min(23, Math.floor(Number(hour))))
      : 0,
    minute: Number.isFinite(Number(minute))
      ? Math.max(0, Math.min(59, Math.floor(Number(minute))))
      : 0,
    second: Number.isFinite(Number(second))
      ? Math.max(0, Math.min(59, Math.floor(Number(second))))
      : 0
  };

  let r = await fetch(apiUrl("/api/admin/daily-reset"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload)
  });

  if (!r.ok && BASE_PATH) {
    r = await fetch("/api/admin/daily-reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload)
    });
  }

  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    throw new Error(data?.error || `HTTP ${r.status}`);
  }

  const settings = data?.settings || payload;
  return {
    hour: Number.isFinite(Number(settings?.hour)) ? Math.max(0, Math.min(23, Math.floor(Number(settings.hour)))) : payload.hour,
    minute: Number.isFinite(Number(settings?.minute)) ? Math.max(0, Math.min(59, Math.floor(Number(settings.minute)))) : payload.minute,
    second: Number.isFinite(Number(settings?.second)) ? Math.max(0, Math.min(59, Math.floor(Number(settings.second)))) : payload.second
  };
}

function pad2(n){
  return String(Math.max(0, Math.floor(Number(n) || 0))).padStart(2, "0");
}

function getNextDailyResetDateUtc(resetHour, resetMinute = 0, resetSecond = 0){
  const hour = Math.max(0, Math.min(23, Math.floor(Number(resetHour) || 0)));
  const minute = Math.max(0, Math.min(59, Math.floor(Number(resetMinute) || 0)));
  const second = Math.max(0, Math.min(59, Math.floor(Number(resetSecond) || 0)));
  const now = new Date();

  const next = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    hour, minute, second, 0
  ));

  if (next.getTime() <= now.getTime()) {
    next.setUTCDate(next.getUTCDate() + 1);
  }

  return next;
}

function formatDiffToHMS(ms){
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
}

function renderDailyResetCountdown(){
  const badge = document.getElementById("dailyResetBadge");
  const timeEl = document.getElementById("dailyResetTime");
  if (!badge || !timeEl) return;

  const next = getNextDailyResetDateUtc(state.dailyReset.hour, state.dailyReset.minute, state.dailyReset.second);
  const diff = next.getTime() - Date.now();

  timeEl.textContent = formatDiffToHMS(diff);
}

function stopDailyResetTicker(){
  if (state.dailyReset.timerId) {
    clearInterval(state.dailyReset.timerId);
    state.dailyReset.timerId = null;
  }
}

function startDailyResetTicker(){
  stopDailyResetTicker();
  renderDailyResetCountdown();
  state.dailyReset.timerId = setInterval(renderDailyResetCountdown, 1000);
}

async function initDailyResetBadge(){
  const badge = document.getElementById("dailyResetBadge");
  if (!badge) return;

  const settings = await fetchDailyResetSettings();
  state.dailyReset.hour = settings.hour;
  state.dailyReset.minute = settings.minute;
  state.dailyReset.second = settings.second;

  badge.classList.add("is-visible");
  badge.classList.toggle("is-admin", !!adminCtx.isAdmin);

  if (adminCtx.isAdmin) {
    badge.setAttribute("title", "Edit Daily Reset");
    badge.setAttribute("role", "button");
    badge.setAttribute("tabindex", "0");
  } else {
    badge.removeAttribute("title");
    badge.removeAttribute("role");
    badge.removeAttribute("tabindex");
  }

  renderDailyResetCountdown();
  startDailyResetTicker();
}

function closeDailyResetEditor(){
  document.getElementById("dailyResetEditorOverlay")?.remove();
  if (typeof window.__dailyResetEscHandler === "function") {
    document.removeEventListener("keydown", window.__dailyResetEscHandler);
    window.__dailyResetEscHandler = null;
  }
}

async function openDailyResetEditor(){
  if (!adminCtx.isAdmin) return;

  closeDailyResetEditor();

  const overlay = document.createElement("div");
  overlay.id = "dailyResetEditorOverlay";
  overlay.className = "sla-modal-overlay";

  const card = document.createElement("div");
  card.className = "sla-modal-card";

  const head = document.createElement("div");
  head.className = "sla-modal-head";

  const title = document.createElement("div");
  title.className = "sla-modal-title";
  title.textContent = "Edit Daily Reset (UTC+0)";

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "sla-btn-muted";
  closeBtn.textContent = "Close";
  closeBtn.addEventListener("click", closeDailyResetEditor);

  head.append(title, closeBtn);

  const body = document.createElement("div");
  body.className = "sla-modal-body";

  const hint = document.createElement("div");
  hint.className = "sla-modal-hint";
  hint.textContent = "Set the daily reset time in UTC+0.";

  const grid = document.createElement("div");
  grid.className = "sla-time-grid";

  const makeTimeField = (labelText, id, value, min, max) => {
    const wrap = document.createElement("div");
    wrap.className = "sla-time-field";

    const label = document.createElement("label");
    label.className = "sla-time-mini-label";
    label.textContent = labelText;
    label.setAttribute("for", id);

    const input = document.createElement("input");
    input.id = id;
    input.type = "number";
    input.min = String(min);
    input.max = String(max);
    input.step = "1";
    input.value = pad2(value);
    input.className = "sla-modal-input";

    wrap.append(label, input);
    return { wrap, input };
  };

  const hourField = makeTimeField("HH", "dailyResetHourInput", state.dailyReset.hour, 0, 23);
  const minuteField = makeTimeField("MM", "dailyResetMinuteInput", state.dailyReset.minute, 0, 59);
  const secondField = makeTimeField("SS", "dailyResetSecondInput", state.dailyReset.second, 0, 59);

  grid.append(hourField.wrap, minuteField.wrap, secondField.wrap);

  const actions = document.createElement("div");
  actions.className = "sla-modal-actions";

  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "sla-btn-muted";
  cancel.textContent = "Cancel";
  cancel.addEventListener("click", closeDailyResetEditor);

  const save = document.createElement("button");
  save.type = "button";
  save.className = "sla-btn-gold";
  save.textContent = "Save";
  save.addEventListener("click", async () => {
    const nextHour = Number(hourField.input.value);
    const nextMinute = Number(minuteField.input.value);
    const nextSecond = Number(secondField.input.value);

    if (!Number.isFinite(nextHour) || nextHour < 0 || nextHour > 23) {
      window.alert("HH must be from 0 to 23.");
      hourField.input.focus();
      hourField.input.select();
      return;
    }
    if (!Number.isFinite(nextMinute) || nextMinute < 0 || nextMinute > 59) {
      window.alert("MM must be from 0 to 59.");
      minuteField.input.focus();
      minuteField.input.select();
      return;
    }
    if (!Number.isFinite(nextSecond) || nextSecond < 0 || nextSecond > 59) {
      window.alert("SS must be from 0 to 59.");
      secondField.input.focus();
      secondField.input.select();
      return;
    }

    save.disabled = true;
    save.textContent = "Saving...";

    try {
      const saved = await saveDailyResetSettings(nextHour, nextMinute, nextSecond);
      state.dailyReset.hour = saved.hour;
      state.dailyReset.minute = saved.minute;
      state.dailyReset.second = saved.second;
      renderDailyResetCountdown();
      startDailyResetTicker();
      closeDailyResetEditor();
    } catch (e) {
      console.error(e);
      window.alert("Failed to save Daily Reset time.");
    } finally {
      save.disabled = false;
      save.textContent = "Save";
    }
  });

  actions.append(cancel, save);
  body.append(hint, grid, actions);
  card.append(head, body);
  overlay.appendChild(card);
  document.body.appendChild(overlay);

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeDailyResetEditor();
  });

  const onKey = (e) => {
    if (e.key === "Escape") {
      closeDailyResetEditor();
    }
  };
  window.__dailyResetEscHandler = onKey;
  document.addEventListener("keydown", onKey);

  hourField.input.focus();
  hourField.input.select();
}

function mountShell() {
  const app = document.getElementById("app");
  if (!app) return;

  if (typeof window.forceDarkMode === "function") {
    window.forceDarkMode();
  }

  ensureActiveNavCss();
  document.body.style.paddingTop = TOP_H + "px";
  document.body.classList.add("dark");
  document.body.classList.remove("light");

  app.innerHTML = `
  <aside id="sideBar"
    class="fixed z-50 left-0 top-0 bottom-0 border-r border-slate-700 bg-slate-900 overflow-hidden">

    <div class="relative h-[74px] border-b border-slate-700 flex items-center px-2">
      <a id="slaHomeLink"
         class="w-full h-full flex items-center justify-center cursor-pointer select-none"
         href="${withBase("/")}">
        <img id="slaLogo"
          src="${state.collapsed ? LOGO_COLLAPSED : LOGO_EXPANDED}"
          data-src="${state.collapsed ? LOGO_COLLAPSED : LOGO_EXPANDED}"
          alt="SLA Hub"
          class="h-[56px] w-auto object-contain object-center transition-opacity duration-200 ease-in-out"
          style="opacity:1"
          loading="lazy"
          decoding="async"
        />
      </a>

      <button id="closeSidebarInside"
        class="absolute right-2 md:hidden h-10 w-10 rounded-xl border border-white/20 text-white bg-slate-800 hover:bg-slate-700 transition-colors grid place-items-center"
        title="Close menu">
        <i class="fa-solid fa-xmark text-[18px]"></i>
      </button>
    </div>

    <nav id="slaNav" class="h-[calc(100%-74px)] overflow-auto p-2 flex flex-col "></nav>
  </aside>

  <div id="topBar"
       class="fixed top-0 h-[74px] z-40 border-b border-slate-700 bg-slate-900 transition-[left,width] duration-300 ease-in-out">
    <div class="h-full w-full px-2 sm:px-3 flex items-center gap-2 justify-between">

      <div id="topBarLeft" class="flex items-center gap-2 min-w-0">
        <button id="toggleSidebar"
          class="ml-1 sm:ml-2 h-12 w-12 rounded-xl border border-white/20 bg-slate-800 text-slate-100 hover:bg-slate-700 transition-colors
                 md:h-10 md:w-auto md:px-3 md:rounded-xl md:border md:bg-slate-800 md:text-slate-100 md:border-slate-700 md:hover:bg-slate-700"
          title="Menu">

          <span class="md:hidden sla-burger" aria-hidden="true">
            <span class="sla-burger-line sla-burger-top"></span>
            <span class="sla-burger-line sla-burger-mid"></span>
            <span class="sla-burger-line sla-burger-bot"></span>
          </span>

          <i id="toggleIconDesktop"
             class="hidden md:inline fa-solid fa-arrow-right-to-bracket text-[16px] transition-transform duration-300 ease-in-out"></i>
        </button>

        <div
          id="dailyResetBadge"
          class="hidden md:hidden"
          aria-label="Daily Reset countdown"
        >
          <i class="fa-solid fa-clock text-[14px] text-yellow-400"></i>
          <span id="dailyResetTime" class="dr-time">--:--:--</span>
        </div>
      </div>

      <div class="ml-auto flex items-center gap-2 sm:gap-3">
        <a id="slaMembersBtn"
          href="${withBase("/members")}"
          class="px-3 sm:px-4 h-10 rounded-xl border border-slate-700 bg-slate-800 text-slate-100 hover:bg-slate-700 transition-colors inline-flex items-center gap-2"
          title="Members">
          <i class="fa-solid fa-users text-[14px]"></i>
          <span class="hidden sm:inline text-sm font-semibold">Members</span>
        </a>

        <div id="authArea" class="flex items-center"></div>
      </div>
    </div>
  </div>

  <main class="px-3 sm:px-4 py-6">
    <div id="content" class="max-w-7xl mx-auto"></div>
  </main>
  `;

  if (typeof window.forceDarkMode === "function") {
    window.forceDarkMode();
  }

  document.getElementById("slaHomeLink")?.addEventListener("click", (e) => {
    if (!isPlainLeftClick(e)) return;

    e.preventDefault();

    if (isMobile() && state.mobileOpen){
      state.mobileOpen = false;
      applyLayout();
    }

    navigate("/");
  });

  document.getElementById("slaMembersBtn")?.addEventListener("click", (e) => {
    if (!isPlainLeftClick(e)) return;

    e.preventDefault();

    if (isMobile() && state.mobileOpen){
      state.mobileOpen = false;
      applyLayout();
    }
    navigate("/members");
  });

  const navEl = document.getElementById("slaNav");
  adminCtx.navEl = navEl;
  renderNav(navEl, []);

  fetchIsAdmin().then(async (isAdmin) => {
    adminCtx.isAdmin = !!isAdmin;
    adminCtx.hideAdminButtons = loadBool(ADMIN_HIDE_KEY, false);
    await fetchMenuVisibility();

    if (adminCtx.isAdmin) {
      const prefs = await fetchAdminUiPrefs();
      if (prefs && typeof prefs.hideAdminButtons === "boolean") {
        adminCtx.hideAdminButtons = !!prefs.hideAdminButtons;
        saveBool(ADMIN_HIDE_KEY, adminCtx.hideAdminButtons);

        try{
          window.dispatchEvent(new CustomEvent("sla:admin-hide-changed", { detail: { hide: adminCtx.hideAdminButtons } }));
        }catch(_){}
      }
    }

    renderNav(navEl, navGroupsForAdminState());

    const p = normalizePath(window.location.pathname || "/");
    const adminPaths = new Set(
      NAV_ADMIN.filter(x => x.path).map(x => normalizePath(x.path))
    );
    if (!isAdmin && adminPaths.has(p)) {
      navigate("/");
    }

    if (typeof window.forceDarkMode === "function") {
      window.forceDarkMode();
    }

    await initDailyResetBadge();
  });

  window.addEventListener("sla:menu-visibility-changed", (ev) => {
    const flags = ev?.detail?.flags;
    const adminFlags = ev?.detail?.adminFlags;
    if (flags && typeof flags === "object") {
      adminCtx.menuVisibility = flags;
    }
    if (adminFlags && typeof adminFlags === "object") {
      adminCtx.menuAdminVisibility = adminFlags;
    }
    if (adminCtx.navEl) {
      renderNav(adminCtx.navEl, navGroupsForAdminState());
    }
  });

  window.addEventListener("sla:admin-view-menu-like-user-changed", async () => {
    await fetchMenuVisibility();
    if (adminCtx.navEl) {
      renderNav(adminCtx.navEl, navGroupsForAdminState());
    }
  });

  document.getElementById("toggleSidebar")?.addEventListener("click", () => {
    if (isMobile()){
      state.mobileOpen = !state.mobileOpen;
      applyLayout();
      return;
    }
    state.collapsed = !state.collapsed;
    saveBool("sla_sidebar_collapsed", state.collapsed);
    applyLayout();
  });

  document.getElementById("dailyResetBadge")?.addEventListener("click", () => {
    if (!adminCtx.isAdmin) return;
    openDailyResetEditor();
  });

  document.getElementById("dailyResetBadge")?.addEventListener("keydown", (e) => {
    if (!adminCtx.isAdmin) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openDailyResetEditor();
    }
  });

  document.getElementById("closeSidebarInside")?.addEventListener("click", () => {
    if (isMobile()){
      state.mobileOpen = false;
      applyLayout();
    }
  });

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && isMobile() && state.mobileOpen){
      state.mobileOpen = false;
      applyLayout();
    }
  });

  applyLayout();
  window.addEventListener("resize", applyLayout);
  window.addEventListener("beforeunload", stopDailyResetTicker);
}

function mountHome(){
  const p = normalizePath(window.location.pathname || "/");

  const isRoute =
    p === "/dashboard" || p.startsWith("/dashboard/") ||
    p === "/hunters" || p.startsWith("/hunters/") ||
    p === "/events" || p.startsWith("/events/") ||
    p === "/special-commission" || p.startsWith("/special-commission/") ||
    p === "/tier-list" || p.startsWith("/tier-list/") ||
    p === "/gems" || p.startsWith("/gems/") ||
    p === "/stats" || p.startsWith("/stats/") ||
    p === "/members" || p.startsWith("/members/") ||
    p === "/my-page" || p.startsWith("/my-page/") ||
    p === "/guild-page" || p.startsWith("/guild-page/") ||
    p === "/admin" || p.startsWith("/admin/") ||
    p === "/creator-code" || p.startsWith("/creator-code/") ||
    p === "/cores" || p.startsWith("/cores/") ||
    p === "/artifacts" || p.startsWith("/artifacts/") ||
    p === "/blessing-stones" || p.startsWith("/blessing-stones/") ||
    p === "/pvp" || p.startsWith("/pvp/") ||
    p === "/builds" || p.startsWith("/builds/") ||
    p === "/calculator" || p.startsWith("/calculator/") ||
    p === "/oracle" || p.startsWith("/oracle/") ||
    p === "/posts" || p.startsWith("/posts/") ||
    p === "/suggestions" || p.startsWith("/suggestions/") ||
    p === "/road-map" || p.startsWith("/road-map/") ||
    p === "/pictures" || p.startsWith("/pictures/") ||
    p === "/mini-game" || p.startsWith("/mini-game/") ||
    p === "/hunter-guess" || p.startsWith("/hunter-guess/") ||
    p === "/sjw-weapons" || p.startsWith("/sjw-weapons/") ||
    p === "/hunter-weapons" || p.startsWith("/hunter-weapons/") ||
    p === "/shadows" || p.startsWith("/shadows/") ||
    p === "/successors" || p.startsWith("/successors/");

  if (isRoute) return;

  if (typeof window.renderMainPage === "function") {
    window.renderMainPage();
  } else {
    const c = document.getElementById("content");
    if (c) c.innerHTML = `<div class="text-center text-slate-300">Main.js not loaded.</div>`;
  }

  if (typeof window.forceDarkMode === "function") {
    window.forceDarkMode();
  }
}

function mount(){
  if (typeof window.forceDarkMode === "function") {
    window.forceDarkMode();
  }

  mountShell();

  if (typeof window.forceDarkMode === "function") {
    window.forceDarkMode();
  }

  if (typeof window.renderAuth === "function") window.renderAuth();

  if (typeof window.forceDarkMode === "function") {
    window.forceDarkMode();
  }

  if (typeof window.forceDarkMode === "function") {
    window.forceDarkMode();
  }

  updateNavActive(window.location.pathname || "/");

  if (typeof window.forceDarkMode === "function") {
    window.forceDarkMode();
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mount, { once: true });
} else {
  mount();
}
