import { useEffect, useRef, useState } from 'react';

export const useHeaderTap = () => {
  const [isDecrypted, setIsDecrypted] = useState(false);
  const [tapCount, setTapCount] = useState(0);
  const tapTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (tapCount === 3) {
      setIsDecrypted(true);
      setTapCount(0);
      if (tapTimeoutRef.current) clearTimeout(tapTimeoutRef.current);
    }
  }, [tapCount]);

  const handleHeaderPress = () => {
    if (isDecrypted) {
      setIsDecrypted(false);
      setTapCount(0);
      if (tapTimeoutRef.current) clearTimeout(tapTimeoutRef.current);
    } else {
      setTapCount((prev) => prev + 1);
      if (tapTimeoutRef.current) clearTimeout(tapTimeoutRef.current);
      tapTimeoutRef.current = setTimeout(() => setTapCount(0), 2000);
    }
  };

  return { isDecrypted, handleHeaderPress };
};
