const CONFIG = {
  supabaseUrl: 'YOUR_SUPABASE_URL',
  supabaseAnonKey: 'YOUR_SUPABASE_ANON_KEY',
  botUsername: 'YOUR_BOT_USERNAME',
  appUrl: 'YOUR_GITHUB_PAGES_URL',
  defaultCity: 'phangan',
  defaultLanguage: 'en',
  approvalThresholds: [
    { maxTC: 3, required: 1 },
    { maxTC: 6, required: 2 },
    { maxTC: Infinity, required: 3 },
  ],
};
