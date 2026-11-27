// Separate workspaces: demo edits never write to the user's working dataset.
const DEMO_STORAGE_KEY=KEY+'-chemical-demo-v1',WORKSPACE_MODE_KEY=KEY+'-workspace-mode';
let demoMode=false,workspaceEmbedded=document.getElementById('embedded-data')?.textContent||'';
const demoTemplateText=document.getElementById('demo-template')?.textContent||'';
try{
  const preference=localStorage.getItem(WORKSPACE_MODE_KEY),workRaw=localStorage.getItem(KEY);
  const embeddedIsDemo=workspaceEmbedded&&JSON.parse(workspaceEmbedded)?.cases?.every(c=>c.isDemo===true);
  demoMode=!!demoTemplateText&&(preference==='demo'||(preference!=='work'&&!workRaw&&(!workspaceEmbedded||embeddedIsDemo)));
  if(demoMode)workspaceEmbedded=embeddedIsDemo?workspaceEmbedded:demoTemplateText;
}catch{/* The normal loader preserves unreadable storage and blocks autosave. */}
function workspaceStorageKey(){return demoMode?DEMO_STORAGE_KEY:KEY;}
function upgradeDemoYears(){
  if(!demoMode||saveBlocked||state.demoAnnualVersion>=1||!state.cases.some(c=>c.isDemo&&c.demoSetId==='chemical-v1'))return false;
  try{
    const template=JSON.parse(demoTemplateText),next=clone(state),additions=template.cases.filter(c=>c.demoAnnualRelease===1&&!next.cases.some(x=>x.demoSetId===c.demoSetId&&x.demoTemplateId===c.demoTemplateId));
    if(next.cases.length+additions.length>100)return false;
    for(const item of additions){const c=clone(item);if(next.cases.some(x=>x.id===c.id))c.id=uid();next.cases.push(c);}
    next.demoAnnualVersion=1;
    if(!validateState(next))return false;
    // One atomic write: older demo edits and the real workspace remain intact.
    qualityCheckConflict();const serialized=JSON.stringify(next);localStorage.setItem(DEMO_STORAGE_KEY,serialized);state=next;qualityAfterSave(serialized);return true;
  }catch{return false;}
}
function paintWorkspaceMode(){
  const button=document.getElementById('demo-toggle'),label=document.getElementById('demo-mode-label');
  if(button){button.setAttribute?.('aria-checked',String(demoMode));button.title=demoMode?'가상 데이터 · 끄면 기존 작업 자료로 돌아갑니다.':'켜면 실제 기업과 무관한 가상 데이터를 별도 공간에서 엽니다.';}
  if(label)label.textContent=demoMode?'켬 · 가상 데이터':'끔';
}
function toggleDemoWorkspace(){
  if(!demoTemplateText){toast('목업 데이터를 불러올 수 없습니다. 새로고침해 주세요.');return;}
  try{
    // A failed write must never be followed by a reload that could lose edits.
    if(!saveBlocked){qualityCheckConflict();const current=localStorage.getItem(workspaceStorageKey());if(current!==JSON.stringify(state)&&!save())throw Error('작업 데이터 저장이 차단되어 작업 공간을 전환하지 않았습니다.');}
    localStorage.setItem(WORKSPACE_MODE_KEY,demoMode?'work':'demo');
  }catch{toast('저장 공간을 확인해 주세요. JSON 백업 후 다시 전환하세요.');return;}
  location.reload();
}
