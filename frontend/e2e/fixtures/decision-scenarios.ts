export const decisionScenarios = [
  {
    name: 'university-exchange-program',
    mode: 'multi-option',
    problem:
      'Should I join a university exchange program abroad if I care about growth but still need cost control?',
    answer:
      'Growth matters, but I need to preserve flexibility if the cost runs higher than expected.',
  },
  {
    name: 'car-vs-public-transport',
    mode: 'multi-option',
    problem:
      'Should I buy a car or continue using public transport if I want lower downside and more optionality?',
    answer:
      'Keep the downside low and avoid locking myself into a large fixed monthly cost.',
  },
  {
    name: 'graduate-school-vs-work',
    mode: 'multi-option',
    problem:
      'Should I apply for graduate school now or work for two years first if I care about timing and long-term flexibility?',
    answer:
      'I want the option that preserves future upside without creating immediate financial pressure.',
  },
] as const
