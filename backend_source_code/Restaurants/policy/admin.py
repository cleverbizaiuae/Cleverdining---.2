from django.contrib import admin
from .models import PrivacyPolicy, TermsAndConditions, FAQ

@admin.register(PrivacyPolicy)
class PrivacyPolicyAdmin(admin.ModelAdmin):
    list_display = ('id', 'short_text')

    def short_text(self, obj):
        return obj.text[:75] + ('...' if len(obj.text) > 75 else '')
    short_text.short_description = 'Privacy Policy Text'

@admin.register(TermsAndConditions)
class TermsAndConditionsAdmin(admin.ModelAdmin):
    list_display = ('id', 'short_text')

    def short_text(self, obj):
        return obj.text[:75] + ('...' if len(obj.text) > 75 else '')
    short_text.short_description = 'Terms & Conditions Text'

@admin.register(FAQ)
class FAQAdmin(admin.ModelAdmin):
    list_display = ('id', 'question', 'short_answer')

    def short_answer(self, obj):
        return obj.answer[:75] + ('...' if len(obj.answer) > 75 else '')
    short_answer.short_description = 'Answer'