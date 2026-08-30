import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const code=fs.readFileSync(new URL('../public/clinical-safety-v3.js',import.meta.url),'utf8');
const context={
  console,
  window:{
    buildSystemPrompt:()=> 'BASE PROMPT',
    postProcess:(x)=>x,
    renderExameForm:()=>{},
  },
  document:{
    readyState:'complete',
    addEventListener(){},
    getElementById(){return null;}
  },
  Date,
  setTimeout:(fn)=>{fn();return 1;}
};
context.window.window=context.window;
vm.createContext(context);
vm.runInContext(code,context);
const api=context.window.ClinicalSafetyV3;
assert.ok(api,'ClinicalSafetyV3 exportado');
assert.match(context.window.buildSystemPrompt(),/PROFILAXIAS:/,'prompt inclui regra de profilaxia');

const sample=`PROFILAXIAS:\nGÁSTRICA: PANTOPRAZOL EV\nTEP/TVP: ENOXAPARINA\n\nEXAME CLÍNICO:\nAC: RITMO SINUSAL\nFC: 78 BPM\nPA: 110 X 70 MMHG\nAP: MV PRESENTE\nNEUROLÓGICO: GLASGOW 15\nVENTILATÓRIO: ESPONTÂNEO\nABDOME: FLÁCIDO\nMEMBROS SUPERIORES: SEM EDEMA\nMEMBROS INFERIORES: SEM EDEMA\nÚLCERAS DE PRESSÃO: AUSENTES\n\nNUTRIÇÃO: JEJUM\nDEMANDA FAMILIAR: SEM DEMANDA\nJUSTIFICATIVA DE PERMANÊNCIA EM UTI: PACIENTE GRAVE\nCONDUTAS:\n1. OBSERVAÇÃO`;
const out=api.auditEvolution(sample);
assert.match(out,/GÁSTRICA: PANTOPRAZOL EV \[COMPLEMENTAR: INFORMAR DOSE, POSOLOGIA\]/i);
assert.match(out,/TEP\/TVP: ENOXAPARINA \[COMPLEMENTAR: INFORMAR DOSE, VIA, POSOLOGIA\]/i);
assert.match(out,/INFORMAR FREQUÊNCIA RESPIRATÓRIA/i);
assert.match(out,/INFORMAR TEMPERATURA/i);
assert.match(out,/INFORMAR SATURAÇÃO/i);
assert.match(out,/INFORMAR MOTIVO DO JEJUM\/NPO/i);
assert.match(out,/CONFIRMAR ORIENTAÇÃO AOS FAMILIARES/i);
assert.match(out,/AVALIAR ALTA PARA ENFERMARIA/i);

const atb=`ANTIMICROBIANOS EM USO:\nCEFTRIAXONA 2 G EV 1X/DIA INÍCIO 28/08/2026 TÉRMINO 30/08/2026\nCONDUTAS:\nMANTER`;
const atbOut=api.auditEvolution(atb);
assert.match(atbOut,/ATINGIU A DATA PREVISTA DE TÉRMINO/i);
console.log('clinical-safety-v3 smoke: ok');
