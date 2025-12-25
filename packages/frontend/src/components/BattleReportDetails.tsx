import type { BattleReportData, UnitType } from '@travian/shared';
import styles from './BattleReportDetails.module.css';

interface TroopEntry {
  unitType: UnitType;
  sent?: number;
  defending?: number;
  lost: number;
}

interface BattleReportDetailsProps {
  report: BattleReportData;
}

export function BattleReportDetails({ report }: BattleReportDetailsProps) {
  const attackerWon = report.winner === 'attacker';
  const totalLoot = report.loot.lumber + report.loot.clay + report.loot.iron + report.loot.crop;

  return (
    <div className={styles.battleReport}>
      <div className={styles.header}>
        <h3>{report.attackType === 'raid' ? 'Raid Report' : 'Attack Report'}</h3>
        <div className={styles.timestamp}>
          {new Date(report.timestamp).toLocaleString()}
        </div>
      </div>

      <div className={styles.villages}>
        <div className={styles.attacker}>
          <div className={styles.villageInfo}>
            <img
              src="/assets/ui/att1.gif"
              alt="Attacker"
              className={styles.attackSymbol}
            />
            <div>
              <strong>{report.attackerUsername}</strong>
              <div className={styles.villageName}>
                {report.attackerVillageName}
              </div>
              <div className={styles.coords}>
                ({report.attackerVillageCoords.x}|{report.attackerVillageCoords.y})
              </div>
            </div>
          </div>
        </div>

        <div className={styles.vs}>
          <img src="/assets/ui/attack_symbol.gif" alt="vs" />
        </div>

        <div className={styles.defender}>
          <div className={styles.villageInfo}>
            <img
              src="/assets/ui/def1.gif"
              alt="Defender"
              className={styles.attackSymbol}
            />
            <div>
              <strong>{report.defenderUsername}</strong>
              <div className={styles.villageName}>
                {report.defenderVillageName}
              </div>
              <div className={styles.coords}>
                ({report.defenderVillageCoords.x}|{report.defenderVillageCoords.y})
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className={styles.result}>
        <div className={attackerWon ? styles.winner : styles.loser}>
          {attackerWon ? 'Attacker Victory' : 'Attacker Defeated'}
        </div>
      </div>

      <div className={styles.troopsSection}>
        <div className={styles.attackerTroops}>
          <h4>Attacker's Troops</h4>
          <table className={styles.troopsTable}>
            <thead>
              <tr>
                <th>Unit</th>
                <th>Sent</th>
                <th>Lost</th>
              </tr>
            </thead>
            <tbody>
              {report.attackerTroops.map((troop: TroopEntry) => (
                <tr key={troop.unitType}>
                  <td>{troop.unitType.replace(/_/g, ' ')}</td>
                  <td>{troop.sent}</td>
                  <td className={troop.lost > 0 ? styles.losses : ''}>
                    {troop.lost}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className={styles.defenderTroops}>
          <h4>Defender's Troops</h4>
          <table className={styles.troopsTable}>
            <thead>
              <tr>
                <th>Unit</th>
                <th>Defending</th>
                <th>Lost</th>
              </tr>
            </thead>
            <tbody>
              {report.defenderTroops.length > 0 ? (
                report.defenderTroops.map((troop: TroopEntry) => (
                  <tr key={troop.unitType}>
                    <td>{troop.unitType.replace(/_/g, ' ')}</td>
                    <td>{troop.defending}</td>
                    <td className={troop.lost > 0 ? styles.losses : ''}>
                      {troop.lost}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={3} className={styles.noTroops}>
                    No defending troops
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {totalLoot > 0 && (
        <div className={styles.loot}>
          <h4>Resources Plundered</h4>
          <div className={styles.resources}>
            <div className={styles.resource}>
              <img src="/assets/ui/res2.gif" alt="Wood" />
              <span>{report.loot.lumber}</span>
            </div>
            <div className={styles.resource}>
              <img src="/assets/ui/res2.gif" alt="Clay" />
              <span>{report.loot.clay}</span>
            </div>
            <div className={styles.resource}>
              <img src="/assets/ui/res2.gif" alt="Iron" />
              <span>{report.loot.iron}</span>
            </div>
            <div className={styles.resource}>
              <img src="/assets/ui/res2.gif" alt="Crop" />
              <span>{report.loot.crop}</span>
            </div>
          </div>
          <div className={styles.totalLoot}>
            Total: {totalLoot} resources
          </div>
        </div>
      )}
    </div>
  );
}
