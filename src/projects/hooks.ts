// SPDX-License-Identifier: MIT
// Copyright (c) 2023 The Pybricks Authors

import { useEffect, useState } from 'react';
import { useAuth } from '../auth/hooks';
import { supabase } from '../auth/supabase';
import { Project, ProjectWithMembers } from './types';

/**
 * Hook to get projects for the current user
 * Admins see all projects, students see only their projects
 */
export function useProjects() {
    const [projects, setProjects] = useState<ProjectWithMembers[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const { user, isAdmin } = useAuth();

    useEffect(() => {
        if (!user) {
            return;
        }

        const fetchProjects = async () => {
            try {
                // First get projects
                const { data: projectsData, error: projectsError } = await supabase
                    .from('projects')
                    .select('*');

                if (projectsError) {
                    setError(projectsError.message);
                    return;
                }

                // Then get member counts for each project
                const projectsWithMembers: ProjectWithMembers[] = await Promise.all(
                    (projectsData || []).map(async (project) => {
                        const { count } = await supabase
                            .from('project_memberships')
                            .select('*', { count: 'exact', head: true })
                            .eq('project_id', project.id);

                        return {
                            ...project,
                            member_count: count || 0,
                            members: [], // Will populate this later when we need member details
                        } as ProjectWithMembers;
                    }),
                );

                setProjects(projectsWithMembers);
            } catch (err) {
                setError(
                    err instanceof Error ? err.message : 'Failed to fetch projects',
                );
            } finally {
                setLoading(false);
            }
        };

        fetchProjects();
    }, [user, isAdmin]);

    return { projects, loading, error, refetch: () => setLoading(true) };
}

/**
 * Hook to create a new project (admin only)
 */
export function useCreateProject() {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const { user } = useAuth();

    const createProject = async (name: string, description?: string) => {
        if (!user) {
            setError('Not authenticated');
            return null;
        }

        setLoading(true);
        setError(null);

        try {
            const { data, error } = await supabase
                .from('projects')
                .insert({
                    name,
                    description,
                    created_by: user.id,
                })
                .select()
                .single();

            if (error) {
                setError(error.message);
                return null;
            }

            return data as Project;
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to create project');
            return null;
        } finally {
            setLoading(false);
        }
    };

    return { createProject, loading, error };
}
