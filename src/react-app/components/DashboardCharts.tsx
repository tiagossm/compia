import { 
  ResponsiveContainer, 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  Legend
} from 'recharts';

interface DashboardChartsProps {
  stats: {
    total: number;
    pending: number;
    inProgress: number;
    completed: number;
  } | null;
  actionSummary: {
    total_actions: number;
    pending_actions: number;
    in_progress_actions: number;
    completed_actions: number;
    overdue_actions: number;
    high_priority_pending: number;
  } | null;
}

export default function DashboardCharts({ stats, actionSummary }: DashboardChartsProps) {
  if (!stats || !actionSummary) {
    return null;
  }

  // Inspection status data for pie chart
  const inspectionData = [
    { name: 'Concluídas', value: stats.completed, color: '#10b981' },
    { name: 'Em Andamento', value: stats.inProgress, color: '#3b82f6' },
    { name: 'Pendentes', value: stats.pending, color: '#f59e0b' },
  ].filter(item => item.value > 0);

  // Action plan progress data
  const actionData = [
    { name: 'Concluídas', value: actionSummary.completed_actions, color: '#10b981' },
    { name: 'Em Andamento', value: actionSummary.in_progress_actions, color: '#3b82f6' },
    { name: 'Pendentes', value: actionSummary.pending_actions, color: '#f59e0b' },
    { name: 'Atrasadas', value: actionSummary.overdue_actions, color: '#ef4444' },
  ].filter(item => item.value > 0);

  // Monthly trend simulation (in real app, this would come from API)
  const trendData = [
    { month: 'Jan', inspections: 12, actions: 28 },
    { month: 'Fev', inspections: 15, actions: 32 },
    { month: 'Mar', inspections: 18, actions: 41 },
    { month: 'Abr', inspections: 22, actions: 38 },
    { month: 'Mai', inspections: 25, actions: 45 },
    { month: 'Jun', inspections: stats.total, actions: actionSummary.total_actions },
  ];

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-3 border border-slate-200 rounded-lg shadow-lg">
          <p className="font-medium text-slate-900">{label}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} className="text-sm" style={{ color: entry.color }}>
              {entry.dataKey}: {entry.value}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Inspection Status Distribution */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">
          Distribuição de Inspeções
        </h3>
        {inspectionData.length > 0 ? (
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={inspectionData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                paddingAngle={5}
                dataKey="value"
              >
                {inspectionData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip 
                formatter={(value: any) => [value, 'Inspeções']}
                contentStyle={{
                  backgroundColor: 'white',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px'
                }}
              />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-64 flex items-center justify-center text-slate-500">
            Nenhum dado disponível
          </div>
        )}
      </div>

      {/* Action Plan Status */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">
          Status dos Planos de Ação
        </h3>
        {actionData.length > 0 ? (
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={actionData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis 
                dataKey="name" 
                tick={{ fontSize: 12 }}
                stroke="#64748b"
              />
              <YAxis 
                tick={{ fontSize: 12 }}
                stroke="#64748b"
              />
              <Tooltip content={<CustomTooltip />} />
              <Bar 
                dataKey="value" 
                radius={[4, 4, 0, 0]}
                fill="#3b82f6"
              >
                {actionData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-64 flex items-center justify-center text-slate-500">
            Nenhum dado disponível
          </div>
        )}
      </div>

      {/* Monthly Trend */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 lg:col-span-2">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">
          Tendência Mensal
        </h3>
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={trendData}>
            <defs>
              <linearGradient id="inspectionsGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="actionsGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.1} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis 
              dataKey="month" 
              tick={{ fontSize: 12 }}
              stroke="#64748b"
            />
            <YAxis 
              tick={{ fontSize: 12 }}
              stroke="#64748b"
            />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey="inspections"
              stroke="#3b82f6"
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#inspectionsGradient)"
              name="Inspeções"
            />
            <Area
              type="monotone"
              dataKey="actions"
              stroke="#10b981"
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#actionsGradient)"
              name="Ações"
            />
            <Legend />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
