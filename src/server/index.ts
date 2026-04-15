import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import compression from 'compression';
import * as dotenv from 'dotenv';
import cron from 'node-cron';
import { sendGroupMessage, restartWhatsApp, initializeWhatsApp, getGroups } from './services/whatsapp';
import { searchProducts } from './services/mercadolivre';
import { buildWhatsAppPost } from './services/post-builder';
import { redis } from './services/redis';
import path from 'path';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(cors({ origin: "*" }));
app.use(compression());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../../dashboard/dist')));

const PORT = process.env.PORT || 3000;

// Disponibilizar io globalmente para o serviço de WhatsApp
(global as any).io = io;

io.on('connection', (socket) => {
  console.log('[Socket] Cliente conectado:', socket.id);

  // Envia status atual imediatamente ao conectar
  socket.emit('wa_status', {
    status: (global as any).waStatus || 'INICIALIZANDO',
    qr: (global as any).waQRCode || null,
    pairingCode: (global as any).waPairingCode || null
  });

  socket.on('disconnect', () => {
    console.log('[Socket] Cliente desconectado');
  });
});

// API STATUS (fallback para heartbeat)
app.get('/api/status', (req, res) => {
  res.json({
    status: (global as any).waStatus || 'INICIALIZANDO',
    qr: (global as any).waQRCode || null,
    pairingCode: (global as any).waPairingCode || null
  });
});

// API RESTART WHATSAPP (aceita phoneNumber para pairing code)
app.post('/api/whatsapp/restart', async (req, res) => {
  try {
    const { phoneNumber } = req.body || {};
    console.log(`[API] Reinício solicitado${phoneNumber ? ` com pairing para ${phoneNumber}` : ''}...`);
    await restartWhatsApp(phoneNumber);
    res.json({ success: true, message: 'Bot reiniciado' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// API PAIRING CODE (conectar via número de telefone)
app.post('/api/whatsapp/pair', async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    if (!phoneNumber) return res.status(400).json({ error: 'Número de telefone obrigatório' });
    
    // Limpa número: remove +, espaços, parênteses, traços
    const cleanNumber = phoneNumber.replace(/[\s\-\(\)\+]/g, '');
    console.log(`[API] Pairing code solicitado para: ${cleanNumber}`);
    
    await restartWhatsApp(cleanNumber);
    res.json({ success: true, message: 'Código de pareamento solicitado' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// API GRUPOS (agora via Baileys)
app.get('/api/groups', async (req, res) => {
  try {
    const groups = await getGroups();
    res.json({ groups });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// FILA DE OFERTAS
app.get('/api/queue', async (req, res) => {
  try {
    const queue = await redis.lrange('ML_OFERTAS_QUEUE', 0, -1);
    res.json({ queue });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/queue', async (req, res) => {
  const { query, groupId } = req.body;
  if (!query || !groupId) return res.status(400).json({ error: 'Faltando query ou groupId' });
  try {
    await redis.rpush('ML_OFERTAS_QUEUE', JSON.stringify({ query, groupId }));
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/queue/:index', async (req, res) => {
  const index = parseInt(req.params.index);
  try {
    const list = await redis.lrange('ML_OFERTAS_QUEUE', 0, -1);
    list.splice(index, 1);
    await redis.del('ML_OFERTAS_QUEUE');
    if (list.length > 0) await redis.rpush('ML_OFERTAS_QUEUE', ...list);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POSTAR OFERTA MANUALMENTE
app.post('/test-post', async (req, res) => {
  const { query, groupId } = req.body;
  if (!groupId) return res.status(400).json({ error: 'groupId faltando' });
  try {
    const searchParam = query || 'celular promoção';
    const items = await searchProducts(searchParam, 1);
    if (items.length === 0) return res.status(404).json({ error: 'Nenhum produto encontrado' });
    const text = buildWhatsAppPost(items[0], 'A');
    await sendGroupMessage(groupId, text, items[0].thumbnail);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// CRON JOB: POSTAR OFERTAS A CADA 30 MINUTOS
cron.schedule('*/30 * * * *', async () => {
  try {
    const item = await redis.lpop<string>('ML_OFERTAS_QUEUE');
    if (!item) return;
    const { query, groupId } = JSON.parse(item);
    const items = await searchProducts(query, 1);
    if (items.length > 0) {
      const text = buildWhatsAppPost(items[0], 'A');
      await sendGroupMessage(groupId, text, items[0].thumbnail);
    }
  } catch (error) {
    console.error('[CRON ERROR]', error);
  }
});

// SPA FALLBACK
app.use((req, res) => {
  res.sendFile(path.join(__dirname, '../../dashboard/dist', 'index.html'));
});

httpServer.listen(PORT, () => {
  console.log(`🚀 Servidor Compraki rodando na porta ${PORT} (Motor: Baileys)`);
  initializeWhatsApp();
});
