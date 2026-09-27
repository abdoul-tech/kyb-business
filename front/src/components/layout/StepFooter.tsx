import { Button } from "@/components/ui/Button";

export function StepFooter({ backHref, nextHref, nextLabel = "Continuer", onNext }: { backHref?: string; nextHref: string; nextLabel?: string; onNext?: () => void }) {
  return (
    <div className="step-footer">
      {backHref ? <Button href={backHref} variant="quiet">Retour</Button> : <span />}
      {onNext ? <Button onClick={onNext}>{nextLabel} <span aria-hidden="true">→</span></Button> : <Button href={nextHref}>{nextLabel} <span aria-hidden="true">→</span></Button>}
    </div>
  );
}
