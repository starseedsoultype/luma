import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const steps: string[] = [];

  try {
    // Step 1: Auth
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
    const { data: authData, error: userError } = await anonClient.auth.getUser();
    const user = authData?.user;
    console.log('get_user result:', { userId: user?.id, error: userError?.message });
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized', detail: userError?.message }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Step 2: Service role client
    steps.push('service_client');
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Step 3: Role check
    steps.push('role_check');
    const { data: caller, error: callerError } = await supabase
      .from('luma_users')
      .select('role')
      .eq('id', user.id)
      .single();
    console.log('role_check result:', { role: caller?.role, error: callerError?.message });

    if (callerError || !caller) {
      return new Response(JSON.stringify({ error: 'Forbidden', detail: callerError?.message, userId: user.id }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (caller.role !== 'admin' && caller.role !== 'trusted_circle') {
      return new Response(JSON.stringify({ error: 'Forbidden', role: caller.role }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Step 4: Parse body
    steps.push('parse_body');
    const body = await req.json();
    const { applicationId, comment } = body;
    console.log('parse_body:', { applicationId, comment });
    if (!applicationId) throw new Error('applicationId is required');

    // Step 5: Fetch application — no joins, just the FK columns we need
    steps.push('fetch_app');
    const { data: app, error: appError } = await supabase
      .from('luma_helper_applications')
      .select('id, status, user_id, helper_profile_id')
      .eq('id', applicationId)
      .single();
    console.log('fetch_app result:', { app, error: appError?.message });

    if (appError || !app) {
      throw new Error(`Application not found: ${appError?.message || 'null data'}`);
    }

    // Step 6: Update application status
    steps.push('update_application');
    const { error: appUpdateErr } = await supabase
      .from('luma_helper_applications')
      .update({
        status: 'approved',
        admin_comment: comment || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', applicationId);
    console.log('update_application:', { error: appUpdateErr?.message });
    if (appUpdateErr) throw new Error(`update_application failed: ${appUpdateErr.message}`);

    // Step 7: Update helper profile
    steps.push('update_profile');
    const { error: profileUpdateErr } = await supabase
      .from('luma_helper_profiles')
      .update({
        trust_status: 'approved',
        is_active: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', app.helper_profile_id);
    console.log('update_profile:', { profileId: app.helper_profile_id, error: profileUpdateErr?.message });
    if (profileUpdateErr) throw new Error(`update_profile failed: ${profileUpdateErr.message}`);

    // Step 8: Assign helper role
    steps.push('assign_role');
    const { error: roleUpdateErr } = await supabase
      .from('luma_users')
      .update({ role: 'helper' })
      .eq('id', app.user_id);
    console.log('assign_role:', { userId: app.user_id, error: roleUpdateErr?.message });
    if (roleUpdateErr) throw new Error(`assign_role failed: ${roleUpdateErr.message}`);

    // Step 9: Notify helper (fire and forget)
    steps.push('notify');
    notifyHelper(supabase, app.user_id).catch(() => {});

    return new Response(JSON.stringify({ success: true, steps }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('approve-helper error:', err.message, 'steps so far:', steps);
    return new Response(JSON.stringify({ error: err.message, steps }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function notifyHelper(supabase: ReturnType<typeof createClient>, userId: string) {
  const { data: luma_user } = await supabase
    .from('luma_users')
    .select('telegram_id')
    .eq('id', userId)
    .single();

  const token = Deno.env.get('LUMA_BOT_TOKEN');
  if (!token || !luma_user?.telegram_id) return;

  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: luma_user.telegram_id,
      text: '✅ Your Luma application has been approved! You\'re now listed in the directory.',
    }),
  });
}
