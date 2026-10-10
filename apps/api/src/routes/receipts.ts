import express, { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { ACCEPTED_IMAGE_TYPES, type ImageMediaType, type ReceiptParser } from '../receipts/parser';

/** Phones send ~0.3 MB after client-side compression; this leaves room for uncompressed uploads. */
const MAX_IMAGE_SIZE = '6mb';

function isAcceptedType(value: string | undefined): value is ImageMediaType {
  return (ACCEPTED_IMAGE_TYPES as readonly string[]).includes(value ?? '');
}

export function createReceiptsRouter(
  parser: ReceiptParser,
  options: { requestsPer10Minutes: number },
): Router {
  const router = Router();

  router.post(
    '/parse',
    rateLimit({
      windowMs: 10 * 60 * 1000,
      limit: options.requestsPer10Minutes,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      handler: (_req, res) => {
        res.status(429).json({ error: 'rate_limited' });
      },
    }),
    express.raw({ type: [...ACCEPTED_IMAGE_TYPES], limit: MAX_IMAGE_SIZE }),
    async (req, res) => {
      const mediaType = req.headers['content-type']?.split(';')[0]?.trim().toLowerCase();
      if (!isAcceptedType(mediaType)) {
        res.status(415).json({ error: 'unsupported_media_type' });
        return;
      }
      if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
        res.status(400).json({ error: 'empty_image' });
        return;
      }

      // The image is only held in memory for this request and never stored.
      const outcome = await parser.parse({ data: req.body, mediaType });

      if (outcome.status === 'ok') {
        res.json({ receipt: outcome.receipt, issues: outcome.issues, model: outcome.model });
      } else {
        res.status(422).json({ error: outcome.status });
      }
    },
  );

  return router;
}
