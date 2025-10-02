'use client';

import { useReportWebVitals } from 'next/web-vitals';
import { reportWebVitals } from '@/lib/performance';

export function WebVitals() {
  useReportWebVitals((metric) => {
    reportWebVitals({
      id: metric.id,
      name: metric.name,
      value: metric.value,
      label: 'web-vital',
    });
  });

  return null;
}

