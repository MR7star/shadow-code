/**
 * Server-Side Python Challenges Registry
 * Contains both public sample tests and SECRET hidden test cases.
 * Hidden tests are NEVER sent to the client.
 * Also includes structured lesson content for Learning Mode.
 */

export const serverChallenges = {
  'py-01': {
    id: 'py-01',
    questId: 'quest-001',
    title: 'The Awakening: Mana Calculation',
    functionName: 'calculate_mana',
    xpReward: 100,
    conceptId: 'variables',
    prerequisiteIds: [],
    practiceChallengeId: 'py-01-practice',
    lesson: {
      conceptExplanation: 'Variables are containers for storing data values. In Python, you don\'t need to declare variable types explicitly - Python infers them automatically. This is called dynamic typing.',
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
    sampleTests: [
      { args: [100, 5], expected: 150, description: 'base_mana=100, intellect=5' },
      { args: [50, 0], expected: 50, description: 'base_mana=50, intellect=0' },
      { args: [200, 12], expected: 320, description: 'base_mana=200, intellect=12' },
    ],
    hiddenTests: [
      { args: [0, 0], expected: 0, description: 'zero mana and zero intellect' },
      { args: [500, 100], expected: 1500, description: 'high rank intellect' },
      { args: [1, 1], expected: 11, description: 'minimal positive values' },
      { args: [10000, 500], expected: 15000, description: 'large magnitude values' },
    ],
  },

  'py-02': {
    id: 'py-02',
    questId: 'quest-002',
    title: 'Rank Identifier: Gate Thresholds',
    functionName: 'identify_rank',
    xpReward: 120,
    conceptId: 'conditionals',
    prerequisiteIds: ['py-01'],
    practiceChallengeId: 'py-02-practice',
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
    sampleTests: [
      { args: [50], expected: 'E', description: 'power_level=50 (<100)' },
      { args: [150], expected: 'D', description: 'power_level=150 (100-249)' },
      { args: [1200], expected: 'A', description: 'power_level=1200 (1000-1999)' },
      { args: [2500], expected: 'S', description: 'power_level=2500 (>=2000)' },
    ],
    hiddenTests: [
      { args: [0], expected: 'E', description: 'boundary: 0' },
      { args: [99], expected: 'E', description: 'boundary: 99' },
      { args: [100], expected: 'D', description: 'boundary: 100' },
      { args: [249], expected: 'D', description: 'boundary: 249' },
      { args: [250], expected: 'C', description: 'boundary: 250' },
      { args: [499], expected: 'C', description: 'boundary: 499' },
      { args: [500], expected: 'B', description: 'boundary: 500' },
      { args: [999], expected: 'B', description: 'boundary: 999' },
      { args: [1000], expected: 'A', description: 'boundary: 1000' },
      { args: [1999], expected: 'A', description: 'boundary: 1999' },
      { args: [2000], expected: 'S', description: 'boundary: 2000' },
      { args: [99999], expected: 'S', description: 'national monarch tier' },
    ],
  },

  'py-03': {
    id: 'py-03',
    questId: 'quest-003',
    title: 'Inventory Purification: Data Types',
    functionName: 'format_item',
    xpReward: 150,
    conceptId: 'strings',
    prerequisiteIds: ['py-01'],
    practiceChallengeId: 'py-03-practice',
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
    sampleTests: [
      { args: ['shadow dagger', 'rare', 2], expected: '[RARE] Shadow Dagger x2', description: 'Standard rare weapon' },
      { args: ['mana potion', 'common', 5], expected: '[COMMON] Mana Potion x5', description: 'Consumable item' },
    ],
    hiddenTests: [
      { args: ['kasaka venom fang', 'epic', 1], expected: '[EPIC] Kasaka Venom Fang x1', description: 'Epic boss drop' },
      { args: ['demon king daggers', 'legendary', 2], expected: '[LEGENDARY] Demon King Daggers x2', description: 'Legendary item' },
      { args: ['orb', 'mythic', 10], expected: '[MYTHIC] Orb x10', description: 'Single word item' },
    ],
  },

  'py-04': {
    id: 'py-04',
    questId: 'quest-004',
    title: 'Shadow Soldier Count: Loops & Iteration',
    functionName: 'sum_soldier_strengths',
    xpReward: 250,
    conceptId: 'loops',
    prerequisiteIds: ['py-02'],
    practiceChallengeId: 'py-04-practice',
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
    sampleTests: [
      { args: [[10, 20, 30]], expected: 60, description: 'All positive soldiers' },
      { args: [[-5, 15, 0, 25]], expected: 40, description: 'Filter zero and negatives' },
      { args: [[]], expected: 0, description: 'Empty shadow army' },
    ],
    hiddenTests: [
      { args: [[-10, -20, -30]], expected: 0, description: 'All negative values' },
      { args: [[0, 0, 0]], expected: 0, description: 'All zero values' },
      { args: [[100]], expected: 100, description: 'Single soldier' },
      { args: [[5, 10, 15, 20, 25, 30]], expected: 105, description: 'Multiple soldiers' },
    ],
  },

  'py-05': {
    id: 'py-05',
    questId: 'quest-005',
    title: 'Dungeon Key Generator: Even/Odd Logic',
    functionName: 'filter_even_keys',
    xpReward: 250,
    conceptId: 'arrays',
    prerequisiteIds: ['py-02', 'py-04'],
    practiceChallengeId: 'py-05-practice',
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
    sampleTests: [
      { args: [[1, 2, 3, 4, 5, 6]], expected: [2, 4, 6], description: 'Mixed integers' },
      { args: [[1, 3, 5]], expected: [], description: 'All odd keys' },
      { args: [[10, 20, 30]], expected: [10, 20, 30], description: 'All even keys' },
    ],
    hiddenTests: [
      { args: [[]], expected: [], description: 'Empty list' },
      { args: [[0]], expected: [0], description: 'Zero is even' },
      { args: [[-2, -1, 0, 1, 2]], expected: [-2, 0, 2], description: 'Negative and positive evens' },
      { args: [[7, 9, 11, 13]], expected: [], description: 'Only odds' },
    ],
  },

  'py-06': {
    id: 'py-06',
    questId: 'quest-006',
    title: 'The Double Dungeon: While Loop Countdown',
    functionName: 'survive_statue_countdown',
    xpReward: 300,
    conceptId: 'loops',
    prerequisiteIds: ['py-04'],
    practiceChallengeId: 'py-06-practice',
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
    sampleTests: [
      { args: [10, 3], expected: 4, description: '10 down by 3 -> (7, 4, 1, -2) = 4 ticks' },
      { args: [5, 5], expected: 1, description: '5 down by 5 -> 0 = 1 tick' },
      { args: [0, 2], expected: 0, description: 'Already 0 timer' },
    ],
    hiddenTests: [
      { args: [-10, 5], expected: 0, description: 'Negative timer' },
      { args: [100, 20], expected: 5, description: 'Exact divisibility' },
      { args: [1, 10], expected: 1, description: 'One large step' },
      { args: [1000, 1], expected: 1000, description: 'Single unit steps' },
    ],
  },

  'py-07': {
    id: 'py-07',
    questId: 'quest-007',
    title: 'Potion Brewer: Dictionary & Mapping',
    functionName: 'calculate_potion_cost',
    xpReward: 350,
    conceptId: 'dictionaries',
    prerequisiteIds: ['py-03', 'py-04'],
    practiceChallengeId: 'py-07-practice',
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
    sampleTests: [
      {
        args: [
          { 'herb': 3, 'crystal': 2 },
          { 'herb': 10, 'crystal': 50 }
        ],
        expected: 130,
        description: 'herb: 3*10=30, crystal: 2*50=100 -> 130'
      },
      {
        args: [
          { 'herb': 2, 'dragon_scale': 1 },
          { 'herb': 15 }
        ],
        expected: 30,
        description: 'dragon_scale not in price list (0) -> 30'
      },
    ],
    hiddenTests: [
      { args: [{}, { 'herb': 10 }], expected: 0, description: 'Empty recipe' },
      { args: [{ 'water': 10 }, {}], expected: 0, description: 'Empty prices' },
      {
        args: [
          { 'a': 5, 'b': 2, 'c': 1 },
          { 'a': 1, 'b': 10, 'c': 100, 'd': 500 }
        ],
        expected: 125,
        description: 'Multiple ingredients with extra price inventory'
      },
    ],
  },

  'py-08': {
    id: 'py-08',
    questId: 'quest-008',
    title: 'Shadow Extraction: List Manipulation & Reversal',
    functionName: 'reverse_squad_order',
    xpReward: 400,
    conceptId: 'arrays',
    prerequisiteIds: ['py-04', 'py-05'],
    practiceChallengeId: 'py-08-practice',
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
    sampleTests: [
      { args: [['Igris', 'Tank', 'Iron', 'Beru']], expected: ['Beru', 'Iron', 'Tank', 'Igris'], description: 'Named squad' },
      { args: [['Soldier_A']], expected: ['Soldier_A'], description: 'Single member squad' },
      { args: [[]], expected: [], description: 'Empty squad' },
    ],
    hiddenTests: [
      { args: [['1', '2', '3', '4', '5']], expected: ['5', '4', '3', '2', '1'], description: 'Five members' },
      { args: [['Alpha', 'Beta']], expected: ['Beta', 'Alpha'], description: 'Two members' },
    ],
  },

  'py-09': {
    id: 'py-09',
    questId: 'quest-009',
    title: "Monarch's Command: Higher-Order Functions",
    functionName: 'create_multiplier',
    xpReward: 500,
    conceptId: 'functions',
    prerequisiteIds: ['py-01', 'py-06'],
    practiceChallengeId: 'py-09-practice',
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
    sampleTests: [
      { args: [3], callArg: 50, expected: 150, description: 'multiplier=3, call with 50 -> 150' },
      { args: [0], callArg: 100, expected: 0, description: 'multiplier=0, call with 100 -> 0' },
    ],
    hiddenTests: [
      { args: [1], callArg: 42, expected: 42, description: 'identity multiplier' },
      { args: [-2], callArg: 15, expected: -30, description: 'negative multiplier' },
      { args: [10], callArg: 25, expected: 250, description: 'factor of 10' },
    ],
  },

  'py-10': {
    id: 'py-10',
    questId: 'quest-010',
    title: 'Abyss Boss: Recursive Power Surge',
    functionName: 'calculate_surge_power',
    xpReward: 600,
    conceptId: 'recursion',
    prerequisiteIds: ['py-04', 'py-06'],
    practiceChallengeId: 'py-10-practice',
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
    sampleTests: [
      { args: [0], expected: 0, description: 'Base case n=0' },
      { args: [1], expected: 1, description: 'Base case n=1' },
      { args: [2], expected: 1, description: 'f(2) = f(1) + 2*f(0) = 1 + 0 = 1' },
      { args: [3], expected: 3, description: 'f(3) = f(2) + 2*f(1) = 1 + 2 = 3' },
      { args: [4], expected: 5, description: 'f(4) = f(3) + 2*f(2) = 3 + 2 = 5' },
    ],
    hiddenTests: [
      { args: [5], expected: 11, description: 'f(5) = 5 + 2*3 = 11' },
      { args: [6], expected: 21, description: 'f(6) = 11 + 2*5 = 21' },
      { args: [7], expected: 43, description: 'f(7) = 21 + 2*11 = 43' },
      { args: [10], expected: 341, description: 'f(10) = 341' },
      { args: [15], expected: 10923, description: 'f(15) = 10923' },
    ],
  },

  // ─── Practice Challenges (Follow-up for Mastery Verification) ───
  // These are unlocked after mastering the main challenge and test deeper understanding
  // without awarding additional XP. They share the same conceptId as their parent challenge.

  'py-01-practice': {
    id: 'py-01-practice',
    questId: 'quest-001',
    title: 'Practice: Mana Surge Calculation',
    functionName: 'calculate_mana_surge',
    xpReward: 0,
    conceptId: 'variables',
    prerequisiteIds: ['py-01'],
    isPractice: true,
    lesson: {
      conceptExplanation: 'Practice applying variable operations in a slightly different context. This reinforces understanding of arithmetic operations and return values.',
      codeExample: '# Similar to the main challenge but with a twist\nbase_mana = 200\nintellect_bonus = 15\nsurge_multiplier = 2\n\n# Calculate surge: base + (intellect * multiplier * 10)\nsurge = base_mana + (intellect_bonus * surge_multiplier * 10)\nprint(surge)  # Output: 500',
      workedExample: {
        input: 'base_mana=200, intellect_bonus=15, surge_multiplier=2',
        steps: [
          'Step 1: intellect_bonus * surge_multiplier = 15 * 2 = 30',
          'Step 2: 30 * 10 = 300',
          'Step 3: base_mana + 300 = 200 + 300 = 500'
        ],
        output: 500
      },
      commonMistakes: [
        'Forgetting to multiply by surge_multiplier',
        'Incorrect order of operations',
        'Not returning the calculated value'
      ],
      progressiveHints: [
        'This is similar to the main challenge but with an extra multiplier',
        'Calculate: base_mana + (intellect_bonus * surge_multiplier * 10)',
        'Make sure to multiply all three values together before adding to base_mana'
      ]
    },
    sampleTests: [
      { args: [200, 15, 2], expected: 500, description: 'base=200, bonus=15, mult=2' },
      { args: [100, 5, 1], expected: 150, description: 'base=100, bonus=5, mult=1' },
      { args: [50, 10, 3], expected: 350, description: 'base=50, bonus=10, mult=3' },
    ],
    hiddenTests: [
      { args: [0, 0, 5], expected: 0, description: 'zero values' },
      { args: [1000, 20, 2], expected: 1400, description: 'larger values' },
    ],
  },

  'py-02-practice': {
    id: 'py-02-practice',
    questId: 'quest-002',
    title: 'Practice: Elite Rank Thresholds',
    functionName: 'identify_elite_rank',
    xpReward: 0,
    conceptId: 'conditionals',
    prerequisiteIds: ['py-02'],
    isPractice: true,
    lesson: {
      conceptExplanation: 'Practice conditional logic with more granular rank thresholds. This tests boundary condition handling and understanding of comparison operators.',
      codeExample: '# More granular rank system\npower = 750\n\nif power < 100:\n    rank = \'E\'\nelif power < 250:\n    rank = \'D\'\nelif power < 500:\n    rank = \'C\'\nelif power < 750:\n    rank = \'B\'\nelif power < 1000:\n    rank = \'A\'\nelif power < 2000:\n    rank = \'S\'\nelse:\n    rank = \'SS\'\n\nprint(rank)  # Output: A (750 >= 750 but < 1000)',
      workedExample: {
        input: 'power = 750',
        steps: [
          'Step 1: 750 < 100? False',
          'Step 2: 750 < 250? False',
          'Step 3: 750 < 500? False',
          'Step 4: 750 < 750? False (boundary!)',
          'Step 5: 750 < 1000? True -> rank = A'
        ],
        output: 'A'
      },
      commonMistakes: [
        'Using <= instead of < for upper bounds (or vice versa)',
        'Off-by-one errors at boundaries like 750',
        'Not ordering conditions correctly'
      ],
      progressiveHints: [
        'Use < for each threshold, not <= (except the last else)',
        'Order conditions from lowest to highest',
        'Pay attention to boundary values - 750 goes to A rank, not B'
      ]
    },
    sampleTests: [
      { args: [50], expected: 'E', description: 'power=50 -> E' },
      { args: [200], expected: 'D', description: 'power=200 -> D' },
      { args: [600], expected: 'C', description: 'power=600 -> C' },
    ],
    hiddenTests: [
      { args: [99], expected: 'E', description: 'boundary: 99' },
      { args: [100], expected: 'D', description: 'boundary: 100' },
      { args: [749], expected: 'B', description: 'boundary: 749' },
      { args: [750], expected: 'A', description: 'boundary: 750 (key test!)' },
      { args: [999], expected: 'A', description: 'boundary: 999' },
      { args: [1000], expected: 'S', description: 'boundary: 1000' },
      { args: [1999], expected: 'S', description: 'boundary: 1999' },
      { args: [2000], expected: 'SS', description: 'boundary: 2000' },
    ],
  },

  'py-03-practice': {
    id: 'py-03-practice',
    questId: 'quest-003',
    title: 'Practice: Enhanced Item Formatter',
    functionName: 'format_enhanced_item',
    xpReward: 0,
    conceptId: 'strings',
    prerequisiteIds: ['py-03'],
    isPractice: true,
    lesson: {
      conceptExplanation: 'Practice string manipulation with additional formatting requirements. Tests understanding of multiple string methods and f-string formatting.',
codeExample: '# Enhanced formatting with enhancement level\nname = \'dragon sword\'\nrarity = \'epic\'\nquantity = 1\nenhancement = 5\n\nrarity_upper = rarity.upper()\nname_title = name.title()\nformatted = f"[{rarity_upper}] {name_title} +{enhancement} x{quantity}"\nprint(formatted)  # Output: [EPIC] Dragon Sword +5 x1',
      workedExample: {
        input: 'name="shadow dagger", rarity="rare", quantity=2, enhancement=3',
        steps: [
          'Step 1: rarity.upper() -> "RARE"',
          'Step 2: name.title() -> "Shadow Dagger"',
          'Step 3: f"[RARE] Shadow Dagger +3 x2"'
        ],
        output: '[RARE] Shadow Dagger +3 x2'
      },
      commonMistakes: [
        'Forgetting the + sign before enhancement level',
        'Not calling string methods with parentheses',
        'Incorrect f-string syntax with curly braces'
      ],
      progressiveHints: [
        'Add enhancement parameter to function signature',
        'Format: [RARITY] Item Name +Enhancement xQuantity',
        'Use f-string: f\"[{rarity.upper()}] {name.title()} +{enhancement} x{quantity}\"'
      ]
    },
    sampleTests: [
      { args: ['shadow dagger', 'rare', 2, 3], expected: '[RARE] Shadow Dagger +3 x2', description: 'Standard item with enhancement' },
      { args: ['mana potion', 'common', 5, 0], expected: '[COMMON] Mana Potion +0 x5', description: 'No enhancement' },
    ],
    hiddenTests: [
      { args: ['kasaka venom fang', 'epic', 1, 10], expected: '[EPIC] Kasaka Venom Fang +10 x1', description: 'Max enhancement' },
      { args: ['orb', 'mythic', 10, 5], expected: '[MYTHIC] Orb +5 x10', description: 'Single word name' },
    ],
  },

  'py-04-practice': {
    id: 'py-04-practice',
    questId: 'quest-004',
    title: 'Practice: Weighted Soldier Sum',
    functionName: 'sum_weighted_strengths',
    xpReward: 0,
    conceptId: 'loops',
    prerequisiteIds: ['py-04'],
    isPractice: true,
    lesson: {
      conceptExplanation: 'Practice loops with weighted accumulation. Each soldier has a strength and a rank multiplier. This reinforces loop iteration and conditional accumulation.',
      codeExample: '# Sum with rank multipliers\nsoldiers = [\n    {\'strength\': 10, \'rank\': \'normal\'},\n    {\'strength\': 20, \'rank\': \'elite\'},\n    {\'strength\': 5, \'rank\': \'normal\'}\n]\nmultipliers = {\'normal\': 1, \'elite\': 2, \'boss\': 3}\n\ntotal = 0\nfor s in soldiers:\n    mult = multipliers.get(s[\'rank\'], 1)\n    total += s[\'strength\'] * mult\n\nprint(total)  # Output: 10*1 + 20*2 + 5*1 = 55',
      workedExample: {
        input: "soldiers=[{'strength':10,'rank':'normal'},{'strength':20,'rank':'elite'}], multipliers={'normal':1,'elite':2}",
        steps: [
          'Step 1: soldier 1: normal -> 10 * 1 = 10',
          'Step 2: soldier 2: elite -> 20 * 2 = 40',
          'Step 3: total = 10 + 40 = 50'
        ],
        output: 50
      },
      commonMistakes: [
        'Not using .get() for safe dictionary access',
        'Forgetting to multiply strength by multiplier',
        'Not handling unknown ranks with default multiplier'
      ],
      progressiveHints: [
        'Loop through each soldier dictionary',
        'Get multiplier with multipliers.get(rank, 1)',
        'Multiply strength * multiplier and add to total'
      ]
    },
    sampleTests: [
      { args: [[{'strength': 10, 'rank': 'normal'}, {'strength': 20, 'rank': 'elite'}], {'normal': 1, 'elite': 2}], expected: 50, description: 'Two soldiers with multipliers' },
      { args: [[{'strength': 5, 'rank': 'normal'}], {'normal': 1}], expected: 5, description: 'Single normal soldier' },
    ],
    hiddenTests: [
      { args: [[{'strength': 10, 'rank': 'boss'}, {'strength': 15, 'rank': 'normal'}], {'normal': 1, 'elite': 2, 'boss': 3}], expected: 45, description: 'Boss rank (3x) + normal' },
      { args: [[], {}], expected: 0, description: 'Empty army' },
      { args: [[{'strength': 10, 'rank': 'unknown'}], {'normal': 1}], expected: 10, description: 'Unknown rank defaults to 1' },
    ],
  },

  'py-05-practice': {
    id: 'py-05-practice',
    questId: 'quest-005',
    title: 'Practice: Modulo Filter Variations',
    functionName: 'filter_by_modulo',
    xpReward: 0,
    conceptId: 'arrays',
    prerequisiteIds: ['py-05'],
    isPractice: true,
    lesson: {
      conceptExplanation: 'Practice modulo operator with different divisors and conditions. This tests understanding of the modulo operation beyond just even/odd.',
      codeExample: '# Filter by any modulo condition\nnumbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]\n\n# Keep numbers divisible by 3\nresult = [n for n in numbers if n % 3 == 0]\nprint(result)  # Output: [3, 6, 9]',
      workedExample: {
        input: 'numbers=[1,2,3,4,5,6,7,8,9], divisor=3',
        steps: [
          'Step 1: Check each n % 3 == 0',
          'Step 2: 1%3=1, 2%3=2, 3%3=0 (keep), 4%3=1, 5%3=2, 6%3=0 (keep), 7%3=1, 8%3=2, 9%3=0 (keep)',
          'Step 3: Result: [3, 6, 9]'
        ],
        output: [3, 6, 9]
      },
      commonMistakes: [
        'Using = instead of == in condition',
        'Confusing divisor and dividend in modulo',
        'Not handling negative numbers correctly with modulo'
      ],
      progressiveHints: [
        'Function takes numbers list and divisor integer',
        'Return [n for n in numbers if n % divisor == 0]',
        'Works for any positive divisor'
      ]
    },
    sampleTests: [
      { args: [[1, 2, 3, 4, 5, 6, 7, 8, 9], 3], expected: [3, 6, 9], description: 'Divisible by 3' },
      { args: [[10, 15, 20, 25, 30], 5], expected: [10, 15, 20, 25, 30], description: 'Divisible by 5' },
    ],
    hiddenTests: [
      { args: [[-6, -3, 0, 3, 6], 3], expected: [-6, -3, 0, 3, 6], description: 'Negative numbers divisible by 3' },
      { args: [[1, 2, 4, 5, 7, 8], 3], expected: [], description: 'None divisible by 3' },
      { args: [[], 7], expected: [], description: 'Empty list' },
    ],
  },

  'py-06-practice': {
    id: 'py-06-practice',
    questId: 'quest-006',
    title: 'Practice: Variable Step Countdown',
    functionName: 'countdown_with_variable_step',
    xpReward: 0,
    conceptId: 'loops',
    prerequisiteIds: ['py-06'],
    isPractice: true,
    lesson: {
      conceptExplanation: 'Practice while loops where the step size changes based on conditions. This reinforces loop control and dynamic iteration.',
      codeExample: '# Countdown with variable step\ntimer = 20\nstep = 3\nticks = 0\n\nwhile timer > 0:\n    timer -= step\n    ticks += 1\n    # Increase step every 2 ticks\n    if ticks % 2 == 0:\n        step += 1\n\nprint(ticks)  # Output depends on logic',
      workedExample: {
        input: 'timer=10, step=2',
        steps: [
          'Step 1: ticks=0, timer=10, step=2 -> timer=8, ticks=1',
          'Step 2: ticks=1, timer=8, step=2 -> timer=6, ticks=2',
          'Step 3: ticks=2 (even), step=3 -> timer=3, ticks=3',
          'Step 4: ticks=3, timer=3, step=3 -> timer=0, ticks=4',
          'Step 5: timer<=0, exit, return 4'
        ],
        output: 4
      },
      commonMistakes: [
        'Forgetting to update step inside the loop',
        'Infinite loop if step becomes 0 or negative',
        'Not checking timer <= 0 after subtraction'
      ],
      progressiveHints: [
        'Start with basic countdown logic from main challenge',
        'Add step modification inside the loop based on tick count',
        'Make sure step stays positive to avoid infinite loop'
      ]
    },
    sampleTests: [
      { args: [10, 2], expected: 4, description: 'timer=10, step=2' },
      { args: [5, 1], expected: 3, description: 'timer=5, step=1 (step increases every 2 ticks)' },
    ],
    hiddenTests: [
      { args: [0, 5], expected: 0, description: 'Already zero' },
      { args: [100, 10], expected: 7, description: 'Large timer' },
      { args: [-5, 2], expected: 0, description: 'Negative timer' },
    ],
  },

  'py-07-practice': {
    id: 'py-07-practice',
    questId: 'quest-007',
    title: 'Practice: Bulk Potion Cost with Discounts',
    functionName: 'calculate_bulk_potion_cost',
    xpReward: 0,
    conceptId: 'dictionaries',
    prerequisiteIds: ['py-07'],
    isPractice: true,
    lesson: {
      conceptExplanation: 'Practice dictionary iteration with bulk discounts. Apply tiered pricing based on quantity thresholds.',
codeExample: '# Bulk pricing with dictionary\nrecipe = {\'herb\': 50, \'crystal\': 20}\nprices = {\'herb\': 10, \'crystal\': 50}\ndiscounts = {\'herb\': {10: 0.9, 50: 0.8}, \'crystal\': {5: 0.95}}\n\ntotal = 0\nfor item, qty in recipe.items():\n    price = prices.get(item, 0)\n    # Check for bulk discount\n    for threshold, discount in discounts.get(item, {}).items():\n        if qty >= threshold:\n            price *= discount\n    total += qty * price\n\nprint(total)  # Applies best discount',
      workedExample: {
        input: "recipe={'herb': 50, 'crystal': 5}, prices={'herb': 10, 'crystal': 50}, discounts={'herb': {10: 0.9, 50: 0.8}}",
        steps: [
          'Step 1: herb qty=50, base price=10, qualifies for 50 threshold -> 10 * 0.8 = 8',
          'Step 2: herb total = 50 * 8 = 400',
          'Step 3: crystal qty=5, no discount -> 5 * 50 = 250',
          'Step 4: total = 400 + 250 = 650'
        ],
        output: 650
      },
      commonMistakes: [
        'Not applying the best (lowest) discount when multiple thresholds met',
        'Forgetting to use .get() for safe dictionary access',
        'Applying discount to price instead of total per item'
      ],
      progressiveHints: [
        'Loop through recipe items with .items()',
        'Check each discount threshold for the ingredient',
        'Apply the highest qualifying discount (lowest multiplier)',
        'Use prices.get(item, 0) for missing prices'
      ]
    },
    sampleTests: [
      { args: [{'herb': 50, 'crystal': 5}, {'herb': 10, 'crystal': 50}, {'herb': {10: 0.9, 50: 0.8}}], expected: 650, description: 'Bulk herb discount applies' },
      { args: [{'herb': 5}, {'herb': 10}, {}], expected: 50, description: 'No discount threshold met' },
    ],
    hiddenTests: [
      { args: [{'herb': 100}, {'herb': 10}, {'herb': {10: 0.9, 50: 0.8}}], expected: 800, description: 'Max discount tier' },
      { args: [{}, {'herb': 10}, {}], expected: 0, description: 'Empty recipe' },
      { args: [{'unknown': 10}, {}, {}], expected: 0, description: 'Unknown ingredient defaults to 0' },
    ],
  },

  'py-08-practice': {
    id: 'py-08-practice',
    questId: 'quest-008',
    title: 'Practice: Partial Squad Reversal',
    functionName: 'reverse_squad_segment',
    xpReward: 0,
    conceptId: 'arrays',
    prerequisiteIds: ['py-08'],
    isPractice: true,
    lesson: {
      conceptExplanation: 'Practice list slicing with start and stop indices. Reverse only a segment of the list while keeping the rest intact.',
      codeExample: '# Reverse a segment of the list\nsquad = [\'Igris\', \'Tank\', \'Iron\', \'Beru\', \'Kaisel\']\n\n# Reverse only indices 1 to 3 (Tank, Iron, Beru)\nstart, end = 1, 4\nreversed_segment = squad[start:end][::-1]\nresult = squad[:start] + reversed_segment + squad[end:]\n# Result: [\'Igris\', \'Beru\', \'Iron\', \'Tank\', \'Kaisel\']',
      workedExample: {
        input: "squad=['A','B','C','D','E'], start=1, end=4",
        steps: [
          'Step 1: squad[1:4] -> [B, C, D]',
          'Step 2: Reverse -> [D, C, B]',
          'Step 3: Combine: [A] + [D,C,B] + [E] -> [A, D, C, B, E]'
        ],
        output: ['A', 'D', 'C', 'B', 'E']
      },
      commonMistakes: [
        'Off-by-one errors with slice indices',
        'Mutating original list instead of creating new one',
        'Incorrect slice syntax for reversing segment'
      ],
      progressiveHints: [
        'Extract segment: squad[start:end]',
        'Reverse segment: segment[::-1]',
        'Combine: squad[:start] + reversed + squad[end:]',
        'Handle edge cases: start=0, end=len(squad)'
      ]
    },
    sampleTests: [
      { args: [['Igris', 'Tank', 'Iron', 'Beru', 'Kaisel'], 1, 4], expected: ['Igris', 'Beru', 'Iron', 'Tank', 'Kaisel'], description: 'Reverse middle segment' },
      { args: [['A', 'B', 'C'], 0, 3], expected: ['C', 'B', 'A'], description: 'Reverse entire list' },
    ],
    hiddenTests: [
      { args: [['A', 'B', 'C', 'D'], 0, 2], expected: ['B', 'A', 'C', 'D'], description: 'Reverse first half' },
      { args: [['A', 'B', 'C', 'D'], 2, 4], expected: ['A', 'B', 'D', 'C'], description: 'Reverse last half' },
      { args: [['A'], 0, 1], expected: ['A'], description: 'Single element' },
      { args: [[], 0, 0], expected: [], description: 'Empty list' },
    ],
  },

  'py-09-practice': {
    id: 'py-09-practice',
    questId: 'quest-009',
    title: 'Practice: Multiplier Chain',
    functionName: 'create_multiplier_chain',
    xpReward: 0,
    conceptId: 'functions',
    prerequisiteIds: ['py-09'],
    isPractice: true,
    lesson: {
      conceptExplanation: 'Practice composing multiple closures. Create a chain of multipliers that apply sequentially.',
      codeExample: '# Chain multiple multipliers\ndef create_chain(factors):\n    def apply_all(damage):\n        result = damage\n        for factor in factors:\n            result *= factor\n        return result\n    return apply_all\n\nchain = create_chain([2, 3, 4])\nprint(chain(10))  # 10 * 2 * 3 * 4 = 240',
      workedExample: {
        input: 'factors=[2, 3], damage=50',
        steps: [
          'Step 1: Create chain with factors [2, 3]',
          'Step 2: Call with damage=50',
          'Step 3: 50 * 2 = 100, then 100 * 3 = 300'
        ],
        output: 300
      },
      commonMistakes: [
        'Returning the inner function instead of calling it',
        'Not iterating through all factors',
        'Modifying the original factors list'
      ],
      progressiveHints: [
        'Accept a list of factors as parameter',
        'Return a function that takes damage',
        'Loop through factors and multiply sequentially',
        'Return the final result'
      ]
    },
    sampleTests: [
      { args: [[2, 3]], callArg: 50, expected: 300, description: 'Chain [2, 3] applied to 50' },
      { args: [[2, 2, 2]], callArg: 10, expected: 80, description: 'Three doublings: 10*2*2*2=80' },
    ],
    hiddenTests: [
      { args: [[1, 1, 1]], callArg: 42, expected: 42, description: 'Identity factors' },
      { args: [[-1, 2]], callArg: 10, expected: -20, description: 'Negative factor' },
      { args: [[]], callArg: 100, expected: 100, description: 'Empty chain (no change)' },
    ],
  },

  'py-10-practice': {
    id: 'py-10-practice',
    questId: 'quest-010',
    title: 'Practice: Iterative Power Surge',
    functionName: 'calculate_surge_iterative',
    xpReward: 0,
    conceptId: 'recursion',
    prerequisiteIds: ['py-10'],
    isPractice: true,
    lesson: {
      conceptExplanation: 'Practice converting the recursive solution to an iterative one using dynamic programming. This tests understanding of the recurrence relation and optimization.',
      codeExample: '# Iterative DP approach (O(n) time, O(1) space)\ndef calculate_surge_iterative(n):\n    if n == 0: return 0\n    if n == 1: return 1\n    \n    prev2 = 0  # f(0)\n    prev1 = 1  # f(1)\n    \n    for i in range(2, n + 1):\n        current = prev1 + 2 * prev2\n        prev2 = prev1\n        prev1 = current\n    \n    return prev1\n\nprint(calculate_surge_iterative(10))  # Output: 341',
      workedExample: {
        input: 'n=5',
        steps: [
          'Step 1: prev2=0, prev1=1',
          'Step 2: i=2: current=1+2*0=1, prev2=1, prev1=1',
          'Step 3: i=3: current=1+2*1=3, prev2=1, prev1=3',
          'Step 4: i=4: current=3+2*1=5, prev2=3, prev1=5',
          'Step 5: i=5: current=5+2*3=11, prev2=5, prev1=11',
          'Step 6: Return 11'
        ],
        output: 11
      },
      commonMistakes: [
        'Incorrect initial values for prev2 and prev1',
        'Wrong loop range (should be range(2, n+1))',
        'Not updating prev2 and prev1 in correct order',
        'Using recursion instead of iteration'
      ],
      progressiveHints: [
        'Handle base cases n=0 and n=1 first',
        'Use two variables to track f(n-2) and f(n-1)',
        'Loop from 2 to n, compute f(i) = f(i-1) + 2*f(i-2)',
        'Update the two variables at each step'
      ]
    },
    sampleTests: [
      { args: [0], expected: 0, description: 'Base case n=0' },
      { args: [1], expected: 1, description: 'Base case n=1' },
      { args: [5], expected: 11, description: 'f(5) = 11' },
    ],
    hiddenTests: [
      { args: [6], expected: 21, description: 'f(6) = 21' },
      { args: [10], expected: 341, description: 'f(10) = 341' },
      { args: [15], expected: 10923, description: 'f(15) = 10923' },
      { args: [30], expected: 114532461, description: 'Large n test' },
    ],
  },
};
