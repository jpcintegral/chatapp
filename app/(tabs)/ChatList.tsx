import '../firebase-messaging';
import { socket } from '@/hooks/socket';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';

// 🔹 Interfaces compartidas con Chat
interface Message {
  id: string;
  text: string;
  sender: string;
  timestamp: number;
}

interface ChatHistory {
  contact: { id: string; name: string; key: string; linkKey: string };
  messages: Message[];
  lastTimestamp: number;
  lastMessage: string;
  unreadCount: number;
}

export default function ChatList() {
  const router = useRouter();
  const [chats, setChats] = useState<ChatHistory[]>([]);
  const { onlineUsers } = useOnlineStatus();
  const socketRef = useRef(null);
  useFocusEffect(
    useCallback(() => {
      loadChats();
    }, []),
  );

  useEffect(() => {
    // Asegurar conexión
    if (!socket.connected) {
      socket.connect();
    }

    socketRef.current = socket;

    // 🔹 0) Unirse a sala del usuario (deviceId)
    (async () => {
      const deviceId = await AsyncStorage.getItem('deviceId');
      if (deviceId) {
        console.log('🔗 Uniendo a sala (joinChat):', deviceId);
        socket.emit('joinChat', deviceId);
      } else {
        console.warn('⚠️ No se encontró deviceId en AsyncStorage');
      }
    })();

    // 🔹 1) Solicitar historial inicial
    socket.emit('requestChatListHistory');

    // 🔹 2) Recibir historial inicial
    const handleHistory = async (serverChats: any) => {
      const restored: ChatHistory[] = [];

      for (const linkKey of Object.keys(serverChats)) {
        const latestMsg = serverChats[linkKey];

        const raw = await AsyncStorage.getItem(`chat_${linkKey}`);
        if (!raw) continue;

        const parsed: ChatHistory = JSON.parse(raw);

        restored.push({
          ...parsed,
          lastMessage: latestMsg.text,
          lastTimestamp: latestMsg.timestamp,
        });
      }

      restored.sort((a, b) => b.lastTimestamp - a.lastTimestamp);
      setChats(restored);
    };

    socket.on('chatListHistoryResponse', handleHistory);

    // 🔹 3) Escuchar actualizaciones en vivo
    const handleUpdate = async ({
      linkKey,
      lastMessage,
      timestamp,
      sender,
    }) => {
      setChats((prevChats) => {
        const exists = prevChats.find((c) => c.contact.linkKey === linkKey);

        if (!exists) {
          return [
            {
              contact: { id: sender, name: 'Nuevo contacto', key: '', linkKey },
              messages: [],
              lastMessage,
              lastTimestamp: timestamp,
              unreadCount: 1,
            },
            ...prevChats,
          ];
        }

        const updated = prevChats.map((chat) =>
          chat.contact.linkKey === linkKey
            ? {
                ...chat,
                lastMessage,
                lastTimestamp: timestamp,
                unreadCount: chat.unreadCount + 1,
              }
            : chat,
        );

        updated.sort((a, b) => b.lastTimestamp - a.lastTimestamp);
        return updated;
      });

      // Guardar cambio en AsyncStorage
      const stored = await AsyncStorage.getItem(`chat_${linkKey}`);
      if (stored) {
        const parsed = JSON.parse(stored);
        parsed.lastMessage = lastMessage;
        parsed.lastTimestamp = timestamp;

        await AsyncStorage.setItem(`chat_${linkKey}`, JSON.stringify(parsed));
      }
    };

    socket.on('chatListUpdate', handleUpdate);

    // 🔹 Cleanup para evitar listeners duplicados
    return () => {
      socket.off('chatListHistoryResponse', handleHistory);
      socket.off('chatListUpdate', handleUpdate);
    };
  }, []);

  // 🔹 Cargar chats desde AsyncStorage
  const loadChats = async () => {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const chatKeys = keys.filter((k) => k.startsWith('chat_'));

      const loadedChats: ChatHistory[] = [];

      for (const key of chatKeys) {
        const value = await AsyncStorage.getItem(key);
        if (!value) continue;

        try {
          const parsed: ChatHistory = JSON.parse(value);

          if (
            !parsed?.contact?.name ||
            !Array.isArray(parsed.messages) ||
            parsed.messages.length === 0
          ) {
            await AsyncStorage.removeItem(key);
            continue;
          }

          loadedChats.push(parsed);
        } catch (err) {
          console.warn(`⚠️ Error leyendo chat ${key}:`, err);
          await AsyncStorage.removeItem(key);
        }
      }

      // 🧹 Eliminar duplicados según key del contacto
      const uniqueChats = Array.from(
        new Map(
          loadedChats.map((chat) => [
            `${chat.contact.key}_${chat.contact.id}`,
            chat,
          ]),
        ).values(),
      );

      // 🔹 Ordenar por último mensaje
      uniqueChats.sort((a, b) => b.lastTimestamp - a.lastTimestamp);

      //console.log('🔍 Chats cargados:', JSON.stringify(uniqueChats, null, 2));
      setChats(uniqueChats);
    } catch (error) {
      console.error('Error cargando chats:', error);
    }
  };

  // 🔹 Eliminar chat específico
  const deleteChat = (chat: ChatHistory) => {
    Alert.alert(
      'Eliminar chat',
      `¿Seguro que quieres eliminar el chat con ${chat.contact.name}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              const chatKey = `chat_${chat.contact.linkKey}`;

              await AsyncStorage.removeItem(chatKey);
              const stored = await AsyncStorage.getItem(chatKey);
              console.log('Chat eliminado de AsyncStorage:', stored);

              // 🔹 Actualizamos el estado local
              setChats((prev) =>
                prev.filter((c) => c.contact.linkKey !== chat.contact.linkKey),
              );
            } catch (error) {
              console.error('Error eliminando chat:', error);
            }
          },
        },
      ],
    );
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={chats}
        keyExtractor={(item) => `${item.contact.key}_${item.contact.id}`}
        renderItem={({ item }) => (
          <View style={styles.chatItem}>
            <TouchableOpacity
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}
              onPress={() =>
                router.push({
                  pathname: '/Chat',
                  params: {
                    id: item.contact.id,
                    contactName: item.contact.name,
                    key: item.contact.key,
                    linkKey: item.contact.linkKey,
                  },
                })
              }
            >
              <View style={styles.iconContainer}>
                <Ionicons name="person" size={26} color="#fff" />
                {/*<View
                  style={{
                    position: 'absolute',
                    bottom: 4,
                    right: 4,
                    width: 10,
                    height: 10,
                    borderRadius: 5,
                    backgroundColor: onlineUsers[item.contact.linkKey] ? '#00C853' : '#9E9E9E',
                  }}
                /> */}
              </View>
              <View style={styles.textContainer}>
                <Text style={styles.contactName}>{item.contact.name}</Text>
                <Text style={styles.lastMessage} numberOfLines={1}>
                  {item.lastMessage}
                </Text>
              </View>
              {item.unreadCount > 0 && (
                <View style={styles.unreadBadge}>
                  <Text style={styles.unreadText}>{item.unreadCount}</Text>
                </View>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => deleteChat(item)}
              style={{ padding: 8 }}
            >
              <Ionicons name="trash" size={24} color="#9b0505" />
            </TouchableOpacity>
          </View>
        )}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          <Text style={styles.emptyText}>No hay chats disponibles</Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingTop: 40, flex: 1, backgroundColor: '#fff' },
  chatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    justifyContent: 'space-between',
  },
  iconContainer: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#248588',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  textContainer: { flex: 1, justifyContent: 'center' },
  contactName: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 4,
  },
  lastMessage: { fontSize: 15, color: '#555' },
  separator: { height: 1, backgroundColor: '#e5e5e5', marginLeft: 80 },
  emptyText: {
    textAlign: 'center',
    color: '#999',
    marginTop: 50,
    fontSize: 16,
  },
  unreadBadge: {
    backgroundColor: '#2b0000ff',
    borderRadius: 10,
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  unreadText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
});
