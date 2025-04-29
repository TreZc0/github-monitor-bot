const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { Client, Collection, GatewayIntentBits, MessageFlags } = require('discord.js');

// Load tokens
const TOKENS_FILE = path.resolve(__dirname, 'tokens.json');
if (!fs.existsSync(TOKENS_FILE)) {
  console.error('tokens.json not found. Please create one based on the README.');
  process.exit(1);
}
const tokens = JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf8'));
const DISCORD_TOKEN = tokensv.DISCORD_TOKEN;
const GITHUB_TOKEN = tokens.GITHUB_TOKEN || '';
if (!DISCORD_TOKEN) {
  console.error('DISCORD_TOKEN must be defined in tokens.json.');
  process.exit(1);
}

// Initialize Discord client
const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.commands = new Collection();

// Load command modules
const commandsPath = path.join(__dirname, 'commands');
if (fs.existsSync(commandsPath)) {
  const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));
  for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    client.commands.set(command.data.name, command);
  }
}

// Data persistence
const DATA_FILE = path.resolve(__dirname, 'repos.json');
let data;
if (fs.existsSync(DATA_FILE)) {
  data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
} else {
  data = { repos: [], channels: [] };
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}
function writeData() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// Register slash commands and start polling when ready
client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);

  // Register commands per guild
  const guilds = client.guilds.cache.map(g => g.id);
  for (const guildId of guilds) {
    const cmdData = client.commands.map(cmd => cmd.data.toJSON());
    await client.guilds.cache.get(guildId)?.commands.set(cmdData);
  }

  // Initial check and periodic polling
  await checkAllRepos();
  setInterval(checkAllRepos, 30 * 60 * 1000);
});

// Command handling
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  const command = client.commands.get(interaction.commandName);
  if (!command) return;
  try {
    await command.execute(interaction, data, writeData);
  } catch (error) {
    console.error(error);
    interaction.reply({ content: 'There was an error executing that command.', flags: MessageFlags.Ephemeral });
  }
});

// Poll GitHub and send updates
async function checkAllRepos() {
  if (!data.channels.length || !data.repos.length) return;

  // Fetch active channels
  const activeChannels = [];
  for (const cfg of data.channels) {
    try {
      const ch = await client.channels.fetch(cfg.channelId);
      if (ch) activeChannels.push(ch);
    } catch {
      console.error('Invalid channel config:', cfg);
    }
  }
  if (!activeChannels.length) return;

  for (const entry of data.repos) {
    const [owner, name] = entry.repo.split('/');
    try {
      // New commit?
      const commits = await githubFetch(`https://api.github.com/repos/${owner}/${name}/commits?per_page=1`);
      const commitSha = commits[0]?.sha;
      if (commitSha && commitSha !== entry.lastCommit) {
        const msg = `🔄 New commit in **${entry.repo}**: https://github.com/${entry.repo}/commit/${commitSha}`;
        activeChannels.forEach(ch => ch.send(msg));
        entry.lastCommit = commitSha;
      }

      // New tag?
      const tags = await githubFetch(`https://api.github.com/repos/${owner}/${name}/tags?per_page=1`);
      const tagName = tags[0]?.name;
      if (tagName && tagName !== entry.lastTag) {
        const msg = `🏷️ New tag in **${entry.repo}**: \`${tagName}\` — https://github.com/${entry.repo}/releases/tag/${tagName}`;
        activeChannels.forEach(ch => ch.send(msg));
        entry.lastTag = tagName;
      }

      // New release?
      const releases = await githubFetch(`https://api.github.com/repos/${owner}/${name}/releases?per_page=1`);
      const rel = releases[0];
      if (rel && rel.id !== entry.lastRelease) {
        const msg = `🚀 New release in **${entry.repo}**: **${rel.name || rel.tag_name}** — ${rel.html_url}`;
        activeChannels.forEach(ch => ch.send(msg));
        entry.lastRelease = rel.id;
      }
    } catch (err) {
      console.error(`Error checking ${entry.repo}:`, err.message);
    }
  }
  writeData();
}

// GitHub API helper
async function githubFetch(url) {
  const headers = { 'User-Agent': 'discord-github-bot' };
  if (GITHUB_TOKEN) headers['Authorization'] = `token ${GITHUB_TOKEN}`;
  const res = await axios.get(url, { headers });
  return res.data;
}

client.login(DISCORD_TOKEN);
