# Catalogue setup (Products module)

Catalogue setup is where you manage the shared lists that every product
chooses from. You fill them in once; the product form then offers them as
options.

How to open it: Inventory > Products > click "Catalogue setup".

It has three tabs: Categories, Units and Tax rates.


## 1. Categories - how products are grouped

Example:

    Food
     |- Oils
     |- Sugar
    Drinks
     |- Tea & coffee

- Add a category at the top level, or inside another one as a sub-category.
- Edit a category to rename it or move it under another parent.
- Deactivate a category so it is no longer offered for new products.
  Products already in it are not changed.
- Filtering the product list by a category also shows its sub-categories
  (choosing "Food" also shows the oils and the sugar).

Rules:
- A category cannot be moved inside itself or its own sub-categories.
- Two sub-categories with the same name cannot sit under the same parent.


## 2. Units - how products are counted

Examples: PCS (piece), KG (kilogram), L (litre), CTN (carton).

- Every product has a base unit: the unit its stock is counted in.
- Units are also used for pack sizes on the product page,
  for example "1 CTN = 12 PCS". You can then buy or sell by the carton,
  and give the carton its own barcode and price.
- Each unit has a code (e.g. CTN) and a name (e.g. Carton).
  The code can never be changed, because documents refer to it.
  The name can be changed at any time.


## 3. Tax rates - the tax added on sales

Examples: "VAT 19%", "VAT 7%", "Exempt 0%".

- Each product can be given a tax rate in its form.
- You can add, rename, change or deactivate rates.
- This tab is only shown to users allowed to manage company settings
  (for example the admin).


## Typical order when starting out

1. Create the units you need (PCS, KG, CTN...).
2. Create the tax rates that apply in your country.
3. Build the category tree.
4. Create products, or import them from a CSV file. Their category,
   unit and tax rate are chosen from these lists.
