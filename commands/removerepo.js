const { SlashCommandBuilder, MessageFlags } = require('discord.js');

function parseGitHubRepo(input) {
  // Remove leading/trailing whitespace
  input = input.trim();

  // Pattern 1: owner/repo format
  const simplePattern = /^([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)$/;
  const simpleMatch = input.match(simplePattern);
  if (simpleMatch) {
    return `${simpleMatch[1]}/${simpleMatch[2]}`;
  }

  // Pattern 2: GitHub URL (with or without protocol, with or without .git)
  const urlPattern = /^(?:https?:\/\/)?(?:www\.)?github\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+?)(?:\.git)?(?:\/)?$/;
  const urlMatch = input.match(urlPattern);
  if (urlMatch) {
    return `${urlMatch[1]}/${urlMatch[2]}`;
  }

  return null;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('removerepo')
    .setDescription('Stop monitoring a GitHub repo')
    .addStringOption(option =>
      option.setName('repo')
        .setDescription('Repository in owner/repo format or GitHub URL')
        .setRequired(true)
    ),
  async execute(interaction, data, writeData) {
    const input = interaction.options.getString('repo');
    const repo = parseGitHubRepo(input);

    if (!repo) {
      return interaction.reply({
        content: 'Invalid repository format. Please use either:\n• `owner/repo`\n• `https://github.com/owner/repo`\n• `github.com/owner/repo`',
        flags: MessageFlags.Ephemeral
      });
    }

    const index = data.repos.findIndex(r => r.repo === repo);
    if (index === -1) {
      return interaction.reply({
        content: `Repository **${repo}** is not being monitored.`,
        flags: MessageFlags.Ephemeral
      });
    }

    data.repos.splice(index, 1);
    writeData();
    return interaction.reply({
      content: `Stopped monitoring **${repo}**.`,
      flags: MessageFlags.Ephemeral
    });
  }
};
