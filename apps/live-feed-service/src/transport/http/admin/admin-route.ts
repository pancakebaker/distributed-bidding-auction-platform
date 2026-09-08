/**
 * Express admin transport boundary for the read-only live-feed operations page.
 */
import express from 'express';
import type { Express } from 'express';
import type { LiveFeedDashboardSnapshot } from '../../../application/diagnostics/get-live-feed-dashboard.js';
import { renderLiveFeedAdmin } from '../../../ui/server/render-live-feed-admin.js';
import type { AdminAuth } from './admin-auth.js';
import { applyAdminSecurityHeaders } from './admin-security.js';

/**
 * Dependencies for the protected operational dashboard routes.
 */
export type AdminRouteDependencies = {
  auth: AdminAuth;
  getSnapshot: () => LiveFeedDashboardSnapshot;
  assetDirectory: string;
  publicAdminDirectory: string;
};

/**
 * Registers protected SSR, login, logout, and static asset routes for the admin surface.
 */
export function registerAdminRoutes(app: Express, dependencies: AdminRouteDependencies): void {
  app.use('/admin', express.static(dependencies.assetDirectory));
  app.use('/admin', express.static(dependencies.publicAdminDirectory));

  app.get('/admin/login', (_request, response) => {
    applyAdminSecurityHeaders(response);
    response.type('html').send(loginPage());
  });

  app.post('/admin/login', express.urlencoded({ extended: false }), (request, response) => {
    applyAdminSecurityHeaders(response);
    const body = request.body as { username?: unknown; password?: unknown };
    const username = typeof body.username === 'string' ? body.username : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const cookie = dependencies.auth.authenticate(username, password);

    if (!cookie) {
      response.status(401).type('html').send(loginPage('Invalid admin credentials.'));
      return;
    }

    response.setHeader('Set-Cookie', cookie);
    response.redirect('/admin/live-feed');
  });

  app.post('/admin/logout', (_request, response) => {
    applyAdminSecurityHeaders(response);
    response.setHeader('Set-Cookie', dependencies.auth.clearCookie());
    response.redirect('/admin/login');
  });

  app.get('/admin/live-feed', (request, response, next) => {
    applyAdminSecurityHeaders(response);

    if (!dependencies.auth.isAuthorizedCookie(request.get('cookie'))) {
      response.redirect('/admin/login');
      return;
    }

    try {
      response.type('html').send(renderLiveFeedAdmin(dependencies.getSnapshot()));
    } catch (error) {
      next(error);
    }
  });
}

function loginPage(message?: string): string {
  const notice = message ? '<p role="alert">' + message + '</p>' : '';
  return (
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<title>Live Feed Admin Login</title></head><body><main><h1>Live Feed Operations</h1>' +
    notice +
    '<form method="post" action="/admin/login"><label>Username <input name="username" autocomplete="username" required></label>' +
    '<label>Password <input type="password" name="password" autocomplete="current-password" required></label>' +
    '<button type="submit">Sign in</button></form></main></body></html>'
  );
}
