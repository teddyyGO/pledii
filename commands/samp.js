const { SlashCommandBuilder, EmbedBuilder, ApplicationIntegrationType, InteractionContextType } = require('discord.js');
const dgram = require('dgram');
const { recordSnapshot, getTotalHistory, generateSparkline, getPeak24h, getPeakToday, getAllServerPeaksToday } = require('../stats');
const db = require('../db');

const SERVER_HOST = '185.169.134.100';
const SERVER_PORT = 7777;
const SERVER_URL  = 'https://edrp-official.com/';

let cache = { data: null, timestamp: 0 };
const CACHE_TTL = 30_000;

/**
 * Query a SA-MP server using the SA-MP UDP query protocol.
 */
function querySamp(host, port, timeout = 6000) {
  return new Promise((resolve, reject) => {
    const socket = dgram.createSocket('udp4');

    const timer = setTimeout(() => {
      socket.close();
      reject(new Error('Query timed out'));
    }, timeout);

    socket.on('message', msg => {
      clearTimeout(timer);
      socket.close();

      try {
        let offset = 11; // skip echoed header
        offset += 1;     // password bool

        const players    = msg.readUInt16LE(offset); offset += 2;
        const maxplayers = msg.readUInt16LE(offset); offset += 2;

        const hostnameLen = msg.readUInt32LE(offset); offset += 4;
        const hostname = msg.toString('utf8', offset, offset + hostnameLen); offset += hostnameLen;

        const gamemodeLen = msg.readUInt32LE(offset); offset += 4;
        const gamemode = msg.toString('utf8', offset, offset + gamemodeLen); offset += gamemodeLen;

        const languageLen = msg.readUInt32LE(offset); offset += 4;
        const language = msg.toString('utf8', offset, offset + languageLen);

        resolve({ players, maxplayers, hostname, gamemode, language });
      } catch (err) {
        reject(new Error('Failed to parse server response'));
      }
    });

    socket.on('error', err => {
      clearTimeout(timer);
      reject(err);
    });

    // Build SA-MP query packet: "SAMP" + IP bytes + port (LE) + opcode 'i'
    const packet = Buffer.alloc(11);
    packet.write('SAMP', 0, 'ascii');
    host.split('.').forEach((octet, i) => packet.writeUInt8(parseInt(octet), 4 + i));
    packet.writeUInt16LE(port, 8);
    packet.writeUInt8('i'.charCodeAt(0), 10);

    socket.send(packet, 0, packet.length, port, host, err => {
      if (err) { clearTimeout(timer); socket.close(); reject(err); }
    });
  });
}

function clearCache() {
  cache = { data: null, timestamp: 0 };
}

async function buildEmbed() {
  let data;

  if (cache.data && Date.now() - cache.timestamp < CACHE_TTL) {
    data = cache.data;
  } else {
    data = await querySamp(SERVER_HOST, SERVER_PORT);
    cache = { data, timestamp: Date.now() };
  }

  const server = {
    addr: `${SERVER_HOST}:${SERVER_PORT}`,
    name: data.hostname,
    players: data.players,
    api_peak: null
  };

  recordSnapshot('samp', [server], data.players);

  const embed = new EmbedBuilder()
    .setTitle('🇬🇪 ქართული SA-MP სერვერები')
    .setColor(0x8B0000)
    .setTimestamp();

  const dot = data.players === 0 ? '⚫' : '🟢';
  const ts = Math.floor(Date.now() / 1000);
  const localPeaks = getAllServerPeaksToday('samp');
  const dbPeaks = await db.getServerPeaksToday('samp');
  const serverPeaks = new Map(localPeaks);
  for (const [id, peak] of dbPeaks) {
    if (peak > (serverPeaks.get(id) || 0)) serverPeaks.set(id, peak);
  }
  const serverPeak = serverPeaks.get(`${SERVER_HOST}:${SERVER_PORT}`) || 0;
  const peakStr = serverPeak > 0 ? ` (პიკი: ${serverPeak})` : '';

  embed.setDescription(`👥 **${data.players} მოთამაშე ონლაინ**\n\n\` 1\` ${dot} **${data.hostname}** — ${data.players}/${data.maxplayers}${peakStr}\n\n-# განახლდა <t:${ts}:R> • დღე იწყება 06:00-ზე`);

  const sparkline = generateSparkline(getTotalHistory('samp'));
  const peak = getPeak24h('samp');
  const todayPeak = getPeakToday('samp');

  if (sparkline || peak || todayPeak) {
    const parts = [];
    if (sparkline) parts.push(`\`${sparkline}\``);
    if (todayPeak) parts.push(`დღის პიკი: **${todayPeak.p}** <t:${todayPeak.t}:t>`);
    if (peak && (!todayPeak || peak.p !== todayPeak.p)) parts.push(`24h პიკი: **${peak.p}** <t:${peak.t}:t>`);
    embed.addFields([{ name: '📊 სტატისტიკა', value: parts.join('  '), inline: false }]);
  }

  return embed;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('samp')
    .setDescription('Show Excellent Dreams RP SA-MP server status')
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
    .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel),

  buildEmbed,
  clearCache,

  async execute(interaction) {
    await interaction.deferReply();
    try {
      const embed = await buildEmbed();
      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.error('[/samp]', err);
      await interaction.editReply('Failed to reach the SA-MP server. It may be offline.');
    }
  }
};
