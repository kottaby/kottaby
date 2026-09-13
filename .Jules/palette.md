## 2026-03-30 - Dynamic Icon & ARIA Label for Copy Action Buttons
**Learning:** Copy action buttons that only change label text or tooltip leave screen reader users and visual users missing full feedback. Swapping the icon to a checkmark and updating `aria-label` to the completed state ("Copied!") provides immediate multi-sensory feedback.
**Action:** When adding or updating copy affordance buttons, ensure both the icon (`CheckOutlined`) and `aria-label` update dynamically alongside the status text.
