FROM node:18-alpine

# Install build tools needed to compile sqlite3 from source
RUN apk add --no-cache python3 python3-dev py3-setuptools make g++

WORKDIR /app

# Copy backend dependencies and install
# --ignore-scripts=false ensures sqlite3 native bindings are rebuilt for Linux
COPY backend/package.json ./backend/
RUN cd /app/backend && npm install --build-from-source

# Copy all project files
COPY . .

WORKDIR /app/backend
CMD ["node", "server.js"]
