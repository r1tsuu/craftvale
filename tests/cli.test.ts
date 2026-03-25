import { expect, test } from "bun:test";
import { resolve } from "node:path";
import {
  parseCliFlagValue,
  parseClientDir,
  parseServerDir,
} from "../src/utils/cli.ts";

test("parseCliFlagValue supports separated and inline values", () => {
  expect(parseCliFlagValue(["--port", "3210"], "port")).toBe("3210");
  expect(parseCliFlagValue(["--client-dir", "./client-data"], "client-dir")).toBe("./client-data");
  expect(parseCliFlagValue(["--server-dir=./server-data"], "server-dir")).toBe("./server-data");
});

test("parseCliFlagValue fails fast on missing values", () => {
  expect(() => parseCliFlagValue(["--port"], "port")).toThrow("Missing value for --port");
  expect(() => parseCliFlagValue(["--client-dir"], "client-dir")).toThrow(
    "Missing value for --client-dir",
  );
  expect(() => parseCliFlagValue(["--server-dir", "--port=3210"], "server-dir")).toThrow(
    "Missing value for --server-dir",
  );
});

test("parseClientDir and parseServerDir resolve explicit split roots", () => {
  expect(parseClientDir(["--client-dir", "./client-data"])).toBe(
    resolve("./client-data"),
  );
  expect(parseServerDir(["--server-dir=./server-data"])).toBe(
    resolve("./server-data"),
  );
  expect(parseClientDir(["--client-dir=./client-2"])).toBe(resolve("./client-2"));
  expect(parseServerDir(["--server-dir", "./server-2"])).toBe(resolve("./server-2"));
  expect(parseClientDir([])).toBeUndefined();
  expect(parseServerDir([])).toBeUndefined();
});
