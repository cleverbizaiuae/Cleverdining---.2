from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework import status
from django.conf import settings
import requests

from restaurant.models import Restaurant
from accounts.models import ChefStaff


class RestaurantSettingsView(APIView):
    """
    GET/PATCH restaurant settings including Google Review URL.
    
    Accessible by: Owner, Manager
    """
    permission_classes = [IsAuthenticated]
    
    def get_restaurant(self, user):
        """Get restaurant for the authenticated user"""
        if user.role == 'owner':
            return user.restaurants.first()
        elif user.role == 'manager':
            staff = ChefStaff.objects.filter(user=user, action='accepted').first()
            if staff:
                return staff.restaurant
        return None
    
    def get(self, request):
        restaurant = self.get_restaurant(request.user)
        if not restaurant:
            return Response({"error": "No restaurant found"}, status=status.HTTP_404_NOT_FOUND)
        
        return Response({
            "id": restaurant.id,
            "resturent_name": restaurant.resturent_name,
            "location": restaurant.location,
            "phone_number": restaurant.phone_number,
            "google_review_url": restaurant.google_review_url,
        })
    
    def patch(self, request):
        restaurant = self.get_restaurant(request.user)
        if not restaurant:
            return Response({"error": "No restaurant found"}, status=status.HTTP_404_NOT_FOUND)
        
        google_review_url = request.data.get('google_review_url')
        
        # Validate URL format if provided
        if google_review_url:
            google_review_url = google_review_url.strip()
            # Basic validation - should be a google domain
            if not google_review_url.startswith('http'):
                return Response(
                    {"error": "Invalid URL format. Must start with http:// or https://"},
                    status=status.HTTP_400_BAD_REQUEST
                )
            # Warn if not a Google domain (but still allow)
            # Most common formats:
            # - https://g.page/r/...
            # - https://search.google.com/local/writereview?placeid=...
            # - https://www.google.com/maps/place/...
        
        restaurant.google_review_url = google_review_url if google_review_url else None
        restaurant.save()
        
        return Response({
            "message": "Settings updated successfully",
            "google_review_url": restaurant.google_review_url
        })


class GenerateImageView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        import base64
        from urllib.parse import quote

        prompt = request.data.get('prompt')
        if not prompt:
            return Response({"error": "Prompt is required"}, status=400)

        # Free Version: Pollinations.ai
        # No API Key required.
        
        try:
            encoded_prompt = quote(prompt)
            # Add random seed to ensure freshness if needed, or just prompt
            # Pollinations returns the image binary directly
            image_url = f"https://image.pollinations.ai/prompt/{encoded_prompt}"
            
            response = requests.get(image_url)
            response.raise_for_status()
            
            # Convert binary to base64
            b64_data = base64.b64encode(response.content).decode('utf-8')
            
            # Detrmine mime type (usually jpeg from pollinations, but safe to default)
            content_type = response.headers.get('Content-Type', 'image/jpeg')
            
            # Return as data URI
            return Response({"image": f"data:{content_type};base64,{b64_data}"})
            
        except requests.exceptions.RequestException as e:
            return Response({"error": f"Generation Error: {str(e)}"}, status=500)
        except Exception as e:
            return Response({"error": str(e)}, status=500)

