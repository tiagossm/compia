import { useState, useEffect } from 'react';
import { useAuth } from '@getmocha/users-service/react';
import Layout from '@/react-app/components/Layout';
import OrganizationSelector from '@/react-app/components/OrganizationSelector';
import DashboardCharts from '@/react-app/components/DashboardCharts';
import StatsCard from '@/react-app/components/StatsCard';
import { ExtendedMochaUser } from '@/shared/user-types';
import UnassignedUserBanner from '@/react-app/components/UnassignedUserBanner';
import { 
  Shield, 
  ClipboardList, 
  Target,
  AlertTriangle,
  CheckCircle2,
  Clock,
  TrendingUp,
  Users,
  Building2,
  PlusCircle,
  FileCheck,
  BarChart3,
  Zap,
  Activity
} from 'lucide-react';

interface DashboardStats {
  total: number;
  pending: number;
  inProgress: number;
  completed: number;
}

interface ActionPlanSummary {
  total_actions: number;
  pending_actions: number;
  in_progress_actions: number;
  completed_actions: number;
  upcoming_deadline: number;
  overdue_actions: number;
  high_priority_pending: number;
  ai_generated_count: number;
}

export default function Dashboard() {
  const { user } = useAuth();
  const extendedUser = user as ExtendedMochaUser;
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [actionSummary, setActionSummary] = useState<ActionPlanSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedOrgId, setSelectedOrgId] = useState<number | null>(
    extendedUser?.profile?.organization_id || null
  );

  useEffect(() => {
    fetchDashboardData();
  }, [selectedOrgId]);

  const fetchDashboardData = async () => {
    try {
      let statsUrl = '/api/dashboard/stats';
      let actionUrl = '/api/dashboard/action-plan-summary';
      
      if (selectedOrgId) {
        statsUrl += `?organization_id=${selectedOrgId}`;
        actionUrl += `?organization_id=${selectedOrgId}`;
      }
      
      const [statsResponse, actionResponse] = await Promise.all([
        fetch(statsUrl),
        fetch(actionUrl)
      ]);

      if (statsResponse.ok) {
        const statsData = await statsResponse.json();
        setStats(statsData);
      }

      if (actionResponse.ok) {
        const actionData = await actionResponse.json();
        setActionSummary(actionData);
      }
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getCompletionRate = () => {
    if (!stats || stats.total === 0) return 0;
    return Math.round((stats.completed / stats.total) * 100);
  };

  const getActionCompletionRate = () => {
    if (!actionSummary || actionSummary.total_actions === 0) return 0;
    return Math.round((actionSummary.completed_actions / actionSummary.total_actions) * 100);
  };

  const getPerformanceInsight = () => {
    const completionRate = getCompletionRate();
    if (completionRate >= 90) return { text: 'Excelente performance!', color: 'text-green-600' };
    if (completionRate >= 70) return { text: 'Boa performance', color: 'text-blue-600' };
    if (completionRate >= 50) return { text: 'Performance moderada', color: 'text-yellow-600' };
    return { text: 'Necessita atenção', color: 'text-red-600' };
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-slate-600">Carregando insights...</p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-4">
        {/* User Assignment Alert - for users without organization */}
        {extendedUser?.profile && !extendedUser.profile.organization_id && (
          <UnassignedUserBanner 
            userEmail={user?.email || ''}
            userName={extendedUser.profile.name}
          />
        )}

        {/* Compact Header */}
        <div className="bg-gradient-to-r from-compia-blue to-compia-purple rounded-xl p-5 text-white">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-2xl font-bold">
                  Olá, {extendedUser?.profile?.name || user?.email?.split('@')[0]}! 👋
                </h1>
                <span className="text-xs bg-white/20 px-2 py-1 rounded-full">
                  {new Date().toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })}
                </span>
              </div>
              {stats && (
                <div className="flex flex-wrap items-center gap-4 text-sm text-blue-100">
                  <span className="flex items-center gap-1">
                    <TrendingUp className="w-4 h-4" />
                    {getCompletionRate()}% conclusão
                  </span>
                  <span className="flex items-center gap-1">
                    <Activity className="w-4 h-4" />
                    {getPerformanceInsight().text}
                  </span>
                </div>
              )}
            </div>
            
            {extendedUser?.profile?.role === 'system_admin' && (
              <div className="w-full sm:w-56">
                <OrganizationSelector
                  selectedOrgId={selectedOrgId}
                  onOrganizationChange={setSelectedOrgId}
                  showAllOption={true}
                  className="bg-white/20 border-white/30 text-white placeholder-purple-200"
                />
              </div>
            )}
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatsCard
            title="Total de Inspeções"
            value={stats?.total || 0}
            icon={ClipboardList}
            color="blue"
            trend={stats?.total ? { value: "+12%", isPositive: true } : undefined}
          />
          
          <StatsCard
            title="Pendentes"
            value={stats?.pending || 0}
            icon={Clock}
            color="yellow"
            trend={stats?.pending ? { value: "-5%", isPositive: true } : undefined}
          />
          
          <StatsCard
            title="Em Andamento"
            value={stats?.inProgress || 0}
            icon={TrendingUp}
            color="blue"
            trend={stats?.inProgress ? { value: "+8%", isPositive: true } : undefined}
          />
          
          <StatsCard
            title="Concluídas"
            value={stats?.completed || 0}
            icon={CheckCircle2}
            color="green"
            trend={stats?.completed ? { value: "+15%", isPositive: true } : undefined}
          />
        </div>

        {/* Priority Alerts */}
        {actionSummary && (actionSummary.overdue_actions > 0 || actionSummary.high_priority_pending > 0) && (
          <div className="bg-gradient-to-r from-red-50 to-orange-50 border border-red-200 rounded-xl p-6">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-red-100 rounded-lg">
                <AlertTriangle className="w-6 h-6 text-red-600" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-red-900 mb-2">
                  Atenção Necessária
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {actionSummary.overdue_actions > 0 && (
                    <div className="flex items-center gap-2 text-red-800">
                      <Clock className="w-4 h-4" />
                      <span className="font-medium">{actionSummary.overdue_actions}</span>
                      <span>ações atrasadas</span>
                    </div>
                  )}
                  {actionSummary.high_priority_pending > 0 && (
                    <div className="flex items-center gap-2 text-orange-800">
                      <AlertTriangle className="w-4 h-4" />
                      <span className="font-medium">{actionSummary.high_priority_pending}</span>
                      <span>ações de alta prioridade</span>
                    </div>
                  )}
                </div>
                <a
                  href="/action-plans"
                  className="inline-flex items-center px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors mt-3"
                >
                  <Target className="w-4 h-4 mr-2" />
                  Ver Planos de Ação
                </a>
              </div>
            </div>
          </div>
        )}

        {/* Charts Section */}
        {stats && actionSummary && (
          <DashboardCharts stats={stats} actionSummary={actionSummary} />
        )}

        {/* Quick Actions */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <div className="flex items-center gap-3 mb-5">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Zap className="w-5 h-5 text-blue-600" />
            </div>
            <h2 className="text-lg font-semibold text-slate-900">
              Ações Rápidas
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <a
              href="/inspections/new"
              className="flex items-center gap-4 p-4 border border-slate-200 rounded-lg hover:bg-blue-50 hover:border-blue-300 transition-all duration-200 group"
            >
              <div className="p-3 bg-compia-blue/10 rounded-lg group-hover:bg-compia-blue/20 transition-colors">
                <PlusCircle className="w-6 h-6 text-compia-blue" />
              </div>
              <div>
                <h3 className="font-medium text-slate-900">Nova Inspeção</h3>
                <p className="text-sm text-slate-600">
                  Iniciar uma nova inspeção
                </p>
              </div>
            </a>

            <a
              href="/checklists"
              className="flex items-center gap-4 p-4 border border-slate-200 rounded-lg hover:bg-purple-50 hover:border-purple-300 transition-all duration-200 group"
            >
              <div className="p-3 bg-compia-purple/10 rounded-lg group-hover:bg-compia-purple/20 transition-colors">
                <FileCheck className="w-6 h-6 text-compia-purple" />
              </div>
              <div>
                <h3 className="font-medium text-slate-900">Checklists</h3>
                <p className="text-sm text-slate-600">
                  Gerenciar templates
                </p>
              </div>
            </a>

            <a
              href="/reports"
              className="flex items-center gap-4 p-4 border border-slate-200 rounded-lg hover:bg-green-50 hover:border-green-300 transition-all duration-200 group"
            >
              <div className="p-3 bg-compia-green/10 rounded-lg group-hover:bg-compia-green/20 transition-colors">
                <BarChart3 className="w-6 h-6 text-compia-green" />
              </div>
              <div>
                <h3 className="font-medium text-slate-900">Relatórios</h3>
                <p className="text-sm text-slate-600">
                  Análise de dados
                </p>
              </div>
            </a>
          </div>
        </div>

        {/* Action Plan Summary Enhanced */}
        {actionSummary && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-orange-100 rounded-lg">
                  <Target className="w-5 h-5 text-orange-600" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">
                    Planos de Ação
                  </h2>
                  <p className="text-sm text-slate-600">
                    {getActionCompletionRate()}% de conclusão geral
                  </p>
                </div>
              </div>
              
              <a
                href="/action-plans"
                className="text-blue-600 hover:text-blue-700 text-sm font-medium"
              >
                Ver todos →
              </a>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <div className="text-center p-4 bg-slate-50 rounded-lg">
                <p className="text-2xl font-bold text-slate-900">
                  {actionSummary.total_actions}
                </p>
                <p className="text-sm text-slate-600">Total</p>
              </div>
              
              <div className="text-center p-4 bg-amber-50 rounded-lg">
                <p className="text-2xl font-bold text-amber-600">
                  {actionSummary.pending_actions}
                </p>
                <p className="text-sm text-slate-600">Pendentes</p>
              </div>
              
              <div className="text-center p-4 bg-blue-50 rounded-lg">
                <p className="text-2xl font-bold text-blue-600">
                  {actionSummary.in_progress_actions}
                </p>
                <p className="text-sm text-slate-600">Em Andamento</p>
              </div>
              
              <div className="text-center p-4 bg-green-50 rounded-lg">
                <p className="text-2xl font-bold text-green-600">
                  {actionSummary.completed_actions}
                </p>
                <p className="text-sm text-slate-600">Concluídas</p>
              </div>
            </div>

            {actionSummary.ai_generated_count > 0 && (
              <div className="p-4 bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg border border-purple-200">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-purple-100 rounded-lg">
                    <Zap className="w-4 h-4 text-purple-600" />
                  </div>
                  <div>
                    <p className="font-medium text-purple-900">
                      IA Assistente ativa
                    </p>
                    <p className="text-sm text-purple-700">
                      <span className="font-medium">{actionSummary.ai_generated_count}</span> ações 
                      foram geradas automaticamente pela IA
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Admin Quick Actions */}
        {(extendedUser?.profile?.role === 'system_admin' || extendedUser?.profile?.role === 'org_admin') && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-red-100 rounded-lg">
                <Shield className="w-5 h-5 text-red-600" />
              </div>
              <h2 className="text-lg font-semibold text-slate-900">
                Painel Administrativo
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <a
                href="/users"
                className="flex items-center gap-4 p-4 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
              >
                <div className="p-3 bg-blue-100 rounded-lg">
                  <Users className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <h3 className="font-medium text-slate-900">Gerenciar Usuários</h3>
                  <p className="text-sm text-slate-600">
                    Controle de acesso e permissões
                  </p>
                </div>
              </a>

              <a
                href="/organizations"
                className="flex items-center gap-4 p-4 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
              >
                <div className="p-3 bg-purple-100 rounded-lg">
                  <Building2 className="w-6 h-6 text-purple-600" />
                </div>
                <div>
                  <h3 className="font-medium text-slate-900">Organizações</h3>
                  <p className="text-sm text-slate-600">
                    {extendedUser?.profile?.role === 'system_admin' ? 'Empresas, consultorias e clientes' : 'Minha organização'}
                  </p>
                </div>
              </a>
            </div>
          </div>
        )}

        {/* Empty State */}
        {stats?.total === 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
            <div className="p-4 bg-slate-100 rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center">
              <ClipboardList className="w-8 h-8 text-slate-400" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900 mb-2">
              Pronto para começar?
            </h3>
            <p className="text-slate-600 mb-6 max-w-md mx-auto">
              Crie sua primeira inspeção de segurança e comece a monitorar 
              a conformidade da sua organização
            </p>
            <a
              href="/inspections/new"
              className="inline-flex items-center px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <PlusCircle className="w-5 h-5 mr-2" />
              Criar Primeira Inspeção
            </a>
          </div>
        )}
      </div>
    </Layout>
  );
}
