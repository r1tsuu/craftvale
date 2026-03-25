import { createInterface } from "node:readline/promises";
import process from "node:process";

const PORT_RELEASE_POLL_MS = 100;
const PORT_RELEASE_TIMEOUT_MS = 1_500;

const readCommandOutput = async (command: string[]): Promise<{
  exitCode: number;
  stdout: string;
}> => {
  const subprocess = Bun.spawn(command, {
    stdin: "ignore",
    stdout: "pipe",
    stderr: "ignore",
  });
  const stdout = subprocess.stdout
    ? await new Response(subprocess.stdout).text()
    : "";
  const exitCode = await subprocess.exited;
  return {
    exitCode,
    stdout,
  };
};

const findListeningPids = async (port: number): Promise<number[]> => {
  const result = await readCommandOutput([
    "lsof",
    "-nP",
    `-iTCP:${port}`,
    "-sTCP:LISTEN",
    "-t",
  ]);

  if (result.exitCode !== 0 && result.stdout.trim().length === 0) {
    return [];
  }

  return result.stdout
    .split(/\s+/)
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isInteger(value) && value > 0);
};

const waitForPortRelease = async (port: number, timeoutMs: number): Promise<boolean> => {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if ((await findListeningPids(port)).length === 0) {
      return true;
    }

    await Bun.sleep(PORT_RELEASE_POLL_MS);
  }

  return (await findListeningPids(port)).length === 0;
};

const killPortProcesses = async (port: number, pids: readonly number[]): Promise<void> => {
  const uniquePids = [...new Set(pids)];

  for (const pid of uniquePids) {
    try {
      process.kill(pid, "SIGTERM");
    } catch (error) {
      if (
        !(error instanceof Error && "code" in error && error.code === "ESRCH")
      ) {
        throw error;
      }
    }
  }

  if (await waitForPortRelease(port, PORT_RELEASE_TIMEOUT_MS)) {
    return;
  }

  const remainingPids = await findListeningPids(port);
  for (const pid of remainingPids) {
    try {
      process.kill(pid, "SIGKILL");
    } catch (error) {
      if (
        !(error instanceof Error && "code" in error && error.code === "ESRCH")
      ) {
        throw error;
      }
    }
  }

  if (!(await waitForPortRelease(port, PORT_RELEASE_TIMEOUT_MS))) {
    throw new Error(`Failed to free port ${port}.`);
  }
};

const promptForPortConflict = async (
  port: number,
  pids: readonly number[],
): Promise<"kill" | "stop"> => {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error(
      `Port ${port} is already in use by PID ${pids.join(", ")}. Run interactively to choose kill or stop.`,
    );
  }

  const prompt = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    while (true) {
      const answer = (await prompt.question(
        `Port ${port} is already in use by PID ${pids.join(", ")}. Kill it and continue or stop? [k/s]: `,
      ))
        .trim()
        .toLowerCase();

      if (answer === "k" || answer === "kill") {
        return "kill";
      }

      if (answer === "s" || answer === "stop" || answer === "") {
        return "stop";
      }
    }
  } finally {
    prompt.close();
  }
};

export const ensurePortAvailable = async (port: number): Promise<void> => {
  while (true) {
    const pids = await findListeningPids(port);
    if (pids.length === 0) {
      return;
    }

    const decision = await promptForPortConflict(port, pids);
    if (decision === "stop") {
      throw new Error(`Startup cancelled because port ${port} is already in use.`);
    }

    await killPortProcesses(port, pids);
  }
};

export const forceReleasePort = async (port: number): Promise<number[]> => {
  const pids = await findListeningPids(port);
  if (pids.length === 0) {
    return [];
  }

  await killPortProcesses(port, pids);
  return [...new Set(pids)];
};
