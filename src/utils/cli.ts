import { resolve } from "node:path";

export const parseCliFlagValue = (
  argv: readonly string[],
  flagName: string,
): string | null => {
  const flag = `--${flagName}`;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === flag) {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`Missing value for ${flag}.`);
      }
      return value;
    }

    if (argument.startsWith(`${flag}=`)) {
      const value = argument.slice(flag.length + 1);
      if (!value) {
        throw new Error(`Missing value for ${flag}.`);
      }
      return value;
    }
  }

  return null;
};

export const parseDataDir = (argv: readonly string[]): string | undefined => {
  const value = parseCliFlagValue(argv, "data-dir");
  if (value === null) {
    return undefined;
  }

  const normalized = value.trim();
  if (!normalized) {
    throw new Error("Missing value for --data-dir.");
  }

  return resolve(normalized);
};
