// SPDX-License-Identifier: MIT
// Copyright (c) 2020-2023 The Pybricks Authors

import './index.scss';
import { HotkeysProvider, OverlayToaster } from '@blueprintjs/core';
import { configureStore } from '@reduxjs/toolkit';
import { I18nContext } from '@shopify/react-i18n';
import React from 'react';
import { OverlayProvider } from 'react-aria';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { RouterProvider, createBrowserRouter } from 'react-router-dom';
import { createLogger } from 'redux-logger';
import createSagaMiddleware from 'redux-saga';
import { appVersion } from './app/constants';
import Dashboard from './cloud/Dashboard';
import ProjectPage from './cloud/ProjectPage';
import { closeAllFilesMiddleware } from './cloud/useProjectFiles';
import { db } from './fileStorage/context';
import { i18nManager } from './i18n';
import { rootReducer } from './reducers';
import { serializableCheck } from './redux';
import reportWebVitals from './reportWebVitals';
import rootSaga, { RootSagaContext } from './sagas';
import { defaultTerminalContext } from './terminal/TerminalContext';
import { defined } from './utils';
import { createCountFunc } from './utils/iter';

const toasterRef = React.createRef<OverlayToaster>();

const sagaMiddleware = createSagaMiddleware<RootSagaContext>({
    context: {
        nextMessageId: createCountFunc(),
        terminal: defaultTerminalContext,
        fileStorage: db,
        toasterRef,
    },
});

// TODO: add runtime option or filter - logger affects firmware flash performance
const loggerMiddleware = createLogger({ predicate: () => false });

const store = configureStore({
    reducer: rootReducer,
    middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware({ serializableCheck })
            .concat(sagaMiddleware)
            .concat(closeAllFilesMiddleware)
            .concat(loggerMiddleware),
});

// special styling for beta versions
if (appVersion.match(/beta/)) {
    document.body.classList.add('pb-beta');
}

// prevent default drag/drop which just "downloads" any file dropped anywhere
// in the browser window

const dragEventHandler = (e: DragEvent) => {
    if (
        e.target instanceof Element &&
        !e.target.classList.contains('pb-dropzone-root')
    ) {
        e.preventDefault();

        if (e.dataTransfer) {
            e.dataTransfer.effectAllowed = 'none';
            e.dataTransfer.dropEffect = 'none';
        }
    }
};

window.addEventListener('dragenter', dragEventHandler, false);
window.addEventListener('dragover', dragEventHandler);
window.addEventListener('drop', dragEventHandler);

sagaMiddleware.run(rootSaga);

const container = document.getElementById('root');
defined(container);
const root = createRoot(container);

// The dashboard is the entry point, and the editor lives under a project, so
// that a project can be linked to and reopened.
const router = createBrowserRouter([
    { path: '/', element: <Dashboard /> },
    { path: '/project/:slug', element: <ProjectPage /> },
    // anything else is a mistyped or stale link; the dashboard is the way back
    { path: '*', element: <Dashboard /> },
]);

root.render(
    <Provider store={store}>
        <I18nContext.Provider value={i18nManager}>
            <OverlayProvider>
                <HotkeysProvider>
                    <RouterProvider router={router} />
                </HotkeysProvider>
            </OverlayProvider>
            <OverlayToaster ref={toasterRef} />
        </I18nContext.Provider>
    </Provider>,
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
