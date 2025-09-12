import React from 'react';

const GenreIcons = ({ selectedGenres, setSelectedGenres }) => {
  const genres = [
    { id: 28, name: 'Action', icon: '⚔️', color: '#ef4444' },
    { id: 12, name: 'Adventure', icon: '🗺️', color: '#f59e0b' },
    { id: 99, name: 'Documentary', icon: '📽️', color: '#10b981' },
    { id: 27, name: 'Horror', icon: '👻', color: '#8b5cf6' },
    { id: 10749, name: 'Romance', icon: '♥️', color: '#ec4899' }
  ];

  const toggleGenre = (genreId) => {
    setSelectedGenres(prev => {
      if (prev.includes(genreId)) {
        return prev.filter(genre => genre !== genreId);
      } else {
        return [...prev, genreId];
      }
    });
  };

  return (
    <div className="genre-icons-container">
      <div className="genre-icons">
        {genres.map((genre) => (
          <button
            key={genre.id}
            className={`genre-icon ${selectedGenres.includes(genre.id) ? 'active' : ''}`}
            onClick={() => toggleGenre(genre.id)}
            style={{
              '--genre-color': genre.color
            }}
            title={genre.name}
          >
            <span className="genre-emoji">{genre.icon}</span>
            <span className="genre-name">{genre.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

export default GenreIcons;
