FROM node:18-alpine

WORKDIR /app

# Copy backend dependencies and install
COPY backend/package.json backend/package-lock.json* ./backend/
RUN cd backend && npm install

# Copy all project files
COPY . .

EXPOSE 3001

CMD ["node", "backend/server.js"]
