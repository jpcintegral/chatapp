import './firebase-messaging';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import { useEffect, useRef, useState } from 'react';
import * as Notifications from 'expo-notifications';
import { Platform, Alert, PermissionsAndroid } from 'react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ChatProvider, useChat } from './ChatContext';


// 🔥 Firebase imports
import firebase from '@react-native-firebase/app';
import messaging from '@react-native-firebase/messaging';

export const unstable_settings = {
  anchor: '(tabs)',
};

// 🔧 Configuración de notificaciones locales (Expo)
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// 🔹 Función para solicitar permisos en Android 13+
async function requestNotificationPermissionAndroid() {
  if (Platform.OS === 'android' && Platform.Version >= 33) {
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
      {
        title: 'Permiso para notificaciones',
        message: 'La app necesita permiso para mostrar notificaciones.',
        buttonPositive: 'Aceptar',
      }
    );

    if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
      Alert.alert('Permiso denegado', 'No se concedió permiso para notificaciones.');
      return false;
    }
  }
  return true;
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [fcmToken, setFcmToken] = useState<string | null>(null);
  const notificationListener = useRef<any>();
  const responseListener = useRef<any>();
  const [deviceId, setDeviceId] = useState<string>('');
  const [linkKey , setLinkKey] = useState<string>('');
  const { currentOpenChatLinkKey } = useChat();
  

  // 🔹 Inicializar Firebase (una sola vez)
  useEffect(() => {
    if (!firebase.apps.length) {
      firebase.initializeApp();
      console.log('✅ Firebase inicializado');
    }
  }, []);

  // 🔹 Cargar o generar un identificador local del dispositivo
  useEffect(() => {
    const loadDeviceId = async () => {
      let id = await AsyncStorage.getItem('deviceId');
      if (!id) {
        id = 'device_' + Date.now() + '_' + Math.floor(Math.random() * 10000);
        await AsyncStorage.setItem('deviceId', id);
      }
      setDeviceId(id);
      console.log()
      const storedLinkKey = await AsyncStorage.getItem('linkKey');
        console.log("storedLinkKey",storedLinkKey);
    setLinkKey(storedLinkKey || '');
      
    };
    loadDeviceId();
  }, []);

  // 🔹 Configurar notificaciones con Firebase Cloud Messaging
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
    //console.log('🔥 FCM Token:', token);
    setFcmToken(token);

    // Registrar listener solo una vez
    unsubscribeMessaging = messaging().onMessage(async remoteMessage => {
     // console.log('📩 Notificación recibida en foreground:', remoteMessage);

      await Notifications.scheduleNotificationAsync({
        content: {
          title: remoteMessage.notification?.title,
          body: remoteMessage.notification?.body,
        },
        trigger: null,
      });
     console.log("currentOpenChatLinkKey",currentOpenChatLinkKey);
      const mensajeData = remoteMessage.data?.mensaje;
      if (mensajeData) {
         console.log("jose");
        try {
          const messageObj = JSON.parse(mensajeData);
          const storageKey = `chat_${messageObj.linkKey}`;
          const stored = await AsyncStorage.getItem(storageKey);
          let chatHistory = stored ? JSON.parse(stored) : null;

          if (!chatHistory) {
            chatHistory = {
              contact: {
                id: messageObj.sender,
                name: 'Contacto',
                key: messageObj.sender,
                linkKey: messageObj.linkKey,
              },
              messages: [],
              lastMessage: '',
              lastTimestamp: 0,
            };
          }

          chatHistory.messages.push(messageObj);
          chatHistory.lastMessage = messageObj.text;
          chatHistory.lastTimestamp = messageObj.timestamp;

          await AsyncStorage.setItem(storageKey, JSON.stringify(chatHistory));
        } catch (e) {
          console.error('Error guardando mensaje:', e);
        }
      }
    });
  };

  setupFirebaseMessaging();

  return () => {
    if (unsubscribeMessaging) unsubscribeMessaging();
    if (notificationListener.current) notificationListener.current.remove();
    if (responseListener.current) responseListener.current.remove();
  };
}, []); // 🔹 dejar array de dependencias vacío

  return (
     <ChatProvider>
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
    </ChatProvider>
  );
}
