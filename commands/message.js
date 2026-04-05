const { SlashCommandBuilder, ChannelType } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('message')
    .setDescription('Send a message')
    .addStringOption(option =>
      option
        .setName('content')
        .setDescription('The message to send')
        .setRequired(true)
    )
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('Send as a DM to this user')
        .setRequired(false)
    )
    .addChannelOption(option =>
      option
        .setName('channel')
        .setDescription('Channel to send the message in')
        .setRequired(false)
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
    ),

  async execute(interaction) {
    const content = interaction.options.getString('content', true);
    const targetUser = interaction.options.getUser('user');
    const targetChannel = interaction.options.getChannel('channel');

    // Acknowledge Discord's requirement silently
    await interaction.deferReply({ ephemeral: true });
    await interaction.deleteReply();

    try {
      if (targetUser) {
        await targetUser.send(content);
      } else if (targetChannel) {
        await targetChannel.send(content);
      } else {
        await interaction.channel.send(content);
      }
    } catch (err) {
      console.error('[/message] Failed to send:', err);
    }
  }
};
