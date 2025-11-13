const fs = require('node:fs');
const path = require('node:path');
const { GatewayIntentBits } = require('discord.js');

const REQUIRED_ENV_VARS = [
  'DISCORD_TOKEN',
  'PINNED_CHANNEL_ID',
  'PINNED_MESSAGE',
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

module.exports = {
  discordToken: process.env.DISCORD_TOKEN,
  pinnedChannelId: process.env.PINNED_CHANNEL_ID,
  pinnedMessage: process.env.PINNED_MESSAGE,
  clientIntents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
  ],
};
