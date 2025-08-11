import { useState, useEffect } from 'react';
import { useAuth } from '@getmocha/users-service/react';
import Layout from '@/react-app/components/Layout';

import OrganizationHierarchy from '@/react-app/components/OrganizationHierarchy';
import UserInvitationModal from '@/react-app/components/UserInvitationModal';
import NewOrganizationModal from '@/react-app/components/NewOrganizationModal';
import { 
  Plus, 
  Building2,
  Trash2,
  Users,
  Crown,
  Activity,
  UserPlus,
  Settings as SettingsIcon
} from 'lucide-react';
import { ExtendedMochaUser, Organization, USER_ROLES, ORGANIZATION_LEVELS } from '@/shared/user-types';

interface ActivityLog {
  id: number;
  action_type: string;
  action_description: string;
  user_name: string;
  created_at: string;
}

export default function Organizations() {
  const { user } = useAuth();
  const extendedUser = user as ExtendedMochaUser;
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);
  
  const [showOrgModal, setShowOrgModal] = useState(false);
  const [showNewOrgModal, setShowNewOrgModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState<number | null>(null);
  const [showInviteModal, setShowInviteModal] = useState(false);
  
  const [activeTab, setActiveTab] = useState('hierarchy');
  const [activityLog, setActivityLog] = useState<ActivityLog[]>([]);
  const [orgUsers, setOrgUsers] = useState<any[]>([]);
  const [pendingInvitations, setPendingInvitations] = useState<any[]>([]);

  const [formData, setFormData] = useState({
    name: '',
    type: 'company',
    description: '',
    contact_email: '',
    contact_phone: '',
    address: '',
    parent_organization_id: '',
    subscription_plan: 'basic',
    max_users: 50,
    max_subsidiaries: 0
  });

  useEffect(() => {
    fetchOrganizations();
  }, []);

  const fetchOrganizations = async () => {
    try {
      const response = await fetch('/api/multi-tenant/organizations/hierarchy');
      if (response.ok) {
        const data = await response.json();
        setOrganizations(data.organizations || []);
      }
    } catch (error) {
      console.error('Error fetching organizations:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchOrganizationDetails = async (orgId: number) => {
    try {
      // Fetch users
      const usersResponse = await fetch(`/api/multi-tenant/organizations/${orgId}/users`);
      if (usersResponse.ok) {
        const usersData = await usersResponse.json();
        setOrgUsers(usersData.users || []);
        setPendingInvitations(usersData.pending_invitations || []);
      }

      // Fetch activity log
      const activityResponse = await fetch(`/api/multi-tenant/organizations/${orgId}/activity`);
      if (activityResponse.ok) {
        const activityData = await activityResponse.json();
        setActivityLog(activityData.activities || []);
      }
    } catch (error) {
      console.error('Error fetching organization details:', error);
    }
  };

  const handleOrganizationSelect = (org: Organization) => {
    setSelectedOrg(org);
    setActiveTab('details');
    fetchOrganizationDetails(org.id);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const method = selectedOrg ? 'PUT' : 'POST';
      const url = selectedOrg ? `/api/multi-tenant/organizations/${selectedOrg.id}` : '/api/multi-tenant/organizations/hierarchy';
      
      const requestBody = { ...formData };
      if (requestBody.parent_organization_id === '') {
        requestBody.parent_organization_id = undefined as any;
      }
      
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      if (response.ok) {
        // Close modal first
        setShowOrgModal(false);
        
        // Reset form and selected org
        setSelectedOrg(null);
        setFormData({
          name: '',
          type: 'company',
          description: '',
          contact_email: '',
          contact_phone: '',
          address: '',
          parent_organization_id: '',
          subscription_plan: 'basic',
          max_users: 50,
          max_subsidiaries: 0
        });
        
        // Show success message
        alert(`Organização ${selectedOrg ? 'atualizada' : 'criada'} com sucesso!`);
        
        // Refresh organizations list
        await fetchOrganizations();
      } else {
        const error = await response.json();
        throw new Error(error.error || `Erro ao ${selectedOrg ? 'atualizar' : 'criar'} organização`);
      }
    } catch (error) {
      console.error('Error saving organization:', error);
      alert(error instanceof Error ? error.message : `Erro ao ${selectedOrg ? 'atualizar' : 'criar'} organização. Tente novamente.`);
    }
  };

  const handleEdit = (org: Organization) => {
    setSelectedOrg(org);
    setFormData({
      name: org.name,
      type: org.type,
      description: org.description || '',
      contact_email: org.contact_email || '',
      contact_phone: org.contact_phone || '',
      address: org.address || '',
      parent_organization_id: org.parent_organization_id?.toString() || '',
      subscription_plan: org.subscription_plan || 'basic',
      max_users: org.max_users || 50,
      max_subsidiaries: org.max_subsidiaries || 0
    });
    setShowOrgModal(true);
  };

  const handleDelete = async (id: number) => {
    try {
      const response = await fetch(`/api/organizations/${id}`, {
        method: 'DELETE'
      });
      
      if (response.ok) {
        // Close modal first
        setShowDeleteModal(null);
        
        // Show success message
        alert('Organização excluída com sucesso!');
        
        // Clear selected org if it was deleted
        if (selectedOrg && selectedOrg.id === id) {
          setSelectedOrg(null);
          setActiveTab('hierarchy');
        }
        
        // Refresh organizations list
        await fetchOrganizations();
      } else {
        throw new Error('Erro ao excluir organização');
      }
    } catch (error) {
      console.error('Error deleting organization:', error);
      alert('Erro ao excluir organização. Tente novamente.');
    }
  };

  

  const getLevelLabel = (level: string) => {
    switch (level) {
      case ORGANIZATION_LEVELS.MASTER: return 'Master';
      case ORGANIZATION_LEVELS.COMPANY: return 'Empresa';
      case ORGANIZATION_LEVELS.SUBSIDIARY: return 'Subsidiária';
      default: return level;
    }
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case USER_ROLES.SYSTEM_ADMIN: return 'Admin Sistema';
      case USER_ROLES.ORG_ADMIN: return 'Admin Organização';
      case USER_ROLES.MANAGER: return 'Gerente';
      case USER_ROLES.INSPECTOR: return 'Técnico';
      case USER_ROLES.CLIENT: return 'Cliente';
      default: return role;
    }
  };

  const getAvailableParentOrganizations = () => {
    if (extendedUser?.profile?.role === USER_ROLES.SYSTEM_ADMIN) {
      return organizations.filter(org => 
        org.organization_level !== ORGANIZATION_LEVELS.SUBSIDIARY
      );
    } else if (extendedUser?.profile?.role === USER_ROLES.ORG_ADMIN) {
      return organizations.filter(org => 
        org.id === extendedUser.profile?.managed_organization_id
      );
    }
    return [];
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-heading text-3xl font-bold text-slate-900">
              Gestão Organizacional
            </h1>
            <p className="text-slate-600 mt-1">
              {extendedUser?.profile?.role === USER_ROLES.SYSTEM_ADMIN 
                ? 'Gerencie todo o sistema multi-empresa' 
                : 'Gerencie sua organização e subsidiárias'}
            </p>
          </div>
          <button
            onClick={() => setShowNewOrgModal(true)}
            className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4 mr-2" />
            {extendedUser?.profile?.role === USER_ROLES.SYSTEM_ADMIN 
              ? 'Nova Empresa Cliente' 
              : extendedUser?.profile?.role === USER_ROLES.ORG_ADMIN
              ? 'Nova Subsidiária'
              : 'Nova Organização'}
          </button>
        </div>

        {/* Tabs */}
        <div className="border-b border-slate-200">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setActiveTab('hierarchy')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'hierarchy'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              }`}
            >
              Hierarquia
            </button>
            {selectedOrg && (
              <>
                <button
                  onClick={() => setActiveTab('details')}
                  className={`py-2 px-1 border-b-2 font-medium text-sm ${
                    activeTab === 'details'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                  }`}
                >
                  Detalhes
                </button>
                <button
                  onClick={() => setActiveTab('users')}
                  className={`py-2 px-1 border-b-2 font-medium text-sm ${
                    activeTab === 'users'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                  }`}
                >
                  Usuários
                </button>
                <button
                  onClick={() => setActiveTab('activity')}
                  className={`py-2 px-1 border-b-2 font-medium text-sm ${
                    activeTab === 'activity'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                  }`}
                >
                  Atividade
                </button>
              </>
            )}
          </nav>
        </div>

        {/* Tab Content */}
        {activeTab === 'hierarchy' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1">
              <OrganizationHierarchy 
                onOrganizationSelect={handleOrganizationSelect}
                selectedOrganizationId={selectedOrg?.id}
                onNewOrganization={() => setShowNewOrgModal(true)}
              />
            </div>
            
            <div className="lg:col-span-2">
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                <h3 className="text-lg font-semibold text-slate-900 mb-4">
                  Visão Geral do Sistema
                </h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 bg-blue-50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <Crown className="w-8 h-8 text-yellow-600" />
                      <div>
                        <h4 className="font-medium text-slate-900">
                          Organizações Master
                        </h4>
                        <p className="text-2xl font-bold text-blue-600">
                          {organizations.filter(o => o.organization_level === ORGANIZATION_LEVELS.MASTER).length}
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="p-4 bg-green-50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <Building2 className="w-8 h-8 text-blue-600" />
                      <div>
                        <h4 className="font-medium text-slate-900">
                          Empresas Cliente
                        </h4>
                        <p className="text-2xl font-bold text-green-600">
                          {organizations.filter(o => o.organization_level === ORGANIZATION_LEVELS.COMPANY).length}
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="p-4 bg-purple-50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <Building2 className="w-8 h-8 text-green-600" />
                      <div>
                        <h4 className="font-medium text-slate-900">
                          Subsidiárias
                        </h4>
                        <p className="text-2xl font-bold text-purple-600">
                          {organizations.filter(o => o.organization_level === ORGANIZATION_LEVELS.SUBSIDIARY).length}
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="p-4 bg-slate-50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <Users className="w-8 h-8 text-slate-600" />
                      <div>
                        <h4 className="font-medium text-slate-900">
                          Total de Usuários
                        </h4>
                        <p className="text-2xl font-bold text-slate-600">
                          {organizations.reduce((sum, org) => sum + (org.user_count || 0), 0)}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
                
                {!selectedOrg && (
                  <div className="mt-6 p-4 bg-slate-50 rounded-lg">
                    <p className="text-slate-600 text-center">
                      Selecione uma organização na hierarquia para ver mais detalhes
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'details' && selectedOrg && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-slate-100 rounded-xl">
                  {selectedOrg.organization_level === ORGANIZATION_LEVELS.MASTER ? (
                    <Crown className="w-8 h-8 text-yellow-600" />
                  ) : (
                    <Building2 className="w-8 h-8 text-blue-600" />
                  )}
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-slate-900">{selectedOrg.name}</h2>
                  <p className="text-slate-600">{getLevelLabel(selectedOrg.organization_level)}</p>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                {extendedUser?.profile?.can_manage_users && (
                  <button
                    onClick={() => setShowInviteModal(true)}
                    className="flex items-center px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    <UserPlus className="w-4 h-4 mr-2" />
                    Convidar Usuário
                  </button>
                )}
                <button
                  onClick={() => handleEdit(selectedOrg)}
                  className="flex items-center px-3 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  <SettingsIcon className="w-4 h-4 mr-2" />
                  Configurações
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="p-4 bg-blue-50 rounded-lg">
                <h3 className="font-medium text-slate-900 mb-2">Usuários</h3>
                <p className="text-2xl font-bold text-blue-600">{selectedOrg.user_count || 0}</p>
                <p className="text-sm text-slate-600">Máximo: {selectedOrg.max_users}</p>
              </div>
              
              <div className="p-4 bg-green-50 rounded-lg">
                <h3 className="font-medium text-slate-900 mb-2">Subsidiárias</h3>
                <p className="text-2xl font-bold text-green-600">{selectedOrg.subsidiary_count || 0}</p>
                <p className="text-sm text-slate-600">Máximo: {selectedOrg.max_subsidiaries}</p>
              </div>
              
              <div className="p-4 bg-purple-50 rounded-lg">
                <h3 className="font-medium text-slate-900 mb-2">Plano</h3>
                <p className="text-lg font-bold text-purple-600 capitalize">{selectedOrg.subscription_plan}</p>
                <p className="text-sm text-slate-600">Status: {selectedOrg.subscription_status}</p>
              </div>
              
              <div className="p-4 bg-slate-50 rounded-lg">
                <h3 className="font-medium text-slate-900 mb-2">Criada em</h3>
                <p className="text-lg font-bold text-slate-600">
                  {new Date(selectedOrg.created_at).toLocaleDateString('pt-BR')}
                </p>
              </div>
            </div>

            {selectedOrg.description && (
              <div className="mt-6 p-4 bg-slate-50 rounded-lg">
                <h3 className="font-medium text-slate-900 mb-2">Descrição</h3>
                <p className="text-slate-700">{selectedOrg.description}</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'users' && selectedOrg && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-slate-900">
                  Usuários da Organização
                </h3>
                {extendedUser?.profile?.can_manage_users && (
                  <button
                    onClick={() => setShowInviteModal(true)}
                    className="flex items-center px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    <UserPlus className="w-4 h-4 mr-2" />
                    Convidar Usuário
                  </button>
                )}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-medium text-slate-900">
                        Usuário
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-slate-900">
                        Perfil
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-slate-900">
                        Status
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-slate-900">
                        Último Acesso
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {orgUsers.map((user) => (
                      <tr key={user.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3">
                          <div className="flex items-center">
                            {user.avatar_url ? (
                              <img
                                src={user.avatar_url}
                                alt={user.name}
                                className="w-8 h-8 rounded-full mr-3"
                              />
                            ) : (
                              <div className="w-8 h-8 bg-slate-200 rounded-full flex items-center justify-center mr-3">
                                <span className="text-slate-600 font-medium text-sm">
                                  {user.name.charAt(0).toUpperCase()}
                                </span>
                              </div>
                            )}
                            <div>
                              <p className="font-medium text-slate-900">{user.name}</p>
                              <p className="text-sm text-slate-500">{user.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800">
                            {getRoleLabel(user.role)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded-full ${
                            user.is_active 
                              ? 'bg-green-100 text-green-800' 
                              : 'bg-red-100 text-red-800'
                          }`}>
                            {user.is_active ? 'Ativo' : 'Inativo'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-600">
                          {user.last_login_at 
                            ? new Date(user.last_login_at).toLocaleDateString('pt-BR')
                            : 'Nunca'
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {pendingInvitations.length > 0 && (
                <div className="mt-6">
                  <h4 className="font-medium text-slate-900 mb-3">Convites Pendentes</h4>
                  <div className="space-y-2">
                    {pendingInvitations.map((invitation) => (
                      <div key={invitation.id} className="flex items-center justify-between p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                        <div>
                          <p className="font-medium text-slate-900">{invitation.email}</p>
                          <p className="text-sm text-slate-600">
                            Perfil: {getRoleLabel(invitation.role)} • 
                            Convidado por: {invitation.inviter_name} • 
                            Expira em: {new Date(invitation.expires_at).toLocaleDateString('pt-BR')}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={async () => {
                              const inviteUrl = `${window.location.origin}/accept-invitation/${invitation.invitation_token}`;
                              try {
                                await navigator.clipboard.writeText(inviteUrl);
                                alert('Link de convite copiado!');
                              } catch (error) {
                                prompt('Link de convite (Ctrl+C para copiar):', inviteUrl);
                              }
                            }}
                            className="px-2 py-1 text-xs text-blue-600 border border-blue-200 rounded hover:bg-blue-50"
                          >
                            Copiar Link
                          </button>
                          <span className="text-sm text-yellow-700 font-medium">Pendente</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'activity' && selectedOrg && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">
              Log de Atividades
            </h3>
            
            <div className="space-y-3">
              {activityLog.map((activity) => (
                <div key={activity.id} className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <Activity className="w-4 h-4 text-blue-600" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-slate-900">{activity.action_description}</p>
                    <div className="flex items-center gap-2 mt-1 text-xs text-slate-500">
                      <span>{activity.user_name}</span>
                      <span>•</span>
                      <span>{new Date(activity.created_at).toLocaleString('pt-BR')}</span>
                    </div>
                  </div>
                </div>
              ))}
              
              {activityLog.length === 0 && (
                <div className="text-center py-8">
                  <Activity className="w-8 h-8 text-slate-300 mx-auto mb-3" />
                  <p className="text-slate-500 font-medium">Nenhuma atividade recente</p>
                </div>
              )}
            </div>
          </div>
        )}

        

        

        {/* New Organization Modal */}
        <NewOrganizationModal
          isOpen={showNewOrgModal}
          onClose={() => setShowNewOrgModal(false)}
          onSuccess={() => {
            // Refresh organization list immediately
            fetchOrganizations();
            // If there's a selected org, refresh its details too
            if (selectedOrg) {
              fetchOrganizationDetails(selectedOrg.id);
            }
          }}
          parentOrganizations={organizations}
        />

        {/* Organization Modal */}
        {showOrgModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="font-heading text-2xl font-bold text-slate-900">
                    {selectedOrg ? 'Editar Organização' : 'Nova Organização'}
                  </h2>
                  <button
                    onClick={() => setShowOrgModal(false)}
                    className="text-slate-500 hover:text-slate-700"
                  >
                    ✕
                  </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Nome da Organização *
                      </label>
                      <input
                        type="text"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Tipo *
                      </label>
                      <select
                        value={formData.type}
                        onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        required
                      >
                        <option value="company">Empresa</option>
                        <option value="consultancy">Consultoria</option>
                        <option value="client">Cliente</option>
                      </select>
                    </div>
                  </div>

                  {/* Hierarchical fields */}
                  {(extendedUser?.profile?.role === USER_ROLES.SYSTEM_ADMIN || 
                    extendedUser?.profile?.role === USER_ROLES.ORG_ADMIN) && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                          Organização Pai
                        </label>
                        <select
                          value={formData.parent_organization_id}
                          onChange={(e) => setFormData({ ...formData, parent_organization_id: e.target.value })}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        >
                          <option value="">Nenhuma (Organização raiz)</option>
                          {getAvailableParentOrganizations().map((org) => (
                            <option key={org.id} value={org.id}>
                              {org.name}
                            </option>
                          ))}
                        </select>
                        <p className="text-xs text-slate-500 mt-1">
                          Deixe vazio para criar uma organização independente
                        </p>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                          Plano de Assinatura
                        </label>
                        <select
                          value={formData.subscription_plan}
                          onChange={(e) => setFormData({ ...formData, subscription_plan: e.target.value })}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        >
                          <option value="basic">Básico</option>
                          <option value="pro">Profissional</option>
                          <option value="enterprise">Enterprise</option>
                        </select>
                      </div>
                    </div>
                  )}

                  {/* Limits */}
                  {extendedUser?.profile?.role === USER_ROLES.SYSTEM_ADMIN && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                          Máximo de Usuários
                        </label>
                        <input
                          type="number"
                          min="1"
                          max="1000"
                          value={formData.max_users}
                          onChange={(e) => setFormData({ ...formData, max_users: parseInt(e.target.value) || 50 })}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                          Máximo de Subsidiárias
                        </label>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={formData.max_subsidiaries}
                          onChange={(e) => setFormData({ ...formData, max_subsidiaries: parseInt(e.target.value) || 0 })}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Descrição
                    </label>
                    <textarea
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      rows={3}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Email de Contato
                      </label>
                      <input
                        type="email"
                        value={formData.contact_email}
                        onChange={(e) => setFormData({ ...formData, contact_email: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Telefone de Contato
                      </label>
                      <input
                        type="tel"
                        value={formData.contact_phone}
                        onChange={(e) => setFormData({ ...formData, contact_phone: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Endereço
                    </label>
                    <input
                      type="text"
                      value={formData.address}
                      onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-4 pt-6 border-t border-slate-200">
                    <button
                      type="button"
                      onClick={() => setShowOrgModal(false)}
                      className="px-4 py-2 text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      {selectedOrg ? 'Atualizar' : 'Criar'} Organização
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* User Invitation Modal */}
        {showInviteModal && selectedOrg && (
          <UserInvitationModal
            organizationId={selectedOrg.id}
            organizationName={selectedOrg.name}
            userRole={extendedUser?.profile?.role || ''}
            isOpen={showInviteModal}
            onClose={() => setShowInviteModal(false)}
            onInviteSent={() => {
              // Refresh organization list to update user counts
              fetchOrganizations();
              // Refresh selected organization details
              if (selectedOrg) {
                fetchOrganizationDetails(selectedOrg.id);
              }
            }}
          />
        )}

        {/* Delete Confirmation Modal */}
        {showDeleteModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
              <div className="flex items-center gap-4 mb-4">
                <div className="p-3 bg-red-100 rounded-full">
                  <Trash2 className="w-6 h-6 text-red-600" />
                </div>
                <div>
                  <h3 className="font-heading text-lg font-semibold text-slate-900">
                    Confirmar Exclusão
                  </h3>
                  <p className="text-slate-600 text-sm">
                    Esta ação não pode ser desfeita.
                  </p>
                </div>
              </div>
              
              <p className="text-slate-700 mb-6">
                Tem certeza que deseja excluir esta organização? Todos os usuários vinculados perderão essa associação.
              </p>
              
              <div className="flex items-center justify-end gap-3">
                <button
                  onClick={() => setShowDeleteModal(null)}
                  className="px-4 py-2 text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => handleDelete(showDeleteModal)}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                >
                  Excluir Organização
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
