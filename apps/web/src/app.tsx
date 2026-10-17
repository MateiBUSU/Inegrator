import { useEffect, useState } from "react";
import { healthResponseSchema } from "@app/shared";

type HealthState = { kind: "loading" } | { kind: "ok"; status: string } | { kind: "error" };

export function App() {
  const [health, setHealth] = useState<HealthState>({ kind: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/health", { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((body) => {
        const parsed = healthResponseSchema.parse(body);
        setHealth({ kind: "ok", status: parsed.status });
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setHealth({ kind: "error" });
      });
    return () => controller.abort();
  }, []);

  return (
    <main>
      <h1>Informatica IX–XII</h1>
      <p>
        Stare API:{" "}
        <strong data-testid="health-status">
          {health.kind === "loading" && "se încarcă..."}
          {health.kind === "ok" && health.status}
          {health.kind === "error" && "indisponibil"}
        </strong>
      </p>
    </main>
  );
}
