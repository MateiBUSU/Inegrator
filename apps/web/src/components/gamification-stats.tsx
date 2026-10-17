import type { GamificationStats as GamificationStatsData } from "@app/shared";

interface Stat {
  label: string;
  value: string;
  note?: string;
}

/** The student's own stats, exactly as the API computed them (a zero is shown as 0). */
export function GamificationStats({ stats }: { stats: GamificationStatsData }) {
  const items: Stat[] = [
    {
      label: "Serie curentă",
      value: `${stats.currentStreakDays} ${stats.currentStreakDays === 1 ? "zi" : "zile"}`,
    },
    {
      label: "Activitate săptămâna aceasta",
      value: `${stats.weeklyActivityCount} din ${stats.weeklyGoal}`,
    },
    { label: "Punctele mele", value: String(stats.pointsTotal) },
    {
      label: "Nivelul meu",
      value: stats.level,
      note:
        stats.nextLevelAt === null
          ? "Ai atins nivelul maxim."
          : `Următorul nivel la ${stats.nextLevelAt} puncte`,
    },
  ];
  return (
    <div className="stat-grid">
      {items.map((item) => (
        <section key={item.label} className="card" aria-label={item.label}>
          <p className="stat-label">{item.label}</p>
          <p className="stat-value">{item.value}</p>
          {item.note ? <p className="muted text-sm">{item.note}</p> : null}
        </section>
      ))}
    </div>
  );
}
