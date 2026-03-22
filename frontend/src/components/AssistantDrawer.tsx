import type { ReactNode } from "react";

interface AssistantDrawerProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}

export function AssistantDrawer({ open, onClose, children }: AssistantDrawerProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="assistant-drawer-backdrop" onClick={onClose}>
      <div
        aria-label="Помощник по кейсу"
        aria-modal="true"
        className="assistant-drawer-shell"
        data-tour="assistant"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="assistant-drawer__chrome">
          <strong>Помощник</strong>
          <button className="ghost-button" type="button" onClick={onClose}>
            Закрыть
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
