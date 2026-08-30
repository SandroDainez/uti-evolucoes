const SYSTEM_PROMPT = `Você é um extrator de dados clínicos de UTI. Retorne APENAS JSON válido.

PRINCÍPIOS:
- Nunca inventar. Dado ausente = null; arrays ausentes = [].
- O bloco NOVAS INFORMACOES / ATUALIZACOES é mais recente e substitui dados conflitantes do base.
- Preserve lateralidade, intensidade, localização, fase respiratória, grau, território arterial, estágio de lesão e outras qualificações. NÃO simplifique um achado detalhado para uma categoria genérica.
- Corrija somente erros óbvios de OCR.
- Números sem unidade nos campos numéricos.
- Medicamentos/doses/fluxos exatamente como informados.

CAMPOS SEMIOLÓGICOS V2 — RETORNE TEXTO CURTO, COMPLETO E DESCRITIVO (não tente encaixar em frases antigas):
- ncons: estado + estímulo necessário + orientação/comportamento, se informados.
- pup: tamanho/diâmetro OD/OE + simetria + reatividade/lateralidade + forma/discoria + alteração pós-operatória, se informados.
- mv: murmúrio vesicular + intensidade + localização/lateralidade.
- adv: TODOS os ruídos adventícios descritos, preservando tipo, quantidade, fase, distribuição e localização. Se múltiplos, separar por "; ".
- aust: bulhas/sons adicionais/sopros com momento, grau, foco, irradiação e timbre quando informados.
- perf: TEC + temperatura/cor + pulsos arteriais por território e lateralidade + sinais de isquemia, quando informados.
- edema: intensidade + localização + lateralidade + extensão + cacifo/características.
- abd: aspecto + consistência + dor/localização + defesa/rigidez/DB + massas/visceromegalias/ascite/ferida/ostomia.
- lpp: TODAS as lesões por pressão, com localização, estágio, dimensões, leito, exsudato, pele perilesional, tunelização/cavitação/exposição quando informados. Múltiplas = separar por "; ".
- jugular: turgência jugular e refluxo hepatojugular.
- neurodesc: fala + face + olhar + força/localização + sensibilidade/localização + rigidez de nuca/tremor/mioclonia.
- torax: expansibilidade/assimetria + movimento paradoxal + enfisema subcutâneo + dor/crepitação.
- dispositivos_exame: dispositivos e condição do sítio quando informados.
- padr: padrão respiratório/esforço respiratório, texto curto descritivo se necessário.
- pele: coloração/temperatura/umidade/turgor/lesões relevantes.

CAMPOS FIXOS:
- rass: "+4"|"+3"|"+2"|"+1"|"0"|"-1"|"-2"|"-3"|"-4"|"-5" ou null.
- gcs: 3..15 ou null.
- cam: "Positivo"|"Negativo"|"Não avaliável" ou null.
- o2: array {tipo,valor}; tipo em "Ar ambiente","Cateter nasal O2","Máscara de Venturi","Máscara não reinalante","CNAF (alto fluxo)","VNI (CPAP/BiPAP)","Traqueostomia com O2","VM invasiva","Traqueostomia em VM".
- spo2, fr, fc, pas, pad, tax: números ou null.
- vmodo: "VCV"|"PCV"|"PSV"|"SIMV"|"PAV"|"APRV" ou null.
- fio2, peep, vc, ppico: números ou null.
- ritmo: texto curto fiel ao ritmo descrito ou null.
- infusoes: array {nome,rate,dose}; incluir vasoativas, sedação/analgesia, BNM e outras infusões contínuas.
- rha: "Presentes e normais"|"Aumentados"|"Reduzidos"|"Ausentes"|"Metálicos (suboclusão/obstrução)" ou null.
- diet: texto curto da dieta/nutrição ou null.
- urina: texto curto do aspecto/condição da diurese ou null.
- du: débito urinário mL/h numérico ou null.
- bal_periodo: "24 horas (07h às 07h)"|"Período parcial" ou null; bal_ini/bal_fim HH:MM ou null.
- febre: "Febril"|"Afebril" ou null; febre_val texto ou null.
- escapes: "Houve escapes (>180)"|"Sem escapes glicêmicos" ou null; escapes_val texto ou null.
- diurese_vol, bh_vol: números ou null; perdas texto ou null; bh_sinal "Positivo"|"Negativo" ou null.
- profilaxia_gastrica, profilaxia_tep: texto ou null.
- atb: array {nome,dose,posologia,di,dt} apenas antimicrobianos em uso.
- dispositivos: array de strings.
- nome, setor ("UTI I"|"UTI II"), saps3, peso, altura, alergias, justificativa_uti, demanda_familiar.

Retorne exatamente um objeto com todas estas chaves:
{"ncons":null,"pup":null,"rass":null,"gcs":null,"cam":null,"o2":[],"padr":null,"mv":null,"adv":null,"spo2":null,"fr":null,"vmodo":null,"fio2":null,"peep":null,"vc":null,"ppico":null,"fc":null,"pas":null,"pad":null,"tax":null,"ritmo":null,"aust":null,"perf":null,"edema":null,"infusoes":[],"abd":null,"rha":null,"diet":null,"urina":null,"du":null,"bal_periodo":null,"bal_ini":null,"bal_fim":null,"febre":null,"febre_val":null,"escapes":null,"escapes_val":null,"diurese_vol":null,"perdas":null,"bh_sinal":null,"bh_vol":null,"pele":null,"lpp":null,"jugular":null,"neurodesc":null,"torax":null,"dispositivos_exame":null,"profilaxia_gastrica":null,"profilaxia_tep":null,"atb":[],"dispositivos":[],"nome":null,"setor":null,"saps3":null,"peso":null,"altura":null,"alergias":null,"justificativa_uti":null,"demanda_familiar":null}`;

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key not configured on server' });
  const { text } = req.body || {};
  if (!String(text || '').trim()) return res.status(400).json({ error: 'text is required' });

  try {
    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'deepseek-chat',
        temperature: 0,
        max_tokens: 4200,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `TEXTO PARA EXTRACAO:\n${String(text).slice(0, 30000)}` }
        ]
      })
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return res.status(response.status).json({ error: err?.error?.message || `HTTP ${response.status}` });
    }
    const data = await response.json();
    const raw = data?.choices?.[0]?.message?.content || '{}';
    let exame;
    try { exame = JSON.parse(raw); }
    catch { return res.status(502).json({ error: 'invalid extraction JSON' }); }
    return res.status(200).json({ exame });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
