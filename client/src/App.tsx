import { Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext.js';
import ProtectedRoute from './components/ProtectedRoute.js';
import Dashboard from './pages/Dashboard.js';
import Login from './pages/Login.js';
import Signup from './pages/Signup.js';
import DivisionDetail from './pages/DivisionDetail.js';
import TeamDetail from './pages/TeamDetail.js';
import AcceptInvite from './pages/AcceptInvite.js';

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route
          path="/divisions/:divisionId"
          element={
            <ProtectedRoute>
              <DivisionDetail />
            </ProtectedRoute>
          }
        />
        <Route
          path="/teams/:teamId"
          element={
            <ProtectedRoute>
              <TeamDetail />
            </ProtectedRoute>
          }
        />
        <Route path="/invites/:token" element={<AcceptInvite />} />
      </Routes>
    </AuthProvider>
  );
}
