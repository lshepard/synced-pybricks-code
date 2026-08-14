// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Luke Shepard

// The version collection: the feed, and appending to it.
//
// One version lives at versions/[id].ts. Vercel matches a request to a file
// and a single-segment [id] does not also match the bare collection path, so
// the two paths need two files. Both call into ./versions/_handlers.

export { GET, POST } from './versions/_handlers';
