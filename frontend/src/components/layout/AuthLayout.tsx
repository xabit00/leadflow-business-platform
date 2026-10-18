import React, { useState } from 'react';
import { Link } from 'react-router-dom';

interface AuthLayoutProps {
  children: React.ReactNode;
}

export const AuthLayout: React.FC<AuthLayoutProps> = ({ children }) => {
  const [imageLoaded, setImageLoaded] = useState(false);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 selection:bg-blue-600 selection:text-white flex flex-col lg:flex-row">
      {/* Image panel — shown on lg+ only */}
      <div className="hidden lg:block lg:w-1/2 lg:h-screen relative bg-slate-900 overflow-hidden">
        {/* Dark overlay for WCAG AA contrast on tagline text */}
        <div className="absolute inset-0 bg-black/40" />
        <img
          src="/auth-hero.svg"
          alt="Leads flowing from multiple sources into a single owner"
          width={1000}
          height={700}
          className={`w-full h-full object-contain transition-opacity duration-500 ease-out ${
            imageLoaded ? 'opacity-100' : 'opacity-0'
          }`}
          onLoad={() => setImageLoaded(true)}
          loading="eager"
          decoding="async"
        />
        {/* LeadFlow logo, top-left */}
        <div className="absolute top-6 left-6 z-10">
          <Link to="/" className="inline-flex items-center gap-2">
            <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <span className="font-bold text-xl text-white tracking-tight">LeadFlow</span>
          </Link>
        </div>
        {/* Tagline, bottom-left */}
        <div className="absolute bottom-8 left-8 z-10 max-w-[380px] text-white">
          <h2 className="font-bold text-2xl leading-tight tracking-tight">Every lead gets an owner.</h2>
          <p className="mt-3 text-sm text-slate-300 leading-relaxed">
            LeadFlow assigns, tracks and escalates every inquiry so none slip away.
          </p>
        </div>
      </div>

      {/* Form panel */}
      <div className="flex min-h-screen flex-col items-center justify-center p-6 lg:h-screen lg:w-1/2 lg:px-12 lg:py-0">
        {/* Mobile: logo + tagline above form */}
        <div className="lg:hidden text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-2 mb-4">
            <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <span className="font-bold text-lg text-white tracking-tight">LeadFlow</span>
          </Link>
          <h2 className="font-bold text-xl text-white tracking-tight">Every lead gets an owner.</h2>
          <p className="mt-2 text-sm text-slate-400">
            LeadFlow assigns, tracks and escalates every inquiry so none slip away.
          </p>
        </div>

        {/* Form card with fade-in + rise entry */}
        <div className="w-full max-w-[420px] fade-in-up">
          {children}
        </div>
      </div>
    </div>
  );
};