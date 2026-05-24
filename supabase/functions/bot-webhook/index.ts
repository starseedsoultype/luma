const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const APP_URL = 'https://starseedsoultype.github.io/luma';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const BOT_TOKEN = Deno.env.get('LUMA_BOT_TOKEN')!;

  const restHeaders: Record<string, string> = {
    apikey: SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
  };

  // ── GET ?setup=1 → register webhook with Telegram ───────────────────────────
  const url = new URL(req.url);
  if (req.method === 'GET' && url.searchParams.get('setup') === '1') {
    const selfUrl = `${SUPABASE_URL}/functions/v1/bot-webhook`;
    const result = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: selfUrl }),
      },
    );
    const data = await result.json();
    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // ── POST → Telegram webhook update ──────────────────────────────────────────
  if (req.method !== 'POST') {
    return new Response('method not allowed', { status: 405, headers: corsHeaders });
  }

  let update: Record<string, unknown>;
  try {
    update = await req.json();
  } catch {
    return new Response('bad json', { status: 400, headers: corsHeaders });
  }

  const message = update.message as Record<string, unknown> | undefined;
  if (!message) {
    // Could be callback_query or other update type — just ack
    return new Response('ok', { headers: corsHeaders });
  }

  const from = message.from as Record<string, unknown> | undefined;
  const telegramId: number | undefined = from?.id as number | undefined;
  const text = typeof message.text === 'string' ? message.text : '';
  const chatId: number | undefined = (message.chat as Record<string, unknown>)?.id as number | undefined;

  if (!telegramId || !chatId) {
    return new Response('ok', { headers: corsHeaders });
  }

  // ── /start invite_CODE ───────────────────────────────────────────────────────
  const startMatch = text.match(/^\/start invite_(.+)$/);
  if (startMatch) {
    const inviteCode = startMatch[1].trim();

    // Delete any old unused pending invites for this telegram_id
    await fetch(
      `${SUPABASE_URL}/rest/v1/luma_pending_invites?telegram_id=eq.${telegramId}&used_at=is.null`,
      { method: 'DELETE', headers: restHeaders },
    );

    // Insert new pending invite
    await fetch(
      `${SUPABASE_URL}/rest/v1/luma_pending_invites`,
      {
        method: 'POST',
        headers: { ...restHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify({ telegram_id: telegramId, invite_code: inviteCode }),
      },
    );

    // Send welcome message with Luma button
    const firstName = typeof from?.first_name === 'string' ? from.first_name : 'there';
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: `👋 Hi ${firstName}!\n\nYou've been invited to Luma — a private network of trusted helpers on Koh Phangan.\n\nTap the button below to open the app and complete your registration.`,
        reply_markup: {
          inline_keyboard: [[
            {
              text: '🌿 Open Luma',
              web_app: { url: APP_URL },
            },
          ]],
        },
      }),
    });

    return new Response('ok', { headers: corsHeaders });
  }

  // ── /start (no invite param) ─────────────────────────────────────────────────
  if (text.startsWith('/start')) {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: `👋 Welcome to Luma!\n\nLuma is an invite-only app. Ask a current member to send you an invite link to join.`,
      }),
    });
    return new Response('ok', { headers: corsHeaders });
  }

  // All other messages — just ack
  return new Response('ok', { headers: corsHeaders });
});
