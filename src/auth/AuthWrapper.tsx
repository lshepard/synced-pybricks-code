// SPDX-License-Identifier: MIT
// Copyright (c) 2023 The Pybricks Authors

import { Spinner } from '@blueprintjs/core';
import React from 'react';
import LoginPage from './LoginPage';
import { useAuth } from './hooks';

type AuthWrapperProps = {
    children: React.ReactNode;
};

const AuthWrapper: React.FunctionComponent<AuthWrapperProps> = ({ children }) => {
    const { user, loading } = useAuth();

    if (loading) {
        return (
            <div className="pb-auth-loading">
                <Spinner size={50} />
                <p>Loading...</p>
            </div>
        );
    }

    if (!user) {
        return <LoginPage />;
    }

    return <>{children}</>;
};

export default AuthWrapper;
