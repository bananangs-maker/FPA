'use strict';
// Every record is a question with its own answer. Aliases never count as records.
module.exports=function expandKnowledge(base,read){
  const particle=(s,a,b)=>{const n=s.charCodeAt(s.length-1)-0xac00;return n>=0&&n<=11171&&n%28?a:b;};
  const extra=[],norm=s=>s.normalize('NFKC').toLowerCase().replace(/[\s\p{P}]/gu,'');
  const rows=(file,width)=>read('src/'+file).trim().split(/\r?\n/).map((line,i)=>{const cells=line.split('|');if(cells.length!==width||cells.some(x=>!x.trim()))throw Error(file+':'+(i+1)+' invalid columns');return cells;});
  function add(title,body,{topic,section,kind,ref,aliases=[],formula='',group='회계',view='help',linkTitle=''}={}){extra.push({title,aliases:[],body,formula,view,group,faq:{topic,section,kind,ref,topicAliases:aliases,linkTitle}});}
  for(const e of base.filter(x=>x.lesson)){
    const {section,example,check,ref}=e.lesson,meta={topic:e.title,section,ref,group:e.group,aliases:e.aliases,linkTitle:e.title};
    add(e.title+'의 사례를 들어 설명해 주세요',example,{...meta,kind:'case',formula:e.formula});
    add(e.title+particle(e.title,'을','를')+' 판단할 때 무엇을 확인해야 하나요?',check,{...meta,kind:'check'});
  }
  for(const [topic,aliases,ref,classify,behavior,app] of rows('expense-faq.tsv',6)){
    const m={topic,section:'비용 분류 · '+topic,ref,aliases:aliases.split(',')};
    add(topic+'의 비용 분류는 어떻게 판단하나요?',classify,{...m,kind:'classify'});
    add(topic+particle(topic,'은','는')+' 고정비인가요 변동비인가요?',behavior,{...m,kind:'behavior',group:'원가'});
    add(topic+particle(topic,'을','를')+' FPA에 반영할 때 주의할 점은 무엇인가요?',app,{...m,kind:'app',group:'사용법'});
  }
  for(const [topic,aliases,field,impact,units,reconcile] of rows('driver-faq.tsv',6)){
    const m={topic,section:'FPA 입력 · '+topic,ref:'fpa',group:'사용법',aliases:aliases.split(',')};
    add(topic+' 변경은 손익에 어떤 영향을 주나요?',impact,{...m,kind:'impact'});
    add(topic+' 입력 단위와 실수하기 쉬운 점은 무엇인가요?',units,{...m,kind:'units'});
    add(topic+'를 조정한 뒤 무엇을 검산해야 하나요?',reconcile,{...m,kind:'reconcile'});
  }
  for(const file of ['financial-faq.tsv','managerial-faq.tsv'])for(const [section,topic,ref,...pairs] of rows(file,11)){
    for(let i=0;i<pairs.length;i+=2)add(pairs[i],pairs[i+1],{topic,section,ref,kind:'scenario',group:file.startsWith('financial')?'회계':'원가'});
  }
  const all=[...base,...extra],titles=new Set(),answers=new Set();
  for(const e of all){const key=norm(e.title);if(!key||titles.has(key))throw Error('Duplicate question: '+e.title);titles.add(key);if(e.faq){const answer=norm(e.body);if(answer.length<18||answers.has(answer))throw Error('Empty/duplicate FAQ answer: '+e.title);answers.add(answer);}}
  if(base.length!==344||extra.length!==656||all.length!==1000)throw Error('Unexpected Q&A coverage: '+base.length+' + '+extra.length);
  return all;
};
