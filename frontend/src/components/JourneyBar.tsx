interface JourneyStep {
  id: string;
  title: string;
  description: string;
  done: boolean;
  active: boolean;
}

interface JourneyBarProps {
  steps: JourneyStep[];
}

export function JourneyBar({ steps }: JourneyBarProps) {
  return (
    <section className="panel journey-bar">
      <div className="panel__header">
        <div>
          <p className="panel__eyebrow">Основной путь</p>
          <h2>От выбора кейса до зафиксированного результата</h2>
        </div>
      </div>

      <div className="journey-bar__grid">
        {steps.map((step, index) => (
          <article
            className={`journey-step${step.done ? " is-done" : ""}${step.active ? " is-active" : ""}`}
            key={step.id}
          >
            <span className="journey-step__index">0{index + 1}</span>
            <strong>{step.title}</strong>
            <p>{step.description}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
