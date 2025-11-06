// firebase-messaging.ts
import messaging from '@react-native-firebase/messaging';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';



messaging().setBackgroundMessageHandler(async remoteMessage => {
  console.log('📩 Mensaje recibido en background:', remoteMessage);
  const mensajeData = remoteMessage.data?.mensaje;
  if (!mensajeData) return;

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

    // Opcional: mostrar notificación local
    await Notifications.scheduleNotificationAsync({
      content: {
        title: remoteMessage.notification?.title,
        body: remoteMessage.notification?.body,
        priority: Notifications.AndroidNotificationPriority.HIGH,
      },
      trigger: null,
    });

    console.log('✅ Mensaje guardado en background', storageKey);

  } catch (e) {
    console.error('❌ Error guardando mensaje en background:', e);
  }
});
