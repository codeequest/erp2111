# Price lists (Products module)

A price list is a named set of selling prices for one kind of customer,
for example "Retail", "Wholesale" or "Staff". The same product can then be
sold at a different price depending on the list used.

How to open it: Inventory > Products > click "Price lists".


## 1. The two kinds of price in a list

Every product has a normal sale price (set on the product).
Inside a price list, each product gets its price in one of two ways:

1. AUTO price (automatic)
   The list has a default percentage. Products without their own price
   are sold at the sale price changed by that percentage.

       Wholesale list = -10%
       Olive oil sale price 18.50  ->  Wholesale price 16.65

   If the sale price changes later, the auto price follows by itself.

2. OWN price (fixed)
   You type an exact price for a product in that list. It always wins
   over the percentage and does not change when the sale price changes.

       Olive oil in Wholesale: own price 14.00

   "Reset" removes the own price; the product goes back to the auto price.

Prices are rounded to 2 decimals (0.005 rounds up).


## 2. Prices per pack size

If a product has pack sizes (for example 1 CTN = 12 PCS), the list shows
one line per unit:

    Green tea   PCS        sale price  5.78   -> list price
    Green tea   BOX (10)   sale price 57.80   -> list price

- The normal pack price is sale price x pack quantity (5.78 x 10 = 57.80).
- You can give the pack its own price, e.g. make a box cheaper than
  10 single pieces.
- If you delete a pack size from the product, its own prices in all
  price lists are deleted with it.


## 3. Creating and managing lists

- "New price list": enter a name (must be unique), an optional
  description, and the default change in % (e.g. -10, 0 or 5).
  Allowed range: above -90% and up to +1000%.
- Click a list on the left to see and edit its prices on the right.
- Search for a product, or tick "Only products with their own price" to see
  just the products you have set manually.
- Click the pencil next to a price, type the new price, press Enter.
- "Edit" changes the name, description or percentage.
  Changing the percentage updates every AUTO price at once.
- "Deactivate" hides a list (it is no longer offered); "Activate" brings
  it back. Its prices are kept.


## 4. Where price lists appear

- Product page: the "Price lists" card shows the product's price in every
  active list. A dot (●) marks an own price.
- Print labels: you can choose a price list, so shelf labels show
  e.g. Wholesale prices instead of the normal sale price.
- Change history: every own price set or removed is recorded on the
  product ("Price list change"), with who did it and when.


## 5. Example

    Product: Basmati rice 5kg, sale price 26.36

    List        Rule          Price
    Retail      0%            26.36  (auto)
    Wholesale   -10%          23.72  (auto: 26.36 - 10%)
    Staff       -20%           1.99  (own price, set by hand)


## 6. Not available yet

Attaching a price list to a customer (so their orders use it
automatically) will come with the Customers / Sales module.
Until then, price lists are used for viewing prices and printing labels.


## Who can do what

- Users who can view products can see price lists and prices.
- Users who can edit products can create lists and change prices.
