const { Pool } = require('pg');

let pool = null;

async function init() {
  if (!process.env.DATABASE_URL) {
    console.warn('[db] DATABASE_URL not set — running without database');
    return false;
  }

  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: false }
  });

  try {
    await pool.query('SELECT 1');
  } catch (err) {
    console.error('[db] Failed to connect:', err.message);
    pool = null;
    return false;
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS snapshots (
      id SERIAL PRIMARY KEY,
      game VARCHAR(20) NOT NULL,
      recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      total_players INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS server_records (
      id SERIAL PRIMARY KEY,
      snapshot_id INTEGER REFERENCES snapshots(id) ON DELETE CASCADE,
      server_id VARCHAR(255) NOT NULL,
      name TEXT NOT NULL DEFAULT '',
      players INTEGER NOT NULL DEFAULT 0,
      api_peak INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_snapshots_game_time ON snapshots(game, recorded_at);
    CREATE INDEX IF NOT EXISTS idx_server_records_snapshot ON server_records(snapshot_id);
  `);

  console.log('[db] Connected and schema ready');
  return true;
}

function isConnected() {
  return pool !== null;
}

async function recordSnapshot(game, servers, totalPlayers) {
  if (!pool) return;

  try {
    const { rows } = await pool.query(
      'INSERT INTO snapshots (game, total_players) VALUES ($1, $2) RETURNING id',
      [game, totalPlayers]
    );
    const snapshotId = rows[0].id;

    const filtered = servers
      .map(s => ({
        server_id: s.addr || s.endpoint,
        name: s.name || s.hostname || '',
        players: s.players ?? s.clients ?? 0,
        api_peak: s.api_peak ?? null
      }))
      .filter(s => s.server_id);

    if (filtered.length > 0) {
      const values = [];
      const params = [];
      let i = 1;
      for (const s of filtered) {
        values.push(`($${i++}, $${i++}, $${i++}, $${i++}, $${i++})`);
        params.push(snapshotId, s.server_id, s.name, s.players, s.api_peak);
      }
      await pool.query(
        `INSERT INTO server_records (snapshot_id, server_id, name, players, api_peak)
         VALUES ${values.join(', ')}`,
        params
      );
    }
  } catch (err) {
    console.error('[db] recordSnapshot error:', err.message);
  }
}

async function getPeakToday(game) {
  if (!pool) return null;

  try {
    const { rows } = await pool.query(
      `SELECT total_players, recorded_at
       FROM snapshots
       WHERE game = $1
         AND recorded_at >= (NOW() AT TIME ZONE 'Asia/Tbilisi')::date AT TIME ZONE 'Asia/Tbilisi'
       ORDER BY total_players DESC
       LIMIT 1`,
      [game]
    );

    if (rows.length === 0) return null;
    return {
      p: rows[0].total_players,
      t: Math.floor(new Date(rows[0].recorded_at).getTime() / 1000)
    };
  } catch (err) {
    console.error('[db] getPeakToday error:', err.message);
    return null;
  }
}

async function cleanup(daysToKeep = 90) {
  if (!pool) return;
  try {
    const { rowCount } = await pool.query(
      'DELETE FROM snapshots WHERE recorded_at < NOW() - $1::interval',
      [`${daysToKeep} days`]
    );
    if (rowCount > 0) console.log(`[db] Cleaned up ${rowCount} old snapshots`);
  } catch (err) {
    console.error('[db] cleanup error:', err.message);
  }
}

module.exports = { init, isConnected, recordSnapshot, getPeakToday, cleanup };
