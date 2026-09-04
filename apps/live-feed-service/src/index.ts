import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { createClient } from "redis";

const port = Number(process.env.PORT ?? 3001);
const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CLIENT_ORIGIN ?? "http://localhost:8000"
  }
});

app.get("/health", (_request, response) => {
  response.json({
    status: "ok",
    service: "live-feed-service",
    redisConnected: redis.isOpen,
    checkedAtUtc: new Date().toISOString()
  });
});

io.on("connection", (socket) => {
  socket.emit("status", {
    service: "live-feed-service",
    message: "connected"
  });
});

const redis = createClient({
  url: redisUrl,
  socket: {
    reconnectStrategy: false
  }
});

redis.on("error", (error) => {
  console.warn("Redis is not available for live fan-out yet.", error);
});

httpServer.listen(port, () => {
  console.log(`Live Feed Service listening on http://localhost:${port}`);

  redis.connect().catch((error) => {
    console.warn("Live Feed Service started without Redis for local boot verification.", error);
  });
});
