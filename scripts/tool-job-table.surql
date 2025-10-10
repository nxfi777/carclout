-- Database migration: Add tool_job table for async tool operations (upscale, draw-to-edit, studio)
-- Run this in SurrealDB to create the tool_job table

-- Create the tool_job table
DEFINE TABLE tool_job SCHEMAFULL;

-- Define required fields
DEFINE FIELD email ON tool_job TYPE string ASSERT $value != NONE;
DEFINE FIELD fal_request_id ON tool_job TYPE string ASSERT $value != NONE;
DEFINE FIELD fal_model ON tool_job TYPE string ASSERT $value != NONE;
DEFINE FIELD tool_type ON tool_job TYPE string ASSERT $value IN ['upscale', 'draw_to_edit', 'studio'];
DEFINE FIELD status ON tool_job TYPE string ASSERT $value IN ['pending', 'processing', 'completed', 'failed'];

-- Define optional fields
DEFINE FIELD output_url ON tool_job TYPE option<string>;
DEFINE FIELD output_key ON tool_job TYPE option<string>;
DEFINE FIELD error_message ON tool_job TYPE option<string>;
DEFINE FIELD credits ON tool_job TYPE option<number>;
DEFINE FIELD created_at ON tool_job TYPE datetime;
DEFINE FIELD updated_at ON tool_job TYPE datetime;
DEFINE FIELD completed_at ON tool_job TYPE option<datetime>;

-- Tool-specific parameters (stored as flexible objects)
DEFINE FIELD params ON tool_job TYPE option<object>;

-- Create index on fal_request_id for fast lookups
DEFINE INDEX idx_fal_request_id ON tool_job FIELDS fal_request_id UNIQUE;

-- Create index on email for user job queries
DEFINE INDEX idx_email ON tool_job FIELDS email;

-- Create index on status for filtering
DEFINE INDEX idx_status ON tool_job FIELDS status;

-- Create index on tool_type
DEFINE INDEX idx_tool_type ON tool_job FIELDS tool_type;


