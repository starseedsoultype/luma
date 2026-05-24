// ─── Load invite page ─────────────────────────────────────────────────────────

async function loadInvitePage() {
  if (!App.user) return;
  renderInviteHistory();
}

async function renderInviteHistory() {
  const list = document.getElementById('invite-history-list');
  if (!list) return;

  list.innerHTML = '<div class="skeleton" style="height:60px;border-radius:12px"></div>'.repeat(2);

  try {
    const invites = await getMyInvites(App.user.id);
    if (!invites.length) {
      list.innerHTML = `
        <div class="empty-state empty-state--card">
          <div class="empty-state__title">${App.lang === 'ru' ? 'Ещё нет приглашений' : 'No invites yet'}</div>
          <div class="empty-state__text">${App.lang === 'ru' ? 'Создайте первое приглашение выше.' : 'Generate your first invite above.'}</div>
        </div>`;
      return;
    }
    list.innerHTML = invites.map(renderInviteRow).join('');
  } catch (e) {
      list.innerHTML = `<div class="empty-state empty-state--card"><div class="empty-state__title">${t('error_generic')}</div></div>`;
  }
}

function renderInviteRow(invite) {
  const botUsername = CONFIG.botUsername;
  const link = `https://t.me/${botUsername}?start=invite_${invite.code}`;
  const used = !!invite.used_at;
  const usedBy = invite.used_user?.name || invite.used_user?.telegram_handle || '';

  return `
    <div class="invite-card">
      <div class="invite-card__topline">
        <div>
          <div class="invite-card__label">${t('invite_code_label')}</div>
          <div class="invite-card__code">${invite.code}</div>
        </div>
        <span class="status-badge status-badge--${used ? 'approved' : 'pending'}">
          ${used ? t('invite_used') : t('invite_pending_invite')}
        </span>
      </div>
      <div class="invite-card__link">${link}</div>
      <div class="invite-card__status">
        ${used && usedBy ? `<span class="invite-card__used-by">${t('invite_used_by')}: ${usedBy}</span>` : ''}
      </div>
      ${!used ? `
        <div class="invite-card__actions">
          <button class="btn btn-secondary btn-sm" onclick="copyInviteLink('${link}', this)">
            ${t('invite_copy')}
          </button>
          <button class="btn btn-primary btn-sm" onclick="shareInviteLink('${link}')">
            ${t('invite_share')}
          </button>
        </div>` : ''}
    </div>`;
}

// ─── Generate ─────────────────────────────────────────────────────────────────

async function handleGenerateInvite() {
  const btn = document.getElementById('generate-invite-btn');
  if (!btn || btn.disabled) return;

  btn.disabled = true;
  btn.textContent = t('loading');

  try {
    const result = await generateInvite(App.city);
    const botUsername = CONFIG.botUsername;
    const link = `https://t.me/${botUsername}?start=invite_${result.code}`;

    showNewInviteLink(link);
    renderInviteHistory();
    tg?.HapticFeedback?.notificationOccurred('success');
  } catch (e) {
    console.error('Generate invite failed', e);
    tg?.HapticFeedback?.notificationOccurred('error');

    // Show full debug info on device so we can diagnose without DevTools
    const debugStr = e.debug
      ? JSON.stringify(e.debug, null, 2)
      : (e.rawData ? JSON.stringify(e.rawData, null, 2) : e.message);
    tg?.showAlert?.(`ERROR: ${e.message}\n\nDEBUG:\n${debugStr}`);
  } finally {
    btn.disabled = false;
    btn.textContent = t('invite_generate');
  }
}

function showNewInviteLink(link) {
  const el = document.getElementById('new-invite-result');
  if (!el) return;
  el.classList.remove('page--hidden');
  const linkEl = el.querySelector('.new-invite-link');
  if (linkEl) linkEl.textContent = link;
  el.querySelector('.copy-new-invite')?.addEventListener('click', () => copyInviteLink(link, el.querySelector('.copy-new-invite')), { once: true });
  el.querySelector('.share-new-invite')?.addEventListener('click', () => shareInviteLink(link), { once: true });
}

// ─── Copy & Share ─────────────────────────────────────────────────────────────

async function copyInviteLink(link, btn) {
  try {
    await navigator.clipboard.writeText(link);
    const orig = btn.textContent;
    btn.textContent = t('invite_copied');
    tg?.HapticFeedback?.impactOccurred('medium');
    setTimeout(() => { btn.textContent = orig; }, 2000);
  } catch {
    tg?.showAlert?.(link);
  }
}

function shareInviteLink(link) {
  const text = App.lang === 'ru'
    ? 'Я приглашаю тебя в Luma — закрытую сеть проверенных помощников на Ко Пхангане.'
    : 'Join Luma — a private trusted helper network on Koh Phangan.';
  const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`;
  if (tg?.openTelegramLink) {
    tg.openTelegramLink(shareUrl);
  } else {
    window.open(shareUrl, '_blank');
  }
}

// ─── Init ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('generate-invite-btn')?.addEventListener('click', handleGenerateInvite);
});
