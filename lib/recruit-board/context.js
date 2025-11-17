const config = require('../config');

const buildBoardContext = button => {
   const baseId = button.customId;
   const ids = {
      main: baseId,
      modal: `${baseId}-modal`,
      editModalPrefix: `${baseId}-modal-edit:`,
      createButton: `${baseId}-create`,
      editButton: `${baseId}-edit`,
      deleteButton: `${baseId}-delete`,
      joinButton: `${baseId}-join`,
      editSelect: `${baseId}-edit-select`,
      deleteSelect: `${baseId}-delete-select`,
      joinSelect: `${baseId}-join-select`,
   };

   const matchableCustomIds = new Set([
      ids.main,
      ids.modal,
      ids.createButton,
      ids.editButton,
      ids.deleteButton,
      ids.joinButton,
      ids.editSelect,
      ids.deleteSelect,
      ids.joinSelect,
   ]);

   return {
      label: button.label,
      displayLabel: button.displayLabel || button.label,
      customId: button.customId,
      kind: button.kind,
      ids,
      matchableCustomIds,
   };
};

const recruitBoards = config.pinnedButtons.map(button => buildBoardContext(button));

const getBoardLabel = board => board.displayLabel || board.label;

const buildEditModalId = (board, recruitId) => `${board.ids.editModalPrefix}${recruitId}`;

const parseEditModalId = (board, customId) => {
   if (!customId.startsWith(board.ids.editModalPrefix)) {
      return null;
   }

   const id = Number(customId.slice(board.ids.editModalPrefix.length));
   return Number.isNaN(id) ? null : id;
};

const buildCreateButtonLabel = board => `${getBoardLabel(board)} 모집하기`;
const buildJoinButtonLabel = board => `${getBoardLabel(board)} 신청하기`;

module.exports = {
   recruitBoards,
   buildBoardContext,
   getBoardLabel,
   buildEditModalId,
   parseEditModalId,
   buildCreateButtonLabel,
   buildJoinButtonLabel,
};
