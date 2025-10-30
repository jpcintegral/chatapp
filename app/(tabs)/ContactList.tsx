import React, { useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function ContactList() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const [contacts, setContacts] = useState([]);

  // 🔹 Cargar contactos desde AsyncStorage
  const loadContacts = async () => {
    try {
      const stored = await AsyncStorage.getItem('contacts');
      const parsed = stored ? JSON.parse(stored) : [];
      setContacts(parsed);
    } catch (error) {
      console.error('Error cargando contactos:', error);
    }
  };

  // 🔹 Agregar nuevo contacto si viene desde params
  const addNewContact = async () => {
    const key = params.key as string;
    const name = params.name as string;
    const linkKey = params.linkKey as string;

    if (!key || !name || !linkKey) return;

    try {
      const stored = await AsyncStorage.getItem('contacts');
      const parsed = stored ? JSON.parse(stored) : [];

      // Evitar duplicados por key, linkKey o name
      const exists = parsed.some(
        (c: any) =>
          c.key === key ||
          c.linkKey === linkKey ||
          c.name.toLowerCase() === name.toLowerCase()
      );

      if (!exists) {
        const newContact = { id: Date.now().toString(), name, key, linkKey };
        const updated = [...parsed, newContact];
        await AsyncStorage.setItem('contacts', JSON.stringify(updated));
        setContacts(updated);
      }
    } catch (error) {
      console.error('❌ Error agregando contacto:', error);
    }
  };

  // 🔹 Se recarga la lista cada vez que el componente tiene foco
  useFocusEffect(
    useCallback(() => {
      loadContacts();
      addNewContact();
    }, [params])
  );

  // 🔹 Iniciar chat
  const startChat = async (contact: { id: string; name: string; key: string; linkKey: string }) => {
    const storageKey = `chat_${contact.linkKey}`;

    try {
      const stored = await AsyncStorage.getItem(storageKey);

      if (!stored) {
        const newChat = {
          contact,
          messages: [],
          lastMessage: '',
          lastTimestamp: 0,
        };
        await AsyncStorage.setItem(storageKey, JSON.stringify(newChat));
      }

      router.push({
        pathname: '/Chat',
        params: {
          id: contact.id,
          contactName: contact.name,
          key: contact.key,
          linkKey: contact.linkKey,
        },
      });
    } catch (error) {
      console.error('❌ Error iniciando chat:', error);
    }
  };

  // 🔹 Eliminar contacto y todos los chats asociados
  const deleteContact = (contact: { id: string; name: string; key: string; linkKey: string }) => {
    Alert.alert(
      'Eliminar contacto',
      `¿Seguro que quieres eliminar a ${contact.name} y todos sus mensajes?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              // Eliminar contacto
              const stored = await AsyncStorage.getItem('contacts');
              const parsed = stored ? JSON.parse(stored) : [];
              const updatedContacts = parsed.filter(
                (c: any) => c.linkKey !== contact.linkKey
              );
              await AsyncStorage.setItem('contacts', JSON.stringify(updatedContacts));
              setContacts(updatedContacts);

              // Eliminar chats asociados
              const keys = await AsyncStorage.getAllKeys();
              const chatKeysToRemove = keys.filter(k => k.startsWith('chat_') && k.includes(contact.linkKey));
              await AsyncStorage.multiRemove(chatKeysToRemove);

            } catch (error) {
              console.error('❌ Error eliminando contacto y chats:', error);
            }
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      {contacts.length === 0 ? (
        <Text style={styles.emptyText}>No tienes contactos guardados aún.</Text>
      ) : (
        <FlatList
          data={contacts}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View style={styles.contactItem}>
              <TouchableOpacity
                style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}
                onPress={() => startChat(item)}
              >
                <View style={styles.iconContainer}>
                  <Ionicons name="person" size={28} color="#fff" />
                </View>
                <Text style={styles.contactName}>{item.name}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => deleteContact(item)}
                style={{ padding: 8 }}
              >
                <Ionicons name="trash" size={24} color="#9b0505" />
              </TouchableOpacity>
            </View>
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingTop: 40, flex: 1, backgroundColor: '#fff', paddingVertical: 10 },
  contactItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, justifyContent: 'space-between' },
  iconContainer: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#248588', justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  contactName: { fontSize: 18, color: '#333' },
  separator: { height: 1, backgroundColor: '#e5e5e5', marginLeft: 80 },
  emptyText: { textAlign: 'center', color: '#999', fontSize: 16, marginTop: 50 },
});
