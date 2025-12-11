const {
   TITLE_INPUT_ID,
   TIME_INPUT_ID,
   CONDITION_INPUT_ID,
   MEMBER_LIMIT_INPUT_ID,
   HOST_DISCORD_INPUT_ID,
} = require('./constants');

const getOptionalTextInputValue = (interaction, inputId) => {
   if (!interaction?.fields?.getTextInputValue) {
      return '';
   }

   try {
      const value = interaction.fields.getTextInputValue(inputId);
      return typeof value === 'string' ? value.trim() : '';
   } catch (error) {
      return '';
   }
};

const translateRecruitError = error => {
   const message = error?.message || '';
   if (message.includes('not found')) {
      return '해당 모집글을 찾을 수 없어요.';
   }

   if (
      message.includes('modify your own') ||
      message.includes('delete your own') ||
      message.includes('manage your own')
   ) {
      return '본인이 등록한 모집글만 관리할 수 있어요.';
   }

   if (message.includes('join your own')) {
      return '본인이 등록한 모집에는 신청할 수 없어요.';
   }

   if (message.includes('cancel your own')) {
      return '본인이 모집한 파티의 신청은 취소할 수 없어요.';
   }

   if (message.includes('already full')) {
      return '이미 인원이 가득 찼어요.';
   }

   if (message.includes('already joined')) {
      return '이미 신청한 모집이에요.';
   }

   if (message.includes('not a member')) {
      return '해당 모집에 신청한 기록이 없어요.';
   }

   if (message.includes('Member limit')) {
      return '현재 인원보다 작은 인원 제한으로는 수정할 수 없어요.';
   }

   return null;
};

const filterJoinableEntries = (entries, discordUserId) =>
   entries.filter(
      entry =>
         entry.userDiscordId !== String(discordUserId) && entry.memberCount < entry.memberLimit && !entry.isCompleted,
   );

const formatMemberMentions = members => {
   if (!Array.isArray(members) || !members.length) {
      return '';
   }

   return members.map(discordId => `<@${discordId}>`).join(', ');
};

const collectModalInput = interaction => {
   const title = interaction.fields.getTextInputValue(TITLE_INPUT_ID).trim();
   const time = interaction.fields.getTextInputValue(TIME_INPUT_ID).trim();
   const condition = interaction.fields.getTextInputValue(CONDITION_INPUT_ID).trim();
   const memberLimitRaw = interaction.fields.getTextInputValue(MEMBER_LIMIT_INPUT_ID).trim();
   const hostAssignmentInput = getOptionalTextInputValue(interaction, HOST_DISCORD_INPUT_ID);
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
      hostAssignmentInput,
      memberLimit,
      errors,
   };
};

const extractDiscordIdFromInput = value => {
   if (!value) {
      return null;
   }

   const digits = String(value).replace(/[^\d]/g, '');
   if (!digits) {
      return null;
   }

   if (digits.length < 5 || digits.length > 25) {
      return null;
   }

   return digits;
};

const extractDiscordIdsFromList = value => {
   if (!value) {
      return [];
   }

   const matches = String(value).match(/\d{5,25}/g);
   if (!matches) {
      return [];
   }

   return [...new Set(matches)];
};

const MAX_HOST_INPUT_LENGTH = 400;

const formatHostInputValue = entry => {
   if (!entry) {
      return '';
   }

   const lines = [];
   if (entry.userDiscordId) {
      lines.push(`host: <@${entry.userDiscordId}>`);
   }

   if (Array.isArray(entry.members) && entry.members.length) {
      const memberMentions = entry.members.map(discordId => `<@${discordId}>`).join(', ');
      lines.push(`members: ${memberMentions}`);
   }

   const value = lines.join('\n');
   return value.length > MAX_HOST_INPUT_LENGTH ? value.slice(0, MAX_HOST_INPUT_LENGTH) : value;
};

const parseHostAndMembersInput = rawInput => {
   if (!rawInput) {
      return {
         hostDiscordId: null,
         hostProvided: false,
         applicantDiscordIds: null,
         membersProvided: false,
         errors: [],
      };
   }

   const errors = [];
   const lines = String(rawInput).split(/\r?\n/);
   let hostSegment = null;
   let membersSegment = null;
   let hostProvided = false;
   let membersProvided = false;
   let capturingMembers = false;

   lines.forEach(line => {
      const trimmed = line.trim();
      const normalized = trimmed.toLowerCase();
      if (!trimmed) {
         return;
      }

      if (normalized.startsWith('host:') || normalized.startsWith('모집자:')) {
         hostSegment = trimmed.slice(trimmed.indexOf(':') + 1).trim();
         hostProvided = true;
         capturingMembers = false;
         return;
      }

      if (normalized.startsWith('members:') || normalized.startsWith('신청자:')) {
         membersSegment = trimmed.slice(trimmed.indexOf(':') + 1).trim();
         membersProvided = true;
         capturingMembers = true;
         return;
      }

      if (capturingMembers) {
         membersSegment = [membersSegment, trimmed].filter(Boolean).join(' ');
         return;
      }

      if (!hostSegment) {
         hostSegment = trimmed;
         hostProvided = true;
         return;
      }
   });

   let hostDiscordId = null;
   if (hostSegment) {
      hostDiscordId = extractDiscordIdFromInput(hostSegment);
      if (!hostDiscordId) {
         errors.push('모집자는 디스코드 멘션 또는 숫자 ID로 입력해주세요.');
      }
   }

   let applicantDiscordIds = null;
   if (membersSegment !== null) {
      const extractedIds = extractDiscordIdsFromList(membersSegment);
      const trimmedMembers = membersSegment.trim();
      if (!extractedIds.length && trimmedMembers.length) {
         errors.push('신청자는 디스코드 멘션 또는 숫자 ID로 입력해주세요.');
      }
      applicantDiscordIds = extractedIds.length ? extractedIds : [];
   }

   if (!membersProvided && applicantDiscordIds !== null) {
      membersProvided = true;
   }

   if (applicantDiscordIds && hostDiscordId) {
      applicantDiscordIds = applicantDiscordIds.filter(id => id !== hostDiscordId);
   }

   return {
      hostDiscordId,
      hostProvided,
      applicantDiscordIds,
      membersProvided,
      errors,
   };
};

module.exports = {
   collectModalInput,
   filterJoinableEntries,
   formatMemberMentions,
   formatHostInputValue,
   extractDiscordIdFromInput,
   parseHostAndMembersInput,
   translateRecruitError,
};
