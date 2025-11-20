import { useState, useEffect } from 'react';
import io from 'socket.io-client';
import { socket } from '@/hooks/socket';
export function useOnlineStatus(contactId: string) {
  const [onlineUsers, setOnlineUsers] = useState<Record<string, boolean>>({});

  useEffect(() => {
    socket.on('userStatus', ({ linkKey, status }) => {
      setOnlineUsers((prev) => ({
        ...prev,
        [linkKey]: status === 'online',
      }));
    });

    return () => {
      socket.off('userStatus');
    };
  }, []);

  return { onlineUsers, socket };
}
