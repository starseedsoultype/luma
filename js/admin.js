// ─── Load admin page ──────────────────────────────────────────────────────────
// Called by app.js when navigating to the admin tab.
// Injects the full admin UI into #admin-content, then wires up tabs and loads data.

async function loadAdminPage() {
  const content = document.getElementById('admin-content');
  if (!content) return;

  // Fresh role check
  const user = await getCurrentUser();
  if (!user || user.role !== 'admin') {
    content.innerHTML = `<div class="empty-state"><div class="empty-state__title">${t('error_not_authorized')}</div></div>`;
    return;
  }

  // Inject admin HTML structure
  content.innerHTML = `
    <div style="display:flex;gap:8px;margin-bottom:12px">
      <select id="admin-city-filter" class="form-select" style="flex:1">
        <option value="">All cities</option>
      </select>
      <select id="admin-status-filter" class="form-select" style="flex:1">
        <option value="pending">Pending</option>
        <option value="approved">Approved</option>
        <option value="rejected">Rejected</option>
        <option value="">All</option>
      </select>
    </div>
    <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap">
      <button class="pill pill--active admin-tab" data-tab="applications">Applications</button>
      <button class="pill admin-tab" data-tab="helpers">Helpers</button>
      <button class="pill admin-tab" data-tab="users">Users</button>
      <button class="pill admin-tab" data-tab="stats">Stats</button>
    </div>
    <div id="admin-tab-applications"><div id="admin-applications-list"></div></div>
    <div id="admin-tab-helpers" class="page--hidden"><div id="admin-helpers-list"></div></div>
    <div id="admin-tab-users" class="page--hidden"><div id="admin-users-list"></div></div>
    <div id="admin-tab-stats" class="page--hidden"><div id="admin-stats-content"></div></div>
  `;

  populateAdminCityFilter();
  setupAdminTabs();
  loadAdminApplications();
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

function setupAdminTabs() {
  document.querySelectorAll('.admin-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('pill--active'));
      tab.classList.add('pill--active');
      ['applications', 'helpers', 'users', 'stats'].forEach(name => {
        document.getElementById(`admin-tab-${name}`)?.classList.add('page--hidden');
      });
      const active = document.getElementById(`admin-tab-${tab.dataset.tab}`);
      active?.classList.remove('page--hidden');
      if (tab.dataset.tab === 'applications') loadAdminApplications();
      if (tab.dataset.tab === 'helpers') loadAdminHelpers();
      if (tab.dataset.tab === 'users') loadAdminUsers();
      if (tab.dataset.tab === 'stats') loadAdminStats();
    });
  });
}

// ─── Applications ─────────────────────────────────────────────────────────────

async function loadAdminApplications() {
  const list = document.getElementById('admin-applications-list');
  if (!list) return;
  list.innerHTML = '<div class="skeleton-card"></div>'.repeat(3);

  const city = document.getElementById('admin-city-filter')?.value || '';
  const status = document.getElementById('admin-status-filter')?.value || 'pending';

  try {
    const apps = await getAllApplications(city || null, status || null);
    if (!apps.length) {
      list.innerHTML = `<div class="empty-state"><div class="empty-state__title">No applications</div></div>`;
      return;
    }
    list.innerHTML = apps.map(renderAdminAppCard).join('');
  } catch (e) {
    list.innerHTML = `<div class="empty-state"><div class="empty-state__title">${t('error_generic')}</div></div>`;
  }
}

function renderAdminAppCard(app) {
  // Supabase returns joined tables using the actual table name as the key
  const p = app.luma_helper_profiles;
  if (!p) return '';
  const votes = app.luma_approval_votes || [];
  const approves = votes.filter(v => v.vote === 'approve').length;
  const rejects = votes.filter(v => v.vote === 'reject').length;

  return `
    <div class="app-card" id="admin-app-${app.id}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px">
        <div>
          <div style="font-weight:600;font-size:16px">${escHtml(p.display_name)}</div>
          <div style="font-size:13px;color:var(--text-secondary)">${t(`cat_${p.category}`)} · ${escHtml(p.city)}</div>
          ${p.telegram_handle ? `<div style="font-size:12px;color:var(--accent);margin-top:2px">${escHtml(p.telegram_handle)}</div>` : ''}
        </div>
        <span class="status-badge status-badge--${app.status}">${t(`status_${app.status}`)}</span>
      </div>

      ${p.bio ? `<div style="font-size:13px;color:var(--text-secondary);margin-bottom:10px">${escHtml(p.bio)}</div>` : ''}

      <div style="font-size:12px;color:var(--text-muted);margin-bottom:12px">
        TC votes: ✅ ${approves} · ❌ ${rejects}
        ${app.admin_comment ? ` · Note: ${escHtml(app.admin_comment)}` : ''}
      </div>

      <textarea class="form-input" id="admin-comment-${app.id}"
        placeholder="${t('admin_comment_placeholder')}"
        rows="2" style="height:auto;padding:10px 14px;resize:none;margin-bottom:10px"></textarea>

      <div style="display:flex;flex-wrap:wrap;gap:8px">
        ${app.status !== 'approved' ? `
          <button class="btn btn-sm btn-approve" onclick="handleAdminApprove('${app.id}')">
            ${t('admin_approve')}
          </button>` : ''}
        ${app.status !== 'rejected' ? `
          <button class="btn btn-sm btn-reject" onclick="handleAdminReject('${app.id}')">
            ${t('admin_reject')}
          </button>` : ''}
        <button class="btn btn-sm" style="background:var(--bg-subtle);color:var(--text-secondary)"
          onclick="handleAdminOverride('${p.id}', 'hidden')">
          ${t('admin_hide')}
        </button>
        <button class="btn btn-sm" style="background:var(--accent-light);color:var(--accent)"
          onclick="promptFeature('${p.id}')">
          ${t('admin_feature')}
        </button>
      </div>
    </div>`;
}

async function handleAdminApprove(appId) {
  const comment = document.getElementById(`admin-comment-${appId}`)?.value.trim();
  try {
    await adminApprove(appId, comment);
    document.getElementById(`admin-app-${appId}`)?.remove();
    tg?.HapticFeedback?.notificationOccurred('success');
  } catch (e) { alert(t('error_generic')); }
}

async function handleAdminReject(appId) {
  const comment = document.getElementById(`admin-comment-${appId}`)?.value.trim();
  try {
    await adminReject(appId, comment);
    document.getElementById(`admin-app-${appId}`)?.remove();
    tg?.HapticFeedback?.notificationOccurred('success');
  } catch (e) { alert(t('error_generic')); }
}

async function handleAdminOverride(profileId, status) {
  try {
    await adminOverride(profileId, status);
    loadAdminApplications();
  } catch (e) { alert(t('error_generic')); }
}

async function promptFeature(profileId) {
  const days = prompt(t('admin_feature_days'), '7');
  if (!days) return;
  try {
    await adminFeature(profileId, parseInt(days));
    tg?.HapticFeedback?.notificationOccurred('success');
  } catch (e) { alert(t('error_generic')); }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function loadAdminHelpers() {
  const list = document.getElementById('admin-helpers-list');
  if (!list) return;
  list.innerHTML = '<div class="skeleton-card"></div>'.repeat(3);
  try {
    const helpers = await getHelpers({ city: null });
    list.innerHTML = helpers.map(h => `
      <div class="app-card">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div>
            <div style="font-weight:600">${escHtml(h.display_name)}</div>
            <div style="font-size:13px;color:var(--text-secondary)">${t(`cat_${h.category}`)} · ${h.city}</div>
          </div>
          <span class="status-badge status-badge--${h.trust_status}">${t(`status_${h.trust_status}`)}</span>
        </div>
        <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
          <button class="btn btn-sm" style="background:var(--accent-light);color:var(--accent)"
            onclick="promptFeature('${h.id}')">Feature</button>
          <button class="btn btn-sm btn-reject"
            onclick="handleAdminOverride('${h.id}','hidden')">Hide</button>
          <button class="btn btn-sm" style="background:var(--bg-subtle);color:var(--text-primary)"
            onclick="handleAdminOverride('${h.id}','approved')">Restore</button>
        </div>
      </div>`).join('');
  } catch (e) {
    list.innerHTML = `<div class="empty-state"><div class="empty-state__title">${t('error_generic')}</div></div>`;
  }
}

// ─── Users ────────────────────────────────────────────────────────────────────

async function loadAdminUsers() {
  const list = document.getElementById('admin-users-list');
  if (!list) return;
  list.innerHTML = '<div class="skeleton-card"></div>'.repeat(3);
  try {
    const { data, error } = await db.from('luma_users').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    list.innerHTML = data.map(u => `
      <div class="app-card">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div>
            <div style="font-weight:600">${escHtml(u.name)}</div>
            <div style="font-size:13px;color:var(--text-secondary)">
              ${u.telegram_handle ? `@${u.telegram_handle} · ` : ''}${u.role} · ${u.current_city || ''}
            </div>
          </div>
          <span class="status-badge status-badge--${u.status === 'active' ? 'approved' : 'rejected'}">
            ${t(`status_${u.status}`)}
          </span>
        </div>
        <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
          ${u.role !== 'trusted_circle' ? `
            <button class="btn btn-sm" style="background:var(--accent-light);color:var(--accent)"
              onclick="handleAssignRole('${u.id}','trusted_circle')">
              ${t('admin_assign_tc')}
            </button>` : `
            <button class="btn btn-sm" style="background:var(--bg-subtle);color:var(--text-secondary)"
              onclick="handleAssignRole('${u.id}','client')">
              ${t('admin_remove_tc')}
            </button>`}
          ${u.status === 'active' ? `
            <button class="btn btn-sm btn-reject" onclick="handleBan('${u.id}','ban')">
              ${t('admin_ban')}
            </button>` : `
            <button class="btn btn-sm btn-approve" onclick="handleBan('${u.id}','unban')">
              ${t('admin_unban')}
            </button>`}
        </div>
      </div>`).join('');
  } catch (e) {
    list.innerHTML = `<div class="empty-state"><div class="empty-state__title">${t('error_generic')}</div></div>`;
  }
}

async function handleAssignRole(userId, role) {
  try {
    await assignRole(userId, role);
    loadAdminUsers();
    tg?.HapticFeedback?.notificationOccurred('success');
  } catch (e) { alert(t('error_generic')); }
}

async function handleBan(userId, action) {
  try {
    if (action === 'ban') await adminBanUser(userId);
    else await adminUnbanUser(userId);
    loadAdminUsers();
  } catch (e) { alert(t('error_generic')); }
}

// ─── Stats ────────────────────────────────────────────────────────────────────

async function loadAdminStats() {
  const el = document.getElementById('admin-stats-content');
  if (!el) return;
  el.innerHTML = '<div class="skeleton" style="height:200px;border-radius:12px"></div>';
  try {
    const s = await getAdminStats();
    el.innerHTML = `
      <div class="stats-grid">
        <div class="stat-card"><div class="stat-value">${s.totalUsers}</div><div class="stat-label">Users</div></div>
        <div class="stat-card"><div class="stat-value">${s.totalHelpers}</div><div class="stat-label">Helpers</div></div>
        <div class="stat-card"><div class="stat-value">${s.totalApplications}</div><div class="stat-label">Applications</div></div>
        <div class="stat-card"><div class="stat-value">${s.totalClicks}</div><div class="stat-label">TG Clicks</div></div>
        <div class="stat-card"><div class="stat-value">${s.totalInvites}</div><div class="stat-label">Invites</div></div>
        <div class="stat-card"><div class="stat-value">${s.invitesUsed}</div><div class="stat-label">Used</div></div>
      </div>
      <div class="section-header" style="margin-top:20px"><span class="section-title">By category</span></div>
      <div class="app-card">
        ${Object.entries(s.helpersByCategory).map(([k, v]) =>
          `<div class="profile-row"><span class="profile-row__label">${t(`cat_${k}`)}</span><span class="profile-row__value">${v}</span></div>`
        ).join('')}
      </div>`;
  } catch (e) {
    el.innerHTML = `<div class="empty-state"><div class="empty-state__title">${t('error_generic')}</div></div>`;
  }
}

// ─── City filter ──────────────────────────────────────────────────────────────

function populateAdminCityFilter() {
  const sel = document.getElementById('admin-city-filter');
  if (!sel) return;
  getCityList().forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.key;
    opt.textContent = c.name;
    sel.appendChild(opt);
  });
}

// ─── Utils ────────────────────────────────────────────────────────────────────

function escHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
