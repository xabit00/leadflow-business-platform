import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertCircle, ArrowRight, Building, Loader2, MailCheck, Eye, EyeOff } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { normalizeError } from '../../api/errors';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import { AuthLayout } from '../../components/layout/AuthLayout';

export const SignupPage: React.FC = () => {
  const navigate = useNavigate();
  const { signUp } = useAuth();
  const toast = useToast();
  const [companyName, setCompanyName] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmationEmail, setConfirmationEmail] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await signUp({ companyName, fullName, email, password });
      if (result.emailConfirmationRequired) {
        setConfirmationEmail(email.trim());
        toast.info('Open the confirmation link to finish creating your workspace.');
        return;
      }
      toast.success(`Workspace ${companyName.trim()} created!`);
      navigate('/', { replace: true });
    } catch (caught) {
      const message = normalizeError(caught, 'Failed to create your workspace. Check your details and try again.').message;
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      {confirmationEmail ? (
        <div className="text-center fade-in-up" aria-live="polite">
          <span className="w-14 h-14 mx-auto mb-5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
            <MailCheck className="w-7 h-7" />
          </span>
          <h2 className="font-bold text-xl text-white">Check your email</h2>
          <p className="mt-2 text-sm text-slate-400 leading-relaxed">
            We sent a confirmation link to{' '}
            <strong className="text-slate-200">{confirmationEmail}</strong>.
            Open it in this browser to finish creating your workspace.
          </p>
          <Link
            to="/login"
            className="inline-block mt-6 text-sm font-medium text-blue-400 hover:text-blue-300 transition-colors duration-150"
          >
            Return to sign in
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5 fade-in-up">
          <div className="text-center">
            <h2 className="font-bold text-2xl text-white tracking-tight">
              Create your company workspace
            </h2>
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 flex items-start gap-3" role="alert" aria-live="polite">
              <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
              <p className="text-sm text-red-300 leading-relaxed">{error}</p>
            </div>
          )}

          <div className="space-y-2 fade-in" style={{ animationDelay: '60ms' }}>
            <div className="flex items-center gap-2 text-xs font-semibold text-blue-400 uppercase tracking-wider">
              <Building className="w-4 h-4" />
              Company workspace
            </div>
            <Input
              label="Company / Business Name"
              required
              autoComplete="organization"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              disabled={loading}
            />
          </div>

          <Input
            label="Full Name"
            required
            autoComplete="name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            disabled={loading}
            style={{ animationDelay: '120ms' }}
            className="fade-in"
          />
          <Input
            label="Work Email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
            style={{ animationDelay: '180ms' }}
            className="fade-in"
          />
          <div className="relative fade-in" style={{ animationDelay: '240ms' }}>
            <Input
              label="Password"
              className="pr-12"
              type={showPassword ? 'text' : 'password'}
              required
              minLength={8}
              autoComplete="new-password"
              helperText="Use at least 8 characters."
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              className="absolute right-2 top-7 flex h-9 w-9 items-center justify-center text-slate-500 hover:text-slate-300 hover:bg-slate-800 rounded transition-colors duration-150 disabled:opacity-50 disabled:pointer-events-none"
              disabled={loading}
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          <Button
            type="submit"
            disabled={loading || !companyName.trim() || !fullName.trim() || !email.trim() || password.length < 8}
            className="w-full mt-2 active:scale-95 transition-transform duration-150"
            style={{ animationDelay: '300ms' }}
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Creating workspace...
              </>
            ) : (
              <>
                Launch LeadFlow Workspace
                <ArrowRight className="w-4 h-4 ml-1.5" />
              </>
            )}
          </Button>
        </form>
      )}

      <p className="mt-8 text-center text-xs text-slate-400 fade-in" style={{ animationDelay: '360ms' }}>
        Already have an account?{' '}
        <Link to="/login" className="font-medium text-blue-400 hover:text-blue-300 transition-colors duration-150">
          Sign in
        </Link>
      </p>
    </AuthLayout>
  );
};
