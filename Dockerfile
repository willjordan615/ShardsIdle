FROM node:18-alpine

WORKDIR /app

# Copy backend dependencies and install
COPY backend/package.json ./backend/
RUN npm install --prefix backend

# Copy all project files
COPY . .

EXPOSE 3001

WORKDIR /app/backend
CMD ["node", "server.js"]
