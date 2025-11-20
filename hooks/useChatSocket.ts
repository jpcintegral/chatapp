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
    if (!deviceId) return;

    if (!socket.connected) {
      try {
        socket.connect();
      } catch (e) {
        console.warn('socket.connect failed', e);
      }
    }

    socket.emit('joinChat', contact.linkKey);
    socket.emit('requestChatHistory', {
      linkKey: contact.linkKey,
      userId: deviceId,
    });

    const onChatHistoryResponse = async ({
      linkKey: lk,
      messages: serverMessages,
    }: any) => {
      if (lk !== contact.linkKey) return;

      try {
        const raw = await AsyncStorage.getItem(storageKey);
        let local: Message[] = raw ? JSON.parse(raw).messages || [] : [];

        const map = new Map<string, Message>();
        for (const m of local) map.set(m.id, m);
        for (const m of serverMessages || []) map.set(m.id, m);

        const merged = sortMessages([...map.values()]);

        setMessages(merged);

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

        updateChatFromStorage({
          contact,
          messages: merged,
          lastMessage: merged[merged.length - 1]?.text || '',
          lastTimestamp: merged[merged.length - 1]?.timestamp || 0,
        });
      } catch (err) {
        console.error('Error al mergear historial:', err);
      }
    };

    const onReceiveMessage = async (msg: Message) => {
      if (!msg || msg.linkKey !== contact.linkKey) return;
      console.log('Mensaje recibido por socket:', JSON.stringify(msg));
      // ✅ Aquí usamos la función de setMessages con callback
      setMessages((prev: Message[]) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        const updated = sortMessages([...prev, msg]);

        // Guardado en AsyncStorage
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

    socket.off('chatHistoryResponse', onChatHistoryResponse);
    socket.on('chatHistoryResponse', onChatHistoryResponse);

    socket.off('receiveMessage', onReceiveMessage);
    socket.on('receiveMessage', onReceiveMessage);

    return () => {
      socket.off('chatHistoryResponse', onChatHistoryResponse);
      socket.off('receiveMessage', onReceiveMessage);
    };
  }, [contact.linkKey, deviceId]);
};
