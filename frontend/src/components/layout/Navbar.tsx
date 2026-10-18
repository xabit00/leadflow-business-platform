import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Layers, Activity, GitBranch } from 'lucide-react';
import { Badge } from '../ui/Badge';

export const Navbar: React.FC = () => {
  const location = useLocation();

  const navLinks = [
    { name: 'Environment Overview', path: '/' },
    { name: 'CRM (Stage 1)', path: '#', placeholder: true },
    { name: 'Lead Routing (Stage 2)', path: '#', placeholder: true },
    { name: 'Integrations', path: '#', placeholder: true },
  ];

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-800 bg-slate-950/80 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link to="/" className="flex items-center gap-2.5 group">
            <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold shadow-md shadow-blue-500/20 group-hover:bg-blue-500 transition-colors">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <span className="font-semibold text-lg tracking-tight text-white">LeadFlow</span>
              <span className="hidden sm:inline-block text-xs text-slate-400 ml-2 font-mono">Platform</span>
            </div>
          </Link>

          <nav className="hidden md:flex items-center space-x-1">
            {navLinks.map((link) => (
              <span key={link.name} className="relative">
                {link.placeholder ? (
                  <span
                    className="px-3 py-1.5 text-xs text-slate-500 cursor-not-allowed flex items-center gap-1.5"
                    title="Feature planned for upcoming milestones"
                  >
                    {link.name}
                    <span className="text-[10px] bg-slate-900 border border-slate-800 px-1.5 py-0.2 rounded text-slate-500">
                      Draft
                    </span>
                  </span>
                ) : (
                  <Link
                    to={link.path}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                      location.pathname === link.path
                        ? 'bg-slate-800 text-blue-400'
                        : 'text-slate-300 hover:text-white hover:bg-slate-900'
                    }`}
                  >
                    {link.name}
                  </Link>
                )}
              </span>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <Badge variant="blue" size="sm">
            <GitBranch className="w-3 h-3 mr-1" />
            Level 0 Scaffolding
          </Badge>
          <div className="flex items-center gap-1.5 text-xs text-slate-400 bg-slate-900 border border-slate-800 px-2.5 py-1 rounded-md">
            <Activity className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
            <span className="font-mono">Vite: 5173</span>
          </div>
        </div>
      </div>
    </header>
  );
};
