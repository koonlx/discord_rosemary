const { fetchPartyRecruitEntriesByKind } = require('../../lib/party-recruit-service');
const { sendEphemeralResponse } = require('../../lib/ephemeral-response');
const { getBoardLabel } = require('../../lib/recruit-board/context');
const { buildRecruitListMessage, buildBoardActionComponents } = require('../../lib/recruit-board/ui');
const { PARTY_LIST_LIMIT } = require('../../lib/recruit-board/constants');

const replyWithRecruitList = async (interaction, board) => {
   try {
      const entries = await fetchPartyRecruitEntriesByKind({
         kind: board.kind,
         limit: PARTY_LIST_LIMIT,
      });

      await sendEphemeralResponse(interaction, {
         content: buildRecruitListMessage(board, entries),
         components: buildBoardActionComponents(board),
      });
      return true;
   } catch (error) {
      console.error('Failed to load recruit list for button request:', error);
      await sendEphemeralResponse(interaction, {
         content: `⚠️ ${getBoardLabel(board)} 목록을 불러오지 못했어요. 잠시 후 다시 시도해주세요.`,
         components: [],
      });
      return true;
   }
};

const respondWithListOrFallback = async ({ interaction, board, prefix, fallbackLines = [], preferUpdate = false }) => {
   try {
      const entries = await fetchPartyRecruitEntriesByKind({
         kind: board.kind,
         limit: PARTY_LIST_LIMIT,
      });
      const listMessage = buildRecruitListMessage(board, entries);
      const content = prefix ? `${prefix}\n\n${listMessage}` : listMessage;

      await sendEphemeralResponse(
         interaction,
         {
            content,
            components: buildBoardActionComponents(board),
         },
         { preferUpdate },
      );
   } catch (error) {
      console.error('Failed to load recruit list:', error);
      const content = [prefix, ...fallbackLines].filter(Boolean).join('\n');
      await sendEphemeralResponse(
         interaction,
         {
            content,
            components: [],
         },
         { preferUpdate },
      );
   }
};

module.exports = {
   replyWithRecruitList,
   respondWithListOrFallback,
};
