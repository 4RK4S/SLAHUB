# SLA Hub

SLA Hub is a community web hub for Solo Leveling: ARISE. It combines a static frontend, an Express backend, Discord OAuth login, and a local SQLite database into one place for game data, builds, guides, posts, and player tools.

The project is built as a practical fan-site/dashboard: users can browse game resources, check detailed item and character pages, manage profile-related data, and access admin or creator-code tools depending on permissions.

## Features

### Game Catalogs

SLA Hub includes browsable catalogs for major game resources, including hunters, hunter weapons, Sung Jinwoo weapons, shadows, successors, blessing stones, cores, gems, artifacts, events, and special commission content. These sections are backed by local data and image assets so the site can present game information with matching visuals.

### Detail Pages

Many catalog entries have dedicated detail views. These pages are designed to show richer information for a selected character, weapon, shadow, successor, or item instead of only listing it in a grid. The `picture` folder stores the visual assets used across those views.

### Builds System

The project contains a build system for storing and displaying player builds. There is also an `import-builds.js` helper script, which suggests that build data can be imported or refreshed from external/local sources instead of being entered only by hand.

### Posts, News, and Roadmaps

SLA Hub supports posts, latest updates, roadmap content, and synchronization-related endpoints. This makes the site useful not only as a static database, but also as a place for ongoing updates, announcements, and game-related article content.

### Player Tools

The frontend includes several utility sections such as tier lists, calculators, PvP pages, events, suggestions, and a mini game. These modules make the hub more interactive and give users quick access to tools around progression, comparison, and planning.

### User Accounts

Authentication is handled through Discord OAuth using Passport. After logging in, users can have a profile/dashboard experience, while selected Discord IDs can receive additional permissions through environment configuration.

### Admin Panel

The project includes an admin area for managing selected parts of the application. Admin access is controlled through configured Discord user IDs and related permission checks in the backend.

### Creator-Code Integration

SLA Hub can connect to a separate creator-code service through a configured bot/API endpoint. This is controlled through environment variables such as `CREATOR_URL`, `CREATOR_BOT_API_URL`, `CREATOR_BOT_API_SECRET`, and `CREATOR_ALLOW`.

## Tech Stack

- Node.js
- Express
- better-sqlite3
- Passport
- passport-discord
- dotenv
- Static frontend files in `public`
- Local image/assets directory in `picture`

## Requirements

- Node.js 18 or newer
- npm
- A Discord application for OAuth login

## Installation

```bash
npm install
```

Copy the example environment file:

```bash
cp .env.example .env
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Then fill `.env` with your real Discord OAuth credentials, session secret, public URL, and optional integration settings.

## Running the App

```bash
npm start
```

By default, the app runs on the port defined by `PORT`, or `8089` when no port is provided.

Local example:

```text
http://localhost:8089
```

## Environment Variables

| Variable | Description |
| --- | --- |
| `PORT` | Express server port. |
| `BASE_URL` | Public app URL, used for redirects and OAuth callbacks. |
| `BASE_PATH` | Optional base path, for example `/slahub`; empty means root. |
| `SESSION_SECRET` | Express session secret. Use a long private value in production. |
| `DISCORD_CLIENT_ID` | Discord application client ID. |
| `DISCORD_CLIENT_SECRET` | Discord application client secret. |
| `DISCORD_CALLBACK_DOMAIN` | Optional OAuth callback URL for the domain strategy. |
| `DISCORD_CALLBACK_IP` | Optional OAuth callback URL for the IP strategy. |
| `COOKIE_SECURE` | `true`, `false`, or `auto` for session cookies. |
| `ADMINS` | Comma-separated Discord user IDs with admin access. |
| `CREATOR_ALLOW` | Comma-separated Discord user IDs allowed to use creator-code features. |
| `CREATOR_URL` | Path or URL for the creator-code tool. |
| `ALLOWED_PUBLIC_HOSTS` | Comma-separated public hosts allowed by the app. |
| `POSTS_FULLSYNC_KEY` | Secret key for full post synchronization endpoints. |
| `CREATOR_BOT_API_URL` | API URL for the creator-code bot/service. |
| `CREATOR_BOT_API_SECRET` | Shared secret for the creator-code bot/service. |

## Project Structure

```text
.
|-- server.js          # Express server, static files, auth routes, and SPA fallback
|-- auth.js            # Passport and Discord OAuth configuration
|-- db.js              # SQLite connection, migrations, and data helpers
|-- routes/
|   `-- api.js         # Main API endpoints
|-- public/            # Frontend application files
|-- picture/           # Image assets used by the frontend
|-- nic/               # Local helper notes/files
|-- .env.example       # Example environment configuration
`-- package.json       # npm scripts and dependencies
```

## Database

The app uses a local SQLite database file named `app.db`. SQLite may also create helper files such as `app.db-wal` and `app.db-shm` while the app is running.

These database files contain local application state. If you need to move data to another machine or server, create a separate database backup and restore it there.
