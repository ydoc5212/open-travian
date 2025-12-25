import type { ReportType } from '@travian/shared';
import styles from './ReportIcon.module.css';

// Use individual TravianZ icon files instead of sprite
const REPORT_ICONS: Record<ReportType, string> = {
  battle: '/assets/ui/att1.gif',      // Attack/battle icon
  scout: '/assets/ui/def1.gif',       // Scout icon (eye-like)
  trade: '/assets/ui/car.gif',        // Merchant cart
  reinforcement: '/assets/ui/def2.gif', // Reinforcement/defense
};

interface ReportIconProps {
  type: ReportType;
  isRead: boolean;
}

export function ReportIcon({ type, isRead }: ReportIconProps) {
  return (
    <img
      src={REPORT_ICONS[type]}
      alt={`${type} report`}
      className={`${styles.reportIcon} ${isRead ? styles.read : styles.unread}`}
      title={`${type} report`}
    />
  );
}
