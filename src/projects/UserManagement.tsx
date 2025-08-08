// SPDX-License-Identifier: MIT
// Copyright (c) 2023 The Pybricks Authors

import {
    Button,
    Callout,
    Card,
    FormGroup,
    HTMLTable,
    InputGroup,
    Intent,
    Radio,
    RadioGroup,
    Spinner,
    Tag,
} from '@blueprintjs/core';
import { Plus, Trash, User } from '@blueprintjs/icons';
import React, { useState } from 'react';
import { useCreateUser, useDeleteUser, useUsers } from './hooks';
import { CreateUserRequest } from './types';

const UserCreationForm: React.FunctionComponent<{
    onUserCreated: () => void;
}> = ({ onUserCreated }) => {
    const [formData, setFormData] = useState<CreateUserRequest>({
        email: '',
        password: '',
        role: 'student',
    });
    const { createUser, loading, error } = useCreateUser();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!formData.email || !formData.password) {
            return;
        }

        const user = await createUser(formData);
        if (user) {
            setFormData({ email: '', password: '', role: 'student' });
            onUserCreated();
        }
    };

    return (
        <Card className="pb-user-creation-form">
            <h3>Create New User</h3>

            <form onSubmit={handleSubmit}>
                <FormGroup
                    label="Username or Email"
                    labelFor="user-email"
                    helperText="For usernames, use format: username@local"
                >
                    <InputGroup
                        id="user-email"
                        leftIcon={<User />}
                        value={formData.email}
                        onChange={(e) =>
                            setFormData((prev) => ({ ...prev, email: e.target.value }))
                        }
                        placeholder="john@local or user@company.com"
                        required
                        disabled={loading}
                    />
                </FormGroup>

                <FormGroup label="Password" labelFor="user-password">
                    <InputGroup
                        id="user-password"
                        type="password"
                        value={formData.password}
                        onChange={(e) =>
                            setFormData((prev) => ({
                                ...prev,
                                password: e.target.value,
                            }))
                        }
                        placeholder="Enter password"
                        required
                        disabled={loading}
                    />
                </FormGroup>

                <FormGroup label="Role">
                    <RadioGroup
                        selectedValue={formData.role}
                        onChange={(e) =>
                            setFormData((prev) => ({
                                ...prev,
                                role: e.currentTarget.value as 'admin' | 'student',
                            }))
                        }
                        disabled={loading}
                    >
                        <Radio label="Student" value="student" />
                        <Radio label="Admin" value="admin" />
                    </RadioGroup>
                </FormGroup>

                {error && (
                    <Callout intent={Intent.DANGER} style={{ marginBottom: '16px' }}>
                        {error}
                    </Callout>
                )}

                <Button
                    type="submit"
                    intent={Intent.PRIMARY}
                    icon={loading ? <Spinner size={16} /> : <Plus />}
                    disabled={loading || !formData.email || !formData.password}
                >
                    Create User
                </Button>
            </form>
        </Card>
    );
};

const UserList: React.FunctionComponent<{
    onUserDeleted: () => void;
}> = ({ onUserDeleted }) => {
    const { users, loading, error } = useUsers();
    const { deleteUser, loading: deleteLoading } = useDeleteUser();

    const handleDeleteUser = async (userId: string, userEmail: string) => {
        if (!window.confirm(`Are you sure you want to delete user: ${userEmail}?`)) {
            return;
        }

        const success = await deleteUser(userId);
        if (success) {
            onUserDeleted();
        }
    };

    const getRoleColor = (role?: string) => {
        switch (role) {
            case 'admin':
                return Intent.DANGER;
            case 'student':
                return Intent.PRIMARY;
            default:
                return Intent.NONE;
        }
    };

    if (loading) {
        return (
            <Card>
                <div style={{ textAlign: 'center', padding: '20px' }}>
                    <Spinner size={30} />
                    <p>Loading users...</p>
                </div>
            </Card>
        );
    }

    if (error) {
        return (
            <Callout intent={Intent.DANGER}>
                <h4>Error Loading Users</h4>
                <p>{error}</p>
            </Callout>
        );
    }

    return (
        <Card>
            <h3>All Users ({users.length})</h3>

            <HTMLTable striped style={{ width: '100%' }}>
                <thead>
                    <tr>
                        <th>Email</th>
                        <th>Role</th>
                        <th>Created</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {users.map((user) => (
                        <tr key={user.id}>
                            <td>{user.email}</td>
                            <td>
                                <Tag
                                    intent={getRoleColor(user.user_metadata?.role)}
                                    minimal
                                >
                                    {user.user_metadata?.role || 'student'}
                                </Tag>
                            </td>
                            <td>{new Date(user.created_at).toLocaleDateString()}</td>
                            <td>
                                <Button
                                    icon={<Trash />}
                                    intent={Intent.DANGER}
                                    minimal
                                    small
                                    loading={deleteLoading}
                                    onClick={() =>
                                        handleDeleteUser(user.id, user.email)
                                    }
                                >
                                    Delete
                                </Button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </HTMLTable>

            {users.length === 0 && (
                <div style={{ textAlign: 'center', padding: '20px', color: '#666' }}>
                    No users found
                </div>
            )}
        </Card>
    );
};

const UserManagement: React.FunctionComponent = () => {
    const { refetch: refetchUsers } = useUsers();

    const handleUserAction = () => {
        refetchUsers();
    };

    return (
        <div className="pb-user-management">
            <div style={{ display: 'grid', gap: '24px' }}>
                <UserCreationForm onUserCreated={handleUserAction} />
                <UserList onUserDeleted={handleUserAction} />
            </div>
        </div>
    );
};

export default UserManagement;
