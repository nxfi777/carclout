/**
 * Library image metadata stored in SurrealDB
 * Maps R2 storage keys to metadata including blurhash
 */

export type LibraryImage = {
  id?: string;
  key: string;
  email: string; // Owner email
  blurhash?: string;
  width?: number;
  height?: number;
  size?: number;
  created?: string;
  lastModified?: string;
};

/**
 * Library video metadata stored in SurrealDB
 * Maps R2 storage keys to metadata including blurhash (from first frame)
 */

export type LibraryVideo = {
  id?: string;
  key: string;
  email: string; // Owner email
  blurhash?: string; // Generated from first frame
  width?: number;
  height?: number;
  size?: number;
  duration?: number; // Video duration in seconds
  created?: string;
  lastModified?: string;
};

/**
 * Database schema definition for library_image table
 * 
 * Run this in SurrealDB to create the table:
 * 
 * DEFINE TABLE library_image SCHEMAFULL;
 * DEFINE FIELD key ON library_image TYPE string ASSERT $value != NONE;
 * DEFINE FIELD email ON library_image TYPE string ASSERT $value != NONE;
 * DEFINE FIELD blurhash ON library_image TYPE option<string>;
 * DEFINE FIELD width ON library_image TYPE option<number>;
 * DEFINE FIELD height ON library_image TYPE option<number>;
 * DEFINE FIELD size ON library_image TYPE option<number>;
 * DEFINE FIELD created ON library_image TYPE option<datetime>;
 * DEFINE FIELD lastModified ON library_image TYPE option<datetime>;
 * DEFINE INDEX unique_key_email ON library_image FIELDS key, email UNIQUE;
 * 
 * Database schema definition for library_video table
 * 
 * DEFINE TABLE library_video SCHEMAFULL;
 * DEFINE FIELD key ON library_video TYPE string ASSERT $value != NONE;
 * DEFINE FIELD email ON library_video TYPE string ASSERT $value != NONE;
 * DEFINE FIELD blurhash ON library_video TYPE option<string>;
 * DEFINE FIELD width ON library_video TYPE option<number>;
 * DEFINE FIELD height ON library_video TYPE option<number>;
 * DEFINE FIELD size ON library_video TYPE option<number>;
 * DEFINE FIELD duration ON library_video TYPE option<number>;
 * DEFINE FIELD created ON library_video TYPE option<datetime>;
 * DEFINE FIELD lastModified ON library_video TYPE option<datetime>;
 * DEFINE INDEX unique_key_email_video ON library_video FIELDS key, email UNIQUE;
 */

