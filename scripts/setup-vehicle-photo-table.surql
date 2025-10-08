-- Create vehicle_photo table to store blurhash metadata for user vehicle photos
DEFINE TABLE vehicle_photo SCHEMAFULL;
DEFINE FIELD key ON vehicle_photo TYPE string ASSERT $value != NONE;
DEFINE FIELD email ON vehicle_photo TYPE string ASSERT $value != NONE;
DEFINE FIELD blurhash ON vehicle_photo TYPE option<string>;
DEFINE FIELD width ON vehicle_photo TYPE option<number>;
DEFINE FIELD height ON vehicle_photo TYPE option<number>;
DEFINE FIELD size ON vehicle_photo TYPE option<number>;
DEFINE FIELD created ON vehicle_photo TYPE option<datetime>;
DEFINE FIELD lastModified ON vehicle_photo TYPE option<datetime>;
DEFINE INDEX unique_key_email_vehicle ON vehicle_photo FIELDS key, email UNIQUE;

