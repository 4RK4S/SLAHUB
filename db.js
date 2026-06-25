// db.js
const BetterSqlite3 = require('better-sqlite3');
const path = require('path');

const db = new BetterSqlite3(path.join(__dirname, 'app.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

// =====================================================
// HELPERS
// =====================================================
function safeParse(str, fallback = null) {
  try { return JSON.parse(str); } catch { return fallback; }
}

function safeStringify(val, fallback = '{}') {
  try { return JSON.stringify(val ?? null); } catch { return fallback; }
}

function escLikePrefix(prefix) {
  return String(prefix ?? '').replace(/([%_\\])/g, '\\$1');
}

function _s(v) {
  return String(v ?? '').trim();
}

function boolToInt(v, fallback = 0) {
  if (v === undefined || v === null) return fallback;
  return v ? 1 : 0;
}

function toIsoOrNull(v) {
  if (!v) return null;
  try {
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString();
  } catch {
    return null;
  }
}

function nowIso() {
  return new Date().toISOString();
}

function ensureColumn(table, column, sql) {
  try {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all();
    const hasCol = cols.some(c => c.name === column);
    if (!hasCol) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${sql};`);
    }
  } catch (e) {
    console.error(`DB migration failed (${table}.${column}):`, e);
  }
}

function ensureIndex(sql) {
  try { db.exec(sql); } catch (e) { console.error('DB index migration failed:', e); }
}

// =====================================================
// POSTS HELPERS
// =====================================================
function normalizePostRow(row) {
  if (!row) return null;
  return {
    ...row,
    id: row.id == null ? null : Number(row.id),
    menuSeq: row.menuSeq == null ? null : Number(row.menuSeq),
    articleId: row.articleId == null ? null : Number(row.articleId),
    isPublished: !!row.isPublished,
    hasDetail: !!row.hasDetail,
    hiddenFromPosts: !!row.hiddenFromPosts,
    images: safeParse(row.images, []),
    youtubeEmbeds: safeParse(row.youtubeEmbeds, [])
  };
}

function mapPosts(rows = []) {
  return rows.map(normalizePostRow);
}

function makePostSourceUniqueKey(post = {}) {
  const source = _s(post.source).toLowerCase();

  if (source === 'netmarble') {
    const menuSeq = _s(post.menuSeq ?? post?.netmarble?.menuSeq);
    const articleId = _s(post.articleId ?? post?.netmarble?.articleId ?? post.sourcePostId);
    if (menuSeq && articleId) return `netmarble:${menuSeq}:${articleId}`;
  }

  if (source === 'website') {
    const id = _s(post.sourcePostId || post.id || post.slug);
    if (id) return `website:${id}`;
  }

  const fallback = _s(post.slug) || `post:${Date.now()}`;
  return `${source || 'unknown'}:${fallback}`;
}

function normalizePostInput(post = {}) {
  const now = nowIso();

  const source = _s(post.source).toLowerCase() || 'website';
  const slug = _s(post.slug);
  const title = _s(post.title) || 'Untitled Post';

  const menuSeq = post.menuSeq ?? post?.netmarble?.menuSeq ?? null;
  const articleId = post.articleId ?? post?.netmarble?.articleId ?? null;

  const images = Array.isArray(post.images) ? post.images.map(_s).filter(Boolean) : [];
  const youtubeEmbeds = Array.isArray(post.youtubeEmbeds) ? post.youtubeEmbeds.map(_s).filter(Boolean) : [];

  const contentHtml = _s(post.contentHtml);
  const contentText = _s(post.contentText);
  const hasDetail = !!(contentHtml || contentText || youtubeEmbeds.length);

  const publishedAt = toIsoOrNull(post.publishedAt) || now;
  const updatedAt = toIsoOrNull(post.updatedAt) || publishedAt;
  const detailFetchedAt = hasDetail
    ? (toIsoOrNull(post.detailFetchedAt) || now)
    : toIsoOrNull(post.detailFetchedAt);

  const sourceUniqueKey = _s(post.sourceUniqueKey) || makePostSourceUniqueKey({
    ...post,
    source,
    menuSeq,
    articleId
  });

  return {
    sourceUniqueKey,
    source,
    sourcePostId: _s(post.sourcePostId || articleId || post.id || slug),
    menuSeq: menuSeq == null || menuSeq === '' ? null : Number(menuSeq),
    articleId: articleId == null || articleId === '' ? null : Number(articleId),
    slug,
    sourceUrl: _s(post.sourceUrl),
    category: _s(post.category),
    categoryKey: _s(post.categoryKey).toLowerCase(),
    title,
    excerpt: _s(post.excerpt),
    contentText,
    contentHtml,
    images: safeStringify(images, '[]'),
    youtubeEmbeds: safeStringify(youtubeEmbeds, '[]'),
    author: _s(post.author),
    publishedAt,
    updatedAt,
    detailFetchedAt,
    lastSyncedAt: toIsoOrNull(post.lastSyncedAt) || now,
    syncStatus: _s(post.syncStatus) || 'synced',
    isPublished: boolToInt(post.isPublished !== false, 1),
    hasDetail: boolToInt(hasDetail, 0),
    hiddenFromPosts: boolToInt(!!post.hiddenFromPosts, 0),
    createdAt: toIsoOrNull(post.createdAt) || now,
    localUpdatedAt: now
  };
}

function buildPostsWhere({
  source = 'all',
  categoryKey = 'all',
  q = '',
  onlyPublished = true,
  excludeHidden = true
} = {}) {
  const where = [];
  const params = {};

  if (onlyPublished) where.push(`p.isPublished = 1`);
  if (excludeHidden) where.push(`COALESCE(p.hiddenFromPosts, 0) = 0`);

  const sourceNorm = _s(source).toLowerCase();
  if (sourceNorm && sourceNorm !== 'all') {
    where.push(`LOWER(p.source) = @source`);
    params.source = sourceNorm;
  }

  const catNorm = _s(categoryKey).toLowerCase();
  if (catNorm && catNorm !== 'all') {
    where.push(`LOWER(COALESCE(p.categoryKey, '')) = @categoryKey`);
    params.categoryKey = catNorm;
  }

  const qNorm = _s(q);
  if (qNorm) {
    where.push(`
      (
        p.title LIKE @q
        OR p.excerpt LIKE @q
        OR p.author LIKE @q
        OR p.category LIKE @q
        OR p.categoryKey LIKE @q
        OR p.slug LIKE @q
      )
    `);
    params.q = `%${qNorm}%`;
  }

  return {
    whereSql: where.length ? `WHERE ${where.join(' AND ')}` : '',
    params
  };
}

// =====================================================
// TABLES
// =====================================================
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  discordId TEXT UNIQUE NOT NULL,
  username TEXT NOT NULL,
  avatar TEXT,
  email TEXT,
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS profiles (
  userId INTEGER PRIMARY KEY,
  displayName TEXT,
  visibility TEXT NOT NULL DEFAULT 'public',
  email TEXT,
  FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS collections (
  userId INTEGER NOT NULL,
  type TEXT NOT NULL,
  data TEXT NOT NULL,
  PRIMARY KEY (userId, type),
  FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_visits (
  userId INTEGER PRIMARY KEY,
  visits INTEGER NOT NULL DEFAULT 0,
  updatedAt TEXT NOT NULL,
  FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS globals (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sourceUniqueKey TEXT NOT NULL UNIQUE,
  source TEXT NOT NULL,
  sourcePostId TEXT,
  menuSeq INTEGER,
  articleId INTEGER,
  slug TEXT NOT NULL UNIQUE,
  sourceUrl TEXT,
  category TEXT,
  categoryKey TEXT,
  title TEXT NOT NULL,
  excerpt TEXT,
  contentText TEXT,
  contentHtml TEXT,
  images TEXT NOT NULL DEFAULT '[]',
  youtubeEmbeds TEXT NOT NULL DEFAULT '[]',
  author TEXT,
  publishedAt TEXT,
  updatedAt TEXT,
  detailFetchedAt TEXT,
  lastSyncedAt TEXT,
  syncStatus TEXT NOT NULL DEFAULT 'synced',
  isPublished INTEGER NOT NULL DEFAULT 1,
  hasDetail INTEGER NOT NULL DEFAULT 0,
  hiddenFromPosts INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL,
  localUpdatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS posts_sync_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- GENERIC CATALOG STORAGE (ready for hunters / weapons /
-- shadows / sung weapons / oracle / events / locations)
-- =====================================================
CREATE TABLE IF NOT EXISTS catalog_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  catalog TEXT NOT NULL,
  itemKey TEXT NOT NULL,
  slug TEXT,
  name TEXT,
  groupKey TEXT,
  orderNo INTEGER NOT NULL DEFAULT 0,
  isEnabled INTEGER NOT NULL DEFAULT 1,
  isDeleted INTEGER NOT NULL DEFAULT 0,
  data TEXT NOT NULL DEFAULT '{}',
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  UNIQUE(catalog, itemKey)
);

CREATE TABLE IF NOT EXISTS catalog_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  catalog TEXT NOT NULL,
  parentKey TEXT NOT NULL,
  childKey TEXT NOT NULL,
  relation TEXT NOT NULL DEFAULT 'default',
  orderNo INTEGER NOT NULL DEFAULT 0,
  data TEXT NOT NULL DEFAULT '{}',
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  UNIQUE(catalog, parentKey, childKey, relation)
);
`);

// =====================================================
// INDEXES
// =====================================================
ensureIndex(`CREATE INDEX IF NOT EXISTS idx_users_discordId ON users(discordId)`);
ensureIndex(`CREATE INDEX IF NOT EXISTS idx_profiles_displayName ON profiles(displayName)`);
ensureIndex(`CREATE INDEX IF NOT EXISTS idx_collections_type ON collections(type)`);
ensureIndex(`CREATE INDEX IF NOT EXISTS idx_globals_key ON globals(key)`);
ensureIndex(`CREATE INDEX IF NOT EXISTS idx_posts_slug ON posts(slug)`);
ensureIndex(`CREATE INDEX IF NOT EXISTS idx_posts_sourceUniqueKey ON posts(sourceUniqueKey)`);
ensureIndex(`CREATE INDEX IF NOT EXISTS idx_posts_source ON posts(source)`);
ensureIndex(`CREATE INDEX IF NOT EXISTS idx_posts_categoryKey ON posts(categoryKey)`);
ensureIndex(`CREATE INDEX IF NOT EXISTS idx_posts_isPublished ON posts(isPublished)`);
ensureIndex(`CREATE INDEX IF NOT EXISTS idx_posts_publishedAt ON posts(publishedAt DESC)`);
ensureIndex(`CREATE INDEX IF NOT EXISTS idx_posts_source_publishedAt ON posts(source, publishedAt DESC)`);
ensureIndex(`CREATE INDEX IF NOT EXISTS idx_posts_category_publishedAt ON posts(categoryKey, publishedAt DESC)`);
ensureIndex(`CREATE INDEX IF NOT EXISTS idx_posts_hasDetail ON posts(hasDetail)`);
ensureIndex(`CREATE INDEX IF NOT EXISTS idx_posts_lastSyncedAt ON posts(lastSyncedAt DESC)`);
ensureIndex(`CREATE INDEX IF NOT EXISTS idx_catalog_items_catalog_order ON catalog_items(catalog, orderNo, id)`);
ensureIndex(`CREATE INDEX IF NOT EXISTS idx_catalog_items_catalog_slug ON catalog_items(catalog, slug)`);
ensureIndex(`CREATE INDEX IF NOT EXISTS idx_catalog_items_catalog_name ON catalog_items(catalog, name)`);
ensureIndex(`CREATE INDEX IF NOT EXISTS idx_catalog_links_catalog_parent_order ON catalog_links(catalog, parentKey, relation, orderNo, id)`);

// =====================================================
// SAFETY MIGRATIONS
// =====================================================
ensureColumn('users', 'email', 'email TEXT');
ensureColumn('profiles', 'email', 'email TEXT');
ensureColumn('user_visits', 'updatedAt', 'updatedAt TEXT');
try {
  db.exec(`UPDATE user_visits SET updatedAt = CURRENT_TIMESTAMP WHERE updatedAt IS NULL OR TRIM(updatedAt) = '';`);
} catch (e) {
  console.error('DB migration failed (user_visits.updatedAt backfill):', e);
}

ensureColumn('globals', 'updatedAt', 'updatedAt TEXT');
try {
  db.exec(`UPDATE globals SET updatedAt = CURRENT_TIMESTAMP WHERE updatedAt IS NULL OR TRIM(updatedAt) = '';`);
} catch (e) {
  console.error('DB migration failed (globals.updatedAt backfill):', e);
}

ensureColumn('posts_sync_state', 'updatedAt', 'updatedAt TEXT');
try {
  db.exec(`UPDATE posts_sync_state SET updatedAt = CURRENT_TIMESTAMP WHERE updatedAt IS NULL OR TRIM(updatedAt) = '';`);
} catch (e) {
  console.error('DB migration failed (posts_sync_state.updatedAt backfill):', e);
}

ensureColumn('posts', 'sourceUniqueKey', 'sourceUniqueKey TEXT');
ensureColumn('posts', 'source', 'source TEXT');
ensureColumn('posts', 'sourcePostId', 'sourcePostId TEXT');
ensureColumn('posts', 'menuSeq', 'menuSeq INTEGER');
ensureColumn('posts', 'articleId', 'articleId INTEGER');
ensureColumn('posts', 'slug', 'slug TEXT');
ensureColumn('posts', 'sourceUrl', 'sourceUrl TEXT');
ensureColumn('posts', 'category', 'category TEXT');
ensureColumn('posts', 'categoryKey', 'categoryKey TEXT');
ensureColumn('posts', 'title', 'title TEXT');
ensureColumn('posts', 'excerpt', 'excerpt TEXT');
ensureColumn('posts', 'contentText', 'contentText TEXT');
ensureColumn('posts', 'contentHtml', 'contentHtml TEXT');
ensureColumn('posts', 'images', `images TEXT NOT NULL DEFAULT '[]'`);
ensureColumn('posts', 'youtubeEmbeds', `youtubeEmbeds TEXT NOT NULL DEFAULT '[]'`);
ensureColumn('posts', 'author', 'author TEXT');
ensureColumn('posts', 'publishedAt', 'publishedAt TEXT');
ensureColumn('posts', 'updatedAt', 'updatedAt TEXT');
ensureColumn('posts', 'detailFetchedAt', 'detailFetchedAt TEXT');
ensureColumn('posts', 'lastSyncedAt', 'lastSyncedAt TEXT');
ensureColumn('posts', 'syncStatus', `syncStatus TEXT NOT NULL DEFAULT 'synced'`);
ensureColumn('posts', 'isPublished', 'isPublished INTEGER NOT NULL DEFAULT 1');
ensureColumn('posts', 'hasDetail', 'hasDetail INTEGER NOT NULL DEFAULT 0');
ensureColumn('posts', 'hiddenFromPosts', 'hiddenFromPosts INTEGER NOT NULL DEFAULT 0');
ensureColumn('posts', 'createdAt', 'createdAt TEXT');
ensureColumn('posts', 'localUpdatedAt', 'localUpdatedAt TEXT');

try {
  const rows = db.prepare(`
    SELECT id, source, sourcePostId, menuSeq, articleId, slug
    FROM posts
    WHERE sourceUniqueKey IS NULL OR TRIM(sourceUniqueKey) = ''
  `).all();

  if (rows.length) {
    const fillStmt = db.prepare(`
      UPDATE posts
      SET sourceUniqueKey = @sourceUniqueKey
      WHERE id = @id
    `);

    const tx = db.transaction((items) => {
      for (const row of items) {
        fillStmt.run({
          id: row.id,
          sourceUniqueKey: makePostSourceUniqueKey(row)
        });
      }
    });

    tx(rows);
  }
} catch (e) {
  console.error('DB migration failed (posts.sourceUniqueKey backfill):', e);
}

// =====================================================
// USERS / PROFILES / COLLECTIONS / GLOBALS
// =====================================================
const upsertUserStmt = db.prepare(`
INSERT INTO users (discordId, username, avatar, email, createdAt)
VALUES (@discordId, @username, @avatar, @email, @createdAt)
ON CONFLICT(discordId) DO UPDATE SET
  username = excluded.username,
  avatar   = excluded.avatar,
  email    = COALESCE(excluded.email, users.email)
RETURNING *;
`);

const getUserByIdStmt = db.prepare(`SELECT * FROM users WHERE id = ?`);
const getUserByDiscordStmt = db.prepare(`SELECT * FROM users WHERE discordId = ?`);

const ensureProfileStmt = db.prepare(`
INSERT INTO profiles (userId, displayName, visibility, email)
VALUES (?, NULL, 'public', NULL)
ON CONFLICT(userId) DO NOTHING
`);

const getProfileStmt = db.prepare(`SELECT * FROM profiles WHERE userId = ?`);

const updateProfileStmt = db.prepare(`
UPDATE profiles
SET displayName = @displayName,
    visibility  = @visibility,
    email       = COALESCE(@email, email)
WHERE userId = @userId
`);

const isDisplayNameTakenStmt = db.prepare(`
SELECT 1 FROM profiles
WHERE displayName = ? AND userId <> ?
LIMIT 1
`);

const getCollectionStmt = db.prepare(`
SELECT data FROM collections
WHERE userId = ? AND type = ?
`);

const setCollectionStmt = db.prepare(`
INSERT INTO collections (userId, type, data)
VALUES (@userId, @type, @data)
ON CONFLICT(userId, type) DO UPDATE SET
  data = excluded.data
`);

const deleteCollectionStmt = db.prepare(`
DELETE FROM collections
WHERE userId = ? AND type = ?
`);

const getGlobalStmt = db.prepare(`
SELECT value FROM globals
WHERE key = ?
`);

const setGlobalStmt = db.prepare(`
INSERT INTO globals (key, value, updatedAt)
VALUES (@key, @value, @updatedAt)
ON CONFLICT(key) DO UPDATE SET
  value = excluded.value,
  updatedAt = excluded.updatedAt
`);

const deleteGlobalStmt = db.prepare(`
DELETE FROM globals
WHERE key = ?
`);

const listGlobalsByPrefixStmt = db.prepare(`
SELECT key, value
FROM globals
WHERE key LIKE ? ESCAPE '\\'
ORDER BY key ASC
`);

const listCollectionsByTypePublicStmt = db.prepare(`
SELECT c.userId, c.data
FROM collections c
JOIN profiles p ON p.userId = c.userId
WHERE c.type = ?
  AND COALESCE(p.visibility, 'public') = 'public'
ORDER BY c.userId ASC
`);

const searchUsersStmt = db.prepare(`
SELECT
  u.id,
  u.discordId,
  u.username,
  u.avatar,
  u.createdAt,
  p.displayName,
  p.visibility
FROM users u
LEFT JOIN profiles p ON p.userId = u.id
WHERE
  u.username LIKE @q
  OR COALESCE(p.displayName, '') LIKE @q
ORDER BY datetime(u.createdAt) DESC, u.id DESC
LIMIT 25
`);

const listMembersStmt = db.prepare(`
SELECT
  u.id,
  u.discordId,
  u.username,
  u.avatar,
  u.createdAt,
  p.displayName,
  COALESCE(p.visibility, 'public') AS visibility,
  COALESCE(v.visits, 0) AS visits
FROM users u
LEFT JOIN profiles p ON p.userId = u.id
LEFT JOIN user_visits v ON v.userId = u.id
WHERE COALESCE(p.visibility, 'public') = 'public'
  AND (
    @q = ''
    OR u.username LIKE @q
    OR COALESCE(p.displayName, '') LIKE @q
  )
ORDER BY datetime(u.createdAt) DESC, u.id DESC
LIMIT @limit OFFSET @offset
`);

const countMembersStmt = db.prepare(`
SELECT COUNT(1) AS n
FROM users u
LEFT JOIN profiles p ON p.userId = u.id
WHERE COALESCE(p.visibility, 'public') = 'public'
  AND (
    @q = ''
    OR u.username LIKE @q
    OR COALESCE(p.displayName, '') LIKE @q
  )
`);

// =====================================================
// VISITS
// =====================================================
const getVisitsStmt = db.prepare(`
SELECT visits
FROM user_visits
WHERE userId = ?
`);

const touchVisitsStmt = db.prepare(`
INSERT INTO user_visits (userId, visits, updatedAt)
VALUES (@userId, @visits, @updatedAt)
ON CONFLICT(userId) DO UPDATE SET
  visits = excluded.visits,
  updatedAt = excluded.updatedAt
`);

function getVisits(userId) {
  const row = getVisitsStmt.get(userId);
  return Number(row?.visits || 0);
}

function incVisits(userId) {
  const next = getVisits(userId) + 1;
  touchVisitsStmt.run({
    userId,
    visits: next,
    updatedAt: nowIso()
  });
  return next;
}

// =====================================================
// POSTS
// =====================================================
const upsertPostStmt = db.prepare(`
INSERT INTO posts (
  sourceUniqueKey,
  source,
  sourcePostId,
  menuSeq,
  articleId,
  slug,
  sourceUrl,
  category,
  categoryKey,
  title,
  excerpt,
  contentText,
  contentHtml,
  images,
  youtubeEmbeds,
  author,
  publishedAt,
  updatedAt,
  detailFetchedAt,
  lastSyncedAt,
  syncStatus,
  isPublished,
  hasDetail,
  hiddenFromPosts,
  createdAt,
  localUpdatedAt
) VALUES (
  @sourceUniqueKey,
  @source,
  @sourcePostId,
  @menuSeq,
  @articleId,
  @slug,
  @sourceUrl,
  @category,
  @categoryKey,
  @title,
  @excerpt,
  @contentText,
  @contentHtml,
  @images,
  @youtubeEmbeds,
  @author,
  @publishedAt,
  @updatedAt,
  @detailFetchedAt,
  @lastSyncedAt,
  @syncStatus,
  @isPublished,
  @hasDetail,
  @hiddenFromPosts,
  @createdAt,
  @localUpdatedAt
)
ON CONFLICT(sourceUniqueKey) DO UPDATE SET
  source         = excluded.source,
  sourcePostId   = excluded.sourcePostId,
  menuSeq        = excluded.menuSeq,
  articleId      = excluded.articleId,
  slug           = excluded.slug,
  sourceUrl      = excluded.sourceUrl,
  category       = excluded.category,
  categoryKey    = excluded.categoryKey,
  title          = excluded.title,
  excerpt        = excluded.excerpt,
  contentText    = excluded.contentText,
  contentHtml    = excluded.contentHtml,
  images         = excluded.images,
  youtubeEmbeds  = excluded.youtubeEmbeds,
  author         = excluded.author,
  publishedAt    = excluded.publishedAt,
  updatedAt      = excluded.updatedAt,
  detailFetchedAt= excluded.detailFetchedAt,
  lastSyncedAt   = excluded.lastSyncedAt,
  syncStatus     = excluded.syncStatus,
  isPublished    = excluded.isPublished,
  hasDetail      = excluded.hasDetail,
  hiddenFromPosts= excluded.hiddenFromPosts,
  localUpdatedAt = excluded.localUpdatedAt
RETURNING *;
`);

const getPostBySlugStmt = db.prepare(`
SELECT *
FROM posts
WHERE slug = ?
LIMIT 1
`);

const markPostDetailFetchedBySlugStmt = db.prepare(`
UPDATE posts
SET
  detailFetchedAt = @detailFetchedAt,
  hasDetail = CASE
    WHEN COALESCE(TRIM(@contentText), '') <> ''
      OR COALESCE(TRIM(@contentHtml), '') <> ''
      OR COALESCE(TRIM(@youtubeEmbeds), '[]') <> '[]'
    THEN 1 ELSE hasDetail
  END,
  contentText = CASE
    WHEN @contentText IS NULL THEN contentText ELSE @contentText
  END,
  contentHtml = CASE
    WHEN @contentHtml IS NULL THEN contentHtml ELSE @contentHtml
  END,
  youtubeEmbeds = CASE
    WHEN @youtubeEmbeds IS NULL THEN youtubeEmbeds ELSE @youtubeEmbeds
  END,
  localUpdatedAt = @localUpdatedAt
WHERE slug = @slug
`);

const touchPostsSyncStateStmt = db.prepare(`
INSERT INTO posts_sync_state (key, value, updatedAt)
VALUES (@key, @value, @updatedAt)
ON CONFLICT(key) DO UPDATE SET
  value = excluded.value,
  updatedAt = excluded.updatedAt
`);

const getPostsSyncStateStmt = db.prepare(`
SELECT value FROM posts_sync_state
WHERE key = ?
`);

function upsertPost(post) {
  const row = upsertPostStmt.get(normalizePostInput(post));
  return normalizePostRow(row);
}

function upsertPosts(posts = []) {
  const arr = Array.isArray(posts) ? posts : [];
  const tx = db.transaction((items) => {
    const out = [];
    for (const item of items) out.push(upsertPost(item));
    return out;
  });
  return tx(arr);
}

function getPostBySlug(slug) {
  return normalizePostRow(getPostBySlugStmt.get(slug));
}

function listPosts({
  page = 1,
  pageSize = 12,
  source = 'all',
  categoryKey = 'all',
  q = '',
  onlyPublished = true,
  excludeHidden = true
} = {}) {
  const safePage = Math.max(1, Number(page) || 1);
  const safePageSize = Math.max(1, Math.min(100, Number(pageSize) || 12));
  const offset = (safePage - 1) * safePageSize;

  const { whereSql, params } = buildPostsWhere({
    source,
    categoryKey,
    q,
    onlyPublished,
    excludeHidden
  });

  const rows = db.prepare(`
    SELECT *
    FROM posts p
    ${whereSql}
    ORDER BY datetime(COALESCE(p.publishedAt, p.createdAt)) DESC, p.id DESC
    LIMIT @limit OFFSET @offset
  `).all({
    ...params,
    limit: safePageSize,
    offset
  });

  const totalRow = db.prepare(`
    SELECT COUNT(1) AS n
    FROM posts p
    ${whereSql}
  `).get(params);

  return {
    items: mapPosts(rows),
    page: safePage,
    pageSize: safePageSize,
    totalItems: Number(totalRow?.n || 0),
    totalPages: Math.max(1, Math.ceil(Number(totalRow?.n || 0) / safePageSize))
  };
}

function listLatestPosts({
  limit = 12,
  source = 'all',
  categoryKey = 'all',
  onlyPublished = true,
  excludeHidden = true
} = {}) {
  const size = Math.max(1, Math.min(100, Number(limit) || 12));
  const { whereSql, params } = buildPostsWhere({
    source,
    categoryKey,
    q: '',
    onlyPublished,
    excludeHidden
  });

  const rows = db.prepare(`
    SELECT *
    FROM posts p
    ${whereSql}
    ORDER BY datetime(COALESCE(p.publishedAt, p.createdAt)) DESC, p.id DESC
    LIMIT @limit
  `).all({
    ...params,
    limit: size
  });

  return mapPosts(rows);
}

function getPostCounts({
  source = 'all',
  q = '',
  onlyPublished = true,
  excludeHidden = true
} = {}) {
  const { whereSql, params } = buildPostsWhere({
    source,
    categoryKey: 'all',
    q,
    onlyPublished,
    excludeHidden
  });

  const rows = db.prepare(`
    SELECT
      LOWER(COALESCE(p.categoryKey, 'uncategorized')) AS categoryKey,
      COUNT(1) AS n
    FROM posts p
    ${whereSql}
    GROUP BY LOWER(COALESCE(p.categoryKey, 'uncategorized'))
  `).all(params);

  const totalRow = db.prepare(`
    SELECT COUNT(1) AS n
    FROM posts p
    ${whereSql}
  `).get(params);

  const counts = {
    all: Number(totalRow?.n || 0)
  };

  for (const row of rows) {
    counts[_s(row.categoryKey).toLowerCase() || 'uncategorized'] = Number(row.n || 0);
  }

  return counts;
}

function getPostsMeta({
  source = 'all',
  q = '',
  onlyPublished = true
} = {}) {
  const counts = getPostCounts({ source, q, onlyPublished });
  const latestRow = db.prepare(`
    SELECT MAX(lastSyncedAt) AS lastSyncAt
    FROM posts
  `).get();

  return {
    counts,
    lastSyncAt: latestRow?.lastSyncAt || null
  };
}

function listPostsMissingDetail({
  limit = 100,
  source = 'all',
  categoryKey = 'all',
  onlyPublished = false
} = {}) {
  const size = Math.max(1, Math.min(500, Number(limit) || 100));
  const { whereSql, params } = buildPostsWhere({ source, categoryKey, q: '', onlyPublished });

  const extraWhere = whereSql
    ? `${whereSql} AND p.hasDetail = 0`
    : `WHERE p.hasDetail = 0`;

  const rows = db.prepare(`
    SELECT *
    FROM posts p
    ${extraWhere}
    ORDER BY datetime(COALESCE(p.publishedAt, p.createdAt)) DESC, p.id DESC
    LIMIT @limit
  `).all({
    ...params,
    limit: size
  });

  return mapPosts(rows);
}

function getNewestPostsByCategoryKey(categoryKey, limit = 12) {
  const size = Math.max(1, Math.min(100, Number(limit) || 12));
  const rows = db.prepare(`
    SELECT *
    FROM posts
    WHERE isPublished = 1
      AND LOWER(categoryKey) = LOWER(?)
      AND COALESCE(hiddenFromPosts, 0) = 0
    ORDER BY datetime(COALESCE(publishedAt, createdAt)) DESC, id DESC
    LIMIT ?
  `).all(categoryKey, size);

  return mapPosts(rows);
}

function setPostsSyncState(key, value) {
  return touchPostsSyncStateStmt.run({
    key,
    value: JSON.stringify(value ?? null),
    updatedAt: nowIso()
  });
}

function getPostsSyncState(key, fallback = null) {
  const row = getPostsSyncStateStmt.get(key);
  return row ? safeParse(row.value, fallback) : fallback;
}

function markPostDetailFetchedBySlug(slug, payload = {}) {
  const youtubeEmbeds =
    payload.youtubeEmbeds == null
      ? null
      : safeStringify(Array.isArray(payload.youtubeEmbeds) ? payload.youtubeEmbeds : [], '[]');

  return markPostDetailFetchedBySlugStmt.run({
    slug: _s(slug),
    detailFetchedAt: toIsoOrNull(payload.detailFetchedAt) || nowIso(),
    contentText: payload.contentText == null ? null : String(payload.contentText),
    contentHtml: payload.contentHtml == null ? null : String(payload.contentHtml),
    youtubeEmbeds,
    localUpdatedAt: nowIso()
  });
}

// =====================================================
// GENERIC CATALOG API
// Use this for: hunters / hunter_weapons / shadows / sung_weapons
// / oracle_slots / oracle_substats / events / special_commission_*
/* ===================================================== */
const upsertCatalogItemStmt = db.prepare(`
INSERT INTO catalog_items (
  catalog, itemKey, slug, name, groupKey, orderNo,
  isEnabled, isDeleted, data, createdAt, updatedAt
) VALUES (
  @catalog, @itemKey, @slug, @name, @groupKey, @orderNo,
  @isEnabled, @isDeleted, @data, @createdAt, @updatedAt
)
ON CONFLICT(catalog, itemKey) DO UPDATE SET
  slug      = excluded.slug,
  name      = excluded.name,
  groupKey  = excluded.groupKey,
  orderNo   = excluded.orderNo,
  isEnabled = excluded.isEnabled,
  isDeleted = excluded.isDeleted,
  data      = excluded.data,
  updatedAt = excluded.updatedAt
RETURNING *;
`);

const getCatalogItemStmt = db.prepare(`
SELECT *
FROM catalog_items
WHERE catalog = @catalog
  AND itemKey = @itemKey
LIMIT 1
`);

const getCatalogItemBySlugStmt = db.prepare(`
SELECT *
FROM catalog_items
WHERE catalog = @catalog
  AND slug = @slug
LIMIT 1
`);

const deleteCatalogItemStmt = db.prepare(`
DELETE FROM catalog_items
WHERE catalog = ? AND itemKey = ?
`);

const listCatalogItemsBase = `
SELECT *
FROM catalog_items
WHERE catalog = @catalog
  AND (@includeDeleted = 1 OR isDeleted = 0)
  AND (@onlyEnabled = 0 OR isEnabled = 1)
  AND (
    @groupKey = ''
    OR COALESCE(groupKey, '') = @groupKey
  )
  AND (
    @q = ''
    OR COALESCE(name, '') LIKE @q
    OR COALESCE(itemKey, '') LIKE @q
    OR COALESCE(slug, '') LIKE @q
  )
ORDER BY orderNo ASC, id ASC
`;

const listCatalogItemsStmt = db.prepare(listCatalogItemsBase);

const upsertCatalogLinkStmt = db.prepare(`
INSERT INTO catalog_links (
  catalog, parentKey, childKey, relation, orderNo, data, createdAt, updatedAt
) VALUES (
  @catalog, @parentKey, @childKey, @relation, @orderNo, @data, @createdAt, @updatedAt
)
ON CONFLICT(catalog, parentKey, childKey, relation) DO UPDATE SET
  orderNo   = excluded.orderNo,
  data      = excluded.data,
  updatedAt = excluded.updatedAt
RETURNING *;
`);

const listCatalogLinksStmt = db.prepare(`
SELECT *
FROM catalog_links
WHERE catalog = @catalog
  AND (@parentKey = '' OR parentKey = @parentKey)
  AND (@childKey = '' OR childKey = @childKey)
  AND (@relation = '' OR relation = @relation)
ORDER BY orderNo ASC, id ASC
`);

const deleteCatalogLinkStmt = db.prepare(`
DELETE FROM catalog_links
WHERE catalog = @catalog
  AND parentKey = @parentKey
  AND childKey = @childKey
  AND relation = @relation
`);

function normalizeCatalogItemInput(input = {}) {
  const now = nowIso();
  return {
    catalog: _s(input.catalog).toLowerCase(),
    itemKey: _s(input.itemKey),
    slug: _s(input.slug) || null,
    name: _s(input.name) || null,
    groupKey: _s(input.groupKey) || null,
    orderNo: Number.isFinite(Number(input.orderNo)) ? Math.floor(Number(input.orderNo)) : 0,
    isEnabled: boolToInt(input.isEnabled !== false, 1),
    isDeleted: boolToInt(!!input.isDeleted, 0),
    data: safeStringify(input.data ?? {}, '{}'),
    createdAt: toIsoOrNull(input.createdAt) || now,
    updatedAt: now
  };
}

function normalizeCatalogItemRow(row) {
  if (!row) return null;
  return {
    ...row,
    id: Number(row.id),
    orderNo: Number(row.orderNo || 0),
    isEnabled: !!row.isEnabled,
    isDeleted: !!row.isDeleted,
    data: safeParse(row.data, {})
  };
}

function normalizeCatalogLinkInput(input = {}) {
  const now = nowIso();
  return {
    catalog: _s(input.catalog).toLowerCase(),
    parentKey: _s(input.parentKey),
    childKey: _s(input.childKey),
    relation: _s(input.relation) || 'default',
    orderNo: Number.isFinite(Number(input.orderNo)) ? Math.floor(Number(input.orderNo)) : 0,
    data: safeStringify(input.data ?? {}, '{}'),
    createdAt: toIsoOrNull(input.createdAt) || now,
    updatedAt: now
  };
}

function normalizeCatalogLinkRow(row) {
  if (!row) return null;
  return {
    ...row,
    id: Number(row.id),
    orderNo: Number(row.orderNo || 0),
    data: safeParse(row.data, {})
  };
}

function upsertCatalogItem(input) {
  const row = upsertCatalogItemStmt.get(normalizeCatalogItemInput(input));
  return normalizeCatalogItemRow(row);
}

function getCatalogItem(catalog, itemKey) {
  return normalizeCatalogItemRow(
    getCatalogItemStmt.get({
      catalog: _s(catalog).toLowerCase(),
      itemKey: _s(itemKey)
    })
  );
}

function getCatalogItemBySlug(catalog, slug) {
  return normalizeCatalogItemRow(
    getCatalogItemBySlugStmt.get({
      catalog: _s(catalog).toLowerCase(),
      slug: _s(slug)
    })
  );
}

function listCatalogItems({
  catalog,
  q = '',
  groupKey = '',
  onlyEnabled = false,
  includeDeleted = false
} = {}) {
  const rows = listCatalogItemsStmt.all({
    catalog: _s(catalog).toLowerCase(),
    q: _s(q) ? `%${_s(q)}%` : '',
    groupKey: _s(groupKey),
    onlyEnabled: onlyEnabled ? 1 : 0,
    includeDeleted: includeDeleted ? 1 : 0
  });
  return rows.map(normalizeCatalogItemRow);
}

function deleteCatalogItem(catalog, itemKey) {
  return deleteCatalogItemStmt.run(_s(catalog).toLowerCase(), _s(itemKey));
}

function upsertCatalogItems(catalog, items = []) {
  const tx = db.transaction((catalogName, arr) => {
    const out = [];
    for (const item of arr) {
      out.push(upsertCatalogItem({ ...item, catalog: catalogName }));
    }
    return out;
  });
  return tx(_s(catalog).toLowerCase(), Array.isArray(items) ? items : []);
}

function replaceCatalog(catalog, items = []) {
  const catalogName = _s(catalog).toLowerCase();
  const tx = db.transaction((catalogNameInner, arr) => {
    db.prepare(`DELETE FROM catalog_items WHERE catalog = ?`).run(catalogNameInner);
    const out = [];
    for (const item of arr) {
      out.push(upsertCatalogItem({ ...item, catalog: catalogNameInner }));
    }
    return out;
  });
  return tx(catalogName, Array.isArray(items) ? items : []);
}

function upsertCatalogLink(input) {
  const row = upsertCatalogLinkStmt.get(normalizeCatalogLinkInput(input));
  return normalizeCatalogLinkRow(row);
}

function listCatalogLinks({
  catalog,
  parentKey = '',
  childKey = '',
  relation = ''
} = {}) {
  const rows = listCatalogLinksStmt.all({
    catalog: _s(catalog).toLowerCase(),
    parentKey: _s(parentKey),
    childKey: _s(childKey),
    relation: _s(relation)
  });
  return rows.map(normalizeCatalogLinkRow);
}

function deleteCatalogLink(catalog, parentKey, childKey, relation = 'default') {
  return deleteCatalogLinkStmt.run({
    catalog: _s(catalog).toLowerCase(),
    parentKey: _s(parentKey),
    childKey: _s(childKey),
    relation: _s(relation) || 'default'
  });
}

function replaceCatalogLinks(catalog, links = []) {
  const catalogName = _s(catalog).toLowerCase();
  const tx = db.transaction((catalogNameInner, arr) => {
    db.prepare(`DELETE FROM catalog_links WHERE catalog = ?`).run(catalogNameInner);
    const out = [];
    for (const link of arr) {
      out.push(upsertCatalogLink({ ...link, catalog: catalogNameInner }));
    }
    return out;
  });
  return tx(catalogName, Array.isArray(links) ? links : []);
}

// =====================================================
// EXPORTS
// =====================================================
module.exports = {
  db,

  // Users
  upsertUser: (u) => upsertUserStmt.get({
    discordId: _s(u?.discordId),
    username: _s(u?.username) || 'Unknown',
    avatar: _s(u?.avatar) || null,
    email: _s(u?.email) || null,
    createdAt: toIsoOrNull(u?.createdAt) || nowIso()
  }),
  getUserById: (id) => getUserByIdStmt.get(id),
  getUserByDiscord: (discordId) => getUserByDiscordStmt.get(discordId),

  // Visits
  getVisits,
  incVisits,

  // Profiles
  ensureProfile: (userId) => ensureProfileStmt.run(userId),
  getProfile: (userId) => getProfileStmt.get(userId),
  updateProfile: (payload) => updateProfileStmt.run({
    userId: Number(payload?.userId),
    displayName: payload?.displayName == null ? null : String(payload.displayName),
    visibility: _s(payload?.visibility) || 'public',
    email: payload?.email == null ? null : String(payload.email)
  }),

  isDisplayNameTaken: (name, exceptUserId) => {
    const row = isDisplayNameTakenStmt.get(name, exceptUserId);
    return !!row;
  },

  // Collections
  getCollection: (userId, type) => {
    const r = getCollectionStmt.get(userId, type);
    return r ? safeParse(r.data, {}) : {};
  },

  setCollection: (userId, type, data) => {
    return setCollectionStmt.run({
      userId,
      type,
      data: JSON.stringify(data ?? {})
    });
  },

  deleteCollection: (userId, type) => deleteCollectionStmt.run(userId, type),

  searchUsers: (q) => searchUsersStmt.all({ q: `%${_s(q)}%` }),

  // Members / Community
  listMembers: ({ q = '', limit = 12, offset = 0 }) =>
    listMembersStmt.all({
      q: _s(q) ? `%${_s(q)}%` : '',
      limit: Math.max(1, Math.min(200, Number(limit) || 12)),
      offset: Math.max(0, Number(offset) || 0)
    }),

  countMembers: ({ q = '' }) =>
    Number(countMembersStmt.get({ q: _s(q) ? `%${_s(q)}%` : '' })?.n || 0),

  // Globals
  getGlobal: (key) => {
    const r = getGlobalStmt.get(key);
    return r ? safeParse(r.value, null) : null;
  },

  setGlobal: (key, val) => {
    return setGlobalStmt.run({
      key,
      value: JSON.stringify(val),
      updatedAt: nowIso()
    });
  },

  deleteGlobal: (key) => deleteGlobalStmt.run(key),

  listGlobalsByPrefix: (prefix) => {
    const esc = escLikePrefix(prefix);
    return listGlobalsByPrefixStmt.all(`${esc}%`);
  },

  getGlobalsByPrefix: (prefix) => {
    const esc = escLikePrefix(prefix);
    return listGlobalsByPrefixStmt
      .all(`${esc}%`)
      .map(r => ({ key: r.key, value: safeParse(r.value, {}) }));
  },

  listCollectionsByTypePublic: (type) => {
    return listCollectionsByTypePublicStmt
      .all(type)
      .map(r => ({ userId: r.userId, data: safeParse(r.data, {}) }));
  },

  // Posts
  upsertPost,
  upsertPosts,
  getPostBySlug,
  listPosts,
  listLatestPosts,
  getPostCounts,
  getPostsMeta,
  listPostsMissingDetail,
  getNewestPostsByCategoryKey,
  setPostsSyncState,
  getPostsSyncState,
  markPostDetailFetchedBySlug,

  // Generic catalogs
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
  replaceCatalogLinks,

  // helpers if needed elsewhere
  safeParse,
  safeStringify
};
