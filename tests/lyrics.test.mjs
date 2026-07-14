import test from "node:test";
import assert from "node:assert/strict";
import { parseLyricText, parseLyricTimestamp } from "../src/utils/lyrics.mjs";

test("parses LRC timestamp fractions", () => {
  assert.equal(parseLyricTimestamp("01:02.3"), 62.3);
  assert.equal(parseLyricTimestamp("01:02.34"), 62.34);
  assert.equal(parseLyricTimestamp("01:02.345"), 62.345);
});

test("applies positive and negative LRC offsets", () => {
  assert.equal(parseLyricText("[offset:+500]\n[00:10.00]later")[0].time, 10.5);
  assert.equal(parseLyricText("[offset:-750]\n[00:10.00]earlier")[0].time, 9.25);
});

test("expands multiple timestamps and ignores metadata", () => {
  const lines = parseLyricText("[ti:Song]\n[00:01.00][00:02.00]repeat");
  assert.deepEqual(lines, [{ time: 1, text: "repeat" }, { time: 2, text: "repeat" }]);
});

test("estimates untimed text across the duration", () => {
  assert.deepEqual(parseLyricText("one\ntwo", 10), [{ time: 0, text: "one" }, { time: 5, text: "two" }]);
});
