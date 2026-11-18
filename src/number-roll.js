// Hover-only presentation. The original number remains the sole DOM text,
// so selection, screen readers and CSV exports retain the exact result.
const numberRollFinishes=new Set();
function clearNumberRolls(){for(const finish of [...numberRollFinishes])finish();}
function startNumberRoll(target){
  if(target.classList.contains('is-rolling')||window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)return;
  if(window.getSelection?.()?.toString())return;
  const value=target.querySelector('.number-roll-source')?.textContent;
  if(!value)return;
  const overlay=document.createElement('span');overlay.className='number-roll-overlay';overlay.setAttribute('aria-hidden','true');
  let digitIndex=0,longest=0;
  for(const character of value){
    const reel=document.createElement('span');
    if(/[0-9]/.test(character)){
      const turns=20,duration=560+Math.min(digitIndex++*32,224),digit=Number(character);
      reel.className='number-roll-reel';reel.dataset.strip=Array.from({length:turns+1},(_,i)=>String((digit+i)%10)).join('\n');
      reel.style.setProperty('--roll-distance',`-${turns}em`);reel.style.setProperty('--roll-duration',duration+'ms');longest=Math.max(longest,duration);
    }else{reel.className='number-roll-mark';reel.dataset.character=character;}
    overlay.append(reel);
  }
  target.append(overlay);target.classList.add('is-rolling');
  let timer;
  const finish=()=>{clearTimeout(timer);overlay.remove();target.classList.remove('is-rolling');numberRollFinishes.delete(finish);target._finishNumberRoll=null;};
  target._finishNumberRoll=finish;numberRollFinishes.add(finish);timer=setTimeout(finish,longest+40);
}
function initNumberRoll(){
  if(typeof window==='undefined'||!document.createElement)return;
  clearNumberRolls();
  const root=document.getElementById('content');
  if(!root||currentGroup().id!=='profit')return;
  for(const element of root.querySelectorAll('.card-value, .trend strong, .bridge-row strong, tbody td')){
    if(element.querySelector('input,select,button,a,.number-roll'))continue;
    for(const node of [...element.childNodes]){
      if(node.nodeType!==3||!/^[-+−]?\d[\d,]*(?:\.\d+)?(?:%p?)?$/.test(node.textContent.trim()))continue;
      const target=document.createElement('span'),source=document.createElement('span');
      target.className='number-roll';source.className='number-roll-source';source.textContent=node.textContent;
      target.append(source);node.replaceWith(target);
    }
  }
  if(root.dataset.numberRollBound)return;
  root.dataset.numberRollBound='true';
  root.addEventListener('pointerover',event=>{
    const target=event.target.closest?.('.number-roll');
    if(!target||!root.contains(target)||target.contains(event.relatedTarget)||event.pointerType==='touch')return;
    startNumberRoll(target);
  });
  root.addEventListener('pointerout',event=>{
    const target=event.target.closest?.('.number-roll');
    if(target&&!target.contains(event.relatedTarget))target._finishNumberRoll?.();
  });
  root.addEventListener('pointerdown',()=>clearNumberRolls());
  document.addEventListener('visibilitychange',()=>{if(document.hidden)clearNumberRolls();});
}
