import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import Search from './components/Search'
import MovieCard from './components/MovieCard';
import Filter from './components/Filter';
import DetailsDrawer from './components/DetailsDrawer';
import GenreIcons from './components/GenreIcons';
import { updateSearchCount } from './appwrite';
import { isProduction } from './utils/env.js';

// API config - TMDB always uses HTTPS
const API_BASE_URL = 'https://api.themoviedb.org/3';
const API_KEY = import.meta.env.VITE_TMDB_API_KEY;

// TMDB watch provider ids
const PROVIDER = {
  NETFLIX: 8,
  PRIME: 9,
  HOTSTAR: 122, // Disney+ Hotstar (IN)
};

const App = () => {
  const [searchTerm, setSearchTerm] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [movieList, setMovieList] = useState([])
  const [selectedLanguages, setSelectedLanguages] = useState([])
  const [selectedGenres, setSelectedGenres] = useState([])
  const [selectedYears, setSelectedYears] = useState([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const [selectedItem, setSelectedItem] = useState(null)
  const [credits, setCredits] = useState(null)
  const [isCreditsLoading, setIsCreditsLoading] = useState(false)
  const [flippedItemKey, setFlippedItemKey] = useState(null)
  const [lastRefreshTime, setLastRefreshTime] = useState(new Date())

  // Abort controller for in-flight search
  const searchAbortRef = useRef(null)

  // Enhanced in-memory cache for search results in this session
  const searchCacheRef = useRef(new Map())
  
  // Daily movie rotation with 80% Hindi, 20% English mix (or based on selected languages)
  const getDailyMovieMix = async (selectedLangs = []) => {
    try {
      const today = new Date().toDateString();
      const cacheKey = `daily_mix_${today}`;
      
      // Check if we already have today's mix in cache
      if (searchCacheRef.current.has(cacheKey)) {
        return searchCacheRef.current.get(cacheKey);
      }

      let dailyMix = [];

      if (selectedLangs.length > 0) {
        // Use selected languages for the mix
        const languagePromises = selectedLangs.map(async (langCode) => {
          if (langCode === 'other') {
            // For "other languages", fetch popular movies and filter them
            const response = await fetch(
              `${API_BASE_URL}/discover/movie?sort_by=popularity.desc&page=1&include_adult=false`, 
              { 
                method: 'GET', 
                headers: { accept: 'application/json', Authorization: `Bearer ${API_KEY}` } 
              }
            );
            
            if (!response.ok) throw new Error('Failed to fetch movies');
            const data = await response.json();
            
            // Filter for languages not in the main list
            const mainLanguages = ['en', 'hi', 'mr', 'ko', 'zh', 'ja', 'fr', 'de', 'es', 'it', 'pt', 'ru', 'ar', 'nl', 'sv', 'no', 'da', 'fi'];
            return (data.results || []).filter(movie => 
              movie.original_language && 
              !mainLanguages.includes(movie.original_language.toLowerCase())
            ).map(m => ({ ...m, media_type: 'movie' }));
          } else {
            // Fetch movies for specific language
            const response = await fetch(
              `${API_BASE_URL}/discover/movie?with_original_language=${langCode}&sort_by=popularity.desc&page=1&include_adult=false`, 
              { 
                method: 'GET', 
                headers: { accept: 'application/json', Authorization: `Bearer ${API_KEY}` } 
              }
            );
            
            if (!response.ok) throw new Error(`Failed to fetch movies for language: ${langCode}`);
            const data = await response.json();
            return (data.results || []).map(m => ({ ...m, media_type: 'movie' }));
          }
        });

        const languageResults = await Promise.all(languagePromises);
        const allMovies = languageResults.flat();
        
        // Remove duplicates and limit to 80
        const uniqueMovies = allMovies.filter((movie, index, self) => 
          index === self.findIndex(m => m.id === movie.id)
        );
        
        dailyMix = uniqueMovies.slice(0, 80);
      } else {
        // Default mix: 80% Hindi, 20% English
        const hindiResponse = await fetch(
          `${API_BASE_URL}/discover/movie?with_origin_country=IN&sort_by=popularity.desc&page=1&include_adult=false`, 
          { 
            method: 'GET', 
            headers: { accept: 'application/json', Authorization: `Bearer ${API_KEY}` } 
          }
        );
        
        const englishResponse = await fetch(
          `${API_BASE_URL}/discover/movie?with_original_language=en&sort_by=popularity.desc&page=1&include_adult=false`, 
          { 
            method: 'GET', 
            headers: { accept: 'application/json', Authorization: `Bearer ${API_KEY}` } 
          }
        );

        if (!hindiResponse.ok || !englishResponse.ok) {
          throw new Error('Failed to fetch daily movie mix');
        }

        const [hindiData, englishData] = await Promise.all([
          hindiResponse.json(),
          englishResponse.json()
        ]);

        // Create mix: 80% Hindi, 20% English (total 80 movies)
        const hindiMovies = (hindiData.results || []).slice(0, 64).map(m => ({ 
          ...m, 
          media_type: 'movie', 
          isHindi: true 
        }));
        
        const englishMovies = (englishData.results || []).slice(0, 16).map(m => ({ 
          ...m, 
          media_type: 'movie' 
        }));

        // Interleave for better mix
        let hindiIndex = 0;
        let englishIndex = 0;
        
        for (let i = 0; i < 80; i++) {
          if (i % 5 === 0 && englishIndex < englishMovies.length) {
            // Every 5th movie is English (20%)
            dailyMix.push(englishMovies[englishIndex]);
            englishIndex++;
          } else if (hindiIndex < hindiMovies.length) {
            // Rest are Hindi (80%)
            dailyMix.push(hindiMovies[hindiIndex]);
            hindiIndex++;
          }
        }
      }

      // Check Prime Video availability for daily mix
      const dailyMixWithProviders = await Promise.all(
        dailyMix.map(async (movie) => {
          try {
            const response = await fetch(
              `${API_BASE_URL}/movie/${movie.id}/watch/providers`, 
              { 
                method: 'GET', 
                headers: { accept: 'application/json', Authorization: `Bearer ${API_KEY}` } 
              }
            );
            
            if (response.ok) {
              const data = await response.json();
              // Check multiple regions for Prime Video availability
              const inProviders = data?.results?.IN?.flatrate || data?.results?.IN?.ads || [];
              const usProviders = data?.results?.US?.flatrate || data?.results?.US?.ads || [];
              const allProviders = [...inProviders, ...usProviders];
              
              const isPrime = Array.isArray(allProviders) && allProviders.some((p) => p.provider_id === PROVIDER.PRIME);
              
              // Debug logging for all movies to see what providers are available
              console.log(`Daily mix - ${movie.title}:`, {
                inProviders: inProviders,
                usProviders: usProviders,
                allProviders: allProviders,
                isPrime: isPrime,
                providerIds: allProviders.map(p => p.provider_id)
              });
              
              return { ...movie, isPrime };
            }
            return movie;
          } catch (error) {
            return movie;
          }
        })
      );
      
      searchCacheRef.current.set(cacheKey, dailyMixWithProviders);
      return dailyMixWithProviders;
    } catch (error) {
      console.error('Error fetching daily movie mix:', error);
      return [];
    }
  };

  // Pre-warm cache with popular searches
  useEffect(() => {
    const popularSearches = ['action', 'comedy', 'drama', 'horror', 'romance']
    
    const prewarmCache = () => {
      popularSearches.forEach(term => {
        if (!searchCacheRef.current.has(term)) {
          // Pre-fetch popular searches in background
          fetch(`${API_BASE_URL}/search/movie?query=${term}&page=1`, { 
            method: 'GET', 
            headers: { accept: 'application/json', Authorization: `Bearer ${API_KEY}` } 
          })
          .then(res => res.json())
          .then(data => {
            const movies = (data.results || []).slice(0, 10).map(m => ({ ...m, media_type: 'movie' }))
            searchCacheRef.current.set(term, movies)
          })
          .catch(() => {}) // Silent fail for pre-warming
        }
      },100)
    }
    
    // Use requestIdleCallback for better performance
    if (window.requestIdleCallback) {
      window.requestIdleCallback(prewarmCache, { timeout: 1000 })
    } else {
      // Fallback for browsers that don't support requestIdleCallback
      setTimeout(prewarmCache, 1000)
    }
  }, [])

  const markProvidersForTvItems = async (tvItems) => {
    const controller = new AbortController()
    const toCheck = tvItems.slice(0, 8)
    try {
      const marked = await Promise.all(
        toCheck.map(async (item) => {
          try {
            const res = await fetch(`${API_BASE_URL}/tv/${item.id}/watch/providers`, { method: 'GET', headers: { accept: 'application/json', Authorization: `Bearer ${API_KEY}` }, signal: controller.signal })
            if (!res.ok) return item
            const data = await res.json()
            // Check multiple regions for provider availability
            const inProviders = data?.results?.IN?.flatrate || data?.results?.IN?.ads || []
            const usProviders = data?.results?.US?.flatrate || data?.results?.US?.ads || []
            const allProviders = [...inProviders, ...usProviders]
            
            const isNetflix = Array.isArray(allProviders) && allProviders.some((p) => p.provider_id === PROVIDER.NETFLIX)
            const isPrime = Array.isArray(allProviders) && allProviders.some((p) => p.provider_id === PROVIDER.PRIME)
            return { ...item, isNetflix, isPrime }
          } catch {
            return item
          }
        })
      )
      return [...marked, ...tvItems.slice(8)]
    } catch {
      return tvItems
    }
  }

  const fetchMovies = useCallback(async (query = '') => {
    // cancel previous
    if (searchAbortRef.current) {
      searchAbortRef.current.abort()
    }
    const controller = new AbortController()
    searchAbortRef.current = controller

    setIsLoading(true)
    setErrorMessage('')

    try {
      const normalizedKey = query.trim().toLowerCase()

      // Serve from cache if available (only for non-empty queries)
      if (normalizedKey && searchCacheRef.current.has(normalizedKey)) {
        setMovieList(searchCacheRef.current.get(normalizedKey))
        setIsLoading(false)
        return
      }

      if (!query) {
        // Check if any filters are selected for filtering
        if (selectedLanguages.length > 0 || selectedGenres.length > 0 || selectedYears.length > 0) {
          // Fetch movies by selected languages
          setMovieList([])
          
          try {
            // Build filter parameters
            const buildFilterParams = (langCode = null) => {
              let params = new URLSearchParams({
                sort_by: 'popularity.desc',
                page: '1',
                include_adult: 'false'
              });
              
              if (langCode && langCode !== 'other') {
                params.append('with_original_language', langCode);
              }
              
              if (selectedGenres.length > 0) {
                params.append('with_genres', selectedGenres.join(','));
              }
              
              if (selectedYears.length > 0) {
                const yearRange = `${Math.min(...selectedYears)}-${Math.max(...selectedYears)}`;
                params.append('primary_release_date.gte', `${Math.min(...selectedYears)}-01-01`);
                params.append('primary_release_date.lte', `${Math.max(...selectedYears)}-12-31`);
              }
              
              return params.toString();
            };

            const languagePromises = selectedLanguages.length > 0 ? selectedLanguages.map(async (langCode) => {
              if (langCode === 'other') {
                // For "other languages", we'll fetch popular movies and TV shows and filter them
                const [movieResponse, tvResponse] = await Promise.all([
                  fetch(
                    `${API_BASE_URL}/discover/movie?${buildFilterParams()}`, 
                    { 
                      method: 'GET', 
                      headers: { accept: 'application/json', Authorization: `Bearer ${API_KEY}` },
                      signal: controller.signal
                    }
                  ),
                  fetch(
                    `${API_BASE_URL}/discover/tv?${buildFilterParams()}`, 
                    { 
                      method: 'GET', 
                      headers: { accept: 'application/json', Authorization: `Bearer ${API_KEY}` },
                      signal: controller.signal
                    }
                  )
                ]);
                
                if (!movieResponse.ok || !tvResponse.ok) throw new Error('Failed to fetch content');
                const [movieData, tvData] = await Promise.all([movieResponse.json(), tvResponse.json()]);
                
                // Filter for languages not in the main list
                const mainLanguages = ['en', 'hi', 'mr', 'ko', 'zh', 'ja', 'fr', 'de', 'es', 'it', 'pt', 'ru', 'ar', 'nl', 'sv', 'no', 'da', 'fi'];
                const filteredMovies = (movieData.results || []).filter(movie => 
                  movie.original_language && 
                  !mainLanguages.includes(movie.original_language.toLowerCase())
                ).map(m => ({ ...m, media_type: 'movie' }));
                
                const filteredTv = (tvData.results || []).filter(tv => 
                  tv.original_language && 
                  !mainLanguages.includes(tv.original_language.toLowerCase())
                ).map(t => ({ ...t, media_type: 'tv' }));
                
                return [...filteredMovies, ...filteredTv];
              } else {
                // Fetch movies and TV shows for specific language
                console.log(`Fetching content for language: ${langCode}`);
                
                const [movieResponse, tvResponse] = await Promise.all([
                  fetch(
                    `${API_BASE_URL}/discover/movie?${buildFilterParams(langCode)}`, 
                    { 
                      method: 'GET', 
                      headers: { accept: 'application/json', Authorization: `Bearer ${API_KEY}` },
                      signal: controller.signal
                    }
                  ),
                  fetch(
                    `${API_BASE_URL}/discover/tv?${buildFilterParams(langCode)}`, 
                    { 
                      method: 'GET', 
                      headers: { accept: 'application/json', Authorization: `Bearer ${API_KEY}` },
                      signal: controller.signal
                    }
                  )
                ]);
                
                if (!movieResponse.ok || !tvResponse.ok) {
                  console.error(`API Error for ${langCode}:`, {
                    movieStatus: movieResponse.status,
                    tvStatus: tvResponse.status,
                    movieUrl: movieResponse.url,
                    tvUrl: tvResponse.url
                  });
                  throw new Error(`Failed to fetch content for language: ${langCode}`);
                }
                
                const [movieData, tvData] = await Promise.all([movieResponse.json(), tvResponse.json()]);
                
                console.log(`Results for ${langCode}:`, {
                  movies: movieData.results?.length || 0,
                  tvShows: tvData.results?.length || 0,
                  sampleMovies: (movieData.results || []).slice(0, 2).map(m => ({ 
                    id: m.id, 
                    title: m.title, 
                    language: m.original_language 
                  })),
                  sampleTv: (tvData.results || []).slice(0, 2).map(t => ({ 
                    id: t.id, 
                    name: t.name, 
                    language: t.original_language 
                  }))
                });
                
                const movies = (movieData.results || []).map(m => ({ ...m, media_type: 'movie' }));
                const tvShows = (tvData.results || []).map(t => ({ ...t, media_type: 'tv' }));
                
                return [...movies, ...tvShows];
              }
            }) : [];

            let allResults = [];
            
            if (selectedLanguages.length > 0) {
              const languageResults = await Promise.all(languagePromises);
              allResults = languageResults.flat();
            } else {
              // Only genres or years selected, no languages
              const [movieResponse, tvResponse] = await Promise.all([
                fetch(
                  `${API_BASE_URL}/discover/movie?${buildFilterParams()}`, 
                  { 
                    method: 'GET', 
                    headers: { accept: 'application/json', Authorization: `Bearer ${API_KEY}` },
                    signal: controller.signal
                  }
                ),
                fetch(
                  `${API_BASE_URL}/discover/tv?${buildFilterParams()}`, 
                  { 
                    method: 'GET', 
                    headers: { accept: 'application/json', Authorization: `Bearer ${API_KEY}` },
                    signal: controller.signal
                  }
                )
              ]);
              
              if (!movieResponse.ok || !tvResponse.ok) {
                console.error('API Error for genres/years:', {
                  movieStatus: movieResponse.status,
                  tvStatus: tvResponse.status
                });
                throw new Error('Failed to fetch content for genres/years');
              }
              
              const [movieData, tvData] = await Promise.all([movieResponse.json(), tvResponse.json()]);
              const movies = (movieData.results || []).map(m => ({ ...m, media_type: 'movie' }));
              const tvShows = (tvData.results || []).map(t => ({ ...t, media_type: 'tv' }));
              allResults = [...movies, ...tvShows];
            }
            
            if (controller.signal.aborted) return;
            
            // Debug logging
            console.log('All results:', allResults);
            console.log('Selected languages:', selectedLanguages);
            console.log('Selected genres:', selectedGenres);
            console.log('Selected years:', selectedYears);
            
            // Deduplicate results
            console.log('All movies before deduplication:', allResults.length);
            console.log('Sample movies:', allResults.slice(0, 3).map(m => ({ 
              id: m.id, 
              title: m.title || m.name, 
              language: m.original_language,
              media_type: m.media_type,
              genres: m.genre_ids,
              release_date: m.release_date || m.first_air_date
            })));
            
            const uniqueMovies = allResults.filter((movie, index, self) => 
              index === self.findIndex(m => m.id === movie.id)
            );
            console.log('Unique movies after deduplication:', uniqueMovies.length);
            
            // For multiple languages, try to get a balanced mix
            let limitedItems;
            if (selectedLanguages.length > 1) {
              // Group by language and take items from each language
              const groupedByLanguage = {};
              uniqueMovies.forEach(movie => {
                const lang = movie.original_language;
                if (!groupedByLanguage[lang]) {
                  groupedByLanguage[lang] = [];
                }
                groupedByLanguage[lang].push(movie);
              });
              
              console.log('Grouped by language:', Object.keys(groupedByLanguage).map(lang => ({
                language: lang,
                count: groupedByLanguage[lang].length
              })));
              
              // Interleave items from different languages
              const interleaved = [];
              const maxPerLanguage = Math.ceil(80 / selectedLanguages.length);
              let languageIndex = 0;
              
              while (interleaved.length < 80 && languageIndex < maxPerLanguage) {
                selectedLanguages.forEach(langCode => {
                  if (groupedByLanguage[langCode] && groupedByLanguage[langCode][languageIndex]) {
                    interleaved.push(groupedByLanguage[langCode][languageIndex]);
                  }
                });
                languageIndex++;
              }
              
              limitedItems = interleaved.slice(0, 80);
            } else {
              // Single language, just take the first 80
              limitedItems = uniqueMovies.slice(0, 80);
            }
            
            console.log('Final limited items:', limitedItems.length);
            console.log('Final items by language:', limitedItems.reduce((acc, item) => {
              const lang = item.original_language;
              acc[lang] = (acc[lang] || 0) + 1;
              return acc;
            }, {}));
            const itemsWithProviders = await Promise.all(
              limitedItems.map(async (item) => {
                try {
                  const response = await fetch(
                    `${API_BASE_URL}/${item.media_type}/${item.id}/watch/providers`, 
                    { 
                      method: 'GET', 
                      headers: { accept: 'application/json', Authorization: `Bearer ${API_KEY}` },
                      signal: controller.signal
                    }
                  );
                  
                  if (response.ok) {
                    const data = await response.json();
                    const inProviders = data?.results?.IN?.flatrate || data?.results?.IN?.ads || [];
                    const usProviders = data?.results?.US?.flatrate || data?.results?.US?.ads || [];
                    const allProviders = [...inProviders, ...usProviders];
                    
                    const isNetflix = Array.isArray(allProviders) && allProviders.some((p) => p.provider_id === PROVIDER.NETFLIX);
                    const isPrime = Array.isArray(allProviders) && allProviders.some((p) => p.provider_id === PROVIDER.PRIME);
                    return { ...item, isNetflix, isPrime };
                  }
                  return item;
                } catch (error) {
                  return item;
                }
              })
            );
            
            setMovieList(itemsWithProviders);
            setLastRefreshTime(new Date());
            setIsLoading(false);
            return;
          } catch (error) {
            console.error('Error fetching movies by language:', error);
            setErrorMessage('Failed to fetch movies by language');
            setIsLoading(false);
            return;
          }
        }
        
        // Default feed: Daily movie mix with 80% Hindi, 20% English
        // Show loading state immediately
        setMovieList([])
        
        try {
          const dailyMix = await getDailyMovieMix(selectedLanguages);
          
          if (controller.signal.aborted) return;
          
          if (dailyMix.length > 0) {
            setMovieList(dailyMix);
            setLastRefreshTime(new Date());
          } else {
            // Fallback to original logic if daily mix fails
            const [hindiRes, moviesRes, hotstarRes, primeRes, netflixRes] = await Promise.all([
              fetch(`${API_BASE_URL}/discover/movie?with_origin_country=IN&sort_by=popularity.desc&page=1`, { method: 'GET', headers: { accept: 'application/json', Authorization: `Bearer ${API_KEY}` }, signal: controller.signal }),
              fetch(`${API_BASE_URL}/discover/movie?sort_by=popularity.desc&page=1`, { method: 'GET', headers: { accept: 'application/json', Authorization: `Bearer ${API_KEY}` }, signal: controller.signal }),
              fetch(`${API_BASE_URL}/discover/tv?with_watch_providers=${PROVIDER.HOTSTAR}&watch_region=IN&sort_by=popularity.desc&page=1`, { method: 'GET', headers: { accept: 'application/json', Authorization: `Bearer ${API_KEY}` }, signal: controller.signal }),
              fetch(`${API_BASE_URL}/discover/tv?with_watch_providers=${PROVIDER.PRIME}&watch_region=IN&sort_by=popularity.desc&page=1`, { method: 'GET', headers: { accept: 'application/json', Authorization: `Bearer ${API_KEY}` }, signal: controller.signal }),
              fetch(`${API_BASE_URL}/discover/tv?with_watch_providers=${PROVIDER.NETFLIX}&watch_region=IN&sort_by=popularity.desc&page=1`, { method: 'GET', headers: { accept: 'application/json', Authorization: `Bearer ${API_KEY}` }, signal: controller.signal }),
            ])

            if (controller.signal.aborted) return

            if (!hindiRes.ok || !moviesRes.ok || !hotstarRes.ok || !primeRes.ok || !netflixRes.ok) {
              throw new Error('Failed to fetch default feed')
            }

            const [hindiData, moviesData, hotstarData, primeData, netflixData] = await Promise.all([
              hindiRes.json(), moviesRes.json(), hotstarRes.json(), primeRes.json(), netflixRes.json()
            ])

            const hindiMovies = (hindiData.results || []).map((m) => ({ ...m, media_type: 'movie', isHindi: true }))
            const movies = (moviesData.results || []).map((m) => ({ ...m, media_type: 'movie' }))
            const hotstarTv = (hotstarData.results || []).map((t) => ({ ...t, media_type: 'tv' }))
            const primeTv = (primeData.results || []).map((t) => ({ ...t, media_type: 'tv', isPrime: true }))
            const netflixTv = (netflixData.results || []).map((t) => ({ ...t, media_type: 'tv', isNetflix: true }))

            // Interleave to ensure a balanced mix at the top
            const buckets = [hindiMovies, netflixTv, movies, hotstarTv, primeTv]
            const interleaved = []
            let i = 0
            let added = 0
            const seen = new Set()
            while (added < 80) {
              let progressed = false
              for (const bucket of buckets) {
                const item = bucket[i]
                if (item) {
                  const key = `${item.media_type}-${item.id}`
                  if (!seen.has(key)) {
                    interleaved.push(item)
                    seen.add(key)
                    added++
                    if (added >= 80) break
                  }
                  progressed = true
                }
              }
              if (!progressed) break
              i++
            }

            setMovieList(interleaved)
          }
        } catch (error) {
          console.error('Error fetching daily mix:', error);
          // Fallback to empty list
          setMovieList([])
        }
        
        setIsLoading(false)
        return
      }
      

      // Search: movies + TV concurrently (fast); label Netflix in background
      const [movieRes, tvRes] = await Promise.all([
        fetch(`${API_BASE_URL}/search/movie?query=${encodeURIComponent(query)}&page=1`, { method: 'GET', headers: { accept: 'application/json', Authorization: `Bearer ${API_KEY}` }, signal: controller.signal }),
        fetch(`${API_BASE_URL}/search/tv?query=${encodeURIComponent(query)}&page=1`, { method: 'GET', headers: { accept: 'application/json', Authorization: `Bearer ${API_KEY}` }, signal: controller.signal }),
      ])

      if (controller.signal.aborted) return
      if (!movieRes.ok || !tvRes.ok) {
        throw new Error('Failed to fetch search results')
      }

      const [movieData, tvData] = await Promise.all([movieRes.json(), tvRes.json()])
      const movies = (movieData.results || []).map((m) => ({ ...m, media_type: 'movie' }))
      const tvShows = (tvData.results || []).map((t) => ({ ...t, media_type: 'tv' }))

      // Show first 20 results immediately for faster perceived performance
      const immediateResults = [...movies.slice(0, 12), ...tvShows.slice(0, 8)]
      setMovieList(immediateResults)
      setIsLoading(false) // Stop loading early

      // Check Netflix and Prime Video availability for all search results
      const allResults = [...tvShows, ...movies];
      const resultsWithProviders = await Promise.all(
        allResults.map(async (item) => {
          try {
            const response = await fetch(
              `${API_BASE_URL}/${item.media_type}/${item.id}/watch/providers`, 
              { 
                method: 'GET', 
                headers: { accept: 'application/json', Authorization: `Bearer ${API_KEY}` } 
              }
            );
            
            if (response.ok) {
              const data = await response.json();
              // Check multiple regions for provider availability
              const inProviders = data?.results?.IN?.flatrate || data?.results?.IN?.ads || [];
              const usProviders = data?.results?.US?.flatrate || data?.results?.US?.ads || [];
              const allProviders = [...inProviders, ...usProviders];
              
              const isNetflix = Array.isArray(allProviders) && allProviders.some((p) => p.provider_id === PROVIDER.NETFLIX);
              const isPrime = Array.isArray(allProviders) && allProviders.some((p) => p.provider_id === PROVIDER.PRIME);
              
              // Debug logging for all items to see what providers are available
              console.log(`Search - ${item.title || item.name}:`, {
                inProviders: inProviders,
                usProviders: usProviders,
                allProviders: allProviders,
                isNetflix: isNetflix,
                isPrime: isPrime,
                providerIds: allProviders.map(p => p.provider_id)
              });
              
              return { ...item, isNetflix, isPrime };
            }
            return item;
          } catch (error) {
            return item;
          }
        })
      );

      // Then show full results
      const quickBuckets = [resultsWithProviders.slice(0, 24), resultsWithProviders.slice(24, 64), resultsWithProviders.slice(64, 88)]
      const mixed = []
      let j = 0
      const seenMix = new Set()
      while (mixed.length < 80) {
        let progressed = false
        for (const bucket of quickBuckets) {
          const item = bucket[j]
          if (item) {
            const key = `${item.media_type}-${item.id}`
            if (!seenMix.has(key)) {
              mixed.push(item)
              seenMix.add(key)
              if (mixed.length >= 80) break
            }
            progressed = true
          }
        }
        if (!progressed) break
        j++
      }

      setMovieList(mixed.length ? mixed : resultsWithProviders)
      setLastRefreshTime(new Date())

      // Cache the results for this query for faster subsequent loads
      if (normalizedKey) {
        searchCacheRef.current.set(normalizedKey, mixed.length ? mixed : resultsWithProviders)
      }

      if (query && (mixed.length ? mixed : [...tvShows, ...movies]).length > 0) {
        try {
          await updateSearchCount(query, (mixed.length ? mixed : [...tvShows, ...movies])[0]);
        } catch (error) {
          console.error('Appwrite API error:', error);
          // Not critical for UX
        }
      }
    } catch (error) {
      if (error?.name === 'AbortError') return
      console.error(`Error fetching movies:, ${error}`)
      setErrorMessage('Failed to fetch movies')
    } finally {
      if (!searchAbortRef.current?.signal.aborted) setIsLoading(false)
    }
  }, [selectedLanguages, selectedGenres, selectedYears])

  const openDetails = useCallback(async (item) => {
    if (!item?.id) return
    setSelectedItem(item)
    setIsDrawerOpen(true)
    setIsCreditsLoading(true)
    setCredits(null)
    try {
      const res = await fetch(`${API_BASE_URL}/${item.media_type}/${item.id}/credits`, {
        method: 'GET',
        headers: { accept: 'application/json', Authorization: `Bearer ${API_KEY}` }
      })
      if (!res.ok) throw new Error('Failed to fetch credits')
      const data = await res.json()
      setCredits(data)
    } catch (e) {
      console.error('Error fetching credits:', e)
      setCredits({ cast: [], crew: [] })
    } finally {
      setIsCreditsLoading(false)
    }
  }, [])

  const closeDetails = useCallback(() => {
    setIsDrawerOpen(false)
    // keep selected to allow exit animation; clear later if needed
  }, [])

  const handleCardClick = useCallback((item) => {
    if (!item) return
    const key = `${item.media_type || 'movie'}-${item.id}`
    // Hide search suggestions when a card is clicked
    setShowSuggestions(false)
    if (flippedItemKey === key) {
      setFlippedItemKey(null)
      closeDetails()
    } else {
      setFlippedItemKey(key)
      openDetails(item)
    }
  }, [flippedItemKey, openDetails, setShowSuggestions])

  // Click outside to reset flipped card and close drawer
  useEffect(() => {
    const handleGlobalClick = () => {
      if (flippedItemKey) setFlippedItemKey(null)
      if (isDrawerOpen) closeDetails()
    }
    document.addEventListener('click', handleGlobalClick)
    return () => document.removeEventListener('click', handleGlobalClick)
  }, [flippedItemKey, isDrawerOpen, closeDetails])

  // Filter movies based on selected filters
  const filteredMovieList = useMemo(() => {
    if (selectedLanguages.length === 0 && selectedGenres.length === 0 && selectedYears.length === 0) {
      return movieList;
    } else {
      return movieList.filter(movie => {
        // Language filter
        const languageMatch = selectedLanguages.length === 0 || (() => {
          const movieLanguage = movie.original_language?.toLowerCase();
          return selectedLanguages.some(selectedLang => {
            if (selectedLang === 'other') {
              // For "other languages", include languages not in the main list
              const mainLanguages = ['en', 'hi', 'mr', 'ko', 'zh', 'ja', 'fr', 'de', 'es', 'it', 'pt', 'ru', 'ar', 'nl', 'sv', 'no', 'da', 'fi'];
              return !mainLanguages.includes(movieLanguage);
            }
            return movieLanguage === selectedLang;
          });
        })();

        // Genre filter
        const genreMatch = selectedGenres.length === 0 || (() => {
          const movieGenres = movie.genre_ids || [];
          return selectedGenres.some(selectedGenre => movieGenres.includes(selectedGenre));
        })();

        // Year filter
        const yearMatch = selectedYears.length === 0 || (() => {
          const releaseDate = movie.release_date || movie.first_air_date;
          if (!releaseDate) return false;
          const year = new Date(releaseDate).getFullYear();
          return selectedYears.includes(year);
        })();

        return languageMatch && genreMatch && yearMatch;
      });
    }
  }, [movieList, selectedLanguages, selectedGenres, selectedYears]);



  // Check for date change and refresh daily mix
  useEffect(() => {
    const checkDateChange = () => {
      const today = new Date().toDateString();
      const lastCheck = localStorage.getItem('lastDailyMixDate');
      
      if (lastCheck !== today) {
        // Date changed, clear daily mix cache and refresh
        localStorage.setItem('lastDailyMixDate', today);
        
        // Clear daily mix from cache
        const cacheKeys = Array.from(searchCacheRef.current.keys());
        cacheKeys.forEach(key => {
          if (key.startsWith('daily_mix_')) {
            searchCacheRef.current.delete(key);
          }
        });
        
        // Refresh movies if no search term
        if (!searchTerm) {
          fetchMovies('');
        }
      }
    };

    // Check on mount and set up interval
    checkDateChange();
    const interval = setInterval(checkDateChange, 60000); // Check every minute

    return () => clearInterval(interval);
  }, [searchTerm]);

  // Hourly refresh mechanism for movie content
  useEffect(() => {
    const checkHourlyRefresh = () => {
      const now = new Date();
      const currentHour = now.getHours();
      const lastHourCheck = localStorage.getItem('lastHourlyRefresh');
      
      if (lastHourCheck !== currentHour.toString()) {
        // Hour changed, clear all caches and refresh
        localStorage.setItem('lastHourlyRefresh', currentHour.toString());
        
        // Clear all cached data
        searchCacheRef.current.clear();
        
        // Clear daily mix date to force refresh
        localStorage.removeItem('lastDailyMixDate');
        
        // Refresh movies if no search term
        if (!searchTerm) {
          console.log('Hourly refresh: Loading new movie content...');
          setLastRefreshTime(new Date());
          fetchMovies('');
        }
      }
    };

    // Check on mount and set up interval
    checkHourlyRefresh();
    const hourlyInterval = setInterval(checkHourlyRefresh, 60000); // Check every minute

    return () => clearInterval(hourlyInterval);
  }, [searchTerm]);



  // Debounce search for better performance (300ms delay)
  useEffect(() => {
    const id = setTimeout(() => {
      fetchMovies(searchTerm)
    }, 300)
    return () => clearTimeout(id)
  }, [searchTerm])

  // Trigger fetch when filters change (for filtering)
  useEffect(() => {
    if (!searchTerm) {
      // Only fetch when there's no search term (initial landing page)
      fetchMovies('')
    }
  }, [selectedLanguages, selectedGenres, selectedYears, fetchMovies])

  return (
    <main>
      <div className="pattern" />
      <div className='wrapper fade-in'>
        <header>
          <img 
            src="./C.png" 
            alt="Hero-Banner" 
            className="w-[400px] h-auto cursor-pointer hover:opacity-80 transition-opacity mb-[10px]" 
            onClick={() => window.location.reload()}
            title="Click to refresh page"
          />
          <h1>Your <span className="text-gradient">Content </span> Dictionary 🎬</h1>
          <div className="center">
            <h1 className='content-center'>Type it. Find it.</h1>
          </div>
          <div className="search-filter-container">
            <Search 
              searchTerm={searchTerm} 
              setSearchTerm={setSearchTerm}
              onSuggestionSelect={() => setShowSuggestions(false)}
              showSuggestions={showSuggestions}
              setShowSuggestions={setShowSuggestions}
            />
            <Filter
              selectedLanguages={selectedLanguages} 
              setSelectedLanguages={setSelectedLanguages}
              selectedGenres={selectedGenres}
              setSelectedGenres={setSelectedGenres}
              selectedYears={selectedYears}
              setSelectedYears={setSelectedYears}
            />
          </div>
          <GenreIcons
            Languages={selectedLanguages}
            selectedGenres={selectedGenres}
            setSelectedGenres={setSelectedGenres}
          />
          <h1 className='search-term'>
            <span className='text-gradient'>{searchTerm}</span>
          </h1>
          {/* Manual refresh button */}
          {!searchTerm && (
            <div className="refresh-indicator">
              {/* Uncomment if you want a refresh button */}
              {/* <button
                onClick={() => {
                  setLastRefreshTime(new Date());
                  searchCacheRef.current.clear();
                  localStorage.removeItem('lastDailyMixDate');
                  localStorage.removeItem('lastHourlyRefresh');
                  fetchMovies('');
                }}
                className="refresh-btn"
                title="Refresh content now"
              >
                Fresh Drop 🔥
              </button> */}
            </div>
          )}
        </header>
        <section className='all-movies'>
          <h2 className='mt-[40px]'>Movies, TV Shows & More!</h2>
          {isLoading ? (
            <div className="loading-spinner">
              <div className="spinner"></div>
              <p className="text-center mt-4 text-gray-300">Searching for "{searchTerm}"...</p>
            </div>
          ) : errorMessage ? (
            <div className="error-container">
              <p className='text-red-500 mb-4'>{errorMessage}</p>
              <button
                onClick={() => fetchMovies(searchTerm)}
                className="bg-blue-600 text-white px-4 py-2 rounded-md transition-colors"
              >
                Retry
              </button>
            </div>
          ) : filteredMovieList.length === 0 && (searchTerm || selectedLanguages.length > 0 || selectedGenres.length > 0 || selectedYears.length > 0) ? (
            <div className="no-results">
              <p className='text-gray-300 text-center text-lg'>
                {searchTerm ? `No results found for "${searchTerm}"` : 'No movies found'}
                {(selectedLanguages.length > 0 || selectedGenres.length > 0 || selectedYears.length > 0) && ` with selected filters`}
              </p>
              <p className='text-gray-500 text-center mt-2'>
                {searchTerm ? 'Try searching with different keywords' : 'Try adjusting your filters'}
              </p>
            </div>
          ) : (
            <ul style={{ contain: 'layout style' }}>
              {filteredMovieList.map((item) => {
                const key = `${item.media_type || 'movie'}-${item.id}`;
                return (
                  <MovieCard
                    key={key}
                    movie={item}
                    isFlipped={flippedItemKey === key}
                    onCardClick={() => handleCardClick(item)}
                  />
                );
              })}
            </ul>
          )}
        </section>
        <DetailsDrawer
          isOpen={isDrawerOpen}
          onClose={closeDetails}
          item={selectedItem}
          credits={credits}
          isLoading={isCreditsLoading}
        />
        <div className="footer footer-center">
          <h2>Made with ❤️ by <a href="https://github.com/Veer2401" target="_blank" rel="noopener noreferrer">Veer </a></h2>
          <p>Powered by <a href="https://www.themoviedb.org/" target="_blank" rel="noopener noreferrer">TMDB</a></p>
          <p>Source code on <a href="https://github.com/Veer2401/React-Movie-App" target="_blank" rel="noopener noreferrer">GitHub</a></p>
        </div>
      </div>
    </main>
  )
}

export default App
