import os
import glob

# Path to docs and README
base_dir = "d:/dev/san/sanMediaBox"
docs_dir = os.path.join(base_dir, "docs")
readme_path = os.path.join(base_dir, "README.md")

files_to_check = glob.glob(os.path.join(docs_dir, "*.md"))
files_to_check.append(readme_path)

# Also check .kiro directory
kiro_dir = os.path.join(base_dir, ".kiro")
for root, _, files in os.walk(kiro_dir):
    for f in files:
        if f.endswith(".md"):
            files_to_check.append(os.path.join(root, f))

replaced_files = 0
for filepath in files_to_check:
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    if "sanMediaBox" in content or "sanmediabox" in content:
        new_content = content.replace("sanMediaBox", "sanOmni").replace("sanmediabox", "sanomni")
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(new_content)
        replaced_files += 1
        print(f"Updated: {filepath}")

print(f"\nTotal files updated: {replaced_files}")
