# Glossary Map

## Contexts

- [Meal Planner](./apps/mealplanner/GLOSSARY.md): pantry-driven dinner planning, recipes and the weekly shopping list
- [Budget](./apps/budget/GLOSSARY.md): household spending, budgets, recurring bills, savings and the window-cleaning books

## Relationships

- **Meal Planner → Synapse**: Synapse's morning digest shows today's Planned Dinner, read from Meal Planner's API
- **Budget → Synapse**: Synapse's morning digest shows Recurring Bills due this week, read from Budget's API
- **Meal Planner ↔ Budget**: both define **Household** the same way: the two people who share all of the app's data
