<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/public/api/join-common.php';

$checks = 0;
function joinCheck($actual, $expected, string $label): void
{
    global $checks;
    $checks++;
    if ($actual !== $expected) {
        throw new RuntimeException($label . ': expected ' . json_encode($expected) . ', got ' . json_encode($actual));
    }
}

function joinStatus(string $query, $config = null): int
{
    return wardogsJoinResponse($query, $config)['status'];
}

$sampleLobby = '109775242493124785';
$otherLobby = '109775242493124786';
$sampleUri = 'steam://joinlobby/1867240/' . $sampleLobby;
$one = ['id' => 'wardogs-278c7bc5', 'name' => '44th Commandos #1'];
$two = ['id' => 'wardogs-9290beb1', 'name' => '44th Commandos #2'];
$five = ['id' => 'wardogs-12648', 'name' => '44th Commandos #5'];
$sampleConfig = ['servers' => [$five, $two, $one]];

foreach (['10000000000000000', $sampleLobby, '9999999999999999999', '10000000000000000000', '18446744073709551615'] as $lobbyId) {
    $result = wardogsJoinResponse('lobby=' . $lobbyId);
    joinCheck($result['status'], 200, 'direct lobby needs no secret config');
    joinCheck($result['body']['server'], ['id' => null, 'number' => null, 'name' => 'WARDOGS', 'joinCode' => null], 'direct lobby has no invented server identity');
    joinCheck($result['body']['steamLobbyId'], $lobbyId, 'all lobby digits preserved');
    joinCheck($result['body']['steamJoinUrl'], 'steam://joinlobby/1867240/' . $lobbyId, 'canonical Steam link');
    joinCheck($result['body']['available'], true, 'direct lobby available');
}
joinCheck(wardogsJoinResponse('lobby=' . $sampleLobby, ['servers' => 'broken'])['body']['steamJoinUrl'], $sampleUri, 'broken server config does not block direct lobby mode');

$invalidQueries = [
    '', 'server', 'server=', 'server=0', 'server=6', 'server=01', 'server=1&server=2',
    'server=1&lobby=' . $sampleLobby, 'lobby=' . $sampleLobby . '&lobby=' . $otherLobby,
    'server=1&extra=true', 'server=1&', '&server=1', 'server[]=1', 'server%5B%5D=1',
    'lobby[]=109775242493124785', 'lobby=109775242493124785&server=', 'unknown=1',
    'Server=1', 'server=%', 'server=%GG', 'server=%00', 'server=+1', 'server=1%0A',
    'server=1;lobby=' . $sampleLobby, 'server=1%26lobby%3D' . $sampleLobby,
    'server=https%3A%2F%2Fevil.example', 'server=../../wardogs-secrets.php',
    'server=' . str_repeat('a', 129), 'server=' . str_repeat('a', 3000),
];
foreach ($invalidQueries as $query) joinCheck(joinStatus($query, $sampleConfig), 400, 'invalid query rejected: ' . $query);
foreach (['0', '-1', '+109775242493124785', '0109775242493124785', '9999999999999999', '18446744073709551616', '99999999999999999999', '100000000000000000000', '1.09775242493124785e17', '109775242493124785.0', '109775242493124785/', ' 109775242493124785', "109775242493124785\n", '109775242493124785?x=1'] as $value) {
    joinCheck(joinStatus('lobby=' . rawurlencode($value)), 400, 'noncanonical lobby rejected');
}
joinCheck(joinStatus('server=%35', $sampleConfig), 200, 'URL encoded selector accepted');

// Server numbers derive from identity or explicit config, never array position.
$result = wardogsJoinResponse('server=5', $sampleConfig);
joinCheck($result['body']['server']['id'], 'wardogs-12648', 'reordered server #5 matches identity');
joinCheck($result['body']['server']['number'], 5, 'reordered number remains #5');
joinCheck($result['body']['server']['joinCode'], '3500961c-24df-40b1-b299-6a897eddc2bd', 'known default code follows id');
joinCheck($result['body']['available'], false, 'missing lobby uses manual fallback');
joinCheck($result['body']['steamLobbyId'], null, 'missing lobby not invented');
joinCheck($result['body']['steamJoinUrl'], null, 'missing URI not invented');
joinCheck($result['body']['message'], 'Direct joining is not available right now. Use the join code below.', 'manual fallback message');
joinCheck(joinStatus('server=1', ['servers' => [$five]]), 404, 'subset does not relabel first record #1');
joinCheck(joinStatus('server=5', ['servers' => [$five]]), 200, 'subset retains #5 identity');
joinCheck(joinStatus('server=wardogs-12648', ['servers' => [$five]]), 200, 'configured website id accepted');
joinCheck(joinStatus('server=missing-id', $sampleConfig), 404, 'unknown server rejected');
joinCheck(joinStatus('server=1', ['servers' => [array_merge($one, ['enabled' => false])]]), 404, 'disabled number rejected');
joinCheck(joinStatus('server=wardogs-278c7bc5', ['servers' => [array_merge($one, ['enabled' => false])]]), 404, 'disabled id rejected');

foreach ([3, '3'] as $number) {
    $custom = ['id' => 'custom-server', 'number' => $number];
    $result = wardogsJoinResponse('server=3', ['servers' => [$custom]]);
    joinCheck($result['status'], 200, 'explicit number accepted');
    joinCheck($result['body']['server']['number'], 3, 'explicit number normalized');
    joinCheck($result['body']['server']['joinCode'], null, 'custom id does not inherit another server code');
}
$custom = wardogsJoinResponse('server=custom-server', ['servers' => [['id' => 'custom-server']]]);
joinCheck($custom['body']['server']['number'], null, 'unknown custom number remains null');
joinCheck($custom['body']['server']['name'], 'WARDOGS', 'safe name fallback');
joinCheck(wardogsJoinResponse('server=4', ['servers' => [array_merge($one, ['number' => 4])]])['body']['server']['number'], 4, 'explicit number takes priority over known mapping');

foreach ([null, false, [], ['servers' => null], ['servers' => 'invalid'], ['servers' => [null]], ['servers' => [['name' => 'missing id']]], ['servers' => [['id' => '']]], ['servers' => [['id' => 123]]], ['servers' => [['id' => '../secret']]]] as $config) {
    $result = wardogsJoinResponse('server=1', $config);
    joinCheck($result, ['status' => 503, 'body' => ['error' => 'WARDOGS joining is not configured.']], 'malformed configuration fails safely');
}
foreach ([0, 6, 1.5, true, '01', 'invalid', []] as $number) {
    joinCheck(joinStatus('server=1', ['servers' => [array_merge($one, ['number' => $number])]]), 503, 'invalid explicit number is a configuration error');
}
foreach ([null, '', ' '] as $number) {
    joinCheck(joinStatus('server=1', ['servers' => [array_merge($one, ['number' => $number])]]), 200, 'blank number uses known id mapping');
}
joinCheck(joinStatus('server=1', ['servers' => [$one, $one]]), 503, 'duplicate id is ambiguous');
joinCheck(joinStatus('server=1', ['servers' => [$one, ['id' => 'custom', 'number' => 1]]]), 503, 'duplicate number is ambiguous');
joinCheck(joinStatus('server=1', ['servers' => [$one, ['id' => 'custom', 'number' => 1, 'enabled' => false]]]), 503, 'disabled duplicate cannot silently redirect a number');

foreach ([['steamLobbyId' => $sampleLobby], ['steamJoinUrl' => $sampleUri], ['steamJoinUrl' => $sampleUri . '/'], ['steamLobbyId' => $sampleLobby, 'steamJoinUrl' => $sampleUri . '/'], ['steamLobbyId' => '', 'steamJoinUrl' => $sampleUri]] as $settings) {
    $result = wardogsJoinResponse('server=1', ['servers' => [array_merge($one, $settings)]]);
    joinCheck($result['body']['steamLobbyId'], $sampleLobby, 'configured lobby resolved exactly');
    joinCheck($result['body']['steamJoinUrl'], $sampleUri, 'configured URI normalized without losing precision');
    joinCheck($result['body']['available'], true, 'valid configured lobby available');
}
$badUrls = [
    'https://example.test/join', 'javascript:alert(1)', 'steam://run/1867240',
    'steam://joinlobby/12345/' . $sampleLobby, $sampleUri . '/12345678901234567',
    $sampleUri . '//', $sampleUri . '?inviter=1', $sampleUri . '#fragment',
    'steam://joinlobby/1867240/%31' . substr($sampleLobby, 1), 'STEAM://joinlobby/1867240/' . $sampleLobby,
    'steam://user:password@joinlobby/1867240/' . $sampleLobby, ' ' . $sampleUri, $sampleUri . "\n",
    'steam://joinlobby/1867240/18446744073709551616', 123, [],
];
foreach ($badUrls as $url) {
    $result = wardogsJoinResponse('server=1', ['servers' => [array_merge($one, ['steamLobbyId' => $sampleLobby, 'steamJoinUrl' => $url])]]);
    joinCheck($result['status'], 200, 'invalid lobby config keeps manual response');
    joinCheck($result['body']['available'], false, 'invalid nonblank URL prevents ID fallback');
    joinCheck($result['body']['steamJoinUrl'], null, 'invalid URL cannot escape into response');
}
foreach ([109775242493124785, 1.09775242493124785e17, '1e17', '0109775242493124785', '18446744073709551616', [], true] as $id) {
    $result = wardogsJoinResponse('server=1', ['servers' => [array_merge($one, ['steamLobbyId' => $id, 'steamJoinUrl' => $sampleUri])]]);
    joinCheck($result['body']['available'], false, 'invalid nonblank ID prevents URI fallback');
}
joinCheck(wardogsJoinResponse('server=1', ['servers' => [array_merge($one, ['steamLobbyId' => $otherLobby, 'steamJoinUrl' => $sampleUri])]])['body']['available'], false, 'conflicting ID and URI fail closed');

$configuredCode = '6eccb2c4-4e2a-4cf2-b2d5-67faf8e283b1';
joinCheck(wardogsJoinResponse('server=1', ['servers' => [array_merge($one, ['joinCode' => strtoupper($configuredCode)])]])['body']['server']['joinCode'], $configuredCode, 'code canonicalized');
joinCheck(wardogsJoinResponse('server=1', ['servers' => [array_merge($one, ['joinCode' => 'bad', 'joinId' => $configuredCode])]])['body']['server']['joinCode'], $configuredCode, 'valid alternate code used');
joinCheck(wardogsJoinResponse('server=1', ['servers' => [array_merge($one, ['joinCode' => 'bad'])]])['body']['server']['joinCode'], null, 'invalid configured code is not replaced by static fallback');
joinCheck(wardogsJoinResponse('server=1', ['servers' => [array_merge($one, ['joinCode' => null, 'joinId' => ''])]])['body']['server']['joinCode'], '89607037-07ad-4039-8f7d-1fb9a46e707b', 'absent code uses known id default');

$private = array_merge($one, [
    'password' => 'SECRET_RCON_PASSWORD', 'url' => 'http://PRIVATE_RCON_ADDRESS:9001',
    'instanceId' => $sampleLobby, 'serverId' => $sampleLobby, 'lobbyId' => $sampleLobby,
    'nested' => ['token' => 'SECRET_TOKEN'], 'name' => str_repeat('a', 250),
]);
$result = wardogsJoinResponse('server=1', ['servers' => [$private], 'warcon' => ['stats_api_key' => 'SECRET_WARCON_KEY']]);
joinCheck($result['body']['available'], false, 'unrelated fields never become a lobby');
joinCheck(array_keys($result['body']['server']), ['id', 'number', 'name', 'joinCode'], 'public server fields allowlist');
joinCheck(strlen($result['body']['server']['name']), 200, 'public name bounded');
$json = json_encode($result);
foreach (['SECRET_', 'PRIVATE_RCON_ADDRESS', 'password', 'instanceId', 'lobbyId', 'warcon', 'nested'] as $secret) {
    joinCheck(strpos($json, $secret), false, 'private fields not exposed');
}

echo $checks . " join endpoint checks passed. No secret config, external requests, or redirects used.\n";
