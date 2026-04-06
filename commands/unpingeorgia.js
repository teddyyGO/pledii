const { SlashCommandBuilder } = require('discord.js');
const path = require('path');
const fs = require('fs');

const CONFIG_PATH = path.join(__dirname, '..', 'georgian-servers.json');

async function unpinGame(game, config, client) {
  const pinned = config.pinned?.[game] ?? {};
  if (!pinned.channelId || !pinned.messageId) return false;

  try {
    const channel = await client.channels.fetch(pinned.channelId);
    const msg = await channel.messages.fetch(pinned.messageId);
    await msg.delete();
  } catch {
    // Already gone — still clear config
  }

  config.pinned[game] = {};
  return true;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unpingeorgia')
    .setDescription('Delete pinned Georgian server messages and stop auto-updates')
    .addStringOption(option =>
      option
        .setName('game')
        .setDescription('Which game to unpin (default: both)')
        .setRequired(false)
        .addChoices(
          { name: 'Both', value: 'both' },
          { name: 'RageMP', value: 'ragemp' },
          { name: 'RedM', value: 'redm' }
        )
    ),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    let config;
    try {
      config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    } catch {
      return interaction.editReply('Could not read config.');
    }

    const game = interaction.options.getString('game') ?? 'both';
    const games = game === 'both' ? ['ragemp', 'redm'] : [game];

    const results = [];
    for (const g of games) {
      const removed = await unpinGame(g, config, interaction.client);
      results.push(removed ? `🗑️ **${g.toUpperCase()}**: removed` : `ℹ️ **${g.toUpperCase()}**: not pinned`);
    }

    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));

    await interaction.editReply(results.join('\n'));
    setTimeout(() => interaction.deleteReply().catch(() => {}), 10_000);
  }
};
