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

$allowedSorts = ['kills', 'deaths', 'kd', 'time', 'matches', 'lastSeen', 'name'];
$allowedGroups = ['normal', 'hardcore'];

$search = isset($_GET['search']) ? substr(trim((string)$_GET['search']), 0, 80) : '';
$sort = isset($_GET['sort']) ? (string)$_GET['sort'] : 'kills';
if (!in_array($sort, $allowedSorts, true)) $sort = 'kills';
$group = isset($_GET['group']) ? strtolower((string)$_GET['group']) : 'normal';
if (!in_array($group, $allowedGroups, true)) $group = 'normal';
$limit = min(500, max(1, (int)($_GET['limit'] ?? 100)));
$offset = min(100000, max(0, (int)($_GET['offset'] ?? 0)));

try {
    $config = wardogsStatsConfig();
    $pdo = wardogsStatsPdo($config);

    // Fallback collection: if the DB is stale, a stats-page request refreshes it.
    // A scheduled call to /api/collect-stats.php is still recommended for 24/7 tracking.
    wardogsStatsMaybeCollect($pdo, $config);

    $result = wardogsStatsPlayers($pdo, [
        'group' => $group,
        'search' => $search,
        'sort' => $sort,
        'limit' => $limit,
        'offset' => $offset,
    ]);

    echo json_encode([
        ...$result,
        'summary' => wardogsStatsSummary($pdo, $group),
        'generatedAt' => gmdate('c'),
    ], JSON_UNESCAPED_SLASHES);
} catch (Throwable $error) {
    error_log('44th player stats failed: ' . $error->getMessage());
    http_response_code(503);
    echo json_encode(['error' => 'Player stats are temporarily unavailable']);
}
