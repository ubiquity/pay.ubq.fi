import { createContext, ReactNode, useContext, useEffect, useState } from 'react';

interface AuthContextType {
  isLoggedIn: boolean;
  isLoading: boolean; // Add loading state for checking initial status
  login: (token: string) => void; // Assume login involves receiving a session token
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(true); // Start loading initially

  // Check for existing session on initial load
  useEffect(() => {
    // TODO: Implement actual token validation/check with backend if necessary
    const token = localStorage.getItem('sessionToken'); // Example: using localStorage
    if (token) {
      console.log("Found session token, setting logged in state.");
      setIsLoggedIn(true);
    } else {
      console.log("No session token found.");
    }
    setIsLoading(false); // Finished checking
  }, []);

  const login = (token: string) => {
    // TODO: Store token securely (localStorage is simple but consider alternatives)
    localStorage.setItem('sessionToken', token);
    setIsLoggedIn(true);
    console.log("AuthContext: Logged in.");
  };

  const logout = () => {
    // TODO: Clear token from storage
    localStorage.removeItem('sessionToken');
    setIsLoggedIn(false);
    console.log("AuthContext: Logged out.");
    // Optionally redirect to login or clear other state
  };

  return (
    <AuthContext.Provider value={{ isLoggedIn, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
