-- Forward-only 44th website metric. Historical sessions remain zero by design.
ALTER TABLE player_sessions
    ADD COLUMN IF NOT EXISTS cash_earned bigint NOT NULL DEFAULT 0;
