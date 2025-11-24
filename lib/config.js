const fs = require('node:fs');
const path = require('node:path');
const { GatewayIntentBits } = require('discord.js');

const REQUIRED_ENV_VARS = ['DISCORD_TOKEN', 'PINNED_CHANNEL_ID'];

const quotedValueRegex = /^['"]|['"]$/g;

const loadEnvFile = () => {
   const envPath = path.resolve(__dirname, '..', '.env');
   if (!fs.existsSync(envPath)) {
      return;
   }

   const contents = fs.readFileSync(envPath, 'utf8');
   contents.split(/\r?\n/).forEach(line => {
      const trimmedLine = line.trim();
      if (!trimmedLine || trimmedLine.startsWith('#')) {
         return;
      }

      const separatorIndex = trimmedLine.indexOf('=');
      if (separatorIndex === -1) {
         return;
      }

      const key = trimmedLine.slice(0, separatorIndex).trim();
      if (!key || process.env[key]) {
         return;
      }

      const rawValue = trimmedLine.slice(separatorIndex + 1).trim();
      process.env[key] = rawValue.replace(quotedValueRegex, '');
   });
};

loadEnvFile();

const missingEnvVars = REQUIRED_ENV_VARS.filter(name => !process.env[name]);
if (missingEnvVars.length) {
   throw new Error(`Missing required environment variables: ${missingEnvVars.join(', ')}`);
}

const DEFAULT_DATABASE_PATH = path.resolve(__dirname, '..', 'data', 'bot.sqlite');

const PINNED_MESSAGE = [
   '📣 파티 모집 안내',
   '• 이 채널은 파티 모집글을 작성하는 채널입니다.',
   '• 알림은 🔔 채널 권한에서 변경할 수 있어요.',
   '• 아래 모집 유형을 선택 후, 템플릿에 맞게 작성해주세요.',
   '• 도배/허위 모집 시 규칙에 따라 제재될 수 있습니다.',
].join('\n');

const PINNED_BUTTONS = [
   { label: '파티사냥', displayLabel: '파티 사냥', customId: 'party-hunting', kind: 0 },
   { label: '소환서', displayLabel: '소환서', customId: 'summon-scroll', kind: 1 },
   { label: '아토락시온', displayLabel: '아토락시온', customId: 'atoraxxion', kind: 2 },
   { label: '검은사당', displayLabel: '검은사당', customId: 'black-shrine', kind: 3 },
   { label: '항해', displayLabel: '항해', customId: 'sailing', kind: 4 },
   { label: '그랑프리', displayLabel: '그랑프리', customId: 'grand-prix', kind: 5 },
];

const MY_RECRUIT_SUMMARY_BUTTON = {
   label: '내 모집 현황',
   customId: 'my-recruit-activity',
   editButtonId: 'my-recruit-activity-edit',
   deleteButtonId: 'my-recruit-activity-delete',
   leaveButtonId: 'my-recruit-activity-leave',
   editSelectId: 'my-recruit-activity-edit-select',
   deleteSelectId: 'my-recruit-activity-delete-select',
   leaveSelectId: 'my-recruit-activity-leave-select',
};

const databasePath = process.env.DATABASE_PATH
   ? path.resolve(process.cwd(), process.env.DATABASE_PATH)
   : DEFAULT_DATABASE_PATH;

const buildIdList = value =>
   (value || '')
      .split(',')
      .map(chunk => chunk.trim())
      .filter(Boolean);

const moderatorUserIds = new Set(buildIdList(process.env.MODERATOR_USER_IDS));

module.exports = {
   discordToken: process.env.DISCORD_TOKEN,
   pinnedChannelId: process.env.PINNED_CHANNEL_ID,
   pinnedMessage: PINNED_MESSAGE,
   pinnedButtons: PINNED_BUTTONS,
   myRecruitSummaryButton: MY_RECRUIT_SUMMARY_BUTTON,
   databasePath,
   clientIntents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
   moderatorUserIds,
};
