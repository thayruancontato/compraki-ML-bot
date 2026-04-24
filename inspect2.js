const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
(async () => {
  const userDataDir = path.join(process.cwd(), '.ml_session');
  console.log('Iniciando puppeteer visível...');
  const browser = await puppeteer.launch({
    executablePath: 'C:\\\\Program Files\\\\Google\\\\Chrome\\\\Application\\\\chrome.exe',
    headless: false, // VISIBLE!
    userDataDir: userDataDir,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--start-maximized']
  });
  const page = await browser.newPage();
  console.log('Navegando para o Hub...');
  await page.goto('https://www.mercadolivre.com.br/afiliados/hub?is_affiliate=true#menu-user', { waitUntil: 'networkidle2', timeout: 60000 });
  
  console.log('Aguardando página carregar de verdade...');
  await new Promise(r => setTimeout(r, 5000));

  try {
    const cardHtml = await page.$eval('.poly-card, .andes-card, .hub-card, .ui-search-result', el => el.outerHTML).catch(() => 'Card não encontrado');
    fs.writeFileSync('card_dump.html', cardHtml);
    console.log('Card HTML salvo.');
    
    // Clica no botão de compartilhar
    await page.evaluate(() => {
      const card = document.querySelector('.poly-card, .andes-card, .hub-card, .ui-search-result');
      if (card) {
          const btn = Array.from(card.querySelectorAll('button, [role="button"]')).find(b => {
            const text = (b.textContent || '').toLowerCase();
            return text.includes('compartilhar') || text.includes('ganhar') || (b.getAttribute('aria-label') || '').includes('compartilhar');
          });
          if (btn) btn.click();
      }
    });
    
    console.log('Aguardando modal abrir...');
    await new Promise(r => setTimeout(r, 4000));
    
    const modalHtml = await page.evaluate(() => {
      const modal = document.querySelector('.andes-modal, .andes-modal--show, [role="dialog"], .andes-visual-modal');
      return modal ? modal.outerHTML : 'Modal não encontrado';
    });
    fs.writeFileSync('modal_dump.html', modalHtml);
    console.log('Modal HTML salvo.');
  } catch(e) {
    console.error('Erro:', e.message);
  }
  
  // Salva toda a pagina pra debug
  const html = await page.content();
  fs.writeFileSync('page_full.html', html);
  
  await browser.close();
})();
