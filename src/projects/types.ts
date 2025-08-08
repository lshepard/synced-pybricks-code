// SPDX-License-Identifier: MIT
// Copyright (c) 2023 The Pybricks Authors

export type Project = {
    id: string;
    name: string;
    description?: string;
    created_by: string;
    created_at: string;
    updated_at: string;
};

export type ProjectMembership = {
    id: string;
    user_id: string;
    project_id: string;
    joined_at: string;
};

export type ProjectWithMembers = Project & {
    member_count: number;
    members?: Array<{
        user_id: string;
        email: string;
        joined_at: string;
    }>;
};

export type User = {
    id: string;
    email: string;
    user_metadata?: {
        role?: 'admin' | 'student';
    };
    created_at: string;
};

export type CreateUserRequest = {
    email: string;
    password: string;
    role: 'admin' | 'student';
};
