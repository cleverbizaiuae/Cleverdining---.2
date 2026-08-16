from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework import status
from django.conf import settings
from django.utils.dateparse import parse_time
import requests

from restaurant.models import Restaurant
from accounts.models import ChefStaff


class RestaurantSettingsView(APIView):
    """
    GET/PATCH restaurant settings including Google Review URL.
    
    Accessible by: Owner, Manager
    """
    permission_classes = [IsAuthenticated]

    @staticmethod
    def settings_payload(restaurant):
        return {
            "id": restaurant.id,
            "resturent_name": getattr(restaurant, 'resturent_name', '') or '',
            "location": getattr(restaurant, 'location', '') or '',
            "phone_number": getattr(restaurant, 'phone_number', '') or '',
            "google_review_url": getattr(restaurant, 'google_review_url', None),
            "reservation_duration_minutes": int(
                getattr(restaurant, 'reservation_duration_minutes', 90) or 90
            ),
            "reservation_slot_start": restaurant.reservation_slot_start.strftime('%H:%M'),
            "reservation_slot_end": restaurant.reservation_slot_end.strftime('%H:%M'),
        }
    
    def get_restaurant(self, user):
        """Get restaurant for the authenticated user - BULLETPROOF"""
        try:
            if getattr(user, 'role', None) == 'owner':
                if hasattr(user, 'restaurants') and user.restaurants.exists():
                    return user.restaurants.first()
                # Fallback: Check Restaurant model directly  
                return Restaurant.objects.filter(owner=user).first()
            elif getattr(user, 'role', None) in ['manager', 'chef', 'staff']:
                staff = ChefStaff.objects.filter(user=user, action='accepted').first()
                if staff:
                    return staff.restaurant
        except Exception as e:
            print(f"get_restaurant error: {e}")
        return None
    
    def get(self, request):
        try:
            restaurant = self.get_restaurant(request.user)
            if not restaurant:
                return Response({
                    "id": None,
                    "resturent_name": "No Restaurant",
                    "location": "",
                    "phone_number": "",
                    "google_review_url": None,
                    "error": "No restaurant found for this user"
                }, status=status.HTTP_200_OK)  # Return 200 with empty data to prevent UI crash
            
            return Response(self.settings_payload(restaurant))
        except Exception as e:
            print(f"RestaurantSettingsView.get error: {e}")
            import traceback
            traceback.print_exc()
            return Response({
                "id": None,
                "resturent_name": "Error",
                "location": "",
                "phone_number": "",
                "google_review_url": None,
                "error": str(e)
            }, status=status.HTTP_200_OK)  # Return 200 to prevent UI crash
    
    def patch(self, request):
        try:
            restaurant = self.get_restaurant(request.user)
            if not restaurant:
                return Response({"error": "No restaurant found"}, status=status.HTTP_404_NOT_FOUND)
            
            updated_fields = []

            if 'google_review_url' in request.data:
                google_review_url = request.data.get('google_review_url')
                if google_review_url:
                    google_review_url = str(google_review_url).strip()
                    if not google_review_url.startswith(('http://', 'https://')):
                        return Response(
                            {"error": "Invalid URL format. Must start with http:// or https://"},
                            status=status.HTTP_400_BAD_REQUEST,
                        )
                restaurant.google_review_url = google_review_url or None
                updated_fields.append('google_review_url')

            if 'reservation_duration_minutes' in request.data:
                try:
                    duration = int(request.data.get('reservation_duration_minutes'))
                except (TypeError, ValueError):
                    return Response(
                        {"reservation_duration_minutes": ["Enter a whole number of minutes."]},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                if not 15 <= duration <= 480:
                    return Response(
                        {"reservation_duration_minutes": ["Duration must be between 15 and 480 minutes."]},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                restaurant.reservation_duration_minutes = duration
                updated_fields.append('reservation_duration_minutes')

            start = restaurant.reservation_slot_start
            end = restaurant.reservation_slot_end
            if 'reservation_slot_start' in request.data:
                start = parse_time(str(request.data.get('reservation_slot_start') or ''))
                if start is None:
                    return Response(
                        {"reservation_slot_start": ["Enter a valid time in HH:MM format."]},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
            if 'reservation_slot_end' in request.data:
                end = parse_time(str(request.data.get('reservation_slot_end') or ''))
                if end is None:
                    return Response(
                        {"reservation_slot_end": ["Enter a valid time in HH:MM format."]},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
            if start >= end:
                return Response(
                    {"reservation_slot_end": ["Reservation end time must be after the start time."]},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if 'reservation_slot_start' in request.data:
                restaurant.reservation_slot_start = start
                updated_fields.append('reservation_slot_start')
            if 'reservation_slot_end' in request.data:
                restaurant.reservation_slot_end = end
                updated_fields.append('reservation_slot_end')

            if updated_fields:
                restaurant.save(update_fields=[*updated_fields, 'updated_at'])

            return Response({
                "message": "Settings updated successfully",
                **self.settings_payload(restaurant),
            })
        except Exception as e:
            print(f"RestaurantSettingsView.patch error: {e}")
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


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
