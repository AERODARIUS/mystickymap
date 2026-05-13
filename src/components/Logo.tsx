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
  const taglineColor = 'text-cyan-400';

  const LogoIcon = () => (
    <svg 
      viewBox="0 0 100 100" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
      className={variant === 'icon' ? className : "w-10 h-10"}
    >
      <defs>
        <linearGradient id="pinGradient" x1="50" y1="0" x2="50" y2="100" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#22D3EE" />
          <stop offset="100%" stopColor="#A855F7" />
        </linearGradient>
      </defs>
      {/* Background shape */}
      <rect width="100" height="100" rx="24" fill={color === 'dark' ? "#0F172A" : "rgba(255,255,255,0.1)"} />
      
      {/* Pin Shape */}
      <path 
        d="M50 85C50 85 75 60 75 40C75 26.1929 63.8071 15 50 15C36.1929 15 25 26.1929 25 40C25 60 50 85 50 85Z" 
        fill="url(#pinGradient)" 
      />
      
      {/* Swirly S / Design within pin */}
      <path 
        d="M50 25C41.7 25 35 31.7 35 40C35 48.3 41.7 55 50 55C58.3 55 65 48.3 65 40C65 31.7 58.3 25 50 25ZM50 48C45.6 48 42 44.4 42 40C42 35.6 45.6 32 50 32C54.4 32 58 35.6 58 40C58 44.4 54.4 48 50 48Z" 
        fill="rgba(0,0,0,0.2)" 
      />
      
      {/* Center eye/lens */}
      <circle cx="50" cy="40" r="6" fill="white" />
      <circle cx="50" cy="40" r="2.5" fill="#0F172A" />
      
      {/* Stylized 'S' curve overlay */}
      <path 
        d="M40 30C45 28 55 28 60 35M60 45C55 52 45 52 40 45" 
        stroke="white" 
        strokeWidth="2" 
        strokeLinecap="round"
        opacity="0.5"
      />
    </svg>
  );

  if (variant === 'icon') {
    return <LogoIcon />;
  }

  if (variant === 'horizontal') {
    return (
      <div className={`flex items-center gap-3 ${className}`}>
        <LogoIcon />
        <div className="flex flex-col">
          <span className={`text-2xl font-black tracking-tighter leading-none ${textColor}`}>spotheon</span>
          <span className={`text-[8px] font-bold tracking-[0.2em] ${taglineColor}`}>EXPLORE. DISCOVER. CONNECT.</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col items-center gap-4 ${className}`}>
      <LogoIcon />
      <div className="text-center">
        <div className={`text-4xl font-black tracking-tighter ${textColor}`}>spotheon</div>
        <div className={`text-xs font-bold tracking-[0.3em] mt-1 ${taglineColor}`}>EXPLORE. DISCOVER. CONNECT.</div>
      </div>
    </div>
  );
};
