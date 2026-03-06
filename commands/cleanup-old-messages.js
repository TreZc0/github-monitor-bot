const { SlashCommandBuilder, MessageFlags } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('cleanup-old-messages')
    .setDescription('Delete all messages sent by the bot (admin only)'),
  async execute(interaction, data, writeData) {
    // Only allow user trezc0_
    if (interaction.user.username !== 'trezc0_') {
      return interaction.reply({
        content: '❌ You do not have permission to use this command.',
        flags: MessageFlags.Ephemeral
      });
    }

    await interaction.reply({
      content: '🗑️ Starting cleanup of bot messages...',
      flags: MessageFlags.Ephemeral
    });

    if (!data.channels.length) {
      return interaction.followUp({
        content: 'No channels configured, nothing to clean up.',
        flags: MessageFlags.Ephemeral
      });
    }

    const client = interaction.client;
    let totalDeletedAll = 0;

    for (const cfg of data.channels) {
      try {
        const channel = await client.channels.fetch(cfg.channelId);
        if (!channel) continue;

        let totalDeleted = 0;
        let lastMessageId;

        // Fetch messages in batches (max 100 per fetch)
        while (true) {
          const options = { limit: 100 };
          if (lastMessageId) options.before = lastMessageId;

          const messages = await channel.messages.fetch(options);
          if (messages.size === 0) break;

          // Filter for bot's own messages
          const botMessages = messages.filter(msg => msg.author.id === client.user.id);

          if (botMessages.size === 0) {
            // Update lastMessageId to continue fetching older messages
            lastMessageId = messages.last().id;
            continue;
          }

          // Delete messages one by one
          for (const [, message] of botMessages) {
            try {
              await message.delete();
              totalDeleted++;
            } catch (err) {
              // Ignore errors (message might be too old or already deleted)
              console.error(`Could not delete message ${message.id}:`, err.message);
            }
          }

          lastMessageId = messages.last().id;

          // If we fetched less than 100 messages, we've reached the end
          if (messages.size < 100) break;
        }

        totalDeletedAll += totalDeleted;
        console.log(`Deleted ${totalDeleted} bot messages from channel ${channel.name || cfg.channelId}`);
      } catch (err) {
        console.error(`Error cleaning up channel ${cfg.channelId}:`, err.message);
      }
    }

    await interaction.followUp({
      content: `✅ Cleanup complete. Deleted ${totalDeletedAll} messages.`,
      flags: MessageFlags.Ephemeral
    });
  }
};
