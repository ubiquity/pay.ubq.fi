import { createContext, useState, useContext, ReactNode, useMemo, useEffect } from 'react'; // Import useEffect, Removed React

interface AnimationContextType {
  initialAnimationComplete: boolean;
  setInitialAnimationComplete: (complete: boolean) => void;
}

const AnimationContext = createContext<AnimationContextType | undefined>(undefined);

interface AnimationProviderProps {
  children: ReactNode;
}

export function AnimationProvider({ children }: AnimationProviderProps) {
  const [initialAnimationComplete, setInitialAnimationComplete] = useState(false);

  // Effect to mark initial animation as complete after a delay, runs only once on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      setInitialAnimationComplete(true);
    }, 4100); // Delay (3s) + Duration (1s) + buffer (0.1s) = 4.1s
    return () => clearTimeout(timer); // Cleanup timer on unmount
  }, []); // Empty dependency array ensures this runs only once

  // Memoize the context value to prevent unnecessary re-renders
  const value = useMemo(() => ({
    initialAnimationComplete,
    setInitialAnimationComplete,
  }), [initialAnimationComplete]);

  return (
    <AnimationContext.Provider value={value}>
      {children}
    </AnimationContext.Provider>
  );
}

export function useAnimationContext() {
  const context = useContext(AnimationContext);
  if (context === undefined) {
    throw new Error('useAnimationContext must be used within an AnimationProvider');
  }
  return context;
}
