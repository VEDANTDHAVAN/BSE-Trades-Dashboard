import { useEffect, useState } from "react";
import { socket } from "../lib/socket";
import type { PullCompletedPayload } from "../lib/api";

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
  onPullCompleted?: (payload: PullCompletedPayload) => void,
) {
  const [connected, setConnected] = useState(socket.connected);

  useEffect(() => {
    function handleConnect() {
      setConnected(true);
    }

    function handleDisconnect(reason: string) {
      setConnected(false);
      console.log("[socket] disconnected", reason);
    }

    function handleConnectError(error: Error) {
      console.error("[socket] connection error", error);
    }

    function handleTradeCreated(trade: TradeCreatedPayload) {
      onTradeCreated?.(trade);
    }

    function handlePullCompleted(payload: PullCompletedPayload) {
      onPullCompleted?.(payload);
    }

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("connect_error", handleConnectError);
    socket.on("trade:created", handleTradeCreated);
    socket.on("pull:completed", handlePullCompleted);

    socket.connect();

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("connect_error", handleConnectError);
      socket.off("trade:created", handleTradeCreated);
      socket.off("pull:completed", handlePullCompleted);

      socket.disconnect();
    };
  }, [onTradeCreated, onPullCompleted]);

  return {
    connected,
    socket,
  };
}
