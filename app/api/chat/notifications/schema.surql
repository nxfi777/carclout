-- Notification table for chat mentions and @everyone
DEFINE TABLE notification TYPE ANY SCHEMALESS PERMISSIONS NONE;

-- Indexes for efficient querying
DEFINE INDEX idx_notification_recipient_created ON notification FIELDS recipientEmail, created_at;
DEFINE INDEX idx_notification_recipient_unread ON notification FIELDS recipientEmail, read;
DEFINE INDEX idx_notification_message ON notification FIELDS messageId;

