/*
  # Dados iniciais do sistema COMPIA

  1. Organização Master
    - Cria a organização principal do sistema
  
  2. Assistentes de IA
    - Especialistas em diferentes áreas de segurança
  
  3. Templates de Checklist
    - Categorias organizadas hierarquicamente
    - Templates padrão para diferentes tipos de inspeção
  
  4. Permissões de Perfil
    - Configurações padrão de permissões por role
*/

-- Create master organization
INSERT INTO organizations (
  id, name, type, description, organization_level, subscription_status, 
  subscription_plan, max_users, max_subsidiaries, is_active
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  'COMPIA Master',
  'master',
  'Organização principal do sistema COMPIA',
  'master',
  'active',
  'enterprise',
  1000,
  100,
  true
) ON CONFLICT (id) DO NOTHING;

-- Insert AI assistants
INSERT INTO ai_assistants (name, description, specialization, instructions) VALUES 
('Especialista em NR 12', 'Especialista em segurança de máquinas e equipamentos', 'NR-12', 'Você é um especialista sênior em segurança de máquinas e equipamentos conforme NR-12. Foque em dispositivos de segurança, proteções, sistemas de parada de emergência, manutenção preventiva e treinamento operacional. Identifique riscos mecânicos, pontos de prensamento, corte e esmagamento. Priorize a adequação às normas técnicas ABNT NBR 14153, NBR 14009 e outras relacionadas.'),
('Especialista em Ergonomia', 'Especialista em ergonomia e saúde ocupacional', 'NR-17', 'Você é um especialista em ergonomia e saúde ocupacional conforme NR-17. Analise posturas, movimentos repetitivos, levantamento de peso, mobiliário, iluminação e organização do trabalho. Identifique riscos de LER/DORT, fadiga muscular e desconforto postural. Sugira melhorias no ambiente e nas condições de trabalho.'),
('Especialista em EPIs', 'Especialista em equipamentos de proteção individual', 'NR-06', 'Você é um especialista em equipamentos de proteção individual conforme NR-06. Avalie a adequação, conservação, uso correto e fornecimento de EPIs. Verifique CA (Certificado de Aprovação), treinamento de uso, higienização e substituição. Identifique necessidades de proteção respiratória, auditiva, visual, de mãos, pés e corpo.'),
('Especialista em Altura', 'Especialista em trabalho em altura', 'NR-35', 'Você é um especialista em trabalho em altura conforme NR-35. Foque em sistemas de proteção contra quedas, ancoragem, trava-quedas, cinturões e acessórios. Avalie treinamento, capacitação e aptidão médica. Identifique riscos de queda e medidas preventivas para trabalhos acima de 2 metros.'),
('Psicólogo do Trabalho', 'Especialista em fatores psicossociais e saúde mental', 'Psicologia', 'Você é um psicólogo especialista em saúde mental no trabalho. Analise fatores psicossociais, estresse ocupacional, relacionamento interpessoal, pressão temporal, autonomia e reconhecimento. Identifique riscos de burnout, ansiedade, depressão e outros transtornos mentais relacionados ao trabalho. Sugira melhorias no clima organizacional.');

-- Create main category folder
INSERT INTO checklist_templates (
  name, description, category, is_public, is_category_folder,
  folder_color, folder_icon, display_order, created_by
) VALUES (
  'Segurança do Trabalho',
  'Pasta para organizar todos os checklists de segurança do trabalho',
  'Segurança',
  true,
  true,
  '#DC2626',
  'shield',
  0,
  'system'
) ON CONFLICT DO NOTHING;

-- Insert default role permissions
INSERT INTO role_permissions (role, permission_type, is_allowed) VALUES
-- System Admin (all permissions)
('system_admin', 'checklist_create', true),
('system_admin', 'checklist_edit_all', true),
('system_admin', 'checklist_delete_all', true),
('system_admin', 'checklist_view_all', true),

-- Org Admin (organization scope)
('org_admin', 'checklist_create', true),
('org_admin', 'checklist_edit_org', true),
('org_admin', 'checklist_delete_org', true),
('org_admin', 'checklist_view_org', true),

-- Manager (department scope)
('manager', 'checklist_create', true),
('manager', 'checklist_edit_own', true),
('manager', 'checklist_delete_own', true),
('manager', 'checklist_view_org', true),

-- Inspector/Técnico (can create and manage own)
('inspector', 'checklist_create', true),
('inspector', 'checklist_edit_own', true),
('inspector', 'checklist_delete_own', true),
('inspector', 'checklist_view_org', true),

-- Client (view only)
('client', 'checklist_create', false),
('client', 'checklist_edit_own', false),
('client', 'checklist_delete_own', false),
('client', 'checklist_view_org', true)
ON CONFLICT DO NOTHING;