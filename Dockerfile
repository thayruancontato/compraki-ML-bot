# Usar imagem leve do Node (Alpine) - Sem Chrome necessário!
FROM node:20-alpine

# Instalar apenas o mínimo necessário
RUN apk add --no-cache python3 make g++

# Diretório de trabalho
WORKDIR /app

# Copiar dependências
COPY package*.json ./

# Instalar dependências
RUN npm install

# Copiar código
COPY . .

# Build
RUN npm run build:all

# Porta
EXPOSE 3000

ENV NODE_ENV=production

CMD ["npm", "start"]
