import { Hono } from "hono";
import { cors } from "hono/cors";
import { getCookie, setCookie } from "hono/cookie";
import {
  authMiddleware,
  getOAuthRedirectUrl,
  exchangeCodeForSessionToken,
  deleteSession,
  MOCHA_SESSION_TOKEN_COOKIE_NAME,
} from "@getmocha/users-service/backend";

import multiTenantRoutes from "./multi-tenant-routes";
import checklistRoutes from "./checklist-routes";
import shareRoutes from "./share-routes";
import usersRoutes from "./users-routes";
import { USER_ROLES } from "@/shared/user-types";

const app = new Hono<{ Bindings: Env }>();

app.use("*", cors({
  origin: "*",
  allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization"],
}));

// Mount routes
app.route("/api/multi-tenant", multiTenantRoutes);
app.route("/api/checklist", checklistRoutes);
app.route("/api/shared", shareRoutes);
app.route("/api/users", usersRoutes);

// Authentication endpoints
app.get('/api/oauth/google/redirect_url', async (c) => {
  const redirectUrl = await getOAuthRedirectUrl('google', {
    apiUrl: c.env.MOCHA_USERS_SERVICE_API_URL || '',
    apiKey: c.env.MOCHA_USERS_SERVICE_API_KEY || '',
  });

  return c.json({ redirectUrl }, 200);
});

app.post("/api/sessions", async (c) => {
  try {
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
  } catch (error) {
    return c.json({ error: "Failed to create session" }, 500);
  }
});

app.get("/api/users/me", authMiddleware, async (c) => {
  const mochaUser = c.get("user");
  if (!mochaUser) {
    return c.json({ error: "User not found" }, 401);
  }
  
  // Get or create user profile in our database
  let user = await c.env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(mochaUser.id).first() as any;
  
  // ALWAYS ensure eng.tiagosm@gmail.com is SYSTEM_ADMIN
  const isSystemCreator = mochaUser.email === 'eng.tiagosm@gmail.com';
  
  if (!user) {
    // Check if user was invited
    const invitation = await c.env.DB.prepare(`
      SELECT * FROM user_invitations 
      WHERE email = ? AND accepted_at IS NULL AND expires_at > datetime('now')
      ORDER BY created_at DESC LIMIT 1
    `).bind(mochaUser.email).first() as any;
    
    if (invitation && !isSystemCreator) {
      // Create user profile based on invitation (only if not system creator)
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
      // Create default user profile
      const userCount = await c.env.DB.prepare("SELECT COUNT(*) as count FROM users").first() as any;
      const isFirstUser = userCount.count === 0;
      
      // System creator ALWAYS gets system admin role, others get admin if first user
      const role = isSystemCreator ? USER_ROLES.SYSTEM_ADMIN : (isFirstUser ? USER_ROLES.SYSTEM_ADMIN : USER_ROLES.INSPECTOR);
      const canManage = isSystemCreator || isFirstUser;
      
      await c.env.DB.prepare(`
        INSERT INTO users (
          id, email, name, role, can_manage_users, can_create_organizations,
          is_active, last_login_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), datetime('now'))
      `).bind(
        mochaUser.id,
        mochaUser.email,
        mochaUser.google_user_data.name || mochaUser.email,
        role,
        canManage,
        canManage,
        true
      ).run();
    }
    
    user = await c.env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(mochaUser.id).first();
  } else {
    // ALWAYS check if this is the system creator and force promotion if needed
    if (isSystemCreator && user.role !== USER_ROLES.SYSTEM_ADMIN) {
      await c.env.DB.prepare(`
        UPDATE users 
        SET role = ?, can_manage_users = ?, can_create_organizations = ?, updated_at = datetime('now')
        WHERE id = ?
      `).bind(USER_ROLES.SYSTEM_ADMIN, true, true, mochaUser.id).run();
      
      user = await c.env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(mochaUser.id).first();
    }
    
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

// Organizations endpoint
app.get("/api/organizations", authMiddleware, async (c) => {
  const env = c.env;
  const user = c.get("user");
  
  if (!user) {
    return c.json({ error: "User not found" }, 401);
  }
  
  const userProfile = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(user.id).first() as any;
  
  try {
    let query = `
      SELECT o.*, 
             (SELECT COUNT(id) FROM users WHERE organization_id = o.id AND is_active = true) as user_count
      FROM organizations o
      WHERE o.is_active = true
    `;
    
    let params: any[] = [];
    
    // Filter based on user role
    if (userProfile?.role === USER_ROLES.SYSTEM_ADMIN) {
      // System admin sees all organizations
      query += " ORDER BY o.name ASC";
    } else if (userProfile?.organization_id) {
      // Other users see only their organization
      query += " AND o.id = ? ORDER BY o.name ASC";
      params.push(userProfile.organization_id);
    } else {
      // Users without organization see no organizations
      query += " AND 1 = 0";
    }
    
    const organizations = await env.DB.prepare(query).bind(...params).all();
    
    return c.json({ organizations: organizations.results });
    
  } catch (error) {
    console.error('Error fetching organizations:', error);
    return c.json({ error: "Failed to fetch organizations" }, 500);
  }
});

// Get organization details
app.get("/api/organizations/:id", authMiddleware, async (c) => {
  const env = c.env;
  const user = c.get("user");
  const orgId = parseInt(c.req.param("id"));
  
  if (!user) {
    return c.json({ error: "User not found" }, 401);
  }
  
  try {
    const organization = await env.DB.prepare(`
      SELECT o.*, 
             (SELECT COUNT(id) FROM users WHERE organization_id = o.id AND is_active = true) as user_count,
             (SELECT COUNT(id) FROM organizations WHERE parent_organization_id = o.id AND is_active = true) as subsidiary_count
      FROM organizations o
      WHERE o.id = ?
    `).bind(orgId).first();
    
    if (!organization) {
      return c.json({ error: "Organization not found" }, 404);
    }
    
    return c.json({ organization });
    
  } catch (error) {
    console.error('Error fetching organization:', error);
    return c.json({ error: "Failed to fetch organization" }, 500);
  }
});

// Get organization stats
app.get("/api/organizations/:id/stats", authMiddleware, async (c) => {
  const env = c.env;
  const orgId = parseInt(c.req.param("id"));
  
  try {
    // Get users count
    const usersCount = await env.DB.prepare(`
      SELECT COUNT(*) as count FROM users WHERE organization_id = ? AND is_active = true
    `).bind(orgId).first() as any;
    
    // Get inspections stats
    const inspectionsStats = await env.DB.prepare(`
      SELECT 
        COUNT(*) as inspections_count,
        SUM(CASE WHEN status = 'pendente' THEN 1 ELSE 0 END) as pending_inspections,
        SUM(CASE WHEN status = 'concluida' THEN 1 ELSE 0 END) as completed_inspections
      FROM inspections 
      WHERE organization_id = ?
    `).bind(orgId).first() as any;
    
    // Get action items stats
    const actionStats = await env.DB.prepare(`
      SELECT 
        COUNT(*) as active_actions,
        SUM(CASE WHEN when_deadline < date('now') AND status != 'completed' THEN 1 ELSE 0 END) as overdue_actions
      FROM action_items ai
      JOIN inspections i ON ai.inspection_id = i.id
      WHERE i.organization_id = ? AND ai.status != 'completed'
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
      inspections_count: inspectionsStats?.inspections_count || 0,
      pending_inspections: inspectionsStats?.pending_inspections || 0,
      completed_inspections: inspectionsStats?.completed_inspections || 0,
      active_actions: actionStats?.active_actions || 0,
      overdue_actions: actionStats?.overdue_actions || 0,
      recent_inspections: recentInspections.results || []
    });
    
  } catch (error) {
    console.error('Error fetching organization stats:', error);
    return c.json({ error: "Failed to fetch organization stats" }, 500);
  }
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
    // Apply organization-based filtering based on user role
    if (userProfile?.role === USER_ROLES.SYSTEM_ADMIN) {
      // SYSTEM_ADMIN sees ALL inspections - no restrictions whatsoever
      // No additional filter needed
    } else if (userProfile?.role === USER_ROLES.ORG_ADMIN && userProfile?.managed_organization_id) {
      // Org admin sees their organization and subsidiaries
      whereClause.push(`(organization_id = ? OR organization_id IN (
        SELECT id FROM organizations WHERE parent_organization_id = ?
      ))`);
      params.push(userProfile.managed_organization_id, userProfile.managed_organization_id);
    } else if (userProfile?.organization_id) {
      // Other users see only their organization's inspections
      whereClause.push("organization_id = ?");
      params.push(userProfile.organization_id);
    }
  }
  
  // For non-admin users, also filter by created_by or collaborators
  // SYSTEM_ADMIN bypasses ALL filters and sees everything
  if (userProfile?.role !== USER_ROLES.SYSTEM_ADMIN && userProfile?.role !== USER_ROLES.ORG_ADMIN) {
    whereClause.push("(created_by = ? OR id IN (SELECT inspection_id FROM inspection_collaborators WHERE user_id = ? AND status = 'active'))");
    params.push(user.id, user.id);
  }
  
  if (whereClause.length > 0) {
    query += " WHERE " + whereClause.join(" AND ");
  }
  
  const stats = await env.DB.prepare(query).bind(...params).first();
  
  return c.json(stats);
});

// Action plan summary endpoint
app.get("/api/dashboard/action-plan-summary", authMiddleware, async (c) => {
  const env = c.env;
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "User not found" }, 401);
  }
  
  const userProfile = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(user.id).first() as any;
  
  let query = `
    SELECT 
      COUNT(*) as total_actions,
      SUM(CASE WHEN ai.status = 'pending' THEN 1 ELSE 0 END) as pending_actions,
      SUM(CASE WHEN ai.status = 'in_progress' THEN 1 ELSE 0 END) as in_progress_actions,
      SUM(CASE WHEN ai.status = 'completed' THEN 1 ELSE 0 END) as completed_actions,
      SUM(CASE WHEN ai.when_deadline < date('now') AND ai.status != 'completed' THEN 1 ELSE 0 END) as overdue_actions,
      SUM(CASE WHEN ai.priority = 'alta' AND ai.status = 'pending' THEN 1 ELSE 0 END) as high_priority_pending,
      SUM(CASE WHEN ai.is_ai_generated = true THEN 1 ELSE 0 END) as ai_generated_count
    FROM action_items ai
    JOIN inspections i ON ai.inspection_id = i.id
  `;
  
  let params: any[] = [];
  let whereClause = [];
  
  const organizationId = c.req.query('organization_id');
  if (organizationId) {
    whereClause.push("i.organization_id = ?");
    params.push(parseInt(organizationId));
  } else {
    if (userProfile?.role === USER_ROLES.SYSTEM_ADMIN) {
      // System admin sees all
    } else if (userProfile?.role === USER_ROLES.ORG_ADMIN && userProfile?.managed_organization_id) {
      whereClause.push(`(i.organization_id = ? OR i.organization_id IN (
        SELECT id FROM organizations WHERE parent_organization_id = ?
      ))`);
      params.push(userProfile.managed_organization_id, userProfile.managed_organization_id);
    } else if (userProfile?.organization_id) {
      whereClause.push("i.organization_id = ?");
      params.push(userProfile.organization_id);
    }
  }
  
  if (whereClause.length > 0) {
    query += " WHERE " + whereClause.join(" AND ");
  }
  
  const summary = await env.DB.prepare(query).bind(...params).first();
  
  return c.json(summary);
});

// Inspections endpoints
app.get("/api/inspections", authMiddleware, async (c) => {
  const env = c.env;
  const user = c.get("user");
  
  if (!user) {
    return c.json({ error: "User not found" }, 401);
  }
  
  const userProfile = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(user.id).first() as any;
  
  let query = `
    SELECT i.*, o.name as organization_name
    FROM inspections i
    LEFT JOIN organizations o ON i.organization_id = o.id
  `;
  let params: any[] = [];
  let whereClause = [];
  
  const organizationId = c.req.query('organization_id');
  if (organizationId) {
    whereClause.push("i.organization_id = ?");
    params.push(parseInt(organizationId));
  } else {
    if (userProfile?.role === USER_ROLES.SYSTEM_ADMIN) {
      // System admin sees all
    } else if (userProfile?.role === USER_ROLES.ORG_ADMIN && userProfile?.managed_organization_id) {
      whereClause.push(`(i.organization_id = ? OR i.organization_id IN (
        SELECT id FROM organizations WHERE parent_organization_id = ?
      ))`);
      params.push(userProfile.managed_organization_id, userProfile.managed_organization_id);
    } else if (userProfile?.organization_id) {
      whereClause.push("i.organization_id = ?");
      params.push(userProfile.organization_id);
    }
  }
  
  if (userProfile?.role !== USER_ROLES.SYSTEM_ADMIN && userProfile?.role !== USER_ROLES.ORG_ADMIN) {
    whereClause.push("(i.created_by = ? OR i.id IN (SELECT inspection_id FROM inspection_collaborators WHERE user_id = ? AND status = 'active'))");
    params.push(user.id, user.id);
  }
  
  if (whereClause.length > 0) {
    query += " WHERE " + whereClause.join(" AND ");
  }
  
  query += " ORDER BY i.created_at DESC";
  
  const inspections = await env.DB.prepare(query).bind(...params).all();
  
  return c.json({ inspections: inspections.results });
});

// Create inspection
app.post("/api/inspections", authMiddleware, async (c) => {
  const env = c.env;
  const user = c.get("user");
  
  if (!user) {
    return c.json({ error: "User not found" }, 401);
  }
  
  const body = await c.req.json();
  
  try {
    const result = await env.DB.prepare(`
      INSERT INTO inspections (
        title, description, location, company_name, cep, address, latitude, longitude,
        inspector_name, inspector_email, responsible_name, status, priority, 
        scheduled_date, action_plan_type, organization_id, created_by, ai_assistant_id,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).bind(
      body.title,
      body.description || null,
      body.location,
      body.company_name,
      body.cep || null,
      body.address || null,
      body.latitude || null,
      body.longitude || null,
      body.inspector_name,
      body.inspector_email || null,
      body.responsible_name || null,
      body.status || 'pendente',
      body.priority || 'media',
      body.scheduled_date || null,
      body.action_plan_type || '5w2h',
      body.organization_id || null,
      user.id,
      body.ai_assistant_id || null
    ).run();
    
    const inspectionId = result.meta.last_row_id as number;
    
    // If template_id is provided, create template-based items
    if (body.template_id) {
      const template = await env.DB.prepare("SELECT * FROM checklist_templates WHERE id = ?").bind(body.template_id).first();
      const fields = await env.DB.prepare("SELECT * FROM checklist_fields WHERE template_id = ? ORDER BY order_index").bind(body.template_id).all();
      
      for (const field of fields.results) {
        const fieldData = {
          field_id: (field as any).id,
          field_type: (field as any).field_type,
          is_required: (field as any).is_required,
          options: (field as any).options,
          response_value: null,
          comment: null
        };
        
        await env.DB.prepare(`
          INSERT INTO inspection_items (
            inspection_id, category, item_description, template_id, field_responses,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        `).bind(
          inspectionId,
          (template as any)?.category || 'Template',
          (field as any).field_name,
          body.template_id,
          JSON.stringify(fieldData)
        ).run();
      }
    }
    
    return c.json({ id: inspectionId, message: "Inspection created successfully" });
    
  } catch (error) {
    console.error('Error creating inspection:', error);
    return c.json({ error: "Failed to create inspection" }, 500);
  }
});

// Get inspection details
app.get("/api/inspections/:id", authMiddleware, async (c) => {
  const env = c.env;
  const inspectionId = parseInt(c.req.param("id"));
  
  try {
    const inspection = await env.DB.prepare("SELECT * FROM inspections WHERE id = ?").bind(inspectionId).first();
    
    if (!inspection) {
      return c.json({ error: "Inspection not found" }, 404);
    }
    
    const items = await env.DB.prepare("SELECT * FROM inspection_items WHERE inspection_id = ?").bind(inspectionId).all();
    const media = await env.DB.prepare("SELECT * FROM inspection_media WHERE inspection_id = ?").bind(inspectionId).all();
    
    return c.json({
      inspection,
      items: items.results,
      media: media.results
    });
    
  } catch (error) {
    console.error('Error fetching inspection:', error);
    return c.json({ error: "Failed to fetch inspection" }, 500);
  }
});

// Update inspection
app.put("/api/inspections/:id", authMiddleware, async (c) => {
  const env = c.env;
  const inspectionId = parseInt(c.req.param("id"));
  const body = await c.req.json();
  
  try {
    await env.DB.prepare(`
      UPDATE inspections 
      SET title = ?, description = ?, location = ?, company_name = ?, cep = ?, address = ?,
          latitude = ?, longitude = ?, inspector_name = ?, inspector_email = ?, 
          responsible_name = ?, status = ?, priority = ?, scheduled_date = ?,
          action_plan_type = ?, organization_id = ?, ai_assistant_id = ?,
          updated_at = datetime('now')
      WHERE id = ?
    `).bind(
      body.title,
      body.description || null,
      body.location,
      body.company_name,
      body.cep || null,
      body.address || null,
      body.latitude || null,
      body.longitude || null,
      body.inspector_name,
      body.inspector_email || null,
      body.responsible_name || null,
      body.status || 'pendente',
      body.priority || 'media',
      body.scheduled_date || null,
      body.action_plan_type || '5w2h',
      body.organization_id || null,
      body.ai_assistant_id || null,
      inspectionId
    ).run();
    
    return c.json({ message: "Inspection updated successfully" });
    
  } catch (error) {
    console.error('Error updating inspection:', error);
    return c.json({ error: "Failed to update inspection" }, 500);
  }
});

// Delete inspection
app.delete("/api/inspections/:id", authMiddleware, async (c) => {
  const env = c.env;
  const inspectionId = parseInt(c.req.param("id"));
  
  try {
    // Delete related data first
    await env.DB.prepare("DELETE FROM inspection_media WHERE inspection_id = ?").bind(inspectionId).run();
    await env.DB.prepare("DELETE FROM inspection_items WHERE inspection_id = ?").bind(inspectionId).run();
    await env.DB.prepare("DELETE FROM action_items WHERE inspection_id = ?").bind(inspectionId).run();
    await env.DB.prepare("DELETE FROM inspection_shares WHERE inspection_id = ?").bind(inspectionId).run();
    
    // Delete inspection
    await env.DB.prepare("DELETE FROM inspections WHERE id = ?").bind(inspectionId).run();
    
    return c.json({ message: "Inspection deleted successfully" });
    
  } catch (error) {
    console.error('Error deleting inspection:', error);
    return c.json({ error: "Failed to delete inspection" }, 500);
  }
});

// Save inspection signatures
app.post("/api/inspections/:id/signatures", authMiddleware, async (c) => {
  const env = c.env;
  const inspectionId = parseInt(c.req.param("id"));
  const body = await c.req.json();
  
  try {
    await env.DB.prepare(`
      UPDATE inspections 
      SET inspector_signature = ?, responsible_signature = ?, updated_at = datetime('now')
      WHERE id = ?
    `).bind(
      body.inspector || null,
      body.responsible || null,
      inspectionId
    ).run();
    
    return c.json({ message: "Signatures saved successfully" });
    
  } catch (error) {
    console.error('Error saving signatures:', error);
    return c.json({ error: "Failed to save signatures" }, 500);
  }
});

// Get inspection signatures
app.get("/api/inspections/:id/signatures", authMiddleware, async (c) => {
  const env = c.env;
  const inspectionId = parseInt(c.req.param("id"));
  
  try {
    const inspection = await env.DB.prepare(`
      SELECT inspector_signature, responsible_signature 
      FROM inspections 
      WHERE id = ?
    `).bind(inspectionId).first() as any;
    
    if (!inspection) {
      return c.json({ error: "Inspection not found" }, 404);
    }
    
    return c.json({
      inspector: inspection.inspector_signature,
      responsible: inspection.responsible_signature
    });
    
  } catch (error) {
    console.error('Error fetching signatures:', error);
    return c.json({ error: "Failed to fetch signatures" }, 500);
  }
});

// Finalize inspection
app.post("/api/inspections/:id/finalize", authMiddleware, async (c) => {
  const env = c.env;
  const inspectionId = parseInt(c.req.param("id"));
  
  try {
    await env.DB.prepare(`
      UPDATE inspections 
      SET status = 'concluida', completed_date = datetime('now'), updated_at = datetime('now')
      WHERE id = ?
    `).bind(inspectionId).run();
    
    return c.json({ message: "Inspection finalized successfully" });
    
  } catch (error) {
    console.error('Error finalizing inspection:', error);
    return c.json({ error: "Failed to finalize inspection" }, 500);
  }
});

// Save template responses
app.post("/api/inspections/:id/template-responses", authMiddleware, async (c) => {
  const env = c.env;
  const inspectionId = parseInt(c.req.param("id"));
  const body = await c.req.json();
  
  try {
    for (const response of body.responses) {
      // Find existing item for this field
      const existingItem = await env.DB.prepare(`
        SELECT id FROM inspection_items 
        WHERE inspection_id = ? AND template_id IS NOT NULL 
        AND JSON_EXTRACT(field_responses, '$.field_id') = ?
      `).bind(inspectionId, response.field_id).first();
      
      const fieldData = {
        field_id: response.field_id,
        field_type: response.field_type,
        response_value: response.value,
        comment: response.comment,
        is_required: false
      };
      
      if (existingItem) {
        // Update existing item
        await env.DB.prepare(`
          UPDATE inspection_items 
          SET field_responses = ?, updated_at = datetime('now')
          WHERE id = ?
        `).bind(
          JSON.stringify(fieldData),
          (existingItem as any).id
        ).run();
      } else {
        // Create new item
        await env.DB.prepare(`
          INSERT INTO inspection_items 
          (inspection_id, category, item_description, field_responses, template_id, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        `).bind(
          inspectionId,
          'Template Response',
          response.field_name,
          JSON.stringify(fieldData),
          1 // Placeholder template ID
        ).run();
      }
    }
    
    return c.json({ message: "Template responses saved successfully" });
    
  } catch (error) {
    console.error('Error saving template responses:', error);
    return c.json({ error: "Failed to save template responses" }, 500);
  }
});

// Add inspection item
app.post("/api/inspections/:id/items", authMiddleware, async (c) => {
  const env = c.env;
  const inspectionId = parseInt(c.req.param("id"));
  const body = await c.req.json();
  
  try {
    const result = await env.DB.prepare(`
      INSERT INTO inspection_items (
        inspection_id, category, item_description, is_compliant, observations,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).bind(
      inspectionId,
      body.category,
      body.item_description,
      body.is_compliant || null,
      body.observations || null
    ).run();
    
    return c.json({ 
      id: result.meta.last_row_id,
      message: "Item added successfully" 
    });
    
  } catch (error) {
    console.error('Error adding inspection item:', error);
    return c.json({ error: "Failed to add item" }, 500);
  }
});

// Update inspection item
app.put("/api/inspection-items/:id", authMiddleware, async (c) => {
  const env = c.env;
  const itemId = parseInt(c.req.param("id"));
  const body = await c.req.json();
  
  try {
    await env.DB.prepare(`
      UPDATE inspection_items 
      SET category = ?, item_description = ?, is_compliant = ?, observations = ?, updated_at = datetime('now')
      WHERE id = ?
    `).bind(
      body.category,
      body.item_description,
      body.is_compliant,
      body.observations || null,
      itemId
    ).run();
    
    return c.json({ message: "Item updated successfully" });
    
  } catch (error) {
    console.error('Error updating inspection item:', error);
    return c.json({ error: "Failed to update item" }, 500);
  }
});

// Get AI assistants
app.get("/api/ai-assistants", authMiddleware, async (c) => {
  const env = c.env;
  
  try {
    const assistants = await env.DB.prepare(`
      SELECT * FROM ai_assistants WHERE is_active = true ORDER BY name
    `).all();
    
    return c.json({ assistants: assistants.results });
    
  } catch (error) {
    console.error('Error fetching AI assistants:', error);
    return c.json({ error: "Failed to fetch AI assistants" }, 500);
  }
});

// Get action plans
app.get("/api/action-plans/all", authMiddleware, async (c) => {
  const env = c.env;
  const user = c.get("user");
  
  if (!user) {
    return c.json({ error: "User not found" }, 401);
  }
  
  const userProfile = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(user.id).first() as any;
  
  let query = `
    SELECT ai.*, i.title as inspection_title, i.location as inspection_location, 
           i.company_name as inspection_company
    FROM action_items ai
    JOIN inspections i ON ai.inspection_id = i.id
  `;
  let params: any[] = [];
  let whereClause = [];
  
  const organizationId = c.req.query('organization_id');
  if (organizationId) {
    whereClause.push("i.organization_id = ?");
    params.push(parseInt(organizationId));
  } else {
    if (userProfile?.role === USER_ROLES.SYSTEM_ADMIN) {
      // System admin sees all
    } else if (userProfile?.role === USER_ROLES.ORG_ADMIN && userProfile?.managed_organization_id) {
      whereClause.push(`(i.organization_id = ? OR i.organization_id IN (
        SELECT id FROM organizations WHERE parent_organization_id = ?
      ))`);
      params.push(userProfile.managed_organization_id, userProfile.managed_organization_id);
    } else if (userProfile?.organization_id) {
      whereClause.push("i.organization_id = ?");
      params.push(userProfile.organization_id);
    }
  }
  
  if (whereClause.length > 0) {
    query += " WHERE " + whereClause.join(" AND ");
  }
  
  query += " ORDER BY ai.created_at DESC";
  
  const actionItems = await env.DB.prepare(query).bind(...params).all();
  
  return c.json({ action_items: actionItems.results });
});

// Get inspection action plan
app.get("/api/inspections/:id/action-plan", authMiddleware, async (c) => {
  const env = c.env;
  const inspectionId = parseInt(c.req.param("id"));
  
  try {
    const inspection = await env.DB.prepare("SELECT * FROM inspections WHERE id = ?").bind(inspectionId).first();
    const actionItems = await env.DB.prepare("SELECT * FROM action_items WHERE inspection_id = ? ORDER BY created_at").bind(inspectionId).all();
    
    return c.json({
      inspection,
      action_items: actionItems.results
    });
    
  } catch (error) {
    console.error('Error fetching action plan:', error);
    return c.json({ error: "Failed to fetch action plan" }, 500);
  }
});

// Create action item
app.post("/api/inspections/:id/action-items", authMiddleware, async (c) => {
  const env = c.env;
  const inspectionId = parseInt(c.req.param("id"));
  const body = await c.req.json();
  
  try {
    const result = await env.DB.prepare(`
      INSERT INTO action_items (
        inspection_id, inspection_item_id, title, what_description, where_location,
        why_reason, how_method, who_responsible, when_deadline, how_much_cost,
        status, priority, is_ai_generated, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).bind(
      inspectionId,
      body.inspection_item_id || null,
      body.title,
      body.what_description || null,
      body.where_location || null,
      body.why_reason || null,
      body.how_method || null,
      body.who_responsible || null,
      body.when_deadline || null,
      body.how_much_cost || null,
      body.status || 'pending',
      body.priority || 'media',
      body.is_ai_generated || false
    ).run();
    
    return c.json({ 
      id: result.meta.last_row_id,
      message: "Action item created successfully" 
    });
    
  } catch (error) {
    console.error('Error creating action item:', error);
    return c.json({ error: "Failed to create action item" }, 500);
  }
});

// Update action item
app.put("/api/action-items/:id", authMiddleware, async (c) => {
  const env = c.env;
  const actionId = parseInt(c.req.param("id"));
  const body = await c.req.json();
  
  try {
    await env.DB.prepare(`
      UPDATE action_items 
      SET title = ?, what_description = ?, where_location = ?, why_reason = ?,
          how_method = ?, who_responsible = ?, when_deadline = ?, how_much_cost = ?,
          status = ?, priority = ?, updated_at = datetime('now')
      WHERE id = ?
    `).bind(
      body.title,
      body.what_description || null,
      body.where_location || null,
      body.why_reason || null,
      body.how_method || null,
      body.who_responsible || null,
      body.when_deadline || null,
      body.how_much_cost || null,
      body.status || 'pending',
      body.priority || 'media',
      actionId
    ).run();
    
    return c.json({ message: "Action item updated successfully" });
    
  } catch (error) {
    console.error('Error updating action item:', error);
    return c.json({ error: "Failed to update action item" }, 500);
  }
});

// Delete action item
app.delete("/api/action-items/:id", authMiddleware, async (c) => {
  const env = c.env;
  const actionId = parseInt(c.req.param("id"));
  
  try {
    await env.DB.prepare("DELETE FROM action_items WHERE id = ?").bind(actionId).run();
    
    return c.json({ message: "Action item deleted successfully" });
    
  } catch (error) {
    console.error('Error deleting action item:', error);
    return c.json({ error: "Failed to delete action item" }, 500);
  }
});

// Upload media
app.post("/api/inspections/:id/media/upload", authMiddleware, async (c) => {
  const env = c.env;
  const inspectionId = parseInt(c.req.param("id"));
  const body = await c.req.json();
  
  try {
    const result = await env.DB.prepare(`
      INSERT INTO inspection_media (
        inspection_id, inspection_item_id, media_type, file_name, file_url,
        file_size, mime_type, description, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).bind(
      inspectionId,
      body.inspection_item_id || null,
      body.media_type,
      body.file_name,
      body.file_data, // Store base64 data directly for now
      body.file_size || null,
      body.mime_type || null,
      body.description || null
    ).run();
    
    return c.json({ 
      id: result.meta.last_row_id,
      file_url: body.file_data, // Return the same data URL
      message: "Media uploaded successfully" 
    });
    
  } catch (error) {
    console.error('Error uploading media:', error);
    return c.json({ error: "Failed to upload media" }, 500);
  }
});

// Delete media
app.delete("/api/inspection-media/:id", authMiddleware, async (c) => {
  const env = c.env;
  const mediaId = parseInt(c.req.param("id"));
  
  try {
    await env.DB.prepare("DELETE FROM inspection_media WHERE id = ?").bind(mediaId).run();
    
    return c.json({ message: "Media deleted successfully" });
    
  } catch (error) {
    console.error('Error deleting media:', error);
    return c.json({ error: "Failed to delete media" }, 500);
  }
});

// CEP lookup
app.get("/api/cep/:cep", async (c) => {
  const cep = c.req.param("cep").replace(/\D/g, '');
  
  if (cep.length !== 8) {
    return c.json({ error: "CEP inválido" }, 400);
  }
  
  try {
    const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
    const data = await response.json() as any;
    
    if (data.erro) {
      return c.json({ error: "CEP não encontrado" }, 404);
    }
    
    const address = `${data.logradouro}, ${data.bairro}, ${data.localidade} - ${data.uf}`;
    
    return c.json({ address });
    
  } catch (error) {
    console.error('Error fetching CEP:', error);
    return c.json({ error: "Erro ao buscar CEP" }, 500);
  }
});

// CNPJ lookup
app.get("/api/cnpj/:cnpj", async (c) => {
  const cnpj = c.req.param("cnpj").replace(/\D/g, '');
  
  if (cnpj.length !== 14) {
    return c.json({ error: "CNPJ inválido" }, 400);
  }
  
  try {
    // Using a free CNPJ API service
    const response = await fetch(`https://www.receitaws.com.br/v1/cnpj/${cnpj}`);
    const data = await response.json() as any;
    
    if (data.status === 'ERROR') {
      return c.json({ error: data.message || "CNPJ não encontrado" }, 404);
    }
    
    return c.json({
      company: {
        nome: data.nome,
        nome_fantasia: data.fantasia,
        razao_social: data.nome,
        cnae_principal: data.atividade_principal?.[0]?.code,
        cnae_descricao: data.atividade_principal?.[0]?.text,
        natureza_juridica: data.natureza_juridica,
        data_abertura: data.abertura,
        capital_social: data.capital_social,
        porte_empresa: data.porte,
        situacao_cadastral: data.situacao,
        endereco_completo: `${data.logradouro}, ${data.numero} - ${data.bairro}, ${data.municipio} - ${data.uf}`,
        telefone: data.telefone,
        email: data.email
      }
    });
    
  } catch (error) {
    console.error('Error fetching CNPJ:', error);
    return c.json({ error: "Erro ao buscar CNPJ" }, 500);
  }
});

// Role permissions endpoints
app.get("/api/role-permissions", authMiddleware, async (c) => {
  const env = c.env;
  const user = c.get("user");
  
  if (!user) {
    return c.json({ error: "User not found" }, 401);
  }
  
  const userProfile = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(user.id).first() as any;
  
  if (userProfile?.role !== USER_ROLES.SYSTEM_ADMIN) {
    return c.json({ error: "Only system administrators can view role permissions" }, 403);
  }
  
  try {
    const permissions = await env.DB.prepare("SELECT * FROM role_permissions ORDER BY role, permission_type").all();
    
    return c.json({ permissions: permissions.results });
    
  } catch (error) {
    console.error('Error fetching role permissions:', error);
    return c.json({ error: "Failed to fetch role permissions" }, 500);
  }
});

// Update role permissions
app.post("/api/role-permissions", authMiddleware, async (c) => {
  const env = c.env;
  const user = c.get("user");
  
  if (!user) {
    return c.json({ error: "User not found" }, 401);
  }
  
  const userProfile = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(user.id).first() as any;
  
  if (userProfile?.role !== USER_ROLES.SYSTEM_ADMIN) {
    return c.json({ error: "Only system administrators can update role permissions" }, 403);
  }
  
  const body = await c.req.json();
  const { updates } = body;
  
  try {
    for (const update of updates) {
      await env.DB.prepare(`
        INSERT OR REPLACE INTO role_permissions (role, permission_type, is_allowed, updated_at)
        VALUES (?, ?, ?, datetime('now'))
      `).bind(
        update.role,
        update.permission_type,
        update.is_allowed
      ).run();
    }
    
    return c.json({ message: "Role permissions updated successfully" });
    
  } catch (error) {
    console.error('Error updating role permissions:', error);
    return c.json({ error: "Failed to update role permissions" }, 500);
  }
});

// Public endpoints for invitations
app.get("/api/invitations/:token/details", async (c) => {
  const env = c.env;
  const token = c.req.param("token");
  
  try {
    const invitation = await env.DB.prepare(`
      SELECT ui.*, o.name as organization_name, u.name as inviter_name
      FROM user_invitations ui
      LEFT JOIN organizations o ON ui.organization_id = o.id
      LEFT JOIN users u ON ui.invited_by = u.id
      WHERE ui.invitation_token = ? AND ui.accepted_at IS NULL
    `).bind(token).first();
    
    if (!invitation) {
      return c.json({ error: "Invitation not found or already accepted" }, 404);
    }
    
    // Check if expired
    const now = new Date();
    const expiresAt = new Date((invitation as any).expires_at);
    
    if (expiresAt < now) {
      return c.json({ error: "Invitation has expired" }, 410);
    }
    
    return c.json({ invitation });
    
  } catch (error) {
    console.error('Error fetching invitation details:', error);
    return c.json({ error: "Failed to fetch invitation details" }, 500);
  }
});

app.post("/api/invitations/:token/accept", authMiddleware, async (c) => {
  const env = c.env;
  const user = c.get("user");
  const token = c.req.param("token");
  
  if (!user) {
    return c.json({ error: "User must be logged in to accept invitation" }, 401);
  }
  
  try {
    const invitation = await env.DB.prepare(`
      SELECT * FROM user_invitations 
      WHERE invitation_token = ? AND accepted_at IS NULL
    `).bind(token).first() as any;
    
    if (!invitation) {
      return c.json({ error: "Invitation not found or already accepted" }, 404);
    }
    
    // Check if expired
    const now = new Date();
    const expiresAt = new Date(invitation.expires_at);
    
    if (expiresAt < now) {
      return c.json({ error: "Invitation has expired" }, 410);
    }
    
    // Check if email matches
    if (user.email !== invitation.email) {
      return c.json({ error: "Email mismatch. Please login with the invited email." }, 400);
    }
    
    // Update or create user profile
    const existingUser = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(user.id).first() as any;
    
    const canManageUsers = invitation.role === USER_ROLES.ORG_ADMIN;
    const canCreateOrgs = invitation.role === USER_ROLES.ORG_ADMIN;
    const managedOrgId = invitation.role === USER_ROLES.ORG_ADMIN ? invitation.organization_id : null;
    
    if (existingUser) {
      // Update existing user
      await env.DB.prepare(`
        UPDATE users 
        SET role = ?, organization_id = ?, can_manage_users = ?, 
            can_create_organizations = ?, managed_organization_id = ?, 
            updated_at = datetime('now')
        WHERE id = ?
      `).bind(
        invitation.role,
        invitation.organization_id,
        canManageUsers,
        canCreateOrgs,
        managedOrgId,
        user.id
      ).run();
    } else {
      // Create new user profile
      await c.env.DB.prepare(`
        INSERT INTO users (
          id, email, name, role, organization_id, can_manage_users, 
          can_create_organizations, managed_organization_id, is_active, 
          last_login_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), datetime('now'))
      `).bind(
        user.id,
        user.email,
        user.google_user_data.name || user.email,
        invitation.role,
        invitation.organization_id,
        canManageUsers,
        canCreateOrgs,
        managedOrgId,
        true
      ).run();
    }
    
    // Mark invitation as accepted
    await env.DB.prepare(`
      UPDATE user_invitations 
      SET accepted_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ?
    `).bind(invitation.id).run();
    
    // Log activity
    await env.DB.prepare(`
      INSERT INTO activity_log (user_id, organization_id, action_type, action_description, target_type, target_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `).bind(
      user.id,
      invitation.organization_id,
      'invitation_accepted',
      `User accepted invitation: ${user.email}`,
      'user',
      user.id
    ).run();
    
    return c.json({ message: "Invitation accepted successfully" });
    
  } catch (error) {
    console.error('Error accepting invitation:', error);
    return c.json({ error: "Failed to accept invitation" }, 500);
  }
});

// Simple endpoint to test if worker is running
app.get("/api/health", async (c) => {
  return c.json({ status: "ok", timestamp: new Date().toISOString() });
});

export default app;