const CITIES = {
  phangan: {
    name: 'Koh Phangan',
    nameRu: 'Ко Пханган',
    is_private: true,
    legal_locale: 'th',
    currency: 'THB',
    flag: '🇹🇭',
  },
  samui: {
    name: 'Koh Samui',
    nameRu: 'Ко Самуи',
    is_private: false,
    legal_locale: 'th',
    currency: 'THB',
    flag: '🇹🇭',
  },
  phuket: {
    name: 'Phuket',
    nameRu: 'Пхукет',
    is_private: false,
    legal_locale: 'th',
    currency: 'THB',
    flag: '🇹🇭',
  },
  danang: {
    name: 'Da Nang',
    nameRu: 'Да Нанг',
    is_private: false,
    legal_locale: 'vn',
    currency: 'VND',
    flag: '🇻🇳',
  },
  bali: {
    name: 'Bali',
    nameRu: 'Бали',
    is_private: false,
    legal_locale: 'id',
    currency: 'IDR',
    flag: '🇮🇩',
  },
};

function getCity(key) {
  return CITIES[key] || CITIES[CONFIG.defaultCity];
}

function getCityList() {
  return Object.entries(CITIES).map(([key, val]) => ({ key, ...val }));
}
