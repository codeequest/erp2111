# Configuration du catalogue (module Produits)

La configuration du catalogue (bouton « Catalogue setup ») est l'endroit où
l'on gère les listes communes utilisées par tous les produits. On les remplit
une fois ; ensuite, le formulaire de chaque produit les propose comme choix.

Comment l'ouvrir : Inventory > Products > cliquer sur « Catalogue setup ».

L'écran a trois onglets : Categories (catégories), Units (unités) et
Tax rates (taux de taxe).

Remarque : l'application est en anglais ; les noms des boutons sont donc
indiqués en anglais entre guillemets.


## 1. Catégories (Categories) - comment les produits sont regroupés

Exemple :

    Alimentation
     |- Huiles
     |- Sucre
    Boissons
     |- Thé et café

- Ajouter une catégorie au premier niveau, ou à l'intérieur d'une autre
  comme sous-catégorie.
- Modifier une catégorie pour la renommer ou la déplacer sous un autre parent.
- Désactiver une catégorie pour qu'elle ne soit plus proposée aux nouveaux
  produits. Les produits déjà dedans ne changent pas.
- Filtrer la liste des produits par une catégorie affiche aussi ses
  sous-catégories (choisir « Alimentation » affiche aussi les huiles et le sucre).

Règles :
- Une catégorie ne peut pas être déplacée à l'intérieur d'elle-même ou de ses
  propres sous-catégories.
- Deux sous-catégories du même nom ne peuvent pas exister sous le même parent.


## 2. Unités (Units) - comment les produits sont comptés

Exemples : PCS (pièce), KG (kilogramme), L (litre), CTN (carton).

- Chaque produit a une unité de base : l'unité dans laquelle son stock est compté.
- Les unités servent aussi aux conditionnements sur la fiche produit,
  par exemple « 1 CTN = 12 PCS ». On peut alors acheter ou vendre au carton,
  et donner au carton son propre code-barres et son propre prix.
- Chaque unité a un code (ex. CTN) et un nom (ex. Carton).
  Le code ne peut jamais être modifié, car les documents y font référence.
  Le nom peut être modifié à tout moment.


## 3. Taux de taxe (Tax rates) - la taxe ajoutée sur les ventes

Exemples : « TVA 19% », « TVA 7% », « Exonéré 0% ».

- Chaque produit peut recevoir un taux de taxe dans son formulaire.
- On peut ajouter, renommer, modifier ou désactiver un taux.
- Cet onglet n'est visible que pour les utilisateurs autorisés à gérer les
  paramètres de l'entreprise (par exemple l'administrateur).


## Ordre conseillé pour démarrer

1. Créer les unités nécessaires (PCS, KG, CTN...).
2. Créer les taux de taxe applicables dans votre pays.
3. Construire l'arbre des catégories.
4. Créer les produits, ou les importer depuis un fichier CSV. Leur catégorie,
   leur unité et leur taux de taxe sont choisis dans ces listes.
