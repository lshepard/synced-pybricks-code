-- RBAC Database Schema for Pybricks Code

-- Projects table
CREATE TABLE projects (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  description text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

-- Project memberships (many-to-many relationship)
CREATE TABLE project_memberships (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  joined_at timestamp DEFAULT now(),
  UNIQUE(user_id, project_id)
);

-- Enable Row Level Security
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_memberships ENABLE ROW LEVEL SECURITY;

-- RLS Policies for Projects
-- Admins can see and manage all projects
CREATE POLICY "Admins manage all projects" ON projects
FOR ALL USING (
  (auth.jwt() ->> 'user_metadata')::jsonb ->> 'role' = 'admin'
);

-- Students can only see projects they belong to
CREATE POLICY "Students see their projects" ON projects
FOR SELECT USING (
  id IN (
    SELECT project_id 
    FROM project_memberships 
    WHERE user_id = auth.uid()
  )
);

-- RLS Policies for Project Memberships
-- Admins can manage all memberships
CREATE POLICY "Admins manage all memberships" ON project_memberships
FOR ALL USING (
  (auth.jwt() ->> 'user_metadata')::jsonb ->> 'role' = 'admin'
);

-- Students can only see their own memberships
CREATE POLICY "Students see their memberships" ON project_memberships
FOR SELECT USING (user_id = auth.uid());

-- Create indexes for performance
CREATE INDEX idx_project_memberships_user_id ON project_memberships(user_id);
CREATE INDEX idx_project_memberships_project_id ON project_memberships(project_id);
CREATE INDEX idx_projects_created_by ON projects(created_by);