// CVP workbench with EXPLICIT cost-behavior inputs. Never infer fixed/variable
// labels from pooled accounting expenses or silently recast the original P&L.
let decisionBepMode='model',decisionCvpPeriod='all',decisionCvpCosts={},decisionCvpFixed='',decisionCvpDA='',decisionCvpAmountUnit='100000000',decisionCvpAllocation='none',decisionCvpPreview=null;
const decisionOriginalBepScreen=decisionBepScreen;
decisionBepScreen=function(){
 return '<div class="decision-tabs decision-bep-modes" role="tablist" aria-label="손익분기점 분석 방식">'+
 [['model','재계산 모형 BEP'],['cvp','명시적 원가행태 CVP']].map(([k,label])=>'<button type="button" role="tab" aria-selected="'+(decisionBepMode===k)+'" class="'+(decisionBepMode===k?'active':'')+'" onclick="decisionBepMode=\''+k+'\';render()">'+label+'</button>').join('')+'</div>'+
 (decisionBepMode==='model'?decisionOriginalBepScreen():decisionCvpScreen());
};
function cvpSourceProducts(c,scope){
 const model=calculate(c),rows=planningRowsFromModel(model,scope);
 const products=new Map(c.products.map(x=>[x.id,x]));
 const ids=[...new Set(rows.map(r=>r.product))];
 if(ids.length>50)throw Error('제품이 50종을 넘습니다. SITE 또는 제품 필터로 분석 대상을 줄여 주세요.');
 return ids.map(id=>{
  const p=products.get(id),selected=rows.filter(r=>r.product===id);
  const original=c.rows.filter(r=>r.product===id&&scope.months.includes(r.m));
  const missing=original.some(r=>r.qty===null||r.qty===undefined);
  const qty=sum(selected.map(r=>r.qty)),revenue=sum(selected.map(r=>r.revenue));
  return {id,name:p?.name||id,site:p?.site||'',qty,revenue,price:qty>0?revenue/qty:null,missing};
 });
}
function buildExplicitCVP(c,scope,config){
 const products=cvpSourceProducts(c,scope);
 if(!products.length||products.some(p=>p.missing)||products.some(p=>!Number.isFinite(p.price)||p.price<=0||p.qty<0))throw Error('판매량·판매단가가 모두 입력된 제품만 CVP 분석할 수 있습니다.');
 const unitCost=config.unitCost;
 if(!unitCost||products.some(p=>!Object.hasOwn(unitCost,p.id)||unitCost[p.id]===''||unitCost[p.id]===null||!Number.isFinite(Number(unitCost[p.id]))||Number(unitCost[p.id])<0))throw Error('모든 대상 제품의 판매 1kg당 변동비를 직접 입력하세요. 임의 추정하지 않습니다.');
 const fixed=Number(config.fixed),dep=Number(config.depreciation);
 if(config.fixed===''||config.depreciation===''||![fixed,dep].every(Number.isFinite)||fixed<0||dep<0||dep>fixed)throw Error('기간 고정비와 그중 감가상각비를 입력하세요. 감가상각비는 고정비를 초과할 수 없습니다.');
 const allocation=config.allocation||'none';
 if(!['none','revenue','volume'].includes(allocation))throw Error('제품별 공통고정비 배부 기준을 확인하세요.');
 const qty=sum(products.map(p=>p.qty)),sales=sum(products.map(p=>p.revenue));
 if(!(qty>0&&sales>0))throw Error('입력된 판매량과 매출액이 양수여야 합니다.');
 const items=products.map(p=>{
  const variable=Number(unitCost[p.id]),cmUnit=p.price-variable;
  return {...p,variable,cmUnit,weight:p.qty/qty,revenueWeight:p.revenue/sales,contribution:p.qty*cmUnit};
 });
 const avgPrice=sales/qty,avgVariable=sum(items.map(p=>p.qty*p.variable))/qty,avgCm=avgPrice-avgVariable;
 const variableTotal=avgVariable*qty,contribution=sales-variableTotal;
 const operating=contribution-fixed,ebitda=operating+dep;
 const cmRatio=sales>0?contribution/sales:null;
 const attainable=avgCm>0;
 const solve=(expense)=>({
  available:attainable,
  qty:attainable?expense/avgCm:null,
  revenue:attainable?expense/avgCm*avgPrice:null
 });
 const bepOP=solve(fixed),bepEBITDA=solve(fixed-dep);
 const marginSafety=bepOP.available?(sales-bepOP.revenue)/sales:null;
 const leverage=Math.abs(operating)>1e-8?contribution/operating:null;
 const allocationItems=items.map(p=>{
  const share=allocation==='none'?null:allocation==='revenue'?p.revenueWeight:p.weight;
  const allocatedFixed=share===null?null:fixed*share;
  return {...p,allocationShare:share,allocatedFixed,allocatedDep:share===null?null:dep*share,opBepQty:share===null||p.cmUnit<=0?null:allocatedFixed/p.cmUnit};
 });
 const observed=aggregate(planningRowsFromModel(calculate(c),scope));
 return {products:allocationItems,sourceId:c.id,scope:clone(scope),fixed,dep,variableTotal,contribution,cmRatio,avgPrice,avgVariable,avgCm,qty,sales,operating,ebitda,bepOP,bepEBITDA,marginSafety,leverage,allocation,ledgerOP:observed.op,ledgerEBITDA:observed.ebitda,reconciliation:operating-observed.op,sourceFingerprint:JSON.stringify(c)};
}
function decisionCvpScreen(){
 const c=active(),scope=decisionScope(decisionCvpPeriod);
 let items;try{items=cvpSourceProducts(c,scope);}catch(e){return panel('명시적 원가행태 CVP','<p class="decision-notice">'+esc(e.message)+'</p>');}
 const key=decisionSignature(c,scope,decisionCvpCosts,decisionCvpFixed,decisionCvpDA,decisionCvpAmountUnit,decisionCvpAllocation);
 const result=decisionCvpPreview?.key===key?decisionCvpPreview.result:null;
 let ui='<p class="decision-footnote">원가행태를 임의로 추정하지 않습니다. 변동비는 판매된 제품 1kg당 원가(변동 제조원가 및 변동 판관비 포함)를 직접 입력하고, 분석 기간의 공통·개별 고정비 합계를 별도로 입력합니다. 제품 믹스는 현재 판매량 구성비로 고정합니다. 이 가정은 원본 P&L의 제조원가·재고이월 계산을 변경하지 않습니다.</p>'+
 '<div class="decision-controls"><label class="field">분석 기간<select onchange="decisionCvpPeriod=this.value;decisionCvpPreview=null;render()">'+option('all','연간 1~12월',decisionCvpPeriod==='all')+Array.from({length:12},(_,i)=>option(i+1,(i+1)+'월',decisionCvpPeriod===String(i+1))).join('')+'</select></label>'+
 '<label class="field">고정비·감가 입력 단위<select onchange="decisionCvpAmountUnit=this.value;decisionCvpPreview=null;render()">'+[['1','원'],['1000000','백만원'],['100000000','억원']].map(([k,v])=>option(k,v,k===decisionCvpAmountUnit)).join('')+'</select></label>'+
 '<label class="field">기간 고정비 (OP 포함)<input type="number" step="any" min="0" value="'+esc(decisionCvpFixed)+'" placeholder="실제 금액 입력" aria-label="고정비" onchange="decisionCvpFixed=this.value;decisionCvpPreview=null;render()"></label>'+
 '<label class="field">고정비 중 감가상각비<input type="number" step="any" min="0" value="'+esc(decisionCvpDA)+'" placeholder="없으면 0 입력" aria-label="감가상각비" onchange="decisionCvpDA=this.value;decisionCvpPreview=null;render()"></label>'+
 '<label class="field">제품별 고정비 배부<select onchange="decisionCvpAllocation=this.value;decisionCvpPreview=null;render()">'+option('none','배부하지 않음',decisionCvpAllocation==='none')+option('volume','판매량 기준 (가정)',decisionCvpAllocation==='volume')+option('revenue','매출액 기준 (가정)',decisionCvpAllocation==='revenue')+'</select></label></div>';
 ui+='<div class="decision-cvp-inputs"><table class="report-table"><thead><tr><th>제품 / SITE</th><th>판매량 kg</th><th>관측 평균 판가 원/kg</th><th>판매 1kg당 변동비 원/kg · 직접 입력</th></tr></thead><tbody>'+
 items.map(p=>'<tr><td>'+esc(p.name+' / '+p.site)+(p.missing?' · 미입력 월 있음':'')+'</td><td>'+fmt(p.qty,2)+'</td><td>'+(!Number.isFinite(p.price)?'미확인':fmt(p.price,2))+'</td><td><input type="number" min="0" step="any" aria-label="'+esc(p.name)+' 판매 단위변동비" placeholder="원가행태 직접 입력" value="'+esc(decisionCvpCosts[p.id]??'')+'" onchange="decisionCvpCosts['+JSON.stringify(p.id)+']=this.value;decisionCvpPreview=null;render()"></td></tr>').join('')+
 '</tbody></table></div><div class="decision-commands"><button type="button" class="primary" onclick="decisionRunCVP()">공헌이익·BEP 계산</button></div>';
 if(result){
  if(!result.bepOP.available)ui+='<p class="decision-notice">평균 공헌이익이 0 이하이므로 양의 판매량에서 손익분기점을 달성할 수 없습니다.</p>';
  ui+='<div class="decision-summary"><div><span>영업이익 기준 BEP 매출액</span><strong>'+(result.bepOP.available?display(result.bepOP.revenue)+' '+unitLabel():'산출 불가')+'</strong></div><div><span>EBITDA 기준 BEP 매출액</span><strong>'+(result.bepEBITDA.available?display(result.bepEBITDA.revenue)+' '+unitLabel():'산출 불가')+'</strong></div><div><span>안전한계율</span><strong>'+(result.marginSafety===null?'산출 불가':percent(result.marginSafety))+'</strong></div></div>'+
  safeTable(['경영지표','명시적 CVP 가정 계산'],[
   ['평균 공헌이익/kg',fmt(result.avgCm,2)+'원/kg'],['총 공헌이익',fmt(result.contribution/unit,2)+' '+unitLabel()],
   ['공헌이익률',percent(result.cmRatio)],['BEP 판매량 (영업이익)',result.bepOP.available?fmt(result.bepOP.qty,2)+'kg':'산출 불가'],
   ['BEP 판매량 (EBITDA)',result.bepEBITDA.available?fmt(result.bepEBITDA.qty,2)+'kg':'산출 불가'],
   ['CVP 영업이익',fmt(result.operating/unit,2)+' '+unitLabel()],['CVP EBITDA',fmt(result.ebitda/unit,2)+' '+unitLabel()],
   ['영업레버리지 DOL',result.leverage===null?'영업이익 0 · 산출 불가':fmt(result.leverage,3)+'배'],
   ['기존 손익 모델의 영업이익',fmt(result.ledgerOP/unit,2)+' '+unitLabel()],
   ['CVP - 기존 모델 영업이익 차이',fmt(result.reconciliation/unit,2)+' '+unitLabel()]
  ])+decisionCvpChart(result)+
  '<div class="decision-details">'+safeTable(['제품','판매 구성비','공헌이익/kg','배부 고정비','제품별 BEP 판매량'],result.products.map(p=>[p.name,percent(p.weight),fmt(p.cmUnit,2)+'원',p.allocatedFixed===null?'배부 안 함':fmt(p.allocatedFixed/unit,2)+' '+unitLabel(),p.opBepQty===null?'산출 불가 · 배부 없음 또는 CM≤0':fmt(p.opBepQty,2)+'kg']))+'</div>'+
  '<p class="decision-footnote">고정비 배부는 사용자 선택에 의한 분석용 가정이며 실제 장부의 배부 기준이 아닙니다. CVP 영업이익과 기존 손익 엔진의 차이를 반드시 검토하세요. 생산·재고 이월, 비용 인식 시점 및 원가행태가 다르면 두 값이 일치하지 않을 수 있습니다. 생산량과 판매량은 별개의 실제 입력값으로 유지됩니다.</p>';
 }
 return panel('원가행태 명시형 손익분기점 · CVP',ui);
}
function decisionCvpChart(r){
 if(!r.bepOP.available)return '';
 const upper=Math.max(r.bepOP.qty,r.qty,1)*1.6,scale=Math.max(r.sales,upper*r.avgPrice,r.fixed+upper*r.avgVariable,1);
 const x=v=>55+v/upper*600,y=v=>190-v/scale*158;
 const n=16,coords=fn=>Array.from({length:n+1},(_,i)=>{const t=upper*i/n;return x(t).toFixed(2)+','+y(fn(t)).toFixed(2)}).join(' ');
 const root=r.bepOP.qty;
 return '<div class="decision-bep-chart"><svg viewBox="0 0 720 228" role="img" aria-label="명시적 CVP 매출액과 총비용 교차점"><line x1="55" y1="20" x2="55" y2="190" class="bep-axis"/><line x1="55" y1="190" x2="655" y2="190" class="bep-axis"/><polyline class="bep-revenue-line" points="'+coords(t=>t*r.avgPrice)+'"/><polyline class="bep-cost-line" points="'+coords(t=>r.fixed+t*r.avgVariable)+'"/><line x1="'+x(root).toFixed(2)+'" y1="20" x2="'+x(root).toFixed(2)+'" y2="190" class="bep-root-line"/><circle cx="'+x(root).toFixed(2)+'" cy="'+y(root*r.avgPrice).toFixed(2)+'" r="5" class="bep-root-point"/><text x="55" y="211" class="bep-chart-label">판매량 0kg</text><text x="655" y="211" text-anchor="end" class="bep-chart-label">'+fmt(upper,0)+'kg</text></svg><div class="decision-legend"><span><i class="revenue"></i>매출액</span><span><i class="cost"></i>고정비 + 변동비</span><span><i class="breakeven"></i>영업이익 BEP</span></div></div>';
}
function decisionRunCVP(){
 try{
  const c=active(),scope=decisionScope(decisionCvpPeriod),fixed=String(decisionCvpFixed).trim()===''?'':Number(decisionCvpFixed)*Number(decisionCvpAmountUnit);
  const depreciation=String(decisionCvpDA).trim()===''?'':Number(decisionCvpDA)*Number(decisionCvpAmountUnit);
  const result=buildExplicitCVP(c,scope,{unitCost:decisionCvpCosts,fixed,depreciation,allocation:decisionCvpAllocation});
  const key=decisionSignature(c,scope,decisionCvpCosts,decisionCvpFixed,decisionCvpDA,decisionCvpAmountUnit,decisionCvpAllocation);
  decisionCvpPreview={key,result};render();
 }catch(e){decisionCvpPreview=null;toast(e.message);}
}
