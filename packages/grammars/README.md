# Grammars

The grammars for various parts of liftoscript. Different grammars are for different purposes

- workout-plan
  - Describes one or more workouts, each a collection of exercises, and how those workouts build off themselves or eachother over time.
- logic
  - Other grammars may have need to let custom logic be specified. E.g. workout plans need to allow using custom logic for defining complex progression formulas.
  - This grammar is for the syntax of custom logic

# Regenerate the grammars

- Run `vpx @lezer/generator ./src/grammar-definitions/logic.grammar -o ./src/parsers/logic.ts --typeScript --names` and
  `vpx @lezer/generator ./src/grammar-definitions/workout-plan.grammar -o ./src/parsers/workout-plan.ts --typeScript --names`
  - For some reason this doesn't seem to work when done from the package.json action defined.

# Knowledge Layers

To keep things clear, we try to structure the code according to the most basic layers of knowledge and avoid circular dependencies.

Earlier layers should be imported by later layers, but never vice versa.

## Layer 0 - Physics, biology/anatomy, hard definable realities.

- human body (muscles, areas, groups, etc) (see human-body)
- math on numbers with units (see quantities)

## Layer 1 - Common human concepts combining these realities.

- exercises (see ___)
- equipment (see ___)
- gyms (see ___)

## Layer 2 - Concepts that are unique to Liftoscript, or defined specifically beyond what would be considered common to everyone.

- workout plans
- progression scripts
- settings