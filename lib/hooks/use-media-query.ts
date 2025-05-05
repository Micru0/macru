import { useState, useEffect } from 'react';

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);
  
  useEffect(() => {
    const mediaQuery = window.matchMedia(query);
    
    // Set the initial value
    setMatches(mediaQuery.matches);
    
    // Create listener function
    const listener = (event: MediaQueryListEvent) => {
      setMatches(event.matches);
    };
    
    // Add listener for changes
    mediaQuery.addEventListener('change', listener);
    
    // Remove listener on cleanup
    return () => {
      mediaQuery.removeEventListener('change', listener);
    };
  }, [query]);
  
  return matches;
} 