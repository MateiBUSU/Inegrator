import { Link } from "react-router";

// Placeholder for routes whose backend stage is available but whose screens are not built yet.
export function ComingSoonPage({ title, backTo }: { title: string; backTo: string }) {
  return (
    <section className="card narrow">
      <h1>{title}</h1>
      <p>Această pagină va fi disponibilă în curând.</p>
      <p>
        <Link to={backTo}>Înapoi</Link>
      </p>
    </section>
  );
}
