export const log = {
  error: function errorLog(message: string) {
    console.error(colorizeText(`\t⚠ ${message}`, "fgRed"));
  },
  ok: function okLog(message: string) {
    console.log(colorizeText(`\t⚠ ${message}`, "fgGreen"));
  },
  warn: function warnLog(message: string) {
    console.warn(colorizeText(`\t⚠ ${message}`, "fgYellow"));
  },
  info: function infoLog(message: string) {
    console.info(colorizeText(`\t⚠ ${message}`, "fgWhite"));
  },
};

const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  underscore: "\x1b[4m",
  blink: "\x1b[5m",
  reverse: "\x1b[7m",
  hidden: "\x1b[8m",

  fgBlack: "\x1b[30m",
  fgRed: "\x1b[31m",
  fgGreen: "\x1b[32m",
  fgYellow: "\x1b[33m",
  fgBlue: "\x1b[34m",
  fgMagenta: "\x1b[35m",
  fgCyan: "\x1b[36m",
  fgWhite: "\x1b[37m",

  bgBlack: "\x1b[40m",
  bgRed: "\x1b[41m",
  bgGreen: "\x1b[42m",
  bgYellow: "\x1b[43m",
  bgBlue: "\x1b[44m",
  bgMagenta: "\x1b[45m",
  bgCyan: "\x1b[46m",
  bgWhite: "\x1b[47m",
};
function colorizeText(text: string, color: keyof typeof colors): string {
  return colors[color].concat(text).concat(colors.reset);
}

export function verifyEnvironmentVariables() {
  const keys = ["AMOUNT_IN_ETH", "BENEFICIARY_ADDRESS", "CHAIN_ID", "FRONTEND_URL", "PAYMENT_TOKEN_ADDRESS", "RPC_PROVIDER_URL", "UBIQUIBOT_PRIVATE_KEY"];
  for (const key of keys) {
    if (!process.env[key]) {
      log.error(`Missing environment variable: ${key}`);
    }
  }
}
