import { STATUS_LABELS, type MaterialStatusValue } from "../lib/labels";

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
