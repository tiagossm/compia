import { useEffect, useState } from 'react';
import { useAuth } from '@getmocha/users-service/react';
import { Navigate } from 'react-router';
import { Shield, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

export default function AuthCallback() {
  const { exchangeCodeForSessionToken, user } = useAuth();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [error, setError] = useState<string>('');

  useEffect(() => {
    const handleCallback = async () => {
      try {
        await exchangeCodeForSessionToken();
        setStatus('success');
      } catch (error) {
        console.error('Auth callback error:', error);
        setStatus('error');
        setError(error instanceof Error ? error.message : 'Erro desconhecido');
      }
    };

    handleCallback();
  }, [exchangeCodeForSessionToken]);

  if (status === 'success' && user) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
      <div className="bg-white rounded-xl shadow-lg p-8 text-center max-w-md">
        <div className="p-4 bg-blue-100 rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center">
          <Shield className="w-8 h-8 text-blue-600" />
        </div>

        {status === 'loading' && (
          <>
            <div className="flex items-center justify-center gap-2 mb-4">
              <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
              <span className="text-slate-700 font-medium">Finalizando login...</span>
            </div>
            <p className="text-slate-500 text-sm">
              Aguarde enquanto configuramos sua conta
            </p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="flex items-center justify-center gap-2 mb-4">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
              <span className="text-slate-700 font-medium">Login realizado com sucesso!</span>
            </div>
            <p className="text-slate-500 text-sm">
              Redirecionando você para o sistema...
            </p>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="flex items-center justify-center gap-2 mb-4">
              <AlertCircle className="w-5 h-5 text-red-600" />
              <span className="text-slate-700 font-medium">Erro no login</span>
            </div>
            <p className="text-slate-500 text-sm mb-4">
              {error || 'Ocorreu um erro durante o processo de autenticação'}
            </p>
            <button
              onClick={() => window.location.href = '/login'}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Tentar novamente
            </button>
          </>
        )}
      </div>
    </div>
  );
}
