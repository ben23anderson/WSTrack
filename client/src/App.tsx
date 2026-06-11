import { Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext.js';
import ProtectedRoute from './components/ProtectedRoute.js';
import Dashboard from './pages/Dashboard.js';
import Login from './pages/Login.js';
import Signup from './pages/Signup.js';
import DivisionDetail from './pages/DivisionDetail.js';
import TeamDetail from './pages/TeamDetail.js';
import AcceptInvite from './pages/AcceptInvite.js';
import RosterPage from './pages/RosterPage.js';
import BoatsPage from './pages/BoatsPage.js';
import RaceDaysPage from './pages/RaceDaysPage.js';
import RaceDayDetail from './pages/RaceDayDetail.js';
import RaceDetail from './pages/RaceDetail.js';
import DivisionConfig from './pages/DivisionConfig.js';
import BoatPrepPage from './pages/BoatPrepPage.js';
import HeatSheetPage from './pages/HeatSheetPage.js';
import OfficiatingPage from './pages/OfficiatingPage.js';
import QRScannerPage from './pages/QRScannerPage.js';
import LiveViewPage from './pages/LiveViewPage.js';
import ReviewPage from './pages/ReviewPage.js';
import RaceResultsPage from './pages/RaceResultsPage.js';
import FinalsPage from './pages/FinalsPage.js';

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
        <Route
          path="/teams/:teamId/roster"
          element={
            <ProtectedRoute>
              <RosterPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/teams/:teamId/boats"
          element={
            <ProtectedRoute>
              <BoatsPage />
            </ProtectedRoute>
          }
        />
        <Route path="/invites/:token" element={<AcceptInvite />} />
        <Route
          path="/divisions/:divisionId/race-days"
          element={
            <ProtectedRoute>
              <RaceDaysPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/divisions/:divisionId/config"
          element={
            <ProtectedRoute>
              <DivisionConfig />
            </ProtectedRoute>
          }
        />
        <Route
          path="/race-days/:raceDayId"
          element={
            <ProtectedRoute>
              <RaceDayDetail />
            </ProtectedRoute>
          }
        />
        <Route
          path="/races/:raceId"
          element={
            <ProtectedRoute>
              <RaceDetail />
            </ProtectedRoute>
          }
        />
        <Route
          path="/race-days/:raceDayId/boat-prep"
          element={
            <ProtectedRoute>
              <BoatPrepPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/races/:raceId/heats"
          element={
            <ProtectedRoute>
              <HeatSheetPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/heats/:heatId/officiate"
          element={
            <ProtectedRoute>
              <OfficiatingPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/heats/:heatId/live"
          element={
            <ProtectedRoute>
              <LiveViewPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/heats/:heatId/review"
          element={
            <ProtectedRoute>
              <ReviewPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/heats/:heatId/qr-scan"
          element={
            <ProtectedRoute>
              <QRScannerPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/races/:raceId/results"
          element={
            <ProtectedRoute>
              <RaceResultsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/races/:raceId/finals"
          element={
            <ProtectedRoute>
              <FinalsPage />
            </ProtectedRoute>
          }
        />
      </Routes>
    </AuthProvider>
  );
}
