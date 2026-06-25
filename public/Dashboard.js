/* /public/js/dashboard.js */
// Mount: window.__dashboard_mount()
(function () {
  // ---------------- BASE PATH + URL (same as other modules) ----------------
  function basePath() {
    const p = location.pathname || "";
    return p === "/slahub" || p.startsWith("/slahub/") ? "/slahub" : "";
  }

  function urlLocal(p) {
    const b = basePath();
    const path = String(p || "");
    if (!path) return b || "";
    if (path.startsWith("http://") || path.startsWith("https://")) return path;
    if (path.startsWith(b + "/")) return path; // already prefixed
    if (path.startsWith("/")) return `${b}${path}`;
    return `${b}/${path}`;
  }

  const url = window.url ? window.url : urlLocal;

  // ensure STATE global
  window.STATE = window.STATE || {};

  // Icons (Cloudinary)
  const ICONS = Object.freeze({
    hunters:
      "/picture/Menu/Icon/Icon_Hunter_White.png",
    hunterWeapons:
      "/picture/Menu/Icon/Icon_CostumeWeaponHunter.png",
    sjwWeapons:
      "/picture/Menu/Icon/Icon_CostumeWeaponSJW.png",
    skills:
      "/picture/Menu/Icon/Icon_InventoryList_SkillRune.png",
    blessings:
      "/picture/Menu/Icon/Icon_InventoryList_BlessingStone.png",
    shadows:
      "/picture/Menu/Icon/Icon_QuickMenu_Shadow.png",
    successors:
      "/picture/Menu/Icon/Icon_Successor.png",
  });

  const VERIFIED_GIF =
    "/picture/PageTop.webp";

  // ---------------- helpers ----------------
  function safeKeys(o) {
    try {
      return Object.keys(o || {});
    } catch {
      return [];
    }
  }

  function toNameList(list) {
    if (!Array.isArray(list)) return [];
    return list
      .map((x) =>
        x && x.name
          ? String(x.name)
          : x && x.title
          ? String(x.title)
          : x && x.id
          ? String(x.id)
          : null
      )
      .filter(Boolean);
  }

  async function loadJsonList(path) {
    try {
      const r = await fetch(url(path), { cache: "no-store" });
      if (!r.ok) return null;
      const out = await r.json();
      if (Array.isArray(out)) return out;
      if (Array.isArray(out?.items)) return out.items;
      return null;
    } catch {
      return null;
    }
  }

  function pillText(tracked, total) {
    if (tracked == null || total == null) return "?";
    return `${tracked}/${total}`;
  }

  // normalize names so small differences don't break matching
  function normName(s) {
    return String(s || "")
      .trim()
      .toLowerCase()
      .replaceAll("’", "'")
      .replaceAll("“", '"')
      .replaceAll("”", '"')
      .replace(/\s+/g, " ");
  }

  // count only items that exist in the JSON list
  function countTrackedIntersection(listNames, trackedObj) {
    const list = Array.isArray(listNames) ? listNames : [];
    const haveKeys = safeKeys(trackedObj);

    if (!list.length) return 0;
    if (!haveKeys.length) return 0;

    const want = new Set(list.map(normName));
    let c = 0;

    for (const k of haveKeys) {
      const nk = normName(k);
      if (want.has(nk)) c++;
    }
    return c;
  }

  // Convert discord avatar hash -> full URL
  function discordAvatarUrl(discordId, avatar) {
    if (!avatar) return "";
    if (typeof avatar === "string" && avatar.startsWith("http")) return avatar;
    if (!discordId) return "";
    return `https://cdn.discordapp.com/avatars/${discordId}/${avatar}.png?size=128`;
  }

  // Plain left click detector (allow middle click / ctrl click etc.)
  function isPlainLeftClick(e) {
    return e && e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey;
  }

  // ---------------- API / STATE ----------------
  async function ensureMeLoaded() {
    try {
      if (window.STATE?.me !== undefined) return window.STATE.me;

      const r = await fetch(url("/api/me"), {
        cache: "no-store",
        credentials: "include",
      });

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

  // FIX: don't treat {} as loaded cache
  async function ensureDataLoaded() {
    try {
      if (window.STATE?.data && Object.keys(window.STATE.data).length > 0) {
        return window.STATE.data;
      }

      const r = await fetch(url("/api/data"), {
        cache: "no-store",
        credentials: "include",
      });

      if (!r.ok) {
        window.STATE.data = {};
        return window.STATE.data;
      }

      const data = await r.json().catch(() => ({}));
      window.STATE.data = data || {};
      return window.STATE.data;
    } catch {
      window.STATE.data = {};
      return window.STATE.data;
    }
  }

  // --- API: save settings (displayName + visibility) ---
  async function saveSettings({ displayName, visibility }) {
    const toast = window.showToast || ((m) => console.log(m));
    try {
      const resp = await fetch(url("/api/settings"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ displayName, visibility }),
      });

      const out = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        toast(out.error || "Save failed");
        return { ok: false };
      }

      window.STATE.me = out.user || window.STATE.me;

      try {
        await window.renderAuth?.();
      } catch {}

      toast("Settings saved");
      return { ok: true, user: out.user };
    } catch {
      toast("Network error");
      return { ok: false };
    }
  }

  // ---------------- UI helpers ----------------
  function trackingRow({ iconUrl, label, value, key }) {
    const row = window.el("div", { class: "flex items-center justify-between py-2" });

    const left = window.el("div", { class: "flex items-center gap-3 min-w-0" });
    left.append(
      window.el("img", { src: iconUrl || VERIFIED_GIF, class: "w-7 h-7 object-contain shrink-0" }),
      window.el("div", { class: "font-semibold truncate" }, label)
    );

    const pill = window.el(
      "span",
      {
        class:
          "inline-flex items-center justify-center min-w-[84px] sm:min-w-[92px] px-3 py-1 rounded-lg text-sm font-extrabold " +
          "bg-[rgb(15_23_42_/_0.4)] text-slate-100 border border-slate-700",
        "data-track": key || ""
      },
      value
    );

    row.append(left, pill);
    return row;
  }

  function fieldLabel(text) {
    return window.el("div", { class: "text-sm font-bold text-slate-300 mb-1" }, text);
  }

  function inputBase(value, { disabled = false } = {}) {
    return window.el("input", {
      value: value ?? "",
      disabled,
      class:
        "w-full px-3 py-2 rounded-xl border outline-none " +
        "bg-[rgb(24_34_52)] text-white border-slate-200 text-white " +
        "dark:bg-slate-900/40 dark:border-slate-700 dark:text-slate-100 " +
        (disabled ? "opacity-80" : "focus:ring-2 focus:ring-yellow-400/50"),
    });
  }

  function makeToggle(initialOn) {
    const btn = window.el("button", {
      type: "button",
      class:
        "relative inline-flex h-6 w-11 items-center rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400/50 " +
        (initialOn ? "bg-yellow-400" : "bg-[rgb(15_23_42_/_0.4)] border border-slate-700"),
    });

    const dot = window.el("span", {
      class:
        "inline-block h-5 w-5 transform rounded-full bg-white transition " +
        (initialOn ? "translate-x-5" : "translate-x-1"),
    });

    btn.append(dot);

    const api = {
      get value() {
        return btn.dataset.on === "1";
      },
      set value(v) {
        const on = !!v;
        btn.dataset.on = on ? "1" : "0";
        btn.className =
          "relative inline-flex h-6 w-11 items-center rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400/50 " +
          (on ? "bg-yellow-400" : "bg-[rgb(15_23_42_/_0.4)] border border-slate-700");
        dot.className =
          "inline-block h-5 w-5 transform rounded-full bg-white transition " +
          (on ? "translate-x-5" : "translate-x-1");
      },
      node: btn,
    };

    api.value = !!initialOn;
    btn.addEventListener("click", () => {
      api.value = !api.value;
    });

    return api;
  }

  // ---------------- counting ----------------
  async function computeCounts() {
    const data = await ensureDataLoaded();

    const [huntersList, hunterWeaponsList, sjwWeaponsList, shadowsList, successorsList, blessingsData] = await Promise.all([
      loadJsonList("/api/public/hunters"),
      loadJsonList("/api/public/hunter-weapons"),
      loadJsonList("/api/public/sung-weapons"),
      loadJsonList("/api/public/shadows"),
      loadJsonList("/api/public/successors"),
      fetch(url("/api/blessing-stones"), { cache: "no-store", credentials: "include" })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    ]);

    const huntersNames = toNameList(huntersList);
    const hwNames = toNameList(hunterWeaponsList);
    const sjwNames = toNameList(sjwWeaponsList);
    const shadowsNames = toNameList(shadowsList);
    const successorsNames = toNameList(successorsList);

    const blessingGlobal = blessingsData?.global || {};
    const blessingList = [
      ...(Array.isArray(blessingGlobal.empowerment) ? blessingGlobal.empowerment : []),
      ...(Array.isArray(blessingGlobal.survival) ? blessingGlobal.survival : []),
    ];
    const blessingTotal = blessingList.length || 0;

    const myRarities =
      blessingsData && typeof blessingsData.myRarities === "object" && blessingsData.myRarities
        ? blessingsData.myRarities
        : {};

    const blessingTracked = Object.values(myRarities).filter(
      (v) => String(v || "").trim() !== "Do not own"
    ).length;

    const totals = {
      hunters: huntersNames.length || null,
      hunterWeapons: hwNames.length || null,
      sjwWeapons: sjwNames.length || null,
      blessings: blessingTotal || null,
      shadows: shadowsNames.length || null,
      successors: successorsNames.length || null,
    };

    const tracked = {
      hunters: countTrackedIntersection(huntersNames, data.hunters),
      hunterWeapons: countTrackedIntersection(hwNames, data.hunterWeapons),
      sjwWeapons: countTrackedIntersection(sjwNames, data.sungWeapons),
      blessings: blessingTracked,
      shadows: countTrackedIntersection(shadowsNames, data.shadows),
      successors: countTrackedIntersection(successorsNames, data.successors),
    };

    return { totals, tracked };
  }

  // ---------------- render ----------------
  async function renderDashboard() {
    const content = document.getElementById("content");
    if (!content) return;

    content.innerHTML = "";

    const me = await ensureMeLoaded();

    if (!me) {
      const card = window.el("div", {
        class:
          "bg-slate-800 border border-slate-700 rounded-2xl p-6 text-center shadow-sm",
      });
      card.append(window.el("div", { class: "text-xl font-bold mb-1" }, "My Dashboard"));
      card.append(
        window.el("div", { class: "text-slate-300/90" }, "Login to access your dashboard.")
      );
      content.append(card);
      return;
    }

    const headerRow = window.el("div", {
      class: "flex flex-col md:flex-row md:items-start md:justify-between gap-3 mb-4",
    });

    const headerLeft = window.el("div", { class: "flex-1 min-w-0" });
    headerLeft.append(
      window.el("div", { class: "text-4xl md:text-5xl font-extrabold tracking-tight text-yellow-400" }, "My Dashboard"),
      window.el("div", { class: "mt-1 text-slate-300/90" }, "View your profile and tracking progress")
    );

    // Use <a href> so middle-click opens new tab
    const communityBtn = window.el("a", {
      href: url("/members"),
      class:
        "w-full md:w-auto mt-2 md:mt-0 inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl border " +
        "bg-[rgb(15_23_42_/_0.4)] hover:bg-slate-800 border-slate-700 text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400/50",
    });

    communityBtn.append(
      window.el("i", { class: "fa-regular fa-eye" }),
      window.el("span", { class: "text-sm font-semibold" }, "View Community Page")
    );

    // SPA only on plain left click
    communityBtn.addEventListener("click", async (e) => {
      if (!isPlainLeftClick(e)) return; // allow middle click / ctrl click etc.
      e.preventDefault();

      // close drawer if needed (optional)
      try {
        if (window.isMobile?.() && window.state?.mobileOpen) {
          window.state.mobileOpen = false;
          window.applyLayout?.();
        }
      } catch {}

      try {
        await window.routeTo?.("/members");
      } catch {}
    });

    headerRow.append(headerLeft, communityBtn);

    const grid = window.el("div", { class: "grid grid-cols-1 lg:grid-cols-3 gap-4" });

    // LEFT CARD
    const leftCard = window.el("div", {
      class:
        "bg-slate-800 border border-slate-700 rounded-2xl shadow-sm p-5",
    });

    const avatarWrap = window.el("div", { class: "flex flex-col items-center text-center text-slate-100" });

    const avatarUrl = discordAvatarUrl(me.discordId, me.avatar) || me.avatarURL || me.image || "";
    const avatar = avatarUrl
      ? window.el("img", {
          src: avatarUrl,
          class: "w-28 h-28 rounded-full object-cover ring-4 ring-slate-900/20 dark:ring-slate-200/10",
        })
      : window.el(
          "div",
          { class: "w-28 h-28 rounded-full bg-slate-700 grid place-items-center text-3xl text-slate-100" },
          "👤"
        );

    const display = me.displayName || me.username || "User";

    const badge = window.el(
      "span",
      {
        class:
          "mt-2 inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold " +
          "bg-slate-900 text-white bg-yellow-400/15 text-yellow-300 border border-yellow-400/25",
      },
      "Hunter"
    );

    avatarWrap.append(avatar, window.el("div", { class: "mt-3 text-2xl font-extrabold" }, display), badge);

    const divider = window.el("div", { class: "my-5 h-px bg-slate-700" });
    const trackingTitle = window.el(
      "div",
      { class: "text-sm font-bold text-slate-300" },
      "Currently Tracking:"
    );

    const list = window.el("div", { class: "mt-3" });

    list.append(
      trackingRow({ key: "hunters", iconUrl: ICONS.hunters, label: "Hunters", value: "Loading…" }),
      trackingRow({ key: "hunterWeapons", iconUrl: ICONS.hunterWeapons, label: "Hunters - Weapons", value: "Loading…" }),
      trackingRow({ key: "sjwWeapons", iconUrl: ICONS.sjwWeapons, label: "Sung Jinwoo - Weapons", value: "Loading…" }),
      trackingRow({ key: "skills", iconUrl: ICONS.skills, label: "Skills", value: "?" }),
      trackingRow({ key: "blessings", iconUrl: ICONS.blessings, label: "Blessings", value: "Loading…" }),
      trackingRow({ key: "shadows", iconUrl: ICONS.shadows, label: "Shadows", value: "Loading…" }),
      trackingRow({ key: "successors", iconUrl: ICONS.successors, label: "Successor", value: "Loading…" })
    );

    leftCard.append(avatarWrap, divider, trackingTitle, list);

    // RIGHT CARD
    const rightCard = window.el("div", {
      class:
        "lg:col-span-2 bg-slate-800 border border-slate-700 rounded-2xl shadow-sm p-5",
    });

    const infoHead = window.el("div", { class: "flex items-center gap-3 mb-5" });
    infoHead.append(
      window.el("div", { class: "h-8 w-1 rounded-full bg-yellow-400/90" }),
      window.el(
        "div",
        { class: "inline-flex items-center gap-2 font-extrabold text-lg" },
        window.el("i", { class: "fa-solid fa-circle-info text-slate-400" }),
        "Information"
      )
    );

    const form = window.el("div", { class: "grid gap-4" });

    const rowName = window.el("div");
    rowName.append(fieldLabel("Name"), inputBase(me.username || "", { disabled: true }));

    const rowNick = window.el("div");
    rowNick.append(fieldLabel("Nickname"));

    const nickWrap = window.el("div", { class: "flex flex-col sm:flex-row gap-2" });

    const nickInput = inputBase(me.displayName || "", { disabled: false });
    nickInput.placeholder = "Set your nickname…";

    const saveBtn = window.el(
      "button",
      {
        type: "button",
        class:
          "px-4 py-2 rounded-xl font-extrabold text-black bg-yellow-400 hover:bg-yellow-300 " +
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400/50 disabled:opacity-60 disabled:cursor-not-allowed",
      },
      "Save"
    );

    nickWrap.append(nickInput, saveBtn);

    const nickHint = window.el(
      "div",
      { class: "text-xs text-slate-300/90 mt-1" },
      `Currently displaying as: ${display}`
    );

    rowNick.append(nickWrap, nickHint);

    const rowEmail = window.el("div");
    rowEmail.append(fieldLabel("Email"), inputBase(me.email || "-", { disabled: true }));

    const rowDiscord = window.el("div");
    rowDiscord.append(fieldLabel("Discord ID"), inputBase(String(me.discordId || "-"), { disabled: true }));

    const rowPublic = window.el("div", { class: "flex items-center justify-between" });
    rowPublic.append(fieldLabel("Public Profile"));

    const isPublic = (me.visibility || "public") === "public";
    const toggle = makeToggle(isPublic);
    rowPublic.append(toggle.node);

    saveBtn.addEventListener("click", async () => {
      saveBtn.disabled = true;
      try {
        const visibility = toggle.value ? "public" : "private";
        const res = await saveSettings({ displayName: nickInput.value, visibility });
        if (res.ok) {
          await renderDashboard();
        }
      } finally {
        saveBtn.disabled = false;
      }
    });

    form.append(rowName, rowNick, rowEmail, rowDiscord, rowPublic);
    rightCard.append(infoHead, form);

    grid.append(leftCard, rightCard);
    content.append(headerRow, grid);

    // --- async update counts ---
    try {
      const { totals, tracked } = await computeCounts();

      const pillHunters = list.querySelector('[data-track="hunters"]');
      const pillHW = list.querySelector('[data-track="hunterWeapons"]');
      const pillSJW = list.querySelector('[data-track="sjwWeapons"]');
      const pillBlessings = list.querySelector('[data-track="blessings"]');
      const pillShadows = list.querySelector('[data-track="shadows"]');
      const pillSuccessors = list.querySelector('[data-track="successors"]');

      if (pillHunters) pillHunters.textContent = pillText(tracked.hunters, totals.hunters);
      if (pillHW) pillHW.textContent = pillText(tracked.hunterWeapons, totals.hunterWeapons);
      if (pillSJW) pillSJW.textContent = pillText(tracked.sjwWeapons, totals.sjwWeapons);
      if (pillBlessings) pillBlessings.textContent = pillText(tracked.blessings, totals.blessings);
      if (pillShadows) pillShadows.textContent = pillText(tracked.shadows, totals.shadows);
      if (pillSuccessors) pillSuccessors.textContent = pillText(tracked.successors, totals.successors);
    } catch {
      // keep placeholders
    }
  }

  // Mount like other modules
  window.__dashboard_mount = function __dashboard_mount() {
    try { window.forceDarkMode?.(); } catch {}
    renderDashboard();
  };
})();
