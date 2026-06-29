export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured on server' });
  }

  const { text, imageBase64, mimeType } = req.body;

  if (!text && !imageBase64) {
    return res.status(400).json({ error: 'text or imageBase64 is required' });
  }

  const extractionPrompt = `Você é um extrator de resultados laboratoriais. O texto abaixo pode vir de OCR (foto/PDF) e conter ruído. Extraia ABSOLUTAMENTE TODOS os exames com valor numérico — não pule nenhum.

Retorne JSON com:
- "paciente": nome completo do paciente se aparecer no laudo, senão "" (procure por "Paciente:", "Nome:", "Cliente:", etc.)
- "date": data do exame em DD/MM/AAAA, senão ""
- "values": objeto chave=nome do exame em MAIUSCULO_COM_UNDERSCORE, valor=número como string (só o número, ponto decimal, sem unidade)

REGRAS:
1. Extraia TODOS os exames presentes, mesmo os que não estão na lista de exemplos abaixo. Se houver 40 exames, retorne os 40.
2. Para hemograma diferencial, inclua cada componente (segmentados, bastonetes, eosinófilos, basófilos, monócitos, etc.)
3. Para gasometria, prefixe com _ART (arterial) ou _VEN (venosa) quando indicado: PH_ART, PCO2_ART, etc.
4. Corrija erros óbvios de OCR em números (O→0, l→1, S→5) quando o contexto for claro.
5. Ignore valores de referência/intervalos de normalidade — capture só o resultado do paciente.
6. Use ponto decimal. Ex: "9,2" → "9.2".
7. ⚠️ MUITO IMPORTANTE — APENAS O RESULTADO MAIS RECENTE:
   Muitos laudos mostram resultados de DIAS ANTERIORES lado a lado para comparação/evolução (várias colunas com datas diferentes para o mesmo exame).
   Você deve extrair SOMENTE o resultado do exame ATUAL / MAIS RECENTE (a coluna/data mais nova, geralmente a primeira da esquerda ou a marcada como atual).
   NUNCA misture resultados de datas diferentes. Se um exame tem valores em 05/06 e 08/06, retorne SOMENTE o de 08/06 (o mais recente).
   Em "date", coloque a data do resultado ATUAL extraído.
8. Se o laudo tiver uma única coluna de resultado, use essa normalmente.

Nomes canônicos preferenciais (use estes quando aplicável): HEMOGLOBINA, HEMATOCRITO, VCM, HCM, RDW, LEUCOCITOS, NEUTROFILOS, BASTONETES, SEGMENTADOS, EOSINOFILOS, BASOFILOS, MONOCITOS, LINFOCITOS, PLAQUETAS, PH_ART, PO2_ART, PCO2_ART, HCO3_ART, BE_ART, SATO2_ART, LACTATO, TTPA, INR, TAP, FIBRINOGENIO, D_DIMERO, UREIA, CREATININA, SODIO, POTASSIO, CLORO, MAGNESIO, FOSFORO, CALCIO, CALCIO_IONIZADO, TGO, TGP, FOSFATASE_ALCALINA, GGT, BILIRRUBINA_TOTAL, BILIRRUBINA_DIRETA, ALBUMINA, PROTEINAS_TOTAIS, PCR, PROCALCITONINA, FERRITINA, VHS, TROPONINA, BNP, GLICEMIA, CPK, CK_MB, AMILASE, LIPASE, TSH, T4_LIVRE, ACIDO_URICO, HBA1C, DHL.

Retorne APENAS o JSON válido, sem markdown, sem blocos de código, sem explicações.`;

  try {
    let messages;

    if (imageBase64) {
      // Image input
      messages = [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: extractionPrompt
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:${mimeType || 'image/jpeg'};base64,${imageBase64}`
              }
            }
          ]
        }
      ];
    } else {
      // Text input
      messages = [
        {
          role: 'user',
          content: `${extractionPrompt}\n\nTexto para análise:\n${text}`
        }
      ];
    }

    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        max_tokens: 4000,
        temperature: 0,
        messages
      })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      const msg = err?.error?.message || `HTTP ${response.status}`;
      return res.status(response.status).json({ error: msg });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    // Parse JSON from response
    let parsed;
    try {
      // Clean up potential markdown code blocks
      const cleaned = content
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```\s*$/i, '')
        .trim();
      parsed = JSON.parse(cleaned);
    } catch {
      // Try to extract JSON from the content
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        return res.status(500).json({ error: 'Failed to parse lab results from AI response', raw: content });
      }
    }

    return res.status(200).json({
      paciente: parsed.paciente || '',
      date: parsed.date || '',
      values: parsed.values || {}
    });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
