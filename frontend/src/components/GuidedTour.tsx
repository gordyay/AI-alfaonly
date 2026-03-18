import { useEffect, useMemo, useState } from "react";

export interface GuidedTourStep {
  id: string;
  selector: string;
  title: string;
  description: string;
  note: string;
}

interface GuidedTourProps {
  open: boolean;
  steps: GuidedTourStep[];
  onClose: () => void;
  onComplete: () => void;
}

function getStepRect(step?: GuidedTourStep): DOMRect | null {
  if (!step) {
    return null;
  }

  const element = document.querySelector(step.selector);
  if (!(element instanceof HTMLElement)) {
    return null;
  }

  return element.getBoundingClientRect();
}

export function GuidedTour({ open, steps, onClose, onComplete }: GuidedTourProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);

  const activeStep = steps[activeIndex];

  useEffect(() => {
    if (!open) {
      return;
    }

    setActiveIndex(0);
  }, [open]);

  useEffect(() => {
    if (!open || !activeStep) {
      return;
    }

    const element = document.querySelector(activeStep.selector);
    if (element instanceof HTMLElement) {
      element.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
    }

    const updateRect = () => {
      setTargetRect(getStepRect(activeStep));
    };

    updateRect();
    window.addEventListener("resize", updateRect);
    window.addEventListener("scroll", updateRect, true);

    return () => {
      window.removeEventListener("resize", updateRect);
      window.removeEventListener("scroll", updateRect, true);
    };
  }, [open, activeStep]);

  const cardStyle = useMemo(() => {
    if (!targetRect) {
      return {
        top: 24,
        left: 24,
        width: Math.min(380, window.innerWidth - 32),
      };
    }

    const width = Math.min(380, window.innerWidth - 32);
    const preferredTop = targetRect.bottom + 20;
    const fallbackTop = Math.max(16, targetRect.top - 220);
    const top = preferredTop + 220 > window.innerHeight ? fallbackTop : preferredTop;
    const left = Math.min(window.innerWidth - width - 16, Math.max(16, targetRect.left));

    return {
      top,
      left,
      width,
    };
  }, [targetRect]);

  if (!open || !activeStep) {
    return null;
  }

  return (
    <div className="tour-overlay" role="dialog" aria-modal="true" aria-label="Экскурсия по экрану">
      {targetRect ? (
        <div
          className="tour-overlay__spotlight"
          style={{
            top: Math.max(8, targetRect.top - 8),
            left: Math.max(8, targetRect.left - 8),
            width: Math.min(window.innerWidth - 16, targetRect.width + 16),
            height: Math.min(window.innerHeight - 16, targetRect.height + 16),
          }}
        />
      ) : null}

      <aside className="tour-card" style={cardStyle}>
        <p className="panel__eyebrow">Шаг {activeIndex + 1} из {steps.length}</p>
        <h2>{activeStep.title}</h2>
        <p>{activeStep.description}</p>
        <div className="tour-card__note">
          <strong>Что здесь делать</strong>
          <p>{activeStep.note}</p>
        </div>

        <div className="tour-card__actions">
          <button
            className="ghost-button"
            type="button"
            onClick={() => setActiveIndex((current) => Math.max(0, current - 1))}
            disabled={activeIndex === 0}
          >
            Назад
          </button>

          <div className="tour-card__actions-right">
            <button className="ghost-button" type="button" onClick={onClose}>
              Пропустить
            </button>
            <button
              className="primary-button"
              type="button"
              onClick={() => {
                if (activeIndex === steps.length - 1) {
                  onComplete();
                  return;
                }
                setActiveIndex((current) => current + 1);
              }}
            >
              {activeIndex === steps.length - 1 ? "Завершить" : "Далее"}
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}
