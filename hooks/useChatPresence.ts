import { useState, useEffect } from 'react';
import { socket } from '@/hooks/socket';

export function useChatPresence(linkKey: string, deviceId: string) {
  const [activeUsers, setActiveUsers] = useState<string[]>([]);

  useEffect(() => {
    if (!linkKey || !deviceId) return;

    socket.emit('joinChat', { linkKey, deviceId });

    const handler = (users: string[]) => setActiveUsers(users);

    socket.on('activeUsers', handler);

    return () => {
      socket.off('activeUsers', handler);
    };
  }, [linkKey, deviceId]);

  return { activeUsers };
}
