'use strict';
// This generator reads only the synthetic demo template and local app engine.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const path=__dirname+'/demo-data.json',data=JSON.parse(fs.readFileSync(path,'utf8'));
const base=data.cases.find(c=>c.id==='demo-base-2027');assert.ok(base?.isDemo&&base.year===2027);
const source=fs.readFileSync(__dirname+'/index.html','utf8').split('<script>')[1].split('</script>')[0],els={};
const c={document:{addEventListener(){},getElementById(id){return els[id]||(els[id]={textContent:'',innerHTML:'',style:{},addEventListener(){}});}},localStorage:{getItem(){return null;},setItem(){}},crypto:require('node:crypto').webcrypto,setTimeout(){},clearTimeout(){},console};
vm.createContext(c);vm.runInContext(source,c);const run=s=>vm.runInContext(s,c);
c.input=base;const closing=run('calculate(input).rows.filter(r=>r.m===12)');
const round=v=>Math.round(v/100)*100;
function create(year){
  const x=JSON.parse(JSON.stringify(base)),prior=year===2026,volume=prior ? .91 : 1.10,price=prior ? .965 : 1.035;
  Object.assign(x,{id:prior?'demo-actual-2026':'demo-plan-2028',year,kind:prior?'실적':'계획',scenario:'가상 케미컬 데모 · '+(prior?'연간 실적':'성장 계획'),name:prior?'ACTUAL':'PLAN',isLocked:false,isDemo:true,demoSetId:'chemical-v1',demoAnnualRelease:1});
  x.demoTemplateId=x.id;delete x.referenceId;delete x.variableSettings;delete x.lockedAt;x.adjustments=[];
  for(const product of x.products){
    const ending=closing.find(r=>r.product===product.id);
    product.openingQty=prior?0:ending.closeQty;product.openingValue=prior?0:ending.closeValue;product.openingDA=prior?0:ending.closeDA;
    let inventory=product.openingQty;
    for(const row of x.rows.filter(r=>r.product===product.id).sort((a,b)=>a.m-b.m)){
      row.qty=round(row.qty*volume);const target=prior&&row.m===12?0:round(row.qty*(.08+[0,.01,.02,0][(row.m-1)%4]));
      row.production=row.qty+target-inventory;inventory=target;
      if(row.currency==='USD'){row.usd=Number((row.usd*price).toFixed(4));row.fx=Math.round(row.fx*(prior ? .98 : 1.015));}else row.krw=Math.round(row.krw*price);
      row.yield=Number(Math.min(.999,row.yield+(prior?-.002:.002)).toFixed(4));
      row.powerUse=Number((row.powerUse*(prior?1.035:.97)).toFixed(5));
      for(const key of ['powerPrice','steamPrice','fuelPrice','waterPrice'])row[key]=Number((row[key]*(prior ? .96 : 1.025)).toFixed(2));
      row.repair=Math.round(row.repair*(prior ? .95 : 1.025));row.consumable=Math.round(row.consumable*volume);
    }
  }
  for(const row of x.bom){if(row.currency==='USD'){row.usd=Number((row.usd*(prior ? .97 : 1.02)).toFixed(4));row.fx=Math.round(row.fx*(prior ? .98 : 1.015));}else row.krw=Math.round(row.krw*(prior ? .97 : 1.02));}
  for(const row of x.labor)row.amount=Math.round(row.amount*(prior ? .96 : 1.05));
  for(const row of x.mfgPools)row.amount=Math.round(row.amount*(prior ? .97 : 1.02));
  for(const row of x.sgPools)row.amount=Math.round(row.amount*(prior ? .96 : 1.035));
  return x;
}
const years=[create(2026),create(2028)];
data.cases=data.cases.filter(c=>!years.some(x=>x.demoTemplateId===c.demoTemplateId)).concat(years);
data.demoAnnualVersion=1;data.demo.years=[2026,2027,2028];
for(const item of data.cases){c.input=item;const report=run('({valid:validateState({version:3,active:input.id,cases:[input]}),model:calculate(input)})');assert.ok(report.valid,item.id);assert.equal(report.model.warnings.length,0,item.id);const a=run('aggregate(calculate(input).rows)');console.log(item.year,item.name,'revenue',Math.round(a.revenue),'op',Math.round(a.op),'margin',(a.opMargin*100).toFixed(2));}
const prior=years[0];c.input=prior;const ends=run('calculate(input).rows.filter(r=>r.m===12)');for(const r of ends){assert.ok(Math.abs(r.closeQty)<.01);assert.ok(Math.abs(r.closeValue)<.01);}
for(const p of years[1].products){const r=closing.find(r=>r.product===p.id);assert.equal(p.openingQty,r.closeQty);assert.equal(p.openingValue,r.closeValue);assert.equal(p.openingDA,r.closeDA);}
const text=JSON.stringify(data,null,2)+'\n';assert.ok(!/재원|jaewon|\bJWA\b|\bSKMP\b|\bJS1\b|여수|화치|평택/i.test(text));fs.writeFileSync(path,text);
