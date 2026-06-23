/* MoneyFlow Mobile — bottom-nav wiring. Data/logic in shared/core.js (MF). */
(() => {
  "use strict";
  MF.mountChrome();
  MF.buildAddForm(document.querySelector("[data-addform]").parentElement, {
    onSaved(){ switchView("dashboard"); } // กลับหน้าภาพรวมหลังบันทึก
  });

  const $ = id => document.getElementById(id);
  const chartEls = { donut:$("donut"), caption:$("donutCaption"), total:$("donutTotal"), legend:$("legend") };

  const viewMeta = {
    dashboard:    { k:"แดชบอร์ดการเงิน", t:"สวัสดีครับ 👋" },
    transactions: { k:"รายการเงิน",      t:"รายการล่าสุด" },
    add:          { k:"เพิ่มรายการ",      t:"บันทึกรายการ" }
  };

  function switchView(view){
    document.body.setAttribute("data-view", view);
    document.querySelectorAll(".view").forEach(s => s.hidden = s.dataset.view !== view);
    const m = viewMeta[view] || viewMeta.dashboard;
    $("viewKicker").textContent = m.k;
    $("viewTitle").textContent = m.t;
    document.querySelectorAll("#bottomNav [data-view]").forEach(b => b.classList.toggle("active", b.dataset.view===view));
    window.scrollTo({top:0, behavior:"smooth"});
    if(view==="add") setTimeout(()=>{ const a=document.getElementById("amount"); if(a) a.focus(); }, 120);
  }

  function render(){
    MF.renderSummary($("summaryGrid"));
    MF.renderChart(chartEls);
    MF.renderTransactions($("transactionsList"));
  }
  MF.onChange(render);

  document.querySelectorAll("#bottomNav button").forEach(b => b.onclick = () => {
    if(b.dataset.soon) return MF.comingSoon(b.dataset.soon);
    switchView(b.dataset.view);
  });

  $("rangeTabs").querySelectorAll(".tab").forEach(t => t.onclick = () => {
    $("rangeTabs").querySelectorAll(".tab").forEach(x => x.classList.toggle("active", x===t));
    MF.setRange(t.dataset.range);
  });
  $("filterChips").querySelectorAll(".chip").forEach(c => c.onclick = () => {
    $("filterChips").querySelectorAll(".chip").forEach(x => x.classList.toggle("active", x===c));
    MF.setFilter(c.dataset.filter);
  });
  $("searchInput").addEventListener("input", e => MF.setSearch(e.target.value));
  $("exportBtn").onclick = () => MF.exportCSV();
  $("clearTodayBtn").onclick = () => window.__mfClearToday();

  const setLabel = () => $("todayLabel").textContent = new Date().toLocaleDateString("th-TH",{day:"numeric",month:"short",year:"numeric"});
  setLabel();
  MF.startClock(setLabel);

  render();
})();
