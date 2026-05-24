import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { code } = await req.json();
    if (!code) throw new Error('No code');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: invite, error } = await supabase
      .from('invite_codes').select('*').eq('code', code).single();

    if (error || !invite) return new Response(JSON.stringify({ success: false, error: 'invalid' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

    if (invite.used_at) return new Response(JSON.stringify({ success: false, error: 'used' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

    // Get caller from auth header
    const authHeader = req.headers.get('authorization');
    let userId: string | null = null;
    if (authHeader) {
      const anonClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { authorization: authHeader } } }
      );
      const { data: { user } } = await anonClient.auth.getUser();
      userId = user?.id || null;
    }

    // Mark invite as used
    await supabase.from('invite_codes').update({
      used_by: userId,
      used_at: new Date().toISOString(),
    }).eq('id', invite.id);

    // Activate user if needed
    if (userId) {
      await supabase.from('users').update({
        status: 'active',
        invited_by: invite.created_by,
        current_city: invite.city,
      }).eq('id', userId);
    }

    return new Response(JSON.stringify({ success: true, city: invite.city }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
