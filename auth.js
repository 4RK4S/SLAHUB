// auth.js
'use strict';

const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const { upsertUser, getUserById, ensureProfile } = require('./db');
require('dotenv').config();

const DISCORD_SCOPES = ['identify', 'email'];

passport.serializeUser((user, done) => done(null, user.id));

passport.deserializeUser((id, done) => {
  try {
    const user = getUserById(id);
    done(null, user || null);
  } catch (e) {
    done(e);
  }
});

function verifyDiscord(accessToken, refreshToken, profile, done) {
  try {
    const avatar = profile.avatar
      ? `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png`
      : null;

    const row = upsertUser({
      discordId: String(profile.id),
      username: profile.username || profile.global_name || `user_${profile.id}`,
      avatar,
      email: profile.email || null,
      createdAt: new Date().toISOString(),
    });

    ensureProfile(row.id);
    return done(null, row);
  } catch (e) {
    return done(e);
  }
}

const clientID = process.env.DISCORD_CLIENT_ID;
const clientSecret = process.env.DISCORD_CLIENT_SECRET;

if (!clientID || !clientSecret) {
  console.error('[auth] Missing DISCORD_CLIENT_ID / DISCORD_CLIENT_SECRET in env.');
}

// 1) Strategia dla DOMENY (HTTPS)
passport.use('discord_domain', new DiscordStrategy(
  {
    clientID,
    clientSecret,
    callbackURL:
      process.env.DISCORD_CALLBACK_DOMAIN ||
      `${process.env.BASE_URL}/auth/discord/callback`,
    scope: DISCORD_SCOPES,
  },
  verifyDiscord
));

// 2) Strategia dla IP:8090 (HTTP)
passport.use('discord_ip', new DiscordStrategy(
  {
    clientID,
    clientSecret,
    callbackURL:
      process.env.DISCORD_CALLBACK_IP ||
      `${process.env.BASE_URL}/auth/discord/callback`,
    scope: DISCORD_SCOPES,
  },
  verifyDiscord
));

// (opcjonalnie) alias "discord" -> domena, żeby stare rzeczy nie wywaliły się
passport.use('discord', new DiscordStrategy(
  {
    clientID,
    clientSecret,
    callbackURL:
      process.env.DISCORD_CALLBACK_DOMAIN ||
      `${process.env.BASE_URL}/auth/discord/callback`,
    scope: DISCORD_SCOPES,
  },
  verifyDiscord
));
