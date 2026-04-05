const { SlashCommandBuilder } = require('discord.js');
const path = require('path');
const fs = require('fs');

const CONFIG_PATH = path.join(__dirname, '..', 'georgian-servers.json');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unpingeorgia')
    .setDescription('Delete the pinned Georgian server messages and stop auto-updates'),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    let config;
    try {
      config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    } catch {
      return interaction.editReply('Could not read config.');
    }

    const pinned = config.pinned ?? {};

    if (!pinned.channelId) {
      await interaction.editReply('No pinned messages found.');
      setTimeout(() => interaction.deleteReply().catch(() => {}), 10_000);
      return;
    }

    // Try to delete the messages
    try {
      const channel = await interaction.client.channels.fetch(pinned.channelId);
      const [ragempMsg, redmMsg] = await Promise.all([
        channel.messages.fetch(pinned.ragempMessageId),
        channel.messages.fetch(pinned.redmMessageId)
      ]);
      await ragempMsg.delete();
      await redmMsg.delete();
    } catch {
      // Messages already gone, still clear the config
    }

    config.pinned = {};
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));

    await interaction.editReply('🗑️ Pinned messages removed.');
    setTimeout(() => interaction.deleteReply().catch(() => {}), 10_000);
  }
};
