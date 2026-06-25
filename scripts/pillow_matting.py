import sys
import os

# Force UTF-8 and replace invalid bytes to prevent Tauri shell crash
os.environ["PYTHONIOENCODING"] = "utf-8:replace"
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.stderr.reconfigure(encoding='utf-8', errors='replace')
import argparse
from PIL import Image

def remove_bg(input_path, output_path, lower_threshold=220, upper_threshold=250, bg_color=(255, 255, 255)):
    """
    Remove a specified background color from an image using threshold-based alpha feathering.

    Parameters:
        input_path (str): Path to the input image file.
        output_path (str): Path to save the output PNG with transparency.
        lower_threshold (int): Pixels with color distance below this are fully opaque. Range: 0-255. Default: 220.
        upper_threshold (int): Pixels with color distance above this are fully transparent. Range: 0-255. Default: 250.
        bg_color (tuple): The (R, G, B) background color to remove. Default: (255, 255, 255) white.
    """
    try:
        img = Image.open(input_path).convert("RGBA")
        datas = img.getdata()
        newData = []
        bg_r, bg_g, bg_b = bg_color

        for item in datas:
            r, g, b, a = item
            # Calculate color distance from the target background color
            # Using max-channel distance for crisp detection
            dist = max(abs(r - bg_r), abs(g - bg_g), abs(b - bg_b))
            closeness = 255 - dist  # 255 = exact match, 0 = maximally different

            if closeness >= upper_threshold:
                newData.append((255, 255, 255, 0))  # Fully transparent
            elif closeness <= lower_threshold:
                newData.append(item)  # Fully opaque
            else:
                # Anti-aliased feathering
                ratio = (closeness - lower_threshold) / (upper_threshold - lower_threshold)
                alpha = int(255 * (1 - ratio))
                newData.append((r, g, b, alpha))

        img.putdata(newData)
        img.save(output_path, "PNG")
        print(f"Successfully saved to: {output_path}")
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Remove background color from image (Pillow-based)")
    parser.add_argument("input", help="Input image path")
    parser.add_argument("output", help="Output image path")
    parser.add_argument("--lower_threshold", type=int, default=220,
                        help="Pixels with color distance below this are fully opaque (0-255, default: 220)")
    parser.add_argument("--upper_threshold", type=int, default=250,
                        help="Pixels with color distance above this are fully transparent (0-255, default: 250)")
    parser.add_argument("--bg_color", type=str, default="255,255,255",
                        help="Background color to remove as R,G,B (default: 255,255,255 for white)")

    args = parser.parse_args()

    # Parse bg_color string into tuple
    try:
        bg_color = tuple(int(c.strip()) for c in args.bg_color.split(","))
        if len(bg_color) != 3:
            raise ValueError
    except ValueError:
        print("Error: --bg_color must be in R,G,B format (e.g. 255,255,255)")
        sys.exit(1)

    remove_bg(args.input, args.output,
              lower_threshold=args.lower_threshold,
              upper_threshold=args.upper_threshold,
              bg_color=bg_color)
