const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { XMLParser } = require('fast-xml-parser');
const { Client, Collection, GatewayIntentBits, MessageFlags } = require('discord.js');

// Load tokens
const TOKENS_FILE = path.resolve(__dirname, 'tokens.json');
if (!fs.existsSync(TOKENS_FILE)) {
  console.error('tokens.json not found. Please create one based on the README.');
  process.exit(1);
}
const tokens = JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf8'));
const DISCORD_TOKEN = tokens.DISCORD_TOKEN;
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
  data = { repos: [], feeds: [], channels: [] };
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}
if (!data.feeds) data.feeds = [];
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

  await checkAllFeeds();
  setInterval(checkAllFeeds, 15 * 60 * 1000);
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
    let commitSha, tagName, relObj;
    let initialCheck = !("lastRelease" in entry) || (entry.lastRelease && entry.lastRelease.length == 0);
    try {
      // New commit?
      const commits = await githubFetch(`https://api.github.com/repos/${owner}/${name}/commits?per_page=1`);

      if (commits[0]?.sha && commits[0]?.sha !== entry.lastCommit) {
        commitSha = commits[0]?.sha;

        entry.lastCommit = commitSha;
        entry.lastCommitDate = new Date().toISOString();
      }

      // New tag?
      const tags = await githubFetch(`https://api.github.com/repos/${owner}/${name}/tags?per_page=1`);
      if (tags[0]?.name && tags[0]?.name !== entry.lastTag) {
        tagName = tags[0]?.name;
        entry.lastTag = tagName;
      }

      // New release?
      const releases = await githubFetch(`https://api.github.com/repos/${owner}/${name}/releases?per_page=1`);
      if (releases[0] && releases[0].id !== entry.lastRelease) {
        relObj = releases[0];
        entry.lastRelease = relObj.id;
      }

      if (initialCheck) //no announcement for initial check after adding repo
        return;

      if (relObj) { //send msg in order of priority - release > tag > commit
        const msg = `New release in **${entry.repo}**: **${relObj.name || relObj.tag_name}** — <${relObj.html_url}>`;
        activeChannels.forEach(ch => ch.send(msg));
      } else if (tagName) {
        const msg = `New tag in **${entry.repo}**: \`${tagName}\` — <https://github.com/${entry.repo}/releases/tag/${tagName}>`;
        activeChannels.forEach(ch => ch.send(msg));
      }
    } catch (err) {
      console.error(`Error checking ${entry.repo}:`, err.message);
    }
  }
  writeData();
}

// Extract a "owner/repo" string from a GitHub URL, or null if not a GitHub repo URL
function repoFromUrl(href) {
  if (!href) return null;
  const m = href.match(/github\.com\/([a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+?)(?:\/|$)/);
  return m ? m[1].replace(/\.git$/, '') : null;
}

// Force an array even if fast-xml-parser gave us a single object
function asArray(val) {
  if (!val) return [];
  return Array.isArray(val) ? val : [val];
}

// Poll all registered Atom/XML feeds and announce new entries for repos not manually tracked
async function checkAllFeeds() {
  if (!data.feeds || !data.feeds.length) return;
  if (!data.channels.length) return;

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

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    isArray: (name) => name === 'entry' || name === 'item',
  });

  for (const feed of data.feeds) {
    try {
      const res = await axios.get(feed.url, { headers: { 'User-Agent': 'discord-github-bot' }, timeout: 15000 });
      const raw = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
      const parsed = parser.parse(raw);

      // Support both Atom (<feed><entry>) and RSS (<rss><channel><item>)
      const entries = asArray(parsed?.feed?.entry) .concat(asArray(parsed?.rss?.channel?.item));

      if (!entries.length) continue;

      // Track whether anything changed so we only write once
      let changed = false;
      // On the very first parse of this feed, announce only the newest entry
      const isNewFeed = Object.keys(feed.lastSeen).length === 0;
      let announcedInitial = false;

      // Capture the original lastSeen state before we start modifying it
      const originalLastSeen = { ...feed.lastSeen };

      for (const entry of entries) {
        // Resolve link href — Atom uses <link href="..."/>, RSS uses <link>text</link>
        const linkHref = entry.link?.['@_href']
          || (typeof entry.link === 'string' ? entry.link : null)
          || entry.link?.['#text'];

        const repo = repoFromUrl(linkHref) || repoFromUrl(entry.id);
        if (!repo) continue;

        // Skip repos already manually tracked — they're handled by checkAllRepos
        if (data.repos.some(r => r.repo === repo)) continue;

        // Unique identifier for this entry: prefer <id>, fall back to link
        const entryId = entry.id || linkHref || '';
        const prevId = originalLastSeen[repo];

        if (prevId === entryId) continue; // nothing new

        const isFirstSeen = prevId === undefined;
        feed.lastSeen[repo] = entryId;
        changed = true;

        if (isFirstSeen) {
          // On a brand-new feed, announce only the first (newest) entry; skip the rest
          if (!isNewFeed || announcedInitial) continue;
          announcedInitial = true;
        }

        // Build announcement matching the manually-tracked repo format
        const title = typeof entry.title === 'string' ? entry.title : entry.title?.['#text'] || '';
        const msg = `New release in **${repo}**: **${title}** — <${linkHref || entryId}>`;
        activeChannels.forEach(ch => ch.send(msg));
      }

      if (changed) writeData();
    } catch (err) {
      console.error(`Error checking feed ${feed.url}:`, err.message);
    }
  }
}

// GitHub API helper
async function githubFetch(url) {
  const headers = { 'User-Agent': 'discord-github-bot' };
  if (GITHUB_TOKEN) headers['Authorization'] = `token ${GITHUB_TOKEN}`;
  const res = await axios.get(url, { headers });
  return res.data;
}

client.login(DISCORD_TOKEN);
