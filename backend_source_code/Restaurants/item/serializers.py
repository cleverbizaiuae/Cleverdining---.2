from rest_framework import serializers
from django.utils.text import slugify
from .models import Item


class ItemSerializer(serializers.ModelSerializer):
    image1 = serializers.ImageField(required=False)
    video = serializers.FileField(required=False)
    category_name = serializers.CharField(source='category.Category_name', read_only=True)
    restaurant_name = serializers.CharField(source='restaurant.resturent_name', read_only=True)
    availability = serializers.BooleanField(required=False, default=True)

    class Meta:
        model = Item
        fields = ['id', 'item_name', 'price', 'description', 'slug', 'category', 'sub_category', 'restaurant','category_name', 'image1','availability','video','restaurant_name', 'discount_percentage']
        read_only_fields = ['slug', 'restaurant']

    def create(self, validated_data):
        validated_data['slug'] = slugify(validated_data['item_name'])
        if 'availability' not in validated_data:
            validated_data['availability'] = True
        return super().create(validated_data)
    



