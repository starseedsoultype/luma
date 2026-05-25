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
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized', detail: userError?.message }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const uid = user.id;
    console.log('delete-account: initiated for user', uid);

    // Step 2: Service role client
    steps.push('service_client');
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Step 3: Get telegram_id before deleting luma_users
    steps.push('get_telegram_id');
    const { data: lumaUser } = await supabase
      .from('luma_users')
      .select('telegram_id')
      .eq('id', uid)
      .single();
    const telegramId = lumaUser?.telegram_id;
    console.log('delete-account: telegram_id', telegramId);

    // Step 4: Get profile IDs and application IDs before cascading delete
    steps.push('get_related_ids');
    const { data: myProfiles } = await supabase
      .from('luma_helper_profiles')
      .select('id')
      .eq('user_id', uid);
    const profileIds = (myProfiles || []).map((p: { id: string }) => p.id);

    const { data: myApps } = await supabase
      .from('luma_helper_applications')
      .select('id')
      .eq('user_id', uid);
    const appIds = (myApps || []).map((a: { id: string }) => a.id);
    console.log('delete-account: profiles', profileIds.length, 'apps', appIds.length);

    // Step 5: Delete luma_approval_votes (as reviewer on other applications)
    steps.push('delete_votes_as_reviewer');
    await supabase.from('luma_approval_votes').delete().eq('reviewer_id', uid);

    // Step 6: Delete luma_approval_votes (on this user's own applications)
    if (appIds.length > 0) {
      steps.push('delete_votes_on_own_apps');
      await supabase.from('luma_approval_votes').delete().in('application_id', appIds);
    }

    // Step 7: Delete luma_contact_clicks (as viewer)
    steps.push('delete_clicks_as_viewer');
    await supabase.from('luma_contact_clicks').delete().eq('viewer_user_id', uid);

    // Step 8: Delete luma_contact_clicks and luma_helper_badges for own profiles
    if (profileIds.length > 0) {
      steps.push('delete_clicks_on_own_profiles');
      await supabase.from('luma_contact_clicks').delete().in('helper_profile_id', profileIds);

      steps.push('delete_badges');
      await supabase.from('luma_helper_badges').delete().in('helper_profile_id', profileIds);
    }

    // Step 9: Delete luma_helper_applications
    steps.push('delete_applications');
    await supabase.from('luma_helper_applications').delete().eq('user_id', uid);

    // Step 10: Delete luma_helper_profiles
    steps.push('delete_profiles');
    await supabase.from('luma_helper_profiles').delete().eq('user_id', uid);

    // Step 11: Delete luma_invite_codes (codes used by or created by this user)
    steps.push('delete_invite_codes_used');
    await supabase.from('luma_invite_codes').delete().eq('used_by', uid);

    steps.push('delete_invite_codes_created');
    await supabase.from('luma_invite_codes').delete().eq('created_by', uid);

    // Step 12: Delete luma_pending_invites (by telegram_id)
    if (telegramId) {
      steps.push('delete_pending_invites');
      await supabase.from('luma_pending_invites').delete().eq('telegram_id', telegramId);
    }

    // Step 13: Delete luma_users
    steps.push('delete_luma_user');
    const { error: lumaDeleteErr } = await supabase
      .from('luma_users')
      .delete()
      .eq('id', uid);
    if (lumaDeleteErr) throw new Error(`delete_luma_user failed: ${lumaDeleteErr.message}`);

    // Step 14: Delete auth.users (final — must be last)
    steps.push('delete_auth_user');
    const { error: authDeleteError } = await supabase.auth.admin.deleteUser(uid);
    if (authDeleteError) throw new Error(`delete_auth_user failed: ${authDeleteError.message}`);

    console.log('delete-account: complete for user', uid);
    return new Response(JSON.stringify({ success: true, steps }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('delete-account error:', err.message, 'steps so far:', steps);
    return new Response(JSON.stringify({ error: err.message, steps }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
