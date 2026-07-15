using System;
using System.Diagnostics;
using System.IO;
using System.Net.Sockets;
using System.Threading;

namespace MusicPlayerHost;

internal sealed class NeteaseApiProcessManager : IDisposable
{
    private const string PackageName = "NeteaseCloudMusicApi@4.32.0";
    private readonly object sync = new();
    private readonly string? nodePath;
    private readonly string? npmPath;
    private readonly string apiDirectory = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "StarFiLeMusicPlayer", "NeteaseApi");
    private readonly int port;
    private readonly System.Threading.Timer? monitor;
    private Process? installProcess;
    private Process? ownedProcess;
    private bool isDisposed;

    private NeteaseApiProcessManager(string nodePath, string npmPath, int port)
    {
        this.nodePath = nodePath;
        this.npmPath = npmPath;
        this.port = port;
        monitor = new System.Threading.Timer(CheckAndStart, null, TimeSpan.Zero, TimeSpan.FromSeconds(10));
    }

    private NeteaseApiProcessManager()
    {
    }

    public static NeteaseApiProcessManager StartForConfiguredApi()
    {
        if (!TryGetLocalApiPort(out var port)
            || FindNodeTool("node.exe") is not { } nodePath
            || FindNodeTool("npm.cmd") is not { } npmPath)
        {
            return new NeteaseApiProcessManager();
        }

        return new NeteaseApiProcessManager(nodePath, npmPath, port);
    }

    private void CheckAndStart(object? state)
    {
        lock (sync)
        {
            if (isDisposed || nodePath is null || npmPath is null || IsPortOpen(port)) return;

            if (ownedProcess is { HasExited: false }) return;
            ownedProcess?.Dispose();
            ownedProcess = null;

            try
            {
                var appPath = Path.Combine(apiDirectory, "node_modules", "NeteaseCloudMusicApi", "app.js");
                if (!File.Exists(appPath))
                {
                    StartInstallIfNeeded();
                    return;
                }

                var startInfo = new ProcessStartInfo
                {
                    FileName = nodePath,
                    UseShellExecute = false,
                    CreateNoWindow = true,
                    WindowStyle = ProcessWindowStyle.Hidden,
                    WorkingDirectory = apiDirectory
                };
                startInfo.ArgumentList.Add(appPath);
                startInfo.Environment["PORT"] = port.ToString();
                ownedProcess = Process.Start(startInfo);
            }
            catch
            {
                ownedProcess?.Dispose();
                ownedProcess = null;
            }
        }
    }

    private void StartInstallIfNeeded()
    {
        if (installProcess is { HasExited: false }) return;
        installProcess?.Dispose();
        Directory.CreateDirectory(apiDirectory);

        var command = $"\"{npmPath}\" install --no-audit --no-fund --prefix \"{apiDirectory}\" {PackageName}";
        var startInfo = new ProcessStartInfo
        {
            FileName = Environment.GetEnvironmentVariable("ComSpec") ?? "cmd.exe",
            Arguments = $"/d /s /c \"{command}\"",
            UseShellExecute = false,
            CreateNoWindow = true,
            WindowStyle = ProcessWindowStyle.Hidden,
            WorkingDirectory = apiDirectory
        };
        installProcess = Process.Start(startInfo);
    }

    private static bool TryGetLocalApiPort(out int port)
    {
        const string defaultUrl = "http://127.0.0.1:3000/";
        var configuredUrl = Environment.GetEnvironmentVariable("STARFILE_NETEASE_API_URL");
        var apiUrl = string.IsNullOrWhiteSpace(configuredUrl) ? defaultUrl : configuredUrl.Trim();
        if (Uri.TryCreate(apiUrl, UriKind.Absolute, out var uri) && uri.IsLoopback)
        {
            port = uri.Port;
            return true;
        }

        port = 0;
        return false;
    }

    private static string? FindNodeTool(string fileName)
    {
        foreach (var directory in (Environment.GetEnvironmentVariable("PATH") ?? string.Empty)
                     .Split(Path.PathSeparator, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            var candidate = Path.Combine(directory.Trim('"'), fileName);
            if (File.Exists(candidate)) return candidate;
        }

        var programFiles = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
        var fallback = Path.Combine(programFiles, "nodejs", fileName);
        return File.Exists(fallback) ? fallback : null;
    }

    private static bool IsPortOpen(int port)
    {
        try
        {
            using var client = new TcpClient();
            return client.ConnectAsync("127.0.0.1", port).Wait(TimeSpan.FromMilliseconds(500)) && client.Connected;
        }
        catch
        {
            return false;
        }
    }

    public void Dispose()
    {
        lock (sync)
        {
            if (isDisposed) return;
            isDisposed = true;
            monitor?.Dispose();

            if (installProcess is { HasExited: false })
            {
                try { installProcess.Kill(true); }
                catch { }
            }

            if (ownedProcess is { HasExited: false })
            {
                try { ownedProcess.Kill(true); }
                catch { }
            }

            installProcess?.Dispose();
            ownedProcess?.Dispose();
            installProcess = null;
            ownedProcess = null;
        }
    }
}
