const { EmbedBuilder } = require('discord.js');
const { getLatestSnapshot, getPeakToday, getPeak7d } = require('../stats');

const PLATFORMS = [
  { key: 'ragemp', label: 'RageMP' },
  { key: 'redm',   label: 'RedM'   },
  { key: 'samp',   label: 'SA-MP'  }
];

async function buildEmbed() {
  const rows = PLATFORMS.map(({ key, label }) => {
    const snap = getLatestSnapshot(key);
    const players = snap?.total_players ?? 0;
    const dot = players > 0 ? '🟢' : '⚫';
    const peak = getPeakToday(key);
    return { label, players, dot, peak };
  });

  const total = rows.reduce((sum, r) => sum + r.players, 0);
  const ts = Math.floor(Date.now() / 1000);

  const totalPeakToday = getPeakToday('total');
  const totalPeak7d = getPeak7d('total');

  const lines = rows.map(r => {
    let line = `${r.dot} **${r.label}** — ${r.players} მოთამაშე`;
    if (r.peak) line += ` (პიკი: ${r.peak.p})`;
    return line;
  });

  const headerParts = [`👥 **სულ ${total} მოთამაშე**`];
  if (totalPeakToday) headerParts.push(`📈 დღის პიკი: **${totalPeakToday.p}** მოთამაშე`);
  if (totalPeak7d) headerParts.push(`📊 7 დღის პიკი: **${totalPeak7d.p}** მოთამაშე`);

  const embed = new EmbedBuilder()
    .setTitle('🇬🇪 სულ ონლაინ — ყველა პლატფორმა')
    .setColor(0x8B0000)
    .setDescription(`${headerParts.join('\n')}\n\n${lines.join('\n')}\n\n-# განახლდა <t:${ts}:R>`)
    .setTimestamp();

  return embed;
}

module.exports = { buildEmbed };
