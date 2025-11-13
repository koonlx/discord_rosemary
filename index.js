const { Client, Events } = require('discord.js');
const config = require('./lib/config');
const { ensurePinnedMessage } = require('./lib/pinned-message');
const { cleanBotActivity } = require('./lib/activity-cleanup');

const client = new Client({ intents: config.clientIntents });

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}`);

  try {
    const channel = await readyClient.channels.fetch(config.pinnedChannelId);
    if (!channel) {
      throw new Error('Configured pinned channel was not found.');
    }

    const { deletedCount } = await cleanBotActivity({
      channel,
      botUserId: readyClient.user.id,
    });

    if (deletedCount) {
      console.log(`Deleted ${deletedCount} previous bot messages.`);
    }

    const { alreadyPinned, message } = await ensurePinnedMessage({
      channel,
      content: config.pinnedMessage,
      botUserId: readyClient.user.id,
      buttons: config.pinnedButtons,
    });

    if (alreadyPinned) {
      console.log('Pinned message already exists, skipping.');
    } else {
      console.log(`Pinned new message at ${message.url}`);
    }
  } catch (error) {
    console.error('Failed to ensure pinned message:', error);
  }
});

client.on(Events.Error, (error) => {
  console.error('Discord client error:', error);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
});

client.login(config.discordToken).catch((error) => {
  console.error('Failed to authenticate with Discord:', error);
  process.exit(1);
});
