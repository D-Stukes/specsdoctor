// The tour guide: an original amber orb with two rounded eyes. Five states:
// idle, talking, pointing, thinking, celebrating. Plain SVG, a few hundred bytes.
export default function GuideCharacter({ state = "idle", size = 64 }) {
  return (
    <svg className={`guide guide-${state}`} width={size} height={size} viewBox="0 0 64 64" role="img" aria-label={`Tour guide, ${state}`}>
      <defs>
        <radialGradient id="guide-orb" cx="38%" cy="32%" r="75%">
          <stop offset="0" stopColor="#ffe3b3" />
          <stop offset="0.55" stopColor="#f4c27a" />
          <stop offset="1" stopColor="#c98a3a" />
        </radialGradient>
      </defs>
      <ellipse className="guide-glow" cx="32" cy="34" rx="29" ry="29" fill="#f4c27a" opacity="0.18" />
      <g className="guide-body">
        <circle cx="32" cy="32" r="22" fill="url(#guide-orb)" />
        <g className="guide-eyes">
          <rect className="guide-eye" x="21" y="26" width="7" height="11" rx="3.5" fill="#1b1306" />
          <rect className="guide-eye" x="36" y="26" width="7" height="11" rx="3.5" fill="#1b1306" />
        </g>
        <ellipse className="guide-mouth" cx="32" cy="43" rx="4" ry="1.6" fill="#1b1306" opacity="0.85" />
        <path className="guide-arm" d="M52 34 L62 30" stroke="#f4c27a" strokeWidth="4" strokeLinecap="round" fill="none" />
        <g className="guide-dots" fill="#1b1306">
          <circle cx="24" cy="12" r="2" />
          <circle cx="32" cy="9" r="2" />
          <circle cx="40" cy="12" r="2" />
        </g>
        <g className="guide-sparkles" fill="#fff3d6">
          <path d="M10 14 l2 5 l5 2 l-5 2 l-2 5 l-2 -5 l-5 -2 l5 -2 z" />
          <path d="M54 10 l1.5 4 l4 1.5 l-4 1.5 l-1.5 4 l-1.5 -4 l-4 -1.5 l4 -1.5 z" />
        </g>
      </g>
    </svg>
  );
}
