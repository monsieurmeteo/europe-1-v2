
import { createClient } from '@supabase/supabase-js';

// Instructions:
// 1. Create a project at https://supabase.com
// 2. Get your URL and ANON KEY
// 3. Create a user with email: mairie@douai.fr and password: Meteoclimatpro
// 4. Fill in the variables below or use .env

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://ubdevaemtwbzxksjlhjg.supabase.co';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_1qhA0xAnNSd3VxpoLdxYrQ_yUemEhaP';

// Prevent crash if URL is missing (Demo mode)
let client;

if (SUPABASE_URL && SUPABASE_URL.startsWith('http')) {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} else {
    // Mock client for demo/unconfigured state
    console.warn("Supabase not configured. Using mock client.");
    client = {
        auth: {
            getSession: async () => ({ data: { session: null }, error: null }),
            onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => { } } } }),
            signInWithPassword: async () => ({ error: { message: "Supabase non configuré (Mode Démo uniquement)" } }),
            signOut: async () => ({ error: null })
        }
    };
}

export const supabase = client;
