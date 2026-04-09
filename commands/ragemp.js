const { SlashCommandBuilder, EmbedBuilder, ApplicationIntegrationType, InteractionContextType } = require('discord.js');
const path = require('path');
const fs = require('fs');
const { recordSnapshot, getTotalHistory, generateSparkline, getPeak24h, getPeakToday } = require('../stats');

const CONFIG_PATH = path.join(__dirname, '..', 'georgian-servers.json');

let cache = { data: null, timestamp: 0 };
const CACHE_TTL = 30_000;

function cleanName(name) {
  return name
    .replace(/\[.*?\]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function loadManualList() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')).ragemp ?? [];
  } catch {
    return [];
  }
}

function clearCache() {
  cache = { data: null, timestamp: 0 };
}

async function buildEmbed() {
  let servers;

  if (cache.data && Date.now() - cache.timestamp < CACHE_TTL) {
    servers = cache.data;
  } else {
    const res = await fetch('https://cdn.rage.mp/master/');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    const manualList = loadManualList();

    servers = Object.entries(data)
      .filter(([addr, s]) => {
        if (manualList.includes(addr)) return true;
        const name = (s.name || '').toLowerCase();
        return name.includes('georgia') || name.includes('საქართველო');
      })
      .map(([addr, s]) => ({
        addr,
        ...s,
        api_peak: s.peak ?? s.peakPlayers ?? s.peak_players ?? null
      }))
      .sort((a, b) => (b.players ?? 0) - (a.players ?? 0));

    cache = { data: servers, timestamp: Date.now() };
  }

  const totalPlayers = servers.reduce((sum, s) => sum + (s.players ?? 0), 0);
  recordSnapshot('ragemp', servers, totalPlayers);

  const embed = new EmbedBuilder()
    .setTitle('🇬🇪 ქართული RageMP სერვერები')
    .setColor(0x8B0000)
    .setTimestamp();

  if (servers.length === 0) {
    embed.setDescription('ქართული სერვერები ვერ მოიძებნა.');
    return embed;
  }

  const online = servers.filter(s => (s.players ?? 0) > 0).length;

  const lines = servers.slice(0, 25).map((s, i) => {
    const rank = `\`${String(i + 1).padStart(2, ' ')}\``;
    const dot = (s.players ?? 0) === 0 ? '⬛' : '🟩';
    const name = cleanName(s.name || s.addr);
    const display = name.length > 28 ? name.slice(0, 27) + '…' : name;
    return `${rank} ${dot} **${display}** — ${s.players ?? 0}/${s.maxplayers ?? '?'}`;
  });

  const ts = Math.floor(Date.now() / 1000);
  embed.setDescription(`👥 **${totalPlayers} მოთამაშე ონლაინ** ${online} სერვერზე\n\n${lines.join('\n')}\n\n-# განახლდა <t:${ts}:R>`);

  const sparkline = generateSparkline(getTotalHistory('ragemp'));
  const peak = getPeak24h('ragemp');
  const todayPeak = getPeakToday('ragemp');

  if (sparkline || peak || todayPeak) {
    const parts = [];
    if (sparkline) parts.push(`\`${sparkline}\``);
    if (peak) parts.push(`პიკი: **${peak.p}** <t:${peak.t}:t>`);
    if (todayPeak) parts.push(`დღის პიკი: **${todayPeak.p}** <t:${todayPeak.t}:t>`);
    embed.addFields([{ name: '📊 24h', value: parts.join('  '), inline: false }]);
  }

  return embed;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ragemp')
    .setDescription('Show Georgian RageMP servers')
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
    .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel),

  buildEmbed,
  clearCache,

  async execute(interaction) {
    await interaction.deferReply();
    try {
      const embed = await buildEmbed();
      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.error('[/ragemp]', err);
      await interaction.editReply('Failed to fetch RageMP server list. Try again later.');
    }
  }
};
