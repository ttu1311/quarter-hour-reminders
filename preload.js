const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("reminders", {
  getRunning: () => ipcRenderer.invoke("get-running"),
  setRunning: (next) => ipcRenderer.send("set-running", Boolean(next)),
  onRunning: (cb) => ipcRenderer.on("running", (_e, value) => cb(Boolean(value))),
  preview: () => ipcRenderer.send("preview"),
});
