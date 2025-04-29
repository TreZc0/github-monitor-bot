const { SlashCommandBuilder, MessageFlags } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setchannel')
    .setDescription('Set the channel for GitHub update notifications')
    .addChannelOption(option =>
      option.setName('channel')
        .setDescription('The channel to send updates to')
        .setRequired(true)
    ),
  async execute(interaction, data, writeData) {
    const channel = interaction.options.getChannel('channel');
    const guildId = interaction.guildId;
    const existing = data.channels.find(c => c.guildId === guildId);
    if (existing) {
      existing.channelId = channel.id;
    } else {
      data.channels.push({ guildId, channelId: channel.id });
    }
    writeData();
    return interaction.reply({ content: `✅ Updates will be sent to ${channel}.`, flags: MessageFlags.Ephemeral });
  }
};
