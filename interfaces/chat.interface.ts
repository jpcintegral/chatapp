import { Message } from './message.interface';
import { Contact } from './contact.interface';

export interface ChatHistory {
  contact: Contact;
  messages: Message[];
  lastTimestamp: number;
  lastMessage: string;
  unreadCount?: number; // por si lo ocupas
}
