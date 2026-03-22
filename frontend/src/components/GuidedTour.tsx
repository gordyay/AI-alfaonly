import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

export interface GuidedTourStep {
  id: string;
  selector: string;
  title: string;
  description: string;
  note: string;
  spotlightSelector?: string;
  spotlightPadding?: number;
  prepare?: () => void;
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

  const element = document.querySelector(step.spotlightSelector ?? step.selector);
  if (!(element instanceof HTMLElement)) {
    return null;
  }

  return element.getBoundingClientRect();
}

export function GuidedTour({ open, steps, onClose, onComplete }: GuidedTourProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [cardHeight, setCardHeight] = useState(272);
  const cardRef = useRef<HTMLElement | null>(null);

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

    let cancelled = false;
    let frameId: number | null = null;

    const updateRect = () => {
      if (cancelled) {
        return true;
      }

      const element = document.querySelector(activeStep.spotlightSelector ?? activeStep.selector);
      if (element instanceof HTMLElement) {
        element.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
        setTargetRect(element.getBoundingClientRect());
        return true;
      }

      setTargetRect(getStepRect(activeStep));
      return false;
    };

    const scheduleRectUpdate = (attempt = 0) => {
      if (cancelled) {
        return;
      }

      const foundTarget = updateRect();
      if (foundTarget || attempt >= 24) {
        return;
      }

      frameId = window.requestAnimationFrame(() => {
        scheduleRectUpdate(attempt + 1);
      });
    };

    activeStep.prepare?.();
    scheduleRectUpdate();

    const handleViewportChange = () => {
      scheduleRectUpdate();
    };
    const observer = new MutationObserver(() => {
      scheduleRectUpdate();
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);

    return () => {
      cancelled = true;
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
      observer.disconnect();
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [open, activeStep]);

  useLayoutEffect(() => {
    if (!open) {
      return;
    }

    const updateCardHeight = () => {
      const nextHeight = cardRef.current?.getBoundingClientRect().height;
      if (nextHeight) {
        setCardHeight(nextHeight);
      }
    };

    updateCardHeight();
    window.addEventListener("resize", updateCardHeight);

    return () => {
      window.removeEventListener("resize", updateCardHeight);
    };
  }, [open, activeIndex]);

  const spotlightRect = useMemo(() => {
    if (!targetRect) {
      return null;
    }

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const padding = activeStep?.spotlightPadding ?? 12;
    const margin = 8;
    const top = Math.max(margin, targetRect.top - padding);
    const left = Math.max(margin, targetRect.left - padding);
    const right = Math.min(viewportWidth - margin, targetRect.right + padding);
    const bottom = Math.min(viewportHeight - margin, targetRect.bottom + padding);

    return {
      top,
      left,
      right,
      bottom,
      width: Math.max(0, right - left),
      height: Math.max(0, bottom - top),
    };
  }, [activeStep?.spotlightPadding, targetRect]);

  const cardStyle = useMemo(() => {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const width = Math.min(360, viewportWidth - 32);
    const gap = 20;
    const margin = 16;
    const height = cardHeight;

    if (!spotlightRect) {
      return {
        top: 24,
        left: 24,
        width,
      };
    }

    if (viewportWidth <= 1080) {
      return {
        top: viewportHeight - height - margin,
        left: margin,
        width,
      };
    }

    const clampTop = (value: number) =>
      Math.min(viewportHeight - height - margin, Math.max(margin, value));
    const clampLeft = (value: number) =>
      Math.min(viewportWidth - width - margin, Math.max(margin, value));

    const rightSpace = viewportWidth - spotlightRect.right - margin;
    const leftSpace = spotlightRect.left - margin;
    const bottomSpace = viewportHeight - spotlightRect.bottom - margin;
    const topSpace = spotlightRect.top - margin;

    if (rightSpace >= width + gap) {
      return {
        top: clampTop(spotlightRect.top),
        left: spotlightRect.right + gap,
        width,
      };
    }

    if (leftSpace >= width + gap) {
      return {
        top: clampTop(spotlightRect.top),
        left: spotlightRect.left - width - gap,
        width,
      };
    }

    if (bottomSpace >= height + gap) {
      return {
        top: spotlightRect.bottom + gap,
        left: clampLeft(spotlightRect.left),
        width,
      };
    }

    if (topSpace >= height + gap) {
      return {
        top: Math.max(margin, spotlightRect.top - height - gap),
        left: clampLeft(spotlightRect.left),
        width,
      };
    }

    return {
      top: margin,
      left: clampLeft(viewportWidth - width - margin),
      width,
    };
  }, [cardHeight, spotlightRect]);

  if (!open || !activeStep) {
    return null;
  }

  return (
    <div className="tour-overlay" role="dialog" aria-modal="true" aria-label="Экскурсия по экрану">
      {spotlightRect ? (
        <>
          <div className="tour-overlay__scrim" style={{ inset: "0 0 auto 0", height: spotlightRect.top }} />
          <div
            className="tour-overlay__scrim"
            style={{
              top: spotlightRect.top,
              left: 0,
              width: spotlightRect.left,
              height: spotlightRect.height,
            }}
          />
          <div
            className="tour-overlay__scrim"
            style={{
              top: spotlightRect.top,
              left: spotlightRect.right,
              right: 0,
              height: spotlightRect.height,
            }}
          />
          <div className="tour-overlay__scrim" style={{ inset: `${spotlightRect.bottom}px 0 0 0` }} />
          <div
            className="tour-overlay__spotlight"
            style={{
              top: spotlightRect.top,
              left: spotlightRect.left,
              width: spotlightRect.width,
              height: spotlightRect.height,
            }}
          />
        </>
      ) : (
        <div className="tour-overlay__scrim" style={{ inset: 0 }} />
      )}

      <aside className="tour-card" ref={cardRef} style={cardStyle}>
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
