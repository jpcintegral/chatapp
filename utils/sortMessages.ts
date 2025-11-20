import { Message } from '@/interfaces/message.interface';

export const sortMessages = (arr: Message[]) =>
  arr.slice().sort((a, b) => a.timestamp - b.timestamp);
