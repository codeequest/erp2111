# Moteur de stock — Plan de développement (proposition)

Date : 2026-11-27
Statut : proposition, en attente des décisions du responsable (voir la dernière section)

---

## 1. Ce qui existe déjà

La base est bonne :

- `stock_moves` : un journal des mouvements en ajout seul (quantité signée,
  `unitCost`, lien vers le document d'origine, `transferId`).
- `stock_balances` : la quantité en stock, mise en cache par article et par
  entrepôt.
- `Product.averageCost` (coût moyen pondéré) et
  `CompanySettings.allowNegativeStock`.
- Des endpoints provisoires dans `stock.controller.ts` et
  `warehouses.controller.ts` (ils renvoient 501 pour l'instant), avec leurs
  permissions déjà en place.

**Ce qui manque :** le moteur lui-même, c'est-à-dire un service unique par
lequel tous les modules passent pour modifier le stock.

---

## 2. Suggestions

### 2.1 Un seul service `StockEngine` écrit dans le stock

Aucun autre code (achats, ventes, retours, ajustements) ne doit écrire
directement dans `stock_moves` ou `stock_balances`. Chaque module appelle le
moteur à l'intérieur de sa propre transaction en base :

```ts
stockEngine.post(tx, {
  sourceType: 'GoodsReceipt',
  sourceId,
  reference: 'GR-2026-00012',
  lines: [
    { productId, warehouseId, quantity: +24, unitCost: 3.5, type: 'RECEIPT' },
  ],
}, user);
```

Pour chaque ligne, le moteur :

1. vérifie les règles (stock négatif, article actif, entrepôt actif),
2. verrouille la ligne de solde,
3. insère le mouvement,
4. met à jour le solde,
5. met à jour le coût moyen,
6. écrit l'entrée dans le journal d'audit.

C'est la règle de la spécification (« les modules communiquent par des
interfaces de service »), et c'est ce qui empêche le stock de dériver sans
que personne ne s'en aperçoive.

### 2.2 Gérer la concurrence dès le premier jour

C'est là que la plupart des ERP faits maison cassent. Si deux utilisateurs
livrent la dernière unité au même moment, le stock devient négatif.

- Mettre à jour les soldes de façon atomique :
  `UPDATE stock_balances SET quantity = quantity + $d WHERE ... AND quantity + $d >= 0`.
  Si aucune ligne n'est modifiée, le stock est insuffisant.
- Utiliser `upsert` pour le premier mouvement d'un article dans un entrepôt.
- Trier les lignes par `(productId, warehouseId)` avant de les verrouiller,
  pour que deux transferts en sens inverse ne puissent pas se bloquer
  mutuellement (deadlock).
- Verrouiller la ligne `Product` (`SELECT ... FOR UPDATE`) pendant le
  recalcul du coût moyen.

### 2.3 Règles de valorisation (coût moyen pondéré)

| Mouvement | Règle de coût |
|---|---|
| Réception | `nouveauCMP = (stockTotal × CMP + qté × coût) / (stockTotal + qté)`. Le coût est unique pour toute l'entreprise, ce qui correspond au schéma |
| Livraison / ajustement négatif | Enregistrer le coût moyen actuel dans `unitCost`. C'est le coût des marchandises vendues, figé à ce moment |
| Transfert | Déplace le stock au coût moyen actuel, sans le modifier |
| Retour client | Revient au coût de la livraison d'origine, pas au coût moyen du jour |
| Cas limite | Si le stock est nul ou négatif, le coût de la réception devient le nouveau coût moyen. Ne jamais diviser par zéro |

### 2.4 Ajouts au schéma à faire avant de commencer

| Ajout | Pourquoi |
|---|---|
| Tables en-tête + lignes `StockAdjustment` / `StockTransfer`, numérotées avec `DocumentSequence` (`ADJ-…`, `TRF-…`) | Les ajustements et transferts deviennent de vrais documents qu'on peut imprimer, valider et auditer, au lieu de simples lignes dans le journal |
| `StockMove.sourceLineId` + index unique `(sourceType, sourceId, sourceLineId, type)` | La validation est idempotente : un double-clic ne peut pas enregistrer le stock deux fois |
| `StockMove.reversesMoveId` | Une erreur se corrige par un mouvement d'annulation, jamais par une modification |
| `CHECK (quantity <> 0)` + un trigger qui bloque UPDATE/DELETE sur `stock_moves` | La base de données impose elle-même la règle « ajout seul », pas seulement une convention |
| `StockBalance.reserved` (quantité réservée par les commandes clients confirmées) | Permet d'afficher **disponible = en stock − réservé**, pour ne jamais promettre deux fois le même stock |
| `StockCount` + `StockCountLine` (inventaire physique) | Les magasiniers comptent, le système calcule les écarts, et la validation génère les ajustements. Indispensable tôt dans le commerce |

### 2.5 À laisser hors de la v1 (sans bloquer la suite)

- Lots, numéros de série, dates de péremption
- Emplacements (casiers) à l'intérieur d'un entrepôt
- Une étape « en transit » pour les transferts
- Frais d'approche (transport, douane)

Garder `productId + warehouseId` comme clé pour l'instant. Ajouter plus tard
un `lotId` optionnel ne cassera rien.

### 2.6 Rapports et contrôles de sécurité

- **Niveaux de stock** : en stock, réservé, disponible, alerte stock bas,
  valeur.
- **Journal des mouvements** avec solde cumulé.
- **Stock à une date donnée**, calculé à partir des mouvements (pour les
  clôtures mensuelles).
- **Valorisation** (quantité × coût moyen). Visible uniquement avec la
  permission `inventory.cost.view`.
- **Contrôle de cohérence** (endpoint ou tâche de nuit) : comparer
  `stock_balances` avec `SUM(stock_moves)` et alerter en cas d'écart.

### 2.7 Les tests importants

- Le calcul du coût moyen, y compris les cas de stock nul et négatif
- Le blocage du stock négatif
- **Concurrence** : deux livraisons simultanées de la dernière unité, une
  seule doit réussir
- Valider deux fois le même document ne change rien (idempotence)
- Le contrôle de cohérence

---

## 3. Ordre de développement proposé

1. Migration du schéma (ajouts ci-dessus) + `StockEngine.post()` + tests
   unitaires
2. Gestion des entrepôts (CRUD) + stocks d'ouverture (import CSV au
   démarrage)
3. Ajustements et transferts (documents + endpoints) + écrans web
4. Écrans niveaux de stock, journal des mouvements et stock bas
5. Inventaires physiques
6. Brancher les réceptions d'achat et les livraisons de vente sur le moteur,
   au fur et à mesure que ces modules sont développés

---

## 4. Décisions à prendre par le responsable

1. **Réservations :** les commandes clients confirmées doivent-elles réserver
   le stock, ou seules les livraisons le diminuent-elles ?
2. **Validation des ajustements :** enregistrement immédiat, ou brouillon
   d'abord puis validation par un responsable ?
3. **Lots ou dates de péremption :** l'entreprise vend-elle des produits
   périssables ou suivis par numéro de série ? Cela décide si les lots restent
   hors de la v1.
4. **Nombre d'entrepôts au démarrage** (encore une question ouverte dans la
   spécification).

---

## 5. Ce que font les ERP les plus utilisés (Odoo, ERPNext, SAP Business One)

### 5.1 Réservations — **Oui, la commande confirmée réserve le stock**

| ERP | Pratique |
|---|---|
| SAP Business One | Colonne « Engagé » : disponible = en stock − engagé (commandes clients) + commandé (commandes fournisseurs) |
| Odoo | Confirmer la commande crée le bon de livraison, qui réserve le stock |
| ERPNext | « Quantité réservée » mise à jour à la validation de la commande client |

**Recommandation :** la commande confirmée réserve le stock (`reserved`).
L'écran affiche en stock / réservé / disponible. La livraison diminue le stock
réel et libère la réservation. L'annulation de la commande libère aussi la
réservation.

### 5.2 Validation des ajustements — **Brouillon puis validation**

| ERP | Pratique |
|---|---|
| Odoo | On saisit les quantités comptées, puis on clique « Appliquer » |
| ERPNext | « Stock Reconciliation » : brouillon → « Submit » |
| SAP Business One | Comptage d'inventaire → validation ; circuit d'approbation en option |

**Recommandation :** deux étapes, brouillon → validé. Le stock ne bouge qu'à
la validation. Seuls les utilisateurs avec `inventory.stock.adjust` peuvent
valider. Pas de circuit d'approbation multi-niveaux en v1 (on pourra l'ajouter
plus tard).

### 5.3 Lots / péremption — **Option par article**

Tous ces ERP gèrent les lots et numéros de série, mais **en option sur chaque
article** (aucun suivi / par lot / par numéro de série). La plupart des
articles d'un commerce n'en ont pas besoin.

**Recommandation :** hors de la v1, sauf si l'entreprise vend de
l'alimentaire, des médicaments, des cosmétiques ou de l'électronique avec
garantie. Dans ce cas, il faut le prévoir dès maintenant, car l'ajouter plus
tard demande de reprendre les mouvements existants.

### 5.4 Nombre d'entrepôts — **Multi-entrepôts dès le départ**

Tous ces ERP gèrent plusieurs entrepôts dès l'installation, même si
l'entreprise n'en a qu'un. C'est déjà le cas dans votre schéma.

**Recommandation :** on garde le multi-entrepôts. Il suffit de savoir combien
d'entrepôts ou de magasins créer au démarrage.

### Résumé — décisions validées (2026-11-27)

| Question | Décision |
|---|---|
| Réservations | ✅ Oui, à la confirmation de la commande client |
| Ajustements | ✅ Brouillon → validé, avec permission `inventory.stock.adjust` |
| Lots / péremption | ✅ Hors v1 (produits généraux). Le schéma reste prêt pour un suivi optionnel par article plus tard |
| Entrepôts | ✅ Multi-entrepôts. Un entrepôt principal (`MAIN`) est créé par défaut ; l'administrateur ajoute les autres depuis l'écran Entrepôts |

---

## 6. Avancement

### ✅ Étape 1 terminée (2026-11-27) : base de données + moteur de stock

**Base de données** (migration `20261127120000_stock_engine`, déjà appliquée) :

- Nouvelles tables : ajustements, transferts et inventaires physiques
  (en-tête + lignes, statut brouillon / validé / annulé). Nouvelle
  numérotation `CNT-` pour les inventaires.
- `stock_moves` : colonnes `source_line_id` (anti double validation) et
  `reverses_move_id` (annulation).
- `stock_balances` : colonne `reserved` (stock réservé).
- Règles imposées par la base : interdiction de modifier ou supprimer un
  mouvement, quantité jamais à zéro, coût jamais négatif, réservé jamais
  négatif, un transfert entre deux entrepôts différents.

**Le moteur** : `apps/api/src/modules/inventory/stock/`

| Fichier | Rôle |
|---|---|
| `stock-rules.ts` | Règles pures : calcul du coût moyen pondéré, contrôle de chaque ligne |
| `stock-engine.service.ts` | `StockEngine`, le seul code qui écrit le stock |

Fonctions de `StockEngine` :

| Fonction | Ce qu'elle fait |
|---|---|
| `post()` | Enregistre des mouvements : contrôle, verrouillage, journal, solde, coût moyen, audit |
| `transfer()` | Transfert entre deux entrepôts (une sortie + une entrée, au coût moyen) |
| `reverse()` | Annule des mouvements par des mouvements inverses (les deux côtés d'un transfert ensemble) |
| `reserve()` / `release()` | Réserve ou libère du stock pour les commandes clients |
| `findDrift()` | Contrôle de cohérence : soldes ≠ somme des mouvements |

**Tests** : 65/65 réussis, dont 27 nouveaux pour le stock.

- `stock-rules.spec.ts` : 15 tests du calcul du coût et des contrôles.
- `stock-engine.db.spec.ts` : 12 tests sur une vraie base PostgreSQL
  **séparée** (`erp_test`, jamais la base réelle) : stock négatif bloqué,
  double validation refusée, transferts, annulations, réservations, deux
  livraisons simultanées de la dernière unité (une seule réussit), journal
  impossible à modifier.

Lancer les tests de la base de test (PowerShell) :

```powershell
cd apps/api
$env:TEST_DATABASE_URL="postgresql://erp:erp@localhost:5432/erp_test?schema=public"
npx jest stock
```

Sans `TEST_DATABASE_URL`, les tests de base de données sont ignorés et les
autres tests passent normalement.

### ✅ Étape 2 terminée (2026-11-27) : entrepôts + stock d'ouverture

**Écran Entrepôts** : menu **Inventaire → Entrepôts** (`/inventory/warehouses`)

- Ajouter un entrepôt : code (ex. `SFAX`), nom, adresse.
- Modifier le nom et l'adresse (bouton crayon). Le code ne change jamais.
- Désactiver / réactiver (bouton marche-arrêt). Un entrepôt n'est jamais
  supprimé. La désactivation est refusée si :
  - l'entrepôt contient encore du stock (transférez-le ou ajustez-le à zéro),
  - du stock y est réservé pour des commandes,
  - c'est le dernier entrepôt actif.
- Colonne « Produits en stock » : nombre de produits présents dans
  l'entrepôt.
- Case « Afficher les inactifs ».

**Écran Stock d'ouverture** : bouton **Import opening stock** sur l'écran
Entrepôts (`/inventory/warehouses/opening`)

À utiliser une seule fois, au démarrage, pour saisir le stock déjà en rayon.

1. Choisir l'entrepôt par défaut.
2. Télécharger le modèle, le remplir dans Excel, l'enregistrer en CSV.
3. Déposer le fichier : un aperçu montre chaque ligne (OK ou erreur).
4. Cliquer sur **Import** pour enregistrer. Rien n'est enregistré avant.

Colonnes du fichier :

| Colonne | Obligatoire | Contenu |
|---|---|---|
| `sku` | Oui | Code de l'article |
| `warehouse` | Non | Code de l'entrepôt. Vide = entrepôt par défaut |
| `quantity` | Oui | Quantité en unité de base (pièces, pas cartons) |
| `unit_cost` | Non | Coût d'une unité. Vide = coût moyen actuel de l'article. Nécessite la permission `inventory.cost.view` |

Règles :

- Un article qui a déjà des mouvements dans un entrepôt est refusé pour cet
  entrepôt (utilisez un ajustement).
- Les fichiers Excel avec `;` et virgule décimale (`3,50`) sont acceptés.
- Les coûts et la valeur totale ne sont affichés qu'aux utilisateurs ayant
  `inventory.cost.view`.

**Tests** : 73/73 réussis, dont 8 nouveaux (entrepôts + import).

### ✅ Étape 3 terminée (2026-11-28) : ajustements + transferts

Deux nouveaux écrans dans le menu **Inventaire** :

| Écran | Adresse | Permission pour créer / valider |
|---|---|---|
| **Ajustements** | `/inventory/adjustments` | `inventory.stock.adjust` |
| **Transferts** | `/inventory/transfers` | `inventory.stock.transfer` |

La permission `inventory.stock.read` suffit pour consulter les listes et les
documents.

**Fonctionnement (identique pour les deux) :**

1. **Nouveau** → remplir le document → **Enregistrer le brouillon**
   (*Save draft*). Le stock **ne bouge pas**.
2. **Valider** (*Validate*) → le stock bouge. Le document ne peut plus être
   modifié.
3. **Annuler le brouillon** (*Cancel draft*) → le brouillon est gardé comme
   « annulé ». Un document validé ne peut pas être annulé : on corrige avec un
   nouveau document.

Chaque document reçoit un numéro sans trou : `ADJ-2026-00001`,
`TRF-2026-00001`…

**Ajustement :**

- Choisir l'entrepôt et donner une raison (obligatoire).
- Ajouter des produits : taper le nom, le code (SKU) ou **scanner le code-barres**.
- Pour chaque ligne : **Retirer −** ou **Ajouter +**, puis la quantité.
  L'écran montre le stock actuel et le stock **après** l'ajustement (en rouge
  s'il devient négatif).
- Coût unitaire (seulement pour « Ajouter », et seulement avec
  `inventory.cost.view`). Vide = coût moyen.

**Transfert :**

- Choisir l'entrepôt **De** et l'entrepôt **Vers** (différents).
- Ajouter des produits et la quantité à déplacer. L'écran montre le stock
  disponible dans l'entrepôt de départ (en rouge si la quantité est trop
  grande).

**Sécurité :**

- La validation est refusée si le stock deviendrait négatif. Le document reste
  en brouillon.
- Si deux personnes valident le même document en même temps, une seule
  validation passe.
- Un utilisateur sans `inventory.cost.view` ne voit pas les coûts, et ne les
  efface pas en modifiant un brouillon.

**Tests** : 86/86 réussis, dont 13 nouveaux.

### ✅ Étape 4 terminée (2026-11-28) : niveaux de stock + mouvements + stock bas

Écran **Inventaire → Stock levels** (`/inventory/stock`), avec deux onglets.

**Onglet « Stock levels » (niveaux de stock)**

- Une ligne par produit : **en stock**, **réservé**, **disponible**
  (= en stock − réservé), **stock minimum**.
- Avec `inventory.cost.view` : coût moyen et **valeur** du stock.
- En haut : nombre de produits, nombre de produits en **stock bas**, valeur
  totale. Cliquer sur la carte « Low stock » affiche seulement ces produits.
- Filtres : recherche (nom, SKU, code-barres), entrepôt, catégorie (avec ses
  sous-catégories), « seulement en stock », « stock bas seulement ».
- Tri en cliquant sur les titres de colonnes (produit, en stock, disponible,
  valeur).
- Bouton **Export CSV** (avec les mêmes filtres).
- Le bouton horloge d'une ligne ouvre l'historique de ce produit.
- Lien direct vers la liste du stock bas : `/inventory/stock?low=1`.

Règle du stock bas : produit actif, stock minimum > 0, et stock **total de tous
les entrepôts** inférieur au minimum (même règle que le tableau de bord).

**Onglet « Movements » (mouvements)**

- Tous les mouvements, du plus récent au plus ancien : date, type, produit,
  entrepôt, quantité (+ vert / − rouge), **stock après le mouvement**, coût,
  document, raison, utilisateur.
- Filtres : produit, entrepôt, type, dates (du / au), numéro de document.
- Le numéro d'un ajustement ou d'un transfert est un lien vers ce document.

**Contrôle de cohérence** : à l'ouverture de l'écran, le système vérifie que
les soldes correspondent à l'historique. En cas d'écart, un message rouge
s'affiche (cela ne doit jamais arriver).

**Correction technique** : chaque mouvement a maintenant un numéro d'ordre
(`seq`) donné par la base de données. Le « stock après » est donc toujours
calculé dans l'ordre réel des mouvements. Les filtres de date utilisent le
fuseau horaire de l'utilisateur.

**Tests** : 97/97 réussis, dont 11 nouveaux.

### ✅ Étape 5 terminée (2026-11-28) : inventaires physiques

**Menu : Inventaire → Stock counts** (`/inventory/counts`, permission
`inventory.stock.adjust`).

**Comment ça marche :**

1. **Démarrer un inventaire** : choisir l'entrepôt et, si on veut, une seule
   catégorie (inventaire tournant, pratique pour un grand dépôt). Le système
   liste les articles qui ont du stock, avec la **quantité attendue**. Option :
   ajouter aussi les articles à zéro, pour compter la marchandise trouvée.
2. **Compter** : sur l'écran, scanner le code-barres (ou taper la référence)
   → le curseur va sur l'article, on tape la quantité, Entrée → retour au
   scanner. Un article scanné qui n'est pas dans la liste est **ajouté**.
   - On enregistre autant de fois qu'on veut (plusieurs personnes peuvent compter).
   - **Comptage à l'aveugle** : case à cocher qui cache la quantité attendue,
     pour que le magasinier compte vraiment.
   - **Feuille de comptage** à télécharger (CSV, sans les quantités attendues),
     à remplir sur papier ou dans Excel, puis **import** du fichier
     (colonnes `sku`, `counted_qty`). Une cellule vide n'efface pas un comptage déjà saisi.
   - Filtres : tous / non comptés / avec écart / stock bougé.
3. **Valider** : chaque article compté est mis à la quantité comptée par un
   mouvement `ADJUSTMENT` (motif « Stock count CNT-… »). Les articles non
   comptés **ne changent pas**.

**Point important (comme Odoo et SAP) :** l'écart est calculé avec le stock
**au moment de la validation**, pas au début. Si un client achète 1 article
pendant le comptage, cette vente n'est pas perdue. L'écran signale les
articles dont le stock a bougé depuis le début (« Stock moved ») pour qu'on
les recompte si besoin.

Après validation, l'écart et son coût sont gardés sur chaque ligne ; le
responsable (avec `inventory.cost.view`) voit la **valeur totale des écarts**.

**Base de données :** 2 migrations : colonnes `difference` et `unit_cost` sur
`stock_count_lines`, et `category_id` sur `stock_counts`.

**Tests :** 10 nouveaux tests sur la base de test (dont la vente pendant le
comptage, l'import CSV et la double validation refusée). **107/107 tests OK.**

### ✅ Étape 6 terminée (2026-11-28) : la « couche stock » des achats et des ventes

Les modules **Achats** et **Ventes** ne sont pas encore développés (pas
d'écrans, l'API répond « 501 »). Décision : préparer **seulement la partie
stock** dont ils auront besoin. Rien de nouveau n'est visible à l'écran.

Fichier : `apps/api/src/modules/inventory/stock/stock-flows.service.ts`
(`StockFlowsService`). Achats et Ventes ne toucheront **jamais** au stock
directement : ils appelleront ces fonctions dans leur propre transaction.

| Événement métier | Fonction | Effet sur le stock |
|---|---|---|
| Réception d'achat enregistrée | `receive` | Entrée au prix d'achat net (après remise), converti en unité de base (ex. 2 cartons × 12 = 24 pièces). Met à jour le coût moyen |
| Réception annulée | `cancelReceipt` | Sortie des mêmes quantités (refusée si la marchandise est déjà vendue) |
| Commande client confirmée ou modifiée | `reserveOrder` | Réserve ce qui reste à livrer. Refusé si le disponible manque ; option `partial` : réserve ce qui est disponible et indique le manque (reliquat) |
| Commande annulée ou soldée | `releaseOrder` | Libère toutes ses réservations |
| Livraison enregistrée | `deliver` | Sortie au coût moyen (= coût des ventes), libère la réservation de la commande |
| Livraison annulée | `cancelDelivery` | Remet la marchandise au coût de sortie et la réserve à nouveau |
| Retour client | `customerReturn` | Entrée **au coût de la livraison d'origine** |

**Règles de sécurité :**
- Une livraison ne peut **pas prendre le stock réservé pour une autre
  commande**, ni dépasser la quantité commandée.
- Un retour ne peut pas dépasser ce qui a été livré moins les retours déjà faits.
- Un même document ne peut pas être passé deux fois en stock.
- Les quantités livrées et retournées sont lues dans le **journal des
  mouvements**, pas dans les compteurs des documents de vente : même si un
  compteur est faux, le stock reste juste.
- Le contrôle de cohérence (écran Niveaux de stock) vérifie aussi que le
  **réservé** correspond aux commandes ouvertes.

**Base de données :** 1 migration : colonne `reserved_qty` sur
`sales_order_lines` (jamais négative) et lien `delivery_line_id` sur
`customer_return_lines`.

**Tests :** 13 nouveaux tests (réception avec unités et remise, double
réservation refusée, réservation partielle, livraison qui prendrait le stock
d'une autre commande, annulation de livraison, retour au coût d'origine…).
**120/120 tests OK.**

**Le moteur de stock (étapes 1 à 6) est terminé.**

### ⏭️ Suite possible

Développer le module **Achats** (fournisseurs, bons de commande, réceptions),
puis le module **Ventes** (clients, devis, commandes, livraisons, retours).
Ils utiliseront directement les fonctions ci-dessus.
