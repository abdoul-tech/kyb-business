# KYB Business

Projet de self-onboarding KYB : le client charge ses documents, les données sont extraites et vérifiées, puis un dossier prêt pour Bridge est préparé. Le périmètre fonctionnel et les règles métier de référence sont décrits dans [spec.md](spec.md).

## État actuel

> **Le J2 est terminé côté code.** Upload, stockage chiffré, file asynchrone, classification et extraction LLM (RCCM, statuts, pièce d'identité) fonctionnent de bout en bout, et `npm run eval` mesure la qualité. **Le premier score (100 %) porte uniquement sur 3 documents fictifs** générés proprement : il valide l'outil, pas la qualité réelle. **Il manque des documents réels anonymisés** (idéalement les 4 dossiers du Guide) avec leurs valeurs attendues pour mesurer le critère « 80 % des champs » de la spec.

### Fondation (J1)

- `front/` contient l’application Next.js avec App Router, React et TypeScript.
- `back/` contient l’API Express en TypeScript strict.
- `packages/shared/` est le package npm partagé `@kyb/shared`, configuré avec Zod et Vitest.
- Les schémas d’extraction couvrent les 11 types du registre de documents : `rccm`, `statuts`, `id_document`, `rccm_modificatif`, `tax_certificate`, `ownership_document`, `good_standing`, `proof_of_address`, `business_activity`, `license` et `logistics_document`.
- Les champs extraits portent leur valeur, leur confiance et leur page source. Les types TypeScript sont dérivés des schémas Zod.
- Le front transpile `@kyb/shared`; les deux applications construisent le package partagé avant leur démarrage en développement et leur build.
- Les tests du package partagé et les builds du package, du back et du front ont été vérifiés localement.

### API : dossiers, upload et stockage chiffré (J2)

- **Configuration** validée par Zod au démarrage (`back/src/config/env.ts`), lue depuis `back/.env`. En cas d'erreur, seul le nom de la variable est affiché, jamais sa valeur.
- **MongoDB** (driver natif) : collections `applications` et `documents`.
- **Jeton de dossier** : 32 octets aléatoires, stocké haché en SHA-256, envoyé en `Authorization: Bearer`.
- **Routes** : `POST /v1/applications`, `GET /v1/applications/:id`, `POST /v1/applications/:id/documents` (multipart, 1 à 10 fichiers, réponse `202`), `GET` et `DELETE /v1/applications/:id/documents/:docId`. Erreurs au format unique de la spec (`415 UNSUPPORTED_FILE_TYPE`, `413 FILE_TOO_LARGE`, `413 TOO_MANY_PAGES`, `401`, `404`…).
- **Contrôle des fichiers** : type détecté sur les octets (`file-type`) et non sur l'extension, PDF / JPG / PNG uniquement, 15 Mo et 30 pages maximum (pages comptées avec `pdfjs-dist`), PDF corrompu ou protégé refusé avec un message clair. Un envoi est accepté ou refusé en bloc : aucun fichier n'est stocké si l'un d'eux est invalide.
- **Doublons** : hash SHA-256 unique par dossier (index Mongo). Un fichier déjà chargé renvoie le document existant, y compris en cas d'envois simultanés.
- **Stockage chiffré** : chiffrement applicatif AES-256-GCM (`FILE_ENCRYPTION_KEY`) puis envoi sur MinIO sous la clé `applications/{application_id}/{document_id}`. Les fichiers ne sont jamais écrits en clair sur disque. La suppression d'un document supprime aussi l'objet MinIO.

### Traitement asynchrone des documents (J2)

- **File en mémoire** (`p-queue`, 3 traitements en parallèle) : l'upload répond immédiatement, le traitement se fait en arrière-plan et le client suit l'avancement par polling du dossier.
- **Statuts** : `uploaded` → `classifying` → `extracting` → `extracted`, ou `needs_type_confirmation` (confiance < 0,7 ou type inconnu), ou `failed` avec un `error_code`. Chaque transition est conditionnelle : un document supprimé ou modifié pendant son traitement n'est jamais écrasé.
- **Un même document n'est jamais traité deux fois en parallèle** ; s'il est remis en file pendant son traitement, il est relancé juste après.
- **Reprise au démarrage** : les documents restés en `uploaded`, `classifying` ou `extracting` sont relancés, en reprenant à l'étape où ils s'étaient arrêtés.
- **Logs pino** en JSON, limités aux identifiants (`application_id`, `document_id`), types, statuts, codes d'erreur et durées. Une ligne par requête HTTP, sans en-têtes (jeton) ni corps. Les erreurs sont loggées sans leur message, qui peut citer une valeur du document. `redact` masque en plus une liste de champs sensibles (noms, dates de naissance, adresses, numéros, champs extraits, jeton). Critère de la spec vérifié par un test sur la sortie pino (`back/tests/logging.test.ts`). Niveau réglable par `LOG_LEVEL`.
- **Confirmation du type** : `PATCH /v1/applications/:id/documents/:docId` avec `{ "type": "rccm" }` relance l'extraction avec ce type, sans reclassification (`409 DOCUMENT_PROCESSING` pendant un traitement). Un dossier `submitted` est en lecture seule (`409 APPLICATION_LOCKED`).

### Classification et extraction par IA (J2)

- **Rendu** : une image PNG par page (200 DPI, plafonnée à 4000 px) et le texte embarqué du PDF, envoyé comme simple indice.
- **Client LLM unique** (OpenAI, Chat Completions) : `store: false`, température 0, réponse en Structured Outputs stricts générés depuis les schémas Zod, 5 appels simultanés maximum, timeout 60 s et 2 nouveaux essais. Tokens, coût et durée enregistrés par document (`llm_usage`).
- **Modes** `live` / `record` / `replay` : les tests et le smoke test rejouent les réponses de `fixtures/llm/` et n'appellent jamais OpenAI (`LLM_MODE=replay` forcé par `vitest.config.ts`).
- **Classification** sur les 3 premières pages en basse résolution ; sous 0,7 de confiance, le client confirme le type.
- **Extraction** RCCM, statuts et pièce d'identité (les autres types arrivent au J4) : toutes les pages en haute définition, un seul nouvel essai avec les erreurs de validation, puis échec explicite. La forme juridique n'est jamais déduite d'un sigle accolé au nom (cas SAIDOU AUTO), les dates « 01/01 » ne sont jamais corrigées.
- **Résultats chiffrés en base** (AES-256-GCM) et renvoyés déchiffrés par `GET /v1/applications/:id/documents/:docId`.
- **Modèles par défaut** : `gpt-4.1-mini` (classification), `gpt-4.1` (extraction). Coût mesuré sur les documents fictifs : environ 0,01 USD et 5 à 9 s par document (cible de la spec : 0,15 USD et 30 s).

### Évaluation (J2)

`npm run eval` classe et extrait chaque document de `fixtures/<dossier>/` (et `fixtures/private/<dossier>/`, ignoré par git) et compare aux valeurs de `expected.json` : classification, champs corrects (objectif ≥ 80 %), faux positifs, et erreurs à confiance ≥ 0,8 (non signalées au client). Format et options : [fixtures/README.md](fixtures/README.md).

Premier score, sur les 3 documents fictifs de `fixtures/fictif-demo` : classification 3/3, champs corrects 41/41, faux positifs 0/8, pour 0,035 USD. Ce score n'est pas représentatif : documents générés, sans scan, tampon ni écriture manuscrite.

### Dossier fusionné et autosave (J3, back)

- **`GET /v1/applications/:id`** renvoie le dossier complet : champs de l'entreprise, personnes (UBO / control persons), alertes et documents. Chaque champ porte sa valeur, sa confiance, son document et sa page source, ses candidats, et deux indicateurs : `edited_by_user` et `conflict`.
- **Fusion recalculée à chaque lecture** depuis les extractions des documents et les saisies du client, sans copie en clair des données extraites dans le dossier. Supprimer un document retire donc ses valeurs.
- **Règles de la spec** : priorité de source par champ (ex. dénomination RCCM > statuts > certificat fiscal), puis confiance, puis document le plus récent ; deux documents divergents → confiance plafonnée à 0,5, alerte `field_conflict`, le client tranche ; une saisie du client n'est jamais écrasée.
- **Forme juridique Bridge** déduite de la mention explicite selon l'Annexe A (SARL → LLC, SA → Corporation…) ; sans mention ni correspondance, elle reste vide et est demandée au client.
- **Rapprochement des personnes** entre statuts (associés, gérant), RCCM (dirigeants) et pièces d'identité : même personne si les noms normalisés sont assez proches (Jaro-Winkler ≥ 0,92) et que les dates de naissance ne se contredisent pas ; sinon, alerte `ubo_possible_duplicate`. Pourcentage calculé depuis le nombre de parts, UBO à partir de 25 %, control person selon le rôle (gérant, PDG, DG, PCA…).
- **Personnes (`/v1/applications/:id/ubos`)** : `POST` ajoute une personne absente des documents ; `PATCH` corrige ses valeurs, rattache sa pièce d'identité (la date d'expiration est lue sur l'extraction) ou la désigne signataire de l'attestation de propriété (une seule personne, obligatoirement de direction) ; `DELETE` supprime une personne ajoutée ou masque une personne détectée. Les corrections du client ne sont jamais écrasées ; les indicateurs UBO et control person sont recalculés sur les valeurs corrigées. Les identifiants de personnes sont opaques (hash salé par un secret serveur), car ils apparaissent dans les URL.
- **`PATCH /v1/applications/:id`** (autosave) : valeurs brutes validées avec les schémas partagés (email, URL, listes Bridge de l'Annexe B, dates ISO), téléphone normalisé en E.164, `null` pour vider un champ. Les erreurs listent les champs fautifs sans renvoyer les valeurs saisies.

### Parcours client (J3, front)

- **Accueil** : liste des documents à préparer, création du dossier, reprise du dernier dossier ouvert dans ce navigateur.
- **Documents** : glisser-déposer multi-fichiers, progression réseau par fichier, puis suivi de l'analyse (polling toutes les 2 s) ; confirmation du type quand l'IA hésite, relance d'une analyse échouée, suppression.
- **Vérifier** : champs de l'entreprise pré-remplis avec leur source (« Extrait de : Extrait RCCM, p. 1 · 99 % »), surlignés sous 80 % de confiance ou en conflit ; en cas de conflit, le client choisit parmi les valeurs des documents. Personnes : correction, ajout, retrait, pièce d'identité rattachée, signataire de l'attestation.
- **Compléter** : champs demandés au client (contact, site ou explication, activité, origine des fonds, chiffre d'affaires, volume, usage du compte, transmission de fonds), validés avec les schémas partagés avec l'API.
- **Récap** : pièces reçues par section Bridge, personnes et pièces d'identité, points d'attention. La soumission arrive avec le moteur de règles (J4).
- **Autosave** : chaque saisie est enregistrée 800 ms après la dernière frappe, sans bouton ; un indicateur « Enregistrement… / Brouillon sauvegardé » est affiché en permanence.
- **Sécurité** : le navigateur ne parle qu'au serveur Next, qui relaie vers l'API. Le jeton d'accès au dossier est dans un cookie `httpOnly` (30 jours), jamais lisible par le JavaScript de la page.

## Avancement

| Jalon | État | Reste à faire |
| --- | --- | --- |
| J1 | Presque terminé | Validation des schémas et liste des activités réglementées par le DRI ; Docker Compose complet |
| J2 | Terminé côté code | Score d'évaluation sur des documents réels anonymisés |
| J3 | Fait | Lien « reprendre plus tard » |
| J4 à J5 | Non commencés | Voir `spec.md` |

Le front n'est pas encore branché à l'API : il affiche un parcours avec des données factices (prévu au J3).

## Prérequis

- Node.js 22 ou supérieur
- npm fourni avec Node.js
- MongoDB en local sur `localhost:27017`
- MinIO en local sur `localhost:9000` (console sur `9001`). Le bucket `kyb-documents` est créé automatiquement au démarrage de l'API s'il n'existe pas. Exemple de lancement sous Windows :

```powershell
C:\minio\minio.exe server C:\minio\data --console-address :9001
```

- Une clé OpenAI (`OPENAI_API_KEY` dans `back/.env`) pour faire tourner l'API ou `npm run eval` en réel. Sans clé, utiliser `LLM_MODE=replay`. `npm run llm:check --workspace=back` vérifie la clé, les modèles et la vision en un appel (< 0,001 USD).

## Installation et démarrage local

Depuis la racine du dépôt :

```powershell
npm ci
```

Copier `back/.env.example` en `back/.env` puis renseigner les identifiants MinIO et une clé de chiffrement (32 octets en base64) :

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

`back/.env` est ignoré par git. **Conserver la clé de chiffrement** : sans elle, les fichiers déjà stockés sont illisibles.

Lancer chaque application dans son propre terminal :

```powershell
npm run dev --workspace=back
```

```powershell
npm run dev --workspace=front
```

Pour essayer le parcours sans appel à OpenAI, lancer l'API avec `LLM_MODE=replay` et charger les PDF de `fixtures/fictif-demo/` : leurs réponses d'analyse sont enregistrées.

Le front est disponible sur [http://localhost:3000](http://localhost:3000). L’API écoute sur le port `4000`; son endpoint de santé est [http://localhost:4000/health](http://localhost:4000/health).

## Commandes de vérification

```powershell
npm test --workspace=@kyb/shared
npm test --workspace=back              # tests unitaires, sans Mongo ni MinIO
npm run test:smoke --workspace=back    # parcours API de bout en bout sur Mongo et MinIO locaux
npm run test:e2e                       # parcours client dans le navigateur (Playwright, API en replay)
npm run eval                           # évaluation classification + extraction (LLM réel)
npm run eval -- --mode=replay          # même chose sans clé ni coût, sur les réponses enregistrées
npm run build --workspace=@kyb/shared
npm run build --workspace=back
npm run build --workspace=front
```

Le smoke test utilise une base (`kyb_smoke`) et un bucket (`kyb-smoke`) dédiés, vidés à la fin. Il vérifie notamment que le fichier stocké dans MinIO est bien chiffré, que les doublons, fichiers invalides, trop lourds ou trop longs sont traités comme le prévoit la spec, que les documents fictifs passent en arrière-plan de `uploaded` à `extracted` (LLM rejoué), que les champs extraits sont chiffrés en base, et que la confirmation du type et le verrouillage d'un dossier soumis fonctionnent.

Après une modification d'un prompt ou d'un schéma d'extraction, les réponses enregistrées ne correspondent plus : relancer `npm run llm:record-samples --workspace=back` (≈ 0,04 USD).

Le build du back utilise TypeScript avec `strict: true`. Pour démarrer le build compilé du back :

```powershell
npm run start --workspace=back
```

## Architecture des packages

```text
front/                 Application web Next.js
back/                  API Express en TypeScript
packages/shared/       Schémas et types partagés
```

Le package partagé est exposé sous le nom `@kyb/shared`. Les applications peuvent l’importer avec ce nom; ses sources TypeScript sont compilées dans `packages/shared/dist/` avant leur démarrage ou leur build.

## Docker

Le démarrage local documenté ci-dessus ne nécessite pas Docker. La configuration Docker existante est à mettre à jour avant usage : elle ne lance pas encore l’ensemble web, API, MongoDB et MinIO décrit dans la spec, et le Dockerfile du back référence encore l’ancien point d’entrée JavaScript. Ne pas considérer le démarrage Docker complet comme validé.

## Points à valider

- Le DRI doit valider les champs extraits et fournir la liste des activités réglementées ainsi que les références légales par pays.
- Les règles de fusion doivent préciser la priorité des nouvelles formes juridiques et des capitaux extraits d’un `rccm_modificatif`; cette priorité n’est pas encore définie dans la spec.
- La règle de preuve d’activité devra rapprocher les parties d’une facture ou d’un contrat de l’entreprise du dossier, afin de confirmer son rôle plutôt que de se fier uniquement au rôle extrait.
- Docker Compose et le Dockerfile du back doivent être adaptés aux workspaces et à l’entrée TypeScript.
- Documents de test réels anonymisés (ou générés de façon réaliste) avec leurs valeurs attendues : sans eux, le critère « 80 % des champs » ne peut pas être mesuré.
- Les confiances renvoyées par le modèle sont très hautes (0,95 à 0,99) : le seuil « à vérifier » de 0,8 risque de se déclencher rarement. À vérifier sur documents réels (colonne « Err. ≥ 0,8 » de l'éval).
- Le code d'erreur `DOCUMENT_PROCESSING` (409) a été ajouté à la liste de la spec.
- **Seuil de rapprochement des personnes** : Jaro-Winkler ≥ 0,92 sur le nom entier (règle de la spec) fusionne des personnes différentes aux noms proches, fréquents en Afrique de l'Ouest (« Awa DIOP » / « Awa DIOUF » : 0,93 ; « Moussa KANE » / « Moussa KONE » : 0,945), sauf si les deux dates de naissance sont connues. À l'inverse, « Paul Wendkouni OUEDRAOGO » / « Paul OUEDRAOGO » (0,917) ne sont pas rapprochés. Une comparaison mot à mot (chaque mot du nom le plus court retrouvé dans l'autre) corrigerait les deux cas.

## Prochaines étapes

1. J4 : moteur de règles et `GET /status` (pièces manquantes, alertes, `ready`), types de documents restants, génération (description, NAICS, exemption), attestation de propriété.
2. Lien « reprendre plus tard ».
3. En parallèle, dès réception : score d'évaluation sur documents réels et ajustement des prompts.

## Usage de l’IA pendant le développement

L’IA a été utilisée pour analyser la spec et les exemples documentaires, préparer les workspaces npm, convertir le back en TypeScript, proposer les schémas Zod et leurs tests, écrire l'upload sécurisé, le stockage chiffré, la file de traitement asynchrone, le client LLM, les prompts de classification et d'extraction et l'outil d'évaluation avec leurs tests, générer les documents fictifs de test, et rédiger cette documentation. Les prompts ont été ajustés d'après des appels réels (ex. la forme juridique des statuts, d'abord recopiée avec toute la phrase de l'article). L'usage de l'IA dans le produit lui-même est décrit dans « Classification et extraction par IA ». Les tests du package partagé et les builds du package, du back et du front ont été exécutés localement. Les choix métier, les champs et les règles d’extraction restent à revoir et valider par le DRI.
