/* MoneyFlow iPad — split-view wiring. Data/logic in shared/core.js (MF). */
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

  // segmented control switches master panes
  $("seg").querySelectorAll(".seg-btn").forEach(b => b.onclick = () => {
    $("seg").querySelectorAll(".seg-btn").forEach(x => x.classList.toggle("active", x===b));
    document.querySelectorAll(".master .pane").forEach(p => p.hidden = p.dataset.pane !== b.dataset.pane);
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
