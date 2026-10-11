import { describe, expect, it } from 'vitest';
import { describeMongoUri } from '../src/bills/mongo';

describe('describeMongoUri', () => {
  it('summarizes a connection string without revealing the password', () => {
    const summary = describeMongoUri(
      'mongodb+srv://berguntin:s3cr%40t@cluster0.abc.mongodb.net/?appName=Cluster0',
    );

    expect(summary).toBe(
      'scheme=mongodb+srv user="berguntin" passwordLength=6 host=cluster0.abc.mongodb.net pathDatabase="" authSource=(default)',
    );
    expect(summary).not.toContain('s3cr');
  });

  it('flags common copy-paste mistakes', () => {
    expect(describeMongoUri('mongodb+srv://me:<db_password>@c.mongodb.net/')).toContain(
      'leftover placeholder',
    );
    expect(describeMongoUri(' mongodb+srv://me:pw@c.mongodb.net/ ')).toContain('whitespace');
    expect(describeMongoUri('mongodb+srv://me:50%off@c.mongodb.net/')).toContain('stray %');
    expect(describeMongoUri('not a uri')).toContain('not a valid URL');
  });
});
