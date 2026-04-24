import { useState, useEffect, useMemo } from 'react';
import { 
  Bot, 
  Smartphone, 
  Puzzle, 
  HelpCircle, 
  Rocket, 
  Search, 
  Share2, 
  Link as LinkIcon, 
  CheckCircle, 
  RefreshCw,
  FolderOpen,
  Send,
  Package,
  ExternalLink,
  Loader2
} from 'lucide-react';
import { 
  FluentProvider, 
  webLightTheme, 
  Button, 
  Input, 
  Spinner, 
  Text,
  Dialog,
  DialogSurface,
  DialogTitle,
  DialogContent,
  DialogBody,
  DialogActions
} from '@fluentui/react-components';
import './index.css';

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
  price: string;
  permalink: string;
  thumbnail: string;
  original_price?: number;
  commission?: string;
}

declare global {
  interface Window {
    api: any;
  }
}

function App() {
  const [isAppLoading, setIsAppLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('hub');

  useEffect(() => {
    // Simula tempo de inicialização
    const timer = setTimeout(() => {
      setIsAppLoading(false);
    }, 3000);
    return () => clearTimeout(timer);
  }, []);
  const [waStatus, setWaStatus] = useState<Status>({ status: 'INICIALIZANDO', qr: null, pairingCode: null });
  const [groups, setGroups] = useState<Group[]>([]);
  const [hubProducts, setHubProducts] = useState<Product[]>([]);
  const [selectedGroup, setSelectedGroup] = useState('');
  const [loading, setLoading] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [previewData, setPreviewData] = useState<{ product: Product; text: string; useArt: boolean } | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'none' | 'price-asc' | 'price-desc' | 'commission-desc'>('none');
  const [isPostingSelected, setIsPostingSelected] = useState(false);
  const [productUrl, setProductUrl] = useState('');
  const [urlProduct, setUrlProduct] = useState<Product | null>(null);
  const [urlLoading, setUrlLoading] = useState(false);
  const [urlStatus, setUrlStatus] = useState('');


  useEffect(() => {
    // Carregar último grupo usado
    const lastGroup = localStorage.getItem('lastSelectedGroup');
    if (lastGroup) setSelectedGroup(lastGroup);

    if (window.api?.onWaStatus) {
      window.api.onWaStatus((status: Status) => {
        setWaStatus(status);
        // Busca grupos automaticamente ao conectar
        if (status.status === 'CONECTADO') {
          fetchGroups();
        }
      });
    }

    if (window.api?.onProductFound) {
      window.api.onProductFound((newProduct: Product) => {
        setHubProducts(prev => {
          if (prev.find(p => p.id === newProduct.id)) return prev;
          return [...prev, newProduct];
        });
      });
    }

    const fetchInitialData = async () => {
      try {
        if (window.api?.getWaStatus) {
          const statusData = await window.api.getWaStatus();
          setWaStatus(statusData);
          if (statusData.status === 'CONECTADO') fetchGroups();
        }
      } catch (err) {
        console.error('Erro ao buscar dados iniciais:', err);
      }
    };

    fetchInitialData();

    const heartbeat = setInterval(async () => {
      try {
        if (window.api?.getWaStatus) {
          const data = await window.api.getWaStatus();
          setWaStatus(data);
        }
      } catch (err) {}
    }, 15000);

    return () => clearInterval(heartbeat);
  }, []);

  const fetchGroups = async () => {
    try {
      if (window.api?.getGroups) {
        const data = await window.api.getGroups();
        setGroups(data.groups || []);
        if (data.groups?.length > 0) setSelectedGroup(data.groups[0].id);
      }
    } catch (err) {}
  };

  const handleBrowserAction = async (action: string) => {
    setLoading(true);
    try {
      if (window.api) {
        if (action === 'scrape') {
          setHubProducts([]); // Limpa a grade para mostrar os novos chegando
          await window.api.browserScrape();
          // Aqui os produtos já estarão chegando via Streaming, não precisamos usar data.products.
        } else if (action === 'next') {
          const data = await window.api.browserNext();
          if (data.success) {
            alert('Carregando próxima página...');
            setTimeout(() => handleBrowserAction('scrape'), 4000); 
          } else {
            alert('Não foi possível ir para a próxima página.');
          }
        }
      }
    } catch (err) {
      alert('Erro ao controlar navegador local');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenPreview = async (product: Product, useArt: boolean) => {
    if (!selectedGroup) return alert('Selecione um grupo primeiro');
    setLoading(true);
    try {
      let finalLink = product.permalink;
      
      // Se o link ainda for o original (não meli.la), busca o curto agora
      if (!finalLink || !finalLink.includes('meli.la')) {
        console.log('Obtendo link de afiliado em tempo real...');
        if (window.api?.browserGetShortLink) {
          const res = await window.api.browserGetShortLink({ title: product.title, thumbnail: product.thumbnail });
          if (res.link) {
            finalLink = res.link;
            // Atualiza o link na lista para não precisar buscar de novo
            setHubProducts(prev => prev.map(p => p.id === product.id ? { ...p, permalink: res.link } : p));
          } else {
            alert('Não foi possível gerar o link de afiliado. Tente novamente.');
            return;
          }
        }
      }

      // Constrói a mensagem final
      const text = `🔥 *OFERTA IMPERDÍVEL* 🔥\n\n*${product.title}*\n\n💲 *Preço: ${product.price}*\n\n🛒 *Compre aqui com desconto:*\n👉 ${finalLink}\n\n_Oferta sujeita a alteração de preço_`;
      
      setPreviewData({ product: { ...product, permalink: finalLink }, text, useArt });
      setShowPreview(true);
    } catch (err) {
      alert('Erro ao gerar preview');
    } finally {
      setLoading(false);
    }
  };

  const confirmPost = async () => {
    if (!previewData || !selectedGroup) return;
    setLoading(true);
    try {
      const res = await window.api.postDirect(previewData.product, selectedGroup, previewData.useArt);
      if (res.success) {
        alert('Enviado com sucesso!');
        setShowPreview(false);
      } else {
        alert('Erro: ' + res.error);
      }
    } catch (err) {
      alert('Erro na postagem');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async (product: Product) => {
    setLoading(true);
    try {
      let link = product.permalink;
      if (window.api?.browserGetShortLink) {
        const res = await window.api.browserGetShortLink({ title: product.title, thumbnail: product.thumbnail });
        if (res.link) link = res.link;
      }
      try {
        await navigator.clipboard.writeText(link);
        alert('Link de afiliado copiado!');
      } catch (clipErr) {
        // Fallback para quando o documento não está focado
        const textArea = document.createElement("textarea");
        textArea.value = link;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        alert('Link copiado (via fallback)!');
      }
    } catch (err) {
      alert('Erro ao copiar link');
    } finally {
      setLoading(false);
    }
  };

  const filteredProducts = useMemo(() => {
    let result = hubProducts.filter(p => 
      p.title.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (sortBy === 'price-asc') {
      result.sort((a, b) => {
        const valA = parseFloat(a.price.replace(/[^\d,]/g, '').replace(',', '.')) || 0;
        const valB = parseFloat(b.price.replace(/[^\d,]/g, '').replace(',', '.')) || 0;
        return valA - valB;
      });
    } else if (sortBy === 'price-desc') {
      result.sort((a, b) => {
        const valA = parseFloat(a.price.replace(/[^\d,]/g, '').replace(',', '.')) || 0;
        const valB = parseFloat(b.price.replace(/[^\d,]/g, '').replace(',', '.')) || 0;
        return valB - valA;
      });
    } else if (sortBy === 'commission-desc') {
      result.sort((a, b) => {
        const valA = parseFloat(a.commission?.match(/\d+/)?.[0] || '0');
        const valB = parseFloat(b.commission?.match(/\d+/)?.[0] || '0');
        return valB - valA;
      });
    }

    return result;
  }, [hubProducts, searchTerm, sortBy]);

  const toggleSelect = (id: string) => {
    setSelectedProducts(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const postSelected = async () => {
    if (selectedProducts.size === 0) return alert('Selecione pelo menos um produto');
    if (!selectedGroup) return alert('Selecione um grupo primeiro');
    
    setIsPostingSelected(true);
    let successCount = 0;

    for (const id of Array.from(selectedProducts)) {
      const product = hubProducts.find(p => p.id === id);
      if (!product) continue;

      try {
        let finalLink = product.permalink;
        if (!finalLink || !finalLink.includes('meli.la')) {
          const res = await window.api.browserGetShortLink({ title: product.title, thumbnail: product.thumbnail });
          if (res.link) finalLink = res.link;
        }
        
        await window.api.postDirect({ ...product, permalink: finalLink }, selectedGroup, false);
        successCount++;
      } catch (err) {
        console.error('Erro ao postar produto:', id);
      }
    }

    alert(`${successCount} produtos postados com sucesso!`);
    setSelectedProducts(new Set());
    setIsPostingSelected(false);
  };

  const openExtensionFolder = async () => {
    if (window.api?.openExtensionFolder) {
      const res = await window.api.openExtensionFolder();
      if (res.error) alert(res.error);
    }
  };

  const handlePairing = async () => {
    if (window.api?.requestPairing) {
      const res = await window.api.requestPairing(phoneNumber);
      if (res.error) alert('Erro ao gerar código: ' + res.error);
    }
  };

  const handleFetchProductByUrl = async () => {
    if (!productUrl.includes('mercadolivre.com.br')) {
      alert('Cole um link válido do Mercado Livre.');
      return;
    }
    setUrlLoading(true);
    setUrlProduct(null);
    setUrlStatus('Navegando até o produto...');
    try {
      const res = await window.api.browserGetProductByUrl(productUrl);
      if (res.product) {
        setUrlProduct(res.product);
        setUrlStatus(res.product.permalink?.includes('meli.la') ? '✅ Link de afiliado capturado!' : '⚠️ Dados extraídos, mas link de afiliado não foi capturado.');
      } else {
        setUrlStatus('❌ Não foi possível extrair dados do produto.');
      }
    } catch (err) {
      setUrlStatus('❌ Erro ao processar o produto.');
    } finally {
      setUrlLoading(false);
    }
  };

  const handlePostUrlProduct = async () => {
    if (!urlProduct || !selectedGroup) return alert('Selecione um grupo e busque um produto primeiro.');
    setUrlLoading(true);
    try {
      const res = await window.api.postDirect(urlProduct, selectedGroup, false);
      if (res.success) {
        alert('Produto postado com sucesso!');
      } else {
        alert('Erro: ' + res.error);
      }
    } catch (err) {
      alert('Erro ao postar produto.');
    } finally {
      setUrlLoading(false);
    }
  };

  return (
    <FluentProvider theme={webLightTheme}>
      <div className={`splash-screen ${!isAppLoading ? 'fade-out' : ''}`}>
        <div className="splash-logo-container">
          <div className="splash-icon">
            <Package size={64} />
          </div>
          <div className="splash-title">COMPRAKI BOT</div>
        </div>
        <div className="splash-loader-wrapper">
          <div className="splash-loader">
            <div className="splash-progress"></div>
          </div>
          <div className="splash-status-text">Inicializando módulos nativos...</div>
        </div>
      </div>

      <div className="app-layout">
        {/* Toolbar Superior */}
        <header className="app-toolbar">
          <Bot size={18} color="var(--accent-color)" />
          <Text weight="semibold" style={{ fontSize: '13px', marginRight: '12px' }}>Compraki Affiliate Bot</Text>
        </header>

        <div className="window-shell">
          {/* Sidebar Lateral */}
          <nav className="app-sidebar">
            <div 
              className={`nav-item ${activeTab === 'hub' ? 'active' : ''}`} 
              onClick={() => setActiveTab('hub')}
            >
              <Rocket size={16} />
              <span>Automação Hub</span>
            </div>
            <div 
              className={`nav-item ${activeTab === 'conexao' ? 'active' : ''}`} 
              onClick={() => setActiveTab('conexao')}
            >
              <Smartphone size={16} />
              <span>WhatsApp</span>
            </div>
            <div 
              className={`nav-item ${activeTab === 'produto' ? 'active' : ''}`} 
              onClick={() => setActiveTab('produto')}
            >
              <ExternalLink size={16} />
              <span>Produto</span>
            </div>
            <div 
              className={`nav-item ${activeTab === 'extensao' ? 'active' : ''}`} 
              onClick={() => setActiveTab('extensao')}
            >
              <Puzzle size={16} />
              <span>Extensão</span>
            </div>
            <div style={{ marginTop: 'auto' }}>
              <div 
                className={`nav-item ${activeTab === 'ajuda' ? 'active' : ''}`} 
                onClick={() => setActiveTab('ajuda')}
              >
                <HelpCircle size={16} />
                <span>Ajuda</span>
              </div>
            </div>
          </nav>

          {/* Área de Trabalho Principal */}
          <main className="workspace">
            {activeTab === 'hub' && (
              <>
                <div className="filter-bar">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
                    <Search size={14} color="var(--text-secondary)" />
                    <input 
                      type="text" 
                      className="native-input" 
                      style={{ flex: 1, maxWidth: '300px' }}
                      placeholder="Filtrar ofertas encontradas..." 
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                  
                  <select 
                    className="native-select"
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as any)}
                  >
                    <option value="none">Ordenação Padrão</option>
                    <option value="price-asc">Menor Preço</option>
                    <option value="price-desc">Maior Preço</option>
                    <option value="commission-desc">Maiores Ganhos %</option>
                  </select>

                  <select 
                    className="native-select"
                    style={{ width: '180px' }}
                    value={selectedGroup} 
                    onChange={(e) => {
                      setSelectedGroup(e.target.value);
                      localStorage.setItem('lastSelectedGroup', e.target.value);
                    }}
                  >
                    <option value="">Selecione o Grupo...</option>
                    {groups.map(g => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </select>

                  {selectedProducts.size > 0 && (
                    <Button 
                      appearance="primary" 
                      size="small"
                      icon={isPostingSelected ? <RefreshCw size={14} className="spinner" /> : <Send size={14} />}
                      onClick={postSelected}
                    >
                      Postar {selectedProducts.size}
                    </Button>
                  )}
                </div>

                <div className="product-grid-container">
                  <div className="product-grid">
                    {filteredProducts.map((p, idx) => (
                      <div 
                        key={idx} 
                        className={`native-card ${selectedProducts.has(p.id) ? 'selected' : ''}`}
                        onClick={() => toggleSelect(p.id)}
                      >
                        <div className="card-img-box">
                          <img src={p.thumbnail} alt={p.title} />
                        </div>
                        <div className="card-body">
                          <div className="card-title" title={p.title}>{p.title}</div>
                          <div className="card-price">{p.price}</div>
                          {p.commission && (
                            <div className="card-badge">
                              {p.commission} comissão
                            </div>
                          )}
                        </div>
                        <div className="card-footer" onClick={e => e.stopPropagation()}>
                          <button 
                            className="btn-native primary"
                            onClick={() => handleOpenPreview(p, false)}
                            disabled={waStatus.status !== 'CONECTADO' || !selectedGroup}
                          >
                            <Share2 size={12} /> Postar
                          </button>
                          <button 
                            className="btn-native"
                            onClick={() => copyToClipboard(p)}
                          >
                            <LinkIcon size={12} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  {filteredProducts.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '100px 0', color: 'var(--text-secondary)' }}>
                      <Search size={40} strokeWidth={1} style={{ marginBottom: '12px' }} />
                      <Text block>Nenhuma oferta carregada no momento.</Text>
                      <Text size={200} block style={{ marginTop: '4px' }}>Use "Sincronizar Hub" no topo para começar.</Text>
                    </div>
                  )}
                </div>
              </>
            )}

            {activeTab === 'produto' && (
              <div style={{ padding: '40px', overflowY: 'auto' }}>
                <div style={{ maxWidth: '600px', margin: '0 auto' }}>
                  <Text size={500} weight="semibold" block style={{ marginBottom: '8px' }}>Produto Selecionado</Text>
                  <Text block style={{ marginBottom: '24px', color: 'var(--text-secondary)', fontSize: '13px' }}>
                    Cole o link de um produto do Mercado Livre para extrair os dados e gerar o link de afiliado automaticamente.
                  </Text>
                  
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                    <input 
                      type="text" 
                      className="native-input" 
                      style={{ flex: 1 }}
                      placeholder="https://www.mercadolivre.com.br/produto/p/MLB..." 
                      value={productUrl}
                      onChange={(e) => setProductUrl(e.target.value)}
                    />
                    <Button 
                      appearance="primary" 
                      size="small"
                      icon={urlLoading ? <Loader2 size={14} className="spinner" /> : <Search size={14} />}
                      onClick={handleFetchProductByUrl}
                      disabled={urlLoading || !productUrl}
                    >
                      {urlLoading ? 'Processando...' : 'Buscar'}
                    </Button>
                  </div>

                  {urlStatus && (
                    <div style={{ padding: '10px 14px', background: urlStatus.includes('✅') ? '#eefdf3' : urlStatus.includes('❌') ? '#fef2f2' : '#fffbeb', border: `1px solid ${urlStatus.includes('✅') ? '#d4f3dd' : urlStatus.includes('❌') ? '#fecaca' : '#fde68a'}`, borderRadius: '4px', marginBottom: '16px', fontSize: '13px' }}>
                      {urlStatus}
                    </div>
                  )}

                  <div style={{ marginBottom: '16px' }}>
                    <select 
                      className="native-select"
                      style={{ width: '100%' }}
                      value={selectedGroup} 
                      onChange={(e) => {
                        setSelectedGroup(e.target.value);
                        localStorage.setItem('lastSelectedGroup', e.target.value);
                      }}
                    >
                      <option value="">Selecione o Grupo para postar...</option>
                      {groups.map(g => (
                        <option key={g.id} value={g.id}>{g.name}</option>
                      ))}
                    </select>
                  </div>

                  {urlProduct && (
                    <div style={{ border: '1px solid var(--border-color)', borderRadius: '4px', overflow: 'hidden', background: '#fff' }}>
                      <div style={{ display: 'flex', gap: '16px', padding: '16px' }}>
                        <img src={urlProduct.thumbnail} alt={urlProduct.title} style={{ width: '120px', height: '120px', objectFit: 'contain', background: '#f9f9f9', borderRadius: '4px' }} />
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <Text weight="semibold" block>{urlProduct.title}</Text>
                          <Text size={400} weight="bold" style={{ color: '#00a650' }}>{urlProduct.price}</Text>
                          {urlProduct.permalink?.includes('meli.la') && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                              <LinkIcon size={12} color="#666" />
                              <Text size={200} style={{ color: '#666', wordBreak: 'break-all' }}>{urlProduct.permalink}</Text>
                            </div>
                          )}
                        </div>
                      </div>
                      <div style={{ padding: '12px 16px', background: '#f9f9f9', borderTop: '1px solid var(--border-color)', display: 'flex', gap: '8px' }}>
                        <Button 
                          appearance="primary" 
                          size="small"
                          icon={<Send size={14} />}
                          onClick={handlePostUrlProduct}
                          disabled={urlLoading || !selectedGroup || waStatus.status !== 'CONECTADO'}
                          style={{ flex: 1 }}
                        >
                          Postar no Grupo
                        </Button>
                        <button 
                          className="btn-native"
                          onClick={() => copyToClipboard(urlProduct)}
                          disabled={urlLoading}
                        >
                          <LinkIcon size={12} /> Copiar Link
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'conexao' && (
              <div style={{ padding: '40px', overflowY: 'auto' }}>
                <div style={{ maxWidth: '500px', margin: '0 auto' }}>
                  <Text size={500} weight="semibold" block style={{ marginBottom: '20px' }}>Conexão WhatsApp</Text>
                  
                  <div style={{ border: '1px solid var(--border-color)', borderRadius: '4px', padding: '24px', background: '#fff' }}>
                    {waStatus.status === 'CONECTADO' ? (
                      <div style={{ textAlign: 'center' }}>
                        <CheckCircle size={48} color="#107c41" style={{ marginBottom: '12px' }} />
                        <Text weight="semibold" block>WhatsApp Conectado</Text>
                        <Button appearance="subtle" onClick={fetchGroups} style={{ marginTop: '12px' }}>Atualizar Grupos</Button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        {waStatus.qr ? (
                          <img src={waStatus.qr} alt="QR Code" style={{ width: '240px', border: '1px solid #eee' }} />
                        ) : waStatus.pairingCode ? (
                          <div style={{ fontSize: '28px', fontWeight: '700', letterSpacing: '4px', background: '#f3f3f3', padding: '20px', borderRadius: '4px' }}>
                            {waStatus.pairingCode}
                          </div>
                        ) : (
                          <Spinner label="Sincronizando..." />
                        )}
                        <Text block style={{ marginTop: '20px', textAlign: 'center', fontSize: '13px' }}>
                          Conecte seu WhatsApp para habilitar as postagens automáticas.
                        </Text>
                        
                        <div style={{ width: '100%', height: '1px', background: '#eee', margin: '24px 0' }} />
                        
                        <Input
                          placeholder="Número com DDD (ex: 55119...)"
                          value={phoneNumber}
                          onChange={(e) => setPhoneNumber(e.target.value)}
                          style={{ width: '100%', marginBottom: '12px' }}
                        />
                        <Button 
                          appearance="primary" 
                          icon={<LinkIcon size={16} />} 
                          style={{ width: '100%' }} 
                          onClick={handlePairing}
                        >
                          Gerar Código de Pareamento
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'extensao' && (
              <div style={{ padding: '40px', overflowY: 'auto' }}>
                 <div style={{ maxWidth: '600px', margin: '0 auto' }}>
                    <Text size={500} weight="semibold" block style={{ marginBottom: '12px' }}>Módulo de Navegador</Text>
                    <Text block style={{ marginBottom: '24px', color: 'var(--text-secondary)' }}>
                      A extensão permite enviar ofertas direto do site do Mercado Livre.
                    </Text>
                    
                    <div style={{ background: '#f9f9f9', border: '1px solid var(--border-color)', borderRadius: '4px', padding: '20px' }}>
                      <Text weight="semibold" block style={{ marginBottom: '12px' }}>Instruções:</Text>
                      <ol style={{ fontSize: '13px', lineHeight: '1.6', paddingLeft: '20px' }}>
                        <li>Clique em "Abrir Pasta" abaixo.</li>
                        <li>No Chrome, acesse <code>chrome://extensions</code>.</li>
                        <li>Ative o "Modo do desenvolvedor".</li>
                        <li>Clique em "Carregar sem compactação" e escolha a pasta aberta.</li>
                      </ol>
                      <Button 
                        appearance="primary" 
                        icon={<FolderOpen size={18} />} 
                        style={{ marginTop: '20px', width: '100%' }}
                        onClick={openExtensionFolder}
                      >
                        Abrir Pasta da Extensão
                      </Button>
                    </div>
                 </div>
              </div>
            )}

            {activeTab === 'ajuda' && (
              <div style={{ padding: '40px', overflowY: 'auto' }}>
                 <div style={{ maxWidth: '600px', margin: '0 auto' }}>
                    <Text size={500} weight="semibold" block style={{ marginBottom: '24px' }}>Centro de Ajuda</Text>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      {[
                        { t: 'Como postar?', d: 'Vá em Automação Hub, aguarde os produtos carregarem, selecione um grupo e clique em Postar.' },
                        { t: 'Multi-Seleção', d: 'Você pode clicar nos cards para selecionar vários produtos e postar todos de uma vez.' },
                        { t: 'O que é Sincronizar?', d: 'Este botão faz o robô ler a página atual do Mercado Livre Hub de Afiliados.' }
                      ].map((item, i) => (
                        <div key={i} style={{ border: '1px solid #eee', padding: '16px', borderRadius: '4px' }}>
                          <Text weight="semibold" block>{item.t}</Text>
                          <Text size={200} style={{ color: 'var(--text-secondary)' }}>{item.d}</Text>
                        </div>
                      ))}
                    </div>
                 </div>
              </div>
            )}
          </main>
        </div>

        {/* Barra de Status Inferior (Estilo Windows) - FIXA */}
        <footer className="status-bar">
          <div className="status-item">
            <div className={`status-dot ${waStatus.status === 'CONECTADO' ? '' : 'off'}`} />
            <span>WhatsApp: {waStatus.status}</span>
          </div>
          <div className="status-item">
            <span>Produtos: {hubProducts.length}</span>
          </div>
          <div className="status-item" style={{ marginLeft: 'auto', display: 'flex', gap: '12px', alignItems: 'center' }}>
            <span>v1.0.0 Stable</span>
          </div>
        </footer>
      </div>

      {/* Dialogs de Preview */}
      {showPreview && previewData && (
        <Dialog open={showPreview} onOpenChange={() => setShowPreview(false)}>
          <DialogSurface style={{ borderRadius: '4px' }}>
            <DialogBody>
              <DialogTitle>Preview da Postagem</DialogTitle>
              <DialogContent>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '12px' }}>
                  <div style={{ display: 'flex', gap: '12px', background: '#f3f3f3', padding: '12px', borderRadius: '4px' }}>
                    <img src={previewData.product.thumbnail} style={{ width: '60px', height: '60px', objectFit: 'contain', background: '#fff' }} />
                    <div style={{ flex: 1 }}>
                      <Text weight="semibold" size={200} block>{previewData.product.title}</Text>
                      <Text size={300} color="brand" weight="bold">{previewData.product.price}</Text>
                    </div>
                  </div>
                  <div style={{ background: '#eefdf3', padding: '12px', borderRadius: '4px', border: '1px solid #d4f3dd' }}>
                    <pre style={{ whiteSpace: 'pre-wrap', fontSize: '12px', margin: 0 }}>{previewData.text}</pre>
                  </div>
                </div>
              </DialogContent>
              <DialogActions>
                <Button appearance="secondary" size="small" onClick={() => setShowPreview(false)}>Cancelar</Button>
                <Button appearance="primary" size="small" icon={<Send size={14} />} onClick={confirmPost} disabled={loading}>
                  {loading ? 'Enviando...' : 'Confirmar Envio'}
                </Button>
              </DialogActions>
            </DialogBody>
          </DialogSurface>
        </Dialog>
      )}
    </FluentProvider>
  );
}

export default App;
