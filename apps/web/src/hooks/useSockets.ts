import { useEffect, useState } from "react";
import { socket } from "../lib/socket";

export interface TradeCreatedPayload {
  tradeId: string;
  client: string;
  symbol: string;
  quantity: number;
  price: number;
  timestamp: string;
}

export function useSocket(
  onTradeCreated?: (trade: TradeCreatedPayload) => void,
) {
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

    function handleTradeCreated(trade: TradeCreatedPayload) {
      console.log("[socket] trade:created", trade);
      onTradeCreated?.(trade);
    }

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("connect_error", handleConnectError);
    socket.on("trade:created", handleTradeCreated);

    socket.connect();

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("connect_error", handleConnectError);
      socket.off("trade:created", handleTradeCreated);

      socket.disconnect();
    };
  }, [onTradeCreated]);

  return {
    connected,
    socket,
  };
}