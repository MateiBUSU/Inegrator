/** The Nexora logo mark and name, shared by the app shell and the auth screens. */
export function Brand({ inverted = false }: { inverted?: boolean }) {
  return (
    <span className="flex items-center gap-3">
      <span
        aria-hidden="true"
        className={`flex size-10 items-center justify-center rounded-control ${
          inverted ? "bg-surface text-violet" : "bg-primary text-white"
        }`}
      >
        <svg
          viewBox="0 0 24 24"
          className="size-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <rect x="4" y="5" width="16" height="12" rx="2" />
          <path d="M9 10h6M9 13h4" strokeLinecap="round" />
        </svg>
      </span>
      <span className={`text-xl font-extrabold ${inverted ? "text-white" : "text-ink"}`}>
        Nexora
      </span>
    </span>
  );
}
