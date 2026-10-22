// CalendarView - Calendrier interactif semaine (React Island) - CŒUR DU MVP
import React, { useState, useMemo, useEffect } from 'react';
import { format, parseISO, startOfWeek, endOfWeek, addWeeks, subWeeks, isSameDay, isToday, eachDayOfInterval } from 'date-fns';
import { fr } from 'date-fns/locale';
import ReleaseGrid from './ReleaseGrid';
import GenreFilter from './GenreFilter';
import { WeeklyReleases, ReleaseWithArtist, CalendarViewProps } from '../lib/types';
import { formatShortDate, getWeekNavigation, formatWeekRange, slugify } from '../lib/utils';

export default function CalendarView({
  currentWeek,
  weeklyData = [],
  onWeekChange,
  onDayClick,
  selectedGenres = [],
  onGenreFilterChange,
  availableGenres = [],
}: CalendarViewProps) {
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [dayReleases, setDayReleases] = useState<ReleaseWithArtist[]>([]);

  const weekStart = useMemo(() => parseISO(currentWeek), [currentWeek]);
  const { prev, next } = getWeekNavigation(weekStart);
  const days = useMemo(() => eachDayOfInterval({ start: weekStart, end: endOfWeek(weekStart, { weekStartsOn: 1 }) }), [weekStart]);

  // Trouver les données de la semaine courante
  const currentWeekData = useMemo(() =>
    weeklyData.find(w => w.week_start === format(weekStart, 'yyyy-MM-dd')),
    [weeklyData, weekStart]
  );

  // Grouper les releases par jour
  const releasesByDay = useMemo(() => {
    const map: Record<string, ReleaseWithArtist[]> = {};
    currentWeekData?.releases?.forEach(r => {
      const day = r.release_date;
      if (!map[day]) map[day] = [];
      map[day].push(r);
    });
    return map;
  }, [currentWeekData]);

  // Filtrer par genres sélectionnés
  const filteredReleasesByDay = useMemo(() => {
    if (selectedGenres.length === 0) return releasesByDay;
    const filtered: Record<string, ReleaseWithArtist[]> = {};
    Object.entries(releasesByDay).forEach(([day, releases]) => {
      filtered[day] = releases.filter(r =>
        r.genres.some(g => selectedGenres.includes(g))
      );
    });
    return filtered;
  }, [releasesByDay, selectedGenres]);

  // Releases du jour sélectionné
  const selectedDayReleases = selectedDay ? filteredReleasesByDay[selectedDay] || [] : [];

  // Callback quand on clique sur un jour
  const handleDayClick = (day: string) => {
    const releases = filteredReleasesByDay[day] || [];
    setSelectedDay(prev => prev === day ? null : day);
    setDayReleases(releases);
    onDayClick(day, releases);
  };

  // Vérifier si c'est la semaine en cours
  const isCurrentWeek = isToday(weekStart) || isToday(endOfWeek(weekStart, { weekStartsOn: 1 }));

  // Default Friday releases for when nothing is selected
  const fridayReleases = useMemo(() => {
    if (!currentWeekData?.releases) return [];
    return currentWeekData.releases.filter(r => {
      const day = parseISO(r.release_date);
      return day.getDay() === 5; // Vendredi
    });
  }, [currentWeekData]);

  return (
    <div className="calendar-view" style={{ maxWidth: '100%' }}>
      {/* Navigation semaine */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <button
          className="btn btn-secondary btn-sm"
          onClick={() => onWeekChange(format(prev, 'yyyy-MM-dd'))}
          aria-label={`Semaine précédente: ${formatWeekRange(prev)}`}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          Précédente
        </button>

        <div className="flex items-center gap-3">
          <h2 className="font-semibold text-lg whitespace-nowrap" style={{ color: 'var(--color-text)' }}>
            {formatWeekRange(weekStart)}
          </h2>
          {isCurrentWeek && (
            <span className="badge badge-new text-xs">Cette semaine</span>
          )}
        </div>

        <button
          className="btn btn-secondary btn-sm"
          onClick={() => onWeekChange(format(next, 'yyyy-MM-dd'))}
          aria-label={`Semaine suivante: ${formatWeekRange(next)}`}
        >
          Suivante
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>
      </div>

      {/* Filtres genres */}
      <GenreFilter
        selectedGenres={selectedGenres}
        availableGenres={availableGenres}
        onChange={onGenreFilterChange}
        maxVisible={14}
      />

      {/* Grille jours de la semaine */}
      <div className="mt-6" role="region" aria-label="Calendrier de la semaine">
        <div className="grid grid-cols-7 gap-1 mb-1" style={{ fontSize: '0.75rem' }}>
          {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map((day, i) => (
            <div key={day} className="text-center text-dim font-medium px-2 py-2">
              {day}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1 mb-6" role="row">
          {days.map((day) => {
            const dayStr = format(day, 'yyyy-MM-dd');
            const dayReleases = filteredReleasesByDay[dayStr] || [];
            const isSelected = selectedDay === dayStr;
            const isTodayDay = isToday(day);
            const isFriday = day.getDay() === 5;
            const hasReleases = dayReleases.length > 0;

            return (
              <button
                key={dayStr}
                type="button"
                role="gridcell"
                aria-selected={isSelected}
                aria-label={`${format(day, 'EEEE d MMMM', { locale: fr })}${hasReleases ? `, ${dayReleases.length} sortie${dayReleases.length > 1 ? 's' : ''}` : ''}`}
                onClick={() => handleDayClick(dayStr)}
                className={`relative aspect-square flex flex-col items-center justify-start p-2 transition min-h-[100px] ${
                  isSelected ? 'ring-2' : ''
                } ${isTodayDay ? 'bg-[var(--color-accent-muted)]' : ''} ${isFriday ? 'border-l-2' : ''}`}
                style={{
                  borderColor: isFriday ? 'var(--color-accent)' : 'transparent',
                  ringColor: 'var(--color-accent)',
                  background: isSelected ? 'var(--color-bg-hover)' : 'transparent',
                  borderRadius: 'var(--radius-md)',
                }}
              >
                <span className={`font-medium ${isTodayDay ? 'text-[var(--color-accent)]' : ''} ${isSelected ? 'text-[var(--color-accent)]' : ''}`}>
                  {format(day, 'd')}
                </span>

                {/* Indicateur vendredi */}
                {isFriday && (
                  <span className="badge badge-new text-[0.6rem] mt-0.5" style={{ fontSize: '0.6rem', padding: '1px 4px' }}>
                    VENDREDI
                  </span>
                )}

                {/* Points releases */}
                {hasReleases && (
                  <div className="flex gap-1 mt-1.5" role="img" aria-label={`${dayReleases.length} sortie${dayReleases.length > 1 ? 's' : ''}`}>
                    {dayReleases.slice(0, 4).map((r, i) => (
                      <span
                        key={r.id}
                        className="w-2 h-2 rounded-full transition-transform hover:scale-150"
                        style={{
                          background: r.genres[0] ? `var(--genre-${slugify(r.genres[0])}, var(--color-accent))` : 'var(--color-accent)',
                        }}
                      />
                    ))}
                    {dayReleases.length > 4 && (
                      <span className="w-2 h-2 rounded-full text-[0.55rem] flex items-center justify-center" style={{ background: 'var(--color-border)', color: 'var(--color-text-dim)' }}>
                        +{dayReleases.length - 4}
                      </span>
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Releases du jour sélectionné */}
      {selectedDay && (
        <div className="mt-6" role="region" aria-label={`Sorties du ${format(parseISO(selectedDay), 'EEEE d MMMM', { locale: fr })}`}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold" style={{ color: 'var(--color-text)' }}>
              {format(parseISO(selectedDay), 'EEEE d MMMM', { locale: fr })}
              <span className="text-sm font-normal text-muted ml-2">
                ({selectedDayReleases.length} sortie{selectedDayReleases.length > 1 ? 's' : ''})
              </span>
            </h3>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => { setSelectedDay(null); setDayReleases([]); }}
              aria-label="Fermer la sélection"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
          <ReleaseGrid releases={selectedDayReleases} variant="default" />
        </div>
      )}

      {/* Par défaut : afficher les releases du vendredi si rien sélectionné */}
      {!selectedDay && (
        <ReleaseGrid
          releases={fridayReleases}
          emptyMessage="Aucune sortie vendredi cette semaine"
        />
      )}
    </div>
  );
}