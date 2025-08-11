import { useState } from 'react';
import { useNavigate } from 'react-router';
import Layout from '@/react-app/components/Layout';
import ChecklistPreview from '@/react-app/components/ChecklistPreview';
import { 
  Brain, 
  ArrowLeft, 
  Sparkles, 
  RefreshCw,
  AlertCircle
} from 'lucide-react';

export default function AIChecklistGenerator() {
  const navigate = useNavigate();
  const [generating, setGenerating] = useState(false);
  const [generatedTemplate, setGeneratedTemplate] = useState<any>(null);
  const [error, setError] = useState<string>('');
  
  const [formData, setFormData] = useState({
    industry: '',
    location_type: '',
    template_name: '',
    category: '',
    num_questions: 10,
    specific_requirements: ''
  });

  const industryOptions = [
    'Construção Civil',
    'Indústria Química',
    'Indústria Alimentícia',
    'Metalurgia',
    'Hospitalar',
    'Educacional',
    'Comercial',
    'Logística e Transporte',
    'Energia e Utilities',
    'Outro'
  ];

  const locationTypes = [
    'Escritório',
    'Fábrica',
    'Canteiro de Obras',
    'Laboratório',
    'Hospital',
    'Escola',
    'Armazém',
    'Área Externa',
    'Oficina',
    'Outro'
  ];

  const handleGenerate = async () => {
    if (!formData.industry || !formData.location_type || !formData.template_name || !formData.category) {
      setError('Por favor, preencha todos os campos obrigatórios.');
      return;
    }

    setGenerating(true);
    setError('');
    
    try {
      console.log('Gerando checklist simples...', formData);

      const response = await fetch('/api/checklist/checklist-templates/generate-ai-simple', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          industry: formData.industry,
          location_type: formData.location_type,
          template_name: formData.template_name,
          category: formData.category,
          num_questions: formData.num_questions,
          specific_requirements: formData.specific_requirements,
          detail_level: 'basico',
          priority_focus: 'seguranca'
        })
      });

      if (!response.ok) {
        throw new Error(`Erro ${response.status}: Falha ao gerar checklist`);
      }

      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'Falha ao gerar checklist');
      }
      
      setGeneratedTemplate(result);
      console.log('Checklist gerado com sucesso!');
      
    } catch (error) {
      console.error('Erro:', error);
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      
      if (errorMessage.includes('502') || errorMessage.includes('timeout')) {
        setError('⏱️ Servidor sobrecarregado. Tente com menos perguntas (5-8) ou aguarde alguns minutos.');
      } else {
        setError(`❌ ${errorMessage}`);
      }
    } finally {
      setGenerating(false);
    }
  };

  const handleSave = async (template: any, fields: any[]) => {
    setGenerating(true);
    try {
      const response = await fetch('/api/checklist/checklist-templates/save-generated', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template, fields })
      });

      if (!response.ok) {
        throw new Error('Erro ao salvar template');
      }

      const result = await response.json();
      navigate(`/checklists/${result.id}`);
    } catch (error) {
      console.error('Erro:', error);
      setError('Erro ao salvar template. Tente novamente.');
    } finally {
      setGenerating(false);
    }
  };

  const handleRegenerate = () => {
    setGeneratedTemplate(null);
    handleGenerate();
  };

  return (
    <Layout>
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/checklists')}
            className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="font-heading text-3xl font-bold text-slate-900 flex items-center gap-3">
              <div className="p-2 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg">
                <Brain className="w-6 h-6 text-white" />
              </div>
              Gerador Simples de Checklist IA
            </h1>
            <p className="text-slate-600 mt-1">
              Versão simplificada para gerar checklists rapidamente
            </p>
          </div>
        </div>

        {!generatedTemplate ? (
          <div className="space-y-6">
            {/* Error Alert */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
                <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
                <p className="text-red-800">{error}</p>
              </div>
            )}

            {/* Simple Form */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Setor/Indústria *
                  </label>
                  <select
                    value={formData.industry}
                    onChange={(e) => setFormData({ ...formData, industry: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  >
                    <option value="">Selecione o setor</option>
                    {industryOptions.map(industry => (
                      <option key={industry} value={industry}>{industry}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Tipo de Local *
                  </label>
                  <select
                    value={formData.location_type}
                    onChange={(e) => setFormData({ ...formData, location_type: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  >
                    <option value="">Selecione o tipo de local</option>
                    {locationTypes.map(type => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Nome do Template *
                  </label>
                  <input
                    type="text"
                    value={formData.template_name}
                    onChange={(e) => setFormData({ ...formData, template_name: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Ex: Checklist de Segurança - Construção"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Categoria *
                  </label>
                  <input
                    type="text"
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Ex: Segurança, EPIs, Equipamentos"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Número de Perguntas: {formData.num_questions}
                  </label>
                  <input
                    type="range"
                    min="5"
                    max="15"
                    value={formData.num_questions}
                    onChange={(e) => setFormData({ ...formData, num_questions: parseInt(e.target.value) })}
                    className="w-full accent-blue-500"
                  />
                  <div className="flex justify-between text-xs text-slate-500 mt-1">
                    <span>5 (Rápido)</span>
                    <span>15 (Detalhado)</span>
                  </div>
                </div>
              </div>

              <div className="mt-6">
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Requisitos Específicos (Opcional)
                </label>
                <textarea
                  rows={3}
                  value={formData.specific_requirements}
                  onChange={(e) => setFormData({ ...formData, specific_requirements: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Descreva requisitos específicos, equipamentos especiais, etc..."
                />
              </div>
            </div>

            {/* Generate Button */}
            <div className="flex justify-center">
              <button
                onClick={handleGenerate}
                disabled={generating || !formData.industry || !formData.location_type}
                className="flex items-center px-8 py-4 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg hover:from-purple-700 hover:to-pink-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-lg font-medium"
              >
                {generating ? (
                  <>
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white mr-3"></div>
                    Gerando...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-6 h-6 mr-3" />
                    Gerar Checklist
                  </>
                )}
              </button>
            </div>

            {/* Tips */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h3 className="text-sm font-medium text-blue-900 mb-2">💡 Dicas para melhor resultado:</h3>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>• Use 5-10 perguntas para gerar mais rápido</li>
                <li>• Seja específico no setor e tipo de local</li>
                <li>• Se der erro 502, tente com menos perguntas</li>
              </ul>
            </div>
          </div>
        ) : (
          /* Generated Template Preview */
          <ChecklistPreview
            template={generatedTemplate?.template || {}}
            fields={generatedTemplate?.fields || []}
            onSave={handleSave}
            onCancel={() => setGeneratedTemplate(null)}
            loading={generating}
            title="Preview do Checklist Gerado por IA"
          />
        )}

        {/* Regenerate Button */}
        {generatedTemplate && (
          <div className="flex justify-center">
            <button
              onClick={handleRegenerate}
              disabled={generating}
              className="flex items-center px-6 py-3 text-purple-600 border border-purple-200 rounded-lg hover:bg-purple-50 transition-colors"
            >
              <RefreshCw className={`w-5 h-5 mr-2 ${generating ? 'animate-spin' : ''}`} />
              Gerar Novo Checklist
            </button>
          </div>
        )}
      </div>
    </Layout>
  );
}
