from django.db import models
from category.models import Category
from restaurant.models import Restaurant
from django.utils.text import slugify

# Create your models here.


class Item(models.Model):
    item_name = models.CharField(max_length=255)
    price = models.DecimalField(max_digits=10, decimal_places=2)
    description = models.TextField()
    slug = models.SlugField(max_length=300)
    
    category = models.ForeignKey(Category, on_delete=models.CASCADE, related_name='items')
    sub_category = models.ForeignKey(Category, null=True, blank=True, on_delete=models.SET_NULL, related_name='sub_items')
    restaurant = models.ForeignKey(Restaurant, on_delete=models.CASCADE, related_name='items')
    
    image1 = models.ImageField(upload_to='media/item_images/', null=True, blank=True)

    availability = models.BooleanField(default=True)
    video = models.FileField(upload_to='media/item_videos/', null=True, blank=True)

    created_time = models.DateTimeField(auto_now_add=True)
    updated_time = models.DateTimeField(auto_now=True)
    

    def save(self, *args, **kwargs):
        
        if not self.slug:
            self.slug = slugify(self.item_name)
        super().save(*args, **kwargs)
    def __str__(self):
        return self.item_name