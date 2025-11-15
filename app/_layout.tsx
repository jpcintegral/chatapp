import { handleIncomingMessage } from './firebase-messaging';

import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import { useEffect, useRef, useState } from 'react';
import * as Notifications from 'expo-notifications';
import { Platform, Alert, PermissionsAndroid } from 'react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ChatProvider, useChat } from './ChatContext';

import firebase from '@react-native-firebase/app';
import messaging from '@react-native-firebase/messaging';

export const unstable_settings = { anchor: '(tabs)' };

// Configuración de notificaciones locales
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// Solicitar permisos en Android 13+
async function requestNotificationPermissionAndroid() {
  if (Platform.OS === 'android' && Platform.Version >= 33) {
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
      {
        title: 'Permiso para notificaciones',
        message: 'La app necesita permiso para mostrar notificaciones.',
        buttonPositive: 'Aceptar',
      },
    );
    if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
      Alert.alert(
        'Permiso denegado',
        'No se concedió permiso para notificaciones.',
      );
      return false;
    }
  }
  return true;
}

const getContactNameByLinkKey = async (linkKey: string): Promise<string> => {
  try {
    const storedContacts = await AsyncStorage.getItem('contacts');
    const contacts = storedContacts ? JSON.parse(storedContacts) : [];
    const contact = contacts.find((c: any) => c.linkKey === linkKey);
    return contact ? contact.name : 'Contacto';
  } catch (e) {
    console.error('Error obteniendo nombre de contacto:', e);
    return 'Contacto';
  }
};
// 🔹 Componente RootLayout
export default function RootLayout() {
  const colorScheme = useColorScheme();

  // 🔹 ChatProvider envuelve todo para que el contexto esté disponible
  return (
    <ChatProvider>
      <RootLayoutWithListeners colorScheme={colorScheme} />
    </ChatProvider>
  );
}

// 🔹 Componente interno que contiene los listeners
function RootLayoutWithListeners({
  colorScheme,
}: {
  colorScheme: 'dark' | 'light';
}) {
  const {
    currentOpenChatLinkKey,
    updateChatFromStorage,
    reloadChatsFromStorage,
  } = useChat();
  const currentOpenChatLinkKeyRef = useRef<string | null>(null);

  const [deviceId, setDeviceId] = useState<string>('');
  const [fcmToken, setFcmToken] = useState<string | null>(null);

  useEffect(() => {
    const loadPendingMessages = async () => {
      const keys = await AsyncStorage.getAllKeys();
      const chatKeys = keys.filter((k) => k.startsWith('chat_'));

      for (let key of chatKeys) {
        const stored = await AsyncStorage.getItem(key);
        if (!stored) continue;

        const chatHistory = JSON.parse(stored);

        // Actualiza el Context SIN duplicados
        updateChatFromStorage(chatHistory);
      }
    };

    loadPendingMessages();
  }, []);

  // Mantener el valor del chat abierto actualizado
  useEffect(() => {
    currentOpenChatLinkKeyRef.current = currentOpenChatLinkKey;
  }, [currentOpenChatLinkKey]);

  // Inicializar Firebase
  useEffect(() => {
    if (!firebase.apps.length) {
      firebase.initializeApp();
      console.log('✅ Firebase inicializado');
    }
    // Cuando la app se abre desde una notificación en background o cerrada
    const unsubscribeOpened = messaging().onNotificationOpenedApp(
      async (remoteMessage) => {
        console.log(' App abierta desde notificación:', remoteMessage);
        await handleIncomingMessage(remoteMessage);
      },
    );

    // Cuando la app se inicia desde un estado cerrado (killed)
    messaging()
      .getInitialNotification()
      .then(async (remoteMessage) => {
        if (remoteMessage) {
          console.log(' App lanzada por una notificación:', remoteMessage);
          await handleIncomingMessage(remoteMessage);
        }

        reloadChatsFromStorage();
      });

    reloadChatsFromStorage();

    return unsubscribeOpened;
  }, []);

  // Cargar o generar deviceId
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

  // Listener de FCM
  useEffect(() => {
    let unsubscribeMessaging: (() => void) | null = null;

    const setupFirebaseMessaging = async () => {
      const androidPermission = await requestNotificationPermissionAndroid();
      if (!androidPermission) return;

      const authStatus = await messaging().requestPermission();
      const enabled =
        authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
        authStatus === messaging.AuthorizationStatus.PROVISIONAL;
      if (!enabled) return;

      const token = await messaging().getToken();
      setFcmToken(token);

      unsubscribeMessaging = messaging().onMessage(async (remoteMessage) => {
        const mensajeData = remoteMessage.data?.mensaje;
        if (!mensajeData) return;

        try {
          const messageObj = JSON.parse(mensajeData);
          const contactName = await getContactNameByLinkKey(messageObj.linkKey);

          const storageKey = `chat_${messageObj.linkKey}`;
          const stored = await AsyncStorage.getItem(storageKey);
          let chatHistory = stored ? JSON.parse(stored) : null;

          if (!chatHistory) {
            chatHistory = {
              contact: {
                id: messageObj.sender,
                name: contactName,
                key: messageObj.sender,
                linkKey: messageObj.linkKey,
              },
              messages: [],
              lastMessage: '',
              lastTimestamp: 0,
            };
          }

          const exists = chatHistory.messages.some(
            (m) => m.id === messageObj.id,
          );
          if (exists) return;
          chatHistory.messages.push(messageObj);
          chatHistory.lastMessage = messageObj.text;
          chatHistory.lastTimestamp = messageObj.timestamp;
          chatHistory.unreadCount = (chatHistory.unreadCount ?? 0) + 1;

          await AsyncStorage.setItem(storageKey, JSON.stringify(chatHistory));
          // ✅ Solo procesar si el chat abierto es diferente
          if (currentOpenChatLinkKeyRef.current !== messageObj.linkKey) {
            // Mostrar notificación local
            await Notifications.scheduleNotificationAsync({
              content: {
                title: remoteMessage.data?.title,
                body: remoteMessage.data?.body,
                priority: Notifications.AndroidNotificationPriority.HIGH,
              },
              trigger: null,
            });
          } else {
            console.log(
              'Chat abierto, no se agrega notificación ni push al storage',
            );
          }
        } catch (e) {
          console.error('Error procesando mensaje:', e);
        }
      });
    };

    setupFirebaseMessaging();

    return () => {
      if (unsubscribeMessaging) unsubscribeMessaging();
    };
  }, []);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="modal"
          options={{ presentation: 'modal', title: 'Modal' }}
        />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
