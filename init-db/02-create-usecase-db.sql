-- Create a separate database for the spaces server
SELECT 'CREATE DATABASE spaces_db'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'spaces_db')\gexec
