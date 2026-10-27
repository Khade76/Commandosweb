<?php

declare(strict_types=1);

// These are website identities, never positions in the configured servers array.
const WARDOGS_JOIN_KNOWN_SERVERS = [
    'wardogs-278c7bc5' => [1, '89607037-07ad-4039-8f7d-1fb9a46e707b'],
    'wardogs-9290beb1' => [2, '6eccb2c4-4e2a-4cf2-b2d5-67faf8e283b1'],
    'wardogs-9f71e8ef' => [3, '529de475-7326-4178-81f0-f720aa9c9206'],
    'wardogs-12577' => [4, '7f15ef51-2673-4eab-b3c8-d8176a3b41e4'],
    'wardogs-12648' => [5, '3500961c-24df-40b1-b299-6a897eddc2bd'],
];

function wardogsJoinBlank($value): bool
{
    return $value === null || (is_string($value) && trim($value) === '');
}

function wardogsJoinLobbyId($value): ?string
{
    if (!is_string($value) || preg_match('/\A[1-9][0-9]{16,19}\z/', $value) !== 1) return null;
    // Compare decimal strings, preserving every digit beyond PHP/JS integer limits.
    if (strlen($value) === 20 && strcmp($value, '18446744073709551615') > 0) return null;
    return $value;
}

function wardogsJoinSelector(string $rawQuery): ?array
{
    if ($rawQuery === '' || strlen($rawQuery) > 2048 || strpos($rawQuery, '&') !== false) return null;
    if (preg_match('/%(?![0-9a-f]{2})/i', $rawQuery) === 1) return null;
    $parts = explode('=', $rawQuery, 2);
    if (count($parts) !== 2) return null;
    $key = urldecode($parts[0]);
    $value = urldecode($parts[1]);
    if ($key === 'lobby') {
        $lobbyId = wardogsJoinLobbyId($value);
        return $lobbyId === null ? null : ['kind' => 'lobby', 'value' => $lobbyId];
    }
    if ($key !== 'server' || preg_match('/\A[A-Za-z0-9][A-Za-z0-9._-]{0,127}\z/', $value) !== 1) return null;
    if (preg_match('/\A[0-9]+\z/', $value) === 1 && preg_match('/\A[1-5]\z/', $value) !== 1) return null;
    return ['kind' => 'server', 'value' => $value];
}

function wardogsJoinNumber($value): ?int
{
    if (is_int($value) && $value >= 1 && $value <= 5) return $value;
    if (is_string($value) && preg_match('/\A[1-5]\z/', $value) === 1) return (int)$value;
    return null;
}

function wardogsJoinCode(array $server): ?string
{
    $hasConfiguredValue = false;
    foreach (['joinCode', 'joinId'] as $key) {
        $value = $server[$key] ?? null;
        if (!wardogsJoinBlank($value)) $hasConfiguredValue = true;
        if (!is_string($value)) continue;
        $code = trim($value);
        if (preg_match('/\A[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\z/i', $code) === 1) {
            return strtolower($code);
        }
    }
    if ($hasConfiguredValue) return null;
    return WARDOGS_JOIN_KNOWN_SERVERS[$server['id']][1] ?? null;
}

function wardogsJoinConfiguredLobby(array $server): ?string
{
    $configuredId = $server['steamLobbyId'] ?? null;
    $configuredUrl = $server['steamJoinUrl'] ?? null;
    $hasId = !wardogsJoinBlank($configuredId);
    $hasUrl = !wardogsJoinBlank($configuredUrl);
    $lobbyId = $hasId ? wardogsJoinLobbyId($configuredId) : null;
    if ($hasId && $lobbyId === null) return null;

    $urlLobbyId = null;
    if ($hasUrl) {
        if (!is_string($configuredUrl) || preg_match('~\Asteam://joinlobby/1867240/([1-9][0-9]{16,19})/?\z~', $configuredUrl, $matches) !== 1) return null;
        $urlLobbyId = wardogsJoinLobbyId($matches[1]);
        if ($urlLobbyId === null) return null;
    }
    if ($lobbyId !== null && $urlLobbyId !== null && $lobbyId !== $urlLobbyId) return null;
    return $lobbyId ?? $urlLobbyId;
}

function wardogsJoinResult(int $status, array $body): array
{
    return ['status' => $status, 'body' => $body];
}

/** Pure request resolution. Does not load secrets, make requests, or redirect. */
function wardogsJoinResponse(string $rawQuery, $config = null): array
{
    $selector = wardogsJoinSelector($rawQuery);
    if ($selector === null) {
        return wardogsJoinResult(400, ['error' => 'Invalid join request. Specify exactly one server or a valid Steam lobby ID.']);
    }
    if ($selector['kind'] === 'lobby') {
        return wardogsJoinResult(200, [
            'server' => ['id' => null, 'number' => null, 'name' => 'WARDOGS', 'joinCode' => null],
            'steamLobbyId' => $selector['value'],
            'steamJoinUrl' => 'steam://joinlobby/1867240/' . $selector['value'],
            'available' => true,
        ]);
    }

    $configurationError = wardogsJoinResult(503, ['error' => 'WARDOGS joining is not configured.']);
    if (!is_array($config) || !isset($config['servers']) || !is_array($config['servers'])) return $configurationError;
    $numericSelector = preg_match('/\A[1-5]\z/', $selector['value']) === 1;
    $matches = [];
    foreach ($config['servers'] as $server) {
        if (!is_array($server) || !isset($server['id']) || !is_string($server['id'])
            || preg_match('/\A[A-Za-z0-9][A-Za-z0-9._-]{0,127}\z/', $server['id']) !== 1) return $configurationError;
        $configuredNumber = $server['number'] ?? null;
        $number = wardogsJoinNumber($configuredNumber);
        if ($number === null && !wardogsJoinBlank($configuredNumber)) return $configurationError;
        if ($number === null) $number = WARDOGS_JOIN_KNOWN_SERVERS[$server['id']][0] ?? null;
        if ($numericSelector ? ($number !== null && (string)$number === $selector['value']) : $server['id'] === $selector['value']) {
            $matches[] = ['record' => $server, 'number' => $number];
        }
    }
    if (count($matches) > 1) return $configurationError;
    if (!$matches || (($matches[0]['record']['enabled'] ?? true) === false)) {
        return wardogsJoinResult(404, ['error' => 'Server not found.']);
    }

    $server = $matches[0]['record'];
    $number = $matches[0]['number'];
    $fallbackName = $number === null ? 'WARDOGS' : '44th Commandos #' . $number;
    $name = isset($server['name']) && is_string($server['name']) && trim($server['name']) !== ''
        ? trim($server['name']) : $fallbackName;
    $name = preg_match('/\A.{1,200}/us', $name, $nameMatch) === 1 ? $nameMatch[0] : $fallbackName;
    $lobbyId = wardogsJoinConfiguredLobby($server);
    $body = [
        'server' => [
            'id' => $server['id'],
            'number' => $number,
            'name' => $name,
            'joinCode' => wardogsJoinCode($server),
        ],
        'steamLobbyId' => $lobbyId,
        'steamJoinUrl' => $lobbyId === null ? null : 'steam://joinlobby/1867240/' . $lobbyId,
        'available' => $lobbyId !== null,
    ];
    if ($lobbyId === null) $body['message'] = 'Direct joining is not available right now. Use the join code below.';
    return wardogsJoinResult(200, $body);
}
