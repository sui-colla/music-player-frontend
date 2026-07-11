function createDemoTrack(notes, duration) {
  const sampleRate = 8000;
  const totalSamples = sampleRate * duration;
  const buffer = new ArrayBuffer(44 + totalSamples * 2);
  const view = new DataView(buffer);
  const writeText = (offset, text) => [...text].forEach((character, index) => view.setUint8(offset + index, character.charCodeAt(0)));

  writeText(0, "RIFF");
  view.setUint32(4, 36 + totalSamples * 2, true);
  writeText(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeText(36, "data");
  view.setUint32(40, totalSamples * 2, true);

  for (let sampleIndex = 0; sampleIndex < totalSamples; sampleIndex += 1) {
    const time = sampleIndex / sampleRate;
    const note = notes[Math.floor(time / 2) % notes.length];
    const beat = time % 2;
    const envelope = Math.min(1, beat * 8) * Math.max(0.2, 1 - Math.max(0, beat - 1.55) * 1.6);
    const sample = (Math.sin(2 * Math.PI * note * time) * 0.58 + Math.sin(2 * Math.PI * note * 1.5 * time) * 0.2) * envelope;
    view.setInt16(44 + sampleIndex * 2, Math.round(sample * 10500), true);
  }

  return URL.createObjectURL(new Blob([buffer], { type: "audio/wav" }));
}

const demoDuration = 32;

export const songs = [
  {
    id: "song-001",
    title: "晨光电台",
    artist: "StarFile Studio",
    album: "初始旋律",
    duration: demoDuration,
    cover: "./src/assets/covers/signal.svg",
    url: createDemoTrack([261.63, 329.63, 392, 523.25], demoDuration),
  },
  {
    id: "song-002",
    title: "夜色漫游",
    artist: "StarFile Studio",
    album: "初始旋律",
    duration: demoDuration,
    cover: "./src/assets/covers/night.svg",
    url: createDemoTrack([220, 261.63, 329.63, 392], demoDuration),
  },
  {
    id: "song-003",
    title: "蓝色边境",
    artist: "StarFile Studio",
    album: "初始旋律",
    duration: demoDuration,
    cover: "./src/assets/covers/coast.svg",
    url: createDemoTrack([196, 246.94, 293.66, 392], demoDuration),
  },
  {
    id: "song-004",
    title: "周末节拍",
    artist: "StarFile Studio",
    album: "初始旋律",
    duration: demoDuration,
    cover: "./src/assets/covers/beat.svg",
    url: createDemoTrack([293.66, 369.99, 440, 587.33], demoDuration),
  },
];
