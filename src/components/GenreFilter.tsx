// GenreFilter - Filtre multi-genres avec chips (React Island)
import React, { useState, useEffect } from 'react';
import { getGenreColor } from '../lib/utils';

interface GenreFilterProps {
  selectedGenres: string[];
  availableGenres: string[];
  onChange: (genres: string[]) => void;
  maxVisible?: number;
}

export default function GenreFilter({ selectedGenres, availableGenres, onChange, maxVisible = 12 }: GenreFilterProps) {
  const [expanded, setExpanded] = useState(false);
  const visibleGenres = expanded || availableGenres.length <= maxVisible
    ? availableGenres
    : availableGenres.slice(0, maxVisible);

  const toggleGenre = (genre: string) => {
    const newGenres = selectedGenres.includes(genre)
      ? selectedGenres.filter(g => g !== genre)
      : [...selectedGenres, genre];
    onChange(newGenres);
  };

  const clearAll = () => onChange([]);

  return (
    <div className="genre-filter" role="group" aria-label="Filtrer par genre musical">
      {/* Selected genres chips */}
      {selectedGenres.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3" role="list" aria-label="Genres sélectionnés">
          {selectedGenres.map((genre) => (
            <button
              key={genre}
              type="button"
              className="badge flex items-center gap-1.5"
              style={{
                background: `${getGenreColor(genre)}30`,
                color: getGenreColor(genre),
                borderColor: `${getGenreColor(genre)}60`,
              }}
              onClick={() => toggleGenre(genre)}
              aria-pressed="true"
              role="listitem"
            >
              {genre}
              <button
                type="button"
                className="ml-1 p-0.5 rounded hover:bg-black/20 transition"
                onClick={(e) => { e.stopPropagation(); toggleGenre(genre); }}
                aria-label={`Retirer ${genre}`}
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                  <path d="M3 3L9 9M9 3L3 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </button>
            </button>
          ))}
          {selectedGenres.length > 1 && (
            <button
              type="button"
              className="btn btn-ghost btn-sm text-xs"
              onClick={clearAll}
              aria-label="Effacer tous les filtres"
            >
              Tout effacer
            </button>
          )}
        </div>
      )}

      {/* Available genres */}
      <div className="flex flex-wrap gap-2" role="list" aria-label="Genres disponibles">
        {visibleGenres.map((genre) => (
          <button
            key={genre}
            type="button"
            className="badge badge-genre"
            role="listitem"
            aria-pressed={selectedGenres.includes(genre)}
            onClick={() => toggleGenre(genre)}
            style={{
              background: selectedGenres.includes(genre)
                ? `${getGenreColor(genre)}30`
                : 'var(--color-bg-hover)',
              color: selectedGenres.includes(genre)
                ? getGenreColor(genre)
                : 'var(--color-text-muted)',
              borderColor: selectedGenres.includes(genre)
                ? `${getGenreColor(genre)}60`
                : 'var(--color-border)',
              fontWeight: selectedGenres.includes(genre) ? 600 : 500,
            }}
          >
            {genre}
          </button>
        ))}

        {availableGenres.length > maxVisible && !expanded && (
          <button
            type="button"
            className="badge btn-ghost text-xs"
            onClick={() => setExpanded(true)}
            aria-label={`Voir ${availableGenres.length - maxVisible} genres de plus`}
          >
            +{availableGenres.length - maxVisible} de plus
          </button>
        )}

        {expanded && availableGenres.length > maxVisible && (
          <button
            type="button"
            className="badge btn-ghost text-xs"
            onClick={() => setExpanded(false)}
            aria-label="Voir moins de genres"
          >
            Voir moins
          </button>
        )}
      </div>
    </div>
  );
}