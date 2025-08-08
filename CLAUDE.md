# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

- **Start development server**: `yarn start` - Runs the app on http://localhost:3000 with hot reload
- **Build for production**: `yarn build` - Creates optimized production build in `build/` folder
- **Run tests**: `yarn test` - Runs Jest test suite with watch mode
- **Run linting**: `yarn lint` - Runs TypeScript compilation check and ESLint with auto-fix
- **Test coverage**: `yarn coverage` - Generates test coverage report
- **Serve production build locally**: `yarn build && ./scripts/serve.py` - For testing production features like service worker

For testing "powerful web features" (Bluetooth, USB) locally without HTTPS, add `http://localhost:8000` to Chrome flags at `chrome://flags/#unsafely-treat-insecure-origin-as-secure`.

## Project Architecture

This is a React web application for programming LEGO Powered Up hubs using Pybricks MicroPython. Built with Create React App and TypeScript.

### Core Architecture Patterns

- **Redux + Redux-Saga**: State management using Redux with Redux-Saga for side effects
- **Feature-based structure**: Code organized by feature domains (ble/, editor/, firmware/, etc.)
- **Actions/Reducers/Sagas pattern**: Each feature has actions.ts, reducers.ts, and sagas.ts files
- **Internationalization**: Uses @shopify/react-i18n with translation files in each feature's translations/ folder

### Key Directories

- `src/app/` - Main application component and core app logic
- `src/editor/` - Monaco-based Python code editor with Pybricks MicroPython support
- `src/ble/` - Bluetooth Low Energy communication with hubs
- `src/firmware/` - Firmware flashing and bootloader management
- `src/explorer/` - File management and project structure
- `src/terminal/` - REPL terminal interface
- `src/hub/` - Hub connection and program execution
- `src/fileStorage/` - Local file storage using IndexedDB via Dexie
- `src/components/` - Reusable React components
- `src/utils/` - Utility functions and helpers

### State Management

- Root state combines reducers from all features in `src/reducers.ts`
- Root saga orchestrates all feature sagas in `src/sagas.ts`
- Redux store configured with serialization middleware settings in `src/redux.ts`

### Protocol Implementation

- `src/ble-pybricks-service/` - Pybricks protocol v1.4.0 implementation
- `src/ble-lwp3-service/` - LEGO Wireless Protocol v3 support
- `src/lwp3-bootloader/` - Bootloader communication for firmware updates

### Technology Stack

- **React 18** with TypeScript 4.9.x
- **Redux Toolkit** with Redux-Saga for async flows
- **Monaco Editor** for code editing with custom Pybricks language support
- **Blueprint.js** UI components
- **Tailwind CSS** for styling
- **Jest** for testing with React Testing Library
- **Pyodide** for MicroPython compilation
- **Dexie** for IndexedDB file storage

### Browser APIs Used

- Web Bluetooth API for hub communication
- Web USB API for firmware flashing
- File System Access API for project import/export
- Service Worker for offline functionality

## Development Notes

- Uses Yarn 3.x package manager
- Requires Node.js v18.x
- Supports Chrome/Chromium browsers (required for Web Bluetooth/USB)
- Development server runs on port 3000
- Production builds are optimized for web deployment