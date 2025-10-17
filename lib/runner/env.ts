export function getBotCommand(): string {
  const cmd = process.env.BOT_CMD;
  if (!cmd) {
    throw new Error('BOT_CMD не задан в окружении');
  }
  return cmd;
}

export function getBotWorkdir(): string | undefined {
  return process.env.BOT_WORKDIR;
}

export function getConfigPath(): string {
  const config = process.env.BOT_CONFIG_PATH;
  if (!config) {
    throw new Error('BOT_CONFIG_PATH не задан в окружении');
  }
  return config;
}

export function getExtraFlagsDefault(): string {
  return process.env.EXTRA_FLAGS_DEFAULT ?? '';
}
