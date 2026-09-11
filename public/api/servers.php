<?php

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: public, max-age=5, stale-while-revalidate=20');
header('X-Content-Type-Options: nosniff');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
    http_response_code(405);
    header('Allow: GET');
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

$secretFile = dirname(__DIR__, 2) . '/wardogs-secrets.php';

if (!is_file($secretFile)) {
    http_response_code(503);
    echo json_encode([
        'error' => 'WARDOGS server API is not configured',
        'setup' => 'Upload wardogs-secrets.php one level above the www directory.',
    ]);
    exit;
}

$config = require $secretFile;

if (!is_array($config) || !isset($config['servers']) || !is_array($config['servers'])) {
    http_response_code(500);
    echo json_encode(['error' => 'WARDOGS server configuration is invalid']);
    exit;
}

$cacheSeconds = max(5, (int)($config['cache_seconds'] ?? 15));
$defaultRegion = (string)($config['region'] ?? 'Europe / UK');

function safeNumber($value): ?float
{
    return is_numeric($value) ? (float)$value : null;
}

function displayNumber(?float $value)
{
    if ($value === null) return null;
    return floor($value) === $value ? (int)$value : $value;
}

function modeFromExperiences(array $experiences): string
{
    $modes = [];

    foreach ($experiences as $experience) {
        $value = trim((string)$experience);
        if ($value === '') continue;

        if (preg_match('/_([A-Za-z0-9]+)_\d+$/', $value, $matches)) {
            $mode = strtoupper($matches[1]);
        } else {
            $mode = $value;
        }

        if (!in_array($mode, $modes, true)) $modes[] = $mode;
    }

    return $modes ? implode(' + ', $modes) : 'WARDOGS';
}

function factionScores($rows): array
{
    $scores = [
        'valkyra' => null,
        'lonestar' => null,
        'manticore' => null,
    ];

    if (!is_array($rows)) return $scores;

    foreach ($rows as $row) {
        if (!is_array($row)) continue;

        $name = strtolower(trim((string)($row['name'] ?? '')));
        $score = safeNumber($row['score'] ?? null);
        if ($score === null) continue;

        if (str_contains($name, 'valkyra')) $scores['valkyra'] = displayNumber($score);
        elseif (str_contains($name, 'lonestar')) $scores['lonestar'] = displayNumber($score);
        elseif (str_contains($name, 'manticore')) $scores['manticore'] = displayNumber($score);
    }

    return $scores;
}

function cacheFileFor(string $url): string
{
    return rtrim(sys_get_temp_dir(), DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . '44th-wardogs-' . sha1($url) . '.json';
}

function readCachedStatus(string $url, int $cacheSeconds, bool $allowStale = false): ?array
{
    $file = cacheFileFor($url);
    if (!is_file($file)) return null;

    if (!$allowStale && (time() - (int)@filemtime($file)) > $cacheSeconds) return null;

    $contents = @file_get_contents($file);
    if ($contents === false) return null;

    $decoded = json_decode($contents, true);
    return is_array($decoded) ? $decoded : null;
}

function writeCachedStatus(string $url, array $status): void
{
    @file_put_contents(cacheFileFor($url), json_encode($status), LOCK_EX);
}

function responseStatusFromHeaders(array $headers): int
{
    foreach ($headers as $header) {
        if (preg_match('#^HTTP/\S+\s+(\d{3})#i', (string)$header, $matches)) {
            return (int)$matches[1];
        }
    }
    return 0;
}

function fetchJson(string $url, string $password): array
{
    if (function_exists('curl_init')) {
        $curl = curl_init($url);
        curl_setopt_array($curl, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => 3,
            CURLOPT_TIMEOUT => 6,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_HTTPHEADER => [
                'Accept: application/json',
                'Authorization: Bearer ' . $password,
            ],
        ]);

        $body = curl_exec($curl);
        $status = (int)curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
        $error = curl_error($curl);
        curl_close($curl);

        if ($body === false || $error !== '') {
            throw new RuntimeException('RCON network request failed');
        }

        if ($status < 200 || $status >= 300) {
            throw new RuntimeException('RCON returned HTTP ' . $status);
        }

        $decoded = json_decode((string)$body, true);
        if (!is_array($decoded)) throw new RuntimeException('RCON returned invalid JSON');
        return $decoded;
    }

    $context = stream_context_create([
        'http' => [
            'method' => 'GET',
            'header' => "Accept: application/json\r\nAuthorization: Bearer {$password}\r\n",
            'timeout' => 6,
            'ignore_errors' => true,
        ],
    ]);

    $body = @file_get_contents($url, false, $context);
    $headers = isset($http_response_header) && is_array($http_response_header) ? $http_response_header : [];
    $status = responseStatusFromHeaders($headers);

    if ($body === false) throw new RuntimeException('RCON network request failed');
    if ($status < 200 || $status >= 300) throw new RuntimeException('RCON returned HTTP ' . $status);

    $decoded = json_decode((string)$body, true);
    if (!is_array($decoded)) throw new RuntimeException('RCON returned invalid JSON');
    return $decoded;
}

function fallbackServer(array $server, string $region): array
{
    $maxPlayers = (int)($server['maxPlayers'] ?? 100);

    return [
        'id' => (string)($server['id'] ?? 'wardogs-server'),
        'joinId' => isset($server['joinId']) ? (string)$server['joinId'] : null,
        'name' => (string)($server['name'] ?? '44th Commando Regiment — WARDOGS'),
        'status' => 'Unavailable',
        'region' => (string)($server['region'] ?? $region),
        'players' => '— / ' . $maxPlayers,
        'playerCount' => null,
        'maxPlayers' => $maxPlayers,
        'map' => '—',
        'mode' => 'WARDOGS',
        'scores' => ['valkyra' => null, 'lonestar' => null, 'manticore' => null],
        'scoreAvailable' => false,
        'provider' => 'WARDOGS RCON',
        'address' => '',
        'notes' => 'Live server data is temporarily unavailable. The website will retry automatically.',
    ];
}

function publicServerFromStatus(array $server, array $status, string $region, bool $stale = false): array
{
    $players = is_array($status['players'] ?? null) ? $status['players'] : [];
    $currentPlayers = safeNumber($players['current'] ?? null);
    $maxPlayers = safeNumber($players['max'] ?? ($server['maxPlayers'] ?? 100));
    $experiences = is_array($status['experiences'] ?? null) ? array_values(array_filter(array_map('strval', $status['experiences']))) : [];
    $scores = factionScores($status['factionScores'] ?? []);
    $currentDisplay = $currentPlayers === null ? '—' : (string)displayNumber($currentPlayers);
    $maxDisplay = $maxPlayers === null ? '—' : (string)displayNumber($maxPlayers);

    return [
        'id' => (string)($server['id'] ?? 'wardogs-server'),
        'joinId' => isset($server['joinId']) ? (string)$server['joinId'] : null,
        'name' => (string)($status['serverName'] ?? $server['name'] ?? '44th Commando Regiment — WARDOGS'),
        'status' => $stale ? 'Online*' : 'Online',
        'region' => (string)($server['region'] ?? $region),
        'players' => $currentDisplay . ' / ' . $maxDisplay,
        'playerCount' => displayNumber($currentPlayers),
        'maxPlayers' => displayNumber($maxPlayers),
        'map' => (string)($status['map'] ?? '—'),
        'mode' => modeFromExperiences($experiences),
        'experiences' => $experiences,
        'lighting' => $status['lighting'] ?? null,
        'matchSeconds' => displayNumber(safeNumber($status['matchSeconds'] ?? null)),
        'scoreCap' => displayNumber(safeNumber($status['scoreCap'] ?? null)),
        'scoreTick' => is_array($status['scoreTick'] ?? null) ? $status['scoreTick'] : null,
        'scores' => $scores,
        'factionScores' => is_array($status['factionScores'] ?? null) ? $status['factionScores'] : [],
        'scoreAvailable' => count(array_filter($scores, static fn($value) => $value !== null)) > 0,
        'rotation' => is_array($status['rotation'] ?? null) ? $status['rotation'] : null,
        'provider' => 'WARDOGS RCON',
        'address' => '',
        'notes' => $stale
            ? 'Showing the last known WARDOGS match status while the live RCON endpoint reconnects.'
            : 'Live match data supplied directly by the WARDOGS RCON API.',
        'updatedAt' => gmdate('c'),
    ];
}

function loadServer(array $server, string $region, int $cacheSeconds): array
{
    $baseUrl = rtrim((string)($server['url'] ?? ''), '/');
    $password = (string)($server['password'] ?? '');

    if ($baseUrl === '' || $password === '' || str_contains($password, 'CHANGE_ME')) {
        return fallbackServer($server, $region);
    }

    $statusUrl = $baseUrl . '/v1/status';
    $status = readCachedStatus($statusUrl, $cacheSeconds);

    if ($status !== null) return publicServerFromStatus($server, $status, $region);

    try {
        $status = fetchJson($statusUrl, $password);
        writeCachedStatus($statusUrl, $status);
        return publicServerFromStatus($server, $status, $region);
    } catch (Throwable $error) {
        error_log('44th WARDOGS RCON status failed for ' . ($server['id'] ?? 'unknown') . ': ' . $error->getMessage());
        $stale = readCachedStatus($statusUrl, $cacheSeconds, true);
        if ($stale !== null) return publicServerFromStatus($server, $stale, $region, true);
        return fallbackServer($server, $region);
    }
}

$servers = [];
foreach ($config['servers'] as $server) {
    if (!is_array($server) || (($server['enabled'] ?? true) === false)) continue;
    $servers[] = loadServer($server, $defaultRegion, $cacheSeconds);
}

if (($config['include_training_server'] ?? true) === true) {
    $servers[] = [
        'id' => 'training-events',
        'name' => '44th Training & Events',
        'status' => 'Planned',
        'region' => $defaultRegion,
        'players' => '—',
        'map' => '—',
        'mode' => 'Events / Training',
        'scores' => null,
        'scoreAvailable' => false,
        'address' => 'Future space for training, events and organised community nights.',
        'notes' => 'Can later show event passwords, whitelisting and restart notices.',
    ];
}

echo json_encode([
    'servers' => $servers,
    'generatedAt' => gmdate('c'),
], JSON_UNESCAPED_SLASHES);
