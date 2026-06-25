// special_commission.js — UPDATED (Commissions + Fast Lv. Up + Admin + shared modal)
//
// ✅ NAME FIXES:
// - max 22 chars per line
// - manual split by "/" has priority
// - dynamic font-size
//
// ✅ PADDING FIXES:
// - card: ONLY top padding 10px
// - image block: left/right/bottom padding 10px
//
// ✅ GLOBAL BG:
// - ONE GLOBAL background image behind every enemy icon (GLOBAL_ENEMY_BG_URL)
//
// ✅ GLOBAL EDIT MODE:
// - one "Edit" button toggles edit controls on all enemy cards
// - edit controls are shown UNDER the image (inside padded block)
// - controls: Lv. -   -   Set   +   Lv. + (in that order)
// - buttons do NOT open modal (stopPropagation)
//
// ✅ LEVELING FIX:
// - when you are at X/Y and press "+" -> auto level up (Lv+ and cur resets to 0)
// - at MAX (e.g. Lv. 5) ratio shows "MAX" and progress is full
//
// ✅ FAST TAB:
// - shows locations; modal shows only enemies that are NOT MAX
//
// ✅ ADMIN:
// - 2 subtabs: Commissions + Battle locations
// - Battle locations: separate cards per category + filter buttons + reorder (↑/↓)
// - Add new location adds at the END
// - Locations edit: ONLY Name
// - Enemy max kills Y is per-level: Level 0..MaxLevel each has its own Y
// - DB only: auto-load + auto-save to backend (no localStorage)
//
// ✅ UX FIX:
// - inputs keep focus + cursor (Icon URL no longer "stops typing")
// - location dropdown uses non-selectable category headers:
//   • Gate •, • Battlefield of Chaos •, ...

(() => {

  // Force dark mode in this module
  if (typeof window.forceDarkMode === 'function') {
    try { window.forceDarkMode(); } catch (_) {}
  }
  // ✅ Route guard (blokuje render kiedy nie jesteś na /special-commission)
  function __isSpecialCommissionRoute() {
    try {
      const p = window.location?.pathname || "";
      return p === "/special-commission" || p.startsWith("/special-commission/");
    } catch {
      return false;
    }
  }

  // -----------------------------
  // Safe el() fallback
  // -----------------------------
  const _el =
    window.el ||
    function el(tag, attrs, ...children) {
      const node = document.createElement(tag);
      if (attrs) {
        for (const [k, v] of Object.entries(attrs)) {
          if (k === "class") node.className = v;
          else if (k === "style") node.setAttribute("style", v);
          else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
          else if (v === null || v === undefined) continue;
          else node.setAttribute(k, String(v));
        }
      }
      for (const c of children.flat()) {
        if (c === null || c === undefined || c === false) continue;
        node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
      }
      return node;
    };

  // -----------------------------
  // ✅ ADMIN DETECTION + HIDE TOGGLE (FIXED LIKE OTHER MODULES)
  // -----------------------------
  const LS_HIDE_ADMIN_KEY = "sla_hide_admin_buttons";

  function _isTruthyFlag(v) {
    return v === true || v === 1 || v === "1" || v === "true" || v === "yes";
  }

  function detectIsAdmin(me) {
    if (!me) return false;

    // common flags
    if (_isTruthyFlag(me.is_admin)) return true;
    if (_isTruthyFlag(me.isAdmin)) return true;
    if (_isTruthyFlag(me.admin)) return true;

    // role string
    if (typeof me.role === "string" && me.role.toLowerCase().includes("admin")) return true;

    // roles array (strings or objects)
    if (Array.isArray(me.roles)) {
      for (const r of me.roles) {
        if (!r) continue;

        // ["admin", "mod"]
        if (typeof r === "string") {
          if (r.toLowerCase().includes("admin")) return true;
          continue;
        }

        // [{id,name}, ...]
        if (typeof r === "object") {
          const name = String(r.name || r.role || r.title || "").toLowerCase();
          if (name.includes("admin")) return true;

          const id = String(r.id || "");
          if (Array.isArray(window.STATE?.adminRoleIds) && window.STATE.adminRoleIds.map(String).includes(id)) {
            return true;
          }
        }
      }
    }

    // permissions
    if (_isTruthyFlag(me.permissions?.admin)) return true;
    if (_isTruthyFlag(me.permissions?.isAdmin)) return true;

    // optional: admin user id list
    const myId = String(me.id || me.userId || "");
    if (myId && Array.isArray(window.STATE?.adminUserIds)) {
      if (window.STATE.adminUserIds.map(String).includes(myId)) return true;
    }

    return false;
  }

  function getHideAdminButtonsLS() {
    try {
      return localStorage.getItem(LS_HIDE_ADMIN_KEY) === "1";
    } catch {
      return false;
    }
  }

  function ensureStateUi() {
    if (!window.STATE) window.STATE = {};
    if (!window.STATE.ui) window.STATE.ui = {};

    // jeśli backend nie ustawił, bierz z localStorage
    if (window.STATE.ui.hideAdminButtons === undefined || window.STATE.ui.hideAdminButtons === null) {
      window.STATE.ui.hideAdminButtons = getHideAdminButtonsLS();
    }
  }

  function isAdminUser(me) {
    // preferuj server-side STATE.isAdmin jeśli istnieje
    if (window.STATE && _isTruthyFlag(window.STATE.isAdmin)) return true;
    return detectIsAdmin(me);
  }

  function isAdminTabVisible(me, viewUserId) {
    ensureStateUi();
    if (viewUserId) return false;
    if (!me) return false;
    if (!isAdminUser(me)) return false;
    if (window.STATE?.ui?.hideAdminButtons) return false;
    return true;
  }

  // -----------------------------
  // GLOBAL BG
  // -----------------------------
  const GLOBAL_ENEMY_BG_URL =
    "/picture/Special_Commission/BG.png";


// -----------------------------
// Local pictures (Special_Commission/*)
// -----------------------------
const SC_PICTURE_CATEGORY = "Special_Commission";
const SC_ICON_PREFIX = "/picture/Special_Commission/";

const __scPicturesCache = { items: null, ts: 0 };
async function loadSCPictures(force = false) {
  if (!force && Array.isArray(__scPicturesCache.items)) return __scPicturesCache.items;
  const url = apiUrl("/api/admin/pictures/list?category=" + encodeURIComponent(SC_PICTURE_CATEGORY));
  const r = await fetch(url, { cache: "no-store", credentials: "include" });
  const j = await r.json().catch(() => ({}));
  const items = Array.isArray(j?.items) ? j.items : [];
  __scPicturesCache.items = items;
  __scPicturesCache.ts = Date.now();
  return items;
}

function _basename(u) {
  const s = String(u || "").trim().split("#")[0].split("?")[0].replace(/\\/g, "/");
  const parts = s.split("/").filter(Boolean);
  return parts[parts.length - 1] || "";
}

function scToLocalIconPath(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw.startsWith(SC_ICON_PREFIX)) return raw;

  // if someone stored rel path or filename
  const base = _basename(raw);
  if (!base) return raw;

  // If it already includes Special_Commission folder but missing /picture prefix
  if (/Special_Commission\//i.test(raw) && !raw.startsWith("/picture/")) {
    const idx = raw.replace(/\\/g, "/").toLowerCase().lastIndexOf("special_commission/");
    if (idx !== -1) {
      const rel = raw.replace(/\\/g, "/").slice(idx + "special_commission/".length);
      return SC_ICON_PREFIX + rel.replace(/^\/+/, "");
    }
  }

  return SC_ICON_PREFIX + base;
}

function scPrettyNameFromRel(rel) {
  const base = _basename(rel).replace(/\.[a-z0-9]+$/i, "");
  return base.replace(/[_-]+/g, " ").trim();
}

function scIsExternal(v) {
  const s = String(v || "").trim();
  if (!s) return false;
  if (s.startsWith("/picture/")) return false;
  return /^https?:\/\//i.test(s);
}

async function scNormalizeAllEnemyIcons() {
  try {
    const items = await loadSCPictures(false);
    const rels = (items || []).map(it => String(it?.rel || it?.name || "")).filter(Boolean);
    const fileSet = new Set(rels.map(r => _basename(r).toLowerCase()));

    let changed = 0;
    for (const e of (FARM.enemies || [])) {
      const cur = String(e?.iconUrl || "").trim();
      if (!cur) continue;

      const b = _basename(cur).toLowerCase();
      if (!b) continue;

      // if file exists locally, force local path
      if (fileSet.has(b)) {
        const next = SC_ICON_PREFIX + _basename(cur);
        if (next !== cur) {
          e.iconUrl = next;
          changed++;
        }
      } else if (!cur.startsWith("/picture/") && !scIsExternal(cur) && cur.includes("/")) {
        // rel like "Special_Commission/Foo.png" or "Foo.png" handled by scToLocalIconPath
        const next = scToLocalIconPath(cur);
        if (next !== cur) {
          e.iconUrl = next;
          changed++;
        }
      }
    }

    if (changed > 0) scheduleSave(true);
    setAdminMsg(`Normalized ${changed} icon(s) ✅`);
    render();
  } catch (e) {
    console.error(e);
    setAdminMsg("Normalize failed ❌");
  }
}

function makeSCIconPicker(currentValue, enabled, onPick) {
  const sel = _el("select", {
    class:
      "h-10 px-3 rounded-xl border border-slate-200/20 bg-slate-950/30 text-slate-100 outline-none w-full",
    disabled: !enabled,
  },
    _el("option", { value: "" }, "Select local icon…")
  );

  // set initial selection if possible
  const initial = scToLocalIconPath(currentValue);
  sel.value = initial.startsWith(SC_ICON_PREFIX) ? initial : "";

  sel.addEventListener("change", () => {
    const v = String(sel.value || "").trim();
    if (!v) return;
    onPick(v);
  });

  // populate async
  loadSCPictures(false).then((items) => {
    const rels = (items || [])
      .map(it => String(it?.rel || it?.name || ""))
      .filter(Boolean)
      .filter(r => _basename(r).toLowerCase() !== "bg.png"); // exclude BG

    // clear and rebuild options
    sel.innerHTML = "";
    sel.appendChild(_el("option", { value: "" }, "Select local icon…"));

    for (const rel of rels) {
      const filename = _basename(rel);
      const full = SC_ICON_PREFIX + filename;
      sel.appendChild(_el("option", { value: full }, scPrettyNameFromRel(filename)));
    }

    // keep selection
    const want = scToLocalIconPath(currentValue);
    if (want.startsWith(SC_ICON_PREFIX)) sel.value = want;
  }).catch(() => {});

  return sel;
}


  // -----------------------------
  // THEME
  // -----------------------------
  const THEME = {
    outerBorder: "#7c86cb",
    outerBg: "#202d4d",
    name: "#ffffff",
    lv: "#00ffdd",
    ratio: "#ffffff",
    barFill: "#8398b2",
    barEmpty: "#242c36",
    stroke: "#0b1220",
  };

  // -----------------------------
  // Constants
  // -----------------------------
  const NAME_MAX_PER_LINE = 22;

  const LOCATION_CATEGORIES = [
    "Gate",
    "Battlefield of Chaos",
    "Workshop of Brilliant Light",
    "Mind Rift",
    "Other",
  ];

  // ✅ Fast Lv. Up • Battlefield of Chaos • location border colors
  const FAST_BOC_LOCATION_COLORS = {
    "Fortress of Blazing Fire": "#a21b1b",
    "Battlefield of Dawn": "#1a5aa1",
    "Barren Wilderness": "#a46e1c",
    "Battlefield of the Dead": "#1aa152",
    "Tyrian Ruins": "#531ba4",
  };

  function normalizeBoCLocationName(name) {
    return String(name || "")
      .trim()
      .replace(/\s+Rank\s+\d+\s*$/i, ""); // usuwa " Rank 1", " Rank 2", itd.
  }

  function getFastBoCBorderColor(loc) {
    const cleanName = normalizeBoCLocationName(loc?.name);
    return FAST_BOC_LOCATION_COLORS[cleanName] || "";
  }

  // ✅ Fast Lv. Up • Gate • location border colors
  const FAST_GATE_LOCATION_COLORS = {
    "Normal Gate": "#509dd8",
    "Red Gate": "#ff4054",
    "Dungeon Break": "#c756fe",
  };

  function normalizeGateLocationName(name) {
    return String(name || "")
      .trim()
      .replace(/\s+[SABCD]\s*$/i, ""); // usuwa " S", " A", " B", " C", " D"
  }

  function getFastGateBorderColor(loc) {
    const cleanName = normalizeGateLocationName(loc?.name);
    return FAST_GATE_LOCATION_COLORS[cleanName] || "";
  }

  // ✅ Level-up requirements (from in-game UI)
  // 0→1:15, 1→2:40, 2→3:85, 3→4:150, 4→5:200
  const DEFAULT_LEVEL_MAX = { 0: 15, 1: 40, 2: 85, 3: 150, 4: 200, 5: 0 };

  // -----------------------------
  // API helpers (works both on / and /slahub)
  // -----------------------------
  const API_BASE = location.pathname.startsWith("/slahub") ? "/slahub" : "";
  const apiUrl = (p) => `${API_BASE}${p}`;
  const PUBLIC_TEMPLATE_URL = apiUrl("/data/special_commission_template.json");

  // -----------------------------
  // Guest local progress (no login) — stored in browser only
  // -----------------------------
  const GUEST_LS_KEY = "special_commission_guest_v1";

  function guestLoadLocal() {
    try {
      const raw = localStorage.getItem(GUEST_LS_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data || !Array.isArray(data.enemies) || !Array.isArray(data.locations)) return null;
      return data;
    } catch (_) {
      return null;
    }
  }

  function guestSaveLocal(payload) {
    try {
      localStorage.setItem(GUEST_LS_KEY, JSON.stringify({ ...payload, _guestSavedAt: new Date().toISOString() }));
      return true;
    } catch (_) {
      return false;
    }
  }


  // -----------------------------
  // Helpers
  // -----------------------------
  function textStroke(color = "#000", size = 2) {
    return [
      `${-size}px ${-size}px 0 ${color}`,
      `${0}px ${-size}px 0 ${color}`,
      `${size}px ${-size}px 0 ${color}`,
      `${-size}px ${0}px 0 ${color}`,
      `${size}px ${0}px 0 ${color}`,
      `${-size}px ${size}px 0 ${color}`,
      `${0}px ${size}px 0 ${color}`,
      `${size}px ${size}px 0 ${color}`,
    ].join(", ");
  }

  function clampNum(n, a, b) {
    const x = Number(n);
    if (!Number.isFinite(x)) return a;
    return Math.max(a, Math.min(b, x));
  }

  function normalizeWeeklyOther(raw) {
    const def = { unstableDungeon: [], mindRift: [] };
    if (!raw || typeof raw !== "object") return def;

    const pick = (v) => (Array.isArray(v) ? v.map((x) => String(x ?? "").trim()).filter(Boolean) : []);
    const uniqCap = (arr, max) => {
      const out = [];
      for (const id of arr) {
        if (!id) continue;
        if (!out.includes(id)) out.push(id);
        if (out.length >= max) break;
      }
      return out;
    };

    return {
      unstableDungeon: uniqCap([
        ...pick(raw.unstableDungeon),
        ...pick(raw.encoreMission),
        ...pick(raw.instanceDungeon),
      ], 4),
      mindRift: uniqCap([
        ...pick(raw.mindRift),
        ...pick(raw.mind_rift),
        ...pick(raw.mindrift),
      ], 2),
    };
  }

  function weeklyKeyFromOtherLocationName(name) {
    const n = String(name ?? "").trim().toLowerCase();
    if (n === "unstable dungeon") return "unstableDungeon";
    if (n === "encore mission") return "unstableDungeon";
    if (n === "instance dungeon") return "unstableDungeon";
    return "";
  }

  function weeklyKeyFromFastLocation(cat, selectedLoc) {
    const c = String(cat || "").trim();
    if (c === "Mind Rift") return "mindRift";
    if (c === "Other") return weeklyKeyFromOtherLocationName(selectedLoc?.name || "");
    return "";
  }

  function displayCategoryName(cat) {
    return String(cat) === "Other" ? "Unstable Dungeon" : String(cat || "");
  }

  function normalizeOtherLocationName(name) {
    const n = String(name ?? "").trim();
    const low = n.toLowerCase();
    if (low === "encore mission" || low === "instance dungeon" || low === "unstable dungeon") return "Unstable Dungeon";
    return n;
  }

  function normalizeLocationNameForCategory(category, name) {
    return String(category) === "Other" ? normalizeOtherLocationName(name) : String(name ?? "").trim();
  }

  function supportsActiveEnemy(locOrCategory) {
    // Accept either a category string, or a location-like object {id,name,category}
    if (!locOrCategory) return false;

    if (typeof locOrCategory === "string") {
      const c = String(locOrCategory || "").trim();
      return c === "Gate" || c === "Unstable Dungeon" || c === "Encore Mission" || c === "Instance Dungeon" || c === "Mind Rift";
    }

    const cat = String(locOrCategory.category || "").trim();
    if (cat === "Gate") return true;
    if (cat === "Mind Rift") return true;

    const name = String(locOrCategory.name || "").trim().toLowerCase();
    const id = String(locOrCategory.id || locOrCategory.locationId || "").trim().toLowerCase();

    // Keep Encore/Instance under "Other", but still allow optional second enemy based on name/id.
    if (name.startsWith("unstable dungeon")) return true;
    if (name.startsWith("encore mission")) return true;
    if (name.startsWith("instance dungeon")) return true;

    if (id.includes("unstable_dungeon") || id.includes("unstable dungeon") || id.includes("unstable")) return true;
    if (id.includes("encore_mission") || id.includes("encore mission") || id.includes("encore")) return true;
    if (id.includes("instance_dungeon") || id.includes("instance dungeon") || id.includes("instance")) return true;

    return false;
  }

  // Backwards-compat alias (older call sites)
  function supportsActiveEnemyCategory(category) {
    return supportsActiveEnemy(category);
  }

  function isWeeklySelectedForFast(cat, selectedLoc, enemyId) {
    const k = weeklyKeyFromFastLocation(cat, selectedLoc);
    if (!k) return false;
    const arr = FARM.weeklyOther?.[k] || [];
    return arr.includes(String(enemyId));
  }

  function toggleWeeklyOther(modeKey, enemyId) {
    if (!modeKey) return;

    if (!FARM.weeklyOther || typeof FARM.weeklyOther !== "object") FARM.weeklyOther = normalizeWeeklyOther(null);
    FARM.weeklyOther = normalizeWeeklyOther(FARM.weeklyOther);

    const maxByKey = {
      unstableDungeon: 4,
      mindRift: 2,
    };
    const max = maxByKey[modeKey] || 4;

    if (!Array.isArray(FARM.weeklyOther[modeKey])) FARM.weeklyOther[modeKey] = [];

    const id = String(enemyId ?? "").trim();
    if (!id) return;

    const arr = FARM.weeklyOther[modeKey];
    const idx = arr.indexOf(id);

    if (idx !== -1) {
      arr.splice(idx, 1);
    } else {
      if (arr.length >= max) {
        setAdminMsg(`Max ${max} selected`);
        return;
      }
      arr.push(id);
    }

    FARM.weeklyOther[modeKey] = arr;
    scheduleSave(false);
  }

  function uid(prefix = "id") {
    return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
  }

  function clampText(text, maxChars) {
    const s = String(text || "").trim();
    if (s.length <= maxChars) return s;
    return s.slice(0, Math.max(0, maxChars - 3)).trimEnd() + "...";
  }

  function computeNameFontPx(line1, line2) {
    const hasDots = (line1 && line1.includes("...")) || (line2 && line2.includes("..."));
    if (hasDots) return 11;

    const longest = Math.max((line1 || "").length, (line2 || "").length);

    if (longest <= 19) return 16;
    if (longest <= 20) return 15;
    if (longest <= 21) return 14;
    if (longest <= 22) return 13;
    return 11;
  }

  function splitNameTwoLines(name) {
    const raw = String(name || "").trim();
    if (!raw) return { line1: "", line2: "" };

    if (raw.includes("/")) {
      const parts = raw
        .split("/")
        .map((p) => String(p).trim())
        .filter(Boolean);

      const line1Raw = parts[0] || "";
      const line2Raw = parts.slice(1).join(" ");

      return {
        line1: clampText(line1Raw, NAME_MAX_PER_LINE),
        line2: clampText(line2Raw, NAME_MAX_PER_LINE),
      };
    }

    const words = raw.split(/\s+/).filter(Boolean);
    const full = words.join(" ");

    if (full.length <= NAME_MAX_PER_LINE) return { line1: full, line2: "" };

    let best = null;

    for (let i = 1; i < words.length; i++) {
      const a = words.slice(0, i).join(" ");
      const b = words.slice(i).join(" ");

      const okA = a.length <= NAME_MAX_PER_LINE;
      const okB = b.length <= NAME_MAX_PER_LINE;

      const score = {
        bothOk: okA && okB ? 1 : 0,
        diff: Math.abs(a.length - b.length),
        len1: a.length,
      };

      if (!best) best = { a, b, score };
      else {
        const better =
          score.bothOk > best.score.bothOk ||
          (score.bothOk === best.score.bothOk && score.diff < best.score.diff) ||
          (score.bothOk === best.score.bothOk && score.diff === best.score.diff && score.len1 > best.score.len1);
        if (better) best = { a, b, score };
      }
    }

    let line1 = clampText(best?.a || full, NAME_MAX_PER_LINE);
    let line2 = clampText(best?.b || "", NAME_MAX_PER_LINE);

    return { line1, line2 };
  }

  function displayEnemyName(name) {
    // display-only: "A/B" => "A B"
    return String(name || "")
      .replace(/\s*\/\s*/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  // -----------------------------
  // STATE
  // -----------------------------
  const FARM = {
    subtab: "commissions", // 'commissions' | 'fast' | 'admin'
    adminTab: "commissions", // 'commissions' | 'locations'
    adminLocationsFilter: "All",
    adminEnemyQuery: "",
    adminEnemyLimit: 20,
    adminEnemyRecentOnly: false,
    modal: { open: false, mode: null, enemyId: null, locationId: null, category: null, kills: null, stack: [] },
    collapsedCatsByEnemy: {},

    fastSelectedLocation: {}, // { "Gate": "loc_id", "Other": "loc_id", ... }
    fastIncludeMax: false, // ✅ Fast Lv. Up shows MAX enemies too (toggle from Admin)
    weeklyOther: { unstableDungeon: [], mindRift: [] }, // Weekly picks for Fast Lv. Up


    editMode: false,
    adminEnemyEdit: {},    // per-enemy edit toggles in Admin
    isAdmin: false,         // "czy user jest adminem" (perms)
    showAdminTab: false,    // "czy przycisk admin ma być widoczny" (perms + hide toggle)
    readOnly: true,
    loading: true,
    saving: false,
    dirty: false,

    adminAddRel: {},
    adminAddLocationName: Object.fromEntries(LOCATION_CATEGORIES.map((c) => [c, ""])),
    adminMsg: "",

    enemies: [
      {
        id: "goblin_spellcaster",
        name: "Goblin Spellcaster",
        level: 0,
        maxLevel: 5,
        levelMax: { 0: 15, 1: 40, 2: 85, 3: 140, 4: 200, 5: 0 },
        cur: 0,
        iconUrl:
          "/picture/Special_Commission/Goblin_Spellcaster.png",
      },
      {
        id: "elite_goblin_fighter",
        name: "Elite Goblin/Fighter",
        level: 0,
        maxLevel: 5,
        levelMax: { 0: 15, 1: 40, 2: 85, 3: 140, 4: 200, 5: 0 },
        cur: 0,
        iconUrl:
          "/picture/Special_Commission/Elite_Goblin_Fighter.png",
      },
      {
        id: "blue_fang_razan",
        name: "Blue Fang Razan",
        level: 0,
        maxLevel: 5,
        levelMax: { 0: 15, 1: 40, 2: 140, 3: 140, 4: 200, 5: 0 },
        cur: 0,
        iconUrl:
          "/picture/Special_Commission/Blue_Fang_Razan.png",
      },
    ],

    locations: [
      { id: "loc_gate_s", category: "Gate", name: "Normal Gate S" },
      { id: "loc_boc_fbf", category: "Battlefield of Chaos", name: "Fortress of Blazing Fire" },
      { id: "loc_wobl_vulcan", category: "Workshop of Brilliant Light", name: "The Flames of Vulcan" },
      { id: "mind_rift", category: "Mind Rift", name: "Mind Rift" },
      { id: "loc_other_id", category: "Other", name: "Unstable Dungeon" },
    ],

    rel: [
      { enemyId: "goblin_spellcaster", locationId: "loc_gate_s", kills: 1, note: "" },
      { enemyId: "elite_goblin_fighter", locationId: "loc_boc_fbf", kills: 2, note: "" },
    ],
  };

  // ✅ EVENT: jak w Admin.js (instant hide/show admin tabs)
  window.addEventListener("sla:admin-hide-changed", (e) => {
    try {
      ensureStateUi();
      const hide = !!e?.detail?.hide;
      window.STATE.ui.hideAdminButtons = hide;

      // jeśli user jest na adminie, a admin schowany -> wróć do Commissions
      if (FARM.subtab === "admin" && hide) {
        FARM.subtab = "commissions";
      }

      // przelicz widoczność
      const viewUserId = window.STATE?.viewUserId ? Number(window.STATE.viewUserId) : null;
      const me = window.STATE?.me || null;

      FARM.isAdmin = isAdminUser(me) && !!me && !viewUserId;
      FARM.showAdminTab = isAdminTabVisible(me, viewUserId);

      render();
    } catch {}
  });

  // -----------------------------
  // Normalizers
  // -----------------------------
  function getYForLevel(enemy, lvl) {
    const y = Number(enemy?.levelMax?.[lvl] ?? 0);
    return Number.isFinite(y) ? y : 0;
  }

  function ensureEnemyShape(enemy) {
    if (!enemy) return enemy;

    enemy.name = String(enemy.name ?? "Enemy");
    enemy.iconUrl = String(enemy.iconUrl ?? "");

    enemy.maxLevel = clampNum(enemy.maxLevel ?? 5, 0, 5);

    if (!enemy.levelMax || typeof enemy.levelMax !== "object") enemy.levelMax = {};
    const looksLikeOldPreset =
      Number(enemy.levelMax[0]) === 10 && Number(enemy.levelMax[1]) === 30 && Number(enemy.levelMax[2]) === 85 &&
      Number(enemy.levelMax[3]) === 140 && Number(enemy.levelMax[4]) === 200 && Number(enemy.levelMax[5]) === 250;

    const looksLikeOldPreset2 =
      Number(enemy.levelMax[0]) === 20 && Number(enemy.levelMax[1]) === 40 && Number(enemy.levelMax[2]) === 140 &&
      Number(enemy.levelMax[3]) === 200 && Number(enemy.levelMax[4]) === 260 && Number(enemy.levelMax[5]) === 320;

    if (looksLikeOldPreset || looksLikeOldPreset2) {
      enemy.levelMax = { ...DEFAULT_LEVEL_MAX };
    }

    for (let i = 0; i <= 5; i++) {
      if (enemy.levelMax[i] === undefined) enemy.levelMax[i] = DEFAULT_LEVEL_MAX[i] ?? 0;
      enemy.levelMax[i] = clampNum(enemy.levelMax[i], 0, 999999);
    }

    enemy.level = clampNum(enemy.level ?? 0, 0, enemy.maxLevel);

    const y = getYForLevel(enemy, enemy.level);
    if (y <= 0) enemy.cur = 0;
    else enemy.cur = clampNum(enemy.cur ?? 0, 0, y);

    return enemy;
  }

  function ensureLocations() {
    FARM.locations = (Array.isArray(FARM.locations) ? FARM.locations : [])
      .filter((l) => String(l?.category || "").trim() !== "Secret Library")
      .map((l) => {
        const id = String(l.id ?? uid("loc"));
        let category = LOCATION_CATEGORIES.includes(l.category) ? l.category : "Other";
        const name = normalizeLocationNameForCategory(category, String(l.name ?? ""));

        return { ...l, category, name, id };
      });
  }

  function normalizeUnstableDungeonLocations() {
    const isUnstableLoc = (l) => {
      if (!l) return false;
      const cat = String(l.category || "").trim();
      if (cat !== "Other") return false;
      const name = String(l.name || "").trim().toLowerCase();
      const id = String(l.id || "").trim().toLowerCase();
      return (
        name === "unstable dungeon" ||
        name === "encore mission" ||
        name === "instance dungeon" ||
        id.includes("unstable") ||
        id.includes("encore") ||
        id.includes("instance")
      );
    };

    const matches = (FARM.locations || []).filter(isUnstableLoc);
    if (!matches.length) return;

    const primary = matches.find((l) => String(l.name || "").trim().toLowerCase() === "unstable dungeon") || matches[0];
    const primaryId = String(primary.id);

    FARM.locations = (FARM.locations || [])
      .map((l) => isUnstableLoc(l) ? { ...l, id: primaryId, category: "Other", name: "Unstable Dungeon" } : l)
      .filter((l, idx, arr) => idx === arr.findIndex((x) => String(x.id) === String(l.id)));

    FARM.rel = (FARM.rel || []).map((r) => {
      const locId = String(r.locationId || "");
      const hit = matches.some((l) => String(l.id) === locId);
      return hit ? { ...r, locationId: primaryId } : r;
    });

    if (FARM.fastSelectedLocation && matches.some((l) => String(l.id) === String(FARM.fastSelectedLocation?.Other || ""))) {
      FARM.fastSelectedLocation.Other = primaryId;
    }
  }

  function cleanupAndEnsureSpecialCommissionLocations() {
    FARM.locations = Array.isArray(FARM.locations) ? FARM.locations : [];
    FARM.locations = FARM.locations.filter((loc) => String(loc?.category || "").trim() !== "Secret Library");

    const hasMindRift = FARM.locations.some((loc) =>
      String(loc?.category || "").trim() === "Mind Rift" ||
      String(loc?.name || "").trim().toLowerCase() === "mind rift" ||
      String(loc?.id || "").trim().toLowerCase() === "mind_rift"
    );

    if (!hasMindRift) {
      FARM.locations.push({
        id: "mind_rift",
        name: "Mind Rift",
        category: "Mind Rift",
      });
    }

    const validLocationIds = new Set(FARM.locations.map((l) => String(l.id || "")));

    FARM.rel = Array.isArray(FARM.rel) ? FARM.rel : [];
    FARM.rel = FARM.rel.filter((r) => validLocationIds.has(String(r.locationId || "")));
    FARM.weeklyOther = normalizeWeeklyOther(FARM.weeklyOther);
  }

  ensureLocations();
  normalizeUnstableDungeonLocations();
  cleanupAndEnsureSpecialCommissionLocations();
  FARM.enemies = FARM.enemies.map(ensureEnemyShape);

  let __adminMsgTimer = null;

  function setAdminMsg(msg) {
    FARM.adminMsg = msg;

    if (!FARM.loading && !FARM.saving) render();

    clearTimeout(__adminMsgTimer);
    __adminMsgTimer = setTimeout(() => {
      FARM.adminMsg = "";
      if (!FARM.loading && !FARM.saving) render();
    }, 1800);
  }

  // -----------------------------
  // Data helpers
  // -----------------------------
  function isEnemyMax(enemy) {
    const lv = Number(enemy?.level ?? 0);
    const max = Number(enemy?.maxLevel ?? 5);
    return lv >= max;
  }
  function getEnemyById(id) {
    return FARM.enemies.find((e) => String(e.id) === String(id)) || null;
  }
  function getLocationById(id) {
    return FARM.locations.find((l) => String(l.id) === String(id)) || null;
  }

  function getRel(enemyId, locationId) {
    return FARM.rel.find((r) => String(r.enemyId) === String(enemyId) && String(r.locationId) === String(locationId)) || null;
  }

  function upsertRel(enemyId, locationId, kills, activeEnemyId = "") {
    const k = clampNum(kills, 1, 99);
    const row = getRel(enemyId, locationId);

    // ✅ NEW: active enemy for Gate relations (optional)
    const aId = String(activeEnemyId || "");
    if (row) {
      row.kills = k;
      row.activeEnemyId = aId;
    } else {
      FARM.rel.push({
        enemyId: String(enemyId),
        locationId: String(locationId),
        kills: k,
        note: "",
        activeEnemyId: aId,
      });
    }
  }

  function deleteRel(enemyId, locationId) {
    FARM.rel = FARM.rel.filter((r) => !(String(r.enemyId) === String(enemyId) && String(r.locationId) === String(locationId)));
  }

  function getAssignedForEnemy(enemyId) {
    return FARM.rel
      .filter((r) => String(r.enemyId) === String(enemyId))
      .map((r) => {
        const loc = getLocationById(r.locationId);
        if (!loc) return null;
        return { loc, kills: r.kills, activeEnemyId: String(r.activeEnemyId || "") };
      })
      .filter(Boolean);
  }

  function getUnassignedLocationsForEnemy(enemyId) {
    const used = new Set(FARM.rel.filter((r) => String(r.enemyId) === String(enemyId)).map((r) => String(r.locationId)));
    return FARM.locations.filter((l) => !used.has(String(l.id)));
  }

  function getLocationsForEnemy(enemyId) {
    const rows = FARM.rel
      .filter((r) => String(r.enemyId) === String(enemyId))
      .map((r) => {
        const loc = getLocationById(r.locationId);
        if (!loc) return null;
        return { ...loc, kills: r.kills, activeEnemyId: String(r.activeEnemyId || "") };
      })
      .filter(Boolean);

    const grouped = new Map();
    for (const row of rows) {
      const cat = row.category || "Other";
      if (!grouped.has(cat)) grouped.set(cat, []);
      grouped.get(cat).push(row);
    }
    return grouped;
  }

  function getEnemiesForLocationAll(locationId) {
    const loc = getLocationById(locationId);
    const isPairLoc = !!(loc && supportsActiveEnemy(loc));

    const relRows = FARM.rel.filter((r) => String(r.locationId) === String(locationId));

    // ✅ Non-Gate: keep 1:1 mapping
    if (!isPairLoc) {
      const rows = relRows
        .map((r) => {
          const enemy = getEnemyById(r.enemyId);
          if (!enemy) return null;

          const activeEnemyId = String(r.activeEnemyId || "");
          const activeEnemy = activeEnemyId ? getEnemyById(activeEnemyId) : null;

          return {
            ...enemy,
            kills: r.kills,
            activeEnemyId,
            activeEnemy: activeEnemy ? { ...activeEnemy } : null,
          };
        })
        .filter(Boolean);

      return rows;
    }

    // ✅ Gate: dedupe instances
    // If we have a row like: X @ Gate [Y], then in Gate view we should NOT show both:
    // - Y (base) and Y|X (variant). They represent the same instance.
    // We show only one entry: (active = Y, normal = X).
    const groups = new Map(); // targetId -> { base: relRow|null, variants: relRow[] }

    for (const r of relRows) {
      const enemyId = String(r.enemyId || "");
      const activeEnemyId = String(r.activeEnemyId || "");
      const targetId = activeEnemyId || enemyId;
      if (!targetId) continue;

      if (!groups.has(targetId)) groups.set(targetId, { base: null, variants: [] });
      const g = groups.get(targetId);

      if (activeEnemyId && activeEnemyId !== enemyId) {
        g.variants.push(r);
      } else {
        g.base = r;
      }
    }

    const merged = [];

    for (const [targetId, g] of groups) {
      if (g.variants && g.variants.length) {
        const r = g.variants[0];
        const normalEnemy = getEnemyById(r.enemyId);      // right side (normal)
        const activeEnemy = getEnemyById(targetId);       // left side (active / bracket)

        if (!normalEnemy) continue;

        merged.push({
          ...normalEnemy,
          kills: r.kills,
          activeEnemyId: String(targetId),
          activeEnemy: activeEnemy ? { ...activeEnemy } : null,
        });
      } else if (g.base) {
        const r = g.base;
        const enemy = getEnemyById(r.enemyId);
        if (!enemy) continue;

        merged.push({
          ...enemy,
          kills: r.kills,
          activeEnemyId: "",
          activeEnemy: null,
        });
      }
    }

    // Keep ordering stable (same as FARM.enemies)
    const map = new Map(merged.map((e) => [String(e.id), e]));
    const ordered = [];
    for (const base of FARM.enemies) {
      const row = map.get(String(base.id));
      if (row) ordered.push(row);
    }
    for (const e of merged) {
      if (!ordered.some((x) => String(x.id) === String(e.id))) ordered.push(e);
    }

    return ordered;
  }

  // ✅ For locations that can have 2 enemies in one entry (normal + optional active),
  // consider the entry MAX only when **both** are MAX.
  function isEnemyEntryMax(entry, isPairLoc) {
    if (!entry) return true;
    if (isPairLoc && entry.activeEnemy) {
      return isEnemyMax(entry) && isEnemyMax(entry.activeEnemy);
    }
    return isEnemyMax(entry);
  }

  // ✅ default behavior (used outside Fast): NOT MAX only
  function getEnemiesForLocation(locationId) {
    const all = getEnemiesForLocationAll(locationId);
    const loc = getLocationById(locationId);
    const isPairLoc = !!(loc && supportsActiveEnemy(loc));

    return all.filter((e) => !isEnemyEntryMax(e, isPairLoc));
  }

  // ✅ Fast behavior: depends on toggle
  function getEnemiesForLocationFast(locationId) {
    const all = getEnemiesForLocationAll(locationId);
    if (FARM.fastIncludeMax) return all;

    const loc = getLocationById(locationId);
    const isPairLoc = !!(loc && supportsActiveEnemy(loc));

    return all.filter((e) => !isEnemyEntryMax(e, isPairLoc));
  }

  function getFastAvailableLocationsByCategory(cat) {
    return FARM.locations
      .filter((l) => l.category === cat)
      .filter((l) => {
        const enemies = getEnemiesForLocationFast(l.id);
        return enemies && enemies.length > 0;
      });
  }

  function getFastCategoryStats(cat) {
    const locs = FARM.locations.filter((l) => l.category === cat);

    const uniqueEnemyIds = new Set();
    let totalEnemyEntries = 0;

    for (const loc of locs) {
      const enemies = getEnemiesForLocationFast(loc.id);
      totalEnemyEntries += enemies.length;
      for (const e of enemies) uniqueEnemyIds.add(String(e.id));
    }

    return {
      uniqueEnemies: uniqueEnemyIds.size,
      totalEntries: totalEnemyEntries,
    };
  }

  function ensureFastSelected(cat) {
    const list = getFastAvailableLocationsByCategory(cat);
    if (!list.length) {
      FARM.fastSelectedLocation[cat] = "";
      return;
    }

    const cur = String(FARM.fastSelectedLocation[cat] || "");
    const ok = list.some((l) => String(l.id) === cur);

    if (!ok) {
      FARM.fastSelectedLocation[cat] = String(list[0].id);
    }
  }

  function fastStepLocation(dir) {
    const cat = FARM.modal.category;
    if (!cat) return;

    const list = getFastAvailableLocationsByCategory(cat);
    if (!list.length) return;

    ensureFastSelected(cat);

    const curId = String(FARM.fastSelectedLocation[cat] || "");
    let idx = list.findIndex((l) => String(l.id) === curId);
    if (idx < 0) idx = 0;

    const next = (idx + dir + list.length) % list.length;
    FARM.fastSelectedLocation[cat] = String(list[next].id);
    render();
  }

  function openFastCategoryModal(cat) {
    FARM.modal.stack = [];

    FARM.modal.open = true;
    FARM.modal.mode = "fast_category";
    FARM.modal.category = cat;
    FARM.modal.enemyId = null;
    FARM.modal.locationId = null;
    FARM.modal.kills = null;
    ensureFastSelected(cat);
    render();
  }

  // -----------------------------
  // Save/Load/Export/Import
  // -----------------------------
  function getExportData() {
    return {
      enemies: FARM.enemies,
      locations: FARM.locations,
      rel: FARM.rel,
      weeklyOther: normalizeWeeklyOther(FARM.weeklyOther),
    };
  }

  function applyImportedData(data) {
    if (!data || typeof data !== "object") return false;
    if (!Array.isArray(data.enemies) || !Array.isArray(data.locations) || !Array.isArray(data.rel)) return false;

    FARM.enemies = data.enemies.map(ensureEnemyShape);
    FARM.locations = data.locations
      .filter((l) => String(l?.category || "").trim() !== "Secret Library")
      .map((l) => {
        const category = LOCATION_CATEGORIES.includes(l.category) ? l.category : "Other";
        return {
          id: String(l.id ?? uid("loc")),
          category,
          name: normalizeLocationNameForCategory(category, String(l.name ?? "")),
        };
      });
    ensureLocations();
    FARM.rel = data.rel
      .map((r) => {
        const enemyId = String(r.enemyId ?? "");
        const locationId = String(r.locationId ?? "");
        const kills = clampNum(r.kills ?? 1, 1, 99);
        const note = String(r.note ?? "");

        // ✅ NEW: optional "activeEnemyId" (used for Gate relations)
        let activeEnemyId = String(r.activeEnemyId ?? "");
        // validate: allow empty, otherwise must exist
        if (activeEnemyId && !FARM.enemies.some((e) => String(e.id) === activeEnemyId)) activeEnemyId = "";

        return { enemyId, locationId, kills, note, activeEnemyId };
      })
      .filter((r) => r.enemyId && r.locationId);

    const enemySet = new Set(FARM.enemies.map((e) => String(e.id)));
    const locSet = new Set(FARM.locations.map((l) => String(l.id)));
    FARM.rel = FARM.rel.filter((r) => enemySet.has(String(r.enemyId)) && locSet.has(String(r.locationId)));

    normalizeUnstableDungeonLocations();
    FARM.weeklyOther = normalizeWeeklyOther(data.weeklyOther);
    cleanupAndEnsureSpecialCommissionLocations();

    return true;
  }

  function resetEnemiesProgress() {
    FARM.enemies = FARM.enemies.map((enemy) => {
      const e = ensureEnemyShape(enemy);
      e.level = 0;
      e.cur = 0;
      return e;
    });
  }

  // -----------------------------
  // DB load/save (no localStorage)
  // -----------------------------
  let _initDone = false;
  let _saveTimer = null;
  let _saveInFlight = false;
  let _saveQueued = false;

  function scheduleSave(immediate = false) {
    if (FARM.readOnly) return;
    FARM.dirty = true;

    if (immediate) {
      saveNow({ silent: false });
      return;
    }

    clearTimeout(_saveTimer);
    _saveTimer = setTimeout(() => saveNow({ silent: true }), 350);
  }

  async function saveNow({ silent = false } = {}) {
    if (FARM.readOnly) return;
    if (!_initDone) return;

    // Guest mode: save to localStorage only (no server sync)
    {
      const me = window.STATE?.me || null;
      const viewUserId = window.STATE?.viewUserId ? Number(window.STATE.viewUserId) : null;
      if (!me && !viewUserId) {
        FARM.saving = true;
        const ok = guestSaveLocal(getExportData());
        FARM.saving = false;
        FARM.dirty = false;
        if (!silent && !ok) window.alert("Couldn't save locally (browser storage blocked/full).");
        return;
      }
    }

    if (_saveInFlight) {
      _saveQueued = true;
      return;
    }

    _saveInFlight = true;

    const shouldRender = !silent || FARM.subtab === "admin";

    if (!silent) {
      FARM.saving = true;
      if (shouldRender) render();
    }

    try {
      const res = await fetch(apiUrl("/api/special-commission/v2"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(getExportData()),
      });

      let out = {};
      try { out = await res.json(); } catch {}

      if (!res.ok) {
        if (!silent) setAdminMsg(out?.error ? String(out.error) : `DB save failed (${res.status})`);
      } else {
        FARM.dirty = false;
        if (!silent) setAdminMsg("Saved ✅");
      }
    } catch (e) {
      if (!silent) setAdminMsg("DB save failed ❌");
    } finally {
      if (!silent) FARM.saving = false;

      _saveInFlight = false;

      if (shouldRender) render();

      if (_saveQueued) {
        _saveQueued = false;
        saveNow({ silent });
      }
    }
  }

  async function loadFromDB() {
    FARM.loading = true;
  
    try {
      const viewUserId = window.STATE?.viewUserId ? Number(window.STATE.viewUserId) : null;
      const me = window.STATE?.me || null;
    
      // ✅ GUEST: nie trzeba logowania — użytkownik może klikać i śledzić postęp lokalnie (localStorage)
    if (!me && !viewUserId) {
      FARM.guest = true;
      FARM.readOnly = false;
      FARM.isAdmin = false;
      FARM.showAdminTab = false;

      try {
        const tRes = await fetch(apiUrl("/api/public/special-commission/v2"), { cache: "no-store" });
        const tpl = await tRes.json();
        const okTpl = applyImportedData(tpl);
        resetEnemiesProgress();
        FARM.weeklyOther = normalizeWeeklyOther(tpl?.weeklyOther);


        if (!okTpl) setAdminMsg("Template load failed");
        else setAdminMsg("Guest mode: local progress (not synced)");
      } catch {
        setAdminMsg("Template load failed");
      }

      // Apply locally saved guest progress (if any)
      const local = guestLoadLocal();
      if (local) {
        mergeImportedData(local, { preserveProgress: false, matchByNameIfIdMissing: true, pruneMissing: false });
      }
      // ✅ weekly picks from guest local save (if present)
      FARM.weeklyOther = normalizeWeeklyOther(local?.weeklyOther);
      cleanupAndEnsureSpecialCommissionLocations();

      FARM.dirty = false;
      return;
    }

// -------------------------
      // Zalogowany lub viewUserId
      // -------------------------
      const qs = viewUserId ? `?userId=${encodeURIComponent(String(viewUserId))}` : "";
      const res = await fetch(apiUrl(`/api/special-commission/v2${qs}`), { cache: "no-store" });
    
      let data = null;
      try {
        data = await res.json();
      } catch {
        data = null;
      }
    
      if (!res.ok) {
        // viewUserId (podgląd) albo inne błędy
        setAdminMsg(data?.error ? String(data.error) : `DB load failed (${res.status})`);
        return;
      }
    
      const empty =
        data &&
        Array.isArray(data.enemies) &&
        Array.isArray(data.locations) &&
        Array.isArray(data.rel) &&
        data.enemies.length === 0 &&
        data.locations.length === 0 &&
        data.rel.length === 0;
    
      // ✅ zalogowany user ma pusto w DB → inicjalizujemy danymi bazowymi i zapisujemy
      if (empty && !viewUserId && me) {
        FARM.enemies = FARM.enemies.map((e) => {
          e = ensureEnemyShape(e);
          e.level = 0;
          e.cur = 0;
          return e;
        });
      
        ensureLocations();
        normalizeUnstableDungeonLocations();
        cleanupAndEnsureSpecialCommissionLocations();

        _initDone = true;
        setAdminMsg("Initializing…");
        await saveNow();
        return;
      }
    
      // ✅ podgląd cudzego profilu i pusto
      if (empty && viewUserId) {
        FARM.enemies = [];
        FARM.locations = [];
        FARM.rel = [];
        setAdminMsg("Brak danych");
        return;
      }
    
      const ok = applyImportedData(data);
      if (!ok) setAdminMsg("Invalid data from DB");
      else setAdminMsg("");
    } catch (e) {
      setAdminMsg("DB load failed ❌");
    } finally {
      FARM.loading = false;
      _initDone = true;
      render();
    }
  }
  

  // -----------------------------
  // Export/Import (FILE) + MERGE (no progress reset)
  // -----------------------------
  function _downloadTextFile(filename, text, mime = "application/json") {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function _pickJsonFileText() {
    return new Promise((resolve, reject) => {
      const inp = document.createElement("input");
      inp.type = "file";
      inp.accept = "application/json,.json";
      inp.onchange = async () => {
        try {
          const file = inp.files && inp.files[0];
          if (!file) return resolve(null);
          const txt = await file.text();
          resolve(txt);
        } catch (e) {
          reject(e);
        }
      };
      inp.click();
    });
  }

  function _normalizeImportPayload(raw) {
    if (!raw || typeof raw !== "object") return null;
    if (raw.payload && typeof raw.payload === "object") return raw.payload;
    if (raw.data && typeof raw.data === "object") return raw.data;
    return raw;
  }

  function _normName(s) {
    return String(s || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
  }

  function mergeImportedData(importData, opts = {}) {
    const {
      preserveProgress = true,
      matchByNameIfIdMissing = true,
      pruneMissing = false,
    } = opts;

    const data = _normalizeImportPayload(importData);

    if (!data || typeof data !== "object") return { ok: false, error: "Invalid JSON (not an object)" };
    if (!Array.isArray(data.enemies) || !Array.isArray(data.locations) || !Array.isArray(data.rel)) {
      return { ok: false, error: "Invalid JSON (missing enemies/locations/rel arrays)" };
    }

    const existingEnemies = (FARM.enemies || []).map(ensureEnemyShape);
    const existingLocations = (FARM.locations || [])
      .filter((l) => String(l?.category || "").trim() !== "Secret Library")
      .map((l) => {
        const category = LOCATION_CATEGORIES.includes(l.category) ? l.category : "Other";
        return {
          id: String(l.id ?? uid("loc")),
          category,
          name: normalizeLocationNameForCategory(category, String(l.name ?? "")),
        };
      });

    const enemiesById = new Map(existingEnemies.map((e) => [String(e.id), e]));
    const enemiesByName = new Map(existingEnemies.map((e) => [_normName(e.name), e]));

    const locById = new Map(existingLocations.map((l) => [String(l.id), l]));
    const locByName = new Map(existingLocations.map((l) => [_normName(`${l.category}||${l.name}`), l]));

    let addedEnemies = 0;
    let updatedEnemies = 0;

    const newEnemiesOrder = [];
    const seenEnemyIds = new Set();

    for (const rawEnemy of data.enemies) {
      let imp = ensureEnemyShape({ ...rawEnemy });

      if (!imp.id) imp.id = uid("enemy");
      let target = enemiesById.get(String(imp.id));

      if (!target && matchByNameIfIdMissing) {
        const byName = enemiesByName.get(_normName(imp.name));
        if (byName) {
          imp.id = byName.id;
          target = byName;
        }
      }

      if (target) {
        const keepLevel = target.level;
        const keepCur = target.cur;

        const merged = ensureEnemyShape({
          ...target,
          ...imp,
          level: preserveProgress ? keepLevel : imp.level,
          cur: preserveProgress ? keepCur : imp.cur,
        });

        merged.level = clampNum(merged.level ?? 0, 0, merged.maxLevel ?? 5);
        const y = getYForLevel(merged, merged.level);
        merged.cur = y > 0 ? clampNum(merged.cur ?? 0, 0, y) : 0;

        enemiesById.set(String(merged.id), merged);
        updatedEnemies++;
        if (!seenEnemyIds.has(String(merged.id))) {
          newEnemiesOrder.push(String(merged.id));
          seenEnemyIds.add(String(merged.id));
        }
      } else {
        enemiesById.set(String(imp.id), imp);
        addedEnemies++;
        if (!seenEnemyIds.has(String(imp.id))) {
          newEnemiesOrder.push(String(imp.id));
          seenEnemyIds.add(String(imp.id));
        }
      }
    }

    const finalEnemies = [];
    if (!pruneMissing) {
      for (const e of existingEnemies) {
        const id = String(e.id);
        if (enemiesById.has(id)) finalEnemies.push(enemiesById.get(id));
      }
      for (const id of newEnemiesOrder) {
        const isAlready = finalEnemies.some((x) => String(x.id) === id);
        if (!isAlready) finalEnemies.push(enemiesById.get(id));
      }
    } else {
      for (const id of newEnemiesOrder) finalEnemies.push(enemiesById.get(id));
    }

    let addedLocs = 0;
    let updatedLocs = 0;

    const newLocOrder = [];
    const seenLocIds = new Set();

    for (const rawLoc of data.locations) {
      if (String(rawLoc?.category || "").trim() === "Secret Library") continue;
      const category = LOCATION_CATEGORIES.includes(rawLoc.category) ? rawLoc.category : "Other";
      let imp = {
        id: String(rawLoc.id ?? ""),
        category,
        name: normalizeLocationNameForCategory(category, String(rawLoc.name ?? "")),
      };

      if (!imp.id) imp.id = uid("loc");

      let target = locById.get(String(imp.id));

      if (!target && matchByNameIfIdMissing) {
        const byName = locByName.get(_normName(`${imp.category}||${imp.name}`));
        if (byName) {
          imp.id = byName.id;
          target = byName;
        }
      }

      if (target) {
        const merged = { ...target, ...imp };
        locById.set(String(merged.id), merged);
        updatedLocs++;
        if (!seenLocIds.has(String(merged.id))) {
          newLocOrder.push(String(merged.id));
          seenLocIds.add(String(merged.id));
        }
      } else {
        locById.set(String(imp.id), imp);
        addedLocs++;
        if (!seenLocIds.has(String(imp.id))) {
          newLocOrder.push(String(imp.id));
          seenLocIds.add(String(imp.id));
        }
      }
    }

    const finalLocs = [];
    if (!pruneMissing) {
      for (const l of existingLocations) {
        const id = String(l.id);
        if (locById.has(id)) finalLocs.push(locById.get(id));
      }
      for (const id of newLocOrder) {
        const isAlready = finalLocs.some((x) => String(x.id) === id);
        if (!isAlready) finalLocs.push(locById.get(id));
      }
    } else {
      for (const id of newLocOrder) finalLocs.push(locById.get(id));
    }

    const enemySet = new Set(finalEnemies.map((e) => String(e.id)));
    const locSet = new Set(finalLocs.map((l) => String(l.id)));

    // ... w mergeImportedData, po enemySet/locSet

    const relMap = new Map();

    if (!pruneMissing) {
      for (const r of FARM.rel || []) {
        const enemyId = String(r.enemyId ?? "");
        const locationId = String(r.locationId ?? "");
        if (!enemySet.has(enemyId) || !locSet.has(locationId)) continue;
      
        let activeEnemyId = String(r.activeEnemyId ?? "");
        if (activeEnemyId && !enemySet.has(activeEnemyId)) activeEnemyId = "";
      
        const key = `${enemyId}|${locationId}`;
        relMap.set(key, {
          enemyId,
          locationId,
          kills: clampNum(r.kills ?? 1, 1, 99),
          note: String(r.note ?? ""),
          activeEnemyId,
        });
      }
    }

    for (const r of data.rel) {
      const enemyId = String(r.enemyId ?? "");
      const locationId = String(r.locationId ?? "");
      if (!enemySet.has(enemyId) || !locSet.has(locationId)) continue;
    
      let activeEnemyId = String(r.activeEnemyId ?? "");
      if (activeEnemyId && !enemySet.has(activeEnemyId)) activeEnemyId = "";
    
      const key = `${enemyId}|${locationId}`;
      relMap.set(key, {
        enemyId,
        locationId,
        kills: clampNum(r.kills ?? 1, 1, 99),
        note: String(r.note ?? ""),
        activeEnemyId,
      });
    }

    const finalRel = Array.from(relMap.values());

    FARM.enemies = finalEnemies.map(ensureEnemyShape);
    FARM.locations = finalLocs;
    ensureLocations();
    FARM.rel = finalRel;
    normalizeUnstableDungeonLocations();
    cleanupAndEnsureSpecialCommissionLocations();

    return {
      ok: true,
      stats: { addedEnemies, updatedEnemies, addedLocs, updatedLocs, relCount: finalRel.length },
    };
  }

  async function exportJSONFile({ templateOnly = false } = {}) {
    try {
      const base = getExportData();

      const out = templateOnly
        ? {
            schemaVersion: 2,
            kind: "specialCommissionTemplate",
            exportedAt: new Date().toISOString(),
            payload: {
              enemies: base.enemies.map((e) => {
                const copy = { ...e };
                copy.level = 0;
                copy.cur = 0;
                return copy;
              }),
              locations: base.locations,
              rel: base.rel,
            },
          }
        : {
            schemaVersion: 2,
            kind: "specialCommissionFull",
            exportedAt: new Date().toISOString(),
            payload: base,
          };

      const txt = JSON.stringify(out, null, 2);
      const fname = templateOnly ? "special_commission_template.json" : "special_commission_backup.json";
      _downloadTextFile(fname, txt);
      setAdminMsg(templateOnly ? "Template exported ✅" : "Backup exported ✅");
    } catch (e) {
      setAdminMsg("Export failed ❌");
    }
  }

  async function importJSONFile({ mode = "merge" } = {}) {
    try {
      const txt = await _pickJsonFileText();
      if (!txt) return;

      const data = JSON.parse(txt);

      if (mode === "replace") {
        const ok = applyImportedData(_normalizeImportPayload(data));
        if (!ok) return setAdminMsg("Import failed ❌");
        setAdminMsg("Imported (REPLACE) ✅");
        scheduleSave(true);
        render();
        return;
      }

      const res = mergeImportedData(data, {
        preserveProgress: true,
        matchByNameIfIdMissing: true,
        pruneMissing: false,
      });

      if (!res.ok) return setAdminMsg(res.error || "Import failed ❌");

      const s = res.stats;
      setAdminMsg(`Imported (MERGE) ✅ +E:${s.addedEnemies} ~E:${s.updatedEnemies} +L:${s.addedLocs} ~L:${s.updatedLocs}`);
      scheduleSave(true);
      render();
    } catch (e) {
      setAdminMsg("Import failed ❌");
    }
  }

  // -----------------------------
  // Global EDIT actions
  // -----------------------------
  function toggleEditMode() {
    if (FARM.readOnly) return;
    FARM.editMode = !FARM.editMode;
    render();
  }

  function setCurPrompt(enemyId, ev) {
    if (ev) ev.stopPropagation();
    if (FARM.readOnly) return;

    const e = getEnemyById(enemyId);
    if (!e) return;

    ensureEnemyShape(e);

    if (isEnemyMax(e)) return;

    const y = getYForLevel(e, e.level);
    if (y <= 0) return;

    const val = window.prompt(`Set kills for Lv. ${e.level} (0-${y}):`, String(e.cur ?? 0));
    if (val === null) return;

    const n = clampNum(Number(val), 0, y);
    e.cur = n;

    scheduleSave();
    render();
  }

  function adjustCur(enemyId, delta, ev) {
    if (ev) ev.stopPropagation();
    if (FARM.readOnly) return;

    const e = getEnemyById(enemyId);
    if (!e) return;

    ensureEnemyShape(e);

    // --------
    // MINUS
    // --------
    if (delta < 0) {
      let steps = Math.abs(delta);

      while (steps > 0) {
        const maxLv = clampNum(e.maxLevel ?? 5, 0, 5);
        const lv = clampNum(Number(e.level ?? 0), 0, maxLv);

        if (lv >= maxLv) {
          if (maxLv <= 0) break;
          e.level = maxLv - 1;
          const yPrev = getYForLevel(e, e.level);
          e.cur = yPrev > 0 ? yPrev - 1 : 0;
          steps--;
          continue;
        }

        const y = getYForLevel(e, lv);
        const cur = clampNum(Number(e.cur ?? 0), 0, y > 0 ? y : 0);

        if (cur > 0) {
          e.cur = cur - 1;
          steps--;
          continue;
        }

        if (lv > 0) {
          e.level = lv - 1;
          const yPrev = getYForLevel(e, e.level);
          e.cur = yPrev > 0 ? yPrev - 1 : 0;
          steps--;
          continue;
        }

        break;
      }

      scheduleSave();
      render();
      return;
    }

    // --------
    // PLUS (auto level-up)
    // --------
    if (isEnemyMax(e)) {
      e.cur = 0;
      scheduleSave();
      render();
      return;
    }

    let add = Number(delta || 0);
    if (!Number.isFinite(add) || add <= 0) return;

    while (add > 0 && !isEnemyMax(e)) {
      const y = getYForLevel(e, e.level);
      if (y <= 0) {
        e.cur = 0;
        break;
      }

      const cur = clampNum(Number(e.cur ?? 0), 0, y);
      const missing = y - cur;

      if (missing <= 0) {
        e.level = clampNum(Number(e.level ?? 0) + 1, 0, e.maxLevel);
        e.cur = 0;
        continue;
      }

      if (add < missing) {
        e.cur = cur + add;
        add = 0;
      } else {
        add -= missing;
        e.level = clampNum(Number(e.level ?? 0) + 1, 0, e.maxLevel);
        e.cur = 0;
      }
    }

    if (isEnemyMax(e)) e.cur = 0;

    scheduleSave();
    render();
  }

  function adjustLv(enemyId, delta, ev) {
    if (ev) ev.stopPropagation();
    if (FARM.readOnly) return;

    const e = getEnemyById(enemyId);
    if (!e) return;

    e.maxLevel = clampNum(e.maxLevel ?? 5, 0, 5);

    const oldLv = clampNum(Number(e.level ?? 0), 0, e.maxLevel);
    const newLv = clampNum(oldLv + delta, 0, e.maxLevel);

    if (oldLv === 0 && newLv === 0 && delta < 0) {
      e.level = 0;
      e.cur = 0;
    } else {
      e.level = newLv;

      const y = getYForLevel(e, e.level);
      if (y <= 0) e.cur = 0;
      else e.cur = clampNum(e.cur ?? 0, 0, y);
    }

    scheduleSave();
    render();
  }

  // -----------------------------
  // Modal control
  // -----------------------------
  function openEnemyLocationsModal(enemyId) {
    if (FARM.modal.open && FARM.modal.mode === "enemy_preview") {
      modalPushCurrent();
    } else {
      FARM.modal.stack = [];
    }

    FARM.modal.open = true;
    FARM.modal.mode = "enemy_locations";
    FARM.modal.enemyId = enemyId;
    FARM.modal.locationId = null;
    FARM.modal.kills = null;

    // ✅ FIX: reset category so it doesn't "carry over" from fast mode
    FARM.modal.category = null;

    render();
  }

  function _modalSnapshot() {
    return {
      open: true,
      mode: FARM.modal.mode,
      enemyId: FARM.modal.enemyId,
      locationId: FARM.modal.locationId,
      category: FARM.modal.category,
      kills: FARM.modal.kills,
      editLv: FARM.modal.editLv ?? null,
      editCur: FARM.modal.editCur ?? null,
    };
  }

  function _modalEnsureStack() {
    if (!Array.isArray(FARM.modal.stack)) FARM.modal.stack = [];
  }

  function modalPushCurrent() {
    if (!FARM.modal.open || !FARM.modal.mode) return;
    _modalEnsureStack();
    FARM.modal.stack.push(_modalSnapshot());
  }

  function modalBack() {
    _modalEnsureStack();
    if (!FARM.modal.stack.length) return;

    const st = FARM.modal.stack.pop();
    FARM.modal.open = true;
    FARM.modal.mode = st.mode;
    FARM.modal.enemyId = st.enemyId ?? null;
    FARM.modal.locationId = st.locationId ?? null;
    FARM.modal.category = st.category ?? null;
    FARM.modal.kills = st.kills ?? null;
    FARM.modal.editLv = st.editLv ?? null;
    FARM.modal.editCur = st.editCur ?? null;

    render();
  }

  function openLocationEnemiesModal(locationId) {
    // jeśli wchodzimy z Enemy -> Locations, chcemy BACK
    if (FARM.modal.open && FARM.modal.mode === "enemy_locations") {
      modalPushCurrent();
    } else {
      FARM.modal.stack = [];
    }

    FARM.modal.open = true;
    FARM.modal.mode = "location_enemies";
    FARM.modal.locationId = locationId;
    FARM.modal.enemyId = null;
    FARM.modal.kills = null;

    // ✅ reset category so it doesn't "carry over" from fast mode
    FARM.modal.category = null;

    render();
  }

  function closeModal() {
    FARM.modal.open = false;
    FARM.modal.mode = null;
    FARM.modal.enemyId = null;
    FARM.modal.locationId = null;
    FARM.modal.category = null;
    FARM.modal.kills = null;

    FARM.modal.editLv = null;
    FARM.modal.editCur = null;

    FARM.modal.stack = [];

    render();
  }

  function getLocationPreviewEnemyList() {
    const locId = String(FARM.modal.locationId || "");
    if (!locId) return [];

    // Zachowujemy to samo co w Location -> Enemies (NOT MAX)
    const enemies = getEnemiesForLocation(locId) || [];
    const map = new Map(enemies.map((e) => [String(e.id), e]));

    // sort jak FARM.enemies
    const ordered = [];
    for (const base of FARM.enemies) {
      const row = map.get(String(base.id));
      if (row) ordered.push(row);
    }
    for (const e of enemies) {
      if (!ordered.some((x) => String(x.id) === String(e.id))) ordered.push(e);
    }
    return ordered;
  }

  function locationStepEnemy(dir) {
    if (!FARM.modal.open || FARM.modal.mode !== "location_preview") return;

    const list = getLocationPreviewEnemyList();
    if (!list.length) return;

    let idx = list.findIndex((x) => String(x.id) === String(FARM.modal.enemyId));
    if (idx < 0) idx = 0;

    const next = (idx + dir + list.length) % list.length;
    const e = list[next];

    FARM.modal.enemyId = e.id;
    FARM.modal.kills = Number(e.kills ?? 0);

    const locId = String(FARM.modal.locationId || "");
    const rel = locId ? getRel(e.id, locId) : null;
    FARM.modal.activeEnemyId = String((rel ? rel.activeEnemyId : "") || "");

    render();
  }

  function enemyLocationsStepEnemy(dir) {
    if (!FARM.modal.open || FARM.modal.mode !== "enemy_locations") return;

    const list = FARM.enemies || [];
    if (!list.length) return;

    let idx = list.findIndex((x) => String(x.id) === String(FARM.modal.enemyId));
    if (idx < 0) idx = 0;

    const next = (idx + dir + list.length) % list.length;
    const e = list[next];

    FARM.modal.enemyId = e.id;
    FARM.modal.locationId = null;
    FARM.modal.kills = null;

    // trzymamy to wyczyszczone, żeby nie mieszać z Fast
    FARM.modal.category = null;

    render();
  }

  function openLocationEnemyPreviewModal(enemyId, kills) {
    // otwarte z location_enemies -> chcemy mieć BACK
    if (FARM.modal.open && FARM.modal.mode === "location_enemies") {
      modalPushCurrent();
    } else {
      FARM.modal.stack = [];
    }

    FARM.modal.open = true;
    FARM.modal.mode = "location_preview";
    FARM.modal.enemyId = enemyId;
    FARM.modal.kills = Number(kills ?? 0);

    // ✅ NEW: active enemy (for Gate)
    const locId = String(FARM.modal.locationId || "");
    const rel = locId ? getRel(enemyId, locId) : null;
    FARM.modal.activeEnemyId = String((rel ? rel.activeEnemyId : "") || "");

    // locationId już jest ustawione przez location_enemies
    render();
  }

  // -----------------------------
  // Fast preview navigation helpers
  // -----------------------------
  function _getFastPreviewNavContext() {
    // When enemy_preview is opened from fast_category we keep category + locationId
    // so we can switch between enemies with ← / →.
    const cat = String(FARM.modal.category || "");
    if (!cat) return { cat: "", locationId: "" };

    const locId =
      String(FARM.modal.locationId || "") ||
      String(FARM.fastSelectedLocation?.[cat] || "");

    return { cat, locationId: locId };
  }

  function getFastPreviewEnemyList() {
    const ctx = _getFastPreviewNavContext();
    if (!ctx.locationId) return [];

    // Keep the same ordering as FARM.enemies (so it feels consistent)
    const enemies = getEnemiesForLocationFast(ctx.locationId) || [];
    const map = new Map(enemies.map((e) => [String(e.id), e]));

    const ordered = [];
    for (const base of FARM.enemies) {
      const row = map.get(String(base.id));
      if (row) ordered.push(row);
    }

    // Fallback: if something is missing from ordering, append leftovers
    for (const e of enemies) {
      if (!ordered.some((x) => String(x.id) === String(e.id))) ordered.push(e);
    }

    return ordered;
  }

  function fastStepEnemy(dir) {
    if (!FARM.modal.open || FARM.modal.mode !== "enemy_preview") return;

    const list = getFastPreviewEnemyList();
    if (!list.length) return;

    let idx = list.findIndex((x) => String(x.id) === String(FARM.modal.enemyId));
    if (idx < 0) idx = 0;

    const next = (idx + dir + list.length) % list.length;
    const e = list[next];

    FARM.modal.enemyId = e.id;
    FARM.modal.kills = Number(e.kills ?? 0);

    const locId = String(FARM.modal.locationId || "");
    const rel = locId ? getRel(e.id, locId) : null;
    FARM.modal.activeEnemyId = String((rel ? rel.activeEnemyId : "") || "");

    render();
  }

  function openEnemyPreviewModal(enemyId, kills, locationIdOverride = "", activeEnemyIdOverride = "") {
    // When opened from fast_category, keep stack so ESC/outside click returns back.
    if (FARM.modal.open && FARM.modal.mode === "fast_category") {
      modalPushCurrent();
    }

    const cat = String(FARM.modal.category || "");
    const locId =
      String(locationIdOverride || "") ||
      (cat ? String(FARM.fastSelectedLocation?.[cat] || "") : "");

    FARM.modal.open = true;
    FARM.modal.mode = "enemy_preview";
    FARM.modal.enemyId = enemyId;
    FARM.modal.kills = Number(kills ?? 0);

    // ✅ Keep context for enemy navigation
    FARM.modal.category = cat || null;
    FARM.modal.locationId = locId || null;

    // ✅ NEW: active enemy for Gate (optional)
    const rel = locId ? getRel(enemyId, locId) : null;
    FARM.modal.activeEnemyId = String(activeEnemyIdOverride || (rel ? rel.activeEnemyId : "") || "");

    render();
  }

  function _parseCurInput(raw) {
    const s = String(raw ?? "").trim();
    if (!s) return 0;
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  }

  function openKillsEditModal(enemyId, ev, secondaryEnemyId = "") {
    if (ev) ev.stopPropagation();
    if (FARM.readOnly) return;

    // ✅ jeśli jesteśmy w jakimkolwiek modalu, zapamiętaj stan żeby "Close / ESC / klik poza" wracał
    if (FARM.modal.open && FARM.modal.mode) {
      modalPushCurrent();
    } else {
      FARM.modal.stack = [];
    }

    const enemy = getEnemyById(enemyId);
    if (!enemy) return;

    ensureEnemyShape(enemy);

    FARM.modal.open = true;
    FARM.modal.mode = "edit_kills";
    FARM.modal.enemyId = enemyId;
    FARM.modal.secondaryEnemyId = String(secondaryEnemyId || "");

    FARM.modal.editLv = Number(enemy.level ?? 0);

    const maxed = isEnemyMax(enemy);
    FARM.modal.editCur = maxed ? "" : String(Number(enemy.cur ?? 0));

    render();
  }


  function saveKillsEditModal() {
    if (FARM.readOnly) return;

    const primary = getEnemyById(FARM.modal.enemyId);
    if (!primary) return;

    const secondaryId = String(FARM.modal.secondaryEnemyId || "");
    const secondary = secondaryId ? getEnemyById(secondaryId) : null;

    const apply = (enemy) => {
      ensureEnemyShape(enemy);

      const maxLevel = clampNum(enemy.maxLevel ?? 5, 0, 5);
      let lv = clampNum(Number(FARM.modal.editLv ?? 0), 0, maxLevel);
      enemy.level = lv;

      if (enemy.level >= maxLevel) {
        enemy.level = maxLevel;
        enemy.cur = 0;
        return;
      }

      const y = getYForLevel(enemy, enemy.level);
      const rawCur = _parseCurInput(FARM.modal.editCur);
      const cur = clampNum(rawCur, 0, y > 0 ? y : 0);

      enemy.cur = y > 0 ? cur : 0;
    };

    apply(primary);
    if (secondary) apply(secondary);

    scheduleSave(true);
    closeModal();
  }

  function jumpToEnemy(enemyId) {
    FARM.subtab = "commissions";
    render();

    requestAnimationFrame(() => {
      const elCard = document.getElementById(`enemy_card_${enemyId}`);
      if (!elCard) return;

      elCard.scrollIntoView({ behavior: "smooth", block: "center" });

      ensurePulseCSS();
      elCard.classList.remove("sc_pulse_border");
      void elCard.offsetWidth;
      elCard.classList.add("sc_pulse_border");

      clearTimeout(elCard.__scPulseTimer);
      elCard.__scPulseTimer = setTimeout(() => {
        elCard.classList.remove("sc_pulse_border");
      }, 2600);
    });
  }

  // -----------------------------
  // UI helpers
  // -----------------------------
  function ensurePulseCSS() {
    if (document.getElementById("sc_pulse_style")) return;

    const style = document.createElement("style");
    style.id = "sc_pulse_style";
    style.textContent = `
      @keyframes scPulseBorder {
        0%   { box-shadow: 0 0 0 0 rgba(255, 220, 40, 0.0); outline-color: rgba(255, 220, 40, 0.0); }
        20%  { box-shadow: 0 0 0 4px rgba(255, 220, 40, 0.85); outline-color: rgba(255, 220, 40, 0.95); }
        55%  { box-shadow: 0 0 0 14px rgba(255, 220, 40, 0.35); outline-color: rgba(255, 220, 40, 0.55); }
        100% { box-shadow: 0 0 0 0 rgba(255, 220, 40, 0.0); outline-color: rgba(255, 220, 40, 0.0); }
      }
      .sc_pulse_border {
        outline: 2px solid rgba(255, 220, 40, 0.0);
        outline-offset: 2px;
        animation: scPulseBorder 1.2s ease-out 0s 2;
      }
    `;
    document.head.appendChild(style);
  }

  function ensureAccordionCSS() {
    if (document.getElementById("sc_accordion_style")) return;
    const style = document.createElement("style");
    style.id = "sc_accordion_style";
    style.textContent = `
      @keyframes fadeIn { from { opacity: 0; transform: translateY(-2px); } to { opacity: 1; transform: translateY(0); } }
    `;
    document.head.appendChild(style);
  }

  // -----------------------------
// UI helpers shared with other modules
// -----------------------------
function _btnClass(active, extra = "") {
  try {
    if (typeof window.btnClass === "function") return window.btnClass(active, extra);
  } catch {}
  const base =
    "h-10 min-h-[44px] px-4 py-2 rounded-xl border font-semibold transition " +
    "text-[clamp(14px,3.2vw,18px)] " +
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400/50 " +
    "disabled:opacity-50 disabled:cursor-not-allowed ";
  const state = active
    ? "bg-yellow-400 text-black shadow border-yellow-300"
    : "bg-glass text-slate-200 hover:bg-slate-900/10 hover:text-white border-slate-700/60";
  return (base + state + " " + (extra || "")).trim();
}

function _chipClass(active, extra = "") {
  const base =
    "h-9 px-3 rounded-xl border font-semibold transition text-sm " +
    "min-w-0 truncate " +
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400/50 " +
    "disabled:opacity-50 disabled:cursor-not-allowed ";
  const state = active
    ? "bg-yellow-400 text-black shadow border-yellow-300"
    : "bg-glass text-slate-200 hover:bg-slate-900/10 hover:text-white border-slate-700/60";
  return (base + state + " " + (extra || "")).trim();
}

function pill(text, active, onClick, extraClass = "") {
  return _el(
    "button",
    {
      type: "button",
      class: _chipClass(!!active, extraClass),
      onclick: onClick,
    },
    text
  );
}

function pillPrimaryBtn(text, onClick, opts = {}) {
  const disabled = !!(opts && opts.disabled);

  return _el(
    "button",
    {
      type: "button",
      class: _btnClass(true, "") + (disabled ? " opacity-50 cursor-not-allowed pointer-events-none" : ""),
      onclick: disabled ? undefined : onClick,
      disabled: disabled || undefined,
    },
    text
  );
}

function label(text) {
  return _el("div", { class: "text-xs font-semibold text-slate-100" }, text);
}

function inputText(value, onInput, placeholder = "", id = "", opts = {}) {
    const disabled = !!(opts && opts.disabled);
    const baseClass = "w-full px-3 py-2 rounded-xl border border-slate-700 bg-slate-900 text-slate-100 text-sm";
    return _el("input", {
      id: id || undefined,
      class: baseClass + (disabled ? " opacity-60 cursor-not-allowed bg-[rgb(24_34_52)] text-slate-100" : ""),
      value: value ?? "",
      placeholder,
      disabled: disabled || undefined,
      oninput: disabled ? undefined : (e) => onInput(e.target.value),
    });
  }

  function inputNumber(value, onInput, min = 0, max = 999999, id = "", opts = {}) {
    const disabled = !!(opts && opts.disabled);
    const baseClass = "w-full px-3 py-2 rounded-xl border border-slate-700 bg-slate-900 text-slate-100 text-sm";
    return _el("input", {
      id: id || undefined,
      type: "number",
      min: String(min),
      max: String(max),
      class: baseClass + (disabled ? " opacity-60 cursor-not-allowed bg-[rgb(24_34_52)] text-slate-100" : ""),
      value: String(value ?? 0),
      disabled: disabled || undefined,
      oninput: disabled ? undefined : (e) => onInput(Number(e.target.value)),
    });
  }

  function selectBox(value, options, onChange, opts = {}) {
    const sel = document.createElement("select");
    const disabled = !!(opts && opts.disabled);

    sel.className =
      "w-full px-3 py-2 rounded-xl border border-slate-700 bg-slate-900 text-slate-100 text-sm" +
      (disabled ? " opacity-60 cursor-not-allowed bg-[rgb(24_34_52)] text-slate-100" : "");

    sel.disabled = disabled;

    const optsArr = Array.isArray(options) ? options : [];
    for (const opt of optsArr) {
      const o = document.createElement("option");
      o.value = String(opt.value);
      o.textContent = String(opt.label);
      if (opt.disabled) o.disabled = true;
      sel.appendChild(o);
    }

    sel.value = String(value ?? "");

    if (!sel.value || sel.value !== String(value ?? "")) {
      const first = optsArr.find((x) => !x.disabled);
      if (first) sel.value = String(first.value);
    }

    if (!disabled) {
      sel.addEventListener("change", (e) => onChange(e.target.value));
    }

    return sel;
  }

  function btnSmall(text, onClick, kind = "default", opts = {}) {
  const disabled = !!(opts && opts.disabled);

  const base =
    "h-10 min-h-[44px] px-4 py-2 rounded-xl border font-semibold transition whitespace-nowrap " +
    "text-sm " +
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400/50 " +
    "disabled:opacity-50 disabled:cursor-not-allowed ";

  const cls =
    kind === "danger"
      ? base + "bg-red-600 text-white border-red-600 hover:bg-red-700"
      : kind === "primary"
      ? base + "bg-yellow-400 text-black shadow border-yellow-300 hover:bg-yellow-300"
      : base + "bg-glass text-slate-200 hover:bg-slate-900/10 hover:text-white border-slate-700/60";

  return _el(
    "button",
    {
      type: "button",
      class: cls + (disabled ? " opacity-50 cursor-not-allowed pointer-events-none" : ""),
      onclick: disabled ? undefined : onClick,
      disabled: disabled || undefined,
    },
    text
  );
}

  function adminCard(titleText, bodyNode) {
    return _el(
      "div",
      { class: "rounded-2xl border border-slate-200 dark:border-white/10 background:rgba(15,23,42,.18) dark:bg-glass p-4 shadow-sm" },
      _el("div", { class: "font-bold text-base flex items-center gap-2" }, titleText),
      _el("div", { class: "mt-3" }, bodyNode)
    );
  }

  // -----------------------------
  // Dropdown with category headers
  // -----------------------------
  function buildLocationOptionsWithHeaders(locs) {
    const out = [];
    for (const cat of LOCATION_CATEGORIES) {
      const rows = locs.filter((l) => l.category === cat);
      if (!rows.length) continue;

      out.push({ value: `__hdr_${cat}`, label: `• ${cat} •`, disabled: true });
      for (const l of rows) out.push({ value: l.id, label: l.name });
    }
    return out;
  }

  // -----------------------------
  // Edit buttons under image
  // -----------------------------
  function editBtn(labelText, onClick) {
    return _el(
      "button",
      {
        onclick: onClick,
        style:
          `cursor:pointer; user-select:none; box-sizing:border-box;` +
          `border:1px solid ${THEME.outerBorder};` +
          `background:#0b1220;` +
          `color:#ffffff;` +
          `font-weight:900;` +
          `font-size:12px;` +
          `padding:6px 8px;` +
          `height:34px;` +
          `width:100%;` +
          `min-width:0;` +
          `display:flex; align-items:center; justify-content:center;` +
          `border-radius:0px;` +
          `line-height:1;` +
          `text-shadow:${textStroke(THEME.stroke, 2)};` +
          `flex:1 1 0;` +
          `white-space:nowrap;`,
      },
      labelText
    );
  }

  function editControlsUnderImage(enemyId) {
    if (FARM.readOnly) return null;
    return _el(
      "div",
      {
        onclick: (ev) => ev.stopPropagation(),
        style:
          `display:grid; grid-template-columns:1fr 1fr; gap:6px; width:100%; margin-top:8px;` +
          `grid-auto-rows:34px;` +
          `box-sizing:border-box;`,

      },

      // row 1: minus
      _el("div", { style: "grid-column:1;" }, editBtn("Lv -", (ev) => adjustLv(enemyId, -1, ev))),
      _el("div", { style: "grid-column:2;" }, editBtn("-", (ev) => adjustCur(enemyId, -1, ev))),

      // row 2: set (full width)
      _el(
        "div",
        { style: "grid-column:1 / 3;" },
        editBtn("Set", (ev) => openKillsEditModal(enemyId, ev))
      ),

      // row 3: plus
      _el("div", { style: "grid-column:1;" }, editBtn("+", (ev) => adjustCur(enemyId, +1, ev))),
      _el("div", { style: "grid-column:2;" }, editBtn("Lv +", (ev) => adjustLv(enemyId, +1, ev)))
    );
  }

  // -----------------------------
  // ENEMY CARD
  // -----------------------------
  function enemyCard(enemy) {
    enemy = ensureEnemyShape(enemy);

    const lv = Number(enemy.level ?? 0);
    const cur = Number(enemy.cur ?? 0);

    const maxed = isEnemyMax(enemy);
    const maxY = maxed ? 0 : getYForLevel(enemy, lv);
    const pct = maxed ? 1 : (maxY > 0 ? Math.max(0, Math.min(1, cur / maxY)) : 0);

    const { line1, line2 } = splitNameTwoLines(enemy.name);
    const nameFontPx = computeNameFontPx(line1, line2);

    return _el(
      "div",
      {
        id: `enemy_card_${enemy.id}`,
        class: "select-none cursor-pointer overflow-hidden shadow-sm hover:shadow-md transition",
        style:
          `box-sizing:border-box;` +
          `background:${THEME.outerBg};` +
          `border:1px solid ${THEME.outerBorder};` +
          `border-radius:0px;` +
          `padding:10px 0 0 0;` +
          `display:flex; flex-direction:column;` +
          `gap:10px;`,
        onclick: () => openEnemyLocationsModal(enemy.id),
      },

      _el(
        "div",
        {
          style: `height:44px; display:flex; align-items:center; justify-content:center; text-align:center; padding:0; width:100%;`,
          title: enemy.name,
        },
        _el(
          "div",
          {
            style:
              `color:${THEME.name}; font-size:${nameFontPx}px; line-height:1.10; font-weight:900;` +
              `text-shadow:${textStroke(THEME.stroke, 2)}; width:100%; max-width:100%;`,
          },
          _el("div", { style: "white-space:nowrap; overflow:hidden; text-overflow:ellipsis; width:100%;" }, line1),
          line2 ? _el("div", { style: "white-space:nowrap; overflow:hidden; text-overflow:ellipsis; width:100%;" }, line2) : null
        )
      ),

      _el(
        "div",
        { style: "padding:0 10px 10px 10px;" },

        _el(
          "div",
          {
            class: "relative w-full",
            style:
              `position:relative; box-sizing:border-box;` +
              `border:1px solid ${THEME.outerBorder}; border-radius:0px;` +
              `background:#0b1220; aspect-ratio:1/1; overflow:hidden;`,
          },

          _el("div", {
            class: "absolute inset-0",
            style:
              `background-image:url("${GLOBAL_ENEMY_BG_URL}");` +
              `background-size:cover; background-position:center; background-repeat:no-repeat; opacity:1;`,
          }),

          enemy.iconUrl
            ? _el("img", {
                src: enemy.iconUrl,
                alt: enemy.name,
                style: `position:absolute; inset:0; width:100%; height:100%; object-fit:contain; display:block;`,
              })
            : _el(
                "div",
                { style: "position:absolute; inset:0; display:flex; align-items:center; justify-content:center; color:#94a3b8; font-size:12px;" },
                "no img"
              ),

          _el("div", {
            class: "absolute left-0 right-0 bottom-0",
            style: "height:56px; background:linear-gradient(to top, rgba(0,0,0,0.70), rgba(0,0,0,0));",
          }),

          _el(
            "div",
            {
              class: "absolute left-2",
              style: `bottom:26px; color:${THEME.lv}; font-size:14px; font-weight:900; text-shadow:${textStroke(THEME.stroke, 2)};`,
            },
            `Lv. ${lv}`
          ),

          _el(
            "div",
            {
              class: "absolute right-2",
              style: `bottom:26px; color:${THEME.ratio}; font-size:16px; font-weight:900; text-shadow:${textStroke(THEME.stroke, 2)};`,
            },
            maxed ? "MAX" : `${cur}/${maxY}`
          ),

          _el(
            "div",
            {
              class: "absolute left-2 right-2",
              style:
                `bottom:8px; height:9px; border:1px solid ${THEME.outerBorder};` +
                `background:${THEME.barEmpty}; border-radius:0px; overflow:hidden;`,
            },
            _el("div", { style: `height:100%; width:${(pct * 100).toFixed(1)}%; background:${THEME.barFill};` })
          )
        ),

        FARM.editMode ? editControlsUnderImage(enemy.id) : null
      )
    );
  }

  // -----------------------------
  // Tabs content
  // -----------------------------
  function renderCommissionsTab() {
    const grid = _el("div", { class: "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7 gap-3" });
    for (const e of FARM.enemies) grid.append(enemyCard(e));
    return _el("div", { class: "space-y-3" }, grid);
  }

  function renderFastTab() {
    const grid = _el("div", { class: "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3" });

    for (const cat of LOCATION_CATEGORIES) {
      const available = getFastAvailableLocationsByCategory(cat);
      const stats = getFastCategoryStats(cat);

      grid.append(
        _el(
          "button",
          {
            class:
              "w-full text-left rounded-2xl border border-slate-700 " +
              "bg-slate-900 dark:bg-slate-800 p-4 shadow-sm hover:shadow-md transition",
            onclick: () => openFastCategoryModal(cat),
          },
          _el("div", { class: "font-extrabold text-lg" }, displayCategoryName(cat)),
          _el(
            "div",
            { class: "mt-1 text-xs text-slate-100" },
            available.length
              ? `${available.length} locations • ${stats.uniqueEnemies} enemies (${FARM.fastIncludeMax ? "ALL" : "NOT MAX"})`
              : (FARM.fastIncludeMax ? "No enemies" : "No NOT MAX enemies")
          ),
          _el(
            "div",
            { class: "mt-3 text-sm font-bold text-white" },
            available.length ? "Open ▸" : "—"
          )
        )
      );
    }

    return _el("div", { class: "space-y-3" }, grid);
  }

  // -----------------------------
  // ADMIN helpers
  // -----------------------------
  function moveEnemy(index, dir) {
    if (FARM.readOnly) return;
    const i = index;
    const j = index + dir;
    if (j < 0 || j >= FARM.enemies.length) return;
    const arr = FARM.enemies;
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
    scheduleSave();
    render();
  }

  function deleteEnemy(enemyId) {
    if (FARM.readOnly) return;
    FARM.enemies = FARM.enemies.filter((e) => String(e.id) !== String(enemyId));
    FARM.rel = FARM.rel.filter((r) => String(r.enemyId) !== String(enemyId));
    scheduleSave();
    render();
  }

  function addEnemy() {
    if (FARM.readOnly) return;
    const __id = uid("enemy");
    FARM.enemies.push(
      ensureEnemyShape({
        id: __id,
        name: "New Enemy",
        level: 0,
        maxLevel: 5,
        levelMax: { ...DEFAULT_LEVEL_MAX },
        cur: 0,
        iconUrl: "",
      })
    );
    if (FARM.adminEnemyEdit) FARM.adminEnemyEdit[String(__id)] = true;
    scheduleSave();
    render();
  }

  function deleteLocation(locationId) {
    if (FARM.readOnly) return;
    FARM.locations = FARM.locations.filter((l) => String(l.id) !== String(locationId));
    FARM.rel = FARM.rel.filter((r) => String(r.locationId) !== String(locationId));
    scheduleSave();
    render();
  }

  function addLocation(category, name) {
    if (FARM.readOnly) return;
    const n = String(name || "").trim();
    if (!n) return;
    FARM.locations.push({
      id: uid("loc"),
      category: LOCATION_CATEGORIES.includes(category) ? category : "Other",
      name: normalizeLocationNameForCategory(LOCATION_CATEGORIES.includes(category) ? category : "Other", n),
    });
    cleanupAndEnsureSpecialCommissionLocations();
    scheduleSave();
    render();
  }

  // ✅ FIXED reorder within same category
  function moveLocationWithinCategory(locationId, dir) {
    if (FARM.readOnly) return;
    const i = FARM.locations.findIndex((l) => String(l.id) === String(locationId));
    if (i < 0) return;

    const cat = FARM.locations[i].category;

    if (dir < 0) {
      for (let j = i - 1; j >= 0; j--) {
        if (FARM.locations[j].category === cat) {
          const tmp = FARM.locations[i];
          FARM.locations[i] = FARM.locations[j];
          FARM.locations[j] = tmp;
          scheduleSave();
          return render();
        }
      }
    } else {
      for (let j = i + 1; j < FARM.locations.length; j++) {
        if (FARM.locations[j].category === cat) {
          const tmp = FARM.locations[i];
          FARM.locations[i] = FARM.locations[j];
          FARM.locations[j] = tmp;
          scheduleSave();
          return render();
        }
      }
    }
  }

  function renderIconPreview(url) {
    const u = String(url || "").trim();
    if (!u) {
      return _el(
        "div",
        {
          class:
            "w-10 h-10 rounded-xl border border-slate-700 bg-[rgb(24_34_52)] dark:bg-slate-900 flex items-center justify-center text-[10px] text-slate-400",
        },
        "no"
      );
    }
    return _el(
      "div",
      { class: "w-10 h-10 rounded-xl border border-slate-700 overflow-hidden bg-[rgb(24_34_52)] dark:bg-slate-900" },
      _el("img", { src: u, alt: "icon", class: "w-full h-full object-cover" })
    );
  }

  function renderEnemyIconCard(enemy) {
    const u = String(enemy?.iconUrl || "").trim();

    return _el(
      "div",
      {
        style:
          "width:100%; max-width:240px;" +
          "border:1px solid #e2e8f0; border-radius:16px;" +
          "background:#0b1220; overflow:hidden;",
        class: "dark:border-slate-700",
      },
      _el(
        "div",
        {
          style:
            `position:relative; width:100%; aspect-ratio:1/1;` +
            `background:#0b1220; overflow:hidden;`,
        },
        _el("div", {
          style:
            `position:absolute; inset:0;` +
            `background-image:url("${GLOBAL_ENEMY_BG_URL}");` +
            `background-size:cover; background-position:center; background-repeat:no-repeat;`,
        }),
        u
          ? _el("img", {
              src: u,
              alt: enemy?.name || "enemy",
              style:
                "position:absolute; inset:0; width:100%; height:100%; object-fit:contain; display:block;",
            })
          : _el(
              "div",
              {
                style:
                  "position:absolute; inset:0; display:flex; align-items:center; justify-content:center;" +
                  "color:#94a3b8; font-size:12px;",
              },
              "no img"
            )
      )
    );
  }

  function renderMaxLevelEditor(enemy, enabled = true) {
    const currentMax = clampNum(enemy.maxLevel ?? 5, 0, 5);

    const maxLevelSelect = selectBox(
      currentMax,
      [0, 1, 2, 3, 4, 5].map((n) => ({ value: n, label: String(n) })),
      (v) => {
        enemy.maxLevel = clampNum(Number(v), 0, 5);
        if (enemy.level > enemy.maxLevel) enemy.level = enemy.maxLevel;

        const y = getYForLevel(enemy, enemy.level);
        if (y <= 0) enemy.cur = 0;
        else enemy.cur = clampNum(enemy.cur ?? 0, 0, y);

        scheduleSave();
        render();
      }
      , { disabled: !enabled }
    );

    const rows = _el("div", { class: "space-y-2" });

    const maxToShow = clampNum(enemy.maxLevel ?? 5, 0, 5);
    const lastReqInternalLevel = Math.min(maxToShow - 1, 4);

    for (let lvl = 0; lvl <= lastReqInternalLevel; lvl++) {
      rows.append(
        _el(
          "div",
          { class: "grid grid-cols-[90px_1fr] items-center gap-2" },
          _el("div", { class: "text-sm font-semibold" }, `Level ${lvl + 1}`),
          inputNumber(
            enemy.levelMax?.[lvl] ?? 0,
            (val) => {
              enemy.levelMax[lvl] = clampNum(val, 0, 999999);

              if (Number(enemy.level) === lvl) {
                const y = getYForLevel(enemy, enemy.level);
                if (y <= 0) enemy.cur = 0;
                else enemy.cur = clampNum(enemy.cur ?? 0, 0, y);
              }
              scheduleSave();
              render();
            },
            0,
            999999,
            "",
            { disabled: !enabled }
          )
        )
      );
    }

    return _el(
      "div",
      { class: "space-y-2" },
      label("Max Level (0-5)"),
      maxLevelSelect,
      _el("div", { class: "pt-2" }, label("Max kills (Y) per Level"), rows)
    );
  }

  function renderRelEditor(enemy, enabled = true) {
    const enemyId = String(enemy.id);
    const unassigned = getUnassignedLocationsForEnemy(enemyId);
    const assigned = getAssignedForEnemy(enemyId);

    if (!FARM.adminAddRel[enemyId]) {
      FARM.adminAddRel[enemyId] = {
        locationId: unassigned[0]?.id ?? "",
        kills: 1,
        activeEnemyId: "",
      };
    } else {
      const curSel = FARM.adminAddRel[enemyId].locationId;
      if (curSel && !unassigned.some((l) => String(l.id) === String(curSel))) {
        FARM.adminAddRel[enemyId].locationId = unassigned[0]?.id ?? "";
      }
    }

    const temp = FARM.adminAddRel[enemyId];

    const _selLoc = temp.locationId ? getLocationById(temp.locationId) : null;
    const _isPairSel = !!(_selLoc && supportsActiveEnemy(_selLoc));
    if (!_isPairSel) temp.activeEnemyId = "";

    const addRow =
      unassigned.length === 0
        ? _el("div", { class: "text-sm text-slate-100" }, "All locations are already assigned.")
        : _el(
            "div",
            { class: "grid grid-cols-1 md:grid-cols-[1fr_120px_auto] gap-2 items-end" },
            _el(
              "div",
              { class: "space-y-1" },
              label("Add location"),
              selectBox(
                temp.locationId,
                buildLocationOptionsWithHeaders(unassigned),
                (v) => {
                  temp.locationId = v;
                  // reset active enemy if not Gate
                  const loc = v ? getLocationById(v) : null;
                  if (!(loc && supportsActiveEnemy(loc))) temp.activeEnemyId = "";
                  render();
                },
                { disabled: !enabled }
              ),
              _isPairSel
                ? _el(
                    "div",
                    { class: "space-y-1 pt-2" },
                    label("Enemy (optional)"),
                    selectBox(
                      temp.activeEnemyId,
                      [{ value: "", label: "Nothing" }].concat(
                        FARM.enemies.map((en) => ({ value: en.id, label: displayEnemyName(en.name) }))
                      ),
                      (v) => {
                        temp.activeEnemyId = v;
                        render();
                      },
                      { disabled: !enabled }
                    )
                  )
                : null
            ),
            _el("div", { class: "space-y-1" }, label("Kills"), inputNumber(temp.kills, (v) => { temp.kills = clampNum(v, 1, 99); }, 1, 99, "", { disabled: !enabled })),
            pillPrimaryBtn("Add", () => {
              if (!temp.locationId) return;
              const _loc = temp.locationId ? getLocationById(temp.locationId) : null;
              const _a = _loc && supportsActiveEnemy(_loc) ? String(temp.activeEnemyId || "") : "";
              upsertRel(enemyId, temp.locationId, temp.kills, _a);
              const left = getUnassignedLocationsForEnemy(enemyId);
              temp.locationId = left[0]?.id ?? "";
              temp.kills = 1;
              temp.activeEnemyId = "";
              scheduleSave();
              render();
            }, { disabled: !enabled })
          );

    const assignedList = _el("div", { class: "space-y-2" });

    if (assigned.length === 0) {
      assignedList.append(_el("div", { class: "text-sm text-slate-100" }, "No assigned locations yet."));
    } else {
      for (const row of assigned) {
        const loc = row.loc;
        const isPair = supportsActiveEnemy(loc);

        const titleText = (() => {
          const base = `${loc.category} • ${loc.name}`;
          if (!isPair) return base;
          const aId = String(row.activeEnemyId || "");
          const a = aId ? getEnemyById(aId) : null;
          return a ? `${base} [${displayEnemyName(a.name)}]` : base;
        })();

        const titleEl = _el("div", { class: "text-sm font-semibold min-w-0 truncate" }, titleText);

        const pairSelectEl = isPair
          ? _el(
              "div",
              { class: "w-full sm:w-[220px]" },
              selectBox(
                String(row.activeEnemyId || ""),
                [{ value: "", label: "Nothing" }].concat(
                  FARM.enemies.map((en) => ({ value: en.id, label: displayEnemyName(en.name) }))
                ),
                (v) => {
                  upsertRel(enemyId, loc.id, row.kills, v);
                  scheduleSave();
                  render();
                },
                { disabled: !enabled }
              )
            )
          : null;

        // Mobile: 2 lines (title + optional Gate select), then Kills + Remove on next line.
        // Desktop: stays in a single row.
        const topRow = _el(
          "div",
          { class: "flex items-center gap-2 flex-wrap sm:flex-nowrap flex-1 min-w-0" },
          titleEl,
          pairSelectEl
        );

        const bottomRow = _el(
          "div",
          { class: "flex items-center gap-2 sm:ml-auto" },
          _el("div", { class: "text-xs text-slate-100" }, "Kills"),
          _el(
            "div",
            { class: "w-[110px] sm:w-[120px]" },
            inputNumber(
              row.kills,
              (v) => {
                upsertRel(enemyId, loc.id, v, row.activeEnemyId);
                scheduleSave();
                render();
              },
              1,
              99,
              "",
              { disabled: !enabled }
            )
          ),
          btnSmall(
            "Remove",
            () => {
              deleteRel(enemyId, loc.id);
              scheduleSave();
              render();
            },
            "danger",
            { disabled: !enabled }
          )
        );

        assignedList.append(
          _el(
            "div",
            {
              class:
                "flex flex-col gap-2 sm:flex-row sm:items-center border border-slate-700 rounded-xl px-3 py-2"
            },
            topRow,
            bottomRow
          )
        );
      }
    }

    return _el(
      "div",
      { class: "space-y-3" },
      _el("div", { class: "text-xs font-semibold text-slate-100" }, "Battle locations & kills"),
      addRow,
      assignedList
    );
  }

  function renderAdminCommissions() {
    const list = _el("div", { class: "space-y-3" });

    const q = String(FARM.adminEnemyQuery || "").trim().toLowerCase();
    const all = FARM.enemies.map((e) => ensureEnemyShape(e));

    // Keep original indices (needed for reorder buttons)
    const idxs = [];
    for (let i = 0; i < all.length; i++) {
      const name = String(all[i]?.name || "").toLowerCase();
      if (!q || name.includes(q)) idxs.push(i);
    }

    const recentOnly = !!FARM.adminEnemyRecentOnly;
    const limit = Math.max(1, Number(FARM.adminEnemyLimit || 20));
    const shownIdxs = recentOnly ? idxs.slice(-15) : idxs.slice(0, limit);

    for (const idx of shownIdxs) {
      const enemy = all[idx];
      const isEditing = !!(FARM.adminEnemyEdit && FARM.adminEnemyEdit[String(enemy.id)]);

      list.append(
        _el(
          "div",
          { class: "rounded-2xl border border-slate-700 bg-[rgb(24_34_52)]/70 dark:bg-slate-900/30 p-4 space-y-3" },

          _el(
            "div",
            { class: "flex items-start gap-2 flex-wrap" },
            _el("div", { class: "flex items-center gap-2" },
              btnSmall("↑", () => moveEnemy(idx, -1)),
              btnSmall("↓", () => moveEnemy(idx, +1))
            ),
            _el("div", { class: "font-bold min-w-0 truncate" }, enemy.name),
            _el("div", { class: "ml-auto flex items-center gap-2" },
              btnSmall(isEditing ? "Save" : "Edit", () => {
                if (FARM.readOnly) return;
                const k = String(enemy.id);
                FARM.adminEnemyEdit[k] = !isEditing;
                scheduleSave();
                render();
              }, "primary"),
              btnSmall("Delete", () => deleteEnemy(enemy.id), "danger")
            )
          ),

          _el("div", { class: "grid grid-cols-1 md:grid-cols-[0.7fr_1.3fr] gap-3" },
            _el(
              "div",
              { class: "space-y-1" },
              label("Name"),
              inputText(
                enemy.name,
                (v) => { enemy.name = v; scheduleSave(); render(); },
                "Enemy name",
                `enemy_name_${enemy.id}`,
                { disabled: !isEditing }
              )
            ),
            _el(
              "div",
              { class: "space-y-1" },
              label("Icon (local)"),
_el(
  "div",
  { class: "flex items-center gap-2" },
  renderIconPreview(scToLocalIconPath(enemy.iconUrl)),
  makeSCIconPicker(enemy.iconUrl, isEditing, (v) => { enemy.iconUrl = v; scheduleSave(); render(); })
)
          ),

          renderMaxLevelEditor(enemy, isEditing),
          renderRelEditor(enemy, isEditing)
        )
      ));
    }

    const topRow = _el(
      "div",
      { class: "flex items-center gap-2 flex-wrap" },
      pillPrimaryBtn("Add enemy", () => addEnemy()),
      pillPrimaryBtn("Normalize icons", () => scNormalizeAllEnemyIcons()),
      _el("div", { class: "flex-1 min-w-[220px]" },
        inputText(
          FARM.adminEnemyQuery,
          (v) => { FARM.adminEnemyQuery = v; FARM.adminEnemyLimit = 20; FARM.adminEnemyRecentOnly = false; render(); },
          "Search enemy...",
          "admin_enemy_search"
        )
      ),
      btnSmall("Last 15", () => { FARM.adminEnemyRecentOnly = true; render(); }, recentOnly ? "primary" : "default"),
      btnSmall("Show all", () => { FARM.adminEnemyRecentOnly = false; FARM.adminEnemyLimit = 99999; render(); }, "default")
    );

    const meta = _el(
      "div",
      { class: "text-xs text-slate-100" },
      `Showing ${shownIdxs.length}/${idxs.length} (total: ${all.length}). Reorder = ↑ / ↓, assign locations via dropdown (+kills).`
    );

    const more =
      !recentOnly && idxs.length > shownIdxs.length
        ? _el(
            "div",
            { class: "flex justify-center" },
            btnSmall(`Load more (+${Math.min(20, idxs.length - shownIdxs.length)})`, () => {
              FARM.adminEnemyRecentOnly = false;
              FARM.adminEnemyLimit = limit + 20;
              render();
            }, "primary")
          )
        : null;

    return _el("div", { class: "space-y-3" }, topRow, meta, list, more);
  }

  function renderAdminLocations() {
    const filterRow = _el(
      "div",
      { class: "bg-slate-900 dark:bg-slate-800 border border-slate-700 rounded-2xl p-2 shadow-sm" },
      _el(
        "div",
        { class: "flex gap-2 flex-wrap" },
        pill("All", FARM.adminLocationsFilter === "All", () => { FARM.adminLocationsFilter = "All"; render(); }),
        ...LOCATION_CATEGORIES.map((cat) =>
          pill(cat, FARM.adminLocationsFilter === cat, () => { FARM.adminLocationsFilter = cat; render(); })
        )
      )
    );

    const catsToShow = FARM.adminLocationsFilter === "All" ? LOCATION_CATEGORIES : [FARM.adminLocationsFilter];
    const cards = _el("div", { class: "space-y-3" });

    for (const cat of catsToShow) {
      const locs = FARM.locations.filter((l) => l.category === cat);

      const addBox = _el(
        "div",
        { class: "grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2 items-end" },
        _el("div", { class: "space-y-1" },
          label("Add new location"),
          inputText(FARM.adminAddLocationName[cat], (v) => { FARM.adminAddLocationName[cat] = v; }, "Name...", `loc_add_${cat}`)
        ),
        pillPrimaryBtn("Add", () => {
          const name = FARM.adminAddLocationName[cat];
          FARM.adminAddLocationName[cat] = "";
          addLocation(cat, name);
        })
      );

      const list = _el("div", { class: "space-y-2" });

      if (locs.length === 0) {
        list.append(_el("div", { class: "text-sm text-slate-100" }, "No locations yet."));
      } else {
        for (const loc of locs) {
          list.append(
            _el(
              "div",
              { class: "flex items-center gap-2 flex-wrap border border-slate-700 rounded-xl px-3 py-2" },

              _el("div", { class: "flex items-center gap-2" },
                btnSmall("↑", () => moveLocationWithinCategory(loc.id, -1)),
                btnSmall("↓", () => moveLocationWithinCategory(loc.id, +1))
              ),

              _el("div", { class: "text-sm font-semibold w-full md:w-auto md:min-w-[70px] text-slate-100" }, "Name"),

              _el("div", { class: "flex-1 min-w-[220px]" },
                inputText(
                  loc.name,
                  (v) => { loc.name = v; scheduleSave(); render(); },
                  "Location name",
                  `loc_name_${loc.id}`
                )
              ),

              _el("div", { class: "ml-auto" },
                btnSmall("Delete", () => deleteLocation(loc.id), "danger")
              )
            )
          );
        }
      }

      cards.append(
        adminCard(
          cat,
          _el("div", { class: "space-y-3" }, addBox, list)
        )
      );
    }

    return _el("div", { class: "space-y-3" }, filterRow, cards);
  }

  
  function renderAdminWeekly() {
    const root = _el("div", { class: "space-y-4" });

    root.append(
      _el(
        "div",
        { class: "text-xs text-slate-100" },
        "Pick weekly enemies for Unstable Dungeon and Mind Rift. Click again to unselect. Selected enemies will be highlighted with a red border in Fast Lv. Up."
      )
    );

    const section = (title, modeKey, locPredicate, max) => {
      const locs = FARM.locations.filter(locPredicate);

      const selected = new Set((FARM.weeklyOther?.[modeKey] || []).map(String));

      const header = _el(
        "div",
        { class: "flex items-center justify-between gap-2 flex-wrap" },
        _el("div", { class: "font-extrabold text-sm" }, title),
        _el(
          "div",
          { class: "text-xs text-slate-100 font-semibold" },
          `Selected: ${selected.size}/${max}`
        )
      );

      if (!locs.length) {
        return _el(
          "div",
          { class: "space-y-2" },
          header,
          _el("div", { class: "text-sm text-slate-100" }, `Location not found: ${title}.`)
        );
      }

      const enemyMap = new Map();
      for (const loc of locs) {
        for (const enemy of getEnemiesForLocationAll(loc.id)) {
          if (!enemyMap.has(String(enemy.id))) enemyMap.set(String(enemy.id), enemy);
        }
      }
      const enemies = Array.from(enemyMap.values()).sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));

      const grid =
        enemies.length === 0
          ? _el("div", { class: "text-sm text-slate-100" }, "No enemies assigned.")
          : _el(
              "div",
              { class: "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3" },
              ...enemies.map((e) => {
                const on = selected.has(String(e.id));
                return _el(
                  "button",
                  {
                    class:
                      "rounded-2xl border border-slate-700 bg-slate-900 dark:bg-slate-800 p-3 text-left flex flex-col " +
                      "hover:shadow-sm transition " +
                      (on ? "ring-2 ring-red-500 border-red-500" : ""),
                    style: on ? "border-color:#ef4444; border-width:2px;" : "",
                    onclick: () => {
                      toggleWeeklyOther(modeKey, e.id);
                      render();
                    },
                  },
                  _el(
                    "div",
                    {
                      class:
                        "w-full aspect-square rounded-xl bg-[rgb(24_34_52)] dark:bg-slate-900 border " +
                        "border-slate-700 overflow-hidden",
                      style: on ? "border-color:#ef4444; border-width:2px;" : "",
                    },
                    e.iconUrl ? _el("img", { src: e.iconUrl, class: "w-full h-full object-contain", alt: e.name }) : null
                  ),
                  _el("div", { class: "mt-2 text-sm font-bold truncate" }, displayEnemyName(e.name))
                );
              })
            );

      return _el("div", { class: "space-y-2" }, header, grid);
    };

    root.append(section(
      "Unstable Dungeon",
      "unstableDungeon",
      (l) => String(l.category) === "Other" && String(l.name || "").trim().toLowerCase() === "unstable dungeon",
      4
    ));
    root.append(section(
      "Mind Rift",
      "mindRift",
      (l) => String(l.category) === "Mind Rift",
      2
    ));

    return root;
  }

function renderAdminTab() {
    const topActions = _el(
      "div",
      { class: "flex items-center gap-2 flex-wrap" },
      btnSmall(FARM.saving ? "Saving..." : (FARM.dirty ? "Save now*" : "Save now"), () => saveNow({ silent: false }), "primary"),
      btnSmall("Reload", () => loadFromDB()),
      btnSmall("Export template", () => exportJSONFile({ templateOnly: true })),
      btnSmall("Export backup", () => exportJSONFile({ templateOnly: false })),
      btnSmall("Import (merge)", () => importJSONFile({ mode: "merge" })),
      btnSmall("Import (replace)", () => {
        const ok = window.confirm("To nadpisze dane i może zresetować progress. Na pewno?");
        if (ok) importJSONFile({ mode: "replace" });
      }),
      FARM.adminMsg ? _el("div", { class: "text-sm font-semibold text-white dark:text-slate-300 ml-2" }, FARM.adminMsg) : null
    );

    const adminTabs = _el(
      "div",
      { class: "bg-slate-900 dark:bg-slate-800 border border-slate-700 rounded-2xl p-2 shadow-sm" },
      _el(
        "div",
        { class: "flex gap-2 flex-wrap" },
        pill("Commissions", FARM.adminTab === "commissions", () => { FARM.adminTab = "commissions"; render(); }),
        pill("Weekly", FARM.adminTab === "weekly", () => { FARM.adminTab = "weekly"; render(); }),
        pill("Battle locations", FARM.adminTab === "locations", () => { FARM.adminTab = "locations"; render(); }),
        pill(
          `Fast: MAX ${FARM.fastIncludeMax ? "ON" : "OFF"}`,
          FARM.fastIncludeMax === true,
          () => {
            FARM.fastIncludeMax = !FARM.fastIncludeMax;
            render();
          }
        ),
      )
    );

    const body =
      FARM.adminTab === "commissions"
        ? adminCard("Admin • Commissions", _el("div", { class: "space-y-3" }, topActions, renderAdminCommissions()))
        : FARM.adminTab === "weekly"
        ? adminCard("Admin • Weekly", _el("div", { class: "space-y-3" }, topActions, renderAdminWeekly()))
        : adminCard("Admin • Battle locations", _el("div", { class: "space-y-3" }, topActions, renderAdminLocations()));

    return _el("div", { class: "space-y-3" }, adminTabs, body);
  }

  let __modalKeyListenerAdded = false;

  // -----------------------------
  // Collapsible categories (Enemy -> Locations modal)
  // -----------------------------
  function _getEnemyCatState(enemyId) {
    const id = String(enemyId || "");
    if (!FARM.collapsedCatsByEnemy) FARM.collapsedCatsByEnemy = {};
    if (!FARM.collapsedCatsByEnemy[id]) FARM.collapsedCatsByEnemy[id] = {};
    return FARM.collapsedCatsByEnemy[id];
  }

  function isCatCollapsed(enemyId, cat) {
    const st = _getEnemyCatState(enemyId);
    // default: collapsed
    if (st[cat] === undefined) return true;
    return !!st[cat];
  }

  function toggleCatCollapsed(enemyId, cat) {
    const st = _getEnemyCatState(enemyId);
    st[cat] = !isCatCollapsed(enemyId, cat);
    render();
  }

  function setAllCatsCollapsed(enemyId, collapsed = true) {
    const st = _getEnemyCatState(enemyId);
    for (const cat of LOCATION_CATEGORIES) st[cat] = !!collapsed;
    render();
  }

  function ensureEnemyCatsDefault(enemyId, grouped, { autoOpenFirst = false } = {}) {
    const st = _getEnemyCatState(enemyId);

    // init missing cats -> collapsed
    for (const cat of LOCATION_CATEGORIES) {
      if (st[cat] === undefined) st[cat] = true;
    }

    // optional: open first category that has entries
    if (autoOpenFirst) {
      for (const cat of LOCATION_CATEGORIES) {
        const entries = grouped?.get?.(cat);
        if (entries && entries.length) {
          st[cat] = false;
          break;
        }
      }
    }
  }

  function accordionHeader({ title, count, collapsed, onClick }) {
    return _el(
      "button",
      {
        class:
          "w-full flex items-center justify-between gap-2 rounded-xl border border-slate-700 " +
          "bg-[rgb(24_34_52)] dark:bg-slate-800 px-3 py-2 text-left hover:shadow-sm transition",
        onclick: onClick,
      },
      _el("div", { class: "font-extrabold text-sm min-w-0 truncate" }, title),
      _el(
        "div",
        { class: "flex items-center gap-2 shrink-0" },
        _el(
          "span",
          {
            class:
              "text-[11px] font-extrabold rounded-lg px-2 py-1 border border-slate-700 " +
              "bg-slate-900 text-slate-100",
          },
          String(count || 0)
        ),
        _el("span", { class: "text-sm font-black" }, collapsed ? "▸" : "▾")
      )
    );
  }

  // -----------------------------
  // Shared modal
  // -----------------------------
  function renderModal() {
    if (!FARM.modal.open) return null;

    // ✅ only if you added the optional fadeIn keyframes helper
    if (typeof ensureAccordionCSS === "function") ensureAccordionCSS();

    const isEnemyMode = FARM.modal.mode === "enemy_locations";
    const isLocMode = FARM.modal.mode === "location_enemies";
    const isFastMode = FARM.modal.mode === "fast_category";
    const isPreviewMode = FARM.modal.mode === "enemy_preview";
    const isKillsEditMode = FARM.modal.mode === "edit_kills";
    const isLocPreviewMode = FARM.modal.mode === "location_preview";

    let title = "Details";
    let subtitle = "";

    // ✅ NEW: footer (always visible, outside scroll)
    let footer = null;

    if (isEnemyMode) {
      const enemy = getEnemyById(FARM.modal.enemyId);
      title = enemy ? enemy.name : "Unknown enemy";
      subtitle = enemy
        ? (isEnemyMax(enemy)
            ? `Lv. ${enemy.maxLevel} (MAX) • Use ← / → to switch enemies`
            : `Lv. ${enemy.level} • Use ← / → to switch enemies`)
        : "";
    }
    if (isLocMode) {
      const loc = getLocationById(FARM.modal.locationId);
      title = loc ? loc.name : "Unknown location";
      subtitle = loc ? loc.category : "";
    }
    if (isFastMode) {
      title = FARM.modal.category ? `Fast Lv. Up • ${displayCategoryName(FARM.modal.category)}` : "Fast Lv. Up";
      subtitle = "Use ↑ / ↓ to switch locations";
    }
    if (isPreviewMode) {
      const enemy = getEnemyById(FARM.modal.enemyId);
      const activeId = String(FARM.modal.activeEnemyId || "");
      const active = activeId ? getEnemyById(activeId) : null;

      const __loc = getLocationById(FARM.modal.locationId);
      const useActive = supportsActiveEnemy(__loc || FARM.modal.category) && !!active;
      if (useActive && enemy) {
        title = `[${displayEnemyName(active.name)}] • ${displayEnemyName(enemy.name)}`;
      } else {
        title = useActive
          ? displayEnemyName(active.name)
          : enemy
          ? displayEnemyName(enemy.name)
          : "Enemy";
      }

      subtitle = `Drop: ${Number(FARM.modal.kills ?? 0)} • Use ← / → to switch enemies`;
    }
    if (isLocPreviewMode) {
      const enemy = getEnemyById(FARM.modal.enemyId);
      const activeId = String(FARM.modal.activeEnemyId || "");
      const active = activeId ? getEnemyById(activeId) : null;

      const __loc = getLocationById(FARM.modal.locationId);
      const useActive = supportsActiveEnemy(__loc || FARM.modal.category) && !!active;

      if (useActive && enemy) {
        title = `[${displayEnemyName(active.name)}] • ${displayEnemyName(enemy.name)}`;
      } else {
        title = enemy ? displayEnemyName(enemy.name) : "Enemy";
      }

      subtitle = `Drop: ${Number(FARM.modal.kills ?? 0)} • Use ← / → to switch enemies`;
    }

    if (isKillsEditMode) {
      const enemy = getEnemyById(FARM.modal.enemyId);
      title = enemy ? `Edit progress • ${enemy.name}` : "Edit progress";
      subtitle = "Set Lv. and current kills.";
    }

    let body = null;

    // Enemy -> Locations
    if (isEnemyMode) {
      const enemy = getEnemyById(FARM.modal.enemyId);
      if (!enemy) {
        body = _el("div", { class: "text-sm text-slate-100" }, "Unknown enemy.");
      } else {
        ensureEnemyShape(enemy);

        const lv = Number(enemy.level ?? 0);
        const maxed = isEnemyMax(enemy);
        const y = maxed ? 0 : getYForLevel(enemy, lv);
        const cur = maxed ? 0 : Number(enemy.cur ?? 0);
        const pct = maxed ? 1 : (y > 0 ? Math.max(0, Math.min(1, cur / y)) : 0);

        const grouped = getLocationsForEnemy(FARM.modal.enemyId);

        // Right side: locations list (collapsible by category)
        let right = null;
        if (!grouped || grouped.size === 0) {
          right = _el(
            "div",
            { class: "text-sm text-slate-100" },
            "Brak dostępnych lokacji dla tego przeciwnika"
          );
        } else {
          // init defaults (all collapsed). If you want auto-open first category with entries -> set true.
          ensureEnemyCatsDefault(enemy.id, grouped, { autoOpenFirst: false });

          const sections = [];

          // Optional toolbar row (expand/collapse all)
          sections.push(
            _el(
              "div",
              { class: "flex items-center gap-2 flex-wrap" },
              btnSmall("Expand all", () => setAllCatsCollapsed(enemy.id, false)),
              btnSmall("Collapse all", () => setAllCatsCollapsed(enemy.id, true))
            )
          );

          for (const cat of LOCATION_CATEGORIES) {
            const entries = grouped.get(cat);
            if (!entries || entries.length === 0) continue;

            const collapsed = isCatCollapsed(enemy.id, cat);

            const header = accordionHeader({
              title: cat,
              count: entries.length,
              collapsed,
              onClick: (ev) => {
                ev.preventDefault();
                toggleCatCollapsed(enemy.id, cat);
              },
            });

            const list = _el("div", { class: "space-y-2" });

            for (const e of entries) {
              list.append(
                _el(
                  "button",
                  {
                    class:
                      "w-full flex items-center justify-between gap-2 rounded-xl border border-slate-700 px-3 py-2 " +
                      "text-left hover:bg-[rgb(24_34_52)] dark:hover:bg-slate-800 transition",
                    onclick: () => openLocationEnemiesModal(e.id),
                  },
                  _el(
                    "div",
                    { class: "min-w-0" },
                    _el(
                      "div",
                      { class: "text-sm font-semibold truncate" },
                      (() => {
                        // Gate uses optional active enemy, but we also support it for "Other" Encore/Instance.
                        if (!supportsActiveEnemy(e)) return e.name;
                        const aId = String(e.activeEnemyId || "");
                        const a = aId ? getEnemyById(aId) : null;
                        return a ? `${e.name} [${displayEnemyName(a.name)}]` : e.name;
                      })()
                    )
                  ),
                  _el(
                    "div",
                    {
                      class:
                        "text-xs font-bold rounded-lg px-2 py-1 border border-slate-700 bg-[rgb(24_34_52)] dark:bg-slate-700/30",
                    },
                    `+${e.kills}`
                  )
                )
              );
            }

            sections.push(
              _el(
                "div",
                { class: "space-y-2" },
                header,
                collapsed
                  ? null
                  : _el(
                      "div",
                      {
                        class:
                          "pl-1 pr-1 pb-1 " +
                          "animate-[fadeIn_120ms_ease-out] " +
                          "motion-reduce:animate-none",
                      },
                      list
                    )
              )
            );
          }

          right = _el("div", { class: "space-y-3" }, ...sections);
        }

        const disableMinus = lv === 0 && cur === 0;
        const disablePlus = maxed;

        const miniBtn = (txt, onClick, disabled) => {
          if (FARM.readOnly) return null; // ✅ guest: nie pokazuj w ogóle
          const cls = _chipClass(false, "font-extrabold");
          return _el(
            "button",
            {
              type: "button",
              class: cls + (disabled ? " opacity-50 cursor-not-allowed pointer-events-none" : ""),
              disabled: !!disabled || undefined,
              onclick: disabled ? undefined : onClick,
            },
            txt
          );
        };

        // Bottom: progress + controls (same order as cards)
        const progressPanel = _el(
          "div",
          { class: "rounded-2xl border border-slate-700 bg-slate-900 dark:bg-slate-800 p-3 space-y-2" },

          _el(
            "div",
            { class: "flex items-center justify-between gap-2" },
            _el("div", { class: "font-extrabold" }, maxed ? `Lv. ${enemy.maxLevel}` : `Lv. ${lv}`),
            _el("div", { class: "text-sm font-extrabold" }, maxed ? "MAX" : `${cur}/${y}`)
          ),

          _el(
            "div",
            { class: "w-full h-3 rounded-xl border border-slate-700 bg-[rgb(24_34_52)] dark:bg-slate-900 overflow-hidden" },
            _el("div", { style: `height:100%; width:${(pct * 100).toFixed(1)}%; background:${THEME.barFill};` })
          ),

          _el(
            "div",
            { class: "flex justify-center gap-2 pt-1 flex-wrap" },
          
            miniBtn("Lv -", () => adjustLv(enemy.id, -1), disableMinus),
          
            miniBtn("-10", () => adjustCur(enemy.id, -10), disableMinus),
            miniBtn("-5", () => adjustCur(enemy.id, -5), disableMinus),
            miniBtn("-", () => adjustCur(enemy.id, -1), disableMinus),
          
            miniBtn("Set", () => openKillsEditModal(enemy.id), false),
          
            miniBtn("+", () => adjustCur(enemy.id, +1), disablePlus),
            miniBtn("+5", () => adjustCur(enemy.id, +5), disablePlus),
            miniBtn("+10", () => adjustCur(enemy.id, +10), disablePlus),
          
            miniBtn("Lv +", () => adjustLv(enemy.id, +1), disablePlus)
          )
        );

        // ✅ Prev/Next enemy navigation row + counter
        const navRow = (() => {
          const list = FARM.enemies || [];
          const disableNav = list.length < 2;

          const idx = list.findIndex((x) => String(x.id) === String(FARM.modal.enemyId));
          const counter = idx >= 0 ? `${idx + 1}/${list.length}` : `1/${list.length}`;

          return _el(
            "div",
            { class: "flex items-center justify-between gap-2 flex-wrap" },
            miniBtn("◀ Prev", () => enemyLocationsStepEnemy(-1), disableNav),
            _el("div", { class: "text-xs text-slate-100 font-semibold" }, counter),
            miniBtn("Next ▶", () => enemyLocationsStepEnemy(+1), disableNav)
          );
        })();

        footer = _el(
          "div",
          {
            class:
              "pt-3 border-t border-slate-700 bg-slate-900 text-slate-100",
          },
          navRow
        );

        body = _el(
          "div",
          { class: "space-y-3" },

          _el(
            "div",
            { class: "grid grid-cols-1 md:grid-cols-[260px_1fr] gap-4 items-start" },
            _el("div", { class: "flex md:block justify-center" }, renderEnemyIconCard(enemy)),
            _el("div", { class: "min-w-0" }, right)
          ),

          progressPanel
        );
      }
    }

    // Location -> Enemies (NOT MAX)
    if (isLocMode) {
      const enemies = getEnemiesForLocation(FARM.modal.locationId);
      if (!enemies || enemies.length === 0) {
        body = _el("div", { class: "text-sm text-slate-100" }, "Brak przeciwników do pokazania.");
      } else {
        const loc = getLocationById(FARM.modal.locationId);
        const isPairLoc = !!(loc && supportsActiveEnemy(loc));

        const grid = _el("div", { class: isPairLoc ? "grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3" : "grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2" });

        for (const e of enemies) {
          const active = isPairLoc && e.activeEnemy ? e.activeEnemy : null;
          const hasActive = isPairLoc && !!active;
          const primaryName = hasActive ? displayEnemyName(active.name) : e.name;

          const imgNode = hasActive
            ? _el(
                "div",
                {
                  class:
                    "w-full aspect-square rounded-lg bg-[rgb(24_34_52)] dark:bg-slate-900 border border-slate-700 overflow-hidden flex",
                },
                _el(
                  "div",
                  { class: "w-1/2 h-full border-r border-slate-700 bg-[rgb(24_34_52)] dark:bg-slate-900 overflow-hidden" },
                  active && active.iconUrl ? _el("img", { src: active.iconUrl, class: "w-full h-full object-cover", alt: primaryName }) : null
                ),
                _el(
                  "div",
                  { class: "w-1/2 h-full bg-[rgb(24_34_52)] dark:bg-slate-900 overflow-hidden" },
                  e.iconUrl ? _el("img", { src: e.iconUrl, class: "w-full h-full object-cover", alt: e.name }) : null
                )
              )
            : _el(
                "div",
                { class: "w-full aspect-square rounded-lg bg-[rgb(24_34_52)] dark:bg-slate-900 border border-slate-700 overflow-hidden" },
                e.iconUrl ? _el("img", { src: e.iconUrl, class: "w-full h-full object-cover", alt: e.name }) : null
              );

          const leftLv = hasActive
            ? (active ? (isEnemyMax(active) ? "MAX" : `Lv. ${active.level}`) : `Lv. ${e.level}`)
            : (isEnemyMax(e) ? "MAX" : `Lv. ${e.level}`);

          const rightInfo = hasActive
            ? (isEnemyMax(e) ? "MAX" : `Lv. ${e.level}`)
            : String(e.kills);
          grid.append(
            _el(
              "button",
              {
                class:
                  "rounded-xl border border-slate-700 bg-slate-900 dark:bg-slate-800 p-2 text-left hover:shadow-sm transition",
                onclick: () => openLocationEnemyPreviewModal(e.id, e.kills),
              },
              imgNode,
              _el("div", { class: "mt-1 text-[11px] font-semibold truncate" }, hasActive ? primaryName : e.name),
              _el(
                "div",
                { class: "mt-1 flex items-center justify-between gap-1" },
                _el("span", { class: "text-[10px] text-slate-100" }, leftLv),
                _el(
                  "span",
                  { class: "text-[10px] font-bold rounded-md px-1.5 py-0.5 border border-slate-700 bg-[rgb(24_34_52)] dark:bg-slate-700/30" },
                  rightInfo
                )
              )
            )
          );
        }

        body = grid;
      }
    }

    // Edit kills modal
    if (isKillsEditMode) {
      const enemy = getEnemyById(FARM.modal.enemyId);

      if (!enemy) {
        body = _el("div", { class: "text-sm text-slate-100" }, "Unknown enemy.");
      } else {
        ensureEnemyShape(enemy);

        const maxLevel = clampNum(enemy.maxLevel ?? 5, 0, 5);
        const draftLv = clampNum(Number(FARM.modal.editLv ?? 0), 0, maxLevel);

        const y = draftLv >= maxLevel ? 0 : getYForLevel(enemy, draftLv);
        const totalLine = draftLv >= maxLevel ? "Total for this level = MAX" : `Total for this level = ${y}`;

        body = _el(
          "div",
          { class: "space-y-3" },

          _el(
            "div",
            { class: "grid grid-cols-1 md:grid-cols-2 gap-3" },

            _el(
              "div",
              { class: "space-y-1" },
              label("Lv."),
              inputNumber(
                FARM.modal.editLv,
                (v) => {
                  FARM.modal.editLv = v;

                  const lvNow = clampNum(Number(FARM.modal.editLv ?? 0), 0, maxLevel);
                  if (lvNow >= maxLevel) {
                    FARM.modal.editCur = 0;
                  } else {
                    const yNow = getYForLevel(enemy, lvNow);
                    const curNow = clampNum(Number(FARM.modal.editCur ?? 0), 0, yNow);
                    FARM.modal.editCur = curNow;
                  }

                  render();
                },
                0,
                maxLevel,
                "modal_edit_lv"
              ),
              _el("div", { class: "text-xs text-slate-100" }, `Max Level = ${maxLevel}`)
            ),

            _el(
              "div",
              { class: "space-y-1" },
              label("Kills"),
              inputNumber(
                FARM.modal.editCur ?? 0,
                (v) => {
                  const lvNow = clampNum(Number(FARM.modal.editLv ?? 0), 0, maxLevel);

                  if (lvNow >= maxLevel) {
                    FARM.modal.editCur = 0;
                    return;
                  }

                  const yNow = getYForLevel(enemy, lvNow);
                  FARM.modal.editCur = clampNum(Number(v), 0, yNow);
                },
                0,
                draftLv >= maxLevel ? 0 : y,
                "modal_edit_kills"
              ),
              _el("div", { class: "text-xs text-slate-100" }, totalLine)
            )
          ),

          _el(
            "div",
            { class: "flex gap-2 flex-wrap justify-end pt-1" },
            btnSmall("Cancel", () => closeModal()),
            btnSmall("Save", () => saveKillsEditModal(), "primary")
          )
        );
      }
    }

    // Enemy preview (Fast -> Enemy card)
    if (isPreviewMode) {
      const normal = getEnemyById(FARM.modal.enemyId);
      const activeId = String(FARM.modal.activeEnemyId || "");
      const active = activeId ? getEnemyById(activeId) : null;

      if (!normal) {
        body = _el("div", { class: "text-sm text-slate-100" }, "Unknown enemy.");
      } else {
        ensureEnemyShape(normal);
        if (active) ensureEnemyShape(active);

        const __loc = getLocationById(FARM.modal.locationId);
        const isPair = supportsActiveEnemy(__loc || FARM.modal.category) && !!active;

        const primary = isPair ? active : normal;
        const secondary = isPair ? normal : null;

        const calcProg = (enemy) => {
          const lv = Number(enemy.level ?? 0);
          const maxed = isEnemyMax(enemy);
          const y = maxed ? 0 : getYForLevel(enemy, lv);
          const cur = maxed ? 0 : Number(enemy.cur ?? 0);
          const pct = maxed ? 1 : (y > 0 ? Math.max(0, Math.min(1, cur / y)) : 0);
          return { lv, maxed, y, cur, pct };
        };

        const p1 = calcProg(primary);
        const p2 = secondary ? calcProg(secondary) : null;

        const anyNotMax = (secondary ? (!p1.maxed || !p2.maxed) : !p1.maxed);
        const bothAtZero = secondary
          ? (p1.lv === 0 && p1.cur === 0 && p2.lv === 0 && p2.cur === 0)
          : (p1.lv === 0 && p1.cur === 0);

        const disableMinus = bothAtZero;
        const disablePlus = !anyNotMax;

        const navList = getFastPreviewEnemyList();
        const disableNav = !navList || navList.length < 2;

        const miniBtn = (txt, onClick, disabled) => {
          if (FARM.readOnly) return null; // ✅ guest: nie pokazuj w ogóle
          const cls = _chipClass(false, "font-extrabold");
          return _el(
            "button",
            {
              type: "button",
              class: cls + (disabled ? " opacity-50 cursor-not-allowed pointer-events-none" : ""),
              disabled: !!disabled || undefined,
              onclick: disabled ? undefined : onClick,
            },
            txt
          );
        };

        const adjustCurBoth = (delta) => {
          adjustCur(primary.id, delta);
          if (secondary) adjustCur(secondary.id, delta);
        };

        const adjustLvBoth = (delta) => {
          adjustLv(primary.id, delta);
          if (secondary) adjustLv(secondary.id, delta);
        };

        const openSetModal = () => openKillsEditModal(primary.id, null, secondary ? secondary.id : "");

        body = _el(
          "div",
          { class: "space-y-3" },

          
          // images
          (secondary
            ? _el(
                "div",
                { class: "w-full max-w-[560px] mx-auto grid grid-cols-1 sm:grid-cols-2 gap-3" },
                _el(
                  "div",
                  {
                    class:
                      "w-full aspect-square rounded-2xl border border-slate-700 " +
                      "bg-[rgb(24_34_52)] dark:bg-slate-900 overflow-hidden",
                  },
                  primary.iconUrl ? _el("img", { src: primary.iconUrl, alt: primary.name, class: "w-full h-full object-contain" }) : null
                ),
                _el(
                  "div",
                  {
                    class:
                      "w-full aspect-square rounded-2xl border border-slate-700 " +
                      "bg-[rgb(24_34_52)] dark:bg-slate-900 overflow-hidden",
                  },
                  secondary.iconUrl ? _el("img", { src: secondary.iconUrl, alt: secondary.name, class: "w-full h-full object-contain" }) : null
                )
              )
            : _el(
                "div",
                { class: "flex justify-center" },
                _el(
                  "div",
                  {
                    class:
                      "w-full max-w-[420px] aspect-square rounded-2xl border border-slate-700 " +
                      "bg-[rgb(24_34_52)] dark:bg-slate-900 overflow-hidden",
                  },
                  primary.iconUrl ? _el("img", { src: primary.iconUrl, alt: primary.name, class: "w-full h-full object-contain" }) : null
                )
              )
          ),


          // progress panels
          (secondary && p2
            ? _el(
                "div",
                { class: "grid grid-cols-1 sm:grid-cols-2 gap-3" },
                _el(
                  "div",
                  { class: "rounded-2xl border border-slate-700 bg-slate-900 dark:bg-slate-800 p-3 space-y-2" },
                  _el(
                    "div",
                    { class: "flex items-center justify-between gap-2" },
                    _el("div", { class: "font-extrabold truncate" }, `Lv. ${p1.lv}`),
                    _el("div", { class: "text-sm font-extrabold" }, p1.maxed ? "MAX" : `${p1.cur}/${p1.y}`)
                  ),
                  _el(
                    "div",
                    { class: "w-full h-3 rounded-xl border border-slate-700 bg-[rgb(24_34_52)] dark:bg-slate-900 overflow-hidden" },
                    _el("div", { style: `height:100%; width:${(p1.pct * 100).toFixed(1)}%; background:${THEME.barFill};` })
                  )
                ),
                _el(
                  "div",
                  { class: "rounded-2xl border border-slate-700 bg-slate-900 dark:bg-slate-800 p-3 space-y-2" },
                  _el(
                    "div",
                    { class: "flex items-center justify-between gap-2" },
                    _el("div", { class: "font-extrabold truncate" }, `Lv. ${p2.lv}`),
                    _el("div", { class: "text-sm font-extrabold" }, p2.maxed ? "MAX" : `${p2.cur}/${p2.y}`)
                  ),
                  _el(
                    "div",
                    { class: "w-full h-3 rounded-xl border border-slate-700 bg-[rgb(24_34_52)] dark:bg-slate-900 overflow-hidden" },
                    _el("div", { style: `height:100%; width:${(p2.pct * 100).toFixed(1)}%; background:${THEME.barFill};` })
                  )
                )
              )
            : _el(
                "div",
                { class: "rounded-2xl border border-slate-700 bg-slate-900 dark:bg-slate-800 p-3 space-y-2 w-full" },
                _el(
                  "div",
                  { class: "flex items-center justify-between gap-2" },
                  _el("div", { class: "font-extrabold truncate" }, `Lv. ${p1.lv}`),
                  _el("div", { class: "text-sm font-extrabold" }, p1.maxed ? "MAX" : `${p1.cur}/${p1.y}`)
                ),
                _el(
                  "div",
                  { class: "w-full h-3 rounded-xl border border-slate-700 bg-[rgb(24_34_52)] dark:bg-slate-900 overflow-hidden" },
                  _el("div", { style: `height:100%; width:${(p1.pct * 100).toFixed(1)}%; background:${THEME.barFill};` })
                )
              )
          ),

// controls
          _el(
            "div",
            { class: "rounded-2xl border border-slate-700 bg-slate-900 dark:bg-slate-800 p-3" },
            _el(
              "div",
              { class: "flex justify-center gap-2 flex-wrap" },
              miniBtn("Lv -", () => adjustLvBoth(-1), disableMinus),
              miniBtn("-10", () => adjustCurBoth(-10), disableMinus),
              miniBtn("-5", () => adjustCurBoth(-5), disableMinus),
              miniBtn("-", () => adjustCurBoth(-1), disableMinus),
              miniBtn("Set", () => openSetModal(), false),
              miniBtn("+", () => adjustCurBoth(+1), disablePlus),
              miniBtn("+5", () => adjustCurBoth(+5), disablePlus),
              miniBtn("+10", () => adjustCurBoth(+10), disablePlus),
              miniBtn("Lv +", () => adjustLvBoth(+1), disablePlus)
            )
          ),

          _el(
            "div",
            { class: "flex items-center justify-between gap-2 flex-wrap" },
            miniBtn("◀ Prev", () => fastStepEnemy(-1), disableNav),
            (secondary
              ? _el(
                  "div",
                  { class: "flex flex-col items-center gap-2" },
                  _el(
                    "div",
                    { class: "flex justify-center gap-2 flex-wrap" },
                    btnSmall("Go to active", () => { closeModal(); jumpToEnemy(primary.id); }, "primary"),
                    btnSmall("Go to normal", () => { closeModal(); jumpToEnemy(secondary.id); }, "primary")
                  ),
                  _el(
                    "div",
                    { class: "flex justify-center gap-2 flex-wrap" },
                    btnSmall("Locations active", () => openEnemyLocationsModal(primary.id)),
                    btnSmall("Locations normal", () => openEnemyLocationsModal(secondary.id))
                  )
                )
              : _el(
                  "div",
                  { class: "flex justify-center gap-2 flex-wrap" },
                  btnSmall("Go to enemy", () => { closeModal(); jumpToEnemy(primary.id); }, "primary"),
                  btnSmall("Open enemy locations", () => openEnemyLocationsModal(primary.id))
                )
            ),
            miniBtn("Next ▶", () => fastStepEnemy(+1), disableNav)
          )
        );
      }
    }

    // Location preview (Location -> Enemy card)
    if (isLocPreviewMode) {
      const normal = getEnemyById(FARM.modal.enemyId);
      const loc = getLocationById(FARM.modal.locationId);
      const activeId = String(FARM.modal.activeEnemyId || "");
      const active = activeId ? getEnemyById(activeId) : null;

      if (!normal) {
        body = _el("div", { class: "text-sm text-slate-100" }, "Unknown enemy.");
      } else {
        ensureEnemyShape(normal);
        if (active) ensureEnemyShape(active);

        const isPair = !!(loc && supportsActiveEnemy(loc) && active);

        const calcProg = (enemy) => {
          const lv = Number(enemy.level ?? 0);
          const maxed = isEnemyMax(enemy);
          const y = maxed ? 0 : getYForLevel(enemy, lv);
          const cur = maxed ? 0 : Number(enemy.cur ?? 0);
          const pct = maxed ? 1 : (y > 0 ? Math.max(0, Math.min(1, cur / y)) : 0);
          return { lv, maxed, y, cur, pct };
        };

        const pNorm = calcProg(normal);
        const pAct = isPair ? calcProg(active) : null;

        const disableMinus = pNorm.lv === 0 && pNorm.cur === 0;
        const disablePlus = pNorm.maxed;

        const navList = getLocationPreviewEnemyList();
        const disableNav = !navList || navList.length < 2;

        const miniBtn = (txt, onClick, disabled) => {
          if (FARM.readOnly) return null; // ✅ guest: nie pokazuj w ogóle
          const cls = _chipClass(false, "font-extrabold");
          return _el(
            "button",
            {
              type: "button",
              class: cls + (disabled ? " opacity-50 cursor-not-allowed pointer-events-none" : ""),
              disabled: !!disabled || undefined,
              onclick: disabled ? undefined : onClick,
            },
            txt
          );
        };

        body = _el(
          "div",
          { class: "space-y-3" },

          
          (isGate
            ? _el(
                "div",
                { class: "w-full max-w-[560px] mx-auto grid grid-cols-1 sm:grid-cols-2 gap-3" },
                _el(
                  "div",
                  {
                    class:
                      "w-full aspect-square rounded-2xl border border-slate-700 " +
                      "bg-[rgb(24_34_52)] dark:bg-slate-900 overflow-hidden",
                  },
                  active.iconUrl ? _el("img", { src: active.iconUrl, alt: active.name, class: "w-full h-full object-contain" }) : null
                ),
                _el(
                  "div",
                  {
                    class:
                      "w-full aspect-square rounded-2xl border border-slate-700 " +
                      "bg-[rgb(24_34_52)] dark:bg-slate-900 overflow-hidden",
                  },
                  normal.iconUrl ? _el("img", { src: normal.iconUrl, alt: normal.name, class: "w-full h-full object-contain" }) : null
                )
              )
            : _el(
                "div",
                { class: "flex justify-center" },
                _el(
                  "div",
                  {
                    class:
                      "w-full max-w-[420px] aspect-square rounded-2xl border border-slate-700 " +
                      "bg-[rgb(24_34_52)] dark:bg-slate-900 overflow-hidden",
                  },
                  normal.iconUrl ? _el("img", { src: normal.iconUrl, alt: normal.name, class: "w-full h-full object-contain" }) : null
                )
              )
          ),

          (isGate && pAct
            ? _el(
                "div",
                { class: "grid grid-cols-1 sm:grid-cols-2 gap-3" },
                _el(
                  "div",
                  { class: "rounded-2xl border border-slate-700 bg-slate-900 dark:bg-slate-800 p-3 space-y-2" },
                  _el(
                    "div",
                    { class: "flex items-center justify-between gap-2" },
                    _el("div", { class: "font-extrabold truncate" }, `Lv. ${pAct.lv}`),
                    _el("div", { class: "text-sm font-extrabold" }, pAct.maxed ? "MAX" : `${pAct.cur}/${pAct.y}`)
                  ),
                  _el(
                    "div",
                    { class: "w-full h-3 rounded-xl border border-slate-700 bg-[rgb(24_34_52)] dark:bg-slate-900 overflow-hidden" },
                    _el("div", { style: `height:100%; width:${(pAct.pct * 100).toFixed(1)}%; background:${THEME.barFill};` })
                  )
                ),
                _el(
                  "div",
                  { class: "rounded-2xl border border-slate-700 bg-slate-900 dark:bg-slate-800 p-3 space-y-2" },
                  _el(
                    "div",
                    { class: "flex items-center justify-between gap-2" },
                    _el("div", { class: "font-extrabold truncate" }, `Lv. ${pNorm.lv}`),
                    _el("div", { class: "text-sm font-extrabold" }, pNorm.maxed ? "MAX" : `${pNorm.cur}/${pNorm.y}`)
                  ),
                  _el(
                    "div",
                    { class: "w-full h-3 rounded-xl border border-slate-700 bg-[rgb(24_34_52)] dark:bg-slate-900 overflow-hidden" },
                    _el("div", { style: `height:100%; width:${(pNorm.pct * 100).toFixed(1)}%; background:${THEME.barFill};` })
                  )
                )
              )
            : _el(
                "div",
                { class: "rounded-2xl border border-slate-700 bg-slate-900 dark:bg-slate-800 p-3 space-y-2 w-full" },
                _el(
                  "div",
                  { class: "flex items-center justify-between gap-2" },
                  _el("div", { class: "font-extrabold truncate" }, `Lv. ${pNorm.lv}`),
                  _el("div", { class: "text-sm font-extrabold" }, pNorm.maxed ? "MAX" : `${pNorm.cur}/${pNorm.y}`)
                ),
                _el(
                  "div",
                  { class: "w-full h-3 rounded-xl border border-slate-700 bg-[rgb(24_34_52)] dark:bg-slate-900 overflow-hidden" },
                  _el("div", { style: `height:100%; width:${(pNorm.pct * 100).toFixed(1)}%; background:${THEME.barFill};` })
                )
              )
          ),
_el(
            "div",
            { class: "rounded-2xl border border-slate-700 bg-slate-900 dark:bg-slate-800 p-3" },
            _el(
              "div",
              { class: "flex justify-center gap-2 flex-wrap" },
              miniBtn("-10", () => adjustCur(normal.id, -10), disableMinus),
              miniBtn("-1", () => adjustCur(normal.id, -1), disableMinus),
              miniBtn("+1", () => adjustCur(normal.id, +1), disablePlus),
              miniBtn("+10", () => adjustCur(normal.id, +10), disablePlus)
            )
          ),

          _el(
            "div",
            { class: "flex items-center justify-between gap-2 flex-wrap" },
            miniBtn("◀ Prev", () => locationStepEnemy(-1), disableNav),
            (isPair
              ? _el(
                  "div",
                  { class: "flex flex-col items-center gap-2" },
                  _el(
                    "div",
                    { class: "flex justify-center gap-2 flex-wrap" },
                    btnSmall("Go to active", () => { closeModal(); jumpToEnemy(active.id); }, "primary"),
                    btnSmall("Go to normal", () => { closeModal(); jumpToEnemy(normal.id); }, "primary")
                  ),
                  _el(
                    "div",
                    { class: "flex justify-center gap-2 flex-wrap" },
                    btnSmall("Locations active", () => openEnemyLocationsModal(active.id)),
                    btnSmall("Locations normal", () => openEnemyLocationsModal(normal.id))
                  )
                )
              : _el(
                  "div",
                  { class: "flex justify-center gap-2 flex-wrap" },
                  btnSmall("Go to enemy", () => {
                    closeModal();
                    jumpToEnemy(normal.id);
                  }, "primary"),
                  btnSmall("Open enemy locations", () => openEnemyLocationsModal(normal.id))
                )
            ),
            miniBtn("Next ▶", () => locationStepEnemy(+1), disableNav)
          )
        );
      }
    }

// Fast category modal
    if (isFastMode) {
      const cat = FARM.modal.category;
      const list = cat ? getFastAvailableLocationsByCategory(cat) : [];

      if (!cat || list.length === 0) {
        body = _el("div", { class: "text-sm text-slate-100" }, "No locations (all enemies are MAX).");
        footer = null;
      } else {
        ensureFastSelected(cat);

        const selectedId = String(FARM.fastSelectedLocation[cat] || "");
        const selectedLoc = selectedId ? getLocationById(selectedId) : null;
        const enemies = selectedId ? getEnemiesForLocationFast(selectedId) : [];
        const weeklyKey = weeklyKeyFromFastLocation(cat, selectedLoc);
        const weeklyMax = weeklyKey === "mindRift" ? 2 : 4;
        const weeklySelectedCount = weeklyKey ? (FARM.weeklyOther?.[weeklyKey] || []).length : 0;
        const fastBorderColor =
          cat === "Battlefield of Chaos"
            ? getFastBoCBorderColor(selectedLoc)
            : cat === "Gate"
            ? getFastGateBorderColor(selectedLoc)
            : "";

        // ✅ Fixed card sizing (consistent grid)
        // Desktop: fixed px cards. Mobile: 2 columns with fluid width (still consistent across cards)
        const vw = Math.max(320, Number(window.innerWidth || 0) || 1024);
        const isMobileFast = vw <= 520;

        const FAST_CARD_BASE_W = 150;  // 👈 change here if you want smaller cards globally
        const FAST_CARD_BASE_H = 216;  // 👈 change here if you want smaller cards globally

        // Try to keep 2 columns visible on narrow screens (sidebar + paddings can reduce real width)
        const mobileTargetW = Math.max(112, Math.min(FAST_CARD_BASE_W, Math.floor((vw - 160) / 2)));
        const FAST_CARD_W = isMobileFast ? mobileTargetW : FAST_CARD_BASE_W;
        const FAST_CARD_H = isMobileFast ? Math.round(FAST_CARD_BASE_H * (FAST_CARD_W / FAST_CARD_BASE_W)) : FAST_CARD_BASE_H;

        const FAST_GRID_GAP = isMobileFast ? 10 : 12;
        const FAST_MIN_ROWS = 2;
        const FAST_MIN_GRID_H = (FAST_CARD_H * FAST_MIN_ROWS) + (FAST_GRID_GAP * (FAST_MIN_ROWS - 1));

        const fastGridStyle = isMobileFast
          ? `display:grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap:${FAST_GRID_GAP}px; min-height:${FAST_MIN_GRID_H}px;`
          : `display:grid; grid-template-columns: repeat(auto-fill, minmax(${FAST_CARD_W}px, ${FAST_CARD_W}px)); gap:${FAST_GRID_GAP}px; justify-content:flex-start; min-height:${FAST_MIN_GRID_H}px;`;

        const fastCardSizeStyle = isMobileFast
          ? `height:${FAST_CARD_H}px;`
          : `width:${FAST_CARD_W}px; height:${FAST_CARD_H}px;`;

        const dropdown = _el(
          "div",
          { class: "space-y-1" },
          label("Choose location"),
          selectBox(
            selectedId,
            list.map((l) => ({ value: l.id, label: l.name })),
            (v) => {
              FARM.fastSelectedLocation[cat] = v;
              render();
            }
          ),
          _el("div", { class: "text-xs text-slate-100" }, "Tip: press ↑ / ↓ without clicking the dropdown")
        );

        // ✅ Always-visible footer (outside scroll)
        const disableNav = list.length < 2;
        footer = _el(
          "div",
          {
            class:
              "flex gap-2 flex-wrap justify-between items-center " +
              "pt-3 border-t border-slate-700 " +
              "bg-slate-900 text-slate-100",
          },
          _el("div", { class: "text-xs text-slate-100 font-semibold" }, disableNav ? "—" : "Switch location"),
          _el(
            "div",
            { class: "flex gap-2 flex-wrap" },
            btnSmall("◀ Prev (↑)", () => fastStepLocation(-1), disableNav ? "default" : "default"),
            btnSmall("Next (↓) ▶", () => fastStepLocation(+1), disableNav ? "default" : "default")
          )
        );

        // disable actual click if nav disabled
        if (disableNav) {
          footer.querySelectorAll("button").forEach((b) => {
            b.disabled = true;
            b.classList.add("opacity-50", "cursor-not-allowed");
          });
        }

        let grid = null;

        if (selectedLoc && enemies.length) {
          grid = _el(
            "div",
            { class: "mt-3 space-y-2" },
            _el(
              "div",
              { class: "flex items-center justify-between gap-2 flex-wrap" },
              _el("div", { class: "font-bold text-sm" }, selectedLoc.name),
              _el(
                "div",
                { class: "text-xs text-slate-100" },
                weeklyKey
                  ? `${enemies.length} enemies • Weekly ${weeklySelectedCount}/${weeklyMax}`
                  : `${enemies.length} enemies (${FARM.fastIncludeMax ? "ALL" : "NOT MAX"})`
              )
            ),
            _el(
              "div",
              { style: fastGridStyle },
              ...enemies.map((e) => {
                // Gate has built-in 2-enemy display, but we also allow 2-enemy locations under "Other" (Encore/Instance)
                // based on location name/id heuristics.
                const isPairCat = supportsActiveEnemy(selectedLoc || cat);
                const active = isPairCat && e.activeEnemy ? e.activeEnemy : null;
                const hasActive = isPairCat && !!active;

                const primaryName = hasActive ? displayEnemyName(active.name) : displayEnemyName(e.name);

                const imgNode = hasActive
                  ? _el(
                      "div",
                      {
                        class:
                          "w-full rounded-xl bg-[rgb(24_34_52)] dark:bg-slate-900 border " +
                          "border-slate-700 overflow-hidden flex flex-1 min-h-0",
                        style: isWeeklySelectedForFast(cat, selectedLoc, e.id)
                          ? "border-color:#ef4444; border-width:2px;"
                          : fastBorderColor
                          ? `border-color:${fastBorderColor}; border-width:2px;`
                          : "",
                      },
                      _el(
                        "div",
                        { class: "w-1/2 h-full border-r border-slate-700 overflow-hidden" },
                        active && active.iconUrl ? _el("img", { src: active.iconUrl, class: "w-full h-full object-cover", alt: primaryName }) : null
                      ),
                      _el(
                        "div",
                        { class: "w-1/2 h-full overflow-hidden" },
                        e.iconUrl ? _el("img", { src: e.iconUrl, class: "w-full h-full object-cover", alt: e.name }) : null
                      )
                    )
                  : _el(
                      "div",
                      {
                        class:
                          "w-full rounded-xl bg-[rgb(24_34_52)] dark:bg-slate-900 border " +
                          "border-slate-700 overflow-hidden flex-1 min-h-0",
                        style: isWeeklySelectedForFast(cat, selectedLoc, e.id)
                          ? "border-color:#ef4444; border-width:2px;"
                          : fastBorderColor
                          ? `border-color:${fastBorderColor}; border-width:2px;`
                          : "",
                      },
                      e.iconUrl ? _el("img", { src: e.iconUrl, class: "w-full h-full object-cover", alt: e.name }) : null
                    );

                const primaryLvText = isEnemyMax(hasActive ? active : e) ? "MAX" : `Lv. ${(hasActive ? active : e).level}`;

                return _el(
                  "button",
                  {
                    class:
                      "rounded-2xl border border-slate-700 bg-slate-900 dark:bg-slate-800 p-3 text-left flex flex-col h-full " +
                      "hover:shadow-sm transition " + (isWeeklySelectedForFast(cat, selectedLoc, e.id) ? "ring-2 ring-red-500 border-red-500" : ""),
                    style: fastCardSizeStyle + (isWeeklySelectedForFast(cat, selectedLoc, e.id)
                      ? "border-color:#ef4444; border-width:2px;"
                      : fastBorderColor
                      ? `border-color:${fastBorderColor}; border-width:2px;`
                      : ""),
                    onclick: () => {
                      openEnemyPreviewModal(e.id, e.kills, selectedId, hasActive ? String(e.activeEnemyId || "") : "");
                    },
                  },
                  imgNode,
                  _el("div", { class: "mt-2 text-sm font-bold truncate flex-none" }, primaryName),
                  _el(
                    "div",
                    { class: "mt-2 flex items-center justify-between gap-2 flex-none" },
                    _el("span", { class: "text-xs text-slate-100 font-semibold" }, primaryLvText),
                    hasActive ? _el("span", { class: "text-xs text-slate-100 font-semibold" }, (isEnemyMax(e) ? "MAX" : `Lv. ${e.level}`)) : null
                  )
                );
              })
            )
          );
        } else {
          grid = _el("div", { class: "mt-3 text-sm text-slate-100" }, "No NOT MAX enemies here.");
        }

        body = _el("div", { class: "space-y-2" }, dropdown, grid);
      }
    }

    const canBack = Array.isArray(FARM.modal.stack) && FARM.modal.stack.length > 0;

    // ✅ UX: in enemy_preview, ESC / click outside / Close should NOT exit Fast modal entirely.
    // It should return back to Fast Lv. Up • <Category> (fast_category) if available.
    const closeOrBack = () => {
      if (canBack && (FARM.modal.mode === "enemy_preview" || FARM.modal.mode === "location_preview" || FARM.modal.mode === "edit_kills" || FARM.modal.mode === "location_enemies")) {
        modalBack();
        return;
      }
      closeModal();
    };

    const modalMaxW = isFastMode ? "max-w-5xl" : "max-w-3xl";

    const overlay = _el(
      "div",
      {
        class: "fixed inset-0 z-[9999] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4",
        onclick: (ev) => {
          if (ev.target === ev.currentTarget) closeOrBack();
        },
      },
      _el(
        "div",
        { class: `w-full ${modalMaxW} rounded-2xl bg-slate-900 text-slate-100 border border-slate-700 shadow-xl overflow-hidden` },
        _el(
          "div",
          { class: "px-4 py-3 border-b border-slate-700 flex items-center justify-between gap-2" },
          _el(
            "div",
            { class: "min-w-0" },
            _el("div", { class: "text-lg font-bold truncate" }, title),
            subtitle ? _el("div", { class: "text-xs text-slate-100" }, subtitle) : null
          ),
          _el(
            "div",
            { class: "flex items-center gap-2" },
            canBack
              ? _el(
                  "button",
                  {
                    class:
                      "px-3 py-2 rounded-xl text-sm font-bold border border-slate-700 " +
                      "hover:bg-[rgb(24_34_52)] dark:hover:bg-slate-800 transition",
                    onclick: () => modalBack(),
                  },
                  "Back"
                )
              : null,
            _el(
              "button",
              {
                class:
                  "px-3 py-2 rounded-xl text-sm font-bold border border-slate-700 " +
                  "hover:bg-[rgb(24_34_52)] dark:hover:bg-slate-800 transition",
                onclick: () => closeModal(),
              },
              "Close"
            )
          )
        ),

        // ✅ UPDATED: content area = scroll body + fixed footer
        _el(
          "div",
          { class: "p-4 max-h-[86vh] sm:max-h-[78vh] md:max-h-[70vh] overflow-hidden flex flex-col" },
          _el("div", { id: "sc_modal_scroll", class: "min-h-0 overflow-auto" }, body),
          footer ? _el("div", { class: "mt-3" }, footer) : null
        )
      )
    );

    if (!__modalKeyListenerAdded) {
      __modalKeyListenerAdded = true;
      window.addEventListener("keydown", (e) => {
        if (!FARM.modal.open) return;

        if (e.key === "Escape") {
          const hasBack = Array.isArray(FARM.modal.stack) && FARM.modal.stack.length > 0;
          if (hasBack && (FARM.modal.mode === "enemy_preview" || FARM.modal.mode === "location_preview" || FARM.modal.mode === "edit_kills" || FARM.modal.mode === "location_enemies")) {
            modalBack();
            return;
          }
          closeModal();
          return;
        }

        // ✅ Enemy preview navigation: ← / →
        if (FARM.modal.mode === "enemy_preview") {
          const a = document.activeElement;
          const tag = a && a.tagName ? a.tagName.toUpperCase() : "";
          if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

          if (e.key === "ArrowLeft") {
            e.preventDefault();
            fastStepEnemy(-1);
            return;
          }
          if (e.key === "ArrowRight") {
            e.preventDefault();
            fastStepEnemy(+1);
            return;
          }
        }

        // ✅ Location preview navigation: ← / →
        if (FARM.modal.mode === "location_preview") {
          const a = document.activeElement;
          const tag = a && a.tagName ? a.tagName.toUpperCase() : "";
          if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

          if (e.key === "ArrowLeft") {
            e.preventDefault();
            locationStepEnemy(-1);
            return;
          }
          if (e.key === "ArrowRight") {
            e.preventDefault();
            locationStepEnemy(+1);
            return;
          }
        }

        // ✅ Enemy locations navigation: ← / →
        if (FARM.modal.mode === "enemy_locations") {
          const a = document.activeElement;
          const tag = a && a.tagName ? a.tagName.toUpperCase() : "";
          if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

          if (e.key === "ArrowLeft") {
            e.preventDefault();
            enemyLocationsStepEnemy(-1);
            return;
          }
          if (e.key === "ArrowRight") {
            e.preventDefault();
            enemyLocationsStepEnemy(+1);
            return;
          }
        }

        if (FARM.modal.mode === "fast_category") {
          const a = document.activeElement;
          const tag = a && a.tagName ? a.tagName.toUpperCase() : "";

          if (tag === "SELECT") return;
          if (tag === "INPUT" || tag === "TEXTAREA") return;

          if (e.key === "ArrowUp") {
            e.preventDefault();
            fastStepLocation(-1);
            return;
          }
          if (e.key === "ArrowDown") {
            e.preventDefault();
            fastStepLocation(+1);
            return;
          }
        }
      });
    }

    return overlay;
  }

  // -----------------------------
  // Root render
  // -----------------------------
  function renderFarmRoot() {
    const wrap = _el("div", { class: "space-y-3" });

    const viewUserId = window.STATE?.viewUserId ? Number(window.STATE.viewUserId) : null;
    const me = window.STATE?.me || null;

    ensureStateUi();

    // ✅ HARD BLOCK:
    // jeśli user NIE jest adminem albo admin tab schowany, to nie pozwalaj na admin tab
    if (FARM.subtab === "admin" && (!FARM.isAdmin || !FARM.showAdminTab)) {
      FARM.subtab = "commissions";
    }
    if (FARM.subtab === "fast" && !me && !viewUserId) {
      FARM.subtab = "commissions";
    }

    // --------------------------
    // UI: Header (like Hunter.js)
    // --------------------------
    const top = _el("div", { class: "flex items-center justify-between gap-3 mb-4" });

    top.append(
      _el(
        "div",
        { class: "min-w-0" },
        _el("div", { class: "text-2xl font-extrabold text-yellow-400 leading-tight" }, "Special Commission"),
        _el(
          "div",
          { class: "text-sm text-slate-100 flex flex-wrap items-center gap-2" },
          _el("span", {}, "Commissions & Fast Lv. Up tracker"),
          _el(
            "span",
            { class: "px-2 py-0.5 rounded-md bg-red-500/15 text-red-300 border border-red-400/30 font-semibold" },
            "Data may not be 100% accurate"
          )
        )
      )
    );

    const right = _el("div", { class: "flex items-center gap-2 flex-wrap justify-end" });
    const totalEnemies = Array.isArray(FARM.enemies) ? FARM.enemies.length : 0;
    const maxedEnemies = Array.isArray(FARM.enemies) ? FARM.enemies.filter((e) => isEnemyMax(e)).length : 0;

        const counterPill = _el(
      "div",
      {
        class:
          "px-3 py-1 rounded-full border bg-slate-900 dark:bg-slate-800 dark:border-slate-700 " +
          "text-sm font-semibold text-white dark:text-slate-100",
      },
      `${maxedEnemies}/${totalEnemies || 0}`
    );

    // ✅ Edit is available only in Commissions, next to the progress counter
    if (FARM.subtab === "commissions" && !!me) {
      const editBtn =
        _el(
                "button",
                {
                  type: "button",
                  class:
                    "px-3 py-1 rounded-full border text-sm font-semibold transition-colors " +
                    (FARM.readOnly
                      ? "opacity-60 cursor-not-allowed bg-slate-900 dark:bg-slate-800 dark:text-slate-100 dark:border-slate-700"
                      : FARM.editMode
                      ? "bg-slate-900 text-white border-slate-900 dark:bg-[rgb(24_34_52)] dark:text-yellow-400 dark:border-slate-100"
                      : "bg-slate-900 dark:bg-slate-800 dark:text-slate-100 dark:border-slate-700 hover:bg-[rgb(24_34_52)] dark:hover:bg-slate-700"),
                  onclick: (ev) => {
                    ev?.preventDefault?.();
                    if (FARM.readOnly) return;
                    toggleEditMode();
                  },
                },
                FARM.editMode ? "Edit: ON" : "Edit"
              );
      right.append(editBtn);
      right.append(counterPill);
    } else {
      right.append(counterPill);
    }

    top.append(right);

    // --------------------------
    // UI: Tabs (full-width buttons like Hunter.js)
    // --------------------------
    const showFastTab = !!me || !!viewUserId;
    const tabCount = 1 + (showFastTab ? 1 : 0) + (FARM.showAdminTab ? 1 : 0);
    const cols = tabCount === 3 ? "grid-cols-3" : tabCount === 2 ? "grid-cols-2" : "grid-cols-1";
    const tabsBar = _el("div", { class: `grid ${cols} gap-2 mb-4` });

    const tabBtn = ({ label, active, onClick, disabled = false }) => {
  const b = _el(
    "button",
    {
      type: "button",
      class: _btnClass(!!active, "w-full") + (disabled ? " opacity-50 cursor-not-allowed pointer-events-none" : ""),
      disabled: disabled || undefined,
      onclick: (ev) => {
        ev?.preventDefault?.();
        if (disabled) return;
        onClick?.();
      },
    },
    label
  );
  return b;
};

    tabsBar.append(
      tabBtn({
        label: "Commissions",
        active: FARM.subtab === "commissions",
        onClick: () => {
          FARM.subtab = "commissions";
          render();
        },
      })
    );

    if (showFastTab) {
      tabsBar.append(
        tabBtn({
        label: "Fast Lv. Up",
        active: FARM.subtab === "fast",
        onClick: () => {
          FARM.subtab = "fast";
          FARM.editMode = false; // ✅ OFF when leaving commissions
          render();
        },
        })
      );
    }

    // ✅ ADMIN TAB (only for admins + not hidden)
    if (FARM.showAdminTab) {
      tabsBar.append(
        tabBtn({
          label: "Admin",
          active: FARM.subtab === "admin",
          onClick: () => {
            FARM.subtab = "admin";
            FARM.editMode = false; // ✅ OFF when leaving commissions
            render();
          },
        })
      );
    }

    const body = _el("div", { class: "space-y-3" });

    // ✅ logged out
    if (!me && !viewUserId) {
      body.append(
        _el(
          "div",
          { class: "text-sm text-white dark:text-slate-300 text-center" },
          "ㅤ"
        )
      );
      // ✅ NIE przerywamy renderu
    }


    // ✅ loading
    if (FARM.loading) {
      body.append(
        adminCard(
          "Loading",
          _el("div", { class: "text-sm text-white dark:text-slate-300" }, "Wczytywanie danych z bazy…")
        )
      );
      wrap.append(top, tabsBar, body);
      return wrap;
    }

    // ✅ render current tab
    if (FARM.subtab === "commissions") body.append(renderCommissionsTab());
    if (FARM.subtab === "fast") body.append(renderFastTab());
    if (FARM.subtab === "admin") body.append(renderAdminTab());

    wrap.append(top, tabsBar, body);

    const modal = renderModal();
    if (modal) wrap.append(modal);

    return wrap;
  }

  function render() {
    if (!__isSpecialCommissionRoute()) return; // ✅ nie nadpisuj innych zakładek
    
    const root = document.getElementById("content");
    if (!root) return;

    const y = window.scrollY;
    const x = window.scrollX;

    const active = document.activeElement;
    let activeState = null;

    if (
      active &&
      (active.tagName === "INPUT" || active.tagName === "TEXTAREA") &&
      active.id
    ) {
      activeState = {
        id: active.id,
        start: active.selectionStart,
        end: active.selectionEnd,
        dir: active.selectionDirection,
      };
    }

    const modalScrollEl = document.getElementById("sc_modal_scroll");
    const modalScrollTop = modalScrollEl ? modalScrollEl.scrollTop : 0;

    root.innerHTML = "";

    // ✅ Padding/layout EXACTLY like Hunter.js
    const shell = _el("div", {
      class: "w-full mx-auto px-3 sm:px-6 py-6",
      "data-sla-page": "special-commission",
    });

    shell.append(renderFarmRoot());
    root.append(shell);requestAnimationFrame(() => {
      window.scrollTo(x, y);

      if (activeState) {
        const el = document.getElementById(activeState.id);
        if (el && typeof el.focus === "function") {
          el.focus();
          if (
            typeof el.setSelectionRange === "function" &&
            activeState.start !== null &&
            activeState.start !== undefined
          ) {
            try {
              el.setSelectionRange(activeState.start, activeState.end, activeState.dir || "none");
            } catch {}
          }
        }
      }
    });
    const newModalScrollEl = document.getElementById("sc_modal_scroll");
    if (newModalScrollEl) newModalScrollEl.scrollTop = modalScrollTop;
  }

  let __sc_lastKey = "";
  let __sc_inFlight = null;

  async function __mount() {
    const viewUserId = window.STATE?.viewUserId ? Number(window.STATE.viewUserId) : null;
    const me = window.STATE?.me || null;

    ensureStateUi();

    FARM.guest = !me && !viewUserId;
    // Read-only ONLY when explicitly viewing someone else's data via ?user=...
    FARM.readOnly = !!viewUserId;

    // ✅ ADMIN logic (perms + hide toggle EXACT like other modules)
    FARM.isAdmin = isAdminUser(me) && !!me && !viewUserId;
    FARM.showAdminTab = isAdminTabVisible(me, viewUserId);

    FARM.editMode = false;

    // jeśli admin tab jest schowany / user nie admin -> wymuś commissions
    if (FARM.subtab === "admin" && !FARM.showAdminTab) FARM.subtab = "commissions";

    const key = viewUserId ? `view:${viewUserId}` : `me:${me?.id || "guest"}`;
    if (__sc_lastKey === key) {
      render();
      return;
    }
    __sc_lastKey = key;

    if (__sc_inFlight) {
      await __sc_inFlight;
      render();
      return;
    }

    __sc_inFlight = (async () => {
      try {
        await loadFromDB();
      } finally {
        __sc_inFlight = null;
      }
    })();

    await __sc_inFlight;
    render();
  }

  async function __refresh() {
    const viewUserId = window.STATE?.viewUserId ? Number(window.STATE.viewUserId) : null;
    const me = window.STATE?.me || null;

    ensureStateUi();

    FARM.guest = !me && !viewUserId;
    // Read-only ONLY when explicitly viewing someone else's data via ?user=...
    FARM.readOnly = !!viewUserId;

    // ✅ ADMIN logic (perms + hide toggle EXACT like other modules)
    FARM.isAdmin = isAdminUser(me) && !!me && !viewUserId;
    FARM.showAdminTab = isAdminTabVisible(me, viewUserId);

    FARM.editMode = false;

    if (FARM.subtab === "admin" && !FARM.showAdminTab) FARM.subtab = "commissions";

    if (__sc_inFlight) {
      await __sc_inFlight;
      render();
      return;
    }

    __sc_inFlight = (async () => {
      try {
        await loadFromDB();
      } finally {
        __sc_inFlight = null;
      }
    })();

    await __sc_inFlight;
    render();
  }

  window.__special_commission_mount = __mount;
  window.__special_commission_refresh = __refresh;

  window.__specialCommission_mount = __mount;
  window.__specialCommission_refresh = __refresh;
})();
