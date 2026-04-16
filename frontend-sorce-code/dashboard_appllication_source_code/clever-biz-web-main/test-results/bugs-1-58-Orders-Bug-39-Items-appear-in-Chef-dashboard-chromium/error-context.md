# Page snapshot

```yaml
- generic [ref=e3]:
  - complementary [ref=e4]:
    - img "CleverBiz" [ref=e6]
    - generic [ref=e7]:
      - link "Dashboard" [ref=e8] [cursor=pointer]:
        - /url: /chef
        - img [ref=e9]
        - text: Dashboard
      - link "OrderList" [ref=e14] [cursor=pointer]:
        - /url: /chef/orders
        - img [ref=e15]
        - text: OrderList
      - link "Messages" [ref=e18] [cursor=pointer]:
        - /url: /chef/messages
        - img [ref=e19]
        - text: Messages
    - button "Log Out" [ref=e22] [cursor=pointer]:
      - img [ref=e23]
      - generic [ref=e26]: Log Out
  - generic [ref=e27]:
    - banner [ref=e28]:
      - generic [ref=e30]:
        - heading "Dashboard" [level=1] [ref=e31]
        - paragraph [ref=e32]: Tuesday, 7 April 2026
      - generic [ref=e33]:
        - generic [ref=e34]:
          - paragraph [ref=e35]: Welcome, test.chef@example.com
          - paragraph [ref=e36]: chef
        - generic [ref=e39]: t
    - main [ref=e40]:
      - generic [ref=e42]: Loading dashboard...
```