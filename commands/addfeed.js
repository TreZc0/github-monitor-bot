const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const axios = require('axios');
const { XMLParser } = require('fast-xml-parser');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('add-feed')
    .setDescription('Monitor an Atom/XML feed for repository updates')
    .addStringOption(option =>
      option.setName('url')
        .setDescription('URL to an Atom/XML feed (e.g. a recent.atom file)')
        .setRequired(true)
    ),
  async execute(interaction, data, writeData) {
    const url = interaction.options.getString('url').trim();

    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return interaction.reply({
        content: 'Please provide a valid HTTP/HTTPS URL.',
        flags: MessageFlags.Ephemeral
      });
    }

    if (!data.feeds) data.feeds = [];

    if (data.feeds.some(f => f.url === url)) {
      return interaction.reply({ content: 'That feed is already being monitored.', flags: MessageFlags.Ephemeral });
    }

    // Validate the URL is reachable and looks like XML/Atom
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      const res = await axios.get(url, { headers: { 'User-Agent': 'discord-github-bot' }, timeout: 10000 });
      const contentType = res.headers['content-type'] || '';
      const body = res.data;
      if (typeof body !== 'string' && typeof body !== 'object') {
        return interaction.editReply('Could not parse the feed — unexpected response type.');
      }
      const raw = typeof body === 'string' ? body : JSON.stringify(body);
      if (!raw.includes('<feed') && !raw.includes('<rss') && !raw.includes('<channel')) {
        return interaction.editReply('The URL does not appear to be an Atom/RSS feed.');
      }
    } catch (err) {
      return interaction.editReply(`Failed to fetch the feed: ${err.message}`);
    }

    data.feeds.push({ url, lastSeen: {} });
    writeData();
    return interaction.editReply(`Now monitoring feed: <${url}>`);
  }
};
