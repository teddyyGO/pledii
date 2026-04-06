const { SlashCommandBuilder, EmbedBuilder, ApplicationIntegrationType, InteractionContextType } = require('discord.js');
const { getDailySummary } = require('../stats');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('summary')
    .setDescription('Show 24h player activity stats for Georgian servers')
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
    .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel),

  async execute(interaction) {
    await interaction.deferReply();

    const ragemp = getDailySummary('ragemp');
    const redm = getDailySummary('redm');

    const embed = new EmbedBuilder()
      .setTitle('📊 24h სტატისტიკა — ქართული სერვერები')
      .setColor(0x8B0000)
      .setTimestamp();

    function buildField(label, summary) {
      if (!summary) return { name: label, value: 'მონაცემი ჯერ არ არის — მოიცადეთ რამდენიმე წუთი.', inline: false };
      return {
        name: label,
        value: [
          `\`${summary.sparkline}\``,
          `📈 პიკი: **${summary.peak.p}** მოთამაშე <t:${summary.peak.t}:t>`,
          `📊 საშუალო: **${summary.avg}** მოთამაშე`
        ].join('\n'),
        inline: false
      };
    }

    embed.addFields([
      buildField('🎮 RageMP', ragemp),
      buildField('🐴 RedM', redm)
    ]);

    await interaction.editReply({ embeds: [embed] });
  }
};
