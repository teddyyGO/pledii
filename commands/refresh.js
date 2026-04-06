const { SlashCommandBuilder } = require('discord.js');
const { clearCache: clearRagemp } = require('./ragemp');
const { clearCache: clearRedm } = require('./redm');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('refresh')
    .setDescription('Force-refresh the pinned Georgian server stats immediately'),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    clearRagemp();
    clearRedm();

    try {
      await interaction.client.updatePinnedMessages();
      await interaction.editReply('✅ Pinned messages refreshed.');
    } catch (err) {
      console.error('[/refresh]', err);
      await interaction.editReply('✅ Cache cleared — pinned messages will update on the next cycle.');
    }

    setTimeout(() => interaction.deleteReply().catch(() => {}), 5_000);
  }
};
