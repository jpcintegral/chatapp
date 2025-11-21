import { useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { socket } from '@/hooks/socket';
import { Message } from '@/interfaces/message.interface';

export const useMessageActions = ({
  messages,
  setMessages,
  storageKey,
  contact,
  updateChatFromStorage,
}: any) => {
  const [selectedMessages, setSelectedMessages] = useState<Message[]>([]);
  const isSelectionMode = selectedMessages.length > 0;

  // ---------------------------
  //  LongPress → iniciar selección
  // ---------------------------
  const handleLongPress = (message: Message) => {
    if (!isSelectionMode) {
      // iniciar selección con solo este
      setSelectedMessages([message]);
    }
  };

  // ---------------------------
  //  Tap normal → alternar selección
  // ---------------------------
  const toggleSelect = (message: Message) => {
    if (!isSelectionMode) return; // si no está en selección → no hacer nada

    setSelectedMessages((prev) => {
      if (prev.some((m) => m.id === message.id)) {
        return prev.filter((m) => m.id !== message.id);
      }
      return [...prev, message];
    });
  };

  // ---------------------------
  //  Cancelar selección
  // ---------------------------
  const clearSelection = () => setSelectedMessages([]);

  // ---------------------------
  //  Eliminar múltiples mensajes
  // ---------------------------
  const deleteSelectedMessages = async () => {
    if (selectedMessages.length === 0) return;

    const idsToDelete = selectedMessages.map((m) => m.id);

    // 1️⃣ actualizar UI
    setMessages((prev: Message[]) =>
      prev.filter((m) => !idsToDelete.includes(m.id)),
    );

    // 2️⃣ actualizar Local Storage
    try {
      const raw = await AsyncStorage.getItem(storageKey);
      const stored = raw ? JSON.parse(raw).messages || [] : [];

      const updated = stored.filter(
        (m: Message) => !idsToDelete.includes(m.id),
      );

      await AsyncStorage.setItem(
        storageKey,
        JSON.stringify({
          contact,
          messages: updated,
          lastMessage: updated[updated.length - 1]?.text || '',
          lastTimestamp: updated[updated.length - 1]?.timestamp || 0,
          unreadCount: 0,
        }),
      );

      updateChatFromStorage({
        contact,
        messages: updated,
        lastMessage: updated[updated.length - 1]?.text || '',
        lastTimestamp: updated[updated.length - 1]?.timestamp || 0,
      });
    } catch (e) {
      console.error('Error eliminando mensajes locales:', e);
    }

    // 3 Sync server
    socket.emit('deleteMessages', {
      linkKey: contact.linkKey,
      messageIds: idsToDelete,
    });

    // 4️ salir modo selección
    clearSelection();
  };

  return {
    selectedMessages,
    isSelectionMode,
    handleLongPress,
    toggleSelect,
    deleteSelectedMessages,
    clearSelection,
  };
};
