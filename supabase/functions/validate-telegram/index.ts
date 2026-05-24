import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Telegram IDs that get admin role on first sign-in
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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { initData } = await req.json();
    if (!initData) throw new Error('no initData');

    const botToken = Deno.env.get('LUMA_BOT_TOKEN')!;
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

    if (!botToken) throw new Error('LUMA_BOT_TOKEN secret not configured');

    // Validate Telegram initData signature
    const validated = await validateTelegramInitData(initData, botToken);
    if (!validated) {
      return new Response(
        JSON.stringify({ error: 'Invalid Telegram signature' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const tgUser = JSON.parse(validated['user']);
    const telegramId: number = tgUser.id;
    const name = [tgUser.first_name, tgUser.last_name].filter(Boolean).join(' ')
      || tgUser.username || String(telegramId);
    const email = `tg_${telegramId}@luma.app`;
    const password = await derivePassword(telegramId, botToken);
    const isAdmin = ADMIN_TELEGRAM_IDS.includes(telegramId);

    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Try sign-in first (returning user path)
    let signInRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': ANON_KEY },
      body: JSON.stringify({ email, password }),
    });
    let signInData = await signInRes.json();

    // First-time user — create auth account, then sign in
    if (!signInRes.ok) {
      await adminClient.auth.admin.createUser({ email, password, email_confirm: true });
      signInRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': ANON_KEY },
        body: JSON.stringify({ email, password }),
      });
      signInData = await signInRes.json();
    }

    if (!signInData.access_token) {
      throw new Error('Supabase auth failed: ' + JSON.stringify(signInData));
    }

    const authUserId: string = signInData.user.id;

    // Check for existing luma_users row
    const { data: existingUser } = await adminClient
      .from('luma_users')
      .select('*')
      .eq('telegram_id', telegramId)
      .single();

    let user;

    if (existingUser) {
      if (existingUser.id !== authUserId) {
        // Pre-inserted row with a UUID not linked to Supabase Auth — delete it
        await adminClient.from('luma_users').delete().eq('telegram_id', telegramId);
        // Fall through to insert below
      } else {
        // Returning user — update display fields, preserve status/role
        const updates: Record<string, unknown> = {
          name,
          telegram_handle: tgUser.username || null,
          language: tgUser.language_code === 'ru' ? 'ru' : 'en',
          updated_at: new Date().toISOString(),
        };
        if (isAdmin) { updates.role = 'admin'; updates.status = 'active'; }

        const { data: updated, error: upErr } = await adminClient
          .from('luma_users')
          .update(updates)
          .eq('telegram_id', telegramId)
          .select()
          .single();
        if (upErr) throw upErr;
        user = updated;
      }
    }

    if (!user) {
      // New user (or cleaned-up pre-inserted row) — insert with id = auth UUID
      const { data: inserted, error: insErr } = await adminClient
        .from('luma_users')
        .insert({
          id: authUserId,
          telegram_id: telegramId,
          name,
          telegram_handle: tgUser.username || null,
          current_city: 'phangan',
          language: tgUser.language_code === 'ru' ? 'ru' : 'en',
          role: isAdmin ? 'admin' : 'client',
          status: isAdmin ? 'active' : 'pending',
        })
        .select()
        .single();
      if (insErr) throw insErr;
      user = inserted;
    }

    return new Response(JSON.stringify({
      access_token: signInData.access_token,
      refresh_token: signInData.refresh_token,
      user,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (err) {
    console.error('validate-telegram error:', err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
