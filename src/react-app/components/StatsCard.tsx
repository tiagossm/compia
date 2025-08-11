import { LucideIcon } from 'lucide-react';

interface StatsCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: {
    value: string;
    isPositive: boolean;
  };
  color?: 'blue' | 'green' | 'yellow' | 'red';
}

export default function StatsCard({ title, value, icon: Icon, trend, color = 'blue' }: StatsCardProps) {
  const colorClasses = {
    blue: 'from-compia-blue to-compia-purple',
    green: 'from-compia-green to-emerald-600',
    yellow: 'from-yellow-500 to-orange-500',
    red: 'from-red-500 to-red-600',
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 hover:shadow-md transition-shadow duration-200">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-slate-600 mb-1">{title}</p>
          <p className="text-3xl font-bold text-slate-900">{value}</p>
          {trend && (
            <p className={`text-sm mt-2 ${trend.isPositive ? 'text-green-600' : 'text-red-600'}`}>
              {trend.isPositive ? '+' : ''}{trend.value}
            </p>
          )}
        </div>
        <div className={`p-3 rounded-lg bg-gradient-to-br ${colorClasses[color]}`}>
          <Icon className="w-6 h-6 text-white" />
        </div>
      </div>
    </div>
  );
}
