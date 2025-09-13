import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Please connect to Supabase first.')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  }
})

// Database types
export interface Database {
  public: {
    Tables: {
      organizations: {
        Row: {
          id: string
          name: string
          type: string
          description?: string
          logo_url?: string
          contact_email?: string
          contact_phone?: string
          address?: string
          is_active: boolean
          created_at: string
          updated_at: string
          cnpj?: string
          razao_social?: string
          nome_fantasia?: string
          cnae_principal?: string
          cnae_descricao?: string
          natureza_juridica?: string
          data_abertura?: string
          capital_social?: number
          porte_empresa?: string
          situacao_cadastral?: string
          numero_funcionarios?: number
          setor_industria?: string
          subsetor_industria?: string
          certificacoes_seguranca?: string
          data_ultima_auditoria?: string
          nivel_risco?: string
          contato_seguranca_nome?: string
          contato_seguranca_email?: string
          contato_seguranca_telefone?: string
          historico_incidentes?: string
          observacoes_compliance?: string
          website?: string
          faturamento_anual?: number
          parent_organization_id?: string
          organization_level: string
          subscription_status: string
          subscription_plan: string
          max_users: number
          max_subsidiaries: number
        }
        Insert: {
          id?: string
          name: string
          type?: string
          description?: string
          logo_url?: string
          contact_email?: string
          contact_phone?: string
          address?: string
          is_active?: boolean
          cnpj?: string
          razao_social?: string
          nome_fantasia?: string
          cnae_principal?: string
          cnae_descricao?: string
          natureza_juridica?: string
          data_abertura?: string
          capital_social?: number
          porte_empresa?: string
          situacao_cadastral?: string
          numero_funcionarios?: number
          setor_industria?: string
          subsetor_industria?: string
          certificacoes_seguranca?: string
          data_ultima_auditoria?: string
          nivel_risco?: string
          contato_seguranca_nome?: string
          contato_seguranca_email?: string
          contato_seguranca_telefone?: string
          historico_incidentes?: string
          observacoes_compliance?: string
          website?: string
          faturamento_anual?: number
          parent_organization_id?: string
          organization_level?: string
          subscription_status?: string
          subscription_plan?: string
          max_users?: number
          max_subsidiaries?: number
        }
        Update: {
          name?: string
          type?: string
          description?: string
          logo_url?: string
          contact_email?: string
          contact_phone?: string
          address?: string
          is_active?: boolean
          updated_at?: string
          cnpj?: string
          razao_social?: string
          nome_fantasia?: string
          cnae_principal?: string
          cnae_descricao?: string
          natureza_juridica?: string
          data_abertura?: string
          capital_social?: number
          porte_empresa?: string
          situacao_cadastral?: string
          numero_funcionarios?: number
          setor_industria?: string
          subsetor_industria?: string
          certificacoes_seguranca?: string
          data_ultima_auditoria?: string
          nivel_risco?: string
          contato_seguranca_nome?: string
          contato_seguranca_email?: string
          contato_seguranca_telefone?: string
          historico_incidentes?: string
          observacoes_compliance?: string
          website?: string
          faturamento_anual?: number
          parent_organization_id?: string
          organization_level?: string
          subscription_status?: string
          subscription_plan?: string
          max_users?: number
          max_subsidiaries?: number
        }
      }
      users: {
        Row: {
          id: string
          email: string
          name?: string
          role: string
          organization_id?: string
          phone?: string
          avatar_url?: string
          is_active: boolean
          last_login_at?: string
          created_at: string
          updated_at: string
          can_manage_users: boolean
          can_create_organizations: boolean
          managed_organization_id?: string
          invitation_token?: string
          invited_by?: string
          invitation_expires_at?: string
          password_hash?: string
          email_verified_at?: string
          profile_completed: boolean
        }
        Insert: {
          id?: string
          email: string
          name?: string
          role?: string
          organization_id?: string
          phone?: string
          avatar_url?: string
          is_active?: boolean
          last_login_at?: string
          can_manage_users?: boolean
          can_create_organizations?: boolean
          managed_organization_id?: string
          invitation_token?: string
          invited_by?: string
          invitation_expires_at?: string
          password_hash?: string
          email_verified_at?: string
          profile_completed?: boolean
        }
        Update: {
          email?: string
          name?: string
          role?: string
          organization_id?: string
          phone?: string
          avatar_url?: string
          is_active?: boolean
          last_login_at?: string
          updated_at?: string
          can_manage_users?: boolean
          can_create_organizations?: boolean
          managed_organization_id?: string
          invitation_token?: string
          invited_by?: string
          invitation_expires_at?: string
          password_hash?: string
          email_verified_at?: string
          profile_completed?: boolean
        }
      }
      inspections: {
        Row: {
          id: string
          title: string
          description?: string
          location: string
          company_name?: string
          cep?: string
          address?: string
          latitude?: number
          longitude?: number
          inspector_name: string
          inspector_email?: string
          responsible_name?: string
          status: string
          priority: string
          scheduled_date?: string
          completed_date?: string
          created_at: string
          updated_at: string
          organization_id?: string
          created_by?: string
          action_plan?: string
          action_plan_type: string
          ai_assistant_id?: string
          inspector_signature?: string
          responsible_signature?: string
        }
        Insert: {
          id?: string
          title: string
          description?: string
          location: string
          company_name?: string
          cep?: string
          address?: string
          latitude?: number
          longitude?: number
          inspector_name: string
          inspector_email?: string
          responsible_name?: string
          status?: string
          priority?: string
          scheduled_date?: string
          completed_date?: string
          organization_id?: string
          created_by?: string
          action_plan?: string
          action_plan_type?: string
          ai_assistant_id?: string
          inspector_signature?: string
          responsible_signature?: string
        }
        Update: {
          title?: string
          description?: string
          location?: string
          company_name?: string
          cep?: string
          address?: string
          latitude?: number
          longitude?: number
          inspector_name?: string
          inspector_email?: string
          responsible_name?: string
          status?: string
          priority?: string
          scheduled_date?: string
          completed_date?: string
          updated_at?: string
          organization_id?: string
          action_plan?: string
          action_plan_type?: string
          ai_assistant_id?: string
          inspector_signature?: string
          responsible_signature?: string
        }
      }
    }
  }
}

// Helper functions for database operations
export async function getCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

export async function getUserProfile(userId: string) {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single()
  
  if (error) throw error
  return data
}

export async function getOrganizations() {
  const { data, error } = await supabase
    .from('organizations')
    .select('*')
    .eq('is_active', true)
    .order('name')
  
  if (error) throw error
  return data
}

export async function getInspections(organizationId?: string) {
  let query = supabase
    .from('inspections')
    .select(`
      *,
      organizations(name)
    `)
    .order('created_at', { ascending: false })
  
  if (organizationId) {
    query = query.eq('organization_id', organizationId)
  }
  
  const { data, error } = await query
  
  if (error) throw error
  return data
}

export async function createInspection(inspection: Database['public']['Tables']['inspections']['Insert']) {
  const { data, error } = await supabase
    .from('inspections')
    .insert(inspection)
    .select()
    .single()
  
  if (error) throw error
  return data
}

export async function updateInspection(id: string, updates: Database['public']['Tables']['inspections']['Update']) {
  const { data, error } = await supabase
    .from('inspections')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  
  if (error) throw error
  return data
}

export async function deleteInspection(id: string) {
  const { error } = await supabase
    .from('inspections')
    .delete()
    .eq('id', id)
  
  if (error) throw error
}

export async function getChecklistTemplates() {
  const { data, error } = await supabase
    .from('checklist_templates')
    .select(`
      *,
      checklist_fields(*)
    `)
    .order('display_order')
  
  if (error) throw error
  return data
}

export async function getAIAssistants() {
  const { data, error } = await supabase
    .from('ai_assistants')
    .select('*')
    .eq('is_active', true)
    .order('name')
  
  if (error) throw error
  return data
}