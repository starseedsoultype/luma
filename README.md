# Luma — Setup Guide

## 1. Supabase

1. Create a new project at supabase.com (East US / North Virginia)
2. Run the migration: **SQL Editor → paste contents of** `supabase/migrations/001_initial_schema.sql` → Run
3. Create storage bucket: **Storage → New bucket** → name: `luma-media` → Public: ON
4. Copy **Project URL** and **anon public key** from Project Settings → API

## 2. Telegram Bot

1. Message @BotFather → `/newbot`
2. Name: `Luma` / Username: `LumaHelperBot` (or any available)
3. Copy the token
4. Enable Mini App: `/newapp` → select your bot → set URL: `https://starseedsoultype.github.io/luma/`
5. Set commands via `/setcommands`:
```
start - Open Luma
```

## 3. Config

Edit `js/config.js`:
```js
supabaseUrl: 'https://xxxx.supabase.co',
supabaseAnonKey: 'your-anon-key',
botUsername: 'LumaHelperBot',
```

## 4. Edge Functions

```bash
npm install -g supabase
supabase login
supabase link --project-ref YOUR_PROJECT_REF

# Set secrets
supabase secrets set TELEGRAM_BOT_TOKEN=your-token
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Deploy all functions
supabase functions deploy validate-telegram
supabase functions deploy generate-invite
supabase functions deploy validate-invite
supabase functions deploy approve-helper
supabase functions deploy reject-helper
supabase functions deploy admin-override
supabase functions deploy feature-helper
supabase functions deploy ban-user
supabase functions deploy check-featured-expiry
```

## 5. Cron (featured expiry)

In Supabase Dashboard → Edge Functions → `check-featured-expiry` → Schedule:
- Cron: `0 * * * *` (every hour)

## 6. Set yourself as admin

After first launch, in SQL Editor:
```sql
UPDATE users SET role = 'admin' WHERE telegram_id = YOUR_TELEGRAM_ID;
```

## 7. Deploy to GitHub Pages

```bash
cd /Users/alexap/Desktop/Luma
git add .
git commit -m "update"
git push
```

GitHub Pages auto-deploys from `main` branch root.

## App URL
`https://starseedsoultype.github.io/luma/`
