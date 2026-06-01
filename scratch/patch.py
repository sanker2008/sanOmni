with open("d:/dev/san/sanOmni/src/styles/globals.css", "r", encoding="utf-8") as f:
    content = f.read()

content = content.replace("--radius: 0.5rem;", "--radius: 0rem;")

old_tail = """@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground;
  }
}"""

new_tail = """@layer base {
  * {
    @apply border-border;
    border-radius: 0 !important;
  }
  
  .border, .border-t, .border-b, .border-l, .border-r {
    border-width: 0 !important;
  }

  input:not([type="color"]):not([type="checkbox"]):not([type="radio"]), 
  textarea, 
  select {
    background-color: hsl(var(--muted)) !important;
  }

  body {
    @apply bg-background text-foreground;
  }
}"""

content = content.replace(old_tail, new_tail)

with open("d:/dev/san/sanOmni/src/styles/globals.css", "w", encoding="utf-8") as f:
    f.write(content)
