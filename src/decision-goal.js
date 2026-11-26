// Phase 4 · Single-driver Goal Seek: numerical inversion of the actual FPA calculation engine.
// Read-only until the user explicitly approves creating a new CASE.
let decisionGoalMetric='op',decisionGoalDriver='salesPrice',decisionGoalValue='',decisionGoalUnit='100000000',decisionGoalPeriod='all',decisionGoalAnnual=true,decisionGoalPreview=null;
function goalSeekTarget(metric,input,unit=1){
 decisionMetricCheck(metric);
 const amount=Number(input);
 if(String(input).trim()===''||!Number.isFinite(amount))throw Error('목표 수치를 정확히 입력하세요.');
 if(metric.endsWith('Margin')){if(amount< -100||amount>100)throw Error('목표 이익률은 -100~100% 범위여야 합니다.');return amount/100;}
 const scale=Number(unit);
 if(![1,1000000,100000000].includes(scale))throw Error('목표 금액 단위를 확인하세요.');
 const target=amount*scale;
 if(!Number.isFinite(target)||Math.abs(target)>1e16)throw Error('목표 금액이 계산 범위를 벗어났습니다.');
 return target;
}
function buildGoalSeek(c,scope,metric,target,axis,annual=true){
 decisionMetricCheck(metric);
 if(!SENSITIVITY_AXES[axis])throw Error('조정 변수를 확인하세요.');
 if(!Number.isFinite(target))throw Error('목표값은 유한한 숫자여야 합니다.');
 if(!scope.months.length||scope.months.some(m=>m<=forecastThrough(c)))throw Error('마감 실적을 제외한 조정 가능한 기간을 선택하세요.');
 if(c.rows.length>1200)throw Error('계산 규모가 큽니다. 분석 대상 또는 월 범위를 줄이세요.');
 if(c.products.length===0)throw Error('제품이 등록되어 있지 않습니다.');
 const resultScope={...scope,months:annual?chatAllMonths():scope.months};
 const original=aggregate(planningRowsFromModel(calculate(c),resultScope));
 if(metric.endsWith('Margin')&&original.revenue<=0)throw Error('매출액이 없으므로 이익률 목표를 계산할 수 없습니다.');
 const originalValue=original[metric];
 if(!Number.isFinite(originalValue))throw Error('기준 실적이 유효하지 않습니다.');
 const probe=clone(c);
 if(!applySensitivityAxis(probe,axis,0,scope))throw Error('선택한 조정 변수의 입력값이 없습니다.');
 const cache=new Map(),threshold=Math.max(metric.endsWith('Margin')?1e-9:.01,Math.abs(target)*(metric.endsWith('Margin')?1e-7:1e-9));
 const run=rate=>{
  if(cache.has(rate))return cache.get(rate);
  const work=clone(c);
  const changed=applySensitivityAxis(work,axis,rate,scope);
  if(!changed)throw Error('변경 가능한 입력이 없습니다.');
  const model=calculate(work),a=aggregate(planningRowsFromModel(model,resultScope));
  if(!Number.isFinite(a[metric])||(metric.endsWith('Margin')&&a.revenue<=0))throw Error('분석 범위의 매출액 또는 손익 결과가 유효하지 않습니다.');
  const result={rate,metric,value:a[metric],error:a[metric]-target,warnings:model.warnings.filter(w=>resultScope.months.includes(w.m))};
  cache.set(rate,result);return result;
 };
 const rates=[-90,-75,-50,-25,-10,0,10,25,50,75,100,150,200,300];
 const samples=rates.map(run);
 const intervals=[];
 for(let i=0;i<samples.length;i++){
  const s=samples[i];
  if(Math.abs(s.error)<=threshold)intervals.push([s,s]);
  if(i&&Math.sign(s.error)!==Math.sign(samples[i-1].error))intervals.push([samples[i-1],s]);
 }
 const solutions=[];
 for(let [lo,hi] of intervals){
  let root=lo;
  if(lo.rate!==hi.rate){
   for(let j=0;j<64;j++){
    const mid=run((lo.rate+hi.rate)/2);
    root=mid;
    if(Math.abs(mid.error)<=threshold)break;
    if(Math.sign(mid.error)===Math.sign(lo.error))lo=mid;else hi=mid;
   }
  }
  if(Math.abs(root.error)<=threshold&&!solutions.some(s=>Math.abs(s.rate-root.rate)<1e-5))solutions.push(root);
 }
 if(solutions.length!==1)return {available:false,reason:solutions.length>1?'동일 목표를 달성하는 변동률이 둘 이상입니다. 단일한 해를 확정하지 않았습니다.':'지정한 -90~+300% 조정 범위에서 목표를 달성하는 해가 확인되지 않았습니다.',metric,axis,target,base:originalValue,scope,resultScope,samples,solutions:solutions.length};
 const solved=solutions[0];
 return {available:true,metric,axis,target,base:originalValue,rate:solved.rate,achieved:solved.value,residual:solved.error,warnings:solved.warnings,scope:clone(scope),resultScope,sourceId:c.id,sourceFingerprint:JSON.stringify(c)};
}
function goalSeekDraftCase(c,result,name){
 if(!result.available||result.sourceId!==c.id||result.sourceFingerprint!==JSON.stringify(c))throw Error('기준 CASE 또는 입력값이 바뀌었습니다. 역산을 다시 실행하세요.');
 if(typeof name!=='string'||!name.trim()||name.trim().length>80)throw Error('새 CASE명은 1~80자로 입력하세요.');
 const work=clone(c);
 const count=applySensitivityAxis(work,result.axis,result.rate,result.scope);
 if(!count)throw Error('적용할 변수가 없습니다.');
 work.id=uid();work.scenario='Custom Case';work.kind='추정';work.name=name.trim();work.referenceId=c.id;work.isLocked=false;delete work.lockedAt;work.adjustments=[];
 if(!validateState({version:VERSION,active:work.id,cases:[work]}))throw Error('역산 CASE의 입력 구조 검증에 실패했습니다.');
 const a=aggregate(planningRowsFromModel(calculate(work),result.resultScope));
 const achieved=a[result.metric];
 const tolerance=Math.max(result.metric.endsWith('Margin')?1e-9:.01,Math.abs(result.target)*(result.metric.endsWith('Margin')?1e-7:1e-9));
 if(!Number.isFinite(achieved)||Math.abs(achieved-result.target)>tolerance)throw Error('새 CASE에서 목표 금액이 재현되지 않았습니다.');
 return work;
}
function decisionGoalScreen(){
 const c=active(),scope=decisionAdjustableScope(decisionGoalPeriod),unit=decisionGoalMetric.endsWith('Margin')?'%':decisionGoalUnit;
 const key=decisionSignature(c,scope,decisionGoalMetric,decisionGoalDriver,decisionGoalValue,unit,decisionGoalAnnual);
 const result=decisionGoalPreview?.key===key?decisionGoalPreview.result:null;
 let ui='<div class="decision-controls">'+
 '<label class="field">목표 성과<select aria-label="목표 역산 성과" onchange="decisionGoalMetric=this.value;decisionGoalPreview=null;render()">'+Object.entries(DECISION_OUTPUT_METRICS).map(([id,label])=>option(id,label,id===decisionGoalMetric)).join('')+'</select></label>'+
 '<label class="field">조정 변수<select aria-label="목표 역산 조정 변수" onchange="decisionGoalDriver=this.value;decisionGoalPreview=null;render()">'+Object.entries(SENSITIVITY_AXES).map(([id,entry])=>option(id,entry.label,id===decisionGoalDriver)).join('')+'</select></label>'+
 '<label class="field">조정 기간<select aria-label="목표 역산 조정 기간" onchange="decisionGoalPeriod=this.value;decisionGoalPreview=null;render()">'+option('all','1~12월 (마감 제외)',decisionGoalPeriod==='all')+Array.from({length:12},(_,i)=>option(i+1,(i+1)+'월',decisionGoalPeriod===String(i+1))).join('')+'</select></label>'+
 '<label class="field">실적 판단 기간<select aria-label="목표 역산 결과 기간" onchange="decisionGoalAnnual=this.value===\'all\';decisionGoalPreview=null;render()">'+option('all','연간 1~12월',decisionGoalAnnual)+option('scope','조정 기간만',!decisionGoalAnnual)+'</select></label>'+
 '<label class="field">목표값<input aria-label="목표 역산 금액 또는 이익률" type="number" step="any" placeholder="'+(decisionGoalMetric.endsWith('Margin')?'예: 15':'예: 700')+'" value="'+esc(decisionGoalValue)+'" onchange="decisionGoalValue=this.value;decisionGoalPreview=null;render()"></label>'+
 (decisionGoalMetric.endsWith('Margin')?'<div class="decision-goal-unit">% · 이익률 목표</div>':'<label class="field">목표 금액 단위<select aria-label="목표 금액 단위" onchange="decisionGoalUnit=this.value;decisionGoalPreview=null;render()">'+option('1','원',decisionGoalUnit==='1')+option('1000000','백만원',decisionGoalUnit==='1000000')+option('100000000','억원',decisionGoalUnit==='100000000')+'</select></label>')+
 '</div><div class="decision-commands"><button type="button" class="primary" onclick="decisionRunGoal()">필요 변화율 계산</button></div>';
 if(result){
  if(!result.available)ui+='<p class="decision-notice">'+esc(result.reason)+'</p>';
  else ui+='<div class="decision-summary"><div><span>현재 '+esc(decisionMetricLabel(result.metric))+'</span><strong>'+decisionMetricFormat(result.metric,result.base)+'</strong></div><div><span>목표 성과</span><strong>'+decisionMetricFormat(result.metric,result.target)+'</strong></div><div><span>필요한 '+esc(SENSITIVITY_AXES[result.axis].label)+' 변화</span><strong>'+((result.rate>0?'+':'')+fmt(result.rate,3))+'%</strong></div></div>'+
   '<p class="decision-footnote">재계산된 '+esc(decisionMetricLabel(result.metric))+' '+decisionMetricFormat(result.metric,result.achieved)+' · 목표와의 차이 '+decisionDeltaFormat(result.metric,result.residual)+' · 경고 '+result.warnings.length+'건</p>'+
   '<div class="decision-commands"><button type="button" onclick="decisionApplyGoal()">새 CASE로 적용…</button></div>';
 }else ui+='<p class="decision-footnote">기존 손익 엔진을 이용한 단일 변수 수치 역산입니다. 조정 가능 범위는 현재 입력값 대비 -90~+300%이며, 해가 없거나 여러 개인 경우 자동 적용하지 않습니다. 복수 변수·매출 유지 등의 복합 제약 최적화는 아직 지원하지 않습니다.</p>';
 return panel('목표 역산 · Goal Seek',ui);
}
function decisionRunGoal(){
 try{
  const c=active(),scope=decisionAdjustableScope(decisionGoalPeriod),target=goalSeekTarget(decisionGoalMetric,decisionGoalValue,decisionGoalUnit);
  const result=buildGoalSeek(c,scope,decisionGoalMetric,target,decisionGoalDriver,decisionGoalAnnual);
  decisionGoalPreview={key:decisionSignature(c,scope,decisionGoalMetric,decisionGoalDriver,decisionGoalValue,decisionGoalMetric.endsWith('Margin')?'%':decisionGoalUnit,decisionGoalAnnual),result};render();
 }catch(e){decisionGoalPreview=null;toast(e.message);}
}
function decisionApplyGoal(){
 const p=decisionGoalPreview?.result;
 if(!p?.available||p.sourceId!==active().id){toast('목표 역산을 다시 실행하세요.');return;}
 const label=SENSITIVITY_AXES[p.axis].label,rate=(p.rate>0?'+':'')+fmt(p.rate,3)+'%';
 modal('목표 역산 시나리오 생성','<p><strong>'+esc(label)+' '+rate+'</strong> 변경 조건을 새 CASE에 적용합니다.</p><p>기준 CASE는 보존되며, 현재 CASE의 잔여월에만 변화율을 적용합니다.</p><p class="hint">'+(p.warnings.some(w=>w.level==='error')?'재계산에 오류 수준 경고가 있어 적용이 차단됩니다.':'검산 경고 '+p.warnings.length+'건')+'</p>'+field('name','새 CASE명',active().name+' 목표 달성','text','required maxlength="80"'),data=>{
  try{
   if(p.warnings.some(w=>w.level==='error'))throw Error('계산 경고를 해결한 뒤 적용하세요.');
   if(state.cases.length>=100)throw Error('CASE는 최대 100개입니다.');
   const next=goalSeekDraftCase(active(),p,String(data.get('name')||''));
   if(state.cases.some(x=>x.year===next.year&&x.scenario===next.scenario&&x.name===next.name&&x.kind===next.kind))throw Error('같은 이름의 추정 CASE가 있습니다.');
   state.cases.push(next);state.active=next.id;compareId=p.sourceId;save();closeModal();render();toast('원본을 보존하고 목표 역산 CASE를 생성했습니다.');
  }catch(e){toast(e.message);}
 },'확인 후 새 CASE 생성');
}
