// Quality 1.18: local-only checkpoints and guarded restore. No external requests.
// The canonical workspace JSON remains format VERSION=3, unchanged.
const QUALITY_HISTORY_SUFFIX='-quality-history-v1';
const QUALITY_RESTORE_SUFFIX='-before-replacement-v1';
const QUALITY_INTERVAL_MS=20*60*1000;
const QUALITY_HISTORY_MAX_ENTRIES=5;
const QUALITY_HISTORY_BUDGET=1500000; // UTF-16 string units; conservative per-workspace localStorage budget.
const qualityPersisted=new Map();
function qualityHistoryKey(key=workspaceStorageKey()){return key+QUALITY_HISTORY_SUFFIX;}
function qualityRestorationKey(key=workspaceStorageKey()){return key+QUALITY_RESTORE_SUFFIX;}
function qualityInitPersistence(){
 try{const key=workspaceStorageKey();qualityPersisted.set(key,localStorage.getItem(key));}
 catch{/* Existing loader will block saving if local storage is inaccessible. */}
}
qualityInitPersistence();
function qualityReadHistory(key=workspaceStorageKey()){
 try{
  const raw=localStorage.getItem(qualityHistoryKey(key));
  if(!raw)return [];
  const v=JSON.parse(raw);
  return Array.isArray(v)?v.filter(x=>x&&typeof x.id==='string'&&typeof x.raw==='string'&&typeof x.at==='string').slice(-QUALITY_HISTORY_MAX_ENTRIES):[];
 }catch{return [];}
}
function qualityCheckConflict(){
 const key=workspaceStorageKey();
 if(!qualityPersisted.has(key))qualityPersisted.set(key,localStorage.getItem(key));
 const expected=qualityPersisted.get(key),current=localStorage.getItem(key);
 if(current!==expected)throw Error('다른 탭 또는 창에서 데이터가 변경됐습니다. 현재 데이터는 덮어쓰지 않았습니다. JSON 백업을 다운로드한 뒤 새로고침해서 비교하세요.');
}
function qualityAfterSave(raw){
 const key=workspaceStorageKey();
 qualityPersisted.set(key,raw);
 try{
  const h=qualityReadHistory(key);
  if(!h.length||Date.now()-new Date(h[h.length-1].at).getTime()>=QUALITY_INTERVAL_MS){
   // History failures must never invalidate a successful canonical save.
   qualityCaptureSnapshot('자동 시점 저장','',raw,false);
  }
 }catch{}
}
function qualityTimestamp(){return new Date().toISOString();}
function qualityFinanceSummary(s){
 const c=s.cases.find(x=>x.id===s.active)||s.cases[0];
 if(!c)return null;
 const a=aggregate(calculate(c).rows);
 return {caseId:c.id,label:c.year+' · '+c.scenario+' / '+c.name,year:c.year,revision:s.updated||'',revenue:a.revenue,cogs:a.cogs,op:a.op,ebitda:a.ebitda,qty:a.qty};
}
function qualityCaptureSnapshot(reason='수동 버전 저장',source='',raw=null,notify=true){
 const key=workspaceStorageKey();
 if(raw===null){if(saveBlocked)throw Error('자동 저장이 중단된 상태에서는 새 버전을 확정할 수 없습니다. 먼저 JSON 백업을 내보내세요.');qualityCheckConflict();raw=JSON.stringify(state);const persisted=localStorage.getItem(key);if(persisted&&persisted!==raw)throw Error('아직 정상 저장되지 않은 입력이 있습니다. 브라우저 저장 상태를 확인한 뒤 버전을 생성하세요.');}
 if(typeof raw!=='string'||!raw.length)throw Error('버전으로 저장할 입력 데이터가 없습니다.');
 if(raw.length>QUALITY_HISTORY_BUDGET)throw Error('입력 데이터가 브라우저 이력 용량 한도를 초과했습니다. 전체 JSON 백업을 파일로 저장해 주세요.');
 const data=JSON.parse(raw);
 if(!validateState(data))throw Error('입력 구조가 유효하지 않아 버전을 생성할 수 없습니다.');
 const existing=qualityReadHistory(key);
 if(existing.length&&existing[existing.length-1].raw===raw){if(notify)toast('현재 데이터는 마지막 저장 버전과 동일합니다.');return false;}
 const entry={id:'q'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7),at:qualityTimestamp(),reason:String(reason).slice(0,80),source:String(source).trim().slice(0,160),raw,finance:qualityFinanceSummary(data)};
 const next=[...existing,entry];
 while(next.length>QUALITY_HISTORY_MAX_ENTRIES||JSON.stringify(next).length>QUALITY_HISTORY_BUDGET)next.shift();
 if(!next.length)throw Error('브라우저에 버전을 저장할 공간이 없습니다. 전체 JSON 백업을 파일로 보관하세요.');
 try{localStorage.setItem(qualityHistoryKey(key),JSON.stringify(next));}
 catch(e){
  // Shrink old history before failing. Never mutate the canonical workspace.
  while(next.length>1){next.shift();try{localStorage.setItem(qualityHistoryKey(key),JSON.stringify(next));if(notify)toast('용량을 확보하기 위해 오래된 이력 일부를 정리했습니다.');return true;}catch{}}
  throw Error('브라우저 저장 공간이 부족합니다. 전체 JSON 백업을 다운로드하세요.');
 }
 if(notify)toast('로컬 버전을 저장했습니다. · '+entry.reason);
 return true;
}
function qualitySafeBeforeReplacement(){
 // A single recoverable, uncompressed, exact copy of the previous persisted workspace.
 qualityCheckConflict();
 const key=workspaceStorageKey(),original=localStorage.getItem(key);
 if(!original)return true;
 try{
  localStorage.setItem(qualityRestorationKey(key),original);
  return true;
 }catch{
  throw Error('기존 데이터를 교체하기 전에 복구 사본을 저장하지 못했습니다. 용량을 확보하거나 전체 JSON 백업을 내보낸 뒤 다시 시도하세요.');
 }
}
function qualityValueEqual(a,b){return a===b||(a===null&&b===undefined)||(a===undefined&&b===null);}
function qualityChangeRows(before,after,limit=15){
 const oldById=new Map(before.cases.map(c=>[c.id,c])),newById=new Map(after.cases.map(c=>[c.id,c]));
 const tableKeys={rows:x=>x.product+':'+x.m,bom:x=>x.id,products:x=>x.id,sites:x=>x.id,labor:x=>x.id,mfgPools:x=>x.id,sgPools:x=>x.id};
 let count=0;const details=[];
 const add=(label,field,a,b)=>{
  count++;
  if(details.length<limit)details.push({label,field,before:a,after:b});
 };
 for(const id of new Set([...oldById.keys(),...newById.keys()])){
  const a=oldById.get(id),b=newById.get(id);
  if(!a||!b){add((a||b)?.name||id,'CASE',a?'있음':'없음',b?'있음':'없음');continue;}
  const fields=['scenario','name','year','kind','referenceId','isLocked','forecast'];
  for(const f of fields)if(JSON.stringify(a[f])!==JSON.stringify(b[f]))add(a.name,f,a[f],b[f]);
  for(const [name,toKey] of Object.entries(tableKeys)){
   const left=new Map((a[name]||[]).map(x=>[toKey(x),x]));
   const right=new Map((b[name]||[]).map(x=>[toKey(x),x]));
   for(const rowKey of new Set([...left.keys(),...right.keys()])){
    const old=left.get(rowKey),now=right.get(rowKey);
    const label=a.name+' · '+name+' · '+rowKey;
    if(!old||!now){add(label,'행',old?'있음':'없음',now?'있음':'없음');continue;}
    for(const field of new Set([...Object.keys(old),...Object.keys(now)])){
     if(field==='id')continue;
     if(!qualityValueEqual(old[field],now[field]))add(label,field,old[field],now[field]);
    }
   }
  }
 }
 return {count,details};
}
function qualityCompareVersion(id){
 const entry=qualityReadHistory().find(v=>v.id===id);
 if(!entry)throw Error('선택한 이력이 없습니다.');
 const before=JSON.parse(entry.raw);
 if(!validateState(before))throw Error('이력에 저장된 데이터 형식이 잘못됐습니다.');
 const diff=qualityChangeRows(before,state);
 const old=entry.finance?.caseId?before.cases.find(c=>c.id===entry.finance.caseId):null;
 const current=old?state.cases.find(c=>c.id===old.id):null;
 const oldFin=old?aggregate(calculate(old).rows):null,newFin=current?aggregate(calculate(current).rows):null;
 const metrics=[['매출액','revenue'],['매출원가','cogs'],['영업이익','op'],['EBITDA','ebitda']];
 return {entry,diff,comparison:oldFin&&newFin?metrics.map(([label,key])=>({label,old:oldFin[key],now:newFin[key],delta:newFin[key]-oldFin[key]})):[],caseChanged:!current};
}
function qualityDisplayValue(v){
 if(v===undefined)return '미입력';
 if(v===null)return '미입력';
 if(typeof v==='object')return JSON.stringify(v).slice(0,160);
 return String(v).slice(0,160);
}
function qualityHistoryDialog(){
 const items=qualityReadHistory().slice().reverse();
 const raw=(()=>{try{return localStorage.getItem(qualityRestorationKey())}catch{return null}})();
 const backupText=raw?'<p class="quality-note">전체 데이터 교체 전 복구본이 있습니다. <button type="button" onclick="qualityDownloadProtected()">복구본 JSON 저장</button></p>':'';
 const rows=items.length?'<div class="quality-scroll"><table class="quality-table"><thead><tr><th>버전 시각</th><th>구분·출처</th><th>기준 CASE</th><th>관리</th></tr></thead><tbody>'+
  items.map(v=>'<tr><td>'+esc(new Date(v.at).toLocaleString('ko-KR'))+'</td><td>'+esc(v.reason)+(v.source?'<small> · '+esc(v.source)+'</small>':'')+'</td><td>'+esc(v.finance?.label||'자료 없음')+'</td><td><button type="button" onclick="qualityShowComparison('+JSON.stringify(v.id)+')">비교</button><button type="button" onclick="qualityRestorePrompt('+JSON.stringify(v.id)+')">복원</button><button type="button" onclick="qualityDownloadVersion('+JSON.stringify(v.id)+')">JSON</button></td></tr>').join('')+'</tbody></table></div>':'<p class="hint">저장된 버전이 없습니다. 아래 입력으로 첫 체크포인트를 만드세요.</p>';
 const body='<p class="hint">이력과 복구 사본은 이 브라우저의 현재 작업 공간에만 저장됩니다. 자동 시점 저장은 20분 간격이며, 모든 셀 변경을 개별 기록하는 감사 로그는 아닙니다. 장기 보관에는 JSON 파일 백업을 사용하세요.</p>'+
  '<div class="quality-fields">'+field('note','버전 설명 (선택)','', 'text','maxlength="80"')+field('source','수치·가정 출처 (선택)','', 'text','maxlength="160"')+'</div>'+
  '<div class="quality-tools"><button type="button" onclick="qualityManualCheckpoint()">현재 상태 버전 저장</button><button type="button" onclick="downloadBackup()">전체 JSON 백업</button></div>'+backupText+rows;
 modal('데이터 버전 · 변경 이력',body,()=>closeModal(),'닫기',false);
}
function qualityManualCheckpoint(){
 try{
  const note=document.querySelector('#dialog-form [name="note"]')?.value?.trim()||'수동 저장';
  const source=document.querySelector('#dialog-form [name="source"]')?.value?.trim()||'';
  qualityCaptureSnapshot(note,source);
  closeModal();qualityHistoryDialog();
 }catch(e){toast(e.message);}
}
function qualityShowComparison(id){
 try{
  const {entry,diff,comparison,caseChanged}=qualityCompareVersion(id);
  const summary=caseChanged?'<p class="hint">버전의 기준 CASE가 현재 작업 데이터에 존재하지 않아 손익 비교를 건너뜁니다.</p>':comparison.length?safeTable(['재무 지표','이전 (원)','현재 (원)','차이 (원)'],comparison.map(x=>[x.label,fmt(x.old,2),fmt(x.now,2),fmt(x.delta,2)])):'';
  const changes='<p>변경 필드 '+diff.count+'개'+(diff.count>diff.details.length?' · 처음 '+diff.details.length+'개 표시':'')+'</p>'+
  (diff.details.length?safeTable(['입력 위치','항목','변경 전','변경 후'],diff.details.map(x=>[x.label,x.field,qualityDisplayValue(x.before),qualityDisplayValue(x.after)])):'<p class="hint">입력값 차이가 없습니다.</p>');
  modal('버전 비교 · '+new Date(entry.at).toLocaleString('ko-KR'),'<p class="hint">선택한 버전과 현재 입력을 비교합니다. 버전의 기준 CASE가 남아 있는 경우 해당 CASE의 손익을 재계산합니다.</p>'+summary+changes,()=>{closeModal();qualityHistoryDialog();},'이력으로 돌아가기',false);
 }catch(e){toast(e.message);}
}
function qualityRestorePrompt(id){
 const entry=qualityReadHistory().find(v=>v.id===id);
 if(!entry){toast('복원할 버전을 찾을 수 없습니다.');return;}
 const label=new Date(entry.at).toLocaleString('ko-KR');
 modal('버전 복원 · 원본 보존','<p><strong>'+esc(label)+'</strong> 버전으로 현재 작업 공간 전체를 복원합니다.</p><p>복원 직전 상태는 별도 안전 사본으로 저장합니다. CASE·계획·마감 정보 모두 선택한 시점으로 되돌아갑니다.</p><p class="hint">주의: 이 브라우저의 다른 탭에서 동일 데이터를 수정 중이라면 닫고 진행하세요.</p>',()=>{
  try{qualityRestoreVersion(id);closeModal();render();toast('선택한 버전으로 복원했습니다.');}
  catch(e){toast(e.message);}
 },'현재 전체 데이터를 복원');
}
function qualityRestoreVersion(id){
 const entry=qualityReadHistory().find(x=>x.id===id);
 if(!entry)throw Error('복원할 버전이 없습니다.');
 const restored=JSON.parse(entry.raw);
 if(!validateState(restored))throw Error('복원 버전의 데이터 구조가 유효하지 않습니다.');
 if(saveBlocked)throw Error('현재 데이터 복구 차단 상태를 먼저 해결해야 합니다.');
 qualitySafeBeforeReplacement();
 const key=workspaceStorageKey(),oldState=state;
 try{
  // Atomic canonical write first, state switch second. No partial in-memory restore.
  const serialized=JSON.stringify({...restored,updated:qualityTimestamp()});
  localStorage.setItem(key,serialized);
  state=JSON.parse(serialized);
  qualityPersisted.set(key,serialized);
  cache=null;editHistory=[];
  if(!state.cases.some(c=>c.id===state.active))state.active=state.cases[0].id;
  siteFilter='';productFilter='';compareId='';
  document.getElementById('save-status').textContent='복원 저장됨';
 }catch(e){state=oldState;throw Error('복원 저장에 실패했습니다: '+e.message);}
}
function qualityDownloadVersion(id){
 const entry=qualityReadHistory().find(x=>x.id===id);
 if(!entry){toast('버전이 없습니다.');return;}
 download('FPA_version_'+entry.at.slice(0,10)+'_'+id+'.json',entry.raw,'application/json');
}
function qualityDownloadProtected(){
 const raw=localStorage.getItem(qualityRestorationKey());
 if(!raw){toast('복구본이 없습니다.');return;}
 download('FPA_before_replacement.json',raw,'application/json');
}
