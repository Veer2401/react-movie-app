import React, { useEffect, useMemo } from 'react'

const IMAGE_BASE = 'https://image.tmdb.org/t/p/w185'

const DetailsDrawer = ({ isOpen, onClose, item, credits, isLoading }) => {
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose()
    }
    if (isOpen) {
      window.addEventListener('keydown', onKeyDown)
    }
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isOpen, onClose])

  const directors = useMemo(() => {
    if (!credits?.crew) return []
    // Director for movies; for TV, show episode directors too
    const dir = credits.crew.filter((c) => c.job === 'Director' || c.known_for_department === 'Directing')
    // De-duplicate by id
    const seen = new Set()
    return dir.filter((d) => {
      if (seen.has(d.id)) return false
      seen.add(d.id)
      return true
    }).slice(0, 5)
  }, [credits])

  const topCast = useMemo(() => {
    if (!credits?.cast) return []
    return credits.cast.slice(0, 12)
  }, [credits])

  const composers = useMemo(() => {
    if (!credits?.crew) return []
    const targetJobs = new Set([
      'Original Music Composer',
      'Composer',
      'Music',
      'Music Director',
      'Score Composer',
      'Music Supervisor',
    ])
    const soundDept = credits.crew.filter((c) => c.known_for_department === 'Sound' || targetJobs.has(c.job))
    const seen = new Set()
    const unique = []
    for (const person of soundDept) {
      if (seen.has(person.id)) continue
      seen.add(person.id)
      unique.push(person)
      if (unique.length >= 6) break
    }
    return unique
  }, [credits])

  return (
    <div
      className={`fixed inset-y-0 right-0 z-50 ${isOpen ? '' : 'pointer-events-none'}`}
      aria-hidden={!isOpen}
    >
      {/* Drawer without backdrop */}
      <aside
        className={`details-drawer absolute right-0 top-0 h-full w-full sm:w-[420px] md:w-[520px] bg-dark-100 shadow-2xl overflow-y-auto transition-transform duration-300 ease-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
        role="dialog"
        aria-label="Title details"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b border-light-100/10 flex items-start gap-3">
          <button
            className="text-white/70 text-xl leading-none"
            onClick={onClose}
            aria-label="Close details"
          >
            ×
          </button>
          <div className="ml-1">
            <h3 className="text-white font-bold text-lg line-clamp-2">
              {item?.title || item?.name || 'Details'}
            </h3>
            <p className="text-gray-100 text-sm mt-1">
              {(item?.media_type === 'tv' ? 'TV Series' : 'Movie')}
              {item?.release_date || item?.first_air_date ? ` • ${(item?.release_date || item?.first_air_date).slice(0,4)}` : ''}
              {item?.original_language ? ` • ${item.original_language}` : ''}
            </p>
          </div>
        </div>

        <div className="p-5">
          {/* Overview */}
          {item?.overview && (
            <div className="mb-5">
              <h4 className="text-white font-semibold mb-2">Overview</h4>
              <p className="text-gray-100 text-sm leading-6">{item.overview}</p>
            </div>
          )}

          {/* Directors */}
          <div className="mb-6">
            <h4 className="text-white font-semibold mb-3">Director{directors.length > 1 ? 's' : ''}</h4>
            {isLoading ? (
              <p className="text-gray-100 text-sm">Loading...</p>
            ) : directors.length === 0 ? (
              <p className="text-gray-100 text-sm">Not available</p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {directors.map((d) => (
                  <li key={d.id}>
                    <a
                      className="bg-light-100/10 text-white text-xs px-2 py-1 rounded inline-block hover:bg-light-100/20"
                      href={`https://www.google.com/search?q=${encodeURIComponent(d.name)}`}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      title={`Search ${d.name}`}
                    >
                      {d.name}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Top Cast */}
          <div className="mb-2">
            <h4 className="text-white font-semibold mb-3">Top Cast</h4>
            {isLoading ? (
              <p className="text-gray-100 text-sm">Loading...</p>
            ) : topCast.length === 0 ? (
              <p className="text-gray-100 text-sm">Not available</p>
            ) : (
              <ul className="grid grid-cols-2 gap-3">
                {topCast.map((c) => (
                  <li key={c.cast_id || `${c.id}-${c.credit_id}`} className="bg-light-100/5 rounded p-2">
                    <a
                      className="flex gap-3 items-center hover:bg-light-100/10 rounded p-1"
                      href={`https://www.google.com/search?q=${encodeURIComponent(c.name)}`}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      title={`Search ${c.name}`}
                    >
                      <img
                        src={c.profile_path ? `${IMAGE_BASE}${c.profile_path}` : '/no-movie.png'}
                        alt={c.name}
                        className="w-12 h-16 object-cover rounded"
                        onError={(e) => { e.currentTarget.src = '/no-movie.png' }}
                      />
                      <div className="min-w-0">
                        <p className="text-white text-sm font-semibold truncate">{c.name}</p>
                        {c.character && (
                          <p className="text-gray-100 text-xs truncate">as {c.character}</p>
                        )}
                      </div>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Music / Composers */}
          <div className="mt-4 mb-4">
            <h4 className="text-white font-semibold mb-3">Music </h4>
            {isLoading ? (
              <p className="text-gray-100 text-sm">Loading...</p>
            ) : composers.length === 0 ? (
              <p className="text-gray-100 text-sm">Not available</p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {composers.map((p) => (
                  <li key={p.id}>
                    <a
                      className="bg-light-100/10 text-white text-xs px-2 py-1 rounded inline-block hover:bg-light-100/20"
                      href={`https://www.google.com/search?q=${encodeURIComponent(p.name)}`}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      title={`Search ${p.name}`}
                    >
                      {p.name}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </aside>
    </div>
  )
}

export default DetailsDrawer


