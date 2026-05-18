import React from 'react';

interface LogoProps {
  className?: string;
  variant?: 'icon' | 'horizontal' | 'full';
  color?: 'light' | 'dark';
}

export const Logo: React.FC<LogoProps> = ({ 
  className = "w-12 h-12", 
  variant = 'icon',
  color = 'dark'
}) => {
  const textColor = color === 'dark' ? 'text-slate-900' : 'text-white';
  const taglineColor = 'text-blue-500';

  const iconElement = (
    <svg 
      viewBox="0 0 100 100" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
      className={variant === 'icon' ? className : "w-10 h-10"}
    >
      <defs>
        <linearGradient id="pinGradient" x1="50" y1="0" x2="50" y2="100" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#3B82F6" />
          <stop offset="100%" stopColor="#1D4ED8" />
        </linearGradient>
        <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="2" />
          <feOffset dx="0" dy="1" result="offsetblur" />
          <feComponentTransfer>
            <feFuncA type="linear" slope="0.1" />
          </feComponentTransfer>
          <feMerge>
            <feMergeNode />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      
      {/* Subtle shadow underneath */}
      <ellipse cx="50" cy="88" rx="15" ry="3" fill="black" opacity="0.1" />
      
      {/* Main Pin Shape */}
      <path 
        d="M50 85C50 85 80 55 80 35C80 18.4315 66.5685 5 50 5C33.4315 5 20 18.4315 20 35C20 55 50 85 50 85Z" 
        fill="url(#pinGradient)" 
      />
      
      {/* Concentric circles */}
      <circle cx="50" cy="35" r="12" fill="white" />
      <circle cx="50" cy="35" r="5" fill="#1D4ED8" />
    </svg>
  );

  if (variant === 'icon') {
    return iconElement;
  }

  if (variant === 'horizontal') {
    return (
      <div className={`flex items-center gap-3 ${className}`}>
        {iconElement}
        <div className="flex flex-col">
          <span className={`text-2xl font-black tracking-tighter leading-none ${textColor}`}>spotheon</span>
          <span className={`text-[8px] font-bold tracking-[0.2em] ${taglineColor}`}>EXPLORE. DISCOVER. CONNECT.</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col items-center gap-4 ${className}`}>
      {iconElement}
      <div className="text-center">
        <div className={`text-4xl font-black tracking-tighter ${textColor}`}>spotheon</div>
        <div className={`text-xs font-bold tracking-[0.3em] mt-1 ${taglineColor}`}>EXPLORE. DISCOVER. CONNECT.</div>
      </div>
    </div>
  );
};
