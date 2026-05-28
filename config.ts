declare global {
  interface Window {
    __APP_CONFIG__?: {
      VITE_SUPABASE_URL?: string;
      VITE_SUPABASE_ANON_KEY?: string;
      GEMINI_API_KEY?: string;
    };
  }
}

const runtimeConfig = typeof window !== 'undefined' ? window.__APP_CONFIG__ : undefined;

export const appConfig = {
  supabaseUrl: runtimeConfig?.VITE_SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL || '',
  supabaseAnonKey: runtimeConfig?.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || '',
  geminiApiKey: runtimeConfig?.GEMINI_API_KEY || process.env.API_KEY || process.env.GEMINI_API_KEY || ''
};

export const missingRequiredConfig = [
  ['VITE_SUPABASE_URL', appConfig.supabaseUrl],
  ['VITE_SUPABASE_ANON_KEY', appConfig.supabaseAnonKey]
]
  .filter(([, value]) => !value)
  .map(([name]) => name);
