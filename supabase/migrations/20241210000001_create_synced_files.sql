-- Create synced_files table for Pybricks file sync
-- This migration creates the table structure for classroom file synchronization

-- Create the synced_files table
CREATE TABLE synced_files (
    id SERIAL PRIMARY KEY,
    path TEXT NOT NULL UNIQUE,
    contents TEXT NOT NULL,
    sha256 TEXT NOT NULL,
    view_state JSONB,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE synced_files ENABLE ROW LEVEL SECURITY;

-- Create policy for anonymous access (classroom use case)
CREATE POLICY "Allow anonymous access to all files" ON synced_files
    FOR ALL 
    TO anon
    USING (true)
    WITH CHECK (true);

-- Create policy for authenticated users
CREATE POLICY "Allow authenticated access to all files" ON synced_files
    FOR ALL 
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- Create index for better query performance
CREATE INDEX synced_files_updated_idx ON synced_files(updated_at DESC);
CREATE INDEX synced_files_path_idx ON synced_files(path);

-- Insert welcome file for testing
INSERT INTO synced_files (path, contents, sha256, view_state) 
VALUES (
    'welcome.py', 
    'print("Welcome to Pybricks sync!")',
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    null
);