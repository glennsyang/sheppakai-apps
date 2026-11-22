# Glossary Map

## Contexts

- [Meal Planner](./apps/mealplanner/GLOSSARY.md): pantry-driven dinner planning, recipes and the weekly shopping list
- [Budget](./apps/budget/GLOSSARY.md): household spending, budgets, recurring bills, savings and the window-cleaning books
- [Synapse](./apps/synapse/GLOSSARY.md): one person's agenda, tasks, journal, mood, fitness, meditation and shepherding visits

## Relationships

- **Meal Planner → Synapse**: Synapse's morning digest shows today's Planned Dinner, read from Meal Planner's API
- **Budget → Synapse**: Synapse's morning digest shows Recurring Bills due this week, read from Budget's API
- **Meal Planner ↔ Budget**: both define **Household** the same way: the two people who share all of the app's data
- **Synapse is personal**: unlike Meal Planner and Budget, nothing in Synapse is shared, so it has no Household
- **Synapse Food Entry ≠ Meal Planner Planned Dinner**: a Food Entry is what you ate; a Planned Dinner is what's planned. One never becomes the other automatically
