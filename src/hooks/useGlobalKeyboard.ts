// Глобальная клавиатурная навигация по очереди кейсов (производительность
// менеджера, KPI1): J / K — переход к следующему / предыдущему кейсу,
// Esc — закрыть оверлей ассистента. Клавиши-буквы игнорируются при наборе
// текста и при зажатых модификаторах, чтобы не мешать вводу.

import { useEffect, useRef } from "react";

export interface KeyboardBindings {
  onNext: () => void;
  onPrev: () => void;
  onEscape: () => void;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

export function useGlobalKeyboard(bindings: KeyboardBindings): void {
  // Держим ссылку на актуальные колбэки, чтобы слушатель подписывался один раз,
  // но всегда работал с состоянием последнего рендера (без устаревших замыканий).
  const ref = useRef(bindings);
  ref.current = bindings;

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      // Esc срабатывает всегда, включая фокус в поле ввода, — закрыть оверлей.
      if (e.key === "Escape") {
        ref.current.onEscape();
        return;
      }
      // Навигацию буквами не перехватываем при наборе текста и с модификаторами.
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;
      const key = e.key.toLowerCase();
      if (key === "j") {
        e.preventDefault();
        ref.current.onNext();
      } else if (key === "k") {
        e.preventDefault();
        ref.current.onPrev();
      }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
}
