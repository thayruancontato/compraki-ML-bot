const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
(async () => {
  const userDataDir = path.join(process.cwd(), '.ml_session');
  console.log('Iniciando puppeteer visível...');
  const browser = await puppeteer.launch({
    executablePath: 'C:\\\\Program Files\\\\Google\\\\Chrome\\\\Application\\\\chrome.exe',
    headless: false,
    userDataDir: userDataDir,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--start-maximized']
  });
  const page = await browser.newPage();
  console.log('Navegando para o Hub...');
  await page.goto('https://www.mercadolivre.com.br/afiliados/hub?is_affiliate=true#menu-user', { waitUntil: 'networkidle2', timeout: 60000 });
  
  console.log('Aguardando página carregar...');
  await new Promise(r => setTimeout(r, 6000));

  try {
    const cardHtml = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('.poly-card, .andes-card, .hub-card, .ui-search-result'));
      // Acha um card que tenha um botão de compartilhar
      const target = cards.find(c => {
        const btns = Array.from(c.querySelectorAll('button, [role="button"]'));
        return btns.some(b => {
          const txt = (b.textContent || '').toLowerCase();
          return txt.includes('compartilhar') || txt.includes('ganhar') || (b.getAttribute('aria-label') || '').includes('compartilhar');
        });
      });
      if (target) {
        // Clica no botão
        const btn = Array.from(target.querySelectorAll('button, [role="button"]')).find(b => {
          const txt = (b.textContent || '').toLowerCase();
          return txt.includes('compartilhar') || txt.includes('ganhar') || (b.getAttribute('aria-label') || '').includes('compartilhar');
        });
        if (btn) btn.click();
        return target.outerHTML;
      }
      return 'Nenhum card de produto encontrado';
    });
    fs.writeFileSync('card_dump.html', cardHtml);
    console.log('Card HTML salvo.');
    
    console.log('Aguardando modal abrir...');
    await new Promise(r => setTimeout(r, 5000));
    
    const modalHtml = await page.evaluate(() => {
      // Pega todos os modais da tela
      const modals = Array.from(document.querySelectorAll('.andes-modal, .andes-modal--show, [role="dialog"], .andes-visual-modal'));
      // Acha o modal que contem "Copiar"
      const targetModal = modals.find(m => m.textContent && m.textContent.toLowerCase().includes('copiar'));
      if (targetModal) return targetModal.outerHTML;
      // Fallback
      return modals.length > 0 ? modals.map(m => m.outerHTML).join('\\n\\n') : 'Nenhum modal encontrado';
    });
    fs.writeFileSync('modal_dump.html', modalHtml);
    console.log('Modal HTML salvo.');
  } catch(e) {
    console.error('Erro:', e.message);
  }
  
  await browser.close();
})();
