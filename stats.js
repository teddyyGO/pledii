const fs = require('fs');
const path = require('path');
const db = require('./db');

const STATS_PATH = path.join(__dirname, 'stats.json');
const MAX_AGE_SECONDS = 7 * 86400;      // keep 7 days
const RECORD_INTERVAL = 60 * 1000;      // record every minute
const BLOCKS = '▁▂▃▄▅▆▇█';

const lastRecorded = { ragemp: 0, redm: 0, samp: 0 };

// Schema — maps directly to DB tables when migrating:
//
// snapshots:      id, game, timestamp, total_players
// server_records: snapshot_id, server_id, name, players, api_peak?

function loadStats() {
  try {
    return JSON.parse(fs.readFileSync(STATS_PATH, 'utf8'));
  } catch {
    return { snapshots: [] };
  }
}

function saveStats(stats) {
  fs.writeFileSync(STATS_PATH, JSON.stringify(stats));
}

function nextId(snapshots) {
  return snapshots.length === 0 ? 1 : snapshots[snapshots.length - 1].id + 1;
}

/**
 * Record a snapshot. Rate-limited to RECORD_INTERVAL per game.
 * servers entries should have: { addr|endpoint, name|hostname, players|clients, peak? }
 */
function recordSnapshot(game, servers, totalPlayers) {
  const now = Date.now();
  if (now - lastRecorded[game] < RECORD_INTERVAL) return;
  lastRecorded[game] = now;

  const stats = loadStats();
  const timestamp = Math.floor(now / 1000);

  stats.snapshots.push({
    id: nextId(stats.snapshots),
    game,
    timestamp,
    total_players: totalPlayers,
    servers: servers
      .map(s => {
        const entry = {
          server_id: s.addr || s.endpoint,
          name: s.name || s.hostname || s.addr || s.endpoint || '',
          players: s.players ?? s.clients ?? 0
        };
        if (s.api_peak != null) entry.api_peak = s.api_peak;
        return entry;
      })
      .filter(s => s.server_id)
  });

  const cutoff = timestamp - MAX_AGE_SECONDS;
  stats.snapshots = stats.snapshots.filter(s => s.timestamp >= cutoff);

  saveStats(stats);

  // Also record to database if connected
  db.recordSnapshot(game, servers, totalPlayers).catch(err => console.error('[db]', err.message));
}

function getSnapshots(game, hours = 24) {
  const cutoff = Math.floor(Date.now() / 1000) - hours * 3600;
  return loadStats().snapshots.filter(s => s.game === game && s.timestamp >= cutoff);
}

function getTotalHistory(game, hours = 24) {
  return getSnapshots(game, hours).map(s => ({ t: s.timestamp, p: s.total_players }));
}

/** Returns list of all known servers for a game, with latest known name. */
function getKnownServers(game) {
  const all = loadStats().snapshots.filter(s => s.game === game);
  const map = new Map();
  for (const snap of all) {
    for (const srv of snap.servers) {
      map.set(srv.server_id, srv.name || srv.server_id);
    }
  }
  return Array.from(map.entries()).map(([server_id, name]) => ({ server_id, name }));
}

/** Returns player history for a specific server. */
function getServerHistory(game, serverId, hours = 24) {
  return getSnapshots(game, hours)
    .map(snap => {
      const srv = snap.servers.find(s => s.server_id === serverId);
      return srv ? { t: snap.timestamp, p: srv.players } : null;
    })
    .filter(Boolean);
}

/** Returns the best API-provided peak for a server (if any snapshot had it). */
function getServerApiPeak(game, serverId) {
  const all = loadStats().snapshots.filter(s => s.game === game);
  let best = null;
  for (const snap of all) {
    const srv = snap.servers.find(s => s.server_id === serverId);
    if (srv?.api_peak != null && (best === null || srv.api_peak > best)) {
      best = srv.api_peak;
    }
  }
  return best;
}

/**
 * Full summary for a specific server over the given timeframe.
 */
function getServerSummary(game, serverId, hours = 24) {
  const history = getServerHistory(game, serverId, hours);
  if (history.length === 0) return null;

  const players = history.map(e => e.p);
  const peak = history.reduce((max, e) => (e.p > max.p ? e : max), history[0]);
  const avg = Math.round(players.reduce((a, b) => a + b, 0) / players.length);
  const min = Math.min(...players);
  const uptime_pct = Math.round((players.filter(p => p > 0).length / players.length) * 100);
  const sparkline = generateSparkline(history);
  const api_peak = getServerApiPeak(game, serverId);

  // Rank: position of this server at the most recent snapshot
  const latest = getSnapshots(game, 1);
  let rank = null;
  if (latest.length > 0) {
    const lastSnap = latest[latest.length - 1];
    const sorted = [...lastSnap.servers].sort((a, b) => b.players - a.players);
    const idx = sorted.findIndex(s => s.server_id === serverId);
    if (idx !== -1) rank = idx + 1;
  }

  // Name from most recent snapshot
  const allSnaps = loadStats().snapshots.filter(s => s.game === game);
  let name = serverId;
  for (let i = allSnaps.length - 1; i >= 0; i--) {
    const srv = allSnaps[i].servers.find(s => s.server_id === serverId);
    if (srv?.name) { name = srv.name; break; }
  }

  return { name, peak, avg, min, uptime_pct, sparkline, api_peak, rank };
}

/**
 * Overview summary for a game over the given timeframe.
 */
function getGameSummary(game, hours = 24) {
  const snaps = getSnapshots(game, hours);
  if (snaps.length === 0) return null;

  const history = snaps.map(s => ({ t: s.timestamp, p: s.total_players }));
  const peak = history.reduce((max, e) => (e.p > max.p ? e : max), history[0]);
  const avg = Math.round(history.reduce((sum, e) => sum + e.p, 0) / history.length);
  const sparkline = generateSparkline(history);

  const latest = snaps[snaps.length - 1];
  const current = latest.total_players;
  const servers_online = latest.servers.filter(s => s.players > 0).length;

  // Trend: compare current to 1h ago
  const oneHourAgo = Math.floor(Date.now() / 1000) - 3600;
  const oldSnap = snaps.filter(s => s.timestamp <= oneHourAgo).pop();
  const trend = oldSnap ? current - oldSnap.total_players : null;

  return { current, peak, avg, sparkline, servers_online, trend };
}

/** Peak for the full 24h window. */
function getPeak24h(game) {
  const history = getTotalHistory(game, 24);
  if (history.length === 0) return null;
  return history.reduce((max, e) => (e.p > max.p ? e : max), history[0]);
}

/** Peak for today (since midnight Georgian time UTC+4). */
function getPeakToday(game) {
  const now = Date.now();
  const GEORGIAN_OFFSET = 4 * 3600 * 1000;
  const georgianNow = new Date(now + GEORGIAN_OFFSET);
  const midnightGeorgian = Date.UTC(
    georgianNow.getUTCFullYear(),
    georgianNow.getUTCMonth(),
    georgianNow.getUTCDate()
  );
  const cutoff = Math.floor((midnightGeorgian - GEORGIAN_OFFSET) / 1000);

  const snaps = loadStats().snapshots.filter(s => s.game === game && s.timestamp >= cutoff);
  if (snaps.length === 0) return null;

  const history = snaps.map(s => ({ t: s.timestamp, p: s.total_players }));
  return history.reduce((max, e) => (e.p > max.p ? e : max), history[0]);
}

/** Daily summary for /summary overview. */
function getDailySummary(game) {
  return getGameSummary(game, 24);
}

function generateSparkline(history, points = 24) {
  if (history.length === 0) return '';
  const recent = history.slice(-points);
  const max = Math.max(...recent.map(e => e.p));
  if (max === 0) return BLOCKS[0].repeat(recent.length);
  return recent.map(e => BLOCKS[Math.min(7, Math.floor((e.p / max) * 8))]).join('');
}

/** Returns the most recent snapshot for a game, or null. */
function getLatestSnapshot(game) {
  const all = loadStats().snapshots.filter(s => s.game === game);
  return all.length > 0 ? all[all.length - 1] : null;
}

module.exports = {
  recordSnapshot,
  getLatestSnapshot,
  getTotalHistory,
  getKnownServers,
  getServerHistory,
  getServerSummary,
  getGameSummary,
  getServerApiPeak,
  generateSparkline,
  getPeak24h,
  getPeakToday,
  getDailySummary
};
