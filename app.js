(function () {
  "use strict";

  var S = window.Schedule;
  var desktop = window.reminders || null; // set by preload.js inside the Electron app
  var TOAST_MS = 8000;

  var $ = function (id) { return document.getElementById(id); };
  var els = {
    clock: $("clock"), date: $("date"), countdown: $("countdown"), bar: $("bar-fill"),
    nextInfo: $("next-info"), start: $("start"), stop: $("stop"), status: $("status"),
    upcoming: $("upcoming"), toasts: $("toasts"), preview: $("preview"),
    dock: $("dock"), popout: $("popout"), hint: $("hint"),
  };

  var running = false;
  var target = null; // ms timestamp of the next mark we intend to fire
  var timer = null;
  var timerWin = window; // window whose setTimeout drives ticks (the pop-out window when open)
  var pipWin = null;
  var activeToasts = []; // { el, expires, gone }

  var timeFmt = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", second: "2-digit" });
  var shortFmt = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
  var dateFmt = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" });

  function pad(n) { return n < 10 ? "0" + n : String(n); }

  function formatCountdown(ms) {
    var total = Math.max(0, Math.ceil(ms / 1000));
    var h = Math.floor(total / 3600);
    var m = Math.floor((total % 3600) / 60);
    var s = total % 60;
    return h > 0 ? h + ":" + pad(m) + ":" + pad(s) : pad(m) + ":" + pad(s);
  }

  /* ---------- toasts ---------- */

  function showToast(message) {
    var toast = document.createElement("div");
    toast.className = "toast " + message.kind;
    var emoji = document.createElement("span");
    emoji.className = "toast-emoji";
    emoji.setAttribute("aria-hidden", "true");
    emoji.textContent = message.emoji;
    var text = document.createElement("span");
    text.className = "toast-text";
    text.textContent = message.text;
    var hint = document.createElement("span");
    hint.className = "toast-hint";
    hint.textContent = "Click to dismiss";
    var timerBar = document.createElement("div");
    timerBar.className = "toast-timer";
    timerBar.style.animationDuration = TOAST_MS + "ms";
    toast.appendChild(emoji);
    toast.appendChild(text);
    toast.appendChild(hint);
    toast.appendChild(timerBar);

    toast.addEventListener("click", function () { dismiss(entry); });
    var entry = { el: toast, expires: Date.now() + TOAST_MS, gone: false };
    activeToasts.push(entry);
    els.toasts.appendChild(toast);
  }

  function dismiss(entry) {
    if (entry.gone) return;
    entry.gone = true;
    entry.el.classList.add("leaving");
    setTimeout(function () { entry.el.remove(); }, 350);
  }

  // Toasts expire from the tick loop (not their own timers) so they follow the
  // same clock, and the same window, as everything else.
  function sweepToasts(now) {
    activeToasts = activeToasts.filter(function (t) {
      if (!t.gone && now >= t.expires) dismiss(t);
      return !t.gone;
    });
  }

  /* ---------- rendering ---------- */

  function renderUpcoming(now) {
    var marks = S.upcoming(now, 4);
    els.upcoming.textContent = "";
    marks.forEach(function (t) {
      var m = S.messageFor(t);
      var li = document.createElement("li");
      var when = document.createElement("span");
      when.className = "when";
      when.textContent = shortFmt.format(t);
      var what = document.createElement("span");
      what.textContent = m.emoji + " " + m.text;
      li.appendChild(when);
      li.appendChild(what);
      els.upcoming.appendChild(li);
    });
  }

  var lastUpcomingKey = null;

  function render(now) {
    els.clock.textContent = timeFmt.format(now);
    els.date.textContent = dateFmt.format(now);

    if (running && target != null) {
      var remaining = target - now;
      els.countdown.textContent = formatCountdown(remaining);
      var pct = 100 * (1 - Math.min(1, Math.max(0, remaining / S.STEP_MS)));
      els.bar.style.width = pct.toFixed(2) + "%";
      var m = S.messageFor(target);
      els.nextInfo.textContent = "at " + shortFmt.format(target) + " — " + m.emoji + " " + m.text;
      els.countdown.classList.remove("paused");
    } else {
      els.countdown.textContent = "Paused";
      els.countdown.classList.add("paused");
      els.bar.style.width = "0%";
      els.nextInfo.textContent = "Press Start to resume reminders";
    }

    var key = S.nextMark(now);
    if (key !== lastUpcomingKey) {
      lastUpcomingKey = key;
      renderUpcoming(now);
    }
  }

  /* ---------- scheduling ---------- */

  function tick() {
    timerWin.clearTimeout(timer);
    var now = Date.now();
    sweepToasts(now);

    if (running) {
      var result = S.evaluate(now, target);
      target = result.target;
      // In the desktop app the main process owns the alert (centred, always on top).
      if (result.fire != null && !desktop) showToast(S.messageFor(result.fire));
    }
    render(now);

    // Wake at the next whole second, or the target if that comes sooner.
    // Every wake re-reads the real clock, so drift can't accumulate.
    var delay = 1000 - (now % 1000) + 5;
    if (running && target != null) delay = Math.min(delay, Math.max(0, target - now) + 5);
    timer = timerWin.setTimeout(tick, Math.max(delay, 10));
  }

  function setRunning(next) {
    if (desktop) desktop.setRunning(next); // main process is the source of truth; it echoes back
    applyRunning(next);
  }

  function applyRunning(next) {
    running = next;
    target = running ? S.nextMark(Date.now()) : null;
    els.start.disabled = running;
    els.stop.disabled = !running;
    els.status.textContent = running ? "Reminders are on." : "Reminders are stopped.";
    tick();
  }

  /* ---------- pop-out (always-on-top mini window) ---------- */

  function copyStyles(doc) {
    Array.prototype.forEach.call(document.styleSheets, function (sheet) {
      try {
        var style = doc.createElement("style");
        style.textContent = Array.prototype.map.call(sheet.cssRules, function (r) { return r.cssText; }).join("\n");
        doc.head.appendChild(style);
      } catch (e) {
        if (sheet.href) {
          var link = doc.createElement("link");
          link.rel = "stylesheet";
          link.href = sheet.href;
          doc.head.appendChild(link);
        }
      }
    });
  }

  function setPopped(popped) {
    document.body.classList.toggle("popped", popped);
    els.popout.textContent = popped ? "Dock" : "Pop out";
    els.hint.textContent = popped
      ? "The widget is floating in its own window. Keep this tab open."
      : "Tip: \u201CPop out\u201D floats the widget above your other windows. Keep this tab open.";
  }

  function openWindowFallback() {
    var w = 340, h = 460;
    var left = (window.screen.availLeft || 0) + window.screen.availWidth - w - 16;
    var top = (window.screen.availTop || 0) + 40;
    window.open(location.href, "quarter-hour-reminders",
      "popup=yes,width=" + w + ",height=" + h + ",left=" + left + ",top=" + top);
  }

  async function popOut() {
    if (pipWin) { pipWin.close(); return; }
    if (!window.documentPictureInPicture) { openWindowFallback(); return; }
    var win;
    try {
      win = await window.documentPictureInPicture.requestWindow({
        width: 340,
        height: Math.min(560, Math.ceil(els.dock.offsetHeight) + 24),
      });
    } catch (e) {
      openWindowFallback();
      return;
    }
    pipWin = win;
    win.document.title = document.title;
    copyStyles(win.document);
    win.document.body.className = document.body.className;
    win.document.body.append(els.dock);
    timerWin = win; // a visible window isn't throttled like a background tab
    setPopped(true);
    win.document.body.classList.add("popped");
    win.addEventListener("pagehide", function () {
      document.body.append(els.dock);
      pipWin = null;
      timerWin = window;
      setPopped(false);
      tick();
    });
    tick();
  }

  els.start.addEventListener("click", function () { setRunning(true); });
  els.stop.addEventListener("click", function () { setRunning(false); });
  els.toasts.addEventListener("click", function () {
    activeToasts.forEach(dismiss);
  });
  els.popout.addEventListener("click", popOut);
  els.preview.addEventListener("click", function () {
    if (desktop) desktop.preview();
    else showToast(S.messageFor(S.nextMark(Date.now())));
  });

  // Re-sync immediately when the tab wakes up or regains focus.
  document.addEventListener("visibilitychange", function () { if (!document.hidden) tick(); });
  window.addEventListener("focus", tick);
  window.addEventListener("pageshow", tick);

  setPopped(false);
  if (desktop) {
    document.body.classList.add("electron");
    desktop.onRunning(applyRunning);
    desktop.getRunning().then(applyRunning);
  }
  applyRunning(true);
})();
