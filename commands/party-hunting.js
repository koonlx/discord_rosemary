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
} = require('../lib/party-recruit-service');
const { refreshPinnedMessage } = require('../lib/pinned-message-refresh');

const PARTY_HUNTING_BUTTON_ID = 'party-hunting';
const PARTY_HUNTING_MODAL_ID = 'party-hunting-modal';
const TITLE_INPUT_ID = 'party-hunting-title';
const TIME_INPUT_ID = 'party-hunting-time';
const CONDITION_INPUT_ID = 'party-hunting-condition';
const MEMBER_LIMIT_INPUT_ID = 'party-hunting-member-limit';
const PARTY_HUNTING_CREATE_BUTTON_ID = 'party-hunting-create';
const PARTY_HUNTING_EDIT_BUTTON_ID = 'party-hunting-edit';
const PARTY_HUNTING_DELETE_BUTTON_ID = 'party-hunting-delete';
const PARTY_HUNTING_EDIT_SELECT_ID = 'party-hunting-edit-select';
const PARTY_HUNTING_DELETE_SELECT_ID = 'party-hunting-delete-select';
const PARTY_HUNTING_EDIT_MODAL_PREFIX = 'party-hunting-modal-edit:';
const PARTY_LIST_LIMIT = 10;

const partyHuntingKind = config.pinnedButtons.find(
  (button) => button.customId === PARTY_HUNTING_BUTTON_ID,
)?.kind ?? 0;

const buildEditModalId = (recruitId) => `${PARTY_HUNTING_EDIT_MODAL_PREFIX}${recruitId}`;

const parseEditModalId = (customId) => {
  if (!customId.startsWith(PARTY_HUNTING_EDIT_MODAL_PREFIX)) {
    return null;
  }

  const id = Number(customId.slice(PARTY_HUNTING_EDIT_MODAL_PREFIX.length));
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

  if (message.includes('Member limit')) {
    return '현재 인원보다 작은 인원 제한으로는 수정할 수 없어요.';
  }

  return null;
};

const ensureEphemeralReply = async (interaction) => {
  if (interaction.deferred || interaction.replied) {
    return;
  }

  await interaction.deferReply({ ephemeral: true });
};

const sendEphemeralResponse = async (interaction, payload) => {
  await ensureEphemeralReply(interaction);
  await interaction.editReply(payload);
};

const buildPartyHuntingListMessage = (entries = []) => {
  if (!entries.length) {
    return [
      '📋 파티 사냥 모집 목록',
      '• 아직 등록된 모집글이 없어요.',
      '• 하단의 "파티 모집하기" 버튼을 눌러 첫 모집글을 작성해보세요.',
    ].join('\n');
  }

  const header = `📋 파티 사냥 모집 목록 (최근 ${entries.length}건)`;
  const body = entries.map((entry, index) => formatRecruitEntry(entry, index));
  return [header, body.join('\n\n')].join('\n\n');
};

const buildPartyListComponents = () => [
  new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(PARTY_HUNTING_CREATE_BUTTON_ID)
      .setLabel('파티 모집하기')
      .setStyle(ButtonStyle.Primary),
  ),
  new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(PARTY_HUNTING_EDIT_BUTTON_ID)
      .setLabel('내 모집글 편집')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(PARTY_HUNTING_DELETE_BUTTON_ID)
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

const replyWithPartyList = async (interaction) => {
  try {
    const entries = await fetchPartyRecruitEntriesByKind({
      kind: partyHuntingKind,
      limit: PARTY_LIST_LIMIT,
    });

    await sendEphemeralResponse(interaction, {
      content: buildPartyHuntingListMessage(entries),
      components: buildPartyListComponents(),
    });
    return true;
  } catch (error) {
    console.error('Failed to load party hunting list for button request:', error);
    await sendEphemeralResponse(interaction, {
      content: '⚠️ 파티 사냥 목록을 불러오지 못했어요. 잠시 후 다시 시도해주세요.',
      components: [],
    });
    return true;
  }
};

const fetchUserRecruits = async (interaction) =>
  fetchPartyRecruitsByUser({
    discordUserId: interaction.user.id,
    kind: partyHuntingKind,
  });

const promptEditSelection = async (interaction, entries) => {
  await sendEphemeralResponse(interaction, {
    content: '✏️ 수정할 모집글을 선택해주세요.',
    components: [
      buildRecruitSelectRow({
        customId: PARTY_HUNTING_EDIT_SELECT_ID,
        placeholder: '수정할 모집글 선택',
        entries,
      }),
    ],
  });
};

const handleEditButton = async (interaction) => {
  try {
    const entries = await fetchUserRecruits(interaction);

    if (!entries.length) {
      await sendEphemeralResponse(interaction, {
        content: '✏️ 작성한 파티 사냥 모집글이 없어요.',
        components: [],
      });
      return true;
    }

    if (entries.length === 1) {
      const [entry] = entries;
      const modal = buildPartyHuntingModal({
        customId: buildEditModalId(entry.id),
        title: entry.title,
        time: entry.time,
        condition: entry.condition ?? '',
        memberLimit: entry.memberLimit,
      });
      await interaction.showModal(modal);
      return true;
    }

    await promptEditSelection(interaction, entries);
    return true;
  } catch (error) {
    console.error('Failed to prepare edit selection:', error);
    await sendEphemeralResponse(interaction, {
      content: '⚠️ 모집글 목록을 불러오지 못했어요. 잠시 후 다시 시도해주세요.',
      components: [],
    });
    return true;
  }
};

const handleDeleteButton = async (interaction) => {
  try {
    const entries = await fetchUserRecruits(interaction);

    if (!entries.length) {
      await sendEphemeralResponse(interaction, {
        content: '🗑️ 삭제할 수 있는 파티 사냥 모집글이 없어요.',
        components: [],
      });
      return true;
    }

    await sendEphemeralResponse(interaction, {
      content: '🗑️ 삭제할 모집글을 선택해주세요.',
      components: [
        buildRecruitSelectRow({
          customId: PARTY_HUNTING_DELETE_SELECT_ID,
          placeholder: '삭제할 모집글 선택',
          entries,
        }),
      ],
    });
    return true;
  } catch (error) {
    console.error('Failed to prepare delete selection:', error);
    await sendEphemeralResponse(interaction, {
      content: '⚠️ 모집글 목록을 불러오지 못했어요. 잠시 후 다시 시도해주세요.',
      components: [],
    });
    return true;
  }
};

const handleEditSelect = async (interaction) => {
  const recruitId = Number(interaction.values?.[0]);
  if (!recruitId) {
    await interaction.reply({
      content: '⚠️ 선택한 모집글을 확인하지 못했어요.',
      ephemeral: true,
    });
    return true;
  }

  try {
    const entry = await fetchPartyRecruitEntryById(recruitId);
    if (!entry || entry.userDiscordId !== String(interaction.user.id)) {
      await interaction.reply({
        content: '⚠️ 해당 모집글을 수정할 수 없어요.',
        ephemeral: true,
      });
      return true;
    }

    const modal = buildPartyHuntingModal({
      customId: buildEditModalId(entry.id),
      title: entry.title,
      time: entry.time,
      condition: entry.condition ?? '',
      memberLimit: entry.memberLimit,
    });
    await interaction.showModal(modal);
    return true;
  } catch (error) {
    console.error('Failed to open edit modal from selection:', error);
    await interaction.reply({
      content: '⚠️ 모집글 정보를 불러오지 못했어요. 잠시 후 다시 시도해주세요.',
      ephemeral: true,
    });
    return true;
  }
};

const handleDeleteSelect = async (interaction) => {
  const recruitId = Number(interaction.values?.[0]);
  if (!recruitId) {
    await interaction.reply({
      content: '⚠️ 선택한 모집글을 확인하지 못했어요.',
      ephemeral: true,
    });
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
      prefix: '🗑️ 파티 사냥 모집을 삭제했어요.',
      fallbackLines: [`• 삭제된 모집글 ID: ${recruitId}`],
    });
    return true;
  } catch (error) {
    console.error('Failed to delete party hunting recruit:', error);
    const friendlyMessage = translateRecruitError(error);
    await interaction.reply({
      content: friendlyMessage || '⚠️ 모집글을 삭제하지 못했어요. 잠시 후 다시 시도해주세요.',
      ephemeral: true,
    });
    return true;
  }
};
const buildPartyHuntingModal = ({
  customId = PARTY_HUNTING_MODAL_ID,
  title = '',
  time = '',
  condition = '',
  memberLimit = '',
} = {}) => {
  const modal = new ModalBuilder()
    .setCustomId(customId)
    .setTitle('파티 사냥 모집');

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

const respondWithListOrFallback = async ({ interaction, prefix, fallbackLines = [] }) => {
  try {
    const entries = await fetchPartyRecruitEntriesByKind({
      kind: partyHuntingKind,
      limit: PARTY_LIST_LIMIT,
    });
    const listMessage = buildPartyHuntingListMessage(entries);
    const content = prefix ? `${prefix}\n\n${listMessage}` : listMessage;

    await sendEphemeralResponse(interaction, {
      content,
      components: buildPartyListComponents(),
    });
  } catch (error) {
    console.error('Failed to load party hunting list:', error);
    const content = [prefix, ...fallbackLines].filter(Boolean).join('\n');
    await sendEphemeralResponse(interaction, {
      content,
      components: [],
    });
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

const handleCreateSubmit = async (interaction, payload) => {
  try {
    await createPartyRecruitEntry({
      discordUser: interaction.user,
      title: payload.title,
      time: payload.time,
      kind: partyHuntingKind,
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
      prefix: '✅ 파티 사냥 모집을 저장했어요.',
      fallbackLines: [
        `• 제목: ${payload.title}`,
        `• 시간: ${payload.time}`,
        payload.condition ? `• 조건: ${payload.condition}` : null,
        `• 인원 제한: ${payload.memberLimit}명`,
      ].filter(Boolean),
    });
    return true;
  } catch (error) {
    console.error('Failed to store party hunting recruit:', error);
    await interaction.reply({
      content: '⚠️ 모집 정보를 저장하지 못했어요. 잠시 후 다시 시도해주세요.',
      ephemeral: true,
    });
    return true;
  }
};

const handleEditSubmit = async (interaction, payload, recruitId) => {
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
      prefix: '✏️ 파티 사냥 모집을 수정했어요.',
      fallbackLines: [
        `• 제목: ${updated.title}`,
        `• 시간: ${updated.time}`,
        updated.condition ? `• 조건: ${updated.condition}` : null,
        `• 인원 제한: ${updated.memberLimit}명`,
      ].filter(Boolean),
    });
    return true;
  } catch (error) {
    console.error('Failed to edit party hunting recruit:', error);
    const friendlyMessage = translateRecruitError(error);
    await interaction.reply({
      content: friendlyMessage || '⚠️ 모집 정보를 수정하지 못했어요. 잠시 후 다시 시도해주세요.',
      ephemeral: true,
    });
    return true;
  }
};

const handleModalSubmit = async (interaction) => {
  const recruitId = parseEditModalId(interaction.customId);
  const payload = collectModalInput(interaction);

  if (payload.errors.length) {
    await replyWithValidationError(interaction, payload.errors);
    return true;
  }

  if (recruitId) {
    return handleEditSubmit(interaction, payload, recruitId);
  }

  return handleCreateSubmit(interaction, payload);
};

const handlePartyHuntingInteraction = async (interaction) => {
  if (interaction.isButton()) {
    if (interaction.customId === PARTY_HUNTING_BUTTON_ID) {
      return replyWithPartyList(interaction);
    }

    if (interaction.customId === PARTY_HUNTING_CREATE_BUTTON_ID) {
      await interaction.showModal(buildPartyHuntingModal());
      return true;
    }

    if (interaction.customId === PARTY_HUNTING_EDIT_BUTTON_ID) {
      return handleEditButton(interaction);
    }

    if (interaction.customId === PARTY_HUNTING_DELETE_BUTTON_ID) {
      return handleDeleteButton(interaction);
    }
  }

  if (interaction.isStringSelectMenu()) {
    if (interaction.customId === PARTY_HUNTING_EDIT_SELECT_ID) {
      return handleEditSelect(interaction);
    }

    if (interaction.customId === PARTY_HUNTING_DELETE_SELECT_ID) {
      return handleDeleteSelect(interaction);
    }
  }

  if (interaction.isModalSubmit()) {
    if (
      interaction.customId === PARTY_HUNTING_MODAL_ID
      || interaction.customId.startsWith(PARTY_HUNTING_EDIT_MODAL_PREFIX)
    ) {
      return handleModalSubmit(interaction);
    }
  }

  return false;
};

module.exports = {
  handlePartyHuntingInteraction,
};
