<?php

declare(strict_types=1);

require_once __DIR__ . '/join-common.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
    http_response_code(405);
    header('Allow: GET');
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

$rawQuery = (string)($_SERVER['QUERY_STRING'] ?? '');
$selector = wardogsJoinSelector($rawQuery);
$config = null;
// A direct lobby link and invalid input never need the private server config.
if ($selector !== null && $selector['kind'] === 'server') {
    $secretFile = dirname(__DIR__, 2) . '/wardogs-secrets.php';
    if (is_file($secretFile)) {
        // Suppress accidental config output and errors so secret values/paths
        // cannot become part of the public JSON response.
        ob_start();
        try {
            $config = (static function (string $path) { return require $path; })($secretFile);
        } catch (Throwable $error) {
            $config = null;
        } finally {
            ob_end_clean();
        }
    }
}

$result = wardogsJoinResponse($rawQuery, $config);
http_response_code($result['status']);
echo json_encode($result['body'], JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
