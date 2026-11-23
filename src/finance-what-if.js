'use strict';
// Read-only sensitivity estimates for finance metrics. Not a driver-based recalculation.
const FINANCE_WHATIF_KEYS=new Set(['revenue','op','ebitda']);
function financeWhatIfCandidate(text,context=null){
 const query=financeNaturalQuestion(text),n=chatNorm(query);
 const values=financeMetricMatches(query);
 const hasMetric=values.some(t=>FINANCE_WHATIF_KEYS.has(t.metric.key));
 const previous=!!(context?.whatIfMetricKey&&FINANCE_WHATIF_KEYS.has(context.whatIfMetricKey));
 if(!hasMetric&&!previous)return false;
 if(!/(?:%|퍼센트|프로|몇퍼)/.test(n))return false;
 if(!/(?:오르|오를|올라|올랐|상승|증가|늘|높아|인상|개선|내리|내릴|내려|내렸|하락|감소|줄|떨어|낮아|인하|축소|악화|바뀌|변하|변동|[+-]\d)/.test(n))return false;
 // A hypothetical query, not an instruction to edit a sales price or CASE input.
 return /[?？]|(?:면|다면|때|경우|가정|상승시|하락시|증가시|감소시|변동시)(?:[^\S\r\n]|$|[?？])|(?:오르면|내리면|줄면|늘면|올랐을때|내렸을때)|[+-]\d+(?:\.\d+)?(?:%|퍼센트|프로)/.test(n);
}
function financeWhatIfPlan(text,c,defaults,options={}){
 const context=options.context?.caseId===c.id&&options.context.workspace===workspaceStorageKey()?options.context:null;
 if(!financeWhatIfCandidate(text,context))return null;
 const query=financeNaturalQuestion(text),n=chatNorm(query);
 const found=financeMetricMatches(query),unique=[...new Set(found.map(t=>t.metric.key))];
 let metric=null;
 if(unique.length===1&&FINANCE_WHATIF_KEYS.has(unique[0]))metric=financeMetric(unique[0]);
 if(!unique.length&&context?.whatIfMetricKey)metric=financeMetric(context.whatIfMetricKey);
 const fail=message=>({kind:'whatif-error',message});
 if(!metric)return fail('한 번에 매출액·영업이익·EBITDA 중 한 지표만 가정할 수 있습니다. 매출 변동이 다른 손익 지표에 미치는 영향은 원가·판관비 가정이 필요합니다.');
 if(/환율|단가|판매량|생산량|수율|원재료|원가|판관비|비용|가격|물량|투입|배부/.test(n))return fail('매출·영업이익·EBITDA 금액 자체의 증감 가정만 지원합니다. 원가나 가격·수량 변경에 따른 손익 영향은 시나리오 변수 조정으로 계산해야 합니다.');
 if(/전년|전월|전분기|예산대비|계획대비|비교|전년동기/.test(n))return fail('기간 비교와 가상 증감은 별개입니다. 비교 기준 대신 대상 CASE와 증감률을 지정해 주세요.');
 if(/%p|%\s*포인트|퍼센트\s*포인트/.test(query))return fail('금액 증감에는 %를 사용합니다. %p는 비율의 변화에 사용하는 단위입니다.');
 const rates=[...query.matchAll(/(?<![\d.])([+-]?\d+(?:\.\d+)?)\s*(%|퍼센트|프로)/g)];
 if(rates.length!==1)return fail('증감률을 하나만 숫자로 지정해 주세요. 예: “27년 영업이익 10% 오르면?”');
 let rate=Number(rates[0][1]);
 if(!Number.isFinite(rate)||Math.abs(rate)>1000)return fail('가정 증감률은 절댓값 1,000% 이내로 입력해 주세요.');
 const up=/(?:오르|오를|올라|올랐|상승|증가|늘|높아|인상|개선|상향)/.test(n);
 const down=/(?:내리|내릴|내려|내렸|하락|감소|줄|떨어|낮아|인하|축소|악화|빠지)/.test(n);
 if(up&&down)return fail('증가와 감소 방향이 함께 적혀 있습니다. 어느 방향인지 확인해 주세요.');
 if(rates[0][1].startsWith('+')&&down||rates[0][1].startsWith('-')&&up)return fail('증감 기호와 상승·하락 표현이 서로 다릅니다.');
 if(down)rate=-Math.abs(rate);
 else if(up)rate=Math.abs(rate);
 else if(!/^[+-]/.test(rates[0][1]))return fail('증가·감소 방향을 알려 주세요. 예: “매출 10% 상승하면?”, “매출 10% 줄면?”');
 let scope;try{scope=financeQueryScope(query,c,context?.whatIfMetricKey?context.scope:defaults,options.now);}catch(e){return fail(e.message);}
 return {kind:'whatif',text:query,metric,rate,scope,subject:metric.label,comparison:null};
}
function financeWhatIfResult(plan,c){
 if(plan.kind==='whatif-error')return {plan,html:'<p>'+esc(plan.message)+'</p>',remember:false};
 const model=calculate(c),rows=financeScopedRows(model,plan.scope);
 const raw=c.rows.filter(r=>plan.scope.months.includes(r.m)&&(!plan.scope.product||r.product===plan.scope.product)&&(!plan.scope.site||c.products.some(p=>p.id===r.product&&p.site===plan.scope.site)));
 const hasEnteredValues=raw.some(r=>Object.entries(r).some(([key,value])=>!['id','product','m','currency'].includes(key)&&typeof value==='number'&&Number.isFinite(value)));
 const prefix=financeAnswerHeader(c,plan.scope);
 if(!rows.length||!hasEnteredValues)return {plan,html:prefix+'<p>선택한 범위에 계산할 입력값이 없습니다. 빈 값을 0원으로 가정하지 않았습니다.</p>',remember:false};
 const before=financeAggregate(rows)[plan.metric.key];
 if(!Number.isFinite(before))return {plan,html:prefix+'<p>기준 금액을 계산하지 못했습니다. 입력값을 확인해 주세요.</p>',remember:false};
 if(before===0)return {plan,html:prefix+'<p>'+esc(plan.metric.label)+' 기준값이 0원이므로 증감률만으로 유의미한 새 금액을 산출할 수 없습니다.</p>',remember:false};
 // "Increase" always increases the numerical profit, including reducing an existing loss.
 const delta=Math.abs(before)*plan.rate/100,after=before+delta;
 if(plan.metric.key==='revenue'&&after<0)return {plan,html:prefix+'<p>가정 후 매출액이 음수가 됩니다. 감소율을 조정해 주세요.</p>',remember:false};
 const movement=plan.rate>=0?'상승':'하락',label=plan.metric.label+' '+fmt(Math.abs(plan.rate),2)+'% '+movement;
 const html=prefix+'<p><strong>'+esc(label+' 가정 결과')+'</strong></p>'+
  safeTable(['구분','금액'],[['기준 '+plan.metric.label,fmt(before,2)+'원'],['가정 후 '+plan.metric.label,fmt(after,2)+'원'],['증감액',(delta>0?'+':'')+fmt(delta,2)+'원']])+
  '<p class="hint">선택한 지표 금액에 '+esc(fmt(Math.abs(plan.rate),2))+'%를 산술 반영한 가상 결과입니다.'+(before<0?' 적자에서 상승은 손실 축소를 뜻합니다.':'')+'</p>'+
  '<p class="hint">다른 손익 항목과 비용 구조는 재계산하지 않으며, 저장된 CASE·시나리오·입력값도 변경하지 않습니다.</p>'+
  financeWarningMarkup(model,plan.scope,c);
 return {plan,html,remember:true};
}
