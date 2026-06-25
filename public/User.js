// User.js
// Mount: window.__user_mount(path)
// Route: /members/:id
// Works on desktop + mobile, random background per user (stable by id)

(function () {
  // ---------- config ----------
  const BG_LIST = [
    "/picture/Menu/BG/BG_ContentsMenu_Unlock_ArchitectTrial.png",
    "/picture/Menu/BG/BG_ContentsMenu_Unlock_DG.png",
    "/picture/Menu/BG/BG_ContentsMenu_Unlock_LibraryDungeon.png",
    "/picture/Menu/BG/BG_ContentsMenu_Unlock_Story_Reverse.png",
    "/picture/Menu/BG/BG_ContentsMenu_Unlock_CoopDungeon.png",
    "/picture/Menu/BG/BG_ContentsMenu_Unlock_ChaosBattleField.png",
    "/picture/Menu/BG/BG_ContentsMenu_Unlock_TimeAttack.png",
    "/picture/Menu/BG/BG_ContentsMenu_Unlock_Raid.png",
    "/picture/Menu/BG/BG_ContentsMenu_Unlock_HunterStory.png",
    "/picture/Menu/BG/BG_ContentsMenu_Unlock_Tower.png",
    "/picture/Menu/BG/BG_ContentsMenu_Unlock_Instance.png",
    "/picture/Menu/BG/BG_ContentsMenu_Unlock_Advent.png",
    "/picture/Menu/BG/BG_ContentsMenu_Unlock_WorldBoss.png",
    "/picture/Menu/BG/BG_ContentsMenu_Unlock_CoreDungeon.png",
  ];

  const ICONS = {
    hunters: "/picture/Menu/Icon/Collection_Hunter.png",
    weapons: "/picture/Menu/Icon/Collection_Weapon.png",
    runes: "/picture/Menu/Icon/Collection_Rune.png",
    blessing: "/picture/Menu/Icon/Collection_Memory.png",
    shadows: "/picture/Menu/Icon/Collection_Shadow.png",
    successors: "/picture/Menu/Icon/Collection_Successor.png",
  };

  const STATS = [
    { key: "hunters", title: "Hunters", icon: ICONS.hunters },
    { key: "weapons", title: "Weapons", icon: ICONS.weapons },
    { key: "runes", title: "Runes", icon: ICONS.runes },
    { key: "blessing", title: "Blessing Stones", icon: ICONS.blessing },
    { key: "shadows", title: "Shadows", icon: ICONS.shadows },
    { key: "successors", title: "Successor", icon: ICONS.successors },
  ];

  // ---------- helpers ----------
  function safeText(x, fallback = "") {
    const v = x == null ? "" : String(x);
    return v.trim() || fallback;
  }

  function escapeHtml(str) {
    return String(str ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  // ✅ base-path aware (works even if LogIn.js crashed / not loaded yet)
  function cleanBase(b) {
    let s = String(b || "").trim();
    if (!s) return "";
    if (!s.startsWith("/")) s = "/" + s;
    s = s.replace(/\/+$/, "");
    return s === "/" ? "" : s;
  }

  function getBasePath() {
    // prefer global from app.js / LogIn.js
    const w = window.__BASE_PATH__ || window.BASE_PATH || window.__SLA_BASE__;
    if (typeof w === "string" && w.trim()) return cleanBase(w.trim());

    // infer from URL (/slahub/xxx)
    const p = String(window.location.pathname || "/");
    const parts = p.split("/").filter(Boolean);
    if (parts.length > 0) {
      const first = "/" + parts[0];
      if (first === "/slahub") return "/slahub";
    }
    return "";
  }

  function apiUrl(p) {
    const base = getBasePath();
    const path = String(p || "");
    const fixed = path.startsWith("/") ? path : `/${path}`;
    return base ? (base + fixed) : fixed;
  }

  // ✅ never break when url() missing
  function apiPath(p) {
    try {
      if (typeof window.url === "function") return window.url(p);
    } catch (_) {}
    return apiUrl(p);
  }

  function ensureGlobals() {
    // ✅ only set if missing
    if (typeof window.url !== "function") {
      window.url = (p) => apiUrl(p);
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
            if (k.startsWith("on") && typeof v === "function") {
              node.addEventListener(k.slice(2).toLowerCase(), v);
              continue;
            }
            if (k === "dataset" && typeof v === "object") {
              for (const [dk, dv] of Object.entries(v)) node.dataset[dk] = String(dv);
              continue;
            }
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

    if (typeof window.showToast !== "function") {
      window.showToast = (msg) => console.log("[toast]", msg);
    }
  }

  function getIdFromPath(pathname) {
    const p = String(pathname || location.pathname || "");
    const parts = p.split("/").filter(Boolean);

    const idx = parts.findIndex((x) => String(x).toLowerCase() === "members");
    if (idx === -1) return null;

    const idStr = parts[idx + 1] || "";
    const n = Number(idStr);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  function stableHash(n) {
    let x = Number(n || 0) || 0;
    x = ((x << 5) - x) + 1337;
    x |= 0;
    return Math.abs(x);
  }

  function pickStableBg(userId) {
    const idx = stableHash(userId) % BG_LIST.length;
    return BG_LIST[idx];
  }

  function fmtJoined(dateStr) {
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return "Joined: -";
      const nice = d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "2-digit" });
      return `Joined: ${nice}`;
    } catch {
      return "Joined: -";
    }
  }

  function fmtVisits(n) {
    const v = Number(n || 0);
    if (!Number.isFinite(v) || v < 0) return "Visits: 0";
    return `Visits: ${v}`;
  }

  function pct(maxed, total) {
    const t = Number(total || 0);
    const m = Number(maxed || 0);
    if (!t) return 0;
    return Math.max(0, Math.min(100, Math.round((m / t) * 100)));
  }

  async function fetchJson(url) {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      credentials: "include",
    });

    if (!res.ok) {
      let msg = "";
      try {
        const out = await res.json();
        msg = out?.error || out?.message || "";
      } catch {}
      const err = new Error(msg || `Request failed (${res.status})`);
      err.status = res.status;
      throw err;
    }

    return res.json();
  }

  function countObjKeys(o) {
    try { return Object.keys(o || {}).length; } catch { return 0; }
  }

  // ---------- API ----------
  async function fetchMember(userId) {
    try {
      return await fetchJson(apiPath(`/api/members/${encodeURIComponent(String(userId))}`));
    } catch (e) {
      if (e && e.status !== 404) throw e;
    }

    // fallback list
    const list = await fetchJson(apiPath(`/api/members?page=1&pageSize=2000`));
    const items = Array.isArray(list?.items) ? list.items : Array.isArray(list) ? list : [];
    const found = items.find((x) => String(x?.id) === String(userId));

    if (!found) throw new Error("User not found.");
    return { user: found };
  }

  async function fetchMemberCollections(userId) {
    return await fetchJson(apiPath(`/api/data?user=${encodeURIComponent(String(userId))}`));
  }

  async function computeProgressFromCollections(cols) {
    // ---------- helpers local ----------
    function toNameList(list) {
      if (!Array.isArray(list)) return [];
      return list
        .map((x) =>
          x && x.name ? String(x.name)
          : x && x.title ? String(x.title)
          : x && x.id ? String(x.id)
          : null
        )
        .filter(Boolean);
    }

    function normName(s) {
      return String(s || "")
        .trim()
        .toLowerCase()
        .replaceAll("’", "'")
        .replaceAll("“", '"')
        .replaceAll("”", '"')
        .replace(/\s+/g, " ");
    }

    function safeKeys(o) {
      try { return Object.keys(o || {}); } catch { return []; }
    }

    function countTrackedIntersection(listNames, trackedObj) {
      const list = Array.isArray(listNames) ? listNames : [];
      const keys = safeKeys(trackedObj);

      if (!list.length || !keys.length) return 0;

      const want = new Set(list.map(normName));
      let c = 0;

      for (const k of keys) {
        if (want.has(normName(k))) c++;
      }
      return c;
    }

    async function fetchList(path) {
      const out = await fetchJson(apiPath(path)).catch(() => []);
      if (Array.isArray(out)) return out;
      if (Array.isArray(out?.items)) return out.items;
      return [];
    }

    // ---------- load lists ----------
    const [huntersList, hunterWeaponsList, sjwWeaponsList, shadowsList, successorsList, blessingsData] = await Promise.all([
      fetchList("/api/public/hunters"),
      fetchList("/api/public/hunter-weapons"),
      fetchList("/api/public/sung-weapons"),
      fetchList("/api/public/shadows"),
      fetchList("/api/public/successors"),
      fetchJson(apiPath("/api/blessing-stones")).catch(() => null),
    ]);

    const huntersNames = toNameList(huntersList);
    const hwNames = toNameList(hunterWeaponsList);
    const sjwNames = toNameList(sjwWeaponsList);
    const shadowsNames = toNameList(shadowsList);
    const successorsNames = toNameList(successorsList);

    const totalHunters = huntersNames.length || 0;
    const totalHW = hwNames.length || 0;
    const totalSJW = sjwNames.length || 0;
    const totalShadows = shadowsNames.length || 0;
    const totalSuccessors = successorsNames.length || 0;

    // ✅ tracked = intersection z listą z JSON (żeby nie było złych nazw)
    const trackedHunters = countTrackedIntersection(huntersNames, cols?.hunters);
    const trackedHW = countTrackedIntersection(hwNames, cols?.hunterWeapons);
    const trackedSJW = countTrackedIntersection(sjwNames, cols?.sungWeapons);
    const trackedShadows = countTrackedIntersection(shadowsNames, cols?.shadows);
    const trackedSuccessors = countTrackedIntersection(successorsNames, cols?.successors);

    const blessingGlobal = blessingsData?.global || {};
    const blessingList = [
      ...(Array.isArray(blessingGlobal.empowerment) ? blessingGlobal.empowerment : []),
      ...(Array.isArray(blessingGlobal.survival) ? blessingGlobal.survival : []),
    ];
    const totalBlessings = blessingList.length || 0;

    const blessingMap = (cols && typeof cols.blessings === "object" && cols.blessings)
      ? cols.blessings
      : {};

    const trackedBlessings = Object.values(blessingMap).filter(
      (v) => String(v || "").trim() !== "Do not own"
    ).length;

    return {
      hunters: { maxed: trackedHunters, total: totalHunters },
      weapons: { maxed: trackedHW + trackedSJW, total: totalHW + totalSJW },
      runes: { maxed: 0, total: 0 },
      blessing: { maxed: trackedBlessings, total: totalBlessings },
      shadows: { maxed: trackedShadows, total: totalShadows },
      successors: { maxed: trackedSuccessors, total: totalSuccessors },
    };
  }

  function fireUniqueVisit(userId) {
    try {
      fetch(apiPath(`/api/visit/${encodeURIComponent(String(userId))}`), {
        method: "POST",
        credentials: "include",
        headers: { Accept: "application/json" },
      }).catch(() => {});
    } catch {}
  }

  // ---------- CSS ----------
  function ensureCss() {
    if (document.getElementById("slaUserCss")) return;

    const style = document.createElement("style");
    style.id = "slaUserCss";
    style.textContent = `
      .sla-user-wrap{ width:100%; display:flex; flex-direction:column; gap:16px; }

      .sla-back-row{ display:flex; justify-content:flex-start; }
      .sla-back-btn{
        height:40px; padding:0 14px; border-radius:14px;
        border:1px solid rgba(148,163,184,.28);
        background: rgba(15,23,42,.55);
        color: rgba(226,232,240,.95);
        font-weight:800;
        display:inline-flex; align-items:center; gap:10px;
        transition: transform .15s ease, background .15s ease, border-color .15s ease, box-shadow .15s ease;
        outline: none;
      }
      .sla-back-btn:hover{
        background: rgba(255,255,255,.10);
        border-color: rgba(148,163,184,.38);
        color: rgba(255,255,255,.98);
        transform: translateY(-1px);
      }
      .sla-back-btn:focus-visible{
        box-shadow: 0 0 0 3px rgba(250,204,21,.35);
        border-color: rgba(250,204,21,.55);
      }

      .sla-user-hero{
        border-radius: 18px;
        overflow:hidden;
        border: 1px solid rgba(148,163,184,.18);
        background: rgba(2,6,23,.55);
        box-shadow: 0 18px 60px rgba(0,0,0,.35);
        position: relative;
      }

      .sla-user-cover{
        height: clamp(170px, 20vw, 290px);
        background-size: cover;
        background-position: center center;
        position:relative;
        z-index: 0;
      }
      .sla-user-cover:after{
        content:"";
        position:absolute;
        inset:0;
        background:
          linear-gradient(180deg, rgba(2,6,23,.15) 0%, rgba(2,6,23,.85) 85%),
          radial-gradient(60% 80% at 50% 0%, rgba(250,204,21,.20) 0%, rgba(2,6,23,0) 60%);
        z-index: 1;
        pointer-events: none;
      }

      .sla-user-top{
        padding: 0 14px 18px 14px;
        margin-top: -42px;
        display:flex;
        justify-content:center;
        position: relative;
        z-index: 2;
      }

      .sla-avatar{
        width:78px;
        height:78px;
        border-radius:999px;
        object-fit:cover;
        border: 3px solid rgba(2,6,23,.9);
        box-shadow: 0 10px 25px rgba(0,0,0,.35);
        background: rgba(15,23,42,.9);
        position: relative;
        z-index: 3;
      }

      .sla-user-name{
        font-weight: 950;
        letter-spacing: .06em;
        color: rgba(226,232,240,.98);
        text-transform: uppercase;
        font-size: 26px;
        text-shadow: 0 8px 22px rgba(0,0,0,.35);
        text-align:center;
      }

      .sla-badge{
        display:inline-flex;
        align-items:center;
        justify-content:center;
        padding: 5px 12px;
        border-radius: 999px;
        font-weight: 900;
        font-size: 12px;
        color: rgba(15,23,42,.95);
        background: rgba(250,204,21,.92);
        border: 1px solid rgba(250,204,21,.65);
      }

      .sla-user-joined{
        font-size: 13px;
        font-weight: 700;
        color: rgba(226,232,240,.80);
        text-align:center;
      }
      .sla-user-visits{
        font-size: 13px;
        font-weight: 800;
        color: rgba(226,232,240,.75);
        text-align:center;
        margin-top: -2px;
      }

      .sla-stats-grid{
        display:grid;
        grid-template-columns: repeat(6, minmax(0, 1fr));
        gap: 12px;
      }
      @media (max-width: 1200px){ .sla-stats-grid{ grid-template-columns: repeat(3, minmax(0, 1fr)); } }
      @media (max-width: 640px){
        .sla-user-cover{ height: clamp(150px, 34vw, 220px); }
        .sla-avatar{ width:70px; height:70px; }
        .sla-user-name{ font-size: 20px; }
        .sla-stats-grid{ grid-template-columns: repeat(2, minmax(0, 1fr)); }
      }

      .sla-stat-card{
        border-radius: 16px;
        border: 1px solid rgba(148,163,184,.18);
        background: rgba(15,23,42,.55);
        overflow:hidden;
        transition: transform .18s ease, background .18s ease, border-color .18s ease, box-shadow .18s ease;
        cursor:pointer;
      }
      .sla-stat-card:hover{
        transform: translateY(-2px);
        background: rgba(15,23,42,.70);
        border-color: rgba(148,163,184,.28);
        box-shadow: 0 14px 32px rgba(0,0,0,.30);
      }

      .sla-stat-inner{
        padding: 18px 14px 16px 14px;
        display:flex;
        flex-direction:column;
        align-items:center;
        text-align:center;
        gap: 10px;
        min-height: 170px;
      }

      .sla-stat-iconTop{ width: 100%; display:flex; justify-content:center; align-items:center; margin-top: 2px; }
      .sla-stat-iconTop img{
        width: 72px; height: 72px; object-fit: contain;
        filter: drop-shadow(0 10px 20px rgba(0,0,0,.35));
        opacity: .98;
      }

      .sla-stat-title{ font-weight: 950; font-size: 14px; color: rgba(250,204,21,.95); letter-spacing:.02em; margin-top: -2px; }

      .sla-stat-pill{
        display:inline-flex; align-items:center; justify-content:center;
        padding: 5px 12px; border-radius: 999px;
        font-weight: 950; font-size: 12px;
        color: rgba(226,232,240,.92);
        background: rgba(15,23,42,.55);
        border: 1px solid rgba(148,163,184,.22);
      }

      .sla-progress{
        width:100%; height: 9px; border-radius: 999px; overflow:hidden;
        background: rgba(226,232,240,.10);
        border: 1px solid rgba(148,163,184,.16);
      }
      .sla-progress > div{
        height:100%;
        background: linear-gradient(90deg, rgba(34,197,94,.85), rgba(250,204,21,.95));
        border-radius:999px;
      }

      .sla-stat-bottom{
        margin-top:auto;
        display:flex; align-items:center; justify-content:center; gap: 8px;
        font-size: 12px; font-weight: 800;
        color: rgba(226,232,240,.70);
        opacity: .9;
      }

      .sla-user-loading, .sla-user-error{
        width:100%;
        border-radius: 16px;
        padding: 18px;
        border: 1px solid rgba(148,163,184,.18);
        background: rgba(15,23,42,.55);
        color: rgba(226,232,240,.92);
      }
    `;
    document.head.appendChild(style);
  }

  function renderLoading(root) {
    root.innerHTML = `
      <div class="sla-user-loading">
        <div style="font-weight:900; font-size:16px;">Loading profile…</div>
        <div style="opacity:.75; margin-top:6px;">Please wait a moment.</div>
      </div>
    `;
  }

  function renderError(root, msg) {
    root.innerHTML = `
      <div class="sla-user-error">
        <div style="font-weight:900; font-size:16px;">Profile not available</div>
        <div style="opacity:.8; margin-top:6px;">${escapeHtml(safeText(msg, "Unknown error"))}</div>
      </div>
    `;
  }

  function buildCard(item, prog = {}) {
    const maxed = Number(prog.maxed || 0);
    const total = Number(prog.total || 0);

    const p = pct(maxed, total);
    const isMax = total > 0 && maxed >= total;

    const card = window.el("div", { class: "sla-stat-card" });
    const inner = window.el("div", { class: "sla-stat-inner" });

    const iconTop = window.el(
      "div",
      { class: "sla-stat-iconTop" },
      window.el("img", { src: item.icon, alt: "" })
    );

    const title = window.el("div", { class: "sla-stat-title" }, item.title);
    const pill = window.el("div", { class: "sla-stat-pill" }, `${maxed}/${total}`);

    const bar = window.el(
      "div",
      { class: "sla-progress" },
      window.el("div", { style: { width: `${p}%` } })
    );

    const bottomText = isMax ? "Maxed out" : "Tap to view details";
    const bottom = window.el(
      "div",
      { class: "sla-stat-bottom" },
      window.el("i", { class: "fa-solid fa-hand-pointer", style: { fontSize: "12px", opacity: ".85" } }),
      window.el("span", {}, bottomText)
    );

    inner.append(iconTop, title, pill, bar, bottom);
    card.append(inner);

    card.addEventListener("click", () => {
      try { window.showToast?.(`${item.title} details — coming soon`); } catch {}
    });

    return card;
  }

  function renderProfile(root, userId, data) {
    const user = data?.user || data;

    const name = safeText(user?.displayName || user?.username, "Unknown");
    const role = safeText(user?.role, "Hunter");
    const avatar = safeText(user?.avatar, "");
    const joined = fmtJoined(user?.createdAt);
    const visitsText = fmtVisits(user?.visits);

    const progress = data?.progress || user?.progress || {};
    const bg = pickStableBg(userId);

    const wrap = window.el("div", { class: "sla-user-wrap" });

    const backRow = window.el("div", { class: "sla-back-row" });
    const backBtn = window.el(
      "button",
      {
        type: "button",
        class: "sla-back-btn",
        onclick: () => {
          if (typeof window.routeTo === "function") window.routeTo("/members");
          else window.location.href = apiPath("/members");
        },
      },
      window.el("i", { class: "fa-solid fa-arrow-left" }),
      window.el("span", {}, "Back to Members")
    );
    backRow.append(backBtn);

    const hero = window.el("div", { class: "sla-user-hero" });
    const cover = window.el("div", {
      class: "sla-user-cover",
      style: { backgroundImage: `url('${bg}')` },
    });

    const top = window.el("div", { class: "sla-user-top" });
    const center = window.el("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
        gap: "8px",
      },
    });

    const avatarEl = avatar
      ? window.el("img", { class: "sla-avatar", src: avatar, alt: "" })
      : window.el(
          "div",
          {
            class: "sla-avatar",
            style: {
              display: "grid",
              placeItems: "center",
              color: "rgba(226,232,240,.9)",
              fontWeight: "900",
            },
          },
          "👤"
        );

    const nameEl = window.el("div", { class: "sla-user-name" }, name);
    const badge = window.el("div", { class: "sla-badge" }, role);
    const joinedEl = window.el("div", { class: "sla-user-joined" }, joined);
    const visitsEl = window.el("div", { class: "sla-user-visits" }, visitsText);

    center.append(avatarEl, nameEl, badge, joinedEl, visitsEl);
    top.append(center);

    hero.append(cover, top);

    const grid = window.el("div", { class: "sla-stats-grid" });
    for (const item of STATS) {
      const prog = progress?.[item.key] || { maxed: 0, total: 0 };
      grid.append(buildCard(item, prog));
    }

    wrap.append(backRow, hero, grid);
    root.innerHTML = "";
    root.append(wrap);
  }

  async function mount(pathname) {
    ensureGlobals();
    ensureCss();

    const content = document.getElementById("content");
    if (!content) return;

    const userId = getIdFromPath(pathname);
    if (!userId) {
      renderError(content, "Invalid user id.");
      return;
    }

    try { window.uiLoading?.show?.("Loading profile…"); } catch {}

    renderLoading(content);

    try {
      const memberData = await fetchMember(userId);

      // ✅ unique visit
      fireUniqueVisit(userId);

      const cols = await fetchMemberCollections(userId);
      const progress = await computeProgressFromCollections(cols);

      renderProfile(content, userId, { ...memberData, progress });
    } catch (e) {
      console.error(e);
      renderError(content, e?.message || "Failed to load profile.");
    } finally {
      try { window.uiLoading?.hide?.(); } catch {}
    }
  }

  window.__user_mount = function __user_mount(cleanPath) {
    mount(cleanPath || location.pathname || "/").catch(() => {});
  };
})();
