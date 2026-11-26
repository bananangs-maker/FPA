'use strict';
// Public, read-only smoke check: no finance data or credentials sent.
const origin='https://fpa-studio.onrender.com';
const required=[
 ['경영 분석 UI','경영 분석 스튜디오'],
 ['손익 증감 분석','function buildProfitBridge('],
 ['BEP 엔진','function buildBreakEven('],
 ['월별 이상치 탐지','function decisionAnomalyCandidates('],
 ['단일 민감도','function buildSingleSensitivity('],
 ['토네이도 분석','function buildTornadoSensitivity('],
 ['복수 CASE 비교','function buildScenarioComparison('],
 ['역산 기능','function buildGoalSeek('],
 ['원본 보호 CASE 생성','function goalSeekDraftCase('],
 ['경영진 보고','function buildExecutiveReport('],
 ['A4 보고 구성','function executiveReportMarkup('],
 ['분석형 챗봇','function decisionChatAnswer('],
 ['연속 대화 문맥','function decisionChatSetScenario('],
 ['코발트 UI','decision-studio'],
 ['원가 계산 유지','function calculate(']
];
const attempts=20,interval=15000;
async function check(){
 const health=await fetch(origin+'/health',{headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(30000)});
 if(!health.ok)throw Error('health HTTP '+health.status);
 const healthData=await health.json();
 if(healthData.status!=='ok')throw Error('health status is not ok');
 const page=await fetch(origin+'/?live-check='+Date.now(),{headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(30000)});
 if(!page.ok)throw Error('page HTTP '+page.status);
 const text=await page.text();
 if(!text.includes('<html lang="ko"'))throw Error('Korean app HTML missing');
 const missing=required.filter(([,token])=>!text.includes(token)).map(([label])=>label);
 if(missing.length)throw Error('latest build not yet live: '+missing.join(', '));
 console.log('LIVE PASS: health ok, full HTML contains Decision Studio + BEP + bridge + anomaly + accounting');
 console.log('LIVE PAGE LENGTH:',text.length);
}
(async()=>{
 for(let i=1;i<=attempts;i++){
  try{await check();return;}
  catch(e){console.log('Check '+i+'/'+attempts+': '+e.message);if(i!==attempts)await new Promise(resolve=>setTimeout(resolve,interval));}
 }
 process.exitCode=1;
 console.error('LIVE FAIL: expected Phase 2 implementation not verifiable at '+origin);
})();
