import { socket } from '@/hooks/socket';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { useChat } from './ChatContext';
import { useLocalSearchParams, useFocusEffect } from 'expo-router';
import React, { useState, useRef, useCallback } from 'react';
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
import { useHeaderTap } from '@/hooks/useHeaderTap';
import { useChatStorage } from '@/hooks/useChatStorage';
import { useChatSocket } from '@/hooks/useChatSocket';
import { encryptMessage, decryptMessage } from '@/utils/chatEncryption';
import { formatTime } from '@/utils/time';
import { Message } from '@/interfaces/message.interface';
import { Contact } from '@/interfaces/contact.interface';
import AsyncStorage from '@react-native-async-storage/async-storage';

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
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const { setCurrentOpenChatLinkKey, updateChatFromStorage } = useChat();
  const [inputHeight, setInputHeight] = useState(40);

  const { isDecrypted, handleHeaderPress } = useHeaderTap();

  // --- Hook que carga/persiste/merge mensajes desde AsyncStorage ---
  useChatStorage({
    storageKey,
    contact,
    messages,
    setMessages,
    updateChatFromStorage,
  });

  // --- Hook que maneja la conexión socket, merge con servidor y recepcionar mensajes ---
  useChatSocket({
    contact,
    deviceId,
    storageKey,
    messages,
    setMessages,
    updateChatFromStorage,
  });

  // --- deviceId persistente ---
  React.useEffect(() => {
    (async () => {
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
    })();
  }, []);

  // --- actualiza chat abierto en contexto ---
  React.useEffect(() => {
    setCurrentOpenChatLinkKey(contact.linkKey);
    return () => setCurrentOpenChatLinkKey('');
  }, [contact.linkKey]);

  // --- enviar mensaje ---
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
    setMessages((prev) => [...prev, msg]);

    // persistir local
    const raw = await AsyncStorage.getItem(storageKey);
    const stored = raw ? JSON.parse(raw).messages || [] : [];
    stored.push(msg);
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

    socket.emit('sendMessage', {
      linkKey: contact.linkKey,
      message: msg,
      sender: deviceId,
      to: contact.id,
    });
  };

  const displayText = (m: Message) =>
    isDecrypted ? decryptMessage(m.text) : m.text;
  const flatListRef = useRef<FlatList>(null);
  // scroll automático al final cuando cambian los mensajes
  React.useEffect(() => {
    if (messages.length && flatListRef.current) {
      flatListRef.current.scrollToEnd({ animated: true });
    }
  }, [messages]);
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
        ref={flatListRef}
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
          onContentSizeChange={(e) =>
            setInputHeight(e.nativeEvent.contentSize.height)
          }
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
  sendText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
});
