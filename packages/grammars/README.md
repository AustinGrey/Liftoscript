# Grammars

The grammars for various parts of liftoscript. Different grammars are for different purposes

- workout-plan
  - Describes one or more workouts, each a collection of exercises, and how those workouts build off themselves or eachother over time.
- logic
  - Other grammars may have need to let custom logic be specified. E.g. workout plans need to allow using custom logic for defining complex progression formulas.
  - This grammar is for the syntax of custom logic

# Regenerate the grammars

- Run `vpx @lezer/generator ./src/grammar-sources/logic.grammar -o ./src/grammars/logic.ts --typeScript --names` and `vpx @lezer/generator ./src/grammar-sources/workout-plan.grammar -o ./src/grammars/workout-plan.ts --typeScript --names`
  - For some reason this doesn't seem to work when done from the package.json action defined.