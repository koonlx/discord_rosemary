const { ChannelType } = require('discord.js');

const collectBotMessages = (messages, botUserId) => {
  const targets = [];
  messages.forEach((message) => {
    if (message.author.id === botUserId) {
      targets.push(message);
    }
  });
  return targets;
};

const cleanBotActivity = async ({ channel, botUserId }) => {
  if (!channel || channel.type !== ChannelType.GuildText) {
    throw new Error('Activity cleanup target must be a text channel.');
  }

  const [pinnedMessages, recentMessages] = await Promise.all([
    channel.messages.fetchPinned(),
    channel.messages.fetch({ limit: 100 }),
  ]);

  const messagesToDelete = [
    ...collectBotMessages(pinnedMessages, botUserId),
    ...collectBotMessages(recentMessages, botUserId),
  ];

  const uniqueMessages = new Map();
  messagesToDelete.forEach((message) => {
    uniqueMessages.set(message.id, message);
  });

  let deletedCount = 0;
  for (const message of uniqueMessages.values()) {
    try {
      await message.delete();
      deletedCount += 1;
    } catch (error) {
      console.error(`Failed to delete message ${message.id}:`, error);
    }
  }

  return { deletedCount };
};

module.exports = {
  cleanBotActivity,
};
