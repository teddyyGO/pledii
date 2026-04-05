const { SlashCommandBuilder, EmbedBuilder, ApplicationIntegrationType, InteractionContextType } = require('discord.js');
const path = require('path');
const fs = require('fs');

const CONFIG_PATH = path.join(__dirname, '..', 'georgian-servers.json');
const BANNER = 'https://media.discordapp.net/attachments/927693311039402025/1490002133687468114/image.png';

let cache = { data: null, timestamp: 0 };
const CACHE_TTL = 30_000;

function loadManualList() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')).redm ?? [];
  } catch {
    return [];
  }
}

function stripColors(str) {
  return str.replace(/\^[0-9a-zA-Z]/g, '').trim();
}

async function fetchSingleServer(endpoint) {
  try {
    const res = await fetch(
      `https://servers-frontend.fivem.net/api/servers/single/${encodeURIComponent(endpoint)}`
    );
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function fetchAutoDetected() {
  try {
    const res = await fetch(
      'https://servers-frontend.fivem.net/api/servers/streamRedir/?locale=ka-GE&gameName=redm',
      { signal: AbortSignal.timeout(15_000) }
    );
    if (!res.ok) return [];

    const text = await res.text();
    const servers = [];
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      try { servers.push(JSON.parse(line)); } catch { /* skip malformed */ }
    }
    return servers;
  } catch (err) {
    console.warn('[/redm] Auto-detect failed:', err.message);
    return [];
  }
}

function formatServer(data, endpoint) {
  return {
    endpoint,
    hostname: stripColors(data.hostname || data.sv_hostname || endpoint),
    clients: data.clients ?? 0,
    maxclients: data.sv_maxclients ?? data.svMaxclients ?? '?'
  };
}

async function buildEmbed() {
  let servers;

  if (cache.data && Date.now() - cache.timestamp < CACHE_TTL) {
    servers = cache.data;
  } else {
    const manualList = loadManualList();
    const seen = new Set();
    const results = [];

    for (const endpoint of manualList) {
      const raw = await fetchSingleServer(endpoint);
      if (raw?.Data) {
        seen.add(endpoint);
        results.push(formatServer(raw.Data, endpoint));
      } else {
        console.warn(`[/redm] Could not fetch manual server: ${endpoint}`);
      }
    }

    const autoDetected = await fetchAutoDetected();
    for (const s of autoDetected) {
      const ep = s.EndPoint;
      if (!ep || seen.has(ep)) continue;
      seen.add(ep);
      results.push(formatServer(s.Data, ep));
    }

    servers = results.sort((a, b) => b.clients - a.clients);
    cache = { data: servers, timestamp: Date.now() };
  }

  const embed = new EmbedBuilder()
    .setTitle('🇬🇪 ქართული RedM სერვერები')
    .setColor(0x8B0000)
    .setImage(BANNER)
    .setTimestamp();

  if (servers.length === 0) {
    embed.setDescription('ქართული სერვერები ვერ მოიძებნა.');
    return embed;
  }

  const totalPlayers = servers.reduce((sum, s) => sum + s.clients, 0);
  const online = servers.filter(s => s.clients > 0).length;

  const lines = servers.slice(0, 25).map((s, i) => {
    const rank = `\`${String(i + 1).padStart(2, ' ')}\``;
    const dot = s.clients === 0 ? '⬛' : '🟩';
    const name = s.hostname || s.endpoint;
    const display = name.length > 28 ? name.slice(0, 27) + '…' : name;
    return `${rank} ${dot} **${display}** — ${s.clients}/${s.maxclients}`;
  });

  const ts = Math.floor(Date.now() / 1000);
  embed
    .setDescription(`👥 **${totalPlayers} მოთამაშე ონლაინ** ${online} სერვერზე\n\n${lines.join('\n')}\n\n-# განახლდა <t:${ts}:R>`)

  return embed;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('redm')
    .setDescription('Show Georgian RedM servers')
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
    .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel),

  buildEmbed,

  async execute(interaction) {
    await interaction.deferReply();
    try {
      const embed = await buildEmbed();
      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.error('[/redm]', err);
      await interaction.editReply('Failed to fetch RedM server list. Try again later.');
    }
  }
};
