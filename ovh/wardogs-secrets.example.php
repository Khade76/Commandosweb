<?php

return [
    // Keep this file outside the public www directory on OVH.
    'cache_seconds' => 15,
    'region' => 'Europe / UK',
    'include_training_server' => true,

    // VPS stats API used by /stats. Example: http://203.0.113.10:3100
    'stats_api_url' => '',

    // Long random token used only by /api/stats-source.php. The VPS sends this
    // as a Bearer token when collecting live player data. Do not expose it publicly.
    'stats_source_token' => 'CHANGE_ME_TO_A_LONG_RANDOM_TOKEN',

    'servers' => [
        [
            'id' => 'wardogs-278c7bc5',
            'name' => '44th Commandos #1',
            'url' => 'http://165.217.136.52:9001',
            'password' => 'CHANGE_ME_SERVER_1_RCON_PASSWORD',
            'joinId' => '175590',
            'maxPlayers' => 100,
            'statsGroup' => 'normal',
        ],
        [
            'id' => 'wardogs-9290beb1',
            'name' => '44th Commandos #2',
            'url' => 'http://165.217.136.99:9006',
            'password' => 'CHANGE_ME_SERVER_2_RCON_PASSWORD',
            'joinId' => '294832',
            'maxPlayers' => 100,
            'statsGroup' => 'normal',
        ],
        [
            // Qonzer-hosted Hardcore server. Use the same working HTTP RCON
            // URL/password already used by the production servers.php config.
            'id' => 'wardogs-hardcore',
            'name' => '44th Commandos #3 | Hardcore',
            'url' => 'CHANGE_ME_TO_SERVER_3_HTTP_RCON_URL',
            'password' => 'CHANGE_ME_SERVER_3_RCON_PASSWORD',
            'maxPlayers' => 100,
            'region' => 'Qonzer',
            'address' => '216.144.249.76:7779',
            'statsGroup' => 'hardcore',
        ],
    ],
];
