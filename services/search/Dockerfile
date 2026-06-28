FROM oven/bun:1-slim

WORKDIR /app

# Install dependencies
COPY package.json ./
RUN bun install --production

# Copy source code
COPY index.js ./

EXPOSE 8080
ENV PORT=8080

CMD ["bun", "run", "index.js"]
