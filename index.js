const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Events, Collection } = require('discord.js');
require('dotenv').config();

const CONFIG_PATH = path.join(__dirname, 'georgian-servers.json');
const UPDATE_INTERVAL = 60 * 1000;

async function updatePinnedMessages(client) {
  let pinned;
  try {
    pinned = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')).pinned ?? {};
  } catch {
    return;
  }

  if (!pinned.channelId || !pinned.ragempMessageId || !pinned.redmMessageId) return;

  try {
    const { buildEmbed: buildRagemp } = require('./commands/ragemp');
    const { buildEmbed: buildRedm } = require('./commands/redm');

    const channel = await client.channels.fetch(pinned.channelId);
    const [ragempMsg, redmMsg] = await Promise.all([
      channel.messages.fetch(pinned.ragempMessageId),
      channel.messages.fetch(pinned.redmMessageId)
    ]);

    const [ragempEmbed, redmEmbed] = await Promise.all([buildRagemp(), buildRedm()]);
    await ragempMsg.edit({ embeds: [ragempEmbed] });
    await redmMsg.edit({ embeds: [redmEmbed] });

    console.log('[pingeorgia] Pinned messages updated');
  } catch (err) {
    console.error('[pingeorgia] Failed to update pinned messages:', err.message);
  }
}

if (!process.env.TOKEN) {
  console.error('❌ TOKEN is missing in .env');
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates]
});

client.commandHandlers = new Collection();

const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = require(filePath);

  if (command.data) {
    client.commandHandlers.set(command.data.name, command);
    console.log(`📦 Loaded command: /${command.data.name}`);
  }

  if (Array.isArray(command.commands)) {
    for (const cmd of command.commands) {
      client.commandHandlers.set(cmd.name, command);
      console.log(`📦 Loaded command: /${cmd.name}`);
    }
  }
}

client.once(Events.ClientReady, async readyClient => {
  console.log(`✅ Logged in as ${readyClient.user.tag}`);

  await updatePinnedMessages(readyClient);
  setInterval(() => updatePinnedMessages(readyClient), UPDATE_INTERVAL);
});

client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const handler = client.commandHandlers.get(interaction.commandName);
  if (!handler) return;

  try {
    await handler.execute(interaction);
  } catch (error) {
    console.error(error);

    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply('There was an error while running this command.');
      } else {
        await interaction.reply({
          content: 'There was an error while running this command.'
        });
      }
    } catch (replyError) {
      console.error('Failed to send error response:', replyError);
    }
  }
});


process.on('unhandledRejection', error => {
  console.error('[UNHANDLED REJECTION]', error);
});

process.on('uncaughtException', error => {
  console.error('[UNCAUGHT EXCEPTION]', error);
});

client.on('error', error => {
  console.error('[CLIENT ERROR]', error);
});

client.on('warn', warning => {
  console.warn('[CLIENT WARNING]', warning);
});

client.login(process.env.TOKEN);