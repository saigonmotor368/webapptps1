import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://yntgxollwjemyidizhnn.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_BhQX_aNaD5wzocEp7MXD_Q_DA4kOAZn';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
