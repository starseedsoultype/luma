import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const steps: string[] = [];

  try {
    steps.push('auth_header');
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    steps.push('anon_client');
    const anonClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    steps.push('get_user');
    const { data: { user }, error: userError } = await anonClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized', detail: userError?.message }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    steps.push('service_client');
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Role check — luma_users.id = auth.uid()
    steps.push('role_check');
    const { data: caller, error: callerError } = await supabase
      .from('luma_users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (callerError || !caller) {
      return new Response(JSON.stringify({ error: 'Forbidden', detail: callerError?.message, step: 'role_check', userId: user.id }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (caller.role !== 'admin' && caller.role !== 'trusted_circle') {
      return new Response(JSON.stringify({ error: 'Forbidden', role: caller.role }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    steps.push('parse_body');
    const { applicationId, comment } = await req.json();
    if (!applicationId) throw new Error('applicationId is required');

    // Fetch application — no luma_users join to avoid missing-column errors
    steps.push('fetch_app');
    const { data: app, error: appError } = await supabase
      .from('luma_helper_applications')
      .select('*, luma_helper_profiles(*)')
      .eq('id', applicationId)
      .single();

    if (appError || !app) {
      throw new Error(`Application not found: ${appError?.message || 'null data'}`);
    }

    steps.push('update_application');
    const { error: appUpdateErr } = await supabase
      .from('luma_helper_applications')
      .update({
        status: 'rejected',
        admin_comment: comment || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', applicationId);
    if (appUpdateErr) throw new Error(`update_application failed: ${appUpdateErr.message}`);

    steps.push('update_profile');
    const { error: profileUpdateErr } = await supabase
      .from('luma_helper_profiles')
      .update({
        trust_status: 'rejected',
        is_active: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', app.helper_profile_id);
    if (profileUpdateErr) throw new Error(`update_profile failed: ${profileUpdateErr.message}`);

    // Notify helper (fire and forget)
    steps.push('notify');
    notifyHelper(supabase, app.user_id, comment).catch(() => {});

    return new Response(JSON.stringify({ success: true, steps }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message, steps }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function notifyHelper(supabase: ReturnType<typeof createClient>, userId: string, comment?: string) {
  const { data: luma_user } = await supabase
    .from('luma_users')
    .select('telegram_id')
    .eq('id', userId)
    .single();

  const token = Deno.env.get('LUMA_BOT_TOKEN');
  if (!token || !luma_user?.telegram_id) return;

  const msg = comment
    ? `Your Luma application was not approved. Note: ${comment}`
    : `Your Luma application was not approved at this time.`;

  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: luma_user.telegram_id, text: msg }),
  });
}
