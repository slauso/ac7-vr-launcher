import React from 'react';
import type { StatusState } from '@shared/types';

const labels: Record<StatusState, string> = {
  ok: '✅ OK',
  error: '✗ Error',
  pending: '⏳ Pending',
  unknown: '• Unknown'
};

export const StatusBadge: React.FC<{ status: StatusState }> = ({ status }) => {
  return <span className={`status-badge status-${status}`}>{labels[status]}</span>;
};
