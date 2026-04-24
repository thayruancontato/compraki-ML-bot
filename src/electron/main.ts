import { app, BrowserWindow, ipcMain, shell, Menu } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as http from 'http';
import * as https from 'https';
import { initializeWhatsApp, restartWhatsApp, sendGroupMessage, getGroups, setMainWindow } from '../server/services/whatsapp';
import { browserService, Product } from '../server/services/browser-automation';
import { buildWhatsAppPost } from '../server/services/post-builder';
import * as dotenv from 'dotenv';

dotenv.config();

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'Compraki Ofertas',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    icon: path.join(__dirname, '../../icone-exe.png'),
    autoHideMenuBar: true
  });

  Menu.setApplicationMenu(null);

  // Em dev: carregar do vite. Em prod: carregar do build.
  const isDev = process.env.NODE_ENV !== 'production' && !app.isPackaged;
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../dashboard/dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Passar a janela para o servico do whatsapp para poder enviar eventos
  setMainWindow(mainWindow);
}

// Servidor HTTP Local para a Extensão do Chrome
const extServer = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.url === '/api/icon/porcentagem') {
    const iconPath = path.join(process.cwd(), 'porcentagem.png');
    if (fs.existsSync(iconPath)) {
      res.writeHead(200, { 'Content-Type': 'image/png' });
      res.end(fs.readFileSync(iconPath));
    } else {
      res.writeHead(404);
      res.end();
    }
    return;
  }

  if (req.url === '/api/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    const status = (global as any).waStatus || 'INICIALIZANDO';
    res.end(JSON.stringify({ connected: status === 'CONECTADO' }));
    return;
  }

  if (req.url === '/api/groups') {
    try {
      const groups = await getGroups();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ groups }));
    } catch (err: any) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  if (req.url === '/api/send' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk.toString());
    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        const { groupId, text, imageUrl } = data;
        
        if (imageUrl) {
          console.log('[Main] Baixando imagem via API:', imageUrl);
          const buffer = await downloadImage(imageUrl);
          const tempPath = path.join(app.getPath('temp'), `api_art_${Date.now()}.jpg`);
          fs.writeFileSync(tempPath, buffer);
          await sendGroupMessage(groupId, text, tempPath);
        } else {
          await sendGroupMessage(groupId, text);
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (err: any) {
        console.error('[Main] Erro ao enviar mensagem via API:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end('Not Found');
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });

  // Inicializar servicos em background
  console.log('[Electron] Inicializando WhatsApp...');
  initializeWhatsApp();

  extServer.listen(3333, () => {
    console.log('[Electron] Servidor HTTP para Extensão rodando na porta 3333');
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// ======================= IPC Handlers =======================

ipcMain.handle('get-wa-status', () => {
  return {
    status: (global as any).waStatus || 'INICIALIZANDO',
    qr: (global as any).waQRCode || null,
    pairingCode: (global as any).waPairingCode || null
  };
});

ipcMain.handle('wa-request-pairing', async (_event, phoneNumber) => {
  try {
    const cleanNumber = phoneNumber.replace(/[\s\-\(\)\+]/g, '');
    await restartWhatsApp(cleanNumber);
    return { success: true };
  } catch (err: any) {
    return { error: err.message };
  }
});

// Helper para baixar imagem para Buffer
async function downloadImage(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      const chunks: any[] = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', (err) => reject(err));
    }).on('error', (err) => reject(err));
  });
}

ipcMain.handle('wa-get-groups', async () => {
  try {
    const groups = await getGroups();
    return { groups };
  } catch (err: any) {
    return { error: err.message };
  }
});

ipcMain.handle('wa-post-direct', async (_event, { product, groupId, useArt }) => {
  try {
    const text = buildWhatsAppPost(product, 'A');
    let media: any = null;

    if (useArt) {
      const buffer = await browserService.generateArtwork(product);
      const tempPath = path.join(app.getPath('temp'), `art_${Date.now()}.png`);
      fs.writeFileSync(tempPath, buffer);
      media = tempPath;
    } else if (product.thumbnail) {
      try {
        const buffer = await downloadImage(product.thumbnail);
        const tempPath = path.join(app.getPath('temp'), `thumb_${Date.now()}.jpg`);
        fs.writeFileSync(tempPath, buffer);
        media = tempPath;
      } catch (err) {
        media = product.thumbnail; 
      }
    }

    await sendGroupMessage(groupId, text, media);
    return { success: true };
  } catch (err: any) {
    console.error('[Main] Erro ao postar:', err);
    return { error: err.message };
  }
});

// Handler para capturar link meli.la
ipcMain.handle('browser-get-short-link', async (_event, { title, thumbnail }) => {
  try {
    const link = await browserService.getAffiliateLink(title, thumbnail);
    return { link };
  } catch (err: any) {
    return { error: err.message };
  }
});

ipcMain.handle('browser-start', async () => {
  try {
    await browserService.start();
    await browserService.gotoHub();
    return { success: true };
  } catch (err: any) {
    return { error: err.message };
  }
});

ipcMain.handle('browser-scrape', async (event) => {
  try {
    await browserService.start();
    await browserService.gotoHub();
    
    // Remove listeners antigos para não duplicar
    browserService.removeAllListeners('scraped-product');
    
    // Ouve o evento de produto capturado (já com link meli.la)
    browserService.on('scraped-product', (product: Product) => {
      event.sender.send('product-found', product);
    });

    // Inicia a varredura (não bloqueia o IPC, roda em background)
    browserService.startScraping();
    
    return { success: true };
  } catch (err: any) {
    return { error: err.message };
  }
});

ipcMain.handle('browser-set-headless', async (_event, headless: boolean) => {
  browserService.setHeadless(headless);
  return { success: true };
});

ipcMain.handle('browser-stop-scrape', async () => {
  try {
    await browserService.stopScraping();
    return { success: true };
  } catch (err: any) {
    return { error: err.message };
  }
});

ipcMain.handle('browser-next', async () => {
  try {
    const success = await browserService.nextPage();
    return { success };
  } catch (err: any) {
    return { error: err.message };
  }
});

ipcMain.handle('browser-get-product-by-url', async (_event, url) => {
  try {
    // Limpeza radical: extrai apenas a URL se o usuário colar lixo junto
    let cleanUrl = url;
    if (typeof url === 'string') {
      const match = url.match(/https?:\/\/[^\s]+/);
      if (match) cleanUrl = match[0];
    }
    
    console.log(`[Electron] Solicitado produto via URL: ${cleanUrl}`);
    const product = await browserService.getProductByUrl(cleanUrl);
    return { product };
  } catch (err: any) {
    return { error: err.message };
  }
});

ipcMain.handle('open-extension-folder', async () => {
  try {
    const extPath = path.join(process.cwd(), 'extensao-compraki');
    if (fs.existsSync(extPath)) {
      await shell.openPath(extPath);
      return { success: true };
    } else {
      return { error: 'Pasta da extensão não encontrada no diretório local.' };
    }
  } catch (err: any) {
    return { error: err.message };
  }
});
