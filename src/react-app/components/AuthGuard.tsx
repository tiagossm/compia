import { useSupabaseAuth } from '@/react-app/components/SupabaseAuthProvider';
import { Navigate, useLocation } from 'react-router';
import { Shield, Loader2 } from 'lucide-react';

interface AuthGuardProps {
  children: React.ReactNode;
  requiredRole?: string;
  requiredRoles?: string[];
}

export default function AuthGuard({ children, requiredRole, requiredRoles }: AuthGuardProps) {
  const { user: supabaseUser, profile, loading: supabaseLoading } = useSupabaseAuth();
  const location = useLocation();

  // Use Supabase auth as primary
  const user = supabaseUser;
  const userProfile = profile;
  const loading = supabaseLoading;

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="bg-white rounded-xl shadow-lg p-8 text-center max-w-md">
          <div className="p-4 bg-blue-100 rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center">
            <Shield className="w-8 h-8 text-blue-600" />
          </div>
          <div className="flex items-center justify-center gap-2 mb-4">
            <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
            <span className="text-slate-700">Verificando autenticação...</span>
          </div>
          <p className="text-slate-500 text-sm">
            Aguarde enquanto validamos suas credenciais
          </p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Check role-based access
  const hasRequiredRole = () => {
    const userRole = userProfile?.role;
    
    // System admin has access to everything
    if (userRole === 'system_admin') {
      return true;
    }
    
    if (requiredRole) {
      return userRole === requiredRole;
    }
    
    if (requiredRoles && requiredRoles.length > 0) {
      return requiredRoles.includes(userRole || '');
    }
    
    return true;
  };

  if (!hasRequiredRole()) {
    const requiredRoleText = requiredRole || (requiredRoles ? requiredRoles.join(', ') : 'Indefinido');
    
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="bg-white rounded-xl shadow-lg p-8 text-center max-w-md">
          <div className="p-4 bg-red-100 rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center">
            <Shield className="w-8 h-8 text-red-600" />
          </div>
          <h2 className="text-xl font-semibold text-slate-900 mb-2">
            Acesso Negado
          </h2>
          <p className="text-slate-600 mb-4">
            Você não tem permissão para acessar esta página.
          </p>
          <p className="text-sm text-slate-500">
            Perfil necessário: <span className="font-medium">{requiredRoleText}</span>
            <br />
            Seu perfil: <span className="font-medium">{userProfile?.role}</span>
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
