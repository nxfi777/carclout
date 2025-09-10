-- Tables for Instagram integration
DEFINE TABLE instagram_account SCHEMALESS;
DEFINE FIELD user ON TABLE instagram_account TYPE record<user>;
DEFINE FIELD ig_user_id ON TABLE instagram_account TYPE string;
DEFINE FIELD username ON TABLE instagram_account TYPE string;
DEFINE INDEX idx_instagram_account_user ON TABLE instagram_account COLUMNS user UNIQUE;

DEFINE TABLE instagram_schedule SCHEMALESS;
DEFINE FIELD user ON TABLE instagram_schedule TYPE record<user>;
DEFINE FIELD ig_user_id ON TABLE instagram_schedule TYPE string;
DEFINE FIELD creation_id ON TABLE instagram_schedule TYPE string;
DEFINE FIELD caption ON TABLE instagram_schedule TYPE string;
DEFINE FIELD publish_time ON TABLE instagram_schedule TYPE option<number>;
DEFINE FIELD created_at ON TABLE instagram_schedule TYPE string;
DEFINE FIELD published_at ON TABLE instagram_schedule TYPE option<string>;


