// Verification script — runs the section 7 queries from supabase/schema.sql
// (read-only) against the linked Supabase project.
// Run: node --env-file=.env scripts/verify-schema.mjs
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function q(label, sql) {
  try {
    const rows = await prisma.$queryRawUnsafe(sql);
    console.log(`\n=== ${label} ===`);
    console.log(JSON.stringify(rows));
  } catch (e) {
    console.log(`\n=== ${label} === ERROR: ${e.message}`);
  }
}

// 1) Tables (expect the 14 Prisma tables)
await q(
  'TABLES (public base tables)',
  `SELECT table_name FROM information_schema.tables
   WHERE table_schema='public' AND table_type='BASE TABLE'
   ORDER BY table_name`,
);

// 2) RLS enabled on every public table (expect all true)
await q(
  'RLS ENABLED (public tables)',
  `SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled
   FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'r'
   ORDER BY c.relname`,
);

// 3) RLS disabled anywhere? (expect empty)
await q(
  'RLS DISABLED (should be empty)',
  `SELECT c.relname
   FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity = false
   ORDER BY c.relname`,
);

// 4) Grants per Data API role (expect anon/authenticated/service_role present)
await q(
  'GRANTS PER ROLE',
  `SELECT grantee, count(*)::int AS grants
   FROM information_schema.role_table_grants
   WHERE table_schema='public' AND grantee IN ('anon','authenticated','service_role')
   GROUP BY grantee ORDER BY grantee`,
);

// 4b) Exactly which tables are granted to anon/authenticated
await q(
  'TABLE GRANTS FOR ANON/AUTHENTICATED',
  `SELECT grantee, table_name, privilege_type
   FROM information_schema.role_table_grants
   WHERE table_schema='public' AND grantee IN ('anon','authenticated')
   ORDER BY grantee, table_name, privilege_type`,
);

// 5) RLS policies (expect ~20 policies on 13 tables; SearchCache none)
await q(
  'POLICIES',
  `SELECT tablename, policyname FROM pg_policies
   WHERE schemaname='public' ORDER BY tablename`,
);

await prisma.$disconnect();
console.log('\n[done]');
