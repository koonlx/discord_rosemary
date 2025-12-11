const {
   fetchPartyRecruitEntriesByKind,
   fetchPartyRecruitsByUser,
   fetchPartyRecruitsByMember,
} = require('../../lib/party-recruit-service');
const { isRecruitManager } = require('../../lib/permissions');
const { sendEphemeralResponse } = require('../../lib/ephemeral-response');
const { buildRecruitSelectRow, buildRecruitModal } = require('../../lib/recruit-board/ui');
const { buildEditModalId, getBoardLabel } = require('../../lib/recruit-board/context');
const { filterJoinableEntries, formatHostInputValue } = require('../../lib/recruit-board/utils');

const fetchManageableRecruits = (interaction, board) => {
   if (isRecruitManager(interaction.user)) {
      return fetchPartyRecruitEntriesByKind({
         kind: board.kind,
         limit: 25,
      });
   }

   return fetchPartyRecruitsByUser({
      discordUserId: interaction.user.id,
      kind: board.kind,
   });
};

const handleEditButton = async (interaction, board) => {
   try {
      const entries = await fetchManageableRecruits(interaction, board);

      if (!entries.length) {
         await sendEphemeralResponse(
            interaction,
            {
               content: `✏️ 수정할 ${getBoardLabel(board)} 모집글이 없어요.`,
               components: [],
            },
            { preferUpdate: true },
         );
         return true;
      }

      if (entries.length === 1) {
         const [entry] = entries;
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
      }

      await sendEphemeralResponse(
         interaction,
         {
            content: '✏️ 수정할 모집글을 선택해주세요.',
            components: [
               buildRecruitSelectRow({
                  customId: board.ids.editSelect,
                  placeholder: '수정할 모집글 선택',
                  entries,
               }),
            ],
         },
         { preferUpdate: true },
      );
      return true;
   } catch (error) {
      console.error('Failed to prepare edit selection:', error);
      await sendEphemeralResponse(
         interaction,
         {
            content: '⚠️ 모집글 목록을 불러오지 못했어요. 잠시 후 다시 시도해주세요.',
            components: [],
         },
         { preferUpdate: true },
      );
      return true;
   }
};

const handleDeleteButton = async (interaction, board) => {
   try {
      const entries = await fetchManageableRecruits(interaction, board);

      if (!entries.length) {
         await sendEphemeralResponse(
            interaction,
            {
               content: `🗑️ 삭제할 수 있는 ${getBoardLabel(board)} 모집글이 없어요.`,
               components: [],
            },
            { preferUpdate: true },
         );
         return true;
      }

      await sendEphemeralResponse(
         interaction,
         {
            content: '🗑️ 삭제할 모집글을 선택해주세요.',
            components: [
               buildRecruitSelectRow({
                  customId: board.ids.deleteSelect,
                  placeholder: '삭제할 모집글 선택',
                  entries,
               }),
            ],
         },
         { preferUpdate: true },
      );
      return true;
   } catch (error) {
      console.error('Failed to prepare delete selection:', error);
      await sendEphemeralResponse(
         interaction,
         {
            content: '⚠️ 모집글 목록을 불러오지 못했어요. 잠시 후 다시 시도해주세요.',
            components: [],
         },
         { preferUpdate: true },
      );
      return true;
   }
};

const handleCancelButton = async (interaction, board) => {
   try {
      const entries = await fetchPartyRecruitsByMember({
         discordUserId: interaction.user.id,
         kind: board.kind,
      });

      if (!entries.length) {
         await sendEphemeralResponse(
            interaction,
            {
               content: `❌ 취소할 수 있는 ${getBoardLabel(board)} 신청이 없어요.`,
               components: [],
            },
            { preferUpdate: true },
         );
         return true;
      }

      await sendEphemeralResponse(
         interaction,
         {
            content: '❌ 취소할 신청을 선택해주세요.',
            components: [
               buildRecruitSelectRow({
                  customId: board.ids.cancelSelect,
                  placeholder: '취소할 모집글 선택',
                  entries,
               }),
            ],
         },
         { preferUpdate: true },
      );
      return true;
   } catch (error) {
      console.error('Failed to prepare cancel selection:', error);
      await sendEphemeralResponse(
         interaction,
         {
            content: `⚠️ ${getBoardLabel(board)} 신청 목록을 불러오지 못했어요. 잠시 후 다시 시도해주세요.`,
            components: [],
         },
         { preferUpdate: true },
      );
      return true;
   }
};

const handleJoinButton = async (interaction, board) => {
   try {
      const entries = await fetchPartyRecruitEntriesByKind({
         kind: board.kind,
         limit: 25,
      });
      const joinableEntries = filterJoinableEntries(entries, interaction.user.id);

      if (!joinableEntries.length) {
         await sendEphemeralResponse(
            interaction,
            {
               content: `🙋 신청할 수 있는 ${getBoardLabel(board)} 모집이 없어요. 잠시 후 다시 확인해주세요.`,
               components: [],
            },
            { preferUpdate: true },
         );
         return true;
      }

      await sendEphemeralResponse(
         interaction,
         {
            content: '🙋 신청할 모집글을 선택해주세요.',
            components: [
               buildRecruitSelectRow({
                  customId: board.ids.joinSelect,
                  placeholder: '신청할 모집글 선택',
                  entries: joinableEntries,
               }),
            ],
         },
         { preferUpdate: true },
      );
      return true;
   } catch (error) {
      console.error('Failed to prepare join selection:', error);
      await sendEphemeralResponse(
         interaction,
         {
            content: `⚠️ ${getBoardLabel(board)} 모집 목록을 불러오지 못했어요. 잠시 후 다시 시도해주세요.`,
            components: [],
         },
         { preferUpdate: true },
      );
      return true;
   }
};

const handleButtonInteraction = async (interaction, board) => {
   if (interaction.customId === board.ids.createButton) {
      await interaction.showModal(buildRecruitModal(board, { enableHostInput: isRecruitManager(interaction.user) }));
      return true;
   }

   if (interaction.customId === board.ids.joinButton) {
      return handleJoinButton(interaction, board);
   }

   if (interaction.customId === board.ids.editButton) {
      return handleEditButton(interaction, board);
   }

   if (interaction.customId === board.ids.deleteButton) {
      return handleDeleteButton(interaction, board);
   }

   if (interaction.customId === board.ids.cancelButton) {
      return handleCancelButton(interaction, board);
   }

   return false;
};

module.exports = {
   handleButtonInteraction,
};
