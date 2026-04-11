const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

// Discord user IDs allowed to use chaos commands
const ALLOWED_IDS = new Set(
  (process.env.CHAOS_ADMIN_IDS || '').split(',').map(id => id.trim()).filter(Boolean)
);

function isAllowed(interaction) {
  return ALLOWED_IDS.has(interaction.user.id);
}

function maskKey(key) {
  // Show first 4 chars (RMB-) and last 4 chars, mask the rest
  if (key.length <= 8) return key;
  return key.slice(0, 4) + '*'.repeat(key.length - 8) + key.slice(-4);
}

async function callChaosAPI(key, enable) {
  const serverUrl = process.env.SERVER_URL;
  const adminKey = process.env.ADMIN_KEY;

  if (!serverUrl || !adminKey) {
    throw new Error('SERVER_URL or ADMIN_KEY environment variable is not set.');
  }

  const res = await fetch(`${serverUrl}/api/chaos`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${adminKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ key, enable })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API returned ${res.status}: ${text}`);
  }

  return res.json();
}

function buildEmbed(data, enable) {
  return new EmbedBuilder()
    .setTitle(enable ? '💀 Chaos Enabled' : '✅ Chaos Disabled')
    .setColor(enable ? 0xff0000 : 0x00ff00)
    .addFields(
      { name: 'Key',     value: maskKey(data.key), inline: true },
      { name: 'User',    value: data.user_name || 'N/A', inline: true },
      { name: 'Discord', value: data.discord   || 'N/A', inline: true },
      { name: 'Chaos',   value: data.chaos ? 'Enabled' : 'Disabled', inline: true }
    )
    .setTimestamp();
}

async function executeChaos(interaction, enable) {
  if (!isAllowed(interaction)) {
    return interaction.reply({ content: '🚫 You are not authorized to use this command.', ephemeral: true });
  }

  await interaction.deferReply({ ephemeral: true });

  const key = interaction.options.getString('key', true);

  try {
    const data = await callChaosAPI(key, enable);
    const embed = buildEmbed(data, enable);
    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    console.error(`[/${enable ? 'chaos' : 'unchaos'}]`, err);
    await interaction.editReply(`❌ Error: ${err.message}`);
  }
}

const chaosCommand = new SlashCommandBuilder()
  .setName('chaos')
  .setDescription('Enable chaos mode on a license key (admin only)')
  .addStringOption(opt =>
    opt.setName('key').setDescription('License key (RMB-XXXX-XXXX-XXXX-XXXX)').setRequired(true)
  );

const unchaosCommand = new SlashCommandBuilder()
  .setName('unchaos')
  .setDescription('Disable chaos mode on a license key (admin only)')
  .addStringOption(opt =>
    opt.setName('key').setDescription('License key (RMB-XXXX-XXXX-XXXX-XXXX)').setRequired(true)
  );

module.exports = {
  commands: [chaosCommand, unchaosCommand],

  async execute(interaction) {
    const enable = interaction.commandName === 'chaos';
    await executeChaos(interaction, enable);
  }
};
