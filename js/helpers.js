// ─── State ────────────────────────────────────────────────────────────────────

const HelperState = {
  filters: { category: 'all', search: '', language: '', area: '' },
  helpers: [],
  loading: false,
};

// ─── Load & Render ────────────────────────────────────────────────────────────

async function loadHelpers() {
  if (HelperState.loading) return;
  HelperState.loading = true;
  showHelperSkeleton();

  try {
    const data = await getHelpers({
      city: App.city,
      ...HelperState.filters,
    });
    HelperState.helpers = data;
    renderHelpers(data);
  } catch (e) {
    console.error('Failed to load helpers', e);
    showHelperError();
  } finally {
    HelperState.loading = false;
  }
}

function renderHelpers(helpers) {
  const list = document.getElementById('helpers-list');
  if (!list) return;

  if (!helpers.length) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-state__icon">🔍</div>
        <div class="empty-state__title">${t('search_no_results')}</div>
      </div>`;
    return;
  }

  list.innerHTML = helpers.map((h, i) => renderHelperCard(h, i)).join('');
  list.querySelectorAll('.helper-card').forEach(card => {
    card.classList.add('animate-in');
  });
}

function renderHelperCard(h, index) {
  const favs = getFavorites();
  const isFav = favs.includes(h.id);
  const badges = (h.helper_badges || []).slice(0, 3);
  const price = h.price_from
    ? `${t('card_price_from')} ${h.price_from} ${t(`card_per_${h.price_unit}`) || ''}`
    : '';

  return `
    <div class="helper-card ${h.is_featured ? 'helper-card--featured' : ''}"
         style="animation-delay: ${index * 60}ms"
         onclick="openHelper('${h.id}')">
      <img class="helper-card__photo"
           src="${h.avatar_url || ''}"
           alt="${h.display_name}"
           onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2272%22 height=%2272%22><rect width=%2272%22 height=%2272%22 fill=%22%23D4E9FF%22/><text x=%2250%25%22 y=%2255%25%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22 font-size=%2228%22>${h.display_name.charAt(0)}</text></svg>'">
      <div class="helper-card__body">
        <div class="helper-card__name">${escHtml(h.display_name)}</div>
        <div class="helper-card__meta">
          ${t(`cat_${h.category}`)}${h.location_area ? ` · ${escHtml(h.location_area)}` : ''}
        </div>
        ${price ? `<div class="helper-card__price">${price}</div>` : ''}
        ${badges.length ? `
          <div class="helper-card__badges">
            ${badges.map(b => `<span class="badge badge--${b.badge_key === 'verified' ? 'verified' : 'default'}">${t(`badge_${b.badge_key}`)}</span>`).join('')}
          </div>` : ''}
        <div class="helper-card__actions" onclick="event.stopPropagation()">
          <button class="btn btn-primary btn-sm" onclick="contactHelperById('${h.id}', '${h.telegram_handle}')">
            ${t('card_message')}
          </button>
          <button class="btn-icon ${isFav ? 'btn-icon--active' : ''}"
                  id="fav-btn-${h.id}"
                  onclick="handleToggleFavorite('${h.id}', this)">
            ${isFav ? '🔖' : '🔖'}
          </button>
        </div>
      </div>
    </div>`;
}

function contactHelperById(id, handle) {
  const helper = HelperState.helpers.find(h => h.id === id);
  if (helper) contactHelper(helper, App.user);
}

function handleToggleFavorite(id, btn) {
  const added = toggleFavorite(id);
  btn.classList.toggle('btn-icon--active', added);
  tg?.HapticFeedback?.impactOccurred('light');
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function showHelperSkeleton() {
  const list = document.getElementById('helpers-list');
  if (!list) return;
  list.innerHTML = Array(4).fill(`
    <div class="skeleton-card">
      <div class="skeleton" style="width:72px;height:72px;border-radius:50%;flex-shrink:0"></div>
      <div style="flex:1;display:flex;flex-direction:column;gap:8px">
        <div class="skeleton" style="height:16px;width:60%"></div>
        <div class="skeleton" style="height:13px;width:40%"></div>
        <div class="skeleton" style="height:13px;width:30%"></div>
        <div class="skeleton" style="height:36px;width:100%;margin-top:4px"></div>
      </div>
    </div>`).join('');
}

function showHelperError() {
  const list = document.getElementById('helpers-list');
  if (!list) return;
  list.innerHTML = `
    <div class="empty-state">
      <div class="empty-state__icon">⚠️</div>
      <div class="empty-state__title">${t('error_generic')}</div>
    </div>`;
}

// ─── Filters ─────────────────────────────────────────────────────────────────

function setCategory(cat) {
  HelperState.filters.category = cat;
  document.querySelectorAll('.pill').forEach(p => {
    p.classList.toggle('pill--active', p.dataset.cat === cat);
  });
  loadHelpers();
}

function setupSearch() {
  const input = document.getElementById('search-input');
  if (!input) return;
  let timer;
  input.addEventListener('input', e => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      HelperState.filters.search = e.target.value.trim();
      loadHelpers();
    }, 400);
  });
}

// ─── Favorites page ───────────────────────────────────────────────────────────

async function loadFavorites() {
  const list = document.getElementById('favorites-list');
  if (!list) return;

  const ids = getFavorites();
  if (!ids.length) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-state__icon">🔖</div>
        <div class="empty-state__title">${t('favorites_empty')}</div>
      </div>`;
    return;
  }

  list.innerHTML = '<div class="skeleton-card"></div>'.repeat(2);
  try {
    const helpers = await getFavoriteHelpers();
    list.innerHTML = helpers.map((h, i) => renderHelperCard(h, i)).join('');
  } catch (e) {
    list.innerHTML = `<div class="empty-state"><div class="empty-state__title">${t('error_generic')}</div></div>`;
  }
}

// ─── Utils ────────────────────────────────────────────────────────────────────

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── Init ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  setupSearch();
  const pills = document.querySelectorAll('.pill');
  pills.forEach(p => {
    p.addEventListener('click', () => setCategory(p.dataset.cat));
  });
});
