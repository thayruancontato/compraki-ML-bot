import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import compression from 'compression';
import * as dotenv from 'dotenv';
import cron from 'node-cron';
import { whatsappClient, sendGroupMessage, restartWhatsApp, initializeWhatsApp } from './services/whatsapp';
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

// Middleware para disponibilizar o socket io para os serviços (via eventos)
(global as any).io = io;

io.on('connection', (socket) => {
  console.log('[Socket] Novo cliente conectado:', socket.id);
  
  // Envia status atual imediatamente ao conectar
  socket.emit('wa_status', {
    status: (global as any).waStatus || 'INICIALIZANDO',
    qr: (global as any).waQRCode || null
  });

  socket.on('disconnect', () => {
    console.log('[Socket] Cliente desconectado');
  });
});

// API STATUS (Mantida para compatibilidade/fallback)
app.get('/api/status', (req, res) => {
  res.json({
    status: (global as any).waStatus || 'INICIALIZANDO',
    qr: (global as any).waQRCode || null
  });
});

// API RESTART WHATSAPP
app.post('/api/whatsapp/restart', async (req, res) => {
  try {
    console.log('[API] Solicitado reinício manual do WhatsApp...');
    await restartWhatsApp();
    res.json({ success: true, message: 'Bot reiniciado com sucesso' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// API GRUPOS
app.get('/api/groups', async (req, res) => {
  try {
    const chats = await whatsappClient.getChats();
    const groups = chats.filter(c => c.isGroup).map(g => ({ name: g.name, id: g.id._serialized }));
    res.json({ groups });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Outras rotas (Queue, Test Post, etc.) permanecem iguais...
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

cron.schedule('*/30 * * * *', async () => {
  // Lógica do cron permanece igual...
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

app.use((req, res) => {
  res.sendFile(path.join(__dirname, '../../dashboard/dist', 'index.html'));
});

httpServer.listen(PORT, () => {
  console.log(`Servidor rodando em modo Real-Time na porta ${PORT}`);
  initializeWhatsApp(); // Garante que o WA inicialize DEPOIS do server estar pronto
});
