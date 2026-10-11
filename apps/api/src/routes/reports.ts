import express, { Router, type Request } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import type { ReportNotifier } from '../reports/github';
import { MAX_ATTACHMENT_BYTES, ReportInputSchema } from '../reports/schema';
import { REPORT_ID_PATTERN, type ReportStore } from '../reports/store';

/** Two photos in base64 plus context fit comfortably. */
const MAX_BODY_SIZE = '6mb';

function baseUrl(req: Request): string {
  return `${req.protocol}://${req.get('host') ?? 'localhost'}`;
}

export function createReportsRouter(store: ReportStore, notifier: ReportNotifier): Router {
  const router = Router();

  router.post(
    '/',
    rateLimit({
      windowMs: 60 * 60 * 1000,
      limit: 10,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      handler: (_req, res) => {
        res.status(429).json({ error: 'rate_limited' });
      },
    }),
    express.json({ limit: MAX_BODY_SIZE }),
    async (req, res) => {
      const parsed = ReportInputSchema.safeParse(req.body);
      if (!parsed.success) {
        const issues = z.flattenError(parsed.error);
        req.log.warn({ issues }, 'invalid report rejected');
        res.status(400).json({ error: 'invalid_report', issues });
        return;
      }

      const attachments = parsed.data.attachments.map((attachment) => ({
        kind: attachment.kind,
        mediaType: attachment.mediaType,
        data: Buffer.from(attachment.data, 'base64'),
      }));
      if (attachments.some((attachment) => attachment.data.length > MAX_ATTACHMENT_BYTES)) {
        res.status(413).json({ error: 'payload_too_large' });
        return;
      }

      const report = await store.create({ ...parsed.data, attachments });
      const links = {
        attachment: (index: number) =>
          `${baseUrl(req)}/api/reports/${report.id}/attachments/${index}?token=${report.accessToken}`,
      };
      const issueUrl = await notifier.notify(report, links);
      if (issueUrl) await store.setIssueUrl(report.id, issueUrl);

      // The description and email stay out of the logs; the issue has them.
      req.log.info(
        {
          report: {
            id: report.id,
            topic: report.topic,
            errorRef: report.context.errorRef,
            attachments: report.attachments.length,
            bill: report.bill !== undefined,
            issueUrl,
          },
        },
        'report received',
      );
      res.status(201).json({ id: report.id });
    },
  );

  router.get(
    '/:id/attachments/:index',
    async (req: Request<{ id: string; index: string }>, res) => {
      const { id, index } = req.params;
      const token = typeof req.query.token === 'string' ? req.query.token : '';
      const position = Number(index);
      if (!REPORT_ID_PATTERN.test(id) || !Number.isInteger(position) || !token) {
        res.status(404).json({ error: 'not_found' });
        return;
      }
      const attachment = await store.attachment(id, position, token);
      if (!attachment) {
        res.status(404).json({ error: 'not_found' });
        return;
      }
      res
        .type(attachment.mediaType)
        .set('Cache-Control', 'private, no-store')
        .set('Content-Disposition', `inline; filename="${id}-${attachment.kind}"`)
        .send(attachment.data);
    },
  );

  return router;
}
