import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ADMIN_TELEGRAM_IDS = [656578642];

async function validateTelegramInitData(
  initData: string,
  botToken: string,
): Promise<Record<string, string> | null> {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');
  const entries = Array.from(params.entries());
  entries.sort(([a], [b]) => a.localeCompare(b));
  const dataCheckString = entries.map(([k, v]) => `${k}=${v}`).join('\n');
  const encoder = new TextEncoder();
  const secretKey = await crypto.subtle.importKey(
    'raw', encoder.encode('WebAppData'),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const botTokenKey = await crypto.subtle.sign('HMAC', secretKey, encoder.encode(botToken));
  const dataKey = await crypto.subtle.importKey(
    'raw', botTokenKey,
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', dataKey, encoder.encode(dataCheckString));
  const computedHash = Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0')).join('');
  if (computedHash !== hash) return null;
  const result: Record<string, string> = {};
  for (const [k, v] of entries) result[k] = v;
  return result;
}

async function derivePassword(telegramId: number, botToken: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(botToken),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(`luma_user_${telegramId}`));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Sign in via email/password to get real JWT tokens + the actual auth.users.id.
// Falls back to creating the auth user if it doesn't exist yet.
async function getAuthTokens(
  telegramId: number,
  botToken: string,
  supabaseUrl: string,
  anonKey: string,
  serviceRoleKey: string,
  existingAuthUserId?: string,
): Promise<{ access_token: string; refresh_token: string; auth_user_id: string }> {
  const email = `tg_${telegramId}@luma.app`;
  const password = await derivePassword(telegramId, botToken);

  const signIn = async () => {
    const res = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: anonKey },
      body: JSON.stringify({ email, password }),
    });
    return res.json();
  };

  let tokenData = await signIn();
  if (tokenData.access_token) {
    return {
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      auth_user_id: tokenData.user?.id,
    };
  }

  // Auth user missing — create it, then retry sign-in
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const createOpts: Record<string, unknown> = { email, password, email_confirm: true };
  if (existingAuthUserId) createOpts.id = existingAuthUserId;
  await adminClient.auth.admin.createUser(createOpts);

  tokenData = await signIn();
  if (!tokenData.access_token) {
    throw new Error('Auth sign-in failed after user creation: ' + JSON.stringify(tokenData));
  }
  return {
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token,
    auth_user_id: tokenData.user?.id,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { initData } = await req.json();
    if (!initData) throw new Error('no initData');

    const botToken = Deno.env.get('LUMA_BOT_TOKEN')!;
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

    if (!botToken) throw new Error('LUMA_BOT_TOKEN not configured');

    // 1. Verify Telegram signature
    const validated = await validateTelegramInitData(initData, botToken);
    if (!validated) {
      return new Response(
        JSON.stringify({ error: 'Invalid Telegram signature' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const tgUser = JSON.parse(validated['user']);
    const telegramId: number = tgUser.id;
    const startParam: string = validated['start_param'] || '';
    const inviteCode = startParam.startsWith('invite_') ? startParam.slice(7) : null;
    const isAdmin = ADMIN_TELEGRAM_IDS.includes(telegramId);
    const name = [tgUser.first_name, tgUser.last_name].filter(Boolean).join(' ')
      || tgUser.username || String(telegramId);
    const language = tgUser.language_code === 'ru' ? 'ru' : 'en';

    // All DB via raw REST — Supabase client gets permission denied for PostgREST
    const restHeaders: Record<string, string> = {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    };

    // 2. Look up existing user by telegram_id
    const userRes = await fetch(
      `${SUPABASE_URL}/rest/v1/luma_users?telegram_id=eq.${telegramId}&select=*`,
      { headers: restHeaders },
    );
    const users = await userRes.json();
    if (!userRes.ok) throw new Error('DB lookup failed: ' + JSON.stringify(users));

    let user = users[0] || null;

    if (user) {
      // 3a. User exists — check status
      if (user.status === 'banned') {
        return new Response(
          JSON.stringify({ error: 'banned' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
      if (user.status !== 'active' && !isAdmin) {
        return new Response(
          JSON.stringify({ error: 'pending' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      // Get tokens — existingAuthUserId hint is the current auth_user_id if set, else luma_users.id
      const tokens = await getAuthTokens(
        telegramId, botToken, SUPABASE_URL, ANON_KEY, SERVICE_ROLE_KEY,
        user.auth_user_id || user.id,
      );

      // Update profile fields + always sync auth_user_id (backfills existing rows)
      const updates: Record<string, unknown> = {
        name,
        telegram_handle: tgUser.username || null,
        language,
        auth_user_id: tokens.auth_user_id,
      };
      if (isAdmin) { updates.role = 'admin'; updates.status = 'active'; }

      await fetch(
        `${SUPABASE_URL}/rest/v1/luma_users?telegram_id=eq.${telegramId}`,
        { method: 'PATCH', headers: restHeaders, body: JSON.stringify(updates) },
      );
      user = { ...user, ...updates };

      return new Response(
        JSON.stringify({ access_token: tokens.access_token, refresh_token: tokens.refresh_token, user }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // 3b. User not found
    if (!isAdmin && !inviteCode) {
      return new Response(
        JSON.stringify({
          error: 'invite_required',
          debug: { startParam, inviteCode, telegramId, isAdmin },
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // 4. Validate invite (non-admin)
    let invite: Record<string, unknown> | null = null;
    if (!isAdmin && inviteCode) {
      const inviteRes = await fetch(
        `${SUPABASE_URL}/rest/v1/luma_invite_codes?code=eq.${inviteCode}&used_at=is.null&select=*`,
        { headers: restHeaders },
      );
      const invites = await inviteRes.json();
      if (!inviteRes.ok || !invites.length) {
        return new Response(
          JSON.stringify({
            error: 'invite_required',
            detail: 'invalid_or_used',
            debug: { startParam, inviteCode, found: invites?.length, ok: inviteRes.ok },
          }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
      invite = invites[0];
    }

    // 5. Create Supabase Auth user
    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const email = `tg_${telegramId}@luma.app`;
    const password = await derivePassword(telegramId, botToken);

    let authUserId: string;
    const { data: authData, error: authErr } = await adminClient.auth.admin.createUser({
      email, password, email_confirm: true,
    });

    if (authData?.user?.id) {
      authUserId = authData.user.id;
    } else if (authErr?.message?.includes('already')) {
      // Auth user exists, sign in to get id
      const signInRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: ANON_KEY },
        body: JSON.stringify({ email, password }),
      });
      const signInData = await signInRes.json();
      if (!signInData.user?.id) throw new Error('Auth lookup failed: ' + JSON.stringify(signInData));
      authUserId = signInData.user.id;
    } else if (authErr) {
      throw authErr;
    } else {
      throw new Error('Auth user creation returned no id');
    }

    // 6. Create luma_users row — id = authUserId so they stay in sync,
    //    auth_user_id stored explicitly for lookups from Edge Functions
    const createRes = await fetch(`${SUPABASE_URL}/rest/v1/luma_users`, {
      method: 'POST',
      headers: { ...restHeaders, Prefer: 'return=representation' },
      body: JSON.stringify({
        id: authUserId,
        auth_user_id: authUserId,
        telegram_id: telegramId,
        name,
        telegram_handle: tgUser.username || null,
        current_city: (invite?.city as string) || 'phangan',
        language,
        role: isAdmin ? 'admin' : 'client',
        status: 'active',
      }),
    });
    const createdArr = await createRes.json();
    if (!createRes.ok) throw new Error('User insert failed: ' + JSON.stringify(createdArr));
    user = createdArr[0];

    // 7. Mark invite used
    if (invite) {
      await fetch(
        `${SUPABASE_URL}/rest/v1/luma_invite_codes?id=eq.${invite.id}`,
        {
          method: 'PATCH',
          headers: restHeaders,
          body: JSON.stringify({ used_at: new Date().toISOString(), used_by: user.id }),
        },
      );
    }

    const tokens = await getAuthTokens(telegramId, botToken, SUPABASE_URL, ANON_KEY, SERVICE_ROLE_KEY, authUserId);
    return new Response(
      JSON.stringify({ access_token: tokens.access_token, refresh_token: tokens.refresh_token, user }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );

  } catch (err) {
    console.error('FULL ERROR', err);
    return new Response(
      JSON.stringify({
        error: err instanceof Error
          ? { message: err.message, stack: err.stack, name: err.name }
          : err,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
