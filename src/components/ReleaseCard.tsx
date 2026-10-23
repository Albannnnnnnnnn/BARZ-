// ReleaseCard - Carte d'album interactive (React Island)
import React from 'react';
import { ReleaseWithArtist } from '../lib/types';
import { formatShortDate, getReleaseTypeLabel, getReleaseTypeColor, getGenreColor, slugify, createReleaseUrl, getOptimizedImageUrl } from '../lib/utils';

interface ReleaseCardProps {
  release: ReleaseWithArtist;
  variant?: 'default' | 'compact' | 'featured';
}

export default function ReleaseCard({ release, variant = 'default' }: ReleaseCardProps) {
  const { artist, release_date: releaseDateRaw, release_type, cover_url, genres, track_count, title, slug } = release;
  const release_date: string = (releaseDateRaw || new Date().toISOString().split('T')[0])!;
  const today: string = new Date().toISOString().split('T')[0]!;
  const status = release_date < today ? 'past' :
                 release_date === today ? 'today' : 'upcoming';
  const isToday = status === 'today';
  const url = createReleaseUrl(slug);

  const handleClick = (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    window.location.href = url;
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      window.location.href = url;
    }
  };

  if (variant === 'compact') {
    return (
      <a
        href={url}
        className="card card-interactive flex items-center gap-3 p-2 transition"
        style={{ minHeight: '72px' }}
      >
        <div className="relative overflow-hidden" style={{ width: '56px', height: '56px', flexShrink: 0, borderRadius: 'var(--radius-sm)' }}>
          <img
            src={getOptimizedImageUrl(cover_url, 112)}
            alt=""
            loading="lazy"
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-medium text-sm truncate" style={{ color: 'var(--color-text)' }}>{title}</p>
          <p className="text-xs text-muted truncate mt-0.5">{artist?.name}</p>
          <div className="flex items-center gap-1.5 mt-1">
            <span className="badge badge-type" style={{
              background: `${getReleaseTypeColor(release_type)}20`,
              color: getReleaseTypeColor(release_type),
              borderColor: `${getReleaseTypeColor(release_type)}40`,
              fontSize: '0.65rem'
            }}>
              {getReleaseTypeLabel(release_type)}
            </span>
            <time className="text-xs text-dim" dateTime={release_date}>
              {formatShortDate(release_date)}
            </time>
          </div>
        </div>
      </a>
    );
  }

  return (
    <article
      className="card card-interactive overflow-hidden transition animate-fade-in"
      style={{ animationDelay: `${Math.random() * 0.15}s` }}
      tabIndex={0}
      role="button"
      aria-label={`${title} par ${artist?.name}, sorti le ${formatShortDate(release_date)}`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
    >
      {/* Cover */}
      <div className="relative aspect-square overflow-hidden group">
        <img
          src={getOptimizedImageUrl(cover_url, 600)}
          alt=""
          loading="lazy"
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        {/* Badge type */}
        <div className="absolute top-3 left-3">
          <span className="badge badge-type" style={{
            background: `${getReleaseTypeColor(release_type)}20`,
            color: getReleaseTypeColor(release_type),
            borderColor: `${getReleaseTypeColor(release_type)}40`,
          }}>
            {getReleaseTypeLabel(release_type)}
          </span>
        </div>
        {/* Badge "Aujourd'hui" */}
        {isToday && (
          <div className="absolute top-3 right-3">
            <span className="badge badge-new text-xs">Sortie aujourd'hui</span>
          </div>
        )}
        {/* Badge "À venir" */}
        {status === 'upcoming' && (
          <div className="absolute bottom-3 right-3">
            <span className="badge badge-genre text-xs" style={{
              background: 'rgba(255,255,255,0.1)',
              color: 'var(--color-text-muted)',
              borderColor: 'rgba(255,255,255,0.2)',
            }}>
              À venir
            </span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-4 flex flex-col" style={{ minHeight: '150px' }}>
        <h3 className="font-semibold text-base truncate" style={{ color: 'var(--color-text)' }}>
          <a href={url} className="hover:underline" onClick={(e) => e.stopPropagation()}>
            {title}
          </a>
        </h3>

        <p className="text-sm text-muted truncate mt-1">
          <a href={`/BARZ-/artists/${artist?.slug}`} className="hover:underline" onClick={(e) => e.stopPropagation()}>
            {artist?.name}
          </a>
        </p>

        <div className="flex flex-wrap gap-1.5 mt-2 mb-auto">
          {genres.slice(0, 3).map((genre) => (
            <span
              key={genre}
              className="badge badge-genre text-xs"
              style={{ background: `${getGenreColor(genre)}20`, color: getGenreColor(genre), borderColor: `${getGenreColor(genre)}40` }}
            >
              {genre}
            </span>
          ))}
          {genres.length > 3 && (
            <span className="badge badge-genre text-xs" style={{ background: 'var(--color-bg-hover)', color: 'var(--color-text-dim)', borderColor: 'var(--color-border)' }}>
              +{genres.length - 3}
            </span>
          )}
        </div>

        <div className="flex items-center justify-between pt-3 border-t" style={{ borderColor: 'var(--color-border)' }}>
          <time className="text-xs text-dim" dateTime={release_date}>
            {formatShortDate(release_date)}
          </time>
          {track_count > 0 && (
            <span className="text-xs text-dim">{track_count} titre{track_count > 1 ? 's' : ''}</span>
          )}
        </div>
      </div>
    </article>
  );
}
