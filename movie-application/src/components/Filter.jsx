import React, { useState, useRef, useEffect } from 'react';

const Filter = ({ 
  selectedLanguages, 
  setSelectedLanguages, 
  selectedGenres, 
  setSelectedGenres, 
  selectedYears, 
  setSelectedYears 
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('language');
  const filterRef = useRef(null);
  const dropdownRef = useRef(null);

  const languages = [
    { code: 'en', name: 'English' },
    { code: 'hi', name: 'Hindi' },
    { code: 'mr', name: 'Marathi' },
    { code: 'ko', name: 'Korean' },
    { code: 'zh', name: 'Chinese' },
    { code: 'ja', name: 'Japanese' },
    { code: 'fr', name: 'French' },
    { code: 'de', name: 'German' },
    { code: 'es', name: 'Spanish' },
    { code: 'it', name: 'Italian' },
    { code: 'pt', name: 'Portuguese' },
    { code: 'ru', name: 'Russian' },
    { code: 'ar', name: 'Arabic' },
    { code: 'nl', name: 'Dutch' },
    { code: 'sv', name: 'Swedish' },
    { code: 'no', name: 'Norwegian' },
    { code: 'da', name: 'Danish' },
    { code: 'fi', name: 'Finnish' },
    { code: 'other', name: 'Other Languages' }
  ];

  const genres = [
    { id: 28, name: 'Action' },
    { id: 12, name: 'Adventure' },
    { id: 16, name: 'Animation' },
    { id: 35, name: 'Comedy' },
    { id: 80, name: 'Crime' },
    { id: 99, name: 'Documentary' },
    { id: 18, name: 'Drama' },
    { id: 10751, name: 'Family' },
    { id: 14, name: 'Fantasy' },
    { id: 36, name: 'History' },
    { id: 27, name: 'Horror' },
    { id: 10402, name: 'Music' },
    { id: 9648, name: 'Mystery' },
    { id: 10749, name: 'Romance' },
    { id: 878, name: 'Science Fiction' },
    { id: 10770, name: 'TV Movie' },
    { id: 53, name: 'Thriller' },
    { id: 10752, name: 'War' },
    { id: 37, name: 'Western' }
  ];

  // Generate years from 2025 down to 1950
  const years = Array.from({ length: 76 }, (_, i) => 2025 - i);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (filterRef.current && !filterRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Position dropdown correctly on mobile
  useEffect(() => {
    if (isOpen && dropdownRef.current) {
      const dropdown = dropdownRef.current;
      const button = filterRef.current;
      
      if (button && dropdown) {
        const buttonRect = button.getBoundingClientRect();
        const dropdownRect = dropdown.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        
        // Check if dropdown would go off-screen to the right
        if (buttonRect.left + dropdownRect.width > viewportWidth) {
          dropdown.style.left = 'auto';
          dropdown.style.right = '0';
          dropdown.style.transform = 'none';
        }
        
        // Check if dropdown would go off-screen to the left
        if (buttonRect.left < 0) {
          dropdown.style.left = '0';
          dropdown.style.right = 'auto';
          dropdown.style.transform = 'none';
        }
        
        // Check if dropdown would go off-screen to the bottom
        if (buttonRect.bottom + dropdownRect.height > viewportHeight) {
          dropdown.classList.add('dropdown-above');
        } else {
          dropdown.classList.remove('dropdown-above');
        }
      }
    }
  }, [isOpen]);

  const toggleLanguage = (languageCode) => {
    setSelectedLanguages(prev => {
      if (prev.includes(languageCode)) {
        return prev.filter(lang => lang !== languageCode);
      } else {
        return [...prev, languageCode];
      }
    });
  };

  const toggleGenre = (genreId) => {
    setSelectedGenres(prev => {
      if (prev.includes(genreId)) {
        return prev.filter(genre => genre !== genreId);
      } else {
        return [...prev, genreId];
      }
    });
  };

  const toggleYear = (year) => {
    setSelectedYears(prev => {
      if (prev.includes(year)) {
        return prev.filter(y => y !== year);
      } else {
        return [...prev, year];
      }
    });
  };

  const clearAllFilters = () => {
    setSelectedLanguages([]);
    setSelectedGenres([]);
    setSelectedYears([]);
  };

  const getTotalFiltersCount = () => {
    return selectedLanguages.length + selectedGenres.length + selectedYears.length;
  };

  return (
    <div className="filter-container" ref={filterRef}>
      <button
        className="filter-button"
        onClick={() => setIsOpen(!isOpen)}
        title="Filter movies and TV shows"
      >
        <svg 
          className="filter-icon" 
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <path 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            strokeWidth={2} 
            d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.207A1 1 0 013 6.5V4z" 
          />
        </svg>
        {getTotalFiltersCount() > 0 && (
          <span className="filter-badge">{getTotalFiltersCount()}</span>
        )}
      </button>

      {isOpen && (
        <div className="filter-dropdown" ref={dropdownRef}>
          <div className="filter-header">
            <h3>Filters</h3>
            {getTotalFiltersCount() > 0 && (
              <button 
                className="clear-filters-btn"
                onClick={clearAllFilters}
              >
                Clear All
              </button>
            )}
          </div>
          
          <div className="filter-tabs">
            <button 
              className={`filter-tab ${activeTab === 'language' ? 'active' : ''}`}
              onClick={() => setActiveTab('language')}
            >
              Language
            </button>
            <button 
              className={`filter-tab ${activeTab === 'genre' ? 'active' : ''}`}
              onClick={() => setActiveTab('genre')}
            >
              Genre
            </button>
            <button 
              className={`filter-tab ${activeTab === 'year' ? 'active' : ''}`}
              onClick={() => setActiveTab('year')}
            >
              Year
            </button>
          </div>
          
          <div className="filter-options">
            {activeTab === 'language' && (
              <>
                {languages.map((language) => (
                  <label key={language.code} className="filter-option">
                    <input
                      type="checkbox"
                      checked={selectedLanguages.includes(language.code)}
                      onChange={() => toggleLanguage(language.code)}
                    />
                    <span className="checkmark"></span>
                    <span className="option-name">{language.name}</span>
                  </label>
                ))}
              </>
            )}
            
            {activeTab === 'genre' && (
              <>
                {genres.map((genre) => (
                  <label key={genre.id} className="filter-option">
                    <input
                      type="checkbox"
                      checked={selectedGenres.includes(genre.id)}
                      onChange={() => toggleGenre(genre.id)}
                    />
                    <span className="checkmark"></span>
                    <span className="option-name">{genre.name}</span>
                  </label>
                ))}
              </>
            )}
            
            {activeTab === 'year' && (
              <>
                {years.map((year) => (
                  <label key={year} className="filter-option">
                    <input
                      type="checkbox"
                      checked={selectedYears.includes(year)}
                      onChange={() => toggleYear(year)}
                    />
                    <span className="checkmark"></span>
                    <span className="option-name">{year}</span>
                  </label>
                ))}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Filter;
