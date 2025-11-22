from rest_framework import serializers
from .models import Category
from django.utils.text import slugify


class CategorySerializer(serializers.ModelSerializer):
    image = serializers.ImageField(required=False)
    class Meta:
        model = Category
        fields = ['id', 'Category_name', 'slug','image', 'parent_category', 'level']
        read_only_fields = ['slug', 'level']

    def create(self, validated_data):
        validated_data['slug'] = slugify(validated_data['Category_name'])
        return super().create(validated_data)
    


class CustomerCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ['id', 'Category_name', 'slug', 'image', 'parent_category', 'level']

class HierarchicalCategorySerializer(CategorySerializer):
    subcategories = serializers.SerializerMethodField()

    class Meta(CategorySerializer.Meta):
        fields = CategorySerializer.Meta.fields + ['subcategories']

    def get_subcategories(self, obj):
        if obj.level == 0: # Only fetch for top level to avoid deep recursion if not needed
             return HierarchicalCategorySerializer(obj.subcategories.all(), many=True).data
        return []

class SubCategorySerializer(serializers.ModelSerializer):
    image = serializers.ImageField(required=False)
    class Meta:
        model = Category
        fields = ['id', 'Category_name', 'parent_category', 'image']
        extra_kwargs = {'parent_category': {'required': True}}