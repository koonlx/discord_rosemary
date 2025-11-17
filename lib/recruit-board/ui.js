const {
   ActionRowBuilder,
   ButtonBuilder,
   ButtonStyle,
   StringSelectMenuBuilder,
   ModalBuilder,
   TextInputBuilder,
   TextInputStyle,
} = require('discord.js');
const { getBoardLabel, buildCreateButtonLabel, buildJoinButtonLabel } = require('./context');
const {
   TITLE_INPUT_ID,
   TIME_INPUT_ID,
   CONDITION_INPUT_ID,
   MEMBER_LIMIT_INPUT_ID,
} = require('./constants');

const formatRecruitEntry = (entry, index) => {
   const statusLabel = entry.isCompleted ? '마감' : '모집중';
   const lines = [`${index + 1}. ${entry.title} (${statusLabel})`];
   lines.push(`   • 인원: ${entry.memberCount}/${entry.memberLimit}`);
   lines.push(`   • 시간: ${entry.time}`);

   if (entry.condition) {
      lines.push(`   • 조건: ${entry.condition}`);
   }

   if (entry.userDiscordId) {
      lines.push(`   • 모집자: <@${entry.userDiscordId}>`);
   }

   return lines.join('\n');
};

const buildRecruitListMessage = (board, entries = []) => {
   const boardLabel = getBoardLabel(board);

   if (!entries.length) {
      return [
         `📋 ${boardLabel} 모집 목록`,
         '• 아직 등록된 모집글이 없어요.',
         `• 하단의 "${buildCreateButtonLabel(board)}" 버튼을 눌러 첫 모집글을 작성해보세요.`,
      ].join('\n');
   }

   const header = `📋 ${boardLabel} 모집 목록 (최근 ${entries.length}건)`;
   const body = entries.map((entry, index) => formatRecruitEntry(entry, index));
   return [header, body.join('\n\n')].join('\n\n');
};

const buildBoardActionComponents = board => [
   new ActionRowBuilder().addComponents(
      new ButtonBuilder()
         .setCustomId(board.ids.createButton)
         .setLabel(buildCreateButtonLabel(board))
         .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
         .setCustomId(board.ids.joinButton)
         .setLabel(buildJoinButtonLabel(board))
         .setStyle(ButtonStyle.Success),
   ),
   new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(board.ids.editButton).setLabel('내 모집글 편집').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(board.ids.deleteButton).setLabel('내 모집글 삭제').setStyle(ButtonStyle.Danger),
   ),
];

const buildRecruitSelectRow = ({ customId, placeholder, entries }) => {
   const menu = new StringSelectMenuBuilder()
      .setCustomId(customId)
      .setPlaceholder(placeholder)
      .addOptions(
         entries.slice(0, 25).map(entry => ({
            label: entry.title.slice(0, 100),
            description: `인원 ${entry.memberCount}/${entry.memberLimit} • ${entry.time}`.slice(0, 100),
            value: String(entry.id),
         })),
      );

   return new ActionRowBuilder().addComponents(menu);
};

const buildRecruitModal = (
   board,
   { customId = board.ids.modal, title = '', time = '', condition = '', memberLimit = '' } = {},
) => {
   const modal = new ModalBuilder().setCustomId(customId).setTitle(`${getBoardLabel(board)} 모집`);

   const titleInput = new TextInputBuilder()
      .setCustomId(TITLE_INPUT_ID)
      .setLabel('모집 제목')
      .setPlaceholder('예: 310 공방 파티 구함')
      .setRequired(true)
      .setMaxLength(255)
      .setStyle(TextInputStyle.Short);

   if (title) {
      titleInput.setValue(title);
   }

   const timeInput = new TextInputBuilder()
      .setCustomId(TIME_INPUT_ID)
      .setLabel('출발 시간 / 조건')
      .setPlaceholder('예: 오늘 22:00 출발 예정')
      .setRequired(true)
      .setMaxLength(255)
      .setStyle(TextInputStyle.Short);

   if (time) {
      timeInput.setValue(time);
   }

   const conditionInput = new TextInputBuilder()
      .setCustomId(CONDITION_INPUT_ID)
      .setLabel('추가 조건 (선택)')
      .setPlaceholder('예: 310 공방 이상, 디코 가능')
      .setRequired(false)
      .setMaxLength(255)
      .setStyle(TextInputStyle.Short);

   if (condition) {
      conditionInput.setValue(condition);
   }

   const memberLimitInput = new TextInputBuilder()
      .setCustomId(MEMBER_LIMIT_INPUT_ID)
      .setLabel('인원 제한 (명)')
      .setPlaceholder('예: 5')
      .setRequired(true)
      .setMaxLength(3)
      .setStyle(TextInputStyle.Short);

   if (memberLimit) {
      memberLimitInput.setValue(String(memberLimit));
   }

   modal.addComponents(
      new ActionRowBuilder().addComponents(titleInput),
      new ActionRowBuilder().addComponents(timeInput),
      new ActionRowBuilder().addComponents(conditionInput),
      new ActionRowBuilder().addComponents(memberLimitInput),
   );

   return modal;
};

module.exports = {
   buildRecruitListMessage,
   buildBoardActionComponents,
   buildRecruitSelectRow,
   buildRecruitModal,
};
