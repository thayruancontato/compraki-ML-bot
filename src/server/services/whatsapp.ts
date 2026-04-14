import { Client, RemoteAuth, MessageMedia } from 'whatsapp-web.js';
import { UpstashRedisStore } from './upstash-store';
import * as fs from 'fs';
import * as dotenv from 'dotenv';
dotenv.config();

const store = new UpstashRedisStore();
let watchdogTimer: NodeJS.Timeout | null = null;

export let whatsappClient: Client;

function emitStatus(status: string, qr: string | null = null) {
  (global as any).waStatus = status;
  (global as any).waQRCode = qr;
  
  const io = (global as any).io;
  if (io) {
    io.emit('wa_status', { status, qr });
    console.log(`[WhatsApp] Status emitido: ${status}`);
  }
}

export function initializeWhatsApp() {
  console.log('[WhatsApp] Inicializando cliente em MODO LOW-RAM...');
  emitStatus('INICIALIZANDO');
  
  whatsappClient = new Client({
    authStrategy: new RemoteAuth({
      clientId: 'compraki-bot',
      store: store as any,
      backupSyncIntervalMs: 600000, // 10 min
    }),
    puppeteer: {
      headless: true,
      // FLAGS AGRESSIVAS PARA ECONOMIA DE MEMÓRIA (RENDER 512MB)
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--single-process', // Roda tudo em um único processo (Economiza muita RAM)
        '--disable-gpu',
        '--disable-canvas-aa',
        '--disable-2d-canvas-clip-aa',
        '--disable-gl-drawing-for-tests',
        '--js-flags="--max-old-space-size=256"' // Limita o heap do V8 para 256MB
      ]
    }
  });

  setupEventListeners();
  whatsappClient.initialize().catch(err => {
    console.error('[WhatsApp] Erro na inicialização fatal:', err);
    emitStatus('ERRO FATAL');
  });
}

function setupEventListeners() {
  whatsappClient.on('qr', (qr) => {
    console.log('[WhatsApp] Novo QR Code gerado.');
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qr)}`;
    emitStatus('AGUARDANDO QR', qrUrl);
    
    resetWatchdog();
  });

  whatsappClient.on('ready', () => {
    console.log('[WhatsApp] Cliente conectado e pronto!');
    emitStatus('CONECTADO');
    stopWatchdog();
  });

  whatsappClient.on('authenticated', () => {
    console.log('[WhatsApp] Autenticado com sucesso.');
    emitStatus('AUTENTICADO');
  });

  whatsappClient.on('auth_failure', () => {
    console.error('[WhatsApp] Falha na autenticação.');
    emitStatus('ERRO DE SESSÃO');
    restartWhatsApp();
  });

  whatsappClient.on('disconnected', (reason) => {
    console.log('[WhatsApp] Cliente desconectado:', reason);
    emitStatus('DESCONECTADO');
    restartWhatsApp();
  });

  whatsappClient.on('remote_session_saved', () => {
    console.log('[WhatsApp] Sessão remota salva com sucesso no Redis!');
  });
}

function resetWatchdog() {
  stopWatchdog();
  watchdogTimer = setTimeout(() => {
    if ((global as any).waStatus === 'AGUARDANDO QR') {
      console.warn('[WhatsApp] Watchdog: QR Code expirou. Reiniciando...');
      restartWhatsApp();
    }
  }, 300000); // 5 min
}

function stopWatchdog() {
  if (watchdogTimer) {
    clearTimeout(watchdogTimer);
    watchdogTimer = null;
  }
}

export async function restartWhatsApp() {
  console.log('[WhatsApp] Reiniciando serviço para liberar memória...');
  emitStatus('REINICIANDO');
  
  try {
    if (whatsappClient) {
      await whatsappClient.destroy().catch(() => {});
    }
  } catch (e) {
    console.warn('[WhatsApp] Erro ao destruir cliente:', e);
  }

  initializeWhatsApp();
}

export async function sendGroupMessage(groupId: string, text: string, imageUrl?: string) {
  if ((global as any).waStatus !== 'CONECTADO') {
     throw new Error('WhatsApp Bot ainda não está pronto');
  }

  try {
    if (imageUrl) {
      const media = await MessageMedia.fromUrl(imageUrl).catch(() => null);
      if (media) {
        await whatsappClient.sendMessage(groupId, media, { caption: text });
      } else {
        await whatsappClient.sendMessage(groupId, text);
      }
    } else {
      await whatsappClient.sendMessage(groupId, text);
    }
  } catch (error) {
    console.error('Erro ao enviar mensagem WhatsApp:', error);
    throw error;
  }
}
