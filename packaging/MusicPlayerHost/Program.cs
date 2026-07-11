using System;
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
using System.Threading;
using System.Windows.Forms;

namespace MusicPlayerHost
{
    internal static class Program
    {
        [STAThread]
        private static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            using (var server = new EmbeddedWebServer())
            {
                server.Start();
                using (var context = new TrayAppContext(server.Url))
                {
                    context.OpenPlayer();
                    Application.Run(context);
                }
            }
        }
    }

    internal sealed class TrayAppContext : ApplicationContext
    {
        private readonly string url;
        private readonly NotifyIcon notifyIcon;

        public TrayAppContext(string url)
        {
            this.url = url;

            var menu = new ContextMenuStrip();
            menu.Items.Add("打开播放器", null, delegate { OpenPlayer(); });
            menu.Items.Add("退出", null, delegate { ExitThread(); });

            notifyIcon = new NotifyIcon();
            notifyIcon.Icon = SystemIcons.Application;
            notifyIcon.Text = "StarFiLe Music Player";
            notifyIcon.ContextMenuStrip = menu;
            notifyIcon.Visible = true;
            notifyIcon.DoubleClick += delegate { OpenPlayer(); };
        }

        public void OpenPlayer()
        {
            Process.Start(new ProcessStartInfo
            {
                FileName = url,
                UseShellExecute = true
            });
        }

        protected override void Dispose(bool disposing)
        {
            if (disposing)
            {
                notifyIcon.Visible = false;
                notifyIcon.Dispose();
            }

            base.Dispose(disposing);
        }
    }

    internal sealed class EmbeddedWebServer : IDisposable
    {
        private static readonly Dictionary<string, string> ContentTypes = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            { ".html", "text/html; charset=utf-8" },
            { ".js", "text/javascript; charset=utf-8" },
            { ".css", "text/css; charset=utf-8" },
            { ".svg", "image/svg+xml; charset=utf-8" },
            { ".jpg", "image/jpeg" },
            { ".jpeg", "image/jpeg" },
            { ".wav", "audio/wav" },
            { ".mp3", "audio/mpeg" }
        };

        private readonly ConcurrentDictionary<string, byte[]> resourceCache = new ConcurrentDictionary<string, byte[]>(StringComparer.OrdinalIgnoreCase);
        private readonly Assembly assembly = Assembly.GetExecutingAssembly();
        private TcpListener listener;
        private bool isDisposed;

        public string Url { get; private set; }

        public void Start()
        {
            listener = new TcpListener(IPAddress.Loopback, 0);
            listener.Start();

            var port = ((IPEndPoint)listener.LocalEndpoint).Port;
            Url = "http://127.0.0.1:" + port + "/";

            var thread = new Thread(AcceptLoop);
            thread.IsBackground = true;
            thread.Start();
        }

        public void Dispose()
        {
            isDisposed = true;
            if (listener != null)
            {
                listener.Stop();
            }
        }

        private void AcceptLoop()
        {
            while (!isDisposed)
            {
                try
                {
                    var client = listener.AcceptTcpClient();
                    ThreadPool.QueueUserWorkItem(delegate { HandleClient(client); });
                }
                catch
                {
                    if (isDisposed)
                    {
                        return;
                    }
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

                var parts = requestLine.Split(new[] { ' ' }, 3, StringSplitOptions.RemoveEmptyEntries);
                if (parts.Length < 2 || parts[0] != "GET")
                {
                    WriteResponse(stream, 405, "Method Not Allowed", "text/plain; charset=utf-8", Encoding.UTF8.GetBytes("Method not allowed"), null);
                    return;
                }

                var rangeHeader = string.Empty;
                string headerLine;
                while (!string.IsNullOrEmpty(headerLine = reader.ReadLine()))
                {
                    if (headerLine.StartsWith("Range:", StringComparison.OrdinalIgnoreCase))
                    {
                        rangeHeader = headerLine.Substring("Range:".Length).Trim();
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

                string type;
                if (!ContentTypes.TryGetValue(Path.GetExtension(path), out type))
                {
                    type = "application/octet-stream";
                }

                WriteFileResponse(stream, data, type, rangeHeader);
            }
        }

        private static string NormalizePath(string rawUrl)
        {
            var path = rawUrl.Split(new[] { '?' }, 2)[0].Split(new[] { '#' }, 2)[0];
            path = Uri.UnescapeDataString(path);
            path = path == "/" ? "index.html" : path.TrimStart('/');
            path = path.Replace('\\', '/');

            if (path.Contains("../") || path.StartsWith(".."))
            {
                return null;
            }

            return path;
        }

        private byte[] GetResource(string path)
        {
            var bytes = resourceCache.GetOrAdd(path, delegate(string key)
            {
                var resourceName = assembly
                    .GetManifestResourceNames()
                    .FirstOrDefault(name => string.Equals(name.Replace('\\', '/'), key, StringComparison.OrdinalIgnoreCase));

                if (resourceName == null)
                {
                    return new byte[0];
                }

                using (var resource = assembly.GetManifestResourceStream(resourceName))
                {
                    if (resource == null)
                    {
                        return new byte[0];
                    }

                    using (var memory = new MemoryStream())
                    {
                        resource.CopyTo(memory);
                        return memory.ToArray();
                    }
                }
            });

            return bytes.Length > 0 ? bytes : null;
        }

        private static void WriteFileResponse(Stream stream, byte[] data, string contentType, string rangeHeader)
        {
            long start;
            long end;
            if (TryParseRange(rangeHeader, data.Length, out start, out end))
            {
                var length = end - start + 1;
                var header = BuildHeader(206, "Partial Content", contentType, length, new[]
                {
                    "Content-Range: bytes " + start + "-" + end + "/" + data.Length,
                    "Accept-Ranges: bytes"
                });

                WriteAscii(stream, header);
                stream.Write(data, (int)start, (int)length);
                return;
            }

            WriteResponse(stream, 200, "OK", contentType, data, new[] { "Accept-Ranges: bytes" });
        }

        private static void WriteResponse(Stream stream, int statusCode, string reason, string contentType, byte[] body, string[] extraHeaders)
        {
            var header = BuildHeader(statusCode, reason, contentType, body.Length, extraHeaders);
            WriteAscii(stream, header);
            stream.Write(body, 0, body.Length);
        }

        private static string BuildHeader(int statusCode, string reason, string contentType, long contentLength, string[] extraHeaders)
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

            var range = rangeHeader.Substring("bytes=".Length).Split(new[] { ',' }, 2)[0].Trim();
            var parts = range.Split(new[] { '-' }, 2);
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
}
