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
  const [queue, setQueue] = useState<string[]>([]);
  const [query, setQuery] = useState('');
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
          const groupsRes = await fetch(`${API_BASE}/api/groups`);
          const groupsData = await groupsRes.json();
          setGroups(groupsData.groups || []);
        }
      } catch (err) {
        console.error('Erro ao buscar dados iniciais:', err);
      }
    };

    fetchInitialData();

    const heartbeat = setInterval(() => {
      fetch(`${API_BASE}/api/status`).catch(() => {});
    }, 30000);

    return () => {
      socket.off('wa_status');
      clearInterval(heartbeat);
    };
  }, []);

  useEffect(() => {
    if (waStatus.status === 'CONECTADO' && groups.length === 0) {
      fetch(`${API_BASE}/api/groups`)
        .then(res => res.json())
        .then(data => setGroups(data.groups || []))
        .catch(err => console.error('Erro ao buscar grupos:', err));
    }
  }, [waStatus.status]);

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

  const handleAddToQueue = async () => {
    if (!query || !selectedGroup) return alert('Preencha a busca e selecione um grupo');
    setLoading(true);
    try {
      await fetch(`${API_BASE}/api/queue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, groupId: selectedGroup })
      });
      setQuery('');
      const queueRes = await fetch(`${API_BASE}/api/queue`);
      const queueData = await queueRes.json();
      setQueue(queueData.queue || []);
      alert('Adicionado à fila!');
    } catch (err) {
      alert('Erro ao adicionar à fila');
    } finally {
      setLoading(false);
    }
  };

  const handleTestNow = async () => {
    if (!selectedGroup) return alert('Selecione um grupo');
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/test-post`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, groupId: selectedGroup })
      });
      const data = await res.json();
      if (data.success) alert('Enviado com sucesso!');
      else alert('Erro: ' + (data.error || 'Falha'));
    } catch (err) {
      alert('Erro ao realizar postagem');
    } finally {
      setLoading(false);
    }
  }

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

            {/* PAIRING CODE: Método de conexão via número (mais confiável na nuvem) */}
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
                  <button
                    className="btn btn-accent"
                    onClick={handlePairWithPhone}
                    disabled={pairing}
                  >
                    {pairing ? '...' : '🔗 Gerar Código'}
                  </button>
                </div>
              </div>
            )}

            <button
              className="btn btn-secondary restart-btn"
              onClick={handleRestartBot}
              disabled={restarting}
            >
              {restarting ? 'Reiniciando...' : '🔄 Reiniciar'}
            </button>
          </div>
        </section>

        <section className="glass-card queue-section">
          <h2>Agendar Nova Postagem</h2>
          <div className="form-group grid-layout">
            <input
              type="text"
              placeholder="O que pesquisar no ML?"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="glass-input"
            />
            <select
              value={selectedGroup}
              onChange={(e) => setSelectedGroup(e.target.value)}
              className="glass-select"
            >
              <option value="">Selecione o Grupo</option>
              {groups.map(g => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </div>

          <div className="action-buttons">
            <button
              className="btn btn-primary"
              onClick={handleAddToQueue}
              disabled={loading || waStatus.status !== 'CONECTADO'}
            >
              ➕ Agendar
            </button>
            <button
              className="btn btn-test"
              onClick={handleTestNow}
              disabled={loading || waStatus.status !== 'CONECTADO'}
            >
              🚀 Testar
            </button>
          </div>

          <div className="queue-list">
            <h3>Fila de Ofertas ({queue.length})</h3>
            <div className="scroll-area">
              {queue.length === 0 ? (
                <p className="empty-msg">Nenhuma oferta agendada.</p>
              ) : (
                <ul>
                  {queue.map((item, idx) => {
                    const parsed = JSON.parse(item);
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
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
