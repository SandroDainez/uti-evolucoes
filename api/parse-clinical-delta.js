const SYSTEM_PROMPT = `Você é um extrator clínico de UTI. Sua função NÃO é redigir a evolução. Sua função é comparar fontes e devolver um DELTA CLÍNICO estruturado, fiel ao que foi informado.

REGRAS ABSOLUTAS:
1. Nunca invente fatos, doses, datas, diagnósticos ou condutas.
2. NOVAS INFORMAÇÕES são temporalmente mais recentes que DADOS BASE e substituem valores conflitantes do mesmo parâmetro.
3. Não considere um diagnóstico resolvido só porque não foi citado de novo. Só marque RESOLVIDO/REMOVIDO quando houver evidência explícita de resolução, exclusão diagnóstica ou mudança inequívoca documentada.
4. Separe fato explícito de inferência clínica. Inferências plausíveis vão somente em diagnosticos_sugeridos, nunca em diagnosticos_adicionar.
5. Uma conduta deve ir para condutas_adicionar/ajustar/suspender somente se estiver explicitamente descrita como realizada, iniciada, ajustada, mantida, suspensa ou planejada. Sugestões suas NÃO são condutas realizadas.
6. Quando uma nova informação muda um diagnóstico ou uma conduta anterior, registre o conflito/reavaliação.
7. Preserve os termos do prontuário. Corrija apenas erros óbvios de OCR.
8. Não gere CID. Não gere texto prolixo.
9. Evidência deve ser uma citação curta/paráfrase fiel do dado que justifica o item.
10. Se nada mudou em uma categoria, retorne array vazio.

RETORNE APENAS JSON VÁLIDO com este formato:
{
  "fatos_novos": [{"fato":"...","evidencia":"...","fonte":"novas|anexo|base|atualizacao"}],
  "sinais_vitais_e_parametros": [{"parametro":"...","valor":"...","fonte":"..."}],
  "diagnosticos_adicionar": [{"diagnostico":"...","status":"ativo|suspeito","evidencia":"..."}],
  "diagnosticos_reavaliar": [{"diagnostico":"...","motivo":"...","evidencia":"..."}],
  "diagnosticos_resolvidos_ou_excluidos": [{"diagnostico":"...","evidencia":"..."}],
  "diagnosticos_sugeridos": [{"diagnostico":"...","motivo":"...","evidencia":"..."}],
  "condutas_adicionar": [{"conduta":"...","evidencia":"..."}],
  "condutas_ajustar": [{"conduta":"...","de":"...","para":"...","evidencia":"..."}],
  "condutas_suspender": [{"conduta":"...","evidencia":"..."}],
  "medicacoes_atuais": [{"medicacao":"...","dose_ou_velocidade":"...","status":"iniciada|mantida|ajustada|suspensa|em_uso","evidencia":"..."}],
  "intercorrencias": [{"evento":"...","evidencia":"..."}],
  "exames_relevantes_novos": [{"exame":"...","resultado":"...","data":"...","evidencia":"..."}],
  "conflitos_temporais": [{"antigo":"...","novo":"...","regra":"usar_novo","evidencia":"..."}],
  "pendencias_explicitas": [{"pendencia":"...","evidencia":"..."}],
  "resumo_operacional":"uma frase curta dizendo o que obrigatoriamente precisa mudar na evolução, sem acrescentar fatos"
}`;

function clip(v, max = 18000) {
  const s = String(v || '');
  return s.length > max ? s.slice(0, max) + '\n[TRUNCADO]' : s;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key not configured on server' });

  const { base = '', newInfo = '', attachments = '', currentEvolution = '', mode = 'initial' } = req.body || {};
  if (![base, newInfo, attachments, currentEvolution].some(x => String(x || '').trim())) {
    return res.status(400).json({ error: 'clinical context is required' });
  }

  const user = `MODO: ${mode}\n\nDADOS BASE / EVOLUÇÃO ANTERIOR:\n${clip(base)}\n\nEVOLUÇÃO ATUAL JÁ GERADA (se houver):\n${clip(currentEvolution)}\n\nNOVAS INFORMAÇÕES / ATUALIZAÇÃO DO MÉDICO — PRIORIDADE TEMPORAL MÁXIMA:\n${clip(newInfo)}\n\nANEXOS / OCR:\n${clip(attachments, 12000)}`;

  try {
    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'deepseek-chat',
        temperature: 0,
        max_tokens: 3200,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: user }
        ]
      })
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return res.status(response.status).json({ error: err?.error?.message || `HTTP ${response.status}` });
    }
    const data = await response.json();
    const raw = data?.choices?.[0]?.message?.content || '{}';
    let delta;
    try { delta = JSON.parse(raw); }
    catch { return res.status(502).json({ error: 'invalid clinical delta JSON' }); }
    return res.status(200).json({ delta });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
