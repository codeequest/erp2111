# Guide : faire un inventaire physique (écran « Stock counts »)

Menu : **Inventory → Stock counts**

---

## Étape 0 (une seule fois) : saisir le stock d'ouverture

Menu : **Inventory → Warehouses → Import opening stock**

1. Cliquer sur **Download template** : un fichier Excel modèle (.xlsx) est téléchargé.
2. L'ouvrir dans Excel et remplir une ligne par article :

   | sku | warehouse | quantity | unit_cost |
   |---|---|---|---|
   | ART-001 | MAIN | 50 | 12.5 |
   | ART-002 | MAIN | 10 | 3 |

   - `sku` : la référence de l'article (colonne SKU de la liste Products) ;
   - `warehouse` : le code de l'entrepôt (ex. MAIN). Facultatif si on choisit
     un **Default warehouse** sur l'écran ;
   - `quantity` : en **unité de base** (pièces, pas cartons) ;
   - `unit_cost` : coût d'achat par unité (facultatif).
3. Enregistrer le fichier (format Excel .xlsx, normal).
4. Sur l'écran, cliquer sur **Choose a file** (ou glisser le fichier).
5. Le système **vérifie sans rien enregistrer** et affiche chaque ligne :
   « Ready to import » ou l'erreur (référence inconnue, quantité invalide…).
6. Corriger le fichier si besoin et le choisir à nouveau.
7. Cliquer sur **Import N lines** pour enregistrer.

Un article ne peut recevoir un stock d'ouverture qu'**une seule fois** par
entrepôt. Ensuite, on corrige avec **Adjustments** ou un **Stock count**.

---

## Étape 1 : démarrer l'inventaire

1. Cliquer sur **New count**.
2. **Warehouse to count** : choisir l'entrepôt à compter.
3. **Products** :
   - « All products of the warehouse » = tout l'entrepôt ;
   - ou « Only … » = une seule catégorie (conseillé pour un grand dépôt : on
     compte une partie à la fois).
4. **Also list products with no stock here** (case à cocher) : à cocher si on
   veut aussi compter des articles que le système croit à zéro.
5. **Notes** (facultatif), puis **Start count**.

Le système crée l'inventaire (numéro **CNT-2026-00001**…) avec la liste des
articles et la **quantité attendue** (Expected). **Rien ne change dans le
stock à ce moment.**

---

## Étape 2 : compter

### Méthode A : avec un lecteur de code-barres (ou le clavier)

1. Le curseur est dans la case **Scan a barcode or type a SKU**.
2. Scanner l'article (ou taper sa référence) → l'écran va sur la ligne de
   l'article.
3. Taper la **quantité comptée**, appuyer sur **Entrée** → retour à la case de
   scan pour l'article suivant.
4. Si l'article scanné n'est pas dans la liste, il est **ajouté
   automatiquement**.

### Méthode B : taper directement dans la colonne « Counted »

Taper la quantité, **Entrée** = ligne suivante.

### Méthode C : sur papier ou dans Excel

1. Cliquer sur **Count sheet** : un fichier Excel (.xlsx) est téléchargé (sans les
   quantités attendues).
2. L'imprimer ou le remplir dans Excel (colonne `counted_qty`).
3. Cliquer sur **Import counts** et choisir le fichier.
   Une case vide ne supprime pas un comptage déjà saisi.

### Pendant le comptage

- Cliquer sur **Save** souvent. On peut s'arrêter et revenir plus tard ;
  plusieurs personnes peuvent compter le même inventaire.
- **Blind count (hide expected)** : cache la quantité attendue, pour que le
  magasinier compte vraiment au lieu de recopier.
- Les filtres en haut du tableau :
  - **Not counted** : ce qui reste à compter ;
  - **With difference** : les écarts (rouge = manque, vert = surplus) ;
  - **Stock moved** : articles vendus ou reçus depuis le début → à recompter
    si besoin.
- Les quantités sont dans l'**unité de base** (pièce, kg…). Virgule ou point
  acceptés : `2,5` = `2.5`.

---

## Étape 3 : valider

1. Vérifier le filtre **With difference** (recompter les gros écarts).
2. Cliquer sur **Validate** et confirmer.

Résultat :
- chaque article **compté** prend la quantité comptée dans le stock ;
- les articles **non comptés** (case vide) **ne changent pas** ;
- l'écart est calculé avec le stock **au moment de la validation** : une
  vente faite pendant le comptage n'est pas perdue ;
- les corrections apparaissent dans **Stock levels → Movements** avec le motif
  « Stock count CNT-… ».

Après validation, l'inventaire ne peut plus être modifié. Le responsable (avec
la permission de voir les coûts) voit la **valeur totale des écarts**.

**Cancel** (avant validation) : annule l'inventaire, le stock ne change pas.

---

## Permissions

| Action | Permission |
|---|---|
| Voir les inventaires | `inventory.stock.read` |
| Créer, compter, valider, annuler | `inventory.stock.adjust` |
| Voir la valeur des écarts | `inventory.cost.view` |

L'administrateur (admin@erp.local) a toutes ces permissions.

## Conseil

Il faut du stock pour qu'un inventaire liste des articles. Si l'entrepôt est
vide, commencer par **Warehouses → Opening stock** (import du stock
d'ouverture), ou cocher « Also list products with no stock here ».

---

## Langue arabe

En haut de l'écran (et sur la page de connexion), le bouton **العربية**
passe toute l'application en arabe, de droite à gauche. Le bouton
**English** revient à l'anglais. Le choix est gardé dans le navigateur.

Les messages d'erreur du serveur (ex. « product does not exist », erreurs
ligne par ligne des imports Excel) sont aussi traduits en arabe.

Pour les développeurs : textes des écrans dans `apps/web/src/lib/i18n-ar.ts`
(contrôle : `pnpm check:i18n` dans apps/web) ; messages du serveur dans
`apps/api/src/common/i18n/messages-ar.ts`. Le test `messages.spec.ts` échoue
si un nouveau message du serveur n'a pas de traduction arabe.
