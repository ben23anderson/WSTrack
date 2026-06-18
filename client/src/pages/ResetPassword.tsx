import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { resetPassword } from '../api/auth.js';
import { ApiError } from '../api/client.js';

export default function ResetPassword() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password !== confirm) { setError('Passwords do not match'); return; }
    if (!token) { setError('Invalid reset link'); return; }
    setLoading(true);
    try {
      await resetPassword(token, password);
      navigate('/login?reset=1');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to reset password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-start justify-center pt-16 px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-gray-900 mb-6 text-center">Reset your password</h1>
        <form onSubmit={(e) => void handleSubmit(e)} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>
          )}
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
              New password <span className="text-gray-400 font-normal">(min 8 characters)</span>
            </label>
            <input id="password" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-11" />
          </div>
          <div>
            <label htmlFor="confirm" className="block text-sm font-medium text-gray-700 mb-1">Confirm password</label>
            <input id="confirm" type="password" autoComplete="new-password" required minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-11" />
          </div>
          <button type="submit" disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-medium rounded-lg px-4 py-3 text-sm min-h-11 transition-colors">
            {loading ? 'Resetting…' : 'Reset password'}
          </button>
        </form>
        <p className="text-center text-sm text-gray-600 mt-4">
          <Link to="/login" className="text-blue-600 hover:underline">Back to sign in</Link>
        </p>
      </div>
    </div>
  );
}
