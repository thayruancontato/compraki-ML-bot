import { Client, LocalAuth, RemoteAuth, MessageMedia } from 'whatsapp-web.js';
import { UpstashRedisStore } from './upstash-store';
import * as fs from 'fs';
import { exec } from 'child_process';
import * as dotenv from 'dotenv';
dotenv.config();

/**
 * CONFIGURAÇÃO DE PERSISTÊNCIA NA NUVEM
 * Usamos RemoteAuth + Upstash Redis para que o login não seja perdido no Render.
 */

// Singleton do Cliente
const store = new UpstashRedisStore();

export const whatsappClient = new Client({
  authStrategy: new RemoteAuth({
    clientId: 'compraki-bot',
    store: store as any,
    backupSyncIntervalMs: 600000, // 10 min
  }),
  puppeteer: {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  }
});

let isReady = false;

// Eventos de Autenticação
whatsappClient.on('qr', (qr) => {
  console.log('WhatsApp Bot: QR Code recebido. Pronto para escanear.');
  (global as any).waStatus = 'AGUARDANDO QR';
  (global as any).waQRCode = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qr)}`;
  
  const html = `
    <html>
      <body style="background:#0a0a0c;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;color:white;font-family:sans-serif;">
        <div style="text-align:center;background:white;padding:30px;border-radius:10px;box-shadow:0 4px 10px rgba(0,0,0,0.1);">
          <h2 style="color:#333">Escaneie para iniciar o Bot</h2>
          <img src="https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(qr)}" alt="QR Code" />
          <p style="color:#666;margin-top:20px;">Use o WhatsApp do seu celular para escanear.</p>
        </div>
      </body>
    </html>
  `;
  fs.writeFileSync('qrcode.html', html);
  exec('start qrcode.html'); 
});

whatsappClient.on('ready', () => {
  console.log('WhatsApp Bot: Cliente conectado e pronto!');
  isReady = true;
  (global as any).waStatus = 'CONECTADO';
  (global as any).waQRCode = null;
});

whatsappClient.on('remote_session_saved', () => {
  console.log('WhatsApp Bot: Sessão remota salva com sucesso no Upstash Redis!');
});

whatsappClient.on('authenticated', () => {
    console.log('WhatsApp Bot: Autenticado com sucesso');
    (global as any).waStatus = 'AUTENTICADO';
});

whatsappClient.on('auth_failure', () => {
    console.error('WhatsApp Bot: Falha na autenticação');
    (global as any).waStatus = 'ERRO DE SESSÃO';
});

whatsappClient.on('disconnected', () => {
    console.log('WhatsApp Bot: Cliente desconectado');
    (global as any).waStatus = 'DESCONECTADO';
    isReady = false;
});

export async function sendGroupMessage(groupId: string, text: string, imageUrl?: string) {
  if (!isReady) throw new Error('WhatsApp Bot ainda não está pronto');

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
    console.log(`Mensagem enviada com sucesso para ${groupId}`);
  } catch (error) {
    console.error('Erro ao enviar mensagem WhatsApp:', error);
    throw error;
  }
}
