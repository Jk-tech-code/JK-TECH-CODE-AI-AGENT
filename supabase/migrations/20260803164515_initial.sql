-- ============================================================
-- JK-TECH-CODE AI AGENT — COMPLETE SUPABASE SCHEMA (SINGLE FILE)
-- ============================================================
-- Postgres 17 (your project runs 17.6). gen_random_uuid() is built-in.
--
-- This is the ONE file to run in the Supabase SQL Editor. It contains:
--   1) Standard Supabase access (undoes any previous lockdown)
--   2) All tables (mirrors prisma/schema.prisma EXACTLY — quoted camelCase
--      names, because Prisma resolves them case-sensitively, so running
--      this first means `npx prisma db push` reports "no changes")
--   3) Indexes
--   4) Row-Level Security policies (merged from the old rls.sql)
--   5) Data API grants
--   6) Optional auto-profile trigger on signup
--   7) Verification queries
--
-- SECURITY MODEL — STANDARD SUPABASE (NO REVOKES):
--   * anon / authenticated CAN reach tables through the Supabase Data API
--     (PostgREST), but ROW LEVEL SECURITY (RLS) controls exactly which rows
--     each user can see/modify. That is Supabase's built-in access control.
--   * Prisma connects as the `postgres` role (pooler) and bypasses RLS —
--     the app's backend keeps full control.
--   * `service_role` (SUPABASE_SECRET_KEY -> supabaseAdmin) is granted full
--     access and also bypasses RLS.
--
-- Idempotent: safe to run multiple times. Does NOT drop existing tables.
-- ============================================================

-- ============================================================
-- 1) RESTORE STANDARD SUPABASE ACCESS
-- ============================================================
-- If a previous lockdown (REVOKE) script was ever run, these statements
-- restore the normal Supabase privilege model. On a fresh project they are
-- harmless no-ops. Future tables created as `postgres` are automatically
-- exposed to the Data API again (Supabase default behavior).

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON ROUTINES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON TYPES TO anon, authenticated, service_role;

-- NOTE: ALTER DEFAULT PRIVILEGES accepts TABLES / SEQUENCES / FUNCTIONS /
-- ROUTINES / TYPES (NOT "PROCEDURES" — use ROUTINES to cover procedures).

-- NOTE: because EXECUTE on new functions is granted to anon/authenticated
-- by default, keep any future SECURITY DEFINER function out of the public
-- schema (or revoke EXECUTE on it) so it can't be called by clients.

-- ============================================================
-- 2) CREATE TABLES
-- ============================================================

-- User — id comes from Supabase Auth (auth.users.id), no default.
CREATE TABLE IF NOT EXISTS public."User" (
  "id"        TEXT        NOT NULL,
  "email"     TEXT        NOT NULL,
  "name"      TEXT,
  "avatarUrl" TEXT,
  "role"      TEXT        NOT NULL DEFAULT 'user',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "User_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "User_email_key" UNIQUE ("email")
);

CREATE TABLE IF NOT EXISTS public."UserPreference" (
  "id"        TEXT        NOT NULL DEFAULT gen_random_uuid(),
  "userId"    TEXT        NOT NULL,
  "key"       TEXT        NOT NULL,
  "value"     TEXT        NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "UserPreference_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "UserPreference_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES public."User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "UserPreference_userId_key_key" UNIQUE ("userId", "key")
);

CREATE TABLE IF NOT EXISTS public."Post" (
  "id"        TEXT        NOT NULL DEFAULT gen_random_uuid(),
  "title"     TEXT        NOT NULL,
  "content"   TEXT,
  "published" BOOLEAN     NOT NULL DEFAULT false,
  "authorId"  TEXT        NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "Post_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Post_authorId_fkey"
    FOREIGN KEY ("authorId") REFERENCES public."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS public."Session" (
  "id"        TEXT        NOT NULL DEFAULT gen_random_uuid(),
  "userId"    TEXT        NOT NULL,
  "type"      TEXT        NOT NULL,
  "context"   TEXT,
  "metadata"  TEXT,
  "expiresAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "Session_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Session_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES public."User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS public."Conversation" (
  "id"        TEXT        NOT NULL DEFAULT gen_random_uuid(),
  "userId"    TEXT,
  "title"     TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Conversation_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES public."User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS public."ConversationMessage" (
  "id"             TEXT        NOT NULL DEFAULT gen_random_uuid(),
  "conversationId" TEXT        NOT NULL,
  "role"           TEXT        NOT NULL,
  "content"        TEXT        NOT NULL,
  "metadata"       TEXT,
  "tokenCount"     INTEGER,
  "createdAt"      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "ConversationMessage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ConversationMessage_conversationId_fkey"
    FOREIGN KEY ("conversationId") REFERENCES public."Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS public."Agent" (
  "id"          TEXT        NOT NULL DEFAULT gen_random_uuid(),
  "userId"      TEXT,
  "agentId"     TEXT        NOT NULL,
  "name"        TEXT        NOT NULL,
  "description" TEXT,
  "config"      TEXT,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "Agent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Agent_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES public."User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS public."AgentTask" (
  "id"           TEXT        NOT NULL DEFAULT gen_random_uuid(),
  "agentId"      TEXT        NOT NULL,
  "input"        TEXT        NOT NULL,
  "output"       TEXT,
  "confidence"   DOUBLE PRECISION,
  "modelUsed"    TEXT,
  "latencyMs"    INTEGER,
  "metadata"     TEXT,
  "parentTaskId" TEXT,
  "status"       TEXT        NOT NULL DEFAULT 'pending',
  "createdAt"    TIMESTAMPTZ NOT NULL DEFAULT now(),
  "completedAt"  TIMESTAMPTZ,
  CONSTRAINT "AgentTask_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AgentTask_agentId_fkey"
    FOREIGN KEY ("agentId") REFERENCES public."Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS public."Document" (
  "id"         TEXT        NOT NULL DEFAULT gen_random_uuid(),
  "userId"     TEXT,
  "title"      TEXT        NOT NULL,
  "content"    TEXT,
  "sourceType" TEXT        NOT NULL,
  "source"     TEXT,
  "fileType"   TEXT,
  "fileSize"   INTEGER,
  "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "Document_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Document_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES public."User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS public."DocumentChunk" (
  "id"         TEXT        NOT NULL DEFAULT gen_random_uuid(),
  "documentId" TEXT        NOT NULL,
  "content"    TEXT        NOT NULL,
  "chunkIndex" INTEGER     NOT NULL,
  "embedding"  TEXT,
  "metadata"   TEXT,
  "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "DocumentChunk_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DocumentChunk_documentId_fkey"
    FOREIGN KEY ("documentId") REFERENCES public."Document"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS public."SearchCache" (
  "id"        TEXT        NOT NULL DEFAULT gen_random_uuid(),
  "query"     TEXT        NOT NULL,
  "results"   TEXT        NOT NULL,
  "engine"    TEXT        NOT NULL,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "SearchCache_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."MemoryEntry" (
  "id"           TEXT        NOT NULL DEFAULT gen_random_uuid(),
  "type"         TEXT        NOT NULL,
  "content"      TEXT        NOT NULL,
  "tags"         TEXT        NOT NULL,
  "userId"       TEXT,
  "accessCount"  INTEGER     NOT NULL DEFAULT 0,
  "ttl"          INTEGER,
  "createdAt"    TIMESTAMPTZ NOT NULL DEFAULT now(),
  "lastAccessed" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "MemoryEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."Feedback" (
  "id"        TEXT        NOT NULL DEFAULT gen_random_uuid(),
  "sessionId" TEXT,
  "messageId" TEXT,
  "rating"    INTEGER,
  "comment"   TEXT,
  "category"  TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "Feedback_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."ApiLog" (
  "id"         TEXT        NOT NULL DEFAULT gen_random_uuid(),
  "endpoint"   TEXT        NOT NULL,
  "method"     TEXT        NOT NULL,
  "statusCode" INTEGER     NOT NULL,
  "latencyMs"  INTEGER     NOT NULL,
  "userId"     TEXT,
  "modelUsed"  TEXT,
  "tokenCount" INTEGER,
  "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "ApiLog_pkey" PRIMARY KEY ("id")
);

-- ============================================================
-- 3) INDEXES (mirror @@index in the Prisma schema)
-- ============================================================

CREATE INDEX IF NOT EXISTS "User_role_idx"            ON public."User" ("role");
CREATE INDEX IF NOT EXISTS "UserPreference_userId_idx" ON public."UserPreference" ("userId");
CREATE INDEX IF NOT EXISTS "Post_authorId_idx"        ON public."Post" ("authorId");
CREATE INDEX IF NOT EXISTS "Post_published_idx"       ON public."Post" ("published");
CREATE INDEX IF NOT EXISTS "Session_userId_idx"       ON public."Session" ("userId");
CREATE INDEX IF NOT EXISTS "Session_expiresAt_idx"    ON public."Session" ("expiresAt");
CREATE INDEX IF NOT EXISTS "Conversation_userId_updatedAt_idx" ON public."Conversation" ("userId", "updatedAt");
CREATE INDEX IF NOT EXISTS "ConversationMessage_conversationId_idx" ON public."ConversationMessage" ("conversationId");
CREATE INDEX IF NOT EXISTS "ConversationMessage_conversationId_createdAt_idx" ON public."ConversationMessage" ("conversationId", "createdAt");
CREATE INDEX IF NOT EXISTS "Agent_userId_idx"         ON public."Agent" ("userId");
CREATE INDEX IF NOT EXISTS "Agent_agentId_idx"        ON public."Agent" ("agentId");
CREATE INDEX IF NOT EXISTS "AgentTask_agentId_idx"    ON public."AgentTask" ("agentId");
CREATE INDEX IF NOT EXISTS "AgentTask_status_idx"     ON public."AgentTask" ("status");
CREATE INDEX IF NOT EXISTS "AgentTask_parentTaskId_idx" ON public."AgentTask" ("parentTaskId");
CREATE INDEX IF NOT EXISTS "Document_userId_createdAt_idx" ON public."Document" ("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "DocumentChunk_documentId_idx" ON public."DocumentChunk" ("documentId");
CREATE INDEX IF NOT EXISTS "DocumentChunk_documentId_chunkIndex_idx" ON public."DocumentChunk" ("documentId", "chunkIndex");
CREATE INDEX IF NOT EXISTS "SearchCache_query_idx"    ON public."SearchCache" ("query");
CREATE INDEX IF NOT EXISTS "SearchCache_engine_expiresAt_idx" ON public."SearchCache" ("engine", "expiresAt");
CREATE INDEX IF NOT EXISTS "MemoryEntry_userId_type_idx" ON public."MemoryEntry" ("userId", "type");
CREATE INDEX IF NOT EXISTS "MemoryEntry_type_tags_idx" ON public."MemoryEntry" ("type", "tags");
CREATE INDEX IF NOT EXISTS "MemoryEntry_lastAccessed_idx" ON public."MemoryEntry" ("lastAccessed");
CREATE INDEX IF NOT EXISTS "Feedback_sessionId_idx"   ON public."Feedback" ("sessionId");
CREATE INDEX IF NOT EXISTS "Feedback_messageId_idx"   ON public."Feedback" ("messageId");
CREATE INDEX IF NOT EXISTS "Feedback_category_idx"    ON public."Feedback" ("category");
CREATE INDEX IF NOT EXISTS "ApiLog_endpoint_createdAt_idx" ON public."ApiLog" ("endpoint", "createdAt");
CREATE INDEX IF NOT EXISTS "ApiLog_userId_idx"        ON public."ApiLog" ("userId");

-- ============================================================
-- 4) ROW LEVEL SECURITY (RLS — Supabase's access control)
-- ============================================================
-- Enables RLS on every table and creates per-user policies. This is what
-- actually controls Data API access now (no revokes). Policies use explicit
-- `TO` clauses (the deprecated auth.role() form is not used). Prisma
-- (postgres) and service_role bypass RLS and are unaffected.

ALTER TABLE public."User"              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."UserPreference"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Post"              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Session"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Conversation"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ConversationMessage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Agent"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."AgentTask"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Document"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."DocumentChunk"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."SearchCache"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."MemoryEntry"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Feedback"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ApiLog"            ENABLE ROW LEVEL SECURITY;

-- --- User ---
DROP POLICY IF EXISTS "Users can view own profile" ON public."User";
CREATE POLICY "Users can view own profile" ON public."User"
  FOR SELECT TO authenticated
  USING (auth.uid()::text = "id");

DROP POLICY IF EXISTS "Users can update own profile" ON public."User";
CREATE POLICY "Users can update own profile" ON public."User"
  FOR UPDATE TO authenticated
  USING (auth.uid()::text = "id")
  WITH CHECK (auth.uid()::text = "id");

-- New users can be created during signup (app layer calls syncUser, and the
-- optional trigger in section 6 also inserts). `WITH CHECK` keeps users from
-- creating rows for arbitrary ids.
DROP POLICY IF EXISTS "System can create users" ON public."User";
CREATE POLICY "System can create users" ON public."User"
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid()::text = "id");

-- --- UserPreference ---
DROP POLICY IF EXISTS "Users can manage own preferences" ON public."UserPreference";
CREATE POLICY "Users can manage own preferences" ON public."UserPreference"
  FOR ALL TO authenticated
  USING (auth.uid()::text = "userId")
  WITH CHECK (auth.uid()::text = "userId");

-- --- Post ---
DROP POLICY IF EXISTS "Anyone can read published posts" ON public."Post";
CREATE POLICY "Anyone can read published posts" ON public."Post"
  FOR SELECT TO anon, authenticated
  USING ("published" = true);

DROP POLICY IF EXISTS "Authors can manage own posts" ON public."Post";
CREATE POLICY "Authors can manage own posts" ON public."Post"
  FOR ALL TO authenticated
  USING (auth.uid()::text = "authorId")
  WITH CHECK (auth.uid()::text = "authorId");

-- --- Session ---
DROP POLICY IF EXISTS "Users can read own sessions" ON public."Session";
CREATE POLICY "Users can read own sessions" ON public."Session"
  FOR SELECT TO authenticated
  USING (auth.uid()::text = "userId");

DROP POLICY IF EXISTS "Users can delete own sessions" ON public."Session";
CREATE POLICY "Users can delete own sessions" ON public."Session"
  FOR DELETE TO authenticated
  USING (auth.uid()::text = "userId");

-- --- Conversation ---
DROP POLICY IF EXISTS "Users can manage own conversations" ON public."Conversation";
CREATE POLICY "Users can manage own conversations" ON public."Conversation"
  FOR ALL TO authenticated
  USING (auth.uid()::text = "userId")
  WITH CHECK (auth.uid()::text = "userId");

-- --- ConversationMessage ---
DROP POLICY IF EXISTS "Users can read messages in own conversations" ON public."ConversationMessage";
CREATE POLICY "Users can read messages in own conversations" ON public."ConversationMessage"
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public."Conversation"
      WHERE id = "conversationId" AND "userId" = auth.uid()::text
    )
  );

DROP POLICY IF EXISTS "Users can create messages in own conversations" ON public."ConversationMessage";
CREATE POLICY "Users can create messages in own conversations" ON public."ConversationMessage"
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public."Conversation"
      WHERE id = "conversationId" AND "userId" = auth.uid()::text
    )
  );

-- --- Agent ---
DROP POLICY IF EXISTS "Users can manage own agents" ON public."Agent";
CREATE POLICY "Users can manage own agents" ON public."Agent"
  FOR ALL TO authenticated
  USING (auth.uid()::text = "userId")
  WITH CHECK (auth.uid()::text = "userId");

-- --- AgentTask ---
DROP POLICY IF EXISTS "Users can read tasks from own agents" ON public."AgentTask";
CREATE POLICY "Users can read tasks from own agents" ON public."AgentTask"
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public."Agent"
      WHERE id = "agentId" AND "userId" = auth.uid()::text
    )
  );

-- --- Document ---
DROP POLICY IF EXISTS "Users can manage own documents" ON public."Document";
CREATE POLICY "Users can manage own documents" ON public."Document"
  FOR ALL TO authenticated
  USING (auth.uid()::text = "userId")
  WITH CHECK (auth.uid()::text = "userId");

-- --- DocumentChunk ---
DROP POLICY IF EXISTS "Users can read chunks from own documents" ON public."DocumentChunk";
CREATE POLICY "Users can read chunks from own documents" ON public."DocumentChunk"
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public."Document"
      WHERE id = "documentId" AND "userId" = auth.uid()::text
    )
  );

DROP POLICY IF EXISTS "Users can create chunks in own documents" ON public."DocumentChunk";
CREATE POLICY "Users can create chunks in own documents" ON public."DocumentChunk"
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public."Document"
      WHERE id = "documentId" AND "userId" = auth.uid()::text
    )
  );

-- --- MemoryEntry ---
DROP POLICY IF EXISTS "Users can manage own memory entries" ON public."MemoryEntry";
CREATE POLICY "Users can manage own memory entries" ON public."MemoryEntry"
  FOR ALL TO authenticated
  USING (auth.uid()::text = "userId")
  WITH CHECK (auth.uid()::text = "userId");

-- --- Feedback ---
DROP POLICY IF EXISTS "Anyone can create feedback" ON public."Feedback";
CREATE POLICY "Anyone can create feedback" ON public."Feedback"
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Users can read own feedback" ON public."Feedback";
CREATE POLICY "Users can read own feedback" ON public."Feedback"
  FOR SELECT TO authenticated
  USING (auth.uid()::text = "sessionId");

-- --- ApiLog ---
-- Admin-only (application-level check backs this up).
DROP POLICY IF EXISTS "Admins can read API logs" ON public."ApiLog";
CREATE POLICY "Admins can read API logs" ON public."ApiLog"
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public."User"
      WHERE id = auth.uid()::text AND role = 'admin'
    )
  );

-- --- SearchCache ---
-- System-managed table: no policies (RLS blocks client access; postgres and
-- service_role bypass RLS). Drop the legacy policy from older scripts:
DROP POLICY IF EXISTS "System manages search cache" ON public."SearchCache";

-- ============================================================
-- 5) DATA API GRANTS
-- ============================================================
-- Makes the tables reachable through the Supabase Data (REST) API. RLS in
-- section 4 still controls which rows are visible. Tables intentionally not
-- listed here (SearchCache, ApiLog) stay hidden from clients — the backend
-- reaches them via Prisma/service_role.

GRANT SELECT, INSERT, UPDATE, DELETE ON
  public."User", public."UserPreference", public."Post", public."Session",
  public."Conversation", public."ConversationMessage", public."Agent",
  public."AgentTask", public."Document", public."DocumentChunk",
  public."MemoryEntry", public."Feedback"
TO authenticated;

GRANT SELECT ON
  public."Post", public."Feedback"
TO anon;

GRANT INSERT ON public."Feedback" TO anon;

-- Backend service role keeps full access to every table (incl. hidden ones).
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- Restore EXECUTE on existing functions too (symmetric with section 1's
-- default-privilege restore), in case a previous lockdown revoked them.
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;

-- ============================================================
-- 6) AUTO-CREATE PROFILE ON SIGNUP (ENABLED)
-- ============================================================
-- Creates a public."User" row the moment a Supabase Auth user is created.
-- The app's syncUser() upsert is unaffected (ON CONFLICT DO NOTHING).
-- SECURITY DEFINER runs as `postgres`, so it works with RLS. EXECUTE is
-- revoked from PUBLIC/anon/authenticated so clients cannot call it, then
-- re-granted to supabase_auth_admin (GoTrue signs users up as this role,
-- and the trigger must be executable by it) and service_role.

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

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO supabase_auth_admin, service_role;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- 7) VERIFY
-- ============================================================
-- Run these after executing the script:
--
-- -- Tables exist (expect 14):
-- SELECT table_name FROM information_schema.tables
--   WHERE table_schema = 'public' ORDER BY table_name;
--
-- -- RLS is enabled everywhere (expect 14 rows with rls_enabled = true):
-- SELECT relname, relrowsecurity FROM pg_class
--   WHERE relnamespace = 'public'::regnamespace
--     AND relkind = 'r' AND relrowsecurity = true
--   ORDER BY relname;
--
-- -- Grants are in place for the Data API:
-- SELECT grantee, count(*) AS grants
--   FROM information_schema.role_table_grants
--   WHERE table_schema = 'public'
--     AND grantee IN ('anon', 'authenticated', 'service_role')
--   GROUP BY grantee ORDER BY grantee;
--
-- -- Spot-check a policy:
-- SELECT tablename, policyname FROM pg_policies
--   WHERE schemaname = 'public' ORDER BY tablename;
