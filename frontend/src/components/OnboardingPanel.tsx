interface OnboardingPanelProps {
  collapsed: boolean;
  onDismiss: () => void;
  onExpand: () => void;
  onStartTour: () => void;
}

export function OnboardingPanel({ collapsed, onDismiss, onExpand, onStartTour }: OnboardingPanelProps) {
  if (collapsed) {
    return (
      <section className="panel onboarding-panel onboarding-panel--collapsed">
        <div>
          <p className="panel__eyebrow">Экскурсия по экрану</p>
          <h2>Нужна подсказка по интерфейсу?</h2>
        </div>
        <div className="button-row">
          <button className="primary-button" type="button" onClick={onStartTour}>
            Запустить экскурсию
          </button>
          <button className="ghost-button" type="button" onClick={onExpand}>
            Показать краткую справку
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="panel onboarding-panel">
      <div className="panel__header">
        <div>
          <p className="panel__eyebrow">Экскурсия по экрану</p>
          <h2>Если вы здесь впервые, начните с короткого тура</h2>
        </div>
        <div className="button-row">
          <button className="primary-button" type="button" onClick={onStartTour}>
            Показать шаги на экране
          </button>
          <button className="ghost-button" type="button" onClick={onDismiss}>
            Скрыть блок
          </button>
        </div>
      </div>

      <div className="onboarding-panel__intro">
        <strong>Что даст эта подсказка</strong>
        <p>
          Экскурсия по шагам покажет, где находится план дня, где принимать решение по кейсу, где сохранять
          результат и как использовать помощника справа.
        </p>
      </div>

      <div className="onboarding-panel__grid">
        <article className="onboarding-card">
          <span className="onboarding-card__index">01</span>
          <strong>План на день</strong>
          <p>Сначала выберите кейс слева. Это вход в основной сценарий.</p>
        </article>
        <article className="onboarding-card">
          <span className="onboarding-card__index">02</span>
          <strong>Рабочая область</strong>
          <p>В центре можно прочитать историю контакта, принять решение и подготовить запись в CRM.</p>
        </article>
        <article className="onboarding-card">
          <span className="onboarding-card__index">03</span>
          <strong>Помощник</strong>
          <p>Справа находятся быстрые действия: сводка, текст сообщения, разбор возражения и другие подсказки.</p>
        </article>
      </div>
    </section>
  );
}
