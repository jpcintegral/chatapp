import { useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { socket } from '@/hooks/socket';
import { sortMessages } from '@/utils/sortMessages';
import { Message } from '@/interfaces/message.interface';

export const useChatSocket = ({
  contact,
  myDeviceId,
  storageKey,
  setMessages,
  updateChatFromStorage,
  setChatContact,
}: any) => {
  useEffect(() => {
    //console.log('🔌 useChatSocket iniciado para:', myDeviceId);
    if (!myDeviceId || !contact.linkKey) return;

    // --- Función para unirse al chat y solicitar historial ---
    const joinAndRequestHistory = async () => {
      if (!socket.connected) {
        try {
          await socket.connect();
        } catch (e) {
          console.warn('socket.connect failed', e);
        }
      }
      socket.emit('joinUser', contact.id);
      socket.emit('joinChat', contact.linkKey);
      socket.emit('requestChatHistory', {
        linkKey: contact.linkKey,
        userId: myDeviceId,
      });
      socket.emit('requestContactDeviceId', {
        linkKey: contact.linkKey,
        myDeviceId: myDeviceId,
      });
    };

    joinAndRequestHistory();

    // --- Manejo de la respuesta del historial ---
    const onChatHistoryResponse = async ({
      linkKey: lk,
      messages: serverMessages,
    }: any) => {
      if (lk !== contact.linkKey) return;

      try {
        const raw = await AsyncStorage.getItem(storageKey);
        const local: Message[] = raw ? JSON.parse(raw).messages || [] : [];

        // Merge local + servidor, eliminando duplicados
        const map = new Map<string, Message>();
        for (const m of local) map.set(m.id, m);
        for (const m of serverMessages || []) map.set(m.id, m);

        const merged = sortMessages([...map.values()]);

        // Actualizar UI
        setMessages(merged);

        // Guardar en AsyncStorage
        await AsyncStorage.setItem(
          storageKey,
          JSON.stringify({
            contact,
            messages: merged,
            lastMessage: merged[merged.length - 1]?.text || '',
            lastTimestamp: merged[merged.length - 1]?.timestamp || 0,
            unreadCount: 0,
          }),
        );

        // Actualizar contexto global
        updateChatFromStorage({
          contact,
          messages: merged,
          lastMessage: merged[merged.length - 1]?.text || '',
          lastTimestamp: merged[merged.length - 1]?.timestamp || 0,
        });
      } catch (err) {
        console.error('Error mergeando historial:', err);
      }
    };

    // --- Manejo de mensajes entrantes ---
    const onReceiveMessage = async (msg: Message) => {
      if (!msg || msg.linkKey !== contact.linkKey) return;

      setMessages((prev: Message[]) => {
        if (prev.some((m) => m.id === msg.id)) return prev;

        const updated = sortMessages([...prev, msg]);

        // Guardar en AsyncStorage y actualizar contexto
        (async () => {
          try {
            await AsyncStorage.setItem(
              storageKey,
              JSON.stringify({
                contact,
                messages: updated,
                lastMessage: msg.text,
                lastTimestamp: msg.timestamp,
                unreadCount: 0,
              }),
            );

            updateChatFromStorage({
              contact,
              messages: [msg],
              lastMessage: msg.text,
              lastTimestamp: msg.timestamp,
            });
          } catch (err) {
            console.error('Error guardando mensaje:', err);
          }
        })();

        return updated;
      });
    };

    // ---Escuchar mensajes eliminados ---
    const onMessagesDeleted = async ({
      messageIds,
    }: {
      messageIds: string[];
    }) => {
      if (!Array.isArray(messageIds) || messageIds.length === 0) return;
      console.log('🗑️ Mensajes eliminados recibidos:', messageIds);
      setMessages((prev: Message[]) => {
        const filtered = prev.filter((m) => !messageIds.includes(m.id));

        (async () => {
          try {
            await AsyncStorage.setItem(
              storageKey,
              JSON.stringify({
                contact,
                messages: filtered,
                lastMessage: filtered[filtered.length - 1]?.text || '',
                lastTimestamp: filtered[filtered.length - 1]?.timestamp || 0,
                unreadCount: 0,
              }),
            );

            updateChatFromStorage({
              contact,
              messages: filtered,
              lastMessage: filtered[filtered.length - 1]?.text || '',
              lastTimestamp: filtered[filtered.length - 1]?.timestamp || 0,
            });
          } catch (err) {
            console.error('Error actualizando después de delete:', err);
          }
        })();

        return filtered;
      });
    };

    // --- Manejo del deviceId del contacto ---
    const onContactDeviceId = ({ deviceId, linkKey }) => {
      if (linkKey !== contact.linkKey) return;

      console.log('📡 Device ID REAL del contacto recibido:', deviceId);

      const updated = { ...contact, deviceId };

      // Actualizar estado local del Chat
      setChatContact(updated);

      // Actualizar storage / context
      updateChatFromStorage({
        contact: updated,
        messages: [],
        lastMessage: '',
        lastTimestamp: 0,
      });
    };

    // --- Registrar listeners ---
    socket.off('chatHistoryResponse', onChatHistoryResponse);
    socket.on('chatHistoryResponse', onChatHistoryResponse);

    socket.off('receiveMessage', onReceiveMessage);
    socket.on('receiveMessage', onReceiveMessage);

    socket.off('messagesDeleted', onMessagesDeleted);
    socket.on('messagesDeleted', onMessagesDeleted);

    //--recuperar deviceId del contacto ---
    socket.off('contactDeviceId', onContactDeviceId);
    socket.on('contactDeviceId', onContactDeviceId);

    // --- Cleanup ---
    return () => {
      socket.off('chatHistoryResponse', onChatHistoryResponse);
      socket.off('receiveMessage', onReceiveMessage);
      socket.off('messagesDeleted', onMessagesDeleted);
      socket.off('contactDeviceId', onContactDeviceId);
    };
  }, [contact.linkKey, myDeviceId]);
};
