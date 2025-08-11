import { useState, useEffect } from 'react';
import { Link } from 'react-router';
import Layout from '@/react-app/components/Layout';
import NewCategoryModal from '@/react-app/components/NewCategoryModal';
import { 
  Plus, 
  Search, 
  Brain,
  Upload,
  Download,
  Copy,
  Edit,
  Trash2,
  Eye,
  Users,
  Lock,
  Folder,
  FolderOpen,
  ChevronRight,
  FileText,
  Shield,
  BookOpen,
  Settings,
  Leaf,
  Award,
  Cog,
  HardHat,
  Mountain,
  ShieldCheck,
  UserCheck,
  ArrowLeft,
  FolderPlus
} from 'lucide-react';
import { ChecklistTemplate, CategoryFolder } from '@/shared/checklist-types';

export default function ChecklistTemplates() {
  const [templates, setTemplates] = useState<ChecklistTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [csvLoading, setCsvLoading] = useState(false);
  const [currentFolder, setCurrentFolder] = useState<number | null>(null);
  const [breadcrumb, setBreadcrumb] = useState<CategoryFolder[]>([]);
  const [showNewCategoryModal, setShowNewCategoryModal] = useState(false);
  const [categoryLoading, setCategoryLoading] = useState(false);

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    try {
      const response = await fetch('/api/checklist/checklist-templates');
      if (response.ok) {
        const data = await response.json();
        setTemplates(data.templates || []);
      }
    } catch (error) {
      console.error('Erro ao carregar templates:', error);
    } finally {
      setLoading(false);
    }
  };

  const deleteTemplate = async (id: number) => {
    if (!confirm('Tem certeza que deseja excluir este template?')) return;
    
    try {
      const response = await fetch(`/api/checklist/checklist-templates/${id}`, {
        method: 'DELETE'
      });
      if (response.ok) {
        fetchTemplates();
      }
    } catch (error) {
      console.error('Erro ao excluir template:', error);
    }
  };

  const duplicateTemplate = async (template: ChecklistTemplate) => {
    try {
      const response = await fetch(`/api/checklist/checklist-templates/${template.id}/duplicate`, {
        method: 'POST'
      });
      if (response.ok) {
        fetchTemplates();
      }
    } catch (error) {
      console.error('Erro ao duplicar template:', error);
    }
  };

  const handleExportTemplates = async () => {
    setCsvLoading(true);
    try {
      const templatesWithFields = await Promise.all(
        templates.filter(t => !t.is_category_folder).map(async (template) => {
          const response = await fetch(`/api/checklist/checklist-templates/${template.id}`);
          const data = await response.json();
          return { ...template, fields: data.fields };
        })
      );

      const csvData: any[] = [];
      templatesWithFields.forEach((template) => {
        if (template.fields && template.fields.length > 0) {
          template.fields.forEach((field: any) => {
            csvData.push({
              template_nome: template.name,
              template_categoria: template.category,
              template_descricao: template.description || '',
              campo_nome: field.field_name,
              campo_tipo: field.field_type,
              obrigatorio: field.is_required ? 'Sim' : 'Não',
              opcoes: field.options || '',
              ordem: field.order_index
            });
          });
        }
      });

      const headers = 'template_nome,template_categoria,template_descricao,campo_nome,campo_tipo,obrigatorio,opcoes,ordem';
      const csvContent = [
        headers,
        ...csvData.map(row => Object.values(row).map(val => `"${val}"`).join(','))
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `templates_checklist_${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error('Erro ao exportar templates:', error);
      alert('Erro ao exportar dados. Tente novamente.');
    } finally {
      setCsvLoading(false);
    }
  };

  const handleCreateCategory = async (categoryData: any) => {
    setCategoryLoading(true);
    try {
      const response = await fetch('/api/checklist/checklist-templates/create-folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(categoryData)
      });

      if (response.ok) {
        await fetchTemplates();
        setShowNewCategoryModal(false);
      } else {
        throw new Error('Failed to create category');
      }
    } catch (error) {
      console.error('Erro ao criar categoria:', error);
      alert('Erro ao criar categoria. Tente novamente.');
    } finally {
      setCategoryLoading(false);
    }
  };

  // Get folder icon component
  const getFolderIcon = (iconName: string, className: string = "w-5 h-5") => {
    const iconMap: Record<string, any> = {
      'shield': Shield,
      'book-open': BookOpen,
      'settings': Settings,
      'leaf': Leaf,
      'award': Award,
      'cog': Cog,
      'hard-hat': HardHat,
      'mountain': Mountain,
      'shield-check': ShieldCheck,
      'user-check': UserCheck,
      'folder': Folder,
      'file-text': FileText
    };
    
    const IconComponent = iconMap[iconName] || Folder;
    return <IconComponent className={className} />;
  };

  // Build folder hierarchy
  const buildHierarchy = (): CategoryFolder[] => {
    const folders = templates.filter(t => t.is_category_folder).sort((a, b) => a.display_order! - b.display_order!);
    const regularTemplates = templates.filter(t => !t.is_category_folder);
    
    const rootFolders: CategoryFolder[] = [];
    
    folders.forEach(folder => {
      const categoryFolder: CategoryFolder = {
        ...folder,
        children: [],
        template_count: 0
      };
      
      if (!folder.parent_category_id) {
        rootFolders.push(categoryFolder);
      }
    });
    
    // Add subfolders to their parents
    folders.forEach(folder => {
      if (folder.parent_category_id) {
        const parentFolder = findFolderInHierarchy(rootFolders, folder.parent_category_id);
        if (parentFolder) {
          parentFolder.children.push({
            ...folder,
            children: [],
            template_count: 0
          } as CategoryFolder);
        }
      }
    });
    
    // Add templates to their folders
    regularTemplates.forEach(template => {
      if (template.parent_category_id) {
        const parentFolder = findFolderInHierarchy(rootFolders, template.parent_category_id);
        if (parentFolder) {
          parentFolder.children.push(template);
          parentFolder.template_count++;
        }
      }
    });
    
    return rootFolders;
  };

  const findFolderInHierarchy = (folders: CategoryFolder[], id: number): CategoryFolder | null => {
    for (const folder of folders) {
      if (folder.id === id) return folder;
      const found = findFolderInHierarchy(folder.children.filter(c => 'children' in c) as CategoryFolder[], id);
      if (found) return found;
    }
    return null;
  };

  

  const enterFolder = (folder: CategoryFolder) => {
    setCurrentFolder(folder.id!);
    setBreadcrumb([...breadcrumb, folder]);
  };

  const goBack = () => {
    if (breadcrumb.length > 0) {
      const newBreadcrumb = [...breadcrumb];
      newBreadcrumb.pop();
      setBreadcrumb(newBreadcrumb);
      setCurrentFolder(newBreadcrumb.length > 0 ? newBreadcrumb[newBreadcrumb.length - 1].id! : null);
    } else {
      setCurrentFolder(null);
    }
  };

  const hierarchy = buildHierarchy();
  
  // Filter templates based on current folder and search
  const getDisplayItems = () => {
    if (currentFolder) {
      const folder = findFolderInHierarchy(hierarchy, currentFolder);
      if (folder) {
        return folder.children.filter(item => {
          if ('is_category_folder' in item && item.is_category_folder) {
            return item.name.toLowerCase().includes(searchTerm.toLowerCase());
          } else {
            return item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                   item.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                   item.category.toLowerCase().includes(searchTerm.toLowerCase());
          }
        });
      }
      return [];
    }
    
    // Root level
    return hierarchy.filter(folder => 
      folder.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      folder.description?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  };

  const displayItems = getDisplayItems();

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
          <div className="flex items-center gap-4">
            {currentFolder && (
              <button
                onClick={goBack}
                className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
            <div>
              <h1 className="font-heading text-3xl font-bold text-slate-900">Templates de Checklist</h1>
              <p className="text-slate-600 mt-1">
                Organize seus templates em pastas hierárquicas
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleExportTemplates}
              disabled={csvLoading}
              className="flex items-center px-4 py-2 text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
            >
              {csvLoading ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-slate-600 mr-2"></div>
              ) : (
                <Download className="w-4 h-4 mr-2" />
              )}
              Exportar CSV
            </button>
            <Link
              to="/checklists/import"
              className="flex items-center px-4 py-2 text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors"
            >
              <Upload className="w-4 h-4 mr-2" />
              Importar CSV
            </Link>
            <button
              onClick={() => setShowNewCategoryModal(true)}
              className="flex items-center px-4 py-2 text-green-600 border border-green-200 rounded-lg hover:bg-green-50 transition-colors"
            >
              <FolderPlus className="w-4 h-4 mr-2" />
              Nova Categoria
            </button>
            <Link
              to="/checklists/ai-generate"
              className="flex items-center px-4 py-2 bg-gradient-to-r from-compia-purple to-compia-blue text-white rounded-lg hover:from-compia-blue hover:to-compia-purple transition-colors"
            >
              <Brain className="w-4 h-4 mr-2" />
              Gerar com IA
            </Link>
            <Link
              to="/checklists/new"
              className="flex items-center px-4 py-2 bg-compia-blue text-white rounded-lg hover:bg-compia-purple transition-colors"
            >
              <Plus className="w-4 h-4 mr-2" />
              Novo Template
            </Link>
          </div>
        </div>

        {/* Breadcrumb */}
        {breadcrumb.length > 0 && (
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <button
              onClick={() => {
                setCurrentFolder(null);
                setBreadcrumb([]);
              }}
              className="hover:text-slate-900 transition-colors"
            >
              Templates
            </button>
            {breadcrumb.map((folder, index) => (
              <div key={folder.id} className="flex items-center gap-2">
                <ChevronRight className="w-4 h-4" />
                <button
                  onClick={() => {
                    const newBreadcrumb = breadcrumb.slice(0, index + 1);
                    setBreadcrumb(newBreadcrumb);
                    setCurrentFolder(folder.id!);
                  }}
                  className="hover:text-slate-900 transition-colors"
                  style={{ color: folder.folder_color }}
                >
                  {folder.name}
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Search */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Buscar templates e pastas..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* Templates Grid/List */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 lg:gap-6">
          {displayItems.length === 0 ? (
            <div className="col-span-full bg-white rounded-xl shadow-sm border border-slate-200 p-8 text-center">
              {currentFolder ? <FolderOpen className="w-12 h-12 text-slate-300 mx-auto mb-4" /> : <Brain className="w-12 h-12 text-slate-300 mx-auto mb-4" />}
              <p className="text-slate-500 font-medium">
                {currentFolder 
                  ? 'Esta pasta está vazia' 
                  : templates.length === 0 
                    ? 'Nenhum template encontrado' 
                    : 'Nenhum resultado encontrado'
                }
              </p>
              <p className="text-slate-400 text-sm mt-1">
                {currentFolder 
                  ? 'Crie um novo template nesta categoria'
                  : templates.length === 0 
                    ? 'Crie seu primeiro template ou gere um com IA'
                    : 'Tente ajustar o termo de busca'
                }
              </p>
            </div>
          ) : (
            displayItems.map((item) => {
              // Check if it's a folder
              if ('children' in item) {
                const folder = item as CategoryFolder;
                return (
                  <div 
                    key={folder.id} 
                    className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 hover:shadow-md transition-all cursor-pointer group"
                    onClick={() => enterFolder(folder)}
                  >
                    <div className="flex items-center justify-between mb-4">
                      <div 
                        className="p-3 rounded-lg"
                        style={{ backgroundColor: `${folder.folder_color}20` }}
                      >
                        <div style={{ color: folder.folder_color }}>
                          {getFolderIcon(folder.folder_icon || 'folder')}
                        </div>
                      </div>
                      <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-slate-600 transition-colors" />
                    </div>
                    
                    <h3 className="font-heading text-lg font-semibold text-slate-900 mb-2">
                      {folder.name}
                    </h3>
                    
                    {folder.description && (
                      <p className="text-slate-600 text-sm mb-3 line-clamp-2">
                        {folder.description}
                      </p>
                    )}
                    
                    <div className="flex items-center justify-between text-sm text-slate-500">
                      <span>{folder.children.length} itens</span>
                      <span className="px-2 py-1 bg-slate-100 rounded">
                        {folder.category}
                      </span>
                    </div>
                  </div>
                );
              } else {
                // It's a template
                const template = item as ChecklistTemplate;
                return (
                  <div key={template.id} className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 lg:p-6 hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <FileText className="w-5 h-5 text-blue-500" />
                          <h3 className="font-heading text-lg font-semibold text-slate-900">
                            {template.name}
                          </h3>
                          <div title={template.is_public ? "Público" : "Privado"}>
                            {template.is_public ? (
                              <Users className="w-4 h-4 text-green-500" />
                            ) : (
                              <Lock className="w-4 h-4 text-slate-400" />
                            )}
                          </div>
                        </div>
                        <span className="inline-block px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
                          {template.category}
                        </span>
                      </div>
                    </div>
                    
                    {template.description && (
                      <p className="text-slate-600 text-sm mb-4 line-clamp-2">
                        {template.description}
                      </p>
                    )}
                    
                    <div className="text-xs text-slate-500 mb-4">
                      {template.created_by && (
                        <p>Criado por: {template.created_by}</p>
                      )}
                      <p>
                        {new Date(template.created_at!).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <Link
                        to={`/checklists/${template.id}`}
                        className="flex-1 flex items-center justify-center px-3 py-2 text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors text-sm"
                      >
                        <Eye className="w-4 h-4 mr-1" />
                        Ver
                      </Link>
                      
                      <Link
                        to={`/checklists/${template.id}/edit`}
                        className="flex items-center justify-center px-3 py-2 text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
                        title="Editar"
                      >
                        <Edit className="w-4 h-4" />
                      </Link>
                      
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          duplicateTemplate(template);
                        }}
                        className="flex items-center justify-center px-3 py-2 text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
                        title="Duplicar"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                      
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteTemplate(template.id!);
                        }}
                        className="flex items-center justify-center px-3 py-2 text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
                        title="Excluir"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              }
            })
          )}
        </div>

        {/* New Category Modal */}
        <NewCategoryModal
          isOpen={showNewCategoryModal}
          onClose={() => setShowNewCategoryModal(false)}
          onSave={handleCreateCategory}
          parentFolder={currentFolder ? findFolderInHierarchy(hierarchy, currentFolder) : undefined}
          loading={categoryLoading}
        />
      </div>
    </Layout>
  );
}
