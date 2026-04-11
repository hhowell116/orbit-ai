import { useRef, useCallback } from "react";
import { createOpencodeClient, type OpencodeClient } from "@opencode-ai/sdk";

// Map of project name -> client instance
const clientCache = new Map<string, OpencodeClient>();

function getClient(projectName: string): OpencodeClient {
  if (!clientCache.has(projectName)) {
    const client = createOpencodeClient({
      baseUrl: `/opencode/${projectName}`,
    });
    clientCache.set(projectName, client);
  }
  return clientCache.get(projectName)!;
}

export function useOpenCode(projectName: string) {
  const clientRef = useRef(getClient(projectName));
  const client = clientRef.current;

  const listSessions = useCallback(async () => {
    const { data } = await client.session.list();
    return data ?? [];
  }, [client]);

  const createSession = useCallback(async () => {
    const { data } = await client.session.create();
    return data;
  }, [client]);

  const deleteSession = useCallback(
    async (sessionId: string) => {
      await client.session.delete({ path: { id: sessionId } });
    },
    [client]
  );

  const getMessages = useCallback(
    async (sessionId: string) => {
      const { data } = await client.session.messages({
        path: { id: sessionId },
      });
      return data ?? [];
    },
    [client]
  );

  const sendMessage = useCallback(
    async (sessionId: string, text: string) => {
      const { data } = await client.session.chat({
        path: { id: sessionId },
        body: {
          parts: [{ type: "text", text }],
        },
      });
      return data;
    },
    [client]
  );

  const sendMessageAsync = useCallback(
    async (sessionId: string, text: string) => {
      const { data } = await client.session.promptAsync({
        path: { id: sessionId },
        body: {
          parts: [{ type: "text", text }],
        },
      });
      return data;
    },
    [client]
  );

  const abortSession = useCallback(
    async (sessionId: string) => {
      await client.session.abort({ path: { id: sessionId } });
    },
    [client]
  );

  const getSessionDiff = useCallback(
    async (sessionId: string) => {
      const { data } = await client.session.diff({
        path: { id: sessionId },
      });
      return data;
    },
    [client]
  );

  const subscribeToEvents = useCallback(
    async (onEvent: (event: any) => void, signal?: AbortSignal) => {
      const result = await client.event.subscribe({ signal });
      if (result && Symbol.asyncIterator in result) {
        for await (const event of result as any) {
          onEvent(event);
        }
      }
    },
    [client]
  );

  return {
    client,
    listSessions,
    createSession,
    deleteSession,
    getMessages,
    sendMessage,
    sendMessageAsync,
    abortSession,
    getSessionDiff,
    subscribeToEvents,
  };
}
