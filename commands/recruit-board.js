const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const config = require('../lib/config');
const {
  createPartyRecruitEntry,
  fetchPartyRecruitEntriesByKind,
  fetchPartyRecruitsByUser,
  fetchPartyRecruitEntryById,
  updatePartyRecruitEntry,
  deletePartyRecruitEntry,
  joinPartyRecruit,
} = require('../lib/party-recruit-service');
const { refreshPinnedMessage } = require('../lib/pinned-message-refresh');

const TITLE_INPUT_ID = 'party-hunting-title';
const TIME_INPUT_ID = 'party-hunting-time';
const CONDITION_INPUT_ID = 'party-hunting-condition';
const MEMBER_LIMIT_INPUT_ID = 'party-hunting-member-limit';
const PARTY_LIST_LIMIT = 10;

const buildBoardContext = (button) => {
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

const recruitBoards = config.pinnedButtons.map((button) => buildBoardContext(button));

const getBoardLabel = (board) => board.displayLabel || board.label;

const buildEditModalId = (board, recruitId) => `${board.ids.editModalPrefix}${recruitId}`;

const parseEditModalId = (board, customId) => {
  if (!customId.startsWith(board.ids.editModalPrefix)) {
    return null;
  }

  const id = Number(customId.slice(board.ids.editModalPrefix.length));
  return Number.isNaN(id) ? null : id;
};

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

const translateRecruitError = (error) => {
  const message = error?.message || '';
  if (message.includes('not found')) {
    return '해당 모집글을 찾을 수 없어요.';
  }

  if (
    message.includes('modify your own')
    || message.includes('delete your own')
    || message.includes('manage your own')
  ) {
    return '본인이 등록한 모집글만 관리할 수 있어요.';
  }

  if (message.includes('join your own')) {
    return '본인이 등록한 모집에는 신청할 수 없어요.';
  }

  if (message.includes('already full')) {
    return '이미 인원이 가득 찼어요.';
  }

  if (message.includes('already joined')) {
    return '이미 신청한 모집이에요.';
  }

  if (message.includes('Member limit')) {
    return '현재 인원보다 작은 인원 제한으로는 수정할 수 없어요.';
  }

  return null;
};

const isMessageComponentInteraction = (interaction) => {
  const isButton = typeof interaction.isButton === 'function' && interaction.isButton();
  const isSelect = typeof interaction.isStringSelectMenu === 'function' && interaction.isStringSelectMenu();
  return isButton || isSelect;
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
  await ensureEphemeralReply(interaction, options);
  await interaction.editReply(payload);
};

const buildCreateButtonLabel = (board) => `${getBoardLabel(board)} 모집하기`;
const buildJoinButtonLabel = (board) => `${getBoardLabel(board)} 신청하기`;

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

const buildBoardActionComponents = (board) => [
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
    new ButtonBuilder()
      .setCustomId(board.ids.editButton)
      .setLabel('내 모집글 편집')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(board.ids.deleteButton)
      .setLabel('내 모집글 삭제')
      .setStyle(ButtonStyle.Danger),
  ),
];

const buildRecruitSelectRow = ({ customId, placeholder, entries }) => {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(customId)
    .setPlaceholder(placeholder)
    .addOptions(
      entries.slice(0, 25).map((entry) => ({
        label: entry.title.slice(0, 100),
        description: `인원 ${entry.memberCount}/${entry.memberLimit} • ${entry.time}`.slice(0, 100),
        value: String(entry.id),
      })),
    );

  return new ActionRowBuilder().addComponents(menu);
};

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

const fetchUserRecruits = (interaction, board) =>
  fetchPartyRecruitsByUser({
    discordUserId: interaction.user.id,
    kind: board.kind,
  });

const filterJoinableEntries = (entries, discordUserId) =>
  entries.filter(
    (entry) =>
      entry.userDiscordId !== String(discordUserId)
      && entry.memberCount < entry.memberLimit
      && !entry.isCompleted,
  );

const handleEditButton = async (interaction, board) => {
  try {
    const entries = await fetchUserRecruits(interaction, board);

    if (!entries.length) {
      await sendEphemeralResponse(interaction, {
        content: `✏️ 작성한 ${getBoardLabel(board)} 모집글이 없어요.`,
        components: [],
      }, { preferUpdate: true });
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
      });
      await interaction.showModal(modal);
      return true;
    }

    await sendEphemeralResponse(interaction, {
      content: '✏️ 수정할 모집글을 선택해주세요.',
      components: [
        buildRecruitSelectRow({
          customId: board.ids.editSelect,
          placeholder: '수정할 모집글 선택',
          entries,
        }),
      ],
    }, { preferUpdate: true });
    return true;
  } catch (error) {
    console.error('Failed to prepare edit selection:', error);
    await sendEphemeralResponse(interaction, {
      content: '⚠️ 모집글 목록을 불러오지 못했어요. 잠시 후 다시 시도해주세요.',
      components: [],
    }, { preferUpdate: true });
    return true;
  }
};

const handleDeleteButton = async (interaction, board) => {
  try {
    const entries = await fetchUserRecruits(interaction, board);

    if (!entries.length) {
      await sendEphemeralResponse(interaction, {
        content: `🗑️ 삭제할 수 있는 ${getBoardLabel(board)} 모집글이 없어요.`,
        components: [],
      }, { preferUpdate: true });
      return true;
    }

    await sendEphemeralResponse(interaction, {
      content: '🗑️ 삭제할 모집글을 선택해주세요.',
      components: [
        buildRecruitSelectRow({
          customId: board.ids.deleteSelect,
          placeholder: '삭제할 모집글 선택',
          entries,
        }),
      ],
    }, { preferUpdate: true });
    return true;
  } catch (error) {
    console.error('Failed to prepare delete selection:', error);
    await sendEphemeralResponse(interaction, {
      content: '⚠️ 모집글 목록을 불러오지 못했어요. 잠시 후 다시 시도해주세요.',
      components: [],
    }, { preferUpdate: true });
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
      await sendEphemeralResponse(interaction, {
        content: `🙋 신청할 수 있는 ${getBoardLabel(board)} 모집이 없어요. 잠시 후 다시 확인해주세요.`,
        components: [],
      }, { preferUpdate: true });
      return true;
    }

    await sendEphemeralResponse(interaction, {
      content: '🙋 신청할 모집글을 선택해주세요.',
      components: [
        buildRecruitSelectRow({
          customId: board.ids.joinSelect,
          placeholder: '신청할 모집글 선택',
          entries: joinableEntries,
        }),
      ],
    }, { preferUpdate: true });
    return true;
  } catch (error) {
    console.error('Failed to prepare join selection:', error);
    await sendEphemeralResponse(interaction, {
      content: `⚠️ ${getBoardLabel(board)} 모집 목록을 불러오지 못했어요. 잠시 후 다시 시도해주세요.`,
      components: [],
    }, { preferUpdate: true });
    return true;
  }
};

const handleEditSelect = async (interaction, board) => {
  const recruitId = Number(interaction.values?.[0]);
  if (!recruitId) {
    await sendEphemeralResponse(interaction, {
      content: '⚠️ 선택한 모집글을 확인하지 못했어요.',
      components: [],
    }, { preferUpdate: true });
    return true;
  }

  try {
    const entry = await fetchPartyRecruitEntryById(recruitId);
    if (!entry || entry.userDiscordId !== String(interaction.user.id)) {
      await sendEphemeralResponse(interaction, {
        content: '⚠️ 해당 모집글을 수정할 수 없어요.',
        components: [],
      }, { preferUpdate: true });
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
    await sendEphemeralResponse(interaction, {
      content: '⚠️ 모집글 정보를 불러오지 못했어요. 잠시 후 다시 시도해주세요.',
      components: [],
    }, { preferUpdate: true });
    return true;
  }
};

const handleDeleteSelect = async (interaction, board) => {
  const recruitId = Number(interaction.values?.[0]);
  if (!recruitId) {
    await sendEphemeralResponse(interaction, {
      content: '⚠️ 선택한 모집글을 확인하지 못했어요.',
      components: [],
    }, { preferUpdate: true });
    return true;
  }

  try {
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
    await sendEphemeralResponse(interaction, {
      content: friendlyMessage || '⚠️ 모집글을 삭제하지 못했어요. 잠시 후 다시 시도해주세요.',
      components: [],
    }, { preferUpdate: true });
    return true;
  }
};

const handleJoinSelect = async (interaction, board) => {
  const recruitId = Number(interaction.values?.[0]);
  if (!recruitId) {
    await sendEphemeralResponse(interaction, {
      content: '⚠️ 선택한 모집글을 확인하지 못했어요.',
      components: [],
    }, { preferUpdate: true });
    return true;
  }

  try {
    const updated = await joinPartyRecruit({
      recruitId,
      discordUser: interaction.user,
    });

    await respondWithListOrFallback({
      interaction,
      board,
      prefix: `🙋 ${updated.title} 모집에 신청했어요.`,
      fallbackLines: [`• 현재 인원: ${updated.memberCount}/${updated.memberLimit}`],
      preferUpdate: true,
    });
    return true;
  } catch (error) {
    console.error('Failed to join recruit:', error);
    const friendlyMessage = translateRecruitError(error);
    await sendEphemeralResponse(interaction, {
      content: friendlyMessage || '⚠️ 신청에 실패했어요. 잠시 후 다시 시도해주세요.',
      components: [],
    }, { preferUpdate: true });
    return true;
  }
};

const buildRecruitModal = (board, {
  customId = board.ids.modal,
  title = '',
  time = '',
  condition = '',
  memberLimit = '',
} = {}) => {
  const modal = new ModalBuilder()
    .setCustomId(customId)
    .setTitle(`${getBoardLabel(board)} 모집`);

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

const replyWithValidationError = async (interaction, errors) => {
  const content = ['❌ 입력한 정보를 확인해주세요.', ...errors.map((text) => `• ${text}`)].join('\n');

  if (interaction.deferred || interaction.replied) {
    await interaction.followUp({ content, ephemeral: true });
    return;
  }

  await interaction.reply({ content, ephemeral: true });
};

const respondWithListOrFallback = async ({
  interaction,
  board,
  prefix,
  fallbackLines = [],
  preferUpdate = false,
}) => {
  try {
    const entries = await fetchPartyRecruitEntriesByKind({
      kind: board.kind,
      limit: PARTY_LIST_LIMIT,
    });
    const listMessage = buildRecruitListMessage(board, entries);
    const content = prefix ? `${prefix}\n\n${listMessage}` : listMessage;

    await sendEphemeralResponse(interaction, {
      content,
      components: buildBoardActionComponents(board),
    }, { preferUpdate });
  } catch (error) {
    console.error('Failed to load recruit list:', error);
    const content = [prefix, ...fallbackLines].filter(Boolean).join('\n');
    await sendEphemeralResponse(interaction, {
      content,
      components: [],
    }, { preferUpdate });
  }
};

const collectModalInput = (interaction) => {
  const title = interaction.fields.getTextInputValue(TITLE_INPUT_ID).trim();
  const time = interaction.fields.getTextInputValue(TIME_INPUT_ID).trim();
  const condition = interaction.fields.getTextInputValue(CONDITION_INPUT_ID).trim();
  const memberLimitRaw = interaction.fields.getTextInputValue(MEMBER_LIMIT_INPUT_ID).trim();
  const memberLimit = Number(memberLimitRaw);
  const errors = [];

  if (!title) {
    errors.push('제목을 입력해주세요.');
  }

  if (!time) {
    errors.push('시간 또는 조건을 입력해주세요.');
  }

  if (!memberLimitRaw) {
    errors.push('인원 제한을 입력해주세요.');
  } else if (!Number.isInteger(memberLimit) || memberLimit <= 0) {
    errors.push('인원 제한은 1 이상의 정수를 입력해주세요.');
  }

  return {
    title,
    time,
    condition,
    memberLimit,
    errors,
  };
};

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

const handleModalSubmit = async (interaction, board) => {
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

const findBoardByCustomId = (customId) => {
  if (!customId) {
    return null;
  }

  return recruitBoards.find(
    (board) =>
      board.matchableCustomIds.has(customId)
      || customId.startsWith(board.ids.editModalPrefix),
  );
};

const handleBoardInteraction = async (interaction, board) => {
  if (interaction.isButton()) {
    if (interaction.customId === board.ids.main) {
      return replyWithRecruitList(interaction, board);
    }

    if (interaction.customId === board.ids.createButton) {
      await interaction.showModal(buildRecruitModal(board));
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
  }

  if (interaction.isStringSelectMenu()) {
    if (interaction.customId === board.ids.editSelect) {
      return handleEditSelect(interaction, board);
    }

    if (interaction.customId === board.ids.deleteSelect) {
      return handleDeleteSelect(interaction, board);
    }

    if (interaction.customId === board.ids.joinSelect) {
      return handleJoinSelect(interaction, board);
    }
  }

  if (interaction.isModalSubmit()) {
    if (
      interaction.customId === board.ids.modal
      || interaction.customId.startsWith(board.ids.editModalPrefix)
    ) {
      return handleModalSubmit(interaction, board);
    }
  }

  return false;
};

const handlePartyHuntingInteraction = async (interaction) => {
  const isRelevantInteraction = (
    typeof interaction.isButton === 'function' && interaction.isButton()
  ) || (
    typeof interaction.isStringSelectMenu === 'function' && interaction.isStringSelectMenu()
  ) || (
    typeof interaction.isModalSubmit === 'function' && interaction.isModalSubmit()
  );

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
