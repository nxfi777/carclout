-- Database migration: Add lastUsed field to library_image table
-- This field tracks when an image was last used in generation
-- Run this in SurrealDB to add the field:

DEFINE FIELD lastUsed ON library_image TYPE option<datetime>;

