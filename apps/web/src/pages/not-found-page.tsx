import { Link } from "react-router";

export function NotFoundPage() {
  return (
    <section className="card narrow">
      <h1>Pagina nu a fost găsită</h1>
      <p>
        <Link to="/">Înapoi la prima pagină</Link>
      </p>
    </section>
  );
}
