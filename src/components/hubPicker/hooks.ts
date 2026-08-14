// SPDX-License-Identifier: MIT
// Copyright (c) 2022 The Pybricks Authors

import { useLocalStorage } from 'usehooks-ts';
import { Hub } from '.';

/**
 * Hook for {@link HubPicker} state backed by local storage.
 *
 * Defaults to SPIKE Prime, which is what this team uses. The picker is still
 * shown where firmware is flashed, since choosing the wrong hub there does
 * real damage and should stay a deliberate choice.
 *
 * @returns Tuple of the current state and setter (like useState()).
 */
export function useHubPickerSelectedHub() {
    return useLocalStorage('hubPicker.selectedHub', Hub.Prime);
}
