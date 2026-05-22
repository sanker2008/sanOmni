import re

with open("d:/dev/san/sanMediaBox/src/styles/globals.css", "r", encoding="utf-8") as f:
    content = f.read()

# Light mode
content = re.sub(
    r"--background: 0 0% 100%;\n\s*--foreground: 222\.2 84% 4\.9%;\n\s*--card: 0 0% 100%;\n\s*--popover: 0 0% 100%;",
    "--background: 210 20% 98%;\n    --foreground: 222.2 84% 4.9%;\n    --card: 0 0% 100%;\n    --popover: 0 0% 100%;",
    content
)

# Dark mode
content = re.sub(
    r"--background: 222\.2 84% 4\.9%;\n\s*--foreground: 210 40% 98%;\n\s*--card: 222\.2 84% 4\.9%;\n\s*--card-foreground: 210 40% 98%;\n\s*--popover: 222\.2 84% 4\.9%;",
    "--background: 240 10% 4%;\n    --foreground: 210 40% 98%;\n    --card: 240 10% 8%;\n    --card-foreground: 210 40% 98%;\n    --popover: 240 10% 8%;",
    content
)

with open("d:/dev/san/sanMediaBox/src/styles/globals.css", "w", encoding="utf-8") as f:
    f.write(content)
