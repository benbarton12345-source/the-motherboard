// Keyword categorisation rules for statement import (Layer 2).
// First match wins; case-insensitive partial match on the CLEANED description.
// Category names must match the budget tracker's categories exactly.

// Canonical category list — used for the Section C dropdown and the AI prompt.
// 'Miscellaneous' is the review/uncertain bucket (not a keyword-rule target).
export const CATEGORIES = [
  'Groceries',
  'Eating Out',
  'Transport',
  'Subscriptions',
  'Utilities',
  'Health & Wellness',
  'Personal Care',
  'Clothing & Retail',
  'Entertainment',
  'Vehicle',
  'Miscellaneous',
]

export const CATEGORY_RULES = [
  { category: 'Groceries', keywords: ['WOOLWORTHS', 'COLES', 'JACKYVILLE', 'JS4-M789', 'IGA', 'STIRLING IGA', 'THE MEAT WORKS', 'ALDI', 'FOODWORKS'] },
  { category: 'Eating Out', keywords: ['UBER EATS', 'MENULOG', 'DOORDASH', 'PIZZA', 'BURGER', 'SUSHI', 'DUMBO GELATO', 'TACO', 'BAH MI', 'MILLER + BAKER', 'GOODS BAKERY', 'PRESTONS DELI', 'PRESTON', 'MALIBU SHAKES', 'FLOURISH', 'FROTH CRAFT', 'CHU', 'ALH GROUP', 'ALHGROUP', 'BETTYS', 'YATAI', 'PERTHY AND CO', 'MAESTRO', 'GALWAY', 'LAKES KITCHEN', 'DUSK', 'LITTLE WAVE'] },
  { category: 'Transport', keywords: ['UBER TRIP', 'AMPOL', 'BP', 'CALTEX', 'SHELL', '7-ELEVEN', 'S24 BALCATTA'] },
  { category: 'Subscriptions', keywords: ['SPOTIFY', 'NETFLIX', 'APPLE.COM/BILL', 'DISNEY', 'AMAZON PRIME', 'YOUTUBE', 'AMAYSIM', 'OPTUS', 'TELSTRA', 'VODAFONE', 'PENTANET', 'AUSSIE BROADBAND', 'TPG', 'ANTHROPIC', 'UBER ONE', 'UBER *ONE'] },
  { category: 'Utilities', keywords: ['AGL', 'SYNERGY', 'ORIGIN', 'ALINTA', 'CITY OF STIRLING'] },
  { category: 'Health & Wellness', keywords: ['REVO FITNESS', 'ANYTIME FITNESS', 'GOODLIFE', 'ALCHEMY SAUNAS', 'SUPPLEMENT MART', 'MYPROTEIN', 'BULK NUTRIENTS'] },
  { category: 'Personal Care', keywords: ['PRICELINE', 'CHEMIST WAREHOUSE', 'TERRY WHITE', 'BARBERSHOP', 'BARBER'] },
  { category: 'Clothing & Retail', keywords: ['H&M', 'JD SPORTS', 'JD_AUSTRALIA', 'ZARA', 'COTTON ON', 'UNIQLO', 'MYER', 'DAVID JONES', 'BIG W', 'TARGET', 'KMART'] },
  { category: 'Entertainment', keywords: ['HOYTS', 'EVENT CINEMAS', 'STICKYTKS', 'IKEA', 'WHALEBACK GOLF', 'GOLF', 'KARRINYUP NEWS'] },
  { category: 'Vehicle', keywords: ['BURGAY', 'AUTOMOTIVE', 'MECHANIC', 'TYRES', 'DEPARTMENT OF TRANSPOR'] },
]

// Returns the matched category name, or null if no keyword rule matches.
export function matchCategoryByKeyword(cleanedDescription) {
  const desc = (cleanedDescription || '').toUpperCase()
  if (!desc) return null
  for (const rule of CATEGORY_RULES) {
    for (const kw of rule.keywords) {
      if (desc.includes(kw.toUpperCase())) return rule.category
    }
  }
  return null
}
