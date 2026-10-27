import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Loader } from '../components/ui/Loader';

export function GuestRoute() {
  const { user, status } = useAuth();
  if (status === 'loading') return <Loader fullPage label="Loading" />;
  if (user?.mustChangePassword) return <Navigate to="/change-password" replace />;
  if (user) return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}
