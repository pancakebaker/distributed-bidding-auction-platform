/**
 * Express admin transport boundary for Laravel-authorized live-feed operations.
 */
import express from 'express';
import type { Express, Request, Response } from 'express';
import { ApplicationError } from '../../../application/errors/application-error.js';
import type { AdminTokenReplayConsumer } from '../../../application/ports/admin-token-replay-consumer.js';
import type { AdminHandoffStore } from '../../../application/ports/admin-handoff-store.js';
import type {
  AdminTokenClaims,
  AdminTokenVerifier,
} from '../../../application/ports/admin-token-verifier.js';
import type { LiveFeedDashboardSnapshot } from '../../../application/diagnostics/get-live-feed-dashboard.js';
import { renderLiveFeedAdmin } from '../../../ui/server/render-live-feed-admin.js';
import type { AdminAuth } from './admin-auth.js';
import { applyAdminSecurityHeaders } from './admin-security.js';
import { adminRoutes } from './admin-routes.js';

/**
 * Dependencies for the protected operational dashboard routes.
 */
export type AdminRouteDependencies = {
  auth: AdminAuth;
  tokenVerifier: AdminTokenVerifier;
  replayConsumer: AdminTokenReplayConsumer;
  clientOrigin: string;
  getSnapshot: () => LiveFeedDashboardSnapshot;
  assetDirectory: string;
  publicAdminDirectory: string;
  systemTokenVerifier?: AdminTokenVerifier;
  handoffStore?: AdminHandoffStore;
  enableLegacyLaravelAdminAuth?: boolean;
  enableSystemAdminAuth?: boolean;
};

/**
 * Registers token exchange, protected SSR, logout, and static asset routes for the admin surface.
 */
export function registerAdminRoutes(app: Express, dependencies: AdminRouteDependencies): void {
  app.use('/admin', express.static(dependencies.assetDirectory));
  app.use('/admin', express.static(dependencies.publicAdminDirectory));

  app.get('/admin/login', (_request, response) => {
    response.redirect(dependencies.clientOrigin + adminRoutes.liveFeed);
  });

  app.get('/admin/auth/handoff', async (request, response) => {
    applyAdminSecurityHeaders(response);
    const code = typeof request.query.code === 'string' ? request.query.code : '';
    if (!dependencies.handoffStore || !code) {
      response.redirect('/admin/login');
      return;
    }
    const claims = await dependencies.handoffStore.consume(code);
    if (!claims) {
      response.redirect('/admin/login');
      return;
    }
    response.setHeader('Set-Cookie', dependencies.auth.createSession(claims));
    response.redirect(adminRoutes.liveFeed);
  });

  app.options(adminRoutes.tokenExchange, (_request, response) => {
    applyTokenExchangeCors(_request, response, dependencies.clientOrigin);
    response.status(204).end();
  });

  app.post(
    adminRoutes.tokenExchange,
    express.urlencoded({ extended: false }),
    async (request, response) => {
      applyTokenExchangeCors(request, response, dependencies.clientOrigin);
      if (dependencies.enableLegacyLaravelAdminAuth === false) {
        response.status(404).end();
        return;
      }
      const token = bearerToken(request.get('authorization')) ?? tokenFromBody(request.body);
      if (!token) {
        response
          .status(401)
          .json({ error: 'invalid_admin_token', message: 'A Laravel admin token is required.' });
        return;
      }

      try {
        const claims = dependencies.tokenVerifier.verify(token);
        let replayResult;
        try {
          replayResult = await dependencies.replayConsumer.consume(
            claims.jti,
            new Date(claims.exp * 1000),
          );
        } catch (error) {
          console.error('Admin token replay protection is unavailable.', {
            message: error instanceof Error ? error.message : String(error),
          });
          throw new ApplicationError(
            'Admin token replay protection is unavailable.',
            503,
            'admin_token_replay_unavailable',
            { cause: error },
          );
        }

        if (replayResult.outcome === 'already_consumed') {
          response.status(401).json({
            error: 'invalid_admin_token',
            message: 'Invalid admin token.',
          });
          return;
        }

        response.setHeader('Set-Cookie', dependencies.auth.createSession());
        response.redirect(adminRoutes.liveFeed);
      } catch (error) {
        const statusCode = error instanceof ApplicationError ? error.statusCode : 401;
        response.status(statusCode).json({
          error: error instanceof ApplicationError ? error.code : 'invalid_admin_token',
          message:
            statusCode >= 500 ? 'Admin token verification is unavailable.' : 'Invalid admin token.',
        });
      }
    },
  );

  app.post(
    '/admin/auth/system-token',
    express.urlencoded({ extended: false }),
    async (request, response) => {
      if (
        dependencies.enableSystemAdminAuth === false ||
        !dependencies.systemTokenVerifier ||
        !dependencies.handoffStore
      ) {
        response.status(404).end();
        return;
      }
      const token = bearerToken(request.get('authorization'));
      if (!token) {
        response
          .status(401)
          .json({ error: 'invalid_admin_token', message: 'Invalid admin token.' });
        return;
      }
      try {
        const claims = dependencies.systemTokenVerifier.verify(token);
        const replayResult = await dependencies.replayConsumer.consume(
          claims.jti,
          new Date(claims.exp * 1000),
        );
        if (replayResult.outcome === 'already_consumed') {
          response
            .status(401)
            .json({ error: 'invalid_admin_token', message: 'Invalid admin token.' });
          return;
        }
        const handoffCode = await dependencies.handoffStore.create(
          sessionClaims(claims),
          new Date(claims.exp * 1000),
        );
        response.json({ handoffCode });
      } catch (error) {
        const statusCode = error instanceof ApplicationError ? error.statusCode : 401;
        response.status(statusCode).json({
          error: error instanceof ApplicationError ? error.code : 'invalid_admin_token',
          message:
            statusCode >= 500 ? 'Admin token verification is unavailable.' : 'Invalid admin token.',
        });
      }
    },
  );

  app.post('/admin/logout', (_request, response) => {
    applyAdminSecurityHeaders(response);
    response.setHeader('Set-Cookie', dependencies.auth.clearCookie());
    response.redirect('/admin/login');
  });

  app.get(adminRoutes.liveFeed, (request, response, next) => {
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

function sessionClaims(claims: AdminTokenClaims) {
  return {
    sub: claims.sub,
    role: claims.role ?? 'SystemAdministrator',
    permissions: claims.permissions ?? [],
  };
}

function bearerToken(authorization: string | undefined): string | undefined {
  if (!authorization?.startsWith('Bearer ')) return undefined;
  const token = authorization.slice('Bearer '.length).trim();
  return token || undefined;
}

function tokenFromBody(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const token = (body as { token?: unknown }).token;
  return typeof token === 'string' && token.length > 0 ? token : undefined;
}

function applyTokenExchangeCors(request: Request, response: Response, allowedOrigin: string): void {
  if (request.get('origin') !== allowedOrigin) return;
  response.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  response.setHeader('Access-Control-Allow-Credentials', 'true');
  response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.setHeader('Vary', 'Origin');
}
