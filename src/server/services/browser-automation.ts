import { Browser, Page, launch } from 'puppeteer-core';
import { EventEmitter } from 'events';
import path from 'path';
import fs from 'fs';

export interface Product {
  id: string;
  title: string;
  price: string;
  thumbnail: string;
  permalink: string;
  commission: string;
}

// Helper: converte URL de thumbnail do ML para alta resolução
function toHighRes(url: string): string {
  if (!url) return url;
  // Padrão ML: ...-I.webp ou ...-V.webp -> ...-O.webp (original/grande)
  return url.replace(/-[A-Z](\.(webp|jpg|png|jpeg))/i, '-O$1');
}

export class BrowserAutomationService extends EventEmitter {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private userDataDir = path.join(process.cwd(), '.ml_session');
  private isScraping: boolean = false;
  private isProcessingManual: boolean = false;
  private processedProducts: Set<string> = new Set();
  private _headless: boolean = false;

  setHeadless(value: boolean) {
    this._headless = value;
  }

  async start() {
    try {
      if (!fs.existsSync(this.userDataDir)) {
        fs.mkdirSync(this.userDataDir, { recursive: true });
      }

      console.log(`[Browser] Iniciando navegador em MODO VISÍVEL...`);
      this.browser = await launch({
        executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        headless: false,
        defaultViewport: null,
        userDataDir: this.userDataDir,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--start-maximized'
        ]
      });

      const pages = await this.browser.pages();
      this.page = pages.length > 0 ? pages[0] : await this.browser.newPage();
      
      this.page.on('console', msg => {
        const text = msg.text();
        if (text.includes('[Bot]')) console.log('[Browser Console]', text);
      });

      console.log('[Browser] Navegador iniciado com sucesso.');
    } catch (error) {
      console.error('[Browser Error] Falha ao iniciar navegador:', error);
      throw error;
    }
  }

  async gotoHub() {
    if (!this.page) await this.start();
    const hubUrl = 'https://www.mercadolivre.com.br/afiliados/hub?is_affiliate=true#menu-user';
    console.log(`[Browser] Navegando para o Hub: ${hubUrl}`);
    await this.page!.goto(hubUrl, { waitUntil: 'networkidle2' });
  }

  async stopScraping() {
    this.isScraping = false;
  }

  async startScraping(): Promise<void> {
    if (!this.page) return;
    if (this.isScraping) {
      console.log('[Browser] Varredura já está em execução. Ignorando novo pedido.');
      return;
    }

    this.isScraping = true;
    console.log('[Browser] Iniciando varredura com captura de links síncrona...');

    try {
      while (this.isScraping) {
        if (this.isProcessingManual) {
          await new Promise(r => setTimeout(r, 1000));
          continue;
        }

        try {
          const items = await this.page!.evaluate(() => {
            const cardSelectors = ['.andes-card', '.hub-card', '[class*="card"]', '.ui-search-result', '.poly-card'];
            const cards = Array.from(document.querySelectorAll(cardSelectors.join(',')));
            
            return cards.map(card => {
              const titleEl = card.querySelector('h1, h2, h3, h4, p, [class*="title"], .poly-component__title') as HTMLElement;
              const urlEl = card.querySelector('a') as HTMLAnchorElement;
              const imgEl = card.querySelector('img') as HTMLImageElement;
              
              if (!titleEl || !urlEl || !imgEl) return null;
              if (card.textContent?.includes('Publicidade')) return null;

              const title = titleEl.innerText.trim();
              const url = urlEl.href;
              const thumbnail = imgEl.src || imgEl.getAttribute('data-src') || '';
              
              if (title.length < 5 || title.includes('selecionados para você')) return null;

              let price = 'R$ 0,00';
              const priceContainer = card.querySelector('.andes-money-amount--combined, .poly-price__current');
              if (priceContainer) {
                const fraction = priceContainer.querySelector('.andes-money-amount__fraction')?.textContent || '';
                const cents = priceContainer.querySelector('.andes-money-amount__cents')?.textContent || '00';
                const symbol = priceContainer.querySelector('.andes-money-amount__currency-symbol')?.textContent || 'R$';
                if (fraction) price = `${symbol} ${fraction},${cents}`;
              }

              let commission = '';
              const deepestGanhosEl = Array.from(card.querySelectorAll('*')).filter(el => {
                const text = el.textContent?.toUpperCase() || '';
                return text.includes('GANHOS') && 
                       !Array.from(el.children).some(child => child.textContent?.toUpperCase().includes('GANHOS'));
              })[0];

              if (deepestGanhosEl) {
                const text = deepestGanhosEl.textContent || '';
                const percMatch = text.match(/\d+%/);
                commission = percMatch ? percMatch[0] : text.replace(/GANHOS EXTRAS|GANHOS|Ganhos/gi, '').trim();
              }

              return { id: title + thumbnail, title, url, thumbnail, price, commission };
            }).filter(i => i !== null);
          });

          if (items && items.length > 0) {
            for (const item of items) {
              if (!item) continue;
              if (!this.isScraping) break;
              if (this.processedProducts.has(item.id)) continue;

              const product: Product = {
                id: Buffer.from(item.id).toString('base64').substring(0, 16),
                title: item.title,
                price: item.price,
                thumbnail: item.thumbnail,
                permalink: item.url,
                commission: item.commission
              };

              this.processedProducts.add(item.id);
              this.emit('scraped-product', product);
              console.log(`[Browser] 📦 Produto detectado: ${item.title.substring(0, 30)}...`);
            }
          }

          if (this.isScraping) {
            await this.page!.evaluate(() => window.scrollBy(0, 800));
            await new Promise(r => setTimeout(r, 1000));
          }
        } catch (evalErr: any) {
          if (evalErr.message.includes('detached') || evalErr.message.includes('Navigation')) {
            console.log('[Browser] Perda de contexto detectada. Aguardando estabilização...');
            await new Promise(r => setTimeout(r, 2000));
            if (!this.page || this.page.isClosed()) await this.start();
          } else {
            console.error('[Browser Error] Erro de avaliação:', evalErr);
          }
        }

        await new Promise(r => setTimeout(r, 5000));
      }
    } catch (error) {
      console.error('[Browser Error] Erro fatal na varredura:', error);
      this.isScraping = false;
    }
  }

  async getAffiliateLink(productTitle: string, productThumb: string): Promise<string> {
    if (!this.page) await this.start();
    this.isProcessingManual = true;
    
    try {
      // 1. Garante que estamos no Hub e limpa o estado
      try {
        if (!this.page!.url().includes('/afiliados/hub')) await this.gotoHub();
      } catch (e) {
        await this.start();
        await this.gotoHub();
      }
      
      // 2. Fecha modais antigos que possam estar abertos
      await this.page!.evaluate(() => {
        const modals = Array.from(document.querySelectorAll('.andes-modal--show, .andes-modal, [role="dialog"]'));
        modals.forEach(m => (m.querySelector('.andes-modal__close-button') as HTMLElement)?.click());
      });
      await new Promise(r => setTimeout(r, 500));

      // 3. Localiza o card e as coordenadas do botão de compartilhar
      const buttonPos = await this.page!.evaluate((title: string, thumb: string) => {
        const getImgId = (url: string) => {
          const match = url.match(/MLB\d+/);
          return match ? match[0] : (url.split('/').pop() || '');
        };
        const targetThumbId = getImgId(thumb);
        const cards = Array.from(document.querySelectorAll('.andes-card, .hub-card, .poly-card, .ui-search-result'));
        
        const card = cards.find(c => {
          const imgs = Array.from(c.querySelectorAll('img'));
          if (imgs.some(img => getImgId(img.src || img.getAttribute('data-src') || '') === targetThumbId)) return true;
          const txt = c.textContent?.toLowerCase() || '';
          return txt.includes(title.toLowerCase().substring(0, 20));
        }) as HTMLElement;

        if (!card) return null;
        card.scrollIntoView({ block: 'center' });

        const btn = Array.from(card.querySelectorAll('button, [role="button"]')).find(b => {
          const t = b.textContent?.toLowerCase() || '';
          return t.includes('compartilhar') || t.includes('ganhar');
        }) as HTMLElement;

        if (!btn) return null;
        const rect = btn.getBoundingClientRect();
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      }, productTitle, productThumb);

      if (!buttonPos) {
        console.error('[Bot] Não foi possível encontrar o botão de compartilhar');
        return '';
      }

      // 4. Clica no botão "Compartilhar" usando o mouse
      await this.page!.mouse.click(buttonPos.x, buttonPos.y);
      console.log('[Bot] Clicou em "Compartilhar". Aguardando modal...');
      await new Promise(r => setTimeout(r, 3000));

      // 5. Ler o link meli.la diretamente do textarea/input do modal
      let affiliateLink = '';
      for (let i = 0; i < 15; i++) {
        affiliateLink = await this.page!.evaluate(() => {
          // Busca textareas com link meli.la
          const textareas = Array.from(document.querySelectorAll('textarea'));
          for (const ta of textareas) {
            const val = (ta as HTMLTextAreaElement).value;
            if (val.includes('meli.la')) return val.trim();
          }
          // Fallback: inputs
          const inputs = Array.from(document.querySelectorAll('input[type="text"], input:not([type])'));
          for (const inp of inputs) {
            const val = (inp as HTMLInputElement).value;
            if (val.includes('meli.la')) return val.trim();
          }
          return '';
        });

        if (affiliateLink) {
          console.log(`[Bot] ✅ Link de afiliado capturado: ${affiliateLink}`);
          return affiliateLink;
        }

        console.log(`[Bot] Tentativa ${i + 1}/15 - Link ainda não carregou no modal...`);
        await new Promise(r => setTimeout(r, 1500));
      }

      console.error('[Bot] ❌ Não foi possível capturar o link meli.la após 15 tentativas.');
      return '';
    } catch (err) {
      console.error('[Browser Error] Erro em getAffiliateLink:', err);
      return '';
    } finally {
      this.isProcessingManual = false;
      try {
        await this.page?.keyboard.press('Escape');
        await new Promise(r => setTimeout(r, 300));
        await this.page?.mouse.click(10, 10);
      } catch (e) {}
    }
  }

  async nextPage(): Promise<boolean> {
    if (!this.page) return false;
    try {
      const nextBtn = await this.page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button, .andes-button, a'));
        const btn = btns.find(b => b.textContent?.toLowerCase().includes('próxima') || b.textContent?.toLowerCase().includes('next')) as HTMLElement;
        if (btn) {
          btn.click();
          return true;
        }
        return false;
      });
      if (nextBtn) {
        await new Promise(r => setTimeout(r, 2000));
        await this.page.waitForSelector('.andes-card, .hub-card, [class*="card"]', { timeout: 5000 }).catch(() => {});
      }
      return nextBtn;
    } catch (e) {
      console.error('[Browser] Erro ao ir para próxima página:', e);
      return false;
    }
  }

  async generateArtwork(product: Product): Promise<Buffer> {
    if (!this.browser) await this.start();
    const artPage = await this.browser!.newPage();
    try {
      await artPage.setViewport({ width: 800, height: 800 });
      
      const html = `
        <html>
        <head>
          <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700;800&display=swap" rel="stylesheet">
          <style>
            body { margin: 0; padding: 0; font-family: 'Inter', sans-serif; background: #f0f2f5; display: flex; align-items: center; justify-content: center; height: 100vh; }
            .card { width: 600px; background: white; border-radius: 32px; overflow: hidden; box-shadow: 0 20px 40px rgba(0,0,0,0.15); display: flex; flex-direction: column; position: relative; }
            .badge { position: absolute; top: 20px; left: 20px; background: #fff159; padding: 8px 16px; border-radius: 12px; font-weight: 800; font-size: 14px; text-transform: uppercase; letter-spacing: 1px; color: #333; z-index: 10; box-shadow: 0 4px 10px rgba(0,0,0,0.1); }
            .image-container { width: 100%; height: 400px; background: white; display: flex; align-items: center; justify-content: center; padding: 40px; box-sizing: border-box; }
            .image-container img { max-width: 100%; max-height: 100%; object-fit: contain; }
            .content { padding: 40px; background: white; display: flex; flex-direction: column; }
            .title { font-size: 24px; font-weight: 700; color: #1a1a1a; margin: 0 0 20px 0; line-height: 1.3; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
            .price-row { display: flex; align-items: baseline; gap: 10px; margin-bottom: 20px; }
            .price { font-size: 48px; font-weight: 800; color: #00a650; }
            .footer { background: #333; padding: 24px 40px; display: flex; align-items: center; justify-content: space-between; color: white; }
            .promo-tag { font-size: 16px; font-weight: 600; opacity: 0.8; }
            .compraki { font-size: 20px; font-weight: 800; color: #fff159; }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="badge">Oferta Imperdível</div>
            <div class="image-container">
              <img src="${product.thumbnail}" />
            </div>
            <div class="content">
              <div class="title">${product.title}</div>
              <div class="price-row">
                <div class="price">${product.price}</div>
              </div>
            </div>
            <div class="footer">
              <div class="promo-tag">Aproveite enquanto dura!</div>
              <div class="compraki">COMPRAKI</div>
            </div>
          </div>
        </body>
        </html>
      `;

      await artPage.setContent(html);
      await artPage.waitForNetworkIdle();
      
      const element = await artPage.$('.card');
      const buffer = await element!.screenshot({ type: 'png' }) as Buffer;
      return buffer;
    } finally {
      await artPage.close();
    }
  }

  async getProductByUrl(url: string): Promise<Product | null> {
    if (!this.page) await this.start();
    this.isProcessingManual = true;
    
    try {
      console.log(`[Browser] Navegando para produto selecionado: ${url}`);
      await this.page!.goto(url, { waitUntil: 'networkidle2' });
      
      // 1. Extrair detalhes básicos da página
      // Aguarda o título ou o preço aparecerem (essenciais)
      try {
        await this.page!.waitForSelector('.ui-pdp-title, h1, .andes-money-amount', { timeout: 10000 });
      } catch (e) {
        console.warn('[Browser] Aviso: Tempo esgotado aguardando seletores principais. Tentando extrair assim mesmo.');
      }

      const details = await this.page!.evaluate(() => {
        // Título: Prioridade para a classe oficial do PDP
        const titleEl = document.querySelector('.ui-pdp-title') || 
                        document.querySelector('h1.ui-pdp-title') ||
                        document.querySelector('h1');
        
        // Preço: Busca o valor principal (andes-money-amount é o padrão atual do ML)
        // Tentamos primeiro o preço em destaque (Buy Box ou principal)
        const priceEl = document.querySelector('.ui-pdp-buybox .andes-money-amount') ||
                        document.querySelector('.ui-pdp-price .andes-money-amount') ||
                        document.querySelector('.ui-pdp-price__second-line .andes-money-amount') ||
                        document.querySelector('.andes-money-amount');

        // Imagem: Busca imagem de zoom ou imagem principal da galeria
        const zoomImg = document.querySelector('img[data-zoom]') as HTMLImageElement;
        const mainImg = document.querySelector('.ui-pdp-gallery__figure__image, .ui-pdp-image, .ui-pdp-gallery__image, [data-testid="pdp-gallery-image"]') as HTMLImageElement;
        
        let imgSrc = '';
        if (zoomImg) {
          imgSrc = zoomImg.getAttribute('data-zoom') || zoomImg.src;
        } else if (mainImg) {
          imgSrc = mainImg.src;
        } else {
          // Fallback final para qualquer imagem de produto
          const allImgs = Array.from(document.querySelectorAll('img[src*="MLB"]'));
          if (allImgs.length > 0) imgSrc = (allImgs[0] as HTMLImageElement).src;
        }
        
        return {
          title: titleEl ? (titleEl as HTMLElement).innerText.trim() : null,
          price: priceEl ? (priceEl as HTMLElement).innerText.replace(/\n/g, ' ').trim() : null,
          thumbnail: imgSrc
        };
      });

      if (!details || !details.title) {
        console.error('[Bot] Erro Crítico: Não foi possível encontrar o título do produto.');
        console.log('[Bot] Estado do DOM:', details);
        return null;
      }

      // Limpeza básica do preço
      if (details.price) {
        // Remove textos extras como "reais", "centavos" que o innerText pode trazer
        details.price = details.price.replace(/\s+/g, ' ');
      } else {
        details.price = 'R$ 0,00';
      }

      // 2. Clicar no botão azul "Compartilhar" na barra de afiliados
      const shareBtnPos = await this.page!.evaluate(() => {
        // Busca pelo seletor exato do botão (frequentemente ID P0-1 ou P1-1)
        const btn = document.querySelector('button.generate_link_button') as HTMLElement ||
                    document.querySelector('[id^="P0-"]') as HTMLElement ||
                    document.querySelector('[id^="P1-"]') as HTMLElement;
        if (btn) {
          const rect = btn.getBoundingClientRect();
          return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        }
        // Fallback: procura botão com texto "Compartilhar" no topo
        const btns = Array.from(document.querySelectorAll('button'));
        const topBtn = btns.find(b => {
          const rect = b.getBoundingClientRect();
          return rect.top < 80 && b.textContent?.includes('Compartilhar');
        });
        if (topBtn) {
          const rect = topBtn.getBoundingClientRect();
          return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        }
        return null;
      });

      if (!shareBtnPos) {
        console.error('[Bot] Botão "Compartilhar" não encontrado na página.');
        return null;
      }

      // Clique via mouse para ser mais natural
      await this.page!.mouse.click(shareBtnPos.x, shareBtnPos.y);
      console.log('[Browser] Clicou em "Compartilhar". Aguardando modal...');
      await new Promise(r => setTimeout(r, 3000));

      // 3. Ler o link meli.la diretamente do textarea do modal
      let affiliateLink = '';
      for (let i = 0; i < 15; i++) {
        affiliateLink = await this.page!.evaluate(() => {
          // 1. Busca em textareas
          const textareas = Array.from(document.querySelectorAll('textarea'));
          for (const ta of textareas) {
            const val = (ta as HTMLTextAreaElement).value;
            if (val.includes('meli.la')) return val.trim();
          }
          // 2. Busca em inputs
          const inputs = Array.from(document.querySelectorAll('input'));
          for (const inp of inputs) {
            const val = (inp as HTMLInputElement).value;
            if (val.includes('meli.la')) return val.trim();
          }
          // 3. Busca no texto visível de qualquer elemento do modal/dialog
          const modals = document.querySelectorAll('[role="dialog"], .andes-modal, .andes-modal--show');
          for (const modal of Array.from(modals)) {
            const allEls = modal.querySelectorAll('span, div, p, a');
            for (const el of Array.from(allEls)) {
              const text = (el as HTMLElement).innerText?.trim() || '';
              if (text.startsWith('https://meli.la/')) return text;
            }
          }
          // 4. Busca global na página por links meli.la visíveis
          const allLinks = document.querySelectorAll('a[href*="meli.la"]');
          if (allLinks.length > 0) return (allLinks[0] as HTMLAnchorElement).href;
          return '';
        });

        if (affiliateLink) {
          console.log(`[Browser] ✅ Link de afiliado capturado: ${affiliateLink}`);
          break;
        }

        console.log(`[Browser] Tentativa ${i + 1}/15 - Link ainda não carregou no modal...`);
        await new Promise(r => setTimeout(r, 1500));
      }

      return {
        id: Buffer.from(details.title).toString('base64').substring(0, 16),
        title: details.title,
        price: details.price,
        thumbnail: toHighRes(details.thumbnail),
        permalink: affiliateLink || url,
        commission: ''
      };
    } catch (err) {
      console.error('[Browser Error] Erro em getProductByUrl:', err);
      return null;
    } finally {
      this.isProcessingManual = false;
      try {
        await this.page?.keyboard.press('Escape');
        await this.page?.mouse.click(10, 10);
      } catch (e) {}
    }
  }
}

export const browserService = new BrowserAutomationService();
