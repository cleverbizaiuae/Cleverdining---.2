from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.conf import settings
import requests

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
