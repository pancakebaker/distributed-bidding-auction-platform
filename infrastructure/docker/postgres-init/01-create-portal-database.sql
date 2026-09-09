SELECT 'CREATE DATABASE auction_operations'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'auction_operations')\gexec
