const { SlashCommandBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
const path = require('path');
const fs = require('fs');
const { buildEmbed: buildRagemp } = require('./ragemp');
const { buildEmbed: buildRedm } = require('./redm');

const CONFIG_PATH = path.join(__dirname, '..', 'georgian-servers.json');

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function saveConfig(config) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

async function pinGame(game, channel, config) {
  const existing = config.pinned?.[game] ?? {};
  const buildEmbed = game === 'ragemp' ? buildRagemp : buildRedm;

  // Same channel — try to update existing message
  if (existing.channelId === channel.id && existing.messageId) {
    try {
      const msg = await channel.messages.fetch(existing.messageId);
      const embed = await buildEmbed();
      await msg.edit({ embeds: [embed] });
      return { updated: true, messageId: existing.messageId };
    } catch {
      // Message gone — fall through to create new one
    }
  }

  // Different channel — delete old message if it exists
  if (existing.channelId && existing.messageId && existing.channelId !== channel.id) {
    try {
      const oldChannel = await channel.client.channels.fetch(existing.channelId);
      const oldMsg = await oldChannel.messages.fetch(existing.messageId);
      await oldMsg.delete();
    } catch {
      // Already gone, fine
    }
  }

  const embed = await buildEmbed();
  const msg = await channel.send({ embeds: [embed] });
  return { updated: false, messageId: msg.id };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('pingeorgia')
    .setDescription('Pin live Georgian server stats in a channel (auto-updates every minute)')
    .addStringOption(option =>
      option
        .setName('game')
        .setDescription('Which game to pin (default: both)')
        .setRequired(false)
        .addChoices(
          { name: 'Both', value: 'both' },
          { name: 'RageMP', value: 'ragemp' },
          { name: 'RedM', value: 'redm' }
        )
    )
    .addChannelOption(option =>
      option
        .setName('channel')
        .setDescription('Channel to pin in (default: current channel)')
        .setRequired(false)
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
    ),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const game = interaction.options.getString('game') ?? 'both';
    const targetChannel = interaction.options.getChannel('channel')
      ?? await interaction.client.channels.fetch(interaction.channelId).catch(() => null);

    if (!targetChannel) {
      return interaction.editReply('❌ Could not resolve the channel. Please specify one using the `channel` option.');
    }

    const games = game === 'both' ? ['ragemp', 'redm'] : [game];

    const config = loadConfig();
    if (!config.pinned) config.pinned = {};

    const results = [];

    for (const g of games) {
      try {
        const result = await pinGame(g, targetChannel, config);
        config.pinned[g] = { channelId: targetChannel.id, messageId: result.messageId };
        const status = result.updated ? 'updated' : `pinned in ${targetChannel}`;
        results.push(`✅ **${g.toUpperCase()}**: ${status}`);
      } catch (err) {
        console.error(`[/pingeorgia] Failed for ${g}:`, err);
        results.push(`❌ **${g.toUpperCase()}**: failed — ${err.message}`);
      }
    }

    saveConfig(config);

    await interaction.editReply(results.join('\n') + '\n\nMessages will auto-update every minute.');
    setTimeout(() => interaction.deleteReply().catch(() => {}), 15_000);
  }
};
