import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { applicationId, comment } = await req.json();
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: app } = await supabase
      .from('helper_applications').select('*, users(telegram_id)')
      .eq('id', applicationId).single();
    if (!app) throw new Error('Not found');

    await supabase.from('helper_applications').update({
      status: 'rejected',
      admin_comment: comment || null,
      updated_at: new Date().toISOString(),
    }).eq('id', applicationId);

    await supabase.from('helper_profiles').update({
      trust_status: 'rejected',
      is_active: false,
      updated_at: new Date().toISOString(),
    }).eq('id', app.helper_profile_id);

    if (app.users?.telegram_id) {
      const msg = comment
        ? `Your Luma application was not approved. Note: ${comment}`
        : `Your Luma application was not approved at this time.`;
      await notifyTelegram(app.users.telegram_id, msg);
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
  const token = Deno.env.get('TELEGRAM_BOT_TOKEN');
  if (!token) return;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
}
