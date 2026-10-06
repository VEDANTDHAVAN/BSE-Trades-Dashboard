import { useEffect, useState } from "react";
import { socket } from "../lib/socket";

export function useSocket() {
  const [connected, setConnected] = useState(socket.connected);

  useEffect(() => {
    function handleConnect() {
      setConnected(true);
      console.log("[socket] connected", socket.id);
    }

    function handleDisconnect(reason: string) {
      setConnected(false);
      console.log("[socket] disconnected", reason);
    }

    function handleConnectError(error: Error) {
      console.error("[socket] connection error", error);
    }

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("connect_error", handleConnectError);

    socket.connect();

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("connect_error", handleConnectError);

      socket.disconnect();
    };
  }, []);

  return {
    connected,
    socket,
  };
}