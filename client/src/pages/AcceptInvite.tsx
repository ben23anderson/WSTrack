import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { getInviteInfo } from '../api/invites.js';
import { acceptInvite } from '../api/invites.js';
import { signup } from '../api/auth.js';
import type { InviteInfo } from '../api/invites.js';
import { ApiError } from '../api/client.js';
import { useAuthContext } from '../context/AuthContext.js';

function roleLabel(role: string): string {
  return role.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function AcceptInvite() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { user, isLoading, refetch } = useAuthContext();

  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [loadError, setLoadError] = useState('');
  const [accepting, setAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState('');

  // Signup form state (for new users)
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [signupError, setSignupError] = useState('');
  const [signupLoading, setSignupLoading] = useState(false);

  // Load invite info first (no auth required)
  useEffect(() => {
    if (!token) { setLoadError('Invalid invite link'); return; }
    getInviteInfo(token)
      .then(({ invite: info }) => setInvite(info))
      .catch((err: unknown) => setLoadError(err instanceof ApiError ? err.message : 'Failed to load invite'));
  }, [token]);

  // Once invite is loaded and user is logged in, auto-accept
  useEffect(() => {
    if (isLoading || !invite || !user || !token) return;
    if (invite.isExpired || invite.isAccepted) return;

    let cancelled = false;
    setAccepting(true);
    acceptInvite(token)
      .then((data) => {
        if (cancelled) return;
        refetch();
        navigate(data.teamId ? `/teams/${data.teamId}` : '/', { replace: true });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setAcceptError(err instanceof ApiError ? err.message : 'Failed to accept invite');
        setAccepting(false);
      });
    return () => { cancelled = true; };
  }, [isLoading, user, invite, token]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setSignupError('');
    setSignupLoading(true);
    try {
      const result = await signup({ name, email: invite!.email, password, invite_token: token });
      await refetch();
      navigate(result.teamId ? `/teams/${result.teamId}` : '/', { replace: true });
    } catch (err) {
      setSignupError(err instanceof ApiError ? err.message : 'Signup failed');
    } finally {
      setSignupLoading(false);
    }
  };

  // Loading states
  if (!invite && !loadError) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-6 py-5 max-w-sm w-full text-center">
          <p className="font-medium">Invalid invite</p>
          <p className="text-sm mt-1">{loadError}</p>
        </div>
      </div>
    );
  }

  if (invite!.isExpired || invite!.isAccepted) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 rounded-xl px-6 py-5 max-w-sm w-full text-center">
          <p className="font-medium">{invite!.isAccepted ? 'Invite already used' : 'Invite expired'}</p>
          <p className="text-sm mt-1">Ask for a new invite link.</p>
          <Link to="/" className="mt-3 inline-block text-sm text-blue-600 hover:underline">Go to dashboard</Link>
        </div>
      </div>
    );
  }

  if (isLoading || accepting) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-gray-600 text-sm">Accepting invite…</p>
        </div>
      </div>
    );
  }

  if (acceptError) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-6 py-5 max-w-sm w-full text-center">
          <p className="font-medium">Unable to accept invite</p>
          <p className="text-sm mt-1">{acceptError}</p>
        </div>
      </div>
    );
  }

  const contextLine = [invite!.teamName ?? invite!.divisionName, roleLabel(invite!.role)].filter(Boolean).join(' · ');

  // User is logged in — waiting for auto-accept effect
  if (user) return null;

  // No account: show signup form
  if (!invite!.emailHasAccount) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-start justify-center pt-16 px-4">
        <div className="w-full max-w-sm space-y-4">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900">You're invited!</h1>
            <p className="text-sm text-gray-500 mt-1">{contextLine}</p>
          </div>
          <form onSubmit={(e) => void handleSignup(e)} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-4">
            {signupError && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{signupError}</div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Full name</label>
              <input type="text" required autoFocus value={name} onChange={(e) => setName(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-11" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input type="email" value={invite!.email} disabled className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-gray-50 text-gray-500 min-h-11" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Password <span className="text-gray-400 font-normal">(min 8 characters)</span>
              </label>
              <input type="password" required minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-11" />
            </div>
            <button type="submit" disabled={signupLoading} className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-medium rounded-lg px-4 py-3 text-sm min-h-11 transition-colors">
              {signupLoading ? 'Creating account…' : 'Create account & accept invite'}
            </button>
          </form>
          <p className="text-center text-sm text-gray-600">
            Already have an account?{' '}
            <Link to={`/login?redirect=/invites/${token ?? ''}`} className="text-blue-600 hover:underline">Sign in</Link>
          </p>
        </div>
      </div>
    );
  }

  // Has account but not logged in: redirect to login
  navigate(`/login?redirect=/invites/${token ?? ''}`, { replace: true });
  return null;
}
