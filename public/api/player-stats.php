<?php

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
    http_response_code(405);
    header('Allow: GET');
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

require_once __DIR__ . '/stats-db.php';
require_once __DIR__ . '/stats-grouping.php';

$allowedSorts = ['kills', 'deaths', 'kd', 'time', 'matches', 'lastSeen', 'name'];
$allowedGroups = ['normal', 'hardcore'];

$search = isset($_GET['search']) ? substr(trim((string)$_GET['search']), 0, 80) : '';
$sort = isset($_GET['sort']) ? (string)$_GET['sort'] : 'kills';
if (!in_array($sort, $allowedSorts, true)) $sort = 'kills';
$group = isset($_GET['group']) ? strtolower((string)$_GET['group']) : 'normal';
if (!in_array($group, $allowedGroups, true)) $group = 'normal';
$limit = min(500, max(1, (int)($_GET['limit'] ?? 100)));
$offset = min(100000, max(0, (int)($_GET['offset'] ?? 0)));

function wardogsWarconStatsFetch(array $config, array $query): ?array
{
    $warcon = is_array($config['warcon'] ?? null) ? $config['warcon'] : [];
    $enabled = strtolower(trim((string)($config['stats_source'] ?? ''))) === 'warcon';
    if (!$enabled) return null;

    $baseUrl = rtrim(trim((string)($warcon['url'] ?? '')), '/');
    $apiKey = trim((string)($warcon['stats_api_key'] ?? ''));
    if ($baseUrl === '' || $apiKey === '') {
        throw new RuntimeException('WARCON stats source is selected but warcon.url or warcon.stats_api_key is missing');
    }

    $url = $baseUrl . '/api/public/player-stats?' . http_build_query($query);

    if (function_exists('curl_init')) {
        $curl = curl_init($url);
        curl_setopt_array($curl, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => 4,
            CURLOPT_TIMEOUT => 12,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_HTTPHEADER => [
                'Accept: application/json',
                'Authorization: Bearer ' . $apiKey,
            ],
        ]);
        $body = curl_exec($curl);
        $status = (int)curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
        $error = curl_error($curl);
        curl_close($curl);
        if ($body === false || $error !== '') throw new RuntimeException('WARCON stats request failed');
    } else {
        $context = stream_context_create([
            'http' => [
                'method' => 'GET',
                'header' => "Accept: application/json\r\nAuthorization: Bearer {$apiKey}\r\n",
                'timeout' => 12,
                'ignore_errors' => true,
            ],
        ]);
        $body = @file_get_contents($url, false, $context);
        if ($body === false) throw new RuntimeException('WARCON stats request failed');
        $status = 0;
        foreach (($http_response_header ?? []) as $header) {
            if (preg_match('#^HTTP/\S+\s+(\d{3})#i', (string)$header, $matches)) {
                $status = (int)$matches[1];
                break;
            }
        }
    }

    $payload = json_decode((string)$body, true);
    if ($status < 200 || $status >= 300) {
        $message = is_array($payload)
            ? (string)($payload['error']['message'] ?? $payload['error'] ?? ('HTTP ' . $status))
            : ('HTTP ' . $status);
        throw new RuntimeException('WARCON stats returned ' . $message);
    }
    if (!is_array($payload) || !isset($payload['players']) || !is_array($payload['players'])) {
        throw new RuntimeException('WARCON stats returned invalid JSON');
    }

    return $payload;
}

try {
    $config = wardogsStatsConfig();
    $query = [
        'group' => $group,
        'sort' => $sort,
        'limit' => $limit,
        'offset' => $offset,
    ];
    if ($search !== '') $query['search'] = $search;

    $warconPayload = wardogsWarconStatsFetch($config, $query);
    if ($warconPayload !== null) {
        header('X-44th-Stats-Source: warcon');
        echo json_encode($warconPayload, JSON_UNESCAPED_SLASHES);
        exit;
    }

    // Temporary fallback while WARCON public stats is being deployed.
    $pdo = wardogsStatsPdo($config);
    wardogsStatsMaybeCollectDynamic($pdo, $config);
    $result = wardogsStatsPlayers($pdo, [
        'group' => $group,
        'search' => $search,
        'sort' => $sort,
        'limit' => $limit,
        'offset' => $offset,
    ]);
    $payload = array_merge($result, [
        'summary' => wardogsStatsSummary($pdo, $group),
        'source' => 'mariadb-fallback',
        'generatedAt' => gmdate('c'),
    ]);
    header('X-44th-Stats-Source: mariadb-fallback');
    echo json_encode($payload, JSON_UNESCAPED_SLASHES);
} catch (Throwable $error) {
    error_log('44th player stats failed: ' . $error->getMessage());
    http_response_code(503);
    echo json_encode(['error' => 'Player stats are temporarily unavailable']);
}
