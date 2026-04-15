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
function emitStatus(status: string, qr: string | null = null, pairingCode: string | null = null) {
  (global as any).waStatus = status;
  (global as any).waQRCode = qr;
  (global as any).waPairingCode = pairingCode;

  const io = (global as any).io;
  if (io) {
    io.emit('wa_status', { status, qr, pairingCode });
    console.log(`[Baileys] Status: ${status}${pairingCode ? ` | Código: ${pairingCode}` : ''}`);
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
export async function initializeWhatsApp(phoneNumber?: string) {
  console.log('[Baileys] Inicializando cliente (sem browser)...');
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

  // 1. Restaurar sessão do Redis
  await restoreSessionFromRedis();

  // 2. Carregar estado de autenticação
  if (!fs.existsSync(AUTH_DIR)) {
    fs.mkdirSync(AUTH_DIR, { recursive: true });
  }
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version, isLatest } = await fetchLatestBaileysVersion();
  console.log(`[Baileys] WA v${version.join('.')} (latest: ${isLatest})`);

  // 3. Criar socket
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

  // 4. Se temos um número de telefone E não estamos registrados, usar Pairing Code
  if (phoneNumber && !sock.authState.creds.registered) {
    try {
      // Aguardar o socket estar pronto para solicitar o código
      await new Promise(resolve => setTimeout(resolve, 3000));
      const code = await sock.requestPairingCode(phoneNumber);
      const formattedCode = code?.match(/.{1,4}/g)?.join('-') || code;
      console.log(`[Baileys] 🔑 CÓDIGO DE PAREAMENTO: ${formattedCode}`);
      emitStatus('AGUARDANDO CÓDIGO', null, formattedCode);
    } catch (err: any) {
      console.error('[Baileys] Erro ao solicitar pairing code:', err.message);
      // Fallback: continua com QR Code
    }
  }

  // 5. Evento de credenciais
  sock.ev.on('creds.update', async () => {
    console.log('[Baileys] Credenciais atualizadas. Salvando...');
    await saveCreds();
    await saveSessionToRedis();
  });

  // 6. Evento de conexão
  sock.ev.on('connection.update', async (update: any) => {
    const { connection, lastDisconnect, qr } = update;
    console.log('[Baileys] connection.update:', JSON.stringify({ connection, qr: !!qr }));

    // Se estamos no modo Pairing Code, ignorar QR codes
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
        await redis.del(SESSION_KEY);
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
