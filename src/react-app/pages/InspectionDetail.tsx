import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router';
import Layout from '@/react-app/components/Layout';
import { 
  ArrowLeft, 
  Plus, 
  Check, 
  X, 
  AlertTriangle,
  Calendar,
  User,
  MapPin,
  Clock,
  CheckCircle2,
  AlertCircle,
  Building2,
  Navigation,
  Brain,
  FileText,
  Image as ImageIcon,
  Target,
  PenTool,
  FileCheck,
  Eye,
  Share2
} from 'lucide-react';
import { InspectionType, InspectionItemType, InspectionMediaType } from '@/shared/types';
import { FieldResponse } from '@/shared/checklist-types';
import ChecklistForm from '@/react-app/components/ChecklistForm';
import MediaUpload from '@/react-app/components/MediaUpload';
import InspectionSignature from '@/react-app/components/InspectionSignature';
import InspectionSummary from '@/react-app/components/InspectionSummary';
import InspectionShare from '@/react-app/components/InspectionShare';
import PDFGenerator from '@/react-app/components/PDFGenerator';
import LoadingSpinner from '@/react-app/components/LoadingSpinner';
import { useToast } from '@/react-app/hooks/useToast';

export default function InspectionDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { success, error, warning } = useToast();
  const [inspection, setInspection] = useState<InspectionType | null>(null);
  const [items, setItems] = useState<InspectionItemType[]>([]);
  const [templateItems, setTemplateItems] = useState<any[]>([]);
  const [media, setMedia] = useState<InspectionMediaType[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddItem, setShowAddItem] = useState(false);
  const [aiAnalyzing, setAiAnalyzing] = useState(false);
  const [actionPlan, setActionPlan] = useState<any>(null);
  const [showSignatures, setShowSignatures] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showPDFGenerator, setShowPDFGenerator] = useState(false);
  const [signatures, setSignatures] = useState<{ inspector?: string; responsible?: string }>({});
  const [responses, setResponses] = useState<Record<number, any>>({});
  const [newItem, setNewItem] = useState({
    category: '',
    item_description: '',
    is_compliant: null as boolean | null,
    observations: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (id) {
      fetchInspectionDetails();
    }
  }, [id]);

  const fetchInspectionDetails = async () => {
    try {
      const response = await fetch(`/api/inspections/${id}`);
      if (response.ok) {
        const data = await response.json();
        setInspection(data.inspection);
        
        // Separate template-based items from manual items
        const allItems = data.items || [];
        const manualItems = allItems.filter((item: any) => !item.template_id);
        const templateBasedItems = allItems.filter((item: any) => item.template_id);
        
        setItems(manualItems);
        setTemplateItems(templateBasedItems);
        setMedia(data.media || []);
        
        // Parse action plan if available
        if (data.inspection.action_plan) {
          try {
            setActionPlan(JSON.parse(data.inspection.action_plan));
          } catch (error) {
            console.error('Error parsing action plan:', error);
          }
        }

        // Load signatures
        console.log('Loading signatures for inspection:', id);
        const signaturesResponse = await fetch(`/api/inspections/${id}/signatures`);
        if (signaturesResponse.ok) {
          const signaturesData = await signaturesResponse.json();
          console.log('Signatures loaded from API:', signaturesData);
          setSignatures(signaturesData);
        } else {
          console.error('Failed to load signatures:', signaturesResponse.status);
        }

        // Load template responses with comments
        const templateResponses = templateBasedItems.reduce((acc: Record<number, any>, item: any) => {
          if (item.field_responses) {
            try {
              const fieldData = JSON.parse(item.field_responses);
              if (fieldData.response_value !== undefined) {
                acc[fieldData.field_id] = fieldData.response_value;
                // Load existing comments into responses state for form initialization
                if (fieldData.comment) {
                  (acc as Record<string, any>)[`comment_${fieldData.field_id}`] = fieldData.comment;
                }
              }
            } catch (error) {
              console.error('Error parsing field response:', error);
            }
          }
          return acc;
        }, {});
        setResponses(templateResponses);
      }
    } catch (error) {
      console.error('Erro ao carregar detalhes:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddItem = async () => {
    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/inspections/${id}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newItem,
          inspection_id: parseInt(id!)
        })
      });

      if (response.ok) {
        setNewItem({
          category: '',
          item_description: '',
          is_compliant: null,
          observations: ''
        });
        setShowAddItem(false);
        success('Item adicionado', 'Item foi adicionado com sucesso ao checklist');
        fetchInspectionDetails();
      } else {
        error('Erro ao adicionar item', 'Não foi possível adicionar o item. Tente novamente.');
      }
    } catch (err) {
      console.error('Erro ao adicionar item:', err);
      error('Erro ao adicionar item', 'Ocorreu um erro inesperado. Tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const updateItemCompliance = async (itemId: number, isCompliant: boolean) => {
    try {
      const item = items.find(i => i.id === itemId);
      if (!item) return;

      await fetch(`/api/inspection-items/${itemId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...item,
          is_compliant: isCompliant
        })
      });

      fetchInspectionDetails();
    } catch (error) {
      console.error('Erro ao atualizar item:', error);
    }
  };

  const handleFormSubmit = async (formResponses: FieldResponse[]) => {
    setIsSubmitting(true);
    try {
      // Use the new template responses endpoint
      const response = await fetch(`/api/inspections/${id}/template-responses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          responses: formResponses
        })
      });
      
      if (!response.ok) {
        throw new Error('Erro ao salvar respostas');
      }
      
      // Update local responses state
      const newResponses = formResponses.reduce((acc, response) => {
        acc[response.field_id] = response.value;
        return acc;
      }, {} as Record<number, any>);
      setResponses(newResponses);
      
      success('Respostas salvas', 'Respostas do checklist foram salvas com sucesso!');
      
      // Refresh inspection details to get updated data
      await fetchInspectionDetails();
    } catch (err) {
      console.error('Erro ao salvar respostas:', err);
      error('Erro ao salvar respostas', 'Não foi possível salvar as respostas. Tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSignatureSaved = (type: 'inspector' | 'responsible', signature: string) => {
    console.log(`Signature saved for ${type}:`, signature ? `Data length: ${signature.length}` : 'No signature data');
    if (signature && signature.length > 0) {
      setSignatures(prev => {
        const updated = { ...prev, [type]: signature };
        console.log('Updated signatures state:', {
          inspector: updated.inspector ? 'Present' : 'Missing',
          responsible: updated.responsible ? 'Present' : 'Missing'
        });
        return updated;
      });
      success('Assinatura salva', `Assinatura do ${type === 'inspector' ? 'inspetor' : 'responsável'} foi capturada com sucesso`);
    } else {
      error('Erro na assinatura', 'Não foi possível capturar a assinatura. Tente novamente.');
    }
  };

  const handleFinalizeInspection = async () => {
    // Validate signatures with better checks
    const hasInspectorSignature = signatures.inspector && signatures.inspector.trim() !== '';
    const hasResponsibleSignature = signatures.responsible && signatures.responsible.trim() !== '';
    
    if (!hasInspectorSignature || !hasResponsibleSignature) {
      const missingSignatures = [];
      if (!hasInspectorSignature) missingSignatures.push('inspetor');
      if (!hasResponsibleSignature) missingSignatures.push('responsável');
      
      warning(
        'Assinaturas obrigatórias', 
        `É necessário ter a(s) assinatura(s) do(s) ${missingSignatures.join(' e ')} para finalizar a inspeção. Por favor, desenhe as assinaturas nos campos correspondentes.`
      );
      return;
    }

    setIsSubmitting(true);
    try {
      console.log('Finalizing inspection with signatures:', {
        inspector: hasInspectorSignature ? `Present (${signatures.inspector!.length} chars)` : 'Missing',
        responsible: hasResponsibleSignature ? `Present (${signatures.responsible!.length} chars)` : 'Missing'
      });

      // First, save signatures to database
      const signaturesResponse = await fetch(`/api/inspections/${id}/signatures`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inspector: signatures.inspector,
          responsible: signatures.responsible
        })
      });

      if (!signaturesResponse.ok) {
        const errorData = await signaturesResponse.text();
        console.error('Failed to save signatures:', signaturesResponse.status, errorData);
        throw new Error('Erro ao salvar assinaturas');
      }

      // Then finalize the inspection
      const finalizeResponse = await fetch(`/api/inspections/${id}/finalize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inspector_signature: signatures.inspector,
          responsible_signature: signatures.responsible
        })
      });

      if (!finalizeResponse.ok) {
        const errorData = await finalizeResponse.text();
        console.error('Failed to finalize inspection:', finalizeResponse.status, errorData);
        throw new Error('Erro ao finalizar inspeção');
      }

      console.log('Inspection finalized successfully');
      success('Inspeção finalizada', 'Inspeção foi finalizada com sucesso! As assinaturas foram salvas.');
      setShowSignatures(false);
      setShowSummary(true);
      await fetchInspectionDetails();
    } catch (err) {
      console.error('Erro ao finalizar inspeção:', err);
      error('Erro ao finalizar inspeção', err instanceof Error ? err.message : 'Não foi possível finalizar a inspeção. Tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  

  const handleMediaUploaded = (newMedia: InspectionMediaType) => {
    setMedia(prev => [newMedia, ...prev]);
  };

  const handleMediaDeleted = (mediaId: number) => {
    setMedia(prev => prev.filter(m => m.id !== mediaId));
  };

  const generateAIAnalysis = async () => {
    if (!inspection) return;
    
    setAiAnalyzing(true);
    
    try {
      const nonCompliantItems = items
        .filter(item => item.is_compliant === false)
        .map(item => `${item.category}: ${item.item_description}${item.observations ? ` (${item.observations})` : ''}`);
      
      if (nonCompliantItems.length === 0) {
        warning('Análise IA não disponível', 'Nenhum item não conforme encontrado para análise');
        return;
      }
      
      const mediaUrls = media.map(m => m.file_url);
      
      const response = await fetch(`/api/inspections/${id}/ai-analysis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inspection_id: parseInt(id!),
          media_urls: mediaUrls,
          inspection_context: `Inspeção: ${inspection.title} - Local: ${inspection.location} - Empresa: ${inspection.company_name || 'N/A'}`,
          non_compliant_items: nonCompliantItems
        })
      });
      
      if (response.ok) {
        const result = await response.json();
        setActionPlan(result.action_plan);
        success('Plano de ação gerado', 'Análise da IA foi concluída e plano de ação foi gerado!');
      } else {
        throw new Error('Erro na análise de IA');
      }
    } catch (err) {
      console.error('Erro ao gerar análise:', err);
      error('Erro na análise IA', 'Não foi possível gerar a análise. Verifique se há itens não conformes.');
    } finally {
      setAiAnalyzing(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pendente':
        return <Clock className="w-5 h-5 text-yellow-500" />;
      case 'em_andamento':
        return <AlertTriangle className="w-5 h-5 text-blue-500" />;
      case 'concluida':
        return <CheckCircle2 className="w-5 h-5 text-green-500" />;
      case 'cancelada':
        return <AlertCircle className="w-5 h-5 text-red-500" />;
      default:
        return <Clock className="w-5 h-5 text-gray-500" />;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'pendente': return 'Pendente';
      case 'em_andamento': return 'Em Andamento';
      case 'concluida': return 'Concluída';
      case 'cancelada': return 'Cancelada';
      default: return status;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'baixa': return 'bg-green-100 text-green-800';
      case 'media': return 'bg-yellow-100 text-yellow-800';
      case 'alta': return 'bg-orange-100 text-orange-800';
      case 'critica': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[400px]">
          <LoadingSpinner size="lg" text="Carregando detalhes da inspeção..." />
        </div>
      </Layout>
    );
  }

  if (!inspection) {
    return (
      <Layout>
        <div className="text-center py-12">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Inspeção não encontrada</h2>
          <Link to="/inspections" className="text-blue-600 hover:underline">
            Voltar para inspeções
          </Link>
        </div>
      </Layout>
    );
  }

  // Show summary if inspection is finalized and summary is requested
  if (showSummary && inspection.status === 'concluida') {
    return (
      <Layout>
        <InspectionSummary
          inspection={inspection}
          items={items}
          templateItems={templateItems}
          media={media}
          responses={responses}
          signatures={signatures}
        />
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/inspections')}
            className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="font-heading text-3xl font-bold text-slate-900">
              {inspection.title}
            </h1>
            <p className="text-slate-600 mt-1">Detalhes da inspeção</p>
          </div>
          <div className="flex items-center gap-3">
            <span className={`inline-flex items-center gap-1 px-3 py-1 text-sm font-medium rounded-full ${getPriorityColor(inspection.priority)}`}>
              {inspection.priority.charAt(0).toUpperCase() + inspection.priority.slice(1)}
            </span>
            <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-lg">
              {getStatusIcon(inspection.status)}
              <span className="text-sm font-medium text-slate-700">
                {getStatusLabel(inspection.status)}
              </span>
            </div>
            {inspection.status === 'concluida' && (
              <>
                <button
                  onClick={() => setShowPDFGenerator(true)}
                  className="flex items-center px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                >
                  <FileText className="w-4 h-4 mr-2" />
                  Gerar PDF
                </button>
                <button
                  onClick={() => setShowSummary(true)}
                  className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <Eye className="w-4 h-4 mr-2" />
                  Ver Resumo
                </button>
              </>
            )}
            <button
              onClick={() => setShowShareModal(true)}
              className="flex items-center px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
            >
              <Share2 className="w-4 h-4 mr-2" />
              Compartilhar
            </button>
            {inspection.status !== 'concluida' && (
              <button
                onClick={() => setShowSignatures(true)}
                className="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              >
                <PenTool className="w-4 h-4 mr-2" />
                Finalizar Inspeção
              </button>
            )}
          </div>
        </div>

        {/* Inspection Info */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {inspection.company_name && (
              <div className="flex items-center gap-3">
                <Building2 className="w-5 h-5 text-slate-400" />
                <div>
                  <p className="text-sm text-slate-500">Empresa</p>
                  <p className="font-medium text-slate-900">{inspection.company_name}</p>
                </div>
              </div>
            )}
            <div className="flex items-center gap-3">
              <MapPin className="w-5 h-5 text-slate-400" />
              <div>
                <p className="text-sm text-slate-500">Local</p>
                <p className="font-medium text-slate-900">{inspection.location}</p>
                {inspection.address && (
                  <p className="text-sm text-slate-500">{inspection.address}</p>
                )}
              </div>
            </div>
            {(inspection.latitude && inspection.longitude) && (
              <div className="flex items-center gap-3">
                <Navigation className="w-5 h-5 text-slate-400" />
                <div>
                  <p className="text-sm text-slate-500">Coordenadas GPS</p>
                  <p className="font-medium text-slate-900 text-xs">
                    {inspection.latitude.toFixed(6)}, {inspection.longitude.toFixed(6)}
                  </p>
                </div>
              </div>
            )}
            <div className="flex items-center gap-3">
              <User className="w-5 h-5 text-slate-400" />
              <div>
                <p className="text-sm text-slate-500">Inspetor</p>
                <p className="font-medium text-slate-900">{inspection.inspector_name}</p>
                {inspection.inspector_email && (
                  <p className="text-sm text-slate-500">{inspection.inspector_email}</p>
                )}
              </div>
            </div>
            {inspection.scheduled_date && (
              <div className="flex items-center gap-3">
                <Calendar className="w-5 h-5 text-slate-400" />
                <div>
                  <p className="text-sm text-slate-500">Data Agendada</p>
                  <p className="font-medium text-slate-900">
                    {new Date(inspection.scheduled_date).toLocaleDateString('pt-BR')}
                  </p>
                </div>
              </div>
            )}
            {inspection.cep && (
              <div className="flex items-center gap-3">
                <MapPin className="w-5 h-5 text-slate-400" />
                <div>
                  <p className="text-sm text-slate-500">CEP</p>
                  <p className="font-medium text-slate-900">{inspection.cep}</p>
                </div>
              </div>
            )}
          </div>
          {inspection.description && (
            <div className="mt-6 pt-6 border-t border-slate-200">
              <p className="text-sm text-slate-500 mb-2">Descrição</p>
              <p className="text-slate-700">{inspection.description}</p>
            </div>
          )}
        </div>

        {/* Items List */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="font-heading text-xl font-semibold text-slate-900">
              Checklist de Inspeção
            </h2>
            <div className="flex items-center gap-3">
              <Link
                to={`/inspections/${id}/action-plan`}
                className="flex items-center px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
              >
                <Target className="w-4 h-4 mr-2" />
                Plano de Ação
              </Link>
              <button
                onClick={generateAIAnalysis}
                disabled={aiAnalyzing || isSubmitting}
                className="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {aiAnalyzing ? (
                  <LoadingSpinner size="sm" />
                ) : (
                  <Brain className="w-4 h-4 mr-2" />
                )}
                {aiAnalyzing ? 'Analisando...' : 'Análise IA (5W2H)'}
              </button>
              <button
                onClick={() => setShowAddItem(true)}
                className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Plus className="w-4 h-4 mr-2" />
                Adicionar Item
              </button>
            </div>
          </div>

          {/* Add Item Form */}
          {showAddItem && (
            <div className="mb-6 p-4 bg-slate-50 rounded-lg border border-slate-200">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input
                  type="text"
                  placeholder="Categoria (ex: EPIs, Equipamentos)"
                  value={newItem.category}
                  onChange={(e) => setNewItem({...newItem, category: e.target.value})}
                  className="px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <input
                  type="text"
                  placeholder="Descrição do item"
                  value={newItem.item_description}
                  onChange={(e) => setNewItem({...newItem, item_description: e.target.value})}
                  className="px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <textarea
                placeholder="Observações (opcional)"
                value={newItem.observations}
                onChange={(e) => setNewItem({...newItem, observations: e.target.value})}
                className="w-full mt-4 px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                rows={2}
              />
              <div className="flex items-center gap-2 mt-4">
                <button
                  onClick={handleAddItem}
                  disabled={!newItem.category || !newItem.item_description || isSubmitting}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isSubmitting ? (
                    <div className="flex items-center gap-2">
                      <LoadingSpinner size="sm" />
                      Adicionando...
                    </div>
                  ) : (
                    'Adicionar'
                  )}
                </button>
                <button
                  onClick={() => setShowAddItem(false)}
                  className="px-4 py-2 text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {/* Template Checklist */}
          {templateItems.length > 0 && (
            <div className="mb-8">
              <h3 className="font-heading text-lg font-semibold text-slate-900 mb-4">
                Checklist do Template
              </h3>
              <div className="bg-slate-50 rounded-lg p-4 mb-4">
                <ChecklistForm
                  fields={templateItems.map(item => {
                    const fieldData = JSON.parse(item.field_responses);
                    return {
                      id: fieldData.field_id,
                      field_name: item.item_description,
                      field_type: fieldData.field_type,
                      is_required: fieldData.is_required,
                      options: fieldData.options,
                      order_index: 0,
                      template_id: item.template_id
                    };
                  })}
                  onSubmit={handleFormSubmit}
                  initialValues={templateItems.reduce((acc, item) => {
                    const fieldData = JSON.parse(item.field_responses);
                    if (fieldData.response_value !== undefined) {
                      acc[fieldData.field_id] = fieldData.response_value;
                    }
                    return acc;
                  }, {} as Record<number, any>)}
                  readonly={false}
                  inspectionId={parseInt(id!)}
                  inspectionItems={templateItems}
                />
              </div>
            </div>
          )}

          {/* Manual Items */}
          <div className="space-y-4">
            <h3 className="font-heading text-lg font-semibold text-slate-900">
              Itens Manuais
            </h3>
            
            {items.length === 0 && templateItems.length === 0 ? (
              <div className="text-center py-8">
                <AlertTriangle className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                <p className="text-slate-500 font-medium">Nenhum item de checklist adicionado</p>
                <p className="text-slate-400 text-sm mt-1">
                  Adicione itens para começar a inspeção
                </p>
              </div>
            ) : items.length === 0 ? (
              <div className="text-center py-4">
                <p className="text-slate-500 text-sm">Nenhum item manual adicionado</p>
              </div>
            ) : (
              items.map((item) => (
                <div key={item.id} className="flex items-start gap-4 p-4 border border-slate-200 rounded-lg">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="px-2 py-1 bg-slate-100 text-slate-700 text-xs rounded">
                        {item.category}
                      </span>
                    </div>
                    <p className="font-medium text-slate-900 mb-1">{item.item_description}</p>
                    {item.observations && (
                      <p className="text-sm text-slate-600">{item.observations}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {item.is_compliant === null ? (
                      <>
                        <button
                          onClick={() => updateItemCompliance(item.id!, true)}
                          className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                          title="Marcar como conforme"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => updateItemCompliance(item.id!, false)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Marcar como não conforme"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </>
                    ) : (
                      <div className={`flex items-center gap-2 px-3 py-1 rounded-lg ${
                        item.is_compliant 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {item.is_compliant ? (
                          <CheckCircle2 className="w-4 h-4" />
                        ) : (
                          <AlertCircle className="w-4 h-4" />
                        )}
                        <span className="text-sm font-medium">
                          {item.is_compliant ? 'Conforme' : 'Não Conforme'}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Media Upload Section */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <ImageIcon className="w-5 h-5 text-slate-600" />
            <h2 className="font-heading text-xl font-semibold text-slate-900">
              Mídias da Inspeção
            </h2>
          </div>
          <MediaUpload
            inspectionId={parseInt(id!)}
            onMediaUploaded={handleMediaUploaded}
            existingMedia={media}
            onMediaDeleted={handleMediaDeleted}
          />
        </div>

        {/* AI Action Plan Section */}
        {actionPlan && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <div className="flex items-center gap-2 mb-4">
              <FileText className="w-5 h-5 text-slate-600" />
              <h2 className="font-heading text-xl font-semibold text-slate-900">
                Plano de Ação 5W2H
              </h2>
              <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                actionPlan.priority_level === 'alta' ? 'bg-red-100 text-red-800' :
                actionPlan.priority_level === 'media' ? 'bg-yellow-100 text-yellow-800' :
                'bg-green-100 text-green-800'
              }`}>
                Prioridade {actionPlan.priority_level}
              </span>
            </div>
            
            {actionPlan.summary && (
              <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
                <h3 className="font-medium text-blue-900 mb-2">Resumo Executivo</h3>
                <p className="text-blue-800 text-sm">{actionPlan.summary}</p>
                {actionPlan.estimated_completion && (
                  <p className="text-blue-700 text-sm mt-2">
                    <strong>Conclusão Estimada:</strong> {actionPlan.estimated_completion}
                  </p>
                )}
              </div>
            )}
            
            <div className="space-y-4">
              {actionPlan.actions && actionPlan.actions.map((action: any, index: number) => (
                <div key={index} className="border border-slate-200 rounded-lg p-4">
                  <h4 className="font-medium text-slate-900 mb-3">
                    {index + 1}. {action.item}
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <span className="text-sm font-medium text-red-600">O que (What):</span>
                      <p className="text-sm text-slate-700 mt-1">{action.what}</p>
                    </div>
                    <div>
                      <span className="text-sm font-medium text-blue-600">Por que (Why):</span>
                      <p className="text-sm text-slate-700 mt-1">{action.why}</p>
                    </div>
                    <div>
                      <span className="text-sm font-medium text-green-600">Onde (Where):</span>
                      <p className="text-sm text-slate-700 mt-1">{action.where}</p>
                    </div>
                    <div>
                      <span className="text-sm font-medium text-yellow-600">Quando (When):</span>
                      <p className="text-sm text-slate-700 mt-1">{action.when}</p>
                    </div>
                    <div>
                      <span className="text-sm font-medium text-purple-600">Quem (Who):</span>
                      <p className="text-sm text-slate-700 mt-1">{action.who}</p>
                    </div>
                    <div>
                      <span className="text-sm font-medium text-indigo-600">Como (How):</span>
                      <p className="text-sm text-slate-700 mt-1">{action.how}</p>
                    </div>
                    <div className="md:col-span-2">
                      <span className="text-sm font-medium text-orange-600">Quanto (How Much):</span>
                      <p className="text-sm text-slate-700 mt-1">{action.how_much}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Signatures Modal */}
        {showSignatures && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="font-heading text-2xl font-bold text-slate-900">
                    Finalizar Inspeção
                  </h2>
                  <button
                    onClick={() => setShowSignatures(false)}
                    className="text-slate-500 hover:text-slate-700"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>

                <div className="space-y-6">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <InspectionSignature
                      onSignatureSaved={(signature) => handleSignatureSaved('inspector', signature)}
                      existingSignature={signatures.inspector}
                      signerName={inspection.inspector_name}
                      signerRole="Inspetor Responsável"
                    />
                    <InspectionSignature
                      onSignatureSaved={(signature) => handleSignatureSaved('responsible', signature)}
                      existingSignature={signatures.responsible}
                      signerName={inspection.responsible_name || "Responsável Técnico"}
                      signerRole="Empresa"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-4 pt-6 border-t border-slate-200">
                    <button
                      onClick={() => setShowSignatures(false)}
                      className="px-4 py-2 text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={handleFinalizeInspection}
                      disabled={!signatures.inspector || !signatures.responsible || isSubmitting}
                      className="flex items-center px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {isSubmitting ? (
                        <>
                          <LoadingSpinner size="sm" />
                          <span className="ml-2">Finalizando...</span>
                        </>
                      ) : (
                        <>
                          <FileCheck className="w-4 h-4 mr-2" />
                          Finalizar Inspeção
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Share Modal */}
        <InspectionShare
          inspectionId={parseInt(id!)}
          inspectionTitle={inspection.title}
          isOpen={showShareModal}
          onClose={() => setShowShareModal(false)}
        />

        {/* PDF Generator Modal */}
        <PDFGenerator
          inspection={inspection}
          items={items}
          templateItems={templateItems}
          media={media}
          responses={responses}
          signatures={signatures}
          isOpen={showPDFGenerator}
          onClose={() => setShowPDFGenerator(false)}
        />
      </div>
    </Layout>
  );
}
