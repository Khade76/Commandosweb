<?php

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

require_once __DIR__ . '/stats-db.php';

function wardogsWarconHealthBearer(): string
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

    return '';
}

function wardogsWarconHealthFail(string $message, int $status = 503, array $extra = []): never
{
    http_response_code($status);
    echo json_encode(array_merge([
        'ok' => false,
        'message' => $message,
    ], $extra), JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
    exit;
}

try {
    $config = wardogsStatsConfig();
    $warcon = is_array($config['warcon'] ?? null) ? $config['warcon'] : [];
    $baseUrl = rtrim(trim((string)($warcon['url'] ?? '')), '/');
    $apiKey = trim((string)($warcon['stats_api_key'] ?? ''));
    $provided = wardogsWarconHealthBearer();

    if ($apiKey === '' || $provided === '' || !hash_equals($apiKey, $provided)) {
        wardogsWarconHealthFail('Unauthorized', 401);
    }

    $host = (string)(parse_url($baseUrl, PHP_URL_HOST) ?? '');
    $scheme = (string)(parse_url($baseUrl, PHP_URL_SCHEME) ?? '');

    $result = [
        'ok' => true,
        'statsSource' => (string)($config['stats_source'] ?? ''),
        'warcon' => [
            'configured' => $baseUrl !== '' && $apiKey !== '',
            'scheme' => $scheme,
            'host' => $host,
            'curlAvailable' => function_exists('curl_init'),
            'opensslAvailable' => extension_loaded('openssl'),
            'allowUrlFopen' => filter_var((string)ini_get('allow_url_fopen'), FILTER_VALIDATE_BOOLEAN),
        ],
        'generatedAt' => gmdate('c'),
    ];

    if ($baseUrl === '') {
        wardogsWarconHealthFail('warcon.url is missing', 503, $result);
    }

    if ($host !== '') {
        $resolved = gethostbyname($host);
        $result['warcon']['dnsResolved'] = $resolved !== $host;
        $result['warcon']['resolvedAddress'] = $resolved !== $host ? $resolved : null;
    }

    $url = $baseUrl . '/api/public/player-stats?group=normal&limit=1';

    if (function_exists('curl_init')) {
        $curl = curl_init($url);
        curl_setopt_array($curl, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => 6,
            CURLOPT_TIMEOUT => 15,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_HTTPHEADER => [
                'Accept: application/json',
                'Authorization: Bearer ' . $apiKey,
            ],
        ]);

        $body = curl_exec($curl);
        $status = (int)curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
        $curlErrno = curl_errno($curl);
        $curlError = curl_error($curl);
        $primaryIp = (string)curl_getinfo($curl, CURLINFO_PRIMARY_IP);
        $totalTime = (float)curl_getinfo($curl, CURLINFO_TOTAL_TIME);
        curl_close($curl);

        $result['request'] = [
            'transport' => 'curl',
            'httpStatus' => $status,
            'curlErrno' => $curlErrno,
            'curlError' => $curlError !== '' ? $curlError : null,
            'primaryIp' => $primaryIp !== '' ? $primaryIp : null,
            'totalTimeSeconds' => $totalTime,
        ];

        if ($body === false || $curlErrno !== 0) {
            $result['ok'] = false;
            echo json_encode($result, JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
            exit;
        }
    } else {
        $context = stream_context_create([
            'http' => [
                'method' => 'GET',
                'header' => "Accept: application/json\r\nAuthorization: Bearer {$apiKey}\r\n",
                'timeout' => 15,
                'ignore_errors' => true,
            ],
        ]);

        $body = @file_get_contents($url, false, $context);
        $lastError = error_get_last();
        $status = 0;
        foreach (($http_response_header ?? []) as $header) {
            if (preg_match('#^HTTP/\S+\s+(\d{3})#i', (string)$header, $matches)) {
                $status = (int)$matches[1];
                break;
            }
        }

        $result['request'] = [
            'transport' => 'stream',
            'httpStatus' => $status,
            'error' => $body === false ? (string)($lastError['message'] ?? 'file_get_contents failed') : null,
        ];

        if ($body === false) {
            $result['ok'] = false;
            echo json_encode($result, JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
            exit;
        }
    }

    $payload = json_decode((string)$body, true);
    $result['request']['json'] = is_array($payload);
    $result['request']['source'] = is_array($payload) ? ($payload['source'] ?? null) : null;
    $result['request']['playerCount'] = is_array($payload) && is_array($payload['players'] ?? null)
        ? count($payload['players'])
        : null;

    if ($status < 200 || $status >= 300) {
        $result['ok'] = false;
        $result['request']['warconMessage'] = is_array($payload)
            ? ($payload['error']['message'] ?? $payload['error'] ?? null)
            : null;
    } elseif (!is_array($payload) || !is_array($payload['players'] ?? null)) {
        $result['ok'] = false;
        $result['request']['responseError'] = 'WARCON returned an unexpected response body';
    }

    echo json_encode($result, JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
} catch (Throwable $error) {
    wardogsWarconHealthFail('OVH diagnostic failed', 503, [
        'type' => get_class($error),
        'detail' => $error->getMessage(),
    ]);
}
