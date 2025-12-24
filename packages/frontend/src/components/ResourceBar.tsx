import type { Resources } from '@travian/shared';
import styles from './ResourceBar.module.css';

// TravianZ resource icon IDs
const RESOURCE_ICONS: Record<string, string> = {
  lumber: '/assets/resources/1.gif',
  clay: '/assets/resources/2.gif',
  iron: '/assets/resources/3.gif',
  crop: '/assets/resources/4.gif',
};

interface ResourceBarProps {
  resources: Resources;
  production: Resources;
  warehouseCapacity: number;
  granaryCapacity: number;
}

export function ResourceBar({
  resources,
  production,
  warehouseCapacity,
  granaryCapacity,
}: ResourceBarProps) {
  const resourceItems = [
    {
      type: 'lumber',
      label: 'Lumber',
      value: resources.lumber,
      production: production.lumber,
      capacity: warehouseCapacity,
    },
    {
      type: 'clay',
      label: 'Clay',
      value: resources.clay,
      production: production.clay,
      capacity: warehouseCapacity,
    },
    {
      type: 'iron',
      label: 'Iron',
      value: resources.iron,
      production: production.iron,
      capacity: warehouseCapacity,
    },
    {
      type: 'crop',
      label: 'Crop',
      value: resources.crop,
      production: production.crop,
      capacity: granaryCapacity,
    },
  ];

  return (
    <div className={styles.resourceBar}>
      {resourceItems.map((item) => (
        <div key={item.type} className={styles.resourceItem}>
          <img
            src={RESOURCE_ICONS[item.type]}
            alt={item.label}
            className={styles.resourceIcon}
            title={item.label}
          />
          <div className={styles.resourceInfo}>
            <span className={styles.resourceValue}>
              {Math.floor(item.value).toLocaleString()}
            </span>
            <span className={styles.resourceCapacity}>
              / {item.capacity.toLocaleString()}
            </span>
          </div>
          <span
            className={`${styles.resourceProduction} ${
              item.production >= 0 ? styles.positive : styles.negative
            }`}
          >
            {item.production >= 0 ? '+' : ''}
            {item.production}/h
          </span>
        </div>
      ))}
    </div>
  );
}
