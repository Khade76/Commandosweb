<?php
declare(strict_types=1);
header('Content-Type: application/json');
if (($_SERVER['HTTP_AUTHORIZATION'] ?? '') !== 'Bearer test-stats-key-not-a-real-secret') {
    http_response_code(401);
    echo json_encode(['error' => 'Missing test bearer token']);
    exit;
}
$mode = (string)($_GET['search'] ?? '');
$payload = [
    'version' => $mode === 'old-version' ? 1 : 2,
    'group' => 'all',
    'server' => isset($_GET['server']) ? (int)$_GET['server'] : null,
    'range' => $_GET['range'] ?? 'all',
    'source' => 'warcon-leaderboard',
    'total' => 1,
    'players' => [['id' => $_GET['player'] ?? '76561198000000001', 'name' => 'Fixture player']],
    'summary' => ['trackedPlayers' => 1],
    'received' => $_GET,
];
if (isset($_GET['meta'])) $payload['seasons'] = [['key' => 'wardogs-1', 'name' => 'Season 1']];
if (isset($_GET['career'])) {
    $payload['playerId'] = $_GET['career'];
    $payload['career'] = ['matches' => 0, 'last' => []];
}
if (isset($_GET['leaders'])) $payload['leaders'] = ['kills' => $payload['players'][0]];
if ($mode === 'wrong-server') $payload['server'] = 1;
if ($mode === 'wrong-period') $payload['range'] = 'all';
if ($mode === 'wrong-career') $payload['playerId'] = '76561198000000002';
if ($mode === 'wrong-player') $payload['players'][0]['id'] = '76561198000000002';
if ($mode === 'upstream-error') { http_response_code(500); $payload = ['error' => 'Private upstream diagnostic must not reach client']; }
echo json_encode($payload);
