import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://gjrujyfhttnacjcljsje.supabase.co';
const SUPABASE_KEY = 'sb_publishable_lJeZ8nCl0L-FGTyWbWzAYw_cOv-02Zb';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export const REDIRECT_URL = 'https://olover-studio.vercel.app';
