(function () {
  "use strict";
  function boot() {
    var content = document.querySelector("main.content, .content");
    if (!content || content.classList.contains("canvas-page") || document.querySelector(".dg-reading-progress")) return;
    var config = window.DG_READING_PROGRESS || {};
    var bar = document.createElement("div");
    bar.className = "dg-reading-progress";
    bar.classList.toggle("dg-reading-progress-bottom", config.bottom === true);
    bar.classList.toggle("dg-reading-progress-track", config.showTrack !== false);
    bar.setAttribute("role", "progressbar");
    bar.setAttribute("aria-label", "Reading progress");
    bar.setAttribute("aria-valuemin", "0");
    bar.setAttribute("aria-valuemax", "100");
    var height = Number(config.height);
    bar.style.height = (Number.isFinite(height) ? Math.max(1, Math.min(12, height)) : 3) + "px";
    var fill = document.createElement("div");
    fill.className = "dg-reading-progress-fill";
    bar.appendChild(fill);
    document.body.appendChild(bar);
    var queued = false;
    function update() {
      queued = false;
      var rect = content.getBoundingClientRect();
      var range = rect.height - window.innerHeight;
      var progress = range <= 0 ? 1 : Math.max(0, Math.min(1, -rect.top / range));
      bar.hidden = config.hideOnShortNotes !== false && range <= 0;
      fill.style.transform = "scaleX(" + progress + ")";
      bar.setAttribute("aria-valuenow", String(Math.round(progress * 100)));
    }
    function schedule() {
      if (queued) return;
      queued = true;
      window.requestAnimationFrame(update);
    }
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule, { passive: true });
    window.addEventListener("load", schedule, { once: true });
    window.addEventListener("pageshow", schedule);
    if (window.ResizeObserver) new ResizeObserver(schedule).observe(content);
    if (document.fonts) document.fonts.ready.then(schedule);
    schedule();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
