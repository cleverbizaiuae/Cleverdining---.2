# Page snapshot

```yaml
- generic [ref=e4]:
  - img "CleverDining" [ref=e6]
  - generic [ref=e7]:
    - img [ref=e9]
    - heading "Forgot your password?" [level=1] [ref=e12]
    - paragraph [ref=e13]: Enter your registered email to receive a reset link.
  - generic [ref=e14]:
    - generic [ref=e15]:
      - generic [ref=e16]: Email Address
      - textbox "name@company.com" [ref=e17]: test.owner@example.com
      - paragraph [ref=e18]: "relation \"accounts_passwordresettoken\" does not exist LINE 1: SELECT COUNT(*) AS \"__count\" FROM \"accounts_passwordresettok... ^"
    - button "Send Reset Link" [ref=e19] [cursor=pointer]
  - link "Back to Login" [ref=e21] [cursor=pointer]:
    - /url: /admin-login
    - img [ref=e22]
    - text: Back to Login
```