import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { loadConfig } from '../src/config';
import { testDependencies } from './helpers';

const config = loadConfig({ NODE_ENV: 'test' });

const input = {
  currency: 'eur',
  diners: [{ id: 'ana', name: 'Ana', color: 'coral' }],
  items: [{ name: 'Pizza', total: 1200, assignment: { mode: 'everyone' } }],
};

async function createBill(app = createApp(config, testDependencies())) {
  const response = await request(app).post('/api/bills').send({ bill: input });
  return { app, response };
}

describe('bills API', () => {
  it('creates a bill, filling in defaults for a minimal input', async () => {
    const { response } = await createBill();

    expect(response.status).toBe(201);
    expect(response.body.ownerToken).toEqual(expect.any(String));
    expect(response.body.bill).toMatchObject({
      id: response.body.id,
      currency: 'EUR',
      adjustments: [],
      items: [
        {
          id: expect.any(String),
          name: 'Pizza',
          quantity: 1,
          unitPrice: 1200,
          total: 1200,
          assignment: { mode: 'everyone' },
        },
      ],
    });
  });

  it('serves the bill publicly, without the owner token', async () => {
    const { app, response: created } = await createBill();

    const response = await request(app).get(`/api/bills/${created.body.id}`);

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-cache');
    expect(response.body).toMatchObject({ id: created.body.id, version: 1 });
    expect(JSON.stringify(response.body)).not.toContain(created.body.ownerToken);
  });

  it('answers 304 while the bill has not changed', async () => {
    const { app, response: created } = await createBill();
    const first = await request(app).get(`/api/bills/${created.body.id}`);

    const second = await request(app)
      .get(`/api/bills/${created.body.id}`)
      .set('If-None-Match', first.headers.etag!);

    expect(second.status).toBe(304);
  });

  it('lets only the owner update the bill', async () => {
    const { app, response: created } = await createBill();
    const path = `/api/bills/${created.body.id}`;
    const changed = { ...input, merchant: 'Casa Lola' };

    expect((await request(app).put(path).send({ bill: changed })).status).toBe(401);
    expect(
      (await request(app).put(path).set('Authorization', 'Bearer wrong').send({ bill: changed }))
        .status,
    ).toBe(403);

    const updated = await request(app)
      .put(path)
      .set('Authorization', `Bearer ${created.body.ownerToken}`)
      .send({ bill: changed });
    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({ version: 2, bill: { merchant: 'Casa Lola' } });
  });

  describe('groups', () => {
    const table = {
      ...input,
      diners: [
        { id: 'ana', name: 'Ana', color: 'coral' },
        { id: 'ben', name: 'Ben', color: 'teal' },
        { id: 'cleo', name: 'Cleo', color: 'amber' },
      ],
    };

    async function sharedTable() {
      const app = createApp(config, testDependencies());
      const created = await request(app).post('/api/bills').send({ bill: table });
      return { app, id: created.body.id as string, token: created.body.ownerToken as string };
    }

    it('lets anyone with the link say who pays together', async () => {
      const { app, id } = await sharedTable();

      const response = await request(app)
        .put(`/api/bills/${id}/groups`)
        .send({ groups: [{ id: 'g1', dinerIds: ['ana', 'ben'] }] });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        version: 2,
        bill: { groups: [{ id: 'g1', dinerIds: ['ana', 'ben'] }] },
      });
      const read = await request(app).get(`/api/bills/${id}`);
      expect(read.body.bill.groups).toEqual([{ id: 'g1', dinerIds: ['ana', 'ben'] }]);
    });

    it("keeps guests' groups when the owner saves an older copy", async () => {
      const { app, id, token } = await sharedTable();
      await request(app)
        .put(`/api/bills/${id}/groups`)
        .send({ groups: [{ id: 'g1', dinerIds: ['ana', 'ben'] }] });

      const saved = await request(app)
        .put(`/api/bills/${id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ bill: { ...table, merchant: 'Casa Lola', groups: [] } });

      expect(saved.body.bill).toMatchObject({
        merchant: 'Casa Lola',
        groups: [{ id: 'g1', dinerIds: ['ana', 'ben'] }],
      });
    });

    it('hides members the owner removed', async () => {
      const { app, id, token } = await sharedTable();
      await request(app)
        .put(`/api/bills/${id}/groups`)
        .send({ groups: [{ id: 'g1', dinerIds: ['ana', 'ben'] }] });

      const saved = await request(app)
        .put(`/api/bills/${id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ bill: { ...table, diners: table.diners.filter((diner) => diner.id !== 'ben') } });

      expect(saved.body.bill.groups).toEqual([]);
    });

    it('rejects a diner in two groups, and unknown bills', async () => {
      const { app, id } = await sharedTable();
      const twice = await request(app)
        .put(`/api/bills/${id}/groups`)
        .send({
          groups: [
            { id: 'g1', dinerIds: ['ana', 'ben'] },
            { id: 'g2', dinerIds: ['ben', 'cleo'] },
          ],
        });
      expect(twice.status).toBe(400);

      const unknown = await request(app).put('/api/bills/Abc1234567/groups').send({ groups: [] });
      expect(unknown.status).toBe(404);
    });
  });

  it('rejects invalid bills', async () => {
    const app = createApp(config, testDependencies());
    const cases = [
      {},
      { bill: { items: [] } },
      { bill: { items: [{ name: 'Pizza', total: 12.5 }] } },
      { bill: { items: [{ name: '', total: 100 }] } },
      { bill: { items: [{ name: 'Pizza', total: 100, assignment: { mode: 'nobody' } }] } },
    ];
    for (const body of cases) {
      const response = await request(app).post('/api/bills').send(body);
      expect(response.status, JSON.stringify(body)).toBe(400);
      expect(response.body.error).toBe('invalid_bill');
    }
  });

  it('answers 404 for unknown or malformed ids', async () => {
    const app = createApp(config, testDependencies());
    expect((await request(app).get('/api/bills/Unknown123')).status).toBe(404);
    expect((await request(app).get('/api/bills/../../etc')).status).toBe(404);
    expect(
      (
        await request(app)
          .put('/api/bills/Unknown123')
          .set('Authorization', 'Bearer x')
          .send({ bill: input })
      ).status,
    ).toBe(404);
  });
});
