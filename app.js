(() => {
  "use strict";
  /* MoneyFlow — บัญชีรายรับรายจ่าย (เว็บ, Tailwind UI) */

  const STORAGE_KEY   = "daily-money-ledger-v1";
  const CUSTOMCAT_KEY = "moneyflow-custom-categories-v1";
  const COLOR_KEY     = "moneyflow-category-colors-v1";
  const PROFILES_KEY  = "moneyflow-profiles-v1";
  const ACTIVEPROF_KEY= "moneyflow-active-profile-v1";
  const DEFAULT_PROFILE = "ตัวเอง";

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
    saveColorMap(m){ this._write(COLOR_KEY,m); },
    getProfiles(){ const p=this._read(PROFILES_KEY,null); return (Array.isArray(p)&&p.length)?p:[DEFAULT_PROFILE]; },
    saveProfiles(list){ this._write(PROFILES_KEY,list); },
    getActiveProfile(){ return this._read(ACTIVEPROF_KEY,null); },
    saveActiveProfile(name){ this._write(ACTIVEPROF_KEY,name); }
  };

  /* ===== STATE ===== */
  let entries=Store.getEntries(), customCats=Store.getCustomCats(), colorMap=Store.getColorMap();
  let profiles=Store.getProfiles();
  let activeProfile=Store.getActiveProfile();
  if(!profiles.includes(activeProfile)) activeProfile=profiles[0];
  let activeOwner=null;   // null = สมุดของฉัน; uuid = สมุดที่ถูกแชร์มาจากคนอื่น
  let activeRole="own";   // own | editor | viewer (สิทธิ์กับ context ปัจจุบัน)
  let myShares=[];        // แชร์ที่ฉันเป็นเจ้าของ  [{id,profile,shared_with_email,role}]
  let sharedToMe=[];      // โปรไฟล์ที่คนอื่นแชร์มาให้ฉัน [{ownerId,ownerEmail,profile,role}]
  let selectedType="expense", chartRange="today", activeFilter="all", searchTerm="";
  let formReceipt="", editReceipt="", editType="expense", isSubmitting=false;

  /* ===== CLOUD (Supabase) + FACEBOOK LOGIN =====
     ใส่ค่า 2 ตัวนี้จาก Supabase (Project Settings → API) เพื่อเปิดโหมดคลาวด์:
       - SUPABASE_URL      เช่น https://xxxx.supabase.co
       - SUPABASE_ANON_KEY  (anon public key — ปลอดภัยที่จะอยู่ในเว็บ เพราะมี RLS ป้องกัน)
     เมื่อใส่แล้ว: ข้อมูลจะเก็บบนคลาวด์ ใช้ได้หลายเครื่องหลายคน + login ผ่าน Facebook (ตั้งใน Supabase Auth)
     ถ้าเว้นว่าง: แอปจะทำงานแบบเก็บในเครื่อง (localStorage) เหมือนเดิม                                  */
  const SUPABASE_URL = "https://piqqtuadcgdpkxzviffn.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_FUpYgEcv8SSo4AfPw-VjiA_PoRXFe0y";
  const USERNAME_KEY = "moneyflow-user-name";
  const CLOUD = !!(SUPABASE_URL && SUPABASE_ANON_KEY && window.supabase);
  let sb = null;          // Supabase client (เมื่อ CLOUD)
  let user = null;        // ผู้ใช้ปัจจุบัน { name, picture, id }
  let realtimeOn = false;

  const $=id=>document.getElementById(id);
  const fmt=n=>new Intl.NumberFormat("th-TH",{style:"currency",currency:"THB",minimumFractionDigits:2}).format(Number(n)||0);
  const shortFmt=n=>new Intl.NumberFormat("th-TH",{maximumFractionDigits:0}).format(Number(n)||0);
  function localDateKey(d=new Date()){ const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,"0"),day=String(d.getDate()).padStart(2,"0"); return `${y}-${m}-${day}`; }
  const todayKey=()=>localDateKey(new Date());
  function escapeHtml(s=""){ return String(s).replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[ch])); }
  function parseAmount(v){ const n=Number(String(v).replace(/[, ]/g,"")); return Number.isFinite(n)?n:NaN; }
  const sum=list=>list.reduce((s,e)=>s+Number(e.amount||0),0);
  const profOf=e=>e.profile||DEFAULT_PROFILE;
  const me=()=>(user&&user.id)||null;
  const ownerOf=e=>e.userId||null;
  function sameOwner(a,b){ if(!CLOUD) return true; const m=me(); return (a||m)===(b||m); }
  const canEdit=()=>activeRole!=="viewer";
  const activeEntries=()=>entries.filter(e=>profOf(e)===activeProfile && sameOwner(ownerOf(e),activeOwner));

  function catsFor(type){ const base=type==="expense"?defaultExpenseCats:defaultIncomeCats; const custom=(customCats[type]||[]).filter(c=>!base.includes(c)); return [...base.filter(c=>c!=="อื่น ๆ"),...custom,"อื่น ๆ"]; }
  function colorFor(c){ if(colorMap[c]) return colorMap[c]; const used=new Set(Object.values(colorMap)); let col=palette.find(x=>!used.has(x))||palette[Object.keys(colorMap).length%palette.length]; colorMap[c]=col; Store.saveColorMap(colorMap); return col; }
  function iconFor(c,type){ return categoryIcons[c]||(type==="expense"?"↗":"↙"); }
  function populateSelect(sel,type,selected){ const list=catsFor(type); let h=list.map(c=>`<option value="${escapeHtml(c)}"${c===selected?" selected":""}>${iconFor(c,type)}  ${escapeHtml(c)}</option>`).join(""); if(sel.id==="category") h+=`<option value="__add__">➕  เพิ่มหมวดหมู่ใหม่…</option>`; sel.innerHTML=h; }

  /* ===== RENDER ===== */
  function render(){
    const ae=activeEntries();
    const t=todayKey(), te=ae.filter(e=>e.date===t);
    $("incomeToday").textContent=fmt(sum(te.filter(e=>e.type==="income")));
    $("expenseToday").textContent=fmt(sum(te.filter(e=>e.type==="expense")));
    $("balanceAll").textContent=fmt(sum(ae.filter(e=>e.type==="income"))-sum(ae.filter(e=>e.type==="expense")));
    $("todayCount").textContent=shortFmt(te.length);
    renderChart(); renderTransactions();
  }

  function renderChart(){
    const ae=activeEntries();
    const base=chartRange==="today"?ae.filter(e=>e.date===todayKey()):ae;
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
    const sorted=[...activeEntries()].sort((a,b)=>`${b.date}T${b.time}`.localeCompare(`${a.date}T${a.time}`)).filter(passesFilter).slice(0,200);
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
        ${canEdit()?`<div class="flex gap-1.5"><button class="txbtn hover:bg-primarysoft hover:text-primary" data-edit="${e.id}" aria-label="แก้ไข">✎</button><button class="txbtn hover:bg-expensesoft hover:text-expense" data-del="${e.id}" aria-label="ลบ">🗑</button></div>`:`<div></div>`}
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
    if(!canEdit()){ return toast("โหมดดูอย่างเดียว — ไม่สามารถเพิ่มรายการได้","error"); }
    const amount=parseAmount($("amount").value);
    if(!amount||isNaN(amount)||amount<=0){ $("amount").classList.add("invalid"); $("amountError").textContent="กรุณากรอกจำนวนเงินมากกว่า 0"; $("amount").focus(); return; }
    let category=$("category").value; if(category==="__add__"||!category) category=catsFor(selectedType)[0];
    isSubmitting=true; const btn=$("submitBtn"); btn.disabled=true;
    const entry={ id:(window.crypto&&crypto.randomUUID)?crypto.randomUUID():Date.now()+"-"+Math.random(), type:selectedType, amount, category, note:$("note").value.trim(), profile:activeProfile, userId:(activeOwner||me()), date:$("entryDate").value||todayKey(), time:$("entryTime").value||"00:00", receipt:formReceipt, createdAt:new Date().toISOString(), createdBy:(user?user.name:null) };
    colorFor(category); entries.unshift(entry);
    let r="ok";
    if(CLOUD){ cloudInsert(entry); } else { r=Store.saveEntries(entries); handleSaveResult(r); }
    resetForm(); render();
    if(r==="ok"||r==="stripped"){ toast(r==="stripped"?"บันทึกแล้ว (พื้นที่รูปเต็ม จึงไม่เก็บสลิป)":"บันทึกรายการเรียบร้อย","success"); if(!CLOUD) checkStorageHealth(); }
    setTimeout(()=>{ isSubmitting=false; btn.disabled=false; },350);
  });
  function handleSaveResult(r){ if(r==="fail"||r==="disabled"){ $("storageNotice").innerHTML="<span>⚠</span> โหมดชั่วคราว: รายการแสดงได้ แต่จะหายเมื่อปิดหน้า — เปิดผ่าน Safari/Chrome หรืออัปขึ้นโฮสติ้ง"; toast("เบราว์เซอร์ไม่อนุญาตให้เก็บข้อมูลถาวร","error"); } }

  /* ===== EDIT ===== */
  function openEdit(id){
    if(!canEdit()) return toast("โหมดดูอย่างเดียว","error");
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
    if(CLOUD){ cloudUpdate(entries[idx]); } else { Store.saveEntries(entries); }
    closeModal("editOverlay"); render(); toast("แก้ไขรายการแล้ว","success");
  };
  $("editClose").onclick=$("editCancel").onclick=()=>closeModal("editOverlay");

  /* ===== DELETE ===== */
  let pendingDelete=null;
  function askDelete(id){ if(!canEdit()) return toast("โหมดดูอย่างเดียว","error"); const e=entries.find(x=>x.id===id); if(!e) return; pendingDelete={mode:"one",id}; $("confirmTitle").textContent="ลบรายการนี้?"; $("confirmText").innerHTML=`${escapeHtml(e.note||e.category)} · <strong>${fmt(e.amount)}</strong><br>การลบไม่สามารถย้อนกลับได้`; $("confirmOk").textContent="ลบรายการ"; showModal("confirmOverlay"); }
  $("clearTodayBtn").onclick=()=>{ const n=activeEntries().filter(e=>e.date===todayKey()).length; if(!n) return toast("วันนี้ยังไม่มีรายการ"); pendingDelete={mode:"today"}; $("confirmTitle").textContent="ลบรายการวันนี้ทั้งหมด?"; $("confirmText").innerHTML=`ของ <strong>${escapeHtml(activeProfile)}</strong> มี <strong>${n}</strong> รายการในวันนี้<br>ประวัติ/ยอดสะสมวันอื่น และข้อมูลคนอื่นจะไม่ถูกลบ`; $("confirmOk").textContent="ลบทั้งหมด"; showModal("confirmOverlay"); };
  $("confirmOk").onclick=()=>{ if(!pendingDelete) return; if(pendingDelete.mode==="one"){ const did=pendingDelete.id; entries=entries.filter(e=>e.id!==did); if(CLOUD){ cloudDelete(did); } else { Store.saveEntries(entries); } render(); toast("ลบรายการแล้ว","success"); } else { const ids=entries.filter(e=>e.date===todayKey()&&profOf(e)===activeProfile&&sameOwner(ownerOf(e),activeOwner)).map(e=>e.id); entries=entries.filter(e=>!ids.includes(e.id)); if(CLOUD){ cloudDeleteIds(ids); } else { Store.saveEntries(entries); } render(); toast("ลบรายการวันนี้แล้ว","success"); } pendingDelete=null; closeModal("confirmOverlay"); };
  $("confirmCancel").onclick=()=>{ pendingDelete=null; closeModal("confirmOverlay"); };

  /* ===== EXPORT ===== */
  $("exportBtn").onclick=()=>{
    const list=activeEntries();
    if(!list.length) return toast("ยังไม่มีข้อมูลให้ส่งออก");
    const rows=[["เจ้าของ","วันที่","เวลา","ประเภท","หมวดหมู่","รายละเอียด","จำนวนเงิน"],...list.map(e=>[profOf(e),e.date,e.time,e.type==="income"?"รายรับ":"รายจ่าย",e.category,e.note,e.amount])];
    const csv="﻿"+rows.map(r=>r.map(v=>`"${String(v??"").replace(/"/g,'""')}"`).join(",")).join("\n");
    const a=document.createElement("a"); a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"})); a.download=`บัญชี-${activeProfile}-${todayKey()}.csv`; a.click(); URL.revokeObjectURL(a.href); toast("ส่งออก CSV แล้ว","success");
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

  /* ===== PROFILES (สมุดแยกของแต่ละคน) ===== */
  function profKey(owner,profile){ return (owner?"shared::"+owner:"own")+"::"+profile; }
  function opt(val,label,cur){ return `<option value="${escapeHtml(val)}"${val===cur?" selected":""}>${escapeHtml(label)}</option>`; }
  function renderProfiles(){
    const sel=$("profileSelect"); if(!sel) return;
    const curKey=profKey(activeOwner,activeProfile);
    const mine=profiles.map(p=>opt(profKey(null,p),p,curKey)).join("");
    let html = sharedToMe.length ? `<optgroup label="ของฉัน">${mine}</optgroup>` : mine;
    if(sharedToMe.length){
      html += `<optgroup label="แชร์มาให้ฉัน">`+sharedToMe.map(s=>{
        const ic=s.role==="editor"?"✎":"👁";
        return opt(profKey(s.ownerId,s.profile),`${s.profile} · ${s.ownerEmail||"แชร์"} ${ic}`,curKey);
      }).join("")+`</optgroup>`;
    }
    sel.innerHTML=html;
  }
  function updateModeUI(){
    const ro=activeRole==="viewer";
    const addPanel=document.querySelector('[data-anchor="add"]'); if(addPanel) addPanel.style.display=ro?"none":"";
    const ct=$("clearTodayBtn"); if(ct) ct.style.display=ro?"none":"";
  }
  function setContext(owner,name,role){
    activeOwner=owner||null; activeProfile=name; activeRole=role||"own";
    if(!activeOwner) Store.saveActiveProfile(name);
    renderProfiles(); updateModeUI(); render();
  }
  function setActiveProfile(name){ if(!profiles.includes(name)) return; setContext(null,name,"own"); }
  function onProfileChange(val){
    if(val&&val.indexOf("shared::")===0){
      const rest=val.slice(8), i=rest.indexOf("::"), owner=rest.slice(0,i), name=rest.slice(i+2);
      const s=sharedToMe.find(x=>x.ownerId===owner&&x.profile===name);
      setContext(owner,name,s?s.role:"viewer");
    } else { setContext(null, val.indexOf("own::")===0?val.slice(5):val, "own"); }
  }
  function addProfile(){
    const name=(prompt("ชื่อคน/โปรไฟล์ใหม่ (เช่น ลูก, แม่)","")||"").trim();
    if(!name) return;
    if(profiles.includes(name)){ setActiveProfile(name); return toast("มีคนนี้อยู่แล้ว สลับให้แทน"); }
    profiles.push(name); Store.saveProfiles(profiles); setActiveProfile(name); toast(`สร้างสมุดของ "${name}" แล้ว`,"success");
  }
  // เพิ่มชื่อคนที่พบในข้อมูล (เช่น สร้างจากอีกเครื่องในโหมดคลาวด์) เข้ารายชื่อ
  function mergeProfilesFromEntries(){
    let changed=false;
    entries.forEach(e=>{ if(!sameOwner(ownerOf(e),null)) return; const p=profOf(e); if(!profiles.includes(p)){ profiles.push(p); changed=true; } });
    if(changed){ Store.saveProfiles(profiles); renderProfiles(); }
  }
  if($("profileSelect")) $("profileSelect").onchange=e=>onProfileChange(e.target.value);
  if($("addProfileBtn")) $("addProfileBtn").onclick=addProfile;

  /* ===== SETTINGS (จัดการคน) ===== */
  function openSettings(){ renderSettings(); showModal("settingsOverlay"); }
  function renderSettings(){
    const c=$("profileList"); if(!c) return;
    c.innerHTML=profiles.map(p=>{
      const cnt=entries.filter(e=>profOf(e)===p && sameOwner(ownerOf(e),null)).length, active=(!activeOwner&&p===activeProfile);
      const shares=myShares.filter(s=>s.profile===p);
      const shareList = shares.length? `<div class="mt-2 flex flex-col gap-1">`+shares.map(s=>`<div class="flex items-center gap-2 text-[.72rem] pl-1"><span class="px-1.5 py-0.5 rounded-full font-bold ${s.role==="editor"?"bg-incomesoft text-income":"bg-infosoft text-info"}">${s.role==="editor"?"✎ แก้ไข":"👁 ดู"}</span><span class="flex-1 truncate text-[#6b7280]">${escapeHtml(s.shared_with_email)}</span><button type="button" class="text-expense font-black" data-revoke="${s.id}" aria-label="ถอนสิทธิ์">✕</button></div>`).join("")+`</div>` : "";
      return `<div class="p-2.5 rounded-xl border ${active?"border-primary bg-primarysoft":"border-line bg-white"}">
        <div class="flex items-center gap-2">
          <button type="button" class="flex-1 text-left min-w-0" data-switch="${escapeHtml(p)}">
            <strong class="block text-[.9rem] truncate">${active?'<span class="text-primary">●</span> ':""}${escapeHtml(p)}</strong>
            <small class="text-[#9aa3b2] text-[.7rem]">${shortFmt(cnt)} รายการ${shares.length?` · แชร์ ${shares.length}`:""}</small>
          </button>
          <button type="button" class="txbtn hover:bg-infosoft hover:text-info" data-share="${escapeHtml(p)}" aria-label="แชร์">👥</button>
          <button type="button" class="txbtn hover:bg-primarysoft hover:text-primary" data-rename="${escapeHtml(p)}" aria-label="แก้ชื่อ">✎</button>
          <button type="button" class="txbtn hover:bg-expensesoft hover:text-expense" data-delprof="${escapeHtml(p)}" aria-label="ลบ">🗑</button>
        </div>
        ${shareList}
      </div>`;
    }).join("");
    c.querySelectorAll("[data-switch]").forEach(b=>b.onclick=()=>{ setActiveProfile(b.dataset.switch); renderSettings(); });
    c.querySelectorAll("[data-rename]").forEach(b=>b.onclick=()=>renameProfile(b.dataset.rename));
    c.querySelectorAll("[data-delprof]").forEach(b=>b.onclick=()=>deleteProfile(b.dataset.delprof));
    c.querySelectorAll("[data-share]").forEach(b=>b.onclick=()=>shareProfile(b.dataset.share));
    c.querySelectorAll("[data-revoke]").forEach(b=>b.onclick=()=>revokeShare(b.dataset.revoke));
  }
  function shareProfile(profile){
    if(!CLOUD||!user) return toast("ต้องเข้าสู่ระบบก่อนจึงจะแชร์ได้","error");
    const email=(prompt(`แชร์โปรไฟล์ "${profile}" ให้ใคร? พิมพ์อีเมลผู้รับ:`,"")||"").trim().toLowerCase();
    if(!email) return;
    if(user.email && email===user.email.toLowerCase()) return toast("แชร์ให้ตัวเองไม่ได้");
    const role=confirm('ให้สิทธิ์ "แก้ไข" ด้วยไหม?\n\nOK = แก้ไขได้ (editor)\nCancel = ดูอย่างเดียว (viewer)')?"editor":"viewer";
    cloudShare(profile,email,role);
  }
  function revokeShare(id){ if(confirm("ถอนสิทธิ์การแชร์นี้?")) cloudRevoke(id); }
  function shareAllProfiles(){
    if(!CLOUD||!user) return toast("ต้องเข้าสู่ระบบก่อนจึงจะแชร์ได้","error");
    if(!profiles.length) return toast("ยังไม่มีโปรไฟล์ให้แชร์");
    const email=(prompt("แชร์ทุกโปรไฟล์ให้ใคร? พิมพ์อีเมลผู้รับ:","")||"").trim().toLowerCase();
    if(!email) return;
    if(user.email && email===user.email.toLowerCase()) return toast("แชร์ให้ตัวเองไม่ได้");
    const role=confirm('ให้สิทธิ์ "แก้ไข" ด้วยไหม? (กับทุกโปรไฟล์)\n\nOK = แก้ไขได้ (editor)\nCancel = ดูอย่างเดียว (viewer)')?"editor":"viewer";
    cloudShareAll(email,role);
  }
  async function cloudShareAll(email,role){
    const rows=profiles.map(p=>({ owner_id:me(), owner_email:(user&&user.email)||null, profile:p, shared_with_email:email, role }));
    const { error }=await sb.from("profile_shares").upsert(rows,{ onConflict:"owner_id,profile,shared_with_email" });
    if(error) return toast("แชร์ไม่สำเร็จ: "+error.message,"error");
    toast(`แชร์ ${profiles.length} โปรไฟล์ให้ ${email} แล้ว (${role==="editor"?"แก้ไขได้":"ดูอย่างเดียว"})`,"success");
    cloudLoadShares().then(()=>{ renderProfiles(); renderSettings(); });
  }
  function renameProfile(oldName){
    const newName=(prompt(`เปลี่ยนชื่อ "${oldName}" เป็น:`,oldName)||"").trim();
    if(!newName||newName===oldName) return;
    if(profiles.includes(newName)) return toast("มีชื่อนี้อยู่แล้ว");
    profiles=profiles.map(p=>p===oldName?newName:p);
    entries.forEach(e=>{ if(profOf(e)===oldName && sameOwner(ownerOf(e),null)) e.profile=newName; });
    if(activeProfile===oldName && !activeOwner) activeProfile=newName;
    Store.saveProfiles(profiles); Store.saveActiveProfile(activeProfile);
    if(CLOUD){ cloudRenameProfile(oldName,newName); } else { Store.saveEntries(entries); }
    renderProfiles(); renderSettings(); render(); toast("เปลี่ยนชื่อแล้ว","success");
  }
  function deleteProfile(name){
    if(profiles.length<=1) return toast("ต้องมีอย่างน้อย 1 คน");
    const cnt=entries.filter(e=>profOf(e)===name && sameOwner(ownerOf(e),null)).length;
    const msg=cnt? `ลบ "${name}" และรายการทั้งหมด ${cnt} รายการของคนนี้?\nลบแล้วกู้คืนไม่ได้` : `ลบ "${name}" ใช่ไหม?`;
    if(!confirm(msg)) return;
    const ids=entries.filter(e=>profOf(e)===name && sameOwner(ownerOf(e),null)).map(e=>e.id);
    entries=entries.filter(e=>!(profOf(e)===name && sameOwner(ownerOf(e),null)));
    profiles=profiles.filter(p=>p!==name);
    if(activeProfile===name){ activeProfile=profiles[0]; activeOwner=null; activeRole="own"; }
    Store.saveProfiles(profiles); Store.saveActiveProfile(activeProfile);
    if(CLOUD){ cloudDeleteIds(ids); cloudDeleteProfileShares(name); } else { Store.saveEntries(entries); }
    renderProfiles(); renderSettings(); render(); toast(`ลบ "${name}" แล้ว`,"success");
  }
  async function cloudRenameProfile(oldName,newName){
    if(!sb) return; const meId=me();
    const { error }=await sb.from("transactions").update({profile:newName}).eq("profile",oldName).eq("user_id",meId);
    if(error) toast("เปลี่ยนชื่อบนคลาวด์ไม่สำเร็จ: "+error.message,"error");
    await sb.from("profile_shares").update({profile:newName}).eq("owner_id",meId).eq("profile",oldName);
    cloudLoadShares().then(()=>{ renderProfiles(); });
  }
  async function cloudDeleteProfileShares(name){
    if(!sb) return;
    await sb.from("profile_shares").delete().eq("owner_id",me()).eq("profile",name);
    cloudLoadShares().then(()=>{ renderProfiles(); });
  }
  async function cloudShare(profile,email,role){
    const { error }=await sb.from("profile_shares").upsert(
      [{ owner_id:me(), owner_email:(user&&user.email)||null, profile, shared_with_email:email, role }],
      { onConflict:"owner_id,profile,shared_with_email" });
    if(error) return toast("แชร์ไม่สำเร็จ: "+error.message,"error");
    toast(`แชร์ "${profile}" ให้ ${email} แล้ว (${role==="editor"?"แก้ไขได้":"ดูอย่างเดียว"})`,"success");
    cloudLoadShares().then(()=>{ renderProfiles(); renderSettings(); });
  }
  async function cloudRevoke(id){
    const { error }=await sb.from("profile_shares").delete().eq("id",id);
    if(error) return toast("ถอนสิทธิ์ไม่สำเร็จ: "+error.message,"error");
    toast("ถอนสิทธิ์แล้ว","success");
    cloudLoadShares().then(()=>{ renderProfiles(); renderSettings(); });
  }
  async function cloudLoadShares(){
    if(!CLOUD||!user){ myShares=[]; sharedToMe=[]; return; }
    const { data, error }=await sb.from("profile_shares").select("*");
    if(error){ myShares=[]; sharedToMe=[]; return; }
    const meId=me(), myEmail=(user.email||"").toLowerCase();
    myShares=(data||[]).filter(s=>s.owner_id===meId).map(s=>({id:s.id,profile:s.profile,shared_with_email:s.shared_with_email,role:s.role}));
    sharedToMe=(data||[]).filter(s=>s.owner_id!==meId && (s.shared_with_email||"").toLowerCase()===myEmail)
      .map(s=>({ownerId:s.owner_id,ownerEmail:s.owner_email,profile:s.profile,role:s.role}));
  }
  if($("settingsBtnMobile")) $("settingsBtnMobile").onclick=openSettings;
  if($("settingsClose")) $("settingsClose").onclick=()=>closeModal("settingsOverlay");
  if($("settingsDone")) $("settingsDone").onclick=()=>closeModal("settingsOverlay");
  if($("settingsAddProfile")) $("settingsAddProfile").onclick=()=>{ addProfile(); renderSettings(); };
  if($("shareAllBtn")) $("shareAllBtn").onclick=shareAllProfiles;

  /* ===== SIDEBAR NAV (scroll) + SOON + MOBILE DRAWER ===== */
  function setSidebar(open){
    const sb=$("sidebar"), bd=$("sidebarBackdrop");
    if(sb) sb.classList.toggle("-translate-x-full",!open);
    if(bd) bd.hidden=!open;
  }
  if($("menuBtn")) $("menuBtn").onclick=()=>setSidebar(true);
  if($("sidebarBackdrop")) $("sidebarBackdrop").onclick=()=>setSidebar(false);
  document.querySelectorAll("#sideNav .nav-item").forEach(b=>b.onclick=()=>{
    setSidebar(false);
    if(b.dataset.soon){ $("soonTitle").textContent=b.dataset.soon; showModal("soonOverlay"); return; }
    if(b.dataset.settings){ openSettings(); return; }
    document.querySelectorAll("#sideNav .nav-item").forEach(x=>x.classList.toggle("active",x===b));
    const el=document.querySelector(`[data-anchor="${b.dataset.scroll}"]`); if(el) el.scrollIntoView({behavior:"smooth",block:"start"});
  });
  $("soonOk").onclick=()=>closeModal("soonOverlay");

  /* ===== AUTH + EDITOR IDENTITY ===== */
  // ชื่อผู้แก้ไข: ใช้ชื่อจากบัญชี (Facebook) ถ้าล็อกอิน ไม่งั้นถามครั้งแรกแล้วจำไว้ในเครื่อง (โหมดในเครื่อง)
  function currentEditorName(){
    if(user) return user.name;
    let n=localStorage.getItem(USERNAME_KEY);
    if(!n){ n=(prompt("ระบุชื่อของคุณ (ใช้บันทึกว่าใครเป็นคนแก้ไข)","")||"").trim(); if(!n) n="ไม่ระบุชื่อ"; try{ localStorage.setItem(USERNAME_KEY,n); }catch{} }
    return n;
  }
  function avatarInitial(name){ return (String(name||"?").trim().charAt(0)||"?").toUpperCase(); }
  function renderUser(){
    const el=$("userArea");
    if(user){
      el.innerHTML=`<div class="flex items-center gap-2.5">
        <div class="w-10 h-10 rounded-2xl grid place-items-center bg-gradient-to-br from-primary to-primaryd text-white font-black">${escapeHtml(avatarInitial(user.name))}</div>
        <div class="leading-tight"><div class="text-sm font-extrabold max-w-[8rem] truncate">${escapeHtml(user.name)}</div><button id="authLogout" class="text-[.7rem] text-muted hover:text-expense">ออกจากระบบ</button></div></div>`;
      $("authLogout").onclick=logout;
    } else {
      el.innerHTML=`<button id="authLoginBtn" class="flex items-center gap-2 h-11 px-4 rounded-2xl bg-primary text-white font-extrabold text-[.82rem] shadow-soft transition hover:bg-primaryd">เข้าสู่ระบบ</button>`;
      $("authLoginBtn").onclick=login;
    }
  }

  /* ===== หน้าสมัคร/ล็อกอิน (อีเมล + รหัสผ่าน ผ่าน Supabase Auth) ===== */
  let authMode="login", authWired=false;
  function authShowMsg(text,kind){
    const el=$("authMsg"); if(!el) return;
    if(!text){ el.classList.add("hidden"); el.textContent=""; return; }
    el.textContent=text;
    el.className=`text-sm font-semibold px-1 ${kind==="ok"?"text-income":"text-expense"}`;
  }
  function setAuthMode(mode){
    authMode=mode; const isSignup=mode==="signup";
    const on="h-10 rounded-xl text-sm font-extrabold transition bg-white text-ink shadow-soft";
    const off="h-10 rounded-xl text-sm font-extrabold transition text-muted";
    if($("tabLogin"))  $("tabLogin").className = isSignup?off:on;
    if($("tabSignup")) $("tabSignup").className= isSignup?on:off;
    if($("nameRow"))   $("nameRow").classList.toggle("hidden",!isSignup);
    if($("authPass"))  $("authPass").autocomplete = isSignup?"new-password":"current-password";
    if($("authSubmit"))$("authSubmit").textContent = isSignup?"สมัครสมาชิก":"เข้าสู่ระบบ";
    if($("authSub"))   $("authSub").textContent = isSignup?"สร้างบัญชีใหม่เพื่อเก็บข้อมูลบนคลาวด์ ใช้ได้ทุกเครื่อง":"เข้าสู่ระบบเพื่อใช้ข้อมูลร่วมกันได้ทุกเครื่อง";
    authShowMsg("");
  }
  function authErrMsg(e){
    const m=(e&&e.message)||String(e);
    if(/Invalid login credentials/i.test(m)) return "อีเมลหรือรหัสผ่านไม่ถูกต้อง";
    if(/already registered|already been registered|User already/i.test(m)) return "อีเมลนี้สมัครไว้แล้ว ลองเข้าสู่ระบบแทน";
    if(/Email not confirmed/i.test(m)) return "ยังไม่ได้ยืนยันอีเมล โปรดตรวจสอบกล่องจดหมายก่อนเข้าสู่ระบบ";
    if(/Password should be|at least 6/i.test(m)) return "รหัสผ่านต้องอย่างน้อย 6 ตัวอักษร";
    if(/valid email|invalid format/i.test(m)) return "รูปแบบอีเมลไม่ถูกต้อง";
    return m;
  }
  async function onAuthSubmit(ev){
    ev.preventDefault();
    if(!CLOUD||!sb) return;
    const email=($("authEmail").value||"").trim();
    const pass=$("authPass").value||"";
    const name=($("authName").value||"").trim();
    const btn=$("authSubmit"), label=btn.textContent;
    btn.disabled=true; btn.textContent="กำลังดำเนินการ…"; authShowMsg("");
    try{
      if(authMode==="signup"){
        const { data, error }=await sb.auth.signUp({ email, password:pass, options:{ data:{ full_name:name||email.split("@")[0] } } });
        if(error) throw error;
        if(!data.session){ authShowMsg("สมัครสำเร็จ! ตรวจสอบอีเมลเพื่อยืนยัน แล้วกลับมาเข้าสู่ระบบ","ok"); setAuthMode("login"); }
        // ถ้ามี session กลับมา = เข้าสู่ระบบทันที (onAuthStateChange จะพาเข้าแอป)
      } else {
        const { error }=await sb.auth.signInWithPassword({ email, password:pass });
        if(error) throw error;
      }
    }catch(e){ authShowMsg(authErrMsg(e),"error"); }
    finally{ btn.disabled=false; btn.textContent=label; }
  }
  function wireAuthGate(){
    if(authWired) return;
    const form=$("authForm"); if(!form) return;
    authWired=true;
    if($("tabLogin"))  $("tabLogin").onclick =()=>setAuthMode("login");
    if($("tabSignup")) $("tabSignup").onclick=()=>setAuthMode("signup");
    form.onsubmit=onAuthSubmit;
    setAuthMode("login");
  }
  function renderGate(){ const g=$("authGate"); if(g){ wireAuthGate(); g.hidden=!(CLOUD && !user); } }
  function setUserFromSession(session){
    const u=session&&session.user;
    if(u){ const m=u.user_metadata||{}; user={ name:m.full_name||m.name||u.email||"ผู้ใช้", email:u.email||"", picture:m.avatar_url||m.picture||"", id:u.id }; }
    else user=null;
  }
  function login(){
    if(CLOUD){ renderGate(); }   // โหมดคลาวด์: แสดงหน้าสมัคร/ล็อกอิน
    else { const n=(prompt("ตั้งชื่อผู้ใช้ (โหมดในเครื่อง)","")||"").trim(); if(n){ user={ name:n, picture:"", id:null }; try{ localStorage.setItem(USERNAME_KEY,n); }catch{} renderUser(); } }
  }
  function logout(){
    if(CLOUD && sb){ sb.auth.signOut(); }
    user=null; myShares=[]; sharedToMe=[]; activeOwner=null; activeRole="own";
    if($("authPass")) $("authPass").value="";
    renderProfiles(); updateModeUI(); renderUser(); renderGate(); toast("ออกจากระบบแล้ว");
  }

  /* ===== CLOUD DATA (Supabase) ===== */
  function rowToEntry(r){ return { id:r.id, type:r.type, amount:Number(r.amount), category:r.category, note:r.note||"", profile:r.profile||DEFAULT_PROFILE, userId:r.user_id||null, date:r.date, time:r.time||"00:00", receipt:r.receipt||"", createdBy:r.created_by||null, editedBy:r.edited_by||null, createdAt:r.created_at, updatedAt:r.edited_at }; }
  function entryToRow(e){ return { id:e.id, type:e.type, amount:e.amount, category:e.category, note:e.note||"", profile:e.profile||DEFAULT_PROFILE, user_id:e.userId||me(), date:e.date, time:e.time||"00:00", receipt:e.receipt||"", created_by:e.createdBy||null, edited_by:e.editedBy||null, edited_at:e.editedBy?new Date().toISOString():null }; }
  async function cloudLoad(){
    if(!CLOUD||!user) return;
    await cloudLoadShares();
    const { data, error }=await sb.from("transactions").select("*").order("created_at",{ascending:false});
    if(error){ toast("โหลดข้อมูลไม่สำเร็จ: "+error.message,"error"); return; }
    entries=(data||[]).map(rowToEntry);
    mergeProfilesFromEntries();
    if(!activeOwner && !profiles.includes(activeProfile)) activeProfile=profiles[0];
    // ถ้าโปรไฟล์ที่เลือกอยู่ (ของฉัน) ไม่มีข้อมูลเลย แต่มีโปรไฟล์อื่นที่มีข้อมูล → เด้งไปอันที่มีข้อมูล
    if(!activeOwner && !activeEntries().length){
      const withData=profiles.find(p=>entries.some(e=>profOf(e)===p && sameOwner(ownerOf(e),null)));
      if(withData){ activeProfile=withData; Store.saveActiveProfile(activeProfile); }
    }
    // ถ้ากำลังดูสมุดที่ถูกแชร์ แต่สิทธิ์ถูกถอน → กลับมาสมุดของฉัน
    if(activeOwner && !sharedToMe.some(s=>s.ownerId===activeOwner&&s.profile===activeProfile)){ activeOwner=null; activeRole="own"; if(!profiles.includes(activeProfile)) activeProfile=profiles[0]; }
    renderProfiles(); updateModeUI(); render();
    if(!realtimeOn){ subscribeRealtime(); realtimeOn=true; }
  }
  function subscribeRealtime(){
    try{
      sb.channel("tx").on("postgres_changes",{event:"*",schema:"public",table:"transactions"},()=>cloudLoad()).subscribe();
      sb.channel("shares").on("postgres_changes",{event:"*",schema:"public",table:"profile_shares"},()=>cloudLoad()).subscribe();
    }catch(e){}
  }
  async function cloudInsert(e){ const { error }=await sb.from("transactions").insert(entryToRow(e)); if(error) toast("บันทึกขึ้นคลาวด์ไม่สำเร็จ: "+error.message,"error"); }
  async function cloudUpdate(e){ const { error }=await sb.from("transactions").update(entryToRow(e)).eq("id",e.id); if(error) toast("อัปเดตไม่สำเร็จ: "+error.message,"error"); }
  async function cloudDelete(id){ const { error }=await sb.from("transactions").delete().eq("id",id); if(error) toast("ลบไม่สำเร็จ: "+error.message,"error"); }
  async function cloudDeleteToday(){ const { error }=await sb.from("transactions").delete().eq("date",todayKey()); if(error) toast("ลบไม่สำเร็จ: "+error.message,"error"); }
  async function cloudDeleteIds(ids){ if(!ids||!ids.length) return; const { error }=await sb.from("transactions").delete().in("id",ids); if(error) toast("ลบไม่สำเร็จ: "+error.message,"error"); }

  async function initAuth(){
    if(CLOUD){
      entries=[]; // โหมดคลาวด์: เริ่มจากว่าง แล้วโหลดจากเซิร์ฟเวอร์หลังล็อกอิน
      sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY);
      const { data:{ session } }=await sb.auth.getSession();
      setUserFromSession(session);
      sb.auth.onAuthStateChange((_e,sess)=>{ setUserFromSession(sess); renderUser(); renderGate(); if(user) cloudLoad(); });
      renderUser(); renderGate(); render();
      if(user) cloudLoad();
    } else {
      const n=localStorage.getItem(USERNAME_KEY); if(n) user={ name:n, picture:"", id:null };
      renderUser(); renderGate();
    }
  }

  /* ===== INIT ===== */
  if(!Store.enabled && !CLOUD) handleSaveResult("disabled");
  initAuth();
  // ย้ายรายการเดิม (ก่อนมีระบบโปรไฟล์) ให้เป็นของคนแรก = "ตัวเอง"
  let _migrated=false;
  entries.forEach(e=>{ if(!e.profile){ e.profile=DEFAULT_PROFILE; _migrated=true; } });
  if(_migrated && !CLOUD) Store.saveEntries(entries);
  mergeProfilesFromEntries();
  if(!profiles.includes(activeProfile)) activeProfile=profiles[0];
  Store.saveActiveProfile(activeProfile);
  renderProfiles(); updateModeUI();
  entries.forEach(e=>{ if(e.type==="expense") colorFor(e.category); });
  setNow(); populateSelect($("category"),selectedType); render();
  let lastDay=todayKey();
  setInterval(()=>{ $("todayLabel").textContent=new Date().toLocaleDateString("th-TH",{day:"numeric",month:"short",year:"numeric"}); const now=todayKey(); if(now!==lastDay) lastDay=now; render(); },60000);
})();
