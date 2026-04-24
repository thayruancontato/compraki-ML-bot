import { contextBridge, ipcRenderer } from 'electron';

// Expor API segura para o React
contextBridge.exposeInMainWorld('api', {
  // WhatsApp
  onWaStatus: (callback: (status: any) => void) => {
    ipcRenderer.on('wa-status', (_event, data) => callback(data));
  },
  getWaStatus: () => ipcRenderer.invoke('get-wa-status'),
  requestPairing: (phoneNumber: string) => ipcRenderer.invoke('wa-request-pairing', phoneNumber),
  getGroups: () => ipcRenderer.invoke('wa-get-groups'),
  postDirect: (product: any, groupId: string, useArt: boolean) => 
    ipcRenderer.invoke('wa-post-direct', { product, groupId, useArt }),
  
  // Automacao Local (ML)
  browserStart: () => ipcRenderer.invoke('browser-start'),
  browserScrape: () => ipcRenderer.invoke('browser-scrape'),
  browserNext: () => ipcRenderer.invoke('browser-next'),
  browserGetShortLink: (title: string) => ipcRenderer.invoke('browser-get-short-link', title),
  browserGetProductByUrl: (url: string) => ipcRenderer.invoke('browser-get-product-by-url', url),
  browserSetHeadless: (headless: boolean) => ipcRenderer.invoke('browser-set-headless', headless),
  onProductFound: (callback: (product: any) => void) => {
    ipcRenderer.on('product-found', (_event, product) => callback(product));
  },

  // Sistema (Extensao)
  openExtensionFolder: () => ipcRenderer.invoke('open-extension-folder')
});
