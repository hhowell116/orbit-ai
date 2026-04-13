import { useState, useEffect, useRef, useCallback } from "react";

const BRIDGE_URL = "ws://127.0.0.1:9876";

interface BridgeState {
  connected: boolean;
  output: string[];
}

export function useBridge() {
  const [state, setState] = useState<BridgeState>({ connected: false, output: [] });
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<number | null>(null);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    try {
      const ws = new WebSocket(BRIDGE_URL);
      ws.onopen = () => {
        setState((s) => ({ ...s, connected: true }));
        console.log("[bridge] Connected to Orbit AI desktop app");
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "pty-output" && msg.data) {
            setState((s) => ({
              ...s,
              output: [...s.output.slice(-500), msg.data], // Keep last 500 chunks
            }));
          }
        } catch {}
      };

      ws.onclose = () => {
        setState((s) => ({ ...s, connected: false }));
        wsRef.current = null;
        // Try reconnecting every 5 seconds
        reconnectTimer.current = window.setTimeout(connect, 5000);
      };

      ws.onerror = () => {
        ws.close();
      };

      wsRef.current = ws;
    } catch {
      // Bridge not available — desktop app not running
      setState((s) => ({ ...s, connected: false }));
      reconnectTimer.current = window.setTimeout(connect, 5000);
    }
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return {
    bridgeConnected: state.connected,
    terminalOutput: state.output,
  };
}
