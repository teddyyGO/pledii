const express = require('express');
const db = require('./db');

const app = express();
const PORT = process.env.ADMIN_PORT || process.env.PORT || 3000;

// Simple auth via ADMIN_KEY env var (query param ?key=...)
function auth(req, res, next) {
  const key = process.env.ADMIN_KEY;
  if (!key) return next(); // no key set = open (dev mode)
  if (req.query.key === key) return next();
  return res.status(401).send('Unauthorized — add ?key=YOUR_ADMIN_KEY');
}

app.use(auth);

// ── HTML Dashboard ──────────────────────────────────────────────
app.get('/', (req, res) => {
  const keyParam = process.env.ADMIN_KEY ? `&key=${req.query.key || ''}` : '';
  res.send(/*html*/`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Pledii Admin</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0d1117; color: #c9d1d9; padding: 20px; }
  h1 { color: #58a6ff; margin-bottom: 8px; }
  h2 { color: #8b949e; margin: 24px 0 12px; font-size: 1.1em; }
  .status { padding: 12px 16px; border-radius: 8px; margin: 12px 0; font-size: 14px; }
  .ok { background: #0d2818; border: 1px solid #238636; }
  .err { background: #2d1117; border: 1px solid #da3633; }
  .card { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 16px; margin: 12px 0; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { text-align: left; padding: 8px 12px; border-bottom: 1px solid #21262d; }
  th { color: #8b949e; font-weight: 600; position: sticky; top: 0; background: #161b22; }
  tr:hover td { background: #1c2128; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .tabs { display: flex; gap: 8px; margin: 16px 0; flex-wrap: wrap; }
  .tab { padding: 8px 16px; border-radius: 6px; background: #21262d; color: #c9d1d9; border: 1px solid #30363d; cursor: pointer; text-decoration: none; font-size: 13px; }
  .tab.active, .tab:hover { background: #30363d; color: #58a6ff; }
  .meta { color: #8b949e; font-size: 12px; margin: 4px 0; }
  .chart-bar { background: #238636; height: 18px; border-radius: 3px; min-width: 2px; }
  .chart-row { display: flex; align-items: center; gap: 8px; margin: 2px 0; }
  .chart-label { font-size: 11px; color: #8b949e; min-width: 50px; text-align: right; }
  .chart-val { font-size: 11px; color: #c9d1d9; min-width: 30px; }
  #loading { color: #8b949e; padding: 40px; text-align: center; }
  .scroll-table { max-height: 500px; overflow-y: auto; }
  select, input { background: #0d1117; color: #c9d1d9; border: 1px solid #30363d; padding: 6px 10px; border-radius: 6px; font-size: 13px; }
</style>
</head>
<body>
<h1>🎮 Pledii Admin Panel</h1>
<div id="status">Loading...</div>

<div class="tabs">
  <a class="tab active" onclick="loadOverview()" href="#">Overview</a>
  <a class="tab" onclick="loadSnapshots('ragemp')" href="#">RageMP</a>
  <a class="tab" onclick="loadSnapshots('redm')" href="#">RedM</a>
  <a class="tab" onclick="loadSnapshots('samp')" href="#">SA-MP</a>
  <a class="tab" onclick="loadServers()" href="#">Servers</a>
</div>

<div id="content"><div id="loading">Loading...</div></div>

<script>
const KP = '${keyParam}';
function api(path) { return fetch('/api' + path + '?_=' + Date.now() + KP).then(r => r.json()); }

function setActive(el) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  if (el?.target) el.target.classList.add('active');
}

async function loadStatus() {
  const s = await api('/status');
  const el = document.getElementById('status');
  if (s.db) {
    el.innerHTML = '<div class="status ok">✅ Database connected — ' + s.snapshots + ' snapshots, ' + s.server_records + ' server records</div>';
  } else {
    el.innerHTML = '<div class="status err">❌ Database not connected</div>';
  }
}

function timeAgo(iso) {
  const d = new Date(iso);
  const s = Math.floor((Date.now() - d) / 1000);
  if (s < 60) return s + 's ago';
  if (s < 3600) return Math.floor(s/60) + 'm ago';
  if (s < 86400) return Math.floor(s/3600) + 'h ago';
  return Math.floor(s/86400) + 'd ago';
}

function barChart(data, maxVal) {
  if (!maxVal) maxVal = Math.max(...data.map(d => d.value), 1);
  return data.map(d => {
    const pct = (d.value / maxVal * 100).toFixed(1);
    return '<div class="chart-row"><span class="chart-label">' + d.label +
      '</span><div class="chart-bar" style="width:' + pct + '%"></div><span class="chart-val">' + d.value + '</span></div>';
  }).join('');
}

async function loadOverview() {
  const [overview, peaks] = await Promise.all([api('/overview'), api('/peaks-today')]);
  let html = '<h2>Current Players</h2><div class="card">';
  for (const g of overview) {
    html += '<div style="margin:8px 0"><strong>' + g.game + '</strong>: ' + g.current + ' players (peak today: ' + (g.peak_today || 'N/A') + ')</div>';
  }
  html += '</div>';

  html += '<h2>Today\\'s Peaks</h2><div class="card">';
  html += barChart(peaks.map(p => ({ label: p.game, value: p.peak })), null);
  html += '</div>';

  const recent = await api('/snapshots?limit=20');
  html += '<h2>Recent Snapshots (all games)</h2><div class="card scroll-table"><table><tr><th>#</th><th>Game</th><th class="num">Players</th><th>Time</th></tr>';
  for (const s of recent) {
    html += '<tr><td>' + s.id + '</td><td>' + s.game + '</td><td class="num">' + s.total_players + '</td><td>' + timeAgo(s.recorded_at) + '</td></tr>';
  }
  html += '</table></div>';
  document.getElementById('content').innerHTML = html;
}

async function loadSnapshots(game) {
  const snaps = await api('/snapshots?game=' + game + '&limit=100');
  let html = '<h2>' + game.toUpperCase() + ' — Last 100 Snapshots</h2>';

  if (snaps.length > 0) {
    const chartData = snaps.slice().reverse().slice(-50).map(s => ({
      label: new Date(s.recorded_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}),
      value: s.total_players
    }));
    html += '<div class="card">' + barChart(chartData) + '</div>';
  }

  html += '<div class="card scroll-table"><table><tr><th>#</th><th class="num">Players</th><th>Servers</th><th>Time</th><th>Actions</th></tr>';
  for (const s of snaps) {
    html += '<tr><td>' + s.id + '</td><td class="num">' + s.total_players + '</td><td class="num">' + (s.server_count||0) + '</td><td>' + timeAgo(s.recorded_at) + '</td><td><a href="#" onclick="loadSnapshotDetail(' + s.id + ')" style="color:#58a6ff">detail</a></td></tr>';
  }
  html += '</table></div>';
  document.getElementById('content').innerHTML = html;
}

async function loadSnapshotDetail(id) {
  const data = await api('/snapshot/' + id);
  let html = '<h2>Snapshot #' + data.id + ' — ' + data.game + '</h2>';
  html += '<div class="meta">' + new Date(data.recorded_at).toLocaleString() + ' • Total: ' + data.total_players + ' players</div>';
  html += '<div class="card scroll-table"><table><tr><th>#</th><th>Server</th><th>Name</th><th class="num">Players</th><th class="num">API Peak</th></tr>';
  (data.servers || []).forEach((s, i) => {
    html += '<tr><td>' + (i+1) + '</td><td style="font-size:11px">' + s.server_id + '</td><td>' + s.name + '</td><td class="num">' + s.players + '</td><td class="num">' + (s.api_peak ?? '-') + '</td></tr>';
  });
  html += '</table></div>';
  document.getElementById('content').innerHTML = html;
}

async function loadServers() {
  const servers = await api('/servers');
  let html = '<h2>All Known Servers</h2>';
  html += '<div class="card scroll-table"><table><tr><th>Game</th><th>Server ID</th><th>Name</th><th class="num">Latest Players</th><th>Last Seen</th></tr>';
  for (const s of servers) {
    html += '<tr><td>' + s.game + '</td><td style="font-size:11px">' + s.server_id + '</td><td>' + s.name + '</td><td class="num">' + s.players + '</td><td>' + timeAgo(s.last_seen) + '</td></tr>';
  }
  html += '</table></div>';
  document.getElementById('content').innerHTML = html;
}

loadStatus();
loadOverview();
</script>
</body>
</html>`);
});

// ── API Endpoints ───────────────────────────────────────────────
app.get('/api/status', async (req, res) => {
  const pool = db.getPool();
  if (!pool) return res.json({ db: false });

  try {
    const [{ rows: [snaps] }, { rows: [recs] }] = await Promise.all([
      pool.query('SELECT COUNT(*)::int AS count FROM snapshots'),
      pool.query('SELECT COUNT(*)::int AS count FROM server_records')
    ]);
    res.json({ db: true, snapshots: snaps.count, server_records: recs.count });
  } catch (err) {
    res.json({ db: false, error: err.message });
  }
});

app.get('/api/overview', async (req, res) => {
  const pool = db.getPool();
  if (!pool) return res.json([]);

  try {
    const { rows } = await pool.query(`
      SELECT DISTINCT ON (game) game, total_players AS current, recorded_at
      FROM snapshots ORDER BY game, recorded_at DESC
    `);

    const games = [];
    for (const r of rows) {
      const peak = await db.getPeakToday(r.game);
      games.push({
        game: r.game,
        current: r.current,
        peak_today: peak?.p ?? null,
        last_updated: r.recorded_at
      });
    }
    res.json(games);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/peaks-today', async (req, res) => {
  const pool = db.getPool();
  if (!pool) return res.json([]);

  try {
    const { rows } = await pool.query(`
      SELECT game, MAX(total_players) AS peak
      FROM snapshots
      WHERE recorded_at >= (NOW() AT TIME ZONE 'Asia/Tbilisi')::date AT TIME ZONE 'Asia/Tbilisi'
      GROUP BY game ORDER BY peak DESC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/snapshots', async (req, res) => {
  const pool = db.getPool();
  if (!pool) return res.json([]);

  const game = req.query.game;
  const limit = Math.min(parseInt(req.query.limit) || 50, 500);

  try {
    let query, params;
    if (game) {
      query = `SELECT s.id, s.game, s.total_players, s.recorded_at,
                      (SELECT COUNT(*)::int FROM server_records sr WHERE sr.snapshot_id = s.id) AS server_count
               FROM snapshots s WHERE s.game = $1 ORDER BY s.recorded_at DESC LIMIT $2`;
      params = [game, limit];
    } else {
      query = `SELECT s.id, s.game, s.total_players, s.recorded_at,
                      (SELECT COUNT(*)::int FROM server_records sr WHERE sr.snapshot_id = s.id) AS server_count
               FROM snapshots s ORDER BY s.recorded_at DESC LIMIT $1`;
      params = [limit];
    }
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/snapshot/:id', async (req, res) => {
  const pool = db.getPool();
  if (!pool) return res.json({});

  const id = parseInt(req.params.id);
  if (!id || id < 1) return res.status(400).json({ error: 'Invalid ID' });

  try {
    const { rows: [snap] } = await pool.query('SELECT * FROM snapshots WHERE id = $1', [id]);
    if (!snap) return res.status(404).json({ error: 'Not found' });

    const { rows: servers } = await pool.query(
      'SELECT server_id, name, players, api_peak FROM server_records WHERE snapshot_id = $1 ORDER BY players DESC',
      [id]
    );
    res.json({ ...snap, servers });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/servers', async (req, res) => {
  const pool = db.getPool();
  if (!pool) return res.json([]);

  try {
    const { rows } = await pool.query(`
      SELECT DISTINCT ON (sr.server_id, s.game)
             s.game, sr.server_id, sr.name, sr.players, s.recorded_at AS last_seen
      FROM server_records sr
      JOIN snapshots s ON s.id = sr.snapshot_id
      ORDER BY sr.server_id, s.game, s.recorded_at DESC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function startAdmin() {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[admin] Panel running on port ${PORT}`);
  });
}

module.exports = { startAdmin };
