/**
 * Switch (handoff: 44×26 track, primary when on, `#E6DFE1` off). Rendered as role="switch" so
 * screen readers announce on/off. Put it in a SwitchRow, or pass `aria-label`.
 */
export function Switch({
  id,
  checked,
  onChange,
  disabled = false,
  "aria-label": ariaLabel,
  "aria-labelledby": labelledBy,
  "aria-describedby": describedBy,
}: {
  id?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="-m-2 flex shrink-0 items-center justify-center p-2 disabled:opacity-50"
    >
      <span
        aria-hidden
        className={`relative block h-[26px] w-11 rounded-[14px] transition-colors ${checked ? "bg-primary" : "bg-toggle-off"}`}
      >
        <span
          className={`absolute top-[3px] block size-5 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.18)] transition-[left] ${checked ? "left-[21px]" : "left-[3px]"}`}
        />
      </span>
    </button>
  );
}

/**
 * A settings row: title, optional description and a switch. Tapping the text toggles too
 * (the label is bound to the switch button).
 */
export function SwitchRow({
  id,
  title,
  description,
  checked,
  onChange,
  disabled,
  className = "",
}: {
  id: string;
  title: string;
  description?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-3 px-[15px] py-3.5 ${className}`}>
      <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer">
        <span id={`${id}-label`} className="block text-[14px] font-semibold text-ink">
          {title}
        </span>
        {description ? (
          <span
            id={`${id}-description`}
            className="mt-0.5 block text-[11.5px] font-medium text-text-muted"
          >
            {description}
          </span>
        ) : null}
      </label>
      <Switch
        id={id}
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        aria-labelledby={`${id}-label`}
        aria-describedby={description ? `${id}-description` : undefined}
      />
    </div>
  );
}
