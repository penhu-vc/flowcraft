# FlowCraft - 簡單模式 Dockerfile
# 前端 (Vite) + 後端 (Express) 合併運行

FROM node:20-alpine

# 安裝 Chromium（Patchright 需要）
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont

# 設定 Chromium 路徑
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

WORKDIR /app

# 安裝前端依賴
COPY package*.json ./
RUN npm install

# 安裝後端依賴
COPY server/package*.json ./server/
RUN cd server && npm install

# 其他檔案透過 volume mount 掛載（支援 hot reload）

EXPOSE 5173 3001

# 使用 concurrently 同時運行前後端
CMD ["npm", "run", "dev"]
