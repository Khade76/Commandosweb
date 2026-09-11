<?php

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

require_once __DIR__ . '/stats-db.php';

function wardogsCollectRequestToken(): string
{
    $authorization = trim((string)($_SERVER['HTTP_AUTHORIZATION'] ?? ''));
    if ($authorization === '' && function_exists('getallheaders')) {
        foreach (getallheaders() as $name => $value) {
            if (strcasecmp((string)$name, 'Authorization') === 0) {
                $authorization = trim((string)$value);
                break;
            }
        }
    }

    if (preg_match('/^Bearer\s+(.+)$/i', $authorization, $matches)) {
        return trim((string)$matches[1]);
    }

    return isset($_GET['token']) ? trim((string)$_GET['token']) : '';
}

function wardogsExpectedCollectToken(array $config): string
{
    $token = trim((string)($config['stats_collect_token'] ?? ''));
    if ($token !== '') return $token;

    // Backward compatibility with the earlier name used before stats collection
    // was moved fully onto OVH.
    return trim((string)($config['stats_source_token'] ?? ''));
}

try {
    $config = wardogsStatsConfig();
    $expectedToken = wardogsExpectedCollectToken($config);
    $providedToken = wardogsCollectRequestToken();

    if ($expectedToken === '' || $providedToken === '' || !hash_equals($expectedToken, $providedToken)) {
        http_response_code(401);
        echo json_encode(['error' => 'Unauthorized']);
        exit;
    }

    $pdo = wardogsStatsPdo($config);
    $result = wardogsStatsCollect($pdo, $config);
    $payload = array_merge(['ok' => true], $result, ['generatedAt' => gmdate('c')]);
    echo json_encode($payload, JSON_UNESCAPED_SLASHES);
} catch (Throwable $error) {
    error_log('44th stats collector failed: ' . $error->getMessage());
    http_response_code(503);
    echo json_encode(['error' => 'Stats collection failed']);
}
