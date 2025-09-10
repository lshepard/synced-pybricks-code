-- Create file_locks table for cross-device file locking coordination
-- This enables the hybrid local + remote locking system

-- Create the file_locks table
CREATE TABLE file_locks (
    path TEXT NOT NULL PRIMARY KEY,
    session_id TEXT NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);

-- Enable Row Level Security
ALTER TABLE file_locks ENABLE ROW LEVEL SECURITY;

-- Create policy for anonymous access (classroom use case)
CREATE POLICY "Allow anonymous access to file locks" ON file_locks
    FOR ALL 
    TO anon
    USING (true)
    WITH CHECK (true);

-- Create policy for authenticated users
CREATE POLICY "Allow authenticated access to file locks" ON file_locks
    FOR ALL 
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- Create index for expired locks cleanup
CREATE INDEX file_locks_expires_idx ON file_locks(expires_at);

-- Create function to clean up expired locks automatically
CREATE OR REPLACE FUNCTION cleanup_expired_locks()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    DELETE FROM file_locks WHERE expires_at < NOW();
END;
$$;