interface ErrorStateProps {
  message: string;
  /** When given, a "try again" button is shown. */
  onRetry?: () => void;
}

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div className="state state-error" role="alert">
      <p>{message}</p>
      {onRetry ? (
        <button type="button" onClick={onRetry}>
          Încearcă din nou
        </button>
      ) : null}
    </div>
  );
}
