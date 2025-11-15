import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
  createContext,
  useState,
  useEffect,
  useContext,
  ReactNode,
} from 'react';
import { socket } from '@/hooks/socket';

interface ChatContextProps {
  currentOpenChatLinkKey: string | null;
  setCurrentOpenChatLinkKey: (linkKey: string | null) => void;

  chats: any;
  setChats: React.Dispatch<React.SetStateAction<any>>;

  updateChatFromStorage: (chatHistory: any) => void;
  reloadChatsFromStorage: () => Promise<void>;
}

// --------------------
// CONTEXTO BASE
// --------------------
const ChatContext = createContext<ChatContextProps>({
  currentOpenChatLinkKey: null,
  setCurrentOpenChatLinkKey: () => {},

  chats: {},
  setChats: () => {},

  updateChatFromStorage: () => {},
  reloadChatsFromStorage: async () => {},
});

// --------------------
// PROVIDER
// --------------------
export const ChatProvider = ({ children }: { children: ReactNode }) => {
  const [currentOpenChatLinkKey, setCurrentOpenChatLinkKey] = useState<
    string | null
  >(null);
  const [chats, setChats] = useState<Record<string, any>>({});

  // 🔹 Función para agregar mensajes desde AsyncStorage sin duplicar
  const updateChatFromStorage = (chatHistory: any) => {
    setChats((prev) => {
      const existing = prev[chatHistory.contact.linkKey];

      if (!existing) {
        return {
          ...prev,
          [chatHistory.contact.linkKey]: chatHistory,
        };
      }

      const existingMsgs = existing.messages || [];
      const newMsgs = chatHistory.messages || [];

      const merged = [
        ...existingMsgs,
        ...newMsgs.filter(
          (msg: any) => !existingMsgs.some((m: any) => m.id === msg.id),
        ),
      ];

      return {
        ...prev,
        [chatHistory.contact.linkKey]: {
          ...existing,
          ...chatHistory,
          messages: merged,
        },
      };
    });
  };

  const reloadChatsFromStorage = async () => {
    const keys = await AsyncStorage.getAllKeys();
    const chatKeys = keys.filter((k) => k.startsWith('chat_'));

    for (const key of chatKeys) {
      const stored = await AsyncStorage.getItem(key);
      if (!stored) continue;

      const parsed = JSON.parse(stored);
      updateChatFromStorage(parsed);
    }
  };

  useEffect(() => {
    reloadChatsFromStorage();
  }, []);

  useEffect(() => {
    socket.on('chatHistoryResponse', async ({ linkKey, messages }) => {
      // 1. leer historial local
      const stored = await AsyncStorage.getItem(`chat_${linkKey}`);
      let localMessages = [];
      if (stored) {
        localMessages = JSON.parse(stored).messages || [];
      }

      // 2. fusionar sin duplicar
      const merged = [
        ...localMessages,
        ...messages.filter(
          (msg) => !localMessages.some((m: any) => m.id === msg.id),
        ),
      ];

      // 3. guardar nuevamente en AsyncStorage
      const chatData = {
        contact: { linkKey },
        messages: merged,
      };
      await AsyncStorage.setItem(`chat_${linkKey}`, JSON.stringify(chatData));

      // 4. actualizar el context
      updateChatFromStorage(chatData);
    });

    return () => {
      socket.off('chatHistoryResponse');
    };
  }, []);

  return (
    <ChatContext.Provider
      value={{
        currentOpenChatLinkKey,
        setCurrentOpenChatLinkKey,
        chats,
        setChats,
        updateChatFromStorage,
        reloadChatsFromStorage,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
};

// Hook para acceder rápido al contexto
export const useChat = () => useContext(ChatContext);

// --------------------
// ONLINE STATUS HOOK
// --------------------
export function useOnlineStatus() {
  const [onlineUsers, setOnlineUsers] = useState<Record<string, boolean>>({});

  useEffect(() => {
    socket.on('userStatus', ({ linkKey, status }) => {
      setOnlineUsers((prev) => ({
        ...prev,
        [linkKey]: status === 'online',
      }));
    });

    return () => {
      socket.off('userStatus');
    };
  }, []);

  return { onlineUsers, socket };
}
