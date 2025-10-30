import React, { useState } from 'react';
import { View, Text, Button, StyleSheet, TextInput, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function HomeScreen() {
  const router = useRouter();
  const [contactName, setContactName] = useState('');
  const [linkKey, setLinkKey] = useState('');

  // 🔹 Generar clave aleatoria de 6 caracteres
  const generateKey = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let key = '';
    for (let i = 0; i < 6; i++) {
      key += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return key;
  };

  const handleAddContact = () => {
    const name = contactName.trim();
    let key = generateKey(); // siempre autogenerada como id
    let link = linkKey.trim().toUpperCase();

    if (!name) {
      Alert.alert('Error', 'Debes ingresar un nombre para el contacto.');
      return;
    }

    // Si no ingresó linkKey, generamos una nueva
    if (!link) {
      link = generateKey();
    } else if (link.length !== 6) {
      Alert.alert('Error', 'La clave de enlace debe tener 6 caracteres si la ingresas.');
      return;
    }

    // Confirmación antes de guardar
    Alert.alert(
      'Agregar contacto',
      `¿Deseas agregar a ${name} como contacto?\nClave para sincronización: ${link}`,
      [
        {
          text: 'Cancelar',
          style: 'cancel',
          onPress: () => {
            setContactName('');
            setLinkKey('');
          },
        },
        {
          text: 'OK',
          onPress: async () => {
            try {
              const stored = await AsyncStorage.getItem('contacts');
              const parsed = stored ? JSON.parse(stored) : [];

              // Evitar duplicados por nombre
              const exists = parsed.some(
                (c: any) => c.name.toLowerCase() === name.toLowerCase()
              );
              if (exists) {
                Alert.alert('Aviso', 'Este contacto ya existe.');
                return;
              }

              const newContact = {
                id: key,
                key:key,
                name,
                linkKey: link,
              };
            
               
              const updated = [...parsed, newContact];
              await AsyncStorage.setItem('contacts', JSON.stringify(updated));

              setContactName('');
              setLinkKey('');

              // Redirigir a ContactList
              router.push({
                pathname: '/ContactList',
                params: { key: newContact.id },
              });
            } catch (error) {
              console.error('Error guardando contacto:', error);
            }
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Mensajería Privada</Text>

      <TextInput
        style={styles.input}
        placeholder="Nombre del contacto"
        value={contactName}
        onChangeText={setContactName}
      />

      <TextInput
        style={styles.input}
        placeholder="Clave de enlace (opcional)"
        value={linkKey}
        onChangeText={setLinkKey}
        maxLength={6}
        autoCapitalize="characters"
      />

      <View style={{ width: '100%', marginBottom: 10 }}>
        <Button title="Agregar Contacto" onPress={handleAddContact} />
      </View>

      <View style={{ width: '100%' }}>
        <Button title="Ver Chats" onPress={() => router.push('/ChatList')} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  title: { fontSize: 24, marginBottom: 20, fontWeight: 'bold', color: '#000' },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    width: '100%',
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 15,
    textAlign: 'center',
    fontSize: 16,
  },
});
