import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://gjrujyfhttnacjcljsje.supabase.co';
const SUPABASE_KEY = 'sb_publishable_lJeZ8nCl0L-FGTyWbWzAYw_cOv-02Zb';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    redirectTo: 'https://olover-studio.vercel.app',
  }
});
