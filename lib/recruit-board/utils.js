const {
   TITLE_INPUT_ID,
   TIME_INPUT_ID,
   CONDITION_INPUT_ID,
   MEMBER_LIMIT_INPUT_ID,
} = require('./constants');

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

const filterJoinableEntries = (entries, discordUserId) =>
   entries.filter(
      entry =>
         entry.userDiscordId !== String(discordUserId) && entry.memberCount < entry.memberLimit && !entry.isCompleted,
   );

const collectModalInput = interaction => {
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

module.exports = {
   collectModalInput,
   filterJoinableEntries,
   translateRecruitError,
};
