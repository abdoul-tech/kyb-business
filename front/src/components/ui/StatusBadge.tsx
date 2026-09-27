type StatusBadgeProps = {
  children: string;
  tone?: "success" | "warning" | "danger" | "neutral";
};

export function StatusBadge({ children, tone = "neutral" }: StatusBadgeProps) {
  return <span className={`status-badge status-${tone}`}>{children}</span>;
}
