const {
  SlashCommandBuilder,
  ChannelType,
  PermissionFlagsBits
} = require('discord.js');

const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
  NoSubscriberBehavior
} = require('@discordjs/voice');

const fs = require('fs');
const { SOUNDS, SOUND_CHOICES } = require('../sounds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('sounduser')
    .setDescription('Move a user to a channel, play a sound, then move them back')
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('The user to move')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('sound')
        .setDescription('Choose which sound to play')
        .setRequired(true)
        .addChoices(...SOUND_CHOICES)
    )
    .addChannelOption(option =>
      option
        .setName('channel')
        .setDescription('Voice channel to move the user to')
        .setRequired(true)
        .addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice)
    ),

  async execute(interaction) {
    try {
      if (!interaction.inGuild()) {
        return interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
      }

      await interaction.deferReply();

      const targetMember = interaction.options.getMember('user');
      const soundName = interaction.options.getString('sound', true);
      const targetChannel = interaction.options.getChannel('channel', true);
      const soundPath = SOUNDS[soundName];

      if (!targetMember) {
        return interaction.editReply('Could not find that user in this server.');
      }

      if (targetMember.user.bot) {
        return interaction.editReply('You cannot use this command on a bot.');
      }

      if (!soundPath || !fs.existsSync(soundPath)) {
        return interaction.editReply('Sound file not found.');
      }

      const originalChannel = targetMember.voice?.channel;
      if (!originalChannel) {
        return interaction.editReply('That user must be in a voice channel.');
      }

      const botMember = interaction.guild.members.me;

      if (!botMember.permissions.has(PermissionFlagsBits.MoveMembers)) {
        return interaction.editReply('I do not have permission to move members.');
      }

      const targetPerms = targetChannel.permissionsFor(botMember);
      if (!targetPerms?.has(PermissionFlagsBits.Connect)) {
        return interaction.editReply('I do not have permission to join that voice channel.');
      }
      if (!targetPerms?.has(PermissionFlagsBits.Speak)) {
        return interaction.editReply('I do not have permission to speak in that voice channel.');
      }

      // Move user to target channel
      await targetMember.voice.setChannel(targetChannel, `${interaction.user.tag} used /sounduser`);
      await interaction.editReply(`Moved **${targetMember.displayName}** to **${targetChannel.name}**, playing **${soundName}**...`);

      let connection;

      try {
        connection = joinVoiceChannel({
          channelId: targetChannel.id,
          guildId: targetChannel.guild.id,
          adapterCreator: targetChannel.guild.voiceAdapterCreator,
          selfDeaf: false
        });

        connection.on('error', error => {
          console.error('[SOUNDUSER VOICE CONNECTION ERROR]', error);
        });

        await entersState(connection, VoiceConnectionStatus.Ready, 15_000);

        const player = createAudioPlayer({
          behaviors: { noSubscriber: NoSubscriberBehavior.Play }
        });

        let done = false;
        player.on(AudioPlayerStatus.Idle, async () => {
          if (done) return;
          done = true;

          try { connection.destroy(); } catch (_) {}

          // Move user back to their original channel
          try {
            const freshMember = await interaction.guild.members.fetch(targetMember.id);
            if (freshMember.voice?.channelId === targetChannel.id) {
              await freshMember.voice.setChannel(originalChannel, 'sounduser: returning user');
              await interaction.editReply(
                `Done! Moved **${targetMember.displayName}** back to **${originalChannel.name}**.`
              );
            } else {
              await interaction.editReply(
                `Done! (**${targetMember.displayName}** had already left, couldn't move them back.)`
              );
            }
            setTimeout(() => interaction.deleteReply().catch(() => {}), 10_000);
          } catch (err) {
            console.error('[SOUNDUSER] Failed to move user back:', err);
            try {
              await interaction.editReply(
                `Done! But failed to move **${targetMember.displayName}** back to **${originalChannel.name}**.`
              );
              setTimeout(() => interaction.deleteReply().catch(() => {}), 10_000);
            } catch (_) {}
          }
        });

        player.on('error', error => {
          console.error('[SOUNDUSER AUDIO PLAYER ERROR]', error);
          try { connection.destroy(); } catch (e) { console.error(e); }
        });

        const resource = createAudioResource(soundPath, { metadata: { title: soundName } });
        connection.subscribe(player);
        player.play(resource);

      } catch (error) {
        console.error('[SOUNDUSER EXECUTION ERROR]', error);

        if (connection) {
          try { connection.destroy(); } catch (e) { console.error(e); }
        }

        // Best-effort move user back on failure
        try {
          const freshMember = await interaction.guild.members.fetch(targetMember.id);
          if (freshMember.voice?.channelId === targetChannel.id) {
            await freshMember.voice.setChannel(originalChannel, 'sounduser: error recovery');
          }
        } catch (e) { /* best effort */ }

        return interaction.followUp({ content: 'Failed to join the voice channel or play the sound.' });
      }

    } catch (error) {
      console.error('[TOP LEVEL /sounduser ERROR]', error);
      try {
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply('There was an error while running /sounduser.');
        } else {
          await interaction.reply({ content: 'There was an error while running /sounduser.' });
        }
      } catch (e) {
        console.error('[SOUNDUSER] Error while sending error message:', e);
      }
    }
  }
};
