// =====================================
// Imports / Router / Base Config
// #region =====================================
const express = require('express');
const passport = require('passport');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const BASE = process.env.BASE_PATH || '/slahub';

const {
  db,

  getUserById,
  getUserByDiscord,
  getProfile,
  updateProfile,
  ensureProfile,

  getVisits,
  incVisits,

  getCollection,
  setCollection,
  deleteCollection,
  searchUsers,

  getGlobal,
  setGlobal,
  deleteGlobal,
  isDisplayNameTaken,
  listGlobalsByPrefix,
  getGlobalsByPrefix,
  listCollectionsByTypePublic,

  listMembers,
  countMembers,

  makePostSourceUniqueKey,
  normalizePostInput,
  upsertPost,
  upsertPosts,
  getPostBySlug,
  getPostBySourceUniqueKey,
  deletePostBySlug,
  markPostDetailFetchedBySlug,
  setPostPublished,
  listPosts,
  listLatestPosts,
  listPostsMissingDetail,
  getNewestPostsByCategoryKey,
  getPostCounts,
  getPostsMeta,
  setPostsSyncState,
  getPostsSyncState,

  upsertCatalogItem,
  upsertCatalogItems,
  getCatalogItem,
  getCatalogItemBySlug,
  listCatalogItems,
  deleteCatalogItem,
  replaceCatalog,

  upsertCatalogLink,
  listCatalogLinks,
  deleteCatalogLink,
  replaceCatalogLinks
} = require('../db');
// #endregion

// =====================================
// Admin Access / Permissions
// #region =====================================

// Admin list stored in DB (Global key)
const ADMINS_DB_KEY = 'adminsList';

function readAdminEnvList() {
  return String(process.env.ADMINS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

function readAdminDbList() {
  const list = getGlobal(ADMINS_DB_KEY);
  return Array.isArray(list)
    ? list.map(x => String(x || '').trim()).filter(Boolean)
    : [];
}

function getAdminsMerged() {
  return Array.from(new Set([
    ...readAdminEnvList(),
    ...readAdminDbList()
  ]));
}

function isAdminDiscordId(discordId) {
  const did = String(discordId || '').trim();
  if (!did) return false;
  return getAdminsMerged().includes(did);
}

function isAdminReq(req) {
  if (!(req.isAuthenticated && req.isAuthenticated())) return false;
  return isAdminDiscordId(req.user?.discordId);
}

function requireAdmin(req, res, next) {
  if (isAdminReq(req)) return next();
  return res.status(403).json({ error: 'Forbidden' });
}
// #endregion

// =====================================
// Auth / Session Routes
// #region =====================================
router.get('/auth/discord', passport.authenticate('discord'));

router.get(
  '/auth/discord/callback',
  passport.authenticate('discord', { failureRedirect: `${BASE}/?login=failed` }),
  (req, res) => {
    res.redirect(`${BASE}/`);
  }
);

router.post('/logout', (req, res) => {
  req.logout(() => {
    req.session.destroy(() => {
      res.json({ ok: true });
    });
  });
});
// #endregion

// =====================================
// Shared Helpers / File Utils
// #region =====================================
function requireAuth(req, res, next) {
  if (req.isAuthenticated && req.isAuthenticated()) return next();
  return res.status(401).json({ error: 'Not authenticated' });
}

function requireHunterGuessAuth(req, res, next) {
  if (req.isAuthenticated && req.isAuthenticated()) return next();
  return res.status(401).json({ ok: false, error: 'Login required' });
}

// -------------------------------------------------
// File helpers used by media/admin file operations.
// -------------------------------------------------
function ensureDirSync(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function jsonCloneSafe(value, fallback = null) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (_) {
    return fallback;
  }
}
// #endregion

// =====================================
// Best Storage (DB only)
// #region =====================================
// Legacy file fallback removed.
// Remove any remaining file-based best-build logic in other regions after all JSON-based regions are migrated.

const bestKey = (dataset, character, n) => `bestBuild:${dataset}:${character}:top${n}`;
const EMPTY_BEST = { left: ['', '', '', ''], right: ['', '', '', ''], bottom: ['', '', ''] };

function normalizeBestBuild(input) {
  const src = (input && typeof input === 'object') ? input : {};
  return {
    left: Array.isArray(src.left) ? src.left.map(v => String(v ?? '')).slice(0, 4) : ['', '', '', ''],
    right: Array.isArray(src.right) ? src.right.map(v => String(v ?? '')).slice(0, 4) : ['', '', '', ''],
    bottom: Array.isArray(src.bottom) ? src.bottom.map(v => String(v ?? '')).slice(0, 3) : ['', '', '']
  };
}

function writeBestToStore(dataset, character, best1, best2, best3) {
  setGlobal(bestKey(dataset, character, 1), normalizeBestBuild(best1));
  setGlobal(bestKey(dataset, character, 2), normalizeBestBuild(best2));
  setGlobal(bestKey(dataset, character, 3), normalizeBestBuild(best3));
}

function readBestFromStore(dataset, character, n) {
  const inDb = getGlobal(bestKey(dataset, character, n));
  if (!inDb) return EMPTY_BEST;
  return normalizeBestBuild(inDb);
}
// #endregion

// =====================================
// Current User
// #region =====================================
router.get('/api/me', (req, res) => {
  res.set('Cache-Control', 'no-store');

  if (!(req.isAuthenticated && req.isAuthenticated())) {
    return res.json({ user: null });
  }

  const profile = getProfile(req.user.id);

  return res.json({
    user: {
      id: req.user.id,
      discordId: req.user.discordId,
      username: req.user.username,
      avatar: req.user.avatar,
      email: req.user.email || profile?.email || null,
      displayName: profile?.displayName || null,
      visibility: profile?.visibility || 'public'
    }
  });
});
// #endregion

// =====================================
// Feature Flags / Creator Code Allowlist
// #region =====================================
const CREATOR_ALLOW = String(process.env.CREATOR_ALLOW || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

router.get('/api/feature-flags', (req, res) => {
  const allowed =
    (typeof req.isAuthenticated === 'function' && req.isAuthenticated())
      ? CREATOR_ALLOW.includes(String(req.user?.discordId))
      : false;

  return res.json({
    creator: !!allowed,
    url: process.env.CREATOR_URL || '/creator-tool'
  });
});

router.post('/api/admin/creator-code/send', requireAdmin, express.json({ limit: '512kb' }), async (req, res) => {
  res.set('Cache-Control', 'no-store');

  try {
    const codes = Array.isArray(req.body?.codes)
      ? Array.from(new Set(req.body.codes.map(x => String(x || '').trim().toUpperCase()).filter(Boolean)))
      : [];
    const keyWords = String(req.body?.key_words || '').trim();
    const expire = String(req.body?.expire || '').trim();

    if (!codes.length) return res.status(400).json({ ok: false, error: 'No codes detected' });
    if (!keyWords) return res.status(400).json({ ok: false, error: 'Enter Coupon Name' });
    if (!expire) return res.status(400).json({ ok: false, error: 'Enter Redemption Period' });

    const botUrl = String(process.env.CREATOR_BOT_API_URL || 'http://127.0.0.1:8765/creator-code-add').trim();
    const botSecret = String(process.env.CREATOR_BOT_API_SECRET || '').trim();

    if (!botSecret) {
      return res.status(500).json({ ok: false, error: 'CREATOR_BOT_API_SECRET is not configured' });
    }

    const botResp = await fetch(botUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Creator-Secret': botSecret
      },
      body: JSON.stringify({
        codes,
        key_words: keyWords,
        expire
      })
    });

    const text = await botResp.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch (_) {
      data = null;
    }

    if (!botResp.ok) {
      const error = data?.error || data?.message || text || `Bot API error (${botResp.status})`;
      return res.status(botResp.status).json({ ok: false, error });
    }

    return res.json({
      ok: true,
      sent: codes.length,
      bot: data || { ok: true }
    });
  } catch (e) {
    console.error('[creator-code:send] error', e);
    return res.status(500).json({ ok: false, error: e?.message || 'creator_code_send_failed' });
  }
});
// #endregion

// =====================================
// User Search
// #region =====================================
router.get('/api/search', (req, res) => {
  const q = String(req.query.q || '').trim();

  if (!q) {
    return res.json({ results: [] });
  }

  const rows = searchUsers(q); // -> [{id, username, displayName, visibility}]
  return res.json({ results: rows });
});
// #endregion

// =====================================
// User Public Profile
// #region =====================================
router.get('/api/user/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) {
    return res.status(400).json({ error: 'Invalid user id' });
  }

  const user = getUserById(id);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  const profile = getProfile(id);
  const vis = profile?.visibility || 'public';

  const isOwner =
    (req.isAuthenticated && req.isAuthenticated() && Number(req.user?.id) === Number(id));

  if (vis !== 'public' && !isOwner) {
    return res.status(403).json({ error: 'Profile is private' });
  }

  const isAdmin = isAdminDiscordId(user.discordId);

  return res.json({
    user: {
      id: user.id,
      username: user.username,
      displayName: profile?.displayName || null,
      visibility: vis,
      avatar: user.avatar || null,
      discordId: user.discordId || null,
      createdAt: user.createdAt,
      role: isAdmin ? 'Admin' : 'Hunter',
      visits: getVisits(id)
    }
  });
});

// Unique visits per viewer -> target
// Stored as collection for TARGET user: type = "profileVisits"
// Shape: { viewers: { [viewerId]: timestamp } }

const PROFILE_VISITS_TYPE = 'profileVisits';

function pvLoad(targetId) {
  const raw = getCollection(targetId, PROFILE_VISITS_TYPE) || {};
  const viewers = (raw && typeof raw.viewers === 'object' && raw.viewers) ? raw.viewers : {};
  return { viewers };
}

function pvSave(targetId, payload) {
  setCollection(targetId, PROFILE_VISITS_TYPE, payload);
}

router.post('/api/visit/:id', (req, res) => {
  const targetId = Number(req.params.id);
  if (!Number.isFinite(targetId) || targetId <= 0) {
    return res.status(400).json({ error: 'Invalid user id' });
  }

  const targetUser = getUserById(targetId);
  if (!targetUser) {
    return res.status(404).json({ error: 'User not found' });
  }

  const profile = getProfile(targetId);
  const vis = profile?.visibility || 'public';

  const isLogged = (req.isAuthenticated && req.isAuthenticated());
  const viewerId = isLogged ? Number(req.user?.id) : null;

  const isOwner = isLogged && viewerId && viewerId === Number(targetId);

  // prywatny profil: tylko właściciel
  if (vis !== 'public' && !isOwner) {
    return res.status(403).json({ error: 'Profile is private' });
  }

  // jeśli nie jest zalogowany -> nie liczymy
  if (!isLogged || !viewerId) {
    return res.json({ ok: true, visits: getVisits(targetId), counted: false });
  }

  // self visit nie liczy
  if (isOwner) {
    return res.json({ ok: true, visits: getVisits(targetId), counted: false });
  }

  // unique per viewer -> target
  const data = pvLoad(targetId);

  if (data.viewers[String(viewerId)]) {
    return res.json({ ok: true, visits: getVisits(targetId), counted: false });
  }

  data.viewers[String(viewerId)] = Date.now();
  pvSave(targetId, data);

  const visits = incVisits(targetId);
  return res.json({ ok: true, visits, counted: true });
});
// #endregion

// =====================================
// Notices (Global)
// #region =====================================
router.get('/api/notices', (req, res) => {
  return res.json({ sections: getGlobal('noticesSections') || [] });
});

router.post('/api/admin/notices', requireAdmin, (req, res) => {
  const inArr = Array.isArray(req.body?.sections) ? req.body.sections : [];

  const sections = inArr.map((s) => {
    const title = String(s?.title || '').trim();
    const body = String(s?.body || '').trim();

    // normalizacja obrazków: images[] + wsteczna zgodność z image
    const rawImages = Array.isArray(s?.images) ? s.images : [];
    const cleanedImages = rawImages
      .map((u) => String(u || '').trim())
      .filter(Boolean);

    const singleImage = String(s?.image || '').trim();
    const images = cleanedImages.length
      ? cleanedImages
      : (singleImage ? [singleImage] : []);

    return {
      title,
      body,
      ...(images.length <= 1 ? { image: images[0] || '' } : {}),
      images
    };
  });

  setGlobal('noticesSections', sections);
  return res.json({ ok: true, sections });
});

router.post('/api/admin/posts/prefetch-netmarble-details', requireAdmin, async (req, res) => {
  res.set('Cache-Control', 'no-store');

  // dodatkowy sekret (tak jak przy full sync)
  const need = String(process.env.POSTS_FULLSYNC_KEY || '').trim();
  const got = String(
    req.body?.key ||
    req.query?.key ||
    req.headers['x-posts-fullsync-key'] ||
    ''
  ).trim();

  if (need && got !== need) {
    return res.status(403).json({ ok: false, error: 'bad_key' });
  }

  const limit = Math.max(1, Math.min(5000, Number(req.body?.limit ?? 2000) || 2000));
  const delayMs = Math.max(0, Math.min(2000, Number(req.body?.delayMs ?? 120) || 120));

  try {
    const cached = _loadFeedCache();
    const posts = Array.isArray(cached?.posts) ? cached.posts : [];

    const net = posts.filter((p) => String(p?.source || '').toLowerCase() === 'netmarble');
    const missing = net.filter((p) =>
      (!String(p?.contentHtml || '').trim() && !String(p?.contentText || '').trim()) ||
      !String(p?.excerpt || '').trim()
    );

    const todo = missing.slice(0, limit);
    let okCount = 0;
    let failCount = 0;

    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    // map for category lookup (menuSeq -> cat)
    const catMap = new Map(
      (NETMARBLE_POSTS_CFG.categories || []).map((c) => [Number(c.menuSeq), c])
    );

    for (const p of todo) {
      const menuSeq = Number(p?.netmarble?.menuSeq);
      const articleId = Number(p?.netmarble?.articleId);

      if (!menuSeq || !articleId) {
        failCount++;
        continue;
      }

      try {
        const d = await _fetchNmJson(
          _apiUrl(`/article/${articleId}`, { menuSeq, viewFlag: false })
        );

        const cat = catMap.get(menuSeq) || {
          menuSeq,
          categoryKey: p.categoryKey,
          category: p.category
        };

        const full = _normalizeNmDetail(d, p, cat);

        // replace in cache by slug (or by menuSeq/articleId fallback)
        const slug = String(p?.slug || '');
        cached.posts = cached.posts.map((x) => {
          if (slug && String(x?.slug) === slug) return full;

          if (String(x?.source || '').toLowerCase() === 'netmarble') {
            const ms = Number(x?.netmarble?.menuSeq);
            const aid = Number(x?.netmarble?.articleId);
            if (ms === menuSeq && aid === articleId) return full;
          }

          return x;
        });

        okCount++;
      } catch (_) {
        failCount++;
      }

      if (delayMs) await sleep(delayMs);
    }

    cached.meta = cached.meta || {};
    cached.meta.lastEnrichAt = new Date().toISOString();
    _saveFeedCache(cached);

    return res.json({
      ok: true,
      enriched: okCount,
      failed: failCount,
      totalMissingBefore: missing.length,
      processed: todo.length
    });
  } catch (e) {
    console.error('[posts:prefetch-netmarble-details] error', e);
    return res.status(500).json({ ok: false, error: e?.message || 'prefetch_failed' });
  }
});
// #endregion

// =====================================
// User Collections
// #region =====================================
router.get('/api/data', (req, res) => {
  const userParam = req.query.user ? Number(req.query.user) : null;
  let targetId = null;

  if (userParam) {
    const target = getUserById(userParam);
    if (!target) {
      return res.status(404).json({ error: 'User not found' });
    }

    const profile = getProfile(userParam);
    if ((profile?.visibility || 'public') !== 'public') {
      return res.status(403).json({ error: 'Profile is private' });
    }

    targetId = userParam;
  } else {
    if (!(req.isAuthenticated && req.isAuthenticated())) {
      return res.json({
        authenticated: false,
        hunters: {},
        hunterWeapons: {},
        sungWeapons: {},
        builds: {},
        shadows: {},
        successors: {},
        shadowArmyLevel: null,
        huntersProgress: {}
      });
    }

    targetId = req.user.id;
  }

  const types = [
    'hunters',
    'hunterWeapons',
    'sungWeapons',
    'builds',
    'shadows',
    'successors',
    'shadowArmyLevel',
    'blessingStonesRarity_v1'
  ];

  const payload = { authenticated: true };
  for (const t of types) {
    payload[t] = getCollection(targetId, t) || {};
  }

  payload.blessings = payload.blessingStonesRarity_v1 || {};

  // backward/forward compatibility for Hunter.js
  payload.huntersProgress = payload.hunters || {};

  return res.json(payload);
});

router.post('/api/data', requireAuth, (req, res) => {
  const body = req.body || {};

  // support Hunter.js format: { huntersProgress: {...} }
  if (typeof body.huntersProgress !== 'undefined') {
    setCollection(req.user.id, 'hunters', body.huntersProgress || {});
  }

  // existing formats (other pages)
  const types = [
    'hunters',
    'hunterWeapons',
    'sungWeapons',
    'builds',
    'shadows',
    'successors',
    'shadowArmyLevel',
    'blessingStonesRarity_v1'
  ];

  for (const t of types) {
    if (typeof body[t] !== 'undefined') {
      setCollection(req.user.id, t, body[t]);
    }
  }

  return res.json({ ok: true });
});

// =====================================
// Mini Game V1
// #region =====================================
const MINI_GAME_TYPE = 'miniGameV1';

const MINI_GATE = {
  F: { minutes: 1, requiredPower: 500, gold: 300, exp: 80, essence: 25, ticketChance: 0.05 },
  E: { minutes: 1, requiredPower: 1000, gold: 600, exp: 120, essence: 40, ticketChance: 0.08 },
  D: { minutes: 3, requiredPower: 3000, gold: 1200, exp: 260, essence: 80, ticketChance: 0.12 },
  C: { minutes: 10, requiredPower: 8000, gold: 2600, exp: 620, essence: 170, ticketChance: 0.18 },
  B: { minutes: 30, requiredPower: 15000, gold: 5200, exp: 1300, essence: 330, ticketChance: 0.25 },
  A: { minutes: 60, requiredPower: 30000, gold: 11000, exp: 3000, essence: 700, ticketChance: 0.35 },
  S: { minutes: 120, requiredPower: 60000, gold: 24000, exp: 7000, essence: 1500, ticketChance: 0.5 }
};
const MINI_GATE_KIND = {
  blue: { label: 'Blue Gate', mult: 1 },
  purple: { label: 'Purple Gate', mult: 1.5 },
  red: { label: 'Red Gate', mult: 2.5 }
};
const MINI_CONFIG_KEY = 'miniGame:config:v1';

function miniDefaultGateTable() {
  const table = {};
  for (const [kind, kindDef] of Object.entries(MINI_GATE_KIND)) {
    table[kind] = {};
    for (const [rank, def] of Object.entries(MINI_GATE)) {
      table[kind][rank] = {
        minutes: def.minutes,
        requiredPower: Math.floor(def.requiredPower * kindDef.mult),
        gold: Math.floor(def.gold * kindDef.mult),
        exp: 300,
        essence: Math.floor(def.essence * kindDef.mult),
        ticketChance: Math.min(0.95, Number((def.ticketChance * kindDef.mult).toFixed(3)))
      };
    }
  }
  return table;
}

function miniGateTable(raw = null) {
  const defaults = miniDefaultGateTable();
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const hasNested = Object.keys(MINI_GATE_KIND).some(kind => src[kind] && typeof src[kind] === 'object');
  if (!hasNested) {
    const legacy = Object.keys(MINI_GATE).some(rank => src[rank] && typeof src[rank] === 'object') ? src : MINI_GATE;
    const table = {};
    for (const [kind, kindDef] of Object.entries(MINI_GATE_KIND)) {
      table[kind] = {};
      for (const [rank, fallback] of Object.entries(MINI_GATE)) {
        const def = legacy[rank] || fallback;
        table[kind][rank] = {
          minutes: miniFloat(def.minutes, fallback.minutes, 0.1),
          requiredPower: Math.floor(miniNum(def.requiredPower, fallback.requiredPower, 1) * kindDef.mult),
          gold: Math.floor(miniNum(def.gold, fallback.gold, 0) * kindDef.mult),
          exp: miniNum(def.exp, 300, 0),
          essence: Math.floor(miniNum(def.essence, fallback.essence, 0) * kindDef.mult),
          ticketChance: Math.min(0.95, Number((Number(def.ticketChance ?? fallback.ticketChance) * kindDef.mult).toFixed(3)))
        };
      }
    }
    return table;
  }
  const clean = {};
  for (const kind of Object.keys(MINI_GATE_KIND)) {
    clean[kind] = {};
    for (const rank of Object.keys(MINI_GATE)) {
      const fallback = defaults[kind][rank];
      const def = src[kind]?.[rank] || {};
      clean[kind][rank] = {
        minutes: miniFloat(def.minutes, fallback.minutes, 0.1),
        requiredPower: miniNum(def.requiredPower, fallback.requiredPower, 1),
        gold: miniNum(def.gold, fallback.gold, 0),
        exp: miniNum(def.exp, fallback.exp, 0),
        essence: miniNum(def.essence, fallback.essence, 0),
        ticketChance: Math.max(0, Math.min(0.95, Number(def.ticketChance ?? fallback.ticketChance) || 0))
      };
    }
  }
  return clean;
}

function miniDefaultConfig() {
  return {
    start: { gold: 5000, essence: 1000, customTickets: 10, weaponTickets: 10, hunterLevel: 1, weaponLevel: 1 },
    boss: {
      name: 'Boss A',
      hp: 1000000,
      element: 'Dark',
      weakness: ['Light'],
      image: '',
      breakGauge: { enabled: false },
      rotation: [
        { name: 'Boss A', hp: 1000000, element: 'Dark', weakness: ['Light'], image: '', breakGauge: { enabled: false }, rewards: { rows: [] }, killRewards: { rows: [] } },
        { name: 'Boss B', hp: 1200000, element: 'Fire', weakness: ['Water'], image: '', breakGauge: { enabled: false }, rewards: { rows: [] }, killRewards: { rows: [] } },
        { name: 'Boss C', hp: 1400000, element: 'Wind', weakness: ['Fire'], image: '', breakGauge: { enabled: false }, rewards: { rows: [] }, killRewards: { rows: [] } }
      ]
    },
    combat: {
      supportBonusPct: 15,
      supportSameElementBonusPct: 20,
      supportDifferentElementBonusPct: 10,
      breakGaugePenaltyPct: 50,
      breakerTeamBonusVsBreakGaugePct: 20,
      elementalStackerSameElementBonusPct: 20,
      elementalBusterSameElementBonusPct: 30,
      elementAdvantageBonusPct: 50,
      accumulationPerHit: 25,
      burstThreshold: 100,
      burstDamagePct: 100,
      burstDuration: 1,
      busterStoredDamagePct: 20,
      busterRequiresSameElementStacker: true,
      critChancePct: 5,
      critDamagePct: 150
    },
    summon: {
      ssrRate: 1.2,
      srRate: 8.8,
      rRate: 90,
      softPity: 60,
      hardPity: 70,
      softPityIncrease: 5.8
    },
    training: {
      baseExp: 0,
      expPerHour: 900,
      maxTrainingSlots: 6,
      maxTrainingTime: 12,
      expMultiplier: 1
    },
    levels: { maxLevel: 150, expPerLevel: 1000, mode: 'percent', baseExp: 100, growthPct: 50, manual: {}, sungBasePower: 2000, sungPowerPerLevel: 200, sungLevelPower: {} },
    powerGrowth: {
      hunters: { defaultBasePowerBonus: 120, defaultLevelIncrement: 120, defaultAdvancementIncrement: 600, overrides: {} },
      sungWeapons: { defaultBasePowerBonus: 0, defaultLevelIncrement: 100, defaultAdvancementIncrement: 500, overrides: {} }
    },
    sungWeaponUpgradeRequirements: {},
    formulas: {
      power: '((Sung Base Power + (Sung Level - 1) * Sung Power Per Level) + best 2 Sung weapon power) * 2 + top 3 hunter power',
      attack: 'finalDamage = baseDamage + bonuses',
      break: 'breakPenalty = damage * penalty%',
      element: 'elementBonus = damage * advantage%',
      support: 'supportBonus = teamDamage * support%',
      buster: 'busterBonus = burstDamage * stored%'
    },
    elementAdvantage: {
      fireWind: 50,
      windWater: 50,
      waterFire: 50,
      lightDark: 50,
      darkLight: 50
    },
    shopPrices: {
      customTicket: 250,
      weaponTicket: 250,
      trainingSlots: 1200,
      trainingMaxHours: 900,
      trainingExpMultiplier: 1800,
      presetSlots: 1500,
      hunterGateSlots: 1400
    },
    maxShopUpgrades: {
      trainingSlots: 6,
      trainingMaxHours: 12,
      trainingExpMultiplier: 5,
      presetSlots: 10,
      hunterGateSlots: 6
    },
    shopUpgradeSteps: { trainingExpMultiplier: 0.25 },
    expPerLevel: 1000,
    gateRewards: miniDefaultGateTable(),
    worldBossRewards: { gold: 5000, essence: 500, customTickets: 0, weaponTickets: 0, rows: [] },
    items: [
      { id: 'Gold', name: 'Gold', image: '/picture/MiniGame/Currency/Gold.svg', type: 'Currency' },
      { id: 'Essence', name: 'Essence', image: '/picture/MiniGame/Currency/Essence.svg', type: 'Currency' },
      { id: 'Draw Ticket', name: 'Draw Ticket', image: '/picture/MiniGame/Currency/Draw_Tickets.svg', type: 'Ticket' },
      { id: 'Weapon Ticket', name: 'Weapon Ticket', image: '/picture/MiniGame/Currency/Weapon_Tickets.svg', type: 'Ticket' },
      { id: 'EXP', name: 'EXP', image: '/picture/MiniGame/Currency/EXP.svg', type: 'Progression' }
    ],
    duplicateA10Rewards: { R: 20, SR: 40, SSR: 100 },
    duplicateRewards: Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`A${i + 1}`, (i + 1) * 10]))
  };
}

function miniConfig() {
  const base = miniDefaultConfig();
  const raw = getGlobal(MINI_CONFIG_KEY);
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  return {
    ...base,
    ...src,
    start: { ...base.start, ...(src.start && typeof src.start === 'object' ? src.start : {}) },
    boss: {
      ...base.boss,
      ...(src.boss && typeof src.boss === 'object' ? src.boss : {}),
      breakGauge: { enabled: !!(src.boss?.breakGauge?.enabled ?? base.boss.breakGauge.enabled) },
      rotation: (Array.isArray(src.boss?.rotation) ? src.boss.rotation : base.boss.rotation).map((row, i) => ({
        ...row,
        weakness: miniWeaknesses(row?.weakness, base.boss.rotation[i]?.weakness || base.boss.weakness),
        breakGauge: { enabled: !!row?.breakGauge?.enabled }
      }))
    },
    combat: { ...base.combat, ...(src.combat && typeof src.combat === 'object' ? src.combat : {}) },
    summon: { ...base.summon, ...(src.summon && typeof src.summon === 'object' ? src.summon : {}) },
    training: { ...base.training, ...(src.training && typeof src.training === 'object' ? src.training : {}) },
    levels: { ...base.levels, ...(src.levels && typeof src.levels === 'object' ? src.levels : {}) },
    powerGrowth: {
      hunters: { ...base.powerGrowth.hunters, ...(src.powerGrowth?.hunters && typeof src.powerGrowth.hunters === 'object' ? src.powerGrowth.hunters : {}) },
      sungWeapons: { ...base.powerGrowth.sungWeapons, ...(src.powerGrowth?.sungWeapons && typeof src.powerGrowth.sungWeapons === 'object' ? src.powerGrowth.sungWeapons : {}) }
    },
    sungWeaponUpgradeRequirements: src.sungWeaponUpgradeRequirements && typeof src.sungWeaponUpgradeRequirements === 'object' && !Array.isArray(src.sungWeaponUpgradeRequirements) ? src.sungWeaponUpgradeRequirements : base.sungWeaponUpgradeRequirements,
    formulas: { ...base.formulas, ...(src.formulas && typeof src.formulas === 'object' ? src.formulas : {}) },
    elementAdvantage: { ...base.elementAdvantage, ...(src.elementAdvantage && typeof src.elementAdvantage === 'object' ? src.elementAdvantage : {}) },
    shopPrices: { ...base.shopPrices, ...(src.shopPrices && typeof src.shopPrices === 'object' ? src.shopPrices : {}) },
    maxShopUpgrades: { ...base.maxShopUpgrades, ...(src.maxShopUpgrades && typeof src.maxShopUpgrades === 'object' ? src.maxShopUpgrades : {}) },
    shopUpgradeSteps: { ...base.shopUpgradeSteps, ...(src.shopUpgradeSteps && typeof src.shopUpgradeSteps === 'object' ? src.shopUpgradeSteps : {}) },
    gateRewards: miniGateTable(src.gateRewards || base.gateRewards),
    worldBossRewards: { ...base.worldBossRewards, ...(src.worldBossRewards && typeof src.worldBossRewards === 'object' ? src.worldBossRewards : {}), rows: Array.isArray(src.worldBossRewards?.rows) ? src.worldBossRewards.rows : base.worldBossRewards.rows },
    items: Array.isArray(src.items) ? src.items : base.items,
    duplicateA10Rewards: { ...base.duplicateA10Rewards, ...(src.duplicateA10Rewards && typeof src.duplicateA10Rewards === 'object' ? src.duplicateA10Rewards : {}) },
    duplicateRewards: { ...base.duplicateRewards, ...(src.duplicateRewards && typeof src.duplicateRewards === 'object' ? src.duplicateRewards : {}) }
  };
}

function miniWeaknesses(value, fallback = ['Light']) {
  const allowed = new Set(['Fire', 'Water', 'Wind', 'Light', 'Dark']);
  const source = Array.isArray(value) ? value : String(value || '').split(',');
  const clean = Array.from(new Set(source.map(x => String(x || '').trim().replace(/^./, c => c.toUpperCase())).filter(x => allowed.has(x))));
  if (clean.length) return clean;
  const fallbackList = Array.isArray(fallback) ? fallback : [fallback];
  return fallbackList.map(x => String(x || '').trim().replace(/^./, c => c.toUpperCase())).filter(x => allowed.has(x)).slice(0, 5);
}

function miniCleanIncrementMap(value, maxEntries = 999) {
  const src = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const out = {};
  for (const [key, amount] of Object.entries(src).slice(0, maxEntries)) {
    const step = miniNum(key, 0, 0, 999);
    if (!step) continue;
    out[String(step)] = miniNum(amount, 0, 0, 999999999);
  }
  return out;
}

function miniCleanPowerOverrides(value) {
  const src = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const out = {};
  for (const [id, row] of Object.entries(src).slice(0, 500)) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
    out[String(id).slice(0, 120)] = {
      basePower: row.basePower === '' || row.basePower == null ? null : miniNum(row.basePower, 0, 0, 999999999),
      levels: miniCleanIncrementMap(row.levels),
      advancements: miniCleanIncrementMap(row.advancements, 10)
    };
  }
  return out;
}

function miniCleanWeaponRequirements(value) {
  const src = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const out = {};
  for (const [weaponId, levels] of Object.entries(src).slice(0, 500)) {
    if (!levels || typeof levels !== 'object' || Array.isArray(levels)) continue;
    const cleanLevels = {};
    for (const [level, rows] of Object.entries(levels).slice(0, 999)) {
      const targetLevel = miniNum(level, 0, 2, 999);
      if (!targetLevel || !Array.isArray(rows)) continue;
      const cleanRows = rows.slice(0, 12).map(row => ({
        itemId: String(row?.itemId || '').slice(0, 60),
        amount: miniNum(row?.amount, 1, 1, 999999999)
      })).filter(row => row.itemId);
      if (cleanRows.length) cleanLevels[String(targetLevel)] = cleanRows;
    }
    if (Object.keys(cleanLevels).length) out[String(weaponId).slice(0, 120)] = cleanLevels;
  }
  return out;
}

function miniCleanConfig(input) {
  const base = miniConfig();
  const body = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const pct = v => miniNum(v, 0, 0, 500);
  const money = (v, fallback) => miniNum(v, fallback, 0, 999999999);
  const oneOf = (v, allowed, fallback) => allowed.includes(String(v || '')) ? String(v) : fallback;
  const cleanReward = (src, fallback = {}) => ({
    gold: money(src?.gold, fallback?.gold ?? 0),
    essence: money(src?.essence, fallback?.essence ?? 0),
    customTickets: miniNum(src?.customTickets, fallback?.customTickets ?? 0, 0, 999999),
    weaponTickets: miniNum(src?.weaponTickets, fallback?.weaponTickets ?? 0, 0, 999999),
    rows: Array.isArray(src?.rows)
      ? src.rows.slice(0, 50).map(row => ({
        type: String(row?.type || 'Draw Ticket').slice(0, 40),
        amount: miniFloat(row?.amount, 0, 0, 999999999),
        chance: miniFloat(row?.chance, 100, 0, 100)
      }))
      : (Array.isArray(fallback?.rows) ? fallback.rows : [])
  });
  const cleanBossEntry = (src, fallback) => ({
    name: String(src?.name || fallback.name || 'Boss').slice(0, 60),
    hp: miniNum(src?.hp, fallback.hp || 1000000, 1, 999999999),
    element: String(src?.element || fallback.element || 'Dark').slice(0, 20),
    weakness: miniWeaknesses(src?.weakness, fallback.weakness || ['Light']),
    image: String(src?.image || fallback.image || '').replace(/\\/g, '/').slice(0, 180),
    breakGauge: { enabled: !!(src?.breakGauge?.enabled ?? fallback.breakGauge?.enabled) },
    rewards: cleanReward(src?.rewards, fallback.rewards),
    killRewards: cleanReward(src?.killRewards, fallback.killRewards)
  });
  const out = {
    ...base,
    start: {
      gold: money(body.start?.gold, base.start.gold),
      essence: money(body.start?.essence, base.start.essence),
      customTickets: miniNum(body.start?.customTickets, base.start.customTickets, 0, 999999),
      weaponTickets: miniNum(body.start?.weaponTickets, base.start.weaponTickets, 0, 999999),
      hunterLevel: miniNum(body.start?.hunterLevel, base.start.hunterLevel, 1, 999),
      weaponLevel: miniNum(body.start?.weaponLevel, base.start.weaponLevel, 1, 999)
    },
    boss: {
      name: String(body.boss?.name || base.boss.name).slice(0, 60),
      hp: miniNum(body.boss?.hp, base.boss.hp, 1, 999999999),
      element: String(body.boss?.element || base.boss.element).slice(0, 20),
      weakness: miniWeaknesses(body.boss?.weakness, base.boss.weakness),
      image: String(body.boss?.image || base.boss.image || '').replace(/\\/g, '/').slice(0, 180),
      breakGauge: { enabled: !!body.boss?.breakGauge?.enabled },
      rotation: (() => {
        const rows = Array.isArray(body.boss?.rotation)
          ? body.boss.rotation.slice(0, 12).map((x, i) => cleanBossEntry(x, base.boss.rotation[i] || base.boss)).filter(x => x.name)
          : base.boss.rotation;
        return rows.length ? rows : [cleanBossEntry(base.boss, base.boss)];
      })()
    },
    combat: {},
    summon: {},
    training: {},
    levels: {},
    formulas: {},
    elementAdvantage: {
      fireWind: pct(body.elementAdvantage?.fireWind ?? base.elementAdvantage.fireWind),
      windWater: pct(body.elementAdvantage?.windWater ?? base.elementAdvantage.windWater),
      waterFire: pct(body.elementAdvantage?.waterFire ?? base.elementAdvantage.waterFire),
      lightDark: pct(body.elementAdvantage?.lightDark ?? base.elementAdvantage.lightDark),
      darkLight: pct(body.elementAdvantage?.darkLight ?? base.elementAdvantage.darkLight)
    }
  };
  out.combat.supportBonusPct = pct(body.combat?.supportBonusPct ?? base.combat.supportBonusPct);
  out.combat.supportSameElementBonusPct = pct(body.combat?.supportSameElementBonusPct ?? base.combat.supportSameElementBonusPct);
  out.combat.supportDifferentElementBonusPct = pct(body.combat?.supportDifferentElementBonusPct ?? base.combat.supportDifferentElementBonusPct);
  out.combat.breakGaugePenaltyPct = miniNum(body.combat?.breakGaugePenaltyPct, base.combat.breakGaugePenaltyPct, 0, 100);
  out.combat.breakerTeamBonusVsBreakGaugePct = pct(body.combat?.breakerTeamBonusVsBreakGaugePct ?? base.combat.breakerTeamBonusVsBreakGaugePct);
  out.combat.elementalStackerSameElementBonusPct = pct(body.combat?.elementalStackerSameElementBonusPct ?? base.combat.elementalStackerSameElementBonusPct);
  out.combat.elementalBusterSameElementBonusPct = pct(body.combat?.elementalBusterSameElementBonusPct ?? base.combat.elementalBusterSameElementBonusPct);
  out.combat.elementAdvantageBonusPct = pct(body.combat?.elementAdvantageBonusPct ?? base.combat.elementAdvantageBonusPct);
  out.combat.accumulationPerHit = money(body.combat?.accumulationPerHit, base.combat.accumulationPerHit);
  out.combat.burstThreshold = miniNum(body.combat?.burstThreshold, base.combat.burstThreshold, 1, 999999999);
  out.combat.burstDamagePct = pct(body.combat?.burstDamagePct ?? base.combat.burstDamagePct);
  out.combat.burstDuration = miniNum(body.combat?.burstDuration, base.combat.burstDuration, 1, 999999);
  out.combat.busterStoredDamagePct = pct(body.combat?.busterStoredDamagePct ?? base.combat.busterStoredDamagePct);
  out.combat.busterRequiresSameElementStacker = body.combat?.busterRequiresSameElementStacker == null ? !!base.combat.busterRequiresSameElementStacker : !!body.combat.busterRequiresSameElementStacker;
  out.combat.critChancePct = miniNum(body.combat?.critChancePct, base.combat.critChancePct, 0, 100);
  out.combat.critDamagePct = miniNum(body.combat?.critDamagePct, base.combat.critDamagePct, 100, 1000);
  for (const key of Object.keys(base.summon)) out.summon[key] = pct(body.summon?.[key] ?? base.summon[key]);
  out.summon.hardPity = miniNum(body.summon?.hardPity, base.summon.hardPity, 1, 300);
  out.summon.softPity = miniNum(body.summon?.softPity, base.summon.softPity, 1, out.summon.hardPity);
  out.training.baseExp = money(body.training?.baseExp, base.training.baseExp);
  out.training.expPerHour = money(body.training?.expPerHour, base.training.expPerHour);
  out.training.maxTrainingSlots = miniNum(body.training?.maxTrainingSlots, base.training.maxTrainingSlots, 1, 99);
  out.training.maxTrainingTime = miniNum(body.training?.maxTrainingTime, base.training.maxTrainingTime, 1, 168);
  out.training.expMultiplier = Math.max(0.1, Math.min(100, Number(body.training?.expMultiplier ?? base.training.expMultiplier) || base.training.expMultiplier));
  out.levels.maxLevel = miniNum(body.levels?.maxLevel, base.levels.maxLevel, 1, 999);
  out.levels.expPerLevel = miniNum(body.levels?.expPerLevel, base.levels.expPerLevel, 100, 999999);
  out.levels.mode = oneOf(body.levels?.mode, ['manual', 'percent'], base.levels.mode);
  out.levels.baseExp = miniNum(body.levels?.baseExp, base.levels.baseExp, 1, 999999999);
  out.levels.growthPct = miniNum(body.levels?.growthPct, base.levels.growthPct, 0, 1000);
  out.levels.manual = body.levels?.manual && typeof body.levels.manual === 'object' && !Array.isArray(body.levels.manual) ? body.levels.manual : base.levels.manual;
  out.levels.sungBasePower = miniNum(body.levels?.sungBasePower, base.levels.sungBasePower, 0, 999999999);
  out.levels.sungPowerPerLevel = miniNum(body.levels?.sungPowerPerLevel, base.levels.sungPowerPerLevel, 0, 999999999);
  out.levels.sungLevelPower = miniCleanIncrementMap(body.levels?.sungLevelPower ?? base.levels.sungLevelPower);
  out.powerGrowth = {
    hunters: {
      defaultBasePowerBonus: miniNum(body.powerGrowth?.hunters?.defaultBasePowerBonus, base.powerGrowth.hunters.defaultBasePowerBonus, 0, 999999999),
      defaultLevelIncrement: miniNum(body.powerGrowth?.hunters?.defaultLevelIncrement, base.powerGrowth.hunters.defaultLevelIncrement, 0, 999999999),
      defaultAdvancementIncrement: miniNum(body.powerGrowth?.hunters?.defaultAdvancementIncrement, base.powerGrowth.hunters.defaultAdvancementIncrement, 0, 999999999),
      overrides: miniCleanPowerOverrides(body.powerGrowth?.hunters?.overrides ?? base.powerGrowth.hunters.overrides)
    },
    sungWeapons: {
      defaultBasePowerBonus: miniNum(body.powerGrowth?.sungWeapons?.defaultBasePowerBonus, base.powerGrowth.sungWeapons.defaultBasePowerBonus, 0, 999999999),
      defaultLevelIncrement: miniNum(body.powerGrowth?.sungWeapons?.defaultLevelIncrement, base.powerGrowth.sungWeapons.defaultLevelIncrement, 0, 999999999),
      defaultAdvancementIncrement: miniNum(body.powerGrowth?.sungWeapons?.defaultAdvancementIncrement, base.powerGrowth.sungWeapons.defaultAdvancementIncrement, 0, 999999999),
      overrides: miniCleanPowerOverrides(body.powerGrowth?.sungWeapons?.overrides ?? base.powerGrowth.sungWeapons.overrides)
    }
  };
  out.sungWeaponUpgradeRequirements = miniCleanWeaponRequirements(body.sungWeaponUpgradeRequirements ?? base.sungWeaponUpgradeRequirements);
  for (const key of Object.keys(base.formulas)) out.formulas[key] = String(body.formulas?.[key] || base.formulas[key]).slice(0, 400);
  for (const key of Object.keys(base.shopPrices)) out.shopPrices[key] = money(body.shopPrices?.[key], base.shopPrices[key]);
  for (const key of Object.keys(base.maxShopUpgrades)) out.maxShopUpgrades[key] = miniNum(body.maxShopUpgrades?.[key], base.maxShopUpgrades[key], 1, 99);
  out.shopUpgradeSteps.trainingExpMultiplier = miniFloat(body.shopUpgradeSteps?.trainingExpMultiplier, base.shopUpgradeSteps.trainingExpMultiplier, 0.01, 100);
  out.expPerLevel = out.levels.expPerLevel;
  for (const key of Object.keys(base.worldBossRewards)) {
    if (key !== 'rows') out.worldBossRewards[key] = money(body.worldBossRewards?.[key], base.worldBossRewards[key]);
  }
  out.worldBossRewards.rows = Array.isArray(body.worldBossRewards?.rows)
    ? body.worldBossRewards.rows.slice(0, 50).map(row => ({
      type: String(row?.type || 'gold').slice(0, 40),
      amount: miniFloat(row?.amount, 0, 0, 999999999),
      chance: miniFloat(row?.chance, 100, 0, 100)
    }))
    : [];
  out.items = Array.isArray(body.items)
    ? body.items.slice(0, 100).map(item => ({
      id: String(item?.id || item?.key || item?.name || '').slice(0, 60),
      key: String(item?.key || item?.id || item?.name || '').slice(0, 60),
      name: String(item?.name || item?.id || item?.key || 'Item').slice(0, 80),
      image: String(item?.image || '').replace(/\\/g, '/').slice(0, 180),
      type: String(item?.type || item?.category || 'Item').slice(0, 40),
      category: String(item?.category || item?.type || 'Item').slice(0, 40)
    })).filter(item => item.id && item.name)
    : base.items;
  for (const key of Object.keys(base.duplicateA10Rewards)) out.duplicateA10Rewards[key] = money(body.duplicateA10Rewards?.[key], base.duplicateA10Rewards[key]);
  for (let i = 1; i <= 10; i++) out.duplicateRewards[`A${i}`] = money(body.duplicateRewards?.[`A${i}`], base.duplicateRewards[`A${i}`]);
  out.gateRewards = miniGateTable(body.gateRewards || base.gateRewards);
  return out;
}

function miniPictureFiles(kind) {
  const dir = kind === 'hunter' ? 'Hunter_Icon' : 'SGWeapon';
  const full = path.join(process.cwd(), 'picture', dir);
  try {
    return fs.readdirSync(full).filter(f => /\.(png|webp|jpg|jpeg)$/i.test(f));
  } catch {
    return [];
  }
}

function miniNameFileCandidates(name) {
  const clean = String(name || '').trim().replace(/['"]/g, '').replace(/,/g, '').replace(/\s+/g, '_');
  const title = clean.toLowerCase().replace(/(^|_)([a-z])/g, (_, p, c) => p + c.toUpperCase());
  return [`${clean}.png`, `${clean.toUpperCase()}.png`, `${title}.png`];
}

function miniResolvePicPath(preferred, name, kind) {
  const dir = kind === 'hunter' ? 'Hunter_Icon' : 'SGWeapon';
  const files = miniPictureFiles(kind);
  const byLower = new Map(files.map(f => [f.toLowerCase(), f]));
  const preferredFile = String(preferred || '').trim().replace(/\\/g, '/').split('/').pop();
  const candidates = [preferredFile, ...miniNameFileCandidates(name)].filter(Boolean);
  for (const candidate of candidates) {
    const hit = byLower.get(String(candidate).toLowerCase());
    if (hit) return `/picture/${dir}/${hit}`;
  }
  return preferred ? miniNormalizePicPath(preferred, kind) : '';
}

function miniToday() {
  return new Date().toISOString().slice(0, 10);
}

function miniBossForToday(previous, cfg) {
  const rotation = Array.isArray(cfg.boss?.rotation) && cfg.boss.rotation.length ? cfg.boss.rotation : [cfg.boss];
  const day = Math.floor(Date.now() / 86400000);
  let boss = rotation[day % rotation.length] || cfg.boss;
  if (rotation.length > 1 && previous?.bossName && boss.name === previous.bossName) boss = rotation[(day + 1) % rotation.length] || boss;
  const hp = miniNum(boss.hp, cfg.boss.hp, 1);
  return {
    date: miniToday(),
    attacksUsed: 0,
    totalDamage: 0,
    usedHunterIds: [],
    usedWeaponIds: [],
    usedPresetSlots: [],
    usedPresetTeams: {},
    bossName: String(boss.name || cfg.boss.name || 'World Boss'),
    bossElement: String(boss.element || cfg.boss.element || 'Dark'),
    bossWeakness: miniWeaknesses(boss.weakness, cfg.boss.weakness || ['Light']),
    bossImage: String(boss.image || cfg.boss.image || ''),
    bossHp: hp,
    bossMaxHp: hp,
    defeated: false,
    elementalAccumulation: 0,
    burstAttacksLeft: 0,
    pendingReward: null,
    rewardClaimed: false,
    presetDamage: {},
    presetAttacks: {},
    lastAttack: null
  };
}

function miniCurrentBossDef(state, cfg = miniConfig()) {
  const rotation = Array.isArray(cfg.boss?.rotation) && cfg.boss.rotation.length ? cfg.boss.rotation : [cfg.boss];
  return rotation.find(b => String(b.name || '') === String(state?.worldBoss?.bossName || '')) || rotation[0] || cfg.boss || {};
}

function miniBossBreakGauge(state, cfg = miniConfig()) {
  const boss = miniCurrentBossDef(state, cfg);
  return boss.breakGauge || cfg.boss?.breakGauge || miniDefaultConfig().boss.breakGauge;
}

function miniSlug(text) {
  return String(text || '')
    .trim()
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'item';
}

function miniBasePowerByRarity(rarity) {
  const r = String(rarity || '').toUpperCase();
  if (r === 'SSR') return 5200;
  if (r === 'SR') return 2800;
  return 1200;
}

function miniNormalizePicPath(value, kind) {
  let s = String(value || '').trim().replace(/\\/g, '/');
  if (!s || /^https?:\/\//i.test(s) || s.startsWith('/picture/')) return s;
  const file = s.split('/').pop() || s;
  if (kind === 'hunter') return `/picture/Hunter_Icon/${file}`;
  if (kind === 'sungWeapon') return `/picture/SGWeapon/${file}`;
  return s.startsWith('/') ? s : `/${s}`;
}

function miniReadHuntersLevelMax() {
  const cfg = getGlobal('sla_hunters_dropdowns_v1') || {};
  const n = Number(cfg?.levelMax);
  return Number.isFinite(n) ? Math.max(1, Math.min(999, Math.floor(n))) : 130;
}

function miniReadSungWeaponsLevelMax() {
  const cfg = getGlobal('sla_sung_weapons_dropdowns_v1') || {};
  const n = Number(cfg?.levelMax);
  return Number.isFinite(n) ? Math.max(1, Math.min(999, Math.floor(n))) : 100;
}

function miniExpNeeded(level) {
  const cfg = miniConfig();
  return Math.max(100, miniNum(level, 1, 1) * miniNum(cfg.levels?.expPerLevel ?? cfg.expPerLevel, 1000, 100));
}

function miniReadRawCatalog(key) {
  const raw = getGlobal(key);
  return Array.isArray(raw) ? raw : [];
}

function miniCatalogItem(kind, item) {
  const name = String(item?.name || '').trim();
  if (!name) return null;
  const rarity = String(item?.rarity || 'SSR').trim().toUpperCase();
  const isHunter = kind === 'hunter';
  return {
    id: `${kind}:${miniSlug(name)}`,
    catalogId: `${kind}:${miniSlug(name)}`,
    kind,
    ownerType: isHunter ? 'hunter' : 'sung',
    name,
    rarity: ['R', 'SR', 'SSR'].includes(rarity) ? rarity : 'SSR',
    element: String(item?.element || 'None').trim() || 'None',
    role: isHunter ? String(item?.role || '').trim() : 'Sung Weapon',
    type: isHunter ? 'Hunter' : 'Sung Weapon',
    image: miniResolvePicPath(item?.image || '', name, kind),
    image_build: miniResolvePicPath(item?.image_build || item?.imageBuild || item?.image || '', name, kind),
    basePower: miniBasePowerByRarity(rarity)
  };
}

function miniCatalog() {
  const hunters = miniReadRawCatalog('catalog:hunters')
    .map(item => miniCatalogItem('hunter', item))
    .filter(Boolean);
  const sungWeapons = miniReadRawCatalog('catalog:sungWeapons')
    .map(item => miniCatalogItem('sungWeapon', item))
    .filter(Boolean);
  const custom = [...hunters, ...sungWeapons];
  return {
    hunters,
    sungWeapons,
    custom,
    customRateUp: custom.filter(x => x.rarity === 'SSR'),
    weaponRateUp: sungWeapons.filter(x => x.rarity === 'SSR')
  };
}

function miniInitialState() {
  const cfg = miniConfig();
  return {
    level: 1,
    exp: 0,
    gold: miniNum(cfg.start?.gold, 5000),
    essence: miniNum(cfg.start?.essence, 1000),
    tickets: 10,
    customTickets: miniNum(cfg.start?.customTickets, 10),
    weaponTickets: miniNum(cfg.start?.weaponTickets, 10),
    sung: {
      level: 1,
      exp: 0,
      advancement: 0,
      power: 2000,
      weaponId: null
    },
    hunters: [],
    weapons: [],
    inventory: {},
    gates: [],
    training: [],
    worldBoss: miniBossForToday(null, cfg),
    pity: {
      custom: 0,
      weapon: 0,
      hunter: 0,
      hunterWishlist: [],
      weaponWishlist: []
    },
    guarantee: {
      custom: false,
      weapon: false
    },
    rateUp: {
      custom: [],
      weapon: []
    },
    shop: {
      trainingSlots: 1,
      trainingMaxHours: 1,
      trainingExpMultiplier: 1,
      presetSlots: 5,
      hunterGateSlots: 1
    },
    presets: [],
    summonHistory: [],
    logs: []
  };
}

function miniNum(v, fallback = 0, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function miniFloat(v, fallback = 0, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function miniNormalize(raw) {
  const base = miniInitialState();
  const cfg = miniConfig();
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const state = {
    ...base,
    ...src,
    level: miniNum(src.level, base.level, 1),
    exp: miniNum(src.exp, base.exp),
    gold: miniNum(src.gold, base.gold),
    essence: miniNum(src.essence, base.essence),
    tickets: miniNum(src.tickets, base.tickets),
    customTickets: miniNum(src.customTickets, base.customTickets),
    weaponTickets: miniNum(src.weaponTickets, base.weaponTickets),
    sung: {
      ...base.sung,
      ...(src.sung && typeof src.sung === 'object' ? src.sung : {})
    },
    pity: {
      ...base.pity,
      ...(src.pity && typeof src.pity === 'object' ? src.pity : {})
    },
    guarantee: {
      ...base.guarantee,
      ...(src.guarantee && typeof src.guarantee === 'object' ? src.guarantee : {})
    },
    rateUp: {
      ...base.rateUp,
      ...(src.rateUp && typeof src.rateUp === 'object' ? src.rateUp : {})
    },
    shop: {
      ...base.shop,
      ...(src.shop && typeof src.shop === 'object' ? src.shop : {})
    },
    worldBoss: {
      ...base.worldBoss,
      ...(src.worldBoss && typeof src.worldBoss === 'object' ? src.worldBoss : {})
    },
    hunters: Array.isArray(src.hunters) ? src.hunters : [],
    weapons: Array.isArray(src.weapons) ? src.weapons : [],
    inventory: src.inventory && typeof src.inventory === 'object' && !Array.isArray(src.inventory) ? src.inventory : {},
    gates: Array.isArray(src.gates) ? src.gates : [],
    training: Array.isArray(src.training) ? src.training : [],
    presets: Array.isArray(src.presets) ? src.presets : [],
    summonHistory: Array.isArray(src.summonHistory) ? src.summonHistory : [],
    logs: Array.isArray(src.logs) ? src.logs : []
  };

  state.sung.level = miniNum(state.sung.level, 1, 1);
  state.sung.exp = miniNum(state.sung.exp, 0);
  state.sung.advancement = miniNum(state.sung.advancement, 0, 0, 10);
  state.sung.power = miniNum(state.sung.power, 2000, 1);
  state.sung.weaponId = state.sung.weaponId ? String(state.sung.weaponId) : null;

  const hardPity = miniNum(cfg.summon?.hardPity, 70, 1, 300);
  state.pity.custom = miniNum(state.pity.custom, 0, 0, hardPity);
  state.pity.weapon = miniNum(state.pity.weapon, 0, 0, hardPity);
  state.pity.hunter = miniNum(state.pity.hunter, 0, 0, 80);
  state.pity.hunterWishlist = Array.isArray(state.pity.hunterWishlist) ? state.pity.hunterWishlist.map(String) : [];
  state.pity.weaponWishlist = Array.isArray(state.pity.weaponWishlist) ? state.pity.weaponWishlist.map(String) : [];
  state.guarantee.custom = !!state.guarantee.custom;
  state.guarantee.weapon = !!state.guarantee.weapon;

  const catalog = miniCatalog();
  const customRateIds = new Set(catalog.customRateUp.map(x => x.id));
  const weaponRateIds = new Set(catalog.weaponRateUp.map(x => x.id));
  state.rateUp.custom = Array.isArray(state.rateUp.custom)
    ? state.rateUp.custom.map(String).filter(id => customRateIds.has(id)).slice(0, 3)
    : [];
  state.rateUp.weapon = Array.isArray(state.rateUp.weapon)
    ? state.rateUp.weapon.map(String).filter(id => weaponRateIds.has(id)).slice(0, 2)
    : [];

  state.worldBoss.date = String(state.worldBoss.date || miniToday());
  state.worldBoss.attacksUsed = miniNum(state.worldBoss.attacksUsed, 0, 0, 3);
  state.worldBoss.totalDamage = miniNum(state.worldBoss.totalDamage, 0);
  if (state.worldBoss.date !== miniToday()) {
    state.worldBoss = miniBossForToday(state.worldBoss, cfg);
  }
  state.worldBoss.bossName = String(state.worldBoss.bossName || cfg.boss.name || 'World Boss');
  state.worldBoss.bossElement = String(state.worldBoss.bossElement || cfg.boss.element || 'Dark');
  state.worldBoss.bossWeakness = miniWeaknesses(state.worldBoss.bossWeakness, cfg.boss.weakness || ['Light']);
  state.worldBoss.bossImage = String(state.worldBoss.bossImage || cfg.boss.image || '');
  if (!state.worldBoss.defeated && !state.worldBoss.pendingReward) {
    const rotation = Array.isArray(cfg.boss?.rotation) && cfg.boss.rotation.length ? cfg.boss.rotation : [cfg.boss];
    const match = rotation.find(b => String(b.name || '') === state.worldBoss.bossName) || rotation[0] || cfg.boss;
    const hp = miniNum(match.hp, cfg.boss.hp, 1);
    const untouched = !state.worldBoss.attacksUsed && !state.worldBoss.totalDamage;
    state.worldBoss.bossName = String(match.name || cfg.boss.name || state.worldBoss.bossName);
    state.worldBoss.bossElement = String(match.element || cfg.boss.element || state.worldBoss.bossElement);
    state.worldBoss.bossWeakness = miniWeaknesses(match.weakness, cfg.boss.weakness || state.worldBoss.bossWeakness);
    state.worldBoss.bossImage = String(match.image || cfg.boss.image || '');
    if (untouched) {
      state.worldBoss.bossMaxHp = hp;
      state.worldBoss.bossHp = hp;
    }
  }
  state.worldBoss.usedHunterIds = Array.isArray(state.worldBoss.usedHunterIds) ? state.worldBoss.usedHunterIds.map(String) : [];
  state.worldBoss.usedWeaponIds = Array.isArray(state.worldBoss.usedWeaponIds) ? state.worldBoss.usedWeaponIds.map(String) : [];
  state.worldBoss.usedPresetSlots = Array.isArray(state.worldBoss.usedPresetSlots) ? state.worldBoss.usedPresetSlots.map(Number).filter(Number.isFinite) : [];
  state.worldBoss.usedPresetTeams = state.worldBoss.usedPresetTeams && typeof state.worldBoss.usedPresetTeams === 'object' && !Array.isArray(state.worldBoss.usedPresetTeams) ? state.worldBoss.usedPresetTeams : {};
  state.worldBoss.bossMaxHp = miniNum(state.worldBoss.bossMaxHp, cfg.boss.hp, 1);
  state.worldBoss.bossHp = miniNum(state.worldBoss.bossHp, state.worldBoss.bossMaxHp, 0, state.worldBoss.bossMaxHp);
  state.worldBoss.defeated = !!state.worldBoss.defeated || state.worldBoss.bossHp <= 0;
  state.worldBoss.elementalAccumulation = miniNum(state.worldBoss.elementalAccumulation, 0, 0);
  state.worldBoss.burstAttacksLeft = miniNum(state.worldBoss.burstAttacksLeft, 0, 0, 999999);
  state.worldBoss.pendingReward = state.worldBoss.pendingReward && typeof state.worldBoss.pendingReward === 'object' && !Array.isArray(state.worldBoss.pendingReward) ? state.worldBoss.pendingReward : null;
  state.worldBoss.rewardClaimed = !!state.worldBoss.rewardClaimed;
  state.worldBoss.presetDamage = state.worldBoss.presetDamage && typeof state.worldBoss.presetDamage === 'object' && !Array.isArray(state.worldBoss.presetDamage) ? state.worldBoss.presetDamage : {};
  state.worldBoss.presetAttacks = state.worldBoss.presetAttacks && typeof state.worldBoss.presetAttacks === 'object' && !Array.isArray(state.worldBoss.presetAttacks) ? state.worldBoss.presetAttacks : {};
  state.worldBoss.lastAttack = state.worldBoss.lastAttack && typeof state.worldBoss.lastAttack === 'object' && !Array.isArray(state.worldBoss.lastAttack) ? state.worldBoss.lastAttack : null;

  state.shop.trainingSlots = miniNum(state.shop.trainingSlots, 1, 1, cfg.training?.maxTrainingSlots || cfg.maxShopUpgrades.trainingSlots || 6);
  state.shop.trainingMaxHours = miniNum(state.shop.trainingMaxHours, 1, 1, cfg.training?.maxTrainingTime || cfg.maxShopUpgrades.trainingMaxHours || 12);
  state.shop.trainingExpMultiplier = Math.max(1, Math.min(cfg.maxShopUpgrades.trainingExpMultiplier || 5, Number(state.shop.trainingExpMultiplier) || 1));
  state.shop.presetSlots = miniNum(state.shop.presetSlots, 5, 5, miniConfig().maxShopUpgrades.presetSlots || 10);
  state.shop.hunterGateSlots = miniNum(state.shop.hunterGateSlots, 1, 1, cfg.maxShopUpgrades.hunterGateSlots || 6);

  state.inventory = Object.fromEntries(Object.entries(state.inventory).slice(0, 500).map(([id, amount]) => [String(id).slice(0, 60), miniNum(amount, 0, 0, 999999999)]).filter(([, amount]) => amount > 0));

  state.hunters = state.hunters.map((h) => ({
    id: String(h?.id || ''),
    catalogId: String(h?.catalogId || h?.id || ''),
    name: String(h?.name || 'Hunter'),
    rarity: ['R', 'SR', 'SSR'].includes(String(h?.rarity)) ? String(h.rarity) : 'R',
    element: String(h?.element || 'None'),
    role: String(h?.role || ''),
    image: miniResolvePicPath(h?.image || '', h?.name || 'Hunter', 'hunter'),
    image_build: miniResolvePicPath(h?.image_build || h?.imageBuild || h?.image || '', h?.name || 'Hunter', 'hunter'),
    level: miniNum(h?.level, 1, 1),
    exp: miniNum(h?.exp, 0),
    advancement: miniNum(h?.advancement, 0, 0, 10),
    basePower: miniNum(h?.basePower, 1000, 1),
    weaponId: h?.weaponId ? String(h.weaponId) : null
  })).filter(h => h.id);

  state.weapons = state.weapons.map((w) => ({
    id: String(w?.id || ''),
    catalogId: String(w?.catalogId || w?.id || ''),
    name: String(w?.name || 'Weapon'),
    ownerType: String(w?.ownerType || 'hunter') === 'sung' ? 'sung' : 'hunter',
    rarity: ['R', 'SR', 'SSR'].includes(String(w?.rarity)) ? String(w.rarity) : 'R',
    element: String(w?.element || 'None'),
    role: String(w?.role || w?.type || ''),
    image: miniResolvePicPath(w?.image || '', w?.name || 'Weapon', w?.ownerType === 'sung' ? 'sungWeapon' : 'weapon'),
    image_build: miniResolvePicPath(w?.image_build || w?.imageBuild || w?.image || '', w?.name || 'Weapon', w?.ownerType === 'sung' ? 'sungWeapon' : 'weapon'),
    level: miniNum(w?.level, 1, 1, w?.ownerType === 'sung' ? miniReadSungWeaponsLevelMax() : 999),
    advancement: miniNum(w?.advancement, 0, 0, 10),
    basePower: miniNum(w?.basePower, 500, 1),
    assignedTo: w?.assignedTo ? String(w.assignedTo) : null
  })).filter(w => w.id);

  state.gates = state.gates.map((g) => ({
    id: String(g?.id || ''),
    type: String(g?.type || '') === 'hunter' ? 'hunter' : 'sung',
    gateKind: MINI_GATE_KIND[String(g?.gateKind || '').toLowerCase()] ? String(g.gateKind).toLowerCase() : 'blue',
    difficulty: MINI_GATE[String(g?.difficulty)] ? String(g.difficulty) : 'E',
    requiredPower: miniNum(g?.requiredPower, 1000),
    startAt: String(g?.startAt || ''),
    finishAt: String(g?.finishAt || ''),
    claimed: !!g?.claimed,
    presetSlot: miniNum(g?.presetSlot, 0, 0),
    hunterIds: Array.isArray(g?.hunterIds) ? g.hunterIds.map(String).filter(Boolean).slice(0, 3) : [],
    weaponIds: Array.isArray(g?.weaponIds) ? g.weaponIds.map(String).filter(Boolean).slice(0, 2) : []
  })).filter(g => g.id && g.startAt && g.finishAt).slice(-12);

  state.training = state.training.map((t) => ({
    id: String(t?.id || ''),
    hunterId: String(t?.hunterId || ''),
    startAt: String(t?.startAt || ''),
    finishAt: String(t?.finishAt || ''),
    durationMs: miniNum(t?.durationMs, 30 * 60 * 1000, 60 * 1000, 12 * 60 * 60 * 1000),
    expectedExp: miniNum(t?.expectedExp, 900),
    claimed: !!t?.claimed
  })).filter(t => t.id && t.hunterId && t.startAt && t.finishAt).slice(-12);

  state.presets = state.presets.map((p, idx) => ({
    slot: miniNum(p?.slot, idx + 1, 1, 10),
    type: String(p?.type || (Array.isArray(p?.weapons) && p.weapons.length ? 'sung' : 'hunter')) === 'sung' ? 'sung' : 'hunter',
    name: String(p?.name || `Preset ${idx + 1}`).slice(0, 32),
    hunters: Array.isArray(p?.hunters) ? p.hunters.map(String).slice(0, 3) : [],
    weapons: Array.isArray(p?.weapons) ? p.weapons.map(String).slice(0, 2) : []
  })).filter(p => p.slot >= 1 && p.slot <= state.shop.presetSlots).slice(0, state.shop.presetSlots * 2);

  state.logs = state.logs
    .map(x => String(x || '').slice(0, 180))
    .filter(Boolean)
    .slice(0, 8);

  state.summonHistory = state.summonHistory
    .map(x => ({
      id: String(x?.id || ''),
      banner: String(x?.banner || ''),
      itemId: String(x?.itemId || ''),
      name: String(x?.name || ''),
      kind: String(x?.kind || ''),
      rarity: ['R', 'SR', 'SSR'].includes(String(x?.rarity)) ? String(x.rarity) : 'R',
      isRateUp: !!x?.isRateUp,
      duplicate: !!x?.duplicate,
      duplicateEssence: miniNum(x?.duplicateEssence, 0),
      advancement: miniNum(x?.advancement, 0, 0, 10),
      at: String(x?.at || '')
    }))
    .filter(x => x.id && x.name)
    .slice(0, 100);

  return state;
}

function miniLoad(userId) {
  return miniNormalize(getCollection(userId, MINI_GAME_TYPE));
}

function miniSave(userId, state) {
  const clean = miniNormalize(state);
  setCollection(userId, MINI_GAME_TYPE, clean);
  return clean;
}

function miniPowerOverride(group, item) {
  const overrides = group?.overrides && typeof group.overrides === 'object' ? group.overrides : {};
  return overrides[item?.catalogId] || overrides[item?.id] || overrides[item?.name] || {};
}

function miniProgressionPower(item, group, maxAdvancement = 10) {
  const override = miniPowerOverride(group, item);
  const basePower = override.basePower == null ? miniNum(item?.basePower, 0) + miniNum(group?.defaultBasePowerBonus, 0) : miniNum(override.basePower, 0);
  const level = miniNum(item?.level, 1, 1, 999);
  const advancement = miniNum(item?.advancement, 0, 0, maxAdvancement);
  let power = basePower;
  for (let target = 2; target <= level; target++) {
    power += miniNum(override.levels?.[String(target)], miniNum(group?.defaultLevelIncrement, 0), 0);
  }
  for (let target = 1; target <= advancement; target++) {
    power += miniNum(override.advancements?.[String(target)], miniNum(group?.defaultAdvancementIncrement, 0), 0);
  }
  return power;
}

function miniWeaponPower(w, cfg = miniConfig()) {
  if (!w) return 0;
  return miniProgressionPower(w, cfg.powerGrowth?.sungWeapons || miniDefaultConfig().powerGrowth.sungWeapons);
}

function miniSungPower(state, cfg = miniConfig()) {
  const base = miniNum(cfg.levels?.sungBasePower, 2000, 0);
  const perLevel = miniNum(cfg.levels?.sungPowerPerLevel, 200, 0);
  const level = miniNum(state?.level, 1, 1);
  let power = base;
  for (let target = 2; target <= level; target++) power += miniNum(cfg.levels?.sungLevelPower?.[String(target)], perLevel, 0);
  return power;
}

function miniHunterPower(h, state, cfg = miniConfig()) {
  if (!h) return 0;
  const ownWeapon = state.weapons.find(w => w.ownerType === 'hunter' && (w.assignedTo === h.id || h.weaponId === w.id));
  return miniProgressionPower(h, cfg.powerGrowth?.hunters || miniDefaultConfig().powerGrowth.hunters) + miniWeaponPower(ownWeapon, cfg);
}

function miniComputed(state) {
  const cfg = miniConfig();
  const sungWeapons = state.weapons
    .filter(w => w.ownerType === 'sung')
    .map(w => ({ ...w, power: miniWeaponPower(w, cfg) }))
    .sort((a, b) => b.power - a.power);
  const bestSungWeaponPower = sungWeapons.slice(0, 2).reduce((sum, w) => sum + w.power, 0);
  const sungPower = miniSungPower(state, cfg);
  const sungTotalPower = (sungPower + bestSungWeaponPower) * 2;
  const hunters = state.hunters
    .map(h => ({ ...h, power: miniHunterPower(h, state, cfg) }))
    .sort((a, b) => b.power - a.power);
  const topHuntersPower = hunters.slice(0, 3).reduce((sum, h) => sum + h.power, 0);
  const teamPower = sungTotalPower + topHuntersPower;
  const weapons = state.weapons.map(w => ({ ...w, power: miniWeaponPower(w, cfg) }));
  return {
    sungPower,
    sungTotalPower,
    bestSungWeaponPower,
    topHuntersPower,
    teamPower,
    hunters,
    weapons,
    sungWeapons
  };
}

function miniRoleHas(hunter, role) {
  return String(hunter?.role || '').toLowerCase().includes(String(role || '').toLowerCase());
}

function miniElementKey(attacker, defender) {
  const left = String(attacker || '').replace(/\s+/g, '').toLowerCase();
  const right = String(defender || '').replace(/\s+/g, '');
  return left && right ? `${left}${right.replace(/^./, c => c.toUpperCase())}` : '';
}

function miniWorldBossBreakdown(state, team, cfg) {
  const combat = cfg.combat || miniDefaultConfig().combat;
  const breakGaugeCfg = miniBossBreakGauge(state, cfg);
  const weaknesses = new Set(miniWeaknesses(state.worldBoss?.bossWeakness, cfg.boss.weakness).map(x => x.toLowerCase()));
  const weaponPower = team.weapons.reduce((sum, w) => sum + miniWeaponPower(w), 0);
  const sungDamage = Math.max(1, Math.floor((miniSungPower(state, cfg) + weaponPower) * 2));
  const hunterDamages = team.hunters.map(h => Math.max(0, Math.floor(miniHunterPower(h, state))));
  const baseDamage = sungDamage + hunterDamages.reduce((sum, n) => sum + n, 0);

  const advantagePct = miniNum(combat.elementAdvantageBonusPct, 50, 0, 500);
  const sungHasAdvantage = team.weapons.some(w => weaknesses.has(String(w.element || '').toLowerCase()));
  const elementAdvantageBonus = Math.floor((sungHasAdvantage ? sungDamage : 0) * advantagePct / 100)
    + team.hunters.reduce((sum, h, i) => sum + (weaknesses.has(String(h.element || '').toLowerCase()) ? Math.floor(hunterDamages[i] * advantagePct / 100) : 0), 0);

  const supporters = team.hunters.filter(h => miniRoleHas(h, 'support'));
  const supporterBonus = supporters.reduce((sum, supporter) => {
    const supporterElement = String(supporter.element || '').toLowerCase();
    const samePct = miniNum(combat.supportSameElementBonusPct, 20, 0, 500);
    const diffPct = miniNum(combat.supportDifferentElementBonusPct, 10, 0, 500);
    const hunterBonus = team.hunters.reduce((part, ally, i) => {
      if (ally.id === supporter.id) return part;
      const pct = String(ally.element || '').toLowerCase() === supporterElement ? samePct : diffPct;
      return part + Math.floor(hunterDamages[i] * pct / 100);
    }, 0);
    return sum + hunterBonus + Math.floor(sungDamage * diffPct / 100);
  }, 0);

  const stackers = team.hunters.filter(h => miniRoleHas(h, 'stacker'));
  const stackerPct = miniNum(combat.elementalStackerSameElementBonusPct, 20, 0, 500);
  const elementalStackerBonus = stackers.reduce((sum, stacker) => {
    const element = String(stacker.element || '').toLowerCase();
    const hunterBase = team.hunters.reduce((part, ally, i) => part + (String(ally.element || '').toLowerCase() === element ? hunterDamages[i] : 0), 0);
    const sungBase = team.weapons.some(w => String(w.element || '').toLowerCase() === element) ? sungDamage : 0;
    return sum + Math.floor((hunterBase + sungBase) * stackerPct / 100);
  }, 0);

  const breakGaugeEnabled = !!breakGaugeCfg?.enabled;
  const hasBreaker = team.hunters.some(h => miniRoleHas(h, 'breaker'));
  const breakGaugeCountered = breakGaugeEnabled && (hasBreaker || stackers.length > 0);
  const breakerBonus = breakGaugeEnabled && hasBreaker
    ? Math.floor(baseDamage * miniNum(combat.breakerTeamBonusVsBreakGaugePct, 20, 0, 500) / 100)
    : 0;

  const stackerElements = new Set(stackers.map(h => String(h.element || '').toLowerCase()).filter(Boolean));
  const busterPct = miniNum(combat.elementalBusterSameElementBonusPct, 30, 0, 500);
  const elementalBusterBonus = team.hunters.reduce((sum, h, i) => {
    if (!miniRoleHas(h, 'buster') || !stackerElements.has(String(h.element || '').toLowerCase())) return sum;
    return sum + Math.floor(hunterDamages[i] * busterPct / 100);
  }, 0);

  const prePenalty = baseDamage + elementAdvantageBonus + breakerBonus + supporterBonus + elementalStackerBonus + elementalBusterBonus;
  const breakGaugePenalty = breakGaugeEnabled && !breakGaugeCountered
    ? Math.floor(prePenalty * miniNum(combat.breakGaugePenaltyPct, 50, 0, 100) / 100)
    : 0;
  const afterPenalty = Math.max(1, prePenalty - breakGaugePenalty);
  const crit = Math.random() < miniNum(combat.critChancePct, 5, 0, 100) / 100;
  const criticalBonus = crit ? Math.floor(afterPenalty * (miniNum(combat.critDamagePct, 150, 100, 1000) - 100) / 100) : 0;
  const variance = 0.8 + Math.random() * 0.4;
  const finalDamage = Math.max(1, Math.floor((afterPenalty + criticalBonus) * variance));
  return {
    sungDamage,
    hunterDamages,
    baseDamage,
    elementAdvantageBonus,
    breakerBonus,
    supporterBonus,
    elementalStackerBonus,
    elementalBusterBonus,
    supportBonus: supporterBonus,
    elementBonus: elementAdvantageBonus,
    elementalAccumulationBonus: elementalStackerBonus,
    busterBonus: elementalBusterBonus,
    criticalBonus,
    breakDamage: breakerBonus,
    breakPenalty: breakGaugePenalty,
    breakGaugePenalty,
    finalDamage,
    crit,
    breakGaugeEnabled,
    breakGaugeCountered,
    variance: Number(variance.toFixed(3))
  };
}

function miniTrainingExpectedExp(state, training, config = miniConfig()) {
  const hours = Math.max(1, Number(training?.durationMs || (60 * 60 * 1000)) / (60 * 60 * 1000));
  return Math.floor(
    (miniNum(config.training?.baseExp, 0, 0) + (miniNum(config.training?.expPerHour, 900, 0) * hours))
    * (Number(state.shop?.trainingExpMultiplier) || 1)
    * (Number(config.training?.expMultiplier) || 1)
  );
}

function miniPublicState(state, req = null) {
  const computed = miniComputed(state);
  const catalog = miniCatalog();
  const config = miniConfig();
  const activeGates = state.gates.filter(g => !g.claimed);
  const activeTraining = state.training.filter(t => !t.claimed);
  return {
    ...state,
    training: state.training.map(training => training.claimed ? training : {
      ...training,
      expectedExp: miniTrainingExpectedExp(state, training, config)
    }),
    computed,
    catalog: {
      hunters: catalog.hunters,
      custom: catalog.custom,
      sungWeapons: catalog.sungWeapons,
      customRateUp: catalog.customRateUp,
      weaponRateUp: catalog.weaponRateUp
    },
    meta: {
      isAdmin: req ? isAdminReq(req) : false,
      maxLevel: miniNum(config.levels?.maxLevel, miniReadHuntersLevelMax(), 1, 999),
      hunterMaxLevel: miniReadHuntersLevelMax(),
      sungWeaponMaxLevel: miniReadSungWeaponsLevelMax(),
      expNeeded: miniExpNeeded(state.level),
      activeGates: activeGates.length,
      trainingUsed: activeTraining.length,
      hunterOrder: Array.isArray(getGlobal('order:hunters')) ? getGlobal('order:hunters') : [],
      sungWeaponOrder: Array.isArray(getGlobal('order:sungWeapons')) ? getGlobal('order:sungWeapons') : []
    },
    now: new Date().toISOString(),
    config,
    gateDefs: miniGateTable(config.gateRewards),
    gateKinds: MINI_GATE_KIND
  };
}

function miniAddExp(entity, amount) {
  entity.exp = miniNum(entity.exp, 0) + miniNum(amount, 0);
  while (entity.exp >= entity.level * 1000) {
    entity.exp -= entity.level * 1000;
    entity.level += 1;
  }
}

function miniLog(state, message) {
  state.logs = [String(message || '').slice(0, 180), ...(state.logs || [])].filter(Boolean).slice(0, 8);
}

function miniSsrRate(pityCount, cfg = miniConfig()) {
  const summon = cfg.summon || miniDefaultConfig().summon;
  const hard = miniNum(summon.hardPity, 70, 1, 300);
  const soft = miniNum(summon.softPity, 60, 1, hard);
  const pity = miniNum(pityCount, 0, 0, hard);
  const baseRate = Math.max(0, miniNum(summon.ssrRate, 1.2, 0, 1000) / 100);
  const increase = Math.max(0, miniNum(summon.softPityIncrease, 5.8, 0, 1000) / 100);
  if (pity >= hard - 1) return 1;
  if (pity >= soft - 1) return Math.min(1, baseRate + ((pity - (soft - 2)) * increase));
  return baseRate;
}

function miniRollRarity(banner, state) {
  const cfg = miniConfig();
  const rate = miniSsrRate(state.pity[banner], cfg);
  const srRate = Math.max(0, miniNum(cfg.summon?.srRate, 8.8, 0, 1000) / 100);
  const rRate = Math.max(0, miniNum(cfg.summon?.rRate, 90, 0, 1000) / 100);
  const roll = Math.random();
  if (roll < rate) return 'SSR';
  const nonSsrRoll = Math.random() * Math.max(0.0001, srRate + rRate);
  if (nonSsrRoll < srRate) return 'SR';
  return 'R';
}

function miniPick(pool, rarity) {
  const exact = pool.filter(x => x.rarity === rarity);
  const source = exact.length ? exact : pool;
  return source[Math.floor(Math.random() * source.length)];
}

function miniPickSsrWithRateUp(pool, rateUpIds, guaranteed) {
  const ssrPool = pool.filter(x => x.rarity === 'SSR');
  const rateSet = new Set(Array.isArray(rateUpIds) ? rateUpIds.map(String) : []);
  const ratePool = ssrPool.filter(x => rateSet.has(x.id));
  const outsidePool = ssrPool.filter(x => !rateSet.has(x.id));

  if (!ratePool.length) {
    return { item: miniPick(ssrPool.length ? ssrPool : pool, 'SSR'), isRateUp: false, nextGuarantee: false };
  }

  if (guaranteed || Math.random() < 0.5 || !outsidePool.length) {
    return { item: ratePool[Math.floor(Math.random() * ratePool.length)], isRateUp: true, nextGuarantee: false };
  }

  return { item: outsidePool[Math.floor(Math.random() * outsidePool.length)], isRateUp: false, nextGuarantee: true };
}

function miniAddSummonHistory(state, entry) {
  state.summonHistory = [{
    id: `summon-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    at: new Date().toISOString(),
    ...entry
  }, ...(state.summonHistory || [])].slice(0, 100);
}

function miniA10DuplicateEssence(rarity, cfg = miniConfig()) {
  const r = String(rarity || '').toUpperCase();
  return miniNum(cfg.duplicateA10Rewards?.[r], r === 'SSR' ? 100 : r === 'SR' ? 40 : 20, 0);
}



// =====================================
// Hunter Guess Minigame
// #region =====================================
const HUNTER_GUESS_TYPE = 'hunterGuess';
const HUNTER_GUESS_HUNTERS_KEY = 'hunterGuess:hunters:v1';
const HUNTER_GUESS_DAILY_PREFIX = 'hunterGuess:daily:';
const HUNTER_GUESS_MAX_GUESSES = 8;
const HUNTER_GUESS_POINTS = { 1: 100, 2: 80, 3: 60, 4: 40, 5: 30, 6: 20, 7: 10, 8: 5 };
const HUNTER_GUESS_TICKETS = { 1: 3, 2: 2, 3: 2, 4: 1, 5: 1, 6: 1, 7: 0, 8: 0 };
const HUNTER_GUESS_REWARDS_KEY = 'hunterGuess:rewards:v1';
const HUNTER_GUESS_REWARD_DEFAULTS = {
  daily: {
    1: { points: 100, drawTickets: 15, weaponTickets: 2, gold: 0, essence: 0 },
    2: { points: 80, drawTickets: 12, weaponTickets: 1, gold: 0, essence: 0 },
    3: { points: 60, drawTickets: 10, weaponTickets: 1, gold: 0, essence: 0 },
    4: { points: 40, drawTickets: 8, weaponTickets: 0, gold: 0, essence: 0 },
    5: { points: 30, drawTickets: 6, weaponTickets: 0, gold: 0, essence: 0 },
    6: { points: 20, drawTickets: 4, weaponTickets: 0, gold: 0, essence: 0 },
    7: { points: 10, drawTickets: 2, weaponTickets: 0, gold: 0, essence: 0 },
    8: { points: 5, drawTickets: 1, weaponTickets: 0, gold: 0, essence: 0 },
    failed: { points: 0, drawTickets: 0, weaponTickets: 0, gold: 0, essence: 0 }
  },
  streak: [
    { days: 3, drawTickets: 2, weaponTickets: 0, gold: 0, essence: 10 },
    { days: 5, drawTickets: 4, weaponTickets: 0, gold: 0, essence: 20 },
    { days: 7, drawTickets: 5, weaponTickets: 1, gold: 0, essence: 25 }
  ],
  weekly: {
    1: { drawTickets: 50, weaponTickets: 5, gold: 0, essence: 300 },
    2: { drawTickets: 35, weaponTickets: 3, gold: 0, essence: 200 },
    3: { drawTickets: 25, weaponTickets: 2, gold: 0, essence: 150 },
    top10: { drawTickets: 10, weaponTickets: 1, gold: 0, essence: 75 },
    participation: { drawTickets: 3, weaponTickets: 0, gold: 0, essence: 0 }
  }
};
const HUNTER_GUESS_DEFAULT_EXPORT = {"exportedAt":"2026-06-17T15:35:21.514Z","source":"https://slatracker.org/minigame/guess","count":61,"hunters":[{"key":"alicia blanche","hunter":"Alicia Blanche","name":"Alicia Blanche","element":"Water","rarity":"SSR","className":"Mage","type":"Striker","limited":"Standard","guild":"The Justicia Guild","sourceUrl":"https://slatracker.org/minigame/guess","learnedAt":"2026-06-17T14:46:43.142Z","updatedAt":"2026-06-17T15:27:26.081Z"},{"key":"amamiya mirei","hunter":"Amamiya Mirei","name":"Amamiya Mirei","element":"Wind","rarity":"SSR","className":"Assassin","type":"Striker","limited":"Standard","guild":"Japanese Hunters Association","sourceUrl":"https://slatracker.org/minigame/guess","learnedAt":"2026-06-17T15:22:04.561Z","updatedAt":"2026-06-17T15:27:26.082Z"},{"key":"anna ruiz","hunter":"Anna Ruiz","name":"Anna Ruiz","element":"Water","rarity":"SR","className":"Ranger","type":"Breaker","limited":"Standard","guild":"The Federal Bureau of Hunters","sourceUrl":"https://slatracker.org/minigame/guess","learnedAt":"2026-06-17T15:22:08.035Z","updatedAt":"2026-06-17T15:27:26.082Z"},{"key":"antoine martinez","hunter":"Antoine Martinez","name":"Antoine Martinez","element":"Light","rarity":"SSR","className":"Unknown","type":"Elemental Stacker","limited":"Standard","guild":"The Federal Bureau of Hunters","sourceUrl":"https://slatracker.org/minigame/guess","learnedAt":"2026-06-17T15:22:11.478Z","updatedAt":"2026-06-17T15:27:26.082Z"},{"key":"baek yoonho","hunter":"Baek Yoonho","name":"Baek Yoonho","element":"Light","rarity":"SSR","className":"Tank","type":"Breaker","limited":"Standard","guild":"White Tiger Guild","sourceUrl":"https://slatracker.org/minigame/guess","learnedAt":"2026-06-17T15:22:14.681Z","updatedAt":"2026-06-17T15:27:26.082Z"},{"key":"cha hae in","hunter":"Cha Hae-In","name":"Cha Hae-In","element":"Light","rarity":"SSR","className":"Fighter","type":"Striker","limited":"Standard","guild":"Hunters Guild","sourceUrl":"https://slatracker.org/minigame/guess","learnedAt":"2026-06-17T15:22:27.225Z","updatedAt":"2026-06-17T15:27:26.082Z"},{"key":"cha hae in the pure sword princess","hunter":"Cha Hae-In, the Pure Sword Princess","name":"Cha Hae-In, the Pure Sword Princess","element":"Water","rarity":"SSR","className":"Fighter","type":"Striker","limited":"Standard","guild":"Valkyrie Guild","sourceUrl":"https://slatracker.org/minigame/guess","learnedAt":"2026-06-17T15:22:30.122Z","updatedAt":"2026-06-17T15:27:26.082Z"},{"key":"charlotte","hunter":"Charlotte","name":"Charlotte","element":"Dark","rarity":"SSR","className":"Mage","type":"Striker","limited":"Standard","guild":"Helpers Guild","sourceUrl":"https://slatracker.org/minigame/guess","learnedAt":"2026-06-17T14:50:29.714Z","updatedAt":"2026-06-17T15:27:26.082Z"},{"key":"choi jong in","hunter":"Choi Jong-In","name":"Choi Jong-In","element":"Fire","rarity":"SSR","className":"Mage","type":"Striker","limited":"Standard","guild":"Hunters Guild","sourceUrl":"https://slatracker.org/minigame/guess","learnedAt":"2026-06-17T14:50:12.893Z","updatedAt":"2026-06-17T15:27:26.082Z"},{"key":"christopher reed","hunter":"Christopher Reed","name":"Christopher Reed","element":"Fire","rarity":"SSR","className":"Mage","type":"Elemental Stacker","limited":"Standard","guild":"The Federal Bureau of Hunters","sourceUrl":"https://slatracker.org/minigame/guess","learnedAt":"2026-06-17T15:28:48.962Z","updatedAt":"2026-06-17T15:29:46.907Z"},{"key":"elena renault","hunter":"Elena Renault","name":"Elena Renault","element":"Water","rarity":"SSR","className":"Unknown","type":"Supporter","limited":"Standard","guild":"The Justicia Guild","sourceUrl":"https://slatracker.org/minigame/guess","learnedAt":"2026-06-17T15:28:52.585Z","updatedAt":"2026-06-17T15:29:46.907Z"},{"key":"emma laurent","hunter":"Emma Laurent","name":"Emma Laurent","element":"Fire","rarity":"SSR","className":"Tank","type":"Breaker","limited":"Standard","guild":"The Justicia Guild","sourceUrl":"https://slatracker.org/minigame/guess","learnedAt":"2026-06-17T15:28:54.892Z","updatedAt":"2026-06-17T15:29:46.907Z"},{"key":"esil radiru","hunter":"Esil Radiru","name":"Esil Radiru","element":"Fire","rarity":"SSR","className":"Ranger","type":"Breaker","limited":"Standard","guild":"Ahjin Guild","sourceUrl":"https://slatracker.org/minigame/guess","learnedAt":"2026-06-17T15:28:57.017Z","updatedAt":"2026-06-17T15:29:46.907Z"},{"key":"fern","hunter":"Fern","name":"Fern","element":"Fire","rarity":"SSR","className":"Mage","type":"Striker","limited":"Limited","guild":"Journey Companions","sourceUrl":"https://slatracker.org/minigame/guess","learnedAt":"2026-06-17T15:29:00.304Z","updatedAt":"2026-06-17T15:29:46.907Z"},{"key":"frieren","hunter":"Frieren","name":"Frieren","element":"Water","rarity":"SSR","className":"Mage","type":"Supporter","limited":"Limited","guild":"Journey Companions","sourceUrl":"https://slatracker.org/minigame/guess","learnedAt":"2026-06-17T15:29:02.377Z","updatedAt":"2026-06-17T15:29:46.907Z"},{"key":"gina","hunter":"Gina","name":"Gina","element":"Fire","rarity":"SSR","className":"Mage","type":"Supporter","limited":"Standard","guild":"Hunters Guild","sourceUrl":"https://slatracker.org/minigame/guess","learnedAt":"2026-06-17T15:29:05.191Z","updatedAt":"2026-06-17T15:29:46.907Z"},{"key":"go gunhee","hunter":"Go Gunhee","name":"Go Gunhee","element":"Light","rarity":"SSR","className":"Tank","type":"Breaker","limited":"Standard","guild":"Hunters Association","sourceUrl":"https://slatracker.org/minigame/guess","learnedAt":"2026-06-17T15:29:08.923Z","updatedAt":"2026-06-17T15:29:46.907Z"},{"key":"goto ryuji","hunter":"Goto Ryuji","name":"Goto Ryuji","element":"Wind","rarity":"SSR","className":"Tank","type":"Breaker","limited":"Standard","guild":"Blade Guild","sourceUrl":"https://slatracker.org/minigame/guess","learnedAt":"2026-06-17T15:30:20.511Z","updatedAt":"2026-06-17T15:30:47.948Z"},{"key":"han se mi","hunter":"Han Se-Mi","name":"Han Se-Mi","element":"Wind","rarity":"SSR","className":"Healer","type":"Supporter","limited":"Standard","guild":"Hunters Guild","sourceUrl":"https://slatracker.org/minigame/guess","learnedAt":"2026-06-17T15:30:22.572Z","updatedAt":"2026-06-17T15:30:47.948Z"},{"key":"han song yi","hunter":"Han Song-Yi","name":"Han Song-Yi","element":"Water","rarity":"SR","className":"Assassin","type":"Striker","limited":"Standard","guild":"Hunters Association","sourceUrl":"https://slatracker.org/minigame/guess","learnedAt":"2026-06-17T15:30:24.212Z","updatedAt":"2026-06-17T15:30:47.948Z"},{"key":"harper","hunter":"Harper","name":"Harper","element":"Dark","rarity":"SSR","className":"Tank","type":"Breaker","limited":"Standard","guild":"Helpers Guild","sourceUrl":"https://slatracker.org/minigame/guess","learnedAt":"2026-06-17T15:30:29.376Z","updatedAt":"2026-06-17T15:30:47.948Z"},{"key":"hwang dongsoo","hunter":"Hwang Dongsoo","name":"Hwang Dongsoo","element":"Wind","rarity":"SSR","className":"Fighter","type":"Striker","limited":"Standard","guild":"Scavenger Guild","sourceUrl":"https://slatracker.org/minigame/guess","learnedAt":"2026-06-17T15:30:32.563Z","updatedAt":"2026-06-17T15:30:47.948Z"},{"key":"hwang dongsuk","hunter":"Hwang Dongsuk","name":"Hwang Dongsuk","element":"Dark","rarity":"SR","className":"Tank","type":"Breaker","limited":"Standard","guild":"Hunters Association","sourceUrl":"https://slatracker.org/minigame/guess","learnedAt":"2026-06-17T15:30:34.900Z","updatedAt":"2026-06-17T15:30:47.948Z"},{"key":"isla wright","hunter":"Isla Wright","name":"Isla Wright","element":"Dark","rarity":"SSR","className":"Healer","type":"Supporter","limited":"Standard","guild":"Helpers Guild","sourceUrl":"https://slatracker.org/minigame/guess","learnedAt":"2026-06-17T15:30:37.622Z","updatedAt":"2026-06-17T15:30:47.948Z"},{"key":"jo kyuhwan","hunter":"Jo Kyuhwan","name":"Jo Kyuhwan","element":"Light","rarity":"SR","className":"Mage","type":"Striker","limited":"Standard","guild":"Hunters Association","sourceUrl":"https://slatracker.org/minigame/guess","learnedAt":"2026-06-17T15:30:39.844Z","updatedAt":"2026-06-17T15:30:47.948Z"},{"key":"kang taeshik","hunter":"Kang Taeshik","name":"Kang Taeshik","element":"Dark","rarity":"SR","className":"Assassin","type":"Striker","limited":"Standard","guild":"Hunters Association","sourceUrl":"https://slatracker.org/minigame/guess","learnedAt":"2026-06-17T15:31:30.382Z","updatedAt":"2026-06-17T15:31:49.654Z"},{"key":"kim chul","hunter":"Kim Chul","name":"Kim Chul","element":"Light","rarity":"SR","className":"Tank","type":"Breaker","limited":"Standard","guild":"White Tiger Guild","sourceUrl":"https://slatracker.org/minigame/guess","learnedAt":"2026-06-17T15:31:32.386Z","updatedAt":"2026-06-17T15:31:49.654Z"},{"key":"kim sangshik","hunter":"Kim Sangshik","name":"Kim Sangshik","element":"Wind","rarity":"SR","className":"Tank","type":"Breaker","limited":"Standard","guild":"Hunters Association","sourceUrl":"https://slatracker.org/minigame/guess","learnedAt":"2026-06-17T15:31:35.261Z","updatedAt":"2026-06-17T15:31:49.654Z"},{"key":"laura walker","hunter":"Laura Walker","name":"Laura Walker","element":"Light","rarity":"SSR","className":"Mage","type":"Supporter","limited":"Standard","guild":"Scavenger Guild","sourceUrl":"https://slatracker.org/minigame/guess","learnedAt":"2026-06-17T15:31:36.989Z","updatedAt":"2026-06-17T15:31:49.654Z"},{"key":"lee bora","hunter":"Lee Bora","name":"Lee Bora","element":"Dark","rarity":"SSR","className":"Mage","type":"Supporter","limited":"Standard","guild":"Hunters Guild","sourceUrl":"https://slatracker.org/minigame/guess","learnedAt":"2026-06-17T15:31:38.865Z","updatedAt":"2026-06-17T15:31:49.654Z"},{"key":"lee joohee","hunter":"Lee Joohee","name":"Lee Joohee","element":"Water","rarity":"SR","className":"Healer","type":"Supporter","limited":"Standard","guild":"Hunters Association","sourceUrl":"https://slatracker.org/minigame/guess","learnedAt":"2026-06-17T15:31:42.187Z","updatedAt":"2026-06-17T15:31:49.655Z"},{"key":"lennart niermann","hunter":"Lennart Niermann","name":"Lennart Niermann","element":"Wind","rarity":"SSR","className":"Mage","type":"Striker","limited":"Standard","guild":"Richter Guild","sourceUrl":"https://slatracker.org/minigame/guess","learnedAt":"2026-06-17T14:50:55.746Z","updatedAt":"2026-06-17T15:27:26.082Z"},{"key":"lim tae gyu","hunter":"Lim Tae-Gyu","name":"Lim Tae-Gyu","element":"Dark","rarity":"SSR","className":"Ranger","type":"Breaker","limited":"Standard","guild":"Fiend Guild","sourceUrl":"https://slatracker.org/minigame/guess","learnedAt":"2026-06-17T15:31:44.608Z","updatedAt":"2026-06-17T15:31:49.655Z"},{"key":"liu zhigang","hunter":"Liu Zhigang","name":"Liu Zhigang","element":"Fire","rarity":"SSR","className":"Unknown","type":"Elemental Buster","limited":"Standard","guild":"Daybreak Guild","sourceUrl":"https://slatracker.org/minigame/guess","learnedAt":"2026-06-17T15:31:46.620Z","updatedAt":"2026-06-17T15:32:46.440Z"},{"key":"meilin fisher","hunter":"Meilin Fisher","name":"Meilin Fisher","element":"Water","rarity":"SSR","className":"Healer","type":"Supporter","limited":"Standard","guild":"The Federal Bureau of Hunters","sourceUrl":"https://slatracker.org/minigame/guess","learnedAt":"2026-06-17T15:32:32.907Z","updatedAt":"2026-06-17T15:32:46.440Z"},{"key":"meri laine","hunter":"Meri Laine","name":"Meri Laine","element":"Water","rarity":"SSR","className":"Unknown","type":"Elemental Stacker","limited":"Standard","guild":"Richter Guild","sourceUrl":"https://slatracker.org/minigame/guess","learnedAt":"2026-06-17T15:32:35.113Z","updatedAt":"2026-06-17T15:32:46.440Z"},{"key":"min byung gu","hunter":"Min Byung-Gu","name":"Min Byung-Gu","element":"Light","rarity":"SSR","className":"Healer","type":"Supporter","limited":"Standard","guild":"Hunters Association","sourceUrl":"https://slatracker.org/minigame/guess","learnedAt":"2026-06-17T15:32:37.278Z","updatedAt":"2026-06-17T15:32:46.440Z"},{"key":"minnie","hunter":"MINNIE","name":"MINNIE","element":"Dark","rarity":"SSR","className":"Assassin","type":"Striker","limited":"Limited","guild":"FOREVER","sourceUrl":"https://slatracker.org/minigame/guess","learnedAt":"2026-06-17T15:32:38.920Z","updatedAt":"2026-06-17T15:32:46.440Z"},{"key":"miyeon","hunter":"MIYEON","name":"MIYEON","element":"Light","rarity":"SSR","className":"Fighter","type":"Striker","limited":"Limited","guild":"FOREVER","sourceUrl":"https://slatracker.org/minigame/guess","learnedAt":"2026-06-17T15:32:40.808Z","updatedAt":"2026-06-17T15:32:46.440Z"},{"key":"nam chae young","hunter":"Nam Chae-Young","name":"Nam Chae-Young","element":"Water","rarity":"SR","className":"Ranger","type":"Breaker","limited":"Standard","guild":"Hunters Association","sourceUrl":"https://slatracker.org/minigame/guess","learnedAt":"2026-06-17T15:32:42.859Z","updatedAt":"2026-06-17T15:32:46.440Z"},{"key":"park beom shik","hunter":"Park Beom-Shik","name":"Park Beom-Shik","element":"Wind","rarity":"SR","className":"Fighter","type":"Striker","limited":"Standard","guild":"Hunters Association","sourceUrl":"https://slatracker.org/minigame/guess","learnedAt":"2026-06-17T15:32:44.485Z","updatedAt":"2026-06-17T15:33:37.540Z"},{"key":"park heejin","hunter":"Park Heejin","name":"Park Heejin","element":"Wind","rarity":"SR","className":"Mage","type":"Striker","limited":"Standard","guild":"White Tiger Guild","sourceUrl":"https://slatracker.org/minigame/guess","learnedAt":"2026-06-17T15:33:22.570Z","updatedAt":"2026-06-17T15:33:37.540Z"},{"key":"seo jiwoo","hunter":"Seo Jiwoo","name":"Seo Jiwoo","element":"Water","rarity":"SSR","className":"Tank","type":"Breaker","limited":"Standard","guild":"Hunters Guild","sourceUrl":"https://slatracker.org/minigame/guess","learnedAt":"2026-06-17T15:33:24.186Z","updatedAt":"2026-06-17T15:33:37.540Z"},{"key":"seorin","hunter":"Seorin","name":"Seorin","element":"Water","rarity":"SSR","className":"Ranger","type":"Breaker","limited":"Standard","guild":"Hunters Association","sourceUrl":"https://slatracker.org/minigame/guess","learnedAt":"2026-06-17T15:33:25.721Z","updatedAt":"2026-06-17T15:33:37.540Z"},{"key":"shimizu akari","hunter":"Shimizu Akari","name":"Shimizu Akari","element":"Light","rarity":"SSR","className":"Healer","type":"Supporter","limited":"Standard","guild":"Blade Guild","sourceUrl":"https://slatracker.org/minigame/guess","learnedAt":"2026-06-17T15:33:28.163Z","updatedAt":"2026-06-17T15:33:37.540Z"},{"key":"shuhua","hunter":"SHUHUA","name":"SHUHUA","element":"Water","rarity":"SSR","className":"Assassin","type":"Striker","limited":"Limited","guild":"FOREVER","sourceUrl":"https://slatracker.org/minigame/guess","learnedAt":"2026-06-17T15:33:30.029Z","updatedAt":"2026-06-17T15:33:37.540Z"},{"key":"sian halat","hunter":"Sian Halat","name":"Sian Halat","element":"Dark","rarity":"SSR","className":"Unknown","type":"Elemental Stacker","limited":"Standard","guild":"Ahjin Guild","sourceUrl":"https://slatracker.org/minigame/guess","learnedAt":"2026-06-17T15:33:31.644Z","updatedAt":"2026-06-17T15:33:37.540Z"},{"key":"silver mane baek yoonho","hunter":"Silver Mane Baek Yoonho","name":"Silver Mane Baek Yoonho","element":"Dark","rarity":"SSR","className":"Fighter","type":"Striker","limited":"Standard","guild":"White Tiger Guild","sourceUrl":"https://slatracker.org/minigame/guess","learnedAt":"2026-06-17T15:33:33.649Z","updatedAt":"2026-06-17T15:34:28.967Z"},{"key":"son kihoon","hunter":"Son Kihoon","name":"Son Kihoon","element":"Dark","rarity":"SSR","className":"Unknown","type":"Breaker","limited":"Standard","guild":"Hunters Guild","sourceUrl":"https://slatracker.org/minigame/guess","learnedAt":"2026-06-17T15:34:13.495Z","updatedAt":"2026-06-17T15:34:28.967Z"},{"key":"song chiyul","hunter":"Song Chiyul","name":"Song Chiyul","element":"Fire","rarity":"SR","className":"Mage","type":"Striker","limited":"Standard","guild":"Hunters Association","sourceUrl":"https://slatracker.org/minigame/guess","learnedAt":"2026-06-17T15:34:16.124Z","updatedAt":"2026-06-17T15:34:28.967Z"},{"key":"soyeon","hunter":"SOYEON","name":"SOYEON","element":"Wind","rarity":"SSR","className":"Ranger","type":"Breaker","limited":"Limited","guild":"FOREVER","sourceUrl":"https://slatracker.org/minigame/guess","learnedAt":"2026-06-17T15:34:18.179Z","updatedAt":"2026-06-17T15:34:28.967Z"},{"key":"stark","hunter":"Stark","name":"Stark","element":"Fire","rarity":"SSR","className":"Tank","type":"Breaker","limited":"Limited","guild":"Journey Companions","sourceUrl":"https://slatracker.org/minigame/guess","learnedAt":"2026-06-17T15:34:21.083Z","updatedAt":"2026-06-17T15:34:28.967Z"},{"key":"sugimoto reiji","hunter":"Sugimoto Reiji","name":"Sugimoto Reiji","element":"Wind","rarity":"SSR","className":"Unknown","type":"Elemental Stacker","limited":"Standard","guild":"Blade Guild","sourceUrl":"https://slatracker.org/minigame/guess","learnedAt":"2026-06-17T15:34:22.726Z","updatedAt":"2026-06-17T15:34:28.967Z"},{"key":"sung il hwan","hunter":"Sung Il-Hwan","name":"Sung Il-Hwan","element":"Dark","rarity":"SSR","className":"Assassin","type":"Striker","limited":"Standard","guild":"Unknown","sourceUrl":"https://slatracker.org/minigame/guess","learnedAt":"2026-06-17T15:34:24.379Z","updatedAt":"2026-06-17T15:34:28.967Z"},{"key":"sung jinah","hunter":"Sung Jinah","name":"Sung Jinah","element":"Wind","rarity":"SSR","className":"Mage","type":"Supporter","limited":"Standard","guild":"White Tiger Guild","sourceUrl":"https://slatracker.org/minigame/guess","learnedAt":"2026-06-17T15:34:26.340Z","updatedAt":"2026-06-17T15:35:21.289Z"},{"key":"tawata kanae","hunter":"Tawata Kanae","name":"Tawata Kanae","element":"Fire","rarity":"SSR","className":"Assassin","type":"Striker","limited":"Standard","guild":"Blade Guild","sourceUrl":"https://slatracker.org/minigame/guess","learnedAt":"2026-06-17T15:35:04.290Z","updatedAt":"2026-06-17T15:35:21.289Z"},{"key":"thomas andre","hunter":"Thomas Andre","name":"Thomas Andre","element":"Light","rarity":"SSR","className":"Fighter","type":"Striker","limited":"Standard","guild":"Scavenger Guild","sourceUrl":"https://slatracker.org/minigame/guess","learnedAt":"2026-06-17T15:35:06.541Z","updatedAt":"2026-06-17T15:35:21.289Z"},{"key":"woo jinchul","hunter":"Woo Jinchul","name":"Woo Jinchul","element":"Wind","rarity":"SSR","className":"Tank","type":"Breaker","limited":"Standard","guild":"Hunters Association","sourceUrl":"https://slatracker.org/minigame/guess","learnedAt":"2026-06-17T15:35:08.355Z","updatedAt":"2026-06-17T15:35:21.289Z"},{"key":"yoo jinho","hunter":"Yoo Jinho","name":"Yoo Jinho","element":"Light","rarity":"SR","className":"Tank","type":"Breaker","limited":"Standard","guild":"Ahjin Guild","sourceUrl":"https://slatracker.org/minigame/guess","learnedAt":"2026-06-17T15:35:09.992Z","updatedAt":"2026-06-17T15:35:21.289Z"},{"key":"yoo soohyun","hunter":"Yoo Soohyun","name":"Yoo Soohyun","element":"Fire","rarity":"SSR","className":"Mage","type":"Striker","limited":"Standard","guild":"Ahjin Guild","sourceUrl":"https://slatracker.org/minigame/guess","learnedAt":"2026-06-17T15:35:11.547Z","updatedAt":"2026-06-17T15:35:21.289Z"},{"key":"yuqi","hunter":"YUQI","name":"YUQI","element":"Fire","rarity":"SSR","className":"Tank","type":"Breaker","limited":"Limited","guild":"FOREVER","sourceUrl":"https://slatracker.org/minigame/guess","learnedAt":"2026-06-17T15:35:13.408Z","updatedAt":"2026-06-17T15:35:21.290Z"}]};

function hgToday() {
  return new Date().toISOString().slice(0, 10);
}

function hgSlug(text) {
  return String(text || '')
    .trim()
    .toLowerCase()
    .replace(/['"’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'hunter';
}

function hgKey(text) {
  return String(text || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function hgHash(s) {
  let h = 2166136261;
  const str = String(s || '');
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function hgNormalizeAssetPath(raw, fallbackFolder = 'Hunter_Icon') {
  const s = String(raw || '').trim().replace(/\\/g, '/');
  if (!s) return '';
  if (/^https?:\/\//i.test(s) || s.startsWith('data:')) return s;
  if (s.startsWith('/picture/')) return s;
  if (s.startsWith('picture/')) return `/${s}`;
  if (s.startsWith(`${fallbackFolder}/`)) return `/picture/${s}`;
  if (s.includes('/')) return `/picture/${s.replace(/^\/+/, '')}`;
  return `/picture/${fallbackFolder}/${s}`;
}

function hgDefaultIconFromName(name) {
  const file = String(name || '')
    .trim()
    .replace(/['"’]/g, '')
    .replace(/,/g, '')
    .replace(/[^A-Za-z0-9-]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return file ? `/picture/Hunter_Icon/${file}.png` : '';
}

function hgPrettyFromRel(v) {
  let s = String(v || '').trim().replace(/\\/g, '/');
  if (!s) return '';
  s = s.split('?')[0].split('#')[0];
  s = s.replace(/^\/?picture\/Guild\//i, '');
  s = s.replace(/^Guild\//i, '');
  s = s.split('/').pop() || s;
  s = s.replace(/\.[a-z0-9]+$/i, '');
  s = s.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  return s;
}

function hgHunterDetailsMap() {
  const map = new Map();
  try {
    if (typeof readHunterDetailsStore !== 'function') return map;
    const store = readHunterDetailsStore();
    for (const [name, raw] of Object.entries(store || {})) {
      const item = (typeof sanitizeHunterDetailsEntry === 'function')
        ? sanitizeHunterDetailsEntry(raw)
        : { details: raw?.details || raw || {} };
      map.set(hgKey(name), item?.details || {});
    }
  } catch (e) {
    console.error('[hunter-guess] failed to read hunter details guilds', e);
  }
  return map;
}

function hgCleanGuessMeta(src = {}, idx = 0) {
  const name = String(src?.name || src?.hunter || '').trim();
  if (!name) return null;

  // Canonical Guess fields:
  // - role: Mage / Assassin / Healer / Fighter / Tank / Ranger
  // - className: Breaker / Elemental Buster / Elemental Stacker / Striker / Supporter
  // Legacy exports used className for role and type for class, so migrate that shape here.
  const role = String(
    src?.role ||
    src?.guessRole ||
    src?.classOriginal ||
    src?.originalClass ||
    src?.classRole ||
    src?.className ||
    'Unknown'
  ).trim() || 'Unknown';

  const className = String(
    src?.guessClass ||
    src?.classGuess ||
    src?.type ||
    src?.classType ||
    src?.class ||
    src?.className ||
    'Unknown'
  ).trim() || 'Unknown';

  return {
    id: String(src?.id || src?.key || hgSlug(name)),
    key: hgKey(src?.key || name),
    slug: hgSlug(src?.slug || name),
    name,
    role,
    className,
    // Backward-compatible aliases for older code / old saved metadata.
    classOriginal: role,
    type: className,
    limited: String(src?.limited || src?.availability || 'Standard').trim() || 'Standard',
    orderNo: Number.isFinite(+src?.orderNo) ? Number(src.orderNo) : idx,
    learnedAt: String(src?.learnedAt || ''),
    updatedAt: new Date().toISOString()
  };
}

function hgGuessMetaSeedIfMissing() {
  const existing = getGlobal(HUNTER_GUESS_HUNTERS_KEY);
  if (Array.isArray(existing) && existing.length) return existing;

  const arr = Array.isArray(HUNTER_GUESS_DEFAULT_EXPORT?.hunters) ? HUNTER_GUESS_DEFAULT_EXPORT.hunters : [];
  const clean = arr.map(hgCleanGuessMeta).filter(Boolean);
  setGlobal(HUNTER_GUESS_HUNTERS_KEY, clean);
  return clean;
}

function hgGuessMetaMap() {
  const raw = hgGuessMetaSeedIfMissing();
  const map = new Map();
  for (const [idx, item] of (Array.isArray(raw) ? raw : []).entries()) {
    const clean = hgCleanGuessMeta(item, idx);
    if (!clean) continue;
    map.set(hgKey(clean.name), clean);
  }
  return map;
}

function hgReadBaseHunters() {
  try {
    if (typeof readHuntersCatalog === 'function') {
      const list = readHuntersCatalog();
      if (Array.isArray(list) && list.length) return list;
    }
  } catch (e) {
    console.error('[hunter-guess] failed to read catalog:hunters', e);
  }
  return [];
}

function hgRoleFromCatalog(h) {
  return String(h?.role || h?.type || h?.class || '').trim();
}

function hgHunterFromCatalog(src = {}, meta = {}, idx = 0, details = {}) {
  const name = String(src?.name || meta?.name || src?.hunter || '').trim();
  if (!name) return null;

  const avatar =
    hgNormalizeAssetPath(src?.image || src?.avatar || src?.avatarUrl || '') ||
    hgNormalizeAssetPath(meta?.avatar || meta?.image || '') ||
    hgDefaultIconFromName(name);

  // Role = Mage / Assassin / Healer / Fighter / Tank / Ranger.
  const role = String(
    meta?.role ||
    meta?.classOriginal ||
    src?.guessRole ||
    src?.classOriginal ||
    src?.originalClass ||
    src?.className ||
    'Unknown'
  ).trim() || 'Unknown';

  // Class = Breaker / Elemental Buster / Elemental Stacker / Striker / Supporter.
  const className = String(
    meta?.className ||
    meta?.type ||
    meta?.classGuess ||
    src?.guessClass ||
    src?.classGuess ||
    src?.type ||
    src?.class ||
    hgRoleFromCatalog(src) ||
    'Unknown'
  ).trim() || 'Unknown';

  // Guild is already maintained on the Hunter Details page. Do not duplicate it
  // in Hunter Guess metadata. Use Details first, then fall back to legacy data.
  const guildRaw = (details && Object.prototype.hasOwnProperty.call(details, 'guild'))
    ? details.guild
    : (src?.guild || meta?.guild || '');
  const guild = hgPrettyFromRel(guildRaw) || 'No Guild';

  return {
    id: hgSlug(name),
    key: hgKey(name),
    slug: hgSlug(name),
    name,
    avatar,
    element: String(src?.element || meta?.element || 'Unknown').trim() || 'Unknown',
    rarity: String(src?.rarity || meta?.rarity || 'Unknown').trim() || 'Unknown',
    className,
    role,
    // Backward-compatible aliases.
    classOriginal: role,
    type: className,
    limited: String(meta?.limited || src?.limited || src?.availability || meta?.availability || 'Standard').trim() || 'Standard',
    guild,
    orderNo: Number.isFinite(+meta?.orderNo) ? Number(meta.orderNo) : idx,
    active: true,
    updatedAt: String(meta?.updatedAt || src?.updatedAt || '')
  };
}

function hgNormalizeHunter(src, idx = 0) {
  // Backwards-compatible fallback for old JSON-only data.
  const name = String(src?.name || src?.hunter || '').trim();
  if (!name) return null;
  const meta = hgCleanGuessMeta(src, idx) || {};
  return {
    id: String(src?.id || src?.key || hgSlug(name)),
    key: hgKey(src?.key || name),
    slug: hgSlug(src?.slug || name),
    name,
    avatar: hgNormalizeAssetPath(src?.avatar || src?.avatarUrl || src?.image || src?.imageUrl || '') || hgDefaultIconFromName(name),
    element: String(src?.element || 'Unknown').trim() || 'Unknown',
    rarity: String(src?.rarity || 'Unknown').trim() || 'Unknown',
    className: meta.className || 'Unknown',
    role: meta.role || meta.classOriginal || 'Unknown',
    classOriginal: meta.role || meta.classOriginal || 'Unknown',
    type: meta.className || String(src?.type || 'Unknown').trim() || 'Unknown',
    limited: meta.limited || 'Standard',
    guild: hgPrettyFromRel(src?.guild || meta?.guild || '') || 'No Guild',
    orderNo: Number.isFinite(+src?.orderNo) ? Number(src.orderNo) : idx,
    active: true,
    learnedAt: String(src?.learnedAt || ''),
    updatedAt: new Date().toISOString()
  };
}

function hgHunters({ includeInactive = false } = {}) {
  const base = hgReadBaseHunters();
  const metaMap = hgGuessMetaMap();
  const detailsMap = hgHunterDetailsMap();

  let clean = [];
  if (base.length) {
    const order = getGlobal('order:hunters') || [];
    const orderMap = new Map(
      (Array.isArray(order) ? order : [])
        .map((name, i) => [hgKey(name), i])
    );

    clean = base
      .map((h, i) => {
        const name = String(h?.name || '').trim();
        const meta = metaMap.get(hgKey(name)) || {};
        const merged = hgHunterFromCatalog(h, meta, i, detailsMap.get(hgKey(name)) || {});
        if (!merged) return null;
        merged.orderNo = orderMap.has(hgKey(name)) ? orderMap.get(hgKey(name)) : (Number.isFinite(+meta.orderNo) ? Number(meta.orderNo) : i + 100000);
        return merged;
      })
      .filter(Boolean);
  } else {
    const raw = hgGuessMetaSeedIfMissing();
    clean = (Array.isArray(raw) ? raw : [])
      .map(hgNormalizeHunter)
      .filter(Boolean);
  }

  // Hunter Guess list should always be alphabetical, not main catalog/order order.
  clean.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' }));
  return clean;
}

function hgPublicHunter(h) {
  return {
    id: h.id,
    slug: h.slug,
    name: h.name,
    avatar: h.avatar,
    element: h.element,
    rarity: h.rarity,
    // Class = Breaker / Elemental Buster / Elemental Stacker / Striker / Supporter.
    className: h.className,
    type: h.className,
    // Role = Mage / Assassin / Healer / Fighter / Tank / Ranger.
    role: h.role || h.classOriginal,
    classOriginal: h.role || h.classOriginal,
    limited: h.limited,
    guild: h.guild,
    active: true
  };
}

function hgFindHunter(id) {
  const needle = String(id || '').trim();
  return hgHunters().find(h => String(h.id) === needle || h.slug === needle || hgKey(h.name) === hgKey(needle));
}


function hgRewardNum(v) {
  const n = Math.floor(Number(v || 0));
  return Number.isFinite(n) ? Math.max(0, Math.min(999999999, n)) : 0;
}

function hgCleanReward(raw = {}, fallback = {}) {
  return {
    points: hgRewardNum(raw.points ?? fallback.points),
    drawTickets: hgRewardNum(raw.drawTickets ?? raw.customTickets ?? raw.tickets ?? fallback.drawTickets ?? fallback.customTickets ?? fallback.tickets),
    weaponTickets: hgRewardNum(raw.weaponTickets ?? fallback.weaponTickets),
    gold: hgRewardNum(raw.gold ?? fallback.gold),
    essence: hgRewardNum(raw.essence ?? fallback.essence)
  };
}

function hgRewardHasValue(r = {}) {
  return ['points', 'drawTickets', 'weaponTickets', 'gold', 'essence'].some(k => Number(r[k] || 0) > 0);
}

function hgSanitizeRewards(raw = {}) {
  const cfg = raw && typeof raw === 'object' ? raw : {};
  const out = { daily: {}, streak: [], weekly: {} };
  for (let i = 1; i <= HUNTER_GUESS_MAX_GUESSES; i++) {
    out.daily[i] = hgCleanReward(cfg.daily?.[i] || cfg.daily?.[String(i)] || {}, HUNTER_GUESS_REWARD_DEFAULTS.daily[i]);
  }
  out.daily.failed = hgCleanReward(cfg.daily?.failed || {}, HUNTER_GUESS_REWARD_DEFAULTS.daily.failed);

  let streakRows = Array.isArray(cfg.streak) ? cfg.streak : HUNTER_GUESS_REWARD_DEFAULTS.streak;
  // Migrate the old single 7-day default into the new 3/5/7 tier defaults.
  if (Array.isArray(streakRows) && streakRows.length === 1) {
    const r = streakRows[0] || {};
    if (Number(r.days || 0) === 7 && Number(r.drawTickets || 0) === 5 && Number(r.weaponTickets || 0) === 1 && Number(r.essence || 0) === 25 && Number(r.gold || 0) === 0) {
      streakRows = HUNTER_GUESS_REWARD_DEFAULTS.streak;
    }
  }
  out.streak = streakRows
    .map((row) => ({ days: Math.max(1, Math.min(3650, Math.floor(Number(row?.days || 0)))), ...hgCleanReward(row, {}) }))
    .filter(row => row.days > 0)
    .sort((a, b) => a.days - b.days);

  for (const key of ['1', '2', '3', 'top10', 'participation']) {
    out.weekly[key] = hgCleanReward(cfg.weekly?.[key] || {}, HUNTER_GUESS_REWARD_DEFAULTS.weekly[key]);
  }
  return out;
}

function hgRewardSettings() {
  const raw = getGlobal(HUNTER_GUESS_REWARDS_KEY);
  const cfg = hgSanitizeRewards(raw || HUNTER_GUESS_REWARD_DEFAULTS);
  if (!raw) setGlobal(HUNTER_GUESS_REWARDS_KEY, cfg);
  return cfg;
}

function hgDailyRewardTable() {
  const cfg = hgRewardSettings();
  return Object.fromEntries(Array.from({ length: HUNTER_GUESS_MAX_GUESSES }, (_, i) => {
    const n = i + 1;
    return [n, cfg.daily[n]];
  }));
}

function hgPointsTable() {
  const cfg = hgRewardSettings();
  return Object.fromEntries(Array.from({ length: HUNTER_GUESS_MAX_GUESSES }, (_, i) => {
    const n = i + 1;
    return [n, Number(cfg.daily[n]?.points || 0)];
  }));
}

function hgTicketTable() {
  const cfg = hgRewardSettings();
  return Object.fromEntries(Array.from({ length: HUNTER_GUESS_MAX_GUESSES }, (_, i) => {
    const n = i + 1;
    return [n, Number(cfg.daily[n]?.drawTickets || 0)];
  }));
}

function hgTodayDateObj(date = hgToday()) {
  const d = new Date(`${date}T00:00:00.000Z`);
  return Number.isFinite(d.getTime()) ? d : new Date(new Date().toISOString().slice(0,10) + 'T00:00:00.000Z');
}

function hgDateAddDays(date, days) {
  const d = hgTodayDateObj(date);
  d.setUTCDate(d.getUTCDate() + Number(days || 0));
  return d.toISOString().slice(0, 10);
}

function hgWeekStart(date = hgToday()) {
  const d = hgTodayDateObj(date);
  const day = d.getUTCDay(); // Sunday 0, Monday 1.
  const diff = (day + 6) % 7;
  d.setUTCDate(d.getUTCDate() - diff);
  return d.toISOString().slice(0, 10);
}

function hgWeekEndExclusive(date = hgToday()) {
  return hgDateAddDays(hgWeekStart(date), 7);
}

function hgNextWeeklyResetIso(date = hgToday()) {
  return `${hgWeekEndExclusive(date)}T00:00:00.000Z`;
}

function hgCurrentStreak(data, throughDate = hgToday()) {
  let streak = 0;
  let d = throughDate;
  const results = data?.resultsByDate || {};
  for (let i = 0; i < 3660; i++) {
    const r = results[d];
    if (!r || !r.solved) break;
    streak++;
    d = hgDateAddDays(d, -1);
  }
  return streak;
}

function hgStreakRewardFor(streakDays, cfg = hgRewardSettings()) {
  const rows = (Array.isArray(cfg.streak) ? cfg.streak : [])
    .filter(row => Number(row.days || 0) > 0)
    .sort((a, b) => Number(a.days || 0) - Number(b.days || 0));
  if (!rows.length || !streakDays) return null;

  const hit = rows.filter(row => Number(row.days || 0) <= Number(streakDays || 0)).pop();
  if (!hit) return null;

  return {
    points: Number(hit.points || 0),
    drawTickets: Number(hit.drawTickets || 0),
    weaponTickets: Number(hit.weaponTickets || 0),
    gold: Number(hit.gold || 0),
    essence: Number(hit.essence || 0),
    matchedDays: [Number(hit.days || 0)]
  };
}

function hgGrantReward(userId, reward = {}, reason = 'Hunter Guess reward') {
  const clean = hgCleanReward(reward, {});
  const mini = miniLoad(userId);
  mini.gold += clean.gold;
  mini.essence += clean.essence;
  mini.customTickets += clean.drawTickets;
  mini.weaponTickets += clean.weaponTickets;
  const parts = [];
  if (clean.drawTickets) parts.push(`+${clean.drawTickets} draw tickets`);
  if (clean.weaponTickets) parts.push(`+${clean.weaponTickets} weapon tickets`);
  if (clean.gold) parts.push(`+${clean.gold} gold`);
  if (clean.essence) parts.push(`+${clean.essence} essence`);
  if (parts.length) miniLog(mini, `${reason}: ${parts.join(', ')}`);
  miniSave(userId, mini);
  return clean;
}

function hgRewardSummary(r = {}) {
  const parts = [];
  if (Number(r.points || 0)) parts.push(`${Number(r.points || 0)} pts`);
  if (Number(r.drawTickets || 0)) parts.push(`${Number(r.drawTickets || 0)} draw`);
  if (Number(r.weaponTickets || 0)) parts.push(`${Number(r.weaponTickets || 0)} weapon`);
  if (Number(r.gold || 0)) parts.push(`${Number(r.gold || 0)} gold`);
  if (Number(r.essence || 0)) parts.push(`${Number(r.essence || 0)} essence`);
  return parts.join(', ') || 'None';
}

function hgDaily(date = hgToday()) {
  const key = `${HUNTER_GUESS_DAILY_PREFIX}${date}`;
  const hunters = hgHunters();
  if (!hunters.length) return null;
  const existing = getGlobal(key);
  const existingHunter = existing?.hunterId ? hunters.find(h => h.id === existing.hunterId) : null;
  if (existingHunter) return { date, hunterId: existingHunter.id };
  const index = hgHash(`${date}:hunter-guess`) % hunters.length;
  const daily = { date, hunterId: hunters[index].id, createdAt: new Date().toISOString() };
  setGlobal(key, daily);
  return daily;
}

function hgLoadUser(userId) {
  const raw = getCollection(userId, HUNTER_GUESS_TYPE) || {};
  return {
    attemptsByDate: raw && typeof raw.attemptsByDate === 'object' && raw.attemptsByDate ? raw.attemptsByDate : {},
    resultsByDate: raw && typeof raw.resultsByDate === 'object' && raw.resultsByDate ? raw.resultsByDate : {},
    lastStreakRewardDate: typeof raw.lastStreakRewardDate === 'string' ? raw.lastStreakRewardDate : null,
    practice: raw && typeof raw.practice === 'object' && raw.practice ? raw.practice : null,
    stats: raw && typeof raw.stats === 'object' && raw.stats ? raw.stats : {}
  };
}

function hgSaveUser(userId, data) {
  setCollection(userId, HUNTER_GUESS_TYPE, data);
  return data;
}

function hgCompare(guess, secret) {
  const eq = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
  return {
    element: eq(guess.element, secret.element),
    rarity: eq(guess.rarity, secret.rarity),
    className: eq(guess.className, secret.className),
    role: eq(guess.role || guess.classOriginal, secret.role || secret.classOriginal),
    limited: eq(guess.limited, secret.limited),
    guild: eq(guess.guild, secret.guild)
  };
}

function hgAttemptPublic(attempt) {
  return {
    hunter: hgPublicHunter(attempt.hunter),
    values: {
      element: attempt.hunter.element,
      rarity: attempt.hunter.rarity,
      className: attempt.hunter.className,
      role: attempt.hunter.role || attempt.hunter.classOriginal,
      limited: attempt.hunter.limited,
      guild: attempt.hunter.guild
    },
    result: attempt.result,
    correct: !!attempt.correct,
    attemptNumber: Number(attempt.attemptNumber || 0),
    at: attempt.at || null
  };
}

function hgBuildState(req) {
  const date = hgToday();
  const daily = hgDaily(date);
  const secret = daily ? hgFindHunter(daily.hunterId) : null;
  const data = hgLoadUser(req.user.id);
  const attemptsRaw = Array.isArray(data.attemptsByDate[date]) ? data.attemptsByDate[date] : [];
  const attempts = attemptsRaw.map(a => {
    const hunter = hgFindHunter(a.hunterId);
    return hunter ? { ...a, hunter, result: a.result || (secret ? hgCompare(hunter, secret) : {}) } : null;
  }).filter(Boolean);
  const result = data.resultsByDate[date] || null;
  const finished = !!result || attempts.length >= HUNTER_GUESS_MAX_GUESSES;
  const solved = !!result?.solved;
  return {
    ok: true,
    date,
    maxGuesses: HUNTER_GUESS_MAX_GUESSES,
    guessesUsed: attempts.length,
    remaining: Math.max(0, HUNTER_GUESS_MAX_GUESSES - attempts.length),
    finished,
    solved,
    result,
    attempts: attempts.map(hgAttemptPublic),
    pointsTable: hgPointsTable(),
    ticketTable: hgTicketTable(),
    dailyRewards: hgDailyRewardTable(),
    rewardSettings: hgRewardSettings(),
    weeklyResetAt: hgNextWeeklyResetIso(date),
    secret: finished && secret ? hgPublicHunter(secret) : null
  };
}

function hgBuildGuestState() {
  const date = hgToday();
  const daily = hgDaily(date);
  return {
    ok: true,
    guest: true,
    loginRequired: true,
    canGuess: false,
    date,
    daily: daily ? { date: daily.date } : null,
    maxGuesses: HUNTER_GUESS_MAX_GUESSES,
    guessesUsed: 0,
    remaining: HUNTER_GUESS_MAX_GUESSES,
    finished: false,
    solved: false,
    result: null,
    attempts: [],
    pointsTable: hgPointsTable(),
    ticketTable: hgTicketTable(),
    dailyRewards: hgDailyRewardTable(),
    rewardSettings: hgRewardSettings(),
    weeklyResetAt: hgNextWeeklyResetIso(date),
    secret: null
  };
}

function hgPracticeNew(data, avoidHunterId = '') {
  const list = hgHunters();
  if (!list.length) return null;
  const filtered = list.filter(h => String(h.id) !== String(avoidHunterId || ''));
  const pool = filtered.length ? filtered : list;
  const pick = pool[Math.floor(Math.random() * pool.length)] || pool[0];
  data.practice = {
    secretHunterId: pick.id,
    attempts: [],
    solved: false,
    finished: false,
    startedAt: new Date().toISOString(),
    finishedAt: null
  };
  return data.practice;
}

function hgPracticePublic(data) {
  const practice = data?.practice && typeof data.practice === 'object' ? data.practice : null;
  if (!practice?.secretHunterId) {
    return { ok: true, mode: 'practice', active: false, maxGuesses: HUNTER_GUESS_MAX_GUESSES, guessesUsed: 0, remaining: HUNTER_GUESS_MAX_GUESSES, finished: false, solved: false, attempts: [] };
  }

  const secret = hgFindHunter(practice.secretHunterId);
  const attemptsRaw = Array.isArray(practice.attempts) ? practice.attempts : [];
  const attempts = attemptsRaw.map(a => {
    const hunter = hgFindHunter(a.hunterId);
    return hunter && secret ? { ...a, hunter, result: a.result || hgCompare(hunter, secret) } : null;
  }).filter(Boolean);

  const finished = !!practice.finished || !!practice.solved || attempts.length >= HUNTER_GUESS_MAX_GUESSES;
  const solved = !!practice.solved;
  return {
    ok: true,
    mode: 'practice',
    active: true,
    maxGuesses: HUNTER_GUESS_MAX_GUESSES,
    guessesUsed: attempts.length,
    remaining: Math.max(0, HUNTER_GUESS_MAX_GUESSES - attempts.length),
    finished,
    solved,
    noRewards: true,
    attempts: attempts.map(hgAttemptPublic),
    secret: finished && secret ? hgPublicHunter(secret) : null
  };
}

function hgRecalcStats(data) {
  const results = Object.values(data.resultsByDate || {});
  const solved = results.filter(r => r?.solved);
  const guessNums = solved.map(r => Number(r.guessesUsed || 0)).filter(n => n > 0);
  const played = results.length;
  const points = results.reduce((sum, r) => sum + Number(r?.pointsAwarded ?? r?.reward?.points ?? 0), 0);
  const tickets = results.reduce((sum, r) => sum + Number(r?.ticketsAwarded ?? r?.reward?.drawTickets ?? 0), 0);
  data.stats = {
    pointsTotal: points,
    ticketsTotal: tickets,
    solvedCount: solved.length,
    playedCount: played,
    bestGuess: guessNums.length ? Math.min(...guessNums) : null,
    avgGuess: guessNums.length ? Number((guessNums.reduce((a, b) => a + b, 0) / guessNums.length).toFixed(1)) : null,
    updatedAt: new Date().toISOString()
  };
  return data.stats;
}

router.get('/api/hunter-guess/hunters', (req, res) => {
  res.set('Cache-Control', 'no-store');
  return res.json({ ok: true, hunters: hgHunters().map(hgPublicHunter) });
});

router.get('/api/hunter-guess/state', (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (!(req.isAuthenticated && req.isAuthenticated())) {
    return res.json(hgBuildGuestState());
  }
  return res.json(hgBuildState(req));
});

router.post('/api/hunter-guess/submit', requireHunterGuessAuth, (req, res) => {
  res.set('Cache-Control', 'no-store');
  const date = hgToday();
  const daily = hgDaily(date);
  const secret = daily ? hgFindHunter(daily.hunterId) : null;
  if (!secret) return res.status(500).json({ ok: false, error: 'No hunter database configured' });

  const guess = hgFindHunter(req.body?.hunterId);
  if (!guess) return res.status(400).json({ ok: false, error: 'Hunter not found' });

  const data = hgLoadUser(req.user.id);
  const attempts = Array.isArray(data.attemptsByDate[date]) ? data.attemptsByDate[date] : [];
  if (data.resultsByDate[date]) return res.status(400).json({ ok: false, error: 'Today is already finished', state: hgBuildState(req) });
  if (attempts.length >= HUNTER_GUESS_MAX_GUESSES) return res.status(400).json({ ok: false, error: 'No guesses left', state: hgBuildState(req) });
  if (attempts.some(a => String(a.hunterId) === String(guess.id))) return res.status(400).json({ ok: false, error: 'You already guessed this hunter' });

  const attemptNumber = attempts.length + 1;
  const result = hgCompare(guess, secret);
  const correct = guess.id === secret.id;
  const attempt = { hunterId: guess.id, attemptNumber, result, correct, at: new Date().toISOString() };
  attempts.push(attempt);
  data.attemptsByDate[date] = attempts;

  if (correct || attempts.length >= HUNTER_GUESS_MAX_GUESSES) {
    const cfg = hgRewardSettings();
    const baseReward = correct ? hgCleanReward(cfg.daily[attemptNumber], {}) : hgCleanReward(cfg.daily.failed, {});
    const pointsAwarded = correct ? Number(baseReward.points || 0) : 0;
    const ticketsAwarded = correct ? Number(baseReward.drawTickets || 0) : 0;
    let reward = { ...baseReward };
    if (!correct) reward = { ...reward, points: 0 };

    let streakDays = correct ? 1 : 0;
    let streakReward = null;
    if (correct) {
      const yesterday = hgDateAddDays(date, -1);
      streakDays = hgCurrentStreak(data, yesterday) + 1;
      if (data.lastStreakRewardDate !== date) streakReward = hgStreakRewardFor(streakDays, cfg);
    }

    data.resultsByDate[date] = {
      date,
      solved: correct,
      guessesUsed: attemptNumber,
      pointsAwarded,
      ticketsAwarded,
      reward,
      streakDays,
      streakReward: null,
      streakRewardClaimed: false,
      secretHunterId: secret.id,
      finishedAt: new Date().toISOString()
    };

    try {
      db.transaction(() => {
        if (hgRewardHasValue(reward)) hgGrantReward(req.user.id, reward, 'Hunter Guess daily reward');
        if (streakReward && hgRewardHasValue(streakReward)) {
          hgGrantReward(req.user.id, streakReward, `Hunter Guess ${streakDays} day streak reward`);
          data.lastStreakRewardDate = date;
          data.resultsByDate[date].streakReward = streakReward;
          data.resultsByDate[date].streakRewardClaimed = true;
        }
        hgRecalcStats(data);
        hgSaveUser(req.user.id, data);
      })();
    } catch (e) {
      console.error('[hunter-guess] reward grant failed', e);
      return res.status(500).json({ ok: false, error: 'Failed to save Hunter Guess rewards' });
    }
    return res.json({ ok: true, submitted: hgAttemptPublic({ ...attempt, hunter: guess }), state: hgBuildState(req) });
  }

  hgRecalcStats(data);
  hgSaveUser(req.user.id, data);
  return res.json({ ok: true, submitted: hgAttemptPublic({ ...attempt, hunter: guess }), state: hgBuildState(req) });
});

router.get('/api/hunter-guess/practice/state', requireHunterGuessAuth, (req, res) => {
  res.set('Cache-Control', 'no-store');
  const data = hgLoadUser(req.user.id);
  return res.json(hgPracticePublic(data));
});

router.post('/api/hunter-guess/practice/start', requireHunterGuessAuth, (req, res) => {
  res.set('Cache-Control', 'no-store');
  const data = hgLoadUser(req.user.id);
  const date = hgToday();
  const daily = hgDaily(date);
  const avoid = daily?.hunterId || '';
  hgPracticeNew(data, avoid);
  hgSaveUser(req.user.id, data);
  return res.json(hgPracticePublic(data));
});

router.post('/api/hunter-guess/practice/submit', requireHunterGuessAuth, (req, res) => {
  res.set('Cache-Control', 'no-store');
  const guess = hgFindHunter(req.body?.hunterId);
  if (!guess) return res.status(400).json({ ok: false, error: 'Hunter not found' });

  const data = hgLoadUser(req.user.id);
  if (!data.practice?.secretHunterId) hgPracticeNew(data, '');

  const practice = data.practice;
  const secret = hgFindHunter(practice.secretHunterId);
  if (!secret) return res.status(500).json({ ok: false, error: 'No practice hunter configured' });

  const attempts = Array.isArray(practice.attempts) ? practice.attempts : [];
  if (practice.finished || practice.solved || attempts.length >= HUNTER_GUESS_MAX_GUESSES) {
    return res.status(400).json({ ok: false, error: 'Practice round is already finished', state: hgPracticePublic(data) });
  }
  if (attempts.some(a => String(a.hunterId) === String(guess.id))) {
    return res.status(400).json({ ok: false, error: 'You already guessed this hunter in practice', state: hgPracticePublic(data) });
  }

  const attemptNumber = attempts.length + 1;
  const result = hgCompare(guess, secret);
  const correct = guess.id === secret.id;
  attempts.push({ hunterId: guess.id, attemptNumber, result, correct, at: new Date().toISOString() });
  practice.attempts = attempts;

  if (correct || attempts.length >= HUNTER_GUESS_MAX_GUESSES) {
    practice.finished = true;
    practice.solved = correct;
    practice.finishedAt = new Date().toISOString();
  }

  data.practice = practice;
  hgSaveUser(req.user.id, data);
  return res.json({ ok: true, state: hgPracticePublic(data) });
});

router.get('/api/hunter-guess/leaderboard', (req, res) => {
  res.set('Cache-Control', 'no-store');
  const period = String(req.query?.period || 'all').toLowerCase() === 'weekly' ? 'weekly' : 'all';
  const today = hgToday();
  const weekStart = hgWeekStart(today);
  const weekEnd = hgWeekEndExclusive(today);
  const q = '%%';
  const members = listMembers({ q, limit: 1000, offset: 0 }) || [];

  const rows = members.map(u => {
    const data = hgLoadUser(u.id);
    const resultValues = Object.values(data.resultsByDate || {}).filter(r => {
      if (period !== 'weekly') return true;
      const d = String(r?.date || '');
      return d >= weekStart && d < weekEnd;
    });
    const solved = resultValues.filter(r => r?.solved);
    const guessNums = solved.map(r => Number(r.guessesUsed || 0)).filter(n => n > 0);
    const points = resultValues.reduce((sum, r) => sum + Number(r?.pointsAwarded ?? r?.reward?.points ?? 0), 0);
    const drawTickets = resultValues.reduce((sum, r) => sum + Number(r?.reward?.drawTickets ?? r?.ticketsAwarded ?? 0), 0);
    const weaponTickets = resultValues.reduce((sum, r) => sum + Number(r?.reward?.weaponTickets ?? 0), 0);
    const gold = resultValues.reduce((sum, r) => sum + Number(r?.reward?.gold ?? 0), 0);
    const essence = resultValues.reduce((sum, r) => sum + Number(r?.reward?.essence ?? 0), 0);
    return {
      userId: u.id,
      username: u.displayName || u.username || `User ${u.id}`,
      avatar: u.avatar || null,
      points,
      solved: solved.length,
      played: resultValues.length,
      best: guessNums.length ? Math.min(...guessNums) : null,
      avg: guessNums.length ? Number((guessNums.reduce((a, b) => a + b, 0) / guessNums.length).toFixed(1)) : null,
      drawTickets,
      weaponTickets,
      gold,
      essence,
      currentUser: !!(req.isAuthenticated && req.isAuthenticated() && Number(req.user?.id) === Number(u.id))
    };
  }).filter(r => r.points > 0 || r.played > 0)
    .sort((a, b) => b.points - a.points || b.solved - a.solved || (a.avg || 999) - (b.avg || 999) || a.username.localeCompare(b.username))
    .slice(0, 100)
    .map((r, i) => ({ rank: i + 1, ...r }));

  return res.json({
    ok: true,
    period,
    weekStart,
    weekEnd,
    weeklyResetAt: hgNextWeeklyResetIso(today),
    rows,
    pointsTable: hgPointsTable(),
    ticketTable: hgTicketTable(),
    dailyRewards: hgDailyRewardTable(),
    rewardSettings: hgRewardSettings()
  });
});

router.get('/api/admin/hunter-guess/daily', requireAdmin, (req, res) => {
  res.set('Cache-Control', 'no-store');
  const date = hgToday();
  const daily = hgDaily(date);
  const secret = daily ? hgFindHunter(daily.hunterId) : null;
  return res.json({
    ok: true,
    date,
    daily: daily || null,
    secret: secret ? hgPublicHunter(secret) : null
  });
});


router.get('/api/admin/hunter-guess/rewards', requireAdmin, (req, res) => {
  res.set('Cache-Control', 'no-store');
  return res.json({ ok: true, rewards: hgRewardSettings(), weeklyResetAt: hgNextWeeklyResetIso(hgToday()) });
});

router.post('/api/admin/hunter-guess/rewards', requireAdmin, express.json({ limit: '1mb' }), (req, res) => {
  res.set('Cache-Control', 'no-store');
  const rewards = hgSanitizeRewards(req.body?.rewards || req.body || {});
  setGlobal(HUNTER_GUESS_REWARDS_KEY, rewards);
  return res.json({ ok: true, rewards });
});

router.post('/api/admin/hunter-guess/compensate-today', requireAdmin, (req, res) => {
  res.set('Cache-Control', 'no-store');
  const date = hgToday();
  const cfg = hgRewardSettings();
  const rows = db.prepare(`SELECT userId, data FROM collections WHERE type = ? ORDER BY userId ASC`).all(HUNTER_GUESS_TYPE);
  const totals = { drawTickets: 0, weaponTickets: 0, gold: 0, essence: 0 };
  let checked = 0;
  let compensated = 0;

  for (const row of rows) {
    let raw;
    try { raw = JSON.parse(row.data || '{}'); } catch (_) { raw = {}; }
    const todayResult = raw?.resultsByDate?.[date];
    if (!todayResult?.solved) continue;
    checked++;

    const data = hgLoadUser(row.userId);
    const alreadyClaimed = data.lastStreakRewardDate === date
      || todayResult.streakRewardClaimed === true
      || hgRewardHasValue(todayResult.streakReward || {});
    if (alreadyClaimed) continue;

    const streakDays = hgCurrentStreak(data, date);
    const streakReward = hgStreakRewardFor(streakDays, cfg);
    if (!streakReward || !hgRewardHasValue(streakReward)) continue;

    db.transaction(() => {
      hgGrantReward(row.userId, streakReward, `Hunter Guess ${streakDays} day streak compensation`);
      data.lastStreakRewardDate = date;
      data.resultsByDate[date].streakDays = streakDays;
      data.resultsByDate[date].streakReward = streakReward;
      data.resultsByDate[date].streakRewardClaimed = true;
      hgSaveUser(row.userId, data);
    })();

    compensated++;
    for (const key of Object.keys(totals)) totals[key] += Number(streakReward[key] || 0);
  }

  return res.json({ ok: true, checked, compensated, skipped: checked - compensated, totals });
});

router.get('/api/admin/hunter-guess/hunters', requireAdmin, (req, res) => {
  res.set('Cache-Control', 'no-store');
  return res.json({ ok: true, hunters: hgHunters({ includeInactive: true }).map(hgPublicHunter) });
});

router.post('/api/admin/hunter-guess/import', requireAdmin, express.json({ limit: '2mb' }), (req, res) => {
  res.set('Cache-Control', 'no-store');
  const src = Array.isArray(req.body?.hunters) ? req.body.hunters : (Array.isArray(req.body) ? req.body : []);
  if (!src.length) return res.status(400).json({ ok: false, error: 'No hunters provided' });

  const existing = hgGuessMetaSeedIfMissing();
  const byKey = new Map((Array.isArray(existing) ? existing : [])
    .map((h, i) => hgCleanGuessMeta(h, i))
    .filter(Boolean)
    .map(h => [hgKey(h.name), h]));

  let added = 0;
  let updated = 0;

  for (const [idx, item] of src.entries()) {
    const clean = hgCleanGuessMeta(item, existing.length + idx);
    if (!clean) continue;
    const key = hgKey(clean.name);
    if (byKey.has(key)) {
      byKey.set(key, { ...byKey.get(key), ...clean, id: byKey.get(key).id, key });
      updated++;
    } else {
      byKey.set(key, clean);
      added++;
    }
  }

  const meta = Array.from(byKey.values()).map((h, i) => ({ ...h, orderNo: i }));
  setGlobal(HUNTER_GUESS_HUNTERS_KEY, meta);

  return res.json({
    ok: true,
    count: hgHunters({ includeInactive: true }).length,
    metaCount: meta.length,
    added,
    updated,
    hunters: hgHunters({ includeInactive: true }).map(hgPublicHunter)
  });
});

router.post('/api/admin/hunter-guess/hunters', requireAdmin, express.json({ limit: '2mb' }), (req, res) => {
  res.set('Cache-Control', 'no-store');
  const src = Array.isArray(req.body?.hunters) ? req.body.hunters : [];
  if (!src.length) return res.status(400).json({ ok: false, error: 'No hunters provided' });

  const existing = hgGuessMetaSeedIfMissing();
  const byKey = new Map((Array.isArray(existing) ? existing : [])
    .map((h, i) => hgCleanGuessMeta(h, i))
    .filter(Boolean)
    .map(h => [hgKey(h.name), h]));

  let updated = 0;
  for (const [idx, item] of src.entries()) {
    const clean = hgCleanGuessMeta(item, idx);
    if (!clean) continue;
    const key = hgKey(clean.name);
    byKey.set(key, { ...(byKey.get(key) || {}), ...clean, key });
    updated++;
  }

  const meta = Array.from(byKey.values()).map((h, i) => ({ ...h, orderNo: i }));
  setGlobal(HUNTER_GUESS_HUNTERS_KEY, meta);

  return res.json({
    ok: true,
    count: hgHunters({ includeInactive: true }).length,
    metaCount: meta.length,
    updated,
    hunters: hgHunters({ includeInactive: true }).map(hgPublicHunter)
  });
});

// #endregion

router.get('/api/mini-game/state', requireAuth, (req, res) => {
  res.set('Cache-Control', 'no-store');
  const state = miniSave(req.user.id, miniLoad(req.user.id));
  return res.json({ ok: true, state: miniPublicState(state, req) });
});

router.post('/api/mini-game/summon', requireAuth, (req, res) => {
  res.set('Cache-Control', 'no-store');
  const state = miniLoad(req.user.id);
  const banner = String(req.body?.banner || req.body?.type || 'custom').trim();
  const currency = String(req.body?.currency || 'ticket').trim();
  const count = miniNum(req.body?.count, 1, 1, isAdminReq(req) ? 1000 : 100);
  if (!['custom', 'weapon'].includes(banner)) return res.status(400).json({ ok: false, error: 'Bad banner' });
  if (currency !== 'ticket') return res.status(400).json({ ok: false, error: 'Summon uses tickets only' });
  const field = banner === 'custom' ? 'customTickets' : 'weaponTickets';
  if (state[field] < count) return res.status(400).json({ ok: false, error: `Not enough ${banner} tickets` });
  state[field] -= count;

  const catalog = miniCatalog();
  const pool = banner === 'custom' ? catalog.custom : catalog.sungWeapons;
  if (!pool.length) return res.status(400).json({ ok: false, error: 'Summon catalog is empty' });
  const requiredRateUp = banner === 'custom' ? 3 : 2;
  if (!Array.isArray(state.rateUp[banner]) || state.rateUp[banner].length !== requiredRateUp) {
    return res.status(400).json({ ok: false, error: 'Complete Rate Up List before summoning' });
  }

  const results = [];
  for (let i = 0; i < count; i++) {
    const rarity = miniRollRarity(banner, state);
    let item = null;
    let isRateUp = false;
    if (rarity === 'SSR') {
      const picked = miniPickSsrWithRateUp(pool, state.rateUp[banner], state.guarantee[banner]);
      item = picked.item;
      isRateUp = picked.isRateUp;
      state.guarantee[banner] = picked.nextGuarantee;
    } else {
      item = miniPick(pool, rarity);
    }

    if (!item) return res.status(400).json({ ok: false, error: 'No item available for summon' });

    const type = item.kind === 'hunter' ? 'hunter' : 'weapon';
    const list = type === 'hunter' ? state.hunters : state.weapons;
    const existing = list.find(x => x.id === item.id);
    const wasDuplicate = !!existing;
    let duplicateEssence = 0;
    let resultAdvancement = 0;

    if (existing) {
      const beforeAdvancement = miniNum(existing.advancement, 0, 0, 10);
      if (beforeAdvancement >= 10) {
        existing.advancement = 10;
        duplicateEssence = miniA10DuplicateEssence(rarity);
      } else {
        existing.advancement = Math.min(10, beforeAdvancement + 1);
        duplicateEssence = 0;
      }
      resultAdvancement = existing.advancement;
      state.essence += duplicateEssence;
    } else if (type === 'hunter') {
      list.push({ ...item, level: 1, exp: 0, advancement: 0, weaponId: null });
    } else {
      list.push({ ...item, level: 1, advancement: 0, assignedTo: null });
      if (item.ownerType === 'sung' && !state.sung.weaponId) state.sung.weaponId = item.id;
    }

    state.pity[banner] = rarity === 'SSR' ? 0 : Math.min(miniNum(miniConfig().summon?.hardPity, 70, 1, 300), miniNum(state.pity[banner], 0) + 1);
    const result = { banner, itemId: item.id, name: item.name, kind: item.kind, rarity, isRateUp, duplicate: wasDuplicate, duplicateEssence, advancement: resultAdvancement, item };
    results.push(result);
    miniAddSummonHistory(state, result);
  }
  const ssrCount = results.filter(x => x.rarity === 'SSR').length;
  miniLog(state, `${banner === 'custom' ? 'Custom Draw' : 'Weapon Custom Draw'} x${count}: ${ssrCount} SSR`);

  const saved = miniSave(req.user.id, state);
  return res.json({ ok: true, results, result: results[0] || null, state: miniPublicState(saved, req) });
});

router.post('/api/mini-game/rate-up', requireAuth, (req, res) => {
  res.set('Cache-Control', 'no-store');
  const state = miniLoad(req.user.id);
  const banner = String(req.body?.banner || '').trim();
  const ids = Array.isArray(req.body?.items) ? req.body.items.map(String) : [];
  if (!['custom', 'weapon'].includes(banner)) return res.status(400).json({ ok: false, error: 'Bad banner' });

  const catalog = miniCatalog();
  const allowed = new Set((banner === 'custom' ? catalog.customRateUp : catalog.weaponRateUp).map(x => x.id));
  const max = banner === 'custom' ? 3 : 2;
  const clean = [];
  for (const id of ids) {
    if (!allowed.has(id) || clean.includes(id)) continue;
    clean.push(id);
    if (clean.length >= max) break;
  }

  state.rateUp[banner] = clean;
  const saved = miniSave(req.user.id, state);
  return res.json({ ok: true, state: miniPublicState(saved, req) });
});

function miniShopCost(kind, state) {
  const cfg = miniConfig();
  if (kind === 'customTicket') return { essence: cfg.shopPrices.customTicket, amount: 1 };
  if (kind === 'weaponTicket') return { essence: cfg.shopPrices.weaponTicket, amount: 1 };
  if (kind === 'trainingSlots') return { essence: cfg.shopPrices.trainingSlots * state.shop.trainingSlots };
  if (kind === 'trainingMaxHours') return { essence: cfg.shopPrices.trainingMaxHours * state.shop.trainingMaxHours };
  if (kind === 'trainingExpMultiplier') return { essence: Math.floor(cfg.shopPrices.trainingExpMultiplier * state.shop.trainingExpMultiplier) };
  if (kind === 'presetSlots') return { essence: cfg.shopPrices.presetSlots * state.shop.presetSlots };
  if (kind === 'hunterGateSlots') return { essence: cfg.shopPrices.hunterGateSlots * state.shop.hunterGateSlots };
  return null;
}

function miniShopUpgradeMaxed(kind, state, cfg = miniConfig()) {
  if (kind === 'trainingSlots') return miniNum(state.shop?.trainingSlots, 1, 1) >= miniNum(cfg.maxShopUpgrades?.trainingSlots, 6, 1);
  if (kind === 'trainingMaxHours') return miniNum(state.shop?.trainingMaxHours, 1, 1) >= miniNum(cfg.maxShopUpgrades?.trainingMaxHours, 12, 1);
  if (kind === 'trainingExpMultiplier') return Number(state.shop?.trainingExpMultiplier || 1) >= Number(cfg.maxShopUpgrades?.trainingExpMultiplier || 5);
  if (kind === 'presetSlots') return miniNum(state.shop?.presetSlots, 5, 1) >= miniNum(cfg.maxShopUpgrades?.presetSlots, 10, 1);
  if (kind === 'hunterGateSlots') return miniNum(state.shop?.hunterGateSlots, 1, 1) >= miniNum(cfg.maxShopUpgrades?.hunterGateSlots, 6, 1);
  return false;
}

router.post('/api/mini-game/shop/buy', requireAuth, (req, res) => {
  res.set('Cache-Control', 'no-store');
  const state = miniLoad(req.user.id);
  const cfg = miniConfig();
  const item = String(req.body?.item || '').trim();
  const qty = ['customTicket', 'weaponTicket'].includes(item) ? miniNum(req.body?.quantity, 1, 1, 1000000) : 1;
  const cost = miniShopCost(item, state);
  if (!cost) return res.status(400).json({ ok: false, error: 'Bad shop item' });
  if (miniShopUpgradeMaxed(item, state, cfg)) return res.status(400).json({ ok: false, error: 'Upgrade is already MAX' });
  const totalCost = cost.essence * qty;
  if (state.essence < totalCost) return res.status(400).json({ ok: false, error: 'Not enough essence' });

  state.essence -= totalCost;
  if (item === 'customTicket') state.customTickets += qty;
  if (item === 'weaponTicket') state.weaponTickets += qty;
  if (item === 'trainingSlots') state.shop.trainingSlots = Math.min(cfg.maxShopUpgrades.trainingSlots, state.shop.trainingSlots + 1);
  if (item === 'trainingMaxHours') state.shop.trainingMaxHours = Math.min(cfg.maxShopUpgrades.trainingMaxHours, state.shop.trainingMaxHours + 1);
  if (item === 'trainingExpMultiplier') {
    const step = miniFloat(cfg.shopUpgradeSteps?.trainingExpMultiplier, 0.25, 0.01, 100);
    state.shop.trainingExpMultiplier = Math.min(cfg.maxShopUpgrades.trainingExpMultiplier, Number((state.shop.trainingExpMultiplier + step).toFixed(4)));
  }
  if (item === 'presetSlots') state.shop.presetSlots = Math.min(cfg.maxShopUpgrades.presetSlots, state.shop.presetSlots + 1);
  if (item === 'hunterGateSlots') state.shop.hunterGateSlots = Math.min(cfg.maxShopUpgrades.hunterGateSlots, state.shop.hunterGateSlots + 1);
  miniLog(state, `Shop: bought ${item}${qty > 1 ? ` x${qty}` : ''}`);

  const saved = miniSave(req.user.id, state);
  return res.json({ ok: true, state: miniPublicState(saved, req) });
});

function miniLockedHunterIds(state, exclude = '') {
  const ids = new Set();
  if (exclude !== 'training') {
    for (const t of state.training || []) if (!t.claimed) ids.add(t.hunterId);
  }
  if (exclude !== 'gate') {
    for (const g of state.gates || []) {
      if (!g.claimed) for (const id of g.hunterIds || []) ids.add(id);
    }
  }
  return ids;
}

function miniLockedWeaponIds(state, exclude = '') {
  const ids = new Set();
  if (exclude !== 'gate') {
    for (const g of state.gates || []) {
      if (!g.claimed) for (const id of g.weaponIds || []) ids.add(id);
    }
  }
  return ids;
}

function miniTrainingStartHandler(req, res) {
  res.set('Cache-Control', 'no-store');
  const state = miniLoad(req.user.id);
  const cfg = miniConfig();
  const hunterId = String(req.body?.hunterId || '').trim();
  const hunter = state.hunters.find(h => h.id === hunterId);
  if (!hunter) return res.status(404).json({ ok: false, error: 'Hunter not found' });
  const active = state.training.filter(t => !t.claimed);
  if (active.length >= state.shop.trainingSlots) return res.status(400).json({ ok: false, error: 'No free training slot' });
  if (active.some(t => t.hunterId === hunterId)) return res.status(400).json({ ok: false, error: 'Hunter is already training' });
  if (miniLockedHunterIds(state, 'training').has(hunterId)) return res.status(400).json({ ok: false, error: 'Hunter is locked by another activity' });

  const hours = Math.max(1, Math.min(state.shop.trainingMaxHours, miniNum(req.body?.hours, 1, 1, cfg.training?.maxTrainingTime || 12)));
  const durationMs = hours * 60 * 60 * 1000;
  const expectedExp = miniTrainingExpectedExp(state, { durationMs }, cfg);
  const nowMs = Date.now();
  state.training.push({
    id: `train-${nowMs}-${Math.random().toString(36).slice(2, 8)}`,
    hunterId,
    startAt: new Date(nowMs).toISOString(),
    finishAt: new Date(nowMs + durationMs).toISOString(),
    durationMs,
    expectedExp,
    claimed: false
  });
  state.training = state.training.slice(-12);
  miniLog(state, `${hunter.name} started training`);

  const saved = miniSave(req.user.id, state);
  return res.json({ ok: true, state: miniPublicState(saved, req) });
}

function miniTrainingFinishHandler(req, res) {
  res.set('Cache-Control', 'no-store');
  const state = miniLoad(req.user.id);
  const cfg = miniConfig();
  const id = String(req.body?.id || '').trim();
  const restart = !!req.body?.restart;
  const training = state.training.find(t => t.id === id);
  if (!training) return res.status(404).json({ ok: false, error: 'Training not found' });
  if (training.claimed) return res.status(400).json({ ok: false, error: 'Training already claimed' });
  const hunter = state.hunters.find(h => h.id === training.hunterId);
  if (!hunter) return res.status(404).json({ ok: false, error: 'Hunter not found' });

  const elapsed = Math.max(0, Date.now() - Date.parse(training.startAt));
  const ratio = Math.max(0, Math.min(1, elapsed / Math.max(1, training.durationMs || (30 * 60 * 1000))));
  const exp = Math.max(1, Math.floor(miniTrainingExpectedExp(state, training, cfg) * ratio));
  miniAddExp(hunter, exp);
  training.claimed = true;
  miniLog(state, `${hunter.name} training finished: +${exp} exp`);
  let restarted = null;
  if (restart) {
    const active = state.training.filter(t => !t.claimed);
    if (active.length >= state.shop.trainingSlots) return res.status(400).json({ ok: false, error: 'No free training slot after claim' });
    if (active.some(t => t.hunterId === hunter.id)) return res.status(400).json({ ok: false, error: 'Hunter is already training' });
    if (miniLockedHunterIds(state, 'training').has(hunter.id)) return res.status(400).json({ ok: false, error: 'Hunter is locked by another activity' });
    const hours = Math.max(1, Math.min(state.shop.trainingMaxHours, Math.ceil((training.durationMs || 0) / (60 * 60 * 1000)) || state.shop.trainingMaxHours || 1, cfg.training?.maxTrainingTime || 12));
    const durationMs = hours * 60 * 60 * 1000;
    const expectedExp = miniTrainingExpectedExp(state, { durationMs }, cfg);
    const nowMs = Date.now();
    restarted = {
      id: `train-${nowMs}-${Math.random().toString(36).slice(2, 8)}`,
      hunterId: hunter.id,
      startAt: new Date(nowMs).toISOString(),
      finishAt: new Date(nowMs + durationMs).toISOString(),
      durationMs,
      expectedExp,
      claimed: false
    };
    state.training.push(restarted);
    state.training = state.training.slice(-12);
    miniLog(state, `${hunter.name} restarted training`);
  }

  const saved = miniSave(req.user.id, state);
  return res.json({ ok: true, reward: { exp, ratio, restarted: !!restarted }, state: miniPublicState(saved, req) });
}

router.post('/api/mini-game/training/start', requireAuth, miniTrainingStartHandler);
router.post('/api/mini-game/training/finish', requireAuth, miniTrainingFinishHandler);

router.post('/api/mini-game/start-gate', requireAuth, (req, res) => {
  res.set('Cache-Control', 'no-store');
  const state = miniLoad(req.user.id);
  const cfg = miniConfig();
  const type = String(req.body?.type || '').trim() === 'hunter' ? 'hunter' : 'sung';
  const gateKind = MINI_GATE_KIND[String(req.body?.gateKind || '').toLowerCase()] ? String(req.body.gateKind).toLowerCase() : 'blue';
  const difficulty = String(req.body?.difficulty || 'E').trim().toUpperCase();
  const def = miniGateTable(cfg.gateRewards)[gateKind]?.[difficulty];
  if (!def) return res.status(400).json({ ok: false, error: 'Bad difficulty' });
  const requiredPower = type === 'hunter' ? Math.max(300, Math.floor(def.requiredPower * 0.45)) : def.requiredPower;
  const presetSlot = miniNum(req.body?.presetSlot, 0, 0);
  if (!presetSlot) return res.status(400).json({ ok: false, error: 'Select a preset' });

  const nowMs = Date.now();
  const activeSameType = state.gates.filter(g => g.type === type && !g.claimed && Date.parse(g.finishAt) > nowMs);
  const limit = type === 'hunter' ? state.shop.hunterGateSlots : 1;
  if (activeSameType.length >= limit) return res.status(400).json({ ok: false, error: `No free ${type} gate slot` });

  const lockedHunterIds = new Set();
  const lockedWeaponIds = new Set();
  for (const training of state.training || []) if (!training.claimed) lockedHunterIds.add(training.hunterId);
  for (const gate of state.gates || []) {
    if (gate.claimed) continue;
    for (const id of gate.hunterIds || []) lockedHunterIds.add(id);
    for (const id of gate.weaponIds || []) lockedWeaponIds.add(id);
  }

  let team = null;
  if (type === 'hunter') {
    try {
      team = miniValidateTeam(state, { hunters: req.body?.hunters || [], weapons: [], presetSlot, presetType: 'hunter' }, { ignoreWorldBossUsed: true });
    } catch (e) {
      return res.status(400).json({ ok: false, error: e.message || 'Bad hunter gate team' });
    }
    team.hunters = team.hunters.filter(h => !lockedHunterIds.has(h.id));
    if (!team.hunters.length) return res.status(400).json({ ok: false, error: 'No available units' });
    team.power = team.hunters.reduce((sum, h) => sum + miniHunterPower(h, state), 0);
  }
  if (type === 'sung') {
    try {
      team = miniValidateTeam(state, { hunters: [], weapons: [], presetSlot, presetType: 'sung' }, { ignoreWorldBossUsed: true });
    } catch (e) {
      return res.status(400).json({ ok: false, error: e.message || 'Bad sung gate preset' });
    }
    team.hunters = team.hunters.filter(h => !lockedHunterIds.has(h.id));
    team.weapons = team.weapons.filter(w => !lockedWeaponIds.has(w.id));
    if (!team.weapons.length && !team.hunters.length) return res.status(400).json({ ok: false, error: 'No available units' });
    team.power = (miniSungPower(state, cfg) + team.weapons.reduce((sum, w) => sum + miniWeaponPower(w), 0)) * 2
      + team.hunters.reduce((sum, h) => sum + miniHunterPower(h, state), 0);
  }

  const power = team ? team.power : miniComputed(state).teamPower;
  if (power < requiredPower) return res.status(400).json({ ok: false, error: 'Power is too low for this gate' });

  const start = new Date(nowMs);
  const finish = new Date(nowMs + def.minutes * 60 * 1000);
  state.gates.push({
    id: `gate-${nowMs}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    gateKind,
    difficulty,
    requiredPower,
    presetSlot,
    hunterIds: team ? team.hunters.map(h => h.id) : [],
    weaponIds: team ? team.weapons.map(w => w.id) : [],
    startAt: start.toISOString(),
    finishAt: finish.toISOString(),
    claimed: false
  });
  state.gates = state.gates.slice(-12);
  miniLog(state, `${MINI_GATE_KIND[gateKind].label} ${difficulty} ${type} gate started`);

  const saved = miniSave(req.user.id, state);
  return res.json({ ok: true, state: miniPublicState(saved, req) });
});

router.post('/api/mini-game/claim-gate', requireAuth, (req, res) => {
  res.set('Cache-Control', 'no-store');
  const state = miniLoad(req.user.id);
  const id = String(req.body?.id || '').trim();
  const gate = state.gates.find(g => g.id === id);
  if (!gate) return res.status(404).json({ ok: false, error: 'Gate not found' });
  if (gate.claimed) return res.status(400).json({ ok: false, error: 'Gate already claimed' });
  if (Date.parse(gate.finishAt) > Date.now()) return res.status(400).json({ ok: false, error: 'Gate is not finished yet' });

  const def = miniGateTable(miniConfig().gateRewards)[gate.gateKind]?.[gate.difficulty] || miniDefaultGateTable().blue.E;
  const ticket = Math.random() < Math.min(0.95, def.ticketChance) ? 1 : 0;
  const gold = Math.floor(def.gold);
  const exp = Math.floor(def.exp);
  const essence = Math.floor(def.essence);
  state.gold += gold;
  state.essence += essence;
  state.customTickets += ticket;
  miniAddExp(state, exp);
  let sungExp = 0;
  let hunterExp = 0;
  if (gate.type === 'sung') {
    sungExp = exp;
    hunterExp = Math.floor(exp / 2);
    miniAddExp(state.sung, sungExp);
  } else {
    hunterExp = exp;
  }
  for (const hunterId of gate.hunterIds || []) {
    const hunter = state.hunters.find(h => h.id === hunterId);
    if (hunter) miniAddExp(hunter, hunterExp);
  }
  gate.claimed = true;

  const reward = { gold, exp, essence, customTickets: ticket, sungExp, hunterExp, gateKind: gate.gateKind, difficulty: gate.difficulty, type: gate.type };
  miniLog(state, `${gate.difficulty} gate reward: +${reward.gold} gold, +${reward.exp} exp, +${reward.essence} essence${ticket ? ', +1 custom ticket' : ''}`);

  const saved = miniSave(req.user.id, state);
  return res.json({ ok: true, reward, state: miniPublicState(saved, req) });
});

router.post('/api/mini-game/start-training', requireAuth, (req, res) => {
  return miniTrainingStartHandler(req, res);
});

router.post('/api/mini-game/claim-training', requireAuth, (req, res) => {
  return miniTrainingFinishHandler(req, res);
});

function miniValidateTeam(state, input = {}, opts = {}) {
  const presetSlot = Number(input.presetSlot || 0);
  const presetType = String(input.presetType || '').trim();
  let hunterIds = Array.isArray(input.hunters) ? input.hunters.map(String) : [];
  let weaponIds = Array.isArray(input.weapons) ? input.weapons.map(String) : [];
  if (presetSlot) {
    const preset = state.presets.find(p => p.slot === presetSlot && (!presetType || (p.type || 'sung') === presetType));
    if (!preset) throw new Error('Preset not found');
    hunterIds = preset.hunters;
    weaponIds = preset.weapons;
  }
  hunterIds = Array.from(new Set(hunterIds)).slice(0, 3);
  weaponIds = Array.from(new Set(weaponIds)).slice(0, 2);
  if (hunterIds.length > 3 || weaponIds.length > 2) throw new Error('Bad team size');
  const hunters = hunterIds.map(id => state.hunters.find(h => h.id === id));
  const weapons = weaponIds.map(id => state.weapons.find(w => w.id === id && w.ownerType === 'sung'));
  if (hunters.some(x => !x)) throw new Error('Selected hunter is not owned');
  if (weapons.some(x => !x)) throw new Error('Selected weapon is not owned');
  if (!opts.ignoreWorldBossUsed) {
    const used = new Set(state.worldBoss.usedHunterIds || []);
    if (hunters.some(h => used.has(h.id))) throw new Error('A selected hunter was already used today');
  }
  const sungPower = (miniSungPower(state) + weapons.reduce((sum, w) => sum + miniWeaponPower(w), 0)) * 2;
  const huntersPower = hunters.reduce((sum, h) => sum + miniHunterPower(h, state), 0);
  return { hunters, weapons, power: sungPower + huntersPower };
}

function miniRewardFromRows(rows = []) {
  const reward = { gold: 0, essence: 0, customTickets: 0, weaponTickets: 0, items: {} };
  for (const row of Array.isArray(rows) ? rows : []) {
    const chance = miniFloat(row?.chance, 0, 0, 100);
    if (Math.random() * 100 > chance) continue;
    const amount = Math.floor(miniFloat(row?.amount, 0, 0, 999999999));
    const type = String(row?.type || '').toLowerCase();
    if (type === 'weapon ticket' || type === 'weapon tickets') reward.weaponTickets += amount;
    else if (type === 'draw ticket' || type === 'draw tickets' || type === 'custom ticket' || type === 'custom tickets') reward.customTickets += amount;
    else if (type === 'essence') reward.essence += amount;
    else if (type === 'gold') reward.gold += amount;
    else {
      const itemId = String(row?.type || '').trim();
      if (itemId) reward.items[itemId] = miniNum(reward.items[itemId], 0) + amount;
    }
  }
  return reward;
}

function miniGrantWorldBossReward(state, reward = {}) {
  state.gold += miniNum(reward.gold, 0);
  state.essence += miniNum(reward.essence, 0);
  state.customTickets += miniNum(reward.customTickets, 0);
  state.weaponTickets += miniNum(reward.weaponTickets, 0);
  for (const [itemId, amount] of Object.entries(reward.items || {})) {
    state.inventory[itemId] = miniNum(state.inventory[itemId], 0) + miniNum(amount, 0);
  }
}

router.post('/api/mini-game/preset/save', requireAuth, (req, res) => {
  res.set('Cache-Control', 'no-store');
  const state = miniLoad(req.user.id);
  const slot = miniNum(req.body?.slot, 1, 1, state.shop.presetSlots);
  const type = String(req.body?.type || 'sung') === 'hunter' ? 'hunter' : 'sung';
  const hunters = Array.from(new Set(Array.isArray(req.body?.hunters) ? req.body.hunters.map(String) : [])).slice(0, 3);
  const weapons = Array.from(new Set(Array.isArray(req.body?.weapons) ? req.body.weapons.map(String) : [])).slice(0, 2);
  if (hunters.some(id => !state.hunters.find(h => h.id === id))) return res.status(400).json({ ok: false, error: 'Selected hunter is not owned' });
  if (weapons.some(id => !state.weapons.find(w => w.id === id && w.ownerType === 'sung'))) return res.status(400).json({ ok: false, error: 'Selected weapon is not owned' });
  const next = { slot, type, name: String(req.body?.name || `${type === 'sung' ? 'Sung' : 'Hunter'} Preset ${slot}`).slice(0, 32), hunters, weapons: type === 'sung' ? weapons : [] };
  state.presets = state.presets.filter(p => !(p.slot === slot && p.type === type));
  state.presets.push(next);
  state.presets.sort((a, b) => a.slot - b.slot);
  const saved = miniSave(req.user.id, state);
  return res.json({ ok: true, preset: next, state: miniPublicState(saved, req) });
});

router.post('/api/mini-game/preset/load', requireAuth, (req, res) => {
  res.set('Cache-Control', 'no-store');
  const state = miniLoad(req.user.id);
  const slot = miniNum(req.body?.slot, 1, 1, state.shop.presetSlots);
  const preset = state.presets.find(p => p.slot === slot) || null;
  if (!preset) return res.status(404).json({ ok: false, error: 'Preset not found' });
  return res.json({ ok: true, preset, state: miniPublicState(state, req) });
});

router.post('/api/mini-game/world-boss/attack', requireAuth, (req, res) => {
  res.set('Cache-Control', 'no-store');
  const state = miniLoad(req.user.id);
  const cfg = miniConfig();
  if (state.worldBoss.date !== miniToday()) {
    state.worldBoss = miniBossForToday(state.worldBoss, cfg);
  }
  if (state.worldBoss.defeated || state.worldBoss.bossHp <= 0) return res.status(400).json({ ok: false, error: 'Next boss available after reset' });
  if (state.worldBoss.attacksUsed >= 3) return res.status(400).json({ ok: false, error: 'Daily attacks are used' });

  const presetSlot = miniNum(req.body?.presetSlot, 0, 0);
  if (!presetSlot) return res.status(400).json({ ok: false, error: 'Select a preset' });
  if ((state.worldBoss.usedPresetSlots || []).includes(presetSlot)) return res.status(400).json({ ok: false, error: 'Preset was already used today' });

  let team;
  try {
    team = miniValidateTeam(state, { ...(req.body || {}), presetSlot, presetType: 'sung' }, { ignoreWorldBossUsed: true });
  } catch (e) {
    return res.status(400).json({ ok: false, error: e.message || 'Bad world boss team' });
  }
  const lockedHunterIds = miniLockedHunterIds(state, 'worldBoss');
  const lockedWeaponIds = miniLockedWeaponIds(state, 'worldBoss');
  const usedHunterIds = new Set(state.worldBoss.usedHunterIds || []);
  const usedWeaponIds = new Set(state.worldBoss.usedWeaponIds || []);
  if (team.hunters.some(h => lockedHunterIds.has(h.id))) return res.status(400).json({ ok: false, error: 'Hunter is locked by another activity' });
  if (team.weapons.some(w => lockedWeaponIds.has(w.id))) return res.status(400).json({ ok: false, error: 'Weapon is locked by another activity' });
  if (team.hunters.some(h => usedHunterIds.has(h.id)) || team.weapons.some(w => usedWeaponIds.has(w.id))) {
    return res.status(400).json({ ok: false, error: 'A selected team member was already used today' });
  }
  const breakdown = miniWorldBossBreakdown(state, team, cfg);
  const damage = breakdown.finalDamage;
  state.worldBoss.attacksUsed += 1;
  state.worldBoss.totalDamage += damage;
  state.worldBoss.bossHp = Math.max(0, miniNum(state.worldBoss.bossHp, 1000000) - damage);
  const defeated = state.worldBoss.bossHp <= 0;
  state.worldBoss.defeated = defeated;
  const currentBossDef = miniCurrentBossDef(state, cfg);
  const bossRewards = currentBossDef.rewards || cfg.worldBossRewards || {};
  const rowReward = miniRewardFromRows(Array.isArray(bossRewards.rows) && bossRewards.rows.length ? bossRewards.rows : cfg.worldBossRewards.rows);
  const reward = {
    essence: miniNum(bossRewards.essence, cfg.worldBossRewards.essence || 0) + rowReward.essence,
    gold: miniNum(bossRewards.gold, cfg.worldBossRewards.gold || 0) + rowReward.gold,
    customTickets: miniNum(bossRewards.customTickets, cfg.worldBossRewards.customTickets || 0) + rowReward.customTickets,
    weaponTickets: miniNum(bossRewards.weaponTickets, cfg.worldBossRewards.weaponTickets || 0) + rowReward.weaponTickets,
    items: rowReward.items
  };
  miniGrantWorldBossReward(state, reward);
  const killRewards = currentBossDef.killRewards || {};
  const killRowReward = miniRewardFromRows(killRewards.rows || []);
  const killReward = defeated ? {
    gold: miniNum(killRewards.gold, 0) + killRowReward.gold,
    essence: miniNum(killRewards.essence, 0) + killRowReward.essence,
    customTickets: miniNum(killRewards.customTickets, 0) + killRowReward.customTickets,
    weaponTickets: miniNum(killRewards.weaponTickets, 0) + killRowReward.weaponTickets,
    items: killRowReward.items
  } : null;
  if (killReward) {
    state.worldBoss.pendingReward = killReward;
    state.worldBoss.rewardClaimed = false;
  }
  state.worldBoss.usedHunterIds = Array.from(new Set([...(state.worldBoss.usedHunterIds || []), ...team.hunters.map(h => h.id)]));
  state.worldBoss.usedWeaponIds = Array.from(new Set([...(state.worldBoss.usedWeaponIds || []), ...team.weapons.map(w => w.id)]));
  state.worldBoss.usedPresetSlots = Array.from(new Set([...(state.worldBoss.usedPresetSlots || []), presetSlot]));
  state.worldBoss.usedPresetTeams = {
    ...(state.worldBoss.usedPresetTeams || {}),
    [presetSlot]: {
      slot: presetSlot,
      type: 'sung',
      name: `Preset ${presetSlot}`,
      hunters: team.hunters.map(h => h.id),
      weapons: team.weapons.map(w => w.id),
      at: new Date().toISOString()
    }
  };
  state.worldBoss.presetDamage = { ...(state.worldBoss.presetDamage || {}), [presetSlot]: miniNum(state.worldBoss.presetDamage?.[presetSlot], 0) + damage };
  state.worldBoss.lastAttack = { at: new Date().toISOString(), presetSlot, damage, breakdown };
  state.worldBoss.presetAttacks = { ...(state.worldBoss.presetAttacks || {}), [presetSlot]: state.worldBoss.lastAttack };
  miniLog(state, `World Boss attack: ${damage} damage`);

  const saved = miniSave(req.user.id, state);
  return res.json({ ok: true, damage, breakdown, defeated, reward, killReward, state: miniPublicState(saved, req) });
});

router.post('/api/mini-game/world-boss/claim', requireAuth, (req, res) => {
  res.set('Cache-Control', 'no-store');
  const state = miniLoad(req.user.id);
  const cfg = miniConfig();
  if (!state.worldBoss.defeated || !state.worldBoss.pendingReward || state.worldBoss.rewardClaimed) {
    return res.status(400).json({ ok: false, error: 'No World Boss reward to claim' });
  }
  const reward = {
    gold: miniNum(state.worldBoss.pendingReward.gold, 0),
    essence: miniNum(state.worldBoss.pendingReward.essence, 0),
    customTickets: miniNum(state.worldBoss.pendingReward.customTickets, 0),
    weaponTickets: miniNum(state.worldBoss.pendingReward.weaponTickets, 0),
    items: state.worldBoss.pendingReward.items && typeof state.worldBoss.pendingReward.items === 'object' ? state.worldBoss.pendingReward.items : {}
  };
  miniGrantWorldBossReward(state, reward);
  miniLog(state, `World Boss kill reward claimed: +${reward.gold} gold, +${reward.essence} essence`);
  state.worldBoss.rewardClaimed = true;
  state.worldBoss.pendingReward = null;
  state.worldBoss = miniBossForToday(state.worldBoss, cfg);
  const saved = miniSave(req.user.id, state);
  return res.json({ ok: true, reward, state: miniPublicState(saved, req) });
});

router.post('/api/mini-game/sung-weapon/upgrade', requireAuth, (req, res) => {
  res.set('Cache-Control', 'no-store');
  const state = miniLoad(req.user.id);
  const cfg = miniConfig();
  const weaponId = String(req.body?.weaponId || '').trim();
  const weapon = state.weapons.find(row => row.id === weaponId && row.ownerType === 'sung');
  if (!weapon) return res.status(404).json({ ok: false, error: 'Sung Weapon not found' });
  const maxLevel = miniReadSungWeaponsLevelMax();
  const currentLevel = miniNum(weapon.level, 1, 1, maxLevel);
  if (currentLevel >= maxLevel) return res.status(400).json({ ok: false, error: 'Sung Weapon is already MAX' });
  const targetLevel = currentLevel + 1;
  const allRequirements = cfg.sungWeaponUpgradeRequirements || {};
  const weaponRequirements = allRequirements[weapon.catalogId] || allRequirements[weapon.id] || allRequirements[weapon.name] || allRequirements['*'] || {};
  const rawRequirements = Array.isArray(weaponRequirements[String(targetLevel)]) ? weaponRequirements[String(targetLevel)] : [];
  const requirementTotals = new Map();
  for (const row of rawRequirements) {
    const itemId = String(row?.itemId || '').trim();
    if (!itemId) continue;
    requirementTotals.set(itemId, miniNum(requirementTotals.get(itemId), 0) + miniNum(row?.amount, 1, 1));
  }
  const requirements = Array.from(requirementTotals, ([itemId, amount]) => ({ itemId, amount }));
  if (!requirements.length) return res.status(400).json({ ok: false, error: `Upgrade requirements for Lv. ${targetLevel} are not configured` });
  const missing = requirements.filter(row => miniNum(state.inventory[row.itemId], 0) < miniNum(row.amount, 1, 1));
  if (missing.length) return res.status(400).json({ ok: false, error: `Missing materials: ${missing.map(row => `${row.itemId} x${row.amount}`).join(', ')}` });
  for (const row of requirements) {
    state.inventory[row.itemId] = Math.max(0, miniNum(state.inventory[row.itemId], 0) - miniNum(row.amount, 1, 1));
    if (!state.inventory[row.itemId]) delete state.inventory[row.itemId];
  }
  weapon.level = targetLevel;
  miniLog(state, `${weapon.name} upgraded to Lv. ${targetLevel}`);
  const saved = miniSave(req.user.id, state);
  return res.json({ ok: true, weaponId, level: targetLevel, spent: requirements, state: miniPublicState(saved, req) });
});

router.get('/api/mini-game/admin/config', requireAdmin, (req, res) => {
  res.set('Cache-Control', 'no-store');
  return res.json({ ok: true, config: miniConfig() });
});

router.get('/api/mini-game/admin/boss-images', requireAdmin, (req, res) => {
  res.set('Cache-Control', 'no-store');
  const dir = path.join(process.cwd(), 'picture', 'MiniGame', 'Boss');
  try {
    const files = fs.readdirSync(dir)
      .filter(f => /\.(png|webp|jpg|jpeg|gif|svg)$/i.test(f))
      .map(f => `/picture/MiniGame/Boss/${f}`);
    return res.json({ ok: true, files });
  } catch {
    return res.json({ ok: true, files: [] });
  }
});

router.post('/api/mini-game/admin/config', requireAdmin, (req, res) => {
  res.set('Cache-Control', 'no-store');
  const config = miniCleanConfig(req.body || {});
  setGlobal(MINI_CONFIG_KEY, config);
  return res.json({ ok: true, config });
});
// #endregion

const SPECIAL_COMMISSION_TEMPLATE_KEY = 'specialCommission:template:v2';
const SPECIAL_COMMISSION_COLLECTION_TYPE = 'specialCommissionV2State';

function normalizeSpecialCommissionWeeklyOther(raw) {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};

  const pick = (v) =>
    Array.isArray(v)
      ? v.map(x => String(x || '').trim()).filter(Boolean)
      : [];

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
    ...src,
    unstableDungeon: uniqCap([
      ...pick(src.unstableDungeon),
      ...pick(src.encoreMission),
      ...pick(src.instanceDungeon),
    ], 4),
    mindRift: uniqCap([
      ...pick(src.mindRift),
      ...pick(src.mind_rift),
      ...pick(src.mindrift),
    ], 2),
  };
}

function normalizeSpecialCommissionPayload(raw) {
  const src =
    raw && typeof raw === 'object' && raw.payload && typeof raw.payload === 'object'
      ? raw.payload
      : raw;

  const body = src && typeof src === 'object' ? src : {};

  let locations = Array.isArray(body.locations) ? body.locations : [];
  locations = locations.filter(
    loc => String(loc?.category || '').trim() !== 'Secret Library'
  );

  const hasMindRift = locations.some(loc =>
    String(loc?.category || '').trim() === 'Mind Rift' ||
    String(loc?.name || '').trim().toLowerCase() === 'mind rift' ||
    String(loc?.id || '').trim().toLowerCase() === 'mind_rift'
  );

  if (!hasMindRift) {
    locations.push({
      id: 'mind_rift',
      name: 'Mind Rift',
      category: 'Mind Rift'
    });
  }

  const validLocationIds = new Set(
    locations.map(l => String(l.id || ''))
  );

  let rel = Array.isArray(body.rel) ? body.rel : [];
  rel = rel.filter(r => validLocationIds.has(String(r.locationId || '')));

  return {
    enemies: Array.isArray(body.enemies) ? body.enemies : [],
    locations,
    rel,
    weeklyOther: normalizeSpecialCommissionWeeklyOther(body.weeklyOther),
    fastIncludeMax: !!body.fastIncludeMax
  };
}

function resetSpecialCommissionProgress(payload) {
  const base = normalizeSpecialCommissionPayload(payload);
  return {
    ...base,
    enemies: base.enemies.map(enemy => ({
      ...enemy,
      level: 0,
      cur: 0
    })),
    weeklyOther: normalizeSpecialCommissionWeeklyOther(),
    fastIncludeMax: false
  };
}

function emptySpecialCommissionPayload() {
  return normalizeSpecialCommissionPayload({
    enemies: [],
    locations: [],
    rel: [],
    weeklyOther: normalizeSpecialCommissionWeeklyOther(),
    fastIncludeMax: false
  });
}

function getSpecialCommissionTemplate() {
  const fromDb = getGlobal(SPECIAL_COMMISSION_TEMPLATE_KEY);
  if (fromDb && typeof fromDb === 'object') {
    return normalizeSpecialCommissionPayload(fromDb);
  }

  return emptySpecialCommissionPayload();
}

router.get('/api/public/special-commission/v2', (req, res) => {
  return res.json(getSpecialCommissionTemplate());
});

router.get('/api/special-commission/v2', (req, res) => {
  const userParam = req.query.userId ? Number(req.query.userId) : null;
  let targetId = null;

  if (userParam) {
    const target = getUserById(userParam);
    if (!target) return res.status(404).json({ error: 'User not found' });

    const isOwner = req.isAuthenticated && req.isAuthenticated() && Number(req.user?.id) === userParam;
    const profile = getProfile(userParam);
    if (!isOwner && (profile?.visibility || 'public') !== 'public') {
      return res.status(403).json({ error: 'Profile is private' });
    }

    targetId = userParam;
  } else {
    if (!(req.isAuthenticated && req.isAuthenticated())) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    targetId = req.user.id;
  }

  const data = getCollection(targetId, SPECIAL_COMMISSION_COLLECTION_TYPE);
  if (data && typeof data === 'object') {
    const normalized = normalizeSpecialCommissionPayload(data);
    const hasStoredPayload =
      (Array.isArray(data.enemies) && data.enemies.length > 0) ||
      (Array.isArray(data.locations) && data.locations.length > 0) ||
      (Array.isArray(data.rel) && data.rel.length > 0);
    if (hasStoredPayload) {
      return res.json(normalized);
    }
  }

  if (userParam) return res.json(emptySpecialCommissionPayload());
  return res.json(resetSpecialCommissionProgress(getSpecialCommissionTemplate()));
});

router.post('/api/special-commission/v2', requireAuth, (req, res) => {
  const payload = normalizeSpecialCommissionPayload(req.body || {});
  setCollection(req.user.id, SPECIAL_COMMISSION_COLLECTION_TYPE, payload);
  return res.json({ ok: true });
});
// #endregion

// =====================================
// HUNTER WEAPON GLOBAL STATS (GLOBAL for ALL USERS)
// #region =====================================
const HUNTER_WEAPON_GLOBAL_STATS_KEY = 'sla_hunter_weapon_global_stats_v1';
const HUNTER_WEAPONS_DROPDOWNS_KEY = 'sla_hunter_weapons_dropdowns_v1';

function readHunterWeaponsDropdownsFromDb() {
  const raw = getGlobal(HUNTER_WEAPONS_DROPDOWNS_KEY);
  return sanitizeHunterWeaponsDropdownsConfig(raw || DEFAULT_HUNTER_WEAPONS_DROPDOWNS);
}

function hunterWeaponGlobalStatsDefault() {
  const cfg = readHunterWeaponsDropdownsFromDb();
  const levelMax = Number.isFinite(+cfg?.levelMax)
    ? Math.max(1, Math.min(999, Math.floor(+cfg.levelMax)))
    : 100;

  return {
    levelMin: 1,
    levelMax,
    advMin: 1,
    advMax: 11,
    precisionMax: 4000,
    hp: { minStat: 850, maxStat: 6120, minTotalPower: 601, maxTotalPower: 4900 },
    attack: { minStat: 400, maxStat: 3080, minTotalPower: 566, maxTotalPower: 4928 },
    defense: { minStat: 400, maxStat: 3080, minTotalPower: 566, maxTotalPower: 4928 }
  };
}

function sanitizeHunterWeaponGlobalStats(input) {
  const src = (input && typeof input === 'object') ? input : {};
  const def = hunterWeaponGlobalStatsDefault();

  const clampInt = (v, min, max, fallback) => {
    const n = Number(v);
    return Number.isFinite(n)
      ? Math.max(min, Math.min(max, Math.floor(n)))
      : fallback;
  };

  const readBlock = (block, fallback) => {
    const b = (block && typeof block === 'object') ? block : {};
    return {
      minStat: clampInt(b.minStat, 0, 999999, fallback.minStat),
      maxStat: clampInt(b.maxStat, 0, 999999, fallback.maxStat),
      minTotalPower: clampInt(b.minTotalPower, 0, 999999, fallback.minTotalPower),
      maxTotalPower: clampInt(b.maxTotalPower, 0, 999999, fallback.maxTotalPower)
    };
  };

  const levelMin = clampInt(src.levelMin, 1, 999, def.levelMin);
  const levelMax = clampInt(src.levelMax, levelMin, 999, def.levelMax);
  const advMin = clampInt(src.advMin, 1, 11, def.advMin);
  const advMax = clampInt(src.advMax, advMin, 11, def.advMax);
  const precisionMax = clampInt(src.precisionMax, 0, 999999, def.precisionMax);

  return {
    levelMin,
    levelMax,
    advMin,
    advMax,
    precisionMax,
    hp: readBlock(src.hp, def.hp),
    attack: readBlock(src.attack, def.attack),
    defense: readBlock(src.defense, def.defense)
  };
}

function readHunterWeaponGlobalStats() {
  const raw = getGlobal(HUNTER_WEAPON_GLOBAL_STATS_KEY);
  return sanitizeHunterWeaponGlobalStats(raw || {});
}

router.get('/api/public/hweapon-global-stats', (req, res) => {
  res.set('Cache-Control', 'no-store');

  try {
    return res.json({ ok: true, stats: readHunterWeaponGlobalStats() });
  } catch (e) {
    console.error('[public:hweapon-global-stats] error', e);
    return res.status(500).json({ error: 'internal' });
  }
});

router.post('/api/admin/hweapon-global-stats', requireAdmin, (req, res) => {
  res.set('Cache-Control', 'no-store');

  try {
    const incoming =
      (req.body?.stats && typeof req.body.stats === 'object')
        ? req.body.stats
        : req.body;

    const stats = sanitizeHunterWeaponGlobalStats(incoming || {});
    setGlobal(HUNTER_WEAPON_GLOBAL_STATS_KEY, stats);

    const currentDropdown = readHunterWeaponsDropdownsFromDb();
    const mergedDropdown = sanitizeHunterWeaponsDropdownsConfig({
      ...currentDropdown,
      levelMax: stats.levelMax
    });

    setGlobal(HUNTER_WEAPONS_DROPDOWNS_KEY, mergedDropdown);

    return res.json({ ok: true, stats, dropdowns: mergedDropdown });
  } catch (e) {
    console.error('[admin:hweapon-global-stats] error', e);
    return res.status(500).json({ error: 'internal' });
  }
});
// #endregion

// =====================================
// HUNTER WEAPON DETAILS (GLOBAL for ALL USERS)
// #region =====================================
const HUNTER_WEAPON_DETAILS_KEY = 'sla_hunter_weapon_details_v1';

function defaultWeaponDetailsSlot(mode) {
  return mode === 'max'
    ? { lvl: '', adv: '', totalPower: '', statLabel: '', statValue: '', precision: '', description: '' }
    : { lvl: '', adv: '', totalPower: '', statLabel: '', statValue: '', description: '' };
}

function sanitizeHunterWeaponDetailsEntry(input) {
  const src = (input && typeof input === 'object') ? input : {};

  const cleanSlot = (slot, mode) => {
    const base = defaultWeaponDetailsSlot(mode);
    const raw = (slot && typeof slot === 'object') ? slot : {};

    for (const key of Object.keys(base)) {
      if (typeof raw[key] !== 'undefined' && raw[key] !== null) {
        base[key] = String(raw[key]);
      }
    }

    const stat = String(base.statLabel || '').trim().toLowerCase();
    base.statLabel =
      stat === 'attack' ? 'Attack' :
      stat === 'defense' ? 'Defense' :
      'HP';

    return base;
  };

  return {
    details: {
      min: cleanSlot(src.details?.min || src.min, 'min'),
      max: cleanSlot(src.details?.max || src.max, 'max')
    }
  };
}

function readHunterWeaponDetailsStore() {
  const raw = getGlobal(HUNTER_WEAPON_DETAILS_KEY);
  return (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};
}

router.get('/api/public/hunter-weapon-details', (req, res) => {
  res.set('Cache-Control', 'no-store');

  try {
    const store = readHunterWeaponDetailsStore();
    const name = String(req.query?.name || '').trim();

    if (name) {
      const item = sanitizeHunterWeaponDetailsEntry(store[name] || {});
      return res.json({ ok: true, name, item });
    }

    const items = {};
    for (const [key, value] of Object.entries(store)) {
      items[key] = sanitizeHunterWeaponDetailsEntry(value);
    }

    return res.json({ ok: true, items });
  } catch (e) {
    console.error('[public:hunter-weapon-details] error', e);
    return res.status(500).json({ error: 'internal' });
  }
});

router.post('/api/admin/hunter-weapon-details', requireAdmin, (req, res) => {
  res.set('Cache-Control', 'no-store');

  try {
    const name = String(req.body?.name || '').trim();
    if (!name) {
      return res.status(400).json({ error: 'Missing weapon name' });
    }

    const store = readHunterWeaponDetailsStore();
    const item = sanitizeHunterWeaponDetailsEntry(req.body || {});

    store[name] = item;
    setGlobal(HUNTER_WEAPON_DETAILS_KEY, store);

    return res.json({ ok: true, name, item });
  } catch (e) {
    console.error('[admin:hunter-weapon-details] error', e);
    return res.status(500).json({ error: 'internal' });
  }
});
// #endregion

// =====================================
// PvP (Cards + Teams)
// #region =====================================
const PVP_CARDS_KEY = 'pvpCards:v1';
const PVP_TEAMS_TYPE = 'pvpTeams:v1';

// Minimal starter set (same as Pvp.js SEED_CARDS)
const PVP_SEED_CARDS = [
  {
    id: 'demolish',
    name: 'Demolish',
    type: 'weaken',
    cost: 2,
    image: '',
    description: 'Decreases the Break Gauge of a single enemy on the battlefield by [g]50%[/g].'
  },
  {
    id: 'tactics_unleashed',
    name: 'Tactics Unleashed',
    type: 'enhance',
    cost: 1,
    image: '',
    description: 'Increases max Tactic Points by [g]1[/g].'
  }
];

function normPvpCard(raw) {
  const id = String(raw?.id || raw?.name || '').trim();
  const name = String(raw?.name || '').trim();
  const typeRaw = String(raw?.type || raw?.kind || '').toLowerCase().trim();
  const type = typeRaw === 'weaken' ? 'weaken' : 'enhance';
  const cost = Math.max(0, Math.min(99, Number(raw?.cost ?? raw?.requiredTacticPoints ?? 1) || 0));
  const image = String(raw?.image || '').trim();
  const description = String(raw?.description || raw?.desc || '').trim();

  return {
    id: id || `pvp_${Date.now()}`,
    name: name || 'Unnamed',
    type,
    cost,
    image,
    description
  };
}

function normPvpTeams(t) {
  const def = t?.defense || {};
  const att = t?.attack || {};

  return {
    defense: {
      hunters: Array.isArray(def.hunters) ? def.hunters.map(String).filter(Boolean).slice(0, 5) : [],
      cards: Array.isArray(def.cards) ? def.cards.map(String).filter(Boolean).slice(0, 9) : []
    },
    attack: {
      hunters: Array.isArray(att.hunters) ? att.hunters.map(String).filter(Boolean).slice(0, 5) : [],
      cards: Array.isArray(att.cards) ? att.cards.map(String).filter(Boolean).slice(0, 9) : []
    }
  };
}

// GET cards catalog (public)
router.get('/api/pvp/cards', (req, res) => {
  let cards = getGlobal(PVP_CARDS_KEY);

  if (!Array.isArray(cards) || cards.length === 0) {
    cards = [...PVP_SEED_CARDS];
    setGlobal(PVP_CARDS_KEY, cards);
  }

  return res.json({ cards });
});

// Admin: add/update/remove cards
// POST /api/admin/pvp/cards  { action: 'add'|'update'|'remove', item: {...} }
router.post('/api/admin/pvp/cards', requireAdmin, (req, res) => {
  const action = String(req.body?.action || '').toLowerCase().trim();
  const item = req.body?.item || {};

  let cards = getGlobal(PVP_CARDS_KEY);
  if (!Array.isArray(cards) || cards.length === 0) {
    cards = [...PVP_SEED_CARDS];
  }

  if (action === 'add') {
    const next = normPvpCard(item);

    if (cards.some((c) => String(c?.id) === String(next.id))) {
      next.id = `${next.id}_${Date.now()}`;
    }

    cards.push(next);
  } else if (action === 'update') {
    const id = String(item?.id || '').trim();
    if (!id) {
      return res.status(400).json({ error: 'Missing item.id' });
    }

    const i = cards.findIndex((c) => String(c?.id) === id);
    if (i === -1) {
      return res.status(404).json({ error: 'Card not found' });
    }

    cards[i] = normPvpCard({ ...cards[i], ...item, id });
  } else if (action === 'remove') {
    const id = String(item?.id || '').trim();
    if (!id) {
      return res.status(400).json({ error: 'Missing item.id' });
    }

    cards = cards.filter((c) => String(c?.id) !== id);
  } else {
    return res.status(400).json({ error: 'Invalid action' });
  }

  // stable order: cost asc, name asc
  cards.sort((a, b) => {
    return (Number(a.cost) - Number(b.cost)) || String(a.name).localeCompare(String(b.name));
  });

  setGlobal(PVP_CARDS_KEY, cards);
  return res.json({ ok: true, cards });
});

// Teams (per-user)
router.get('/api/pvp/teams', requireAuth, (req, res) => {
  const teams = getCollection(req.user.id, PVP_TEAMS_TYPE);
  return res.json({ teams: normPvpTeams(teams) });
});

router.post('/api/pvp/teams', requireAuth, (req, res) => {
  const teams = normPvpTeams(req.body?.teams || req.body || {});
  setCollection(req.user.id, PVP_TEAMS_TYPE, teams);
  return res.json({ ok: true, teams });
});
// #endregion

// =====================================
// Profile Settings
// #region =====================================
router.post('/api/settings', requireAuth, (req, res) => {
  const displayName = String(req.body?.displayName || '').trim() || null;
  const visibility = req.body?.visibility === 'private' ? 'private' : 'public';

  if (displayName && isDisplayNameTaken(displayName, req.user.id)) {
    return res.status(409).json({ error: 'Display name already taken' });
  }

  updateProfile({
    userId: req.user.id,
    displayName,
    visibility
  });

  const profile = getProfile(req.user.id);

  return res.json({
    ok: true,
    user: {
      id: req.user.id,
      discordId: req.user.discordId,
      username: req.user.username,
      avatar: req.user.avatar,
      displayName: profile?.displayName || null,
      visibility: profile?.visibility || 'public'
    }
  });
});
// #endregion

// =====================================
// Admin Status Check
// #region =====================================
router.get('/api/admin/is-admin', (req, res) => {
  return res.json({ isAdmin: isAdminReq(req) });
});
// #endregion

// =====================================
// Admin UI Preferences
// #region =====================================
// Stored per-user via Collections (db.js)
// Example: { hideAdminButtons: true }
const ADMIN_UI_PREFS_TYPE = 'adminUiPrefs';

router.get('/api/admin/ui-prefs', requireAdmin, (req, res) => {
  res.set('Cache-Control', 'no-store');

  const prefs = getCollection(req.user.id, ADMIN_UI_PREFS_TYPE) || {};

  return res.json({
    prefs: {
      hideAdminButtons: coerceBool(prefs.hideAdminButtons)
    }
  });
});

router.post('/api/admin/ui-prefs', requireAdmin, (req, res) => {
  res.set('Cache-Control', 'no-store');

  const current = getCollection(req.user.id, ADMIN_UI_PREFS_TYPE) || {};
  const next = {
    ...current,
    hideAdminButtons: coerceBool(req.body?.hideAdminButtons)
  };

  setCollection(req.user.id, ADMIN_UI_PREFS_TYPE, next);

  return res.json({
    ok: true,
    prefs: {
      hideAdminButtons: coerceBool(next.hideAdminButtons)
    }
  });
});

// =====================================
// Coming Soon feature flags (GLOBAL)
// - stored in getGlobal/setGlobal
// - default behavior in frontend: if key missing => true (coming soon ON)
// =====================================
const COMING_SOON_KEY = 'comingSoonFlags:v1';

function loadComingSoonFlags() {
  const raw = getGlobal(COMING_SOON_KEY);
  return (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};
}

function saveComingSoonFlags(flags) {
  setGlobal(COMING_SOON_KEY, flags || {});
  return loadComingSoonFlags();
}

// Public: frontend uses it for routing
router.get('/api/coming-soon', (req, res) => {
  res.set('Cache-Control', 'no-store');
  return res.json({ flags: loadComingSoonFlags() });
});

// Admin: read flags
router.get('/api/admin/coming-soon', requireAdmin, (req, res) => {
  res.set('Cache-Control', 'no-store');
  return res.json({ flags: loadComingSoonFlags() });
});

// Admin: update flags
// Body:
//  - { key: "/hunters", enabled: true/false }  OR
//  - { flags: { "/hunters": true, "/gems": false, ... } }
router.post('/api/admin/coming-soon', requireAdmin, (req, res) => {
  res.set('Cache-Control', 'no-store');

  const cur = loadComingSoonFlags();

  if (req.body && typeof req.body.flags === 'object' && req.body.flags) {
    const next = {};

    for (const [k, v] of Object.entries(req.body.flags)) {
      const key = String(k || '').trim();
      if (!key.startsWith('/')) continue;
      next[key] = !!v;
    }

    saveComingSoonFlags(next);
    return res.json({ ok: true, flags: loadComingSoonFlags() });
  }

  const key = String(req.body?.key || '').trim();
  const enabled = !!req.body?.enabled;

  if (!key || !key.startsWith('/')) {
    return res.status(400).json({ error: 'Missing key' });
  }

  cur[key] = enabled;
  saveComingSoonFlags(cur);

  return res.json({ ok: true, flags: loadComingSoonFlags() });
});

// =====================================
// Site Maintenance settings (GLOBAL)
// - maintenance blocks the whole SPA for non-admin users
// - admins bypass it through frontend routing
// =====================================
const SITE_MAINTENANCE_KEY = 'siteMaintenance:v1';
const DEFAULT_SITE_MAINTENANCE = {
  enabled: false,
  messageTitle: '\uD83D\uDEA7 We\u2019ll be back soon!',
  messageBody: 'Our site is currently undergoing scheduled maintenance.\nPlease check back later.',
  imageSrc: '/picture/ComingSoon3.png'
};

function normalizeSiteMaintenanceSettings(raw) {
  const src = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};
  const title = String(src.messageTitle || '').trim();
  const body = String(src.messageBody || '').trim();
  const imageRaw = String(src.imageSrc || '').trim();
  const image = imageRaw === '/picture/ComingSoon3' ? '/picture/ComingSoon3.png' : imageRaw;

  return {
    enabled: typeof src.enabled === 'boolean' ? src.enabled : !!src.enabled,
    messageTitle: title || DEFAULT_SITE_MAINTENANCE.messageTitle,
    messageBody: body || DEFAULT_SITE_MAINTENANCE.messageBody,
    imageSrc: image || DEFAULT_SITE_MAINTENANCE.imageSrc
  };
}

function loadSiteMaintenanceSettings() {
  return normalizeSiteMaintenanceSettings(getGlobal(SITE_MAINTENANCE_KEY));
}

function saveSiteMaintenanceSettings(settings) {
  const normalized = normalizeSiteMaintenanceSettings(settings);
  setGlobal(SITE_MAINTENANCE_KEY, normalized);
  return loadSiteMaintenanceSettings();
}

router.get('/api/maintenance', (req, res) => {
  res.set('Cache-Control', 'no-store');
  return res.json({ settings: loadSiteMaintenanceSettings() });
});

router.get('/api/admin/maintenance', requireAdmin, (req, res) => {
  res.set('Cache-Control', 'no-store');
  return res.json({ settings: loadSiteMaintenanceSettings() });
});

router.post('/api/admin/maintenance', requireAdmin, (req, res) => {
  res.set('Cache-Control', 'no-store');
  return res.json({
    ok: true,
    settings: saveSiteMaintenanceSettings(req.body || {})
  });
});

// =====================================
// Menu visibility flags (GLOBAL)
// - true  = visible in sidebar/menu
// - false = hidden for non-admin users
// - admin still sees all public menu items unless admin flag hides it too
// =====================================
const MENU_VISIBILITY_KEY = 'menuVisibilityFlags';
const MENU_VISIBILITY_ADMIN_KEY = 'menuVisibilityAdminFlags';
const MENU_VISIBILITY_DEFAULTS = {
  hunters: true,
  hunterWeapons: true,
  sungWeapons: true,
  shadows: true,
  successors: true,
  gems: true,
  tierList: true,
  specialCommission: true,
  cores: true,
  artifacts: true,
  blessingStones: true,
  pvp: true,
  miniGame: true,
  hunterGuess: true,
  calculator: true,
  posts: true,
  suggestions: true,
  roadMap: true,
};

function normalizeMenuVisibilityFlags(raw) {
  const src = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};
  const out = { ...MENU_VISIBILITY_DEFAULTS };

  for (const key of Object.keys(MENU_VISIBILITY_DEFAULTS)) {
    if (Object.prototype.hasOwnProperty.call(src, key)) {
      out[key] = _coerceBool(src[key], true);
    }
  }

  return out;
}

function loadMenuVisibilityFlags() {
  return normalizeMenuVisibilityFlags(getGlobal(MENU_VISIBILITY_KEY));
}

function loadMenuVisibilityAdminFlags() {
  return normalizeMenuVisibilityFlags(getGlobal(MENU_VISIBILITY_ADMIN_KEY));
}

function saveMenuVisibilityFlags(flags) {
  const normalized = normalizeMenuVisibilityFlags(flags);
  const toStore = {};
  for (const [key, value] of Object.entries(normalized)) {
    toStore[key] = value ? 1 : 0;
  }
  setGlobal(MENU_VISIBILITY_KEY, toStore);
  return loadMenuVisibilityFlags();
}

function saveMenuVisibilityAdminFlags(flags) {
  const normalized = normalizeMenuVisibilityFlags(flags);
  const toStore = {};
  for (const [key, value] of Object.entries(normalized)) {
    toStore[key] = value ? 1 : 0;
  }
  setGlobal(MENU_VISIBILITY_ADMIN_KEY, toStore);
  return loadMenuVisibilityAdminFlags();
}

router.get('/api/menu-visibility', (req, res) => {
  res.set('Cache-Control', 'no-store');
  return res.json({ flags: loadMenuVisibilityFlags() });
});

router.get('/api/admin/menu-visibility', requireAdmin, (req, res) => {
  res.set('Cache-Control', 'no-store');
  return res.json({
    flags: loadMenuVisibilityFlags(),
    adminFlags: loadMenuVisibilityAdminFlags()
  });
});

router.post('/api/admin/menu-visibility', requireAdmin, (req, res) => {
  res.set('Cache-Control', 'no-store');

  const cur = loadMenuVisibilityFlags();
  const curAdmin = loadMenuVisibilityAdminFlags();

  if (req.body && req.body.flags && typeof req.body.flags === 'object') {
    const next = { ...cur };
    for (const [key, value] of Object.entries(req.body.flags)) {
      if (Object.prototype.hasOwnProperty.call(MENU_VISIBILITY_DEFAULTS, key)) {
        next[key] = _coerceBool(value, true);
      }
    }
    return res.json({
      ok: true,
      flags: saveMenuVisibilityFlags(next),
      adminFlags: loadMenuVisibilityAdminFlags()
    });
  }

  if (req.body && req.body.adminFlags && typeof req.body.adminFlags === 'object') {
    const next = { ...curAdmin };
    for (const [key, value] of Object.entries(req.body.adminFlags)) {
      if (Object.prototype.hasOwnProperty.call(MENU_VISIBILITY_DEFAULTS, key)) {
        next[key] = _coerceBool(value, true);
      }
    }
    return res.json({
      ok: true,
      flags: loadMenuVisibilityFlags(),
      adminFlags: saveMenuVisibilityAdminFlags(next)
    });
  }

  const key = String(req.body?.key || '').trim();
  if (!Object.prototype.hasOwnProperty.call(MENU_VISIBILITY_DEFAULTS, key)) {
    return res.status(400).json({ error: 'Invalid key' });
  }

  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'adminVisible')) {
    curAdmin[key] = _coerceBool(req.body?.adminVisible, true);
    return res.json({
      ok: true,
      flags: loadMenuVisibilityFlags(),
      adminFlags: saveMenuVisibilityAdminFlags(curAdmin)
    });
  }

  cur[key] = _coerceBool(req.body?.visible, true);
  return res.json({
    ok: true,
    flags: saveMenuVisibilityFlags(cur),
    adminFlags: loadMenuVisibilityAdminFlags()
  });
});
// #endregion

// =====================================
// Suggestions / Tickets (GLOBAL)
// #region =====================================
const SUGGESTIONS_LIST_KEY = 'suggestions:list';
const SUGGESTIONS_NEXT_ID_KEY = 'suggestions:nextId';
const SUGGESTION_TYPES = new Set(['feature_request', 'enhancement', 'bug_report']);
const SUGGESTION_STATUSES = new Set(['opened', 'in_progress', 'closed']);
const SUGGESTION_IMAGE_MIMES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const SUGGESTION_MAX_FILE_SIZE = 10 * 1024 * 1024;

function nowIsoString() {
  return new Date().toISOString();
}

function readSuggestionsList() {
  const raw = getGlobal(SUGGESTIONS_LIST_KEY);
  return Array.isArray(raw) ? raw.map(normalizeSuggestionItem).filter(Boolean) : [];
}

function writeSuggestionsList(items) {
  setGlobal(SUGGESTIONS_LIST_KEY, Array.isArray(items) ? items : []);
}

function readSuggestionsNextId() {
  const raw = Number(getGlobal(SUGGESTIONS_NEXT_ID_KEY));
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 1;
}

function writeSuggestionsNextId(nextId) {
  setGlobal(SUGGESTIONS_NEXT_ID_KEY, Math.max(1, Math.floor(Number(nextId) || 1)));
}

function getNextAvailableSuggestionId(items) {
  const used = new Set(
    (Array.isArray(items) ? items : [])
      .map(item => Number(item?.id))
      .filter(id => Number.isFinite(id) && id > 0)
      .map(id => Math.floor(id))
  );

  let id = 1;
  while (used.has(id)) id++;
  return id;
}

function normalizeSuggestionAttachment(input) {
  const src = (input && typeof input === 'object') ? input : {};
  const name = String(src.name || '').trim();
  const url = String(src.url || '').trim();
  const mime = String(src.mime || '').trim().toLowerCase();
  const size = Number(src.size || 0);

  if (!name || !url) return null;
  if (mime && !SUGGESTION_IMAGE_MIMES.has(mime)) return null;
  if (Number.isFinite(size) && size > SUGGESTION_MAX_FILE_SIZE) return null;

  return {
    name: name.slice(0, 180),
    url,
    mime: mime || 'image/png',
    size: Number.isFinite(size) && size > 0 ? Math.floor(size) : 0
  };
}

function normalizeSuggestionComment(input) {
  const src = (input && typeof input === 'object') ? input : {};
  const message = String(src.message || '').trim();
  if (!message) return null;

  return {
    id: String(src.id || `${Date.now()}`),
    authorId: String(src.authorId || ''),
    authorName: String(src.authorName || 'User').trim() || 'User',
    message,
    createdAt: String(src.createdAt || nowIsoString())
  };
}

function normalizeSuggestionItem(input) {
  const src = (input && typeof input === 'object') ? input : {};
  const id = Number(src.id);
  const title = String(src.title || '').trim();
  const type = String(src.type || '').trim();
  const description = String(src.description || '').trim();
  const status = String(src.status || 'opened').trim();

  if (!Number.isFinite(id) || id <= 0 || !title || !SUGGESTION_TYPES.has(type)) return null;

  return {
    id: Math.floor(id),
    title,
    type,
    description,
    status: SUGGESTION_STATUSES.has(status) ? status : 'opened',
    authorId: String(src.authorId || ''),
    authorName: String(src.authorName || 'User').trim() || 'User',
    createdAt: String(src.createdAt || nowIsoString()),
    updatedAt: String(src.updatedAt || src.createdAt || nowIsoString()),
    attachments: Array.isArray(src.attachments)
      ? src.attachments.map(normalizeSuggestionAttachment).filter(Boolean)
      : [],
    comments: Array.isArray(src.comments)
      ? src.comments.map(normalizeSuggestionComment).filter(Boolean)
      : [],
    votes: Array.isArray(src.votes)
      ? Array.from(new Set(src.votes.map(v => String(v || '').trim()).filter(Boolean)))
      : []
  };
}

function getSuggestionById(id) {
  const numericId = Number(id);
  if (!Number.isFinite(numericId) || numericId <= 0) return { item: null, items: [] };

  const items = readSuggestionsList();
  const item = items.find(x => Number(x.id) === Math.floor(numericId)) || null;
  return { item, items };
}

function suggestionAuthorName(req) {
  if (!req.user) return 'User';
  const profile = getProfile(req.user.id);
  return String(profile?.displayName || req.user.username || req.user.email || 'User').trim() || 'User';
}

function suggestionUserId(req) {
  return String(req.user?.id || req.user?.discordId || '').trim();
}

function sanitizeSuggestionInput(body) {
  const title = String(body?.title || '').trim();
  const type = String(body?.type || '').trim();
  const description = String(body?.description || '').trim();
  const rawAttachments = Array.isArray(body?.attachments) ? body.attachments : [];
  const attachments = rawAttachments.map(normalizeSuggestionAttachment).filter(Boolean);

  if (!title) return { error: 'Title is required' };
  if (!SUGGESTION_TYPES.has(type)) return { error: 'Invalid type' };
  if (!description) return { error: 'Description is required' };
  if (attachments.length !== rawAttachments.length) return { error: 'Invalid attachment' };

  return {
    item: {
      title: title.slice(0, 180),
      type,
      description: description.slice(0, 12000),
      attachments
    }
  };
}

function removeSuggestionFiles(id, item = null) {
  const sid = String(Math.floor(Number(id) || 0));
  if (!sid || sid === '0') return;

  try {
    const dir = resolveInCategory('Suggestions', sid);
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });

    const attachments = Array.isArray(item?.attachments) ? item.attachments : [];
    for (const attachment of attachments) {
      const rawUrl = String(attachment?.url || '').split('?')[0];
      const marker = '/picture/Suggestions/';
      const at = rawUrl.indexOf(marker);
      if (at < 0) continue;

      const relRaw = rawUrl.slice(at + marker.length);
      if (!relRaw) continue;

      let rel = relRaw;
      try { rel = decodeURIComponent(relRaw); } catch {}

      const filePath = resolveInCategory('Suggestions', rel);
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        fs.unlinkSync(filePath);
      }
    }
  } catch (e) {
    console.error('[suggestions:delete-files] error', e);
  }
}

router.get('/api/suggestions', (req, res) => {
  res.set('Cache-Control', 'no-store');
  return res.json({ ok: true, items: readSuggestionsList() });
});

router.get('/api/suggestions/:id', (req, res) => {
  res.set('Cache-Control', 'no-store');

  const { item } = getSuggestionById(req.params.id);
  if (!item) return res.status(404).json({ error: 'Suggestion not found' });

  const uid = (req.isAuthenticated && req.isAuthenticated()) ? suggestionUserId(req) : '';
  return res.json({
    ok: true,
    item,
    votedByMe: !!uid && item.votes.includes(uid),
    voteCount: item.votes.length
  });
});

router.post('/api/suggestions', requireAuth, (req, res) => {
  res.set('Cache-Control', 'no-store');

  const cleaned = sanitizeSuggestionInput(req.body || {});
  if (cleaned.error) return res.status(400).json({ error: cleaned.error });

  try {
    const created = db.transaction(() => {
      const items = readSuggestionsList();
      const id = getNextAvailableSuggestionId(items);
      const now = nowIsoString();
      const item = {
        id,
        title: cleaned.item.title,
        type: cleaned.item.type,
        description: cleaned.item.description,
        status: 'opened',
        authorId: suggestionUserId(req),
        authorName: suggestionAuthorName(req),
        createdAt: now,
        updatedAt: now,
        attachments: cleaned.item.attachments,
        comments: [],
        votes: []
      };

      items.push(item);
      writeSuggestionsList(items);
      writeSuggestionsNextId(getNextAvailableSuggestionId(items));
      return item;
    })();

    return res.status(201).json({ ok: true, item: created });
  } catch (e) {
    console.error('[suggestions:create] error', e);
    return res.status(500).json({ error: 'Failed to create suggestion' });
  }
});

router.post('/api/suggestions/:id/status', requireAdmin, (req, res) => {
  res.set('Cache-Control', 'no-store');

  const status = String(req.body?.status || '').trim();
  if (!SUGGESTION_STATUSES.has(status)) return res.status(400).json({ error: 'Invalid status' });

  const id = Number(req.params.id);
  const items = readSuggestionsList();
  const idx = items.findIndex(x => Number(x.id) === id);
  if (idx < 0) return res.status(404).json({ error: 'Suggestion not found' });

  items[idx] = { ...items[idx], status, updatedAt: nowIsoString() };
  writeSuggestionsList(items);
  return res.json({ ok: true, item: items[idx] });
});

router.post('/api/suggestions/:id/comment', requireAuth, (req, res) => {
  res.set('Cache-Control', 'no-store');

  const message = String(req.body?.message || '').trim();
  if (!message) return res.status(400).json({ error: 'Comment cannot be empty' });

  const id = Number(req.params.id);
  const items = readSuggestionsList();
  const idx = items.findIndex(x => Number(x.id) === id);
  if (idx < 0) return res.status(404).json({ error: 'Suggestion not found' });

  const comment = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    authorId: suggestionUserId(req),
    authorName: suggestionAuthorName(req),
    message: message.slice(0, 4000),
    createdAt: nowIsoString()
  };

  items[idx].comments = Array.isArray(items[idx].comments) ? items[idx].comments : [];
  items[idx].comments.push(comment);
  items[idx].updatedAt = nowIsoString();
  writeSuggestionsList(items);

  return res.json({ ok: true, comment, item: items[idx] });
});

router.post('/api/suggestions/:id/vote', requireAuth, (req, res) => {
  res.set('Cache-Control', 'no-store');

  const id = Number(req.params.id);
  const uid = suggestionUserId(req);
  const items = readSuggestionsList();
  const idx = items.findIndex(x => Number(x.id) === id);
  if (idx < 0) return res.status(404).json({ error: 'Suggestion not found' });

  const votes = Array.isArray(items[idx].votes) ? items[idx].votes.map(String) : [];
  const voted = votes.includes(uid);
  items[idx].votes = voted ? votes.filter(x => x !== uid) : [...votes, uid];
  items[idx].updatedAt = nowIsoString();
  writeSuggestionsList(items);

  return res.json({
    ok: true,
    voteCount: items[idx].votes.length,
    votedByMe: !voted
  });
});

router.delete('/api/suggestions/:id', requireAdmin, (req, res) => {
  res.set('Cache-Control', 'no-store');

  const id = Number(req.params.id);
  const items = readSuggestionsList();
  const removed = items.find(x => Number(x.id) === id) || null;
  const next = items.filter(x => Number(x.id) !== id);
  if (next.length === items.length) return res.status(404).json({ error: 'Suggestion not found' });

  writeSuggestionsList(next);
  writeSuggestionsNextId(getNextAvailableSuggestionId(next));
  removeSuggestionFiles(id, removed);
  return res.json({ ok: true });
});
// #endregion

// =====================================
// Admin Management (DB)
// #region =====================================
// GET current admins list
router.get('/api/admin/admins', requireAdmin, (req, res) => {
  return res.json({ admins: getAdminsMerged() });
});

// ADD admin  { discordId: "123" }
router.post('/api/admin/admins', requireAdmin, (req, res) => {
  const did = String(req.body?.discordId || '').trim();
  if (!did) {
    return res.status(400).json({ error: 'Missing discordId' });
  }

  const list = readAdminDbList();
  if (!list.includes(did)) {
    list.push(did);
  }

  setGlobal(ADMINS_DB_KEY, list);
  return res.json({ ok: true, admins: getAdminsMerged() });
});

// REMOVE admin by discordId
router.delete('/api/admin/admins/:discordId', requireAdmin, (req, res) => {
  const did = String(req.params?.discordId || '').trim();
  if (!did) {
    return res.status(400).json({ error: 'Missing discordId' });
  }

  const next = readAdminDbList().filter((x) => x !== did);
  setGlobal(ADMINS_DB_KEY, next);

  return res.json({ ok: true, admins: getAdminsMerged() });
});

router.post('/api/admin/reset-collections', requireAdmin, (req, res) => {
  try {
    const types = ['hunters', 'hunterWeapons', 'sungWeapons', 'shadows', 'successors'];

    // Bierzemy userów z kolekcji (public users)
    const ids = new Set();

    for (const t of types) {
      const rows = listCollectionsByTypePublic(t) || [];
      for (const r of rows) {
        if (r && typeof r.userId !== 'undefined') ids.add(Number(r.userId));
        if (r && typeof r.id !== 'undefined') ids.add(Number(r.id)); // fallback
      }
    }

    let countUsers = 0;
    for (const uid of ids) {
      for (const t of types) {
        setCollection(uid, t, {});
      }
      countUsers++;
    }

    return res.json({ ok: true, usersReset: countUsers });
  } catch (e) {
    console.error('reset-collections failed', e);
    return res.status(500).json({ error: 'Reset failed' });
  }
});

// Reset collections for ONE user (admin only)
// Body: { userId: number, type: string }
router.post('/api/admin/reset-user-collections', requireAdmin, (req, res) => {
  try {
    const userId = Number(req.body?.userId || 0);
    const type = String(req.body?.type || '').trim();

    if (!userId) {
      return res.status(400).json({ error: 'Missing userId' });
    }

    const user = getUserById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Wszystkie per-user typy z api.js
    const RESET_GROUPS = {
      hunters: ['hunters'],
      hunterWeapons: ['hunterWeapons'],
      sungWeapons: ['sungWeapons'],
      builds: ['builds'],
      shadows: ['shadows'],
      successors: ['successors'],
      miniGame: ['miniGameV1'],

      specialCommission: ['specialCommission'],
      specialCommissionV2State: [SPECIAL_COMMISSION_COLLECTION_TYPE],

      tier_hunter: ['tier:hunter'],
      tier_weapon: ['tier:weapon'],
      tier_blessing: ['tier:blessing'],
      tier_rune: ['tier:rune']
    };

    const allowed = [...Object.keys(RESET_GROUPS), 'all'];

    if (!allowed.includes(type)) {
      return res.status(400).json({
        error: 'Bad type',
        allowed
      });
    }

    const typesToReset =
      type === 'all'
        ? Object.values(RESET_GROUPS).flat()
        : RESET_GROUPS[type];

    for (const t of typesToReset) {
      setCollection(userId, t, {});
    }

    return res.json({ ok: true, userId, reset: typesToReset });
  } catch (e) {
    console.error('reset-user-collections failed', e);
    return res.status(500).json({ error: 'Reset failed' });
  }
});

router.get('/api/admin/mini-game/balance', requireAdmin, (req, res) => {
  const userId = Number(req.query?.userId || 0);
  if (!userId) return res.status(400).json({ error: 'Missing userId' });
  if (!getUserById(userId)) return res.status(404).json({ error: 'User not found' });
  const state = miniLoad(userId);
  return res.json({ ok: true, userId, balance: {
    gold: state.gold,
    essence: state.essence,
    customTickets: state.customTickets,
    weaponTickets: state.weaponTickets
  } });
});

router.post('/api/admin/mini-game/grant-currency', requireAdmin, (req, res) => {
  try {
    const userId = Number(req.body?.userId || 0);
    if (!userId) return res.status(400).json({ error: 'Missing userId' });

    const user = getUserById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const add = (value, max = 999999999) => miniNum(value, 0, 0, max);
    const grants = {
      gold: add(req.body?.gold),
      essence: add(req.body?.essence),
      customTickets: add(req.body?.customTickets, 999999),
      weaponTickets: add(req.body?.weaponTickets, 999999)
    };

    const setMode = req.body?.mode === 'set';
    if (!setMode && !grants.gold && !grants.essence && !grants.customTickets && !grants.weaponTickets) {
      return res.status(400).json({ error: 'Nothing to grant' });
    }

    const state = miniLoad(userId);
    if (setMode) {
      state.gold = grants.gold;
      state.essence = grants.essence;
      state.customTickets = grants.customTickets;
      state.weaponTickets = grants.weaponTickets;
      miniLog(state, `Admin set balance: ${grants.gold} gold, ${grants.essence} essence, ${grants.customTickets} draw tickets, ${grants.weaponTickets} weapon tickets`);
    } else {
      state.gold += grants.gold;
      state.essence += grants.essence;
      state.customTickets += grants.customTickets;
      state.weaponTickets += grants.weaponTickets;
      miniLog(state, `Admin grant: +${grants.gold} gold, +${grants.essence} essence, +${grants.customTickets} draw tickets, +${grants.weaponTickets} weapon tickets`);
    }
    const saved = miniSave(userId, state);

    return res.json({
      ok: true,
      userId,
      grants,
      balance: {
        gold: saved.gold,
        essence: saved.essence,
        customTickets: saved.customTickets,
        weaponTickets: saved.weaponTickets
      }
    });
  } catch (e) {
    console.error('mini-game grant-currency failed', e);
    return res.status(500).json({ error: 'Grant failed' });
  }
});

const TOGGLES_PREFIX = 'toggle:'; // => toggle:<key> w Global
const TOGGLES_ALLOWED = new Set([
  'comingSoonSkillsAdv',

  'tierComing_hunters',
  'tierComing_weapons',
  'tierComing_blessing',
  'tierComing_runes',

  'tierTab_hunters',
  'tierTab_weapons',
  'tierTab_blessing',
  'tierTab_runes',
]);

function coerceBool(v) {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  const s = String(v || '').toLowerCase().trim();
  return ['1', 'true', 'yes', 'on'].includes(s);
}

router.get('/api/global/toggles', (req, res) => {
  res.set('Cache-Control', 'no-store');

  const key = String(req.query.key || '').trim();
  if (!key) {
    return res.status(400).json({ error: 'Missing key' });
  }

  if (!TOGGLES_ALLOWED.has(key)) {
    return res.status(400).json({ error: 'Bad key' });
  }

  const raw = getGlobal(`${TOGGLES_PREFIX}${key}`);
  const value = coerceBool(raw);

  return res.json({ key, value });
});

router.post('/api/global/toggles', requireAdmin, (req, res) => {
  res.set('Cache-Control', 'no-store');

  try {
    const key = String(req.body?.key || '').trim();
    if (!key) {
      return res.status(400).json({ error: 'Missing key' });
    }

    if (!TOGGLES_ALLOWED.has(key)) {
      return res.status(400).json({ error: 'Bad key' });
    }

    const value = coerceBool(req.body?.value);
    setGlobal(`${TOGGLES_PREFIX}${key}`, value ? 1 : 0);

    return res.json({ ok: true, key, value });
  } catch (e) {
    console.error('[POST /api/global/toggles] error', e);
    return res.status(500).json({ error: 'internal' });
  }
});

// ─── Global Patch/Lives settings ─────────────────────────────────────────────
router.get('/api/patch-settings', (req, res) => {
  res.set('Cache-Control', 'no-store');
  const settings = getGlobal('patchSettings');
  return res.json({ settings: settings || null });
});

router.get('/api/live-settings', (req, res) => {
  res.set('Cache-Control', 'no-store');

  const s = getGlobal('liveSettings') || null;
  if (s && !s.japan) {
    const patch = getGlobal('patchSettings') || { cycleDays: 28 };
    const fallback = {
      enabled: false,
      startISO: s.global?.startISO || new Date().toISOString(),
      durationMin: s.global?.durationMin || 60,
      cycleDays: patch.cycleDays,
      ytLink: ''
    };
    return res.json({ settings: { ...s, japan: fallback } });
  }

  return res.json({ settings: s || null });
});

router.post('/api/admin/patch-settings', requireAdmin, (req, res) => {
  res.set('Cache-Control', 'no-store');

  try {
    const { startISO, endISO, cycleDays } = req.body || {};
    const s = new Date(startISO);
    const e = new Date(endISO);
    const days = Math.max(1, Number(cycleDays) || 28);

    if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || e <= s) {
      return res.status(400).json({ error: 'Invalid dates' });
    }

    const payload = {
      startISO: s.toISOString(),
      endISO: e.toISOString(),
      cycleDays: days
    };

    setGlobal('patchSettings', payload);
    return res.json({ ok: true, settings: payload });
  } catch (err) {
    console.error('[admin:patch-settings]', err);
    return res.status(500).json({ error: 'internal' });
  }
});

router.post('/api/admin/live-settings', requireAdmin, (req, res) => {
  res.set('Cache-Control', 'no-store');

  try {
    const body = req.body || {};

    function cleanOne(x, fallbackCycle) {
      const start = new Date(String(x?.startISO || ''));
      if (Number.isNaN(start.getTime())) {
        throw new Error('Bad live start date');
      }

      const enabled =
        String(x?.enabled).toLowerCase() === 'true' || x?.enabled === true;

      return {
        enabled,
        startISO: start.toISOString(),
        durationMin: Math.max(1, Number(x?.durationMin) || 60),
        cycleDays: Math.max(1, Number(x?.cycleDays) || fallbackCycle || 28),
        ytLink: String(x?.ytLink || '')
      };
    }

    const patch = getGlobal('patchSettings') || { cycleDays: 28 };

    const cleaned = {
      korean: cleanOne(body.korean, patch.cycleDays),
      global: cleanOne(body.global, patch.cycleDays),
      ...(body.japan ? { japan: cleanOne(body.japan, patch.cycleDays) } : {})
    };

    const prev = getGlobal('liveSettings') || {};
    if (!cleaned.japan) {
      cleaned.japan = prev.japan || {
        enabled: false,
        startISO: prev.global?.startISO || new Date().toISOString(),
        durationMin: prev.global?.durationMin || 60,
        cycleDays: patch.cycleDays,
        ytLink: ''
      };
    }

    setGlobal('liveSettings', cleaned);
    return res.json({ ok: true, settings: cleaned });
  } catch (err) {
    console.error('[admin:live-settings]', err);
    return res.status(400).json({ error: err.message || 'bad request' });
  }
});
// #endregion

// =====================================
// Global Hunters Order (Legacy)
// #region =====================================
router.get('/api/global/hunters-order', (req, res) => {
  return res.json({ order: getGlobal('huntersOrderGlobal') || [] });
});

router.post('/api/global/hunters-order', requireAdmin, (req, res) => {
  const arr = Array.isArray(req.body?.order) ? req.body.order : [];
  setGlobal('huntersOrderGlobal', arr);
  return res.json({ ok: true });
});
// #endregion

// =====================================
// Global Order per Dataset
// #region =====================================
router.get('/api/global/order', (req, res) => {
  const dataset = String(req.query.dataset || '').trim();

  if (!['hunters', 'hunterWeapons', 'sungWeapons', 'blessingStones', 'runes', 'shadows'].includes(dataset)) {
    return res.status(400).json({ error: 'Bad dataset' });
  }

  const key = `order:${dataset}`;
  return res.json({ order: getGlobal(key) || [] });
});

router.post('/api/global/order', requireAdmin, (req, res) => {
  const dataset = String(req.body?.dataset || '').trim();
  const arr = Array.isArray(req.body?.order) ? req.body.order : [];

  if (!['hunters', 'hunterWeapons', 'sungWeapons', 'blessingStones', 'runes', 'shadows'].includes(dataset)) {
    return res.status(400).json({ error: 'Bad dataset' });
  }

  const key = `order:${dataset}`;
  setGlobal(key, arr);

  return res.json({ ok: true });
});
// #endregion

// =====================================
// TierList Catalog Keys (Global Source of Truth)
// #region =====================================
const HUNTER_TIER_KEY = 'tier:hunter';
const WEAPON_TIER_KEY = 'tier:weapon';
const BLESSING_TIER_KEY = 'tier:blessing';
const RUNE_TIER_KEY = 'tier:rune';
// #endregion

// =====================================
// Catalog Keys for Admin Endpoints
// #region =====================================
const HUNTERS_CATALOG_KEY = 'catalog:hunters';
const HUNTER_WEAPONS_CATALOG_KEY = 'catalog:hunterWeapons';
const SUNG_WEAPONS_CATALOG_KEY = 'catalog:sungWeapons';
// #endregion

// =====================================
// Catalog Writer Endpoints (Admin)
// #region =====================================
function getTierCatalogKey(kind) {
  if (kind === 'hunters') return HUNTER_TIER_KEY;
  if (kind === 'weapons') return WEAPON_TIER_KEY;
  if (kind === 'blessing') return BLESSING_TIER_KEY;
  if (kind === 'runes') return RUNE_TIER_KEY;
  return '';
}

function normalizeTierCatalogItem(input) {
  const name = String(input?.name || '').trim();
  const image = String(input?.image_tier_list || input?.image || '').trim();
  const rarity = String(input?.rarity || '').trim().toUpperCase();
  const element = String(input?.element || '').trim();

  return {
    name,
    image_tier_list: image,
    ...(rarity ? { rarity } : {}),
    ...(element ? { element } : {})
  };
}

function readTierCatalog(kind) {
  const key = getTierCatalogKey(kind);
  if (!key) return [];
  const raw = getGlobal(key);
  return Array.isArray(raw) ? raw : [];
}

function writeTierCatalog(kind, items) {
  const key = getTierCatalogKey(kind);
  if (!key) return false;
  setGlobal(key, items);
  return true;
}

router.post('/api/catalog/add', requireAdmin, (req, res) => {
  try {
    const kind = String(req.body?.kind || '').trim();
    const item = req.body?.item || {};

    if (!['hunters', 'weapons', 'blessing', 'runes'].includes(kind)) {
      return res.status(400).json({ error: 'Bad kind' });
    }

    const rec = normalizeTierCatalogItem(item);
    if (!rec.name || !rec.image_tier_list) {
      return res.status(400).json({ error: 'Missing name/image' });
    }

    const list = readTierCatalog(kind);
    if (list.some((x) => String(x?.name || '').trim() === rec.name)) {
      return res.status(409).json({ error: 'Already exists' });
    }

    const next = [rec, ...list];
    writeTierCatalog(kind, next);

    return res.json({ ok: true, count: next.length, items: next });
  } catch (e) {
    console.error('[catalog:add] error', e);
    return res.status(500).json({ error: 'internal' });
  }
});

router.post('/api/catalog/save', requireAdmin, (req, res) => {
  try {
    const kind = String(req.body?.kind || '').trim();
    const items = Array.isArray(req.body?.items) ? req.body.items : [];

    if (!['hunters', 'weapons', 'blessing', 'runes'].includes(kind)) {
      return res.status(400).json({ error: 'Bad kind' });
    }

    const cleaned = items
      .map(normalizeTierCatalogItem)
      .filter((it) => it.name && it.image_tier_list);

    writeTierCatalog(kind, cleaned);

    return res.json({ ok: true, count: cleaned.length, items: cleaned });
  } catch (e) {
    console.error('[catalog:save] error', e);
    return res.status(500).json({ error: 'internal' });
  }
});

router.post('/api/tier/reset', requireAdmin, (req, res) => {
  try {
    const dataset = String(req.query.dataset || req.body?.dataset || '').trim();

    if (!['hunters', 'hunterWeapons', 'sungWeapons', 'blessingStones', 'runes', 'shadows'].includes(dataset)) {
      return res.status(400).json({ error: 'Bad dataset' });
    }

    setGlobal(`tier:forceEmpty:${dataset}`, 1);

    const maybeKeys = [
      `tier:aggregate_cache:${dataset}`,
      `tier:points:${dataset}`,
      `tier:scores:${dataset}`
    ];

    for (const k of maybeKeys) {
      setGlobal(k, null);
    }

    setGlobal(`tier:lastReset:${dataset}`, Date.now());

    return res.json({ ok: true });
  } catch (err) {
    console.error('[tier:reset] error', err);
    return res.status(500).json({ error: 'internal' });
  }
});
// #endregion

// =====================================
// Global Clickable per Dataset
// #region =====================================
router.get('/api/global/clickable', (req, res) => {
  const dataset = String(req.query.dataset || '').trim();

  if (!['hunters', 'hunterWeapons', 'sungWeapons', 'blessingStones', 'runes', 'shadows'].includes(dataset)) {
    return res.status(400).json({ error: 'Bad dataset' });
  }

  const key = `clickable:${dataset}`;
  return res.json({ map: getGlobal(key) || {} });
});

router.post('/api/global/clickable', requireAdmin, (req, res) => {
  const dataset = String(req.body?.dataset || '').trim();
  const map = (req.body?.map && typeof req.body.map === 'object') ? req.body.map : {};

  if (!['hunters', 'hunterWeapons', 'sungWeapons', 'blessingStones', 'runes', 'shadows'].includes(dataset)) {
    return res.status(400).json({ error: 'Bad dataset' });
  }

  const key = `clickable:${dataset}`;
  setGlobal(key, map);

  return res.json({ ok: true });
});
// #endregion

// =====================================
// Build Helpers (DB only)
// #region =====================================
function recomputeBestForCharacter(dataset, character) {
  const prefix = `buildChoice:${dataset}:${character}:`;
  const rows = getGlobalsByPrefix(prefix) || [];

  const SLOTS = ['L1', 'L2', 'L3', 'L4', 'R1', 'R2', 'R3', 'R4', 'B1', 'B2', 'B3'];
  const tally = Object.fromEntries(SLOTS.map((s) => [s, new Map()]));

  for (const r of rows) {
    const obj = (r && typeof r.value === 'object' && r.value) ? r.value : {};

    for (const s of SLOTS) {
      const url = String(obj[s] || '').trim();
      if (!url) continue;

      const m = tally[s];
      m.set(url, (m.get(url) || 0) + 1);
    }
  }

  const topN = (m, n) =>
    Array.from(m.entries())
      .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]))
      .slice(0, n)
      .map(([url]) => url || '');

  const best1 = { left: ['', '', '', ''], right: ['', '', '', ''], bottom: ['', '', ''] };
  const best2 = { left: ['', '', '', ''], right: ['', '', '', ''], bottom: ['', '', ''] };
  const best3 = { left: ['', '', '', ''], right: ['', '', '', ''], bottom: ['', '', ''] };

  const put = (obj, slotKey, url) => {
    const side = slotKey[0];
    const idx = Number(slotKey.slice(1));

    if (side === 'L') obj.left[idx - 1] = url || '';
    if (side === 'R') obj.right[idx - 1] = url || '';
    if (side === 'B') obj.bottom[idx - 1] = url || '';
  };

  for (const s of SLOTS) {
    const arr = topN(tally[s], 3);
    put(best1, s, arr[0] || '');
    put(best2, s, arr[1] || '');
    put(best3, s, arr[2] || '');
  }

  writeBestToStore(dataset, character, best1, best2, best3);
}
// #endregion

// =====================================
// Manage Weapons (Admin Only)
// #region =====================================
function getWeaponCatalogKey(dataset) {
  if (dataset === 'hunterWeapons') return HUNTER_WEAPONS_CATALOG_KEY;
  if (dataset === 'sungWeapons') return SUNG_WEAPONS_CATALOG_KEY;
  return '';
}

function readWeaponCatalog(dataset) {
  const key = getWeaponCatalogKey(dataset);
  if (!key) return [];
  const raw = getGlobal(key);
  return Array.isArray(raw) ? raw : [];
}

function writeWeaponCatalog(dataset, list) {
  const key = getWeaponCatalogKey(dataset);
  if (!key) return false;
  setGlobal(key, list);
  return true;
}

function normalizeWeaponRecord(dataset, item = {}, fallback = {}) {
  const rec = {
    name: String(item.name ?? fallback.name ?? '').trim(),
    element: String(item.element ?? fallback.element ?? 'None').trim() || 'None',
    rarity: String(item.rarity ?? fallback.rarity ?? 'SSR').trim() || 'SSR',
    image: String(item.image ?? fallback.image ?? '').trim(),
    image_build: String(item.image_build ?? fallback.image_build ?? '').trim()
  };

  if (dataset === 'hunterWeapons') {
    rec.owner = String(item.owner ?? fallback.owner ?? 'HUNTERS').trim() || 'HUNTERS';
  }

  return rec;
}

router.get('/api/public/hunter-weapons', (req, res) => {
  try {
    const list = readWeaponCatalog('hunterWeapons');
    return res.json({ ok: true, items: list });
  } catch (e) {
    console.error('[public:hunter-weapons] error', e);
    return res.status(500).json({ error: 'internal' });
  }
});

router.get('/api/public/sung-weapons', (req, res) => {
  try {
    const list = readWeaponCatalog('sungWeapons');
    return res.json({ ok: true, items: list });
  } catch (e) {
    console.error('[public:sung-weapons] error', e);
    return res.status(500).json({ error: 'internal' });
  }
});

router.post('/api/admin/weapons', requireAdmin, (req, res) => {
  const { dataset, action } = req.body || {};

  if (!['hunterWeapons', 'sungWeapons'].includes(dataset)) {
    return res.status(400).json({ error: 'Bad dataset' });
  }

  let list = readWeaponCatalog(dataset);

  if (action === 'add') {
    const { item } = req.body || {};
    if (!item || !item.name) return res.status(400).json({ error: 'Missing item.name' });
    if (!item.image) return res.status(400).json({ error: 'Missing item.image' });

    const rec = normalizeWeaponRecord(dataset, item);
    if (!rec.name) return res.status(400).json({ error: 'Missing item.name' });
    if (!rec.image) return res.status(400).json({ error: 'Missing item.image' });

    if (list.some((w) => String(w?.name || '').trim() === rec.name)) {
      return res.status(400).json({ error: 'Already exists' });
    }

    list.unshift(rec);

    const key = `order:${dataset}`;
    const ord = getGlobal(key) || [];
    setGlobal(
      key,
      [rec.name, ...ord.map((n) => String(n || '').trim()).filter((n) => n && n !== rec.name)]
    );
  } else if (action === 'remove') {
    const { name } = req.body || {};
    const targetName = String(name || '').trim();
    const idx = list.findIndex((w) => String(w?.name || '').trim() === targetName);

    if (idx === -1) return res.status(404).json({ error: 'Not found' });

    list.splice(idx, 1);

    const key = `order:${dataset}`;
    const ord = (getGlobal(key) || [])
      .map((n) => String(n || '').trim())
      .filter((n) => n && n !== targetName);

    setGlobal(key, ord);
  } else if (action === 'update') {
    const { originalName, item } = req.body || {};
    if (!originalName) return res.status(400).json({ error: 'Missing originalName' });

    const originalNameTrimmed = String(originalName || '').trim();
    const idx = list.findIndex((w) => String(w?.name || '').trim() === originalNameTrimmed);

    if (idx === -1) return res.status(404).json({ error: 'Not found' });

    const nextRec = normalizeWeaponRecord(dataset, item, list[idx]);

    if (!nextRec.name) return res.status(400).json({ error: 'Missing item.name' });

    if (
      nextRec.name !== originalNameTrimmed &&
      list.some((w, i) => i !== idx && String(w?.name || '').trim() === nextRec.name)
    ) {
      return res.status(400).json({ error: 'Name already in use' });
    }

    list[idx] = nextRec;

    if (nextRec.name !== originalNameTrimmed) {
      const key = `order:${dataset}`;
      const ord = getGlobal(key) || [];
      setGlobal(
        key,
        ord
          .map((n) => String(n || '').trim())
          .map((n) => (n === originalNameTrimmed ? nextRec.name : n))
      );
    }
  } else {
    return res.status(400).json({ error: 'Unknown action' });
  }

  writeWeaponCatalog(dataset, list);
  return res.json({ ok: true, list });
});
// #endregion

// =====================================
// Manage Hunters (Admin Only)
// #region =====================================
function readHuntersCatalog() {
  const raw = getGlobal(HUNTERS_CATALOG_KEY);
  return Array.isArray(raw) ? raw : [];
}

function writeHuntersCatalog(list) {
  setGlobal(HUNTERS_CATALOG_KEY, list);
  return true;
}

function normalizeHunterRecord(item = {}, fallback = {}) {
  // Keep extra Hunter Guess metadata when a normal Hunters admin update only edits
  // name / element / role / rarity / images. Without this, every Hunters update
  // would wipe className/classOriginal/limited from the shared catalog. Guild stays in Hunter Details.
  const out = {
    name: String(item.name ?? fallback.name ?? '').trim(),
    element: String(item.element ?? fallback.element ?? '').trim(),
    role: String(item.role ?? fallback.role ?? '').trim(),
    rarity: String(item.rarity ?? fallback.rarity ?? 'SSR').trim() || 'SSR',
    image: String(item.image ?? fallback.image ?? '').trim(),
    image_build: String(item.image_build ?? fallback.image_build ?? '').trim()
  };

  const keepKeys = [
    'role',
    'className',
    'classOriginal',
    'classGuess',
    'type',
    'limited',
    'availability'
  ];

  for (const key of keepKeys) {
    if (Object.prototype.hasOwnProperty.call(item || {}, key)) out[key] = item[key];
    else if (Object.prototype.hasOwnProperty.call(fallback || {}, key)) out[key] = fallback[key];
  }

  return out;
}

router.get('/api/public/hunters', (req, res) => {
  try {
    const list = readHuntersCatalog();
    return res.json({ ok: true, items: list });
  } catch (e) {
    console.error('[public:hunters] error', e);
    return res.status(500).json({ error: 'internal' });
  }
});

router.post('/api/admin/hunters', requireAdmin, (req, res) => {
  const { action } = req.body || {};
  let list = readHuntersCatalog();

  if (action === 'add') {
    const { item } = req.body || {};
    if (!item || !item.name) {
      return res.status(400).json({ error: 'Missing item.name' });
    }

    const rec = normalizeHunterRecord(item);
    if (!rec.name) {
      return res.status(400).json({ error: 'Missing item.name' });
    }

    if (list.some((h) => String(h?.name || '').trim() === rec.name)) {
      return res.status(400).json({ error: 'Already exists' });
    }

    list.unshift(rec);

    const key = 'order:hunters';
    const ord = getGlobal(key) || [];
    setGlobal(
      key,
      [rec.name, ...ord.map((n) => String(n || '').trim()).filter((n) => n && n !== rec.name)]
    );

  } else if (action === 'remove') {
    const { name } = req.body || {};
    const targetName = String(name || '').trim();
    const idx = list.findIndex((h) => String(h?.name || '').trim() === targetName);

    if (idx === -1) {
      return res.status(404).json({ error: 'Not found' });
    }

    list.splice(idx, 1);

    const key = 'order:hunters';
    const ord = (getGlobal(key) || [])
      .map((n) => String(n || '').trim())
      .filter((n) => n && n !== targetName);

    setGlobal(key, ord);

  } else if (action === 'update') {
    const { originalName, item } = req.body || {};
    if (!originalName) {
      return res.status(400).json({ error: 'Missing originalName' });
    }

    const originalNameTrimmed = String(originalName || '').trim();
    const idx = list.findIndex((h) => String(h?.name || '').trim() === originalNameTrimmed);

    if (idx === -1) {
      return res.status(404).json({ error: 'Not found' });
    }

    const nextRec = normalizeHunterRecord(item, list[idx]);
    if (!nextRec.name) {
      return res.status(400).json({ error: 'Missing item.name' });
    }

    if (
      nextRec.name !== originalNameTrimmed &&
      list.some((h, i) => i !== idx && String(h?.name || '').trim() === nextRec.name)
    ) {
      return res.status(400).json({ error: 'Name already in use' });
    }

    list[idx] = nextRec;

    if (nextRec.name !== originalNameTrimmed) {
      const key = 'order:hunters';
      const ord = getGlobal(key) || [];
      setGlobal(
        key,
        ord
          .map((n) => String(n || '').trim())
          .map((n) => (n === originalNameTrimmed ? nextRec.name : n))
      );
    }

  } else {
    return res.status(400).json({ error: 'Unknown action' });
  }

  writeHuntersCatalog(list);
  return res.json({ ok: true, list });
});
// #endregion

// =====================================
// Save Slot List for a Character (Admin)
// #region =====================================
router.post('/api/builds/save', requireAdmin, (req, res) => {
  const { dataset, character, slot, items } = req.body || {};

  if (!['hunters', 'hunterWeapons', 'sungWeapons'].includes(String(dataset || ''))) {
    return res.status(400).json({ error: 'Bad dataset' });
  }

  const characterName = String(character || '').trim();
  const slotKey = String(slot || '').trim();

  if (!characterName || !slotKey) {
    return res.status(400).json({ error: 'Missing character or slot' });
  }

  const validSlots = new Set([
    'L1', 'L2', 'L3', 'L4',
    'R1', 'R2', 'R3', 'R4',
    'B1', 'B2', 'B3',
    'L1b', 'L2b', 'L3b', 'L4b',
    'R1b', 'R2b', 'R3b', 'R4b',
    'B1b', 'B2b', 'B3b'
  ]);

  if (!validSlots.has(slotKey)) {
    return res.status(400).json({ error: 'Bad slot' });
  }

  const list = Array.isArray(items)
    ? items
        .map((x) => ({
          name: String(x?.name || '').trim(),
          image: String(x?.image || '').trim()
        }))
        .filter((x) => x.name && x.image)
    : [];

  const buildKey = `buildSlot:${dataset}:${characterName}:${slotKey}`;
  setGlobal(buildKey, list);

  return res.json({ ok: true });
});
// #endregion

// =====================================
// Aggregate Best Build (Top 1/2/3) (Admin)
// #region =====================================
router.post('/api/builds/aggregate', requireAdmin, (req, res) => {
  const dataset = String(req.body?.dataset || '').trim();
  const character = String(req.body?.character || req.body?.name || '').trim();

  if (!['hunters', 'hunterWeapons', 'sungWeapons'].includes(dataset)) {
    return res.status(400).json({ error: 'Bad dataset' });
  }

  if (!character) {
    return res.status(400).json({ error: 'Missing character/name' });
  }

  const pref1 = `buildChoice:${dataset}:${character}:build1:`;
  const pref2 = `buildChoice:${dataset}:${character}:build2:`;

  const rows = [
    ...getGlobalsByPrefix(pref1),
    ...getGlobalsByPrefix(pref2)
  ];

  const slots = ['L1', 'L2', 'L3', 'L4', 'R1', 'R2', 'R3', 'R4', 'B1', 'B2', 'B3'];
  const counters = Object.fromEntries(slots.map((s) => [s, new Map()]));

  for (const r of rows) {
    const v = r.value || {};

    for (const s of slots) {
      const u = String(v[s] || '').trim();
      if (!u) continue;

      const m = counters[s];
      m.set(u, (m.get(u) || 0) + 1);
    }
  }

  const topN = (map, n) => {
    const arr = [...map.entries()]
      .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]))
      .slice(0, n)
      .map(([url]) => url);

    while (arr.length < n) arr.push('');
    return arr;
  };

  const L = {
    1: topN(counters.L1, 3),
    2: topN(counters.L2, 3),
    3: topN(counters.L3, 3),
    4: topN(counters.L4, 3)
  };

  const R = {
    1: topN(counters.R1, 3),
    2: topN(counters.R2, 3),
    3: topN(counters.R3, 3),
    4: topN(counters.R4, 3)
  };

  const B = {
    1: topN(counters.B1, 3),
    2: topN(counters.B2, 3),
    3: topN(counters.B3, 3)
  };

  const top1 = {
    left: [L[1][0], L[2][0], L[3][0], L[4][0]],
    right: [R[1][0], R[2][0], R[3][0], R[4][0]],
    bottom: [B[1][0], B[2][0], B[3][0]]
  };

  const top2 = {
    left: [L[1][1], L[2][1], L[3][1], L[4][1]],
    right: [R[1][1], R[2][1], R[3][1], R[4][1]],
    bottom: [B[1][1], B[2][1], B[3][1]]
  };

  const top3 = {
    left: [L[1][2], L[2][2], L[3][2], L[4][2]],
    right: [R[1][2], R[2][2], R[3][2], R[4][2]],
    bottom: [B[1][2], B[2][2], B[3][2]]
  };

  writeBestToStore(dataset, character, top1, top2, top3);

  return res.json({ ok: true, counts: rows.length });
});
// #endregion

// =====================================
// Aggregate Best Build for Many Characters (Admin)
// #region =====================================
router.post('/api/builds/aggregate-batch', requireAdmin, async (req, res) => {
  const dataset = String(req.body?.dataset || '').trim();
  const characters = Array.isArray(req.body?.characters) ? req.body.characters : [];

  if (!['hunters', 'hunterWeapons', 'sungWeapons'].includes(dataset)) {
    return res.status(400).json({ error: 'Bad dataset' });
  }

  let done = 0;
  let skipped = 0;

  for (const name of characters) {
    const character = String(name || '').trim();
    if (!character) {
      skipped++;
      continue;
    }

    const pref1 = `buildChoice:${dataset}:${character}:build1:`;
    const pref2 = `buildChoice:${dataset}:${character}:build2:`;

    const rows = [
      ...getGlobalsByPrefix(pref1),
      ...getGlobalsByPrefix(pref2)
    ];

    const slots = ['L1', 'L2', 'L3', 'L4', 'R1', 'R2', 'R3', 'R4', 'B1', 'B2', 'B3'];
    const counters = Object.fromEntries(slots.map((s) => [s, new Map()]));

    for (const r of rows) {
      const v = r.value || {};

      for (const s of slots) {
        const u = String(v[s] || '').trim();
        if (!u) continue;

        const m = counters[s];
        m.set(u, (m.get(u) || 0) + 1);
      }
    }

    const topN = (map, n) => {
      const arr = [...map.entries()]
        .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]))
        .slice(0, n)
        .map(([url]) => url);

      while (arr.length < n) arr.push('');
      return arr;
    };

    const L = {
      1: topN(counters.L1, 3),
      2: topN(counters.L2, 3),
      3: topN(counters.L3, 3),
      4: topN(counters.L4, 3)
    };

    const R = {
      1: topN(counters.R1, 3),
      2: topN(counters.R2, 3),
      3: topN(counters.R3, 3),
      4: topN(counters.R4, 3)
    };

    const B = {
      1: topN(counters.B1, 3),
      2: topN(counters.B2, 3),
      3: topN(counters.B3, 3)
    };

    const top1 = {
      left: [L[1][0], L[2][0], L[3][0], L[4][0]],
      right: [R[1][0], R[2][0], R[3][0], R[4][0]],
      bottom: [B[1][0], B[2][0], B[3][0]]
    };

    const top2 = {
      left: [L[1][1], L[2][1], L[3][1], L[4][1]],
      right: [R[1][1], R[2][1], R[3][1], R[4][1]],
      bottom: [B[1][1], B[2][1], B[3][1]]
    };

    const top3 = {
      left: [L[1][2], L[2][2], L[3][2], L[4][2]],
      right: [R[1][2], R[2][2], R[3][2], R[4][2]],
      bottom: [B[1][2], B[2][2], B[3][2]]
    };

    writeBestToStore(dataset, character, top1, top2, top3);
    done++;
  }

  return res.json({ ok: true, done, skipped });
});
// #endregion

// =====================================
// Best Build - Top 1/2/3 (Single File)
// #region =====================================
router.get('/api/builds/best', async (req, res) => {
  const dataset = String(req.query?.dataset || '').trim();
  const character = String(req.query?.character || req.query?.name || '').trim();
  const top = Number(req.query?.top || 1);

  if (!['hunters', 'hunterWeapons', 'sungWeapons'].includes(dataset)) {
    return res.status(400).json({ error: 'Bad dataset' });
  }

  if (!character) {
    return res.status(400).json({ error: 'Missing character' });
  }

  const t = top === 2 ? 2 : (top === 3 ? 3 : 1);
  const best = readBestFromStore(dataset, character, t);

  return res.json(best);
});
// #endregion

// =====================================
// Best Build (Combined Top 1/2/3)
// #region =====================================
router.get('/api/builds/top', (req, res) => {
  const dataset = String(req.query?.dataset || '').trim();
  const character = String(req.query?.name || req.query?.character || '').trim();

  if (!['hunters', 'hunterWeapons', 'sungWeapons'].includes(dataset)) {
    return res.status(400).json({ error: 'Bad dataset' });
  }

  if (!character) {
    return res.status(400).json({ error: 'Missing name/character' });
  }

  const t1 = readBestFromStore(dataset, character, 1);
  const t2 = readBestFromStore(dataset, character, 2);
  const t3 = readBestFromStore(dataset, character, 3);

  const make = (a, b, c) => [
    { image: a || '' },
    { image: b || '' },
    { image: c || '' }
  ];

  const slots = {
    'left-1': make(t1.left[0], t2.left[0], t3.left[0]),
    'left-2': make(t1.left[1], t2.left[1], t3.left[1]),
    'left-3': make(t1.left[2], t2.left[2], t3.left[2]),
    'left-4': make(t1.left[3], t2.left[3], t3.left[3]),

    'right-1': make(t1.right[0], t2.right[0], t3.right[0]),
    'right-2': make(t1.right[1], t2.right[1], t3.right[1]),
    'right-3': make(t1.right[2], t2.right[2], t3.right[2]),
    'right-4': make(t1.right[3], t2.right[3], t3.right[3]),

    'bottom-1': make(t1.bottom[0], t2.bottom[0], t3.bottom[0]),
    'bottom-2': make(t1.bottom[1], t2.bottom[1], t3.bottom[1]),
    'bottom-3': make(t1.bottom[2], t2.bottom[2], t3.bottom[2]),
  };

  return res.json({ slots });
});
// #endregion

// =====================================
// TIER LIST — per-user (hunter / weapon / blessing / rune)
// #region =====================================
router.use((req, _res, next) => {
  if (req.path.startsWith('/api/tier/user/')) {
    console.log(
      '[tier:user]',
      req.method,
      req.path,
      'query=',
      req.query,
      'auth=',
      !!(req.isAuthenticated && req.isAuthenticated())
    );
  }
  next();
});

const VALID_SCOPES = new Set(['hunter', 'weapon', 'blessing', 'rune']);

function getScope(req, res) {
  const scope = String(req.params.scope || '').trim().toLowerCase();
  if (!VALID_SCOPES.has(scope)) {
    res.status(400).json({ error: 'Bad scope (use hunter|weapon|blessing|rune)' });
    return null;
  }
  return scope;
}

function tierNormalizeHunterImage(value) {
  const s = String(value || '').trim();
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith('/picture/')) return s;
  if (s.startsWith('Hunter_Icon/')) return `/picture/${s}`;
  const file = s.replace(/\\/g, '/').split('/').pop() || s;
  return `/picture/Hunter_Icon/${file}`;
}

function tierNormalizeSungWeaponImage(value) {
  const s = String(value || '').trim();
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith('/picture/')) return s;
  const cleaned = s.replace(/\\/g, '/');
  const cats = ['SWeapon', 'SungWeapon', 'Sung_Weapon', 'Weapon_Sung', 'SGWeapon'];
  const hit = cats.find((cat) => cleaned.startsWith(cat + '/'));
  if (hit) return `/picture/${cleaned}`;
  const file = cleaned.split('/').pop() || cleaned;
  return `/picture/SWeapon/${file}`;
}

function tierNormalizeBlessingImage(value) {
  const s = String(value || '').trim();
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith('/picture/')) return s;
  const cleaned = s.replace(/\\/g, '/');
  if (cleaned.startsWith('Blessing_Stones/')) return `/picture/${cleaned}`;
  const file = cleaned.split('/').pop() || cleaned;
  return `/picture/Blessing_Stones/Blessing/${file}`;
}

function tierNormalizeGenericImage(value) {
  return String(value || '').trim();
}

function readTierCatalogByScope(scope) {
  if (scope === 'hunter') {
    const raw = getGlobal(HUNTERS_CATALOG_KEY);
    const base = Array.isArray(raw) ? raw : [];
    return base
      .map((h) => ({
        name: String(h?.name || h?.id || '').trim(),
        image: tierNormalizeHunterImage(h?.image || h?.image_build || ''),
        rarity: String(h?.rarity || 'SSR').trim().toUpperCase(),
        element: String(h?.element || 'None').trim()
      }))
      .filter((x) => x.name);
  }

  if (scope === 'weapon') {
    const raw = getGlobal(SUNG_WEAPONS_CATALOG_KEY);
    const base = Array.isArray(raw) ? raw : [];
    return base
      .map((w) => ({
        name: String(w?.name || w?.weapon_name || w?.id || '').trim(),
        image: tierNormalizeSungWeaponImage(w?.image || w?.image_build || w?.imageUrl || w?.img || ''),
        rarity: String(w?.rarity || 'SSR').trim().toUpperCase(),
        element: String(w?.element || 'None').trim()
      }))
      .filter((x) => x.name);
  }

  if (scope === 'blessing') {
    const globalData = normalizeBlessingStonesGlobalPayload(getGlobal(BLESSING_STONES_GLOBAL_KEY));
    const list = []
      .concat(Array.isArray(globalData?.empowerment) ? globalData.empowerment : [])
      .concat(Array.isArray(globalData?.survival) ? globalData.survival : []);

    return list
      .map((x) => ({
        name: String(x?.name || x?.id || '').trim(),
        image: tierNormalizeBlessingImage(x?.image || ''),
        rarity: '',
        element: 'None'
      }))
      .filter((x) => x.name);
  }

  const raw = getGlobal(RUNE_TIER_KEY);
  const base = Array.isArray(raw) ? raw : [];
  return base
    .map((x) => ({
      name: String(x?.name || x?.id || '').trim(),
      image: tierNormalizeGenericImage(x?.image_tier_list || x?.image || ''),
      rarity: String(x?.rarity || '').trim().toUpperCase(),
      element: String(x?.element || 'None').trim()
    }))
    .filter((x) => x.name);
}

function getTierBaseCatalog(scope) {
  return readTierCatalogByScope(scope);
}

// GET /api/public/tier-catalog/:scope
router.get('/api/public/tier-catalog/:scope', (req, res) => {
  const scope = getScope(req, res);
  if (!scope) return;

  res.set('Cache-Control', 'no-store');

  try {
    return res.json({ ok: true, items: getTierBaseCatalog(scope) });
  } catch (e) {
    console.error('[public:tier-catalog] error', e);
    return res.status(500).json({ error: 'internal' });
  }
});

// GET  /api/tier/user/:scope
router.get('/api/tier/user/:scope', (req, res) => {
  const scope = getScope(req, res);
  if (!scope) return;

  const type = `tier:${scope}`;
  res.set('Cache-Control', 'no-store');

  const userParam = req.query.user || req.query.userId;

  const pick = (uid) => {
    const data = getCollection(uid, type) || {};
    const items = Array.isArray(data.items) ? data.items : [];
    const tiers = (data.tiers && typeof data.tiers === 'object') ? data.tiers : null;

    console.log('[tier:user] GET ok -> uid=', uid, 'items=', items.length, 'tiers=', !!tiers);
    return res.json(tiers ? { items, tiers } : { items });
  };

  if (userParam) {
    const tid = Number(userParam);
    const target = getUserById(tid);
    if (!target) {
      console.log('[tier:user] 404 user not found', tid);
      return res.status(404).json({ error: 'User not found' });
    }

    const profile = getProfile(tid);
    const vis = profile?.visibility || 'public';
    if (vis !== 'public') {
      console.log('[tier:user] 403 private profile', tid);
      return res.status(403).json({ error: 'Profile is private' });
    }

    return pick(tid);
  }

  if (!(req.isAuthenticated && req.isAuthenticated())) {
    console.log('[tier:user] 401 own view, no session');
    return res.status(401).json({ error: 'Not authenticated' });
  }

  return pick(req.user.id);
});

// POST /api/tier/user/:scope
router.post('/api/tier/user/:scope', requireAuth, (req, res) => {
  const scope = getScope(req, res);
  if (!scope) return;

  const type = `tier:${scope}`;
  const itemsRaw = Array.isArray(req.body?.items) ? req.body.items : [];

  const items = itemsRaw
    .map((x) => {
      const name = String(x?.name || '').trim();
      const img = String(x?.image_tier_list || x?.image || '').trim();
      const rarity = String(x?.rarity || '').trim().toUpperCase();
      const element = String(x?.element || '').trim();

      return {
        name,
        image_tier_list: img,
        ...(rarity ? { rarity } : {}),
        ...(element ? { element } : {})
      };
    })
    .filter((x) => x.name && x.image_tier_list);

  const TIER_KEYS = ['SS', 'S', 'A', 'B', 'C', 'D', 'E', 'F', 'BENCH'];
  let tiers = null;

  if (req.body && typeof req.body.tiers === 'object') {
    const t = {};
    for (const k of TIER_KEYS) {
      const arr = Array.isArray(req.body.tiers[k]) ? req.body.tiers[k] : [];
      t[k] = arr.map((v) => String(v || '')).filter(Boolean);
    }
    tiers = t;
  }

  setCollection(req.user.id, type, tiers ? { items, tiers } : { items });
  console.log('[tier:user] POST save -> uid=', req.user.id, 'items=', items.length, 'tiers=', !!tiers);

  const ds =
    scope === 'hunter' ? 'hunters' :
    scope === 'weapon' ? 'sungWeapons' :
    scope === 'blessing' ? 'blessingStones' :
    'runes';

  setGlobal(`tier:forceEmpty:${ds}`, null);

  return res.json(tiers ? { ok: true, items, tiers } : { ok: true, items });
});

/* ===========================================================
   Global aggregation (Borda / Points)
   GET /api/tier/aggregate/:scope?method=borda|points&w=0.30&alpha=1&full=0|1
   scope = hunter | weapon | blessing | rune
   =========================================================== */
router.get('/api/tier/aggregate/:scope', (req, res) => {
  const scope = String(req.params.scope || '').toLowerCase();
  if (!['hunter', 'weapon', 'blessing', 'rune'].includes(scope)) {
    return res.status(400).json({ error: 'Bad scope' });
  }

  const dataset =
    scope === 'hunter' ? 'hunters' :
    scope === 'weapon' ? 'sungWeapons' :
    scope === 'blessing' ? 'blessingStones' :
    'runes';

  const forceEmpty = getGlobal(`tier:forceEmpty:${dataset}`);
  if (forceEmpty) {
    res.set('Cache-Control', 'no-store');
    return res.json({ items: [], method: 'empty' });
  }

  const method = String(req.query.method || 'borda').toLowerCase();
  const w = Math.max(0, Math.min(1, Number(req.query.w ?? 0.30)));
  const alpha = Math.max(0, Number(req.query.alpha ?? 1));
  const fullOnly = String(req.query.full || '0') === '1';

  const base = getTierBaseCatalog(scope);
  const allIds = base.map((x) => String(x.name));
  const byId = new Map(
    base.map((x) => [
      String(x.name),
      { name: String(x.name), image: String(x.image || x.image_tier_list || '') }
    ])
  );

  const M = allIds.length;
  const rows = listCollectionsByTypePublic(`tier:${scope}`);

  if (rows.length === 0) {
    res.set('Cache-Control', 'no-store');
    return res.json({ items: [], method });
  }

  const acc = new Map();
  const inc = (id, val, weight = 1) => {
    const r = acc.get(id) || { sum: 0, voters: 0, weightSum: 0 };
    r.sum += val * weight;
    r.weightSum += weight;
    r.voters += 1;
    acc.set(id, r);
  };

  const rankFromTiers = (userObj) => {
    const tiers = (userObj && userObj.tiers && typeof userObj.tiers === 'object') ? userObj.tiers : {};
    const order = []
      .concat(tiers.SS || [], tiers.S || [], tiers.A || [], tiers.B || [], tiers.C || [], tiers.D || [], tiers.E || [], tiers.F || []);

    const inOrder = new Set(order.map(String));
    const rest = allIds.filter((id) => !inOrder.has(String(id)));
    const full = order.concat(rest).map(String);
    const pos = new Map();
    full.forEach((id, i) => pos.set(id, i));

    const benchCount = (tiers.BENCH && Array.isArray(tiers.BENCH)) ? tiers.BENCH.length : 0;
    const covered = allIds.length - rest.length;

    return { pos, covered, benchCount };
  };

  for (const r of rows) {
    const { pos, covered, benchCount } = rankFromTiers(r.data);
    if (fullOnly && (covered < M || benchCount > 0)) continue;

    const coverage = covered / M;
    const weight = fullOnly ? 1 : Math.pow(coverage, alpha);

    if (method === 'borda') {
      for (const id of allIds) {
        const rank = pos.has(id) ? pos.get(id) : (M - 1);
        const raw = M - rank;
        const norm = raw / M;
        inc(id, norm, weight);
      }
    } else {
      const basePts = { SS: 8, S: 7, A: 6, B: 5, C: 4, D: 3, E: 2, F: 1 };
      const tiers = r.data?.tiers || {};

      for (const tier of ['SS', 'S', 'A', 'B', 'C', 'D', 'E', 'F']) {
        const arr = Array.isArray(tiers[tier]) ? tiers[tier].map(String) : [];
        const N = arr.length;

        arr.forEach((id, p) => {
          const bonus = N > 1 ? w * ((N - 1 - p) / (N - 1)) : w;
          const raw = (basePts[tier] || 0) + bonus;
          const norm = raw / 8;
          inc(id, norm, weight);
        });
      }
    }
  }

  if (acc.size === 0) {
    res.set('Cache-Control', 'no-store');
    return res.json({ items: [], method, note: 'no_contributors' });
  }

  const out = allIds
    .map((id) => {
      const meta = byId.get(id) || { name: id, image: '' };
      const r = acc.get(id);
      const score = r ? (r.sum / Math.max(1e-9, r.weightSum)) : 0.5;
      const voters = r ? r.voters : 0;

      return {
        name: meta.name,
        image: meta.image,
        score,
        voters,
        weight: r?.weightSum || 0
      };
    })
    .sort((a, b) => b.score - a.score);

  res.set('Cache-Control', 'no-store');
  return res.json({ items: out, method });
});

// Zapis list dla dropdownów buildów (Admin Setting)
const BUILD_OPTIONS_KEY_PREFIX = 'buildOption:';

router.post('/api/admin/build-options', requireAdmin, (req, res) => {
  res.set('Cache-Control', 'no-store');

  try {
    const file = String(req.body?.file || '').trim();
    const ALLOWED = new Set([
      'Helmet', 'Body', 'Gloves', 'Boots',
      'Necklace', 'Bracelet', 'Ring', 'Earrings',
      'Mind', 'Body_Core', 'Spirit'
    ]);

    if (!ALLOWED.has(file)) {
      return res.status(400).json({ error: 'Bad file' });
    }

    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    const cleaned = items
      .map((x) => ({
        name: String(x?.name || '').trim(),
        image: String(x?.image || '').trim()
      }))
      .filter((x) => x.name);

    setGlobal(`${BUILD_OPTIONS_KEY_PREFIX}${file}`, cleaned);

    return res.json({ ok: true, count: cleaned.length });
  } catch (e) {
    console.error('[admin:build-options] save error', e);
    return res.status(500).json({ error: 'internal' });
  }
});

function ensureIsoSeconds(v) {
  if (!v) return '';

  const mFull = String(v).match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})/);
  if (mFull) return mFull[1];

  const mNoSec = String(v).match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})$/);
  if (mNoSec) return `${mNoSec[1]}:00`;

  const d = new Date(v);
  if (!Number.isNaN(d.getTime())) {
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  }

  return String(v).slice(0, 19);
}

// ─── Events (DB admin) ─────────────────────────────────────────────────────
const EVENTS_GLOBAL_KEY = 'events:global';
const EVENTS_PRESET_PREFIX = 'events:preset:';
const EVENTS_LEGACY_GROUP_PRESETS = ['web', 'repetitive', 'normal', 'special'];
const EVENTS_PRESET_FILES = [
  'web',
  'repetitive',
  'normal',
  'special',
  'hunter_event',
  'guild_boss',
  'unstable_dungeon',
  'power_of_calamity',
  'mind_rift'
];
const EVENTS_PRESET_FILE_SET = new Set(EVENTS_PRESET_FILES);
const EVENTS_PRESET_ALIASES = {
  instance_period: 'unstable_dungeon',
  encore_period: 'unstable_dungeon',
  power_of_destruction: 'power_of_calamity'
};

function loadEventsGlobal() {
  const raw = getGlobal(EVENTS_GLOBAL_KEY);
  const data = (raw && typeof raw === 'object') ? raw : { events: [] };
  const norm = (arr) => (Array.isArray(arr) ? arr : []);

  return {
    events: (data?.events || []).map((monthBlock) => ({
      month: String(monthBlock?.month || '').trim(),
      events: norm(monthBlock?.events).map((e) => {
        const rawLink = Array.isArray(e?.link)
          ? (e.link[0] || '')
          : String(e?.link || '');

        return {
          id: String(e?.id || '').trim(),
          name: String(e?.name || '').trim(),
          start_time: ensureIsoSeconds(String(e?.start_time || '').trim()),
          end_time: ensureIsoSeconds(String(e?.end_time || '').trim()),
          link: String(rawLink).trim(),
          description: String(e?.description || '').trim()
        };
      })
    }))
  };
}

function normalizeEventPresetPayload(raw) {
  return Array.isArray(raw) ? raw : [];
}

function eventPresetKey(name) {
  return `${EVENTS_PRESET_PREFIX}${name}`;
}

function canonicalEventPresetName(name) {
  const key = String(name || '').trim().replace(/\.json$/i, '');
  return EVENTS_PRESET_ALIASES[key] || key;
}

function ensureEventPresetDbMigrations() {
  const legacyEvents = normalizeEventPresetPayload(getGlobal(eventPresetKey('events')));
  if (legacyEvents.length) {
    for (const presetName of EVENTS_LEGACY_GROUP_PRESETS) {
      const targetKey = eventPresetKey(presetName);
      const target = normalizeEventPresetPayload(getGlobal(targetKey));
      if (target.length) continue;

      const group = legacyEvents.find((item) => String(item?.key || '').trim() === presetName);
      const variants = normalizeEventPresetPayload(group?.variants);
      if (variants.length) setGlobal(targetKey, variants);
    }
  }

  const unstableKey = eventPresetKey('unstable_dungeon');
  const unstable = normalizeEventPresetPayload(getGlobal(unstableKey));
  if (!unstable.length) {
    const instance = normalizeEventPresetPayload(getGlobal(eventPresetKey('instance_period')));
    const encore = normalizeEventPresetPayload(getGlobal(eventPresetKey('encore_period')));
    const merged = [...instance, ...encore];
    if (merged.length) setGlobal(unstableKey, merged);
  }

  const calamityKey = eventPresetKey('power_of_calamity');
  const calamity = normalizeEventPresetPayload(getGlobal(calamityKey));
  if (!calamity.length) {
    const oldPower = normalizeEventPresetPayload(getGlobal(eventPresetKey('power_of_destruction')));
    if (oldPower.length) setGlobal(calamityKey, oldPower);
  }
}

function readEventPresetFromDb(name) {
  ensureEventPresetDbMigrations();
  name = canonicalEventPresetName(name);
  if (!EVENTS_PRESET_FILE_SET.has(name)) return [];

  return normalizeEventPresetPayload(getGlobal(eventPresetKey(name)));
}

router.get('/api/events', (req, res) => {
  try {
    return res.json(loadEventsGlobal());
  } catch (e) {
    console.error('[GET /api/events] parse error', e);
    return res.status(500).json({ error: 'Failed to read events' });
  }
});

router.post('/api/admin/events', requireAdmin, (req, res) => {
  try {
    const inArr = Array.isArray(req.body?.events) ? req.body.events : [];

    const cleaned = inArr.map((block) => {
      const month = String(block?.month || '').trim();
      const evs = Array.isArray(block?.events) ? block.events : [];

      const events = evs.map((e) => {
        const id = String(e?.id || '').trim();
        const name = String(e?.name || '').trim();
        const start_time = ensureIsoSeconds(String(e?.start_time || '').trim());
        const end_time = ensureIsoSeconds(String(e?.end_time || '').trim());
        const description = String(e?.description || '').trim();

        let link = '';
        if (Array.isArray(e?.link)) {
          link = String(e.link[0] || '').trim();
        } else {
          link = String(e?.link || '').trim();
        }

        return { id, name, start_time, end_time, link, description };
      });

      return { month, events };
    });

    const payload = { events: cleaned };
    setGlobal(EVENTS_GLOBAL_KEY, payload);

    return res.json({ ok: true, events: cleaned });
  } catch (e) {
    console.error('[POST /api/admin/events] error', e);
    return res.status(500).json({ error: 'Failed to write events' });
  }
});

router.get('/api/events/presets/:name', (req, res) => {
  res.set('Cache-Control', 'no-store');

  try {
    const name = canonicalEventPresetName(req.params?.name);

    if (!EVENTS_PRESET_FILE_SET.has(name)) {
      return res.status(400).json({ error: 'Bad preset name', data: [] });
    }

    const data = readEventPresetFromDb(name);
    return res.json({
      ok: true,
      name,
      data
    });
  } catch (e) {
    console.error('[GET /api/events/presets/:name] error', e);
    return res.json({
      ok: false,
      name: String(req.params?.name || '').trim(),
      data: []
    });
  }
});

router.post('/api/admin/events/presets', requireAdmin, (req, res) => {
  try {
    const rawName = typeof req.body?.file !== 'undefined' ? req.body.file : req.body?.name;
    const rawValue = typeof req.body?.data !== 'undefined' ? req.body.data : req.body?.value;

    const name = canonicalEventPresetName(rawName);
    const value = rawValue;

    if (!EVENTS_PRESET_FILE_SET.has(name)) {
      return res.status(400).json({ error: 'Bad preset name' });
    }

    if (typeof value === 'undefined') {
      return res.status(400).json({ error: 'Missing value' });
    }

    const normalized = normalizeEventPresetPayload(value);
    setGlobal(eventPresetKey(name), normalized);

    return res.json({
      ok: true,
      name,
      count: normalized.length
    });
  } catch (e) {
    console.error('[POST /api/admin/events/presets] error', e);
    return res.status(500).json({ error: 'internal' });
  }
});
// #endregion

// =====================================
// Builds API (DB only)
// #region =====================================
const BUILD_FILE_KEY_PREFIX = 'buildFile:';
const BUILD_DICTS_KEY = 'buildDicts:v1';
const DEFAULT_BUILD_GEMS = { title: 'GEMS', imgLink: '', items: [] };
const DEFAULT_BUILD_HUNTERLIST = { fire: [], water: [], wind: [], light: [], dark: [] };

function buildFileKey(filename) {
  return `${BUILD_FILE_KEY_PREFIX}${String(filename || '').trim()}`;
}

function allowedBuildRel(rel) {
  if (!rel) return false;

  const clean = String(rel).replace(/\\/g, '/').replace(/^\//, '');
  if (clean.toLowerCase() === 'hunter.json') return true;
  if (clean.toLowerCase() === 'gems/gems.json') return true;
  if (clean.startsWith('Hunters/')) return true;

  return false;
}

function listStoredBuildFiles() {
  const rows = getGlobalsByPrefix(BUILD_FILE_KEY_PREFIX) || [];

  return rows.map((r) => {
    const filename = String(r?.key || '').slice(BUILD_FILE_KEY_PREFIX.length);
    return {
      filename,
      content: r?.value ?? null
    };
  });
}

function getStoredBuildFile(filename, fallback = null) {
  return getGlobal(buildFileKey(filename)) ?? fallback;
}

function setStoredBuildFile(filename, content) {
  setGlobal(buildFileKey(filename), content ?? {});
}

router.get('/api/builds', (req, res) => {
  try {
    const files = listStoredBuildFiles()
      .filter((f) => {
        const name = String(f.filename || '');
        return name.startsWith('Hunters/') && /\.json$/i.test(name);
      })
      .sort((a, b) => String(a.filename).localeCompare(String(b.filename)));

    return res.json({ files });
  } catch (e) {
    console.error('[GET /api/builds] error', e);
    return res.status(500).json({ error: 'internal' });
  }
});

router.get('/api/builds/gems', (req, res) => {
  try {
    const data = getStoredBuildFile('Gems/gems.json', DEFAULT_BUILD_GEMS);

    return res.json(data);
  } catch (e) {
    console.error('[GET /api/builds/gems] error', e);
    return res.status(500).json({ error: 'internal' });
  }
});

router.get('/api/builds/hunterlist', (req, res) => {
  try {
    const data = getStoredBuildFile('hunter.json', DEFAULT_BUILD_HUNTERLIST);

    return res.json(data);
  } catch (e) {
    console.error('[GET /api/builds/hunterlist] error', e);
    return res.status(500).json({ error: 'internal' });
  }
});

/* ---------- SŁOWNIKI ---------- */
router.get('/api/builds/dicts', (req, res) => {
  try {
    const dicts = getGlobal(BUILD_DICTS_KEY) || {};
    return res.json(dicts || {});
  } catch (e) {
    console.error('[GET /api/builds/dicts]', e);
    return res.status(500).json({ error: 'internal' });
  }
});

router.post('/api/admin/builds/dicts', requireAdmin, (req, res) => {
  try {
    const payload = req.body || {};
    const name = typeof payload.name === 'string' ? payload.name.trim() : '';
    let dicts = getGlobal(BUILD_DICTS_KEY) || {};

    if (!dicts || typeof dicts !== 'object' || Array.isArray(dicts)) {
      dicts = {};
    }

    if (name) {
      dicts[name] = payload.value;
    } else {
      dicts = payload;
    }

    setGlobal(BUILD_DICTS_KEY, dicts);
    return res.json({ ok: true, dicts });
  } catch (e) {
    console.error('[POST /api/admin/builds/dicts]', e);
    return res.status(500).json({ error: 'internal' });
  }
});
/* ----------------------------------------------------------- */

router.post('/api/admin/builds', requireAdmin, (req, res) => {
  try {
    const { filename, content } = req.body || {};

    if (!filename) {
      return res.status(400).json({ error: 'Missing filename' });
    }

    if (!allowedBuildRel(filename)) {
      return res.status(400).json({ error: 'Disallowed file' });
    }

    setStoredBuildFile(String(filename), content ?? {});
    return res.json({ ok: true, filename: String(filename) });
  } catch (e) {
    console.error('[POST /api/admin/builds] error', e);
    return res.status(500).json({ error: 'internal' });
  }
});
// #endregion

// =====================================
// Build Choice Save (User Vote, Public/Auth)
// #region =====================================
router.post('/api/builds/choose', [], async (req, res) => {
  try {
    const dataset = String(req.body?.dataset || '').trim();
    const character = String(req.body?.character || req.body?.name || '').trim();
    const buildKey = String(req.body?.build || 'build1').trim();
    const slotsRaw = req.body?.slots || req.body?.selection || req.body?.items || req.body || {};

    if (!['hunters', 'hunterWeapons', 'sungWeapons'].includes(dataset)) {
      return res.status(400).json({ error: 'Bad dataset' });
    }

    if (!character) {
      return res.status(400).json({ error: 'Missing character/name' });
    }

    if (!['build1', 'build2'].includes(buildKey)) {
      return res.status(400).json({ error: 'Bad build (use build1|build2)' });
    }

    const normalizeKey = (k) => {
      const s = String(k || '').toLowerCase().trim();
      const m1 = s.match(/^(l|left)[\-_]?([1-4])$/);
      if (m1) return `L${m1[2]}`;

      const m2 = s.match(/^(r|right)[\-_]?([1-4])$/);
      if (m2) return `R${m2[2]}`;

      const m3 = s.match(/^(b|bottom)[\-_]?([1-3])$/);
      if (m3) return `B${m3[2]}`;

      const m4 = s.match(/^([lrb])([1-4])$/);
      if (m4) return `${m4[1].toUpperCase()}${m4[2]}`;

      return null;
    };

    const cleaned = {};
    for (const [k, v] of Object.entries(slotsRaw || {})) {
      const key = normalizeKey(k);
      if (!key) continue;

      const url =
        (typeof v === 'object' && v !== null)
          ? String(v.image || v.url || '').trim()
          : String(v || '').trim();

      if (url) cleaned[key] = url;
    }

    const uid =
      (req.isAuthenticated && req.isAuthenticated() && req.user?.id)
        ? `u:${req.user.id}`
        : `anon:${req.ip || '0.0.0.0'}`;

    const key = `buildChoice:${dataset}:${character}:${buildKey}:${uid}`;
    setGlobal(key, cleaned);

    try {
      await recomputeBestForCharacter(dataset, character);
    } catch (_) {}

    return res.json({ ok: true, saved: Object.keys(cleaned).length });
  } catch (e) {
    console.error('[POST /api/builds/choose] error', e);
    return res.status(500).json({ error: 'internal' });
  }
});

router.get('/api/builds/:file(*)', (req, res) => {
  try {
    const rel = String(req.params.file || '').trim();

    if (!allowedBuildRel(rel)) {
      return res.status(400).json({ error: 'Bad file' });
    }

    const content = getStoredBuildFile(rel, null);
    if (content === null) {
      return res.status(404).json({ error: 'File not found' });
    }

    return res.json(content);
  } catch (e) {
    console.error('[GET /api/builds/:file] error', e);
    return res.status(400).json({ error: e.message || 'bad request' });
  }
});

router.delete('/api/admin/builds/:file(*)', requireAdmin, (req, res) => {
  try {
    const rel = String(req.params.file || '').trim();

    if (!allowedBuildRel(rel)) {
      return res.status(400).json({ error: 'Missing or disallowed file' });
    }

    const existing = getStoredBuildFile(rel, null);
    if (existing === null) {
      return res.status(404).json({ error: 'File not found' });
    }

    deleteGlobal(buildFileKey(rel));
    return res.json({ ok: true });
  } catch (e) {
    console.error('[DELETE /api/admin/builds/:file] error', e);
    return res.status(500).json({ error: e.message || 'internal' });
  }
});

router.get('/api/members', (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(48, Math.max(4, Number(req.query.pageSize) || 12));

  const name = String(req.query.name || '').trim();
  const role = String(req.query.role || '').trim();
  const sort = String(req.query.sort || 'Newest').trim();

  const q = `%${name}%`;

  const totalItems = Number(countMembers({ q }) || 0);
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(page, totalPages);
  const offset = (safePage - 1) * pageSize;

  let items = listMembers({ q, limit: pageSize, offset }) || [];

  items = items.map((u) => {
    const isAdmin = isAdminDiscordId(u.discordId);
    return {
      id: u.id,
      username: u.username,
      displayName: u.displayName,
      avatar: u.avatar || null,
      createdAt: u.createdAt,
      guild: null,
      visits: Number(u.visits || 0),
      role: isAdmin ? 'Admin' : 'Hunter'
    };
  });

  if (role && role !== 'All') {
    items = items.filter((u) => u.role === role);
  }

  if (sort === 'Name A-Z') {
    items.sort((a, b) => (a.displayName || a.username).localeCompare(b.displayName || b.username));
  }
  if (sort === 'Most visits') {
    items.sort((a, b) => (b.visits || 0) - (a.visits || 0));
  }

  return res.json({ items, page: safePage, pageSize, totalPages, totalItems });
});

// API: member profile (for /members/:id page)
router.get('/api/members/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!id) {
    return res.status(400).json({ error: 'Invalid id' });
  }

  const user = getUserById(id);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  const profile = getProfile(id);
  const vis = profile?.visibility || 'public';

  const isOwner =
    (typeof req.isAuthenticated === 'function' &&
      req.isAuthenticated() &&
      Number(req.user?.id) === Number(id));

  if (vis !== 'public' && !isOwner) {
    return res.status(403).json({ error: 'Profile is private' });
  }

  const isAdmin = isAdminDiscordId(user.discordId);

  const payload = {
    id: user.id,
    username: user.username,
    displayName: profile?.displayName || null,
    visibility: vis,
    avatar: user.avatar || null,
    discordId: user.discordId || null,
    createdAt: user.createdAt,
    role: isAdmin ? 'Admin' : 'Hunter',
    visits: getVisits(id),
    guild: null
  };

  return res.json({
    user: payload,
    item: payload
  });
});
// #endregion

// =====================================
// Hunters Dropdowns Config (Global)
// #region =====================================
const HUNTERS_DROPDOWNS_KEY = 'sla_hunters_dropdowns_v1';

// default growth images (so admin has something to edit)
const DEFAULT_HUNTER_GROWTH_IMAGES = {
  0:  "/picture/Growth/0.png",
  1:  "/picture/Growth/1_1.png",
  2:  "/picture/Growth/1_2.png",
  3:  "/picture/Growth/1_3.png",
  4:  "/picture/Growth/2_1.png",
  5:  "/picture/Growth/2_2.png",
  6:  "/picture/Growth/2_3.png",
  7:  "/picture/Growth/3_1.png",
  8:  "/picture/Growth/3_2.png",
  9:  "/picture/Growth/3_3.png",
  10: "/picture/Growth/4_1.png",
  11: "/picture/Growth/4_2.png",
  12: "/picture/Growth/4_3.png",
  13: "/picture/Growth/5_1.png",
  14: "/picture/Growth/5_2.png",
  15: "/picture/Growth/5_3.png"
};

const DEFAULT_HUNTERS_DROPDOWNS = {
  growthMax: 15,
  levelMax: 130,
  growthImages: { ...DEFAULT_HUNTER_GROWTH_IMAGES }
};

function sanitizeHuntersDropdownsConfig(input) {
  const j = (input && typeof input === 'object') ? input : {};

  const growthMax = Number.isFinite(+j.growthMax)
    ? Math.max(1, Math.min(99, Math.floor(+j.growthMax)))
    : DEFAULT_HUNTERS_DROPDOWNS.growthMax;

  const levelMax = Number.isFinite(+j.levelMax)
    ? Math.max(1, Math.min(999, Math.floor(+j.levelMax)))
    : DEFAULT_HUNTERS_DROPDOWNS.levelMax;

  const incomingImages = (j.growthImages && typeof j.growthImages === 'object')
    ? j.growthImages
    : {};

  const growthImages = { ...DEFAULT_HUNTER_GROWTH_IMAGES };

  // allow overriding 0..growthMax
  for (let i = 0; i <= growthMax; i++) {
    const k = String(i);
    const v = incomingImages[k] ?? incomingImages[i];
    if (typeof v === 'string' && v.trim()) {
      growthImages[i] = v.trim();
    }
  }

  return { growthMax, levelMax, growthImages };
}

function readHuntersDropdownsConfig() {
  const raw = getGlobal(HUNTERS_DROPDOWNS_KEY);
  return sanitizeHuntersDropdownsConfig(raw || DEFAULT_HUNTERS_DROPDOWNS);
}

// ---- USER: HUNTERS PROGRESS (per-user, saved inside /api/data)
function sanitizeUserHuntersProgress(input, cfg) {
  const obj = (input && typeof input === 'object' && !Array.isArray(input)) ? input : {};

  const MAX_ADV = 10;
  const MAX_GROWTH = Math.max(1, Math.min(99, parseInt(cfg?.growthMax ?? 15, 10)));
  const MAX_LVL = Math.max(1, Math.min(999, parseInt(cfg?.levelMax ?? 130, 10)));

  const clean = {};
  for (const [k, v] of Object.entries(obj)) {
    const name = String(k || '').trim();
    if (!name) continue;

    const adv = Number.isFinite(+v?.adv) ? Math.max(0, Math.min(MAX_ADV, parseInt(v.adv, 10))) : 0;
    const growth = Number.isFinite(+v?.growth) ? Math.max(0, Math.min(MAX_GROWTH, parseInt(v.growth, 10))) : 0;
    const lvl = Number.isFinite(+v?.lvl) ? Math.max(1, Math.min(MAX_LVL, parseInt(v.lvl, 10))) : 1;

    clean[name] = { adv, growth, lvl };
  }

  return clean;
}

// ---- API: read dropdown config (PUBLIC)
router.get('/api/public/hunters-dropdowns', (req, res) => {
  try {
    const cfg = readHuntersDropdownsConfig();
    return res.json(cfg);
  } catch (e) {
    console.error('[public:hunters-dropdowns] error', e);
    return res.status(500).json({ error: 'internal' });
  }
});

// ---- API: save dropdown config (ADMIN ONLY)
// Body: { config: { growthMax, levelMax, growthImages } }
router.post('/api/admin/hunters-dropdowns', requireAdmin, (req, res) => {
  try {
    const incoming =
      (req.body?.config && typeof req.body.config === 'object')
        ? req.body.config
        : req.body;

    if (!incoming || typeof incoming !== 'object') {
      return res.status(400).json({ error: 'Invalid config (must be an object)' });
    }

    const cfg = sanitizeHuntersDropdownsConfig(incoming);
    setGlobal(HUNTERS_DROPDOWNS_KEY, cfg);

    return res.json({ ok: true, config: cfg });
  } catch (e) {
    console.error('[admin:hunters-dropdowns] error', e);
    return res.status(500).json({ error: 'internal' });
  }
});
// #endregion

// =====================================
// Hunter Weapons Dropdowns Config (Global)
// #region =====================================
const DEFAULT_HUNTER_WEAPONS_DROPDOWNS = {
  growthMax: 15,
  levelMax: 100
};

function sanitizeHunterWeaponsDropdownsConfig(input) {
  const j = (input && typeof input === 'object') ? input : {};

  const growthMax = Number.isFinite(+j.growthMax)
    ? Math.max(1, Math.min(99, Math.floor(+j.growthMax)))
    : DEFAULT_HUNTER_WEAPONS_DROPDOWNS.growthMax;

  const levelMax = Number.isFinite(+j.levelMax)
    ? Math.max(1, Math.min(999, Math.floor(+j.levelMax)))
    : DEFAULT_HUNTER_WEAPONS_DROPDOWNS.levelMax;

  // opcjonalna kompatybilność, jeśli frontend użyje innej nazwy pola
  return { growthMax, levelMax, maxLvMax: levelMax };
}

function readHunterWeaponsDropdownsConfig() {
  const raw = getGlobal(HUNTER_WEAPONS_DROPDOWNS_KEY);
  return sanitizeHunterWeaponsDropdownsConfig(raw || DEFAULT_HUNTER_WEAPONS_DROPDOWNS);
}

// ---- API: read dropdown config (PUBLIC)
router.get('/api/public/hunter-weapons-dropdowns', (req, res) => {
  try {
    const cfg = readHunterWeaponsDropdownsConfig();
    return res.json(cfg);
  } catch (e) {
    console.error('[public:hunter-weapons-dropdowns] error', e);
    return res.status(500).json({ error: 'internal' });
  }
});

// ---- API: save dropdown config (ADMIN ONLY)
// Body: { config: { growthMax, levelMax } }  (albo bez "config" – też przyjmie)
router.post('/api/admin/hunter-weapons-dropdowns', requireAdmin, (req, res) => {
  try {
    const incoming =
      (req.body?.config && typeof req.body.config === 'object')
        ? req.body.config
        : req.body;

    if (!incoming || typeof incoming !== 'object') {
      return res.status(400).json({ error: 'Invalid config (must be an object)' });
    }

    const cfg = sanitizeHunterWeaponsDropdownsConfig(incoming);
    setGlobal(HUNTER_WEAPONS_DROPDOWNS_KEY, cfg);

    return res.json({ ok: true, config: cfg });
  } catch (e) {
    console.error('[admin:hunter-weapons-dropdowns] error', e);
    return res.status(500).json({ error: 'internal' });
  }
});
// #endregion

// =====================================
// Sung Weapons Dropdowns (Global Config)
// #region =====================================
const SUNG_WEAPONS_DROPDOWNS_KEY = 'sla_sung_weapons_dropdowns_v1';

const DEFAULT_SUNG_WEAPONS_DROPDOWNS = {
  levelMax: 100,
};

function sanitizeSungWeaponsDropdownsConfig(cfg) {
  try {
    const n = Number(cfg?.levelMax);

    // levelMax must be a sane integer
    let levelMax = Number.isFinite(n)
      ? Math.round(n)
      : DEFAULT_SUNG_WEAPONS_DROPDOWNS.levelMax;

    levelMax = Math.max(1, Math.min(999, levelMax)); // allow 1..999

    return { levelMax };
  } catch (_) {
    return { ...DEFAULT_SUNG_WEAPONS_DROPDOWNS };
  }
}

function readSungWeaponsDropdownsConfig() {
  const raw = getGlobal(SUNG_WEAPONS_DROPDOWNS_KEY);
  return sanitizeSungWeaponsDropdownsConfig(raw || DEFAULT_SUNG_WEAPONS_DROPDOWNS);
}

// ---- API: get dropdown config (public)
router.get('/api/public/sung-weapons-dropdowns', (req, res) => {
  try {
    const cfg = readSungWeaponsDropdownsConfig();
    return res.json(cfg);
  } catch (e) {
    console.error('[public:sung-weapons-dropdowns] error', e);
    return res.status(500).json({ error: 'internal' });
  }
});

// ---- API: save dropdown config (admin only)
// Body: { config: { levelMax } }
router.post('/api/admin/sung-weapons-dropdowns', requireAdmin, (req, res) => {
  try {
    const incoming =
      (req.body?.config && typeof req.body.config === 'object' && !Array.isArray(req.body.config))
        ? req.body.config
        : req.body;

    if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) {
      return res.status(400).json({ error: 'Invalid config (must be an object)' });
    }

    const cfg = sanitizeSungWeaponsDropdownsConfig(incoming);

    setGlobal(SUNG_WEAPONS_DROPDOWNS_KEY, cfg);
    return res.json({ ok: true, config: cfg });
  } catch (e) {
    console.error('[admin:sung-weapons-dropdowns] error', e);
    return res.status(500).json({ error: 'internal' });
  }
});
// #endregion

// =====================================
// Cores (Global for All Users)
// #region =====================================
const CORES_GLOBAL_KEY = 'sla_cores_data_v1';

function coresDefault() {
  return { mind: [], body: [], spirit: [], version: 0 };
}

function normalizeCoresPayload(raw) {
  const base = coresDefault();
  if (!raw || typeof raw !== 'object') return base;

  const out = {
    mind: Array.isArray(raw.mind) ? raw.mind : [],
    body: Array.isArray(raw.body) ? raw.body : [],
    spirit: Array.isArray(raw.spirit) ? raw.spirit : [],
    version: Number.isFinite(+raw.version) ? +raw.version : 0
  };

  for (const k of ['mind', 'body', 'spirit']) {
    out[k] = out[k]
      .map((x) => ({
        id: String(x?.id || ''),
        name: String(x?.name || ''),
        effect: String(x?.effect || ''),
        image: String(x?.image || '')
      }))
      .filter((x) => x.name || x.effect || x.image);
  }

  return out;
}

router.get('/api/cores', (req, res) => {
  res.set('Cache-Control', 'no-store');
  const current = normalizeCoresPayload(getGlobal(CORES_GLOBAL_KEY));
  return res.json(current);
});

// Admin saves GLOBAL cores (visible for everyone)
router.post('/api/cores', requireAdmin, (req, res) => {
  try {
    const incoming = normalizeCoresPayload(req.body || {});
    const next = {
      mind: incoming.mind,
      body: incoming.body,
      spirit: incoming.spirit,
      version: Date.now()
    };

    setGlobal(CORES_GLOBAL_KEY, next);
    return res.json(next);
  } catch (e) {
    return res.status(500).json({ error: 'Failed to save cores.' });
  }
});
// #endregion

// =====================================
// Artifacts (Global for All Users)
// #region =====================================
const ARTIFACTS_GLOBAL_KEY = 'sla_artifacts_data_v1';

function artifactsDefault() {
  return { complete: [], armor: [], accessories: [], version: 0 };
}

function requiredArtifactsImagesCount(key) {
  if (key === 'complete') return 8;
  if (key === 'armor') return 4;
  if (key === 'accessories') return 4;
  return 4;
}

function normalizeArtifactsPayload(raw) {
  const base = artifactsDefault();
  if (!raw || typeof raw !== 'object') return base;

  const out = {
    complete: Array.isArray(raw.complete) ? raw.complete : [],
    armor: Array.isArray(raw.armor) ? raw.armor : [],
    accessories: Array.isArray(raw.accessories) ? raw.accessories : [],
    version: Number.isFinite(+raw.version) ? +raw.version : 0
  };

  for (const k of ['complete', 'armor', 'accessories']) {
    const need = requiredArtifactsImagesCount(k);

    out[k] = out[k]
      .map((x) => {
        const imagesRaw = Array.isArray(x?.images) ? x.images : [];
        const images = Array.from({ length: need }, (_, i) => String(imagesRaw[i] || ''));

        const pass = (x?.passives && typeof x.passives === 'object') ? x.passives : {};

        // obsługa obu formatów:
        // - nowy: passives.p2/p4/p8
        // - stary/front: p2/p4/p8 na głównym obiekcie
        const p2 = String(pass.p2 || x?.p2 || '');
        const p4 = String(pass.p4 || x?.p4 || '');
        const p8 = String(pass.p8 || x?.p8 || '');

        return {
          id: String(x?.id || ''),
          name: String(x?.name || ''),
          subName: String(x?.subName || ''),
          images,
          passives: {
            p2,
            p4,
            ...(k === 'complete' ? { p8 } : {})
          }
        };
      })
      .filter((x) =>
        x.name ||
        x.subName ||
        (x.images || []).some(Boolean) ||
        x.passives?.p2 ||
        x.passives?.p4 ||
        x.passives?.p8
      );
  }

  return out;
}

router.get('/api/artifacts', (req, res) => {
  res.set('Cache-Control', 'no-store');
  const current = normalizeArtifactsPayload(getGlobal(ARTIFACTS_GLOBAL_KEY));
  return res.json(current);
});

// Admin saves GLOBAL artifacts (visible for everyone)
router.post('/api/artifacts', requireAdmin, (req, res) => {
  try {
    const incoming = normalizeArtifactsPayload(req.body || {});
    const next = {
      complete: incoming.complete,
      armor: incoming.armor,
      accessories: incoming.accessories,
      version: Date.now()
    };

    setGlobal(ARTIFACTS_GLOBAL_KEY, next);
    return res.json(next);
  } catch (e) {
    return res.status(500).json({ error: 'Failed to save artifacts.' });
  }
});
// #endregion

// =====================================
// Shadows (Global Catalog)
// #region =====================================
const SHADOWS_CATALOG_KEY = 'catalog:shadows';

router.get('/api/public/shadows', (req, res) => {
  try {
    const list = getGlobal(SHADOWS_CATALOG_KEY);
    return res.json({ ok: true, items: Array.isArray(list) ? list : [] });
  } catch (e) {
    console.error('[public:shadows] error', e);
    return res.status(500).json({ error: 'internal' });
  }
});

// ---- API: manage shadows (admin only)
// Item structure: { name, image, image_build }
router.post('/api/admin/shadows', requireAdmin, (req, res) => {
  try {
    const { action } = req.body || {};
    let list = getGlobal(SHADOWS_CATALOG_KEY) || [];
    if (!Array.isArray(list)) list = [];
// #endregion

// =====================================
// Shadows - Add
// #region =====================================
    if (action === 'add') {
      const item = req.body?.item || {};
      const name = String(item?.name || '').trim();
      const image = String(item?.image || '').trim();
      const image_build = String(item?.image_build || '').trim();

      if (!name) return res.status(400).json({ error: 'Missing item.name' });
      if (!image) return res.status(400).json({ error: 'Missing item.image' });

      if (list.some(s => String(s.name || '').trim() === name)) {
        return res.status(400).json({ error: 'Already exists' });
      }

      // Add on TOP
      list.unshift({ name, image, image_build });

      // Global order TOP too
      const key = 'order:shadows';
      const ord = getGlobal(key) || [];
      setGlobal(key, [name, ...ord.filter(n => n !== name)]);

      setGlobal(SHADOWS_CATALOG_KEY, list);
      return res.json({ ok: true, list });
    }
// #endregion

// =====================================
// Shadows - Remove
// #region =====================================
    if (action === 'remove') {
      const name = String(req.body?.name || '').trim();
      if (!name) return res.status(400).json({ error: 'Missing name' });

      const idx = list.findIndex(s => String(s.name || '').trim() === name);
      if (idx === -1) return res.status(404).json({ error: 'Not found' });

      list.splice(idx, 1);

      // Remove from global order
      const key = 'order:shadows';
      const ord = (getGlobal(key) || []).filter(n => n !== name);
      setGlobal(key, ord);

      setGlobal(SHADOWS_CATALOG_KEY, list);
      return res.json({ ok: true, list });
    }
// #endregion

// =====================================
// Shadows - Update
// #region =====================================
    if (action === 'update') {
      const originalName = String(req.body?.originalName || '').trim();
      const item = req.body?.item || {};
      if (!originalName) return res.status(400).json({ error: 'Missing originalName' });

      const idx = list.findIndex(s => String(s.name || '').trim() === originalName);
      if (idx === -1) return res.status(404).json({ error: 'Not found' });

      const newName = String(item?.name ?? list[idx].name ?? '').trim();
      const image = String(item?.image ?? list[idx].image ?? '').trim();
      const image_build = String(item?.image_build ?? list[idx].image_build ?? '').trim();

      if (!newName) return res.status(400).json({ error: 'Missing item.name' });
      if (!image) return res.status(400).json({ error: 'Missing item.image' });

      if (newName !== originalName && list.some(s => String(s.name || '').trim() === newName)) {
        return res.status(400).json({ error: 'Name already in use' });
      }

      list[idx] = { ...list[idx], name: newName, image, image_build };

      // If renamed -> update global order names
      if (newName !== originalName) {
        const key = 'order:shadows';
        const ord = getGlobal(key) || [];
        setGlobal(key, ord.map(n => (n === originalName ? newName : n)));
      }

      setGlobal(SHADOWS_CATALOG_KEY, list);
      return res.json({ ok: true, list });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    console.error('[admin:shadows] error', e);
    return res.status(500).json({ error: 'internal' });
  }
});
// #endregion

// =====================================
// Successors (Global Catalog)
// #region =====================================
const SUCCESSORS_CATALOG_KEY = 'catalog:successors';
const SUCCESSORS_ORDER_KEY = 'order:successors';
const DEFAULT_SUCCESSORS_CATALOG = [
  {
    name: 'Myro',
    image_build: '/picture/Successors/Myro.png',
    element: 'none',
    successor_type_image: ''
  }
];

function normalizeSuccessorElement(value) {
  const v = String(value || '').trim().toLowerCase();
  return ['fire', 'water', 'wind', 'light', 'dark', 'none'].includes(v) ? v : 'none';
}

function normalizeSuccessorItem(item) {
  const src = item && typeof item === 'object' ? item : {};
  const name = String(src.name || '').trim();
  const image_build = String(src.image_build || src.buildImage || src.image || '').trim();
  const element = normalizeSuccessorElement(src.element);
  const successor_type_image = String(
    src.successor_type_image ||
    src.successorTypeImage ||
    src.successor_image ||
    src.type_image ||
    ''
  ).trim();
  return { name, image_build, element, successor_type_image };
}

function applySuccessorsOrder(list, order) {
  const ord = Array.isArray(order) ? order : [];
  const map = new Map();
  ord.forEach((name, idx) => map.set(String(name), idx));
  return [...(Array.isArray(list) ? list : [])].sort((a, b) => {
    const an = String(a?.name || '');
    const bn = String(b?.name || '');
    const ai = map.has(an) ? map.get(an) : 1e9;
    const bi = map.has(bn) ? map.get(bn) : 1e9;
    if (ai !== bi) return ai - bi;
    return an.localeCompare(bn);
  });
}

router.get('/api/public/successors', (req, res) => {
  try {
    let list = getGlobal(SUCCESSORS_CATALOG_KEY);
    if (!Array.isArray(list)) {
      list = DEFAULT_SUCCESSORS_CATALOG;
      setGlobal(SUCCESSORS_CATALOG_KEY, list);
      const curOrder = getGlobal(SUCCESSORS_ORDER_KEY);
      if (!Array.isArray(curOrder) || !curOrder.length) {
        setGlobal(SUCCESSORS_ORDER_KEY, list.map(x => x.name));
      }
    }
    const safe = Array.isArray(list) ? list.map(normalizeSuccessorItem).filter(x => x.name) : [];
    const order = getGlobal(SUCCESSORS_ORDER_KEY) || [];
    return res.json({ ok: true, items: applySuccessorsOrder(safe, order) });
  } catch (e) {
    console.error('[public:successors] error', e);
    return res.status(500).json({ error: 'internal' });
  }
});

router.post('/api/admin/successors', requireAdmin, (req, res) => {
  try {
    const action = String(req.body?.action || '').trim();
    let list = getGlobal(SUCCESSORS_CATALOG_KEY) || [];
    if (!Array.isArray(list)) list = [];
    list = list.map(normalizeSuccessorItem).filter(x => x.name);

    if (action === 'add') {
      const item = normalizeSuccessorItem(req.body?.item);
      if (!item.name) return res.status(400).json({ error: 'Missing item.name' });
      if (!item.image_build) return res.status(400).json({ error: 'Missing item.image_build' });
      if (list.some(s => String(s.name || '').trim() === item.name)) {
        return res.status(400).json({ error: 'Already exists' });
      }

      list.unshift(item);
      const ord = getGlobal(SUCCESSORS_ORDER_KEY) || [];
      setGlobal(SUCCESSORS_ORDER_KEY, [item.name, ...ord.filter(n => n !== item.name)]);
      setGlobal(SUCCESSORS_CATALOG_KEY, list);
      return res.json({ ok: true, list });
    }

    if (action === 'remove') {
      const name = String(req.body?.name || '').trim();
      if (!name) return res.status(400).json({ error: 'Missing name' });

      const idx = list.findIndex(s => String(s.name || '').trim() === name);
      if (idx === -1) return res.status(404).json({ error: 'Not found' });

      list.splice(idx, 1);
      const ord = (getGlobal(SUCCESSORS_ORDER_KEY) || []).filter(n => n !== name);
      setGlobal(SUCCESSORS_ORDER_KEY, ord);
      setGlobal(SUCCESSORS_CATALOG_KEY, list);
      return res.json({ ok: true, list });
    }

    if (action === 'update') {
      const originalName = String(req.body?.originalName || '').trim();
      if (!originalName) return res.status(400).json({ error: 'Missing originalName' });

      const idx = list.findIndex(s => String(s.name || '').trim() === originalName);
      if (idx === -1) return res.status(404).json({ error: 'Not found' });

      const incoming = req.body?.item || {};
      const hasIncomingSuccessorTypeImage =
        Object.prototype.hasOwnProperty.call(incoming, 'successor_type_image') ||
        Object.prototype.hasOwnProperty.call(incoming, 'successorTypeImage') ||
        Object.prototype.hasOwnProperty.call(incoming, 'successor_image') ||
        Object.prototype.hasOwnProperty.call(incoming, 'type_image');
      const item = normalizeSuccessorItem({
        ...list[idx],
        ...incoming,
        element: Object.prototype.hasOwnProperty.call(incoming, 'element') ? incoming.element : list[idx].element,
        successor_type_image: hasIncomingSuccessorTypeImage
          ? (
              Object.prototype.hasOwnProperty.call(incoming, 'successor_type_image') ? incoming.successor_type_image
                : Object.prototype.hasOwnProperty.call(incoming, 'successorTypeImage') ? incoming.successorTypeImage
                : Object.prototype.hasOwnProperty.call(incoming, 'successor_image') ? incoming.successor_image
                : incoming.type_image
            )
          : list[idx].successor_type_image
      });
      if (!item.name) return res.status(400).json({ error: 'Missing item.name' });
      if (!item.image_build) return res.status(400).json({ error: 'Missing item.image_build' });
      if (item.name !== originalName && list.some(s => String(s.name || '').trim() === item.name)) {
        return res.status(400).json({ error: 'Name already in use' });
      }

      list[idx] = item;
      if (item.name !== originalName) {
        const ord = getGlobal(SUCCESSORS_ORDER_KEY) || [];
        setGlobal(SUCCESSORS_ORDER_KEY, ord.map(n => (n === originalName ? item.name : n)));
      }
      setGlobal(SUCCESSORS_CATALOG_KEY, list);
      return res.json({ ok: true, list });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    console.error('[admin:successors] error', e);
    return res.status(500).json({ error: 'internal' });
  }
});

router.get('/api/public/successors-order', (req, res) => {
  return res.json({ ok: true, order: getGlobal(SUCCESSORS_ORDER_KEY) || [] });
});

router.post('/api/admin/successors-order', requireAdmin, (req, res) => {
  try {
    const catalog = getGlobal(SUCCESSORS_CATALOG_KEY);
    const names = new Set((Array.isArray(catalog) ? catalog : []).map(x => String(x?.name || '').trim()).filter(Boolean));
    const seen = new Set();
    const arr = [];
    const input = Array.isArray(req.body?.order) ? req.body.order : [];
    for (const raw of input) {
      const name = String(raw || '').trim();
      if (!name || !names.has(name) || seen.has(name)) continue;
      seen.add(name);
      arr.push(name);
    }
    setGlobal(SUCCESSORS_ORDER_KEY, arr);
    return res.json({ ok: true, order: arr });
  } catch (e) {
    console.error('[admin:successors-order] error', e);
    return res.status(500).json({ error: 'internal' });
  }
});
// #endregion

// =====================================
// Shadow Weapons (Global Catalog)
// #region =====================================
const SHADOW_WEAPONS_KEY = 'shadowWeaponsCatalog:v1';
const SHADOW_WEAPONS_BACKUP_FILE = path.join(__dirname, '..', 'data', 'shadow-weapons-catalog.json');

function sanitizeShadowWeaponsCatalog(catalog) {
  if (!catalog || typeof catalog !== 'object' || Array.isArray(catalog)) return {};

  const clean = {};
  for (const [shadowName, val] of Object.entries(catalog)) {
    const key = String(shadowName || '').trim();
    if (!key) continue;

    const name = String(val?.name || '').trim();
    const image = String(val?.image || '').trim();

    clean[key] = { name, image };
  }
  return clean;
}

function readShadowWeaponsBackup() {
  try {
    if (!fs.existsSync(SHADOW_WEAPONS_BACKUP_FILE)) return {};
    const raw = JSON.parse(fs.readFileSync(SHADOW_WEAPONS_BACKUP_FILE, 'utf8'));
    return sanitizeShadowWeaponsCatalog(raw);
  } catch (e) {
    console.error('[shadow-weapons:backup:read] error', e);
    return {};
  }
}

function writeShadowWeaponsBackup(catalog) {
  try {
    fs.mkdirSync(path.dirname(SHADOW_WEAPONS_BACKUP_FILE), { recursive: true });
    fs.writeFileSync(SHADOW_WEAPONS_BACKUP_FILE, JSON.stringify(catalog || {}, null, 2), 'utf8');
  } catch (e) {
    console.error('[shadow-weapons:backup:write] error', e);
  }
}

function readShadowWeaponsCatalog() {
  const dbCatalog = sanitizeShadowWeaponsCatalog(getGlobal(SHADOW_WEAPONS_KEY));
  if (Object.keys(dbCatalog).length > 0) return dbCatalog;

  const backup = readShadowWeaponsBackup();
  if (Object.keys(backup).length > 0) {
    setGlobal(SHADOW_WEAPONS_KEY, backup);
    return backup;
  }

  return {};
}

// ---- API: get weapons catalog (public for everyone)
router.get('/api/public/shadow-weapons', (req, res) => {
  try {
    return res.json(readShadowWeaponsCatalog());
  } catch (e) {
    console.error('[public:shadow-weapons] error', e);
    return res.status(500).json({ error: 'internal' });
  }
});

// ---- API: save weapons catalog (admin only)
// Body: { catalog: { "ShadowName": { name: "...", image: "..." } } }
router.post('/api/admin/shadow-weapons', requireAdmin, (req, res) => {
  try {
    const catalog = req.body?.catalog;

    if (!catalog || typeof catalog !== 'object' || Array.isArray(catalog)) {
      return res.status(400).json({ error: 'Invalid catalog (must be an object)' });
    }

    const clean = sanitizeShadowWeaponsCatalog(catalog);
    const current = readShadowWeaponsCatalog();

    if (
      Object.keys(clean).length === 0 &&
      Object.keys(current).length > 0 &&
      req.body?.allowEmpty !== true
    ) {
      return res.status(400).json({
        error: 'Refusing to overwrite existing shadow weapons with an empty catalog',
        catalog: current
      });
    }

    setGlobal(SHADOW_WEAPONS_KEY, clean);
    writeShadowWeaponsBackup(clean);
    return res.json({ ok: true, catalog: clean });
  } catch (e) {
    console.error('[admin:shadow-weapons] error', e);
    return res.status(500).json({ error: 'internal' });
  }
});
// #endregion

// =====================================
// Shadow Dropdowns (Global Config)
// #region =====================================
const SHADOW_DROPDOWNS_KEY = 'shadowDropdownsConfig:v1';

const DEFAULT_SHADOW_DROPDOWNS = {
  ranks: [
    { name: "Don't own", max: 0 },
    { name: "Common", max: 5 },
    { name: "Elite", max: 7 },
    { name: "Knight", max: 9 },
    { name: "Elite Knight", max: 11 },
    { name: "General", max: 13 }
  ],
  growthMax: 15,
  armamentMax: 5
};

function sanitizeShadowDropdownsConfig(input) {
  try {
    const j = (input && typeof input === 'object') ? input : {};
    const ranks = Array.isArray(j.ranks) ? j.ranks : DEFAULT_SHADOW_DROPDOWNS.ranks;

    const growthMax = Number.isFinite(+j.growthMax)
      ? Math.max(1, Math.min(99, +j.growthMax))
      : DEFAULT_SHADOW_DROPDOWNS.growthMax;

    const armamentMax = Number.isFinite(+j.armamentMax)
      ? Math.max(1, Math.min(10, +j.armamentMax))
      : DEFAULT_SHADOW_DROPDOWNS.armamentMax;

    const safeRanks = [];
    for (const r of ranks) {
      const name = String(r?.name || '').trim();
      if (!name) continue;
      const max = Number.isFinite(+r?.max) ? Math.max(0, Math.min(999, +r.max)) : 0;
      safeRanks.push({ name, max });
    }

    // Always ensure "Don't own"
    if (!safeRanks.find(x => x.name === "Don't own")) {
      safeRanks.unshift({ name: "Don't own", max: 0 });
    } else {
      const idx = safeRanks.findIndex(x => x.name === "Don't own");
      if (idx > 0) {
        const [it] = safeRanks.splice(idx, 1);
        safeRanks.unshift(it);
      }
    }

    return { ranks: safeRanks, growthMax, armamentMax };
  } catch (_) {
    return { ...DEFAULT_SHADOW_DROPDOWNS };
  }
}

// ---- API: get dropdown config (public)
router.get('/api/public/shadows-dropdowns', (req, res) => {
  try {
    const raw = getGlobal(SHADOW_DROPDOWNS_KEY);
    const cfg = sanitizeShadowDropdownsConfig(raw || DEFAULT_SHADOW_DROPDOWNS);
    return res.json(cfg);
  } catch (e) {
    console.error('[public:shadows-dropdowns] error', e);
    return res.status(500).json({ error: 'internal' });
  }
});

// ---- API: save dropdown config (admin only)
// Body: { config: { ranks:[{name,max}], growthMax, armamentMax } }
router.post('/api/admin/shadows-dropdowns', requireAdmin, (req, res) => {
  try {
    const incoming =
      (req.body?.config && typeof req.body.config === 'object' && !Array.isArray(req.body.config))
        ? req.body.config
        : req.body;

    if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) {
      return res.status(400).json({ error: 'Invalid config (must be an object)' });
    }

    const cfg = sanitizeShadowDropdownsConfig(incoming);

    setGlobal(SHADOW_DROPDOWNS_KEY, cfg);
    return res.json({ ok: true, config: cfg });
  } catch (e) {
    console.error('[admin:shadows-dropdowns] error', e);
    return res.status(500).json({ error: 'internal' });
  }
});
// #endregion

// =====================================
// SHADOW DETAILS (GLOBAL for ALL USERS)
// #region =====================================
const SHADOW_DETAILS_KEY = 'sla_shadow_details_v1';
const SHADOW_GLOBAL_STATS_KEY = 'sla_shadow_global_stats_v1';

const DEFAULT_SHADOW_GLOBAL_STATS = {
  rankMin: 'Common',
  rankMax: 'General',
  growthMin: '0',
  growthMax: '15',
  skinOrder: ['General', 'Elite Knight', 'Knight', 'Elite', 'Common']
};

function sanitizeShadowGlobalStats(input) {
  const src = (input && typeof input === 'object') ? input : {};
  const skinOrder = Array.isArray(src.skinOrder)
    ? src.skinOrder.map(x => String(x || '').trim()).filter(Boolean)
    : DEFAULT_SHADOW_GLOBAL_STATS.skinOrder;

  return {
    rankMin: String(src.rankMin ?? DEFAULT_SHADOW_GLOBAL_STATS.rankMin),
    rankMax: String(src.rankMax ?? DEFAULT_SHADOW_GLOBAL_STATS.rankMax),
    growthMin: String(src.growthMin ?? DEFAULT_SHADOW_GLOBAL_STATS.growthMin),
    growthMax: String(src.growthMax ?? DEFAULT_SHADOW_GLOBAL_STATS.growthMax),
    skinOrder: skinOrder.length ? skinOrder : DEFAULT_SHADOW_GLOBAL_STATS.skinOrder
  };
}

router.get('/api/public/shadow-global-stats', (req, res) => {
  res.set('Cache-Control', 'no-store');

  try {
    return res.json({ ok: true, stats: sanitizeShadowGlobalStats(getGlobal(SHADOW_GLOBAL_STATS_KEY) || {}) });
  } catch (e) {
    console.error('[public:shadow-global-stats] error', e);
    return res.status(500).json({ error: 'internal' });
  }
});

router.post('/api/admin/shadow-global-stats', requireAdmin, (req, res) => {
  res.set('Cache-Control', 'no-store');

  try {
    const stats = sanitizeShadowGlobalStats(req.body?.stats || req.body || {});
    setGlobal(SHADOW_GLOBAL_STATS_KEY, stats);
    return res.json({ ok: true, stats });
  } catch (e) {
    console.error('[admin:shadow-global-stats] error', e);
    return res.status(500).json({ error: 'internal' });
  }
});

function defaultShadowDetailsTextBlock() {
  return {
    type: 'text',
    text: ''
  };
}

function defaultShadowDetailsImageBlock() {
  return {
    type: 'image',
    image: '',
    title: '',
    text: '',
    color: 'additional'
  };
}

function defaultShadowDetailsBlock() {
  return defaultShadowDetailsTextBlock();
}

function defaultShadowSkillEntry(withLevels = true) {
  return withLevels
    ? {
        name: '',
        lvl1: [],
        lvl10: []
      }
    : {
        name: '',
        min: '',
        max: ''
      };
}

function defaultShadowDetailsEntry() {
  return {
    top: {
      rankMin: 'Common',
      rankMax: 'General',
      maxArmyLevelMin: '+5',
      maxArmyLevelMax: '+13',
      shadesRequiredMin: '100',
      shadesRequiredMax: '100',
      weaponName: '',
      weaponImage: '',
      images: []
    },
    skills: {
      basic: [
        defaultShadowSkillEntry(true),
        defaultShadowSkillEntry(true),
        defaultShadowSkillEntry(true),
        defaultShadowSkillEntry(true),
        defaultShadowSkillEntry(true),
        defaultShadowSkillEntry(true)
      ],
      special: [
        defaultShadowSkillEntry(true),
        {
          name: 'Armament Advancement',
          images: []
        },
        defaultShadowSkillEntry(false)
      ]
    }
  };
}

function sanitizeShadowDetailsBlock(input) {
  const src = (input && typeof input === 'object') ? input : {};
  const type = String(src.type || '').trim().toLowerCase() === 'image' ? 'image' : 'text';

  if (type === 'image') {
    return {
      type: 'image',
      image: String(src.image || '').trim(),
      title: String(src.title || ''),
      text: String(src.text || ''),
      color: String(src.color || 'additional').trim().toLowerCase() || 'additional'
    };
  }

  return {
    type: 'text',
    text: String(src.text || '')
  };
}

function sanitizeShadowDetailsBlocks(input) {
  return Array.isArray(input) ? input.map(sanitizeShadowDetailsBlock) : [];
}

function sanitizeShadowSkillEntry(input, withLevels = true, fallbackName = '') {
  const src = (input && typeof input === 'object') ? input : {};

  if (withLevels) {
    return {
      name: String(src.name || fallbackName || '').trim(),
      lvl1: sanitizeShadowDetailsBlocks(src.lvl1),
      lvl10: sanitizeShadowDetailsBlocks(src.lvl10)
    };
  }

  return {
    name: String(src.name || fallbackName || '').trim(),
    min: String(src.min || ''),
    max: String(src.max || '')
  };
}

function sanitizeShadowTopDetails(input) {
  const src = (input && typeof input === 'object') ? input : {};
  const base = defaultShadowDetailsEntry().top;

  return {
    rankMin: String(src.rankMin ?? base.rankMin),
    rankMax: String(src.rankMax ?? base.rankMax),
    maxArmyLevelMin: String(src.maxArmyLevelMin ?? base.maxArmyLevelMin),
    maxArmyLevelMax: String(src.maxArmyLevelMax ?? base.maxArmyLevelMax),
    shadesRequiredMin: String(src.shadesRequiredMin ?? base.shadesRequiredMin),
    shadesRequiredMax: String(src.shadesRequiredMax ?? base.shadesRequiredMax),
    weaponName: String(src.weaponName ?? base.weaponName),
    weaponImage: String(src.weaponImage ?? base.weaponImage),
    images: Array.isArray(src.images)
      ? src.images.map((x) => String(x || '').trim()).filter(Boolean)
      : []
  };
}

function sanitizeShadowDetailsSkills(input) {
  const src = (input && typeof input === 'object') ? input : {};
  const def = defaultShadowDetailsEntry().skills;

  const basicSrc = Array.isArray(src.basic) ? src.basic : def.basic;
  const specialSrc = Array.isArray(src.special) ? src.special : def.special;

  const basic = [];
  for (let i = 0; i < 6; i++) {
    basic.push(sanitizeShadowSkillEntry(basicSrc[i], true, `Basic Skill ${i + 1}`));
  }

  const special = [];

  special.push(
    sanitizeShadowSkillEntry(specialSrc[0], true, 'Special Skill')
  );

  const armSrc = (specialSrc[1] && typeof specialSrc[1] === 'object') ? specialSrc[1] : {};
  special.push({
    name: String(armSrc.name || 'Armament Advancement').trim(),
    images: Array.isArray(armSrc.images)
      ? armSrc.images.map((x) => String(x || '').trim()).filter(Boolean)
      : []
  });

  special.push(
    sanitizeShadowSkillEntry(specialSrc[2], false, 'Min / Max')
  );

  return { basic, special };
}

function sanitizeShadowDetailsMap(input) {
  const src = (input && typeof input === 'object' && !Array.isArray(input)) ? input : {};
  const out = {};

  for (let i = 1; i <= 11; i++) {
    const key = String(i);
    const item = (src[key] && typeof src[key] === 'object' && !Array.isArray(src[key])) ? src[key] : {};
    out[key] = {
      lvl: String(item.lvl ?? ''),
      adv: String(item.adv ?? ''),
      totalPower: String(item.totalPower ?? ''),
      statLabel: String(item.statLabel || 'Attack') || 'Attack',
      statValue: String(item.statValue ?? ''),
      precision: String(item.precision ?? ''),
      blocks: sanitizeShadowDetailsBlocks(item.blocks),
      skills: (item.skills && typeof item.skills === 'object' && !Array.isArray(item.skills))
        ? item.skills
        : {}
    };
  }

  return out;
}

function hasShadowDetailsMap(input) {
  return !!(input && typeof input === 'object' && !Array.isArray(input) && input['1']);
}

function sanitizeShadowDetailsEntry(input) {
  const src = (input && typeof input === 'object') ? input : {};
  const raw = (src.details && typeof src.details === 'object') ? src.details : src;
  const base = defaultShadowDetailsEntry();
  const rawDetailsMap = raw.detailsMap || raw.legacyDetails || (hasShadowDetailsMap(raw) ? raw : null);

  return {
    details: {
      top: sanitizeShadowTopDetails(raw.top || base.top),
      skills: sanitizeShadowDetailsSkills(raw.skills || base.skills),
      detailsMap: rawDetailsMap ? sanitizeShadowDetailsMap(rawDetailsMap) : sanitizeShadowDetailsMap({})
    }
  };
}

function readShadowDetailsStore() {
  const raw = getGlobal(SHADOW_DETAILS_KEY);
  return (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};
}

router.get('/api/public/shadow-details', (req, res) => {
  res.set('Cache-Control', 'no-store');

  try {
    const store = readShadowDetailsStore();
    const name = String(req.query?.name || '').trim();

    if (name) {
      const item = sanitizeShadowDetailsEntry(store[name] || {});
      return res.json({ ok: true, name, item });
    }

    const items = {};
    for (const [key, value] of Object.entries(store)) {
      items[key] = sanitizeShadowDetailsEntry(value);
    }

    return res.json({ ok: true, items });
  } catch (e) {
    console.error('[public:shadow-details] error', e);
    return res.status(500).json({ error: 'internal' });
  }
});

router.post('/api/admin/shadow-details', requireAdmin, (req, res) => {
  res.set('Cache-Control', 'no-store');

  try {
    const name = String(req.body?.name || '').trim();
    if (!name) {
      return res.status(400).json({ error: 'Missing shadow name' });
    }

    const store = readShadowDetailsStore();
    store[name] = sanitizeShadowDetailsEntry(req.body?.details || req.body || {});
    setGlobal(SHADOW_DETAILS_KEY, store);

    return res.json({ ok: true, name, item: store[name] });
  } catch (e) {
    console.error('[admin:shadow-details] error', e);
    return res.status(500).json({ error: 'internal' });
  }
});
// #endregion

// =====================================
// Gems (Global Config + Per-User Loadout)
// #region =====================================
const GEMS_CONFIG_KEY = 'gemsConfig:v1';
// #endregion

// =====================================
// Gem Constants
// #region =====================================
const GEMS_COLORS = ['red', 'blue', 'green', 'orange', 'purple'];

const GEMS_STATS = {
  red:    ['additional_attack', 'attack_pct', 'healing_given_inc'],
  blue:   ['additional_hp', 'hp_pct', 'healing_received_inc'],
  green:  ['defense_pct', 'additional_defense', 'damage_reduction'],
  orange: ['precision', 'crit_dmg', 'defense_pen'],
  purple: ['speed', 'additional_mp', 'mp_reduction']
};

const GEMS_R56_ALLOWED = {
  red:    ['additional_attack', 'attack_pct'],
  blue:   ['additional_hp', 'hp_pct'],
  green:  ['defense_pct', 'additional_defense', 'damage_reduction'],
  orange: ['precision', 'crit_dmg', 'defense_pen'],
  purple: ['speed', 'additional_mp', 'mp_reduction']
};

const GEM_LETTERS = ['A', 'B', 'C', 'D'];

// Default units (admin can override per stat):
// pct = display as %, flat = plain number
const DEFAULT_STAT_UNITS = {
  additional_attack: 'flat',
  attack_pct: 'pct',
  healing_given_inc: 'pct',

  additional_hp: 'flat',
  hp_pct: 'pct',
  healing_received_inc: 'pct',

  defense_pct: 'pct',
  additional_defense: 'flat',
  damage_reduction: 'pct',

  precision: 'flat',
  crit_dmg: 'flat',
  defense_pen: 'pct',

  speed: 'flat',
  additional_mp: 'flat',
  mp_reduction: 'flat'
};

function defaultEmptyValues() {
  const out = {};
  for (const color of GEMS_COLORS) {
    out[color] = {};
    for (const stat of (GEMS_STATS[color] || [])) {
      out[color][stat] = {
        1: 0, 2: 0, 3: 0, 4: 0,
        5: { A: 0, B: 0, C: 0, D: 0 },
        6: { A: 0, B: 0, C: 0, D: 0 }
      };
    }
  }
  return out;
}

const DEFAULT_GEMS_PAGES = [
  { key: 'page1', label: 'Page 1', perColor: 8 },
  { key: 'page2', label: 'Page 2', perColor: 4 }
];

const DEFAULT_MAX_GEM = 12; // used when Recommended has only 1 gem -> shows x{maxGem}

function sanitizePageKey(v) {
  const key = String(v || '').trim().toLowerCase();
  if (!/^[a-z0-9_]{1,24}$/.test(key)) return '';
  return key;
}

function sanitizePagesList(pages) {
  const src = Array.isArray(pages) ? pages : [];
  const out = [];
  const seen = new Set();

  for (const p of src) {
    if (!p || typeof p !== 'object') continue;
    const key = sanitizePageKey(p.key);
    if (!key || seen.has(key)) continue;

    const label = String(p.label || '').trim().slice(0, 32) || key.toUpperCase();
    const perColor = clampInt(p.perColor ?? p.slotsPerColor ?? p.maxPerColor ?? 0, 0, 40, 0);

    out.push({ key, label, perColor });
    seen.add(key);
  }

  return out.length ? out : JSON.parse(JSON.stringify(DEFAULT_GEMS_PAGES));
}

function defaultRecommendedBuckets(pages) {
  return Object.fromEntries(pages.map(p => [p.key, Object.fromEntries(GEMS_COLORS.map(c => [c, []]))]));
}

const DEFAULT_GEMS_CONFIG = {
  // pages + limits
  pages: JSON.parse(JSON.stringify(DEFAULT_GEMS_PAGES)),
  maxGem: DEFAULT_MAX_GEM,

  // All image placeholders you mentioned:
  assets: {
    // 15 stat icons (one per stat key)
    statIcons: Object.fromEntries(Object.keys(DEFAULT_STAT_UNITS).map(k => [k, ""])),
    // 4 letter icons
    letterIcons: { A: "", B: "", C: "", D: "" },
    // 6 images per color gem (rank 1..6)
    gemRankImages: Object.fromEntries(GEMS_COLORS.map(c => [c, { 1:"",2:"",3:"",4:"",5:"",6:"" }])),
    // Page icons (dynamic by page key)
    pageIcons: Object.fromEntries(DEFAULT_GEMS_PAGES.map(p => [p.key, ""])),
    // (optional) color icons (small icon next to color name)
    colorIcons: Object.fromEntries(GEMS_COLORS.map(c => [c, ""]))
  },

  // Units toggle per stat: "pct" | "flat"
  units: { ...DEFAULT_STAT_UNITS },

  // Stat values per color/stat/rank/letter
  values: defaultEmptyValues(),

  // Recommended template (everyone sees same)
  recommended: defaultRecommendedBuckets(DEFAULT_GEMS_PAGES)
};

function isPlainObject(x) {
  return !!x && typeof x === 'object' && !Array.isArray(x);
}

function numAny(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

// NEW: clamp integer helper
function clampInt(v, min, max, fallback = min) {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function sanitizeSlot(slot, maxGemDefault = DEFAULT_MAX_GEM) {
  const color = String(slot?.color || '').trim().toLowerCase();
  const rank = Math.max(0, Math.min(6, parseInt(slot?.rank ?? 0, 10) || 0));
  const letter = String(slot?.letter || 'A').trim().toUpperCase();

  const safeColor = GEMS_COLORS.includes(color) ? color : 'red';
  const allowedStats = (rank >= 5) ? (GEMS_R56_ALLOWED[safeColor] || []) : (GEMS_STATS[safeColor] || []);
  const stat = String(slot?.stat || '').trim();

  // keep count for recommended (xN)
  const count = clampInt(slot?.count ?? maxGemDefault, 1, 999, maxGemDefault);

  return {
    color: safeColor,
    stat: allowedStats.includes(stat) ? stat : "",
    rank,
    letter: (rank >= 5 && GEM_LETTERS.includes(letter)) ? letter : null,
    count
  };
}

function sanitizeGemsConfig(input) {
  try {
    const raw = isPlainObject(input) ? input : {};
    const cfg = JSON.parse(JSON.stringify(DEFAULT_GEMS_CONFIG));

    // pages + limits
    cfg.pages = sanitizePagesList(raw.pages ?? cfg.pages);
    cfg.maxGem = clampInt(raw.maxGem ?? raw.max_gem ?? raw.maxGemCount ?? cfg.maxGem ?? DEFAULT_MAX_GEM, 1, 999, cfg.maxGem ?? DEFAULT_MAX_GEM);

    // reset dynamic buckets based on pages
    cfg.assets.pageIcons = Object.fromEntries(cfg.pages.map(p => [p.key, ""]));
    cfg.recommended = defaultRecommendedBuckets(cfg.pages);

    // assets
    if (isPlainObject(raw.assets)) {
      const a = raw.assets;

      if (isPlainObject(a.statIcons)) {
        for (const k of Object.keys(cfg.assets.statIcons)) cfg.assets.statIcons[k] = String(a.statIcons[k] || '').trim();
      }

      if (isPlainObject(a.letterIcons)) {
        for (const L of GEM_LETTERS) cfg.assets.letterIcons[L] = String(a.letterIcons[L] || '').trim();
      }

      if (isPlainObject(a.gemRankImages)) {
        for (const c of GEMS_COLORS) {
          const block = a.gemRankImages[c];
          if (!isPlainObject(block)) continue;
          for (let r = 1; r <= 6; r++) cfg.assets.gemRankImages[c][r] = String(block[r] || '').trim();
        }
      }

      // page icons (dynamic)
      if (isPlainObject(a.pageIcons)) {
        for (const p of cfg.pages) cfg.assets.pageIcons[p.key] = String(a.pageIcons[p.key] || '').trim();
      }

      if (isPlainObject(a.colorIcons)) {
        for (const c of GEMS_COLORS) cfg.assets.colorIcons[c] = String(a.colorIcons[c] || '').trim();
      }
    }

    // units
    if (isPlainObject(raw.units)) {
      for (const k of Object.keys(cfg.units)) {
        const v = String(raw.units[k] || '').trim().toLowerCase();
        cfg.units[k] = (v === 'pct' || v === 'flat') ? v : cfg.units[k];
      }
    }

    // values
    if (isPlainObject(raw.values)) {
      for (const c of GEMS_COLORS) {
        for (const stat of (GEMS_STATS[c] || [])) {
          const src = raw.values?.[c]?.[stat];
          if (!isPlainObject(src)) continue;

          for (const r of [1, 2, 3, 4]) cfg.values[c][stat][r] = numAny(src[r], cfg.values[c][stat][r]);
          for (const r of [5, 6]) {
            const block = src[r];
            if (!isPlainObject(block)) continue;
            for (const L of GEM_LETTERS) cfg.values[c][stat][r][L] = numAny(block[L], cfg.values[c][stat][r][L]);
          }
        }
      }
    }

    // recommended
    if (isPlainObject(raw.recommended)) {
      const templateKey = cfg.pages[0]?.key || 'page1';
      const pageKeys = Object.keys(raw.recommended || {});

      for (const c of GEMS_COLORS) {
        const mergedRaw = [];
        for (const pk of pageKeys) {
          const p = raw.recommended[pk];
          if (!isPlainObject(p)) continue;
          const arr = Array.isArray(p[c]) ? p[c] : [];
          mergedRaw.push(...arr);
        }

        cfg.recommended[templateKey][c] = mergedRaw
          .map(x => sanitizeSlot(x, cfg.maxGem))
          .filter(s => s.rank >= 1 && s.stat)
          .slice(0, 3);
      }
    }

    return cfg;
  } catch (_) {
    return JSON.parse(JSON.stringify(DEFAULT_GEMS_CONFIG));
  }
}

// ---- API: get gems config (public for everyone)
// Returns config object directly (frontend friendly)
router.get('/api/public/gems-config', (req, res) => {
  try {
    const raw = getGlobal(GEMS_CONFIG_KEY);
    const cfg = sanitizeGemsConfig(raw || DEFAULT_GEMS_CONFIG);
    return res.json(cfg);
  } catch (e) {
    console.error('[public:gems-config] error', e);
    return res.status(500).json({ error: 'internal' });
  }
});

// ---- API: save gems config (admin only)
// Body: { config: {...} }
router.post('/api/admin/gems-config', requireAdmin, (req, res) => {
  try {
    const incoming =
      (req.body?.config && typeof req.body.config === 'object' && !Array.isArray(req.body.config))
        ? req.body.config
        : req.body;

    if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) {
      return res.status(400).json({ error: 'Invalid config (must be an object)' });
    }

    const cfg = sanitizeGemsConfig(incoming);
    setGlobal(GEMS_CONFIG_KEY, cfg);

    return res.json({ ok: true, config: cfg });
  } catch (e) {
    console.error('[admin:gems-config] error', e);
    return res.status(500).json({ error: 'internal' });
  }
});
// #endregion

// =====================================
// Gems Loadout (Per-User)
// #region =====================================
// GET -> returns { gemsLoadout: {...} }
// POST -> accepts { gemsLoadout: {...} }
router.get('/api/gems-loadout', requireAuth, (req, res) => {
  try {
    const lo = getCollection(req.user.id, 'gemsLoadout') || {};
    return res.json({ gemsLoadout: lo });
  } catch (e) {
    console.error('[get:gems-loadout] error', e);
    return res.status(500).json({ error: 'internal' });
  }
});

router.post('/api/gems-loadout', requireAuth, (req, res) => {
  try {
    const lo = req.body?.gemsLoadout;

    // accept object or empty
    if (typeof lo !== 'undefined' && (lo === null || typeof lo !== 'object' || Array.isArray(lo))) {
      return res.status(400).json({ error: 'Invalid gemsLoadout (must be an object)' });
    }

    setCollection(req.user.id, 'gemsLoadout', lo || {});
    return res.json({ ok: true });
  } catch (e) {
    console.error('[post:gems-loadout] error', e);
    return res.status(500).json({ error: 'internal' });
  }
});

// ===============================
// ORACLE (Browser-only OCR)
// Server does NOT accept images.
// It only saves/returns OCR results from the browser.
// ===============================

// NOTE:
// Remove this helper if _s already exists earlier in api.js
// function _s(x) { return String(x ?? '').trim(); }

// RAM storage (na start)
let __oracleLatest = null;
const ORACLE_CONFIG_KEY = 'oracleConfig:v1';

function normalizeOracleConfig(raw) {
  return (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};
}

function isNonEmptyPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length > 0;
}

function loadOracleConfig() {
  const fromDb = getGlobal(ORACLE_CONFIG_KEY);
  if (isNonEmptyPlainObject(fromDb)) {
    return normalizeOracleConfig(fromDb);
  }

  return {};
}

// GET /api/public/oracle
router.get('/api/public/oracle', (req, res) => {
  res.set('Cache-Control', 'no-store');

  try {
    return res.json({
      ok: true,
      config: loadOracleConfig()
    });
  } catch (e) {
    console.error('[public:oracle] error', e);
    return res.status(500).json({ ok: false, error: 'internal' });
  }
});

// GET /api/oracle/health
router.get('/api/oracle/health', requireAdmin, (req, res) => {
  res.set('Cache-Control', 'no-store');
  return res.json({ ok: true, ts: Date.now(), mode: 'browser-only' });
});

// POST /api/oracle/submit
// body: { result: {...}, text?: "..." }
router.post(
  '/api/oracle/submit',
  requireAdmin,
  require('express').json({ limit: '1mb' }), // JSON only, no images
  (req, res) => {
    res.set('Cache-Control', 'no-store');

    try {
      const body = req.body || {};
      const result = body.result ?? null;
      const text = body.text ?? null;

      if (!result && !_s(text)) {
        return res.status(400).json({ ok: false, error: 'Missing result/text' });
      }

      __oracleLatest = {
        ts: Date.now(),
        by: req.user?.id ?? null,
        result: result ?? null,
        text: _s(text) || null
      };

      return res.json({ ok: true, saved: true, ts: __oracleLatest.ts });
    } catch (e) {
      console.error('[oracle:submit] error', e);
      return res.status(500).json({ ok: false, error: 'internal' });
    }
  }
);

// GET /api/oracle/latest
router.get('/api/oracle/latest', requireAdmin, (req, res) => {
  res.set('Cache-Control', 'no-store');
  return res.json({ ok: true, latest: __oracleLatest });
});

// POST /api/oracle/reset
router.post(
  '/api/oracle/reset',
  requireAdmin,
  require('express').json({ limit: '64kb' }),
  (req, res) => {
    res.set('Cache-Control', 'no-store');
    __oracleLatest = null;
    return res.json({ ok: true, reset: true });
  }
);

// =====================================
// GLOBAL Admin Features flags
// - GET  /api/admin/features        -> { flags }
// - POST /api/admin/features        -> { key, enabled } OR { flags }  (admin only)
// =====================================
const FEATURES_KEY = 'admin_features:v1';

// if you already have coerceBool in api.js, remove this helper
function _coerceBool(v, fallback = false) {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v === 1;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    if (s === '1' || s === 'true' || s === 'yes' || s === 'on') return true;
    if (s === '0' || s === 'false' || s === 'no' || s === 'off') return false;
  }
  return fallback;
}

function loadFeatureFlags() {
  const raw = getGlobal(FEATURES_KEY);
  const flags = (raw && typeof raw === 'object') ? raw : {};

  // normalize to real booleans
  for (const k of Object.keys(flags)) {
    flags[k] = _coerceBool(flags[k], true);
  }

  return flags;
}

function saveFeatureFlags(nextFlags) {
  const cur = loadFeatureFlags();
  const merged = { ...cur, ...(nextFlags || {}) };

  // store as 1/0 for consistency
  const toStore = {};
  for (const [k, v] of Object.entries(merged)) {
    toStore[k] = _coerceBool(v, true) ? 1 : 0;
  }

  setGlobal(FEATURES_KEY, toStore);
  return loadFeatureFlags();
}

// public read
router.get('/api/admin/features', (req, res) => {
  res.set('Cache-Control', 'no-store');
  return res.json({ flags: loadFeatureFlags() });
});

// admin write
router.post('/api/admin/features', requireAdmin, (req, res) => {
  res.set('Cache-Control', 'no-store');

  let next = {};

  if (req.body && typeof req.body === 'object') {
    if (typeof req.body.key === 'string') {
      const key = String(req.body.key).trim();
      if (key) next[key] = _coerceBool(req.body.enabled, true);
    } else if (req.body.flags && typeof req.body.flags === 'object') {
      next = { ...req.body.flags };
    } else {
      next = { ...req.body };
      delete next.key;
      delete next.enabled;
    }
  }

  const flags = saveFeatureFlags(next);
  return res.json({ ok: true, flags });
});

// #endregion

// =====================================
// Active Codes API (Manual + Auto DB Storage)
// #region =====================================
const ACTIVE_CODES_MANUAL_KEY = 'activeCodes:manual:v1';
const ACTIVE_CODES_AUTO_KEY = 'activeCodes:auto:v1';

const ACTIVE_CODE_TZ_MAP = {
  'utc+0': 0,
  'utc': 0,
  'kst': 9 * 60,
  'japan': 9 * 60,
  'jst': 9 * 60,
  'pdt': -7 * 60,
  'pst': -8 * 60
};

function _coerceActiveCodeTimezone(v) {
  const key = String(v || '').trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(ACTIVE_CODE_TZ_MAP, key) ? key : 'utc+0';
}

function _parseLocalDateTimeByZone(dateStr, timeStr, zoneKey) {
  const d = String(dateStr || '').trim();
  const t = String(timeStr || '').trim();
  if (!d || !t) return null;

  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const hm = t.match(/^(\d{1,2}):(\d{2})$/);
  if (!m || !hm) return null;

  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const hour = Number(hm[1]);
  const minute = Number(hm[2]);

  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day) ||
    !Number.isFinite(hour) ||
    !Number.isFinite(minute)
  ) {
    return null;
  }

  const offsetMin = ACTIVE_CODE_TZ_MAP[_coerceActiveCodeTimezone(zoneKey)] ?? 0;
  return Date.UTC(year, month - 1, day, hour, minute, 0, 0) - offsetMin * 60 * 1000;
}

function _normalizeActiveCodeItem(item = {}, idx = 0) {
  const code = String(item.code || '').trim().toUpperCase();
  const reward = String(item.reward || '').trim();
  const source = String(item.source || '').trim();
  const note = String(item.note || '').trim();
  const timezone = _coerceActiveCodeTimezone(item.timezone);
  const expiresDate = String(item.expiresDate || '').trim();
  const expiresTime = String(item.expiresTime || '').trim();
  const enabled = item.enabled !== false;
  const sortOrder = Number.isFinite(Number(item.sortOrder)) ? Number(item.sortOrder) : idx;

  if (!code) return null;

  let expiresAtMs = Number(item.expiresAtMs);
  if (!Number.isFinite(expiresAtMs)) {
    expiresAtMs = _parseLocalDateTimeByZone(expiresDate, expiresTime, timezone);
  }

  return {
    id: String(item.id || `code-${Date.now()}-${idx}`),
    code,
    reward,
    source,
    note,
    timezone,
    expiresDate,
    expiresTime,
    expiresAtMs: Number.isFinite(expiresAtMs) ? expiresAtMs : null,
    enabled,
    sortOrder,
    createdAt: String(item.createdAt || new Date().toISOString()),
    updatedAt: new Date().toISOString(),
    postSlug: String(item.postSlug || '').trim(),
    publishedAt: item.publishedAt || null,
    sourceUniqueKey: String(item.sourceUniqueKey || '').trim()
  };
}

function _loadActiveCodesStoreByKey(key) {
  const raw = getGlobal(key);
  const items = Array.isArray(raw?.items) ? raw.items : [];

  return {
    items: items
      .map((x, i) => _normalizeActiveCodeItem(x, i))
      .filter(Boolean)
      .sort((a, b) => {
        const aa = Number.isFinite(a.sortOrder) ? a.sortOrder : 0;
        const bb = Number.isFinite(b.sortOrder) ? b.sortOrder : 0;
        return aa - bb;
      })
  };
}

function _saveActiveCodesStoreByKey(key, payload) {
  const items = Array.isArray(payload?.items) ? payload.items : [];

  const normalized = items
    .map((x, i) => _normalizeActiveCodeItem(x, i))
    .filter(Boolean)
    .sort((a, b) => {
      const aa = Number.isFinite(a.sortOrder) ? a.sortOrder : 0;
      const bb = Number.isFinite(b.sortOrder) ? b.sortOrder : 0;
      return aa - bb;
    });

  const out = { items: normalized };
  setGlobal(key, out);
  return _loadActiveCodesStoreByKey(key);
}

function _loadManualActiveCodesStore() {
  return _loadActiveCodesStoreByKey(ACTIVE_CODES_MANUAL_KEY);
}

function _saveManualActiveCodesStore(payload) {
  return _saveActiveCodesStoreByKey(ACTIVE_CODES_MANUAL_KEY, payload);
}

function _loadAutoActiveCodesStore() {
  return _loadActiveCodesStoreByKey(ACTIVE_CODES_AUTO_KEY);
}

function _saveAutoActiveCodesStore(payload) {
  return _saveActiveCodesStoreByKey(ACTIVE_CODES_AUTO_KEY, payload);
}

function _getActiveCodeExpiryYear(sourcePost) {
  const publishedAt = sourcePost?.publishedAt;
  if (publishedAt) {
    const d = new Date(publishedAt);
    if (!Number.isNaN(d.getTime())) return d.getUTCFullYear();
  }
  return new Date().getUTCFullYear();
}

function _parseActiveCodeExpiryMs(text, sourcePost = null) {
  const raw = String(text || '');
  const defaultYear = _getActiveCodeExpiryYear(sourcePost);

  let m = raw.match(
    /valid\s*until\s*:?\s*(\d{1,2})\/(\d{1,2}),\s*(\d{4}),\s*(\d{1,2}):(\d{2})\s*\(UTC\s*([+-])\s*(\d{1,2})(?::?(\d{2}))?\)/i
  );

  if (m) {
    const month = Number(m[1]);
    const day = Number(m[2]);
    const year = Number(m[3]);
    const hour = Number(m[4]);
    const minute = Number(m[5]);
    const sign = m[6] === '-' ? -1 : 1;
    const offHour = Number(m[7] || 0);
    const offMin = Number(m[8] || 0);

    const offsetMinutes = sign * (offHour * 60 + offMin);
    return Date.UTC(year, month - 1, day, hour, minute, 0, 0) - offsetMinutes * 60 * 1000;
  }

  m = raw.match(
    /valid\s*until\s*:?\s*(jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)\s+(\d{1,2})(?:st|nd|rd|th)?\s*,\s*(\d{4}),\s*(\d{1,2}):(\d{2})\s*\(UTC\s*([+-])\s*(\d{1,2})(?::?(\d{2}))?\)/i
  );

  if (m) {
    const monthMap = {
      jan: 1, january: 1,
      feb: 2, february: 2,
      mar: 3, march: 3,
      apr: 4, april: 4,
      may: 5,
      jun: 6, june: 6,
      jul: 7, july: 7,
      aug: 8, august: 8,
      sep: 9, sept: 9, september: 9,
      oct: 10, october: 10,
      nov: 11, november: 11,
      dec: 12, december: 12
    };

    const month = monthMap[String(m[1]).toLowerCase()];
    const day = Number(m[2]);
    const year = Number(m[3]);
    const hour = Number(m[4]);
    const minute = Number(m[5]);
    const sign = m[6] === '-' ? -1 : 1;
    const offHour = Number(m[7] || 0);
    const offMin = Number(m[8] || 0);

    const offsetMinutes = sign * (offHour * 60 + offMin);
    return Date.UTC(year, month - 1, day, hour, minute, 0, 0) - offsetMinutes * 60 * 1000;
  }

  m = raw.match(
    /valid\s*until\s*:?\s*(\d{1,2})\/(\d{1,2}),\s*(\d{4}),\s*(\d{1,2}):(\d{2})\s*\((?:UTC|GMT)\+?0\)/i
  );

  if (m) {
    return Date.UTC(
      Number(m[3]),
      Number(m[1]) - 1,
      Number(m[2]),
      Number(m[4]),
      Number(m[5]),
      0,
      0
    );
  }

  m = raw.match(
    /valid\s*until\s*:?\s*(jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)\s+(\d{1,2})(?:st|nd|rd|th)?\s*,\s*(\d{4}),\s*(\d{1,2}):(\d{2})\s*\((?:UTC|GMT)\+?0\)/i
  );

  if (m) {
    const monthMap = {
      jan: 1, january: 1,
      feb: 2, february: 2,
      mar: 3, march: 3,
      apr: 4, april: 4,
      may: 5,
      jun: 6, june: 6,
      jul: 7, july: 7,
      aug: 8, august: 8,
      sep: 9, sept: 9, september: 9,
      oct: 10, october: 10,
      nov: 11, november: 11,
      dec: 12, december: 12
    };

    return Date.UTC(
      Number(m[3]),
      monthMap[String(m[1]).toLowerCase()] - 1,
      Number(m[2]),
      Number(m[4]),
      Number(m[5]),
      0,
      0
    );
  }

  m = raw.match(
    /valid\s*until\s*:?\s*(\d{1,2})\/(\d{1,2})(?:\s*,\s*|\s+)(\d{1,2}):(\d{2})\s*\((UTC|GMT)\)/i
  );

  if (m) {
    return Date.UTC(
      defaultYear,
      Number(m[1]) - 1,
      Number(m[2]),
      Number(m[3]),
      Number(m[4]),
      0,
      0
    );
  }

  return null;
}

function _extractActiveCodesFromHtml(html, sourcePost) {
  const rawHtml = String(html || '');
  if (!rawHtml.trim()) return [];

  const allText = _stripHtml(rawHtml);
  const expiresAtMs = _parseActiveCodeExpiryMs(allText, sourcePost);

  const out = [];
  const tableMatches = rawHtml.match(/<table[\s\S]*?<\/table>/gi) || [];

  for (const tableHtml of tableMatches) {
    const rowMatches = tableHtml.match(/<tr[\s\S]*?<\/tr>/gi) || [];
    if (!rowMatches.length) continue;

    const headerText = _stripHtml(rowMatches[0]).toLowerCase();
    const looksLikeCodeTable =
      headerText.includes('redeem code') &&
      (
        headerText.includes('reward') ||
        headerText.includes('rewards') ||
        headerText.includes('reward info') ||
        headerText.includes('code info')
      );

    if (!looksLikeCodeTable) continue;

    for (let i = 1; i < rowMatches.length; i++) {
      const rowHtml = rowMatches[i];
      const cellMatches = rowHtml.match(/<td[\s\S]*?<\/td>/gi) || [];
      if (!cellMatches.length) continue;

      const code = _stripHtml(cellMatches[0]).replace(/\s+/g, ' ').trim();
      if (!code) continue;

      let reward = '';
      if (cellMatches[1]) {
        reward = _stripHtml(cellMatches[1])
          .split('\n')
          .map(s => String(s || '').replace(/^\-\s*/, '').trim())
          .filter(Boolean)
          .join(' • ');
      }

      const isActive = Number.isFinite(expiresAtMs) ? expiresAtMs > Date.now() : true;

      out.push({
        id: `auto-${code.toUpperCase()}`,
        code: code.toUpperCase(),
        reward,
        expiresAtMs,
        postSlug: sourcePost?.slug || '',
        publishedAt: sourcePost?.publishedAt || null,
        createdAt: sourcePost?.createdAt || null,
        source: 'Post',
        note: '',
        timezone: 'utc+0',
        expiresDate: '',
        expiresTime: '',
        enabled: true,
        sortOrder: 0,
        isActive,
        sourceUniqueKey: String(sourcePost?.sourceUniqueKey || '').trim()
      });
    }
  }

  return out.filter(x => x.isActive);
}

async function _scanActiveCodesFromPosts(rows = [], { fetchMissingDetails = true } = {}) {
  const inputRows = Array.isArray(rows) ? rows : [];
  const parsed = [];
  let scannedPosts = 0;
  let fetchedMissingDetails = 0;
  let fetchErrors = 0;

  for (const row of inputRows) {
    let html = String(row?.contentHtml || '').trim();
    let sourcePost = row;

    const isNetmarble = String(row?.source || '').toLowerCase() === 'netmarble';
    const needsDetail = !html && !String(row?.contentText || '').trim();

    if (fetchMissingDetails && isNetmarble && needsDetail && row?.menuSeq && row?.articleId) {
      try {
        const menuSeq = Number(row.menuSeq);
        const articleId = Number(row.articleId);

        const cat =
          NETMARBLE_POSTS_CFG.categories.find(c => Number(c.menuSeq) === Number(menuSeq)) ||
          {
            menuSeq,
            categoryKey: row.categoryKey,
            category: row.category
          };

        const d = await _fetchNmJson(_apiUrl(`/article/${articleId}`, {
          menuSeq,
          viewFlag: false
        }));

        const full = _normalizeNmDetail(d, row, cat);

        upsertPost(full);
        markPostDetailFetchedBySlug(row.slug, full);

        html = String(full?.contentHtml || '').trim();
        sourcePost = {
          ...row,
          ...full,
          sourceUniqueKey: String(row?.sourceUniqueKey || '').trim()
        };
        fetchedMissingDetails += 1;
      } catch (e) {
        fetchErrors += 1;
      }
    }

    if (!html) continue;

    scannedPosts += 1;
    parsed.push(..._extractActiveCodesFromHtml(html, sourcePost));
  }

  const dedup = new Map();
  for (const item of parsed) {
    const key = String(item.code || '').trim().toUpperCase();
    if (!key) continue;
    dedup.set(key, item);
  }

  const items = Array.from(dedup.values()).map((item, idx) => ({
    ...item,
    sortOrder: idx
  }));

  _saveAutoActiveCodesStore({ items });

  return {
    scannedPosts,
    fetchedMissingDetails,
    fetchErrors,
    foundCodes: items.length,
    items
  };
}

async function _rescanActiveCodesFromPosts(rows = [], { fetchMissingDetails = true } = {}) {
  const scan = await _scanActiveCodesFromPosts(rows, { fetchMissingDetails });
  const existing = _loadAutoActiveCodesStore().items;

  const sourceKeys = new Set(
    (Array.isArray(rows) ? rows : [])
      .map(row => String(row?.sourceUniqueKey || '').trim())
      .filter(Boolean)
  );

  const postSlugs = new Set(
    (Array.isArray(rows) ? rows : [])
      .map(row => String(row?.slug || '').trim())
      .filter(Boolean)
  );

  const kept = existing.filter(item => {
    const itemSourceKey = String(item?.sourceUniqueKey || '').trim();
    if (itemSourceKey && sourceKeys.has(itemSourceKey)) return false;

    const itemPostSlug = String(item?.postSlug || '').trim();
    if (!itemSourceKey && itemPostSlug && postSlugs.has(itemPostSlug)) return false;

    return true;
  });

  const items = [...kept, ...scan.items].map((item, idx) => ({
    ...item,
    sortOrder: idx
  }));

  _saveAutoActiveCodesStore({ items });

  return {
    ...scan,
    totalCodes: items.length
  };
}

async function _rescanActiveCodesFromPostsDb({ fetchMissingDetails = true } = {}) {
  const rows = db.prepare(`
    SELECT
      id,
      sourceUniqueKey,
      slug,
      source,
      menuSeq,
      articleId,
      category,
      categoryKey,
      title,
      author,
      publishedAt,
      createdAt,
      contentHtml,
      contentText
    FROM posts
    WHERE isPublished = 1
    ORDER BY datetime(COALESCE(publishedAt, createdAt)) DESC, id DESC
  `).all();

  const out = await _scanActiveCodesFromPosts(rows, { fetchMissingDetails });
  _saveAutoActiveCodesStore({ items: out.items });
  return out;
}

function _mergeActiveCodesForPublic() {
  const now = Date.now();
  const autoItems = _loadAutoActiveCodesStore().items;
  const manualItems = _loadManualActiveCodesStore().items;

  const merged = new Map();

  for (const item of autoItems) {
    const key = String(item.code || '').trim().toUpperCase();
    if (!key) continue;
    merged.set(key, item);
  }

  for (const item of manualItems) {
    const key = String(item.code || '').trim().toUpperCase();
    if (!key) continue;
    merged.set(key, item);
  }

  return Array.from(merged.values())
    .filter(x => x.enabled !== false)
    .filter(x => !Number.isFinite(x.expiresAtMs) || x.expiresAtMs > now)
    .sort((a, b) => {
      const aa = Number.isFinite(a.expiresAtMs) ? a.expiresAtMs : Number.MAX_SAFE_INTEGER;
      const bb = Number.isFinite(b.expiresAtMs) ? b.expiresAtMs : Number.MAX_SAFE_INTEGER;
      return aa - bb;
    });
}

// public
router.get('/api/active-codes', (req, res) => {
  res.set('Cache-Control', 'no-store');
  return res.json({ items: __publicActiveCodesV2() });
});

router.get('/api/admin/active-codes', requireAdmin, (req, res) => {
  res.set('Cache-Control', 'no-store');
  return res.json({ items: __adminVisibleActiveCodesV2() });
});

router.post(
  '/api/admin/active-codes',
  requireAdmin,
  require('express').json({ limit: '512kb' }),
  (req, res) => {
    res.set('Cache-Control', 'no-store');

    try {
      const submitted = Array.isArray(req.body?.items) ? req.body.items : [];
      const autoByKey = new Map(__loadAutoActiveCodesV2().map(item => [item.codeKey, item]));
      const manualItems = [];
      const overrideItems = [];

      submitted.forEach((raw, idx) => {
        const origin = String(raw?.origin || '').trim().toLowerCase();
        const matchCodeKey = __activeCodeKeyV2(raw?.matchCodeKey || raw?.autoCodeKey);

        if ((origin === 'auto' || origin === 'override' || matchCodeKey) && autoByKey.has(matchCodeKey)) {
          const override = __activeCodeOverrideIfNeededV2(
            { ...raw, sortOrder: idx, matchCodeKey },
            autoByKey.get(matchCodeKey)
          );
          if (override) overrideItems.push(override);
          return;
        }

        const manual = __normalizeActiveCodeItemV2(
          { ...raw, origin: 'manual', sourceType: 'manual', sortOrder: idx },
          idx,
          { origin: 'manual', sourceType: 'manual' }
        );
        if (manual) manualItems.push(manual);
      });

      __saveManualActiveCodesV2(manualItems);
      __saveActiveCodeOverridesV2(overrideItems);

      return res.json({ ok: true, items: __adminVisibleActiveCodesV2() });
    } catch (e) {
      console.error('[active-codes:save] error', e);
      return res.status(500).json({ ok: false, error: e?.message || 'active_codes_save_failed' });
    }
  }
);

router.post(
  '/api/admin/active-codes/rescan-full',
  requireAdmin,
  require('express').json({ limit: '64kb' }),
  async (req, res) => {
    res.set('Cache-Control', 'no-store');

    try {
      const out = await __rescanActiveCodesFromPostsDbV2({ fetchMissingDetails: true });

      return res.json({
        ok: true,
        scannedPosts: out.scannedPosts,
        newCodes: out.newCodes,
        updatedCodes: out.updatedCodes,
        removedCodes: out.removedCodes,
        ignoredCandidates: out.ignoredCandidates,
        fetchedMissingDetails: out.fetchedMissingDetails,
        fetchErrors: out.fetchErrors,
        foundCodes: out.foundCodes,
        items: __adminVisibleActiveCodesV2()
      });
    } catch (e) {
      console.error('[active-codes:rescan-full] error', e);
      return res.status(500).json({ ok: false, error: e?.message || 'active_codes_rescan_failed' });
    }
  }
);
// #endregion

// =====================================
// Active Codes V2 Helpers
// #region =====================================
const ACTIVE_CODES_OVERRIDE_KEY_V2 = 'activeCodes:overrides:v1';

const ACTIVE_CODE_TZ_MAP_V2 = {
  'utc+0': 0,
  'utc': 0,
  'gmt': 0,
  'kst': 9 * 60,
  'japan': 9 * 60,
  'jst': 9 * 60,
  'utc+9': 9 * 60,
  'gmt+9': 9 * 60,
  'pdt': -7 * 60,
  'utc-7': -7 * 60,
  'pst': -8 * 60,
  'utc-8': -8 * 60
};

const ACTIVE_CODE_MONTH_MAP_V2 = {
  january: 1, jan: 1,
  february: 2, feb: 2,
  march: 3, mar: 3,
  april: 4, apr: 4,
  may: 5,
  june: 6, jun: 6,
  july: 7, jul: 7,
  august: 8, aug: 8,
  september: 9, sep: 9, sept: 9,
  october: 10, oct: 10,
  november: 11, nov: 11,
  december: 12, dec: 12
};

const ACTIVE_CODE_STOP_WORDS_V2 = new Set([
  'REDEEM', 'REWARD', 'REWARDS', 'CODE', 'CODES', 'ACTIVE', 'TIME', 'TIMES',
  'DATE', 'DATES', 'UPDATE', 'UPDATED', 'UNTIL', 'AFTER', 'GOLD', 'CRYSTAL',
  'ESSENCE', 'TICKET', 'TICKETS', 'STONE', 'STONES', 'UTC', 'KST', 'JST',
  'ANNOUNCED', 'ANNOUNCE', 'NOTICE', 'EVENT', 'ITEM', 'ITEMS', 'BONUS', 'BE'
]);

const ACTIVE_CODES_ENABLE_FALLBACK_TEXT_SCAN = false;

const ACTIVE_CODE_COMMON_WORDS_V2 = new Set([
  'SUPPORT', 'CUSTOMER', 'MAILBOX', 'OPTIONS', 'OPTION', 'ACCOUNT', 'SETTINGS',
  'SETTING', 'HUNTER', 'HUNTERS', 'ENTRY', 'PAGE', 'PAGES', 'HELP', 'GUIDE',
  'REDEEMCODE', 'INGAME', 'NOTICE', 'UPDATED', 'ENTER', 'HOW', 'CLAIM',
  'COUPON', 'USE', 'USED', 'USING', 'WITH', 'YOUR', 'FROM', 'GAME'
]);

const ACTIVE_CODE_INSTRUCTION_HINTS_V2 = [
  'how to redeem code',
  'how to redeem codes',
  'enter redeem code',
  'redeem code entry page',
  'customer support',
  'account settings',
  'options',
  'mailbox'
];

function __activeCodeKeyV2(code) {
  return String(code || '').trim().toUpperCase();
}

function __decodeHtmlV2(text) {
  return String(text || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#039;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => {
      const code = Number(n);
      return Number.isFinite(code) ? String.fromCharCode(code) : '';
    });
}

function __activeCodeTextV2(text) {
  return __decodeHtmlV2(String(text || ''))
    .replace(/\r/g, '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function __activeCodeZoneV2(value) {
  const key = String(value || '').trim().toLowerCase();
  if (!key) return 'utc+0';
  if (Object.prototype.hasOwnProperty.call(ACTIVE_CODE_TZ_MAP_V2, key)) return key;

  const m = key.match(/^(?:utc|gmt)\s*([+-])\s*(\d{1,2})(?::?(\d{2}))?$/i);
  if (!m) return 'utc+0';

  const sign = m[1];
  const hh = Number(m[2] || 0);
  const mm = Number(m[3] || 0);
  return mm ? `utc${sign}${hh}:${String(mm).padStart(2, '0')}` : `utc${sign}${hh}`;
}

function __activeCodeOffsetV2(zone) {
  const key = __activeCodeZoneV2(zone);
  if (Object.prototype.hasOwnProperty.call(ACTIVE_CODE_TZ_MAP_V2, key)) {
    return ACTIVE_CODE_TZ_MAP_V2[key];
  }

  const m = key.match(/^utc([+-])(\d{1,2})(?::(\d{2}))?$/i);
  if (!m) return 0;
  const sign = m[1] === '-' ? -1 : 1;
  return sign * (Number(m[2] || 0) * 60 + Number(m[3] || 0));
}

function __activeCodeMsFromPartsV2(dateStr, timeStr, zone) {
  const dm = String(dateStr || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const tm = String(timeStr || '').trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!dm || !tm) return null;

  return Date.UTC(
    Number(dm[1]),
    Number(dm[2]) - 1,
    Number(dm[3]),
    Number(tm[1]),
    Number(tm[2]),
    Number(tm[3] || 0),
    0
  ) - __activeCodeOffsetV2(zone) * 60 * 1000;
}

function __activeCodeFiniteMsV2(value) {
  if (value === null || value === undefined || value === '') return null;
  const ms = Number(value);
  return Number.isFinite(ms) ? ms : null;
}

function __activeCodeDatePartsV2(ms, zone) {
  if (!Number.isFinite(ms)) return { expiresDate: '', expiresTime: '' };
  const d = new Date(ms + __activeCodeOffsetV2(zone) * 60 * 1000);
  if (Number.isNaN(d.getTime())) return { expiresDate: '', expiresTime: '' };

  return {
    expiresDate: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`,
    expiresTime: `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
  };
}

function __activeCodeDefaultYearV2(sourcePost) {
  const candidates = [sourcePost?.publishedAt, sourcePost?.updatedAt, sourcePost?.createdAt];
  for (const value of candidates) {
    const d = value ? new Date(value) : null;
    if (d && !Number.isNaN(d.getTime())) return d.getUTCFullYear();
  }
  return new Date().getUTCFullYear();
}

function __activeCodePublicDateMsV2(item) {
  if (Number.isFinite(item?.startsAtMs)) return item.startsAtMs;

  const first = new Date(item?.firstDetectedAt || item?.createdAt || item?.publishedAt || 0).getTime();
  if (Number.isFinite(first) && first > 0) return first;

  const created = new Date(item?.createdAt || item?.publishedAt || 0).getTime();
  if (Number.isFinite(created) && created > 0) return created;

  const pub = new Date(item?.publishedAt || 0).getTime();
  if (Number.isFinite(pub) && pub > 0) return pub;

  return 0;
}

function __normalizeActiveCodeItemV2(item = {}, idx = 0, defaults = {}) {
  const code = String(item.code || '').trim();
  const codeKey = __activeCodeKeyV2(item.code || item.codeKey);
  if (!code || !codeKey) return null;

  const timezone = __activeCodeZoneV2(item.timezone || defaults.timezone);
  let expiresAtMs = __activeCodeFiniteMsV2(item.expiresAtMs);
  if (!Number.isFinite(expiresAtMs)) {
    expiresAtMs = __activeCodeMsFromPartsV2(item.expiresDate, item.expiresTime, timezone);
  }

  let startsAtMs = __activeCodeFiniteMsV2(item.startsAtMs);
  const startsDateRaw = String(item.startsDate || '').trim();
  const startsTimeRaw = String(item.startsTime || '').trim();
  const startsOverridden = Number.isFinite(startsAtMs) || !!startsDateRaw || !!startsTimeRaw;
  if (!Number.isFinite(startsAtMs) && (startsDateRaw || startsTimeRaw)) {
    startsAtMs = __activeCodeMsFromPartsV2(startsDateRaw, startsTimeRaw, timezone);
  }
  if (!Number.isFinite(startsAtMs)) startsAtMs = null;

  const firstDetectedAt = String(item.firstDetectedAt || defaults.firstDetectedAt || item.createdAt || defaults.createdAt || '').trim();
  const lastSeenAt = String(item.lastSeenAt || defaults.lastSeenAt || '').trim();
  const createdAt = String(item.createdAt || defaults.createdAt || new Date().toISOString());
  const publishedAt = item.publishedAt || defaults.publishedAt || null;
  const publicActiveAtMs = __activeCodePublicDateMsV2({
    startsAtMs,
    firstDetectedAt: firstDetectedAt || createdAt,
    createdAt,
    publishedAt
  });

  const parts = __activeCodeDatePartsV2(expiresAtMs, timezone);
  const startParts = __activeCodeDatePartsV2(startsAtMs, timezone);
  const originRaw = String(item.origin || defaults.origin || '').trim().toLowerCase();
  const origin = originRaw === 'override' ? 'override' : originRaw === 'auto' ? 'auto' : 'manual';
  const deleted = item.deleted === true;
  const expiryEstimated = item.expiryEstimated === true;

  return {
    id: String(item.id || defaults.id || `code-v2-${Date.now()}-${idx}`),
    code,
    codeKey,
    reward: __activeCodeTextV2(item.reward),
    source: String(item.source || defaults.source || '').trim(),
    sourceType: String(item.sourceType || defaults.sourceType || (origin === 'manual' ? 'manual' : 'auto/netmarble')).trim(),
    note: String(item.note || '').trim(),
    timezone,
    expiresDate: String(item.expiresDate || parts.expiresDate || '').trim(),
    expiresTime: String(item.expiresTime || parts.expiresTime || '').trim(),
    expiresAtMs: Number.isFinite(expiresAtMs) ? expiresAtMs : null,
    expiresAtIso: Number.isFinite(expiresAtMs) ? new Date(expiresAtMs).toISOString() : null,
    startsDate: String(item.startsDate || startParts.expiresDate || '').trim(),
    startsTime: String(item.startsTime || startParts.expiresTime || '').trim(),
    startsAtMs: Number.isFinite(startsAtMs) ? startsAtMs : null,
    startsAtIso: Number.isFinite(startsAtMs) ? new Date(startsAtMs).toISOString() : null,
    startsOverridden,
    publicActiveAtMs: Number.isFinite(publicActiveAtMs) && publicActiveAtMs > 0 ? publicActiveAtMs : null,
    publicActiveAtIso: Number.isFinite(publicActiveAtMs) && publicActiveAtMs > 0 ? new Date(publicActiveAtMs).toISOString() : null,
    availabilityNote: String(item.availabilityNote || '').trim(),
    expiryEstimated,
    expiryEstimateReason: expiryEstimated ? String(item.expiryEstimateReason || '').trim() : '',
    expiryEstimateDays: expiryEstimated && Number.isFinite(Number(item.expiryEstimateDays))
      ? Number(item.expiryEstimateDays)
      : null,
    enabled: item.enabled !== false,
    deleted,
    sortOrder: Number.isFinite(Number(item.sortOrder)) ? Number(item.sortOrder) : idx,
    createdAt,
    firstDetectedAt: firstDetectedAt || createdAt,
    lastSeenAt: lastSeenAt || null,
    updatedAt: String(item.updatedAt || new Date().toISOString()),
    postSlug: String(item.postSlug || defaults.postSlug || '').trim(),
    postTitle: String(item.postTitle || defaults.postTitle || '').trim(),
    publishedAt,
    sourceUrl: String(item.sourceUrl || defaults.sourceUrl || '').trim(),
    sourceUniqueKey: String(item.sourceUniqueKey || defaults.sourceUniqueKey || '').trim(),
    lastSyncedAt: item.lastSyncedAt || defaults.lastSyncedAt || null,
    origin,
    matchCodeKey: __activeCodeKeyV2(item.matchCodeKey || item.autoCodeKey || defaults.matchCodeKey) || null
  };
}

function __activeCodeStatusV2(item, now = Date.now()) {
  if (item?.deleted === true) return 'deleted';
  if (item?.enabled === false) return 'disabled';
  if (Number.isFinite(item?.expiresAtMs) && item.expiresAtMs <= now) return 'expired';
  if (Number.isFinite(item?.startsAtMs) && item.startsAtMs > now) return 'scheduled';
  return 'active';
}

function __loadActiveCodeStoreV2(key, defaults = {}) {
  const raw = getGlobal(key);
  const items = Array.isArray(raw?.items) ? raw.items : [];
  return items
    .map((item, idx) => __normalizeActiveCodeItemV2(item, idx, defaults))
    .filter(Boolean)
    .sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return String(a.code || '').localeCompare(String(b.code || ''));
    });
}

function __saveActiveCodeStoreV2(key, items, defaults = {}) {
  const normalized = (Array.isArray(items) ? items : [])
    .map((item, idx) => __normalizeActiveCodeItemV2(item, idx, defaults))
    .filter(Boolean);
  setGlobal(key, { items: normalized });
  return __loadActiveCodeStoreV2(key, defaults);
}

function __loadManualActiveCodesV2() {
  return __loadActiveCodeStoreV2(ACTIVE_CODES_MANUAL_KEY, { origin: 'manual', sourceType: 'manual' });
}

function __saveManualActiveCodesV2(items) {
  return __saveActiveCodeStoreV2(ACTIVE_CODES_MANUAL_KEY, items, { origin: 'manual', sourceType: 'manual' });
}

function __loadAutoActiveCodesV2() {
  return __loadActiveCodeStoreV2(ACTIVE_CODES_AUTO_KEY, { origin: 'auto', sourceType: 'auto/netmarble' });
}

function __saveAutoActiveCodesV2(items) {
  return __saveActiveCodeStoreV2(ACTIVE_CODES_AUTO_KEY, items, { origin: 'auto', sourceType: 'auto/netmarble' });
}

function __loadActiveCodeOverridesV2() {
  return __loadActiveCodeStoreV2(ACTIVE_CODES_OVERRIDE_KEY_V2, { origin: 'override', sourceType: 'auto/netmarble' });
}

function __saveActiveCodeOverridesV2(items) {
  return __saveActiveCodeStoreV2(ACTIVE_CODES_OVERRIDE_KEY_V2, items, { origin: 'override', sourceType: 'auto/netmarble' });
}

function __activeCodeMetaV2(sourcePost = {}) {
  const nowIso = new Date().toISOString();
  const stablePostDate =
    sourcePost?.publishedAt ||
    sourcePost?.createdAt ||
    sourcePost?.updatedAt ||
    nowIso;

  return {
    source: 'Netmarble post',
    sourceType: 'auto/netmarble',
    postSlug: String(sourcePost?.slug || '').trim(),
    postTitle: String(sourcePost?.title || '').trim(),
    sourceUrl: String(sourcePost?.sourceUrl || '').trim(),
    publishedAt: sourcePost?.publishedAt || sourcePost?.createdAt || sourcePost?.updatedAt || null,
    createdAt: stablePostDate,
    firstDetectedAt: stablePostDate,
    lastSeenAt: nowIso,
    updatedAt: nowIso,
    sourceUniqueKey: String(sourcePost?.sourceUniqueKey || '').trim(),
    lastSyncedAt: sourcePost?.lastSyncedAt || nowIso
  };
}

function __activeCodeNormalizeLettersV2(value) {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z]/g, '');
}

function __activeCodeLooksInstructionalPostV2(sourcePost = {}, rawHtml = '') {
  const haystack = [
    sourcePost?.title,
    sourcePost?.excerpt,
    sourcePost?.contentText,
    _stripHtml(rawHtml)
  ].map(__activeCodeTextV2).join('\n').toLowerCase();

  if (!haystack) return false;
  return ACTIVE_CODE_INSTRUCTION_HINTS_V2.some(hint => haystack.includes(hint));
}

function __activeCodeLooksLikeTokenV2(token, { fromTable = false } = {}) {
  const raw = __activeCodeTextV2(token);
  if (!raw || raw.length < 5 || raw.length > 32) return false;
  if (/\s/.test(raw) || !/^[A-Za-z0-9_]+$/.test(raw)) return false;
  if (!/[A-Za-z]/.test(raw) || /^\d+$/.test(raw)) return false;

  const letters = __activeCodeNormalizeLettersV2(raw);
  if (letters && (ACTIVE_CODE_STOP_WORDS_V2.has(letters) || ACTIVE_CODE_COMMON_WORDS_V2.has(letters))) {
    return false;
  }

  const parts = raw
    .toUpperCase()
    .split('_')
    .filter(Boolean)
    .map(part => part.replace(/\d+/g, ''))
    .filter(Boolean);
  if (parts.length && parts.every(part => ACTIVE_CODE_STOP_WORDS_V2.has(part) || ACTIVE_CODE_COMMON_WORDS_V2.has(part))) {
    return false;
  }
  if (/^(?:UTC|KST|JST|GMT)\d*$/i.test(raw)) return false;

  if (!fromTable && !/[0-9_]/.test(raw) && !(/[A-Z]/.test(raw) && /[a-z]/.test(raw))) return false;

  return true;
}

function __activeCodeRewardFromCellV2(cellHtml) {
  return _stripHtml(cellHtml)
    .split(/\n+/)
    .map(s => __activeCodeTextV2(String(s || '').replace(/^[\-•]+\s*/, '')))
    .filter(Boolean)
    .join(' • ');
}

function __activeCodeParseTimingV2(text, sourcePost = null) {
  const raw = __activeCodeTextV2(text);
  const defaultYear = __activeCodeDefaultYearV2(sourcePost);
  let timezone = 'utc+0';
  let expiresAtMs = null;
  let expiresDate = '';
  let expiresTime = '';
  let startsAtMs = null;
  let availabilityNote = '';

  const expiryMatch = raw.match(
    /(?:valid\s*until\s*:?\s*|used\s+until\s*|until\s+)(\d{1,2})\s*\/\s*(\d{1,2})(?:\s*(?:,|\/)\s*(\d{4}))?\s+(\d{1,2})\s*:\s*(\d{2})\s*\(\s*([^)]+?)\s*\)/i
  );

  if (expiryMatch) {
    timezone = __activeCodeZoneV2(String(expiryMatch[6] || '').replace(/\s+/g, ''));
    expiresDate = `${String(Number(expiryMatch[3] || defaultYear)).padStart(4, '0')}-${String(Number(expiryMatch[1])).padStart(2, '0')}-${String(Number(expiryMatch[2])).padStart(2, '0')}`;
    expiresTime = `${String(Number(expiryMatch[4])).padStart(2, '0')}:${String(Number(expiryMatch[5])).padStart(2, '0')}`;
    expiresAtMs = __activeCodeMsFromPartsV2(expiresDate, expiresTime, timezone);
  }

  const startMatch = raw.match(/after\s+the\s+(\d{1,2})\s*\/\s*(\d{1,2})\s+update/i);
  if (startMatch) {
    const startDate = `${String(defaultYear).padStart(4, '0')}-${String(Number(startMatch[1])).padStart(2, '0')}-${String(Number(startMatch[2])).padStart(2, '0')}`;
    startsAtMs = __activeCodeMsFromPartsV2(startDate, '00:00', timezone);
    availabilityNote = `Available after ${Number(startMatch[1])}/${Number(startMatch[2])} update`;
  }

  return {
    expiresAtMs: Number.isFinite(expiresAtMs) ? expiresAtMs : null,
    expiresDate,
    expiresTime,
    timezone,
    startsAtMs: Number.isFinite(startsAtMs) ? startsAtMs : null,
    availabilityNote
  };
}

function __activeCodeNearestTimingV2(rawHtml, startIndex, endIndex, sourcePost) {
  const afterHtml = rawHtml.slice(endIndex, Math.min(rawHtml.length, endIndex + 1600));
  const beforeHtml = rawHtml.slice(Math.max(0, startIndex - 600), startIndex);
  const nextTableOffset = afterHtml.search(/<table\b/i);
  const scope = nextTableOffset >= 0 ? afterHtml.slice(0, nextTableOffset) : afterHtml;

  const chunks = [
    ..._stripHtml(scope).split(/\n+/),
    ..._stripHtml(beforeHtml).split(/\n+/).slice(-3)
  ].map(__activeCodeTextV2).filter(Boolean);

  for (const chunk of chunks) {
    const parsed = __activeCodeParseTimingV2(chunk, sourcePost);
    if (Number.isFinite(parsed.expiresAtMs) || Number.isFinite(parsed.startsAtMs)) return parsed;
  }

  return __activeCodeParseTimingV2(_stripHtml(scope), sourcePost);
}

function __extractActiveCodesV2(html, sourcePost) {
  const rawHtml = String(html || '');
  if (!rawHtml.trim()) return { items: [], ignoredCandidates: 0 };

  const dedup = new Map();
  const meta = __activeCodeMetaV2(sourcePost);
  let ignoredCandidates = 0;

  const tableRe = /<table[\s\S]*?<\/table>/gi;
  let match;
  while ((match = tableRe.exec(rawHtml))) {
    const tableHtml = match[0];
    const rows = tableHtml.match(/<tr[\s\S]*?<\/tr>/gi) || [];
    if (!rows.length) continue;

    const headers = (rows[0].match(/<(td|th)\b[\s\S]*?<\/\1>/gi) || [])
      .map(cell => __activeCodeTextV2(_stripHtml(cell)).toLowerCase());

    let codeIndex = -1;
    let rewardIndex = -1;
    headers.forEach((header, idx) => {
      if (codeIndex === -1 && header.includes('redeem') && header.includes('code')) codeIndex = idx;
      if (rewardIndex === -1 && header.includes('reward')) rewardIndex = idx;
    });

    const nearHeading = _stripHtml(rawHtml.slice(Math.max(0, match.index - 400), match.index)).toLowerCase();
    if (codeIndex < 0 || rewardIndex < 0 || !(nearHeading.includes('redeem code') || headers.some(h => h.includes('redeem code')))) {
      continue;
    }

    const timing = __activeCodeNearestTimingV2(rawHtml, match.index, match.index + tableHtml.length, sourcePost);

    for (let i = 1; i < rows.length; i++) {
      const cells = rows[i].match(/<(td|th)\b[\s\S]*?<\/\1>/gi) || [];
      const code = __activeCodeTextV2(_stripHtml(cells[codeIndex] || ''));
      if (!__activeCodeLooksLikeTokenV2(code, { fromTable: true })) {
        if (code) ignoredCandidates += 1;
        continue;
      }

      const item = __normalizeActiveCodeItemV2({
        id: `auto-${__activeCodeKeyV2(code)}`,
        code,
        reward: __activeCodeRewardFromCellV2(cells[rewardIndex] || ''),
        note: timing.availabilityNote || '',
        enabled: true,
        sortOrder: dedup.size,
        origin: 'auto',
        ...meta,
        ...timing
      }, dedup.size, { origin: 'auto', sourceType: 'auto/netmarble' });

      if (item) dedup.set(item.codeKey, item);
    }
  }

  const lines = __activeCodeTextV2(_stripHtml(rawHtml)).split(/\n+/).map(__activeCodeTextV2).filter(Boolean);
  for (let i = 0; i < lines.length; i++) {
    if (!/redeem\s*code/i.test(lines[i])) continue;

    const context = lines.slice(i, i + 5).join('\n');
    const timing = __activeCodeParseTimingV2(context, sourcePost);
    const candidates = context.match(/\b[A-Za-z0-9_]{5,32}\b/g) || [];

    for (const candidate of candidates) {
      if (!__activeCodeLooksLikeTokenV2(candidate, { fromTable: false })) {
        ignoredCandidates += 1;
        continue;
      }

      const item = __normalizeActiveCodeItemV2({
        id: `auto-${__activeCodeKeyV2(candidate)}`,
        code: candidate,
        reward: '',
        note: timing.availabilityNote || '',
        enabled: true,
        sortOrder: dedup.size,
        origin: 'auto',
        ...meta,
        ...timing
      }, dedup.size, { origin: 'auto', sourceType: 'auto/netmarble' });

      if (item && !dedup.has(item.codeKey)) dedup.set(item.codeKey, item);
    }
  }

  return { items: Array.from(dedup.values()), ignoredCandidates };
}

function __activeCodeRewardFromCellV2(cellHtml) {
  return _stripHtml(cellHtml)
    .split(/\n+/)
    .map(s => __activeCodeTextV2(String(s || '').replace(/^\s*(?:[-*•]+\s*)+/, '')))
    .filter(Boolean)
    .join('\n');
}

function __activeCodeTimingEmptyV2() {
  return {
    expiresAtMs: null,
    expiresDate: '',
    expiresTime: '',
    timezone: 'utc+0',
    startsAtMs: null,
    availabilityNote: '',
    expiryEstimated: false,
    expiryEstimateReason: '',
    expiryEstimateDays: null
  };
}

function __activeCodeTimingHasValueV2(timing) {
  return !!(
    timing &&
    (
      Number.isFinite(timing.expiresAtMs) ||
      Number.isFinite(timing.startsAtMs) ||
      String(timing.availabilityNote || '').trim() ||
      timing.expiryEstimated === true
    )
  );
}

function __activeCodeSourceDateMsV2(sourcePost = null) {
  const values = [
    sourcePost?.publishedAt,
    sourcePost?.createdAt,
    sourcePost?.updatedAt
  ];

  for (const value of values) {
    const ms = value ? new Date(value).getTime() : NaN;
    if (Number.isFinite(ms)) return ms;
  }

  return Date.now();
}

function __activeCodeEstimatedTimingV2(sourcePost = null, timezone = 'utc+0') {
  const baseMs = __activeCodeSourceDateMsV2(sourcePost);
  const expiresAtMs = baseMs + (14 * 24 * 60 * 60 * 1000);
  const safeZone = __activeCodeZoneV2(timezone || 'utc+0');
  const parts = __activeCodeDatePartsV2(expiresAtMs, safeZone);

  return {
    expiresAtMs,
    expiresDate: parts.expiresDate,
    expiresTime: parts.expiresTime,
    timezone: safeZone,
    startsAtMs: null,
    availabilityNote: '',
    expiryEstimated: true,
    expiryEstimateReason: 'No expiry found; set to source post date + 14 days',
    expiryEstimateDays: 14
  };
}

function __activeCodeContainsExpiryHintV2(text) {
  const raw = __activeCodeTextV2(text).toLowerCase();
  if (!raw) return false;
  return [
    'used until',
    'can be used until',
    'valid until',
    'redeem codes are valid until',
    'available until',
    'expiration date',
    'expiration',
    'expires',
    'be sure to enter until',
    'will not be usable after',
    'will not be able to be used after',
    'until '
  ].some(hint => raw.includes(hint)) || /\buntil\s+\d{1,2}\s*\/\s*\d{1,2}\b/i.test(raw);
}

function __activeCodeExtractTimezoneHintV2(text) {
  const raw = __activeCodeTextV2(text);
  if (!raw) return '';

  const match = raw.match(/\(\s*((?:UTC|GMT)\s*[+-]?\s*\d{0,2}(?::?\d{2})?|KST|JST)\s*\)/i);
  if (match?.[1]) return __activeCodeZoneV2(String(match[1]).replace(/\s+/g, ''));

  const bare = raw.match(/\b(?:UTC|GMT)\b|\bKST\b|\bJST\b/i);
  if (bare?.[0]) return __activeCodeZoneV2(String(bare[0]).replace(/\s+/g, ''));

  return '';
}

function __activeCodeResolveYearV2(month, day, explicitYear, sourcePost = null) {
  const parsedYear = Number(explicitYear);
  if (Number.isFinite(parsedYear) && parsedYear >= 2000) return parsedYear;

  let year = __activeCodeDefaultYearV2(sourcePost);
  const refCandidates = [sourcePost?.publishedAt, sourcePost?.updatedAt, sourcePost?.createdAt];

  for (const value of refCandidates) {
    const ref = value ? new Date(value) : null;
    if (!ref || Number.isNaN(ref.getTime())) continue;

    const candidateMs = Date.UTC(year, Number(month) - 1, Number(day), 0, 0, 0, 0);
    const refMs = Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), ref.getUTCDate(), 0, 0, 0, 0);
    const diffDays = Math.round((candidateMs - refMs) / (24 * 60 * 60 * 1000));
    if (diffDays < -120) year += 1;
    break;
  }

  return year;
}

function __activeCodeParseTimingV2(text, sourcePost = null, options = {}) {
  const raw = __activeCodeTextV2(text);
  const allowBareDate = !!options.allowBareDate;
  const fallbackTimezone = __activeCodeZoneV2(options.fallbackTimezone || 'utc+0');
  let timezone = fallbackTimezone;
  let expiresAtMs = null;
  let expiresDate = '';
  let expiresTime = '';
  let startsAtMs = null;
  let availabilityNote = '';

  if (raw && (allowBareDate || __activeCodeContainsExpiryHintV2(raw))) {
    const timezoneHint = __activeCodeExtractTimezoneHintV2(raw);
    if (timezoneHint) timezone = timezoneHint;

    const patterns = [
      {
        re: /(?:until\s+)?(\d{4})\s*\/\s*(\d{1,2})\s*\/\s*(\d{1,2})\s*(?:\(([A-Za-z]{3,9})\))?\s*(\d{1,2})\s*:\s*(\d{2})(?::(\d{2}))?/i,
        map: (m) => ({
          year: Number(m[1]),
          month: Number(m[2]),
          day: Number(m[3]),
          hour: Number(m[5]),
          minute: Number(m[6]),
          second: Number(m[7] || 0)
        })
      },
      {
        re: /([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?\s*,?\s*(\d{4})?\s*,?\s*(\d{1,2})\s*:\s*(\d{2})(?::(\d{2}))?/i,
        map: (m) => {
          const month = ACTIVE_CODE_MONTH_MAP_V2[String(m[1] || '').toLowerCase()];
          if (!month) return null;
          return {
            year: __activeCodeResolveYearV2(month, Number(m[2]), m[3], sourcePost),
            month,
            day: Number(m[2]),
            hour: Number(m[4]),
            minute: Number(m[5]),
            second: Number(m[6] || 0)
          };
        }
      },
      {
        re: /(\d{1,2})\s*\/\s*(\d{1,2})\s*,\s*(\d{4})\s*,\s*(\d{1,2})\s*:\s*(\d{2})(?::(\d{2}))?/i,
        map: (m) => ({
          year: Number(m[3]),
          month: Number(m[1]),
          day: Number(m[2]),
          hour: Number(m[4]),
          minute: Number(m[5]),
          second: Number(m[6] || 0)
        })
      },
      {
        re: /(\d{1,2})\s*\/\s*(\d{1,2})(?:\s*(?:,|\/)\s*(\d{4}))?\s*(?:\(([A-Za-z]{3,9})\))?\s*(\d{1,2})\s*:\s*(\d{2})(?::(\d{2}))?/i,
        map: (m) => ({
          year: __activeCodeResolveYearV2(Number(m[1]), Number(m[2]), m[3], sourcePost),
          month: Number(m[1]),
          day: Number(m[2]),
          hour: Number(m[5]),
          minute: Number(m[6]),
          second: Number(m[7] || 0)
        })
      }
    ];

    for (const pattern of patterns) {
      const match = raw.match(pattern.re);
      if (!match) continue;
      const parts = pattern.map(match);
      if (!parts || !Number.isFinite(parts.year) || !Number.isFinite(parts.month) || !Number.isFinite(parts.day)) continue;

      expiresDate = `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
      expiresTime = `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}${parts.second ? `:${String(parts.second).padStart(2, '0')}` : ''}`;
      expiresAtMs = __activeCodeMsFromPartsV2(expiresDate, expiresTime, timezone);
      if (Number.isFinite(expiresAtMs)) break;
    }
  }

  const startMatch = raw.match(/after\s+the\s+(\d{1,2})\s*\/\s*(\d{1,2})\s+update/i);
  if (startMatch) {
    const month = Number(startMatch[1]);
    const day = Number(startMatch[2]);
    const startYear = __activeCodeResolveYearV2(month, day, null, sourcePost);
    const startDate = `${String(startYear).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    startsAtMs = __activeCodeMsFromPartsV2(startDate, '00:00', timezone);
    availabilityNote = `Available after ${month}/${day} update`;
  }

  return {
    expiresAtMs: Number.isFinite(expiresAtMs) ? expiresAtMs : null,
    expiresDate,
    expiresTime,
    timezone,
    startsAtMs: Number.isFinite(startsAtMs) ? startsAtMs : null,
    availabilityNote
  };
}

function __activeCodeSliceAfterTableForTimingV2(rawHtml, endIndex) {
  const afterHtml = rawHtml.slice(endIndex, Math.min(rawHtml.length, endIndex + 6000));
  const stopPatterns = [
    /<table\b/i,
    /<h[1-6]\b/i
  ];

  let cutAt = afterHtml.length;
  stopPatterns.forEach((pattern) => {
    const idx = afterHtml.search(pattern);
    if (idx >= 0) cutAt = Math.min(cutAt, idx);
  });

  const scope = afterHtml.slice(0, cutAt);
  const lines = _stripHtml(scope).split(/\n+/).map(__activeCodeTextV2).filter(Boolean);
  const blocks = [];
  let totalChars = 0;

  for (const line of lines) {
    if (/^📌/.test(line)) break;
    blocks.push(line);
    totalChars += line.length;
    if (blocks.length >= 8 || totalChars >= 2200) break;
  }

  return blocks;
}

function __activeCodeFindTimingInBlocksV2(blocks = [], sourcePost = null, options = {}) {
  for (const block of blocks) {
    if (!__activeCodeContainsExpiryHintV2(block) && !options.allowBareDate) continue;
    const parsed = __activeCodeParseTimingV2(block, sourcePost, options);
    if (Number.isFinite(parsed.expiresAtMs)) return parsed;
  }
  return __activeCodeTimingEmptyV2();
}

function __activeCodeNearestTimingV2(rawHtml, startIndex, endIndex, sourcePost) {
  const afterBlocks = __activeCodeSliceAfterTableForTimingV2(rawHtml, endIndex);
  const afterTiming = __activeCodeFindTimingInBlocksV2(afterBlocks, sourcePost, { allowBareDate: false });
  if (__activeCodeTimingHasValueV2(afterTiming)) return afterTiming;

  const beforeHtml = rawHtml.slice(Math.max(0, startIndex - 1200), startIndex);
  const beforeBlocks = _stripHtml(beforeHtml)
    .split(/\n+/)
    .map(__activeCodeTextV2)
    .filter(Boolean)
    .slice(-5)
    .reverse();
  const beforeTiming = __activeCodeFindTimingInBlocksV2(beforeBlocks, sourcePost, { allowBareDate: false });
  if (__activeCodeTimingHasValueV2(beforeTiming)) return beforeTiming;

  return __activeCodeTimingEmptyV2();
}

function __activeCodeHeaderRoleV2(text) {
  const header = __activeCodeTextV2(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

  if (!header) return '';

  if (
    header.includes('expiration date') ||
    header.includes('expiry date') ||
    header === 'expires' ||
    header.includes(' expiration') ||
    header.startsWith('expiration') ||
    header.includes('valid until') ||
    header.includes('use until') ||
    header.includes('used until') ||
    header.includes('available until')
  ) {
    return 'expiry';
  }

  if (
    header === 'reward' ||
    header === 'rewards' ||
    header === 'code info' ||
    header.includes('code info') ||
    header.includes('reward info') ||
    header.includes('redeem code reward') ||
    header.includes('code reward') ||
    (header.includes('reward') && !header.includes('expiration'))
  ) {
    return 'reward';
  }

  if (header.includes('redeem') && header.includes('code') && !header.includes('reward')) {
    return 'code';
  }

  return '';
}

function __activeCodeCellSpanV2(cellHtml, attrName) {
  const openTag = String(cellHtml || '').match(/^<\w+\b([^>]*)>/i);
  if (!openTag) return 1;
  const attr = openTag[1].match(new RegExp(`${attrName}\\s*=\\s*["']?(\\d+)["']?`, 'i'));
  const value = Number(attr?.[1]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 1;
}

function __activeCodeExpandTableRowsV2(tableHtml) {
  const rowHtmlList = String(tableHtml || '').match(/<tr[\s\S]*?<\/tr>/gi) || [];
  const pending = new Map();
  const logicalRows = [];

  rowHtmlList.forEach((rowHtml) => {
    const logicalRow = [];
    const cells = rowHtml.match(/<(td|th)\b[\s\S]*?<\/\1>/gi) || [];
    let colIndex = 0;

    const consumePending = () => {
      while (pending.has(colIndex)) {
        const carry = pending.get(colIndex);
        logicalRow[colIndex] = { ...carry.cell, inherited: true };
        carry.remaining -= 1;
        if (carry.remaining <= 0) pending.delete(colIndex);
        else pending.set(colIndex, carry);
        colIndex += 1;
      }
    };

    consumePending();

    cells.forEach((cellHtml) => {
      consumePending();

      const rowspan = __activeCodeCellSpanV2(cellHtml, 'rowspan');
      const colspan = __activeCodeCellSpanV2(cellHtml, 'colspan');
      const cell = {
        html: String(cellHtml || ''),
        text: __activeCodeTextV2(_stripHtml(cellHtml)),
        rowspan,
        colspan,
        inherited: false
      };

      for (let offset = 0; offset < colspan; offset++) {
        logicalRow[colIndex + offset] = { ...cell, inherited: offset > 0 };
        if (rowspan > 1) {
          pending.set(colIndex + offset, {
            cell: { ...cell, inherited: true },
            remaining: rowspan - 1
          });
        }
      }

      colIndex += colspan;
    });

    consumePending();
    logicalRows.push(logicalRow);
  });

  return logicalRows;
}

function __extractActiveCodesV2(html, sourcePost) {
  const rawHtml = String(html || '');
  if (!rawHtml.trim()) return { items: [], ignoredCandidates: 0 };

  const dedup = new Map();
  const meta = __activeCodeMetaV2(sourcePost);
  let ignoredCandidates = 0;
  const isInstructionalPost = __activeCodeLooksInstructionalPostV2(sourcePost, rawHtml);

  const tableRe = /<table[\s\S]*?<\/table>/gi;
  let match;
  while ((match = tableRe.exec(rawHtml))) {
    const tableHtml = match[0];
    const logicalRows = __activeCodeExpandTableRowsV2(tableHtml);
    if (!logicalRows.length) continue;

    let headerRowIndex = -1;
    let codeIndex = -1;
    let rewardIndex = -1;
    let expiryIndex = -1;
    let expiryHeaderTimezone = 'utc+0';

    for (let rowIndex = 0; rowIndex < logicalRows.length; rowIndex++) {
      const row = logicalRows[rowIndex] || [];
      let nextCodeIndex = -1;
      let nextRewardIndex = -1;
      let nextExpiryIndex = -1;

      row.forEach((cell, idx) => {
        const role = __activeCodeHeaderRoleV2(cell?.text || '');
        if (role === 'reward' && nextRewardIndex === -1) nextRewardIndex = idx;
        else if (role === 'expiry' && nextExpiryIndex === -1) nextExpiryIndex = idx;
        else if (role === 'code' && nextCodeIndex === -1) nextCodeIndex = idx;
      });

      if (nextCodeIndex >= 0 && nextRewardIndex >= 0) {
        headerRowIndex = rowIndex;
        codeIndex = nextCodeIndex;
        rewardIndex = nextRewardIndex;
        expiryIndex = nextExpiryIndex;
        if (nextExpiryIndex >= 0) {
          expiryHeaderTimezone = __activeCodeExtractTimezoneHintV2(row[nextExpiryIndex]?.text || row[nextExpiryIndex]?.html || '') || 'utc+0';
        }
        break;
      }
    }

    if (headerRowIndex < 0 || codeIndex < 0 || rewardIndex < 0) continue;

    const tableTiming = __activeCodeNearestTimingV2(rawHtml, match.index, match.index + tableHtml.length, sourcePost);

    for (let rowIndex = headerRowIndex + 1; rowIndex < logicalRows.length; rowIndex++) {
      const row = logicalRows[rowIndex] || [];
      const codeCell = row[codeIndex];
      const rewardCell = row[rewardIndex];
      const expiryCell = expiryIndex >= 0 ? row[expiryIndex] : null;
      if (!codeCell || !rewardCell) continue;

      const code = __activeCodeTextV2(codeCell.text || '');
      if (!__activeCodeLooksLikeTokenV2(code, { fromTable: true })) {
        if (code) ignoredCandidates += 1;
        continue;
      }

      const rowTiming = expiryCell
        ? __activeCodeParseTimingV2(
            expiryCell.text || _stripHtml(expiryCell.html || ''),
            sourcePost,
            { allowBareDate: true, fallbackTimezone: expiryHeaderTimezone }
          )
        : __activeCodeTimingEmptyV2();
      const timing = Number.isFinite(rowTiming.expiresAtMs)
        ? {
            ...rowTiming,
            expiryEstimated: false,
            expiryEstimateReason: '',
            expiryEstimateDays: null
          }
        : __activeCodeTimingHasValueV2(tableTiming)
          ? {
              ...tableTiming,
              expiryEstimated: false,
              expiryEstimateReason: '',
              expiryEstimateDays: null
            }
          : __activeCodeEstimatedTimingV2(sourcePost, expiryHeaderTimezone || 'utc+0');

      const item = __normalizeActiveCodeItemV2({
        id: `auto-${__activeCodeKeyV2(code)}`,
        code,
        reward: __activeCodeRewardFromCellV2(rewardCell.html || rewardCell.text || ''),
        note: timing.availabilityNote || '',
        enabled: true,
        sortOrder: dedup.size,
        origin: 'auto',
        ...meta,
        ...timing
      }, dedup.size, { origin: 'auto', sourceType: 'auto/netmarble' });

      if (item && !dedup.has(item.codeKey)) dedup.set(item.codeKey, item);
    }
  }

  if (ACTIVE_CODES_ENABLE_FALLBACK_TEXT_SCAN && !isInstructionalPost) {
    const lines = __activeCodeTextV2(_stripHtml(rawHtml)).split(/\n+/).map(__activeCodeTextV2).filter(Boolean);
    for (let i = 0; i < lines.length; i++) {
      if (!/redeem\s*code/i.test(lines[i])) continue;

      const context = lines.slice(i, i + 5).join('\n');
      const timing = __activeCodeParseTimingV2(context, sourcePost);
      const candidates = context.match(/\b[A-Za-z0-9_]{5,32}\b/g) || [];

      for (const candidate of candidates) {
        if (!__activeCodeLooksLikeTokenV2(candidate, { fromTable: false })) {
          ignoredCandidates += 1;
          continue;
        }

        const item = __normalizeActiveCodeItemV2({
          id: `auto-${__activeCodeKeyV2(candidate)}`,
          code: candidate,
          reward: '',
          note: timing.availabilityNote || '',
          enabled: true,
          sortOrder: dedup.size,
          origin: 'auto',
          ...meta,
          ...timing
        }, dedup.size, { origin: 'auto', sourceType: 'auto/netmarble' });

        if (item && !dedup.has(item.codeKey)) dedup.set(item.codeKey, item);
      }
    }
  }

  return { items: Array.from(dedup.values()), ignoredCandidates };
}

function __activeCodeComparableV2(item) {
  return JSON.stringify({
    code: item?.code || '',
    reward: item?.reward || '',
    expiresAtMs: Number.isFinite(item?.expiresAtMs) ? item.expiresAtMs : null,
    startsAtMs: Number.isFinite(item?.startsAtMs) ? item.startsAtMs : null,
    availabilityNote: item?.availabilityNote || '',
    expiryEstimated: item?.expiryEstimated === true,
    expiryEstimateReason: item?.expiryEstimateReason || '',
    expiryEstimateDays: Number.isFinite(item?.expiryEstimateDays) ? item.expiryEstimateDays : null,
    note: item?.note || '',
    enabled: item?.enabled !== false,
    deleted: item?.deleted === true,
    postSlug: item?.postSlug || '',
    postTitle: item?.postTitle || '',
    sourceUrl: item?.sourceUrl || '',
    timezone: item?.timezone || 'utc+0'
  });
}

function __activeCodeMergeScannedItemV2(existing, scanned, nowIso) {
  const stableCreatedAt = String(
    existing?.createdAt ||
    existing?.firstDetectedAt ||
    scanned?.createdAt ||
    scanned?.firstDetectedAt ||
    nowIso
  );
  const stableFirstDetectedAt = String(
    existing?.firstDetectedAt ||
    existing?.createdAt ||
    scanned?.firstDetectedAt ||
    scanned?.createdAt ||
    nowIso
  );

  const mergedCandidate = __normalizeActiveCodeItemV2({
    ...existing,
    ...scanned,
    createdAt: stableCreatedAt,
    firstDetectedAt: stableFirstDetectedAt,
    lastSeenAt: nowIso,
    updatedAt: existing?.updatedAt || scanned?.updatedAt || nowIso,
    sortOrder: Number.isFinite(Number(existing?.sortOrder)) ? Number(existing.sortOrder) : Number(scanned?.sortOrder || 0)
  }, 0, {
    origin: 'auto',
    sourceType: 'auto/netmarble'
  });

  const changed = !existing || (__activeCodeComparableV2(existing) !== __activeCodeComparableV2(mergedCandidate));
  return __normalizeActiveCodeItemV2({
    ...mergedCandidate,
    updatedAt: changed ? nowIso : (existing?.updatedAt || mergedCandidate.updatedAt || nowIso),
    lastSeenAt: nowIso,
    createdAt: stableCreatedAt,
    firstDetectedAt: stableFirstDetectedAt
  }, 0, {
    origin: 'auto',
    sourceType: 'auto/netmarble'
  });
}

async function __scanActiveCodesFromPostsV2(rows = [], { fetchMissingDetails = true } = {}) {
  const parsed = [];
  let scannedPosts = 0;
  let fetchedMissingDetails = 0;
  let fetchErrors = 0;
  let ignoredCandidates = 0;

  for (const row of Array.isArray(rows) ? rows : []) {
    let html = String(row?.contentHtml || '').trim();
    let sourcePost = row;
    const isNetmarble = String(row?.source || '').toLowerCase() === 'netmarble';
    const needsDetail = !html && !String(row?.contentText || '').trim();

    if (fetchMissingDetails && isNetmarble && needsDetail && row?.menuSeq && row?.articleId) {
      try {
        const menuSeq = Number(row.menuSeq);
        const articleId = Number(row.articleId);
        const cat =
          NETMARBLE_POSTS_CFG.categories.find(c => Number(c.menuSeq) === Number(menuSeq)) ||
          { menuSeq, categoryKey: row.categoryKey, category: row.category };

        const d = await _fetchNmJson(_apiUrl(`/article/${articleId}`, { menuSeq, viewFlag: false }));
        const full = _normalizeNmDetail(d, row, cat);
        upsertPost(full);
        markPostDetailFetchedBySlug(row.slug, full);

        html = String(full?.contentHtml || '').trim();
        sourcePost = { ...row, ...full, sourceUniqueKey: String(row?.sourceUniqueKey || '').trim() };
        fetchedMissingDetails += 1;
      } catch (_) {
        fetchErrors += 1;
      }
    }

    if (!html) continue;

    const extracted = __extractActiveCodesV2(html, sourcePost);
    scannedPosts += 1;
    ignoredCandidates += extracted.ignoredCandidates;
    parsed.push(...extracted.items);
  }

  const dedup = new Map();
  parsed.forEach(item => {
    if (!item?.codeKey) return;
    const existing = dedup.get(item.codeKey);
    if (!existing) {
      dedup.set(item.codeKey, item);
      return;
    }

    const a = new Date(existing?.publishedAt || existing?.createdAt || 0).getTime();
    const b = new Date(item?.publishedAt || item?.createdAt || 0).getTime();
    dedup.set(item.codeKey, b >= a ? item : existing);
  });

  return {
    scannedPosts,
    fetchedMissingDetails,
    fetchErrors,
    foundCodes: dedup.size,
    ignoredCandidates,
    items: Array.from(dedup.values()).map((item, idx) => ({ ...item, sortOrder: idx }))
  };
}

function __effectiveAutoCodesV2() {
  const autoItems = __loadAutoActiveCodesV2();
  const overrideMap = new Map(__loadActiveCodeOverridesV2().map(item => [String(item.matchCodeKey || '').trim() || item.codeKey, item]));

  return autoItems.map((autoItem, idx) => {
    const override = overrideMap.get(autoItem.codeKey);
    if (override?.deleted === true) return null;

    const merged = override
      ? __normalizeActiveCodeItemV2({
          ...autoItem,
          code: override.code || autoItem.code,
          reward: override.reward,
          note: override.note,
          expiresAtMs: Number.isFinite(override.expiresAtMs) ? override.expiresAtMs : autoItem.expiresAtMs,
          expiresDate: override.expiresDate || autoItem.expiresDate,
          expiresTime: override.expiresTime || autoItem.expiresTime,
          timezone: override.timezone || autoItem.timezone,
          expiryEstimated: override.expiryEstimated === true ? true : autoItem.expiryEstimated === true,
          expiryEstimateReason: override.expiryEstimated === true ? override.expiryEstimateReason : autoItem.expiryEstimateReason,
          expiryEstimateDays: override.expiryEstimated === true ? override.expiryEstimateDays : autoItem.expiryEstimateDays,
          enabled: override.enabled,
          sortOrder: Number.isFinite(override.sortOrder) ? override.sortOrder : autoItem.sortOrder,
          startsAtMs: override.startsOverridden === true ? override.startsAtMs : autoItem.startsAtMs,
          startsDate: override.startsOverridden === true ? override.startsDate : autoItem.startsDate,
          startsTime: override.startsOverridden === true ? override.startsTime : autoItem.startsTime,
          startsOverridden: override.startsOverridden === true,
          availabilityNote: override.availabilityNote || autoItem.availabilityNote,
          origin: 'override'
        }, idx, { origin: 'override', sourceType: 'auto/netmarble', matchCodeKey: autoItem.codeKey })
      : __normalizeActiveCodeItemV2({ ...autoItem, origin: 'auto' }, idx, {
          origin: 'auto',
          sourceType: 'auto/netmarble',
          matchCodeKey: autoItem.codeKey
        });

    return {
      ...merged,
      matchCodeKey: autoItem.codeKey,
      autoCodeKey: autoItem.codeKey,
      rawAuto: autoItem
    };
  }).filter(Boolean);
}

function __adminVisibleActiveCodesV2() {
  const manual = __loadManualActiveCodesV2().filter(item => item.deleted !== true).map(item => ({
    ...item,
    origin: 'manual',
    badgeLabel: 'Manual',
    sourceType: 'manual'
  }));

  const auto = __effectiveAutoCodesV2().map(item => ({
    ...item,
    badgeLabel: item.origin === 'override' ? 'Edited override' : 'Auto from Netmarble',
    sourceType: 'auto/netmarble'
  }));

  return [...manual, ...auto].sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return String(a.code || '').localeCompare(String(b.code || ''));
  });
}

function __publicActiveCodesV2() {
  const now = Date.now();
  const merged = new Map();

  __effectiveAutoCodesV2().forEach(item => {
    if (item?.codeKey) merged.set(item.codeKey, item);
  });

  __loadManualActiveCodesV2().forEach(item => {
    if (item?.codeKey) merged.set(item.codeKey, item);
  });

  return Array.from(merged.values())
    .filter(item => __activeCodeStatusV2(item, now) === 'active')
    .sort((a, b) => {
      const firstA = __activeCodePublicDateMsV2(a);
      const firstB = __activeCodePublicDateMsV2(b);
      if (firstA !== firstB) return firstB - firstA;

      const createdA = new Date(a?.createdAt || a?.publishedAt || 0).getTime();
      const createdB = new Date(b?.createdAt || b?.publishedAt || 0).getTime();
      if (createdA !== createdB) return createdB - createdA;

      const pubA = new Date(a?.publishedAt || 0).getTime();
      const pubB = new Date(b?.publishedAt || 0).getTime();
      if (pubA !== pubB) return pubB - pubA;

      return String(a.code || '').localeCompare(String(b.code || ''));
    });
}

function __activeCodeOverrideIfNeededV2(submitted, baseAuto) {
  const override = __normalizeActiveCodeItemV2(submitted, 0, {
    origin: 'override',
    sourceType: 'auto/netmarble',
    matchCodeKey: baseAuto.codeKey,
    source: baseAuto.source,
    postSlug: baseAuto.postSlug,
    postTitle: baseAuto.postTitle,
    sourceUrl: baseAuto.sourceUrl,
    sourceUniqueKey: baseAuto.sourceUniqueKey,
    publishedAt: baseAuto.publishedAt,
    lastSyncedAt: baseAuto.lastSyncedAt
  });
  if (!override) return null;

  if (override.deleted === true) {
    return {
      ...override,
      origin: 'override',
      matchCodeKey: baseAuto.codeKey,
      sourceType: 'auto/netmarble',
      source: baseAuto.source,
      postSlug: baseAuto.postSlug,
      postTitle: baseAuto.postTitle,
      sourceUrl: baseAuto.sourceUrl,
      sourceUniqueKey: baseAuto.sourceUniqueKey,
      publishedAt: baseAuto.publishedAt,
      lastSyncedAt: baseAuto.lastSyncedAt
    };
  }

  const effective = __normalizeActiveCodeItemV2({
    ...baseAuto,
    code: override.code,
    reward: override.reward,
    note: override.note,
    expiresAtMs: override.expiresAtMs,
    expiresDate: override.expiresDate,
    expiresTime: override.expiresTime,
    timezone: override.timezone,
    expiryEstimated: override.expiryEstimated === true,
    expiryEstimateReason: override.expiryEstimated === true ? override.expiryEstimateReason : '',
    expiryEstimateDays: override.expiryEstimated === true ? override.expiryEstimateDays : null,
    enabled: override.enabled,
    sortOrder: override.sortOrder,
    startsAtMs: override.startsOverridden === true ? override.startsAtMs : baseAuto.startsAtMs,
    startsDate: override.startsOverridden === true ? override.startsDate : baseAuto.startsDate,
    startsTime: override.startsOverridden === true ? override.startsTime : baseAuto.startsTime,
    startsOverridden: override.startsOverridden === true,
    availabilityNote: override.availabilityNote
  }, 0, { origin: 'override', sourceType: 'auto/netmarble', matchCodeKey: baseAuto.codeKey });

  if (__activeCodeComparableV2(effective) === __activeCodeComparableV2(baseAuto)) return null;

  return {
    ...override,
    origin: 'override',
    matchCodeKey: baseAuto.codeKey,
    sourceType: 'auto/netmarble',
    source: baseAuto.source,
    postSlug: baseAuto.postSlug,
    postTitle: baseAuto.postTitle,
    sourceUrl: baseAuto.sourceUrl,
    sourceUniqueKey: baseAuto.sourceUniqueKey,
    publishedAt: baseAuto.publishedAt,
    lastSyncedAt: baseAuto.lastSyncedAt
  };
}

async function __rescanActiveCodesFromPostsV2(rows = [], { fetchMissingDetails = true } = {}) {
  const existing = __loadAutoActiveCodesV2();
  const before = new Map(existing.map(item => [item.codeKey, item]));
  const scan = await __scanActiveCodesFromPostsV2(rows, { fetchMissingDetails });
  const nowIso = new Date().toISOString();

  const sourceKeys = new Set((Array.isArray(rows) ? rows : []).map(row => String(row?.sourceUniqueKey || '').trim()).filter(Boolean));
  const postSlugs = new Set((Array.isArray(rows) ? rows : []).map(row => String(row?.slug || '').trim()).filter(Boolean));

  const kept = existing.filter(item => {
    const sourceUniqueKey = String(item?.sourceUniqueKey || '').trim();
    if (sourceUniqueKey && sourceKeys.has(sourceUniqueKey)) return false;

    const postSlug = String(item?.postSlug || '').trim();
    if (!sourceUniqueKey && postSlug && postSlugs.has(postSlug)) return false;
    return true;
  });

  const mergedScanned = scan.items.map(item => __activeCodeMergeScannedItemV2(before.get(item.codeKey), item, nowIso));
  const items = [...kept, ...mergedScanned].map((item, idx) => ({
    ...item,
    sortOrder: Number.isFinite(Number(item?.sortOrder)) ? Number(item.sortOrder) : idx
  }));
  __saveAutoActiveCodesV2(items);

  let newCodes = 0;
  let updatedCodes = 0;
  mergedScanned.forEach(item => {
    const prev = before.get(item.codeKey);
    if (!prev) newCodes += 1;
    else if (__activeCodeComparableV2(prev) !== __activeCodeComparableV2(item)) updatedCodes += 1;
  });

  console.info('[active-codes] incremental rescan', {
    scannedPosts: scan.scannedPosts,
    foundCodes: scan.foundCodes,
    newCodes,
    updatedCodes
  });

  return { ...scan, items: mergedScanned, newCodes, updatedCodes, totalCodes: items.length };
}

async function __rescanActiveCodesFromPostsDbV2({ fetchMissingDetails = true } = {}) {
  const existing = __loadAutoActiveCodesV2();
  const before = new Map(existing.map(item => [item.codeKey, item]));
  const nowIso = new Date().toISOString();
  const rows = db.prepare(`
    SELECT
      id,
      sourceUniqueKey,
      slug,
      source,
      sourceUrl,
      menuSeq,
      articleId,
      category,
      categoryKey,
      title,
      author,
      publishedAt,
      updatedAt,
      createdAt,
      lastSyncedAt,
      contentHtml,
      contentText
    FROM posts
    WHERE isPublished = 1
    ORDER BY datetime(COALESCE(publishedAt, createdAt)) DESC, id DESC
  `).all();

  const scan = await __scanActiveCodesFromPostsV2(rows, { fetchMissingDetails });
  const mergedScanned = scan.items.map(item => __activeCodeMergeScannedItemV2(before.get(item.codeKey), item, nowIso));
  const removedCodes = existing.filter(item => !scan.items.some(next => next.codeKey === item.codeKey)).length;
  __saveAutoActiveCodesV2(mergedScanned);

  let newCodes = 0;
  let updatedCodes = 0;
  mergedScanned.forEach(item => {
    const prev = before.get(item.codeKey);
    if (!prev) newCodes += 1;
    else if (__activeCodeComparableV2(prev) !== __activeCodeComparableV2(item)) updatedCodes += 1;
  });

  console.info('[active-codes] full rescan', {
    scannedPosts: scan.scannedPosts,
    foundCodes: scan.foundCodes,
    newCodes,
    updatedCodes,
    removedCodes
  });

  return { ...scan, items: mergedScanned, newCodes, updatedCodes, removedCodes, totalCodes: mergedScanned.length };
}
// #endregion


// =====================================
// Posts Feed (Netmarble + Website) - DB Storage
// #region =====================================
const POSTS_SYNC_STATE_KEY = 'posts:syncMeta:v2';
const POSTS_WEBSITE_STATE_KEY = 'posts:website:keys:v2';

const NETMARBLE_POSTS_CFG = {
  siteBase: 'https://forum.netmarble.com',
  apiBase: 'https://forum.netmarble.com/api/game/sololv/official/forum/slv_en',
  languageCd: 'en_US',
  viewType: 'pv',
  sort: 'NEW',
  categories: [
    { menuSeq: 32, categoryKey: 'notice', category: 'Notice' },
    { menuSeq: 13, categoryKey: 'devnotes', category: 'Developer Notes' },
    { menuSeq: 14, categoryKey: 'updates', category: 'Updates' },
    { menuSeq: 34, categoryKey: 'events', category: 'Events' },
    { menuSeq: 47, categoryKey: 'packages', category: 'Packages' },
    { menuSeq: 25, categoryKey: 'cmnotes', category: 'CM Notes' },

    // syncuje się do DB, ale ukrywamy to na /posts/list
    { menuSeq: 46, categoryKey: 'hunter-origin', category: 'Hunter: Origin', hiddenFromPosts: true },
  ],
  rowsPerCategory: 12,
  detailCountPerCategory: 12,
  commentRows: 100
};

function _qs(obj = {}) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  }
  return p.toString();
}

function _apiUrl(path, params = {}) {
  return `${NETMARBLE_POSTS_CFG.apiBase}${path}?${_qs({ ...params, _: Date.now() })}`;
}

function _s(v) {
  return String(v ?? '').trim();
}

function _slugify(text) {
  return _s(text)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || `post-${Date.now()}`;
}

function _safeHtml(str) {
  return _s(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function _toHtmlFromText(text) {
  const t = _s(text);
  if (!t) return '';
  return t
    .split(/\n{2,}/)
    .map(p => `<p>${_safeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

function _looksLikeHtml(s) {
  const t = String(s || '').trim();
  return /<\/?[a-z][\s\S]*>/i.test(t);
}

function _stripHtml(html) {
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

function _sanitizeNmHtml(html) {
  let s = String(html || '');

  s = s.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '');
  s = s.replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, '');
  s = s.replace(/<iframe[\s\S]*?>[\s\S]*?<\/iframe>/gi, '');

  s = s.replace(/\son\w+="[^"]*"/gi, '');
  s = s.replace(/\son\w+='[^']*'/gi, '');

  s = s.replace(/margin-left:\s*-?7\.05pt;?/gi, '');
  s = s.replace(/margin-top:\s*[^;"]*;?/gi, '');
  s = s.replace(/margin-right:\s*[^;"]*;?/gi, '');
  s = s.replace(/margin-bottom:\s*[^;"]*;?/gi, '');

  return s;
}

function _nmListCandidate(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.list)) return data.list;
  if (Array.isArray(data.articleList)) return data.articleList;
  if (Array.isArray(data.noticeList)) return data.noticeList;
  if (Array.isArray(data.commentList)) return data.commentList;
  if (Array.isArray(data.result?.list)) return data.result.list;
  if (Array.isArray(data.result?.articleList)) return data.result.articleList;
  if (Array.isArray(data.result?.noticeList)) return data.result.noticeList;
  if (Array.isArray(data.result?.commentList)) return data.result.commentList;
  if (Array.isArray(data.data?.list)) return data.data.list;
  if (Array.isArray(data.data?.articleList)) return data.data.articleList;
  if (Array.isArray(data.data?.noticeList)) return data.data.noticeList;
  if (Array.isArray(data.data?.commentList)) return data.data.commentList;
  return [];
}

async function _fetchNmJson(url) {
  const r = await fetch(url, {
    method: 'GET',
    headers: { 'accept': 'application/json, text/plain, */*' }
  });

  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}

  if (!r.ok) {
    throw new Error(`Netmarble HTTP ${r.status} ${url}`);
  }
  if (!json) {
    throw new Error(`Netmarble invalid JSON ${url}`);
  }
  return json;
}

function _normalizeNmListItem(item, cat) {
  const articleId = item?.articleId ?? item?.id ?? item?.seq ?? null;
  const title = _s(item?.title || item?.subject || '');
  const regDate = item?.regDate || item?.createDate || item?.createdAt || null;
  const writer = _s(item?.nickname || item?.writerNickname || item?.memberNickname || item?.writerNm || 'Netmarble');

  const slugBase = `${cat.categoryKey}-${cat.menuSeq}-${articleId}`;
  const slugTitle = _slugify(title).slice(0, 80);
  const slug = `${slugBase}-${slugTitle}`;

  return {
    source: 'netmarble',
    sourcePostId: String(articleId || ''),
    menuSeq: cat.menuSeq,
    articleId,
    sourceUrl: articleId ? `${NETMARBLE_POSTS_CFG.siteBase}/slv_en/view/${cat.menuSeq}/${articleId}` : '',
    category: cat.category,
    categoryKey: cat.categoryKey,
    title,
    excerpt: '',
    contentText: '',
    contentHtml: '',
    images: [],
    youtubeEmbeds: [],
    author: writer || 'Netmarble',
    publishedAt: regDate ? (new Date(regDate).toISOString?.() || regDate) : null,
    updatedAt: regDate ? (new Date(regDate).toISOString?.() || regDate) : null,
    slug,
    isPublished: true,
    syncStatus: 'synced',
    hiddenFromPosts: !!cat?.hiddenFromPosts
  };
}

function _isBadCardImageUrl(url) {
  const s = _s(url).toLowerCase();
  if (!s) return true;

  if (s.includes('/thumbnail/') && /_d\.(jpg|jpeg|png|gif|webp)$/i.test(s)) {
    return false;
  }

  return false;
}

function _preferCardImages(images = []) {
  const arr = Array.isArray(images) ? images.filter(Boolean) : [];

  const main = arr.filter(u => !/\/thumbnail\//i.test(u));
  const thumbs = arr.filter(u => /\/thumbnail\//i.test(u));

  const out = [];
  const push = (u) => {
    const s = _s(u);
    if (!s) return;
    if (!/^https?:\/\//i.test(s)) return;
    if (!out.includes(s)) out.push(s);
  };

  main.forEach(push);
  thumbs.forEach(push);

  return out;
}

function _extractYoutubeEmbedsFromAny(value) {
  const out = [];
  const seen = new Set();

  const pushId = (id) => {
    const s = String(id || '').trim();
    if (!/^[A-Za-z0-9_-]{6,}$/.test(s)) return;
    const emb = `https://www.youtube.com/embed/${s}`;
    if (!seen.has(emb)) {
      seen.add(emb);
      out.push(emb);
    }
  };

  const pushFromString = (raw) => {
    const str = String(raw || '');
    if (!str) return;

    const urlMatches = str.match(/https?:\/\/[^\s"'<>]+/gi) || [];
    for (const u of urlMatches) {
      try {
        const x = new URL(u);
        const h = x.hostname.replace(/^www\./i, '').toLowerCase();
        if (h === 'youtube.com' || h === 'm.youtube.com' || h === 'youtu.be') {
          let id = '';
          if (h === 'youtu.be') id = x.pathname.split('/')[1] || '';
          else if (x.pathname === '/watch') id = x.searchParams.get('v') || '';
          else {
            const m = x.pathname.match(/^\/(?:embed|shorts|live)\/([A-Za-z0-9_-]{6,})/i);
            if (m) id = m[1];
          }
          pushId(id);
        }
      } catch {}
    }

    const thumbMatches = str.match(/(?:i\.ytimg\.com|img\.youtube\.com)\/vi\/([A-Za-z0-9_-]{6,})\//gi) || [];
    for (const m of thumbMatches) {
      const mm = m.match(/\/vi\/([A-Za-z0-9_-]{6,})\//i);
      if (mm) pushId(mm[1]);
    }

    const embedMatches = str.match(/youtube\.com\/embed\/([A-Za-z0-9_-]{6,})/gi) || [];
    for (const m of embedMatches) {
      const mm = m.match(/\/embed\/([A-Za-z0-9_-]{6,})/i);
      if (mm) pushId(mm[1]);
    }
  };

  const walk = (v) => {
    if (v == null) return;
    if (typeof v === 'string') return pushFromString(v);
    if (Array.isArray(v)) return v.forEach(walk);
    if (typeof v === 'object') {
      for (const val of Object.values(v)) walk(val);
    }
  };

  walk(value);
  return out;
}

function _normalizeNmDetail(detailJson, seed, cat) {
  const root = detailJson?.result ?? detailJson?.data ?? detailJson ?? {};
  const a = root.article ?? detailJson?.article ?? root;

  const articleId = a?.articleId ?? a?.id ?? seed?.articleId ?? null;
  const title = _s(a?.title || a?.subject || seed?.title || '');
  const regDate = a?.regDate || a?.createDate || a?.createdAt || seed?.publishedAt || null;
  const writer = _s(a?.nickname || a?.writerNickname || a?.memberNickname || a?.writerNm || seed?.author || 'Netmarble');

  const contentTextField = _s(a?.contentText || '');
  const contentHtmlField = _s(a?.contentHtml || a?.contentsHtml || '');
  const contentRawField = _s(a?.content || a?.contents || '');

  let contentHtml = '';
  let plainText = '';

  if (contentHtmlField) {
    contentHtml = _sanitizeNmHtml(contentHtmlField);
    plainText = _stripHtml(contentHtml);
  } else if (_looksLikeHtml(contentRawField)) {
    contentHtml = _sanitizeNmHtml(contentRawField);
    plainText = _stripHtml(contentHtml);
  } else if (contentTextField) {
    plainText = contentTextField;
    contentHtml = _toHtmlFromText(plainText);
  } else if (contentRawField) {
    plainText = contentRawField;
    contentHtml = _toHtmlFromText(plainText);
  }

  const youtubeEmbeds = _extractYoutubeEmbedsFromAny({
    detailJson,
    article: a,
    contentHtmlField,
    contentRawField,
    contentHtml
  });

  const contentImages = [];
  const fallbackImages = [];

  const pushImgContent = (u) => {
    const s = _s(u);
    if (!s) return;
    if (!/^https?:\/\//i.test(s)) return;
    if (!contentImages.includes(s)) contentImages.push(s);
  };

  const pushImgFallback = (u) => {
    const s = _s(u);
    if (!s) return;
    if (!/^https?:\/\//i.test(s)) return;
    if (!fallbackImages.includes(s)) fallbackImages.push(s);
  };

  if (contentHtml) {
    const re = /<img[^>]+src=["']([^"']+)["']/gi;
    let m;
    while ((m = re.exec(contentHtml)) !== null) {
      pushImgContent(m[1]);
    }
  }

  pushImgFallback(a?.thumbnailImgUrl);
  pushImgFallback(a?.imageUrl);

  const mergedImages = _preferCardImages([...contentImages, ...fallbackImages]);
  const images = mergedImages.filter(u => !_isBadCardImageUrl(u) || true);

  const excerptBase = _s(plainText).replace(/\s+/g, ' ');
  const excerpt = excerptBase ? excerptBase.slice(0, 220) + (excerptBase.length > 220 ? '…' : '') : '';

  const slug = `${cat.categoryKey}-${cat.menuSeq}-${articleId}-${_slugify(title).slice(0, 80)}`;

  return {
    ...seed,
    source: 'netmarble',
    sourcePostId: String(articleId || ''),
    menuSeq: cat.menuSeq,
    articleId,
    title,
    excerpt,
    contentText: plainText,
    contentHtml,
    youtubeEmbeds,
    images,
    author: writer,
    sourceUrl: articleId ? `${NETMARBLE_POSTS_CFG.siteBase}/slv_en/view/${cat.menuSeq}/${articleId}` : seed.sourceUrl,
    publishedAt: regDate ? (new Date(regDate).toISOString?.() || regDate) : seed.publishedAt,
    updatedAt: regDate ? (new Date(regDate).toISOString?.() || regDate) : seed.updatedAt,
    slug,
    isPublished: true,
    syncStatus: 'synced',
    hiddenFromPosts: !!cat?.hiddenFromPosts
  };
}

function _normalizeWebsitePostInput(p) {
  const title = _s(p?.title);
  const slug = _s(p?.slug) || `website-${_slugify(title)}`;
  const images = Array.isArray(p?.images) ? p.images.map(_s).filter(Boolean) : [];
  const contentHtml = _s(p?.contentHtml);
  const contentText = _s(p?.contentText);
  const publishedAt = p?.publishedAt ? new Date(p.publishedAt).toISOString() : new Date().toISOString();
  const id = _s(p?.id) || slug;

  return {
    source: 'website',
    sourcePostId: id,
    slug,
    sourceUrl: '',
    category: 'Website',
    categoryKey: 'website',
    title: title || 'Untitled Website Post',
    excerpt: _s(p?.excerpt),
    contentText,
    contentHtml: contentHtml || (contentText ? _toHtmlFromText(contentText) : ''),
    images,
    youtubeEmbeds: Array.isArray(p?.youtubeEmbeds) ? p.youtubeEmbeds.map(_s).filter(Boolean) : [],
    author: _s(p?.author) || 'Website',
    publishedAt,
    updatedAt: p?.updatedAt ? new Date(p.updatedAt).toISOString() : publishedAt,
    isPublished: p?.isPublished !== false,
    syncStatus: 'synced',
    hiddenFromPosts: false
  };
}

function _jsonParseSafe(str, fallback = []) {
  try { return JSON.parse(str); } catch { return fallback; }
}

function _loadWebsitePostsFromDb() {
  const rows = db.prepare(`
    SELECT *
    FROM posts
    WHERE source = 'website'
      AND isPublished = 1
    ORDER BY datetime(COALESCE(publishedAt, createdAt)) DESC, id DESC
  `).all();

  return rows.map(r => ({
    ...r,
    images: _jsonParseSafe(r.images, []),
    youtubeEmbeds: _jsonParseSafe(r.youtubeEmbeds, []),
    isPublished: !!r.isPublished,
    hasDetail: !!r.hasDetail,
    hiddenFromPosts: !!r.hiddenFromPosts
  }));
}

function _buildCompatFeedFromDb() {
  const rows = db.prepare(`
    SELECT *
    FROM posts
    WHERE isPublished = 1
    ORDER BY datetime(COALESCE(publishedAt, createdAt)) DESC, id DESC
  `).all();

  const posts = rows.map(r => ({
    ...r,
    images: _jsonParseSafe(r.images, []),
    youtubeEmbeds: _jsonParseSafe(r.youtubeEmbeds, []),
    isPublished: !!r.isPublished,
    hasDetail: !!r.hasDetail,
    hiddenFromPosts: !!r.hiddenFromPosts
  }));

  const meta = getPostsMeta({ onlyPublished: true });

  return {
    meta: {
      lastSyncAt: meta?.lastSyncAt || null,
      total: posts.length
    },
    posts
  };
}

function _setPostsSyncMeta(meta = {}) {
  const current = getPostsSyncState(POSTS_SYNC_STATE_KEY, {}) || {};
  setPostsSyncState(POSTS_SYNC_STATE_KEY, {
    ...current,
    ...meta,
    lastSyncAt: new Date().toISOString()
  });
}

async function _syncNetmarblePosts() {
  const outPosts = [];
  const syncErrors = [];

  for (const cat of NETMARBLE_POSTS_CFG.categories) {
    try {
      const listJson = await _fetchNmJson(_apiUrl('/article/list', {
        rows: NETMARBLE_POSTS_CFG.rowsPerCategory,
        start: 0,
        menuSeq: cat.menuSeq,
        viewType: NETMARBLE_POSTS_CFG.viewType,
        filterLanguageCd: NETMARBLE_POSTS_CFG.languageCd,
        sort: NETMARBLE_POSTS_CFG.sort
      }));

      const list = _nmListCandidate(listJson)
        .map(x => _normalizeNmListItem(x, cat))
        .filter(x => x?.articleId);

      for (const seed of list.slice(0, NETMARBLE_POSTS_CFG.detailCountPerCategory)) {
        try {
          const d = await _fetchNmJson(_apiUrl(`/article/${seed.articleId}`, {
            menuSeq: cat.menuSeq,
            viewFlag: false
          }));

          const full = _normalizeNmDetail(d, seed, cat);
          outPosts.push(full);
        } catch (e) {
          syncErrors.push({
            step: 'detail',
            menuSeq: cat.menuSeq,
            articleId: seed?.articleId,
            error: String(e)
          });
          outPosts.push(seed);
        }
      }
    } catch (e) {
      syncErrors.push({
        step: 'list',
        menuSeq: cat.menuSeq,
        error: String(e)
      });
    }
  }

  return { posts: outPosts, errors: syncErrors };
}

async function _syncNetmarblePostsFull({ rows = 100, maxStart = 20000 } = {}) {
  const outPosts = [];
  const syncErrors = [];
  const pageSize = Math.max(20, Math.min(200, Number(rows) || 100));

  for (const cat of NETMARBLE_POSTS_CFG.categories) {
    try {
      let start = 0;
      const allSeeds = [];

      while (true) {
        const listJson = await _fetchNmJson(_apiUrl('/article/list', {
          rows: pageSize,
          start,
          menuSeq: cat.menuSeq,
          viewType: NETMARBLE_POSTS_CFG.viewType,
          filterLanguageCd: NETMARBLE_POSTS_CFG.languageCd,
          sort: NETMARBLE_POSTS_CFG.sort
        }));

        const page = _nmListCandidate(listJson)
          .map(x => _normalizeNmListItem(x, cat))
          .filter(x => x?.articleId);

        if (!page.length) break;

        allSeeds.push(...page);

        if (page.length < pageSize) break;
        start += pageSize;
        if (start > maxStart) break;
      }

      const uniq = new Map();
      for (const s of allSeeds) {
        uniq.set(`${cat.menuSeq}:${s.articleId}`, s);
      }

      const list = Array.from(uniq.values());
      const detailLimit = Math.max(0, Number(NETMARBLE_POSTS_CFG.detailCountPerCategory) || 0);

      for (const seed of list.slice(0, detailLimit)) {
        try {
          const d = await _fetchNmJson(_apiUrl(`/article/${seed.articleId}`, {
            menuSeq: cat.menuSeq,
            viewFlag: false
          }));
          const full = _normalizeNmDetail(d, seed, cat);
          outPosts.push(full);
        } catch (e) {
          syncErrors.push({
            step: 'detail',
            menuSeq: cat.menuSeq,
            articleId: seed?.articleId,
            error: String(e)
          });
          outPosts.push(seed);
        }
      }

      for (const seed of list.slice(detailLimit)) outPosts.push(seed);

    } catch (e) {
      syncErrors.push({
        step: 'list',
        menuSeq: cat.menuSeq,
        error: String(e)
      });
    }
  }

  return { posts: outPosts, errors: syncErrors };
}
// #endregion


// =====================================
// Posts Auto-Sync (Server Background)
// #region =====================================
let __postsAutoSyncInProgress = false;
let __postsAutoSyncLastAt = 0;

async function _runPostsAutoSync({ force = false } = {}) {
  const now = Date.now();
  const MIN_GAP_MS = 60 * 1000;

  if (!force && (now - __postsAutoSyncLastAt) < MIN_GAP_MS) return false;
  if (__postsAutoSyncInProgress) return false;

  __postsAutoSyncInProgress = true;

  try {
    const sync = await _syncNetmarblePosts();
    let activeCodes = null;

    if (Array.isArray(sync?.posts) && sync.posts.length) {
      const syncedPosts = upsertPosts(sync.posts);
      activeCodes = await __rescanActiveCodesFromPostsV2(syncedPosts, { fetchMissingDetails: true });
    }

    const meta = getPostsMeta({ onlyPublished: true });

    _setPostsSyncMeta({
      netmarbleFetchedNow: sync?.posts?.length || 0,
      totalPublished: meta?.counts?.all || 0,
      errors: sync?.errors || []
    });

    __postsAutoSyncLastAt = Date.now();

    console.log('[posts:auto-sync] ok', {
      netmarbleFetchedNow: sync?.posts?.length || 0,
      totalPublished: meta?.counts?.all || 0,
      errors: sync?.errors?.length || 0,
      activeCodesFound: activeCodes?.foundCodes || 0
    });

    return true;
  } catch (e) {
    console.error('[posts:auto-sync] error', e);
    return false;
  } finally {
    __postsAutoSyncInProgress = false;
  }
}

function _triggerPostsAutoSyncBackground() {
  _runPostsAutoSync({ force: false }).catch(err => {
    console.error('[posts:auto-sync:bg] error', err);
  });
}

const POSTS_AUTO_SYNC_INTERVAL_MS = 5 * 60 * 1000;
setInterval(() => {
  _triggerPostsAutoSyncBackground();
}, POSTS_AUTO_SYNC_INTERVAL_MS);

setTimeout(() => {
  _runPostsAutoSync({ force: true }).catch(() => {});
}, 10 * 1000);
// #endregion


// =====================================
// Public Posts API (DB)
// #region =====================================
router.get('/api/posts/feed', (req, res) => {
  res.set('Cache-Control', 'no-store');

  _triggerPostsAutoSyncBackground();

  return res.json(_buildCompatFeedFromDb());
});

router.get('/api/posts/list', (req, res) => {
  res.set('Cache-Control', 'public, max-age=15, stale-while-revalidate=60');

  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.max(1, Math.min(50, Number(req.query.pageSize) || 12));
  const categoryKey = _s(req.query.categoryKey || req.query.filter || 'all');
  const source = _s(req.query.source || 'all');
  const q = _s(req.query.q || '');

  const result = listPosts({
    page,
    pageSize,
    source,
    categoryKey,
    q,
    onlyPublished: true
  });

  const counts = getPostCounts({
    source,
    q,
    onlyPublished: true
  });

  const syncMeta = getPostsMeta({ onlyPublished: true });

  _triggerPostsAutoSyncBackground();

  const visiblePosts = Array.isArray(result?.items)
    ? result.items.filter(p => !p?.hiddenFromPosts)
    : [];

  const visibleCounts = counts || {};

  return res.json({
    meta: {
      page: result?.page || page,
      pageSize: result?.pageSize || pageSize,
      total: result?.totalItems || 0,
      totalPages: result?.totalPages || 1,
      categoryKey: categoryKey || 'all',
      source: source || 'all',
      q: q || '',
      lastSyncAt: syncMeta?.lastSyncAt || null,
      counts: visibleCounts
    },
    posts: visiblePosts
  });
});

router.get('/api/posts/latest', (req, res) => {
  res.set('Cache-Control', 'public, max-age=15, stale-while-revalidate=60');

  const limit = Math.max(1, Math.min(20, Number(req.query.limit) || 10));
  const categoryKey = _s(req.query.categoryKey || 'all');
  const source = _s(req.query.source || 'all');
  const includeHidden = ['1', 'true', 'yes'].includes(String(req.query.includeHidden || '').toLowerCase());

  const posts = listLatestPosts({
    limit,
    source,
    categoryKey,
    onlyPublished: true,
    excludeHidden: !includeHidden
  });

  const syncMeta = getPostsMeta({ onlyPublished: true });

  _triggerPostsAutoSyncBackground();

  return res.json({
    meta: {
      total: posts.length,
      limit,
      categoryKey: categoryKey || 'all',
      source: source || 'all',
      includeHidden,
      lastSyncAt: syncMeta?.lastSyncAt || null
    },
    posts
  });
});

router.get('/api/posts/website', (req, res) => {
  res.set('Cache-Control', 'no-store');
  return res.json({ posts: _loadWebsitePostsFromDb() });
});

router.get('/api/posts/:slug', async (req, res) => {
  res.set('Cache-Control', 'no-store');

  const slug = _s(req.params?.slug);
  let post = getPostBySlug(slug);

  if (!post) {
    return res.status(404).json({ error: 'Post not found' });
  }

  const isNetmarble = String(post?.source || '').toLowerCase() === 'netmarble';
  const needsDetail =
    !String(post?.contentHtml || '').trim() &&
    !String(post?.contentText || '').trim();

  if (isNetmarble && needsDetail && post?.menuSeq && post?.articleId) {
    try {
      const menuSeq = Number(post.menuSeq);
      const articleId = Number(post.articleId);

      const cat =
        NETMARBLE_POSTS_CFG.categories.find(c => Number(c.menuSeq) === Number(menuSeq)) ||
        {
          menuSeq,
          categoryKey: post.categoryKey,
          category: post.category
        };

      const d = await _fetchNmJson(_apiUrl(`/article/${articleId}`, {
        menuSeq,
        viewFlag: false
      }));

      const full = _normalizeNmDetail(d, post, cat);

      upsertPost(full);
      markPostDetailFetchedBySlug(slug, full);

      post = getPostBySlug(slug) || full;
      return res.json({ post });
    } catch (e) {
      console.warn('[posts] lazy detail failed', e?.message || e);
    }
  }

  return res.json({ post });
});
// #endregion

// =====================================
// Admin Posts API
// #region =====================================
router.post(
  '/api/admin/posts/website',
  requireAdmin,
  require('express').json({ limit: '2mb' }),
  (req, res) => {
    try {
      const inArr = Array.isArray(req.body?.posts) ? req.body.posts : [];
      const normalized = inArr.map(_normalizeWebsitePostInput);

      upsertPosts(normalized);

      const nextKeys = normalized.map(p => `website:${p.sourcePostId || p.slug}`);
      const prevKeys = getPostsSyncState(POSTS_WEBSITE_STATE_KEY, []) || [];

      const removedKeys = prevKeys.filter(k => !nextKeys.includes(k));

      if (removedKeys.length) {
        const markUnpublishedStmt = db.prepare(`
          UPDATE posts
          SET
            isPublished = 0,
            localUpdatedAt = @now
          WHERE source = 'website'
            AND sourceUniqueKey = @sourceUniqueKey
        `);

        const now = new Date().toISOString();
        const tx = db.transaction((keys) => {
          for (const key of keys) {
            markUnpublishedStmt.run({
              sourceUniqueKey: key,
              now
            });
          }
        });

        tx(removedKeys);
      }

      setPostsSyncState(POSTS_WEBSITE_STATE_KEY, nextKeys);

      const meta = getPostsMeta({ onlyPublished: true });

      return res.json({
        ok: true,
        posts: normalized,
        feedMeta: {
          lastSyncAt: meta?.lastSyncAt || null,
          total: meta?.counts?.all || 0
        }
      });
    } catch (e) {
      console.error('[posts:website] error', e);
      return res.status(500).json({ ok: false, error: e?.message || 'website_posts_save_failed' });
    }
  }
);

router.post(
  '/api/admin/posts/sync-netmarble',
  requireAdmin,
  require('express').json({ limit: '64kb' }),
  async (req, res) => {
    res.set('Cache-Control', 'no-store');

    try {
      const sync = await _syncNetmarblePosts();
      let activeCodes = null;

      if (Array.isArray(sync?.posts) && sync.posts.length) {
        const syncedPosts = upsertPosts(sync.posts);
        activeCodes = await __rescanActiveCodesFromPostsV2(syncedPosts, { fetchMissingDetails: true });
      }

      const meta = getPostsMeta({ onlyPublished: true });

      _setPostsSyncMeta({
        netmarbleFetchedNow: sync?.posts?.length || 0,
        totalPublished: meta?.counts?.all || 0,
        errors: sync?.errors || []
      });

      return res.json({
        ok: true,
        meta: {
          lastSyncAt: meta?.lastSyncAt || null,
          total: meta?.counts?.all || 0,
          counts: meta?.counts || {}
        },
        activeCodes: activeCodes
          ? {
              scannedPosts: activeCodes.scannedPosts,
              fetchedMissingDetails: activeCodes.fetchedMissingDetails,
              fetchErrors: activeCodes.fetchErrors,
              foundCodes: activeCodes.foundCodes,
              newCodes: activeCodes.newCodes,
              updatedCodes: activeCodes.updatedCodes,
              ignoredCandidates: activeCodes.ignoredCandidates,
              totalCodes: activeCodes.totalCodes
            }
          : null,
        netmarbleCountFetchedNow: sync.posts.length,
        errors: sync.errors
      });
    } catch (e) {
      console.error('[posts:sync-netmarble] error', e);
      return res.status(500).json({ ok: false, error: e?.message || 'sync_failed' });
    }
  }
);

router.post(
  '/api/admin/posts/sync-netmarble-full',
  requireAdmin,
  require('express').json({ limit: '64kb' }),
  async (req, res) => {
    res.set('Cache-Control', 'no-store');

    const need = String(process.env.POSTS_FULLSYNC_KEY || '').trim();
    const got =
      String(req.body?.key || req.query?.key || req.headers['x-posts-fullsync-key'] || '').trim();

    if (need && got !== need) {
      return res.status(403).json({ ok: false, error: 'bad_key' });
    }

    try {
      const sync = await _syncNetmarblePostsFull({ rows: 100 });
      let activeCodes = null;

      if (Array.isArray(sync?.posts) && sync.posts.length) {
        const syncedPosts = upsertPosts(sync.posts);
        activeCodes = await __rescanActiveCodesFromPostsV2(syncedPosts, { fetchMissingDetails: true });
      }

      const meta = getPostsMeta({ onlyPublished: true });

      _setPostsSyncMeta({
        netmarbleFetchedNow: sync?.posts?.length || 0,
        totalPublished: meta?.counts?.all || 0,
        errors: sync?.errors || [],
        fullSyncAt: new Date().toISOString()
      });

      return res.json({
        ok: true,
        meta: {
          lastSyncAt: meta?.lastSyncAt || null,
          total: meta?.counts?.all || 0,
          counts: meta?.counts || {}
        },
        activeCodes: activeCodes
          ? {
              scannedPosts: activeCodes.scannedPosts,
              fetchedMissingDetails: activeCodes.fetchedMissingDetails,
              fetchErrors: activeCodes.fetchErrors,
              foundCodes: activeCodes.foundCodes,
              newCodes: activeCodes.newCodes,
              updatedCodes: activeCodes.updatedCodes,
              ignoredCandidates: activeCodes.ignoredCandidates,
              totalCodes: activeCodes.totalCodes
            }
          : null,
        netmarbleCountFetchedNow: sync.posts.length,
        errors: sync.errors
      });
    } catch (e) {
      console.error('[posts:sync-netmarble-full] error', e);
      return res.status(500).json({ ok: false, error: e?.message || 'sync_failed' });
    }
  }
);
// #endregion

// =====================================
// Pictures Management (Global)
// #region =====================================
let multer = null;
try { multer = require('multer'); } catch {}
const upload = multer
  ? multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } })
  : null;

router.post(
  '/api/suggestions/upload',
  requireAuth,
  (req, res, next) => {
    if (!upload) return res.status(500).json({ error: 'multer_not_installed' });
    return upload.single('file')(req, res, next);
  },
  (req, res) => {
    res.set('Cache-Control', 'no-store');

    const f = req.file;
    if (!f) return res.status(400).json({ error: 'missing_file' });

    const mime = String(f.mimetype || '').toLowerCase();
    if (!SUGGESTION_IMAGE_MIMES.has(mime)) {
      return res.status(400).json({ error: 'invalid_file_type' });
    }
    if (Number(f.size || 0) > SUGGESTION_MAX_FILE_SIZE) {
      return res.status(400).json({ error: 'file_too_large' });
    }

    try {
      const extByMime = {
        'image/png': '.png',
        'image/jpeg': '.jpg',
        'image/webp': '.webp',
        'image/gif': '.gif'
      };
      const original = String(f.originalname || 'attachment').replace(/\\/g, '/').split('/').pop();
      const ext = extByMime[mime] || path.extname(original).toLowerCase() || '.png';
      const safeBase = path.parse(original).name
        .replace(/[^a-z0-9_-]+/gi, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60) || 'attachment';
      const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeBase}${ext}`;
      const rel = `Suggestions/${filename}`;
      const dest = resolveInCategory('Suggestions', filename);

      ensureDirSync(path.dirname(dest));
      fs.writeFileSync(dest, f.buffer);

      return res.json({
        ok: true,
        attachment: {
          name: original || filename,
          url: `/picture/${rel}`,
          mime,
          size: Number(f.size || 0)
        }
      });
    } catch (e) {
      console.error('[suggestions:upload] error', e);
      return res.status(500).json({ error: 'upload_failed' });
    }
  }
);

router.post(
  '/api/suggestions/:id/upload',
  requireAuth,
  (req, res, next) => {
    if (!upload) return res.status(500).json({ error: 'multer_not_installed' });
    return upload.single('file')(req, res, next);
  },
  (req, res) => {
    res.set('Cache-Control', 'no-store');

    const id = Number(req.params.id);
    const items = readSuggestionsList();
    const idx = items.findIndex(x => Number(x.id) === id);
    if (idx < 0) return res.status(404).json({ error: 'Suggestion not found' });

    const uid = suggestionUserId(req);
    const isOwner = uid && String(items[idx].authorId || '') === uid;
    if (!isOwner && !isAdminReq(req)) return res.status(403).json({ error: 'Forbidden' });

    const f = req.file;
    if (!f) return res.status(400).json({ error: 'missing_file' });

    const mime = String(f.mimetype || '').toLowerCase();
    if (!SUGGESTION_IMAGE_MIMES.has(mime)) {
      return res.status(400).json({ error: 'invalid_file_type' });
    }
    if (Number(f.size || 0) > SUGGESTION_MAX_FILE_SIZE) {
      return res.status(400).json({ error: 'file_too_large' });
    }

    try {
      const extByMime = {
        'image/png': '.png',
        'image/jpeg': '.jpg',
        'image/webp': '.webp',
        'image/gif': '.gif'
      };
      const original = String(f.originalname || 'attachment').replace(/\\/g, '/').split('/').pop();
      const ext = extByMime[mime] || path.extname(original).toLowerCase() || '.png';
      const safeBase = path.parse(original).name
        .replace(/[^a-z0-9_-]+/gi, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60) || 'attachment';
      const folder = String(Math.floor(id));
      const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeBase}${ext}`;
      const rel = `${folder}/${filename}`;
      const dest = resolveInCategory('Suggestions', rel);

      ensureDirSync(path.dirname(dest));
      fs.writeFileSync(dest, f.buffer);

      const attachment = {
        name: original || filename,
        url: `/picture/Suggestions/${rel}`,
        mime,
        size: Number(f.size || 0)
      };

      items[idx].attachments = Array.isArray(items[idx].attachments) ? items[idx].attachments : [];
      items[idx].attachments.push(attachment);
      items[idx].updatedAt = nowIsoString();
      writeSuggestionsList(items);

      return res.json({ ok: true, attachment, item: items[idx] });
    } catch (e) {
      console.error('[suggestions:upload-by-id] error', e);
      return res.status(500).json({ error: 'upload_failed' });
    }
  }
);

// Find correct root for /picture (supports ./picture and ./public/picture)
function findPictureRoot() {
  const candidates = [
    path.join(process.cwd(), 'picture'),
    path.join(process.cwd(), 'public', 'picture'),
    path.join(__dirname, '..', 'picture'),
    path.join(__dirname, '..', 'public', 'picture'),
  ];

  for (const p of candidates) {
    try {
      if (fs.existsSync(p) && fs.statSync(p).isDirectory()) return p;
    } catch {}
  }
  return candidates[0];
}

const PICTURE_ROOT = findPictureRoot();
console.log('[pictures] PICTURE_ROOT =', PICTURE_ROOT);

function safeSeg(s) {
  const raw = String(s || '').replace(/\\/g, '/').trim();
  if (!raw) return '';
  if (raw.includes('\0') || path.isAbsolute(raw) || raw.startsWith('/')) throw new Error('bad_path');

  const parts = raw.split('/');
  if (parts.some(p => !p || p === '.' || p === '..')) throw new Error('bad_path');
  return parts.join('/');
}

// category root: <PICTURE_ROOT>/<category>
function categoryRoot(category) {
  const c = safeSeg(category);
  const full = path.join(PICTURE_ROOT, c);

  const normRoot = path.normalize(PICTURE_ROOT + path.sep);
  const normFull = path.normalize(full);

  if (!normFull.startsWith(normRoot)) throw new Error('bad_path');
  return normFull;
}

// resolve file within category: <PICTURE_ROOT>/<category>/<rel>
function resolveInCategory(category, rel) {
  const base = categoryRoot(category);
  const r = safeSeg(rel);
  const full = path.join(base, r);

  const normBase = path.normalize(base + path.sep);
  const normFull = path.normalize(full);

  if (!normFull.startsWith(normBase)) throw new Error('bad_path');
  return normFull;
}

function listFilesRecursive(dir, baseDir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);

    if (e.isDirectory()) {
      out.push(...listFilesRecursive(full, baseDir));
      continue;
    }

    const ext = path.extname(e.name).toLowerCase();
    if (!['.png', '.webp', '.jpg', '.jpeg', '.gif'].includes(ext)) continue;

    const st = fs.statSync(full);
    const rel = path.relative(baseDir, full).replace(/\\/g, '/');
    out.push({ rel, name: e.name, size: st.size, mtimeMs: st.mtimeMs });
  }
  return out;
}

const PICTURE_IMAGE_EXTS = new Set(['.png', '.webp', '.jpg', '.jpeg', '.gif']);
const PICTURE_DYNAMIC_SUBTAB_SOURCES = {
  Hunter_Skin: 'Hunter',
  Hunter_Skill: 'Hunter',
  HWeapon_Skin: 'HWeapon',
  SGWeapon_Skin: 'SGWeapon',
  SGWeapon_Description_Pictures: 'SGWeapon',
  SGWeapon_Skill: 'SGWeapon'
};
const PICTURE_DEPENDENT_FOLDERS = {
  Hunter: ['Hunter_Skin', 'Hunter_Skill'],
  HWeapon: ['HWeapon_Skin'],
  SGWeapon: ['SGWeapon_Skin', 'SGWeapon_Description_Pictures', 'SGWeapon_Skill']
};

function pictureOrderKey(category) {
  return `pictureOrder:${category}`;
}

function uniqueStrings(list) {
  const out = [];
  const seen = new Set();
  for (const value of Array.isArray(list) ? list : []) {
    const s = String(value || '').trim();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

function listDirectPictureBaseNames(category) {
  const dir = categoryRoot(category);
  if (!fs.existsSync(dir)) return [];

  const names = [];
  const seen = new Set();
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    let name = '';
    if (entry.isDirectory()) {
      name = entry.name;
    } else if (entry.isFile() && PICTURE_IMAGE_EXTS.has(path.extname(entry.name).toLowerCase())) {
      name = path.parse(entry.name).name;
    }

    if (!name || seen.has(name)) continue;
    seen.add(name);
    names.push(name);
  }

  return names.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
}

function applyPictureOrder(names, category) {
  const existing = new Set(names);
  const ordered = [];
  const seen = new Set();
  for (const name of uniqueStrings(getGlobal(pictureOrderKey(category)))) {
    if (!existing.has(name) || seen.has(name)) continue;
    seen.add(name);
    ordered.push(name);
  }
  for (const name of names) {
    if (seen.has(name)) continue;
    seen.add(name);
    ordered.push(name);
  }
  return ordered;
}

function normalizePictureOrder(category, inputOrder) {
  const existingNames = listDirectPictureBaseNames(category);
  const existing = new Set(existingNames);
  const out = [];
  const seen = new Set();

  for (const name of uniqueStrings(inputOrder)) {
    if (!existing.has(name) || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  for (const name of existingNames) {
    if (seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}

function ensureDependentPictureFolders(category, filename) {
  const targets = PICTURE_DEPENDENT_FOLDERS[category];
  if (!targets || !targets.length) return [];

  const baseName = path.parse(String(filename || '')).name.trim();
  if (!baseName) return [];
  safeSeg(baseName);

  const created = [];
  for (const targetCategory of targets) {
    const targetDir = resolveInCategory(targetCategory, baseName);
    ensureDirSync(targetDir);
    created.push(`${targetCategory}/${baseName}`);
  }
  return created;
}
// #endregion


// =====================================
// Pictures - List
// #region =====================================
router.get('/api/public/road-map-images', (req, res) => {
  res.set('Cache-Control', 'no-store');

  try {
    const allowedExt = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);
    const dirs = [
      path.join(process.cwd(), 'picture', 'Road_Map'),
      path.join(process.cwd(), 'public', 'picture', 'Road_Map'),
      path.join(__dirname, '..', 'picture', 'Road_Map'),
      path.join(__dirname, '..', 'public', 'picture', 'Road_Map')
    ];

    const seenDirs = new Set();
    const seenFiles = new Set();
    const images = [];

    for (const dir of dirs) {
      const normDir = path.normalize(dir);
      if (seenDirs.has(normDir)) continue;
      seenDirs.add(normDir);

      if (!fs.existsSync(normDir) || !fs.statSync(normDir).isDirectory()) continue;

      const files = fs.readdirSync(normDir, { withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => entry.name)
        .filter((name) => allowedExt.has(path.extname(name).toLowerCase()));

      for (const name of files) {
        if (seenFiles.has(name)) continue;
        seenFiles.add(name);
        images.push(name);
      }
    }

    images.sort((a, b) => {
      const aBase = path.parse(a).name;
      const bBase = path.parse(b).name;
      const aNumeric = /^\d+$/.test(aBase);
      const bNumeric = /^\d+$/.test(bBase);

      if (aNumeric && bNumeric) return Number(bBase) - Number(aBase);
      if (aNumeric) return -1;
      if (bNumeric) return 1;
      return b.localeCompare(a, undefined, { numeric: true, sensitivity: 'base' });
    });

    return res.json({ ok: true, images });
  } catch (e) {
    console.error('[public:road-map-images] error', e);
    return res.json({ ok: true, images: [] });
  }
});

router.get('/api/public/hweapon-skins', (req, res) => {
  res.set('Cache-Control', 'no-store');

  try {
    const folder = safeSeg(req.query?.folder || req.query?.weapon || '');
    const baseName = String(req.query?.baseName || '').trim();
    if (!folder) return res.status(400).json({ error: 'missing_folder' });

    const dir = resolveInCategory('HWeapon_Skin', folder);
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
      return res.json({ ok: true, folder, baseName, items: [] });
    }

    const allowedExt = new Set(['.png', '.webp', '.jpg', '.jpeg', '.gif']);
    const files = fs.readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isFile())
      .map((e) => e.name)
      .filter((name) => allowedExt.has(path.extname(name).toLowerCase()));

    const normalizedBase = String(baseName || '').trim().toLowerCase();
    const filtered = files.filter((name) => {
      if (!normalizedBase) return true;
      return path.parse(name).name.toLowerCase().startsWith(normalizedBase);
    });

    const items = filtered
      .map((name) => {
        const parsed = path.parse(name).name;
        const tail = normalizedBase ? parsed.slice(baseName.length) : parsed;
        const num = Number(String(tail).match(/(\d+)$/)?.[1] || 0);
        return {
          name,
          rel: `${folder}/${name}`.replace(/\\/g, '/'),
          url: `/picture/HWeapon_Skin/${encodeURIComponent(folder)}/${encodeURIComponent(name)}`.replace(/%2F/g, '/'),
          index: Number.isFinite(num) ? num : 0
        };
      })
      .sort((a, b) => (a.index - b.index) || a.name.localeCompare(b.name));

    return res.json({ ok: true, folder, baseName, items });
  } catch (e) {
    console.error('[public:hweapon-skins] error', e);
    return res.json({ ok: true, items: [] });
  }
});

router.get('/api/admin/pictures/subtabs', requireAdmin, (req, res) => {
  res.set('Cache-Control', 'no-store');

  const category = String(req.query?.category || '').trim();
  if (!category) return res.status(400).json({ error: 'missing_category' });

  try {
    const sourceCategory = PICTURE_DYNAMIC_SUBTAB_SOURCES[category];
    if (!sourceCategory) {
      return res.json({ ok: true, category, sourceCategory: null, subtabs: [] });
    }

    const names = listDirectPictureBaseNames(sourceCategory);
    const subtabs = applyPictureOrder(names, sourceCategory);
    return res.json({ ok: true, category, sourceCategory, subtabs });
  } catch (e) {
    return res.status(400).json({ error: String(e.message || 'bad_request') });
  }
});

router.get('/api/admin/pictures/order', requireAdmin, (req, res) => {
  res.set('Cache-Control', 'no-store');

  const category = String(req.query?.category || '').trim();
  if (!category) return res.status(400).json({ error: 'missing_category' });

  try {
    const order = normalizePictureOrder(category, getGlobal(pictureOrderKey(category)));
    return res.json({ ok: true, category, order });
  } catch (e) {
    return res.status(400).json({ error: String(e.message || 'bad_request') });
  }
});

router.post(
  '/api/admin/pictures/order',
  requireAdmin,
  require('express').json({ limit: '256kb' }),
  (req, res) => {
    res.set('Cache-Control', 'no-store');

    const category = String(req.body?.category || '').trim();
    const order = req.body?.order;
    if (!category || !Array.isArray(order)) return res.status(400).json({ error: 'missing_fields' });

    try {
      const normalized = normalizePictureOrder(category, order);
      setGlobal(pictureOrderKey(category), normalized);
      return res.json({ ok: true, category, order: normalized });
    } catch (e) {
      return res.status(400).json({ error: String(e.message || 'bad_request') });
    }
  }
);

router.get('/api/admin/pictures/list', requireAdmin, (req, res) => {
  res.set('Cache-Control', 'no-store');

  const category = String(req.query?.category || '').trim();
  if (!category) return res.status(400).json({ error: 'missing_category' });

  try {
    const dir = categoryRoot(category);
    const items = listFilesRecursive(dir, dir).sort((a, b) => a.rel.localeCompare(b.rel));
    return res.json({ ok: true, category, items, root: PICTURE_ROOT });
  } catch (e) {
    return res.status(400).json({ error: String(e.message || 'bad_request') });
  }
});
// #endregion


// =====================================
// Pictures - Rename
// #region =====================================
router.post(
  '/api/admin/pictures/rename',
  requireAdmin,
  require('express').json({ limit: '64kb' }),
  (req, res) => {
    res.set('Cache-Control', 'no-store');

    const category = String(req.body?.category || '').trim();
    const fromRel  = String(req.body?.fromRel || '').trim(); // e.g. "Body/Old.png" or "Old.png"
    const toName   = String(req.body?.toName || '').trim();  // e.g. "New.png"

    if (!category || !fromRel || !toName) return res.status(400).json({ error: 'missing_fields' });

    try {
      const base = categoryRoot(category);
      const fromPath = resolveInCategory(category, fromRel);

      if (!fs.existsSync(fromPath)) return res.status(404).json({ error: 'not_found' });

      // keep same folder, change only filename
      const folderRel = path.relative(base, path.dirname(fromPath)).replace(/\\/g, '/');
      const toRel = (folderRel && folderRel !== '.' ? `${folderRel}/${toName}` : toName).replace(/\\/g, '/');
      const toPath = resolveInCategory(category, toRel);

      if (fs.existsSync(toPath)) return res.status(409).json({ error: 'target_exists' });

      fs.renameSync(fromPath, toPath);
      return res.json({ ok: true, rel: toRel });
    } catch (e) {
      return res.status(400).json({ error: String(e.message || 'bad_request') });
    }
  }
);
// #endregion


// =====================================
// Pictures - Delete
// #region =====================================
router.post(
  '/api/admin/pictures/delete',
  requireAdmin,
  require('express').json({ limit: '64kb' }),
  (req, res) => {
    res.set('Cache-Control', 'no-store');

    const category = String(req.body?.category || '').trim();
    const rel      = String(req.body?.rel || '').trim();
    if (!category || !rel) return res.status(400).json({ error: 'missing_fields' });

    try {
      const filePath = resolveInCategory(category, rel);
      if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'not_found' });

      fs.unlinkSync(filePath);
      return res.json({ ok: true });
    } catch (e) {
      return res.status(400).json({ error: String(e.message || 'bad_request') });
    }
  }
);
// #endregion


// =====================================
// Pictures - Upload
// #region =====================================
router.post(
  '/api/admin/pictures/upload',
  requireAdmin,
  (req, res, next) => {
    if (!upload) return res.status(500).json({ error: 'multer_not_installed' });
    return upload.single('file')(req, res, next);
  },
  (req, res) => {
    res.set('Cache-Control', 'no-store');

    const category = String(req.body?.category || '').trim();
    const subdir   = String(req.body?.subdir || '').trim();
    const filename = String(req.body?.filename || '').trim();
    const replace  = String(req.body?.replace || '') === '1';

    const f = req.file;
    if (!category) return res.status(400).json({ error: 'missing_category' });
    if (!f) return res.status(400).json({ error: 'missing_file' });

    try {
      const origName  = String(f.originalname || 'file.png');
      const finalName = (filename || origName).trim();
      if (!finalName) return res.status(400).json({ error: 'bad_filename' });
      if (!PICTURE_IMAGE_EXTS.has(path.extname(finalName).toLowerCase())) {
        return res.status(400).json({ error: 'bad_file_type' });
      }

      const rel = path.join(subdir || '', finalName).replace(/\\/g, '/');
      const dest = resolveInCategory(category, rel);

      ensureDirSync(path.dirname(dest));

      if (fs.existsSync(dest) && !replace) {
        return res.status(409).json({ error: 'file_exists' });
      }

      fs.writeFileSync(dest, f.buffer);
      const createdFolders = subdir ? [] : ensureDependentPictureFolders(category, finalName);
      return res.json({ ok: true, rel, createdFolders });
    } catch (e) {
      return res.status(400).json({ error: String(e.message || 'bad_request') });
    }
  }
);


// ===============================
// BLESSING STONES
// admin -> global data
// user  -> own rarity
// ===============================
const BLESSING_STONES_GLOBAL_KEY = 'sla_blessing_stones_data_v2';
const BLESSING_STONES_USER_TYPE = 'blessingStonesRarity_v1';

function blessingStonesDefaultGlobal() {
  return {
    empowerment: [],
    survival: [],
    version: 0
  };
}

function normalizeBlessingType(v) {
  const s = String(v || '').trim().toLowerCase();
  if (s === 'survival') return 'Survival';
  return 'Empowerment';
}

function normalizeBlessingRarity(v) {
  const s = String(v || '').trim().toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (s === 'rare') return 'Rare';
  if (s === 'heroic') return 'Heroic';
  if (s === 'legendary') return 'Legendary';
  if (s === 'mythic') return 'Mythic';
  return 'Do not own';
}

function normalizeBlessingText(v) {
  return String(v || '').replace(/\r\n/g, '\n').trim();
}

function normalizeBlessingStoneItem(x, fallbackType) {
  return {
    id: String(x?.id || '').trim(),
    name: String(x?.name || '').trim(),
    type: normalizeBlessingType(x?.type || fallbackType),
    image: String(x?.image || '').trim(),
    text: normalizeBlessingText(x?.text || '')
  };
}

function normalizeBlessingStonesGlobalPayload(raw) {
  const base = blessingStonesDefaultGlobal();
  if (!raw || typeof raw !== 'object') return base;

  const out = {
    empowerment: Array.isArray(raw.empowerment) ? raw.empowerment : [],
    survival: Array.isArray(raw.survival) ? raw.survival : [],
    version: Number.isFinite(+raw.version) ? +raw.version : 0
  };

  out.empowerment = out.empowerment
    .map((x) => normalizeBlessingStoneItem(x, 'Empowerment'))
    .filter((x) => x.id && x.name);

  out.survival = out.survival
    .map((x) => normalizeBlessingStoneItem(x, 'Survival'))
    .filter((x) => x.id && x.name);

  return out;
}

function normalizeBlessingRarityMap(raw) {
  const src = (raw && typeof raw === 'object') ? raw : {};
  const out = {};

  for (const [id, rarity] of Object.entries(src)) {
    const key = String(id || '').trim();
    if (!key) continue;
    out[key] = normalizeBlessingRarity(rarity);
  }

  return out;
}

function blessingIsLoggedIn(req) {
  try {
    if (typeof req.isAuthenticated === 'function' && req.isAuthenticated()) return true;
  } catch {}
  return !!req.user;
}

function blessingIsAdmin(req) {
  try {
    if (typeof isAdminReq === 'function') return !!isAdminReq(req);
  } catch {}

  try {
    if (typeof req.isAuthenticated === 'function' && req.isAuthenticated() && req.user) {
      return !!(req.user.isAdmin || req.user.admin);
    }
  } catch {}

  return !!(req.user && (req.user.isAdmin || req.user.admin));
}

function blessingGetUserRarities(userId) {
  if (!userId) return {};

  try {
    if (typeof getCollection === 'function') {
      return normalizeBlessingRarityMap(
        getCollection(userId, BLESSING_STONES_USER_TYPE) || {}
      );
    }
  } catch {}

  return {};
}

function blessingSetUserRarities(userId, rarities) {
  if (!userId) return false;

  try {
    if (typeof setCollection === 'function') {
      setCollection(userId, BLESSING_STONES_USER_TYPE, normalizeBlessingRarityMap(rarities));
      return true;
    }
  } catch {}

  return false;
}

router.get('/api/blessing-stones', (req, res) => {
  try {
    res.set('Cache-Control', 'no-store');

    const globalData = normalizeBlessingStonesGlobalPayload(
      getGlobal(BLESSING_STONES_GLOBAL_KEY)
    );

    const isLoggedIn = blessingIsLoggedIn(req);
    const isAdmin = blessingIsAdmin(req);
    const myRarities = isLoggedIn && req.user?.id
      ? blessingGetUserRarities(req.user.id)
      : {};

    res.json({
      global: globalData,
      myRarities,
      isLoggedIn,
      isAdmin
    });
  } catch (e) {
    res.status(500).json({ error: 'Failed to load blessing stones.' });
  }
});

router.post('/api/blessing-stones/admin', requireAdmin, (req, res) => {
  try {
    const incoming = normalizeBlessingStonesGlobalPayload(req.body || {});
    const next = {
      empowerment: incoming.empowerment,
      survival: incoming.survival,
      version: Date.now()
    };

    setGlobal(BLESSING_STONES_GLOBAL_KEY, next);

    const isLoggedIn = blessingIsLoggedIn(req);
    const isAdmin = blessingIsAdmin(req);
    const myRarities = isLoggedIn && req.user?.id
      ? blessingGetUserRarities(req.user.id)
      : {};

    res.json({
      global: next,
      myRarities,
      isLoggedIn,
      isAdmin
    });
  } catch (e) {
    res.status(500).json({ error: 'Failed to save blessing stones admin data.' });
  }
});

router.post('/api/blessing-stones/my-rarities', (req, res, next) => {
  if (typeof requireAuth === 'function') {
    return requireAuth(req, res, next);
  }

  if (!blessingIsLoggedIn(req)) {
    return res.status(401).json({ error: 'You must be logged in.' });
  }

  next();
}, (req, res) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: 'You must be logged in.' });
    }

    const body = req.body || {};
    const rarities = normalizeBlessingRarityMap(body.rarities || {});

    const saved = blessingSetUserRarities(req.user.id, rarities);
    if (!saved) {
      return res.status(500).json({ error: 'setCollection is not available for blessing stone rarity.' });
    }

    res.json({
      ok: true,
      myRarities: rarities,
      isLoggedIn: true,
      isAdmin: blessingIsAdmin(req)
    });
  } catch (e) {
    res.status(500).json({ error: 'Failed to save your blessing stone rarity.' });
  }
});
// #endregion


// =====================================
// Daily Reset (GLOBAL, UTC+0)
// #region =====================================
const DAILY_RESET_KEY = 'dailyResetSettings:v1';

function sanitizeDailyResetSettings(input) {
  const src = (input && typeof input === 'object') ? input : {};
  const hour = Number(src.hour);

  return {
    hour: Number.isFinite(hour) ? Math.max(0, Math.min(23, Math.floor(hour))) : 0
  };
}

function loadDailyResetSettings() {
  const raw = getGlobal(DAILY_RESET_KEY);
  return sanitizeDailyResetSettings(raw || { hour: 0 });
}

// Public — every user sees the same UTC+0 reset hour
router.get('/api/daily-reset', (req, res) => {
  res.set('Cache-Control', 'no-store');
  return res.json({
    ok: true,
    settings: loadDailyResetSettings()
  });
});

// Admin only — can change reset hour
router.post('/api/admin/daily-reset', requireAdmin, (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    const settings = sanitizeDailyResetSettings(req.body || {});
    setGlobal(DAILY_RESET_KEY, settings);

    return res.json({
      ok: true,
      settings
    });
  } catch (e) {
    console.error('[POST /api/admin/daily-reset] error', e);
    return res.status(500).json({ error: 'internal' });
  }
});

// #endregion


// =====================================
// SUNG WEAPON GLOBAL STATS (GLOBAL for ALL USERS)
// #region =====================================
const SUNG_WEAPON_GLOBAL_STATS_KEY = 'sla_sung_weapon_global_stats_v1';

function defaultSungWeaponAdvBonusTexts() {
  return {
    '1': '',
    '2': '',
    '3': '',
    '4': '',
    '5': ''
  };
}

function sungWeaponGlobalStatsDefault() {
  return {
    levelMin: 0,
    levelMax: 120,
    rarities: {
      SSR: {
        attack: { min: 400, max: 3080 },
        hp: { min: 400, max: 4650 },
        precision: { min: 0, max: 4000 },
        advBonusTexts: defaultSungWeaponAdvBonusTexts()
      },
      SR: {
        attack: { min: 250, max: 1700 },
        hp: { min: 250, max: 2550 },
        precision: { min: 0, max: 2000 },
        advBonusTexts: defaultSungWeaponAdvBonusTexts()
      },
      R: {
        attack: { min: 150, max: 1530 },
        hp: { min: 150, max: 2295 },
        precision: { min: 0, max: 1250 },
        advBonusTexts: defaultSungWeaponAdvBonusTexts()
      }
    }
  };
}

function sanitizeSungWeaponGlobalStats(input) {
  const src = (input && typeof input === 'object') ? input : {};
  const def = sungWeaponGlobalStatsDefault();

  const clampInt = (v, min, max, fallback) => {
    const n = Number(v);
    return Number.isFinite(n)
      ? Math.max(min, Math.min(max, Math.floor(n)))
      : fallback;
  };

  const readMinMax = (block, fallback) => {
    const b = (block && typeof block === 'object') ? block : {};
    return {
      min: clampInt(b.min, 0, 999999, fallback.min),
      max: clampInt(b.max, 0, 999999, fallback.max)
    };
  };

  const readAdvBonusTexts = (block, fallback) => {
    const b = (block && typeof block === 'object') ? block : {};
    return {
      '1': String(b['1'] ?? fallback['1'] ?? ''),
      '2': String(b['2'] ?? fallback['2'] ?? ''),
      '3': String(b['3'] ?? fallback['3'] ?? ''),
      '4': String(b['4'] ?? fallback['4'] ?? ''),
      '5': String(b['5'] ?? fallback['5'] ?? '')
    };
  };

  const readRarity = (rarityKey) => {
    const raw = (src.rarities && typeof src.rarities === 'object') ? src.rarities[rarityKey] : {};
    const fallback = def.rarities[rarityKey];
    return {
      attack: readMinMax(raw?.attack, fallback.attack),
      hp: readMinMax(raw?.hp, fallback.hp),
      precision: readMinMax(raw?.precision, fallback.precision),
      advBonusTexts: readAdvBonusTexts(raw?.advBonusTexts, fallback.advBonusTexts)
    };
  };

  const levelMin = clampInt(src.levelMin, 0, 999, def.levelMin);
  const levelMax = clampInt(src.levelMax, levelMin, 999, def.levelMax);

  return {
    levelMin,
    levelMax,
    rarities: {
      SSR: readRarity('SSR'),
      SR: readRarity('SR'),
      R: readRarity('R')
    }
  };
}

function readSungWeaponGlobalStats() {
  const raw = getGlobal(SUNG_WEAPON_GLOBAL_STATS_KEY);
  return sanitizeSungWeaponGlobalStats(raw || {});
}

router.get('/api/public/sweapon-global-stats', (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    return res.json({ ok: true, stats: readSungWeaponGlobalStats() });
  } catch (e) {
    console.error('[public:sweapon-global-stats] error', e);
    return res.status(500).json({ error: 'internal' });
  }
});

router.post('/api/admin/sweapon-global-stats', requireAdmin, (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    const incoming = (req.body?.stats && typeof req.body.stats === 'object')
      ? req.body.stats
      : req.body;

    const stats = sanitizeSungWeaponGlobalStats(incoming || {});
    setGlobal(SUNG_WEAPON_GLOBAL_STATS_KEY, stats);

    return res.json({ ok: true, stats });
  } catch (e) {
    console.error('[admin:sweapon-global-stats] error', e);
    return res.status(500).json({ error: 'internal' });
  }
});
// #endregion


// =====================================
// SUNG WEAPON DETAILS (GLOBAL for ALL USERS)
// #region =====================================
const SUNG_WEAPON_DETAILS_KEY = 'sla_sung_weapon_details_v1';

function defaultSungWeaponSkillSet() {
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

function defaultSungWeaponDetailsLevel() {
  return {
    lvl: '',
    adv: '',
    totalPower: '',
    statLabel: 'Attack',
    statValue: '',
    precision: '',
    blocks: [],
    skills: defaultSungWeaponSkillSet()
  };
}

function sanitizeSungWeaponStatLabel(v) {
  const s = String(v || '').trim().toLowerCase();
  if (s === 'hp') return 'HP';
  if (s === 'precision') return 'Precision';
  return 'Attack';
}

function sanitizeSungWeaponSkillItem(input, fallbackName = '') {
  const src = (input && typeof input === 'object') ? input : {};

  return {
    name: String(src.name || fallbackName || '').trim(),
    text: String(src.text || '')
  };
}

function sanitizeSungWeaponSkills(input) {
  const src = (input && typeof input === 'object') ? input : {};
  const base = defaultSungWeaponSkillSet();

  base.basic = sanitizeSungWeaponSkillItem(src.basic, 'Basic Attack');
  base.core = sanitizeSungWeaponSkillItem(src.core, 'Core Attack');
  base.third = sanitizeSungWeaponSkillItem(src.third, '');

  // zabezpieczenie żeby basic/core zawsze miały stałe nazwy
  base.basic.name = 'Basic Attack';
  base.core.name = 'Core Attack';

  return base;
}

function sanitizeSungWeaponBlock(input) {
  const src = (input && typeof input === 'object') ? input : {};
  const type = String(src.type || '').trim().toLowerCase() === 'image' ? 'image' : 'text';

  if (type === 'image') {
    return {
      type: 'image',
      image: String(src.image || '').trim(),
      title: String(src.title || ''),
      text: String(src.text || ''),
      color: String(src.color || 'additional').trim().toLowerCase() || 'additional'
    };
  }

  return {
    type: 'text',
    text: String(src.text || '')
  };
}

function sanitizeSungWeaponDetailsLevel(input) {
  const src = (input && typeof input === 'object') ? input : {};
  const base = defaultSungWeaponDetailsLevel();

  base.lvl = (src.lvl == null) ? '' : String(src.lvl);
  base.adv = (src.adv == null) ? '' : String(src.adv);
  base.totalPower = (src.totalPower == null) ? '' : String(src.totalPower);
  base.statLabel = sanitizeSungWeaponStatLabel(src.statLabel);
  base.statValue = (src.statValue == null) ? '' : String(src.statValue);
  base.precision = (src.precision == null) ? '' : String(src.precision);
  base.blocks = Array.isArray(src.blocks) ? src.blocks.map(sanitizeSungWeaponBlock) : [];
  base.skills = sanitizeSungWeaponSkills(src.skills);

  return base;
}

function sanitizeSungWeaponDetailsEntry(input) {
  const src = (input && typeof input === 'object') ? input : {};
  const rawDetails = (src.details && typeof src.details === 'object') ? src.details : src;
  const details = {};

  for (let i = 1; i <= 11; i++) {
    details[String(i)] = sanitizeSungWeaponDetailsLevel(rawDetails[String(i)]);
  }

  return { details };
}

function readSungWeaponDetailsStore() {
  const raw = getGlobal(SUNG_WEAPON_DETAILS_KEY);
  return (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};
}

router.get('/api/public/sung-weapon-details', (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    const store = readSungWeaponDetailsStore();
    const name = String(req.query?.name || '').trim();

    if (name) {
      const item = sanitizeSungWeaponDetailsEntry(store[name] || {});
      return res.json({ ok: true, name, item });
    }

    const items = {};
    for (const [key, value] of Object.entries(store)) {
      items[key] = sanitizeSungWeaponDetailsEntry(value);
    }

    return res.json({ ok: true, items });
  } catch (e) {
    console.error('[public:sung-weapon-details] error', e);
    return res.status(500).json({ error: 'internal' });
  }
});

router.post('/api/admin/sung-weapon-details', requireAdmin, (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Missing weapon name' });

    const store = readSungWeaponDetailsStore();
    store[name] = sanitizeSungWeaponDetailsEntry(req.body?.details || req.body || {});
    setGlobal(SUNG_WEAPON_DETAILS_KEY, store);

    return res.json({ ok: true, name, item: store[name] });
  } catch (e) {
    console.error('[admin:sung-weapon-details] error', e);
    return res.status(500).json({ error: 'internal' });
  }
});

router.get('/api/public/sweapon-skins', (req, res) => {
  res.set('Cache-Control', 'no-store');

  try {
    const folder = safeSeg(req.query?.folder || req.query?.weapon || '');
    const baseName = String(req.query?.baseName || '').trim();

    if (!folder) {
      return res.status(400).json({ error: 'missing_folder' });
    }

    const dir = resolveInCategory('SGWeapon_Skin', folder);
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
      return res.json({ ok: true, folder, baseName, items: [] });
    }

    const allowedExt = new Set(['.png', '.webp', '.jpg', '.jpeg', '.gif']);

    let files = fs.readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .filter((name) => allowedExt.has(path.extname(name).toLowerCase()));

    if (baseName) {
      const lowerBase = baseName.toLowerCase();
      files = files.filter((name) => {
        const noExt = name.replace(/\.[^.]+$/i, '').toLowerCase();
        return noExt === lowerBase || noExt.startsWith(lowerBase);
      });
    }

    files.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

    const items = files.map((name) => ({
      name,
      url: `/picture/SGWeapon_Skin/${folder}/${encodeURIComponent(name)}`
    }));

    return res.json({ ok: true, folder, baseName, items });
  } catch (e) {
    console.error('[public:sweapon-skins] error', e);
    return res.status(500).json({ error: 'internal' });
  }
});
// #endregion


// =====================================
// HUNTER GLOBAL STATS (GLOBAL for ALL USERS)
// #region =====================================
const HUNTER_GLOBAL_STATS_KEY = 'sla_hunter_global_stats_v1';

function hunterGlobalStatsDefault() {
  const levelMaxFromDropdowns = getGlobal(HUNTERS_DROPDOWNS_KEY)?.levelMax;
  const safeLevelMax = Number.isFinite(+levelMaxFromDropdowns)
    ? Math.max(1, Math.min(999, Math.floor(+levelMaxFromDropdowns)))
    : 100;

  return {
    levelMin: 1,
    levelMax: safeLevelMax,
    advancementMin: 0,
    advancementMax: 5
  };
}

function sanitizeHunterMainStat(v) {
  const s = String(v || '').trim().toLowerCase();
  if (s === 'defense' || s === 'def') return 'defense';
  if (s === 'hp' || s === 'health') return 'hp';
  return 'attack';
}

function sanitizeHunterGlobalStats(input) {
  const src = (input && typeof input === 'object') ? input : {};
  const def = hunterGlobalStatsDefault();

  const clampInt = (v, min, max, fallback) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.floor(n))) : fallback;
  };

  const levelMin = clampInt(src.levelMin ?? src.level_min, 1, 999, def.levelMin);
  const levelMax = clampInt(src.levelMax ?? src.level_max, levelMin, 999, def.levelMax);
  const advancementMin = clampInt(src.advancementMin ?? src.advancement_min, 0, 999, def.advancementMin);
  const advancementMax = clampInt(src.advancementMax ?? src.advancement_max, advancementMin, 999, def.advancementMax);

  return {
    levelMin,
    levelMax,
    advancementMin,
    advancementMax
  };
}

function readHunterGlobalStats() {
  const raw = getGlobal(HUNTER_GLOBAL_STATS_KEY);
  return sanitizeHunterGlobalStats(raw || {});
}

router.get('/api/public/hunter-global-stats', (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    return res.json({ ok: true, stats: readHunterGlobalStats() });
  } catch (e) {
    console.error('[public:hunter-global-stats] error', e);
    return res.status(500).json({ error: 'internal' });
  }
});

router.post('/api/admin/hunter-global-stats', requireAdmin, (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    const incoming = (req.body?.stats && typeof req.body.stats === 'object') ? req.body.stats : req.body;
    const stats = sanitizeHunterGlobalStats(incoming || {});

    setGlobal(HUNTER_GLOBAL_STATS_KEY, stats);

    const currentDropdownRaw = getGlobal(HUNTERS_DROPDOWNS_KEY) || DEFAULT_HUNTERS_DROPDOWNS;
    const mergedDropdown = sanitizeHuntersDropdownsConfig({
      ...currentDropdownRaw,
      levelMax: stats.levelMax
    });
    setGlobal(HUNTERS_DROPDOWNS_KEY, mergedDropdown);

    return res.json({ ok: true, stats, dropdowns: mergedDropdown });
  } catch (e) {
    console.error('[admin:hunter-global-stats] error', e);
    return res.status(500).json({ error: 'internal' });
  }
});
// #endregion

// =====================================
// HUNTER DETAILS (GLOBAL for ALL USERS)
// #region =====================================
const HUNTER_DETAILS_KEY = 'sla_hunter_details_v1';

function defaultHunterDetailsEntry() {
  return {
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
    global_stats: hunterGlobalStatsDefault()
  };
}

function sanitizeHunterStatRel(v) {
  const s = String(v || '').trim();
  if (!s) return '';
  return s.startsWith('Stats/') ? s : `Stats/${s.replace(/^\/+/, '')}`;
}

function sanitizeHunterDetailsEntry(input) {
  const src = (input && typeof input === 'object') ? input : {};
  const raw = (src.details && typeof src.details === 'object') ? src.details : src;
  const base = defaultHunterDetailsEntry();

  base.guild = String(raw.guild || '').trim();
  base.mainStat = sanitizeHunterMainStat(raw.mainStat);

  base.recommendedStatsMin = (Array.isArray(raw.recommendedStatsMin) ? raw.recommendedStatsMin : [])
    .slice(0, 3)
    .map(sanitizeHunterStatRel);
  while (base.recommendedStatsMin.length < 3) base.recommendedStatsMin.push('');

  base.recommendedStatsMax = (Array.isArray(raw.recommendedStatsMax) ? raw.recommendedStatsMax : [])
    .slice(0, 3)
    .map(sanitizeHunterStatRel);
  while (base.recommendedStatsMax.length < 3) base.recommendedStatsMax.push('');

  base.attackMin = raw.attackMin == null ? '' : String(raw.attackMin);
  base.attackMax = raw.attackMax == null ? '' : String(raw.attackMax);
  base.defenseMin = raw.defenseMin == null ? '' : String(raw.defenseMin);
  base.defenseMax = raw.defenseMax == null ? '' : String(raw.defenseMax);
  base.hpMin = raw.hpMin == null ? '' : String(raw.hpMin);
  base.hpMax = raw.hpMax == null ? '' : String(raw.hpMax);
  base.tpMin = raw.tpMin == null ? '' : String(raw.tpMin);
  base.tpMax = raw.tpMax == null ? '' : String(raw.tpMax);

  base.global_stats = sanitizeHunterGlobalStats(
    raw.global_stats ||
    src.global_stats ||
    {}
  );

  return { details: base };
}

function readHunterDetailsStore() {
  const raw = getGlobal(HUNTER_DETAILS_KEY);
  return (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};
}

router.get('/api/public/hunter-details', (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    const store = readHunterDetailsStore();
    const name = String(req.query?.name || '').trim();

    if (name) {
      const item = sanitizeHunterDetailsEntry(store[name] || {});
      return res.json({ ok: true, name, item });
    }

    const items = {};
    for (const [key, value] of Object.entries(store)) {
      items[key] = sanitizeHunterDetailsEntry(value);
    }

    return res.json({ ok: true, items });
  } catch (e) {
    console.error('[public:hunter-details] error', e);
    return res.status(500).json({ error: 'internal' });
  }
});

router.post('/api/admin/hunter-details', requireAdmin, (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Missing hunter name' });

    const store = readHunterDetailsStore();
    store[name] = sanitizeHunterDetailsEntry(req.body?.details || req.body || {});
    setGlobal(HUNTER_DETAILS_KEY, store);

    return res.json({ ok: true, name, item: store[name] });
  } catch (e) {
    console.error('[admin:hunter-details] error', e);
    return res.status(500).json({ error: 'internal' });
  }
});
// #endregion


module.exports = router;
