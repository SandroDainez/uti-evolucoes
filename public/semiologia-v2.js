/*
 * UTI Evoluções — Semiologia v2
 * Camada compatível com o exame clínico legado.
 * Mantém os IDs ex_<campo> que collectExame() já consome, mas troca frases
 * rígidas por achados atômicos combináveis e geradores determinísticos.
 */
(function () {
  'use strict';

  const V2_KEYS = new Set(['ncons','pup','mv','adv','aust','perf','edema','abd','lpp']);
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v == null ? '' : v)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  const val = (id) => { const e=$(id); return e ? String(e.value || '').trim() : ''; };
  const checked = (id) => { const e=$(id); return !!(e && e.checked); };
  const cap = (s) => s ? s.charAt(0).toUpperCase()+s.slice(1) : '';
  const compact = (parts) => parts.filter(Boolean).join(' ').replace(/\s+/g,' ').trim();

  function option(value,label){ return `<option value="${esc(value)}">${esc(label == null ? value : label)}</option>`; }
  function select(id, items, placeholder='— selecionar —'){
    return `<select id="${id}" class="sv2-select" onchange="SemiologiaV2.syncFrom('${id}')">${option('',placeholder)}${items.map(x=>Array.isArray(x)?option(x[0],x[1]):option(x,x)).join('')}</select>`;
  }
  function text(id, placeholder='', type='text'){
    return `<input id="${id}" class="sv2-input" type="${type}" placeholder="${esc(placeholder)}" oninput="SemiologiaV2.syncFrom('${id}')">`;
  }
  function check(id,label){
    return `<label class="sv2-check"><input id="${id}" type="checkbox" onchange="SemiologiaV2.syncFrom('${id}')"><span>${esc(label)}</span></label>`;
  }
  function group(label, html){ return `<div class="sv2-group"><div class="sv2-group-label">${esc(label)}</div><div class="sv2-row">${html}</div></div>`; }

  function field(key,label,current,body,help=''){
    const has = !!String(current || '').trim();
    return `<div class="ex-field sv2-field" id="exf_${key}" data-sv2-key="${key}" data-initial="${esc(current||'')}" data-dirty="0">
      <div class="sv2-head">
        <div><span class="sv2-title">${esc(label)}</span>${help?`<span class="sv2-help">${esc(help)}</span>`:''}</div>
        <div class="sv2-head-actions"><span class="ex-badge ${has?'ok':'miss'}">${has?'extraído':'preencher'}</span><button type="button" class="ex-skiplink sv2-skip" onclick="exToggleSkip('${key}')">s/ dado</button></div>
      </div>
      <input type="hidden" id="ex_${key}" value="${esc(current||'')}">
      ${has?`<div class="sv2-current"><b>Texto atual:</b> <span>${esc(current)}</span><button type="button" onclick="SemiologiaV2.clearInitial('${key}')">reconstruir</button></div>`:''}
      <div class="sv2-body">${body}</div>
      <div class="sv2-preview" id="sv2_preview_${key}">${has?`Mantido: ${esc(current)}`:'Selecione os achados acima.'}</div>
      <div class="sv2-free"><span>Complemento livre</span>${text(`sv2_${key}_free`,'opcional — achado não representado acima')}</div>
    </div>`;
  }

  const LOC = [
    ['bilateral','bilateralmente'],['global','globalmente'],['direita','à direita'],['esquerda','à esquerda'],
    ['pred_d','predominando à direita'],['pred_e','predominando à esquerda'],['apices','em ápices'],['bases','em bases'],
    ['base_d','em base direita'],['base_e','em base esquerda'],['sup_d','em campo superior direito'],['sup_e','em campo superior esquerdo'],
    ['med_d','em campo médio direito'],['med_e','em campo médio esquerdo'],['inf_d','em campo inferior direito'],['inf_e','em campo inferior esquerdo']
  ];
  const LOC_LABEL = Object.fromEntries(LOC);

  function renderNcons(current){
    return field('ncons','Nível de consciência',current,
      group('Estado',select('sv2_ncons_estado',[
        ['alerta','Alerta / vígil'],['sonolento','Sonolento'],['letargico','Letárgico'],['obnubilado','Obnubilado'],['confuso','Confuso'],['agitado','Agitado'],['torporoso','Torporoso'],['comatoso','Comatoso / não responsivo']
      ]))+
      group('Resposta',select('sv2_ncons_resp',[
        ['espontanea','Espontânea'],['verbal','Ao chamado verbal'],['toque','Ao toque'],['dor','À dor'],['sem','Sem resposta']
      ]))+
      group('Orientação',select('sv2_ncons_ori',[
        ['pte','Orientado em pessoa, tempo e espaço'],['tempo','Desorientado no tempo'],['espaco','Desorientado no espaço'],['pessoa','Desorientado quanto à pessoa'],['global','Desorientação global']
      ]))+
      group('Características',[
        ['coop','Cooperativo'],['pcoop','Pouco cooperativo'],['inat','Inatenção'],['lento','Respostas lentificadas'],['incoer','Discurso incoerente'],['flut','Flutuação do nível de consciência']
      ].map(([k,l])=>check('sv2_ncons_'+k,l)).join('')),
      'RASS, Glasgow e CAM-ICU permanecem em campos próprios.');
  }

  function renderPup(current){
    return field('pup','Pupilas',current,
      group('Tamanho',select('sv2_pup_size',[
        ['mioticas','Mióticas'],['medias','Médias'],['midriaticas','Midriáticas'],['puntiformes','Puntiformes']
      ])+text('sv2_pup_od','OD mm','number')+text('sv2_pup_oe','OE mm','number'))+
      group('Simetria',select('sv2_pup_sim',[
        ['isocoricas','Isocóricas'],['anisocoricas','Anisocóricas'],['dgt','D > E'],['egt','E > D']
      ]))+
      group('Reatividade',select('sv2_pup_reac',[
        ['foto','Fotorreagentes'],['hipo','Hiporreativas'],['arre','Arreativas']
      ])+select('sv2_pup_reac_lado',[["bilat","Bilateral"],["d","Direita"],["e","Esquerda"]],'lateralidade'))+
      group('Forma',select('sv2_pup_form',[
        ['reg','Regulares / circulares'],['disc_d','Discoria à direita'],['disc_e','Discoria à esquerda'],['disc_b','Discoria bilateral']
      ]))+
      group('Especial',select('sv2_pup_special',[
        ['fix_d','Pupila direita fixa e dilatada'],['fix_e','Pupila esquerda fixa e dilatada'],['posop','Alteração pupilar pós-operatória'],['na','Não avaliável']
      ])),
      'Discoria é alteração da forma; não é presumida apenas por cirurgia de catarata.');
  }

  function renderMv(current){
    return field('mv','Murmúrio vesicular',current,
      group('Intensidade',select('sv2_mv_int',[
        ['pres','Preservado'],['dim','Diminuído'],['muito_dim','Muito diminuído'],['abol','Abolido']
      ]))+
      group('Localização',select('sv2_mv_loc',LOC)),
      'Intensidade e localização são independentes.');
  }

  function advRow(i){
    return `<div class="sv2-list-row" data-row="${i}">
      ${select(`sv2_adv_type_${i}`,[['roncos','Roncos'],['sibilos','Sibilos'],['crep','Crepitações'],['estridor','Estridor'],['atrito','Atrito pleural'],['bronq','Respiração brônquica / sopro tubário'],['silencio','Silêncio auscultatório']],'achado')}
      ${select(`sv2_adv_fase_${i}`,[['insp','Inspiratórios'],['exp','Expiratórios'],['bif','Inspiratórios e expiratórios']],'fase')}
      ${select(`sv2_adv_tipo_${i}`,[['finas','Finas'],['grossas','Grossas']],'tipo')}
      ${select(`sv2_adv_qtd_${i}`,[['esc','Escassos/as'],['mod','Moderados/as'],['ab','Abundantes']],'quantidade')}
      ${select(`sv2_adv_dist_${i}`,[['focal','Focais'],['esparso','Esparsos/as'],['difuso','Difusos/as']],'distribuição')}
      ${select(`sv2_adv_loc_${i}`,LOC,'localização')}
      <button type="button" class="sv2-remove" onclick="SemiologiaV2.removeRow(this,'adv')">×</button>
    </div>`;
  }
  function renderAdv(current){
    return field('adv','Ruídos adventícios',current,
      `<div id="sv2_adv_rows">${advRow(0)}</div><button type="button" class="sv2-add" onclick="SemiologiaV2.addAdv()">+ adicionar achado</button>`,
      'Aceita vários achados simultâneos e localizações diferentes.');
  }

  function renderAust(current){
    return field('aust','Ausculta cardíaca',current,
      group('Bulhas',select('sv2_aust_bulhas',[
        ['bnf','Normofonéticas'],['hipo','Hipofonéticas'],['hiper','Hiperfonéticas'],['abaf','Abafadas']
      ]))+
      group('Sons adicionais',[
        ['b3','B3'],['b4','B4'],['p2','P2 hiperfonética'],['click','Clique sistólico'],['estalido','Estalido de abertura'],['atrito','Atrito pericárdico']
      ].map(([k,l])=>check('sv2_aust_'+k,l)).join('')+select('sv2_aust_b2',[
        ['fisio','B2: desdobramento fisiológico'],['amplo','B2: desdobramento amplo'],['fixo','B2: desdobramento fixo'],['paradox','B2: desdobramento paradoxal']
      ],'desdobramento de B2'))+
      group('Sopro',select('sv2_aust_sopro',[
        ['sistolico','Sistólico'],['holossistolico','Holossistólico'],['diastolico','Diastólico'],['continuo','Contínuo'],['sem','Sem sopros']
      ])+select('sv2_aust_grau',['1/6','2/6','3/6','4/6','5/6','6/6'],'intensidade')+
      select('sv2_aust_foco',[
        ['aortico','Foco aórtico'],['pulmonar','Foco pulmonar'],['tricuspide','Foco tricúspide'],['mitral','Foco mitral'],['bee','Borda esternal esquerda']
      ],'foco')+
      select('sv2_aust_irrad',[
        ['sem','Sem irradiação'],['carotidas','Carótidas'],['axila','Axila'],['dorso','Dorso'],['esternal','Borda esternal']
      ],'irradiação')+
      select('sv2_aust_timbre',[
        ['suave','Suave'],['rude','Rude / áspero'],['soproso','Soproso'],['aspirativo','Aspirativo'],['musical','Musical']
      ],'timbre')),
      'O ritmo permanece no campo Ritmo; aqui ficam bulhas, sons adicionais e sopros.');
  }

  const PULSE_TERR = [
    ['rad_d','Radial D'],['rad_e','Radial E'],['bra_d','Braquial D'],['bra_e','Braquial E'],['fem_d','Femoral D'],['fem_e','Femoral E'],
    ['pop_d','Poplíteo D'],['pop_e','Poplíteo E'],['tib_d','Tibial posterior D'],['tib_e','Tibial posterior E'],['ped_d','Pedioso D'],['ped_e','Pedioso E']
  ];
  const PULSE_LABEL = Object.fromEntries(PULSE_TERR);
  function pulseRow(i){
    return `<div class="sv2-list-row" data-row="${i}">
      ${select(`sv2_perf_pterr_${i}`,PULSE_TERR,'território')}
      ${select(`sv2_perf_pqual_${i}`,[['normal','Normal'],['dim','Diminuído'],['fil','Filiforme'],['aus','Ausente'],['dop','Apenas ao Doppler']],'pulso')}
      <button type="button" class="sv2-remove" onclick="SemiologiaV2.removeRow(this,'perf')">×</button>
    </div>`;
  }
  function renderPerf(current){
    return field('perf','Perfusão / exame arterial',current,
      group('Perfusão geral',select('sv2_perf_tec',[
        ['lt2','TEC <2 s'],['2a3','TEC 2–3 s'],['gt3','TEC >3 s']
      ])+text('sv2_perf_tecn','TEC em segundos','number')+
      select('sv2_perf_temp',[["quentes","Extremidades quentes"],["normo","Normotérmicas"],["frias","Extremidades frias"]],'temperatura')+
      select('sv2_perf_cor',[["coradas","Coradas"],["palidas","Pálidas"],["cianoticas","Cianóticas"],["moteadas","Moteadas / marmóreas"]],'coloração'))+
      group('Pulsos arteriais',`<div id="sv2_perf_rows">${pulseRow(0)}</div><button type="button" class="sv2-add" onclick="SemiologiaV2.addPulse()">+ adicionar pulso</button>`)+
      group('Sinais de isquemia',[['dor','Dor'],['palidez','Palidez'],['frialdade','Frialdade'],['parestesia','Parestesia'],['paresia','Paresia/paralisia'],['cianose','Cianose'],['moteamento','Moteamento']].map(([k,l])=>check('sv2_perf_'+k,l)).join('')),
      'Perfusão geral e pulsos por território ficam separados.');
  }

  function renderEdema(current){
    return field('edema','Edema',current,
      group('Intensidade',select('sv2_edema_grau',[['1','1+/4+'],['2','2+/4+'],['3','3+/4+'],['4','4+/4+'],['anasarca','Anasarca'],['aus','Ausente']]))+
      group('Localização',select('sv2_edema_loc',[
        ['mmii','Membros inferiores'],['mmss','Membros superiores'],['pes','Pés'],['tornoz','Tornozelos'],['pernas','Pernas'],['coxas','Coxas'],['maos','Mãos'],['face','Face'],['peri','Periorbitário'],['sacral','Sacral'],['abd','Parede abdominal'],['genital','Genital / escrotal'],['geral','Generalizado']
      ]))+
      group('Lateralidade',select('sv2_edema_lado',[
        ['d','Direita'],['e','Esquerda'],['bilat','Bilateral'],['sim','Simétrico'],['assim','Assimétrico']
      ]))+
      group('Extensão',select('sv2_edema_ext',[
        ['distal','Distal'],['tornoz','Até tornozelos'],['pernas','Até pernas'],['joelhos','Até joelhos'],['coxas','Até coxas']
      ]))+
      group('Características',[['cacifo','Com cacifo'],['semcacifo','Sem cacifo'],['mole','Mole'],['indurado','Endurecido/indurado'],['doloroso','Doloroso'],['indolor','Indolor'],['quente','Quente'],['hiper','Hiperemiado']].map(([k,l])=>check('sv2_edema_'+k,l)).join('')),
      'Grau e extensão anatômica são independentes.');
  }

  const ABD_LOC=[['epig','epigástrio'],['hcd','hipocôndrio direito'],['hce','hipocôndrio esquerdo'],['fd','flanco direito'],['fe','flanco esquerdo'],['meso','mesogástrio'],['fid','fossa ilíaca direita'],['fie','fossa ilíaca esquerda'],['hipog','hipogástrio']];
  const ABD_LOC_LABEL=Object.fromEntries(ABD_LOC);
  function renderAbd(current){
    return field('abd','Abdome',current,
      group('Aspecto',select('sv2_abd_aspect',[["plano","Plano"],["globoso","Globoso"],["dist","Distendido"],["escav","Escavado"]])+select('sv2_abd_cons',[["flacido","Flácido"],["tenso","Tenso"]],'consistência'))+
      group('Dor',select('sv2_abd_dor',[["indolor","Indolor"],["difusa","Doloroso difusamente"],["local","Doloroso localizado"],["na","Não avaliável"]])+select('sv2_abd_dorloc',ABD_LOC,'localização'))+
      group('Peritonismo',select('sv2_abd_def',[["aus","Defesa ausente"],["loc","Defesa localizada"],["dif","Defesa difusa"]])+select('sv2_abd_rig',[["aus","Rigidez ausente"],["loc","Rigidez localizada"],["dif","Rigidez difusa / em tábua"]])+select('sv2_abd_db',[["neg","DB negativa"],["pos","DB positiva"],["na","DB não avaliável"]])+select('sv2_abd_dbloc',ABD_LOC,'localização da DB'))+
      group('Outros',[['massa','Massa palpável'],['hepato','Hepatomegalia'],['espleno','Esplenomegalia'],['ascite','Ascite'],['ferida','Ferida operatória'],['ostomia','Ostomia']].map(([k,l])=>check('sv2_abd_'+k,l)).join('')),
      'RHA permanecem em campo próprio.');
  }

  const LPP_LOC=[
    ['sacral','Sacral'],['coccix','Coccígea'],['calc_d','Calcâneo D'],['calc_e','Calcâneo E'],['mal_d','Maléolo D'],['mal_e','Maléolo E'],
    ['troc_d','Trocânter D'],['troc_e','Trocânter E'],['isq_d','Tuberosidade isquiática D'],['isq_e','Tuberosidade isquiática E'],
    ['glutea','Glútea'],['occip','Occipital'],['esc_d','Escápula D'],['esc_e','Escápula E'],['cot_d','Cotovelo D'],['cot_e','Cotovelo E'],
    ['joe_d','Joelho D'],['joe_e','Joelho E'],['pe','Face lateral do pé'],['dedos','Dedos / hálux'],['aur','Auricular'],['nasal','Nasal'],['mento','Mentoniana'],['disp','Relacionada a dispositivo'],['outro','Outro']
  ];
  const LPP_LOC_LABEL=Object.fromEntries(LPP_LOC);
  function lppRow(i){
    return `<div class="sv2-lesion" data-row="${i}">
      <div class="sv2-list-row">${select(`sv2_lpp_loc_${i}`,LPP_LOC,'local')}${select(`sv2_lpp_stage_${i}`,[['1','Estágio 1'],['2','Estágio 2'],['3','Estágio 3'],['4','Estágio 4'],['nc','Não classificável'],['ptp','Lesão tissular profunda']],'classificação')}<button type="button" class="sv2-remove" onclick="SemiologiaV2.removeRow(this,'lpp')">×</button></div>
      <div class="sv2-list-row">${text(`sv2_lpp_c_${i}`,'comprimento cm','number')}${text(`sv2_lpp_l_${i}`,'largura cm','number')}${text(`sv2_lpp_p_${i}`,'profundidade cm','number')}${select(`sv2_lpp_leito_${i}`,[['gran','Granulação'],['esfacelo','Fibrina/esfacelo'],['nec','Necrose'],['misto','Misto']],'leito')}</div>
      <div class="sv2-list-row">${select(`sv2_lpp_exq_${i}`,[['aus','Exsudato ausente'],['peq','Pequeno'],['mod','Moderado'],['ab','Abundante']],'exsudato')}${select(`sv2_lpp_ext_${i}`,[['seroso','Seroso'],['sero','Serossanguinolento'],['sang','Sanguinolento'],['pur','Purulento']],'tipo')}${select(`sv2_lpp_peri_${i}`,[['integra','Pele íntegra'],['hiper','Hiperemiada'],['mac','Macerada'],['edem','Edemaciada'],['ind','Endurecida']],'perilesional')}</div>
      <div class="sv2-row">${check(`sv2_lpp_odor_${i}`,'Odor')}${check(`sv2_lpp_tunel_${i}`,'Tunelização')}${check(`sv2_lpp_cav_${i}`,'Cavitação/descolamento')}${select(`sv2_lpp_exp_${i}`,[['subq','Subcutâneo exposto'],['fascia','Fáscia exposta'],['musculo','Músculo exposto'],['tendao','Tendão exposto'],['osso','Osso exposto']],'exposição')}</div>
    </div>`;
  }
  function renderLpp(current){
    return field('lpp','Lesão por pressão',current,
      `<div class="sv2-row" style="margin-bottom:8px">${check('sv2_lpp_none','Sem lesão por pressão')}</div><div id="sv2_lpp_rows">${lppRow(0)}</div><button type="button" class="sv2-add" onclick="SemiologiaV2.addLpp()">+ adicionar lesão</button>`,
      'Permite registrar múltiplas lesões, cada uma com localização e características próprias.');
  }

  function syncNcons(){
    const em={alerta:'alerta e vígil',sonolento:'sonolento',letargico:'letárgico',obnubilado:'obnubilado',confuso:'confuso',agitado:'agitado',torporoso:'torporoso',comatoso:'comatoso/não responsivo'};
    const rm={espontanea:'com resposta espontânea',verbal:'desperta/responde ao chamado verbal',toque:'responde ao toque',dor:'responde apenas a estímulo doloroso',sem:'sem resposta a estímulos'};
    const om={pte:'orientado em pessoa, tempo e espaço',tempo:'desorientado no tempo',espaco:'desorientado no espaço',pessoa:'desorientado quanto à pessoa',global:'com desorientação global'};
    const extras=[['coop','cooperativo'],['pcoop','pouco cooperativo'],['inat','com inatenção'],['lento','com respostas lentificadas'],['incoer','com discurso incoerente'],['flut','com flutuação do nível de consciência']].filter(([k])=>checked('sv2_ncons_'+k)).map(x=>x[1]);
    const st=val('sv2_ncons_estado'); const response=st==='comatoso'?'sem resposta a estímulos':rm[val('sv2_ncons_resp')]; const orientation=(st==='comatoso'||st==='torporoso')?'':om[val('sv2_ncons_ori')]; return [em[st],response,orientation,extras.join(', ')].filter(Boolean).join(', ');
  }
  function syncPup(){
    if(val('sv2_pup_special')==='na') return 'Pupilas não avaliáveis';
    const parts=[]; const od=val('sv2_pup_od'), oe=val('sv2_pup_oe');
    if(od||oe) parts.push(`pupilas${od?` OD ${od} mm`:''}${oe?` OE ${oe} mm`:''}`);
    const sm={mioticas:'mióticas',medias:'de tamanho médio',midriaticas:'midriáticas',puntiformes:'puntiformes'}; if(sm[val('sv2_pup_size')]) parts.push(sm[val('sv2_pup_size')]);
    const sy={isocoricas:'isocóricas',anisocoricas:'anisocóricas',dgt:'anisocóricas, D > E',egt:'anisocóricas, E > D'}; if(sy[val('sv2_pup_sim')]) parts.push(sy[val('sv2_pup_sim')]);
    const re={foto:'fotorreagentes',hipo:'hiporreativas',arre:'arreativas'}, lado={bilat:'bilateralmente',d:'à direita',e:'à esquerda'}; if(re[val('sv2_pup_reac')]) parts.push(compact([re[val('sv2_pup_reac')],lado[val('sv2_pup_reac_lado')]]));
    const fm={reg:'regulares/circulares',disc_d:'com discoria à direita',disc_e:'com discoria à esquerda',disc_b:'com discoria bilateral'}; if(fm[val('sv2_pup_form')]) parts.push(fm[val('sv2_pup_form')]);
    const sp={fix_d:'pupila direita fixa e dilatada',fix_e:'pupila esquerda fixa e dilatada',posop:'alteração pupilar pós-operatória'}; if(sp[val('sv2_pup_special')]) parts.push(sp[val('sv2_pup_special')]);
    return parts.join(', ');
  }
  function syncMv(){
    const im={pres:'MV preservado',dim:'MV diminuído',muito_dim:'MV muito diminuído',abol:'MV abolido'};
    return compact([im[val('sv2_mv_int')],LOC_LABEL[val('sv2_mv_loc')]]);
  }
  function syncAdv(){
    const out=[]; document.querySelectorAll('#sv2_adv_rows .sv2-list-row').forEach(r=>{
      const i=r.dataset.row, t=val(`sv2_adv_type_${i}`); if(!t) return;
      const loc=LOC_LABEL[val(`sv2_adv_loc_${i}`)]||'';
      if(t==='estridor') out.push(compact(['estridor',loc]));
      else if(t==='atrito') out.push(compact(['atrito pleural',loc]));
      else if(t==='bronq') out.push(compact(['respiração brônquica/sopro tubário',loc]));
      else if(t==='silencio') out.push(compact(['silêncio auscultatório',loc]));
      else {
        const qtd=val(`sv2_adv_qtd_${i}`), dist=val(`sv2_adv_dist_${i}`), fase=val(`sv2_adv_fase_${i}`), tipo=val(`sv2_adv_tipo_${i}`);
        const qm=t==='crep'?{esc:'escassas',mod:'moderadas',ab:'abundantes'}:{esc:'escassos',mod:'moderados',ab:'abundantes'};
        const dm=t==='crep'?{focal:'focais',esparso:'esparsas',difuso:'difusas'}:{focal:'focais',esparso:'esparsos',difuso:'difusos'};
        if(t==='roncos') out.push(compact(['roncos',qm[qtd],dm[dist],loc]));
        if(t==='sibilos') out.push(compact(['sibilos',{insp:'inspiratórios',exp:'expiratórios',bif:'inspiratórios e expiratórios'}[fase],qm[qtd],dm[dist],loc]));
        if(t==='crep') out.push(compact(['crepitações',{finas:'finas',grossas:'grossas'}[tipo],qm[qtd],dm[dist],loc]));
      }
    }); return out.join('; ');
  }
  function syncAust(){
    const parts=[]; const b={bnf:'bulhas normofonéticas',hipo:'bulhas hipofonéticas',hiper:'bulhas hiperfonéticas',abaf:'bulhas abafadas'}; if(b[val('sv2_aust_bulhas')]) parts.push(b[val('sv2_aust_bulhas')]);
    const add=[['b3','B3 presente'],['b4','B4 presente'],['p2','P2 hiperfonética'],['click','clique sistólico'],['estalido','estalido de abertura'],['atrito','atrito pericárdico']].filter(([k])=>checked('sv2_aust_'+k)).map(x=>x[1]);
    const b2={fisio:'desdobramento fisiológico de B2',amplo:'desdobramento amplo de B2',fixo:'desdobramento fixo de B2',paradox:'desdobramento paradoxal de B2'}; if(b2[val('sv2_aust_b2')]) add.push(b2[val('sv2_aust_b2')]); if(add.length) parts.push(add.join(', '));
    const s=val('sv2_aust_sopro'); if(s==='sem') parts.push('sem sopros'); else if(s){ const sm={sistolico:'sopro sistólico',holossistolico:'sopro holossistólico',diastolico:'sopro diastólico',continuo:'sopro contínuo'}; const foco={aortico:'em foco aórtico',pulmonar:'em foco pulmonar',tricuspide:'em foco tricúspide',mitral:'em foco mitral',bee:'em borda esternal esquerda'}; const irr={sem:'sem irradiação',carotidas:'com irradiação para carótidas',axila:'com irradiação para axila',dorso:'com irradiação para dorso',esternal:'com irradiação pela borda esternal'}; const tim={suave:'suave',rude:'rude/áspero',soproso:'soproso',aspirativo:'aspirativo',musical:'musical'}; parts.push(compact([sm[s],val('sv2_aust_grau'),foco[val('sv2_aust_foco')],tim[val('sv2_aust_timbre')],irr[val('sv2_aust_irrad')]])); }
    return parts.join(', ');
  }
  function syncPerf(){
    const parts=[]; const tecN=val('sv2_perf_tecn'), tec={lt2:'TEC <2 s','2a3':'TEC 2–3 s',gt3:'TEC >3 s'}; if(tecN) parts.push(`TEC ${tecN} s`); else if(tec[val('sv2_perf_tec')]) parts.push(tec[val('sv2_perf_tec')]);
    const temp={quentes:'extremidades quentes',normo:'extremidades normotérmicas',frias:'extremidades frias'}, cor={coradas:'coradas',palidas:'pálidas',cianoticas:'cianóticas',moteadas:'moteadas/marmóreas'}; if(temp[val('sv2_perf_temp')]) parts.push(temp[val('sv2_perf_temp')]); if(cor[val('sv2_perf_cor')]) parts.push(cor[val('sv2_perf_cor')]);
    const pm={normal:'normal',dim:'diminuído',fil:'filiforme',aus:'ausente',dop:'detectável apenas ao Doppler'}; const pulseMap=new Map(); document.querySelectorAll('#sv2_perf_rows .sv2-list-row').forEach(r=>{ const i=r.dataset.row,t=val(`sv2_perf_pterr_${i}`),q=val(`sv2_perf_pqual_${i}`); if(t&&q) pulseMap.set(t,`pulso ${String(PULSE_LABEL[t]).toLowerCase()} ${pm[q]}`); }); const pulses=[...pulseMap.values()]; if(pulses.length) parts.push(pulses.join(', '));
    const isq=[['dor','dor'],['palidez','palidez'],['frialdade','frialdade'],['parestesia','parestesia'],['paresia','paresia/paralisia'],['cianose','cianose'],['moteamento','moteamento']].filter(([k])=>checked('sv2_perf_'+k)).map(x=>x[1]); if(isq.length) parts.push(`sinais associados: ${isq.join(', ')}`);
    return parts.join(', ');
  }
  function syncEdema(){
    const g=val('sv2_edema_grau'); if(g==='aus') return 'Sem edema'; if(g==='anasarca') return 'Anasarca';
    const loc={mmii:'em membros inferiores',mmss:'em membros superiores',pes:'em pés',tornoz:'em tornozelos',pernas:'em pernas',coxas:'em coxas',maos:'em mãos',face:'em face',peri:'periorbitário',sacral:'sacral',abd:'em parede abdominal',genital:'genital/escrotal',geral:'generalizado'};
    const lado={d:'à direita',e:'à esquerda',bilat:'bilateral',sim:'simétrico',assim:'assimétrico'}, ext={distal:'distal',tornoz:'até tornozelos',pernas:'até pernas',joelhos:'até joelhos',coxas:'até coxas'};
    const chars=[['cacifo','com cacifo'],['semcacifo','sem cacifo'],['mole','mole'],['indurado','endurecido/indurado'],['doloroso','doloroso'],['indolor','indolor'],['quente','quente'],['hiper','hiperemiado']].filter(([k])=>checked('sv2_edema_'+k)).map(x=>x[1]);
    return compact(['Edema',g?`${g}+/4+`:'',loc[val('sv2_edema_loc')],lado[val('sv2_edema_lado')],ext[val('sv2_edema_ext')],chars.length?`, ${chars.join(', ')}`:'']);
  }
  function syncAbd(){
    const parts=[]; const a={plano:'abdome plano',globoso:'abdome globoso',dist:'abdome distendido',escav:'abdome escavado'}, c={flacido:'flácido',tenso:'tenso'}; if(a[val('sv2_abd_aspect')]) parts.push(compact([a[val('sv2_abd_aspect')],c[val('sv2_abd_cons')]]));
    const d=val('sv2_abd_dor'), dl=ABD_LOC_LABEL[val('sv2_abd_dorloc')]; if(d==='indolor') parts.push('indolor à palpação'); else if(d==='difusa') parts.push('doloroso à palpação difusa'); else if(d==='local') parts.push(compact(['doloroso à palpação em',dl])); else if(d==='na') parts.push('dor não avaliável');
    const def={aus:'sem defesa',loc:'defesa localizada',dif:'defesa difusa'}, rig={aus:'sem rigidez',loc:'rigidez localizada',dif:'rigidez difusa/em tábua'}, db={neg:'descompressão brusca negativa',pos:'descompressão brusca positiva',na:'descompressão brusca não avaliável'}; if(def[val('sv2_abd_def')]) parts.push(def[val('sv2_abd_def')]); if(rig[val('sv2_abd_rig')]) parts.push(rig[val('sv2_abd_rig')]); if(db[val('sv2_abd_db')]) parts.push(compact([db[val('sv2_abd_db')],val('sv2_abd_db')==='pos'&&ABD_LOC_LABEL[val('sv2_abd_dbloc')]?`em ${ABD_LOC_LABEL[val('sv2_abd_dbloc')]}`:'']));
    const other=[['massa','massa palpável'],['hepato','hepatomegalia'],['espleno','esplenomegalia'],['ascite','ascite'],['ferida','ferida operatória'],['ostomia','ostomia']].filter(([k])=>checked('sv2_abd_'+k)).map(x=>x[1]); if(other.length) parts.push(other.join(', ')); return parts.join(', ');
  }
  function syncLpp(){
    if(checked('sv2_lpp_none')) return 'Sem lesão por pressão'; const lesions=[];
    document.querySelectorAll('#sv2_lpp_rows .sv2-lesion').forEach(r=>{ const i=r.dataset.row, loc=val(`sv2_lpp_loc_${i}`), st=val(`sv2_lpp_stage_${i}`); if(!loc&&!st) return; const p=[]; p.push(compact(['Lesão por pressão',loc?`em ${String(LPP_LOC_LABEL[loc]).toLowerCase()}`:'',st?({1:'estágio 1',2:'estágio 2',3:'estágio 3',4:'estágio 4',nc:'não classificável',ptp:'lesão tissular profunda'}[st]):''])); const c=val(`sv2_lpp_c_${i}`),l=val(`sv2_lpp_l_${i}`),pr=val(`sv2_lpp_p_${i}`); if(c||l||pr) p.push(`medindo ${c||'?'} × ${l||'?'}${pr?` × ${pr}`:''} cm`); const leito={gran:'leito de granulação',esfacelo:'leito com fibrina/esfacelo',nec:'leito necrótico',misto:'leito misto'}; if(leito[val(`sv2_lpp_leito_${i}`)]) p.push(leito[val(`sv2_lpp_leito_${i}`)]); const eq={aus:'sem exsudato',peq:'pequeno exsudato',mod:'exsudato moderado',ab:'exsudato abundante'}, et={seroso:'seroso',sero:'serossanguinolento',sang:'sanguinolento',pur:'purulento'}; if(eq[val(`sv2_lpp_exq_${i}`)]) p.push(compact([eq[val(`sv2_lpp_exq_${i}`)],et[val(`sv2_lpp_ext_${i}`)]])); const peri={integra:'pele perilesional íntegra',hiper:'pele perilesional hiperemiada',mac:'pele perilesional macerada',edem:'pele perilesional edemaciada',ind:'pele perilesional endurecida'}; if(peri[val(`sv2_lpp_peri_${i}`)]) p.push(peri[val(`sv2_lpp_peri_${i}`)]); if(checked(`sv2_lpp_odor_${i}`))p.push('odor presente'); if(checked(`sv2_lpp_tunel_${i}`))p.push('tunelização'); if(checked(`sv2_lpp_cav_${i}`))p.push('cavitação/descolamento'); const ex={subq:'subcutâneo exposto',fascia:'fáscia exposta',musculo:'músculo exposto',tendao:'tendão exposto',osso:'osso exposto'}; if(ex[val(`sv2_lpp_exp_${i}`)])p.push(ex[val(`sv2_lpp_exp_${i}`)]); lesions.push(p.join(', ')); }); return lesions.join('; ');
  }

  const syncers={ncons:syncNcons,pup:syncPup,mv:syncMv,adv:syncAdv,aust:syncAust,perf:syncPerf,edema:syncEdema,abd:syncAbd,lpp:syncLpp};
  function sync(key){
    const w=$('exf_'+key); if(!w) return; w.dataset.dirty='1'; const base=(syncers[key]&&syncers[key]())||''; const free=val(`sv2_${key}_free`); const phrase=[base,free].filter(Boolean).join(base&&free?'; ':''); const hidden=$('ex_'+key); if(hidden) hidden.value=phrase; const pv=$('sv2_preview_'+key); if(pv) pv.textContent=phrase||'Sem achado selecionado.'; const b=w.querySelector('.ex-badge'); if(b&&!w.classList.contains('ex-skipped')){ b.className='ex-badge '+(phrase?'ok':'miss'); b.textContent=phrase?'preenchido':'preencher'; }
  }
  function syncFrom(id){ const e=$(id); if(!e) return; const w=e.closest('.sv2-field'); if(!w) return; if(w.dataset.sv2Key) sync(w.dataset.sv2Key); else if(w.dataset.extraKey) syncAdditional(); }
  function clearInitial(key){ const w=$('exf_'+key); if(!w)return; w.dataset.initial=''; w.dataset.dirty='1'; const c=w.querySelector('.sv2-current'); if(c)c.remove(); const h=$('ex_'+key); if(h)h.value=''; sync(key); }
  function nextIndex(container){ let max=-1; container.querySelectorAll('[data-row]').forEach(e=>{ max=Math.max(max,parseInt(e.dataset.row,10)||0); }); return max+1; }
  function addAdv(){ const c=$('sv2_adv_rows'); if(!c)return; c.insertAdjacentHTML('beforeend',advRow(nextIndex(c))); sync('adv'); }
  function addPulse(){ const c=$('sv2_perf_rows'); if(!c)return; c.insertAdjacentHTML('beforeend',pulseRow(nextIndex(c))); sync('perf'); }
  function addLpp(){ const c=$('sv2_lpp_rows'); if(!c)return; c.insertAdjacentHTML('beforeend',lppRow(nextIndex(c))); sync('lpp'); }
  function removeRow(btn,key){ const r=btn.closest(key==='lpp'?'.sv2-lesion':'.sv2-list-row'); if(r)r.remove(); sync(key); }

  function renderAdditional(){
    return `<div class="sv2-extra-section" id="sv2_extra_section">
      <div class="sv2-section-title">Semiologia complementar</div>
      ${extraField('jugular','Turgência jugular / congestão',
        group('Jugular',select('sv2_jugular',[["aus","Ausente"],["disc","Presente discreta"],["mod","Presente moderada"],["imp","Presente importante"],["45","Turgência jugular a 45°"]]))+
        group('Refluxo hepatojugular',select('sv2_rhj',[["neg","Negativo"],["pos","Positivo"]])))}
      ${extraField('neurodesc','Neurológico descritivo',
        group('Fala',select('sv2_neuro_fala',[["normal","Normal"],["disartria","Disartria"],["afasia","Afasia"],["mutismo","Mutismo"],["incoer","Fala incoerente"]]))+
        group('Face',select('sv2_neuro_face',[["sim","Face simétrica"],["rima_d","Desvio de rima à direita"],["rima_e","Desvio de rima à esquerda"]]))+
        group('Olhar',select('sv2_neuro_olhar',[["conj","Olhar conjugado"],["d","Desvio conjugado à direita"],["e","Desvio conjugado à esquerda"],["nist","Nistagmo"]]))+
        group('Força',select('sv2_neuro_forca',[["pres","Preservada"],["paresia","Paresia"],["plegia","Plegia"]])+select('sv2_neuro_forca_loc',[["msd","MSD"],["mse","MSE"],["mid","MID"],["mie","MIE"],["hemid","Hemicorpo direito"],["hemie","Hemicorpo esquerdo"],["mmss","MMSS"],["mmii","MMII"]],'localização'))+
        group('Sensibilidade',select('sv2_neuro_sens',[["pres","Preservada"],["hipo","Hipoestesia"],["anes","Anestesia"],["parest","Parestesia"]])+text('sv2_neuro_sens_loc','localização'))+
        group('Outros',check('sv2_neuro_rig','Rigidez de nuca')+check('sv2_neuro_tremor','Tremor')+check('sv2_neuro_mio','Mioclonias')))}
      ${extraField('torax','Inspeção torácica',
        group('Expansibilidade',select('sv2_torax_exp',[["pres","Preservada e simétrica"],["dim_b","Diminuída bilateralmente"],["dim_d","Diminuída à direita"],["dim_e","Diminuída à esquerda"],["assim","Assimétrica"]]))+
        group('Outros',check('sv2_torax_paradox','Movimento paradoxal')+check('sv2_torax_enf','Enfisema subcutâneo')+check('sv2_torax_dor','Dor à palpação')+check('sv2_torax_crep','Crepitação')))}
      ${extraField('dispositivos_exame','Dispositivos — exame do sítio',
        `<div id="sv2_dev_rows">${deviceRow(0)}</div><button type="button" class="sv2-add" onclick="SemiologiaV2.addDevice()">+ adicionar dispositivo</button>`)}
    </div>`;
  }
  function extraField(key,label,body){ return `<div class="sv2-field sv2-extra" id="exf_${key}" data-extra-key="${key}"><div class="sv2-head"><span class="sv2-title">${esc(label)}</span><span class="ex-badge miss">opcional</span></div><input type="hidden" id="ex_${key}" value=""><div class="sv2-body">${body}</div><div class="sv2-preview" id="sv2_preview_${key}">Sem achado selecionado.</div><div class="sv2-free"><span>Complemento livre</span>${text(`sv2_${key}_free`,'opcional')}</div></div>`; }
  const DEV=[['tot','Tubo orotraqueal'],['tqt','Traqueostomia'],['avp','Acesso venoso periférico'],['cvc','CVC'],['picc','PICC'],['art','Cateter arterial'],['port','Port-a-Cath'],['sng','SNG'],['sne','SNE'],['gtt','Gastrostomia'],['svd','Sonda vesical'],['dt','Dreno torácico'],['da','Dreno abdominal'],['ost','Ostomia']]; const DEV_LABEL=Object.fromEntries(DEV);
  function deviceRow(i){ return `<div class="sv2-list-row" data-row="${i}">${select(`sv2_dev_type_${i}`,DEV,'dispositivo')}${select(`sv2_dev_site_${i}`,[["limpo","Sítio limpo"],["hiper","Hiperemia"],["sec","Secreção"],["sang","Sangramento"],["dor","Dor"],["edema","Edema"],["extra","Extravasamento"]],'sítio')}<button type="button" class="sv2-remove" onclick="SemiologiaV2.removeDevice(this)">×</button></div>`; }
  function addDevice(){ const c=$('sv2_dev_rows'); if(!c)return; c.insertAdjacentHTML('beforeend',deviceRow(nextIndex(c))); syncAdditional(); }
  function removeDevice(btn){ const r=btn.closest('.sv2-list-row'); if(r)r.remove(); syncAdditional(); }
  function syncAdditional(){
    const jm={aus:'Sem turgência jugular',disc:'Turgência jugular discreta',mod:'Turgência jugular moderada',imp:'Turgência jugular importante','45':'Turgência jugular a 45°'}, rh={neg:'refluxo hepatojugular negativo',pos:'refluxo hepatojugular positivo'}; setExtra('jugular',[jm[val('sv2_jugular')],rh[val('sv2_rhj')],val('sv2_jugular_free')].filter(Boolean).join(', '));
    const fala={normal:'fala normal',disartria:'disartria',afasia:'afasia',mutismo:'mutismo',incoer:'fala incoerente'}, face={sim:'face simétrica',rima_d:'desvio de rima à direita',rima_e:'desvio de rima à esquerda'}, olhar={conj:'olhar conjugado',d:'desvio conjugado do olhar à direita',e:'desvio conjugado do olhar à esquerda',nist:'nistagmo'}, forca={pres:'força preservada',paresia:'paresia',plegia:'plegia'}, floc={msd:'em MSD',mse:'em MSE',mid:'em MID',mie:'em MIE',hemid:'em hemicorpo direito',hemie:'em hemicorpo esquerdo',mmss:'em MMSS',mmii:'em MMII'}, sens={pres:'sensibilidade preservada',hipo:'hipoestesia',anes:'anestesia',parest:'parestesia'}; const no=[fala[val('sv2_neuro_fala')],face[val('sv2_neuro_face')],olhar[val('sv2_neuro_olhar')],compact([forca[val('sv2_neuro_forca')],floc[val('sv2_neuro_forca_loc')]]),compact([sens[val('sv2_neuro_sens')],val('sv2_neuro_sens_loc')?`em ${val('sv2_neuro_sens_loc')}`:'']),checked('sv2_neuro_rig')?'rigidez de nuca':'',checked('sv2_neuro_tremor')?'tremor':'',checked('sv2_neuro_mio')?'mioclonias':'',val('sv2_neurodesc_free')].filter(Boolean).join(', '); setExtra('neurodesc',no);
    const ex={pres:'expansibilidade torácica preservada e simétrica',dim_b:'expansibilidade torácica diminuída bilateralmente',dim_d:'expansibilidade torácica diminuída à direita',dim_e:'expansibilidade torácica diminuída à esquerda',assim:'expansibilidade torácica assimétrica'}; const to=[ex[val('sv2_torax_exp')],checked('sv2_torax_paradox')?'movimento torácico paradoxal':'',checked('sv2_torax_enf')?'enfisema subcutâneo':'',checked('sv2_torax_dor')?'dor à palpação torácica':'',checked('sv2_torax_crep')?'crepitação torácica':'',val('sv2_torax_free')].filter(Boolean).join(', '); setExtra('torax',to);
    const sm={limpo:'sítio limpo',hiper:'hiperemia no sítio',sec:'secreção no sítio',sang:'sangramento no sítio',dor:'dor no sítio',edema:'edema no sítio',extra:'extravasamento'}; const ds=[]; document.querySelectorAll('#sv2_dev_rows .sv2-list-row').forEach(r=>{const i=r.dataset.row,t=val(`sv2_dev_type_${i}`),s=val(`sv2_dev_site_${i}`);if(t)ds.push(compact([DEV_LABEL[t],sm[s]]));}); if(val('sv2_dispositivos_exame_free'))ds.push(val('sv2_dispositivos_exame_free')); setExtra('dispositivos_exame',ds.join('; '));
  }
  function setExtra(k,v){ const h=$('ex_'+k); if(h)h.value=v; const p=$('sv2_preview_'+k); if(p)p.textContent=v||'Sem achado selecionado.'; const w=$('exf_'+k),b=w&&w.querySelector('.ex-badge'); if(b){b.className='ex-badge '+(v?'ok':'miss');b.textContent=v?'preenchido':'opcional';} }

  function addStyles(){ if($('sv2_styles'))return; const s=document.createElement('style');s.id='sv2_styles';s.textContent=`
    .sv2-field{border:1px solid var(--border);border-radius:12px;padding:12px;margin:10px 0;background:rgba(0,212,255,.025)}
    .sv2-head{display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:10px}.sv2-title{font-size:12px;font-weight:700;color:var(--text)}.sv2-help{display:block;font-size:9px;color:var(--text3);margin-top:2px}.sv2-head-actions{display:flex;gap:8px;align-items:center}.sv2-skip{border:0;background:transparent;color:var(--text3);cursor:pointer;font-size:10px}
    .sv2-body{display:flex;flex-direction:column;gap:8px}.sv2-group{border-top:1px solid rgba(122,154,184,.12);padding-top:8px}.sv2-group:first-child{border-top:0;padding-top:0}.sv2-group-label{font-size:9px;text-transform:uppercase;letter-spacing:1px;color:var(--text3);margin-bottom:5px}.sv2-row,.sv2-list-row{display:flex;gap:6px;flex-wrap:wrap;align-items:center}.sv2-select,.sv2-input{background:var(--bg);border:1px solid var(--border);color:var(--text);border-radius:7px;padding:7px 8px;font-size:11px;min-height:34px}.sv2-select{max-width:220px}.sv2-input{width:145px}.sv2-check{display:inline-flex;align-items:center;gap:5px;padding:6px 8px;border:1px solid var(--border);border-radius:7px;font-size:10px;color:var(--text2);cursor:pointer}.sv2-check input{accent-color:var(--accent)}
    .sv2-current{background:rgba(0,204,136,.07);border:1px solid rgba(0,204,136,.18);border-radius:7px;padding:7px 9px;font-size:10px;color:var(--text2);margin-bottom:9px}.sv2-current button{float:right;background:transparent;border:0;color:var(--accent);cursor:pointer;font-size:9px}.sv2-preview{margin-top:9px;padding:7px 9px;border-radius:7px;background:rgba(0,212,255,.06);font-size:10px;color:var(--accent);line-height:1.5}.sv2-free{display:flex;gap:8px;align-items:center;margin-top:7px}.sv2-free span{font-size:9px;color:var(--text3)}.sv2-free .sv2-input{flex:1;width:auto}.sv2-add,.sv2-remove{border:1px solid var(--border);background:var(--surface2);color:var(--accent);border-radius:7px;padding:7px 9px;cursor:pointer;font-size:10px}.sv2-remove{color:var(--danger);padding:5px 9px}.sv2-lesion{border:1px dashed rgba(122,154,184,.25);border-radius:8px;padding:8px;margin-bottom:7px;display:flex;flex-direction:column;gap:6px}.sv2-extra-section{margin-top:18px;padding-top:12px;border-top:2px solid rgba(0,212,255,.18)}.sv2-section-title{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1.2px;color:var(--accent);margin-bottom:8px}
    @media(max-width:700px){.sv2-select,.sv2-input{max-width:none;flex:1 1 140px}.sv2-head{align-items:flex-start}.sv2-list-row{align-items:stretch}.sv2-free{align-items:stretch;flex-direction:column}}
  `;document.head.appendChild(s); }

  function mountAdditional(){ const body=$('exameBody'); if(!body||$('sv2_extra_section')||!body.children.length)return; body.insertAdjacentHTML('beforeend',renderAdditional()); }

  function install(){
    addStyles();
    const legacySel=window.exSel;
    if(typeof legacySel==='function' && !legacySel.__sv2){
      const wrapped=function(key,label,opts,v,help){
        if(!V2_KEYS.has(key)) return legacySel(key,label,opts,v,help);
        if(key==='ncons')return renderNcons(v); if(key==='pup')return renderPup(v); if(key==='mv')return renderMv(v); if(key==='adv')return renderAdv(v); if(key==='aust')return renderAust(v); if(key==='perf')return renderPerf(v); if(key==='edema')return renderEdema(v); if(key==='abd')return renderAbd(v); if(key==='lpp')return renderLpp(v); return legacySel(key,label,opts,v,help);
      }; wrapped.__sv2=true; window.exSel=wrapped;
    }
    const legacyCollect=window.collectExame;
    if(typeof legacyCollect==='function' && !legacyCollect.__sv2){
      const wrappedCollect=function(){ const o=legacyCollect.apply(this,arguments); syncAdditional(); o.jugular=val('ex_jugular'); o.neurodesc=val('ex_neurodesc'); o.torax=val('ex_torax'); o.dispositivos_exame=val('ex_dispositivos_exame'); return o; }; wrappedCollect.__sv2=true; window.collectExame=wrappedCollect;
    }
    const obs=new MutationObserver(()=>{ mountAdditional(); }); const body=$('exameBody'); if(body)obs.observe(body,{childList:true});
  }

  window.SemiologiaV2={sync,syncFrom,clearInitial,addAdv,addPulse,addLpp,removeRow,addDevice,removeDevice,syncAdditional,mountAdditional};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install); else install();
})();
