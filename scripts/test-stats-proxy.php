<?php
declare(strict_types=1);
// Run with PHP 8.x. Uses loopback-only fixture servers and no real credentials.
$root = dirname(__DIR__);
$temp = sys_get_temp_dir() . '/wardogs-proxy-test-' . bin2hex(random_bytes(6));
mkdir($temp . '/public/api', 0700, true);
copy($root . '/public/api/player-stats.php', $temp . '/public/api/player-stats.php');
copy($root . '/public/api/stats-db.php', $temp . '/public/api/stats-db.php');
file_put_contents($temp . '/wardogs-secrets.php', '<?php return ' . var_export([
    'stats_source' => 'warcon',
    'warcon' => ['url' => 'http://127.0.0.1:18481', 'stats_api_key' => 'test-stats-key-not-a-real-secret'],
], true) . ';');
$handles = [];
$tests = 0;
function check(bool $condition, string $description): void {
    global $tests;
    if (!$condition) throw new RuntimeException($description);
    $tests++;
}
function request(string $query, string $method = 'GET'): array {
    $body = file_get_contents('http://127.0.0.1:18480/api/player-stats.php?' . $query, false, stream_context_create([
        'http' => ['method' => $method, 'ignore_errors' => true, 'timeout' => 5],
    ]));
    preg_match('/^HTTP\/\S+\s+(\d+)/', $http_response_header[0] ?? '', $matches);
    return [(int)($matches[1] ?? 0), json_decode((string)$body, true), $http_response_header, (string)$body];
}
try {
    $null = PHP_OS_FAMILY === 'Windows' ? 'NUL' : '/dev/null';
    $descriptors = [0 => ['file', $null, 'r'], 1 => ['file', $null, 'w'], 2 => ['file', $null, 'w']];
    $php = function_exists('curl_init') ? [PHP_BINARY] : [PHP_BINARY, '-d', 'disable_functions=curl_init'];
    $handles[] = proc_open(array_merge($php, ['-S', '127.0.0.1:18481', $root . '/scripts/fixtures/stats-proxy-upstream.php']), $descriptors, $pipes);
    $handles[] = proc_open(array_merge($php, ['-S', '127.0.0.1:18480', '-t', $temp . '/public']), $descriptors, $pipes);
    foreach ([18480, 18481] as $port) {
        $ready = false;
        for ($i = 0; $i < 50; $i++) {
            $socket = @fsockopen('127.0.0.1', $port, $errno, $message, 0.1);
            if ($socket) { fclose($socket); $ready = true; break; }
            usleep(20000);
        }
        check($ready, 'Fixture server started');
    }
    [$status, $data, $headers, $body] = request('');
    check($status === 200 && $data['group'] === 'all', 'Legacy default succeeds with server-side bearer token');
    check(!str_contains($body, 'test-stats-key'), 'Secret never appears in response');
    check(in_array('Cache-Control: no-store', $headers, true), 'Proxy remains no-store');
    $id = '76561198000000001';
    foreach (['player=' . $id, 'career=' . $id, 'meta=1', 'leaders=1'] as $mode) {
        [$status, $data] = request('server=5&range=s%3Awardogs-1&' . $mode);
        check($status === 200, 'New request accepted: ' . $mode);
        check($data['received']['server'] === '5' && $data['received']['range'] === 's:wardogs-1', 'Scope forwarded exactly');
    }
    foreach (['server=6', 'player=123', 'career=123', 'range=s%3A..%2Fsecret'] as $query) {
        check(request($query)[0] === 400, 'Invalid input rejected: ' . $query);
    }
    check(request('', 'POST')[0] === 405, 'Writes rejected');
    foreach (['server=5&search=wrong-server', 'search=wrong-server', 'range=7d&search=wrong-period',
        'player=' . $id . '&search=wrong-player', 'career=' . $id . '&search=wrong-career',
        'meta=1&search=old-version', 'player=' . $id . '&search=old-version',
        'range=s%3Awardogs-1&search=old-version', 'search=upstream-error'] as $query) {
        [$status, $data, $headers, $body] = request($query);
        check($status === 503, 'Mismatched/old/failed upstream rejected: ' . $query);
        check($data['error'] === 'Player stats are temporarily unavailable', 'Private diagnostics not exposed');
    }
    echo json_encode(['passed' => true, 'checks' => $tests, 'php' => PHP_VERSION, 'transport' => function_exists('curl_init') ? 'curl' : 'streams']) . PHP_EOL;
} finally {
    foreach ($handles as $handle) if (is_resource($handle)) { proc_terminate($handle); proc_close($handle); }
    // Only the exact files created above in our random private directory.
    foreach (['/public/api/player-stats.php', '/public/api/stats-db.php', '/wardogs-secrets.php'] as $file) unlink($temp . $file);
    rmdir($temp . '/public/api'); rmdir($temp . '/public'); rmdir($temp);
}
