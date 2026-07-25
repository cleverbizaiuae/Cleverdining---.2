from django.db import migrations, models


def seed_display_order(apps, schema_editor):
    Category = apps.get_model("category", "Category")
    restaurant_ids = Category.objects.values_list("restaurant_id", flat=True).distinct()

    for restaurant_id in restaurant_ids:
        parent_ids = (
            Category.objects.filter(restaurant_id=restaurant_id)
            .values_list("parent_category_id", flat=True)
            .distinct()
        )
        for parent_id in parent_ids:
            siblings = Category.objects.filter(
                restaurant_id=restaurant_id,
                parent_category_id=parent_id,
            ).order_by("id")
            for index, category in enumerate(siblings):
                Category.objects.filter(pk=category.pk).update(display_order=index)


class Migration(migrations.Migration):
    dependencies = [
        ("category", "0007_category_category_type"),
    ]

    operations = [
        migrations.AddField(
            model_name="category",
            name="display_order",
            field=models.PositiveIntegerField(db_index=True, default=0),
        ),
        migrations.AlterModelOptions(
            name="category",
            options={"ordering": ["display_order", "id"]},
        ),
        migrations.RunPython(seed_display_order, migrations.RunPython.noop),
    ]
