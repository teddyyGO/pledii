const { EmbedBuilder } = require('discord.js');
const { getLatestSnapshot, getPeakToday, getDailyPeaksLocal } = require('../stats');
const db = require('../db');

const PLATFORMS = [
  { key: 'ragemp', label: 'RageMP' },
  { key: 'redm',   label: 'RedM'   },
  { key: 'samp',   label: 'SA-MP'  }
];

const DAY_NAMES = ['კვირა', 'ორშაბათი', 'სამშაბათი', 'ოთხშაბათი', 'ხუთშაბათი', 'პარასკევი', 'შაბათი'];

async function buildEmbed() {
  // Per-platform: try DB peak first, fallback to local
  const rows = [];
  for (const { key, label } of PLATFORMS) {
    const snap = getLatestSnapshot(key);
    const players = snap?.total_players ?? 0;
    const dot = players > 0 ? '🟢' : '⚫';
    let peak = await db.getPeakToday(key);
    if (!peak) peak = getPeakToday(key);
    rows.push({ label, players, dot, peak });
  }

  const total = rows.reduce((sum, r) => sum + r.players, 0);
  const ts = Math.floor(Date.now() / 1000);

  // Combined total peak today from DB, fallback to local
  let totalPeakToday = await db.getCombinedPeakToday();
  if (!totalPeakToday) {
    const localToday = getPeakToday('total');
    if (localToday) totalPeakToday = localToday;
  }

  const lines = rows.map(r => {
    let line = `${r.dot} **${r.label}** — ${r.players} მოთამაშე`;
    if (r.peak) line += ` (პიკი: ${r.peak.p})`;
    return line;
  });

  const headerParts = [`👥 **სულ ${total} მოთამაშე**`];
  if (totalPeakToday) headerParts.push(`📈 დღის პიკი: **${totalPeakToday.p}** მოთამაშე`);

  // Daily peaks for last 7 days
  let dailyPeaks = await db.getDailyPeaks(7);
  if (dailyPeaks.length === 0) {
    // Fallback to local stats
    const local = getDailyPeaksLocal(7);
    dailyPeaks = local.map(d => {
      const date = new Date(Date.now() - d.daysAgo * 86400000);
      return { date, peak: d.peak };
    });
  }

  let dailyLines = '';
  if (dailyPeaks.length > 0) {
    const formatted = dailyPeaks.map(d => {
      const dt = new Date(d.date);
      const dayName = DAY_NAMES[dt.getDay()];
      const dateStr = `${String(dt.getDate()).padStart(2, '0')}.${String(dt.getMonth() + 1).padStart(2, '0')}`;
      return `${dayName} ${dateStr} — **${d.peak}**`;
    });
    dailyLines = `\n\n📊 **ბოლო 7 დღის პიკები:**\n${formatted.join('\n')}`;
  }

  const embed = new EmbedBuilder()
    .setTitle('🇬🇪 სულ ონლაინ — ყველა პლატფორმა')
    .setColor(0x8B0000)
    .setDescription(`${headerParts.join('\n')}\n\n${lines.join('\n')}${dailyLines}\n\n-# განახლდა <t:${ts}:R>`)
    .setTimestamp();

  return embed;
}

module.exports = { buildEmbed };
