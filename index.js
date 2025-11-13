const { Client, Events } = require('discord.js');
const config = require('./lib/config');
const { cleanBotActivity } = require('./lib/activity-cleanup');
const { refreshPinnedMessage } = require('./lib/pinned-message-refresh');
const { handlePartyHuntingInteraction } = require('./commands/recruit-board');

const client = new Client({ intents: config.clientIntents });

client.once(Events.ClientReady, async readyClient => {
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

      const { alreadyPinned, message } = await refreshPinnedMessage({
         client: readyClient,
         channel,
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

client.on(Events.InteractionCreate, async interaction => {
   try {
      const handled = await handlePartyHuntingInteraction(interaction);
      if (!handled) {
         return;
      }
   } catch (error) {
      console.error('Failed to process interaction:', error);

      if (!interaction.isRepliable()) {
         return;
      }

      const payload = {
         content: '⚠️ 요청을 처리하지 못했어요. 잠시 후 다시 시도해주세요.',
         ephemeral: true,
      };

      if (interaction.deferred || interaction.replied) {
         await interaction.followUp(payload);
      } else {
         await interaction.reply(payload);
      }
   }
});

client.on(Events.Error, error => {
   console.error('Discord client error:', error);
});

process.on('unhandledRejection', reason => {
   console.error('Unhandled promise rejection:', reason);
});

client.login(config.discordToken).catch(error => {
   console.error('Failed to authenticate with Discord:', error);
   process.exit(1);
});
