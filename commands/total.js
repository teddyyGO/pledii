const { EmbedBuilder } = require('discord.js');
const { getLatestSnapshot } = require('../stats');

const PLATFORMS = [
  { key: 'ragemp', label: 'RageMP' },
  { key: 'redm',   label: 'RedM'   },
  { key: 'samp',   label: 'SA-MP'  }
];

async function buildEmbed() {
  const rows = PLATFORMS.map(({ key, label }) => {
    const snap = getLatestSnapshot(key);
    const players = snap?.total_players ?? 0;
    const dot = players > 0 ? '🟩' : '⬛';
    return { label, players, dot };
  });

  const total = rows.reduce((sum, r) => sum + r.players, 0);
  const ts = Math.floor(Date.now() / 1000);

  const lines = rows.map(r => `${r.dot} **${r.label}** — ${r.players} მოთამაშე`);

  const embed = new EmbedBuilder()
    .setTitle('🇬🇪 სულ ონლაინ — ყველა პლატფორმა')
    .setColor(0x8B0000)
    .setDescription(`👥 **სულ ${total} მოთამაშე**\n\n${lines.join('\n')}\n\n-# განახლდა <t:${ts}:R>`)
    .setTimestamp();

  return embed;
}

module.exports = { buildEmbed };
