using System;
using System.Buffers;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Reflection;
using System.Security.Cryptography;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading;
using System.Threading.Tasks;

namespace MusicPlayerHost;

internal sealed record UpdateRelease(
    string Version,
    string Name,
    string Notes,
    string ReleaseUrl,
    string? InstallerUrl,
    long InstallerSize,
    string? Sha256);

internal sealed record UpdateCheckResult(bool IsUpdateAvailable, UpdateRelease? Release);

internal sealed class UpdateService
{
    private const string RepositoryPath = "/sui-colla/music-player-frontend";
    private const string PreferredInstallerName = "StarFileSetup.exe";
    private static readonly Uri LatestReleaseApiUri = new(
        "https://api.github.com/repos/sui-colla/music-player-frontend/releases/latest");
    private static readonly HttpClient SharedHttpClient = CreateHttpClient();

    private readonly HttpClient httpClient;
    private readonly Version comparableCurrentVersion;

    public UpdateService(HttpClient? httpClient = null, string? currentVersion = null)
    {
        this.httpClient = httpClient ?? SharedHttpClient;
        CurrentVersion = NormalizeVersion(currentVersion ?? ReadCurrentVersion());
        comparableCurrentVersion = ParseComparableVersion(CurrentVersion);
    }

    public string CurrentVersion { get; }

    public UpdateRelease? AvailableRelease { get; private set; }

    public async Task<UpdateCheckResult> CheckAsync(CancellationToken cancellationToken)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, LatestReleaseApiUri);
        AddCommonHeaders(request);
        request.Headers.Accept.ParseAdd("application/vnd.github+json");
        request.Headers.TryAddWithoutValidation("X-GitHub-Api-Version", "2022-11-28");

        using var response = await httpClient.SendAsync(
            request,
            HttpCompletionOption.ResponseHeadersRead,
            cancellationToken).ConfigureAwait(false);
        response.EnsureSuccessStatusCode();

        await using var content = await response.Content.ReadAsStreamAsync(cancellationToken).ConfigureAwait(false);
        var githubRelease = await JsonSerializer.DeserializeAsync<GitHubRelease>(
            content,
            cancellationToken: cancellationToken).ConfigureAwait(false)
            ?? throw new InvalidDataException("GitHub returned an empty release response.");

        var release = CreateRelease(githubRelease);
        var isUpdateAvailable = ParseComparableVersion(release.Version) > comparableCurrentVersion;
        AvailableRelease = isUpdateAvailable ? release : null;

        return new UpdateCheckResult(isUpdateAvailable, release);
    }

    public async Task<string> DownloadInstallerAsync(
        UpdateRelease release,
        IProgress<int> progress,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(release);
        ArgumentNullException.ThrowIfNull(progress);

        if (string.IsNullOrWhiteSpace(release.InstallerUrl))
        {
            throw new InvalidOperationException("This release does not contain a Windows installer.");
        }

        if (release.InstallerSize <= 0)
        {
            throw new InvalidDataException("The installer asset size is missing or invalid.");
        }

        var installerUri = ValidateInstallerUri(release.InstallerUrl);
        var expectedSha256 = ParseExpectedSha256(release.Sha256)
            ?? throw new InvalidDataException("The installer SHA-256 digest is required.");
        var downloadDirectory = Path.Combine(
            Path.GetTempPath(),
            "StarFiLe",
            "Updates",
            Guid.NewGuid().ToString("N"));
        var partialPath = Path.Combine(downloadDirectory, PreferredInstallerName + ".download");
        var installerPath = Path.Combine(downloadDirectory, PreferredInstallerName);

        Directory.CreateDirectory(downloadDirectory);
        progress.Report(0);

        try
        {
            using var request = new HttpRequestMessage(HttpMethod.Get, installerUri);
            AddCommonHeaders(request);
            request.Headers.Accept.ParseAdd("application/octet-stream");

            using var response = await httpClient.SendAsync(
                request,
                HttpCompletionOption.ResponseHeadersRead,
                cancellationToken).ConfigureAwait(false);
            response.EnsureSuccessStatusCode();

            if (response.RequestMessage?.RequestUri is not { } finalUri)
            {
                throw new InvalidDataException("The installer response did not include a final URL.");
            }

            ValidateGitHubUri(finalUri, requireRepositoryDownloadPath: false);

            if (response.Content.Headers.ContentLength is long contentLength
                && contentLength != release.InstallerSize)
            {
                throw new InvalidDataException(
                    $"Installer size mismatch. Expected {release.InstallerSize} bytes, received {contentLength} bytes.");
            }

            await DownloadToFileAsync(
                response,
                partialPath,
                release.InstallerSize,
                expectedSha256,
                progress,
                cancellationToken).ConfigureAwait(false);

            File.Move(partialPath, installerPath);
            progress.Report(100);
            return installerPath;
        }
        catch
        {
            TryDelete(partialPath);
            TryDelete(installerPath);
            TryDeleteDirectory(downloadDirectory);
            throw;
        }
    }

    private static async Task DownloadToFileAsync(
        HttpResponseMessage response,
        string destinationPath,
        long expectedSize,
        byte[]? expectedSha256,
        IProgress<int> progress,
        CancellationToken cancellationToken)
    {
        await using var source = await response.Content.ReadAsStreamAsync(cancellationToken).ConfigureAwait(false);
        await using var destination = new FileStream(
            destinationPath,
            FileMode.CreateNew,
            FileAccess.Write,
            FileShare.None,
            bufferSize: 81920,
            FileOptions.Asynchronous | FileOptions.SequentialScan);
        using var sha256 = expectedSha256 is null
            ? null
            : IncrementalHash.CreateHash(HashAlgorithmName.SHA256);

        var buffer = ArrayPool<byte>.Shared.Rent(81920);
        long downloaded = 0;
        var lastProgress = 0;

        try
        {
            while (true)
            {
                var bytesRead = await source.ReadAsync(buffer.AsMemory(0, buffer.Length), cancellationToken)
                    .ConfigureAwait(false);
                if (bytesRead == 0)
                {
                    break;
                }

                downloaded = checked(downloaded + bytesRead);
                if (downloaded > expectedSize)
                {
                    throw new InvalidDataException(
                        $"Installer size mismatch. Expected {expectedSize} bytes, received more data.");
                }

                await destination.WriteAsync(buffer.AsMemory(0, bytesRead), cancellationToken).ConfigureAwait(false);
                sha256?.AppendData(buffer, 0, bytesRead);

                var currentProgress = Math.Min(99, (int)(downloaded * 100d / expectedSize));
                if (currentProgress > lastProgress)
                {
                    lastProgress = currentProgress;
                    progress.Report(currentProgress);
                }
            }

            await destination.FlushAsync(cancellationToken).ConfigureAwait(false);
        }
        finally
        {
            ArrayPool<byte>.Shared.Return(buffer);
        }

        if (downloaded != expectedSize)
        {
            throw new InvalidDataException(
                $"Installer size mismatch. Expected {expectedSize} bytes, received {downloaded} bytes.");
        }

        if (expectedSha256 is not null)
        {
            var actualSha256 = sha256!.GetHashAndReset();
            if (!CryptographicOperations.FixedTimeEquals(actualSha256, expectedSha256))
            {
                throw new InvalidDataException("Installer SHA-256 validation failed.");
            }
        }
    }

    private static UpdateRelease CreateRelease(GitHubRelease githubRelease)
    {
        if (string.IsNullOrWhiteSpace(githubRelease.TagName))
        {
            throw new InvalidDataException("The latest GitHub release does not contain a tag name.");
        }

        if (string.IsNullOrWhiteSpace(githubRelease.HtmlUrl))
        {
            throw new InvalidDataException("The latest GitHub release does not contain a release URL.");
        }

        var version = NormalizeVersion(githubRelease.TagName);
        _ = ParseComparableVersion(version);
        var releaseUri = ValidateReleaseUri(githubRelease.HtmlUrl);
        var installer = SelectInstaller(githubRelease.Assets);

        string? installerUrl = null;
        long installerSize = 0;
        string? sha256 = null;

        if (installer is not null)
        {
            var downloadUrl = !string.IsNullOrWhiteSpace(installer.ApiUrl)
                ? installer.ApiUrl
                : installer.BrowserDownloadUrl;

            if (string.IsNullOrWhiteSpace(downloadUrl))
            {
                throw new InvalidDataException("The installer asset does not contain a download URL.");
            }

            if (installer.Size <= 0)
            {
                throw new InvalidDataException("The installer asset size is missing or invalid.");
            }

            sha256 = NormalizeApiDigest(installer.Digest);
            if (sha256 is not null)
            {
                installerUrl = ValidateInstallerUri(downloadUrl).AbsoluteUri;
                installerSize = installer.Size;
            }
        }

        return new UpdateRelease(
            version,
            string.IsNullOrWhiteSpace(githubRelease.Name) ? githubRelease.TagName : githubRelease.Name.Trim(),
            githubRelease.Body ?? string.Empty,
            releaseUri.AbsoluteUri,
            installerUrl,
            installerSize,
            sha256);
    }

    private static GitHubAsset? SelectInstaller(IReadOnlyCollection<GitHubAsset>? assets)
    {
        if (assets is null || assets.Count == 0)
        {
            return null;
        }

        return assets.FirstOrDefault(asset =>
            string.Equals(asset.Name, PreferredInstallerName, StringComparison.OrdinalIgnoreCase));
    }

    private static string ReadCurrentVersion()
    {
        var assembly = Assembly.GetEntryAssembly() ?? typeof(UpdateService).Assembly;
        var informationalVersion = assembly
            .GetCustomAttribute<AssemblyInformationalVersionAttribute>()?
            .InformationalVersion;

        if (!string.IsNullOrWhiteSpace(informationalVersion))
        {
            return informationalVersion;
        }

        return assembly.GetName().Version?.ToString() ?? "0.0.0";
    }

    private static string NormalizeVersion(string version)
    {
        if (string.IsNullOrWhiteSpace(version))
        {
            throw new FormatException("A version value is required.");
        }

        var normalized = version.Trim();
        if (normalized.StartsWith('v') || normalized.StartsWith('V'))
        {
            normalized = normalized[1..];
        }

        var metadataIndex = normalized.IndexOf('+');
        if (metadataIndex >= 0)
        {
            normalized = normalized[..metadataIndex];
        }

        if (!Version.TryParse(normalized, out _))
        {
            throw new FormatException($"Version '{version}' is not a valid numeric version.");
        }

        return normalized;
    }

    private static Version ParseComparableVersion(string version)
    {
        if (!Version.TryParse(version, out var parsed))
        {
            throw new FormatException($"Version '{version}' is not a valid numeric version.");
        }

        return new Version(
            parsed.Major,
            parsed.Minor,
            Math.Max(0, parsed.Build),
            Math.Max(0, parsed.Revision));
    }

    private static string? NormalizeApiDigest(string? digest)
    {
        if (string.IsNullOrWhiteSpace(digest))
        {
            return null;
        }

        const string prefix = "sha256:";
        if (!digest.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
        {
            return null;
        }

        var bytes = ParseSha256Hex(digest[prefix.Length..]);
        return Convert.ToHexString(bytes).ToLowerInvariant();
    }

    private static byte[]? ParseExpectedSha256(string? sha256)
    {
        if (string.IsNullOrWhiteSpace(sha256))
        {
            return null;
        }

        const string prefix = "sha256:";
        var value = sha256.StartsWith(prefix, StringComparison.OrdinalIgnoreCase)
            ? sha256[prefix.Length..]
            : sha256;
        return ParseSha256Hex(value);
    }

    private static byte[] ParseSha256Hex(string value)
    {
        if (value.Length != 64 || value.Any(character => !Uri.IsHexDigit(character)))
        {
            throw new InvalidDataException("The installer SHA-256 digest is invalid.");
        }

        return Convert.FromHexString(value);
    }

    private static Uri ValidateReleaseUri(string value)
    {
        var uri = ParseAbsoluteUri(value);
        ValidateGitHubUri(uri, requireRepositoryDownloadPath: false);

        if (!uri.IdnHost.Equals("github.com", StringComparison.OrdinalIgnoreCase)
            || !uri.AbsolutePath.StartsWith(RepositoryPath + "/releases", StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidDataException("The release URL is not a valid URL for the configured GitHub repository.");
        }

        return uri;
    }

    private static Uri ValidateInstallerUri(string value)
    {
        var uri = ParseAbsoluteUri(value);
        ValidateGitHubUri(uri, requireRepositoryDownloadPath: false);

        var isBrowserDownload = uri.IdnHost.Equals("github.com", StringComparison.OrdinalIgnoreCase)
                                && uri.AbsolutePath.StartsWith(
                                    RepositoryPath + "/releases/download/",
                                    StringComparison.OrdinalIgnoreCase);
        var isAssetApiDownload = uri.IdnHost.Equals("api.github.com", StringComparison.OrdinalIgnoreCase)
                                 && uri.AbsolutePath.StartsWith(
                                     "/repos" + RepositoryPath + "/releases/assets/",
                                     StringComparison.OrdinalIgnoreCase);
        if (!isBrowserDownload && !isAssetApiDownload)
        {
            throw new InvalidDataException("The installer URL is not a release asset for the configured GitHub repository.");
        }

        return uri;
    }

    private static Uri ParseAbsoluteUri(string value)
    {
        if (!Uri.TryCreate(value, UriKind.Absolute, out var uri))
        {
            throw new InvalidDataException("The GitHub URL is invalid.");
        }

        return uri;
    }

    private static void ValidateGitHubUri(Uri uri, bool requireRepositoryDownloadPath)
    {
        if (!uri.Scheme.Equals(Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase)
            || !uri.IsDefaultPort
            || !string.IsNullOrEmpty(uri.UserInfo))
        {
            throw new InvalidDataException("Only standard HTTPS GitHub URLs are allowed.");
        }

        var host = uri.IdnHost;
        var isGitHubHost = host.Equals("github.com", StringComparison.OrdinalIgnoreCase)
                           || host.Equals("api.github.com", StringComparison.OrdinalIgnoreCase)
                           || host.EndsWith(".githubusercontent.com", StringComparison.OrdinalIgnoreCase);
        if (!isGitHubHost)
        {
            throw new InvalidDataException("The URL does not point to GitHub.");
        }

        if (requireRepositoryDownloadPath
            && (!host.Equals("github.com", StringComparison.OrdinalIgnoreCase)
                || !uri.AbsolutePath.StartsWith(
                    RepositoryPath + "/releases/download/",
                    StringComparison.OrdinalIgnoreCase)))
        {
            throw new InvalidDataException("The installer URL is not a release asset for the configured GitHub repository.");
        }
    }

    private static void AddCommonHeaders(HttpRequestMessage request)
    {
        request.Headers.TryAddWithoutValidation("User-Agent", "StarFiLe-MusicPlayer-Updater");
    }

    private static HttpClient CreateHttpClient()
    {
        var handler = new SocketsHttpHandler
        {
            AutomaticDecompression = DecompressionMethods.All,
            PooledConnectionLifetime = TimeSpan.FromMinutes(10)
        };

        return new HttpClient(handler)
        {
            Timeout = TimeSpan.FromMinutes(15)
        };
    }

    private static void TryDelete(string path)
    {
        try
        {
            File.Delete(path);
        }
        catch
        {
            // Preserve the original download error.
        }
    }

    private static void TryDeleteDirectory(string path)
    {
        try
        {
            Directory.Delete(path, recursive: false);
        }
        catch
        {
            // Preserve the original download error.
        }
    }

    private sealed class GitHubRelease
    {
        [JsonPropertyName("tag_name")]
        public string? TagName { get; init; }

        [JsonPropertyName("name")]
        public string? Name { get; init; }

        [JsonPropertyName("body")]
        public string? Body { get; init; }

        [JsonPropertyName("html_url")]
        public string? HtmlUrl { get; init; }

        [JsonPropertyName("assets")]
        public List<GitHubAsset>? Assets { get; init; }
    }

    private sealed class GitHubAsset
    {
        [JsonPropertyName("url")]
        public string? ApiUrl { get; init; }

        [JsonPropertyName("name")]
        public string? Name { get; init; }

        [JsonPropertyName("browser_download_url")]
        public string? BrowserDownloadUrl { get; init; }

        [JsonPropertyName("size")]
        public long Size { get; init; }

        [JsonPropertyName("digest")]
        public string? Digest { get; init; }
    }
}
