import Link from "next/link";
import type { ReactNode } from "react";

type ButtonProps = {
  children: ReactNode;
  href?: string;
  variant?: "primary" | "secondary" | "quiet";
  type?: "button" | "submit";
  disabled?: boolean;
  onClick?: () => void;
};

export function Button({ children, href, variant = "primary", type = "button", disabled, onClick }: ButtonProps) {
  const className = `button button-${variant}`;
  if (href && !disabled) return <Link className={className} href={href}>{children}</Link>;
  return <button className={className} type={type} disabled={disabled} onClick={onClick}>{children}</button>;
}
