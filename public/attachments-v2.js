/* UTI Evoluções — anexos v2
 * Corrige a limitação legada de leitura das primeiras 5 páginas do PDF.
 */
(function(){
  'use strict';

  async function extractPdfTextEvoV2(file){
    if (!window.pdfjsLib) {
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }
    const ab = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: ab }).promise;
    const MAX_PAGES = 30;
    const MAX_CHARS = 90000;
    const pages = Math.min(pdf.numPages, MAX_PAGES);
    let text = '';
    for (let i = 1; i <= pages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items.map(s => s.str).join(' ').trim();
      text += `\n[PÁGINA ${i}/${pdf.numPages}]\n${pageText}\n`;
      if (text.length >= MAX_CHARS) {
        text = text.slice(0, MAX_CHARS) + '\n[EXTRAÇÃO INTERROMPIDA POR LIMITE DE TAMANHO — REVISE O PDF COMPLETO SE NECESSÁRIO]';
        break;
      }
    }
    if (pdf.numPages > MAX_PAGES) {
      text += `\n[PDF COM ${pdf.numPages} PÁGINAS — FORAM LIDAS AS PRIMEIRAS ${MAX_PAGES}; ANEXE O TRECHO RESTANTE SE CONTIVER DADOS ATUAIS RELEVANTES.]`;
    }
    const clean = text.trim();
    if (!clean || !/[A-Za-zÀ-ÿ0-9]/.test(clean.replace(/\[PÁGINA[^\]]*\]/g,''))) {
      return 'PDF sem texto extraível — pode ser documento digitalizado; enviar páginas relevantes como imagem ou transcrever os dados essenciais.';
    }
    return clean;
  }

  function install(){
    if (typeof window.extractPdfTextEvo === 'function' && !window.extractPdfTextEvo.__attachmentsV2) {
      extractPdfTextEvoV2.__attachmentsV2 = true;
      window.extractPdfTextEvo = extractPdfTextEvoV2;
    }
  }

  window.AttachmentsV2 = { extractPdfTextEvo:extractPdfTextEvoV2, install };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',install); else install();
})();
