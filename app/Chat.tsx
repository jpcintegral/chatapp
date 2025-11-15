// Chat.tsx (componente completo, reemplaza tu versión actual)
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { socket } from '@/hooks/socket';
import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams, useFocusEffect } from 'expo-router';
import CryptoJS from 'crypto-js';
import { useChat } from './ChatContext';

interface Message {
  id: string;
  text: string; // encrypted text
  sender: string;
  to?: string;
  timestamp: number;
}

interface Contact {
  id: string;
  name: string;
  key: string;
  linkKey: string;
}

interface ChatHistory {
  contact: Contact;
  messages: Message[]; // stored encrypted
  lastTimestamp: number;
  lastMessage: string; // encrypted
  unreadCount: number;
}

export default function Chat() {
  const { contactName, id, key, linkKey } = useLocalSearchParams<{
    contactName: string;
    id: string;
    key: string;
    linkKey: string;
  }>();

  const contact: Contact = {
    id: id || '',
    name: contactName || 'Contacto',
    key: key || id || '',
    linkKey: linkKey || key || id || '',
  };

  const storageKey = `chat_${contact.linkKey}`;
  const [deviceId, setDeviceId] = useState<string>('');
  const { isOnline } = useOnlineStatus(contact.id);
  const [messages, setMessages] = useState<Message[]>([]); // in-memory (encrypted)
  const [input, setInput] = useState('');
  const { setCurrentOpenChatLinkKey, updateChatFromStorage } = useChat();
  const [inputHeight, setInputHeight] = useState(40);

  // encryption key (keep same as you have)
  const secretKey = 'mi_clave_secreta_123';

  // decrypt UI control
  const [isDecrypted, setIsDecrypted] = useState(false);
  const [tapCount, setTapCount] = useState(0);
  const tapTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // helper: sort by timestamp (asc)
  const sortMessages = (arr: Message[]) =>
    arr.slice().sort((a, b) => a.timestamp - b.timestamp);

  // --- encryption helpers (symmetric, same as your current impl) ---
  const encryptMessage = (text: string) => {
    try {
      const iv = CryptoJS.enc.Utf8.parse(secretKey.substring(0, 16));
      const encrypted = CryptoJS.AES.encrypt(
        text,
        CryptoJS.enc.Utf8.parse(secretKey),
        { iv },
      );
      return encrypted.toString();
    } catch (e) {
      console.error('Error encriptando mensaje:', e);
      return text;
    }
  };

  const decryptMessage = (encrypted: string) => {
    try {
      const iv = CryptoJS.enc.Utf8.parse(secretKey.substring(0, 16));
      const bytes = CryptoJS.AES.decrypt(
        encrypted,
        CryptoJS.enc.Utf8.parse(secretKey),
        { iv },
      );
      const decrypted = bytes.toString(CryptoJS.enc.Utf8);
      return decrypted || encrypted;
    } catch {
      return encrypted;
    }
  };

  // triple-tap header logic
  useEffect(() => {
    if (tapCount === 3) {
      setIsDecrypted(true);
      setTapCount(0);
      if (tapTimeoutRef.current) clearTimeout(tapTimeoutRef.current);
    }
  }, [tapCount]);

  const handleHeaderPress = () => {
    if (isDecrypted) {
      setIsDecrypted(false);
      setTapCount(0);
      if (tapTimeoutRef.current) clearTimeout(tapTimeoutRef.current);
    } else {
      setTapCount((prev) => prev + 1);
      if (tapTimeoutRef.current) clearTimeout(tapTimeoutRef.current);
      tapTimeoutRef.current = setTimeout(() => setTapCount(0), 2000);
    }
  };

  // deviceId generation (persisted)
  useEffect(() => {
    const loadDeviceId = async () => {
      try {
        let id = await AsyncStorage.getItem('deviceId');
        if (!id) {
          id = 'device_' + Date.now() + '_' + Math.floor(Math.random() * 10000);
          await AsyncStorage.setItem('deviceId', id);
        }
        setDeviceId(id);
      } catch (err) {
        console.error('Error cargando deviceId:', err);
      }
    };
    loadDeviceId();
  }, []);

  // update current open chat in context while this screen is active
  useEffect(() => {
    setCurrentOpenChatLinkKey(contact.linkKey);
    return () => {
      setCurrentOpenChatLinkKey('');
    };
  }, [contact.linkKey, setCurrentOpenChatLinkKey]);

  // --- Load local storage (encrypted) immediately on mount ---
  useEffect(() => {
    let mounted = true;
    const loadLocal = async () => {
      try {
        const raw = await AsyncStorage.getItem(storageKey);
        if (!raw) return;
        const parsed: ChatHistory = JSON.parse(raw);
        if (!mounted) return;
        // messages are stored encrypted, show them as-is (will be decrypted when isDecrypted)
        setMessages(sortMessages(parsed.messages || []));
      } catch (err) {
        console.error('Error cargando chat local:', err);
      }
    };
    loadLocal();
    return () => {
      mounted = false;
    };
  }, [storageKey]);

  // --- Socket integration: join room, request server history, listen receive/response ---
  useEffect(() => {
    if (!deviceId) return;

    // ensure socket connected (global socket should be created in hook)
    if (!socket.connected) {
      try {
        socket.connect();
      } catch (e) {
        console.warn('socket.connect failed', e);
      }
    }

    // join the chat room for this conversation
    socket.emit('joinChat', contact.linkKey);

    // Request server's canonical history for this chat (the server filters by userId)
    socket.emit('requestChatHistory', {
      linkKey: contact.linkKey,
      userId: deviceId,
    });

    // Handler: full history response from server
    const onChatHistoryResponse = ({
      linkKey: lk,
      messages: serverMessages,
    }: {
      linkKey: string;
      messages: Message[];
    }) => {
      if (lk !== contact.linkKey) return;

      // Merge server messages and local messages (both encrypted), dedupe by id
      (async () => {
        try {
          // get local stored (may be more than in-memory if app loaded from ChatList)
          const raw = await AsyncStorage.getItem(storageKey);
          let localMsgs: Message[] = [];
          if (raw) {
            const parsed: ChatHistory = JSON.parse(raw);
            localMsgs = parsed.messages || [];
          } else {
            localMsgs = messages || [];
          }

          // combine server + local (server likely authoritative); ensure unique by id
          const combinedMap = new Map<string, Message>();
          // prefer server message for same id (server up-to-date)
          for (const m of localMsgs) combinedMap.set(m.id, m);
          for (const m of serverMessages || []) combinedMap.set(m.id, m);

          const merged = sortMessages(Array.from(combinedMap.values()));

          // update UI & storage
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
          // update chat list via context
          updateChatFromStorage({
            contact,
            messages: merged,
            lastMessage: merged[merged.length - 1]?.text || '',
            lastTimestamp: merged[merged.length - 1]?.timestamp || 0,
          });
        } catch (err) {
          console.error('Error al mergear historial servidor/local:', err);
        }
      })();
    };

    // Handler: incoming single message (from server via receiveMessage)
    const onReceiveMessage = async (msg: Message) => {
      if (!msg || !contact?.linkKey) return;
      if ((msg as any).linkKey && (msg as any).linkKey !== contact.linkKey)
        return;

      // 1. Actualizar estado
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        return sortMessages([...prev, msg]);
      });

      // 2. Persistir de manera separada
      try {
        const key = `chat_${contact.linkKey}`;
        const raw = await AsyncStorage.getItem(key);
        let localMsgs: Message[] = raw ? JSON.parse(raw).messages || [] : [];

        if (!localMsgs.some((m) => m.id === msg.id)) {
          localMsgs.push(msg);
        }

        localMsgs = sortMessages(localMsgs);

        await AsyncStorage.setItem(
          key,
          JSON.stringify({
            contact,
            messages: localMsgs,
            lastMessage: localMsgs[localMsgs.length - 1]?.text || '',
            lastTimestamp: localMsgs[localMsgs.length - 1]?.timestamp || 0,
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
    };

    // register listeners (make sure we don't duplicate handlers)
    socket.off('chatHistoryResponse', onChatHistoryResponse);
    socket.on('chatHistoryResponse', onChatHistoryResponse);

    socket.off('receiveMessage', onReceiveMessage);
    socket.on('receiveMessage', onReceiveMessage);

    // If you want ChatList to be aware of chat updates (already handled in your server via chatListUpdate),
    // you don't need to handle here — server emits chatListUpdate globally.

    // cleanup: remove listeners and optionally leave room
    return () => {
      socket.off('chatHistoryResponse', onChatHistoryResponse);
      socket.off('receiveMessage', onReceiveMessage);
      // optionally tell server we leave the room (server may ignore if not implemented)
    };
  }, [contact.linkKey, deviceId]); // re-run if contact or deviceId changes

  // --- Save chat to AsyncStorage every time messages change (always encrypted) ---
  useEffect(() => {
    const persist = async () => {
      try {
        if (!messages || messages.length === 0) {
          await AsyncStorage.removeItem(storageKey);
          // also notify chat list about empty chat
          updateChatFromStorage({
            contact,
            messages: [],
            lastMessage: '',
            lastTimestamp: 0,
          });
          return;
        }
        // messages already encrypted (we store the text as-is)
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

  // --- When screen regains focus, reload any messages from storage that might not be in state ---
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      const reloadFromStorage = async () => {
        try {
          const raw = await AsyncStorage.getItem(storageKey);
          if (!raw || cancelled) return;

          const parsed: ChatHistory = JSON.parse(raw);
          const stored = parsed.messages || [];

          // Merge con memoria actual
          setMessages((prev) => {
            const map = new Map(prev.map((m) => [m.id, m]));
            for (const m of stored) {
              if (!map.has(m.id)) map.set(m.id, m);
            }
            return sortMessages(Array.from(map.values()));
          });

          // Solicitar historial al servidor para ver si hay mensajes faltantes
          if (deviceId) {
            console.log('🔄 Revalidando historial al entrar al chat...');
            socket.emit('requestChatHistory', {
              linkKey: contact.linkKey,
              userId: deviceId,
            });
          }
        } catch (err) {
          console.error('Error al recargar desde storage en focus:', err);
        }
      };

      reloadFromStorage();
      return () => {
        cancelled = true;
      };
    }, [storageKey, contact.linkKey, deviceId]),
  );

  // reset unread on mount
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(storageKey);
        if (!raw) return;
        const parsed: ChatHistory = JSON.parse(raw);
        parsed.unreadCount = 0;
        await AsyncStorage.setItem(storageKey, JSON.stringify(parsed));
      } catch (err) {
        /* ignore */
      }
    })();
  }, [storageKey]);

  // send message
  const sendMessage = async () => {
    if (!input.trim()) return;

    if (!socket.connected) {
      Alert.alert('Sin conexión', 'No hay conexión al servidor.');
      return;
    }

    const encrypted = encryptMessage(input.trim());
    const msg: Message = {
      id: 'msg_' + Date.now(),
      text: encrypted,
      sender: deviceId,
      to: contact.id,
      timestamp: Date.now(),
    };

    setInput('');

    // Añadir en memoria (validado)
    setMessages((prev) => {
      if (prev.some((m) => m.id === msg.id)) return prev;
      return sortMessages([...prev, msg]);
    });

    // Guardar en storage
    (async () => {
      const raw = await AsyncStorage.getItem(storageKey);
      const stored = raw ? JSON.parse(raw).messages || [] : [];

      if (!stored.some((m) => m.id === msg.id)) stored.push(msg);

      await AsyncStorage.setItem(
        storageKey,
        JSON.stringify({
          contact,
          messages: stored,
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
    })();

    socket.emit('sendMessage', {
      linkKey: contact.linkKey,
      message: msg,
      sender: deviceId,
      to: contact.id,
    });
  };

  // helper to render decrypted/encrypted text based on isDecrypted
  const displayText = (m: Message) =>
    isDecrypted ? decryptMessage(m.text) : m.text;

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return `${date.getHours()}:${date.getMinutes().toString().padStart(2, '0')}`;
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <TouchableOpacity onPress={handleHeaderPress}>
        <Text style={styles.header}>
          {isDecrypted ? contact.name : encryptMessage(contact.name)}
        </Text>
        <Text style={{ textAlign: 'center', color: '#666', marginBottom: 6 }}>
          {isOnline ? 'En línea' : 'Desconectado'}
        </Text>
      </TouchableOpacity>

      <FlatList
        ref={(r) => {
          /* no-op: keep important ref if needed */
        }}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => {
          const isMine = item.sender === deviceId;
          return (
            <View
              style={[
                styles.messageWrapper,
                isMine ? styles.myMessageWrapper : styles.contactMessageWrapper,
              ]}
            >
              <View
                style={
                  isMine
                    ? styles.myMessageContainer
                    : styles.contactMessageContainer
                }
              >
                <Text
                  style={
                    isMine ? styles.myMessageText : styles.contactMessageText
                  }
                >
                  {displayText(item)}
                </Text>
                <Text style={styles.timestamp}>
                  {formatTime(item.timestamp)}
                </Text>
              </View>
            </View>
          );
        }}
        contentContainerStyle={{ paddingVertical: 10, paddingBottom: 60 }}
      />

      <View style={styles.inputContainer}>
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder="Escribe un mensaje..."
          style={[styles.input, { height: Math.min(120, inputHeight) }]}
          onContentSizeChange={(event) => {
            setInputHeight(event.nativeEvent.contentSize.height);
          }}
          multiline
        />
        <TouchableOpacity onPress={sendMessage} style={styles.sendButton}>
          <Text style={styles.sendText}>Enviar</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#e5ddd5', padding: 10 },
  header: {
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 4,
    color: '#333',
  },
  messageWrapper: { marginVertical: 4, maxWidth: '80%', paddingHorizontal: 5 },
  myMessageWrapper: { alignSelf: 'flex-end' },
  contactMessageWrapper: { alignSelf: 'flex-start' },
  myMessageContainer: {
    backgroundColor: '#DCF8C6',
    borderRadius: 15,
    padding: 10,
  },
  contactMessageContainer: {
    backgroundColor: '#FFF',
    borderRadius: 15,
    padding: 10,
  },

  myMessageText: { color: '#000', fontSize: 16 },
  contactMessageText: { color: '#333', fontSize: 16 },
  timestamp: {
    fontSize: 10,
    color: '#888',
    alignSelf: 'flex-end',
    marginTop: 4,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderColor: '#ddd',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  input: {
    flex: 1,
    backgroundColor: '#f1f1f1',
    borderRadius: 25,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === 'ios' ? 12 : 8,
    fontSize: 16,
    color: '#333',
    maxHeight: 120,
  },
  sendButton: {
    backgroundColor: '#34B7F1',
    borderRadius: 25,
    paddingHorizontal: 18,
    paddingVertical: 10,
    marginLeft: 8,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 3,
  },
  sendText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
});
