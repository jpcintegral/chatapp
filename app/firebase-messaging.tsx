// firebase-messaging.ts
import messaging from '@react-native-firebase/messaging';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';

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

messaging().setBackgroundMessageHandler(async remoteMessage => {
  console.log('📩 Mensaje recibido en background:', remoteMessage);
  const mensajeData = remoteMessage.data?.mensaje;
  if (!mensajeData) return;

  try {
    const messageObj = JSON.parse(mensajeData);
    const storageKey = `chat_${messageObj.linkKey}`;
    const contactName = await getContactNameByLinkKey(messageObj.linkKey);
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

    chatHistory.messages.push(messageObj);
    chatHistory.lastMessage = messageObj.text;
    chatHistory.lastTimestamp = messageObj.timestamp;
    chatHistory.unreadCount = (chatHistory.unreadCount ?? 0) + 1

    await AsyncStorage.setItem(storageKey, JSON.stringify(chatHistory));

    // Opcional: mostrar notificación local
    await Notifications.scheduleNotificationAsync({
      content: {
        title: remoteMessage.data?.title,
        body: remoteMessage.data?.body,
        priority: Notifications.AndroidNotificationPriority.HIGH,
      },
      trigger: null,
    });

    console.log(' Mensaje guardado en background', storageKey);

  } catch (e) {
    console.error(' Error guardando mensaje en background:', e);
  }
});


export  const handleIncomingMessage = async (remoteMessage: any) => {
  try {
    const mensajeData = remoteMessage.data?.mensaje;
    if (!mensajeData) return;

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

    chatHistory.messages.push(messageObj);
    chatHistory.lastMessage = messageObj.text;
    chatHistory.lastTimestamp = messageObj.timestamp;
    chatHistory.unreadCount = (chatHistory.unreadCount ?? 0) + 1;

    await AsyncStorage.setItem(storageKey, JSON.stringify(chatHistory));
    console.log(' Mensaje guardado al abrir la notificación');
  } catch (e) {
    console.error('Error procesando mensaje tras abrir la notificación:', e);
  }
};


