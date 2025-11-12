import React, { createContext, useState,useEffect, useContext, ReactNode } from 'react';
import io from 'socket.io-client';
// Definir la forma del contexto
interface ChatContextProps {
  currentOpenChatLinkKey: string | null;
  setCurrentOpenChatLinkKey: (linkKey: string | null) => void;
}
const socket = io('https://chatback.devscolima.com');
// Crear el contexto con valores por defecto
const ChatContext = createContext<ChatContextProps>({
  currentOpenChatLinkKey: null,
  setCurrentOpenChatLinkKey: () => {},
});

// Provider para envolver la app
export const ChatProvider = ({ children }: { children: ReactNode }) => {
  const [currentOpenChatLinkKey, setCurrentOpenChatLinkKey] = useState<string | null>(null);

  return (
    <ChatContext.Provider value={{ currentOpenChatLinkKey, setCurrentOpenChatLinkKey }}>
      {children}
    </ChatContext.Provider>
  );
};

// Hook para usarlo más fácil
export const useChat = () => useContext(ChatContext);

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
