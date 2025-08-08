// SPDX-License-Identifier: MIT
// Copyright (c) 2023 The Pybricks Authors

import { useEffect, useState } from 'react';
import { useAuth } from '../auth/hooks';
import { supabase } from '../auth/supabase';
import { CreateUserRequest, Project, ProjectWithMembers, User } from './types';

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

/**
 * Hook to get all users (admin only)
 */
export function useUsers() {
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const { user, isAdmin } = useAuth();

    useEffect(() => {
        if (!user || !isAdmin) {
            setUsers([]);
            setLoading(false);
            return;
        }

        const fetchUsers = async () => {
            try {
                // Use Supabase Admin API to get users
                const { data, error } = await supabase.auth.admin.listUsers();

                if (error) {
                    setError(error.message);
                    return;
                }

                const transformedUsers: User[] = data.users.map((authUser) => ({
                    id: authUser.id,
                    email: authUser.email || '',
                    user_metadata: authUser.user_metadata as {
                        role?: 'admin' | 'student';
                    },
                    created_at: authUser.created_at,
                }));

                setUsers(transformedUsers);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to fetch users');
            } finally {
                setLoading(false);
            }
        };

        fetchUsers();
    }, [user, isAdmin]);

    return { users, loading, error, refetch: () => setLoading(true) };
}

/**
 * Hook to create a new user (admin only)
 */
export function useCreateUser() {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const { isAdmin } = useAuth();

    const createUser = async (userData: CreateUserRequest) => {
        if (!isAdmin) {
            setError('Not authorized');
            return null;
        }

        setLoading(true);
        setError(null);

        try {
            const { data, error } = await supabase.auth.admin.createUser({
                email: userData.email,
                password: userData.password,
                user_metadata: {
                    role: userData.role,
                },
                email_confirm: true, // Skip email confirmation
            });

            if (error) {
                setError(error.message);
                return null;
            }

            return data.user;
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to create user');
            return null;
        } finally {
            setLoading(false);
        }
    };

    return { createUser, loading, error };
}

/**
 * Hook to delete a user (admin only)
 */
export function useDeleteUser() {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const { isAdmin } = useAuth();

    const deleteUser = async (userId: string) => {
        if (!isAdmin) {
            setError('Not authorized');
            return false;
        }

        setLoading(true);
        setError(null);

        try {
            const { error } = await supabase.auth.admin.deleteUser(userId);

            if (error) {
                setError(error.message);
                return false;
            }

            return true;
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to delete user');
            return false;
        } finally {
            setLoading(false);
        }
    };

    return { deleteUser, loading, error };
}

/**
 * Hook to manage project memberships
 */
export function useProjectMemberships() {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const { isAdmin } = useAuth();

    const addUserToProject = async (userId: string, projectId: string) => {
        if (!isAdmin) {
            setError('Not authorized');
            return false;
        }

        setLoading(true);
        setError(null);

        try {
            const { error } = await supabase.from('project_memberships').insert({
                user_id: userId,
                project_id: projectId,
            });

            if (error) {
                setError(error.message);
                return false;
            }

            return true;
        } catch (err) {
            setError(
                err instanceof Error ? err.message : 'Failed to add user to project',
            );
            return false;
        } finally {
            setLoading(false);
        }
    };

    const removeUserFromProject = async (userId: string, projectId: string) => {
        if (!isAdmin) {
            setError('Not authorized');
            return false;
        }

        setLoading(true);
        setError(null);

        try {
            const { error } = await supabase
                .from('project_memberships')
                .delete()
                .eq('user_id', userId)
                .eq('project_id', projectId);

            if (error) {
                setError(error.message);
                return false;
            }

            return true;
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : 'Failed to remove user from project',
            );
            return false;
        } finally {
            setLoading(false);
        }
    };

    return { addUserToProject, removeUserFromProject, loading, error };
}
