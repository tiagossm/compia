import { Hono } from "hono";
import { cors } from "hono/cors";
import { zValidator } from "@hono/zod-validator";
import { getCookie, setCookie } from "hono/cookie";
import {
  authMiddleware,
  getOAuthRedirectUrl,
  exchangeCodeForSessionToken,
  deleteSession,
  MOCHA_SESSION_TOKEN_COOKIE_NAME,
} from "@getmocha/users-service/backend";

import multiTenantRoutes from "./multi-tenant-routes";
import { USER_ROLES } from "@/shared/user-types";

import {
  InspectionSchema,
  InspectionItemSchema,
  AIAnalysisRequestSchema
} from "@/shared/types";
import {
  ChecklistTemplateSchema,
  ChecklistFieldSchema,
  AIChecklistRequestSchema,
  CSVImportSchema,
  FieldResponse
} from "@/shared/checklist-types";

const app = new Hono<{ Bindings: Env }>();

app.use("*", cors({
  origin: "*",
  allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization"],
}));

// Mount multi-tenant routes
app.route("/api", multiTenantRoutes);

// Authentication endpoints
app.get('/api/oauth/google/redirect_url', async (c) => {
  const redirectUrl = await getOAuthRedirectUrl('google', {
    apiUrl: c.env.MOCHA_USERS_SERVICE_API_URL || '',
    apiKey: c.env.MOCHA_USERS_SERVICE_API_KEY || '',
  });

  return c.json({ redirectUrl }, 200);
});

app.post("/api/sessions", async (c) => {
  const body = await c.req.json();

  if (!body.code) {
    return c.json({ error: "No authorization code provided" }, 400);
  }

  const sessionToken = await exchangeCodeForSessionToken(body.code, {
    apiUrl: c.env.MOCHA_USERS_SERVICE_API_URL || '',
    apiKey: c.env.MOCHA_USERS_SERVICE_API_KEY || '',
  });

  setCookie(c, MOCHA_SESSION_TOKEN_COOKIE_NAME, sessionToken, {
    httpOnly: true,
    path: "/",
    sameSite: "none",
    secure: true,
    maxAge: 60 * 24 * 60 * 60, // 60 days
  });

  return c.json({ success: true }, 200);
});

app.get("/api/users/me", authMiddleware, async (c) => {
  const mochaUser = c.get("user");
  if (!mochaUser) {
    return c.json({ error: "User not found" }, 401);
  }
  
  // Get or create user profile in our database
  let user = await c.env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(mochaUser.id).first() as any;
  
  if (!user) {
    // Check if user was invited
    const invitation = await c.env.DB.prepare(`
      SELECT * FROM user_invitations 
      WHERE email = ? AND accepted_at IS NULL AND expires_at > datetime('now')
      ORDER BY created_at DESC LIMIT 1
    `).bind(mochaUser.email).first() as any;
    
    if (invitation) {
      // Create user profile based on invitation
      const canManageUsers = invitation.role === USER_ROLES.ORG_ADMIN;
      const canCreateOrgs = invitation.role === USER_ROLES.ORG_ADMIN;
      const managedOrgId = invitation.role === USER_ROLES.ORG_ADMIN ? invitation.organization_id : null;
      
      await c.env.DB.prepare(`
        INSERT INTO users (
          id, email, name, role, organization_id, can_manage_users, 
          can_create_organizations, managed_organization_id, is_active, 
          last_login_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), datetime('now'))
      `).bind(
        mochaUser.id,
        mochaUser.email,
        mochaUser.google_user_data.name || mochaUser.email,
        invitation.role,
        invitation.organization_id,
        canManageUsers,
        canCreateOrgs,
        managedOrgId,
        true
      ).run();
      
      // Mark invitation as accepted
      await c.env.DB.prepare(`
        UPDATE user_invitations 
        SET accepted_at = datetime('now'), updated_at = datetime('now')
        WHERE id = ?
      `).bind(invitation.id).run();
      
    } else {
      // Create default user profile (will be first system admin if no users exist)
      const userCount = await c.env.DB.prepare("SELECT COUNT(*) as count FROM users").first() as any;
      const isFirstUser = userCount.count === 0;
      
      await c.env.DB.prepare(`
        INSERT INTO users (
          id, email, name, role, can_manage_users, can_create_organizations,
          is_active, last_login_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), datetime('now'))
      `).bind(
        mochaUser.id,
        mochaUser.email,
        mochaUser.google_user_data.name || mochaUser.email,
        isFirstUser ? USER_ROLES.SYSTEM_ADMIN : USER_ROLES.INSPECTOR,
        isFirstUser,
        isFirstUser,
        true
      ).run();
    }
    
    user = await c.env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(mochaUser.id).first();
  } else {
    // Update last login
    await c.env.DB.prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?").bind(mochaUser.id).run();
  }
  
  // Load related data
  const organizations = [];
  const permissions = [];
  let managedOrganization = null;
  
  // Load user's organization
  if (user.organization_id) {
    const org = await c.env.DB.prepare("SELECT * FROM organizations WHERE id = ?").bind(user.organization_id).first();
    if (org) organizations.push(org);
  }
  
  // Load managed organization for org admins
  if (user.managed_organization_id) {
    managedOrganization = await c.env.DB.prepare("SELECT * FROM organizations WHERE id = ?").bind(user.managed_organization_id).first();
  }
  
  // Load permissions
  const userPermissions = await c.env.DB.prepare(`
    SELECT * FROM organization_permissions WHERE user_id = ? AND is_active = true
  `).bind(mochaUser.id).all();
  permissions.push(...userPermissions.results);
  
  return c.json({ 
    ...mochaUser, 
    profile: user,
    organizations,
    managed_organization: managedOrganization,
    permissions
  });
});

app.get('/api/logout', async (c) => {
  const sessionToken = getCookie(c, MOCHA_SESSION_TOKEN_COOKIE_NAME);

  if (typeof sessionToken === 'string') {
    await deleteSession(sessionToken, {
      apiUrl: c.env.MOCHA_USERS_SERVICE_API_URL || '',
      apiKey: c.env.MOCHA_USERS_SERVICE_API_KEY || '',
    });
  }

  setCookie(c, MOCHA_SESSION_TOKEN_COOKIE_NAME, '', {
    httpOnly: true,
    path: '/',
    sameSite: 'none',
    secure: true,
    maxAge: 0,
  });

  return c.json({ success: true }, 200);
});

// Dashboard stats endpoint
app.get("/api/dashboard/stats", authMiddleware, async (c) => {
  const env = c.env;
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "User not found" }, 401);
  }
  
  // Get user profile to check organization access
  const userProfile = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(user.id).first() as any;
  
  let query = `
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN status = 'pendente' THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN status = 'em_andamento' THEN 1 ELSE 0 END) as inProgress,
      SUM(CASE WHEN status = 'concluida' THEN 1 ELSE 0 END) as completed
    FROM inspections
  `;
  let params: any[] = [];
  let whereClause = [];
  
  // Check for organization filter from query params
  const organizationId = c.req.query('organization_id');
  if (organizationId) {
    whereClause.push("organization_id = ?");
    params.push(parseInt(organizationId));
  } else {
    // If no specific organization requested, apply default filtering
    // If user has organization_id, filter by organization (unless admin)
    if (userProfile?.organization_id && userProfile?.role !== 'admin') {
      whereClause.push("(organization_id = ? OR organization_id IS NULL)");
      params.push(userProfile.organization_id);
    }
  }
  
  // For non-admin users, also filter by created_by or collaborators
  if (userProfile?.role !== 'admin') {
    whereClause.push("(created_by = ? OR id IN (SELECT inspection_id FROM inspection_collaborators WHERE user_id = ? AND status = 'active'))");
    params.push(user.id, user.id);
  }
  
  if (whereClause.length > 0) {
    query += " WHERE " + whereClause.join(" AND ");
  }
  
  const stats = await env.DB.prepare(query).bind(...params).first();
  
  return c.json(stats);
});

// Action plan dashboard stats endpoint
app.get("/api/dashboard/action-plan-summary", authMiddleware, async (c) => {
  const env = c.env;
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "User not found" }, 401);
  }
  
  // Get user profile to check organization access
  const userProfile = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(user.id).first() as any;
  
  let query = `
    SELECT 
      COUNT(*) as total_actions,
      SUM(CASE WHEN ai.status = 'pending' THEN 1 ELSE 0 END) as pending_actions,
      SUM(CASE WHEN ai.status = 'in_progress' THEN 1 ELSE 0 END) as in_progress_actions,
      SUM(CASE WHEN ai.status = 'completed' THEN 1 ELSE 0 END) as completed_actions,
      SUM(CASE WHEN (ai.status = 'pending' OR ai.status = 'in_progress') 
                AND ai.when_deadline IS NOT NULL 
                AND DATE(ai.when_deadline) <= DATE('now', '+7 days') 
                AND DATE(ai.when_deadline) >= DATE('now') THEN 1 ELSE 0 END) as upcoming_deadline,
      SUM(CASE WHEN (ai.status = 'pending' OR ai.status = 'in_progress') 
                AND ai.when_deadline IS NOT NULL 
                AND DATE(ai.when_deadline) < DATE('now') THEN 1 ELSE 0 END) as overdue_actions,
      SUM(CASE WHEN ai.priority = 'alta' AND (ai.status = 'pending' OR ai.status = 'in_progress') THEN 1 ELSE 0 END) as high_priority_pending,
      SUM(CASE WHEN ai.is_ai_generated = 1 THEN 1 ELSE 0 END) as ai_generated_count
    FROM action_items ai
    JOIN inspections i ON ai.inspection_id = i.id
  `;
  let params: any[] = [];
  let whereClause = [];
  
  // Check for organization filter from query params
  const organizationId = c.req.query('organization_id');
  if (organizationId) {
    whereClause.push("i.organization_id = ?");
    params.push(parseInt(organizationId));
  } else {
    // If no specific organization requested, apply default filtering
    // If user has organization_id, filter by organization (unless admin)
    if (userProfile?.organization_id && userProfile?.role !== 'admin') {
      whereClause.push("(i.organization_id = ? OR i.organization_id IS NULL)");
      params.push(userProfile.organization_id);
    }
  }
  
  // For non-admin users, also filter by created_by or collaborators
  if (userProfile?.role !== 'admin') {
    whereClause.push("(i.created_by = ? OR i.id IN (SELECT inspection_id FROM inspection_collaborators WHERE user_id = ? AND status = 'active'))");
    params.push(user.id, user.id);
  }
  
  if (whereClause.length > 0) {
    query += " WHERE " + whereClause.join(" AND ");
  }
  
  const summary = await env.DB.prepare(query).bind(...params).first();
  
  return c.json(summary);
});

// Get all inspections (protected)
app.get("/api/inspections", authMiddleware, async (c) => {
  const env = c.env;
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "User not found" }, 401);
  }
  
  // Get user profile to check organization access
  const userProfile = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(user.id).first() as any;
  
  let query = "SELECT * FROM inspections";
  let params: any[] = [];
  let whereClause = [];
  
  // Check for organization filter from query params
  const organizationId = c.req.query('organization_id');
  if (organizationId) {
    whereClause.push("organization_id = ?");
    params.push(parseInt(organizationId));
  } else {
    // If no specific organization requested, apply default filtering
    // If user has organization_id, filter by organization (unless admin)
    if (userProfile?.organization_id && userProfile?.role !== 'admin') {
      whereClause.push("(organization_id = ? OR organization_id IS NULL)");
      params.push(userProfile.organization_id);
    }
  }
  
  // For non-admin users, also filter by created_by or collaborators
  if (userProfile?.role !== 'admin') {
    whereClause.push("(created_by = ? OR id IN (SELECT inspection_id FROM inspection_collaborators WHERE user_id = ? AND status = 'active'))");
    params.push(user.id, user.id);
  }
  
  if (whereClause.length > 0) {
    query += " WHERE " + whereClause.join(" AND ");
  }
  
  query += " ORDER BY created_at DESC";
  
  const inspections = await env.DB.prepare(query).bind(...params).all();
  return c.json({ inspections: inspections.results });
});

// Get inspection by ID with items and media
app.get("/api/inspections/:id", async (c) => {
  const env = c.env;
  const id = parseInt(c.req.param("id"));
  
  const inspection = await env.DB.prepare("SELECT * FROM inspections WHERE id = ?").bind(id).first();
  
  if (!inspection) {
    return c.json({ error: "Inspection not found" }, 404);
  }
  
  const items = await env.DB.prepare("SELECT * FROM inspection_items WHERE inspection_id = ?").bind(id).all();
  const media = await env.DB.prepare("SELECT * FROM inspection_media WHERE inspection_id = ?").bind(id).all();
  
  return c.json({
    inspection,
    items: items.results,
    media: media.results
  });
});

// Create new inspection (protected)
app.post("/api/inspections", authMiddleware, async (c) => {
  const env = c.env;
  
  try {
    const rawData = await c.req.json();
    console.log('Received inspection data:', rawData);
    
    const { template_id, ...inspectionData } = rawData;
    
    const user = c.get("user");
    if (!user) {
      return c.json({ error: "User not found" }, 401);
    }
    
    const userProfile = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(user.id).first() as any;
    
    // Create inspection
    const insertResult = await env.DB.prepare(`
      INSERT INTO inspections (
        title, description, location, company_name, cep, address, latitude, longitude,
        inspector_name, inspector_email, status, priority, scheduled_date, action_plan_type,
        created_by, organization_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).bind(
      inspectionData.title,
      inspectionData.description || null,
      inspectionData.location,
      inspectionData.company_name,
      inspectionData.cep || null,
      inspectionData.address || null,
      inspectionData.latitude || null,
      inspectionData.longitude || null,
      inspectionData.inspector_name,
      inspectionData.inspector_email || null,
      inspectionData.status || 'pendente',
      inspectionData.priority || 'media',
      inspectionData.scheduled_date || null,
      inspectionData.action_plan_type || '5w2h',
      user.id,
      userProfile?.organization_id || null
    ).run();
    
    const inspectionId = insertResult.meta.last_row_id as number;
    
    // If template_id is provided, create template-based items
    if (template_id) {
      // Creating inspection with template_id
      
      const templateFields = await env.DB.prepare(`
        SELECT * FROM checklist_fields WHERE template_id = ? ORDER BY order_index ASC
      `).bind(template_id).all();
      
      // Processing template fields
      
      for (const field of templateFields.results as any[]) {
        const fieldData = {
          field_id: field.id,
          field_name: field.field_name,
          field_type: field.field_type,
          is_required: field.is_required,
          options: field.options,
          response_value: null,
          comment: null
        };
        
        await env.DB.prepare(`
          INSERT INTO inspection_items (inspection_id, template_id, field_responses, created_at, updated_at)
          VALUES (?, ?, ?, datetime('now'), datetime('now'))
        `).bind(inspectionId, template_id, JSON.stringify(fieldData)).run();
      }
    }
    
    // Inspection created successfully
    
    return c.json({ 
      id: inspectionId, 
      message: "Inspection created successfully" 
    });
  } catch (error) {
    console.error('Error creating inspection:', error);
    return c.json({ 
      error: "Failed to create inspection", 
      details: error instanceof Error ? error.message : String(error) 
    }, 500);
  }
});

// Update inspection
app.put("/api/inspections/:id", zValidator("json", InspectionSchema.partial()), async (c) => {
  const env = c.env;
  const id = parseInt(c.req.param("id"));
  const data = c.req.valid("json");
  
  const updateFields = Object.entries(data)
    .filter(([_, value]) => value !== undefined)
    .map(([key, _]) => `${key} = ?`)
    .join(", ");
  
  const updateValues = Object.values(data).filter(value => value !== undefined);
  
  await env.DB.prepare(`
    UPDATE inspections 
    SET ${updateFields}, updated_at = datetime('now')
    WHERE id = ?
  `).bind(...updateValues, id).run();
  
  return c.json({ message: "Inspection updated successfully" });
});

// Save template responses for inspection
app.post("/api/inspections/:id/template-responses", async (c) => {
  const env = c.env;
  const inspectionId = parseInt(c.req.param("id"));
  
  const requestBody = await c.req.json();
  const responses = requestBody.responses as FieldResponse[];
  
  // Template responses received
  
  try {
    for (const response of responses) {
      // Find the template ID for this field
      const templateField = await env.DB.prepare(`
        SELECT template_id FROM checklist_fields WHERE id = ?
      `).bind(response.field_id).first() as any;
      
      if (!templateField) continue;
      
      const templateId = templateField.template_id;
      
      // Create the field data object
      const fieldData = {
        field_id: response.field_id,
        field_name: response.field_name,
        field_type: response.field_type,
        response_value: response.value,
        comment: response.comment || null
      };
      
      // Check if item already exists
      const existingItem = await env.DB.prepare(`
        SELECT id FROM inspection_items 
        WHERE inspection_id = ? AND template_id = ? AND JSON_EXTRACT(field_responses, '$.field_id') = ?
      `).bind(inspectionId, templateId, response.field_id).first();
      
      if (existingItem) {
        // Update existing item
        await env.DB.prepare(`
          UPDATE inspection_items 
          SET field_responses = ?, updated_at = datetime('now')
          WHERE inspection_id = ? AND template_id = ? AND JSON_EXTRACT(field_responses, '$.field_id') = ?
        `).bind(JSON.stringify(fieldData), inspectionId, templateId, response.field_id).run();
      } else {
        // Create new item
        await env.DB.prepare(`
          INSERT INTO inspection_items (inspection_id, template_id, field_responses, created_at, updated_at)
          VALUES (?, ?, ?, datetime('now'), datetime('now'))
        `).bind(inspectionId, templateId, JSON.stringify(fieldData)).run();
      }
    }
    
    return c.json({ 
      success: true, 
      message: "Template responses saved successfully" 
    });
  } catch (error) {
    return c.json({ 
      success: false, 
      error: "Failed to save template responses" 
    }, 500);
  }
});

// Delete inspection
app.delete("/api/inspections/:id", async (c) => {
  const env = c.env;
  const id = parseInt(c.req.param("id"));
  
  await env.DB.prepare("DELETE FROM inspection_media WHERE inspection_id = ?").bind(id).run();
  await env.DB.prepare("DELETE FROM inspection_items WHERE inspection_id = ?").bind(id).run();
  await env.DB.prepare("DELETE FROM inspections WHERE id = ?").bind(id).run();
  
  return c.json({ message: "Inspection deleted successfully" });
});

// Add item to inspection
app.post("/api/inspections/:id/items", zValidator("json", InspectionItemSchema.omit({ id: true })), async (c) => {
  const env = c.env;
  const data = c.req.valid("json");
  
  await env.DB.prepare(`
    INSERT INTO inspection_items (
      inspection_id, category, item_description, is_compliant, observations, photo_url,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `).bind(
    data.inspection_id,
    data.category,
    data.item_description,
    data.is_compliant,
    data.observations,
    data.photo_url
  ).run();
  
  return c.json({ message: "Item added successfully" });
});

// Update inspection item
app.put("/api/inspection-items/:id", zValidator("json", InspectionItemSchema.partial()), async (c) => {
  const env = c.env;
  const id = parseInt(c.req.param("id"));
  const data = c.req.valid("json");
  
  const updateFields = Object.entries(data)
    .filter(([_, value]) => value !== undefined)
    .map(([key, _]) => `${key} = ?`)
    .join(", ");
  
  const updateValues = Object.values(data).filter(value => value !== undefined);
  
  await env.DB.prepare(`
    UPDATE inspection_items 
    SET ${updateFields}, updated_at = datetime('now')
    WHERE id = ?
  `).bind(...updateValues, id).run();
  
  return c.json({ message: "Item updated successfully" });
});

// Finalize inspection
app.post("/api/inspections/:id/finalize", async (c) => {
  const env = c.env;
  const id = parseInt(c.req.param("id"));
  
  await env.DB.prepare(`
    UPDATE inspections 
    SET status = 'concluida', completed_date = datetime('now'), updated_at = datetime('now')
    WHERE id = ?
  `).bind(id).run();
  
  return c.json({ message: "Inspection finalized successfully" });
});

// CEP lookup endpoint
app.get("/api/cep/:cep", async (c) => {
  const cep = c.req.param("cep");
  
  try {
    const cepResponse = await (globalThis as any).fetch(`https://viacep.com.br/ws/${cep}/json/`);
    const cepData = await cepResponse.json() as any;
    
    if (cepData.erro) {
      return c.json({ error: "CEP not found" }, 404);
    }
    
    const address = `${cepData.logradouro}, ${cepData.bairro}, ${cepData.localidade} - ${cepData.uf}`;
    
    return c.json({ address });
  } catch (error) {
    return c.json({ error: "Failed to fetch CEP data" }, 500);
  }
});

// Upload media for inspection
app.post("/api/inspections/:id/media", async (c) => {
  const env = c.env;
  const inspectionId = parseInt(c.req.param("id"));
  
  const body = await c.req.json();
  const { file_name, file_url, file_size, mime_type, media_type, inspection_item_id, description } = body;
  
  await env.DB.prepare(`
    INSERT INTO inspection_media (
      inspection_id, inspection_item_id, media_type, file_name, file_url, 
      file_size, mime_type, description, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `).bind(
    inspectionId,
    inspection_item_id || null,
    media_type,
    file_name,
    file_url,
    file_size || null,
    mime_type || null,
    description || null
  ).run();
  
  return c.json({ message: "Media uploaded successfully" });
});

// Upload media for inspection with file upload
app.post("/api/inspections/:id/media/upload", async (c) => {
  const env = c.env;
  const inspectionId = parseInt(c.req.param("id"));
  
  const body = await c.req.json();
  const { file_name, file_data, file_size, mime_type, media_type, inspection_item_id } = body;
  
  try {
    // For now, we'll simulate file storage by creating a data URL
    // In production, you'd upload to R2 or another storage service
    const file_url = file_data; // Use the base64 data URL directly
    
    const result = await env.DB.prepare(`
      INSERT INTO inspection_media (
        inspection_id, inspection_item_id, media_type, file_name, file_url, 
        file_size, mime_type, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).bind(
      inspectionId,
      inspection_item_id || null,
      media_type,
      file_name,
      file_url,
      file_size || null,
      mime_type || null
    ).run();
    
    return c.json({ 
      id: result.meta.last_row_id,
      file_url: file_url,
      message: "Media uploaded successfully" 
    });
  } catch (error) {
    return c.json({ error: "Failed to upload media" }, 500);
  }
});

// Get media for inspection item
app.get("/api/inspection-items/:id/media", async (c) => {
  const env = c.env;
  const itemId = parseInt(c.req.param("id"));
  
  const media = await env.DB.prepare(`
    SELECT * FROM inspection_media WHERE inspection_item_id = ? ORDER BY created_at DESC
  `).bind(itemId).all();
  
  return c.json({ media: media.results });
});

// Get actions for inspection item
app.get("/api/inspection-items/:id/actions", async (c) => {
  const env = c.env;
  const itemId = parseInt(c.req.param("id"));
  
  const actions = await env.DB.prepare(`
    SELECT * FROM action_items WHERE inspection_item_id = ? ORDER BY created_at DESC
  `).bind(itemId).all();
  
  return c.json({ actions: actions.results });
});

// Delete inspection media
app.delete("/api/inspection-media/:id", async (c) => {
  const env = c.env;
  const id = parseInt(c.req.param("id"));
  
  await env.DB.prepare("DELETE FROM inspection_media WHERE id = ?").bind(id).run();
  
  return c.json({ message: "Media deleted successfully" });
});

// Pre-analysis for inspection item
app.post("/api/inspection-items/:id/pre-analysis", async (c) => {
  const env = c.env;
  const itemId = parseInt(c.req.param("id"));
  
  if (!env.OPENAI_API_KEY) {
    return c.json({ error: "OpenAI API key not configured" }, 500);
  }
  
  try {
    const body = await c.req.json();
    const { field_name, field_type, response_value, media_data } = body;
    
    const OpenAI = (await import('openai')).default;
    const openai = new OpenAI({
      apiKey: env.OPENAI_API_KEY,
    });
    
    let prompt = `Como especialista em segurança do trabalho, analise este item de inspeção:

Campo: ${field_name}
Tipo: ${field_type}
Resposta: ${response_value}

Forneça uma análise prévia técnica em português focando em:
- Riscos potenciais identificados
- Impacto na segurança
- Recomendações iniciais
- Nível de prioridade

Responda em um parágrafo conciso de até 200 palavras.`;

    // Add media analysis if available
    if (media_data && media_data.length > 0) {
      const mediaTypes = media_data.map((m: any) => m.media_type).join(', ');
      prompt += `\n\nMídias anexadas: ${mediaTypes}. Considere essas evidências visuais na análise.`;
    }
    
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      max_tokens: 300,
    });
    
    const analysis = completion.choices[0]?.message?.content;
    
    if (!analysis) {
      throw new Error("No response from OpenAI");
    }
    
    // Save pre-analysis to item
    await env.DB.prepare(`
      UPDATE inspection_items 
      SET ai_pre_analysis = ?, updated_at = datetime('now')
      WHERE id = ?
    `).bind(analysis, itemId).run();
    
    return c.json({ 
      pre_analysis: analysis,
      message: "Pre-analysis completed successfully" 
    });
    
  } catch (error) {
    console.error('Pre-analysis error:', error);
    return c.json({ error: "Failed to generate pre-analysis" }, 500);
  }
});

// Create action for inspection item
app.post("/api/inspection-items/:id/create-action", async (c) => {
  const env = c.env;
  const itemId = parseInt(c.req.param("id"));
  
  if (!env.OPENAI_API_KEY) {
    return c.json({ error: "OpenAI API key not configured" }, 500);
  }
  
  try {
    const body = await c.req.json();
    const { field_name, field_type, response_value, pre_analysis, media_data } = body;
    
    // Get the inspection_id for this item
    const inspectionItem = await env.DB.prepare(`
      SELECT inspection_id FROM inspection_items WHERE id = ?
    `).bind(itemId).first() as any;
    
    if (!inspectionItem) {
      return c.json({ error: "Inspection item not found" }, 404);
    }
    
    const inspectionId = inspectionItem.inspection_id;
    
    const OpenAI = (await import('openai')).default;
    const openai = new OpenAI({
      apiKey: env.OPENAI_API_KEY,
    });
    
    let prompt = `Como especialista em segurança do trabalho, analise este item de inspeção e determine se é necessária uma ação corretiva:

Campo: ${field_name}
Tipo: ${field_type}
Resposta: ${response_value}`;

    if (pre_analysis) {
      prompt += `\nPré-análise: ${pre_analysis}`;
    }

    if (media_data && media_data.length > 0) {
      const mediaTypes = media_data.map((m: any) => m.media_type).join(', ');
      prompt += `\nMídias anexadas: ${mediaTypes}`;
    }

    prompt += `\n\nRetorne um JSON com:
- requires_action: boolean (true se necessária ação corretiva)
- title: título da ação (se necessária)
- what_description: o que precisa ser feito (detalhado)
- where_location: onde aplicar especificamente
- how_method: como executar (metodologia detalhada)
- priority: nível de prioridade ('baixa', 'media', 'alta') baseado na severidade do risco

IMPORTANTE: Preencha apenas estes 5 campos. Os demais campos (quem, quando, quanto) serão preenchidos posteriormente pelo usuário na página de gestão do plano de ação.

Se não for necessária ação, retorne apenas {"requires_action": false}.`;
    
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      max_tokens: 1000,
    });
    
    const response = completion.choices[0]?.message?.content;
    
    if (!response) {
      throw new Error("No response from OpenAI");
    }
    
    // Parse the action plan
    let actionData;
    try {
      actionData = JSON.parse(response);
    } catch (parseError) {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        actionData = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("Failed to parse AI response as JSON");
      }
    }
    
    if (actionData.requires_action) {
      // Create the action item
      const result = await env.DB.prepare(`
        INSERT INTO action_items (
          inspection_id, inspection_item_id, title, what_description, where_location,
          how_method, is_ai_generated, status, priority
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        inspectionId,
        itemId,
        actionData.title || 'Ação Corretiva',
        actionData.what_description || null,
        actionData.where_location || null,
        actionData.how_method || null,
        true,
        'pending',
        actionData.priority || 'media'
      ).run();
      
      actionData.id = result.meta.last_row_id;
    }
    
    return c.json({ 
      action: actionData,
      message: actionData.requires_action ? "Action created successfully" : "No action required"
    });
    
  } catch (error) {
    console.error('Create action error:', error);
    return c.json({ 
      error: "Failed to create action", 
      details: error instanceof Error ? error.message : String(error) 
    }, 500);
  }
});

// Delete media
app.delete("/api/media/:id", async (c) => {
  const env = c.env;
  const id = parseInt(c.req.param("id"));
  
  await env.DB.prepare("DELETE FROM inspection_media WHERE id = ?").bind(id).run();
  
  return c.json({ message: "Media deleted successfully" });
});

// AI Checklist Generation (Legacy)
app.post("/api/ai/generate-checklist", zValidator("json", AIChecklistRequestSchema), async (c) => {
  const env = c.env;
  const { industry, location_type, specific_requirements, template_name, category } = c.req.valid("json");
  
  if (!env.OPENAI_API_KEY) {
    return c.json({ error: "OpenAI API key not configured" }, 500);
  }
  
  try {
    const OpenAI = (await import('openai')).default;
    const openai = new OpenAI({
      apiKey: env.OPENAI_API_KEY,
    });
    
    // Starting AI checklist generation
    
    const prompt = `Generate a comprehensive safety inspection checklist for:
    - Industry: ${industry}
    - Location type: ${location_type}
    - Specific requirements: ${specific_requirements || 'None specified'}
    
    Create 15-25 inspection items that cover:
    - Personal Protective Equipment (PPE)
    - Equipment safety
    - Environmental conditions
    - Emergency procedures
    - Regulatory compliance
    
    Return ONLY a JSON array where each item has:
    - field_name: Clear, specific question (in Portuguese)
    - field_type: "boolean" for yes/no, "rating" for 1-5 scale, "text" for observations
    - is_required: true/false
    - order_index: sequential number starting from 0
    
    Example format:
    [
      {
        "field_name": "Os trabalhadores estão usando capacetes de segurança?",
        "field_type": "boolean",
        "is_required": true,
        "order_index": 0
      }
    ]`;
    
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      max_tokens: 2000,
    });
    
    const response = completion.choices[0]?.message?.content;
    if (!response) {
      throw new Error("No response from OpenAI");
    }
    
    // Parse the JSON response
    let fields;
    try {
      fields = JSON.parse(response);
    } catch (parseError) {
      // Try to extract JSON from the response
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        fields = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("Failed to parse AI response as JSON");
      }
    }
    
    // Create template
    const templateResult = await env.DB.prepare(`
      INSERT INTO checklist_templates (name, description, category, created_by, is_public, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).bind(
      template_name,
      `Checklist gerado por IA para ${industry} - ${location_type}`,
      category,
      'AI Assistant',
      true
    ).run();
    
    const templateId = templateResult.meta.last_row_id as number;
    
    // Add fields to template
    for (const field of fields) {
      await env.DB.prepare(`
        INSERT INTO checklist_fields (template_id, field_name, field_type, is_required, order_index, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `).bind(
        templateId,
        field.field_name,
        field.field_type,
        field.is_required || false,
        field.order_index || 0
      ).run();
    }
    
    return c.json({ 
      template_id: templateId,
      message: "AI checklist generated successfully",
      fields_count: fields.length
    });
    
  } catch (error) {
    return c.json({ error: "Failed to generate AI checklist" }, 500);
  }
});

// Advanced AI Checklist Generation
app.post("/api/checklist-templates/generate-ai-advanced", async (c) => {
  try {
    console.log('=== AI Checklist Generation Started ===');
    
    const env = c.env;
    
    // Parse and validate request body
    let request;
    try {
      const body = await c.req.json();
      request = AIChecklistRequestSchema.parse(body);
      console.log('Request parsed successfully:', {
        industry: request.industry,
        location_type: request.location_type,
        num_questions: request.num_questions,
        timestamp: new Date().toISOString()
      });
    } catch (validationError) {
      console.error('Request validation failed:', validationError);
      return c.json({ 
        error: "Dados de entrada inválidos",
        details: validationError instanceof Error ? validationError.message : "Erro de validação",
        error_type: 'validation'
      }, 400);
    }
    
    // Validate basic requirements
    if (!request.industry || !request.location_type || !request.template_name) {
      console.error('Missing required fields');
      return c.json({ 
        error: "Campos obrigatórios em falta",
        details: "Indústria, tipo de local e nome do template são obrigatórios",
        error_type: 'validation'
      }, 400);
    }
    
    if (!env.OPENAI_API_KEY) {
      console.error('OpenAI API key not configured');
      return c.json({ 
        error: "Chave da API OpenAI não configurada",
        details: "A chave da API OpenAI precisa ser configurada nas variáveis de ambiente",
        error_type: 'configuration'
      }, 500);
    }
    
    // Validate and limit parameters to prevent issues
    const safeNumQuestions = Math.min(Math.max(request.num_questions || 15, 5), 30);
    const safeIndustry = request.industry.substring(0, 100);
    const safeLocationType = request.location_type.substring(0, 100);
    const safeTemplateName = request.template_name.substring(0, 200);
    const safeCategory = request.category.substring(0, 100);
    
    try {
      console.log('Initializing OpenAI client...');
      const OpenAI = (await import('openai')).default;
      const openai = new OpenAI({
        apiKey: env.OPENAI_API_KEY,
        timeout: 45000, // 45 seconds timeout
        maxRetries: 1, // Only 1 retry
      });
      
      // Build optimized prompt
      let prompt = `Você é um especialista em segurança do trabalho. Crie um checklist de inspeção para:

- Setor: ${safeIndustry}
- Local: ${safeLocationType}  
- Número de perguntas: ${safeNumQuestions}
- Nível: ${request.detail_level}
- Foco: ${request.priority_focus}`;

      // Add regulatory standards if provided (limited)
      if (request.regulatory_standards && request.regulatory_standards.length > 0) {
        const limitedStandards = request.regulatory_standards.slice(0, 3);
        prompt += `\n- Normas principais: ${limitedStandards.join(', ')}`;
      }
      
      // Add specific requirements if provided (limited)
      if (request.specific_requirements && request.specific_requirements.trim()) {
        const safeRequirements = request.specific_requirements.substring(0, 150);
        prompt += `\n- Requisitos específicos: ${safeRequirements}`;
      }

      prompt += `\n\nRetorne APENAS um JSON válido neste formato:
{
  "template": {
    "name": "${safeTemplateName}",
    "description": "Checklist de inspeção para ${safeIndustry}",
    "category": "${safeCategory}",
    "created_by": "IA Avançada",
    "is_public": true
  },
  "fields": [
    {
      "field_name": "Pergunta específica sobre segurança?",
      "field_type": "boolean",
      "is_required": true,
      "options": null,
      "order_index": 0
    }
  ]
}

REGRAS IMPORTANTES:
- Crie exatamente ${safeNumQuestions} campos
- Use apenas tipos: boolean, select, text, rating
- Para "boolean": options deve ser null
- Para "select": options deve ser '["Sim","Não","N/A"]'
- Ordene sequencialmente: 0, 1, 2...
- Responda APENAS o JSON`;

      console.log('Sending request to OpenAI API...');
      console.log('Prompt length:', prompt.length);
      
      // Make OpenAI request with proper error handling
      let completion;
      try {
        completion = await openai.chat.completions.create({
          model: "gpt-4o-mini", // Using mini model for better reliability
          messages: [{ role: "user", content: prompt }],
          temperature: 0.2, // Lower temperature for consistency
          max_tokens: 2500,
        });
        console.log('OpenAI request completed successfully');
      } catch (openaiError) {
        console.error('OpenAI API error:', openaiError);
        
        if (openaiError instanceof Error) {
          if (openaiError.message.includes('timeout')) {
            throw new Error('Timeout da API OpenAI. Tente com menos perguntas.');
          } else if (openaiError.message.includes('429')) {
            throw new Error('Limite de taxa da API OpenAI excedido. Tente novamente em alguns minutos.');
          } else if (openaiError.message.includes('401')) {
            throw new Error('Chave da API OpenAI inválida. Verifique a configuração.');
          } else {
            throw new Error(`Erro da API OpenAI: ${openaiError.message}`);
          }
        }
        throw new Error('Erro desconhecido da API OpenAI');
      }
      
      const response = completion.choices[0]?.message?.content;
      if (!response) {
        console.error('Empty response from OpenAI');
        throw new Error("Resposta vazia da OpenAI");
      }
      
      console.log('OpenAI response received, parsing...');
      
      // Clean and parse the response
      let result;
      try {
        const cleanResponse = response
          .replace(/```json\s*/g, '')
          .replace(/```\s*/g, '')
          .replace(/^\s*[\r\n]/gm, '')
          .trim();
        
        result = JSON.parse(cleanResponse);
        console.log('JSON parsed successfully');
      } catch (parseError) {
        console.error('JSON parse failed, attempting extraction:', parseError);
        
        // Try to extract JSON with multiple strategies
        const jsonPatterns = [
          /\{[\s\S]*?\}/,
          /\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/,
          /(\{(?:[^{}]|{[^{}]*})*\})/
        ];
        
        for (const pattern of jsonPatterns) {
          const match = response.match(pattern);
          if (match) {
            try {
              result = JSON.parse(match[0]);
              console.log('JSON extracted and parsed successfully');
              break;
            } catch (e) {
              continue;
            }
          }
        }
        
        if (!result) {
          console.error('All JSON extraction attempts failed');
          throw new Error("Não foi possível extrair JSON válido da resposta da IA");
        }
      }
      
      // Validate and sanitize the result
      if (!result || typeof result !== 'object') {
        throw new Error("Resposta da IA não é um objeto válido");
      }
      
      if (!result.template) {
        result.template = {
          name: safeTemplateName,
          description: `Checklist para ${safeIndustry}`,
          category: safeCategory,
          created_by: "IA Avançada",
          is_public: true
        };
      }
      
      if (!result.fields || !Array.isArray(result.fields)) {
        console.error('Fields missing or invalid, creating fallback');
        result.fields = [];
      }
      
      // Ensure we have valid fields
      const validatedFields = [];
      for (let i = 0; i < safeNumQuestions; i++) {
        let field = result.fields[i];
        
        if (!field || !field.field_name) {
          field = {
            field_name: `Verificação de segurança ${i + 1}`,
            field_type: 'boolean',
            is_required: false,
            options: null,
            order_index: i
          };
        }
        
        // Validate field type
        const validTypes = ['boolean', 'select', 'text', 'rating', 'number', 'date'];
        if (!validTypes.includes(field.field_type)) {
          field.field_type = 'boolean';
        }
        
        // Ensure proper structure
        field.order_index = i;
        field.is_required = field.is_required || false;
        
        // Handle options based on field type
        if (field.field_type === 'select' && !field.options) {
          field.options = '["Conforme","Não Conforme","N/A"]';
        } else if (field.field_type !== 'select') {
          field.options = null;
        }
        
        validatedFields.push(field);
      }
      
      result.fields = validatedFields;
      
      console.log(`Successfully generated ${result.fields.length} validated fields`);
      
      // Add generation metadata
      result.generation_config = {
        num_questions: safeNumQuestions,
        detail_level: request.detail_level,
        priority_focus: request.priority_focus,
        generated_at: new Date().toISOString(),
        model_used: "gpt-4o-mini"
      };
      
      console.log('=== AI Generation Completed Successfully ===');
      console.log('Generated fields:', result.fields.length);
      
      return c.json({
        success: true,
        ...result
      });
      
    } catch (innerError) {
      throw innerError; // Re-throw to be caught by outer catch
    }
    
  } catch (error) {
    console.error('=== AI Generation Error ===');
    console.error('Error:', error);
    
    const errorMessage = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : '';
    
    console.error('Error message:', errorMessage);
    console.error('Error stack:', stack);
    
    // Categorize error types and provide specific suggestions
    let errorType = 'general';
    let suggestion = 'Tente novamente com parâmetros simplificados';
    let httpStatus = 500;
    
    if (errorMessage.includes('timeout') || errorMessage.includes('ECONNRESET') || errorMessage.includes('ETIMEDOUT')) {
      errorType = 'timeout';
      suggestion = 'A operação demorou muito. Tente com menos perguntas (máximo 10-15)';
      httpStatus = 408;
    } else if (errorMessage.includes('OpenAI') || errorMessage.includes('API') || errorMessage.includes('401') || errorMessage.includes('429')) {
      errorType = 'openai_api';
      suggestion = 'Problema com a API OpenAI. Verifique a conexão e tente novamente em alguns minutos';
      httpStatus = 502;
    } else if (errorMessage.includes('JSON') || errorMessage.includes('parse')) {
      errorType = 'parsing';
      suggestion = 'Erro ao processar resposta da IA. Tente novamente com configurações mais simples';
      httpStatus = 500;
    } else if (errorMessage.includes('validation') || errorMessage.includes('obrigatório')) {
      errorType = 'validation';
      suggestion = 'Verifique se todos os campos obrigatórios estão preenchidos';
      httpStatus = 400;
    }
    
    const errorResponse = { 
      success: false,
      error: "Falha ao gerar checklist com IA",
      details: errorMessage,
      error_type: errorType,
      suggestion: suggestion,
      timestamp: new Date().toISOString(),
      debug_info: {
        has_openai_key: !!c.env.OPENAI_API_KEY,
        request_id: crypto.randomUUID()
      }
    };
    
    console.error('Returning error response:', errorResponse);
    
    return c.json(errorResponse, httpStatus as any);
  }
});

// Save generated template from AI
app.post("/api/checklist-templates/save-generated", async (c) => {
  const env = c.env;
  const body = await c.req.json();
  
  try {
    // Create template
    const templateResult = await env.DB.prepare(`
      INSERT INTO checklist_templates (name, description, category, created_by, is_public, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).bind(
      body.template.name,
      body.template.description,
      body.template.category,
      body.template.created_by || 'IA Avançada',
      body.template.is_public || true
    ).run();
    
    const templateId = templateResult.meta.last_row_id as number;
    
    // Add fields to template
    for (const field of body.fields) {
      await env.DB.prepare(`
        INSERT INTO checklist_fields (template_id, field_name, field_type, is_required, options, order_index, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `).bind(
        templateId,
        field.field_name,
        field.field_type,
        field.is_required || false,
        field.options || null,
        field.order_index || 0
      ).run();
    }
    
    return c.json({ 
      id: templateId,
      message: "Generated template saved successfully" 
    });
    
  } catch (error) {
    console.error('Save generated template error:', error);
    return c.json({ 
      error: "Failed to save generated template",
      details: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});

// AI Analysis endpoint
app.post("/api/inspections/:id/ai-analysis", zValidator("json", AIAnalysisRequestSchema), async (c) => {
  const env = c.env;
  const inspectionId = parseInt(c.req.param("id"));
  const { inspection_context, non_compliant_items } = c.req.valid("json");
  
  if (!env.OPENAI_API_KEY) {
    return c.json({ error: "OpenAI API key not configured" }, 500);
  }
  
  try {
    // AI analysis request received
    
    // Generating action plan with OpenAI
    
    const OpenAI = (await import('openai')).default;
    const openai = new OpenAI({
      apiKey: env.OPENAI_API_KEY,
    });
    
    // Non-compliant items for analysis
    
    const prompt = `Como especialista em segurança do trabalho, analise os seguintes itens não conformes de uma inspeção e crie um plano de ação 5W2H:

Contexto da Inspeção: ${inspection_context}

Itens Não Conformes:
${non_compliant_items.join('\n')}

Crie um plano de ação detalhado em formato JSON com:
- summary: Resumo executivo dos problemas encontrados
- priority_level: "baixa", "media", "alta" ou "critica"
- estimated_completion: Prazo estimado para conclusão (ex: "30 dias")
- actions: Array de ações, cada uma com:
  - item: Título da ação
  - what: O que fazer (descrição detalhada)
  - why: Por que é necessário (justificativa)
  - where: Onde aplicar (local específico)
  - when: Quando executar (prazo)
  - who: Quem é responsável (cargo/função)
  - how: Como executar (metodologia)
  - how_much: Quanto custa (estimativa de recursos)

Retorne APENAS o JSON válido.`;
    
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      max_tokens: 2000,
    });
    
    const response = completion.choices[0]?.message?.content;
    if (!response) {
      throw new Error("No response from OpenAI");
    }
    
    // Parse the action plan
    let actionPlan;
    try {
      actionPlan = JSON.parse(response);
    } catch (parseError) {
      // Try to extract JSON from the response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        actionPlan = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("Failed to parse AI response as JSON");
      }
    }
    
    // Save action plan to inspection
    await env.DB.prepare(`
      UPDATE inspections 
      SET action_plan = ?, updated_at = datetime('now')
      WHERE id = ?
    `).bind(JSON.stringify(actionPlan), inspectionId).run();
    
    // Action plan generated successfully
    
    return c.json({ 
      action_plan: actionPlan,
      message: "AI analysis completed successfully" 
    });
    
  } catch (error) {
    // Error generating action plan
    return c.json({ error: "Failed to generate AI analysis" }, 500);
  }
});

// Get checklist templates
app.get("/api/checklist-templates", async (c) => {
  const env = c.env;
  const templates = await env.DB.prepare("SELECT * FROM checklist_templates ORDER BY created_at DESC").all();
  return c.json({ templates: templates.results });
});

// Get template by ID with fields
app.get("/api/checklist-templates/:id", async (c) => {
  const env = c.env;
  const id = parseInt(c.req.param("id"));
  
  const template = await env.DB.prepare("SELECT * FROM checklist_templates WHERE id = ?").bind(id).first();
  
  if (!template) {
    return c.json({ error: "Template not found" }, 404);
  }
  
  const fields = await env.DB.prepare("SELECT * FROM checklist_fields WHERE template_id = ? ORDER BY order_index ASC").bind(id).all();
  
  return c.json({
    template,
    fields: fields.results
  });
});

// Create checklist template
app.post("/api/checklist-templates", zValidator("json", ChecklistTemplateSchema.omit({ id: true })), async (c) => {
  const env = c.env;
  const data = c.req.valid("json");
  
  const result = await env.DB.prepare(`
    INSERT INTO checklist_templates (name, description, category, created_by, is_public, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `).bind(
    data.name,
    data.description || null,
    data.category,
    data.created_by || 'User',
    data.is_public || false
  ).run();
  
  return c.json({ 
    id: result.meta.last_row_id, 
    message: "Template created successfully" 
  });
});

// Update checklist template
app.put("/api/checklist-templates/:id", zValidator("json", ChecklistTemplateSchema.partial()), async (c) => {
  const env = c.env;
  const id = parseInt(c.req.param("id"));
  const data = c.req.valid("json");
  
  const updateFields = Object.entries(data)
    .filter(([_, value]) => value !== undefined)
    .map(([key, _]) => `${key} = ?`)
    .join(", ");
  
  const updateValues = Object.values(data).filter(value => value !== undefined);
  
  await env.DB.prepare(`
    UPDATE checklist_templates 
    SET ${updateFields}, updated_at = datetime('now')
    WHERE id = ?
  `).bind(...updateValues, id).run();
  
  return c.json({ message: "Template updated successfully" });
});

// Delete checklist template
app.delete("/api/checklist-templates/:id", async (c) => {
  const env = c.env;
  const id = parseInt(c.req.param("id"));
  
  await env.DB.prepare("DELETE FROM checklist_fields WHERE template_id = ?").bind(id).run();
  await env.DB.prepare("DELETE FROM checklist_templates WHERE id = ?").bind(id).run();
  
  return c.json({ message: "Template deleted successfully" });
});

// Add field to template
app.post("/api/checklist-templates/:id/fields", zValidator("json", ChecklistFieldSchema.omit({ id: true, template_id: true })), async (c) => {
  const env = c.env;
  const templateId = parseInt(c.req.param("id"));
  const data = c.req.valid("json");
  
  await env.DB.prepare(`
    INSERT INTO checklist_fields (template_id, field_name, field_type, is_required, options, order_index, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `).bind(
    templateId,
    data.field_name,
    data.field_type,
    data.is_required || false,
    data.options || null,
    data.order_index || 0
  ).run();
  
  return c.json({ message: "Field added successfully" });
});

// Update template field
app.put("/api/checklist-fields/:id", zValidator("json", ChecklistFieldSchema.partial()), async (c) => {
  const env = c.env;
  const id = parseInt(c.req.param("id"));
  const data = c.req.valid("json");
  
  const updateFields = Object.entries(data)
    .filter(([_, value]) => value !== undefined)
    .map(([key, _]) => `${key} = ?`)
    .join(", ");
  
  const updateValues = Object.values(data).filter(value => value !== undefined);
  
  await env.DB.prepare(`
    UPDATE checklist_fields 
    SET ${updateFields}, updated_at = datetime('now')
    WHERE id = ?
  `).bind(...updateValues, id).run();
  
  return c.json({ message: "Field updated successfully" });
});

// Delete template field
app.delete("/api/checklist-fields/:id", async (c) => {
  const env = c.env;
  const id = parseInt(c.req.param("id"));
  
  await env.DB.prepare("DELETE FROM checklist_fields WHERE id = ?").bind(id).run();
  
  return c.json({ message: "Field deleted successfully" });
});

// CSV Import endpoint
app.post("/api/csv-import", zValidator("json", CSVImportSchema), async (c) => {
  const env = c.env;
  const { template_name, category, csv_data } = c.req.valid("json");
  
  // Processing CSV import request for template
  
  try {
    // Parse CSV data
    const lines = csv_data.trim().split('\n');
    
    // Create template
    const templateResult = await env.DB.prepare(`
      INSERT INTO checklist_templates (name, description, category, created_by, is_public, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).bind(
      template_name,
      `Template importado de CSV`,
      category,
      'CSV Import',
      false
    ).run();
    
    const templateId = templateResult.meta.last_row_id as number;
    
    // Process CSV rows
    const csvRows = lines.slice(1); // Skip header
    // CSV rows processed
    
    for (let i = 0; i < csvRows.length; i++) {
      const row = csvRows[i].split(',').map(cell => cell.trim());
      
      if (row.length >= 2) {
        const fieldName = row[0];
        const fieldType = row[1] || 'text';
        const isRequired = row[2] === 'true' || row[2] === '1';
        const options = row[3] || null;
        
        await env.DB.prepare(`
          INSERT INTO checklist_fields (template_id, field_name, field_type, is_required, options, order_index, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        `).bind(
          templateId,
          fieldName,
          fieldType,
          isRequired,
          options,
          i
        ).run();
      }
    }
    
    return c.json({
      template_id: templateId,
      message: "CSV imported successfully",
      fields_imported: csvRows.length
    });
    
  } catch (error) {
    return c.json({ error: "Failed to import CSV data" }, 500);
  }
});

// Export inspection to Excel (client-side generation)
app.get("/api/inspections/:id/export/excel", async (c) => {
  const env = c.env;
  const id = parseInt(c.req.param("id"));
  
  const inspection = await env.DB.prepare("SELECT * FROM inspections WHERE id = ?").bind(id).first();
  
  if (!inspection) {
    return c.json({ error: "Inspection not found" }, 404);
  }
  
  const items = await env.DB.prepare("SELECT * FROM inspection_items WHERE inspection_id = ?").bind(id).all();
  
  return c.json({
    status: "ready_for_client_generation",
    message: "Data ready for Excel generation on client side",
    data: {
      inspection,
      items: items.results
    }
  });
});

// Individual item analysis endpoint
app.post("/api/inspection-items/:id/analyze", async (c) => {
  const env = c.env;
  const inspectionItemId = parseInt(c.req.param("id"));
  
  // Processing item analysis for inspection item
  
  if (!env.OPENAI_API_KEY) {
    return c.json({ error: "OpenAI API key not configured" }, 500);
  }
  
  try {
    const OpenAI = (await import('openai')).default;
    const openai = new OpenAI({
      apiKey: env.OPENAI_API_KEY,
    });
    
    // Get the inspection item
    const item = await env.DB.prepare(`
      SELECT ii.*, i.title as inspection_title, i.location, i.company_name
      FROM inspection_items ii
      JOIN inspections i ON ii.inspection_id = i.id
      WHERE ii.id = ?
    `).bind(inspectionItemId).first() as any;
    
    if (!item) {
      return c.json({ error: "Inspection item not found" }, 404);
    }
    
    const prompt = `Como especialista em segurança do trabalho, analise este item de inspeção:

Item: ${item.item_description}
Categoria: ${item.category}
Status: ${item.is_compliant ? 'Conforme' : 'Não Conforme'}
Observações: ${item.observations || 'Nenhuma'}
Local: ${item.location}
Empresa: ${item.company_name}

Forneça uma análise técnica em formato JSON com:
- risk_assessment: Avaliação de risco (baixo, médio, alto, crítico)
- technical_analysis: Análise técnica detalhada
- regulatory_references: Referências a NRs aplicáveis
- immediate_actions: Ações imediatas necessárias
- preventive_measures: Medidas preventivas recomendadas
- estimated_cost: Estimativa de custo para correção
- completion_time: Tempo estimado para correção

Retorne APENAS o JSON válido.`;
    
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      max_tokens: 1500,
    });
    
    const response = completion.choices[0]?.message?.content;
    if (!response) {
      throw new Error("No response from OpenAI");
    }
    
    // Parse the analysis
    let analysis;
    try {
      analysis = JSON.parse(response);
    } catch (parseError) {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        analysis = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("Failed to parse AI response as JSON");
      }
    }
    
    // Save analysis to item
    await env.DB.prepare(`
      UPDATE inspection_items 
      SET ai_pre_analysis = ?, updated_at = datetime('now')
      WHERE id = ?
    `).bind(JSON.stringify(analysis), inspectionItemId).run();
    
    // Analysis completed for item
    
    return c.json({ 
      analysis,
      message: "Item analysis completed successfully" 
    });
    
  } catch (error) {
    return c.json({ error: "Failed to analyze item" }, 500);
  }
});

// Get signatures for inspection
app.get("/api/inspections/:id/signatures", async (c) => {
  const env = c.env;
  const id = parseInt(c.req.param("id"));
  
  // Loading signatures for inspection
  
  const inspection = await env.DB.prepare(`
    SELECT inspector_signature, responsible_signature FROM inspections WHERE id = ?
  `).bind(id).first() as any;
  
  if (!inspection) {
    return c.json({ error: "Inspection not found" }, 404);
  }
  
  return c.json({
    inspector: inspection.inspector_signature,
    responsible: inspection.responsible_signature
  });
});

// Save signatures for inspection
app.post("/api/inspections/:id/signatures", async (c) => {
  const env = c.env;
  const id = parseInt(c.req.param("id"));
  
  // Saving signatures for inspection
  
  const body = await c.req.json();
  const { inspector, responsible } = body;
  
  await env.DB.prepare(`
    UPDATE inspections 
    SET inspector_signature = ?, responsible_signature = ?, updated_at = datetime('now')
    WHERE id = ?
  `).bind(inspector || null, responsible || null, id).run();
  
  return c.json({ message: "Signatures saved successfully" });
});

// Promote user to admin (temporary endpoint for initial setup)
app.post("/api/users/promote-to-admin", authMiddleware, async (c) => {
  const env = c.env;
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "User not found" }, 401);
  }
  
  // Check if there are any admin users
  const adminCount = await env.DB.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'admin'").first() as any;
  
  // Only allow promotion if there are no admins yet
  if (adminCount.count === 0) {
    await env.DB.prepare(`
      UPDATE users 
      SET role = 'admin', updated_at = datetime('now')
      WHERE id = ?
    `).bind(user.id).run();
    
    return c.json({ 
      message: "Successfully promoted to admin",
      role: "admin"
    });
  } else {
    return c.json({ 
      error: "Admin users already exist. Contact an existing admin for promotion." 
    }, 403);
  }
});

// Get action plan for inspection
app.get("/api/inspections/:id/action-plan", async (c) => {
  const env = c.env;
  const id = parseInt(c.req.param("id"));
  
  const inspection = await env.DB.prepare("SELECT * FROM inspections WHERE id = ?").bind(id).first();
  
  if (!inspection) {
    return c.json({ error: "Inspection not found" }, 404);
  }
  
  const actionItems = await env.DB.prepare(`
    SELECT * FROM action_items WHERE inspection_id = ? ORDER BY created_at DESC
  `).bind(id).all();
  
  return c.json({
    inspection,
    action_items: actionItems.results
  });
});

// Create action item
app.post("/api/inspections/:id/action-items", async (c) => {
  const env = c.env;
  const inspectionId = parseInt(c.req.param("id"));
  
  const body = await c.req.json();
  const {
    inspection_item_id,
    title,
    what_description,
    where_location,
    why_reason,
    how_method,
    who_responsible,
    when_deadline,
    how_much_cost,
    priority,
    is_ai_generated
  } = body;
  
  await env.DB.prepare(`
    INSERT INTO action_items (
      inspection_id, inspection_item_id, title, what_description, where_location,
      why_reason, how_method, who_responsible, when_deadline, how_much_cost,
      priority, is_ai_generated, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    inspectionId,
    inspection_item_id || null,
    title,
    what_description || null,
    where_location || null,
    why_reason || null,
    how_method || null,
    who_responsible || null,
    when_deadline || null,
    how_much_cost || null,
    priority || 'media',
    is_ai_generated || false,
    'pending'
  ).run();
  
  return c.json({ message: "Action item created successfully" });
});

// Update action item
app.put("/api/action-items/:id", async (c) => {
  const env = c.env;
  const id = parseInt(c.req.param("id"));
  
  const body = await c.req.json();
  const updateFields = Object.entries(body)
    .filter(([_, value]) => value !== undefined)
    .map(([key, _]) => `${key} = ?`)
    .join(", ");
  
  const updateValues = Object.values(body).filter(value => value !== undefined);
  
  await env.DB.prepare(`
    UPDATE action_items 
    SET ${updateFields}, updated_at = datetime('now')
    WHERE id = ?
  `).bind(...updateValues, id).run();
  
  return c.json({ message: "Action item updated successfully" });
});

// Delete action item
app.delete("/api/action-items/:id", async (c) => {
  const env = c.env;
  const id = parseInt(c.req.param("id"));
  
  await env.DB.prepare("DELETE FROM action_items WHERE id = ?").bind(id).run();
  
  return c.json({ message: "Action item deleted successfully" });
});

// Users management endpoints
app.get("/api/users", authMiddleware, async (c) => {
  const env = c.env;
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "User not found" }, 401);
  }
  
  // Only admin can see all users
  const userProfile = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(user.id).first() as any;
  if (userProfile?.role !== 'admin') {
    return c.json({ error: "Unauthorized" }, 403);
  }
  
  const users = await env.DB.prepare("SELECT * FROM users ORDER BY created_at DESC").all();
  return c.json({ users: users.results });
});

app.put("/api/users/:id", authMiddleware, async (c) => {
  const env = c.env;
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "User not found" }, 401);
  }
  
  const userId = c.req.param("id");
  const body = await c.req.json();
  
  // Users can edit their own profile, admins can edit anyone
  const userProfile = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(user.id).first() as any;
  if (userProfile?.role !== 'admin' && user.id !== userId) {
    return c.json({ error: "Unauthorized" }, 403);
  }
  
  const updateFields = Object.entries(body)
    .filter(([_, value]) => value !== undefined)
    .map(([key, _]) => `${key} = ?`)
    .join(", ");
  
  const updateValues = Object.values(body).filter(value => value !== undefined);
  
  await env.DB.prepare(`
    UPDATE users 
    SET ${updateFields}, updated_at = datetime('now')
    WHERE id = ?
  `).bind(...updateValues, userId).run();
  
  return c.json({ message: "User updated successfully" });
});

app.delete("/api/users/:id", authMiddleware, async (c) => {
  const env = c.env;
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "User not found" }, 401);
  }
  
  const userId = c.req.param("id");
  
  // Only admin can delete users
  const userProfile = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(user.id).first() as any;
  if (userProfile?.role !== 'admin') {
    return c.json({ error: "Unauthorized" }, 403);
  }
  
  // Don't allow self-deletion
  if (user.id === userId) {
    return c.json({ error: "Cannot delete your own account" }, 400);
  }
  
  await env.DB.prepare("DELETE FROM users WHERE id = ?").bind(userId).run();
  return c.json({ message: "User deleted successfully" });
});

// Organizations management endpoints
app.get("/api/organizations", authMiddleware, async (c) => {
  const env = c.env;
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "User not found" }, 401);
  }
  
  const userProfile = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(user.id).first() as any;
  
  let organizations;
  if (userProfile?.role === 'admin') {
    // Admins can see all organizations
    organizations = await env.DB.prepare("SELECT * FROM organizations ORDER BY created_at DESC").all();
  } else if (userProfile?.role === 'manager' && userProfile?.organization_id) {
    // Managers can see their own organization and any they manage
    organizations = await env.DB.prepare(`
      SELECT * FROM organizations 
      WHERE id = ? OR id IN (
        SELECT organization_id FROM user_organizations 
        WHERE user_id = ? AND role IN ('owner', 'admin', 'manager')
      )
      ORDER BY created_at DESC
    `).bind(userProfile.organization_id, user.id).all();
  } else if (userProfile?.organization_id) {
    // Regular users can only see their own organization
    organizations = await env.DB.prepare("SELECT * FROM organizations WHERE id = ? ORDER BY created_at DESC").bind(userProfile.organization_id).all();
  } else {
    // Users without organization see empty list
    organizations = { results: [] };
  }
  
  return c.json({ organizations: organizations.results });
});

app.post("/api/organizations", authMiddleware, async (c) => {
  const env = c.env;
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "User not found" }, 401);
  }
  
  // Only admin can create organizations
  const userProfile = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(user.id).first() as any;
  if (userProfile?.role !== 'admin') {
    return c.json({ error: "Unauthorized" }, 403);
  }
  
  const body = await c.req.json();
  
  await env.DB.prepare(`
    INSERT INTO organizations (name, type, description, contact_email, contact_phone, address, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `).bind(
    body.name,
    body.type || 'company',
    body.description || null,
    body.contact_email || null,
    body.contact_phone || null,
    body.address || null
  ).run();
  
  return c.json({ message: "Organization created successfully" });
});

app.put("/api/organizations/:id", authMiddleware, async (c) => {
  const env = c.env;
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "User not found" }, 401);
  }
  
  const orgId = parseInt(c.req.param("id"));
  const body = await c.req.json();
  
  // Only admin can update organizations
  const userProfile = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(user.id).first() as any;
  if (userProfile?.role !== 'admin') {
    return c.json({ error: "Unauthorized" }, 403);
  }
  
  const updateFields = Object.entries(body)
    .filter(([_, value]) => value !== undefined)
    .map(([key, _]) => `${key} = ?`)
    .join(", ");
  
  const updateValues = Object.values(body).filter(value => value !== undefined);
  
  await env.DB.prepare(`
    UPDATE organizations 
    SET ${updateFields}, updated_at = datetime('now')
    WHERE id = ?
  `).bind(...updateValues, orgId).run();
  
  return c.json({ message: "Organization updated successfully" });
});

app.delete("/api/organizations/:id", authMiddleware, async (c) => {
  const env = c.env;
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "User not found" }, 401);
  }
  
  const orgId = parseInt(c.req.param("id"));
  
  // Only admin can delete organizations
  const userProfile = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(user.id).first() as any;
  if (userProfile?.role !== 'admin') {
    return c.json({ error: "Unauthorized" }, 403);
  }
  
  await env.DB.prepare("DELETE FROM organizations WHERE id = ?").bind(orgId).run();
  return c.json({ message: "Organization deleted successfully" });
});

// Get organization by ID
app.get("/api/organizations/:id", authMiddleware, async (c) => {
  const env = c.env;
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "User not found" }, 401);
  }
  
  const orgId = parseInt(c.req.param("id"));
  const userProfile = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(user.id).first() as any;
  
  // Check if user has access to this organization
  if (userProfile?.role !== 'admin' && userProfile?.organization_id !== orgId) {
    return c.json({ error: "Unauthorized" }, 403);
  }
  
  const organization = await env.DB.prepare("SELECT * FROM organizations WHERE id = ?").bind(orgId).first();
  
  if (!organization) {
    return c.json({ error: "Organization not found" }, 404);
  }
  
  return c.json({ organization });
});

// Get organization statistics
app.get("/api/organizations/:id/stats", authMiddleware, async (c) => {
  const env = c.env;
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "User not found" }, 401);
  }
  
  const orgId = parseInt(c.req.param("id"));
  const userProfile = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(user.id).first() as any;
  
  // Check if user has access to this organization
  if (userProfile?.role !== 'admin' && userProfile?.organization_id !== orgId) {
    return c.json({ error: "Unauthorized" }, 403);
  }
  
  try {
    // Get users count
    const usersCount = await env.DB.prepare("SELECT COUNT(*) as count FROM users WHERE organization_id = ?").bind(orgId).first() as any;
    
    // Get inspections stats
    const inspectionsStats = await env.DB.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'pendente' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'concluida' THEN 1 ELSE 0 END) as completed
      FROM inspections WHERE organization_id = ?
    `).bind(orgId).first() as any;
    
    // Get action items stats
    const actionsStats = await env.DB.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN ai.status = 'pending' OR ai.status = 'in_progress' THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN (ai.status = 'pending' OR ai.status = 'in_progress') 
                  AND ai.when_deadline IS NOT NULL 
                  AND DATE(ai.when_deadline) < DATE('now') THEN 1 ELSE 0 END) as overdue
      FROM action_items ai
      JOIN inspections i ON ai.inspection_id = i.id
      WHERE i.organization_id = ?
    `).bind(orgId).first() as any;
    
    // Get recent inspections
    const recentInspections = await env.DB.prepare(`
      SELECT id, title, status, created_at, inspector_name
      FROM inspections 
      WHERE organization_id = ?
      ORDER BY created_at DESC 
      LIMIT 5
    `).bind(orgId).all();
    
    return c.json({
      users_count: usersCount?.count || 0,
      inspections_count: inspectionsStats?.total || 0,
      pending_inspections: inspectionsStats?.pending || 0,
      completed_inspections: inspectionsStats?.completed || 0,
      active_actions: actionsStats?.active || 0,
      overdue_actions: actionsStats?.overdue || 0,
      recent_inspections: recentInspections.results || []
    });
  } catch (error) {
    console.error('Error fetching organization stats:', error);
    return c.json({ error: "Failed to fetch organization statistics" }, 500);
  }
});

// Inspection sharing endpoints
app.post("/api/inspections/:id/share", authMiddleware, async (c) => {
  const env = c.env;
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "User not found" }, 401);
  }
  
  const inspectionId = parseInt(c.req.param("id"));
  const body = await c.req.json();
  
  // Generate unique share token
  const shareToken = crypto.randomUUID();
  
  // Calculate expiration date (default: 30 days)
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + (body.expires_in_days || 30));
  
  await env.DB.prepare(`
    INSERT INTO inspection_shares (inspection_id, share_token, created_by, permission, expires_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `).bind(
    inspectionId,
    shareToken,
    user.id,
    body.permission || 'view',
    expiresAt.toISOString()
  ).run();
  
  // Generate share URL (QR code generation moved to client-side)
  const shareUrl = `${c.req.header('origin') || 'https://localhost'}/shared/${shareToken}`;
  
  return c.json({ 
    share_token: shareToken,
    share_url: shareUrl,
    expires_at: expiresAt.toISOString(),
    message: "Inspection shared successfully" 
  });
});

app.get("/api/shared/:token", async (c) => {
  const env = c.env;
  const token = c.req.param("token");
  
  const share = await env.DB.prepare("SELECT * FROM inspection_shares WHERE share_token = ?").bind(token).first() as any;
  
  if (!share) {
    return c.json({ error: "Share not found" }, 404);
  }
  
  if (!share.is_active) {
    return c.json({ error: "Share is inactive", active: false }, 403);
  }
  
  if (share.expires_at && new Date(share.expires_at) < new Date()) {
    return c.json({ error: "Share has expired", expired: true }, 403);
  }
  
  const inspection = await env.DB.prepare("SELECT * FROM inspections WHERE id = ?").bind(share.inspection_id).first();
  const items = await env.DB.prepare("SELECT * FROM inspection_items WHERE inspection_id = ?").bind(share.inspection_id).all();
  const media = await env.DB.prepare("SELECT * FROM inspection_media WHERE inspection_id = ?").bind(share.inspection_id).all();
  
  return c.json({
    share,
    inspection,
    items: items.results,
    media: media.results
  });
});

app.post("/api/shared/:token/access", async (c) => {
  const env = c.env;
  const token = c.req.param("token");
  
  await env.DB.prepare(`
    UPDATE inspection_shares 
    SET access_count = access_count + 1, updated_at = datetime('now')
    WHERE share_token = ?
  `).bind(token).run();
  
  return c.json({ message: "Access logged" });
});

app.post("/api/shared/:token/responses", async (c) => {
  const env = c.env;
  const token = c.req.param("token");
  const body = await c.req.json();
  
  const share = await env.DB.prepare("SELECT * FROM inspection_shares WHERE share_token = ?").bind(token).first() as any;
  
  if (!share || share.permission !== 'edit') {
    return c.json({ error: "No edit permission" }, 403);
  }
  
  // Save responses similar to the main inspection responses endpoint
  const responses = body.responses;
  
  for (const response of responses) {
    const templateField = await env.DB.prepare(`
      SELECT template_id FROM checklist_fields WHERE id = ?
    `).bind(response.field_id).first() as any;
    
    if (!templateField) continue;
    
    const templateId = templateField.template_id;
    
    const fieldData = {
      field_id: response.field_id,
      field_name: response.field_name,
      field_type: response.field_type,
      response_value: response.value,
      comment: response.comment || null
    };
    
    const existingItem = await env.DB.prepare(`
      SELECT id FROM inspection_items 
      WHERE inspection_id = ? AND template_id = ? AND JSON_EXTRACT(field_responses, '$.field_id') = ?
    `).bind(share.inspection_id, templateId, response.field_id).first();
    
    if (existingItem) {
      await env.DB.prepare(`
        UPDATE inspection_items 
        SET field_responses = ?, updated_at = datetime('now')
        WHERE inspection_id = ? AND template_id = ? AND JSON_EXTRACT(field_responses, '$.field_id') = ?
      `).bind(JSON.stringify(fieldData), share.inspection_id, templateId, response.field_id).run();
    } else {
      await env.DB.prepare(`
        INSERT INTO inspection_items (inspection_id, template_id, field_responses, created_at, updated_at)
        VALUES (?, ?, ?, datetime('now'), datetime('now'))
      `).bind(share.inspection_id, templateId, JSON.stringify(fieldData)).run();
    }
  }
  
  return c.json({ message: "Responses saved successfully" });
});

// Get inspection shares
app.get("/api/inspections/:id/shares", authMiddleware, async (c) => {
  const env = c.env;
  const inspectionId = parseInt(c.req.param("id"));
  
  const shares = await env.DB.prepare(`
    SELECT * FROM inspection_shares WHERE inspection_id = ? ORDER BY created_at DESC
  `).bind(inspectionId).all();
  
  return c.json({ shares: shares.results });
});

// Delete inspection share
app.delete("/api/inspection-shares/:id", authMiddleware, async (c) => {
  const env = c.env;
  const shareId = parseInt(c.req.param("id"));
  
  await env.DB.prepare("DELETE FROM inspection_shares WHERE id = ?").bind(shareId).run();
  return c.json({ message: "Share deleted successfully" });
});

// Collaboration endpoints
app.post("/api/inspections/:id/collaborators", authMiddleware, async (c) => {
  const env = c.env;
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "User not found" }, 401);
  }
  
  const inspectionId = parseInt(c.req.param("id"));
  const body = await c.req.json();
  
  await env.DB.prepare(`
    INSERT INTO inspection_collaborators (inspection_id, user_id, permission, invited_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
  `).bind(
    inspectionId,
    body.user_id,
    body.permission || 'edit',
    user.id
  ).run();
  
  return c.json({ message: "Collaborator added successfully" });
});

app.get("/api/inspections/:id/collaborators", authMiddleware, async (c) => {
  const env = c.env;
  const inspectionId = parseInt(c.req.param("id"));
  
  const collaborators = await env.DB.prepare(`
    SELECT ic.*, u.name, u.email, u.avatar_url
    FROM inspection_collaborators ic
    JOIN users u ON ic.user_id = u.id
    WHERE ic.inspection_id = ? AND ic.status = 'active'
    ORDER BY ic.created_at DESC
  `).bind(inspectionId).all();
  
  return c.json({ collaborators: collaborators.results });
});

app.delete("/api/inspection-collaborators/:id", authMiddleware, async (c) => {
  const env = c.env;
  const collaboratorId = parseInt(c.req.param("id"));
  
  await env.DB.prepare(`
    UPDATE inspection_collaborators 
    SET status = 'removed', updated_at = datetime('now')
    WHERE id = ?
  `).bind(collaboratorId).run();
  
  return c.json({ message: "Collaborator removed successfully" });
});

// Get all action items across all inspections
app.get("/api/action-plans/all", authMiddleware, async (c) => {
  const env = c.env;
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "User not found" }, 401);
  }
  
  // Get user profile to check organization access
  const userProfile = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(user.id).first() as any;
  
  let query = `
    SELECT 
      ai.*,
      i.title as inspection_title,
      i.location as inspection_location,
      i.company_name as inspection_company
    FROM action_items ai
    JOIN inspections i ON ai.inspection_id = i.id
  `;
  let params: any[] = [];
  let whereClause = [];
  
  // Check for organization filter from query params
  const organizationId = c.req.query('organization_id');
  if (organizationId) {
    whereClause.push("i.organization_id = ?");
    params.push(parseInt(organizationId));
  } else {
    // If no specific organization requested, apply default filtering
    // If user has organization_id, filter by organization (unless admin)
    if (userProfile?.organization_id && userProfile?.role !== 'admin') {
      whereClause.push("(i.organization_id = ? OR i.organization_id IS NULL)");
      params.push(userProfile.organization_id);
    }
  }
  
  // For non-admin users, also filter by created_by or collaborators
  if (userProfile?.role !== 'admin') {
    whereClause.push("(i.created_by = ? OR i.id IN (SELECT inspection_id FROM inspection_collaborators WHERE user_id = ? AND status = 'active'))");
    params.push(user.id, user.id);
  }
  
  if (whereClause.length > 0) {
    query += " WHERE " + whereClause.join(" AND ");
  }
  
  query += `
    ORDER BY 
      CASE 
        WHEN ai.when_deadline IS NOT NULL AND DATE(ai.when_deadline) < DATE('now') AND ai.status != 'completed' THEN 1
        WHEN ai.priority = 'alta' THEN 2
        WHEN ai.priority = 'media' THEN 3
        ELSE 4
      END,
      ai.created_at DESC
  `;
  
  const actionItems = await env.DB.prepare(query).bind(...params).all();
  
  return c.json({
    action_items: actionItems.results
  });
});

export default app;
