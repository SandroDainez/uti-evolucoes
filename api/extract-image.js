export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { imageBase64, mimeType } = req.body || {};
  if (!imageBase64) return res.status(400).json({ error: 'imageBase64 required' });

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key not configured' });

  const prompt = `Você é um assistente médico. Analise esta imagem médica (pode ser resultado de exame, RX, ECG, laudo, evolução, receita ou qualquer documento clínico) e extraia TODAS as informações clínicas relevantes.

Retorne um texto estruturado com:
- Tipo de exame/documento identificado
- Todos os valores numéricos com seus nomes
- Datas encontradas
- Achados, diagnósticos ou observações relevantes
- Qualquer outra informação clínica presente

Responda APENAS com as informações extraídas, sem comentários adicionais. Se não conseguir identificar informações, descreva o que vê na imagem.`;

  try {
    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        max_tokens: 2000,
        temperature: 0.1,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: {
                  url: `data:${mimeType || 'image/jpeg'};base64,${imageBase64}`
                }
              },
              {
                type: 'text',
                text: prompt
              }
            ]
          }
        ]
      })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      // Se modelo não suporta visão, tentar com texto apenas descrevendo o problema
      if (response.status === 400 || err?.error?.code === 'invalid_request_error') {
        return res.status(200).json({
          text: '[IMAGEM ANEXADA - Modelo atual não suporta análise de imagens. Por favor, descreva o conteúdo da imagem no campo de dados clínicos ou cole o texto do resultado.]'
        });
      }
      throw new Error(err?.error?.message || `HTTP ${response.status}`);
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '';
    return res.status(200).json({ text });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
