// All financial operations are local. Every result uses the complete allocation and inventory model.
function caseCloseAudit(c,through=12){
 const blockers=[],notes=[];
 if(!validateState({version:VERSION,active:c.id,cases:[c]}))return {blockers:['입력 구조 또는 값의 범위가 올바르지 않습니다.'],notes,model:null};
 const model=calculate(c),rows=model.rows.filter(r=>r.m<=through);
 if(!c.products.length)blockers.push('등록된 제품이 없습니다.');
 if(!c.rows.some(r=>r.m<=through&&['qty','production'].some(k=>typeof r[k]==='number')))blockers.push('판매량·생산량이 모두 미입력입니다.');
 for(const w of model.warnings.filter(w=>w.m<=through))(w.level==='error'||/BOM 투입비율/.test(w.message)?blockers:notes).push(w.m+'월 · '+w.product+' · '+w.message);
 for(const r of rows){
  if(Object.entries(r).some(([k,v])=>typeof v==='number'&&!Number.isFinite(v)))blockers.push(r.m+'월 · '+r.name+' · 계산 결과가 유효하지 않습니다.');
  if(r.production>0)for(const b of c.bom.filter(b=>b.product===r.product&&b.m===r.m&&b.ratio>0))if(b.currency==='USD'?!(b.usd>0&&b.fx>0):!(b.krw>0))blockers.push(r.m+'월 · '+r.name+' · '+b.material+' 자재 단가 또는 환율을 확인하세요.');
  if(Math.abs(r.openValue+r.mfgCost-r.cogs-r.closeValue)>.01)blockers.push(r.m+'월 · '+r.name+' · 재고 수불이 일치하지 않습니다.');
 }
 for(const p of model.poolChecks.filter(p=>p.m<=through))if(Math.abs(num(p.total)-num(p.allocated))>.01)blockers.push(p.m+'월 · '+p.account+' · 발생액과 배부액이 일치하지 않습니다.');
 return {blockers:[...new Set(blockers)],notes:[...new Set(notes)],model};
}
function caseAuditMarkup(a){return '<p><strong>'+(a.blockers.length?'확정 불가 · '+a.blockers.length+'건':'확정 전 검산 통과')+'</strong></p>'+(a.blockers.length?safeTable(['확인할 항목'],a.blockers.slice(0,30).map(x=>[x])):'<p>입력 구조·필수 단가·BOM·재고 수불·비용 배부를 확인했습니다.</p>')+(a.notes.length?'<p class="hint">추가 확인 '+a.notes.length+'건 · '+esc(a.notes[0])+'</p>':'')+'<p class="hint">검산 통과는 입력 정합성을 의미합니다. 모든 거래의 입력 완료나 회계 감사 의견을 의미하지 않습니다.</p>';}
function forecastThrough(c){return c.forecast?.closedThrough||0;}
function ensureRowEditable(c,table,row){ensureCaseEditable(c);const closed=forecastThrough(c);if(closed&&(table==='products'||table==='sites'||row?.m<=closed))throw Error('1~'+closed+'월은 마감되어 있습니다. 월 마감을 해제한 뒤 수정하세요.');}
function protectedMonths(c,through=forecastThrough(c)){
 if(!through)return null;
 return JSON.stringify({year:c.year,sites:c.sites,products:c.products,tables:Object.fromEntries(['rows','bom','labor','mfgPools','sgPools'].map(k=>[k,c[k].filter(r=>r.m<=through).slice().sort((a,b)=>a.id.localeCompare(b.id))]))});
}
function ensureClosedMonthsUnchanged(before,after){const closed=forecastThrough(before);if(closed&&protectedMonths(before,closed)!==protectedMonths(after,closed))throw Error('1~'+closed+'월 마감 자료를 변경할 수 없습니다. 잔여월만 선택하거나 월 마감을 해제하세요.');}
function validForecastMeta(c){const f=c.forecast;if(f===undefined)return true;return !!f&&f.version===1&&Number.isInteger(f.actualThrough)&&f.actualThrough>=0&&f.actualThrough<=12&&Number.isInteger(f.closedThrough)&&f.closedThrough>=0&&f.closedThrough<=12&&(!f.actualCaseId||typeof f.actualCaseId==='string')&&(!f.actualLabel||typeof f.actualLabel==='string');}
function makeRollingForecast(plan,actual,through,name){
 if(plan.id===actual.id||plan.year!==actual.year||actual.kind!=='실적')throw Error('같은 연도의 별도 실적 CASE를 선택하세요.');
 if(!Number.isInteger(through)||through<1||through>12)throw Error('실적 반영 월은 1~12월입니다.');
 if(!String(name).trim()||String(name).length>80)throw Error('새 CASE명은 1~80자입니다.');
 const audit=caseCloseAudit(actual,through);if(audit.blockers.length)throw Error('실적 검산 '+audit.blockers.length+'건을 먼저 해결하세요. '+audit.blockers[0]);
 const work=clone(plan),map=new Map();
 if(plan.products.length!==actual.products.length)throw Error('계획과 실적의 제품 구성이 다릅니다. 제품·SITE를 먼저 일치시키세요.');
 for(const p of plan.products){const same=actual.products.find(a=>a.id===p.id),matches=same?[same]:actual.products.filter(a=>a.name===p.name&&a.site===p.site);if(matches.length!==1||matches[0].site!==p.site)throw Error('실적 제품을 하나로 연결하지 못했습니다: '+p.name);map.set(matches[0].id,p.id);const a=matches[0];for(const k of ['openingQty','openingValue','openingDA'])work.products.find(x=>x.id===p.id)[k]=a[k];}
 for(const r of work.rows.filter(r=>r.m<=through)){const a=actual.rows.find(x=>map.get(x.product)===r.product&&x.m===r.m);if(!a||a.qty===null||a.production===null)throw Error(r.m+'월 실적 판매량·생산량을 입력하세요. 실제 0은 0으로 입력합니다.');Object.assign(r,clone(a),{id:r.id,product:r.product});}
 for(const table of ['bom','labor','mfgPools','sgPools']){
  const used=new Set(work[table].filter(r=>r.m>through).map(r=>r.id));
  const imported=actual[table].filter(r=>r.m<=through).map(r=>{const n=clone(r);if(used.has(n.id))n.id=uid();used.add(n.id);if(table==='bom'){if(!map.has(n.product))throw Error('BOM 제품 연결을 확인하세요.');n.product=map.get(n.product);}if(n.scope==='product'){if(!map.has(n.target))throw Error('제품 직접비 연결을 확인하세요.');n.target=map.get(n.target);}if(n.scope==='site'&&!plan.sites.some(s=>s.name===n.target))throw Error('공장 직접비 SITE가 다릅니다.');return n;});
  work[table]=[...imported,...work[table].filter(r=>r.m>through)];
 }
 work.id=uid();work.name=String(name).trim();work.kind='추정';work.isLocked=false;delete work.lockedAt;work.referenceId=plan.id;work.adjustments=[];delete work.variableSettings;
 work.forecast={version:1,actualThrough:through,closedThrough:through,actualCaseId:actual.id,actualLabel:actual.scenario+' / '+actual.name,at:new Date().toISOString()};
 if(!validateState({version:VERSION,active:work.id,cases:[work]}))throw Error('실적·계획 연결 검산에 실패했습니다.');return work;
}
function forecastLabel(c,m){return c.forecast?.actualThrough?(m<=c.forecast.actualThrough?'실적':'추정'):c.kind;}
function forecastToolsMarkup(){const c=active(),f=c.forecast;return '<div class="operation-tools"><div><strong>'+(f?.actualThrough?'1~'+f.actualThrough+'월 실적 · '+(f.actualThrough===12?'연간 실적 반영':(f.actualThrough+1)+'~12월 추정'):'실적과 전망')+'</strong><p class="hint">'+(f?'실적 출처: '+esc(f.actualLabel||'직접 입력')+' · '+(f.closedThrough?'1~'+f.closedThrough+'월 마감':'마감 없음'):'마감 월은 보존하고 잔여월의 가정을 조정합니다.')+'</p></div><div class="tools"><button onclick="openForecastBuilder()">실적·전망 만들기</button><button onclick="openMonthClose()">월 마감</button></div></div>';}
function openForecastBuilder(){const c=active(),actuals=state.cases.filter(a=>a.id!==c.id&&a.year===c.year&&a.kind==='실적');modal('실적·잔여월 전망','<p>현재 CASE의 잔여월 계획과 실적 CASE의 마감 월을 합쳐 새 추정 CASE를 만듭니다. 기초재고는 실적 CASE를 사용하며 이후 재고를 순서대로 다시 계산합니다.</p><label class="field">실적 CASE<select name="actual" required>'+option('','실적 CASE 선택',true)+actuals.map(a=>option(a.id,a.scenario+' / '+a.name,false)).join('')+'</select></label><label class="field">실적 반영 월<select name="through">'+Array.from({length:12},(_,i)=>option(i+1,(i+1)+'월까지',i===0)).join('')+'</select></label>'+field('name','새 추정 CASE명',c.name+' 전망','text','maxlength="80" required')+(!actuals.length?'<p class="negative">같은 연도의 실적 CASE가 없습니다. 먼저 실적 자료를 별도 CASE로 등록하세요.</p>':''),d=>{try{if(active().id!==c.id)throw Error('CASE가 바뀌었습니다. 다시 열어주세요.');const a=state.cases.find(x=>x.id===d.get('actual'));if(!a)throw Error('실적 CASE를 선택하세요.');const n=makeRollingForecast(c,a,Number(d.get('through')),d.get('name'));if(state.cases.length>=100)throw Error('CASE는 최대 100개입니다.');if(state.cases.some(x=>x.year===n.year&&x.scenario===n.scenario&&x.kind===n.kind&&x.name===n.name))throw Error('같은 이름의 추정 CASE가 있습니다.');state.cases.push(n);state.active=n.id;compareId=c.id;save();closeModal();render();toast('실적을 마감하고 추정 CASE를 만들었습니다.');}catch(e){toast(e.message);}},'새 추정 CASE 만들기');}
function setMonthClose(c,through){ensureCaseEditable(c);if(!Number.isInteger(through)||through<0||through>12)throw Error('마감 월을 확인하세요.');if(through>forecastThrough(c)){const a=caseCloseAudit(c,through);if(a.blockers.length)throw Error('마감 전 검산이 필요합니다. '+a.blockers[0]);for(const r of c.rows.filter(r=>r.m<=through))if(r.qty===null||r.production===null)throw Error('마감 월의 판매량·생산량을 입력하세요. 실제 0은 0으로 입력합니다.');}c.forecast=c.forecast||{version:1,actualThrough:c.kind==='실적'?12:0,closedThrough:0,actualLabel:'직접 입력'};c.forecast.closedThrough=through;editHistory=editHistory.filter(h=>h.data.id!==c.id);}
function openMonthClose(){const c=active(),closed=forecastThrough(c);modal('월 마감','<p>1월부터 선택 월까지의 제품 입력·BOM·공통비·기초재고·제품 구조를 보호합니다. 잔여월 입력은 계속 수정할 수 있습니다.</p><label class="field">마감 범위<select name="through">'+option(0,'마감 해제',!closed)+Array.from({length:12},(_,i)=>option(i+1,(i+1)+'월까지 마감',closed===i+1)).join('')+'</select></label><p class="hint">마감 해제는 의도적인 실적 정정에 사용합니다. 이 브라우저의 편집 보호 기능이며 접근 권한 관리 기능은 아닙니다.</p>',d=>{try{if(active().id!==c.id)throw Error('CASE가 바뀌었습니다.');setMonthClose(c,Number(d.get('through')));save();closeModal();render();}catch(e){toast(e.message);}},'마감 범위 적용');}
function operationCanEdit(table,row){try{ensureRowEditable(active(),table,row);return true;}catch(e){toast(e.message);return false;}}
function operationCanEditMonths(){const c=active(),months=monthFilter==='all'?Array.from({length:12},(_,i)=>i+1):[Number(monthFilter)];return operationCanEdit('rows',{m:Math.min(...months)});}
function paintMonthClose(){const closed=forecastThrough(active());if(!closed||!document.querySelectorAll)return;for(const [key,reg] of Object.entries(gridRegistry))for(let i=0;i<reg.rows.length;i++)if(['products','sites'].includes(reg.source)||reg.rows[i].m<=closed)for(const el of document.querySelectorAll('[data-grid="'+key+'"][data-row="'+i+'"]')){el.disabled=true;el.title='마감 월 · 월 마감 해제 후 편집';}}

function checksScreen(){return '<details class="close-audit" open><summary>CASE 확정 전 검산</summary>'+caseAuditMarkup(caseCloseAudit(active()))+'</details>'+legacyChecksScreen();}
