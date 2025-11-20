import { useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { socket } from '@/hooks/socket';
import { sortMessages } from '@/utils/sortMessages';
import { Message } from '@/interfaces/message.interface';

export const useChatSocket = ({
  contact,
  deviceId,
  storageKey,
  setMessages,
  updateChatFromStorage,
}: any) => {
  useEffect(() => {
    if (!deviceId || !contact.linkKey) return;

    // --- Función para unirse al chat y solicitar historial ---
    const joinAndRequestHistory = async () => {
      if (!socket.connected) {
        try {
          await socket.connect();
        } catch (e) {
          console.warn('socket.connect failed', e);
        }
      }

      socket.emit('joinChat', contact.linkKey);
      socket.emit('requestChatHistory', {
        linkKey: contact.linkKey,
        userId: deviceId,
      });
    };

    joinAndRequestHistory();

    // --- Manejo de la respuesta del historial ---
    const onChatHistoryResponse = async ({
      linkKey: lk,
      messages: serverMessages,
    }: any) => {
      if (lk !== contact.linkKey) return;
      /*console.log('📨 Historial contact.linkKey:', contact.linkKey);
      console.log(
        '📨 Historial recibido del servidor:',
        JSON.stringify(serverMessages, null, 2),
      );*/
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

    // --- Registrar listeners ---
    socket.off('chatHistoryResponse', onChatHistoryResponse);
    socket.on('chatHistoryResponse', onChatHistoryResponse);

    socket.off('receiveMessage', onReceiveMessage);
    socket.on('receiveMessage', onReceiveMessage);

    // --- Cleanup ---
    return () => {
      socket.off('chatHistoryResponse', onChatHistoryResponse);
      socket.off('receiveMessage', onReceiveMessage);
    };
  }, [contact.linkKey, deviceId]);
};
