-- Email marketing fields for user table
-- Run this migration to add email tracking to CarClout users

-- Add Resend contact ID (links to Resend's contact database)
DEFINE FIELD resendContactId ON user TYPE option<string>;

-- Email subscription status
DEFINE FIELD emailSubscribed ON user TYPE bool DEFAULT true;

-- Email engagement tracking
DEFINE FIELD lastEmailOpen ON user TYPE option<datetime>;
DEFINE FIELD lastEmailClick ON user TYPE option<datetime>;
DEFINE FIELD emailEngagementScore ON user TYPE int DEFAULT 0;

-- Index for fast webhook lookups
DEFINE INDEX user_resend_contact_idx ON user FIELDS resendContactId;

-- Email tags (for segmentation)
DEFINE FIELD emailTags ON user TYPE array<string> DEFAULT [];

