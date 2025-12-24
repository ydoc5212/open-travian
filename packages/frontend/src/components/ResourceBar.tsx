import type { Resources } from '@travian/shared';
import styles from './ResourceBar.module.css';

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
      color: '#8B4513',
    },
    {
      type: 'clay',
      label: 'Clay',
      value: resources.clay,
      production: production.clay,
      capacity: warehouseCapacity,
      color: '#CD853F',
    },
    {
      type: 'iron',
      label: 'Iron',
      value: resources.iron,
      production: production.iron,
      capacity: warehouseCapacity,
      color: '#708090',
    },
    {
      type: 'crop',
      label: 'Crop',
      value: resources.crop,
      production: production.crop,
      capacity: granaryCapacity,
      color: '#DAA520',
    },
  ];

  return (
    <div className={styles.resourceBar}>
      {resourceItems.map((item) => (
        <div key={item.type} className={styles.resourceItem}>
          <div
            className={styles.resourceIcon}
            style={{ backgroundColor: item.color }}
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
