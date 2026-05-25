// ─── Telegram Web App ─────────────────────────────────────────────────────────

const tg = window.Telegram?.WebApp;

if (tg) {
  tg.ready();
  tg.expand();
}

// ─── App State ────────────────────────────────────────────────────────────────

const App = {
  user: null,
  city: null,
  lang: 'en',
  initialized: false,
};

// ─── Init ─────────────────────────────────────────────────────────────────────

async function initApp() {
  // Language from Telegram or localStorage
  const savedLang = localStorage.getItem('luma_lang');
  const tgLang = tg?.initDataUnsafe?.user?.language_code;
  App.lang = savedLang || (tgLang === 'ru' ? 'ru' : 'en');
  setLang(App.lang);

  // City from startapp param or localStorage or default
  const startParam = tg?.initDataUnsafe?.start_param || '';
  const cityParam = startParam.startsWith('city_') ? startParam.replace('city_', '') : null;
  App.city = cityParam || localStorage.getItem('luma_city') || CONFIG.defaultCity;
  if (!CITIES[App.city]) App.city = CONFIG.defaultCity;

  // Persist invite code so it survives menu-button re-opens and refreshes
  if (startParam.startsWith('invite_')) {
    localStorage.setItem('luma_pending_invite', startParam.slice(7));
  }

  // Auth
  try {
    App.user = await authUser();
  } catch (e) {
    console.error('Auth failed', e);
    const code = e?.code || e?.message || '';
    if (code === 'invite_required') { showGate('invite'); return; }
    if (code === 'banned') { showGate('banned'); return; }
    if (code === 'pending') { showGate('invite', 'pending'); return; }
    const message =
      e?.message ||
      e?.error_description ||
      (typeof e?.error === 'string' ? e.error : null) ||
      JSON.stringify(e, Object.getOwnPropertyNames(e), 2);
    showGate('error', message);
    return;
  }

  // Gate checks now handled by validate-telegram Edge Function (returns 403 with code)
  if (App.user?.status === 'banned') {
    showGate('banned');
    return;
  }

  App.initialized = true;
  renderPage();
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

async function authUser() {
  if (!tg?.initData) {
    // Dev mode fallback
    if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
      return { id: 'dev-user', role: 'admin', status: 'active', name: 'Dev User', current_city: 'phangan' };
    }
    return null;
  }

  return await signInWithTelegram(tg.initData);
}

// Debug: expose start_param on gate screen so we can see it on device
function getStartParamDebug() {
  const sp = tg?.initDataUnsafe?.start_param;
  return `start_param: "${sp || ''}" (${sp ? 'present' : 'EMPTY'})`;
}

// ─── Invite activation ────────────────────────────────────────────────────────

async function handleInviteActivation(code) {
  try {
    const result = await validateInvite(code);
    if (result.success) {
      App.user = await getCurrentUser();
      if (App.user) {
        App.initialized = true;
        renderPage();
      } else {
        showGate('invite');
      }
    } else {
      showGate('invite', result.error || 'invalid');
    }
  } catch (e) {
    showGate('invite', 'invalid');
  }
}

// ─── Gate screens ─────────────────────────────────────────────────────────────

function showGate(type, errorCode) {
  const gate = document.getElementById('gate-screen');
  if (!gate) return;

  gate.classList.remove('page--hidden');

  const title = gate.querySelector('.gate-title');
  const body = gate.querySelector('.gate-body');

  if (type === 'invite') {
    title.textContent = t('gate_title');
    const baseText = errorCode
      ? t(`error_invite_${errorCode}`) || t('error_invite_invalid')
      : t('gate_text');
    body.textContent = baseText + '\n\n[debug] ' + getStartParamDebug();
  } else if (type === 'banned') {
    title.textContent = 'Access Restricted';
    body.textContent = 'Your account has been suspended.';
  } else {
    title.textContent = 'Error';
    body.textContent =
      typeof errorCode === 'string'
        ? errorCode
        : errorCode
          ? JSON.stringify(errorCode, Object.getOwnPropertyNames(errorCode), 2)
          : t('error_generic');
  }

  document.getElementById('main-app')?.classList.add('page--hidden');
}

// ─── Routing ─────────────────────────────────────────────────────────────────

function renderPage() {
  const page = getCurrentPage();
  document.getElementById('gate-screen')?.classList.add('page--hidden');
  document.getElementById('main-app')?.classList.remove('page--hidden');
  updateNavVisibility(); // show ⚙ Admin / ◎ Circle based on role
  activateNavItem(page);
  loadPage(page);
  updateCityDisplay();
  updateLangDisplay();
}

function getCurrentPage() {
  const hash = location.hash.replace('#', '') || 'home';
  return hash;
}

function navigateTo(page) {
  location.hash = page;
  activateNavItem(page);
  loadPage(page);
  if (tg) tg.HapticFeedback?.impactOccurred('light');
}

function loadPage(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.add('page--hidden'));
  const el = document.getElementById(`page-${page}`);
  if (el) {
    el.classList.remove('page--hidden');
    el.scrollTop = 0;
  }

  switch (page) {
    case 'home':
      if (typeof loadHelpers === 'function') loadHelpers();
      break;
    case 'favorites':
      if (typeof loadFavorites === 'function') loadFavorites();
      break;
    case 'invite':
      if (typeof loadInvitePage === 'function') loadInvitePage();
      break;
    case 'profile':
      loadProfilePage();
      break;
    case 'admin':
      if (typeof loadAdminPage === 'function') loadAdminPage();
      break;
    case 'circle':
      if (typeof loadCirclePage === 'function') loadCirclePage();
      break;
  }
}

// ─── Nav ──────────────────────────────────────────────────────────────────────

function activateNavItem(page) {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('nav-item--active', item.dataset.page === page);
  });
}

function setupNav() {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => navigateTo(item.dataset.page));
  });
}

// Called after App.user is set — shows role-gated nav items
function updateNavVisibility() {
  const role = App.user?.role;
  if (role === 'admin') {
    document.getElementById('nav-admin')?.classList.remove('page--hidden');
  }
  if (role === 'trusted_circle' || role === 'admin') {
    document.getElementById('nav-circle')?.classList.remove('page--hidden');
  }
}

// ─── City ─────────────────────────────────────────────────────────────────────

function updateCityDisplay() {
  const city = getCity(App.city);
  const el = document.querySelector('.header-city');
  if (el) el.textContent = `${city.flag} ${city.name}`;
}

function switchCity(cityKey) {
  App.city = cityKey;
  localStorage.setItem('luma_city', cityKey);
  updateCityDisplay();
  if (typeof loadHelpers === 'function') loadHelpers();
  closeCityPicker();
}

function openCityPicker() {
  const picker = document.getElementById('city-picker');
  if (!picker) return;
  picker.innerHTML = getCityList().map(c => `
    <div class="city-option ${c.key === App.city ? 'city-option--active' : ''}" onclick="switchCity('${c.key}')">
      <span>${c.flag} ${App.lang === 'ru' ? c.nameRu : c.name}</span>
      ${c.is_private ? '<span class="badge badge--verified" style="font-size:10px">Private</span>' : ''}
    </div>
  `).join('');
  picker.classList.remove('page--hidden');
}

function closeCityPicker() {
  document.getElementById('city-picker')?.classList.add('page--hidden');
}

// ─── Language ─────────────────────────────────────────────────────────────────

function updateLangDisplay() {
  const el = document.querySelector('.header-lang');
  if (el) el.textContent = App.lang.toUpperCase();
}

function toggleLang() {
  App.lang = App.lang === 'ru' ? 'en' : 'ru';
  localStorage.setItem('luma_lang', App.lang);
  setLang(App.lang);
  updateLangDisplay();
  renderPage();
}

// ─── Profile page ─────────────────────────────────────────────────────────────

function loadProfilePage() {
  const u = App.user;
  if (!u) return;
  const el = document.getElementById('page-profile');
  if (!el) return;

  const nameEl = el.querySelector('.profile-name');
  if (nameEl) nameEl.textContent = u.name || '';

  const handleEl = el.querySelector('.profile-handle');
  if (handleEl) handleEl.textContent = u.telegram_handle ? `@${u.telegram_handle}` : '';

  const roleEl = el.querySelector('.profile-role');
  if (roleEl) roleEl.textContent = u.role || '';

  const cityEl = document.getElementById('profile-city-val');
  if (cityEl) cityEl.textContent = u.current_city || '';

  const langEl = document.getElementById('profile-lang-val');
  if (langEl) langEl.textContent = u.language ? u.language.toUpperCase() : '';

  loadMyApplication();
}

async function loadMyApplication() {
  if (!App.user) return;
  try {
    const app = await getMyApplication(App.user.id);
    const el = document.getElementById('my-application-section');
    if (!el) return;
    if (app) {
      el.classList.remove('page--hidden');
      el.querySelector('.my-app-status')?.classList.forEach(c => {
        if (c.startsWith('status-badge--')) el.querySelector('.my-app-status').classList.remove(c);
      });
      const statusEl = el.querySelector('.my-app-status');
      if (statusEl) {
        statusEl.textContent = t(`status_${app.status}`);
        statusEl.className = `status-badge status-badge--${app.status}`;
      }
    }
  } catch (e) {
    console.error('Failed to load application', e);
  }
}

// ─── Helper detail ────────────────────────────────────────────────────────────

async function openHelper(id) {
  try {
    const helper = await getHelperById(id);
    renderHelperDetail(helper);
    navigateTo('helper');
  } catch (e) {
    console.error('Failed to load helper', e);
  }
}

function renderHelperDetail(helper) {
  const page = document.getElementById('page-helper');
  if (!page) return;

  const nameEl = page.querySelector('.helper-detail-name');
  if (nameEl) nameEl.textContent = helper.display_name || '';

  const catEl = page.querySelector('.helper-detail-category');
  if (catEl) catEl.textContent = t(`cat_${helper.category}`);

  const areaEl = page.querySelector('.helper-detail-area');
  if (areaEl) areaEl.textContent = helper.location_area || '';

  const bioEl = page.querySelector('.helper-detail-bio');
  if (bioEl) bioEl.textContent = helper.bio || '';

  const photo = page.querySelector('.helper-detail-photo');
  if (photo) {
    photo.src = helper.avatar_url || '/css/placeholder.png';
    photo.alt = helper.display_name;
  }

  const priceEl = page.querySelector('.helper-detail-price');
  if (priceEl && helper.price_from) {
    priceEl.textContent = `${t('card_price_from')} ${helper.price_from} ${helper.currency || ''} ${t(`card_per_${helper.price_unit}`) || ''}`;
  }

  const badgesEl = page.querySelector('.helper-detail-badges');
  if (badgesEl) {
    badgesEl.innerHTML = (helper.helper_badges || []).map(b =>
      `<span class="badge badge--${b.badge_key === 'verified' ? 'verified' : 'default'}">${t(`badge_${b.badge_key}`)}</span>`
    ).join('');
  }

  const contactBtn = page.querySelector('.btn-contact-helper');
  if (contactBtn) {
    contactBtn.onclick = () => contactHelper(helper, App.user);
  }
}

function contactHelper(helper, user) {
  if (user) recordContactClick(helper.id, user.id).catch(() => {});
  const handle = helper.telegram_handle.replace('@', '');
  tg?.openTelegramLink
    ? tg.openTelegramLink(`https://t.me/${handle}`)
    : window.open(`https://t.me/${handle}`, '_blank');
}

// ─── Delete account ───────────────────────────────────────────────────────────

function confirmDeleteAccount() {
  document.getElementById('delete-account-panel')?.classList.remove('page--hidden');
  document.getElementById('delete-account-trigger')?.classList.add('page--hidden');
}

function cancelDeleteAccount() {
  document.getElementById('delete-account-panel')?.classList.add('page--hidden');
  document.getElementById('delete-account-trigger')?.classList.remove('page--hidden');
}

async function executeDeleteAccount() {
  const confirmBtn = document.getElementById('delete-account-confirm-btn');
  if (confirmBtn) {
    confirmBtn.textContent = t('profile_delete_loading');
    confirmBtn.disabled = true;
  }
  try {
    await deleteMyAccount();
    // Clear all local state
    localStorage.removeItem('luma_favorites');
    localStorage.removeItem('luma_pending_invite');
    localStorage.removeItem('luma_city');
    localStorage.removeItem('luma_lang');
    // Sign out of Supabase session
    await db.auth.signOut().catch(() => {});
    // Close Mini App or reload
    if (tg?.close) {
      tg.close();
    } else {
      location.reload();
    }
  } catch (e) {
    console.error('Delete account failed:', e);
    alert('Failed to delete: ' + (e?.message || 'Unknown error'));
    if (confirmBtn) {
      confirmBtn.textContent = t('profile_delete_confirm');
      confirmBtn.disabled = false;
    }
  }
}

// ─── Back navigation ──────────────────────────────────────────────────────────

function goBack() {
  history.back();
}

// ─── Boot ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  setupNav();
  window.addEventListener('hashchange', () => {
    if (App.initialized) loadPage(getCurrentPage());
  });
  await initApp();
});
