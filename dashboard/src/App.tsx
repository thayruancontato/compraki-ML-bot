import { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import './App.css';

interface Status {
  status: string;
  qr: string | null;
  pairingCode: string | null;
}

interface Group {
  name: string;
  id: string;
}

interface Product {
  id: string;
  title: string;
  price: number;
  original_price: number;
  permalink: string;
  thumbnail: string;
  free_shipping: boolean;
}

const IS_PROD = true;
const RENDER_URL = 'https://compraki-bot.onrender.com';
const API_BASE = IS_PROD ? RENDER_URL : '';
const SOCKET_URL = IS_PROD ? RENDER_URL : '/';

const socket = io(SOCKET_URL, {
  transports: ['websocket'],
  autoConnect: true
});

function App() {
  const [waStatus, setWaStatus] = useState<Status>({ status: 'INICIALIZANDO', qr: null, pairingCode: null });
  const [groups, setGroups] = useState<Group[]>([]);
  const [queue, setQueue] = useState<any[]>([]);
  const [discoveredProducts, setDiscoveredProducts] = useState<Product[]>([]);
  const [selectedGroup, setSelectedGroup] = useState('');
  const [loading, setLoading] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [pairing, setPairing] = useState(false);

  useEffect(() => {
    socket.on('wa_status', (data: Status) => {
      console.log('[Socket] Status:', data);
      setWaStatus(data);
    });

    const fetchInitialData = async () => {
      try {
        const queueRes = await fetch(`${API_BASE}/api/queue`);
        const queueData = await queueRes.json();
        setQueue(queueData.queue || []);

        const statusRes = await fetch(`${API_BASE}/api/status`);
        const statusData = await statusRes.json();
        if (statusData.status === 'CONECTADO') {
          fetchGroups();
          handleDiscover();
        }
      } catch (err) {
        console.error('Erro ao buscar dados iniciais:', err);
      }
    };

    fetchInitialData();

    const heartbeat = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/api/status`);
        const data = await res.json();
        setWaStatus(data);
      } catch (err) {
        console.error('Erro no heartbeat:', err);
      }
    }, 10000);

    return () => {
      socket.off('wa_status');
      clearInterval(heartbeat);
    };
  }, []);

  useEffect(() => {
    if (waStatus.status === 'CONECTADO' && groups.length === 0) {
      fetchGroups();
      if (discoveredProducts.length === 0) handleDiscover();
    }
  }, [waStatus.status]);

  const fetchGroups = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/groups`);
      const data = await res.json();
      setGroups(data.groups || []);
    } catch (err) {
      console.error('Erro ao buscar grupos:', err);
    }
  };

  const handleDiscover = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/discover`);
      const data = await res.json();
      setDiscoveredProducts(data.products || []);
    } catch (err) {
      alert('Erro ao buscar novas ofertas');
    } finally {
      setLoading(false);
    }
  };

  const handlePostDirect = async (product: Product) => {
    if (!selectedGroup) return alert('Selecione um grupo primeiro');
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/post-direct`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product, groupId: selectedGroup })
      });
      const data = await res.json();
      if (data.success) alert('Produto postado com sucesso!');
      else alert('Erro ao postar');
    } catch (err) {
      alert('Erro na conexão');
    } finally {
      setLoading(false);
    }
  };

  const handlePairWithPhone = async () => {
    if (!phoneNumber) return alert('Digite seu número com código do país (ex: 5511999998888)');
    setPairing(true);
    try {
      await fetch(`${API_BASE}/api/whatsapp/pair`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber })
      });
    } catch (err) {
      alert('Erro ao solicitar código');
    } finally {
      setPairing(false);
    }
  };

  const handleRemoveFromQueue = async (index: number) => {
    try {
      await fetch(`${API_BASE}/api/queue/${index}`, { method: 'DELETE' });
      setQueue(prev => prev.filter((_, i) => i !== index));
    } catch (err) {
      alert('Erro ao remover da fila');
    }
  };

  const handleRestartBot = async () => {
    if (!confirm('Reiniciar o bot?')) return;
    setRestarting(true);
    try {
      await fetch(`${API_BASE}/api/whatsapp/restart`, { method: 'POST' });
    } catch (err) {
      alert('Erro ao reiniciar');
    } finally {
      setRestarting(false);
    }
  };

  const parseQueueItem = (item: any) => {
    if (typeof item === 'object') return item;
    try {
      return JSON.parse(item);
    } catch {
      return { query: String(item) };
    }
  };

  return (
    <div className="container fade-in">
      <header className="glass-header">
        <div className="logo-section">
          <div className="logo-icon">🛒</div>
          <h1 className="gradient-text">Compraki Bot</h1>
        </div>
        <div className={`status-badge ${waStatus.status === 'CONECTADO' ? 'online' : 'offline'}`}>
          <span className="dot"></span> {waStatus.status}
        </div>
      </header>

      <main className="dashboard-grid">
        <section className="glass-card whatsapp-section">
          <div className="card-header">
            <h2>Conexão WhatsApp</h2>
            <div className="wa-status-label">{waStatus.status}</div>
          </div>

          <div className="wa-status-container">
            {waStatus.status === 'CONECTADO' ? (
              <div className="success-ui fade-in">
                <div className="check-icon">✓</div>
                <p>Bot Cloud Conectado</p>
              </div>
            ) : waStatus.pairingCode ? (
              <div className="pairing-code-ui fade-in">
                <p className="pairing-label">Digite este código no WhatsApp:</p>
                <div className="pairing-code">{waStatus.pairingCode}</div>
                <p className="pairing-instructions">
                  📱 No celular: <strong>Configurações → Aparelhos Conectados → Conectar Aparelho → Conectar com número de telefone</strong>
                </p>
              </div>
            ) : waStatus.qr ? (
              <div className="qr-container fade-in">
                <p>Escaneie o código (ou use o método por número abaixo):</p>
                <img src={waStatus.qr} alt="QR Code" className="qr-image" />
              </div>
            ) : (
              <div className="loading-ui fade-in">
                <div className="spinner"></div>
                <p>Sincronizando...</p>
              </div>
            )}

            {waStatus.status !== 'CONECTADO' && !waStatus.pairingCode && (
              <div className="pairing-input-section fade-in">
                <p className="section-label">🔑 Conectar via Número (Recomendado)</p>
                <div className="pairing-form">
                  <input
                    type="tel"
                    placeholder="5511999998888"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    className="glass-input"
                  />
                  <button className="btn btn-accent" onClick={handlePairWithPhone} disabled={pairing}>
                    {pairing ? '...' : '🔗 Gerar Código'}
                  </button>
                </div>
              </div>
            )}

            <button className="btn btn-secondary restart-btn" onClick={handleRestartBot} disabled={restarting}>
              {restarting ? 'Reiniciando...' : '🔄 Reiniciar'}
            </button>
          </div>
        </section>

        <section className="glass-card main-section">
          <div className="discovery-header">
            <h2>🚀 Descobrir Ofertas</h2>
            <div className="discovery-actions">
              <select
                value={selectedGroup}
                onChange={(e) => setSelectedGroup(e.target.value)}
                className="glass-select"
              >
                <option value="">Postar no Grupo...</option>
                {groups.map(g => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
              <button 
                className={`btn btn-primary ${loading ? 'btn-loading' : ''}`} 
                onClick={handleDiscover}
                disabled={loading || waStatus.status !== 'CONECTADO'}
              >
                {loading ? '🔄 Buscando...' : '🔄 Atualizar Ofertas'}
              </button>
            </div>
          </div>

          <div className="product-feed">
            {discoveredProducts.length === 0 && !loading && (
              <div className="empty-feed">
                <p>Clique em "Atualizar Ofertas" para começar.</p>
              </div>
            )}

            <div className="product-grid">
              {discoveredProducts.map((p) => (
                <div key={p.id} className="product-card fade-in">
                  <div className="p-badge">OFERTA</div>
                  <img src={p.thumbnail} alt={p.title} className="p-img" />
                  <div className="p-info">
                    <h3 title={p.title}>{p.title}</h3>
                    <div className="p-price-row">
                      <span className="p-price-old">R$ {p.original_price.toFixed(2)}</span>
                      <span className="p-price-new">R$ {p.price.toFixed(2)}</span>
                    </div>
                    <button 
                      className="btn btn-post"
                      onClick={() => handlePostDirect(p)}
                      disabled={loading || waStatus.status !== 'CONECTADO' || !selectedGroup}
                    >
                      Mandar p/ Grupo 🚀
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="glass-card queue-section-mini">
          <h3>Fila de Automação ({queue.length})</h3>
          <div className="scroll-area">
            {queue.length === 0 ? (
              <p className="empty-msg">Nenhuma agendada.</p>
            ) : (
              <ul>
                {queue.map((item, idx) => {
                  const parsed = parseQueueItem(item);
                  return (
                    <li key={idx} className="queue-item fade-in">
                      <span className="q-query">📦 {parsed.query}</span>
                      <button onClick={() => handleRemoveFromQueue(idx)} className="btn-delete">🗑️</button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
