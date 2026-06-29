import { put, list, del } from '@vercel/blob';

// Cada ficha é um arquivo separado: labficha/{id}.json
// Isso elimina a condição de corrida do read-modify-write de um único JSON.
const PREFIX = 'labficha/';
const OLD_FILE = 'fichas/todas.json'; // formato antigo (migração)
const TOKEN = () => process.env.BLOB_READ_WRITE_TOKEN;

async function fetchJson(url) {
  const u = url + (url.includes('?') ? '&' : '?') + 'cb=' + Date.now();
  const res = await fetch(u, {
    headers: { 'Authorization': `Bearer ${TOKEN()}` },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Migração única: se existir o arquivo antigo, distribui em arquivos individuais
async function migrateOldIfNeeded() {
  try {
    const old = await list({ prefix: OLD_FILE, token: TOKEN() });
    if (!old.blobs.length) return;
    const arr = await fetchJson(old.blobs[0].url);
    if (Array.isArray(arr)) {
      for (const ficha of arr) {
        if (!ficha.id) continue;
        await put(`${PREFIX}${ficha.id}.json`, JSON.stringify(ficha), {
          access: 'private', token: TOKEN(), addRandomSuffix: false, allowOverwrite: true,
        });
      }
    }
    // Remover o arquivo antigo após migrar
    await del(old.blobs[0].url, { token: TOKEN() });
  } catch (e) {
    // Migração não deve quebrar operação normal
    console.error('Migração:', e.message);
  }
}

async function listAllFichas() {
  await migrateOldIfNeeded();
  const blobs = await list({ prefix: PREFIX, token: TOKEN() });
  const items = await Promise.all(
    blobs.blobs.map(async b => {
      try { return await fetchJson(b.url); }
      catch { return null; }
    })
  );
  return items.filter(Boolean);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const params = req.method === 'GET' ? (req.query || {}) : (req.body || {});
  const { action } = params;

  try {
    // ── Listar ──
    if (req.method === 'GET' && action === 'list') {
      const fichas = await listAllFichas();
      fichas.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
      return res.status(200).json(fichas.map(f => ({
        id: f.id, patNome: f.patNome, leito: f.leito,
        createdAt: f.createdAt, updatedAt: f.updatedAt,
      })));
    }

    // ── Carregar uma ficha ──
    if (req.method === 'GET' && action === 'load') {
      const { id } = params;
      const blobs = await list({ prefix: `${PREFIX}${id}.json`, token: TOKEN() });
      if (!blobs.blobs.length) return res.status(404).json({ error: 'Ficha não encontrada' });
      const ficha = await fetchJson(blobs.blobs[0].url);
      return res.status(200).json(ficha);
    }

    // ── Salvar (cria ou atualiza APENAS este arquivo) ──
    if (req.method === 'POST' && action === 'save') {
      const { id, patNome, leito, data } = params;
      const now = new Date().toISOString();
      const recordId = id || Date.now().toString();

      // Preservar createdAt se a ficha já existe
      let createdAt = now;
      if (id) {
        try {
          const existing = await list({ prefix: `${PREFIX}${id}.json`, token: TOKEN() });
          if (existing.blobs.length) {
            const prev = await fetchJson(existing.blobs[0].url);
            createdAt = prev.createdAt || now;
          }
        } catch {}
      }

      const record = {
        id: recordId,
        patNome: patNome || 'Sem nome',
        leito: leito || '',
        createdAt, updatedAt: now, data,
      };

      await put(`${PREFIX}${recordId}.json`, JSON.stringify(record), {
        access: 'private', token: TOKEN(), addRandomSuffix: false, allowOverwrite: true,
      });
      return res.status(200).json({ ok: true, id: recordId });
    }

    // ── Deletar (remove APENAS este arquivo) ──
    if (req.method === 'POST' && action === 'delete') {
      const { id } = params;
      const blobs = await list({ prefix: `${PREFIX}${id}.json`, token: TOKEN() });
      if (blobs.blobs.length) {
        await del(blobs.blobs[0].url, { token: TOKEN() });
      }
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: 'Ação inválida' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
