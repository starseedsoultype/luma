// ─── State ────────────────────────────────────────────────────────────────────

const CircleState = {
  current: null,
  queue: [],
  myVotes: [],
};

// ─── Load ─────────────────────────────────────────────────────────────────────

async function loadCirclePage() {
  if (!App.user || !['trusted_circle', 'admin'].includes(App.user.role)) {
    document.getElementById('page-circle')?.classList.add('page--hidden');
    return;
  }

  const tab = document.querySelector('.circle-tab--active')?.dataset.tab || 'pending';
  if (tab === 'pending') await loadPendingForCircle();
  else await loadMyVotes();
}

async function loadPendingForCircle() {
  const list = document.getElementById('circle-list');
  if (!list) return;

  list.innerHTML = '<div class="skeleton-card"></div>'.repeat(2);

  try {
    const apps = await getPendingForCircle();
    CircleState.queue = apps;

    if (!apps.length) {
      list.innerHTML = `<div class="empty-state">
        <div class="empty-state__icon">✅</div>
        <div class="empty-state__title">${t('circle_empty')}</div>
      </div>`;
      return;
    }

    const tcCount = await getActiveTCCount();
    const needed = getRequiredVotes(tcCount);
    list.innerHTML = apps.map(app => renderCircleCard(app, needed)).join('');
  } catch (e) {
    list.innerHTML = `<div class="empty-state"><div class="empty-state__title">${t('error_generic')}</div></div>`;
  }
}

// ─── Render ───────────────────────────────────────────────────────────────────

function renderCircleCard(app, needed) {
  const profile = app.helper_profiles;
  if (!profile) return '';

  const votes = app.approval_votes || [];
  const approveCount = votes.filter(v => v.vote === 'approve').length;
  const rejectCount = votes.filter(v => v.vote === 'reject').length;

  return `
    <div class="app-card" id="circle-card-${app.id}">
      <div style="display:flex;gap:12px;align-items:flex-start">
        <img src="${profile.avatar_url || ''}" alt="${profile.display_name}"
             style="width:56px;height:56px;border-radius:50%;object-fit:cover;flex-shrink:0"
             onerror="this.style.background='#D4E9FF';this.src=''">
        <div style="flex:1">
          <div style="font-weight:600;font-size:16px">${escHtml(profile.display_name)}</div>
          <div style="font-size:13px;color:var(--text-secondary)">
            ${t(`cat_${profile.category}`)}${profile.location_area ? ` · ${escHtml(profile.location_area)}` : ''}
          </div>
          ${profile.bio ? `<div style="font-size:13px;margin-top:6px;color:var(--text-primary)">${escHtml(profile.bio)}</div>` : ''}
          ${profile.languages?.length ? `<div style="font-size:12px;color:var(--text-muted);margin-top:4px">🗣 ${profile.languages.join(', ')}</div>` : ''}
          <div style="font-size:12px;color:var(--text-muted);margin-top:4px">
            ✅ ${approveCount} &nbsp; ❌ ${rejectCount} &nbsp; ${t('circle_votes_needed')}: ${needed}
          </div>
        </div>
      </div>

      <div style="margin-top:12px">
        <textarea class="form-input" id="comment-${app.id}"
          placeholder="${t('circle_comment_placeholder')}"
          rows="2" style="height:auto;padding:10px 14px;resize:none"></textarea>
      </div>

      <div class="vote-buttons" style="margin-top:10px">
        <button class="btn btn-approve" onclick="handleVote('${app.id}', 'approve')">
          ${t('circle_approve')}
        </button>
        <button class="btn btn-reject" onclick="handleVote('${app.id}', 'reject')">
          ${t('circle_reject')}
        </button>
        <button class="btn btn-skip" onclick="handleVote('${app.id}', 'skip')">
          ${t('circle_skip')}
        </button>
      </div>
    </div>`;
}

// ─── Vote ─────────────────────────────────────────────────────────────────────

async function handleVote(applicationId, vote) {
  const card = document.getElementById(`circle-card-${applicationId}`);
  const comment = document.getElementById(`comment-${applicationId}`)?.value.trim();

  const btns = card?.querySelectorAll('.vote-buttons button');
  btns?.forEach(b => b.disabled = true);

  try {
    await castVote(applicationId, vote, comment);
    card?.classList.add('animate-out');
    setTimeout(() => { card?.remove(); checkEmptyQueue(); }, 300);
    tg?.HapticFeedback?.notificationOccurred('success');
  } catch (e) {
    console.error('Vote failed', e);
    btns?.forEach(b => b.disabled = false);
    tg?.HapticFeedback?.notificationOccurred('error');
  }
}

function checkEmptyQueue() {
  const list = document.getElementById('circle-list');
  if (!list?.children.length) {
    list.innerHTML = `<div class="empty-state">
      <div class="empty-state__icon">✅</div>
      <div class="empty-state__title">${t('circle_empty')}</div>
    </div>`;
  }
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

async function loadMyVotes() {
  // Future: load vote history
}

function switchCircleTab(tab) {
  document.querySelectorAll('.circle-tab').forEach(t => {
    t.classList.toggle('circle-tab--active', t.dataset.tab === tab);
  });
  if (tab === 'pending') loadPendingForCircle();
  else loadMyVotes();
}

// ─── Init ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.circle-tab').forEach(tab => {
    tab.addEventListener('click', () => switchCircleTab(tab.dataset.tab));
  });
});
