import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Layers, ArrowRight, Loader2, Sparkles, AlertCircle } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import { normalizeError } from '../../api/errors';
import { DEMO_EMAIL, DEMO_PASSWORD } from '../../api/mockAuth';

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { signIn } = useAuth();
  const toast = useToast();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Where to navigate after login
  const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await signIn(email, password);
      toast.success('Welcome back to LeadFlow.', 'Logged In');
      navigate(from, { replace: true });
    } catch (err) {
      const msg = normalizeError(err, 'Authentication failed. Please verify your email and password.').message;
      setError(msg);
      toast.error(msg, 'Login Failed');
    } finally {
      setLoading(false);
    }
  };

  const fillDemoCredentials = () => {
    setEmail(DEMO_EMAIL);
    setPassword(DEMO_PASSWORD);
    setError(null);
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center p-4 selection:bg-blue-600 selection:text-white">
      <div className="w-full max-w-md">
        {/* Brand header */}
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-2.5 group mb-4">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white font-bold shadow-lg shadow-blue-500/25 group-hover:bg-blue-500 transition-colors">
              <Layers className="w-6 h-6" />
            </div>
            <span className="text-2xl font-bold tracking-tight text-white">LeadFlow</span>
          </Link>
          <h1 className="text-xl font-bold text-white tracking-tight">Sign in to your workspace</h1>
          <p className="text-xs text-slate-400 mt-1">Unified Business & Accountable Lead Management</p>
        </div>

        {/* Login Card */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-xl backdrop-blur-sm">
          {error && (
            <div className="mb-5 p-3.5 rounded-lg bg-red-500/10 border border-red-500/30 flex items-start gap-3">
              <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
              <div className="text-xs text-red-300 leading-relaxed">{error}</div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Work Email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
            />

            <Input
              label="Password"
              type="password"
              required
              autoComplete="current-password"
              placeholder="••••••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
            />

            <Button
              type="submit"
              variant="primary"
              size="md"
              disabled={loading || !email || !password}
              className="w-full mt-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Authenticating...
                </>
              ) : (
                <>
                  Sign In to Workspace
                  <ArrowRight className="w-4 h-4 ml-1.5" />
                </>
              )}
            </Button>
          </form>

          {/* Quick Demo Fill for Judges */}
          <div className="mt-6 pt-5 border-t border-slate-800/80">
            <button
              type="button"
              onClick={fillDemoCredentials}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-blue-950/40 hover:bg-blue-900/40 border border-blue-800/50 rounded-lg text-xs font-medium text-blue-300 transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5 text-blue-400" />
              Use Prebuilt Owner Credentials
            </button>
          </div>
        </div>

        {/* Link to Signup */}
        <p className="text-center text-xs text-slate-400 mt-6">
          Setting up a new company?{' '}
          <Link to="/signup" className="font-medium text-blue-400 hover:text-blue-300 transition-colors">
            Create a company workspace
          </Link>
        </p>
      </div>
    </div>
  );
};
