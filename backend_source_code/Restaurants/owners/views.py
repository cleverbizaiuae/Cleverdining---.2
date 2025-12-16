from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.conf import settings
import requests

class GenerateImageView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        prompt = request.data.get('prompt')
        if not prompt:
            return Response({"error": "Prompt is required"}, status=400)

        api_key = settings.OPENAI_API_KEY
        if not api_key:
            return Response({"error": "OpenAI API key not configured"}, status=500)

        # Call OpenAI DALL-E 3
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
        payload = {
            "model": "dall-e-3",
            "prompt": prompt,
            "n": 1,
            "size": "1024x1024",
            "response_format": "b64_json" # Request base64 directly from OpenAI!
        }

        try:
            response = requests.post("https://api.openai.com/v1/images/generations", json=payload, headers=headers)
            response.raise_for_status()
            
            data = response.json()
            b64_data = data['data'][0]['b64_json']
            
            # Return as data URI
            return Response({"image": f"data:image/png;base64,{b64_data}"})
            
        except requests.exceptions.HTTPError as e:
            return Response({"error": f"OpenAI Error: {e.response.text}"}, status=400)
        except Exception as e:
            return Response({"error": str(e)}, status=500)
