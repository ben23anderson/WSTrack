import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { acceptInvite } from '../api/invites.js';
import { ApiError } from '../api/client.js';
import { useAuthContext } from '../context/AuthContext.js';

export default function AcceptInvite() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { user, isLoading, refetch } = useAuthContext();
  const [error, setError] = useState('');
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      // Redirect to login, then come back
      void navigate(`/login?redirect=/invites/${token ?? ''}`);
      return;
    }
    if (!token) {
      setError('Invalid invite link');
      return;
    }
    let cancelled = false;
    setAccepting(true);
    acceptInvite(token)
      .then((data) => {
        if (cancelled) return;
        refetch();
        const dest = data.teamId ? `/teams/${data.teamId}` : '/';
        void navigate(dest, { replace: true });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError) {
          setError(err.message);
        } else {
          setError('Failed to accept invite');
        }
        setAccepting(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isLoading, user, token]); // eslint-disable-line react-hooks/exhaustive-deps

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

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-6 py-5 max-w-sm w-full text-center">
          <p className="font-medium">Unable to accept invite</p>
          <p className="text-sm mt-1">{error}</p>
        </div>
      </div>
    );
  }

  return null;
}
