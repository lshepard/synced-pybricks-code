# Database Migrations

This project uses Supabase CLI for database schema management with version-controlled migrations.

## Setup

The Supabase CLI is installed locally as a dev dependency. All commands use `npx` to ensure version consistency.

## Available Commands

```bash
# Apply migrations to your remote Supabase database
yarn db:push

# Check migration status
yarn db:status  

# Create a new migration
yarn db:migration "migration_name"

# Reset local dev database (if using Supabase locally)
yarn db:reset
```

## Initial Setup

1. **Link to your Supabase project** (one time setup):
   ```bash
   npx supabase@latest login
   npx supabase@latest link --project-ref your-project-id
   ```

2. **Apply the RBAC migration**:
   ```bash
   yarn db:push
   ```

This will apply the migration in `supabase/migrations/20250808122520_create_rbac_tables.sql`.

## Creating New Migrations

When you need to change the database schema:

```bash
yarn db:migration "add_new_feature"
```

This creates a new timestamped SQL file in `supabase/migrations/` that you can edit and commit to git.

## Migration Files

- `supabase/migrations/` - Version-controlled migration files
- Each migration has a timestamp prefix ensuring proper order
- All team members get the same schema by running `yarn db:push`

## Benefits

- ✅ Version-controlled database schema
- ✅ Team consistency - everyone runs the same migrations  
- ✅ Rollback support
- ✅ No manual copy-paste errors
- ✅ Works with CI/CD pipelines