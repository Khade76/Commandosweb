<?php

return [
    // Keep this file outside the public www directory on OVH.
    'cache_seconds' => 15,
    'region' => 'Europe / UK',
    'include_training_server' => true,

    // WARCON/Postgres is the persistent player-stats source.
    'stats_source' => 'warcon',
    'warcon' => [
        'url' => 'https://CHANGE_ME_WARCON_HOST',
        'stats_api_key' => 'CHANGE_ME_TO_THE_SAME_PRIVATE_WARCON_STATS_KEY',
    ],

    // Website live-status/RCON connections. Stats grouping is NOT configured per server here;
    // WARCON classifies Standard vs Hardcore from its recorded match map/experience data.
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
        [
            // Server #3 is now another Bisect-hosted normal server. Replace these placeholders
            // with the current Bisect allocation/RCON details in the live wardogs-secrets.php.
            'id' => 'wardogs-CHANGE_ME_SERVER_3_BISECT_ID',
            'name' => '44th Commandos #3',
            'url' => 'http://CHANGE_ME_SERVER_3_BISECT_IP:CHANGE_ME_SERVER_3_RCON_PORT',
            'password' => 'CHANGE_ME_SERVER_3_RCON_PASSWORD',
            'maxPlayers' => 100,
            'region' => 'Europe / UK',
        ],
    ],
];
