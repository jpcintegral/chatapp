import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams } from 'expo-router';
import io, { Socket } from 'socket.io-client';
import CryptoJS from 'crypto-js';
import { useChat } from './ChatContext';


interface Message {
  id: string;
  text: string;
  sender: string;
  timestamp: number;
  unreadCount?: number;
}

interface ChatHistory {
  contact: { id: string; name: string; key: string; linkKey: string };
  messages: Message[];
  lastTimestamp: number;
  lastMessage: string;
}

export default function Chat() {
  const { contactName, id, key, linkKey } = useLocalSearchParams<{
    contactName: string;
    id: string;
    key: string;
    linkKey: string;
  }>();

  const flatListRef = useRef<FlatList>(null);
  const contact = {
    id: id || '',
    name: contactName || 'Contacto',
    key: key || id || '',
    linkKey: linkKey || key || id || '',
  };
  const storageKey = `chat_${contact.linkKey}`;
  const [deviceId, setDeviceId] = useState<string>('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const socketRef = useRef<Socket | null>(null);
  const { setCurrentOpenChatLinkKey } = useChat();

  const secretKey = 'mi_clave_secreta_123';

  // 🔹 Control de estado de desencriptado
  const [isDecrypted, setIsDecrypted] = useState(false);
  const [tapCount, setTapCount] = useState(0);
  const tapTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const resetUnread = async (linkKey: string) => {
  const key = `chat_${linkKey}`;
  const stored = await AsyncStorage.getItem(key);
  if (!stored) return;

  const chatHistory: ChatHistory = JSON.parse(stored);
  chatHistory.unreadCount = 0;
  await AsyncStorage.setItem(key, JSON.stringify(chatHistory));
};

  // 🔹 Manejo de toques en el encabezado
  const handleHeaderPress = () => {
    if (isDecrypted) {
      // Si ya está desencriptado, un toque lo vuelve a encriptar
      setIsDecrypted(false);
      setTapCount(0);
      if (tapTimeoutRef.current) clearTimeout(tapTimeoutRef.current);
    } else {
      // Si está encriptado, contar taps para desencriptar
      setTapCount(prev => prev + 1);
      if (tapTimeoutRef.current) clearTimeout(tapTimeoutRef.current);
      tapTimeoutRef.current = setTimeout(() => setTapCount(0), 2000); // reinicio tras 2s
    }
  };

useEffect(() => {
  // Cuando se abre este chat, se actualiza el context
  setCurrentOpenChatLinkKey(contact.linkKey);
    console.log("contact.linkKey",contact.linkKey);
  // Limpieza: al salir del chat, resetear
  return () => {
    setCurrentOpenChatLinkKey('');
  };
}, [contact.linkKey,setCurrentOpenChatLinkKey]);

  useEffect(() => {
    if (tapCount === 3) {
      setIsDecrypted(true);
      setTapCount(0);
      if (tapTimeoutRef.current) clearTimeout(tapTimeoutRef.current);
    }
  }, [tapCount]);

  // 🔹 Generar o cargar deviceId único
  useEffect(() => {
    const loadDeviceId = async () => {
      let id = await AsyncStorage.getItem('deviceId');
      if (!id) {
        id = 'device_' + Date.now() + '_' + Math.floor(Math.random() * 10000);
        await AsyncStorage.setItem('deviceId', id);
      }
      setDeviceId(id);
    };
    loadDeviceId();
  }, []);

  // 🔹 Conectar con backend vía Socket.IO
  useEffect(() => {

    
    if (!deviceId) return;

    const socket = io('https://chatback.devscolima.com');
    socketRef.current = socket;

    socket.emit('joinChat', contact.linkKey);

    

    socket.on('receiveMessage', (msg: Message) => {
      setMessages(prev =>
        prev.some(m => m.id === msg.id) ? prev : [...prev, msg]
      );
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    });

    
    return () => socket.disconnect();
  }, [contact.key, deviceId]);

  // 🔹 Cargar chat desde AsyncStorage
 useEffect(() => {
  const loadChat = async () => {
    try {
      const stored = await AsyncStorage.getItem(storageKey);
      if (stored) {
        const parsed: ChatHistory = JSON.parse(stored);

        // Filtrar mensajes menores a 1 hora
        const oneHourAgo = Date.now() - 60 * 60 * 1000;
        const filteredMessages = parsed.messages.filter(
          m => m.timestamp > oneHourAgo
        );

        // Guardar el chat filtrado de nuevo
        const updatedChat: ChatHistory = {
          ...parsed,
          messages: filteredMessages,
          lastMessage: filteredMessages.length
            ? filteredMessages[filteredMessages.length - 1].text
            : '',
          lastTimestamp: filteredMessages.length
            ? filteredMessages[filteredMessages.length - 1].timestamp
            : 0,
        };
        setMessages(filteredMessages);
        await AsyncStorage.setItem(storageKey, JSON.stringify(updatedChat));
      }
    } catch (error) {
      console.error('Error cargando chat:', error);
    }
  };
  loadChat();
}, [storageKey]);


  // 🔹 Guardar chat siempre encriptado
  useEffect(() => {
    const saveChat = async () => {
      try {
         if (messages.length === 0) {
      // Si no hay mensajes, eliminamos del storage
          await AsyncStorage.removeItem(storageKey);
          return;
        }
        const lastMessage = messages[messages.length - 1];
        const chatData: ChatHistory = {
          contact,
          messages: messages.map(m => ({
            ...m,
            text: encryptMessage(decryptMessage(m.text)),
          })),
          lastMessage: lastMessage ? encryptMessage(decryptMessage(lastMessage.text)) : '',
          lastTimestamp: lastMessage ? lastMessage.timestamp : 0,
        };
        await AsyncStorage.setItem(storageKey, JSON.stringify(chatData));
      } catch (error) {
        console.error('Error guardando chat:', error);
      }
    };
    if (messages.length > 0) saveChat();
  }, [messages]);

  useEffect(() => {
  resetUnread(linkKey);
}, []);


  // 🔹 Funciones de cifrado/descifrado
  const encryptMessage = (text: string) => {
    try {
      const iv = CryptoJS.enc.Utf8.parse(secretKey.substring(0, 16));
      const encrypted = CryptoJS.AES.encrypt(text, CryptoJS.enc.Utf8.parse(secretKey), { iv });
      return encrypted.toString();
    } catch (e) {
      console.error('Error encriptando mensaje:', e);
      return text;
    }
  };

  const decryptMessage = (encrypted: string) => {
    try {
      const iv = CryptoJS.enc.Utf8.parse(secretKey.substring(0, 16));
      const bytes = CryptoJS.AES.decrypt(encrypted, CryptoJS.enc.Utf8.parse(secretKey), { iv });
      const decrypted = bytes.toString(CryptoJS.enc.Utf8);
      return decrypted || encrypted;
    } catch {
      return encrypted;
    }
  };

  // 🔹 Enviar mensaje
  const sendMessage = () => {
    if (!input.trim() || !socketRef.current || !deviceId) return;

    const encryptedText = encryptMessage(input);

    const newMessage: Message = {
      id: 'msg_' + Date.now(),
      text: encryptedText,
      sender: deviceId,
      timestamp: Date.now(),
    };

    setMessages(prev => [...prev, newMessage]);
    setInput('');

    socketRef.current.emit('sendMessage', {
      linkKey: contact.linkKey,
      message: newMessage,
      sender: deviceId,
    });
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return `${date.getHours()}:${date.getMinutes().toString().padStart(2, '0')}`;
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={80}
    >
      <TouchableOpacity onPress={handleHeaderPress}>
        <Text style={styles.header}>
          {isDecrypted ? contact.name : encryptMessage(contact.name)}
        </Text>
      </TouchableOpacity>

      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={item => item.id}
        renderItem={({ item }) => {
          const displayText = isDecrypted ? decryptMessage(item.text) : item.text;
          return (
            <View
              style={[
                styles.messageWrapper,
                item.sender === deviceId
                  ? styles.myMessageWrapper
                  : styles.contactMessageWrapper,
              ]}
            >
              <View
                style={
                  item.sender === deviceId
                    ? styles.myMessageContainer
                    : styles.contactMessageContainer
                }
              >
                <Text
                  style={
                    item.sender === deviceId
                      ? styles.myMessageText
                      : styles.contactMessageText
                  }
                >
                  {displayText}
                </Text>
                <Text style={styles.timestamp}>
                  {formatTime(item.timestamp)}
                </Text>
              </View>
            </View>
          );
        }}
        contentContainerStyle={{ paddingVertical: 10 }}
      />

      <View style={styles.inputContainer}>
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder="Escribe un mensaje..."
          style={styles.input}
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
    marginBottom: 10,
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
  timestamp: { fontSize: 10, color: '#888', alignSelf: 'flex-end', marginTop: 4 },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderColor: '#ccc',
    paddingVertical: 6,
    backgroundColor: '#fff',
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 25,
    paddingHorizontal: 15,
    paddingVertical: 8,
    marginRight: 8,
    backgroundColor: '#fff',
  },
  sendButton: {
    backgroundColor: '#34B7F1',
    borderRadius: 25,
    paddingHorizontal: 15,
    paddingVertical: 8,
  },
  sendText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
});
