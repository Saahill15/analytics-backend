-- Table: events
CREATE TABLE IF NOT EXISTS events (
  id BIGSERIAL PRIMARY KEY,
  site_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  path TEXT,
  user_id TEXT,
  event_timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
  ingested_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_events_site_date ON events (site_id, (event_timestamp::date));
CREATE INDEX IF NOT EXISTS idx_events_site_path ON events (site_id, path);
CREATE INDEX IF NOT EXISTS idx_events_site_user ON events (site_id, user_id);
