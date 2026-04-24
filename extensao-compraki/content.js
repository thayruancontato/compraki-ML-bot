// ============= Content Script para páginas do Mercado Livre =============
// Envia promoções para grupos do WhatsApp via aba aberta do WhatsApp Web

function extrairDadosProduto() {
  const cleanText = (el) => el ? el.innerText.trim() : "";
  const titulo = cleanText(document.querySelector('h1.ui-pdp-title'));
  const imgEl = document.querySelector('.ui-pdp-gallery__figure img.ui-pdp-image');
  const imagemUrl = imgEl && imgEl.src ? imgEl.src : "";

  let precoAtual = "";
  const priceContainer = document.querySelector('.ui-pdp-price__second-line');
  if (priceContainer) {
    const fraction = priceContainer.querySelector('.andes-money-amount__fraction');
    const cents = priceContainer.querySelector('.andes-money-amount__cents');
    if (fraction) precoAtual = cleanText(fraction) + (cents ? ',' + cleanText(cents) : "");
  }

  let precoOriginal = "";
  const originalPriceContainer = document.querySelector('.ui-pdp-price__original-value');
  if (originalPriceContainer) {
    const origFraction = originalPriceContainer.querySelector('.andes-money-amount__fraction');
    const origCents = originalPriceContainer.querySelector('.andes-money-amount__cents');
    if (origFraction) precoOriginal = cleanText(origFraction) + (origCents ? ',' + cleanText(origCents) : "");
  }

  return { titulo, imagemUrl, precoAtual, precoOriginal, urlOriginal: window.location.href };
}

const WORKER_SHORTENER = 'https://compraki-ml-bridge.thayrufino2.workers.dev/shorten';
let productData = null;

// ============= Comunicação com WhatsApp via Background =============
function sendToWhatsApp(action, data) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { type: "COMPRAKI_WA_COMMAND", action, data },
      (response) => {
        if (chrome.runtime.lastError) {
          resolve({ error: "EXTENSION_ERROR" });
        } else {
          resolve(response || { error: "NO_RESPONSE" });
        }
      }
    );
  });
}

function checkWhatsAppTab() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "COMPRAKI_CHECK_WA" }, (response) => {
      if (chrome.runtime.lastError) {
        resolve(false);
      } else {
        resolve(response && response.connected);
      }
    });
  });
}

// ============= Overlay HTML =============
function htmlOverlay() {
  return `
    <div id="compraki-overlay">
      <div class="compraki-header">
        <h2>Compraki <span style="color:#e1e1e6;font-weight:400">Ofertas</span></h2>
        <div>
          <button class="compraki-close-btn" id="ck-close" title="Fechar">×</button>
        </div>
      </div>
      
      <div class="compraki-body">
        <!-- Estado: Verificando WhatsApp -->
        <div id="ck-state-checking" class="compraki-state active">
          <div class="compraki-spinner"></div>
          <p>Buscando o App Compraki Ofertas...</p>
        </div>

        <!-- Estado: WhatsApp não encontrado -->
        <div id="ck-state-no-wa" class="compraki-state">
          <h2 style="font-size:36px; margin:0">Monitor</h2>
          <p style="font-weight:600; color:#f75a68">App Compraki Fechado</p>
          <p style="font-size:12px; color:#a8a8b3; margin-top:4px">
            Abra o aplicativo <strong>Compraki Ofertas</strong> no seu PC e certifique-se de que o WhatsApp está conectado lá.
          </p>
          <button id="ck-retry-btn" class="compraki-btn" style="margin-top:12px">
            Tentar Novamente
          </button>
        </div>

        <!-- Estado: Carregando grupos -->
        <div id="ck-state-loading-groups" class="compraki-state">
          <div class="compraki-spinner"></div>
          <p>Sincronizando com o App Desktop...</p>
          <p style="font-size:11px; color:#a8a8b3">Buscando os grupos do WhatsApp.</p>
        </div>

        <!-- Estado: Pronto para enviar -->
        <div id="ck-state-ready" class="compraki-state">
          <div class="compraki-status-badge" id="ck-wa-badge">
            <span class="compraki-dot"></span> WhatsApp Conectado
          </div>

          <div class="compraki-preview">
            <img id="ck-preview-img" src="" alt="Produto">
            <div>
              <p id="ck-preview-title">Produto</p>
              <span id="ck-preview-price">R$ 0,00</span>
            </div>
          </div>
          
          <div class="compraki-tracking">
            <label>Tag ID Afiliado:</label>
            <input type="text" id="ck-tracking" placeholder="Digite seu Tag ID (meli.la)">
          </div>

          <select id="ck-groups" class="compraki-select">
            <option value="">Selecione um grupo...</option>
          </select>
          
          <button id="ck-send-btn" class="compraki-btn">Enviar Campanha</button>
        </div>
        
        <!-- Estado: Enviando -->
        <div id="ck-state-sending" class="compraki-state">
          <div class="compraki-spinner"></div>
          <p>Enviando mensagem...</p>
        </div>

        <!-- Estado: Sucesso -->
        <div id="ck-state-success" class="compraki-state">
          <h2 style="color: #04d361; font-size:40px; margin:0">Concluído</h2>
          <p style="font-weight:600">Enviado com sucesso!</p>
          <p style="font-size:11px; color:#a8a8b3">A mensagem foi enviada pelo App Desktop.</p>
          <button id="ck-restart-btn" class="compraki-btn" style="margin-top:10px; background: #323238">Enviar para outro grupo</button>
        </div>

        <!-- Estado: Erro -->
        <div id="ck-state-error" class="compraki-state">
          <h2 style="color: #f75a68; font-size:40px; margin:0">Falha</h2>
          <p id="ck-error-msg" style="font-size:12px; color:#f75a68">Erro desconhecido</p>
          <button id="ck-error-retry-btn" class="compraki-btn" style="margin-top:10px; background: #323238">Tentar Novamente</button>
        </div>
      </div>
    </div>
  `;
}

// ============= Lógica do Overlay =============
function switchState(stateId) {
  document.querySelectorAll('.compraki-state').forEach(el => {
    if (el) el.classList.remove('active');
  });
  const target = document.getElementById(stateId);
  if (target) target.classList.add('active');
}

async function initOverlay() {
  // Verificar se WhatsApp Web está aberto
  const waConnected = await checkWhatsAppTab();
  
  if (!waConnected) {
    switchState('ck-state-no-wa');
    return;
  }

  // WhatsApp está aberto, tentar carregar grupos
  switchState('ck-state-loading-groups');
  await loadGroupsWithRetry();
}

async function loadGroupsWithRetry(maxAttempts = 5) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const result = await sendToWhatsApp('GET_GROUPS');
    
    if (result.error) {
      console.log(`Tentativa ${attempt}/${maxAttempts} de buscar grupos...`, result.error);
      
      if (attempt === maxAttempts) {
        switchState('ck-state-error');
        const errMsg = document.getElementById('ck-error-msg');
        if (result.error === 'APP_LOCAL_NOT_FOUND') {
          errMsg.textContent = 'App Compraki Desktop não está rodando. Abra o programa no seu PC.';
        } else {
          errMsg.textContent = result.error || 'Não foi possível carregar os grupos.';
        }
        return;
      }
      
      // Esperar antes de tentar novamente (wa-js pode estar inicializando)
      await new Promise(r => setTimeout(r, 2000));
      continue;
    }
    
    // Sucesso
    if (result.groups && result.groups.length > 0) {
      populateGroups(result.groups);
      showReadyState();
      return;
    } else {
      // Sem grupos mas sem erro - esperar mais
      await new Promise(r => setTimeout(r, 2000));
    }
  }
  
  // Fallback
  switchState('ck-state-error');
  document.getElementById('ck-error-msg').textContent = 'Nenhum grupo encontrado no WhatsApp.';
}

function populateGroups(groups) {
  const select = document.getElementById('ck-groups');
  select.innerHTML = '<option value="">Selecione um grupo...</option>';
  
  // Ordena por nome
  groups.sort((a, b) => a.name.localeCompare(b.name));
  
  groups.forEach(g => {
    const opt = document.createElement('option');
    opt.value = g.id;
    opt.innerText = g.name;
    select.appendChild(opt);
  });

  const lastGroup = localStorage.getItem('compraki_last_group');
  if (lastGroup) {
    const exists = Array.from(select.options).some(opt => opt.value === lastGroup);
    if (exists) select.value = lastGroup;
  }

  select.addEventListener('change', (e) => {
    localStorage.setItem('compraki_last_group', e.target.value);
  });
}

function showReadyState() {
  // Preencher preview do produto
  document.getElementById('ck-preview-img').src = productData.imagemUrl || '';
  document.getElementById('ck-preview-title').innerText = productData.titulo || 'Produto';
  document.getElementById('ck-preview-price').innerText = 'R$ ' + (productData.precoAtual || '0,00');
  
  switchState('ck-state-ready');
}

async function getShortLink(url) {
  try {
    const response = await fetch(`${WORKER_SHORTENER}?url=${encodeURIComponent(url)}`);
    const data = await response.json();
    return data.shorturl || url;
  } catch(e) {
    return url;
  }
}

async function sendPost() {
  const groupId = document.getElementById('ck-groups').value;
  const trackingId = document.getElementById('ck-tracking').value.trim();
  if (!groupId) return alert('Selecione um grupo primeiro!');

  switchState('ck-state-sending');

  let finalLink = productData.urlOriginal.split('?')[0];
  if (trackingId) finalLink += `?tag=${encodeURIComponent(trackingId)}`;

  try {
    const linkCurto = await getShortLink(finalLink);
    let textoPost = `🔥 PRECINHO TOPPPP\n\n*${productData.titulo}*\n\n`;
    if (productData.precoOriginal && productData.precoOriginal !== productData.precoAtual) {
      textoPost += `de ~R$ ${productData.precoOriginal}~\n`;
    }
    textoPost += `💸 por *R$ ${productData.precoAtual}*\n\n🛒 compre aqui\n${linkCurto}`;

    const result = await sendToWhatsApp('SEND_MESSAGE', {
      groupId,
      text: textoPost,
      imageUrl: productData.imagemUrl
    });

    if (result.error) {
      switchState('ck-state-error');
      document.getElementById('ck-error-msg').textContent = 
        result.error === 'APP_LOCAL_NOT_FOUND' ? 'O aplicativo Desktop não está aberto.' :
        result.error;
    } else if (result.success) {
      switchState('ck-state-success');
    } else {
      switchState('ck-state-error');
      document.getElementById('ck-error-msg').textContent = 'Resposta inesperada do WhatsApp.';
    }
  } catch(e) {
    switchState('ck-state-error');
    document.getElementById('ck-error-msg').textContent = 'Erro de comunicação: ' + e.message;
  }
}

// ============= Inject e Setup =============
function injectOverlay() {
  if (document.getElementById('compraki-overlay')) return;
  document.body.insertAdjacentHTML('beforeend', htmlOverlay());

  productData = extrairDadosProduto();

  // Fechar
  document.getElementById('ck-close').onclick = () => {
    document.getElementById('compraki-overlay').remove();
  };
  
  const trackingInput = document.getElementById('ck-tracking');
  trackingInput.value = localStorage.getItem('compraki_tracking_id') || "";
  trackingInput.addEventListener('input', (e) => localStorage.setItem('compraki_tracking_id', e.target.value));

  // Retry - reconectar
  document.getElementById('ck-retry-btn').onclick = () => {
    switchState('ck-state-checking');
    initOverlay();
  };

  // Enviar
  document.getElementById('ck-send-btn').onclick = sendPost;
  
  // Reiniciar
  document.getElementById('ck-restart-btn').onclick = () => showReadyState();

  // Retry de erro
  document.getElementById('ck-error-retry-btn').onclick = () => {
    switchState('ck-state-checking');
    initOverlay();
  };

  // Iniciar
  initOverlay();
}

// Responder a mensagens do popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "EXTRACT_PRODUCT") {
    sendResponse(extrairDadosProduto());
  }
});

// Auto-injetar se estiver numa página de produto
if (document.querySelector('.ui-pdp-title')) {
  setTimeout(injectOverlay, 1500); 
}
