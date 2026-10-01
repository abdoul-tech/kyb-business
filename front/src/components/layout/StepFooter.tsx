import { Button } from "@/components/ui/Button";

export function StepFooter({
  backHref,
  nextHref,
  nextLabel = "Continuer",
  onNext,
}: {
  backHref?: string;
  // Sans nextHref ni onNext (dernière étape), seul le bouton Retour est affiché.
  nextHref?: string;
  nextLabel?: string;
  onNext?: () => void;
}) {
  const label = (
    <>
      {nextLabel} <span aria-hidden="true">→</span>
    </>
  );
  return (
    <div className="step-footer">
      {backHref ? (
        <Button href={backHref} variant="quiet">
          Retour
        </Button>
      ) : (
        <span />
      )}
      {onNext ? <Button onClick={onNext}>{label}</Button> : nextHref ? <Button href={nextHref}>{label}</Button> : null}
    </div>
  );
}
