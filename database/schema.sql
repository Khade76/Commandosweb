-- 44th Commando Regiment WARDOGS player statistics
-- MariaDB 10.6+ / MySQL 8 compatible schema.
-- Select the database you created for the stats service before running this file.

SET NAMES utf8mb4;
SET time_zone = '+00:00';

CREATE TABLE IF NOT EXISTS players (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    steam_id VARCHAR(64) NOT NULL,
    current_name VARCHAR(191) NOT NULL,
    first_seen DATETIME(3) NOT NULL,
    last_seen DATETIME(3) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_players_steam_id (steam_id),
    KEY idx_players_current_name (current_name),
    KEY idx_players_last_seen (last_seen)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS player_aliases (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    player_id BIGINT UNSIGNED NOT NULL,
    alias VARCHAR(191) NOT NULL,
    first_seen DATETIME(3) NOT NULL,
    last_seen DATETIME(3) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_player_alias (player_id, alias),
    KEY idx_player_alias_lookup (alias),
    CONSTRAINT fk_player_alias_player
        FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS stats_servers (
    id SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
    server_number TINYINT UNSIGNED NOT NULL,
    external_id VARCHAR(128) NOT NULL,
    name VARCHAR(191) NOT NULL,
    stats_group ENUM('normal', 'hardcore') NOT NULL,
    last_seen DATETIME(3) NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_stats_server_number (server_number),
    UNIQUE KEY uq_stats_server_external_id (external_id),
    KEY idx_stats_server_group (stats_group)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS player_group_stats (
    player_id BIGINT UNSIGNED NOT NULL,
    stats_group ENUM('normal', 'hardcore') NOT NULL,
    first_seen DATETIME(3) NOT NULL,
    last_seen DATETIME(3) NOT NULL,
    total_kills BIGINT UNSIGNED NOT NULL DEFAULT 0,
    total_deaths BIGINT UNSIGNED NOT NULL DEFAULT 0,
    matches_seen INT UNSIGNED NOT NULL DEFAULT 0,
    seconds_tracked BIGINT UNSIGNED NOT NULL DEFAULT 0,
    peak_kills_in_match INT UNSIGNED NOT NULL DEFAULT 0,
    peak_cash BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (player_id, stats_group),
    KEY idx_group_kills (stats_group, total_kills),
    KEY idx_group_deaths (stats_group, total_deaths),
    KEY idx_group_time (stats_group, seconds_tracked),
    KEY idx_group_last_seen (stats_group, last_seen),
    CONSTRAINT fk_player_group_player
        FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS player_server_stats (
    player_id BIGINT UNSIGNED NOT NULL,
    server_id SMALLINT UNSIGNED NOT NULL,
    first_seen DATETIME(3) NOT NULL,
    last_seen DATETIME(3) NOT NULL,
    total_kills BIGINT UNSIGNED NOT NULL DEFAULT 0,
    total_deaths BIGINT UNSIGNED NOT NULL DEFAULT 0,
    matches_seen INT UNSIGNED NOT NULL DEFAULT 0,
    seconds_tracked BIGINT UNSIGNED NOT NULL DEFAULT 0,
    polls_seen BIGINT UNSIGNED NOT NULL DEFAULT 0,
    PRIMARY KEY (player_id, server_id),
    KEY idx_player_server_last_seen (server_id, last_seen),
    CONSTRAINT fk_player_server_player
        FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE,
    CONSTRAINT fk_player_server_server
        FOREIGN KEY (server_id) REFERENCES stats_servers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS player_faction_stats (
    player_id BIGINT UNSIGNED NOT NULL,
    stats_group ENUM('normal', 'hardcore') NOT NULL,
    faction VARCHAR(96) NOT NULL,
    first_seen DATETIME(3) NOT NULL,
    last_seen DATETIME(3) NOT NULL,
    total_kills BIGINT UNSIGNED NOT NULL DEFAULT 0,
    total_deaths BIGINT UNSIGNED NOT NULL DEFAULT 0,
    seconds_tracked BIGINT UNSIGNED NOT NULL DEFAULT 0,
    polls_seen BIGINT UNSIGNED NOT NULL DEFAULT 0,
    PRIMARY KEY (player_id, stats_group, faction),
    KEY idx_faction_group (stats_group, faction),
    CONSTRAINT fk_player_faction_player
        FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One latest raw snapshot per player/server. This lets the collector calculate
-- deltas without storing a duplicate row every poll.
CREATE TABLE IF NOT EXISTS player_snapshots (
    server_id SMALLINT UNSIGNED NOT NULL,
    player_id BIGINT UNSIGNED NOT NULL,
    stats_group ENUM('normal', 'hardcore') NOT NULL,
    kills INT UNSIGNED NOT NULL DEFAULT 0,
    deaths INT UNSIGNED NOT NULL DEFAULT 0,
    seen_at DATETIME(3) NOT NULL,
    match_marker VARCHAR(512) NOT NULL DEFAULT '',
    PRIMARY KEY (server_id, player_id),
    KEY idx_snapshot_seen (seen_at),
    CONSTRAINT fk_snapshot_server
        FOREIGN KEY (server_id) REFERENCES stats_servers(id) ON DELETE CASCADE,
    CONSTRAINT fk_snapshot_player
        FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Rebuilt each collector cycle and used for the "Online now" state.
CREATE TABLE IF NOT EXISTS player_live_state (
    player_id BIGINT UNSIGNED NOT NULL,
    server_id SMALLINT UNSIGNED NOT NULL,
    stats_group ENUM('normal', 'hardcore') NOT NULL,
    faction VARCHAR(96) NULL,
    ping_ms INT UNSIGNED NULL,
    cash BIGINT NULL,
    last_seen DATETIME(3) NOT NULL,
    PRIMARY KEY (player_id),
    KEY idx_live_group (stats_group),
    KEY idx_live_server (server_id),
    CONSTRAINT fk_live_player
        FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE,
    CONSTRAINT fk_live_server
        FOREIGN KEY (server_id) REFERENCES stats_servers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Reserved for the next phase: durable match history / recent matches.
CREATE TABLE IF NOT EXISTS matches (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    server_id SMALLINT UNSIGNED NOT NULL,
    match_key VARCHAR(191) NOT NULL,
    map_name VARCHAR(191) NULL,
    experience VARCHAR(255) NULL,
    started_at DATETIME(3) NOT NULL,
    ended_at DATETIME(3) NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_match_server_key (server_id, match_key),
    KEY idx_match_started (started_at),
    CONSTRAINT fk_match_server
        FOREIGN KEY (server_id) REFERENCES stats_servers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS player_match_stats (
    match_id BIGINT UNSIGNED NOT NULL,
    player_id BIGINT UNSIGNED NOT NULL,
    faction VARCHAR(96) NULL,
    kills INT UNSIGNED NOT NULL DEFAULT 0,
    deaths INT UNSIGNED NOT NULL DEFAULT 0,
    cash BIGINT NOT NULL DEFAULT 0,
    seconds_tracked INT UNSIGNED NOT NULL DEFAULT 0,
    PRIMARY KEY (match_id, player_id),
    KEY idx_player_match_player (player_id),
    CONSTRAINT fk_player_match_match
        FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE,
    CONSTRAINT fk_player_match_player
        FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
