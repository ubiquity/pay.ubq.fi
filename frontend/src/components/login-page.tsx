import React from 'react';

interface LoginPageProps {
  onLogin: () => void;
}

export function LoginPage({ onLogin }: LoginPageProps) {
  return (
    <div>
      <h1>Permit Claiming App</h1>
      <button onClick={onLogin}>Login with GitHub</button>
    </div>
  );
}
