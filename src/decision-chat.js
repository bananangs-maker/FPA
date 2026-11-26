// Phase 6. Read-only intent routing into shared FPA decision engines.
// Do not apply hypothetical edits to saved CASEs.
let decisionChatScenario=null;
function decisionChatValid(c=active()){return decisionChatScenario?.caseId===c.id&&decisionChatScenario?.workspace===workspaceStorageKey();}
function decisionChatNormalize(t){return chatNorm(financeNaturalQuestion(t));}
function decisionChatIntent(text){
 const n=decisionChatNormalize(text),matched=financeMetricMatches(financeNaturalQuestion(text));
 const metric=matched.map(x=>x.metric.key);
 const pct=/(?<!\d)(?:[+-]?\d+(?:\.\d+)?)\s*(?:%|프로|퍼센트)/.test(n);
 const hypothetical=/(?:오르|오른|올리|인상|상승|증가|늘|줄|내리|내린|내려|하락|감소|인하|낮|떨어)/.test(n);
 const drivers=/(?:판매단가|판가|원재료비|원재료단가|원자재|판매량|매출수량|매출환율|환율|노무비|고정비|제조원가|판관비|운반비|포장비|전력단가)/.test(n);
 const askEffect=/(?:영업이익|영익|에비따|ebitda|수익성|실적|어찌|얼마|얼매|얼만|어떻게|결과)/.test(n);
 if(/(?:임원|경영진|대표|보고|보고서).*(?:보고|정리|요약|핵심)|임원보고/.test(n))return 'report';
 if(/(?:이상한달|이상치|비정상|급변|갑자기|특이한달|이상하게변)/.test(n))return 'anomaly';
 if(/(?:올해|연간|현재|가장큰).*(?:리스크|위험|위험요인)|(?:리스크|위험요인).*(?:뭐|무엇|있|알려)/.test(n))return 'risk';
 if(/(?:손익분기|bep|본전|흑자전환).*(?:얼마|몇|언제|넘|달성|분석|계산|더팔)/.test(n))return 'bep';
 if(/(?:가장큰영향|가장많은영향|영향큰변수|어떤변수|민감한변수|중요한변수|토네이도)/.test(n))return 'tornado';
 if(/(?:낙관|비관|bullcase|bearcase|베이스|basecase).*(?:비교|차이|대조)|(?:시나리오|case).*(?:비교|차이|대조)/.test(n))return 'scenario';
 if(/(?:왜|원인|기여|요인|이유).*(?:줄|증가|하락|감소|올랐|변동|늘)|(?:영업이익|이익|ebitda|매출).*(?:왜|원인|요인)/.test(n))return 'bridge';
 if(/(?:달성|맞추|찍으|넘기려|필요한|필요해|얼마나올|어떻게해야).*(?:위해|단가|얼마|몇|조정|늘|올려)|(?:영업이익률|영업이익|ebitda|매출액).*(?:\d+(?:\.\d+)?\s*(?:억|%|퍼센트|프로|백만)).*(?:달성|맞추|찍으)/.test(n))return 'goal';
 if(decisionChatValid()&&/(?:그럼|그러면|거기서|여기서|그수치|그금액)/.test(n)&&/영업이익|영익|에비따|ebitda|매출|원재료비/.test(n)&&(!pct||drivers))return 'scenario-followup';
 // The prior pure arithmetic "revenue +%" needs a real sales driver before profit can be estimated.
 if(financeConversationValid(active())&&financeConversation?.whatIfMetricKey==='revenue'&&Number.isFinite(financeConversation.whatIfRate)&&/영업이익|영익|에비따|ebitda/.test(n)&&/그럼|그러면|이때|여기서|그거|거기서/.test(n))return 'revenue-followup';
 if(pct&&hypothetical&&drivers&&askEffect)return 'driver-whatif';
 if(pct&&hypothetical&&/(?:판매단가|판가|판매량|원재료비|원재료단가)/.test(n)&&/(?:하고|동시에|같이|더불어|그리고)/.test(n))return 'driver-whatif';
 return null;
}
function decisionChatDriver(text){
 const n=decisionChatNormalize(text);
 if(/(?:원재료|원자재|자재).*(?:비|단가|가격)|(?:재료비)/.test(n))return 'rawPrice';
 if(/(?:판매단가|판가|판매가격)/.test(n)||(/단가/.test(n)&&!/원재료|원자재|자재|전력|전기/.test(n)))return 'salesPrice';
 if(/(?:판매량|매출수량|판매수량)/.test(n))return 'qty';
 if(/(?:매출환율|매출적용환율)/.test(n))return 'salesFx';
 if(/(?:원재료환율|원자재환율)/.test(n))return 'rawFx';
 if(/(?:판관비|판매관리비|판관고정비)/.test(n))return 'sgFixed';
 if(/(?:제조고정비|제조간접고정비)/.test(n))return 'mfgFixed';
 if(/(?:노무비|인건비)/.test(n))return 'labor';
 if(/(?:전력단가)/.test(n))return 'power';
 if(/(?:운반비|포장비)/.test(n))return 'freightPack';
 return null;
}
function decisionChatRates(text){
 const q=financeNaturalQuestion(text),matches=[...q.matchAll(/(?<![\d.])([+-]?\d+(?:\.\d+)?)\s*(?:%|퍼센트|프로)/g)];
 return matches.map((m,i)=>{
  const end=m.index+m[0].length;
  const next=matches[i+1]?.index??q.length;
  const after=chatNorm(q.slice(end,next)),before=chatNorm(q.slice(Math.max(0,m.index-12),m.index));
  const context=/(?:상승|증가|올리|오르|오른|인상|늘|높|줄|내리|내린|하락|감소|인하|떨어|낮)/.test(after)?after:before;
  const down=/(?:줄|내리|내린|내려|하락|감소|인하|떨어|낮)/.test(context),up=/(?:오르|오른|올리|인상|상승|증가|늘|높)/.test(context);
  let rate=Number(m[1]);
  if(down&&!up)rate=-Math.abs(rate);else if(up&&!down)rate=Math.abs(rate);
  return {rate,start:m.index,end};
 });
}
function decisionChatEvaluate(c,scope,changes){
 const work=clone(c);
 for(const ch of changes){
  const count=applySensitivityAxis(work,ch.axis,ch.rate,scope);
  if(!count)throw Error(SENSITIVITY_AXES[ch.axis].label+'에 변경 가능한 입력이 없습니다.');
 }
 const model=calculate(work),a=aggregate(planningRowsFromModel(model,scope));
 if(![a.revenue,a.op,a.ebitda].every(Number.isFinite))throw Error('손익 계산값이 유효하지 않습니다.');
 return {totals:a,warnings:model.warnings.length};
}
function decisionChatSetScenario(c,scope,branches){decisionChatScenario={caseId:c.id,workspace:workspaceStorageKey(),scope:clone(scope),branches:clone(branches)};}
function decisionChatOutput(c,scope,branches,description){
 const base=aggregate(planningRows(c,scope));
 const details=branches.map(b=>({name:b.name,...decisionChatEvaluate(c,scope,b.changes)}));
 const rows=details.map(d=>[d.name,fmt(d.totals.revenue/unit,2),fmt(d.totals.op/unit,2),fmt(d.totals.ebitda/unit,2),fmt((d.totals.op-base.op)/unit,2),d.warnings+'건']);
 return financeAnswerHeader(c,scope)+'<p><strong>'+esc(description)+'</strong></p>'+safeTable(['가정','매출액 ('+unitLabel()+')','영업이익','EBITDA','영업이익 증감','검산'],rows)+
 '<p class="hint">판매단가·판매량·원가 변수를 변경한 가상 CASE를 재계산했습니다. 기준 영업이익 '+fmt(base.op/unit,2)+unitLabel()+'. 저장된 CASE에는 적용하지 않습니다.</p>';
}
function decisionChatAnswer(text){
 const intent=decisionChatIntent(text);if(!intent)return false;
 const c=active(),raw=financeNaturalQuestion(text),n=chatNorm(raw);
 try{
  const scope=financeQueryScope(raw,c,assistantUI.scope||decisionScope());
  const selected=decisionChatValid(c)?decisionChatScenario:null;
  const metric=/에비따|ebitda/.test(n)?'ebitda':/영업이익률|영익률/.test(n)?'opMargin':/매출/.test(n)&&!/영업이익/.test(n)?'revenue':'op';
  if(intent==='revenue-followup'){
   const rate=financeConversation.whatIfRate,s=financeConversation.scope;
   const branches=[{name:'판매단가 '+(rate>=0?'+':'')+fmt(rate,2)+'%',changes:[{axis:'salesPrice',rate}]},{name:'판매량 '+(rate>=0?'+':'')+fmt(rate,2)+'%',changes:[{axis:'qty',rate}]}];
   decisionChatSetScenario(c,s,branches);
   assistantSay(decisionChatOutput(c,s,branches,'매출 '+fmt(rate,2)+'% 변화의 영업이익 영향 · 두 가지 가능한 경로')+'<p class="hint">앞서 산술 계산한 매출 증감만으로는 판가·판매량 중 어느 요인이 바뀌었는지 알 수 없습니다. 두 가지를 별도로 재계산했습니다.</p>');
   return true;
  }
  if(intent==='scenario-followup'){
   if(!selected){assistantSay('<p>연결할 가상 시나리오가 없습니다. 먼저 “판매단가 10% 오르면 영업이익은?”처럼 가정을 지정해 주세요.</p>');return true;}
   const axis=decisionChatDriver(raw),rates=decisionChatRates(raw);
   if(axis&&rates.length===1){
    const branches=selected.branches.map(b=>({...b,name:b.name+' / '+SENSITIVITY_AXES[axis].label+' '+(rates[0].rate>=0?'+':'')+fmt(rates[0].rate,1)+'%',changes:[...b.changes,{axis,rate:rates[0].rate}]}));
    decisionChatSetScenario(c,selected.scope,branches);
    assistantSay(decisionChatOutput(c,selected.scope,branches,'직전 시나리오에 추가한 경영 변수 효과'));return true;
   }
   assistantSay(decisionChatOutput(c,selected.scope,selected.branches,'직전 가상 시나리오의 손익 결과'));return true;
  }
  if(intent==='driver-whatif'){
   const rates=decisionChatRates(raw);
   const axisNames=Object.keys(SENSITIVITY_AXES).filter(k=>{
    const aliases={salesPrice:/판매단가|판가|판매가격/,qty:/판매량|매출수량|판매수량/,rawPrice:/원재료비|원재료단가|원자재비|자재단가/,salesFx:/매출환율/,rawFx:/원재료환율/,sgFixed:/판관비|판매관리비/,mfgFixed:/제조고정비/,labor:/노무비|인건비/,power:/전력단가/,freightPack:/운반비|포장비/};
    return aliases[k]?.test(n);
   });
   const unique=[...new Set(axisNames)];
   if(rates.length!==unique.length||!unique.length||unique.length>2){assistantSay('<p>변경할 변수와 증감률의 대응이 불분명합니다. 예: “판매단가 3% 인상하고 판매량 5% 감소하면?”</p>');return true;}
   let changes;
   if(unique.length===1)changes=[{axis:unique[0],rate:rates[0].rate}];
   else{
    const positions=unique.map(axis=>({axis,pos:n.search({salesPrice:/판매단가|판가|판매가격/,qty:/판매량|매출수량|판매수량/,rawPrice:/원재료비|원재료단가|원자재비|자재단가/}[axis]||/(?!)/)})).sort((a,b)=>a.pos-b.pos);
    if(positions.some(x=>x.pos<0))throw Error('변수 순서를 확인할 수 없습니다.');
    changes=positions.map((x,i)=>({axis:x.axis,rate:rates[i].rate}));
   }
   const branch={name:changes.map(x=>SENSITIVITY_AXES[x.axis].label+' '+(x.rate>=0?'+':'')+fmt(x.rate,2)+'%').join(' / '),changes};
   decisionChatSetScenario(c,scope,[branch]);
   assistantSay(decisionChatOutput(c,scope,[branch],'전체 손익 엔진으로 다시 계산한 가상 시나리오')+(unique.includes('rawPrice')?'<p class="hint">“원재료비 변화”는 원재료 단가를 같은 비율로 변경하는 가정입니다. 생산량 변화에 따른 총재료비 증가와는 구분합니다.</p>':''));
   return true;
  }
  if(intent==='bridge'){
   const ref=state.cases.find(x=>x.id===(compareId||c.referenceId)&&x.year===c.year&&x.id!==c.id);
   if(!ref){assistantSay('<p>손익 변동 원인을 분석하려면 동일 연도의 기준 CASE가 필요합니다. 시나리오 설정에서 기준 CASE를 선택해 주세요.</p>');return true;}
   const b=buildProfitBridge(ref,c,scope,metric==='revenue'?'revenue':metric==='ebitda'?'ebitda':'op'),top=b.steps.filter(x=>Math.abs(x.amount)>1e-7).sort((a,z)=>Math.abs(z.amount)-Math.abs(a.amount)).slice(0,5);
   assistantSay(financeAnswerHeader(c,scope)+'<p><strong>기준 대비 '+esc(decisionMetricLabel(b.metric))+' '+decisionDeltaFormat(b.metric,b.end[b.metric]-b.start[b.metric])+'</strong></p>'+safeTable(['순차대체 항목','증감액'],top.map(x=>[x.label,fmt(x.amount,2)+'원']))+'<p class="hint">전체 단계 합계와 실제 증감 차이 '+fmt(b.reconciliation,6)+'원. 상호작용은 나중에 대체하는 항목에 귀속되며 인과관계를 단정하지 않습니다.</p>');return true;
  }
  if(intent==='bep'){
   const r=buildBreakEven(c,scope,/에비따|ebitda/.test(n)?'ebitda':'op');
   assistantSay(financeAnswerHeader(c,scope)+(r.available?'<p><strong>손익분기점 매출액 '+fmt(r.root.totals.revenue/unit,2)+' '+unitLabel()+'</strong></p><p>BEP 판매량 '+fmt(r.root.totals.qty,2)+'kg · 현재 대비 규모 '+(r.root.factor>=1?'+':'')+fmt((r.root.factor-1)*100,2)+'% · 안전한계율 '+percent(r.marginSafety)+'</p>':'<p>'+esc(r.reason)+'</p>')+'<p class="hint">판매량과 생산량을 같은 비율로 변화시킨 모형 기반 BEP입니다. 전통적인 고정·변동 원가 공식의 확정값은 아닙니다.</p>');return true;
  }
  if(intent==='goal'){
   const rate=raw.match(/(?<!\d)(\d+(?:\.\d+)?)\s*(억|백만원|원|%|퍼센트|프로)/),targetMetric=/에비따|ebitda/.test(n)?'ebitda':/영업이익률|영익률/.test(n)?'opMargin':/매출액|매출/.test(n)&&!/영업이익/.test(n)?'revenue':'op';
   if(!rate){assistantSay('<p>목표 금액이나 이익률을 수치로 알려 주세요. 예: “영업이익률 15%를 달성하려면 단가를 얼마나 올려야 해?”</p>');return true;}
   const scale=rate[2]==='억'?1e8:rate[2]==='백만원'?1e6:rate[2]==='원'?1:1;
   const target=goalSeekTarget(targetMetric,rate[1],rate[2]==='%'||/퍼센트|프로/.test(rate[2])?1:scale);
   const asked=decisionChatDriver(raw),axes=asked?[asked]:['salesPrice','qty','rawPrice'];
   const rows=[];
   for(const axis of axes){
    try{const res=buildGoalSeek(c,scope,targetMetric,target,axis,true);rows.push([SENSITIVITY_AXES[axis].label,res.available?(res.rate>0?'+':'')+fmt(res.rate,3)+'%':'해 없음',res.available?decisionMetricFormat(targetMetric,res.achieved):res.reason]);}
    catch(e){rows.push([SENSITIVITY_AXES[axis].label,'산출 불가',e.message]);}
   }
   assistantSay(financeAnswerHeader(c,scope)+'<p><strong>목표 '+esc(decisionMetricLabel(targetMetric))+' '+esc(decisionMetricFormat(targetMetric,target))+'</strong></p>'+safeTable(['조정 변수','필요 변화율','재계산 결과'],rows)+'<p class="hint">변수별 독립적인 단일 변수 역산입니다. 여러 제약을 동시에 만족하는 최적해는 아니며 원본 CASE는 변경하지 않았습니다. 경영 분석 → 목표 역산에서 적용 전 검증 후 새 CASE를 만들 수 있습니다.</p>');
   return true;
  }
  if(intent==='tornado'){
   const r=buildTornadoSensitivity(c,scope,metric,10,true);
   assistantSay(financeAnswerHeader(c,scope)+'<p><strong>'+esc(decisionMetricLabel(metric))+' 영향력 순위 · 변수별 ±10% 가정</strong></p>'+safeTable(['순위','변수','영향액 (기준 대비 최대)'],r.rows.slice(0,7).map((x,i)=>[i+1,x.label,decisionDeltaFormat(metric,x.score)]))+'<p class="hint">각 변수는 독립적으로 ±10% 조정해 전체 손익을 재계산했습니다. 경영 분석의 토네이도 화면에서 모든 변수와 양방향 결과를 확인할 수 있습니다.</p>');return true;
  }
  if(intent==='scenario'){
   const names=state.cases.filter(x=>x.year===c.year&&/낙관|비관|bull|bear|base|기준|베이스/i.test(x.scenario+' '+x.name)).slice(0,8);
   if(names.length<2){assistantSay('<p>낙관·비관 등 비교할 CASE가 두 개 이상 등록되지 않았습니다. 먼저 동일 연도의 시나리오를 복제하고 이름을 설정해 주세요.</p>');return true;}
   const r=buildScenarioComparison(names,scope,c),eligible=r.cases.filter(x=>x.available);
   if(eligible.length<2){assistantSay('<p>비교할 CASE의 제품·월별 입력이 일치하지 않습니다. 미입력 금액을 0원으로 가정하지 않았습니다.</p>');return true;}
   assistantSay(financeAnswerHeader(c,scope)+safeTable(['CASE','매출액','영업이익','EBITDA'],eligible.map(x=>[x.label,fmt(x.values.revenue/unit,2),fmt(x.values.op/unit,2),fmt(x.values.ebitda/unit,2)]))+'<p class="hint">금액 단위 '+unitLabel()+'. 상세 가정은 경영 분석 → CASE 비교에서 확인할 수 있습니다.</p>');return true;
  }
  if(intent==='anomaly'||intent==='risk'||intent==='report'){
   const reference=state.cases.find(x=>x.id===(compareId||c.referenceId)&&x.year===c.year&&x.id!==c.id)||null;
   const report=buildExecutiveReport(c,scope,reference,state.cases.filter(x=>x.id!==c.id));
   if(intent==='anomaly'){const a=decisionAnomalyCandidates(c,scope,{basis:'mom',change:30,points:5});assistantSay(financeAnswerHeader(c,scope)+'<p><strong>월별 변동 검토 신호 '+a.signals.length+'건</strong></p>'+safeTable(['월','지표','전월 대비'],a.signals.slice(0,10).map(x=>[x.month+'월',x.label,x.kind==='pp'?fmt(x.delta*100,2)+'%p':x.magnitude===null?'기준 0':fmt(x.magnitude*100,2)+'%']))+'<p class="hint">금액 ±30%, 비율 ±5%p 기준입니다. 급변이 곧 오류를 뜻하지 않습니다. 전월 자료가 없는 1월은 비교에서 제외합니다.</p>');return true;}
   const list=intent==='risk'?report.risks:report.insights;
   assistantSay(financeAnswerHeader(c,scope)+'<p><strong>'+(intent==='risk'?'데이터 기반 주요 위험 신호':'경영진 보고 핵심 내용')+'</strong></p><ul>'+list.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul><p class="hint">관찰된 재무 값과 검산 경고만 사용했으며, 확인되지 않은 사업상 원인을 추정하지 않았습니다.</p>');return true;
  }
 }catch(e){assistantSay('<p>분석을 계산하지 못했습니다: '+esc(e.message)+'</p><p class="hint">입력값·비교 CASE·선택 범위를 확인해 주세요. 원본 CASE는 변경하지 않았습니다.</p>');return true;}
 return false;
}
