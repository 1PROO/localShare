# Stage 1: Lightweight Node test runner for offline Linux CI / integration tests
FROM node:22-bookworm-slim AS tester

WORKDIR /project

COPY package.json package-lock.json* ./
RUN npm install --ignore-scripts --no-audit --no-fund

COPY . .
RUN npm run generate-icons && npm run build

CMD ["node", "tests/integration.test.js"]

# Stage 2: Wine-enabled Windows NSIS installer builder (electron-builder)
FROM electronuserland/builder:18-wine AS win-builder

WORKDIR /project

ENV CSC_IDENTITY_AUTO_DISCOVERY=false \
    WIN_ARCH=x64

COPY package.json package-lock.json* ./
RUN npm install --ignore-scripts --no-audit --no-fund

COPY . .
RUN chmod +x scripts/docker-build-win.sh

VOLUME ["/project/release"]

CMD ["bash", "scripts/docker-build-win.sh"]
