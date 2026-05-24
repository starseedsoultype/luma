import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

serve(async (_req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const { data: expired } = await supabase
    .from('luma_helper_profiles')
    .select('id, user_id, users(telegram_id)')
    .eq('is_featured', true)
    .lt('featured_until', new Date().toISOString());

  if (expired?.length) {
    const ids = expired.map(h => h.id);
    await supabase.from('luma_helper_profiles').update({
      is_featured: false,
      featured_until: null,
    }).in('id', ids);

    const token = Deno.env.get('LUMA_BOT_TOKEN');
    if (token) {
      for (const h of expired) {
        const tgId = (h as any).users?.telegram_id;
        if (tgId) {
          await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: tgId,
              text: 'Your featured placement in Luma has expired. Contact admin to renew.',
            }),
          });
        }
      }
    }
  }

  return new Response(JSON.stringify({ expired: expired?.length || 0 }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
