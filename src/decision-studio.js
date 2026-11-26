// FPA Decision Studio: read-only calculations. All values come from the shared accounting model.
let decisionTab='bridge',decisionBridgeMetric='op',decisionBridgePeriod='all',decisionBridgeReference='',decisionBridgePreview=null;
let decisionAnomalyBasis='mom',decisionAnomalyReference='',decisionAnomalyChange=30,decisionAnomalyPoints=5,decisionAnomalyPreview=null;
function decisionScope(period='all'){return {site:siteFilter,product:productFilter,months:period==='all'?chatAllMonths():[Number(period)]};}
function decisionSignature(...values){return JSON.stringify(values);}
function decisionStudio(){
 const tabs=[['bridge','손익 증감'],['bep','손익분기점'],['anomaly','변동 감지']];
 return '<div class="decision-studio"><div class="decision-intro"><strong>경영 분석 스튜디오</strong><p>현재 CASE의 실제 입력을 기반으로 분석합니다. 조회 및 가상 계산으로 원본 데이터는 변경하지 않습니다.</p></div>'+
 '<div class="decision-tabs" role="tablist" aria-label="경영 분석 기능">'+tabs.map(([key,label])=>'<button type="button" role="tab" aria-selected="'+(decisionTab===key)+'" class="'+(decisionTab===key?'active':'')+'" onclick="decisionTab=\''+key+'\';render()">'+label+'</button>').join('')+'</div>'+
 (decisionTab==='bridge'?decisionBridgeScreen():decisionTab==='bep'?decisionBepScreen():decisionAnomalyScreen())+'</div>';
}
function decisionBridgeScreen(){
 const c=active(),references=state.cases.filter(r=>r.id!==c.id&&r.year===c.year);
 const reference=references.find(r=>r.id===(decisionBridgeReference||compareId||c.referenceId))||references[0];
 const chosen=reference?.id||'';
 const scope=decisionScope(decisionBridgePeriod);
 const key=decisionSignature(c,reference,scope,decisionBridgeMetric);
 const result=decisionBridgePreview?.key===key?decisionBridgePreview.result:null;
 const selectors='<div class="decision-controls">'+
 '<label class="field">기준 CASE<select aria-label="손익 분석 기준 CASE" onchange="decisionBridgeReference=this.value;decisionBridgePreview=null;render()">'+(references.length?references.map(r=>option(r.id,r.scenario+' / '+r.name+' ('+r.kind+')',r.id===chosen)).join(''):option('','비교할 CASE가 없습니다',true))+'</select></label>'+
 '<label class="field">분석 지표<select aria-label="손익 분석 지표" onchange="decisionBridgeMetric=this.value;decisionBridgePreview=null;render()">'+[['revenue','매출액'],['op','영업이익'],['ebitda','EBITDA']].map(([id,label])=>option(id,label,id===decisionBridgeMetric)).join('')+'</select></label>'+
 '<label class="field">분석 기간<select aria-label="손익 분석 기간" onchange="decisionBridgePeriod=this.value;decisionBridgePreview=null;render()">'+option('all','연간 1~12월',decisionBridgePeriod==='all')+Array.from({length:12},(_,i)=>option(i+1,(i+1)+'월',decisionBridgePeriod===String(i+1))).join('')+'</select></label>'+
 '</div>';
 let report='';
 if(!reference)report='<p class="hint">같은 연도의 비교 CASE가 없습니다. 시나리오 설정에서 CASE를 복제·저장한 다음 비교할 수 있습니다.</p>';
 else if(!result)report='<p class="hint">두 CASE의 판매량·제품 믹스·단가·환율·제조원가·판관비 등의 효과를 실제 손익 엔진으로 순차 계산합니다.</p>';
 else{
  const label={revenue:'매출액',op:'영업이익',ebitda:'EBITDA'}[result.metric];
  const change=result.end[result.metric]-result.start[result.metric];
  report='<div class="decision-summary"><div><span>기준 '+label+'</span><strong>'+display(result.start[result.metric])+' '+unitLabel()+'</strong></div><div><span>비교 '+label+'</span><strong>'+display(result.end[result.metric])+' '+unitLabel()+'</strong></div><div><span>증감</span><strong class="'+(change<0?'negative':'')+'">'+(change>0?'+':'')+display(change)+' '+unitLabel()+'</strong></div></div>'+
   decisionWaterfall(result)+
   '<details class="decision-details"><summary>단계별 계산 내역</summary>'+safeTable(['변동 요인','증감 원','누적 '+label+' 원'],result.steps.map(s=>[s.label,fmt(s.amount,2),fmt(s.to,2)]))+'</details>'+
   '<p class="decision-footnote">순차대체법: 전체 판매량 규모 → 제품별 판매 구성 → 단가 → 생산·원가·환율·기타 입력 순서로 변수를 교체합니다. 상호작용은 뒤에 적용한 항목에 귀속됩니다. 신규·삭제 제품, 배부 구조, 기초재고 등은 마지막 기타 항목으로 검산합니다.</p>'+
   '<p class="decision-footnote">증감액 합계 검산: '+fmt(result.reconciliation,6)+'원'+(result.warnings.length?' · 기준/비교 CASE 검산 경고 '+result.warnings.length+'건':'')+(result.intermediateWarnings?' · 중간 계산 경고 '+result.intermediateWarnings+'건':'')+'</p>';
 }
 return panel('P&L Bridge · 손익 증감 원인',selectors+'<div class="decision-commands"><button type="button" class="primary" '+(!reference?'disabled':'')+' onclick="decisionRunBridge()">분석 실행</button></div>'+report);
}
function decisionRunBridge(){
 try{
  const c=active(),r=state.cases.find(r=>r.id===(decisionBridgeReference||compareId||c.referenceId)&&r.id!==c.id&&r.year===c.year)||state.cases.find(r=>r.id!==c.id&&r.year===c.year);
  if(!r)throw Error('비교 CASE를 먼저 준비하세요.');
  const scope=decisionScope(decisionBridgePeriod),result=buildProfitBridge(r,c,scope,decisionBridgeMetric);
  decisionBridgePreview={key:decisionSignature(c,r,scope,decisionBridgeMetric),result};render();
 }catch(e){decisionBridgePreview=null;toast(e.message);}
}
function decisionWaterfall(result){
 const vals=[0,result.start[result.metric],result.end[result.metric],...result.steps.flatMap(s=>[s.from,s.to])];
 const lo=Math.min(...vals),hi=Math.max(...vals),span=hi-lo||1;
 const pct=v=>((v-lo)/span*100).toFixed(5)+'%';
 const rows=[{label:'기준',from:0,to:result.start[result.metric],total:true},...result.steps.map(s=>({...s,total:false})),{label:'현재',from:0,to:result.end[result.metric],total:true}];
 return '<div class="decision-waterfall" role="img" aria-label="기준 손익에서 현재 손익까지 변동 요인별 워터폴 차트">'+rows.map(row=>{
  const left=Math.min(row.from,row.to),width=Math.abs(row.to-row.from);
  const amt=row.to-row.from,cl=row.total?'total':amt>=0?'positive':'negative';
  return '<div class="waterfall-row"><span class="waterfall-label">'+esc(row.label)+'</span>'+
   '<div class="waterfall-track"><i class="waterfall-zero" style="left:'+pct(0)+'"></i><i class="waterfall-mark '+cl+'" style="left:'+pct(left)+';width:'+((width/span*100).toFixed(5))+'%" title="'+esc(row.label+' · '+fmt(amt,2)+'원')+'"></i></div>'+
   '<strong class="'+(!row.total&&amt<0?'negative':'')+'">'+(row.total?'':amt>0?'+':'')+display(row.total?row.to:amt)+' '+unitLabel()+'</strong></div>';
 }).join('')+'</div>';
}
function decisionAnomalyCandidates(c,scope,options={}){
 const mode=options.basis||'mom',relative=Number(options.change??30),points=Number(options.points??5);
 if(!['mom','plan','prior'].includes(mode))throw Error('비교 기준을 확인하세요.');
 if(!Number.isFinite(relative)||relative<=0||relative>500||!Number.isFinite(points)||points<=0||points>100)throw Error('탐지 기준 범위: 증감률 0~500%, 비율 변화 0~100%p');
 const model=calculate(c),reference=options.reference;
 if(mode!=='mom'&&(!reference||(mode==='prior'?reference.year!==c.year-1:reference.year!==c.year)))throw Error('선택한 비교 기준 CASE가 올바르지 않습니다.');
 const checkInput=(ref,m,productId)=>ref.rows.some(r=>r.m===m&&(!productId||r.product===productId)&&typeof r.qty==='number');
 const mappedRefProduct=()=>{
  if(!scope.product||!reference)return scope.product;
  const original=c.products.find(p=>p.id===scope.product);
  if(!original)return null;
  const matched=reference.products.filter(p=>p.name===original.name&&p.site===original.site);
  return matched.length===1?matched[0].id:null;
 };
 const refProduct=mappedRefProduct();
 const refModel=reference?calculate(reference):null;
 const getAgg=(model,ref,month,product)=>{
  if(product===null)return null;
  if(ref!==c&&scope.site&&!ref.sites.some(s=>s.name===scope.site))return null;
  if(!checkInput(ref,month,product))return null;
  return aggregate(planningRowsFromModel(model,{site:scope.site,product:product||'',months:[month]}));
 };
 const signals=[],priorYear=options.priorYear;
 const priorModel=priorYear&&priorYear.year===c.year-1?calculate(priorYear):null;
 const seasonal=(month,key,delta)=>{
  if(mode!=='mom'||month===1||!priorModel)return false;
  let prod='';
  if(scope.product){
   const p=c.products.find(p=>p.id===scope.product);
   const match=priorYear.products.filter(x=>x.name===p?.name&&x.site===p?.site);
   if(match.length!==1)return false;
   prod=match[0].id;
  }
  const before=getAgg(priorModel,priorYear,month-1,prod),after=getAgg(priorModel,priorYear,month,prod);
  if(!before||!after)return false;
  const f=a=>key==='cogsRate'?(a.revenue>0?a.cogs/a.revenue:null):key==='opMargin'?(a.revenue>0?a.op/a.revenue:null):key==='fixed'?a.mfgFixed+a.sgFixed:a[key];
  const u=f(before),v=f(after);
  if(u===null||v===null||!Number.isFinite(u)||!Number.isFinite(v))return false;
  const previousDelta=['cogsRate','opMargin'].includes(key)?v-u:u===0?null:(v-u)/Math.abs(u);
  return previousDelta!==null&&Math.sign(delta)===Math.sign(previousDelta)&&Math.abs(delta-previousDelta)<(key==='cogsRate'||key==='opMargin'?.02:.15);
 };
 for(const month of scope.months){
  const a=getAgg(model,c,month,scope.product);
  let b=null;
  if(mode==='mom'&&month>1)b=getAgg(model,c,month-1,scope.product);
  else if(mode!=='mom')b=getAgg(refModel,reference,month,refProduct);
  if(!a||!b)continue;
  const metrics=[
   ['매출액','revenue','pct','판매량·판매단가·환율 확인'],
   ['매출원가율','cogsRate','pp','재고 이월·매출원가 배부 확인'],
   ['영업이익률','opMargin','pp','매출액·매출원가·판관비 확인'],
   ['원재료비','material','pct','투입량·수율·자재단가 확인'],
   ['고정비 배부액','fixed','pct','제조·판관 고정비와 배부 기준 확인'],
   ['판관비','sg','pct','고정 판관비·운반 및 포장비 확인']];
  const value=(x,key)=>key==='cogsRate'?(x.revenue>0?x.cogs/x.revenue:null):key==='opMargin'?(x.revenue>0?x.op/x.revenue:null):key==='fixed'?x.mfgFixed+x.sgFixed:x[key];
  for(const [label,key,kind,reason] of metrics){
   const before=value(b,key),after=value(a,key);
   if(before==null||after==null||!Number.isFinite(before)||!Number.isFinite(after))continue;
   const delta=after-before;
   let magnitude,condition;
   if(kind==='pp'){magnitude=delta;condition=Math.abs(delta)>=points/100;}
   else if(before===0){magnitude=null;condition=after!==0;}else{magnitude=delta/Math.abs(before);condition=Math.abs(magnitude)*100>=relative;}
   if(!condition)continue;
   const recurrent=magnitude!==null&&seasonal(month,key,magnitude);
   signals.push({month,label,key,before,after,delta,magnitude,kind,reason,status:recurrent?'계절성 반복 가능':'검토 신호'});
  }
  if(b.op>=0&&a.op<0)signals.push({month,label:'영업적자 전환',key:'op',before:b.op,after:a.op,delta:a.op-b.op,magnitude:null,kind:'amount',reason:'매출·원가·고정비 증가 원인 확인',status:'검토 신호'});
 }
 return {basis:mode,relative,points,signals,reference:reference?.name||'',months:scope.months,warning:model.warnings.length};
}
function decisionAnomalyScreen(){
 const c=active();
 const plan=state.cases.filter(r=>r.id!==c.id&&r.year===c.year);
 const prior=state.cases.filter(r=>r.year===c.year-1);
 const referenceList=decisionAnomalyBasis==='prior'?prior:plan;
 const reference=referenceList.find(r=>r.id===decisionAnomalyReference)||referenceList.find(r=>r.id===c.referenceId)||referenceList[0];
 const scope=decisionScope();
 const key=decisionSignature(c,decisionAnomalyBasis,reference,scope,decisionAnomalyChange,decisionAnomalyPoints);
 const result=decisionAnomalyPreview?.key===key?decisionAnomalyPreview.result:null;
 let body='<div class="decision-controls">'+
  '<label class="field">비교 기준<select aria-label="변동 감지 비교 기준" onchange="decisionAnomalyBasis=this.value;decisionAnomalyReference=\'\';decisionAnomalyPreview=null;render()">'+
  option('mom','전월 대비',decisionAnomalyBasis==='mom')+option('plan','기준 CASE 대비',decisionAnomalyBasis==='plan')+option('prior','전년 동월 대비',decisionAnomalyBasis==='prior')+'</select></label>'+
  (decisionAnomalyBasis==='mom'?'':'<label class="field">비교 CASE<select aria-label="변동 감지 비교 CASE" onchange="decisionAnomalyReference=this.value;decisionAnomalyPreview=null;render()">'+(referenceList.length?referenceList.map(x=>option(x.id,x.year+' · '+x.scenario+' / '+x.name,x.id===reference?.id)).join(''):option('','비교 자료 없음',true))+'</select></label>')+
  '<label class="field">금액 변화 기준 (%)<input type="number" min="1" max="500" step="1" aria-label="변동 감지 증감률" value="'+decisionAnomalyChange+'" onchange="decisionAnomalyChange=Number(this.value);decisionAnomalyPreview=null;render()"></label>'+
  '<label class="field">이익률·원가율 변화 (%p)<input type="number" min="0.5" max="100" step="0.5" aria-label="변동 감지 비율 변화" value="'+decisionAnomalyPoints+'" onchange="decisionAnomalyPoints=Number(this.value);decisionAnomalyPreview=null;render()"></label></div>';
 body+='<div class="decision-commands"><button type="button" class="primary" onclick="decisionRunAnomaly()">변동 검토</button></div>';
 if(!result)body+='<p class="hint">변동 기준을 넘는 월을 검토 대상으로 표시합니다. 변동 자체가 오류나 비정상 거래의 증거는 아닙니다. 전년 또는 계획 자료가 없으면 해당 비교를 수행하지 않습니다.</p>';
 else if(!result.signals.length)body+='<p class="hint">비교 가능한 월에서 설정된 기준을 넘는 신호가 발견되지 않았습니다. 입력되지 않은 기간은 분석에서 제외됩니다.</p>';
 else {
  body+='<p class="decision-footnote">발견 '+result.signals.filter(r=>r.status==='검토 신호').length+'건 · 계절성 반복 가능 '+result.signals.filter(r=>r.status!=='검토 신호').length+'건 · 데이터 검산 경고 '+result.warning+'건</p>'+
   safeTable(['월','검토 항목','변화','판정','확인할 사항'],result.signals.slice(0,90).map(r=>[
    r.month+'월',r.label,r.kind==='pp'?(r.delta>=0?'+':'')+fmt(r.delta*100,2)+'%p':r.kind==='pct'&&r.magnitude!==null?(r.delta>=0?'+':'')+fmt(r.magnitude*100,1)+'%':(r.delta>=0?'+':'')+fmt(r.delta/unit,1)+' '+unitLabel(),r.status,r.reason
   ]));
 }
 return panel('월별 변동 감지',body);
}
function decisionRunAnomaly(){
 try{
  const c=active(),list=state.cases.filter(r=>r.id!==c.id&&r.year===(decisionAnomalyBasis==='prior'?c.year-1:c.year));
  const reference=list.find(r=>r.id===decisionAnomalyReference)||list.find(r=>r.id===c.referenceId)||list[0];
  const priorYear=state.cases.find(r=>r.year===c.year-1);
  const scope=decisionScope(),result=decisionAnomalyCandidates(c,scope,{basis:decisionAnomalyBasis,reference,priorYear,change:decisionAnomalyChange,points:decisionAnomalyPoints});
  decisionAnomalyPreview={key:decisionSignature(c,decisionAnomalyBasis,reference,scope,decisionAnomalyChange,decisionAnomalyPoints),result};render();
 }catch(e){decisionAnomalyPreview=null;toast(e.message);}
}
