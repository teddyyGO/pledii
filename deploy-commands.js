const fs = require('fs');
const path = require('path');
const { REST, Routes } = require('discord.js');
// Deploys globally so user-installed app commands work in DMs everywhere.
require('dotenv').config();

const token = process.env.TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;

if (!token) {
  console.error('❌ TOKEN is missing in .env');
  process.exit(1);
}

if (!clientId) {
  console.error('❌ CLIENT_ID is missing in .env');
  process.exit(1);
}

if (!guildId) {
  console.error('❌ GUILD_ID is missing in .env');
  process.exit(1);
}


const commands = [];
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = require(filePath);

  // Supports files with: module.exports.data
  if (command.data) {
    commands.push(command.data.toJSON());
  }

  // Supports files with: module.exports.commands = [ ... ]
  if (Array.isArray(command.commands)) {
    for (const cmd of command.commands) {
      commands.push(cmd.toJSON());
    }
  }
}

console.log('Commands to deploy:');
for (const cmd of commands) {
  console.log(`- /${cmd.name}`);
}

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
  try {
    console.log('\nRegistering slash commands...');

    const data = await rest.put(
      Routes.applicationGuildCommands(clientId, guildId),
      { body: commands }
    );

    console.log('\n✅ Successfully deployed commands:');
    for (const command of data) {
      console.log(`- /${command.name}`);
    }
  } catch (error) {
    console.error('❌ Error deploying commands:');
    console.error(error);
  }
})();