-- SPDX-License-Identifier: MIT
-- Copyright (c) 2026 Luke Shepard

-- Schema for the shared project store.
--
-- Apply with:  psql "$DATABASE_URL" -f src/cloud/schema.sql
-- Safe to re-run.

create table if not exists project (
    id          bigserial primary key,
    -- appears in URLs; the unique constraint is what makes slug assignment
    -- race-free, so callers retry on conflict rather than checking first
    slug        text        not null unique,
    name        text        not null check (length(trim(name)) between 1 and 60),
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now(),
    -- projects are archived, never deleted
    archived    boolean     not null default false
);

create table if not exists version (
    id         bigserial primary key,
    project_id bigint      not null references project (id),
    saved_at   timestamptz not null default now(),
    author     text        not null check (length(trim(author)) between 1 and 40),
    note       text        not null default '' check (length(note) <= 280),
    -- maps file path to contents; the whole project is one snapshot, since
    -- saves are whole-project and never partial
    files      jsonb       not null check (jsonb_typeof(files) = 'object' and files <> '{}'::jsonb)
);

-- the feed reads newest first for one project
create index if not exists version_project_saved_at_idx
    on version (project_id, saved_at desc, id desc);

-- One row per project, present only while someone holds the lock.
-- Row absence means unlocked, which makes release a plain delete.
create table if not exists edit_lock (
    project_id bigint      primary key references project (id),
    holder     text        not null check (length(trim(holder)) between 1 and 40),
    -- identifies a browser tab, so a lock taken over after a crash cannot be
    -- used by the original tab, and two tabs of one person stay distinct
    session_id text        not null,
    since      timestamptz not null default now()
);
