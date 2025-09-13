/*
  # Schema inicial do COMPIA - Sistema de Inspeções de Segurança

  1. Tabelas Principais
    - `organizations` - Organizações (empresas, consultorias, clientes)
    - `users` - Usuários do sistema com perfis e permissões
    - `inspections` - Inspeções de segurança do trabalho
    - `inspection_items` - Itens de checklist das inspeções
    - `inspection_media` - Mídias anexadas (fotos, vídeos, áudios)
    - `action_items` - Planos de ação 5W2H
    - `checklist_templates` - Templates de checklist
    - `checklist_fields` - Campos dos templates
    - `ai_assistants` - Assistentes de IA especializados

  2. Tabelas de Controle
    - `user_invitations` - Convites de usuários
    - `inspection_shares` - Compartilhamentos de inspeção
    - `role_permissions` - Permissões por perfil
    - `activity_log` - Log de atividades

  3. Segurança
    - RLS habilitado em todas as tabelas
    - Políticas baseadas em organização e perfil
    - Controle de acesso granular
*/

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Organizations table
CREATE TABLE organizations (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  type text DEFAULT 'company',
  description text,
  logo_url text,
  contact_email text,
  contact_phone text,
  address text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- Professional fields
  cnpj text,
  razao_social text,
  nome_fantasia text,
  cnae_principal text,
  cnae_descricao text,
  natureza_juridica text,
  data_abertura date,
  capital_social decimal,
  porte_empresa text,
  situacao_cadastral text,
  numero_funcionarios integer,
  setor_industria text,
  subsetor_industria text,
  certificacoes_seguranca text,
  data_ultima_auditoria date,
  nivel_risco text DEFAULT 'medio',
  contato_seguranca_nome text,
  contato_seguranca_email text,
  contato_seguranca_telefone text,
  historico_incidentes text,
  observacoes_compliance text,
  website text,
  faturamento_anual decimal,
  
  -- Hierarchy
  parent_organization_id uuid REFERENCES organizations(id),
  organization_level text DEFAULT 'company',
  subscription_status text DEFAULT 'active',
  subscription_plan text DEFAULT 'basic',
  max_users integer DEFAULT 50,
  max_subsidiaries integer DEFAULT 0
);

-- Users table
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  email text UNIQUE NOT NULL,
  name text,
  role text DEFAULT 'inspector',
  organization_id uuid REFERENCES organizations(id),
  phone text,
  avatar_url text,
  is_active boolean DEFAULT true,
  last_login_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- Multi-tenant fields
  can_manage_users boolean DEFAULT false,
  can_create_organizations boolean DEFAULT false,
  managed_organization_id uuid REFERENCES organizations(id),
  invitation_token text,
  invited_by uuid REFERENCES users(id),
  invitation_expires_at timestamptz,
  
  -- Auth fields
  password_hash text,
  email_verified_at timestamptz,
  profile_completed boolean DEFAULT false
);

-- Inspections table
CREATE TABLE inspections (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  title text NOT NULL,
  description text,
  location text NOT NULL,
  company_name text,
  cep text,
  address text,
  latitude decimal,
  longitude decimal,
  inspector_name text NOT NULL,
  inspector_email text,
  responsible_name text,
  status text DEFAULT 'pendente',
  priority text DEFAULT 'media',
  scheduled_date date,
  completed_date date,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- Multi-tenant
  organization_id uuid REFERENCES organizations(id),
  created_by uuid REFERENCES users(id),
  
  -- Action plan
  action_plan text,
  action_plan_type text DEFAULT '5w2h',
  
  -- AI
  ai_assistant_id uuid,
  
  -- Signatures
  inspector_signature text,
  responsible_signature text
);

-- Inspection items table
CREATE TABLE inspection_items (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  inspection_id uuid NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
  category text NOT NULL,
  item_description text NOT NULL,
  is_compliant boolean,
  observations text,
  photo_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- Template support
  template_id uuid,
  field_responses jsonb,
  
  -- AI analysis
  ai_action_plan text,
  ai_pre_analysis text
);

-- Inspection media table
CREATE TABLE inspection_media (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  inspection_id uuid NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
  inspection_item_id uuid REFERENCES inspection_items(id) ON DELETE CASCADE,
  media_type text NOT NULL,
  file_name text NOT NULL,
  file_url text NOT NULL,
  file_size integer,
  mime_type text,
  description text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Action items table
CREATE TABLE action_items (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  inspection_id uuid NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
  inspection_item_id uuid REFERENCES inspection_items(id) ON DELETE CASCADE,
  title text NOT NULL,
  what_description text,
  where_location text,
  why_reason text,
  how_method text,
  who_responsible text,
  when_deadline date,
  how_much_cost text,
  status text DEFAULT 'pending',
  priority text DEFAULT 'media',
  is_ai_generated boolean DEFAULT false,
  assigned_to uuid REFERENCES users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Checklist templates table
CREATE TABLE checklist_templates (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  description text,
  category text NOT NULL,
  created_by text,
  created_by_user_id uuid REFERENCES users(id),
  organization_id uuid REFERENCES organizations(id),
  is_public boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- Hierarchical support
  parent_category_id uuid REFERENCES checklist_templates(id),
  category_path text,
  is_category_folder boolean DEFAULT false,
  folder_color text DEFAULT '#3B82F6',
  folder_icon text DEFAULT 'folder',
  display_order integer DEFAULT 0
);

-- Checklist fields table
CREATE TABLE checklist_fields (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  template_id uuid NOT NULL REFERENCES checklist_templates(id) ON DELETE CASCADE,
  field_name text NOT NULL,
  field_type text NOT NULL,
  is_required boolean DEFAULT false,
  options text,
  order_index integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- AI assistants table
CREATE TABLE ai_assistants (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  description text,
  specialization text NOT NULL,
  instructions text NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- User invitations table
CREATE TABLE user_invitations (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  email text NOT NULL,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  role text NOT NULL,
  invited_by uuid NOT NULL REFERENCES users(id),
  invitation_token text UNIQUE NOT NULL,
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Inspection shares table
CREATE TABLE inspection_shares (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  inspection_id uuid NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
  share_token text UNIQUE NOT NULL,
  created_by uuid NOT NULL REFERENCES users(id),
  permission text DEFAULT 'view',
  expires_at timestamptz,
  is_active boolean DEFAULT true,
  access_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Role permissions table
CREATE TABLE role_permissions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  role text NOT NULL,
  permission_type text NOT NULL,
  is_allowed boolean DEFAULT true,
  organization_id uuid REFERENCES organizations(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Activity log table
CREATE TABLE activity_log (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES users(id),
  organization_id uuid REFERENCES organizations(id),
  action_type text NOT NULL,
  action_description text NOT NULL,
  target_type text,
  target_id text,
  metadata jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE inspection_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE inspection_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE action_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE checklist_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE checklist_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_assistants ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE inspection_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;

-- RLS Policies for organizations
CREATE POLICY "Users can view organizations they belong to"
  ON organizations FOR SELECT
  TO authenticated
  USING (
    id IN (
      SELECT organization_id FROM users WHERE id = auth.uid()
      UNION
      SELECT managed_organization_id FROM users WHERE id = auth.uid()
      UNION
      SELECT id FROM organizations WHERE parent_organization_id IN (
        SELECT managed_organization_id FROM users WHERE id = auth.uid()
      )
    )
    OR EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role = 'system_admin'
    )
  );

CREATE POLICY "Admins can manage organizations"
  ON organizations FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() 
      AND (role = 'system_admin' OR can_manage_users = true)
    )
  );

-- RLS Policies for users
CREATE POLICY "Users can view their own profile"
  ON users FOR SELECT
  TO authenticated
  USING (id = auth.uid());

CREATE POLICY "Admins can view users in their scope"
  ON users FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
      AND (
        u.role = 'system_admin'
        OR (u.role = 'org_admin' AND (
          users.organization_id = u.managed_organization_id
          OR users.organization_id IN (
            SELECT id FROM organizations WHERE parent_organization_id = u.managed_organization_id
          )
        ))
      )
    )
  );

CREATE POLICY "Users can update their own profile"
  ON users FOR UPDATE
  TO authenticated
  USING (id = auth.uid());

CREATE POLICY "Admins can manage users"
  ON users FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() 
      AND (role = 'system_admin' OR can_manage_users = true)
    )
  );

-- RLS Policies for inspections
CREATE POLICY "Users can view inspections in their organization"
  ON inspections FOR SELECT
  TO authenticated
  USING (
    created_by = auth.uid()
    OR organization_id IN (
      SELECT organization_id FROM users WHERE id = auth.uid()
      UNION
      SELECT managed_organization_id FROM users WHERE id = auth.uid()
      UNION
      SELECT id FROM organizations WHERE parent_organization_id IN (
        SELECT managed_organization_id FROM users WHERE id = auth.uid()
      )
    )
    OR EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role = 'system_admin'
    )
    OR id IN (
      SELECT inspection_id FROM inspection_shares 
      WHERE is_active = true AND expires_at > now()
    )
  );

CREATE POLICY "Users can create inspections"
  ON inspections FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Users can update their inspections"
  ON inspections FOR UPDATE
  TO authenticated
  USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() 
      AND (role = 'system_admin' OR role = 'org_admin')
    )
  );

-- RLS Policies for inspection_items
CREATE POLICY "Users can view inspection items"
  ON inspection_items FOR SELECT
  TO authenticated
  USING (
    inspection_id IN (
      SELECT id FROM inspections WHERE 
        created_by = auth.uid()
        OR organization_id IN (
          SELECT organization_id FROM users WHERE id = auth.uid()
          UNION
          SELECT managed_organization_id FROM users WHERE id = auth.uid()
        )
        OR EXISTS (
          SELECT 1 FROM users WHERE id = auth.uid() AND role = 'system_admin'
        )
    )
  );

CREATE POLICY "Users can manage inspection items"
  ON inspection_items FOR ALL
  TO authenticated
  USING (
    inspection_id IN (
      SELECT id FROM inspections WHERE created_by = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('system_admin', 'org_admin')
    )
  );

-- RLS Policies for checklist_templates
CREATE POLICY "Users can view public templates or their own"
  ON checklist_templates FOR SELECT
  TO authenticated
  USING (
    is_public = true
    OR created_by_user_id = auth.uid()
    OR organization_id IN (
      SELECT organization_id FROM users WHERE id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role = 'system_admin'
    )
  );

CREATE POLICY "Users can create templates"
  ON checklist_templates FOR INSERT
  TO authenticated
  WITH CHECK (created_by_user_id = auth.uid());

CREATE POLICY "Users can update their templates"
  ON checklist_templates FOR UPDATE
  TO authenticated
  USING (
    created_by_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role = 'system_admin'
    )
  );

-- RLS Policies for ai_assistants
CREATE POLICY "All authenticated users can view AI assistants"
  ON ai_assistants FOR SELECT
  TO authenticated
  USING (is_active = true);

CREATE POLICY "Only system admins can manage AI assistants"
  ON ai_assistants FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role = 'system_admin'
    )
  );

-- Create indexes for performance
CREATE INDEX idx_organizations_parent ON organizations(parent_organization_id);
CREATE INDEX idx_users_organization ON users(organization_id);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_inspections_organization ON inspections(organization_id);
CREATE INDEX idx_inspections_created_by ON inspections(created_by);
CREATE INDEX idx_inspection_items_inspection ON inspection_items(inspection_id);
CREATE INDEX idx_inspection_media_inspection ON inspection_media(inspection_id);
CREATE INDEX idx_action_items_inspection ON action_items(inspection_id);
CREATE INDEX idx_checklist_fields_template ON checklist_fields(template_id);
CREATE INDEX idx_activity_log_user ON activity_log(user_id);
CREATE INDEX idx_activity_log_organization ON activity_log(organization_id);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Add updated_at triggers
CREATE TRIGGER update_organizations_updated_at BEFORE UPDATE ON organizations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_inspections_updated_at BEFORE UPDATE ON inspections FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_inspection_items_updated_at BEFORE UPDATE ON inspection_items FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_inspection_media_updated_at BEFORE UPDATE ON inspection_media FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_action_items_updated_at BEFORE UPDATE ON action_items FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_checklist_templates_updated_at BEFORE UPDATE ON checklist_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_checklist_fields_updated_at BEFORE UPDATE ON checklist_fields FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();