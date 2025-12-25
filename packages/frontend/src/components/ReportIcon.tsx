import type { ReportType } from '@travian/shared';
import styles from './ReportIcon.module.css';

interface ReportIconProps {
  type: ReportType;
  isRead: boolean;
}

export function ReportIcon({ type, isRead }: ReportIconProps) {
  // Icon positions in report_icons.gif sprite (approximate positions)
  // The sprite contains multiple icons, we need to position them correctly
  const iconPositions: Record<ReportType, { x: number; y: number }> = {
    battle: { x: 0, y: 0 },
    scout: { x: -16, y: 0 },
    trade: { x: -32, y: 0 },
    reinforcement: { x: -48, y: 0 },
  };

  const position = iconPositions[type];

  return (
    <div
      className={`${styles.reportIcon} ${isRead ? styles.read : styles.unread}`}
      style={{
        backgroundImage: 'url(/assets/ui/report_icons.gif)',
        backgroundPosition: `${position.x}px ${position.y}px`,
      }}
      title={`${type} report`}
    />
  );
}
