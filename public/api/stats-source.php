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
    echo json_encode(['error' => 'WARDOGS server API is not configured']);
    exit;
}

$config = require $secretFile;
if (!is_array($config) || !isset($config['servers']) || !is_array($config['servers'])) {
    http_response_code(500);
    echo json_encode(['error' => 'WARDOGS server configuration is invalid']);
    exit;
}

function requestAuthorizationHeader(): string
{
    $header = trim((string)($_SERVER['HTTP_AUTHORIZATION'] ?? ''));
    if ($header !== '') return $header;

    if (function_exists('getallheaders')) {
        foreach (getallheaders() as $name => $value) {
            if (strcasecmp((string)$name, 'Authorization') === 0) return trim((string)$value);
        }
    }

    return '';
}

$expectedToken = trim((string)($config['stats_source_token'] ?? ''));
$authorization = requestAuthorizationHeader();
$providedToken = '';
if (preg_match('/^Bearer\s+(.+)$/i', $authorization, $matches)) {
    $providedToken = trim((string)$matches[1]);
}

if ($expectedToken === '' || $providedToken === '' || !hash_equals($expectedToken, $providedToken)) {
    http_response_code(401);
    header('WWW-Authenticate: Bearer');
    echo json_encode(['error' => 'Unauthorized']);
    exit;
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
            CURLOPT_TIMEOUT => 8,
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

        if ($body === false || $error !== '') throw new RuntimeException('RCON network request failed');
        if ($status < 200 || $status >= 300) throw new RuntimeException('RCON returned HTTP ' . $status);

        $decoded = json_decode((string)$body, true);
        if (!is_array($decoded)) throw new RuntimeException('RCON returned invalid JSON');
        return $decoded;
    }

    $context = stream_context_create([
        'http' => [
            'method' => 'GET',
            'header' => "Accept: application/json\r\nAuthorization: Bearer {$password}\r\n",
            'timeout' => 8,
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

function playerRows(array $payload): array
{
    if (array_is_list($payload)) return $payload;
    if (isset($payload['players']) && is_array($payload['players'])) return $payload['players'];
    if (isset($payload['data']) && is_array($payload['data'])) return $payload['data'];
    return [];
}

$servers = [];
foreach ($config['servers'] as $index => $server) {
    if (!is_array($server) || (($server['enabled'] ?? true) === false)) continue;

    $serverNumber = (int)$index + 1;
    $defaultGroup = $serverNumber === 3 ? 'hardcore' : 'normal';
    $statsGroup = strtolower(trim((string)($server['statsGroup'] ?? $defaultGroup)));
    if (!in_array($statsGroup, ['normal', 'hardcore'], true)) $statsGroup = $defaultGroup;

    $entry = [
        'serverNumber' => $serverNumber,
        'id' => (string)($server['id'] ?? ('server-' . $serverNumber)),
        'name' => (string)($server['name'] ?? ('WARDOGS Server #' . $serverNumber)),
        'statsGroup' => $statsGroup,
        'status' => null,
        'players' => [],
    ];

    $baseUrl = rtrim((string)($server['url'] ?? ''), '/');
    $password = (string)($server['password'] ?? '');
    if ($baseUrl === '' || $password === '' || str_contains($password, 'CHANGE_ME')) {
        $entry['error'] = 'RCON is not configured for this server';
        $servers[] = $entry;
        continue;
    }

    try {
        $entry['status'] = fetchJson($baseUrl . '/v1/status', $password);
        $entry['players'] = playerRows(fetchJson($baseUrl . '/v1/players', $password));
    } catch (Throwable $error) {
        error_log('44th WARDOGS stats source failed for server #' . $serverNumber . ': ' . $error->getMessage());
        $entry['error'] = 'RCON request failed';
    }

    $servers[] = $entry;
}

echo json_encode([
    'servers' => $servers,
    'generatedAt' => gmdate('c'),
], JSON_UNESCAPED_SLASHES);
