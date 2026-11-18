function chartMonthBar(x,index,max){
  const month=index+1,label=month+'월 · 매출액 '+fmt(x.revenue)+'원 · 영업이익 '+fmt(x.op)+'원 · 영업이익률 '+(x.revenue?percent(x.op/x.revenue):'산출 불가');
  return '<div class="month-bar chart-hit" tabindex="0" role="img" aria-label="'+esc(label)+'" data-chart-kind="month" data-chart-label="'+month+'월" data-chart-revenue="'+x.revenue+'" data-chart-profit="'+x.op+'"><div class="bar-pair"><div class="bar" style="height:'+Math.max(1,x.revenue/max*115)+'px"></div><div class="bar dark" style="height:'+Math.max(1,Math.abs(x.op)/max*115)+'px;'+(x.op<0?'background:var(--red)':'')+'"></div></div><small>'+month+'월</small></div>';
}
function chartMarginScale(months){
  const values=months.map(x=>x.revenue>0&&Number.isFinite(x.op/x.revenue)?x.op/x.revenue*100:null),valid=values.filter(x=>x!==null);
  if(!valid.some(v=>v!==0))return {values,min:0,max:20,step:5};
  const low=Math.min(0,...valid),high=Math.max(0,...valid),range=Math.max(high-low,5);
  const raw=range/4,power=10**Math.floor(Math.log10(raw)),step=[1,2,5,10].find(x=>x*power>=raw)*power;
  const min=Math.floor(low/step)*step,max=high===low?min+step*4:Math.ceil(high/step)*step;
  return {values,min,max,step};
}
function chartMonthlyCombo(months,max){
  const scale=chartMarginScale(months),y=value=>120-(value-scale.min)/(scale.max-scale.min)*120;
  let path='',connected=false;
  const points=scale.values.map((value,i)=>{
    if(value===null){connected=false;return '';}
    const x=(i+.5)*100,cy=y(value);path+=(connected?' L ':' M ')+x.toFixed(2)+' '+cy.toFixed(2);connected=true;
    return '<span class="margin-point" data-line-month="'+(i+1)+'" style="left:'+((i+.5)/12*100).toFixed(4)+'%;top:'+cy.toFixed(2)+'px"></span>';
  }).join('');
  const ticks=[];for(let v=scale.min;v<=scale.max+scale.step*.001;v+=scale.step)ticks.push(Math.abs(v)<scale.step*.001?0:v);
  const axis=ticks.map(v=>'<span style="top:'+y(v)+'px">'+fmt(v,scale.step<1?Math.min(3,Math.ceil(-Math.log10(scale.step))):0)+'%</span>').join('');
  const grid=ticks.map(v=>'<line x1="0" x2="1200" y1="'+y(v)+'" y2="'+y(v)+'" vector-effect="non-scaling-stroke"/>').join('');
  return '<div class="chart-axis-labels"><span>금액 · '+unitLabel()+'</span><span>영업이익률 · 오른쪽 축</span></div><div class="combo-chart"><div class="bar-chart">'+months.map((x,i)=>chartMonthBar(x,i,max)).join('')+'</div><svg class="margin-layer" viewBox="0 0 1200 120" preserveAspectRatio="none" aria-hidden="true"><g class="margin-grid">'+grid+'</g><path class="margin-line" d="'+path.trim()+'" vector-effect="non-scaling-stroke"/></svg><div class="margin-points" aria-hidden="true">'+points+'</div><div class="margin-axis" aria-label="영업이익률 축">'+axis+'</div></div>';
}
function chartProfitBar(label,value,index,revenue){
  return '<div class="bridge-row chart-hit" tabindex="0" role="img" aria-label="'+esc(label+' '+fmt(value)+'원')+'" data-chart-kind="profit" data-chart-label="'+esc(label)+'" data-chart-value="'+value+'" data-chart-revenue="'+revenue+'"><span>'+esc(label)+'</span><div class="bridge-track"><div class="bridge-fill '+(index===3?'strong':'')+'" style="width:'+Math.min(100,Math.abs(value)/(revenue||1)*100)+'%;'+(value<0?'background:var(--red)':'')+'"></div></div><strong class="'+(value<0?'negative':'')+'">'+display(value)+'</strong></div>';
}
let chartTooltip=null,chartHoverTarget=null;
function hideChartTooltip(){
  if(chartTooltip)chartTooltip.hidden=true;
  if(chartHoverTarget){chartHoverTarget.classList.remove('is-chart-active');chartHoverTarget.removeAttribute('aria-describedby');chartHoverTarget=null;}
  document.querySelector?.('.margin-point.is-line-active')?.classList.remove('is-line-active');
}
function showChartTooltip(target){
  if(chartHoverTarget===target)return;
  hideChartTooltip();
  if(!chartTooltip){chartTooltip=document.createElement('div');chartTooltip.className='chart-tooltip';chartTooltip.id='chart-tooltip';chartTooltip.setAttribute('role','tooltip');document.body.append(chartTooltip);}
  const data=target.dataset,revenue=Number(data.chartRevenue),row=(label,value,kind='')=>'<div class="chart-tooltip-row '+kind+'"><span>'+esc(label)+'</span><strong>'+esc(value)+'</strong></div>';
  let content='<div class="chart-tooltip-title">'+esc(data.chartLabel)+'</div>';
  if(data.chartKind==='month'){
    const profit=Number(data.chartProfit);
    content+=row('매출액',fmt(revenue)+'원','revenue')+row('영업이익',fmt(profit)+'원',profit<0?'negative':'profit')+row('영업이익률',revenue?percent(profit/revenue):'—');
  }else{
    const value=Number(data.chartValue);
    content+=row('금액',fmt(value)+'원',value<0?'negative':'profit')+row('매출액 대비',revenue?percent(value/revenue):'—');
  }
  chartTooltip.innerHTML=content;chartTooltip.hidden=false;
  chartHoverTarget=target;target.classList.add('is-chart-active');target.setAttribute('aria-describedby',chartTooltip.id);
  if(data.chartKind==='month')target.closest('.combo-chart')?.querySelector('[data-line-month="'+parseInt(data.chartLabel,10)+'"]')?.classList.add('is-line-active');
  const box=target.getBoundingClientRect(),tip=chartTooltip.getBoundingClientRect(),width=document.documentElement.clientWidth,height=window.innerHeight;
  const left=Math.max(12,Math.min(box.left+box.width/2-tip.width/2,width-tip.width-12));
  let top=box.top-tip.height-12;if(top<12)top=Math.min(box.bottom+12,height-tip.height-12);
  chartTooltip.style.left=left+'px';chartTooltip.style.top=Math.max(12,top)+'px';
}
function initChartInteractions(){
  if(typeof window==='undefined'||!document.createElement)return;
  hideChartTooltip();
  const root=document.getElementById('content');if(!root||root.dataset.chartHoverBound)return;
  root.dataset.chartHoverBound='true';
  root.addEventListener('pointerover',event=>{const target=event.target.closest?.('.chart-hit');if(target&&root.contains(target)&&!target.contains(event.relatedTarget))showChartTooltip(target);});
  root.addEventListener('pointerout',event=>{const target=event.target.closest?.('.chart-hit');if(target&&!target.contains(event.relatedTarget)&&event.pointerType!=='touch'&&!target.matches(':focus-visible'))hideChartTooltip();});
  root.addEventListener('focusin',event=>{const target=event.target.closest?.('.chart-hit');if(target)showChartTooltip(target);});
  root.addEventListener('focusout',event=>{if(chartHoverTarget&&!chartHoverTarget.contains(event.relatedTarget))hideChartTooltip();});
  root.addEventListener('click',event=>{const target=event.target.closest?.('.chart-hit');if(target)showChartTooltip(target);});
  document.addEventListener('pointerdown',event=>{if(chartHoverTarget&&!chartHoverTarget.contains(event.target))hideChartTooltip();});
  document.addEventListener('keydown',event=>{if(event.key==='Escape')hideChartTooltip();});
  document.addEventListener('scroll',hideChartTooltip,{capture:true,passive:true});
  window.addEventListener('resize',hideChartTooltip,{passive:true});
}
