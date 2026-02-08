-- Create a separate database for the use-case-app
SELECT 'CREATE DATABASE use_case_db'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'use_case_db')\gexec
