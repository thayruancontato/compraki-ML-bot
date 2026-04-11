import { useState, useEffect } from 'react';
import { ListFilter, Send, RefreshCw, CheckCircle2, AlertCircle, Trash2 } from 'lucide-react';
import axios from 'axios';

interface Group {
  id: string;
  name: string;
}

interface QueueItem {
  query: string;
  groupId: string;
}

const API_BASE = '/api';

function App() {
  const [waStatus, setWaStatus] = useState('DESCONECTADO');
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [queue, setQueue] = useState<string[]>([]);
  const [newQuery, setNewQuery] = useState('');
  const [selectedGroup, setSelectedGroup] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchStatus();
    fetchGroups();
    fetchQueue();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const fetchStatus = async () => {
    try {
      const res = await axios.get(`${API_BASE}/status`);
      setWaStatus(res.data.status);
      setQrCode(res.data.qr);
    } catch (e) {
      console.error('Fetch status failed');
    }
  };

  const fetchGroups = async () => {
    try {
      const res = await axios.get(`${API_BASE}/groups`);
      setGroups(res.data.groups || []);
    } catch (e) {}
  };

  const fetchQueue = async () => {
    try {
      const res = await axios.get(`${API_BASE}/queue`);
      setQueue(res.data.queue || []);
    } catch (e) {}
  };

  const addToQueue = async () => {
    if (!newQuery || !selectedGroup) return;
    setLoading(true);
    try {
      await axios.post(`${API_BASE}/queue`, { query: newQuery, groupId: selectedGroup });
      setNewQuery('');
      fetchQueue();
    } catch (e) {
      alert('Erro ao adicionar à fila');
    } finally {
      setLoading(false);
    }
  };

  const testPostNow = async () => {
    if (!newQuery || !selectedGroup) return;
    setLoading(true);
    try {
      await axios.post(`${API_BASE}/test-post`, { query: newQuery, groupId: selectedGroup });
      alert('Postagem enviada com sucesso!');
      setNewQuery('');
    } catch (e: any) {
      alert('Erro na postagem: ' + (e.response?.data?.error || e.message));
    } finally {
      setLoading(false);
    }
  };

  const removeFromQueue = async (index: number) => {
    try {
      await axios.delete(`${API_BASE}/queue/${index}`);
      fetchQueue();
    } catch (e) {}
  };

  return (
    <div className="dashboard-container">
      {/* HEADER */}
      <header style={{ marginBottom: '3rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 className="gradient-text" style={{ fontSize: '2.5rem' }}>Compraki Bot</h1>
          <p style={{ color: 'var(--text-muted)' }}>Automação Inteligente de Afiliados</p>
        </div>
        <div className="glass-card" style={{ padding: '0.75rem 1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {waStatus === 'CONECTADO' ? (
            <><CheckCircle2 size={18} color="#4ade80" /><span style={{ color: '#4ade80', fontWeight: 600 }}>Bot Online</span></>
          ) : (
            <><AlertCircle size={18} color="#fbbf24" /><span style={{ color: '#fbbf24', fontWeight: 600 }}>{waStatus}</span></>
          )}
        </div>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2rem' }}>
        
        {/* WHATSAPP STATUS */}
        <div className="glass-card fade-in">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
            <RefreshCw size={20} className={waStatus === 'AGUARDANDO QR' ? 'spin' : ''} />
            <h2>Conexão WhatsApp</h2>
          </div>
          
          {waStatus === 'AGUARDANDO QR' && qrCode ? (
            <div style={{ background: 'white', padding: '1rem', borderRadius: '16px', textAlign: 'center' }}>
               <img src={qrCode} alt="WhatsApp QR Code" style={{ width: '100%', maxWidth: '200px' }} />
               <p style={{ color: '#000', fontSize: '0.8rem', marginTop: '0.5rem' }}>Escaneie para conectar</p>
            </div>
          ) : waStatus === 'CONECTADO' ? (
            <div style={{ textAlign: 'center', padding: '2rem 0' }}>
               <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'rgba(74, 222, 128, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
                 <CheckCircle2 size={40} color="#4ade80" />
               </div>
               <p>Sua sessão está ativa e pronta!</p>
            </div>
          ) : (
            <p style={{ color: 'var(--text-muted)' }}>Status atual: {waStatus}</p>
          )}
        </div>

        {/* NOVA POSTAGEM */}
        <div className="glass-card fade-in" style={{ animationDelay: '0.1s' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
            <Send size={20} />
            <h2>Nova Oferta</h2>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <input 
              className="glass-card" 
              style={{ width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-border)', color: 'white' }} 
              placeholder="Ex: iPhone 15 Pro Max"
              value={newQuery}
              onChange={(e) => setNewQuery(e.target.value)}
            />
            <select 
              className="glass-card" 
              style={{ width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-border)', color: 'white' }}
              value={selectedGroup}
              onChange={(e) => setSelectedGroup(e.target.value)}
            >
              <option value="">Selecione o Grupo</option>
              {groups.map((g: Group) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
            <button className="btn-primary" onClick={addToQueue} disabled={loading}>
              {loading ? 'Adicionando...' : 'Agendar na Fila'}
            </button>
            <button className="glass-card" onClick={testPostNow} disabled={loading} style={{ background: 'rgba(255,255,255,0.05)', color: 'white' }}>
               {loading ? 'Processando...' : 'Testar Agora (Imediato)'}
            </button>
          </div>
        </div>

        {/* FILA DE ESPERA */}
        <div className="glass-card fade-in" style={{ animationDelay: '0.2s', gridColumn: 'span 1' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
            <ListFilter size={20} />
            <h2>Fila de Espera</h2>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {queue.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '1rem' }}>Nenhum item na fila</p>
            ) : (
              queue.map((item, idx) => {
                const data: QueueItem = typeof item === 'string' ? JSON.parse(item) : item;
                const groupName = groups.find((g: Group) => g.id === data.groupId)?.name || 'Grupo Desconhecido';
                return (
                  <div key={idx} className="glass-card" style={{ background: 'rgba(255,255,255,0.03)', padding: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <p style={{ fontWeight: 600 }}>{data.query}</p>
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Para: {groupName}</p>
                    </div>
                    <button onClick={() => removeFromQueue(idx)} style={{ background: 'none', padding: '0.5rem', color: '#ef4444' }}>
                      <Trash2 size={18} />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>

      </div>

      <style>{`
        .spin { animation: rotate 2s linear infinite; }
        @keyframes rotate { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        input:focus, select:focus { outline: 1px solid var(--accent-primary); }
      `}</style>
    </div>
  );
}

export default App;
