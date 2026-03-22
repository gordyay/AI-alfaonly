interface StatusMessageProps {
  type?: "loading" | "success" | "error" | "idle";
  message?: string | null;
  compact?: boolean;
}

export function StatusMessage({ type = "idle", message, compact = false }: StatusMessageProps) {
  if (!message) {
    return null;
  }

  return <p className={`status-message status-message--${type}${compact ? " status-message--compact" : ""}`}>{message}</p>;
}
