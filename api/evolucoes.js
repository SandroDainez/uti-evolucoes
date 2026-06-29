import { put, list, del } from '@vercel/blob';

// Cada evolução salva é um arquivo separado: evolucao/{id}.json
// (sem read-modify-write de um único JSON → sem condição de corrida).
const PREFIX = 'evolucao/';
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

// Resolve setor/leito a partir do ident ou do texto da evolução (fallback)
function setorOf(e) {
  const s = (e.ident && e.ident.setor) || '';
  if (s) return s;
  const m = (e.content || '').match(/UTI\s+GERAL\s+(II|I)\b/i);
  return m ? (m[1].toUpperCase() === 'II' ? 'UTI II' : 'UTI I') : '';
}
function leitoOf(e) {
  const l = (e.ident && e.ident.leito) || '';
  if (l) return l;
  const m = (e.content || '').match(/\(LEITO:\s*([^)\n]+)\)/i);
  if (!m) return '';
  const v = m[1].trim().replace(/[.;]+$/, '');
  return /COMPLEMENTAR|NAO INFORMAD/i.test(v) ? '' : v;
}

async function listAll() {
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
    // ── Listar (metadados, sem o conteúdo) ──
    if (req.method === 'GET' && action === 'list') {
      const evos = await listAll();
      evos.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      return res.status(200).json(evos.map(e => {
        const ident = e.ident || null;
        const setor = setorOf(e), leito = leitoOf(e);
        // expor tambem o setor/leito resolvidos dentro de ident (compat com o front)
        const identOut = { ...(ident || {}), setor: (ident && ident.setor) || setor, leito: (ident && ident.leito) || leito };
        return {
          id: e.id, patNome: e.patNome, tipo: e.tipo,
          dataEvo: e.dataEvo, sofa: e.sofa, ident: identOut, setor, leito,
          createdAt: e.createdAt,
        };
      }));
    }

    // ── Carregar uma evolução (com conteúdo) ──
    if (req.method === 'GET' && action === 'load') {
      const { id } = params;
      const blobs = await list({ prefix: `${PREFIX}${id}.json`, token: TOKEN() });
      if (!blobs.blobs.length) return res.status(404).json({ error: 'Evolução não encontrada' });
      const evo = await fetchJson(blobs.blobs[0].url);
      return res.status(200).json(evo);
    }

    // ── Salvar (cria ou atualiza APENAS este arquivo) ──
    if (req.method === 'POST' && action === 'save') {
      const { id, patNome, tipo, dataEvo, content, sofa, ident } = params;
      const now = new Date().toISOString();
      const recordId = id || (Date.now().toString() + Math.floor(Math.random() * 1000));

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
        tipo: tipo || '',
        dataEvo: dataEvo || '',        // data clínica da evolução (YYYY-MM-DD)
        sofa: (sofa === undefined ? null : sofa),
        ident: ident || null,          // identificação do paciente (leito, convênio, datas, SAPS, peso)
        content: content || '',
        createdAt, updatedAt: now,
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
      if (blobs.blobs.length) await del(blobs.blobs[0].url, { token: TOKEN() });
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: 'Ação inválida' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
