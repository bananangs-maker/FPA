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
function paintWorkspaceMode(){
  const button=document.getElementById('demo-toggle'),label=document.getElementById('demo-mode-label');
  if(button){button.setAttribute?.('aria-checked',String(demoMode));button.title=demoMode?'가상 데이터 · 끄면 기존 작업 자료로 돌아갑니다.':'켜면 실제 기업과 무관한 가상 데이터를 별도 공간에서 엽니다.';}
  if(label)label.textContent=demoMode?'켬 · 가상 데이터':'끔';
}
function toggleDemoWorkspace(){
  if(!demoTemplateText){toast('목업 데이터를 불러올 수 없습니다. 새로고침해 주세요.');return;}
  try{
    // A failed write must never be followed by a reload that could lose edits.
    if(!saveBlocked)localStorage.setItem(workspaceStorageKey(),JSON.stringify(state));
    localStorage.setItem(WORKSPACE_MODE_KEY,demoMode?'work':'demo');
  }catch{toast('저장 공간을 확인해 주세요. JSON 백업 후 다시 전환하세요.');return;}
  location.reload();
}
