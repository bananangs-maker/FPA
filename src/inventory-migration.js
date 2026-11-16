// Undo the temporary full-sale model without reverting later prices, costs or CASEs.
const INVENTORY_RECOVERY_KEY=KEY+'-before-inventory-restore-v3';
var inventoryRestoreSnapshot='',inventoryRestoreNotice='';
function beforeFullSaleBackup(){try{return localStorage.getItem(KEY+'-before-full-sale-v1')||'';}catch{return '';}}
function downloadBeforeFullSale(){const raw=beforeFullSaleBackup();if(!raw){toast('변경 전 백업이 없습니다.');return;}download('FPA_before_full_sale.json',raw,'application/json');}
function preserveBeforeInventoryRestore(raw){inventoryRestoreSnapshot=raw;if(!localStorage.getItem(INVENTORY_RECOVERY_KEY))localStorage.setItem(INVENTORY_RECOVERY_KEY,raw);}
function beforeInventoryRestoreBackup(){try{return localStorage.getItem(INVENTORY_RECOVERY_KEY)||inventoryRestoreSnapshot;}catch{return inventoryRestoreSnapshot;}}
function downloadBeforeInventoryRestore(){const raw=beforeInventoryRestoreBackup();if(!raw){toast('복구 전 백업이 없습니다.');return;}download('FPA_before_inventory_restore.json',raw,'application/json');}
function inventoryArchive(raw){if(!raw)return null;try{const s=JSON.parse(raw);if(s?.version!==1)return null;migrateSites(s);s.version=VERSION;return validateState(s)?s:null;}catch{return null;}}
function migrateInventoryState(s,archiveRaw=''){
  const report={converted:false,products:0,sales:0,keptSales:0,missingProducts:0};
  if(!s||![1,2,VERSION].includes(s.version)||!Array.isArray(s.cases)||s.version===VERSION)return report;
  const fullSale=s.version===2,archive=fullSale?inventoryArchive(archiveRaw):null;
  report.converted=fullSale;
  for(const c of s.cases){if(!c||typeof c!=='object')continue;c.costModel='inventory';
    const prior=archive?.cases.find(x=>x.id===c.id&&x.year===c.year);
    const restoredKeys=new Set();
    if(fullSale&&Array.isArray(c.products))for(const p of c.products){if(!p||typeof p!=='object')continue;
      const old=prior?.products.find(x=>x.id===p.id);let restored=false;
      for(const field of ['openingQty','openingValue','openingDA'])if(!Object.hasOwn(p,field)){
        p[field]=old?old[field]:null;if(old){restoredKeys.add('products:'+p.id+':'+field);restored=true;}
      }
      if(restored)report.products++;else if(!old&&['openingQty','openingValue','openingDA'].every(k=>p[k]===null))report.missingProducts++;
    }
    if(fullSale&&Array.isArray(c.rows))for(const r of c.rows){if(!r||typeof r!=='object')continue;
      const old=prior?.rows.find(x=>x.id===r.id&&x.product===r.product&&x.m===r.m);
      // A changed production figure may be an intentional edit in the unified grid.
      // Keep that edit; restore separate pre-conversion sales only for unchanged rows.
      if(old&&r.production===old.production&&r.qty===r.production){r.qty=old.qty;restoredKeys.add('rows:'+r.id+':qty');report.sales++;}
      else if(old)report.keptSales++;
    }
    for(const key of restoredKeys){const setting=prior?.variableSettings?.cells?.[key];if(!setting||c.variableSettings?.cells?.[key])continue;
      if(!c.variableSettings)c.variableSettings={version:1,cells:{}};
      if(c.variableSettings.version===1&&c.variableSettings.cells&&typeof c.variableSettings.cells==='object'&&!Array.isArray(c.variableSettings.cells))c.variableSettings.cells[key]=clone(setting);
    }
  }
  s.version=VERSION;return report;
}
function recoveryNotice(r){return '재고 계산을 복구했습니다.'+(r.products?' 기초재고 '+r.products+'개 제품 복원.':'')+(r.sales?' 판매수량 '+r.sales+'개 월 복원.':'')+(r.missingProducts?' 백업이 없는 제품의 기초재고는 직접 확인해 주세요.':'')+(r.keptSales?' 변경 후 수정한 수량은 유지했습니다.':'');}
