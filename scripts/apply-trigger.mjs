// Applies + verifies the auto-create profile trigger (supabase/schema.sql §6).
// Run: node --env-file=.env scripts/apply-trigger.mjs
// Test data is rolled back — nothing persists.
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();

async function run(label, sql) {
  try {
    await prisma.$executeRawUnsafe(sql);
    console.log(`[ok] ${label}`);
  } catch (e) {
    console.log(`[FAIL] ${label}: ${e.message}`);
    throw e;
  }
}

// 1) Create/replace the function
await run('create function public.handle_new_user()', `
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public."User" ("id", "email", "name", "avatarUrl", "role", "createdAt", "updatedAt")
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data ->> 'name', NEW.raw_user_meta_data ->> 'full_name'),
    COALESCE(NEW.raw_user_meta_data ->> 'avatar_url', NEW.raw_user_meta_data ->> 'picture'),
    'user',
    now(),
    now()
  )
  ON CONFLICT ("id") DO NOTHING;
  RETURN NEW;
END;
$$;
`);

// 2) Lock the function down but keep it callable by Auth + service role
await run('revoke EXECUTE from PUBLIC/anon/authenticated', `
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO supabase_auth_admin, service_role;
`);

// 3) Create the trigger
await run('create trigger on_auth_user_created', `
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
`);

// 4) Verify it exists
const proc = await prisma.$queryRawUnsafe(
  `SELECT proname, prosecdef FROM pg_proc WHERE proname = 'handle_new_user'`,
);
const trg = await prisma.$queryRawUnsafe(
  `SELECT tgname FROM pg_trigger WHERE tgname = 'on_auth_user_created' AND NOT tgisinternal`,
);
console.log('[info] function:', JSON.stringify(proc));
console.log('[info] trigger :', JSON.stringify(trg));

// 5) Functional test — rolled back, nothing persists
try {
  await prisma.$transaction(async (tx) => {
    // Minimal insert into auth.users (required columns without defaults)
    const cols = await tx.$queryRawUnsafe(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'auth' AND table_name = 'users'
         AND is_nullable = 'NO' AND column_default IS NULL`,
    );
    const colNames = cols.map((c) => c.column_name);
    const id = crypto.randomUUID();

    const build = (col) => {
      if (col === 'id') return `'${id}'`;
      if (col === 'instance_id') return `'00000000-0000-0000-0000-000000000000'`;
      if (col.includes('_at')) return 'now()';
      return `''`;
    };

    const colList = [...new Set([...colNames, 'email', 'role', 'aud', 'encrypted_password', 'email_confirmed_at', 'raw_user_meta_data', 'created_at', 'updated_at'])];
    const valList = colList.map((col) =>
      col === 'email' ? `'trigger-test@jktech.local'`
      : col === 'role' || col === 'aud' ? `'authenticated'`
      : col === 'encrypted_password' ? `''`
      : col === 'email_confirmed_at' || col === 'created_at' || col === 'updated_at' ? 'now()'
      : col === 'raw_user_meta_data' ? `'{"name":"Trigger Test"}'::jsonb`
      : build(col),
    );

    const insert = `INSERT INTO auth.users (${colList.map((c) => `"${c}"`).join(', ')})
      VALUES (${valList.join(', ')}) RETURNING id`;
    const inserted = await tx.$queryRawUnsafe(insert);
    const newUserId = inserted[0].id;
    console.log('[test] inserted auth.users row:', newUserId);

    const profile = await tx.$queryRawUnsafe(
      `SELECT "id", "email", "name", "role" FROM public."User" WHERE "id" = '${newUserId}'`,
    );
    console.log('[test] public."User" row created by trigger:', JSON.stringify(profile));
    if (profile.length === 1 && profile[0].role === 'user') {
      console.log('[test] PASS — trigger created the profile row');
    } else {
      console.log('[test] FAIL — profile row not found or wrong shape');
    }

    throw new Error('__ROLLBACK__'); // force rollback: test data never persists
  });
} catch (e) {
  if (e.message !== '__ROLLBACK__') {
    console.log('[test] ERROR:', e.message);
    process.exitCode = 1;
  } else {
    console.log('[test] rolled back — no test data persisted');
  }
}

await prisma.$disconnect();
console.log('[done]');
