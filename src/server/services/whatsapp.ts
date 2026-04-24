import { Boom } from '@hapi/boom';
import * as fs from 'fs';
import * as path from 'path';
import * as QRCode from 'qrcode';
import { BrowserWindow } from 'electron';
import * as dotenv from 'dotenv';
dotenv.config();

const AUTH_DIR = path.join(appDataPath(), 'baileys_auth');

function appDataPath() {
  // Pega o caminho de AppData de forma segura para Electron
  return process.env.APPDATA || (process.platform == 'darwin' ? process.env.HOME + '/Library/Preferences' : process.env.HOME + "/.local/share");
}

let sock: any = null;
let watchdogTimer: NodeJS.Timeout | null = null;
let mainWindow: BrowserWindow | null = null;

export function setMainWindow(window: BrowserWindow) {
  mainWindow = window;
}

// ===================== EMISSÃO DE STATUS EM TEMPO REAL =====================
function emitStatus(status: string, qr: string | null = null, pairingCode: string | null = null) {
  (global as any).waStatus = status;
  if (qr !== null) (global as any).waQRCode = qr;
  if (pairingCode !== null) (global as any).waPairingCode = pairingCode;
  
  if (status === 'CONECTADO' || status === 'DESLOGADO' || status === 'ERRO FATAL') {
    (global as any).waQRCode = null;
    (global as any).waPairingCode = null;
  }

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('wa-status', { 
      status, 
      qr: (global as any).waQRCode, 
      pairingCode: (global as any).waPairingCode 
    });
  }
  console.log(`[Baileys] Status: ${status}${pairingCode ? ` | Código: ${pairingCode}` : ''}`);
}

// ===================== INICIALIZAÇÃO PRINCIPAL =====================
export async function initializeWhatsApp(phoneNumber?: string) {
  console.log('[Baileys] Inicializando cliente Desktop...');
  emitStatus('INICIALIZANDO');

  const baileys = await import('@whiskeysockets/baileys');
  const makeWASocket = baileys.default;
  const {
    DisconnectReason,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    Browsers
  } = baileys;
  const pino = (await import('pino')).default;
  const logger = pino({ level: 'warn' });

  if (!fs.existsSync(AUTH_DIR)) {
    fs.mkdirSync(AUTH_DIR, { recursive: true });
  }

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version, isLatest } = await fetchLatestBaileysVersion();
  console.log(`[Baileys] WA v${version.join('.')} (latest: ${isLatest})`);

  sock = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger)
    },
    printQRInTerminal: false,
    logger,
    browser: Browsers.ubuntu('Chrome'),
    generateHighQualityLinkPreview: false,
    syncFullHistory: false,
    markOnlineOnConnect: false,
    connectTimeoutMs: 60000,
  });

  if (phoneNumber && !sock.authState.creds.registered) {
    try {
      await new Promise(resolve => setTimeout(resolve, 5000));
      console.log(`[Baileys] Solicitando código de pareamento para ${phoneNumber}...`);
      const code = await sock.requestPairingCode(phoneNumber);
      const formattedCode = code?.match(/.{1,4}/g)?.join('-') || code;
      console.log(`[Baileys] 🔑 CÓDIGO DE PAREAMENTO: ${formattedCode}`);
      emitStatus('AGUARDANDO CÓDIGO', null, formattedCode);
    } catch (err: any) {
      console.error('[Baileys] Erro ao solicitar pairing code:', err.message);
    }
  }

  sock.ev.on('creds.update', async () => {
    await saveCreds();
  });

  sock.ev.on('connection.update', async (update: any) => {
    const { connection, lastDisconnect, qr } = update;
    console.log('[Baileys] connection.update:', JSON.stringify({ connection, qr: !!qr }));

    if (qr && !phoneNumber) {
      console.log('[Baileys] QR Code gerado.');
      try {
        const qrDataUrl = await QRCode.toDataURL(qr, { width: 300, margin: 2 });
        emitStatus('AGUARDANDO QR', qrDataUrl);
      } catch {
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qr)}`;
        emitStatus('AGUARDANDO QR', qrUrl);
      }
      resetWatchdog();
    }

    if (connection === 'connecting') {
      emitStatus('CONECTANDO');
    }

    if (connection === 'close') {
      const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
      const errorMsg = (lastDisconnect?.error as Boom)?.message || 'desconhecido';
      console.log(`[Baileys] Conexão fechada. Status: ${statusCode}, Erro: ${errorMsg}`);

      if (statusCode === DisconnectReason.loggedOut) {
        console.log('[Baileys] Sessão invalidada. Limpando...');
        emitStatus('DESLOGADO');
        if (fs.existsSync(AUTH_DIR)) {
          fs.rmSync(AUTH_DIR, { recursive: true, force: true });
        }
        setTimeout(() => initializeWhatsApp(), 5000);
      } else if (statusCode === 408 || statusCode === 503) {
        emitStatus('RECONECTANDO');
        setTimeout(() => initializeWhatsApp(), 10000);
      } else {
        emitStatus('RECONECTANDO');
        setTimeout(() => initializeWhatsApp(), 5000);
      }
    }

    if (connection === 'open') {
      console.log('[Baileys] ✅ CONECTADO COM SUCESSO!');
      emitStatus('CONECTADO');
      stopWatchdog();
    }
  });
}

function resetWatchdog() {
  stopWatchdog();
  watchdogTimer = setTimeout(() => {
    if ((global as any).waStatus === 'AGUARDANDO QR') {
      console.warn('[Baileys] Watchdog: QR expirou. Reiniciando...');
      restartWhatsApp();
    }
  }, 300000);
}

function stopWatchdog() {
  if (watchdogTimer) {
    clearTimeout(watchdogTimer);
    watchdogTimer = null;
  }
}

export async function restartWhatsApp(phoneNumber?: string) {
  console.log('[Baileys] Reiniciando serviço...');
  emitStatus('REINICIANDO');

  try {
    if (sock) {
      sock.ev.removeAllListeners('connection.update');
      sock.ev.removeAllListeners('creds.update');
      sock.end(undefined);
      sock = null;
    }
  } catch (e) {
    console.warn('[Baileys] Erro ao fechar socket:', e);
  }

  await initializeWhatsApp(phoneNumber);
}

export async function sendGroupMessage(groupId: string, text: string, imageBufferOrUrl?: Buffer | string) {
  if (!sock || (global as any).waStatus !== 'CONECTADO') {
    throw new Error('WhatsApp Bot ainda não está pronto');
  }

  try {
    const jid = groupId.includes('@') ? groupId : `${groupId}@g.us`;

    if (imageBufferOrUrl) {
      try {
        let imageMsg;
        if (Buffer.isBuffer(imageBufferOrUrl)) {
           imageMsg = { image: imageBufferOrUrl, caption: text };
        } else {
           imageMsg = { image: { url: imageBufferOrUrl }, caption: text };
        }
        await sock.sendMessage(jid, imageMsg);
      } catch {
        await sock.sendMessage(jid, { text });
      }
    } else {
      await sock.sendMessage(jid, { text });
    }
  } catch (error) {
    console.error('[Baileys] Erro ao enviar mensagem:', error);
    throw error;
  }
}

export async function getGroups(): Promise<{ name: string; id: string }[]> {
  if (!sock || (global as any).waStatus !== 'CONECTADO') {
    return [];
  }

  try {
    const groups = await sock.groupFetchAllParticipating();
    return Object.values(groups).map((g: any) => ({
      name: g.subject,
      id: g.id
    }));
  } catch (err) {
    console.error('[Baileys] Erro ao buscar grupos:', err);
    return [];
  }
}
