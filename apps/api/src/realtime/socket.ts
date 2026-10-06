import { Server } from "socket.io";
import type { Server as HttpServer } from "node:http";

export function createSocketServer(httpServer: HttpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
    },
  });

  io.on("connection", (socket) => {
    console.log(`[socket] connected ${socket.id}`);

    socket.on("disconnect", (reason) => {
      console.log(
        `[socket] disconnected ${socket.id} reason=${reason}`,
      );
    });
  });

  return io;
}