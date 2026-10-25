import type { QuestDifficulty, QuestCategory } from '../types';

export interface ChallengeTestCase {
  inputDescription: string;
  args: any[];
  expected: any;
  explanation?: string;
  callArg?: any;
}

export interface LessonContent {
  conceptExplanation: string;
  codeExample: string;
  workedExample: {
    input: string;
    steps: string[];
    output: any;
  };
  commonMistakes: string[];
  progressiveHints: string[];
}

export interface PythonChallenge {
  id: string;
  questId: string;
  title: string;
  difficulty: QuestDifficulty;
  category: QuestCategory;
  xpReward: number;
  estimatedMinutes: number;
  description: string;
  storyIntro: string;
  prerequisiteIds: string[];
  learningObjectives: string[];
  constraints: string[];
  hints: string[];
  functionName: string;
  starterCode: string;
  sampleTests: ChallengeTestCase[];
  lesson?: LessonContent;
  practiceChallengeId?: string;
  conceptId?: string;
  isPractice?: boolean;
}

export const pythonChallenges: PythonChallenge[] = [
  {
    id: 'py-01',
    questId: 'quest-001',
    title: 'The Awakening: Mana Calculation',
    difficulty: 'E',
    category: 'fundamentals',
    xpReward: 100,
    estimatedMinutes: 15,
    storyIntro:
      'After the double dungeon trial, you awakened as a Player with a mysterious blue status window. Your mana pool scales directly with your intellect stat.',
    description:
      'Write a function `calculate_mana(base_mana, intellect)` that calculates a hunter\'s total mana using the formula:\n\n`total_mana = base_mana + (intellect * 10)`\n\nReturn the computed integer value.',
    prerequisiteIds: [],
    practiceChallengeId: 'py-01-practice',
    conceptId: 'variables',
    learningObjectives: [
      'Define functions and accept integer parameters in Python',
      'Use arithmetic operators (+, *)',
      'Return integer values from functions',
    ],
    constraints: [
      '0 <= base_mana <= 100,000',
      '0 <= intellect <= 5,000',
      'All inputs are guaranteed to be integers',
    ],
    hints: [
      'Multiplication in Python has higher precedence than addition: `base_mana + intellect * 10`.',
      'Make sure to use the `return` keyword to return the calculated result.',
    ],
    functionName: 'calculate_mana',
    starterCode: `def calculate_mana(base_mana: int, intellect: int) -> int:
    """
    Calculate the hunter's total mana pool.
    Formula: base_mana + (intellect * 10)
    """
    # Write your code here
    pass
`,
    sampleTests: [
      {
        inputDescription: 'base_mana = 100, intellect = 5',
        args: [100, 5],
        expected: 150,
        explanation: '100 + (5 * 10) = 150 mana.',
      },
      {
        inputDescription: 'base_mana = 50, intellect = 0',
        args: [50, 0],
        expected: 50,
        explanation: '50 + (0 * 10) = 50 mana.',
      },
      {
        inputDescription: 'base_mana = 200, intellect = 12',
        args: [200, 12],
        expected: 320,
        explanation: '200 + (12 * 10) = 320 mana.',
      },
    ],
    lesson: {
      conceptExplanation: 'Variables are containers for storing data values. In Python, you don\'t need to declare variable types explicitly - Python infers them automatically. This is called dynamic typing. Arithmetic operators like + and * follow standard mathematical precedence rules.',
      codeExample: `# Simple variable assignment
base_mana = 100
intellect = 5

# Arithmetic operations
total = base_mana + (intellect * 10)
print(total)  # Output: 150`,
      workedExample: {
        input: 'base_mana = 100, intellect = 5',
        steps: [
          'Step 1: Multiply intellect by 10: 5 * 10 = 50',
          'Step 2: Add to base_mana: 100 + 50 = 150',
          'Step 3: Return the result: 150'
        ],
        output: 150
      },
      commonMistakes: [
        'Forgetting to use the return statement - the function will return None',
        'Incorrect operator precedence - multiplication happens before addition',
        'Not using the function parameters correctly',
        'Trying to modify the parameters instead of calculating a new value'
      ],
      progressiveHints: [
        'The formula is: base_mana plus (intellect multiplied by 10)',
        'Use the + operator for addition and * for multiplication',
        'Remember that multiplication has higher precedence than addition, so you need parentheses',
        'Make sure to return the calculated value using the return keyword'
      ]
    },
  },

  {
    id: 'py-02',
    questId: 'quest-002',
    title: 'Rank Identifier: Gate Thresholds',
    difficulty: 'E',
    category: 'fundamentals',
    xpReward: 120,
    estimatedMinutes: 20,
    storyIntro:
      'The Hunter Association measures mana power levels to classify hunters into ranks before clearing dangerous dungeon gates.',
    description:
      'Write a function `identify_rank(power_level)` that returns the hunter\'s rank string based on their power level:\n\n' +
      '- `power_level < 100`: return `"E"`\n' +
      '- `100 <= power_level <= 249`: return `"D"`\n' +
      '- `250 <= power_level <= 499`: return `"C"`\n' +
      '- `500 <= power_level <= 999`: return `"B"`\n' +
      '- `1000 <= power_level <= 1999`: return `"A"`\n' +
      '- `power_level >= 2000`: return `"S"`',
    prerequisiteIds: ['py-01'],
    practiceChallengeId: 'py-02-practice',
    conceptId: 'conditionals',
    learningObjectives: [
      'Master conditional branching with `if`, `elif`, and `else`',
      'Use comparison operators (`<`, `<=`, `>=`, `==`)',
      'Handle boundary conditions accurately',
    ],
    constraints: [
      '0 <= power_level <= 1,000,000',
      'power_level is a non-negative integer',
    ],
    lesson: {
      conceptExplanation: 'Conditional statements allow your code to make decisions. In Python, we use if, elif (else if), and else to execute different code blocks based on conditions. Comparison operators like <, <=, >, >=, ==, and != are used to evaluate conditions.',
      codeExample: `# Conditional branching
power_level = 150

if power_level < 100:
    rank = 'E'
elif power_level <= 249:
    rank = 'D'
elif power_level <= 499:
    rank = 'C'
else:
    rank = 'B'

print(rank)  # Output: D`,
      workedExample: {
        input: 'power_level = 150',
        steps: [
          'Step 1: Check if power_level < 100? 150 < 100 is False',
          'Step 2: Check elif power_level <= 249? 150 <= 249 is True',
          'Step 3: Return rank = "D"'
        ],
        output: 'D'
      },
      commonMistakes: [
        'Using assignment (=) instead of comparison (==)',
        'Not handling boundary conditions correctly (off-by-one errors)',
        'Forgetting to use elif and using multiple if statements instead',
        'Not covering all possible ranges with an else clause'
      ],
      progressiveHints: [
        'You need to check the power_level against different ranges using if/elif/else',
        'Start from the lowest rank or highest rank - either approach works',
        'Be careful with boundary values - check if 100 should be E or D',
        'Use comparison operators: < for less than, <= for less than or equal to'
      ]
    },
    hints: [
      'You need to check the power_level against different ranges using if/elif/else',
      'Start from the lowest rank or highest rank - either approach works',
      'Be careful with boundary values - check if 100 should be E or D',
      'Use comparison operators: < for less than, <= for less than or equal to'
    ],
    functionName: 'identify_rank',
    starterCode: `def identify_rank(power_level: int) -> str:
    """
    Classify the hunter's rank based on their measured power level.
    Returns: 'E', 'D', 'C', 'B', 'A', or 'S'
    """
    # Write your code here
    pass
`,
    sampleTests: [
      {
        inputDescription: 'power_level = 50',
        args: [50],
        expected: 'E',
        explanation: 'Power level < 100 qualifies as E-Rank.',
      },
      {
        inputDescription: 'power_level = 150',
        args: [150],
        expected: 'D',
        explanation: '150 is between 100 and 249, qualifying as D-Rank.',
      },
      {
        inputDescription: 'power_level = 1200',
        args: [1200],
        expected: 'A',
        explanation: '1200 is between 1000 and 1999, qualifying as A-Rank.',
      },
      {
        inputDescription: 'power_level = 2500',
        args: [2500],
        expected: 'S',
        explanation: 'Power level >= 2000 is S-Rank.',
      },
    ],
  },

  {
    id: 'py-03',
    questId: 'quest-003',
    title: 'Inventory Purification: Data Types',
    difficulty: 'E',
    category: 'fundamentals',
    xpReward: 150,
    estimatedMinutes: 20,
    storyIntro:
      'When dungeon monsters drop loot, the inventory system automatically formats the item card for the hunter\'s UI display.',
    description:
      'Write a function `format_item(name, rarity, quantity)` that takes an item name (string), its rarity (string), and quantity (integer).\n\n' +
      'Return a formatted string in the format:\n' +
      '`"[RARITY] Item Name xQuantity"`\n\n' +
      'Where:\n' +
      '- `RARITY` is converted to all uppercase letters (e.g. `"rare"` -> `"RARE"`).\n' +
      '- `Item Name` is capitalized in title case (e.g. `"shadow dagger"` -> `"Shadow Dagger"`).\n' +
      '- `xQuantity` appends `"x"` followed by the integer count.',
    prerequisiteIds: ['py-01'],
    practiceChallengeId: 'py-03-practice',
    conceptId: 'strings',
    learningObjectives: [
      'Manipulate strings with `.upper()` and `.title()`',
      'Format strings cleanly using f-strings',
      'Combine multiple data types (string and integer) into text output',
    ],
    constraints: [
      'name is a non-empty string',
      'rarity is a lowercase string',
      'quantity is an integer >= 1',
    ],
    hints: [
      'Use Python f-strings: `f"[{rarity.upper()}] {name.title()} x{quantity}"`.',
      'The `.title()` method automatically capitalizes each word in a string.',
    ],
    lesson: {
      conceptExplanation: 'Strings are sequences of characters in Python. You can manipulate them using built-in methods like .upper() for uppercase, .lower() for lowercase, and .title() for title case. F-strings (formatted string literals) allow you to embed expressions inside string literals using curly braces.',
      codeExample: `# String manipulation with methods
name = 'shadow dagger'
rarity = 'rare'
quantity = 2

# Convert rarity to uppercase
rarity_upper = rarity.upper()  # 'RARE'

# Convert name to title case
name_title = name.title()  # 'Shadow Dagger'

# Format with f-string
formatted = f"[{rarity_upper}] {name_title} x{quantity}"
print(formatted)  # Output: [RARE] Shadow Dagger x2`,
      workedExample: {
        input: 'name="shadow dagger", rarity="rare", quantity=2',
        steps: [
          'Step 1: Convert rarity to uppercase: "rare" -> "RARE"',
          'Step 2: Convert name to title case: "shadow dagger" -> "Shadow Dagger"',
          'Step 3: Format string: "[RARE] Shadow Dagger x2"'
        ],
        output: '[RARE] Shadow Dagger x2'
      },
      commonMistakes: [
        'Forgetting to call the method - using .upper instead of .upper()',
        'Not using f-strings correctly - missing curly braces or quotes',
        'Trying to modify the original string instead of creating a new one',
        'Mixing up .title() with .upper() or .capitalize()'
      ],
      progressiveHints: [
        'Use string methods to transform the text: .upper() and .title()',
        'F-strings let you combine variables into a string: f"[{var}] {other_var}"',
        'The format should be: [RARITY] Item Name xQuantity',
        'Make sure to call the methods with parentheses: rarity.upper() not rarity.upper'
      ]
    },
    functionName: 'format_item',
    starterCode: `def format_item(name: str, rarity: str, quantity: int) -> str:
    """
    Format item entry for hunter inventory.
    Format: '[RARITY] Item Name xQuantity'
    """
    # Write your code here
    pass
`,
    sampleTests: [
      {
        inputDescription: 'name="shadow dagger", rarity="rare", quantity=2',
        args: ['shadow dagger', 'rare', 2],
        expected: '[RARE] Shadow Dagger x2',
        explanation: 'Rarity capitalized to RARE, name title-cased, quantity x2.',
      },
      {
        inputDescription: 'name="mana potion", rarity="common", quantity=5',
        args: ['mana potion', 'common', 5],
        expected: '[COMMON] Mana Potion x5',
        explanation: 'Common mana potion with 5 units.',
      },
    ],
  },

  {
    id: 'py-04',
    questId: 'quest-004',
    title: 'Shadow Soldier Count: Loops & Iteration',
    difficulty: 'E',
    category: 'fundamentals',
    xpReward: 250,
    estimatedMinutes: 25,
    storyIntro:
      'The Shadow Monarch surveys extracted shadows. Only soldiers with positive battle power can fight in the shadow army.',
    description:
      'Write a function `sum_soldier_strengths(strengths)` that takes a list of integers representing soldier strengths.\n\n' +
      'Calculate and return the sum of all soldier strengths that are strictly greater than 0 (`> 0`).\n' +
      'If the list is empty or contains no positive values, return `0`.',
    prerequisiteIds: ['py-02'],
    practiceChallengeId: 'py-04-practice',
    conceptId: 'loops',
    learningObjectives: [
      'Iterate over lists using `for` loops',
      'Filter elements with conditional statements',
      'Accumulate totals in an accumulator variable',
    ],
    constraints: [
      '0 <= len(strengths) <= 10,000',
      '-1,000 <= strengths[i] <= 1,000',
    ],
    hints: [
      'Initialize `total = 0` before looping through `strengths`.',
      'Only add `s` to `total` if `s > 0`.',
    ],
    lesson: {
      conceptExplanation: 'Loops allow you to iterate over sequences like lists. A for loop iterates over each element in a list, executing code for each item. You can use conditional statements inside loops to filter or transform elements.',
      codeExample: `# Summing positive values from a list
strengths = [10, -5, 20, 0, 15]
total = 0

for strength in strengths:
    if strength > 0:
        total += strength

print(total)  # Output: 45`,
      workedExample: {
        input: 'strengths = [10, -5, 15, 0, 25]',
        steps: [
          'Step 1: Initialize total = 0',
          'Step 2: Loop through each strength value',
          'Step 3: If strength > 0, add to total',
          'Step 4: Return total'
        ],
        output: 50
      },
      commonMistakes: [
        'Forgetting to initialize the accumulator variable before the loop',
        'Using = instead of += for accumulation',
        'Not checking the condition correctly (>= instead of >)',
        'Iterating over indices instead of values when you only need values'
      ],
      progressiveHints: [
        'Initialize a variable to store the sum, then loop through the list',
        'Use a for loop: for strength in strengths:',
        'Add a condition to only include values greater than 0',
        'Use += to add to your running total'
      ]
    },
    functionName: 'sum_soldier_strengths',
    starterCode: `def sum_soldier_strengths(strengths: list[int]) -> int:
    """
    Sum the battle power of all extracted soldiers with power > 0.
    """
    # Write your code here
    pass
`,
    sampleTests: [
      {
        inputDescription: 'strengths = [10, 20, 30]',
        args: [[10, 20, 30]],
        expected: 60,
        explanation: 'All values positive: 10 + 20 + 30 = 60.',
      },
      {
        inputDescription: 'strengths = [-5, 15, 0, 25]',
        args: [[-5, 15, 0, 25]],
        expected: 40,
        explanation: 'Negative (-5) and zero (0) are ignored: 15 + 25 = 40.',
      },
      {
        inputDescription: 'strengths = []',
        args: [[]],
        expected: 0,
        explanation: 'Empty list returns 0.',
      },
    ],
  },

  {
    id: 'py-05',
    questId: 'quest-005',
    title: 'Dungeon Key Generator: Even/Odd Logic',
    difficulty: 'E',
    category: 'fundamentals',
    xpReward: 250,
    estimatedMinutes: 25,
    storyIntro:
      'Ancient abyss runes require harmonized resonant keys. Only even-numbered key frequencies stabilize the dungeon seal.',
    description:
      'Write a function `filter_even_keys(keys)` that takes a list of integers and returns a NEW list containing only the even integers in their original order.\n\n' +
      'An integer `n` is even if `n % 2 == 0`.',
    prerequisiteIds: ['py-02', 'py-04'],
    practiceChallengeId: 'py-05-practice',
    conceptId: 'arrays',
    learningObjectives: [
      'Use the modulo operator `%` to test parity (even vs odd)',
      'Construct a new list by appending elements',
      'Understand list comprehensions or filter accumulation in Python',
    ],
    constraints: [
      '0 <= len(keys) <= 5,000',
      '-10,000 <= keys[i] <= 10,000',
    ],
    hints: [
      'An integer `k` is even if `k % 2 == 0`.',
      'List comprehension syntax: `[k for k in keys if k % 2 == 0]`.',
    ],
    lesson: {
      conceptExplanation: 'List comprehensions provide a concise way to create lists in Python. They combine iteration and filtering into a single expression. The modulo operator % returns the remainder of division - n % 2 == 0 checks if n is even.',
      codeExample: `# Using list comprehension to filter evens
keys = [1, 2, 3, 4, 5, 6]

# Filter: keep only even numbers
even_keys = [k for k in keys if k % 2 == 0]
print(even_keys)  # Output: [2, 4, 6]`,
      workedExample: {
        input: 'keys = [1, 2, 3, 4, 5, 6]',
        steps: [
          'Step 1: Check each key if key % 2 == 0 (even)',
          'Step 2: 1%2=1(odd), 2%2=0(even), 3%2=1(odd), 4%2=0(even), 5%2=1(odd), 6%2=0(even)',
          'Step 3: Collect evens: [2, 4, 6]'
        ],
        output: [2, 4, 6]
      },
      commonMistakes: [
        'Forgetting the modulo operator %',
        'Using = instead of == in the condition',
        'Not returning a new list but modifying the original',
        'Forgetting to handle empty lists'
      ],
      progressiveHints: [
        'Use the modulo operator to check if a number is even: n % 2 == 0',
        'Create a new list using list comprehension: [item for item in list if condition]',
        'Iterate through keys and only include those where key % 2 equals 0',
        'Remember that 0 is considered even (0 % 2 == 0)'
      ]
    },
    functionName: 'filter_even_keys',
    starterCode: `def filter_even_keys(keys: list[int]) -> list[int]:
    """
    Return a list of only the even integers from the input list.
    """
    # Write your code here
    pass
`,
    sampleTests: [
      {
        inputDescription: 'keys = [1, 2, 3, 4, 5, 6]',
        args: [[1, 2, 3, 4, 5, 6]],
        expected: [2, 4, 6],
        explanation: 'Only 2, 4, and 6 are divisible by 2.',
      },
      {
        inputDescription: 'keys = [1, 3, 5]',
        args: [[1, 3, 5]],
        expected: [],
        explanation: 'No even keys present, returns empty list [].',
      },
      {
        inputDescription: 'keys = [10, 20, 30]',
        args: [[10, 20, 30]],
        expected: [10, 20, 30],
        explanation: 'All keys are even.',
      },
    ],
  },

  {
    id: 'py-06',
    questId: 'quest-006',
    title: 'The Double Dungeon: While Loop Countdown',
    difficulty: 'D',
    category: 'algorithms',
    xpReward: 300,
    estimatedMinutes: 30,
    storyIntro:
      'Inside the Cartenon Temple, the giant statue periodically fires deadly beams from its eyes. You must calculate the exact number of countdown ticks survived before seeking shelter.',
    description:
      'Write a function `survive_statue_countdown(statue_timer, step)` where:\n\n' +
      '- `statue_timer` is the initial countdown seconds.\n' +
      '- `step` is the seconds depleted on each tick.\n\n' +
      'Using a `while` loop, decrease the timer by `step` on each iteration until `statue_timer <= 0`. Return the total number of ticks survived.\n' +
      'If `statue_timer <= 0` initially, return `0`.',
    prerequisiteIds: ['py-04'],
    practiceChallengeId: 'py-06-practice',
    conceptId: 'loops',
    learningObjectives: [
      'Implement `while` loops with dynamic termination conditions',
      'Maintain iteration counters',
      'Handle zero and negative initial value edge cases',
    ],
    constraints: [
      '-100 <= statue_timer <= 1,000,000',
      '1 <= step <= 100,000',
    ],
    hints: [
      'Initialize `ticks = 0`. While `statue_timer > 0`, subtract `step` and increment `ticks`.',
      'Check if `statue_timer <= 0` at the very start to immediately return 0.',
    ],
    lesson: {
      conceptExplanation: 'While loops repeat code as long as a condition is true. They\'re useful when you don\'t know in advance how many iterations you need. Always include a way for the condition to become false, or you\'ll create an infinite loop.',
      codeExample: `# Countdown with while loop
timer = 10
step = 3
ticks = 0

while timer > 0:
    timer -= step
    ticks += 1

print(ticks)  # Output: 4`,
      workedExample: {
        input: 'timer=10, step=3',
        steps: [
          'Step 1: Initialize ticks = 0',
          'Step 2: While timer > 0: 10 > 0 is True',
          'Step 3: tick 1: timer = 10-3=7, ticks=1',
          'Step 4: tick 2: timer = 7-3=4, ticks=2',
          'Step 5: tick 3: timer = 4-3=1, ticks=3',
          'Step 6: tick 4: timer = 1-3=-2, ticks=4',
          'Step 7: timer > 0 is False, exit loop',
          'Step 8: Return ticks = 4'
        ],
        output: 4
      },
      commonMistakes: [
        'Forgetting to initialize the counter before the loop',
        'Not updating the loop variable inside the loop (infinite loop)',
        'Using the wrong comparison operator (> instead of >=)',
        'Forgetting to handle the case when timer is already <= 0'
      ],
      progressiveHints: [
        'Initialize a counter variable to track iterations',
        'Use a while loop with condition timer > 0',
        'Inside the loop: subtract step from timer and increment counter',
        'Check if timer <= 0 at the start to return 0 immediately'
      ]
    },
    functionName: 'survive_statue_countdown',
    starterCode: `def survive_statue_countdown(statue_timer: int, step: int) -> int:
    """
    Count how many countdown ticks occur before statue_timer reaches 0 or less.
    """
    # Write your code here
    pass
`,
    sampleTests: [
      {
        inputDescription: 'statue_timer = 10, step = 3',
        args: [10, 3],
        expected: 4,
        explanation: 'Tick 1: 7, Tick 2: 4, Tick 3: 1, Tick 4: -2 (<=0). Total 4 ticks.',
      },
      {
        inputDescription: 'statue_timer = 5, step = 5',
        args: [5, 5],
        expected: 1,
        explanation: 'Tick 1: 0 (<=0). Total 1 tick.',
      },
      {
        inputDescription: 'statue_timer = 0, step = 2',
        args: [0, 2],
        expected: 0,
        explanation: 'Timer is already 0, returns 0 ticks.',
      },
    ],
  },

  {
    id: 'py-07',
    questId: 'quest-007',
    title: 'Potion Brewer: Dictionary & Mapping',
    difficulty: 'D',
    category: 'data-structures',
    xpReward: 350,
    estimatedMinutes: 30,
    storyIntro:
      'Alchemy shops sell crafting reagents by unit price. The Hunter guild needs an automatic cost calculator for brewing large batches of restoration potions.',
    description:
      'Write a function `calculate_potion_cost(recipe, prices)` that computes the total gold cost to brew a potion.\n\n' +
      '- `recipe`: a dictionary mapping ingredient name (str) to quantity needed (int).\n' +
      '- `prices`: a dictionary mapping ingredient name (str) to price per unit (int).\n\n' +
      'For each ingredient in `recipe`, multiply its quantity by its unit price in `prices`.\n' +
      'If an ingredient is not present in `prices`, its cost is treated as `0`.\n' +
      'Return the total integer cost.',
    prerequisiteIds: ['py-03', 'py-04'],
    practiceChallengeId: 'py-07-practice',
    conceptId: 'dictionaries',
    learningObjectives: [
      'Iterate over dictionary keys and values with `.items()`',
      'Safely retrieve dictionary values using `.get(key, default)`',
      'Compute weighted totals across mapped data structures',
    ],
    constraints: [
      '0 <= len(recipe) <= 1,000',
      '0 <= len(prices) <= 5,000',
      'All quantities and prices are non-negative integers',
    ],
    hints: [
      'Loop over `recipe.items()`: `for ingredient, qty in recipe.items():`',
      'Use `prices.get(ingredient, 0)` to default missing prices to 0 gold.',
    ],
    lesson: {
      conceptExplanation: 'Dictionaries (dicts) store key-value pairs in Python. You can iterate over dictionary items using .items() to get both keys and values. The .get(key, default) method safely retrieves values, returning a default if the key doesn\'t exist.',
      codeExample: `# Dictionary iteration and safe access
recipe = {'herb': 3, 'crystal': 2}
prices = {'herb': 10, 'crystal': 50}

total = 0
for ingredient, qty in recipe.items():
    price = prices.get(ingredient, 0)  # Safe access
    total += qty * price

print(total)  # Output: 130`,
      workedExample: {
        input: "recipe={'herb': 3, 'crystal': 2}, prices={'herb': 10, 'crystal': 50}",
        steps: [
          'Step 1: Iterate recipe items: (herb, 3), (crystal, 2)',
          'Step 2: herb: 3 * prices.get(herb, 0) = 3 * 10 = 30',
          'Step 3: crystal: 2 * prices.get(crystal, 0) = 2 * 50 = 100',
          'Step 4: total = 30 + 100 = 130'
        ],
        output: 130
      },
      commonMistakes: [
        'Using recipe[key] instead of .get() which raises KeyError for missing keys',
        'Forgetting to multiply quantity by price',
        'Not initializing the total variable',
        'Iterating over keys only and looking up values separately'
      ],
      progressiveHints: [
        'Use .items() to iterate over both keys and values in the recipe',
        'Use .get(key, 0) to safely look up prices, defaulting to 0 if missing',
        'Multiply quantity by price for each ingredient',
        'Accumulate the total cost and return it'
      ]
    },
    functionName: 'calculate_potion_cost',
    starterCode: `def calculate_potion_cost(recipe: dict[str, int], prices: dict[str, int]) -> int:
    """
    Calculate the total gold cost for the potion recipe.
    Missing ingredients in prices default to 0 gold.
    """
    # Write your code here
    pass
`,
    sampleTests: [
      {
        inputDescription: "recipe={'herb': 3, 'crystal': 2}, prices={'herb': 10, 'crystal': 50}",
        args: [
          { herb: 3, crystal: 2 },
          { herb: 10, crystal: 50 },
        ],
        expected: 130,
        explanation: '(3 * 10) + (2 * 50) = 30 + 100 = 130 gold.',
      },
      {
        inputDescription: "recipe={'herb': 2, 'dragon_scale': 1}, prices={'herb': 15}",
        args: [
          { herb: 2, dragon_scale: 1 },
          { herb: 15 },
        ],
        expected: 30,
        explanation: 'dragon_scale is not in prices (0 gold). (2 * 15) + (1 * 0) = 30 gold.',
      },
    ],
  },

  {
    id: 'py-08',
    questId: 'quest-008',
    title: 'Shadow Extraction: List Manipulation & Reversal',
    difficulty: 'D',
    category: 'data-structures',
    xpReward: 400,
    estimatedMinutes: 35,
    storyIntro:
      'When leading an assault, shadow commanders deploy in reverse order of extraction so the newest elite vanguard leads the frontline charge.',
    description:
      'Write a function `reverse_squad_order(squad)` that takes a list of soldier names (strings) and returns a NEW list with the soldiers in reverse order.\n\n' +
      'Do not mutate the original `squad` list.',
    prerequisiteIds: ['py-04', 'py-05'],
    practiceChallengeId: 'py-08-practice',
    conceptId: 'arrays',
    learningObjectives: [
      'Apply list slicing `[::-1]` or `.copy()` techniques',
      'Preserve input data immutability',
      'Work with collections of string values',
    ],
    constraints: [
      '0 <= len(squad) <= 10,000',
      'All soldier names are strings',
    ],
    hints: [
      'In Python, list slicing with a negative step `squad[::-1]` creates a reversed copy.',
      'Alternatively, `list(reversed(squad))` returns a new reversed list without mutating the original.',
    ],
    lesson: {
      conceptExplanation: 'List slicing allows you to extract portions of lists. The syntax [start:stop:step] lets you specify start index, stop index, and step size. Using a negative step like [::-1] creates a reversed copy of the list without modifying the original.',
      codeExample: `# Reversing a list with slicing
squad = ['Igris', 'Tank', 'Iron', 'Beru']

# Create a reversed copy
reversed_squad = squad[::-1]
print(reversed_squad)  # Output: ['Beru', 'Iron', 'Tank', 'Igris']

# Original is unchanged
print(squad)  # Output: ['Igris', 'Tank', 'Iron', 'Beru']`,
      workedExample: {
        input: "squad = ['Igris', 'Tank', 'Iron', 'Beru']",
        steps: [
          'Step 1: Use slicing with step -1: squad[::-1]',
          'Step 2: This reads the list backwards',
          'Step 3: Result: [\'Beru\', \'Iron\', \'Tank\', \'Igris\']'
        ],
        output: ['Beru', 'Iron', 'Tank', 'Igris']
      },
      commonMistakes: [
        'Using .reverse() which modifies the list in-place',
        'Trying to manually reverse with a loop instead of using slicing',
        'Forgetting that slicing creates a new list (which is what we want)',
        'Using incorrect slice notation like [::-2] which skips elements'
      ],
      progressiveHints: [
        'Use list slicing with a negative step to reverse: list[::-1]',
        'The ::-1 slice means: start at end, go to beginning, step by -1',
        'This creates a new list without modifying the original',
        'Alternatively, use list(reversed(squad)) for a more explicit approach'
      ]
    },
    functionName: 'reverse_squad_order',
    starterCode: `def reverse_squad_order(squad: list[str]) -> list[str]:
    """
    Return a new list containing the squad members in reverse order.
    Do not modify the input list.
    """
    # Write your code here
    pass
`,
    sampleTests: [
      {
        inputDescription: "squad = ['Igris', 'Tank', 'Iron', 'Beru']",
        args: [['Igris', 'Tank', 'Iron', 'Beru']],
        expected: ['Beru', 'Iron', 'Tank', 'Igris'],
        explanation: 'Reversed order: Beru at index 0, Igris at end.',
      },
      {
        inputDescription: "squad = ['Soldier_A']",
        args: [['Soldier_A']],
        expected: ['Soldier_A'],
        explanation: 'Single element list reverses to itself.',
      },
      {
        inputDescription: 'squad = []',
        args: [[]],
        expected: [],
        explanation: 'Empty list reverses to empty list.',
      },
    ],
  },

  {
    id: 'py-09',
    questId: 'quest-009',
    title: "Monarch's Command: Higher-Order Functions",
    difficulty: 'C',
    category: 'fundamentals',
    xpReward: 500,
    estimatedMinutes: 40,
    storyIntro:
      'The Shadow Monarch bestows permanent battle buffs. A commander aura multiplies the base damage of any unit placed under its command.',
    description:
      'Write a function `create_multiplier(factor)` that returns an inner function.\n\n' +
      'The returned inner function should take a single integer `damage` and return `damage * factor`.\n\n' +
      'Example:\n' +
      '```python\n' +
      'double_strike = create_multiplier(2)\n' +
      'double_strike(50)  # returns 100\n' +
      'triple_strike = create_multiplier(3)\n' +
      'triple_strike(50)  # returns 150\n' +
      '```',
    prerequisiteIds: ['py-01', 'py-06'],
    practiceChallengeId: 'py-09-practice',
    conceptId: 'functions',
    learningObjectives: [
      'Understand first-class functions in Python',
      'Construct closures that capture outer scope variables (`factor`)',
      'Return callable objects from functions',
    ],
    constraints: [
      '-1,000 <= factor <= 1,000',
      '-100,000 <= damage <= 100,000',
    ],
    hints: [
      'Define an inner function `def apply_buff(damage): return damage * factor` inside `create_multiplier`.',
      'Return the function object itself (`return apply_buff`), without calling it with parentheses.',
    ],
    lesson: {
      conceptExplanation: 'In Python, functions are first-class objects - they can be passed as arguments, returned from other functions, and assigned to variables. A closure is a function that remembers variables from its enclosing scope even after the outer function has finished.',
      codeExample: `# Higher-order function returning a closure
def create_multiplier(factor):
    def apply_buff(damage):
        return damage * factor
    return apply_buff  # Return the function, not call it

double = create_multiplier(2)
print(double(50))  # Output: 100`,
      workedExample: {
        input: 'factor=3, applied to damage=50',
        steps: [
          'Step 1: create_multiplier(3) defines inner function with factor=3',
          'Step 2: The inner function remembers factor=3 (closure)',
          'Step 3: When called with damage=50: 50 * 3 = 150',
          'Step 4: Return 150'
        ],
        output: 150
      },
      commonMistakes: [
        'Calling the inner function instead of returning it: return apply_buff()',
        'Forgetting to define the inner function inside the outer function',
        'Not using the captured variable in the inner function',
        'Trying to use the outer function directly instead of the returned inner function'
      ],
      progressiveHints: [
        'Define an inner function inside create_multiplier that takes damage as parameter',
        'The inner function should return damage * factor (factor is from outer scope)',
        'Return the inner function object itself, not the result of calling it',
        'The returned function can then be called with a damage value'
      ]
    },
    functionName: 'create_multiplier',
    starterCode: `def create_multiplier(factor: int):
    """
    Return a function that multiplies its argument by factor.
    """
    # Write your code here
    pass
`,
    sampleTests: [
      {
        inputDescription: 'factor = 3, applied to damage = 50',
        args: [3],
        callArg: 50,
        expected: 150,
        explanation: '3 * 50 = 150.',
      },
      {
        inputDescription: 'factor = 0, applied to damage = 100',
        args: [0],
        callArg: 100,
        expected: 0,
        explanation: '0 * 100 = 0.',
      },
    ],
  },

  {
    id: 'py-10',
    questId: 'quest-010',
    title: 'Abyss Boss: Recursive Power Surge',
    difficulty: 'C',
    category: 'algorithms',
    xpReward: 600,
    estimatedMinutes: 45,
    storyIntro:
      'The Architect\'s system calculates dungeon power surges using a recursive harmonic progression. Master this recurrence relation to anticipate the Monarch\'s aura.',
    description:
      'Write a function `calculate_surge_power(n)` that computes the power surge at wave `n` according to the recurrence relation:\n\n' +
      '- `f(0) = 0`\n' +
      '- `f(1) = 1`\n' +
      '- For `n >= 2`: `f(n) = f(n - 1) + 2 * f(n - 2)`\n\n' +
      'Return the calculated integer power for wave `n`.\n\n' +
      'Wave sequence examples:\n' +
      '- `n=0 -> 0`\n' +
      '- `n=1 -> 1`\n' +
      '- `n=2 -> 1 + 2*(0) = 1`\n' +
      '- `n=3 -> 1 + 2*(1) = 3`\n' +
      '- `n=4 -> 3 + 2*(1) = 5`\n' +
      '- `n=5 -> 5 + 2*(3) = 11`',
    prerequisiteIds: ['py-09', 'py-06'],
    practiceChallengeId: 'py-10-practice',
    conceptId: 'recursion',
    learningObjectives: [
      'Implement recurrence relations and mathematical sequences',
      'Apply base cases and recursive thinking or iterative dynamic programming',
      'Optimize algorithmic complexity for linear or memoized execution',
    ],
    constraints: [
      '0 <= n <= 30',
      'Result fits in standard integer precision',
    ],
    hints: [
      'Watch out for repeated computation if using naive recursion! Using an iterative loop `for _ in range(2, n + 1):` computes the answer in O(n) time with zero recursion overhead.',
      'Check `if n == 0: return 0` and `if n == 1: return 1` as base conditions.',
    ],
    lesson: {
      conceptExplanation: 'Recursion is when a function calls itself to solve smaller instances of the same problem. Every recursive function needs base cases (conditions that stop the recursion) and a recursive case that breaks down the problem. Without base cases, you get infinite recursion.',
      codeExample: `# Recursive function with base cases
def calculate_surge_power(n):
    # Base cases
    if n == 0:
        return 0
    if n == 1:
        return 1
    
    # Recursive case
    return calculate_surge_power(n - 1) + 2 * calculate_surge_power(n - 2)

print(calculate_surge_power(4))  # Output: 5`,
      workedExample: {
        input: 'n=4',
        steps: [
          'Step 1: n=4, not base case',
          'Step 2: return f(3) + 2*f(2)',
          'Step 3: f(3) = f(2) + 2*f(1) = 1 + 2*1 = 3',
          'Step 4: f(2) = f(1) + 2*f(0) = 1 + 2*0 = 1',
          'Step 5: return 3 + 2*1 = 5'
        ],
        output: 5
      },
      commonMistakes: [
        'Forgetting base cases leading to infinite recursion (stack overflow)',
        'Using the wrong recurrence formula',
        'Not handling negative numbers',
        'Trying to use iteration instead of recursion when recursion is required'
      ],
      progressiveHints: [
        'Define base cases for n=0 and n=1 first',
        'For the recursive case, use the formula: f(n-1) + 2*f(n-2)',
        'Make sure the function calls itself with smaller values',
        'The recursion will eventually reach the base cases and unwind'
      ]
    },
    functionName: 'calculate_surge_power',
    starterCode: `def calculate_surge_power(n: int) -> int:
    """
    Calculate power surge at wave n:
    f(0) = 0
    f(1) = 1
    f(n) = f(n-1) + 2*f(n-2) for n >= 2
    """
    # Write your code here
    pass
`,
    sampleTests: [
      {
        inputDescription: 'n = 0',
        args: [0],
        expected: 0,
        explanation: 'Base case f(0) = 0.',
      },
      {
        inputDescription: 'n = 1',
        args: [1],
        expected: 1,
        explanation: 'Base case f(1) = 1.',
      },
      {
        inputDescription: 'n = 2',
        args: [2],
        expected: 1,
        explanation: 'f(2) = f(1) + 2*f(0) = 1 + 0 = 1.',
      },
      {
        inputDescription: 'n = 3',
        args: [3],
        expected: 3,
        explanation: 'f(3) = f(2) + 2*f(1) = 1 + 2(1) = 3.',
      },
      {
        inputDescription: 'n = 4',
        args: [4],
        expected: 5,
        explanation: 'f(4) = f(3) + 2*f(2) = 3 + 2(1) = 5.',
      },
    ],
  },
];

/**
 * Find challenge by challenge ID or linked quest ID.
 */
export function getChallengeById(id: string): PythonChallenge | undefined {
  return pythonChallenges.find((c) => c.id === id || c.questId === id);
}
