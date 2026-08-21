# feat(types): update database types and improve type safety (#433)

## Summary
Resolves #433 by updating `src/frontend/src/database.types.ts` with the full Supabase CLI generated schema and strongly-typed helper generics (`Tables`, `TablesInsert`, `TablesUpdate`, `Enums`, `CompositeTypes`).

### Deliverables
- Regenerated `src/frontend/src/database.types.ts` matching latest Supabase tables, views, and enums.
- Added helper type aliases for table operations.
- Enforced strict type safety avoiding untyped `any` database interactions.

Closes #433
