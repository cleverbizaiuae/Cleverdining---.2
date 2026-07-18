from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from category.models import Category
from item.models import Item
from restaurant.models import Restaurant

from .models import CartItem, UpsellItemSetting, UpsellRule, UpsellSetting
from .upsell_cache import (
    invalidate_restaurant_upsell_config,
    invalidate_restaurant_upsell_menu,
    schedule_restaurant_upsell_warm,
)
import json


def _restaurant_id(instance):
    return getattr(instance, "restaurant_id", None) or getattr(instance, "id", None)


@receiver(post_save, sender=Item)
@receiver(post_delete, sender=Item)
@receiver(post_save, sender=Category)
@receiver(post_delete, sender=Category)
def invalidate_menu_intelligence(sender, instance, **kwargs):
    restaurant_id = _restaurant_id(instance)
    if restaurant_id:
        invalidate_restaurant_upsell_menu(restaurant_id)
        schedule_restaurant_upsell_warm(restaurant_id)


@receiver(post_save, sender=UpsellSetting)
@receiver(post_delete, sender=UpsellSetting)
@receiver(post_save, sender=UpsellItemSetting)
@receiver(post_delete, sender=UpsellItemSetting)
@receiver(post_save, sender=UpsellRule)
@receiver(post_delete, sender=UpsellRule)
@receiver(post_save, sender=Restaurant)
def invalidate_upsell_configuration(sender, instance, **kwargs):
    restaurant_id = _restaurant_id(instance)
    if restaurant_id:
        invalidate_restaurant_upsell_config(restaurant_id)
        schedule_restaurant_upsell_warm(restaurant_id)

@receiver(post_save, sender=CartItem)
@receiver(post_delete, sender=CartItem)
def broadcast_cart_update(sender, instance, **kwargs):
    """
    Broadcast cart updates to the specific guest session only.
    Strict Isolation: Only 'session_{id}' group gets the message.
    """
    try:
        cart = instance.cart
        guest_session = cart.guest_session
        
        if not guest_session:
            return

        channel_layer = get_channel_layer()
        group_name = f'session_{guest_session.id}'

        async_to_sync(channel_layer.group_send)(
            group_name,
            {
                'type': 'cart_updated',
                'cart_id': cart.id,
                'message': 'Cart has been updated'
            }
        )
        print(f"DEBUG: Broadcast cart_updated to {group_name}")
    except Exception as e:
        print(f"ERROR: Failed to broadcast cart update: {str(e)}")
