/**
 * Authenticated HTTP boundary for filtered durable history and PDF downloads.
 */
import type { Express, Response } from 'express';
import PDFDocument from 'pdfkit';
import type {
  LiveFeedHistoryFilters,
  LiveFeedHistoryRow,
} from '../../../application/history/live-feed-history-types.js';
import { parseHistoryFilters, queryLiveFeedHistory } from '../../../application/history/query-live-feed-history.js';
import type { LiveFeedHistoryStore } from '../../../application/ports/live-feed-history-store.js';
import type { AdminAuth } from './admin-auth.js';
import { applyAdminSecurityHeaders } from './admin-security.js';

/**
 * Dependencies for authenticated history API and PDF routes.
 */
export type AdminHistoryRouteDependencies = {
  auth: AdminAuth;
  store: LiveFeedHistoryStore;
};

/**
 * Registers bounded, read-only history endpoints under the existing admin boundary.
 */
export function registerAdminHistoryRoutes(app: Express, dependencies: AdminHistoryRouteDependencies): void {
  app.get('/admin/api/history', async (request, response, next) => {
    applyAdminSecurityHeaders(response);
    if (!isAuthorized(request.get('cookie'), dependencies.auth)) {
      response.status(401).json({ error: 'admin_authorization_required', message: 'Admin authorization is required.' });
      return;
    }

    try {
      const filters = parseHistoryFilters(request.query);
      const result = await queryLiveFeedHistory(dependencies.store, filters);
      response.json({ ...result, displayTimezone: 'UTC' });
    } catch (error) {
      next(error);
    }
  });

  app.get('/admin/api/history.pdf', async (request, response, next) => {
    applyAdminSecurityHeaders(response);
    if (!isAuthorized(request.get('cookie'), dependencies.auth)) {
      response.status(401).json({ error: 'admin_authorization_required', message: 'Admin authorization is required.' });
      return;
    }

    try {
      const filters = parseHistoryFilters(request.query, new Date(), true);
      const result = await queryLiveFeedHistory(dependencies.store, filters);
      streamHistoryPdf(response, result.rows, filters, next);
    } catch (error) {
      next(error);
    }
  });
}

function isAuthorized(cookie: string | undefined, auth: AdminAuth): boolean {
  return auth.isAuthorizedCookie(cookie);
}

function streamHistoryPdf(
  response: Response,
  rows: LiveFeedHistoryRow[],
  filters: LiveFeedHistoryFilters,
  next: (error?: unknown) => void,
): void {
  const document = new PDFDocument({ size: 'A4', margin: 36 });
  const filename = `live-feed-history-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.pdf`;

  response.type('application/pdf');
  response.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  document.on('error', (error) => {
    if (response.headersSent) {
      response.destroy(error);
      return;
    }

    next(error);
  });
  response.on('close', () => {
    if (!response.writableFinished) {
      document.destroy();
    }
  });

  document.pipe(response);
  writeHistoryPdf(document, rows, filters);
  document.end();
}

/**
 * Writes a compact, safe operational history report to a PDF document stream.
 */
export function writeHistoryPdf(
  document: PDFKit.PDFDocument,
  rows: LiveFeedHistoryRow[],
  filters: LiveFeedHistoryFilters,
): void {
  document.fontSize(18).text('Live Feed History Report');
  document.moveDown(0.5);
  document.fontSize(9).text(`Generated: ${new Date().toISOString()} UTC`);
  document.text(`Range: ${filters.from} to ${filters.to} UTC`);
  document.text(
    `Filters: auction=${filters.auctionId ?? 'all'}, event=${filters.eventType ?? 'all'}, outcome=${filters.outcome ?? 'all'}`,
  );
  document.text(`Returned: ${rows.length}`);
  document.moveDown(1);

  document.fontSize(9).text('Processed Time | Event Type | Auction ID | Version | Outcome', { underline: true });
  document.moveDown(0.25);

  for (const row of rows) {
    if (document.y > 760) {
      document.addPage();
    }

    document
      .fontSize(8)
      .text(
        [
          row.processedAt,
          row.eventType,
          row.auctionId ?? '-',
          row.aggregateVersion?.toString() ?? '-',
          row.outcome,
        ].join(' | '),
      );
  }
}
