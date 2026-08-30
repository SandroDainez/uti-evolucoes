import assert from 'node:assert/strict';

const els = new Map();
function el(id, value='') {
  const e = { id, value, textContent:'', innerHTML:'', style:{}, className:'',
    querySelector(){return null;}, querySelectorAll(){return [];},
    appendChild(){}, classList:{toggle(){},contains(){return false;}},
    closest(){return null;}
  };
  els.set(id,e); return e;
}
el('clinicalInput','SEPSE EM TRATAMENTO');
el('newInfoInput','NORADRENALINA SUSPENSA HOJE');
el('updateInput','PACIENTE SEM DVA, HEMODINAMICAMENTE ESTAVEL');
el('outputContent',''); el('outputTitle','');

globalThis.window=globalThis;
globalThis.document={
  readyState:'complete',
  getElementById(id){ return els.get(id)||null; },
  createElement(){ return {id:'',textContent:'',style:{},appendChild(){},querySelector(){return null;}}; },
  head:{appendChild(){}}, addEventListener(){}, querySelectorAll(){return[];}
};

globalThis.evoAttachments=[];
globalThis.lastRawOutput='EVOLUCAO ANTERIOR\nHIPOTESES DIAGNOSTICAS:\nCHOQUE SEPTICO';
globalThis._exameParsed=null;
let routedUrl='';
let generatedNewInfo='';
let updatedText='';

globalThis.fetch=async function(url){
  routedUrl=String(url);
  if(String(url).includes('parse-clinical-delta')) return {
    ok:true, async json(){return {delta:{
      fatos_novos:[{fato:'Noradrenalina suspensa',evidencia:'noradrenalina suspensa hoje'}],
      sinais_vitais_e_parametros:[], diagnosticos_adicionar:[],
      diagnosticos_reavaliar:[{diagnostico:'Choque séptico',motivo:'reavaliar estado atual',evidencia:'sem DVA'}],
      diagnosticos_resolvidos_ou_excluidos:[], diagnosticos_sugeridos:[],
      condutas_adicionar:[],condutas_ajustar:[],condutas_suspender:[],
      medicacoes_atuais:[],intercorrencias:[],exames_relevantes_novos:[],conflitos_temporais:[],pendencias_explicitas:[],
      resumo_operacional:'revisar choque e registrar suspensão da DVA'
    }};}
  };
  return {ok:true,async json(){return {};}};
};

globalThis.exameToBlock=o=>'BASE EXAME';
globalThis.renderExameForm=()=>{};
globalThis.renderOutput=()=>{};
globalThis._doGenerate=async function(){ generatedNewInfo=els.get('newInfoInput').value; return 'ok'; };
globalThis.applyUpdate=async function(){ updatedText=els.get('updateInput').value; els.get('updateInput').value=''; return 'ok'; };
globalThis.SemiologiaV2={mountAdditional(){},syncAdditional(){}};

await import('../public/clinical-pipeline-v2.js');

assert.ok(globalThis.ClinicalPipelineV2,'pipeline deve registrar API global');
assert.equal(typeof globalThis.ClinicalPipelineV2.deltaToPrompt,'function');

await globalThis.fetch('/api/parse-exame',{method:'POST'});
assert.equal(routedUrl,'/api/parse-exame-v2','extrator antigo deve ser redirecionado ao v2');

const block=globalThis.exameToBlock({jugular:'Turgência jugular a 45°',neurodesc:'Disartria',torax:'Expansibilidade reduzida à direita',dispositivos_exame:'CVC sítio limpo'});
assert.match(block,/TURGENCIA JUGULAR \/ CONGESTAO/);
assert.match(block,/NEUROLOGICO DESCRITIVO/);
assert.match(block,/INSPECAO TORACICA/);
assert.match(block,/DISPOSITIVOS — EXAME DO SITIO/);

const originalNew=els.get('newInfoInput').value;
await globalThis._doGenerate('EXAME');
assert.match(generatedNewInfo,/ANALISE ESTRUTURADA DAS ATUALIZACOES/);
assert.match(generatedNewInfo,/NORADRENALINA SUSPENSA HOJE/);
assert.equal(els.get('newInfoInput').value,originalNew,'texto original deve ser restaurado após geração');

await globalThis.applyUpdate();
assert.match(updatedText,/ANALISE ESTRUTURADA DAS ATUALIZACOES/);
assert.match(updatedText,/PACIENTE SEM DVA/);
assert.equal(els.get('updateInput').value,'','campo deve continuar limpo quando atualização legada conclui');

const prompt=globalThis.ClinicalPipelineV2.deltaToPrompt({diagnosticos_sugeridos:[{diagnostico:'IRA',motivo:'oligúria',evidencia:'diurese reduzida'}]});
assert.match(prompt,/NAO AFIRMAR AUTOMATICAMENTE/);
assert.match(prompt,/IRA/);

console.log('clinical-pipeline-v2 smoke: OK');
