import { Link, useLocation, useNavigate, useParams } from "react-router";
import { PracticeScreen } from "../components/practice-screen";

interface PracticeLocationState {
  objectiveText?: string;
  from?: string;
}

/** /student/objectives/:id/practice: reached from the objective list of a class material. */
export function StudentPracticePage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const state = (useLocation().state ?? {}) as PracticeLocationState;
  const back = state.from ?? "/student/classes";
  return (
    <section>
      <p>
        <Link to={back}>← Înapoi la material</Link>
      </p>
      <PracticeScreen
        key={id}
        objectiveId={id}
        objectiveText={state.objectiveText}
        onClose={() => navigate(back)}
      />
    </section>
  );
}
