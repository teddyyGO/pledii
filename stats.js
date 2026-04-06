const fs = require('fs');
const path = require('path');

const STATS_PATH = path.join(__dirname, 'stats.json');
const MAX_ENTRIES = 288; // 24h at 5-minute intervals
const RECORD_INTERVAL = 5 * 60 * 1000; // 5 minutes

const lastRecorded = { ragemp: 0, redm: 0 };
const BLOCKS = '▁▂▃▄▅▆▇█';

function loadStats() {
  try {
    return JSON.parse(fs.readFileSync(STATS_PATH, 'utf8'));
  } catch {
    return { ragemp: { total: [], servers: {} }, redm: { total: [], servers: {} } };
  }
}

function saveStats(stats) {
  fs.writeFileSync(STATS_PATH, JSON.stringify(stats));
}

function pushCapped(arr, entry) {
  arr.push(entry);
  if (arr.length > MAX_ENTRIES) arr.splice(0, arr.length - MAX_ENTRIES);
}

/**
 * Record a snapshot of player counts for a game.
 * Rate-limited to once every RECORD_INTERVAL ms.
 * @param {'ragemp'|'redm'} game
 * @param {Array} servers - array of server objects with addr/endpoint and players/clients
 * @param {number} totalPlayers
 */
function recordSnapshot(game, servers, totalPlayers) {
  const now = Date.now();
  if (now - lastRecorded[game] < RECORD_INTERVAL) return;
  lastRecorded[game] = now;

  const stats = loadStats();
  if (!stats[game]) stats[game] = { total: [], servers: {} };

  const t = Math.floor(now / 1000);

  pushCapped(stats[game].total, { t, p: totalPlayers });

  for (const server of servers) {
    const key = server.addr || server.endpoint;
    if (!key) continue;
    const players = server.players ?? server.clients ?? 0;
    if (!stats[game].servers[key]) stats[game].servers[key] = [];
    pushCapped(stats[game].servers[key], { t, p: players });
  }

  saveStats(stats);
}

function getTotalHistory(game) {
  return loadStats()[game]?.total ?? [];
}

/**
 * Generate a sparkline string from a history array.
 * @param {Array<{t: number, p: number}>} history
 * @param {number} points - how many recent data points to use
 */
function generateSparkline(history, points = 24) {
  if (history.length === 0) return '';
  const recent = history.slice(-points);
  const max = Math.max(...recent.map(e => e.p));
  if (max === 0) return BLOCKS[0].repeat(recent.length);
  return recent.map(e => BLOCKS[Math.min(7, Math.floor((e.p / max) * 8))]).join('');
}

/**
 * Get peak total players in the last 24 hours.
 * @returns {{ t: number, p: number } | null}
 */
function getPeak24h(game) {
  const cutoff = Math.floor(Date.now() / 1000) - 86400;
  const recent = getTotalHistory(game).filter(e => e.t >= cutoff);
  if (recent.length === 0) return null;
  return recent.reduce((max, e) => (e.p > max.p ? e : max), recent[0]);
}

/**
 * Get a summary of the last 24h for a game.
 * @returns {{ peak: {t,p}, avg: number, sparkline: string } | null}
 */
function getDailySummary(game) {
  const cutoff = Math.floor(Date.now() / 1000) - 86400;
  const recent = getTotalHistory(game).filter(e => e.t >= cutoff);
  if (recent.length === 0) return null;

  const peak = recent.reduce((max, e) => (e.p > max.p ? e : max), recent[0]);
  const avg = Math.round(recent.reduce((sum, e) => sum + e.p, 0) / recent.length);
  const sparkline = generateSparkline(recent);

  return { peak, avg, sparkline };
}

module.exports = { recordSnapshot, getTotalHistory, generateSparkline, getPeak24h, getDailySummary };
