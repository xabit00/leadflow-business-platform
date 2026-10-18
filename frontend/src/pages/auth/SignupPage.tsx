import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertCircle, ArrowRight, Building, Layers, Loader2, MailCheck } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { normalizeError } from '../../api/errors';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';

export const SignupPage: React.FC = () => {
  const navigate = useNavigate();
  const { signUp } = useAuth();
  const toast = useToast();
  const [companyName, setCompanyName] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
        toast.info('Open the confirmation link to finish creating your workspace.', 'Check Your Email');
        return;
      }

      toast.success(`Workspace ${companyName.trim()} created!`, 'Account Registered');
      navigate('/', { replace: true });
    } catch (caught) {
      const message = normalizeError(caught, 'Failed to create your workspace. Check your details and try again.').message;
      setError(message);
      toast.error(message, 'Registration Error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className='min-h-screen bg-slate-950 flex items-center justify-center p-4 selection:bg-blue-600 selection:text-white'>
      <div className='w-full max-w-lg'>
        <div className='text-center mb-6'>
          <Link to='/' className='inline-flex items-center gap-2.5 group mb-4'>
            <span className='w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-lg shadow-blue-500/25 group-hover:bg-blue-500 transition-colors'>
              <Layers className='w-6 h-6' />
            </span>
            <span className='text-2xl font-bold tracking-tight text-white'>LeadFlow</span>
          </Link>
          <h1 className='text-xl font-bold text-white tracking-tight'>Create your company workspace</h1>
          <p className='text-xs text-slate-400 mt-1'>Start accountable lead routing in a few minutes</p>
        </div>

        <div className='bg-slate-900/90 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-xl backdrop-blur-sm'>
          {confirmationEmail ? (
            <div className='text-center py-5' aria-live='polite'>
              <span className='w-14 h-14 mx-auto mb-5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center'>
                <MailCheck className='w-7 h-7' />
              </span>
              <h2 className='text-lg font-semibold text-white'>Check your email</h2>
              <p className='text-sm text-slate-400 mt-2 leading-relaxed'>
                We sent a confirmation link to <strong className='text-slate-200'>{confirmationEmail}</strong>.
                Open it in this browser to finish creating your workspace.
              </p>
              <Link to='/login' className='inline-block mt-6 text-sm font-medium text-blue-400 hover:text-blue-300'>
                Return to sign in
              </Link>
            </div>
          ) : (
            <>
              {error && (
                <div className='mb-5 p-3.5 rounded-lg bg-red-500/10 border border-red-500/30 flex items-start gap-3' role='alert'>
                  <AlertCircle className='w-4 h-4 text-red-400 mt-0.5 shrink-0' />
                  <p className='text-xs text-red-300 leading-relaxed'>{error}</p>
                </div>
              )}

              <form onSubmit={handleSubmit} className='space-y-4'>
                <div className='p-3 bg-slate-950/70 border border-slate-800 rounded-xl space-y-3'>
                  <div className='flex items-center gap-2 text-xs font-semibold text-blue-400 uppercase tracking-wider'>
                    <Building className='w-4 h-4' />
                    Company workspace
                  </div>
                  <Input label='Company / Business Name' name='companyName' required autoComplete='organization' value={companyName} onChange={(event) => setCompanyName(event.target.value)} disabled={loading} />
                </div>

                <Input label='Full Name' name='fullName' required autoComplete='name' value={fullName} onChange={(event) => setFullName(event.target.value)} disabled={loading} />
                <Input label='Work Email' name='email' type='email' required autoComplete='email' value={email} onChange={(event) => setEmail(event.target.value)} disabled={loading} />
                <Input label='Password' name='password' type='password' required minLength={8} autoComplete='new-password' helperText='Use at least 8 characters.' value={password} onChange={(event) => setPassword(event.target.value)} disabled={loading} />

                <Button type='submit' disabled={loading || !companyName.trim() || !fullName.trim() || !email.trim() || password.length < 8} className='w-full mt-3'>
                  {loading ? <><Loader2 className='w-4 h-4 animate-spin' />Creating workspace...</> : <>Launch LeadFlow Workspace<ArrowRight className='w-4 h-4' /></>}
                </Button>
              </form>
            </>
          )}
        </div>

        <p className='text-center text-xs text-slate-400 mt-6'>
          Already have an account? <Link to='/login' className='font-medium text-blue-400 hover:text-blue-300'>Sign in</Link>
        </p>
      </div>
    </div>
  );
};
