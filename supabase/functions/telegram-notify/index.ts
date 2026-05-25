import { createClient } from 'jsr:@supabase/supabase-js@2';

const ADMIN_TELEGRAM_IDS = [656578642];
const APP_URL = 'https://starseedsoultype.github.io/luma';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    // Verify caller is authenticated
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

    const BOT_TOKEN = Deno.env.get('LUMA_BOT_TOKEN')!;
    const { event, payload } = await req.json();

    if (event === 'new_application') {
      const { displayName, category, city } = payload;
      const cat = (category || 'helper').charAt(0).toUpperCase() + (category || '').slice(1);
      const text = [
        '🆕 New helper application',
        '',
        `👤 ${displayName}`,
        `📂 ${cat}`,
        `📍 ${city || 'Koh Phangan'}`,
        '',
        'Open the app to review →',
      ].join('\n');

      for (const adminId of ADMIN_TELEGRAM_IDS) {
        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: adminId,
            text,
            reply_markup: {
              inline_keyboard: [[{ text: '📋 Open Admin Panel', web_app: { url: APP_URL } }]]
            }
          }),
        });
      }
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('telegram-notify error', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
