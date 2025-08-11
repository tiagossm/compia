import { useState, useEffect } from 'react';
import { useAuth } from '@getmocha/users-service/react';
import { ExtendedMochaUser } from '@/shared/user-types';
import { Building2, ChevronDown, Check } from 'lucide-react';

interface Organization {
  id: number;
  name: string;
  type: string;
  is_active: boolean;
}

interface OrganizationSelectorProps {
  selectedOrgId?: number | null;
  onOrganizationChange: (orgId: number | null) => void;
  showAllOption?: boolean;
  className?: string;
}

export default function OrganizationSelector({ 
  selectedOrgId, 
  onOrganizationChange, 
  showAllOption = true,
  className = "" 
}: OrganizationSelectorProps) {
  const { user } = useAuth();
  const extendedUser = user as ExtendedMochaUser;
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchOrganizations();
  }, []);

  const fetchOrganizations = async () => {
    try {
      const response = await fetch('/api/organizations');
      if (response.ok) {
        const data = await response.json();
        let availableOrgs = data.organizations || [];
        
        // For non-admin users, filter by their organization
        if (extendedUser?.profile?.role !== 'admin' && extendedUser?.profile?.organization_id) {
          availableOrgs = availableOrgs.filter((org: Organization) => 
            org.id === extendedUser.profile?.organization_id
          );
        }
        
        setOrganizations(availableOrgs);
      }
    } catch (error) {
      console.error('Error fetching organizations:', error);
    } finally {
      setLoading(false);
    }
  };

  const getSelectedOrganization = () => {
    if (selectedOrgId === null || selectedOrgId === undefined) {
      return showAllOption ? 'Todas as Organizações' : 'Selecionar Organização';
    }
    const org = organizations.find(o => o.id === selectedOrgId);
    return org ? org.name : 'Organização não encontrada';
  };

  const getOrganizationTypeLabel = (type: string) => {
    switch (type) {
      case 'company': return 'Empresa';
      case 'consultancy': return 'Consultoria';
      case 'client': return 'Cliente';
      default: return type;
    }
  };

  // Auto-select single organization in useEffect to avoid setState during render
  useEffect(() => {
    if (organizations.length === 1 && extendedUser?.profile?.role !== 'admin' && selectedOrgId !== organizations[0].id) {
      onOrganizationChange(organizations[0].id);
    }
  }, [organizations, extendedUser?.profile?.role, selectedOrgId, onOrganizationChange]);

  if (loading) {
    return (
      <div className={`animate-pulse ${className}`}>
        <div className="h-10 bg-slate-200 rounded-lg"></div>
      </div>
    );
  }

  if (organizations.length === 0) {
    return (
      <div className={`text-sm text-slate-500 ${className}`}>
        Nenhuma organização disponível
      </div>
    );
  }

  return (
    <div className={`relative ${className}`}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-4 py-2 bg-white border border-slate-300 rounded-lg text-left hover:bg-slate-50 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
      >
        <div className="flex items-center">
          <Building2 className="w-4 h-4 text-slate-400 mr-2" />
          <span className="text-sm font-medium text-slate-900 truncate">
            {getSelectedOrganization()}
          </span>
        </div>
        <ChevronDown className="w-4 h-4 text-slate-400 ml-2 flex-shrink-0" />
      </button>

      {isOpen && (
        <>
          <div 
            className="fixed inset-0 z-10" 
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute top-full mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg z-20 max-h-60 overflow-y-auto">
            {showAllOption && extendedUser?.profile?.role === 'admin' && (
              <button
                onClick={() => {
                  onOrganizationChange(null);
                  setIsOpen(false);
                }}
                className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-slate-50 transition-colors border-b border-slate-100"
              >
                <div className="flex items-center">
                  <Building2 className="w-4 h-4 text-slate-400 mr-3" />
                  <div>
                    <span className="text-sm font-medium text-slate-900">
                      Todas as Organizações
                    </span>
                    <p className="text-xs text-slate-500">
                      Ver dados de todas as organizações
                    </p>
                  </div>
                </div>
                {(selectedOrgId === null || selectedOrgId === undefined) && (
                  <Check className="w-4 h-4 text-blue-600" />
                )}
              </button>
            )}

            {organizations.map((org) => (
              <button
                key={org.id}
                onClick={() => {
                  onOrganizationChange(org.id);
                  setIsOpen(false);
                }}
                className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center">
                  <div className={`w-3 h-3 rounded-full mr-3 ${
                    org.is_active ? 'bg-green-400' : 'bg-red-400'
                  }`} />
                  <div>
                    <span className="text-sm font-medium text-slate-900">
                      {org.name}
                    </span>
                    <p className="text-xs text-slate-500">
                      {getOrganizationTypeLabel(org.type)}
                    </p>
                  </div>
                </div>
                {selectedOrgId === org.id && (
                  <Check className="w-4 h-4 text-blue-600" />
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
