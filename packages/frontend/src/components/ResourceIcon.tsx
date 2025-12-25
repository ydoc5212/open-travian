import styles from './ResourceIcon.module.css';

export type ResourceType = 'lumber' | 'clay' | 'iron' | 'crop';

const RESOURCE_PATHS: Record<ResourceType, string> = {
  lumber: '/assets/resources/1.gif',
  clay: '/assets/resources/2.gif',
  iron: '/assets/resources/3.gif',
  crop: '/assets/resources/4.gif',
};

const RESOURCE_LABELS: Record<ResourceType, string> = {
  lumber: 'Lumber',
  clay: 'Clay',
  iron: 'Iron',
  crop: 'Crop',
};

interface ResourceIconProps {
  type: ResourceType;
  size?: 'small' | 'medium' | 'large';
  className?: string;
}

export function ResourceIcon({ type, size = 'medium', className = '' }: ResourceIconProps) {
  return (
    <img
      src={RESOURCE_PATHS[type]}
      alt={RESOURCE_LABELS[type]}
      className={`${styles.icon} ${styles[size]} ${className}`}
    />
  );
}
