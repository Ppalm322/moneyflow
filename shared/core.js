/* ============================================================
 * MoneyFlow — Shared Core
 * Data layer (localStorage, swappable for API) + business logic
 * + pure UI builders + shared chrome (toast / modals).
 * Layout-agnostic: each platform page provides containers,
 * core fills and wires them. Exposed as global `MF`.
 * ============================================================ */
(function (global) {
  "use strict";

  const STORAGE_KEY   = "daily-money-ledger-v1";   // คงเดิม — ข้อมูลเก่าของผู้ใช้
  const CUSTOMCAT_KEY = "moneyflow-custom-categories-v1";
  const COLOR_KEY     = "moneyflow-category-colors-v1";

  const palette = ["#635bff","#20b7a5","#f6a84b","#ef5b62","#16a06a","#8b5cf6","#ec4899","#3b82f6","#84cc16","#f97316","#06b6d4","#d946ef"];
  const defaultExpenseCats = ["อาหาร","เดินทาง","ที่พัก","ช้อปปิ้ง","บิล/ค่าสาธารณูปโภค","สุขภาพ","ครอบครัว","ธุรกิจ","บันเทิง","อื่น ๆ"];
  const defaultIncomeCats  = ["เงินเดือน","ขายสินค้า/บริการ","ลูกค้า","โบนัส","ดอกเบี้ย/ปันผล","คืนเงิน","อื่น ๆ"];
  const categoryIcons = {
    "อาหาร":"🍜","เดินทาง":"🚗","ที่พัก":"🏠","ช้อปปิ้ง":"🛍",
    "บิล/ค่าสาธารณูปโภค":"💡","สุขภาพ":"✚","ครอบครัว":"♥",
    "ธุรกิจ":"💼","บันเทิง":"🎬","เงินเดือน":"💰","ขายสินค้า/บริการ":"🧾",
    "ลูกค้า":"👤","โบนัส":"★","ดอกเบี้ย/ปันผล":"📈","คืนเงิน":"↩","อื่น ๆ":"•"
  };

  /* ===== DATA LAYER ===== */
  const Store = {
    enabled: true,
    _read(key, fb){ try{ const r=localStorage.getItem(key); return r?JSON.parse(r):fb; }catch{ return fb; } },
    _write(key, v){ try{ localStorage.setItem(key, JSON.stringify(v)); return true; }catch{ return false; } },
    getEntries(){ try{ const r=localStorage.getItem(STORAGE_KEY); return r?JSON.parse(r):[]; }catch{ this.enabled=false; return []; } },
    saveEntries(list){
      if(!this.enabled) return "disabled";
      try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); return "ok"; }
      catch{
        try{
          const stripped = list.map(e=>({...e, receipt:""}));
          localStorage.setItem(STORAGE_KEY, JSON.stringify(stripped));
          list.forEach((e,i)=>{ e.receipt = stripped[i].receipt; });
          return "stripped";
        }catch{ this.enabled=false; return "fail"; }
      }
    },
    getCustomCats(){ const c=this._read(CUSTOMCAT_KEY,null); return (c&&c.expense&&c.income)?c:{expense:[],income:[]}; },
    saveCustomCats(c){ this._write(CUSTOMCAT_KEY,c); },
    getColorMap(){ return this._read(COLOR_KEY,{}); },
    saveColorMap(m){ this._write(COLOR_KEY,m); }
  };

  /* ===== STATE ===== */
  let entries    = Store.getEntries();
  let customCats = Store.getCustomCats();
  let colorMap   = Store.getColorMap();
  let chartRange   = "today";
  let activeFilter = "all";
  let searchTerm   = "";

  /* ===== UTILS ===== */
  const fmt      = n => new Intl.NumberFormat("th-TH",{style:"currency",currency:"THB",minimumFractionDigits:2}).format(Number(n)||0);
  const shortFmt = n => new Intl.NumberFormat("th-TH",{maximumFractionDigits:0}).format(Number(n)||0);
  function localDateKey(d=new Date()){ const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,"0"),day=String(d.getDate()).padStart(2,"0"); return `${y}-${m}-${day}`; }
  const todayKey = () => localDateKey(new Date());
  function escapeHtml(s=""){ return String(s).replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[ch])); }
  function parseAmount(v){ const n=Number(String(v).replace(/[, ]/g,"")); return Number.isFinite(n)?n:NaN; }
  const sum = list => list.reduce((s,e)=>s+Number(e.amount||0),0);

  function catsFor(type){
    const base = type==="expense"?defaultExpenseCats:defaultIncomeCats;
    const custom = (customCats[type]||[]).filter(c=>!base.includes(c));
    const withoutOther = base.filter(c=>c!=="อื่น ๆ");
    return [...withoutOther, ...custom, "อื่น ๆ"];
  }
  function colorFor(category){
    if(colorMap[category]) return colorMap[category];
    const used = new Set(Object.values(colorMap));
    let color = palette.find(c=>!used.has(c)) || palette[Object.keys(colorMap).length % palette.length];
    colorMap[category]=color; Store.saveColorMap(colorMap); return color;
  }
  function iconFor(category,type){ return categoryIcons[category] || (type==="expense"?"↗":"↙"); }

  /* ===== COMPUTE ===== */
  function summary(){
    const today = todayKey();
    const te = entries.filter(e=>e.date===today);
    return {
      incomeToday:  sum(te.filter(e=>e.type==="income")),
      expenseToday: sum(te.filter(e=>e.type==="expense")),
      balanceAll:   sum(entries.filter(e=>e.type==="income")) - sum(entries.filter(e=>e.type==="expense")),
      todayCount:   te.length
    };
  }
  function breakdown(range=chartRange){
    const base = range==="today" ? entries.filter(e=>e.date===todayKey()) : entries;
    const grouped = {};
    base.filter(e=>e.type==="expense").forEach(e=>{ grouped[e.category]=(grouped[e.category]||0)+Number(e.amount); });
    const items = Object.entries(grouped).sort((a,b)=>b[1]-a[1]);
    return { items, total: items.reduce((s,[,v])=>s+v,0) };
  }
  function passesFilter(e){
    const today = todayKey();
    switch(activeFilter){
      case "today":   if(e.date!==today) return false; break;
      case "7d":{ const d=new Date(); d.setDate(d.getDate()-6); if(e.date<localDateKey(d)) return false; break; }
      case "month":{ const n=new Date(); const p=`${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,"0")}`; if(!String(e.date).startsWith(p)) return false; break; }
      case "income":  if(e.type!=="income")  return false; break;
      case "expense": if(e.type!=="expense") return false; break;
    }
    if(searchTerm){ const hay=`${e.note||""} ${e.category||""}`.toLowerCase(); if(!hay.includes(searchTerm)) return false; }
    return true;
  }
  function filtered(){
    return [...entries]
      .sort((a,b)=>`${b.date}T${b.time}`.localeCompare(`${a.date}T${a.time}`))
      .filter(passesFilter).slice(0,200);
  }

  /* ===== EVENTS ===== */
  const subs = new Set();
  function emit(){ subs.forEach(cb=>{ try{ cb(); }catch(e){} }); }
  function onChange(cb){ subs.add(cb); return cb; }

  /* ===== DATA OPS ===== */
  function persist(){
    const r = Store.saveEntries(entries);
    if(r==="fail"||r==="disabled") toast("เบราว์เซอร์ไม่อนุญาตให้เก็บข้อมูลถาวร","error");
    return r;
  }
  function add(entry){ colorFor(entry.category); entries.push(entry); const r=persist(); emit(); return r; }
  function update(id,patch){ const i=entries.findIndex(e=>e.id===id); if(i<0) return; colorFor(patch.category||entries[i].category); entries[i]={...entries[i],...patch,updatedAt:new Date().toISOString()}; persist(); emit(); }
  function remove(id){ entries=entries.filter(e=>e.id!==id); persist(); emit(); }
  function clearToday(){ entries=entries.filter(e=>e.date!==todayKey()); persist(); emit(); }
  function addCustomCat(type,name){
    if((catsFor(type)).includes(name)) return false;
    customCats[type]=[...(customCats[type]||[]),name]; Store.saveCustomCats(customCats); colorFor(name); return true;
  }
  function newId(){ return (global.crypto&&crypto.randomUUID)?crypto.randomUUID():Date.now()+"-"+Math.random(); }

  /* ===== IMAGE COMPRESSION ===== */
  function compressImage(file){
    return new Promise((resolve,reject)=>{
      const img=new Image(), reader=new FileReader();
      reader.onerror=reject; reader.onload=()=>{ img.src=reader.result; };
      img.onerror=reject;
      img.onload=()=>{ try{
        const max=900, scale=Math.min(1,max/Math.max(img.width,img.height));
        const c=document.createElement("canvas");
        c.width=Math.round(img.width*scale); c.height=Math.round(img.height*scale);
        c.getContext("2d").drawImage(img,0,0,c.width,c.height);
        resolve(c.toDataURL("image/jpeg",.72));
      }catch(err){ reject(err); } };
      reader.readAsDataURL(file);
    });
  }

  /* ===== EXPORT CSV ===== */
  function exportCSV(){
    if(!entries.length){ toast("ยังไม่มีข้อมูลให้ส่งออก"); return; }
    const rows=[["วันที่","เวลา","ประเภท","หมวดหมู่","รายละเอียด","จำนวนเงิน"],
      ...entries.map(e=>[e.date,e.time,e.type==="income"?"รายรับ":"รายจ่าย",e.category,e.note,e.amount])];
    const csv="﻿"+rows.map(r=>r.map(v=>`"${String(v??"").replace(/"/g,'""')}"`).join(",")).join("\n");
    const a=document.createElement("a");
    a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));
    a.download=`บัญชีรายรับรายจ่าย-${todayKey()}.csv`; a.click(); URL.revokeObjectURL(a.href);
    toast("ส่งออก CSV แล้ว","success");
  }

  /* ===== TOAST ===== */
  function toast(message,kind=""){
    const el=document.getElementById("mf-toast"); if(!el) return;
    el.className="mf-toast show"+(kind?" "+kind:"");
    el.innerHTML=(kind==="success"?"✓ ":kind==="error"?"⚠ ":"")+escapeHtml(message);
    clearTimeout(global.__mfToast); global.__mfToast=setTimeout(()=>el.classList.remove("show"),2400);
  }

  /* ===== PURE HTML BUILDERS ===== */
  function summaryCardsHTML(){
    const s=summary();
    const card=(cls,icon,badge,label,value,foot)=>`
      <article class="summary-card ${cls}">
        <div class="summary-top"><div class="summary-icon">${icon}</div><span class="summary-badge">${badge}</span></div>
        <div class="summary-label">${label}</div>
        <div class="summary-value">${value}</div>
        <div class="summary-foot"><span class="dot ${cls.split("-")[0]}-dot"></span><span>${foot}</span></div>
      </article>`;
    return card("income-card","↙","วันนี้","รายรับวันนี้",fmt(s.incomeToday),"เงินเข้าทั้งหมดของวันนี้")
         + card("expense-card","↗","วันนี้","รายจ่ายวันนี้",fmt(s.expenseToday),"ค่าใช้จ่ายรวมของวันนี้")
         + card("balance-card","฿","สะสม","ยอดคงเหลือสะสม",fmt(s.balanceAll),"รายรับลบรายจ่ายทั้งหมด")
         + card("count-card","≡","วันนี้","จำนวนรายการวันนี้",shortFmt(s.todayCount),"รายการที่บันทึกวันนี้");
  }
  function donutInner(items,total){
    if(!total) return `<circle class="track" cx="21" cy="21" r="15.915"></circle>`;
    let cum=0;
    const segs=items.map(([name,value])=>{
      const pct=value/total*100, dash=Math.max(pct-0.8,0.6);
      const s=`<circle class="seg" cx="21" cy="21" r="15.915" stroke="${colorFor(name)}" stroke-dasharray="0 100" data-dash="${dash} ${100-dash}" stroke-dashoffset="${-cum}"></circle>`;
      cum+=pct; return s;
    }).join("");
    return `<circle class="track" cx="21" cy="21" r="15.915"></circle>`+segs;
  }
  function legendInner(items,total,range){
    if(!total) return `<div class="empty-state"><div class="empty-icon">◔</div><strong>ยังไม่มีรายการค่าใช้จ่าย</strong><span>เพิ่มรายการ${range==="today"?"วันนี้":""}เพื่อดูกราฟ</span></div>`;
    return items.map(([name,value])=>{
      const pct=value/total*100;
      return `<div class="legend-row"><span class="dot" style="background:${colorFor(name)}"></span><span class="legend-name">${iconFor(name,"expense")} ${escapeHtml(name)}</span><span class="legend-value"><strong>${fmt(value)}</strong><small>${pct.toFixed(1)}%</small></span></div>`;
    }).join("");
  }
  function txListHTML(list){
    if(!list.length){
      const msg=(searchTerm||activeFilter!=="all")?"ไม่พบรายการที่ตรงกับเงื่อนไข":"ยังไม่มีรายการ ลองเพิ่มรายการแรกของคุณ";
      return `<div class="empty-transactions">${msg}</div>`;
    }
    return list.map(e=>{
      const dt=new Date(`${e.date}T00:00:00`).toLocaleDateString("th-TH",{day:"numeric",month:"short",year:"2-digit"});
      const sign=e.type==="expense"?"−":"+";
      const slip=e.receipt?`<span class="tx-slip" data-slip="${e.id}">📎 สลิป</span>`:`<span style="color:#c3c9d4">ไม่มีสลิป</span>`;
      return `<div class="tx ${e.type}">
        <div class="tx-icon">${iconFor(e.category,e.type)}</div>
        <div class="tx-main"><strong>${escapeHtml(e.note||e.category)}</strong>
          <div class="tx-sub"><span>${escapeHtml(e.category)}</span><span>·</span><span>${dt} ${escapeHtml(e.time||"")}</span><span>·</span>${slip}</div></div>
        <div class="tx-amount">${sign}${fmt(e.amount)}</div>
        <div class="tx-actions"><button class="tx-btn edit" data-edit="${e.id}" aria-label="แก้ไข">✎</button><button class="tx-btn del" data-del="${e.id}" aria-label="ลบ">🗑</button></div>
      </div>`;
    }).join("");
  }
  function addFormFieldsHTML(prefix){
    // prefix: "" for add form, "edit" for edit modal (ids differ)
    const id=s=>prefix?prefix+s.charAt(0).toUpperCase()+s.slice(1):s;
    return `
      <div class="field full">
        <label>ประเภทรายการ</label>
        <div class="type-toggle" data-toggle>
          <button type="button" class="type-btn active" data-type="expense"><span>↗</span> รายจ่าย</button>
          <button type="button" class="type-btn" data-type="income"><span>↙</span> รายรับ</button>
        </div>
      </div>
      <div class="field full amount-field">
        <label for="${id("amount")}">จำนวนเงิน</label>
        <div class="input-with-prefix"><span>฿</span><input id="${id("amount")}" type="text" inputmode="decimal" autocomplete="off" placeholder="0.00" /></div>
        <small class="field-error" id="${id("amount")}Error"></small>
      </div>
      <div class="field"><label for="${id("category")}">หมวดหมู่</label><select id="${id("category")}"></select></div>
      <div class="field"><label for="${id("note")}">รายละเอียด</label><input id="${id("note")}" type="text" autocomplete="off" placeholder="เช่น ค่าน้ำมัน" /></div>
      <div class="field full custom-cat" data-customrow hidden>
        <label for="${id("customCat")}">ชื่อหมวดหมู่ใหม่</label>
        <div class="custom-cat-row"><input id="${id("customCat")}" type="text" autocomplete="off" placeholder="พิมพ์ชื่อหมวดหมู่" maxlength="24" /><button type="button" class="ghost" data-customadd>เพิ่ม</button></div>
      </div>
      <div class="field"><label for="${id("entryDate")}">วันที่</label><input id="${id("entryDate")}" type="date" /></div>
      <div class="field"><label for="${id("entryTime")}">เวลา</label><input id="${id("entryTime")}" type="time" /></div>
      <div class="field full">
        <label for="${id("receipt")}" class="receipt-label"><span class="upload-icon">↑</span><span><strong>แนบรูปสลิป</strong><small>PNG หรือ JPG · บีบอัดอัตโนมัติ</small></span></label>
        <input id="${id("receipt")}" type="file" accept="image/*" class="receipt-input" />
        <div class="receipt-box" data-receiptbox hidden><img class="receipt-preview" data-receiptimg alt="ตัวอย่างสลิป" /><button type="button" class="receipt-remove" data-receiptremove aria-label="ลบรูป">✕</button></div>
      </div>`;
  }

  /* ===== ADD-FORM WIRING ===== */
  // container must contain a <form data-addform> ; core injects fields + wires it.
  function buildAddForm(container, opts={}){
    const form=container.querySelector("[data-addform]")||container;
    const grid=form.querySelector("[data-formgrid]")||form;
    grid.innerHTML = addFormFieldsHTML("") +
      `<div class="field full"><button class="primary" type="submit" data-submit><span>＋</span> บันทึกรายการ</button></div>`;
    let type="expense", receipt="";
    const q=s=>form.querySelector(s);
    const cat=()=>form.querySelector("#category");

    function fillCats(sel){ const list=catsFor(type); let h=list.map(c=>`<option value="${escapeHtml(c)}"${c===sel?" selected":""}>${iconFor(c,type)}  ${escapeHtml(c)}</option>`).join(""); h+=`<option value="__add__">➕  เพิ่มหมวดหมู่ใหม่…</option>`; cat().innerHTML=h; }
    function setNow(){ const n=new Date(); q("#entryDate").value=localDateKey(n); q("#entryTime").value=`${String(n.getHours()).padStart(2,"0")}:${String(n.getMinutes()).padStart(2,"0")}`; }
    function clearReceipt(){ receipt=""; q(".receipt-input").value=""; form.querySelector("[data-receiptbox]").hidden=true; form.querySelector("[data-receiptimg]").removeAttribute("src"); }
    function reset(){ form.reset(); type="expense"; form.querySelectorAll("[data-toggle] .type-btn").forEach(b=>b.classList.toggle("active",b.dataset.type==="expense")); clearReceipt(); form.querySelector("[data-customrow]").hidden=true; q("#amount").classList.remove("invalid"); q("#amountError").textContent=""; fillCats(); setNow(); }

    form.querySelectorAll("[data-toggle] .type-btn").forEach(b=>b.onclick=()=>{ type=b.dataset.type; form.querySelectorAll("[data-toggle] .type-btn").forEach(x=>x.classList.toggle("active",x===b)); fillCats(); form.querySelector("[data-customrow]").hidden=true; });
    cat().addEventListener("change",e=>{ if(e.target.value==="__add__"){ form.querySelector("[data-customrow]").hidden=false; q("#customCat").focus(); e.target.selectedIndex=0; } else form.querySelector("[data-customrow]").hidden=true; });
    form.querySelector("[data-customadd]").onclick=()=>{ const name=q("#customCat").value.trim(); if(!name) return toast("กรุณาพิมพ์ชื่อหมวดหมู่"); if(catsFor(type).includes(name)){ cat().value=name; } else { addCustomCat(type,name); fillCats(name); } form.querySelector("[data-customrow]").hidden=true; q("#customCat").value=""; toast("เพิ่มหมวดหมู่แล้ว","success"); };
    q(".receipt-input").addEventListener("change",async e=>{ const f=e.target.files[0]; if(!f) return; try{ receipt=await compressImage(f); form.querySelector("[data-receiptimg]").src=receipt; form.querySelector("[data-receiptbox]").hidden=false; }catch{ toast("อ่านรูปไม่สำเร็จ ลองรูปอื่น","error"); clearReceipt(); } });
    form.querySelector("[data-receiptremove]").onclick=clearReceipt;
    form.querySelector("[data-receiptimg]").onclick=()=>{ if(receipt) openLightbox(receipt); };

    let busy=false;
    form.addEventListener("submit",e=>{
      e.preventDefault(); if(busy) return;
      const amount=parseAmount(q("#amount").value);
      if(!amount||isNaN(amount)||amount<=0){ q("#amount").classList.add("invalid"); q("#amountError").textContent="กรุณากรอกจำนวนเงินมากกว่า 0"; q("#amount").focus(); return; }
      let category=cat().value; if(category==="__add__"||!category) category=catsFor(type)[0];
      busy=true; const btn=form.querySelector("[data-submit]"); btn.disabled=true;
      const r=add({ id:newId(), type, amount, category, note:q("#note").value.trim(), date:q("#entryDate").value||todayKey(), time:q("#entryTime").value||"00:00", receipt, createdAt:new Date().toISOString() });
      reset();
      if(r==="ok"||r==="stripped") toast(r==="stripped"?"บันทึกแล้ว (พื้นที่รูปเต็ม จึงไม่เก็บสลิป)":"บันทึกรายการเรียบร้อย","success");
      setTimeout(()=>{ busy=false; btn.disabled=false; },350);
      if(opts.onSaved) opts.onSaved();
    });

    reset();
    return { reset, focusAmount:()=>q("#amount").focus() };
  }

  /* ===== SHARED CHROME (toast + modals) ===== */
  function mountChrome(){
    if(document.getElementById("mf-toast")) return;
    const wrap=document.createElement("div");
    wrap.innerHTML=`
      <div class="mf-toast" id="mf-toast"></div>
      <div class="modal-overlay" id="mf-edit" hidden><div class="modal" role="dialog" aria-modal="true">
        <div class="modal-head"><h3>แก้ไขรายการ</h3><button class="modal-close" data-x aria-label="ปิด">✕</button></div>
        <div class="modal-body"><form id="mf-editForm" novalidate><input type="hidden" id="editId" />
          <div class="form-grid" data-editgrid></div></form></div>
        <div class="modal-foot"><button class="ghost" data-x>ยกเลิก</button><button class="primary slim" id="mf-editSave">บันทึกการแก้ไข</button></div>
      </div></div>
      <div class="modal-overlay" id="mf-confirm" hidden><div class="modal confirm" role="alertdialog" aria-modal="true">
        <div class="confirm-icon">!</div><h3 id="mf-confirmTitle">ยืนยันการลบ</h3><p id="mf-confirmText"></p>
        <div class="confirm-actions"><button class="ghost" data-x>ยกเลิก</button><button class="primary slim danger-btn" id="mf-confirmOk">ลบ</button></div>
      </div></div>
      <div class="modal-overlay" id="mf-soon" hidden><div class="modal confirm" role="dialog" aria-modal="true">
        <div class="confirm-icon soon">◔</div><h3 id="mf-soonTitle">เร็ว ๆ นี้</h3><p>ฟีเจอร์นี้กำลังพัฒนา เร็ว ๆ นี้จะเปิดให้ใช้งานครับ</p>
        <div class="confirm-actions"><button class="primary slim" data-x>เข้าใจแล้ว</button></div>
      </div></div>
      <div class="lightbox" id="mf-lightbox" hidden><button class="lightbox-close" data-x aria-label="ปิด">✕</button><img id="mf-lightboxImg" alt="รูปสลิป" /></div>`;
    while(wrap.firstElementChild) document.body.appendChild(wrap.firstElementChild);

    // edit modal fields
    const ef=document.getElementById("mf-editForm");
    ef.querySelector("[data-editgrid]").innerHTML=addFormFieldsHTML("edit");
    let editType="expense", editReceipt="";
    const eq=s=>ef.querySelector(s);
    function eFillCats(sel){ const list=catsFor(editType); eq("#editCategory").innerHTML=list.map(c=>`<option value="${escapeHtml(c)}"${c===sel?" selected":""}>${iconFor(c,editType)}  ${escapeHtml(c)}</option>`).join(""); }
    ef.querySelectorAll("[data-toggle] .type-btn").forEach(b=>b.onclick=()=>{ editType=b.dataset.type; ef.querySelectorAll("[data-toggle] .type-btn").forEach(x=>x.classList.toggle("active",x===b)); eFillCats(eq("#editCategory").value); });
    ef.querySelector("[data-customadd]").onclick=()=>{ const name=eq("#editCustomCat").value.trim(); if(!name) return; if(!catsFor(editType).includes(name)) addCustomCat(editType,name); eFillCats(name); ef.querySelector("[data-customrow]").hidden=true; eq("#editCustomCat").value=""; };
    eq("#editCategory").addEventListener("change",e=>{ if(e.target.value==="__add__"){ ef.querySelector("[data-customrow]").hidden=false; eq("#editCustomCat").focus(); e.target.selectedIndex=0; } else ef.querySelector("[data-customrow]").hidden=true; });
    ef.querySelector(".receipt-input").addEventListener("change",async e=>{ const f=e.target.files[0]; if(!f) return; try{ editReceipt=await compressImage(f); ef.querySelector("[data-receiptimg]").src=editReceipt; ef.querySelector("[data-receiptbox]").hidden=false; }catch{ toast("อ่านรูปไม่สำเร็จ","error"); } });
    ef.querySelector("[data-receiptremove]").onclick=()=>{ editReceipt=""; ef.querySelector(".receipt-input").value=""; ef.querySelector("[data-receiptbox]").hidden=true; ef.querySelector("[data-receiptimg]").removeAttribute("src"); };
    ef.querySelector("[data-receiptimg]").onclick=()=>{ if(editReceipt) openLightbox(editReceipt); };

    global.__mfOpenEdit=function(id){
      const e=entries.find(x=>x.id===id); if(!e) return;
      editType=e.type; editReceipt=e.receipt||"";
      eq("#editId").value=id;
      ef.querySelectorAll("[data-toggle] .type-btn").forEach(b=>b.classList.toggle("active",b.dataset.type===editType));
      eq("#editAmount").value=e.amount; eq("#editAmount").classList.remove("invalid"); eq("#editAmountError").textContent="";
      eFillCats(e.category); eq("#editNote").value=e.note||""; eq("#editDate").value=e.date||todayKey(); eq("#editTime").value=e.time||"00:00";
      if(editReceipt){ ef.querySelector("[data-receiptimg]").src=editReceipt; ef.querySelector("[data-receiptbox]").hidden=false; } else { ef.querySelector("[data-receiptbox]").hidden=true; ef.querySelector("[data-receiptimg]").removeAttribute("src"); }
      ef.querySelector(".receipt-input").value="";
      showModal("mf-edit");
    };
    document.getElementById("mf-editSave").onclick=()=>{
      const id=eq("#editId").value; const amount=parseAmount(eq("#editAmount").value);
      if(!amount||isNaN(amount)||amount<=0){ eq("#editAmount").classList.add("invalid"); eq("#editAmountError").textContent="กรุณากรอกจำนวนเงินมากกว่า 0"; return; }
      let category=eq("#editCategory").value; if(category==="__add__"||!category) category=catsFor(editType)[0];
      update(id,{ type:editType, amount, category, note:eq("#editNote").value.trim(), date:eq("#editDate").value||todayKey(), time:eq("#editTime").value||"00:00", receipt:editReceipt });
      closeModal("mf-edit"); toast("แก้ไขรายการแล้ว","success");
    };

    // confirm modal
    let pending=null;
    global.__mfAskDelete=function(id){ const e=entries.find(x=>x.id===id); if(!e) return; pending={mode:"one",id}; document.getElementById("mf-confirmTitle").textContent="ลบรายการนี้?"; document.getElementById("mf-confirmText").innerHTML=`${escapeHtml(e.note||e.category)} · <strong>${fmt(e.amount)}</strong><br>การลบไม่สามารถย้อนกลับได้`; document.getElementById("mf-confirmOk").textContent="ลบรายการ"; showModal("mf-confirm"); };
    global.__mfClearToday=function(){ const c=entries.filter(e=>e.date===todayKey()).length; if(!c) return toast("วันนี้ยังไม่มีรายการ"); pending={mode:"today"}; document.getElementById("mf-confirmTitle").textContent="ลบรายการวันนี้ทั้งหมด?"; document.getElementById("mf-confirmText").innerHTML=`มีทั้งหมด <strong>${c}</strong> รายการในวันนี้<br>ประวัติ/ยอดสะสมวันอื่นจะไม่ถูกลบ`; document.getElementById("mf-confirmOk").textContent="ลบทั้งหมด"; showModal("mf-confirm"); };
    document.getElementById("mf-confirmOk").onclick=()=>{ if(!pending) return; if(pending.mode==="one"){ remove(pending.id); toast("ลบรายการแล้ว","success"); } else { clearToday(); toast("ลบรายการวันนี้แล้ว","success"); } pending=null; closeModal("mf-confirm"); };

    // generic overlay close + esc
    document.querySelectorAll(".modal-overlay,#mf-lightbox").forEach(ov=>{
      ov.querySelectorAll("[data-x]").forEach(b=>b.onclick=()=>{ ov.hidden=true; document.body.style.overflow=""; });
      ov.addEventListener("click",e=>{ if(e.target===ov){ ov.hidden=true; document.body.style.overflow=""; } });
    });
    document.addEventListener("keydown",e=>{ if(e.key==="Escape"){ document.querySelectorAll(".modal-overlay,#mf-lightbox").forEach(ov=>{ if(!ov.hidden){ ov.hidden=true; document.body.style.overflow=""; } }); } });
  }

  function showModal(id){ document.getElementById(id).hidden=false; document.body.style.overflow="hidden"; }
  function closeModal(id){ document.getElementById(id).hidden=true; document.body.style.overflow=""; }
  function openLightbox(src){ document.getElementById("mf-lightboxImg").src=src; document.getElementById("mf-lightbox").hidden=false; }
  function comingSoon(title){ document.getElementById("mf-soonTitle").textContent=title||"เร็ว ๆ นี้"; showModal("mf-soon"); }

  /* ===== RENDERERS (fill provided containers) ===== */
  function renderSummary(container){ if(container) container.innerHTML=summaryCardsHTML(); }
  function renderChart(els){
    if(!els||!els.donut) return;
    const {items,total}=breakdown();
    if(els.caption) els.caption.textContent = chartRange==="today"?"ค่าใช้จ่ายวันนี้":"ค่าใช้จ่ายทั้งหมด";
    if(els.total)   els.total.textContent   = "฿"+shortFmt(total);
    els.donut.innerHTML=donutInner(items,total);
    requestAnimationFrame(()=>{ els.donut.querySelectorAll(".seg").forEach(s=>s.setAttribute("stroke-dasharray",s.dataset.dash)); });
    if(els.legend) els.legend.innerHTML=legendInner(items,total,chartRange);
  }
  function renderTransactions(container){
    if(!container) return;
    container.innerHTML=txListHTML(filtered());
    container.querySelectorAll("[data-edit]").forEach(b=>b.onclick=()=>global.__mfOpenEdit(b.dataset.edit));
    container.querySelectorAll("[data-del]").forEach(b=>b.onclick=()=>global.__mfAskDelete(b.dataset.del));
    container.querySelectorAll("[data-slip]").forEach(s=>{ const e=entries.find(x=>x.id===s.dataset.slip); if(e&&e.receipt){ s.style.cursor="zoom-in"; s.onclick=()=>openLightbox(e.receipt); } });
  }

  /* ===== AUTO DAY ROLLOVER ===== */
  function startClock(onTick){
    let last=todayKey();
    setInterval(()=>{ const now=todayKey(); if(onTick) onTick(now); if(now!==last){ last=now; } emit(); },60000);
  }

  /* ===== PUBLIC API ===== */
  global.MF = {
    // state
    get entries(){ return entries; }, get storageOK(){ return Store.enabled; },
    get range(){ return chartRange; }, get filter(){ return activeFilter; }, get search(){ return searchTerm; },
    setRange(r){ chartRange=r; emit(); }, setFilter(f){ activeFilter=f; emit(); }, setSearch(s){ searchTerm=String(s||"").trim().toLowerCase(); emit(); },
    // utils
    fmt, shortFmt, localDateKey, todayKey, escapeHtml, iconFor, colorFor, catsFor,
    // data ops
    add, update, remove, clearToday, addCustomCat, exportCSV, compressImage,
    // compute
    summary, breakdown, filtered,
    // events
    onChange, emit,
    // chrome + ui
    mountChrome, comingSoon, toast, openLightbox, openEdit:id=>global.__mfOpenEdit(id), askDelete:id=>global.__mfAskDelete(id),
    // builders / renderers
    summaryCardsHTML, txListHTML, buildAddForm, renderSummary, renderChart, renderTransactions,
    // misc
    startClock
  };

  // seed stable colors for existing expense categories
  entries.forEach(e=>{ if(e.type==="expense") colorFor(e.category); });

})(window);
