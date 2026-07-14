from django.db import migrations


def seed_verified_pranay_menu(apps, schema_editor):
    Restaurant = apps.get_model("restaurant", "Restaurant")
    BrandConfig = apps.get_model("restaurant", "BrandConfig")
    Category = apps.get_model("category", "Category")
    Item = apps.get_model("item", "Item")

    restaurant = Restaurant.objects.filter(
        pk=8,
        phone_number="17678060045",
    ).first()
    if restaurant is None:
        return
    if not BrandConfig.objects.filter(
        restaurant_id=restaurant.pk,
        restaurant_name__iexact="Pranay",
    ).exists():
        return

    from item.pranay_menu import seed_pranay_menu

    seed_pranay_menu(restaurant, Category, Item)


class Migration(migrations.Migration):
    dependencies = [
        ("item", "0011_seed_pranay_production_menu"),
        ("restaurant", "0022_brandconfig_pay_before_order"),
    ]

    operations = [
        migrations.RunPython(
            seed_verified_pranay_menu,
            reverse_code=migrations.RunPython.noop,
        ),
    ]
