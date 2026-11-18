/** Standalone foods only: split words of multiword catalog names are not food identities. */
const FOODS = new Set(`apple banana orange pear peach plum grape berries strawberry blueberry raspberry
blackberry cherry mango pineapple watermelon melon papaya kiwi lemon lime avocado broccoli cauliflower
cabbage carrot celery cucumber eggplant mushroom onion garlic pepper potato tomato zucchini squash
spinach kale lettuce asparagus artichoke beet turnip radish pea peas beans lentils chickpeas rice
quinoa oats oatmeal barley wheat rye corn bread pasta noodles spaghetti tofu tempeh seitan milk yogurt
yoghurt cheese butter cream egg eggs chicken turkey duck beef pork lamb fish salmon tuna cod trout
halibut tilapia sardine mackerel herring shrimp prawn crab lobster clam mussel oyster scallop squid
calamari peanut almond walnut pecan cashew pistachio hazelnut coconut sesame tahini hummus chocolate
coffee tea juice bacon ham sausage salami pepperoni pizza burger taco burrito sushi ramen porridge
bagel pancake waffle omelet omelette falafel soup stew salad sandwich`.split(/\s+/));

/** A single explicit restriction kept local; no symptom clause or uncertainty is interpreted. */
export function localAvoidCommand(message: string): string | null {
  const match = /^i can(?:['’]t|not) do ([a-z]+) anymore[.!]?$/i.exec(message.trim());
  const food = match?.[1].toLowerCase();
  return food && (FOODS.has(food) || FOODS.has(food.replace(/e?s$/, ""))) ? food : null;
}
