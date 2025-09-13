import { supabase } from '@/lib/supabase'
import { Database } from '@/lib/supabase'

type Tables = Database['public']['Tables']

// Organizations API
export const organizationsAPI = {
  async getAll() {
    const { data, error } = await supabase
      .from('organizations')
      .select('*')
      .eq('is_active', true)
      .order('name')
    
    if (error) throw error
    return data
  },

  async getById(id: string) {
    const { data, error } = await supabase
      .from('organizations')
      .select('*')
      .eq('id', id)
      .single()
    
    if (error) throw error
    return data
  },

  async create(organization: Tables['organizations']['Insert']) {
    const { data, error } = await supabase
      .from('organizations')
      .insert(organization)
      .select()
      .single()
    
    if (error) throw error
    return data
  },

  async update(id: string, updates: Tables['organizations']['Update']) {
    const { data, error } = await supabase
      .from('organizations')
      .update(updates)
      .eq('id', id)
      .select()
      .single()
    
    if (error) throw error
    return data
  },

  async delete(id: string) {
    const { error } = await supabase
      .from('organizations')
      .delete()
      .eq('id', id)
    
    if (error) throw error
  }
}

// Users API
export const usersAPI = {
  async getAll() {
    const { data, error } = await supabase
      .from('users')
      .select(`
        *,
        organizations(name)
      `)
      .order('created_at', { ascending: false })
    
    if (error) throw error
    return data
  },

  async getById(id: string) {
    const { data, error } = await supabase
      .from('users')
      .select(`
        *,
        organizations(name)
      `)
      .eq('id', id)
      .single()
    
    if (error) throw error
    return data
  },

  async create(user: Tables['users']['Insert']) {
    const { data, error } = await supabase
      .from('users')
      .insert(user)
      .select()
      .single()
    
    if (error) throw error
    return data
  },

  async update(id: string, updates: Tables['users']['Update']) {
    const { data, error } = await supabase
      .from('users')
      .update(updates)
      .eq('id', id)
      .select()
      .single()
    
    if (error) throw error
    return data
  }
}

// Inspections API
export const inspectionsAPI = {
  async getAll(organizationId?: string) {
    let query = supabase
      .from('inspections')
      .select(`
        *,
        organizations(name),
        users(name, email)
      `)
      .order('created_at', { ascending: false })
    
    if (organizationId) {
      query = query.eq('organization_id', organizationId)
    }
    
    const { data, error } = await query
    
    if (error) throw error
    return data
  },

  async getById(id: string) {
    const { data, error } = await supabase
      .from('inspections')
      .select(`
        *,
        inspection_items(*),
        inspection_media(*),
        action_items(*),
        organizations(name)
      `)
      .eq('id', id)
      .single()
    
    if (error) throw error
    return data
  },

  async create(inspection: Tables['inspections']['Insert']) {
    const { data, error } = await supabase
      .from('inspections')
      .insert(inspection)
      .select()
      .single()
    
    if (error) throw error
    return data
  },

  async update(id: string, updates: Tables['inspections']['Update']) {
    const { data, error } = await supabase
      .from('inspections')
      .update(updates)
      .eq('id', id)
      .select()
      .single()
    
    if (error) throw error
    return data
  },

  async delete(id: string) {
    const { error } = await supabase
      .from('inspections')
      .delete()
      .eq('id', id)
    
    if (error) throw error
  }
}

// Checklist Templates API
export const checklistAPI = {
  async getTemplates() {
    const { data, error } = await supabase
      .from('checklist_templates')
      .select(`
        *,
        checklist_fields(*)
      `)
      .order('display_order')
    
    if (error) throw error
    return data
  },

  async getTemplate(id: string) {
    const { data, error } = await supabase
      .from('checklist_templates')
      .select(`
        *,
        checklist_fields(*)
      `)
      .eq('id', id)
      .single()
    
    if (error) throw error
    return data
  },

  async createTemplate(template: Tables['checklist_templates']['Insert']) {
    const { data, error } = await supabase
      .from('checklist_templates')
      .insert(template)
      .select()
      .single()
    
    if (error) throw error
    return data
  }
}

// AI Assistants API
export const aiAPI = {
  async getAssistants() {
    const { data, error } = await supabase
      .from('ai_assistants')
      .select('*')
      .eq('is_active', true)
      .order('name')
    
    if (error) throw error
    return data
  }
}

// Dashboard API
export const dashboardAPI = {
  async getStats(organizationId?: string) {
    let query = supabase
      .from('inspections')
      .select('status')
    
    if (organizationId) {
      query = query.eq('organization_id', organizationId)
    }
    
    const { data, error } = await query
    
    if (error) throw error
    
    const stats = {
      total: data.length,
      pending: data.filter(i => i.status === 'pendente').length,
      inProgress: data.filter(i => i.status === 'em_andamento').length,
      completed: data.filter(i => i.status === 'concluida').length
    }
    
    return stats
  },

  async getActionPlanSummary(organizationId?: string) {
    let query = supabase
      .from('action_items')
      .select(`
        *,
        inspections!inner(organization_id)
      `)
    
    if (organizationId) {
      query = query.eq('inspections.organization_id', organizationId)
    }
    
    const { data, error } = await query
    
    if (error) throw error
    
    const summary = {
      total_actions: data.length,
      pending_actions: data.filter(a => a.status === 'pending').length,
      in_progress_actions: data.filter(a => a.status === 'in_progress').length,
      completed_actions: data.filter(a => a.status === 'completed').length,
      overdue_actions: data.filter(a => 
        a.when_deadline && 
        new Date(a.when_deadline) < new Date() && 
        a.status !== 'completed'
      ).length,
      high_priority_pending: data.filter(a => 
        a.priority === 'alta' && a.status === 'pending'
      ).length,
      ai_generated_count: data.filter(a => a.is_ai_generated).length
    }
    
    return summary
  }
}