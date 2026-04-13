import { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import './App.css';

interface Status {
  status: string;
  qr: string | null;
}

interface Group {
  name: string;
  id: string;
}

// Conexão Socket.io (em produção a URL é relativa)
const socket = io('/', {
  transports: ['websocket'],
  autoConnect: true
});

function App() {
  const [waStatus, setWaStatus] = useState<Status>({ status: 'INICIALIZANDO', qr: null });
  const [groups, setGroups] = useState<Group[]>([]);
  const [queue, setQueue] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [selectedGroup, setSelectedGroup] = useState('');
  const [loading, setLoading] = useState(false);
  const [restarting, setRestarting] = useState(false);

  useEffect(() => {
    // 1. Escuta atualizações de status via WebSocket (Instantâneo)
    socket.on('wa_status', (data: Status) => {
      console.log('[Socket] Novo status recebido:', data);
      setWaStatus(data);
    });

    // 2. Busca dados iniciais de fila e grupos
    const fetchInitialData = async () => {
      try {
        const queueRes = await fetch('/api/queue');
        const queueData = await queueRes.json();
        setQueue(queueData.queue || []);
        
        // Se já estiver conectado, busca os grupos
        const statusRes = await fetch('/api/status');
        const statusData = await statusRes.json();
        if (statusData.status === 'CONECTADO') {
            const groupsRes = await fetch('/api/groups');
            const groupsData = await groupsRes.json();
            setGroups(groupsData.groups || []);
        }
      } catch (err) {
        console.error('Erro ao buscar dados iniciais:', err);
      }
    };

    fetchInitialData();

    // 3. Heartbeat (Keep-Alive): Pinga o servidor a cada 30 segundos para evitar sleep do Render
    const heartbeat = setInterval(() => {
      fetch('/api/status').catch(() => {});
    }, 30000);

    return () => {
      socket.off('wa_status');
      clearInterval(heartbeat);
    };
  }, []);

  // Busca grupos quando o status muda para CONECTADO
  useEffect(() => {
    if (waStatus.status === 'CONECTADO' && groups.length === 0) {
      fetch('/api/groups')
        .then(res => res.json())
        .then(data => setGroups(data.groups || []))
        .catch(err => console.error('Erro ao buscar grupos:', err));
    }
  }, [waStatus.status]);

  const handleAddToQueue = async () => {
    if (!query || !selectedGroup) return alert('Preencha a busca e selecione um grupo');
    setLoading(true);
    try {
      await fetch('/api/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, groupId: selectedGroup })
      });
      setQuery('');
      // Recarrega fila
      const queueRes = await fetch('/api/queue');
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
    if (!selectedGroup) return alert('Selecione um grupo para o teste');
    setLoading(true);
    try {
      const res = await fetch('/test-post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, groupId: selectedGroup })
      });
      const data = await res.json();
      if (data.success) {
        alert('Enviado com sucesso!');
      } else {
        alert('Erro: ' + (data.error || 'Nenhum produto encontrado'));
      }
    } catch (err) {
      alert('Erro ao realizar postagem');
    } finally {
      setLoading(false);
    }
  }

  const handleRemoveFromQueue = async (index: number) => {
    try {
      await fetch(`/api/queue/${index}`, { method: 'DELETE' });
      setQueue(prev => prev.filter((_, i) => i !== index));
    } catch (err) {
      alert('Erro ao remover da fila');
    }
  };

  const handleRestartBot = async () => {
    if (!confirm('Deseja realmente reiniciar o bot?')) return;
    setRestarting(true);
    try {
      await fetch('/api/whatsapp/restart', { method: 'POST' });
    } catch (err) {
      alert('Erro ao solicitar reinício');
    } finally {
      setRestarting(false);
    }
  };

  return (
    <div className="container fade-in">
      <header className="glass-header">
        <div className="logo-section">
          <div className="logo-icon">🛒</div>
          <h1 className="gradient-text">Compraki Affiliate Bot</h1>
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
            {waStatus.qr ? (
              <div className="qr-container fade-in">
                <p>Escaneie para conectar:</p>
                <img src={waStatus.qr} alt="QR Code" className="qr-image" />
              </div>
            ) : (
              <div className="connected-msg fade-in">
                {waStatus.status === 'CONECTADO' ? (
                  <div className="success-ui">
                    <div className="check-icon">✓</div>
                    <p>Bot Online e Operacional</p>
                  </div>
                ) : (
                  <div className="loading-ui">
                    <div className="spinner"></div>
                    <p>Sincronizando com a Nuvem...</p>
                    <small>Se demorar, clique em reiniciar abaixo.</small>
                  </div>
                )}
              </div>
            )}
            
            <button 
              className="btn btn-secondary restart-btn" 
              onClick={handleRestartBot}
              disabled={restarting}
            >
              {restarting ? 'Solicitando...' : '🔄 Reiniciar Instância'}
            </button>
          </div>
        </section>

        <section className="glass-card queue-section">
          <h2>Agendar Nova Postagem</h2>
          <div className="form-group grid-layout">
            <input 
              type="text" 
              placeholder="Produto (ex: Notebook)" 
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
              {loading ? '...' : '➕ Agendar na Fila'}
            </button>

            <button 
              className="btn btn-test" 
              onClick={handleTestNow}
              disabled={loading || waStatus.status !== 'CONECTADO'}
            >
              🚀 Testar Agora
            </button>
          </div>

          <div className="queue-list">
            <h3>Fila de Espera ({queue.length})</h3>
            <div className="scroll-area">
              {queue.length === 0 ? (
                <p className="empty-msg">Nenhuma postagem agendada.</p>
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
