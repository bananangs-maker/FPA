// Local deterministic retrieval. No question text or business data leaves the browser.
const qaNorm=s=>String(s).normalize('NFKC').toLowerCase().replace(/[+\-−](?=\d)/g,m=>m==='+'?'plus':'minus').replace(/(\d)\.(?=\d)/g,'$1decimal').replace(/%/g,'percent').replace(/[\s\p{P}]/gu,'');
function qaCore(s){const q=qaNorm(s);const basic=/(?:무엇인가요|뭔가요|뭐예요|뭐에요|뭐야|무슨뜻인가요|무슨뜻|이란|뜻)$/.test(q);return q.replace(/(?:알려주세요|설명해주세요|설명해줘|무엇인가요|뭔가요|뭐예요|뭐에요|뭐야|무슨뜻인가요|무슨뜻|궁금해요|어떻게되나요|인가요|하나요|되나요|있나요|나요|이란|뜻)$/,'').replace(basic?/[이가은는]$/:/$^/,'');}
const qaGrams=s=>new Set(Array.from({length:Math.max(0,s.length-2)},(_,i)=>s.slice(i,i+3)));
function qaDice(a,b){if(!a.size||!b.size)return 0;let hit=0;for(const x of a)if(b.has(x))hit++;return 2*hit/(a.size+b.size);}
const QA_INDEX=FPA_KNOWLEDGE.map((entry,index)=>{
  const keys=[entry.title,...entry.aliases].flatMap(k=>[qaNorm(k),qaCore(k)]);
  const core=qaCore(entry.title),topics=[entry.faq?.topic,...entry.faq?.topicAliases||[]].filter(Boolean).map(qaNorm);
  return {entry,index,keys:[...new Set(keys)],core,grams:qaGrams(core),topics,numbers:(core.match(/\d+(?:\.\d+)?/g)||[]).sort().join(',')};
});
function qaSearch(query,limit=5){
  const raw=qaNorm(query),q=qaCore(query);if(!q)return [];
  const grams=qaGrams(q);
  return QA_INDEX.map(x=>{
    let score=x.keys.some(k=>k===raw||k===q)?100:0,exact=score===100;
    if(!score&&!x.entry.faq)score=Math.max(0,...x.keys.map(k=>q.includes(k)&&k.length>=2?Math.min(80,k.length*5):k.includes(q)&&q.length>=2?35:0));
    if(!score&&x.entry.faq&&q.length>=2&&(x.keys.some(k=>k.includes(q))||x.topics.some(t=>t.includes(q)||q.includes(t)&&t.length>=3)))score=35;
    if(score<78&&q.length>=6){const similarity=qaDice(grams,x.grams),topic=x.topics.some(t=>t.length>=3&&q.includes(t));
      if(similarity>=.62)score=78+similarity*17;
      else if(similarity>=.4&&(topic||similarity>=.52))score=35+similarity*55;
      if(topic){const intent={case:/例|예시|예제|사례|숫자/,check:/확인|판단|조건|주의/,classify:/판관|제조|계정|분류|처리/,behavior:/고정비|변동비|원가행태/,app:/fpa|입력|반영|이중|중복/,impact:/영향|증감|변경|오르|올리|증가|감소/,units:/단위|실수|kg|원\/|퍼센트/,reconcile:/검산|대사|조정한뒤/}[x.entry.faq?.kind];if(intent?.test(String(query)))score=Math.max(score,83+similarity*10);}
    }
    // Do not substitute a stored numerical example for a different user calculation.
    if(x.entry.faq&&!exact&&(/\d/.test(raw)||(x.entry.faq.kind==='scenario'&&x.numbers)))score=Math.min(score,30);
    return {entry:x.entry,index:x.index,score,exact};
  }).filter(x=>x.score>0).sort((a,b)=>b.score-a.score||a.index-b.index).slice(0,limit);
}
function confidentFAQ(hits){const h=hits[0];return h?.entry.faq&&(h.exact||(h.score>=86&&h.score-(hits[1]?.score||0)>=3))?h:null;}
function faqMarkup(e){const f=e.faq,ref=LESSON_REFS[f.ref],related=f.linkTitle?FPA_KNOWLEDGE.findIndex(x=>x.title===f.linkTitle):-1;
  return '<article class="knowledge-card"><strong>'+esc(e.title)+'</strong><p>'+esc(e.body)+'</p>'+(e.formula?'<div class="chat-formula">'+esc(e.formula)+'</div>':'')+'<div class="chat-links">'+(related>=0?'<button type="button" onclick="showKnowledge('+related+')">개념·전체 예제</button>':'')+(ref?'<a href="'+ref[1]+'" target="_blank" rel="noopener noreferrer">'+esc(ref[0])+'</a>':'<span>FPA 입력·계산 기준</span>')+'</div>'+(f.ref==='fpa'||e.group==='사용법'?'':'<p class="knowledge-disclaimer">일반 원칙·학습 사례입니다. 적용 기준과 계약 조건에 따라 판단하며, 이 설명으로 CASE가 자동 변경되지는 않습니다.</p>')+'</article>';
}
let qaBrowser={query:'',group:'',page:0};
function qaBrowserItems(){return (qaBrowser.query.trim()?qaSearch(qaBrowser.query,1000):QA_INDEX.map(x=>({entry:x.entry,index:x.index}))).filter(x=>!qaBrowser.group||x.entry.group===qaBrowser.group);}
function openQuestionBrowser(group=''){qaBrowser={query:'',group,page:0};modal('질문·답변 1,000개','<div class="qa-filters"><label class="field">질문 검색<input id="qa-query" type="search" autocomplete="off" placeholder="예: 영업 급여, 수율, 이연법인세" oninput="qaBrowser.query=this.value;qaBrowser.page=0;renderQuestionBrowser()"></label><label class="field">분야<select id="qa-group" onchange="qaBrowser.group=this.value;qaBrowser.page=0;renderQuestionBrowser()">'+option('','전체',!group)+['회계','원가','공정','운영','환율','시장','사용법'].map(g=>option(g,g,g===group)).join('')+'</select></label></div><div id="qa-results" aria-live="polite"></div>',()=>closeModal(),'닫기',false);renderQuestionBrowser();}
function renderQuestionBrowser(){const root=document.getElementById('qa-results');if(!root)return;const items=qaBrowserItems(),size=24,pages=Math.max(1,Math.ceil(items.length/size));qaBrowser.page=Math.max(0,Math.min(qaBrowser.page,pages-1));const start=qaBrowser.page*size;root.innerHTML='<p class="hint">'+items.length+'개 · '+(qaBrowser.page+1)+' / '+pages+'쪽</p>'+(items.length?'<div class="knowledge-list qa-list">'+items.slice(start,start+size).map(({entry:e,index})=>'<button type="button" onclick="showQuestionDetail('+index+')">'+esc(e.title)+(e.faq?'<span>'+esc(e.faq.section)+'</span>':'')+'</button>').join('')+'</div>':'<p>일치하는 질문을 찾지 못했습니다. 핵심 용어나 다른 분야로 검색해 주세요.</p>')+'<div class="tools qa-pages"><button type="button" '+(qaBrowser.page===0?'disabled':'')+' onclick="qaBrowser.page--;renderQuestionBrowser()">이전</button><button type="button" '+(qaBrowser.page===pages-1?'disabled':'')+' onclick="qaBrowser.page++;renderQuestionBrowser()">다음</button></div>';}
function showQuestionDetail(index){const e=FPA_KNOWLEDGE[index];if(!e)return;document.getElementById('qa-results').innerHTML='<button class="mini-button" type="button" onclick="renderQuestionBrowser()">목록으로</button>'+knowledgeCard(e).replaceAll('onclick="showKnowledge(','onclick="showQuestionDetail(')+'<button class="mini-button" type="button" onclick="closeModal();showKnowledge('+index+')">대화에서 이어 보기</button>';}
