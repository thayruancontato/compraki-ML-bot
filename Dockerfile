# Usar imagem oficial do Node 20 (Debian Bookworm)
FROM node:20

# Instalar dependências para o Chrome e o próprio Google Chrome Stable
RUN apt-get update && apt-get install -y wget gnupg ca-certificates --no-install-recommends \
    && wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | gpg --dearmor -o /usr/share/keyrings/googlechrome-linux-keyring.gpg \
    && echo "deb [arch=amd64 signed-by=/usr/share/keyrings/googlechrome-linux-keyring.gpg] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google-chrome.list \
    && apt-get update \
    && apt-get install -y google-chrome-stable --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Definir diretório de trabalho
WORKDIR /app

# Copiar arquivos de dependências
COPY package*.json ./

# Instalar dependências (PUPPETEER_SKIP_CHROMIUM_DOWNLOAD garante que não baixe um Chrome extra desnecessário)
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable
RUN npm install

# Copiar o restante do código
COPY . .

# Build do dashboard e do backend TypeScript
RUN npm run build:all

# Porta exposta pelo Render
EXPOSE 3000

# Variáveis de Ambiente de Produção
ENV NODE_ENV=production

CMD ["npm", "start"]
