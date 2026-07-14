using System;
using System.ComponentModel;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Sockets;
using System.Reflection;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace MusicPlayerHost;

internal static class Program
{
    [STAThread]
    private static void Main()
    {
        using var singleInstance = new Mutex(true, "StarFiLeMusicPlayer", out var isFirstInstance);
        if (!isFirstInstance)
        {
            return;
        }

        Application.SetHighDpiMode(HighDpiMode.PerMonitorV2);
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);

        using var library = new FolderLibraryService();
        using var server = new EmbeddedWebServer(library);
        server.Start();
        using var context = new TrayAppContext(server.Url, library);
        Application.Run(context);
    }
}

internal static class ApplicationIconLoader
{
    public static Icon Load()
    {
        using var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("StarFile.ico");
        if (stream is not null)
        {
            using var embeddedIcon = new Icon(stream);
            return (Icon)embeddedIcon.Clone();
        }

        return Icon.ExtractAssociatedIcon(Application.ExecutablePath)
            ?? (Icon)SystemIcons.Application.Clone();
    }
}

internal sealed class TrayAppContext : ApplicationContext
{
    private readonly Icon trayIcon;
    private readonly NotifyIcon notifyIcon;
    private readonly ContextMenuStrip trayMenu;
    private readonly PlayerForm playerForm;
    private readonly ToolStripMenuItem currentTrackItem;
    private readonly ToolStripMenuItem togglePlaybackItem;
    private readonly ToolStripMenuItem previousItem;
    private readonly ToolStripMenuItem nextItem;
    private bool isExiting;
    private bool hasShownTrayHint;

    public TrayAppContext(string url, FolderLibraryService library)
    {
        trayIcon = ApplicationIconLoader.Load();
        playerForm = new PlayerForm(url, ExitApplication, library, UpdatePlaybackState, ShowTrayHint);

        trayMenu = new ContextMenuStrip();
        trayMenu.Items.Add("打开 StarFile", null, (_, _) => OpenPlayer());
        currentTrackItem = new ToolStripMenuItem("未播放") { Enabled = false };
        togglePlaybackItem = new ToolStripMenuItem("播放") { Enabled = false };
        previousItem = new ToolStripMenuItem("上一首") { Enabled = false };
        nextItem = new ToolStripMenuItem("下一首") { Enabled = false };
        togglePlaybackItem.Click += (_, _) => playerForm.PostPlaybackCommand("toggle");
        previousItem.Click += (_, _) => playerForm.PostPlaybackCommand("previous");
        nextItem.Click += (_, _) => playerForm.PostPlaybackCommand("next");
        trayMenu.Items.Add(new ToolStripSeparator());
        trayMenu.Items.Add(currentTrackItem);
        trayMenu.Items.Add(togglePlaybackItem);
        trayMenu.Items.Add(previousItem);
        trayMenu.Items.Add(nextItem);
        trayMenu.Items.Add(new ToolStripSeparator());
        trayMenu.Items.Add("退出", null, (_, _) => ExitApplication());

        notifyIcon = new NotifyIcon
        {
            Icon = trayIcon,
            Text = "StarFile",
            ContextMenuStrip = trayMenu,
            Visible = true
        };
        notifyIcon.DoubleClick += (_, _) => OpenPlayer();

        OpenPlayer();
    }

    private void OpenPlayer()
    {
        if (isExiting)
        {
            return;
        }

        if (!playerForm.Visible)
        {
            playerForm.Show();
        }

        if (playerForm.WindowState == FormWindowState.Minimized)
        {
            playerForm.WindowState = FormWindowState.Normal;
        }

        playerForm.BringToFront();
        playerForm.Activate();
    }

    private async void ExitApplication()
    {
        if (isExiting)
        {
            return;
        }

        isExiting = true;
        await playerForm.PrepareForExitAsync();
        playerForm.CloseForExit();
        ExitThread();
    }

    private void UpdatePlaybackState(NativePlaybackState state)
    {
        currentTrackItem.Text = state.HasSong ? $"{state.Title} - {state.Artist}" : "未播放";
        togglePlaybackItem.Text = state.IsPlaying ? "暂停" : "播放";
        togglePlaybackItem.Enabled = state.HasSong;
        previousItem.Enabled = state.HasSong;
        nextItem.Enabled = state.HasSong;
        notifyIcon.Text = state.HasSong ? TruncateNotifyText($"StarFile - {state.Title}") : "StarFile";
    }

    private void ShowTrayHint()
    {
        if (hasShownTrayHint) return;
        hasShownTrayHint = true;
        notifyIcon.ShowBalloonTip(3000, "StarFile 仍在运行", "播放器已隐藏到托盘，可从托盘菜单继续控制或退出。", ToolTipIcon.Info);
    }

    private static string TruncateNotifyText(string value) => value.Length <= 63 ? value : value[..60] + "...";

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            notifyIcon.Visible = false;
            notifyIcon.Dispose();
            trayMenu.Dispose();
            playerForm.Dispose();
            trayIcon.Dispose();
        }

        base.Dispose(disposing);
    }
}

internal sealed class PlayerForm : Form
{
    private readonly Icon windowIcon;
    private readonly WebView2 webView;
    private readonly Label errorLabel;
    private readonly string url;
    private readonly Action requestExit;
    private readonly UpdateService updateService = new();
    private readonly FolderLibraryService folderLibrary;
    private readonly Action<NativePlaybackState> playbackStateChanged;
    private readonly Action hiddenToTray;
    private readonly CancellationTokenSource updateCancellation = new();
    private UpdateRelease? latestRelease;
    private string lastUpdateStatus = "idle";
    private bool isCheckingForUpdates;
    private bool isInstallingUpdate;
    private bool updaterResourcesDisposed;
    private bool allowClose;

    public PlayerForm(string url, Action requestExit, FolderLibraryService folderLibrary,
        Action<NativePlaybackState> playbackStateChanged, Action hiddenToTray)
    {
        windowIcon = ApplicationIconLoader.Load();
        this.url = url;
        this.requestExit = requestExit;
        this.folderLibrary = folderLibrary;
        this.playbackStateChanged = playbackStateChanged;
        this.hiddenToTray = hiddenToTray;

        AutoScaleMode = AutoScaleMode.Dpi;
        Text = "StarFile";
        ClientSize = new Size(1380, 880);
        MinimumSize = new Size(1024, 720);
        StartPosition = FormStartPosition.CenterScreen;
        Icon = windowIcon;

        webView = new WebView2 { Dock = DockStyle.Fill };
        errorLabel = new Label
        {
            Dock = DockStyle.Fill,
            TextAlign = ContentAlignment.MiddleCenter,
            Visible = false
        };

        Controls.Add(webView);
        Controls.Add(errorLabel);
        Shown += InitializeWebViewAsync;
        FormClosing += HideOnUserClose;
    }

    public void CloseForExit()
    {
        allowClose = true;
        Close();
    }

    private async void InitializeWebViewAsync(object? sender, EventArgs eventArgs)
    {
        try
        {
            var userDataFolder = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "StarFiLeMusicPlayer",
                "WebView2");
            Directory.CreateDirectory(userDataFolder);

            var environment = await CoreWebView2Environment.CreateAsync(null, userDataFolder);
            await webView.EnsureCoreWebView2Async(environment);

            webView.CoreWebView2.Settings.IsStatusBarEnabled = false;
            webView.CoreWebView2.Settings.AreDevToolsEnabled = false;
            webView.CoreWebView2.Settings.IsZoomControlEnabled = false;
            webView.CoreWebView2.Settings.IsWebMessageEnabled = true;
            webView.CoreWebView2.NavigationStarting += KeepNavigationLocal;
            webView.CoreWebView2.WebMessageReceived += HandleWebMessageReceived;
            webView.ZoomFactor = 1.0;
            webView.ZoomFactorChanged += ResetZoomFactor;
            webView.Source = new Uri(url);
        }
        catch (Exception exception)
        {
            errorLabel.Text = "Unable to start the embedded browser.\r\nInstall Microsoft Edge WebView2 Runtime and restart the player.\r\n\r\n" + exception.Message;
            errorLabel.Visible = true;
            errorLabel.BringToFront();
        }
    }

    private async void HandleWebMessageReceived(object? sender, CoreWebView2WebMessageReceivedEventArgs eventArgs)
    {
        if (!IsTrustedWebMessageSource(eventArgs.Source))
        {
            return;
        }

        try
        {
            using var message = JsonDocument.Parse(eventArgs.WebMessageAsJson);
            if (message.RootElement.ValueKind != JsonValueKind.Object
                || !message.RootElement.TryGetProperty("type", out var typeElement)
                || typeElement.ValueKind != JsonValueKind.String)
            {
                return;
            }

            switch (typeElement.GetString())
            {
                case "getUpdateState":
                    PostUpdateState(lastUpdateStatus);
                    break;
                case "checkForUpdates":
                    await CheckForUpdatesAsync();
                    break;
                case "installUpdate":
                    await InstallUpdateAsync();
                    break;
                case "getFolderLibraryState":
                    PostJson(folderLibrary.GetPublicState());
                    _ = ScanFoldersAsync();
                    break;
                case "chooseMusicFolder":
                    if (folderLibrary.ChooseFolder(this) is not null) await ScanFoldersAsync();
                    break;
                case "scanMusicFolders":
                    await ScanFoldersAsync();
                    break;
                case "cancelFolderScan":
                    folderLibrary.CancelScan();
                    break;
                case "removeMusicFolder":
                    if (message.RootElement.TryGetProperty("folderId", out var folderId))
                    {
                        folderLibrary.RemoveFolder(folderId.GetString() ?? string.Empty);
                        PostJson(folderLibrary.GetPublicState());
                    }
                    break;
                case "removeUnavailableTracks":
                    folderLibrary.RemoveUnavailable();
                    PostJson(folderLibrary.GetPublicState());
                    break;
                case "playbackReady":
                    PostJson(new { type = "requestPlaybackState" });
                    break;
                case "setNativePlaybackState":
                    playbackStateChanged(new NativePlaybackState(
                        message.RootElement.TryGetProperty("hasSong", out var hasSong) && hasSong.GetBoolean(),
                        message.RootElement.TryGetProperty("isPlaying", out var isPlaying) && isPlaying.GetBoolean(),
                        ReadString(message.RootElement, "title"),
                        ReadString(message.RootElement, "artist"),
                        ReadString(message.RootElement, "album")));
                    break;
                case "setNativeTimeline":
                case "savePlaybackSession":
                    break;
            }
        }
        catch (JsonException)
        {
            PostUpdateState("error", message: "更新请求格式无效，请重试。");
        }
    }

    private static string ReadString(JsonElement element, string propertyName) =>
        element.TryGetProperty(propertyName, out var value) && value.ValueKind == JsonValueKind.String
            ? value.GetString() ?? string.Empty : string.Empty;

    public void PostPlaybackCommand(string action, double? position = null) =>
        PostJson(new { type = "playbackCommand", action, position });

    public async Task PrepareForExitAsync()
    {
        if (webView.CoreWebView2 is null) return;
        try { await webView.CoreWebView2.ExecuteScriptAsync("window.dispatchEvent(new Event('starfile-exit'))"); }
        catch { }
    }

    private async Task ScanFoldersAsync()
    {
        var progress = new Progress<ScanProgress>(value => PostJson(new
        {
            type = "folderScanProgress",
            processed = value.Processed,
            fileName = value.FileName
        }));
        var summary = await folderLibrary.ScanAllAsync(progress, updateCancellation.Token);
        PostJson(new { type = "folderScanCompleted", summary });
        PostJson(folderLibrary.GetPublicState());
    }

    private void PostJson(object payload)
    {
        if (!IsDisposed && webView.CoreWebView2 is not null)
            webView.CoreWebView2.PostWebMessageAsJson(JsonSerializer.Serialize(payload));
    }

    private async Task CheckForUpdatesAsync()
    {
        if (isCheckingForUpdates || isInstallingUpdate)
        {
            return;
        }

        isCheckingForUpdates = true;
        PostUpdateState("checking");

        try
        {
            using var checkTimeout = CancellationTokenSource.CreateLinkedTokenSource(updateCancellation.Token);
            checkTimeout.CancelAfter(TimeSpan.FromSeconds(30));
            var result = await updateService.CheckAsync(checkTimeout.Token);
            latestRelease = result.Release;
            PostUpdateState(result.IsUpdateAvailable ? "available" : "current");
        }
        catch (OperationCanceledException) when (updateCancellation.IsCancellationRequested)
        {
            // The application is exiting.
        }
        catch (OperationCanceledException)
        {
            PostUpdateState("error", message: "检查更新超时，请检查网络后重试。");
        }
        catch (HttpRequestException exception)
        {
            var message = exception.StatusCode == HttpStatusCode.NotFound
                ? "暂未找到可用的 StarFile 发布版本。"
                : "无法连接更新服务，请检查网络后重试。";
            PostUpdateState("error", message: message);
        }
        catch (Exception)
        {
            PostUpdateState("error", message: "更新信息读取失败，请稍后重试。");
        }
        finally
        {
            isCheckingForUpdates = false;
        }
    }

    private async Task InstallUpdateAsync()
    {
        if (isInstallingUpdate || isCheckingForUpdates)
        {
            if (isCheckingForUpdates)
            {
                PostUpdateState("checking");
            }
            return;
        }

        var release = updateService.AvailableRelease;
        if (release is null)
        {
            PostUpdateState("error", message: "请先检查更新，再选择安装。");
            return;
        }

        if (string.IsNullOrWhiteSpace(release.InstallerUrl))
        {
            try
            {
                OpenReleasePage(release.ReleaseUrl);
                PostUpdateState("available", message: "已打开版本发布页。");
            }
            catch (Exception)
            {
                PostUpdateState("available", message: "无法打开版本发布页，请稍后重试。");
            }
            return;
        }

        isInstallingUpdate = true;
        PostUpdateState("downloading", progress: 0);

        try
        {
            var progress = new Progress<int>(value => PostUpdateState("downloading", progress: value));
            var installerPath = await updateService.DownloadInstallerAsync(
                release,
                progress,
                updateCancellation.Token);

            PostUpdateState("installing", progress: 100);
            var process = Process.Start(new ProcessStartInfo
            {
                FileName = installerPath,
                Arguments = "/SP- /CLOSEAPPLICATIONS /RESTARTAPPLICATIONS",
                UseShellExecute = true,
                Verb = "runas"
            });

            if (process is null)
            {
                throw new InvalidOperationException("The installer process could not be started.");
            }

            requestExit();
        }
        catch (OperationCanceledException) when (updateCancellation.IsCancellationRequested)
        {
            // The application is exiting.
        }
        catch (Win32Exception exception) when (exception.NativeErrorCode == 1223)
        {
            PostUpdateState("available", message: "已取消安装。你可以稍后再更新。");
        }
        catch (Exception)
        {
            PostUpdateState("available", message: "安装包下载或启动失败，请稍后重试。");
        }
        finally
        {
            isInstallingUpdate = false;
        }
    }

    private static void OpenReleasePage(string releaseUrl)
    {
        Process.Start(new ProcessStartInfo
        {
            FileName = releaseUrl,
            UseShellExecute = true
        });
    }

    private void PostUpdateState(string status, int progress = 0, string message = "")
    {
        if (IsDisposed || webView.CoreWebView2 is null)
        {
            return;
        }

        lastUpdateStatus = status;
        var release = updateService.AvailableRelease ?? latestRelease;
        var releaseNotes = release?.Notes ?? string.Empty;
        if (releaseNotes.Length > 4000)
        {
            releaseNotes = releaseNotes[..4000] + "...";
        }

        var payload = new
        {
            type = "updateState",
            status,
            currentVersion = updateService.CurrentVersion,
            latestVersion = release?.Version ?? string.Empty,
            releaseName = release?.Name ?? string.Empty,
            releaseNotes,
            releaseUrl = release?.ReleaseUrl ?? string.Empty,
            canInstall = !string.IsNullOrWhiteSpace(release?.InstallerUrl),
            progress,
            message
        };

        webView.CoreWebView2.PostWebMessageAsJson(JsonSerializer.Serialize(payload));
    }

    private static bool IsTrustedWebMessageSource(string source)
    {
        return Uri.TryCreate(source, UriKind.Absolute, out var sourceUri)
            && sourceUri.Scheme == Uri.UriSchemeHttp
            && sourceUri.Host.Equals("127.0.0.1", StringComparison.Ordinal)
            && sourceUri.Port == EmbeddedWebServer.Port;
    }

    private void ResetZoomFactor(object? sender, EventArgs eventArgs)
    {
        if (Math.Abs(webView.ZoomFactor - 1.0) > 0.001)
        {
            webView.ZoomFactor = 1.0;
        }
    }

    private static void KeepNavigationLocal(object? sender, CoreWebView2NavigationStartingEventArgs eventArgs)
    {
        if (!Uri.TryCreate(eventArgs.Uri, UriKind.Absolute, out var destination)
            || destination.Scheme != Uri.UriSchemeHttp
            || !destination.Host.Equals("127.0.0.1", StringComparison.Ordinal)
            || destination.Port != EmbeddedWebServer.Port)
        {
            eventArgs.Cancel = true;
        }
    }

    private void HideOnUserClose(object? sender, FormClosingEventArgs eventArgs)
    {
        if (allowClose)
        {
            return;
        }

        eventArgs.Cancel = true;
        Hide();
        hiddenToTray();
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing && !updaterResourcesDisposed)
        {
            updaterResourcesDisposed = true;
            updateCancellation.Cancel();
            updateCancellation.Dispose();
            windowIcon.Dispose();
        }

        base.Dispose(disposing);
    }
}

internal sealed record NativePlaybackState(bool HasSong, bool IsPlaying, string Title, string Artist, string Album);

internal sealed class EmbeddedWebServer : IDisposable
{
    // A stable origin is required for WebView2 localStorage and IndexedDB to survive restarts.
    internal const int Port = 49321;

    private static readonly Dictionary<string, string> ContentTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        { ".html", "text/html; charset=utf-8" },
        { ".js", "text/javascript; charset=utf-8" },
        { ".mjs", "text/javascript; charset=utf-8" },
        { ".css", "text/css; charset=utf-8" },
        { ".svg", "image/svg+xml; charset=utf-8" },
        { ".jpg", "image/jpeg" },
        { ".jpeg", "image/jpeg" },
        { ".png", "image/png" },
        { ".wav", "audio/wav" },
        { ".mp3", "audio/mpeg" },
        { ".ogg", "audio/ogg" },
        { ".m4a", "audio/mp4" },
        { ".aac", "audio/aac" },
        { ".flac", "audio/flac" },
        { ".webm", "audio/webm" }
    };

    private readonly ConcurrentDictionary<string, byte[]> resourceCache = new(StringComparer.OrdinalIgnoreCase);
    private readonly Assembly assembly = Assembly.GetExecutingAssembly();
    private readonly FolderLibraryService folderLibrary;
    private TcpListener? listener;
    private bool isDisposed;

    public EmbeddedWebServer(FolderLibraryService folderLibrary)
    {
        this.folderLibrary = folderLibrary;
    }

    public string Url { get; private set; } = string.Empty;

    public void Start()
    {
        listener = new TcpListener(IPAddress.Loopback, Port);
        listener.Start();

        Url = "http://127.0.0.1:" + Port + "/";

        var thread = new Thread(AcceptLoop) { IsBackground = true };
        thread.Start();
    }

    public void Dispose()
    {
        isDisposed = true;
        listener?.Stop();
    }

    private void AcceptLoop()
    {
        while (!isDisposed)
        {
            try
            {
                var client = listener!.AcceptTcpClient();
                ThreadPool.QueueUserWorkItem(_ => HandleClient(client));
            }
            catch (SocketException) when (isDisposed)
            {
                return;
            }
            catch (ObjectDisposedException) when (isDisposed)
            {
                return;
            }
        }
    }

    private void HandleClient(TcpClient client)
    {
        using (client)
        using (var stream = client.GetStream())
        using (var reader = new StreamReader(stream, Encoding.ASCII, false, 8192, true))
        {
            var requestLine = reader.ReadLine();
            if (string.IsNullOrWhiteSpace(requestLine))
            {
                return;
            }

            var parts = requestLine.Split(' ', 3, StringSplitOptions.RemoveEmptyEntries);
            if (parts.Length < 2 || parts[0] != "GET")
            {
                WriteResponse(stream, 405, "Method Not Allowed", "text/plain; charset=utf-8", Encoding.UTF8.GetBytes("Method not allowed"), null);
                return;
            }

            var rangeHeader = string.Empty;
            string? headerLine;
            while (!string.IsNullOrEmpty(headerLine = reader.ReadLine()))
            {
                if (headerLine.StartsWith("Range:", StringComparison.OrdinalIgnoreCase))
                {
                    rangeHeader = headerLine["Range:".Length..].Trim();
                }
            }

            var path = NormalizePath(parts[1]);
            if (path == null)
            {
                WriteResponse(stream, 403, "Forbidden", "text/plain; charset=utf-8", Encoding.UTF8.GetBytes("Forbidden"), null);
                return;
            }

            if (TryGetLibraryRequest(parts[1], path, out var kind, out var id)
                && folderLibrary.TryResolveFile(kind, id, out var diskPath, out var diskContentType))
            {
                WriteDiskFileResponse(stream, diskPath, diskContentType, rangeHeader);
                return;
            }

            var data = GetResource(path);
            if (data == null)
            {
                WriteResponse(stream, 404, "Not Found", "text/plain; charset=utf-8", Encoding.UTF8.GetBytes("Not found"), null);
                return;
            }

            var contentType = ContentTypes.TryGetValue(Path.GetExtension(path), out var type)
                ? type
                : "application/octet-stream";
            WriteFileResponse(stream, data, contentType, rangeHeader);
        }
    }

    private bool TryGetLibraryRequest(string rawTarget, string path, out string kind, out string id)
    {
        kind = string.Empty;
        id = string.Empty;
        var segments = path.Split('/', StringSplitOptions.RemoveEmptyEntries);
        if (segments.Length != 3 || segments[0] != "library" || (segments[1] != "audio" && segments[1] != "cover")) return false;
        var uri = new Uri("http://127.0.0.1" + rawTarget);
        var token = uri.Query.TrimStart('?').Split('&', StringSplitOptions.RemoveEmptyEntries)
            .Select(item => item.Split('=', 2))
            .Where(item => item.Length == 2 && item[0] == "token")
            .Select(item => Uri.UnescapeDataString(item[1]))
            .FirstOrDefault() ?? string.Empty;
        if (!folderLibrary.IsValidSessionToken(token)) return false;
        kind = segments[1];
        id = segments[2];
        return id.All(character => Uri.IsHexDigit(character));
    }

    private static void WriteDiskFileResponse(Stream stream, string path, string contentType, string rangeHeader)
    {
        using var file = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite);
        var start = 0L;
        var end = file.Length - 1;
        var partial = TryParseRange(rangeHeader, file.Length, out start, out end);
        var length = end - start + 1;
        WriteAscii(stream, BuildHeader(partial ? 206 : 200, partial ? "Partial Content" : "OK", contentType, length,
            partial ? new[] { $"Content-Range: bytes {start}-{end}/{file.Length}", "Accept-Ranges: bytes" } : new[] { "Accept-Ranges: bytes" }));
        file.Position = start;
        var buffer = new byte[128 * 1024];
        var remaining = length;
        while (remaining > 0)
        {
            var read = file.Read(buffer, 0, (int)Math.Min(buffer.Length, remaining));
            if (read <= 0) break;
            stream.Write(buffer, 0, read);
            remaining -= read;
        }
    }

    private static string? NormalizePath(string rawUrl)
    {
        var path = rawUrl.Split('?', 2)[0].Split('#', 2)[0];
        path = Uri.UnescapeDataString(path);
        path = path == "/" ? "index.html" : path.TrimStart('/');
        path = path.Replace('\\', '/');

        return path.Contains("../", StringComparison.Ordinal) || path.StartsWith("..", StringComparison.Ordinal)
            ? null
            : path;
    }

    private byte[]? GetResource(string path)
    {
        var bytes = resourceCache.GetOrAdd(path, key =>
        {
            var resourceName = assembly.GetManifestResourceNames()
                .FirstOrDefault(name => string.Equals(name.Replace('\\', '/'), key, StringComparison.OrdinalIgnoreCase));
            if (resourceName == null)
            {
                return Array.Empty<byte>();
            }

            using var resource = assembly.GetManifestResourceStream(resourceName);
            if (resource == null)
            {
                return Array.Empty<byte>();
            }

            using var memory = new MemoryStream();
            resource.CopyTo(memory);
            return memory.ToArray();
        });

        return bytes.Length > 0 ? bytes : null;
    }

    private static void WriteFileResponse(Stream stream, byte[] data, string contentType, string rangeHeader)
    {
        if (TryParseRange(rangeHeader, data.Length, out var start, out var end))
        {
            var length = end - start + 1;
            WriteAscii(stream, BuildHeader(206, "Partial Content", contentType, length, new[]
            {
                "Content-Range: bytes " + start + "-" + end + "/" + data.Length,
                "Accept-Ranges: bytes"
            }));
            stream.Write(data, (int)start, (int)length);
            return;
        }

        WriteResponse(stream, 200, "OK", contentType, data, new[] { "Accept-Ranges: bytes" });
    }

    private static void WriteResponse(Stream stream, int statusCode, string reason, string contentType, byte[] body, string[]? extraHeaders)
    {
        WriteAscii(stream, BuildHeader(statusCode, reason, contentType, body.Length, extraHeaders));
        stream.Write(body, 0, body.Length);
    }

    private static string BuildHeader(int statusCode, string reason, string contentType, long contentLength, string[]? extraHeaders)
    {
        var builder = new StringBuilder();
        builder.AppendFormat("HTTP/1.1 {0} {1}\r\n", statusCode, reason);
        builder.AppendFormat("Content-Type: {0}\r\n", contentType);
        builder.AppendFormat("Content-Length: {0}\r\n", contentLength);
        builder.Append("Connection: close\r\n");

        if (extraHeaders != null)
        {
            foreach (var header in extraHeaders)
            {
                builder.Append(header).Append("\r\n");
            }
        }

        builder.Append("\r\n");
        return builder.ToString();
    }

    private static bool TryParseRange(string rangeHeader, long dataLength, out long start, out long end)
    {
        start = 0;
        end = dataLength - 1;

        if (string.IsNullOrWhiteSpace(rangeHeader) || !rangeHeader.StartsWith("bytes=", StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        var range = rangeHeader["bytes=".Length..].Split(',', 2)[0].Trim();
        var parts = range.Split('-', 2);
        if (parts.Length != 2 || !long.TryParse(parts[0], out start))
        {
            return false;
        }

        if (!long.TryParse(parts[1], out end))
        {
            end = dataLength - 1;
        }

        start = Math.Max(0, start);
        end = Math.Min(dataLength - 1, end);
        return start <= end;
    }

    private static void WriteAscii(Stream stream, string value)
    {
        var bytes = Encoding.ASCII.GetBytes(value);
        stream.Write(bytes, 0, bytes.Length);
    }
}
