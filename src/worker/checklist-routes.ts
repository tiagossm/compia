import { Hono } from "hono";
import { authMiddleware } from "@getmocha/users-service/backend";
import { USER_ROLES } from "@/shared/user-types";

const checklistRoutes = new Hono<{ Bindings: Env }>();

// List all checklist templates
checklistRoutes.get("/checklist-templates", authMiddleware, async (c) => {
  const env = c.env;
  const user = c.get("user");
  
  if (!user) {
    return c.json({ error: "User not found" }, 401);
  }
  
  try {
    const userProfile = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(user.id).first() as any;
    
    let query = `
      SELECT ct.*, 
             COUNT(cf.id) as field_count,
             ct.is_category_folder as is_folder
      FROM checklist_templates ct
      LEFT JOIN checklist_fields cf ON ct.id = cf.template_id
    `;
    let params: any[] = [];
    let whereClause = [];
    
    // System admin sees all templates
    if (userProfile?.role === USER_ROLES.SYSTEM_ADMIN) {
      // No additional filter needed
    } else if (userProfile?.organization_id) {
      // Other users see public templates and their organization's templates
      whereClause.push("(ct.is_public = true OR ct.organization_id = ? OR ct.created_by_user_id = ?)");
      params.push(userProfile.organization_id, user.id);
    } else {
      // Users without organization see only public templates and their own
      whereClause.push("(ct.is_public = true OR ct.created_by_user_id = ?)");
      params.push(user.id);
    }
    
    if (whereClause.length > 0) {
      query += " WHERE " + whereClause.join(" AND ");
    }
    
    query += " GROUP BY ct.id ORDER BY ct.display_order ASC, ct.created_at DESC";
    
    const result = await env.DB.prepare(query).bind(...params).all();
    const templates = result.results || [];
    
    // Debug log para investigar templates duplicados
    console.log(`Found ${templates.length} templates for user ${user.id}`);
    
    return c.json({ templates });
  } catch (error) {
    console.error('Error fetching templates:', error);
    return c.json({ error: "Failed to fetch templates" }, 500);
  }
});

// Get specific checklist template with fields
checklistRoutes.get("/checklist-templates/:id", authMiddleware, async (c) => {
  const env = c.env;
  const user = c.get("user");
  const templateId = parseInt(c.req.param("id"));
  
  if (!user) {
    return c.json({ error: "User not found" }, 401);
  }
  
  try {
    // Get template
    const template = await env.DB.prepare("SELECT * FROM checklist_templates WHERE id = ?").bind(templateId).first() as any;
    
    if (!template) {
      return c.json({ error: "Template not found" }, 404);
    }
    
    // Check access permissions
    const userProfile = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(user.id).first() as any;
    const canAccess = userProfile?.role === USER_ROLES.SYSTEM_ADMIN || 
                     template.is_public || 
                     template.created_by_user_id === user.id ||
                     template.organization_id === userProfile?.organization_id;
    
    if (!canAccess) {
      return c.json({ error: "Access denied" }, 403);
    }
    
    // Get fields
    const fields = await env.DB.prepare(`
      SELECT * FROM checklist_fields 
      WHERE template_id = ? 
      ORDER BY order_index ASC
    `).bind(templateId).all();
    
    return c.json({ 
      template,
      fields: fields.results || []
    });
  } catch (error) {
    console.error('Error fetching template:', error);
    return c.json({ error: "Failed to fetch template" }, 500);
  }
});

// Create checklist template
checklistRoutes.post("/checklist-templates", authMiddleware, async (c) => {
  const env = c.env;
  const user = c.get("user");
  
  if (!user) {
    return c.json({ error: "User not found" }, 401);
  }
  
  try {
    const body = await c.req.json();
    const { name, description, category, is_public, parent_category_id } = body;
    
    const userProfile = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(user.id).first() as any;
    
    const result = await env.DB.prepare(`
      INSERT INTO checklist_templates (
        name, description, category, created_by, created_by_user_id, 
        organization_id, is_public, parent_category_id,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).bind(
      name,
      description || null,
      category,
      user.google_user_data?.name || user.email,
      user.id,
      userProfile?.organization_id || null,
      is_public || false,
      parent_category_id || null
    ).run();
    
    return c.json({ 
      id: result.meta.last_row_id,
      message: "Template created successfully" 
    });
  } catch (error) {
    console.error('Error creating template:', error);
    return c.json({ error: "Failed to create template" }, 500);
  }
});

// Update checklist template
checklistRoutes.put("/checklist-templates/:id", authMiddleware, async (c) => {
  const env = c.env;
  const user = c.get("user");
  const templateId = parseInt(c.req.param("id"));
  
  if (!user) {
    return c.json({ error: "User not found" }, 401);
  }
  
  try {
    const body = await c.req.json();
    const { name, description, category, is_public } = body;
    
    // Check template ownership
    const template = await env.DB.prepare("SELECT * FROM checklist_templates WHERE id = ?").bind(templateId).first() as any;
    
    if (!template) {
      return c.json({ error: "Template not found" }, 404);
    }
    
    const userProfile = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(user.id).first() as any;
    
    // Check permissions
    if (userProfile?.role !== USER_ROLES.SYSTEM_ADMIN) {
      if (template.created_by_user_id !== user.id && template.organization_id !== userProfile?.organization_id) {
        return c.json({ error: "Insufficient permissions" }, 403);
      }
    }
    
    await env.DB.prepare(`
      UPDATE checklist_templates 
      SET name = ?, description = ?, category = ?, is_public = ?, updated_at = datetime('now')
      WHERE id = ?
    `).bind(name, description, category, is_public, templateId).run();
    
    return c.json({ message: "Template updated successfully" });
  } catch (error) {
    console.error('Error updating template:', error);
    return c.json({ error: "Failed to update template" }, 500);
  }
});

// Delete checklist template
checklistRoutes.delete("/checklist-templates/:id", authMiddleware, async (c) => {
  const env = c.env;
  const user = c.get("user");
  const templateId = parseInt(c.req.param("id"));
  
  if (!user) {
    return c.json({ error: "User not found" }, 401);
  }
  
  try {
    // Check template ownership
    const template = await env.DB.prepare("SELECT * FROM checklist_templates WHERE id = ?").bind(templateId).first() as any;
    
    if (!template) {
      return c.json({ error: "Template not found" }, 404);
    }
    
    const userProfile = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(user.id).first() as any;
    
    // Check permissions
    if (userProfile?.role !== USER_ROLES.SYSTEM_ADMIN) {
      if (template.created_by_user_id !== user.id && template.organization_id !== userProfile?.organization_id) {
        return c.json({ error: "Insufficient permissions" }, 403);
      }
    }
    
    // Delete fields first
    await env.DB.prepare("DELETE FROM checklist_fields WHERE template_id = ?").bind(templateId).run();
    
    // Delete template
    await env.DB.prepare("DELETE FROM checklist_templates WHERE id = ?").bind(templateId).run();
    
    return c.json({ message: "Template deleted successfully" });
  } catch (error) {
    console.error('Error deleting template:', error);
    return c.json({ error: "Failed to delete template" }, 500);
  }
});

// Duplicate checklist template
checklistRoutes.post("/checklist-templates/:id/duplicate", authMiddleware, async (c) => {
  const env = c.env;
  const user = c.get("user");
  const templateId = parseInt(c.req.param("id"));
  
  if (!user) {
    return c.json({ error: "User not found" }, 401);
  }
  
  try {
    // Get original template
    const originalTemplate = await env.DB.prepare("SELECT * FROM checklist_templates WHERE id = ?").bind(templateId).first() as any;
    
    if (!originalTemplate) {
      return c.json({ error: "Template not found" }, 404);
    }
    
    const userProfile = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(user.id).first() as any;
    
    // Create duplicate template
    const newName = `${originalTemplate.name} - Cópia`;
    const result = await env.DB.prepare(`
      INSERT INTO checklist_templates (
        name, description, category, created_by, created_by_user_id, 
        organization_id, is_public, parent_category_id,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).bind(
      newName,
      originalTemplate.description,
      originalTemplate.category,
      user.google_user_data?.name || user.email,
      user.id,
      userProfile?.organization_id || null,
      false, // Copies are private by default
      originalTemplate.parent_category_id
    ).run();
    
    const newTemplateId = result.meta.last_row_id as number;
    
    // Duplicate fields
    const fields = await env.DB.prepare("SELECT * FROM checklist_fields WHERE template_id = ?").bind(templateId).all();
    
    for (const field of fields.results) {
      await env.DB.prepare(`
        INSERT INTO checklist_fields (
          template_id, field_name, field_type, is_required, options, order_index,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `).bind(
        newTemplateId,
        (field as any).field_name,
        (field as any).field_type,
        (field as any).is_required,
        (field as any).options,
        (field as any).order_index
      ).run();
    }
    
    return c.json({ 
      id: newTemplateId,
      message: "Template duplicated successfully" 
    });
  } catch (error) {
    console.error('Error duplicating template:', error);
    return c.json({ error: "Failed to duplicate template" }, 500);
  }
});

// Generate AI checklist - simple version
checklistRoutes.post("/checklist-templates/generate-ai-simple", authMiddleware, async (c) => {
  const env = c.env;
  const user = c.get("user");
  
  if (!user) {
    return c.json({ error: "User not found" }, 401);
  }
  
  try {
    const body = await c.req.json();
    const { industry, location_type, template_name, category, num_questions, specific_requirements } = body;
    
    if (!env.OPENAI_API_KEY) {
      return c.json({ error: "OpenAI API key not configured" }, 500);
    }
    
    // Create AI prompt
    const prompt = `Crie um checklist de segurança para:
- Setor: ${industry}
- Tipo de local: ${location_type}
- Nome do template: ${template_name}
- Categoria: ${category}
- Número de perguntas: ${num_questions}
${specific_requirements ? `- Requisitos específicos: ${specific_requirements}` : ''}

Retorne APENAS um JSON válido com esta estrutura:
{
  "template": {
    "name": "${template_name}",
    "description": "Descrição do template",
    "category": "${category}",
    "is_public": false
  },
  "fields": [
    {
      "field_name": "Nome da pergunta",
      "field_type": "boolean",
      "is_required": true,
      "options": "",
      "order_index": 0
    }
  ]
}

Use principalmente field_type "boolean" (Conforme/Não Conforme), "text", "select", "textarea" e "rating".
Para "select", use options como JSON array: ["Opção 1", "Opção 2", "Opção 3"].
Foque em itens essenciais de segurança e conformidade.`;

    // Call OpenAI API
    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'Você é um especialista em segurança do trabalho e conformidade regulatória. Responda apenas com JSON válido, sem texto adicional.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 2000,
        temperature: 0.7
      })
    });
    
    if (!openaiResponse.ok) {
      throw new Error(`OpenAI API error: ${openaiResponse.status}`);
    }
    
    const openaiResult = await openaiResponse.json() as any;
    const content = openaiResult.choices?.[0]?.message?.content;
    
    // Parse AI response
    let aiData;
    try {
      aiData = JSON.parse(content);
    } catch (parseError) {
      // Try to extract JSON from the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        aiData = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('Failed to parse AI response as JSON');
      }
    }
    
    // Validate and clean the AI response
    if (!aiData.template || !aiData.fields || !Array.isArray(aiData.fields)) {
      throw new Error('Invalid AI response structure');
    }
    
    // Clean up the fields
    const cleanFields = aiData.fields.map((field: any, index: number) => ({
      field_name: field.field_name || `Campo ${index + 1}`,
      field_type: field.field_type || 'text',
      is_required: field.is_required || false,
      options: field.options ? (typeof field.options === 'string' ? field.options : JSON.stringify(field.options)) : '',
      order_index: index
    }));
    
    return c.json({
      success: true,
      template: aiData.template,
      fields: cleanFields
    });
    
  } catch (error) {
    console.error('Error generating AI checklist:', error);
    return c.json({ 
      success: false,
      error: error instanceof Error ? error.message : "Failed to generate checklist" 
    }, 500);
  }
});

// Save generated checklist
checklistRoutes.post("/checklist-templates/save-generated", authMiddleware, async (c) => {
  const env = c.env;
  const user = c.get("user");
  
  if (!user) {
    return c.json({ error: "User not found" }, 401);
  }
  
  try {
    const body = await c.req.json();
    const { template, fields } = body;
    
    const userProfile = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(user.id).first() as any;
    
    // Create template
    const templateResult = await env.DB.prepare(`
      INSERT INTO checklist_templates (
        name, description, category, created_by, created_by_user_id, 
        organization_id, is_public, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).bind(
      template.name,
      template.description || null,
      template.category,
      user.google_user_data?.name || user.email,
      user.id,
      userProfile?.organization_id || null,
      template.is_public || false
    ).run();
    
    const templateId = templateResult.meta.last_row_id as number;
    
    // Create fields
    for (const field of fields) {
      if (field.field_name) {
        await env.DB.prepare(`
          INSERT INTO checklist_fields (
            template_id, field_name, field_type, is_required, options, order_index,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        `).bind(
          templateId,
          field.field_name,
          field.field_type,
          field.is_required || false,
          field.options || null,
          field.order_index || 0
        ).run();
      }
    }
    
    return c.json({ 
      id: templateId,
      message: "Generated template saved successfully" 
    });
  } catch (error) {
    console.error('Error saving generated template:', error);
    return c.json({ error: "Failed to save generated template" }, 500);
  }
});

// Delete template fields (for template editing)
checklistRoutes.delete("/checklist-templates/:id/fields", authMiddleware, async (c) => {
  const env = c.env;
  const user = c.get("user");
  const templateId = parseInt(c.req.param("id"));
  
  if (!user) {
    return c.json({ error: "User not found" }, 401);
  }
  
  try {
    // Get user profile to check permissions
    const userProfile = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(user.id).first() as any;
    
    // Check if template exists
    const template = await env.DB.prepare("SELECT * FROM checklist_templates WHERE id = ?").bind(templateId).first() as any;
    
    if (!template) {
      return c.json({ error: "Template not found" }, 404);
    }
    
    // System admin can delete anything
    if (userProfile?.role !== USER_ROLES.SYSTEM_ADMIN) {
      // Check if user owns the template or it's in their organization
      if (template.created_by_user_id !== user.id && template.organization_id !== userProfile?.organization_id) {
        return c.json({ error: "Insufficient permissions to modify this template" }, 403);
      }
    }
    
    // Delete all fields for this template
    await env.DB.prepare("DELETE FROM checklist_fields WHERE template_id = ?").bind(templateId).run();
    
    return c.json({ message: "Template fields deleted successfully" });
  } catch (error) {
    console.error('Error deleting template fields:', error);
    return c.json({ error: "Failed to delete template fields" }, 500);
  }
});

// Create checklist field
checklistRoutes.post("/checklist-fields", authMiddleware, async (c) => {
  const env = c.env;
  const user = c.get("user");
  
  if (!user) {
    return c.json({ error: "User not found" }, 401);
  }
  
  try {
    const body = await c.req.json();
    const { template_id, field_name, field_type, is_required, options, order_index } = body;
    
    // Get user profile to check permissions
    const userProfile = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(user.id).first() as any;
    
    // Check if template exists
    const template = await env.DB.prepare("SELECT * FROM checklist_templates WHERE id = ?").bind(template_id).first() as any;
    
    if (!template) {
      return c.json({ error: "Template not found" }, 404);
    }
    
    // System admin can edit anything
    if (userProfile?.role !== USER_ROLES.SYSTEM_ADMIN) {
      // Check if user owns the template or it's in their organization
      if (template.created_by_user_id !== user.id && template.organization_id !== userProfile?.organization_id) {
        return c.json({ error: "Insufficient permissions to modify this template" }, 403);
      }
    }
    
    // Create field
    await env.DB.prepare(`
      INSERT INTO checklist_fields (
        template_id, field_name, field_type, is_required, options, order_index,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).bind(
      template_id,
      field_name,
      field_type,
      is_required || false,
      options || null,
      order_index || 0
    ).run();
    
    return c.json({ message: "Field created successfully" });
  } catch (error) {
    console.error('Error creating checklist field:', error);
    return c.json({ error: "Failed to create field" }, 500);
  }
});

// Create folder for templates
checklistRoutes.post("/checklist-templates/create-folder", authMiddleware, async (c) => {
  const env = c.env;
  const user = c.get("user");
  
  if (!user) {
    return c.json({ error: "User not found" }, 401);
  }
  
  try {
    const body = await c.req.json();
    const { name, description, category, folder_color, folder_icon, parent_category_id } = body;
    
    const userProfile = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(user.id).first() as any;
    
    // Create folder
    const result = await env.DB.prepare(`
      INSERT INTO checklist_templates (
        name, description, category, is_category_folder, folder_color, folder_icon,
        parent_category_id, created_by, created_by_user_id, organization_id, is_public,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).bind(
      name,
      description || null,
      category,
      true, // is_category_folder
      folder_color || '#3B82F6',
      folder_icon || 'folder',
      parent_category_id || null,
      user.google_user_data?.name || user.email,
      user.id,
      userProfile?.organization_id || null,
      true // public by default
    ).run();
    
    return c.json({ 
      id: result.meta.last_row_id,
      message: "Folder created successfully" 
    });
  } catch (error) {
    console.error('Error creating folder:', error);
    return c.json({ error: "Failed to create folder" }, 500);
  }
});

export default checklistRoutes;
