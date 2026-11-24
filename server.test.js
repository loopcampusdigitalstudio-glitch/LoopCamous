/* =========================================
   LoopCampus Backend — Tests
   Run with: node --test
   ========================================= */

import { test, expect } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { AddressInfo } from 'node:net';

// We'll start the server in-memory for testing
import app from '../server.js';

let server;
let baseUrl;

test('setup: start test server', async (t) => {
  // Use a test database file
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-secret';
  process.env.ADMIN_USERNAME = 'loopcampus.online';
  process.env.ADMIN_PASSWORD = 'loopcampus@2024';
  process.env.RAZORPAY_KEY_ID = 'rzp_test_mock';
  process.env.RAZORPAY_KEY_SECRET = 'test_secret';
  process.env.FRONTEND_URL = 'http://localhost:5500';

  server = app.listen(0, () => {
    const addr = server.address();
    baseUrl = `http://localhost:${addr.port}`;
  });

  await new Promise((resolve) => server.once('listening', resolve));
});

test('GET /api/health returns ok', async () => {
  const res = await fetch(`${baseUrl}/api/health`);
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.strictEqual(body.status, 'ok');
});

test('POST /api/admin/login with valid credentials returns token cookie', async () => {
  const res = await fetch(`${baseUrl}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'loopcampus.online', password: 'loopcampus@2024' }),
  });
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.ok(body.message);
  assert.ok(body.admin);
  assert.strictEqual(body.admin.email, 'loopcampus.online');

  // Check cookie is set
  const setCookie = res.headers.get('set-cookie');
  assert.ok(setCookie, 'Should set auth cookie');
  assert.ok(setCookie.includes('token='), 'Cookie should contain token');
  assert.ok(setCookie.includes('HttpOnly'), 'Cookie should be HttpOnly');
});

test('POST /api/admin/login with invalid credentials returns 401', async () => {
  const res = await fetch(`${baseUrl}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'loopcampus.online', password: 'wrongpassword' }),
  });
  assert.strictEqual(res.status, 401);
});

test('GET /api/admin/me without auth returns 401', async () => {
  const res = await fetch(`${baseUrl}/api/admin/me`, {
    headers: { 'Content-Type': 'application/json' },
  });
  assert.strictEqual(res.status, 401);
});

test('GET /api/admin/settings requires auth', async () => {
  const res = await fetch(`${baseUrl}/api/admin/settings`, {
    headers: { 'Content-Type': 'application/json' },
  });
  assert.strictEqual(res.status, 401);
});

test('GET /api/public/settings returns settings without auth', async () => {
  const res = await fetch(`${baseUrl}/api/public/settings`);
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.ok(body.hero_title);
});

test('GET /api/public/services returns published services', async () => {
  const res = await fetch(`${baseUrl}/api/public/services`);
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.ok(Array.isArray(body));
  // All returned services should be published
  for (const s of body) {
    assert.strictEqual(s.published, 1);
  }
});

test('GET /api/public/packs returns packs with features', async () => {
  const res = await fetch(`${baseUrl}/api/public/packs`);
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.ok(Array.isArray(body));
  for (const p of body) {
    assert.ok(Array.isArray(p.features));
  }
});

test('GET /api/public/team returns published team members', async () => {
  const res = await fetch(`${baseUrl}/api/public/team`);
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.ok(Array.isArray(body));
});

test('Admin CRUD: services', async () => {
  // Login first
  const loginRes = await fetch(`${baseUrl}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@loopcampus.online', password: 'admin123' }),
  });
  const cookies = loginRes.headers.get('set-cookie') || '';

  // Create service
  const createRes = await fetch(`${baseUrl}/api/admin/services`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookies,
    },
    body: JSON.stringify({
      title: 'Test Service',
      tag: 'Test',
      description: 'A test service',
      published: true,
    }),
  });
  assert.strictEqual(createRes.status, 201);
  const created = await createRes.json();
  assert.ok(created.id);

  // Read services
  const listRes = await fetch(`${baseUrl}/api/admin/services`, {
    headers: { Cookie: cookies },
  });
  assert.strictEqual(listRes.status, 200);
  const services = await listRes.json();
  assert.ok(services.some((s) => s.id === created.id));

  // Update service
  const updateRes = await fetch(`${baseUrl}/api/admin/services/${created.id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookies,
    },
    body: JSON.stringify({ title: 'Updated Test Service' }),
  });
  assert.strictEqual(updateRes.status, 200);

  // Delete service
  const deleteRes = await fetch(`${baseUrl}/api/admin/services/${created.id}`, {
    method: 'DELETE',
    headers: { Cookie: cookies },
  });
  assert.strictEqual(deleteRes.status, 200);
});

test('Admin CRUD: packs with features', async () => {
  // Login
  const loginRes = await fetch(`${baseUrl}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@loopcampus.online', password: 'admin123' }),
  });
  const cookies = loginRes.headers.get('set-cookie') || '';

  // Create pack
  const createRes = await fetch(`${baseUrl}/api/admin/packs`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookies,
    },
    body: JSON.stringify({
      name: 'Test Pack',
      price: '1,000',
      badge: '',
      features: ['Feature 1', 'Feature 2'],
      published: true,
    }),
  });
  assert.strictEqual(createRes.status, 201);
  const created = await createRes.json();
  assert.ok(created.id);

  // Read packs with features
  const listRes = await fetch(`${baseUrl}/api/admin/packs`, {
    headers: { Cookie: cookies },
  });
  assert.strictEqual(listRes.status, 200);
  const packs = await listRes.json();
  const pack = packs.find((p) => p.id === created.id);
  assert.ok(pack);
  assert.strictEqual(pack.features.length, 2);

  // Delete pack
  const deleteRes = await fetch(`${baseUrl}/api/admin/packs/${created.id}`, {
    method: 'DELETE',
    headers: { Cookie: cookies },
  });
  assert.strictEqual(deleteRes.status, 200);
});

test('Admin CRUD: team members', async () => {
  const loginRes = await fetch(`${baseUrl}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@loopcampus.online', password: 'admin123' }),
  });
  const cookies = loginRes.headers.get('set-cookie') || '';

  const createRes = await fetch(`${baseUrl}/api/admin/team`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookies,
    },
    body: JSON.stringify({
      name: 'Test Member',
      role: 'Test Role',
      description: 'A test member',
      published: true,
    }),
  });
  assert.strictEqual(createRes.status, 201);
  const created = await createRes.json();
  assert.ok(created.id);

  const deleteRes = await fetch(`${baseUrl}/api/admin/team/${created.id}`, {
    method: 'DELETE',
    headers: { Cookie: cookies },
  });
  assert.strictEqual(deleteRes.status, 200);
});

test('Settings update requires auth', async () => {
  const res = await fetch(`${baseUrl}/api/admin/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hero_title: 'Hacked' }),
  });
  assert.strictEqual(res.status, 401);
});

test('teardown: close server', async () => {
  await new Promise((resolve) => server.close(resolve));
});
