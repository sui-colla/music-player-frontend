using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Sockets;
using System.Reflection;
using System.Text;
using System.Threading;
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

        using var server = new EmbeddedWebServer();
        server.Start();
        using var context = new TrayAppContext(server.Url);
        Application.Run(context);
    }
}

internal sealed class TrayAppContext : ApplicationContext
{
    private readonly NotifyIcon notifyIcon;
    private readonly ContextMenuStrip trayMenu;
    private readonly PlayerForm playerForm;
    private bool isExiting;

    public TrayAppContext(string url)
    {
        playerForm = new PlayerForm(url);

        trayMenu = new ContextMenuStrip();
        trayMenu.Items.Add("Open player", null, (_, _) => OpenPlayer());
        trayMenu.Items.Add("Exit", null, (_, _) => ExitApplication());

        notifyIcon = new NotifyIcon
        {
            Icon = SystemIcons.Application,
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

    private void ExitApplication()
    {
        if (isExiting)
        {
            return;
        }

        isExiting = true;
        playerForm.CloseForExit();
        ExitThread();
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            notifyIcon.Visible = false;
            notifyIcon.Dispose();
            trayMenu.Dispose();
            playerForm.Dispose();
        }

        base.Dispose(disposing);
    }
}

internal sealed class PlayerForm : Form
{
    private readonly WebView2 webView;
    private readonly Label errorLabel;
    private readonly string url;
    private bool allowClose;

    public PlayerForm(string url)
    {
        this.url = url;

        AutoScaleMode = AutoScaleMode.Dpi;
        Text = "StarFile";
        ClientSize = new Size(1380, 880);
        MinimumSize = new Size(1024, 720);
        StartPosition = FormStartPosition.CenterScreen;
        Icon = SystemIcons.Application;

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
            webView.CoreWebView2.NavigationStarting += KeepNavigationLocal;
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

    private void ResetZoomFactor(object? sender, EventArgs eventArgs)
    {
        if (Math.Abs(webView.ZoomFactor - 1.0) > 0.001)
        {
            webView.ZoomFactor = 1.0;
        }
    }

    private static void KeepNavigationLocal(object? sender, CoreWebView2NavigationStartingEventArgs eventArgs)
    {
        if (!Uri.TryCreate(eventArgs.Uri, UriKind.Absolute, out var destination) || !destination.IsLoopback)
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
    }
}

internal sealed class EmbeddedWebServer : IDisposable
{
    // A stable origin is required for WebView2 localStorage and IndexedDB to survive restarts.
    private const int Port = 49321;

    private static readonly Dictionary<string, string> ContentTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        { ".html", "text/html; charset=utf-8" },
        { ".js", "text/javascript; charset=utf-8" },
        { ".css", "text/css; charset=utf-8" },
        { ".svg", "image/svg+xml; charset=utf-8" },
        { ".jpg", "image/jpeg" },
        { ".jpeg", "image/jpeg" },
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
    private TcpListener? listener;
    private bool isDisposed;

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
