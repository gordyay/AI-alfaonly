interface OnboardingPanelProps {
  collapsed: boolean;
  onDismiss: () => void;
  onExpand: () => void;
  onStartTour: () => void;
}

export function OnboardingPanel({ collapsed, onDismiss, onExpand, onStartTour }: OnboardingPanelProps) {
  if (collapsed) {
    return (
      <section className="panel onboarding-panel onboarding-panel--collapsed onboarding-panel--summary">
        <div className="onboarding-panel__summary-copy">
          <p className="panel__eyebrow">Быстрый старт</p>
          <h2>Откройте кейс слева, примите решение в центре, затем сохраните результат в CRM.</h2>
          <p>Тур запускается по запросу и не перекрывает основной рабочий экран.</p>
        </div>
        <div className="button-row">
          <button className="primary-button" type="button" onClick={onStartTour}>
            Запустить тур
          </button>
          <button className="ghost-button" type="button" onClick={onExpand}>
            Показать памятку
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="panel onboarding-panel">
      <div className="panel__header">
        <div>
          <p className="panel__eyebrow">Памятка по экрану</p>
          <h2>Как быстро пройти основной сценарий</h2>
        </div>
        <div className="button-row">
          <button className="primary-button" type="button" onClick={onStartTour}>
            Запустить тур
          </button>
          <button className="ghost-button" type="button" onClick={onDismiss}>
            Свернуть
          </button>
        </div>
      </div>

      <div className="onboarding-panel__intro">
        <strong>Что даст эта подсказка</strong>
        <p>
          Здесь только короткая памятка. Если нужен пошаговый разбор, запускайте тур вручную в удобный момент.
        </p>
      </div>

      <div className="onboarding-panel__grid">
        <article className="onboarding-card">
          <span className="onboarding-card__index">01</span>
          <strong>Очередь кейсов</strong>
          <p>Слева виден план дня. Откройте карточку, чтобы сразу перейти к работе.</p>
        </article>
        <article className="onboarding-card">
          <span className="onboarding-card__index">02</span>
          <strong>Решение по кейсу</strong>
          <p>В центре видны история контакта, объяснение приоритета и фиксация решения.</p>
        </article>
        <article className="onboarding-card">
          <span className="onboarding-card__index">03</span>
          <strong>Артефакты и CRM</strong>
          <p>Сценарий, разбор возражения и CRM-черновик можно готовить в удобном порядке.</p>
        </article>
        <article className="onboarding-card">
          <span className="onboarding-card__index">04</span>
          <strong>Помощник справа</strong>
          <p>Используйте помощника как боковую поддержку, когда нужен текст, сводка или следующий шаг.</p>
        </article>
      </div>
    </section>
  );
}
