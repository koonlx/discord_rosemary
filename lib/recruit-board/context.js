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
      cancelButton: `${baseId}-cancel`,
      editSelect: `${baseId}-edit-select`,
      deleteSelect: `${baseId}-delete-select`,
      joinSelect: `${baseId}-join-select`,
      cancelSelect: `${baseId}-cancel-select`,
   };

   const matchableCustomIds = new Set([
      ids.main,
      ids.modal,
      ids.createButton,
      ids.editButton,
      ids.deleteButton,
      ids.joinButton,
      ids.cancelButton,
      ids.editSelect,
      ids.deleteSelect,
      ids.joinSelect,
      ids.cancelSelect,
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
const boardByKind = new Map();
recruitBoards.forEach(board => {
   boardByKind.set(board.kind, board);
});

const getBoardLabel = board => board.displayLabel || board.label;
const findBoardByKind = kind => boardByKind.get(kind) || null;
const getBoardLabelByKind = kind => {
   const board = findBoardByKind(kind);
   return board ? getBoardLabel(board) : null;
};

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
   getBoardLabelByKind,
   findBoardByKind,
   buildEditModalId,
   parseEditModalId,
   buildCreateButtonLabel,
   buildJoinButtonLabel,
};
