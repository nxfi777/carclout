# Umami Analytics Reports Guide

## Quick Start: Your First 4 Reports

Build these reports in your [Umami dashboard](https://umami.is/docs/cloud/reports) to immediately understand your business:

---

## 🎯 **Report 1: Activation Event Performance** (Insights)

**What it shows:** Which activation events are firing and how often

**How to build:**
1. Go to **Reports** → **Create** → **Insights**
2. **Name:** "Activation Event Performance"
3. **Date Range:** Last 30 days
4. **Metrics:** Event count
5. **Events to include:**
   - `activation:first-template`
   - `activation:first-vehicle`
   - `activation:first-message`
   - `activation:first-upload`
6. **Breakdown:** By event name
7. **Save**

**What to look for:**
- `activation:first-template` should be your highest (70%+ of new users)
- If `activation:first-vehicle` is low, your vehicle onboarding needs work
- If `activation:first-message` is low, users aren't discovering community

**Action:** Focus on improving the activation events with lowest rates

---

## 💰 **Report 2: Credits Depletion → Purchase Funnel** (Funnel)

**What it shows:** How many users convert after hitting usage limits

**How to build:**
1. Go to **Reports** → **Create** → **Funnel**
2. **Name:** "Credits Depletion → Purchase"
3. **Date Range:** Last 30 days
4. **Steps:**
   - Step 1: Event `monetization:usage-limit-hit`
   - Step 2: Event `monetization:checkout-start`
   - Step 3: Event `monetization:checkout-complete`
5. **Window:** 7 days (users have week to convert)
6. **Save**

**What to look for:**
- **Step 1 → 2 conversion:** Should be 40%+ (if not, your CTA isn't compelling)
- **Step 2 → 3 conversion:** Should be 70%+ (if not, checkout has issues)
- **Overall conversion:** Target 25%+ from usage limit to purchase

**Hormozi principle:** *"Present offer at moment of highest intent"* - This is that moment!

---

## 📈 **Report 3: Activated vs Non-Activated Retention** (Retention)

**What it shows:** Proof that activation = retention

**How to build:**

**First, create Segment 1: Activated Users**
1. Go to **Settings** → **Segments**
2. **Create Segment:** "Activated Users (3+ events)"
3. **Filters:**
   - Event count ≥ 3
   - Event name contains "activation:"
4. **Save**

**Then, create Segment 2: Non-Activated Users**  
1. **Create Segment:** "Non-Activated Users (0-2 events)"
2. **Filters:**
   - Event count < 3
   - Event name contains "activation:"
3. **Save**

**Build Retention Report:**
1. Go to **Reports** → **Create** → **Retention**
2. **Name:** "Activated vs Non-Activated Retention"
3. **Date Range:** Last 90 days
4. **Cohort:** By week
5. **Compare Segments:**
   - Segment 1: "Activated Users"
   - Segment 2: "Non-Activated Users"
6. **Save**

**What to look for:**
- **D7 Retention:** Activated should be 2-3x higher
- **D30 Retention:** Activated should be 3-4x higher
- **Gap widening:** The gap should get bigger over time

**This proves:** Getting users to 3+ activation events is critical!

---

## 🎯 **Report 4: Week 1 Activation Goals** (Goals)

**What it shows:** % of new users hitting activation milestones

**How to build:**
1. Go to **Reports** → **Create** → **Goals**
2. **Name:** "Week 1 Activation Goals"
3. **Date Range:** Last 30 days
4. **Goals to track:**

**Goal 1: First Template**
- **Event:** `activation:first-template`
- **Target:** 70% of new users
- **Window:** First 7 days after signup

**Goal 2: First Vehicle**
- **Event:** `activation:first-vehicle`
- **Target:** 50% of new users
- **Window:** First 7 days after signup

**Goal 3: First Message**
- **Event:** `activation:first-message`
- **Target:** 40% of new users
- **Window:** First 7 days after signup

5. **Save**

**What to look for:**
- If < 70% hit first template: Your onboarding is broken
- If < 40% hit first message: Users aren't discovering community
- **Track weekly:** Are your improvements working?

---

## 📊 **Additional High-Value Reports**

### **Funnel: User Activation Journey**
Track the complete activation path:
```
Step 1: Page view /dashboard
Step 2: Any activation:* event (1st activation)
Step 3: 2nd unique activation:* event
Step 4: 3rd unique activation:* event (fully activated!)
```
**Goal:** 60%+ complete all steps in Week 1

### **Journey: Path to First Template**
See what pages users visit before generating first template:
- **Start:** Landing page or /auth/signup
- **End:** Event `activation:first-template`
- **Analysis:** Identify common paths and bottlenecks

### **Insights: Friction Hotspots**
Find your biggest problems:
- **Events:** All `friction:*` events
- **Breakdown:** By event type
- **Sort:** Descending by count
- **Fix:** Top 3 friction points each month

### **Breakdown: Events by User Plan**
See how different plans behave:
- **Events:** All engagement:* events
- **Breakdown:** By custom property "plan"
- **Analysis:** Do pro users generate more templates?

### **Cohort: Weekly Signup Cohorts**
Track if product improvements are working:
- **Cohort by:** Week of signup
- **Metric:** D30 retention rate
- **Compare:** Recent cohorts vs older ones
- **Goal:** Each cohort should be better than the last

---

## 🔧 **Technical Implementation Notes**

### **How Events Flow to Umami**

```typescript
// 1. Component dispatches event
window.dispatchEvent(new CustomEvent("template-generated", { 
  detail: { templateId: "123", source: "vehicle" }
}));

// 2. UmamiTracker listens and maps
const mapping = {
  "template-generated": "engagement:template"
};

// 3. UmamiTracker calls Umami
umami.track("engagement:template", { 
  templateId: "123", 
  source: "vehicle" 
});

// 4. Event appears in Umami dashboard within minutes
```

### **User Identification**

We're already setting distinct IDs via `identifyFromSession()`:

```typescript
await identifyUser(distinctId, {
  role: role || undefined,
  plan: plan || undefined,
  emailHash: await createDeterministicHash(email)
});
```

This allows:
- ✅ Tracking users across sessions
- ✅ Creating user-level segments
- ✅ Accurate retention calculations

### **Custom Properties for Segmentation**

Events include contextual data for breakdown analysis:

```typescript
// Template generation includes source
{ template_slug: "carbon-fiber", image_source: "vehicle" }

// Checkout includes plan
{ plan: "minimum", interval: "monthly" }

// Messages include channel
{ channel: "showroom", hasAttachments: true }
```

Use these in **Breakdown Reports** to segment analysis.

---

## 📈 **Success Metrics by Report Type**

### **Activation (Week 1)**
- ✅ 70%+ generate first template
- ✅ 50%+ add first vehicle
- ✅ 60%+ hit 3+ activation events
- ✅ 40%+ send first community message

### **Monetization**
- ✅ 25%+ convert within 7 days of hitting usage limit
- ✅ 40%+ who hit limit start checkout
- ✅ 70%+ who start checkout complete purchase

### **Retention**
- ✅ D7: 40%+ (activated users: 70%+)
- ✅ D30: 25%+ (activated users: 60%+)
- ✅ Activated users have 3-4x better D30 retention

### **Engagement**
- ✅ Power users (10+ templates): 20% of active users
- ✅ Community active (5+ messages): 30% of active users
- ✅ Template success rate: 90%+ (< 10% friction events)

---

## 🔍 **Analyzing Your Reports**

### **Weekly Review Checklist**

**Monday Morning:**
1. Check **Goals Report** - Are we hitting activation targets?
2. Check **Funnel: Credits → Purchase** - Is conversion rate improving?
3. Check **Insights: Friction** - Any new pain points?

**Monthly Deep Dive:**
1. **Retention Report** - Compare this month's cohort to last month
2. **Journey Reports** - Find new optimization opportunities
3. **Breakdown Reports** - Identify segments to target

### **Red Flags to Watch For**

🚨 **First template activation < 60%:** Onboarding is broken
🚨 **Usage limit conversion < 15%:** Offer/pricing needs work
🚨 **Friction events increasing:** Product quality degrading
🚨 **D7 retention dropping:** Something broke in activation
🚨 **Activated users declining:** Traffic quality issue

---

## 💡 **Hormozi Principles Applied**

### **1. Activation Points**
> "Every customer that does (X thing) stays for longer than customers who don't"

**How we track:** Retention report comparing activated vs non-activated users

### **2. Usage Churn**
> "A leading indicator of churn is when a customer stops using the product"

**How we track:** Engagement event counts dropping (build alert when user has 0 events for 7 days)

### **3. Community Retention**
> "It's easy to quit a membership, it's hard to leave a relationship"

**How we track:** Retention report comparing users with community events vs without

### **4. Monetization Timing**
> "Present offer at moment of highest intent"

**How we track:** Funnel from usage-limit-hit to checkout-complete, measure time between steps

---

## 🚀 **Next Steps**

1. ✅ **Build the 4 priority reports** (30 minutes total)
2. ✅ **Check reports daily for first week** (get familiar with data)
3. ✅ **Set weekly review calendar** (every Monday at 9am)
4. ✅ **Create Slack/notification alerts** for red flags
5. ✅ **Share reports with team** (make data-driven decisions)

**Expected Results:**
- Week 1: Establish baselines
- Week 2: Identify biggest opportunity
- Week 3: Ship first optimization
- Month 2: See measurable improvements in retention/conversion

The events are tracking. The infrastructure is ready. Now build the reports and let the data guide your decisions! 🎯

