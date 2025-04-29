const { SlashCommandBuilder, MessageFlags } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('addrepo')
    .setDescription('Monitor a GitHub repo for updates')
    .addStringOption(option =>
      option.setName('repo')
        .setDescription('Repository in owner/repo format')
        .setRequired(true)
    ),
  async execute(interaction, data, writeData) {
    const repo = interaction.options.getString('repo');
    if (data.repos.some(r => r.repo === repo)) {
      return interaction.reply({ content: `${repo} is already monitored.`, flags: MessageFlags.Ephemeral });
    }
    data.repos.push({ repo, lastCommit: null, lastTag: null, lastRelease: null });
    writeData();
    return interaction.reply({ content: `✅ Now monitoring **${repo}**.`, flags: MessageFlags.Ephemeral });
  }
};