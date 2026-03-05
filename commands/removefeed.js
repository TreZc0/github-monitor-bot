const { SlashCommandBuilder, MessageFlags } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('remove-feed')
    .setDescription('Stop monitoring an Atom/XML feed')
    .addStringOption(option =>
      option.setName('url')
        .setDescription('URL of the feed to remove')
        .setRequired(true)
    ),
  async execute(interaction, data, writeData) {
    const url = interaction.options.getString('url').trim();

    if (!data.feeds) data.feeds = [];

    const index = data.feeds.findIndex(f => f.url === url);
    if (index === -1) {
      return interaction.reply({
        content: `No feed with that URL is currently being monitored.`,
        flags: MessageFlags.Ephemeral
      });
    }

    data.feeds.splice(index, 1);
    writeData();
    return interaction.reply({
      content: `Stopped monitoring feed: <${url}>`,
      flags: MessageFlags.Ephemeral
    });
  }
};
