using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace MusicPlayerHost;

internal sealed class FolderLibraryService : IDisposable
{
    private static readonly HashSet<string> SupportedExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".mp3", ".wav", ".ogg", ".m4a", ".aac", ".flac", ".webm"
    };

    private readonly string dataDirectory;
    private readonly string indexPath;
    private readonly string artworkDirectory;
    private readonly SemaphoreSlim scanLock = new(1, 1);
    private readonly object stateLock = new();
    private LibraryIndex index;
    private CancellationTokenSource? activeScan;
    private readonly string sessionToken = Convert.ToHexString(RandomNumberGenerator.GetBytes(24)).ToLowerInvariant();

    public FolderLibraryService()
    {
        dataDirectory = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "StarFiLeMusicPlayer");
        indexPath = Path.Combine(dataDirectory, "library.json");
        artworkDirectory = Path.Combine(dataDirectory, "Artwork");
        Directory.CreateDirectory(dataDirectory);
        Directory.CreateDirectory(artworkDirectory);
        index = LoadIndex();
    }

    public string? ChooseFolder(IWin32Window owner)
    {
        using var dialog = new FolderBrowserDialog
        {
            Description = "选择包含音乐的文件夹",
            ShowNewFolderButton = false,
            UseDescriptionForTitle = true
        };
        if (dialog.ShowDialog(owner) != DialogResult.OK) return null;

        var path = Path.GetFullPath(dialog.SelectedPath).TrimEnd(Path.DirectorySeparatorChar);
        lock (stateLock)
        {
            if (!index.Folders.Any(item => string.Equals(item.Path, path, StringComparison.OrdinalIgnoreCase)))
            {
                index.Folders.Add(new LibraryFolder(CreateStableId(path), path));
                SaveIndexLocked();
            }
        }
        return path;
    }

    public void CancelScan() => activeScan?.Cancel();

    public async Task<ScanSummary> ScanAllAsync(IProgress<ScanProgress>? progress, CancellationToken cancellationToken)
    {
        if (!await scanLock.WaitAsync(0, cancellationToken)) return new ScanSummary(0, 0, 0, 0, 0, true);
        using var linked = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        activeScan = linked;

        try
        {
            List<LibraryFolder> folders;
            List<LibraryTrack> existingTracks;
            lock (stateLock)
            {
                folders = index.Folders.ToList();
                existingTracks = index.Tracks.ToList();
            }

            var byPath = existingTracks.ToDictionary(track => track.FilePath, StringComparer.OrdinalIgnoreCase);
            var byHash = existingTracks.Where(track => !string.IsNullOrWhiteSpace(track.ContentHash))
                .GroupBy(track => track.ContentHash, StringComparer.OrdinalIgnoreCase)
                .ToDictionary(group => group.Key, group => group.First(), StringComparer.OrdinalIgnoreCase);
            var seenPaths = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var added = 0;
            var updated = 0;
            var duplicates = 0;
            var failed = 0;
            var processed = 0;

            foreach (var folder in folders)
            {
                linked.Token.ThrowIfCancellationRequested();
                var files = EnumerateSupportedFilesSafely(folder.Path);

                foreach (var rawPath in files)
                {
                    linked.Token.ThrowIfCancellationRequested();
                    var path = Path.GetFullPath(rawPath);
                    seenPaths.Add(path);
                    processed++;
                    progress?.Report(new ScanProgress(processed, Path.GetFileName(path)));

                    try
                    {
                        var info = new FileInfo(path);
                        if (byPath.TryGetValue(path, out var cached)
                            && cached.Size == info.Length
                            && cached.LastWriteUtc == info.LastWriteTimeUtc)
                        {
                            cached.IsAvailable = true;
                            continue;
                        }

                        var hash = await ComputeHashAsync(path, linked.Token);
                        if (byHash.TryGetValue(hash, out var duplicate)
                            && File.Exists(duplicate.FilePath)
                            && !string.Equals(duplicate.FilePath, path, StringComparison.OrdinalIgnoreCase))
                        {
                            duplicates++;
                            continue;
                        }

                        var track = ReadTrack(folder.Id, path, info, hash);
                        if (cached is null)
                        {
                            existingTracks.Add(track);
                            byPath[path] = track;
                            added++;
                        }
                        else
                        {
                            var position = existingTracks.FindIndex(item => item.Id == cached.Id);
                            if (position >= 0) existingTracks[position] = track;
                            byPath[path] = track;
                            updated++;
                        }
                        byHash[hash] = track;
                    }
                    catch (OperationCanceledException) { throw; }
                    catch { failed++; }
                }

                folder.LastScanUtc = DateTime.UtcNow;
            }

            var unavailable = 0;
            foreach (var track in existingTracks)
            {
                if (folders.Any(folder => folder.Id == track.FolderId) && !seenPaths.Contains(track.FilePath))
                {
                    track.IsAvailable = false;
                    unavailable++;
                }
            }

            lock (stateLock)
            {
                index = new LibraryIndex(folders, existingTracks);
                SaveIndexLocked();
            }
            return new ScanSummary(added, updated, duplicates, unavailable, failed, false);
        }
        catch (OperationCanceledException)
        {
            return new ScanSummary(0, 0, 0, 0, 0, true);
        }
        finally
        {
            activeScan = null;
            scanLock.Release();
        }
    }

    public void RemoveFolder(string folderId)
    {
        activeScan?.Cancel();
        lock (stateLock)
        {
            index.Folders.RemoveAll(folder => folder.Id == folderId);
            index.Tracks.RemoveAll(track => track.FolderId == folderId);
            SaveIndexLocked();
        }
    }

    public int RemoveUnavailable()
    {
        lock (stateLock)
        {
            var removed = index.Tracks.RemoveAll(track => !track.IsAvailable);
            if (removed > 0) SaveIndexLocked();
            return removed;
        }
    }

    public object GetPublicState()
    {
        lock (stateLock)
        {
            return new
            {
                type = "folderLibraryState",
                folders = index.Folders.Select(folder => new
                {
                    id = folder.Id,
                    path = folder.Path,
                    lastScanUtc = folder.LastScanUtc,
                    songCount = index.Tracks.Count(track => track.FolderId == folder.Id),
                    unavailableCount = index.Tracks.Count(track => track.FolderId == folder.Id && !track.IsAvailable)
                }),
                tracks = index.Tracks.Select(track => new
                {
                    id = "folder-" + track.Id,
                    sourceId = track.Id,
                    sourceType = "file-reference",
                    folderId = track.FolderId,
                    title = track.Title,
                    artist = track.Artist,
                    album = track.Album,
                    duration = track.Duration,
                    size = track.Size,
                    fileName = Path.GetFileName(track.FilePath),
                    mimeType = GetContentType(track.FilePath),
                    contentHash = track.ContentHash,
                    metadataSource = track.MetadataSource,
                    isAvailable = track.IsAvailable,
                    url = "/library/audio/" + track.Id + "?token=" + sessionToken,
                    cover = track.HasArtwork ? "/library/cover/" + track.Id + "?token=" + sessionToken : "/src/assets/covers/signal.svg",
                    createdAt = track.AddedUtc
                })
            };
        }
    }

    public bool TryResolveFile(string kind, string id, out string path, out string contentType)
    {
        lock (stateLock)
        {
            var track = index.Tracks.FirstOrDefault(item => item.Id == id && item.IsAvailable);
            if (track is null)
            {
                path = string.Empty;
                contentType = string.Empty;
                return false;
            }

            path = kind == "cover" ? Path.Combine(artworkDirectory, track.Id + ".jpg") : track.FilePath;
            contentType = kind == "cover" ? "image/jpeg" : GetContentType(track.FilePath);
            return File.Exists(path);
        }
    }

    public bool IsValidSessionToken(string token)
    {
        if (token?.Length != sessionToken.Length) return false;
        return CryptographicOperations.FixedTimeEquals(Encoding.ASCII.GetBytes(sessionToken), Encoding.ASCII.GetBytes(token));
    }

    private LibraryTrack ReadTrack(string folderId, string path, FileInfo info, string hash)
    {
        var id = CreateStableId(path);
        var title = Path.GetFileNameWithoutExtension(path);
        var artist = "本地音乐";
        var album = "我的导入";
        var duration = 0;
        var metadataSource = "filename";
        var hasArtwork = false;

        try
        {
            using var media = TagLib.File.Create(path);
            title = string.IsNullOrWhiteSpace(media.Tag.Title) ? title : media.Tag.Title.Trim();
            artist = media.Tag.Performers.FirstOrDefault()?.Trim() ?? artist;
            album = string.IsNullOrWhiteSpace(media.Tag.Album) ? album : media.Tag.Album.Trim();
            duration = Math.Max(0, (int)Math.Round(media.Properties.Duration.TotalSeconds));
            metadataSource = "id3";
            var picture = media.Tag.Pictures.FirstOrDefault();
            if (picture?.Data?.Data?.Length > 0)
            {
                using var input = new MemoryStream(picture.Data.Data);
                using var image = Image.FromStream(input);
                var scale = Math.Min(1d, 1024d / Math.Max(image.Width, image.Height));
                using var resized = new Bitmap(image, Math.Max(1, (int)Math.Round(image.Width * scale)), Math.Max(1, (int)Math.Round(image.Height * scale)));
                resized.Save(Path.Combine(artworkDirectory, id + ".jpg"), System.Drawing.Imaging.ImageFormat.Jpeg);
                hasArtwork = true;
            }
        }
        catch { }

        return new LibraryTrack(id, folderId, path, title, artist, album, duration, info.Length, info.LastWriteTimeUtc, hash, metadataSource, hasArtwork, true, DateTime.UtcNow);
    }

    private static async Task<string> ComputeHashAsync(string path, CancellationToken cancellationToken)
    {
        await using var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite, 1024 * 1024, true);
        var hash = await SHA256.HashDataAsync(stream, cancellationToken);
        return Convert.ToHexString(hash).ToLowerInvariant();
    }

    private static IEnumerable<string> EnumerateSupportedFilesSafely(string root)
    {
        var pending = new Stack<string>();
        pending.Push(root);
        while (pending.Count > 0)
        {
            var directory = pending.Pop();
            string[] files;
            string[] directories;
            try
            {
                files = Directory.GetFiles(directory);
                directories = Directory.GetDirectories(directory);
            }
            catch { continue; }

            foreach (var file in files)
            {
                if (SupportedExtensions.Contains(Path.GetExtension(file))) yield return file;
            }

            foreach (var child in directories)
            {
                try
                {
                    var attributes = File.GetAttributes(child);
                    if ((attributes & (FileAttributes.Hidden | FileAttributes.System | FileAttributes.ReparsePoint)) == 0)
                        pending.Push(child);
                }
                catch { }
            }
        }
    }

    private static string CreateStableId(string value)
    {
        var hash = SHA256.HashData(Encoding.UTF8.GetBytes(value.ToUpperInvariant()));
        return Convert.ToHexString(hash[..16]).ToLowerInvariant();
    }

    private LibraryIndex LoadIndex()
    {
        try
        {
            return File.Exists(indexPath)
                ? JsonSerializer.Deserialize<LibraryIndex>(File.ReadAllText(indexPath)) ?? new LibraryIndex()
                : new LibraryIndex();
        }
        catch { return new LibraryIndex(); }
    }

    private void SaveIndexLocked()
    {
        var temporary = indexPath + ".tmp";
        File.WriteAllText(temporary, JsonSerializer.Serialize(index, new JsonSerializerOptions { WriteIndented = true }));
        File.Move(temporary, indexPath, true);
    }

    private static string GetContentType(string path) => Path.GetExtension(path).ToLowerInvariant() switch
    {
        ".mp3" => "audio/mpeg", ".wav" => "audio/wav", ".ogg" => "audio/ogg", ".m4a" => "audio/mp4",
        ".aac" => "audio/aac", ".flac" => "audio/flac", ".webm" => "audio/webm", _ => "application/octet-stream"
    };

    public void Dispose()
    {
        activeScan?.Cancel();
        activeScan?.Dispose();
        scanLock.Dispose();
    }
}

internal sealed record ScanProgress(int Processed, string FileName);
internal sealed record ScanSummary(int Added, int Updated, int Duplicates, int Unavailable, int Failed, bool Cancelled);
internal sealed record LibraryFolder(string Id, string Path) { public DateTime? LastScanUtc { get; set; } }
internal sealed class LibraryTrack
{
    [JsonConstructor]
    public LibraryTrack(string id, string folderId, string filePath, string title, string artist, string album,
        int duration, long size, DateTime lastWriteUtc, string contentHash, string metadataSource, bool hasArtwork,
        bool isAvailable, DateTime addedUtc)
    {
        Id = id; FolderId = folderId; FilePath = filePath; Title = title; Artist = artist; Album = album;
        Duration = duration; Size = size; LastWriteUtc = lastWriteUtc; ContentHash = contentHash;
        MetadataSource = metadataSource; HasArtwork = hasArtwork; IsAvailable = isAvailable; AddedUtc = addedUtc;
    }
    public string Id { get; }
    public string FolderId { get; }
    public string FilePath { get; }
    public string Title { get; }
    public string Artist { get; }
    public string Album { get; }
    public int Duration { get; }
    public long Size { get; }
    public DateTime LastWriteUtc { get; }
    public string ContentHash { get; }
    public string MetadataSource { get; }
    public bool HasArtwork { get; }
    public bool IsAvailable { get; set; }
    public DateTime AddedUtc { get; }
}
internal sealed record LibraryIndex(List<LibraryFolder> Folders, List<LibraryTrack> Tracks)
{
    public LibraryIndex() : this(new List<LibraryFolder>(), new List<LibraryTrack>()) { }
}
