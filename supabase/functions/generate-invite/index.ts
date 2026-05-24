import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    // Safe body parsing — empty or missing body is fine, city defaults to phangan
    let city = 'phangan';
    try {
      const body = await req.json();
      city = body?.city || 'phangan';
    } catch (_) {
      // empty body is fine
    }

    // Auth: verify caller JWT
    const authHeader = req.headers.get('authorization');
    if (!authHeader) throw new Error('Unauthorized');

    const anonClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { authorization: authHeader } } }
    );
    const { data: { user } } = await anonClient.auth.getUser();
    if (!user) throw new Error('Unauthorized');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Look up luma_users by auth_user_id first (new column).
    // Fall back to id for existing users where auth_user_id hasn't been
    // populated yet (self-heals on next login via validate-telegram).
    let { data: dbUser } = await supabase
      .from('luma_users')
      .select('id, status, role')
      .eq('auth_user_id', user.id)
      .single();

    if (!dbUser) {
      const fallback = await supabase
        .from('luma_users')
        .select('id, status, role')
        .eq('id', user.id)
        .single();
      dbUser = fallback.data;
    }

    if (!dbUser || dbUser.status !== 'active') throw new Error('Account not active');

    const code = generateCode();

    const { data, error } = await supabase
      .from('luma_invite_codes')
      .insert({
        code,
        city,
        created_by: dbUser.id,
      })
      .select()
      .single();

    if (error) throw error;

    return new Response(JSON.stringify({ code: data.code }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  return Array.from(crypto.getRandomValues(new Uint8Array(10)))
    .map(b => chars[b % chars.length]).join('');
}
