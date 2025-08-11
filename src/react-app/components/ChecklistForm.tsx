import { useState, useEffect } from 'react';
import { ChecklistField, FieldResponse } from '@/shared/checklist-types';
import { InspectionMediaType } from '@/shared/types';
import { Star, MessageSquare, Brain, Loader2 } from 'lucide-react';
import ChecklistItemAnalysis from './ChecklistItemAnalysis';
import { useDebounce } from '@/react-app/hooks/useDebounce';

interface ChecklistFormProps {
  fields: ChecklistField[];
  onSubmit: (responses: FieldResponse[]) => void;
  initialValues?: Record<number, any>;
  readonly?: boolean;
  inspectionId?: number;
  inspectionItems?: any[];
  onAutoSave?: (responses: Record<number, any>, comments: Record<number, string>) => void;
}

export default function ChecklistForm({ 
  fields, 
  onSubmit, 
  initialValues = {}, 
  readonly = false, 
  inspectionId, 
  inspectionItems = [],
  onAutoSave 
}: ChecklistFormProps) {
  const [responses, setResponses] = useState<Record<number, any>>(initialValues);
  const [comments, setComments] = useState<Record<number, string>>({});
  const [itemsMedia, setItemsMedia] = useState<Record<number, InspectionMediaType[]>>({});
  const [itemsActionPlans, setItemsActionPlans] = useState<Record<number, any>>({});
  const [itemsPreAnalysis, setItemsPreAnalysis] = useState<Record<number, string>>({});
  const [generatingResponse, setGeneratingResponse] = useState<Record<number, boolean>>({});

  // Auto-save com debounce
  const debouncedResponses = useDebounce(responses, 2000); // 2 segundos de delay
  const debouncedComments = useDebounce(comments, 2000);

  // Auto-save effect
  useEffect(() => {
    if (onAutoSave && !readonly && Object.keys(debouncedResponses).length > 0) {
      onAutoSave(debouncedResponses, debouncedComments);
    }
  }, [debouncedResponses, debouncedComments, onAutoSave, readonly]);

  useEffect(() => {
    // Load existing media and action plans for items
    const loadItemData = async () => {
      for (const item of inspectionItems) {
        if (item.id) {
          // Load media for this item
          try {
            const mediaResponse = await fetch(`/api/inspection-items/${item.id}/media`);
            if (mediaResponse.ok) {
              const mediaData = await mediaResponse.json();
              setItemsMedia(prev => ({ ...prev, [item.id]: mediaData.media || [] }));
            }
          } catch (error) {
            console.error('Error loading media for item:', item.id, error);
          }

          // Parse existing action plan if available
          if (item.ai_action_plan) {
            try {
              const actionPlan = JSON.parse(item.ai_action_plan);
              setItemsActionPlans(prev => ({ ...prev, [item.id]: actionPlan }));
            } catch (error) {
              console.error('Error parsing action plan for item:', item.id, error);
            }
          }

          // Load pre-analysis if available
          if (item.ai_pre_analysis) {
            setItemsPreAnalysis(prev => ({ ...prev, [item.id]: item.ai_pre_analysis }));
          }

          // Load existing comments if available
          if (item.field_responses) {
            try {
              const fieldData = JSON.parse(item.field_responses);
              if (fieldData.comment) {
                setComments(prev => ({ ...prev, [fieldData.field_id]: fieldData.comment }));
              }
            } catch (error) {
              console.error('Error parsing field responses for comments:', error);
            }
          }
        }
      }
    };

    if (inspectionItems.length > 0) {
      loadItemData();
    }
  }, [inspectionItems]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const fieldResponses: FieldResponse[] = fields.map(field => {
      const fieldValue = responses[field.id!];
      console.log(`Preparando resposta para campo ${field.id} (${field.field_name}):`, fieldValue, typeof fieldValue);
      
      return {
        field_id: field.id!,
        field_name: field.field_name,
        field_type: field.field_type,
        value: fieldValue !== undefined ? fieldValue : null,
        comment: comments[field.id!] || undefined
      };
    });
    
    console.log('Enviando respostas do formulário:', fieldResponses);
    onSubmit(fieldResponses);
  };

  const updateResponse = (fieldId: number, value: any) => {
    if (readonly) return;
    console.log('Atualizando resposta:', fieldId, value, typeof value);
    setResponses(prev => ({ ...prev, [fieldId]: value }));
  };

  const updateComment = (fieldId: number, comment: string) => {
    if (readonly) return;
    setComments(prev => ({ ...prev, [fieldId]: comment }));
  };

  const handleMediaUploaded = (fieldId: number, media: InspectionMediaType) => {
    setItemsMedia(prev => ({
      ...prev,
      [fieldId]: [...(prev[fieldId] || []), media]
    }));
  };

  const handleMediaDeleted = (fieldId: number, mediaId: number) => {
    setItemsMedia(prev => ({
      ...prev,
      [fieldId]: (prev[fieldId] || []).filter(m => m.id !== mediaId)
    }));
  };

  const handleActionPlanGenerated = (fieldId: number, plan: any) => {
    setItemsActionPlans(prev => ({ ...prev, [fieldId]: plan }));
  };

  const handlePreAnalysisGenerated = (fieldId: number, analysis: string) => {
    setItemsPreAnalysis(prev => ({ ...prev, [fieldId]: analysis }));
  };

  const handleGenerateResponseWithAI = async (fieldId: number) => {
    if (!inspectionId) return;
    
    setGeneratingResponse(prev => ({ ...prev, [fieldId]: true }));
    
    try {
      const field = fields.find(f => f.id === fieldId);
      if (!field) return;
      
      const inspectionItem = getInspectionItemForField(fieldId);
      const itemId = inspectionItem?.id;
      
      if (!itemId) {
        alert('Item de inspeção não encontrado');
        return;
      }
      
      // Preparar dados das mídias específicas deste item
      const mediaForAnalysis = (itemsMedia[itemId] || []).map(m => ({
        file_url: m.file_url,
        media_type: m.media_type,
        file_name: m.file_name,
        description: m.description || null
      }));
      
      const response = await fetch(`/api/inspection-items/${itemId}/generate-field-response`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          field_id: fieldId,
          field_name: field.field_name,
          field_type: field.field_type,
          current_response: responses[fieldId],
          all_responses: responses,
          media_data: mediaForAnalysis,
          field_options: field.options
        })
      });

      if (response.ok) {
        const result = await response.json();
        if (result.generated_response !== undefined && result.generated_response !== null) {
          updateResponse(fieldId, result.generated_response);
        }
        if (result.generated_comment) {
          updateComment(fieldId, result.generated_comment);
        }
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Erro ao gerar resposta');
      }
    } catch (error) {
      console.error('Erro ao gerar resposta com IA:', error);
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      alert('Erro ao gerar resposta: ' + errorMessage);
    } finally {
      setGeneratingResponse(prev => ({ ...prev, [fieldId]: false }));
    }
  };

  const getInspectionItemForField = (fieldId: number) => {
    return inspectionItems.find(item => {
      if (item.field_responses) {
        try {
          const fieldData = JSON.parse(item.field_responses);
          return fieldData.field_id === fieldId;
        } catch (error) {
          return false;
        }
      }
      return false;
    });
  };

  const renderField = (field: ChecklistField) => {
    const value = responses[field.id!];
    
    // Parse options safely - handle both JSON and pipe-separated formats
    let options: string[] = [];
    if (field.options) {
      try {
        // Try parsing as JSON first
        options = JSON.parse(field.options);
      } catch (error) {
        // If JSON parsing fails, try pipe-separated format
        try {
          options = field.options.split('|').map(opt => opt.trim()).filter(opt => opt.length > 0);
        } catch (fallbackError) {
          console.error('Error parsing field options:', field.options, fallbackError);
          options = [];
        }
      }
    }

    switch (field.field_type) {
      case 'text':
        return (
          <input
            type="text"
            value={value || ''}
            onChange={(e) => updateResponse(field.id!, e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            required={field.is_required}
            disabled={readonly}
          />
        );

      case 'textarea':
        return (
          <textarea
            value={value || ''}
            onChange={(e) => updateResponse(field.id!, e.target.value)}
            rows={3}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            required={field.is_required}
            disabled={readonly}
          />
        );

      case 'select':
        return (
          <select
            value={value || ''}
            onChange={(e) => updateResponse(field.id!, e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            required={field.is_required}
            disabled={readonly}
          >
            <option value="">Selecione uma opção</option>
            {options.map((option: string, index: number) => (
              <option key={index} value={option}>
                {option}
              </option>
            ))}
          </select>
        );

      case 'multiselect':
        return (
          <div className="space-y-2">
            {options.map((option: string, index: number) => (
              <label key={index} className="flex items-center">
                <input
                  type="checkbox"
                  checked={(value || []).includes(option)}
                  onChange={(e) => {
                    const currentValue = value || [];
                    if (e.target.checked) {
                      updateResponse(field.id!, [...currentValue, option]);
                    } else {
                      updateResponse(field.id!, currentValue.filter((v: string) => v !== option));
                    }
                  }}
                  className="mr-2 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  disabled={readonly}
                />
                <span className="text-sm text-slate-700">{option}</span>
              </label>
            ))}
          </div>
        );

      case 'radio':
        return (
          <div className="space-y-2">
            {options.map((option: string, index: number) => (
              <label key={index} className="flex items-center">
                <input
                  type="radio"
                  name={`field_${field.id}`}
                  value={option}
                  checked={value === option}
                  onChange={(e) => updateResponse(field.id!, e.target.value)}
                  className="mr-2 border-slate-300 text-blue-600 focus:ring-blue-500"
                  required={field.is_required}
                  disabled={readonly}
                />
                <span className="text-sm text-slate-700">{option}</span>
              </label>
            ))}
          </div>
        );

      case 'checkbox':
        return (
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={value || false}
              onChange={(e) => updateResponse(field.id!, e.target.checked)}
              className="mr-2 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              disabled={readonly}
            />
            <span className="text-sm text-slate-700">Sim</span>
          </label>
        );

      case 'boolean':
        return (
          <div className="flex items-center gap-4">
            <label className="flex items-center">
              <input
                type="radio"
                name={`field_${field.id}`}
                value="true"
                checked={value === true || value === 'true'}
                onChange={() => {
                  console.log('Boolean true selected for field', field.id);
                  updateResponse(field.id!, true);
                }}
                className="mr-2 border-slate-300 text-green-600 focus:ring-green-500"
                disabled={readonly}
              />
              <span className="text-sm text-green-700">Conforme</span>
            </label>
            <label className="flex items-center">
              <input
                type="radio"
                name={`field_${field.id}`}
                value="false"
                checked={value === false || value === 'false'}
                onChange={() => {
                  console.log('Boolean false selected for field', field.id);
                  updateResponse(field.id!, false);
                }}
                className="mr-2 border-slate-300 text-red-600 focus:ring-red-500"
                disabled={readonly}
              />
              <span className="text-sm text-red-700">Não Conforme</span>
            </label>
          </div>
        );

      case 'number':
        return (
          <input
            type="number"
            value={value || ''}
            onChange={(e) => updateResponse(field.id!, parseFloat(e.target.value))}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            required={field.is_required}
            disabled={readonly}
          />
        );

      case 'date':
        return (
          <input
            type="date"
            value={value || ''}
            onChange={(e) => updateResponse(field.id!, e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            required={field.is_required}
            disabled={readonly}
          />
        );

      case 'time':
        return (
          <input
            type="time"
            value={value || ''}
            onChange={(e) => updateResponse(field.id!, e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            required={field.is_required}
            disabled={readonly}
          />
        );

      case 'rating':
        return (
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((rating) => (
              <button
                key={rating}
                type="button"
                onClick={() => updateResponse(field.id!, rating)}
                className={`p-1 ${value >= rating ? 'text-yellow-400' : 'text-slate-300'} hover:text-yellow-400 transition-colors`}
                disabled={readonly}
              >
                <Star className="w-6 h-6 fill-current" />
              </button>
            ))}
            <span className="ml-2 text-sm text-slate-600">
              {value ? `${value}/5` : 'Não avaliado'}
            </span>
          </div>
        );

      

      default:
        return (
          <input
            type="text"
            value={value || ''}
            onChange={(e) => updateResponse(field.id!, e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            required={field.is_required}
            disabled={readonly}
          />
        );
    }
  };

  const sortedFields = [...fields].sort((a, b) => a.order_index - b.order_index);

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {sortedFields.map((field, index) => {
        const inspectionItem = getInspectionItemForField(field.id!);
        const itemId = inspectionItem?.id;
        
        return (
          <div key={field.id} className="border border-slate-300 rounded-lg p-6 space-y-6">
            {/* Pergunta */}
            <div className="flex items-start gap-3">
              <span className="inline-flex items-center justify-center w-6 h-6 bg-blue-100 text-blue-800 text-sm font-semibold rounded-full flex-shrink-0">
                {index + 1}
              </span>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-slate-900">
                    {field.field_name}
                    {field.is_required && <span className="text-red-500 ml-1">*</span>}
                  </h3>
                  {!readonly && inspectionId && (
                    <button
                      type="button"
                      onClick={() => handleGenerateResponseWithAI(field.id!)}
                      disabled={generatingResponse[field.id!]}
                      className="flex items-center px-3 py-1 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      title="Gerar resposta com IA baseada no contexto da inspeção"
                    >
                      {generatingResponse[field.id!] ? (
                        <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                      ) : (
                        <Brain className="w-3 h-3 mr-1" />
                      )}
                      {generatingResponse[field.id!] ? 'Gerando...' : 'IA'}
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Resposta */}
            <div>
              <h4 className="text-sm font-medium text-slate-700 mb-2">Resposta</h4>
              <div className="pl-4 border-l-2 border-slate-200">
                {renderField(field)}
              </div>
            </div>
            
            {/* Comentário do usuário */}
            <div className="bg-slate-50 p-3 rounded border border-slate-200">
              <h4 className="text-sm font-medium text-slate-700 mb-2 flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-slate-600" /> Comentários/Observações
              </h4>
              <textarea
                value={comments[field.id!] || ''}
                onChange={(e) => updateComment(field.id!, e.target.value)}
                placeholder="Adicione comentários ou observações sobre este item..."
                rows={2}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={readonly}
              />
            </div>
            
            {/* Multimodal AI Analysis Component */}
            {inspectionId && itemId && (
              <ChecklistItemAnalysis
                itemId={itemId}
                inspectionId={inspectionId}
                fieldId={field.id!}
                fieldName={field.field_name}
                fieldType={field.field_type}
                responseValue={responses[field.id!]}
                existingMedia={itemsMedia[itemId] || []}
                onMediaUploaded={(media) => handleMediaUploaded(itemId, media)}
                onMediaDeleted={(mediaId) => handleMediaDeleted(itemId, mediaId)}
                onActionPlanGenerated={(plan) => handleActionPlanGenerated(itemId, plan)}
                existingActionPlan={itemsActionPlans[itemId]}
                preAnalysis={itemsPreAnalysis[itemId]}
                onPreAnalysisGenerated={(analysis) => handlePreAnalysisGenerated(itemId, analysis)}
              />
            )}
          </div>
        );
      })}
      
      {!readonly && (
        <div className="flex justify-end pt-6 border-t border-slate-200">
          <button
            type="submit"
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Salvar Respostas
          </button>
        </div>
      )}
    </form>
  );
}
