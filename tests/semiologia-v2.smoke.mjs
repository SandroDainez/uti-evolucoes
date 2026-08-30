import assert from 'node:assert/strict';

// DOM mínimo: suficiente para carregar/registrar a camada sem executar a UI real.
globalThis.window = globalThis;
globalThis.document = {
  readyState: 'complete',
  getElementById() { return null; },
  querySelectorAll() { return []; },
  createElement() { return { id:'', textContent:'', style:{}, appendChild(){} }; },
  head: { appendChild(){} },
  addEventListener() {}
};
globalThis.MutationObserver = class { constructor(fn){ this.fn=fn; } observe(){} disconnect(){} };

// APIs legadas mínimas que a camada deve envolver sem quebrar.
globalThis.exSel = function legacyExSel(key,label){ return `<div data-legacy="${key}">${label}</div>`; };
globalThis.collectExame = function legacyCollect(){ return { mv:'Presente e simétrico', adv:'Ausentes (limpo)' }; };

await import('../public/semiologia-v2.js');

assert.ok(globalThis.SemiologiaV2, 'SemiologiaV2 deve ser registrada globalmente');
for (const fn of ['sync','syncFrom','clearInitial','addAdv','addPulse','addLpp','removeRow','addDevice','removeDevice','syncAdditional','mountAdditional']) {
  assert.equal(typeof globalThis.SemiologiaV2[fn], 'function', `função ${fn} deve existir`);
}
assert.equal(globalThis.exSel.__sv2, true, 'exSel legado deve ser envolvido pela camada v2');
assert.equal(globalThis.collectExame.__sv2, true, 'collectExame legado deve ser envolvido pela camada v2');

// Campo não migrado continua usando o renderizador legado.
assert.match(globalThis.exSel('rha','RHA',[],''), /data-legacy="rha"/);

// Campos migrados expõem os construtores atômicos esperados.
const mv = globalThis.exSel('mv','Murmúrio vesicular',[],'');
assert.match(mv, /sv2_mv_int/);
assert.match(mv, /sv2_mv_loc/);

const pup = globalThis.exSel('pup','Pupilas',[], '');
assert.match(pup, /sv2_pup_od/);
assert.match(pup, /Discoria à direita/);
assert.match(pup, /sv2_pup_reac_lado/);

const adv = globalThis.exSel('adv','Ruídos adventícios',[], '');
assert.match(adv, /Roncos/);
assert.match(adv, /Sibilos/);
assert.match(adv, /Crepitações/);
assert.match(adv, /\+ adicionar achado/);

const perf = globalThis.exSel('perf','Perfusão',[], '');
assert.match(perf, /Tibial posterior D/);
assert.match(perf, /Pedioso E/);
assert.match(perf, /Apenas ao Doppler/);

const lpp = globalThis.exSel('lpp','Lesão por pressão',[], '');
assert.match(lpp, /Calcâneo D/);
assert.match(lpp, /Não classificável/);
assert.match(lpp, /\+ adicionar lesão/);

// Um achado legado extraído é preservado até o médico optar por reconstruí-lo.
const legado = globalThis.exSel('mv','Murmúrio vesicular',[],'Reduzido à esquerda');
assert.match(legado, /value="Reduzido à esquerda"/);
assert.match(legado, /Texto atual:/);
assert.match(legado, /reconstruir/);

// A coleta legada continua preservando seus campos mesmo sem painel montado.
const collected = globalThis.collectExame();
assert.equal(collected.mv, 'Presente e simétrico');
assert.equal(collected.adv, 'Ausentes (limpo)');
assert.ok(Object.prototype.hasOwnProperty.call(collected,'jugular'));
assert.ok(Object.prototype.hasOwnProperty.call(collected,'neurodesc'));
assert.ok(Object.prototype.hasOwnProperty.call(collected,'torax'));
assert.ok(Object.prototype.hasOwnProperty.call(collected,'dispositivos_exame'));

console.log('semiologia-v2 smoke: OK');
