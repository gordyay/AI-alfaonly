interface JourneyStep {
  id: string;
  title: string;
  description: string;
  done: boolean;
  active: boolean;
}

interface JourneyBarProps {
  steps: JourneyStep[];
  note?: string;
}

export function JourneyBar({ steps, note }: JourneyBarProps) {
  return (
    <section className="panel journey-bar">
      <div className="panel__header">
        <div>
          <p className="panel__eyebrow">Рабочий цикл</p>
          <h2>Что уже сделано по кейсу</h2>
          {note ? <p className="journey-bar__note">{note}</p> : null}
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
