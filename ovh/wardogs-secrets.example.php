<?php

return [
    // Keep this file outside the public www directory on OVH.
    'cache_seconds' => 15,
    'region' => 'Europe / UK',
    'include_training_server' => true,

    // Player stats are collected directly by OVH PHP and stored in the remote MariaDB database.
    'stats_poll_seconds' => 60,

    // Token used only to protect /api/collect-stats.php when called by a scheduled HTTP job.
    // It is NOT a WARDOGS/RCON token.
    'stats_collect_token' => 'CHANGE_ME_TO_A_LONG_RANDOM_TOKEN',

    // Remote MariaDB used by the /stats page.
    'database' => [
        'host' => 'CHANGE_ME_DB_HOST',
        'port' => 3306,
        'name' => 'CHANGE_ME_DB_NAME',
        'user' => 'CHANGE_ME_DB_USER',
        'password' => 'CHANGE_ME_DB_PASSWORD',
        'charset' => 'utf8mb4',
        // Optional: set this only if your DB host requires a CA file for TLS.
        'ssl_ca' => '',
    ],

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
