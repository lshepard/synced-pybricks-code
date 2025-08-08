// SPDX-License-Identifier: MIT
// Copyright (c) 2023 The Pybricks Authors

import {
    Button,
    Callout,
    Card,
    HTMLSelect,
    HTMLTable,
    Intent,
    Spinner,
    Tag,
} from '@blueprintjs/core';
import { Plus, Trash } from '@blueprintjs/icons';
import React, { useState } from 'react';
import { useProjectMemberships, useProjects, useUsers } from './hooks';

const ProjectMemberships: React.FunctionComponent = () => {
    const { users, loading: usersLoading } = useUsers();
    const { projects, loading: projectsLoading } = useProjects();
    const {
        addUserToProject,
        removeUserFromProject,
        loading: membershipLoading,
        error,
    } = useProjectMemberships();

    const [selectedUserId, setSelectedUserId] = useState('');
    const [selectedProjectId, setSelectedProjectId] = useState('');

    const handleAddMembership = async () => {
        if (!selectedUserId || !selectedProjectId) {
            return;
        }

        const success = await addUserToProject(selectedUserId, selectedProjectId);
        if (success) {
            setSelectedUserId('');
            setSelectedProjectId('');
            // Refresh would happen here - for now just show success
        }
    };

    const handleRemoveMembership = async (userId: string, projectId: string) => {
        const user = users.find((u) => u.id === userId);
        const project = projects.find((p) => p.id === projectId);

        if (!window.confirm(`Remove ${user?.email} from ${project?.name}?`)) {
            return;
        }

        const success = await removeUserFromProject(userId, projectId);
        if (success) {
            // Refresh would happen here
        }
    };

    // Get all current memberships by combining project member data
    const allMemberships = projects.flatMap((project) =>
        (project.members || []).map((member) => ({
            userId: member.user_id,
            projectId: project.id,
            projectName: project.name,
            userEmail: member.email,
            joinedAt: member.joined_at,
        })),
    );

    const loading = usersLoading || projectsLoading;

    if (loading) {
        return (
            <Card>
                <div style={{ textAlign: 'center', padding: '20px' }}>
                    <Spinner size={30} />
                    <p>Loading data...</p>
                </div>
            </Card>
        );
    }

    return (
        <div className="pb-project-memberships">
            <div style={{ display: 'grid', gap: '24px' }}>
                {/* Add Membership Form */}
                <Card>
                    <h3>Add User to Project</h3>

                    <div
                        style={{
                            display: 'grid',
                            gridTemplateColumns: '1fr 1fr auto',
                            gap: '12px',
                            alignItems: 'end',
                        }}
                    >
                        <div>
                            <label htmlFor="select-user">Select User:</label>
                            <HTMLSelect
                                id="select-user"
                                value={selectedUserId}
                                onChange={(e) => setSelectedUserId(e.target.value)}
                                fill
                                disabled={membershipLoading}
                            >
                                <option value="">Choose a user...</option>
                                {users
                                    .filter(
                                        (user) =>
                                            user.user_metadata?.role === 'student',
                                    )
                                    .map((user) => (
                                        <option key={user.id} value={user.id}>
                                            {user.email}
                                        </option>
                                    ))}
                            </HTMLSelect>
                        </div>

                        <div>
                            <label htmlFor="select-project">Select Project:</label>
                            <HTMLSelect
                                id="select-project"
                                value={selectedProjectId}
                                onChange={(e) => setSelectedProjectId(e.target.value)}
                                fill
                                disabled={membershipLoading}
                            >
                                <option value="">Choose a project...</option>
                                {projects.map((project) => (
                                    <option key={project.id} value={project.id}>
                                        {project.name}
                                    </option>
                                ))}
                            </HTMLSelect>
                        </div>

                        <Button
                            icon={<Plus />}
                            intent={Intent.PRIMARY}
                            onClick={handleAddMembership}
                            disabled={
                                !selectedUserId ||
                                !selectedProjectId ||
                                membershipLoading
                            }
                            loading={membershipLoading}
                        >
                            Add
                        </Button>
                    </div>

                    {error && (
                        <Callout intent={Intent.DANGER} style={{ marginTop: '12px' }}>
                            {error}
                        </Callout>
                    )}
                </Card>

                {/* Current Memberships */}
                <Card>
                    <h3>Current Memberships ({allMemberships.length})</h3>

                    <HTMLTable striped style={{ width: '100%' }}>
                        <thead>
                            <tr>
                                <th>User</th>
                                <th>Project</th>
                                <th>Joined</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {allMemberships.map((membership) => (
                                <tr
                                    key={`${membership.userId}-${membership.projectId}`}
                                >
                                    <td>
                                        <div
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '8px',
                                            }}
                                        >
                                            {membership.userEmail}
                                            <Tag minimal intent={Intent.PRIMARY}>
                                                student
                                            </Tag>
                                        </div>
                                    </td>
                                    <td>{membership.projectName}</td>
                                    <td>
                                        {new Date(
                                            membership.joinedAt,
                                        ).toLocaleDateString()}
                                    </td>
                                    <td>
                                        <Button
                                            icon={<Trash />}
                                            intent={Intent.DANGER}
                                            minimal
                                            small
                                            onClick={() =>
                                                handleRemoveMembership(
                                                    membership.userId,
                                                    membership.projectId,
                                                )
                                            }
                                            loading={membershipLoading}
                                        >
                                            Remove
                                        </Button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </HTMLTable>

                    {allMemberships.length === 0 && (
                        <div
                            style={{
                                textAlign: 'center',
                                padding: '20px',
                                color: '#666',
                            }}
                        >
                            No project memberships found
                        </div>
                    )}
                </Card>
            </div>
        </div>
    );
};

export default ProjectMemberships;
