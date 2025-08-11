import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useAuth } from '@getmocha/users-service/react';
import Layout from '@/react-app/components/Layout';
import OrganizationSelector from '@/react-app/components/OrganizationSelector';
import { Save, ArrowLeft, FileCheck, MapPin, Navigation, Brain } from 'lucide-react';
import { ChecklistTemplate } from '@/shared/checklist-types';
import { ExtendedMochaUser } from '@/shared/user-types';

export default function NewInspection() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const extendedUser = user as ExtendedMochaUser;
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [templates, setTemplates] = useState<ChecklistTemplate[]>([]);
  const [aiAssistants, setAiAssistants] = useState<any[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<number | null>(
    searchParams.get('org') ? parseInt(searchParams.get('org')!) : 
    extendedUser?.profile?.organization_id || null
  );
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    location: '',
    company_name: '',
    cep: '',
    address: '',
    latitude: null as number | null,
    longitude: null as number | null,
    inspector_name: extendedUser?.profile?.name || '',
    inspector_email: extendedUser?.email || '',
    responsible_name: '',
    priority: 'media' as const,
    scheduled_date: '',
    template_id: '',
    action_plan_type: '5w2h' as const,
    ai_assistant_id: '',
  });

  useEffect(() => {
    fetchTemplates();
    fetchAiAssistants();
  }, []);

  const fetchAiAssistants = async () => {
    try {
      const response = await fetch('/api/ai-assistants');
      if (response.ok) {
        const data = await response.json();
        setAiAssistants(data.assistants || []);
      } else {
        console.error('Erro na resposta da API de assistentes:', response.status, response.statusText);
        setAiAssistants([]);
      }
    } catch (error) {
      console.error('Erro ao carregar assistentes de IA:', error);
      setAiAssistants([]);
    }
  };

  const fetchTemplates = async () => {
    try {
      const response = await fetch('/api/checklist/checklist-templates');
      if (response.ok) {
        const data = await response.json();
        // Filtrar apenas templates que não são pastas e têm campos
        const validTemplates = (data.templates || []).filter((template: any) => 
          !template.is_category_folder && 
          template.name && 
          template.category &&
          (template.field_count || 0) > 0
        );
        console.log('Templates carregados:', validTemplates.length, validTemplates);
        setTemplates(validTemplates);
      } else {
        console.error('Erro na resposta da API:', response.status, response.statusText);
        setTemplates([]);
      }
    } catch (error) {
      console.error('Erro ao carregar templates:', error);
      setTemplates([]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const inspectionData = {
        ...formData,
        organization_id: selectedOrgId
      };

      const response = await fetch('/api/inspections', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(inspectionData),
      });

      if (response.ok) {
        const result = await response.json();
        navigate(`/inspections/${result.id}`);
      } else {
        const errorData = await response.json().catch(() => ({}));
        console.error('API Error:', response.status, errorData);
        throw new Error(errorData.error || 'Erro ao criar inspeção');
      }
    } catch (error) {
      console.error('Erro:', error);
      alert(`Erro ao criar inspeção: ${error instanceof Error ? error.message : 'Tente novamente.'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleCEPChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const cep = e.target.value.replace(/\D/g, '');
    setFormData(prev => ({ ...prev, cep }));
    
    if (cep.length === 8) {
      try {
        const response = await fetch(`/api/cep/${cep}`);
        if (response.ok) {
          const data = await response.json();
          setFormData(prev => ({
            ...prev,
            address: data.address
          }));
        }
      } catch (error) {
        console.error('Erro ao buscar CEP:', error);
      }
    }
  };

  const getCurrentLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setFormData(prev => ({
            ...prev,
            latitude: position.coords.latitude,
            longitude: position.coords.longitude
          }));
        },
        (error) => {
          console.error('Erro ao obter localização:', error);
          alert('Erro ao obter localização GPS');
        }
      );
    } else {
      alert('Geolocalização não é suportada neste navegador');
    }
  };

  return (
    <Layout>
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/inspections')}
            className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors duration-200"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="font-heading text-3xl font-bold text-slate-900">
              Nova Inspeção
            </h1>
            <p className="text-slate-600 mt-1">
              Crie uma nova inspeção de segurança do trabalho
            </p>
          </div>
        </div>

        {/* Form */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <form onSubmit={handleSubmit} className="space-y-8">
            
            {/* Informações Gerais */}
            <div className="space-y-4">
              <div className="border-b border-slate-200 pb-2">
                <h3 className="text-lg font-semibold text-slate-900">📋 Informações Gerais</h3>
                <p className="text-sm text-slate-600">Dados básicos da inspeção</p>
              </div>
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label htmlFor="title" className="block text-sm font-medium text-slate-700 mb-2">
                    Título da Inspeção *
                  </label>
                  <input
                    type="text"
                    id="title"
                    name="title"
                    required
                    value={formData.title}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Ex: Inspeção de Equipamentos de Proteção"
                  />
                </div>
                <div>
                  <label htmlFor="description" className="block text-sm font-medium text-slate-700 mb-2">
                    Descrição
                  </label>
                  <textarea
                    id="description"
                    name="description"
                    rows={3}
                    value={formData.description}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Descreva os objetivos e escopo da inspeção..."
                  />
                </div>
              </div>
            </div>

            {/* Organização e Empresa */}
            <div className="space-y-4">
              <div className="border-b border-slate-200 pb-2">
                <h3 className="text-lg font-semibold text-slate-900">🏢 Organização e Empresa</h3>
                <p className="text-sm text-slate-600">Informações da empresa inspecionada</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Organização
                  </label>
                  <OrganizationSelector
                    selectedOrgId={selectedOrgId}
                    onOrganizationChange={setSelectedOrgId}
                    showAllOption={false}
                  />
                </div>
                <div className="md:col-span-2">
                  <label htmlFor="company_name" className="block text-sm font-medium text-slate-700 mb-2">
                    Nome da Empresa *
                  </label>
                  <input
                    type="text"
                    id="company_name"
                    name="company_name"
                    required
                    value={formData.company_name}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Ex: ABC Indústria Ltda"
                  />
                </div>
              </div>
            </div>

            {/* Localização */}
            <div className="space-y-4">
              <div className="border-b border-slate-200 pb-2">
                <h3 className="text-lg font-semibold text-slate-900">📍 Localização</h3>
                <p className="text-sm text-slate-600">Local e endereço da inspeção</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="location" className="block text-sm font-medium text-slate-700 mb-2">
                    Local *
                  </label>
                  <input
                    type="text"
                    id="location"
                    name="location"
                    required
                    value={formData.location}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Ex: Galpão A - Setor de Produção"
                  />
                </div>
                <div>
                  <label htmlFor="cep" className="block text-sm font-medium text-slate-700 mb-2">
                    CEP
                  </label>
                  <input
                    type="text"
                    id="cep"
                    name="cep"
                    value={formData.cep}
                    onChange={handleCEPChange}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="00000-000"
                    maxLength={8}
                  />
                </div>
                <div className="md:col-span-2">
                  <div className="flex items-center justify-between mb-2">
                    <label htmlFor="address" className="block text-sm font-medium text-slate-700">
                      Endereço Completo
                    </label>
                    <button
                      type="button"
                      onClick={getCurrentLocation}
                      className="flex items-center px-3 py-1 text-sm text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors"
                    >
                      <Navigation className="w-4 h-4 mr-1" />
                      Capturar GPS
                    </button>
                  </div>
                  <input
                    type="text"
                    id="address"
                    name="address"
                    value={formData.address}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Endereço será preenchido automaticamente pelo CEP ou digite manualmente"
                  />
                  {formData.latitude && formData.longitude && (
                    <div className="flex items-center gap-2 mt-2 p-2 bg-green-50 border border-green-200 rounded-lg">
                      <MapPin className="w-4 h-4 text-green-600" />
                      <span className="text-sm text-green-700 font-medium">GPS Capturado:</span>
                      <span className="text-sm text-green-600">{formData.latitude.toFixed(6)}, {formData.longitude.toFixed(6)}</span>
                      <span className="text-xs text-green-500 ml-auto">✓ Será incluído no relatório final</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Responsáveis e Agendamento */}
            <div className="space-y-4">
              <div className="border-b border-slate-200 pb-2">
                <h3 className="text-lg font-semibold text-slate-900">👨‍🔧 Responsáveis e Agendamento</h3>
                <p className="text-sm text-slate-600">Técnico responsável e cronograma</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="inspector_name" className="block text-sm font-medium text-slate-700 mb-2">
                    Nome do Técnico *
                  </label>
                  <input
                    type="text"
                    id="inspector_name"
                    name="inspector_name"
                    required
                    value={formData.inspector_name}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Nome completo do responsável"
                  />
                </div>
                <div>
                  <label htmlFor="inspector_email" className="block text-sm font-medium text-slate-700 mb-2">
                    Email do Técnico
                  </label>
                  <input
                    type="email"
                    id="inspector_email"
                    name="inspector_email"
                    value={formData.inspector_email}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="email@exemplo.com"
                  />
                </div>
                <div>
                  <label htmlFor="responsible_name" className="block text-sm font-medium text-slate-700 mb-2">
                    Nome do Responsável da Empresa
                  </label>
                  <input
                    type="text"
                    id="responsible_name"
                    name="responsible_name"
                    value={formData.responsible_name}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Nome do responsável técnico da empresa"
                  />
                </div>
                <div>
                  <label htmlFor="scheduled_date" className="block text-sm font-medium text-slate-700 mb-2">
                    Data Agendada
                  </label>
                  <input
                    type="date"
                    id="scheduled_date"
                    name="scheduled_date"
                    value={formData.scheduled_date}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label htmlFor="priority" className="block text-sm font-medium text-slate-700 mb-2">
                    Prioridade
                  </label>
                  <select
                    id="priority"
                    name="priority"
                    value={formData.priority}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="baixa">Baixa</option>
                    <option value="media">Média</option>
                    <option value="alta">Alta</option>
                    <option value="critica">Crítica</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Configuração do Checklist e IA */}
            <div className="space-y-4">
              <div className="border-b border-slate-200 pb-2">
                <h3 className="text-lg font-semibold text-slate-900">🤖 Configuração do Checklist e IA</h3>
                <p className="text-sm text-slate-600">Template, assistente de IA e tipo de plano de ação</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="ai_assistant_id" className="block text-sm font-medium text-slate-700 mb-2">
                    🤖 Assistente de IA Especializado
                  </label>
                  <select
                    id="ai_assistant_id"
                    name="ai_assistant_id"
                    value={formData.ai_assistant_id}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">Assistente Geral de Segurança do Trabalho</option>
                    {aiAssistants.map(assistant => (
                      <option key={assistant.id} value={assistant.id}>
                        {assistant.name} - {assistant.specialization}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-slate-500 mt-1">
                    Escolha um especialista para que as análises de IA sejam mais precisas e contextualizadas para esta área específica
                  </p>
                  {formData.ai_assistant_id && (
                    <div className="mt-2 p-3 bg-purple-50 border border-purple-200 rounded-lg">
                      <div className="flex items-center gap-2">
                        <Brain className="w-4 h-4 text-purple-600" />
                        <span className="text-sm font-medium text-purple-900">Especialista Selecionado</span>
                      </div>
                      {aiAssistants.find(a => a.id == formData.ai_assistant_id) && (
                        <p className="text-purple-800 text-xs mt-1">
                          {aiAssistants.find(a => a.id == formData.ai_assistant_id).description}
                        </p>
                      )}
                    </div>
                  )}
                </div>
                <div>
                  <label htmlFor="template_id" className="block text-sm font-medium text-slate-700 mb-2">
                    Template de Checklist (Opcional)
                  </label>
                  <select
                    id="template_id"
                    name="template_id"
                    value={formData.template_id}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">Nenhum template - Criar inspeção manual</option>
                    {templates.map(template => (
                      <option key={template.id} value={template.id}>
                        {template.name} - {template.category}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-slate-500 mt-1">
                    Você pode criar uma inspeção sem template e adicionar itens manualmente, ou escolher um template para pré-configurar os itens de checklist
                  </p>
                  {formData.template_id && (
                    <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                      <div className="flex items-center gap-2">
                        <FileCheck className="w-4 h-4 text-blue-600" />
                        <span className="text-sm font-medium text-blue-900">Template Selecionado</span>
                      </div>
                      <p className="text-blue-800 text-xs mt-1">
                        Os campos deste template serão automaticamente adicionados como itens de checklist na inspeção.
                      </p>
                    </div>
                  )}
                </div>
                <div>
                  <label htmlFor="action_plan_type" className="block text-sm font-medium text-slate-700 mb-2">
                    Tipo de Plano de Ação
                  </label>
                  <select
                    id="action_plan_type"
                    name="action_plan_type"
                    value={formData.action_plan_type}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="5w2h">5W2H (Completo)</option>
                    <option value="simple">Simples</option>
                  </select>
                  <p className="text-xs text-slate-500 mt-1">
                    Escolha entre plano 5W2H completo ou formato simples
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-4 pt-6 border-t border-slate-200">
              <button
                type="button"
                onClick={() => navigate('/inspections')}
                className="px-4 py-2 text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors duration-200"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
              >
                {loading ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                ) : (
                  <Save className="w-4 h-4 mr-2" />
                )}
                {loading ? 'Criando...' : 'Criar Inspeção'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Layout>
  );
}
