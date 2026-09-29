# Jeu d'évaluation

`npm run eval` (depuis la racine) classe et extrait chaque document déclaré ici, puis compare le résultat aux valeurs attendues.

## Ajouter un dossier

```
fixtures/<dossier>/            versionné : documents fictifs ou réellement anonymisés uniquement
fixtures/private/<dossier>/    ignoré par git : documents réels
  expected.json
  rccm.pdf
  statuts.pdf
  cni-gerant.jpg
```

`expected.json` :

```json
{
  "description": "Dossier SAIDOU AUTO (anonymisé)",
  "documents": {
    "rccm.pdf": {
      "type": "rccm",
      "fields": {
        "legal_name": "SAIDOU AUTO SARL",
        "legal_form_explicit": null,
        "registration_date": "2019-03-14",
        "registered_address.full_address": "…",
        "officers[0].last_name": "…"
      }
    },
    "cni-gerant.jpg": { "type": "id_document", "fields": { "date_of_birth": "1980-01-01" } }
  }
}
```

- `type` : type attendu (voir `documentTypeCatalog` dans `packages/shared`).
- `fields` : chemin du champ (noms des schémas Zod de `packages/shared`, `[n]` pour une liste) → valeur attendue, **telle qu'écrite dans le document** (et non telle que le modèle l'a rendue). Dates en `AAAA-MM-JJ`, montants en entiers, pays en ISO alpha-3, devises en ISO 4217.
- `null` : le champ doit rester vide (sert à mesurer les faux positifs, ex. `legal_form_explicit` quand il n'y a pas de mention « Forme juridique »).
- Un champ absent de `fields` n'est pas noté. En cas d'ambiguïté réelle dans le document, ne pas le noter.

## Mesures

Par type de document :

- **Classification** : documents classés dans le bon type.
- **Champs corrects** : valeurs attendues retrouvées (critère de la spec : ≥ 80 %). Comparaison insensible à la casse et aux espaces, mais pas aux accents ni à l'orthographe.
- **Faux positifs** : champs attendus vides mais remplis.
- **Err. ≥ 0,8** : erreurs extraites avec une confiance ≥ 0,8, donc non signalées « à vérifier » au client — les plus dangereuses.

L'extraction est lancée avec le type attendu (comme après confirmation par le client), pour mesurer l'extraction indépendamment de la classification.

## Options

```bash
npm run eval                        # LLM réel (coût : quelques centimes par document)
npm run eval -- --dossier=saidou    # filtre sur le nom du dossier
npm run eval -- --mode=replay       # rejoue fixtures/llm, sans clé ni coût
npm run eval -- --mode=record       # réel + enregistrement pour le replay (interdit sur fixtures/private)
```

Le rapport détaillé, avec les valeurs extraites, est écrit dans `eval-results/` (ignoré par git).
