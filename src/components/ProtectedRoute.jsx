import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function ProtectedRoute({ allowedRoles, children }) {
  const { profile, loading } = useAuth();

  if (loading) return <div className="loading"><span className="spin"></span> Loading…</div>;
  if (!profile) return <Navigate to="/login" replace />;
  if (allowedRoles && !allowedRoles.includes(profile.role)) return <Navigate to="/login" replace />;

  return children;
}
