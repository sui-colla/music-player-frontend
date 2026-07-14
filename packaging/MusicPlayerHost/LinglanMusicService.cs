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
    private static readonly Uri SearchEndpoint = new("https://music.163.com/api/search/get/");
    private static readonly Uri ResolverEndpoint = new("https://source.shiqianjiang.cn/api/music/url");
    private readonly HttpClient client = new();

    public LinglanMusicService()
    {
        client.DefaultRequestHeaders.UserAgent.ParseAdd("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122 Safari/537.36");
        client.DefaultRequestHeaders.Referrer = new Uri("https://music.163.com/");
    }

    public async Task<IReadOnlyList<LinglanTrack>> SearchAsync(string query, CancellationToken cancellationToken)
    {
        var url = $"{SearchEndpoint}?s={Uri.EscapeDataString(query)}&type=1&offset=0&limit=30";
        using var response = await client.GetAsync(url, cancellationToken);
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

    public async Task<string> ResolveStreamAsync(string songId, string apiKey, string quality, CancellationToken cancellationToken)
    {
        var url = $"{ResolverEndpoint}?source=wy&songId={Uri.EscapeDataString(songId)}&quality={Uri.EscapeDataString(quality)}";
        using var request = new HttpRequestMessage(HttpMethod.Get, url);
        request.Headers.Add("X-API-Key", apiKey);
        using var response = await client.SendAsync(request, cancellationToken);
        response.EnsureSuccessStatusCode();
        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
        using var document = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);
        var root = document.RootElement;
        if (root.TryGetProperty("code", out var code) && code.GetInt32() != 200)
        {
            throw new InvalidOperationException("Resolver returned an error");
        }
        if (!root.TryGetProperty("url", out var urlElement) || string.IsNullOrWhiteSpace(urlElement.GetString()))
        {
            throw new InvalidOperationException("Resolver returned no stream URL");
        }

        return urlElement.GetString()!;
    }

    private static LinglanTrack? ReadTrack(JsonElement song)
    {
        if (!song.TryGetProperty("id", out var id)) return null;
        var title = ReadString(song, "name");
        if (string.IsNullOrWhiteSpace(title)) return null;
        var artists = song.TryGetProperty("artists", out var artistList) && artistList.ValueKind == JsonValueKind.Array
            ? string.Join(", ", artistList.EnumerateArray().Select(item => ReadString(item, "name")).Where(name => !string.IsNullOrWhiteSpace(name)))
            : "未知歌手";
        var album = song.TryGetProperty("album", out var albumElement) ? ReadString(albumElement, "name") : "";
        var cover = song.TryGetProperty("album", out albumElement) ? ReadString(albumElement, "picUrl") : "";
        var duration = song.TryGetProperty("duration", out var durationElement) && durationElement.TryGetInt64(out var milliseconds)
            ? Math.Max(0, milliseconds / 1000)
            : 0;
        return new LinglanTrack(id.ToString(), title, artists, album, cover, duration);
    }

    private static string ReadString(JsonElement element, string name) =>
        element.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString() ?? string.Empty : string.Empty;

    public void Dispose() => client.Dispose();
}

internal sealed record LinglanTrack(string Id, string Title, string Artist, string Album, string Cover, long Duration);
