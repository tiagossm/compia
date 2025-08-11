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
import { USER_ROLES } from "@/shared/user-types";

const app = new Hono<{ Bindings: Env }>();

app.use("*", cors({
  origin: "*",
  allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization"],
}));

// Mount multi-tenant routes
app.route("/api", multiTenantRoutes);

// Mount user routes  
import usersRoutes from "./users-routes";
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

// Simple endpoint to test if worker is running
app.get("/api/health", async (c) => {
  return c.json({ status: "ok", timestamp: new Date().toISOString() });
});

export default app;
