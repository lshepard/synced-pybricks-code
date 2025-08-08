// SPDX-License-Identifier: MIT
// Copyright (c) 2023 The Pybricks Authors

import './projectSelector.scss';
import {
    Button,
    ButtonGroup,
    Callout,
    Card,
    Intent,
    NonIdealState,
    Spinner,
} from '@blueprintjs/core';
import { FolderClose, FolderOpen, Plus, Settings, User } from '@blueprintjs/icons';
import React, { useState } from 'react';
import { useAuth } from '../auth/hooks';
import AdminPanel from './AdminPanel';
import { useProjects } from './hooks';
import { ProjectWithMembers } from './types';

type ProjectCardProps = {
    project: ProjectWithMembers;
    onSelect: (project: ProjectWithMembers) => void;
};

const ProjectCard: React.FunctionComponent<ProjectCardProps> = ({
    project,
    onSelect,
}) => {
    return (
        <Card className="pb-project-card" interactive onClick={() => onSelect(project)}>
            <div className="pb-project-card-header">
                <div className="pb-project-card-icon">
                    <FolderClose size={24} />
                </div>
                <div className="pb-project-card-title">
                    <h3>{project.name}</h3>
                    {project.description && (
                        <p className="pb-project-description">{project.description}</p>
                    )}
                </div>
            </div>

            <div className="pb-project-card-footer">
                <div className="pb-project-stats">
                    <span className="bp5-text-muted">
                        <User size={12} /> {project.member_count} member
                        {project.member_count !== 1 ? 's' : ''}
                    </span>
                </div>
                <div className="pb-project-actions">
                    <Button
                        icon={<FolderOpen />}
                        minimal
                        small
                        onClick={(e) => {
                            e.stopPropagation();
                            onSelect(project);
                        }}
                    >
                        Open
                    </Button>
                </div>
            </div>
        </Card>
    );
};

const ProjectSelector: React.FunctionComponent = () => {
    const { user, isAdmin, signOut } = useAuth();
    const { projects, loading, error, refetch } = useProjects();
    const [showAdminPanel, setShowAdminPanel] = useState(false);
    const [adminPanelMode, setAdminPanelMode] = useState<'create' | 'manage'>('create');

    const handleProjectSelect = (project: ProjectWithMembers) => {
        // TODO: Navigate to project workspace
        console.log('Selected project:', project);
        alert(
            `Opening project: ${project.name}\n(Project workspace not implemented yet)`,
        );
    };

    if (loading) {
        return (
            <div className="pb-project-selector-loading">
                <Spinner size={40} />
                <p>Loading your projects...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="pb-project-selector-error">
                <Callout intent={Intent.DANGER}>
                    <h4>Error Loading Projects</h4>
                    <p>{error}</p>
                </Callout>
            </div>
        );
    }

    return (
        <div className="pb-project-selector">
            <div className="pb-project-selector-header">
                <div className="pb-project-selector-title">
                    <h1>Welcome back, {user?.email?.split('@')[0]}!</h1>
                    <p className="bp5-text-muted">
                        {isAdmin ? 'Admin' : 'Student'} • Select a project to continue
                    </p>
                </div>

                <div className="pb-project-selector-actions">
                    {isAdmin && (
                        <ButtonGroup>
                            <Button
                                icon={<Plus />}
                                intent={Intent.PRIMARY}
                                onClick={() => {
                                    setAdminPanelMode('create');
                                    setShowAdminPanel(true);
                                }}
                            >
                                New Project
                            </Button>
                            <Button
                                icon={<Settings />}
                                onClick={() => {
                                    setAdminPanelMode('manage');
                                    setShowAdminPanel(true);
                                }}
                            >
                                Manage Projects
                            </Button>
                        </ButtonGroup>
                    )}
                    <Button onClick={signOut} minimal>
                        Sign Out
                    </Button>
                </div>
            </div>

            <div className="pb-project-selector-content">
                {projects.length === 0 ? (
                    <NonIdealState
                        icon={<FolderClose />}
                        title="No Projects"
                        description={
                            isAdmin
                                ? "You haven't created any projects yet. Click 'New Project' to get started."
                                : "You're not a member of any projects yet. Contact your instructor to be added to a project."
                        }
                        action={
                            isAdmin ? (
                                <Button
                                    icon={<Plus />}
                                    intent={Intent.PRIMARY}
                                    onClick={() => {
                                        setAdminPanelMode('create');
                                        setShowAdminPanel(true);
                                    }}
                                >
                                    Create Your First Project
                                </Button>
                            ) : undefined
                        }
                    />
                ) : (
                    <div className="pb-project-grid">
                        {projects.map((project) => (
                            <ProjectCard
                                key={project.id}
                                project={project}
                                onSelect={handleProjectSelect}
                            />
                        ))}
                    </div>
                )}
            </div>

            {showAdminPanel && (
                <div className="pb-admin-panel-overlay">
                    <AdminPanel
                        mode={adminPanelMode}
                        onClose={() => setShowAdminPanel(false)}
                        onProjectCreated={() => {
                            refetch();
                        }}
                    />
                </div>
            )}
        </div>
    );
};

export default ProjectSelector;
