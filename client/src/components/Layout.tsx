import { Link, useNavigate } from 'react-router-dom';
import { useAuthContext } from '../context/AuthContext.js';
import { logout } from '../api/auth.js';

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, refetch } = useAuthContext();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await logout();
      refetch();
      void navigate('/login');
    } catch {
      // ignore
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4">
          <div className="flex items-center justify-between h-14">
            <Link to="/" className="font-bold text-lg text-blue-700">
              WSTrack
            </Link>
            {user && (
              <div className="flex items-center gap-4">
                <span className="text-sm text-gray-600 hidden sm:block">{user.name}</span>
                <button
                  onClick={() => void handleLogout()}
                  className="text-sm text-gray-500 hover:text-gray-800 min-h-11 px-3 flex items-center"
                >
                  Log out
                </button>
              </div>
            )}
          </div>
        </div>
      </nav>
      <main className="max-w-4xl mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
