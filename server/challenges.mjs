/**
 * Server-Side Python Challenges Registry
 * Contains both public sample tests and SECRET hidden test cases.
 * Hidden tests are NEVER sent to the client.
 */

export const serverChallenges = {
  'py-01': {
    id: 'py-01',
    questId: 'quest-001',
    title: 'The Awakening: Mana Calculation',
    functionName: 'calculate_mana',
    xpReward: 100,
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
    // Note: higher-order return tested via runner evaluator helper
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
};
