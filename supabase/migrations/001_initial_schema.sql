-- ============================================================
-- Luma — Private Invite-Only Local Helpers Directory
-- Migration: 001_initial_schema
-- ============================================================
-- Auth model: custom Telegram initData validated in Edge Function.
-- The Edge Function sets auth.uid() to the user's uuid from users table.
-- service_role (Edge Functions) bypasses RLS for admin write operations.
-- ============================================================


-- ============================================================
-- HELPER FUNCTION: get_my_role()
-- Reads the role of the currently authenticated user.
-- Used in RLS policies to gate access by role.
-- ============================================================

CREATE OR REPLACE FUNCTION get_my_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT role
  FROM public.luma_users
  WHERE id = auth.uid()
$$;


-- ============================================================
-- TABLE: users
-- ============================================================

CREATE TABLE public.luma_users (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id     bigint      UNIQUE NOT NULL,
  name            text        NOT NULL,
  telegram_handle text,
  avatar_url      text,
  role            text        NOT NULL DEFAULT 'client'
                              CONSTRAINT users_role_check
                              CHECK (role IN ('client', 'helper', 'trusted_circle', 'admin')),
  status          text        NOT NULL DEFAULT 'active'
                              CONSTRAINT users_status_check
                              CHECK (status IN ('active', 'banned')),
  current_city    text        NOT NULL DEFAULT 'phangan',
  language        text        NOT NULL DEFAULT 'en',
  invited_by      uuid        REFERENCES public.luma_users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_luma_users_telegram_id ON public.luma_users(telegram_id);

-- RLS
ALTER TABLE public.luma_users ENABLE ROW LEVEL SECURITY;

-- SELECT: user reads own row; admin reads all
CREATE POLICY users_select_own
  ON public.luma_users
  FOR SELECT
  TO authenticated
  USING (
    id = auth.uid()
    OR get_my_role() = 'admin'
  );

-- INSERT: service_role only (Edge Function on first login — bypasses RLS automatically)
-- No INSERT policy needed: RLS blocks authenticated role; service_role bypasses.

-- UPDATE: user updates own row (restricted columns enforced at app layer and below);
--         admin updates all rows.
-- Column-level restriction is enforced via a separate policy for non-admins.
CREATE POLICY users_update_own
  ON public.luma_users
  FOR UPDATE
  TO authenticated
  USING (
    id = auth.uid()
    OR get_my_role() = 'admin'
  )
  WITH CHECK (
    id = auth.uid()
    OR get_my_role() = 'admin'
  );

-- DELETE: admin only (service_role bypasses automatically for Edge Functions)
CREATE POLICY users_delete_admin
  ON public.luma_users
  FOR DELETE
  TO authenticated
  USING (get_my_role() = 'admin');


-- ============================================================
-- TABLE: helper_profiles
-- ============================================================

CREATE TABLE public.luma_helper_profiles (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        NOT NULL REFERENCES public.luma_users(id) ON DELETE CASCADE,
  display_name    text        NOT NULL,
  category        text        NOT NULL
                              CONSTRAINT helper_profiles_category_check
                              CHECK (category IN ('cleaner', 'nanny', 'assistant', 'handyman', 'chef', 'driver')),
  bio             text,
  languages       text[],
  location_area   text,
  city            text        NOT NULL DEFAULT 'phangan',
  -- work_type is admin-only metadata, never surfaced in public-facing queries
  work_type       text        NOT NULL DEFAULT 'local'
                              CONSTRAINT helper_profiles_work_type_check
                              CHECK (work_type IN ('local', 'expat')),
  price_from      numeric,
  price_unit      text        CONSTRAINT helper_profiles_price_unit_check
                              CHECK (price_unit IN ('hour', 'visit', 'day', 'project')),
  telegram_handle text        NOT NULL,
  avatar_url      text,
  is_active       boolean     NOT NULL DEFAULT false,
  is_featured     boolean     NOT NULL DEFAULT false,
  featured_until  timestamptz,
  trust_status    text        NOT NULL DEFAULT 'pending'
                              CONSTRAINT helper_profiles_trust_status_check
                              CHECK (trust_status IN ('pending', 'approved', 'rejected', 'hidden')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_luma_helper_profiles_user_id
  ON public.luma_helper_profiles(user_id);

CREATE INDEX idx_luma_helper_profiles_city_trust_active
  ON public.luma_helper_profiles(city, trust_status, is_active);

-- updated_at trigger
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_luma_helper_profiles_updated_at
  BEFORE UPDATE ON public.luma_helper_profiles
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- RLS
ALTER TABLE public.luma_helper_profiles ENABLE ROW LEVEL SECURITY;

-- SELECT: client + helper see only approved + active profiles (work_type column is
--         returned but callers must strip it; if stricter isolation is needed, use
--         a view that excludes the column).
--         trusted_circle sees approved OR pending.
--         admin sees all.
CREATE POLICY helper_profiles_select_approved
  ON public.luma_helper_profiles
  FOR SELECT
  TO authenticated
  USING (
    get_my_role() = 'admin'
    OR (
      get_my_role() = 'trusted_circle'
      AND trust_status IN ('approved', 'pending')
    )
    OR (
      get_my_role() IN ('client', 'helper')
      AND trust_status = 'approved'
      AND is_active = true
    )
  );

-- INSERT: user inserts own profile; trust_status and is_active are forced to safe
--         defaults by WITH CHECK — prevents a user from self-approving on insert.
CREATE POLICY helper_profiles_insert_own
  ON public.luma_helper_profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND trust_status = 'pending'
    AND is_active = false
  );

-- UPDATE: user can update own profile only while still pending (re-application);
--         cannot flip trust_status or is_active on their own row.
--         admin can update any row without restriction.
CREATE POLICY helper_profiles_update_own_pending
  ON public.luma_helper_profiles
  FOR UPDATE
  TO authenticated
  USING (
    (user_id = auth.uid() AND trust_status = 'pending')
    OR get_my_role() = 'admin'
  )
  WITH CHECK (
    -- Non-admins cannot change trust_status or is_active
    (
      get_my_role() = 'admin'
    )
    OR (
      user_id = auth.uid()
      AND trust_status = 'pending'
      AND is_active = false
    )
  );

-- DELETE: admin only
CREATE POLICY helper_profiles_delete_admin
  ON public.luma_helper_profiles
  FOR DELETE
  TO authenticated
  USING (get_my_role() = 'admin');


-- ============================================================
-- TABLE: helper_applications
-- ============================================================

CREATE TABLE public.luma_helper_applications (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid        NOT NULL REFERENCES public.luma_users(id) ON DELETE CASCADE,
  helper_profile_id  uuid        NOT NULL REFERENCES public.luma_helper_profiles(id) ON DELETE CASCADE,
  status             text        NOT NULL DEFAULT 'pending'
                                 CONSTRAINT helper_applications_status_check
                                 CHECK (status IN ('pending', 'approved', 'rejected')),
  legal_confirmation boolean     NOT NULL DEFAULT false,
  admin_comment      text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_luma_helper_applications_user_id
  ON public.luma_helper_applications(user_id);

CREATE INDEX idx_luma_helper_applications_status
  ON public.luma_helper_applications(status);

-- updated_at trigger
CREATE TRIGGER trg_luma_helper_applications_updated_at
  BEFORE UPDATE ON public.luma_helper_applications
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- RLS
ALTER TABLE public.luma_helper_applications ENABLE ROW LEVEL SECURITY;

-- SELECT: user reads own applications;
--         trusted_circle reads pending applications (for voting);
--         admin reads all.
CREATE POLICY helper_applications_select_own
  ON public.luma_helper_applications
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR (get_my_role() = 'trusted_circle' AND status = 'pending')
    OR get_my_role() = 'admin'
  );

-- INSERT: user inserts own application
CREATE POLICY helper_applications_insert_own
  ON public.luma_helper_applications
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- UPDATE: admin only (via service_role in Edge Functions — bypasses RLS, but
--         an explicit admin policy is included for direct admin DB access)
CREATE POLICY helper_applications_update_admin
  ON public.luma_helper_applications
  FOR UPDATE
  TO authenticated
  USING (get_my_role() = 'admin')
  WITH CHECK (get_my_role() = 'admin');

-- DELETE: admin only
CREATE POLICY helper_applications_delete_admin
  ON public.luma_helper_applications
  FOR DELETE
  TO authenticated
  USING (get_my_role() = 'admin');


-- ============================================================
-- TABLE: approval_votes
-- ============================================================

CREATE TABLE public.luma_approval_votes (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id  uuid        NOT NULL REFERENCES public.luma_helper_applications(id) ON DELETE CASCADE,
  reviewer_id     uuid        NOT NULL REFERENCES public.luma_users(id) ON DELETE CASCADE,
  vote            text        NOT NULL
                              CONSTRAINT approval_votes_vote_check
                              CHECK (vote IN ('approve', 'reject', 'skip')),
  comment         text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (application_id, reviewer_id)
);

-- Indexes
CREATE INDEX idx_luma_approval_votes_application_id
  ON public.luma_approval_votes(application_id);

-- RLS
ALTER TABLE public.luma_approval_votes ENABLE ROW LEVEL SECURITY;

-- SELECT: reviewer reads own votes; admin reads all
CREATE POLICY approval_votes_select_own
  ON public.luma_approval_votes
  FOR SELECT
  TO authenticated
  USING (
    reviewer_id = auth.uid()
    OR get_my_role() = 'admin'
  );

-- INSERT: trusted_circle members insert own votes;
--         UNIQUE constraint on (application_id, reviewer_id) enforces one vote per reviewer
CREATE POLICY approval_votes_insert_trusted_circle
  ON public.luma_approval_votes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    reviewer_id = auth.uid()
    AND get_my_role() IN ('trusted_circle', 'admin')
  );

-- UPDATE: none (votes are immutable)

-- DELETE: admin only
CREATE POLICY approval_votes_delete_admin
  ON public.luma_approval_votes
  FOR DELETE
  TO authenticated
  USING (get_my_role() = 'admin');


-- ============================================================
-- TABLE: helper_badges
-- ============================================================

CREATE TABLE public.luma_helper_badges (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  helper_profile_id uuid        NOT NULL REFERENCES public.luma_helper_profiles(id) ON DELETE CASCADE,
  badge_key         text        NOT NULL
                                CONSTRAINT helper_badges_badge_key_check
                                CHECK (badge_key IN ('verified', 'family', 'villas', 'english', 'fast', 'recommended')),
  assigned_by       uuid        REFERENCES public.luma_users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.luma_helper_badges ENABLE ROW LEVEL SECURITY;

-- SELECT: all authenticated users
CREATE POLICY helper_badges_select_authenticated
  ON public.luma_helper_badges
  FOR SELECT
  TO authenticated
  USING (true);

-- INSERT: admin only (service_role bypasses for Edge Function use)
CREATE POLICY helper_badges_insert_admin
  ON public.luma_helper_badges
  FOR INSERT
  TO authenticated
  WITH CHECK (get_my_role() = 'admin');

-- DELETE: admin only
CREATE POLICY helper_badges_delete_admin
  ON public.luma_helper_badges
  FOR DELETE
  TO authenticated
  USING (get_my_role() = 'admin');


-- ============================================================
-- TABLE: invite_codes
-- ============================================================

CREATE TABLE public.luma_invite_codes (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  code        text        UNIQUE NOT NULL,
  city        text        NOT NULL DEFAULT 'phangan',
  created_by  uuid        REFERENCES public.luma_users(id) ON DELETE SET NULL,
  used_by     uuid        REFERENCES public.luma_users(id) ON DELETE SET NULL,
  used_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_luma_invite_codes_code
  ON public.luma_invite_codes(code);

CREATE INDEX idx_luma_invite_codes_created_by
  ON public.luma_invite_codes(created_by);

-- RLS
ALTER TABLE public.luma_invite_codes ENABLE ROW LEVEL SECURITY;

-- SELECT: user reads codes they created; admin reads all
CREATE POLICY invite_codes_select_own
  ON public.luma_invite_codes
  FOR SELECT
  TO authenticated
  USING (
    created_by = auth.uid()
    OR get_my_role() = 'admin'
  );

-- INSERT: service_role only (Edge Function generate-invite bypasses RLS)
-- No INSERT policy needed for authenticated role.

-- UPDATE: service_role only (Edge Function validate-invite marks used_by + used_at)
-- No UPDATE policy needed for authenticated role.

-- DELETE: admin only
CREATE POLICY invite_codes_delete_admin
  ON public.luma_invite_codes
  FOR DELETE
  TO authenticated
  USING (get_my_role() = 'admin');


-- ============================================================
-- TABLE: contact_clicks (analytics)
-- ============================================================

CREATE TABLE public.luma_contact_clicks (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  helper_profile_id uuid        NOT NULL REFERENCES public.luma_helper_profiles(id) ON DELETE CASCADE,
  viewer_user_id    uuid        REFERENCES public.luma_users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.luma_contact_clicks ENABLE ROW LEVEL SECURITY;

-- SELECT: admin only
CREATE POLICY contact_clicks_select_admin
  ON public.luma_contact_clicks
  FOR SELECT
  TO authenticated
  USING (get_my_role() = 'admin');

-- INSERT: any authenticated user; viewer_user_id must match auth.uid()
CREATE POLICY contact_clicks_insert_authenticated
  ON public.luma_contact_clicks
  FOR INSERT
  TO authenticated
  WITH CHECK (
    viewer_user_id = auth.uid()
    OR viewer_user_id IS NULL
  );

-- UPDATE: none
-- DELETE: none
