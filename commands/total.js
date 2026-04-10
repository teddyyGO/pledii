const { EmbedBuilder } = require('discord.js');
const { getLatestSnapshot, getPeakToday, getDailyPeaksLocal, generateSparkline, getTotalHistory, getAllServerPeaksToday } = require('../stats');
const db = require('../db');

const PLATFORMS = [
  { key: 'ragemp', label: 'RageMP',  emoji: '🎮' },
  { key: 'redm',   label: 'RedM',    emoji: '🐴' },
  { key: 'samp',   label: 'SA-MP',   emoji: '🚗' }
];

const DAY_NAMES = ['კვირა', 'ორშაბათი', 'სამშაბათი', 'ოთხშაბათი', 'ხუთშაბათი', 'პარასკევი', 'შაბათი'];

async function buildEmbed() {
  // Per-platform: try DB peak first, fallback to local
  const rows = [];
  for (const { key, label, emoji } of PLATFORMS) {
    const snap = getLatestSnapshot(key);
    const players = snap?.total_players ?? 0;
    const serverCount = snap ? snap.servers.filter(s => s.players > 0).length : 0;
    const dot = players > 0 ? '🟢' : '⚫';
    let peak = await db.getPeakToday(key);
    if (!peak) peak = getPeakToday(key);

    // Per-server peaks for this platform
    const localPeaks = getAllServerPeaksToday(key);
    const dbPeaks = await db.getServerPeaksToday(key);
    const serverPeaks = new Map(localPeaks);
    for (const [id, p] of dbPeaks) {
      if (p > (serverPeaks.get(id) || 0)) serverPeaks.set(id, p);
    }

    // Top 3 servers by current players
    const topServers = snap ? [...snap.servers]
      .sort((a, b) => b.players - a.players)
      .slice(0, 3)
      .filter(s => s.players > 0)
      .map(s => {
        const srvPeak = serverPeaks.get(s.server_id) || 0;
        const shortName = (s.name || s.server_id).replace(/\[.*?\]/g, '').replace(/\s{2,}/g, ' ').trim();
        const display = shortName.length > 22 ? shortName.slice(0, 21) + '…' : shortName;
        const peakStr = srvPeak > 0 ? ` ⌃${srvPeak}` : '';
        return `\` ${s.players}\` ${display}${peakStr}`;
      }) : [];

    rows.push({ label, emoji, players, serverCount, dot, peak, topServers });
  }

  const total = rows.reduce((sum, r) => sum + r.players, 0);
  const ts = Math.floor(Date.now() / 1000);

  // Combined total peak today from DB, fallback to local
  let totalPeakToday = await db.getCombinedPeakToday();
  if (!totalPeakToday) {
    const localToday = getPeakToday('total');
    if (localToday) totalPeakToday = localToday;
  }

  // Sparkline for combined total
  const totalSparkline = generateSparkline(getTotalHistory('total'));

  // Build platform sections
  const platformSections = rows.map(r => {
    const header = `${r.dot} ${r.emoji} **${r.label}** — **${r.players}** მოთამაშე`;
    const peakStr = r.peak ? ` (დღის პიკი: **${r.peak.p}**)` : '';
    const serverStr = r.serverCount > 0 ? ` • ${r.serverCount} სერვერი` : '';
    const topLines = r.topServers.length > 0 ? '\n' + r.topServers.join('\n') : '';
    return `${header}${peakStr}${serverStr}${topLines}`;
  });

  const headerParts = [`👥 **სულ ${total} მოთამაშე ონლაინ**`];
  if (totalPeakToday) headerParts.push(`📈 დღის პიკი: **${totalPeakToday.p}** მოთამაშე`);
  if (totalSparkline) headerParts.push(`\`${totalSparkline}\``);

  // Daily peaks for last 7 days
  let dailyPeaks = await db.getDailyPeaks(7);
  if (dailyPeaks.length === 0) {
    const local = getDailyPeaksLocal(7);
    dailyPeaks = local.map(d => {
      const date = new Date(Date.now() - d.daysAgo * 86400000);
      return { date, peak: d.peak };
    });
  }

  let dailyLines = '';
  if (dailyPeaks.length > 0) {
    const maxPeak = Math.max(...dailyPeaks.map(d => d.peak));
    const formatted = dailyPeaks.map(d => {
      const dt = new Date(d.date);
      const dayName = DAY_NAMES[dt.getDay()];
      const dateStr = `${String(dt.getDate()).padStart(2, '0')}.${String(dt.getMonth() + 1).padStart(2, '0')}`;
      const bar = '█'.repeat(Math.max(1, Math.round((d.peak / maxPeak) * 8)));
      const highlight = d.peak === maxPeak ? ' 🔥' : '';
      return `\`${dateStr}\` ${dayName} — **${d.peak}** ${bar}${highlight}`;
    });
    dailyLines = `\n\n📊 **ბოლო 7 დღის პიკები:**\n${formatted.join('\n')}`;
  }

  const embed = new EmbedBuilder()
    .setTitle('🇬🇪 სულ ონლაინ — ყველა პლატფორმა')
    .setColor(0x8B0000)
    .setDescription(
      `${headerParts.join('\n')}\n\n${platformSections.join('\n\n')}${dailyLines}` +
      `\n\n-# განახლდა <t:${ts}:R> • დღე იწყება 06:00-ზე`
    )
    .setTimestamp();

  return embed;
}

module.exports = { buildEmbed };
