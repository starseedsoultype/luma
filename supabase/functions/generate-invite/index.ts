import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/** Decode JWT payload locally — no network call, no auth.getUser() */
function getAuthUserId(authHeader: string): string | null {
  try {
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    const payloadPart = token.split('.')[1];
    if (!payloadPart) return null;
    const normalized = payloadPart.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(
      normalized.length + (4 - (normalized.length % 4)) % 4,
      '='
    );
    const payload = JSON.parse(atob(padded));
    return payload?.sub || null;
  } catch {
    return null;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const debug: Record<string, unknown> = { step: 'start' };

  try {
    // ── 1. Body parsing ──────────────────────────────────────────────────────
    let city = 'phangan';
    try {
      const body = await req.json();
      city = body?.city || 'phangan';
    } catch (_) { /* empty body is fine */ }
    debug.city = city;
    debug.step = 'body_parsed';

    // ── 2. Auth header ───────────────────────────────────────────────────────
    const authHeader = req.headers.get('authorization');
    debug.hasAuthHeader = !!authHeader;
    debug.step = 'auth_header_checked';
    if (!authHeader) throw new Error('Missing authorization header');

    // ── 3. Decode JWT locally (no network call, no getUser()) ────────────────
    const authUserId = getAuthUserId(authHeader);
    debug.authUserId = authUserId;
    debug.step = 'jwt_decoded';
    if (!authUserId) throw new Error('Could not decode auth user id from JWT');

    // ── 4. Service-role client ───────────────────────────────────────────────
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // ── 5. Lookup luma_users by auth_user_id ─────────────────────────────────
    const { data: dbUser1, error: lookup1Error } = await supabase
      .from('luma_users')
      .select('id, status, role')
      .eq('auth_user_id', authUserId)
      .single();

    debug.lookup1Result = dbUser1 ? { id: dbUser1.id, status: dbUser1.status, role: dbUser1.role } : null;
    debug.lookup1Error = lookup1Error?.message ?? null;
    debug.step = 'lookup1_done';

    // ── 6. Fallback: lookup by id ────────────────────────────────────────────
    let dbUser = dbUser1;
    if (!dbUser) {
      const { data: dbUser2, error: lookup2Error } = await supabase
        .from('luma_users')
        .select('id, status, role')
        .eq('id', authUserId)
        .single();

      debug.lookup2Result = dbUser2 ? { id: dbUser2.id, status: dbUser2.status, role: dbUser2.role } : null;
      debug.lookup2Error = lookup2Error?.message ?? null;
      debug.step = 'lookup2_done';
      dbUser = dbUser2;
    }

    // ── 7. Status check ──────────────────────────────────────────────────────
    debug.dbUserFound = !!dbUser;
    debug.dbUserStatus = dbUser?.status ?? null;
    debug.step = 'status_check';
    if (!dbUser) throw new Error('Account not found in luma_users');
    if (dbUser.status !== 'active') throw new Error(`Account not active: status=${dbUser.status}`);

    // ── 8. Insert invite code ────────────────────────────────────────────────
    const code = generateCode();
    debug.step = 'inserting';

    const { data, error: insertError } = await supabase
      .from('luma_invite_codes')
      .insert({ code, city, created_by: dbUser.id })
      .select()
      .single();

    debug.insertError = insertError?.message ?? null;
    debug.step = 'insert_done';
    if (insertError) throw insertError;

    debug.step = 'success';
    return new Response(JSON.stringify({ code: data.code }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    const errMessage = err?.message ?? String(err);
    console.error('generate-invite failed', errMessage, JSON.stringify(debug));

    return new Response(
      JSON.stringify({ error: errMessage, debug }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  return Array.from(crypto.getRandomValues(new Uint8Array(10)))
    .map(b => chars[b % chars.length]).join('');
}
