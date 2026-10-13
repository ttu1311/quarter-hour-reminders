// Electron main process: owns the schedule and shows the centred, always-on-top alert.
const { app, BrowserWindow, Tray, Menu, nativeImage, screen, ipcMain, powerMonitor } = require("electron");
const path = require("node:path");
const S = require("./schedule.js");

const ALERT_MS = 8000;
const ALERT_SIZE = { width: 520, height: 340 };
const WIDGET_SIZE = { width: 360, height: 330 };

let widget = null;
let tray = null;
let running = true;
let target = null; // ms timestamp of the next mark we intend to fire
let timer = null;
let quitting = false;
const alerts = new Set();

if (!app.requestSingleInstanceLock()) {
  app.quit();
}
app.on("second-instance", showWidget);

/* ---------- alert: centred on the display the cursor is on ---------- */

function showAlert(message) {
  alerts.forEach((w) => w.close());
  const { workArea } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const { width, height } = ALERT_SIZE;
  const win = new BrowserWindow({
    width,
    height,
    x: Math.round(workArea.x + (workArea.width - width) / 2),
    y: Math.round(workArea.y + (workArea.height - height) / 2),
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: false,
    movable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    acceptFirstMouse: true,
    show: false,
    webPreferences: { contextIsolation: true, sandbox: true, backgroundThrottling: false },
  });
  alerts.add(win);
  win.on("closed", () => alerts.delete(win));
  // Above full-screen apps and on every Space, without stealing keyboard focus.
  win.setAlwaysOnTop(true, "screen-saver");
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
  win.once("ready-to-show", () => win.showInactive());
  win.loadFile(path.join(__dirname, "alert.html"), {
    query: { kind: message.kind, text: message.text, emoji: message.emoji, ms: String(ALERT_MS) },
  });
  setTimeout(() => { if (!win.isDestroyed()) win.close(); }, ALERT_MS + 1500);
  return win;
}

/* ---------- schedule (re-derived from the real clock on every tick) ---------- */

function tick() {
  clearTimeout(timer);
  const now = Date.now();
  if (running) {
    const result = S.evaluate(now, target);
    const changed = result.target !== target;
    target = result.target;
    if (result.fire != null) showAlert(S.messageFor(result.fire));
    if (changed) updateTray();
  }
  const delay = running && target != null ? Math.min(1000, Math.max(0, target - now) + 5) : 1000;
  timer = setTimeout(tick, Math.max(delay, 10));
}

function setRunning(next) {
  running = next;
  target = running ? S.nextMark(Date.now()) : null;
  updateTray();
  if (widget && !widget.isDestroyed()) widget.webContents.send("running", running);
  tick();
}

/* ---------- widget window ---------- */

function createWidget() {
  const { workArea } = screen.getPrimaryDisplay();
  widget = new BrowserWindow({
    ...WIDGET_SIZE,
    x: workArea.x + workArea.width - WIDGET_SIZE.width - 12,
    y: workArea.y + 12,
    title: "Quarter-Hour Reminders",
    icon: path.join(__dirname, "icon.png"),
    alwaysOnTop: true,
    fullscreenable: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: false,
    },
  });
  widget.loadFile(path.join(__dirname, "index.html"));
  widget.once("ready-to-show", () => widget.show());
  // Closing the window keeps reminders running in the tray.
  widget.on("close", (e) => {
    if (quitting) return;
    e.preventDefault();
    widget.hide();
  });
}

function showWidget() {
  if (!widget || widget.isDestroyed()) createWidget();
  else widget.show();
}

/* ---------- tray / menu bar ---------- */

function updateTray() {
  if (!tray) return;
  const next = running && target != null
    ? `Next: ${new Date(target).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} — ${S.messageFor(target).text}`
    : "Reminders are stopped";
  tray.setToolTip(next);
  if (process.platform === "darwin") {
    tray.setTitle(running && target != null
      ? new Date(target).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
      : "paused");
  }
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: next, enabled: false },
    { type: "separator" },
    { label: "Show widget", click: showWidget },
    running
      ? { label: "Stop reminders", click: () => setRunning(false) }
      : { label: "Start reminders", click: () => setRunning(true) },
    { label: "Preview alert", click: () => showAlert(S.messageFor(S.nextMark(Date.now()))) },
    { type: "separator" },
    {
      label: "Launch at login",
      type: "checkbox",
      checked: app.getLoginItemSettings().openAtLogin,
      click: (item) => app.setLoginItemSettings({ openAtLogin: item.checked }),
    },
    { type: "separator" },
    { label: "Quit", click: () => { quitting = true; app.quit(); } },
  ]));
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, "icon.png")).resize({ width: 18, height: 18 });
  tray = new Tray(icon);
  tray.on("click", showWidget);
  updateTray();
}

/* ---------- app lifecycle ---------- */

ipcMain.handle("get-running", () => running);
ipcMain.on("set-running", (_e, next) => setRunning(Boolean(next)));
ipcMain.on("preview", () => showAlert(S.messageFor(S.nextMark(Date.now()))));

app.whenReady().then(() => {
  createTray();
  createWidget();
  setRunning(true);
  powerMonitor.on("resume", tick); // re-sync immediately after the computer wakes
  screen.on("display-metrics-changed", tick);
  if (process.argv.includes("--test-alert")) {
    // Smoke test: show an alert now and report where it landed.
    const win = showAlert(S.messageFor(Date.now()));
    win.once("show", () => console.log("ALERT_BOUNDS " + JSON.stringify({
      bounds: win.getBounds(),
      display: screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea,
      alwaysOnTop: win.isAlwaysOnTop(),
    })));
  }
});

app.on("before-quit", () => { quitting = true; });
app.on("activate", showWidget);
// Stay alive in the tray when every window is closed.
app.on("window-all-closed", () => {});
