# Listes de prix (module Produits)

Une liste de prix (bouton « Price lists ») est un ensemble nommé de prix de
vente pour un type de client, par exemple « Détail », « Gros » ou
« Personnel ». Un même produit peut ainsi être vendu à un prix différent
selon la liste utilisée.

Comment l'ouvrir : Inventory > Products > cliquer sur « Price lists ».

Remarque : l'application est en anglais ; les noms des boutons sont donc
indiqués en anglais entre guillemets.


## 1. Les deux sortes de prix dans une liste

Chaque produit a un prix de vente normal (défini sur le produit).
Dans une liste de prix, chaque produit reçoit son prix de l'une de deux façons :

1. Prix AUTO (automatique)
   La liste a un pourcentage par défaut. Les produits sans prix propre sont
   vendus au prix de vente modifié par ce pourcentage.

       Liste Gros = -10 %
       Huile d'olive, prix de vente 18,50  ->  prix Gros 16,65

   Si le prix de vente change plus tard, le prix auto suit tout seul.

2. Prix PROPRE (fixe, « Own price »)
   On saisit un prix exact pour un produit dans cette liste. Il passe toujours
   avant le pourcentage et ne change pas quand le prix de vente change.

       Huile d'olive dans Gros : prix propre 14,00

   « Reset » supprime le prix propre ; le produit revient au prix auto.

Les prix sont arrondis à 2 décimales (0,005 est arrondi vers le haut).


## 2. Prix par conditionnement

Si un produit a des conditionnements (par exemple 1 CTN = 12 PCS), la liste
affiche une ligne par unité :

    Thé vert   PCS        prix de vente  5,78   -> prix de la liste
    Thé vert   BOX (10)   prix de vente 57,80   -> prix de la liste

- Le prix normal du conditionnement = prix de vente x quantité
  (5,78 x 10 = 57,80).
- On peut donner au conditionnement son propre prix, par exemple rendre une
  boîte moins chère que 10 pièces achetées à l'unité.
- Si l'on supprime un conditionnement du produit, ses prix propres dans toutes
  les listes sont supprimés avec lui.


## 3. Créer et gérer les listes

- « New price list » : saisir un nom (unique), une description facultative
  et la variation par défaut en % (ex. -10, 0 ou 5).
  Plage autorisée : plus de -90 % et jusqu'à +1000 %.
- Cliquer sur une liste à gauche pour voir et modifier ses prix à droite.
- Rechercher un produit, ou cocher « Only products with their own price »
  pour ne voir que les produits avec un prix saisi à la main.
- Cliquer sur le crayon à côté d'un prix, taper le nouveau prix, appuyer
  sur Entrée.
- « Edit » modifie le nom, la description ou le pourcentage.
  Changer le pourcentage met à jour tous les prix AUTO d'un coup.
- « Deactivate » masque une liste (elle n'est plus proposée) ;
  « Activate » la remet. Ses prix sont conservés.


## 4. Où apparaissent les listes de prix

- Fiche produit : la carte « Price lists » montre le prix du produit dans
  chaque liste active. Un point (●) indique un prix propre.
- Impression d'étiquettes (« Print labels ») : on peut choisir une liste de
  prix, pour que les étiquettes affichent par exemple les prix Gros au lieu
  du prix de vente normal.
- Historique des modifications : chaque prix propre ajouté ou supprimé est
  enregistré sur le produit (« Price list change »), avec l'auteur et la date.


## 5. Exemple

    Produit : Riz basmati 5 kg, prix de vente 26,36

    Liste        Règle          Prix
    Détail       0 %            26,36  (auto)
    Gros         -10 %          23,72  (auto : 26,36 - 10 %)
    Personnel    -20 %           1,99  (prix propre, saisi à la main)


## 6. Pas encore disponible

L'association d'une liste de prix à un client (pour que ses commandes
l'utilisent automatiquement) arrivera avec le module Clients / Ventes.
En attendant, les listes de prix servent à consulter les prix et à imprimer
les étiquettes.


## Qui peut faire quoi

- Les utilisateurs qui peuvent voir les produits voient les listes et les prix.
- Les utilisateurs qui peuvent modifier les produits peuvent créer des listes
  et changer les prix.
