import { useEffect, useState } from 'react';
import { useAuth } from '@getmocha/users-service/react';
import { Navigate, useLocation } from 'react-router';
import { Shield, Chrome, Loader2, CheckCircle2, Users, Brain, BarChart3, Star, PlayCircle, ArrowRight, Award, Zap, Globe } from 'lucide-react';

export default function Login() {
  const { user, isPending, redirectToLogin } = useAuth();
  const location = useLocation();
  const from = (location.state as any)?.from?.pathname || '/';
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // Auto-redirect if already authenticated
    if (user && !isPending) {
      // Will be handled by Navigate component below
    }
  }, [user, isPending]);

  const handleLogin = async () => {
    try {
      setIsLoading(true);
      await redirectToLogin();
    } catch (error) {
      console.error('Login error:', error);
      setIsLoading(false);
    }
  };

  if (isPending) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-slate-600">Verificando autenticação...</p>
        </div>
      </div>
    );
  }

  if (user) {
    return <Navigate to={from} replace />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Hero Section */}
      <div className="container mx-auto px-4 py-12">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="text-center mb-16">
            <div className="flex items-center justify-center mb-6">
              <div className="p-6 bg-white rounded-2xl shadow-lg border border-slate-100">
                <img src="https://mocha-cdn.com/01984e68-f701-7339-b2ea-61f4c5037843/compia_logo.webp" alt="COMPIA" className="h-16" />
              </div>
            </div>
            <p className="text-xl lg:text-2xl text-slate-600 max-w-3xl mx-auto leading-relaxed mb-4">
              <span className="font-semibold text-compia-blue">Menos papel, mais resultado.</span><br/>
              <span className="font-semibold text-compia-purple">Inspeções com inteligência.</span>
            </p>
            <p className="text-lg text-slate-500 max-w-2xl mx-auto leading-relaxed mb-8">
              A plataforma mais avançada para inspeções de segurança do trabalho com 
              inteligência artificial e colaboração em tempo real
            </p>
            
            {/* Social Proof */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-6 text-sm text-slate-500 mb-8">
              <div className="flex items-center gap-2">
                <div className="flex -space-x-2">
                  <div className="w-8 h-8 bg-blue-500 rounded-full border-2 border-white flex items-center justify-center text-white font-bold text-xs">A</div>
                  <div className="w-8 h-8 bg-green-500 rounded-full border-2 border-white flex items-center justify-center text-white font-bold text-xs">B</div>
                  <div className="w-8 h-8 bg-purple-500 rounded-full border-2 border-white flex items-center justify-center text-white font-bold text-xs">C</div>
                </div>
                <span>Usado por 500+ profissionais</span>
              </div>
              <div className="flex items-center gap-1">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="w-4 h-4 text-yellow-400 fill-current" />
                ))}
                <span className="ml-1">4.9/5 em satisfação</span>
              </div>
              <div className="flex items-center gap-2">
                <Award className="w-4 h-4 text-blue-500" />
                <span>Certificado ISO 45001</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            {/* Login Card */}
            <div className="bg-white rounded-2xl shadow-xl p-8 border border-slate-200">
              <div className="text-center mb-8">
                <h2 className="text-2xl font-semibold text-slate-900 mb-2">
                  Entre na sua conta
                </h2>
                <p className="text-slate-600">
                  Faça login com sua conta Google para acessar o sistema
                </p>
              </div>

              <button
                onClick={handleLogin}
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-gradient-to-r from-compia-blue to-compia-purple text-white rounded-xl hover:from-compia-purple hover:to-compia-blue focus:ring-2 focus:ring-compia-blue focus:ring-offset-2 transition-all duration-200 group shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed mb-6"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span className="font-medium">Conectando...</span>
                  </>
                ) : (
                  <>
                    <Chrome className="w-5 h-5 text-white transition-colors" />
                    <span className="font-medium">
                      Entrar com Google
                    </span>
                  </>
                )}
              </button>

              {/* Value Props in Login Card */}
              <div className="space-y-3 mb-6">
                <div className="flex items-center gap-3 text-sm text-slate-600">
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                  <span>Acesso instantâneo com Google</span>
                </div>
                <div className="flex items-center gap-3 text-sm text-slate-600">
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                  <span>Setup em menos de 2 minutos</span>
                </div>
                <div className="flex items-center gap-3 text-sm text-slate-600">
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                  <span>Sem necessidade de senhas</span>
                </div>
                <div className="flex items-center gap-3 text-sm text-slate-600">
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                  <span>Suporte técnico incluso</span>
                </div>
              </div>

              <div className="text-center">
                <button className="text-compia-blue hover:text-compia-purple font-medium text-sm flex items-center justify-center gap-1 mx-auto">
                  <PlayCircle className="w-4 h-4" />
                  Assistir demonstração (3 min)
                </button>
              </div>

              <div className="mt-8 pt-6 border-t border-slate-200">                
                <div className="text-center text-sm text-slate-500">
                  <p>
                    Ao fazer login, você concorda com nossos{' '}
                    <a href="#" className="text-compia-blue hover:underline">
                      Termos de Uso
                    </a>{' '}
                    e{' '}
                    <a href="#" className="text-compia-blue hover:underline">
                      Política de Privacidade
                    </a>
                  </p>
                </div>
              </div>
            </div>

            {/* Enhanced Features */}
            <div className="space-y-8">
              {/* ROI Card */}
              <div className="bg-gradient-to-r from-compia-green/10 to-compia-green/20 border border-compia-green/30 rounded-xl p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-compia-green/20 rounded-lg">
                    <BarChart3 className="w-5 h-5 text-compia-green" />
                  </div>
                  <h3 className="font-semibold text-compia-green">
                    Reduza custos em até 65%
                  </h3>
                </div>
                <p className="text-compia-green/80 text-sm mb-3">
                  Empresas que usam COMPIA economizam em média R$ 150.000 anuais 
                  em multas evitadas e redução de acidentes
                </p>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="font-bold text-2xl text-compia-green">65%</span>
                    <p className="text-compia-green/80">Menos tempo em inspeções</p>
                  </div>
                  <div>
                    <span className="font-bold text-2xl text-compia-green">89%</span>
                    <p className="text-compia-green/80">Redução de não conformidades</p>
                  </div>
                </div>
              </div>

              {/* Feature List */}
              <div className="space-y-6">
                <div className="flex items-start gap-4">
                  <div className="p-3 bg-blue-100 rounded-lg">
                    <Brain className="w-6 h-6 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900 mb-2">
                      IA Especialista em SST
                    </h3>
                    <p className="text-slate-600 text-sm leading-relaxed">
                      Nossa IA identifica riscos automaticamente, gera planos de ação 5W2H 
                      e sugere ações baseadas em NRs e melhores práticas do mercado.
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      <Zap className="w-4 h-4 text-yellow-500" />
                      <span className="text-xs text-yellow-700 font-medium">IA Treinada com +10.000 inspeções reais</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="p-3 bg-purple-100 rounded-lg">
                    <Users className="w-6 h-6 text-purple-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900 mb-2">
                      Colaboração Multi-Usuário
                    </h3>
                    <p className="text-slate-600 text-sm leading-relaxed">
                      Equipes trabalham simultaneamente na mesma inspeção, com sincronização 
                      em tempo real e controle de versões automático.
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      <Globe className="w-4 h-4 text-blue-500" />
                      <span className="text-xs text-blue-700 font-medium">Funciona offline e sincroniza automaticamente</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="p-3 bg-green-100 rounded-lg">
                    <BarChart3 className="w-6 h-6 text-green-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900 mb-2">
                      Analytics Preditivos
                    </h3>
                    <p className="text-slate-600 text-sm leading-relaxed">
                      Dashboards executivos com insights acionáveis, previsão de riscos 
                      e indicadores de performance em segurança (KPIs).
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      <Award className="w-4 h-4 text-green-500" />
                      <span className="text-xs text-green-700 font-medium">Relatórios prontos para auditoria</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* CTA for Demo */}
              <div className="bg-gradient-to-r from-compia-blue to-compia-purple rounded-xl p-6 text-white">
                <h3 className="font-semibold mb-2">
                  Veja funcionando na sua empresa
                </h3>
                <p className="text-blue-100 text-sm mb-4">
                  Agende uma demonstração personalizada e receba uma análise gratuita 
                  do seu processo atual de inspeções
                </p>
                <button className="bg-white text-compia-blue px-4 py-2 rounded-lg font-medium hover:bg-blue-50 transition-colors flex items-center gap-2">
                  Agendar demonstração
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Testimonials */}
          <div className="mt-20">
            <h2 className="text-2xl font-bold text-center text-slate-900 mb-12">
              Empresas que confiam na nossa plataforma
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
                <div className="flex items-center gap-1 mb-3">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="w-4 h-4 text-yellow-400 fill-current" />
                  ))}
                </div>
                <p className="text-slate-600 text-sm mb-4">
                  "Reduzimos o tempo de inspeção em 70% e melhoramos drasticamente 
                  nossa conformidade. A IA identifica riscos que passariam despercebidos."
                </p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold">
                    M
                  </div>
                  <div>
                    <p className="font-medium text-slate-900">Marcus Silva</p>
                    <p className="text-xs text-slate-500">Eng. Segurança - Construtora ABC</p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
                <div className="flex items-center gap-1 mb-3">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="w-4 h-4 text-yellow-400 fill-current" />
                  ))}
                </div>
                <p className="text-slate-600 text-sm mb-4">
                  "A colaboração em tempo real revolucionou nosso processo. 
                  Agora conseguimos inspecionar 3x mais locais com a mesma equipe."
                </p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center text-white font-bold">
                    A
                  </div>
                  <div>
                    <p className="font-medium text-slate-900">Ana Costa</p>
                    <p className="text-xs text-slate-500">Coord. SST - Indústria XYZ</p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
                <div className="flex items-center gap-1 mb-3">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="w-4 h-4 text-yellow-400 fill-current" />
                  ))}
                </div>
                <p className="text-slate-600 text-sm mb-4">
                  "Os relatórios automáticos poupam horas de trabalho administrativo. 
                  Nosso foco agora é 100% na segurança, não na burocracia."
                </p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-purple-500 rounded-full flex items-center justify-center text-white font-bold">
                    R
                  </div>
                  <div>
                    <p className="font-medium text-slate-900">Rafael Mendes</p>
                    <p className="text-xs text-slate-500">SESMT - Grupo DEF</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Trust Badges */}
          <div className="mt-16 pt-8 border-t border-slate-200">
            <div className="flex flex-col sm:flex-row items-center justify-center gap-8 text-slate-500">
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5" />
                <span className="text-sm">Dados criptografados</span>
              </div>
              <div className="flex items-center gap-2">
                <Award className="w-5 h-5" />
                <span className="text-sm">Conforme LGPD</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5" />
                <span className="text-sm">99.9% uptime</span>
              </div>
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5" />
                <span className="text-sm">Suporte 24/7</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
