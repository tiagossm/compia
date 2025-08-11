import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router';
import Layout from '@/react-app/components/Layout';
import OrganizationSelector from '@/react-app/components/OrganizationSelector';
import CSVExportImport from '@/react-app/components/CSVExportImport';
import { 
  Plus, 
  Search, 
  Filter,
  Calendar,
  User,
  MapPin,
  Clock,
  Play,
  CheckCircle2,
  AlertCircle,
  Edit,
  Trash2
} from 'lucide-react';
import { InspectionType } from '@/shared/types';

export default function Inspections() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [inspections, setInspections] = useState<InspectionType[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedOrgId, setSelectedOrgId] = useState<number | null>(
    searchParams.get('org') ? parseInt(searchParams.get('org')!) : null
  );
  const [showDeleteModal, setShowDeleteModal] = useState<number | null>(null);
  const [csvLoading, setCsvLoading] = useState(false);

  useEffect(() => {
    fetchInspections();
  }, [selectedOrgId]);

  useEffect(() => {
    // Update URL params when organization changes
    if (selectedOrgId) {
      setSearchParams({ org: selectedOrgId.toString() });
    } else {
      setSearchParams({});
    }
  }, [selectedOrgId, setSearchParams]);

  const fetchInspections = () => {
    let url = '/api/inspections';
    if (selectedOrgId) {
      url += `?organization_id=${selectedOrgId}`;
    }
    
    fetch(url)
      .then(res => res.json())
      .then(data => {
        setInspections(data.inspections || []);
        setLoading(false);
      })
      .catch(error => {
        console.error('Erro ao carregar inspeções:', error);
        setLoading(false);
      });
  };

  const handleDeleteInspection = async (id: number) => {
    try {
      const response = await fetch(`/api/inspections/${id}`, {
        method: 'DELETE'
      });
      
      if (response.ok) {
        setInspections(prev => prev.filter(inspection => inspection.id !== id));
        setShowDeleteModal(null);
        alert('Inspeção excluída com sucesso!');
      } else {
        throw new Error('Erro ao excluir inspeção');
      }
    } catch (error) {
      console.error('Erro ao excluir inspeção:', error);
      alert('Erro ao excluir inspeção. Tente novamente.');
    }
  };

  const handleExportInspections = async () => {
    setCsvLoading(true);
    try {
      const csvData = filteredInspections.map(inspection => ({
        titulo: inspection.title,
        descricao: inspection.description || '',
        local: inspection.location,
        empresa: inspection.company_name || '',
        tecnico_nome: inspection.inspector_name,
        tecnico_email: inspection.inspector_email || '',
        status: getStatusLabel(inspection.status),
        prioridade: inspection.priority,
        data_agendada: inspection.scheduled_date || '',
        data_criacao: new Date(inspection.created_at).toLocaleDateString('pt-BR'),
        endereco: inspection.address || '',
        cep: inspection.cep || ''
      }));

      const headers = 'titulo,descricao,local,empresa,tecnico_nome,tecnico_email,status,prioridade,data_agendada,data_criacao,endereco,cep';
      const csvContent = [
        headers,
        ...csvData.map(row => Object.values(row).map(val => `"${val}"`).join(','))
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `inspecoes_${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error('Erro ao exportar inspeções:', error);
      alert('Erro ao exportar dados. Tente novamente.');
    } finally {
      setCsvLoading(false);
    }
  };

  const handleImportInspections = async (data: any[]) => {
    setCsvLoading(true);
    try {
      for (const row of data) {
        const inspectionData = {
          title: row.titulo || row.title,
          description: row.descricao || row.description,
          location: row.local || row.location,
          company_name: row.empresa || row.company_name,
          inspector_name: row.tecnico_nome || row.inspector_name,
          inspector_email: row.tecnico_email || row.inspector_email,
          priority: row.prioridade || row.priority || 'media',
          scheduled_date: row.data_agendada || row.scheduled_date,
          address: row.endereco || row.address,
          cep: row.cep,
          organization_id: selectedOrgId
        };

        const response = await fetch('/api/inspections', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(inspectionData)
        });

        if (!response.ok) {
          throw new Error(`Erro ao importar inspeção: ${inspectionData.title}`);
        }
      }

      await fetchInspections();
      alert(`${data.length} inspeções importadas com sucesso!`);
    } catch (error) {
      console.error('Erro ao importar inspeções:', error);
      alert('Erro ao importar dados. Verifique o formato e tente novamente.');
    } finally {
      setCsvLoading(false);
    }
  };

  const filteredInspections = inspections.filter(inspection => {
    const matchesSearch = inspection.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         inspection.location.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         inspection.inspector_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (inspection.company_name && inspection.company_name.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesStatus = statusFilter === 'all' || inspection.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pendente':
        return <Clock className="w-4 h-4 text-yellow-500" />;
      case 'em_andamento':
        return <Play className="w-4 h-4 text-blue-500" />;
      case 'concluida':
        return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case 'cancelada':
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      default:
        return <Clock className="w-4 h-4 text-gray-500" />;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'pendente':
        return 'Pendente';
      case 'em_andamento':
        return 'Em Andamento';
      case 'concluida':
        return 'Concluída';
      case 'cancelada':
        return 'Cancelada';
      default:
        return status;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'baixa':
        return 'bg-green-100 text-green-800';
      case 'media':
        return 'bg-yellow-100 text-yellow-800';
      case 'alta':
        return 'bg-orange-100 text-orange-800';
      case 'critica':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
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
            <h1 className="font-heading text-3xl font-bold text-slate-900">Inspeções</h1>
            <p className="text-slate-600 mt-1">
              Gerencie suas inspeções de segurança do trabalho
            </p>
          </div>
          <Link
            to="/inspections/new"
            className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors duration-200"
          >
            <Plus className="w-4 h-4 mr-2" />
            Nova Inspeção
          </Link>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="lg:col-span-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
                <input
                  type="text"
                  placeholder="Buscar por título, empresa, local ou técnico..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
            
            <div>
              <OrganizationSelector
                selectedOrgId={selectedOrgId}
                onOrganizationChange={setSelectedOrgId}
                showAllOption={true}
              />
            </div>

            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-slate-400" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="all">Todos os Status</option>
                <option value="pendente">Pendente</option>
                <option value="em_andamento">Em Andamento</option>
                <option value="concluida">Concluída</option>
                <option value="cancelada">Cancelada</option>
              </select>
            </div>
          </div>
        </div>

        {/* CSV Export/Import */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">
            Importar/Exportar Inspeções
          </h3>
          <CSVExportImport
            type="inspections"
            onExport={handleExportInspections}
            onImport={handleImportInspections}
            isLoading={csvLoading}
          />
        </div>

        {/* Inspections List */}
        <div className="space-y-4">
          {filteredInspections.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 text-center">
              <AlertCircle className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-500 font-medium">
                {inspections.length === 0 
                  ? 'Nenhuma inspeção encontrada' 
                  : 'Nenhuma inspeção corresponde aos filtros'
                }
              </p>
              <p className="text-slate-400 text-sm mt-1">
                {inspections.length === 0 
                  ? 'Crie sua primeira inspeção para começar'
                  : 'Tente ajustar os filtros ou termo de busca'
                }
              </p>
            </div>
          ) : (
            filteredInspections.map((inspection) => (
              <div key={inspection.id} className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 hover:shadow-md transition-shadow duration-200">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="font-heading text-lg font-semibold text-slate-900">
                        {inspection.title}
                      </h3>
                      <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full ${getPriorityColor(inspection.priority)}`}>
                        {inspection.priority.charAt(0).toUpperCase() + inspection.priority.slice(1)}
                      </span>
                    </div>
                    
                    {inspection.description && (
                      <p className="text-slate-600 mb-3 line-clamp-2">
                        {inspection.description}
                      </p>
                    )}
                    
                    <div className="flex flex-wrap items-center gap-4 text-sm text-slate-500">
                      {inspection.company_name && (
                        <div className="flex items-center gap-1">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                          </svg>
                          {inspection.company_name}
                        </div>
                      )}
                      <div className="flex items-center gap-1">
                        <MapPin className="w-4 h-4" />
                        {inspection.location}
                      </div>
                      <div className="flex items-center gap-1">
                        <User className="w-4 h-4" />
                        {inspection.inspector_name}
                      </div>
                      {inspection.scheduled_date && (
                        <div className="flex items-center gap-1">
                          <Calendar className="w-4 h-4" />
                          {new Date(inspection.scheduled_date).toLocaleDateString('pt-BR')}
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 px-3 py-1 bg-slate-50 rounded-lg">
                      {getStatusIcon(inspection.status)}
                      <span className="text-sm font-medium text-slate-700">
                        {getStatusLabel(inspection.status)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Link
                        to={`/inspections/${inspection.id}/edit`}
                        className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors duration-200"
                        title="Editar inspeção"
                      >
                        <Edit className="w-4 h-4" />
                      </Link>
                      <button
                        onClick={() => setShowDeleteModal(inspection.id!)}
                        className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors duration-200"
                        title="Excluir inspeção"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                      <Link
                        to={`/inspections/${inspection.id}`}
                        className="px-4 py-2 text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors duration-200"
                      >
                        Ver Detalhes
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Delete Confirmation Modal */}
        {showDeleteModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
              <div className="flex items-center gap-4 mb-4">
                <div className="p-3 bg-red-100 rounded-full">
                  <AlertCircle className="w-6 h-6 text-red-600" />
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
                Tem certeza que deseja excluir esta inspeção? Todos os dados relacionados serão permanentemente removidos.
              </p>
              
              <div className="flex items-center justify-end gap-3">
                <button
                  onClick={() => setShowDeleteModal(null)}
                  className="px-4 py-2 text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => handleDeleteInspection(showDeleteModal)}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                >
                  Excluir Inspeção
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
