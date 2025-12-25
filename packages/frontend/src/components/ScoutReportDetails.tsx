import type { ScoutReportData, UnitType, BuildingType } from '@travian/shared';
import styles from './ScoutReportDetails.module.css';

interface TroopEntry {
  unitType: UnitType;
  quantity: number;
}

interface DefenseEntry {
  type: BuildingType;
  level: number;
}

interface ScoutReportDetailsProps {
  report: ScoutReportData;
}

export function ScoutReportDetails({ report }: ScoutReportDetailsProps) {
  return (
    <div className={styles.scoutReport}>
      <div className={styles.header}>
        <h3>Scout Report</h3>
        <div className={styles.timestamp}>
          {new Date(report.timestamp).toLocaleString()}
        </div>
      </div>

      <div className={styles.villages}>
        <div className={styles.scouting}>
          <div className={styles.villageInfo}>
            <strong>Scout from:</strong>
            <div className={styles.villageName}>
              {report.scoutingVillageName}
            </div>
            <div className={styles.coords}>
              ({report.scoutingVillageCoords.x}|{report.scoutingVillageCoords.y})
            </div>
          </div>
        </div>

        <div className={styles.arrow}>→</div>

        <div className={styles.target}>
          <div className={styles.villageInfo}>
            <strong>Target:</strong>
            <div className={styles.villageName}>
              {report.targetVillageName}
            </div>
            <div className={styles.username}>
              {report.targetUsername}
            </div>
            <div className={styles.coords}>
              ({report.targetVillageCoords.x}|{report.targetVillageCoords.y})
            </div>
          </div>
        </div>
      </div>

      <div className={styles.infoSection}>
        <div className={styles.resources}>
          <h4>Resources</h4>
          <div className={styles.resourceList}>
            <div className={styles.resourceItem}>
              <img src="/assets/ui/res2.gif" alt="Wood" />
              <span>Lumber: {report.resources.lumber}</span>
            </div>
            <div className={styles.resourceItem}>
              <img src="/assets/ui/res2.gif" alt="Clay" />
              <span>Clay: {report.resources.clay}</span>
            </div>
            <div className={styles.resourceItem}>
              <img src="/assets/ui/res2.gif" alt="Iron" />
              <span>Iron: {report.resources.iron}</span>
            </div>
            <div className={styles.resourceItem}>
              <img src="/assets/ui/res2.gif" alt="Crop" />
              <span>Crop: {report.resources.crop}</span>
            </div>
          </div>
        </div>

        <div className={styles.troops}>
          <h4>Troops</h4>
          {report.troops.length > 0 ? (
            <table className={styles.troopsTable}>
              <thead>
                <tr>
                  <th>Unit</th>
                  <th>Quantity</th>
                </tr>
              </thead>
              <tbody>
                {report.troops.map((troop: TroopEntry) => (
                  <tr key={troop.unitType}>
                    <td>{troop.unitType.replace(/_/g, ' ')}</td>
                    <td>{troop.quantity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className={styles.noData}>No troops detected</div>
          )}
        </div>

        {report.defenses.length > 0 && (
          <div className={styles.defenses}>
            <h4>Defenses</h4>
            <table className={styles.defensesTable}>
              <thead>
                <tr>
                  <th>Building</th>
                  <th>Level</th>
                </tr>
              </thead>
              <tbody>
                {report.defenses.map((defense: DefenseEntry) => (
                  <tr key={defense.type}>
                    <td>{defense.type.replace(/_/g, ' ')}</td>
                    <td>{defense.level}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {report.scoutsLost > 0 && (
        <div className={styles.casualties}>
          <strong>Scouts lost:</strong> {report.scoutsLost}
        </div>
      )}
    </div>
  );
}
