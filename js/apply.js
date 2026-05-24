// ─── State ────────────────────────────────────────────────────────────────────

const ApplyState = {
  avatarFile: null,
  submitting: false,
};

// ─── Form setup ───────────────────────────────────────────────────────────────

function setupApplyForm() {
  const form = document.getElementById('apply-form');
  if (!form) return;

  // Avatar upload
  const avatarInput = document.getElementById('avatar-input');
  const avatarPreview = document.getElementById('avatar-preview');
  avatarInput?.addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      showFieldError('avatar-error', 'Max file size is 5MB.');
      return;
    }
    ApplyState.avatarFile = file;
    const reader = new FileReader();
    reader.onload = ev => {
      if (avatarPreview) {
        avatarPreview.style.backgroundImage = `url(${ev.target.result})`;
        avatarPreview.innerHTML = '';
      }
    };
    reader.readAsDataURL(file);
  });

  // Telegram handle format
  const tgInput = document.getElementById('apply-telegram');
  tgInput?.addEventListener('input', e => {
    let v = e.target.value.trim();
    if (v && !v.startsWith('@')) v = '@' + v;
    e.target.value = v;
  });

  // Submit
  form.addEventListener('submit', handleApplySubmit);
}

async function handleApplySubmit(e) {
  e.preventDefault();
  if (ApplyState.submitting) return;

  clearFormErrors();
  const valid = validateApplyForm();
  if (!valid) return;

  const legalCheckbox = document.getElementById('apply-legal-checkbox');
  if (!legalCheckbox?.checked) {
    showFieldError('legal-error', App.lang === 'ru'
      ? 'Необходимо подтвердить.'
      : 'Confirmation required.');
    return;
  }

  ApplyState.submitting = true;
  const btn = document.getElementById('apply-submit-btn');
  if (btn) { btn.disabled = true; btn.textContent = t('loading'); }

  try {
    const city = document.getElementById('apply-city')?.value || App.city;
    await submitHelperApplication({
      profile: {
        displayName: document.getElementById('apply-name')?.value.trim(),
        category: document.getElementById('apply-category')?.value,
        bio: document.getElementById('apply-bio')?.value.trim(),
        languages: getSelectedLanguages(),
        locationArea: document.getElementById('apply-area')?.value.trim(),
        city,
        priceFrom: parseFloat(document.getElementById('apply-price')?.value) || null,
        priceUnit: document.getElementById('apply-price-unit')?.value || null,
        telegramHandle: document.getElementById('apply-telegram')?.value.trim(),
        avatarFile: ApplyState.avatarFile,
      },
      legalConfirmation: true,
    });
    showApplySuccess();
  } catch (err) {
    console.error('Apply error', err);
    showFieldError('submit-error', t('apply_error'));
    if (btn) { btn.disabled = false; btn.textContent = t('apply_submit'); }
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

  const tg = document.getElementById('apply-telegram')?.value.trim();
  if (!tg || !tg.startsWith('@')) { showFieldError('telegram-error', 'Enter your @username'); valid = false; }

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
  const checkboxes = document.querySelectorAll('input[name="language"]:checked');
  return Array.from(checkboxes).map(c => c.value);
}

// ─── Success screen ───────────────────────────────────────────────────────────

function showApplySuccess() {
  document.getElementById('apply-form-wrapper')?.classList.add('page--hidden');
  const success = document.getElementById('apply-success');
  if (success) success.classList.remove('page--hidden');
}

// ─── City selector populate ───────────────────────────────────────────────────

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
