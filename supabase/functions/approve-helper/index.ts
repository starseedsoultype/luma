import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    // Auth: caller must be admin or trusted_circle
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const anonClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user } } = await anonClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: caller } = await supabase
      .from('luma_users').select('role').eq('id', user.id).single();
    if (caller?.role !== 'admin' && caller?.role !== 'trusted_circle') {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { applicationId, comment } = await req.json();

    const { data: app } = await supabase
      .from('luma_helper_applications')
      .select('*, luma_helper_profiles(*), luma_users(telegram_id)')
      .eq('id', applicationId)
      .single();
    if (!app) throw new Error('Application not found');

    await supabase.from('luma_helper_applications').update({
      status: 'approved',
      admin_comment: comment || null,
      updated_at: new Date().toISOString(),
    }).eq('id', applicationId);

    await supabase.from('luma_helper_profiles').update({
      trust_status: 'approved',
      is_active: true,
      updated_at: new Date().toISOString(),
    }).eq('id', app.helper_profile_id);

    await supabase.from('luma_users').update({ role: 'helper' }).eq('id', app.user_id);

    // Notify helper
    if (app.luma_users?.telegram_id) {
      await notifyTelegram(app.luma_users.telegram_id,
        `✅ Your Luma application has been approved! You're now listed in the directory.`
      );
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function notifyTelegram(chatId: number, text: string) {
  const token = Deno.env.get('LUMA_BOT_TOKEN');
  if (!token) return;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
}
