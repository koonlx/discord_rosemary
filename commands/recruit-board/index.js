const { recruitBoards } = require('../../lib/recruit-board/context');
const { replyWithRecruitList } = require('./responses');
const { handleButtonInteraction } = require('./buttons');
const { handleSelectInteraction } = require('./selects');
const { handleModalInteraction } = require('./modals');

const findBoardByCustomId = customId => {
   if (!customId) {
      return null;
   }

   return recruitBoards.find(
      board => board.matchableCustomIds.has(customId) || customId.startsWith(board.ids.editModalPrefix),
   );
};

const handleBoardInteraction = async (interaction, board) => {
   if (interaction.isButton()) {
      if (interaction.customId === board.ids.main) {
         return replyWithRecruitList(interaction, board);
      }

      return handleButtonInteraction(interaction, board);
   }

   if (interaction.isStringSelectMenu()) {
      return handleSelectInteraction(interaction, board);
   }

   if (interaction.isModalSubmit()) {
      if (interaction.customId === board.ids.modal || interaction.customId.startsWith(board.ids.editModalPrefix)) {
         return handleModalInteraction(interaction, board);
      }
   }

   return false;
};

const handlePartyHuntingInteraction = async interaction => {
   const isRelevantInteraction =
      (typeof interaction.isButton === 'function' && interaction.isButton()) ||
      (typeof interaction.isStringSelectMenu === 'function' && interaction.isStringSelectMenu()) ||
      (typeof interaction.isModalSubmit === 'function' && interaction.isModalSubmit());

   if (!isRelevantInteraction) {
      return false;
   }

   const board = findBoardByCustomId(interaction.customId);
   if (!board) {
      return false;
   }

   return handleBoardInteraction(interaction, board);
};

module.exports = {
   handlePartyHuntingInteraction,
};
