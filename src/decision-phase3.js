// Phase 3: direct scenario comparison, single-driver sensitivity and tornado.
const DECISION_OUTPUT_METRICS={revenue:'매출액',op:'영업이익',ebitda:'EBITDA',opMargin:'영업이익률',ebitdaMargin:'EBITDA율'};
function decisionMetricLabel(key){return DECISION_OUTPUT_METRICS[key]||key;}
function decisionMetricFormat(key,v){return key.endsWith('Margin')?percent(v):display(v)+' '+unitLabel();}
function decisionDeltaFormat(key,v){return (v>0?'+':'')+(key.endsWith('Margin')?fmt(v*100,2)+'%p':display(v)+' '+unitLabel());}
function decisionMetricCheck(key){if(!Object.hasOwn(DECISION_OUTPUT_METRICS,key))throw Error('매출액·영업이익·EBITDA·이익률 중 결과 항목을 선택하세요.');}
function decisionAdjustableScope(period='all'){const c=active(),scope=decisionScope(period);scope.months=scope.months.filter(m=>m>forecastThrough(c));return scope;}
function buildSingleSensitivity(c,axis,steps,scope,metric='op',annual=true){
 decisionMetricCheck(metric);
 const values=sensitivitySteps(steps.join(','));
 if(!SENSITIVITY_AXES[axis])throw Error('민감도 변수를 확인하세요.');
 if(!scope.months.length||scope.months.some(m=>m<=forecastThrough(c)))throw Error('마감된 실적을 제외한 조정 월을 선택하세요.');
 if(c.rows.length*values.length>60000)throw Error('계산 규모가 큽니다. 조정 기간과 증감률 조합을 줄이세요.');
 const test=clone(c);
 if(!applySensitivityAxis(test,axis,0,scope))throw Error('선택한 변수의 입력값이 없습니다. 귀속 대상과 금액을 확인하세요.');
 const resultScope={...scope,months:annual?chatAllMonths():scope.months};
 const model=calculate(c),original=aggregate(planningRowsFromModel(model,resultScope));
 if(metric.endsWith('Margin')&&!(original.revenue>0))throw Error('매출액이 없어 이익률을 계산할 수 없습니다.');
 const base=original[metric];
 if(!Number.isFinite(base))throw Error('기준 재무값이 유효하지 않습니다.');
 const cells=values.map(rate=>{
  const work=clone(c);applySensitivityAxis(work,axis,rate,scope);
  const calculated=calculate(work),a=aggregate(planningRowsFromModel(calculated,resultScope));
  if(!Number.isFinite(a[metric])||(metric.endsWith('Margin')&&!(a.revenue>0)))throw Error(rate+'% 가정에서 재무값을 계산할 수 없습니다.');
  return {rate,value:a[metric],delta:a[metric]-base,warnings:calculated.warnings.filter(w=>resultScope.months.includes(w.m)).length};
 });
 return {caseId:c.id,axis,metric,steps:values,scope:clone(scope),resultScope,base,cells};
}
function buildTornadoSensitivity(c,scope,metric='op',rate=10,annual=true){
 decisionMetricCheck(metric);
 if(!Number.isFinite(rate)||rate<=0||rate>90)throw Error('토네이도 분석의 증감 범위는 0~90%입니다.');
 const rows=[];
 for(const axis of Object.keys(SENSITIVITY_AXES)){
  // Unsupported or absent scoped drivers are excluded, never treated as a zero effect.
  try{
   const r=buildSingleSensitivity(c,axis,[-rate,0,rate],scope,metric,annual);
   rows.push({axis,label:SENSITIVITY_AXES[axis].label,base:r.base,down:r.cells[0].value,up:r.cells[2].value,downDelta:r.cells[0].delta,upDelta:r.cells[2].delta,warnings:r.cells[0].warnings+r.cells[2].warnings,score:Math.max(Math.abs(r.cells[0].delta),Math.abs(r.cells[2].delta))});
  }catch(e){
   if(!/입력값이 없습니다/.test(e.message))throw e;
  }
 }
 if(!rows.length)throw Error('선택 범위에 민감도를 계산할 변수가 없습니다.');
 rows.sort((a,b)=>b.score-a.score);
 return {caseId:c.id,metric,rate,scope:clone(scope),rows,base:rows[0].base};
}
function buildScenarioComparison(cases,scope,baseCase){
 if(!Array.isArray(cases)||cases.length<2||cases.length>8||new Set(cases.map(c=>c.id)).size!==cases.length)throw Error('서로 다른 같은 연도 CASE를 2~8개 선택하세요.');
 const year=cases[0].year;
 if(cases.some(c=>c.year!==year))throw Error('다른 연도의 CASE는 같은 월과 직접 비교할 수 없습니다.');
 const baseProduct=scope.product?baseCase?.products.find(p=>p.id===scope.product):null;
 if(scope.product&&!baseProduct)throw Error('선택된 제품이 기준 CASE에 없습니다.');
 const result=cases.map(c=>{
  let product='';
  if(baseProduct){
   const matches=c.products.filter(p=>p.name===baseProduct.name&&p.site===baseProduct.site);
   if(matches.length!==1)return {caseId:c.id,label:c.scenario+' / '+c.name,kind:c.kind,available:false,reason:'동일 제품·SITE 연결 불가'};
   product=matches[0].id;
  }
  if(scope.site&&!c.sites.some(s=>s.name===scope.site))return {caseId:c.id,label:c.scenario+' / '+c.name,kind:c.kind,available:false,reason:'동일 SITE 없음'};
  const model=calculate(c),rowScope={site:scope.site,product,months:scope.months};
  const values=aggregate(planningRowsFromModel(model,rowScope));
  const monthly=scope.months.map(month=>({month,values:aggregate(planningRowsFromModel(model,{...rowScope,months:[month]}))}));
  const missing=scope.months.some(month=>!c.rows.some(r=>r.m===month&&(!product||r.product===product)&&typeof r.qty==='number'));
  return {caseId:c.id,label:c.scenario+' / '+c.name,kind:c.kind,available:!missing,reason:missing?'미입력 월이 있어 비교에서 제외':null,values,monthly,warnings:model.warnings.length};
 });
 return {year,scope:clone(scope),cases:result};
}
let decisionSensitivityMode='single',decisionSensitivityAxis='rawPrice',decisionSensitivitySteps='-10,-5,0,5,10',decisionSensitivityRate=10,decisionSensitivityMetric='op',decisionSensitivityPeriod='all',decisionSensitivityAnnual=true,decisionSensitivityPreview=null;
function decisionSensitivityScreen(){
 const c=active(),scope=decisionAdjustableScope(decisionSensitivityPeriod);
 const key=decisionSignature(c,scope,decisionSensitivityMode,decisionSensitivityAxis,decisionSensitivitySteps,decisionSensitivityRate,decisionSensitivityMetric,decisionSensitivityAnnual);
 const result=decisionSensitivityPreview?.key===key?decisionSensitivityPreview.result:null;
 let markup='<div class="decision-controls">'+
 '<label class="field">분석 유형<select aria-label="민감도 분석 유형" onchange="decisionSensitivityMode=this.value;decisionSensitivityPreview=null;render()">'+option('single','단일 변수',decisionSensitivityMode==='single')+option('tornado','토네이도',decisionSensitivityMode==='tornado')+'</select></label>'+
 (decisionSensitivityMode==='single'?'<label class="field">변동 변수<select aria-label="단일 민감도 변수" onchange="decisionSensitivityAxis=this.value;decisionSensitivityPreview=null;render()">'+Object.entries(SENSITIVITY_AXES).map(([k,v])=>option(k,v.label,k===decisionSensitivityAxis)).join('')+'</select></label>':'')+
 '<label class="field">결과 지표<select aria-label="민감도 결과 지표" onchange="decisionSensitivityMetric=this.value;decisionSensitivityPreview=null;render()">'+Object.entries(DECISION_OUTPUT_METRICS).map(([k,v])=>option(k,v,k===decisionSensitivityMetric)).join('')+'</select></label>'+
 '<label class="field">조정 기간<select aria-label="민감도 조정 월" onchange="decisionSensitivityPeriod=this.value;decisionSensitivityPreview=null;render()">'+option('all','1~12월 (마감 제외)',decisionSensitivityPeriod==='all')+Array.from({length:12},(_,i)=>option(i+1,(i+1)+'월',decisionSensitivityPeriod===String(i+1))).join('')+'</select></label>'+
 '<label class="field">결과 기간<select aria-label="민감도 결과 기간" onchange="decisionSensitivityAnnual=this.value===\'year\';decisionSensitivityPreview=null;render()">'+option('year','연간 1~12월',decisionSensitivityAnnual)+option('scope','조정 기간만',!decisionSensitivityAnnual)+'</select></label>'+
 (decisionSensitivityMode==='single'?'<label class="field">증감률 단계 (%)<input type="text" aria-label="단일 민감도 증감률 단계" value="'+esc(decisionSensitivitySteps)+'" onchange="decisionSensitivitySteps=this.value;decisionSensitivityPreview=null;render()"></label>':'<label class="field">비교 증감률 ±%<input type="number" min="0.5" max="90" step="0.5" aria-label="토네이도 증감 범위" value="'+decisionSensitivityRate+'" onchange="decisionSensitivityRate=Number(this.value);decisionSensitivityPreview=null;render()"></label>')+
 '</div><div class="decision-commands"><button type="button" class="ghost" onclick="openSensitivity()">두 변수 교차 분석</button><button type="button" class="primary" onclick="decisionRunSensitivity()">분석 실행</button></div>';
 if(!result)return panel('민감도 분석',markup+'<p class="hint">기존 원가·재고·판관비 배부 엔진으로 결과를 매번 계산합니다. 단일 분석에는 0%를 포함한 3~9개 증감률을, 토네이도에는 동일한 ±% 가정을 적용합니다.</p>');
 const metric=result.metric;
 if(result.cells){
  markup+='<div class="decision-summary"><div><span>기준 '+esc(decisionMetricLabel(metric))+'</span><strong>'+decisionMetricFormat(metric,result.base)+'</strong></div><div><span>변동 변수</span><strong>'+esc(SENSITIVITY_AXES[result.axis].label)+'</strong></div><div><span>검토 단계</span><strong>'+result.steps.length+'개</strong></div></div>'+
    safeTable(['증감률','결과','기준 대비','검산 경고'],result.cells.map(v=>[(v.rate>0?'+':'')+fmt(v.rate,2)+'%',decisionMetricFormat(metric,v.value),decisionDeltaFormat(metric,v.delta),v.warnings+'건']))+
    '<div class="decision-commands"><button type="button" onclick="decisionDownloadSensitivity()">결과 CSV</button></div>';
 }else{
  const max=Math.max(1e-10,...result.rows.map(r=>r.score)),percentWidth=v=>Math.min(100,Math.abs(v)/max*100).toFixed(2)+'%';
  markup+='<p class="decision-footnote">동일한 ±'+fmt(result.rate,1)+'% 가정으로 비교한 영향력입니다. 순위는 기준 대비 손익 변화의 절댓값이 큰 순서이며, 원가·수량의 상호작용은 개별 분석에 포함되지 않습니다.</p>'+
   '<div class="decision-tornado">'+result.rows.map(v=>'<div class="decision-tornado-row"><span>'+esc(v.label)+'</span><div class="decision-tornado-bars"><div><i class="down" style="width:'+percentWidth(v.downDelta)+'"></i></div><div><i class="up" style="width:'+percentWidth(v.upDelta)+'"></i></div></div><strong>'+decisionDeltaFormat(metric,v.downDelta)+' / '+decisionDeltaFormat(metric,v.upDelta)+'</strong></div>').join('')+'</div>'+
   '<div class="decision-legend"><span><i class="cost"></i>하락 가정</span><span><i class="revenue"></i>상승 가정</span></div>'+
   safeTable(['변동 변수','-'+result.rate+'% 결과','+'+result.rate+'% 결과','검산'],result.rows.map(v=>[v.label,decisionMetricFormat(metric,v.down),decisionMetricFormat(metric,v.up),v.warnings+'건']));
 }
 return panel('민감도 분석',markup);
}
function decisionRunSensitivity(){
 try{
  const c=active(),scope=decisionAdjustableScope(decisionSensitivityPeriod);
  const result=decisionSensitivityMode==='single'?buildSingleSensitivity(c,decisionSensitivityAxis,sensitivitySteps(decisionSensitivitySteps),scope,decisionSensitivityMetric,decisionSensitivityAnnual):buildTornadoSensitivity(c,scope,decisionSensitivityMetric,decisionSensitivityRate,decisionSensitivityAnnual);
  decisionSensitivityPreview={key:decisionSignature(c,scope,decisionSensitivityMode,decisionSensitivityAxis,decisionSensitivitySteps,decisionSensitivityRate,decisionSensitivityMetric,decisionSensitivityAnnual),result};render();
 }catch(e){decisionSensitivityPreview=null;toast(e.message);}
}
function decisionDownloadSensitivity(){
 const result=decisionSensitivityPreview?.result;if(!result||!result.cells||result.caseId!==active().id)return;
 const ratio=result.metric.endsWith('Margin'),factor=ratio?100:1;
 download('FPA_단일민감도.csv',csvInputExport([['변수',SENSITIVITY_AXES[result.axis].label,'결과',decisionMetricLabel(result.metric)],['증감 %',ratio?'결과 %':'결과 원',ratio?'증감 %p':'증감 원','검산'],...result.cells.map(x=>[x.rate,x.value*factor,x.delta*factor,x.warnings])]),'text/csv;charset=utf-8');
}
let decisionCompareIds=null,decisionCompareMetric='op',decisionComparePreview=null;
function decisionComparisonSelected(){
 const c=active(),all=[c,...state.cases.filter(x=>x.id!==c.id&&x.year===c.year)];
 const defaults=all.slice(0,Math.min(4,all.length)).map(x=>x.id);
 const ids=decisionCompareIds===null?defaults:decisionCompareIds;
 return [...new Set(ids)].filter(id=>all.some(c=>c.id===id));
}
function decisionToggleCompare(id){
 const ids=decisionComparisonSelected();decisionCompareIds=ids.includes(id)?ids.filter(x=>x!==id):[...ids,id];decisionComparePreview=null;render();
}
function decisionComparisonScreen(){
 const c=active(),all=[c,...state.cases.filter(x=>x.id!==c.id&&x.year===c.year)],ids=decisionComparisonSelected(),scope=decisionScope();
 const selected=ids.map(id=>all.find(c=>c.id===id)).filter(Boolean);
 const key=decisionSignature(selected,scope,decisionCompareMetric);
 const result=decisionComparePreview?.key===key?decisionComparePreview.result:null;
 let markup='<div class="decision-controls"><label class="field">월별 추이 지표<select aria-label="복수 시나리오 비교 지표" onchange="decisionCompareMetric=this.value;decisionComparePreview=null;render()">'+Object.entries(DECISION_OUTPUT_METRICS).map(([k,v])=>option(k,v,k===decisionCompareMetric)).join('')+'</select></label></div>'+
 '<div class="decision-case-picker" role="group" aria-label="비교 CASE 선택">'+all.map(v=>'<label><input type="checkbox" value="'+esc(v.id)+'" '+(ids.includes(v.id)?'checked':'')+' onchange="decisionToggleCompare(this.value)"><span>'+esc(v.scenario+' / '+v.name)+'</span><small>'+esc(v.kind)+'</small></label>').join('')+'</div>'+
 '<div class="decision-commands"><button type="button" class="ghost" onclick="navigate(\'scenario\')">CASE 관리</button><button type="button" class="primary" onclick="decisionRunComparison()">CASE 비교</button></div>';
 if(!result)markup+='<p class="hint">같은 연도의 서로 다른 CASE 2~8개를 선택하세요. CASE를 복제·수정·저장·삭제하는 기존 기능은 기준정보 → 시나리오 설정에서 그대로 사용할 수 있습니다.</p>';
 else{
  const valid=result.cases.filter(r=>r.available),invalid=result.cases.filter(r=>!r.available);
  if(invalid.length)markup+='<p class="decision-footnote">비교 제외: '+invalid.map(r=>esc(r.label+' ('+r.reason+')')).join(' / ')+'</p>';
  if(valid.length>=2){
   const metrics=[['매출액','revenue'],['매출원가','cogs'],['매출총이익','gross'],['영업이익','op'],['EBITDA','ebitda'],['영업이익률','opMargin'],['EBITDA Margin','ebitdaMargin']];
   markup+=safeTable(['지표',...valid.map(r=>r.label)],metrics.map(([label,key])=>[label,...valid.map(r=>decisionMetricFormat(key,r.values[key]))]))+
    '<p class="decision-footnote">주요 가정 · 동일 제품 구성 및 입력 범위를 확인하세요. 매출 평균단가는 매출액÷판매량, 원재료 단위비용은 재료비÷생산량입니다.</p>'+
    safeTable(['가정·원가 지표',...valid.map(r=>r.label)],[['판매량 (kg)',...valid.map(r=>fmt(r.values.qty,2))],['매출 평균단가 (원/kg)',...valid.map(r=>r.values.qty>0?fmt(r.values.revenue/r.values.qty,2):'산출 불가')],['재료비 (원/kg)',...valid.map(r=>r.values.production>0?fmt(r.values.material/r.values.production,2):'산출 불가')],['판관비 (원)',...valid.map(r=>fmt(r.values.sg,2))]])+
    decisionScenarioChart(valid,decisionCompareMetric)+
    safeTable(['월',...valid.map(r=>r.label)],scope.months.map(month=>[month+'월',...valid.map(r=>decisionMetricFormat(decisionCompareMetric,r.monthly.find(x=>x.month===month)?.values[decisionCompareMetric]??0))]));
  }else markup+='<p class="hint">비교 가능한 CASE가 두 개 이상 필요합니다.</p>';
 }
 return panel('복수 시나리오 비교',markup);
}
function decisionRunComparison(){
 try{const selected=decisionComparisonSelected().map(id=>state.cases.find(c=>c.id===id)).filter(Boolean),scope=decisionScope(),result=buildScenarioComparison(selected,scope,active());decisionComparePreview={key:decisionSignature(selected,scope,decisionCompareMetric),result};render();}
 catch(e){decisionComparePreview=null;toast(e.message);}
}
function decisionScenarioChart(cases,metric){
 const values=cases.flatMap(c=>c.monthly.map(m=>m.values[metric]));
 if(!values.length)return '';
 const lo=Math.min(...values,0),hi=Math.max(...values,0),span=hi-lo||1;
 const x=i=>65+i/(11||1)*634,y=v=>220-(v-lo)/span*165;
 const palette=['var(--blue)','var(--green)','var(--red)','var(--ink)','var(--muted)','#798fe5','#7b8ca5','#b59e70'];
 return '<div class="decision-scenario-chart"><svg viewBox="0 0 760 256" role="img" aria-label="복수 CASE의 월별 '+esc(decisionMetricLabel(metric))+' 추이"><line x1="65" y1="55" x2="65" y2="220" class="bep-axis"/><line x1="65" y1="220" x2="699" y2="220" class="bep-axis"/>'+
 cases.map((c,i)=>'<polyline fill="none" stroke="'+palette[i]+'" stroke-width="2.5" points="'+c.monthly.map(m=>x(m.month-1).toFixed(1)+','+y(m.values[metric]).toFixed(1)).join(' ')+'"/>').join('')+
 '<text x="65" y="241" class="bep-chart-label">1월</text><text x="695" y="241" text-anchor="end" class="bep-chart-label">12월</text></svg><div class="decision-scenario-legend">'+cases.map((c,i)=>'<span><i style="background:'+palette[i]+'"></i>'+esc(c.label)+'</span>').join('')+'</div></div>';
}
