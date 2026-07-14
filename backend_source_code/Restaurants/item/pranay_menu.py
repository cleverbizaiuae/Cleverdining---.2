from pathlib import Path

from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.utils.text import slugify


ASSET_DIR = Path(__file__).resolve().parent / "seed_assets" / "pranay_menu"

PRANAY_MENU = (
    {
        "name": "Starters",
        "type": "starter",
        "items": (
            ("Truffle Mushroom Arancini", "34.00", "Crisp risotto bites with truffle mushroom, mozzarella and herb aioli.", "truffle-mushroom-arancini.jpg", ["starter", "vegetarian", "mushroom", "cheese"]),
            ("Crispy Calamari", "38.00", "Tender calamari, lightly fried and served with lemon garlic aioli.", "crispy-calamari.jpg", ["starter", "seafood", "crispy", "citrus"]),
            ("Burrata & Heirloom Tomato", "46.00", "Creamy burrata with ripe tomatoes, basil, olive oil and balsamic.", "burrata-heirloom-tomato.jpg", ["starter", "vegetarian", "cheese", "light"]),
            ("Chicken Satay", "36.00", "Chargrilled chicken skewers with cucumber relish and peanut sauce.", "chicken-satay.jpg", ["starter", "chicken", "grilled", "spicy"]),
            ("Hummus & Warm Pita", "24.00", "Silky chickpea hummus with extra virgin olive oil and warm pita.", "hummus-warm-pita.jpg", ["starter", "vegetarian", "vegan", "light"]),
        ),
    },
    {
        "name": "Salads",
        "type": "starter",
        "items": (
            ("Classic Caesar Salad", "32.00", "Romaine, parmesan, garlic croutons and house Caesar dressing.", "classic-caesar-salad.jpg", ["starter", "salad", "vegetarian", "light"]),
            ("Quinoa Avocado Salad", "36.00", "Quinoa, avocado, cucumber, cherry tomato and lemon herb dressing.", "quinoa-avocado-salad.jpg", ["starter", "salad", "vegan", "healthy"]),
            ("Greek Salad", "34.00", "Tomato, cucumber, olives, peppers, feta and oregano vinaigrette.", "greek-salad.jpg", ["starter", "salad", "vegetarian", "light"]),
            ("Roasted Beet & Goat Cheese Salad", "39.00", "Roasted beetroot, goat cheese, rocket, walnuts and citrus dressing.", "roasted-beet-goat-cheese-salad.jpg", ["starter", "salad", "vegetarian", "cheese"]),
            ("Thai Mango Salad", "35.00", "Green mango, herbs, cashews and a bright chilli lime dressing.", "thai-mango-salad.jpg", ["starter", "salad", "vegan", "spicy"]),
        ),
    },
    {
        "name": "Burgers & Sandwiches",
        "type": "main",
        "items": (
            ("Classic Cheeseburger", "48.00", "Angus beef, cheddar, lettuce, tomato, pickles and house sauce.", "classic-cheeseburger.jpg", ["main", "burger", "beef", "cheese"]),
            ("Truffle Mushroom Burger", "56.00", "Angus beef, sauteed mushrooms, Swiss cheese and truffle aioli.", "truffle-mushroom-burger.jpg", ["main", "burger", "beef", "mushroom"]),
            ("Crispy Chicken Burger", "46.00", "Buttermilk chicken, slaw, pickles and smoky chilli mayonnaise.", "crispy-chicken-burger.jpg", ["main", "burger", "chicken", "spicy"]),
            ("Grilled Halloumi Burger", "44.00", "Grilled halloumi, roasted pepper, rocket and basil pesto.", "grilled-halloumi-burger.jpg", ["main", "burger", "vegetarian", "cheese"]),
            ("Club Sandwich", "45.00", "Roast chicken, smoked turkey, egg, lettuce and tomato on toasted bread.", "club-sandwich.jpg", ["main", "sandwich", "chicken", "classic"]),
        ),
    },
    {
        "name": "Artisan Pizza",
        "type": "main",
        "items": (
            ("Margherita Pizza", "42.00", "San Marzano tomato, fior di latte, basil and olive oil.", "margherita-pizza.jpg", ["main", "pizza", "vegetarian", "cheese"]),
            ("Pepperoni Pizza", "49.00", "Tomato, mozzarella and crisp beef pepperoni.", "pepperoni-pizza.jpg", ["main", "pizza", "beef", "cheese"]),
            ("Truffle Mushroom Pizza", "58.00", "Wild mushrooms, mozzarella, parmesan and black truffle cream.", "truffle-mushroom-pizza.jpg", ["main", "pizza", "vegetarian", "mushroom"]),
            ("Burrata Prosciutto Pizza", "62.00", "Tomato, burrata, beef prosciutto, rocket and parmesan.", "burrata-prosciutto-pizza.jpg", ["main", "pizza", "beef", "cheese"]),
            ("Mediterranean Vegetable Pizza", "48.00", "Roasted peppers, courgette, aubergine, olives and mozzarella.", "mediterranean-vegetable-pizza.jpg", ["main", "pizza", "vegetarian", "vegetable"]),
        ),
    },
    {
        "name": "Pasta & Mains",
        "type": "main",
        "items": (
            ("Penne Arrabbiata", "44.00", "Penne in spicy tomato sauce with garlic, chilli and fresh basil.", "penne-arrabbiata.jpg", ["main", "pasta", "vegetarian", "spicy"]),
            ("Fettuccine Alfredo", "49.00", "Fettuccine in parmesan cream with roasted mushrooms.", "fettuccine-alfredo.jpg", ["main", "pasta", "vegetarian", "creamy"]),
            ("Beef Lasagna", "55.00", "Slow-cooked beef ragout, bechamel, pasta sheets and parmesan.", "beef-lasagna.jpg", ["main", "pasta", "beef", "cheese"]),
            ("Grilled Salmon", "72.00", "Atlantic salmon with lemon herb butter and seasonal vegetables.", "grilled-salmon.jpg", ["main", "fish", "seafood", "grilled"]),
            ("Herb Roasted Chicken", "64.00", "Free-range chicken with rosemary jus, vegetables and potato.", "herb-roasted-chicken.jpg", ["main", "chicken", "roasted", "classic"]),
        ),
    },
    {
        "name": "Sides",
        "type": "other",
        "items": (
            ("Truffle Parmesan Fries", "22.00", "Golden fries tossed with truffle oil, parmesan and parsley.", "truffle-parmesan-fries.jpg", ["starter", "side", "fries", "vegetarian"]),
            ("Sweet Potato Fries", "20.00", "Crisp sweet potato fries with smoked paprika mayonnaise.", "sweet-potato-fries.jpg", ["starter", "side", "fries", "vegetarian"]),
            ("Garlic Bread", "18.00", "Toasted artisan bread with garlic butter, herbs and parmesan.", "garlic-bread.jpg", ["starter", "side", "bread", "vegetarian"]),
            ("Grilled Seasonal Vegetables", "24.00", "Seasonal vegetables grilled with herbs and extra virgin olive oil.", "grilled-seasonal-vegetables.jpg", ["starter", "side", "vegan", "healthy"]),
            ("Creamy Mashed Potato", "20.00", "Smooth potato mash with butter, cream and chives.", "creamy-mashed-potato.jpg", ["starter", "side", "vegetarian", "creamy"]),
        ),
    },
    {
        "name": "Cold Drinks",
        "type": "drink",
        "items": (
            ("Classic Lemonade", "18.00", "Fresh lemon, mint and cane sugar served over ice.", "classic-lemonade.jpg", ["drink", "cold_drink", "juice", "citrus"]),
            ("Passionfruit Mojito", "24.00", "Passionfruit, lime, mint and soda in a refreshing zero-alcohol cooler.", "passionfruit-mojito.jpg", ["drink", "cold_drink", "mocktail", "citrus"]),
            ("Strawberry Shake", "28.00", "Fresh strawberry and vanilla ice cream blended until smooth.", "strawberry-shake.jpg", ["drink", "cold_drink", "shake", "strawberry"]),
            ("Iced Spanish Latte", "22.00", "Espresso, milk and lightly sweetened condensed milk over ice.", "iced-spanish-latte.jpg", ["drink", "cold_drink", "coffee", "latte"]),
            ("Sparkling Water", "12.00", "Chilled premium sparkling mineral water.", "sparkling-water.jpg", ["drink", "cold_drink", "water", "light"]),
        ),
    },
    {
        "name": "Desserts",
        "type": "dessert",
        "items": (
            ("Classic Tiramisu", "32.00", "Espresso-soaked sponge, mascarpone and cocoa.", "classic-tiramisu.jpg", ["dessert", "cake", "coffee", "creamy"]),
            ("Basque Burnt Cheesecake", "34.00", "Caramelised baked cheesecake with a soft vanilla centre.", "basque-burnt-cheesecake.jpg", ["dessert", "cake", "cheesecake", "creamy"]),
            ("Chocolate Fondant", "36.00", "Warm dark chocolate cake with a molten centre and vanilla gelato.", "chocolate-fondant.jpg", ["dessert", "cake", "chocolate", "icecream"]),
            ("Pistachio Kunafa", "38.00", "Crisp kunafa pastry with pistachio cream and rose syrup.", "pistachio-kunafa.jpg", ["dessert", "pastry", "pistachio", "middle_eastern"]),
            ("Vanilla Bean Ice Cream", "24.00", "Three scoops of Madagascan vanilla bean ice cream.", "vanilla-bean-ice-cream.jpg", ["dessert", "icecream", "vanilla", "cold"]),
        ),
    },
)


def _ensure_asset(storage_name, source_name, refresh_images=False):
    if not refresh_images and default_storage.exists(storage_name):
        return storage_name
    source_path = ASSET_DIR / source_name
    if not source_path.is_file():
        raise FileNotFoundError(f"Missing Pranay menu image: {source_path}")
    if refresh_images and default_storage.exists(storage_name):
        default_storage.delete(storage_name)
    return default_storage.save(storage_name, ContentFile(source_path.read_bytes()))


def seed_pranay_menu(restaurant, Category, Item, refresh_images=False):
    created_categories = 0
    created_items = 0
    updated_items = 0

    for category_data in PRANAY_MENU:
        category, created = Category.objects.get_or_create(
            restaurant=restaurant,
            Category_name=category_data["name"],
            defaults={"slug": slugify(category_data["name"])},
        )
        created_categories += int(created)
        category.category_type = category_data["type"]
        category.parent_category = None
        category.level = 0
        category.slug = slugify(category_data["name"])

        first_image = category_data["items"][0][3]
        category.image = _ensure_asset(
            f"media/category_images/pranay-menu/{first_image}",
            first_image,
            refresh_images,
        )
        category.save()

        for name, price, description, image_name, tags in category_data["items"]:
            image_path = _ensure_asset(
                f"media/item_images/pranay-menu/{image_name}",
                image_name,
                refresh_images,
            )
            item = Item.objects.filter(
                restaurant=restaurant,
                item_name__iexact=name,
            ).first()
            item_created = item is None
            if item is None:
                item = Item(
                    restaurant=restaurant,
                    item_name=name,
                    category=category,
                    description=description,
                    price=price,
                    slug=slugify(name),
                )
            item.item_name = name
            item.category = category
            item.sub_category = None
            item.price = price
            item.description = description
            item.slug = slugify(name)
            item.image1 = image_path
            item.tags = tags
            item.discount_percentage = 0
            item.availability = True
            item.save()
            created_items += int(item_created)
            updated_items += int(not item_created)

    return {
        "categories": len(PRANAY_MENU),
        "items": sum(len(category["items"]) for category in PRANAY_MENU),
        "created_categories": created_categories,
        "created_items": created_items,
        "updated_items": updated_items,
    }
