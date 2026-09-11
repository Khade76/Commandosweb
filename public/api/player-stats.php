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

$secretFile = dirname(__DIR__, 2) . '/wardogs-secrets.php';

if (!is_file($secretFile)) {
    http_response_code(503);
    echo json_encode(['error' => 'Player stats API is not configured']);
    exit;
}

$config = require $secretFile;
$baseUrl = is_array($config) ? rtrim((string)($config['stats_api_url'] ?? ''), '/') : '';

if ($baseUrl === '') {
    http_response_code(503);
    echo json_encode([
        'error' => 'Player stats API is not configured',
        'setup' => 'Set stats_api_url in wardogs-secrets.php after the VPS service is online.',
    ]);
    exit;
}

$allowedSorts = ['kills', 'deaths', 'kd', 'time', 'matches', 'lastSeen', 'name'];
$allowedGroups = ['normal', 'hardcore'];
$query = [];

if (isset($_GET['search']) && trim((string)$_GET['search']) !== '') {
    $query['search'] = substr(trim((string)$_GET['search']), 0, 80);
}

$sort = isset($_GET['sort']) ? (string)$_GET['sort'] : 'kills';
$query['sort'] = in_array($sort, $allowedSorts, true) ? $sort : 'kills';

$group = isset($_GET['group']) ? strtolower((string)$_GET['group']) : 'normal';
$query['group'] = in_array($group, $allowedGroups, true) ? $group : 'normal';

$query['limit'] = min(500, max(1, (int)($_GET['limit'] ?? 100)));
$query['offset'] = min(100000, max(0, (int)($_GET['offset'] ?? 0)));

$url = $baseUrl . '/api/stats/players?' . http_build_query($query);

function proxyFetch(string $url): array
{
    if (function_exists('curl_init')) {
        $curl = curl_init($url);
        curl_setopt_array($curl, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => 3,
            CURLOPT_TIMEOUT => 8,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_HTTPHEADER => ['Accept: application/json'],
        ]);

        $body = curl_exec($curl);
        $status = (int)curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
        $error = curl_error($curl);
        curl_close($curl);

        if ($body === false || $error !== '') throw new RuntimeException('Stats service network request failed');
        return [$status, (string)$body];
    }

    $context = stream_context_create([
        'http' => [
            'method' => 'GET',
            'header' => "Accept: application/json\r\n",
            'timeout' => 8,
            'ignore_errors' => true,
        ],
    ]);

    $body = @file_get_contents($url, false, $context);
    if ($body === false) throw new RuntimeException('Stats service network request failed');

    $status = 200;
    foreach (($http_response_header ?? []) as $header) {
        if (preg_match('#^HTTP/\S+\s+(\d{3})#i', (string)$header, $matches)) {
            $status = (int)$matches[1];
            break;
        }
    }

    return [$status, (string)$body];
}

try {
    [$status, $body] = proxyFetch($url);
    http_response_code($status >= 100 ? $status : 502);
    echo $body;
} catch (Throwable $error) {
    error_log('44th player stats proxy failed: ' . $error->getMessage());
    http_response_code(502);
    echo json_encode(['error' => 'Player stats service is temporarily unavailable']);
}
