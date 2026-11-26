'use client';

import { useEffect, useState } from 'react';
import { History } from 'lucide-react';
import type { AuditEntryDto, Page } from '@erp/shared';
import { api, errorMessage } from '@/lib/api';
import { AuditTimeline } from '../../audit/audit-timeline';
import { Card } from '../../card';
import { EmptyState } from '../../empty-state';
import { Pagination } from '../../pagination';
import { Skeleton } from '../../skeleton';

export function ActivityTab({ userId }: { userId: string }) {
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(25);
  const [data, setData] = useState<Page<AuditEntryDto> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Page<AuditEntryDto>>(`/users/${userId}/activity?page=${page}&pageSize=${size}`)
      .then(setData)
      .catch((e) => setError(errorMessage(e)));
  }, [userId, page, size]);

  return (
    <Card
      icon={History}
      title="Activity"
      description="Changes made to this account and actions this person took."
      bodyClassName="p-0"
      className="animate-fade-up"
    >
      {error ? (
        <EmptyState
          icon={History}
          tone="rose"
          title="Couldn't load the activity"
          description={error}
        />
      ) : !data ? (
        <div className="space-y-3 p-5">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-10" />
          ))}
        </div>
      ) : data.total === 0 ? (
        <EmptyState
          icon={History}
          tone="slate"
          title="Nothing yet"
          description="Events will appear here as they happen."
        />
      ) : (
        <>
          <div className="px-4 py-3">
            <AuditTimeline entries={data.items} />
          </div>
          <Pagination
            page={data.page}
            pageSize={data.pageSize}
            total={data.total}
            noun="events"
            onPage={setPage}
            onPageSize={(s) => {
              setSize(s);
              setPage(1);
            }}
          />
        </>
      )}
    </Card>
  );
}
