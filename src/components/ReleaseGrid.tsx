// ReleaseGrid - Grille responsive de releases (React Island)
import React from 'react';
import ReleaseCard from './ReleaseCard';
import { ReleaseWithArtist } from '../lib/types';

interface ReleaseGridProps {
  releases: ReleaseWithArtist[];
  loading?: boolean;
  emptyMessage?: string;
  variant?: 'default' | 'compact';
}

export default function ReleaseGrid({ releases, loading = false, emptyMessage = 'Aucune sortie pour cette période', variant = 'default' }: ReleaseGridProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4" role="status" aria-label="Chargement des sorties">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="card overflow-hidden animate-pulse">
            <div className="aspect-square" style={{ background: 'var(--color-bg-hover)' }} />
            <div className="p-4 space-y-3">
              <div className="h-4 w-3/4" style={{ background: 'var(--color-bg-hover)' }} />
              <div className="h-3 w-1/2" style={{ background: 'var(--color-bg-hover)' }} />
              <div className="h-2 w-1/3" style={{ background: 'var(--color-bg-hover)' }} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (releases.length === 0) {
    return (
      <div className="text-center py-12" role="status">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto mb-3" style={{ color: 'var(--color-text-dim)' }}>
          <circle cx="12" cy="12" r="10" />
          <path d="M12 6v6l4 2" />
        </svg>
        <p className="text-muted">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div
      className="grid gap-4"
      style={{
        gridTemplateColumns: variant === 'compact'
          ? 'repeat(auto-fill, minmax(280px, 1fr))'
          : 'repeat(auto-fill, minmax(220px, 1fr))',
      }}
      role="list"
      aria-label={`Liste de ${releases.length} sortie${releases.length > 1 ? 's' : ''}`}
    >
      {releases.map((release, index) => (
        <ReleaseCard
          key={release.id}
          release={release}
          variant={variant}
        />
      ))}
    </div>
  );
}