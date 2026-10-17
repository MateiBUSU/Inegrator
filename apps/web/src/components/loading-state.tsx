export function LoadingState({ message = "Se încarcă…" }: { message?: string }) {
  return (
    <p className="state state-loading" role="status">
      {message}
    </p>
  );
}
