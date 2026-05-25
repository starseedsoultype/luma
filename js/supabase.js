const { createClient } = supabase;
const db = createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey);

// ─── Auth ────────────────────────────────────────────────────────────────────

async function signInWithTelegram(initData) {
  // Pass any stored invite code so it survives menu-button re-opens
  const pendingInvite = localStorage.getItem('luma_pending_invite') || null;

  const res = await fetch(
    `${CONFIG.supabaseUrl}/functions/v1/validate-telegram`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': CONFIG.supabaseAnonKey,
        'Authorization': `Bearer ${CONFIG.supabaseAnonKey}`,
      },
      body: JSON.stringify({ initData, inviteCode: pendingInvite }),
    },
  );
  const data = await res.json();

  if (!res.ok) {
    console.error('validate-telegram failed', res.status, data);
    const code = typeof data.error === 'string'
      ? data.error
      : (data.error?.message || data.error?.code || JSON.stringify(data) || 'error');
    const err = new Error(code);
    err.code = typeof data.error === 'string' ? data.error : (data.error?.code || code);
    throw err;
  }

  // Clear pending invite after successful auth
  localStorage.removeItem('luma_pending_invite');

  console.log('validate-telegram ok', {
    hasAccessToken: !!data.access_token,
    hasUser: !!data.user,
    userStatus: data.user?.status,
    userRole: data.user?.role,
  });

  if (data.access_token && data.refresh_token) {
    const { data: sessionData, error: sessionError } = await db.auth.setSession({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
    });
    if (sessionError) {
      console.error('setSession failed', sessionError);
    } else {
      console.log('setSession ok', { hasSession: !!sessionData.session });
    }
  }

  return data.user;
}

async function getCurrentUser() {
  const { data: { user } } = await db.auth.getUser();
  if (!user) return null;
  const { data } = await db.from('luma_users').select('*').eq('id', user.id).single();
  return data;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function getHelpers({ city, category, search, language, area } = {}) {
  let query = db
    .from('luma_helper_profiles')
    .select(`
      *,
      luma_helper_badges ( badge_key )
    `)
    .eq('trust_status', 'approved')
    .eq('is_active', true);

  if (city) query = query.eq('city', city);
  if (category && category !== 'all') query = query.eq('category', category);
  if (language) query = query.contains('languages', [language]);
  if (area) query = query.ilike('location_area', `%${area}%`);
  if (search) {
    query = query.or(`display_name.ilike.%${search}%,location_area.ilike.%${search}%`);
  }

  query = query.order('is_featured', { ascending: false }).order('created_at', { ascending: false });

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

async function getHelperById(id) {
  const { data, error } = await db
    .from('luma_helper_profiles')
    .select(`*, luma_helper_badges ( badge_key )`)
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}

async function recordContactClick(helperProfileId, viewerUserId) {
  await db.from('luma_contact_clicks').insert({
    helper_profile_id: helperProfileId,
    viewer_user_id: viewerUserId,
  });
}

// ─── Applications ─────────────────────────────────────────────────────────────

async function submitHelperApplication({ profile, legalConfirmation }) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated');

  // avatarUrl: direct URL (from Telegram photo_url) takes priority over file upload
  const avatarUrl = profile.avatarUrl ||
    (profile.avatarFile ? await uploadAvatar(profile.avatarFile, user.id) : null);

  const { data: helperProfile, error: profileError } = await db
    .from('luma_helper_profiles')
    .insert({
      user_id: user.id,
      display_name: profile.displayName,
      category: profile.category,
      bio: profile.bio,
      languages: profile.languages,
      location_area: profile.locationArea,
      city: profile.city,
      price_from: profile.priceFrom || null,
      price_unit: profile.priceUnit || null,
      telegram_handle: profile.telegramHandle,
      avatar_url: avatarUrl,
      trust_status: 'pending',
      is_active: false,
    })
    .select()
    .single();

  if (profileError) throw profileError;

  const { error: appError } = await db.from('luma_helper_applications').insert({
    user_id: user.id,
    helper_profile_id: helperProfile.id,
    legal_confirmation: legalConfirmation,
    status: 'pending',
  });

  if (appError) throw appError;

  // Notify admin — fire and forget, never blocks the user
  db.functions.invoke('telegram-notify', {
    body: {
      event: 'new_application',
      payload: {
        displayName: profile.displayName,
        category: profile.category,
        city: profile.city,
      },
    },
  }).catch(() => {});

  return helperProfile;
}

async function getMyApplication(userId) {
  const { data, error } = await db
    .from('luma_helper_applications')
    .select(`*, luma_helper_profiles(*)`)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

// ─── Invites ─────────────────────────────────────────────────────────────────

async function generateInvite(city) {
  const { data, error } = await db.functions.invoke('generate-invite', {
    body: { city },
  });

  if (error) {
    // FunctionsHttpError carries the raw Response in error.context
    // Parse it to get our debug snapshot from the 400 body
    let responseBody = null;
    try {
      responseBody = await error.context?.json?.();
    } catch (_) {
      try {
        const text = await error.context?.text?.();
        responseBody = { error: text };
      } catch (_2) {}
    }

    const richErr = new Error(responseBody?.error || error.message);
    richErr.debug = responseBody?.debug || null;
    richErr.rawData = responseBody;
    throw richErr;
  }

  return data;
}

async function validateInvite(code) {
  const { data, error } = await db.functions.invoke('validate-invite', {
    body: { code },
  });
  if (error) throw error;
  return data;
}

async function getMyInvites(userId) {
  const { data, error } = await db
    .from('luma_invite_codes')
    .select(`
      *,
      used_user:used_by ( name, telegram_handle )
    `)
    .eq('created_by', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

// ─── Favorites ────────────────────────────────────────────────────────────────

function getFavorites() {
  try {
    return JSON.parse(localStorage.getItem('luma_favorites') || '[]');
  } catch {
    return [];
  }
}

function toggleFavorite(helperId) {
  const favs = getFavorites();
  const idx = favs.indexOf(helperId);
  if (idx === -1) favs.push(helperId);
  else favs.splice(idx, 1);
  localStorage.setItem('luma_favorites', JSON.stringify(favs));
  return idx === -1;
}

function isFavorite(helperId) {
  return getFavorites().includes(helperId);
}

async function getFavoriteHelpers() {
  const ids = getFavorites();
  if (!ids.length) return [];
  const { data, error } = await db
    .from('luma_helper_profiles')
    .select(`*, luma_helper_badges ( badge_key )`)
    .in('id', ids)
    .eq('trust_status', 'approved')
    .eq('is_active', true);
  if (error) throw error;
  return data;
}

// ─── Admin ────────────────────────────────────────────────────────────────────

async function getPendingApplications(city) {
  let query = db
    .from('luma_helper_applications')
    .select(`
      *,
      luma_helper_profiles(*),
      luma_users ( name, telegram_handle ),
      luma_approval_votes ( vote, comment, reviewer_id )
    `)
    .eq('status', 'pending');
  if (city) query = query.eq('luma_helper_profiles.city', city);
  query = query.order('created_at', { ascending: true });
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

async function getAllApplications(city, status) {
  let query = db
    .from('luma_helper_applications')
    .select(`*, luma_helper_profiles(*), luma_users ( name, telegram_handle )`)
    .order('created_at', { ascending: false });
  if (city) query = query.eq('luma_helper_profiles.city', city);
  if (status) query = query.eq('status', status);
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

async function adminApprove(applicationId, comment) {
  const { data, error } = await db.functions.invoke('approve-helper', {
    body: { applicationId, comment },
  });
  if (error) {
    let body = null;
    try { body = await error.context?.json?.(); } catch (_) {}
    const msg = body?.error || body?.message || error.message;
    const steps = body?.steps ? ` [steps: ${body.steps.join('→')}]` : '';
    const richErr = new Error(msg + steps);
    throw richErr;
  }
  return data;
}

async function adminReject(applicationId, comment) {
  const { data, error } = await db.functions.invoke('reject-helper', {
    body: { applicationId, comment },
  });
  if (error) {
    let body = null;
    try { body = await error.context?.json?.(); } catch (_) {}
    const msg = body?.error || body?.message || error.message;
    const steps = body?.steps ? ` [steps: ${body.steps.join('→')}]` : '';
    const richErr = new Error(msg + steps);
    throw richErr;
  }
  return data;
}

async function adminOverride(helperProfileId, status, comment) {
  const { data, error } = await db.functions.invoke('admin-override', {
    body: { helperProfileId, status, comment },
  });
  if (error) throw error;
  return data;
}

async function adminFeature(helperProfileId, days) {
  const { data, error } = await db.functions.invoke('feature-helper', {
    body: { helperProfileId, days },
  });
  if (error) throw error;
  return data;
}

async function adminBanUser(userId) {
  const { data, error } = await db.functions.invoke('ban-user', {
    body: { userId, action: 'ban' },
  });
  if (error) throw error;
  return data;
}

async function adminUnbanUser(userId) {
  const { data, error } = await db.functions.invoke('ban-user', {
    body: { userId, action: 'unban' },
  });
  if (error) throw error;
  return data;
}

async function assignRole(userId, role) {
  const { error } = await db
    .from('luma_users')
    .update({ role })
    .eq('id', userId);
  if (error) throw error;
}

async function assignBadge(helperProfileId, badgeKey, assignedBy) {
  const { error } = await db.from('luma_helper_badges').insert({
    helper_profile_id: helperProfileId,
    badge_key: badgeKey,
    assigned_by: assignedBy,
  });
  if (error) throw error;
}

async function removeBadge(helperProfileId, badgeKey) {
  const { error } = await db
    .from('luma_helper_badges')
    .delete()
    .eq('helper_profile_id', helperProfileId)
    .eq('badge_key', badgeKey);
  if (error) throw error;
}

async function getAdminStats() {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [users, helpers, applications, clicks, invites, newUsers] = await Promise.all([
    db.from('luma_users').select('id, role, status, created_at', { count: 'exact' }),
    db.from('luma_helper_profiles').select('id, category, trust_status, city, is_active', { count: 'exact' }),
    db.from('luma_helper_applications').select('id, status', { count: 'exact' }),
    db.from('luma_contact_clicks').select('id, helper_profile_id', { count: 'exact' }),
    db.from('luma_invite_codes').select('id, used_at, city', { count: 'exact' }),
    db.from('luma_users').select('id', { count: 'exact' }).gte('created_at', sevenDaysAgo),
  ]);

  const usersData      = users.data      || [];
  const helpersData    = helpers.data    || [];
  const appsData       = applications.data || [];
  const invitesData    = invites.data    || [];
  const clicksData     = clicks.data     || [];

  return {
    // Users
    totalUsers:    users.count,
    newUsers7d:    newUsers.count,
    usersByRole:   groupBy(usersData, 'role'),

    // Helpers
    totalHelpers:        helpers.count,
    helpersByCategory:   groupBy(helpersData, 'category'),
    helpersByStatus:     groupBy(helpersData, 'trust_status'),
    helpersByCity:       groupBy(helpersData, 'city'),
    activeHelpers:       helpersData.filter(h => h.is_active).length,

    // Applications
    totalApplications: applications.count,
    pendingApps:       appsData.filter(a => a.status === 'pending').length,
    approvedApps:      appsData.filter(a => a.status === 'approved').length,
    rejectedApps:      appsData.filter(a => a.status === 'rejected').length,

    // Invites
    totalInvites:  invites.count,
    invitesUsed:   invitesData.filter(i => i.used_at).length,
    invitesByCity: groupBy(invitesData, 'city'),

    // Engagement
    totalClicks: clicks.count,
    clicksByHelper: groupBy(clicksData, 'helper_profile_id'),
  };
}

// ─── Trusted Circle ──────────────────────────────────────────────────────────

async function getPendingForCircle() {
  const user = await getCurrentUser();
  const { data: voted } = await db
    .from('luma_approval_votes')
    .select('application_id')
    .eq('reviewer_id', user.id);
  const votedIds = (voted || []).map(v => v.application_id);

  let query = db
    .from('luma_helper_applications')
    .select(`
      *,
      luma_helper_profiles(*),
      luma_approval_votes ( vote, reviewer_id )
    `)
    .eq('status', 'pending');

  if (votedIds.length) query = query.not('id', 'in', `(${votedIds.join(',')})`);
  query = query.order('created_at', { ascending: true });

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

async function castVote(applicationId, vote, comment) {
  const user = await getCurrentUser();
  const { error } = await db.from('luma_approval_votes').insert({
    application_id: applicationId,
    reviewer_id: user.id,
    vote,
    comment: comment || null,
  });
  if (error) throw error;

  // Check if threshold reached
  const { data: app } = await db
    .from('luma_helper_applications')
    .select('*, luma_approval_votes(vote)')
    .eq('id', applicationId)
    .single();

  const approveCount = (app.luma_approval_votes || []).filter(v => v.vote === 'approve').length;
  const rejectCount = (app.luma_approval_votes || []).filter(v => v.vote === 'reject').length;
  const tcCount = await getActiveTCCount();
  const needed = getRequiredVotes(tcCount);

  if (approveCount >= needed) await adminApprove(applicationId, 'Auto-approved by Trusted Circle');
  else if (rejectCount >= needed) await adminReject(applicationId, 'Auto-rejected by Trusted Circle');
}

async function getActiveTCCount() {
  const { count } = await db
    .from('luma_users')
    .select('id', { count: 'exact' })
    .eq('role', 'trusted_circle');
  return count || 0;
}

function getRequiredVotes(tcCount) {
  for (const tier of CONFIG.approvalThresholds) {
    if (tcCount <= tier.maxTC) return tier.required;
  }
  return 3;
}

// ─── Account deletion ─────────────────────────────────────────────────────────

async function adminDeleteUser(userId) {
  const { data, error } = await db.functions.invoke('admin-delete-user', {
    body: { userId },
  });
  if (error) {
    let body = null;
    try { body = await error.context?.json?.(); } catch (_) {}
    const msg = body?.error || body?.message || error.message;
    const steps = body?.steps ? ` [steps: ${body.steps.join('→')}]` : '';
    throw new Error(msg + steps);
  }
  return data;
}

async function deleteMyAccount() {
  const { data, error } = await db.functions.invoke('delete-account', {
    body: {},
  });
  if (error) {
    let body = null;
    try { body = await error.context?.json?.(); } catch (_) {}
    const msg = body?.error || body?.message || error.message;
    const steps = body?.steps ? ` [steps: ${body.steps.join('→')}]` : '';
    throw new Error(msg + steps);
  }
  return data;
}

// ─── Storage ─────────────────────────────────────────────────────────────────

async function uploadAvatar(file, userId) {
  const ext = file.name.split('.').pop();
  const path = `avatars/${userId}/${Date.now()}.${ext}`;
  const { error } = await db.storage.from('luma-media').upload(path, file, {
    cacheControl: '3600',
    upsert: true,
  });
  if (error) throw error;
  const { data } = db.storage.from('luma-media').getPublicUrl(path);
  return data.publicUrl;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function groupBy(arr, key) {
  return (arr || []).reduce((acc, item) => {
    const k = item[key];
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});
}
