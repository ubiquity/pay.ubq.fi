import React from 'react';
import logoSvgContent from '../assets/ubiquity-os-logo.svg?raw'; // Import SVG content as raw string

interface LoginPageProps {
  onLogin: () => void;
}

export function LoginPage({ onLogin }: LoginPageProps) {
  // Create a wrapper span for the SVG content
  const LogoSpan = () => (
    <span
      id="header-logo-wrapper" // Use a wrapper class if needed for positioning/sizing
      dangerouslySetInnerHTML={{ __html: logoSvgContent }}
    />
  );

  return (
    <div>
      <h1><LogoSpan /><span>Ubiquity OS Rewards</span></h1>
      <button onClick={onLogin}>Login with GitHub</button>
    </div>
  );
}
