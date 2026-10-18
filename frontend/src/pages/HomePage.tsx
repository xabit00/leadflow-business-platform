import React, { useState, useEffect } from 'react';
import { 
  CheckCircle2, 
  Server, 
  Layers, 
  Users, 
  GitBranch, 
  RefreshCw,
  Cpu,
  Database,
  ExternalLink,
  ShieldAlert
} from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import apiClient from '../api/client';
import { HealthResponse } from '../types';

export const HomePage: React.FC = () => {
  const [backendHealth, setBackendHealth] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const checkBackendHealth = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiClient.get<HealthResponse>('/health');
      setBackendHealth(response.data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Backend connection unavailable');
      setBackendHealth(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkBackendHealth();
  }, []);

  return (
    <div className="space-y-8 py-2">
      {/* Hero Announcement */}
      <div className="bg-gradient-to-r from-blue-900/40 via-indigo-900/20 to-slate-900 border border-blue-500/30 rounded-2xl p-6 sm:p-8 relative overflow-hidden">
        <div className="absolute right-0 top-0 -mt-8 -mr-8 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Badge variant="green" size="md">
                <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-emerald-400" />
                Level 0 Initialized
              </Badge>
              <Badge variant="blue" size="md">
                Vite + FastAPI + PostgreSQL
              </Badge>
            </div>
            
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-white">
              LeadFlow — Development Environment Ready
            </h1>
            
            <p className="text-slate-400 text-sm sm:text-base max-w-2xl leading-relaxed">
              The foundational monorepo scaffolding, team branches, API contracts, database specifications, 
              and shared environments are successfully configured. Business feature development commences in Level 1.
            </p>
          </div>

          <div className="flex flex-col gap-2 shrink-0 w-full sm:w-auto">
            <Button
              variant="secondary"
              onClick={checkBackendHealth}
              disabled={loading}
              className="flex items-center gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Verify Backend Health
            </Button>
            <a
              href="http://localhost:8000/docs"
              target="_blank"
              rel="noreferrer"
              className="text-xs text-blue-400 hover:text-blue-300 flex items-center justify-center gap-1 py-1"
            >
              <span>Swagger API Docs</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </div>

      {/* Backend Live Status Card */}
      <Card className="border-slate-800 bg-slate-900/80">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-slate-800 text-blue-400">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">Backend Health Diagnostics</h2>
              <p className="text-xs text-slate-400">Endpoint: <code className="text-slate-300 font-mono">GET /health</code></p>
            </div>
          </div>
          {backendHealth ? (
            <Badge variant="green" size="md">
              <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
              Connected & Healthy
            </Badge>
          ) : error ? (
            <Badge variant="amber" size="md">
              <ShieldAlert className="w-3.5 h-3.5 mr-1" />
              Awaiting Server Start
            </Badge>
          ) : (
            <Badge variant="slate" size="md">
              Checking...
            </Badge>
          )}
        </div>

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800/80">
            <span className="text-[11px] uppercase tracking-wider text-slate-400 block font-medium">Service Name</span>
            <span className="text-sm font-semibold text-slate-200 mt-1 block">
              {backendHealth?.app_name || 'LeadFlow API'}
            </span>
          </div>
          <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800/80">
            <span className="text-[11px] uppercase tracking-wider text-slate-400 block font-medium">Status</span>
            <span className="text-sm font-semibold text-emerald-400 mt-1 block">
              {backendHealth?.status || 'Ready for Uvicorn'}
            </span>
          </div>
          <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800/80">
            <span className="text-[11px] uppercase tracking-wider text-slate-400 block font-medium">Environment</span>
            <span className="text-sm font-semibold text-slate-200 mt-1 block">
              {backendHealth?.environment || 'development'}
            </span>
          </div>
          <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800/80">
            <span className="text-[11px] uppercase tracking-wider text-slate-400 block font-medium">Database Layer</span>
            <span className="text-sm font-semibold text-blue-400 mt-1 block">
              {backendHealth?.database || 'SQLAlchemy Ready'}
            </span>
          </div>
        </div>
      </Card>

      {/* Team Ownership & Scaffolding Breakdown */}
      <div>
        <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Users className="w-5 h-5 text-blue-400" />
          Team Allocation & Feature Branches
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Member 1 */}
          <Card className="hover:border-blue-500/50 transition-colors flex flex-col justify-between">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-blue-400">Member 1</span>
                <Badge variant="blue" size="sm">Frontend Lead</Badge>
              </div>
              <h3 className="text-base font-semibold text-white">React UI & User Experience</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Single-page application layout, responsive CRM screens, lead queues, 
                and real-time operational dashboard interfaces.
              </p>
              <div className="pt-2">
                <span className="text-[11px] text-slate-400 block">Assigned Branch:</span>
                <code className="text-xs text-blue-300 font-mono bg-blue-950/50 border border-blue-900 px-2 py-0.5 rounded block mt-1">
                  feature/frontend
                </code>
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-800/80 text-[11px] text-slate-400">
              Scope: <code className="text-slate-300">frontend/</code>
            </div>
          </Card>

          {/* Member 2 */}
          <Card className="hover:border-emerald-500/50 transition-colors flex flex-col justify-between">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400">Member 2</span>
                <Badge variant="green" size="sm">Core Backend</Badge>
              </div>
              <h3 className="text-base font-semibold text-white">Data Engine & CRM Logic</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Multi-tenant workspace isolation, database models & migrations, RBAC auth, 
                and algorithmic lead assignment & escalation.
              </p>
              <div className="pt-2">
                <span className="text-[11px] text-slate-400 block">Assigned Branch:</span>
                <code className="text-xs text-emerald-300 font-mono bg-emerald-950/50 border border-emerald-900 px-2 py-0.5 rounded block mt-1">
                  feature/core-backend
                </code>
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-800/80 text-[11px] text-slate-400">
              Scope: <code className="text-slate-300">backend/app/core, database, models, schemas</code>
            </div>
          </Card>

          {/* Member 3 */}
          <Card className="hover:border-purple-500/50 transition-colors flex flex-col justify-between">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-purple-400">Member 3</span>
                <Badge variant="slate" size="sm">Integrations</Badge>
              </div>
              <h3 className="text-base font-semibold text-white">External Cloud Adapters</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Twilio WhatsApp/SMS webhooks, Stripe test payments, Google Calendar OAuth 2.0 booking, 
                Telegram alerts, and immutable audit logs.
              </p>
              <div className="pt-2">
                <span className="text-[11px] text-slate-400 block">Assigned Branch:</span>
                <code className="text-xs text-purple-300 font-mono bg-purple-950/50 border border-purple-900 px-2 py-0.5 rounded block mt-1">
                  feature/integrations
                </code>
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-800/80 text-[11px] text-slate-400">
              Scope: <code className="text-slate-300">backend/app/integrations/</code>
            </div>
          </Card>
        </div>
      </div>

      {/* Quick Architecture Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4 bg-slate-900/50">
          <div className="flex items-center gap-2.5 text-blue-400 mb-2">
            <Cpu className="w-4 h-4" />
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-300">FastAPI Backend</h4>
          </div>
          <p className="text-xs text-slate-400">
            Lightweight, asynchronous Python API with non-blocking health checks and modular router registration.
          </p>
        </Card>

        <Card className="p-4 bg-slate-900/50">
          <div className="flex items-center gap-2.5 text-emerald-400 mb-2">
            <Database className="w-4 h-4" />
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-300">PostgreSQL + Alembic</h4>
          </div>
          <p className="text-xs text-slate-400">
            Multi-tenant schema with workspace partitioning, UUID primary keys, and versioned migrations.
          </p>
        </Card>

        <Card className="p-4 bg-slate-900/50">
          <div className="flex items-center gap-2.5 text-amber-400 mb-2">
            <GitBranch className="w-4 h-4" />
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-300">Branching Protocol</h4>
          </div>
          <p className="text-xs text-slate-400">
            Main branch protected. All feature commits scoped strictly to isolated feature branches.
          </p>
        </Card>

        <Card className="p-4 bg-slate-900/50">
          <div className="flex items-center gap-2.5 text-indigo-400 mb-2">
            <Layers className="w-4 h-4" />
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-300">Contract First</h4>
          </div>
          <p className="text-xs text-slate-400">
            API contracts and 20 core entity specifications documented in <code className="text-slate-300">docs/</code>.
          </p>
        </Card>
      </div>
    </div>
  );
};
