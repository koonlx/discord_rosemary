const config = require('./config');
const { ensurePinnedMessage } = require('./pinned-message');
const { fetchRecruitCountsByKind } = require('./party-counts');

const buildButtonsWithCounts = (countsByKind) =>
  config.pinnedButtons.map((button) => ({
    ...button,
    count: countsByKind.get(button.kind) ?? 0,
  }));

const resolveChannel = async ({ client, channel }) => {
  if (channel) {
    return channel;
  }

  const fetchedChannel = await client.channels.fetch(config.pinnedChannelId);
  if (!fetchedChannel) {
    throw new Error('Pinned channel not found.');
  }

  return fetchedChannel;
};

const refreshPinnedMessage = async ({ client, channel }) => {
  if (!client?.user) {
    throw new Error('Discord client is not ready.');
  }

  const targetChannel = await resolveChannel({ client, channel });
  const countsByKind = await fetchRecruitCountsByKind();
  const buttonsWithCounts = buildButtonsWithCounts(countsByKind);

  return ensurePinnedMessage({
    channel: targetChannel,
    content: config.pinnedMessage,
    botUserId: client.user.id,
    buttons: buttonsWithCounts,
  });
};

module.exports = {
  refreshPinnedMessage,
};
