const fs = require('node:fs');
const path = require('node:path');
const { GatewayIntentBits } = require('discord.js');

const REQUIRED_ENV_VARS = [
  'DISCORD_TOKEN',
  'PINNED_CHANNEL_ID',
];

const quotedValueRegex = /^['"]|['"]$/g;

const loadEnvFile = () => {
  const envPath = path.resolve(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) {
    return;
  }

  const contents = fs.readFileSync(envPath, 'utf8');
  contents.split(/\r?\n/).forEach((line) => {
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

const missingEnvVars = REQUIRED_ENV_VARS.filter((name) => !process.env[name]);
if (missingEnvVars.length) {
  throw new Error(`Missing required environment variables: ${missingEnvVars.join(', ')}`);
}

const PINNED_MESSAGE = [
  '📣 파티 모집 안내',
  '• 이 채널은 파티 모집글을 작성하는 채널입니다.',
  '• 알림은 🔔 채널 권한에서 변경할 수 있어요.',
  '• 아래 모집 유형을 선택 후, 템플릿에 맞게 작성해주세요.',
  '• 파티 모집이 완료되면 「모집 완료」 버튼을 눌러주세요.',
  '• 도배/허위 모집 시 규칙에 따라 제재될 수 있습니다.',
].join('\n');

module.exports = {
  discordToken: process.env.DISCORD_TOKEN,
  pinnedChannelId: process.env.PINNED_CHANNEL_ID,
  pinnedMessage: PINNED_MESSAGE,
  clientIntents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
  ],
};
