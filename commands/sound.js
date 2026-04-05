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
    .setName('sound')
    .setDescription('Join a voice channel, play a sound, and leave')
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
        .setDescription('Optional voice channel to use')
        .setRequired(false)
    ),

  async execute(interaction) {
    try {
      if (!interaction.inGuild()) {
        return interaction.reply({ content: 'This command can only be used in a server.' });
      }

      await interaction.deferReply();

      const memberVoiceChannel = interaction.member.voice?.channel;
      const selectedChannel = interaction.options.getChannel('channel');
      const soundName = interaction.options.getString('sound', true);
      const soundPath = SOUNDS[soundName];

      console.log('--- /sound command start ---');
      console.log('Sound name:', soundName);
      console.log('Sound path:', soundPath);

      if (!soundPath) {
        return interaction.editReply('That sound does not exist.');
      }

      if (!fs.existsSync(soundPath)) {
        console.error('Sound file does not exist:', soundPath);
        return interaction.editReply(`Sound file not found:\n${soundPath}`);
      }

      const fileStats = fs.statSync(soundPath);
      console.log('File size:', fileStats.size, 'bytes');

      let voiceChannel = null;

      if (selectedChannel) {
        console.log('Selected channel:', selectedChannel.name, selectedChannel.id);

        if (
          selectedChannel.type !== ChannelType.GuildVoice &&
          selectedChannel.type !== ChannelType.GuildStageVoice
        ) {
          return interaction.editReply('The selected channel must be a voice channel.');
        }

        voiceChannel = selectedChannel;
      } else if (memberVoiceChannel) {
        console.log('Using member voice channel:', memberVoiceChannel.name, memberVoiceChannel.id);
        voiceChannel = memberVoiceChannel;
      }

      if (!voiceChannel) {
        return interaction.editReply('You must either be in a voice channel or provide one in the command.');
      }

      const botMember = interaction.guild.members.me;
      const permissions = voiceChannel.permissionsFor(botMember);

      if (!permissions?.has(PermissionFlagsBits.Connect)) {
        return interaction.editReply('I do not have permission to join that voice channel.');
      }

      if (!permissions?.has(PermissionFlagsBits.Speak)) {
        return interaction.editReply('I do not have permission to speak in that voice channel.');
      }

      await interaction.editReply(`Playing **${soundName}** in **${voiceChannel.name}**...`);
      setTimeout(() => interaction.deleteReply().catch(() => {}), 10_000);

      let connection;

      try {
        connection = joinVoiceChannel({
          channelId: voiceChannel.id,
          guildId: voiceChannel.guild.id,
          adapterCreator: voiceChannel.guild.voiceAdapterCreator,
          selfDeaf: false
        });

        connection.on('stateChange', (oldState, newState) => {
          console.log(`[VOICE CONNECTION] ${oldState.status} -> ${newState.status}`);
        });

        connection.on('error', error => {
          console.error('[VOICE CONNECTION ERROR]', error);
        });

        await entersState(connection, VoiceConnectionStatus.Ready, 15_000);
        console.log('Voice connection is ready');

        const player = createAudioPlayer({
          behaviors: {
            noSubscriber: NoSubscriberBehavior.Play
          }
        });

        player.on('stateChange', (oldState, newState) => {
          console.log(`[AUDIO PLAYER] ${oldState.status} -> ${newState.status}`);
        });

        player.on(AudioPlayerStatus.Playing, () => {
          console.log('Audio player started playing');
        });

        player.on(AudioPlayerStatus.Idle, () => {
          console.log('Audio player became idle, destroying connection');
          try {
            connection.destroy();
          } catch (err) {
            console.error('Error while destroying connection on idle:', err);
          }
        });

        player.on('error', error => {
          console.error('[AUDIO PLAYER ERROR]', error);
          try {
            connection.destroy();
          } catch (err) {
            console.error('Error while destroying connection after player error:', err);
          }
        });

        const resource = createAudioResource(soundPath, {
          metadata: {
            title: soundName
          }
        });

        console.log('Audio resource created');

        connection.subscribe(player);
        console.log('Player subscribed to connection');

        player.play(resource);
        console.log('player.play(resource) called');
      } catch (error) {
        console.error('[SOUND EXECUTION ERROR]', error);

        if (connection) {
          try {
            connection.destroy();
          } catch (destroyError) {
            console.error('Destroy connection failed:', destroyError);
          }
        }

        return interaction.followUp({
          content: 'Failed to join the voice channel or play the sound.'
        });
      }
    } catch (error) {
      console.error('[TOP LEVEL /sound ERROR]', error);

      try {
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply('There was an error while running /sound.');
        } else {
          await interaction.reply({ content: 'There was an error while running /sound.' });
        }
      } catch (replyError) {
        console.error('[ERROR WHILE SENDING ERROR MESSAGE]', replyError);
      }
    }
  }
};