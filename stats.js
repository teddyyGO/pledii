const fs = require('fs');
const path = require('path');

const STATS_PATH = path.join(__dirname, 'stats.json');
const MAX_AGE_SECONDS = 86400;      // keep 24h of data
const RECORD_INTERVAL = 5 * 60 * 1000; // record at most every 5 minutes
const BLOCKS = '▁▂▃▄▅▆▇█';

const lastRecorded = { ragemp: 0, redm: 0 };

// Schema (maps directly to DB tables when migrating):
//
// snapshots table:
//   id            — auto-increment
//   game          — "ragemp" | "redm"
//   timestamp     — unix seconds
//   total_players — number
//
// server_snapshots table:
//   snapshot_id   — FK → snapshots.id
//   server_id     — server address / FiveM endpoint
//   players       — number

function loadStats() {
  try {
    return JSON.parse(fs.readFileSync(STATS_PATH, 'utf8'));
  } catch {
    return { snapshots: [] };
  }
}

function saveStats(stats) {
  fs.writeFileSync(STATS_PATH, JSON.stringify(stats, null, 2));
}

function nextId(snapshots) {
  return snapshots.length === 0 ? 1 : snapshots[snapshots.length - 1].id + 1;
}

/**
 * Record a snapshot. Rate-limited to RECORD_INTERVAL per game.
 * @param {'ragemp'|'redm'} game
 * @param {Array} servers
 * @param {number} totalPlayers
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
      .map(s => ({ server_id: s.addr || s.endpoint, players: s.players ?? s.clients ?? 0 }))
      .filter(s => s.server_id)
  });

  // Trim entries older than 24h
  const cutoff = timestamp - MAX_AGE_SECONDS;
  stats.snapshots = stats.snapshots.filter(s => s.timestamp >= cutoff);

  saveStats(stats);
}

function getSnapshots(game) {
  return loadStats().snapshots.filter(s => s.game === game);
}

function getTotalHistory(game) {
  return getSnapshots(game).map(s => ({ t: s.timestamp, p: s.total_players }));
}

/**
 * Generate a sparkline from a history array of { t, p } points.
 */
function generateSparkline(history, points = 24) {
  if (history.length === 0) return '';
  const recent = history.slice(-points);
  const max = Math.max(...recent.map(e => e.p));
  if (max === 0) return BLOCKS[0].repeat(recent.length);
  return recent.map(e => BLOCKS[Math.min(7, Math.floor((e.p / max) * 8))]).join('');
}

/**
 * Get peak total players in the last 24h.
 * @returns {{ t: number, p: number } | null}
 */
function getPeak24h(game) {
  const cutoff = Math.floor(Date.now() / 1000) - MAX_AGE_SECONDS;
  const recent = getSnapshots(game).filter(s => s.timestamp >= cutoff);
  if (recent.length === 0) return null;
  const peak = recent.reduce((max, s) => (s.total_players > max.total_players ? s : max), recent[0]);
  return { t: peak.timestamp, p: peak.total_players };
}

/**
 * Get a 24h summary for /summary command.
 * @returns {{ peak, avg, sparkline } | null}
 */
function getDailySummary(game) {
  const cutoff = Math.floor(Date.now() / 1000) - MAX_AGE_SECONDS;
  const recent = getSnapshots(game).filter(s => s.timestamp >= cutoff);
  if (recent.length === 0) return null;

  const peak = recent.reduce((max, s) => (s.total_players > max.total_players ? s : max), recent[0]);
  const avg = Math.round(recent.reduce((sum, s) => sum + s.total_players, 0) / recent.length);
  const sparkline = generateSparkline(recent.map(s => ({ t: s.timestamp, p: s.total_players })));

  return { peak: { t: peak.timestamp, p: peak.total_players }, avg, sparkline };
}

module.exports = { recordSnapshot, getTotalHistory, generateSparkline, getPeak24h, getDailySummary };
