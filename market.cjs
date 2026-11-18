'use strict';
// Only public, fixed upstream URLs. No application records or visitor text leave this process.
const CURRENCIES=[['USD','미국 달러'],['EUR','유로'],['JPY','일본 엔',100],['CNY','중국 위안'],['MYR','말레이시아 링깃'],['HUF','헝가리 포린트']];
const ECB='https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist-90d.xml';
const ECB_PAGE='https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html';
const EIA_DAILY='https://www.eia.gov/todayinenergy/prices.php';
const dateOK=s=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
const finite=v=>typeof v==='number'&&Number.isFinite(v);
function observation(points){const good=points.filter(p=>dateOK(p.date)&&finite(p.value)&&p.value>0).sort((a,b)=>b.date.localeCompare(a.date));const unique=good.filter((p,i)=>!i||p.date!==good[i-1].date);if(!unique.length)throw Error('No valid dated observation');const [last,previous]=unique;return {...last,previous:previous?.value??null,previousDate:previous?.date??null,changePct:previous?(last.value/previous.value-1)*100:null};}
function parseECB(xml){if(typeof xml!=='string'||xml.length>500000)throw Error('Invalid ECB response');const days=[];for(const m of xml.matchAll(/<Cube\s+time=['"](\d{4}-\d{2}-\d{2})['"]\s*>([\s\S]*?)<\/Cube>/g)){const rates={EUR:1};for(const r of m[2].matchAll(/currency=['"]([A-Z]{3})['"]\s+rate=['"]([\d.]+)['"]/g))rates[r[1]]=Number(r[2]);if(rates.KRW>0)days.push({date:m[1],rates});}if(days.length<2)throw Error('ECB observations missing');return CURRENCIES.filter(([code])=>days.some(d=>d.rates[code]>0)).map(([code,name,amount=1])=>({code,name,kind:'fx',unit:'원 / '+amount+' '+code,amount,...observation(days.filter(d=>d.rates[code]>0).map(d=>({date:d.date,value:d.rates.KRW/d.rates[code]*amount}))),source:'ECB 기준환율 · 원화 교차환산',sourceUrl:ECB_PAGE,frequency:'영업일 일별',method:'KRW/EUR ÷ 통화/EUR × 표시 통화량',status:'ok'}));}
function parseOilCSV(csv,code){if(!['DCOILBRENTEU','DCOILWTICO'].includes(code))throw Error('Unsupported series');const lines=String(csv).replace(/^\uFEFF/,'').trim().split(/\r?\n/);const headers=lines.shift().split(',');const col=headers.indexOf(code);if(col<0)throw Error('Unexpected oil CSV');const points=lines.map(line=>{const cells=line.split(',');return {date:cells[0],value:cells[col]?.trim()?Number(cells[col]):NaN};});const data=observation(points);return {code:code==='DCOILBRENTEU'?'BRENT':'WTI',name:code==='DCOILBRENTEU'?'Brent 현물':'WTI 현물',kind:'oil',unit:'USD/bbl',amount:1,...data,source:'EIA · FRED 제공',sourceUrl:'https://fred.stlouisfed.org/series/'+code,frequency:'일별 현물 · 공표 지연',method:'최근 유효 관측값과 직전 유효 관측값 비교',status:'ok'};}
function parseOilHTML(html,code){
 if(!['DCOILBRENTEU','DCOILWTICO'].includes(code)||!String(html).includes(code))throw Error('Unexpected oil series');
 const points=[];for(const m of String(html).matchAll(/<td[^>]*>\s*(\d{4}-\d{2}-\d{2}):?(?:&nbsp;)?\s*<\/td>\s*<td[^>]*class=["'][^"']*series-obs value[^"']*["'][^>]*>\s*([\d.]+)\s*<\/td>/g))points.push({date:m[1],value:Number(m[2])});
 if(points.length<2)throw Error('Oil observation table changed');
 const q=parseOilCSV('observation_date,'+code+'\n'+points.map(p=>p.date+','+p.value).join('\n'),code);q.method+='; FRED 시계열 페이지의 최근 관측 표에서 수신';return q;
}
function parseEIADaily(html,now=Date.now()){
 if(typeof html!=='string'||html.length>1000000)throw Error('Invalid EIA response');
 const plain=s=>s.replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/\s+/g,' ').trim();
 const table=(html.match(/<table\b[^>]*>[\s\S]*?<\/table>/gi)||[]).find(t=>/Wholesale Spot Petroleum Prices/.test(plain(t)));
 const stamp=table&&plain(table).match(/Wholesale Spot Petroleum Prices,\s*(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})\s+Close/i);
 if(!stamp||!plain(table).includes('Crude Oil')||!plain(table).includes('$/barrel'))throw Error('EIA daily spot table changed');
 const year=stamp[3].length===2?'20'+stamp[3]:stamp[3];
 const date=year+'-'+stamp[1].padStart(2,'0')+'-'+stamp[2].padStart(2,'0');
 if(!dateOK(date)||date>new Date(now).toISOString().slice(0,10))throw Error('Invalid EIA observation date');
 const quotes=[];
 for(const row of table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)){
  const cells=[...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(m=>plain(m[1]));
  const pos=cells.findIndex(s=>s==='WTI'||s==='Brent');if(pos<0)continue;
  if(quotes.some(q=>q.code===cells[pos].toUpperCase()))throw Error('Duplicate EIA benchmark');
  const price=cells[pos+1],change=cells[pos+2];
  if(!/^\d+(?:\.\d+)?$/.test(price)||Number(price)<=0)throw Error('Invalid EIA price');
  if(!/^(?:[+-]?\d+(?:\.\d+)?|NA|N\/A)$/i.test(change||''))throw Error('Invalid EIA change');
  const code=cells[pos].toUpperCase();
  quotes.push({code,name:code==='WTI'?'WTI 현물':'Brent 현물',kind:'oil',unit:'USD/bbl',amount:1,date,value:Number(price),previous:null,previousDate:null,
   changePct:/^[+-]?\d/.test(change)?Number(change):null,changeBasis:'source-reported',seriesId:'EIA_DAILY_'+code,
   source:'EIA Daily Prices · Refinitiv',sourceUrl:EIA_DAILY,frequency:'영업일 일별 현물 종가',isSupplemental:true,status:'ok',
   method:'EIA 일일 시세의 현물 종가 및 전영업일 대비 공표 등락률. FRED 가격과 교차 계산하지 않음.'});
 }
 if(quotes.length!==2)throw Error('EIA WTI/Brent observations missing');
 return quotes;
}
function ageDays(date,now=Date.now()){return Math.floor((now-Date.parse(date+'T00:00:00Z'))/86400000);}
function oilPublicationAge(date,now=Date.now()){
 if(!dateOK(date))return Infinity;
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now));
 let days=0;for(let t=Date.parse(date)+86400000,end=Date.parse(today);t<=end;t+=86400000){const d=new Date(t).getUTCDay();if(d!==0&&d!==6)days++;}return days;
}
function finalizeQuotes(quotes,now=Date.now()){return quotes.map(q=>{const publicationDelayed=q.value!==null&&dateOK(q.date)&&(q.kind==='oil'?oilPublicationAge(q.date,now)>2:ageDays(q.date,now)>7);return {...q,publicationDelayed,status:q.status==='error'?'error':publicationDelayed?'stale':q.status==='cached'?'cached':'ok'};});}
async function retrieve(url,fetcher=fetch){const r=await fetcher(url,{signal:AbortSignal.timeout(12000),headers:{Accept:'application/json,text/xml,text/csv;q=0.9','User-Agent':'FPA/1.7 public-market-reader'}});if(!r.ok)throw Error('Upstream HTTP '+r.status);const t=await r.text();if(t.length>1000000)throw Error('Upstream response too large');return t;}
function createMarketService(fetcher=fetch){
 let cache=null,pending=null,lastAttempt=0;
 return async function getMarket(){
  const now=Date.now();
  if(pending)return pending;
  if(cache&&now-lastAttempt<15*60000)return {...cache,quotes:finalizeQuotes(cache.quotes,now),servedAt:new Date(now).toISOString()};
  lastAttempt=now;
  pending=(async()=>{
   const jobs=[['ECB',()=>retrieve(ECB,fetcher).then(parseECB)],...['DCOILBRENTEU','DCOILWTICO'].map(code=>[code,()=>retrieve('https://fred.stlouisfed.org/series/'+code,fetcher).then(t=>[parseOilHTML(t,code)])]),['EIA Daily Prices',()=>retrieve(EIA_DAILY,fetcher).then(t=>parseEIADaily(t,now))]];
   const results=await Promise.allSettled(jobs.map(j=>j[1]()));let candidates=[],warnings=[];
   results.forEach((r,i)=>{if(r.status==='fulfilled')candidates.push(...r.value.map(q=>({...q,fetchedAt:new Date(now).toISOString(),retrievalStatus:'live'})));else warnings.push(jobs[i][0]+' 조회 실패');});
   // Keep a newer last-good observation if one provider fails or regresses.
   if(cache)for(const q of cache.quotes)if(q.value!==null)candidates.push({...q,status:'cached',retrievalStatus:'cached'});
   const codes=[...CURRENCIES.map(x=>x[0]),'BRENT','WTI'];const quotes=[];
   for(const code of codes){
    const choices=candidates.filter(q=>q.code===code&&dateOK(q.date)&&q.date<=new Date(now).toISOString().slice(0,10));
    choices.sort((a,b)=>b.date.localeCompare(a.date)||(a.retrievalStatus==='live'?0:1)-(b.retrievalStatus==='live'?0:1)||(a.isSupplemental?1:0)-(b.isSupplemental?1:0));
    if(choices.length){
     const chosen={...choices[0]};
     if(chosen.retrievalStatus==='cached')chosen.status='cached';else chosen.status='ok';
     const fred=choices.find(q=>q.kind==='oil'&&!q.isSupplemental&&q.retrievalStatus==='live');
     if(chosen.isSupplemental&&fred&&fred.date<chosen.date)chosen.sourceNote='FRED 최신 관측일 '+fred.date+' · 더 최신인 EIA 일일 시세 사용';
     quotes.push(chosen);
    }else{const currency=CURRENCIES.find(x=>x[0]===code);quotes.push({code,name:currency?currency[1]:code+' 현물',amount:currency?.[2]||1,kind:currency?'fx':'oil',unit:currency?'원 / '+(currency[2]||1)+' '+code:'USD/bbl',value:null,date:null,status:'error',source:'조회 불가',sourceUrl:currency?ECB_PAGE:EIA_DAILY});}
   }
   cache={quotes:finalizeQuotes(quotes,now),warnings,fetchedAt:new Date(now).toISOString(),servedAt:new Date(now).toISOString(),frequency:'일별 참고시세 · 장중 실시간 아님'};return cache;
  })().finally(()=>{pending=null});return pending;
 };
}
module.exports={CURRENCIES,EIA_DAILY,parseECB,parseOilCSV,parseOilHTML,parseEIADaily,observation,ageDays,oilPublicationAge,finalizeQuotes,createMarketService};
