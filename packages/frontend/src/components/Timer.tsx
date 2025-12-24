import { useState, useEffect } from 'react';
import styles from './Timer.module.css';

interface TimerProps {
  endsAt: string;
  showLabel?: boolean;
  onComplete?: () => void;
}

export function Timer({ endsAt, showLabel, onComplete }: TimerProps) {
  const [timeLeft, setTimeLeft] = useState('');
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    function updateTimer() {
      const now = new Date().getTime();
      const end = new Date(endsAt).getTime();
      const diff = end - now;

      if (diff <= 0) {
        setTimeLeft('00:00:00');
        setIsComplete(true);
        if (onComplete) {
          onComplete();
        }
        return;
      }

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      setTimeLeft(
        `${hours.toString().padStart(2, '0')}:${minutes
          .toString()
          .padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
      );
    }

    updateTimer();
    const interval = setInterval(updateTimer, 1000);

    return () => clearInterval(interval);
  }, [endsAt, onComplete]);

  return (
    <div className={styles.timer}>
      {showLabel && <span className={styles.label}>Time remaining:</span>}
      <span className={`${styles.time} ${isComplete ? styles.complete : ''}`}>
        {timeLeft}
      </span>
    </div>
  );
}
