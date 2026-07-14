from django.db import migrations


def seed_pranay_menu_by_account_identity(apps, schema_editor):
    Restaurant = apps.get_model("restaurant", "Restaurant")
    Category = apps.get_model("category", "Category")
    Item = apps.get_model("item", "Item")

    restaurant = Restaurant.objects.filter(
        pk=8,
        phone_number="17678060045",
    ).first()
    if restaurant is None:
        return

    from item.pranay_menu import seed_pranay_menu

    seed_pranay_menu(restaurant, Category, Item)


class Migration(migrations.Migration):
    dependencies = [
        ("item", "0012_seed_verified_pranay_menu"),
    ]

    operations = [
        migrations.RunPython(
            seed_pranay_menu_by_account_identity,
            reverse_code=migrations.RunPython.noop,
        ),
    ]
