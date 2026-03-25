import process from "node:process";

export type LoggerColor =
  | "blue"
  | "cyan"
  | "green"
  | "magenta"
  | "red"
  | "yellow"
  | "gray";

export interface Logger {
  log(message: string): void;
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

const RESET = "\x1b[0m";
const COLOR_CODES: Record<LoggerColor, string> = {
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  magenta: "\x1b[35m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  gray: "\x1b[90m",
};

const shouldUseColor = (): boolean =>
  Boolean(process.stdout.isTTY) &&
  process.env.NO_COLOR === undefined &&
  process.env.TERM !== "dumb";

const formatTimestamp = (): string => {
  const now = new Date();
  const hours = `${now.getHours()}`.padStart(2, "0");
  const minutes = `${now.getMinutes()}`.padStart(2, "0");
  const seconds = `${now.getSeconds()}`.padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
};

const formatPrefix = (prefix: string, color: LoggerColor): string => {
  const label = `[${prefix}]`;
  if (!shouldUseColor()) {
    return label;
  }

  return `${COLOR_CODES[color]}${label}${RESET}`;
};

export const createLogger = (
  prefix: string,
  color: LoggerColor,
): Logger => {
  const formattedPrefix = formatPrefix(prefix, color);

  const emit = (
    writer: (...args: unknown[]) => void,
    message: string,
  ): void => {
    writer(`${formatTimestamp()} ${formattedPrefix} ${message}`);
  };

  return {
    log(message) {
      emit(console.log, message);
    },
    info(message) {
      emit(console.log, message);
    },
    warn(message) {
      emit(console.warn, message);
    },
    error(message) {
      emit(console.error, message);
    },
  };
};
