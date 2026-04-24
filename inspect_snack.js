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
  
  console.log('Aguardando página...');
  await new Promise(r => setTimeout(r, 6000));

  try {
    await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('.poly-card, .andes-card, .hub-card, .ui-search-result'));
      const target = cards.find(c => {
        const btns = Array.from(c.querySelectorAll('button, [role="button"]'));
        return btns.some(b => (b.textContent || '').toLowerCase().includes('compartilhar'));
      });
      if (target) {
        const btn = Array.from(target.querySelectorAll('button, [role="button"]')).find(b => (b.textContent || '').toLowerCase().includes('compartilhar'));
        if (btn) btn.click();
      }
    });
    
    console.log('Aguardando modal e clicando em copiar...');
    await new Promise(r => setTimeout(r, 4000));
    
    await page.evaluate(() => {
      const copyBtn = document.querySelector('#copy_link');
      if (copyBtn) copyBtn.click();
      else {
         const spans = Array.from(document.querySelectorAll('span')).filter(s => s.textContent === 'Copiar link');
         if (spans.length > 0) spans[0].click();
      }
    });

    console.log('Aguardando snackbar...');
    await new Promise(r => setTimeout(r, 1000));

    const snackHtml = await page.evaluate(() => {
      const snacks = Array.from(document.querySelectorAll('.andes-snackbar, .andes-message'));
      return snacks.map(s => s.outerHTML).join('\\n\\n');
    });
    fs.writeFileSync('snack_dump.html', snackHtml || 'Sem snackbar');
    console.log('Snackbar salvo.');
  } catch(e) {
    console.error('Erro:', e.message);
  }
  
  await browser.close();
})();
