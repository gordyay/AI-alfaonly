interface JourneyStep {
  id: string;
  title: string;
  description: string;
  done: boolean;
  active: boolean;
}

interface CaseProgressStripProps {
  steps: JourneyStep[];
}

export function CaseProgressStrip({ steps }: CaseProgressStripProps) {
  return (
    <section className="case-progress-strip">
      {steps.map((step) => (
        <article
          className={`case-progress-step${step.done ? " is-done" : ""}${step.active ? " is-active" : ""}`}
          key={step.id}
        >
          <span>{step.title}</span>
          <small>{step.description}</small>
        </article>
      ))}
    </section>
  );
}
