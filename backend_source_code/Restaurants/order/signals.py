from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from .models import CartItem
import json

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
