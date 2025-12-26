import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { celebrationApi } from '../services/api';
import { Timer } from '../components/Timer';
import { ResourceIcon, ResourceType } from '../components/ResourceIcon';
import styles from './TownHallView.module.css';

export function TownHallView() {
  const { villageId } = useParams<{ villageId: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    loadData();
  }, [villageId]);

  async function loadData() {
    if (!villageId) return;

    try {
      setLoading(true);
      const response = await celebrationApi.get(villageId);
      setData(response.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load Town Hall');
    } finally {
      setLoading(false);
    }
  }

  async function handleStartCelebration(type: 'small' | 'large') {
    if (!villageId) return;

    setStarting(true);
    setError(null);

    try {
      await celebrationApi.start(villageId, type);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start celebration');
    } finally {
      setStarting(false);
    }
  }

  if (loading) {
    return <div className={styles.container}>Loading...</div>;
  }

  if (!data) {
    return <div className={styles.container}>No data available</div>;
  }

  const { townHallLevel, activeCelebration, smallCelebration, largeCelebration } = data;

  return (
    <div className={styles.container}>
      <div className="panel">
        <div className="panel-header">
          <button onClick={() => navigate(-1)} className="btn btn-secondary">
            Back
          </button>
          <h2>Town Hall (Level {townHallLevel})</h2>
        </div>

        <div className="panel-body">
          {error && <div className="alert alert-error">{error}</div>}

          <p className={styles.description}>
            Great celebrations and festivities can be held in the Town Hall. These celebrations
            increase culture points, which are required to expand your empire with new villages.
          </p>

          {activeCelebration ? (
            <div className={styles.activeCelebration}>
              <h3>Active Celebration</h3>
              <div className={styles.celebrationInfo}>
                <div className={styles.celebrationType}>
                  {activeCelebration.type === 'small' ? 'Small Celebration' : 'Large Celebration'}
                </div>
                <div className={styles.culturePoints}>
                  Culture Points: <strong>+{activeCelebration.culturePoints}</strong>
                </div>
                <Timer endsAt={activeCelebration.endsAt} showLabel />
              </div>
            </div>
          ) : (
            <div className={styles.celebrations}>
              <div className={styles.celebrationCard}>
                <h3>Small Celebration</h3>
                <div className={styles.benefits}>
                  <div>Duration: 1 hour (game time)</div>
                  <div>Culture Points: +{smallCelebration.culturePoints}</div>
                </div>
                <div className={styles.cost}>
                  <h4>Cost:</h4>
                  <CostDisplay cost={smallCelebration.cost} />
                </div>
                <button
                  className="btn btn-primary"
                  onClick={() => handleStartCelebration('small')}
                  disabled={starting}
                >
                  {starting ? 'Starting...' : 'Start Small Celebration'}
                </button>
              </div>

              <div className={styles.celebrationCard}>
                <h3>Large Celebration</h3>
                <div className={styles.benefits}>
                  <div>Duration: 24 hours (game time)</div>
                  <div>Culture Points: +{largeCelebration.culturePoints}</div>
                </div>
                <div className={styles.cost}>
                  <h4>Cost:</h4>
                  <CostDisplay cost={largeCelebration.cost} />
                </div>
                <button
                  className="btn btn-primary"
                  onClick={() => handleStartCelebration('large')}
                  disabled={starting}
                >
                  {starting ? 'Starting...' : 'Start Large Celebration'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CostDisplay({ cost }: { cost: any }) {
  const items: { type: ResourceType; value: number }[] = [
    { type: 'lumber', value: cost.lumber },
    { type: 'clay', value: cost.clay },
    { type: 'iron', value: cost.iron },
    { type: 'crop', value: cost.crop },
  ];

  return (
    <div className={styles.costGrid}>
      {items.map((item) => (
        <div key={item.type} className={styles.costItem}>
          <ResourceIcon type={item.type} size="small" />
          <span>{item.value.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}
