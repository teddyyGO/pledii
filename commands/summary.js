const {
  SlashCommandBuilder,
  EmbedBuilder,
  ApplicationIntegrationType,
  InteractionContextType
} = require('discord.js');
const {
  getGameSummary,
  getServerSummary,
  getKnownServers,
  getLatestSnapshot,
  generateSparkline,
  getTotalHistory,
  stripLeadingEmoji
} = require('../stats');

const GAME_LABELS = { ragemp: '🎮 RageMP', redm: '🐴 RedM' };

function trendArrow(trend) {
  if (trend === null) return '';
  if (trend > 0) return `📈 +${trend} vs 1h ago`;
  if (trend < 0) return `📉 ${trend} vs 1h ago`;
  return '➡️ stable vs 1h ago';
}

function buildOverviewField(game, hours) {
  const label = GAME_LABELS[game];
  const s = getGameSummary(game, hours);
  if (!s) return { name: label, value: 'No data yet — check back in a few minutes.', inline: true };

  const sparkline7d = hours === 168
    ? `\`${s.sparkline}\``
    : (() => {
        const h7 = getTotalHistory(game, 168);
        return h7.length > 0 ? `\`${generateSparkline(h7, 28)}\`` : null;
      })();

  const lines = [
    `\`${s.sparkline}\``,
    `🟢 **Now:** ${s.current} players (${s.servers_online} servers online)`,
    `📈 **Peak:** ${s.peak.p} players <t:${s.peak.t}:t>`,
    `📊 **Avg:** ${s.avg} players`,
    trendArrow(s.trend),
  ];
  if (sparkline7d && hours < 168) lines.push(`7d: ${sparkline7d}`);

  // List all online servers (1+ players)
  const snap = getLatestSnapshot(game);
  if (snap) {
    const onlineServers = [...snap.servers]
      .filter(srv => srv.players > 0)
      .sort((a, b) => b.players - a.players);
    if (onlineServers.length > 0) {
      lines.push('');
      for (const srv of onlineServers) {
        const name = stripLeadingEmoji((srv.name || srv.server_id).replace(/\[.*?\]/g, '').replace(/\s{2,}/g, ' ').trim());
        const display = name.length > 24 ? name.slice(0, 23) + '…' : name;
        lines.push(`\` ${String(srv.players).padStart(3)}\` ${display}`);
      }
    }
  }

  return { name: label, value: lines.filter(Boolean).join('\n'), inline: true };
}

function buildServerEmbed(game, serverId, hours) {
  const s = getServerSummary(game, serverId, hours);
  const label = GAME_LABELS[game];

  if (!s) {
    return new EmbedBuilder()
      .setTitle(`📊 ${label}`)
      .setDescription('No data found for that server.')
      .setColor(0x8B0000);
  }

  const peakLine = s.api_peak != null
    ? `📈 **Peak today (API):** ${s.api_peak} | **Peak tracked:** ${s.peak.p} <t:${s.peak.t}:t>`
    : `📈 **Peak:** ${s.peak.p} players <t:${s.peak.t}:t>`;

  const lines = [
    `\`${s.sparkline}\``,
    '',
    peakLine,
    `📊 **Average:** ${s.avg} players`,
    `📉 **Minimum:** ${s.min} players`,
    `⏱️ **Uptime:** ${s.uptime_pct}% of the time had players online`,
    s.rank !== null ? `🏆 **Rank:** #${s.rank} among Georgian servers right now` : null,
  ];

  const timeLabel = hours === 168 ? '7 days' : '24 hours';

  return new EmbedBuilder()
    .setTitle(`📊 ${s.name}`)
    .setDescription(lines.filter(Boolean).join('\n'))
    .setColor(0x8B0000)
    .setFooter({ text: `${label} • Last ${timeLabel}` })
    .setTimestamp();
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('summary')
    .setDescription('Show player activity stats for Georgian servers')
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
    .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel)
    .addStringOption(option =>
      option
        .setName('game')
        .setDescription('Which game (required when using the server option)')
        .setRequired(false)
        .addChoices(
          { name: 'RageMP', value: 'ragemp' },
          { name: 'RedM', value: 'redm' }
        )
    )
    .addStringOption(option =>
      option
        .setName('server')
        .setDescription('Specific server to inspect (select a game first)')
        .setRequired(false)
        .setAutocomplete(true)
    )
    .addStringOption(option =>
      option
        .setName('timeframe')
        .setDescription('Time window (default: 24h)')
        .setRequired(false)
        .addChoices(
          { name: '24 hours', value: '24' },
          { name: '7 days', value: '168' }
        )
    ),

  async autocomplete(interaction) {
    const game = interaction.options.getString('game');
    if (!game) return interaction.respond([]);

    const focused = interaction.options.getFocused().toLowerCase();
    const servers = getKnownServers(game);

    const choices = servers
      .filter(s =>
        s.name.toLowerCase().includes(focused) ||
        s.server_id.toLowerCase().includes(focused)
      )
      .slice(0, 25)
      .map(s => ({
        name: s.name.length > 100 ? s.name.slice(0, 97) + '…' : s.name,
        value: s.server_id
      }));

    await interaction.respond(choices);
  },

  async execute(interaction) {
    await interaction.deferReply();

    const game = interaction.options.getString('game');
    const serverId = interaction.options.getString('server');
    const hours = parseInt(interaction.options.getString('timeframe') ?? '24');

    // Server-specific view
    if (serverId) {
      if (!game) {
        return interaction.editReply('Please select a **game** when using the server option.');
      }
      const embed = buildServerEmbed(game, serverId, hours);
      return interaction.editReply({ embeds: [embed] });
    }

    // Overview — one or both games
    const games = game ? [game] : ['ragemp', 'redm'];
    const timeLabel = hours === 168 ? '7 Days' : '24 Hours';

    const embed = new EmbedBuilder()
      .setTitle(`📊 Georgian Servers — Last ${timeLabel}`)
      .setColor(0x8B0000)
      .setTimestamp()
      .addFields(games.map(g => buildOverviewField(g, hours)));

    await interaction.editReply({ embeds: [embed] });
  }
};
