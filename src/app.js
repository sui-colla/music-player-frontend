import { songs as staticSongs } from "./data/songs.js";
import { lyrics } from "./data/lyrics.js";
import { parseLyricText } from "./utils/lyrics.mjs";

const audio = document.querySelector("#audioPlayer");
const appShell = document.querySelector(".app-shell");
const songList = document.querySelector("#songList");
const queueList = document.querySelector("#queueList");
const lyricList = document.querySelector("#lyricList");
const lyricStatus = document.querySelector("#lyricStatus");
const nowPlayingView = document.querySelector("#nowPlayingView");
const nowPlayingTrigger = document.querySelector("#nowPlayingTrigger");
const nowPlayingBackButton = document.querySelector("#nowPlayingBackButton");
const nowPlayingArtwork = document.querySelector("#nowPlayingArtwork");
const nowPlayingTitle = document.querySelector("#nowPlayingTitle");
const nowPlayingArtist = document.querySelector("#nowPlayingArtist");
const nowPlayingLyricList = document.querySelector("#nowPlayingLyricList");
const nowPlayingLyricStatus = document.querySelector("#nowPlayingLyricStatus");
const nowPlayingQueueList = document.querySelector("#nowPlayingQueueList");
const nowPlayingQueueCount = document.querySelector("#nowPlayingQueueCount");
const searchInput = document.querySelector("#searchInput");
const playlistForm = document.querySelector("#playlistForm");
const playlistNameInput = document.querySelector("#playlistNameInput");
const viewTitle = document.querySelector("#viewTitle");
const listTitle = document.querySelector("#listTitle");
const songCount = document.querySelector("#songCount");
const songSection = document.querySelector(".song-section");
const queueCount = document.querySelector("#queueCount");
const heroCover = document.querySelector("#heroCover");
const heroTitle = document.querySelector("#heroTitle");
const heroArtist = document.querySelector("#heroArtist");
const heroActionButton = document.querySelector("#heroActionButton");
const heroActionLabel = heroActionButton?.querySelector("span:last-child");
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
const importSongButton = document.querySelector("#importSongButton");
const songFileInput = document.querySelector("#songFileInput");
const lyricFileInput = document.querySelector("#lyricFileInput");
const importDialog = document.querySelector("#importDialog");
const importForm = document.querySelector("#importForm");
const importRows = document.querySelector("#importRows");
const importStatus = document.querySelector("#importStatus");
const importCancelButton = document.querySelector("#importCancelButton");
const importCloseButton = document.querySelector("#importCloseButton");
const editLocalSongDialog = document.querySelector("#editLocalSongDialog");
const editLocalSongForm = document.querySelector("#editLocalSongForm");
const editLocalSongTitle = document.querySelector("#editLocalSongTitle");
const editLocalSongArtist = document.querySelector("#editLocalSongArtist");
const editLocalSongAlbum = document.querySelector("#editLocalSongAlbum");
const editLocalSongLyrics = document.querySelector("#editLocalSongLyrics");
const editLocalSongLyricFile = document.querySelector("#editLocalSongLyricFile");
const editLocalSongCancelButton = document.querySelector("#editLocalSongCancelButton");
const editLocalSongCloseButton = document.querySelector("#editLocalSongCloseButton");
const settingsButton = document.querySelector("#settingsButton");
const settingsDialog = document.querySelector("#settingsDialog");
const settingsCloseButton = document.querySelector("#settingsCloseButton");
const autoUpdateCheck = document.querySelector("#autoUpdateCheck");
const currentVersion = document.querySelector("#currentVersion");
const updateStatus = document.querySelector("#updateStatus");
const updateStatusTitle = document.querySelector("#updateStatusTitle");
const updateStatusText = document.querySelector("#updateStatusText");
const updateProgress = document.querySelector("#updateProgress");
const updateProgressBar = document.querySelector("#updateProgressBar");
const updateReleaseNotes = document.querySelector("#updateReleaseNotes");
const checkUpdateButton = document.querySelector("#checkUpdateButton");
const installUpdateButton = document.querySelector("#installUpdateButton");
const updateDialog = document.querySelector("#updateDialog");
const updatePromptTitle = document.querySelector("#updatePromptTitle");
const updatePromptMessage = document.querySelector("#updatePromptMessage");
const updateLaterButton = document.querySelector("#updateLaterButton");
const openUpdateSettingsButton = document.querySelector("#openUpdateSettingsButton");
const folderSettingsSection = document.querySelector("#folderSettingsSection");
const addMusicFolderButton = document.querySelector("#addMusicFolderButton");
const scanFoldersButton = document.querySelector("#scanFoldersButton");
const cancelFolderScanButton = document.querySelector("#cancelFolderScanButton");
const cleanUnavailableButton = document.querySelector("#cleanUnavailableButton");
const folderScanStatus = document.querySelector("#folderScanStatus");
const storageUsageStatus = document.querySelector("#storageUsageStatus");
const folderList = document.querySelector("#folderList");
const navItems = document.querySelectorAll(".nav-item");
const playlistPreviewCards = document.querySelectorAll(".playlist-card[data-view]");

const localSongDbName = "melody-local-songs";
const localSongStoreName = "localSongs";
const localSongCover = "./src/assets/covers/signal.svg";
const playerVisual = "./src/assets/hero/hoshino-ai-idol-reference.png";
const objectUrls = new Map();
const artworkUrls = new Map();
let allSongs = [...staticSongs];
let pendingImportFiles = [];
let pendingLyricSongId = null;
let editingLocalSongId = null;
let renderedLyricSignature = "";
let lastLyricActiveIndex = -1;
const nativeHost = window.chrome?.webview || null;
const metadataReader = window.jsmediatags || null;
document.documentElement.dataset.metadataReader = metadataReader?.read ? "ready" : "unavailable";
const updateCheckIntervalMs = 30 * 60 * 1000;
const updateCheckCooldownMs = 60 * 1000;
let manualUpdateCheck = false;
let lastAnnouncedUpdateVersion = "";
let dismissedUpdateVersion = "";
let lastAutomaticUpdateCheckAt = 0;
let folderTracks = [];
let libraryFolders = [];
let folderLibraryLoaded = !nativeHost;
let indexedDbLoaded = false;
const playbackSessionKey = "playbackSessionV1";
let pendingRestorePosition = null;
let playbackRestored = false;
let lastPlaybackSaveAt = 0;
let lastNativeTimelineAt = 0;

const updater = {
  status: nativeHost ? "idle" : "unsupported",
  currentVersion: "",
  latestVersion: "",
  releaseName: "",
  releaseNotes: "",
  releaseUrl: "",
  canInstall: false,
  progress: 0,
  message: "",
};

const playModes = [
  { key: "order", label: "顺序播放" },
  { key: "repeat", label: "单曲循环" },
  { key: "shuffle", label: "随机播放" },
];

const defaultQueue = [];
const savedQueue = readJsonStorage("queue", null);
const savedPlayMode = localStorage.getItem("playMode");

const state = {
  currentSongId: null,
  isPlaying: false,
  queue: Array.isArray(savedQueue) ? savedQueue : defaultQueue,
  localSongs: [],
  likedSongIds: readArrayStorage("likedSongIds"),
  recentSongIds: readArrayStorage("recentSongIds"),
  playlists: readArrayStorage("playlists"),
  activePlaylistId: localStorage.getItem("activePlaylistId") || "",
  playMode: playModes.some((item) => item.key === savedPlayMode) ? savedPlayMode : "order",
  view: "home",
  playerViewOpen: false,
  search: "",
  volume: readVolumeStorage(),
  theme: localStorage.getItem("theme") === "dark" ? "dark" : "light",
  autoCheckUpdates: localStorage.getItem("autoCheckUpdates") !== "false",
};

if (!state.playlists.length) {
  state.playlists = [{ id: "playlist-default", name: "我的歌单", songIds: [] }];
}

if (!state.activePlaylistId || !state.playlists.some((playlist) => playlist.id === state.activePlaylistId)) {
  state.activePlaylistId = state.playlists[0].id;
}

audio.volume = state.volume;
volumeInput.value = String(state.volume);

function getCurrentSong() {
  return getSongById(state.currentSongId);
}

function getSongById(songId) {
  return allSongs.find((song) => song.id === songId) || null;
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

function openLocalSongDb() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error("IndexedDB is not available"));
      return;
    }

    const request = window.indexedDB.open(localSongDbName, 1);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(localSongStoreName)) {
        db.createObjectStore(localSongStoreName, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Failed to open local song database"));
  });
}

function readLocalSongs() {
  return new Promise((resolve, reject) => {
    openLocalSongDb()
      .then((db) => {
        const transaction = db.transaction(localSongStoreName, "readonly");
        const store = transaction.objectStore(localSongStoreName);
        const request = store.getAll();

        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error || new Error("Failed to read local songs"));
        transaction.oncomplete = () => db.close();
        transaction.onerror = () => {
          db.close();
          reject(transaction.error || new Error("Failed to read local songs"));
        };
      })
      .catch(reject);
  });
}

function saveLocalSongs(records) {
  return new Promise((resolve, reject) => {
    openLocalSongDb()
      .then((db) => {
        const transaction = db.transaction(localSongStoreName, "readwrite");
        const store = transaction.objectStore(localSongStoreName);

        records.forEach((record) => store.put(record));
        transaction.oncomplete = () => {
          db.close();
          resolve();
        };
        transaction.onerror = () => {
          db.close();
          reject(transaction.error || new Error("Failed to save local songs"));
        };
      })
      .catch(reject);
  });
}

function deleteLocalSongRecord(songId) {
  return new Promise((resolve, reject) => {
    openLocalSongDb()
      .then((db) => {
        const transaction = db.transaction(localSongStoreName, "readwrite");
        transaction.objectStore(localSongStoreName).delete(songId);
        transaction.oncomplete = () => {
          db.close();
          resolve();
        };
        transaction.onerror = () => {
          db.close();
          reject(transaction.error || new Error("Failed to delete local song"));
        };
      })
      .catch(reject);
  });
}

async function migrateLocalSongRecords(records) {
  const changed = [];
  const migrated = records.map((song) => {
    if (song.lyricParseVersion === 2 && Number.isFinite(song.lyricAdjustmentMs) && song.sourceType) return song;
    const nextSong = {
      ...song,
      lyricAdjustmentMs: Number.isFinite(song.lyricAdjustmentMs) ? song.lyricAdjustmentMs : 0,
      lyricParseVersion: 2,
      sourceType: song.sourceType || "indexeddb",
      isAvailable: song.isAvailable !== false,
    };
    if (song.lyricText) nextSong.lyrics = parseLyricText(song.lyricText, song.duration);
    changed.push(nextSong);
    return nextSong;
  });

  if (changed.length) await saveLocalSongs(changed);
  return migrated;
}

function refreshAllSongs() {
  allSongs = [...staticSongs, ...state.localSongs];
}

function normalizeLibraryReferences() {
  const existingSongIds = new Set(allSongs.map((song) => song.id));
  state.queue = state.queue.filter((songId) => existingSongIds.has(songId));
  state.likedSongIds = state.likedSongIds.filter((songId) => existingSongIds.has(songId));
  state.recentSongIds = state.recentSongIds.filter((songId) => existingSongIds.has(songId));
  state.playlists = state.playlists.map((playlist) => ({
    ...playlist,
    songIds: playlist.songIds.filter((songId) => existingSongIds.has(songId)),
  }));

  const currentSong = getCurrentSong();
  if (state.currentSongId && (!currentSong || currentSong.isAvailable === false)) {
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

const modalDialogs = [importDialog, editLocalSongDialog, settingsDialog, updateDialog];

function syncModalState() {
  const activeDialog = modalDialogs.find((dialog) => dialog.classList.contains("show")) || null;
  document.body.classList.toggle("modal-open", Boolean(activeDialog));
  [...appShell.children].forEach((element) => {
    const isDialog = modalDialogs.includes(element);
    element.inert = activeDialog ? element !== activeDialog : isDialog;
  });
}

function showDialog(dialog, focusTarget) {
  dialog.classList.add("show");
  dialog.setAttribute("aria-hidden", "false");
  syncModalState();
  window.setTimeout(() => focusTarget?.focus(), 0);
}

function hideDialog(dialog) {
  dialog.classList.remove("show");
  dialog.setAttribute("aria-hidden", "true");
  syncModalState();
}

function trapDialogFocus(event) {
  let activeDialog = null;
  for (let index = modalDialogs.length - 1; index >= 0; index -= 1) {
    if (modalDialogs[index].classList.contains("show")) {
      activeDialog = modalDialogs[index];
      break;
    }
  }
  if (!activeDialog) return;

  const focusable = [...activeDialog.querySelectorAll(
    'button:not([disabled]):not([hidden]), input:not([disabled]):not([hidden]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  )].filter((element) => element.offsetParent !== null);
  if (!focusable.length) {
    event.preventDefault();
    return;
  }

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const focusIsOutside = !activeDialog.contains(document.activeElement);
  if (event.shiftKey && (document.activeElement === first || focusIsOutside)) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (document.activeElement === last || focusIsOutside)) {
    event.preventDefault();
    first.focus();
  }
}

function postHostMessage(type, payload = {}) {
  if (!nativeHost) return false;
  nativeHost.postMessage({ type, ...payload });
  return true;
}

function readPlaybackSession() {
  const session = readJsonStorage(playbackSessionKey, null);
  if (!session || typeof session.songId !== "string" || !Number.isFinite(session.position)) return null;
  if (!Number.isFinite(session.savedAt) || Date.now() - session.savedAt > 30 * 24 * 60 * 60 * 1000) return null;
  return session;
}

function savePlaybackSession(force = false) {
  const now = Date.now();
  if (!force && now - lastPlaybackSaveAt < 5000) return;
  lastPlaybackSaveAt = now;
  const song = getCurrentSong();
  if (!song) return;
  const session = {
    songId: song.id,
    position: Number.isFinite(audio.currentTime) ? audio.currentTime : 0,
    duration: Number.isFinite(audio.duration) ? audio.duration : Number(song.duration || 0),
    queue: state.queue,
    savedAt: now,
  };
  localStorage.setItem(playbackSessionKey, JSON.stringify(session));
  postHostMessage("savePlaybackSession", session);
}

function maybeRestorePlaybackSession() {
  if (playbackRestored || !folderLibraryLoaded) return;
  playbackRestored = true;
  const session = readPlaybackSession();
  if (!session) return;
  const song = getSongById(session.songId);
  if (!song || song.isAvailable === false) {
    localStorage.removeItem(playbackSessionKey);
    notify("上次播放的歌曲已不可用，已保留其他音乐库内容");
    return;
  }

  state.currentSongId = song.id;
  if (Array.isArray(session.queue)) state.queue = session.queue.filter((id) => getSongById(id));
  if (!state.queue.includes(song.id)) state.queue.unshift(song.id);
  const duration = Number(session.duration || song.duration || 0);
  pendingRestorePosition = duration > 0 && duration - session.position < 5 ? 0 : Math.max(0, session.position);
  audio.src = getSongPlaybackUrl(song);
  state.isPlaying = false;
  saveLibraryState();
  setPlaybackStatus("已恢复上次播放位置");
  render();
}

function syncMediaSession() {
  if (!("mediaSession" in navigator)) return;
  const song = getCurrentSong();
  if (!song) {
    navigator.mediaSession.playbackState = "none";
    return;
  }
  const cover = new URL(getSongCoverUrl(song), window.location.href).href;
  navigator.mediaSession.metadata = new MediaMetadata({
    title: song.title,
    artist: song.artist,
    album: song.album,
    artwork: [{ src: cover }],
  });
  navigator.mediaSession.playbackState = state.isPlaying ? "playing" : "paused";
  if (Number.isFinite(audio.duration) && audio.duration > 0) {
    try {
      navigator.mediaSession.setPositionState({ duration: audio.duration, position: Math.min(audio.currentTime || 0, audio.duration), playbackRate: audio.playbackRate });
    } catch (error) { }
  }
}

function syncNativePlaybackState() {
  const song = getCurrentSong();
  postHostMessage("setNativePlaybackState", {
    hasSong: Boolean(song && song.isAvailable !== false),
    isPlaying: state.isPlaying,
    title: song?.title || "",
    artist: song?.artist || "",
    album: song?.album || "",
  });
  syncMediaSession();
}

function syncNativeTimeline(force = false) {
  const now = Date.now();
  if (!force && now - lastNativeTimelineAt < 5000) return;
  lastNativeTimelineAt = now;
  postHostMessage("setNativeTimeline", {
    position: Number(audio.currentTime || 0),
    duration: Number.isFinite(audio.duration) ? audio.duration : 0,
  });
  syncMediaSession();
}

function handlePlaybackCommand(action, position) {
  if (action === "play" && audio.paused) togglePlay();
  else if (action === "pause" && !audio.paused) togglePlay();
  else if (action === "toggle") togglePlay();
  else if (action === "previous") playSong(getNextSongId(-1));
  else if (action === "next") playSong(getNextSongId(1));
  else if (action === "seekTo" && Number.isFinite(position) && Number.isFinite(audio.duration)) {
    audio.currentTime = Math.max(0, Math.min(audio.duration, position));
    syncNativeTimeline(true);
    savePlaybackSession(true);
  }
}

function initializeMediaSession() {
  if (!("mediaSession" in navigator)) return;
  const handlers = {
    play: () => handlePlaybackCommand("play"), pause: () => handlePlaybackCommand("pause"),
    previoustrack: () => handlePlaybackCommand("previous"), nexttrack: () => handlePlaybackCommand("next"),
    seekto: (details) => handlePlaybackCommand("seekTo", details.seekTime),
    seekbackward: (details) => handlePlaybackCommand("seekTo", audio.currentTime - (details.seekOffset || 10)),
    seekforward: (details) => handlePlaybackCommand("seekTo", audio.currentTime + (details.seekOffset || 10)),
  };
  Object.entries(handlers).forEach(([action, handler]) => {
    try { navigator.mediaSession.setActionHandler(action, handler); } catch (error) { }
  });
}

function formatVersion(version) {
  if (!version) return "--";
  return version.startsWith("v") ? version : `v${version}`;
}

function renderUpdater() {
  autoUpdateCheck.checked = state.autoCheckUpdates;
  const hasAvailableUpdate = updater.status === "available" || updater.status === "downloading";
  settingsButton.classList.toggle("has-update", hasAvailableUpdate);
  settingsButton.setAttribute("aria-label", hasAvailableUpdate ? "打开设置，有可用更新" : "打开设置");
  settingsButton.title = hasAvailableUpdate ? "设置（有可用更新）" : "设置";
  currentVersion.textContent = updater.currentVersion
    ? formatVersion(updater.currentVersion)
    : nativeHost ? "读取中" : "浏览器预览";

  let title = "尚未检查更新";
  let description = "点击检查更新，或等待下次启动时自动检查。";

  if (updater.status === "unsupported") {
    title = "浏览器预览不支持软件内更新";
    description = "安装后的 Windows 桌面版会在这里检查并安装更新。";
  } else if (updater.status === "checking") {
    title = "正在检查更新";
    description = "正在连接 StarFile 更新服务。";
  } else if (updater.status === "current") {
    title = "已是最新版本";
    description = `当前使用的是 ${formatVersion(updater.currentVersion)}。`;
  } else if (updater.status === "available") {
    title = `发现 ${formatVersion(updater.latestVersion)}`;
    description = updater.message || (updater.canInstall
      ? "安装包已准备好，可由你选择下载并安装。"
      : "此版本需要前往发布页面下载安装。");
  } else if (updater.status === "downloading") {
    title = `正在下载 ${formatVersion(updater.latestVersion)}`;
    description = `安装包下载进度 ${Math.round(Number(updater.progress) || 0)}%。`;
  } else if (updater.status === "installing") {
    title = "安装程序已启动";
    description = "StarFile 将退出，请在系统安装窗口中完成更新。";
  } else if (updater.status === "error") {
    title = "更新暂时不可用";
    description = updater.message || "请检查网络连接后重试。";
  }

  updateStatus.dataset.status = updater.status;
  updateStatusTitle.textContent = title;
  updateStatusText.textContent = description;

  const isBusy = updater.status === "checking" || updater.status === "downloading" || updater.status === "installing";
  checkUpdateButton.disabled = !nativeHost || isBusy;
  checkUpdateButton.textContent = updater.status === "checking" ? "检查中..." : "检查更新";

  const showInstallAction = updater.status === "available" || updater.status === "downloading" || updater.status === "installing";
  installUpdateButton.hidden = !showInstallAction;
  installUpdateButton.disabled = updater.status !== "available";
  installUpdateButton.textContent = updater.status === "downloading"
    ? "正在下载..."
    : updater.status === "installing"
      ? "正在启动..."
      : updater.canInstall ? "下载并安装" : "打开下载页";

  const progressValue = Math.min(100, Math.max(0, Number(updater.progress) || 0));
  updateProgress.hidden = updater.status !== "downloading";
  updateProgress.setAttribute("aria-valuenow", String(Math.round(progressValue)));
  updateProgressBar.style.width = `${progressValue}%`;

  const notes = updater.releaseNotes?.trim() || "";
  updateReleaseNotes.hidden = updater.status !== "available" || !notes;
  updateReleaseNotes.textContent = notes;
}

function openSettingsDialog() {
  hideDialog(updateDialog);
  renderUpdater();
  renderStorageUsage();
  showDialog(settingsDialog, settingsCloseButton);
}

async function renderStorageUsage() {
  const referencedBytes = folderTracks.reduce((total, track) => total + Number(track.size || 0), 0);
  try {
    const estimate = await navigator.storage?.estimate?.();
    const used = Number(estimate?.usage || 0) / 1024 / 1024;
    const quota = Number(estimate?.quota || 0) / 1024 / 1024;
    const referenced = referencedBytes / 1024 / 1024 / 1024;
    storageUsageStatus.textContent = `StarFile 实际存储 ${used.toFixed(1)} MB / ${quota.toFixed(0)} MB；原文件引用 ${referenced.toFixed(2)} GB（不重复占用）`;
  } catch (error) {
    storageUsageStatus.textContent = "无法读取当前存储占用";
  }
}

function closeSettingsDialog() {
  hideDialog(settingsDialog);
  settingsButton.focus();
}

function showUpdatePrompt() {
  updatePromptTitle.textContent = `${formatVersion(updater.latestVersion)} 已经可用`;
  updatePromptMessage.textContent = updater.releaseName
    ? `${updater.releaseName} 已发布，你可以稍后在设置中选择更新。`
    : "新版本已经可用，你可以稍后在设置中选择更新。";
  showDialog(updateDialog, openUpdateSettingsButton);
}

function dismissUpdatePrompt() {
  if (updater.latestVersion) {
    dismissedUpdateVersion = updater.latestVersion;
  }
  hideDialog(updateDialog);
  settingsButton.focus();
}

function maybeShowUpdatePrompt() {
  if (updater.status !== "available" || !updater.latestVersion) return;
  if (modalDialogs.some((dialog) => dialog.classList.contains("show"))) return;
  if (lastAnnouncedUpdateVersion === updater.latestVersion) return;
  if (dismissedUpdateVersion === updater.latestVersion) return;
  lastAnnouncedUpdateVersion = updater.latestVersion;
  showUpdatePrompt();
}

function handleNativeUpdateMessage(event) {
  let message = event.data;
  if (typeof message === "string") {
    try {
      message = JSON.parse(message);
    } catch (error) {
      return;
    }
  }
  if (!message || message.type !== "updateState") return;

  const previousStatus = updater.status;
  Object.assign(updater, message);
  renderUpdater();

  if (manualUpdateCheck && ["current", "available", "error"].includes(updater.status)) {
    if (updater.status === "current") notify("当前已是最新版本", "success");
    if (updater.status === "error") notify(updater.message || "检查更新失败", "error");
    manualUpdateCheck = false;
  }

  if (updater.status === "error" && ["downloading", "installing"].includes(previousStatus)) {
    notify(updater.message || "更新安装失败", "error");
  }

  maybeShowUpdatePrompt();
}

function renderFolderSettings() {
  folderSettingsSection.hidden = !nativeHost;
  if (!nativeHost) return;

  folderList.innerHTML = libraryFolders.length ? libraryFolders.map((folder) => `
    <div class="folder-row">
      <strong title="${escapeHtml(folder.path)}">${escapeHtml(folder.path)}</strong>
      <span>${folder.songCount || 0} 首${folder.unavailableCount ? ` · ${folder.unavailableCount} 首失效` : ""}</span>
      <button class="table-button danger" type="button" data-remove-folder-id="${folder.id}">移除</button>
    </div>
  `).join("") : `<div class="empty-state">尚未添加音乐文件夹</div>`;
  cleanUnavailableButton.disabled = !folderTracks.some((track) => track.isAvailable === false);
  scanFoldersButton.disabled = !libraryFolders.length;
}

function handleFolderLibraryMessage(event) {
  let message = event.data;
  if (typeof message === "string") {
    try { message = JSON.parse(message); } catch (error) { return; }
  }
  if (!message?.type?.startsWith("folder")) return;

  if (message.type === "folderLibraryState") {
    libraryFolders = Array.isArray(message.folders) ? message.folders : [];
    const nextFolderTracks = (Array.isArray(message.tracks) ? message.tracks : []).map((track) => ({
      ...track,
      lyrics: [],
      lyricText: "",
      lyricAdjustmentMs: 0,
      lyricParseVersion: 2,
    }));
    const nextTrackIds = new Set(nextFolderTracks.map((track) => track.id));
    folderTracks.forEach((track) => {
      if (!nextTrackIds.has(track.id) && artworkUrls.has(track.id)) {
        URL.revokeObjectURL(artworkUrls.get(track.id));
        artworkUrls.delete(track.id);
      }
    });
    folderTracks = nextFolderTracks;
    const importedSongs = state.localSongs.filter((song) => song.sourceType !== "file-reference");
    state.localSongs = [...importedSongs, ...folderTracks];
    folderLibraryLoaded = true;
    refreshAllSongs();
    if (indexedDbLoaded) normalizeLibraryReferences();
    renderFolderSettings();
    render();
    if (indexedDbLoaded) maybeRestorePlaybackSession();
    return;
  }

  if (message.type === "folderScanProgress") {
    folderScanStatus.textContent = `正在扫描 ${message.processed || 0}：${message.fileName || ""}`;
    scanFoldersButton.hidden = true;
    cancelFolderScanButton.hidden = false;
    return;
  }

  if (message.type === "folderScanCompleted") {
    const summary = message.summary || {};
    folderScanStatus.textContent = summary.Cancelled || summary.cancelled
      ? "扫描已取消"
      : `扫描完成：新增 ${summary.Added ?? summary.added ?? 0}，更新 ${summary.Updated ?? summary.updated ?? 0}，重复 ${summary.Duplicates ?? summary.duplicates ?? 0}，失败 ${summary.Failed ?? summary.failed ?? 0}`;
    scanFoldersButton.hidden = false;
    cancelFolderScanButton.hidden = true;
  }
}

function handleNativePlaybackMessage(event) {
  let message = event.data;
  if (typeof message === "string") {
    try { message = JSON.parse(message); } catch (error) { return; }
  }
  if (message?.type === "playbackCommand") handlePlaybackCommand(message.action, Number(message.position));
  if (message?.type === "requestPlaybackState") {
    syncNativePlaybackState();
    syncNativeTimeline(true);
  }
}

function initializeUpdater() {
  renderUpdater();
  if (!nativeHost) return;

  // Earlier releases persisted "later" forever. Keep the new behavior session-only.
  localStorage.removeItem("dismissedUpdateVersion");
  nativeHost.addEventListener("message", handleNativeUpdateMessage);
  nativeHost.addEventListener("message", handleFolderLibraryMessage);
  nativeHost.addEventListener("message", handleNativePlaybackMessage);
  postHostMessage("getUpdateState");
  postHostMessage("getFolderLibraryState");
  postHostMessage("playbackReady");
  renderFolderSettings();

  window.setTimeout(requestAutomaticUpdateCheck, 900);
  window.setInterval(requestAutomaticUpdateCheck, updateCheckIntervalMs);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") requestAutomaticUpdateCheck();
  });
}

function requestAutomaticUpdateCheck() {
  if (!nativeHost || !state.autoCheckUpdates) return;

  const now = Date.now();
  if (now - lastAutomaticUpdateCheckAt < updateCheckCooldownMs) return;

  lastAutomaticUpdateCheckAt = now;
  postHostMessage("checkForUpdates", { silent: true });
}

function describeStorageError(error) {
  if (error?.name === "QuotaExceededError") return "浏览器存储空间不足";
  if (/indexeddb|not available/i.test(error?.message || "")) return "浏览器不支持或禁用了本地存储";
  return "文件无法保存到本地存储";
}

function fileNameToTitle(fileName) {
  return fileName.replace(/\.[^/.]+$/, "") || "未命名歌曲";
}

function getSongPlaybackUrl(song) {
  if (!song?.blob) return song?.url || "";
  if (!objectUrls.has(song.id)) {
    objectUrls.set(song.id, URL.createObjectURL(song.blob));
  }
  return objectUrls.get(song.id);
}

function getSongCoverUrl(song) {
  if (!song?.artworkBlob) return song?.cover || localSongCover;
  if (!artworkUrls.has(song.id)) artworkUrls.set(song.id, URL.createObjectURL(song.artworkBlob));
  return artworkUrls.get(song.id);
}

function readAudioDuration(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const probe = new Audio();

    const cleanup = () => {
      probe.removeAttribute("src");
      URL.revokeObjectURL(url);
    };

    probe.addEventListener("loadedmetadata", () => {
      const duration = Number.isFinite(probe.duration) ? Math.round(probe.duration) : 0;
      cleanup();
      resolve(duration);
    }, { once: true });

    probe.addEventListener("error", () => {
      cleanup();
      resolve(0);
    }, { once: true });

    probe.preload = "metadata";
    probe.src = url;
  });
}

function readMp3Metadata(file) {
  return new Promise((resolve) => {
    if (!/\.mp3$/i.test(file.name) || !metadataReader?.read) {
      resolve(null);
      return;
    }

    metadataReader.read(file, {
      onSuccess: ({ tags }) => resolve({
        title: String(tags.title || "").trim(),
        artist: String(tags.artist || "").trim(),
        album: String(tags.album || "").trim(),
        picture: tags.picture || null,
      }),
      onError: () => resolve(null),
    });
  });
}

async function pictureToArtworkBlob(picture) {
  if (!picture?.data?.length) return null;
  const original = new Blob([new Uint8Array(picture.data)], { type: picture.format || "image/jpeg" });

  try {
    const bitmap = await createImageBitmap(original);
    const scale = Math.min(1, 1024 / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && original.size <= 2 * 1024 * 1024) {
      bitmap.close();
      return original;
    }

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.86));
  } catch (error) {
    return original.size <= 5 * 1024 * 1024 ? original : null;
  }
}

async function readTextFile(file) {
  const buffer = await file.arrayBuffer();

  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer).replace(/^\uFEFF/, "");
  } catch (error) {
    try {
      return new TextDecoder("gb18030").decode(buffer).replace(/^\uFEFF/, "");
    } catch (fallbackError) {
      return new TextDecoder().decode(buffer).replace(/^\uFEFF/, "");
    }
  }
}

function normalizeFileBase(fileName) {
  return fileName.replace(/\.[^/.]+$/, "").trim().toLowerCase();
}

function isLyricFile(file) {
  return /\.(lrc|txt)$/i.test(file.name)
    || /(?:^|\/)(?:x-)?lrc$/i.test(file.type || "");
}

function createLocalSongRecord(file, fields, duration) {
  const lyricText = fields.lyrics.trim();

  return {
    id: `local-${crypto.randomUUID()}`,
    title: fields.title.trim() || fileNameToTitle(file.name),
    artist: fields.artist.trim() || "本地音乐",
    album: fields.album.trim() || "我的导入",
    duration,
    cover: localSongCover,
    artworkBlob: fields.artworkBlob || null,
    metadataSource: fields.metadataSource || "filename",
    sourceType: "indexeddb",
    isAvailable: true,
    lyrics: parseLyricText(lyricText, duration),
    lyricText,
    lyricSource: fields.lyricSource || "",
    lyricAdjustmentMs: 0,
    lyricParseVersion: 2,
    fileName: file.name,
    mimeType: file.type || "audio/mpeg",
    blob: file,
    createdAt: new Date().toISOString(),
  };
}

function isAudioFile(file) {
  return file.type.startsWith("audio/") || /\.(mp3|wav|ogg|m4a|aac|flac|webm)$/i.test(file.name);
}

function openImportDialog() {
  showDialog(importDialog, importRows.querySelector("input"));
}

function closeImportDialog() {
  hideDialog(importDialog);
  importRows.innerHTML = "";
  importStatus.textContent = "";
  pendingImportFiles = [];
  songFileInput.value = "";
  window.setTimeout(maybeShowUpdatePrompt, 0);
}

function setImportStatus(message, type = "") {
  importStatus.textContent = message;
  importStatus.dataset.type = type;
}

function openEditLocalSongDialog(songId) {
  const song = state.localSongs.find((item) => item.id === songId);
  if (!song) return;

  editingLocalSongId = song.id;
  editLocalSongTitle.value = song.title;
  editLocalSongArtist.value = song.artist;
  editLocalSongAlbum.value = song.album;
  editLocalSongLyrics.value = song.lyricText || "";
  editLocalSongLyricFile.value = "";
  showDialog(editLocalSongDialog, editLocalSongTitle);
}

function closeEditLocalSongDialog() {
  hideDialog(editLocalSongDialog);
  editingLocalSongId = null;
  editLocalSongForm.reset();
  window.setTimeout(maybeShowUpdatePrompt, 0);
}

function renderImportRows() {
  importRows.innerHTML = pendingImportFiles.map((item, index) => {
    const file = item.file;
    const title = item.title || fileNameToTitle(file.name);
    const lyricTip = item.lyricFileName ? `已选择歌词：${item.lyricFileName}` : "可粘贴 LRC 歌词；若只粘贴纯文本，会按歌曲时长自动滚动";
    const lyricFileMarkup = item.lyricFileName
      ? `<span class="import-lyric-file-name" data-import-lyric-file-name>${escapeHtml(item.lyricFileName)}</span>`
      : `<span class="import-lyric-file-name" data-import-lyric-file-name>未选择文件</span>`;

    return `
      <article class="import-row" data-import-index="${index}">
        <div class="import-file">
          <strong>${escapeHtml(file.name)}</strong>
          <span>${escapeHtml(file.type || "audio/*")}</span>
        </div>
        <label>
          <span>标题</span>
          <input name="title-${index}" type="text" maxlength="60" value="${escapeHtml(title)}" />
        </label>
        <label>
          <span>歌手</span>
          <input name="artist-${index}" type="text" maxlength="60" value="${escapeHtml(item.artist || "本地音乐")}" />
        </label>
        <label>
          <span>专辑</span>
          <input name="album-${index}" type="text" maxlength="60" value="${escapeHtml(item.album || "我的导入")}" />
        </label>
        <div class="import-lyrics-field">
          <label>
            <span>歌词</span>
            <textarea name="lyrics-${index}" rows="5" placeholder="[00:12.00] 第一句歌词&#10;[00:18.50] 第二句歌词">${escapeHtml(item.lyrics || "")}</textarea>
          </label>
          <div class="import-lyric-file-actions">
            <label class="import-lyric-file-picker">
              <span>选择 LRC 文件</span>
              <input type="file" accept=".lrc,.txt,text/plain" data-import-lyric-file="${index}" />
            </label>
            ${lyricFileMarkup}
            <button class="table-button import-lyric-file-clear" type="button" data-clear-import-lyric-file="${index}" ${item.lyricFileName ? "" : "hidden"}>清除</button>
          </div>
          <small data-import-lyric-tip>${escapeHtml(lyricTip)}</small>
        </div>
      </article>
    `;
  }).join("");
}

async function loadImportLyricFile(index, file, row) {
  const item = pendingImportFiles[index];
  if (!item || !file) return;

  const fileInput = row.querySelector("[data-import-lyric-file]");
  if (!isLyricFile(file)) {
    if (fileInput) fileInput.value = "";
    notify("请选择 LRC 或 TXT 歌词文件", "error");
    return;
  }

  try {
    const lyricText = await readTextFile(file);
    item.lyrics = lyricText;
    item.lyricFileName = file.name;

    const lyricField = importForm.elements[`lyrics-${index}`];
    if (lyricField) lyricField.value = lyricText;

    const fileName = row.querySelector("[data-import-lyric-file-name]");
    const clearButton = row.querySelector("[data-clear-import-lyric-file]");
    const tip = row.querySelector("[data-import-lyric-tip]");
    if (fileName) fileName.textContent = file.name;
    if (clearButton) clearButton.hidden = false;
    if (tip) tip.textContent = `已选择歌词：${file.name}`;
    notify(`已读取歌词文件：${file.name}`, "success");
  } catch (error) {
    if (fileInput) fileInput.value = "";
    notify(`歌词文件 ${file.name} 读取失败`, "error");
  }
}

function clearImportLyricFile(index, row) {
  const item = pendingImportFiles[index];
  if (!item) return;

  item.lyricFileName = "";
  const fileInput = row.querySelector("[data-import-lyric-file]");
  const fileName = row.querySelector("[data-import-lyric-file-name]");
  const clearButton = row.querySelector("[data-clear-import-lyric-file]");
  const tip = row.querySelector("[data-import-lyric-tip]");
  if (fileInput) fileInput.value = "";
  if (fileName) fileName.textContent = "未选择文件";
  if (clearButton) clearButton.hidden = true;
  if (tip) tip.textContent = "可粘贴 LRC 歌词；若只粘贴纯文本，会按歌曲时长自动滚动";
}

async function handleSelectedFiles(fileList) {
  const files = Array.from(fileList || []);
  const audioFiles = files.filter(isAudioFile);
  const lyricFiles = files.filter((file) => !isAudioFile(file) && isLyricFile(file));
  const skippedCount = files.length - audioFiles.length - lyricFiles.length;

  if (skippedCount > 0) {
    notify(`已跳过 ${skippedCount} 个非音频文件`);
  }

  if (!audioFiles.length) {
    if (lyricFiles.length === 1 && files.length === 1) {
      await importLyricsForSong(lyricFiles[0], state.currentSongId);
      songFileInput.value = "";
      return;
    }

    notify("请先播放一首本地歌曲，再逐首导入歌词", "error");
    songFileInput.value = "";
    return;
  }

  const lyricMap = new Map();
  for (const lyricFile of lyricFiles) {
    try {
      lyricMap.set(normalizeFileBase(lyricFile.name), {
        name: lyricFile.name,
        text: await readTextFile(lyricFile),
      });
    } catch (error) {
      notify(`歌词文件 ${lyricFile.name} 读取失败`, "error");
    }
  }

  pendingImportFiles = [];
  for (const [index, file] of audioFiles.entries()) {
    setPlaybackStatus(`正在分析 ${index + 1}/${audioFiles.length}`, "loading");
    const exactMatch = lyricMap.get(normalizeFileBase(file.name));
    const fallbackMatch = audioFiles.length === 1 && lyricFiles.length === 1 ? Array.from(lyricMap.values())[0] : null;
    const matchedLyric = exactMatch || fallbackMatch;
    const metadata = await readMp3Metadata(file);
    const artworkBlob = await pictureToArtworkBlob(metadata?.picture);

    pendingImportFiles.push({
      file,
      title: metadata?.title || fileNameToTitle(file.name),
      artist: metadata?.artist || "本地音乐",
      album: metadata?.album || "我的导入",
      artworkBlob,
      metadataSource: metadata ? "id3" : "filename",
      lyrics: matchedLyric?.text || "",
      lyricFileName: matchedLyric?.name || "",
    });
  }
  setPlaybackStatus("歌曲信息分析完成", "success");
  renderImportRows();
  openImportDialog();
}

function getPendingImportFields(index) {
  return {
    title: importForm.elements[`title-${index}`]?.value || "",
    artist: importForm.elements[`artist-${index}`]?.value || "",
    album: importForm.elements[`album-${index}`]?.value || "",
    lyrics: importForm.elements[`lyrics-${index}`]?.value || "",
    lyricSource: pendingImportFiles[index]?.lyricFileName || "",
    artworkBlob: pendingImportFiles[index]?.artworkBlob || null,
    metadataSource: pendingImportFiles[index]?.metadataSource || "filename",
  };
}

async function importPendingSongs() {
  if (!pendingImportFiles.length) return;

  const submitButton = importForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  importCancelButton.disabled = true;
  importCloseButton.disabled = true;
  setPlaybackStatus("正在导入本地歌曲", "loading");

  try {
    const records = [];
    let failureCount = 0;
    const failureMessages = [];

    for (const [index, item] of pendingImportFiles.entries()) {
      setImportStatus(`正在导入 ${index + 1}/${pendingImportFiles.length}：${item.file.name}`);
      try {
        const duration = await readAudioDuration(item.file);
        const record = createLocalSongRecord(item.file, getPendingImportFields(index), duration);
        await saveLocalSongs([record]);
        records.push(record);
      } catch (error) {
        failureCount += 1;
        failureMessages.push(`${item.file.name}：${describeStorageError(error)}`);
      }
    }

    state.localSongs = [...state.localSongs, ...records];
    refreshAllSongs();
    normalizeLibraryReferences();
    state.view = "local";
    if (records.length) closeImportDialog();
    const resultMessage = `导入完成：成功 ${records.length} 首，失败 ${failureCount} 首`;
    notify(failureMessages[0] ? `${resultMessage}，${failureMessages[0]}` : resultMessage, failureCount ? "error" : "success");
    setPlaybackStatus(resultMessage, failureCount ? "error" : "success");
    if (!records.length) setImportStatus(failureMessages.join("；") || "未能导入任何歌曲，请检查浏览器存储权限或可用空间。", "error");
    render();
  } finally {
    submitButton.disabled = false;
    importCancelButton.disabled = false;
    importCloseButton.disabled = false;
  }
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
  let baseSongs = allSongs;

  if (state.view === "favorites") {
    baseSongs = allSongs.filter((song) => state.likedSongIds.includes(song.id));
  }

  if (state.view === "queue") {
    baseSongs = state.queue.map(getSongById).filter(Boolean);
  }

  if (state.view === "recent") {
    baseSongs = state.recentSongIds.map(getSongById).filter(Boolean);
  }

  if (state.view === "local") {
    baseSongs = state.localSongs;
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
      <img src="${getSongCoverUrl(song)}" alt="${escapeHtml(song.title)} 封面" />
      <div>
        <strong>${escapeHtml(song.title)}</strong>
        <span>${escapeHtml(song.artist)} · ${escapeHtml(song.album)}</span>
      </div>
      <span class="home-song-duration">${formatTime(song.duration)}</span>
      <button class="table-button" type="button" aria-label="播放 ${escapeHtml(song.title)}">播放</button>
    </article>
  `;
}

function renderHomePlaylistCard(item) {
  return `
    <button class="home-playlist-card" type="button" data-go-view="${item.view}">
      <img class="anime-cover" src="${item.cover}" alt="" />
      <span>
        <strong>${escapeHtml(item.title)}</strong>
        <small>${escapeHtml(item.count)}</small>
      </span>
    </button>
  `;
}

function renderHomeRecentRow(song, index) {
  const isLiked = state.likedSongIds.includes(song.id);

  return `
    <article class="home-recent-row" data-song-id="${song.id}">
      <span class="home-recent-index">${index + 1}</span>
      <img src="${getSongCoverUrl(song)}" alt="" />
      <span class="song-title">${escapeHtml(song.title)}</span>
      <span class="song-meta">${escapeHtml(song.artist)}</span>
      <span class="song-meta">${escapeHtml(song.album)}</span>
      <button class="table-button ${isLiked ? "liked" : ""}" type="button" data-like-id="${song.id}" aria-label="${isLiked ? "取消喜欢" : "喜欢"} ${escapeHtml(song.title)}">♥</button>
      <span class="song-meta duration-cell">${formatTime(song.duration)}</span>
      <button class="table-button more-button" type="button" data-queue-song-id="${song.id}" aria-label="加入播放队列">•••</button>
    </article>
  `;
}

function renderHome() {
  const recentSongs = state.recentSongIds.map(getSongById).filter(Boolean).slice(0, 4);
  const displayRecentSongs = recentSongs;
  const playlistCards = [
    { title: "清晨微光", count: "25 首歌", cover: "./src/assets/covers/anime-cover-1.jpg", view: "library" },
    { title: "放松时刻", count: "30 首歌", cover: "./src/assets/covers/anime-cover-2.jpg", view: "playlist" },
    { title: "浪漫心情", count: "18 首歌", cover: "./src/assets/covers/anime-cover-3.jpg", view: "favorites" },
    { title: "纯音乐集", count: "32 首歌", cover: "./src/assets/covers/anime-cover-4.jpg", view: "library" },
    { title: "日系治愈", count: "20 首歌", cover: "./src/assets/covers/anime-cover-5.jpg", view: "recent" },
  ];

  return `
    <section class="home-import-entry" aria-label="本地音乐">
      <div>
        <span>本地音乐</span>
        <strong>本地导入</strong>
        <small>${state.localSongs.length ? `已导入 ${state.localSongs.length} 首歌曲` : "从电脑添加音频文件"}</small>
      </div>
      <button class="table-button local-import-button" type="button" data-open-import>导入</button>
    </section>

    <section class="home-block">
      <div class="home-block-heading">
        <h4>推荐歌单</h4>
        <button class="table-button home-more-button" type="button" data-go-view="library">更多 ›</button>
      </div>
      <div class="home-playlist-grid">
        ${playlistCards.map(renderHomePlaylistCard).join("")}
      </div>
    </section>

    <section class="home-block">
      <div class="home-block-heading">
        <h4>最近播放</h4>
        <button class="table-button home-more-button" type="button" data-go-view="recent">更多 ›</button>
      </div>
      <div class="home-recent-table">
        <div class="home-recent-head">
          <span></span>
          <span></span>
          <span>歌曲</span>
          <span>歌手</span>
          <span>专辑</span>
          <span></span>
          <span>时长</span>
          <span></span>
        </div>
        ${displayRecentSongs.length ? displayRecentSongs.map(renderHomeRecentRow).join("") : `<div class="empty-state">暂无最近播放</div>`}
      </div>
    </section>
  `;
}
function renderSongs() {
  const visibleSongs = getVisibleSongs();
  const playlist = getActivePlaylist();
  const isSearching = Boolean(state.search.trim());
  songSection.classList.toggle("home-section", state.view === "home" && !isSearching);

  if (state.view === "home" && !isSearching) {
    listTitle.textContent = "";
    songCount.textContent = "";
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
  } else if (state.view === "local") {
    listTitle.textContent = "本地音乐";
  } else if (state.view === "playlist") {
    listTitle.textContent = playlist ? playlist.name : "我的歌单";
  } else if (state.view === "favorites") {
    listTitle.textContent = "我喜欢的音乐";
  } else {
    listTitle.textContent = "全部歌曲";
  }

  const playlistToolbar = state.view === "playlist" && !isSearching ? renderPlaylistToolbar() : "";

  if (!visibleSongs.length) {
    const emptyMessages = {
      favorites: "还没有喜欢的歌曲，点击歌曲旁的“喜欢”即可收藏。",
      queue: "播放队列为空，先把喜欢的歌曲加入队列吧。",
      recent: "暂无最近播放，播放一首歌曲后会显示在这里。",
      local: "还没有本地歌曲，可点击“导入歌曲”或将音频与 LRC 文件拖到页面中。",
      playlist: "这个歌单还没有歌曲，点击“加歌单”开始添加。",
      library: "音乐库为空，请导入本地音频文件。",
    };
    const emptyMessage = isSearching
      ? `没有找到与“${escapeHtml(state.search.trim())}”相关的歌曲。`
      : emptyMessages[state.view] || "音乐库为空，请导入本地音频文件。";
    songList.innerHTML = `${playlistToolbar}<div class="empty-state">${emptyMessage}</div>`;
    return;
  }

  songList.innerHTML = playlistToolbar + visibleSongs.map((song) => {
    const isPlaying = song.id === state.currentSongId;
    const isLiked = state.likedSongIds.includes(song.id);
    const inActivePlaylist = playlist ? playlist.songIds.includes(song.id) : false;
    const inQueue = state.queue.includes(song.id);
    const isLocalSong = state.localSongs.some((localSong) => localSong.id === song.id && localSong.sourceType !== "file-reference");
    const playlistButtonText = state.view === "playlist" && inActivePlaylist ? "移出" : "加歌单";
    const deleteButton = isLocalSong
      ? `<button class="table-button danger" type="button" data-delete-local-song-id="${song.id}">删除</button>`
      : "";
    const editButton = isLocalSong
      ? `<button class="table-button" type="button" data-edit-local-song-id="${song.id}">编辑</button>`
      : "";

    return `
      <article class="song-row ${isPlaying ? "playing" : ""}" data-song-id="${song.id}">
        <img src="${getSongCoverUrl(song)}" alt="${escapeHtml(song.title)} 封面" />
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
           ${editButton}
           ${deleteButton}
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
  nowPlayingQueueCount.textContent = `${queueSongs.length} 首`;

  if (!queueSongs.length) {
    queueList.innerHTML = `<div class="empty-state">播放队列为空</div>`;
    nowPlayingQueueList.innerHTML = `<div class="empty-state">播放队列为空</div>`;
    return;
  }

  queueList.innerHTML = queueSongs.map((song, index) => `
    <div class="queue-item ${song.id === state.currentSongId ? "playing" : ""}" data-queue-id="${song.id}">
      <span class="queue-index">${index + 1}</span>
      <div>
        <strong>${escapeHtml(song.title)}</strong>
        <span>${escapeHtml(song.artist)}</span>
      </div>
      <button class="icon-button queue-like-button" type="button" data-like-id="${song.id}" aria-label="喜欢 ${escapeHtml(song.title)}">♥</button>
      <span class="queue-duration">${formatTime(song.duration)}</span>
      <button class="icon-button queue-remove-button" type="button" data-remove-id="${song.id}" aria-label="从播放队列移除 ${escapeHtml(song.title)}">×</button>
    </div>
  `).join("");

  nowPlayingQueueList.innerHTML = queueSongs.map((song, index) => `
    <button class="now-playing-queue-item ${song.id === state.currentSongId ? "playing" : ""}" type="button" data-now-playing-queue-id="${song.id}">
      <span>${index + 1}</span>
      <strong>${escapeHtml(song.title)}</strong>
      <small>${escapeHtml(song.artist)}</small>
      <time>${formatTime(song.duration)}</time>
    </button>
  `).join("");
}

function renderLyrics() {
  const song = getCurrentSong();
  const lyricLists = [lyricList, nowPlayingLyricList];
  const lyricStatuses = [lyricStatus, nowPlayingLyricStatus];
  const lyricImportButtons = document.querySelectorAll("[data-import-lyrics]");
  const lyricAdjustControls = document.querySelectorAll("[data-lyric-adjust-controls]");
  const isLocalSong = state.localSongs.some((item) => item.id === song?.id && item.sourceType !== "file-reference");

  lyricImportButtons.forEach((button) => {
    button.hidden = !isLocalSong;
  });
  lyricAdjustControls.forEach((control) => {
    control.hidden = !isLocalSong || !song;
    const resetButton = control.querySelector("[data-lyric-adjust-reset]");
    if (resetButton) resetButton.textContent = formatLyricAdjustment(song?.lyricAdjustmentMs || 0);
  });

  if (!song) {
    lyricStatuses.forEach((status) => { status.textContent = "未播放"; });
    lyricLists.forEach((list) => { list.innerHTML = `<div class="empty-state">选择歌曲后显示歌词</div>`; });
    renderedLyricSignature = "";
    lastLyricActiveIndex = -1;
    return;
  }

  const songLyrics = getSongLyrics(song);
  const estimatedLyrics = Boolean(song.lyricText && !/\[\d{1,2}:\d{2}/.test(song.lyricText));
  lyricStatuses.forEach((status) => { status.textContent = songLyrics.length ? (estimatedLyrics ? "估算时间轴" : "同步中") : "无歌词"; });
  lyricImportButtons.forEach((button) => {
    button.textContent = songLyrics.length ? "替换歌词" : "导入歌词";
  });

  if (!songLyrics.length) {
    const emptyMarkup = isLocalSong
      ? `<div class="empty-state lyric-empty-state"><span>这首歌暂无歌词</span><button class="lyric-import-button" type="button" data-import-lyrics>导入歌词</button></div>`
      : `<div class="empty-state">这首歌暂无歌词</div>`;
    lyricLists.forEach((list) => { list.innerHTML = emptyMarkup; });
    renderedLyricSignature = "";
    lastLyricActiveIndex = -1;
    return;
  }

  const signature = `${song.id}:${song.updatedAt || ""}:${songLyrics.length}`;
  if (renderedLyricSignature !== signature) {
    renderedLyricSignature = signature;
    lastLyricActiveIndex = -1;
    const lyricMarkup = songLyrics.map((line, index) => `
      <p class="lyric-line" data-lyric-index="${index}" style="--lyric-progress: 0%">
        <span>${escapeHtml(line.text)}</span>
      </p>
    `).join("");
    lyricLists.forEach((list) => { list.innerHTML = lyricMarkup; });
  }

  updateLyricProgress(songLyrics, song);
}

function getSongLyrics(song) {
  if (Array.isArray(song?.lyrics) && song.lyrics.length) {
    return song.lyrics;
  }

  return lyrics[song.id] || [];
}

function formatLyricAdjustment(milliseconds) {
  const seconds = Math.max(-30, Math.min(30, Number(milliseconds || 0) / 1000));
  return `${seconds > 0 ? "+" : ""}${seconds.toFixed(1)}s`;
}

function getAdjustedLyricTime(song, line) {
  return line.time + Math.max(-30000, Math.min(30000, Number(song?.lyricAdjustmentMs || 0))) / 1000;
}

function getLyricLineProgress(songLyrics, index, activeIndex, time, song) {
  if (index < activeIndex) return 100;
  if (index > activeIndex) return 0;

  const line = songLyrics[index];
  const nextLine = songLyrics[index + 1];
  const duration = Number.isFinite(audio.duration) && audio.duration > 0
    ? audio.duration
    : Number(song?.duration || 0);
  const lineTime = getAdjustedLyricTime(song, line);
  const endTime = nextLine ? getAdjustedLyricTime(song, nextLine) : Math.max(duration || 0, lineTime + 4);
  const span = Math.max(0.1, endTime - lineTime);
  const progress = ((time - lineTime) / span) * 100;

  return Math.min(100, Math.max(0, progress));
}

function updateLyricProgress(songLyrics, song) {
  const time = audio.currentTime || 0;
  const activeIndex = getActiveLyricIndex(songLyrics, time, song);
  const lyricLineSets = [lyricList, nowPlayingLyricList].map((list) => list.querySelectorAll(".lyric-line"));

  lyricLineSets.forEach((lyricLines) => {
    lyricLines.forEach((lineElement, index) => {
      const progress = getLyricLineProgress(songLyrics, index, activeIndex, time, song);
      lineElement.classList.toggle("past", index < activeIndex);
      lineElement.classList.toggle("active", index === activeIndex);
      lineElement.classList.toggle("future", index > activeIndex);
      lineElement.style.setProperty("--lyric-progress", `${progress.toFixed(2)}%`);
    });
  });

  if (activeIndex !== lastLyricActiveIndex) {
    lastLyricActiveIndex = activeIndex;
    lyricLineSets.forEach((lyricLines) => lyricLines[activeIndex]?.scrollIntoView({ block: "center", behavior: "smooth" }));
  }
}

function getActiveLyricIndex(songLyrics, time, song) {
  let activeIndex = -1;
  songLyrics.forEach((line, index) => {
    if (time >= getAdjustedLyricTime(song, line)) {
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
  if (heroActionLabel) {
    heroActionLabel.textContent = state.isPlaying ? "暂停" : "播放";
  }
  muteButton.textContent = audio.muted || audio.volume === 0 ? "🔇" : "🔊";

  if (!song) {
    const fallbackCover = allSongs[0]?.cover || "";
    heroCover.src = fallbackCover;
    heroTitle.textContent = "沉浸在你的音乐世界";
    heroArtist.textContent = "发现属于你的旋律";
    playerCover.src = playerVisual || fallbackCover;
    playerTitle.textContent = "未播放";
    playerArtist.textContent = "请选择歌曲";
    nowPlayingTitle.textContent = "未播放";
    nowPlayingArtist.textContent = "请选择歌曲";
    nowPlayingArtwork.src = playerVisual;
    syncNativePlaybackState();
    return;
  }

  const coverUrl = getSongCoverUrl(song);
  heroCover.src = coverUrl;
  heroTitle.textContent = song.title;
  heroArtist.textContent = `${song.artist} · ${song.album}`;
  playerCover.src = coverUrl;
  playerTitle.textContent = song.title;
  playerArtist.textContent = song.artist;
  nowPlayingTitle.textContent = song.title;
  nowPlayingArtist.textContent = `${song.artist} · ${song.album}`;
  nowPlayingArtwork.src = coverUrl;
  syncNativePlaybackState();
}

function renderViewTitle() {
  const titleMap = {
    home: "今日推荐",
    library: "推荐音乐",
    favorites: "我喜欢",
    recent: "最近播放",
    local: "本地音乐",
    queue: "播放队列",
    playlist: "我的歌单",
  };

  viewTitle.textContent = titleMap[state.view];
  navItems.forEach((item) => {
    item.classList.toggle("active", item.dataset.view === state.view);
  });
  playlistPreviewCards.forEach((item) => {
    item.classList.toggle("active", item.dataset.view === state.view);
  });
}

function render() {
  document.body.classList.toggle("player-view-open", state.playerViewOpen);
  nowPlayingView.setAttribute("aria-hidden", String(!state.playerViewOpen));
  renderViewTitle();
  renderSongs();
  renderQueue();
  renderLyrics();
  renderPlayer();
}

async function playSong(songId) {
  if (state.currentSongId) savePlaybackSession(true);
  const song = getSongById(songId);
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
  audio.src = getSongPlaybackUrl(song);
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
    await playSong(state.queue[0] || allSongs[0]?.id);
    return;
  }
  if (song.isAvailable === false) {
    notify("原音乐文件已移动或删除，请重新扫描文件夹", "error");
    return;
  }
  if (song.isAvailable === false) {
    notify("原音乐文件已移动或删除，请重新扫描文件夹", "error");
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
  if (!state.queue.length) return allSongs[0]?.id;
  if (!state.currentSongId) return state.queue[0] || allSongs[0]?.id;
  if (state.playMode === "repeat") return state.currentSongId;
  if (state.playMode === "shuffle" && direction > 0) {
    const available = state.queue.filter((id) => id !== state.currentSongId);
    return available[Math.floor(Math.random() * available.length)] || state.currentSongId;
  }

  const currentIndex = state.queue.indexOf(state.currentSongId);
  if (currentIndex === -1) return state.queue[0] || allSongs[0]?.id;

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

async function adjustCurrentLyrics(deltaMs, reset = false) {
  const song = state.localSongs.find((item) => item.id === state.currentSongId);
  if (!song) return;

  const nextValue = reset
    ? 0
    : Math.max(-30000, Math.min(30000, Number(song.lyricAdjustmentMs || 0) + deltaMs));
  const updatedSong = { ...song, lyricAdjustmentMs: nextValue, lyricParseVersion: 2, updatedAt: new Date().toISOString() };

  try {
    await saveLocalSongs([updatedSong]);
    state.localSongs = state.localSongs.map((item) => item.id === song.id ? updatedSong : item);
    refreshAllSongs();
    renderLyrics();
    notify(nextValue ? `歌词偏移已调整为 ${formatLyricAdjustment(nextValue)}` : "歌词偏移已重置", "success");
  } catch (error) {
    notify("歌词偏移保存失败", "error");
  }
}

async function deleteLocalSong(songId) {
  const song = state.localSongs.find((item) => item.id === songId);
  if (!song) return;
  if (!window.confirm(`确定要删除本地歌曲“${song.title}”吗？此操作无法撤销。`)) return;

  try {
    await deleteLocalSongRecord(songId);

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

    const objectUrl = objectUrls.get(songId);
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
      objectUrls.delete(songId);
    }

    const artworkUrl = artworkUrls.get(songId);
    if (artworkUrl) {
      URL.revokeObjectURL(artworkUrl);
      artworkUrls.delete(songId);
    }

    state.localSongs = state.localSongs.filter((item) => item.id !== songId);
    refreshAllSongs();
    normalizeLibraryReferences();
    notify(`已删除 ${song.title}`);
    render();
  } catch (error) {
    notify("删除本地歌曲失败", "error");
  }
}

async function saveEditedLocalSong(event) {
  event.preventDefault();
  const song = state.localSongs.find((item) => item.id === editingLocalSongId);
  if (!song) return;

  const submitButton = editLocalSongForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  try {
    let lyricText = editLocalSongLyrics.value;
    const lyricFile = editLocalSongLyricFile.files[0];
    if (lyricFile) lyricText = await readTextFile(lyricFile);

    const updatedSong = {
      ...song,
      title: editLocalSongTitle.value.trim() || song.title,
      artist: editLocalSongArtist.value.trim() || "本地音乐",
      album: editLocalSongAlbum.value.trim() || "我的导入",
      lyricText,
      lyrics: parseLyricText(lyricText, song.duration),
      lyricSource: lyricFile?.name || song.lyricSource || "",
      lyricParseVersion: 2,
      updatedAt: new Date().toISOString(),
    };
    await saveLocalSongs([updatedSong]);
    state.localSongs = state.localSongs.map((item) => (item.id === updatedSong.id ? updatedSong : item));
    refreshAllSongs();
    closeEditLocalSongDialog();
    notify("本地歌曲已更新", "success");
    render();
  } catch (error) {
    notify("保存失败，请检查歌词文件和浏览器存储权限", "error");
  } finally {
    submitButton.disabled = false;
  }
}

function openLyricPicker() {
  const song = getCurrentSong();
  const localSong = state.localSongs.find((item) => item.id === song?.id);

  if (!song) {
    notify("请先播放要添加歌词的歌曲", "error");
    return;
  }

  if (!localSong) {
    notify("歌词文件只能绑定到本地导入的歌曲", "error");
    return;
  }

  pendingLyricSongId = localSong.id;
  lyricFileInput.value = "";
  lyricFileInput.click();
}

async function importLyricsForSong(file, songId) {
  const song = state.localSongs.find((item) => item.id === songId);
  if (!song) {
    notify(songId ? "歌词文件只能绑定到本地导入的歌曲" : "请先播放要添加歌词的本地歌曲", "error");
    return;
  }

  if (!file || !isLyricFile(file)) {
    notify("请选择 LRC 或 TXT 歌词文件", "error");
    return;
  }

  setPlaybackStatus("正在导入歌词", "loading");

  try {
    const lyricText = await readTextFile(file);
    const parsedLyrics = parseLyricText(lyricText, song.duration);
    if (!parsedLyrics.length) {
      notify("歌词文件中没有可用内容", "error");
      setPlaybackStatus("歌词导入失败", "error");
      return;
    }

    const updatedSong = {
      ...song,
      lyricText,
      lyrics: parsedLyrics,
      lyricSource: file.name,
      lyricParseVersion: 2,
      updatedAt: new Date().toISOString(),
    };

    await saveLocalSongs([updatedSong]);
    state.localSongs = state.localSongs.map((item) => (item.id === updatedSong.id ? updatedSong : item));
    refreshAllSongs();
    renderedLyricSignature = "";
    notify(`已为 ${updatedSong.title} 导入歌词`, "success");
    setPlaybackStatus(`歌词已导入：${file.name}`, "success");
    render();
  } catch (error) {
    notify("歌词导入失败，请检查文件编码和存储权限", "error");
    setPlaybackStatus("歌词导入失败", "error");
  }
}

songList.addEventListener("click", (event) => {
  const importButton = event.target.closest("[data-open-import]");
  if (importButton) {
    songFileInput.click();
    return;
  }

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

  const localDeleteButton = event.target.closest("[data-delete-local-song-id]");
  if (localDeleteButton) {
    deleteLocalSong(localDeleteButton.dataset.deleteLocalSongId);
    return;
  }

  const localEditButton = event.target.closest("[data-edit-local-song-id]");
  if (localEditButton) {
    openEditLocalSongDialog(localEditButton.dataset.editLocalSongId);
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

  const likeButton = event.target.closest("[data-like-id]");
  if (likeButton) {
    toggleLike(likeButton.dataset.likeId);
    return;
  }

  const item = event.target.closest("[data-queue-id]");
  if (item) {
    playSong(item.dataset.queueId);
  }
});

nowPlayingQueueList.addEventListener("click", (event) => {
  const item = event.target.closest("[data-now-playing-queue-id]");
  if (item) playSong(item.dataset.nowPlayingQueueId);
});

navItems.forEach((item) => {
  item.addEventListener("click", () => {
    state.view = item.dataset.view;
    render();
  });
});

playlistPreviewCards.forEach((item) => {
  item.addEventListener("click", () => {
    state.view = item.dataset.view;
    render();
  });
});

playlistForm.addEventListener("submit", (event) => {
  event.preventDefault();
  createPlaylist(playlistNameInput.value);
});

settingsButton.addEventListener("click", openSettingsDialog);
settingsCloseButton.addEventListener("click", closeSettingsDialog);
settingsDialog.addEventListener("click", (event) => {
  if (event.target === settingsDialog) closeSettingsDialog();
});

addMusicFolderButton.addEventListener("click", () => postHostMessage("chooseMusicFolder"));
scanFoldersButton.addEventListener("click", () => postHostMessage("scanMusicFolders"));
cancelFolderScanButton.addEventListener("click", () => postHostMessage("cancelFolderScan"));
cleanUnavailableButton.addEventListener("click", () => {
  if (window.confirm("确定清理所有失效歌曲记录吗？不会删除磁盘文件。")) postHostMessage("removeUnavailableTracks");
});
folderList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-remove-folder-id]");
  if (!button) return;
  if (window.confirm("移除该音乐文件夹及其歌曲引用吗？不会删除磁盘文件。")) {
    postHostMessage("removeMusicFolder", { folderId: button.dataset.removeFolderId });
  }
});

autoUpdateCheck.addEventListener("change", () => {
  state.autoCheckUpdates = autoUpdateCheck.checked;
  localStorage.setItem("autoCheckUpdates", String(state.autoCheckUpdates));
  if (state.autoCheckUpdates && nativeHost) {
    lastAutomaticUpdateCheckAt = 0;
    requestAutomaticUpdateCheck();
  }
});

checkUpdateButton.addEventListener("click", () => {
  if (!nativeHost) return;
  manualUpdateCheck = true;
  updater.status = "checking";
  updater.message = "";
  renderUpdater();
  postHostMessage("checkForUpdates", { silent: false });
});

installUpdateButton.addEventListener("click", () => {
  if (updater.status !== "available") return;
  installUpdateButton.disabled = updater.canInstall;
  postHostMessage("installUpdate");
});

updateLaterButton.addEventListener("click", dismissUpdatePrompt);
openUpdateSettingsButton.addEventListener("click", openSettingsDialog);
updateDialog.addEventListener("click", (event) => {
  if (event.target === updateDialog) dismissUpdatePrompt();
});

importSongButton.addEventListener("click", () => {
  songFileInput.click();
});

songFileInput.addEventListener("change", () => {
  handleSelectedFiles(songFileInput.files);
});

importRows.addEventListener("change", (event) => {
  const fileInput = event.target.closest("[data-import-lyric-file]");
  if (!fileInput) return;

  const row = fileInput.closest("[data-import-index]");
  const index = Number(row?.dataset.importIndex);
  if (!Number.isInteger(index) || !row) return;
  loadImportLyricFile(index, fileInput.files[0], row);
});

importRows.addEventListener("click", (event) => {
  const clearButton = event.target.closest("[data-clear-import-lyric-file]");
  if (!clearButton) return;

  const row = clearButton.closest("[data-import-index]");
  const index = Number(row?.dataset.importIndex);
  if (!Number.isInteger(index) || !row) return;
  clearImportLyricFile(index, row);
});

lyricFileInput.addEventListener("change", async () => {
  const file = lyricFileInput.files[0];
  const songId = pendingLyricSongId;
  pendingLyricSongId = null;
  if (file) await importLyricsForSong(file, songId);
  lyricFileInput.value = "";
});

importForm.addEventListener("submit", (event) => {
  event.preventDefault();
  importPendingSongs();
});

importCancelButton.addEventListener("click", closeImportDialog);
importCloseButton.addEventListener("click", closeImportDialog);
importDialog.addEventListener("click", (event) => {
  if (event.target === importDialog) {
    closeImportDialog();
  }
});

editLocalSongForm.addEventListener("submit", saveEditedLocalSong);
editLocalSongCancelButton.addEventListener("click", closeEditLocalSongDialog);
editLocalSongCloseButton.addEventListener("click", closeEditLocalSongDialog);
editLocalSongDialog.addEventListener("click", (event) => {
  if (event.target === editLocalSongDialog) closeEditLocalSongDialog();
});

document.addEventListener("click", (event) => {
  if (event.target.closest("[data-import-lyrics]")) {
    openLyricPicker();
    return;
  }

  const adjustButton = event.target.closest("[data-lyric-adjust]");
  if (adjustButton) {
    adjustCurrentLyrics(Number(adjustButton.dataset.lyricAdjust || 0));
    return;
  }

  if (event.target.closest("[data-lyric-adjust-reset]")) adjustCurrentLyrics(0, true);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Tab") {
    trapDialogFocus(event);
    return;
  }
  if (event.key !== "Escape") return;
  if (settingsDialog.classList.contains("show")) {
    closeSettingsDialog();
  } else if (updateDialog.classList.contains("show")) {
    dismissUpdatePrompt();
  } else if (importDialog.classList.contains("show")) {
    closeImportDialog();
  } else if (editLocalSongDialog.classList.contains("show")) {
    closeEditLocalSongDialog();
  }
});

document.addEventListener("dragover", (event) => {
  if (!event.dataTransfer?.types.includes("Files")) return;
  event.preventDefault();
  document.body.classList.add("dragging-files");
});

document.addEventListener("dragleave", (event) => {
  if (!event.relatedTarget) document.body.classList.remove("dragging-files");
});

document.addEventListener("drop", (event) => {
  if (!event.dataTransfer?.files.length) return;
  event.preventDefault();
  document.body.classList.remove("dragging-files");
  handleSelectedFiles(event.dataTransfer.files);
});

searchInput.addEventListener("input", () => {
  state.search = searchInput.value;
  renderSongs();
});

playButton.addEventListener("click", togglePlay);
heroActionButton.addEventListener("click", togglePlay);
nowPlayingTrigger.addEventListener("click", () => {
  state.playerViewOpen = true;
  render();
});
nowPlayingTrigger.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    state.playerViewOpen = true;
    render();
  }
});
nowPlayingBackButton.addEventListener("click", () => {
  state.playerViewOpen = false;
  render();
});
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
  syncNativeTimeline(true);
  savePlaybackSession(true);
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
  if (pendingRestorePosition !== null) {
    audio.currentTime = Math.min(Math.max(0, pendingRestorePosition), Math.max(0, audio.duration - 0.1));
    pendingRestorePosition = null;
    progressInput.value = String(Math.floor(audio.currentTime));
    currentTime.textContent = formatTime(audio.currentTime);
  }
  syncNativeTimeline(true);
  if (!state.isPlaying) {
    setPlaybackStatus("已就绪");
  }
});

audio.addEventListener("timeupdate", () => {
  progressInput.value = String(Math.floor(audio.currentTime));
  currentTime.textContent = formatTime(audio.currentTime);
  renderLyrics();
  savePlaybackSession();
  syncNativeTimeline();
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
  savePlaybackSession(true);
});

audio.addEventListener("play", () => {
  state.isPlaying = true;
  setPlaybackStatus("播放中", "success");
  renderPlayer();
  syncNativeTimeline(true);
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

async function initializeLibrary() {
  setPlaybackStatus("正在读取本地歌曲", "loading");
  refreshAllSongs();
  render();
  let canNormalizeReferences = true;

  try {
    const importedSongs = await migrateLocalSongRecords(await readLocalSongs());
    state.localSongs = [...importedSongs, ...folderTracks];
    indexedDbLoaded = true;
  } catch (error) {
    state.localSongs = [];
    indexedDbLoaded = true;
    canNormalizeReferences = false;
    notify(`本地歌曲读取失败：${describeStorageError(error)}`, "error");
  }

  refreshAllSongs();
  if (canNormalizeReferences && folderLibraryLoaded) {
    normalizeLibraryReferences();
  }
  setPlaybackStatus("准备就绪");
  render();
  maybeRestorePlaybackSession();
}

applyTheme();
initializeUpdater();
initializeMediaSession();
initializeLibrary();

window.addEventListener("beforeunload", () => savePlaybackSession(true));
window.addEventListener("starfile-exit", () => {
  savePlaybackSession(true);
  audio.pause();
});
