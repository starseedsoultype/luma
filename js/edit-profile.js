// ─── State ────────────────────────────────────────────────────────────────────

const EditState = {
  submitting: false,
  profileId: null,
};

// ─── Init ─────────────────────────────────────────────────────────────────────

async function initEditProfile() {
  populateCitySelect();

  try {
    // Auth via Telegram
    const initData = window.Telegram?.WebApp?.initData;
    if (!initData) {
      showEditError();
      return;
    }

    const user = await signInWithTelegram(initData);
    if (!user) { showEditError(); return; }

    // Load helper profile
    const profile = await getMyHelperProfile(user.id);
    if (!profile) { showEditError(); return; }

    EditState.profileId = profile.id;
    prefillForm(profile);
    showForm();
  } catch (e) {
    console.error('edit-profile init error', e);
    showEditError();
  }
}

// ─── Pre-fill ─────────────────────────────────────────────────────────────────

function prefillForm(profile) {
  const set = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val || '';
  };

  set('edit-name', profile.display_name);
  set('edit-category', profile.category);
  set('edit-bio', profile.bio);
  set('edit-area', profile.location_area);
  set('edit-price', profile.price_from || '');
  set('edit-price-unit', profile.price_unit || 'hour');

  // City select
  const cityEl = document.getElementById('edit-city');
  if (cityEl && profile.city) cityEl.value = profile.city;

  // Language checkboxes
  const langs = profile.languages || [];
  document.querySelectorAll('input[name="language"]').forEach(cb => {
    cb.checked = langs.includes(cb.value);
  });
}

// ─── Submit ───────────────────────────────────────────────────────────────────

async function handleEditSubmit(e) {
  e.preventDefault();
  if (EditState.submitting || !EditState.profileId) return;

  clearErrors();

  const name = document.getElementById('edit-name')?.value.trim();
  const category = document.getElementById('edit-category')?.value;

  if (!name) { showError('edit-name-error', 'Required'); return; }
  if (!category) { showError('edit-category-error', 'Required'); return; }

  EditState.submitting = true;
  const btn = document.getElementById('edit-submit-btn');
  if (btn) { btn.disabled = true; btn.textContent = t('edit_profile_saving'); }

  try {
    await updateHelperProfile(EditState.profileId, {
      displayName:  name,
      category,
      bio:          document.getElementById('edit-bio')?.value.trim(),
      languages:    getSelectedLanguages(),
      locationArea: document.getElementById('edit-area')?.value.trim(),
      city:         document.getElementById('edit-city')?.value,
      priceFrom:    parseFloat(document.getElementById('edit-price')?.value) || null,
      priceUnit:    document.getElementById('edit-price-unit')?.value || null,
    });

    showSuccessToast();
    window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('success');
  } catch (err) {
    console.error('edit-profile save error', err);
    showError('edit-submit-error', err.message || t('edit_profile_error'));
  } finally {
    EditState.submitting = false;
    if (btn) { btn.disabled = false; btn.textContent = t('edit_profile_save'); }
  }
}

// ─── UI helpers ───────────────────────────────────────────────────────────────

function showForm() {
  document.getElementById('edit-loading')?.classList.add('page--hidden');
  document.getElementById('edit-form-wrapper')?.classList.remove('page--hidden');
}

function showEditError() {
  document.getElementById('edit-loading')?.classList.add('page--hidden');
  document.getElementById('edit-error')?.classList.remove('page--hidden');
}

function showSuccessToast() {
  const toast = document.getElementById('edit-success-toast');
  if (!toast) return;
  toast.classList.remove('page--hidden');
  setTimeout(() => toast.classList.add('page--hidden'), 2500);
}

function showError(id, msg) {
  const el = document.getElementById(id);
  if (el) { el.textContent = msg; el.classList.remove('page--hidden'); }
}

function clearErrors() {
  document.querySelectorAll('.form-error').forEach(el => {
    el.textContent = '';
    el.classList.add('page--hidden');
  });
}

function getSelectedLanguages() {
  return Array.from(document.querySelectorAll('input[name="language"]:checked')).map(c => c.value);
}

function populateCitySelect() {
  const sel = document.getElementById('edit-city');
  if (!sel) return;
  sel.innerHTML = getCityList().map(c =>
    `<option value="${c.key}">${App.lang === 'ru' ? c.nameRu : c.name}</option>`
  ).join('');
}

// ─── Boot ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('edit-form')?.addEventListener('submit', handleEditSubmit);
  initEditProfile();
});
