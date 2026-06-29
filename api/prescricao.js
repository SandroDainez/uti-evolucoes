import { put, list, del } from '@vercel/blob';

// Prescrições sugeridas por IA — um arquivo por registro: prescricao/{id}.json
const PREFIX = 'prescricao/';
const TOKEN = () => process.env.BLOB_READ_WRITE_TOKEN;
const DEEPSEEK_KEY = () => process.env.DEEPSEEK_API_KEY;

function norm(s) {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

// Fallbacks: extrair leito/setor do texto da evolucao quando o ident estiver vazio
function leitoFromContent(text) {
  const m = (text || '').match(/\(LEITO:\s*([^)\n]+)\)/i);
  if (!m) return '';
  const l = m[1].trim().replace(/[.;]+$/, '');
  return (!l || /COMPLEMENTAR|NAO INFORMAD/i.test(l)) ? '' : l;
}
function setorFromContent(text) {
  const m = (text || '').match(/UTI\s+GERAL\s+(II|I)\b/i);
  if (!m) return '';
  return m[1].toUpperCase() === 'II' ? 'UTI II' : 'UTI I';
}
function resolveLeitoSetor(ident, content) {
  return {
    leito: (ident && ident.leito) || leitoFromContent(content) || '',
    setor: (ident && ident.setor) || setorFromContent(content) || '',
  };
}

async function fetchJson(url) {
  const u = url + (url.includes('?') ? '&' : '?') + 'cb=' + Date.now();
  const res = await fetch(u, { headers: { 'Authorization': `Bearer ${TOKEN()}` }, cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Lê todos os registros de um prefixo
async function readAll(prefix) {
  const blobs = await list({ prefix, token: TOKEN() });
  const items = await Promise.all(blobs.blobs.map(async b => { try { return await fetchJson(b.url); } catch { return null; } }));
  return items.filter(Boolean);
}

// Mais recente de um paciente num prefixo (por updatedAt/createdAt)
async function latestForPatient(prefix, patNome) {
  const all = await readAll(prefix);
  const matches = all.filter(d => d && d.patNome && norm(d.patNome) === norm(patNome));
  if (!matches.length) return null;
  matches.sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0));
  return matches[0];
}

async function savePrescricao(p) {
  await put(`${PREFIX}${p.id}.json`, JSON.stringify(p), {
    access: 'private', token: TOKEN(), addRandomSuffix: false, allowOverwrite: true,
  });
}

async function getPrescricao(id) {
  const blobs = await list({ prefix: `${PREFIX}${id}.json`, token: TOKEN() });
  if (!blobs.blobs.length) return null;
  return fetchJson(blobs.blobs[0].url);
}

// ─── Prompt clínico (medicina intensiva adulto) ───
const SYSTEM_PROMPT = `Voce e um assistente clinico especializado em medicina intensiva adulto, gerando PRESCRICOES MEDICAS SUGERIDAS para UTI.

FILOSOFIA — PRESCRICAO MINIMALISTA ("less is more" / Choosing Wisely em UTI):
- Prescrever APENAS o que tem indicacao clinica REAL para ESTE caso especifico. Menos e mais.
- EVITAR condutas reflexas/rotineiras e medicacoes sem necessidade (reduz polifarmacia, interacoes, eventos adversos e custos) — SEM perder qualidade nem omitir o que e padrao de cuidado/seguranca (ex: profilaxia de TVP indicada).
- Para CADA item, exigir uma indicacao concreta ancorada na evolucao/exames. Na duvida sobre necessidade, marcar como "optional" e justificar, em vez de prescrever automaticamente.
- DES-PRESCREVER / questionar o que nao tem mais indicacao (ex: IBP sem indicacao, ATB a ser desescalonado, soro de manutencao em paciente euvolemico em dieta enteral plena, sedacao desnecessaria).
- No "reasoning", citar explicitamente o que foi DELIBERADAMENTE NAO prescrito/omitido e o porque (ex: "nao prescrito soro de manutencao por estar em dieta enteral plena e euvolemico").
- O medico ajustara conforme julgar necessario — entregue uma base ENXUTA e segura.

REGRAS ABSOLUTAS
1. NUNCA invente medicamentos, doses ou condutas inexistentes na literatura reconhecida.
2. SEMPRE cite a fonte de evidencia em cada bloco (ex: "SSC 2021", "PADIS 2018", "ARDSNet").
3. Se os dados forem insuficientes para uma recomendacao segura, OMITA e justifique no reasoning.
4. Alertas de seguranca OBRIGATORIOS para: ajuste renal (creatinina elevada), alergias mencionadas, interacoes relevantes.
5. Esta prescricao e SUGESTAO — o medico e quem decide e assina. Use SOMENTE dados fornecidos; nao invente diagnosticos/achados.

FONTES ACEITAS: Surviving Sepsis Campaign (SSC) 2021/2024; PADIS 2018; ARDSNet/Berlin; ADA; CHEST 2022/ISTH; ASPEN/ESPEN; IDSA/ESCMID; ANVISA/AMIB/SBA/CFM; AHA/ACC.

PROFILAXIAS — AVALIAR SEMPRE
- TVP/TEP (CHEST 2022/ISTH): paciente de UTI = risco ALTO. SEM contraindicacao hemorragica -> Enoxaparina 40mg SC 1x/dia (peso <120kg); obesidade (>=120kg) -> 40mg SC 12/12h. COM contraindicacao (plaquetas <50.000, INR >2, sangramento ativo) -> compressao pneumatica intermitente dos MMII, NAO anticoagular. Inferir contraindicacao pelos labs e pelo texto.
- Ulcera de stress (SSC 2021): indicada SE VM >48h OU coagulopatia (plaquetas <50k ou INR >1.5). Preferir Pantoprazol 40mg IV 1x/dia. NAO prescrever rotineiramente fora disso. Se dieta enteral plena e sem VM -> omitir/reavaliar.
- Delirium (PADIS 2018): NAO usar Haloperidol profilatico; medidas nao-farmacologicas; se sedacao, preferir Dexmedetomidina; evitar benzodiazepinico.

MONITORIZACAO (padrao UTI): SINAIS VITAIS (FC, PA, FR, SpO2, TEMPERATURA) de 2/2h por padrao (1/1h se instavel/DVA). Incluir tambem: diurese horaria, balanco hidrico, controle de PAM se em droga vasoativa, e RASS/escala de dor quando aplicavel.

CUIDADOS GERAIS — PADRAO DO SERVICO (incluir por padrao na MAIORIA dos pacientes, no bloco cuidados_gerais, salvo contraindicacao explicita):
- Salinizacao de acesso venoso 2/2h.
- Mudanca de decubito 2/2h.
- Colchao pneumatico continuo.
- Decubito (cabeceira) elevado 30-45 graus continuo.

OXIGENOTERAPIA (bloco oxigenoterapia — SOMENTE se o paciente NAO esta em ventilacao mecanica): ofertar O2 A CRITERIO MEDICO conforme alvo de SpO2 — opcoes: cateter nasal, mascara de Venturi ou mascara nao reinalante (escolher conforme FiO2 necessaria). NAO prescrever oxigenoterapia se em VM.

FISIOTERAPIA (bloco fisioterapia): fisioterapia MOTORA E RESPIRATORIA 3x/dia (padrao do servico), salvo contraindicacao.

CONTROLE GLICEMICO (ADA/SSC 2021; em UTI a preocupacao PRINCIPAL e HGT >180):
- FREQUENCIA DA GLICEMIA CAPILAR (HGT): NAO usar frequencia fixa. INDIVIDUALIZAR conforme a ESTABILIDADE GLICEMICA e o caso clinico: 1/1h se muitos escapes ou insulina EV continua; intervalos maiores (4/4h, 6/6h, ate 8/8h) quanto MAIS ESTAVEL a glicemia; e alguns pacientes (sem DM, sem hiperglicemia, sem fatores de risco) podem NAO necessitar de controle glicemico. Definir a frequencia conforme a situacao clinica descrita na evolucao e justificar.
- HIPOGLICEMIA (HGT <70 mg/dL): GLICOSE 50% 4 AMPOLAS IV e reavaliar/repetir HGT (item obrigatorio quando ha controle glicemico).
- HIPERGLICEMIA — corrigir SOMENTE quando HGT >180. Esquema de correcao com insulina regular SC: 181-220 -> 2 UI; 221-260 -> 4 UI; 261-300 -> 6 UI; 301-350 -> 8 UI; >350 -> 10 UI e comunicar; considerar insulina regular IV em bomba se hiperglicemia persistente/refrataria.
- INSULINA BASAL — quando houver ESCAPES RECORRENTES (varios HGT >180 no dia ou necessidade repetida de correcao), SUGERIR (ai_flag "optional", baseado em evidencia): insulina NPH (geralmente 12/12h) OU analogo de LONGA DURACAO (ex: glargina 1x/dia), titulada conforme as glicemias. Justificar que regime basal/basal-bolus e preferivel a sliding-scale isolada (ADA/Endocrine Society). NAO inventar doses fixas sem base — sugerir inicio conservador e titulacao.
- Alvo 140-180 mg/dL. Incluir bloco controle_glicemico quando houver indicacao (DM, hiperglicemia, sepse, corticoide, nutricao, instabilidade), com HGT em frequencia INDIVIDUALIZADA + tratamento de hipoglicemia (Glicose 50% 4 amp) + esquema de correcao >180. Se o caso claramente nao precisa de controle glicemico, pode omitir. Aparecer UMA SO VEZ.

MEDICACOES ADJUVANTES / SINTOMATICOS (SOS) — bloco "adjuvantes": incluir, marcadas como SOS/se necessario (ai_flag "optional"), conforme o caso: antitermico (Dipirona 1g IV 6/6h SOS se Tax >37.8C, ou Paracetamol); antiemetico (Ondansetrona 4-8mg IV SOS, ou Metoclopramida); analgesico de resgate (conforme dor); laxante/proctolitico se constipacao; protetor de mucosa ocular se sedado. Nao prescrever o que nao se aplica ao caso.

NUTRICAO (ASPEN 2022/ESPEN 2023): UTI+VM -> enteral precoce (24-48h) se hemodinamicamente estavel; prona pode manter com precaucoes; vasopressor em dose alta -> cautela (isquemia intestinal); calorias 25 kcal/kg/dia (aguda), 25-30 (estavel).

VENTILACAO MECANICA: se VM no texto, sugerir modo, FiO2, PEEP, volume corrente (6 mL/kg peso predito em SDRA, ARDSNet), FR, alarmes.
SEDOANALGESIA: analgesia-first (PADIS 2018).

ESTRUTURA DE SAIDA — responda EXCLUSIVAMENTE um objeto JSON valido (sem markdown, sem texto fora do JSON), no formato:
{
  "reasoning": "raciocinio clinico em 3-5 paragrafos: problemas identificados, decisoes, evidencias aplicadas, limitacoes dos dados",
  "alerts": ["alertas de seguranca, ex: 'AJUSTE RENAL: creatinina 2.8 — revisar doses de antimicrobianos'"],
  "blocks": [
    {
      "id": "slug-unico",
      "category": "um de: dieta|monitorizacao|cuidados_gerais|controle_glicemico|fisioterapia|oxigenoterapia|ventilacao_mecanica|sedoanalgesia|drogas_vasoativas|hidratacao|reposicao_volemica|antimicrobianos|profilaxias|adjuvantes|outros",
      "label": "Nome legivel em portugues",
      "ai_justified": true,
      "evidence_source": "fonte principal",
      "items": [
        { "id": "slug-item", "drug_or_item": "nome", "dose": "valor", "unit": "unidade", "route": "via", "frequency": "frequencia", "infusion_rate": "se infusao", "duration": "se limitada", "notes": "observacoes", "ai_flag": "recommended|optional|alert", "evidence": "referencia" }
      ]
    }
  ]
}

REGRA ANTI-DUPLICATA: cada categoria aparece NO MAXIMO UMA VEZ na prescricao. NUNCA repita um bloco (ex: nao gerar dois blocos "controle_glicemico"). Consolide tudo de uma mesma categoria num UNICO bloco.

DESPERTAR DIARIO / INTERRUPCAO DIARIA DA SEDACAO (SAT — PADIS 2018 / bundle ABCDEF / SSC): para pacientes em VM E SEDADOS, AVALIAR pela EVOLUCAO REAL se ha indicacao e seguranca para despertar diario HOJE. INDICAR apenas se as condicoes clinicas permitem: hemodinamicamente estavel, vasopressor ausente ou em dose baixa/estavel (nao em escalonamento), oxigenacao adequada (sem FiO2/PEEP muito elevados / SDRA grave), sem bloqueador neuromuscular, sem hipertensao intracraniana, sem estado de mal epileptico, sem isquemia miocardica ativa. NAO INDICAR (contraindicado) se: instabilidade hemodinamica, vasopressor em dose alta/escalonamento, hipoxemia grave / SDRA grave / prona, BNM em uso, HIC, status epileptico, dependencia ventilatoria total ou outra condicao que exija sedacao profunda. No bloco sedoanalgesia, para CADA paciente em VM sedado, DECLARAR explicitamente se o despertar diario esta INDICADO HOJE ou NAO, com a justificativa baseada no quadro. NUNCA indicar despertar em paciente instavel/dependente total do ventilador.

TESTE DE RESPIRACAO ESPONTANEA (TRE/SBT) E PRONTIDAO PARA EXTUBACAO (no bloco ventilacao_mecanica): para TODO paciente em VM, AVALIAR pela EVOLUCAO REAL se ha criterios para TRE/desmame HOJE. CRITERIOS para indicar TRE (literatura — SCCM/ATS, PADIS): causa da insuf. respiratoria resolvida/em melhora; oxigenacao adequada (PaO2/FiO2 > ~150-200, FiO2 <= 0,4-0,5, PEEP <= 5-8); estabilidade hemodinamica (sem vasopressor ou dose baixa/estavel); nivel de consciencia adequado e capacidade de proteger via aerea; tosse eficaz e secrecao manejavel; sem acidose grave. Se PREENCHE criterios -> INDICAR TRE (PSV baixa ou tubo-T por 30-120 min). Se passar no TRE E (paciente INTUBADO) com via aerea protegida, tosse adequada, secrecao controlada -> sugerir EXTUBACAO. Se TRAQUEOSTOMIZADO -> falar em DESMAME progressivo / decanulacao (nao "extubacao"). Se NAO preenche criterios -> dizer que NAO ha indicacao de TRE/extubacao HOJE e o porque (ex: FiO2/PEEP altos, vasopressor em dose alta, rebaixamento, secrecao abundante). Declarar SEMPRE, para cada paciente em VM, se TRE/extubacao (ou desmame/decanulacao) esta indicado hoje ou nao.

BLOCOS ESSENCIAIS (incluir, UMA vez cada — base segura da UTI): monitorizacao, cuidados_gerais, dieta/nutricao, fisioterapia, profilaxias (incluir SO as indicadas — TVP quase sempre; gastrica so se VM>48h/coagulopatia; NAO prescrever profilaxia sem indicacao).
BLOCOS CONDICIONAIS (incluir SOMENTE com indicacao real do caso — filosofia minimalista; UMA vez cada): hidratacao (SO se necessaria — NAO prescrever soro de manutencao rotineiro em paciente euvolemico/dieta enteral plena); controle_glicemico (conforme indicacao — DM, hiperglicemia, sepse, corticoide, nutricao; HGT em frequencia individualizada; pode omitir se desnecessario); adjuvantes (SOS so o pertinente — febre, dor, nausea); oxigenoterapia (SO se NAO em VM); ventilacao_mecanica (VM no texto — incluir despertar diario/SAT, TRE/SBT e prontidao para EXTUBACAO conforme abaixo); sedoanalgesia (VM/agitacao); drogas_vasoativas (vasopressor no texto); antimicrobianos (infeccao no texto — considerar desescalonamento conforme cultura/evolucao); reposicao_volemica (sepse/choque/hipotensao no texto).`;

const REVIEW_SYSTEM_PROMPT = `Voce e um medico intensivista adulto REVISANDO criticamente a PRESCRICAO EM USO de um paciente de UTI, com filosofia MINIMALISTA ("less is more"/Choosing Wisely): so deve permanecer o que tem indicacao real para ESTE caso. Avalie CADA item: o que esta adequado, o que precisa AJUSTE e o que NAO e recomendado (incluindo itens DESNECESSARIOS que poderiam ser SUSPENSOS/des-prescritos) — sempre com justificativa baseada em evidencia. Aponte tambem o que esta FALTANDO (recomendacoes indicadas e ausentes). Marque como "nao_recomendado" itens sem indicacao (ex: IBP de rotina sem indicacao, soro de manutencao em euvolemico/dieta enteral plena, ATB a desescalonar, sedacao desnecessaria).

REGRAS ABSOLUTAS
1. No array "review", avalie SOMENTE itens que JA constam na prescricao fornecida — NUNCA invente itens que o medico nao prescreveu.
2. Use EXCLUSIVAMENTE os dados fornecidos (evolucao, exames, prescricao em uso). Se faltar dado para julgar com seguranca, diga isso no "reason" (nao invente).
3. Cite a fonte (SSC 2021, PADIS 2018, ARDSNet, CHEST 2022/ISTH, ADA, ASPEN/ESPEN, IDSA, AMIB/CFM) nos vereditos relevantes.
4. Esta revisao e SUGESTAO — a decisao e do medico assistente.

CRITERIOS (mesma base da geracao)
- Profilaxia TVP: UTI = risco alto; SEM contraindicacao -> enoxaparina 40mg SC/dia (>=120kg: 12/12h); COM contraindicacao (plaquetas <50k, INR >2, sangramento) -> compressao pneumatica, NAO anticoagular.
- Ulcera de stress: indicada SO se VM >48h OU coagulopatia (plaq <50k / INR >1.5); fora disso, questionar (IBP rotineiro aumenta risco de pneumonia).
- Sinais vitais de 2/2h (1/1h se instavel).
- Cuidados gerais padrao do servico: salinizacao de acesso 2/2h, mudanca de decubito 2/2h, colchao pneumatico continuo, cabeceira elevada 30-45 continua. Fisioterapia motora E respiratoria 3x/dia. Se NAO em VM, oxigenoterapia a criterio (cateter/Venturi/nao reinalante).
- Controle glicemico (foco em UTI = HGT >180): FREQUENCIA do HGT deve ser INDIVIDUALIZADA pela estabilidade (1/1h se muitos escapes/insulina EV; ate 8/8h se estavel; pode nao precisar se sem risco) — apontar se a frequencia prescrita esta adequada ao caso; alvo 140-180; HIPOGLICEMIA (<70) -> Glicose 50% 4 ampolas IV; correcao com insulina regular SC SO se HGT >180 (181-220:2UI; 221-260:4UI; 261-300:6UI; 301-350:8UI; >350:10UI+comunicar); insulina IV se persistente. Se ESCAPES RECORRENTES >180 -> sugerir insulina BASAL (NPH 12/12h ou longa duracao/glargina 1x/dia), pois basal/basal-bolus e preferivel a sliding-scale isolada (ADA).
- Despertar diario / SAT (PADIS 2018): se em VM sedado, avaliar pela EVOLUCAO se ha indicacao/seguranca — NAO indicar em instavel, vasopressor alto/escalonamento, SDRA grave/prona, BNM, HIC, status epileptico, dependencia ventilatoria total. Apontar se o que esta prescrito quanto a sedacao/despertar e adequado ao quadro.
- TRE/SBT e EXTUBACAO: se em VM, avaliar pela evolucao se ha criterios para teste de respiracao espontanea/desmame e extubacao (causa resolvida, PaO2/FiO2 adequada, FiO2/PEEP baixos, estavel, consciente, tosse/secrecao manejaveis). Apontar em "missing" se o desmame/TRE esta indicado e nao foi contemplado; se traqueostomizado, falar em desmame/decanulacao.
- Ajuste renal: se creatinina elevada, checar doses (ex: meropenem, vancomicina, enoxaparina).
- Sedacao: analgesia-first; evitar benzodiazepinico; nao usar haloperidol profilatico.
- Nutricao enteral precoce; cabeceira elevada 30-45 se VM/risco aspiracao.
- Doses/vias/frequencias corretas e seguras.

SAIDA — responda EXCLUSIVAMENTE JSON valido (sem markdown):
{
  "reasoning": "sintese da revisao em 2-4 paragrafos: principais problemas, prioridades, limitacoes dos dados",
  "alerts": ["alertas de seguranca criticos, ex: 'AJUSTE RENAL: creatinina 2.8 — reduzir dose de X'"],
  "review": [
    { "id": "slug", "item": "item como esta na prescricao (resuma se longo)", "verdict": "adequado|ajustar|nao_recomendado", "reason": "justificativa baseada em evidencia", "suggestion": "ajuste/alternativa concreta (se ajustar ou nao_recomendado; senao vazio)", "evidence": "fonte" }
  ],
  "missing": [
    { "id": "slug", "item": "recomendacao indicada e ausente", "reason": "por que e indicada neste caso", "suggestion": "como prescrever (droga, dose, via, frequencia)", "evidence": "fonte" }
  ]
}
Avalie TODOS os itens fornecidos. Nao invente itens inexistentes no array review.`;

const LAB_KEYS = ['GLICOSE','UREIA','CREATININA','NA','K','HB','PLAQUETAS','BT','PO2_ART','PCO2_ART','PH_ART','LACTATO','LEUCOCITOS','NEUTROFILOS','CALCIO','MAGNESIO','INR','TTPA','FIBRINOGENIO','PROCALCITONINA','PCR','BNP','TROPONINA','TGO','TGP'];

function buildUserMessage(content, ident, labs, labDates) {
  const latest = {};
  const labDate = (labDates && labDates['0']) || 'data nao informada';
  for (const k of LAB_KEYS) { const v = labs[`${k}_0`]; if (v && String(v).trim() !== '') latest[k] = v; }
  const labsTxt = Object.keys(latest).length ? Object.entries(latest).map(([k, v]) => `${k}: ${v}`).join('\n') : 'Nenhum exame disponivel na ficha';
  return `Gere uma prescricao medica completa para este paciente de UTI.

## IDENTIFICACAO
${JSON.stringify(ident || {}, null, 2)}

## EXAMES LABORATORIAIS MAIS RECENTES (${labDate})
${labsTxt}

## TEXTO DA ULTIMA EVOLUCAO (extraia diagnosticos, drogas, VM, vasopressores, condutas)
${content || '(sem conteudo)'}

Instrucoes:
- Extraia do texto: diagnosticos, medicamentos em uso, modo ventilatorio, vasopressores, estado neurologico.
- Use os labs para: ajuste renal (creatinina), plaquetas/INR para profilaxia TVP, controle glicemico.
- Peso em ident.weight — use para doses e nutricao.
- Verifique contraindicacao hemorragica para profilaxia TVP (plaquetas + INR + mencao de sangramento).
- Responda EXCLUSIVAMENTE com JSON valido.`;
}

// Mescla blocos repetidos da mesma categoria num único (evita controle_glicemico 2x etc.)
function dedupeBlocks(blocks) {
  const byCat = new Map();
  const order = [];
  for (const b of blocks) {
    if (!b || !b.category) continue;
    if (byCat.has(b.category)) {
      const first = byCat.get(b.category);
      first.items = [...(first.items || []), ...(b.items || [])];
    } else {
      byCat.set(b.category, { ...b, items: [...(b.items || [])] });
      order.push(b.category);
    }
  }
  return order.map(c => byCat.get(c));
}

function buildReviewMessage(content, ident, labs, labDates, currentRx) {
  const latest = {};
  const labDate = (labDates && labDates['0']) || 'data nao informada';
  for (const k of LAB_KEYS) { const v = labs[`${k}_0`]; if (v && String(v).trim() !== '') latest[k] = v; }
  const labsTxt = Object.keys(latest).length ? Object.entries(latest).map(([k, v]) => `${k}: ${v}`).join('\n') : 'Nenhum exame disponivel na ficha';
  return `Revise a PRESCRICAO EM USO deste paciente de UTI, item a item.

## IDENTIFICACAO
${JSON.stringify(ident || {}, null, 2)}

## EXAMES LABORATORIAIS MAIS RECENTES (${labDate})
${labsTxt}

## CONTEXTO CLINICO (ultima evolucao — diagnosticos, drogas, VM, vasopressores)
${content || '(sem conteudo)'}

## PRESCRICAO EM USO (a ser revisada — avalie CADA item)
${currentRx}

Avalie cada item da prescricao em uso (adequado/ajustar/nao_recomendado + justificativa + sugestao). Liste o que esta FALTANDO. Responda EXCLUSIVAMENTE JSON valido.`;
}

async function callDeepSeek(systemPrompt, userMessage) {
  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${DEEPSEEK_KEY()}` },
    body: JSON.stringify({
      model: 'deepseek-chat',
      temperature: 0.2,
      max_tokens: 4096,
      response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMessage }],
    }),
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e?.error?.message || `DeepSeek HTTP ${res.status}`); }
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const params = req.method === 'GET' ? (req.query || {}) : (req.body || {});
  const { action } = params;

  try {
    // ── LISTAR (por paciente) ──
    if (req.method === 'GET' && action === 'list') {
      const all = await readAll(PREFIX);
      const filtered = params.patNome ? all.filter(p => norm(p.patNome) === norm(params.patNome)) : all;
      filtered.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
      return res.status(200).json(filtered.map(p => ({
        id: p.id, patNome: p.patNome, leito: p.leito, setor: p.setor,
        mode: p.mode || 'generate',
        status: p.status, dataEvo: p.dataEvo, createdAt: p.createdAt, signedAt: p.signedAt,
        nBlocks: (p.blocks || []).length, nAlerts: (p.alerts || []).length,
        nReview: (p.review || []).length, nMissing: (p.missing || []).length,
      })));
    }

    // ── CARREGAR ──
    if (req.method === 'GET' && action === 'load') {
      const p = await getPrescricao(params.id);
      if (!p) return res.status(404).json({ error: 'Prescricao nao encontrada' });
      return res.status(200).json(p);
    }

    // ── GERAR (IA) ──
    if (req.method === 'POST' && action === 'generate') {
      const { patNome, userId } = req.body || {};
      if (!patNome) return res.status(400).json({ error: 'patNome obrigatorio' });
      if (!DEEPSEEK_KEY()) return res.status(500).json({ error: 'DEEPSEEK_API_KEY ausente no servidor' });

      const [evolucao, labficha] = await Promise.all([
        latestForPatient('evolucao/', patNome),
        latestForPatient('labficha/', patNome),
      ]);
      if (!evolucao) return res.status(404).json({ error: 'Nenhuma evolucao salva encontrada para este paciente' });

      const labs = (labficha && labficha.data && labficha.data.values) || {};
      const labDates = (labficha && labficha.data && labficha.data.dates) || {};
      const ident = evolucao.ident || {};
      const content = (evolucao.content || '').substring(0, 6000);

      const raw = await callDeepSeek(SYSTEM_PROMPT, buildUserMessage(content, ident, labs, labDates));
      let parsed;
      try {
        const clean = raw.replace(/```json|```/g, '').trim();
        const m = clean.match(/\{[\s\S]*\}/);
        parsed = JSON.parse(m ? m[0] : clean);
      } catch (e) {
        return res.status(502).json({ error: 'IA retornou formato invalido, tente novamente.' });
      }

      const id = Date.now().toString() + Math.floor(Math.random() * 1000);
      const now = new Date().toISOString();
      const ls = resolveLeitoSetor(ident, evolucao.content || '');
      const prescription = {
        id, patNome: evolucao.patNome,
        leito: ls.leito, setor: ls.setor,
        createdAt: now, updatedAt: now, createdBy: userId || 'unknown',
        dataEvo: evolucao.dataEvo || now.slice(0, 10),
        status: 'draft', signedAt: null, signedBy: null,
        clinicalSnapshot: {
          peso: ident.weight || null,
          sofa: (evolucao.sofa === undefined ? null : evolucao.sofa),
          labs: Object.fromEntries(Object.entries(labs).filter(([k]) => k.endsWith('_0')).map(([k, v]) => [k.replace(/_0$/, ''), v])),
          contentExcerpt: (evolucao.content || '').substring(0, 2000),
        },
        aiReasoning: parsed.reasoning || '',
        alerts: Array.isArray(parsed.alerts) ? parsed.alerts : [],
        blocks: dedupeBlocks(Array.isArray(parsed.blocks) ? parsed.blocks : []),
        notes: '',
      };
      await savePrescricao(prescription);
      return res.status(200).json({ id, prescription });
    }

    // ── REVISAR PRESCRICAO EM USO (IA) ──
    if (req.method === 'POST' && action === 'review') {
      const { patNome, userId, currentRx } = req.body || {};
      if (!patNome) return res.status(400).json({ error: 'patNome obrigatorio' });
      if (!currentRx || !String(currentRx).trim()) return res.status(400).json({ error: 'Cole a prescricao em uso' });
      if (!DEEPSEEK_KEY()) return res.status(500).json({ error: 'DEEPSEEK_API_KEY ausente no servidor' });

      const [evolucao, labficha] = await Promise.all([
        latestForPatient('evolucao/', patNome),
        latestForPatient('labficha/', patNome),
      ]);
      const labs = (labficha && labficha.data && labficha.data.values) || {};
      const labDates = (labficha && labficha.data && labficha.data.dates) || {};
      const ident = (evolucao && evolucao.ident) || {};
      const content = ((evolucao && evolucao.content) || '').substring(0, 6000);

      const raw = await callDeepSeek(REVIEW_SYSTEM_PROMPT, buildReviewMessage(content, ident, labs, labDates, String(currentRx).substring(0, 6000)));
      let parsed;
      try {
        const clean = raw.replace(/```json|```/g, '').trim();
        const m = clean.match(/\{[\s\S]*\}/);
        parsed = JSON.parse(m ? m[0] : clean);
      } catch (e) { return res.status(502).json({ error: 'IA retornou formato invalido, tente novamente.' }); }

      const id = Date.now().toString() + Math.floor(Math.random() * 1000);
      const now = new Date().toISOString();
      const ls = resolveLeitoSetor(ident, (evolucao && evolucao.content) || '');
      const rec = {
        id, patNome: (evolucao && evolucao.patNome) || patNome,
        leito: ls.leito, setor: ls.setor,
        createdAt: now, updatedAt: now, createdBy: userId || 'unknown',
        dataEvo: (evolucao && evolucao.dataEvo) || now.slice(0, 10),
        mode: 'review', status: 'review',
        currentRx: String(currentRx),
        clinicalSnapshot: { peso: ident.weight || null, sofa: (evolucao ? evolucao.sofa : null), labs: {}, contentExcerpt: ((evolucao && evolucao.content) || '').substring(0, 2000) },
        aiReasoning: parsed.reasoning || '',
        alerts: Array.isArray(parsed.alerts) ? parsed.alerts : [],
        review: Array.isArray(parsed.review) ? parsed.review : [],
        missing: Array.isArray(parsed.missing) ? parsed.missing : [],
        blocks: [],
      };
      await savePrescricao(rec);
      return res.status(200).json({ id, prescription: rec });
    }

    // ── ATUALIZAR RASCUNHO (blocos/notas) ──
    if (req.method === 'POST' && action === 'update') {
      const { id, blocks, notes } = req.body || {};
      const p = await getPrescricao(id);
      if (!p) return res.status(404).json({ error: 'Nao encontrada' });
      if (p.status === 'signed') return res.status(409).json({ error: 'Prescricao ja assinada' });
      if (Array.isArray(blocks)) p.blocks = blocks;
      if (notes !== undefined) p.notes = notes;
      p.updatedAt = new Date().toISOString();
      await savePrescricao(p);
      return res.status(200).json({ ok: true });
    }

    // ── ASSINAR ──
    if (req.method === 'POST' && action === 'sign') {
      const { id, userId, userName, userCrm, blocks, notes } = req.body || {};
      const p = await getPrescricao(id);
      if (!p) return res.status(404).json({ error: 'Nao encontrada' });
      if (p.status === 'signed') return res.status(409).json({ error: 'Ja assinada' });
      if (Array.isArray(blocks)) p.blocks = blocks; // salva edicoes finais
      if (notes !== undefined) p.notes = notes;
      p.status = 'signed';
      p.signedAt = new Date().toISOString();
      p.signedBy = userId || 'unknown';
      p.signedByName = userName || '';
      p.signedByCrm = userCrm || '';
      // Registro eletronico interno (NAO e assinatura digital ICP-Brasil)
      p.signatureType = 'registro-eletronico-interno';
      p.updatedAt = p.signedAt;
      await savePrescricao(p);
      return res.status(200).json({ ok: true, signedAt: p.signedAt });
    }

    // ── EXCLUIR ──
    if (req.method === 'POST' && action === 'delete') {
      const { id } = req.body || {};
      const blobs = await list({ prefix: `${PREFIX}${id}.json`, token: TOKEN() });
      if (blobs.blobs.length) await del(blobs.blobs[0].url, { token: TOKEN() });
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: 'Acao invalida' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
