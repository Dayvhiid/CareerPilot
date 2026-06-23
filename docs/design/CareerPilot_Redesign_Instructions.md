# CareerPilot — Landing Page Redesign Brief
> Complete implementation instructions for an AI-powered IDE

---

## 1. Aesthetic Direction & Vision

**Theme: "Dark Editorial Premium"**

CareerPilot must feel like a luxury editorial brand — the intersection of a high-end design magazine and a powerful AI tool. Think *Financial Times* meets *Linear.app*. Not another cheerful, purple-gradient SaaS. This design signals that CareerPilot is the serious professional's choice.

**The one thing a visitor will remember:** A dramatic, near-black canvas with warm amber-gold typography and a glowing resume mockup that feels like it's alive.

**Core mood:** Confident, cinematic, precise, aspirational.

---

## 2. Design System

### 2.1 Color Palette

Define all colors as CSS custom properties at the `:root` level:

```css
:root {
  --bg-primary: #08080E;          /* Near-black page background */
  --bg-surface: #0F0F18;          /* Card/section backgrounds */
  --bg-surface-2: #16162A;        /* Elevated surface (hover states) */
  --bg-glass: rgba(255,255,255,0.04); /* Frosted glass panels */

  --accent-gold: #C9973A;         /* Primary brand gold */
  --accent-gold-bright: #E8B45A;  /* Hover/glow state gold */
  --accent-gold-dim: #7A5B22;     /* Subdued gold for borders */

  --text-primary: #F0EDE6;        /* Warm off-white — NOT pure white */
  --text-secondary: #8A8580;      /* Muted body text */
  --text-tertiary: #504E4A;       /* Hints, placeholders */

  --border-subtle: rgba(201, 151, 58, 0.12); /* Faint gold border */
  --border-mid: rgba(201, 151, 58, 0.28);    /* Visible gold border */
  --border-strong: rgba(201, 151, 58, 0.55); /* Accent border */

  --glow-gold: 0 0 60px rgba(201, 151, 58, 0.15); /* Ambient glow */
  --glow-gold-intense: 0 0 30px rgba(201, 151, 58, 0.35); /* Hover glow */

  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 16px;
  --radius-xl: 24px;
}
```

### 2.2 Typography

Import from Google Fonts (add to `<head>`):
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300;1,400&family=DM+Sans:wght@300;400;500&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
```

**Font Roles:**
- `'Cormorant Garamond', serif` — Hero headlines, section display titles. Elegant, editorial, unexpected.
- `'DM Sans', sans-serif` — Body text, nav links, card descriptions, button labels.
- `'JetBrains Mono', monospace` — Tags, badges, step numbers, labels, code-like UI chips.

**Type Scale:**
```css
/* Display — Hero h1 */
font-size: clamp(3.5rem, 7vw, 6.5rem);
font-weight: 300;                         /* Extra-light for elegance */
line-height: 1.05;
letter-spacing: -0.02em;
font-family: 'Cormorant Garamond', serif;

/* Section Heading — h2 */
font-size: clamp(2rem, 4vw, 3.5rem);
font-weight: 300;
font-family: 'Cormorant Garamond', serif;
line-height: 1.1;

/* Sub-heading — h3 */
font-size: 1.1rem;
font-weight: 500;
font-family: 'DM Sans', sans-serif;
letter-spacing: 0.02em;

/* Body */
font-size: 0.975rem;
font-weight: 300;
font-family: 'DM Sans', sans-serif;
line-height: 1.75;

/* Mono label / badge */
font-size: 0.72rem;
font-weight: 500;
font-family: 'JetBrains Mono', monospace;
letter-spacing: 0.08em;
text-transform: uppercase;
```

### 2.3 Background Texture

Apply a subtle grid pattern to the page background using a CSS `background-image`. This creates a faint architectural grid that gives depth without noise:

```css
body {
  background-color: var(--bg-primary);
  background-image:
    linear-gradient(var(--border-subtle) 1px, transparent 1px),
    linear-gradient(90deg, var(--border-subtle) 1px, transparent 1px);
  background-size: 60px 60px;
}
```

Additionally, add a large radial spotlight gradient centered on the hero section:
```css
/* Add this as a fixed::before pseudo-element on body */
body::before {
  content: '';
  position: fixed;
  top: -20%;
  left: 50%;
  transform: translateX(-50%);
  width: 900px;
  height: 900px;
  background: radial-gradient(ellipse, rgba(201,151,58,0.07) 0%, transparent 65%);
  pointer-events: none;
  z-index: 0;
}
```

---

## 3. Global Layout Rules

- Max content width: **1200px**, centered with `margin: 0 auto`
- Horizontal padding: `clamp(1.5rem, 5vw, 5rem)` on all sections
- All sections use `position: relative; z-index: 1` to appear above background effects
- Vertical section spacing: `padding: clamp(5rem, 10vw, 9rem) 0`
- No section has a solid colored background — all are transparent, layered over the grid

---

## 4. Section-by-Section Instructions

---

### SECTION 1: Navigation / Header

**Layout:** Fixed top bar. Full width. Transparent initially, blurs on scroll.

**Structure:**
```
[  CareerPilot (logo)    ]  [  Features   How It Works   About  ]  [  Login  |  Get Started →  ]
```

**Styling:**
- Height: `72px`
- Initial state: `background: transparent`
- Scrolled state (add class `.scrolled` via JS on scroll > 40px):
  ```css
  background: rgba(8, 8, 14, 0.85);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-bottom: 1px solid var(--border-subtle);
  ```
- Transition: `all 0.4s ease`

**Logo:**
- Text: `CareerPilot`
- Style: `font-family: 'Cormorant Garamond'; font-weight: 600; font-size: 1.4rem; color: var(--text-primary)`
- Add a small gold dot or typographic ornament before the text: a `·` in `var(--accent-gold)` with `margin-right: 6px`

**Nav Links:**
- Font: DM Sans, 0.875rem, weight 300
- Color: `var(--text-secondary)`
- Hover: `color: var(--text-primary)`, with a `0.3s ease` transition
- No underlines. No borders. Just color shift.

**CTA Buttons:**
- `Login` — ghost style: transparent background, `1px solid var(--border-mid)`, text color `var(--text-secondary)`. Hover: border becomes `var(--accent-gold)`, text becomes `var(--accent-gold)`.
- `Get Started →` — filled: `background: var(--accent-gold)`, text `#08080E` (dark), `font-weight: 500`. Hover: `background: var(--accent-gold-bright)`, `box-shadow: var(--glow-gold-intense)`. Both buttons: `border-radius: var(--radius-md)`, `padding: 0.5rem 1.25rem`, `font-size: 0.875rem`.

**Mobile (≤768px):**
- Hide nav links
- Show hamburger icon (`☰`) in gold color
- Clicking opens a full-screen overlay menu with nav links stacked vertically, large Cormorant Garamond font

---

### SECTION 2: Hero

**Layout:** Full viewport height (`min-height: 100vh`). Two-column grid: 55% left text / 45% right visual. Vertically centered. No background color — sits directly on the grid texture.

**Left Column — `.hero-text`:**

1. **Eyebrow label** (above h1):
   - Text: `AI-POWERED CAREER TOOLS`
   - Font: JetBrains Mono, 0.7rem, uppercase, letter-spacing 0.12em
   - Color: `var(--accent-gold)`
   - Add a `2px` wide, `24px` tall gold vertical bar (`border-left: 2px solid var(--accent-gold)`) to the left with `padding-left: 12px`
   - Animate in: `opacity: 0 → 1`, `translateY(10px → 0)`, delay `0.1s`

2. **H1 — Main Headline:**
   - Text (split across lines for visual rhythm):
     ```
     Land Your
     Dream Job
     Faster.
     ```
   - The word **"Faster."** should be in italic (`font-style: italic`) using Cormorant Garamond's italic cut, and colored `var(--accent-gold)`.
   - Font: Cormorant Garamond, weight 300, `clamp(3.5rem, 6vw, 6rem)`
   - Color: `var(--text-primary)` for all except "Faster."
   - Line height: 1.0
   - Animate in: stagger each line with `opacity: 0 → 1`, `translateY(20px → 0)`, ease-out, delays of 0.2s, 0.35s, 0.5s

3. **Subtitle paragraph:**
   - Text: `Chat with AI, get a job-winning resume in minutes. ATS-optimized. Professionally designed. Ready to download.`
   - Font: DM Sans, 0.975rem, weight 300, color `var(--text-secondary)`, line-height 1.75
   - Max-width: `480px`
   - Margin top: `1.75rem`
   - Animate in: `opacity: 0 → 1`, delay `0.65s`

4. **CTA Button Row:**
   - Two buttons side by side, gap `1rem`
   - Primary: `Get Started Free →`
     - Background: `var(--accent-gold)`, text: `#08080E`, font: DM Sans 500, `0.9rem`
     - Padding: `0.85rem 2rem`
     - Border-radius: `var(--radius-md)`
     - Hover: `background: var(--accent-gold-bright)`, `transform: translateY(-2px)`, `box-shadow: var(--glow-gold-intense)`
     - Transition: `all 0.25s ease`
   - Secondary: `See how it works ↓`
     - Background: transparent, border: `1px solid var(--border-mid)`, text: `var(--text-secondary)`
     - Same padding/radius as primary
     - Hover: `border-color: var(--accent-gold)`, `color: var(--text-primary)`
   - Animate in: `opacity: 0 → 1`, delay `0.8s`

5. **Social proof strip** (below buttons, margin-top `2rem`):
   - Three small items in a row:
     - `✦ 50,000+ resumes created`
     - `✦ 4.9/5 average rating`
     - `✦ ATS success rate 94%`
   - Font: JetBrains Mono, 0.68rem, uppercase, letter-spacing 0.06em
   - Color: `var(--text-tertiary)`
   - The `✦` symbol in `var(--accent-gold)`
   - Separated by `·` dividers

**Right Column — `.hero-visual`:**

Replace the existing plain resume mockup with a sophisticated glowing terminal/card:

1. **Outer container:**
   - Background: `var(--bg-glass)` (`rgba(255,255,255,0.04)`)
   - Border: `1px solid var(--border-mid)`
   - Border-radius: `var(--radius-xl)` (24px)
   - Padding: `2rem`
   - Box-shadow: `var(--glow-gold)`, `inset 0 1px 0 rgba(255,255,255,0.05)`
   - CSS animation: `float` keyframe — `translateY(0px) → translateY(-12px) → translateY(0px)`, duration `5s`, ease-in-out, infinite

2. **Top bar of the card (like a browser/terminal bar):**
   - Three small circles (12px diameter) in a row: red (`#FF5F57`), yellow (`#FEBC2E`), green (`#28C840`)
   - Label to the right: `resume-builder.ai` in JetBrains Mono, 0.7rem, `var(--text-tertiary)`

3. **Chat interface simulation** (inside the card):
   - Show 3 chat bubbles alternating left/right to simulate a conversation:
     - User bubble (right-aligned): `"I'm a software engineer with 5 years experience..."` — background `var(--accent-gold-dim)`, rounded on left side
     - AI bubble (left-aligned): `"Creating your tailored resume now..."` — background `var(--bg-surface-2)`, border `1px solid var(--border-subtle)`
     - AI bubble: `"✓ Resume generated! Download ready."` — with a small gold checkmark icon, slightly brighter border
   - Font: DM Sans, 0.8rem
   - Bubble padding: `0.6rem 0.85rem`
   - Border-radius: `12px`

4. **Resume preview card** (below chat):
   - A mini resume card with horizontal rules for "text lines":
     - Header area: dark block `40px × 8px` (name placeholder) + smaller blocks for contact info
     - Three "sections" each with a 1px gold top border and gray bar lines
   - These blocks should have a subtle shimmer animation (see below)

5. **Shimmer animation** for resume lines:
   ```css
   @keyframes shimmer {
     0% { background-position: -400px 0; }
     100% { background-position: 400px 0; }
   }
   .resume-line {
     background: linear-gradient(90deg, var(--bg-surface-2) 25%, var(--bg-surface) 50%, var(--bg-surface-2) 75%);
     background-size: 800px 100%;
     animation: shimmer 2.5s infinite linear;
   }
   ```

6. **Floating badge** (top-right corner of the card, slightly overlapping outside):
   - Small pill: `⚡ Generating...`
   - Background: `var(--accent-gold)`, text: `#08080E`
   - Font: JetBrains Mono, 0.65rem
   - Animation: pulse opacity `0.7 → 1 → 0.7`, 2s infinite

**Hero — Enter animations:**
All hero elements start hidden (`opacity: 0`) and fade/slide in via CSS `@keyframes` with staggered `animation-delay`. Use:
```css
@keyframes fadeUp {
  from { opacity: 0; transform: translateY(24px); }
  to   { opacity: 1; transform: translateY(0); }
}
```

---

### SECTION 3: Marquee / Logo Bar

**Purpose:** Social proof. Appears just below the hero fold.

**Layout:** Full-width horizontal strip. No container limit.

**Design:**
- Background: `var(--border-subtle)` as a 1px top and bottom border line. No background fill.
- Text: `TRUSTED BY PROFESSIONALS AT` in JetBrains Mono, 0.65rem, `var(--text-tertiary)`, centered above the marquee
- Content: A continuously scrolling marquee of company names (or use placeholder names):
  - `Google · McKinsey · Goldman Sachs · Deloitte · Amazon · Microsoft · Meta · Accenture · JP Morgan · Tesla`
- Font: Cormorant Garamond, italic, 1.1rem, `var(--text-tertiary)`
- Implement using CSS `@keyframes marquee` — translate from `0%` to `-50%` over `30s linear infinite`
- Duplicate the list twice inside the container so scrolling is seamless
- On hover: `animation-play-state: paused`

---

### SECTION 4: Features

**Section Title Block:**
- Eyebrow: `WHAT WE OFFER` — JetBrains Mono, uppercase, `var(--accent-gold)`, same vertical-bar style as hero eyebrow
- H2: `Everything you need to land the interview` — Cormorant Garamond, light italic, centered
- Subtitle: `Built for modern job seekers. Powered by AI.` — DM Sans, `var(--text-secondary)`, centered

**Feature Grid:**
- Layout: CSS Grid, `repeat(3, 1fr)` on desktop, `repeat(2, 1fr)` on tablet, `1fr` on mobile
- Gap: `1.5rem`
- 6 cards total

**Each Feature Card — `.feature-card`:**
- Background: `var(--bg-glass)` (`rgba(255,255,255,0.03)`)
- Border: `1px solid var(--border-subtle)`
- Border-radius: `var(--radius-lg)` (16px)
- Padding: `2rem`
- Transition: `all 0.3s ease`
- On hover:
  - `border-color: var(--border-strong)`
  - `background: rgba(255,255,255,0.06)`
  - `transform: translateY(-4px)`
  - `box-shadow: var(--glow-gold)`

**Card Interior:**

1. **Icon container:**
   - 48px × 48px square
   - Background: `rgba(201, 151, 58, 0.1)`
   - Border: `1px solid var(--accent-gold-dim)`
   - Border-radius: `var(--radius-md)`
   - Contains the icon (use a Unicode symbol or inline SVG — NOT an img tag)
   - Icon color: `var(--accent-gold)`, size: 22px

2. **Feature title** — `h3`, DM Sans, 500 weight, 1rem, `var(--text-primary)`, margin-top `1.25rem`

3. **Feature description** — DM Sans, 300 weight, 0.9rem, `var(--text-secondary)`, line-height 1.7, margin-top `0.5rem`

**Feature Content:**
Use these 6 features with these icons (Unicode/emoji icon suggestions for placeholder):
| # | Icon | Title | Description |
|---|------|-------|-------------|
| 1 | `◆` | AI-Powered Chat | Just talk to the AI. No forms, no templates. Describe your experience naturally. |
| 2 | `▣` | Professional Designs | Choose from curated resume layouts trusted by hiring managers at top companies. |
| 3 | `↓` | Instant Download | Export to PDF in one click. Your resume is ready the moment you are. |
| 4 | `◉` | Mobile Friendly | Build and edit your resume from any device, anywhere, anytime. |
| 5 | `✓` | ATS Optimized | Every resume is structured to pass applicant tracking systems automatically. |
| 6 | `⬡` | Bank-Grade Security | Your data is encrypted and never shared. What you share stays private. |

---

### SECTION 5: How It Works

**Layout:** Alternating or full-width 3-column steps layout. Different visual treatment from Features to break up rhythm.

**Section background treatment:** Add a very subtle `radial-gradient` glow behind this section:
```css
.how-it-works {
  position: relative;
}
.how-it-works::before {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse 80% 50% at 50% 50%, rgba(201,151,58,0.05) 0%, transparent 70%);
  pointer-events: none;
}
```

**Section Title Block:**
- Same pattern: eyebrow + h2 + subtitle
- Eyebrow: `THE PROCESS`
- H2: `From conversation to career opportunity`
- Subtitle: `Three steps. Zero hassle.`

**Steps — horizontal layout on desktop, vertical on mobile:**
- Connector line between steps: a `1px` dashed horizontal line in `var(--border-mid)` running through the center of the step numbers

**Each Step:**

1. **Step Number Badge:**
   - Font: JetBrains Mono, `1.5rem`, `var(--accent-gold)`
   - Background: `rgba(201,151,58,0.08)`
   - Border: `1px solid var(--accent-gold-dim)`
   - Width/height: `56px`, `border-radius: 50%`
   - Display: flex, center-aligned

2. **Step Title:** DM Sans, 500, `1rem`, `var(--text-primary)`, margin-top `1rem`

3. **Step Description:** DM Sans, 300, `0.875rem`, `var(--text-secondary)`, line-height 1.7

**Step Content:**
| # | Title | Description |
|---|-------|-------------|
| 1 | Chat with AI | Tell the AI about your background, skills, and target role. No rigid forms — just a conversation. |
| 2 | AI Builds Your Resume | The AI structures, writes, and formats your resume in seconds. Fully tailored to your experience. |
| 3 | Download & Apply | Pick your layout, export as PDF, and start applying. It's that fast. |

**Scroll reveal animation:** Each step fades up as it enters the viewport. Use `IntersectionObserver`:
```js
const observer = new IntersectionObserver((entries) => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      e.target.classList.add('visible');
    }
  });
}, { threshold: 0.2 });
document.querySelectorAll('.step').forEach(el => observer.observe(el));
```
CSS:
```css
.step {
  opacity: 0;
  transform: translateY(30px);
  transition: opacity 0.6s ease, transform 0.6s ease;
}
.step.visible {
  opacity: 1;
  transform: translateY(0);
}
.step:nth-child(2) { transition-delay: 0.15s; }
.step:nth-child(3) { transition-delay: 0.3s; }
```

---

### SECTION 6: Testimonials (New Section — Add This)

**Purpose:** Social proof before the CTA. This section does not exist in the current site — add it.

**Layout:** A horizontal grid of 3 quote cards.

**Each testimonial card:**
- Background: `var(--bg-surface)`
- Border: `1px solid var(--border-subtle)`
- Border-radius: `var(--radius-lg)`
- Padding: `1.75rem`
- Large opening quote mark `"` in Cormorant Garamond, `5rem`, `var(--accent-gold-dim)`, positioned absolutely top-left (slightly overlapping card top)

**Card Interior:**
1. Quote text — Cormorant Garamond italic, 1.1rem, `var(--text-primary)`, line-height 1.6
2. Divider line: `1px solid var(--border-subtle)`, margin `1.25rem 0`
3. Author row:
   - Initials avatar: `40px × 40px` circle, `background: rgba(201,151,58,0.12)`, `border: 1px solid var(--accent-gold-dim)`, initials in JetBrains Mono, 0.8rem, `var(--accent-gold)`
   - Name: DM Sans, 500, 0.875rem, `var(--text-primary)`
   - Role: DM Sans, 300, 0.8rem, `var(--text-secondary)`
4. Star rating: 5 `★` symbols in `var(--accent-gold)`, font-size 0.8rem

**Sample testimonials to use:**
| Quote | Name | Role |
|-------|------|------|
| "I got called back by 3 companies within a week of using CareerPilot. The AI understood exactly what I needed." | Amara O. | Software Engineer |
| "It was so easy. I described my experience and within minutes I had a resume that looked better than anything I'd made manually." | Chidi N. | Product Manager |
| "The ATS optimization feature alone is worth it. I was getting ignored before — now I actually get responses." | Fatima A. | Data Analyst |

---

### SECTION 7: CTA Section

**Layout:** Full-width section. Centered content. Maximum visual impact.

**Background treatment:**
- No solid background fill
- Add a dramatic centered gold radial glow:
  ```css
  .cta-section {
    position: relative;
    text-align: center;
    padding: clamp(6rem, 12vw, 10rem) 0;
  }
  .cta-section::before {
    content: '';
    position: absolute;
    inset: 0;
    background: radial-gradient(ellipse 60% 70% at 50% 50%, rgba(201,151,58,0.1) 0%, transparent 70%);
  }
  ```

**Top element:** A thin `1px` horizontal gold line, `120px` wide, centered, with margin-bottom `2rem`. `background: var(--accent-gold)`.

**Heading:**
- Eyebrow: `YOUR NEXT CHAPTER STARTS HERE`
- H2: `Build a resume that gets results.`
  - "results." in italic gold
- Font: Cormorant Garamond, light, `clamp(2.5rem, 5vw, 4rem)`, centered

**Subtext:**
- `Join 50,000+ professionals who built their career story with CareerPilot.`
- DM Sans, 300, `var(--text-secondary)`, centered, max-width 500px

**CTA Button:** Single centered button
- Text: `Start Building Free →`
- Style: gold filled (same as hero primary button)
- Size: slightly larger — `padding: 1rem 2.5rem`, `font-size: 1rem`
- On hover: `box-shadow: 0 0 40px rgba(201,151,58,0.4)`, `transform: translateY(-3px)`

**Below button:** Fine print in JetBrains Mono, 0.65rem, `var(--text-tertiary)`:
- `No credit card required · Free forever plan available`

---

### SECTION 8: Footer

**Layout:** Two-row footer. Dark, minimal.

**Top row:** Two columns
- Left: Brand (`CareerPilot` in Cormorant Garamond 1.2rem) + one-liner `"The AI resume builder for ambitious professionals."`
- Right: Nav links in two columns — `Features`, `How It Works`, `Privacy`, `Terms`, `Contact`, `Support`

**Link styles:** DM Sans, 300, 0.875rem, `var(--text-tertiary)`. Hover: `var(--accent-gold)`, `transition: 0.2s ease`.

**Bottom row:**
- Full-width `1px solid var(--border-subtle)` separator
- Below: `© 2025 CareerPilot. All rights reserved.` left-aligned, `Made with ♥ for ambitious professionals.` right-aligned
- Font: JetBrains Mono, 0.68rem, `var(--text-tertiary)`

---

## 5. Animations Reference

All animations defined in `<style>`:

```css
@keyframes fadeUp {
  from { opacity: 0; transform: translateY(24px); }
  to   { opacity: 1; transform: translateY(0); }
}

@keyframes float {
  0%, 100% { transform: translateY(0px); }
  50%       { transform: translateY(-12px); }
}

@keyframes marquee {
  from { transform: translateX(0); }
  to   { transform: translateX(-50%); }
}

@keyframes shimmer {
  from { background-position: -800px 0; }
  to   { background-position: 800px 0; }
}

@keyframes pulse {
  0%, 100% { opacity: 0.7; }
  50%       { opacity: 1; }
}
```

---

## 6. Responsive Breakpoints

### Desktop (> 1024px)
- All multi-column layouts active
- Hero: 55/45 two-column split
- Features: 3-column grid
- Steps: horizontal 3-column
- Testimonials: 3-column grid

### Tablet (768px – 1024px)
- Hero: 50/50 split, slightly reduced font sizes
- Features: 2-column grid
- Steps: 2-column, third step centered below
- Testimonials: 2-column, third card centered below or full width

### Mobile (< 768px)
- Nav links hidden → hamburger menu overlay
- Hero: single column, visual (right column) hidden or shown below text at 80% scale
- All grids: `1fr` (single column)
- CTA buttons: full width (`width: 100%`)
- Section headings: reduce font-size using `clamp` (already defined)
- Marquee: reduce speed to `20s`

---

## 7. JavaScript Behaviors

### 7.1 Scroll-based header
```js
window.addEventListener('scroll', () => {
  const header = document.querySelector('.header');
  header.classList.toggle('scrolled', window.scrollY > 40);
});
```

### 7.2 Smooth anchor scrolling
```js
document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener('click', e => {
    e.preventDefault();
    const target = document.querySelector(a.getAttribute('href'));
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
});
```

### 7.3 Intersection Observer for step reveal
(See Section 5 above)

### 7.4 Mobile menu toggle
```js
const menuBtn = document.querySelector('.menu-btn');
const mobileMenu = document.querySelector('.mobile-menu');
menuBtn.addEventListener('click', () => {
  mobileMenu.classList.toggle('open');
  document.body.classList.toggle('no-scroll');
});
```

**Mobile menu styles:**
```css
.mobile-menu {
  position: fixed;
  inset: 0;
  background: var(--bg-primary);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2rem;
  z-index: 100;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.3s ease;
}
.mobile-menu.open {
  opacity: 1;
  pointer-events: all;
}
.mobile-menu a {
  font-family: 'Cormorant Garamond', serif;
  font-size: 2.5rem;
  font-weight: 300;
  color: var(--text-primary);
}
```

---

## 8. File Structure (Keep Single File)

Since the original site is a single `index.html`, keep this structure:
- `<head>`: Google Fonts link + all `<style>` CSS
- `<body>`: all HTML sections in order
- Bottom of `<body>`: all `<script>` JavaScript

No external CSS file needed unless the dev prefers it.

---

## 9. Checklist Before Delivery

- [ ] Google Fonts load correctly (Cormorant Garamond, DM Sans, JetBrains Mono)
- [ ] CSS custom properties defined in `:root`
- [ ] Background grid texture visible but subtle
- [ ] Hero animations stagger correctly
- [ ] Float animation on hero visual card
- [ ] Marquee scrolls infinitely without gap
- [ ] Feature cards glow on hover
- [ ] Steps reveal on scroll via IntersectionObserver
- [ ] Header blurs/darkens on scroll
- [ ] Mobile hamburger menu works
- [ ] All grids collapse correctly on mobile
- [ ] CTA button has gold glow on hover
- [ ] Footer links in gold on hover
- [ ] No purple gradients, no white backgrounds, no Inter font
