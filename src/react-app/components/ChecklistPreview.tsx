import { useState } from 'react';
import { 
  Save, 
  Plus, 
  Trash2, 
  GripVertical,
  Edit,
  X
} from 'lucide-react';
import { ChecklistTemplate, ChecklistField, ChecklistFieldType } from '@/shared/checklist-types';

interface ChecklistPreviewProps {
  template: Partial<ChecklistTemplate>;
  fields: Partial<ChecklistField>[];
  onSave: (template: Partial<ChecklistTemplate>, fields: Partial<ChecklistField>[]) => void;
  onCancel: () => void;
  loading?: boolean;
  title: string;
}

export default function ChecklistPreview({ template, fields, onSave, onCancel, loading, title }: ChecklistPreviewProps) {
  const [editedTemplate, setEditedTemplate] = useState<Partial<ChecklistTemplate>>(template);
  const [editedFields, setEditedFields] = useState<Partial<ChecklistField>[]>(fields);
  const [editingField, setEditingField] = useState<number | null>(null);

  const fieldTypes: { value: ChecklistFieldType; label: string }[] = [
    { value: 'text', label: 'Texto Curto' },
    { value: 'textarea', label: 'Texto Longo' },
    { value: 'select', label: 'Lista Suspensa' },
    { value: 'multiselect', label: 'Múltipla Escolha' },
    { value: 'radio', label: 'Escolha Única' },
    { value: 'checkbox', label: 'Caixa de Seleção' },
    { value: 'boolean', label: 'Conforme/Não Conforme' },
    { value: 'number', label: 'Número' },
    { value: 'date', label: 'Data' },
    { value: 'time', label: 'Hora' },
    { value: 'rating', label: 'Avaliação (1-5)' }
  ];

  const addField = () => {
    const newField: Partial<ChecklistField> = {
      field_name: 'Nova pergunta',
      field_type: 'text',
      is_required: false,
      options: '',
      order_index: editedFields.length
    };
    setEditedFields([...editedFields, newField]);
    setEditingField(editedFields.length);
  };

  const removeField = (index: number) => {
    const newFields = editedFields.filter((_, i) => i !== index);
    // Update order indices
    newFields.forEach((field, i) => {
      field.order_index = i;
    });
    setEditedFields(newFields);
    setEditingField(null);
  };

  const updateField = (index: number, updates: Partial<ChecklistField>) => {
    const newFields = [...editedFields];
    newFields[index] = { ...newFields[index], ...updates };
    setEditedFields(newFields);
  };

  const moveField = (index: number, direction: 'up' | 'down') => {
    const newFields = [...editedFields];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    
    if (targetIndex >= 0 && targetIndex < editedFields.length) {
      [newFields[index], newFields[targetIndex]] = [newFields[targetIndex], newFields[index]];
      
      // Update order indices
      newFields.forEach((field, i) => {
        field.order_index = i;
      });
      
      setEditedFields(newFields);
    }
  };

  const needsOptions = (fieldType: ChecklistFieldType) => {
    return ['select', 'multiselect', 'radio'].includes(fieldType);
  };

  const handleSave = () => {
    onSave(editedTemplate, editedFields);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-green-50 to-blue-50 border border-green-200 rounded-xl p-6">
        <h2 className="font-heading text-2xl font-semibold text-slate-900 mb-2">
          {title}
        </h2>
        <p className="text-slate-700">
          Revise e edite seu checklist antes de salvá-lo. Você pode modificar perguntas, tipos de resposta e ordem dos campos.
        </p>
      </div>

      {/* Template Info */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <h3 className="font-heading text-xl font-semibold text-slate-900 mb-6">
          Informações do Template
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Nome do Template *
            </label>
            <input
              type="text"
              required
              value={editedTemplate.name || ''}
              onChange={(e) => setEditedTemplate({ ...editedTemplate, name: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Ex: Checklist de EPIs"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Categoria *
            </label>
            <input
              type="text"
              required
              value={editedTemplate.category || ''}
              onChange={(e) => setEditedTemplate({ ...editedTemplate, category: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Ex: Segurança, Equipamentos, Higiene"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Descrição
            </label>
            <textarea
              rows={3}
              value={editedTemplate.description || ''}
              onChange={(e) => setEditedTemplate({ ...editedTemplate, description: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Descreva o objetivo e uso deste template..."
            />
          </div>

          <div className="md:col-span-2">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={editedTemplate.is_public || false}
                onChange={(e) => setEditedTemplate({ ...editedTemplate, is_public: e.target.checked })}
                className="mr-2 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-slate-700">
                Tornar este template público (outros usuários poderão visualizar e usar)
              </span>
            </label>
          </div>
        </div>
      </div>

      {/* Fields */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="font-heading text-xl font-semibold text-slate-900">
            Campos do Checklist ({editedFields.length})
          </h3>
          <button
            type="button"
            onClick={addField}
            className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4 mr-2" />
            Adicionar Campo
          </button>
        </div>

        <div className="space-y-4 max-h-96 overflow-y-auto">
          {editedFields.map((field, index) => (
            <div key={index} className="border border-slate-200 rounded-lg p-4 bg-slate-50">
              {editingField === index ? (
                // Edit Mode
                <div className="space-y-4">
                  <div className="flex items-center justify-between mb-4">
                    <span className="bg-blue-100 text-blue-800 text-xs font-semibold px-2 py-1 rounded-full">
                      Editando Campo {index + 1}
                    </span>
                    <button
                      onClick={() => setEditingField(null)}
                      className="p-1 text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Nome do Campo
                      </label>
                      <input
                        type="text"
                        value={field.field_name || ''}
                        onChange={(e) => updateField(index, { field_name: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="Ex: Estado dos EPIs"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Tipo do Campo
                      </label>
                      <select
                        value={field.field_type || 'text'}
                        onChange={(e) => updateField(index, { field_type: e.target.value as ChecklistFieldType })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        {fieldTypes.map(type => (
                          <option key={type.value} value={type.value}>
                            {type.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    
                    <div className="flex items-center">
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          checked={field.is_required || false}
                          onChange={(e) => updateField(index, { is_required: e.target.checked })}
                          className="mr-2 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm text-slate-700">Obrigatório</span>
                      </label>
                    </div>
                  </div>

                  {needsOptions(field.field_type!) && (
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Opções (uma por linha)
                      </label>
                      <textarea
                        rows={3}
                        value={(() => {
                          try {
                            return field.options ? JSON.parse(field.options).join('\n') : '';
                          } catch {
                            return field.options || '';
                          }
                        })()}
                        onChange={(e) => updateField(index, { 
                          options: JSON.stringify(e.target.value.split('\n').filter(Boolean))
                        })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="Conforme&#10;Não Conforme&#10;Não Aplicável"
                      />
                    </div>
                  )}

                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setEditingField(null)}
                      className="px-3 py-2 text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors text-sm"
                    >
                      Finalizar Edição
                    </button>
                  </div>
                </div>
              ) : (
                // View Mode
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="bg-blue-100 text-blue-800 text-xs font-semibold px-2 py-1 rounded-full">
                        {index + 1}
                      </span>
                      <h4 className="font-medium text-slate-800">{field.field_name}</h4>
                      {field.is_required && (
                        <span className="text-xs text-red-600 bg-red-100 px-2 py-1 rounded">
                          Obrigatório
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-sm text-slate-600">
                      <span className="capitalize bg-white px-2 py-1 rounded">
                        {fieldTypes.find(t => t.value === field.field_type)?.label || field.field_type}
                      </span>
                      {field.options && (
                        <span className="text-xs text-slate-500">
                          {JSON.parse(field.options).length} opções
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => moveField(index, 'up')}
                      disabled={index === 0}
                      className="p-1 text-slate-400 hover:text-slate-600 disabled:opacity-50"
                      title="Mover para cima"
                    >
                      <GripVertical className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => moveField(index, 'down')}
                      disabled={index === editedFields.length - 1}
                      className="p-1 text-slate-400 hover:text-slate-600 disabled:opacity-50"
                      title="Mover para baixo"
                    >
                      <GripVertical className="w-4 h-4 rotate-180" />
                    </button>
                    <button
                      onClick={() => setEditingField(index)}
                      className="p-1 text-blue-500 hover:text-blue-700"
                      title="Editar"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => removeField(index)}
                      className="p-1 text-red-500 hover:text-red-700"
                      title="Remover"
                      disabled={editedFields.length === 1}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}

          {editedFields.length === 0 && (
            <div className="text-center py-8">
              <p className="text-slate-500">Nenhum campo definido. Clique em "Adicionar Campo" para começar.</p>
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-4">
        <button
          onClick={onCancel}
          className="px-6 py-2 text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
        >
          Cancelar
        </button>
        <button
          onClick={handleSave}
          disabled={loading || !editedTemplate.name || !editedTemplate.category || editedFields.length === 0}
          className="flex items-center px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? (
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
          ) : (
            <Save className="w-4 h-4 mr-2" />
          )}
          {loading ? 'Salvando...' : 'Salvar Template'}
        </button>
      </div>
    </div>
  );
}
