import { useEffect, useState } from 'react'
import { Navigate, useLocation } from 'react-router'
import { useSupabaseAuth } from '@/react-app/components/SupabaseAuthProvider'
import { Shield, Chrome, Loader2, CheckCircle2, Users, Brain, BarChart3, Star, PlayCircle, ArrowRight, Award, Zap, Globe } from 'lucide-react'

export default function SupabaseLogin() {
  const { user, loading, signInWithGoogle } = useSupabaseAuth()
  const location = useLocation()
  const from = (location.state as any)?.from?.pathname || '/'
  const [isLoading, setIsLoading] = useState(false)

  const handleLogin = async () => {
    try {
      setIsLoading(true)
      await signInWithGoogle()
    } catch (error) {
      console.error('Login error:', error)
      setIsLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-slate-600">Verificando autenticação...</p>
        </div>
      </div>
    )
  }

  if (user) {
    return <Navigate to={from} replace />
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
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
                  <span>Banco de dados Supabase</span>
                </div>
                <div className="flex items-center gap-3 text-sm text-slate-600">
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                  <span>Suporte técnico incluso</span>
                </div>
              </div>
            </div>

            {/* Features */}
            <div className="space-y-8">
              <div className="bg-gradient-to-r from-compia-green/10 to-compia-green/20 border border-compia-green/30 rounded-xl p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-compia-green/20 rounded-lg">
                    <BarChart3 className="w-5 h-5 text-compia-green" />
                  </div>
                  <h3 className="font-semibold text-compia-green">
                    Banco Supabase Integrado
                  </h3>
                </div>
                <p className="text-compia-green/80 text-sm mb-3">
                  Sistema agora usa PostgreSQL com Supabase para máxima performance,
                  segurança e escalabilidade
                </p>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="font-bold text-2xl text-compia-green">99.9%</span>
                    <p className="text-compia-green/80">Uptime garantido</p>
                  </div>
                  <div>
                    <span className="font-bold text-2xl text-compia-green">RLS</span>
                    <p className="text-compia-green/80">Segurança por linha</p>
                  </div>
                </div>
              </div>

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
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}