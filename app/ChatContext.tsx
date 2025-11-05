import React, { createContext, useState, useContext, ReactNode } from 'react';

// Definir la forma del contexto
interface ChatContextProps {
  currentOpenChatLinkKey: string | null;
  setCurrentOpenChatLinkKey: (linkKey: string | null) => void;
}

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
