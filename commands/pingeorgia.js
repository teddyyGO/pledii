const { SlashCommandBuilder } = require('discord.js');
const path = require('path');
const fs = require('fs');
const { buildEmbed: buildRagemp } = require('./ragemp');
const { buildEmbed: buildRedm } = require('./redm');

const CONFIG_PATH = path.join(__dirname, '..', 'georgian-servers.json');

function loadPinned() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')).pinned ?? {};
  } catch {
    return {};
  }
}

function savePinned(data) {
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  config.pinned = data;
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('pingeorgia')
    .setDescription('Pin live Georgian server stats in this channel (auto-updates)'),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const pinned = loadPinned();
    const sameChannel = pinned.channelId === interaction.channel.id;

    // Update existing messages only if we're in the same channel
    if (sameChannel && pinned.ragempMessageId && pinned.redmMessageId) {
      try {
        const channel = await interaction.client.channels.fetch(pinned.channelId);
        const ragempMsg = await channel.messages.fetch(pinned.ragempMessageId);
        const redmMsg = await channel.messages.fetch(pinned.redmMessageId);

        const [ragempEmbed, redmEmbed] = await Promise.all([buildRagemp(), buildRedm()]);
        await ragempMsg.edit({ embeds: [ragempEmbed] });
        await redmMsg.edit({ embeds: [redmEmbed] });

        await interaction.editReply('✅ Pinned messages updated.');
        setTimeout(() => interaction.deleteReply().catch(() => {}), 10_000);
        return;
      } catch {
        // Messages gone — fall through to create new ones
      }
    }

    // Create new pinned messages in the current channel
    const [ragempEmbed, redmEmbed] = await Promise.all([buildRagemp(), buildRedm()]);
    const ragempMsg = await interaction.channel.send({ embeds: [ragempEmbed] });
    const redmMsg = await interaction.channel.send({ embeds: [redmEmbed] });

    savePinned({
      channelId: interaction.channel.id,
      ragempMessageId: ragempMsg.id,
      redmMessageId: redmMsg.id
    });

    await interaction.editReply('✅ Messages pinned! They will update automatically every minute.');
    setTimeout(() => interaction.deleteReply().catch(() => {}), 10_000);
  }
};
