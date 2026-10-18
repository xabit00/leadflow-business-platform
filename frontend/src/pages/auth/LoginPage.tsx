import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { ArrowRight, Loader2, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import { normalizeError } from '../../api/errors';
import { DEMO_EMAIL, DEMO_PASSWORD } from '../../api/mockAuth';
import { AuthLayout } from '../../components/layout/AuthLayout';

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { signIn } = useAuth();
  const toast = useToast();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await signIn(email, password);
      toast.success('Welcome back to LeadFlow.');
      navigate(from, { replace: true });
    } catch (err) {
      const msg = normalizeError(err, 'Authentication failed. Please verify your email and password.').message;
      setError(msg);
      toast.error(msg);
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
    <AuthLayout>
      <form onSubmit={handleSubmit} className="space-y-5 fade-in-up">
        <div className="text-center">
          <h2 className="font-bold text-2xl text-white tracking-tight">Sign in to your workspace</h2>
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 flex items-start gap-3" role="alert" aria-live="polite">
            <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
            <p className="text-sm text-red-300 leading-relaxed">{error}</p>
          </div>
        )}

        <div style={{ animationDelay: '60ms' }} className="fade-in">
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
        </div>

        <div className="relative fade-in" style={{ animationDelay: '120ms' }}>
          <Input
            label="Password"
            type={showPassword ? 'text' : 'password'}
            required
            autoComplete="current-password"
            placeholder="••••••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            className="absolute right-2.5 top-14 h-8 w-8 items-center justify-center text-slate-500 hover:text-slate-300 hover:bg-slate-800 rounded transition-colors duration-150 disabled:opacity-50 disabled:pointer-events-none"
            disabled={loading}
          >
            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>

        <Button
          type="submit"
          variant="primary"
          size="md"
          disabled={loading || !email || !password}
          className="w-full mt-1 active:scale-95 transition-transform duration-150"
          style={{ animationDelay: '180ms' }}
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

        <div className="mt-6 pt-4 border-t border-slate-800/80 fade-in" style={{ animationDelay: '240ms' }}>
          <button
            type="button"
            onClick={fillDemoCredentials}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-blue-300 bg-blue-950/40 hover:bg-blue-900/40 border border-blue-800/50 rounded-lg transition-colors duration-150"
            disabled={loading}
          >
            Use Prebuilt Owner Credentials
          </button>
        </div>
      </form>

      <p className="mt-8 text-center text-xs text-slate-400 fade-in" style={{ animationDelay: '300ms' }}>
        Setting up a new company?{' '}
        <Link to="/signup" className="font-medium text-blue-400 hover:text-blue-300 transition-colors duration-150">
          Create a company workspace
        </Link>
      </p>
    </AuthLayout>
  );
};
