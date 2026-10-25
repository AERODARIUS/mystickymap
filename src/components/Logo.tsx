import React from 'react';

interface LogoProps {
  className?: string;
  variant?: 'icon' | 'horizontal' | 'full';
  color?: 'light' | 'dark';
  showTagline?: boolean;
}

export const Logo: React.FC<LogoProps> = ({ 
  className = "w-12 h-12", 
  variant = 'icon',
  color = 'dark',
  showTagline = true
}) => {
  const textColor = color === 'dark' ? 'text-[#081e2b]' : 'text-white';
  const taglineColor = color === 'dark' ? 'text-[#0d9488]' : 'text-teal-300';

  const iconElement = (
    <svg 
      viewBox="0 0 100 110" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
      className={variant === 'icon' ? className : "w-10 h-10 shrink-0"}
    >
      <defs>
        <linearGradient id="spotheonPinGrad" x1="50" y1="5" x2="50" y2="85" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#00bba2" />
          <stop offset="60%" stopColor="#00a88f" />
          <stop offset="100%" stopColor="#0d9488" />
        </linearGradient>
        <linearGradient id="spotheonInnerGrad" x1="50" y1="20" x2="50" y2="50" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#081e2b" />
          <stop offset="100%" stopColor="#0e3846" />
        </linearGradient>
      </defs>
      
      {/* Ground Shadow */}
      <ellipse cx="50" cy="98" rx="16" ry="3.5" fill="#081e2b" opacity="0.15" />
      
      {/* Outer Drop Pin Shape */}
      <path 
        d="M50 88C50 88 82 56 82 36C82 18.3269 67.6731 4 50 4C32.3269 4 18 18.3269 18 36C18 56 50 88 50 88Z" 
        fill="url(#spotheonPinGrad)" 
      />
      
      {/* Inner Drop Detail */}
      <path
        d="M50 50C50 50 62 38 62 30C62 23.3726 56.6274 18 50 18C43.3726 18 38 23.3726 38 30C38 38 50 50 50 50Z"
        fill="url(#spotheonInnerGrad)"
      />
    </svg>
  );

  if (variant === 'icon') {
    return iconElement;
  }

  if (variant === 'horizontal') {
    return (
      <div className={`flex items-center gap-2.5 ${className}`}>
        {iconElement}
        <div className="flex flex-col items-start leading-none">
          <div className="relative">
            <span className={`text-2xl font-black tracking-wider uppercase font-sans ${textColor}`}>
              SPOTHEON
            </span>
            {/* Curved underline arc underneath SPOTHEON */}
            <svg viewBox="0 0 120 12" fill="none" className="w-full h-2 mt-0.5 text-[#0d9488]">
              <path d="M10 3 C 40 10, 80 10, 110 3" stroke="currentColor" strokeWidth="3" strokeLinecap="round" fill="none" />
            </svg>
          </div>
          {showTagline && (
            <span className={`text-[8px] font-extrabold tracking-[0.25em] uppercase ${taglineColor} -mt-0.5`}>
              EXPLORE. DISCOVER. CONNECT.
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col items-center gap-2 ${className}`}>
      {iconElement}
      <div className="text-center flex flex-col items-center">
        <div className="relative">
          <span className={`text-3xl font-black tracking-wider uppercase font-sans ${textColor}`}>
            SPOTHEON
          </span>
          <svg viewBox="0 0 120 12" fill="none" className="w-32 h-2.5 mt-0.5 text-[#0d9488] mx-auto">
            <path d="M10 3 C 40 10, 80 10, 110 3" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" fill="none" />
          </svg>
        </div>
        {showTagline && (
          <span className={`text-[9px] font-extrabold tracking-[0.3em] uppercase ${taglineColor} mt-1`}>
            EXPLORE. DISCOVER. CONNECT.
          </span>
        )}
      </div>
    </div>
  );
};
