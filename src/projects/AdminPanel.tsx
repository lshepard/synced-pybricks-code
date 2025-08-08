// SPDX-License-Identifier: MIT
// Copyright (c) 2023 The Pybricks Authors

import {
    Button,
    Callout,
    FormGroup,
    InputGroup,
    Intent,
    Spinner,
    Tab,
    TabId,
    Tabs,
    TextArea,
} from '@blueprintjs/core';
import { Cross, Plus } from '@blueprintjs/icons';
import React, { useState } from 'react';
import ProjectMemberships from './ProjectMemberships';
import UserManagement from './UserManagement';
import { useCreateProject } from './hooks';

type AdminPanelProps = {
    onClose: () => void;
    onProjectCreated?: () => void;
    mode?: 'create' | 'manage';
};

const AdminPanel: React.FunctionComponent<AdminPanelProps> = ({
    onClose,
    onProjectCreated,
    mode = 'create',
}) => {
    const [activeTab, setActiveTab] = useState<TabId>(
        mode === 'create' ? 'create-project' : 'manage-users',
    );
    const [projectName, setProjectName] = useState('');
    const [projectDescription, setProjectDescription] = useState('');
    const { createProject, loading, error } = useCreateProject();

    const handleCreateProject = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!projectName.trim()) {
            return;
        }

        const project = await createProject(
            projectName.trim(),
            projectDescription.trim() || undefined,
        );

        if (project) {
            setProjectName('');
            setProjectDescription('');
            onProjectCreated?.();
            onClose();
        }
    };

    return (
        <div className="pb-admin-panel">
            <div className="pb-admin-panel-header">
                <h2>{mode === 'create' ? 'Create New Project' : 'Manage Projects'}</h2>
                <Button icon={<Cross />} minimal onClick={onClose} aria-label="Close" />
            </div>

            <Tabs selectedTabId={activeTab} onChange={setActiveTab}>
                <Tab id="create-project" title="Create Project" />
                <Tab id="manage-users" title="Manage Users" />
                <Tab id="manage-memberships" title="Project Memberships" />
            </Tabs>

            <div className="pb-admin-panel-content">
                {activeTab === 'create-project' && (
                    <form onSubmit={handleCreateProject}>
                        <FormGroup
                            label="Project Name"
                            labelFor="project-name"
                            helperText="Choose a descriptive name for your project"
                        >
                            <InputGroup
                                id="project-name"
                                value={projectName}
                                onChange={(e) => setProjectName(e.target.value)}
                                placeholder="e.g., Robotics Club 2024"
                                required
                                disabled={loading}
                            />
                        </FormGroup>

                        <FormGroup
                            label="Description"
                            labelFor="project-description"
                            helperText="Optional description of the project"
                        >
                            <TextArea
                                id="project-description"
                                value={projectDescription}
                                onChange={(e) => setProjectDescription(e.target.value)}
                                placeholder="Brief description of what this project is for..."
                                rows={3}
                                disabled={loading}
                            />
                        </FormGroup>

                        {error && (
                            <Callout
                                intent={Intent.DANGER}
                                style={{ marginBottom: '16px' }}
                            >
                                {error}
                            </Callout>
                        )}

                        <div className="pb-admin-panel-actions">
                            <Button onClick={onClose} disabled={loading}>
                                Cancel
                            </Button>
                            <Button
                                type="submit"
                                intent={Intent.PRIMARY}
                                icon={loading ? <Spinner size={16} /> : <Plus />}
                                disabled={loading || !projectName.trim()}
                            >
                                Create Project
                            </Button>
                        </div>
                    </form>
                )}

                {activeTab === 'manage-users' && <UserManagement />}

                {activeTab === 'manage-memberships' && <ProjectMemberships />}
            </div>
        </div>
    );
};

export default AdminPanel;
