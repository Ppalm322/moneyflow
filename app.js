(() => {
  "use strict";
  /* MoneyFlow — บัญชีรายรับรายจ่าย (เว็บ, Tailwind UI) */

  const STORAGE_KEY   = "daily-money-ledger-v1";
  const CUSTOMCAT_KEY = "moneyflow-custom-categories-v1";
  const COLOR_KEY     = "moneyflow-category-colors-v1";

  const palette = ["#635bff","#20b7a5","#f6a84b","#ef5b62","#16a06a","#8b5cf6","#ec4899","#3b82f6","#84cc16","#f97316","#06b6d4","#d946ef"];
  const defaultExpenseCats = ["อาหาร","เดินทาง","ที่พัก","ช้อปปิ้ง","บิล/ค่าสาธารณูปโภค","สุขภาพ","ครอบครัว","ธุรกิจ","บันเทิง","อื่น ๆ"];
  const defaultIncomeCats  = ["เงินเดือน","ขายสินค้า/บริการ","ลูกค้า","โบนัส","ดอกเบี้ย/ปันผล","คืนเงิน","อื่น ๆ"];
  const categoryIcons = {"อาหาร":"🍜","เดินทาง":"🚗","ที่พัก":"🏠","ช้อปปิ้ง":"🛍","บิล/ค่าสาธารณูปโภค":"💡","สุขภาพ":"✚","ครอบครัว":"♥","ธุรกิจ":"💼","บันเทิง":"🎬","เงินเดือน":"💰","ขายสินค้า/บริการ":"🧾","ลูกค้า":"👤","โบนัส":"★","ดอกเบี้ย/ปันผล":"📈","คืนเงิน":"↩","อื่น ๆ":"•"};

  /* ===== DATA LAYER ===== */
  const Store = {
    enabled: true,
    _read(k,fb){ try{ const r=localStorage.getItem(k); return r?JSON.parse(r):fb; }catch{ return fb; } },
    _write(k,v){ try{ localStorage.setItem(k,JSON.stringify(v)); return true; }catch{ return false; } },
    getEntries(){ try{ const r=localStorage.getItem(STORAGE_KEY); return r?JSON.parse(r):[]; }catch{ this.enabled=false; return []; } },
    saveEntries(list){
      if(!this.enabled) return "disabled";
      try{ localStorage.setItem(STORAGE_KEY,JSON.stringify(list)); return "ok"; }
      catch{ try{ const s=list.map(e=>({...e,receipt:""})); localStorage.setItem(STORAGE_KEY,JSON.stringify(s)); list.forEach((e,i)=>e.receipt=s[i].receipt); return "stripped"; }catch{ this.enabled=false; return "fail"; } }
    },
    getCustomCats(){ const c=this._read(CUSTOMCAT_KEY,null); return (c&&c.expense&&c.income)?c:{expense:[],income:[]}; },
    saveCustomCats(c){ this._write(CUSTOMCAT_KEY,c); },
    getColorMap(){ return this._read(COLOR_KEY,{}); },
    saveColorMap(m){ this._write(COLOR_KEY,m); }
  };

  /* ===== STATE ===== */
  let entries=Store.getEntries(), customCats=Store.getCustomCats(), colorMap=Store.getColorMap();
  let selectedType="expense", chartRange="today", activeFilter="all", searchTerm="";
  let formReceipt="", editReceipt="", editType="expense", isSubmitting=false;

  /* ===== LINE LOGIN (LIFF) + ผู้ใช้ ===== */
  const LIFF_ID = "";   // ⬅️ ใส่ LIFF ID จาก LINE Developers Console (LINE Login → LIFF) แล้ว login จะใช้งานได้
  const USERNAME_KEY = "moneyflow-user-name";
  let lineUser = null;  // { name, id, picture } เมื่อ login ผ่าน LINE สำเร็จ

  const $=id=>document.getElementById(id);
  const fmt=n=>new Intl.NumberFormat("th-TH",{style:"currency",currency:"THB",minimumFractionDigits:2}).format(Number(n)||0);
  const shortFmt=n=>new Intl.NumberFormat("th-TH",{maximumFractionDigits:0}).format(Number(n)||0);
  function localDateKey(d=new Date()){ const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,"0"),day=String(d.getDate()).padStart(2,"0"); return `${y}-${m}-${day}`; }
  const todayKey=()=>localDateKey(new Date());
  function escapeHtml(s=""){ return String(s).replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[ch])); }
  function parseAmount(v){ const n=Number(String(v).replace(/[, ]/g,"")); return Number.isFinite(n)?n:NaN; }
  const sum=list=>list.reduce((s,e)=>s+Number(e.amount||0),0);

  function catsFor(type){ const base=type==="expense"?defaultExpenseCats:defaultIncomeCats; const custom=(customCats[type]||[]).filter(c=>!base.includes(c)); return [...base.filter(c=>c!=="อื่น ๆ"),...custom,"อื่น ๆ"]; }
  function colorFor(c){ if(colorMap[c]) return colorMap[c]; const used=new Set(Object.values(colorMap)); let col=palette.find(x=>!used.has(x))||palette[Object.keys(colorMap).length%palette.length]; colorMap[c]=col; Store.saveColorMap(colorMap); return col; }
  function iconFor(c,type){ return categoryIcons[c]||(type==="expense"?"↗":"↙"); }
  function populateSelect(sel,type,selected){ const list=catsFor(type); let h=list.map(c=>`<option value="${escapeHtml(c)}"${c===selected?" selected":""}>${iconFor(c,type)}  ${escapeHtml(c)}</option>`).join(""); if(sel.id==="category") h+=`<option value="__add__">➕  เพิ่มหมวดหมู่ใหม่…</option>`; sel.innerHTML=h; }

  /* ===== RENDER ===== */
  function render(){
    const t=todayKey(), te=entries.filter(e=>e.date===t);
    $("incomeToday").textContent=fmt(sum(te.filter(e=>e.type==="income")));
    $("expenseToday").textContent=fmt(sum(te.filter(e=>e.type==="expense")));
    $("balanceAll").textContent=fmt(sum(entries.filter(e=>e.type==="income"))-sum(entries.filter(e=>e.type==="expense")));
    $("todayCount").textContent=shortFmt(te.length);
    renderChart(); renderTransactions();
  }

  function renderChart(){
    const base=chartRange==="today"?entries.filter(e=>e.date===todayKey()):entries;
    const grouped={}; base.filter(e=>e.type==="expense").forEach(e=>grouped[e.category]=(grouped[e.category]||0)+Number(e.amount));
    const items=Object.entries(grouped).sort((a,b)=>b[1]-a[1]); const total=items.reduce((s,[,v])=>s+v,0);
    $("donutCaption").textContent=chartRange==="today"?"ค่าใช้จ่ายวันนี้":"ค่าใช้จ่ายทั้งหมด";
    $("donutTotal").textContent="฿"+shortFmt(total);
    const donut=$("donut"), legend=$("legend");
    if(!total){
      donut.innerHTML=`<circle class="track" cx="21" cy="21" r="15.915"></circle>`;
      legend.innerHTML=`<div class="min-h-[11rem] flex flex-col items-center justify-center text-center text-[#9aa3b2]"><div class="w-12 h-12 rounded-2xl grid place-items-center mb-3 bg-[#f2f3ff] text-primary text-2xl">◔</div><strong class="text-[#6b7280] text-[.85rem]">ยังไม่มีรายการค่าใช้จ่าย</strong><span class="mt-1 text-[.74rem]">เพิ่มรายการ${chartRange==="today"?"วันนี้":""}เพื่อดูกราฟ</span></div>`;
      return;
    }
    let cum=0;
    donut.innerHTML=`<circle class="track" cx="21" cy="21" r="15.915"></circle>`+items.map(([name,value])=>{
      const pct=value/total*100, dash=Math.max(pct-0.8,0.6);
      const seg=`<circle class="seg" cx="21" cy="21" r="15.915" stroke="${colorFor(name)}" stroke-dasharray="0 100" data-dash="${dash} ${100-dash}" stroke-dashoffset="${-cum}"></circle>`;
      cum+=pct; return seg;
    }).join("");
    requestAnimationFrame(()=>donut.querySelectorAll(".seg").forEach(s=>s.setAttribute("stroke-dasharray",s.dataset.dash)));
    legend.innerHTML=items.map(([name,value])=>{
      const pct=value/total*100;
      return `<div class="grid grid-cols-[13px_minmax(0,1fr)_auto] items-center gap-2.5 px-2 py-2.5 rounded-xl hover:bg-[#f8f9fc] transition"><span class="w-2.5 h-2.5 rounded" style="background:${colorFor(name)}"></span><span class="text-[.83rem] font-semibold truncate">${iconFor(name,"expense")} ${escapeHtml(name)}</span><span class="text-right"><strong class="block text-[.79rem]">${fmt(value)}</strong><small class="block text-[#9aa3b2] text-[.66rem] mt-0.5">${pct.toFixed(1)}%</small></span></div>`;
    }).join("");
  }

  function passesFilter(e){
    const t=todayKey();
    switch(activeFilter){
      case "today": if(e.date!==t) return false; break;
      case "7d":{ const d=new Date(); d.setDate(d.getDate()-6); if(e.date<localDateKey(d)) return false; break; }
      case "month":{ const n=new Date(); const p=`${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,"0")}`; if(!String(e.date).startsWith(p)) return false; break; }
      case "income": if(e.type!=="income") return false; break;
      case "expense": if(e.type!=="expense") return false; break;
    }
    if(searchTerm){ if(!`${e.note||""} ${e.category||""}`.toLowerCase().includes(searchTerm)) return false; }
    return true;
  }

  function renderTransactions(){
    const c=$("transactionsList");
    const sorted=[...entries].sort((a,b)=>`${b.date}T${b.time}`.localeCompare(`${a.date}T${a.time}`)).filter(passesFilter).slice(0,200);
    if(!sorted.length){
      const msg=(searchTerm||activeFilter!=="all")?"ไม่พบรายการที่ตรงกับเงื่อนไข":"ยังไม่มีรายการ ลองเพิ่มรายการแรกของคุณ";
      c.innerHTML=`<div class="py-10 px-4 text-center text-[#9aa3b2] text-[.82rem]">${msg}</div>`; return;
    }
    c.innerHTML=sorted.map(e=>{
      const dt=new Date(`${e.date}T00:00:00`).toLocaleDateString("th-TH",{day:"numeric",month:"short",year:"2-digit"});
      const sign=e.type==="expense"?"−":"+";
      const slip=e.receipt?`<span class="inline-flex items-center gap-1 text-primary font-extrabold cursor-zoom-in" data-slip="${e.id}">📎 สลิป</span>`:`<span class="text-[#c3c9d4]">ไม่มีสลิป</span>`;
      const ec=e.type==="expense";
      return `<div class="grid grid-cols-[auto_minmax(0,1fr)_auto_auto] gap-3 items-center py-3.5 px-1.5 border-t border-[#eef1f5] first:border-t-0">
        <div class="w-[2.7rem] h-[2.7rem] rounded-2xl grid place-items-center font-black text-[1.05rem] ${ec?"bg-expensesoft text-expense":"bg-incomesoft text-income"}">${iconFor(e.category,e.type)}</div>
        <div class="min-w-0"><strong class="block text-[.86rem] truncate">${escapeHtml(e.note||e.category)}</strong><div class="flex items-center gap-1.5 mt-1 text-[#98a1b0] text-[.69rem] flex-wrap"><span>${escapeHtml(e.category)}</span><span>·</span><span>${dt} ${escapeHtml(e.time||"")}</span><span>·</span>${slip}${e.editedBy?`<span>·</span><span class="text-primary/90 font-extrabold">✎ แก้ไขโดย ${escapeHtml(e.editedBy)}</span>`:""}</div></div>
        <div class="text-[.9rem] font-black whitespace-nowrap text-right ${ec?"text-expense":"text-income"}">${sign}${fmt(e.amount)}</div>
        <div class="flex gap-1.5"><button class="txbtn hover:bg-primarysoft hover:text-primary" data-edit="${e.id}" aria-label="แก้ไข">✎</button><button class="txbtn hover:bg-expensesoft hover:text-expense" data-del="${e.id}" aria-label="ลบ">🗑</button></div>
      </div>`;
    }).join("");
    c.querySelectorAll("[data-edit]").forEach(b=>b.onclick=()=>openEdit(b.dataset.edit));
    c.querySelectorAll("[data-del]").forEach(b=>b.onclick=()=>askDelete(b.dataset.del));
    c.querySelectorAll("[data-slip]").forEach(s=>{ const e=entries.find(x=>x.id===s.dataset.slip); if(e&&e.receipt) s.onclick=()=>openLightbox(e.receipt); });
  }

  /* ===== TOAST ===== */
  function toast(msg,kind=""){ const el=$("toast"); el.className="toast show"+(kind?" "+kind:""); el.innerHTML=(kind==="success"?"✓ ":kind==="error"?"⚠ ":"")+escapeHtml(msg); clearTimeout(window.__t); window.__t=setTimeout(()=>el.classList.remove("show"),2400); }

  /* ===== IMAGE ===== */
  function compressImage(file){ return new Promise((res,rej)=>{ const img=new Image(),r=new FileReader(); r.onerror=rej; r.onload=()=>img.src=r.result; img.onerror=rej; img.onload=()=>{ try{ const max=900,s=Math.min(1,max/Math.max(img.width,img.height)),cv=document.createElement("canvas"); cv.width=Math.round(img.width*s); cv.height=Math.round(img.height*s); cv.getContext("2d").drawImage(img,0,0,cv.width,cv.height); res(cv.toDataURL("image/jpeg",.72)); }catch(e){ rej(e); } }; r.readAsDataURL(file); }); }
  function checkStorageHealth(){ try{ let b=0; for(const k in localStorage){ if(Object.prototype.hasOwnProperty.call(localStorage,k)) b+=(localStorage[k].length+k.length)*2; } if(b>4300000) toast("พื้นที่จัดเก็บใกล้เต็ม แนะนำส่งออก CSV แล้วลบรายการเก่า","error"); }catch{} }

  /* ===== ADD FORM ===== */
  function setNow(){ const n=new Date(); $("entryDate").value=localDateKey(n); $("entryTime").value=`${String(n.getHours()).padStart(2,"0")}:${String(n.getMinutes()).padStart(2,"0")}`; $("todayLabel").textContent=n.toLocaleDateString("th-TH",{day:"numeric",month:"short",year:"numeric"}); }
  function clearFormReceipt(){ formReceipt=""; $("receipt").value=""; $("receiptBox").hidden=true; $("receiptPreview").removeAttribute("src"); }
  function resetForm(){ $("entryForm").reset(); selectedType="expense"; document.querySelectorAll("#entryForm .type-btn").forEach(b=>b.classList.toggle("active",b.dataset.type==="expense")); clearFormReceipt(); $("customCatRow").hidden=true; $("amount").classList.remove("invalid"); $("amountError").textContent=""; populateSelect($("category"),selectedType); setNow(); }

  document.querySelectorAll("#entryForm .type-btn").forEach(btn=>btn.onclick=()=>{ selectedType=btn.dataset.type; document.querySelectorAll("#entryForm .type-btn").forEach(b=>b.classList.toggle("active",b===btn)); populateSelect($("category"),selectedType); $("customCatRow").hidden=true; });
  document.querySelectorAll("#rangeTabs .tab").forEach(btn=>btn.onclick=()=>{ chartRange=btn.dataset.range; document.querySelectorAll("#rangeTabs .tab").forEach(b=>b.classList.toggle("active",b===btn)); renderChart(); });
  $("category").addEventListener("change",e=>{ if(e.target.value==="__add__"){ $("customCatRow").hidden=false; $("customCat").focus(); e.target.selectedIndex=0; } else $("customCatRow").hidden=true; });
  $("customCatAdd").onclick=()=>{ const name=$("customCat").value.trim(); if(!name) return toast("กรุณาพิมพ์ชื่อหมวดหมู่"); if(catsFor(selectedType).includes(name)){ $("category").value=name; $("customCatRow").hidden=true; $("customCat").value=""; return toast("มีหมวดหมู่นี้อยู่แล้ว"); } customCats[selectedType]=[...(customCats[selectedType]||[]),name]; Store.saveCustomCats(customCats); colorFor(name); populateSelect($("category"),selectedType,name); $("customCatRow").hidden=true; $("customCat").value=""; toast("เพิ่มหมวดหมู่แล้ว","success"); };
  $("receipt").addEventListener("change",async e=>{ const f=e.target.files[0]; if(!f) return; try{ formReceipt=await compressImage(f); $("receiptPreview").src=formReceipt; $("receiptBox").hidden=false; }catch{ toast("อ่านรูปไม่สำเร็จ ลองรูปอื่น","error"); clearFormReceipt(); } });
  $("receiptRemove").onclick=clearFormReceipt;
  $("receiptPreview").onclick=()=>{ if(formReceipt) openLightbox(formReceipt); };

  $("entryForm").addEventListener("submit",e=>{
    e.preventDefault(); if(isSubmitting) return;
    const amount=parseAmount($("amount").value);
    if(!amount||isNaN(amount)||amount<=0){ $("amount").classList.add("invalid"); $("amountError").textContent="กรุณากรอกจำนวนเงินมากกว่า 0"; $("amount").focus(); return; }
    let category=$("category").value; if(category==="__add__"||!category) category=catsFor(selectedType)[0];
    isSubmitting=true; const btn=$("submitBtn"); btn.disabled=true;
    const entry={ id:(window.crypto&&crypto.randomUUID)?crypto.randomUUID():Date.now()+"-"+Math.random(), type:selectedType, amount, category, note:$("note").value.trim(), date:$("entryDate").value||todayKey(), time:$("entryTime").value||"00:00", receipt:formReceipt, createdAt:new Date().toISOString(), createdBy:(lineUser?lineUser.name:null) };
    colorFor(category); entries.push(entry);
    const r=Store.saveEntries(entries); handleSaveResult(r);
    resetForm(); render();
    if(r==="ok"||r==="stripped"){ toast(r==="stripped"?"บันทึกแล้ว (พื้นที่รูปเต็ม จึงไม่เก็บสลิป)":"บันทึกรายการเรียบร้อย","success"); checkStorageHealth(); }
    setTimeout(()=>{ isSubmitting=false; btn.disabled=false; },350);
  });
  function handleSaveResult(r){ if(r==="fail"||r==="disabled"){ $("storageNotice").innerHTML="<span>⚠</span> โหมดชั่วคราว: รายการแสดงได้ แต่จะหายเมื่อปิดหน้า — เปิดผ่าน Safari/Chrome หรืออัปขึ้นโฮสติ้ง"; toast("เบราว์เซอร์ไม่อนุญาตให้เก็บข้อมูลถาวร","error"); } }

  /* ===== EDIT ===== */
  function openEdit(id){
    const e=entries.find(x=>x.id===id); if(!e) return;
    editType=e.type; editReceipt=e.receipt||"";
    $("editId").value=id;
    document.querySelectorAll("#editForm .type-btn").forEach(b=>b.classList.toggle("active",b.dataset.type===editType));
    $("editAmount").value=e.amount; $("editAmount").classList.remove("invalid"); $("editAmountError").textContent="";
    populateSelect($("editCategory"),editType,e.category);
    $("editNote").value=e.note||""; $("editDate").value=e.date||todayKey(); $("editTime").value=e.time||"00:00";
    if(editReceipt){ $("editReceiptPreview").src=editReceipt; $("editReceiptBox").hidden=false; } else { $("editReceiptBox").hidden=true; $("editReceiptPreview").removeAttribute("src"); }
    $("editReceipt").value=""; showModal("editOverlay");
  }
  document.querySelectorAll("#editForm .type-btn").forEach(btn=>btn.onclick=()=>{ editType=btn.dataset.type; document.querySelectorAll("#editForm .type-btn").forEach(b=>b.classList.toggle("active",b===btn)); populateSelect($("editCategory"),editType,$("editCategory").value); });
  $("editReceipt").addEventListener("change",async e=>{ const f=e.target.files[0]; if(!f) return; try{ editReceipt=await compressImage(f); $("editReceiptPreview").src=editReceipt; $("editReceiptBox").hidden=false; }catch{ toast("อ่านรูปไม่สำเร็จ","error"); } });
  $("editReceiptRemove").onclick=()=>{ editReceipt=""; $("editReceipt").value=""; $("editReceiptBox").hidden=true; $("editReceiptPreview").removeAttribute("src"); };
  $("editReceiptPreview").onclick=()=>{ if(editReceipt) openLightbox(editReceipt); };
  $("editSave").onclick=()=>{
    const id=$("editId").value, idx=entries.findIndex(x=>x.id===id); if(idx<0) return;
    const amount=parseAmount($("editAmount").value);
    if(!amount||isNaN(amount)||amount<=0){ $("editAmount").classList.add("invalid"); $("editAmountError").textContent="กรุณากรอกจำนวนเงินมากกว่า 0"; return; }
    let category=$("editCategory").value; if(category==="__add__"||!category) category=catsFor(editType)[0]; colorFor(category);
    entries[idx]={...entries[idx], type:editType, amount, category, note:$("editNote").value.trim(), date:$("editDate").value||todayKey(), time:$("editTime").value||"00:00", receipt:editReceipt, updatedAt:new Date().toISOString(), editedBy:currentEditorName()};
    Store.saveEntries(entries); closeModal("editOverlay"); render(); toast("แก้ไขรายการแล้ว","success");
  };
  $("editClose").onclick=$("editCancel").onclick=()=>closeModal("editOverlay");

  /* ===== DELETE ===== */
  let pendingDelete=null;
  function askDelete(id){ const e=entries.find(x=>x.id===id); if(!e) return; pendingDelete={mode:"one",id}; $("confirmTitle").textContent="ลบรายการนี้?"; $("confirmText").innerHTML=`${escapeHtml(e.note||e.category)} · <strong>${fmt(e.amount)}</strong><br>การลบไม่สามารถย้อนกลับได้`; $("confirmOk").textContent="ลบรายการ"; showModal("confirmOverlay"); }
  $("clearTodayBtn").onclick=()=>{ const n=entries.filter(e=>e.date===todayKey()).length; if(!n) return toast("วันนี้ยังไม่มีรายการ"); pendingDelete={mode:"today"}; $("confirmTitle").textContent="ลบรายการวันนี้ทั้งหมด?"; $("confirmText").innerHTML=`มีทั้งหมด <strong>${n}</strong> รายการในวันนี้<br>ประวัติ/ยอดสะสมวันอื่นจะไม่ถูกลบ`; $("confirmOk").textContent="ลบทั้งหมด"; showModal("confirmOverlay"); };
  $("confirmOk").onclick=()=>{ if(!pendingDelete) return; if(pendingDelete.mode==="one"){ entries=entries.filter(e=>e.id!==pendingDelete.id); Store.saveEntries(entries); render(); toast("ลบรายการแล้ว","success"); } else { entries=entries.filter(e=>e.date!==todayKey()); Store.saveEntries(entries); render(); toast("ลบรายการวันนี้แล้ว","success"); } pendingDelete=null; closeModal("confirmOverlay"); };
  $("confirmCancel").onclick=()=>{ pendingDelete=null; closeModal("confirmOverlay"); };

  /* ===== EXPORT ===== */
  $("exportBtn").onclick=()=>{
    if(!entries.length) return toast("ยังไม่มีข้อมูลให้ส่งออก");
    const rows=[["วันที่","เวลา","ประเภท","หมวดหมู่","รายละเอียด","จำนวนเงิน"],...entries.map(e=>[e.date,e.time,e.type==="income"?"รายรับ":"รายจ่าย",e.category,e.note,e.amount])];
    const csv="﻿"+rows.map(r=>r.map(v=>`"${String(v??"").replace(/"/g,'""')}"`).join(",")).join("\n");
    const a=document.createElement("a"); a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"})); a.download=`บัญชีรายรับรายจ่าย-${todayKey()}.csv`; a.click(); URL.revokeObjectURL(a.href); toast("ส่งออก CSV แล้ว","success");
  };

  /* ===== SEARCH + FILTER ===== */
  $("searchInput").addEventListener("input",e=>{ searchTerm=e.target.value.trim().toLowerCase(); renderTransactions(); });
  document.querySelectorAll("#filterChips .chip").forEach(c=>c.onclick=()=>{ activeFilter=c.dataset.filter; document.querySelectorAll("#filterChips .chip").forEach(x=>x.classList.toggle("active",x===c)); renderTransactions(); });

  /* ===== LIGHTBOX + MODAL HELPERS ===== */
  function openLightbox(src){ $("lightboxImg").src=src; $("lightbox").hidden=false; }
  $("lightboxClose").onclick=()=>{ $("lightbox").hidden=true; $("lightboxImg").removeAttribute("src"); };
  $("lightbox").addEventListener("click",e=>{ if(e.target.id==="lightbox") $("lightboxClose").click(); });
  function showModal(id){ $(id).hidden=false; document.body.style.overflow="hidden"; }
  function closeModal(id){ $(id).hidden=true; document.body.style.overflow=""; }
  document.querySelectorAll(".modal-overlay").forEach(ov=>ov.addEventListener("click",e=>{ if(e.target===ov){ ov.hidden=true; document.body.style.overflow=""; pendingDelete=null; } }));
  document.addEventListener("keydown",e=>{ if(e.key==="Escape"){ document.querySelectorAll(".modal-overlay").forEach(ov=>{ if(!ov.hidden){ ov.hidden=true; document.body.style.overflow=""; } }); if(!$("lightbox").hidden) $("lightboxClose").click(); } });

  /* ===== SIDEBAR NAV (scroll) + SOON ===== */
  document.querySelectorAll("#sideNav .nav-item").forEach(b=>b.onclick=()=>{
    if(b.dataset.soon){ $("soonTitle").textContent=b.dataset.soon; showModal("soonOverlay"); return; }
    document.querySelectorAll("#sideNav .nav-item").forEach(x=>x.classList.toggle("active",x===b));
    const el=document.querySelector(`[data-anchor="${b.dataset.scroll}"]`); if(el) el.scrollIntoView({behavior:"smooth",block:"start"});
  });
  $("soonOk").onclick=()=>closeModal("soonOverlay");

  /* ===== LINE LOGIN + EDITOR IDENTITY ===== */
  // ชื่อผู้แก้ไข: ใช้ชื่อจาก LINE ถ้าล็อกอิน ไม่งั้นถามครั้งแรกแล้วจำไว้ในเครื่อง
  function currentEditorName(){
    if(lineUser) return lineUser.name;
    let n=localStorage.getItem(USERNAME_KEY);
    if(!n){ n=(prompt("ระบุชื่อของคุณ (ใช้บันทึกว่าใครเป็นคนแก้ไข)","")||"").trim(); if(!n) n="ไม่ระบุชื่อ"; try{ localStorage.setItem(USERNAME_KEY,n); }catch{} }
    return n;
  }
  function renderUser(){
    const el=$("userArea");
    if(lineUser){
      el.innerHTML=`<div class="flex items-center gap-2.5">
        <img src="${escapeHtml(lineUser.picture||"")}" referrerpolicy="no-referrer" class="w-10 h-10 rounded-2xl object-cover bg-[#20273a]" alt="" />
        <div class="leading-tight"><div class="text-sm font-extrabold max-w-[8rem] truncate">${escapeHtml(lineUser.name)}</div><button id="lineLogout" class="text-[.7rem] text-muted hover:text-expense">ออกจากระบบ</button></div></div>`;
      $("lineLogout").onclick=()=>{ try{ if(window.liff&&liff.isLoggedIn&&liff.isLoggedIn()) liff.logout(); }catch{} lineUser=null; renderUser(); toast("ออกจากระบบ LINE แล้ว"); };
    } else {
      el.innerHTML=`<button id="lineLoginBtn" class="flex items-center gap-2 h-11 px-4 rounded-2xl bg-[#06C755] text-white font-extrabold text-[.82rem] shadow-soft transition hover:brightness-95"><span class="text-base leading-none">💬</span> เข้าสู่ระบบด้วย LINE</button>`;
      $("lineLoginBtn").onclick=lineLogin;
    }
  }
  function lineLogin(){
    if(!LIFF_ID){ toast("ยังไม่ได้ตั้งค่า LINE — ใส่ LIFF ID ใน app.js ก่อนครับ","error"); return; }
    if(!window.liff){ toast("LIFF SDK ยังไม่โหลด ลองรีเฟรช","error"); return; }
    try{ if(!liff.isLoggedIn()) liff.login(); }catch{ toast("เริ่ม LINE login ไม่สำเร็จ","error"); }
  }
  async function initLine(){
    if(LIFF_ID && window.liff){
      try{
        await liff.init({ liffId:LIFF_ID });
        if(liff.isLoggedIn()){
          const p=await liff.getProfile();
          lineUser={ name:p.displayName, id:p.userId, picture:p.pictureUrl };
        }
      }catch(e){ /* config ผิด/ยังไม่ผูก URL — ปล่อยให้กดปุ่ม login เอง */ }
    }
    renderUser();
  }

  /* ===== INIT ===== */
  if(!Store.enabled) handleSaveResult("disabled");
  initLine();
  entries.forEach(e=>{ if(e.type==="expense") colorFor(e.category); });
  setNow(); populateSelect($("category"),selectedType); render();
  let lastDay=todayKey();
  setInterval(()=>{ $("todayLabel").textContent=new Date().toLocaleDateString("th-TH",{day:"numeric",month:"short",year:"numeric"}); const now=todayKey(); if(now!==lastDay) lastDay=now; render(); },60000);
})();
