/* UTI Evoluções — Clinical Safety v3
 * Validação determinística de completude do prontuário e regras operacionais clínicas.
 * Não inventa fatos; ausências relevantes viram [COMPLEMENTAR: ...] para destaque em vermelho.
 */
(function(){
  'use strict';
  const safe=v=>String(v==null?'':v).trim();
  const strip=s=>safe(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();

  const POLICY = `
REGRAS CLINICAS OPERACIONAIS ADICIONAIS — OBRIGATORIAS:
1. PROFILAXIAS: quando houver profilaxia gastrica ou TEV/TEP farmacologica, registrar FARMACO + DOSE + VIA + POSOLOGIA. Ex.: pantoprazol 40 mg EV 1x/dia; enoxaparina 40 mg SC 1x/dia. NUNCA completar dose ausente por inferencia. Se qualquer componente estiver ausente, usar [COMPLEMENTAR: ...] especificando o que falta.
2. ANTIMICROBIANOS EM USO: para CADA antimicrobiano registrar nome, dose, via, posologia, DATA/DIA DE INICIO e DATA PREVISTA DE TERMINO quando disponíveis. Não inventar datas. Se faltarem dose/posologia/inicio/termino, marcar [COMPLEMENTAR: ...].
3. TERMINO DE ANTIMICROBIANO: quando a data prevista de termino for hoje ou já tiver sido atingida, alertar o usuario para decidir SUSPENDER ou PROLONGAR. A decisão deve considerar foco infeccioso, resposta clínica, culturas/microbiologia e sensibilidades, controle de foco, imunossupressão, presença de material protético/dispositivos, complicações e outras justificativas documentadas. Não prolongar automaticamente.
4. EXAME CLINICO: exigir avaliação completa dos blocos essenciais definidos no app. Ausência de qualquer bloco essencial deve permanecer explícita como [COMPLEMENTAR: ...]; não preencher exame normal por suposição.
5. NUTRICAO/DIETA: registrar, quando aplicável, VIA (oral, enteral por SNG/SNE/GTT/jejunostomia, parenteral ou combinada), CONSISTENCIA (líquida, líquida completa, pastosa, branda, geral/livre), RESTRICAO/OBJETIVO (diabética/controle de carboidratos, hipossódica, renal, hiperproteica/hiperproteica-hipercalórica, neutropênica conforme protocolo local, sem resíduos/baixo resíduo quando indicada) e TOLERANCIA (bem aceita, aceitação parcial, baixa aceitação, intolerância; náuseas/vômitos/distensão/resíduo quando documentados). Jejum/NPO deve conter motivo quando conhecido. Não inventar prescrição dietética.
6. DEMANDA FAMILIAR: se houver registro de contato/orientação, redigir no mínimo que os familiares foram orientados/cientes da gravidade do caso e das condutas adotadas, preservando qualquer informação mais relevante. Se NÃO houver evidência de comunicação, NÃO afirmar que houve; usar [COMPLEMENTAR: confirmar orientação aos familiares sobre gravidade e condutas].
7. JUSTIFICATIVA DE PERMANENCIA EM UTI: fundamentar em necessidade atual de terapia/monitorização intensiva (ex.: VM invasiva, suporte respiratório avançado com risco de falha, DVA/inotrópico, instabilidade hemodinâmica, necessidade de monitorização invasiva/neurológica intensiva, pós-operatório de alto risco com necessidade real de cuidado intensivo, terapia renal substitutiva instável, risco imediato de deterioração ou outra razão objetiva). Não usar apenas 'paciente grave' ou diagnóstico isolado. Se os dados mostrarem estabilidade clínica sem necessidade objetiva de terapia/monitorização intensiva, emitir [COMPLEMENTAR: REAVALIAR NECESSIDADE DE UTI / AVALIAR ALTA PARA ENFERMARIA SE CLINICAMENTE APROPRIADO].
`;

  function wrapSystemPrompt(){
    const legacy=window.buildSystemPrompt;
    if(typeof legacy!=='function'||legacy.__safetyV3) return;
    const wrapped=function(){ return legacy.apply(this,arguments)+'\n\n'+POLICY; };
    wrapped.__safetyV3=true; window.buildSystemPrompt=wrapped;
  }

  const MAIN_HEADERS = [
    'ALERGIAS','SAPS III','HIPOTESES DIAGNOSTICAS','HISTORIA DA DOENCA ATUAL','ANTECEDENTES PATOLOGICOS E CIRURGICOS',
    'MEDICACOES DE USO CONTINUO','PROFILAXIAS','ANTIMICROBIANOS EM USO','ANTIMICROBIANOS JA UTILIZADOS','SEDACAO/ANALGESIA',
    'BLOQUEADOR NEUROMUSCULAR','DROGAS VASOATIVAS','VENTILACAO MECANICA','DISPOSITIVOS INVASIVOS','EXAMES DE MAIOR IMPORTANCIA',
    'INTERCONSULTAS','EXAME CLINICO','OUTRAS INFORMACOES RELEVANTES','CONTROLES E BALANCO DAS ULTIMAS 24 HORAS','NUTRICAO',
    'INTERCORRENCIAS','DEMANDA FAMILIAR','JUSTIFICATIVA DE PERMANENCIA EM UTI','CONDUTAS'
  ];
  const MAIN_SET=new Set(MAIN_HEADERS);
  function head(line){ const i=line.indexOf(':'); return i<0?'':strip(line.slice(0,i)); }
  function isMain(line){ return MAIN_SET.has(head(line)); }

  function hasDose(s){ return /\b\d+(?:[,.]\d+)?\s*(?:MCG|UG|MG|G|ML|UI|U)\b/i.test(s); }
  function hasRoute(s){ return /\b(EV|IV|VO|SC|IM|SNE|SNG|GTT|ENTERAL|ORAL)\b/i.test(s); }
  function hasSchedule(s){ return /\b(?:\d+\s*\/\s*\d+\s*H|\d+\s*X\s*\/\s*DIA|\d+X\/DIA|1X\/DIA|2X\/DIA|3X\/DIA|4X\/DIA|A CADA\s+\d+\s*H|QD|BID|TID|QID)\b/i.test(s); }
  function isNegative(s){ return /NAO INDICAD|NAO USA|SEM PROFILAX|SUSPENS|CONTRAINDIC/i.test(strip(s)); }

  function auditProphylaxis(lines){
    let inProf=false;
    for(let i=0;i<lines.length;i++){
      const h=head(lines[i]);
      if(h==='PROFILAXIAS'){ inProf=true; continue; }
      if(inProf && isMain(lines[i])){ inProf=false; }
      if(!inProf) continue;
      const u=strip(lines[i]);
      if(!/^(GASTRICA|TEP\/TVP|TEV)\s*:/.test(u) || isNegative(lines[i])) continue;
      const missing=[];
      if(!hasDose(lines[i])) missing.push('dose');
      if(!hasRoute(lines[i])) missing.push('via');
      if(!hasSchedule(lines[i])) missing.push('posologia');
      if(missing.length && !/\[COMPLEMENTAR:/i.test(lines[i])) lines[i]+=` [COMPLEMENTAR: INFORMAR ${missing.join(', ').toUpperCase()}]`;
    }
  }

  function parseBrDate(s){
    const m=s.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/); if(!m)return null;
    const d=new Date(Number(m[3]),Number(m[2])-1,Number(m[1])); return isNaN(d)?null:d;
  }
  function day0(d){ return new Date(d.getFullYear(),d.getMonth(),d.getDate()).getTime(); }

  function auditAntibiotics(lines){
    let inAtb=false;
    for(let i=0;i<lines.length;i++){
      const h=head(lines[i]);
      if(h==='ANTIMICROBIANOS EM USO'){
        inAtb=true;
        const after=lines[i].split(':').slice(1).join(':').trim();
        if(after && !/^\(?\s*[ X]?\s*\)?\s*NAO/i.test(after)) auditAtbLine(lines,i);
        continue;
      }
      if(inAtb && isMain(lines[i])){ inAtb=false; }
      if(!inAtb || !lines[i].trim()) continue;
      auditAtbLine(lines,i);
    }
  }
  function auditAtbLine(lines,i){
    const s=lines[i];
    if(/NAO|SEM ANT|NENHUM/i.test(strip(s)) && !hasDose(s)) return;
    const miss=[];
    if(!hasDose(s)) miss.push('dose');
    if(!hasRoute(s)) miss.push('via');
    if(!hasSchedule(s)) miss.push('posologia');
    if(!/(INICIO|INÍCIO|D\.I\.|\bDI\b|D1|DIA\s*1)/i.test(s)) miss.push('data/dia de início');
    if(!/(TERMINO|TÉRMINO|PREVISAO|PREVISÃO|D\.T\.|\bDT\b)/i.test(s)) miss.push('data prevista de término');
    if(miss.length && !/\[COMPLEMENTAR:/i.test(s)) lines[i]+=` [COMPLEMENTAR: INFORMAR ${miss.join(', ').toUpperCase()}]`;

    const tm=s.match(/(?:TERMINO|TÉRMINO|PREVISAO(?:\s+DE\s+TERMINO)?|PREVISÃO(?:\s+DE\s+TÉRMINO)?|D\.T\.|\bDT\b)\s*[:\-]?\s*(\d{1,2}\/\d{1,2}\/\d{4})/i);
    if(tm){
      const end=parseBrDate(tm[1]); const now=new Date();
      if(end && day0(end)<=day0(now) && !/REAVALIAR.*TERMIN/i.test(strip(lines[i]))){
        lines.splice(i+1,0,'[COMPLEMENTAR: ANTIMICROBIANO ATINGIU A DATA PREVISTA DE TÉRMINO — DEFINIR SUSPENSÃO OU PROLONGAMENTO COM BASE EM FOCO, EVOLUÇÃO CLÍNICA, CULTURAS/MICROBIOLOGIA, CONTROLE DE FOCO E OUTRAS JUSTIFICATIVAS DOCUMENTADAS]');
      }
    }
  }

  const EXAM_REQUIRED = [
    ['AC','ausculta cardíaca'],['FC','frequência cardíaca'],['PA','pressão arterial'],['FR','frequência respiratória'],['TAX','temperatura'],['SAT','saturação'],
    ['AP','ausculta pulmonar'],['NEUROLOGICO','exame neurológico'],['VENTILATORIO','avaliação ventilatória'],['ABDOME','exame abdominal'],
    ['MEMBROS SUPERIORES','membros superiores/perfusão'],['MEMBROS INFERIORES','membros inferiores/perfusão'],['ULCERAS DE PRESSAO','avaliação de lesão por pressão/pele em proeminências']
  ];
  function auditExam(lines){
    const start=lines.findIndex(l=>head(l)==='EXAME CLINICO'); if(start<0)return;
    let end=lines.length;
    for(let i=start+1;i<lines.length;i++){ if(isMain(lines[i])){end=i;break;} }
    const block=lines.slice(start,end).map(strip).join('\n');
    const missing=EXAM_REQUIRED.filter(([k])=>!new RegExp('(^|\\n)'+k.replace('/','\\/')+'\\s*:','m').test(block));
    if(!missing.length)return;
    const add=['PENDÊNCIAS DO EXAME CLÍNICO:'];
    missing.forEach(([,label])=>add.push(`[COMPLEMENTAR: INFORMAR ${label.toUpperCase()}]`));
    lines.splice(end,0,...add,'');
  }

  function auditNutrition(lines){
    const idx=lines.findIndex(l=>head(l)==='NUTRICAO'); if(idx<0)return;
    const s=lines[idx]; const u=strip(s);
    if(/JEJUM|NPO|DIETA ZERO/.test(u) && !/(MOTIVO|PROCEDIMENTO|CIRURG|EXAME|INTOLER)/.test(u) && !/\[COMPLEMENTAR:/i.test(s))
      lines[idx]+=' [COMPLEMENTAR: INFORMAR MOTIVO DO JEJUM/NPO]';
  }

  function auditFamily(lines){
    const idx=lines.findIndex(l=>head(l)==='DEMANDA FAMILIAR');
    if(idx<0){ lines.push('', 'DEMANDA FAMILIAR: [COMPLEMENTAR: CONFIRMAR ORIENTAÇÃO AOS FAMILIARES SOBRE GRAVIDADE DO CASO E CONDUTAS ADOTADAS]'); return; }
    const s=strip(lines[idx]);
    const after=lines[idx].split(':').slice(1).join(':').trim();
    if(!after || /SEM DEMANDA|NAO INFORM/.test(s)){
      lines[idx]='DEMANDA FAMILIAR: [COMPLEMENTAR: CONFIRMAR ORIENTAÇÃO AOS FAMILIARES SOBRE GRAVIDADE DO CASO E CONDUTAS ADOTADAS]';
    }
  }

  function auditICU(lines){
    const idx=lines.findIndex(l=>head(l)==='JUSTIFICATIVA DE PERMANENCIA EM UTI'); if(idx<0)return;
    const whole=strip(lines.join('\n'));
    const objective=/VENTILACAO MECANICA.*\(X\) SIM|VM INVASIVA|NORADRENALINA|ADRENALINA|VASOPRESSINA|DOBUTAMINA|DROGA VASOATIVA|DVA|INSTABILIDADE HEMODINAMICA|CHOQUE|VNI|CNAF|ALTO FLUXO|MONITORIZACAO INVASIVA|PAI|PIC|TERAPIA RENAL SUBSTITUTIVA|HEMODIALISE.*INSTAV|RISCO IMEDIATO DE DETERIORACAO|POS-OPERATORIO.*ALTO RISCO/.test(whole);
    if(!objective){
      const marker='[COMPLEMENTAR: REAVALIAR NECESSIDADE DE UTI / AVALIAR ALTA PARA ENFERMARIA SE CLINICAMENTE APROPRIADO]';
      if(!whole.includes(strip(marker))) lines.splice(idx+1,0,marker);
    }
  }

  function auditEvolution(text){
    let lines=String(text||'').split('\n');
    auditProphylaxis(lines); auditAntibiotics(lines); auditExam(lines); auditNutrition(lines); auditFamily(lines); auditICU(lines);
    return lines.join('\n');
  }

  function wrapPostProcess(){
    const legacy=window.postProcess; if(typeof legacy!=='function'||legacy.__safetyV3)return;
    const wrapped=function(){ return auditEvolution(legacy.apply(this,arguments)); };
    wrapped.__safetyV3=true; window.postProcess=wrapped;
  }

  function improveDietField(){
    const el=document.getElementById('ex_diet'); if(!el||el.dataset.safetyV3)return;
    el.dataset.safetyV3='1';
    if(el.tagName==='SELECT'){
      const vals=[
        'Dieta oral geral/livre — bem aceita','Dieta oral geral/livre — aceitação parcial','Dieta oral branda — bem aceita','Dieta oral pastosa — bem aceita','Dieta oral líquida — bem aceita','Dieta oral líquida completa — bem aceita',
        'Dieta oral diabética/controle de carboidratos','Dieta oral hipossódica','Dieta oral renal','Dieta oral hiperproteica/hipercalórica',
        'Nutrição enteral por SNG','Nutrição enteral por SNE','Nutrição enteral por gastrostomia (GTT)','Nutrição enteral por jejunostomia','Nutrição parenteral','Nutrição enteral + parenteral','Jejum / NPO'
      ];
      const existing=new Set([...el.options].map(o=>o.value));
      vals.forEach(v=>{ if(!existing.has(v)){const o=document.createElement('option');o.value=v;o.textContent=v;el.appendChild(o);} });
    }
  }
  function moveRhaIntoAbdome(){
    const abd=document.getElementById('exf_abd');
    const rha=document.getElementById('exf_rha');
    if(!abd||!rha||rha.dataset.rhaInAbdome==='1') return;
    const body=abd.querySelector('.sv2-body');
    if(!body) return;
    rha.dataset.rhaInAbdome='1';
    rha.classList.add('sv2-rha-nested');
    rha.style.margin='8px 0 0';
    rha.style.border='1px solid rgba(255,255,255,.08)';
    rha.style.background='rgba(255,255,255,.018)';
    body.appendChild(rha);
    const help=abd.querySelector('.sv2-help');
    if(help && /RHA permanecem em campo próprio/i.test(help.textContent||'')) help.textContent='Inclui ruídos hidroaéreos (RHA).';
  }

  function wrapRenderExame(){
    const legacy=window.renderExameForm; if(typeof legacy!=='function'||legacy.__safetyV3)return;
    const wrapped=function(){const r=legacy.apply(this,arguments);setTimeout(()=>{improveDietField();moveRhaIntoAbdome();},0);return r;};
    wrapped.__safetyV3=true;window.renderExameForm=wrapped;
  }

  function install(){ wrapSystemPrompt(); wrapPostProcess(); wrapRenderExame(); setTimeout(()=>{improveDietField();moveRhaIntoAbdome();},50); }
  window.ClinicalSafetyV3={POLICY,auditEvolution,moveRhaIntoAbdome,install};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);else install();
})();
