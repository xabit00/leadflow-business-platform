import React from 'react';

export const Footer: React.FC = () => {
  return (
    <footer className="border-t border-slate-800 bg-slate-950 py-6 text-xs text-slate-500">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <span>LeadFlow — Unified Business Management Platform</span>
          <span className="mx-2">•</span>
          <span>Multi-Tenant Architecture</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-slate-400">Team Branches:</span>
          <code className="text-blue-400">feature/frontend</code>
          <code className="text-emerald-400">feature/core-backend</code>
          <code className="text-purple-400">feature/integrations</code>
        </div>
      </div>
    </footer>
  );
};
