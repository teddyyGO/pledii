# Pledii

A Discord bot for the Georgian GTA/RDR2 roleplay community. Tracks live player counts across Georgian RageMP and RedM servers, pins auto-updating embeds, and collects historical stats.

---

## Features

- **Live server lists** — `/ragemp` and `/redm` show all active Georgian servers ranked by players, with sparkline graphs and 24h peak
- **Auto-updating pins** — `/pingeorgia` pins live embeds in any channel that refresh every minute automatically
- **Stats & history** — `/summary` shows 24h/7d overviews with peaks, averages, trends, and per-server drill-down
- **Force refresh** — `/refresh` instantly updates pinned messages on demand
- **Sound commands** — `/sound` and `/sounduser` play audio in voice channels

---

## Commands

| Command | Description |
|---|---|
| `/ragemp` | Live Georgian RageMP server list |
| `/redm` | Live Georgian RedM server list |
| `/pingeorgia` | Pin auto-updating server stats in a channel |
| `/unpingeorgia` | Remove pinned messages |
| `/refresh` | Force-refresh pinned messages immediately |
| `/summary` | 24h/7d stats — overview or per-server |
| `/sound` | Play a sound in a voice channel |
| `/sounduser` | Move a user to a channel, play a sound, move them back |
| `/ping` | Check if the bot is online |

---

## Setup

**1. Clone and install**
```bash
git clone https://github.com/teddyyGO/pledii
cd pledii
npm install
```

**2. Configure environment**
```bash
cp .env.example .env
```
Fill in your `.env`:
```
TOKEN=your_bot_token
CLIENT_ID=your_client_id
GUILD_ID=your_guild_id
PROTECTED_ROLE_ID=your_role_id
```

**3. Deploy slash commands**
```bash
npm run deploy
```

**4. Start the bot**
```bash
npm start
```

---

## Hosting on Railway

1. Push to GitHub
2. Create a new Railway project → Deploy from GitHub repo
3. Add environment variables in the Railway **Variables** tab
4. Railway auto-deploys on every push

---

## Sounds

Drop `.mp3` or `.ogg` files into the `/sounds` folder — they are auto-detected and appear as choices in `/sound` and `/sounduser` (up to 25).

---

## Stats

Player counts are recorded every 5 minutes and stored locally in `stats.json` (7-day rolling window). Planned: PostgreSQL backend for persistent history and a public API.
