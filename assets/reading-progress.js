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
    var meta;
    var estimate;
    var resume;
    var positionKey = "dgReadingProgress.position:" + location.pathname;
    var savedPosition;
    if (config.showReadingTime !== false || config.resumeReading === true) {
      var header = content.querySelector(":scope > header");
      if (header) {
        meta = document.createElement("div");
        meta.className = "dg-reading-meta";
        estimate = document.createElement("span");
        meta.appendChild(estimate);
        if (config.resumeReading === true) {
          try { savedPosition = JSON.parse(localStorage.getItem(positionKey) || "null"); } catch (_) {}
          resume = document.createElement("button");
          resume.type = "button";
          resume.textContent = "Resume reading";
          resume.hidden = !savedPosition || !Number.isFinite(savedPosition.fraction) || savedPosition.fraction < 0.03 || savedPosition.fraction > 0.97;
          resume.addEventListener("click", function () {
            if (document.documentElement.classList.contains("dg-note-locked")) return;
            var target = typeof savedPosition.heading === "string" && document.getElementById(savedPosition.heading);
            if (target) document.dispatchEvent(new CustomEvent("dg:reveal-target", { detail: { id: target.id } }));
            window.requestAnimationFrame(function () {
              var rect = content.getBoundingClientRect();
              var top = target ? window.scrollY + target.getBoundingClientRect().top + Math.max(0, Math.min(Number(savedPosition.offset) || 0, window.innerHeight)) : window.scrollY + rect.top + savedPosition.fraction * Math.max(0, rect.height - window.innerHeight);
              window.scrollTo({ top: top, behavior: "auto" });
              resume.hidden = true;
            });
          });
          meta.appendChild(resume);
        }
        header.appendChild(meta);
      }
    }
    var queued = false;
    var readingTimeDirty = true;
    var excludedText = "script,style,button,.dg-print-heading,.dg-reading-meta";
    function update() {
      queued = false;
      var rect = content.getBoundingClientRect();
      var range = rect.height - window.innerHeight;
      var progress = range <= 0 ? 1 : Math.max(0, Math.min(1, -rect.top / range));
      bar.hidden = config.hideOnShortNotes !== false && range <= 0;
      fill.style.transform = "scaleX(" + progress + ")";
      bar.setAttribute("aria-valuenow", String(Math.round(progress * 100)));
      if (estimate && config.showReadingTime !== false && readingTimeDirty) {
        readingTimeDirty = false;
        var walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
        var words = 0;
        while (walker.nextNode()) {
          var text = walker.currentNode;
          if (!text.parentElement.closest(excludedText)) words += (text.textContent.trim().match(/\S+/g) || []).length;
        }
        var minutes = Math.max(1, Math.ceil(words / Math.max(120, Math.min(400, Number(config.wordsPerMinute) || 220))));
        var label = minutes + " min read";
        if (estimate.textContent !== label) estimate.textContent = label;
      }
    }
    function schedule() {
      if (queued) return;
      queued = true;
      window.requestAnimationFrame(update);
    }
    if (estimate && config.showReadingTime !== false && window.MutationObserver) {
      function affectsReadingTime(node) {
        var element = node.nodeType === 1 ? node : node.parentElement;
        return !element || !element.closest(excludedText);
      }
      new MutationObserver(function (records) {
        if (records.some(function (record) {
          var removedText = record.type === "childList" && Array.from(record.removedNodes).some(function (node) {
            return node.nodeType !== 1 || !node.matches(excludedText);
          });
          return affectsReadingTime(record.target) && (record.type === "characterData" || removedText || Array.from(record.addedNodes).some(affectsReadingTime));
        })) {
          readingTimeDirty = true;
          schedule();
        }
      }).observe(content, { childList: true, characterData: true, subtree: true });
    }
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule, { passive: true });
    window.addEventListener("load", schedule, { once: true });
    window.addEventListener("pageshow", schedule);
    document.addEventListener("dg:fold-change", schedule);
    document.addEventListener("dg:layout-change", schedule);
    document.addEventListener("dg:appearance-change", schedule);
    document.addEventListener("dg:note-unlocked", schedule);
    if (config.resumeReading === true) {
      var saveTimer;
      function savePosition() {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(function () {
          if (document.documentElement.classList.contains("dg-note-locked") || window.matchMedia("print").matches) return;
          var rect = content.getBoundingClientRect();
          var fraction = rect.height <= window.innerHeight ? 0 : Math.max(0, Math.min(1, -rect.top / (rect.height - window.innerHeight)));
          var current;
          content.querySelectorAll("h1[id],h2[id],h3[id],h4[id],h5[id],h6[id]").forEach(function (heading) { if (heading.getClientRects().length && heading.getBoundingClientRect().top <= 100) current = heading; });
          try { localStorage.setItem(positionKey, JSON.stringify({ fraction: fraction, heading: current && current.id, offset: current ? -current.getBoundingClientRect().top : 0 })); } catch (_) {}
        }, 250);
      }
      window.addEventListener("scroll", savePosition, { passive: true });
    }
    if (window.ResizeObserver) new ResizeObserver(schedule).observe(content);
    if (document.fonts) document.fonts.ready.then(schedule);
    schedule();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
