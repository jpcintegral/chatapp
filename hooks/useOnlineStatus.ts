import { useState, useEffect } from 'react';
import { socket } from '@/hooks/socket';

export function useOnlineStatus() {
  const [onlineUsers, setOnlineUsers] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const handler = (users: Record<string, boolean>) => {
      setOnlineUsers(users);
    };

    socket.on('userStatus', handler);

    return () => {
      socket.off('userStatus', handler);
    };
  }, []);

  return { onlineUsers };
}
