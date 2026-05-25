// ─── State ────────────────────────────────────────────────────────────────────

const ApplyState = {
  submitting: false,
  telegramUser: null,
};

// ─── Form setup ───────────────────────────────────────────────────────────────

function setupApplyForm() {
  const form = document.getElementById('apply-form');
  if (!form) return;

  // Grab Telegram user from initDataUnsafe (available in Mini App context)
  ApplyState.telegramUser = window.Telegram?.WebApp?.initDataUnsafe?.user || null;

  // Pre-fill name from Telegram profile
  const nameInput = document.getElementById('apply-name');
  if (nameInput && ApplyState.telegramUser) {
    const { first_name, last_name } = ApplyState.telegramUser;
    const fullName = [first_name, last_name].filter(Boolean).join(' ');
    if (fullName) nameInput.value = fullName;
  }

  // Display Telegram photo or initials
  renderTelegramAvatar();

  // Legal checkbox gates the submit button
  const checkbox = document.getElementById('apply-legal-checkbox');
  const submitBtn = document.getElementById('apply-submit-btn');
  if (checkbox && submitBtn) {
    checkbox.addEventListener('change', () => {
      submitBtn.disabled = !checkbox.checked;
      submitBtn.style.opacity = checkbox.checked ? '1' : '0.5';
    });
  }

  form.addEventListener('submit', handleApplySubmit);
}

function renderTelegramAvatar() {
  const container = document.getElementById('tg-avatar');
  if (!container) return;

  const photoUrl = ApplyState.telegramUser?.photo_url;
  const firstName = ApplyState.telegramUser?.first_name || '?';
  const initial = firstName.charAt(0).toUpperCase();

  if (photoUrl) {
    container.innerHTML = `<img src="${photoUrl}"
      style="width:100%;height:100%;object-fit:cover;border-radius:50%" alt="">`;
  } else {
    container.textContent = initial;
  }
}

// ─── Submit ───────────────────────────────────────────────────────────────────

async function handleApplySubmit(e) {
  e.preventDefault();
  if (ApplyState.submitting) return;

  clearFormErrors();
  if (!validateApplyForm()) return;

  // Checkbox guard (redundant but explicit)
  const checkbox = document.getElementById('apply-legal-checkbox');
  if (!checkbox?.checked) {
    showFieldError('legal-error', App.lang === 'ru' ? 'Необходимо подтвердить.' : 'Confirmation required.');
    return;
  }

  ApplyState.submitting = true;
  const btn = document.getElementById('apply-submit-btn');
  if (btn) { btn.disabled = true; btn.textContent = t('loading'); btn.style.opacity = '1'; }

  try {
    const tgUser = ApplyState.telegramUser;
    // telegram_handle comes from Telegram — no manual input needed
    const telegramHandle = tgUser?.username ? '@' + tgUser.username : '';
    // avatar comes from Telegram — no upload needed
    const avatarUrl = tgUser?.photo_url || null;
    const city = document.getElementById('apply-city')?.value || App.city;

    await submitHelperApplication({
      profile: {
        displayName: document.getElementById('apply-name')?.value.trim(),
        category:    document.getElementById('apply-category')?.value,
        bio:         document.getElementById('apply-bio')?.value.trim(),
        languages:   getSelectedLanguages(),
        locationArea: document.getElementById('apply-area')?.value.trim(),
        city,
        priceFrom:   parseFloat(document.getElementById('apply-price')?.value) || null,
        priceUnit:   document.getElementById('apply-price-unit')?.value || null,
        telegramHandle,
        avatarUrl,    // direct URL from Telegram, no storage upload
        avatarFile: null,
      },
      legalConfirmation: true,
    });

    showApplySuccess();
  } catch (err) {
    console.error('Apply error', err);
    showFieldError('submit-error', err.message || t('apply_error'));
    if (btn) { btn.disabled = false; btn.textContent = t('apply_submit'); btn.style.opacity = '1'; }
  } finally {
    ApplyState.submitting = false;
  }
}

// ─── Validation ───────────────────────────────────────────────────────────────

function validateApplyForm() {
  let valid = true;

  const name = document.getElementById('apply-name')?.value.trim();
  if (!name) { showFieldError('name-error', 'Required'); valid = false; }

  const category = document.getElementById('apply-category')?.value;
  if (!category) { showFieldError('category-error', 'Required'); valid = false; }

  return valid;
}

function showFieldError(id, msg) {
  const el = document.getElementById(id);
  if (el) { el.textContent = msg; el.classList.remove('page--hidden'); }
}

function clearFormErrors() {
  document.querySelectorAll('.form-error').forEach(el => {
    el.textContent = '';
    el.classList.add('page--hidden');
  });
}

function getSelectedLanguages() {
  return Array.from(document.querySelectorAll('input[name="language"]:checked')).map(c => c.value);
}

// ─── Success ──────────────────────────────────────────────────────────────────

function showApplySuccess() {
  document.getElementById('apply-form-wrapper')?.classList.add('page--hidden');
  document.getElementById('apply-success')?.classList.remove('page--hidden');
}

// ─── City selector ────────────────────────────────────────────────────────────

function populateCitySelect() {
  const sel = document.getElementById('apply-city');
  if (!sel) return;
  sel.innerHTML = getCityList().map(c =>
    `<option value="${c.key}" ${c.key === App.city ? 'selected' : ''}>
      ${App.lang === 'ru' ? c.nameRu : c.name}
    </option>`
  ).join('');
}

// ─── Init ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  setupApplyForm();
  populateCitySelect();
});
