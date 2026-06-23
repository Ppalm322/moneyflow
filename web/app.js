/* MoneyFlow Web (desktop) — view wiring. All data/logic lives in shared/core.js (MF). */
(() => {
  "use strict";
  MF.mountChrome();
  MF.buildAddForm(document.querySelector("[data-addform]").parentElement);

  const $ = id => document.getElementById(id);
  const chartEls = { donut:$("donut"), caption:$("donutCaption"), total:$("donutTotal"), legend:$("legend") };

  function render(){
    MF.renderSummary($("summaryGrid"));
    MF.renderChart(chartEls);
    MF.renderTransactions($("transactionsList"));
  }
  MF.onChange(render);

  // range tabs
  $("rangeTabs").querySelectorAll(".tab").forEach(t => t.onclick = () => {
    $("rangeTabs").querySelectorAll(".tab").forEach(x => x.classList.toggle("active", x===t));
    MF.setRange(t.dataset.range);
  });
  // filter chips
  $("filterChips").querySelectorAll(".chip").forEach(c => c.onclick = () => {
    $("filterChips").querySelectorAll(".chip").forEach(x => x.classList.toggle("active", x===c));
    MF.setFilter(c.dataset.filter);
  });
  // search
  $("searchInput").addEventListener("input", e => MF.setSearch(e.target.value));
  // toolbar
  $("exportBtn").onclick = () => MF.exportCSV();
  $("clearTodayBtn").onclick = () => MF.askDelete && window.__mfClearToday();

  // sidebar nav = smooth scroll to anchors
  document.querySelectorAll("#sideNav .nav-item").forEach(b => b.onclick = () => {
    if(b.dataset.soon) return MF.comingSoon(b.dataset.soon);
    document.querySelectorAll("#sideNav .nav-item").forEach(x => x.classList.toggle("active", x===b));
    const el = document.querySelector(`[data-anchor="${b.dataset.scroll}"]`);
    if(el) el.scrollIntoView({behavior:"smooth", block:"start"});
  });

  // clock / day label
  const setLabel = () => $("todayLabel").textContent = new Date().toLocaleDateString("th-TH",{day:"numeric",month:"short",year:"numeric"});
  setLabel();
  MF.startClock(setLabel);

  render();
})();
