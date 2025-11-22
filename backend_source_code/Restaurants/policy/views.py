from django.shortcuts import render
from .serializers import PrivacyPolicySerializer, TermsAndConditionsSerializer, FAQSerializer
from .models import PrivacyPolicy, TermsAndConditions, FAQ
from rest_framework import viewsets, permissions
from accounts.permissions import IsAllowedRoleAndAdmin
# Create your views here.


class PrivacyPolicyViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated, IsAllowedRoleAndAdmin]
    queryset = PrivacyPolicy.objects.all()
    serializer_class = PrivacyPolicySerializer


class TermsAndConditionsViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated, IsAllowedRoleAndAdmin]
    queryset = TermsAndConditions.objects.all()
    serializer_class = TermsAndConditionsSerializer


class FAQViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated, IsAllowedRoleAndAdmin]
    queryset = FAQ.objects.all()
    serializer_class = FAQSerializer