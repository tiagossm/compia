import { ReactNode, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { useAuth } from '@getmocha/users-service/react';
import { ExtendedMochaUser } from '@/shared/user-types';
import NotificationSystem from '@/react-app/components/NotificationSystem';
import { 
  Shield, 
  Home, 
  ClipboardList, 
  PlusCircle, 
  BarChart3,
  Settings,
  FileCheck,
  Menu,
  X,
  Target,
  Users,
  Building2,
  User,
  LogOut,
  ChevronDown,
  Activity,
  Brain
} from 'lucide-react';

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const { user, logout } = useAuth();
  const extendedUser = user as ExtendedMochaUser;
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  
  // Organized navigation with groups
  const navigationGroups = [
    {
      title: 'Principal',
      items: [
        { name: 'Dashboard', href: '/', icon: Home },
        { name: 'Inspeções', href: '/inspections', icon: ClipboardList },
        { name: 'Planos de Ação', href: '/action-plans', icon: Target },
      ]
    },
    {
      title: 'Ferramentas',
      items: [
        { name: 'Nova Inspeção', href: '/inspections/new', icon: PlusCircle },
        { name: 'Checklists', href: '/checklists', icon: FileCheck },
        { name: 'IA Generator', href: '/checklists/ai-generate', icon: Brain },
      ]
    },
    {
      title: 'Análise',
      items: [
        { name: 'Relatórios', href: '/reports', icon: BarChart3 },
        { name: 'Atividades', href: '/activity', icon: Activity },
      ]
    }
  ];

  const adminNavigation = [
    { name: 'Usuários', href: '/users', icon: Users },
    { name: 'Organizações', href: '/organizations', icon: Building2 },
  ];

  const orgAdminNavigation = [
    { name: 'Minha Organização', href: '/organizations', icon: Building2 },
  ];

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Mobile menu button */}
      <div className="lg:hidden fixed top-4 left-4 z-10">
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="p-2 bg-white shadow-lg rounded-lg border border-slate-200 text-slate-600 hover:text-slate-900 transition-colors"
        >
          {sidebarOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div 
          className="lg:hidden fixed inset-0 bg-black bg-opacity-50 z-40" 
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={`
        fixed inset-y-0 left-0 z-10 w-72 bg-white shadow-xl border-r border-slate-100 transform transition-transform duration-300 ease-in-out flex flex-col
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        {/* Sidebar Header - Logo otimizada */}
        <div className="flex items-center justify-center px-4 py-5 border-b border-slate-100" style={{ backgroundColor: '#ffffff' }}>
          <div className="flex items-center justify-center w-full">
            <img 
              src="https://mocha-cdn.com/01984e68-f701-7339-b2ea-61f4c5037843/compia_logo_SEMFUNDO.webp" 
              alt="COMPIA" 
              className="h-16 w-auto max-w-[200px] object-contain" 
            />
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden absolute top-3 right-3 p-1.5 text-slate-600 hover:text-slate-900 transition-colors bg-slate-100 rounded-md"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        {/* Navigation Groups - Container com scroll */}
        <div className="flex-1 overflow-hidden">
          <nav className="px-4 py-4 h-full overflow-y-auto">
          {navigationGroups.map((group, groupIndex) => (
            <div key={group.title} className={groupIndex > 0 ? 'mt-6' : ''}>
              <h3 className="px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
                {group.title}
              </h3>
              <ul className="space-y-1">
                {group.items.map((item) => {
                  const isActive = location.pathname === item.href || 
                    (item.href !== '/' && location.pathname.startsWith(item.href));
                  
                  return (
                    <li key={item.name}>
                      <Link
                        to={item.href}
                        onClick={() => setSidebarOpen(false)}
                        className={`
                          flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200
                          ${isActive 
                            ? 'bg-blue-600 text-white shadow-sm' 
                            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                          }
                        `}
                      >
                        <item.icon className={`w-5 h-5 mr-3 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                        {item.name}
                        {isActive && (
                          <div className="ml-auto w-2 h-2 bg-white rounded-full"></div>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}

          {/* Admin Section */}
          {(extendedUser?.profile?.role === 'system_admin' || 
            extendedUser?.profile?.role === 'admin' || 
            extendedUser?.profile?.role === 'org_admin' || 
            extendedUser?.profile?.role === 'manager') && (
            <div className="mt-8 pt-6 border-t border-slate-200">
              <h3 className="px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
                {(extendedUser?.profile?.role === 'system_admin' || extendedUser?.profile?.role === 'admin') 
                  ? 'Administração' 
                  : extendedUser?.profile?.role === 'org_admin'
                  ? 'Organização'
                  : 'Gestão'}
              </h3>
              <ul className="space-y-1">
                {/* System Admin Permissions Link */}
                {extendedUser?.profile?.role === 'system_admin' && (
                  <li>
                    <Link
                      to="/settings/permissions"
                      onClick={() => setSidebarOpen(false)}
                      className={`
                        flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200
                        ${location.pathname === '/settings/permissions'
                          ? 'bg-gradient-to-r from-indigo-50 to-indigo-100 text-indigo-700 shadow-sm border border-indigo-200' 
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                        }
                      `}
                    >
                      <Shield className={`w-5 h-5 mr-3 ${location.pathname === '/settings/permissions' ? 'text-indigo-600' : 'text-slate-400'}`} />
                      Permissões
                    </Link>
                  </li>
                )}
                
                {/* System Admin can see everything */}
                {(extendedUser?.profile?.role === 'system_admin' || extendedUser?.profile?.role === 'admin') && 
                  adminNavigation.map((item) => {
                    const isActive = location.pathname === item.href || 
                      (item.href !== '/' && location.pathname.startsWith(item.href));
                    
                    return (
                      <li key={item.name}>
                        <Link
                          to={item.href}
                          onClick={() => setSidebarOpen(false)}
                          className={`
                            flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200
                            ${isActive 
                              ? 'bg-green-600 text-white shadow-sm' 
                              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                            }
                          `}
                        >
                          <item.icon className={`w-5 h-5 mr-3 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                          {item.name}
                        </Link>
                      </li>
                    );
                  })}
                
                {/* Org Admin can see their organization management */}
                {extendedUser?.profile?.role === 'org_admin' && 
                  orgAdminNavigation.map((item) => {
                    const isActive = location.pathname === item.href || 
                      (item.href !== '/' && location.pathname.startsWith(item.href));
                    
                    return (
                      <li key={item.name}>
                        <Link
                          to={item.href}
                          onClick={() => setSidebarOpen(false)}
                          className={`
                            flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200
                            ${isActive 
                              ? 'bg-purple-600 text-white shadow-sm' 
                              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                            }
                          `}
                        >
                          <item.icon className={`w-5 h-5 mr-3 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                          {item.name}
                        </Link>
                      </li>
                    );
                  })}
                
                {/* Managers can see organizations */}
                {extendedUser?.profile?.role === 'manager' && (
                  <li>
                    <Link
                      to="/organizations"
                      onClick={() => setSidebarOpen(false)}
                      className={`
                        flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200
                        ${location.pathname.startsWith('/organizations')
                          ? 'bg-gradient-to-r from-blue-50 to-blue-100 text-blue-700 shadow-sm border border-blue-200' 
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                        }
                      `}
                    >
                      <Building2 className={`w-5 h-5 mr-3 ${location.pathname.startsWith('/organizations') ? 'text-blue-600' : 'text-slate-400'}`} />
                      Organizações
                    </Link>
                  </li>
                )}
              </ul>
            </div>
          )}

          {/* Settings at bottom */}
          <div className="mt-8 pt-6 border-t border-slate-200">
            <Link
              to="/settings"
              onClick={() => setSidebarOpen(false)}
              className={`
                flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200
                ${location.pathname === '/settings'
                  ? 'bg-gradient-to-r from-slate-50 to-slate-100 text-slate-700 shadow-sm border border-slate-200' 
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }
              `}
            >
              <Settings className={`w-5 h-5 mr-3 ${location.pathname === '/settings' ? 'text-slate-600' : 'text-slate-400'}`} />
              Configurações
            </Link>
          </div>
          </nav>
        </div>
      </div>
      
      {/* Main content */}
      <div className="lg:pl-72 transition-all duration-300">
        {/* Clean Top bar */}
        <div className="bg-white border-b border-slate-200 px-6 lg:px-7 py-2">
          <div className="flex items-center justify-end">
            <div className="flex items-center gap-2">
              <NotificationSystem />
              <div className="relative">
                <button
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  {user?.google_user_data.picture ? (
                    <img
                      src={user.google_user_data.picture}
                      alt={user.google_user_data.name || user.email}
                      className="w-6 h-6 rounded-full border border-slate-200"
                    />
                  ) : (
                    <div className="w-6 h-6 bg-slate-200 rounded-full flex items-center justify-center border border-slate-300">
                      <User className="w-3 h-3 text-slate-600" />
                    </div>
                  )}
                  <ChevronDown className="w-3 h-3 text-slate-400" />
                </button>

                {userMenuOpen && (
                  <>
                    <div 
                      className="fixed inset-0 z-40" 
                      onClick={() => setUserMenuOpen(false)}
                    />
                    <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-slate-200 z-50">
                      <div className="py-1">
                        <div className="px-4 py-3 border-b border-slate-200">
                          <p className="text-sm font-medium text-slate-900">
                            {user?.google_user_data.name || user?.email}
                          </p>
                          <p className="text-xs text-slate-500">
                            {user?.email}
                          </p>
                          <p className="text-xs text-blue-600 mt-1">
                            {extendedUser?.profile?.role === 'system_admin' ? 'Admin Sistema' :
                             extendedUser?.profile?.role === 'admin' ? 'Administrador' :
                             extendedUser?.profile?.role === 'org_admin' ? 'Admin Organização' :
                             extendedUser?.profile?.role === 'manager' ? 'Gerente' :
                             extendedUser?.profile?.role === 'inspector' ? 'Técnico' : 'Usuário'}
                          </p>
                        </div>
                        <Link
                          to="/profile"
                          onClick={() => setUserMenuOpen(false)}
                          className="flex items-center px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                        >
                          <User className="w-4 h-4 mr-3" />
                          Meu Perfil
                        </Link>
                        <Link
                          to="/settings"
                          onClick={() => setUserMenuOpen(false)}
                          className="flex items-center px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                        >
                          <Settings className="w-4 h-4 mr-3" />
                          Configurações
                        </Link>
                        <hr className="my-1" />
                        <button
                          onClick={() => {
                            setUserMenuOpen(false);
                            handleLogout();
                          }}
                          className="w-full flex items-center px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                        >
                          <LogOut className="w-4 h-4 mr-3" />
                          Sair
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        <main className="py-6 px-6 lg:px-8">
          <div className="max-w-full mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}