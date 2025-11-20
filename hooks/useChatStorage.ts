import { useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ChatHistory } from '@/interfaces/chat.interface';
import { sortMessages } from '@/utils/sortMessages';
import { Message } from '@/interfaces/message.interface';

export const useChatStorage = ({
  storageKey,
  contact,
  messages,
  setMessages,
  updateChatFromStorage,
}: any) => {
  // Load from storage on mount
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const raw = await AsyncStorage.getItem(storageKey);
        if (!raw) return;

        const parsed: ChatHistory = JSON.parse(raw);
        if (!mounted) return;

        setMessages(sortMessages(parsed.messages || []));
      } catch (err) {
        console.error('Error cargando chat local:', err);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, [storageKey]);

  // Persist whenever messages change
  useEffect(() => {
    const persist = async () => {
      try {
        if (!messages || messages.length === 0) {
          await AsyncStorage.removeItem(storageKey);
          updateChatFromStorage({
            contact,
            messages: [],
            lastMessage: '',
            lastTimestamp: 0,
          });
          return;
        }

        const last = messages[messages.length - 1];
        const chatData: ChatHistory = {
          contact,
          messages,
          lastMessage: last?.text || '',
          lastTimestamp: last?.timestamp || 0,
          unreadCount: 0,
        };

        await AsyncStorage.setItem(storageKey, JSON.stringify(chatData));
      } catch (err) {
        console.error('Error guardando chat en storage:', err);
      }
    };
    persist();
  }, [messages]);

  // Reset unread count
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(storageKey);
        if (!raw) return;

        const parsed = JSON.parse(raw);
        parsed.unreadCount = 0;

        await AsyncStorage.setItem(storageKey, JSON.stringify(parsed));
      } catch {}
    })();
  }, [storageKey]);
};
