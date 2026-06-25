# SLA Hub

SLA Hub to aplikacja webowa dla spolecznosci Solo Leveling: ARISE. Projekt laczy statyczny frontend, backend Express, logowanie przez Discord OAuth i lokalna baze SQLite. Strona sluzy jako hub z poradnikami, katalogami, buildami, postami i narzedziami pomocniczymi dla graczy.

## Co zawiera projekt

- katalog hunterow, broni, shadow, successorow, blessing stones, cores, gems i artifactow
- szczegolowe widoki elementow z grafikami i danymi z bazy
- system buildow oraz import buildow z pliku/skryptu pomocniczego
- posty, aktualnosci i roadmapy z mozliwoscia synchronizacji danych
- sekcje PvP, tier list, kalkulatory, eventy i minigra
- panel administratora oraz dashboard uzytkownika
- logowanie Discord OAuth przez Passport
- integracje creator-code przez osobny endpoint/API
- statyczne zasoby graficzne w katalogu `picture`

## Wymagania

- Node.js 18 lub nowszy
- npm
- Konto/aplikacja Discord do OAuth

## Instalacja

```bash
npm install
```

Skopiuj przykladowa konfiguracje:

```bash
cp .env.example .env
```

Na Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Uzupelnij `.env` prawdziwymi wartosciami dla Discord OAuth, sesji i adresu publicznego.

## Uruchomienie

```bash
npm start
```

Domyslnie aplikacja startuje na porcie z `PORT` albo `8089`.

Przyklad lokalnego adresu:

```text
http://localhost:8089
```

## Najwazniejsze zmienne `.env`

| Zmienna | Opis |
| --- | --- |
| `PORT` | Port serwera Express. |
| `BASE_URL` | Publiczny adres aplikacji, uzywany m.in. przy OAuth. |
| `BASE_PATH` | Opcjonalna sciezka bazowa, np. `/slahub`; pusta wartosc oznacza root. |
| `SESSION_SECRET` | Sekret sesji Express. Powinien byc dlugi i prywatny. |
| `DISCORD_CLIENT_ID` | ID aplikacji Discord. |
| `DISCORD_CLIENT_SECRET` | Sekret aplikacji Discord. |
| `DISCORD_CALLBACK_DOMAIN` | Opcjonalny callback OAuth dla domeny. |
| `DISCORD_CALLBACK_IP` | Opcjonalny callback OAuth dla adresu IP. |
| `COOKIE_SECURE` | `true`, `false` albo `auto` dla ciasteczek sesji. |
| `ADMINS` | Lista ID administratorow. |
| `CREATOR_ALLOW` | Lista ID uzytkownikow z dostepem do creator-code. |
| `CREATOR_URL` | Sciezka lub URL narzedzia creator-code. |
| `ALLOWED_PUBLIC_HOSTS` | Dozwolone hosty publiczne. |
| `POSTS_FULLSYNC_KEY` | Klucz do pelnej synchronizacji postow. |
| `CREATOR_BOT_API_URL` | Adres API narzedzia creator-code. |
| `CREATOR_BOT_API_SECRET` | Sekret API narzedzia creator-code. |

## Struktura projektu

```text
.
|-- server.js          # Start serwera, statyczne pliki, auth routes i SPA fallback
|-- auth.js            # Konfiguracja Passport/Discord OAuth
|-- db.js              # SQLite, migracje i funkcje dostepu do danych
|-- routes/
|   `-- api.js         # Glowne endpointy API
|-- public/            # Frontend aplikacji
|-- picture/           # Zasoby graficzne uzywane przez frontend
|-- nic/               # Lokalne pliki pomocnicze/notatki
|-- .env.example       # Przyklad konfiguracji
`-- package.json       # Skrypty i zaleznosci
```

## Baza danych

Aplikacja korzysta z lokalnego pliku `app.db`. SQLite tworzy tez pliki pomocnicze WAL/SHM, np. `app.db-wal` i `app.db-shm`.

Pliki bazy zawieraja lokalny stan aplikacji. Jesli potrzebujesz przeniesc dane na serwer, zrob osobny backup bazy.
