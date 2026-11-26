// Constrained two-driver inverse FP&A. No external solver or user-data transmission.
// The only financial oracle is calculate(c), exactly as in the regular P&L.
let decisionGoalMode='single';
let decisionMultiMetric='op',decisionMultiTarget='',decisionMultiUnit='100000000';
let decisionMultiConstraint='revenue',decisionMultiConstraintMode='hold',decisionMultiConstraintTarget='',decisionMultiConstraintUnit='100000000';
let decisionMultiX='salesPrice',decisionMultiY='rawPrice',decisionMultiPeriod='all',decisionMultiAnnual=true;
let decisionMultiXMin=-50,decisionMultiXMax=100,decisionMultiYMin=-50,decisionMultiYMax=100;
let decisionMultiPreview=null;
const decisionOriginalGoalScreen=decisionGoalScreen;
decisionGoalScreen=function(){
 return '<div class="decision-tabs decision-goal-modes" role="tablist" aria-label="목표 역산 방식">'+
  [['single','단일 변수 역산'],['multi','복수 변수·제약 역산']].map(([key,label])=>'<button type="button" role="tab" aria-selected="'+(decisionGoalMode===key)+'" class="'+(decisionGoalMode===key?'active':'')+'" onclick="decisionGoalMode=\''+key+'\';render()">'+label+'</button>').join('')+'</div>'+
  (decisionGoalMode==='single'?decisionOriginalGoalScreen():decisionMultiGoalScreen());
};
function decisionGoalBounds(bounds){
 const {xMin,xMax,yMin,yMax}=bounds;
 if(![xMin,xMax,yMin,yMax].every(Number.isFinite)||xMin< -90||yMin< -90||xMax>300||yMax>300||xMax<=xMin||yMax<=yMin)throw Error('두 변수의 최소·최대 증감률은 -90~+300%에서 최소값이 최대값보다 작아야 합니다.');
 if(!(xMin<=0&&xMax>=0&&yMin<=0&&yMax>=0))throw Error('기준 0%를 포함하는 변수 범위를 선택하세요.');
 return {xMin,xMax,yMin,yMax};
}
function goalMetricTolerance(metric,target){
 return metric.endsWith('Margin')?Math.max(1e-8,Math.abs(target)*1e-7):Math.max(.1,Math.abs(target)*1e-9);
}
function buildConstrainedGoalSeek(c,scope,metric,target,constraintMetric,constraintTarget,axisX,axisY,bounds,annual=true){
 decisionMetricCheck(metric);decisionMetricCheck(constraintMetric);
 if(metric===constraintMetric)throw Error('목표 지표와 제약 지표는 서로 달라야 합니다.');
 if(!Number.isFinite(target)||!Number.isFinite(constraintTarget))throw Error('두 목표값을 정확히 입력하세요.');
 if(!SENSITIVITY_AXES[axisX]||!SENSITIVITY_AXES[axisY]||axisX===axisY)throw Error('서로 다른 두 개의 조정 변수를 선택하세요.');
 if(!scope.months.length||scope.months.some(m=>m<=forecastThrough(c)))throw Error('마감 실적을 제외한 조정 가능한 기간을 선택하세요.');
 if(c.rows.length>1200)throw Error('제품·월 입력 규모가 큽니다. 조정 대상을 줄이세요.');
 const box=decisionGoalBounds(bounds),resultScope={...scope,months:annual?chatAllMonths():scope.months};
 const baseline=aggregate(planningRowsFromModel(calculate(c),resultScope));
 if((metric.endsWith('Margin')||constraintMetric.endsWith('Margin'))&&!(baseline.revenue>0))throw Error('매출액이 없어 이익률 조건을 계산할 수 없습니다.');
 const probe=clone(c);
 if(!applySensitivityAxis(probe,axisX,0,scope)||!applySensitivityAxis(probe,axisY,0,scope))throw Error('조정할 변수에 유효한 입력값이 없습니다.');
 const cache=new Map();
 const scale=[metric,constraintMetric].map((m,i)=>Math.max(m.endsWith('Margin')?.01:1,Math.abs(i?constraintTarget:target),Math.abs(baseline[m])));
 const tol=[goalMetricTolerance(metric,target),goalMetricTolerance(constraintMetric,constraintTarget)];
 let evaluations=0;
 const evaluate=(x,y)=>{
  const tag=x.toFixed(9)+'|'+y.toFixed(9);
  if(cache.has(tag))return cache.get(tag);
  if(++evaluations>550)throw Error('최대 계산 횟수를 초과했습니다. 조정 범위를 좁혀 주세요.');
  const work=clone(c);
  applySensitivityAxis(work,axisX,x,scope);applySensitivityAxis(work,axisY,y,scope);
  const model=calculate(work),values=aggregate(planningRowsFromModel(model,resultScope));
  if(![values[metric],values[constraintMetric]].every(Number.isFinite)||((metric.endsWith('Margin')||constraintMetric.endsWith('Margin'))&&values.revenue<=0))throw Error('조정 구간의 매출액 또는 손익값이 유효하지 않습니다.');
  const diff=[values[metric]-target,values[constraintMetric]-constraintTarget];
  const f=diff.map((v,i)=>v/scale[i]);
  const candidate={rates:[x,y],values,diff,score:Math.hypot(...f),f,warnings:model.warnings};
  cache.set(tag,candidate);return candidate;
 };
 const clamp=(v,low,high)=>Math.max(low,Math.min(high,v));
 const solver=(sx,sy)=>{
  let p;try{p=evaluate(sx,sy);}catch(e){return null;}
  const valid=q=>Math.abs(q.diff[0])<=tol[0]&&Math.abs(q.diff[1])<=tol[1];
  for(let j=0;j<34;j++){
   if(valid(p))return p;
   const [x,y]=p.rates;
   const hx=Math.max(.02,Math.min(.3,Math.abs(x)*.003)),hy=Math.max(.02,Math.min(.3,Math.abs(y)*.003));
   const x1=clamp(x+(x+hx<=box.xMax?hx:-hx),box.xMin,box.xMax);
   const y1=clamp(y+(y+hy<=box.yMax?hy:-hy),box.yMin,box.yMax);
   if(x1===x||y1===y)break;
   let px,py;try{px=evaluate(x1,y);py=evaluate(x,y1);}catch(e){break;}
   const a=(px.f[0]-p.f[0])/(x1-x),b=(py.f[0]-p.f[0])/(y1-y);
   const cc=(px.f[1]-p.f[1])/(x1-x),d=(py.f[1]-p.f[1])/(y1-y);
   const det=a*d-b*cc;
   if(!Number.isFinite(det)||Math.abs(det)<1e-13)break;
   let dx=(-p.f[0]*d+b*p.f[1])/det,dy=(cc*p.f[0]-a*p.f[1])/det;
   if(!Number.isFinite(dx)||!Number.isFinite(dy))break;
   const limit=40,stepLimit=Math.max(1,Math.abs(dx)/limit,Math.abs(dy)/limit);
   dx/=stepLimit;dy/=stepLimit;
   let next=null;
   for(const alpha of [1,.5,.25,.125,.0625,.03125]){
    const nx=clamp(x+alpha*dx,box.xMin,box.xMax),ny=clamp(y+alpha*dy,box.yMin,box.yMax);
    if(nx===x&&ny===y)continue;
    let trial;try{trial=evaluate(nx,ny);}catch(e){continue;}
    if(trial.score<p.score*(1-1e-8)){next=trial;break;}
   }
   if(!next)break;
   p=next;
  }
  return valid(p)?p:null;
 };
 const seeds=[[0,0],[box.xMin,box.yMin],[box.xMax,box.yMax],[box.xMin,box.yMax],[box.xMax,box.yMin],[(box.xMin+box.xMax)/2,(box.yMin+box.yMax)/2]];
 const solved=[];
 for(const [x,y] of seeds){
  const s=solver(x,y);
  if(s&&!solved.some(z=>Math.hypot(z.rates[0]-s.rates[0],z.rates[1]-s.rates[1])<.02))solved.push(s);
 }
 const common={metric,target,constraintMetric,constraintTarget,axisX,axisY,bounds:clone(box),scope:clone(scope),resultScope,base:baseline,sourceId:c.id,sourceFingerprint:JSON.stringify(c),evaluations};
 if(solved.length!==1)return {...common,available:false,solutions:solved.length,reason:solved.length>1?'지정된 범위에서 조건을 동시에 만족하는 해가 복수 발견됐습니다. 범위를 좁히거나 다른 제약을 선택하세요.':'지정된 범위에서 두 조건을 동시에 달성하는 검증된 해를 찾지 못했습니다. 제약이 충돌하거나 변수 효과가 독립적이지 않을 수 있습니다.'};
 const best=solved[0],validation=evaluate(...best.rates);
 if(validation.diff.some((v,i)=>Math.abs(v)>tol[i]))throw Error('제약조건의 손익 검산이 일치하지 않습니다.');
 return {...common,available:true,rates:best.rates,achieved:[validation.values[metric],validation.values[constraintMetric]],residuals:validation.diff,warnings:validation.warnings,solutions:1};
}
function goalSeekDraftConstrainedCase(c,result,name){
 if(!result?.available||c.id!==result.sourceId||result.sourceFingerprint!==JSON.stringify(c))throw Error('기준 CASE가 변경됐습니다. 다시 역산하세요.');
 if(typeof name!=='string'||!name.trim()||name.trim().length>80)throw Error('새 CASE명을 1~80자로 지정하세요.');
 const copy=clone(c);
 applySensitivityAxis(copy,result.axisX,result.rates[0],result.scope);
 applySensitivityAxis(copy,result.axisY,result.rates[1],result.scope);
 const a=aggregate(planningRowsFromModel(calculate(copy),result.resultScope));
 for(const [i,m] of [result.metric,result.constraintMetric].entries()){
  const target=i?result.constraintTarget:result.target;
  if(!Number.isFinite(a[m])||Math.abs(a[m]-target)>goalMetricTolerance(m,target))throw Error('새 CASE의 '+decisionMetricLabel(m)+' 목표 검증에 실패했습니다.');
 }
 copy.id=uid();copy.name=name.trim();copy.kind='추정';copy.scenario='Custom Case';copy.referenceId=c.id;copy.isLocked=false;delete copy.lockedAt;copy.adjustments=[];
 if(!validateState({version:VERSION,active:copy.id,cases:[copy]}))throw Error('복수 목표 CASE 구조 검증에 실패했습니다.');
 return copy;
}
function decisionMultiGoalScreen(){
 const c=active(),scope=decisionAdjustableScope(decisionMultiPeriod);
 const current=aggregate(planningRowsFromModel(calculate(c),{...scope,months:decisionMultiAnnual?chatAllMonths():scope.months}));
 const tMetric=decisionMultiMetric.endsWith('Margin'),hold=decisionMultiConstraintMode==='hold',cMetric=decisionMultiConstraint.endsWith('Margin');
 const targetView=decisionMultiTarget||'',guardValue=hold?current[decisionMultiConstraint]:null;
 const key=decisionSignature(c,scope,decisionMultiMetric,decisionMultiTarget,decisionMultiUnit,decisionMultiConstraint,decisionMultiConstraintMode,decisionMultiConstraintTarget,decisionMultiConstraintUnit,decisionMultiX,decisionMultiY,decisionMultiXMin,decisionMultiXMax,decisionMultiYMin,decisionMultiYMax,decisionMultiAnnual);
 const result=decisionMultiPreview?.key===key?decisionMultiPreview.result:null;
 let ui='<div class="decision-controls">'+
 '<label class="field">목표 성과<select onchange="decisionMultiMetric=this.value;decisionMultiPreview=null;render()">'+Object.entries(DECISION_OUTPUT_METRICS).map(([k,v])=>option(k,v,k===decisionMultiMetric)).join('')+'</select></label>'+
 '<label class="field">목표값<input type="number" step="any" value="'+esc(targetView)+'" onchange="decisionMultiTarget=this.value;decisionMultiPreview=null;render()" aria-label="복수 목표 목표값"></label>'+
 (tMetric?'<div class="decision-goal-unit">목표 단위 %</div>':'<label class="field">목표 금액 단위<select onchange="decisionMultiUnit=this.value;decisionMultiPreview=null;render()">'+[['1','원'],['1000000','백만원'],['100000000','억원']].map(([k,v])=>option(k,v,k===decisionMultiUnit)).join('')+'</select></label>')+
 '<label class="field">추가 제약 지표<select onchange="decisionMultiConstraint=this.value;decisionMultiPreview=null;render()">'+Object.entries(DECISION_OUTPUT_METRICS).map(([k,v])=>option(k,v,k===decisionMultiConstraint)).join('')+'</select></label>'+
 '<label class="field">제약값 설정<select onchange="decisionMultiConstraintMode=this.value;decisionMultiPreview=null;render()">'+option('hold','기준 값 유지',hold)+option('target','사용자 지정',!hold)+'</select></label>'+
 (!hold?'<label class="field">제약 목표값<input type="number" step="any" aria-label="추가 제약 목표값" value="'+esc(decisionMultiConstraintTarget)+'" onchange="decisionMultiConstraintTarget=this.value;decisionMultiPreview=null;render()"></label>':'<div class="decision-goal-unit">유지 값: '+decisionMetricFormat(decisionMultiConstraint,guardValue)+'</div>')+
 (!hold&&!cMetric?'<label class="field">제약 금액 단위<select onchange="decisionMultiConstraintUnit=this.value;decisionMultiPreview=null;render()">'+[['1','원'],['1000000','백만원'],['100000000','억원']].map(([k,v])=>option(k,v,k===decisionMultiConstraintUnit)).join('')+'</select></label>':'')+
 '<label class="field">첫 번째 조정 변수<select onchange="decisionMultiX=this.value;decisionMultiPreview=null;render()">'+Object.entries(SENSITIVITY_AXES).map(([k,v])=>option(k,v.label,k===decisionMultiX)).join('')+'</select></label>'+
 '<label class="field">두 번째 조정 변수<select onchange="decisionMultiY=this.value;decisionMultiPreview=null;render()">'+Object.entries(SENSITIVITY_AXES).map(([k,v])=>option(k,v.label,k===decisionMultiY)).join('')+'</select></label>'+
 '<label class="field">조정 기간<select onchange="decisionMultiPeriod=this.value;decisionMultiPreview=null;render()">'+option('all','1~12월 (마감 제외)',decisionMultiPeriod==='all')+Array.from({length:12},(_,i)=>option(i+1,(i+1)+'월',decisionMultiPeriod===String(i+1))).join('')+'</select></label>'+
 '<label class="field">성과 측정 기간<select onchange="decisionMultiAnnual=this.value===\'year\';decisionMultiPreview=null;render()">'+option('year','연간 1~12월',decisionMultiAnnual)+option('scope','조정 기간',!decisionMultiAnnual)+'</select></label></div>'+
 '<div class="decision-goal-limits"><p>변수별 허용 증감률 범위 (%) · 0을 포함해야 합니다</p><div class="decision-controls">'+
 [['decisionMultiXMin','첫 번째 하한',decisionMultiXMin],['decisionMultiXMax','첫 번째 상한',decisionMultiXMax],['decisionMultiYMin','두 번째 하한',decisionMultiYMin],['decisionMultiYMax','두 번째 상한',decisionMultiYMax]].map(([name,label,value])=>'<label class="field">'+label+'<input type="number" min="-90" max="300" step="1" value="'+value+'" onchange="'+name+'=Number(this.value);decisionMultiPreview=null;render()"></label>').join('')+'</div></div>'+
 '<div class="decision-commands"><button type="button" class="primary" onclick="decisionRunMultiGoal()">두 조건 동시 역산</button></div>';
 if(result){
  if(!result.available)ui+='<p class="decision-notice">'+esc(result.reason)+'</p>';
  else ui+='<div class="decision-summary"><div><span>'+esc(SENSITIVITY_AXES[result.axisX].label)+'</span><strong>'+(result.rates[0]>0?'+':'')+fmt(result.rates[0],3)+'%</strong></div><div><span>'+esc(SENSITIVITY_AXES[result.axisY].label)+'</span><strong>'+(result.rates[1]>0?'+':'')+fmt(result.rates[1],3)+'%</strong></div><div><span>재계산 횟수</span><strong>'+result.evaluations+'회</strong></div></div>'+
  safeTable(['구분','요구 조건','계산 결과','차이'],[[decisionMetricLabel(result.metric),decisionMetricFormat(result.metric,result.target),decisionMetricFormat(result.metric,result.achieved[0]),decisionDeltaFormat(result.metric,result.residuals[0])],[decisionMetricLabel(result.constraintMetric),decisionMetricFormat(result.constraintMetric,result.constraintTarget),decisionMetricFormat(result.constraintMetric,result.achieved[1]),decisionDeltaFormat(result.constraintMetric,result.residuals[1])]])+
  '<p class="decision-footnote">전체 원가·재고·배부 계산 엔진으로 재검산했습니다. 검산 경고 '+result.warnings.length+'건. 다중 시작점을 이용한 수치 해석 결과이며 모든 가능한 해의 전역적 유일성을 보장하지는 않습니다.</p><div class="decision-commands"><button type="button" onclick="decisionApplyMultiGoal()">새 CASE로 적용…</button></div>';
 }else ui+='<p class="decision-footnote">두 조정 변수와 두 개의 독립적인 재무 목표를 동시에 풀어냅니다. 예: 매출액을 유지하면서 영업이익을 개선할 단가·원재료비 변화. 목표값은 절대액이며, 기준 대비 50억원 개선을 원할 때에는 현재 영업이익 + 50억원을 입력하세요. 이 모형은 비용을 임의 배부하지 않으며 해가 없는 경우 임의의 수치를 제시하지 않습니다.</p>';
 return panel('복수 변수 목표 역산 · 2개 제약',ui);
}
function decisionRunMultiGoal(){
 try{
  const c=active(),scope=decisionAdjustableScope(decisionMultiPeriod);
  const metric=decisionMultiMetric,condition=decisionMultiConstraint;
  const target=goalSeekTarget(metric,decisionMultiTarget,decisionMultiUnit);
  const actual=aggregate(planningRowsFromModel(calculate(c),{...scope,months:decisionMultiAnnual?chatAllMonths():scope.months}));
  const constraintTarget=decisionMultiConstraintMode==='hold'?actual[condition]:goalSeekTarget(condition,decisionMultiConstraintTarget,decisionMultiConstraintUnit);
  const box={xMin:decisionMultiXMin,xMax:decisionMultiXMax,yMin:decisionMultiYMin,yMax:decisionMultiYMax};
  const result=buildConstrainedGoalSeek(c,scope,metric,target,condition,constraintTarget,decisionMultiX,decisionMultiY,box,decisionMultiAnnual);
  const key=decisionSignature(c,scope,decisionMultiMetric,decisionMultiTarget,decisionMultiUnit,decisionMultiConstraint,decisionMultiConstraintMode,decisionMultiConstraintTarget,decisionMultiConstraintUnit,decisionMultiX,decisionMultiY,decisionMultiXMin,decisionMultiXMax,decisionMultiYMin,decisionMultiYMax,decisionMultiAnnual);
  decisionMultiPreview={key,result};render();
 }catch(e){decisionMultiPreview=null;toast(e.message);}
}
function decisionApplyMultiGoal(){
 const p=decisionMultiPreview?.result;
 if(!p?.available||p.sourceId!==active().id){toast('복수 목표 역산을 먼저 실행하세요.');return;}
 modal('복수 목표 시나리오 생성','<p>'+esc(SENSITIVITY_AXES[p.axisX].label)+' '+fmt(p.rates[0],3)+'% · '+esc(SENSITIVITY_AXES[p.axisY].label)+' '+fmt(p.rates[1],3)+'%</p><p>원본 CASE는 변경하지 않고, 새로운 추정 CASE를 생성합니다.</p><p class="hint">검산 경고 '+p.warnings.length+'건</p>'+field('name','새 CASE명',active().name+' 복수 목표','text','required maxlength="80"'),data=>{
  try{
   if(p.warnings.some(w=>w.level==='error'))throw Error('오류 수준의 검산 경고를 해결한 뒤 적용하세요.');
   if(state.cases.length>=100)throw Error('CASE는 최대 100개입니다.');
   const next=goalSeekDraftConstrainedCase(active(),p,String(data.get('name')||''));
   if(state.cases.some(x=>x.year===next.year&&x.scenario===next.scenario&&x.name===next.name&&x.kind===next.kind))throw Error('같은 이름의 CASE가 있습니다.');
   state.cases.push(next);state.active=next.id;compareId=p.sourceId;save();closeModal();render();toast('두 목표를 재검산한 새 CASE를 생성했습니다.');
  }catch(e){toast(e.message);}
 },'확인 후 새 CASE 생성');
}
