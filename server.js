// server.js
'use strict';

const express = require('express');
const session = require('express-session');
const passport = require('passport');
const path = require('path');
const fs = require('fs'); // ✅ NEW
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const apiRoutes = require('./routes/api');
require('./auth');

const app = express();

const PORT     = process.env.PORT || 8089;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

// BASE_PATH: pusty string = root
const rawBase = (process.env.BASE_PATH === undefined) ? '/slahub' : String(process.env.BASE_PATH);
let BASE_PATH = rawBase.trim();

if (BASE_PATH === '' || BASE_PATH === '/') {
  BASE_PATH = '';
} else {
  if (!BASE_PATH.startsWith('/')) BASE_PATH = `/${BASE_PATH}`;
  BASE_PATH = BASE_PATH.replace(/\/+$/, '');
}

app.set('trust proxy', 1);

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

const SESSION_SECRET = process.env.SESSION_SECRET || uuidv4();

// COOKIE_SECURE:
// - "true"/"1"  => zawsze secure
// - "false"/""  => nigdy secure
// - "auto"      => secure tylko gdy HTTPS
const COOKIE_SECURE_RAW = String(process.env.COOKIE_SECURE || '').trim().toLowerCase();
const COOKIE_SECURE_MODE =
  (COOKIE_SECURE_RAW === 'auto') ? 'auto' : (/^(1|true)$/i.test(COOKIE_SECURE_RAW) ? true : false);

// express-session chce boolean w cookie.secure, więc przy "auto" ustawiamy false,
// a potem middlewarem podbijamy na HTTPS requestach.
app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 1000 * 60 * 60 * 24 * 7,
      httpOnly: true,
      sameSite: 'lax',
      secure: (COOKIE_SECURE_MODE === 'auto') ? false : COOKIE_SECURE_MODE,
    },
    name: 'connect.sid',
  })
);

// COOKIE_SECURE=auto -> HTTPS requesty dostają secure cookie
if (COOKIE_SECURE_MODE === 'auto') {
  app.use((req, _res, next) => {
    try {
      if (req.session && req.secure) req.session.cookie.secure = true;
    } catch {}
    next();
  });
}

app.use(passport.initialize());
app.use(passport.session());

// ──────────────────────────────────────────────────────────────────────────────
// Auth routing (2 strategie)
// ─────────────────────────────────────────────────────────────────────────────-

function pickDiscordStrategy(req) {
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').trim().toLowerCase();

  // IP test (wystarczy, że zawiera :8090 albo zaczyna się od IP)
  if (host.includes(':8090') || host.startsWith('57.129.141.175')) return 'discord_ip';

  // reszta -> domena
  return 'discord_domain';
}

app.get('/auth/discord', (req, res, next) => {
  const strat = pickDiscordStrategy(req);
  req.session.oauth_strategy = strat;
  return passport.authenticate(strat)(req, res, next);
});

app.get('/auth/discord/callback',
  (req, res, next) => {
    const strat = req.session.oauth_strategy || pickDiscordStrategy(req);
    return passport.authenticate(strat, { failureRedirect: '/login' })(req, res, next);
  },
  (_req, res) => res.redirect('/')
);

// (opcjonalnie) logout
app.get('/auth/logout', (req, res) => {
  if (typeof req.logout === 'function') {
    req.logout(() => {
      if (req.session) req.session.destroy(() => res.redirect('/login'));
      else res.redirect('/login');
    });
  } else {
    res.redirect('/login');
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// Static
// ─────────────────────────────────────────────────────────────────────────────-
const staticOpts = {
  setHeaders(res, filePath) {
    const name = path.basename(filePath);

    if (name === 'manifest.json' || name === 'service-worker.js') {
      res.setHeader('Cache-Control', 'no-store, max-age=0');
      if (name === 'service-worker.js') {
        res.setHeader('Service-Worker-Allowed', '/');
      }
    } else if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-store, max-age=0');
      res.setHeader('X-Robots-Tag', 'index, follow');
    } else {
      res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
    }
  },
};

// ✅ NEW: pick correct picture root (supports ./picture and ./public/picture)
function findPictureRoot() {
  const candidates = [
    path.join(__dirname, 'picture'),
    path.join(__dirname, 'public', 'picture'),
    path.join(process.cwd(), 'picture'),
    path.join(process.cwd(), 'public', 'picture'),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p) && fs.statSync(p).isDirectory()) return p;
    } catch {}
  }
  return candidates[0];
}
const PICTURE_ROOT = findPictureRoot();
console.log('[static] /picture ->', PICTURE_ROOT);

app.use(express.static(path.join(__dirname, 'public'), staticOpts));
app.use('/data', express.static(path.join(__dirname, 'data'), { maxAge: '1d' }));

// ✅ NEW: serve /picture/*
app.use('/picture', express.static(PICTURE_ROOT, { maxAge: '7d' }));

// kompatybilność, gdybyś wrócił do BASE_PATH
if (BASE_PATH) {
  app.use(BASE_PATH, express.static(path.join(__dirname, 'public'), staticOpts));
  app.use(`${BASE_PATH}/data`, express.static(path.join(__dirname, 'data'), { maxAge: '1d' }));

  // ✅ NEW: BASE_PATH + /picture
  app.use(`${BASE_PATH}/picture`, express.static(PICTURE_ROOT, { maxAge: '7d' }));
}

// Creator tool
app.use('/creator-tool', express.static('/home/ubuntu/Creator_Code', {
  index: 'index.html',
  setHeaders(res, filePath) {
    if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-store, max-age=0');
    else res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
  }
}));

// Healthcheck
app.get('/healthz', (_req, res) => res.json({ ok: true }));

// ──────────────────────────────────────────────────────────────────────────────
// SPA fallback (MUSI BYĆ PRZED apiRoutes)
// ─────────────────────────────────────────────────────────────────────────────-
function isAssetRequest(reqPath) {
  return Boolean(path.extname(reqPath));
}

function spaFallback(req, res, next) {
  if (req.method !== 'GET') return next();

  const p = req.path;

  // przepuść backendowe rzeczy
  if (p.startsWith('/api') || p === '/api') return next();
  if (p.startsWith('/auth') || p === '/auth') return next();
  if (p.startsWith('/data') || p === '/data') return next();
  if (p.startsWith('/creator-tool') || p === '/creator-tool') return next();
  if (p === '/picture' || p.startsWith('/picture/')) return next(); // ✅ NEW

  // jeśli ktoś trafi po staremu przez BASE_PATH
  if (BASE_PATH) {
    if (p.startsWith(`${BASE_PATH}/api`) || p === `${BASE_PATH}/api`) return next();
    if (p.startsWith(`${BASE_PATH}/auth`) || p === `${BASE_PATH}/auth`) return next();
    if (p.startsWith(`${BASE_PATH}/data`) || p === `${BASE_PATH}/data`) return next();
    if (p === `${BASE_PATH}/picture` || p.startsWith(`${BASE_PATH}/picture/`)) return next(); // ✅ NEW
  }

  if (isAssetRequest(p)) return next();

  return res.sendFile(path.join(__dirname, 'public', 'index.html'));
}

app.get('*', spaFallback);

// ──────────────────────────────────────────────────────────────────────────────
// API routes
// ─────────────────────────────────────────────────────────────────────────────-
app.use('/', apiRoutes);
if (BASE_PATH) app.use(BASE_PATH, apiRoutes);

// ─────────────────────────────────────────────────────────────────────────────-
app.listen(PORT, () => {
  console.log(`SLA Hub running on ${BASE_URL}`);
  console.log('ADMINS from .env:', process.env.ADMINS);
  console.log('BASE_PATH:', BASE_PATH || '(root)');
  console.log('PORT:', PORT);

  console.log('COOKIE_SECURE mode:', COOKIE_SECURE_MODE);

  console.log('DISCORD_CALLBACK_DOMAIN:', process.env.DISCORD_CALLBACK_DOMAIN || '(not set)');
  console.log('DISCORD_CALLBACK_IP:', process.env.DISCORD_CALLBACK_IP || '(not set)');
});
