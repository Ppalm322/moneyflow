(() => {
  "use strict";

  /* ============================================================
   * MoneyFlow — บัญชีรายรับรายจ่าย
   * โครงสร้าง: Data Layer (localStorage วันนี้, พร้อมเปลี่ยนเป็น API)
   *            + UI Layer
   * คงชื่อ STORAGE_KEY เดิมเพื่อความเข้ากันได้ของข้อมูลเก่า
   * ============================================================ */

  const STORAGE_KEY  = "daily-money-ledger-v1";   // ห้ามเปลี่ยน — ข้อมูลเดิมของผู้ใช้
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

  /* ============================================================
   * DATA LAYER — แยกชัดเจน พร้อมสลับไปใช้ API ในอนาคต
   * (เปลี่ยนเฉพาะภายในฟังก์ชันเหล่านี้ให้ยิง fetch ได้เลย)
   * ============================================================ */
  const Store = {
    enabled: true,

    _read(key, fallback){
      try{ const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }
      catch{ return fallback; }
    },
    _write(key, value){
      try{ localStorage.setItem(key, JSON.stringify(value)); return true; }
      catch{ return false; }
    },

    getEntries(){
      try{
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
      }catch{
        this.enabled = false;
        return [];
      }
    },
    // บันทึกทั้งชุด — มี fallback ตัดรูปสลิปออกเมื่อพื้นที่เต็ม
    saveEntries(list){
      if(!this.enabled) return "disabled";
      try{
        localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
        return "ok";
      }catch{
        try{
          const stripped = list.map(e => ({...e, receipt:""}));
          localStorage.setItem(STORAGE_KEY, JSON.stringify(stripped));
          // อัปเดตอ้างอิงในหน่วยความจำให้ตรงกับที่เก็บจริง
          list.forEach((e,i)=>{ e.receipt = stripped[i].receipt; });
          return "stripped";
        }catch{
          this.enabled = false;
          return "fail";
        }
      }
    },

    getCustomCats(){
      const c = this._read(CUSTOMCAT_KEY, null);
      if(c && c.expense && c.income) return c;
      return { expense:[], income:[] };
    },
    saveCustomCats(c){ this._write(CUSTOMCAT_KEY, c); },

    getColorMap(){ return this._read(COLOR_KEY, {}); },
    saveColorMap(m){ this._write(COLOR_KEY, m); }
  };

  /* ===== state ===== */
  let entries      = Store.getEntries();
  let customCats   = Store.getCustomCats();
  let colorMap     = Store.getColorMap();
  let selectedType = "expense";
  let chartRange   = "today";
  let activeFilter = "all";
  let searchTerm   = "";
  let formReceipt  = "";   // สลิปในฟอร์มเพิ่ม
  let editReceipt  = "";   // สลิปใน modal แก้ไข
  let editType     = "expense";
  let isSubmitting = false;
  let currentView  = "dashboard";

  const $ = id => document.getElementById(id);
  const fmt      = n => new Intl.NumberFormat("th-TH",{style:"currency",currency:"THB",minimumFractionDigits:2}).format(Number(n)||0);
  const shortFmt = n => new Intl.NumberFormat("th-TH",{maximumFractionDigits:0}).format(Number(n)||0);

  function localDateKey(d = new Date()){
    const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,"0"), day=String(d.getDate()).padStart(2,"0");
    return `${y}-${m}-${day}`;
  }
  const todayKey = () => localDateKey(new Date());

  function escapeHtml(s=""){
    return String(s).replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[ch]));
  }

  /* ===== หมวดหมู่ + สีคงที่ ===== */
  function catsFor(type){
    const base   = type === "expense" ? defaultExpenseCats : defaultIncomeCats;
    const custom = (customCats[type] || []).filter(c => !base.includes(c));
    // ใส่หมวด "อื่น ๆ" ไว้ท้ายสุดเสมอ
    const withoutOther = base.filter(c => c !== "อื่น ๆ");
    return [...withoutOther, ...custom, "อื่น ๆ"];
  }

  // สีของหมวดต้องคงที่ ไม่เปลี่ยนตามลำดับ/การโหลด — เก็บลง localStorage
  function colorFor(category){
    if(colorMap[category]) return colorMap[category];
    const used = new Set(Object.values(colorMap));
    let color = palette.find(c => !used.has(c));
    if(!color) color = palette[Object.keys(colorMap).length % palette.length];
    colorMap[category] = color;
    Store.saveColorMap(colorMap);
    return color;
  }

  function iconFor(category, type){
    return categoryIcons[category] || (type === "expense" ? "↗" : "↙");
  }

  function populateSelect(selectEl, type, selected){
    const list = catsFor(type);
    let html = list.map(c => `<option value="${escapeHtml(c)}"${c===selected?" selected":""}>${iconFor(c,type)}  ${escapeHtml(c)}</option>`).join("");
    if(selectEl.id === "category"){
      html += `<option value="__add__">➕  เพิ่มหมวดหมู่ใหม่…</option>`;
    }
    selectEl.innerHTML = html;
  }

  /* ============================================================
   * RENDER
   * ============================================================ */
  function render(){
    const today = todayKey();
    const todayEntries = entries.filter(e => e.date === today);
    const incomeToday  = sum(todayEntries.filter(e => e.type==="income"));
    const expenseToday = sum(todayEntries.filter(e => e.type==="expense"));
    const incomeAll    = sum(entries.filter(e => e.type==="income"));
    const expenseAll   = sum(entries.filter(e => e.type==="expense"));

    $("incomeToday").textContent  = fmt(incomeToday);
    $("expenseToday").textContent = fmt(expenseToday);
    $("balanceAll").textContent   = fmt(incomeAll - expenseAll);
    $("todayCount").textContent   = shortFmt(todayEntries.length);

    renderChart();
    renderTransactions();
  }
  const sum = list => list.reduce((s,e)=>s+Number(e.amount||0),0);

  function renderChart(){
    const base = chartRange === "today" ? entries.filter(e => e.date === todayKey()) : entries;
    const grouped = {};
    base.filter(e => e.type==="expense").forEach(e => {
      grouped[e.category] = (grouped[e.category]||0) + Number(e.amount);
    });

    const items = Object.entries(grouped).sort((a,b)=>b[1]-a[1]);
    const total = items.reduce((s,[,v])=>s+v,0);

    $("donutCaption").textContent = chartRange === "today" ? "ค่าใช้จ่ายวันนี้" : "ค่าใช้จ่ายทั้งหมด";
    $("donutTotal").textContent   = "฿" + shortFmt(total);

    const donut = $("donut");
    const legend = $("legend");

    if(!total){
      donut.innerHTML = `<circle class="track" cx="21" cy="21" r="15.915"></circle>`;
      legend.innerHTML = `<div class="empty-state">
        <div class="empty-icon">◔</div>
        <strong>ยังไม่มีรายการค่าใช้จ่าย</strong>
        <span>เพิ่มรายการ${chartRange==="today"?"วันนี้":""}เพื่อดูกราฟ</span>
      </div>`;
      return;
    }

    // วาด SVG segments (วงกลม r=15.915 → เส้นรอบวง = 100)
    let cumulative = 0;
    const segHtml = items.map(([name,value]) => {
      const pct  = value/total*100;
      const dash = Math.max(pct - 0.8, 0.6);          // เว้นช่องว่างเล็กน้อยระหว่างชิ้น
      const seg  = `<circle class="seg" cx="21" cy="21" r="15.915"
        stroke="${colorFor(name)}"
        stroke-dasharray="0 100"
        data-dash="${dash} ${100-dash}"
        stroke-dashoffset="${-cumulative}"></circle>`;
      cumulative += pct;
      return seg;
    }).join("");
    donut.innerHTML = `<circle class="track" cx="21" cy="21" r="15.915"></circle>` + segHtml;

    // อนิเมชันตอนข้อมูลเปลี่ยน
    requestAnimationFrame(()=>{
      donut.querySelectorAll(".seg").forEach(s=>{ s.setAttribute("stroke-dasharray", s.dataset.dash); });
    });

    legend.innerHTML = items.map(([name,value]) => {
      const pct = value/total*100;
      return `<div class="legend-row">
        <span class="dot" style="background:${colorFor(name)}"></span>
        <span class="legend-name">${iconFor(name,"expense")} ${escapeHtml(name)}</span>
        <span class="legend-value"><strong>${fmt(value)}</strong><small>${pct.toFixed(1)}%</small></span>
      </div>`;
    }).join("");
  }

  function passesFilter(e){
    const today = todayKey();
    switch(activeFilter){
      case "today":   if(e.date !== today) return false; break;
      case "7d":{
        const d = new Date(); d.setDate(d.getDate()-6);
        if(e.date < localDateKey(d)) return false; break;
      }
      case "month":{
        const now = new Date();
        const prefix = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
        if(!String(e.date).startsWith(prefix)) return false; break;
      }
      case "income":  if(e.type !== "income")  return false; break;
      case "expense": if(e.type !== "expense") return false; break;
    }
    if(searchTerm){
      const hay = `${e.note||""} ${e.category||""}`.toLowerCase();
      if(!hay.includes(searchTerm)) return false;
    }
    return true;
  }

  function renderTransactions(){
    const container = $("transactionsList");
    const sorted = [...entries]
      .sort((a,b)=>`${b.date}T${b.time}`.localeCompare(`${a.date}T${a.time}`))
      .filter(passesFilter)
      .slice(0,200);

    if(!sorted.length){
      const msg = (searchTerm || activeFilter!=="all")
        ? "ไม่พบรายการที่ตรงกับเงื่อนไข"
        : "ยังไม่มีรายการ ลองเพิ่มรายการแรกของคุณ";
      container.innerHTML = `<div class="empty-transactions">${msg}</div>`;
      return;
    }

    container.innerHTML = sorted.map(e => {
      const dateText = new Date(`${e.date}T00:00:00`).toLocaleDateString("th-TH",{day:"numeric",month:"short",year:"2-digit"});
      const icon = iconFor(e.category, e.type);
      const sign = e.type==="expense" ? "−" : "+";
      const slip = e.receipt ? `<span class="tx-slip">📎 สลิป</span>` : `<span style="color:#c3c9d4">ไม่มีสลิป</span>`;
      return `<div class="tx ${e.type}">
        <div class="tx-icon">${icon}</div>
        <div class="tx-main">
          <strong>${escapeHtml(e.note||e.category)}</strong>
          <div class="tx-sub">
            <span>${escapeHtml(e.category)}</span><span>·</span>
            <span>${dateText} ${escapeHtml(e.time||"")}</span><span>·</span>
            ${slip}
          </div>
        </div>
        <div class="tx-amount">${sign}${fmt(e.amount)}</div>
        <div class="tx-actions">
          <button class="tx-btn edit" data-edit="${e.id}" aria-label="แก้ไข">✎</button>
          <button class="tx-btn del" data-del="${e.id}" aria-label="ลบ">🗑</button>
        </div>
      </div>`;
    }).join("");

    container.querySelectorAll("[data-edit]").forEach(b => b.onclick = () => openEdit(b.dataset.edit));
    container.querySelectorAll("[data-del]").forEach(b => b.onclick = () => askDelete(b.dataset.del));
    container.querySelectorAll(".tx-slip").forEach(s => {
      const tx = s.closest(".tx");
      const id = tx.querySelector("[data-edit]").dataset.edit;
      const e  = entries.find(x => x.id === id);
      if(e && e.receipt){ s.style.cursor="zoom-in"; s.onclick=()=>openLightbox(e.receipt); }
    });
  }

  /* ============================================================
   * TOAST
   * ============================================================ */
  function toast(message, kind=""){
    const el = $("toast");
    el.className = "toast show" + (kind ? " "+kind : "");
    el.innerHTML = (kind==="success"?"✓ ":kind==="error"?"⚠ ":"") + escapeHtml(message);
    clearTimeout(window.__toastTimer);
    window.__toastTimer = setTimeout(()=>el.classList.remove("show"), 2400);
  }

  /* ============================================================
   * IMAGE COMPRESSION
   * ============================================================ */
  function compressImage(file){
    return new Promise((resolve,reject)=>{
      const img = new Image();
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = () => { img.src = reader.result; };
      img.onerror = reject;
      img.onload = () => {
        try{
          const max = 900;
          const scale = Math.min(1, max/Math.max(img.width,img.height));
          const canvas = document.createElement("canvas");
          canvas.width  = Math.round(img.width*scale);
          canvas.height = Math.round(img.height*scale);
          canvas.getContext("2d").drawImage(img,0,0,canvas.width,canvas.height);
          resolve(canvas.toDataURL("image/jpeg",.72));
        }catch(err){ reject(err); }
      };
      reader.readAsDataURL(file);
    });
  }

  // ประเมินพื้นที่ localStorage แบบคร่าว ๆ แล้วแจ้งเตือนเมื่อใกล้เต็ม (~5MB)
  function checkStorageHealth(){
    try{
      let bytes = 0;
      for(const k in localStorage){ if(Object.prototype.hasOwnProperty.call(localStorage,k)) bytes += (localStorage[k].length+k.length)*2; }
      if(bytes > 4_300_000) toast("พื้นที่จัดเก็บใกล้เต็ม แนะนำส่งออก CSV แล้วลบรายการเก่า", "error");
    }catch{}
  }

  /* ============================================================
   * ADD FORM
   * ============================================================ */
  function setNow(){
    const now = new Date();
    $("entryDate").value = localDateKey(now);
    $("entryTime").value = `${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`;
    $("todayLabel").textContent = now.toLocaleDateString("th-TH",{day:"numeric",month:"short",year:"numeric"});
  }

  function clearFormReceipt(){
    formReceipt = "";
    $("receipt").value = "";
    $("receiptBox").hidden = true;
    $("receiptPreview").removeAttribute("src");
  }

  function resetForm(){
    $("entryForm").reset();
    selectedType = "expense";
    document.querySelectorAll("#entryForm .type-btn").forEach(b=>b.classList.toggle("active", b.dataset.type==="expense"));
    clearFormReceipt();
    $("customCatRow").hidden = true;
    $("amount").classList.remove("invalid");
    $("amountError").textContent = "";
    populateSelect($("category"), selectedType);
    setNow();
  }

  function parseAmount(v){
    const n = Number(String(v).replace(/[, ]/g,""));
    return Number.isFinite(n) ? n : NaN;
  }

  // type buttons (ฟอร์มเพิ่ม)
  document.querySelectorAll("#entryForm .type-btn").forEach(btn => {
    btn.onclick = () => {
      selectedType = btn.dataset.type;
      document.querySelectorAll("#entryForm .type-btn").forEach(b=>b.classList.toggle("active", b===btn));
      populateSelect($("category"), selectedType);
      $("customCatRow").hidden = true;
    };
  });

  // chart range tabs
  document.querySelectorAll(".tab").forEach(btn => {
    btn.onclick = () => {
      chartRange = btn.dataset.range;
      document.querySelectorAll(".tab").forEach(b=>b.classList.toggle("active", b===btn));
      renderChart();
    };
  });

  // custom category — เปิดช่องเมื่อเลือก "เพิ่มหมวดหมู่ใหม่"
  $("category").addEventListener("change", e => {
    if(e.target.value === "__add__"){
      $("customCatRow").hidden = false;
      $("customCat").focus();
      // ย้อน selection กลับไปตัวแรกชั่วคราว
      e.target.selectedIndex = 0;
    }else{
      $("customCatRow").hidden = true;
    }
  });

  $("customCatAdd").onclick = () => {
    const name = $("customCat").value.trim();
    if(!name) return toast("กรุณาพิมพ์ชื่อหมวดหมู่");
    const list = catsFor(selectedType);
    if(list.includes(name)){
      $("category").value = name;
      $("customCatRow").hidden = true;
      $("customCat").value = "";
      return toast("มีหมวดหมู่นี้อยู่แล้ว");
    }
    customCats[selectedType] = [...(customCats[selectedType]||[]), name];
    Store.saveCustomCats(customCats);
    colorFor(name); // จองสีให้คงที่
    populateSelect($("category"), selectedType, name);
    $("customCatRow").hidden = true;
    $("customCat").value = "";
    toast("เพิ่มหมวดหมู่แล้ว", "success");
  };

  // receipt (ฟอร์มเพิ่ม)
  $("receipt").addEventListener("change", async e => {
    const file = e.target.files[0];
    if(!file) return;
    try{
      formReceipt = await compressImage(file);
      $("receiptPreview").src = formReceipt;
      $("receiptBox").hidden = false;
    }catch{
      toast("อ่านรูปไม่สำเร็จ ลองรูปอื่น", "error");
      clearFormReceipt();
    }
  });
  $("receiptRemove").onclick = clearFormReceipt;
  $("receiptPreview").onclick = () => { if(formReceipt) openLightbox(formReceipt); };

  // submit
  $("entryForm").addEventListener("submit", e => {
    e.preventDefault();
    if(isSubmitting) return;

    const amount = parseAmount($("amount").value);
    if(!amount || isNaN(amount) || amount <= 0){
      $("amount").classList.add("invalid");
      $("amountError").textContent = "กรุณากรอกจำนวนเงินมากกว่า 0";
      $("amount").focus();
      return;
    }
    let category = $("category").value;
    if(category === "__add__" || !category) category = catsFor(selectedType)[0];

    isSubmitting = true;
    const btn = $("submitBtn");
    btn.disabled = true;

    const entry = {
      id: (window.crypto && typeof window.crypto.randomUUID==="function") ? window.crypto.randomUUID() : Date.now()+"-"+Math.random(),
      type: selectedType,
      amount,
      category,
      note: $("note").value.trim(),
      date: $("entryDate").value || todayKey(),
      time: $("entryTime").value || "00:00",
      receipt: formReceipt,
      createdAt: new Date().toISOString()
    };
    colorFor(category);
    entries.push(entry);

    const result = Store.saveEntries(entries);
    handleSaveResult(result);

    resetForm();
    render();
    if(result === "ok" || result === "stripped"){
      toast(result === "stripped" ? "บันทึกแล้ว (พื้นที่รูปเต็ม จึงไม่เก็บสลิป)" : "บันทึกรายการเรียบร้อย", "success");
      checkStorageHealth();
    }

    setTimeout(()=>{ isSubmitting = false; btn.disabled = false; }, 350);

    // บนมือถือ กลับไปหน้าภาพรวมให้เห็นผลทันที
    if(window.matchMedia("(max-width:860px)").matches) switchView("dashboard");
  });

  function handleSaveResult(result){
    if(result === "fail" || result === "disabled"){
      $("storageNotice").innerHTML = "<span>⚠</span> โหมดชั่วคราว: รายการแสดงได้ แต่จะหายเมื่อปิดหน้า — เปิดผ่าน Safari/Chrome หรืออัปขึ้นโฮสติ้ง";
      $("storageNotice").style.color = "#b54708";
      toast("เบราว์เซอร์ไม่อนุญาตให้เก็บข้อมูลถาวร", "error");
    }
  }

  /* ============================================================
   * EDIT MODAL
   * ============================================================ */
  function openEdit(id){
    const e = entries.find(x => x.id === id);
    if(!e) return;
    editType = e.type;
    editReceipt = e.receipt || "";

    $("editId").value = id;
    document.querySelectorAll("#editForm .type-btn").forEach(b=>b.classList.toggle("active", b.dataset.type===editType));
    $("editAmount").value = e.amount;
    $("editAmount").classList.remove("invalid");
    $("editAmountError").textContent = "";
    populateSelect($("editCategory"), editType, e.category);
    $("editNote").value = e.note || "";
    $("editDate").value = e.date || todayKey();
    $("editTime").value = e.time || "00:00";

    if(editReceipt){ $("editReceiptPreview").src = editReceipt; $("editReceiptBox").hidden = false; }
    else { $("editReceiptBox").hidden = true; $("editReceiptPreview").removeAttribute("src"); }
    $("editReceipt").value = "";

    showModal("editOverlay");
  }

  document.querySelectorAll("#editForm .type-btn").forEach(btn => {
    btn.onclick = () => {
      editType = btn.dataset.type;
      document.querySelectorAll("#editForm .type-btn").forEach(b=>b.classList.toggle("active", b===btn));
      populateSelect($("editCategory"), editType, $("editCategory").value);
    };
  });

  $("editReceipt").addEventListener("change", async e => {
    const file = e.target.files[0];
    if(!file) return;
    try{
      editReceipt = await compressImage(file);
      $("editReceiptPreview").src = editReceipt;
      $("editReceiptBox").hidden = false;
    }catch{ toast("อ่านรูปไม่สำเร็จ", "error"); }
  });
  $("editReceiptRemove").onclick = () => {
    editReceipt = "";
    $("editReceipt").value = "";
    $("editReceiptBox").hidden = true;
    $("editReceiptPreview").removeAttribute("src");
  };
  $("editReceiptPreview").onclick = () => { if(editReceipt) openLightbox(editReceipt); };

  $("editSave").onclick = () => {
    const id = $("editId").value;
    const idx = entries.findIndex(x => x.id === id);
    if(idx < 0) return;
    const amount = parseAmount($("editAmount").value);
    if(!amount || isNaN(amount) || amount <= 0){
      $("editAmount").classList.add("invalid");
      $("editAmountError").textContent = "กรุณากรอกจำนวนเงินมากกว่า 0";
      return;
    }
    let category = $("editCategory").value;
    if(category === "__add__" || !category) category = catsFor(editType)[0];
    colorFor(category);

    entries[idx] = {
      ...entries[idx],
      type: editType,
      amount,
      category,
      note: $("editNote").value.trim(),
      date: $("editDate").value || todayKey(),
      time: $("editTime").value || "00:00",
      receipt: editReceipt,
      updatedAt: new Date().toISOString()
    };
    const result = Store.saveEntries(entries);
    handleSaveResult(result);
    closeModal("editOverlay");
    render();
    toast("แก้ไขรายการแล้ว", "success");
  };

  $("editClose").onclick = $("editCancel").onclick = () => closeModal("editOverlay");

  /* ============================================================
   * DELETE (confirm modal)
   * ============================================================ */
  let pendingDelete = null;

  function askDelete(id){
    const e = entries.find(x => x.id === id);
    if(!e) return;
    pendingDelete = { mode:"one", id };
    $("confirmTitle").textContent = "ลบรายการนี้?";
    $("confirmText").innerHTML = `${escapeHtml(e.note||e.category)} · <strong>${fmt(e.amount)}</strong><br>การลบไม่สามารถย้อนกลับได้`;
    $("confirmOk").textContent = "ลบรายการ";
    showModal("confirmOverlay");
  }

  $("clearTodayBtn").onclick = () => {
    const count = entries.filter(e => e.date === todayKey()).length;
    if(!count) return toast("วันนี้ยังไม่มีรายการ");
    pendingDelete = { mode:"today" };
    $("confirmTitle").textContent = "ลบรายการวันนี้ทั้งหมด?";
    $("confirmText").innerHTML = `มีทั้งหมด <strong>${count}</strong> รายการในวันนี้<br>ประวัติและยอดสะสมของวันอื่นจะไม่ถูกลบ`;
    $("confirmOk").textContent = "ลบทั้งหมด";
    showModal("confirmOverlay");
  };

  $("confirmOk").onclick = () => {
    if(!pendingDelete) return;
    if(pendingDelete.mode === "one"){
      entries = entries.filter(e => e.id !== pendingDelete.id);
      Store.saveEntries(entries); render(); toast("ลบรายการแล้ว", "success");
    }else if(pendingDelete.mode === "today"){
      entries = entries.filter(e => e.date !== todayKey());
      Store.saveEntries(entries); render(); toast("ลบรายการวันนี้แล้ว", "success");
    }
    pendingDelete = null;
    closeModal("confirmOverlay");
  };
  $("confirmCancel").onclick = () => { pendingDelete = null; closeModal("confirmOverlay"); };

  /* ============================================================
   * EXPORT CSV
   * ============================================================ */
  $("exportBtn").onclick = () => {
    if(!entries.length) return toast("ยังไม่มีข้อมูลให้ส่งออก");
    const rows = [["วันที่","เวลา","ประเภท","หมวดหมู่","รายละเอียด","จำนวนเงิน"],
      ...entries.map(e => [e.date, e.time, e.type==="income"?"รายรับ":"รายจ่าย", e.category, e.note, e.amount])];
    const csv = "﻿" + rows.map(r => r.map(v => `"${String(v??"").replace(/"/g,'""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));
    a.download = `บัญชีรายรับรายจ่าย-${todayKey()}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast("ส่งออก CSV แล้ว", "success");
  };

  /* ============================================================
   * SEARCH + FILTER
   * ============================================================ */
  $("searchInput").addEventListener("input", e => {
    searchTerm = e.target.value.trim().toLowerCase();
    renderTransactions();
  });
  document.querySelectorAll("#filterChips .chip").forEach(chip => {
    chip.onclick = () => {
      activeFilter = chip.dataset.filter;
      document.querySelectorAll("#filterChips .chip").forEach(c=>c.classList.toggle("active", c===chip));
      renderTransactions();
    };
  });

  /* ============================================================
   * LIGHTBOX
   * ============================================================ */
  function openLightbox(src){
    $("lightboxImg").src = src;
    $("lightbox").hidden = false;
  }
  $("lightboxClose").onclick = () => { $("lightbox").hidden = true; $("lightboxImg").removeAttribute("src"); };
  $("lightbox").addEventListener("click", e => { if(e.target.id==="lightbox") $("lightboxClose").click(); });

  /* ============================================================
   * MODAL helpers
   * ============================================================ */
  function showModal(id){ $(id).hidden = false; document.body.style.overflow="hidden"; }
  function closeModal(id){ $(id).hidden = true; document.body.style.overflow=""; }
  document.querySelectorAll(".modal-overlay").forEach(ov => {
    ov.addEventListener("click", e => { if(e.target === ov){ ov.hidden = true; document.body.style.overflow=""; pendingDelete=null; } });
  });
  document.addEventListener("keydown", e => {
    if(e.key === "Escape"){
      document.querySelectorAll(".modal-overlay").forEach(ov => { if(!ov.hidden){ ov.hidden=true; document.body.style.overflow=""; } });
      if(!$("lightbox").hidden) $("lightboxClose").click();
    }
  });

  /* ============================================================
   * VIEW SWITCHING (sidebar + bottom nav)
   * ============================================================ */
  const viewMeta = {
    dashboard:    { title:"สวัสดีครับ 👋", sub:"ติดตามรายรับ รายจ่าย และภาพรวมเงินของคุณ" },
    transactions: { title:"รายการเงิน",     sub:"ตรวจสอบ ค้นหา และกรองรายการย้อนหลัง" },
    add:          { title:"เพิ่มรายการ",     sub:"บันทึกรายรับหรือรายจ่ายใหม่" }
  };

  function switchView(view){
    currentView = view;
    document.body.setAttribute("data-view", view);
    const meta = viewMeta[view] || viewMeta.dashboard;
    $("viewTitle").textContent = meta.title;
    $("viewSubtitle").textContent = meta.sub;
    document.querySelectorAll('#sideNav .nav-item').forEach(b=>b.classList.toggle("active", b.dataset.view===view));
    document.querySelectorAll('#bottomNav .bnav-item, #bottomNav .bnav-fab').forEach(b=>b.classList.toggle("active", b.dataset.view===view));
    window.scrollTo({top:0, behavior:"smooth"});
  }

  function handleNav(btn){
    const view = btn.dataset.view;
    if(btn.dataset.soon){
      $("soonTitle").textContent = view === "reports" ? "รายงาน" : "ตั้งค่า";
      showModal("soonOverlay");
      return;
    }
    switchView(view);
    if(view === "add" && window.matchMedia("(max-width:860px)").matches){
      setTimeout(()=>$("amount").focus(), 120);
    }
  }
  document.querySelectorAll('#sideNav .nav-item, #bottomNav button[data-view]').forEach(btn => {
    btn.onclick = () => handleNav(btn);
  });
  $("soonOk").onclick = () => closeModal("soonOverlay");

  /* ============================================================
   * INIT
   * ============================================================ */
  function init(){
    if(!Store.enabled){
      handleSaveResult("disabled");
    }
    // จองสีให้หมวดที่มีอยู่แล้ว เพื่อความคงที่
    entries.forEach(e => { if(e.type==="expense") colorFor(e.category); });

    setNow();
    populateSelect($("category"), selectedType);
    document.body.setAttribute("data-view","dashboard");
    render();

    // เปลี่ยนวันอัตโนมัติ: ยอดรายวันเริ่มนับใหม่ ประวัติ/ยอดสะสมคงเดิม
    let lastDay = todayKey();
    setInterval(()=>{
      $("todayLabel").textContent = new Date().toLocaleDateString("th-TH",{day:"numeric",month:"short",year:"numeric"});
      const now = todayKey();
      if(now !== lastDay){ lastDay = now; render(); }
      else { // อัปเดตยอดวันนี้เผื่อมีการแก้ไขข้ามแท็บ
        render();
      }
    }, 60000);
  }

  init();
})();
