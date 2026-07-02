// Proxy SOMENTE-LEITURA para o app "ficha-exames" (integração das fichas de exame).
// Permite que o app de evolução leia as fichas salvas no app separado ficha-exames,
// sem compartilhar storage. Encaminha apenas list e load (GET).
const REMOTE = (process.env.FICHA_EXAMES_URL || 'https://ficha-exames.vercel.app').replace(/\/+$/, '');

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const { action, id } = req.query || {};
  try {
    let url;
    if (action === 'list') {
      url = `${REMOTE}/api/fichas?action=list&cb=${Date.now()}`;
    } else if (action === 'load' && id) {
      url = `${REMOTE}/api/fichas?action=load&id=${encodeURIComponent(id)}&cb=${Date.now()}`;
    } else {
      return res.status(400).json({ error: 'Ação inválida (use list ou load).' });
    }
    const r = await fetch(url, { cache: 'no-store' });
    const data = await r.json().catch(() => null);
    if (!r.ok) return res.status(r.status).json(data || { error: `HTTP ${r.status}` });
    return res.status(200).json(data);
  } catch (e) {
    return res.status(502).json({ error: 'ficha-exames indisponível: ' + e.message });
  }
}
