-- Add ruleset-aware per-server presence for dynamic Standard/Hardcore rotations.
-- Safe to run once on the existing 44th WARDOGS stats database.

CREATE TABLE IF NOT EXISTS player_server_group_stats (
    player_id BIGINT UNSIGNED NOT NULL,
    server_id SMALLINT UNSIGNED NOT NULL,
    stats_group ENUM('normal', 'hardcore') NOT NULL,
    first_seen DATETIME(3) NOT NULL,
    last_seen DATETIME(3) NOT NULL,
    polls_seen BIGINT UNSIGNED NOT NULL DEFAULT 0,
    PRIMARY KEY (player_id, server_id, stats_group),
    KEY idx_player_server_group (stats_group, server_id, last_seen),
    CONSTRAINT fk_player_server_group_player
        FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE,
    CONSTRAINT fk_player_server_group_server
        FOREIGN KEY (server_id) REFERENCES stats_servers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Backfill the history created under the previous layout, where Servers #1/#2
-- were Standard and Server #3 was the dedicated Hardcore server. Future rows
-- are written from the live /v1/status classification instead of server number.
INSERT INTO player_server_group_stats
    (player_id, server_id, stats_group, first_seen, last_seen, polls_seen)
SELECT
    pss.player_id,
    pss.server_id,
    CASE WHEN ss.server_number = 3 THEN 'hardcore' ELSE 'normal' END,
    pss.first_seen,
    pss.last_seen,
    pss.polls_seen
FROM player_server_stats pss
INNER JOIN stats_servers ss ON ss.id = pss.server_id
ON DUPLICATE KEY UPDATE
    first_seen = LEAST(first_seen, VALUES(first_seen)),
    last_seen = GREATEST(last_seen, VALUES(last_seen)),
    polls_seen = GREATEST(polls_seen, VALUES(polls_seen));
