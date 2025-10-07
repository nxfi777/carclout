-- Analytics Events Table Schema
-- Stores all analytics events for server-side tracking

DEFINE TABLE analytics_event SCHEMAFULL;

DEFINE FIELD event ON TABLE analytics_event TYPE string;
DEFINE FIELD timestamp ON TABLE analytics_event TYPE datetime;
DEFINE FIELD data ON TABLE analytics_event TYPE option<object>;
DEFINE FIELD source ON TABLE analytics_event TYPE string 
  ASSERT $value IN ['webhook', 'server', 'client'];

-- Indexes for efficient querying
DEFINE INDEX idx_event ON TABLE analytics_event COLUMNS event;
DEFINE INDEX idx_timestamp ON TABLE analytics_event COLUMNS timestamp;
DEFINE INDEX idx_source ON TABLE analytics_event COLUMNS source;

-- Composite index for common queries
DEFINE INDEX idx_event_timestamp ON TABLE analytics_event COLUMNS event, timestamp;

