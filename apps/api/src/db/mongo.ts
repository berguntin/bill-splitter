import { MongoClient, type Db } from 'mongodb';
import type { Logger } from '../observability/logger';

export interface MongoConnection {
  db: Db;
  close(): Promise<void>;
}

/** Connects once for the whole API; every store shares this connection. */
export async function connectMongo(options: {
  uri: string;
  database: string;
  logger: Logger;
}): Promise<MongoConnection> {
  let client: MongoClient;
  try {
    client = await MongoClient.connect(options.uri);
  } catch (error) {
    options.logger.error(`Could not connect to MongoDB. ${describeMongoUri(options.uri)}`);
    throw error;
  }
  return { db: client.db(options.database), close: () => client.close() };
}

/**
 * Summarizes a connection string for logs without revealing the password, so
 * a misconfigured MONGODB_URI can be diagnosed from the host's logs.
 */
export function describeMongoUri(uri: string): string {
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return 'MONGODB_URI is not a valid URL; check for spaces, quotes or unescaped characters.';
  }

  const parts = [
    `scheme=${url.protocol.replace(/:$/, '')}`,
    `user=${JSON.stringify(safeDecode(url.username))}`,
    `passwordLength=${safeDecode(url.password).length}`,
    `host=${url.hostname}`,
    `pathDatabase=${JSON.stringify(url.pathname.replace(/^\//, ''))}`,
    `authSource=${url.searchParams.get('authSource') ?? '(default)'}`,
  ];
  const warnings = [];
  if (/[<>]/.test(uri)) warnings.push('contains < or >, likely a leftover placeholder');
  if (uri !== uri.trim()) warnings.push('has leading or trailing whitespace');
  if (/^["']|["']$/.test(uri.trim())) warnings.push('is wrapped in quotes');
  if (/%(?![0-9A-Fa-f]{2})/.test(url.password)) warnings.push('password has a stray %');
  return `${parts.join(' ')}${warnings.length ? ` WARNING: the URI ${warnings.join('; ')}.` : ''}`;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
