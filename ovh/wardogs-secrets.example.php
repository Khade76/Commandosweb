<?php

return [
    // Keep this file outside the public www directory on OVH.
    'cache_seconds' => 15,
    'region' => 'Europe / UK',
    'include_training_server' => true,

    // Optional VPS stats API used by /stats. Example: http://203.0.113.10:3100
    'stats_api_url' => '',

    'servers' => [
        [
            'id' => 'wardogs-278c7bc5',
            'name' => '44th Commandos #1',
            'url' => 'http://165.217.136.52:9001',
            'password' => 'CHANGE_ME_SERVER_1_RCON_PASSWORD',
            'joinId' => '175590',
            'maxPlayers' => 100,
        ],
        [
            'id' => 'wardogs-9290beb1',
            'name' => '44th Commandos #2',
            'url' => 'http://165.217.136.99:9006',
            'password' => 'CHANGE_ME_SERVER_2_RCON_PASSWORD',
            'joinId' => '294832',
            'maxPlayers' => 100,
        ],
    ],
];
