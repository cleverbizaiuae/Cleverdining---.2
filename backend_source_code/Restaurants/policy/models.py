from django.db import models

# Create your models here.

class PrivacyPolicy(models.Model):
    text = models.TextField()

    def __str__(self):
        return f"Privacy Policy (ID: {self.id})"
    


class TermsAndConditions(models.Model):
    text = models.TextField()

    def __str__(self):
        return f"Terms & Conditions (ID: {self.id})"
    



class FAQ(models.Model):
    question = models.CharField(max_length=300)
    answer = models.TextField()

    def __str__(self):
        return self.question
