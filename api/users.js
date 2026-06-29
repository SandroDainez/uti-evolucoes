import { put, list, del } from '@vercel/blob';
import crypto from 'crypto';

// Cada usuário é um arquivo separado: utiuser/{id}.json
// Elimina o read-modify-write de um único JSON (sem race condition / wipe).
const PREFIX = 'utiuser/';
const OLD_FILE = 'uti-users.json'; // formato antigo (migração)
const ADMIN_SECRET = (process.env.ADMIN_SECRET || 'uti-admin-2024').trim();
const TOKEN = () => process.env.BLOB_READ_WRITE_TOKEN;

function hashPassword(password) {
  return crypto.createHash('sha256').update(password + 'uti-salt-2024').digest('hex');
}

async function fetchJson(url) {
  const u = url + (url.includes('?') ? '&' : '?') + 'cb=' + Date.now();
  const res = await fetch(u, { headers: { 'Authorization': `Bearer ${TOKEN()}` }, cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function writeUser(u) {
  await put(`${PREFIX}${u.id}.json`, JSON.stringify(u), {
    access: 'private', token: TOKEN(), addRandomSuffix: false, allowOverwrite: true,
  });
}

// Migração única: distribui o arquivo antigo em arquivos individuais
async function migrateOldIfNeeded() {
  try {
    const old = await list({ prefix: OLD_FILE, token: TOKEN() });
    if (!old.blobs.length) return;
    const arr = await fetchJson(old.blobs[0].url);
    if (Array.isArray(arr)) {
      for (const u of arr) { if (u && u.id) await writeUser(u); }
    }
    await del(old.blobs[0].url, { token: TOKEN() });
  } catch (e) { console.error('Migração users:', e.message); }
}

async function readAllUsers() {
  await migrateOldIfNeeded();
  const blobs = await list({ prefix: PREFIX, token: TOKEN() });
  const items = await Promise.all(blobs.blobs.map(async b => {
    try { return await fetchJson(b.url); } catch { return null; }
  }));
  return items.filter(Boolean);
}

async function findUserById(id) {
  const blobs = await list({ prefix: `${PREFIX}${id}.json`, token: TOKEN() });
  if (!blobs.blobs.length) return null;
  return fetchJson(blobs.blobs[0].url);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');

  const { method } = req;
  const params = method === 'GET' ? (req.query || {}) : (req.body || {});
  const { action, adminSecret } = params;

  try {
    // ── LOGIN ──
    if (method === 'POST' && action === 'login') {
      const { username, password } = req.body;
      const users = await readAllUsers();
      const user = users.find(u =>
        u.username === username &&
        u.passwordHash === hashPassword(password) &&
        u.active !== false
      );
      if (!user) return res.status(401).json({ error: 'Usuário ou senha inválidos ou acesso bloqueado.' });
      return res.status(200).json({ ok: true, name: user.name, crm: user.crm, role: user.role || 'user' });
    }

    // ── REGISTER ──
    if (method === 'POST' && action === 'register') {
      const { username, password, name, crm } = req.body;
      if (!username || !password || !name) return res.status(400).json({ error: 'Campos obrigatórios.' });
      const users = await readAllUsers();
      if (users.find(u => u.username === username)) return res.status(409).json({ error: 'Usuário já existe.' });
      const isFirst = users.length === 0;
      // Se chamado pelo admin (adminSecret valido), pode criar ja ativo e com role escolhido
      const isAdminCall = adminSecret && adminSecret === ADMIN_SECRET;
      const user = {
        id: Date.now().toString() + Math.floor(Math.random() * 1000),
        username,
        passwordHash: hashPassword(password),
        name,
        crm: crm || '',
        role: isFirst ? 'admin' : (isAdminCall && req.body.role ? req.body.role : 'user'),
        active: isFirst ? true : (isAdminCall ? (req.body.active !== false) : false),
        createdAt: new Date().toISOString(),
      };
      await writeUser(user); // escreve SÓ este arquivo — nunca apaga os outros
      if (isFirst) return res.status(200).json({ ok: true, name, crm, role: 'admin' });
      if (isAdminCall) return res.status(200).json({ ok: true, id: user.id, active: user.active });
      return res.status(200).json({ ok: true, pending: true });
    }

    // ── LISTAR (admin) ──
    if (method === 'GET' && action === 'list') {
      if (adminSecret !== ADMIN_SECRET) return res.status(403).json({ error: 'Acesso negado.' });
      const users = await readAllUsers();
      users.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
      return res.status(200).json(users.map(u => ({
        id: u.id, username: u.username, name: u.name,
        crm: u.crm, role: u.role, active: u.active, createdAt: u.createdAt
      })));
    }

    // ── ATUALIZAR (admin) — lê e grava APENAS este usuário ──
    if (method === 'POST' && action === 'update') {
      if (adminSecret !== ADMIN_SECRET) return res.status(403).json({ error: 'Acesso negado.' });
      const { id, active, role, newPassword, name, crm } = req.body;
      const user = await findUserById(id);
      if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });
      if (active !== undefined) user.active = active;
      if (role !== undefined) user.role = role;
      if (name !== undefined) user.name = name;
      if (crm !== undefined) user.crm = crm;
      if (newPassword) user.passwordHash = hashPassword(newPassword);
      await writeUser(user);
      return res.status(200).json({ ok: true });
    }

    // ── REMOVER (admin) — remove APENAS este arquivo ──
    if (method === 'POST' && action === 'delete') {
      if (adminSecret !== ADMIN_SECRET) return res.status(403).json({ error: 'Acesso negado.' });
      const { id } = req.body;
      const blobs = await list({ prefix: `${PREFIX}${id}.json`, token: TOKEN() });
      if (blobs.blobs.length) await del(blobs.blobs[0].url, { token: TOKEN() });
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: 'Ação inválida.' });
  } catch (e) {
    return res.status(503).json({ error: 'Servidor ocupado, tente novamente. (' + e.message + ')' });
  }
}
