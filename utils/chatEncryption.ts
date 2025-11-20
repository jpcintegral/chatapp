import CryptoJS from 'crypto-js';

const secretKey = 'mi_clave_secreta_123';

export const encryptMessage = (text: string) => {
  try {
    const iv = CryptoJS.enc.Utf8.parse(secretKey.substring(0, 16));
    const encrypted = CryptoJS.AES.encrypt(
      text,
      CryptoJS.enc.Utf8.parse(secretKey),
      { iv },
    );
    return encrypted.toString();
  } catch (e) {
    console.error('Error encriptando mensaje:', e);
    return text;
  }
};

export const decryptMessage = (encrypted: string) => {
  try {
    const iv = CryptoJS.enc.Utf8.parse(secretKey.substring(0, 16));
    const bytes = CryptoJS.AES.decrypt(
      encrypted,
      CryptoJS.enc.Utf8.parse(secretKey),
      { iv },
    );
    const decrypted = bytes.toString(CryptoJS.enc.Utf8);
    return decrypted || encrypted;
  } catch {
    return encrypted;
  }
};
