FROM node:18-slim

# Install Docker CLI
RUN apt-get update && \
    apt-get install -y docker.io git && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 3000

CMD ["node", "src/server.js"]
