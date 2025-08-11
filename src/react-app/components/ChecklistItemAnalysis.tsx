import { useState } from 'react';
import React from 'react';
import { Brain, Loader2, FileText, Eye, EyeOff, Plus, AlertCircle, Target, CheckCircle2, X, Edit, Trash2 } from 'lucide-react';
import { InspectionMediaType } from '@/shared/types';
import { useToast } from '@/react-app/hooks/useToast';
import MediaUpload from './MediaUpload';
import AIFeedbackSystem from './AIFeedbackSystem';
import { optimizeMediaSetForAI, validateMediaForAI } from '@/react-app/utils/mediaOptimizer';

interface ChecklistItemAnalysisProps {
  itemId?: number;
  inspectionId: number;
  fieldId: number;
  fieldName: string;
  fieldType: string;
  responseValue: any;
  existingMedia?: InspectionMediaType[];
  onMediaUploaded: (media: InspectionMediaType) => void;
  onMediaDeleted: (mediaId: number) => void;
  onActionPlanGenerated: (plan: any) => void;
  existingActionPlan?: any;
  preAnalysis?: string;
  onPreAnalysisGenerated: (analysis: string) => void;
}

interface ActionItem {
  id?: number;
  title: string;
  what_description?: string;
  where_location?: string;
  why_reason?: string;
  how_method?: string;
  who_responsible?: string;
  when_deadline?: string;
  how_much_cost?: string;
  status: 'pending' | 'in_progress' | 'completed';
  priority: 'baixa' | 'media' | 'alta';
  is_ai_generated: boolean;
}

export default function ChecklistItemAnalysis({
  itemId,
  inspectionId,
  fieldId,
  fieldName,
  fieldType,
  responseValue,
  existingMedia = [],
  onMediaUploaded,
  onMediaDeleted,
  onActionPlanGenerated,
  existingActionPlan,
  preAnalysis,
  onPreAnalysisGenerated
}: ChecklistItemAnalysisProps) {
  const { success, error: showError, warning, info } = useToast();
  const [analyzing, setAnalyzing] = useState(false);
  const [preAnalyzing, setPreAnalyzing] = useState(false);
  const [showActionPlan, setShowActionPlan] = useState(false);
  const [deletingPreAnalysis, setDeletingPreAnalysis] = useState(false);
  const [deletingActionPlan, setDeletingActionPlan] = useState(false);
  const [showMediaUpload, setShowMediaUpload] = useState(false);
  const [createdActions, setCreatedActions] = useState<ActionItem[]>([]);
  const [showActionNotification, setShowActionNotification] = useState(false);
  const [newActionInfo, setNewActionInfo] = useState<{id: number, title: string} | null>(null);
  
  // Load existing actions for this inspection item
  React.useEffect(() => {
    const loadActions = async () => {
      if (!itemId) return;
      
      try {
        const response = await fetch(`/api/inspection-items/${itemId}/actions`);
        if (response.ok) {
          const data = await response.json();
          setCreatedActions(data.actions || []);
        }
      } catch (error) {
        console.error('Erro ao carregar ações:', error);
      }
    };

    loadActions();
  }, [itemId]);

  const handlePreAnalysis = async () => {
    if (!itemId) {
      showError('Erro', 'Item de inspeção não encontrado');
      return;
    }

    if (!responseValue && responseValue !== false && responseValue !== 0) {
      warning('Atenção', 'É necessário ter uma resposta para analisar este item');
      return;
    }

    setPreAnalyzing(true);

    try {
      // Optimize media for AI analysis
      const mediaForAnalysis = existingMedia.map(m => ({
        file_url: m.file_url,
        media_type: m.media_type,
        file_name: m.file_name,
        description: m.description || null
      }));

      // Validate and optimize media if needed
      const validation = validateMediaForAI(mediaForAnalysis);
      if (!validation.valid && validation.issues.length > 0) {
        warning('Mídia Otimizada', `Algumas mídias foram otimizadas para melhor performance: ${validation.issues.join(', ')}`);
      }

      // Optimize media set for AI processing
      const { optimizedMedia, optimizationReport } = await optimizeMediaSetForAI(mediaForAnalysis, {
        maxSizeMB: 2,
        maxImages: 1, // Limit to 1 image for reliability
        imageQuality: 0.6,
        maxDimension: 1024
      });

      if (optimizationReport) {
        info('Otimização de Mídia', `Mídias otimizadas para análise: ${optimizationReport}`);
      }
      
      const response = await fetch(`/api/inspection-items/${itemId}/pre-analysis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          field_id: fieldId,
          field_name: fieldName,
          field_type: fieldType,
          response_value: responseValue,
          media_data: optimizedMedia,
          user_prompt: null
        })
      });

      if (response.ok) {
        const result = await response.json();
        onPreAnalysisGenerated(result.pre_analysis);
        success('Pré-Análise Concluída', 'A análise inteligente foi gerada com sucesso');
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Erro na pré-análise');
      }
    } catch (err) {
      console.error('Erro ao fazer pré-análise:', err);
      const errorMessage = err instanceof Error ? err.message : 'Erro desconhecido';
      
      if (errorMessage.includes('mídias estão acessíveis')) {
        showError('Erro de Mídia', 'As mídias anexadas não estão acessíveis para análise da IA. Verifique se os arquivos foram carregados corretamente.');
      } else if (errorMessage.includes('timeout') || errorMessage.includes('Timeout')) {
        showError('Timeout', 'A análise demorou muito para processar. Tente novamente com menos imagens ou aguarde alguns minutos.');
      } else if (errorMessage.includes('rate limit') || errorMessage.includes('quota')) {
        showError('Limite Excedido', 'Limite de uso da IA atingido. Aguarde alguns minutos antes de tentar novamente.');
      } else if (errorMessage.includes('API')) {
        showError('Erro da IA', 'Falha na conexão com o serviço de inteligência artificial. Tente novamente em alguns instantes.');
      } else {
        showError('Erro na Pré-Análise', errorMessage);
      }
    } finally {
      setPreAnalyzing(false);
    }
  };

  const handleCreateAction = async () => {
    if (!itemId) {
      showError('Erro', 'Item de inspeção não encontrado');
      return;
    }

    setAnalyzing(true);

    try {
      // Optimize media for AI analysis
      const mediaForAnalysis = existingMedia.map(m => ({
        file_url: m.file_url,
        media_type: m.media_type,
        file_name: m.file_name,
        description: m.description || null
      }));

      // Optimize media set for AI processing
      const { optimizedMedia, optimizationReport } = await optimizeMediaSetForAI(mediaForAnalysis, {
        maxSizeMB: 2,
        maxImages: 1,
        imageQuality: 0.6,
        maxDimension: 1024
      });

      if (optimizationReport) {
        info('Otimização de Mídia', `Mídias otimizadas: ${optimizationReport}`);
      }
      
      const response = await fetch(`/api/inspection-items/${itemId}/create-action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          field_id: fieldId,
          field_name: fieldName,
          field_type: fieldType,
          response_value: responseValue,
          pre_analysis: preAnalysis,
          media_data: optimizedMedia,
          user_prompt: null
        })
      });

      if (response.ok) {
        const result = await response.json();
        
        if (result.action.requires_action && result.action.id) {
          // Add the created action to the list
          setCreatedActions(prev => [...prev, result.action]);
          setNewActionInfo({ id: result.action.id, title: result.action.title || 'Nova Ação' });
          setShowActionNotification(true);
          success('Ação Criada', 'Uma nova ação corretiva foi criada com base na análise da IA');
        } else if (!result.action.requires_action) {
          info('Análise Concluída', 'A IA determinou que não é necessária uma ação corretiva para este item com base nas evidências analisadas.');
        } else {
          info('Análise Realizada', 'A ação foi avaliada mas não foi necessário criar uma ação corretiva.');
        }
        
        onActionPlanGenerated(result.action);
      } else {
        const errorData = await response.json();
        console.error('API Error Response:', errorData);
        throw new Error(errorData.error || 'Erro ao criar ação');
      }
    } catch (err) {
      console.error('Erro ao criar ação:', err);
      const errorMessage = err instanceof Error ? err.message : 'Erro desconhecido';
      
      if (errorMessage.includes('mídias estão acessíveis')) {
        warning('Mídia Inacessível', 'As mídias anexadas não estão acessíveis. A análise será baseada apenas no texto da resposta.');
      } else if (errorMessage.includes('timeout') || errorMessage.includes('Timeout')) {
        showError('Timeout', 'A criação da ação demorou muito para processar. Tente novamente com menos conteúdo.');
      } else if (errorMessage.includes('rate limit') || errorMessage.includes('quota')) {
        showError('Limite Excedido', 'Limite de uso da IA atingido. Aguarde alguns minutos antes de tentar novamente.');
      } else if (errorMessage.includes('API')) {
        showError('Erro da IA', 'Falha na conexão com o serviço de inteligência artificial. Tente novamente em alguns instantes.');
      } else {
        showError('Erro ao Criar Ação', errorMessage);
      }
    } finally {
      setAnalyzing(false);
    }
  };

  const handleDeleteAction = async (actionId: number) => {
    if (confirm('Tem certeza que deseja excluir esta ação?')) {
      try {
        const response = await fetch(`/api/action-items/${actionId}`, {
          method: 'DELETE'
        });

        if (response.ok) {
          // Remove the action from the local state
          setCreatedActions(prev => prev.filter(action => action.id !== actionId));
          success('Ação Excluída', 'A ação foi removida com sucesso do plano de ação');
        } else {
          showError('Erro', 'Não foi possível excluir a ação. Tente novamente.');
        }
      } catch (err) {
        console.error('Erro ao excluir ação:', err);
        showError('Erro', 'Não foi possível excluir a ação. Verifique sua conexão e tente novamente.');
      }
    }
  };

  const handleDeletePreAnalysis = async () => {
    if (!itemId) return;
    
    if (confirm('Tem certeza que deseja excluir a pré-análise da IA?')) {
      setDeletingPreAnalysis(true);
      try {
        const response = await fetch(`/api/inspection-items/${itemId}/pre-analysis`, {
          method: 'DELETE'
        });

        if (response.ok) {
          onPreAnalysisGenerated(''); // Clear the analysis
          success('Pré-Análise Excluída', 'A pré-análise foi removida com sucesso');
        } else {
          showError('Erro', 'Não foi possível excluir a pré-análise. Tente novamente.');
        }
      } catch (err) {
        console.error('Erro ao excluir pré-análise:', err);
        showError('Erro', 'Não foi possível excluir a pré-análise. Verifique sua conexão e tente novamente.');
      } finally {
        setDeletingPreAnalysis(false);
      }
    }
  };

  const handleDeleteActionPlan = async () => {
    if (!itemId) return;
    
    if (confirm('Tem certeza que deseja excluir o plano de ação da IA?')) {
      setDeletingActionPlan(true);
      try {
        const response = await fetch(`/api/inspection-items/${itemId}/action-plan`, {
          method: 'DELETE'
        });

        if (response.ok) {
          onActionPlanGenerated(null); // Clear the action plan
          success('Plano de Ação Excluído', 'O plano de ação foi removido com sucesso');
        } else {
          showError('Erro', 'Não foi possível excluir o plano de ação. Tente novamente.');
        }
      } catch (err) {
        console.error('Erro ao excluir plano de ação:', err);
        showError('Erro', 'Não foi possível excluir o plano de ação. Verifique sua conexão e tente novamente.');
      } finally {
        setDeletingActionPlan(false);
      }
    }
  };

  const formatResponseValue = (value: any, type: string) => {
    if (value === null || value === undefined) return 'Não respondido';
    
    switch (type) {
      case 'boolean':
        return value ? 'Conforme' : 'Não Conforme';
      case 'rating':
        return `${value}/5 estrelas`;
      case 'multiselect':
        return Array.isArray(value) ? value.join(', ') : value;
      default:
        return String(value);
    }
  };

  return (
    <div className="bg-slate-50 rounded-lg p-4 mt-3 border border-slate-200">
      <div className="flex items-center justify-between mb-3">
        <h4 className="font-medium text-slate-900 text-sm">Análise Multimodal Inteligente</h4>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowMediaUpload(!showMediaUpload)}
            className="text-xs px-3 py-1 text-blue-600 border border-blue-200 rounded hover:bg-blue-50 transition-colors"
          >
            {showMediaUpload ? 'Ocultar Mídias' : 'Adicionar Mídias'}
          </button>
          <button
            type="button"
            onClick={handlePreAnalysis}
            disabled={preAnalyzing || (!responseValue && responseValue !== false && responseValue !== 0)}
            className="flex items-center text-xs px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {preAnalyzing ? (
              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
            ) : (
              <Brain className="w-3 h-3 mr-1" />
            )}
            {preAnalyzing ? 'Analisando...' : 'Pré-Análise IA'}
          </button>
          <button
            type="button"
            onClick={handleCreateAction}
            disabled={analyzing}
            className="flex items-center text-xs px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 transition-colors"
          >
            {analyzing ? (
              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
            ) : (
              <Plus className="w-3 h-3 mr-1" />
            )}
            {analyzing ? 'Criando...' : 'Criar Ação'}
          </button>
        </div>
      </div>

      

      {/* Current Response Display */}
      <div className="text-xs text-slate-600 mb-3">
        <span className="font-medium">Resposta atual:</span> {formatResponseValue(responseValue, fieldType)}
      </div>

      {/* Pre-Analysis Display */}
      {preAnalysis && (
        <div className="mb-4 p-3 bg-blue-50 rounded border border-blue-200">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-blue-600" />
              <span className="text-sm font-medium text-blue-900">Pré-Análise da IA</span>
            </div>
            <button
              onClick={handleDeletePreAnalysis}
              disabled={deletingPreAnalysis}
              className="text-red-600 hover:text-red-800 hover:bg-red-50 p-1 rounded transition-colors"
              title="Excluir pré-análise"
            >
              {deletingPreAnalysis ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Trash2 className="w-3 h-3" />
              )}
            </button>
          </div>
          <p className="text-sm text-blue-800 whitespace-pre-line">{preAnalysis}</p>
          <AIFeedbackSystem
            aiResponseType="pre_analysis"
            aiResponseId={`${itemId}_pre_analysis`}
            itemId={itemId}
          />
        </div>
      )}

      {/* Media Upload Section */}
      {showMediaUpload && (
        <div className="mb-4">
          <MediaUpload
            inspectionId={inspectionId}
            inspectionItemId={itemId}
            onMediaUploaded={onMediaUploaded}
            existingMedia={existingMedia}
            onMediaDeleted={onMediaDeleted}
          />
        </div>
      )}

      {/* Media Count Display */}
      {existingMedia.length > 0 && !showMediaUpload && (
        <div className="text-xs text-slate-600 mb-3">
          {existingMedia.length} mídia(s) anexada(s) • 
          {existingMedia.filter(m => m.media_type === 'image').length} foto(s) • 
          {existingMedia.filter(m => m.media_type === 'audio').length} áudio(s) • 
          {existingMedia.filter(m => m.media_type === 'video').length} vídeo(s) • 
          {existingMedia.filter(m => m.media_type === 'document').length} documento(s)
        </div>
      )}

      {/* Created Actions Section */}
      {createdActions.length > 0 && (
        <div className="mt-3 pt-3 border-t border-slate-200">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-slate-600" />
              <span className="text-sm font-medium text-slate-900">Ações Criadas pela IA</span>
            </div>
            <a
              href={`/inspections/${inspectionId}/action-plan`}
              className="flex items-center px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 transition-colors"
            >
              <Target className="w-3 h-3 mr-1" />
              Gerenciar Plano
            </a>
          </div>
          
          <div className="space-y-3">
            {createdActions.map((action) => (
              <div key={action.id} className="p-3 bg-white rounded border border-slate-200">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-medium text-slate-900 text-sm">{action.title}</h4>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-1 text-xs font-medium rounded-full bg-purple-100 text-purple-800">
                      IA
                    </span>
                    <span className="px-2 py-1 text-xs font-medium rounded-full bg-yellow-100 text-yellow-800">
                      Aguardando Detalhamento
                    </span>
                    <a
                      href={`/inspections/${inspectionId}/action-plan?highlightAction=${action.id}`}
                      className="p-1 text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                      title="Editar ação"
                    >
                      <Edit className="w-3 h-3" />
                    </a>
                    <button
                      onClick={() => handleDeleteAction(action.id!)}
                      className="p-1 text-slate-600 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                      title="Excluir ação"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 gap-2 text-xs">
                  {action.what_description && (
                    <div>
                      <span className="font-medium text-red-600">O que:</span>
                      <p className="text-slate-700 mt-1">{action.what_description}</p>
                    </div>
                  )}
                  {action.where_location && (
                    <div>
                      <span className="font-medium text-green-600">Onde:</span>
                      <p className="text-slate-700 mt-1">{action.where_location}</p>
                    </div>
                  )}
                  {action.how_method && (
                    <div>
                      <span className="font-medium text-indigo-600">Como:</span>
                      <p className="text-slate-700 mt-1">{action.how_method}</p>
                    </div>
                  )}
                </div>

                <div className="mt-3 pt-2 border-t border-slate-100">
                  <p className="text-xs text-slate-500 italic">
                    Complete os detalhes (Quem, Quando, Quanto, Prioridade) no Plano de Ação
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action Creation Notification */}
      {showActionNotification && newActionInfo && (
        <div className="mt-3 pt-3 border-t border-slate-200">
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex-shrink-0">
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <h4 className="text-sm font-medium text-green-900">
                    Ação criada com sucesso!
                  </h4>
                  <p className="text-sm text-green-700 mt-1">
                    "{newActionInfo.title}" foi adicionada ao plano de ação. Complete os detalhes (Quem, Quando, Quanto) quando necessário.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={`/inspections/${inspectionId}/action-plan?highlightAction=${newActionInfo.id}`}
                  className="flex items-center px-3 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 transition-colors"
                >
                  <Target className="w-4 h-4 mr-1" />
                  Ir para Plano de Ação
                </a>
                <button
                  onClick={() => setShowActionNotification(false)}
                  className="text-green-500 hover:text-green-700 p-1"
                  title="Fechar notificação"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Legacy Action Plan Section */}
      {existingActionPlan && (
        <div className="mt-3 pt-3 border-t border-slate-200">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-slate-600" />
              <span className="text-sm font-medium text-slate-900">Plano de Ação 5W2H</span>
              <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                existingActionPlan.priority_level === 'alta' ? 'bg-red-100 text-red-800' :
                existingActionPlan.priority_level === 'media' ? 'bg-yellow-100 text-yellow-800' :
                'bg-green-100 text-green-800'
              }`}>
                {existingActionPlan.priority_level}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleDeleteActionPlan}
                disabled={deletingActionPlan}
                className="text-red-600 hover:text-red-800 hover:bg-red-50 p-1 rounded transition-colors"
                title="Excluir plano de ação"
              >
                {deletingActionPlan ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Trash2 className="w-3 h-3" />
                )}
              </button>
              <button
                type="button"
                onClick={() => setShowActionPlan(!showActionPlan)}
                className="text-xs text-slate-500 hover:text-slate-700"
              >
                {showActionPlan ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {showActionPlan && (
            <div className="space-y-3">
              {existingActionPlan.summary && (
                <div className="p-3 bg-blue-50 rounded border border-blue-200">
                  <p className="text-xs text-blue-800">{existingActionPlan.summary}</p>
                </div>
              )}
              
              {existingActionPlan.actions && existingActionPlan.actions.map((action: any, index: number) => (
                <div key={index} className="p-3 bg-white rounded border border-slate-200">
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="font-medium text-red-600">O que:</span>
                      <p className="text-slate-700 mt-1">{action.what}</p>
                    </div>
                    <div>
                      <span className="font-medium text-blue-600">Por que:</span>
                      <p className="text-slate-700 mt-1">{action.why}</p>
                    </div>
                    <div>
                      <span className="font-medium text-green-600">Onde:</span>
                      <p className="text-slate-700 mt-1">{action.where}</p>
                    </div>
                    <div>
                      <span className="font-medium text-yellow-600">Quando:</span>
                      <p className="text-slate-700 mt-1">{action.when}</p>
                    </div>
                    <div>
                      <span className="font-medium text-purple-600">Quem:</span>
                      <p className="text-slate-700 mt-1">{action.who}</p>
                    </div>
                    <div>
                      <span className="font-medium text-indigo-600">Como:</span>
                      <p className="text-slate-700 mt-1">{action.how}</p>
                    </div>
                    <div className="col-span-2">
                      <span className="font-medium text-orange-600">Quanto:</span>
                      <p className="text-slate-700 mt-1">{action.how_much}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
