// Phase 5 · Executive report, derived only from the current local CASE and shared FPA model.
let decisionReportReference=null,decisionReportPreview=null;
function buildExecutiveReport(c,scope,reference=null,peers=[]){
 if(!scope.months?.length)throw Error('보고 기간을 확인하세요.');
 const model=calculate(c),rows=planningRowsFromModel(model,scope),totals=aggregate(rows);
 const monthly=scope.months.map(month=>{
  const values=aggregate(planningRowsFromModel(model,{...scope,months:[month]}));
  const entered=c.rows.some(r=>r.m===month&&(!scope.product||r.product===scope.product)&&(!scope.site||c.products.some(p=>p.id===r.product&&p.site===scope.site))&&typeof r.qty==='number');
  return {month,values,entered,kind:forecastLabel(c,month)};
 });
 const missing=monthly.filter(m=>!m.entered).map(m=>m.month);
 let refValues=null,bridge=null;
 if(reference&&reference.id!==c.id&&reference.year===c.year){
  try{
   const comparison=buildScenarioComparison([c,reference],scope,c).cases;
   if(comparison.every(x=>x.available)){
    refValues=comparison[1].values;
    bridge=buildProfitBridge(reference,c,scope,'op');
   }
  }catch(e){refValues=null;bridge=null;}
 }
 const quarters=[1,2,3,4].map(q=>({quarter:q,values:aggregate(rows.filter(r=>r.m>=(q-1)*3+1&&r.m<=q*3))}));
 const candidates=[c,...peers.filter(x=>x.year===c.year&&x.id!==c.id)].slice(0,4);
 const scenarios=candidates.length>1?buildScenarioComparison(candidates,scope,c).cases.filter(x=>x.available):[];
 const priorYear=peers.find(x=>x.year===c.year-1)||null;
 const signals=decisionAnomalyCandidates(c,scope,{basis:'mom',change:30,points:5,priorYear}).signals.filter(x=>x.status==='검토 신호');
 const riskAlerts=signals.slice().sort((a,b)=>Math.abs(b.kind==='pp'?b.delta*100:b.magnitude??0)-Math.abs(a.kind==='pp'?a.delta*100:a.magnitude??0)).slice(0,3);
 const issues=[];
 if(model.warnings.length)issues.push('모형 검산 '+model.warnings.length+'건 확인 필요');
 if(missing.length)issues.push('실적·계획 미입력 월: '+missing.join(', ')+'월');
 if(riskAlerts.length)issues.push(...riskAlerts.map(x=>x.month+'월 '+x.label+' 변동 신호'));
 if(!issues.length)issues.push('설정 기준상 중요 변동 신호나 검산 경고가 확인되지 않음');
 const insights=[];
 if(refValues){
  const rdiff=totals.revenue-refValues.revenue,odiff=totals.op-refValues.op;
  if(rdiff>0&&odiff<0)insights.push('매출액은 기준 대비 '+fmt(rdiff/unit,1)+unitLabel()+' 증가했으나 영업이익은 '+fmt(Math.abs(odiff)/unit,1)+unitLabel()+' 감소. 매출원가와 판관비 변동을 점검할 필요');
  else insights.push('기준 CASE 대비 매출액 '+(rdiff>=0?'+':'')+fmt(rdiff/unit,1)+unitLabel()+', 영업이익 '+(odiff>=0?'+':'')+fmt(odiff/unit,1)+unitLabel());
  if(Number.isFinite(totals.opMargin)&&Number.isFinite(refValues.opMargin))insights.push('영업이익률은 기준 대비 '+(totals.opMargin>=refValues.opMargin?'+':'')+fmt((totals.opMargin-refValues.opMargin)*100,2)+'%p 변동');
  const top=bridge?.steps.filter(x=>Math.abs(x.amount)>1e-6).sort((a,b)=>Math.abs(b.amount)-Math.abs(a.amount))[0];
  if(top)insights.push('순차대체 분석에서 가장 큰 영업이익 증감 항목: '+top.label+' ('+(top.amount>=0?'+':'')+fmt(top.amount/unit,1)+unitLabel()+')');
 }else{
  if(totals.revenue>0)insights.push('연간 영업이익률 '+percent(totals.opMargin)+', EBITDA율 '+percent(totals.ebitdaMargin));
  insights.push('비교 가능한 같은 연도 기준 CASE가 없어 기준 대비 증감 원인은 작성하지 않음');
 }
 if(missing.length)insights.push('미입력 월은 실제 0으로 가정하지 않았으며, 연간 전망 완결성 검토가 필요');
 if(model.warnings.length)insights.push('재고·배부·입력 검산 경고가 남아 있어 수치 확정 전 확인 필요');
 return {year:c.year,label:c.scenario+' / '+c.name,kind:c.kind,scope:clone(scope),totals,monthly,quarters,scenarios,refValues,bridge,insights:insights.slice(0,4),risks:issues.slice(0,4),missing,warningCount:model.warnings.length,sourceId:c.id};
}
function executiveMonthlyChart(report){
 const valid=report.monthly.filter(m=>m.entered);
 if(!valid.length)return '<p class="report-detail">조회 기간에 입력된 월이 없어 추이 차트를 만들지 않았습니다.</p>';
 const values=valid.flatMap(m=>[m.values.revenue,m.values.op]);
 const min=Math.min(0,...values),max=Math.max(1,...values),span=max-min||1;
 const x=i=>52+i/11*587,y=v=>154-(v-min)/span*119;
 const paths=key=>{
  const parts=[];let ongoing=[];
  for(const m of report.monthly){
   if(!m.entered){if(ongoing.length)parts.push(ongoing);ongoing=[];continue;}
   ongoing.push(x(m.month-1).toFixed(1)+','+y(m.values[key]).toFixed(1));
  }
  if(ongoing.length)parts.push(ongoing);
  return parts.map(group=>group.length>1?'<polyline points="'+group.join(' ')+'"/>':'<circle cx="'+group[0].split(',')[0]+'" cy="'+group[0].split(',')[1]+'" r="2.6"/>').join('');
 };
 return '<svg viewBox="0 0 686 180" role="img" aria-label="입력된 월만 연결한 월별 매출액과 영업이익 추이">'+
 '<line x1="52" y1="35" x2="52" y2="154" class="report-axis" stroke="#94a3b8"/>'+
 '<line x1="52" y1="154" x2="639" y2="154" class="report-axis" stroke="#94a3b8"/>'+
 '<g class="report-revenue" stroke="#2457ed" stroke-width="2.8" fill="none">'+paths('revenue')+'</g>'+
 '<g class="report-profit" stroke="#ce4549" stroke-width="2.8" fill="none">'+paths('op')+'</g>'+
 report.monthly.map(m=>'<text x="'+x(m.month-1).toFixed(1)+'" y="168" text-anchor="middle" class="report-axis-label" fill="#64748b" font-size="11">'+m.month+'</text>').join('')+
 '<text x="52" y="21" class="report-axis-label" fill="#64748b" font-size="11">매출액 / 영업이익 · '+esc(unitLabel())+'</text></svg>';
}
function executiveReportMarkup(r){
 const asMoney=v=>display(v)+' '+unitLabel(),nl=v=>esc(v);
 const summary=[['매출액',asMoney(r.totals.revenue)],['매출원가',asMoney(r.totals.cogs)],['영업이익',asMoney(r.totals.op)],['EBITDA',asMoney(r.totals.ebitda)],['영업이익률',percent(r.totals.opMargin)]];
 const quarters='<table class="report-table"><thead><tr><th>구분</th>'+r.quarters.map(x=>'<th>'+x.quarter+'Q</th>').join('')+'</tr></thead><tbody>'+
 [['매출액','revenue'],['영업이익','op'],['EBITDA','ebitda']].map(([label,key])=>'<tr><td>'+label+'</td>'+r.quarters.map(q=>'<td>'+display(q.values[key])+'</td>').join('')+'</tr>').join('')+'</tbody></table>';
 const bridge=r.bridge?'<table class="report-table"><thead><tr><th>영업이익 증감 요인</th><th>증감</th></tr></thead><tbody>'+r.bridge.steps.filter(x=>Math.abs(x.amount)>1e-6).sort((a,b)=>Math.abs(b.amount)-Math.abs(a.amount)).slice(0,5).map(s=>'<tr><td>'+nl(s.label)+'</td><td>'+(s.amount>=0?'+':'')+display(s.amount)+'</td></tr>').join('')+'</tbody></table><small>순차대체법 · 잔차 포함, 기여도는 대체 순서에 의존</small>':'<p>동일 연도 기준 CASE 없음 / 비교 가능한 데이터 부족</p>';
 const scenario=r.scenarios.length>1?'<table class="report-table"><thead><tr><th>CASE</th><th>매출액</th><th>영업이익</th><th>EBITDA</th></tr></thead><tbody>'+r.scenarios.slice(0,4).map(c=>'<tr><td>'+nl(c.label)+'</td><td>'+display(c.values.revenue)+'</td><td>'+display(c.values.op)+'</td><td>'+display(c.values.ebitda)+'</td></tr>').join('')+'</tbody></table>':'<p>비교 CASE가 충분하지 않음</p>';
 return '<section class="decision-report-card" id="executive-report" aria-label="경영진 보고서">'+
 '<header class="report-heading"><div><strong>FPA / MANAGEMENT REVIEW</strong><h2>'+r.year+'년 경영성과 요약</h2><p>'+nl(r.label)+' · '+nl(r.kind)+' · '+nl(planningScopeLabel(active(),r.scope))+'</p></div><span>보고 기준: 현재 CASE · '+nl(new Date().toLocaleDateString('ko-KR'))+'</span></header>'+
 '<div class="report-kpis">'+summary.map(([label,value])=>'<div><span>'+label+'</span><strong>'+nl(value)+'</strong></div>').join('')+'</div>'+
 '<div class="report-grid">'+
 '<section><h3>월별 손익 추이</h3>'+executiveMonthlyChart(r)+'<div class="report-chart-legend"><span>━ 매출액</span><span>━ 영업이익</span></div></section>'+
 '<section><h3>분기별 실적 · '+esc(unitLabel())+'</h3><span class="report-inline-actions"><button type="button" onclick="decisionExportReportPart(&quot;quarter&quot;,&quot;copy&quot;)">복사</button><button type="button" onclick="decisionExportReportPart(&quot;quarter&quot;,&quot;csv&quot;)">CSV</button></span>'+quarters+'<p class="report-detail">매출액·이익률은 연간 합계 및 합산 금액을 기준으로 계산</p></section>'+
 '<section><h3>기준 대비 영업이익 증감</h3><span class="report-inline-actions"><button type="button" onclick="decisionExportReportPart(&quot;bridge&quot;,&quot;copy&quot;)">복사</button><button type="button" onclick="decisionExportReportPart(&quot;bridge&quot;,&quot;csv&quot;)">CSV</button></span>'+bridge+'</section>'+
 '<section><h3>주요 경영 리스크 · 데이터 검토</h3><ul>'+r.risks.map(x=>'<li>'+nl(x)+'</li>').join('')+'</ul></section>'+
 '<section><h3>주요 시나리오 전망 · '+esc(unitLabel())+'</h3><span class="report-inline-actions"><button type="button" onclick="decisionExportReportPart(&quot;scenario&quot;,&quot;copy&quot;)">복사</button><button type="button" onclick="decisionExportReportPart(&quot;scenario&quot;,&quot;csv&quot;)">CSV</button></span>'+scenario+'</section>'+
 '<section><h3>핵심 시사점</h3><span class="report-inline-actions"><button type="button" onclick="decisionExportReportPart(&quot;insights&quot;,&quot;copy&quot;)">복사</button><button type="button" onclick="decisionExportReportPart(&quot;insights&quot;,&quot;csv&quot;)">CSV</button></span><ul>'+r.insights.map(x=>'<li>'+nl(x)+'</li>').join('')+'</ul></section>'+
 '</div><footer>본 보고서는 브라우저에 저장된 CASE를 기반으로 자동 작성한 정량 검토자료입니다. 확정되지 않은 인과관계나 외부 사업정보를 추정하지 않습니다. 검산 경고 '+r.warningCount+'건 · 미입력 월 '+r.missing.length+'개</footer></section>';
}
function decisionReportScreen(){
 const c=active(),references=state.cases.filter(x=>x.id!==c.id&&x.year===c.year);
 const reference=decisionReportReference==='none'?null:references.find(x=>x.id===(decisionReportReference||c.referenceId||compareId))||references[0]||null;
 const peers=state.cases.filter(x=>x.year===c.year&&x.id!==c.id);
 const scope=decisionScope(),key=decisionSignature(c,reference,peers,scope);
 const report=decisionReportPreview?.key===key?decisionReportPreview.report:null;
 let controls='<div class="decision-controls"><label class="field">비교 기준 CASE<select aria-label="경영진 보고 기준 CASE" onchange="decisionReportReference=this.value;decisionReportPreview=null;render()">'+option('none','기준 없음',!reference)+references.map(r=>option(r.id,r.scenario+' / '+r.name,r.id===reference?.id)).join('')+'</select></label></div>'+
 '<div class="decision-commands"><button type="button" class="primary" onclick="decisionRunReport()">보고서 생성</button>'+(report?'<button type="button" onclick="decisionPrintReport()">PDF 출력…</button><button type="button" onclick="decisionCopyReport()">시사점 복사</button><button type="button" onclick="decisionDownloadReportCsv()">표 CSV 저장</button><button type="button" onclick="decisionDownloadReportSvg()">차트 SVG 저장</button>':'')+'</div>';
 if(!report)return panel('경영진 보고 · Executive Report',controls+'<p class="decision-footnote">A4 가로형 1페이지 요약 보고서입니다. 인쇄 메뉴에서 “PDF로 저장”을 선택할 수 있습니다. 재무 숫자·변동 원인·위험 신호와 시사점은 현재 CASE 및 비교 CASE의 계산값만 사용합니다.</p>');
 return panel('경영진 보고 · Executive Report',controls+executiveReportMarkup(report));
}
function decisionRunReport(){
 try{
  const c=active(),scope=decisionScope(),references=state.cases.filter(r=>r.id!==c.id&&r.year===c.year);
  const reference=decisionReportReference==='none'?null:references.find(x=>x.id===(decisionReportReference||c.referenceId||compareId))||references[0]||null;
  const peers=state.cases.filter(x=>x.year===c.year&&x.id!==c.id),report=buildExecutiveReport(c,scope,reference,peers);
  decisionReportPreview={key:decisionSignature(c,reference,peers,scope),report};render();
 }catch(e){decisionReportPreview=null;toast(e.message);}
}
function decisionPrintReport(){if(!decisionReportPreview?.report){toast('보고서를 먼저 생성하세요.');return;}window.print();}
function decisionCopyReport(){
 const r=decisionReportPreview?.report;if(!r)return;
 const s=[r.year+'년 '+r.label,'매출액 '+fmt(r.totals.revenue,2)+'원','영업이익 '+fmt(r.totals.op,2)+'원','EBITDA '+fmt(r.totals.ebitda,2)+'원','검토 사항:',...r.risks,'핵심 시사점:',...r.insights].join('\n');
 if(!navigator.clipboard?.writeText){toast('이 환경에서는 클립보드를 사용할 수 없습니다.');return;}
 navigator.clipboard.writeText(s).then(()=>toast('보고 요약을 복사했습니다.')).catch(()=>toast('클립보드 권한을 확인하세요.'));
}
function decisionDownloadReportCsv(){
 const r=decisionReportPreview?.report;if(!r)return;
 const rows=[['월','매출액 원','매출원가 원','영업이익 원','EBITDA 원','영업이익률 %','구분'],...r.monthly.map(x=>[x.month,x.entered?x.values.revenue:'미입력',x.entered?x.values.cogs:'미입력',x.entered?x.values.op:'미입력',x.entered?x.values.ebitda:'미입력',x.entered?x.values.opMargin*100:'미입력',x.kind])];
 download('FPA_경영진보고_'+r.year+'.csv',csvInputExport(rows),'text/csv;charset=utf-8');
}
function decisionDownloadReportSvg(){
 if(!decisionReportPreview?.report)return;
 const node=document.querySelector('#executive-report svg');
 if(!node){toast('저장할 차트가 없습니다.');return;}
 const markup=new XMLSerializer().serializeToString(node);
 const text=markup.includes('xmlns=')?markup:markup.replace('<svg ','<svg xmlns="http://www.w3.org/2000/svg" ');
 download('FPA_월별손익차트.svg',text,'image/svg+xml;charset=utf-8');
}


function decisionReportPartRows(r,part){
 if(part==='kpi')return [['지표','금액 원 / 비율 %'],['매출액',r.totals.revenue],['매출원가',r.totals.cogs],['영업이익',r.totals.op],['EBITDA',r.totals.ebitda],['영업이익률 %',r.totals.opMargin*100]];
 if(part==='quarter')return [['분기','매출액 원','영업이익 원','EBITDA 원'],...r.quarters.map(q=>[q.quarter+'Q',q.values.revenue,q.values.op,q.values.ebitda])];
 if(part==='bridge'){
  if(!r.bridge)throw Error('비교할 기준 CASE가 없어 영업이익 증감표가 없습니다.');
  return [['증감 요인','증감 금액 원','누적 영업이익 원'],...r.bridge.steps.map(s=>[s.label,s.amount,s.to])];
 }
 if(part==='scenario'){
  if(r.scenarios.length<2)throw Error('비교 가능한 시나리오가 2개 미만입니다.');
  return [['CASE','매출액 원','영업이익 원','EBITDA 원','영업이익률 %'],...r.scenarios.map(c=>[c.label,c.values.revenue,c.values.op,c.values.ebitda,c.values.opMargin*100])];
 }
 if(part==='insights')return [['핵심 시사점'],...r.insights.map(x=>[x])];
 throw Error('지원하지 않는 경영진 보고 항목입니다.');
}
function decisionExportReportPart(part,mode){
 try{
  const r=decisionReportPreview?.report;
  if(!r)throw Error('보고서를 먼저 생성하세요.');
  const rows=decisionReportPartRows(r,part);
  if(mode==='csv'){download('FPA_보고서_'+part+'.csv',csvInputExport(rows),'text/csv;charset=utf-8');return;}
  if(mode!=='copy')throw Error('복사 또는 CSV를 선택하세요.');
  if(!navigator.clipboard?.writeText)throw Error('클립보드를 사용할 수 없습니다.');
  const tsv=rows.map(row=>row.map(cell=>String(cell??'').replace(/[\r\n\t]+/g,' ')).join('\t')).join('\n');
  navigator.clipboard.writeText(tsv).then(()=>toast('표를 복사했습니다.')).catch(()=>toast('클립보드 권한을 확인하세요.'));
 }catch(e){toast(e.message);}
}
