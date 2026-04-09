const express = require('express');
const crypto = require('crypto');
const db = require('./db');

const app = express();
const PORT = process.env.ADMIN_PORT || process.env.PORT || 3000;

// ── Session-based auth ──────────────────────────────────────────
const sessions = new Map();

app.use(express.urlencoded({ extended: false }));
app.use(express.json());

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

function auth(req, res, next) {
  const key = process.env.ADMIN_KEY;
  if (!key) return next(); // no key = open

  // Check cookie
  const cookie = (req.headers.cookie || '').split(';').find(c => c.trim().startsWith('session='));
  const token = cookie?.split('=')?.[1]?.trim();
  if (token && sessions.has(token)) return next();

  // Login page and API auth should be excluded
  if (req.path === '/login') return next();

  // For API calls return 401
  if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Unauthorized' });

  // Redirect to login
  return res.redirect('/login');
}

app.use(auth);

// ── Login ───────────────────────────────────────────────────────
app.get('/login', (req, res) => {
  const error = req.query.error ? '<div class="status err">Wrong password</div>' : '';
  res.send(/*html*/`<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Pledii — Login</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0d1117; color: #c9d1d9; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
  .login-box { background: #161b22; border: 1px solid #30363d; border-radius: 12px; padding: 40px; width: 360px; text-align: center; }
  h1 { color: #58a6ff; margin-bottom: 8px; font-size: 24px; }
  p { color: #8b949e; margin-bottom: 24px; font-size: 14px; }
  input[type=password] { width: 100%; background: #0d1117; color: #c9d1d9; border: 1px solid #30363d; padding: 12px 16px; border-radius: 8px; font-size: 15px; margin-bottom: 16px; outline: none; }
  input[type=password]:focus { border-color: #58a6ff; }
  button { width: 100%; background: #238636; color: #fff; border: none; padding: 12px; border-radius: 8px; font-size: 15px; cursor: pointer; font-weight: 600; }
  button:hover { background: #2ea043; }
  .status { padding: 10px; border-radius: 6px; margin-bottom: 16px; font-size: 13px; }
  .err { background: #2d1117; border: 1px solid #da3633; color: #f85149; }
</style>
</head><body>
<div class="login-box">
  <h1>🎮 Pledii</h1>
  <p>Enter admin password to continue</p>
  ${error}
  <form method="POST" action="/login">
    <input type="password" name="password" placeholder="Password" autofocus required>
    <button type="submit">Login</button>
  </form>
</div>
</body></html>`);
});

app.post('/login', (req, res) => {
  const key = process.env.ADMIN_KEY;
  if (!key || req.body.password === key) {
    const token = generateToken();
    sessions.set(token, Date.now());
    // Clean old sessions (keep last 50)
    if (sessions.size > 50) {
      const oldest = [...sessions.entries()].sort((a, b) => a[1] - b[1]);
      for (let i = 0; i < sessions.size - 50; i++) sessions.delete(oldest[i][0]);
    }
    res.setHeader('Set-Cookie', `session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400`);
    return res.redirect('/');
  }
  return res.redirect('/login?error=1');
});

app.get('/logout', (req, res) => {
  const cookie = (req.headers.cookie || '').split(';').find(c => c.trim().startsWith('session='));
  const token = cookie?.split('=')?.[1]?.trim();
  if (token) sessions.delete(token);
  res.setHeader('Set-Cookie', 'session=; Path=/; HttpOnly; Max-Age=0');
  res.redirect('/login');
});

// ── HTML Dashboard ──────────────────────────────────────────────
app.get('/', (req, res) => {
  res.send(/*html*/`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Pledii Admin</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0d1117; color: #c9d1d9; }
  .container { max-width: 1100px; margin: 0 auto; padding: 20px; }

  /* Header */
  .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
  .header h1 { color: #58a6ff; font-size: 22px; }
  .header a { color: #8b949e; font-size: 13px; text-decoration: none; }
  .header a:hover { color: #f85149; }

  /* Status */
  .status { padding: 10px 14px; border-radius: 8px; margin-bottom: 16px; font-size: 13px; }
  .ok { background: #0d2818; border: 1px solid #238636; }
  .err { background: #2d1117; border: 1px solid #da3633; }

  /* Stats row */
  .stats-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin-bottom: 20px; }
  .stat-card { background: #161b22; border: 1px solid #30363d; border-radius: 10px; padding: 16px; }
  .stat-card .label { color: #8b949e; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
  .stat-card .value { color: #f0f6fc; font-size: 28px; font-weight: 700; margin: 4px 0; }
  .stat-card .sub { color: #8b949e; font-size: 12px; }
  .stat-card .peak { color: #3fb950; font-size: 13px; }

  /* Tabs */
  .tabs { display: flex; gap: 4px; margin-bottom: 16px; border-bottom: 1px solid #21262d; padding-bottom: 0; }
  .tab { padding: 10px 18px; color: #8b949e; cursor: pointer; text-decoration: none; font-size: 14px; border-bottom: 2px solid transparent; transition: all 0.15s; }
  .tab:hover { color: #c9d1d9; }
  .tab.active { color: #58a6ff; border-bottom-color: #58a6ff; }

  /* Cards & Tables */
  h2 { color: #f0f6fc; margin: 20px 0 10px; font-size: 16px; font-weight: 600; }
  .card { background: #161b22; border: 1px solid #30363d; border-radius: 10px; padding: 16px; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { text-align: left; padding: 8px 12px; border-bottom: 1px solid #21262d; }
  th { color: #8b949e; font-weight: 600; position: sticky; top: 0; background: #161b22; }
  tr:hover td { background: #1c2128; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .scroll-table { max-height: 500px; overflow-y: auto; }
  .clickable { color: #58a6ff; cursor: pointer; text-decoration: none; }
  .clickable:hover { text-decoration: underline; }

  /* Bar chart */
  .chart { padding: 8px 0; }
  .chart-bar { background: linear-gradient(90deg, #238636, #3fb950); height: 20px; border-radius: 4px; min-width: 2px; transition: width 0.3s; }
  .chart-row { display: flex; align-items: center; gap: 8px; margin: 3px 0; }
  .chart-label { font-size: 11px; color: #8b949e; min-width: 55px; text-align: right; }
  .chart-val { font-size: 12px; color: #c9d1d9; min-width: 35px; font-weight: 600; }

  /* Misc */
  .meta { color: #8b949e; font-size: 12px; margin: 6px 0; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 600; }
  .badge-ragemp { background: #1a3a1a; color: #3fb950; }
  .badge-redm { background: #3a1a1a; color: #f85149; }
  .badge-samp { background: #1a2a3a; color: #58a6ff; }
  select, input[type=text] { background: #0d1117; color: #c9d1d9; border: 1px solid #30363d; padding: 8px 12px; border-radius: 8px; font-size: 13px; outline: none; }
  select:focus, input[type=text]:focus { border-color: #58a6ff; }
  .empty { color: #484f58; text-align: center; padding: 40px; font-size: 14px; }
  .back-link { color: #58a6ff; font-size: 13px; cursor: pointer; margin-bottom: 12px; display: inline-block; }
  .back-link:hover { text-decoration: underline; }
</style>
</head>
<body>
<div class="container">

<div class="header">
  <h1>🎮 Pledii Admin</h1>
  <a href="/logout">Logout</a>
</div>

<div id="status"></div>
<div id="stats-row" class="stats-row"></div>

<div class="tabs" id="tabs">
  <a class="tab active" data-tab="overview">Overview</a>
  <a class="tab" data-tab="ragemp">RageMP</a>
  <a class="tab" data-tab="redm">RedM</a>
  <a class="tab" data-tab="samp">SA-MP</a>
  <a class="tab" data-tab="servers">Servers</a>
</div>

<div id="content"></div>

</div>
<script>
async function api(path) {
  try {
    const sep = path.includes('?') ? '&' : '?';
    const r = await fetch('/api' + path + sep + '_=' + Date.now());
    if (r.status === 401) { window.location = '/login'; return null; }
    if (!r.ok) return null;
    return await r.json();
  } catch(e) { console.error('API error:', e); return null; }
}

// ── Tabs ──
document.querySelectorAll('.tab').forEach(function(tab) {
  tab.addEventListener('click', function(e) {
    e.preventDefault();
    document.querySelectorAll('.tab').forEach(function(t) { t.classList.remove('active'); });
    tab.classList.add('active');
    var name = tab.dataset.tab;
    if (name === 'overview') loadOverview();
    else if (name === 'servers') loadServers();
    else loadGame(name);
  });
});

function timeAgo(iso) {
  var s = Math.floor((Date.now() - new Date(iso)) / 1000);
  if (s < 60) return s + 's ago';
  if (s < 3600) return Math.floor(s/60) + 'm ago';
  if (s < 86400) return Math.floor(s/3600) + 'h ago';
  return Math.floor(s/86400) + 'd ago';
}
function fmtTime(iso) { return new Date(iso).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}); }
function fmtDate(iso) { return new Date(iso).toLocaleDateString([], {month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}); }
function badge(game) { return '<span class="badge badge-' + game + '">' + game + '</span>'; }

function esc(s) { var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

function barChart(data) {
  var maxVal = Math.max.apply(null, data.map(function(d){ return d.value; }).concat([1]));
  return '<div class="chart">' + data.map(function(d) {
    var pct = Math.max((d.value / maxVal * 100), 0.5).toFixed(1);
    return '<div class="chart-row"><span class="chart-label">' + d.label +
      '</span><div class="chart-bar" style="width:' + pct + '%"></div><span class="chart-val">' + d.value + '</span></div>';
  }).join('') + '</div>';
}

// ── Status + Stats Cards ──
async function loadStatus() {
  var s = await api('/status');
  if (!s) return;
  var el = document.getElementById('status');
  if (s.db) {
    el.innerHTML = '<div class="status ok">Connected — ' + (s.snapshots || 0) + ' snapshots, ' + (s.server_records || 0) + ' server records</div>';
  } else {
    el.innerHTML = '<div class="status err">Database not connected</div>';
  }
}

async function loadStatsRow() {
  var overview = await api('/overview');
  var el = document.getElementById('stats-row');
  if (!overview || !overview.length) { el.innerHTML = '<div class="empty">No data yet</div>'; return; }

  var total = 0;
  var html = '';
  for (var i = 0; i < overview.length; i++) {
    var g = overview[i];
    total += g.current || 0;
    html += '<div class="stat-card"><div class="label">' + g.game + '</div><div class="value">' + (g.current || 0) + '</div>'
      + (g.peak_today ? '<div class="peak">Peak today: ' + g.peak_today + '</div>' : '')
      + '<div class="sub">Updated ' + timeAgo(g.last_updated) + '</div></div>';
  }
  html = '<div class="stat-card"><div class="label">Total Online</div><div class="value">' + total + '</div><div class="sub">All platforms</div></div>' + html;
  el.innerHTML = html;
}

// ── Overview ──
async function loadOverview() {
  var peaks = await api('/peaks-today');
  var recent = await api('/snapshots?limit=30');

  var html = '<h2>Peaks Today</h2><div class="card">';
  if (peaks && peaks.length) {
    html += barChart(peaks.map(function(p) { return { label: p.game, value: parseInt(p.peak) || 0 }; }));
  } else {
    html += '<div class="empty">No data yet today</div>';
  }
  html += '</div>';

  html += '<h2>Recent Snapshots</h2><div class="card scroll-table"><table>';
  html += '<tr><th>ID</th><th>Game</th><th class="num">Players</th><th class="num">Servers</th><th>Time</th></tr>';
  if (recent) {
    for (var i = 0; i < recent.length; i++) {
      var s = recent[i];
      html += '<tr><td>' + s.id + '</td><td>' + badge(s.game) + '</td><td class="num"><strong>' + s.total_players + '</strong></td><td class="num">' + (s.server_count||0) + '</td><td title="' + fmtDate(s.recorded_at) + '">' + timeAgo(s.recorded_at) + '</td></tr>';
    }
  }
  html += '</table></div>';
  document.getElementById('content').innerHTML = html;
}

// ── Per-Game View ──
async function loadGame(game) {
  var snaps = await api('/snapshots?game=' + game + '&limit=100');
  if (!snaps) snaps = [];

  var html = '<h2>' + game.toUpperCase() + ' — Player History</h2>';

  if (snaps.length > 0) {
    var reversed = snaps.slice().reverse().slice(-60);
    var chartData = reversed.map(function(s) { return { label: fmtTime(s.recorded_at), value: s.total_players }; });
    html += '<div class="card">' + barChart(chartData) + '</div>';
  }

  html += '<h2>Snapshots</h2><div class="card scroll-table"><table>';
  html += '<tr><th>ID</th><th class="num">Players</th><th class="num">Servers</th><th>Time</th><th></th></tr>';
  for (var i = 0; i < snaps.length; i++) {
    var s = snaps[i];
    html += '<tr><td>' + s.id + '</td><td class="num"><strong>' + s.total_players + '</strong></td><td class="num">' + (s.server_count||0) + '</td><td title="' + fmtDate(s.recorded_at) + '">' + timeAgo(s.recorded_at) + '</td>';
    html += '<td><a class="clickable" onclick="loadSnapshot(' + s.id + ')">Details</a></td></tr>';
  }
  html += '</table></div>';
  document.getElementById('content').innerHTML = html;
}

// ── Snapshot Detail ──
async function loadSnapshot(id) {
  var data = await api('/snapshot/' + id);
  if (!data || !data.id) { document.getElementById('content').innerHTML = '<div class="card empty">Snapshot not found</div>'; return; }

  var html = '<h2>Snapshot #' + data.id + '</h2>';
  html += '<div class="meta">' + badge(data.game) + ' — ' + fmtDate(data.recorded_at) + ' — Total: <strong>' + data.total_players + '</strong> players</div>';

  html += '<div class="card scroll-table"><table>';
  html += '<tr><th>#</th><th>Server ID</th><th>Name</th><th class="num">Players</th><th class="num">API Peak</th><th></th></tr>';
  var servers = data.servers || [];
  for (var i = 0; i < servers.length; i++) {
    var s = servers[i];
    var sid = esc(s.server_id);
    html += '<tr><td>' + (i+1) + '</td><td style="font-size:11px;color:#8b949e">' + sid + '</td><td>' + esc(s.name) + '</td><td class="num"><strong>' + s.players + '</strong></td><td class="num">' + (s.api_peak != null ? s.api_peak : '—') + '</td>';
    html += '<td><a class="clickable" data-game="' + data.game + '" data-sid="' + sid + '" onclick="loadServerStats(this.dataset.game, this.dataset.sid)">History</a></td></tr>';
  }
  html += '</table></div>';
  document.getElementById('content').innerHTML = html;
}

// ── Servers List ──
async function loadServers() {
  var servers = await api('/servers');
  if (!servers) servers = [];

  var html = '<h2>All Known Servers (' + servers.length + ')</h2>';
  html += '<div class="card scroll-table"><table>';
  html += '<tr><th>Game</th><th>Server ID</th><th>Name</th><th class="num">Players</th><th>Last Seen</th><th></th></tr>';
  for (var i = 0; i < servers.length; i++) {
    var s = servers[i];
    var sid = esc(s.server_id);
    html += '<tr><td>' + badge(s.game) + '</td><td style="font-size:11px;color:#8b949e">' + sid + '</td><td>' + esc(s.name) + '</td><td class="num"><strong>' + s.players + '</strong></td><td>' + timeAgo(s.last_seen) + '</td>';
    html += '<td><a class="clickable" data-game="' + s.game + '" data-sid="' + sid + '" onclick="loadServerStats(this.dataset.game, this.dataset.sid)">Stats</a></td></tr>';
  }
  html += '</table></div>';
  document.getElementById('content').innerHTML = html;
}

// ── Server Stats ──
async function loadServerStats(game, serverId) {
  var data = await api('/server-stats?game=' + encodeURIComponent(game) + '&server_id=' + encodeURIComponent(serverId));
  if (!data) { document.getElementById('content').innerHTML = '<div class="card empty">Could not load server stats</div>'; return; }

  var html = '<a class="back-link" onclick="loadServers()">Back to Servers</a>';
  html += '<h2>' + badge(game) + ' ' + esc(data.name || serverId) + '</h2>';

  if (data.summary) {
    var sm = data.summary;
    html += '<div class="stats-row">';
    html += '<div class="stat-card"><div class="label">Current</div><div class="value">' + (sm.current != null ? sm.current : '—') + '</div></div>';
    html += '<div class="stat-card"><div class="label">Peak Today</div><div class="value">' + (sm.peak_today != null ? sm.peak_today : '—') + '</div></div>';
    html += '<div class="stat-card"><div class="label">Peak 24h</div><div class="value">' + (sm.peak_24h != null ? sm.peak_24h : '—') + '</div></div>';
    html += '<div class="stat-card"><div class="label">Average 24h</div><div class="value">' + (sm.avg_24h != null ? sm.avg_24h : '—') + '</div></div>';
    html += '</div>';
  }

  if (data.history && data.history.length > 0) {
    html += '<h2>Player History (24h)</h2><div class="card">';
    var chartData = data.history.map(function(h) { return { label: fmtTime(h.recorded_at), value: h.players }; });
    html += barChart(chartData);
    html += '</div>';

    html += '<h2>Raw Data</h2><div class="card scroll-table"><table>';
    html += '<tr><th>Time</th><th class="num">Players</th><th class="num">API Peak</th></tr>';
    for (var i = 0; i < data.history.length; i++) {
      var h = data.history[i];
      html += '<tr><td>' + fmtDate(h.recorded_at) + '</td><td class="num"><strong>' + h.players + '</strong></td><td class="num">' + (h.api_peak != null ? h.api_peak : '—') + '</td></tr>';
    }
    html += '</table></div>';
  } else {
    html += '<div class="card empty">No history found for this server</div>';
  }

  document.getElementById('content').innerHTML = html;
}

// ── Init ──
loadStatus().catch(function(e) { console.error(e); });
loadStatsRow().catch(function(e) { console.error(e); });
loadOverview().catch(function(e) { console.error(e); });
setInterval(function() { loadStatus(); loadStatsRow(); }, 60000);
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

app.get('/api/server-stats', async (req, res) => {
  const pool = db.getPool();
  if (!pool) return res.json({});

  const { game, server_id } = req.query;
  if (!game || !server_id) return res.status(400).json({ error: 'game and server_id required' });

  try {
    // Latest name
    const { rows: nameRows } = await pool.query(`
      SELECT sr.name FROM server_records sr
      JOIN snapshots s ON s.id = sr.snapshot_id
      WHERE s.game = $1 AND sr.server_id = $2
      ORDER BY s.recorded_at DESC LIMIT 1
    `, [game, server_id]);

    // 24h history
    const { rows: history } = await pool.query(`
      SELECT sr.players, sr.api_peak, s.recorded_at
      FROM server_records sr
      JOIN snapshots s ON s.id = sr.snapshot_id
      WHERE s.game = $1 AND sr.server_id = $2 AND s.recorded_at >= NOW() - INTERVAL '24 hours'
      ORDER BY s.recorded_at ASC
    `, [game, server_id]);

    // Summary
    const { rows: [summary] } = await pool.query(`
      SELECT
        MAX(sr.players) AS peak_24h,
        ROUND(AVG(sr.players))::int AS avg_24h
      FROM server_records sr
      JOIN snapshots s ON s.id = sr.snapshot_id
      WHERE s.game = $1 AND sr.server_id = $2 AND s.recorded_at >= NOW() - INTERVAL '24 hours'
    `, [game, server_id]);

    // Peak today
    const { rows: [peakToday] } = await pool.query(`
      SELECT MAX(sr.players) AS peak_today
      FROM server_records sr
      JOIN snapshots s ON s.id = sr.snapshot_id
      WHERE s.game = $1 AND sr.server_id = $2
        AND s.recorded_at >= (NOW() AT TIME ZONE 'Asia/Tbilisi')::date AT TIME ZONE 'Asia/Tbilisi'
    `, [game, server_id]);

    // Current (latest)
    const current = history.length > 0 ? history[history.length - 1].players : null;

    res.json({
      name: nameRows[0]?.name || server_id,
      summary: {
        current,
        peak_today: peakToday?.peak_today ?? null,
        peak_24h: summary?.peak_24h ?? null,
        avg_24h: summary?.avg_24h ?? null
      },
      history
    });
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
