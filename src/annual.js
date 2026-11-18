// Annual comparison reads each complete CASE before filtering; allocation pools
// and financial inputs are never modified by selecting a comparison.
let annualUI=null;
function annualPreferences(){
  if(annualUI)return annualUI;
  let stored=null;try{stored=JSON.parse(localStorage.getItem(workspaceStorageKey()+'-annual-compare')||'null');}catch{}
  annualUI={year:active().year,selections:{},site:'',product:'',bridge:'current'};
  if(stored&&typeof stored==='object'){
    if(Number.isInteger(stored.year)&&stored.year>=2000&&stored.year<=2200)annualUI.year=stored.year;
    if(stored.selections&&typeof stored.selections==='object'&&!Array.isArray(stored.selections))for(const [year,id] of Object.entries(stored.selections))if(/^\d{4}$/.test(year)&&typeof id==='string')annualUI.selections[year]=id;
    if(typeof stored.site==='string')annualUI.site=stored.site;
    if(typeof stored.product==='string')annualUI.product=stored.product;
    if(['current','next','span'].includes(stored.bridge))annualUI.bridge=stored.bridge;
  }
  return annualUI;
}
function saveAnnualPreferences(){try{localStorage.setItem(workspaceStorageKey()+'-annual-compare',JSON.stringify(annualPreferences()));}catch{toast('비교 선택을 저장하지 못했습니다. 화면에서는 계속 비교할 수 있습니다.');}}
function selectAnnualYear(value){const year=Number(value);if(!Number.isInteger(year)||year<2000||year>2200)return;annualPreferences().year=year;saveAnnualPreferences();render();}
function selectAnnualCase(year,id){if(id&&!state.cases.some(c=>c.id===id&&c.year===year))return;annualPreferences().selections[year]=id;saveAnnualPreferences();render();}
function selectAnnualScope(key,value){if(!['site','product'].includes(key))return;annualPreferences()[key]=value;if(key==='site')annualUI.product='';saveAnnualPreferences();render();}
function selectAnnualBridge(value){if(!['current','next','span'].includes(value))return;annualPreferences().bridge=value;saveAnnualPreferences();render();}
function annualCaseForYear(year){
  const ui=annualPreferences(),candidates=state.cases.filter(c=>c.year===year);
  if(Object.hasOwn(ui.selections,year))return candidates.find(c=>c.id===ui.selections[year])||null;
  if(active().year===year)return active();
  return candidates.length===1?candidates[0]:null;
}
function annualInputMonths(c){
  const populated=r=>Object.entries(r).some(([key,value])=>!['m','id','product','currency'].includes(key)&&typeof value==='number'&&Number.isFinite(value));
  return new Set([...c.rows,...c.bom,...c.labor,...c.mfgPools,...c.sgPools].filter(populated).map(r=>r.m)).size;
}
function annualSnapshot(c,scope={site:'',product:''}){
  if(!c)return {data:null,reason:'CASE 미선택',warnings:[],months:0};
  const months=annualInputMonths(c);
  if(!months)return {data:null,reason:'입력 전',warnings:[],months};
  if(scope.site&&!c.sites.some(s=>s.name===scope.site))return {data:null,reason:'공장 미등록',warnings:[],months};
  if(scope.product&&!c.products.some(p=>p.id===scope.product&&(!scope.site||p.site===scope.site)))return {data:null,reason:'제품 미등록',warnings:[],months};
  const result=calculate(c),rows=result.rows.filter(r=>(!scope.site||r.site===scope.site)&&(!scope.product||r.product===scope.product));
  if(!rows.length)return {data:null,reason:'비교 범위 없음',warnings:result.warnings,months};
  const data=aggregate(rows);data.avgPrice=data.qty?data.revenue/data.qty:null;
  if(!data.revenue){data.opMargin=null;data.ebitdaMargin=null;}
  if(!data.production)data.matPerKg=null;
  return {data,reason:'',warnings:result.warnings,months};
}
function annualProfitChange(before,after){
  if(!before||!after)return null;
  const steps=[{label:'매출액 변화',amount:after.revenue-before.revenue},{label:'매출원가 변화',amount:before.cogs-after.cogs},{label:'판관비 변화',amount:before.sg-after.sg}];
  return {start:before.op,end:after.op,delta:after.op-before.op,steps,reconciliation:after.op-before.op-sum(steps.map(x=>x.amount))};
}
function annualValue(value,type){return value===null||value===undefined?'—':display(value,type);}
function annualDifference(before,after,key,type){
  if(!before||!after||before[key]===null||after[key]===null)return '—';
  const value=after[key]-before[key],sign=value>0?'+':'';
  return sign+(type==='rate'?fmt(value*100,1)+'%p':display(value,type));
}
function annualCompareScreen(){
  const ui=annualPreferences(),years=[ui.year-1,ui.year,ui.year+1],cases=years.map(annualCaseForYear),snapshots=cases.map(c=>annualSnapshot(c,ui));
  const yearOptions=[...new Set([...state.cases.map(c=>c.year),ui.year])].sort((a,b)=>a-b);
  let html='<div class="annual-toolbar"><label>기준연도<select aria-label="연도 비교 기준연도" onchange="selectAnnualYear(this.value)">'+yearOptions.map(y=>option(y,y+'년',y===ui.year)).join('')+'</select></label><span>연도마다 비교할 CASE를 하나씩 선택하세요.</span></div><div class="annual-cases">';
  for(let i=0;i<3;i++){
    const year=years[i],c=cases[i],candidates=state.cases.filter(x=>x.year===year),snapshot=snapshots[i],label=['전년','기준연도','차년'][i];
    html+='<section class="annual-case"><div><strong>'+year+'년</strong><span>'+label+'</span></div><select aria-label="'+year+'년 비교 CASE" onchange="selectAnnualCase('+year+',this.value)" '+(!candidates.length?'disabled':'')+'>'+option('',candidates.length?'CASE 선택':'등록된 CASE 없음',!c)+candidates.map(x=>option(x.id,x.scenario+' / '+x.name+' · '+x.kind,x.id===c?.id)).join('')+'</select><div class="annual-case-meta">'+(c?'<span class="badge">'+esc(c.kind)+'</span><span>입력월 '+snapshot.months+'/12</span>'+(!snapshot.data?'<span>'+esc(snapshot.reason)+'</span>':'')+(snapshot.warnings.length?'<span class="negative">검산 '+snapshot.warnings.length+'건</span>':''):'<span>'+(!candidates.length?'상단 복제로 해당 연도 CASE를 만들 수 있습니다.':'비교할 CASE를 선택하세요.')+'</span>')+'</div></section>';
  }
  html+='</div>';
  const sites=[...new Set(cases.filter(Boolean).flatMap(c=>c.sites.map(s=>s.name)))].sort(),products=new Map();
  for(const c of cases.filter(Boolean))for(const p of c.products)if(!ui.site||p.site===ui.site)products.set(p.id,p);
  html+='<div class="annual-scope"><label>공장<select aria-label="연도 비교 공장" onchange="selectAnnualScope(\'site\',this.value)">'+option('','전체 공장',!ui.site)+sites.map(s=>option(s,s,s===ui.site)).join('')+(!sites.includes(ui.site)&&ui.site?option(ui.site,ui.site+' · 미등록',true):'')+'</select></label><label>제품<select aria-label="연도 비교 제품" onchange="selectAnnualScope(\'product\',this.value)">'+option('','전체 제품',!ui.product)+[...products.values()].map(p=>option(p.id,p.name+' · '+p.site,p.id===ui.product)).join('')+(!products.has(ui.product)&&ui.product?option(ui.product,'선택 제품 · 미등록',true):'')+'</select></label><span>1~12월 합계 · 같은 제품 ID 기준</span></div>';
  const header=years.map((year,i)=>year+'년'+(cases[i]?' · '+cases[i].kind:'')),metrics=[PNL[0],['production','생산수량','qty'],...PNL.slice(1),['avgPrice','kg당 평균 판가','unitCost']];
  const body='<div class="gridwrap"><table class="annual-table"><thead><tr>'+th('항목')+header.map((label,i)=>'<th>'+esc(label)+(cases[i]?'<small class="annual-source">'+esc(cases[i].scenario+' / '+cases[i].name)+'</small>':'')+'</th>').join('')+th(years[0]+'→'+years[1]+' 증감')+th(years[1]+'→'+years[2]+' 증감')+'</tr></thead><tbody>'+metrics.map(([key,label,type,cls])=>'<tr class="'+(cls||'')+'">'+td(esc(label))+snapshots.map(s=>td(annualValue(s.data?.[key],type))).join('')+td(annualDifference(snapshots[0].data,snapshots[1].data,key,type))+td(annualDifference(snapshots[1].data,snapshots[2].data,key,type))+'</tr>').join('')+'</tbody></table></div><div class="measure">금액: '+unitLabel()+' / 수량: kg / kg당 금액: 원/kg / 이익률 차이: %p</div>';
  html+=panel('연도별 손익',body,'<button class="mini-button" onclick="exportVisible()">CSV 내보내기</button>');
  const pairs={current:[0,1],next:[1,2],span:[0,2]},pair=pairs[ui.bridge],before=snapshots[pair[0]],after=snapshots[pair[1]],bridge=annualProfitChange(before.data,after.data);
  const choices='<select aria-label="연도별 증감 분석 구간" onchange="selectAnnualBridge(this.value)">'+Object.entries(pairs).map(([key,[a,b]])=>option(key,years[a]+'년 → '+years[b]+'년',key===ui.bridge)).join('')+'</select>';
  let explanation='<div class="annual-empty">선택한 두 연도의 CASE와 입력 자료가 있으면 영업이익 증감을 분석합니다.</div>';
  if(bridge){
    const max=Math.max(1,...bridge.steps.map(s=>Math.abs(s.amount))),signed=v=>(v>0?'+':'')+display(v);
    explanation='<div class="annual-bridge-summary"><div><span>'+years[pair[0]]+'년 영업이익</span><strong>'+display(bridge.start)+'</strong></div><div><span>'+years[pair[1]]+'년 영업이익</span><strong>'+display(bridge.end)+'</strong></div><div><span>영업이익 증감</span><strong class="'+(bridge.delta<0?'negative':'annual-positive')+'">'+signed(bridge.delta)+'</strong></div></div><div class="annual-contributions">'+bridge.steps.map(s=>'<div class="annual-contribution"><span>'+esc(s.label)+'</span><div class="annual-contribution-track"><i class="'+(s.amount<0?'down':'up')+'" style="'+(s.amount<0?'right':'left')+':50%;width:'+Math.abs(s.amount)/max*50+'%"></i></div><strong class="'+(s.amount<0?'negative':'annual-positive')+'">'+signed(s.amount)+'</strong></div>').join('')+'</div><p class="annual-equation">영업이익 증감 = 매출액 증감 − 매출원가 증감 − 판관비 증감 · 단위: '+unitLabel()+'</p>';
    if(Math.abs(bridge.reconciliation)>.01)explanation+='<p class="annual-warning">손익 대사 차이 '+fmt(bridge.reconciliation)+'원 · 원본 CASE 검산을 확인하세요.</p>';
    if(before.warnings.length||after.warnings.length)explanation+='<p class="annual-warning">선택한 CASE에 검산 경고가 있어 가계산으로 표시합니다.</p>';
    if(before.months<12||after.months<12)explanation+='<p class="annual-warning">입력월이 12개월 미만인 CASE가 포함되어 있습니다. 현재 입력된 금액만 비교하며 연간으로 환산하지 않습니다.</p>';
  }
  html+=panel('영업이익 증감 구성',explanation,choices);
  html+='<div class="note">자료월은 수량·단가·비용 등 입력값이 하나라도 있는 월이며, 월 마감 완료를 뜻하지 않습니다. 같은 연도의 여러 CASE를 합산하지 않습니다. CASE 선택·비교는 입력값과 배부 기준을 바꾸지 않습니다. 공장·제품 필터는 전체 CASE의 배부 계산이 끝난 뒤 적용합니다. 공장명 또는 제품 ID가 일치하지 않는 연도와 입력 전 CASE는 0 대신 —로 표시합니다. 제품 ID가 다른 연도는 전체 제품 기준으로 비교하거나 기준정보를 맞추세요. 비율은 연간 합계로 다시 계산하며, 분모가 0이면 —로 표시합니다. 증감 구성은 회계 항목별 대사이며 가격·물량·환율별 원인 분해를 의미하지 않습니다.</div>';
  return html;
}
