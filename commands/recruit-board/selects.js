const {
   fetchPartyRecruitEntryById,
   deletePartyRecruitEntry,
   joinPartyRecruit,
   cancelPartyRecruitApplication,
} = require('../../lib/party-recruit-service');
const { isRecruitManager } = require('../../lib/permissions');
const { refreshPinnedMessage } = require('../../lib/pinned-message-refresh');
const { sendEphemeralResponse } = require('../../lib/ephemeral-response');
const { buildRecruitModal } = require('../../lib/recruit-board/ui');
const { buildEditModalId, getBoardLabel } = require('../../lib/recruit-board/context');
const { translateRecruitError, formatMemberMentions } = require('../../lib/recruit-board/utils');
const { respondWithListOrFallback } = require('./responses');

const canManageSelectedEntry = (entry, user) => {
   if (!entry || !user) {
      return false;
   }

   return entry.userDiscordId === String(user.id) || isRecruitManager(user);
};

const handleEditSelect = async (interaction, board) => {
   const recruitId = Number(interaction.values?.[0]);
   if (!recruitId) {
      await sendEphemeralResponse(
         interaction,
         {
            content: '⚠️ 선택한 모집글을 확인하지 못했어요.',
            components: [],
         },
         { preferUpdate: true },
      );
      return true;
   }

   try {
      const entry = await fetchPartyRecruitEntryById(recruitId);
      if (!entry) {
         await sendEphemeralResponse(
            interaction,
            {
               content: '⚠️ 해당 모집글을 찾을 수 없어요.',
               components: [],
            },
            { preferUpdate: true },
         );
         return true;
      }

      if (!canManageSelectedEntry(entry, interaction.user)) {
         await sendEphemeralResponse(
            interaction,
            {
               content: '⚠️ 해당 모집글을 수정할 수 없어요.',
               components: [],
            },
            { preferUpdate: true },
         );
         return true;
      }

      const modal = buildRecruitModal(board, {
         customId: buildEditModalId(board, entry.id),
         title: entry.title,
         time: entry.time,
         condition: entry.condition ?? '',
         memberLimit: entry.memberLimit,
      });
      await interaction.showModal(modal);
      return true;
   } catch (error) {
      console.error('Failed to open edit modal from selection:', error);
      await sendEphemeralResponse(
         interaction,
         {
            content: '⚠️ 모집글 정보를 불러오지 못했어요. 잠시 후 다시 시도해주세요.',
            components: [],
         },
         { preferUpdate: true },
      );
      return true;
   }
};

const handleDeleteSelect = async (interaction, board) => {
   const recruitId = Number(interaction.values?.[0]);
   if (!recruitId) {
      await sendEphemeralResponse(
         interaction,
         {
            content: '⚠️ 선택한 모집글을 확인하지 못했어요.',
            components: [],
         },
         { preferUpdate: true },
      );
      return true;
   }

   try {
      const entry = await fetchPartyRecruitEntryById(recruitId);
      if (!entry) {
         await sendEphemeralResponse(
            interaction,
            {
               content: '⚠️ 해당 모집글을 찾을 수 없어요.',
               components: [],
            },
            { preferUpdate: true },
         );
         return true;
      }

      if (!canManageSelectedEntry(entry, interaction.user)) {
         await sendEphemeralResponse(
            interaction,
            {
               content: '⚠️ 해당 모집글을 삭제할 수 없어요.',
               components: [],
            },
            { preferUpdate: true },
         );
         return true;
      }

      await deletePartyRecruitEntry({
         recruitId,
         discordUser: interaction.user,
      });

      try {
         await refreshPinnedMessage({ client: interaction.client });
      } catch (error) {
         console.error('Failed to refresh pinned message after recruit deletion:', error);
      }

      await respondWithListOrFallback({
         interaction,
         board,
         prefix: `🗑️ ${getBoardLabel(board)} 모집을 삭제했어요.`,
         fallbackLines: [`• 삭제된 모집글 ID: ${recruitId}`],
         preferUpdate: true,
      });
      return true;
   } catch (error) {
      console.error('Failed to delete recruit:', error);
      const friendlyMessage = translateRecruitError(error);
      await sendEphemeralResponse(
         interaction,
         {
            content: friendlyMessage || '⚠️ 모집글을 삭제하지 못했어요. 잠시 후 다시 시도해주세요.',
            components: [],
         },
         { preferUpdate: true },
      );
      return true;
   }
};

const handleJoinSelect = async (interaction, board) => {
   const recruitId = Number(interaction.values?.[0]);
   if (!recruitId) {
      await sendEphemeralResponse(
         interaction,
         {
            content: '⚠️ 선택한 모집글을 확인하지 못했어요.',
            components: [],
         },
         { preferUpdate: true },
      );
      return true;
   }

   try {
      const updated = await joinPartyRecruit({
         recruitId,
         discordUser: interaction.user,
      });

      const applicantMentions = formatMemberMentions(updated.members);
      const prefixLines = [`🙋 ${updated.title} 모집에 신청했어요.`];
      if (applicantMentions) {
         prefixLines.push(`• 신청자: ${applicantMentions}`);
      }

      await respondWithListOrFallback({
         interaction,
         board,
         prefix: prefixLines.join('\n'),
         fallbackLines: [
            `• 현재 인원: ${updated.memberCount}/${updated.memberLimit}`,
            applicantMentions ? `• 신청자: ${applicantMentions}` : null,
         ].filter(Boolean),
         preferUpdate: true,
      });
      return true;
   } catch (error) {
      console.error('Failed to join recruit:', error);
      const friendlyMessage = translateRecruitError(error);
      await sendEphemeralResponse(
         interaction,
         {
            content: friendlyMessage || '⚠️ 신청에 실패했어요. 잠시 후 다시 시도해주세요.',
            components: [],
         },
         { preferUpdate: true },
      );
      return true;
   }
};

const handleCancelSelect = async (interaction, board) => {
   const recruitId = Number(interaction.values?.[0]);
   if (!recruitId) {
      await sendEphemeralResponse(
         interaction,
         {
            content: '⚠️ 선택한 모집글을 확인하지 못했어요.',
            components: [],
         },
         { preferUpdate: true },
      );
      return true;
   }

   try {
      const updated = await cancelPartyRecruitApplication({
         recruitId,
         discordUser: interaction.user,
      });

      const applicantMentions = formatMemberMentions(updated.members);
      const prefixLines = [`❌ ${updated.title} 모집 신청을 취소했어요.`];
      if (applicantMentions) {
         prefixLines.push(`• 남은 신청자: ${applicantMentions}`);
      }

      await respondWithListOrFallback({
         interaction,
         board,
         prefix: prefixLines.join('\n'),
         fallbackLines: [
            `• 현재 인원: ${updated.memberCount}/${updated.memberLimit}`,
            applicantMentions ? `• 남은 신청자: ${applicantMentions}` : null,
         ].filter(Boolean),
         preferUpdate: true,
      });
      return true;
   } catch (error) {
      console.error('Failed to cancel recruit application:', error);
      const friendlyMessage = translateRecruitError(error);
      await sendEphemeralResponse(
         interaction,
         {
            content: friendlyMessage || '⚠️ 신청을 취소하지 못했어요. 잠시 후 다시 시도해주세요.',
            components: [],
         },
         { preferUpdate: true },
      );
      return true;
   }
};

const handleSelectInteraction = async (interaction, board) => {
   if (interaction.customId === board.ids.editSelect) {
      return handleEditSelect(interaction, board);
   }

   if (interaction.customId === board.ids.deleteSelect) {
      return handleDeleteSelect(interaction, board);
   }

   if (interaction.customId === board.ids.joinSelect) {
      return handleJoinSelect(interaction, board);
   }

   if (interaction.customId === board.ids.cancelSelect) {
      return handleCancelSelect(interaction, board);
   }

   return false;
};

module.exports = {
   handleSelectInteraction,
};
