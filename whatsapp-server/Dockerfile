FROM node:18-slim

# Install latest chrome dev package and fonts to support major charsets
RUN apt-get update \
    && apt-get install -y wget gnupg git \
    && wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - \
    && sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list' \
    && apt-get update \
    && apt-get install -y google-chrome-stable fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst fonts-freefont-ttf libxss1 \
      --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Configurando o Working Directory
WORKDIR /usr/src/app

# Copiando configs
COPY package*.json ./

# Instalando dependencias
# A flag abaixo impede que o puppeteer baixe seu proprio chrome, já que instalamos de forma otimizada acima
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD true

RUN npm install --no-audit --no-fund

# Copiando todo o codigo
COPY . .

# Expondo a porta dinamicamente
EXPOSE 3000

# Iniciando o servidor
CMD ["node", "index.js"]
