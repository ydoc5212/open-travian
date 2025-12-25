import { useState, useEffect } from 'react';
import { reportsApi } from '../services/api';
import type { ReportType, BattleReportData, ScoutReportData } from '@travian/shared';
import { ReportIcon } from '../components/ReportIcon';
import { BattleReportDetails } from '../components/BattleReportDetails';
import { ScoutReportDetails } from '../components/ScoutReportDetails';
import styles from './ReportsView.module.css';

interface Report {
  id: string;
  type: ReportType;
  data: any;
  read: boolean;
  createdAt: string;
}

export function ReportsView() {
  const [reports, setReports] = useState<Report[]>([]);
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [filter, setFilter] = useState<ReportType | 'all'>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadReports();
  }, []);

  async function loadReports() {
    try {
      setLoading(true);
      setError(null);
      const response = await reportsApi.getAll();
      setReports(response.data.reports);
    } catch (err: any) {
      setError(err.message || 'Failed to load reports');
      console.error('Error loading reports:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleReportClick(report: Report) {
    setSelectedReport(report);

    // Mark as read if not already
    if (!report.read) {
      try {
        await reportsApi.markRead(report.id);
        setReports((prev) =>
          prev.map((r) => (r.id === report.id ? { ...r, read: true } : r))
        );
      } catch (err) {
        console.error('Error marking report as read:', err);
      }
    }
  }

  async function handleDeleteReport(reportId: string, event: React.MouseEvent) {
    event.stopPropagation();

    if (!confirm('Are you sure you want to delete this report?')) {
      return;
    }

    try {
      await reportsApi.delete(reportId);
      setReports((prev) => prev.filter((r) => r.id !== reportId));
      if (selectedReport?.id === reportId) {
        setSelectedReport(null);
      }
    } catch (err: any) {
      alert(err.message || 'Failed to delete report');
      console.error('Error deleting report:', err);
    }
  }

  function handleBackToList() {
    setSelectedReport(null);
  }

  const filteredReports =
    filter === 'all'
      ? reports
      : reports.filter((r) => r.type === filter);

  const unreadCount = reports.filter((r) => !r.read).length;

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>Loading reports...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.container}>
        <div className={styles.error}>{error}</div>
      </div>
    );
  }

  if (selectedReport) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <button className="btn btn-secondary" onClick={handleBackToList}>
            ← Back to Reports
          </button>
          <button
            className="btn btn-danger"
            onClick={(e) => handleDeleteReport(selectedReport.id, e)}
          >
            Delete Report
          </button>
        </div>

        {selectedReport.type === 'battle' && (
          <BattleReportDetails report={selectedReport.data as BattleReportData} />
        )}
        {selectedReport.type === 'scout' && (
          <ScoutReportDetails report={selectedReport.data as ScoutReportData} />
        )}
        {selectedReport.type === 'trade' && (
          <div className={styles.genericReport}>
            <h3>Trade Report</h3>
            <pre>{JSON.stringify(selectedReport.data, null, 2)}</pre>
          </div>
        )}
        {selectedReport.type === 'reinforcement' && (
          <div className={styles.genericReport}>
            <h3>Reinforcement Report</h3>
            <pre>{JSON.stringify(selectedReport.data, null, 2)}</pre>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2>Reports</h2>
        {unreadCount > 0 && (
          <div className={styles.unreadBadge}>{unreadCount} unread</div>
        )}
      </div>

      <div className={styles.filters}>
        <button
          className={`${styles.filterButton} ${filter === 'all' ? styles.active : ''}`}
          onClick={() => setFilter('all')}
        >
          All ({reports.length})
        </button>
        <button
          className={`${styles.filterButton} ${filter === 'battle' ? styles.active : ''}`}
          onClick={() => setFilter('battle')}
        >
          Battle ({reports.filter((r) => r.type === 'battle').length})
        </button>
        <button
          className={`${styles.filterButton} ${filter === 'scout' ? styles.active : ''}`}
          onClick={() => setFilter('scout')}
        >
          Scout ({reports.filter((r) => r.type === 'scout').length})
        </button>
        <button
          className={`${styles.filterButton} ${filter === 'trade' ? styles.active : ''}`}
          onClick={() => setFilter('trade')}
        >
          Trade ({reports.filter((r) => r.type === 'trade').length})
        </button>
        <button
          className={`${styles.filterButton} ${filter === 'reinforcement' ? styles.active : ''}`}
          onClick={() => setFilter('reinforcement')}
        >
          Reinforcement ({reports.filter((r) => r.type === 'reinforcement').length})
        </button>
      </div>

      {filteredReports.length === 0 ? (
        <div className={styles.noReports}>
          {filter === 'all'
            ? 'No reports yet'
            : `No ${filter} reports`}
        </div>
      ) : (
        <div className={styles.reportsList}>
          {filteredReports.map((report) => (
            <div
              key={report.id}
              className={`${styles.reportItem} ${!report.read ? styles.unread : ''}`}
              onClick={() => handleReportClick(report)}
            >
              <div className={styles.reportIcon}>
                <ReportIcon type={report.type} isRead={report.read} />
              </div>
              <div className={styles.reportInfo}>
                <div className={styles.reportType}>
                  {report.type.charAt(0).toUpperCase() + report.type.slice(1)} Report
                </div>
                <div className={styles.reportTime}>
                  {new Date(report.createdAt).toLocaleString()}
                </div>
                <div className={styles.reportPreview}>
                  {report.type === 'battle' && (
                    <>
                      {(report.data as BattleReportData).attackerVillageName} →{' '}
                      {(report.data as BattleReportData).defenderVillageName}
                    </>
                  )}
                  {report.type === 'scout' && (
                    <>
                      Scout report from {(report.data as ScoutReportData).targetVillageName}
                    </>
                  )}
                </div>
              </div>
              <div className={styles.reportActions}>
                <button
                  className={`${styles.deleteButton} btn btn-danger btn-sm`}
                  onClick={(e) => handleDeleteReport(report.id, e)}
                  title="Delete report"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
