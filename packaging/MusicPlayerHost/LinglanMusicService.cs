using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

namespace MusicPlayerHost;

internal sealed class LinglanMusicService : IDisposable
{
    private const string DefaultApiBaseUrl = "http://127.0.0.1:3000/";
    private static readonly Uri FallbackSearchEndpoint = new("https://music.163.com/api/search/get/");
    private readonly HttpClient client = new();
    private readonly Uri apiBaseUri;

    public LinglanMusicService()
    {
        client.DefaultRequestHeaders.UserAgent.ParseAdd("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122 Safari/537.36");
        apiBaseUri = GetApiBaseUri();
    }

    public async Task<IReadOnlyList<LinglanTrack>> SearchAsync(string query, CancellationToken cancellationToken)
    {
        var url = new Uri(apiBaseUri, $"search?keywords={Uri.EscapeDataString(query)}&type=1&offset=0&limit=30");
        try
        {
            return await SearchEndpointAsync(url, cancellationToken);
        }
        catch (HttpRequestException)
        {
            var fallbackUrl = new Uri($"{FallbackSearchEndpoint}?s={Uri.EscapeDataString(query)}&type=1&offset=0&limit=30");
            return await SearchEndpointAsync(fallbackUrl, cancellationToken, new Uri("https://music.163.com/"));
        }
    }

    public async Task<IReadOnlyList<LinglanTrack>> GetTracksAsync(IReadOnlyCollection<string> songIds, CancellationToken cancellationToken)
    {
        var ids = string.Join(',', songIds.Where(id => !string.IsNullOrWhiteSpace(id)).Distinct().Take(200));
        if (string.IsNullOrWhiteSpace(ids)) return Array.Empty<LinglanTrack>();

        using var response = await client.GetAsync(new Uri(apiBaseUri, $"song/detail?ids={Uri.EscapeDataString(ids)}"), cancellationToken);
        response.EnsureSuccessStatusCode();
        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
        using var document = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);
        if (!document.RootElement.TryGetProperty("songs", out var songs) || songs.ValueKind != JsonValueKind.Array)
            return Array.Empty<LinglanTrack>();

        return songs.EnumerateArray().Select(ReadTrack).Where(track => track is not null).Cast<LinglanTrack>().ToArray();
    }

    private async Task<IReadOnlyList<LinglanTrack>> SearchEndpointAsync(Uri url, CancellationToken cancellationToken, Uri? referrer = null)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, url);
        request.Headers.Referrer = referrer;
        using var response = await client.SendAsync(request, cancellationToken);
        response.EnsureSuccessStatusCode();
        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
        using var document = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);

        if (!document.RootElement.TryGetProperty("result", out var result)
            || !result.TryGetProperty("songs", out var songs)
            || songs.ValueKind != JsonValueKind.Array)
        {
            return Array.Empty<LinglanTrack>();
        }

        return songs.EnumerateArray()
            .Select(ReadTrack)
            .Where(track => track is not null)
            .Cast<LinglanTrack>()
            .ToArray();
    }

    public async Task<LinglanStream> ResolveStreamAsync(string songId, string quality, CancellationToken cancellationToken)
    {
        var level = quality switch
        {
            "128k" => "standard",
            "192k" => "higher",
            "320k" => "exhigh",
            _ => "exhigh"
        };
        var url = new Uri(apiBaseUri, $"song/url/v1?id={Uri.EscapeDataString(songId)}&level={level}");
        using var response = await client.GetAsync(url, cancellationToken);
        response.EnsureSuccessStatusCode();
        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
        using var document = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);
        var root = document.RootElement;
        if (root.TryGetProperty("code", out var code) && code.GetInt32() != 200)
        {
            throw new InvalidOperationException("Netease API returned an error");
        }
        if (!root.TryGetProperty("data", out var data) || data.ValueKind != JsonValueKind.Array || data.GetArrayLength() == 0)
        {
            throw new InvalidOperationException("Netease API returned no stream data");
        }
        var track = data[0];
        var streamUrl = ReadString(track, "url");
        if (string.IsNullOrWhiteSpace(streamUrl)) throw new InvalidOperationException("Netease API returned no stream URL");

        var duration = track.TryGetProperty("time", out var timeElement) && timeElement.TryGetInt64(out var milliseconds)
            ? Math.Max(0, milliseconds / 1000d)
            : 0;
        var isPreview = track.TryGetProperty("freeTrialInfo", out var trialInfo)
            && trialInfo.ValueKind == JsonValueKind.Object;

        return new LinglanStream(streamUrl, duration, isPreview);
    }

    private static Uri GetApiBaseUri()
    {
        var configuredUrl = Environment.GetEnvironmentVariable("STARFILE_NETEASE_API_URL");
        var apiUrl = string.IsNullOrWhiteSpace(configuredUrl) ? DefaultApiBaseUrl : configuredUrl.Trim();
        if (!Uri.TryCreate(apiUrl.EndsWith('/') ? apiUrl : apiUrl + "/", UriKind.Absolute, out var uri)
            || (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps))
        {
            throw new InvalidOperationException("STARFILE_NETEASE_API_URL must be an HTTP or HTTPS URL.");
        }

        return uri;
    }

    private static LinglanTrack? ReadTrack(JsonElement song)
    {
        if (!song.TryGetProperty("id", out var id)) return null;
        var title = ReadString(song, "name");
        if (string.IsNullOrWhiteSpace(title)) return null;
        var hasArtists = song.TryGetProperty("artists", out var artistList) || song.TryGetProperty("ar", out artistList);
        var artists = hasArtists && artistList.ValueKind == JsonValueKind.Array
            ? string.Join(", ", artistList.EnumerateArray().Select(item => ReadString(item, "name")).Where(name => !string.IsNullOrWhiteSpace(name)))
            : "未知歌手";
        var hasAlbum = song.TryGetProperty("album", out var albumElement) || song.TryGetProperty("al", out albumElement);
        var album = hasAlbum ? ReadString(albumElement, "name") : "";
        var cover = hasAlbum ? ReadString(albumElement, "picUrl") : "";
        var hasDuration = song.TryGetProperty("duration", out var durationElement) || song.TryGetProperty("dt", out durationElement);
        var duration = hasDuration && durationElement.TryGetInt64(out var milliseconds)
            ? Math.Max(0, milliseconds / 1000)
            : 0;
        return new LinglanTrack(id.ToString(), title, artists, album, cover, duration);
    }

    private static string ReadString(JsonElement element, string name) =>
        element.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString() ?? string.Empty : string.Empty;

    public void Dispose() => client.Dispose();
}

internal sealed record LinglanTrack(string Id, string Title, string Artist, string Album, string Cover, long Duration);
internal sealed record LinglanStream(string Url, double Duration, bool IsPreview);
