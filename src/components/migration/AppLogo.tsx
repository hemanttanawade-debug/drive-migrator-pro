interface AppLogoProps {
  showText?: boolean;
  size?: "sm" | "md" | "lg";
}

const sizeMap = {
  sm: { box: "h-8 w-8", title: "text-sm", sub: "text-[10px]" },
  md: { box: "h-10 w-10", title: "text-base", sub: "text-[11px]" },
  lg: { box: "h-14 w-14", title: "text-xl", sub: "text-xs" },
};

const AppLogo = ({ showText = true, size = "md" }: AppLogoProps) => {
  const s = sizeMap[size];

  return (
    <div className="flex items-center gap-3">
      <div
        className={`relative ${s.box} shrink-0 rounded-2xl bg-gradient-to-br from-primary via-info to-primary shadow-brand`}
      >
        <svg
          viewBox="0 0 48 48"
          fill="none"
          className="absolute inset-0 h-full w-full p-2"
          aria-hidden="true"
        >
          {/* source cloud node */}
          <circle cx="11" cy="24" r="6" fill="white" fillOpacity="0.95" />
          {/* destination cloud node */}
          <circle cx="37" cy="24" r="6" fill="white" fillOpacity="0.95" />
          {/* top arc — flowing from source to destination */}
          <path
            d="M11 18 C 18 6, 30 6, 37 18"
            stroke="white"
            strokeOpacity="0.85"
            strokeWidth="2.2"
            strokeLinecap="round"
            fill="none"
          />
          <path
            d="M34 16 L 37 18 L 35 21"
            stroke="white"
            strokeOpacity="0.95"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
          {/* bottom arc — return / sync */}
          <path
            d="M37 30 C 30 42, 18 42, 11 30"
            stroke="white"
            strokeOpacity="0.6"
            strokeWidth="2.2"
            strokeLinecap="round"
            fill="none"
          />
          <path
            d="M14 32 L 11 30 L 13 27"
            stroke="white"
            strokeOpacity="0.9"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </svg>
      </div>

      {showText && (
        <div className="leading-tight">
          <p className={`${s.title} font-semibold tracking-tight text-foreground`}>
            Drive Migration
          </p>
          <p className={`${s.sub} text-muted-foreground`}>Workspace transfer suite</p>
        </div>
      )}
    </div>
  );
};

export default AppLogo;
