const TRANSLATIONS = {
  en: {
    // Nav
    nav_home: 'Home',
    nav_favorites: 'Saved',
    nav_invite: 'Invite',
    nav_profile: 'Profile',
    header_subtitle: 'Trusted help nearby',

    // Categories
    cat_all: 'All',
    cat_cleaner: 'Cleaner',
    cat_nanny: 'Nanny',
    cat_assistant: 'Assistant',
    cat_handyman: 'Handyman',
    cat_chef: 'Chef',
    cat_driver: 'Driver',

    // Filters
    filter_language: 'Language',
    filter_area: 'Area',
    filter_price: 'Price',
    filter_availability: 'Available Now',

    // Helper card
    card_message: 'Message in Telegram',
    card_save: 'Save',
    card_saved: 'Saved',
    card_price_from: 'from',
    card_per_hour: '/ hr',
    card_per_visit: '/ visit',
    card_per_day: '/ day',
    card_per_project: '/ project',

    // Badges
    badge_verified: 'Verified by Circle',
    badge_family: 'Family Friendly',
    badge_villas: 'Trusted for Villas',
    badge_english: 'English Speaking',
    badge_fast: 'Fast Replies',
    badge_recommended: 'Recommended',

    // Apply form
    apply_title: 'Become a Helper',
    apply_name: 'Display Name',
    apply_category: 'Service Category',
    apply_bio: 'About You',
    apply_bio_placeholder: 'Briefly describe your experience and what makes you the right person...',
    apply_languages: 'Languages You Speak',
    apply_area: 'Area / Neighborhood',
    apply_city: 'City',
    apply_price_from: 'Starting Price',
    apply_price_unit: 'Per',
    apply_telegram: 'Telegram Username',
    apply_telegram_placeholder: '@yourusername',
    apply_photo: 'Your Photo',
    apply_photo_upload: 'Upload Photo',
    apply_legal: 'I confirm that I am legally entitled to provide services in my current location and take full personal responsibility for all arrangements made through this directory.',
    apply_submit: 'Submit Application',
    apply_success_title: 'Application Submitted',
    apply_success_text: 'Your application is under review. We\'ll notify you via Telegram once a decision is made.',
    apply_error: 'Something went wrong. Please try again.',

    // Invite
    invite_title: 'Invite a Friend',
    invite_subtitle: 'Share access to Luma with someone you trust.',
    invite_generate: 'Generate invite link',
    invite_copy: 'Copy',
    invite_copied: 'Copied!',
    invite_share: 'Share via Telegram',
    invite_history: 'My Invites',
    invite_used: 'Used',
    invite_pending_invite: 'Pending',
    invite_used_by: 'Used by',
    invite_code_label: 'Invite code',
    invite_link_created: 'Invite link ready',

    // Invite gate
    gate_title: 'Private Network',
    gate_text: 'Luma is a trusted helper network. You need an invite from a member to access.',
    gate_cta: 'Ask a member to invite you',

    // Favorites
    favorites_title: 'Saved',
    favorites_empty: 'No saved helpers yet',
    favorites_empty_text: 'Tap the bookmark on any helper card to save it here.',

    // Profile
    profile_title: 'Profile',
    profile_city: 'City',
    profile_language: 'Language',
    profile_my_application: 'My Helper Profile',
    profile_status_pending: 'Under Review',
    profile_status_approved: 'Active',
    profile_status_rejected: 'Not Approved',
    profile_status_hidden: 'Hidden',
    profile_edit: 'Edit Profile',
    profile_helper_cta_title: 'Become a trusted helper',
    profile_helper_cta_text: 'Offer your services to people in the Luma circle.',

    // Admin
    admin_title: 'Admin Panel',
    admin_applications: 'Applications',
    admin_helpers: 'Helpers',
    admin_users: 'Users',
    admin_stats: 'Statistics',
    admin_cities: 'Cities',
    admin_approve: 'Approve',
    admin_reject: 'Reject',
    admin_hide: 'Hide',
    admin_feature: 'Feature',
    admin_override: 'Override',
    admin_ban: 'Ban User',
    admin_unban: 'Unban',
    admin_assign_tc: 'Make Trusted Circle',
    admin_remove_tc: 'Remove from TC',
    admin_comment_placeholder: 'Admin comment (optional)...',
    admin_feature_days: 'Feature for days',
    admin_confirm_approve: 'Approve this application?',
    admin_confirm_reject: 'Reject this application?',
    admin_confirm_ban: 'Ban this user?',

    // Trusted Circle
    circle_title: 'Trusted Circle',
    circle_pending: 'Pending Review',
    circle_my_votes: 'My Votes',
    circle_approve: 'Approve',
    circle_reject: 'Reject',
    circle_skip: 'Skip',
    circle_comment_placeholder: 'Note for Admin (optional)...',
    circle_votes_needed: 'votes needed',
    circle_approved_count: 'approved',
    circle_empty: 'No applications to review right now.',

    // Status labels
    status_pending: 'Pending',
    status_approved: 'Approved',
    status_rejected: 'Rejected',
    status_hidden: 'Hidden',
    status_active: 'Active',
    status_banned: 'Banned',

    // Legal
    legal_title: 'Privacy & Terms',
    legal_privacy_title: 'Privacy Notice',
    legal_privacy_text: 'Luma is a private, invite-only directory of local helpers. We collect minimal information needed to operate the platform: your Telegram username, display name, and profile photo. This data is visible only to approved members of the network. We do not sell, share, or transfer your data to third parties. You may request deletion of your account and data at any time by contacting the administrator.',
    legal_terms_title: 'Terms of Use',
    legal_terms_text: 'Luma is a private curated directory — not a marketplace, not an employment platform. The platform does not verify legal employment status, does not process payments, and does not guarantee the quality of services. All arrangements between clients and helpers are made independently via Telegram. By using Luma, you agree to take personal responsibility for any agreements you make. Helpers confirm their personal legal responsibility when submitting their application. Luma reserves the right to remove any profile or user at any time.',
    legal_contact: 'Questions? Contact the administrator via Telegram.',

    // Edit profile
    edit_profile_title: 'Edit Profile',
    edit_profile_save: 'Save Changes',
    edit_profile_saving: 'Saving...',
    edit_profile_saved: 'Profile updated',
    edit_profile_error: 'Could not save. Try again.',
    edit_profile_no_profile: 'No helper profile found.',

    // Delete account
    profile_delete_title: 'Delete my account',
    profile_delete_text: 'This will permanently delete your account and all data — profile, applications, invite history. This cannot be undone.',
    profile_delete_confirm: 'Yes, delete permanently',
    profile_delete_cancel: 'Cancel',
    profile_delete_loading: 'Deleting...',
    profile_delete_done: 'Account deleted.',

    // Search
    search_placeholder: 'Search by name, area...',
    search_no_results: 'No helpers in this category yet',
    search_no_results_text: 'Try another filter or check back later.',
    search_show_all: 'Show all helpers',

    // Loading / errors
    loading: 'Loading...',
    error_generic: 'Something went wrong.',
    error_not_authorized: 'Access denied.',
    error_invite_invalid: 'This invite link is invalid or has already been used.',
    error_invite_used: 'This invite has already been used.',
  },

  ru: {
    // Nav
    nav_home: 'Главная',
    nav_favorites: 'Сохранённые',
    nav_invite: 'Пригласить',
    nav_profile: 'Профиль',
    header_subtitle: 'Проверенная помощь рядом',

    // Categories
    cat_all: 'Все',
    cat_cleaner: 'Клинер',
    cat_nanny: 'Няня',
    cat_assistant: 'Ассистент',
    cat_handyman: 'Хендимен',
    cat_chef: 'Шеф',
    cat_driver: 'Водитель',

    // Filters
    filter_language: 'Язык',
    filter_area: 'Район',
    filter_price: 'Цена',
    filter_availability: 'Доступен сейчас',

    // Helper card
    card_message: 'Написать в Telegram',
    card_save: 'Сохранить',
    card_saved: 'Сохранено',
    card_price_from: 'от',
    card_per_hour: '/ час',
    card_per_visit: '/ визит',
    card_per_day: '/ день',
    card_per_project: '/ проект',

    // Badges
    badge_verified: 'Проверен кругом',
    badge_family: 'Для семей',
    badge_villas: 'Для вилл',
    badge_english: 'Английский',
    badge_fast: 'Быстро отвечает',
    badge_recommended: 'Рекомендован',

    // Apply form
    apply_title: 'Стать помощником',
    apply_name: 'Имя',
    apply_category: 'Категория услуг',
    apply_bio: 'О себе',
    apply_bio_placeholder: 'Кратко об опыте и почему вам можно доверять...',
    apply_languages: 'Языки',
    apply_area: 'Район',
    apply_city: 'Город',
    apply_price_from: 'Цена от',
    apply_price_unit: 'За',
    apply_telegram: 'Telegram username',
    apply_telegram_placeholder: '@yourusername',
    apply_photo: 'Ваше фото',
    apply_photo_upload: 'Загрузить фото',
    apply_legal: 'Я подтверждаю, что имею законное право предоставлять услуги в текущем местонахождении и несу личную ответственность за все договорённости, заключённые через этот каталог.',
    apply_submit: 'Отправить заявку',
    apply_success_title: 'Заявка отправлена',
    apply_success_text: 'Ваша заявка на рассмотрении. Мы уведомим вас в Telegram как только будет принято решение.',
    apply_error: 'Что-то пошло не так. Попробуйте снова.',

    // Invite
    invite_title: 'Пригласить',
    invite_subtitle: 'Дайте доступ к Luma человеку, которому доверяете.',
    invite_generate: 'Создать приглашение',
    invite_copy: 'Скопировать',
    invite_copied: 'Скопировано!',
    invite_share: 'Поделиться в Telegram',
    invite_history: 'Мои приглашения',
    invite_used: 'Использовано',
    invite_pending_invite: 'Ожидает',
    invite_used_by: 'Использовал',
    invite_code_label: 'Код приглашения',
    invite_link_created: 'Ссылка готова',

    // Invite gate
    gate_title: 'Закрытая сеть',
    gate_text: 'Luma — закрытая сеть проверенных помощников. Для входа нужно приглашение от участника.',
    gate_cta: 'Попросите участника вас пригласить',

    // Favorites
    favorites_title: 'Сохранённые',
    favorites_empty: 'Пока нет сохранённых помощников',
    favorites_empty_text: 'Нажмите закладку на карточке помощника, чтобы сохранить его здесь.',

    // Profile
    profile_title: 'Профиль',
    profile_city: 'Город',
    profile_language: 'Язык',
    profile_my_application: 'Мой профиль помощника',
    profile_status_pending: 'На проверке',
    profile_status_approved: 'Активен',
    profile_status_rejected: 'Не одобрен',
    profile_status_hidden: 'Скрыт',
    profile_edit: 'Редактировать',
    profile_helper_cta_title: 'Стать проверенным помощником',
    profile_helper_cta_text: 'Предложите свои услуги людям из круга Luma.',

    // Admin
    admin_title: 'Панель администратора',
    admin_applications: 'Заявки',
    admin_helpers: 'Помощники',
    admin_users: 'Пользователи',
    admin_stats: 'Статистика',
    admin_cities: 'Города',
    admin_approve: 'Одобрить',
    admin_reject: 'Отклонить',
    admin_hide: 'Скрыть',
    admin_feature: 'Продвинуть',
    admin_override: 'Форсировать',
    admin_ban: 'Заблокировать',
    admin_unban: 'Разблокировать',
    admin_assign_tc: 'Добавить в TC',
    admin_remove_tc: 'Убрать из TC',
    admin_comment_placeholder: 'Комментарий администратора (необязательно)...',
    admin_feature_days: 'Продвинуть на дней',
    admin_confirm_approve: 'Одобрить эту заявку?',
    admin_confirm_reject: 'Отклонить эту заявку?',
    admin_confirm_ban: 'Заблокировать пользователя?',

    // Trusted Circle
    circle_title: 'Trusted Circle',
    circle_pending: 'На проверке',
    circle_my_votes: 'Мои голоса',
    circle_approve: 'Одобрить',
    circle_reject: 'Отклонить',
    circle_skip: 'Пропустить',
    circle_comment_placeholder: 'Заметка для Admin (необязательно)...',
    circle_votes_needed: 'голосов нужно',
    circle_approved_count: 'одобрено',
    circle_empty: 'Заявок на проверку пока нет.',

    // Status labels
    status_pending: 'Ожидает',
    status_approved: 'Одобрен',
    status_rejected: 'Отклонён',
    status_hidden: 'Скрыт',
    status_active: 'Активен',
    status_banned: 'Заблокирован',

    // Legal
    legal_title: 'Конфиденциальность и условия',
    legal_privacy_title: 'Уведомление о конфиденциальности',
    legal_privacy_text: 'Luma — закрытый каталог местных помощников только по приглашению. Мы собираем минимальный набор данных для работы платформы: ваш Telegram username, имя и фото профиля. Эти данные видны только одобренным участникам сети. Мы не продаём, не передаём и не раскрываем ваши данные третьим лицам. Вы можете запросить удаление аккаунта и данных в любое время, связавшись с администратором.',
    legal_terms_title: 'Условия использования',
    legal_terms_text: 'Luma — это частный кураторский каталог, а не маркетплейс и не платформа трудоустройства. Платформа не проверяет юридический статус, не принимает платежи и не гарантирует качество услуг. Все договорённости между клиентами и помощниками заключаются самостоятельно через Telegram. Используя Luma, вы соглашаетесь нести личную ответственность за любые договорённости. Помощники подтверждают личную юридическую ответственность при подаче заявки. Luma оставляет за собой право удалить любой профиль или пользователя в любое время.',
    legal_contact: 'Вопросы? Напишите администратору в Telegram.',

    // Edit profile
    edit_profile_title: 'Редактировать профиль',
    edit_profile_save: 'Сохранить',
    edit_profile_saving: 'Сохранение...',
    edit_profile_saved: 'Профиль обновлён',
    edit_profile_error: 'Не удалось сохранить. Попробуйте снова.',
    edit_profile_no_profile: 'Профиль помощника не найден.',

    // Delete account
    profile_delete_title: 'Удалить аккаунт',
    profile_delete_text: 'Аккаунт и все данные — профиль, заявки, история приглашений — будут удалены безвозвратно.',
    profile_delete_confirm: 'Да, удалить навсегда',
    profile_delete_cancel: 'Отмена',
    profile_delete_loading: 'Удаление...',
    profile_delete_done: 'Аккаунт удалён.',

    // Search
    search_placeholder: 'Поиск по имени, району...',
    search_no_results: 'В этой категории пока нет помощников',
    search_no_results_text: 'Попробуйте другой фильтр или загляните позже.',
    search_show_all: 'Показать всех',

    // Loading / errors
    loading: 'Загрузка...',
    error_generic: 'Что-то пошло не так.',
    error_not_authorized: 'Доступ запрещён.',
    error_invite_invalid: 'Ссылка недействительна или уже была использована.',
    error_invite_used: 'Это приглашение уже использовано.',
  },
};

let currentLang = 'en';

function setLang(lang) {
  currentLang = TRANSLATIONS[lang] ? lang : 'en';
  document.documentElement.lang = currentLang;
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (TRANSLATIONS[currentLang][key]) el.textContent = TRANSLATIONS[currentLang][key];
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    if (TRANSLATIONS[currentLang][key]) el.placeholder = TRANSLATIONS[currentLang][key];
  });
}

function t(key) {
  return TRANSLATIONS[currentLang]?.[key] || TRANSLATIONS['en']?.[key] || key;
}
