// Переиспользуемые визуальные примитивы: аватар, кольцо оценки, бейдж уровня,
// объяснимость по факторам, чип канала, хост тостов.

import { useEffect } from "react";
import type { PriorityFactor, PriorityLevel, PropensityFactor, ChannelType } from "../domain/types";
import { initials, CHANNEL_LABEL } from "../domain/format";
import { Icon, type IconName } from "./Icon";
import { factorFill, LEVEL_COLOR, LEVEL_LABEL, scoreColor } from "./visual";
import { useStore, type Toast } from "../store/store";

export function Avatar({ name, size = 40, ai = false }: { name: string; size?: number; ai?: boolean }) {
  return (
    <span
      className={ai ? "avatar avatar--ai" : "avatar"}
      style={{ width: size, height: size, fontSize: size * 0.36 }}
      aria-hidden="true"
    >
      {ai ? "AI" : initials(name)}
    </span>
  );
}

export function PriorityBadge({ level, withDot = true }: { level: PriorityLevel; withDot?: boolean }) {
  return (
    <span className={`badge badge--${level}`}>
      {withDot && (
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: LEVEL_COLOR[level],
            display: "inline-block",
          }}
        />
      )}
      {LEVEL_LABEL[level]}
    </span>
  );
}

const CHANNEL_ICON: Record<ChannelType, IconName> = {
  chat: "chat",
  call: "phone",
  meeting: "calendar",
};

export function ChannelChip({ channel }: { channel: ChannelType }) {
  return (
    <span className="chip">
      <Icon name={CHANNEL_ICON[channel]} size={13} />
      {CHANNEL_LABEL[channel]}
    </span>
  );
}

/** Кольцо итоговой оценки приоритета/склонности (0–100). */
export function ScoreRing({
  value,
  size = 64,
  stroke = 6,
  label,
}: {
  value: number;
  size?: number;
  stroke?: number;
  label?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value)) / 100;
  const color = scoreColor(value);
  return (
    <span className="score-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-sunken)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          style={{ transition: "stroke-dashoffset 0.5s var(--ease)" }}
        />
      </svg>
      <span className="score-ring__num" style={{ fontSize: size * 0.3, color: "var(--text-primary)" }}>
        {Math.round(value)}
      </span>
      {label && <span className="score-ring__label">{label}</span>}
    </span>
  );
}

/** Разбор оценки по факторам (объяснимость, NFR2). */
export function FactorList({
  factors,
  showReasons = false,
}: {
  factors: (PriorityFactor | PropensityFactor)[];
  showReasons?: boolean;
}) {
  return (
    <div className="factor-list">
      {factors.map((f) => (
        <div className="factor-item" key={f.key}>
          <div className="factor-row">
            <span className="factor-row__label">
              {f.label}
              <span className="factor-row__weight">×{f.weight}</span>
            </span>
            <span className="factor-row__track">
              <span
                className="factor-row__fill"
                style={{ width: `${f.score}%`, background: factorFill(f.score) }}
              />
            </span>
            <span className="factor-row__val">{f.score}</span>
          </div>
          {showReasons && <p className="factor-item__reason">{f.reason}</p>}
        </div>
      ))}
    </div>
  );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }) {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(toast.id), 2800);
    return () => clearTimeout(timer);
  }, [toast.id, onDismiss]);
  return (
    <button
      className={toast.tone === "info" ? "toast toast--info" : "toast"}
      onClick={() => onDismiss(toast.id)}
    >
      <Icon name={toast.tone === "info" ? "bulb" : "checkCircle"} size={17} />
      {toast.text}
    </button>
  );
}

export function ToastHost() {
  const { state, dismissToast } = useStore();
  if (state.toasts.length === 0) return null;
  return (
    <div className="toast-host">
      {state.toasts.slice(-3).map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={dismissToast} />
      ))}
    </div>
  );
}
