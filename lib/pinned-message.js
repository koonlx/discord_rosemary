const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType } = require('discord.js');

const MAX_BUTTONS_PER_ROW = 5;

const formatButtonLabel = button => {
   if (typeof button.count === 'number') {
      return `${button.label} (${button.count})`;
   }

   return button.label;
};

const buildButtonComponents = (buttons = []) => {
   if (!buttons.length) {
      return [];
   }

   const rows = [];
   for (let i = 0; i < buttons.length; i += MAX_BUTTONS_PER_ROW) {
      const rowButtons = buttons.slice(i, i + MAX_BUTTONS_PER_ROW);
      const row = new ActionRowBuilder().addComponents(
         rowButtons.map(button =>
            new ButtonBuilder()
               .setCustomId(button.customId)
               .setLabel(formatButtonLabel(button))
               .setStyle(ButtonStyle.Primary),
         ),
      );
      rows.push(row);
   }

   return rows;
};

const messageMatchesButtons = (message, buttons = []) => {
   const targetIds = buttons.map(button => button.customId);
   const messageButtons = (message.components || []).flatMap(row => row.components || []);

   if (messageButtons.length !== targetIds.length) {
      return false;
   }

   return targetIds.every((customId, index) => messageButtons[index]?.customId === customId);
};

const ensurePinnedMessage = async ({ channel, content, botUserId, buttons = [] }) => {
   if (!channel || channel.type !== ChannelType.GuildText) {
      throw new Error('Pin target must be a text channel.');
   }

   const pinnedMessages = await channel.messages.fetchPinned();
   const existingMessage = pinnedMessages.find(
      message =>
         message.author.id === botUserId && message.content === content && messageMatchesButtons(message, buttons),
   );

   if (existingMessage) {
      await existingMessage.edit({
         content,
         components: buildButtonComponents(buttons),
      });
      return {
         alreadyPinned: true,
         message: existingMessage,
      };
   }

   const sentMessage = await channel.send({
      content,
      components: buildButtonComponents(buttons),
   });
   await sentMessage.pin();

   return {
      alreadyPinned: false,
      message: sentMessage,
   };
};

module.exports = {
   ensurePinnedMessage,
};
