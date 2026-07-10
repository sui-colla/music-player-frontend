import { songs } from "./data/songs.js";
import { lyrics } from "./data/lyrics.js";

const audio = document.querySelector("#audioPlayer");
const songList = document.querySelector("#songList");
const queueList = document.querySelector("#queueList");
const lyricList = document.querySelector("#lyricList");
const lyricStatus = document.querySelector("#lyricStatus");
const searchInput = document.querySelector("#searchInput");
const playlistForm = document.querySelector("#playlistForm");
const playlistNameInput = document.querySelector("#playlistNameInput");
const viewTitle = document.querySelector("#viewTitle");
const listTitle = document.querySelector("#listTitle");
const songCount = document.querySelector("#songCount");
const queueCount = document.querySelector("#queueCount");
const heroCover = document.querySelector("#heroCover");
const heroTitle = document.querySelector("#heroTitle");
const heroArtist = document.querySelector("#heroArtist");
const playerCover = document.querySelector("#playerCover");
const playerTitle = document.querySelector("#playerTitle");
const playerArtist = document.querySelector("#playerArtist");
const playButton = document.querySelector("#playButton");
const prevButton = document.querySelector("#prevButton");
const nextButton = document.querySelector("#nextButton");
const progressInput = document.querySelector("#progressInput");
const currentTime = document.querySelector("#currentTime");
const durationTime = document.querySelector("#durationTime");
const volumeInput = document.querySelector("#volumeInput");
const muteButton = document.querySelector("#muteButton");
const playModeButton = document.querySelector("#playModeButton");
const themeToggle = document.querySelector("#themeToggle");
const themeLabel = document.querySelector("#themeLabel");
const playbackStatus = document.querySelector("#playbackStatus");
const toast = document.querySelector("#toast");
const navItems = document.querySelectorAll(".nav-item");

const playModes = [
  { key: "order", label: "顺序播放" },
  { key: "repeat", label: "单曲循环" },
  { key: "shuffle", label: "随机播放" },
];

const recommendedSongIds = ["song-002", "song-001", "song-004", "song-003"];
const defaultQueue = songs.map((song) => song.id);
const savedQueue = readJsonStorage("queue", null);
const savedPlayMode = localStorage.getItem("playMode");

const state = {
  currentSongId: null,
  isPlaying: false,
  queue: Array.isArray(savedQueue) ? savedQueue : defaultQueue,
  likedSongIds: readArrayStorage("likedSongIds"),
  recentSongIds: readArrayStorage("recentSongIds"),
  playlists: readArrayStorage("playlists"),
  activePlaylistId: localStorage.getItem("activePlaylistId") || "",
  playMode: playModes.some((item) => item.key === savedPlayMode) ? savedPlayMode : "order",
  view: "home",
  search: "",
  volume: readVolumeStorage(),
  theme: localStorage.getItem("theme") === "light" ? "light" : "dark",
};

if (!state.playlists.length) {
  state.playlists = [{ id: "playlist-default", name: "我的歌单", songIds: [] }];
}

if (!state.activePlaylistId || !state.playlists.some((playlist) => playlist.id === state.activePlaylistId)) {
  state.activePlaylistId = state.playlists[0].id;
}

state.queue = state.queue.filter((songId) => songs.some((song) => song.id === songId));
if (!state.queue.length && Array.isArray(savedQueue) && savedQueue.length) {
  state.queue = [...defaultQueue];
}

audio.volume = state.volume;
volumeInput.value = String(state.volume);

function getCurrentSong() {
  return songs.find((song) => song.id === state.currentSongId) || null;
}

function getSongById(songId) {
  return songs.find((song) => song.id === songId) || null;
}

function getActivePlaylist() {
  return state.playlists.find((playlist) => playlist.id === state.activePlaylistId) || state.playlists[0];
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function readJsonStorage(key, fallback) {
  try {
    const rawValue = localStorage.getItem(key);
    if (rawValue === null) return fallback;
    return JSON.parse(rawValue);
  } catch (error) {
    localStorage.removeItem(key);
    return fallback;
  }
}

function readArrayStorage(key) {
  const value = readJsonStorage(key, []);
  return Array.isArray(value) ? value : [];
}

function readVolumeStorage() {
  const value = Number(localStorage.getItem("volume") || 0.8);
  if (!Number.isFinite(value)) return 0.8;
  return Math.min(1, Math.max(0, value));
}

function saveLibraryState() {
  localStorage.setItem("likedSongIds", JSON.stringify(state.likedSongIds));
  localStorage.setItem("recentSongIds", JSON.stringify(state.recentSongIds));
  localStorage.setItem("playlists", JSON.stringify(state.playlists));
  localStorage.setItem("queue", JSON.stringify(state.queue));
  localStorage.setItem("activePlaylistId", state.activePlaylistId);
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return "0:00";
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${rest}`;
}

function setPlaybackStatus(message, type = "neutral") {
  playbackStatus.textContent = message;
  playbackStatus.dataset.type = type;
}

let toastTimer = 0;

function notify(message, type = "neutral") {
  toast.textContent = message;
  toast.dataset.type = type;
  toast.classList.add("show");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toast.classList.remove("show");
  }, 2200);
}

function applyTheme() {
  const isLight = state.theme === "light";
  document.documentElement.dataset.theme = state.theme;
  themeToggle.checked = isLight;
  themeLabel.textContent = isLight ? "浅色模式" : "深色模式";
  themeToggle.setAttribute("aria-label", isLight ? "切换深色主题" : "切换浅色主题");
}

function getVisibleSongs() {
  const keyword = state.search.trim().toLowerCase();
  let baseSongs = songs;

  if (state.view === "favorites") {
    baseSongs = songs.filter((song) => state.likedSongIds.includes(song.id));
  }

  if (state.view === "queue") {
    baseSongs = state.queue.map(getSongById).filter(Boolean);
  }

  if (state.view === "recent") {
    baseSongs = state.recentSongIds.map(getSongById).filter(Boolean);
  }

  if (state.view === "playlist") {
    const playlist = getActivePlaylist();
    baseSongs = playlist ? playlist.songIds.map(getSongById).filter(Boolean) : [];
  }

  if (!keyword) return baseSongs;

  return baseSongs.filter((song) => {
    return [song.title, song.artist, song.album].some((value) => value.toLowerCase().includes(keyword));
  });
}

function renderHomeSongCard(song) {
  const isPlaying = song.id === state.currentSongId;
  return `
    <article class="home-song-card ${isPlaying ? "playing" : ""}" data-song-id="${song.id}">
      <img src="${song.cover}" alt="${escapeHtml(song.title)} 封面" />
      <div>
        <strong>${escapeHtml(song.title)}</strong>
        <span>${escapeHtml(song.artist)} · ${escapeHtml(song.album)}</span>
      </div>
      <span class="home-song-duration">${formatTime(song.duration)}</span>
      <button class="table-button" type="button" aria-label="播放 ${escapeHtml(song.title)}">播放</button>
    </article>
  `;
}

function renderHome() {
  const recommendedSongs = recommendedSongIds.map(getSongById).filter(Boolean);
  const recentSongs = state.recentSongIds.map(getSongById).filter(Boolean).slice(0, 4);
  const activePlaylist = getActivePlaylist();
  const recentMarkup = recentSongs.length
    ? recentSongs.map(renderHomeSongCard).join("")
    : `<div class="empty-state">暂无最近播放</div>`;

  return `
    <div class="home-summary">
      <button class="home-link" type="button" data-go-view="library">
        <strong>${songs.length}</strong>
        <span>全部歌曲</span>
      </button>
      <button class="home-link" type="button" data-go-view="favorites">
        <strong>${state.likedSongIds.length}</strong>
        <span>我喜欢</span>
      </button>
      <button class="home-link" type="button" data-go-view="queue">
        <strong>${state.queue.length}</strong>
        <span>播放队列</span>
      </button>
      <button class="home-link" type="button" data-go-view="playlist">
        <strong>${activePlaylist ? activePlaylist.songIds.length : 0}</strong>
        <span>${activePlaylist ? escapeHtml(activePlaylist.name) : "我的歌单"}</span>
      </button>
    </div>

    <section class="home-block">
      <div class="home-block-heading">
        <h4>推荐歌曲</h4>
        <span>今日可听</span>
      </div>
      <div class="home-song-grid">
        ${recommendedSongs.map(renderHomeSongCard).join("")}
      </div>
    </section>

    <section class="home-block">
      <div class="home-block-heading">
        <h4>最近播放</h4>
        <button class="table-button" type="button" data-go-view="recent">查看全部</button>
      </div>
      <div class="home-song-grid">
        ${recentMarkup}
      </div>
    </section>
  `;
}
function renderSongs() {
  const visibleSongs = getVisibleSongs();
  const playlist = getActivePlaylist();
  const isSearching = Boolean(state.search.trim());

  if (state.view === "home" && !isSearching) {
    listTitle.textContent = "首页推荐";
    songCount.textContent = `${songs.length} 首`;
    songList.innerHTML = renderHome();
    return;
  }

  songCount.textContent = `${visibleSongs.length} 首`;

  if (isSearching) {
    listTitle.textContent = "搜索结果";
  } else if (state.view === "queue") {
    listTitle.textContent = "当前队列";
  } else if (state.view === "recent") {
    listTitle.textContent = "最近播放";
  } else if (state.view === "playlist") {
    listTitle.textContent = playlist ? playlist.name : "我的歌单";
  } else if (state.view === "favorites") {
    listTitle.textContent = "我喜欢的音乐";
  } else {
    listTitle.textContent = "全部歌曲";
  }

  const playlistToolbar = state.view === "playlist" && !isSearching ? renderPlaylistToolbar() : "";

  if (!visibleSongs.length) {
    songList.innerHTML = `${playlistToolbar}<div class="empty-state">没有找到歌曲</div>`;
    return;
  }

  songList.innerHTML = playlistToolbar + visibleSongs.map((song) => {
    const isPlaying = song.id === state.currentSongId;
    const isLiked = state.likedSongIds.includes(song.id);
    const inActivePlaylist = playlist ? playlist.songIds.includes(song.id) : false;
    const inQueue = state.queue.includes(song.id);
    const playlistButtonText = state.view === "playlist" && inActivePlaylist ? "移出" : "加歌单";

    return `
      <article class="song-row ${isPlaying ? "playing" : ""}" data-song-id="${song.id}">
        <img src="${song.cover}" alt="${song.title} 封面" />
        <div>
          <span class="song-title">${escapeHtml(song.title)}</span>
          <span class="song-meta">${escapeHtml(song.artist)}</span>
        </div>
        <span class="song-meta album-cell">${escapeHtml(song.album)}</span>
        <span class="song-meta duration-cell">${formatTime(song.duration)}</span>
        <div class="song-actions">
          <button class="table-button ${isLiked ? "liked" : ""}" type="button" data-like-id="${song.id}">${isLiked ? "已喜欢" : "喜欢"}</button>
          <button class="table-button ${inQueue ? "queued" : ""}" type="button" data-queue-song-id="${song.id}">${inQueue ? "已在队列" : "加队列"}</button>
          <button class="table-button" type="button" data-playlist-song-id="${song.id}">${playlistButtonText}</button>
        </div>
      </article>
    `;
  }).join("");
}

function renderPlaylistToolbar() {
  const playlist = getActivePlaylist();
  const buttons = state.playlists.map((item) => `
    <button class="playlist-chip ${item.id === state.activePlaylistId ? "active" : ""}" type="button" data-select-playlist-id="${item.id}">
      ${escapeHtml(item.name)}
    </button>
  `).join("");

  const deleteButton = playlist && playlist.id !== "playlist-default"
    ? `<button class="table-button danger" type="button" data-delete-playlist-id="${playlist.id}">删除歌单</button>`
    : "";

  return `
    <div class="playlist-toolbar">
      <div class="playlist-chips">${buttons}</div>
      ${deleteButton}
    </div>
  `;
}

function renderQueue() {
  const queueSongs = state.queue.map(getSongById).filter(Boolean);
  queueCount.textContent = `${queueSongs.length} 首`;

  if (!queueSongs.length) {
    queueList.innerHTML = `<div class="empty-state">播放队列为空</div>`;
    return;
  }

  queueList.innerHTML = queueSongs.map((song, index) => `
    <div class="queue-item ${song.id === state.currentSongId ? "playing" : ""}" data-queue-id="${song.id}">
      <div>
        <strong>${index + 1}. ${escapeHtml(song.title)}</strong>
        <span>${escapeHtml(song.artist)}</span>
      </div>
      <button class="icon-button" type="button" aria-label="从队列移除" data-remove-id="${song.id}">×</button>
    </div>
  `).join("");
}

function renderLyrics() {
  const song = getCurrentSong();
  if (!song) {
    lyricStatus.textContent = "未播放";
    lyricList.innerHTML = `<div class="empty-state">选择歌曲后显示歌词</div>`;
    return;
  }

  const songLyrics = lyrics[song.id] || [];
  lyricStatus.textContent = songLyrics.length ? "同步中" : "无歌词";

  if (!songLyrics.length) {
    lyricList.innerHTML = `<div class="empty-state">这首歌暂无歌词</div>`;
    return;
  }

  const activeIndex = getActiveLyricIndex(songLyrics, audio.currentTime || 0);
  lyricList.innerHTML = songLyrics.map((line, index) => `
    <p class="lyric-line ${index === activeIndex ? "active" : ""}" data-lyric-index="${index}">${escapeHtml(line.text)}</p>
  `).join("");

  const activeLine = lyricList.querySelector(".lyric-line.active");
  if (activeLine) {
    activeLine.scrollIntoView({ block: "center", behavior: "smooth" });
  }
}

function getActiveLyricIndex(songLyrics, time) {
  let activeIndex = 0;
  songLyrics.forEach((line, index) => {
    if (time >= line.time) {
      activeIndex = index;
    }
  });
  return activeIndex;
}

function renderPlayer() {
  const song = getCurrentSong();
  const mode = playModes.find((item) => item.key === state.playMode) || playModes[0];
  playModeButton.textContent = mode.label;
  playButton.textContent = state.isPlaying ? "⏸" : "▶";
  muteButton.textContent = audio.muted || audio.volume === 0 ? "🔇" : "🔊";

  if (!song) {
    const fallbackCover = songs[0]?.cover || "";
    heroCover.src = fallbackCover;
    heroTitle.textContent = "选择一首歌曲";
    heroArtist.textContent = "点击列表中的歌曲开始播放";
    playerCover.src = fallbackCover;
    playerTitle.textContent = "未播放";
    playerArtist.textContent = "请选择歌曲";
    return;
  }

  heroCover.src = song.cover;
  heroTitle.textContent = song.title;
  heroArtist.textContent = `${song.artist} · ${song.album}`;
  playerCover.src = song.cover;
  playerTitle.textContent = song.title;
  playerArtist.textContent = song.artist;
}

function renderViewTitle() {
  const titleMap = {
    home: "首页",
    library: "音乐库",
    favorites: "我喜欢",
    recent: "最近播放",
    queue: "播放队列",
    playlist: "我的歌单",
  };

  viewTitle.textContent = titleMap[state.view];
  navItems.forEach((item) => {
    item.classList.toggle("active", item.dataset.view === state.view);
  });
}

function render() {
  renderViewTitle();
  renderSongs();
  renderQueue();
  renderLyrics();
  renderPlayer();
}

async function playSong(songId) {
  const song = songs.find((item) => item.id === songId);
  if (!song) {
    setPlaybackStatus("没有可播放的歌曲", "error");
    return;
  }

  if (!state.queue.includes(songId)) {
    state.queue.push(songId);
  }

  state.currentSongId = songId;
  state.recentSongIds = [songId, ...state.recentSongIds.filter((id) => id !== songId)].slice(0, 20);
  saveLibraryState();
  audio.src = song.url;
  setPlaybackStatus("正在载入", "loading");

  try {
    await audio.play();
    state.isPlaying = true;
    setPlaybackStatus("播放中", "success");
    notify(`正在播放：${song.title}`, "success");
  } catch (error) {
    state.isPlaying = false;
    setPlaybackStatus("音频文件无法播放", "error");
    notify("音频文件无法播放", "error");
  }

  render();
}

async function togglePlay() {
  const song = getCurrentSong();

  if (!song) {
    await playSong(state.queue[0] || songs[0]?.id);
    return;
  }

  if (audio.paused) {
    try {
      setPlaybackStatus("正在载入", "loading");
      await audio.play();
      state.isPlaying = true;
      setPlaybackStatus("播放中", "success");
    } catch (error) {
      state.isPlaying = false;
      setPlaybackStatus("音频文件无法播放", "error");
    }
  } else {
    audio.pause();
    state.isPlaying = false;
    setPlaybackStatus("已暂停");
  }

  render();
}

function getNextSongId(direction = 1) {
  if (!state.queue.length) return songs[0]?.id;
  if (!state.currentSongId) return state.queue[0] || songs[0].id;
  if (state.playMode === "repeat") return state.currentSongId;
  if (state.playMode === "shuffle" && direction > 0) {
    const available = state.queue.filter((id) => id !== state.currentSongId);
    return available[Math.floor(Math.random() * available.length)] || state.currentSongId;
  }

  const currentIndex = state.queue.indexOf(state.currentSongId);
  if (currentIndex === -1) return state.queue[0] || songs[0].id;

  const nextIndex = (currentIndex + direction + state.queue.length) % state.queue.length;
  return state.queue[nextIndex];
}

function toggleLike(songId) {
  if (state.likedSongIds.includes(songId)) {
    state.likedSongIds = state.likedSongIds.filter((id) => id !== songId);
    notify("已取消喜欢");
  } else {
    state.likedSongIds.push(songId);
    notify("已加入我喜欢", "success");
  }

  saveLibraryState();
  render();
}

function addSongToQueue(songId) {
  if (!getSongById(songId)) return;
  if (state.queue.includes(songId)) {
    notify("歌曲已在播放队列");
    return;
  }

  state.queue.push(songId);
  saveLibraryState();
  notify("已加入播放队列", "success");
  render();
}

function removeSongFromQueue(songId) {
  if (!state.queue.includes(songId)) return;

  state.queue = state.queue.filter((id) => id !== songId);

  if (state.currentSongId === songId) {
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    state.currentSongId = null;
    state.isPlaying = false;
    progressInput.value = "0";
    currentTime.textContent = "0:00";
    durationTime.textContent = "0:00";
  }

  saveLibraryState();
  notify("已从播放队列移除");
  render();
}

function togglePlaylistSong(songId) {
  const playlist = getActivePlaylist();
  if (!playlist) return;

  if (playlist.songIds.includes(songId)) {
    if (state.view !== "playlist") {
      notify("歌曲已在当前歌单");
      return;
    }
    playlist.songIds = playlist.songIds.filter((id) => id !== songId);
    notify("已从歌单移除");
  } else {
    playlist.songIds.push(songId);
    notify(`已加入${playlist.name}`, "success");
  }

  saveLibraryState();
  render();
}

function createPlaylist(name) {
  const cleanName = name.trim();
  if (!cleanName) return;
  if (state.playlists.some((playlist) => playlist.name.toLowerCase() === cleanName.toLowerCase())) {
    notify("已有同名歌单", "error");
    return;
  }

  const playlist = {
    id: `playlist-${Date.now()}`,
    name: cleanName,
    songIds: [],
  };

  state.playlists.push(playlist);
  state.activePlaylistId = playlist.id;
  state.view = "playlist";
  playlistNameInput.value = "";
  saveLibraryState();
  notify("歌单已创建", "success");
  render();
}

function deletePlaylist(playlistId) {
  state.playlists = state.playlists.filter((playlist) => playlist.id !== playlistId);
  if (!state.playlists.length) {
    state.playlists = [{ id: "playlist-default", name: "我的歌单", songIds: [] }];
  }
  state.activePlaylistId = state.playlists[0].id;
  saveLibraryState();
  notify("歌单已删除");
  render();
}

songList.addEventListener("click", (event) => {
  const viewButton = event.target.closest("[data-go-view]");
  if (viewButton) {
    state.view = viewButton.dataset.goView;
    render();
    return;
  }
  const playlistSelectButton = event.target.closest("[data-select-playlist-id]");
  if (playlistSelectButton) {
    state.activePlaylistId = playlistSelectButton.dataset.selectPlaylistId;
    saveLibraryState();
    render();
    return;
  }

  const playlistDeleteButton = event.target.closest("[data-delete-playlist-id]");
  if (playlistDeleteButton) {
    deletePlaylist(playlistDeleteButton.dataset.deletePlaylistId);
    return;
  }

  const likeButton = event.target.closest("[data-like-id]");
  if (likeButton) {
    toggleLike(likeButton.dataset.likeId);
    return;
  }

  const queueButton = event.target.closest("[data-queue-song-id]");
  if (queueButton) {
    addSongToQueue(queueButton.dataset.queueSongId);
    return;
  }

  const playlistButton = event.target.closest("[data-playlist-song-id]");
  if (playlistButton) {
    togglePlaylistSong(playlistButton.dataset.playlistSongId);
    return;
  }

  const row = event.target.closest("[data-song-id]");
  if (row) {
    playSong(row.dataset.songId);
  }
});

queueList.addEventListener("click", (event) => {
  const removeButton = event.target.closest("[data-remove-id]");
  if (removeButton) {
    removeSongFromQueue(removeButton.dataset.removeId);
    return;
  }

  const item = event.target.closest("[data-queue-id]");
  if (item) {
    playSong(item.dataset.queueId);
  }
});

navItems.forEach((item) => {
  item.addEventListener("click", () => {
    state.view = item.dataset.view;
    render();
  });
});

playlistForm.addEventListener("submit", (event) => {
  event.preventDefault();
  createPlaylist(playlistNameInput.value);
});

searchInput.addEventListener("input", () => {
  state.search = searchInput.value;
  renderSongs();
});

playButton.addEventListener("click", togglePlay);
prevButton.addEventListener("click", () => playSong(getNextSongId(-1)));
nextButton.addEventListener("click", () => playSong(getNextSongId(1)));

playModeButton.addEventListener("click", () => {
  const currentIndex = playModes.findIndex((item) => item.key === state.playMode);
  const nextMode = playModes[(currentIndex + 1) % playModes.length];
  state.playMode = nextMode.key;
  localStorage.setItem("playMode", state.playMode);
  notify(nextMode.label);
  renderPlayer();
});

themeToggle.addEventListener("change", () => {
  state.theme = themeToggle.checked ? "light" : "dark";
  localStorage.setItem("theme", state.theme);
  applyTheme();
  notify(state.theme === "light" ? "已切换浅色模式" : "已切换深色模式");
});

progressInput.addEventListener("input", () => {
  if (!Number.isFinite(audio.duration)) return;
  audio.currentTime = Number(progressInput.value);
});

volumeInput.addEventListener("input", () => {
  state.volume = Number(volumeInput.value);
  audio.volume = state.volume;
  audio.muted = false;
  localStorage.setItem("volume", String(state.volume));
  renderPlayer();
});

muteButton.addEventListener("click", () => {
  audio.muted = !audio.muted;
  renderPlayer();
});

audio.addEventListener("loadedmetadata", () => {
  progressInput.max = String(Math.floor(audio.duration));
  durationTime.textContent = formatTime(audio.duration);
  if (!state.isPlaying) {
    setPlaybackStatus("已就绪");
  }
});

audio.addEventListener("timeupdate", () => {
  progressInput.value = String(Math.floor(audio.currentTime));
  currentTime.textContent = formatTime(audio.currentTime);
  renderLyrics();
});

audio.addEventListener("ended", () => {
  playSong(getNextSongId(1));
});

audio.addEventListener("pause", () => {
  state.isPlaying = false;
  if (state.currentSongId) {
    setPlaybackStatus("已暂停");
  }
  renderPlayer();
});

audio.addEventListener("play", () => {
  state.isPlaying = true;
  setPlaybackStatus("播放中", "success");
  renderPlayer();
});

audio.addEventListener("waiting", () => {
  setPlaybackStatus("缓冲中", "loading");
});

audio.addEventListener("error", () => {
  state.isPlaying = false;
  setPlaybackStatus("音频文件无法播放", "error");
  notify("音频文件无法播放", "error");
  renderPlayer();
});

applyTheme();
render();
