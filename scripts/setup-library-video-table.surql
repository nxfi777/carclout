-- Database migration: Add library_video table for video metadata
-- Run this in SurrealDB to create the library_video table

-- Create the library_video table with schema
DEFINE TABLE library_video SCHEMAFULL;

-- Define required fields
DEFINE FIELD key ON library_video TYPE string ASSERT $value != NONE;
DEFINE FIELD email ON library_video TYPE string ASSERT $value != NONE;

-- Define optional fields
DEFINE FIELD blurhash ON library_video TYPE option<string>;
DEFINE FIELD width ON library_video TYPE option<number>;
DEFINE FIELD height ON library_video TYPE option<number>;
DEFINE FIELD size ON library_video TYPE option<number>;
DEFINE FIELD duration ON library_video TYPE option<number>;
DEFINE FIELD created ON library_video TYPE option<datetime>;
DEFINE FIELD lastModified ON library_video TYPE option<datetime>;

-- Create unique index on key + email combination
DEFINE INDEX unique_key_email_video ON library_video FIELDS key, email UNIQUE;

