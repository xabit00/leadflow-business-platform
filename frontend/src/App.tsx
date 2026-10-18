import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import queryClient from './api/queryClient';
import { ToastProvider } from './contexts/ToastContext';
import { AuthProvider } from './contexts/AuthContext';
import { AppRoutes } from './routes';
import { isMockMode, isSupabaseConfigured } from './lib/supabase';

export const App: React.FC = () => {
  if (!isSupabaseConfigured && !isMockMode) {
    return (
      <main className='min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6'>
        <section className='w-full max-w-lg rounded-2xl border border-amber-500/30 bg-slate-900 p-6 sm:p-8 shadow-2xl' role='alert'>
          <p className='text-xs font-semibold uppercase tracking-widest text-amber-400'>Configuration required</p>
          <h1 className='mt-2 text-2xl font-bold text-white'>Connect LeadFlow to Supabase</h1>
          <p className='mt-3 text-sm leading-relaxed text-slate-300'>
            Add your public project URL and anon key to <code className='rounded bg-slate-950 px-1.5 py-0.5 text-blue-300'>frontend/.env</code>, then restart the development server.
          </p>
          <pre className='mt-5 overflow-x-auto rounded-xl border border-slate-800 bg-slate-950 p-4 text-xs leading-6 text-slate-300'>VITE_SUPABASE_URL=https://your-project.supabase.co{`\n`}VITE_SUPABASE_ANON_KEY=your-anon-key</pre>
        </section>
      </main>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ToastProvider>
          <AuthProvider>
            <AppRoutes />
          </AuthProvider>
        </ToastProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
};

export default App;
