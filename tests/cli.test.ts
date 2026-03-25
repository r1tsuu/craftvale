import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { parseCliFlagValue, parseDataDir } from "../src/utils/cli.ts";

test("parseCliFlagValue supports separated and inline values", () => {
  expect(parseCliFlagValue(["--port", "3210"], "port")).toBe("3210");
  expect(parseCliFlagValue(["--data-dir=/tmp/saves"], "data-dir")).toBe("/tmp/saves");
});

test("parseCliFlagValue fails fast on missing values", () => {
  expect(() => parseCliFlagValue(["--port"], "port")).toThrow("Missing value for --port");
  expect(() => parseCliFlagValue(["--data-dir="], "data-dir")).toThrow(
    "Missing value for --data-dir",
  );
  expect(() => parseCliFlagValue(["--data-dir", "--port=3210"], "data-dir")).toThrow(
    "Missing value for --data-dir",
  );
});

test("parseDataDir resolves relative paths and returns undefined when absent", () => {
  expect(parseDataDir([])).toBeUndefined();
  expect(parseDataDir(["--data-dir", "tmp/custom-data"])).toBe(resolve("tmp/custom-data"));
  expect(parseDataDir(["--data-dir", "./data-2"])).toBe(resolve("./data-2"));
  expect(parseDataDir(["--data-dir=./data-2"])).toBe(resolve("./data-2"));
});
