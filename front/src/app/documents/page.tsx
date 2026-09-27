"use client";

import { ChangeEvent, DragEvent, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { useOnboarding } from "@/context/OnboardingContext";
import { PageIntro } from "@/components/layout/PageIntro";
import { StepFooter } from "@/components/layout/StepFooter";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { UploadedDocument } from "@/types/onboarding";

const statusLabel = { ready: "Prêt", processing: "Traitement", review: "À vérifier", error: "Erreur" } as const;

export default function DocumentsPage() {
  const { documents, setDocuments } = useOnboarding();
  const [dragging, setDragging] = useState(false);
  const [uploadError, setUploadError] = useState("");

  function addFiles(files: FileList | File[]) {
    const accepted = Array.from(files).filter((file) => {
      const validType = ["application/pdf", "image/jpeg", "image/png"].includes(file.type);
      const validExtension = /\.(pdf|jpe?g|png)$/i.test(file.name);
      return validType && validExtension && file.size <= 20 * 1024 * 1024;
    });
    if (accepted.length !== files.length) setUploadError("Un ou plusieurs fichiers ont été refusés. Utilisez un PDF, JPG ou PNG de 20 MB maximum.");
    else setUploadError("");
    const additions: UploadedDocument[] = accepted.map((file, index) => ({
      id: `${file.name}-${index}`,
      name: file.name,
      kind: "À classer",
      size: `${(file.size / 1024 / 1024).toFixed(1)} MB`,
      status: "processing",
      progress: 24,
    }));
    setDocuments((current) => [...current, ...additions]);
  }

  function handleInput(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files) addFiles(event.target.files);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    if (event.dataTransfer.files.length) addFiles(event.dataTransfer.files);
  }

  return (
    <AppShell activeStep="documents">
      <PageIntro eyebrow="Étape 01 / 04" title="Vos documents, au même endroit." description="Déposez les documents de votre entreprise. Notre système les classe et prépare les informations à vérifier." aside={<div className="secure-note"><span className="secure-lock">⌁</span><span><strong>Données protégées</strong><br />Chiffrement de bout en bout</span></div>} />
      <section className="upload-layout">
        <div>
          <div className={`upload-zone ${dragging ? "upload-zone-active" : ""}`} onDragEnter={() => setDragging(true)} onDragOver={(event) => event.preventDefault()} onDragLeave={() => setDragging(false)} onDrop={handleDrop}>
            <input id="file-upload" type="file" multiple accept=".pdf,.jpg,.jpeg,.png" onChange={handleInput} />
            <div className="upload-symbol">+</div>
            <h2>Déposez vos fichiers ici</h2>
            <p>ou sélectionnez-les depuis votre ordinateur</p>
            <label className="button button-secondary" htmlFor="file-upload">Choisir des fichiers</label>
            <small>PDF, JPG ou PNG · 20 MB maximum par fichier</small>
          </div>
          {uploadError ? <p className="form-error upload-error">{uploadError}</p> : null}
          <div className="upload-help"><span className="help-number">i</span><p>Vous pouvez ajouter des documents à tout moment. Nous vous indiquerons ceux qui sont nécessaires pour compléter votre dossier.</p></div>
        </div>
        <aside className="document-summary">
          <div className="section-heading"><div><p className="eyebrow">Votre dossier</p><h2>Documents reçus</h2></div><span className="document-count">{documents.length}</span></div>
          <div className="document-list">
            {documents.map((document) => (
              <div className="document-row" key={document.id}>
                <div className="file-icon">{document.name.toLowerCase().endsWith(".pdf") ? "PDF" : "IMG"}</div>
                <div className="document-info"><strong>{document.name}</strong><span>{document.kind} · {document.size}</span>{document.status === "processing" ? <div className="mini-progress"><span style={{ width: `${document.progress}%` }} /></div> : null}</div>
                <StatusBadge tone={document.status === "ready" ? "success" : document.status === "review" ? "warning" : "neutral"}>{statusLabel[document.status]}</StatusBadge>
              </div>
            ))}
          </div>
          <Button variant="quiet" onClick={() => setDocuments([])}>Retirer tous les fichiers</Button>
        </aside>
      </section>
      <StepFooter nextHref="/verify" />
    </AppShell>
  );
}
