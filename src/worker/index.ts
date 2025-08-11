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
import usersRoutes from "./users-routes";
import checklistRoutes from "./checklist-routes";
import { USER_ROLES } from "@/shared/user-types";
import {
  AIAnalysisRequestSchema
} from "@/shared/types";

const app = new Hono<{ Bindings: Env }>();

// CORS configuration
app.use("*", cors({
  origin: "*",
  allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization"],
}));

// Mount specific route groups first to avoid conflicts
app.route("/api/users", usersRoutes);
app.route("/api/multi-tenant", multiTenantRoutes);
app.route("/api/checklist", checklistRoutes);

// OAuth Authentication endpoints
app.get('/api/oauth/google/redirect_url', async (c) => {
  try {
    const redirectUrl = await getOAuthRedirectUrl('google', {
      apiUrl: c.env.MOCHA_USERS_SERVICE_API_URL || '',
      apiKey: c.env.MOCHA_USERS_SERVICE_API_KEY || '',
    });

    return c.json({ redirectUrl }, 200);
  } catch (error) {
    console.error('OAuth redirect URL error:', error);
    return c.json({ error: "Failed to get OAuth redirect URL" }, 500);
  }
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
    console.error('Session creation error:', error);
    return c.json({ error: "Failed to create session" }, 500);
  }
});

// User profile endpoint
app.get("/api/users/me", authMiddleware, async (c) => {
  const mochaUser = c.get("user");
  if (!mochaUser) {
    return c.json({ error: "User not found" }, 401);
  }
  
  try {
    console.log('[USER_PROFILE] Usuario logado:', mochaUser.email, 'ID:', mochaUser.id);
    
    // Get or create user profile in our database
    let user = await c.env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(mochaUser.id).first() as any;
    
    console.log('[USER_PROFILE] Usuario encontrado no D1:', !!user);
    
    // ALWAYS ensure eng.tiagosm@gmail.com is SYSTEM_ADMIN
    const isSystemCreator = mochaUser.email === 'eng.tiagosm@gmail.com';
    
    console.log('[USER_PROFILE] Is system creator:', isSystemCreator, 'email:', mochaUser.email);
    
    if (!user) {
      console.log('[USER_PROFILE] Usuario nao existe no D1, criando...');
      
      // Check if user was invited
      const invitation = await c.env.DB.prepare(`
        SELECT * FROM user_invitations 
        WHERE email = ? AND accepted_at IS NULL AND expires_at > datetime('now')
        ORDER BY created_at DESC LIMIT 1
      `).bind(mochaUser.email).first() as any;
      
      console.log('[USER_PROFILE] Convite encontrado:', !!invitation);
      
      if (invitation && !isSystemCreator) {
        // Create user profile based on invitation (only if not system creator)
        const canManageUsers = invitation.role === USER_ROLES.ORG_ADMIN ? 1 : 0;
        const canCreateOrgs = invitation.role === USER_ROLES.ORG_ADMIN ? 1 : 0;
        const managedOrgId = invitation.role === USER_ROLES.ORG_ADMIN ? invitation.organization_id : null;
        
        const insertResult = await c.env.DB.prepare(`
          INSERT INTO users (
            id, email, name, role, organization_id, can_manage_users, 
            can_create_organizations, managed_organization_id, is_active, 
            last_login_at, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), datetime('now'))
        `).bind(
          mochaUser.id,
          mochaUser.email,
          mochaUser.google_user_data?.name || mochaUser.email,
          invitation.role,
          invitation.organization_id,
          canManageUsers,
          canCreateOrgs,
          managedOrgId,
          1
        ).run();
        
        console.log('[USER_PROFILE] Usuario criado via convite, ID:', insertResult.meta.last_row_id);
        
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
        const canManage = (isSystemCreator || isFirstUser) ? 1 : 0;
        
        const insertResult = await c.env.DB.prepare(`
          INSERT INTO users (
            id, email, name, role, can_manage_users, can_create_organizations,
            is_active, last_login_at, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), datetime('now'))
        `).bind(
          mochaUser.id,
          mochaUser.email,
          mochaUser.google_user_data?.name || mochaUser.email,
          role,
          canManage,
          canManage,
          1
        ).run();
        
        console.log('[USER_PROFILE] Usuario criado como novo, ID:', insertResult.meta.last_row_id, 'Role:', role);
      }
      
      user = await c.env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(mochaUser.id).first();
    } else {
      // ALWAYS check if this is the system creator and force promotion if needed
      if (isSystemCreator && user.role !== USER_ROLES.SYSTEM_ADMIN) {
        await c.env.DB.prepare(`
          UPDATE users 
          SET role = ?, can_manage_users = ?, can_create_organizations = ?, updated_at = datetime('now')
          WHERE id = ?
        `).bind(USER_ROLES.SYSTEM_ADMIN, 1, 1, mochaUser.id).run();
        
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
  } catch (error) {
    console.error('Error fetching user profile:', error);
    return c.json({ error: "Failed to fetch user profile" }, 500);
  }
});

// Logout endpoint
app.get('/api/logout', async (c) => {
  try {
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
  } catch (error) {
    console.error('Logout error:', error);
    return c.json({ success: true }, 200); // Always return success for logout
  }
});

// Dashboard stats endpoint
app.get("/api/dashboard/stats", authMiddleware, async (c) => {
  const env = c.env;
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "User not found" }, 401);
  }
  
  try {
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
    
    return c.json(stats || { total: 0, pending: 0, inProgress: 0, completed: 0 });
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    return c.json({ total: 0, pending: 0, inProgress: 0, completed: 0 });
  }
});

// Dashboard action plan summary endpoint
app.get("/api/dashboard/action-plan-summary", authMiddleware, async (c) => {
  const env = c.env;
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "User not found" }, 401);
  }
  
  try {
    // Get user profile to check organization access
    const userProfile = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(user.id).first() as any;
    
    let query = `
      SELECT 
        COUNT(*) as total_actions,
        SUM(CASE WHEN ai.status = 'pending' THEN 1 ELSE 0 END) as pending_actions,
        SUM(CASE WHEN ai.status = 'in_progress' THEN 1 ELSE 0 END) as in_progress_actions,
        SUM(CASE WHEN ai.status = 'completed' THEN 1 ELSE 0 END) as completed_actions,
        SUM(CASE WHEN ai.status = 'pending' AND ai.when_deadline < date('now') THEN 1 ELSE 0 END) as overdue_actions,
        SUM(CASE WHEN ai.status = 'pending' AND ai.priority = 'alta' THEN 1 ELSE 0 END) as high_priority_pending,
        SUM(CASE WHEN ai.is_ai_generated = 1 THEN 1 ELSE 0 END) as ai_generated_count,
        COUNT(CASE WHEN ai.when_deadline BETWEEN date('now') AND date('now', '+7 days') THEN 1 END) as upcoming_deadline
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
      // Apply organization-based filtering based on user role
      if (userProfile?.role === USER_ROLES.SYSTEM_ADMIN) {
        // SYSTEM_ADMIN sees ALL actions - no restrictions
      } else if (userProfile?.role === USER_ROLES.ORG_ADMIN && userProfile?.managed_organization_id) {
        // Org admin sees their organization and subsidiaries
        whereClause.push(`(i.organization_id = ? OR i.organization_id IN (
          SELECT id FROM organizations WHERE parent_organization_id = ?
        ))`);
        params.push(userProfile.managed_organization_id, userProfile.managed_organization_id);
      } else if (userProfile?.organization_id) {
        // Other users see only their organization's actions
        whereClause.push("i.organization_id = ?");
        params.push(userProfile.organization_id);
      }
    }
    
    // For non-admin users, also filter by created_by or collaborators
    if (userProfile?.role !== USER_ROLES.SYSTEM_ADMIN && userProfile?.role !== USER_ROLES.ORG_ADMIN) {
      whereClause.push("(i.created_by = ? OR i.id IN (SELECT inspection_id FROM inspection_collaborators WHERE user_id = ? AND status = 'active'))");
      params.push(user.id, user.id);
    }
    
    if (whereClause.length > 0) {
      query += " WHERE " + whereClause.join(" AND ");
    }
    
    const actionSummary = await env.DB.prepare(query).bind(...params).first();
    
    return c.json(actionSummary || { 
      total_actions: 0, 
      pending_actions: 0, 
      in_progress_actions: 0, 
      completed_actions: 0, 
      overdue_actions: 0, 
      high_priority_pending: 0, 
      ai_generated_count: 0,
      upcoming_deadline: 0 
    });
  } catch (error) {
    console.error('Error fetching action plan summary:', error);
    return c.json({ 
      total_actions: 0, 
      pending_actions: 0, 
      in_progress_actions: 0, 
      completed_actions: 0, 
      overdue_actions: 0, 
      high_priority_pending: 0, 
      ai_generated_count: 0,
      upcoming_deadline: 0 
    });
  }
});

// Organizations hierarchy endpoint
app.get("/api/organizations/hierarchy", authMiddleware, async (c) => {
  const env = c.env;
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "User not found" }, 401);
  }
  
  try {
    const userProfile = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(user.id).first() as any;
    
    if (!userProfile) {
      return c.json({ error: "User profile not found." }, 404);
    }
    
    let query = `
      SELECT o.*, 
             (SELECT COUNT(id) FROM users WHERE organization_id = o.id AND is_active = true) as user_count,
             (SELECT COUNT(id) FROM organizations WHERE parent_organization_id = o.id AND is_active = true) as subsidiary_count,
             po.name as parent_organization_name
      FROM organizations o
      LEFT JOIN organizations po ON o.parent_organization_id = po.id
    `;
    
    let params: any[] = [];
    let whereClause = [];
    
    if (userProfile.role === USER_ROLES.SYSTEM_ADMIN) {
      // System admin sees ALL organizations (active and inactive)
      query += " ORDER BY o.organization_level, o.name ASC";
    } else if (userProfile.role === USER_ROLES.ORG_ADMIN) {
      // Org admin sees their organization and subsidiaries (only active ones)
      whereClause.push(`(o.id = ? OR o.parent_organization_id = ?) AND o.is_active = true`);
      params = [userProfile.managed_organization_id, userProfile.managed_organization_id];
      query += " WHERE " + whereClause.join(" AND ") + " ORDER BY o.organization_level, o.name ASC";
    } else {
      // Other roles see only their organization (only active ones)
      whereClause.push("o.id = ? AND o.is_active = true");
      params = [userProfile.organization_id];
      query += " WHERE " + whereClause.join(" AND ") + " ORDER BY o.organization_level, o.name ASC";
    }
    
    const organizations = await env.DB.prepare(query).bind(...params).all();
    
    return c.json({ 
      organizations: organizations.results || [],
      user_role: userProfile.role,
      can_manage: userProfile.can_manage_users || userProfile.role === USER_ROLES.SYSTEM_ADMIN
    });
    
  } catch (error) {
    console.error('Error fetching organization hierarchy:', error);
    return c.json({ error: "Failed to fetch organization hierarchy." }, 500);
  }
});

// Organizations endpoint - list organizations based on user role
app.get("/api/organizations", authMiddleware, async (c) => {
  const env = c.env;
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "User not found" }, 401);
  }
  
  try {
    // Get user profile to check organization access
    const userProfile = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(user.id).first() as any;
    
    let query = `
      SELECT o.*, 
             (SELECT COUNT(id) FROM users WHERE organization_id = o.id AND is_active = true) as user_count
      FROM organizations o
    `;
    let params: any[] = [];
    let whereClause = [];
    
    if (userProfile?.role === USER_ROLES.SYSTEM_ADMIN) {
      // System admin sees ALL organizations (active and inactive)
      // No is_active filter for system admin
    } else if (userProfile?.role === USER_ROLES.ORG_ADMIN && userProfile?.managed_organization_id) {
      // Org admin sees their organization and subsidiaries (only active ones)
      whereClause.push(`(o.id = ? OR o.parent_organization_id = ?) AND o.is_active = true`);
      params.push(userProfile.managed_organization_id, userProfile.managed_organization_id);
    } else if (userProfile?.organization_id) {
      // Other users see only their organization (only active ones)
      whereClause.push("o.id = ? AND o.is_active = true");
      params.push(userProfile.organization_id);
    } else {
      // User with no organization sees nothing
      whereClause.push("1 = 0");
    }
    
    if (whereClause.length > 0) {
      query += " WHERE " + whereClause.join(" AND ");
    }
    
    query += " ORDER BY o.name ASC";
    
    const organizations = await env.DB.prepare(query).bind(...params).all();
    
    return c.json({ organizations: organizations.results || [] });
  } catch (error) {
    console.error('Error fetching organizations:', error);
    return c.json({ organizations: [] });
  }
});

// Organization stats endpoint
app.get("/api/organizations/:id/stats", authMiddleware, async (c) => {
  const env = c.env;
  const user = c.get("user");
  const organizationId = parseInt(c.req.param("id"));
  
  if (!user) {
    return c.json({ error: "User not found" }, 401);
  }
  
  try {
    const userProfile = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(user.id).first() as any;
    
    // Check if user can access this organization's stats
    let canAccess = false;
    
    if (userProfile?.role === USER_ROLES.SYSTEM_ADMIN) {
      canAccess = true;
    } else if (userProfile?.role === USER_ROLES.ORG_ADMIN && userProfile?.managed_organization_id) {
      // Check if this org is their managed org or a subsidiary
      const org = await env.DB.prepare(`
        SELECT id FROM organizations 
        WHERE (id = ? OR parent_organization_id = ?) AND id = ?
      `).bind(userProfile.managed_organization_id, userProfile.managed_organization_id, organizationId).first();
      canAccess = !!org;
    } else if (userProfile?.organization_id === organizationId) {
      canAccess = true;
    }
    
    if (!canAccess) {
      return c.json({ error: "Insufficient permissions to access organization stats" }, 403);
    }
    
    // Get organization stats
    const [usersCount, inspectionsCount, pendingInspections, completedInspections, activeActions, overdueActions] = await Promise.all([
      env.DB.prepare("SELECT COUNT(*) as count FROM users WHERE organization_id = ? AND is_active = true").bind(organizationId).first(),
      env.DB.prepare("SELECT COUNT(*) as count FROM inspections WHERE organization_id = ?").bind(organizationId).first(),
      env.DB.prepare("SELECT COUNT(*) as count FROM inspections WHERE organization_id = ? AND status = 'pendente'").bind(organizationId).first(),
      env.DB.prepare("SELECT COUNT(*) as count FROM inspections WHERE organization_id = ? AND status = 'concluida'").bind(organizationId).first(),
      env.DB.prepare(`
        SELECT COUNT(*) as count FROM action_items ai
        JOIN inspections i ON ai.inspection_id = i.id
        WHERE i.organization_id = ? AND ai.status != 'completed'
      `).bind(organizationId).first(),
      env.DB.prepare(`
        SELECT COUNT(*) as count FROM action_items ai
        JOIN inspections i ON ai.inspection_id = i.id
        WHERE i.organization_id = ? AND ai.status = 'pending' AND ai.when_deadline < date('now')
      `).bind(organizationId).first()
    ]);
    
    // Get recent inspections
    const recentInspections = await env.DB.prepare(`
      SELECT i.id, i.title, i.status, i.created_at, i.inspector_name
      FROM inspections i
      WHERE i.organization_id = ?
      ORDER BY i.created_at DESC
      LIMIT 5
    `).bind(organizationId).all();
    
    return c.json({
      users_count: (usersCount as any)?.count || 0,
      inspections_count: (inspectionsCount as any)?.count || 0,
      pending_inspections: (pendingInspections as any)?.count || 0,
      completed_inspections: (completedInspections as any)?.count || 0,
      active_actions: (activeActions as any)?.count || 0,
      overdue_actions: (overdueActions as any)?.count || 0,
      recent_inspections: recentInspections.results || []
    });
  } catch (error) {
    console.error('Error fetching organization stats:', error);
    return c.json({ error: "Failed to fetch organization stats" }, 500);
  }
});

// INSPECTIONS ENDPOINTS - IMPLEMENTAÇÃO COMPLETA

// Get all inspections (protected)
app.get("/api/inspections", authMiddleware, async (c) => {
  const env = c.env;
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "User not found" }, 401);
  }
  
  try {
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
      // Apply organization-based filtering based on user role
      if (userProfile?.role === USER_ROLES.SYSTEM_ADMIN) {
        // SYSTEM_ADMIN sees ALL inspections - no restrictions
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
    
    query += " ORDER BY created_at DESC";
    
    const inspections = await env.DB.prepare(query).bind(...params).all();
    return c.json({ inspections: inspections.results || [] });
  } catch (error) {
    console.error('Error fetching inspections:', error);
    return c.json({ inspections: [] });
  }
});

// Get inspection by ID with items and media
app.get("/api/inspections/:id", async (c) => {
  const env = c.env;
  const id = parseInt(c.req.param("id"));
  
  try {
    const inspection = await env.DB.prepare("SELECT * FROM inspections WHERE id = ?").bind(id).first();
    
    if (!inspection) {
      return c.json({ error: "Inspection not found" }, 404);
    }
    
    const items = await env.DB.prepare("SELECT * FROM inspection_items WHERE inspection_id = ?").bind(id).all();
    const media = await env.DB.prepare("SELECT * FROM inspection_media WHERE inspection_id = ?").bind(id).all();
    
    return c.json({
      inspection,
      items: items.results || [],
      media: media.results || []
    });
  } catch (error) {
    console.error('Error fetching inspection:', error);
    return c.json({ error: "Failed to fetch inspection" }, 500);
  }
});

// Create new inspection (protected)
app.post("/api/inspections", authMiddleware, async (c) => {
  const env = c.env;
  
  try {
    const rawData = await c.req.json();
    console.log('Creating inspection with data:', rawData);
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
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).bind(
      inspectionData.title,
      inspectionData.description || null,
      inspectionData.location,
      inspectionData.company_name || '',
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
      inspectionData.organization_id || userProfile?.organization_id || null
    ).run();
    
    const inspectionId = insertResult.meta.last_row_id as number;
    
    // If template_id is provided, create template-based items
    if (template_id && template_id !== '') {
      try {
        const templateFields = await env.DB.prepare(`
          SELECT * FROM checklist_fields WHERE template_id = ? ORDER BY order_index ASC
        `).bind(parseInt(template_id)).all();
        
        console.log(`Found ${templateFields.results?.length || 0} fields for template ${template_id}`);
        
        for (const field of (templateFields.results as any[]) || []) {
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
            INSERT INTO inspection_items (inspection_id, template_id, field_responses, category, item_description, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
          `).bind(
            inspectionId, 
            parseInt(template_id), 
            JSON.stringify(fieldData), 
            field.field_name || 'Checklist Item', 
            field.field_name || 'Campo do template'
          ).run();
        }
      } catch (templateError) {
        console.error('Error creating template items:', templateError);
        // Continue without template items - don't fail the inspection creation
      }
    }
    
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
app.put("/api/inspections/:id", authMiddleware, async (c) => {
  const env = c.env;
  const id = parseInt(c.req.param("id"));
  
  try {
    const data = await c.req.json();
    console.log('Updating inspection with data:', data);
    
    // Lista de campos válidos da tabela inspections
    const validColumns = [
      'title', 'description', 'location', 'company_name', 'cep', 'address', 
      'latitude', 'longitude', 'inspector_name', 'inspector_email', 'status', 
      'priority', 'scheduled_date', 'completed_date', 'action_plan', 
      'action_plan_type', 'inspector_signature', 'responsible_signature', 
      'organization_id'
    ];
    
    // Filtrar apenas campos válidos e remover valores undefined/null
    const validData = Object.fromEntries(
      Object.entries(data).filter(([key, value]) => 
        validColumns.includes(key) && value !== undefined && value !== null
      )
    );
    
    if (Object.keys(validData).length === 0) {
      return c.json({ error: "No valid data to update" }, 400);
    }
    
    const updateFields = Object.keys(validData).map(key => `${key} = ?`).join(", ");
    const updateValues = Object.values(validData);
    
    await env.DB.prepare(`
      UPDATE inspections 
      SET ${updateFields}, updated_at = datetime('now')
      WHERE id = ?
    `).bind(...updateValues, id).run();
    
    return c.json({ message: "Inspection updated successfully" });
  } catch (error) {
    console.error('Error updating inspection:', error);
    return c.json({ 
      error: "Failed to update inspection", 
      details: error instanceof Error ? error.message : String(error) 
    }, 500);
  }
});

// Delete inspection
app.delete("/api/inspections/:id", async (c) => {
  const env = c.env;
  const id = parseInt(c.req.param("id"));
  
  try {
    await env.DB.prepare("DELETE FROM inspection_media WHERE inspection_id = ?").bind(id).run();
    await env.DB.prepare("DELETE FROM inspection_items WHERE inspection_id = ?").bind(id).run();
    await env.DB.prepare("DELETE FROM inspections WHERE id = ?").bind(id).run();
    
    return c.json({ message: "Inspection deleted successfully" });
  } catch (error) {
    console.error('Error deleting inspection:', error);
    return c.json({ error: "Failed to delete inspection" }, 500);
  }
});

// Add item to inspection
app.post("/api/inspections/:id/items", authMiddleware, async (c) => {
  const env = c.env;
  const inspectionId = parseInt(c.req.param("id"));
  
  try {
    const data = await c.req.json();
    
    await env.DB.prepare(`
      INSERT INTO inspection_items (
        inspection_id, category, item_description, is_compliant, observations, photo_url,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).bind(
      inspectionId,
      data.category,
      data.item_description,
      data.is_compliant || null,
      data.observations || null,
      data.photo_url || null
    ).run();
    
    return c.json({ message: "Item added successfully" });
  } catch (error) {
    console.error('Error adding item:', error);
    return c.json({ error: "Failed to add item" }, 500);
  }
});

// Update inspection item
app.put("/api/inspection-items/:id", async (c) => {
  const env = c.env;
  const id = parseInt(c.req.param("id"));
  
  try {
    const data = await c.req.json();
    
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
  } catch (error) {
    console.error('Error updating item:', error);
    return c.json({ error: "Failed to update item" }, 500);
  }
});

// Save template responses for inspection
app.post("/api/inspections/:id/template-responses", async (c) => {
  const env = c.env;
  const inspectionId = parseInt(c.req.param("id"));
  
  try {
    const requestBody = await c.req.json();
    const responses = requestBody.responses;
    
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
    console.error('Error saving template responses:', error);
    return c.json({ 
      success: false, 
      error: "Failed to save template responses" 
    }, 500);
  }
});

// Finalize inspection
app.post("/api/inspections/:id/finalize", async (c) => {
  const env = c.env;
  const id = parseInt(c.req.param("id"));
  
  try {
    await env.DB.prepare(`
      UPDATE inspections 
      SET status = 'concluida', completed_date = datetime('now'), updated_at = datetime('now')
      WHERE id = ?
    `).bind(id).run();
    
    return c.json({ message: "Inspection finalized successfully" });
  } catch (error) {
    console.error('Error finalizing inspection:', error);
    return c.json({ error: "Failed to finalize inspection" }, 500);
  }
});

// Create share link for inspection
app.post("/api/inspections/:id/share", authMiddleware, async (c) => {
  const inspectionId = parseInt(c.req.param('id'));
  const user = c.get('user');
  
  if (!user) {
    return c.json({ error: 'Usuário não encontrado' }, 401);
  }

  const body = await c.req.json();
  const { permission = 'view', expires_in_days = 30 } = body;

  // Generate unique share token
  const shareToken = Math.random().toString(36).substring(2, 15) + 
                    Math.random().toString(36).substring(2, 15);

  // Calculate expiration date
  const expirationDate = new Date();
  expirationDate.setDate(expirationDate.getDate() + expires_in_days);

  try {
    const result = await c.env.DB.prepare(`
      INSERT INTO inspection_shares (
        inspection_id, share_token, created_by, permission, expires_at, 
        is_active, access_count, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).bind(
      inspectionId,
      shareToken,
      user.id,
      permission,
      expirationDate.toISOString(),
      true,
      0
    ).run();

    // Generate share URL and QR Code
    const shareUrl = `${new URL(c.req.url).origin}/shared/${shareToken}`;
    
    // Generate simple QR code as SVG
    const qrCodeSVG = `
      <svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="#ffffff"/>
        <rect x="10" y="10" width="180" height="180" fill="none" stroke="#000000" stroke-width="2"/>
        <text x="100" y="90" text-anchor="middle" font-family="Arial" font-size="12" fill="#000000">QR Code</text>
        <text x="100" y="110" text-anchor="middle" font-family="Arial" font-size="8" fill="#666666">${shareToken.substring(0, 8)}...</text>
      </svg>
    `;
    const qrCodeBase64 = `data:image/svg+xml;base64,${btoa(qrCodeSVG)}`;

    return c.json({
      id: result.meta.last_row_id,
      share_token: shareToken,
      share_url: shareUrl,
      qr_code: qrCodeBase64,
      message: 'Link de compartilhamento criado com sucesso'
    });
  } catch (error) {
    console.error('Error creating share link:', error);
    return c.json({ error: 'Erro ao criar link de compartilhamento' }, 500);
  }
});

// Get share links for inspection
app.get("/api/inspections/:id/shares", authMiddleware, async (c) => {
  const inspectionId = parseInt(c.req.param('id'));

  try {
    const shares = await c.env.DB.prepare(`
      SELECT * FROM inspection_shares 
      WHERE inspection_id = ? 
      ORDER BY created_at DESC
    `).bind(inspectionId).all();

    return c.json({ shares: shares.results || [] });
  } catch (error) {
    console.error('Error fetching shares:', error);
    return c.json({ shares: [] });
  }
});

// Delete share link
app.delete("/api/inspection-shares/:id", authMiddleware, async (c) => {
  const shareId = parseInt(c.req.param('id'));

  try {
    await c.env.DB.prepare(`
      DELETE FROM inspection_shares WHERE id = ?
    `).bind(shareId).run();

    return c.json({ message: 'Link de compartilhamento excluído com sucesso' });
  } catch (error) {
    console.error('Error deleting share:', error);
    return c.json({ error: 'Erro ao excluir compartilhamento' }, 500);
  }
});

// Get shared inspection (public endpoint)
app.get("/shared/:token", async (c) => {
  const token = c.req.param('token');
  
  try {
    // Get share record
    const shareResult = await c.env.DB.prepare(`
      SELECT * FROM inspection_shares 
      WHERE share_token = ? AND is_active = true
    `).bind(token).first();
    
    if (!shareResult) {
      return c.json({ error: 'Link não encontrado' }, 404);
    }
    
    // Check if expired
    const now = new Date();
    const expiresAt = new Date(shareResult.expires_at as string);
    
    if (expiresAt < now) {
      return c.json({ 
        error: 'Link expirado',
        expired: true 
      }, 410);
    }
    
    // Get inspection details
    const inspection = await c.env.DB.prepare(`
      SELECT i.*, u.name as inspector_name, u.email as inspector_email
      FROM inspections i
      LEFT JOIN users u ON i.created_by = u.id
      WHERE i.id = ?
    `).bind(shareResult.inspection_id).first();
    
    if (!inspection) {
      return c.json({ error: 'Inspeção não encontrada' }, 404);
    }
    
    // Get inspection items
    const items = await c.env.DB.prepare(`
      SELECT * FROM inspection_items 
      WHERE inspection_id = ?
      ORDER BY id
    `).bind(shareResult.inspection_id).all();
    
    // Get inspection media
    const media = await c.env.DB.prepare(`
      SELECT * FROM inspection_media 
      WHERE inspection_id = ?
      ORDER BY id
    `).bind(shareResult.inspection_id).all();
    
    // Update access count
    await c.env.DB.prepare(`
      UPDATE inspection_shares 
      SET access_count = access_count + 1, updated_at = datetime('now')
      WHERE share_token = ?
    `).bind(token).run();
    
    return c.json({
      success: true,
      share: shareResult,
      inspection,
      items: items.results || [],
      media: media.results || []
    });
    
  } catch (error) {
    console.error('Error getting shared inspection:', error);
    return c.json({ error: 'Erro ao carregar inspeção' }, 500);
  }
});

// Get signatures for inspection
app.get("/api/inspections/:id/signatures", async (c) => {
  const env = c.env;
  const id = parseInt(c.req.param("id"));
  
  try {
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
  } catch (error) {
    console.error('Error fetching signatures:', error);
    return c.json({ error: "Failed to fetch signatures" }, 500);
  }
});

// Save signatures for inspection
app.post("/api/inspections/:id/signatures", async (c) => {
  const env = c.env;
  const id = parseInt(c.req.param("id"));
  
  try {
    const body = await c.req.json();
    const { inspector, responsible } = body;
    
    await env.DB.prepare(`
      UPDATE inspections 
      SET inspector_signature = ?, responsible_signature = ?, updated_at = datetime('now')
      WHERE id = ?
    `).bind(inspector || null, responsible || null, id).run();
    
    return c.json({ message: "Signatures saved successfully" });
  } catch (error) {
    console.error('Error saving signatures:', error);
    return c.json({ error: "Failed to save signatures" }, 500);
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
    const OpenAI = (await import('openai')).default;
    const openai = new OpenAI({
      apiKey: env.OPENAI_API_KEY,
    });
    
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
    
    return c.json({ 
      action_plan: actionPlan,
      message: "AI analysis completed successfully" 
    });
    
  } catch (error) {
    console.error('Error generating AI analysis:', error);
    return c.json({ error: "Failed to generate AI analysis" }, 500);
  }
});

// Upload media for inspection
app.post("/api/inspections/:id/media", async (c) => {
  const env = c.env;
  const inspectionId = parseInt(c.req.param("id"));
  
  try {
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
  } catch (error) {
    console.error('Error uploading media:', error);
    return c.json({ error: "Failed to upload media" }, 500);
  }
});

// Upload media with file data for inspection
app.post("/api/inspections/:id/media/upload", async (c) => {
  const env = c.env;
  const inspectionId = parseInt(c.req.param("id"));
  
  try {
    const body = await c.req.json();
    const { file_name, file_data, file_size, mime_type, media_type, inspection_item_id } = body;
    
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
    console.error('Error uploading media with data:', error);
    return c.json({ error: "Failed to upload media" }, 500);
  }
});

// Delete inspection media
app.delete("/api/inspection-media/:id", async (c) => {
  const env = c.env;
  const id = parseInt(c.req.param("id"));
  
  try {
    await env.DB.prepare("DELETE FROM inspection_media WHERE id = ?").bind(id).run();
    return c.json({ message: "Media deleted successfully" });
  } catch (error) {
    console.error('Error deleting media:', error);
    return c.json({ error: "Failed to delete media" }, 500);
  }
});

// Pre-analysis for inspection item - OPTIMIZED FOR RELIABILITY
app.post("/api/inspection-items/:id/pre-analysis", async (c) => {
  const env = c.env;
  const itemId = parseInt(c.req.param("id"));
  
  console.log(`[PRE-ANALYSIS] Iniciando pré-análise para item ${itemId}`);
  console.log(`[PRE-ANALYSIS] OpenAI Key configurada: ${!!env.OPENAI_API_KEY}`);
  
  if (!env.OPENAI_API_KEY) {
    console.error('[PRE-ANALYSIS] OpenAI API key não configurada');
    return c.json({ error: "Chave da API OpenAI não configurada" }, 500);
  }
  
  let body: any = {};
  
  try {
    console.log(`[PRE-ANALYSIS] Parsing request body para item ${itemId}`);
    body = await c.req.json();
    const { field_name, field_type, response_value, media_data, user_prompt } = body;
    
    console.log('[PRE-ANALYSIS] Dados recebidos:', {
      itemId,
      field_name: field_name?.substring(0, 50) + '...',
      field_type,
      response_value: typeof response_value,
      media_count: media_data?.length || 0,
      has_user_prompt: !!user_prompt
    });
    
    // Get inspection context
    console.log(`[PRE-ANALYSIS] Buscando dados do item ${itemId}...`);
    const inspectionItem = await env.DB.prepare(`
      SELECT ii.*, i.title, i.location, i.company_name, i.inspector_name, i.description as inspection_description,
             i.ai_assistant_id
      FROM inspection_items ii
      JOIN inspections i ON ii.inspection_id = i.id
      WHERE ii.id = ?
    `).bind(itemId).first() as any;
    
    if (!inspectionItem) {
      console.error(`[PRE-ANALYSIS] Item de inspeção não encontrado: ${itemId}`);
      return c.json({ error: "Item de inspeção não encontrado" }, 404);
    }
    
    console.log('[PRE-ANALYSIS] Item encontrado:', inspectionItem.id, 'da inspeção:', inspectionItem.inspection_id);
    
    console.log('[PRE-ANALYSIS] Inicializando cliente OpenAI...');
    const OpenAI = (await import('openai')).default;
    const openai = new OpenAI({
      apiKey: env.OPENAI_API_KEY,
      timeout: 15000, // 15 segundos timeout
      maxRetries: 1, // Apenas 1 tentativa
    });
    console.log('[PRE-ANALYSIS] Cliente OpenAI inicializado');

    // Get AI assistant for this inspection if available
    let assistantInstructions = '';
    if (inspectionItem.ai_assistant_id) {
      try {
        const assistant = await env.DB.prepare(`
          SELECT name, instructions FROM ai_assistants WHERE id = ? AND is_active = true
        `).bind(inspectionItem.ai_assistant_id).first() as any;
        
        if (assistant) {
          assistantInstructions = `\n\nVOCÊ É UM ${assistant.name.toUpperCase()}:\n${assistant.instructions}\n\n`;
        }
      } catch (assistantError) {
        console.warn('[PRE-ANALYSIS] Falha ao carregar AI assistant:', assistantError);
      }
    }
    
    // Build multimodal message content with structured analysis
    const messageContent: any[] = [];
    
    // Add structured prompt for descriptive analysis
    let textPrompt = `Especialista em segurança analisando evidências multimodais.${assistantInstructions}

CONTEXTO:
- Empresa: ${inspectionItem.company_name || 'Não informado'}  
- Local: ${inspectionItem.location || 'Não informado'}
- Campo: ${field_name}
- Resposta: ${response_value || 'Não respondido'}

ESTRUTURA DE ANÁLISE (MÁXIMO 15 LINHAS):
1. DESCRIÇÃO: O que você observa nas evidências (fotos/áudios/vídeos)
2. IDENTIFICAÇÃO: Aspectos de segurança relevantes
3. ANÁLISE: Como isso se relaciona com "${field_name}"
4. CONCLUSÃO: Riscos e recomendações específicas

EVIDÊNCIAS DISPONÍVEIS:`;

    // Add user prompt if provided
    if (user_prompt && user_prompt.trim() !== '') {
      textPrompt += `\n- Solicitação: "${user_prompt}"`;
    }

    // Enhanced media analysis with descriptive focus
    let hasValidMedia = false;
    if (media_data && Array.isArray(media_data) && media_data.length > 0) {
      const imageCount = media_data.filter((m: any) => m && m.media_type === 'image').length;
      const audioCount = media_data.filter((m: any) => m && m.media_type === 'audio').length;
      const videoCount = media_data.filter((m: any) => m && m.media_type === 'video').length;
      
      if (imageCount + audioCount + videoCount > 0) {
        hasValidMedia = true;
        textPrompt += ` ${imageCount} foto(s), ${audioCount} áudio(s), ${videoCount} vídeo(s)`;
        console.log(`[PRE-ANALYSIS] ${imageCount} imagem(s), ${audioCount} áudio(s), ${videoCount} vídeo(s) para análise`);
      }
    }

    textPrompt += `\n\nANÁLISE ESTRUTURADA (15 LINHAS MÁXIMO):
LINHA 1-2: DESCRIÇÃO - O que você vê/ouve nas evidências
LINHA 3-4: IDENTIFICAÇÃO - Condições de segurança observadas  
LINHA 5-6: ANÁLISE - Conformidades e não-conformidades
LINHA 7-8: RISCOS - Perigos identificados
LINHA 9-10: IMPACTO - Consequências potenciais
LINHA 11-12: RECOMENDAÇÕES - Ações específicas necessárias
LINHA 13-14: PRIORIDADE - Urgência (baixa/média/alta/crítica)
LINHA 15: CONCLUSÃO - Resumo final

SEJA DESCRITIVO NAS EVIDÊNCIAS PRIMEIRO, DEPOIS ANALISE.`;

    messageContent.push({
      type: "text",
      text: textPrompt
    });

    // Add images with AGGRESSIVE OPTIMIZATION
    let imageProcessed = 0;
    const MAX_IMAGES = 1; // MÁXIMO DE 1 IMAGEM PARA EVITAR TIMEOUT
    const MAX_IMAGE_SIZE_MB = 2; // Limite agressivo
    
    if (hasValidMedia && media_data && Array.isArray(media_data)) {
      for (const media of media_data) {
        if (media && media.media_type === 'image' && media.file_url) {
          try {
            if (media.file_url.startsWith('data:image/')) {
              // Validate image size
              const sizeInBytes = (media.file_url.length * 3) / 4;
              const sizeInMB = sizeInBytes / (1024 * 1024);
              
              if (sizeInMB > MAX_IMAGE_SIZE_MB) {
                console.warn(`[PRE-ANALYSIS] Imagem muito grande (${sizeInMB.toFixed(2)}MB), pulando`);
                continue;
              }
              
              if (imageProcessed >= MAX_IMAGES) {
                console.warn(`[PRE-ANALYSIS] Limite de ${MAX_IMAGES} imagem(s) atingido, pulando demais`);
                break;
              }
              
              messageContent.push({
                type: "image_url",
                image_url: {
                  url: media.file_url,
                  detail: "high" // High detail para análise descritiva precisa
                }
              });
              imageProcessed++;
              console.log(`[PRE-ANALYSIS] Imagem ${imageProcessed} processada: ${media.file_name} (${sizeInMB.toFixed(2)}MB)`);
            }
          } catch (error) {
            console.error('[PRE-ANALYSIS] Erro processando imagem:', media.file_name, error);
          }
        }
      }
      console.log(`[PRE-ANALYSIS] Total de ${imageProcessed} imagem(s) processada(s)`);
    }
    
    console.log('[PRE-ANALYSIS] Preparando requisição OpenAI...');
    console.log('[PRE-ANALYSIS] Partes de conteúdo:', messageContent.length);
    
    // Validar se temos conteúdo válido
    if (!messageContent || messageContent.length === 0) {
      console.error('[PRE-ANALYSIS] Nenhum conteúdo para enviar à OpenAI');
      throw new Error("Nenhum conteúdo válido para análise");
    }
    
    // AGGRESSIVE TIMEOUT CONTROL
    let completion;
    try {
      console.log('[PRE-ANALYSIS] Fazendo chamada para OpenAI...');
      completion = await Promise.race([
        openai.chat.completions.create({
          model: "gpt-4o-mini", // Modelo mais rápido
          messages: [{ role: "user", content: messageContent }],
          temperature: 0.2,
          max_tokens: 300, // Reduzido para velocidade
        }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout da requisição OpenAI após 12 segundos')), 12000)
        )
      ]) as any;
      console.log('[PRE-ANALYSIS] Chamada OpenAI concluída');
    } catch (openaiError: any) {
      console.error('[PRE-ANALYSIS] Falha na chamada OpenAI:', openaiError);
      
      if (openaiError.message?.includes('timeout') || openaiError.code === 'ETIMEDOUT') {
        throw new Error('Timeout na API OpenAI - tente com menos imagens ou aguarde');
      } else if (openaiError.status === 401) {
        throw new Error('Chave da API OpenAI inválida ou expirada');
      } else if (openaiError.status === 429) {
        throw new Error('Limite de taxa da OpenAI excedido - aguarde alguns minutos');
      } else if (openaiError.status === 400) {
        throw new Error('Requisição inválida para OpenAI - conteúdo muito grande');
      } else {
        throw new Error(`Erro da API OpenAI: ${openaiError.message || 'Erro desconhecido'}`);
      }
    }
    
    console.log('[PRE-ANALYSIS] Processando resposta da OpenAI...');
    
    const analysis = completion.choices?.[0]?.message?.content;
    
    if (!analysis || analysis.trim() === '') {
      console.error('[PRE-ANALYSIS] Resposta vazia da OpenAI');
      throw new Error("Resposta vazia da API OpenAI - tente novamente");
    }
    
    console.log('[PRE-ANALYSIS] Resposta recebida, limpando formatação...');
    
    // Remove markdown formatting from the analysis
    const cleanAnalysis = analysis
      .replace(/\*\*([^*]+)\*\*/g, '$1') // Remove bold
      .replace(/\*([^*]+)\*/g, '$1') // Remove italic
      .replace(/#{1,6}\s/g, '') // Remove headers
      .replace(/^\s*[\-\*\+]\s/gm, '• ') // Convert bullet points
      .replace(/^\s*\d+\.\s/gm, '') // Remove numbered lists
      .replace(/`([^`]+)`/g, '$1') // Remove code formatting
      .trim();
    
    console.log('[PRE-ANALYSIS] Salvando pré-análise no banco...');
    // Save pre-analysis to item
    await env.DB.prepare(`
      UPDATE inspection_items 
      SET ai_pre_analysis = ?, updated_at = datetime('now')
      WHERE id = ?
    `).bind(cleanAnalysis, itemId).run();
    
    console.log(`[PRE-ANALYSIS] Pré-análise concluída com sucesso para item ${itemId}`);
    
    return c.json({ 
      pre_analysis: cleanAnalysis,
      message: "Pré-análise concluída com sucesso" 
    });
    
  } catch (error) {
    console.error('[PRE-ANALYSIS] Erro na pré-análise:', error);
    
    // Log contexto completo
    if (error instanceof Error) {
      console.error('[PRE-ANALYSIS] Detalhes do erro:', {
        message: error.message,
        name: error.name,
        stack: error.stack?.substring(0, 500),
        cause: (error as any).cause || 'N/A'
      });
    }
    
    // Log contexto da requisição
    console.error('[PRE-ANALYSIS] Contexto do erro:', {
      itemId,
      fieldName: body?.field_name?.substring(0, 50) || 'desconhecido',
      fieldType: body?.field_type || 'desconhecido',
      hasMediaData: !!(body?.media_data && Array.isArray(body.media_data)),
      mediaCount: body?.media_data?.length || 0,
      timestamp: new Date().toISOString()
    });
    
    // Análise específica do tipo de erro
    let errorMessage = "Falha ao gerar pré-análise";
    let errorDetails = "Erro interno do servidor";
    let httpStatus = 500;
    
    if (error instanceof Error) {
      const errorMsg = error.message.toLowerCase();
      errorDetails = error.message;
      
      if (errorMsg.includes('timeout') || errorMsg.includes('etimedout') || errorMsg.includes('econnreset')) {
        errorMessage = "Timeout na requisição - tente reduzir o número de imagens";
        httpStatus = 408;
      } else if (errorMsg.includes('openai') || errorMsg.includes('api')) {
        if (errorMsg.includes('401') || errorMsg.includes('unauthorized')) {
          errorMessage = "Chave da API OpenAI inválida";
          httpStatus = 401;
        } else if (errorMsg.includes('429') || errorMsg.includes('rate limit')) {
          errorMessage = "Limite da API OpenAI excedido - aguarde e tente novamente";
          httpStatus = 429;
        } else if (errorMsg.includes('quota') || errorMsg.includes('insufficient')) {
          errorMessage = "Cota da API OpenAI esgotada";
          httpStatus = 402;
        } else {
          errorMessage = "Erro na API da OpenAI";
          httpStatus = 502;
        }
      } else if (errorMsg.includes('not found')) {
        errorMessage = "Recurso não encontrado";
        httpStatus = 404;
      }
    }
    
    return c.json({ 
      success: false,
      error: errorMessage, 
      details: errorDetails,
      field_name: body?.field_name || 'desconhecido',
      field_type: body?.field_type || 'desconhecido',
      error_code: `PRE_ANALYSIS_${httpStatus}`,
      timestamp: new Date().toISOString()
    }, httpStatus as any);
  }
});

// Create action for inspection item - IMPROVED WITH MULTIMODAL AI
app.post("/api/inspection-items/:id/create-action", async (c) => {
  const env = c.env;
  const itemId = parseInt(c.req.param("id"));
  
  if (!env.OPENAI_API_KEY) {
    return c.json({ error: "OpenAI API key not configured" }, 500);
  }
  
  try {
    const body = await c.req.json();
    const { field_name, field_type, response_value, pre_analysis, media_data, user_prompt } = body;
    
    // Get comprehensive inspection context
    const inspectionItem = await env.DB.prepare(`
      SELECT ii.*, i.title, i.location, i.company_name, i.inspector_name, i.description as inspection_description,
             i.id as inspection_id, i.organization_id, i.ai_assistant_id
      FROM inspection_items ii
      JOIN inspections i ON ii.inspection_id = i.id
      WHERE ii.id = ?
    `).bind(itemId).first() as any;
    
    if (!inspectionItem) {
      return c.json({ error: "Inspection item not found" }, 404);
    }
    
    const inspectionId = inspectionItem.inspection_id;
    
    const OpenAI = (await import('openai')).default;
    const openai = new OpenAI({
      apiKey: env.OPENAI_API_KEY,
    });
    
    // Get AI assistant for this inspection if available
    let assistantInstructions = '';
    if (inspectionItem.ai_assistant_id) {
      const assistant = await env.DB.prepare(`
        SELECT name, instructions FROM ai_assistants WHERE id = ? AND is_active = true
      `).bind(inspectionItem.ai_assistant_id).first() as any;
      
      if (assistant) {
        assistantInstructions = `\n\nVOCÊ É UM ${assistant.name.toUpperCase()}:\n${assistant.instructions}\n\n`;
      }
    }
    
    // Build multimodal message content for action generation
    const messageContent: any[] = [];
    
    // Add text prompt for action planning
    let textPrompt = `Você é um especialista sênior em segurança do trabalho e gestão de riscos, com experiência em planejamento de ações corretivas e preventivas.${assistantInstructions}

ANÁLISE MULTIMODAL PARA AÇÃO CORRETIVA:
Determine se é necessária ação corretiva analisando TODAS as evidências fornecidas (texto, imagens, áudios, vídeos) de forma integrada.

CONTEXTO COMPLETO DA INSPEÇÃO:
- Empresa: ${inspectionItem.company_name || 'Não informado'}
- Local: ${inspectionItem.location || 'Não informado'}
- Inspetor: ${inspectionItem.inspector_name || 'Não informado'}
- Título da Inspeção: ${inspectionItem.title || 'Não informado'}
- Descrição geral: ${inspectionItem.inspection_description || 'Não informado'}

ITEM SENDO AVALIADO:
- Campo/Questão: ${field_name}
- Tipo de campo: ${field_type}
- Resposta fornecida: ${response_value || 'Não respondido'}`;

    // Include pre-analysis if available
    if (pre_analysis) {
      textPrompt += `\n- Pré-análise realizada: ${pre_analysis}`;
    }

    // Add user prompt if provided
    if (user_prompt && user_prompt.trim() !== '') {
      textPrompt += `\n- Solicitação específica do usuário: "${user_prompt}"`;
    }

    // Enhanced multimodal context for action planning
    if (media_data && media_data.length > 0) {
      const imageCount = media_data.filter((m: any) => m.media_type === 'image').length;
      const audioCount = media_data.filter((m: any) => m.media_type === 'audio').length;
      const videoCount = media_data.filter((m: any) => m.media_type === 'video').length;
      const docCount = media_data.filter((m: any) => m.media_type === 'document').length;
      
      textPrompt += `\n\nEVIDÊNCIAS MULTIMODAIS PARA PLANEJAMENTO DE AÇÃO:`;
      textPrompt += `\n- ${imageCount} imagem(s) - Identifique problemas específicos, localizações exatas, equipamentos envolvidos`;
      
      if (audioCount > 0) {
        textPrompt += `\n- ${audioCount} áudio(s) - Considere informações verbais, ruídos anômalos, condições acústicas`;
      }
      
      if (videoCount > 0) {
        textPrompt += `\n- ${videoCount} vídeo(s) - Observe procedimentos incorretos, movimentos inseguros, dinâmicas problemáticas`;
      }
      
      if (docCount > 0) {
        textPrompt += `\n- ${docCount} documento(s) - Verifique procedimentos, normas, registros relevantes`;
      }
      
      textPrompt += `\n\nUse as evidências para:
- Identificar não-conformidades específicas e sua localização exata
- Dimensionar a severidade do problema observado
- Planejar ações mais precisas e efetivas
- Definir localizações e métodos específicos para intervenção`;
    }

    // Context-aware role and risk assessment
    textPrompt += `\n\nAVALIAÇÃO CONTEXTUAL DE RISCO:
Se identificar cargos específicos (soldador, pedreiro, operador, eletricista), considere:
- Riscos ocupacionais específicos da função
- Procedimentos de segurança aplicáveis e EPIs obrigatórios
- Normas regulamentadoras pertinentes (NRs específicas)
- Consequências da não-conformidade para aquela atividade

Critérios para determinar necessidade de ação:
- Probabilidade de ocorrência do risco identificado
- Severidade das possíveis consequências
- Impacto na saúde e segurança dos trabalhadores
- Requisitos legais e normativos
- Urgência baseada no contexto operacional e evidências observadas`;

    // User prompt integration for actions
    if (user_prompt && user_prompt.trim() !== '') {
      textPrompt += `\n\nFOCO ESPECÍFICO SOLICITADO:
Direcione a criação da ação para: "${user_prompt}"
Mantenha foco em segurança e conformidade, adaptando conforme solicitado.`;
    }

    textPrompt += `\n\nFORMATO DE RESPOSTA:
Retorne JSON com:
- requires_action: boolean (true se necessária ação corretiva baseada nas evidências)
- title: título claro da ação (máx 80 chars)
- what_description: descrição detalhada incluindo especificações técnicas observadas
- where_location: localização específica (use contexto da inspeção e evidências visuais)
- how_method: metodologia detalhada de execução com procedimentos e recursos
- priority: 'baixa', 'media', 'alta', 'critica' (baseado na análise de risco das evidências)

CRITÉRIOS PARA AÇÃO (baseados em evidências):
- Não-conformidades de segurança visíveis/audíveis
- Riscos identificados nas mídias (mesmo potenciais)
- Ausência ou inadequação de EPIs observada
- Procedimentos incorretos registrados
- Condições ambientais inadequadas documentadas
- Necessidade de treinamento identificada

Se NÃO houver evidências suficientes para ação corretiva: {"requires_action": false}

IMPORTANTE: Os campos "who", "when" e "how_much" serão preenchidos depois pelo usuário.`;

    messageContent.push({
      type: "text",
      text: textPrompt
    });

    // Add images to the message content for visual action planning
    if (media_data && media_data.length > 0) {
      for (const media of media_data) {
        if (media.media_type === 'image' && media.file_url) {
          try {
            // Check if it's a data URL (base64) - GPT-4V can analyze these directly
            if (media.file_url.startsWith('data:image/')) {
              messageContent.push({
                type: "image_url",
                image_url: {
                  url: media.file_url,
                  detail: "high" // Use high detail for better analysis
                }
              });
            }
          } catch (error) {
            console.error('Error processing image for AI action planning:', error);
          }
        }
        
        // For audio/video files, add descriptive context
        if (media.media_type === 'audio') {
          messageContent.push({
            type: "text",
            text: `\n[ÁUDIO PARA ANÁLISE: ${media.file_name}] - Este áudio contém informações relevantes sobre condições de trabalho, ruídos, conversas ou situações que podem requerer ação corretiva.`
          });
        }
        
        if (media.media_type === 'video') {
          messageContent.push({
            type: "text",
            text: `\n[VÍDEO PARA ANÁLISE: ${media.file_name}] - Este vídeo documenta procedimentos, movimentações ou situações em tempo real que podem requerer intervenção ou correção.`
          });
        }
      }
    }
    
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: messageContent }],
      temperature: 0.3,
      max_tokens: 1200,
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
      // Create the action item with enhanced data
      const result = await env.DB.prepare(`
        INSERT INTO action_items (
          inspection_id, inspection_item_id, title, what_description, where_location,
          how_method, is_ai_generated, status, priority, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
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
      message: actionData.requires_action ? "Ação corretiva criada com base na análise multimodal" : "Nenhuma ação corretiva necessária baseada na análise das evidências"
    });
    
  } catch (error) {
    console.error('Create action error:', error);
    return c.json({ 
      error: "Failed to create action", 
      details: error instanceof Error ? error.message : String(error) 
    }, 500);
  }
});

// Get actions for inspection item
app.get("/api/inspection-items/:id/actions", async (c) => {
  const env = c.env;
  const itemId = parseInt(c.req.param("id"));
  
  try {
    const actions = await env.DB.prepare(`
      SELECT * FROM action_items WHERE inspection_item_id = ? ORDER BY created_at DESC
    `).bind(itemId).all();
    
    return c.json({ actions: actions.results || [] });
  } catch (error) {
    console.error('Error fetching actions:', error);
    return c.json({ actions: [] });
  }
});

// Get media for inspection item
app.get("/api/inspection-items/:id/media", async (c) => {
  const env = c.env;
  const itemId = parseInt(c.req.param("id"));
  
  try {
    const media = await env.DB.prepare(`
      SELECT * FROM inspection_media WHERE inspection_item_id = ? ORDER BY created_at DESC
    `).bind(itemId).all();
    
    return c.json({ media: media.results || [] });
  } catch (error) {
    console.error('Error fetching media:', error);
    return c.json({ media: [] });
  }
});

// Delete action item
app.delete("/api/action-items/:id", async (c) => {
  const env = c.env;
  const id = parseInt(c.req.param("id"));
  
  try {
    await env.DB.prepare("DELETE FROM action_items WHERE id = ?").bind(id).run();
    return c.json({ message: "Action item deleted successfully" });
  } catch (error) {
    console.error('Error deleting action item:', error);
    return c.json({ error: "Failed to delete action item" }, 500);
  }
});

// Get all action plans (centralized view)
app.get("/api/action-plans/all", authMiddleware, async (c) => {
  const env = c.env;
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "User not found" }, 401);
  }
  
  try {
    // Get user profile to check organization access
    const userProfile = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(user.id).first() as any;
    
    let query = `
      SELECT ai.*, i.title as inspection_title, i.location as inspection_location, 
             i.company_name as inspection_company, i.organization_id
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
      // Apply organization-based filtering based on user role
      if (userProfile?.role === USER_ROLES.SYSTEM_ADMIN) {
        // SYSTEM_ADMIN sees ALL actions - no restrictions
      } else if (userProfile?.role === USER_ROLES.ORG_ADMIN && userProfile?.managed_organization_id) {
        // Org admin sees their organization and subsidiaries
        whereClause.push(`(i.organization_id = ? OR i.organization_id IN (
          SELECT id FROM organizations WHERE parent_organization_id = ?
        ))`);
        params.push(userProfile.managed_organization_id, userProfile.managed_organization_id);
      } else if (userProfile?.organization_id) {
        // Other users see only their organization's actions
        whereClause.push("i.organization_id = ?");
        params.push(userProfile.organization_id);
      }
    }
    
    // For non-admin users, also filter by created_by or collaborators
    if (userProfile?.role !== USER_ROLES.SYSTEM_ADMIN && userProfile?.role !== USER_ROLES.ORG_ADMIN) {
      whereClause.push("(i.created_by = ? OR i.id IN (SELECT inspection_id FROM inspection_collaborators WHERE user_id = ? AND status = 'active'))");
      params.push(user.id, user.id);
    }
    
    if (whereClause.length > 0) {
      query += " WHERE " + whereClause.join(" AND ");
    }
    
    query += " ORDER BY ai.created_at DESC";
    
    const actionItems = await env.DB.prepare(query).bind(...params).all();
    
    return c.json({ action_items: actionItems.results || [] });
  } catch (error) {
    console.error('Error fetching all action items:', error);
    return c.json({ action_items: [] });
  }
});

// Role Permissions endpoints
app.get("/api/role-permissions", authMiddleware, async (c) => {
  const env = c.env;
  const user = c.get("user");
  
  if (!user) {
    return c.json({ error: "User not found" }, 401);
  }
  
  try {
    const userProfile = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(user.id).first() as any;
    
    // Only system admins can manage role permissions
    if (!userProfile || userProfile.role !== USER_ROLES.SYSTEM_ADMIN) {
      return c.json({ error: "Only system administrators can manage role permissions" }, 403);
    }
    
    // Get all role permissions
    const permissions = await env.DB.prepare(`
      SELECT * FROM role_permissions ORDER BY role, permission_type
    `).all();
    
    return c.json({ permissions: permissions.results || [] });
  } catch (error) {
    console.error('Error fetching role permissions:', error);
    return c.json({ error: "Failed to fetch role permissions" }, 500);
  }
});

app.post("/api/role-permissions", authMiddleware, async (c) => {
  const env = c.env;
  const user = c.get("user");
  
  if (!user) {
    return c.json({ error: "User not found" }, 401);
  }
  
  try {
    const userProfile = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(user.id).first() as any;
    
    // Only system admins can manage role permissions
    if (!userProfile || userProfile.role !== USER_ROLES.SYSTEM_ADMIN) {
      return c.json({ error: "Only system administrators can manage role permissions" }, 403);
    }
    
    const body = await c.req.json();
    const { updates } = body;
    
    if (!updates || !Array.isArray(updates)) {
      return c.json({ error: "Invalid updates data" }, 400);
    }
    
    // Process each update
    for (const update of updates) {
      const { role, permission_type, is_allowed } = update;
      
      // Check if permission exists
      const existing = await env.DB.prepare(`
        SELECT id FROM role_permissions WHERE role = ? AND permission_type = ?
      `).bind(role, permission_type).first();
      
      if (existing) {
        // Update existing permission
        await env.DB.prepare(`
          UPDATE role_permissions 
          SET is_allowed = ?, updated_at = datetime('now')
          WHERE role = ? AND permission_type = ?
        `).bind(is_allowed, role, permission_type).run();
      } else {
        // Create new permission
        await env.DB.prepare(`
          INSERT INTO role_permissions (role, permission_type, is_allowed, created_at, updated_at)
          VALUES (?, ?, ?, datetime('now'), datetime('now'))
        `).bind(role, permission_type, is_allowed).run();
      }
    }
    
    // Log activity
    await env.DB.prepare(`
      INSERT INTO activity_log (user_id, action_type, action_description, target_type, created_at)
      VALUES (?, ?, ?, ?, datetime('now'))
    `).bind(
      user.id,
      'role_permissions_updated',
      `Updated ${updates.length} role permission(s)`,
      'role_permissions'
    ).run();
    
    return c.json({ 
      message: "Role permissions updated successfully",
      updated_count: updates.length
    });
  } catch (error) {
    console.error('Error updating role permissions:', error);
    return c.json({ error: "Failed to update role permissions" }, 500);
  }
});

// Get AI assistants
app.get("/api/ai-assistants", authMiddleware, async (c) => {
  const env = c.env;
  
  try {
    // Check if we have any assistants, if not, create default ones
    const existingAssistants = await env.DB.prepare(`
      SELECT COUNT(*) as count FROM ai_assistants WHERE is_active = true
    `).first() as any;
    
    if (existingAssistants?.count === 0) {
      // Create default AI assistants
      const defaultAssistants = [
        {
          name: "Especialista NR-12",
          description: "Especialista em segurança de máquinas e equipamentos",
          specialization: "Máquinas e Equipamentos", 
          instructions: `Você é um especialista técnico em NR-12 (Segurança no Trabalho em Máquinas e Equipamentos) com vasta experiência em:

- Proteções fixas e móveis em máquinas industriais
- Dispositivos de segurança (cortinas de luz, tapetes de segurança, chaves de segurança)
- Sistemas de comando bimanual e parada de emergência  
- Procedimentos de LOTO (Lockout/Tagout)
- Ergonomia em postos de trabalho com máquinas
- Análise de riscos em processos automatizados
- Capacitação de operadores em segurança de máquinas
- Manutenção preventiva com foco em segurança

Sua análise deve focar especificamente em riscos mecânicos, proteções inadequadas, falhas em dispositivos de segurança e procedimentos operacionais inseguros relacionados a máquinas e equipamentos.`
        },
        {
          name: "Especialista em Ergonomia",
          description: "Especialista em análise ergonômica e NR-17",
          specialization: "Ergonomia e NR-17",
          instructions: `Você é um especialista técnico em Ergonomia e NR-17 com expertise em:

- Análise de posturas de trabalho (sentado, em pé, agachado)
- Levantamento e transporte manual de cargas
- Análise de movimentos repetitivos e esforços
- Organização do trabalho e pausas
- Condições ambientais (iluminação, ruído, temperatura)
- Design de postos de trabalho e layout ergonômico
- Mobiliário e equipamentos ergonômicos
- Ginástica laboral e exercícios compensatórios
- Avaliação de riscos ergonômicos (RULA, REBA, NIOSH)

Sua análise deve identificar fatores de risco ergonômico, posturas inadequadas, esforços excessivos e propor soluções para melhoria das condições de trabalho.`
        },
        {
          name: "Especialista em EPIs",
          description: "Especialista em equipamentos de proteção individual",
          specialization: "Equipamentos de Proteção Individual",
          instructions: `Você é um especialista técnico em EPIs (Equipamentos de Proteção Individual) com conhecimento aprofundado em:

- Seleção adequada de EPIs por tipo de risco
- Certificados de Aprovação (CA) e validade
- Proteção respiratória (máscaras, respiradores, filtros)
- Proteção auditiva (protetores auriculares, abafadores)
- Proteção visual e facial (óculos, viseiras, máscaras de solda)
- Proteção da cabeça (capacetes, capuzes)
- Proteção das mãos (luvas de diferentes materiais)
- Proteção dos pés (calçados de segurança, botinas)
- Proteção do corpo (aventais, macacões, coletes)
- Proteção contra quedas (cinturões, talabartes, capacetes)
- Treinamento e conscientização no uso de EPIs
- Higienização, conservação e substituição de EPIs

Sua análise deve verificar adequação, estado de conservação, uso correto e necessidade de substituição ou complementação dos EPIs.`
        },
        {
          name: "Especialista em Altura",
          description: "Especialista em trabalho em altura e NR-35",
          specialization: "Trabalho em Altura",
          instructions: `Você é um especialista técnico em NR-35 (Trabalho em Altura) com experiência em:

- Análise de Risco (AR) para trabalho em altura
- Permissão de Trabalho (PT) em altura
- Sistemas de proteção contra quedas (coletiva e individual)
- Equipamentos para trabalho em altura (cintos, talabartes, trava-quedas)
- Ancoragem e pontos de fixação seguros
- Andaimes, plataformas e estruturas temporárias
- Escadas fixas e móveis
- Resgate em altura e primeiros socorros
- Capacitação e autorização para trabalho em altura
- Supervisão e acompanhamento de trabalhos em altura
- Condições meteorológicas adversas
- Planejamento e organização do trabalho em altura

Sua análise deve focar nos riscos de queda, adequação dos sistemas de proteção, procedimentos de segurança e capacitação dos trabalhadores.`
        },
        {
          name: "Psicólogo do Trabalho",
          description: "Especialista em fatores psicossociais e saúde mental no trabalho",
          specialization: "Fatores Psicossociais",
          instructions: `Você é um psicólogo do trabalho especialista em fatores psicossociais com conhecimento em:

- Avaliação de riscos psicossociais no ambiente de trabalho
- Identificação de fatores de estresse ocupacional
- Análise de carga mental e pressão temporal
- Relacionamento interpessoal e clima organizacional
- Liderança e estilos de gestão impactantes na saúde mental
- Prevenção de burnout e esgotamento profissional
- Identificação de sinais de ansiedade e depressão relacionada ao trabalho
- Programas de qualidade de vida no trabalho
- Violência psicológica e assédio moral
- Organização do trabalho e autonomia dos trabalhadores
- Suporte social e reconhecimento profissional
- Programas de reintegração pós-afastamento

Sua análise deve identificar fatores de risco psicossocial, condições que impactem a saúde mental dos trabalhadores e propor intervenções para melhoria do bem-estar psicológico.`
        }
      ];

      for (const assistant of defaultAssistants) {
        await env.DB.prepare(`
          INSERT INTO ai_assistants (name, description, specialization, instructions, is_active, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        `).bind(
          assistant.name,
          assistant.description,
          assistant.specialization,
          assistant.instructions,
          true
        ).run();
      }
    }

    // Now fetch all active assistants
    const assistants = await env.DB.prepare(`
      SELECT * FROM ai_assistants WHERE is_active = true ORDER BY name ASC
    `).all();
    
    return c.json({ assistants: assistants.results || [] });
  } catch (error) {
    console.error('Error fetching AI assistants:', error);
    return c.json({ assistants: [] });
  }
});

// Create AI assistant (admin only)
app.post("/api/ai-assistants", authMiddleware, async (c) => {
  const env = c.env;
  const user = c.get("user");
  
  try {
    // Check if user is admin
    const userProfile = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(user!.id).first() as any;
    if (!userProfile || (userProfile.role !== USER_ROLES.SYSTEM_ADMIN && userProfile.role !== USER_ROLES.ORG_ADMIN)) {
      return c.json({ error: "Insufficient permissions" }, 403);
    }
    
    const data = await c.req.json();
    
    await env.DB.prepare(`
      INSERT INTO ai_assistants (name, description, specialization, instructions, created_at, updated_at)
      VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
    `).bind(
      data.name,
      data.description || null,
      data.specialization,
      data.instructions
    ).run();
    
    return c.json({ message: "AI assistant created successfully" });
  } catch (error) {
    console.error('Error creating AI assistant:', error);
    return c.json({ error: "Failed to create AI assistant" }, 500);
  }
});

// Update AI assistant (admin only)
app.put("/api/ai-assistants/:id", authMiddleware, async (c) => {
  const env = c.env;
  const user = c.get("user");
  const id = parseInt(c.req.param("id"));
  
  try {
    // Check if user is admin
    const userProfile = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(user!.id).first() as any;
    if (!userProfile || (userProfile.role !== USER_ROLES.SYSTEM_ADMIN && userProfile.role !== USER_ROLES.ORG_ADMIN)) {
      return c.json({ error: "Insufficient permissions" }, 403);
    }
    
    const data = await c.req.json();
    
    await env.DB.prepare(`
      UPDATE ai_assistants 
      SET name = ?, description = ?, specialization = ?, instructions = ?, updated_at = datetime('now')
      WHERE id = ?
    `).bind(
      data.name,
      data.description || null,
      data.specialization,
      data.instructions,
      id
    ).run();
    
    return c.json({ message: "AI assistant updated successfully" });
  } catch (error) {
    console.error('Error updating AI assistant:', error);
    return c.json({ error: "Failed to update AI assistant" }, 500);
  }
});

// Delete AI assistant (admin only)
app.delete("/api/ai-assistants/:id", authMiddleware, async (c) => {
  const env = c.env;
  const user = c.get("user");
  const id = parseInt(c.req.param("id"));
  
  try {
    // Check if user is admin
    const userProfile = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(user!.id).first() as any;
    if (!userProfile || (userProfile.role !== USER_ROLES.SYSTEM_ADMIN && userProfile.role !== USER_ROLES.ORG_ADMIN)) {
      return c.json({ error: "Insufficient permissions" }, 403);
    }
    
    await env.DB.prepare("UPDATE ai_assistants SET is_active = false WHERE id = ?").bind(id).run();
    
    return c.json({ message: "AI assistant deleted successfully" });
  } catch (error) {
    console.error('Error deleting AI assistant:', error);
    return c.json({ error: "Failed to delete AI assistant" }, 500);
  }
});

// Clear AI pre-analysis from inspection item
app.delete("/api/inspection-items/:id/pre-analysis", async (c) => {
  const env = c.env;
  const itemId = parseInt(c.req.param("id"));
  
  try {
    await env.DB.prepare(`
      UPDATE inspection_items 
      SET ai_pre_analysis = NULL, updated_at = datetime('now')
      WHERE id = ?
    `).bind(itemId).run();
    
    return c.json({ message: "Pre-analysis removed successfully" });
  } catch (error) {
    console.error('Error removing pre-analysis:', error);
    return c.json({ error: "Failed to remove pre-analysis" }, 500);
  }
});

// Clear AI action plan from inspection item
app.delete("/api/inspection-items/:id/action-plan", async (c) => {
  const env = c.env;
  const itemId = parseInt(c.req.param("id"));
  
  try {
    await env.DB.prepare(`
      UPDATE inspection_items 
      SET ai_action_plan = NULL, updated_at = datetime('now')
      WHERE id = ?
    `).bind(itemId).run();
    
    return c.json({ message: "Action plan removed successfully" });
  } catch (error) {
    console.error('Error removing action plan:', error);
    return c.json({ error: "Failed to remove action plan" }, 500);
  }
});

// Generate field response with AI - MULTIMODAL FUNCTIONALITY
app.post("/api/inspection-items/:id/generate-field-response", async (c) => {
  const env = c.env;
  const itemId = parseInt(c.req.param("id"));
  
  console.log(`[DEBUG] Iniciando geração de resposta IA para item ${itemId}`);
  console.log(`[DEBUG] Environment check - OpenAI Key presente: ${!!env.OPENAI_API_KEY}`);
  
  if (!env.OPENAI_API_KEY) {
    console.error('[ERROR] OpenAI API key não configurada');
    return c.json({ error: "Chave da API OpenAI não configurada" }, 500);
  }
  
  let body: any = {};
  
  try {
    console.log(`[DEBUG] Parsing request body para item ${itemId}`);
    body = await c.req.json();
    const { field_name, field_type, current_response, media_data, field_options } = body;
    
    console.log('[DEBUG] Dados recebidos:', {
      itemId,
      field_name: field_name?.substring(0, 50) + '...',
      field_type,
      current_response: typeof current_response,
      media_count: media_data?.length || 0,
      has_options: !!field_options
    });
    
    // Get comprehensive inspection context
    const inspectionItem = await env.DB.prepare(`
      SELECT ii.*, i.title, i.location, i.company_name, i.inspector_name, i.description as inspection_description,
             i.ai_assistant_id
      FROM inspection_items ii
      JOIN inspections i ON ii.inspection_id = i.id
      WHERE ii.id = ?
    `).bind(itemId).first() as any;
    
    if (!inspectionItem) {
      console.error('[ERROR] Item de inspeção não encontrado:', itemId);
      return c.json({ error: "Item de inspeção não encontrado" }, 404);
    }
    
    console.log('[DEBUG] Item encontrado:', inspectionItem.id, 'da inspeção:', inspectionItem.inspection_id);
    
    console.log('[DEBUG] Inicializando cliente OpenAI...');
    const OpenAI = (await import('openai')).default;
    const openai = new OpenAI({
      apiKey: env.OPENAI_API_KEY,
      timeout: 30000, // 30 segundos timeout
      maxRetries: 1, // Apenas 1 tentativa
    });
    console.log('[DEBUG] Cliente OpenAI inicializado com sucesso');
    
    // Parse field options safely
    let fieldOptions: string[] = [];
    if (field_options && field_options !== '') {
      try {
        console.log('[DEBUG] Parsing field options:', typeof field_options, field_options);
        if (typeof field_options === 'string' && field_options.startsWith('[')) {
          fieldOptions = JSON.parse(field_options);
        } else if (typeof field_options === 'string') {
          fieldOptions = field_options.split('|').map((opt: string) => opt.trim()).filter((opt: string) => opt.length > 0);
        } else if (Array.isArray(field_options)) {
          fieldOptions = field_options;
        }
        console.log('[DEBUG] Field options parsed:', fieldOptions);
      } catch (error) {
        console.error('[ERROR] Failed to parse field options:', field_options, error);
        fieldOptions = [];
      }
    }
    
    // Get AI assistant for this inspection if available
    let assistantInstructions = '';
    if (inspectionItem.ai_assistant_id) {
      try {
        const assistant = await env.DB.prepare(`
          SELECT name, instructions FROM ai_assistants WHERE id = ? AND is_active = true
        `).bind(inspectionItem.ai_assistant_id).first() as any;
        
        if (assistant) {
          assistantInstructions = `\n\nVOCÊ É UM ${assistant.name.toUpperCase()}:\n${assistant.instructions}\n\n`;
        }
      } catch (assistantError) {
        console.warn('Failed to load AI assistant:', assistantError);
      }
    }
    
    // Build multimodal message content for field response generation
    const messageContent: any[] = [];
    
    // Build comprehensive contextual prompt for response generation with multimodal analysis
    let textPrompt = `Você é um especialista sênior em segurança do trabalho analisando evidências multimodais.${assistantInstructions}

CONTEXTO DA INSPEÇÃO:
- Empresa: ${inspectionItem.company_name || 'Não informado'}
- Local: ${inspectionItem.location || 'Não informado'}
- Pergunta: ${field_name}
- Tipo: ${field_type}
- Resposta Atual: ${current_response !== undefined && current_response !== null ? current_response : 'Vazio'}
${fieldOptions.length > 0 ? `- Opções: ${fieldOptions.join(', ')}` : ''}

ANÁLISE MULTIMODAL ESTRUTURADA:
1. DESCREVA objetivamente o que você observa nas evidências (fotos, áudios, vídeos)
2. IDENTIFIQUE aspectos de segurança relevantes à pergunta específica
3. CONCLUA com resposta precisa para o campo

EVIDÊNCIAS DISPONÍVEIS:`;

    // Enhanced multimodal context with descriptive analysis
    let hasValidMedia = false;
    if (media_data && Array.isArray(media_data) && media_data.length > 0) {
      const imageCount = media_data.filter((m: any) => m && m.media_type === 'image').length;
      const audioCount = media_data.filter((m: any) => m && m.media_type === 'audio').length;
      const videoCount = media_data.filter((m: any) => m && m.media_type === 'video').length;
      const docCount = media_data.filter((m: any) => m && m.media_type === 'document').length;
      
      if (imageCount + audioCount + videoCount + docCount > 0) {
        hasValidMedia = true;
        textPrompt += `\n${imageCount} foto(s), ${audioCount} áudio(s), ${videoCount} vídeo(s), ${docCount} doc(s)`;
        
        console.log('Dados de mídia disponíveis para análise:', {
          total: media_data.length,
          images: imageCount,
          audios: audioCount,
          videos: videoCount,
          documents: docCount
        });
      }
    }
    
    if (!hasValidMedia) {
      console.log('Nenhuma mídia válida disponível para análise');
    }

    textPrompt += `\n\nINSTRUÇÕES (MÁXIMO 15 LINHAS TOTAL):
1. DESCREVA brevemente o que observa nas evidências (1-3 linhas)
2. ANALISE como isso responde à pergunta específica (1-2 linhas)  
3. CONCLUA com resposta precisa (1 linha)

FORMATO DE RESPOSTA ${field_type}:`;

if (field_type === 'boolean') {
  textPrompt += `\ntrue = Conforme | false = Não Conforme`;
} else if (field_type === 'select' || field_type === 'radio') {
  textPrompt += `\nEscolha: ${fieldOptions.join(' | ')}`;
} else if (field_type === 'rating') {
  textPrompt += `\nNúmero de 1 a 5`;
} else if (field_type === 'multiselect') {
  textPrompt += `\nArray: ["opção1", "opção2"]`;
} else {
  textPrompt += `\nTexto adequado ao campo`;
}

textPrompt += `\n\nRESPOSTA JSON (SEM MARKDOWN):
{"generated_response": valor, "generated_comment": "observação_concisa_máx_80_chars"}

IMPORTANTE: Resposta em até 15 LINHAS TOTAL. Base-se nas evidências visuais/auditivas.`;

    messageContent.push({
      type: "text",
      text: textPrompt
    });

    // Otimização agressiva para imagens - evitar 502
    let imageProcessed = 0;
    const MAX_IMAGES = 1; // Apenas 1 imagem para evitar timeout
    const MAX_IMAGE_SIZE_MB = 2; // Limite muito baixo
    
    if (hasValidMedia && media_data && Array.isArray(media_data) && media_data.length > 0) {
      for (const media of media_data) {
        if (media && media.media_type === 'image' && media.file_url) {
          try {
            // Check if it's a data URL (base64) - GPT-4V can analyze these directly
            if (media.file_url.startsWith('data:image/')) {
              // Validate image size - OpenAI has limits on image size
              const sizeInBytes = (media.file_url.length * 3) / 4; // Approximate base64 to bytes
              const sizeInMB = sizeInBytes / (1024 * 1024);
              
              if (sizeInMB > MAX_IMAGE_SIZE_MB) {
                console.warn(`Imagem ${media.file_name} muito grande (${sizeInMB.toFixed(2)}MB), pulando análise IA`);
                continue;
              }
              
              // Limit number of images to avoid token limits and timeout
              if (imageProcessed >= MAX_IMAGES) {
                console.warn(`Número máximo de imagens atingido (${MAX_IMAGES}), pulando imagens adicionais`);
                break;
              }
              
              messageContent.push({
                type: "image_url",
                image_url: {
                  url: media.file_url,
                  detail: "low" // Low detail para performance máxima
                }
              });
              imageProcessed++;
              console.log(`[DEBUG] Imagem ${imageProcessed} processada:`, media.file_name, `(${sizeInMB.toFixed(2)}MB)`);
            } else {
              console.warn(`Imagem ${media.file_name} não é uma URL de dados válida para análise IA`);
            }
          } catch (error) {
            console.error('Erro processando imagem para resposta de campo:', media.file_name, error);
          }
        }
        
        // Para arquivos de áudio/vídeo, adicionar contexto descritivo
        if (media && media.media_type === 'audio') {
          messageContent.push({
            type: "text",
            text: `[ÁUDIO ${media.file_name}]: Descreva sons, ruídos, conversas ou condições acústicas observadas que sejam relevantes para "${field_name}".`
          });
        }
        
        if (media && media.media_type === 'video') {
          messageContent.push({
            type: "text", 
            text: `[VÍDEO ${media.file_name}]: Descreva movimentos, procedimentos, comportamentos ou situações dinâmicas relevantes para "${field_name}".`
          });
        }
      }
      console.log(`Processadas ${imageProcessed} imagens de ${media_data.length} arquivos de mídia para análise IA`);
    }
    
    console.log('Chamando OpenAI com partes de conteúdo:', messageContent.length);
    console.log('Detalhes da requisição OpenAI:', {
      model: "gpt-4o",
      temperature: 0.2,
      max_tokens: 400,
      messageContentLength: messageContent.length,
      hasImages: messageContent.some(m => m.type === 'image_url'),
      imageCount: imageProcessed
    });
    
    console.log('[DEBUG] Preparando requisição OpenAI com:', {
      model: "gpt-4o-mini",
      temperature: 0.1,
      max_tokens: 250,
      messageContentParts: messageContent.length,
      hasImages: messageContent.some(m => m.type === 'image_url'),
      textLength: messageContent.find(m => m.type === 'text')?.text?.length || 0
    });
    
    // Validar se temos conteúdo válido
    if (!messageContent || messageContent.length === 0) {
      console.error('[ERROR] Nenhum conteúdo para enviar à OpenAI');
      throw new Error("Nenhum conteúdo válido para análise");
    }
    
    // Use modelo mais simples e timeout conservador
    let completion;
    try {
      console.log('[DEBUG] Fazendo chamada para OpenAI...');
      completion = await Promise.race([
        openai.chat.completions.create({
          model: "gpt-4o-mini", // Modelo mais rápido e barato
          messages: [{ role: "user", content: messageContent }],
          temperature: 0.1,
          max_tokens: 250,
        }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout da requisição OpenAI após 18 segundos')), 18000)
        )
      ]) as any;
      console.log('[DEBUG] Chamada OpenAI concluída');
    } catch (openaiError: any) {
      console.error('[ERROR] Falha na chamada OpenAI:', openaiError);
      
      if (openaiError.message?.includes('timeout') || openaiError.code === 'ETIMEDOUT') {
        throw new Error('Timeout na API OpenAI - tente com menos imagens ou aguarde');
      } else if (openaiError.status === 401) {
        throw new Error('Chave da API OpenAI inválida ou expirada');
      } else if (openaiError.status === 429) {
        throw new Error('Limite de taxa da OpenAI excedido - aguarde alguns minutos');
      } else if (openaiError.status === 400) {
        throw new Error('Requisição inválida para OpenAI - conteúdo muito grande ou formato inválido');
      } else {
        throw new Error(`Erro da API OpenAI: ${openaiError.message || 'Erro desconhecido'}`);
      }
    }
    
    console.log('[DEBUG] Resposta recebida da OpenAI');
    
    console.log('[DEBUG] Processando resposta da OpenAI...');
    console.log('[DEBUG] Completion object:', JSON.stringify(completion, null, 2));
    
    const response = completion.choices?.[0]?.message?.content;
    console.log('[DEBUG] Resposta extraída:', response ? response.substring(0, 200) + '...' : 'VAZIO');
    
    if (!response || response.trim() === '') {
      console.error('[ERROR] Resposta vazia ou inválida da OpenAI');
      console.error('[ERROR] Completion choices:', completion.choices);
      console.error('[ERROR] Completion usage:', completion.usage);
      throw new Error("Resposta vazia da API OpenAI - tente novamente com menos conteúdo");
    }
    
    // Parse the response with better error handling
    let responseData;
    try {
      // Clean the response first
      let cleanResponse = response.trim();
      
      // Remove any markdown code block formatting
      if (cleanResponse.startsWith('```json')) {
        cleanResponse = cleanResponse.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      } else if (cleanResponse.startsWith('```')) {
        cleanResponse = cleanResponse.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }
      
      responseData = JSON.parse(cleanResponse);
      console.log('Dados de resposta IA analisados:', responseData);
    } catch (parseError) {
      console.error('Falha ao analisar resposta IA:', parseError, 'Resposta original:', response);
      
      // Try to extract JSON from the response
      const jsonMatch = response.match(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/);
      if (jsonMatch) {
        try {
          responseData = JSON.parse(jsonMatch[0]);
          console.log('JSON extraído e analisado da resposta:', responseData);
        } catch (extractError) {
          console.error('Falha ao analisar JSON extraído:', extractError);
          throw new Error("Falha ao analisar resposta IA como JSON");
        }
      } else {
        throw new Error("Nenhum JSON válido encontrado na resposta IA");
      }
    }
    
    // Validate response structure
    if (!responseData || typeof responseData !== 'object') {
      throw new Error("Resposta IA não é um objeto válido");
    }
    
    if (responseData.generated_response === undefined && responseData.generated_response !== false && responseData.generated_response !== 0) {
      console.warn('Nenhuma generated_response na resposta IA, usando fallback');
      responseData.generated_response = null;
    }
    
    // Validate and normalize response format based on field type
    try {
      if (field_type === 'boolean') {
        if (typeof responseData.generated_response === 'string') {
          responseData.generated_response = responseData.generated_response.toLowerCase() === 'true';
        } else if (typeof responseData.generated_response !== 'boolean') {
          responseData.generated_response = false; // Default to false for safety
        }
      } else if (field_type === 'number' || field_type === 'rating') {
        if (typeof responseData.generated_response === 'string') {
          const parsed = parseFloat(responseData.generated_response);
          responseData.generated_response = isNaN(parsed) ? 0 : parsed;
        } else if (typeof responseData.generated_response !== 'number') {
          responseData.generated_response = 0;
        }
        
        // Validate rating range
        if (field_type === 'rating') {
          responseData.generated_response = Math.max(1, Math.min(5, Math.round(responseData.generated_response)));
        }
      } else if ((field_type === 'select' || field_type === 'radio') && fieldOptions.length > 0) {
        // Validate if response is in valid options
        if (!fieldOptions.includes(responseData.generated_response)) {
          console.warn('Resposta IA não está nas opções válidas, usando primeira opção');
          responseData.generated_response = fieldOptions[0]; // Default to first option
        }
      } else if (field_type === 'multiselect') {
        if (!Array.isArray(responseData.generated_response)) {
          responseData.generated_response = [];
        }
      }
      
      // Ensure comment is string and within limits
      if (responseData.generated_comment && typeof responseData.generated_comment === 'string') {
        responseData.generated_comment = responseData.generated_comment.substring(0, 150);
      } else {
        responseData.generated_comment = null;
      }
      
      console.log('Dados de resposta finais validados:', responseData);
    } catch (validationError) {
      console.error('Erro validando dados de resposta:', validationError);
      throw new Error("Falha ao validar formato de resposta IA");
    }
    
    return c.json({ 
      generated_response: responseData.generated_response,
      generated_comment: responseData.generated_comment,
      message: "Resposta gerada com sucesso pela IA multimodal" 
    });
    
  } catch (error) {
    console.error('[ERROR] Erro na geração de resposta de campo:', error);
    
    // Log detalhado para debugging
    if (error instanceof Error) {
      console.error('[ERROR] Detalhes completos do erro:', {
        message: error.message,
        name: error.name,
        stack: error.stack?.substring(0, 500),
        cause: (error as any).cause || 'N/A'
      });
    }
    
    // Análise específica do tipo de erro
    let errorMessage = "Falha ao gerar resposta de campo";
    let errorDetails = "Erro interno do servidor";
    let httpStatus = 500;
    
    if (error instanceof Error) {
      const errorMsg = error.message.toLowerCase();
      errorDetails = error.message;
      
      if (errorMsg.includes('timeout') || errorMsg.includes('etimedout') || errorMsg.includes('econnreset')) {
        errorMessage = "Timeout na requisição - tente reduzir o número de imagens";
        httpStatus = 408;
        console.error('[ERROR] Timeout detectado:', error.message);
      } else if (errorMsg.includes('openai') || errorMsg.includes('api')) {
        if (errorMsg.includes('401') || errorMsg.includes('unauthorized')) {
          errorMessage = "Chave da API OpenAI inválida";
          httpStatus = 401;
        } else if (errorMsg.includes('429') || errorMsg.includes('rate limit')) {
          errorMessage = "Limite da API OpenAI excedido - aguarde e tente novamente";
          httpStatus = 429;
        } else if (errorMsg.includes('quota') || errorMsg.includes('insufficient')) {
          errorMessage = "Cota da API OpenAI esgotada";
          httpStatus = 402;
        } else {
          errorMessage = "Erro na API da OpenAI";
          httpStatus = 502;
        }
        console.error('[ERROR] Erro específico da OpenAI:', error.message);
      } else if (errorMsg.includes('parse') || errorMsg.includes('json')) {
        errorMessage = "Erro ao processar resposta da IA";
        httpStatus = 500;
      } else if (errorMsg.includes('not found')) {
        errorMessage = "Recurso não encontrado";
        httpStatus = 404;
      }
    }
    
    // Log contexto completo
    console.error('[ERROR] Contexto do erro:', {
      itemId,
      fieldName: body?.field_name?.substring(0, 50) || 'desconhecido',
      fieldType: body?.field_type || 'desconhecido',
      hasMediaData: !!(body?.media_data && Array.isArray(body.media_data)),
      mediaCount: body?.media_data?.length || 0,
      currentResponse: typeof body?.current_response,
      timestamp: new Date().toISOString()
    });
    
    return c.json({ 
      success: false,
      error: errorMessage, 
      details: errorDetails,
      field_name: body?.field_name || 'desconhecido',
      field_type: body?.field_type || 'desconhecido',
      error_code: `GEN_RESP_${httpStatus}`,
      timestamp: new Date().toISOString()
    }, httpStatus as any);
  }
});

// CNPJ lookup endpoint
app.get("/api/cnpj/:cnpj", async (c) => {
  const cnpj = c.req.param("cnpj").replace(/\D/g, ''); // Remove non-numeric characters
  
  if (cnpj.length !== 14) {
    return c.json({ error: "CNPJ deve ter 14 dígitos" }, 400);
  }
  
  try {
    // Try ReceitaWS API first (free service)
    let response = await (globalThis as any).fetch(`https://www.receitaws.com.br/v1/cnpj/${cnpj}`, {
      headers: {
        'User-Agent': 'COMPIA-SafetyInspector/1.0'
      }
    });
    
    if (!response.ok) {
      // Fallback to another service if ReceitaWS fails
      response = await (globalThis as any).fetch(`https://publica.cnpj.ws/cnpj/${cnpj}`, {
        headers: {
          'User-Agent': 'COMPIA-SafetyInspector/1.0'
        }
      });
    }
    
    const data = await response.json() as any;
    
    if (data.status === 'ERROR' || data.message) {
      return c.json({ error: data.message || "CNPJ não encontrado" }, 404);
    }
    
    // Normalize data from different APIs
    const normalizedData = {
      cnpj: data.cnpj || cnpj,
      razao_social: data.nome || data.company?.name || data.razao_social,
      nome_fantasia: data.fantasia || data.company?.alias || data.nome_fantasia,
      cnae_principal: data.atividade_principal?.[0]?.code || data.primary_activity?.id || data.cnae_principal,
      cnae_descricao: data.atividade_principal?.[0]?.text || data.primary_activity?.text || data.cnae_descricao,
      natureza_juridica: data.natureza_juridica || data.legal_nature?.text || data.natureza_juridica,
      data_abertura: data.abertura || data.founded || data.data_abertura,
      capital_social: data.capital_social || data.equity || data.capital_social,
      porte_empresa: data.porte || data.size?.text || data.porte_empresa,
      situacao_cadastral: data.situacao || data.status?.text || data.situacao_cadastral,
      endereco: {
        logradouro: data.logradouro || data.address?.street || data.endereco?.logradouro,
        numero: data.numero || data.address?.number || data.endereco?.numero,
        complemento: data.complemento || data.address?.details || data.endereco?.complemento,
        bairro: data.bairro || data.address?.district || data.endereco?.bairro,
        municipio: data.municipio || data.address?.city || data.endereco?.municipio,
        uf: data.uf || data.address?.state || data.endereco?.uf,
        cep: data.cep || data.address?.zip || data.endereco?.cep
      },
      telefone: data.telefone || data.phone || data.contato?.telefone,
      email: data.email || data.email || data.contato?.email,
      website: data.website || data.site || data.website
    };
    
    // Build formatted address
    const enderecoCompleto = [
      normalizedData.endereco.logradouro,
      normalizedData.endereco.numero,
      normalizedData.endereco.complemento,
      normalizedData.endereco.bairro,
      normalizedData.endereco.municipio,
      normalizedData.endereco.uf
    ].filter(Boolean).join(', ');
    
    return c.json({
      ...normalizedData,
      endereco_completo: enderecoCompleto
    });
  } catch (error) {
    console.error('Error fetching CNPJ data:', error);
    return c.json({ error: "Falha ao buscar dados do CNPJ. Tente novamente." }, 500);
  }
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
    console.error('Error fetching CEP:', error);
    return c.json({ error: "Failed to fetch CEP data" }, 500);
  }
});

// Get invitation details (public endpoint)
app.get("/api/invitations/:token/details", async (c) => {
  const env = c.env;
  const token = c.req.param("token");
  
  try {
    // Find invitation
    const invitation = await env.DB.prepare(`
      SELECT ui.*, o.name as organization_name, u.name as inviter_name
      FROM user_invitations ui
      LEFT JOIN organizations o ON ui.organization_id = o.id
      LEFT JOIN users u ON ui.invited_by = u.id
      WHERE ui.invitation_token = ? AND ui.accepted_at IS NULL AND ui.expires_at > datetime('now')
    `).bind(token).first() as any;
    
    if (!invitation) {
      return c.json({ error: "Invalid or expired invitation." }, 404);
    }
    
    return c.json({ 
      invitation: {
        email: invitation.email,
        organization_id: invitation.organization_id,
        role: invitation.role,
        invited_by: invitation.invited_by,
        expires_at: invitation.expires_at,
        organization_name: invitation.organization_name,
        inviter_name: invitation.inviter_name
      }
    });
    
  } catch (error) {
    console.error('Error fetching invitation details:', error);
    return c.json({ error: "Failed to fetch invitation details." }, 500);
  }
});

// Accept invitation (public endpoint with auth)
app.post("/api/invitations/:token/accept", authMiddleware, async (c) => {
  const env = c.env;
  const user = c.get("user");
  const token = c.req.param("token");
  
  try {
    // Find invitation
    const invitation = await env.DB.prepare(`
      SELECT * FROM user_invitations 
      WHERE invitation_token = ? AND accepted_at IS NULL AND expires_at > datetime('now')
    `).bind(token).first() as any;
    
    if (!invitation) {
      return c.json({ error: "Invalid or expired invitation." }, 404);
    }
    
    // Check if user email matches invitation
    if (!user || user.email !== invitation.email) {
      return c.json({ error: "The email you are logged in with does not match the invitation email. Please log in with the correct email." }, 400);
    }
    
    // Update or create user profile
    const existingUser = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(user.id).first() as any;
    
    if (existingUser) {
      // Update existing user
      await env.DB.prepare(`
        UPDATE users 
        SET organization_id = ?, role = ?, updated_at = datetime('now')
        WHERE id = ?
      `).bind(invitation.organization_id, invitation.role, user.id).run();
    } else {
      // Create new user profile
      const canManageUsers = invitation.role === USER_ROLES.ORG_ADMIN;
      const canCreateOrgs = invitation.role === USER_ROLES.ORG_ADMIN;
      const managedOrgId = invitation.role === USER_ROLES.ORG_ADMIN ? invitation.organization_id : null;
      
      await env.DB.prepare(`
        INSERT INTO users (
          id, email, name, role, organization_id, can_manage_users, 
          can_create_organizations, managed_organization_id, is_active, 
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `).bind(
        user.id,
        user.email,
        user.google_user_data?.name || user.email,
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
    if (user) {
      await env.DB.prepare(`
        INSERT INTO activity_log (user_id, organization_id, action_type, action_description, target_type, target_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
      `).bind(
        user.id,
        invitation.organization_id,
        'invitation_accepted',
        `Accepted invitation with role: ${invitation.role}`,
        'invitation',
        invitation.id.toString()
      ).run();
    }
    
    return c.json({ 
      message: "Invitation accepted successfully.",
      role: invitation.role,
      organization_id: invitation.organization_id
    });
    
  } catch (error) {
    console.error('Error accepting invitation:', error);
    return c.json({ error: "Failed to accept invitation." }, 500);
  }
});

// Health check endpoint
app.get("/api/health", async (c) => {
  return c.json({ 
    status: "ok", 
    timestamp: new Date().toISOString(),
    service: "SafetyInspector API"
  });
});

// 404 handler for unmatched routes
app.notFound((c) => {
  return c.json({ error: "Endpoint not found" }, 404);
});

// Error handler
app.onError((error, c) => {
  console.error('Global error handler:', error);
  return c.json({ 
    error: "Internal server error",
    message: error.message 
  }, 500);
});

export default app;
