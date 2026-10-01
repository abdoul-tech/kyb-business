import type { MergeAlert } from "@kyb/shared";

export function AlertList({ alerts }: { alerts: MergeAlert[] }) {
  if (alerts.length === 0) {
    return <p className="muted-copy">Aucun point d’attention pour l’instant.</p>;
  }
  return (
    <>
      {alerts.map((alert, index) => (
        <div className={`alert-item alert-${alert.severity}`} key={`${alert.code}-${index}`}>
          <span className="alert-icon">i</span>
          <div>
            <strong>{alert.code === "field_conflict" ? "Valeurs différentes" : "Doublon possible"}</strong>
            <p>{alert.message_fr}</p>
          </div>
        </div>
      ))}
    </>
  );
}
