import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { verifyEmail } from '../api/auth.js';
import { ApiError } from '../api/client.js';
import { useAuthContext } from '../context/AuthContext.js';

export default function VerifyEmail() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { refetch } = useAuthContext();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!token) { setStatus('error'); setErrorMsg('Invalid link'); return; }
    let cancelled = false;
    verifyEmail(token)
      .then(async () => {
        if (cancelled) return;
        await refetch();
        setStatus('success');
        setTimeout(() => navigate('/'), 2000);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setStatus('error');
        setErrorMsg(err instanceof ApiError ? err.message : 'Verification failed');
      });
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-screen bg-gray-50 flex items-start justify-center pt-16 px-4">
      <div className="w-full max-w-sm text-center space-y-4">
        {status === 'loading' && (
          <>
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-gray-600 text-sm">Verifying your email…</p>
          </>
        )}
        {status === 'success' && (
          <>
            <div className="text-4xl">✅</div>
            <h1 className="text-2xl font-bold text-gray-900">Email verified!</h1>
            <p className="text-gray-600 text-sm">Redirecting you to the app…</p>
          </>
        )}
        {status === 'error' && (
          <>
            <div className="text-4xl">❌</div>
            <h1 className="text-xl font-bold text-gray-900">Verification failed</h1>
            <p className="text-gray-600 text-sm">{errorMsg}</p>
            <Link to="/login" className="inline-block text-blue-600 hover:underline text-sm">Back to sign in</Link>
          </>
        )}
      </div>
    </div>
  );
}
