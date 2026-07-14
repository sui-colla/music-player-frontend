export function parseLyricTimestamp(value) {
  const match = String(value).match(/(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?/);
  if (!match) return 0;

  const minutes = Number(match[1]);
  const seconds = Number(match[2]);
  const fraction = match[3] ? Number(`0.${match[3].padEnd(3, "0").slice(0, 3)}`) : 0;
  return minutes * 60 + seconds + fraction;
}

export function parseLyricText(rawText, duration = 0) {
  const text = String(rawText || "").trim();
  if (!text) return [];

  const timedLines = [];
  const plainLines = [];
  const timestampPattern = /\[(\d{1,2}:\d{2}(?:[.:]\d{1,3})?)\]/g;
  const offsetMatch = text.match(/^\s*\[offset:([+-]?\d+)\]\s*$/im);
  const sourceOffsetSeconds = offsetMatch ? Number(offsetMatch[1]) / 1000 : 0;

  text.split(/\r?\n/).forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line) return;

    const timestamps = Array.from(line.matchAll(timestampPattern));
    const lyricText = line.replace(timestampPattern, "").trim();
    if (timestamps.length) {
      if (!lyricText) return;
      timestamps.forEach((timestamp) => timedLines.push({
        time: parseLyricTimestamp(timestamp[1]),
        text: lyricText,
      }));
      return;
    }

    if (/^\[(ti|ar|al|by|offset|length|re):/i.test(line)) return;
    plainLines.push(line);
  });

  if (timedLines.length) {
    return timedLines
      .filter((line) => line.text)
      .sort((a, b) => a.time - b.time)
      .map((line) => ({
        time: Math.max(0, Number((line.time + sourceOffsetSeconds).toFixed(3))),
        text: line.text,
      }));
  }

  if (!plainLines.length) return [];
  const totalDuration = Number.isFinite(duration) && duration > 0 ? duration : plainLines.length * 4;
  const step = Math.max(2.5, totalDuration / plainLines.length);
  return plainLines.map((line, index) => ({ time: Number((index * step).toFixed(3)), text: line }));
}
