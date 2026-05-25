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

    steps.push('get_caller');
    const { data: authData, error: userError } = await anonClient.auth.getUser();
    const caller = authData?.user;
    if (!caller) {
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

    // Step 3: Verify caller is admin
    steps.push('role_check');
    const { data: callerRow, error: callerErr } = await supabase
      .from('luma_users')
      .select('role')
      .eq('id', caller.id)
      .single();
    if (callerErr || !callerRow) {
      return new Response(JSON.stringify({ error: 'Forbidden', detail: callerErr?.message }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (callerRow.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Forbidden', role: callerRow.role }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Step 4: Parse body
    steps.push('parse_body');
    const body = await req.json();
    const { userId } = body;
    if (!userId) throw new Error('userId is required');
    if (userId === caller.id) throw new Error('Cannot delete your own account via admin panel');
    console.log('admin-delete-user: target', userId, 'by admin', caller.id);

    // Step 5: Get telegram_id before deleting luma_users
    steps.push('get_telegram_id');
    const { data: lumaUser } = await supabase
      .from('luma_users')
      .select('telegram_id')
      .eq('id', userId)
      .single();
    const telegramId = lumaUser?.telegram_id;

    // Step 6: Get profile IDs and application IDs
    steps.push('get_related_ids');
    const { data: myProfiles } = await supabase
      .from('luma_helper_profiles')
      .select('id')
      .eq('user_id', userId);
    const profileIds = (myProfiles || []).map((p: { id: string }) => p.id);

    const { data: myApps } = await supabase
      .from('luma_helper_applications')
      .select('id')
      .eq('user_id', userId);
    const appIds = (myApps || []).map((a: { id: string }) => a.id);
    console.log('admin-delete-user: profiles', profileIds.length, 'apps', appIds.length);

    // Step 7: Delete luma_approval_votes (as reviewer)
    steps.push('delete_votes_as_reviewer');
    await supabase.from('luma_approval_votes').delete().eq('reviewer_id', userId);

    // Step 8: Delete luma_approval_votes (on own applications)
    if (appIds.length > 0) {
      steps.push('delete_votes_on_own_apps');
      await supabase.from('luma_approval_votes').delete().in('application_id', appIds);
    }

    // Step 9: Delete luma_contact_clicks (as viewer)
    steps.push('delete_clicks_as_viewer');
    await supabase.from('luma_contact_clicks').delete().eq('viewer_user_id', userId);

    // Step 10: Delete clicks and badges on own profiles
    if (profileIds.length > 0) {
      steps.push('delete_clicks_on_own_profiles');
      await supabase.from('luma_contact_clicks').delete().in('helper_profile_id', profileIds);

      steps.push('delete_badges');
      await supabase.from('luma_helper_badges').delete().in('helper_profile_id', profileIds);
    }

    // Step 11: Delete luma_helper_applications
    steps.push('delete_applications');
    await supabase.from('luma_helper_applications').delete().eq('user_id', userId);

    // Step 12: Delete luma_helper_profiles
    steps.push('delete_profiles');
    await supabase.from('luma_helper_profiles').delete().eq('user_id', userId);

    // Step 13: Delete luma_invite_codes
    steps.push('delete_invite_codes_used');
    await supabase.from('luma_invite_codes').delete().eq('used_by', userId);

    steps.push('delete_invite_codes_created');
    await supabase.from('luma_invite_codes').delete().eq('created_by', userId);

    // Step 14: Delete luma_pending_invites
    if (telegramId) {
      steps.push('delete_pending_invites');
      await supabase.from('luma_pending_invites').delete().eq('telegram_id', telegramId);
    }

    // Step 15: Delete luma_users
    steps.push('delete_luma_user');
    const { error: lumaDeleteErr } = await supabase
      .from('luma_users')
      .delete()
      .eq('id', userId);
    if (lumaDeleteErr) throw new Error(`delete_luma_user failed: ${lumaDeleteErr.message}`);

    // Step 16: Delete auth.users (final)
    steps.push('delete_auth_user');
    const { error: authDeleteError } = await supabase.auth.admin.deleteUser(userId);
    if (authDeleteError) throw new Error(`delete_auth_user failed: ${authDeleteError.message}`);

    console.log('admin-delete-user: complete, deleted', userId);
    return new Response(JSON.stringify({ success: true, steps }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('admin-delete-user error:', err.message, 'steps:', steps);
    return new Response(JSON.stringify({ error: err.message, steps }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
