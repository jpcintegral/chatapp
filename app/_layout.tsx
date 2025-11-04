import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import { useEffect, useRef, useState } from 'react';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform, Alert } from 'react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import AsyncStorage from '@react-native-async-storage/async-storage';

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

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [fcmToken, setFcmToken] = useState<string | null>(null);
  const notificationListener = useRef<any>();
  const responseListener = useRef<any>();
  const [deviceId, setDeviceId] = useState<string>('');

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
    };
    loadDeviceId();
  }, []);

  // 🔹 Configurar notificaciones con Firebase Cloud Messaging
  useEffect(() => {
    const setupFirebaseMessaging = async () => {
      const authStatus = await messaging().requestPermission();
      const enabled =
        authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
        authStatus === messaging.AuthorizationStatus.PROVISIONAL;

      if (!enabled) {
        Alert.alert('Permiso denegado', 'No se concedió permiso para notificaciones.');
        return;
      }

      // Obtener token FCM
      const token = await messaging().getToken();
      console.log('🔥 FCM Token:', token);
      console.log("deviceId",deviceId);
      setFcmToken(token);

      // Enviar token al backend
      try {
        const response = await fetch('http://192.168.1.66:3100/api/register-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: deviceId,
            token,
          }),
        });

        if (response.ok) {
          console.log('🟢 Token registrado en el backend');
        } else {
          console.warn('⚠️ No se pudo registrar el token en el servidor');
        }
      } catch (error) {
        console.error('❌ Error al registrar token en backend:', error);
      }

      // Escuchar mensajes en foreground
      const unsubscribe = messaging().onMessage(async remoteMessage => {
        console.log('📩 Notificación recibida en foreground:', remoteMessage);
        await Notifications.scheduleNotificationAsync({
          content: {
            title: remoteMessage.notification?.title,
            body: remoteMessage.notification?.body,
          },
          trigger: null,
        });
      });

      return unsubscribe;
    };

    setupFirebaseMessaging();

    // Listeners de notificaciones de Expo
    notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
      console.log('📩 Notificación local recibida:', notification);
    });

    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      console.log('👆 Usuario tocó la notificación:', response);
    });

    return () => {
      if (notificationListener.current) notificationListener.current.remove();
      if (responseListener.current) responseListener.current.remove();
    };
    
  }, [deviceId]);



  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
