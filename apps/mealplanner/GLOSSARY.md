# Meal Planner

Pantry-driven dinner planning for one household: what's on hand turns into dinner ideas, a weekly
plan and a shopping list.

## Language

### People

**Household**: The people who share one pantry, one recipe library and one weekly plan. All data
belongs to the household, not to one person.

_Avoid_: Family, account, team

### Dishes

**Recipe**: A saved dish in the household's library: its ingredients, steps, prep time and servings.

_Avoid_: Meal, dish

**Library**: All of the household's saved recipes.

_Avoid_: Cookbook, collection

**Recipe Source**: Where a recipe came from: **Suggested** (a saved suggestion), **Custom** (typed
in by hand) or **Imported**.

_Avoid_: Origin, type

**Import**: Pulling a recipe from a web page or a photo into the library.

_Avoid_: Scrape, upload

**Ingredient**: One line of a recipe: something the dish needs, with an optional amount.

_Avoid_: Pantry item (that's what's on hand, not what's needed)

**Suggestion**: A dinner idea proposed by the AI that has not been saved. It becomes a recipe only
when someone saves it or plans it. A suggestion with the same name as a recipe already in the
library is that recipe: saving or planning it uses the library's recipe instead of adding another.

_Avoid_: Recommendation, idea, AI recipe

**Variation**: A suggestion that is a twist on an existing dish.

_Avoid_: Alternative, remix

**Cook**: One occasion a recipe was made, on a date, with optional notes.

_Avoid_: Cooked it, log entry, history

**Recently Cooked**: A recipe with a cook in the last 14 days. It is never suggested again until the
window passes.

_Avoid_: Recent, repeat

**Favorite**: A recipe rated 4 or 5 stars.

_Avoid_: Liked, starred

**Disliked**: A recipe rated 1 or 2 stars.

_Avoid_: Bad, hated

### Planning

**Week**: Monday to Sunday.

_Avoid_: Weekly period

**Week Plan**: The household's plan for one week: which recipe is for dinner on each day.

_Avoid_: Meal plan, planner, schedule

**Planned Dinner**: A recipe placed on one day of a week plan.

_Avoid_: Meal, entry, slot

### Pantry and shopping

**Pantry Item**: Something the household has on hand, with an optional quantity.

_Avoid_: Stock, inventory, ingredient

**Shopping List**: The list of things to buy for one week: the ingredients the week's planned
dinners need, minus what's in the pantry, plus manual items.

_Avoid_: Grocery list

**Generated Item**: A shopping list item worked out from the week's planned dinners. It comes and
goes as the plan or pantry changes.

_Avoid_: Auto item

**Manual Item**: A shopping list item someone added by hand. The plan never removes it.

_Avoid_: Custom item, extra

**Restock**: Ticking a shopping list item, which adds it to the pantry.

_Avoid_: Check off, purchase

**Aisle**: The store section a shopping list item is grouped under.

_Avoid_: Category, department
