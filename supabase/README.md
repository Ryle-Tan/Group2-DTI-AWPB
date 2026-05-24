# Supabase Schema Notes

This folder keeps the database history for the AWPB Supabase project.

## Migration Policy

Treat files in `migrations/` as append-only once they have been applied to any shared or production Supabase project. Do not rename, delete, reorder, or edit applied migration files unless every database that used them can be reset.

The migration list is longer than the final schema because it includes development history: feature additions, RPC replacements, RLS fixes, and compatibility repairs for already-applied databases.

## Current Migration Groups

| Files | Area | Notes |
|-------|------|-------|
| `001`-`004` | Core schema and base RLS | Main tables, seed lookups, views, profile/entry/target policies, and RLS recursion fix |
| `005` | Legacy AWPB entries table | Older/parallel entry table; keep unless a reset confirms it is unused everywhere |
| `006`-`012` | Auth and account RPCs | Username/email lookup, admin create/update account functions, unique account handling |
| `013`, `015`, `017`, `019`, `021`, `029` | Review and budget transactions | Atomic approve/return/reject/delete behavior and planning-year budget scoping |
| `014`, `018`, `022` | Access control hardening | Active-user checks, admin-managed template table locks, pending-entry deletion policy |
| `016`, `033`, `034` | Optional hierarchy fields | Allows optional classification levels and persists fallback classification text |
| `020` | Password policy | Password validation and guarded admin account RPCs |
| `023`-`026`, `030`-`032` | Archive cleanup and backup tracking | Archive backup history, events, cleanup RPC behavior, retry support |
| `027`-`028` | Account audit/delete | Account activity logs and admin account deletion |

Latest required migration: `034_enforce_optional_na_entry_hierarchy.sql`.

## Cleaner Way To Work With This

For deployed/shared databases, keep the existing migrations and use this file as the readable index of what the final schema represents.

For a fresh project that can be reset, the clean path is:

1. Apply all migrations in numeric order to a disposable database.
2. Verify the app against that database.
3. Dump the resulting schema as a baseline snapshot, for example `supabase/schema/current_schema.sql`.
4. Only replace the old migration chain with a new baseline if all target databases can be reset and re-applied from scratch.

Until that reset is possible, keep adding new migrations after `034`.

## Future Migration Hygiene

- Prefer one migration per feature or bugfix, named after the behavior it changes.
- During local development only, amend an unapplied migration instead of adding a new fixup file.
- Once a migration has been applied to a shared database, add a new migration for corrections.
- Avoid migrations that only re-run a previous file unless the previous file was already applied somewhere and needs a compatibility repair.
- When changing an RPC with `CREATE OR REPLACE FUNCTION`, include the grants/revokes and `NOTIFY pgrst, 'reload schema';` in the same migration.
- Update the "Latest required migration" line in this file whenever a new migration is added.
