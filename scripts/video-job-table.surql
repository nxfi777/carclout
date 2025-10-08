-- Database migration: Add video_job table for async video generation
-- Run this in SurrealDB to create the video_job table

-- Create the video_job table
DEFINE TABLE video_job SCHEMAFULL;

-- Define required fields
DEFINE FIELD email ON video_job TYPE string ASSERT $value != NONE;
DEFINE FIELD fal_request_id ON video_job TYPE string ASSERT $value != NONE;
DEFINE FIELD fal_model ON video_job TYPE string ASSERT $value != NONE;
DEFINE FIELD template_id ON video_job TYPE string ASSERT $value != NONE;
DEFINE FIELD status ON video_job TYPE string ASSERT $value IN ['pending', 'processing', 'completed', 'failed'];
DEFINE FIELD provider ON video_job TYPE string ASSERT $value IN ['seedance', 'kling2_5', 'sora2', 'sora2_pro'];

-- Optional start_key (no longer used with FormData blob approach)
DEFINE FIELD start_key ON video_job TYPE option<string>;

-- Define optional fields
DEFINE FIELD video_url ON video_job TYPE option<string>;
DEFINE FIELD output_key ON video_job TYPE option<string>;
DEFINE FIELD error_message ON video_job TYPE option<string>;
DEFINE FIELD credits ON video_job TYPE option<number>;
DEFINE FIELD created_at ON video_job TYPE datetime;
DEFINE FIELD updated_at ON video_job TYPE datetime;
DEFINE FIELD completed_at ON video_job TYPE option<datetime>;

-- Video generation parameters
DEFINE FIELD prompt ON video_job TYPE option<string>;
DEFINE FIELD duration ON video_job TYPE option<number>;
DEFINE FIELD resolution ON video_job TYPE option<string>;
DEFINE FIELD aspect_ratio ON video_job TYPE option<string>;

-- Create index on fal_request_id for fast lookups
DEFINE INDEX idx_fal_request_id ON video_job FIELDS fal_request_id UNIQUE;

-- Create index on email for user job queries
DEFINE INDEX idx_email ON video_job FIELDS email;

-- Create index on status for filtering
DEFINE INDEX idx_status ON video_job FIELDS status;

