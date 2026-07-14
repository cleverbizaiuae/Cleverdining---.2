from django.db import migrations


def seed_pranay_production_menu(apps, schema_editor):
    Restaurant = apps.get_model("restaurant", "Restaurant")
    Category = apps.get_model("category", "Category")
    Item = apps.get_model("item", "Item")

    restaurant = Restaurant.objects.filter(
        pk=8,
        resturent_name__iexact="Pranay",
    ).first()
    if restaurant is None:
        return

    # Keep the complete dataset and media handling in one tested implementation.
    # The operation is idempotent and scoped to the verified production account.
    from item.pranay_menu import seed_pranay_menu

    seed_pranay_menu(restaurant, Category, Item)


class Migration(migrations.Migration):
    dependencies = [
        ("item", "0010_item_item_item_restaur_26d236_idx"),
    ]

    operations = [
        migrations.RunPython(
            seed_pranay_production_menu,
            reverse_code=migrations.RunPython.noop,
        ),
    ]
