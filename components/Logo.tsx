// App mark: a rounded badge with "level up" chevrons and a spark.
export default function Logo() {
  return (
    <span className="logo" aria-hidden="true">
      <svg viewBox="0 0 48 48">
        <rect x="2" y="2" width="44" height="44" rx="14" fill="var(--c0)" />
        <path d="M14 29 L24 19 L34 29" fill="none" stroke="#fff" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M14 38 L24 28 L34 38" fill="none" stroke="#fff" strokeOpacity=".55" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M37 6 L39 11 L44 13 L39 15 L37 20 L35 15 L30 13 L35 11 Z" fill="var(--star)" stroke="var(--bg)" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
    </span>
  );
}
