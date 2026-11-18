function chartMonthBar(x,index,max){
  const month=index+1,label=month+'월 · 매출액 '+fmt(x.revenue)+'원 · 영업이익 '+fmt(x.op)+'원';
  return '<div class="month-bar chart-hit" tabindex="0" role="img" aria-label="'+esc(label)+'" data-chart-kind="month" data-chart-label="'+month+'월" data-chart-revenue="'+x.revenue+'" data-chart-profit="'+x.op+'"><div class="bar-pair"><div class="bar" style="height:'+Math.max(1,x.revenue/max*115)+'px"></div><div class="bar dark" style="height:'+Math.max(1,Math.abs(x.op)/max*115)+'px;'+(x.op<0?'background:var(--red)':'')+'"></div></div><small>'+month+'월</small></div>';
}
function chartProfitBar(label,value,index,revenue){
  return '<div class="bridge-row chart-hit" tabindex="0" role="img" aria-label="'+esc(label+' '+fmt(value)+'원')+'" data-chart-kind="profit" data-chart-label="'+esc(label)+'" data-chart-value="'+value+'" data-chart-revenue="'+revenue+'"><span>'+esc(label)+'</span><div class="bridge-track"><div class="bridge-fill '+(index===3?'strong':'')+'" style="width:'+Math.min(100,Math.abs(value)/(revenue||1)*100)+'%;'+(value<0?'background:var(--red)':'')+'"></div></div><strong class="'+(value<0?'negative':'')+'">'+display(value)+'</strong></div>';
}
let chartTooltip=null,chartHoverTarget=null;
function hideChartTooltip(){
  if(chartTooltip)chartTooltip.hidden=true;
  if(chartHoverTarget){chartHoverTarget.classList.remove('is-chart-active');chartHoverTarget.removeAttribute('aria-describedby');chartHoverTarget=null;}
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
