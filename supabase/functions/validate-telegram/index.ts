import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { crypto } from 'https://deno.land/std@0.168.0/crypto/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { initData } = await req.json();
    if (!initData) throw new Error('No initData');

    const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN')!;
    const valid = await verifyTelegramInitData(initData, botToken);
    if (!valid) throw new Error('Invalid initData');

    const params = new URLSearchParams(initData);
    const userJson = params.get('user');
    if (!userJson) throw new Error('No user in initData');
    const tgUser = JSON.parse(userJson);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Upsert user
    const { data: user, error } = await supabase
      .from('luma_users')
      .upsert({
        telegram_id: tgUser.id,
        name: [tgUser.first_name, tgUser.last_name].filter(Boolean).join(' '),
        telegram_handle: tgUser.username || null,
        avatar_url: tgUser.photo_url || null,
        language: tgUser.language_code === 'ru' ? 'ru' : 'en',
      }, { onConflict: 'telegram_id' })
      .select()
      .single();

    if (error) throw error;

    // Sign a JWT for the user using their uuid as sub
    const { data: session } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: `tg_${tgUser.id}@luma.internal`,
    });

    // Simpler: return the user and let client use service-level session
    return new Response(JSON.stringify({ user, token: null }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function verifyTelegramInitData(initData: string, botToken: string): Promise<boolean> {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return false;
  params.delete('hash');

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');

  const encoder = new TextEncoder();
  const secretKey = await crypto.subtle.importKey(
    'raw', encoder.encode('WebAppData'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const tokenKey = await crypto.subtle.sign('HMAC', secretKey, encoder.encode(botToken));
  const dataKey = await crypto.subtle.importKey(
    'raw', tokenKey, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', dataKey, encoder.encode(dataCheckString));
  const expectedHash = Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, '0')).join('');

  return expectedHash === hash;
}
