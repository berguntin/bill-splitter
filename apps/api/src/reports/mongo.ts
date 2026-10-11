import { Binary, type Db } from 'mongodb';
import {
  newAccessToken,
  newReportId,
  summarizeAttachments,
  tokensMatch,
  type ReportAttachment,
  type ReportStore,
  type StoredReport,
} from './store';

interface ReportDocument extends Omit<StoredReport, 'id' | 'attachments'> {
  _id: string;
  attachments: (StoredReport['attachments'][number] & { data: Binary })[];
}

/** Reports live in their own collection; a TTL index deletes them after the retention period. */
export async function createMongoReportStore(options: {
  db: Db;
  ttlMs: number;
}): Promise<ReportStore> {
  const reports = options.db.collection<ReportDocument>('reports');
  await reports.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });

  return {
    async create({ attachments, ...input }) {
      const createdAt = new Date();
      const id = newReportId();
      const summary = summarizeAttachments(attachments);
      const document: ReportDocument = {
        ...input,
        _id: id,
        createdAt,
        expiresAt: new Date(createdAt.getTime() + options.ttlMs),
        attachments: summary.map((attachment, index) => ({
          ...attachment,
          data: new Binary(attachments[index]!.data),
        })),
        accessToken: newAccessToken(),
      };
      await reports.insertOne(document);
      return {
        ...input,
        id,
        createdAt,
        expiresAt: document.expiresAt,
        attachments: summary,
        accessToken: document.accessToken,
      };
    },

    async attachment(id, index, accessToken): Promise<ReportAttachment | null> {
      const document = await reports.findOne({ _id: id, expiresAt: { $gt: new Date() } });
      if (!document || !tokensMatch(accessToken, document.accessToken)) return null;
      const attachment = document.attachments[index];
      if (!attachment) return null;
      return {
        kind: attachment.kind,
        mediaType: attachment.mediaType,
        data: Buffer.from(attachment.data.buffer),
      };
    },

    async setIssueUrl(id, issueUrl) {
      await reports.updateOne({ _id: id }, { $set: { issueUrl } });
    },
  };
}
