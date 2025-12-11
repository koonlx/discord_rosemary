const config = require('../../lib/config');
const {
   fetchPartyRecruitsByUser,
   fetchPartyRecruitsByMember,
   fetchPartyRecruitEntryById,
   deletePartyRecruitEntry,
   cancelPartyRecruitApplication,
} = require('../../lib/party-recruit-service');
const { isRecruitManager } = require('../../lib/permissions');
const { sendEphemeralResponse } = require('../../lib/ephemeral-response');
const {
   buildPersonalRecruitSummary,
   buildPersonalActionComponents,
   buildRecruitSelectRow,
   buildRecruitModal,
} = require('../../lib/recruit-board/ui');
const { buildEditModalId, findBoardByKind } = require('../../lib/recruit-board/context');
const { translateRecruitError, formatMemberMentions, formatHostInputValue } = require('../../lib/recruit-board/utils');
const { refreshPinnedMessage } = require('../../lib/pinned-message-refresh');

const PERSONAL_BUTTONS = config.myRecruitSummaryButton || {};
const {
   customId: PERSONAL_SUMMARY_ID,
   editButtonId: PERSONAL_EDIT_BUTTON_ID,
   deleteButtonId: PERSONAL_DELETE_BUTTON_ID,
   leaveButtonId: PERSONAL_LEAVE_BUTTON_ID,
   editSelectId: PERSONAL_EDIT_SELECT_ID,
   deleteSelectId: PERSONAL_DELETE_SELECT_ID,
   leaveSelectId: PERSONAL_LEAVE_SELECT_ID,
} = PERSONAL_BUTTONS;

const sendSimpleNotice = async (interaction, content) => {
   await sendEphemeralResponse(
      interaction,
      {
         content,
         components: [],
      },
      { preferUpdate: true },
   );
};

const buildPersonalSummaryPayload = async (interaction, { prefix } = {}) => {
   const [hostedEntries, joinedEntries] = await Promise.all([
      fetchPartyRecruitsByUser({ discordUserId: interaction.user.id }),
      fetchPartyRecruitsByMember({ discordUserId: interaction.user.id }),
   ]);

   const summary = buildPersonalRecruitSummary({ hostedEntries, joinedEntries });
   const content = prefix ? `${prefix}\n\n${summary}` : summary;

   return {
      content,
      components: buildPersonalActionComponents(PERSONAL_BUTTONS),
   };
};

const respondWithPersonalSummary = async ({ interaction, prefix, preferUpdate = false }) => {
   try {
      const payload = await buildPersonalSummaryPayload(interaction, { prefix });
      await sendEphemeralResponse(interaction, payload, { preferUpdate });
      return true;
   } catch (error) {
      console.error('Failed to load personal recruit summary:', error);
      await sendEphemeralResponse(
         interaction,
         {
            content: '⚠️ 내 모집 목록을 불러오지 못했어요. 잠시 후 다시 시도해주세요.',
            components: [],
         },
         { preferUpdate },
      );
      return true;
   }
};

const showEditModalForEntry = async (interaction, entry) => {
   const board = findBoardByKind(entry.kind);
   if (!board) {
      await sendSimpleNotice(interaction, '⚠️ 해당 모집글 정보를 찾지 못했어요.');
      return true;
   }

   const modal = buildRecruitModal(board, {
      customId: buildEditModalId(board, entry.id),
      title: entry.title,
      time: entry.time,
      condition: entry.condition ?? '',
      memberLimit: entry.memberLimit,
      hostInputValue: formatHostInputValue(entry),
      enableHostInput: isRecruitManager(interaction.user),
   });
   await interaction.showModal(modal);
   return true;
};

const handlePersonalSummaryButton = async interaction => respondWithPersonalSummary({ interaction });

const handlePersonalEditButton = async interaction => {
   try {
      const entries = await fetchPartyRecruitsByUser({ discordUserId: interaction.user.id });
      if (!entries.length) {
         await sendSimpleNotice(interaction, '✏️ 수정할 수 있는 모집글이 없어요.');
         return true;
      }

      if (entries.length === 1) {
         return showEditModalForEntry(interaction, entries[0]);
      }

      if (!PERSONAL_EDIT_SELECT_ID) {
         await sendSimpleNotice(interaction, '⚠️ 수정할 모집글을 선택할 수 없어요.');
         return true;
      }

      await sendEphemeralResponse(
         interaction,
         {
            content: '✏️ 수정할 모집글을 선택해주세요.',
            components: [
               buildRecruitSelectRow({
                  customId: PERSONAL_EDIT_SELECT_ID,
                  placeholder: '수정할 모집글 선택',
                  entries,
               }),
            ],
         },
         { preferUpdate: true },
      );
      return true;
   } catch (error) {
      console.error('Failed to prepare personal edit selection:', error);
      await sendSimpleNotice(interaction, '⚠️ 모집글 목록을 불러오지 못했어요. 잠시 후 다시 시도해주세요.');
      return true;
   }
};

const handlePersonalDeleteButton = async interaction => {
   try {
      const entries = await fetchPartyRecruitsByUser({ discordUserId: interaction.user.id });
      if (!entries.length) {
         await sendSimpleNotice(interaction, '🗑️ 삭제할 수 있는 모집글이 없어요.');
         return true;
      }

      if (!PERSONAL_DELETE_SELECT_ID) {
         await sendSimpleNotice(interaction, '⚠️ 삭제할 모집글을 선택할 수 없어요.');
         return true;
      }

      await sendEphemeralResponse(
         interaction,
         {
            content: '🗑️ 삭제할 모집글을 선택해주세요.',
            components: [
               buildRecruitSelectRow({
                  customId: PERSONAL_DELETE_SELECT_ID,
                  placeholder: '삭제할 모집글 선택',
                  entries,
               }),
            ],
         },
         { preferUpdate: true },
      );
      return true;
   } catch (error) {
      console.error('Failed to prepare personal delete selection:', error);
      await sendSimpleNotice(interaction, '⚠️ 모집글 목록을 불러오지 못했어요. 잠시 후 다시 시도해주세요.');
      return true;
   }
};

const handlePersonalLeaveButton = async interaction => {
   try {
      const entries = await fetchPartyRecruitsByMember({ discordUserId: interaction.user.id });
      if (!entries.length) {
         await sendSimpleNotice(interaction, '🚪 탈퇴할 수 있는 파티가 없어요.');
         return true;
      }

      if (!PERSONAL_LEAVE_SELECT_ID) {
         await sendSimpleNotice(interaction, '⚠️ 탈퇴할 파티를 선택할 수 없어요.');
         return true;
      }

      await sendEphemeralResponse(
         interaction,
         {
            content: '🚪 탈퇴할 파티를 선택해주세요.',
            components: [
               buildRecruitSelectRow({
                  customId: PERSONAL_LEAVE_SELECT_ID,
                  placeholder: '탈퇴할 파티 선택',
                  entries,
               }),
            ],
         },
         { preferUpdate: true },
      );
      return true;
   } catch (error) {
      console.error('Failed to prepare personal leave selection:', error);
      await sendSimpleNotice(interaction, '⚠️ 신청 목록을 불러오지 못했어요. 잠시 후 다시 시도해주세요.');
      return true;
   }
};

const handlePersonalEditSelect = async interaction => {
   const recruitId = Number(interaction.values?.[0]);
   if (!recruitId) {
      await sendSimpleNotice(interaction, '⚠️ 선택한 모집글을 확인하지 못했어요.');
      return true;
   }

   try {
      const entry = await fetchPartyRecruitEntryById(recruitId);
      if (!entry || entry.userDiscordId !== String(interaction.user.id)) {
         await sendSimpleNotice(interaction, '⚠️ 해당 모집글을 수정할 수 없어요.');
         return true;
      }

      return showEditModalForEntry(interaction, entry);
   } catch (error) {
      console.error('Failed to open personal edit modal:', error);
      await sendSimpleNotice(interaction, '⚠️ 모집글 정보를 불러오지 못했어요. 잠시 후 다시 시도해주세요.');
      return true;
   }
};

const handlePersonalDeleteSelect = async interaction => {
   const recruitId = Number(interaction.values?.[0]);
   if (!recruitId) {
      await sendSimpleNotice(interaction, '⚠️ 선택한 모집글을 확인하지 못했어요.');
      return true;
   }

   try {
      const deletedEntry = await deletePartyRecruitEntry({
         recruitId,
         discordUser: interaction.user,
      });

      try {
         await refreshPinnedMessage({ client: interaction.client });
      } catch (error) {
         console.error('Failed to refresh pinned message after personal delete:', error);
      }

      await respondWithPersonalSummary({
         interaction,
         prefix: `🗑️ ${deletedEntry.title} 모집을 삭제했어요.`,
         preferUpdate: true,
      });
      return true;
   } catch (error) {
      console.error('Failed to delete personal recruit:', error);
      const friendlyMessage = translateRecruitError(error);
      await sendSimpleNotice(
         interaction,
         friendlyMessage || '⚠️ 모집글을 삭제하지 못했어요. 잠시 후 다시 시도해주세요.',
      );
      return true;
   }
};

const handlePersonalLeaveSelect = async interaction => {
   const recruitId = Number(interaction.values?.[0]);
   if (!recruitId) {
      await sendSimpleNotice(interaction, '⚠️ 선택한 파티를 확인하지 못했어요.');
      return true;
   }

   try {
      const updated = await cancelPartyRecruitApplication({
         recruitId,
         discordUser: interaction.user,
      });

      const applicantMentions = formatMemberMentions(updated.members);
      const prefixLines = [`🚪 ${updated.title} 모집에서 탈퇴했어요.`];
      if (applicantMentions) {
         prefixLines.push(`• 남은 신청자: ${applicantMentions}`);
      }

      await respondWithPersonalSummary({
         interaction,
         prefix: prefixLines.join('\n'),
         preferUpdate: true,
      });
      return true;
   } catch (error) {
      console.error('Failed to leave personal party:', error);
      const friendlyMessage = translateRecruitError(error);
      await sendSimpleNotice(
         interaction,
         friendlyMessage || '⚠️ 파티에서 탈퇴하지 못했어요. 잠시 후 다시 시도해주세요.',
      );
      return true;
   }
};

const isPersonalInteraction = interaction => {
   if (!interaction?.customId) {
      return false;
   }

   const buttonIds = [
      PERSONAL_SUMMARY_ID,
      PERSONAL_EDIT_BUTTON_ID,
      PERSONAL_DELETE_BUTTON_ID,
      PERSONAL_LEAVE_BUTTON_ID,
   ].filter(Boolean);

   const selectIds = [PERSONAL_EDIT_SELECT_ID, PERSONAL_DELETE_SELECT_ID, PERSONAL_LEAVE_SELECT_ID].filter(Boolean);

   if (interaction.isButton && typeof interaction.isButton === 'function' && interaction.isButton()) {
      return buttonIds.includes(interaction.customId);
   }

   if (
      interaction.isStringSelectMenu &&
      typeof interaction.isStringSelectMenu === 'function' &&
      interaction.isStringSelectMenu()
   ) {
      return selectIds.includes(interaction.customId);
   }

   return false;
};

const handlePersonalInteraction = async interaction => {
   if (interaction.isButton && typeof interaction.isButton === 'function' && interaction.isButton()) {
      if (interaction.customId === PERSONAL_SUMMARY_ID) {
         return handlePersonalSummaryButton(interaction);
      }

      if (interaction.customId === PERSONAL_EDIT_BUTTON_ID) {
         return handlePersonalEditButton(interaction);
      }

      if (interaction.customId === PERSONAL_DELETE_BUTTON_ID) {
         return handlePersonalDeleteButton(interaction);
      }

      if (interaction.customId === PERSONAL_LEAVE_BUTTON_ID) {
         return handlePersonalLeaveButton(interaction);
      }
   }

   if (
      interaction.isStringSelectMenu &&
      typeof interaction.isStringSelectMenu === 'function' &&
      interaction.isStringSelectMenu()
   ) {
      if (interaction.customId === PERSONAL_EDIT_SELECT_ID) {
         return handlePersonalEditSelect(interaction);
      }

      if (interaction.customId === PERSONAL_DELETE_SELECT_ID) {
         return handlePersonalDeleteSelect(interaction);
      }

      if (interaction.customId === PERSONAL_LEAVE_SELECT_ID) {
         return handlePersonalLeaveSelect(interaction);
      }
   }

   return false;
};

module.exports = {
   handlePersonalInteraction,
   isPersonalInteraction,
};
