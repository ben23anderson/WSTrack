import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { login, resendVerification } from '../api/auth.js';
import { ApiError } from '../api/client.js';
import { useAuthContext } from '../context/AuthContext.js';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [unverified, setUnverified] = useState(false);
  const [resendSent, setResendSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const { refetch } = useAuthContext();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const passwordReset = searchParams.get('reset') === '1';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setUnverified(false);
    setResendSent(false);
    setLoading(true);
    try {
      await login({ email, password });
      await refetch();
      const redirect = searchParams.get('redirect');
      navigate(redirect ?? '/');
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 403) {
          setUnverified(true);
        }
        setError(err.message);
      } else {
        setError('An unexpected error occurred');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (!email) { setError('Enter your email above first'); return; }
    await resendVerification(email);
    setResendSent(true);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-start justify-center pt-16 px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-gray-900 mb-6 text-center">Sign in to WSTrack</h1>
        <form onSubmit={(e) => void handleSubmit(e)} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-4">
          {passwordReset && (
            <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg px-4 py-3 text-sm">
              Password reset successful — sign in with your new password.
            </div>
          )}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm space-y-1">
              <p>{error}</p>
              {unverified && !resendSent && (
                <button type="button" onClick={() => void handleResend()} className="underline text-red-700 hover:text-red-900 text-xs">
                  Resend verification email
                </button>
              )}
              {resendSent && <p className="text-xs text-green-700">Verification email sent — check your inbox.</p>}
            </div>
          )}
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-11" />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">Password</label>
              <Link to="/forgot-password" className="text-xs text-blue-600 hover:underline">Forgot password?</Link>
            </div>
            <input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-11" />
          </div>
          <button type="submit" disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-medium rounded-lg px-4 py-3 text-sm min-h-11 transition-colors">
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <p className="text-center text-sm text-gray-600 mt-4">
          Don't have an account?{' '}
          <Link to="/signup" className="text-blue-600 hover:underline">Sign up</Link>
        </p>
      </div>
    </div>
  );
}
