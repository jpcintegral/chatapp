import { socket } from '@/hooks/socket';
import { useChatPresence } from '@/hooks/useChatPresence';
import { useMessageActions } from '@/hooks/useMessageActions';
import { useChat } from './ChatContext';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
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
  useColorScheme,
  TouchableWithoutFeedback,
  Keyboard,
} from 'react-native';
import { useHeaderTap } from '@/hooks/useHeaderTap';
import { useChatStorage } from '@/hooks/useChatStorage';
import { useChatSocket } from '@/hooks/useChatSocket';
import { encryptMessage, decryptMessage } from '@/utils/chatEncryption';
import { formatTime } from '@/utils/time';
import { Message } from '@/interfaces/message.interface';
import { Contact } from '@/interfaces/contact.interface';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';

export default function Chat() {
  const navigation = useNavigation();
  const { contactName, id, key, linkKey, deviceId } = useLocalSearchParams<{
    contactName: string;
    id: string;
    key: string;
    linkKey: string;
    deviceId: string;
  }>();

  // --- Contacto inicial ---
  const initialContact: Contact = {
    id: id || '',
    name: contactName || 'Contacto',
    key: key || id || '',
    linkKey: linkKey || key || id || '',
    deviceId: deviceId || '', // puede venir vacío
  };

  // --- Contacto reactivo (este sí se actualiza cuando llega el deviceId real) ---
  const [chatContact, setChatContact] = useState<Contact>(initialContact);

  const storageKey = `chat_${chatContact.linkKey}`;
  const [myDeviceId, setMyDeviceId] = useState<string>('');

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const { setCurrentOpenChatLinkKey, updateChatFromStorage } = useChat();

  const { isDecrypted, handleHeaderPress } = useHeaderTap();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const [offset, setOffset] = useState(0);

  // --- Obtener deviceId del contacto cuando entras al chat ---
  useEffect(() => {
    if (!chatContact?.linkKey || !myDeviceId) return;

    socket.emit('requestContactDeviceId', {
      linkKey: chatContact.linkKey,
      myDeviceId,
    });
  }, [chatContact.linkKey, myDeviceId]);

  // --- Listener para recibir deviceId del contacto ---
  useEffect(() => {
    const onContactDeviceId = (data: { deviceId: string; linkKey: string }) => {
      console.log('📡 onContactDeviceId data recibido:', data);

      if (!data || data.linkKey !== chatContact.linkKey) return;

      console.log('📡 Device ID del contacto actualizado:', data.deviceId);

      const updated = {
        ...chatContact,
        deviceId: data.deviceId,
      };

      setChatContact(updated);

      updateChatFromStorage({
        contact: updated,
        messages: [],
        lastMessage: '',
        lastTimestamp: 0,
      });
    };

    socket.on('contactDeviceId', onContactDeviceId);

    return () => socket.off('contactDeviceId', onContactDeviceId);
  }, [chatContact]);

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', () => {
      setOffset(90); // offset cuando el teclado está visible
    });

    const hideSub = Keyboard.addListener('keyboardDidHide', () => {
      setOffset(0); // offset cuando el teclado NO está visible
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // --- Presencia online ---
  const { activeUsers } = useChatPresence(chatContact.linkKey, myDeviceId);
  const isOnline = activeUsers.includes(chatContact.deviceId);

  // --- Hook que maneja almacenamiento local ---
  useChatStorage({
    storageKey,
    contact: chatContact,
    messages,
    setMessages,
    updateChatFromStorage,
  });

  // --- Hook que maneja mensajes por socket ---
  useChatSocket({
    contact: chatContact,
    myDeviceId,
    storageKey,
    messages,
    setMessages,
    updateChatFromStorage,
    setChatContact,
  });

  // --- deviceId local persistente ---
  useEffect(() => {
    (async () => {
      try {
        let id = await AsyncStorage.getItem('deviceId');
        if (!id) {
          id = 'device_' + Date.now() + '_' + Math.floor(Math.random() * 10000);
          await AsyncStorage.setItem('deviceId', id);
        }
        setMyDeviceId(id);
      } catch (err) {
        console.error('Error cargando deviceId:', err);
      }
    })();
  }, []);

  useEffect(() => {
    cleanOldMessages();
    setCurrentOpenChatLinkKey(chatContact.linkKey);
    return () => setCurrentOpenChatLinkKey('');
  }, [chatContact.linkKey]);

  // --- Manejo de modos de selección ---
  const {
    selectedMessages,
    isSelectionMode,
    handleLongPress,
    toggleSelect,
    deleteSelectedMessages,
    clearSelection,
  } = useMessageActions({
    messages,
    setMessages,
    storageKey,
    contact: chatContact,
    updateChatFromStorage,
  });

  const cleanOldMessages = async () => {
    try {
      const ONE_HOUR = 240 * 60 * 1000;
      const now = Date.now();

      const filtered = messages.filter((m) => now - m.timestamp <= ONE_HOUR);

      if (filtered.length !== messages.length) {
        console.log('🧹 Eliminando mensajes antiguos...');
        setMessages(filtered);

        await AsyncStorage.setItem(
          storageKey,
          JSON.stringify({
            contact: chatContact,
            messages: filtered,
            lastMessage: filtered[filtered.length - 1]?.text || '',
            lastTimestamp: filtered[filtered.length - 1]?.timestamp || 0,
            unreadCount: 0,
          }),
        );

        updateChatFromStorage({
          contact: chatContact,
          messages: filtered,
          lastMessage: filtered[filtered.length - 1]?.text || '',
          lastTimestamp: filtered[filtered.length - 1]?.timestamp || 0,
        });
      }
    } catch (err) {
      console.error('❌ Error limpiando mensajes:', err);
    }
  };

  // --- Header dinámico ---
  useLayoutEffect(() => {
    navigation.setOptions({
      title: '',
      headerRight: () => null,
      headerLeft: () => null,

      headerTitle: () => (
        <TouchableOpacity onPress={handleHeaderPress}>
          <View style={styles.headerRow}>
            <View style={styles.avatar}>
              <Text
                style={[styles.avatarText, { color: isDark ? '#fff' : '#000' }]}
              >
                {chatContact.name?.charAt(0)?.toUpperCase()}
              </Text>
            </View>

            <View style={styles.headerTextContainer}>
              <Text
                style={[styles.headerName, { color: isDark ? '#fff' : '#000' }]}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {isDecrypted
                  ? chatContact.name
                  : encryptMessage(chatContact.name)}
              </Text>

              <Text style={styles.headerStatus}>
                {isOnline ? 'En línea' : 'Desconectado'}
              </Text>
            </View>
          </View>
        </TouchableOpacity>
      ),
    });
  }, [chatContact.name, isOnline, isDecrypted, isSelectionMode]);

  // --- Enviar mensaje ---
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
      sender: myDeviceId,
      to: chatContact.id,
      timestamp: Date.now(),
    };

    setInput('');
    setMessages((prev) => [...prev, msg]);

    const raw = await AsyncStorage.getItem(storageKey);
    const stored = raw ? JSON.parse(raw).messages || [] : [];
    stored.push(msg);

    await AsyncStorage.setItem(
      storageKey,
      JSON.stringify({
        contact: chatContact,
        messages: stored,
        lastMessage: msg.text,
        lastTimestamp: msg.timestamp,
        unreadCount: 0,
      }),
    );

    updateChatFromStorage({
      contact: chatContact,
      messages: [msg],
      lastMessage: msg.text,
      lastTimestamp: msg.timestamp,
    });

    socket.emit('sendMessage', {
      linkKey: chatContact.linkKey,
      message: msg,
      sender: myDeviceId,
      to: chatContact.id,
    });
  };

  const displayText = (m: Message) =>
    isDecrypted ? decryptMessage(m.text) : m.text;

  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    if (messages.length && flatListRef.current) {
      flatListRef.current.scrollToEnd({ animated: true });
    }
  }, [messages]);

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <View style={{ flex: 1 }}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={offset}
        >
          <View
            style={{
              flex: 1,
              backgroundColor: isDark ? '#dad8d8ff' : '#e5ddd5',
            }}
          >
            {/* HEADER DE SELECCIÓN */}
            {isSelectionMode ? (
              <View style={styles.selectionHeader}>
                <Text style={styles.selectionText}>
                  {selectedMessages.length} seleccionados
                </Text>

                <TouchableOpacity onPress={deleteSelectedMessages}>
                  <Text style={styles.selectionDelete}>Eliminar</Text>
                </TouchableOpacity>

                <TouchableOpacity onPress={clearSelection}>
                  <Text style={styles.selectionCancel}>Cancelar</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            {/* LISTA DE MENSAJES */}
            <FlatList
              ref={flatListRef}
              data={messages}
              keyExtractor={(item) => item.id}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
              onContentSizeChange={() =>
                flatListRef.current?.scrollToEnd({ animated: true })
              }
              onLayout={() =>
                flatListRef.current?.scrollToEnd({ animated: false })
              }
              contentContainerStyle={{
                paddingVertical: 10,
                paddingBottom: 100,
              }}
              renderItem={({ item }) => {
                const isMine = item.sender === myDeviceId;

                return (
                  <TouchableOpacity
                    onLongPress={() => handleLongPress(item)}
                    onPress={() =>
                      selectedMessages.length > 0 && toggleSelect(item)
                    }
                  >
                    <View
                      style={[
                        styles.messageWrapper,
                        isMine
                          ? styles.myMessageWrapper
                          : styles.contactMessageWrapper,
                        selectedMessages.some((m) => m.id === item.id) && {
                          backgroundColor: 'rgba(0,0,255,0.2)',
                          borderRadius: 10,
                        },
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
                            isMine
                              ? styles.myMessageText
                              : styles.contactMessageText
                          }
                        >
                          {displayText(item)}
                        </Text>
                        <Text style={styles.timestamp}>
                          {formatTime(item.timestamp)}
                        </Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              }}
            />

            {/* INPUT COMO WHATSAPP */}
            <View style={styles.inputContainer}>
              <TextInput
                value={input}
                onChangeText={setInput}
                placeholder="Escribe un mensaje..."
                style={styles.input}
                multiline
              />
              <TouchableOpacity onPress={sendMessage} style={styles.sendButton}>
                <Text style={styles.sendText}>
                  {' '}
                  <Ionicons name="send" size={22} color="#fff" />
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#e5ddd5', padding: 10 },

  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: { fontSize: 18, fontWeight: 'bold' },
  headerTextContainer: { flexDirection: 'column', maxWidth: 180 },
  headerName: { fontSize: 16, fontWeight: 'bold' },
  headerStatus: { fontSize: 12, color: '#666' },

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
    position: 'relative',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    paddingVertical: 8,
    paddingHorizontal: 10,
    //backgroundColor: '#fff',
    borderTopWidth: 1,
    borderColor: '#ddd',
  },
  input: {
    flex: 1,
    backgroundColor: '#646464ff',
    color: '#fff',
    borderRadius: 25,
    paddingHorizontal: 16,
    fontSize: 16,
  },
  sendButton: {
    backgroundColor: '#248588',
    borderRadius: 50,
    //paddingHorizontal: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
    height: 50,
    width: 50,
    alignSelf: 'flex-end',
  },
  sendText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },

  selectionHeader: {
    padding: 12,
    backgroundColor: '#075E54',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  selectionText: { color: '#fff', fontSize: 16 },
  selectionDelete: { color: '#FFCDD2' },
  selectionCancel: { color: '#fff' },
});
