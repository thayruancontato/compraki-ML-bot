# Usar imagem oficial do Node como base
FROM node:20-slim

# Instalar dependências necessárias para o Chromium no Linux
RUN apt-get update && apt-get install -y \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libgcc1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    lsb-release \
    wget \
    xdg-utils \
    && rm -rf /var/lib/apt/lists/*

# Definir diretório de trabalho
WORKDIR /app

# Copiar arquivos de dependências
COPY package*.json ./

# Instalar dependências (incluindo puppeteer)
RUN npm install

# Copiar o restante do código
COPY . .

# Build do dashboard (se houver) e TypeScript
RUN npm run build:all || echo "Skipping build-all if script not defined; using standard build"
RUN npm run build

# Porta exposta pelo Render
EXPOSE 3000

# Variável para indicar ambiente de produção
ENV NODE_ENV=production
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable

# O Render injeta o Chrome se usarmos o buildpack correto, 
# mas no Docker, o puppeteer geralmente instala o seu próprio.
# Para garantir, deixaremos o puppeteer baixar no npm install ou instalaremos manualmente.

CMD ["npm", "start"]
