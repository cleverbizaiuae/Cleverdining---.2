from django.db import models
from restaurant.models import Restaurant
from django.utils.text import slugify

# Create your models here.


class Category(models.Model):
    restaurant = models.ForeignKey(Restaurant, on_delete=models.CASCADE, related_name='categories')
    Category_name = models.CharField(max_length=100)
    slug = models.SlugField(max_length=100)
    image = models.ImageField(upload_to='media/category_images/', null=True, blank=True)
    icon = models.CharField(max_length=50, blank=True, null=True)
    icon_image = models.ImageField(upload_to='media/category_icons/', null=True, blank=True)
    
    # Hierarchical fields
    parent_category = models.ForeignKey('self', null=True, blank=True, on_delete=models.CASCADE, related_name='subcategories')
    level = models.IntegerField(default=0)

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = slugify(self.Category_name)
        
        # Auto-calculate level
        if self.parent_category:
            self.level = self.parent_category.level + 1
        else:
            self.level = 0
            
        super().save(*args, **kwargs)

    def __str__(self) -> str:
        return self.Category_name
