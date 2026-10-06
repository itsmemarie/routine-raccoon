import { Chip } from "@/components/ui/chip";
import { FILTER_LABELS, type TodayFilter } from "@/domain/today";

const ORDER = ["all", "hard", "under5", "under15"] as const;

/** All · Hard · Under 5m · Under 15m (PRD R9). Extra Support is toggled from the plan card. */
export function FilterChips({
  value,
  onChange,
}: {
  value: TodayFilter;
  onChange: (filter: TodayFilter) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Filter tasks"
      className="mt-3.5 flex [scrollbar-width:none] gap-[7px] overflow-x-auto"
    >
      {ORDER.map((filter) => (
        <Chip key={filter} active={value === filter} onClick={() => onChange(filter)}>
          {FILTER_LABELS[filter]}
        </Chip>
      ))}
    </div>
  );
}
