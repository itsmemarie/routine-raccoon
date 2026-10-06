import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "tint" | "tertiary" | "dark" | "destructive";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-primary text-white shadow-primary active:bg-primary-dark",
  tint: "bg-tint text-primary-dark",
  tertiary: "bg-canvas text-ink",
  dark: "bg-ink text-white",
  destructive: "bg-destructive-bg text-destructive",
};

/** Design-system button: 44dp minimum hit target, Manrope 700 (handoff "Typography"). */
export function Button({
  variant = "primary",
  className = "",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type={type}
      className={`flex min-h-11 items-center justify-center gap-2 rounded-chip px-4 text-[14px] font-bold transition-transform active:scale-[0.98] disabled:opacity-50 ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  );
}
