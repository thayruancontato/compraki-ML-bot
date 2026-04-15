import { Boom } from '@hapi/boom';
import * as fs from 'fs';
import * as path from 'path';
import * as QRCode from 'qrcode';
import { redis } from './redis';
import * as dotenv from 'dotenv';
dotenv.config();

const AUTH_DIR = path.join(process.cwd(), 'baileys_auth');
const SESSION_KEY = 'BAILEYS_SESSION';

let sock: any = null;
let watchdogTimer: NodeJS.Timeout | null = null;

// ===================== EMISSÃO DE STATUS EM TEMPO REAL =====================
function emitStatus(status: string, qr: string | null = null) {
  (global as any).waStatus = status;
  (global as any).waQRCode = qr;

  const io = (global as any).io;
  if (io) {
    io.emit('wa_status', { status, qr });
    console.log(`[Baileys] Status: ${status}`);
  }
}

// ===================== PERSISTÊNCIA VIA REDIS =====================
async function saveSessionToRedis() {
  try {
    if (!fs.existsSync(AUTH_DIR)) return;

    const files = fs.readdirSync(AUTH_DIR);
    const sessionData: Record<string, string> = {};

    for (const file of files) {
      const filePath = path.join(AUTH_DIR, file);
      const stat = fs.statSync(filePath);
      if (stat.isFile() && stat.size < 5_000_000) {
        sessionData[file] = fs.readFileSync(filePath, 'utf-8');
      }
    }

    await redis.set(SESSION_KEY, JSON.stringify(sessionData));
    console.log(`[Baileys] Sessão salva no Redis (${Object.keys(sessionData).length} arquivos)`);
  } catch (err) {
    console.error('[Baileys] Erro ao salvar sessão:', err);
  }
}

async function restoreSessionFromRedis() {
  try {
    const data = await redis.get<string>(SESSION_KEY);
    if (!data) {
      console.log('[Baileys] Nenhuma sessão no Redis. Login novo necessário.');
      return;
    }

    const sessionData: Record<string, string> = JSON.parse(data);

    if (!fs.existsSync(AUTH_DIR)) {
      fs.mkdirSync(AUTH_DIR, { recursive: true });
    }

    for (const [file, content] of Object.entries(sessionData)) {
      fs.writeFileSync(path.join(AUTH_DIR, file), content, 'utf-8');
    }

    console.log(`[Baileys] Sessão restaurada do Redis (${Object.keys(sessionData).length} arquivos)`);
  } catch (err) {
    console.error('[Baileys] Erro ao restaurar sessão:', err);
  }
}

// ===================== INICIALIZAÇÃO PRINCIPAL =====================
export async function initializeWhatsApp() {
  console.log('[Baileys] Inicializando cliente ULTRA-RÁPIDO (sem browser)...');
  emitStatus('INICIALIZANDO');

  // Import dinâmico do Baileys (ESM)
  const {
    default: makeWASocket,
    DisconnectReason,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore
  } = await import('@whiskeysockets/baileys');
  const pino = (await import('pino')).default;
  const logger = pino({ level: 'silent' });

  // 1. Restaurar sessão do Redis
  await restoreSessionFromRedis();

  // 2. Carregar estado de autenticação
  if (!fs.existsSync(AUTH_DIR)) {
    fs.mkdirSync(AUTH_DIR, { recursive: true });
  }
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  // 3. Criar socket
  sock = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger)
    },
    printQRInTerminal: false,
    logger,
    browser: ['Compraki Bot', 'Chrome', '120.0.0'],
    generateHighQualityLinkPreview: false,
    syncFullHistory: false
  });

  // 4. Evento de credenciais
  sock.ev.on('creds.update', async () => {
    await saveCreds();
    await saveSessionToRedis();
  });

  // 5. Evento de conexão
  sock.ev.on('connection.update', async (update: any) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('[Baileys] QR Code gerado instantaneamente.');
      try {
        const qrDataUrl = await QRCode.toDataURL(qr, { width: 300, margin: 2 });
        emitStatus('AGUARDANDO QR', qrDataUrl);
      } catch {
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qr)}`;
        emitStatus('AGUARDANDO QR', qrUrl);
      }
      resetWatchdog();
    }

    if (connection === 'close') {
      const reason = (lastDisconnect?.error as Boom)?.output?.statusCode;
      console.log(`[Baileys] Conexão fechada. Razão: ${reason}`);

      if (reason === DisconnectReason.loggedOut) {
        console.log('[Baileys] Usuário deslogou. Limpando sessão...');
        emitStatus('DESLOGADO');
        if (fs.existsSync(AUTH_DIR)) {
          fs.rmSync(AUTH_DIR, { recursive: true, force: true });
        }
        await redis.del(SESSION_KEY);
        setTimeout(() => initializeWhatsApp(), 3000);
      } else {
        emitStatus('RECONECTANDO');
        setTimeout(() => initializeWhatsApp(), 3000);
      }
    }

    if (connection === 'open') {
      console.log('[Baileys] ✅ CONECTADO COM SUCESSO!');
      emitStatus('CONECTADO');
      stopWatchdog();
      await saveSessionToRedis();
    }
  });
}

// ===================== WATCHDOG =====================
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

// ===================== REINICIAR =====================
export async function restartWhatsApp() {
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

  await initializeWhatsApp();
}

// ===================== ENVIAR MENSAGEM =====================
export async function sendGroupMessage(groupId: string, text: string, imageUrl?: string) {
  if (!sock || (global as any).waStatus !== 'CONECTADO') {
    throw new Error('WhatsApp Bot ainda não está pronto');
  }

  try {
    const jid = groupId.includes('@') ? groupId : `${groupId}@g.us`;

    if (imageUrl) {
      try {
        await sock.sendMessage(jid, {
          image: { url: imageUrl },
          caption: text
        });
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

// ===================== LISTAR GRUPOS =====================
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
