const config = require('./config');

const getDiscordId = user => {
   if (!user) {
      return null;
   }

   if (typeof user === 'string') {
      return user;
   }

   if (typeof user.id === 'string' || typeof user.id === 'number') {
      return String(user.id);
   }

   return null;
};

const isRecruitManager = discordUser => {
   const discordId = getDiscordId(discordUser);
   if (!discordId) {
      return false;
   }

   return config.moderatorUserIds.has(discordId);
};

module.exports = {
   getDiscordId,
   isRecruitManager,
};
