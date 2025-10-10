-- Database migration: Add image_job table for async image generation
-- Run this in SurrealDB to create the image_job table

-- Create the image_job table
DEFINE TABLE image_job SCHEMAFULL;

-- Define required fields
DEFINE FIELD email ON image_job TYPE string ASSERT $value != NONE;
DEFINE FIELD fal_request_id ON image_job TYPE string ASSERT $value != NONE;
DEFINE FIELD fal_model ON image_job TYPE string ASSERT $value != NONE;
DEFINE FIELD template_id ON image_job TYPE string ASSERT $value != NONE;
DEFINE FIELD status ON image_job TYPE string ASSERT $value IN ['pending', 'processing', 'completed', 'failed'];

-- Define optional fields
DEFINE FIELD image_url ON image_job TYPE option<string>;
DEFINE FIELD output_key ON image_job TYPE option<string>;
DEFINE FIELD error_message ON image_job TYPE option<string>;
DEFINE FIELD credits ON image_job TYPE option<number>;
DEFINE FIELD created_at ON image_job TYPE datetime;
DEFINE FIELD updated_at ON image_job TYPE datetime;
DEFINE FIELD completed_at ON image_job TYPE option<datetime>;

-- Image generation parameters
DEFINE FIELD prompt ON image_job TYPE option<string>;
DEFINE FIELD image_size ON image_job TYPE option<object>;
DEFINE FIELD user_image_keys ON image_job TYPE option<array>;
DEFINE FIELD variables ON image_job TYPE option<object>;

-- Create index on fal_request_id for fast lookups
DEFINE INDEX idx_fal_request_id ON image_job FIELDS fal_request_id UNIQUE;

-- Create index on email for user job queries
DEFINE INDEX idx_email ON image_job FIELDS email;

-- Create index on status for filtering
DEFINE INDEX idx_status ON image_job FIELDS status;


