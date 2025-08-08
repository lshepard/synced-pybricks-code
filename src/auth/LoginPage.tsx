// SPDX-License-Identifier: MIT
// Copyright (c) 2023 The Pybricks Authors

import './loginPage.scss';
import {
    Button,
    Callout,
    Card,
    FormGroup,
    InputGroup,
    Intent,
} from '@blueprintjs/core';
import { Key, Person } from '@blueprintjs/icons';
import React, { useState } from 'react';
import { supabase } from './supabase';

const LoginPage: React.FunctionComponent = () => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            // Smart detection: use input directly if it contains @, otherwise add @local
            const email = username.includes('@') ? username : `${username}@local`;

            const { data, error } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            if (error) {
                setError(error.message);
                return;
            }

            // Success - App component will handle redirect
            console.log('Login successful:', data);
        } catch (err) {
            setError('Login failed. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="pb-login-page">
            <div className="pb-login-container">
                <Card className="pb-login-card">
                    <div className="pb-login-header">
                        <h1>Pybricks Code</h1>
                        <p>Sign in to access your team workspace</p>
                    </div>

                    <form onSubmit={handleLogin}>
                        <FormGroup label="Username or Email" labelFor="username">
                            <InputGroup
                                id="username"
                                leftIcon={<Person />}
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                placeholder="Enter username or email"
                                required
                                disabled={loading}
                            />
                        </FormGroup>

                        <FormGroup label="Password" labelFor="password">
                            <InputGroup
                                id="password"
                                type="password"
                                leftIcon={<Key />}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="Enter your password"
                                required
                                disabled={loading}
                            />
                        </FormGroup>

                        {error && (
                            <Callout intent={Intent.DANGER} className="pb-login-error">
                                {error}
                            </Callout>
                        )}

                        <Button
                            type="submit"
                            intent={Intent.PRIMARY}
                            loading={loading}
                            fill
                            large
                            className="pb-login-button"
                        >
                            Sign In
                        </Button>
                    </form>
                </Card>
            </div>
        </div>
    );
};

export default LoginPage;
