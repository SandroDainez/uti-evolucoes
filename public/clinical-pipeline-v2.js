/* UTI Evoluções — Clinical Pipeline v2
 * Camada não destrutiva: melhora extração/atualização clínica e apresentação do output.
 */
(function(){
  'use strict';

  const state = { lastDelta:null, lastDeltaAt:null };
  const $ = id => document.getElementById(id);
  const safe = v => String(v == null ? '' : v).trim();

  function attachmentsText(){
    try {
      if (typeof evoAttachments === 'undefined' || !Array.isArray(evoAttachments)) return '';
      return evoAttachments.map(a => `[${a.name || 'anexo'}]:\n${a.content || ''}`).join('\n\n');
    } catch { return ''; }
  }

  async function extractDelta({base='', newInfo='', currentEvolution='', mode='initial'}){
    if (![base,newInfo,currentEvolution,attachmentsText()].some(x => safe(x))) return null;
    const res = await window.__clinicalV2NativeFetch('/api/parse-clinical-delta', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({ base, newInfo, currentEvolution, attachments:attachmentsText(), mode })
    });
    if (!res.ok) {
      const e = await res.json().catch(()=>({}));
      throw new Error(e.error || `HTTP ${res.status}`);
    }
    const data = await res.json();
    state.lastDelta = data.delta || null;
    state.lastDeltaAt = Date.now();
    return state.lastDelta;
  }

  function items(arr, fn){ return Array.isArray(arr) ? arr.map(fn).filter(Boolean) : []; }
  function deltaToPrompt(d){
    if (!d) return '';
    const L = [
      'ANALISE ESTRUTURADA DAS ATUALIZACOES (CAMADA DE EXTRACAO — NAO E TEXTO NOVO DO MEDICO):',
      'Use esta camada para reconciliar temporalmente os dados. Nunca transforme uma sugestao em diagnostico confirmado sem suporte clinico.'
    ];
    const push = (title, vals) => { if(vals.length){ L.push(title+':'); vals.forEach(v=>L.push('- '+v)); } };
    push('FATOS NOVOS EXPLICITAMENTE EXTRAIDOS', items(d.fatos_novos, x=>x?.fato && `${x.fato}${x.evidencia?` [evidência: ${x.evidencia}]`:''}`));
    push('PARAMETROS ATUAIS', items(d.sinais_vitais_e_parametros, x=>x?.parametro && `${x.parametro}: ${x.valor}`));
    push('DIAGNOSTICOS EXPLICITAMENTE NOVOS/ATIVOS', items(d.diagnosticos_adicionar, x=>x?.diagnostico && `${x.diagnostico}${x.status?` (${x.status})`:''}${x.evidencia?` [evidência: ${x.evidencia}]`:''}`));
    push('DIAGNOSTICOS QUE PRECISAM SER REAVALIADOS', items(d.diagnosticos_reavaliar, x=>x?.diagnostico && `${x.diagnostico}: ${x.motivo||''}${x.evidencia?` [evidência: ${x.evidencia}]`:''}`));
    push('DIAGNOSTICOS RESOLVIDOS/EXCLUIDOS — SOMENTE SE EXPLICITAMENTE DOCUMENTADOS', items(d.diagnosticos_resolvidos_ou_excluidos, x=>x?.diagnostico && `${x.diagnostico}${x.evidencia?` [evidência: ${x.evidencia}]`:''}`));
    push('DIAGNOSTICOS APENAS SUGERIDOS PELA CAMADA — AVALIAR, NAO AFIRMAR AUTOMATICAMENTE', items(d.diagnosticos_sugeridos, x=>x?.diagnostico && `${x.diagnostico}: ${x.motivo||''}${x.evidencia?` [evidência: ${x.evidencia}]`:''}`));
    push('CONDUTAS EXPLICITAMENTE ADICIONADAS', items(d.condutas_adicionar, x=>x?.conduta && `${x.conduta}${x.evidencia?` [evidência: ${x.evidencia}]`:''}`));
    push('CONDUTAS EXPLICITAMENTE AJUSTADAS', items(d.condutas_ajustar, x=>x?.conduta && `${x.conduta}: ${x.de||'?'} -> ${x.para||'?'}${x.evidencia?` [evidência: ${x.evidencia}]`:''}`));
    push('CONDUTAS EXPLICITAMENTE SUSPENSAS', items(d.condutas_suspender, x=>x?.conduta && `${x.conduta}${x.evidencia?` [evidência: ${x.evidencia}]`:''}`));
    push('INTERCORRENCIAS NOVAS', items(d.intercorrencias, x=>x?.evento && `${x.evento}${x.evidencia?` [evidência: ${x.evidencia}]`:''}`));
    push('CONFLITOS TEMPORAIS — O VALOR NOVO PREVALECE', items(d.conflitos_temporais, x=>x?.novo && `${x.antigo||'anterior'} -> ${x.novo}${x.evidencia?` [evidência: ${x.evidencia}]`:''}`));
    if (safe(d.resumo_operacional)) L.push('REGRA OPERACIONAL FINAL: '+safe(d.resumo_operacional));
    L.push('OBRIGATORIO: refletir os fatos novos nas secoes corretas; revisar HIPOTESES DIAGNOSTICAS e CONDUTAS; nao manter texto antigo que esteja explicitamente contradito por dado mais recente; nao remover problema ativo apenas por ausencia de mencao.');
    return L.join('\n');
  }

  function addStyles(){
    if ($('clinical_v2_styles')) return;
    const s=document.createElement('style'); s.id='clinical_v2_styles'; s.textContent=`
      .workspace{max-width:1180px!important;width:100%;}
      .output-panel{border-radius:14px!important;overflow:hidden;box-shadow:0 12px 35px rgba(0,0,0,.18);}
      .output-header{position:sticky;top:60px;z-index:4;background:rgba(17,23,32,.96);backdrop-filter:blur(10px);}
      #outputContent.output-content{padding:22px 24px 30px!important;line-height:1.5!important;font-family:'Sora',sans-serif!important;font-size:13px!important;max-height:760px!important;}
      #outputContent .o-main-title{margin:14px 0 5px!important;padding:8px 10px!important;border-top:0!important;border-left:3px solid var(--accent);border-radius:6px;background:rgba(0,212,255,.055);line-height:1.45;}
      #outputContent .o-main-title.is-section-only{background:rgba(0,212,255,.09);color:#f2f8ff;letter-spacing:.25px;}
      #outputContent .o-main-title.has-value{display:grid!important;grid-template-columns:minmax(190px,30%) 1fr;gap:12px;align-items:start;}
      #outputContent .o-main-title.has-value>strong{color:#aeeeff;}
      #outputContent .o-sub-title{display:grid!important;grid-template-columns:minmax(165px,220px) 1fr;gap:10px;align-items:start;margin:2px 0!important;padding:4px 8px!important;border-radius:5px;background:rgba(255,255,255,.018);line-height:1.45!important;}
      #outputContent .o-sub-title>strong{color:#b9cde0;font-size:12px;}
      #outputContent .o-body{font-size:13px!important;font-weight:400!important;color:var(--text)!important;}
      #outputContent .o-plain,#outputContent .o-numbered{font-size:13px!important;line-height:1.5!important;padding-left:8px;}
      #outputContent .o-empty{height:.45em!important;}
      #outputContent .o-section-block{margin-top:12px!important;border-top:0!important;border-left:3px solid var(--warn);padding:7px 10px!important;background:rgba(255,170,0,.055);border-radius:6px;}
      #outputContent strong{font-weight:650;}
      #outputContent{font-variant-numeric:tabular-nums;}
      .clinical-v2-badge{display:inline-flex;align-items:center;gap:5px;margin-left:8px;padding:3px 8px;border:1px solid rgba(0,204,136,.3);background:rgba(0,204,136,.08);border-radius:999px;color:var(--success);font-size:9px;font-weight:700;letter-spacing:.5px;vertical-align:middle;}
      @media(max-width:760px){
        #outputContent.output-content{padding:16px 13px 24px!important;}
        #outputContent .o-main-title.has-value,#outputContent .o-sub-title{grid-template-columns:1fr!important;gap:2px;}
        .output-header{top:60px;align-items:flex-start;gap:8px;flex-direction:column;}
        .output-actions{width:100%;display:flex;flex-wrap:wrap;gap:5px;}
      }
    `; document.head.appendChild(s);
  }

  function decorateOutput(){
    const c=$('outputContent'); if(!c) return;
    c.querySelectorAll('.o-main-title').forEach(el=>{
      const body=el.querySelector('.o-body');
      const has=!!(body && safe(body.textContent));
      el.classList.toggle('has-value',has); el.classList.toggle('is-section-only',!has);
    });
    const title=$('outputTitle');
    if(title && !title.querySelector('.clinical-v2-badge')){
      const b=document.createElement('span'); b.className='clinical-v2-badge'; b.textContent='✓ EXTRAÇÃO CLÍNICA V2'; title.appendChild(b);
    }
  }

  function hydrateExtras(){
    try {
      if (!window.SemiologiaV2) return;
      window.SemiologiaV2.mountAdditional();
      const p = (typeof _exameParsed !== 'undefined' && _exameParsed) ? _exameParsed : null;
      if (!p) return;
      ['jugular','neurodesc','torax','dispositivos_exame'].forEach(k=>{
        const inp=$(`sv2_${k}_free`); if(inp && !safe(inp.value) && safe(p[k])) inp.value=p[k];
      });
      window.SemiologiaV2.syncAdditional();
    } catch(e){ console.warn('clinical-v2 hydrate extras',e); }
  }

  function installFetchRouting(){
    if (window.__clinicalV2NativeFetch) return;
    window.__clinicalV2NativeFetch = window.fetch.bind(window);
    window.fetch = function(input, init){
      if (typeof input === 'string' && /^\/api\/parse-exame(?:\?|$)/.test(input)) input=input.replace('/api/parse-exame','/api/parse-exame-v2');
      return window.__clinicalV2NativeFetch(input,init);
    };
  }

  function wrapExameToBlock(){
    const legacy=window.exameToBlock; if(typeof legacy!=='function'||legacy.__clinicalV2) return;
    const wrapped=function(o){
      let text=legacy.apply(this,arguments);
      const extra=[]; const add=(l,v)=>{if(safe(v))extra.push(`${l}: ${v}`);};
      add('TURGENCIA JUGULAR / CONGESTAO',o?.jugular);
      add('NEUROLOGICO DESCRITIVO',o?.neurodesc);
      add('INSPECAO TORACICA',o?.torax);
      add('DISPOSITIVOS — EXAME DO SITIO',o?.dispositivos_exame);
      if(extra.length) text += (text?'\n':'')+extra.join('\n');
      return text;
    }; wrapped.__clinicalV2=true; window.exameToBlock=wrapped;
  }

  function wrapRenderExame(){
    const legacy=window.renderExameForm; if(typeof legacy!=='function'||legacy.__clinicalV2) return;
    const wrapped=function(){ const r=legacy.apply(this,arguments); setTimeout(hydrateExtras,0); return r; };
    wrapped.__clinicalV2=true; window.renderExameForm=wrapped;
  }

  function wrapDoGenerate(){
    const legacy=window._doGenerate; if(typeof legacy!=='function'||legacy.__clinicalV2) return;
    const wrapped=async function(structuredBlock){
      const base=safe($('clinicalInput')?.value), newEl=$('newInfoInput'), original=safe(newEl?.value);
      let augmented=original;
      try {
        const d=await extractDelta({base,newInfo:original,currentEvolution:'',mode:'initial'});
        const block=deltaToPrompt(d); if(block) augmented=[original,block].filter(Boolean).join('\n\n========================================\n');
      } catch(e){ console.warn('clinical delta initial:',e.message); }
      if(newEl) newEl.value=augmented;
      try { return await legacy.call(this,structuredBlock); }
      finally { if(newEl) newEl.value=original; }
    }; wrapped.__clinicalV2=true; window._doGenerate=wrapped;
  }

  function wrapApplyUpdate(){
    const legacy=window.applyUpdate; if(typeof legacy!=='function'||legacy.__clinicalV2) return;
    const wrapped=async function(){
      const el=$('updateInput'), original=safe(el?.value); if(!original) return legacy.apply(this,arguments);
      let augmented=original;
      try {
        const current=(typeof lastRawOutput!=='undefined')?safe(lastRawOutput):'';
        const d=await extractDelta({base:current,newInfo:original,currentEvolution:current,mode:'update'});
        const block=deltaToPrompt(d); if(block) augmented=original+'\n\n'+block;
      } catch(e){ console.warn('clinical delta update:',e.message); }
      if(el) el.value=augmented;
      try {
        const r=await legacy.apply(this,arguments);
        return r;
      } finally {
        if(el && safe(el.value)) el.value=original;
      }
    }; wrapped.__clinicalV2=true; window.applyUpdate=wrapped;
  }

  function wrapRenderOutput(){
    const legacy=window.renderOutput; if(typeof legacy!=='function'||legacy.__clinicalV2) return;
    const wrapped=function(){ const r=legacy.apply(this,arguments); decorateOutput(); return r; };
    wrapped.__clinicalV2=true; window.renderOutput=wrapped;
  }

  function install(){
    addStyles(); installFetchRouting(); wrapExameToBlock(); wrapRenderExame(); wrapDoGenerate(); wrapApplyUpdate(); wrapRenderOutput();
    setTimeout(()=>{hydrateExtras();decorateOutput();},50);
  }

  window.ClinicalPipelineV2={state,extractDelta,deltaToPrompt,decorateOutput,hydrateExtras,install};
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',install); else install();
})();
