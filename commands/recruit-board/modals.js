const {
   createPartyRecruitEntry,
   updatePartyRecruitEntry,
} = require('../../lib/party-recruit-service');
const { refreshPinnedMessage } = require('../../lib/pinned-message-refresh');
const { sendEphemeralResponse, replyWithValidationError } = require('../../lib/ephemeral-response');
const { getBoardLabel, parseEditModalId } = require('../../lib/recruit-board/context');
const { collectModalInput, translateRecruitError } = require('../../lib/recruit-board/utils');
const { respondWithListOrFallback } = require('./responses');

const handleCreateSubmit = async (interaction, payload, board) => {
   try {
      await createPartyRecruitEntry({
         discordUser: interaction.user,
         title: payload.title,
         time: payload.time,
         kind: board.kind,
         condition: payload.condition,
         memberLimit: payload.memberLimit,
      });

      try {
         await refreshPinnedMessage({ client: interaction.client });
      } catch (error) {
         console.error('Failed to refresh pinned message after recruit creation:', error);
      }

      await respondWithListOrFallback({
         interaction,
         board,
         prefix: `✅ ${getBoardLabel(board)} 모집을 저장했어요.`,
         fallbackLines: [
            `• 제목: ${payload.title}`,
            `• 시간: ${payload.time}`,
            payload.condition ? `• 조건: ${payload.condition}` : null,
            `• 인원 제한: ${payload.memberLimit}명`,
         ].filter(Boolean),
      });
      return true;
   } catch (error) {
      console.error('Failed to store recruit:', error);
      await sendEphemeralResponse(interaction, {
         content: '⚠️ 모집 정보를 저장하지 못했어요. 잠시 후 다시 시도해주세요.',
         components: [],
      });
      return true;
   }
};

const handleEditSubmit = async (interaction, payload, recruitId, board) => {
   try {
      const updated = await updatePartyRecruitEntry({
         recruitId,
         discordUser: interaction.user,
         title: payload.title,
         time: payload.time,
         condition: payload.condition,
         memberLimit: payload.memberLimit,
      });

      try {
         await refreshPinnedMessage({ client: interaction.client });
      } catch (error) {
         console.error('Failed to refresh pinned message after recruit edit:', error);
      }

      await respondWithListOrFallback({
         interaction,
         board,
         prefix: `✏️ ${getBoardLabel(board)} 모집을 수정했어요.`,
         fallbackLines: [
            `• 제목: ${updated.title}`,
            `• 시간: ${updated.time}`,
            updated.condition ? `• 조건: ${updated.condition}` : null,
            `• 인원 제한: ${updated.memberLimit}명`,
         ].filter(Boolean),
      });
      return true;
   } catch (error) {
      console.error('Failed to edit recruit:', error);
      const friendlyMessage = translateRecruitError(error);
      await sendEphemeralResponse(interaction, {
         content: friendlyMessage || '⚠️ 모집 정보를 수정하지 못했어요. 잠시 후 다시 시도해주세요.',
         components: [],
      });
      return true;
   }
};

const handleModalInteraction = async (interaction, board) => {
   const recruitId = parseEditModalId(board, interaction.customId);
   const payload = collectModalInput(interaction);

   if (payload.errors.length) {
      await replyWithValidationError(interaction, payload.errors);
      return true;
   }

   if (recruitId) {
      return handleEditSubmit(interaction, payload, recruitId, board);
   }

   return handleCreateSubmit(interaction, payload, board);
};

module.exports = {
   handleModalInteraction,
};
