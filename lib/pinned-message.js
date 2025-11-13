const { ChannelType } = require('discord.js');

const ensurePinnedMessage = async ({ channel, content, botUserId }) => {
  if (!channel || channel.type !== ChannelType.GuildText) {
    throw new Error('Pin target must be a text channel.');
  }

  const pinnedMessages = await channel.messages.fetchPinned();
  const existingMessage = pinnedMessages.find(
    (message) => message.author.id === botUserId && message.content === content,
  );

  if (existingMessage) {
    return {
      alreadyPinned: true,
      message: existingMessage,
    };
  }

  const sentMessage = await channel.send({ content });
  await sentMessage.pin();

  return {
    alreadyPinned: false,
    message: sentMessage,
  };
};

module.exports = {
  ensurePinnedMessage,
};
