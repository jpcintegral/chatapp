export interface Message {
  id: string;
  text: string; // encrypted text
  sender: string;
  to?: string;
  timestamp: number;
  unreadCount?: number;
}
