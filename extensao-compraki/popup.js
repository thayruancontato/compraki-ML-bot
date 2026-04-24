document.addEventListener('DOMContentLoaded', async () => {
  const loader = document.getElementById('loader');
  const errorPanel = document.getElementById('error-panel');
  const waErrorPanel = document.getElementById('wa-error-panel');
  const contentPanel = document.getElementById('content-panel');
  const btnCopy = document.getElementById('btn-copy');
  const btnSendWa = document.getElementById('btn-send-wa');
  const btnConfirmSend = document.getElementById('btn-confirm-send');
  const groupSelector = document.getElementById('group-selector');
  const groupSelect = document.getElementById('group-select');
  const successMsg = document.getElementById('success-msg');
  const copySuccessMsg = document.getElementById('copy-success-msg');
  const waIndicator = document.getElementById('wa-indicator');
  const waStatusText = document.getElementById('wa-status-text');
  const statusDot = waIndicator.querySelector('.status-dot');
  
  const imgEl = document.getElementById('product-img');
  const titleEl = document.getElementById('product-title');
  const oldPriceEl = document.getElementById('product-old-price');
  const newPriceEl = document.getElementById('product-new-price');
  const inputTracking = document.getElementById('tracking-id');

  // Load saved tracking ID
  const savedTrackingId = localStorage.getItem('compraki_tracking_id');
  if (savedTrackingId) inputTracking.value = savedTrackingId;
  inputTracking.addEventListener('input', (e) => {
    localStorage.setItem('compraki_tracking_id', e.target.value);
  });

  let productData = null;
  let waConnected = false;
  let groupsLoaded = false;

  // === Verificar WhatsApp Web ===
  async function checkWA() {
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

  async function updateWAStatus() {
    waConnected = await checkWA();
    if (waConnected) {
      statusDot.className = 'status-dot connected';
      waStatusText.textContent = 'App Conectado';
      btnSendWa.disabled = false;
    } else {
      statusDot.className = 'status-dot disconnected';
      waStatusText.textContent = 'App Fechado';
      btnSendWa.disabled = true;
    }
  }

  await updateWAStatus();

  // (removido btnOpenWa)

  // === Obter dados do produto ===
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab || !tab.url.includes("mercadolivre.com.br")) {
    loader.classList.remove('active');
    errorPanel.classList.remove('hidden');
    errorPanel.classList.add('active');
    return;
  }

  chrome.tabs.sendMessage(tab.id, { action: "EXTRACT_PRODUCT" }, (response) => {
    loader.classList.remove('active');
    
    if (chrome.runtime.lastError || !response || !response.titulo) {
      errorPanel.classList.remove('hidden');
      errorPanel.classList.add('active');
      return;
    }

    productData = response;

    if (productData.imagemUrl) imgEl.src = productData.imagemUrl;
    titleEl.textContent = productData.titulo;
    
    if (productData.precoOriginal && productData.precoOriginal !== productData.precoAtual) {
      oldPriceEl.textContent = 'R$ ' + productData.precoOriginal;
      oldPriceEl.classList.remove('hidden');
    }
    
    newPriceEl.textContent = 'R$ ' + (productData.precoAtual || "Consultar");

    contentPanel.classList.remove('hidden');
    contentPanel.classList.add('active');
  });

  // === Envio WhatsApp Web Direto ===
  btnSendWa.addEventListener('click', async () => {
    if (!waConnected) {
      await updateWAStatus();
      if (!waConnected) {
        alert('Abra o Aplicativo Compraki Desktop no seu PC primeiro!');
        return;
      }
    }

    // Toggle group selector
    if (!groupSelector.classList.contains('hidden')) {
      groupSelector.classList.add('hidden');
      return;
    }

    // Carregar grupos
    if (!groupsLoaded) {
      groupSelect.innerHTML = '<option value="">Carregando grupos...</option>';
      groupSelector.classList.remove('hidden');

      const result = await new Promise((resolve) => {
        chrome.runtime.sendMessage(
          { type: "COMPRAKI_WA_COMMAND", action: "GET_GROUPS" },
          (response) => {
            if (chrome.runtime.lastError) {
              resolve({ error: "Erro de comunicação" });
            } else {
              resolve(response || { error: "Sem resposta" });
            }
          }
        );
      });

      if (result.error) {
        groupSelect.innerHTML = `<option value="">Erro: ${result.error}</option>`;
        return;
      }

      if (result.groups && result.groups.length > 0) {
        groupSelect.innerHTML = '<option value="">Selecione um grupo...</option>';
        result.groups.sort((a, b) => a.name.localeCompare(b.name));
        result.groups.forEach(g => {
          const opt = document.createElement('option');
          opt.value = g.id;
          opt.innerText = g.name;
          groupSelect.appendChild(opt);
        });
        
        const lastGroup = localStorage.getItem('compraki_last_group_popup');
        if (lastGroup) {
          const exists = Array.from(groupSelect.options).some(opt => opt.value === lastGroup);
          if (exists) groupSelect.value = lastGroup;
        }

        groupSelect.addEventListener('change', (e) => {
          localStorage.setItem('compraki_last_group_popup', e.target.value);
        });

        groupsLoaded = true;
      } else {
        groupSelect.innerHTML = '<option value="">Nenhum grupo encontrado</option>';
      }
    } else {
      groupSelector.classList.remove('hidden');
    }
  });

  // === Confirmar envio ===
  btnConfirmSend.addEventListener('click', async () => {
    const groupId = groupSelect.value;
    if (!groupId) {
      alert('Selecione um grupo!');
      return;
    }
    if (!productData) return;

    const originalText = btnConfirmSend.innerHTML;
    btnConfirmSend.innerHTML = 'Processando...';
    btnConfirmSend.disabled = true;

    try {
      const trackingId = inputTracking.value.trim();
      let finalLink = productData.urlOriginal.split('?')[0];
      if (trackingId) finalLink = `${finalLink}?tag=${encodeURIComponent(trackingId)}`;

      // Encurtar link
      let linkCurto = finalLink;
      try {
        const shortRes = await fetch(`https://compraki-ml-bridge.thayrufino2.workers.dev/shorten?url=${encodeURIComponent(finalLink)}`);
        const shortData = await shortRes.json();
        linkCurto = shortData.shorturl || finalLink;
      } catch(e) { /* usa link original */ }

      let textoPost = `🔥 PRECINHO TOPPPP\n\n*${productData.titulo}*\n\n`;
      if (productData.precoOriginal && productData.precoOriginal !== productData.precoAtual) {
        textoPost += `de ~R$ ${productData.precoOriginal}~\n`;
      }
      textoPost += `💸 por *R$ ${productData.precoAtual}*\n\n🛒 compre aqui\n${linkCurto}`;

      const result = await new Promise((resolve) => {
        chrome.runtime.sendMessage(
          { type: "COMPRAKI_WA_COMMAND", action: "SEND_MESSAGE", data: {
            groupId,
            text: textoPost,
            imageUrl: productData.imagemUrl
          }},
          (response) => {
            if (chrome.runtime.lastError) {
              resolve({ error: "Erro de comunicação" });
            } else {
              resolve(response || { error: "Sem resposta" });
            }
          }
        );
      });

      if (result.success) {
        groupSelector.classList.add('hidden');
        successMsg.classList.remove('hidden');
        setTimeout(() => successMsg.classList.add('hidden'), 5000);
      } else {
        alert('Erro ao enviar: ' + (result.error || 'Desconhecido'));
      }
    } catch (err) {
      alert('Erro: ' + err.message);
    } finally {
      btnConfirmSend.innerHTML = originalText;
      btnConfirmSend.disabled = false;
    }
  });

  // === Copiar Imagem + Texto (funcionalidade original) ===
  btnCopy.addEventListener('click', async () => {
    if (!productData) return;
    
    const originalText = btnCopy.innerHTML;
    btnCopy.innerHTML = '<span class="spinner" style="width: 14px; height: 14px; margin:0; border-width: 2px;"></span> Copiando...';
    btnCopy.disabled = true;

    try {
      const trackingId = inputTracking.value.trim();
      let finalLink = productData.urlOriginal.split('?')[0];
      if (trackingId) finalLink = `${finalLink}?tag=${encodeURIComponent(trackingId)}`;

      let textoPost = `🔥 PRECINHO TOPPPP\n\n*${productData.titulo}*\n\n`;
      if (productData.precoOriginal && productData.precoOriginal !== productData.precoAtual) {
        textoPost += `de ~R$ ${productData.precoOriginal}~\n`;
      }
      textoPost += `💸 por *R$ ${productData.precoAtual}*\n\n🛒 compre aqui\n${finalLink}`;

      let imageBlob = null;
      if (productData.imagemUrl) {
        const fetchRes = await fetch(productData.imagemUrl);
        const sourceBlob = await fetchRes.blob();
        imageBlob = await createImagePngBlob(sourceBlob);
      }

      const clipboardData = {
        'text/plain': new Blob([textoPost], { type: 'text/plain' })
      };
      if (imageBlob) clipboardData['image/png'] = imageBlob;

      const clipboardItem = new ClipboardItem(clipboardData);
      await navigator.clipboard.write([clipboardItem]);

      copySuccessMsg.classList.remove('hidden');
      setTimeout(() => copySuccessMsg.classList.add('hidden'), 5000);
    } catch (err) {
      console.error("Erro ao copiar:", err);
      alert("Erro ao copiar: " + err.message);
    } finally {
      btnCopy.innerHTML = originalText;
      btnCopy.disabled = false;
    }
  });
});

// Utility to convert any image blob to PNG
async function createImagePngBlob(imageBlob) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(imageBlob);
    
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Falha ao gerar PNG"));
      }, "image/png");
    };
    img.onerror = () => reject(new Error("Falha ao carregar imagem"));
    img.crossOrigin = "Anonymous";
    img.src = url;
  });
}
