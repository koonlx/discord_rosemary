const { RESTJSONErrorCodes } = require('discord.js');

const IGNORABLE_DELETE_ERROR_CODES = new Set([
   RESTJSONErrorCodes.UnknownMessage,
   RESTJSONErrorCodes.UnknownInteraction,
   RESTJSONErrorCodes.UnknownWebhook,
]);

const isMessageComponentInteraction = interaction => {
   const isButton = typeof interaction.isButton === 'function' && interaction.isButton();
   const isSelect = typeof interaction.isStringSelectMenu === 'function' && interaction.isStringSelectMenu();
   return isButton || isSelect;
};

const activeEphemeralReplies = new Map();

const shouldCreateNewEphemeralReply = (interaction, { preferUpdate = false } = {}) => {
   if (!interaction?.user) {
      return false;
   }

   if (interaction.deferred || interaction.replied) {
      return false;
   }

   if (preferUpdate && isMessageComponentInteraction(interaction)) {
      return false;
   }

   return true;
};

const deletePreviousEphemeralReply = async interaction => {
   const userId = interaction?.user?.id;
   if (!userId) {
      return;
   }

   const previousReply = activeEphemeralReplies.get(userId);
   if (!previousReply || previousReply.interactionId === interaction.id) {
      return;
   }

   try {
      await previousReply.interaction.deleteReply();
   } catch (error) {
      if (!IGNORABLE_DELETE_ERROR_CODES.has(error?.code)) {
         console.warn('Failed to delete previous ephemeral response:', error);
      }
   }

   activeEphemeralReplies.delete(userId);
};

const rememberEphemeralReply = interaction => {
   const userId = interaction?.user?.id;
   if (!userId) {
      return;
   }

   activeEphemeralReplies.set(userId, {
      interaction,
      interactionId: interaction.id,
   });
};

const ensureEphemeralReply = async (interaction, { preferUpdate = false } = {}) => {
   if (interaction.deferred || interaction.replied) {
      return;
   }

   if (preferUpdate && isMessageComponentInteraction(interaction)) {
      await interaction.deferUpdate();
      return;
   }

   await interaction.deferReply({ ephemeral: true });
};

const sendEphemeralResponse = async (interaction, payload, options) => {
   if (shouldCreateNewEphemeralReply(interaction, options)) {
      await deletePreviousEphemeralReply(interaction);
   }

   await ensureEphemeralReply(interaction, options);
   await interaction.editReply(payload);
   rememberEphemeralReply(interaction);
};

const replyWithValidationError = async (interaction, errors) => {
   const content = ['❌ 입력한 정보를 확인해주세요.', ...errors.map(text => `• ${text}`)].join('\n');

   await sendEphemeralResponse(interaction, {
      content,
      components: [],
   });
};

module.exports = {
   ensureEphemeralReply,
   sendEphemeralResponse,
   replyWithValidationError,
};
