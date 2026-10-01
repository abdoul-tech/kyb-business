"use client";

import type { DocumentTypeSlug, StoredDocument } from "@kyb/shared";
import { useState, type ChangeEvent, type DragEvent } from "react";
import { useDossier } from "@/components/layout/DossierShell";
import { PageIntro } from "@/components/layout/PageIntro";
import { StepFooter } from "@/components/layout/StepFooter";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { api, ApiRequestError } from "@/lib/api";
import {
  documentErrorMessage,
  documentStatusLabel,
  documentStatusProgress,
  documentStatusTone,
  documentTypeLabel,
  fileSize,
  selectableDocumentTypes,
} from "@/lib/labels";
import { stepHref } from "@/lib/navigation";
import { useConfirmDocumentType, useDeleteDocument, useRefreshApplication } from "@/lib/queries";

const ACCEPTED = ["application/pdf", "image/jpeg", "image/png"];
const MAX_BYTES = 15 * 1024 * 1024;

type Upload = { key: string; name: string; size: number; progress: number; error?: string };

function DocumentTypeChooser({
  document,
  onConfirm,
  busy,
}: {
  document: StoredDocument;
  onConfirm: (type: Exclude<DocumentTypeSlug, "unknown">) => void;
  busy: boolean;
}) {
  const [type, setType] = useState<string>(document.type && document.type !== "unknown" ? document.type : "");
  return (
    <div className="type-chooser">
      <select aria-label={`Type de ${document.original_filename}`} value={type} onChange={(e) => setType(e.target.value)}>
        <option value="">Quel est ce document ?</option>
        {selectableDocumentTypes.map((slug) => (
          <option key={slug} value={slug}>
            {documentTypeLabel(slug)}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="button button-secondary"
        disabled={!type || busy}
        onClick={() => onConfirm(type as Exclude<DocumentTypeSlug, "unknown">)}
      >
        Confirmer
      </button>
    </div>
  );
}

function DocumentRow({ applicationId, document }: { applicationId: string; document: StoredDocument }) {
  const confirmType = useConfirmDocumentType(applicationId);
  const remove = useDeleteDocument(applicationId);
  const [changingType, setChangingType] = useState(false);
  const progress = documentStatusProgress[document.status];
  const askType = document.status === "needs_type_confirmation" || document.status === "failed" || changingType;
  const error = confirmType.error ?? remove.error;

  return (
    <div className="document-row document-row-stacked">
      <div className="document-row-main">
        <div className="file-icon">{document.mime_type === "application/pdf" ? "PDF" : "IMG"}</div>
        <div className="document-info">
          <strong>{document.original_filename}</strong>
          <span>
            {documentTypeLabel(document.type)} · {fileSize(document.size_bytes)}
            {document.page_count ? ` · ${document.page_count} p.` : ""}
          </span>
          {progress !== undefined ? (
            <div className="mini-progress" aria-label="Analyse en cours">
              <span style={{ width: `${progress}%` }} />
            </div>
          ) : null}
        </div>
        <StatusBadge tone={documentStatusTone[document.status]}>{documentStatusLabel[document.status]}</StatusBadge>
        <button
          type="button"
          className="icon-button"
          aria-label={`Retirer ${document.original_filename}`}
          disabled={remove.isPending}
          onClick={() => remove.mutate(document.id)}
        >
          ×
        </button>
      </div>
      {document.status === "failed" ? <p className="document-note">{documentErrorMessage(document.error_code)}</p> : null}
      {document.status === "needs_type_confirmation" ? (
        <p className="document-note">Nous n’avons pas reconnu ce document avec certitude : indiquez son type.</p>
      ) : null}
      {askType ? (
        <DocumentTypeChooser
          document={document}
          busy={confirmType.isPending}
          onConfirm={(type) =>
            confirmType.mutate({ docId: document.id, type }, { onSuccess: () => setChangingType(false) })
          }
        />
      ) : document.status === "extracted" ? (
        <button type="button" className="link-button" onClick={() => setChangingType(true)}>
          Ce n’est pas le bon type ?
        </button>
      ) : null}
      {error ? <p className="form-error">{error.message}</p> : null}
    </div>
  );
}

export default function DocumentsPage() {
  const { id, view } = useDossier();
  const refresh = useRefreshApplication(id);
  const [dragging, setDragging] = useState(false);
  const [uploads, setUploads] = useState<Upload[]>([]);

  function update(key: string, patch: Partial<Upload>) {
    setUploads((current) => current.map((upload) => (upload.key === key ? { ...upload, ...patch } : upload)));
  }

  function addFiles(files: File[]) {
    const batch = files.map((file) => ({
      file,
      upload: { key: `${file.name}-${file.size}-${Date.now()}-${Math.random()}`, name: file.name, size: file.size, progress: 0 },
    }));
    setUploads((current) => [...current, ...batch.map((b) => b.upload)]);

    for (const { file, upload } of batch) {
      // Contrôle rapide côté navigateur ; l'API revérifie le type réel et le nombre de pages.
      if (!ACCEPTED.includes(file.type)) {
        update(upload.key, { error: "Format refusé : PDF, JPG ou PNG uniquement." });
        continue;
      }
      if (file.size > MAX_BYTES) {
        update(upload.key, { error: "Fichier trop lourd : 15 Mo maximum." });
        continue;
      }
      api
        .uploadDocument(id, file, (ratio) => update(upload.key, { progress: Math.round(ratio * 100) }))
        .then(() => {
          setUploads((current) => current.filter((u) => u.key !== upload.key));
          void refresh();
        })
        .catch((error: unknown) =>
          update(upload.key, {
            error: error instanceof ApiRequestError ? error.message : "Envoi impossible. Réessayez.",
          }),
        );
    }
  }

  function handleInput(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files) {
      addFiles(Array.from(event.target.files));
    }
    event.target.value = "";
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    if (event.dataTransfer.files.length) {
      addFiles(Array.from(event.dataTransfer.files));
    }
  }

  const count = view.documents.length;

  return (
    <>
      <PageIntro
        eyebrow="Étape 01 / 04"
        title="Vos documents, au même endroit."
        description="Déposez les documents de votre entreprise. Nous les identifions et en lisons les informations pour vous."
        aside={
          <div className="secure-note">
            <span className="secure-lock">⌁</span>
            <span>
              <strong>Données protégées</strong>
              <br />
              Fichiers chiffrés au repos
            </span>
          </div>
        }
      />
      <section className="upload-layout">
        <div>
          <div
            className={`upload-zone ${dragging ? "upload-zone-active" : ""}`}
            onDragEnter={() => setDragging(true)}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
          >
            <input id="file-upload" type="file" multiple accept=".pdf,.jpg,.jpeg,.png" onChange={handleInput} />
            <div className="upload-symbol">+</div>
            <h2>Déposez vos fichiers ici</h2>
            <p>ou sélectionnez-les depuis votre ordinateur</p>
            <label className="button button-secondary" htmlFor="file-upload">
              Choisir des fichiers
            </label>
            <small>PDF, JPG ou PNG · 15 Mo et 30 pages maximum par fichier</small>
          </div>
          <div className="upload-help">
            <span className="help-number">i</span>
            <p>
              Un même scan peut contenir plusieurs pièces. Vous pouvez ajouter des documents à tout moment ; l’analyse
              prend de 10 à 40 secondes par document.
            </p>
          </div>
        </div>
        <aside className="document-summary">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Votre dossier</p>
              <h2>Documents reçus</h2>
            </div>
            <span className="document-count">{count}</span>
          </div>
          <div className="document-list">
            {uploads.map((upload) => (
              <div className="document-row document-row-stacked" key={upload.key}>
                <div className="document-row-main">
                  <div className="file-icon">…</div>
                  <div className="document-info">
                    <strong>{upload.name}</strong>
                    <span>{upload.error ? "Non envoyé" : `Envoi · ${fileSize(upload.size)}`}</span>
                    {!upload.error ? (
                      <div className="mini-progress">
                        <span style={{ width: `${upload.progress}%` }} />
                      </div>
                    ) : null}
                  </div>
                  <StatusBadge tone={upload.error ? "danger" : "neutral"}>
                    {upload.error ? "Refusé" : `${upload.progress} %`}
                  </StatusBadge>
                  {upload.error ? (
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Masquer ${upload.name}`}
                      onClick={() => setUploads((current) => current.filter((u) => u.key !== upload.key))}
                    >
                      ×
                    </button>
                  ) : null}
                </div>
                {upload.error ? <p className="form-error">{upload.error}</p> : null}
              </div>
            ))}
            {view.documents.map((document) => (
              <DocumentRow applicationId={id} document={document} key={document.id} />
            ))}
            {count === 0 && uploads.length === 0 ? <p className="muted-copy empty-list">Aucun document pour l’instant.</p> : null}
          </div>
        </aside>
      </section>
      <StepFooter nextHref={stepHref(id, "verifier")} />
    </>
  );
}
