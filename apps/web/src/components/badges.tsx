import {
  PROGRESS_LABELS,
  STATUS_LABELS,
  type MaterialStatusValue,
  type StudentProgressState,
} from "../lib/labels";

export function StatusBadge({ status }: { status: MaterialStatusValue }) {
  return <span className={`badge badge-${status}`}>{STATUS_LABELS[status]}</span>;
}

/** Whether the teacher has confirmed a question's answer key. */
export function VerificationBadge({ confirmed }: { confirmed: boolean }) {
  return confirmed ? (
    <span className="badge badge-confirmed">Confirmat</span>
  ) : (
    <span className="badge badge-unconfirmed">Neconfirmat</span>
  );
}

export function ProgressBadge({ state }: { state: StudentProgressState }) {
  return <span className={`badge badge-progress-${state}`}>{PROGRESS_LABELS[state]}</span>;
}
