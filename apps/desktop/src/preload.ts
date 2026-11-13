import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('neondeckBridge', {
  platform: process.platform,
  invoke: (method: string, ...args: unknown[]) => ipcRenderer.invoke('nd', method, args),
});
