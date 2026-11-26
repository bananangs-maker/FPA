'use strict';
// Visual E2E uses FPA's public fictional demo dataset only. No connected/real company data.
const { chromium }=require('playwright'),{PDFDocument}=require('pdf-lib');
const {spawn}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const OUTPUT=path.join(__dirname,'../artifacts/browser-visual');
fs.mkdirSync(OUTPUT,{recursive:true});
const PORT=18087,ORIGIN='http://127.0.0.1:'+PORT;
const server=spawn(process.execPath,['server.cjs','--port',String(PORT)],{cwd:path.join(__dirname,'..'),env:{...process.env,PORT:String(PORT)},stdio:'pipe'});
let serviceLog='';
server.stderr.on('data',x=>serviceLog+=String(x));
async function health(){
 for(let i=0;i<45;i++){
  try{const res=await fetch(ORIGIN+'/health',{signal:AbortSignal.timeout(2000)});if(res.ok)return;}catch{}
  await new Promise(r=>setTimeout(r,300));
 }
 throw Error('Local FPA server did not start: '+serviceLog.slice(-1000));
}
(async()=>{
 let browser;
 try{
  await health();
  browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true,colorScheme:'light'});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(ORIGIN,{waitUntil:'domcontentloaded',timeout:45000});
  await page.waitForFunction(()=>document.getElementById('demo-mode-label')?.textContent.includes('켬'),{timeout:15000});
  await page.evaluate(()=>{navigate('analysis');decisionTab='report';render();decisionRunReport();});
  const report=page.locator('#executive-report');
  await report.waitFor({state:'visible',timeout:15000});
  assert.equal(await report.locator('.report-grid>section').count(),6,'Expected 6 executive sections');
  assert.ok(await report.locator('svg').count()>=1,'Monthly report chart missing');
  assert.ok(await report.locator('.report-table').count()>=2,'Financial tables missing');
  await report.screenshot({path:path.join(OUTPUT,'executive-desktop-light.png')});
  const light=await report.evaluate(el=>getComputedStyle(el).backgroundColor);
  const csvPromise=page.waitForEvent('download',{timeout:10000});
  await report.locator('.report-inline-actions button').nth(1).click();
  const csv=await csvPromise;
  assert.match(csv.suggestedFilename(),/\.csv$/i,'Quarter export must download CSV');
  const svgPromise=page.waitForEvent('download',{timeout:10000});
  await page.getByRole('button',{name:'차트 SVG 저장'}).click();
  const svg=await svgPromise;
  assert.match(svg.suggestedFilename(),/\.svg$/i,'Chart export must download SVG');
  const pdf=await page.pdf({printBackground:true,preferCSSPageSize:true});
  fs.writeFileSync(path.join(OUTPUT,'executive-a4-landscape.pdf'),pdf);
  const document=await PDFDocument.load(pdf);
  assert.equal(document.getPageCount(),1,'Executive PDF must fit one A4 landscape page');
  const {width,height}=document.getPage(0).getSize();
  assert.ok(width>height&&Math.abs(width-841.89)<7&&Math.abs(height-595.28)<7,'Executive print dimensions must be A4 landscape');
  await page.evaluate(()=>applyTheme('dark'));
  const dark=await report.evaluate(el=>getComputedStyle(el).backgroundColor);
  assert.notEqual(dark,light,'Dark theme report colors must differ');
  await report.screenshot({path:path.join(OUTPUT,'executive-desktop-dark.png')});
  await page.setViewportSize({width:390,height:844});
  await report.screenshot({path:path.join(OUTPUT,'executive-mobile-dark.png')});
  const mobile=await report.evaluate(el=>({right:el.getBoundingClientRect().right,width:innerWidth}));
  assert.ok(mobile.right<=mobile.width+5,'Report container must fit mobile viewport');
  await page.evaluate(()=>{decisionTab='goal';decisionGoalMode='multi';render();});
  assert.ok(await page.getByText('복수 변수 목표 역산',{exact:false}).count()>0,'Multi-driver Goal Seek must render');
  await page.evaluate(()=>{decisionTab='bep';decisionBepMode='cvp';render();});
  assert.ok(await page.getByText('명시적 원가행태 CVP',{exact:false}).count()>0,'Explicit CVP must render');
  assert.equal(errors.length,0,'Browser JavaScript errors: '+errors.join(' | '));
  console.log('E2E PASS: real browser chart/KPI, light/dark, mobile, per-table CSV, SVG, A4 landscape PDF exactly 1 page, multi-goal, CVP');
  console.log('PDF size points:',width,height,'pixels tested 1440 / 390');
 }catch(e){
  console.error('BROWSER E2E FAIL:',e.stack||String(e));
  process.exitCode=1;
 }finally{
  if(browser)await browser.close().catch(()=>{});
  server.kill('SIGTERM');
 }
})();
