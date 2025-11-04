import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Button,
  StyleSheet,
  TextInput,
  Alert,
  Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import QRCode from 'react-native-qrcode-svg';
import { CameraView, useCameraPermissions, BarcodeScanningResult } from 'expo-camera';

export default function HomeScreen() {
  const router = useRouter();

  // 📱 Estados principales
  const [contactName, setContactName] = useState('');
  const [linkKey, setLinkKey] = useState('');
  const [generatedKey, setGeneratedKey] = useState('');
  const [showQR, setShowQR] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [scannedKey, setScannedKey] = useState(''); // 🔹 Guarda el key escaneado
  const [showAddFromQR, setShowAddFromQR] = useState(false); // 🔹 Muestra el modal para agregar desde QR

  // 🎥 Permisos de cámara
  const [permission, requestPermission] = useCameraPermissions();
  useEffect(() => {
    if (!permission?.granted) requestPermission();
  }, [permission]);

  // 🧩 Generar clave aleatoria de 6 caracteres
  const generateKey = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  };

  //  Agregar contacto propio y generar QR
  const handleAddContact = async () => {
    const name = contactName.trim();
    if (!name) {
      Alert.alert('Error', 'Debes ingresar un nombre para el contacto.');
      return;
    }

    const key = generateKey();

    const stored = await AsyncStorage.getItem('contacts');
    const parsed = stored ? JSON.parse(stored) : [];

    const exists = parsed.some((c: any) => c.name.toLowerCase() === name.toLowerCase());
    if (exists) {
      Alert.alert('Aviso', 'Este contacto ya existe.');
      return;
    }

    const newContact = { id: key, key, name, linkKey: key };
    const updated = [...parsed, newContact];
    await AsyncStorage.setItem('contacts', JSON.stringify(updated));

    setGeneratedKey(key);
    setContactName('');
    setShowQR(true);
  };

  // 📷 Escanear QR y pedir nombre
  const handleBarCodeScanned = (result: BarcodeScanningResult) => {
    if (!result?.data) return;
    setShowScanner(false);
    setScannedKey(result.data); // Guardamos el valor leído
    setShowAddFromQR(true); // Mostramos el modal para pedir nombre
  };

  // 💾 Confirmar agregar contacto desde QR
  const handleConfirmAddFromQR = async () => {
    if (!contactName.trim()) {
      Alert.alert('Error', 'Debes ingresar un nombre para guardar el contacto.');
      return;
    }

    const stored = await AsyncStorage.getItem('contacts');
    const parsed = stored ? JSON.parse(stored) : [];

    const exists = parsed.some((c: any) => c.linkKey === scannedKey);
    if (exists) {
      Alert.alert('Aviso', 'Este contacto ya existe.');
      setShowAddFromQR(false);
      return;
    }

    const newContact = {
      id: generateKey(),
      key: generateKey(),
      name: contactName.trim(),
      linkKey: scannedKey,
    };
    const updated = [...parsed, newContact];
    await AsyncStorage.setItem('contacts', JSON.stringify(updated));

    setShowAddFromQR(false);
    setContactName('');
    Alert.alert('Éxito', `Se agregó el contacto: ${newContact.name}`);
  };

  if (!permission) return <Text>Solicitando permisos de cámara...</Text>;

  if (!permission.granted) {
    return (
      <View style={styles.centered}>
        <Text>No se concedió permiso de cámara.</Text>
        <Button title="Conceder permiso" onPress={requestPermission} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Mensajería Privada</Text>

      <TextInput
        style={styles.input}
        placeholder="Nombre del contacto"
        value={contactName}
        onChangeText={setContactName}
      />

      <View style={{ width: '100%', marginBottom: 10 }}>
        <Button title="Agregar Contacto y Generar QR" onPress={handleAddContact} />
      </View>

      <View style={{ width: '100%', marginBottom: 10 }}>
        <Button title="Escanear QR" onPress={() => setShowScanner(true)} />
      </View>


      {/* 🔹 Modal para QR generado */}
      <Modal visible={showQR} transparent animationType="slide">
        <View style={styles.modal}>
          <Text style={{ marginBottom: 10 }}>Escanea este QR para vincular contacto</Text>
          <QRCode value={generatedKey || 'XXXXXX'} size={200} />
          <Text style={{ marginTop: 10, fontSize: 16 }}>Clave: {generatedKey}</Text>
          <Button title="Cerrar" onPress={() => setShowQR(false)} />
        </View>
      </Modal>

      {/* 🔹 Modal para escáner */}
      <Modal visible={showScanner} animationType="slide">
        <CameraView
          style={{ flex: 1 }}
          facing="back"
          onBarcodeScanned={handleBarCodeScanned}
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        />
        <Button title="Cancelar" onPress={() => setShowScanner(false)} />
      </Modal>

      {/* 🔹 Modal para agregar contacto escaneado */}
      <Modal visible={showAddFromQR} transparent animationType="slide">
        <View style={styles.modal}>
          <Text style={{ marginBottom: 10 }}>Se detectó un nuevo contacto</Text>
          <Text style={{ marginBottom: 15 }}>Clave detectada: {scannedKey}</Text>

          <TextInput
            style={styles.input}
            placeholder="Nombre del contacto"
            value={contactName}
            onChangeText={setContactName}
          />

          <Button title="Guardar Contacto" onPress={handleConfirmAddFromQR} />
          <View style={{ marginTop: 10 }}>
            <Button
              title="Cancelar"
              color="#888"
              onPress={() => {
                setShowAddFromQR(false);
                setContactName('');
              }}
            />
          </View>
        </View>
      </Modal>
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
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
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
  modal: {
    flex: 1,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
});
